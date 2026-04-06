const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// ── Movimientos de caja ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { temporada_id, desde, hasta, medio_pago } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id) { where += ' AND c.temporada_id = @temporada_id'; dbReq.input('temporada_id', sql.Int,  parseInt(temporada_id)); }
    if (desde)        { where += ' AND c.fecha >= @desde';              dbReq.input('desde',        sql.Date, desde); }
    if (hasta)        { where += ' AND c.fecha <= @hasta';              dbReq.input('hasta',        sql.Date, hasta); }
    if (medio_pago)   { where += ' AND c.medio_pago = @medio_pago';    dbReq.input('medio_pago',   sql.NVarChar, medio_pago); }

    const result = await dbReq.query(`
      SELECT c.id, c.tipo, c.concepto, c.monto, c.fecha,
             c.medio_pago, c.cheque_id, c.observacion,
             c.usuario_nombre,
             fp.nombre AS forma_pago,
             t.nombre  AS temporada,
             ch.numero AS cheque_numero,
             ch.banco  AS cheque_banco
      FROM Caja c
      LEFT JOIN FormasPago fp ON c.forma_pago_id = fp.id
      LEFT JOIN Temporadas t  ON c.temporada_id  = t.id
      LEFT JOIN Cheques    ch ON c.cheque_id      = ch.id
      WHERE ${where}
      ORDER BY c.fecha DESC, c.id DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Resumen de caja ─────────────────────────────────────────────
router.get('/resumen', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id) { where += ' AND temporada_id = @temporada_id'; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }

    const result = await dbReq.query(`
      SELECT
        ISNULL(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS total_ingresos,
        ISNULL(SUM(CASE WHEN tipo = 'egreso'  THEN monto ELSE 0 END), 0) AS total_egresos,
        ISNULL(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) AS saldo,
        ISNULL(SUM(CASE WHEN tipo = 'ingreso' AND medio_pago = 'efectivo'      THEN monto ELSE 0 END), 0) AS ingresos_efectivo,
        ISNULL(SUM(CASE WHEN tipo = 'ingreso' AND medio_pago = 'transferencia' THEN monto ELSE 0 END), 0) AS ingresos_transferencia,
        ISNULL(SUM(CASE WHEN tipo = 'ingreso' AND medio_pago = 'cheque'        THEN monto ELSE 0 END), 0) AS ingresos_cheque
      FROM Caja WHERE ${where}`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Registrar movimiento manual ─────────────────────────────────
// medio_pago: efectivo | transferencia | cheque
// cheque solo se acepta si tipo=ingreso y el cheque ya está acreditado
router.post('/', async (req, res) => {
  try {
    const { tipo, concepto, monto, medio_pago, forma_pago_id, cheque_id,
            fecha, temporada_id, observacion } = req.body;

    if (!tipo || !['ingreso','egreso'].includes(tipo))
      return res.status(400).json({ error: 'tipo debe ser ingreso o egreso' });
    if (!concepto) return res.status(400).json({ error: 'Concepto es obligatorio' });
    if (!monto || parseFloat(monto) <= 0)
      return res.status(400).json({ error: 'Monto inválido' });

    const medioVal = medio_pago || 'efectivo';

    // Guard: if paying with cheque, must already be acreditado
    if (cheque_id) {
      const pool2 = await getPool();
      const chk = await pool2.request()
        .input('id', sql.Int, cheque_id)
        .query('SELECT estado FROM Cheques WHERE id = @id');
      if (!chk.recordset.length) return res.status(400).json({ error: 'Cheque no encontrado' });
      if (chk.recordset[0].estado !== 'acreditado') {
        return res.status(400).json({ error: 'Solo cheques acreditados pueden impactar caja directamente. Use el flujo de acreditación.' });
      }
    }

    const usuarioNombre = req.user ? req.user.nombre : null;
    const pool = await getPool();
    await pool.request()
      .input('tipo',            sql.NVarChar,    tipo)
      .input('concepto',        sql.NVarChar,    concepto    || '')
      .input('monto',           sql.Decimal(12,2), parseFloat(monto))
      .input('medio_pago',      sql.NVarChar,    medioVal)
      .input('forma_pago_id',   sql.Int,         forma_pago_id || null)
      .input('cheque_id',       sql.Int,         cheque_id     || null)
      .input('fecha',           sql.Date,        fecha || new Date())
      .input('temporada_id',    sql.Int,         temporada_id  || null)
      .input('observacion',     sql.NVarChar,    observacion   || '')
      .input('usuario_nombre',  sql.NVarChar,    usuarioNombre)
      .query(`INSERT INTO Caja
                (tipo, concepto, monto, medio_pago, forma_pago_id, cheque_id, fecha, temporada_id, observacion, usuario_nombre)
              VALUES
                (@tipo, @concepto, @monto, @medio_pago, @forma_pago_id, @cheque_id, @fecha, @temporada_id, @observacion, @usuario_nombre)`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Formas de pago ──────────────────────────────────────────────
router.get('/formas-pago', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre FROM FormasPago WHERE activo = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
