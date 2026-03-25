const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getPool, sql } = require('../db');

// GET / — listar usuarios (solo admin)
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT id, nombre, usuario, rol, activo, creado_en
              FROM Usuarios ORDER BY nombre`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — crear usuario (solo admin)
router.post('/', async (req, res) => {
  const { nombre, usuario, password, rol } = req.body;
  if (!nombre || !usuario || !password || !rol) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const pool = await getPool();
    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('usuario', sql.NVarChar, usuario)
      .input('password_hash', sql.NVarChar, hash)
      .input('rol', sql.NVarChar, rol)
      .query(`INSERT INTO Usuarios (nombre, usuario, password_hash, rol)
              OUTPUT INSERTED.id
              VALUES (@nombre, @usuario, @password_hash, @rol)`);
    res.json({ ok: true, id: result.recordset[0].id });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique')) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — actualizar usuario (solo admin)
router.put('/:id', async (req, res) => {
  const { nombre, password, rol, activo } = req.body;
  try {
    const pool = await getPool();
    const dbReq = pool.request().input('id', sql.Int, req.params.id);
    let sets = [];
    if (nombre !== undefined) { dbReq.input('nombre', sql.NVarChar, nombre); sets.push('nombre = @nombre'); }
    if (rol !== undefined)    { dbReq.input('rol', sql.NVarChar, rol);       sets.push('rol = @rol'); }
    if (activo !== undefined) { dbReq.input('activo', sql.Bit, activo ? 1 : 0); sets.push('activo = @activo'); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      dbReq.input('password_hash', sql.NVarChar, hash);
      sets.push('password_hash = @password_hash');
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    await dbReq.query(`UPDATE Usuarios SET ${sets.join(', ')} WHERE id = @id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — desactivar usuario (solo admin)
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Usuarios SET activo = 0 WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
