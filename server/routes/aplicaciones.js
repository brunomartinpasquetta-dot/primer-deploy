const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { temporada_id, lote_id, desde, hasta } = req.query;
    const pool = await getPool();
    let query = `SELECT a.id, a.lote_id, a.producto_id, a.fecha_hora, a.cantidad_usada, a.metodo,
                 a.carencia_dias, a.dosis_por_hectarea, a.observacion,
                 a.condicion_climatica, a.costo_total, a.unidad_aplicacion,
                 l.nombre AS lote,
                 p.nombre AS producto, p.presentacion,
                 j.nombre + ' ' + j.apellido AS empleado,
                 t.nombre AS temporada,
                 DATEADD(day, ISNULL(a.carencia_dias, 0), a.fecha_hora) AS fecha_libre,
                 CASE
                   WHEN a.carencia_dias IS NULL OR a.carencia_dias = 0 THEN 'libre'
                   WHEN DATEADD(day, a.carencia_dias, a.fecha_hora) > GETDATE() THEN 'carencia'
                   ELSE 'libre'
                 END AS estado_carencia
                 FROM Aplicaciones a
                 JOIN Lotes l ON a.lote_id = l.id
                 JOIN Productos p ON a.producto_id = p.id
                 LEFT JOIN Juntadores j ON a.empleado_id = j.id
                 LEFT JOIN Temporadas t ON a.temporada_id = t.id
                 WHERE 1=1`;
    const dbReq = pool.request();
    if (temporada_id) { query += ` AND a.temporada_id = @temporada_id`; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }
    if (lote_id)      { query += ` AND a.lote_id = @lote_id`;           dbReq.input('lote_id', sql.Int, parseInt(lote_id)); }
    if (desde)        { query += ` AND CAST(a.fecha_hora AS DATE) >= @desde`; dbReq.input('desde', sql.Date, desde); }
    if (hasta)        { query += ` AND CAST(a.fecha_hora AS DATE) <= @hasta`; dbReq.input('hasta', sql.Date, hasta); }
    query += ` ORDER BY a.fecha_hora DESC`;
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/carencia', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT * FROM VistaCariencia WHERE estado = 'EN CARENCIA' ORDER BY fecha_libre ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { lote_id, producto_id, temporada_id, empleado_id, cantidad_usada,
          unidad_aplicacion, metodo, condicion_climatica, dosis_por_hectarea,
          carencia_dias, observacion } = req.body;

  if (!lote_id || !producto_id || !cantidad_usada) {
    return res.status(400).json({ error: 'Lote, producto y cantidad son obligatorios' });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const stockCheck = new sql.Request(transaction);
    const stockResult = await stockCheck
      .input('producto_id', sql.Int, producto_id)
      .query('SELECT stock_actual, costo_unitario FROM Productos WHERE id = @producto_id');

    const stock = parseFloat(stockResult.recordset[0].stock_actual) || 0;
    if (stock < parseFloat(cantidad_usada)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Stock insuficiente. Stock actual: ' + stock });
    }

    const costo_total = parseFloat(cantidad_usada) * (parseFloat(stockResult.recordset[0].costo_unitario) || 0);

    const req1 = new sql.Request(transaction);
    const insResult = await req1
      .input('lote_id', sql.Int, lote_id)
      .input('producto_id', sql.Int, producto_id)
      .input('temporada_id', sql.Int, temporada_id || null)
      .input('empleado_id', sql.Int, empleado_id || null)
      .input('cantidad_usada', sql.Decimal(8,2), cantidad_usada)
      .input('unidad_aplicacion', sql.NVarChar, unidad_aplicacion || '')
      .input('metodo', sql.NVarChar, metodo || '')
      .input('condicion_climatica', sql.NVarChar, condicion_climatica || '')
      .input('dosis_por_hectarea', sql.Decimal(8,2), dosis_por_hectarea || null)
      .input('carencia_dias', sql.Int, carencia_dias || null)
      .input('costo_total', sql.Decimal(10,2), costo_total)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO Aplicaciones (lote_id, producto_id, temporada_id, empleado_id, cantidad_usada,
              unidad_aplicacion, metodo, condicion_climatica, dosis_por_hectarea, carencia_dias, costo_total, observacion)
              VALUES (@lote_id, @producto_id, @temporada_id, @empleado_id, @cantidad_usada,
              @unidad_aplicacion, @metodo, @condicion_climatica, @dosis_por_hectarea, @carencia_dias, @costo_total, @observacion);
              SELECT SCOPE_IDENTITY() AS aplicacion_id;`);
    const aplicacion_id = insResult.recordset[0].aplicacion_id;

    const req2 = new sql.Request(transaction);
    await req2
      .input('producto_id', sql.Int, producto_id)
      .input('cantidad', sql.Decimal(8,2), cantidad_usada)
      .query('UPDATE Productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id');

    const uid = req.user ? req.user.id : null;
    const req3 = new sql.Request(transaction);
    await req3
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,2), cantidad_usada)
      .input('lote_id',     sql.Int,           lote_id)
      .input('costo_total', sql.Decimal(10,2), costo_total)
      .input('empleado_id', sql.Int,           empleado_id || null)
      .input('usuario_id',     sql.Int,           uid)
      .input('aplicacion_id', sql.Int,           aplicacion_id)
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, lote_id, costo_total, empleado_id, usuario_id, aplicacion_id, observacion, fecha_hora)
              VALUES (@producto_id, 'aplicacion', @cantidad, @lote_id, @costo_total, @empleado_id, @usuario_id, @aplicacion_id, 'Aplicacion registrada', GETDATE())`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;