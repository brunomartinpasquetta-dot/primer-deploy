const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');
const PDFDocument = require('pdfkit');

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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
        SELECT ri.*, d.nombre AS deposito,
               sl.codigo_interno AS sub_lote_codigo,
               cc.nombre AS categoria,
               sc.nombre AS sub_categoria,
               sl.etapa  AS sub_lote_etapa
        FROM RemitoItems ri
        LEFT JOIN Depositos d                   ON ri.deposito_id        = d.id
        LEFT JOIN LotesMercaderia sl            ON ri.sub_lote_id        = sl.id
        LEFT JOIN CategoriasClasificacion cc     ON sl.categoria_clasif_id = cc.id
        LEFT JOIN SubCategoriasClasificacion sc  ON sl.sub_categoria_id    = sc.id
        WHERE ri.remito_id = @id
        ORDER BY ri.id`);

    // Datos de empresa para encabezado de remito
    const empresaRes = await pool.request()
      .query('SELECT TOP 1 * FROM ConfiguracionEmpresa');
    const empresa = empresaRes.recordset[0] || {};

    res.json({ ...remRes.recordset[0], items: itemRes.recordset, empresa });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── PATCH /:id/estado — marcar cobrado / anulado ─────────────────
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!['cobrado', 'pendiente_cc', 'anulado'].includes(estado))
    return res.status(400).json({ error: 'Estado inválido' });
  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const r1 = new sql.Request(transaction);
      await r1.input('id', sql.Int, req.params.id).input('estado', sql.NVarChar, estado)
        .query(`UPDATE Remitos SET estado = @estado WHERE id = @id`);

      const r2 = new sql.Request(transaction);
      await r2.input('id', sql.Int, req.params.id).input('estado', sql.NVarChar, estado)
        .query(`UPDATE MovimientosDeposito SET estado_cobro = @estado WHERE remito_id = @id`);

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── GET /:id/pdf — Remito en PDF ─────────────────────────────────
router.get('/:id/pdf', async (req, res) => {
  try {
    const pool = await getPool();
    const remRes = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT r.*, c.nombre AS cliente, c.direccion AS cliente_direccion,
               c.telefono AS cliente_telefono,
               t.nombre AS temporada, fp.nombre AS forma_pago
        FROM Remitos r
        LEFT JOIN Clientes   c  ON r.cliente_id    = c.id
        LEFT JOIN Temporadas t  ON r.temporada_id  = t.id
        LEFT JOIN FormasPago fp ON r.forma_pago_id = fp.id
        WHERE r.id = @id`);
    if (!remRes.recordset.length) return res.status(404).json({ error: 'Remito no encontrado' });
    const rem = remRes.recordset[0];

    const itemRes = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT ri.kilos, ri.precio_kilo, ri.subtotal,
               sl.codigo_interno AS sub_lote_codigo,
               cc.nombre AS categoria,
               sc.nombre AS sub_categoria,
               d.nombre  AS deposito
        FROM RemitoItems ri
        LEFT JOIN Depositos d                   ON ri.deposito_id        = d.id
        LEFT JOIN LotesMercaderia sl            ON ri.sub_lote_id        = sl.id
        LEFT JOIN CategoriasClasificacion cc     ON sl.categoria_clasif_id = cc.id
        LEFT JOIN SubCategoriasClasificacion sc  ON sl.sub_categoria_id    = sc.id
        WHERE ri.remito_id = @id
        ORDER BY ri.id`);
    const items = itemRes.recordset;

    const empRes = await pool.request().query('SELECT TOP 1 * FROM ConfiguracionEmpresa');
    const emp = empRes.recordset[0] || {};

    const fmtMoney = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fechaRem = rem.fecha ? new Date(rem.fecha) : new Date();

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=remito-${rem.numero || rem.id}.pdf`);
    doc.pipe(res);

    // ── Header empresa ──
    doc.fontSize(18).font('Helvetica-Bold').text('COSECHA', { continued: true })
       .font('Helvetica').text(' - Sistema de Cultivos');
    if (emp.razon_social) doc.fontSize(10).text(emp.razon_social);
    if (emp.cuit) doc.text(`CUIT: ${emp.cuit}`);
    if (emp.direccion) doc.text(`${emp.direccion}${emp.localidad ? ', ' + emp.localidad : ''}${emp.provincia ? ', ' + emp.provincia : ''}`);
    doc.moveDown();

    // ── Título ──
    doc.fontSize(16).font('Helvetica-Bold').text('REMITO DE VENTA');
    doc.fontSize(11).font('Helvetica')
       .text(`N\u00b0: ${rem.numero || '-'}`)
       .text(`Fecha: ${fechaRem.toLocaleDateString('es-AR')}`)
       .text(`Temporada: ${rem.temporada || '-'}`)
       .text(`Estado: ${rem.estado || '-'}`);
    doc.moveDown(0.5);

    // ── Datos del cliente ──
    doc.fontSize(12).font('Helvetica-Bold').text('CLIENTE');
    doc.fontSize(11).font('Helvetica')
       .text(`Nombre: ${rem.cliente || '-'}`)
       .text(`Dirección: ${rem.cliente_direccion || '-'}`)
       .text(`Teléfono: ${rem.cliente_telefono || '-'}`);
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica')
       .text(`Forma de pago: ${rem.forma_pago || '-'}`)
       .text(`Destino: ${rem.destino || '-'}`);
    if (rem.observacion) doc.text(`Observación: ${rem.observacion}`);
    doc.moveDown();

    // ── Tabla de items ──
    doc.fontSize(13).font('Helvetica-Bold').text('DETALLE');
    doc.moveDown(0.3);
    const tableTop = doc.y;
    const col = [50, 170, 270, 350, 430];
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Sub-lote / Categoría', col[0], tableTop);
    doc.text('Depósito', col[1], tableTop);
    doc.text('Kilos', col[2], tableTop);
    doc.text('Precio/Kg', col[3], tableTop);
    doc.text('Subtotal', col[4], tableTop);
    doc.moveTo(50, tableTop + 14).lineTo(540, tableTop + 14).stroke();

    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9);
    items.forEach(item => {
      if (y > 720) { doc.addPage(); y = 50; }
      const desc = [item.sub_lote_codigo, item.categoria, item.sub_categoria].filter(Boolean).join(' — ');
      doc.text(desc || '-', col[0], y, { width: 115 });
      doc.text(item.deposito || '-', col[1], y, { width: 95 });
      doc.text(parseFloat(item.kilos || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }) + ' kg', col[2], y);
      doc.text(item.precio_kilo ? fmtMoney(item.precio_kilo) : '-', col[3], y);
      doc.text(item.subtotal ? fmtMoney(item.subtotal) : '-', col[4], y);
      y += 16;
    });

    doc.moveTo(50, y).lineTo(540, y).stroke();
    y += 8;

    // ── Totales ──
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Total Kilos:', col[0], y);
    doc.text(parseFloat(rem.kilos_total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }) + ' kg', col[2], y);
    y += 18;
    doc.fontSize(12);
    doc.text('TOTAL:', col[0], y);
    doc.text(fmtMoney(rem.total), col[4], y);
    doc.y = y + 40;

    // ── Firmas ──
    doc.fontSize(11).font('Helvetica');
    doc.text('Recibí conforme ___________________________________________');
    doc.moveDown();
    doc.text('Firma: _____________________    Aclaración: _____________________');

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
module.exports.siguienteNumero = siguienteNumero;
