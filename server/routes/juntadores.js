const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Buscar juntador por QR
router.get('/qr/:codigo', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('codigo', sql.NVarChar, req.params.codigo)
      .query('SELECT id, nombre, apellido, qr_codigo FROM Juntadores WHERE qr_codigo = @codigo AND activo = 1');
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Juntador no encontrado' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener todos los juntadores
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre, apellido, qr_codigo FROM Juntadores WHERE activo = 1 ORDER BY apellido');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear juntador
router.post('/', async (req, res) => {
  try {
    const { nombre, apellido, qr_codigo, tipo } = req.body;
    const pool = await getPool();
    // Validar QR duplicado
    const qrCheck = await pool.request()
      .input('qr_codigo', sql.NVarChar, qr_codigo)
      .query('SELECT id FROM Juntadores WHERE qr_codigo = @qr_codigo');
    if (qrCheck.recordset.length > 0) {
      return res.status(400).json({ error: 'Ya existe un juntador con ese código QR' });
    }
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('apellido', sql.NVarChar, apellido)
      .input('qr_codigo', sql.NVarChar, qr_codigo)
      .input('tipo', sql.NVarChar, tipo || null)
      .query('INSERT INTO Juntadores (nombre, apellido, qr_codigo, tipo) VALUES (@nombre, @apellido, @qr_codigo, @tipo)');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;