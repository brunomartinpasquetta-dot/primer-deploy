const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Obtener stock actual de todos los productos
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT p.id, p.nombre, p.tipo, p.presentacion, p.stock_actual,
              p.costo_unitario,
              ISNULL(SUM(CASE WHEN s.tipo = 'compra' THEN s.cantidad ELSE 0 END), 0) AS total_comprado,
              ISNULL(SUM(CASE WHEN s.tipo = 'aplicacion' THEN s.cantidad ELSE 0 END), 0) AS total_usado
              FROM Productos p
              LEFT JOIN StockInsumos s ON p.id = s.producto_id
              WHERE p.activo = 1
              GROUP BY p.id, p.nombre, p.tipo, p.presentacion, p.stock_actual, p.costo_unitario
              ORDER BY p.nombre`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar compra (ingreso de stock)
router.post('/compra', async (req, res) => {
  const { producto_id, cantidad, costo_total, proveedor, observacion } = req.body;
  const uid = req.user ? req.user.id : null;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad)
      .input('costo_total', sql.Decimal(10,2), costo_total || null)
      .input('proveedor',   sql.NVarChar,      proveedor || '')
      .input('observacion', sql.NVarChar,      observacion || '')
      .input('usuario_id',  sql.Int,           uid)
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, costo_total, proveedor, observacion, usuario_id, fecha_hora)
              VALUES (@producto_id, 'compra', @cantidad, @costo_total, @proveedor, @observacion, @usuario_id, GETDATE())`);
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad)
      .query('UPDATE Productos SET stock_actual = ISNULL(stock_actual, 0) + @cantidad WHERE id = @producto_id');
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// Registrar ingreso manual (sin compra, sin proveedor)
router.post('/ingreso-manual', async (req, res) => {
  const { producto_id, cantidad, costo_total, observacion } = req.body;
  if (!producto_id || !cantidad) return res.status(400).json({ error: 'Producto y cantidad son obligatorios' });
  const uid = req.user ? req.user.id : null;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad)
      .input('costo_total', sql.Decimal(10,2), costo_total || null)
      .input('observacion', sql.NVarChar,      observacion || '')
      .input('usuario_id',  sql.Int,           uid)
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, costo_total, observacion, usuario_id, fecha_hora)
              VALUES (@producto_id, 'ingreso_manual', @cantidad, @costo_total, @observacion, @usuario_id, GETDATE())`);
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad)
      .query('UPDATE Productos SET stock_actual = ISNULL(stock_actual, 0) + @cantidad WHERE id = @producto_id');
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// Registrar aplicacion (egreso de stock)
router.post('/aplicacion', async (req, res) => {
  const { producto_id, cantidad, lote_id, empleado_id, observacion } = req.body;
  const uid = req.user ? req.user.id : null;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const check = await new sql.Request(transaction)
      .input('producto_id', sql.Int, producto_id)
      .query('SELECT stock_actual FROM Productos WHERE id = @producto_id');
    const stock = check.recordset[0].stock_actual || 0;
    if (stock < cantidad) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Stock insuficiente. Stock actual: ' + stock });
    }
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad)
      .input('lote_id',     sql.Int,           lote_id || null)
      .input('empleado_id', sql.Int,           empleado_id || null)
      .input('usuario_id',  sql.Int,           uid)
      .input('observacion', sql.NVarChar,      observacion || '')
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, lote_id, empleado_id, usuario_id, observacion, fecha_hora)
              VALUES (@producto_id, 'aplicacion', @cantidad, @lote_id, @empleado_id, @usuario_id, @observacion, GETDATE())`);
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad)
      .query('UPDATE Productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id');
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// Registrar egreso manual (vencimiento, pérdida, merma)
router.post('/egreso', async (req, res) => {
  const { producto_id, cantidad, motivo, lote_id, observacion } = req.body;
  if (!producto_id || !cantidad) return res.status(400).json({ error: 'Producto y cantidad son obligatorios' });
  const uid = req.user ? req.user.id : null;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const check = await new sql.Request(transaction)
      .input('producto_id', sql.Int, producto_id)
      .query('SELECT stock_actual FROM Productos WHERE id = @producto_id');
    if (!check.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const stock = parseFloat(check.recordset[0].stock_actual) || 0;
    if (stock < parseFloat(cantidad)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Stock insuficiente. Disponible: ' + stock });
    }
    const tipoEgreso = ['vencimiento', 'perdida', 'merma'].includes(motivo) ? motivo : 'egreso';
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad)
      .input('tipo',        sql.NVarChar,      tipoEgreso)
      .input('lote_id',     sql.Int,           lote_id || null)
      .input('usuario_id',  sql.Int,           uid)
      .input('observacion', sql.NVarChar,      observacion || motivo || '')
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, lote_id, usuario_id, observacion, fecha_hora)
              VALUES (@producto_id, @tipo, @cantidad, @lote_id, @usuario_id, @observacion, GETDATE())`);
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad)
      .query('UPDATE Productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id');
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// Historial general de movimientos (todos los productos)
router.get('/historial', async (req, res) => {
  try {
    const { producto_id, lote_id, tipo, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (producto_id) { where += ' AND s.producto_id = @producto_id'; dbReq.input('producto_id', sql.Int, parseInt(producto_id)); }
    if (lote_id)     { where += ' AND s.lote_id = @lote_id';         dbReq.input('lote_id', sql.Int, parseInt(lote_id)); }
    if (tipo)        { where += ' AND s.tipo = @tipo';               dbReq.input('tipo', sql.NVarChar, tipo); }
    if (desde)       { where += ' AND CAST(ISNULL(s.fecha_hora, s.fecha) AS DATE) >= @desde'; dbReq.input('desde', sql.Date, desde); }
    if (hasta)       { where += ' AND CAST(ISNULL(s.fecha_hora, s.fecha) AS DATE) <= @hasta'; dbReq.input('hasta', sql.Date, hasta); }
    const result = await dbReq.query(`
      SELECT s.id, s.tipo, s.cantidad, s.costo_total,
             ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME)) AS fecha_hora,
             s.proveedor, s.observacion, s.aplicacion_id,
             p.nombre AS producto, p.presentacion,
             l.nombre AS lote,
             j.apellido + ', ' + j.nombre AS empleado,
             u.nombre AS usuario,
             a.metodo, a.condicion_climatica, a.dosis_por_hectarea,
             a.carencia_dias, a.unidad_aplicacion AS aplic_unidad,
             a.observacion AS aplic_observacion,
             t.nombre AS temporada,
             DATEADD(day, ISNULL(a.carencia_dias, 0), ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME))) AS fecha_libre
      FROM StockInsumos s
      JOIN Productos p ON s.producto_id = p.id
      LEFT JOIN Lotes        l ON s.lote_id       = l.id
      LEFT JOIN Juntadores   j ON s.empleado_id   = j.id
      LEFT JOIN Usuarios     u ON s.usuario_id    = u.id
      LEFT JOIN Aplicaciones a ON s.aplicacion_id = a.id
      LEFT JOIN Temporadas   t ON a.temporada_id  = t.id
      WHERE ${where}
      ORDER BY ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME)) DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de movimientos de un producto
router.get('/historial/:producto_id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('producto_id', sql.Int, req.params.producto_id)
      .query(`SELECT s.tipo, s.cantidad, s.costo_total,
              ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME)) AS fecha_hora,
              s.proveedor, s.observacion,
              l.nombre AS lote
              FROM StockInsumos s
              LEFT JOIN Lotes l ON s.lote_id = l.id
              WHERE s.producto_id = @producto_id
              ORDER BY ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME)) DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
