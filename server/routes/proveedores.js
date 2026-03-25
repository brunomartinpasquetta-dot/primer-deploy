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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;