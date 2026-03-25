const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Registrar despalillado
router.post('/', async (req, res) => {
  try {
    const { lote_id, despalillador_id, kilos, operador } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('lote_id', sql.Int, lote_id)
      .input('despalillador_id', sql.Int, despalillador_id)
      .input('kilos', sql.Decimal(8,2), kilos)
      .input('operador', sql.NVarChar, operador || '')
      .query(`INSERT INTO Despalillado (lote_id, despalillador_id, kilos, operador)
              VALUES (@lote_id, @despalillador_id, @kilos, @operador)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener despalillados del día
router.get('/hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT d.id, l.nombre AS lote,
              ju.apellido + ', ' + ju.nombre AS despalillador,
              d.kilos, d.fecha_hora
              FROM Despalillado d
              JOIN Lotes l ON d.lote_id = l.id
              JOIN Juntadores ju ON d.despalillador_id = ju.id
              WHERE CAST(d.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY d.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;