/**
 * Grilla universal de movimientos de stock.
 * Columnas: # cosecha | Cosechero (ID) | Fecha | Tipo | Kg | Lote | Depósito | Usuario (ID)
 *
 * Uso:
 *   renderMovimientosGrid('tbody-id', arrayDeDatos);
 *   filtrarMovimientosGrid('tbody-id', arrayDeDatos, textosBusqueda);
 */

(function () {
  var COL_COUNT = 8;

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

  function _chip(id) {
    if (!id && id !== 0) return '';
    return ' <span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;' +
      'background:var(--fondo-dark);border:1px solid var(--borde);' +
      'border-radius:4px;padding:1px 4px;opacity:.75;">#' + id + '</span>';
  }

  function _jidBadge(juntada_id) {
    if (!juntada_id) return '—';
    return '<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;' +
      'background:var(--fondo-dark);border:1px solid var(--borde);' +
      'border-radius:4px;padding:1px 5px;">#' + juntada_id + '</span>';
  }

  function _row(m) {
    var esIngreso  = m.tipo === 'ingreso';
    var esPendiente = m.tipo === 'pendiente_despalillado';
    var bg        = esPendiente ? 'background:#fffbeb;' : esIngreso ? 'background:#f0faf0;' : 'background:#fff5f5;';
    var colorKg   = esPendiente ? 'color:#b45309;font-weight:700;' : esIngreso ? 'color:#2d6a4f;font-weight:700;' : 'color:#c0392b;font-weight:700;';
    var signo     = esIngreso ? '+' : esPendiente ? '~' : '-';
    var tipoBadge = esPendiente
      ? '<span class="badge" style="background:#fef3c7;color:#92400e;">Pendiente</span>'
      : esIngreso
        ? '<span class="badge" style="background:var(--sem-verde-bg);color:var(--sem-verde);">Ingreso</span>'
        : '<span class="badge" style="background:var(--sem-rojo-bg);color:var(--sem-rojo);">Egreso</span>';

    var cosecheroCell = (m.cosechero || '—') + _chip(m.juntador_id);
    var usuarioCell   = (m.usuario   || '—') + _chip(m.usuario_id);

    return '<tr style="' + bg + '">' +
      '<td style="text-align:center;">'                                               + _jidBadge(m.juntada_id) + '</td>' +
      '<td style="font-size:13px;">'                                                  + cosecheroCell + '</td>' +
      '<td style="font-size:12px;white-space:nowrap;">'                               + _fmtFecha(m.fecha) + '</td>' +
      '<td>'                                                                           + tipoBadge + '</td>' +
      '<td style="text-align:right;font-family:\'JetBrains Mono\',monospace;' + colorKg + '">' +
        signo + _fmt(m.kilos) + ' kg</td>' +
      '<td style="font-size:12px;">'                                                  + (m.lote || '—') + '</td>' +
      '<td style="font-size:12px;">'                                                  + (m.deposito || m.destino_venta || '—') + '</td>' +
      '<td style="font-size:12px;">'                                                  + usuarioCell + '</td>' +
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

  var _COLS = [
    { label: 'Cosechero', campo: 'cosechero' },
    { label: 'Lote',      campo: 'lote' },
    { label: 'Depósito',  campo: 'deposito' },
    { label: 'Destino',   campo: 'destino_venta' },
    { label: 'Usuario',   campo: 'usuario' },
    { label: 'Tipo',      campo: 'tipo' },
  ];

  window.filtrarMovimientosGrid = function (tbodyId, data, query) {
    if (!query) { window.renderMovimientosGrid(tbodyId, data); return; }
    // Usar matchFiltro si está disponible (formato "Columna: valor")
    var filtrado;
    if (typeof matchFiltro === 'function') {
      filtrado = data.filter(function(m) { return matchFiltro(m, query, _COLS); });
    } else {
      var q = query.toLowerCase();
      filtrado = data.filter(function (m) {
        return _COLS.some(function(col) {
          return (m[col.campo] || '').toString().toLowerCase().indexOf(q) >= 0;
        });
      });
    }
    window.renderMovimientosGrid(tbodyId, filtrado);
  };
})();
