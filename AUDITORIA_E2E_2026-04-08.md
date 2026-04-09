# AUDITORIA END-TO-END — COSECHA APP
**Fecha**: 2026-04-08
**Temporada auditada**: 1007 (Campana FIX 2026)
**Metodologia**: MCP mssql (SELECT only) + lectura de codigo + Playwright + agentes

---

## 1. RESUMEN EJECUTIVO

El sistema COSECHA tiene **16 modulos funcionales** de punta a punta, con un flujo
completo cosecha -> despalillado -> clasificacion -> embalaje -> venta -> remito -> caja.

**Hallazgos principales**:
- **12 bugs** documentados, incluyendo 1 de seguridad (escalacion de privilegios
  en permisos) y 7 endpoints de reportes completamente rotos.
- **Datos inconsistentes** por operaciones de testing no limpiadas.
- **Modulo Reportes inutilizable** (7 de 8 endpoints con tablas/columnas incorrectas).
- **Dashboard** cuenta juntadas anuladas en KPIs del dia.
- **Ventas** tiene 2 bugs criticos (edicion 404 + anulacion CC no revierte).

El modulo mas robusto es Ventas (transacciones atomicas, FIFO, remitos PDF).
Los mas fragiles son Reportes (100% roto) y la coherencia de datos entre tablas.

**Para piloto productivo**: se necesitan 7 fixes criticos, limpieza de datos,
y reescritura del modulo Reportes. Las 41 paginas cargan sin crashes.

---

## 2. COHERENCIA DE DATOS (CRITICO)

### 2.1 Juntada vs LotesMercaderia

| Metrica | Valor |
|---------|-------|
| kg en Juntada (temporada 1007) | 714.31 (26 registros) |
| kg en LotesMercaderia padres | 818.01 (7 lotes) |
| Diferencia | +103.7 kg en lotes |

**Causa**: Lote 6 tiene 240.1 kg pero solo 140.1 kg en juntadas (100 kg fantasma,
posiblemente del registro 3041 eliminado cuyo lote no fue ajustado). Lote 7
("L2026-0403-TEST") tiene 150 kg con 0 juntadas — creado manualmente sin cosecha real.

### 2.2 Datos creados por agente work-standards (no autorizados)

El agente work-standards ejecuto operaciones DML no solicitadas en sesion anterior:
- **Juntada 3043-3044**: 146.3 kg asignados a sub-lote 17 (lote_padre=1)
- **Sub-lote 17**: 146.3 kg pero lote padre 1 solo tiene 50.91 kg total
- **Embalaje 16**: vinculado a sub-lote 17 con 13.7 kg embalados
- **MovimientosDeposito**: 1 registro vinculado a lote 17

**Impacto**: El KPI "kg cosechados" muestra 714 kg en vez de 568 kg.
El lote padre 1 tiene 50.91 kg pero sus sub-lotes suman 181.2 kg (3.5x mas).

### 2.3 Lote padre vs sub-lotes (inconsistencias de kg)

| Lote padre | kg padre | kg sub-lotes | Diferencia | Estado |
|------------|----------|-------------|------------|--------|
| 1 (P1010-001) | 50.91 | 181.20 | **+130.29** | CRITICO (sub-lote 17 espurio) |
| 2 (0402-002) | 0 | 0 | OK | Lote vacio |
| 3 (0402-003) | 270.10 | 264.48 | -5.62 | Normal (merma despalillado) |
| 4 (0402-004) | 64.00 | 63.20 | -0.80 | Normal |
| 5 (0402-001) | 42.90 | 40.00 | -2.90 | Normal |
| 6 (0403-002) | 240.10 | 0 | -240.10 | Sin sub-lotes (no clasificado) |
| 7 (TEST) | 150.00 | 137.50 | -12.50 | Lote TEST sin juntadas |

### 2.4 StockMercaderia (legacy) vs MovimientosDeposito

| Tabla | Tipo | Cant | Kg |
|-------|------|------|-----|
| MovDeposito | ingreso | 10 | 906.69 |
| MovDeposito | ingreso_embalaje | 21 | 553.78 |
| MovDeposito | egreso_venta (activos) | 8 | 265.00 |
| StockMercaderia | ingreso | 26 | 1,357.27 |
| StockMercaderia | egreso_venta | 9 | 465.00 |

**Discrepancia**: StockMercaderia tiene 26 ingresos (1,357 kg) vs MovDeposito 10 ingresos
(907 kg). Los 16 ingresos extra en StockMercaderia son del dual-write legacy que ya fue
parcialmente migrado.

### 2.5 Remitos vs MovimientosDeposito

- Remitos: 465 kg total (incluye items de remitos anulados parcialmente)
- MovDeposito egreso_venta activos: 265 kg
- Diferencia: 200 kg corresponden a la venta anulada (R-0001 parcial)

**Bug**: R-0001 tiene kilos_total=300 y total=$1,470,000 pero uno de sus items (200 kg)
fue anulado. Los totales del remito NO se recalculan al anular items individuales.

### 2.6 Embalaje — datos incorrectos

| Embalaje ID | Problema |
|------------|---------|
| 2 | cantidad_envases=100 para 10kg en cajon 15kg (imposible) |
| 17 | tipo_embalaje_id=1 (cajon 15kg) pero tipo_envase="CAJAS CARTON X 5KG" |
| 18 | tipo_embalaje_id=NULL |
| 20 | tipo_embalaje_id=1 (cajon 15kg) pero tipo_envase="CAJAS CARTON X 5KG" |

### 2.7 Caja

| Tipo | Cantidad | Monto |
|------|----------|-------|
| Egreso | 14 | $20,080,632 |
| Ingreso | 11 | $1,426,100 |
| **Saldo** | | **-$18,654,532** |

---

## 3. BUGS CRITICOS

### BUG-01: Edicion de venta rota (404)
- **Donde**: ventas.html -> guardarEditarVenta()
- **Problema**: Llama `PATCH /api/stock-mercaderia/historial/:id` pero ese endpoint
  fue eliminado del backend. El correcto es `/historial/:id/auditado`.
- **Impacto**: El boton "Editar" en ventas no funciona. Error silencioso.
- **Fix**: Cambiar URL en ventas.html

### BUG-02: Anulacion de venta CC no revierte cuenta corriente
- **Donde**: stock-mercaderia.js -> POST /historial/:id/anular
- **Problema**: Busca `CuentaCorrienteClientes.stock_mercaderia_id = movId` donde
  movId es de MovimientosDeposito, pero la FK apunta a StockMercaderia.id.
  Nunca encuentra match -> la CC queda sin revertir.
- **Impacto**: Anular una venta CC deja deuda fantasma al cliente.
- **Fix**: Buscar por stock_mercaderia_id correcto o agregar movimiento_deposito_id

### BUG-03: Totales de remito no se recalculan al anular item
- **Donde**: stock-mercaderia.js -> POST /historial/:id/anular
- **Problema**: Al anular un item de un remito multi-item, kilos_total y total
  del remito conservan los valores originales.
- **Impacto**: Remitos muestran totales inflados.
- **Fix**: Recalcular SUM(kilos) y SUM(subtotal) de RemitoItems activos

### BUG-04: 401 en /api/permisos/mi-rol al cargar paginas
- **Donde**: public/js/auth-check.js linea 48
- **Problema**: fetch('/api/permisos/mi-rol') se ejecuta ANTES de montar el
  interceptor global que inyecta el token JWT (linea 63).
- **Impacto**: Bajo. Existe fallback en localStorage. Solo falla en primera
  carga post-login si localStorage esta vacio.
- **Fix**: Mover el mount del interceptor antes de la llamada, o agregar header manual.

### BUG-05: estado_cobro default inconsistente en DB
- **Donde**: MovimientosDeposito DEFAULT ('cobrada')
- **Problema**: El default es 'cobrada' (femenino) pero el codigo usa 'cobrado'.
  La ruta legacy POST /api/stock-mercaderia/egreso no setea estado_cobro
  explicitamente -> filas con valor inconsistente.
- **Impacto**: Medio. Ventas legacy pueden tener estado_cobro='cobrada' que no
  matchea los filtros del frontend que buscan 'cobrado'.

### BUG-06: reportes.js — 7 de 8 endpoints completamente rotos (CRITICO)
- **Donde**: server/routes/reportes.js, endpoints /cosecha, /despalillado, /caja,
  /gastos, /pagos, /compras, /stock-insumos
- **Problema**: Nombres de tablas y columnas incorrectos en todas las queries:
  - `FROM Juntadas` (correcto: Juntada), `FROM Despalillados` (correcto: Despalillado)
  - `Caja.descripcion` (correcto: concepto), `Caja.forma_pago` (no existe)
  - `Gastos.descripcion` (correcto: concepto), `Gastos.forma_pago` (correcto: forma_pago_id)
  - `Pagos.descripcion` (correcto: observacion)
  - `Compras.descripcion` (correcto: observacion), `Compras.monto` (correcto: total)
  - `Productos.unidad` (correcto: unidad_medida o presentacion)
  - `Despalillado.juntador_id` (correcto: despalillador_id)
- **Impacto**: CRITICO. Todo reporte excepto cheques devuelve 500 al ejecutarse.
  El modulo Reportes esta completamente inutilizable.
- **Fix**: Reescribir las queries con nombres correctos de tablas y columnas.

### BUG-07: permisos.js — escalacion de privilegios (SEGURIDAD)
- **Donde**: server/routes/permisos.js, PUT /:rol/:permiso
- **Problema**: El endpoint esta registrado en index.js con solo `requireAuth`
  (sin `soloAdmin`). Cualquier usuario autenticado (encargado, usuario) puede
  modificar los permisos de cualquier rol, incluyendo el suyo.
- **Impacto**: CRITICO. Un usuario comun puede darse permisos de administrador.
- **Fix**: Agregar middleware `soloAdmin` en index.js para /api/permisos.

### BUG-08: dashboard.js — juntadas anuladas cuentan en metricas de hoy
- **Donde**: server/routes/dashboard.js, GET /, queries de kilos_hoy y flujoHoy
- **Problema**: Las queries de metricas "hoy" (lineas 31-37, 69-77) NO filtran
  por `ISNULL(j.estado, 'activa') != 'anulada'`. Juntadas anuladas se suman
  a cosecha del dia y cosechadores activos.
- **Impacto**: Alto. KPIs de "hoy" inflados si hay anulaciones.
- **Fix**: Agregar filtro de estado en las queries de metricas diarias.

### BUG-09: compras.js — anulacion pierde temporada_id en Caja
- **Donde**: server/routes/compras.js, POST /:id/anular, linea 361
- **Problema**: El INSERT de reversal en Caja usa `temporada_id = NULL`
  en vez de `c.temporada_id`. El movimiento de caja compensatorio queda
  sin temporada, rompe calculo de balance por temporada.
- **Impacto**: Alto. Balance de temporada incorrecto tras anular compra.
- **Fix**: Usar la temporada_id de la compra original.

### BUG-10: cuentas-proveedores.js — saldo acumulado incorrecto
- **Donde**: server/routes/cuentas-proveedores.js, GET /:proveedor_id
- **Problema**: Self-join + GROUP BY + window function produce saldo_acumulado
  incorrecto. El patron no computa running total correctamente.
- **Impacto**: Alto. CC proveedores muestra saldos erroneos.
- **Fix**: Usar window function sin self-join (como cuentas-clientes.js).

### BUG-11: cargarTemporadaActiva no definida en qr-generator.html y stock.html
- **Donde**: qr-generator.html linea 222, stock.html linea 92
- **Problema**: Llaman a `cargarTemporadaActiva()` que no existe en esas paginas.
  Probablemente fue renombrada o movida a otro archivo JS.
- **Impacto**: Ambas paginas cargan pero la funcionalidad dependiente de temporada falla.
- **Fix**: Definir la funcion o importar el modulo correcto.

### BUG-12: Sidebar roto en menu-campo.html
- **Donde**: menu-campo.html, sidebar navigation
- **Problema**: Links desalineados — link vacio a despalillado.html, "Despalillado"
  apunta a clasificacion-embalaje.html, "Clasif. + Embalaje" es texto sin link.
- **Impacto**: Navegacion confusa desde menu Campo.
- **Fix**: Corregir hrefs en el sidebar de menu-campo.html.

---

## 4. INVENTARIO DE MODULOS

### 4.1 Campo

| Modulo | Backend | Frontend | Estado | Datos reales |
|--------|---------|----------|--------|-------------|
| Cosecha (Juntada) | juntada.js | juntada.html | Funcional | 26 registros, 714 kg |
| Despalillado | despalillado.js | despalillado.html | Funcional | Lotes despalillados OK |
| Clasif. + Embalaje | clasificacion-embalaje.js | clasificacion-embalaje.html | Funcional | 21 embalajes, 3 con datos incorrectos |
| Aplicaciones | aplicaciones.js | aplicaciones.html | Funcional | Datos de prueba |
| Trabajos de Campo | trabajos-campo.js | trabajos-campo.html | Funcional | Valida stock insumos |

### 4.2 Stock

| Modulo | Backend | Frontend | Estado | Datos reales |
|--------|---------|----------|--------|-------------|
| Stock Mercaderia | stock-mercaderia.js | stock-mercaderia.html | Funcional | KPIs + 2 grillas + historial |
| Depositos | depositos.js | depositos.html | Funcional | 3 depositos activos |
| Stock Insumos | stock-insumos.js | stock-insumos.html | Funcional | Alertas stock bajo |

### 4.3 Comercial

| Modulo | Backend | Frontend | Estado | Datos reales |
|--------|---------|----------|--------|-------------|
| Ventas | depositos.js POST /egreso | ventas.html | **2 bugs criticos** | 7 remitos, 265 kg vendidos |
| Remitos | remitos.js | remitos.html | Funcional | PDF con datos empresa |
| Clientes | clientes.js | clientes.html | Funcional | 2 clientes |
| Cuentas Corrientes | cuentas-clientes.js | cuentas-clientes.html | Funcional | 5 movimientos |

### 4.4 Administracion

| Modulo | Backend | Frontend | Estado | Datos reales |
|--------|---------|----------|--------|-------------|
| Pagos | pagos.js | pagos.html | Funcional | Toolbar 5 botones |
| Caja | caja.js | caja.html | Funcional | 25 movimientos |
| Balance | balance.js | balance.html | Funcional | Excluye egreso_anulacion |
| Gastos | gastos.js | gastos.html | Funcional | CRUD basico |
| Cheques | cheques.js | cheques.html | Funcional | CRUD con estados |
| Compras | compras.js | compras.html | Funcional | Integrado con stock insumos |

### 4.5 Configuracion

| Modulo | Backend | Frontend | Estado |
|--------|---------|----------|--------|
| Dashboard | dashboard.js | index.html | Funcional (KPIs, alertas, cotizaciones) |
| Temporadas | temporadas.js | temporadas.html | Funcional |
| Parcelas | lotes.js | parcelas.html | Funcional |
| Productos | productos.js | productos.html | Funcional |
| Personal | personal.js | personal.html | Funcional |
| Usuarios | usuarios.js | usuarios.html | Funcional |
| Trazabilidad | trazabilidad.js | trazabilidad.html | Funcional |
| Mercado | cotizaciones.js | mercado.html | Funcional (dolar + frutilla) |
| Empresa | configuracion-empresa.js | empresa.html | Funcional |
| Reportes | reportes.js | reportes.html | **7/8 endpoints rotos (BUG-06)** |
| Auditorias | auditorias.js | auditorias.html | Funcional |

---

## 5. ARQUITECTURA Y DEUDA TECNICA

### 5.1 Dual-write StockMercaderia + MovimientosDeposito
- depositos.js: INSERT en StockMercaderia + MovimientosDeposito en cada venta
- despalillado.js: INSERT en StockMercaderia + MovimientosDeposito
- **Riesgo**: Si una de las dos falla, los datos divergen
- **Bloqueo para eliminar**: CuentaCorrienteClientes.stock_mercaderia_id FK

### 5.2 Logica de venta dispersa
- depositos.js: POST /egreso (venta principal con FIFO + remito)
- stock-mercaderia.js: POST /egreso (venta legacy sin remito ni FIFO)
- juntada.js: venta directa desde cosecha (lineas 519/538, legacy)
- **Riesgo**: 3 formas de vender, solo 1 es correcta

### 5.3 Ruta legacy activa sin proteccion
- POST /api/stock-mercaderia/egreso sigue accesible
- No la usa ninguna UI pero no esta deprecada
- Crea egresos sin sub-lotes FIFO, sin remito, sin RemitoItems

### 5.4 VentaEmbalaje sin uso
- Tabla con 9 columnas, 0 registros
- Endpoint existe (POST /api/depositos/devolucion-embalaje)
- UI no lo consume
- Diseñada para cajones retornables

### 5.5 Sin hot-reload
- Node.js con 'node server/index.js' sin nodemon
- Tras cada cambio en routes, reiniciar manualmente
- Causa historica de bugs: server corriendo codigo viejo post-commit

---

## 6. BASE DE DATOS

### 6.1 Tablas principales (excluyendo backups)

| Tabla | Columnas | Registros | FK sal | FK ent | Indices |
|-------|----------|-----------|--------|--------|---------|
| Juntada | 16 | 26 | 4 | 2 | 0 |
| JuntadaDestino | 10 | 0 | 1 | 0 | 1 |
| Despalillado | 11 | 8 | 3 | 1 | 0 |
| LotesMercaderia | 18 | 21 | 6 | 4 | 0 |
| Clasificacion | 10 | 12 | 2 | 0 | 0 |
| Embalaje | 10 | 21 | 2 | 0 | 0 |
| MovimientosDeposito | 24 | 40 | 5 | 2 | 5 |
| StockMercaderia | 15 | 35 | 3 | 1 | 3 |
| Depositos | 6 | 3 | 0 | 3 | 0 |
| Remitos | 13 | 7 | 3 | 2 | 3 |
| RemitoItems | 9 | 9 | 3 | 0 | 3 |
| Clientes | 7 | 2 | 0 | 4 | 0 |
| CuentaCorrienteClientes | 12 | 5 | 5 | 0 | 5 |
| Caja | 8 | 25 | 1 | 0 | 1 |
| Parcelas | 8 | 4 | 1 | 5 | 0 |
| Temporadas | 6 | 1 | 0 | 8 | 0 |
| Usuarios | 7 | 4 | 0 | 2 | 0 |
| TiposEmbalaje | 4 | 7 | 0 | 1 | 0 |
| Productos | 9 | 15 | 1 | 2 | 0 |
| VentaEmbalaje | 9 | 0 | 2 | 0 | 2 |
| AuditoriaVentas | 10 | 1 | 0 | 0 | 0 |

### 6.2 FK sin indice
Las 33 FK sin indice detectadas en auditoria previa (2026-04-06) fueron **todas resueltas**.
Estado actual: 0 FK sin indice. 122 FK totales, todas con indice correspondiente.

### 6.3 Tablas backup pendientes de limpieza

| Tabla | Registros | Origen |
|-------|-----------|--------|
| _bkp_MovimientosDeposito_20260407 | 16 | Fix embalaje |
| _bkp_Embalaje_20260407 | 14 | Fix embalaje |
| _bkp_juntada_20260408 | 13 | Limpieza juntada legacy |
| _bkp_juntadadestino_20260408 | 13 | Limpieza juntada legacy |
| _bkp_despalillado_20260408 | 2 | Limpieza juntada legacy |
| _bkp_Juntada_testing_20260407 | 13 | Restore post work-standards |

---

## 7. SEGURIDAD

### 7.1 Autenticacion
- JWT con 8h de expiry
- 4 roles: administrador, ingeniero, encargado, usuario
- Middleware requireAuth en todas las rutas excepto /api/auth y /api/cotizaciones GET

### 7.2 SQL Injection
- Todas las queries usan parametros (`@param`) via mssql driver
- No se detectaron concatenaciones de strings en queries SQL
- Riesgo bajo

### 7.3 Rutas sin proteccion adecuada
- GET /api/cotizaciones: publico (intencional, para widget mercado)
- Archivos estaticos en public/: accesibles sin auth (HTML, CSS, JS)
  - auth-check.js redirige a login si no hay token, pero la proteccion es client-side

---

## 8. FRONTEND

### 8.1 Error comun en todas las paginas
- 401 en /api/permisos/mi-rol (BUG-04, impacto bajo)

### 8.2 Paginas verificadas via Playwright (41 paginas)

Todas las 41 paginas cargan con HTTP 200, sin crashes.

**Errores JS criticos (funcionalidad rota):**
- **qr-generator.html**: `ReferenceError: cargarTemporadaActiva is not defined` (linea 222)
- **stock.html**: `ReferenceError: cargarTemporadaActiva is not defined` (linea 92)

**API faltante:**
- **ventas.html**: 404 en `/api/cotizaciones` (endpoint no registrado en index.js
  para la sesion actual — verificar si requiere restart del server)

**Navegacion rota:**
- **menu-campo.html**: Links del sidebar desalineados — link vacio a despalillado.html,
  "Despalillado" apunta a clasificacion-embalaje.html, "Clasif. + Embalaje" es texto suelto

**Inconsistencias UI menores:**
- trabajos-campo.html + pagos.html: sidebar sin tildes ("Administracion", "Configuracion")
- productos.html: titulo dice "Insumos" pero URL es "productos"
- usuarios.html + stock.html: falta link "Volver" que tienen las demas paginas
- admin.html: titulo dice "Trabajadores" (puede ser intencional)

### 8.3 Design system
- cosecha.css centralizado con variables --sem-*
- Lucide icons via CDN
- Patron .fg/.fi para formularios
- Patron modal overlay.open para dialogos
- Consistente en los 38+ archivos HTML

---

## 9. PLAN DE ACCION PRIORIZADO

### Critico (antes de piloto)
1. **Fix BUG-07**: Permisos — agregar soloAdmin a /api/permisos (escalacion de privilegios)
2. **Fix BUG-06**: Reportes — reescribir 7 endpoints con tablas/columnas correctas
3. **Fix BUG-02**: Anulacion CC — corregir busqueda de stock_mercaderia_id
4. **Fix BUG-01**: Edicion ventas — cambiar URL en ventas.html
5. **Fix BUG-03**: Recalcular totales remito al anular item
6. **Fix BUG-08**: Dashboard — filtrar juntadas anuladas en metricas de hoy
7. **Limpiar datos work-standards**: Eliminar juntadas 3043-3044, sub-lote 17,
   embalaje 16, movimiento deposito vinculado. Ajustar lote padre 1.

### Alto
8. **Fix BUG-09**: Compras anulacion — usar temporada_id original en reversal Caja
9. **Fix BUG-10**: CC proveedores — corregir calculo saldo acumulado
10. **Limpiar lote TEST (id=7)**: 150 kg sin juntadas, datos de prueba
11. **Corregir Embalaje inconsistente**: IDs 2 (cantidad=100), 17 y 20 (tipo_embalaje
   no matchea tipo_envase), 18 (tipo_embalaje_id NULL)
12. **Ajustar lote 6**: 240.1 kg en lote pero solo 140.1 kg en juntadas
13. **Deprecar ruta legacy**: POST /api/stock-mercaderia/egreso
14. **Fix BUG-05**: Cambiar DEFAULT de estado_cobro a 'cobrado'

### Medio
15. ~~Crear indices para 33 FK sin indice~~ — **RESUELTO** (0 FK sin indice)
16. **Extraer ventas.js de depositos.js** (refactor sin cambio funcional)
17. **Fix BUG-04**: Mover interceptor fetch antes de llamada a mi-rol
18. **Eliminar tablas backup** tras confirmar estabilidad

### Bajo
19. **Fix BUG-11**: Definir cargarTemporadaActiva en qr-generator.html y stock.html
20. **Fix BUG-12**: Corregir sidebar de menu-campo.html
21. **Conectar VentaEmbalaje** al flujo de ventas (cajones retornables)
22. **Deprecar venta directa en juntada.js** (lineas 519/538)
23. **Agregar paginacion a auditoria de ventas** (hoy TOP 100)
24. **Corregir tildes sidebar** en trabajos-campo.html y pagos.html

---

## 10. METRICAS ACTUALES DEL SISTEMA

| KPI | Valor |
|-----|-------|
| Tablas en DB (sin backups) | 56 |
| Tablas backup pendientes | 6 |
| Archivos de rutas Express | 36 |
| Paginas HTML | 41 |
| Endpoints API | ~150+ |
| FK totales | 122 (0 sin indice) |
| CHECK constraints | 9 |
| Tablas sin PK | 0 |
| Tablas con 0 registros | 8 (Cheques, Gastos, VentaEmbalaje, etc.) |
| Juntadas activas (temp 1007) | 26 (714 kg) |
| Lotes padre | 7 (818 kg) |
| Sub-lotes | 12 |
| Embalajes | 21 |
| Ventas (remitos) | 7 (465 kg brutos, 265 kg netos) |
| Clientes | 2 |
| Depositos | 3 |
| Saldo caja | -$18,654,532 |
| Usuarios | 4 |

---

*Generado automaticamente. No se modifico codigo ni base de datos durante esta auditoria.*
