const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');

// ── GET /api/personal — lista de personal ────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const req2 = pool.request();
    let where = '';
    if (req.query.activo === '1' || req.query.activo === '0') {
      req2.input('activo', sql.Bit, req.query.activo === '1' ? 1 : 0);
      where = 'WHERE activo = @activo';
    }
    const result = await req2.query(
      `SELECT id, nombre, apellido, tipo_documento, documento, cuil,
              tipo_contrato, fecha_ingreso, activo
       FROM Personal ${where} ORDER BY apellido, nombre`
    );
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── GET /api/personal/:id — detalle de un empleado ───────────────
router.get('/:id', async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM Personal WHERE id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── POST /api/personal — crear empleado ──────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      nombre, apellido, tipo_documento, documento, cuil,
      fecha_nacimiento, nacionalidad, telefono, email,
      direccion, localidad, tipo_contrato, fecha_ingreso,
      fecha_egreso, observaciones, juntador_id
    } = req.body;

    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!apellido || !apellido.trim()) return res.status(400).json({ error: 'El apellido es obligatorio' });

    const pool = await getPool();
    await pool.request()
      .input('nombre',          sql.NVarChar(100), nombre.trim())
      .input('apellido',        sql.NVarChar(100), apellido.trim())
      .input('tipo_documento',  sql.NVarChar(20),  tipo_documento   || null)
      .input('documento',       sql.NVarChar(30),  documento        || null)
      .input('cuil',            sql.NVarChar(20),  cuil             || null)
      .input('fecha_nacimiento',sql.Date,          fecha_nacimiento || null)
      .input('nacionalidad',    sql.NVarChar(60),  nacionalidad     || null)
      .input('telefono',        sql.NVarChar(30),  telefono         || null)
      .input('email',           sql.NVarChar(120), email            || null)
      .input('direccion',       sql.NVarChar(200), direccion        || null)
      .input('localidad',       sql.NVarChar(100), localidad        || null)
      .input('tipo_contrato',   sql.NVarChar(30),  tipo_contrato    || null)
      .input('fecha_ingreso',   sql.Date,          fecha_ingreso    || null)
      .input('fecha_egreso',    sql.Date,          fecha_egreso     || null)
      .input('observaciones',   sql.NVarChar(500), observaciones    || null)
      .input('juntador_id',     sql.Int,           juntador_id      || null)
      .query(`INSERT INTO Personal
                (nombre, apellido, tipo_documento, documento, cuil,
                 fecha_nacimiento, nacionalidad, telefono, email,
                 direccion, localidad, tipo_contrato, fecha_ingreso,
                 fecha_egreso, observaciones, juntador_id, activo)
              VALUES
                (@nombre, @apellido, @tipo_documento, @documento, @cuil,
                 @fecha_nacimiento, @nacionalidad, @telefono, @email,
                 @direccion, @localidad, @tipo_contrato, @fecha_ingreso,
                 @fecha_egreso, @observaciones, @juntador_id, 1)`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── PUT /api/personal/:id — actualización parcial ─────────────────
router.put('/:id', async (req, res) => {
  try {
    const allowed = [
      'nombre', 'apellido', 'tipo_documento', 'documento', 'cuil',
      'fecha_nacimiento', 'nacionalidad', 'telefono', 'email',
      'direccion', 'localidad', 'tipo_contrato', 'fecha_ingreso',
      'fecha_egreso', 'observaciones', 'juntador_id'
    ];

    const pool = await getPool();
    const req2 = pool.request().input('id', sql.Int, req.params.id);
    const sets = [];

    const typeMap = {
      nombre:           sql.NVarChar(100),
      apellido:         sql.NVarChar(100),
      tipo_documento:   sql.NVarChar(20),
      documento:        sql.NVarChar(30),
      cuil:             sql.NVarChar(20),
      fecha_nacimiento: sql.Date,
      nacionalidad:     sql.NVarChar(60),
      telefono:         sql.NVarChar(30),
      email:            sql.NVarChar(120),
      direccion:        sql.NVarChar(200),
      localidad:        sql.NVarChar(100),
      tipo_contrato:    sql.NVarChar(30),
      fecha_ingreso:    sql.Date,
      fecha_egreso:     sql.Date,
      observaciones:    sql.NVarChar(500),
      juntador_id:      sql.Int,
    };

    for (const campo of allowed) {
      if (req.body[campo] !== undefined) {
        const val = (req.body[campo] === '' || req.body[campo] === null) ? null : req.body[campo];
        req2.input(campo, typeMap[campo], val);
        sets.push(`${campo} = @${campo}`);
      }
    }

    if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    await req2.query(`UPDATE Personal SET ${sets.join(', ')} WHERE id = @id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── DELETE /api/personal/:id — baja lógica ───────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Personal SET activo = 0 WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
