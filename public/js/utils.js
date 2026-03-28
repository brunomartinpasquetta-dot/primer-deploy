function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = 'Guardando...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

// ── Formato de números con punto como separador de miles ─────────
function formatearNumero(valor) {
  var n = parseFloat(String(valor).replace(/\./g, '').replace(',', '.'));
  if (isNaN(n)) return valor;
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Aplicar en un input específico: formato automático con debounce + blur
function formatearMiles(input) {
  var _timer = null;

  function _aplicar(el) {
    var raw = parseFloat(String(el.value).replace(/\./g, '').replace(',', '.'));
    if (!isNaN(raw)) {
      el.dataset.rawValue = raw;
      var formatted = raw.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      if (el.value !== formatted) el.value = formatted;
    }
  }

  input.addEventListener('blur', function () {
    clearTimeout(_timer);
    _aplicar(this);
  });

  input.addEventListener('input', function () {
    var el = this;
    var v = el.value;
    // No formatear mientras el usuario escribe decimales
    if (v.endsWith(',') || v.endsWith('.')) return;
    clearTimeout(_timer);
    _timer = setTimeout(function () { _aplicar(el); }, 600);
  });

  input.addEventListener('focus', function () {
    clearTimeout(_timer);
    var raw = this.dataset.rawValue !== undefined
      ? this.dataset.rawValue
      : String(this.value).replace(/\./g, '').replace(',', '.');
    this.value = raw;
    this.dataset.rawValue = raw;
  });
}

// aplicarFormatoMiles(selector) — aplica a todos los inputs que coincidan
function aplicarFormatoMiles(selector) {
  document.querySelectorAll(selector || 'input[data-miles]').forEach(formatearMiles);
}

// Auto-aplicar a inputs con data-miles, data-format="miles" o data-fmt="miles"
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('input[data-miles], input[data-format="miles"], input[data-fmt="miles"]').forEach(formatearMiles);
});

// ── Campaña activa (única) ────────────────────────────────────────
async function cargarTemporadaActiva() {
  var el = document.getElementById('temporada-activa-badge');
  if (!el) return;
  try {
    var res  = await fetch('/api/temporadas/activa');
    var t    = await res.json();

    if (!t) {
      el.textContent = '\u26A0\uFE0F Sin temporada activa';
      el.className   = 'temporada-badge sin-temporada';
      window.temporadaActiva = null;
      return;
    }

    var dias = t.dias_transcurridos !== null ? ' \u00B7 D\u00EDa ' + t.dias_transcurridos : '';
    el.textContent = '\uD83C\uDF31 ' + t.nombre + dias;
    el.className   = 'temporada-badge';
    window.temporadaActiva = t;
  } catch (e) {
    if (el) el.textContent = '';
  }
}

// ── Recordar selección de inputs entre sesiones ───────────────────
function recordarSeleccion(inputId, storageKey) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var key = 'cosecha_' + storageKey;
  // Restaurar valor guardado
  var guardado = localStorage.getItem(key);
  if (guardado) {
    if (input.tagName === 'SELECT') {
      // Esperar que las opciones carguen (pueden cargarse async)
      setTimeout(function() {
        var opts = Array.prototype.slice.call(input.options);
        if (opts.some(function(o) { return o.value === guardado; })) {
          input.value = guardado;
          input.dispatchEvent(new Event('change'));
        }
      }, 400);
    } else {
      input.value = guardado;
    }
  }
  // Guardar al cambiar
  input.addEventListener('change', function() {
    localStorage.setItem(key, this.value);
  });
}

// ── Re-fetch y re-render sin recargar página ──────────────────────
function actualizarLista(fetchFn, renderFn) {
  return fetchFn().then(function(data) {
    renderFn(data);
    return data;
  });
}

// ── Auto-tooltips del sistema ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Temporada badge
  var badge = document.getElementById('temporada-activa-badge');
  if (badge && !badge.hasAttribute('data-tooltip')) {
    badge.setAttribute('data-tooltip', 'Campaña sobre la que estás trabajando');
  }

  // Sidebar nav items
  var navTooltips = {
    'index.html':        'Panel principal con KPIs y alertas',
    'juntada.html':      'Registrar kilos cosechados del día',
    'despalillado.html': 'Registrar kilos despalillados en el galpón',
    'aplicaciones.html': 'Registrar aplicación de productos al lote',
    'menu-stock.html':   'Stock de insumos, mercadería y depósitos',
    'personal.html':     'Legajos y datos del personal',
    'menu-comercial.html': 'Compras, proveedores y clientes',
    'menu-admin.html':   'Caja, cheques, pagos y reportes',
    'mercado.html':      'Cotizaciones y precios del mercado',
    'menu-config.html':  'Temporadas, lotes y configuración del sistema'
  };
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(function (item) {
    if (item.hasAttribute('data-tooltip')) return;
    var href = item.getAttribute('href');
    if (href && navTooltips[href]) {
      item.setAttribute('data-tooltip', navTooltips[href]);
    }
  });

  // Encabezados de tabla comunes
  var thTooltips = {
    'kilos':   'Total de kilogramos',
    'monto':   'Importe en pesos argentinos',
    'importe': 'Importe en pesos argentinos',
    'total':   'Importe total en pesos argentinos',
    'estado':  'Estado actual del registro'
  };
  document.querySelectorAll('th').forEach(function (th) {
    if (th.hasAttribute('data-tooltip')) return;
    var txt = th.textContent.trim().toLowerCase();
    if (thTooltips[txt]) th.setAttribute('data-tooltip', thTooltips[txt]);
  });

  // Badges de carencia y stock bajo
  document.querySelectorAll('.badge-carencia, [data-carencia]').forEach(function (el) {
    if (!el.hasAttribute('data-tooltip')) {
      el.setAttribute('data-tooltip', 'Lote en período de carencia — no cosechar');
    }
  });
  document.querySelectorAll('.badge-stock-bajo, [data-stock-bajo]').forEach(function (el) {
    if (!el.hasAttribute('data-tooltip')) {
      el.setAttribute('data-tooltip', 'Stock por debajo del mínimo recomendado');
    }
  });
});

// ── Parseo seguro de inputs numéricos con separador de miles (es-AR) ──────────
// _parseVal(v)   → acepta string con puntos de miles y coma decimal → número
// _parseEl(id)   → lee un input por id y parsea de forma segura
function _parseVal(v) {
  return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
}
function _parseEl(id) {
  var el = document.getElementById(id);
  if (!el) return 0;
  var raw = (el.dataset.rawValue !== undefined && el.dataset.rawValue !== '')
    ? el.dataset.rawValue
    : el.value;
  return _parseVal(raw);
}

function mostrarMensaje(containerId, tipo, texto, duracion) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var cls = tipo === 'success' ? 'msg-success' : 'msg-error';
  el.innerHTML = '<div class="' + cls + '">' + texto + '</div>';
  if (duracion !== false) {
    setTimeout(function() { if (el) el.innerHTML = ''; }, duracion || 3000);
  }
}
