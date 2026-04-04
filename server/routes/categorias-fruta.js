const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET / — List active categories
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre, tamano, madurez FROM CategoriasFruta WHERE activo = 1 ORDER BY tamano, madurez');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /todas — List ALL categories including inactive
router.get('/todas', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre, tamano, madurez, activo FROM CategoriasFruta ORDER BY tamano, madurez');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — Create new category
router.post('/', async (req, res) => {
  try {
    const { nombre, tamano, madurez } = req.body;

    if (!nombre || !tamano || !madurez) {
      return res.status(400).json({ error: 'nombre, tamano y madurez son obligatorios' });
    }
    if (!['grande', 'media', 'chica'].includes(tamano)) {
      return res.status(400).json({ error: 'tamano debe ser grande, media o chica' });
    }
    if (!['madura', 'pintona'].includes(madurez)) {
      return res.status(400).json({ error: 'madurez debe ser madura o pintona' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('tamano', sql.NVarChar, tamano)
      .input('madurez', sql.NVarChar, madurez)
      .query(`INSERT INTO CategoriasFruta (nombre, tamano, madurez)
              OUTPUT INSERTED.id
              VALUES (@nombre, @tamano, @madurez)`);
    res.json({ ok: true, id: result.recordset[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — Update category (partial)
router.put('/:id', async (req, res) => {
  try {
    const { nombre, tamano, madurez, activo } = req.body;

    if (tamano && !['grande', 'media', 'chica'].includes(tamano)) {
      return res.status(400).json({ error: 'tamano debe ser grande, media o chica' });
    }
    if (madurez && !['madura', 'pintona'].includes(madurez)) {
      return res.status(400).json({ error: 'madurez debe ser madura o pintona' });
    }

    const sets = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, req.params.id);

    if (nombre !== undefined) {
      request.input('nombre', sql.NVarChar, nombre);
      sets.push('nombre=@nombre');
    }
    if (tamano !== undefined) {
      request.input('tamano', sql.NVarChar, tamano);
      sets.push('tamano=@tamano');
    }
    if (madurez !== undefined) {
      request.input('madurez', sql.NVarChar, madurez);
      sets.push('madurez=@madurez');
    }
    if (activo !== undefined) {
      request.input('activo', sql.Bit, activo);
      sets.push('activo=@activo');
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
    }

    await request.query(`UPDATE CategoriasFruta SET ${sets.join(', ')} WHERE id=@id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/toggle — Toggle active/inactive
router.put('/:id/toggle', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE CategoriasFruta SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END WHERE id=@id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
