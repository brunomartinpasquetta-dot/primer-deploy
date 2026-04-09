const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre FROM variedades_frutilla WHERE activa = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre es obligatorio' });
    if (nombre.length > 100) return res.status(400).json({ error: 'Nombre demasiado largo (max 100)' });

    const pool = await getPool();
    const existing = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .query('SELECT id, nombre FROM variedades_frutilla WHERE UPPER(LTRIM(RTRIM(nombre))) = UPPER(LTRIM(RTRIM(@nombre)))');
    if (existing.recordset.length) {
      return res.json(existing.recordset[0]);
    }

    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .query('INSERT INTO variedades_frutilla (nombre, activa) OUTPUT INSERTED.id, INSERTED.nombre VALUES (@nombre, 1)');
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
