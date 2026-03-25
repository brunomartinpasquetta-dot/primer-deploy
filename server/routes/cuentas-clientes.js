const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Resumen de cuenta corriente por cliente
router.get('/resumen', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT c.id, c.nombre AS cliente,
              ISNULL(SUM(CASE WHEN cc.tipo = 'debito' THEN cc.monto ELSE 0 END), 0) AS total_ventas,
              ISNULL(SUM(CASE WHEN cc.tipo = 'credito' THEN cc.monto ELSE 0 END), 0) AS total_cobrado,
              ISNULL(SUM(CASE WHEN cc.tipo = 'debito' THEN cc.monto ELSE -cc.monto END), 0) AS saldo
              FROM Clientes c
              LEFT JOIN CuentaCorrienteClientes cc ON c.id = cc.cliente_id
              WHERE c.activo = 1
              GROUP BY c.id, c.nombre
              ORDER BY c.nombre`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Movimientos de un cliente
router.get('/:cliente_id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('cliente_id', sql.Int, req.params.cliente_id)
      .query(`SELECT cc.id, cc.tipo, cc.monto, cc.fecha, cc.observacion,
              fp.nombre AS forma_pago
              FROM CuentaCorrienteClientes cc
              LEFT JOIN FormasPago fp ON cc.forma_pago_id = fp.id
              WHERE cc.cliente_id = @cliente_id
              ORDER BY cc.fecha DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar cobro de cliente
router.post('/cobro', async (req, res) => {
  const { cliente_id, monto, forma_pago_id, cheque_id, observacion } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const req1 = new sql.Request(transaction);
    await req1
      .input('cliente_id', sql.Int, cliente_id)
      .input('monto', sql.Decimal(12,2), monto)
      .input('forma_pago_id', sql.Int, forma_pago_id || null)
      .input('cheque_id', sql.Int, cheque_id || null)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO CuentaCorrienteClientes (cliente_id, tipo, monto, forma_pago_id, cheque_id, observacion)
              VALUES (@cliente_id, 'credito', @monto, @forma_pago_id, @cheque_id, @observacion)`);
    const req2 = new sql.Request(transaction);
    await req2
      .input('concepto', sql.NVarChar, 'Cobro a cliente')
      .input('monto', sql.Decimal(12,2), monto)
      .input('forma_pago_id', sql.Int, forma_pago_id || null)
      .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id) VALUES ('ingreso', @concepto, @monto, @forma_pago_id)`);
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// Registrar venta a cliente
router.post('/venta', async (req, res) => {
  try {
    const { cliente_id, monto, observacion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('cliente_id', sql.Int, cliente_id)
      .input('monto', sql.Decimal(12,2), monto)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO CuentaCorrienteClientes (cliente_id, tipo, monto, observacion)
              VALUES (@cliente_id, 'debito', @monto, @observacion)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;