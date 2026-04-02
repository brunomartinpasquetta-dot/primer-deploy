// ── Botón Volver: siempre usa history.back() para regresar al menú desde donde se abrió ──
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.btn-volver').forEach(function(el) {
    var fallback = el.getAttribute('href') || 'index.html';
    el.setAttribute('href', '#');
    el.addEventListener('click', function(e) {
      e.preventDefault();
      if (history.length > 1) { history.back(); }
      else { location.href = fallback; }
    });
  });
});

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

// ── Parseo inteligente: acepta tanto punto como coma como separador decimal ──
// Detecta el separador según la estructura del número:
//   "1.500"   → 1500  (punto = miles, sin coma)  … ambiguo, se trata como miles
//   "1,500"   → 1.5   (coma = decimal)
//   "1.5"     → 1.5   (punto = decimal cuando hay 1 cifra tras él o más de 3)
//   "1500"    → 1500
//   "12,500"  → 12.5  (coma = decimal)
//   "12.500"  → 12.5  (punto seguido de exactamente 3 dígitos es ambiguo → decimal)
// Regla simple y robusta:
//   - Si hay COMA: coma = decimal, puntos = miles → quitar puntos, reemplazar coma por punto
//   - Si hay PUNTO sin coma:
//       · Si los dígitos tras el punto son != 3 → punto = decimal
//       · Si los dígitos tras el punto son exactamente 3 Y hay dígitos antes → ambiguo,
//         tratar como decimal (más seguro para pesos/kilos reales)
function _parseNumero(v) {
  var s = String(v).trim();
  if (!s) return NaN;

  var tieneComa  = s.indexOf(',') !== -1;
  var tienePunto = s.indexOf('.') !== -1;

  if (tieneComa && tienePunto) {
    // Ej: "1.234,56" → coma decimal, punto miles
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (tieneComa) {
    // Ej: "1234,56" o "12,5" → coma es decimal
    s = s.replace(',', '.');
  } else if (tienePunto) {
    // Ej: "1234.56" o "12.5" → punto es decimal (no quitamos nada)
    // No hace falta tocar s
  }
  return parseFloat(s);
}

function formatearNumero(valor) {
  var n = _parseNumero(valor);
  if (isNaN(n)) return valor;
  // Mostrar sin trailing zeros innecesarios, hasta 3 decimales
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

// Aplicar en un input específico: formato automático con debounce + blur
function formatearMiles(input) {
  var _timer = null;

  function _aplicar(el) {
    var raw = _parseNumero(el.value);
    if (!isNaN(raw)) {
      el.dataset.rawValue = raw;
      var formatted = raw.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
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
    // No formatear mientras el usuario está escribiendo decimales
    if (v.endsWith(',') || v.endsWith('.')) return;
    // No formatear si hay pocos dígitos decimales aún (puede estar escribiendo)
    var m = v.match(/[,.](\d*)$/);
    if (m && m[1].length < 1) return;
    clearTimeout(_timer);
    _timer = setTimeout(function () { _aplicar(el); }, 800);
  });

  input.addEventListener('focus', function () {
    clearTimeout(_timer);
    // Al enfocar, mostrar el valor crudo sin formato de miles
    var raw = (this.dataset.rawValue !== undefined && this.dataset.rawValue !== '')
      ? this.dataset.rawValue
      : _parseNumero(this.value);
    if (!isNaN(raw) && raw !== '') this.value = String(raw).replace('.', ',');
    this.dataset.rawValue = isNaN(raw) ? '' : raw;
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

// ── Parseo seguro de inputs numéricos ────────────────────────────────────────
// _parseVal(v)  → acepta punto o coma como decimal → número (0 si inválido)
// _parseEl(id)  → lee un input por id y parsea de forma segura
function _parseVal(v) {
  var n = _parseNumero(v);
  return isNaN(n) ? 0 : n;
}
function _parseEl(id) {
  var el = document.getElementById(id);
  if (!el) return 0;
  var raw = (el.dataset.rawValue !== undefined && el.dataset.rawValue !== '')
    ? el.dataset.rawValue
    : el.value;
  return _parseVal(raw);
}

/**
 * Puebla un <datalist> con valores únicos de las columnas especificadas.
 * columnas: [{ label: 'Cosechero', campo: 'cosechero' }, ...]
 */
function poblarDatalist(datalistId, data, columnas) {
  var dl = document.getElementById(datalistId);
  if (!dl || !data || !data.length) return;
  var opciones = [];
  columnas.forEach(function(col) {
    var vistos = {};
    data.forEach(function(row) {
      var v = row[col.campo];
      if (v !== undefined && v !== null && v !== '' && !vistos[v]) {
        vistos[v] = true;
        opciones.push(col.label + ': ' + v);
      }
    });
  });
  opciones.sort();
  dl.innerHTML = opciones.map(function(o) {
    return '<option value="' + o.replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '">';
  }).join('');
}

/**
 * Evalúa si una fila cumple el filtro de texto.
 * Si el texto tiene formato "Label: valor", filtra solo esa columna.
 * Si no, busca en todas las columnas.
 * columnas: [{ label: 'Cosechero', campo: 'cosechero' }, ...]
 */
function matchFiltro(row, q, columnas) {
  if (!q) return true;
  var lq = q.toLowerCase();
  for (var i = 0; i < columnas.length; i++) {
    var prefix = columnas[i].label.toLowerCase() + ': ';
    if (lq.startsWith(prefix)) {
      var val = lq.slice(prefix.length);
      return String(row[columnas[i].campo] || '').toLowerCase().indexOf(val) >= 0;
    }
  }
  return columnas.some(function(col) {
    return String(row[col.campo] || '').toLowerCase().indexOf(lq) >= 0;
  });
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
