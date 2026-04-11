const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');

// ── GET /api/personal — lista de personal ────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const r = pool.request();
    let where = '';
    if (req.query.activo === '1' || req.query.activo === '0') {
      r.input('activo', sql.Bit, req.query.activo === '1' ? 1 : 0);
      where = 'WHERE p.activo = @activo';
    }
    const result = await r.query(
      `SELECT p.id, p.nombre, p.apellido, p.tipo_documento, p.documento, p.cuil,
              p.tipo_contrato, p.fecha_ingreso, p.activo, p.juntador_id,
              STUFF((SELECT ', ' + pr.rol FROM PersonalRoles pr
                     WHERE pr.personal_id = p.id AND pr.activo = 1
                     FOR XML PATH(''), TYPE).value('.','nvarchar(max)'), 1, 2, '') AS roles
       FROM Personal p ${where} ORDER BY p.apellido, p.nombre`
    );
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── GET /api/personal/roles-disponibles — lista de roles para el select ──
router.get('/roles-disponibles', async (req, res) => {
  try {
    res.json([
      { id: 'cosechero', nombre: 'Cosechero' },
      { id: 'despalillador', nombre: 'Despalillador' },
      { id: 'clasificador', nombre: 'Clasificador' },
      { id: 'campo_general', nombre: 'Campo general' }
    ]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── GET /api/personal/auditoria — historial de cambios ───────────
router.get('/auditoria', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT e.id, e.registro_id, e.campo, e.valor_anterior, e.valor_nuevo,
                     e.motivo, e.fecha_hora, u.nombre AS usuario_nombre,
                     p.nombre + ' ' + p.apellido AS empleado_nombre
              FROM EdicionesHistorial e
              LEFT JOIN Usuarios u ON e.usuario_id = u.id
              LEFT JOIN Personal p ON e.registro_id = p.id
              WHERE e.tabla = 'Personal'
              ORDER BY e.fecha_hora DESC`);
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
      .query(`SELECT p.*,
                STUFF((SELECT ', ' + pr.rol FROM PersonalRoles pr
                       WHERE pr.personal_id = p.id AND pr.activo = 1
                       FOR XML PATH(''), TYPE).value('.','nvarchar(max)'), 1, 2, '') AS roles
              FROM Personal p WHERE p.id = @id`);
    if (!result.recordset.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── POST /api/personal — crear empleado + roles + juntador ───────
router.post('/', async (req, res) => {
  try {
    const {
      nombre, apellido, tipo_documento, documento, cuil,
      fecha_nacimiento, nacionalidad, telefono, email,
      direccion, localidad, tipo_contrato, fecha_ingreso,
      fecha_egreso, observaciones, roles
    } = req.body;

    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!apellido || !apellido.trim()) return res.status(400).json({ error: 'El apellido es obligatorio' });

    const rolesArr = Array.isArray(roles) ? roles : (roles ? [roles] : []);

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const uid = req.user ? req.user.id : null;

      // 1. Crear Personal
      const result = await new sql.Request(transaction)
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
        .query(`INSERT INTO Personal
                  (nombre, apellido, tipo_documento, documento, cuil,
                   fecha_nacimiento, nacionalidad, telefono, email,
                   direccion, localidad, tipo_contrato, fecha_ingreso,
                   fecha_egreso, observaciones, activo)
                OUTPUT INSERTED.id
                VALUES
                  (@nombre, @apellido, @tipo_documento, @documento, @cuil,
                   @fecha_nacimiento, @nacionalidad, @telefono, @email,
                   @direccion, @localidad, @tipo_contrato, @fecha_ingreso,
                   @fecha_egreso, @observaciones, 1)`);
      const personalId = result.recordset[0].id;

      // 2. Crear Juntador vinculado (si hay roles operativos)
      if (rolesArr.length > 0) {
        const tipoJuntador = rolesArr.includes('cosechero') ? 'cosechero'
          : rolesArr.includes('despalillador') ? 'despalillador'
          : rolesArr.includes('clasificador') ? 'clasificador' : 'cosechero';
        const qrCode = 'QR-' + tipoJuntador.substring(0,3).toUpperCase() + '-' + String(personalId).padStart(4,'0');

        const juntRes = await new sql.Request(transaction)
          .input('nombre',      sql.NVarChar, nombre.trim())
          .input('apellido',    sql.NVarChar, apellido.trim())
          .input('qr_codigo',   sql.NVarChar, qrCode)
          .input('tipo',        sql.NVarChar, tipoJuntador)
          .input('personal_id', sql.Int,      personalId)
          .query(`INSERT INTO Juntadores (nombre, apellido, qr_codigo, tipo, activo, personal_id)
                  OUTPUT INSERTED.id
                  VALUES (@nombre, @apellido, @qr_codigo, @tipo, 1, @personal_id)`);
        const juntadorId = juntRes.recordset[0].id;

        // Vincular juntador_id en Personal
        await new sql.Request(transaction)
          .input('id', sql.Int, personalId)
          .input('jid', sql.Int, juntadorId)
          .query('UPDATE Personal SET juntador_id = @jid WHERE id = @id');

        // 3. Crear PersonalRoles
        for (const rol of rolesArr) {
          await new sql.Request(transaction)
            .input('personal_id', sql.Int,      personalId)
            .input('rol',         sql.NVarChar, rol)
            .query('INSERT INTO PersonalRoles (personal_id, rol, activo) VALUES (@personal_id, @rol, 1)');
        }
      }

      // 4. Auditoría: creación
      await new sql.Request(transaction)
        .input('tabla',       sql.NVarChar, 'Personal')
        .input('registro_id', sql.Int,      personalId)
        .input('campo',       sql.NVarChar, 'creacion')
        .input('valor_nuevo', sql.NVarChar, nombre.trim() + ' ' + apellido.trim() + (rolesArr.length ? ' [' + rolesArr.join(', ') + ']' : ''))
        .input('usuario_id',  sql.Int,      uid)
        .query(`INSERT INTO EdicionesHistorial (tabla, registro_id, campo, valor_nuevo, usuario_id, fecha_hora)
                VALUES (@tabla, @registro_id, @campo, @valor_nuevo, @usuario_id, GETDATE())`);

      await transaction.commit();
      res.json({ ok: true, id: personalId });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── PUT /api/personal/:id — edición con auditoría ─────────────────
router.put('/:id', async (req, res) => {
  try {
    const allowed = [
      'nombre', 'apellido', 'tipo_documento', 'documento', 'cuil',
      'fecha_nacimiento', 'nacionalidad', 'telefono', 'email',
      'direccion', 'localidad', 'tipo_contrato', 'fecha_ingreso',
      'fecha_egreso', 'observaciones'
    ];

    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    const id = parseInt(req.params.id);

    // Leer datos actuales para auditoría
    const prev = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Personal WHERE id = @id');
    if (!prev.recordset.length) return res.status(404).json({ error: 'No encontrado' });
    const old = prev.recordset[0];

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const typeMap = {
        nombre: sql.NVarChar(100), apellido: sql.NVarChar(100),
        tipo_documento: sql.NVarChar(20), documento: sql.NVarChar(30),
        cuil: sql.NVarChar(20), fecha_nacimiento: sql.Date,
        nacionalidad: sql.NVarChar(60), telefono: sql.NVarChar(30),
        email: sql.NVarChar(120), direccion: sql.NVarChar(200),
        localidad: sql.NVarChar(100), tipo_contrato: sql.NVarChar(30),
        fecha_ingreso: sql.Date, fecha_egreso: sql.Date,
        observaciones: sql.NVarChar(500)
      };

      const req2 = new sql.Request(transaction);
      req2.input('id', sql.Int, id);
      const sets = [];
      const cambios = [];

      for (const campo of allowed) {
        if (req.body[campo] !== undefined) {
          const val = (req.body[campo] === '' || req.body[campo] === null) ? null : req.body[campo];
          const oldVal = old[campo];
          if (String(val || '') !== String(oldVal || '')) {
            req2.input(campo, typeMap[campo], val);
            sets.push(`${campo} = @${campo}`);
            cambios.push({ campo, anterior: String(oldVal || ''), nuevo: String(val || '') });
          }
        }
      }

      if (!sets.length) { await transaction.rollback(); return res.json({ ok: true, sin_cambios: true }); }

      await req2.query(`UPDATE Personal SET ${sets.join(', ')} WHERE id = @id`);

      // Sincronizar nombre/apellido con Juntadores si cambió
      if (req.body.nombre || req.body.apellido) {
        const newNombre = req.body.nombre || old.nombre;
        const newApellido = req.body.apellido || old.apellido;
        if (old.juntador_id) {
          await new sql.Request(transaction)
            .input('jid', sql.Int, old.juntador_id)
            .input('nombre', sql.NVarChar, newNombre)
            .input('apellido', sql.NVarChar, newApellido)
            .query('UPDATE Juntadores SET nombre = @nombre, apellido = @apellido WHERE id = @jid');
        }
      }

      // Auditoría por cada campo cambiado
      for (const c of cambios) {
        await new sql.Request(transaction)
          .input('tabla',          sql.NVarChar, 'Personal')
          .input('registro_id',    sql.Int,      id)
          .input('campo',          sql.NVarChar, c.campo)
          .input('valor_anterior', sql.NVarChar, c.anterior)
          .input('valor_nuevo',    sql.NVarChar, c.nuevo)
          .input('usuario_id',     sql.Int,      uid)
          .query(`INSERT INTO EdicionesHistorial (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id, fecha_hora)
                  VALUES (@tabla, @registro_id, @campo, @valor_anterior, @valor_nuevo, @usuario_id, GETDATE())`);
      }

      await transaction.commit();
      res.json({ ok: true, cambios: cambios.length });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── DELETE /api/personal/:id — baja lógica con auditoría ─────────
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    const id = parseInt(req.params.id);
    const motivo = req.body && req.body.motivo ? req.body.motivo : null;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Baja lógica Personal
      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query('UPDATE Personal SET activo = 0 WHERE id = @id');

      // Baja lógica Juntador vinculado
      await new sql.Request(transaction)
        .input('pid', sql.Int, id)
        .query('UPDATE Juntadores SET activo = 0 WHERE personal_id = @pid');

      // Auditoría
      await new sql.Request(transaction)
        .input('tabla',          sql.NVarChar, 'Personal')
        .input('registro_id',    sql.Int,      id)
        .input('campo',          sql.NVarChar, 'baja')
        .input('valor_anterior', sql.NVarChar, 'activo')
        .input('valor_nuevo',    sql.NVarChar, 'inactivo')
        .input('usuario_id',     sql.Int,      uid)
        .input('motivo',         sql.NVarChar, motivo)
        .query(`INSERT INTO EdicionesHistorial (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id, fecha_hora, motivo)
                VALUES (@tabla, @registro_id, @campo, @valor_anterior, @valor_nuevo, @usuario_id, GETDATE(), @motivo)`);

      await transaction.commit();
      res.json({ ok: true });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
