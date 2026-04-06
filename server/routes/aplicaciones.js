const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { temporada_id, parcela_id, desde, hasta } = req.query;
    const pool = await getPool();
    let query = `SELECT a.id, a.parcela_id, a.producto_id, a.fecha_hora, a.cantidad_usada, a.metodo, a.estado,
                 a.carencia_dias, a.dosis_por_hectarea, a.observacion,
                 a.condicion_climatica, a.costo_total, a.unidad_aplicacion,
                 l.nombre AS parcela,
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
                 JOIN Parcelas l ON a.parcela_id = l.id
                 JOIN Productos p ON a.producto_id = p.id
                 LEFT JOIN Juntadores j ON a.empleado_id = j.id
                 LEFT JOIN Temporadas t ON a.temporada_id = t.id
                 WHERE 1=1`;
    const dbReq = pool.request();
    if (temporada_id) { query += ` AND a.temporada_id = @temporada_id`; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }
    if (parcela_id)      { query += ` AND a.parcela_id = @parcela_id`;           dbReq.input('parcela_id', sql.Int, parseInt(parcela_id)); }
    if (desde)        { query += ` AND CAST(a.fecha_hora AS DATE) >= @desde`; dbReq.input('desde', sql.Date, desde); }
    if (hasta)        { query += ` AND CAST(a.fecha_hora AS DATE) <= @hasta`; dbReq.input('hasta', sql.Date, hasta); }
    query += ` ORDER BY a.fecha_hora DESC`;
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.get('/carencia', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT * FROM VistaCariencia WHERE estado = 'EN CARENCIA' ORDER BY fecha_libre ASC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.post('/', async (req, res) => {
  const { parcela_id, producto_id, temporada_id, empleado_id, cantidad_usada,
          unidad_aplicacion, metodo, condicion_climatica, dosis_por_hectarea,
          carencia_dias, observacion } = req.body;

  if (!parcela_id || !producto_id) return res.status(400).json({ error: 'Parcela y producto son obligatorios' });
  if (!cantidad_usada || parseFloat(cantidad_usada) <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a 0' });

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

    const uid = req.user ? req.user.id : null;
    const req1 = new sql.Request(transaction);
    const insResult = await req1
      .input('parcela_id', sql.Int, parcela_id)
      .input('producto_id', sql.Int, producto_id)
      .input('temporada_id', sql.Int, temporada_id || null)
      .input('empleado_id', sql.Int, empleado_id || null)
      .input('cantidad_usada', sql.Decimal(10,3), cantidad_usada)
      .input('unidad_aplicacion', sql.NVarChar, unidad_aplicacion || '')
      .input('metodo', sql.NVarChar, metodo || '')
      .input('condicion_climatica', sql.NVarChar, condicion_climatica || '')
      .input('dosis_por_hectarea', sql.Decimal(10,3), dosis_por_hectarea || null)
      .input('carencia_dias', sql.Int, carencia_dias || null)
      .input('costo_total', sql.Decimal(10,3), costo_total)
      .input('observacion', sql.NVarChar, observacion || '')
      .input('usuario_id', sql.Int, uid)
      .query(`INSERT INTO Aplicaciones (parcela_id, producto_id, temporada_id, empleado_id, cantidad_usada,
              unidad_aplicacion, metodo, condicion_climatica, dosis_por_hectarea, carencia_dias, costo_total, observacion, usuario_id)
              OUTPUT INSERTED.id AS aplicacion_id
              VALUES (@parcela_id, @producto_id, @temporada_id, @empleado_id, @cantidad_usada,
              @unidad_aplicacion, @metodo, @condicion_climatica, @dosis_por_hectarea, @carencia_dias, @costo_total, @observacion, @usuario_id)`);
    const aplicacion_id = insResult.recordset[0].aplicacion_id;

    const req2 = new sql.Request(transaction);
    await req2
      .input('producto_id', sql.Int, producto_id)
      .input('cantidad', sql.Decimal(10,3), cantidad_usada)
      .query('UPDATE Productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id');

    const req3 = new sql.Request(transaction);
    await req3
      .input('producto_id', sql.Int,          producto_id)
      .input('cantidad',    sql.Decimal(10,3), cantidad_usada)
      .input('parcela_id',     sql.Int,           parcela_id)
      .input('costo_total', sql.Decimal(10,3), costo_total)
      .input('empleado_id', sql.Int,           empleado_id || null)
      .input('usuario_id',     sql.Int,           uid)
      .input('aplicacion_id', sql.Int,           aplicacion_id)
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, parcela_id, costo_total, empleado_id, usuario_id, aplicacion_id, observacion, fecha_hora)
              VALUES (@producto_id, 'aplicacion', @cantidad, @parcela_id, @costo_total, @empleado_id, @usuario_id, @aplicacion_id, 'Aplicacion registrada', GETDATE())`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.post('/:id/anular', async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;
  if (!motivo) return res.status(400).json({ error: 'Motivo es obligatorio' });

  const pool = await getPool();
  try {
    const check = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT id, producto_id, cantidad_usada, costo_total, estado FROM Aplicaciones WHERE id = @id');
    if (!check.recordset.length) return res.status(404).json({ error: 'Aplicación no encontrada' });
    const app = check.recordset[0];
    if (app.estado === 'anulada') return res.status(400).json({ error: 'La aplicación ya está anulada' });

    const uid = req.user ? req.user.id : null;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    const req1 = new sql.Request(transaction);
    await req1
      .input('cantidad_usada', sql.Decimal(10,3), app.cantidad_usada)
      .input('producto_id', sql.Int, app.producto_id)
      .query('UPDATE Productos SET stock_actual = stock_actual + @cantidad_usada WHERE id = @producto_id');

    const req2 = new sql.Request(transaction);
    await req2
      .input('producto_id', sql.Int, app.producto_id)
      .input('cantidad', sql.Decimal(10,3), app.cantidad_usada)
      .input('observacion', sql.NVarChar, `Anulación aplicación #${id} — ${motivo}`)
      .input('usuario_id', sql.Int, uid)
      .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, observacion, usuario_id, fecha_hora)
              VALUES (@producto_id, 'anulacion_aplicacion', @cantidad, @observacion, @usuario_id, GETDATE())`);

    const req3 = new sql.Request(transaction);
    await req3
      .input('id', sql.Int, id)
      .query("UPDATE Aplicaciones SET estado = 'anulada' WHERE id = @id");

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;