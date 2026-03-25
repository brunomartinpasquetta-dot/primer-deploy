/**
 * Grilla universal de movimientos de stock.
 * Columnas: # (juntada_id) | Cosechero | Fecha | Tipo | Kg | Lote | Depósito
 *
 * Uso:
 *   renderMovimientosGrid('tbody-id', arrayDeDatos);
 *   filtrarMovimientosGrid('tbody-id', arrayDeDatos, textosBusqueda);
 */

(function () {
  var COL_COUNT = 7;

  function _fmtFecha(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = d.getFullYear();
    var hh = String(d.getHours()).padStart(2, '0');
    var mn = String(d.getMinutes()).padStart(2, '0');
    return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + mn;
  }

  function _fmt(n) {
    return parseFloat(n || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    });
  }

  function _badge(juntada_id) {
    if (!juntada_id) return '—';
    return '<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;' +
      'background:var(--fondo-dark);border:1px solid var(--borde);' +
      'border-radius:4px;padding:1px 5px;">#' + juntada_id + '</span>';
  }

  function _row(m) {
    var esIngreso = m.tipo === 'ingreso';
    var bg       = esIngreso ? 'background:#f0faf0;' : 'background:#fff5f5;';
    var colorKg  = esIngreso ? 'color:#2d6a4f;font-weight:700;' : 'color:#c0392b;font-weight:700;';
    var signo    = esIngreso ? '+' : '-';
    var tipoBadge = esIngreso
      ? '<span class="badge" style="background:var(--sem-verde-bg);color:var(--sem-verde);">Ingreso</span>'
      : '<span class="badge" style="background:var(--sem-rojo-bg);color:var(--sem-rojo);">Egreso</span>';
    return '<tr style="' + bg + '">' +
      '<td style="text-align:center;">' + _badge(m.juntada_id) + '</td>' +
      '<td style="font-size:13px;">' + (m.cosechero || '—') + '</td>' +
      '<td style="font-size:12px;white-space:nowrap;">' + _fmtFecha(m.fecha) + '</td>' +
      '<td>' + tipoBadge + '</td>' +
      '<td style="text-align:right;font-family:\'JetBrains Mono\',monospace;' + colorKg + '">' +
        signo + _fmt(m.kilos) + ' kg</td>' +
      '<td style="font-size:12px;">' + (m.lote || '—') + '</td>' +
      '<td style="font-size:12px;">' + (m.deposito || m.destino_venta || '—') + '</td>' +
    '</tr>';
  }

  window.MOV_GRID_COLS = COL_COUNT;

  window.renderMovimientosGrid = function (tbodyId, data) {
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="' + COL_COUNT + '" class="empty">Sin movimientos</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(_row).join('');
  };

  window.filtrarMovimientosGrid = function (tbodyId, data, query) {
    if (!query) { window.renderMovimientosGrid(tbodyId, data); return; }
    var q = query.toLowerCase();
    var filtrado = data.filter(function (m) {
      return (m.cosechero    || '').toLowerCase().indexOf(q) >= 0 ||
             (m.lote         || '').toLowerCase().indexOf(q) >= 0 ||
             (m.deposito     || '').toLowerCase().indexOf(q) >= 0 ||
             (m.destino_venta|| '').toLowerCase().indexOf(q) >= 0 ||
             (m.juntada_id ? String(m.juntada_id) : '').indexOf(q) >= 0;
    });
    window.renderMovimientosGrid(tbodyId, filtrado);
  };
})();
