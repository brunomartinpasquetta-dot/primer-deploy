const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Resumen de cuenta corriente por proveedor
router.get('/resumen', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT p.id, p.nombre AS proveedor,
              ISNULL(SUM(CASE WHEN cc.tipo = 'debito' THEN cc.monto ELSE 0 END), 0) AS total_compras,
              ISNULL(SUM(CASE WHEN cc.tipo = 'credito' THEN cc.monto ELSE 0 END), 0) AS total_pagado,
              ISNULL(SUM(CASE WHEN cc.tipo = 'debito' THEN cc.monto ELSE -cc.monto END), 0) AS saldo
              FROM Proveedores p
              LEFT JOIN CuentaCorrienteProveedores cc ON p.id = cc.proveedor_id
              WHERE p.activo = 1
              GROUP BY p.id, p.nombre
              ORDER BY p.nombre`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Movimientos de un proveedor
router.get('/:proveedor_id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('proveedor_id', sql.Int, req.params.proveedor_id)
      .query(`SELECT cc.id, cc.tipo, cc.monto, cc.fecha, cc.observacion,
              fp.nombre AS forma_pago
              FROM CuentaCorrienteProveedores cc
              LEFT JOIN FormasPago fp ON cc.forma_pago_id = fp.id
              WHERE cc.proveedor_id = @proveedor_id
              ORDER BY cc.fecha DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar pago a proveedor
router.post('/pago', async (req, res) => {
  const { proveedor_id, monto, forma_pago_id, cheque_id, observacion } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const req1 = new sql.Request(transaction);
    await req1
      .input('proveedor_id', sql.Int, proveedor_id)
      .input('monto', sql.Decimal(12,2), monto)
      .input('forma_pago_id', sql.Int, forma_pago_id || null)
      .input('cheque_id', sql.Int, cheque_id || null)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO CuentaCorrienteProveedores (proveedor_id, tipo, monto, forma_pago_id, cheque_id, observacion)
              VALUES (@proveedor_id, 'credito', @monto, @forma_pago_id, @cheque_id, @observacion)`);
    const req2 = new sql.Request(transaction);
    await req2
      .input('concepto', sql.NVarChar, 'Pago a proveedor')
      .input('monto', sql.Decimal(12,2), monto)
      .input('forma_pago_id', sql.Int, forma_pago_id || null)
      .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id) VALUES ('egreso', @concepto, @monto, @forma_pago_id)`);
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;