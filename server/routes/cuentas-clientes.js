const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');

// ── GET /resumen — saldos de todos los clientes activos ──────────────
router.get('/resumen', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        c.id, c.nombre AS cliente, c.telefono, c.email,
        ISNULL(SUM(CASE WHEN cc.tipo = 'debito'  THEN cc.monto ELSE 0 END), 0) AS total_ventas,
        ISNULL(SUM(CASE WHEN cc.tipo = 'credito' THEN cc.monto ELSE 0 END), 0) AS total_cobrado,
        ISNULL(SUM(CASE WHEN cc.tipo = 'debito'  THEN cc.monto ELSE -cc.monto END), 0) AS saldo,
        COUNT(CASE WHEN cc.tipo = 'debito' THEN 1 END) AS cant_ventas,
        MAX(cc.fecha_hora) AS ultimo_movimiento
      FROM Clientes c
      LEFT JOIN CuentaCorrienteClientes cc ON c.id = cc.cliente_id
      WHERE c.activo = 1
      GROUP BY c.id, c.nombre, c.telefono, c.email
      ORDER BY c.nombre`);
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

// ── GET /:cliente_id — movimientos con saldo acumulado ───────────────
router.get('/:cliente_id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('cliente_id', sql.Int, req.params.cliente_id)
      .query(`
        SELECT
          cc.id, cc.tipo, cc.monto, cc.fecha,
          CONVERT(varchar, cc.fecha_hora, 120) AS fecha_hora,
          cc.observacion,
          fp.nombre  AS forma_pago,
          fp.es_cuenta_corriente,
          t.nombre   AS temporada,
          -- Detalle de venta vinculada
          sm.kilos, sm.precio_kilo, sm.destino,
          l.nombre   AS lote,
          -- Saldo acumulado (running total)
          SUM(CASE WHEN cc2.tipo = 'debito' THEN cc2.monto ELSE -cc2.monto END)
            OVER (PARTITION BY cc.cliente_id ORDER BY cc.fecha_hora, cc.id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_acumulado
        FROM CuentaCorrienteClientes cc
        LEFT JOIN FormasPago             fp ON cc.forma_pago_id      = fp.id
        LEFT JOIN Temporadas             t  ON cc.temporada_id        = t.id
        LEFT JOIN StockMercaderia        sm ON cc.stock_mercaderia_id = sm.id
        LEFT JOIN Lotes                  l  ON sm.lote_id             = l.id
        LEFT JOIN CuentaCorrienteClientes cc2 ON cc2.cliente_id = cc.cliente_id
        WHERE cc.cliente_id = @cliente_id
        GROUP BY cc.id, cc.tipo, cc.monto, cc.fecha, cc.fecha_hora,
                 cc.observacion, cc.cliente_id, fp.nombre, fp.es_cuenta_corriente,
                 t.nombre, sm.kilos, sm.precio_kilo, sm.destino, l.nombre
        ORDER BY cc.fecha_hora DESC, cc.id DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /cobro — registrar cobro (crédito) con egreso en Caja ───────
router.post('/cobro', async (req, res) => {
  const { cliente_id, monto, forma_pago_id, cheque_id, temporada_id, observacion } = req.body;
  if (!cliente_id || !monto || parseFloat(monto) <= 0)
    return res.status(400).json({ error: 'Cliente y monto son obligatorios' });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Nombre del cliente para concepto en Caja
    const cliRes = await new sql.Request(transaction)
      .input('id', sql.Int, cliente_id)
      .query('SELECT nombre FROM Clientes WHERE id = @id');
    const clienteNombre = cliRes.recordset[0]?.nombre || 'Cliente';

    // Crédito en cuenta corriente
    await new sql.Request(transaction)
      .input('cliente_id',   sql.Int,         cliente_id)
      .input('monto',        sql.Decimal(12,2), monto)
      .input('forma_pago_id',sql.Int,         forma_pago_id || null)
      .input('cheque_id',    sql.Int,         cheque_id || null)
      .input('temporada_id', sql.Int,         temporada_id || null)
      .input('observacion',  sql.NVarChar,    observacion || '')
      .query(`INSERT INTO CuentaCorrienteClientes
                (cliente_id, tipo, monto, forma_pago_id, cheque_id, temporada_id, observacion, fecha_hora)
              VALUES (@cliente_id, 'credito', @monto, @forma_pago_id, @cheque_id, @temporada_id, @observacion, GETDATE())`);

    // Ingreso en Caja
    await new sql.Request(transaction)
      .input('concepto',     sql.NVarChar,    `Cobro CC: ${clienteNombre}${observacion ? ' - ' + observacion : ''}`)
      .input('monto',        sql.Decimal(12,2), monto)
      .input('forma_pago_id',sql.Int,         forma_pago_id || null)
      .input('temporada_id', sql.Int,         temporada_id || null)
      .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id)
              VALUES ('ingreso', @concepto, @monto, @forma_pago_id, @temporada_id)`);

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
      .query('DELETE FROM CuentaCorrienteClientes WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
