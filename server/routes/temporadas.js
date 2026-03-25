const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');

function calcDias(fecha_inicio) {
  if (!fecha_inicio) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(fecha_inicio).getTime()) / 86400000));
}

// ── GET /api/temporadas/activas — TODAS las activas con cultivo ──
router.get('/activas', async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query(`SELECT id, nombre, tipo, cultivo, descripcion, fecha_inicio, fecha_fin
              FROM Temporadas WHERE activa = 1 ORDER BY id DESC`);
    res.json(result.recordset.map(t => ({ ...t, dias_transcurridos: calcDias(t.fecha_inicio) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/temporadas/activa — compat: la más reciente si hay una, null si hay varias
router.get('/activa', async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query(`SELECT id, nombre, tipo, cultivo, descripcion, fecha_inicio
              FROM Temporadas WHERE activa = 1 ORDER BY id DESC`);
    if (!result.recordset.length) return res.json(null);
    if (result.recordset.length > 1)  return res.json(null); // múltiples activas → null
    const t = result.recordset[0];
    res.json({ ...t, dias_transcurridos: calcDias(t.fecha_inicio) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/temporadas — lista completa ────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query(`SELECT id, nombre, tipo, cultivo, descripcion, fecha_inicio, fecha_fin, activa
              FROM Temporadas ORDER BY id DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/temporadas ─────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { nombre, tipo, cultivo, descripcion, fecha_inicio, fecha_fin } = req.body;
    const pool = await getPool();
    const tx   = pool.transaction();
    await tx.begin();
    try {
      // Desactivar cualquier campaña activa anterior
      await tx.request().query('UPDATE Temporadas SET activa = 0 WHERE activa = 1');
      // Insertar nueva campaña como activa
      await tx.request()
        .input('nombre',       sql.NVarChar(100), nombre)
        .input('tipo',         sql.NVarChar(20),  tipo         || 'plena')
        .input('cultivo',      sql.NVarChar(50),  cultivo      || null)
        .input('descripcion',  sql.NVarChar(200), descripcion  || null)
        .input('fecha_inicio', sql.Date,          fecha_inicio || null)
        .input('fecha_fin',    sql.Date,          fecha_fin    || null)
        .query(`INSERT INTO Temporadas (nombre, tipo, cultivo, descripcion, fecha_inicio, fecha_fin, activa)
                VALUES (@nombre, @tipo, @cultivo, @descripcion, @fecha_inicio, @fecha_fin, 1)`);
      await tx.commit();
      res.json({ ok: true });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/temporadas/:id — actualización parcial ──────────────
router.put('/:id', async (req, res) => {
  try {
    const { activa, nombre, tipo, cultivo, descripcion, fecha_inicio, fecha_fin } = req.body;
    const pool = await getPool();

    // Activar campaña: desactivar el resto primero (transacción)
    if (activa === 1 || activa === true) {
      const tx = pool.transaction();
      await tx.begin();
      try {
        await tx.request().query('UPDATE Temporadas SET activa = 0 WHERE activa = 1');
        await tx.request()
          .input('id', sql.Int, req.params.id)
          .query('UPDATE Temporadas SET activa = 1 WHERE id = @id');
        await tx.commit();
        return res.json({ ok: true });
      } catch (e) {
        await tx.rollback();
        throw e;
      }
    }

    // Actualización parcial de otros campos (incluyendo desactivar)
    const req2 = pool.request().input('id', sql.Int, req.params.id);
    const sets = [];
    if (activa       !== undefined) { req2.input('activa',       sql.Bit,           activa === 0 || activa === false ? 0 : 1); sets.push('activa = @activa'); }
    if (nombre       !== undefined) { req2.input('nombre',       sql.NVarChar(100), nombre);               sets.push('nombre = @nombre'); }
    if (tipo         !== undefined) { req2.input('tipo',         sql.NVarChar(20),  tipo);                 sets.push('tipo = @tipo'); }
    if (cultivo      !== undefined) { req2.input('cultivo',      sql.NVarChar(50),  cultivo || null);      sets.push('cultivo = @cultivo'); }
    if (descripcion  !== undefined) { req2.input('descripcion',  sql.NVarChar(200), descripcion || null);  sets.push('descripcion = @descripcion'); }
    if (fecha_inicio !== undefined) { req2.input('fecha_inicio', sql.Date,          fecha_inicio || null); sets.push('fecha_inicio = @fecha_inicio'); }
    if (fecha_fin    !== undefined) { req2.input('fecha_fin',    sql.Date,          fecha_fin    || null);  sets.push('fecha_fin = @fecha_fin'); }

    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    await req2.query(`UPDATE Temporadas SET ${sets.join(', ')} WHERE id = @id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
