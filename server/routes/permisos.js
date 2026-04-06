const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');

// ── Catálogo de permisos ──────────────────────────────────────────
const PERMISOS = [
  { key: 'cosecha',             label: 'Cosecha / Juntada',          grupo: 'Campo' },
  { key: 'despalillado',        label: 'Despalillado',                grupo: 'Campo' },
  { key: 'aplicaciones',        label: 'Aplicaciones',                grupo: 'Campo' },
  { key: 'stock_mercaderia',    label: 'Stock Mercadería',            grupo: 'Stock' },
  { key: 'stock_insumos',       label: 'Stock Insumos',               grupo: 'Stock' },
  { key: 'compras',             label: 'Compras',                     grupo: 'Comercial' },
  { key: 'ventas',              label: 'Ventas',                      grupo: 'Comercial' },
  { key: 'proveedores',         label: 'Proveedores',                 grupo: 'Comercial' },
  { key: 'clientes',            label: 'Clientes',                    grupo: 'Comercial' },
  { key: 'caja',                label: 'Caja',                        grupo: 'Administración' },
  { key: 'balance',             label: 'Balance',                     grupo: 'Administración' },
  { key: 'gastos',              label: 'Gastos',                      grupo: 'Administración' },
  { key: 'cheques',             label: 'Cheques',                     grupo: 'Administración' },
  { key: 'pagos',               label: 'Pagos a proveedores',         grupo: 'Administración' },
  { key: 'parcelas',           label: 'Parcelas',                       grupo: 'Configuración' },
  { key: 'personal',            label: 'Personal / Juntadores',       grupo: 'Configuración' },
  { key: 'depositos',           label: 'Depósitos',                   grupo: 'Configuración' },
  { key: 'productos',           label: 'Productos',                   grupo: 'Configuración' },
  { key: 'temporadas',          label: 'Temporadas',                  grupo: 'Configuración' },
  { key: 'reportes',            label: 'Reportes',                    grupo: 'Otros' },
  { key: 'mercado',             label: 'Cotizaciones / Mercado',      grupo: 'Otros' },
  { key: 'usuarios',            label: 'Gestión de Usuarios',         grupo: 'Otros' },
  { key: 'editar_movimientos',  label: 'Editar movimientos de stock', grupo: 'Otros' },
];

const ROLES = ['administrador', 'ingeniero', 'encargado', 'usuario'];

const DEFAULTS = {
  administrador: PERMISOS.map(p => p.key),
  ingeniero:  ['cosecha','despalillado','aplicaciones','stock_insumos','stock_mercaderia',
               'compras','proveedores','parcelas','personal','depositos','productos','temporadas',
               'reportes','mercado','editar_movimientos'],
  encargado:  ['cosecha','despalillado','aplicaciones','stock_mercaderia','stock_insumos',
               'compras','proveedores','parcelas','personal','productos'],
  usuario:    ['cosecha','despalillado'],
};

async function ensureTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PermisosRol')
    BEGIN
      CREATE TABLE PermisosRol (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        rol        NVARCHAR(20) NOT NULL,
        permiso    NVARCHAR(50) NOT NULL,
        habilitado BIT NOT NULL DEFAULT 1,
        CONSTRAINT UQ_PermisosRol UNIQUE (rol, permiso)
      )
    END
  `);
  const count = await pool.request().query('SELECT COUNT(*) AS n FROM PermisosRol');
  if (count.recordset[0].n === 0) {
    for (const rol of ROLES) {
      for (const p of PERMISOS) {
        const hab = (DEFAULTS[rol] || []).includes(p.key) ? 1 : 0;
        await pool.request()
          .input('rol',        sql.NVarChar, rol)
          .input('permiso',    sql.NVarChar, p.key)
          .input('habilitado', sql.Bit,      hab)
          .query(`INSERT INTO PermisosRol (rol, permiso, habilitado) VALUES (@rol, @permiso, @habilitado)`);
      }
    }
  }
}

// GET /api/permisos  — todos los roles + catálogo (para la UI de admin)
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    await ensureTable(pool);
    const result = await pool.request()
      .query('SELECT rol, permiso, habilitado FROM PermisosRol ORDER BY rol, permiso');
    const data = {};
    for (const row of result.recordset) {
      if (!data[row.rol]) data[row.rol] = {};
      data[row.rol][row.permiso] = !!row.habilitado;
    }
    res.json({ catalogo: PERMISOS, roles: ROLES, data });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/permisos/mi-rol  — lista de claves habilitadas para el rol del usuario actual
router.get('/mi-rol', async (req, res) => {
  const rol = req.user ? req.user.rol : 'usuario';
  try {
    const pool = await getPool();
    await ensureTable(pool);
    const result = await pool.request()
      .input('rol', sql.NVarChar, rol)
      .query('SELECT permiso FROM PermisosRol WHERE rol = @rol AND habilitado = 1');
    res.json(result.recordset.map(r => r.permiso));
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /api/permisos/:rol/:permiso  — actualizar un permiso (solo admin)
router.put('/:rol/:permiso', async (req, res) => {
  const { rol, permiso } = req.params;
  const { habilitado } = req.body;
  if (!ROLES.includes(rol))                   return res.status(400).json({ error: 'Rol inválido' });
  if (!PERMISOS.find(p => p.key === permiso)) return res.status(400).json({ error: 'Permiso inválido' });
  try {
    const pool = await getPool();
    await ensureTable(pool);
    await pool.request()
      .input('rol',        sql.NVarChar, rol)
      .input('permiso',    sql.NVarChar, permiso)
      .input('habilitado', sql.Bit,      habilitado ? 1 : 0)
      .query(`
        IF EXISTS (SELECT 1 FROM PermisosRol WHERE rol=@rol AND permiso=@permiso)
          UPDATE PermisosRol SET habilitado=@habilitado WHERE rol=@rol AND permiso=@permiso
        ELSE
          INSERT INTO PermisosRol (rol, permiso, habilitado) VALUES (@rol, @permiso, @habilitado)
      `);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
