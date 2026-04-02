const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');

// ── Generar próximo número de remito ─────────────────────────────
async function siguienteNumero(pool) {
  const res = await pool.request().query(
    `SELECT TOP 1 numero FROM Remitos ORDER BY id DESC`
  );
  if (!res.recordset.length) return 'R-0001';
  const last = res.recordset[0].numero || '';
  const m = last.match(/(\d+)$/);
  const n = m ? parseInt(m[1]) + 1 : 1;
  return 'R-' + String(n).padStart(4, '0');
}

// ── GET /siguiente-numero ────────────────────────────────────────
router.get('/siguiente-numero', async (req, res) => {
  try {
    const pool = await getPool();
    res.json({ numero: await siguienteNumero(pool) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET / — listar remitos ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { temporada_id, estado, cliente_id, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id) { where += ' AND r.temporada_id = @tid';  dbReq.input('tid',  sql.Int,      parseInt(temporada_id)); }
    if (estado)       { where += ' AND r.estado = @estado';     dbReq.input('estado', sql.NVarChar, estado); }
    if (cliente_id)   { where += ' AND r.cliente_id = @cid';    dbReq.input('cid',  sql.Int,      parseInt(cliente_id)); }
    if (desde)        { where += ' AND r.fecha >= @desde';      dbReq.input('desde', sql.Date,    desde); }
    if (hasta)        { where += ' AND r.fecha <= @hasta';      dbReq.input('hasta', sql.Date,    hasta); }

    const result = await dbReq.query(`
      SELECT
        r.id, r.numero, r.fecha, r.estado, r.total, r.kilos_total, r.destino,
        r.observacion, r.usuario_nombre, r.creado_en,
        c.nombre  AS cliente,
        t.nombre  AS temporada,
        fp.nombre AS forma_pago,
        (SELECT COUNT(*) FROM RemitoItems ri WHERE ri.remito_id = r.id) AS cant_items
      FROM Remitos r
      LEFT JOIN Clientes    c  ON r.cliente_id    = c.id
      LEFT JOIN Temporadas  t  ON r.temporada_id  = t.id
      LEFT JOIN FormasPago  fp ON r.forma_pago_id = fp.id
      WHERE ${where}
      ORDER BY r.id DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id — detalle con items ─────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const remRes = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT r.*, c.nombre AS cliente, t.nombre AS temporada, fp.nombre AS forma_pago
        FROM Remitos r
        LEFT JOIN Clientes   c  ON r.cliente_id    = c.id
        LEFT JOIN Temporadas t  ON r.temporada_id  = t.id
        LEFT JOIN FormasPago fp ON r.forma_pago_id = fp.id
        WHERE r.id = @id`);
    if (!remRes.recordset.length) return res.status(404).json({ error: 'Remito no encontrado' });

    const itemRes = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT ri.*, d.nombre AS deposito
        FROM RemitoItems ri
        LEFT JOIN Depositos d ON ri.deposito_id = d.id
        WHERE ri.remito_id = @id
        ORDER BY ri.id`);

    res.json({ ...remRes.recordset[0], items: itemRes.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id/estado — marcar cobrado / anulado ─────────────────
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!['cobrado', 'pendiente_cc', 'anulado'].includes(estado))
    return res.status(400).json({ error: 'Estado inválido' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',     sql.Int,      req.params.id)
      .input('estado', sql.NVarChar, estado)
      .query(`UPDATE Remitos SET estado = @estado WHERE id = @id;
              UPDATE MovimientosDeposito SET estado_cobro = @estado WHERE remito_id = @id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.siguienteNumero = siguienteNumero;
