# REGLAS DE DESARROLLO — CosechaApp
> Leer este archivo ANTES de modificar cualquier archivo del proyecto.
> Estas reglas son inamovibles. Toda nueva feature debe encajar en esta estructura.

## STACK
- Node.js v24 + Express — puerto 3000
- SQL Server Docker — puerto 1433
- HTML vanilla + JS vanilla + cosecha.css
- Sin frameworks frontend (no React, no Vue)
- Sin librerías nuevas sin aprobación explícita

## SEGURIDAD — OBLIGATORIO
- NUNCA interpolar valores de usuario en queries SQL
- SIEMPRE usar request.input() con tipos mssql explícitos
- NUNCA hardcodear credenciales — siempre process.env.*
- JWT_SECRET y DB_* vienen del .env
- .env está en .gitignore — nunca commitear

## TRANSACCIONES — OBLIGATORIO
- TODA operación que toque más de una tabla debe usar sql.Transaction
- Patrón obligatorio:
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // operaciones con new sql.Request(transaction)
    await transaction.commit();
  } catch(err) {
    await transaction.rollback();
    throw err;
  }
- NUNCA dejar escrituras parciales sin rollback

## TIPOS DE DATOS — INAMOVIBLES
- StockMercaderia.tipo: 'ingreso' | 'egreso_venta'
- MovimientosDeposito.tipo: 'ingreso' | 'egreso_venta' | 'egreso_descarte'
- Juntada.destino: 'deposito' | 'descarte'
- CHECK CONSTRAINT CK_StockMercaderia_tipo activo en BD — no violar

## LÓGICA DE NEGOCIO — INAMOVIBLE
- Venta = ingreso Caja + egreso MovimientosDeposito + egreso StockMercaderia
- Descarte = egreso MovimientosDeposito — NO toca Caja
- Compra efectivo = egreso Caja en la misma transacción
- Juntada: suma destinos debe == kilos totales ±0.01
- Cosechero obligatorio antes de registrar juntada
- Una sola campaña activa — al activar una se desactiva la anterior

## UI — PATRONES OBLIGATORIOS
- Layout: formulario 220px | historial 1fr | gap 16px
- Mobile (<900px): una sola columna, formulario 100%
- Historial siempre visible en panel derecho — nunca como única pestaña
- KPI cards arriba del contenido
- Selectores de temporada: siempre precargar activa con fetch('/api/temporadas/activa')
- Inputs numéricos: sin spinners (ya en cosecha.css global)
- Colores: solo los semánticos definidos en cosecha.css

## CSS — REGLAS
- Estilos globales solo en cosecha.css
- Estilos específicos de página en <style> interno del HTML
- Overrides de cosecha.css: usar especificidad mayor (.page-class .elemento)
- No crear clases globales nuevas en cosecha.css sin revisar impacto

## GIT — OBLIGATORIO
- Commit después de cada cambio significativo
- Formato: "tipo: módulo - descripción"
- Tipos: feat | fix | ui | perf | security | cleanup | refactor

## FILTROS — PATRÓN OBLIGATORIO
- Todo módulo con grilla DEBE usar `.filtros-barra` (nunca controles sueltos)
- Clases: `.filtros-barra`, `.fb-buscar`, `.fb-sep`, `.fb-limpiar` (ya en cosecha.css)
- Input único con `<datalist>` poblado por `poblarDatalist(id, data, columnas)` de utils.js
- Filtrado con `matchFiltro(row, q, columnas)`: "Columna: valor" → filtra esa col; texto libre → todas
- Filtrado SIEMPRE client-side sobre array en memoria — nunca re-fetch por cada filtro
- Selects de columna (lote, tipo, categoría, etc.) PROHIBIDOS en la barra — van al datalist
- Solo se permite `<select>` de temporada si dispara un re-fetch al servidor
- Función `limpiarXxx()` obligatoria: resetea todos los controles y re-renderiza
- `toggleFechas()` y `toggleFiltrosAvanzados()` — ELIMINADOS, fechas siempre visibles
- Helpers disponibles en utils.js: `_parseVal(v)`, `_parseEl(id)`, `poblarDatalist()`, `matchFiltro()`

## ANTES DE CADA MODIFICACIÓN
1. Leer este archivo
2. Leer CONTEXTO-PROYECTO-v6.txt
3. Ejecutar: git log --oneline -5
4. Verificar que el cambio no rompe transacciones existentes
5. Verificar que el cambio respeta los tipos válidos de BD
