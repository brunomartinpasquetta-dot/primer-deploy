const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// ══════════════════════════════════════════════════════════════════════
// ENDPOINTS LOTES (flujo: crear lote → agregar juntadas → cerrar lote)
// ══════════════════════════════════════════════════════════════════════

// GET /api/juntada/lotes — lotes abiertos y en curso
router.get('/lotes', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT l.id, l.codigo_interno, l.kilos, l.estado, l.fecha_inicio, l.fecha_fin,
             l.deposito_id, d.nombre AS deposito, l.parcela_id,
             ISNULL((SELECT SUM(j.kilos) FROM Juntada j WHERE j.lote_id = l.id AND j.estado = 'confirmada'), 0) AS kg_juntadas,
             ISNULL((SELECT COUNT(*) FROM Juntada j WHERE j.lote_id = l.id AND j.estado = 'confirmada'), 0) AS cant_juntadas
      FROM LotesMercaderia l
      LEFT JOIN Depositos d ON d.id = l.deposito_id
      WHERE l.estado IN ('abierto', 'en_cosecha')
      ORDER BY l.fecha_inicio DESC
    `);
    res.json(result.recordset);
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// POST /api/juntada/crear-lote — crear nuevo lote
router.post('/crear-lote', async (req, res) => {
  try {
    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    // Obtener temporada activa
    const tRes = await pool.request().query("SELECT TOP 1 id FROM Temporadas WHERE activa = 1");
    if (!tRes.recordset.length) return res.status(400).json({ error: 'No hay temporada activa' });
    const temporada_id = tRes.recordset[0].id;
    // Generar código interno
    const now = new Date();
    const fecha = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0');
    const seqRes = await pool.request()
      .input('temporada_id', sql.Int, temporada_id)
      .query("SELECT COUNT(*) AS cnt FROM LotesMercaderia WHERE temporada_id = @temporada_id AND codigo_interno LIKE 'L' + @fecha + '%'", { fecha });
    // Simpler: count today's lotes
    const countRes = await pool.request().query(`SELECT COUNT(*) AS cnt FROM LotesMercaderia WHERE CAST(fecha_inicio AS DATE) = CAST(GETDATE() AS DATE)`);
    const seq = (countRes.recordset[0].cnt || 0) + 1;
    const codigo = 'L' + fecha + '-' + String(seq).padStart(3, '0');

    const result = await pool.request()
      .input('codigo_interno', sql.NVarChar, codigo)
      .input('temporada_id', sql.Int, temporada_id)
      .input('usuario_id', sql.Int, uid)
      .query(`
        INSERT INTO LotesMercaderia (codigo_interno, temporada_id, kilos, etapa, estado, fecha_inicio, usuario_id)
        VALUES (@codigo_interno, @temporada_id, 0, 'cosecha', 'abierto', GETDATE(), @usuario_id);
        SELECT SCOPE_IDENTITY() AS id
      `);
    res.json({ ok: true, id: result.recordset[0].id, codigo_interno: codigo });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// GET /api/juntada/lote/:id/cosecheros — cosecheros asignados al lote
router.get('/lote/:id/cosecheros', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('lote_id', sql.Int, req.params.id)
      .query(`
        SELECT lc.juntador_id, j.apellido + ', ' + j.nombre AS nombre
        FROM LoteCosecheros lc
        JOIN Juntadores j ON j.id = lc.juntador_id
        WHERE lc.lote_id = @lote_id
        ORDER BY lc.fecha_asignacion
      `);
    res.json(result.recordset);
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// POST /api/juntada/lote/:id/cosechero — agregar cosechero al lote
router.post('/lote/:id/cosechero', async (req, res) => {
  try {
    const { juntador_id } = req.body;
    if (!juntador_id) return res.status(400).json({ error: 'Cosechero obligatorio' });
    const pool = await getPool();
    await pool.request()
      .input('lote_id', sql.Int, req.params.id)
      .input('juntador_id', sql.Int, juntador_id)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM LoteCosecheros WHERE lote_id = @lote_id AND juntador_id = @juntador_id)
          INSERT INTO LoteCosecheros (lote_id, juntador_id) VALUES (@lote_id, @juntador_id)
      `);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// DELETE /api/juntada/lote/:id/cosechero/:juntador_id — quitar cosechero del lote
router.delete('/lote/:id/cosechero/:juntador_id', async (req, res) => {
  try {
    const pool = await getPool();
    const lote_id = parseInt(req.params.id);
    const juntador_id = parseInt(req.params.juntador_id);
    // Verificar que no tenga juntadas activas
    const jRes = await pool.request()
      .input('lote_id', sql.Int, lote_id)
      .input('juntador_id', sql.Int, juntador_id)
      .query("SELECT COUNT(*) AS cnt FROM Juntada WHERE lote_id = @lote_id AND juntador_id = @juntador_id AND estado = 'confirmada'");
    if (jRes.recordset[0].cnt > 0)
      return res.status(400).json({ error: 'No se puede quitar: tiene juntadas registradas. Anulá las juntadas primero.' });
    await pool.request()
      .input('lote_id', sql.Int, lote_id)
      .input('juntador_id', sql.Int, juntador_id)
      .query("DELETE FROM LoteCosecheros WHERE lote_id = @lote_id AND juntador_id = @juntador_id");
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// GET /api/juntada/parcela/:id/carencia-activa — verificar carencia SENASA
router.get('/parcela/:id/carencia-activa', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('parcela_id', sql.Int, req.params.id)
      .query(`
        SELECT TOP 1 a.id, p.nombre AS producto, a.carencia_dias,
               CAST(a.fecha_hora AS DATE) AS fecha_aplicacion,
               CAST(DATEADD(day, a.carencia_dias, a.fecha_hora) AS DATE) AS fecha_liberacion,
               DATEDIFF(day, GETDATE(), DATEADD(day, a.carencia_dias, a.fecha_hora)) AS dias_restantes
        FROM Aplicaciones a
        JOIN Productos p ON p.id = a.producto_id
        WHERE a.parcela_id = @parcela_id
          AND a.estado = 'confirmada'
          AND a.carencia_dias IS NOT NULL
          AND a.carencia_dias > 0
          AND DATEADD(day, a.carencia_dias, a.fecha_hora) > GETDATE()
        ORDER BY DATEADD(day, a.carencia_dias, a.fecha_hora) DESC
      `);
    if (result.recordset.length) {
      const r = result.recordset[0];
      res.json({ tiene_carencia: true, producto: r.producto, dias_restantes: r.dias_restantes, fecha_liberacion: r.fecha_liberacion });
    } else {
      res.json({ tiene_carencia: false });
    }
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// GET /api/juntada/lote/:id/registros — juntadas del lote
router.get('/lote/:id/registros', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('lote_id', sql.Int, req.params.id)
      .query(`
        SELECT j.id, j.juntador_id, j.parcela_id, j.kilos, j.fecha_hora, j.estado, j.usuario_id,
               ISNULL(jun.apellido + ', ' + jun.nombre, 'Desconocido') AS cosechero,
               p.nombre AS parcela,
               u.nombre AS usuario
        FROM Juntada j
        LEFT JOIN Juntadores jun ON jun.id = j.juntador_id
        LEFT JOIN Parcelas p ON p.id = j.parcela_id
        LEFT JOIN Usuarios u ON u.id = j.usuario_id
        WHERE j.lote_id = @lote_id
        ORDER BY j.fecha_hora DESC
      `);
    res.json(result.recordset);
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// POST /api/juntada/lote/:id/registrar — agregar juntada al lote
router.post('/lote/:id/registrar', async (req, res) => {
  try {
    const { juntador_id, parcela_id, kilos, carencia_advertida } = req.body;
    if (!juntador_id || !parcela_id || !kilos || parseFloat(kilos) <= 0)
      return res.status(400).json({ error: 'Cosechero, parcela y kilos son obligatorios' });
    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    const lote_id = parseInt(req.params.id);

    // Verificar lote existe y está abierto
    const loteRes = await pool.request().input('id', sql.Int, lote_id)
      .query("SELECT id, estado FROM LotesMercaderia WHERE id = @id");
    if (!loteRes.recordset.length) return res.status(404).json({ error: 'Lote no encontrado' });
    if (!['abierto', 'en_cosecha'].includes(loteRes.recordset[0].estado))
      return res.status(400).json({ error: 'El lote no está abierto' });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Insertar juntada vinculada al lote
      const req1 = new sql.Request(transaction);
      await req1
        .input('parcela_id', sql.Int, parcela_id)
        .input('juntador_id', sql.Int, juntador_id)
        .input('kilos', sql.Decimal(10,3), parseFloat(kilos))
        .input('usuario_id', sql.Int, uid)
        .input('lote_id', sql.Int, lote_id)
        .input('carencia_advertida', sql.Bit, carencia_advertida ? 1 : 0)
        .query(`
          INSERT INTO Juntada (parcela_id, juntador_id, kilos, fecha_hora, usuario_id, estado, stock_pendiente, lote_id, carencia_advertida)
          VALUES (@parcela_id, @juntador_id, @kilos, GETDATE(), @usuario_id, 'confirmada', 0, @lote_id, @carencia_advertida)
        `);

      // Actualizar kilos del lote y estado
      const req2 = new sql.Request(transaction);
      await req2.input('lote_id', sql.Int, lote_id).query(`
        UPDATE LotesMercaderia
        SET kilos = ISNULL((SELECT SUM(kilos) FROM Juntada WHERE lote_id = @lote_id AND estado = 'confirmada'), 0),
            estado = 'en_cosecha'
        WHERE id = @lote_id
      `);

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// PUT /api/juntada/lote-registro/:id — editar juntada con audit trail
router.put('/lote-registro/:id', async (req, res) => {
  try {
    const { kilos, parcela_id, motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo obligatorio' });
    if (kilos !== undefined && (!kilos || parseFloat(kilos) <= 0)) return res.status(400).json({ error: 'Kilos debe ser mayor a 0' });
    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    const id = parseInt(req.params.id);

    const prev = await pool.request().input('id', sql.Int, id)
      .query("SELECT kilos, lote_id, parcela_id FROM Juntada WHERE id = @id");
    if (!prev.recordset.length) return res.status(404).json({ error: 'Registro no encontrado' });
    const kilosAnterior = prev.recordset[0].kilos;
    const parcelaAnterior = prev.recordset[0].parcela_id;
    const lote_id = prev.recordset[0].lote_id;

    // Get nombres parcela para audit trail (antes de la transacción, solo lectura)
    let nombres = {};
    if (parcela_id !== undefined && parseInt(parcela_id) !== parcelaAnterior) {
      const nombresRes = await pool.request()
        .input('ant', sql.Int, parcelaAnterior)
        .input('nueva', sql.Int, parseInt(parcela_id))
        .query(`SELECT id, nombre FROM Parcelas WHERE id IN (@ant, @nueva)`);
      nombresRes.recordset.forEach(function(r) { nombres[r.id] = r.nombre; });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Editar kilos si se envió
      if (kilos !== undefined) {
        const rk = new sql.Request(transaction);
        await rk.input('id', sql.Int, id).input('kilos', sql.Decimal(10,3), parseFloat(kilos))
          .query("UPDATE Juntada SET kilos = @kilos WHERE id = @id");

        const ra = new sql.Request(transaction);
        await ra.input('tabla', sql.NVarChar, 'Juntada').input('registro_id', sql.Int, id)
          .input('campo', sql.NVarChar, 'kilos')
          .input('valor_anterior', sql.NVarChar, String(kilosAnterior))
          .input('valor_nuevo', sql.NVarChar, String(kilos))
          .input('usuario_id', sql.Int, uid).input('motivo', sql.NVarChar, motivo)
          .query(`INSERT INTO EdicionesHistorial (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id, fecha_hora, motivo)
                  VALUES (@tabla, @registro_id, @campo, @valor_anterior, @valor_nuevo, @usuario_id, GETDATE(), @motivo)`);
      }

      // Editar parcela si se envió y cambió
      if (parcela_id !== undefined && parseInt(parcela_id) !== parcelaAnterior) {
        const rp = new sql.Request(transaction);
        await rp.input('id', sql.Int, id).input('parcela_id', sql.Int, parseInt(parcela_id))
          .query("UPDATE Juntada SET parcela_id = @parcela_id WHERE id = @id");

        const rpa = new sql.Request(transaction);
        await rpa.input('tabla', sql.NVarChar, 'Juntada').input('registro_id', sql.Int, id)
          .input('campo', sql.NVarChar, 'parcela')
          .input('valor_anterior', sql.NVarChar, nombres[parcelaAnterior] || String(parcelaAnterior))
          .input('valor_nuevo', sql.NVarChar, nombres[parseInt(parcela_id)] || String(parcela_id))
          .input('usuario_id', sql.Int, uid).input('motivo', sql.NVarChar, motivo)
          .query(`INSERT INTO EdicionesHistorial (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id, fecha_hora, motivo)
                  VALUES (@tabla, @registro_id, @campo, @valor_anterior, @valor_nuevo, @usuario_id, GETDATE(), @motivo)`);
      }

      // Update lote kilos
      if (lote_id && kilos !== undefined) {
        const rl = new sql.Request(transaction);
        await rl.input('lote_id', sql.Int, lote_id).query(`
          UPDATE LotesMercaderia SET kilos = ISNULL((SELECT SUM(kilos) FROM Juntada WHERE lote_id = @lote_id AND estado = 'confirmada'), 0) WHERE id = @lote_id
        `);
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    res.json({ ok: true, kilos_anterior: kilosAnterior, kilos_nuevo: kilos || kilosAnterior });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// POST /api/juntada/lote-registro/:id/anular — anular juntada del lote
router.post('/lote-registro/:id/anular', async (req, res) => {
  try {
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo obligatorio' });
    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    const id = parseInt(req.params.id);

    const prev = await pool.request().input('id', sql.Int, id)
      .query("SELECT kilos, lote_id, estado FROM Juntada WHERE id = @id");
    if (!prev.recordset.length) return res.status(404).json({ error: 'Registro no encontrado' });
    if (prev.recordset[0].estado === 'anulada') return res.status(400).json({ error: 'Ya está anulada' });
    const lote_id = prev.recordset[0].lote_id;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const r1 = new sql.Request(transaction);
      await r1.input('id', sql.Int, id)
        .query("UPDATE Juntada SET estado = 'anulada' WHERE id = @id");

      // Audit trail
      const r2 = new sql.Request(transaction);
      await r2
        .input('tabla', sql.NVarChar, 'Juntada')
        .input('registro_id', sql.Int, id)
        .input('campo', sql.NVarChar, 'estado')
        .input('valor_anterior', sql.NVarChar, 'confirmada')
        .input('valor_nuevo', sql.NVarChar, 'anulada')
        .input('usuario_id', sql.Int, uid)
        .input('motivo', sql.NVarChar, motivo)
        .query(`INSERT INTO EdicionesHistorial (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id, fecha_hora, motivo)
                VALUES (@tabla, @registro_id, @campo, @valor_anterior, @valor_nuevo, @usuario_id, GETDATE(), @motivo)`);

      // Update lote kilos
      if (lote_id) {
        const r3 = new sql.Request(transaction);
        await r3.input('lote_id', sql.Int, lote_id).query(`
          UPDATE LotesMercaderia SET kilos = ISNULL((SELECT SUM(kilos) FROM Juntada WHERE lote_id = @lote_id AND estado = 'confirmada'), 0) WHERE id = @lote_id
        `);
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// POST /api/juntada/lote/:id/cerrar — cerrar lote y mandar a depósito
router.post('/lote/:id/cerrar', async (req, res) => {
  try {
    const { deposito_id } = req.body;
    if (!deposito_id) return res.status(400).json({ error: 'Seleccioná un depósito' });
    const pool = await getPool();
    const lote_id = parseInt(req.params.id);

    // Verificar que tiene juntadas
    const jRes = await pool.request().input('lote_id', sql.Int, lote_id)
      .query("SELECT COUNT(*) AS cnt, SUM(kilos) AS total FROM Juntada WHERE lote_id = @lote_id AND estado = 'confirmada'");
    if (!jRes.recordset[0].cnt) return res.status(400).json({ error: 'El lote no tiene juntadas' });

    await pool.request()
      .input('id', sql.Int, lote_id)
      .input('deposito_id', sql.Int, deposito_id)
      .input('kilos', sql.Decimal(10,3), parseFloat(jRes.recordset[0].total))
      .query(`
        UPDATE LotesMercaderia
        SET estado = 'cerrado', deposito_id = @deposito_id, deposito_actual_id = @deposito_id, kilos = @kilos, fecha_fin = GETDATE()
        WHERE id = @id
      `);

    res.json({ ok: true, kilos: jRes.recordset[0].total });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// GET /api/juntada/depositos-cosecha — depósitos para mandar lotes
router.get('/depositos-cosecha', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT id, nombre FROM Depositos WHERE activo = 1 AND tipo_deposito IN ('fruta_fresca','mercaderia') ORDER BY nombre");
    res.json(result.recordset);
  } catch (e) { console.error(e); res.status(500).json({ error: "Error interno del servidor" }); }
});

// ══════════════════════════════════════════════════════════════════════
// ENDPOINTS LEGACY (registro directo sin lotes)
// ══════════════════════════════════════════════════════════════════════

// POST /api/juntada
// Body: { parcela_id, juntador_id, kilos, operador?, observacion?,
//         destinos?: [{ tipo, kilos, deposito_id?, precio_kilo?, comprador?, motivo? }] }
// Crea la Juntada + inserta JuntadaDestino por cada tramo de distribución.
// Destinos fresco → MovimientosDeposito + StockMercaderia inmediato.
// Destinos cámara (requiere_despalillado=1) → stock_pendiente=1, procesado al despalillar.
router.post('/', async (req, res) => {
  try {
    const { parcela_id, juntador_id, kilos, operador, observacion, destinos } = req.body;
    if (!parcela_id || !juntador_id) return res.status(400).json({ error: 'Parcela y juntador son obligatorios' });
    if (!kilos || parseFloat(kilos) <= 0) return res.status(400).json({ error: 'Kilos debe ser mayor a 0' });
    const pool = await getPool();

    const parcelaResult = await pool.request()
      .input('parcela_id', sql.Int, parcela_id)
      .query('SELECT temporada_id FROM Parcelas WHERE id = @parcela_id');
    const temporada_id = parcelaResult.recordset.length ? parcelaResult.recordset[0].temporada_id : null;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Insertar juntada
      const uid = req.user ? req.user.id : null;
      const insertResult = await transaction.request()
        .input('parcela_id',  sql.Int,          parcela_id)
        .input('juntador_id', sql.Int,          juntador_id)
        .input('kilos',       sql.Decimal(8, 2),kilos)
        .input('operador',    sql.NVarChar,     operador || '')
        .input('observacion', sql.NVarChar,     observacion || '')
        .input('usuario_id',  sql.Int,          uid)
        .query(`INSERT INTO Juntada (parcela_id, juntador_id, kilos, operador, observacion, usuario_id)
                OUTPUT INSERTED.id
                VALUES (@parcela_id, @juntador_id, @kilos, @operador, @observacion, @usuario_id)`);

      const newId = insertResult.recordset[0].id;

      // 2. Procesar destinos
      if (destinos && destinos.length > 0) {
        // Obtener info de depósitos involucrados
        let depositoInfo = {};
        const depIds = [...new Set(destinos.filter(d => d.tipo === 'deposito' && d.deposito_id).map(d => parseInt(d.deposito_id)))];
        if (depIds.length > 0) {
          const depReq = transaction.request();
          const depPlaceholders = depIds.map((id, i) => { depReq.input(`depId${i}`, sql.Int, id); return `@depId${i}`; });
          const depRes = await depReq.query(`SELECT id, tipo, requiere_despalillado FROM Depositos WHERE id IN (${depPlaceholders.join(',')})`);
          depRes.recordset.forEach(r => { depositoInfo[r.id] = r; });
        }

        // Resumen para Juntada: destino y deposito_id de referencia
        const tipos = [...new Set(destinos.map(d => d.tipo))];
        const destinoResumen = tipos.length === 1 ? tipos[0] : 'mixto';
        const ventaDirecta = destinos.find(d => d.tipo === 'venta_directa');
        // Para stock_pendiente en Juntada: basta con que haya AL MENOS UN destino pendiente
        const hayPendiente = destinos.some(d => d.tipo === 'deposito' && depositoInfo[d.deposito_id]?.requiere_despalillado);
        // deposito_id de referencia: preferir el pendiente si existe
        const depRef = destinos.find(d => d.tipo === 'deposito' && depositoInfo[d.deposito_id]?.requiere_despalillado)
                    || destinos.find(d => d.tipo === 'deposito');

        await transaction.request()
          .input('id',                   sql.Int,          newId)
          .input('destino',              sql.NVarChar,     destinoResumen)
          .input('deposito_id',          sql.Int,          depRef ? depRef.deposito_id : null)
          .input('precio_venta_directa', sql.Decimal(10,3),ventaDirecta ? ventaDirecta.precio_kilo || null : null)
          .input('comprador_directo',    sql.NVarChar,     ventaDirecta ? ventaDirecta.comprador || '' : '')
          .input('stock_pendiente',      sql.Bit,          hayPendiente ? 1 : 0)
          .query(`UPDATE Juntada SET destino=@destino, deposito_id=@deposito_id,
                  precio_venta_directa=@precio_venta_directa, comprador_directo=@comprador_directo,
                  stock_pendiente=@stock_pendiente
                  WHERE id=@id`);

        const now = new Date();

        for (const d of destinos) {
          if (!d.kilos || parseFloat(d.kilos) <= 0) continue;

          const esPendiente = d.tipo === 'deposito' && !!depositoInfo[d.deposito_id]?.requiere_despalillado;

          // 2a. Registrar en JuntadaDestino (fuente de verdad de distribución)
          await transaction.request()
            .input('jd_juntada_id',      sql.Int,          newId)
            .input('jd_tipo',            sql.NVarChar,     d.tipo)
            .input('jd_deposito_id',     sql.Int,          d.deposito_id || null)
            .input('jd_kilos',           sql.Decimal(10,3),d.kilos)
            .input('jd_stock_pendiente', sql.Bit,          esPendiente ? 1 : 0)
            .input('jd_precio_kilo',     sql.Decimal(10,3),d.precio_kilo || null)
            .input('jd_comprador',       sql.NVarChar,     d.comprador || null)
            .input('jd_motivo',          sql.NVarChar,     d.motivo || null)
            .query(`INSERT INTO JuntadaDestino
                    (juntada_id, tipo, deposito_id, kilos, stock_pendiente, precio_kilo, comprador, motivo)
                    VALUES (@jd_juntada_id, @jd_tipo, @jd_deposito_id, @jd_kilos,
                            @jd_stock_pendiente, @jd_precio_kilo, @jd_comprador, @jd_motivo)`);

          // 2b. Movimientos según tipo
          if (d.tipo === 'deposito') {
            // Cámara fría (requiere_despalillado): stock se registra al despalillar
            if (esPendiente) continue;

            await transaction.request()
              .input('deposito_id',  sql.Int,          d.deposito_id)
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',      sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Juntada #${newId}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO MovimientosDeposito
                      (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso_juntada', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

          } else if (d.tipo === 'venta_directa') {
            // MovimientosDeposito — fuente principal
            await transaction.request()
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',   sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('precio_kilo',  sql.Decimal(10,3),d.precio_kilo || null)
              .input('comprador',    sql.NVarChar,     d.comprador || '')
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Venta directa juntada #${newId}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO MovimientosDeposito
                      (temporada_id, parcela_id, tipo, kilos, precio_kilo, comprador, fecha, observacion, juntada_id, juntador_id, usuario_id, destino_venta)
                      VALUES (@temporada_id, @parcela_id, 'egreso_venta', @kilos, @precio_kilo, @comprador, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id, 'venta_directa')`);

            // LEGACY — pendiente migración CC (CuentaCorrienteClientes depende de stock_mercaderia_id)
            await transaction.request()
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',   sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('precio_kilo',  sql.Decimal(10,3),d.precio_kilo || null)
              .input('comprador',    sql.NVarChar,     d.comprador || '')
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Venta directa juntada #${newId}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO StockMercaderia
                      (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, comprador, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @parcela_id, 'ingreso', @kilos, 'venta_directa', @precio_kilo, @comprador, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id);
                      INSERT INTO StockMercaderia
                      (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, comprador, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @parcela_id, 'egreso_venta', @kilos, 'venta_directa', @precio_kilo, @comprador, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

            if (d.precio_kilo && parseFloat(d.precio_kilo) > 0) {
              const total = parseFloat(d.kilos) * parseFloat(d.precio_kilo);
              await transaction.request()
                .input('concepto',       sql.NVarChar,     `Venta directa juntada #${newId}${d.comprador ? ' a ' + d.comprador : ''}`)
                .input('monto',          sql.Decimal(12,2),total)
                .input('temporada_id',   sql.Int,          temporada_id)
                .input('usuario_nombre', sql.NVarChar,     req.user ? req.user.nombre : null)
                .query(`INSERT INTO Caja (tipo, concepto, monto, temporada_id, usuario_nombre)
                        VALUES ('ingreso', @concepto, @monto, @temporada_id, @usuario_nombre)`);
            }

          } else if (d.tipo === 'descarte') {
            // MovimientosDeposito — fuente principal
            await transaction.request()
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',   sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Descarte juntada #${newId}: ${d.motivo || ''}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO MovimientosDeposito
                      (temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id, destino_venta)
                      VALUES (@temporada_id, @parcela_id, 'egreso_descarte', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id, 'descarte')`);

            // LEGACY — pendiente migración CC
            await transaction.request()
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',   sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Descarte juntada #${newId}: ${d.motivo || ''}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO StockMercaderia
                      (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @parcela_id, 'egreso_descarte', @kilos, 'descarte', 0, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
          }
        }
      }

      await transaction.commit();
      res.json({ ok: true, id: newId });

    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }

  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/juntada/:id/destino  — asignar destinos a una juntada ya registrada
// Body: { destinos: [{ tipo, kilos, deposito_id?, motivo? }] }
router.post('/:id/destino', async (req, res) => {
  const juntadaId = parseInt(req.params.id);
  const { destinos } = req.body;

  if (!destinos || !destinos.length) {
    return res.status(400).json({ error: 'Destinos requeridos' });
  }

  const VALIDOS = ['deposito', 'descarte'];
  const invalidos = destinos.map(d => d.tipo).filter(t => !VALIDOS.includes(t));
  if (invalidos.length) {
    return res.status(400).json({ error: 'Destino inválido: ' + invalidos.join(', ') });
  }

  const pool = await getPool();

  const jRes = await pool.request()
    .input('id', sql.Int, juntadaId)
    .query(`SELECT j.id, j.juntador_id, j.kilos, j.parcela_id, l.temporada_id
            FROM Juntada j JOIN Parcelas l ON j.parcela_id = l.id WHERE j.id = @id`);

  if (!jRes.recordset.length) return res.status(404).json({ error: 'Juntada no encontrada' });
  const juntada = jRes.recordset[0];

  const sumaDestinos = destinos.reduce((s, d) => s + (parseFloat(d.kilos) || 0), 0);
  if (Math.abs(sumaDestinos - parseFloat(juntada.kilos)) > 0.01) {
    return res.status(400).json({
      error: `Quedan ${(parseFloat(juntada.kilos) - sumaDestinos).toFixed(2)} kg sin asignar`
    });
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Info depósitos
    let depositoInfo = {};
    const depIds = [...new Set(destinos.filter(d => d.tipo === 'deposito' && d.deposito_id).map(d => parseInt(d.deposito_id)))];
    if (depIds.length > 0) {
      const depReq = transaction.request();
      const depPlaceholders = depIds.map((id, i) => { depReq.input(`depId${i}`, sql.Int, id); return `@depId${i}`; });
      const depRes = await depReq.query(`SELECT id, tipo, requiere_despalillado FROM Depositos WHERE id IN (${depPlaceholders.join(',')})`);
      depRes.recordset.forEach(r => { depositoInfo[r.id] = r; });
    }

    const tipos = [...new Set(destinos.map(d => d.tipo))];
    const destinoResumen = tipos.length === 1 ? tipos[0] : 'mixto';
    const hayPendiente = destinos.some(d => d.tipo === 'deposito' && depositoInfo[d.deposito_id]?.requiere_despalillado);
    const depRef = destinos.find(d => d.tipo === 'deposito' && depositoInfo[d.deposito_id]?.requiere_despalillado)
                || destinos.find(d => d.tipo === 'deposito');

    await transaction.request()
      .input('id',              sql.Int,      juntadaId)
      .input('destino',         sql.NVarChar, destinoResumen)
      .input('deposito_id',     sql.Int,      depRef ? depRef.deposito_id : null)
      .input('stock_pendiente', sql.Bit,      hayPendiente ? 1 : 0)
      .query(`UPDATE Juntada SET destino=@destino, deposito_id=@deposito_id, stock_pendiente=@stock_pendiente WHERE id=@id`);

    const now = new Date();
    const uid = req.user ? req.user.id : null;
    const { parcela_id, temporada_id, juntador_id } = juntada;

    for (const d of destinos) {
      if (!d.kilos || parseFloat(d.kilos) <= 0) continue;
      const esPendiente = d.tipo === 'deposito' && !!depositoInfo[d.deposito_id]?.requiere_despalillado;

      await transaction.request()
        .input('jd_juntada_id',      sql.Int,          juntadaId)
        .input('jd_tipo',            sql.NVarChar,     d.tipo)
        .input('jd_deposito_id',     sql.Int,          d.deposito_id || null)
        .input('jd_kilos',           sql.Decimal(10,3),d.kilos)
        .input('jd_stock_pendiente', sql.Bit,          esPendiente ? 1 : 0)
        .input('jd_motivo',          sql.NVarChar,     d.motivo || null)
        .query(`INSERT INTO JuntadaDestino (juntada_id, tipo, deposito_id, kilos, stock_pendiente, motivo)
                VALUES (@jd_juntada_id, @jd_tipo, @jd_deposito_id, @jd_kilos, @jd_stock_pendiente, @jd_motivo)`);

      if (d.tipo === 'deposito') {
        if (esPendiente) continue;
        await transaction.request()
          .input('deposito_id',  sql.Int,          d.deposito_id)
          .input('temporada_id', sql.Int,          temporada_id)
          .input('parcela_id',      sql.Int,          parcela_id)
          .input('kilos',        sql.Decimal(10,3),d.kilos)
          .input('fecha',        sql.DateTime,     now)
          .input('observacion',  sql.NVarChar,     `Juntada #${juntadaId}`)
          .input('juntada_id',   sql.Int,          juntadaId)
          .input('juntador_id',  sql.Int,          juntador_id)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso_juntada', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

      } else if (d.tipo === 'descarte') {
        // MovimientosDeposito — fuente principal
        await transaction.request()
          .input('temporada_id', sql.Int,          temporada_id)
          .input('parcela_id',   sql.Int,          parcela_id)
          .input('kilos',        sql.Decimal(10,3),d.kilos)
          .input('fecha',        sql.DateTime,     now)
          .input('observacion',  sql.NVarChar,     `Descarte juntada #${juntadaId}: ${d.motivo || ''}`)
          .input('juntada_id',   sql.Int,          juntadaId)
          .input('juntador_id',  sql.Int,          juntador_id)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO MovimientosDeposito
                  (temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id, destino_venta)
                  VALUES (@temporada_id, @parcela_id, 'egreso_descarte', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id, 'descarte')`);

        // LEGACY — pendiente migración CC
        await transaction.request()
          .input('temporada_id', sql.Int,          temporada_id)
          .input('parcela_id',   sql.Int,          parcela_id)
          .input('kilos',        sql.Decimal(10,3),d.kilos)
          .input('fecha',        sql.DateTime,     now)
          .input('observacion',  sql.NVarChar,     `Descarte juntada #${juntadaId}: ${d.motivo || ''}`)
          .input('juntada_id',   sql.Int,          juntadaId)
          .input('juntador_id',  sql.Int,          juntador_id)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@temporada_id, @parcela_id, 'egreso_descarte', @kilos, 'descarte', 0, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
      }
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/juntada/hoy  — juntadas del día con sus destinos
router.get('/hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT j.id, l.nombre AS parcela,
              ju.apellido + ', ' + ju.nombre AS juntador,
              j.kilos, j.fecha_hora, j.destino, j.stock_pendiente, j.estado
              FROM Juntada j
              JOIN Parcelas l ON j.parcela_id = l.id
              JOIN Juntadores ju ON j.juntador_id = ju.id
              WHERE CAST(j.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY j.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/juntada/destinos-hoy
// Devuelve filas de JuntadaDestino para las juntadas de HOY.
// Incluye destinos fresco (ya en stock) y pendientes (esperando despalillado).
router.get('/destinos-hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT
                jd.id          AS destino_id,
                jd.juntada_id,
                jd.tipo,
                jd.kilos,
                jd.stock_pendiente,
                jd.deposito_id,
                d.nombre       AS deposito,
                j.fecha_hora   AS fecha,
                j.parcela_id,
                l.nombre AS parcela,
                j.juntador_id,
                ju.apellido + ', ' + ju.nombre AS cosechero,
                j.usuario_id,
                u.nombre AS usuario,
                j.estado,
                j.lote_id,
                lm.codigo_interno AS lote_codigo
              FROM JuntadaDestino jd
              JOIN Juntada    j  ON jd.juntada_id = j.id
              JOIN Parcelas   l  ON j.parcela_id  = l.id
              JOIN Juntadores ju ON j.juntador_id = ju.id
              LEFT JOIN Depositos d  ON jd.deposito_id = d.id
              LEFT JOIN Usuarios  u  ON j.usuario_id   = u.id
              LEFT JOIN LotesMercaderia lm ON j.lote_id = lm.id
              WHERE CAST(j.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY j.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/juntada/pendientes-stock
router.get('/pendientes-stock', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let q = `SELECT COUNT(*) AS cantidad, ISNULL(SUM(jd.kilos), 0) AS total_kg
             FROM JuntadaDestino jd
             JOIN Juntada j ON jd.juntada_id = j.id
             JOIN Parcelas l ON j.parcela_id = l.id
             WHERE jd.stock_pendiente = 1`;
    if (temporada_id) { q += ` AND l.temporada_id = @temporada_id`; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }
    const result = await dbReq.query(q);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/juntada/historial — historial completo filtrable
router.get('/historial', async (req, res) => {
  try {
    const { temporada_id, desde, hasta, juntador_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id)  { where += ' AND l.temporada_id = @tid';                dbReq.input('tid',   sql.Int,  parseInt(temporada_id)); }
    if (desde)         { where += ' AND CAST(j.fecha_hora AS DATE) >= @desde'; dbReq.input('desde', sql.Date, desde); }
    if (hasta)         { where += ' AND CAST(j.fecha_hora AS DATE) <= @hasta'; dbReq.input('hasta', sql.Date, hasta); }
    if (juntador_id)   { where += ' AND j.juntador_id = @jid';                dbReq.input('jid',   sql.Int,  parseInt(juntador_id)); }
    const result = await dbReq.query(`
      SELECT j.id, l.nombre AS parcela,
             ju.apellido + ', ' + ju.nombre AS cosechero,
             j.kilos, j.fecha_hora AS fecha, j.juntador_id,
             j.usuario_id, u.nombre AS usuario,
             t.nombre AS temporada, j.estado,
             lm.codigo_interno AS lote_codigo
      FROM Juntada j
      JOIN Parcelas l ON j.parcela_id = l.id
      JOIN Juntadores ju ON j.juntador_id = ju.id
      LEFT JOIN Temporadas t ON l.temporada_id = t.id
      LEFT JOIN Usuarios u ON j.usuario_id = u.id
      LEFT JOIN LotesMercaderia lm ON j.lote_id = lm.id
      WHERE ${where}
      ORDER BY j.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/juntada/totales-por-juntador — totales campaña activa
router.get('/totales-por-juntador', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 'j.estado != \'anulada\'';
    if (temporada_id) { where += ' AND l.temporada_id = @tid'; dbReq.input('tid', sql.Int, parseInt(temporada_id)); }
    const result = await dbReq.query(`
      SELECT
        ju.apellido + ', ' + ju.nombre AS cosechero,
        COUNT(j.id)       AS registros,
        SUM(j.kilos)      AS kg_total,
        MIN(j.fecha_hora) AS primera_fecha,
        MAX(j.fecha_hora) AS ultima_fecha
      FROM Juntada j
      JOIN Parcelas l ON j.parcela_id = l.id
      JOIN Juntadores ju ON j.juntador_id = ju.id
      WHERE ${where}
      GROUP BY ju.id, ju.apellido, ju.nombre
      ORDER BY kg_total DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/juntada/auditoria — ediciones y anulaciones
router.get('/auditoria', async (req, res) => {
  try {
    const { temporada_id, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = "eh.tabla IN ('Juntada','LotesMercaderia')";
    if (temporada_id) { where += ' AND t.id = @tid'; dbReq.input('tid', sql.Int, parseInt(temporada_id)); }
    if (desde) { where += ' AND CAST(eh.fecha_hora AS DATE) >= @desde'; dbReq.input('desde', sql.Date, desde); }
    if (hasta) { where += ' AND CAST(eh.fecha_hora AS DATE) <= @hasta'; dbReq.input('hasta', sql.Date, hasta); }
    const result = await dbReq.query(`
      SELECT eh.id, eh.tabla, eh.registro_id, eh.campo,
             eh.valor_anterior, eh.valor_nuevo, eh.motivo,
             eh.fecha_hora, u.nombre AS usuario,
             CASE eh.tabla
               WHEN 'Juntada' THEN ju.apellido + ', ' + ju.nombre
               ELSE NULL
             END AS trabajador,
             CASE eh.tabla
               WHEN 'Juntada' THEN lm.codigo_interno
               WHEN 'LotesMercaderia' THEN lm2.codigo_interno
               ELSE NULL
             END AS lote_codigo
      FROM EdicionesHistorial eh
      LEFT JOIN Usuarios u ON eh.usuario_id = u.id
      LEFT JOIN Juntada j ON eh.tabla = 'Juntada' AND eh.registro_id = j.id
      LEFT JOIN Juntadores ju ON j.juntador_id = ju.id
      LEFT JOIN LotesMercaderia lm ON j.lote_id = lm.id
      LEFT JOIN LotesMercaderia lm2 ON eh.tabla = 'LotesMercaderia' AND eh.registro_id = lm2.id
      LEFT JOIN Parcelas p ON j.parcela_id = p.id
      LEFT JOIN Temporadas t ON p.temporada_id = t.id
      WHERE ${where}
      ORDER BY eh.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/juntada/totales-por-lote — totales agrupados por lote
router.get('/totales-por-lote', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = "j.estado != 'anulada' AND j.lote_id IS NOT NULL";
    if (temporada_id) { where += ' AND lm.temporada_id = @tid'; dbReq.input('tid', sql.Int, parseInt(temporada_id)); }
    const result = await dbReq.query(`
      SELECT lm.id AS lote_id, lm.codigo_interno AS lote,
             lm.estado, lm.fecha_inicio,
             ju.apellido + ', ' + ju.nombre AS cosechero,
             COUNT(j.id) AS registros,
             SUM(j.kilos) AS kg_total
      FROM Juntada j
      JOIN LotesMercaderia lm ON j.lote_id = lm.id
      JOIN Juntadores ju ON j.juntador_id = ju.id
      WHERE ${where}
      GROUP BY lm.id, lm.codigo_interno, lm.estado, lm.fecha_inicio, ju.id, ju.apellido, ju.nombre
      ORDER BY lm.fecha_inicio DESC, kg_total DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/juntada/:id/anular — anular juntada y revertir movimientos
router.post('/:id/anular', async (req, res) => {
  try {
    const juntadaId = parseInt(req.params.id);
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo es obligatorio' });

    const pool = await getPool();

    // 1. Leer la juntada
    const jRes = await pool.request()
      .input('id', sql.Int, juntadaId)
      .query(`SELECT j.id, j.kilos, j.estado, j.parcela_id, j.juntador_id,
                     j.precio_venta_directa, j.comprador_directo,
                     l.temporada_id
              FROM Juntada j
              JOIN Parcelas l ON j.parcela_id = l.id
              WHERE j.id = @id`);
    if (!jRes.recordset.length) return res.status(404).json({ error: 'Juntada no encontrada' });
    const juntada = jRes.recordset[0];

    if (juntada.estado === 'anulada') {
      return res.status(400).json({ error: 'La juntada ya está anulada' });
    }

    // 2. Leer destinos
    const dRes = await pool.request()
      .input('jid', sql.Int, juntadaId)
      .query(`SELECT jd.*, d.requiere_despalillado
              FROM JuntadaDestino jd
              LEFT JOIN Depositos d ON jd.deposito_id = d.id
              WHERE jd.juntada_id = @jid`);
    const destinos = dRes.recordset;

    // 3. Bloquear si algún destino depósito ya fue despalillado (stock_pendiente=0 con requiere_despalillado=1)
    const despalillados = destinos.filter(d => d.tipo === 'deposito' && d.requiere_despalillado === true && d.stock_pendiente === false);
    if (despalillados.length > 0) {
      return res.status(400).json({ error: 'No se puede anular: tiene destinos ya despalillados. Anule primero el despalillado.' });
    }

    // 4. Transacción
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const now = new Date();
      const uid = req.user ? req.user.id : null;
      const { parcela_id, temporada_id, juntador_id } = juntada;

      for (const d of destinos) {
        if (d.tipo === 'deposito') {
          if (d.requiere_despalillado && d.stock_pendiente === true) {
            // Pendiente de despalillado: no hay stock que revertir, solo marcar
            continue;
          }
          // Depósito fresco (no requiere despalillado): revertir ingreso
          if (!d.requiere_despalillado) {
            await transaction.request()
              .input('deposito_id',  sql.Int,          d.deposito_id)
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',   sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3), d.kilos)
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Anulación juntada #${juntadaId}`)
              .input('juntada_id',   sql.Int,          juntadaId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO MovimientosDeposito
                      (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@deposito_id, @temporada_id, @parcela_id, 'egreso_anulacion', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
          }

        } else if (d.tipo === 'venta_directa') {
          // MovimientosDeposito — fuente principal
          await transaction.request()
            .input('temporada_id', sql.Int,          temporada_id)
            .input('parcela_id',   sql.Int,          parcela_id)
            .input('kilos',        sql.Decimal(10,3), d.kilos)
            .input('fecha',        sql.DateTime,     now)
            .input('observacion',  sql.NVarChar,     `Anulación venta directa juntada #${juntadaId}`)
            .input('juntada_id',   sql.Int,          juntadaId)
            .input('juntador_id',  sql.Int,          juntador_id)
            .input('usuario_id',   sql.Int,          uid)
            .query(`INSERT INTO MovimientosDeposito
                    (temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id, destino_venta)
                    VALUES (@temporada_id, @parcela_id, 'ingreso_anulacion', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id, 'venta_directa')`);

          // LEGACY — pendiente migración CC
          await transaction.request()
            .input('temporada_id', sql.Int,          temporada_id)
            .input('parcela_id',   sql.Int,          parcela_id)
            .input('kilos',        sql.Decimal(10,3), d.kilos)
            .input('fecha',        sql.DateTime,     now)
            .input('observacion',  sql.NVarChar,     `Anulación venta directa juntada #${juntadaId}`)
            .input('juntada_id',   sql.Int,          juntadaId)
            .input('juntador_id',  sql.Int,          juntador_id)
            .input('usuario_id',   sql.Int,          uid)
            .query(`INSERT INTO StockMercaderia
                    (temporada_id, parcela_id, tipo, kilos, destino, fecha, observacion, juntada_id, juntador_id, usuario_id)
                    VALUES (@temporada_id, @parcela_id, 'ingreso_anulacion', @kilos, 'venta_directa', @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

          // Revertir ingreso de caja
          const precioKilo = d.precio_kilo ? parseFloat(d.precio_kilo) : 0;
          if (precioKilo > 0) {
            const total = parseFloat(d.kilos) * precioKilo;
            await transaction.request()
              .input('concepto',       sql.NVarChar,      `Anulación venta directa juntada #${juntadaId}`)
              .input('monto',          sql.Decimal(12,2), total)
              .input('temporada_id',   sql.Int,           temporada_id)
              .input('usuario_nombre', sql.NVarChar,      req.user ? req.user.nombre : null)
              .query(`INSERT INTO Caja (tipo, concepto, monto, temporada_id, usuario_nombre)
                      VALUES ('egreso', @concepto, @monto, @temporada_id, @usuario_nombre)`);
          }

        } else if (d.tipo === 'descarte') {
          // MovimientosDeposito — fuente principal
          await transaction.request()
            .input('temporada_id', sql.Int,          temporada_id)
            .input('parcela_id',   sql.Int,          parcela_id)
            .input('kilos',        sql.Decimal(10,3), d.kilos)
            .input('fecha',        sql.DateTime,     now)
            .input('observacion',  sql.NVarChar,     `Anulación descarte juntada #${juntadaId}`)
            .input('juntada_id',   sql.Int,          juntadaId)
            .input('juntador_id',  sql.Int,          juntador_id)
            .input('usuario_id',   sql.Int,          uid)
            .query(`INSERT INTO MovimientosDeposito
                    (temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id, destino_venta)
                    VALUES (@temporada_id, @parcela_id, 'ingreso_anulacion', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id, 'descarte')`);

          // LEGACY — pendiente migración CC
          await transaction.request()
            .input('temporada_id', sql.Int,          temporada_id)
            .input('parcela_id',   sql.Int,          parcela_id)
            .input('kilos',        sql.Decimal(10,3), d.kilos)
            .input('fecha',        sql.DateTime,     now)
            .input('observacion',  sql.NVarChar,     `Anulación descarte juntada #${juntadaId}`)
            .input('juntada_id',   sql.Int,          juntadaId)
            .input('juntador_id',  sql.Int,          juntador_id)
            .input('usuario_id',   sql.Int,          uid)
            .query(`INSERT INTO StockMercaderia
                    (temporada_id, parcela_id, tipo, kilos, destino, fecha, observacion, juntada_id, juntador_id, usuario_id)
                    VALUES (@temporada_id, @parcela_id, 'ingreso_anulacion', @kilos, 'descarte', @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
        }
      }

      // Marcar juntada como anulada
      await transaction.request()
        .input('id', sql.Int, juntadaId)
        .input('motivo', sql.NVarChar, motivo)
        .query(`UPDATE Juntada SET estado = 'anulada', observacion = ISNULL(observacion, '') + ' [ANULADA: ' + @motivo + ']' WHERE id = @id`);

      // Marcar todos los destinos como procesados
      await transaction.request()
        .input('jid', sql.Int, juntadaId)
        .query(`UPDATE JuntadaDestino SET stock_pendiente = 0 WHERE juntada_id = @jid`);

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
