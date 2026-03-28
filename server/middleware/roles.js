const ROLES_VALIDOS = ['administrador', 'ingeniero', 'encargado', 'usuario'];

function soloAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
}

// encargado, ingeniero y admin — NO usuario básico
function encargadoOAdmin(req, res, next) {
  if (!req.user || !['administrador', 'ingeniero', 'encargado'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }
  next();
}

// Cualquier rol válido (para rutas de campo accesibles a rol=usuario)
function todosLosRoles(req, res, next) {
  if (!req.user || !ROLES_VALIDOS.includes(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }
  next();
}

module.exports = { soloAdmin, encargadoOAdmin, todosLosRoles };
