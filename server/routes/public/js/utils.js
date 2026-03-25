// UTILIDADES COMPARTIDAS DEL SISTEMA

// Deshabilitar boton durante envio y re-habilitarlo al terminar
function btnLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Procesando...';
      btn.style.opacity = '0.7';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.style.opacity = '1';
    }
  }
  
  // Mostrar mensaje de exito o error
  function mostrarMensaje(elementId, tipo, texto) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '<div class="msg-' + tipo + '">' + texto + '</div>';
    if (tipo === 'success') {
      setTimeout(function() { el.innerHTML = ''; }, 3000);
    }
  }
  
  // Validar que campos requeridos no esten vacios
  function validarCampos(campos) {
    for (var i = 0; i < campos.length; i++) {
      var campo = campos[i];
      var el = document.getElementById(campo.id);
      if (!el) continue;
      var valor = el.value ? el.value.trim() : '';
      if (!valor || valor === '0') {
        alert('El campo "' + campo.nombre + '" es obligatorio');
        el.focus();
        el.style.borderColor = '#c0392b';
        setTimeout(function(e) {
          return function() { e.style.borderColor = '#ddd'; };
        }(el), 2000);
        return false;
      }
    }
    return true;
  }
  
  // Confirmar antes de eliminar
  function confirmarEliminar(mensaje) {
    return confirm(mensaje || 'Confirmas eliminar este registro?');
  }
  
  // Formatear numero como moneda argentina
  function formatPeso(numero) {
    return '$' + parseFloat(numero || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  
  // Formatear fecha
  function formatFecha(fechaStr) {
    if (!fechaStr) return '-';
    return fechaStr.toString().split('T')[0];
  }
  
  // Fetch con manejo de errores
  async function apiPost(url, data, btnId, mensajeId) {
    if (btnId) btnLoading(btnId, true);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.error) {
        if (mensajeId) mostrarMensaje(mensajeId, 'error', result.error);
        else alert(result.error);
        return null;
      }
      return result;
    } catch (err) {
      if (mensajeId) mostrarMensaje(mensajeId, 'error', 'Error de conexion con el servidor');
      else alert('Error de conexion con el servidor');
      return null;
    } finally {
      if (btnId) btnLoading(btnId, false);
    }
  }
  
  async function apiGet(url) {
    try {
      const response = await fetch(url);
      const result = await response.json();
      return result;
    } catch (err) {
      console.error('Error:', err);
      return null;
    }
  }