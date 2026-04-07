/* ── Modales globales — CosechaApp ────────────────────────────── */
/* showAlert, showConfirm, showPrompt — reemplazan alert/confirm/prompt nativos */

(function() {
  // Inyectar CSS una sola vez
  var style = document.createElement('style');
  style.textContent =
    '.cd-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center;}' +
    '.cd-overlay.open{display:flex;}' +
    '.cd-box{background:var(--superficie);border-radius:var(--radius-lg);padding:24px;width:90%;max-width:440px;box-shadow:0 8px 32px rgba(0,0,0,.18);animation:cdSlide .2s ease;}' +
    '@keyframes cdSlide{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}' +
    '.cd-icon{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:12px;font-size:20px;}' +
    '.cd-icon.info{background:var(--sem-azul-bg);color:var(--sem-azul);}' +
    '.cd-icon.success{background:var(--sem-verde-bg);color:var(--sem-verde);}' +
    '.cd-icon.warning{background:var(--sem-amarillo-bg);color:var(--sem-amarillo);}' +
    '.cd-icon.error{background:var(--sem-rojo-bg);color:var(--sem-rojo);}' +
    '.cd-title{font-size:16px;font-weight:700;color:var(--texto);margin-bottom:8px;}' +
    '.cd-msg{font-size:14px;color:var(--texto-2);line-height:1.5;margin-bottom:0;white-space:pre-line;}' +
    '.cd-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px;}' +
    '.cd-btn{padding:9px 20px;font-size:13px;font-weight:600;border-radius:8px;border:none;cursor:pointer;transition:filter .15s,background .15s;}' +
    '.cd-btn:hover{filter:brightness(.92);}' +
    '.cd-btn-cancel{background:var(--fondo);color:var(--texto-2);border:1.5px solid var(--borde);}' +
    '.cd-btn-cancel:hover{background:var(--fondo-dark);}' +
    '.cd-btn-ok{color:#fff;}' +
    '.cd-btn-ok.info{background:var(--sem-azul);}' +
    '.cd-btn-ok.success{background:var(--sem-verde);}' +
    '.cd-btn-ok.warning{background:var(--sem-rojo);}' +
    '.cd-btn-ok.error{background:var(--sem-rojo);}' +
    '.cd-input{width:100%;padding:10px 12px;font-size:14px;border:1.5px solid var(--borde);border-radius:8px;background:var(--superficie);color:var(--texto);margin-top:10px;box-sizing:border-box;}' +
    '.cd-input:focus{outline:none;border-color:var(--verde);box-shadow:0 0 0 3px var(--verde-10);}';
  document.head.appendChild(style);

  var ICONS = {
    info:    '\u2139\uFE0F',
    success: '\u2705',
    warning: '\u26A0\uFE0F',
    error:   '\u274C'
  };

  var TITLES = {
    info:    'Aviso',
    success: 'Correcto',
    warning: 'Atención',
    error:   'Error'
  };

  function crearOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    document.body.appendChild(overlay);
    // Forzar reflow antes de abrir para que la animación funcione
    overlay.offsetHeight;
    overlay.classList.add('open');
    return overlay;
  }

  function cerrar(overlay) {
    overlay.classList.remove('open');
    setTimeout(function() { overlay.remove(); }, 150);
  }

  /**
   * showAlert — reemplazo de alert()
   * @param {string} mensaje
   * @param {string} tipo - 'info' | 'success' | 'error' | 'warning'
   * @returns {Promise<void>}
   */
  window.showAlert = function(mensaje, tipo) {
    tipo = tipo || 'info';
    return new Promise(function(resolve) {
      var overlay = crearOverlay();
      var box = document.createElement('div');
      box.className = 'cd-box';
      box.innerHTML =
        '<div class="cd-icon ' + tipo + '">' + ICONS[tipo] + '</div>' +
        '<div class="cd-title">' + TITLES[tipo] + '</div>' +
        '<div class="cd-msg"></div>' +
        '<div class="cd-actions">' +
          '<button class="cd-btn cd-btn-ok ' + tipo + '">Aceptar</button>' +
        '</div>';
      box.querySelector('.cd-msg').textContent = mensaje;
      overlay.appendChild(box);

      var btnOk = box.querySelector('.cd-btn-ok');
      btnOk.focus();
      btnOk.onclick = function() { cerrar(overlay); resolve(); };
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) { cerrar(overlay); resolve(); }
      });
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', handler); cerrar(overlay); resolve(); }
      });
    });
  };

  /**
   * showConfirm — reemplazo de confirm()
   * @param {string} mensaje
   * @param {string} tipo - 'warning' | 'error' | 'info'
   * @returns {Promise<boolean>}
   */
  window.showConfirm = function(mensaje, tipo) {
    tipo = tipo || 'warning';
    return new Promise(function(resolve) {
      var overlay = crearOverlay();
      var box = document.createElement('div');
      box.className = 'cd-box';
      box.innerHTML =
        '<div class="cd-icon ' + tipo + '">' + ICONS[tipo] + '</div>' +
        '<div class="cd-title">' + TITLES[tipo] + '</div>' +
        '<div class="cd-msg"></div>' +
        '<div class="cd-actions">' +
          '<button class="cd-btn cd-btn-cancel">Cancelar</button>' +
          '<button class="cd-btn cd-btn-ok ' + tipo + '">Confirmar</button>' +
        '</div>';
      box.querySelector('.cd-msg').textContent = mensaje;
      overlay.appendChild(box);

      var resolved = false;
      function done(val) { if (!resolved) { resolved = true; cerrar(overlay); resolve(val); } }

      box.querySelector('.cd-btn-ok').focus();
      box.querySelector('.cd-btn-ok').onclick = function() { done(true); };
      box.querySelector('.cd-btn-cancel').onclick = function() { done(false); };
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', handler); done(false); }
      });
    });
  };

  /**
   * showPrompt — reemplazo de prompt()
   * @param {string} mensaje
   * @param {string} placeholder
   * @param {string} tipo - 'info' | 'warning'
   * @returns {Promise<string|null>}
   */
  window.showPrompt = function(mensaje, placeholder, tipo) {
    placeholder = placeholder || '';
    tipo = tipo || 'info';
    return new Promise(function(resolve) {
      var overlay = crearOverlay();
      var box = document.createElement('div');
      box.className = 'cd-box';
      box.innerHTML =
        '<div class="cd-icon ' + tipo + '">' + ICONS[tipo] + '</div>' +
        '<div class="cd-title">' + TITLES[tipo] + '</div>' +
        '<div class="cd-msg"></div>' +
        '<input type="text" class="cd-input">' +
        '<div class="cd-actions">' +
          '<button class="cd-btn cd-btn-cancel">Cancelar</button>' +
          '<button class="cd-btn cd-btn-ok ' + tipo + '">Aceptar</button>' +
        '</div>';
      box.querySelector('.cd-msg').textContent = mensaje;
      var input = box.querySelector('.cd-input');
      input.placeholder = placeholder;
      overlay.appendChild(box);

      var resolved = false;
      function done(val) { if (!resolved) { resolved = true; cerrar(overlay); resolve(val); } }

      input.focus();
      box.querySelector('.cd-btn-ok').onclick = function() { done(input.value || null); };
      box.querySelector('.cd-btn-cancel').onclick = function() { done(null); };
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { done(input.value || null); }
      });
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', handler); done(null); }
      });
    });
  };
})();
