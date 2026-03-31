const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET /api/productos — listado con proveedor principal + todos los proveedores históricos
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT
          p.id, p.nombre, p.descripcion, p.tipo, p.presentacion,
          p.contenido_litros, p.costo_unitario, p.unidad_medida,
          p.envase, p.proveedor_id,
          pv.nombre AS proveedor_nombre,
          ISNULL(p.stock_actual, 0) AS stock_actual,
          (
            SELECT STRING_AGG(DISTINCT si.proveedor, ', ')
            FROM StockInsumos si
            WHERE si.producto_id = p.id
              AND si.proveedor IS NOT NULL AND si.proveedor <> ''
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

// POST /api/productos — crear nuevo insumo
router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion, tipo, presentacion, contenido_litros, costo_unitario, proveedor_id, envase } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('nombre',          sql.NVarChar,    nombre)
      .input('descripcion',     sql.NVarChar,    descripcion || '')
      .input('tipo',            sql.NVarChar,    tipo || '')
      .input('presentacion',    sql.NVarChar,    presentacion || '')
      .input('unidad_medida',   sql.NVarChar,    presentacion || null)
      .input('contenido_litros',sql.Decimal(8,2),contenido_litros || null)
      .input('costo_unitario',  sql.Decimal(10,2),costo_unitario || null)
      .input('proveedor_id',    sql.Int,         proveedor_id || null)
      .input('envase',          sql.NVarChar,    envase || null)
      .query(`INSERT INTO Productos (nombre, descripcion, tipo, presentacion, unidad_medida, contenido_litros, costo_unitario, proveedor_id, envase)
              VALUES (@nombre, @descripcion, @tipo, @presentacion, @unidad_medida, @contenido_litros, @costo_unitario, @proveedor_id, @envase)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
