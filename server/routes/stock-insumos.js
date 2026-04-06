const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Obtener stock actual consolidado por producto + proveedor + depósito
router.get('/', async (req, res) => {
  try {
    const { categoria } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let catFilter = '';
    if (categoria) {
      dbReq.input('categoria', sql.NVarChar, categoria);
      catFilter = 'AND p.categoria = @categoria';
    }
    const result = await dbReq.query(`
        SELECT
          p.id   AS producto_id,
          p.nombre AS producto,
          ISNULL(p.unidad_medida, p.presentacion) AS unidad,
          p.contenido_litros,
          p.tipo AS categoria,
          p.categoria AS categoria_nueva,
          p.envase,
          p.costo_unitario,
          p.stock_minimo,
          ISNULL(si.proveedor, 'Sin proveedor') AS proveedor,
          ISNULL(d.nombre, '—') AS deposito,
          d.tipo AS deposito_tipo,
          NULL AS numero_remito,
          SUM(CASE
            WHEN si.tipo IN ('compra', 'ingreso_manual') THEN si.cantidad
            WHEN si.tipo IN ('aplicacion', 'egreso', 'vencimiento', 'perdida', 'merma') THEN -si.cantidad
            ELSE 0
          END) AS cantidad_disponible
        FROM Productos p
        JOIN StockInsumos si ON si.producto_id = p.id
        LEFT JOIN Depositos d ON si.deposito_id = d.id
        WHERE p.activo = 1 ${catFilter}
        GROUP BY p.id, p.nombre, p.unidad_medida, p.presentacion, p.contenido_litros, p.tipo, p.categoria, p.envase,
                 p.costo_unitario, p.stock_minimo,
                 ISNULL(si.proveedor, 'Sin proveedor'),
                 ISNULL(d.nombre, '—'), d.tipo
        HAVING SUM(CASE
          WHEN si.tipo IN ('compra', 'ingreso_manual') THEN si.cantidad
          WHEN si.tipo IN ('aplicacion', 'egreso', 'vencimiento', 'perdida', 'merma') THEN -si.cantidad
          ELSE 0
        END) > 0
        ORDER BY p.nombre, ISNULL(si.proveedor, 'Sin proveedor')
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Registrar compra directa desde stock-insumos (ingreso manual con proveedor)
// cantidad = unidades compradas; se multiplica por contenido_litros del producto
router.post('/compra', async (req, res) => {
  const { producto_id, cantidad, costo_total, proveedor, observacion, deposito_id, fecha_vencimiento } = req.body;
  if (!producto_id) return res.status(400).json({ error: 'Producto es obligatorio' });
  if (!cantidad || parseFloat(cantidad) <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a 0' });
  const uid = req.user ? req.user.id : null;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    // Obtener contenido_litros del producto para calcular stock real
    const prodRes = await new sql.Request(transaction)
      .input('pid', sql.Int, producto_id)
      .query('SELECT ISNULL(contenido_litros, 1) AS contenido FROM Productos WHERE id = @pid');
    const contenido = parseFloat(prodRes.recordset[0]?.contenido) || 1;
    const stockQty  = parseFloat(cantidad) * contenido;

    await new sql.Request(transaction)
      .input('producto_id',      sql.Int,           producto_id)
      .input('cantidad',         sql.Decimal(10,3), stockQty)
      .input('costo_total',      sql.Decimal(10,2), costo_total || null)
      .input('proveedor',        sql.NVarChar,      proveedor || '')
      .input('observacion',      sql.NVarChar,      observacion || '')
      .input('usuario_id',       sql.Int,           uid)
      .input('deposito_id',      sql.Int,           deposito_id || null)
      .input('fecha_vencimiento',sql.Date,          fecha_vencimiento || null)
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, costo_total, proveedor, observacion, usuario_id, deposito_id, fecha_vencimiento, fecha_hora)
              VALUES (@producto_id, 'compra', @cantidad, @costo_total, @proveedor, @observacion, @usuario_id, @deposito_id, @fecha_vencimiento, GETDATE())`);
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,           producto_id)
      .input('cantidad',    sql.Decimal(10,3), stockQty)
      .query('UPDATE Productos SET stock_actual = ISNULL(stock_actual, 0) + @cantidad WHERE id = @producto_id');
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Registrar ingreso manual (sin compra)
router.post('/ingreso-manual', async (req, res) => {
  const { producto_id, cantidad, costo_total, observacion, deposito_id } = req.body;
  if (!producto_id) return res.status(400).json({ error: 'Producto es obligatorio' });
  if (!cantidad || parseFloat(cantidad) <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a 0' });
  const uid = req.user ? req.user.id : null;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,           producto_id)
      .input('cantidad',    sql.Decimal(10,3), cantidad)
      .input('costo_total', sql.Decimal(10,2), costo_total || null)
      .input('observacion', sql.NVarChar,      observacion || '')
      .input('usuario_id',  sql.Int,           uid)
      .input('deposito_id', sql.Int,           deposito_id || null)
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, costo_total, observacion, usuario_id, deposito_id, fecha_hora)
              VALUES (@producto_id, 'ingreso_manual', @cantidad, @costo_total, @observacion, @usuario_id, @deposito_id, GETDATE())`);
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,           producto_id)
      .input('cantidad',    sql.Decimal(10,3), cantidad)
      .query('UPDATE Productos SET stock_actual = ISNULL(stock_actual, 0) + @cantidad WHERE id = @producto_id');
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Registrar aplicacion (egreso de stock)
router.post('/aplicacion', async (req, res) => {
  const { producto_id, cantidad, parcela_id, empleado_id, observacion } = req.body;
  if (!producto_id) return res.status(400).json({ error: 'Producto es obligatorio' });
  if (!cantidad || parseFloat(cantidad) <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a 0' });
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
      .input('producto_id', sql.Int,           producto_id)
      .input('cantidad',    sql.Decimal(10,3), cantidad)
      .input('parcela_id',  sql.Int,           parcela_id || null)
      .input('empleado_id', sql.Int,           empleado_id || null)
      .input('usuario_id',  sql.Int,           uid)
      .input('observacion', sql.NVarChar,      observacion || '')
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, parcela_id, empleado_id, usuario_id, observacion, fecha_hora)
              VALUES (@producto_id, 'aplicacion', @cantidad, @parcela_id, @empleado_id, @usuario_id, @observacion, GETDATE())`);
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,           producto_id)
      .input('cantidad',    sql.Decimal(10,3), cantidad)
      .query('UPDATE Productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id');
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Registrar egreso manual (vencimiento, pérdida, merma)
router.post('/egreso', async (req, res) => {
  const { producto_id, cantidad, motivo, parcela_id, observacion } = req.body;
  if (!producto_id) return res.status(400).json({ error: 'Producto es obligatorio' });
  if (!cantidad || parseFloat(cantidad) <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a 0' });
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
      .input('producto_id', sql.Int,           producto_id)
      .input('cantidad',    sql.Decimal(10,3), cantidad)
      .input('tipo',        sql.NVarChar,      tipoEgreso)
      .input('parcela_id',  sql.Int,           parcela_id || null)
      .input('usuario_id',  sql.Int,           uid)
      .input('observacion', sql.NVarChar,      observacion || motivo || '')
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, parcela_id, usuario_id, observacion, fecha_hora)
              VALUES (@producto_id, @tipo, @cantidad, @parcela_id, @usuario_id, @observacion, GETDATE())`);
    await new sql.Request(transaction)
      .input('producto_id', sql.Int,           producto_id)
      .input('cantidad',    sql.Decimal(10,3), cantidad)
      .query('UPDATE Productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id');
    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Historial general de movimientos (todos los productos)
router.get('/historial', async (req, res) => {
  try {
    const { producto_id, parcela_id, tipo, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (producto_id) { where += ' AND s.producto_id = @producto_id'; dbReq.input('producto_id', sql.Int, parseInt(producto_id)); }
    if (parcela_id)     { where += ' AND s.parcela_id = @parcela_id';         dbReq.input('parcela_id', sql.Int, parseInt(parcela_id)); }
    if (tipo)        { where += ' AND s.tipo = @tipo';               dbReq.input('tipo', sql.NVarChar, tipo); }
    if (desde)       { where += ' AND CAST(ISNULL(s.fecha_hora, s.fecha) AS DATE) >= @desde'; dbReq.input('desde', sql.Date, desde); }
    if (hasta)       { where += ' AND CAST(ISNULL(s.fecha_hora, s.fecha) AS DATE) <= @hasta'; dbReq.input('hasta', sql.Date, hasta); }
    const result = await dbReq.query(`
      SELECT s.id, s.tipo, s.cantidad, s.costo_total,
             ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME)) AS fecha_hora,
             s.proveedor, s.observacion, s.aplicacion_id,
             s.fecha_vencimiento, s.compra_id,
             c2.numero_remito,
             p.nombre AS producto, p.presentacion,
             l.nombre AS parcela,
             j.apellido + ', ' + j.nombre AS empleado,
             u.nombre AS usuario,
             d.nombre AS deposito_nombre,
             a.metodo, a.condicion_climatica, a.dosis_por_hectarea,
             a.carencia_dias, a.unidad_aplicacion AS aplic_unidad,
             a.observacion AS aplic_observacion,
             t.nombre AS temporada,
             DATEADD(day, ISNULL(a.carencia_dias, 0), ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME))) AS fecha_libre
      FROM StockInsumos s
      JOIN Productos p ON s.producto_id = p.id
      LEFT JOIN Parcelas        l ON s.parcela_id       = l.id
      LEFT JOIN Juntadores   j ON s.empleado_id   = j.id
      LEFT JOIN Usuarios     u ON s.usuario_id    = u.id
      LEFT JOIN Depositos    d ON s.deposito_id   = d.id
      LEFT JOIN Aplicaciones a ON s.aplicacion_id = a.id
      LEFT JOIN Temporadas   t ON a.temporada_id  = t.id
      LEFT JOIN Compras      c2 ON s.compra_id    = c2.id
      WHERE ${where}
      ORDER BY ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME)) DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /historial/:id — editar observación de un movimiento
router.patch('/historial/:id', async (req, res) => {
  const { observacion } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',          sql.Int,      req.params.id)
      .input('observacion', sql.NVarChar, observacion || '')
      .query('UPDATE StockInsumos SET observacion = @observacion WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
              l.nombre AS parcela
              FROM StockInsumos s
              LEFT JOIN Parcelas l ON s.parcela_id = l.id
              WHERE s.producto_id = @producto_id
              ORDER BY ISNULL(s.fecha_hora, CAST(s.fecha AS DATETIME)) DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
