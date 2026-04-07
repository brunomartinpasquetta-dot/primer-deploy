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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
          l.nombre   AS parcela,
          -- Saldo acumulado (running total)
          SUM(CASE WHEN cc.tipo = 'debito' THEN cc.monto ELSE -cc.monto END)
            OVER (ORDER BY cc.fecha_hora, cc.id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_acumulado
        FROM CuentaCorrienteClientes cc
        LEFT JOIN FormasPago             fp ON cc.forma_pago_id      = fp.id
        LEFT JOIN Temporadas             t  ON cc.temporada_id        = t.id
        LEFT JOIN StockMercaderia        sm ON cc.stock_mercaderia_id = sm.id
        LEFT JOIN Parcelas               l  ON sm.parcela_id          = l.id
        WHERE cc.cliente_id = @cliente_id
        ORDER BY cc.fecha_hora DESC, cc.id DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
      .input('concepto',       sql.NVarChar,    `Cobro CC: ${clienteNombre}${observacion ? ' - ' + observacion : ''}`)
      .input('monto',          sql.Decimal(12,2), monto)
      .input('forma_pago_id',  sql.Int,         forma_pago_id || null)
      .input('temporada_id',   sql.Int,         temporada_id || null)
      .input('usuario_nombre', sql.NVarChar,    req.user ? req.user.nombre : null)
      .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id, usuario_nombre)
              VALUES ('ingreso', @concepto, @monto, @forma_pago_id, @temporada_id, @usuario_nombre)`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── POST /:id/anular — anular movimiento (solo admin, soft-delete) ───
router.post('/:id/anular', async (req, res) => {
  if (!req.user || req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Solo administradores pueden anular movimientos' });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const movId = parseInt(req.params.id);
    const motivo = req.body.motivo || 'Anulación manual';

    const movRes = await new sql.Request(transaction)
      .input('id', sql.Int, movId)
      .query('SELECT id, estado, cliente_id, tipo, monto, observacion FROM CuentaCorrienteClientes WHERE id = @id');
    if (!movRes.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'Movimiento no encontrado' }); }
    if (movRes.recordset[0].estado === 'anulada') { await transaction.rollback(); return res.status(400).json({ error: 'El movimiento ya está anulado' }); }

    const mov = movRes.recordset[0];

    // Insertar movimiento compensatorio inverso
    const tipoInverso = mov.tipo === 'debito' ? 'credito' : 'debito';
    await new sql.Request(transaction)
      .input('cliente_id', sql.Int, mov.cliente_id)
      .input('tipo_inverso', sql.NVarChar, tipoInverso)
      .input('monto', sql.Decimal(12,2), mov.monto)
      .input('observacion', sql.NVarChar, 'Anulación mov #' + movId + ' — ' + motivo)
      .query(`INSERT INTO CuentaCorrienteClientes (cliente_id, tipo, monto, observacion, fecha_hora)
              VALUES (@cliente_id, @tipo_inverso, @monto, @observacion, GETDATE())`);

    // Marcar original como anulada
    await new sql.Request(transaction)
      .input('id', sql.Int, movId)
      .query("UPDATE CuentaCorrienteClientes SET estado = 'anulada' WHERE id = @id");

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
