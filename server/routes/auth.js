const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = '8h';

// ── Rate limiting para login ──────────────────────────────────────
const _loginAttempts = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos

function checkRateLimit(ip) {
  const now = Date.now();
  const record = _loginAttempts.get(ip);
  if (!record) return true;
  const recent = record.filter(t => now - t < RATE_LIMIT_WINDOW);
  if (recent.length === 0) { _loginAttempts.delete(ip); return true; }
  _loginAttempts.set(ip, recent);
  return recent.length < RATE_LIMIT_MAX;
}

function recordFailedLogin(ip) {
  const record = _loginAttempts.get(ip) || [];
  record.push(Date.now());
  _loginAttempts.set(ip, record);
}

function clearLoginAttempts(ip) {
  _loginAttempts.delete(ip);
}

// Crea la tabla Usuarios y un admin por defecto si no existe
async function ensureUsersTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Usuarios')
    BEGIN
      CREATE TABLE Usuarios (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        nombre     NVARCHAR(100) NOT NULL,
        usuario    NVARCHAR(50)  NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        rol        NVARCHAR(20)  NOT NULL DEFAULT 'encargado',
        activo     BIT           NOT NULL DEFAULT 1,
        creado_en  DATETIME      NOT NULL DEFAULT GETDATE()
      )
    END
  `);
  // Si no hay ningún usuario, crear admin por defecto.
  // En producción: setear ADMIN_DEFAULT_PASSWORD en .env antes del primer arranque.
  // Si se usa el fallback 'admin123', emitir warning crítico en consola.
  const count = await pool.request().query('SELECT COUNT(*) AS n FROM Usuarios');
  if (count.recordset[0].n === 0) {
    const defaultPass = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    if (defaultPass === 'admin123') {
      console.warn('[SECURITY] Admin creado con password default "admin123". Cambialo inmediatamente desde la UI.');
    }
    const hash = await bcrypt.hash(defaultPass, 10);
    await pool.request()
      .input('nombre', sql.NVarChar, 'Administrador')
      .input('usuario', sql.NVarChar, 'admin')
      .input('password_hash', sql.NVarChar, hash)
      .input('rol', sql.NVarChar, 'administrador')
      .query(`INSERT INTO Usuarios (nombre, usuario, password_hash, rol)
              VALUES (@nombre, @usuario, @password_hash, @rol)`);
  }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos, esperá 15 minutos' });
  }

  const { usuario, password } = req.body;
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  try {
    const pool = await getPool();
    await ensureUsersTable(pool);

    const result = await pool.request()
      .input('usuario', sql.NVarChar, usuario)
      .query(`SELECT id, nombre, usuario, password_hash, rol
              FROM Usuarios WHERE usuario = @usuario AND activo = 1`);

    if (result.recordset.length === 0) {
      recordFailedLogin(ip);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const user = result.recordset[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      recordFailedLogin(ip);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    clearLoginAttempts(ip);
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({ ok: true, token, nombre: user.nombre, rol: user.rol });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // JWT es stateless — el cliente elimina el token
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({ id: payload.id, nombre: payload.nombre, usuario: payload.usuario, rol: payload.rol });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;
