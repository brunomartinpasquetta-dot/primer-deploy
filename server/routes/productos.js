const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET — listado activos con proveedor principal + proveedores históricos
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT
          p.id, p.nombre, p.descripcion, p.tipo,
          p.presentacion, ISNULL(p.unidad_medida, p.presentacion) AS unidad_medida,
          p.contenido_litros, p.costo_unitario, p.stock_minimo,
          p.envase, p.proveedor_id,
          pv.nombre AS proveedor_nombre,
          ISNULL(p.stock_actual, 0) AS stock_actual,
          (
            SELECT STRING_AGG(x.proveedor, ', ')
            FROM (
              SELECT DISTINCT si.proveedor
              FROM StockInsumos si
              WHERE si.producto_id = p.id
                AND si.proveedor IS NOT NULL AND si.proveedor <> ''
            ) x
          ) AS proveedores_historicos
        FROM Productos p
        LEFT JOIN Proveedores pv ON p.proveedor_id = pv.id
        WHERE p.activo = 1
        ORDER BY p.nombre
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — crear nuevo insumo
router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion, tipo, presentacion, contenido_litros, costo_unitario, proveedor_id, envase, stock_minimo } = req.body;
    if (!proveedor_id) return res.status(400).json({ error: 'El insumo debe tener un proveedor asignado' });
    const pool = await getPool();
    await pool.request()
      .input('nombre',          sql.NVarChar,      nombre)
      .input('descripcion',     sql.NVarChar,      descripcion || '')
      .input('tipo',            sql.NVarChar,      tipo || '')
      .input('categoria',       sql.NVarChar,      tipo || '')
      .input('presentacion',    sql.NVarChar,      presentacion || '')
      .input('unidad_medida',   sql.NVarChar,      presentacion || null)
      .input('contenido_litros',sql.Decimal(8,3),  contenido_litros || null)
      .input('costo_unitario',  sql.Decimal(10,2), costo_unitario || null)
      .input('proveedor_id',    sql.Int,            proveedor_id || null)
      .input('envase',          sql.NVarChar,       envase || null)
      .input('stock_minimo',    sql.Decimal(10,3),  stock_minimo || null)
      .query(`INSERT INTO Productos (nombre, descripcion, tipo, categoria, presentacion, unidad_medida, contenido_litros, costo_unitario, proveedor_id, envase, stock_minimo)
              VALUES (@nombre, @descripcion, @tipo, @categoria, @presentacion, @unidad_medida, @contenido_litros, @costo_unitario, @proveedor_id, @envase, @stock_minimo)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — editar insumo
router.put('/:id', async (req, res) => {
  try {
    const { nombre, descripcion, tipo, presentacion, contenido_litros, costo_unitario, proveedor_id, envase, stock_minimo } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',              sql.Int,           req.params.id)
      .input('nombre',          sql.NVarChar,      nombre)
      .input('descripcion',     sql.NVarChar,      descripcion || '')
      .input('tipo',            sql.NVarChar,      tipo || '')
      .input('categoria',       sql.NVarChar,      tipo || '')
      .input('presentacion',    sql.NVarChar,      presentacion || '')
      .input('unidad_medida',   sql.NVarChar,      presentacion || null)
      .input('contenido_litros',sql.Decimal(8,3),  contenido_litros || null)
      .input('costo_unitario',  sql.Decimal(10,2), costo_unitario || null)
      .input('proveedor_id',    sql.Int,            proveedor_id || null)
      .input('envase',          sql.NVarChar,       envase || null)
      .input('stock_minimo',    sql.Decimal(10,3),  stock_minimo || null)
      .query(`UPDATE Productos SET
                nombre=@nombre, descripcion=@descripcion, tipo=@tipo, categoria=@categoria,
                presentacion=@presentacion, unidad_medida=@unidad_medida,
                contenido_litros=@contenido_litros, costo_unitario=@costo_unitario,
                proveedor_id=@proveedor_id, envase=@envase, stock_minimo=@stock_minimo
              WHERE id=@id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/desactivar — desactivar insumo (soft delete)
router.patch('/:id/desactivar', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Productos SET activo = 0 WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
