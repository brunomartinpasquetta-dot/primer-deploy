const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre, rubro, contacto, telefono, email, direccion FROM Proveedores WHERE activo = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, rubro, contacto, telefono, email, direccion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('rubro', sql.NVarChar, rubro || '')
      .input('contacto', sql.NVarChar, contacto || '')
      .input('telefono', sql.NVarChar, telefono || '')
      .input('email', sql.NVarChar, email || '')
      .input('direccion', sql.NVarChar, direccion || '')
      .query('INSERT INTO Proveedores (nombre, rubro, contacto, telefono, email, direccion) VALUES (@nombre, @rubro, @contacto, @telefono, @email, @direccion)');
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, rubro, contacto, telefono, email, direccion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar, nombre)
      .input('rubro', sql.NVarChar, rubro || '')
      .input('contacto', sql.NVarChar, contacto || '')
      .input('telefono', sql.NVarChar, telefono || '')
      .input('email', sql.NVarChar, email || '')
      .input('direccion', sql.NVarChar, direccion || '')
      .query('UPDATE Proveedores SET nombre=@nombre, rubro=@rubro, contacto=@contacto, telefono=@telefono, email=@email, direccion=@direccion WHERE id=@id');
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.patch('/:id/desactivar', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Proveedores SET activo=0 WHERE id=@id');
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.get('/:id/insumos', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT id, nombre, tipo, presentacion, unidad_medida, stock_actual, costo_unitario FROM Productos WHERE proveedor_id=@id AND activo=1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;