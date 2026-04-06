const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// ══════════════════════════════════════════════════════════════════
// CATEGORÍAS PADRE (fijas: Chica, Mediana, Grande, Descarte)
// ══════════════════════════════════════════════════════════════════

// GET / — Categorías activas con sus sub-categorías
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const catRes = await pool.request()
      .query(`SELECT id, nombre, codigo, orden, es_descarte, activo, es_fija
              FROM CategoriasClasificacion
              WHERE activo = 1
              ORDER BY orden`);

    const subRes = await pool.request()
      .query(`SELECT id, categoria_padre_id, nombre, codigo, activo
              FROM SubCategoriasClasificacion
              WHERE activo = 1
              ORDER BY nombre`);

    const categorias = catRes.recordset.map(cat => ({
      ...cat,
      sub_categorias: subRes.recordset.filter(s => s.categoria_padre_id === cat.id)
    }));

    res.json(categorias);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /todas — Todas las categorías (activas e inactivas) con sub-categorías
router.get('/todas', async (req, res) => {
  try {
    const pool = await getPool();
    const catRes = await pool.request()
      .query(`SELECT id, nombre, codigo, orden, es_descarte, activo, es_fija
              FROM CategoriasClasificacion
              ORDER BY orden`);

    const subRes = await pool.request()
      .query(`SELECT id, categoria_padre_id, nombre, codigo, activo
              FROM SubCategoriasClasificacion
              ORDER BY nombre`);

    const categorias = catRes.recordset.map(cat => ({
      ...cat,
      sub_categorias: subRes.recordset.filter(s => s.categoria_padre_id === cat.id)
    }));

    res.json(categorias);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ══════════════════════════════════════════════════════════════════
// SUB-CATEGORÍAS (definidas por el usuario)
// ══════════════════════════════════════════════════════════════════

// GET /sub-categorias/:categoriaId — Sub-categorías de una categoría padre
router.get('/sub-categorias/:categoriaId', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('categoriaId', sql.Int, req.params.categoriaId)
      .query(`SELECT id, categoria_padre_id, nombre, codigo, activo
              FROM SubCategoriasClasificacion
              WHERE categoria_padre_id = @categoriaId AND activo = 1
              ORDER BY nombre`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /sub-categorias — Crear sub-categoría
router.post('/sub-categorias', async (req, res) => {
  try {
    const { categoria_padre_id, nombre, codigo } = req.body;

    if (!categoria_padre_id || !nombre || !codigo) {
      return res.status(400).json({ error: 'categoria_padre_id, nombre y codigo son obligatorios' });
    }

    if (codigo.length > 10) {
      return res.status(400).json({ error: 'El código no puede tener más de 10 caracteres' });
    }

    const pool = await getPool();

    // Verificar que la categoría padre existe
    const catRes = await pool.request()
      .input('id', sql.Int, categoria_padre_id)
      .query('SELECT id FROM CategoriasClasificacion WHERE id = @id');
    if (!catRes.recordset.length) {
      return res.status(404).json({ error: 'Categoría padre no encontrada' });
    }

    const result = await pool.request()
      .input('categoria_padre_id', sql.Int, categoria_padre_id)
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('codigo', sql.NVarChar, codigo.trim().toUpperCase())
      .query(`INSERT INTO SubCategoriasClasificacion (categoria_padre_id, nombre, codigo)
              OUTPUT INSERTED.id, INSERTED.categoria_padre_id, INSERTED.nombre, INSERTED.codigo
              VALUES (@categoria_padre_id, @nombre, @codigo)`);

    res.json({ ok: true, sub_categoria: result.recordset[0] });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ya existe una sub-categoría con ese nombre en esta categoría' });
    }
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /sub-categorias/:id — Editar sub-categoría
router.put('/sub-categorias/:id', async (req, res) => {
  try {
    const { nombre, codigo } = req.body;
    const sets = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, req.params.id);

    if (nombre !== undefined) {
      request.input('nombre', sql.NVarChar, nombre.trim());
      sets.push('nombre = @nombre');
    }
    if (codigo !== undefined) {
      if (codigo.length > 10) {
        return res.status(400).json({ error: 'El código no puede tener más de 10 caracteres' });
      }
      request.input('codigo', sql.NVarChar, codigo.trim().toUpperCase());
      sets.push('codigo = @codigo');
    }

    if (!sets.length) {
      return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
    }

    await request.query(`UPDATE SubCategoriasClasificacion SET ${sets.join(', ')} WHERE id = @id`);
    res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ya existe una sub-categoría con ese nombre en esta categoría' });
    }
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /sub-categorias/:id/toggle — Activar/desactivar sub-categoría
router.put('/sub-categorias/:id/toggle', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE SubCategoriasClasificacion SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /sub-categorias/:id — Eliminar sub-categoría (solo si no tiene clasificaciones)
router.delete('/sub-categorias/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const id = parseInt(req.params.id);

    // Verificar que no hay clasificaciones usando esta sub-categoría
    const usageRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT COUNT(*) AS cnt FROM Clasificacion WHERE sub_categoria_id = @id AND estado != 'anulada'`);

    if (usageRes.recordset[0].cnt > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: tiene clasificaciones asociadas. Desactivála en su lugar.' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM SubCategoriasClasificacion WHERE id = @id');

    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
