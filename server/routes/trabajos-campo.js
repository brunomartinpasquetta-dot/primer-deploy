const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET /categorias — categorías agrupadas
router.get('/categorias', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT id, nombre, categoria FROM CategoriasTarea WHERE activo = 1 ORDER BY categoria, nombre`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET / — lista tareas de temporada activa con filtros
router.get('/', async (req, res) => {
  try {
    const { temporada_id, parcela_id, categoria_tarea_id, desde, hasta, estado } = req.query;
    const pool = await getPool();
    let query = `SELECT t.id, t.temporada_id, t.parcela_id, t.categoria_tarea_id,
                 t.descripcion, t.observacion, t.fecha, t.estado, t.costo_total, t.created_at,
                 ct.nombre AS tarea_nombre, ct.categoria AS tarea_categoria,
                 p.nombre AS parcela,
                 te.nombre AS temporada,
                 (SELECT COUNT(*) FROM TareaTrabajadores tt WHERE tt.tarea_id = t.id) AS cant_trabajadores,
                 ISNULL(
                   (SELECT STRING_AGG(j.apellido + ', ' + j.nombre, ' | ')
                    FROM TareaTrabajadores tt2
                    JOIN Juntadores j ON j.id = tt2.trabajador_id
                    WHERE tt2.tarea_id = t.id), ''
                 ) AS trabajadores,
                 (SELECT SUM(DATEDIFF(MINUTE, tt3.hora_inicio, tt3.hora_fin))
                  FROM TareaTrabajadores tt3
                  WHERE tt3.tarea_id = t.id AND tt3.hora_inicio IS NOT NULL AND tt3.hora_fin IS NOT NULL) AS minutos_totales
                 FROM TareasGenerales t
                 JOIN CategoriasTarea ct ON t.categoria_tarea_id = ct.id
                 LEFT JOIN Parcelas p ON t.parcela_id = p.id
                 LEFT JOIN Temporadas te ON t.temporada_id = te.id
                 WHERE 1=1`;
    const dbReq = pool.request();
    if (temporada_id) { query += ` AND t.temporada_id = @temporada_id`; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }
    if (parcela_id) { query += ` AND t.parcela_id = @parcela_id`; dbReq.input('parcela_id', sql.Int, parseInt(parcela_id)); }
    if (categoria_tarea_id) { query += ` AND t.categoria_tarea_id = @categoria_tarea_id`; dbReq.input('categoria_tarea_id', sql.Int, parseInt(categoria_tarea_id)); }
    if (desde) { query += ` AND t.fecha >= @desde`; dbReq.input('desde', sql.Date, desde); }
    if (hasta) { query += ` AND t.fecha <= @hasta`; dbReq.input('hasta', sql.Date, hasta); }
    if (estado) { query += ` AND t.estado = @estado`; dbReq.input('estado', sql.VarChar(20), estado); }
    query += ` ORDER BY t.fecha DESC, t.id DESC`;
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /:id — detalle con trabajadores e insumos
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const id = parseInt(req.params.id);
    const tarea = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT t.*, ct.nombre AS tarea_nombre, ct.categoria AS tarea_categoria,
              p.nombre AS parcela, te.nombre AS temporada
              FROM TareasGenerales t
              JOIN CategoriasTarea ct ON t.categoria_tarea_id = ct.id
              LEFT JOIN Parcelas p ON t.parcela_id = p.id
              LEFT JOIN Temporadas te ON t.temporada_id = te.id
              WHERE t.id = @id`);
    if (!tarea.recordset.length) return res.status(404).json({ error: 'Tarea no encontrada' });

    const trabajadores = await pool.request()
      .input('tarea_id', sql.Int, id)
      .query(`SELECT tt.id, tt.trabajador_id, tt.hora_inicio, tt.hora_fin, tt.monto,
              j.apellido + ', ' + j.nombre AS nombre
              FROM TareaTrabajadores tt
              JOIN Juntadores j ON j.id = tt.trabajador_id
              WHERE tt.tarea_id = @tarea_id ORDER BY tt.created_at`);

    const insumos = await pool.request()
      .input('tarea_id2', sql.Int, id)
      .query(`SELECT ti.id, ti.producto_id, ti.cantidad, ti.costo,
              pr.nombre AS producto, pr.presentacion, pr.stock_actual
              FROM TareaInsumos ti
              JOIN Productos pr ON ti.producto_id = pr.id
              WHERE ti.tarea_id = @tarea_id2 ORDER BY ti.created_at`);

    res.json({
      ...tarea.recordset[0],
      trabajadores: trabajadores.recordset,
      insumos: insumos.recordset
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST / — registrar tarea completa en transacción
router.post('/', async (req, res) => {
  try {
    const { temporada_id, parcela_id, categoria_tarea_id, descripcion, observacion, fecha, trabajadores, insumos, costo_total } = req.body;

    if (!temporada_id || !categoria_tarea_id) return res.status(400).json({ error: 'Temporada y tipo de tarea son obligatorios' });
    if (!trabajadores || !trabajadores.length) return res.status(400).json({ error: 'Mínimo 1 trabajador obligatorio' });

    // Verificar si categoría es "Otros" y observación obligatoria
    const pool = await getPool();
    const catCheck = await pool.request()
      .input('cat_id', sql.Int, parseInt(categoria_tarea_id))
      .query(`SELECT nombre FROM CategoriasTarea WHERE id = @cat_id`);
    if (catCheck.recordset.length && catCheck.recordset[0].nombre === 'Otros' && !observacion) {
      return res.status(400).json({ error: 'Para tipo "Otros", la observación es obligatoria' });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 1. INSERT TareasGenerales
      const tareaReq = new sql.Request(transaction);
      tareaReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      tareaReq.input('parcela_id', sql.Int, parcela_id ? parseInt(parcela_id) : null);
      tareaReq.input('categoria_tarea_id', sql.Int, parseInt(categoria_tarea_id));
      tareaReq.input('descripcion', sql.VarChar(500), descripcion || null);
      tareaReq.input('observacion', sql.VarChar(500), observacion || null);
      tareaReq.input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0]);
      tareaReq.input('costo_total', sql.Decimal(12, 2), parseFloat(costo_total) || 0);
      tareaReq.input('usuario_id', sql.Int, req.user ? req.user.id : null);
      const tareaResult = await tareaReq.query(`
        INSERT INTO TareasGenerales (temporada_id, parcela_id, categoria_tarea_id, descripcion, observacion, fecha, costo_total, usuario_id)
        VALUES (@temporada_id, @parcela_id, @categoria_tarea_id, @descripcion, @observacion, @fecha, @costo_total, @usuario_id);
        SELECT SCOPE_IDENTITY() AS id;
      `);
      const tareaId = tareaResult.recordset[0].id;

      // 2. INSERT TareaTrabajadores
      for (const trab of trabajadores) {
        const trabReq = new sql.Request(transaction);
        trabReq.input('tarea_id', sql.Int, tareaId);
        trabReq.input('trabajador_id', sql.Int, parseInt(trab.trabajador_id || trab.id));
        trabReq.input('hora_inicio', sql.DateTime, trab.hora_inicio || null);
        trabReq.input('hora_fin', sql.DateTime, trab.hora_fin || null);
        trabReq.input('monto', sql.Decimal(10, 2), parseFloat(trab.monto) || 0);
        await trabReq.query(`INSERT INTO TareaTrabajadores (tarea_id, trabajador_id, hora_inicio, hora_fin, monto)
          VALUES (@tarea_id, @trabajador_id, @hora_inicio, @hora_fin, @monto)`);
      }

      // 3. INSERT TareaInsumos + UPDATE stock
      let warningStock = false;
      if (insumos && insumos.length) {
        for (const ins of insumos) {
          const insReq = new sql.Request(transaction);
          insReq.input('tarea_id', sql.Int, tareaId);
          insReq.input('producto_id', sql.Int, parseInt(ins.producto_id));
          insReq.input('cantidad', sql.Decimal(10, 2), parseFloat(ins.cantidad));
          insReq.input('costo', sql.Decimal(10, 2), parseFloat(ins.costo) || 0);
          await insReq.query(`INSERT INTO TareaInsumos (tarea_id, producto_id, cantidad, costo)
            VALUES (@tarea_id, @producto_id, @cantidad, @costo)`);

          // Descontar stock
          const stockReq = new sql.Request(transaction);
          stockReq.input('producto_id', sql.Int, parseInt(ins.producto_id));
          stockReq.input('cantidad', sql.Decimal(10, 2), parseFloat(ins.cantidad));
          await stockReq.query(`UPDATE Productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id`);

          // Registrar movimiento en StockInsumos
          const movReq = new sql.Request(transaction);
          movReq.input('producto_id', sql.Int, parseInt(ins.producto_id));
          movReq.input('cantidad', sql.Decimal(10, 2), parseFloat(ins.cantidad));
          movReq.input('tipo', sql.VarChar(50), 'tarea_general');
          movReq.input('referencia', sql.VarChar(200), 'Tarea de campo #' + tareaId);
          movReq.input('usuario_id', sql.Int, req.user ? req.user.id : null);
          await movReq.query(`INSERT INTO StockInsumos (producto_id, cantidad, tipo, referencia, usuario_id, fecha)
            VALUES (@producto_id, -@cantidad, @tipo, @referencia, @usuario_id, GETDATE())`);

          // Check stock warning
          const checkReq = new sql.Request(transaction);
          checkReq.input('producto_id', sql.Int, parseInt(ins.producto_id));
          const stockCheck = await checkReq.query(`SELECT stock_actual FROM Productos WHERE id = @producto_id`);
          if (stockCheck.recordset.length && parseFloat(stockCheck.recordset[0].stock_actual) < 0) {
            warningStock = true;
          }
        }
      }

      await transaction.commit();
      res.json({ ok: true, id: tareaId, warning_stock: warningStock });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /:id/anular — anular tarea en transacción
router.post('/:id/anular', async (req, res) => {
  try {
    const pool = await getPool();
    const id = parseInt(req.params.id);
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo obligatorio' });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Verificar estado actual
      const checkReq = new sql.Request(transaction);
      checkReq.input('id', sql.Int, id);
      const check = await checkReq.query(`SELECT estado FROM TareasGenerales WHERE id = @id`);
      if (!check.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'Tarea no encontrada' }); }
      if (check.recordset[0].estado === 'anulada') { await transaction.rollback(); return res.status(400).json({ error: 'La tarea ya está anulada' }); }

      // 1. UPDATE estado
      const updReq = new sql.Request(transaction);
      updReq.input('id', sql.Int, id);
      updReq.input('motivo', sql.VarChar(500), motivo);
      await updReq.query(`UPDATE TareasGenerales SET estado = 'anulada', observacion = ISNULL(observacion, '') + ' [ANULADA: ' + @motivo + ']' WHERE id = @id`);

      // 2. Revertir stock de insumos
      const insReq = new sql.Request(transaction);
      insReq.input('tarea_id', sql.Int, id);
      const insumos = await insReq.query(`SELECT producto_id, cantidad FROM TareaInsumos WHERE tarea_id = @tarea_id`);

      for (const ins of insumos.recordset) {
        const revReq = new sql.Request(transaction);
        revReq.input('producto_id', sql.Int, ins.producto_id);
        revReq.input('cantidad', sql.Decimal(10, 2), parseFloat(ins.cantidad));
        await revReq.query(`UPDATE Productos SET stock_actual = stock_actual + @cantidad WHERE id = @producto_id`);

        const movReq = new sql.Request(transaction);
        movReq.input('producto_id', sql.Int, ins.producto_id);
        movReq.input('cantidad', sql.Decimal(10, 2), parseFloat(ins.cantidad));
        movReq.input('tipo', sql.VarChar(50), 'anulacion_tarea');
        movReq.input('referencia', sql.VarChar(200), 'Anulación tarea campo #' + id + ': ' + motivo);
        movReq.input('usuario_id', sql.Int, req.user ? req.user.id : null);
        await movReq.query(`INSERT INTO StockInsumos (producto_id, cantidad, tipo, referencia, usuario_id, fecha)
          VALUES (@producto_id, @cantidad, @tipo, @referencia, @usuario_id, GETDATE())`);
      }

      await transaction.commit();
      res.json({ ok: true });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /:id/trabajador — agregar trabajador a tarea existente
router.post('/:id/trabajador', async (req, res) => {
  try {
    const pool = await getPool();
    const tareaId = parseInt(req.params.id);
    const { trabajador_id, hora_inicio, hora_fin, monto } = req.body;
    if (!trabajador_id) return res.status(400).json({ error: 'trabajador_id obligatorio' });

    const result = await pool.request()
      .input('tarea_id', sql.Int, tareaId)
      .input('trabajador_id', sql.Int, parseInt(trabajador_id))
      .input('hora_inicio', sql.DateTime, hora_inicio || null)
      .input('hora_fin', sql.DateTime, hora_fin || null)
      .input('monto', sql.Decimal(10, 2), parseFloat(monto) || 0)
      .query(`INSERT INTO TareaTrabajadores (tarea_id, trabajador_id, hora_inicio, hora_fin, monto)
        VALUES (@tarea_id, @trabajador_id, @hora_inicio, @hora_fin, @monto);
        SELECT SCOPE_IDENTITY() AS id;`);
    res.json({ ok: true, id: result.recordset[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /:id/trabajador/:regId — actualizar hora_inicio/hora_fin
router.put('/:id/trabajador/:regId', async (req, res) => {
  try {
    const pool = await getPool();
    const { hora_inicio, hora_fin, monto } = req.body;
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.regId))
      .input('hora_inicio', sql.DateTime, hora_inicio || null)
      .input('hora_fin', sql.DateTime, hora_fin || null)
      .input('monto', sql.Decimal(10, 2), parseFloat(monto) || 0)
      .query(`UPDATE TareaTrabajadores SET hora_inicio = @hora_inicio, hora_fin = @hora_fin, monto = @monto WHERE id = @id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /:id/trabajador/:empId — quitar trabajador
router.delete('/:id/trabajador/:empId', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.empId))
      .query(`DELETE FROM TareaTrabajadores WHERE id = @id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
