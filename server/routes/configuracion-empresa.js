const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET / — Obtener datos de la empresa (registro único)
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT TOP 1 * FROM ConfiguracionEmpresa');
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT / — Actualizar datos de la empresa
router.put('/', async (req, res) => {
  try {
    const {
      razon_social, cuit, rne, rnpa, renspa,
      direccion, localidad, provincia,
      telefono, email, observacion
    } = req.body;

    const pool = await getPool();
    await pool.request()
      .input('razon_social', sql.NVarChar, razon_social || null)
      .input('cuit', sql.NVarChar, cuit || null)
      .input('rne', sql.NVarChar, rne || null)
      .input('rnpa', sql.NVarChar, rnpa || null)
      .input('renspa', sql.NVarChar, renspa || null)
      .input('direccion', sql.NVarChar, direccion || null)
      .input('localidad', sql.NVarChar, localidad || null)
      .input('provincia', sql.NVarChar, provincia || null)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('email', sql.NVarChar, email || null)
      .input('observacion', sql.NVarChar, observacion || null)
      .query(`UPDATE ConfiguracionEmpresa SET
                razon_social = @razon_social,
                cuit = @cuit,
                rne = @rne,
                rnpa = @rnpa,
                renspa = @renspa,
                direccion = @direccion,
                localidad = @localidad,
                provincia = @provincia,
                telefono = @telefono,
                email = @email,
                observacion = @observacion,
                actualizado_en = GETDATE()`);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
