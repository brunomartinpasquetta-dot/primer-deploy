const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');

// ── GET /resumen — saldos de todos los proveedores activos ───────────
router.get('/resumen', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        p.id, p.nombre AS proveedor, p.telefono, p.email,
        ISNULL(SUM(CASE WHEN cc.tipo = 'debito'  THEN cc.monto ELSE 0 END), 0) AS total_compras,
        ISNULL(SUM(CASE WHEN cc.tipo = 'credito' THEN cc.monto ELSE 0 END), 0) AS total_pagado,
        ISNULL(SUM(CASE WHEN cc.tipo = 'debito'  THEN cc.monto ELSE -cc.monto END), 0) AS saldo,
        COUNT(CASE WHEN cc.tipo = 'debito' THEN 1 END) AS cant_compras,
        MAX(cc.fecha_hora) AS ultimo_movimiento
      FROM Proveedores p
      LEFT JOIN CuentaCorrienteProveedores cc ON p.id = cc.proveedor_id
      WHERE p.activo = 1
      GROUP BY p.id, p.nombre, p.telefono, p.email
      ORDER BY p.nombre`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /formas-pago ─────────────────────────────────────────────────
router.get('/formas-pago', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT id, nombre, es_cuenta_corriente FROM FormasPago WHERE activo = 1 ORDER BY nombre`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:proveedor_id — movimientos con saldo acumulado ─────────────
router.get('/:proveedor_id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('proveedor_id', sql.Int, req.params.proveedor_id)
      .query(`
        SELECT
          cc.id, cc.tipo, cc.monto, cc.fecha,
          CONVERT(varchar, cc.fecha_hora, 120) AS fecha_hora,
          cc.observacion,
          fp.nombre  AS forma_pago,
          fp.es_cuenta_corriente,
          t.nombre   AS temporada,
          -- Detalle de compra vinculada
          c.id       AS compra_id,
          c.fecha    AS compra_fecha,
          -- Saldo acumulado (running total)
          SUM(CASE WHEN cc2.tipo = 'debito' THEN cc2.monto ELSE -cc2.monto END)
            OVER (PARTITION BY cc.proveedor_id ORDER BY cc.fecha_hora, cc.id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_acumulado
        FROM CuentaCorrienteProveedores cc
        LEFT JOIN FormasPago                fp ON cc.forma_pago_id  = fp.id
        LEFT JOIN Temporadas                t  ON cc.temporada_id   = t.id
        LEFT JOIN Compras                   c  ON cc.compra_id      = c.id
        LEFT JOIN CuentaCorrienteProveedores cc2 ON cc2.proveedor_id = cc.proveedor_id
        WHERE cc.proveedor_id = @proveedor_id
        GROUP BY cc.id, cc.tipo, cc.monto, cc.fecha, cc.fecha_hora,
                 cc.observacion, cc.proveedor_id, fp.nombre, fp.es_cuenta_corriente,
                 t.nombre, c.id, c.fecha
        ORDER BY cc.fecha_hora DESC, cc.id DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /pago — registrar pago (crédito) con egreso en Caja ─────────
router.post('/pago', async (req, res) => {
  const { proveedor_id, monto, forma_pago_id, cheque_id, temporada_id, observacion } = req.body;
  if (!proveedor_id || !monto || parseFloat(monto) <= 0)
    return res.status(400).json({ error: 'Proveedor y monto son obligatorios' });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Nombre del proveedor para concepto en Caja
    const provRes = await new sql.Request(transaction)
      .input('id', sql.Int, proveedor_id)
      .query('SELECT nombre FROM Proveedores WHERE id = @id');
    const provNombre = provRes.recordset[0]?.nombre || 'Proveedor';

    // Crédito en cuenta corriente
    await new sql.Request(transaction)
      .input('proveedor_id', sql.Int,         proveedor_id)
      .input('monto',        sql.Decimal(12,2), monto)
      .input('forma_pago_id',sql.Int,         forma_pago_id || null)
      .input('cheque_id',    sql.Int,         cheque_id || null)
      .input('temporada_id', sql.Int,         temporada_id || null)
      .input('observacion',  sql.NVarChar,    observacion || '')
      .query(`INSERT INTO CuentaCorrienteProveedores
                (proveedor_id, tipo, monto, forma_pago_id, cheque_id, temporada_id, observacion, fecha_hora)
              VALUES (@proveedor_id, 'credito', @monto, @forma_pago_id, @cheque_id, @temporada_id, @observacion, GETDATE())`);

    // Egreso en Caja
    await new sql.Request(transaction)
      .input('concepto',       sql.NVarChar,    `Pago CC: ${provNombre}${observacion ? ' - ' + observacion : ''}`)
      .input('monto',          sql.Decimal(12,2), monto)
      .input('forma_pago_id',  sql.Int,         forma_pago_id || null)
      .input('temporada_id',   sql.Int,         temporada_id || null)
      .input('usuario_nombre', sql.NVarChar,    req.user ? req.user.nombre : null)
      .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id, usuario_nombre)
              VALUES ('egreso', @concepto, @monto, @forma_pago_id, @temporada_id, @usuario_nombre)`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id — anular movimiento (solo admin) ─────────────────────
router.delete('/:id', async (req, res) => {
  if (!req.user || req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Solo administradores pueden anular movimientos' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM CuentaCorrienteProveedores WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
