function soloAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
}

function encargadoOAdmin(req, res, next) {
  if (!req.user || !['administrador', 'encargado'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }
  next();
}

module.exports = { soloAdmin, encargadoOAdmin };
