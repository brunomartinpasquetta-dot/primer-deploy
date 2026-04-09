// ── Auth Check — incluir en todos los HTML protegidos ──────────────
(function () {
  var ADMIN_ONLY_PAGES = [
    'balance.html', 'caja.html', 'cheques.html', 'pagos.html',
    'gastos.html', 'cuentas-proveedores.html', 'cuentas-clientes.html',
    'menu-admin.html', 'usuarios.html', 'admin.html', 'remitos.html'
  ];
  var ADMIN_ONLY_HREFS = ADMIN_ONLY_PAGES;

  var currentPage = location.pathname.split('/').pop() || 'index.html';
  var token = localStorage.getItem('cosecha_token');

  // Sin token → login
  if (!token) {
    location.href = 'login.html';
    return;
  }

  // Decodificar payload del JWT (sin verificación criptográfica — eso lo hace el server)
  var payload;
  try {
    payload = JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    localStorage.removeItem('cosecha_token');
    location.href = 'login.html';
    return;
  }

  // Token expirado
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    localStorage.removeItem('cosecha_token');
    location.href = 'login.html';
    return;
  }

  var rol    = payload.rol;
  var nombre = payload.nombre;

  // Exponer usuario globalmente para uso en páginas
  window.cosechaUser = { id: payload.id, nombre: nombre, rol: rol };

  // Interceptar fetch global para inyectar Authorization header automáticamente
  // IMPORTANTE: debe montarse ANTES de cualquier fetch a /api/
  var _fetch = window.fetch;
  window.fetch = function (url, options) {
    options = options || {};
    if (typeof url === 'string' && url.startsWith('/api/')) {
      options.headers = Object.assign({}, options.headers, {
        'Authorization': 'Bearer ' + localStorage.getItem('cosecha_token')
      });
    }
    return _fetch(url, options).then(function (res) {
      if (res.status === 401) {
        localStorage.removeItem('cosecha_token');
        location.href = 'login.html';
      }
      return res;
    });
  };

  // Cargar permisos desde caché localStorage, refrescar async
  var _cachedPerms = [];
  try { _cachedPerms = JSON.parse(localStorage.getItem('cosecha_permisos') || '[]'); } catch(e) {}
  window.cosechaPermisos = _cachedPerms;
  window.tienePermiso = function(p) { return window.cosechaPermisos.includes(p); };
  // Refresh async (sin bloquear) — interceptor ya montado, envía Authorization
  fetch('/api/permisos/mi-rol').then(function(r){ return r.json(); }).then(function(data){
    if (Array.isArray(data)) {
      localStorage.setItem('cosecha_permisos', JSON.stringify(data));
      window.cosechaPermisos = data;
    }
  }).catch(function(){});

  // No-admin intenta acceder a página admin → redirigir
  if (rol !== 'administrador' && ADMIN_ONLY_PAGES.includes(currentPage)) {
    location.href = 'index.html';
    return;
  }

  // Cuando el DOM esté listo, agregar UI de usuario
  document.addEventListener('DOMContentLoaded', function () {
    // Nombre de usuario en topbar
    var topbarRight = document.querySelector('.topbar-right');
    if (topbarRight) {
      var userChip = document.createElement('span');
      userChip.id = 'topbar-user';
      userChip.style.cssText = 'color:rgba(255,255,255,0.85);font-size:13px;margin-right:8px;display:flex;align-items:center;gap:6px;';
      userChip.setAttribute('data-tooltip', 'Usuario logueado — click para cerrar sesión');
      userChip.style.cursor = 'pointer';
      userChip.onclick = function() { window.cerrarSesion && window.cerrarSesion(); };
      userChip.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>' +
        nombre;
      topbarRight.insertBefore(userChip, topbarRight.firstChild);
    }

    // Botón logout en sidebar footer
    var sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter) {
      sidebarFooter.innerHTML =
        '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px;">' + nombre + ' · ' + rol + '</div>' +
        '<button onclick="cerrarSesion()" data-tooltip="Cerrar sesión del sistema" style="width:100%;padding:8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:rgba(255,255,255,0.7);font-size:12px;cursor:pointer;">Cerrar sesión</button>';
    }

    // Ocultar ítems admin en sidebar si no es admin
    if (rol !== 'administrador') {
      ADMIN_ONLY_HREFS.forEach(function (href) {
        document.querySelectorAll('a[href="' + href + '"]').forEach(function (el) {
          // Ocultar el ítem y su posible nav-section anterior si queda vacía
          el.style.display = 'none';
        });
      });
      // Ocultar la sección "Administración" si queda sin ítems visibles
      document.querySelectorAll('.nav-section').forEach(function (section) {
        var next = section.nextElementSibling;
        var hasVisible = false;
        while (next && !next.classList.contains('nav-section')) {
          if (next.style.display !== 'none') hasVisible = true;
          next = next.nextElementSibling;
        }
        if (!hasVisible) section.style.display = 'none';
      });
    }
  });

  // Función global para cerrar sesión
  window.cerrarSesion = function () {
    fetch('/api/auth/logout', { method: 'POST' }).finally(function () {
      localStorage.removeItem('cosecha_token');
      location.href = 'login.html';
    });
  };
})();
