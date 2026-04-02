const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/despalillado
// Body: { parcela_id, despalillador_id, kilos, operador?, juntada_id?, juntada_destino_id? }
// Si viene juntada_id + juntada_destino_id: flujo cámara — procesa ese tramo específico de JuntadaDestino.
// Sin juntada_id: flujo fruta fresca (despalillado directo sin vínculo a cámara).
router.post('/', async (req, res) => {
  try {
    const { parcela_id, despalillador_id, kilos, operador, juntada_id, juntada_destino_id } = req.body;
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

        // 3. StockMercaderia
        await transaction.request()
          .input('temporada_id', sql.Int,          temporada_id)
          .input('parcela_id',      sql.Int,          jParcelaId)
          .input('kilos',        sql.Decimal(10,3),kilos)
          .input('fecha',        sql.DateTime,     now)
          .input('observacion',  sql.NVarChar,     `Despalillado juntada #${juntada_id}`)
          .input('juntada_id',   sql.Int,          juntada_id)
          .input('juntador_id',  sql.Int,          juntador_id)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, parcela_id, tipo, kilos, destino, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@temporada_id, @parcela_id, 'ingreso', @kilos, 'deposito', @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

        // 4. Marcar este tramo como procesado
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

        await transaction.request()
          .input('temporada_id', sql.Int,          temporada_id)
          .input('kilos',        sql.Decimal(10,3),kilosOrigenNum)
          .input('fecha',        sql.DateTime,     now)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, tipo, kilos, destino, fecha, observacion, usuario_id)
                  VALUES (@temporada_id, 'egreso_despalillado', @kilos, 'deposito', @fecha, 'Egreso para despalillado fresco', @usuario_id)`);

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

        await transaction.request()
          .input('temporada_id', sql.Int,          temporada_id)
          .input('kilos',        sql.Decimal(10,3),kilosNum)
          .input('fecha',        sql.DateTime,     now)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, tipo, kilos, destino, fecha, observacion, usuario_id)
                  VALUES (@temporada_id, 'ingreso', @kilos, 'deposito', @fecha, 'Ingreso fruta despalillada', @usuario_id)`);

        await transaction.commit();
        res.json({ ok: true, merma_kg, merma_pct });
      } catch (innerErr) {
        await transaction.rollback();
        throw innerErr;
      }
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
             dep.nombre AS deposito,
             d.usuario_id, u.nombre AS usuario,
             t.nombre AS temporada
      FROM Despalillado d
      LEFT JOIN Parcelas   l  ON d.parcela_id      = l.id
      LEFT JOIN Temporadas t  ON l.temporada_id    = t.id
      JOIN  Juntadores ju ON d.despalillador_id = ju.id
      LEFT JOIN Depositos  dep ON d.deposito_id   = dep.id
      LEFT JOIN Usuarios   u   ON d.usuario_id    = u.id
      WHERE ${where}
      ORDER BY d.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      LEFT JOIN Temporadas t  ON l.temporada_id = t.id
      WHERE ${where}
      GROUP BY ju.id, ju.apellido, ju.nombre
      ORDER BY kg_total DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
