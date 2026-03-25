const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre, descripcion, tipo, presentacion, contenido_litros, costo_unitario FROM Productos WHERE activo = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion, tipo, presentacion, contenido_litros, costo_unitario } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('descripcion', sql.NVarChar, descripcion || '')
      .input('tipo', sql.NVarChar, tipo || '')
      .input('presentacion', sql.NVarChar, presentacion || '')
      .input('contenido_litros', sql.Decimal(8,2), contenido_litros || null)
      .input('costo_unitario', sql.Decimal(10,2), costo_unitario || null)
      .query('INSERT INTO Productos (nombre, descripcion, tipo, presentacion, contenido_litros, costo_unitario) VALUES (@nombre, @descripcion, @tipo, @presentacion, @contenido_litros, @costo_unitario)');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;