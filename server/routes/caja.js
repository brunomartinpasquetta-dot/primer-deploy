const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Obtener movimientos de caja
router.get('/', async (req, res) => {
  try {
    const { temporada_id, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT c.id, c.tipo, c.concepto, c.monto, c.fecha, c.observacion,
                 fp.nombre AS forma_pago,
                 t.nombre AS temporada
                 FROM Caja c
                 LEFT JOIN FormasPago fp ON c.forma_pago_id = fp.id
                 LEFT JOIN Temporadas t ON c.temporada_id = t.id
                 WHERE 1=1`;
    if (temporada_id) {
      query += ` AND c.temporada_id = @temporada_id`;
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    if (desde) {
      query += ` AND c.fecha >= @desde`;
      dbReq.input('desde', sql.Date, desde);
    }
    if (hasta) {
      query += ` AND c.fecha <= @hasta`;
      dbReq.input('hasta', sql.Date, hasta);
    }
    query += ` ORDER BY c.fecha DESC`;
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resumen de caja (totales)
router.get('/resumen', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT
                 SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) AS total_ingresos,
                 SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) AS total_egresos,
                 SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) AS saldo
                 FROM Caja WHERE 1=1`;
    if (temporada_id) {
      query += ` AND temporada_id = @temporada_id`;
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    const result = await dbReq.query(query);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar movimiento
router.post('/', async (req, res) => {
  try {
    const { tipo, concepto, monto, forma_pago_id, fecha, temporada_id, observacion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('tipo', sql.NVarChar, tipo)
      .input('concepto', sql.NVarChar, concepto)
      .input('monto', sql.Decimal(12,2), monto)
      .input('forma_pago_id', sql.Int, forma_pago_id || null)
      .input('fecha', sql.Date, fecha || new Date())
      .input('temporada_id', sql.Int, temporada_id || null)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, fecha, temporada_id, observacion)
              VALUES (@tipo, @concepto, @monto, @forma_pago_id, @fecha, @temporada_id, @observacion)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Formas de pago
router.get('/formas-pago', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre FROM FormasPago WHERE activo = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;