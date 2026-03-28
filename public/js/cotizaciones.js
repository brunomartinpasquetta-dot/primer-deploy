/* ── Módulo de cotizaciones — CosechaApp ────────────────────── */
window.cotizacion = {
  blue:    { compra: 0, venta: 0 },
  oficial: { compra: 0, venta: 0 },
  actualizado: '',
  variacion: 0,
};

async function cargarCotizacion() {
  try {
    var res  = await fetch('/api/cotizaciones/dolar');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    window.cotizacion = data;
    _actualizarWidgets();
  } catch (e) {
    console.warn('[cotizaciones] No se pudo cargar:', e.message);
    _mostrarError();
  }
}

function formatPesos(monto) {
  if (monto === null || monto === undefined || isNaN(monto)) return '—';
  return '$' + Math.round(monto).toLocaleString('es-AR');
}

function formatDolares(monto) {
  var rate = window.cotizacion && window.cotizacion.blue && window.cotizacion.blue.venta;
  if (!rate || !monto) return '\u2248 USD \u2014';
  return '\u2248 USD\u202F' + Math.round(monto / rate).toLocaleString('es-AR');
}

// Muestra monto en pesos grande + equivalente USD apilado debajo
// tipo: 'ingreso' | 'egreso' | 'neutro'
function mostrarDual(elementId, monto, tipo) {
  var el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML =
    '<div class="monto-dual ' + (tipo || 'neutro') + '">' +
      '<span class="monto-pesos">' + formatPesos(monto) + '</span>' +
      '<span class="monto-usd">'   + formatDolares(monto) + '</span>' +
    '</div>';
}

// HTML inline para insertar en tablas (no requiere un id)
function htmlDual(monto, tipo) {
  return '<div class="monto-dual ' + (tipo || 'neutro') + '">' +
    '<span class="monto-pesos">' + formatPesos(monto) + '</span>' +
    '<span class="monto-usd">'   + formatDolares(monto) + '</span>' +
  '</div>';
}

function _mostrarError() {
  document.querySelectorAll('.widget-dolar').forEach(function(w) {
    w.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:0;">' +
        '<div class="dolar-tipo">Blue</div>' +
        '<div class="dolar-valor" style="color:#888;">$---</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:0;">' +
        '<div class="dolar-tipo">Oficial</div>' +
        '<div class="dolar-valor" style="color:#888;">$---</div>' +
      '</div>';
  });
}

function _actualizarWidgets() {
  var b  = window.cotizacion.blue    || {};
  var o  = window.cotizacion.oficial || {};
  var m  = window.cotizacion.mep     || {};
  var c  = window.cotizacion.ccl     || {};
  var v  = window.cotizacion.variacion || 0;
  var ts = window.cotizacion.actualizado || '';
  var arrow = v > 0
    ? '<span class="dolar-up">\u2191</span>'
    : v < 0
      ? '<span class="dolar-down">\u2193</span>'
      : '';

  document.querySelectorAll('.widget-dolar').forEach(function(w) {
    w.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:0;">' +
        '<div class="dolar-tipo">Blue</div>' +
        '<div class="dolar-valor">$' + Math.round(b.venta || 0).toLocaleString('es-AR') + ' ' + arrow + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:0;">' +
        '<div class="dolar-tipo">Oficial</div>' +
        '<div class="dolar-valor">$' + Math.round(o.venta || 0).toLocaleString('es-AR') + '</div>' +
      '</div>' +
      (ts ? '<div class="dolar-actualizado">' + ts + '</div>' : '');
  });

  // Actualizar todos los elementos de cotizaciones en la página
  function setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val ? '$' + Math.round(val).toLocaleString('es-AR') : '—';
  }
  setEl('bd-blue',       b.venta);
  setEl('bd-oficial',    o.venta);
  setEl('bd-mep',        m.venta);
  setEl('bd-ccl',        c.venta);
  setEl('topbar-blue',   b.venta);
  setEl('topbar-oficial',o.venta);
  setEl('hero-blue',     b.venta);
  var bdAct = document.getElementById('bd-actualizado');
  if (bdAct && ts) bdAct.textContent = 'Actualizado ' + ts;
}
