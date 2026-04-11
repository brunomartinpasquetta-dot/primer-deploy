const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET /api/despalillado/pendientes-lote
// Lotes cerrados o en_despalillado listos para despalillar
router.get('/pendientes-lote', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT l.id, l.codigo_interno, l.kilos, l.estado, l.fecha_inicio,
             l.kilos_en_camara, l.deposito_camara_id, l.merma_despalillado,
             d.nombre AS deposito, dc.nombre AS deposito_camara,
             ISNULL((SELECT SUM(dp.kilos) FROM Despalillado dp WHERE dp.lote_id = l.id AND dp.estado != 'anulada'), 0) AS kg_despalillados
      FROM LotesMercaderia l
      LEFT JOIN Depositos d ON l.deposito_id = d.id
      LEFT JOIN Depositos dc ON l.deposito_camara_id = dc.id
      WHERE l.estado IN ('cerrado', 'en_despalillado')
      ORDER BY l.fecha_inicio ASC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/camaras
router.get('/camaras', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, nombre FROM Depositos WHERE tipo_deposito = 'camara_frio' AND activo = 1 ORDER BY nombre`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/lote/:id/registros
router.get('/lote/:id/registros', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('lote_id', sql.Int, parseInt(req.params.id))
      .query(`SELECT d.id, d.despalillador_id, d.kilos, d.fecha_hora, d.estado, d.usuario_id,
                     ju.apellido + ', ' + ju.nombre AS despalillador,
                     u.nombre AS usuario
              FROM Despalillado d
              JOIN Juntadores ju ON d.despalillador_id = ju.id
              LEFT JOIN Usuarios u ON d.usuario_id = u.id
              WHERE d.lote_id = @lote_id
              ORDER BY d.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/despalillado/registrar — pesaje por lote
router.post('/registrar', async (req, res) => {
  try {
    const { lote_id, despalillador_id, kilos } = req.body;
    if (!lote_id) return res.status(400).json({ error: 'Lote es obligatorio' });
    if (!despalillador_id) return res.status(400).json({ error: 'Despalillador es obligatorio' });
    if (!kilos || parseFloat(kilos) <= 0) return res.status(400).json({ error: 'Kilos debe ser mayor a 0' });

    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    const kilosNum = parseFloat(kilos);

    // Validar tope de lote: no superar kg de cosecha
    const loteRes = await pool.request().input('lote_id', sql.Int, lote_id)
      .query(`SELECT l.kilos AS kg_cosecha,
              ISNULL((SELECT SUM(d.kilos) FROM Despalillado d WHERE d.lote_id = l.id AND d.estado != 'anulada'), 0) AS kg_despalillados
              FROM LotesMercaderia l WHERE l.id = @lote_id`);
    if (!loteRes.recordset.length) return res.status(404).json({ error: 'Lote no encontrado' });
    const lote = loteRes.recordset[0];
    const kgCosecha = parseFloat(lote.kg_cosecha) || 0;
    const kgDespalillados = parseFloat(lote.kg_despalillados) || 0;
    if (kgCosecha > 0 && (kgDespalillados + kilosNum) > kgCosecha) {
      const disponible = Math.max(0, kgCosecha - kgDespalillados);
      return res.status(400).json({ error: 'Supera el total del lote (' + kgCosecha.toFixed(1) + ' kg). Disponible: ' + disponible.toFixed(1) + ' kg' });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Update lote estado if first pesaje
      const req1 = new sql.Request(transaction);
      await req1
        .input('lote_id', sql.Int, lote_id)
        .query(`UPDATE LotesMercaderia SET estado = 'en_despalillado' WHERE id = @lote_id AND estado = 'cerrado'`);

      // Insert despalillado record
      const req2 = new sql.Request(transaction);
      await req2
        .input('lote_id', sql.Int, lote_id)
        .input('despalillador_id', sql.Int, despalillador_id)
        .input('kilos', sql.Decimal(10, 3), kilosNum)
        .input('usuario_id', sql.Int, uid)
        .query(`INSERT INTO Despalillado (lote_id, despalillador_id, kilos, usuario_id)
                VALUES (@lote_id, @despalillador_id, @kilos, @usuario_id)`);

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /api/despalillado/:id — editar kilos con audit trail
router.put('/:id', async (req, res) => {
  try {
    const { kilos, motivo } = req.body;
    if (!kilos || parseFloat(kilos) <= 0) return res.status(400).json({ error: 'Kilos debe ser mayor a 0' });
    if (!motivo) return res.status(400).json({ error: 'Motivo es obligatorio' });

    const pool = await getPool();
    const id = parseInt(req.params.id);
    const uid = req.user ? req.user.id : null;

    // Get current value + lote info
    const curr = await pool.request().input('id', sql.Int, id)
      .query(`SELECT d.kilos, d.lote_id FROM Despalillado d WHERE d.id = @id`);
    if (!curr.recordset.length) return res.status(404).json({ error: 'Registro no encontrado' });

    const kilosAnterior = parseFloat(curr.recordset[0].kilos);
    const kilosNuevo = parseFloat(kilos);
    const loteId = curr.recordset[0].lote_id;

    // Validar tope de lote si aplica
    if (loteId && kilosNuevo > kilosAnterior) {
      const loteRes = await pool.request().input('lote_id', sql.Int, loteId)
        .query(`SELECT l.kilos AS kg_cosecha,
                ISNULL((SELECT SUM(d2.kilos) FROM Despalillado d2 WHERE d2.lote_id = l.id AND d2.estado != 'anulada'), 0) AS kg_despalillados
                FROM LotesMercaderia l WHERE l.id = @lote_id`);
      if (loteRes.recordset.length) {
        const kgCosecha = parseFloat(loteRes.recordset[0].kg_cosecha) || 0;
        const kgDespalillados = parseFloat(loteRes.recordset[0].kg_despalillados) || 0;
        const diferencia = kilosNuevo - kilosAnterior;
        if (kgCosecha > 0 && (kgDespalillados + diferencia) > kgCosecha) {
          const disponible = Math.max(0, kgCosecha - kgDespalillados + kilosAnterior);
          return res.status(400).json({ error: 'Supera el total del lote (' + kgCosecha.toFixed(1) + ' kg). Máximo editable: ' + disponible.toFixed(1) + ' kg' });
        }
      }
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Update
      const r1 = new sql.Request(transaction);
      await r1.input('id', sql.Int, id).input('kilos', sql.Decimal(10, 3), kilosNuevo)
        .query(`UPDATE Despalillado SET kilos = @kilos WHERE id = @id`);

      // Audit trail
      const r2 = new sql.Request(transaction);
      await r2
        .input('tabla', sql.NVarChar, 'Despalillado')
        .input('registro_id', sql.Int, id)
        .input('campo', sql.NVarChar, 'kilos')
        .input('valor_anterior', sql.NVarChar, kilosAnterior.toString())
        .input('valor_nuevo', sql.NVarChar, kilosNuevo.toString())
        .input('usuario_id', sql.Int, uid)
        .input('motivo', sql.NVarChar, motivo)
        .query(`INSERT INTO EdicionesHistorial (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id, motivo)
                VALUES (@tabla, @registro_id, @campo, @valor_anterior, @valor_nuevo, @usuario_id, @motivo)`);

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    res.json({ ok: true, kilos_anterior: kilosAnterior, kilos_nuevo: kilosNuevo });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/despalillado/:lote_id/guardar-camara
router.post('/:lote_id/guardar-camara', async (req, res) => {
  try {
    const { deposito_camara_id } = req.body;
    if (!deposito_camara_id) return res.status(400).json({ error: 'Selecciona una cámara' });

    const pool = await getPool();
    const loteId = parseInt(req.params.lote_id);

    // Get total despalillado kg for this lote
    const totRes = await pool.request().input('lote_id', sql.Int, loteId)
      .query(`SELECT ISNULL(SUM(kilos), 0) AS total FROM Despalillado WHERE lote_id = @lote_id AND estado != 'anulada'`);
    const kilosEnCamara = parseFloat(totRes.recordset[0].total);

    await pool.request()
      .input('id', sql.Int, loteId)
      .input('deposito_camara_id', sql.Int, deposito_camara_id)
      .input('kilos_en_camara', sql.Decimal(10, 3), kilosEnCamara)
      .query(`UPDATE LotesMercaderia SET deposito_camara_id = @deposito_camara_id, deposito_actual_id = @deposito_camara_id, kilos_en_camara = @kilos_en_camara WHERE id = @id`);

    res.json({ ok: true, kilos_en_camara: kilosEnCamara });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/despalillado/:lote_id/retomar
router.post('/:lote_id/retomar', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.lote_id))
      .query(`UPDATE LotesMercaderia SET deposito_camara_id = NULL, kilos_en_camara = 0, deposito_actual_id = deposito_id WHERE id = @id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/despalillado/:lote_id/finalizar
router.post('/:lote_id/finalizar', async (req, res) => {
  try {
    const pool = await getPool();
    const loteId = parseInt(req.params.lote_id);

    // Get lote info
    const lRes = await pool.request().input('id', sql.Int, loteId)
      .query(`SELECT kilos FROM LotesMercaderia WHERE id = @id`);
    if (!lRes.recordset.length) return res.status(404).json({ error: 'Lote no encontrado' });
    const kilosOrig = parseFloat(lRes.recordset[0].kilos);

    // Get total despalillado
    const tRes = await pool.request().input('lote_id', sql.Int, loteId)
      .query(`SELECT ISNULL(SUM(kilos), 0) AS total FROM Despalillado WHERE lote_id = @lote_id AND estado != 'anulada'`);
    const kilosDesp = parseFloat(tRes.recordset[0].total);
    const merma = Math.max(0, kilosOrig - kilosDesp);

    await pool.request()
      .input('id', sql.Int, loteId)
      .input('merma', sql.Decimal(10, 3), merma)
      .query(`UPDATE LotesMercaderia SET estado = 'despalillado', etapa = 'despalillado', merma_despalillado = @merma, fecha_fin = GETDATE() WHERE id = @id`);

    res.json({ ok: true, merma });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ══ LOTE DESPALILLADORES (persistencia) ══

// GET /api/despalillado/lote/:id/despalilladores
router.get('/lote/:id/despalilladores', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('lote_id', sql.Int, parseInt(req.params.id))
      .query(`SELECT ld.despalillador_id, j.apellido + ', ' + j.nombre AS nombre
              FROM LoteDespalilladores ld
              JOIN Juntadores j ON ld.despalillador_id = j.id
              WHERE ld.lote_id = @lote_id
              ORDER BY ld.fecha_asignacion`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/despalillado/lote/:id/despalillador
router.post('/lote/:id/despalillador', async (req, res) => {
  try {
    const { despalillador_id } = req.body;
    if (!despalillador_id) return res.status(400).json({ error: 'Despalillador es obligatorio' });
    const pool = await getPool();
    const loteId = parseInt(req.params.id);
    // IF NOT EXISTS
    const exists = await pool.request()
      .input('lote_id', sql.Int, loteId)
      .input('despalillador_id', sql.Int, despalillador_id)
      .query(`SELECT id FROM LoteDespalilladores WHERE lote_id = @lote_id AND despalillador_id = @despalillador_id`);
    if (exists.recordset.length) return res.json({ ok: true, already: true });
    await pool.request()
      .input('lote_id', sql.Int, loteId)
      .input('despalillador_id', sql.Int, despalillador_id)
      .query(`INSERT INTO LoteDespalilladores (lote_id, despalillador_id) VALUES (@lote_id, @despalillador_id)`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /api/despalillado/lote/:id/despalillador/:despalillador_id
router.delete('/lote/:id/despalillador/:despalillador_id', async (req, res) => {
  try {
    const pool = await getPool();
    const loteId = parseInt(req.params.id);
    const despId = parseInt(req.params.despalillador_id);
    // Check for active despalillados
    const check = await pool.request()
      .input('lote_id', sql.Int, loteId)
      .input('despalillador_id', sql.Int, despId)
      .query(`SELECT COUNT(*) AS cnt FROM Despalillado WHERE lote_id = @lote_id AND despalillador_id = @despalillador_id AND estado != 'anulada'`);
    if (check.recordset[0].cnt > 0) {
      return res.status(400).json({ error: 'No se puede quitar: tiene pesajes registrados. Anulá los pesajes primero.' });
    }
    await pool.request()
      .input('lote_id', sql.Int, loteId)
      .input('despalillador_id', sql.Int, despId)
      .query(`DELETE FROM LoteDespalilladores WHERE lote_id = @lote_id AND despalillador_id = @despalillador_id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/pendientes
// Devuelve filas de JuntadaDestino con stock_pendiente=1 (esperando despalillado).
// Cada fila es un tramo destino independiente — una juntada puede tener varios.
router.get('/pendientes', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT
                jd.id          AS destino_id,
                jd.juntada_id  AS id,
                jd.kilos,
                jd.deposito_id,
                d.nombre       AS deposito_nombre,
                j.fecha_hora,
                j.parcela_id,
                l.nombre AS parcela,
                ju.apellido + ', ' + ju.nombre AS juntador
              FROM JuntadaDestino jd
              JOIN Juntada    j  ON jd.juntada_id = j.id
              JOIN Parcelas      l  ON j.parcela_id     = l.id
              JOIN Juntadores ju ON j.juntador_id = ju.id
              JOIN Depositos  d  ON jd.deposito_id = d.id
              WHERE jd.stock_pendiente = 1 AND jd.tipo = 'deposito'
              ORDER BY j.fecha_hora ASC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/despalillado
// Body: { parcela_id, despalillador_id, kilos, operador?, juntada_id?, juntada_destino_id? }
// Si viene juntada_id + juntada_destino_id: flujo cámara — procesa ese tramo específico de JuntadaDestino.
// Sin juntada_id: flujo fruta fresca (despalillado directo sin vínculo a cámara).
router.post('/', async (req, res) => {
  try {
    const { parcela_id, despalillador_id, kilos, operador, juntada_id, juntada_destino_id } = req.body;
    if (!despalillador_id) return res.status(400).json({ error: 'Despalillador es obligatorio' });
    if (!kilos || parseFloat(kilos) <= 0) return res.status(400).json({ error: 'Kilos debe ser mayor a 0' });
    const pool = await getPool();

    if (juntada_id) {
      // Flujo cámara fría: procesar el tramo pendiente indicado por juntada_destino_id
      const jdRes = await pool.request()
        .input('destino_id', sql.Int, juntada_destino_id)
        .input('juntada_id', sql.Int, juntada_id)
        .query(`SELECT jd.id, jd.deposito_id, jd.kilos AS kilos_destino, jd.stock_pendiente,
                       j.juntador_id, j.kilos AS kilos_juntada, l.temporada_id, j.parcela_id
                FROM JuntadaDestino jd
                JOIN Juntada j ON jd.juntada_id = j.id
                JOIN Parcelas   l ON j.parcela_id = l.id
                WHERE jd.id = @destino_id AND jd.juntada_id = @juntada_id`);

      if (!jdRes.recordset.length) {
        return res.status(404).json({ error: 'Destino de juntada no encontrado' });
      }
      const dest = jdRes.recordset[0];
      if (!dest.stock_pendiente) {
        return res.status(400).json({ error: 'Este destino ya fue procesado' });
      }

      const { deposito_id, temporada_id, parcela_id: jParcelaId, juntador_id, kilos_destino } = dest;
      const now = new Date();
      const uid = req.user ? req.user.id : null;

      const kilosNum     = parseFloat(kilos);
      const kilosBase    = parseFloat(kilos_destino);
      const merma_kg     = Math.max(0, parseFloat((kilosBase - kilosNum).toFixed(3)));
      const merma_pct    = kilosBase > 0 ? parseFloat(((merma_kg / kilosBase) * 100).toFixed(3)) : 0;

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        // 1. Registrar despalillado con merma
        await transaction.request()
          .input('parcela_id',       sql.Int,          jParcelaId)
          .input('despalillador_id', sql.Int,          despalillador_id)
          .input('kilos',            sql.Decimal(10,3),kilos)
          .input('operador',         sql.NVarChar,     operador || '')
          .input('juntada_id',       sql.Int,          juntada_id)
          .input('deposito_id',      sql.Int,          deposito_id)
          .input('merma_kg',         sql.Decimal(10,3),merma_kg)
          .input('merma_pct',        sql.Decimal(5,2), merma_pct)
          .input('usuario_id',       sql.Int,          uid)
          .query(`INSERT INTO Despalillado (parcela_id, despalillador_id, kilos, operador, juntada_id, deposito_id, merma_kg, merma_pct, usuario_id)
                  VALUES (@parcela_id, @despalillador_id, @kilos, @operador, @juntada_id, @deposito_id, @merma_kg, @merma_pct, @usuario_id)`);

        // 2. Ingreso a MovimientosDeposito
        await transaction.request()
          .input('deposito_id',  sql.Int,          deposito_id)
          .input('temporada_id', sql.Int,          temporada_id)
          .input('parcela_id',      sql.Int,          jParcelaId)
          .input('kilos',        sql.Decimal(10,3),kilos)
          .input('fecha',        sql.DateTime,     now)
          .input('observacion',  sql.NVarChar,     `Despalillado juntada #${juntada_id}`)
          .input('juntada_id',   sql.Int,          juntada_id)
          .input('juntador_id',  sql.Int,          juntador_id)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

        // 3. Marcar este tramo como procesado
        await transaction.request()
          .input('id', sql.Int, juntada_destino_id)
          .query(`UPDATE JuntadaDestino SET stock_pendiente = 0 WHERE id = @id`);

        // 5. Si no quedan tramos pendientes para la juntada, limpiar flag en Juntada
        await transaction.request()
          .input('juntada_id', sql.Int, juntada_id)
          .query(`UPDATE Juntada SET stock_pendiente = 0
                  WHERE id = @juntada_id
                  AND NOT EXISTS (
                    SELECT 1 FROM JuntadaDestino
                    WHERE juntada_id = @juntada_id AND stock_pendiente = 1
                  )`);

        await transaction.commit();
        res.json({ ok: true, merma_kg, merma_pct });
      } catch (innerErr) {
        await transaction.rollback();
        throw innerErr;
      }

    } else {
      // Flujo fruta fresca: egreso del depósito → despalillado → ingreso de vuelta (mismo o cámara)
      const { deposito_id, deposito_destino_id, kilos_origen } = req.body;
      const deposito_ingreso_id = deposito_destino_id || deposito_id;

      if (!deposito_id || !kilos_origen) {
        return res.status(400).json({ error: 'Faltan datos: deposito_id y kilos_origen son requeridos' });
      }

      // Obtener temporada activa (fresca no tiene lote asociado)
      const tempRes = await pool.request()
        .query('SELECT TOP 1 id FROM Temporadas WHERE activa = 1 ORDER BY id DESC');
      if (!tempRes.recordset.length) return res.status(400).json({ error: 'No hay temporada activa' });
      const temporada_id = tempRes.recordset[0].id;

      const kilosOrigenNum = parseFloat(kilos_origen);
      const kilosNum       = parseFloat(kilos);
      const merma_kg       = Math.max(0, parseFloat((kilosOrigenNum - kilosNum).toFixed(3)));
      const merma_pct      = kilosOrigenNum > 0
        ? parseFloat(((merma_kg / kilosOrigenNum) * 100).toFixed(3)) : 0;

      const now = new Date();
      const uid = req.user ? req.user.id : null;

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        // 1. Egreso del depósito fresco (fruta que va a despalillar)
        await transaction.request()
          .input('deposito_id',  sql.Int,          deposito_id)
          .input('temporada_id', sql.Int,          temporada_id)
          .input('kilos',        sql.Decimal(10,3),kilosOrigenNum)
          .input('fecha',        sql.DateTime,     now)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, tipo, kilos, fecha, observacion, usuario_id)
                  VALUES (@deposito_id, @temporada_id, 'egreso_despalillado', @kilos, @fecha, 'Egreso para despalillado fresco', @usuario_id)`);

        // 2. Registrar el despalillado con merma
        await transaction.request()
          .input('despalillador_id', sql.Int,          despalillador_id)
          .input('kilos',            sql.Decimal(10,3),kilosNum)
          .input('operador',         sql.NVarChar,     operador || '')
          .input('deposito_id',      sql.Int,          deposito_id)
          .input('merma_kg',         sql.Decimal(10,3),merma_kg)
          .input('merma_pct',        sql.Decimal(5,2), merma_pct)
          .input('usuario_id',       sql.Int,          uid)
          .query(`INSERT INTO Despalillado (despalillador_id, kilos, operador, deposito_id, merma_kg, merma_pct, usuario_id)
                  VALUES (@despalillador_id, @kilos, @operador, @deposito_id, @merma_kg, @merma_pct, @usuario_id)`);

        // 3. Ingreso al depósito destino (mismo o cámara fría)
        await transaction.request()
          .input('deposito_id',  sql.Int,          deposito_ingreso_id)
          .input('temporada_id', sql.Int,          temporada_id)
          .input('kilos',        sql.Decimal(10,3),kilosNum)
          .input('fecha',        sql.DateTime,     now)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, tipo, kilos, fecha, observacion, usuario_id)
                  VALUES (@deposito_id, @temporada_id, 'ingreso', @kilos, @fecha, 'Ingreso fruta despalillada', @usuario_id)`);

        await transaction.commit();
        res.json({ ok: true, merma_kg, merma_pct });
      } catch (innerErr) {
        await transaction.rollback();
        throw innerErr;
      }
    }

  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/depositos-fresco
// Depósitos de tipo galpon/fresco con stock disponible para despalillar
router.get('/depositos-fresco', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT d.id, d.nombre,
                ISNULL(SUM(CASE WHEN m.tipo='ingreso' THEN m.kilos ELSE -m.kilos END), 0) AS stock_kg
              FROM Depositos d
              LEFT JOIN MovimientosDeposito m ON m.deposito_id = d.id
              WHERE d.tipo_stock = 'mercaderia' AND d.requiere_despalillado = 0
              GROUP BY d.id, d.nombre
              HAVING ISNULL(SUM(CASE WHEN m.tipo='ingreso' THEN m.kilos ELSE -m.kilos END), 0) > 0
              ORDER BY d.nombre`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/hoy
router.get('/hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT d.id, l.nombre AS parcela,
              ju.apellido + ', ' + ju.nombre AS despalillador,
              ju.apellido + ', ' + ju.nombre AS cosechero,
              d.kilos, d.fecha_hora AS fecha, d.juntada_id,
              d.merma_kg, d.merma_pct,
              d.estado,
              jd.kilos AS kilos_juntada,
              dep.nombre AS deposito_nombre,
              dep.nombre AS deposito,
              d.usuario_id,
              u.nombre AS usuario
              FROM Despalillado d
              LEFT JOIN Parcelas l ON d.parcela_id = l.id
              JOIN Juntadores ju ON d.despalillador_id = ju.id
              LEFT JOIN Depositos dep ON d.deposito_id = dep.id
              LEFT JOIN JuntadaDestino jd ON d.juntada_id = jd.juntada_id AND jd.deposito_id = d.deposito_id AND jd.tipo = 'deposito'
              LEFT JOIN Usuarios u ON d.usuario_id = u.id
              WHERE CAST(d.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY d.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/historial — historial completo filtrable
router.get('/historial', async (req, res) => {
  try {
    const { temporada_id, desde, hasta, despalillador_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id)      { where += ' AND t.id = @tid';        dbReq.input('tid',  sql.Int,  parseInt(temporada_id)); }
    if (desde)             { where += ' AND CAST(d.fecha_hora AS DATE) >= @desde'; dbReq.input('desde', sql.Date, desde); }
    if (hasta)             { where += ' AND CAST(d.fecha_hora AS DATE) <= @hasta'; dbReq.input('hasta', sql.Date, hasta); }
    if (despalillador_id)  { where += ' AND d.despalillador_id = @did'; dbReq.input('did', sql.Int, parseInt(despalillador_id)); }
    const result = await dbReq.query(`
      SELECT d.id, l.nombre AS parcela,
             ju.apellido + ', ' + ju.nombre AS despalillador,
             d.kilos, d.fecha_hora AS fecha, d.juntada_id,
             d.merma_kg, d.merma_pct,
             d.estado,
             dep.nombre AS deposito,
             d.usuario_id, u.nombre AS usuario,
             t.nombre AS temporada,
             lm.codigo_interno AS lote_codigo
      FROM Despalillado d
      LEFT JOIN Parcelas   l  ON d.parcela_id      = l.id
      LEFT JOIN LotesMercaderia lm ON d.lote_id    = lm.id
      LEFT JOIN Temporadas t  ON COALESCE(lm.temporada_id, l.temporada_id) = t.id
      JOIN  Juntadores ju ON d.despalillador_id = ju.id
      LEFT JOIN Depositos  dep ON d.deposito_id   = dep.id
      LEFT JOIN Usuarios   u   ON d.usuario_id    = u.id
      WHERE ${where}
      ORDER BY d.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/totales-por-despalillador — totales campaña activa
router.get('/totales-por-despalillador', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id) { where += ' AND t.id = @tid'; dbReq.input('tid', sql.Int, parseInt(temporada_id)); }
    const result = await dbReq.query(`
      SELECT
        ju.apellido + ', ' + ju.nombre AS despalillador,
        COUNT(d.id)                          AS registros,
        SUM(d.kilos)                         AS kg_total,
        AVG(d.merma_pct)                     AS merma_pct_promedio,
        SUM(d.merma_kg)                      AS merma_kg_total,
        MIN(d.fecha_hora)                    AS primera_fecha,
        MAX(d.fecha_hora)                    AS ultima_fecha
      FROM Despalillado d
      JOIN  Juntadores ju ON d.despalillador_id = ju.id
      LEFT JOIN Parcelas   l  ON d.parcela_id   = l.id
      LEFT JOIN LotesMercaderia lm ON d.lote_id = lm.id
      LEFT JOIN Temporadas t  ON COALESCE(lm.temporada_id, l.temporada_id) = t.id
      WHERE ${where} AND d.estado != 'anulada'
      GROUP BY ju.id, ju.apellido, ju.nombre
      ORDER BY kg_total DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/auditoria — ediciones y anulaciones
router.get('/auditoria', async (req, res) => {
  try {
    const { temporada_id, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = "eh.tabla = 'Despalillado'";
    if (temporada_id) { where += ' AND t.id = @tid'; dbReq.input('tid', sql.Int, parseInt(temporada_id)); }
    if (desde) { where += ' AND CAST(eh.fecha_hora AS DATE) >= @desde'; dbReq.input('desde', sql.Date, desde); }
    if (hasta) { where += ' AND CAST(eh.fecha_hora AS DATE) <= @hasta'; dbReq.input('hasta', sql.Date, hasta); }
    const result = await dbReq.query(`
      SELECT eh.id, eh.tabla, eh.registro_id, eh.campo,
             eh.valor_anterior, eh.valor_nuevo, eh.motivo,
             eh.fecha_hora, u.nombre AS usuario,
             ju.apellido + ', ' + ju.nombre AS trabajador,
             lm.codigo_interno AS lote_codigo
      FROM EdicionesHistorial eh
      LEFT JOIN Usuarios u ON eh.usuario_id = u.id
      LEFT JOIN Despalillado d ON eh.registro_id = d.id
      LEFT JOIN Juntadores ju ON d.despalillador_id = ju.id
      LEFT JOIN LotesMercaderia lm ON d.lote_id = lm.id
      LEFT JOIN Temporadas t ON COALESCE(lm.temporada_id, (SELECT p2.temporada_id FROM Parcelas p2 WHERE p2.id = d.parcela_id)) = t.id
      WHERE ${where}
      ORDER BY eh.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/despalillado/totales-por-lote — totales agrupados por lote
router.get('/totales-por-lote', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = "d.estado != 'anulada' AND d.lote_id IS NOT NULL";
    if (temporada_id) { where += ' AND lm.temporada_id = @tid'; dbReq.input('tid', sql.Int, parseInt(temporada_id)); }
    const result = await dbReq.query(`
      SELECT lm.id AS lote_id, lm.codigo_interno AS lote,
             lm.estado, lm.kilos AS kg_cosecha,
             lm.fecha_inicio, lm.fecha_fin,
             lm.merma_despalillado AS merma_kg,
             dep.nombre AS deposito,
             COUNT(d.id) AS registros,
             SUM(d.kilos) AS kg_despalillado,
             COUNT(DISTINCT d.despalillador_id) AS despalilladores
      FROM Despalillado d
      JOIN LotesMercaderia lm ON d.lote_id = lm.id
      LEFT JOIN Depositos dep ON lm.deposito_id = dep.id
      WHERE ${where}
      GROUP BY lm.id, lm.codigo_interno, lm.estado, lm.kilos, lm.fecha_inicio, lm.fecha_fin, lm.merma_despalillado, dep.nombre
      ORDER BY lm.fecha_inicio DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/despalillado/:id/anular
router.post('/:id/anular', async (req, res) => {
  try {
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo es obligatorio' });

    const pool = await getPool();
    const id = parseInt(req.params.id);

    // 1. Leer el registro de Despalillado
    const dRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT id, juntada_id, deposito_id, kilos, parcela_id, estado FROM Despalillado WHERE id = @id`);
    if (!dRes.recordset.length) return res.status(404).json({ error: 'Despalillado no encontrado' });
    const desp = dRes.recordset[0];

    // 2. Si ya está anulada, rechazar
    if (desp.estado === 'anulada') return res.status(400).json({ error: 'Ya se encuentra anulada' });

    const uid = req.user ? req.user.id : null;
    const now = new Date();
    const kilos = parseFloat(desp.kilos);
    const obs = `Anulación despalillado #${id}`;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      if (desp.juntada_id) {
        // --- Flujo cámara ---
        // Obtener temporada_id desde la Juntada -> Parcela
        const tRes = await transaction.request()
          .input('juntada_id', sql.Int, desp.juntada_id)
          .query(`SELECT l.temporada_id FROM Juntada j JOIN Parcelas l ON j.parcela_id = l.id WHERE j.id = @juntada_id`);
        const temporada_id = tRes.recordset[0].temporada_id;

        // Egreso anulación en MovimientosDeposito
        await transaction.request()
          .input('deposito_id',  sql.Int,           desp.deposito_id)
          .input('temporada_id', sql.Int,           temporada_id)
          .input('kilos',        sql.Decimal(10,3), kilos)
          .input('fecha',        sql.DateTime,      now)
          .input('observacion',  sql.NVarChar,      obs)
          .input('usuario_id',   sql.Int,           uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, tipo, kilos, fecha, observacion, usuario_id)
                  VALUES (@deposito_id, @temporada_id, 'egreso_anulacion', @kilos, @fecha, @observacion, @usuario_id)`);

        // Reabrir JuntadaDestino
        await transaction.request()
          .input('juntada_id',  sql.Int, desp.juntada_id)
          .input('deposito_id', sql.Int, desp.deposito_id)
          .query(`UPDATE JuntadaDestino SET stock_pendiente = 1
                  WHERE juntada_id = @juntada_id AND deposito_id = @deposito_id AND tipo = 'deposito'`);

        // Reabrir Juntada
        await transaction.request()
          .input('juntada_id', sql.Int, desp.juntada_id)
          .query(`UPDATE Juntada SET stock_pendiente = 1 WHERE id = @juntada_id`);

      } else {
        // --- Flujo fruta fresca ---
        const tempRes = await transaction.request()
          .query('SELECT TOP 1 id FROM Temporadas WHERE activa = 1 ORDER BY id DESC');
        if (!tempRes.recordset.length) throw new Error('No hay temporada activa');
        const temporada_id = tempRes.recordset[0].id;

        // Reversar ingreso en MovimientosDeposito (egreso_anulacion)
        await transaction.request()
          .input('deposito_id',  sql.Int,           desp.deposito_id)
          .input('temporada_id', sql.Int,           temporada_id)
          .input('kilos',        sql.Decimal(10,3), kilos)
          .input('fecha',        sql.DateTime,      now)
          .input('observacion',  sql.NVarChar,      obs)
          .input('usuario_id',   sql.Int,           uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, tipo, kilos, fecha, observacion, usuario_id)
                  VALUES (@deposito_id, @temporada_id, 'egreso_anulacion', @kilos, @fecha, @observacion, @usuario_id)`);

        // Reversar egreso_despalillado en MovimientosDeposito (ingreso_anulacion)
        await transaction.request()
          .input('deposito_id',  sql.Int,           desp.deposito_id)
          .input('temporada_id', sql.Int,           temporada_id)
          .input('kilos',        sql.Decimal(10,3), kilos)
          .input('fecha',        sql.DateTime,      now)
          .input('observacion',  sql.NVarChar,      obs)
          .input('usuario_id',   sql.Int,           uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, tipo, kilos, fecha, observacion, usuario_id)
                  VALUES (@deposito_id, @temporada_id, 'ingreso_anulacion', @kilos, @fecha, @observacion, @usuario_id)`);

      }

      // Marcar como anulada
      await transaction.request()
        .input('id', sql.Int, id)
        .query(`UPDATE Despalillado SET estado = 'anulada' WHERE id = @id`);

      await transaction.commit();
      res.json({ ok: true });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
