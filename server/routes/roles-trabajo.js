const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET /api/roles-trabajo
// Lista todo el personal activo con sus roles asignados
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT
          p.id, p.nombre, p.apellido, p.qr_codigo,
          p.activo,
          ISNULL(
            (SELECT STRING_AGG(pr.rol, ',') FROM PersonalRoles pr WHERE pr.personal_id = p.id AND pr.activo = 1),
            ''
          ) AS roles,
          (SELECT j.id FROM Juntadores j WHERE j.personal_id = p.id) AS juntador_id
        FROM Personal p
        WHERE p.activo = 1
        ORDER BY p.apellido, p.nombre
      `);
    // Convertir roles string a array
    const data = result.recordset.map(r => ({
      ...r,
      roles: r.roles ? r.roles.split(',') : []
    }));
    res.json(data);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/roles-trabajo/asignar
// Body: { personal_id, rol }
// Asigna un rol a un empleado. Si no tiene entrada en Juntadores, la crea.
router.post('/asignar', async (req, res) => {
  try {
    const { personal_id, rol } = req.body;
    if (!personal_id || !rol) return res.status(400).json({ error: 'personal_id y rol son requeridos' });
    const rolesValidos = ['cosechero', 'despalillador', 'aplicador'];
    if (!rolesValidos.includes(rol)) return res.status(400).json({ error: 'Rol no válido' });

    const pool = await getPool();

    // Verificar que el empleado existe y está activo
    const pRes = await pool.request()
      .input('id', sql.Int, personal_id)
      .query('SELECT id, nombre, apellido, qr_codigo FROM Personal WHERE id = @id AND activo = 1');
    if (!pRes.recordset.length) return res.status(404).json({ error: 'Empleado no encontrado o inactivo' });
    const persona = pRes.recordset[0];

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Insertar rol (o reactivar si existía)
      await transaction.request()
        .input('personal_id', sql.Int, personal_id)
        .input('rol', sql.NVarChar, rol)
        .query(`
          IF EXISTS (SELECT 1 FROM PersonalRoles WHERE personal_id = @personal_id AND rol = @rol)
            UPDATE PersonalRoles SET activo = 1 WHERE personal_id = @personal_id AND rol = @rol
          ELSE
            INSERT INTO PersonalRoles (personal_id, rol) VALUES (@personal_id, @rol)
        `);

      // Si no tiene entrada en Juntadores, crearla automáticamente
      const jRes = await transaction.request()
        .input('personal_id', sql.Int, personal_id)
        .query('SELECT id FROM Juntadores WHERE personal_id = @personal_id');

      if (!jRes.recordset.length) {
        const qr = persona.qr_codigo || ('QR-' + personal_id + '-' + Date.now());
        await transaction.request()
          .input('nombre',      sql.NVarChar, persona.nombre)
          .input('apellido',    sql.NVarChar, persona.apellido)
          .input('qr_codigo',   sql.NVarChar, qr)
          .input('personal_id', sql.Int,      personal_id)
          .query(`INSERT INTO Juntadores (nombre, apellido, qr_codigo, activo, personal_id)
                  VALUES (@nombre, @apellido, @qr_codigo, 1, @personal_id)`);
        // Guardar el QR en Personal si no tenía
        if (!persona.qr_codigo) {
          await transaction.request()
            .input('id', sql.Int, personal_id)
            .input('qr', sql.NVarChar, qr)
            .query('UPDATE Personal SET qr_codigo = @qr WHERE id = @id');
        }
      }

      await transaction.commit();
      res.json({ ok: true });
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/roles-trabajo/quitar
// Body: { personal_id, rol }
router.post('/quitar', async (req, res) => {
  try {
    const { personal_id, rol } = req.body;
    if (!personal_id || !rol) return res.status(400).json({ error: 'personal_id y rol son requeridos' });

    const pool = await getPool();
    await pool.request()
      .input('personal_id', sql.Int, personal_id)
      .input('rol', sql.NVarChar, rol)
      .query('UPDATE PersonalRoles SET activo = 0 WHERE personal_id = @personal_id AND rol = @rol');

    // Si no quedan roles activos, desactivar en Juntadores también
    const rolesRes = await pool.request()
      .input('personal_id', sql.Int, personal_id)
      .query('SELECT COUNT(*) AS n FROM PersonalRoles WHERE personal_id = @personal_id AND activo = 1');
    if (rolesRes.recordset[0].n === 0) {
      await pool.request()
        .input('personal_id', sql.Int, personal_id)
        .query('UPDATE Juntadores SET activo = 0 WHERE personal_id = @personal_id');
    } else {
      await pool.request()
        .input('personal_id', sql.Int, personal_id)
        .query('UPDATE Juntadores SET activo = 1 WHERE personal_id = @personal_id');
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/roles-trabajo/por-rol/:rol
// Devuelve lista de juntadores activos con ese rol (para usar en juntada/despalillado/aplicaciones)
router.get('/por-rol/:rol', async (req, res) => {
  try {
    const { rol } = req.params;
    const pool = await getPool();
    const result = await pool.request()
      .input('rol', sql.NVarChar, rol)
      .query(`
        SELECT j.id, j.nombre, j.apellido, j.qr_codigo, p.id AS personal_id
        FROM Juntadores j
        JOIN Personal p ON j.personal_id = p.id
        JOIN PersonalRoles pr ON pr.personal_id = p.id
        WHERE pr.rol = @rol AND pr.activo = 1 AND j.activo = 1 AND p.activo = 1
        ORDER BY j.apellido, j.nombre
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
