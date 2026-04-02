const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Obtener clientes
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre, contacto, telefono, email, direccion FROM Clientes WHERE activo = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear cliente
router.post('/', async (req, res) => {
  try {
    const { nombre, contacto, telefono, email, direccion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('contacto', sql.NVarChar, contacto || '')
      .input('telefono', sql.NVarChar, telefono || '')
      .input('email', sql.NVarChar, email || '')
      .input('direccion', sql.NVarChar, direccion || '')
      .query('INSERT INTO Clientes (nombre, contacto, telefono, email, direccion) VALUES (@nombre, @contacto, @telefono, @email, @direccion)');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar cliente
router.put('/:id', async (req, res) => {
  try {
    const { nombre, contacto, telefono, email, direccion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar, nombre)
      .input('contacto', sql.NVarChar, contacto || '')
      .input('telefono', sql.NVarChar, telefono || '')
      .input('email', sql.NVarChar, email || '')
      .input('direccion', sql.NVarChar, direccion || '')
      .query('UPDATE Clientes SET nombre=@nombre, contacto=@contacto, telefono=@telefono, email=@email, direccion=@direccion WHERE id=@id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Desactivar cliente
router.patch('/:id/desactivar', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Clientes SET activo = 0 WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;