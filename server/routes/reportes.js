const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// ── helpers ───────────────────────────────────────────────────────────────────

function defaultDesde(desde) {
  return desde ? new Date(desde) : new Date('2020-01-01');
}

function defaultHasta(hasta) {
  if (hasta) {
    const d = new Date(hasta);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

async function enviarExcel(res, rows, sheetName, titulo) {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(sheetName);
    if (rows.length === 0) {
      ws.addRow(['Sin datos']);
    } else {
      const cols = Object.keys(rows[0]);
      ws.columns = cols.map(c => ({ header: c, key: c, width: 20 }));
      ws.getRow(1).font = { bold: true };
      ws.addRows(rows);
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${titulo}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).send('Error generando Excel: ' + err.message);
  }
}

function enviarPDF(res, rows, titulo) {
  try {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${titulo}.pdf"`);
    doc.pipe(res);

    // Encabezado
    doc.fontSize(16).font('Helvetica-Bold').text(titulo, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(
      'Generado el ' + new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      { align: 'center' }
    );
    doc.moveDown(0.8);

    if (rows.length === 0) {
      doc.fontSize(11).text('Sin datos para los filtros seleccionados.', { align: 'center' });
      doc.end();
      return;
    }

    const cols = Object.keys(rows[0]);
    const colWidth = Math.floor((doc.page.width - 80) / cols.length);

    // Encabezado de tabla
    const startX = 40;
    let y = doc.y;
    doc.rect(startX, y, doc.page.width - 80, 16).fill('#2D5016');
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    cols.forEach((col, i) => {
      doc.text(col.toUpperCase(), startX + i * colWidth + 2, y + 3, { width: colWidth - 4, lineBreak: false });
    });
    doc.fillColor('black').font('Helvetica').fontSize(8);
    y += 18;

    rows.forEach((row, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
      }
      if (idx % 2 === 0) {
        doc.rect(startX, y, doc.page.width - 80, 14).fill('#f5f5f5');
      }
      doc.fillColor('black');
      cols.forEach((col, i) => {
        const val = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
        doc.text(val, startX + i * colWidth + 2, y + 2, { width: colWidth - 4, lineBreak: false });
      });
      y += 15;
    });

    doc.end();
  } catch (err) {
    res.status(500).send('Error generando PDF: ' + err.message);
  }
}

// ── GET /api/reportes/cosecha ─────────────────────────────────────────────────

router.get('/cosecha', async (req, res) => {
  try {
    const { desde, hasta, parcela_id, juntador_id, formato } = req.query;
    const pool = await getPool();
    const dbReq = pool.request()
      .input('desde', sql.DateTime, defaultDesde(desde))
      .input('hasta', sql.DateTime, defaultHasta(hasta));

    let where = 'j.fecha_hora BETWEEN @desde AND @hasta';
    if (parcela_id) {
      dbReq.input('parcela_id', sql.Int, parseInt(parcela_id));
      where += ' AND j.parcela_id = @parcela_id';
    }
    if (juntador_id) {
      dbReq.input('juntador_id', sql.Int, parseInt(juntador_id));
      where += ' AND j.juntador_id = @juntador_id';
    }

    const result = await dbReq.query(`
      SELECT
        CONVERT(varchar, j.fecha_hora, 103) AS fecha,
        jt.nombre + ' ' + jt.apellido AS cosechador,
        l.nombre AS parcela,
        j.kilos,
        j.destino
      FROM Juntadas j
      LEFT JOIN Parcelas l ON j.parcela_id = l.id
      LEFT JOIN Juntadores jt ON j.juntador_id = jt.id
      WHERE ${where}
      ORDER BY j.fecha_hora DESC
    `);

    const rows = result.recordset;
    if (formato === 'excel') return enviarExcel(res, rows, 'Cosecha', 'reporte-cosecha');
    if (formato === 'pdf')   return enviarPDF(res, rows, 'Reporte de Cosecha');
    res.json({ rows });
  } catch (err) {
    res.json({ error: err.message, rows: [] });
  }
});

// ── GET /api/reportes/despalillado ────────────────────────────────────────────

router.get('/despalillado', async (req, res) => {
  try {
    const { desde, hasta, formato } = req.query;
    const pool = await getPool();
    const result = await pool.request()
      .input('desde', sql.DateTime, defaultDesde(desde))
      .input('hasta', sql.DateTime, defaultHasta(hasta))
      .query(`
        SELECT
          CONVERT(varchar, d.fecha_hora, 103) AS fecha,
          jt.nombre + ' ' + jt.apellido AS trabajador,
          l.nombre AS parcela,
          d.kilos
        FROM Despalillados d
        LEFT JOIN Parcelas l ON d.parcela_id = l.id
        LEFT JOIN Juntadores jt ON d.juntador_id = jt.id
        WHERE d.fecha_hora BETWEEN @desde AND @hasta
        ORDER BY d.fecha_hora DESC
      `);

    const rows = result.recordset;
    if (formato === 'excel') return enviarExcel(res, rows, 'Despalillado', 'reporte-despalillado');
    if (formato === 'pdf')   return enviarPDF(res, rows, 'Reporte de Despalillado');
    res.json({ rows });
  } catch (err) {
    res.json({ error: err.message, rows: [] });
  }
});

// ── GET /api/reportes/caja ────────────────────────────────────────────────────

router.get('/caja', async (req, res) => {
  try {
    const { desde, hasta, tipo, formato } = req.query;
    const pool = await getPool();
    const dbReq = pool.request()
      .input('desde', sql.Date, defaultDesde(desde))
      .input('hasta', sql.Date, defaultHasta(hasta));

    let where = 'fecha BETWEEN @desde AND @hasta';
    if (tipo && tipo !== 'todos') {
      dbReq.input('tipo', sql.NVarChar, tipo);
      where += ' AND tipo = @tipo';
    }

    const result = await dbReq.query(`
      SELECT
        CONVERT(varchar, fecha, 103) AS fecha,
        tipo,
        descripcion,
        forma_pago,
        monto
      FROM Caja
      WHERE ${where}
      ORDER BY fecha DESC
    `);

    const rows = result.recordset;
    if (formato === 'excel') return enviarExcel(res, rows, 'Caja', 'reporte-caja');
    if (formato === 'pdf')   return enviarPDF(res, rows, 'Reporte de Caja');
    res.json({ rows });
  } catch (err) {
    res.json({ error: err.message, rows: [] });
  }
});

// ── GET /api/reportes/gastos ──────────────────────────────────────────────────

router.get('/gastos', async (req, res) => {
  try {
    const { desde, hasta, formato } = req.query;
    const pool = await getPool();
    const result = await pool.request()
      .input('desde', sql.Date, defaultDesde(desde))
      .input('hasta', sql.Date, defaultHasta(hasta))
      .query(`
        SELECT
          CONVERT(varchar, g.fecha, 103) AS fecha,
          c.nombre AS categoria,
          g.descripcion,
          g.forma_pago,
          g.monto
        FROM Gastos g
        LEFT JOIN CategoriasGasto c ON g.categoria_id = c.id
        WHERE g.fecha BETWEEN @desde AND @hasta
        ORDER BY g.fecha DESC
      `);

    const rows = result.recordset;
    if (formato === 'excel') return enviarExcel(res, rows, 'Gastos', 'reporte-gastos');
    if (formato === 'pdf')   return enviarPDF(res, rows, 'Reporte de Gastos');
    res.json({ rows });
  } catch (err) {
    res.json({ error: err.message, rows: [] });
  }
});

// ── GET /api/reportes/cheques ─────────────────────────────────────────────────

router.get('/cheques', async (req, res) => {
  try {
    const { desde, hasta, estado, formato } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();

    let conditions = [];
    if (estado) {
      dbReq.input('estado', sql.NVarChar, estado);
      conditions.push('c.estado = @estado');
    }
    if (desde && hasta) {
      dbReq.input('desde', sql.Date, defaultDesde(desde));
      dbReq.input('hasta', sql.Date, defaultHasta(hasta));
      conditions.push('c.fecha_vencimiento BETWEEN @desde AND @hasta');
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await dbReq.query(`
      SELECT
        c.numero,
        c.tipo,
        c.tipo_cheque,
        c.banco,
        c.monto,
        CONVERT(varchar, c.fecha_emision, 103)     AS fecha_emision,
        CONVERT(varchar, c.fecha_vencimiento, 103) AS fecha_vencimiento,
        c.estado,
        p.nombre AS proveedor
      FROM Cheques c
      LEFT JOIN Proveedores p ON c.proveedor_id = p.id
      ${where}
      ORDER BY c.fecha_vencimiento ASC
    `);

    const rows = result.recordset;
    if (formato === 'excel') return enviarExcel(res, rows, 'Cheques', 'reporte-cheques');
    if (formato === 'pdf')   return enviarPDF(res, rows, 'Reporte de Cheques');
    res.json({ rows });
  } catch (err) {
    res.json({ error: err.message, rows: [] });
  }
});

// ── GET /api/reportes/pagos ───────────────────────────────────────────────────

router.get('/pagos', async (req, res) => {
  try {
    const { desde, hasta, juntador_id, formato } = req.query;
    const pool = await getPool();
    const dbReq = pool.request()
      .input('desde', sql.Date, defaultDesde(desde))
      .input('hasta', sql.Date, defaultHasta(hasta));

    let where = 'p.fecha BETWEEN @desde AND @hasta';
    if (juntador_id) {
      dbReq.input('juntador_id', sql.Int, parseInt(juntador_id));
      where += ' AND p.juntador_id = @juntador_id';
    }

    const result = await dbReq.query(`
      SELECT
        CONVERT(varchar, p.fecha, 103) AS fecha,
        j.nombre + ' ' + j.apellido AS trabajador,
        p.tipo,
        p.descripcion,
        p.monto
      FROM Pagos p
      LEFT JOIN Juntadores j ON p.juntador_id = j.id
      WHERE ${where}
      ORDER BY p.fecha DESC
    `);

    const rows = result.recordset;
    if (formato === 'excel') return enviarExcel(res, rows, 'Pagos', 'reporte-pagos');
    if (formato === 'pdf')   return enviarPDF(res, rows, 'Reporte de Pagos');
    res.json({ rows });
  } catch (err) {
    res.json({ error: err.message, rows: [] });
  }
});

// ── GET /api/reportes/compras ─────────────────────────────────────────────────

router.get('/compras', async (req, res) => {
  try {
    const { desde, hasta, proveedor_id, formato } = req.query;
    const pool = await getPool();
    const dbReq = pool.request()
      .input('desde', sql.Date, defaultDesde(desde))
      .input('hasta', sql.Date, defaultHasta(hasta));

    let where = 'c.fecha BETWEEN @desde AND @hasta';
    if (proveedor_id) {
      dbReq.input('proveedor_id', sql.Int, parseInt(proveedor_id));
      where += ' AND c.proveedor_id = @proveedor_id';
    }

    const result = await dbReq.query(`
      SELECT
        CONVERT(varchar, c.fecha, 103) AS fecha,
        p.nombre AS proveedor,
        c.descripcion,
        c.forma_pago,
        c.monto
      FROM Compras c
      LEFT JOIN Proveedores p ON c.proveedor_id = p.id
      WHERE ${where}
      ORDER BY c.fecha DESC
    `);

    const rows = result.recordset;
    if (formato === 'excel') return enviarExcel(res, rows, 'Compras', 'reporte-compras');
    if (formato === 'pdf')   return enviarPDF(res, rows, 'Reporte de Compras');
    res.json({ rows });
  } catch (err) {
    res.json({ error: err.message, rows: [] });
  }
});

// ── GET /api/reportes/stock-insumos ──────────────────────────────────────────

router.get('/stock-insumos', async (req, res) => {
  try {
    const { formato } = req.query;
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT nombre, tipo, stock_actual, unidad
      FROM Productos
      WHERE activo = 1
      ORDER BY tipo, nombre
    `);

    const rows = result.recordset;
    if (formato === 'excel') return enviarExcel(res, rows, 'Stock', 'reporte-stock-insumos');
    if (formato === 'pdf')   return enviarPDF(res, rows, 'Reporte de Stock de Insumos');
    res.json({ rows });
  } catch (err) {
    res.json({ error: err.message, rows: [] });
  }
});

module.exports = router;
