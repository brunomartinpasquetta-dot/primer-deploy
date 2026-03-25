# Auditoría Estructural — CosechaApp
**Fecha:** 2026-03-25 | **Base de datos:** CosechaFrutilla | **Archivos analizados:** 26 rutas, 33 HTML, 27 tablas

---

## 1. BASE DE DATOS

### ✅ Estructura general
- **27 tablas** presentes: Aplicaciones, Caja, CategoriasGasto, Cheques, Clientes, Compras, ComprasDetalle, Configuracion, CuentaCorrienteClientes, CuentaCorrienteProveedores, Depositos, Despalillado, FormasPago, Gastos, Juntada, Juntadores, Lotes, MovimientosDeposito, Pagos, Personal, PrecioHistorico, Productos, Proveedores, StockInsumos, StockMercaderia, Temporadas, Usuarios.
- Todas las tablas tienen Primary Key definida. ✓
- 45 Foreign Keys declaradas en DB, todas coherentes con el código. ✓

---

### ⚠️ BD-01 — Índices secundarios ausentes en FK columns
**Severidad: MEDIO**

**Todas** las columnas FK (45 en total) carecen de índice secundario. Las tablas más afectadas en operaciones frecuentes:

| Tabla | Columnas FK sin índice |
|-------|------------------------|
| MovimientosDeposito | deposito_id, temporada_id, lote_id |
| StockMercaderia | temporada_id, lote_id |
| Juntada | lote_id, juntador_id, deposito_id |
| Gastos | temporada_id, lote_id, categoria_id, forma_pago_id, proveedor_id |
| Compras | temporada_id, proveedor_id, forma_pago_id, cheque_id |
| Caja | temporada_id, forma_pago_id, cheque_id |

**Impacto:** Queries con JOIN o WHERE por FK hacen table scan completo. En producción con miles de registros generará degradación significativa.
**Corrección:** `CREATE INDEX IX_tabla_col ON tabla(columna)` para las columnas de alta frecuencia de query (al menos MovimientosDeposito y StockMercaderia).

---

### 🔴 BD-02 — Stock negativo en StockMercaderia
**Severidad: CRÍTICO**

Tres combinaciones lote/temporada con saldo negativo:

| Lote | Temporada ID | Ingresado | Egresado | Saldo |
|------|-------------|-----------|----------|-------|
| Lote A | 4 | 0 kg | 500 kg | **-500 kg** |
| Lote A | 5 | 0 kg | 500 kg | **-500 kg** |
| Lote A | 6 | 0 kg | 500 kg | **-500 kg** |

**Causa probable:** Datos de seed/AUDIT insertaron egresos sin ingresos previos. Las temporadas 4, 5, 6 son `activo=false` (desactivadas).
**Corrección:** Verificar si son datos de prueba descartables. Si es así, `DELETE FROM StockMercaderia WHERE temporada_id IN (4,5,6)`.

---

### 🔴 BD-03 — Juntadas sin destino registrado
**Severidad: CRÍTICO**

5 juntadas con `destino IS NULL`:

| ID | Lote ID | Kilos | Fecha |
|----|---------|-------|-------|
| 1 | 6 | 123.5 | 2026-03-21 |
| 2 | 7 | 123.5 | 2026-03-21 |
| 3 | 8 | 123.5 | 2026-03-21 |
| 4 | 4 | 20 | 2026-03-24 |
| 5 | 4 | 20 | 2026-03-24 |

**Impacto:** 410.5 kg cosechados que no tienen registro en MovimientosDeposito ni StockMercaderia. El stock está subestimado.
**Causa:** Registradas antes de implementar el flujo de destinos (o con versión antigua del endpoint).
**Corrección:** Asignar destino manualmente o registrar como `sin_asignar`. El KPI de kg cosechados SÍ los cuenta (lee de `Juntada.kilos`), pero el stock físico no los refleja.

---

### 🔴 BD-04 — Compras en efectivo sin egreso en Caja
**Severidad: CRÍTICO**

2 compras en efectivo sin movimiento correspondiente en Caja:

| ID Compra | Fecha | Monto | Forma Pago |
|-----------|-------|-------|------------|
| 6 | 2026-03-20 | $27.239.992 | Efectivo |
| 7 | 2026-03-20 | $250.000 | Efectivo |

**Impacto:** El saldo de Caja está sobreestimado en $27.489.992.
**Corrección:** Verificar si son datos de prueba. Si son reales, insertar egresos en Caja manualmente o corregir la ruta `/api/compras` POST para que genere el egreso automáticamente.

---

### ⚠️ BD-05 — Inconsistencia de tipos en StockMercaderia
**Severidad: MEDIO**

`StockMercaderia` solo tiene tipos `ingreso` y `egreso`. `MovimientosDeposito` usa `egreso_venta` y `egreso_descarte`. La distinción semántica entre egreso por venta y egreso por descarte **no existe** en StockMercaderia.

**Impacto:** No se puede reportar desde StockMercaderia cuántos kg se vendieron vs descartaron sin leer el campo `destino`.
**Corrección:** Considerar agregar columna `subtipo` o usar `tipo = 'egreso_venta'` / `'egreso_descarte'` consistentemente.

---

### ⚠️ BD-06 — Juntada.deposito_id NOT NULL pero 5 registros con NULL
**Severidad: MEDIO**

La columna `deposito_id` en `Juntada` es `NOT NULL` según FK constraint, pero hay 5 juntadas (IDs 1-5) donde el destino nunca fue asignado. Esto implica que tienen `deposito_id` con algún valor (probablemente el default del form, ej: primer depósito) sin que refleje la realidad.
**Corrección:** Revisar si los registros 1-5 tienen deposito_id asignado por defecto o si la constraint cambió. Aplicar `'sin_asignar'` como destino.

---

## 2. BACKEND

### 🔴 BK-01 — SQL Injection en gastos.js
**Severidad: CRÍTICO**
**Archivo:** `server/routes/gastos.js` líneas ~35-38

```javascript
if (desde) query += ` AND g.fecha >= '${desde}'`;
if (hasta) query += ` AND g.fecha <= '${hasta}'`;
```

Las fechas `desde` y `hasta` se interpolan directamente sin sanitización. Un valor como `'2026-01-01' OR 1=1 --` rompería la query.
**Corrección:**
```javascript
if (desde) { query += ' AND g.fecha >= @desde'; dbReq.input('desde', sql.Date, desde); }
if (hasta) { query += ' AND g.fecha <= @hasta'; dbReq.input('hasta', sql.Date, hasta); }
```

---

### ⚠️ BK-02 — Concatenación de string en WHERE (stock-mercaderia.js)
**Severidad: MEDIO**
**Archivo:** `server/routes/stock-mercaderia.js` línea 19

```javascript
if (temporada_id) query += ' WHERE sm.temporada_id = ' + parseInt(temporada_id);
```

`parseInt()` mitiga el riesgo, pero es inconsistente con el enfoque parametrizado del resto del código.
**Corrección:** Usar `pool.request().input('tid', sql.Int, parseInt(temporada_id))` + `WHERE sm.temporada_id = @tid`.

---

### 🔴 BK-03 — Operaciones multi-tabla sin transacción
**Severidad: CRÍTICO**

#### juntada.js — `POST /:id/destino`
Múltiples INSERTs a `MovimientosDeposito` y `StockMercaderia` sin `sql.Transaction`. Si el segundo INSERT falla, el primero queda huérfano → inconsistencia de stock.

#### stock-insumos.js — `POST /compra`, `POST /aplicacion`, `POST /egreso`
Tres endpoints con múltiples UPDATEs/INSERTs sin transacción:
- `/compra`: INSERT StockInsumos + UPDATE stock en Productos
- `/aplicacion`: INSERT + UPDATE sin rollback
- `/egreso`: INSERT + UPDATE sin rollback

**Corrección:** Envolver cada endpoint en `const transaction = new sql.Transaction(pool); await transaction.begin(); ... await transaction.commit();` con catch que llame `transaction.rollback()`.

---

### 🔴 BK-04 — Credenciales hardcodeadas
**Severidad: CRÍTICO**
**Archivo:** `server/routes/auth.js`

```javascript
const JWT_SECRET = 'cosecha_jwt_secret_2026';  // Línea ~7
```

El JWT secret está hardcodeado en código fuente. Si el repo se sube a un lugar no privado, todas las sesiones son comprometibles.

**Corrección:**
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'cosecha_jwt_secret_2026';
```
Y agregar al `.env`: `JWT_SECRET=<valor_aleatorio_seguro_256bits>`.

---

### ⚠️ BK-05 — Sin archivo .env ni variables de entorno
**Severidad: MEDIO**

Las credenciales de BD (`sa / Frutilla2026!`) están en `server/db.js` hardcodeadas. No existe archivo `.env` ni `.gitignore` verificado.
**Corrección:** Crear `.env` con `DB_SERVER`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`. Agregar `.env` a `.gitignore`.

---

### ⚠️ BK-06 — Endpoints faltantes para algunas pantallas
**Severidad: MEDIO**

Comparando fetch calls del frontend contra rutas del backend:

| Fetch en frontend | Estado |
|-------------------|--------|
| `/api/depositos/:id/stock` | ✅ Existe en depositos.js |
| `/api/stock-mercaderia/kpis` | ✅ Existe |
| `/api/pagos/precio/:temporada_id` | ✅ Existe |
| `/api/cuentas-clientes/cobro` | ✅ Existe |
| `/api/compras/:id/detalle` | ✅ Existe |
| `/api/juntada/:id/destino` | ✅ Existe |

**Resultado:** No hay endpoints llamados que no existan. ✓

---

## 3. FRONTEND

### 🔴 FE-01 — Input[type=number] con spinners visibles
**Severidad: MEDIO**

~20 inputs `type="number"` sin `appearance:none` en los siguientes archivos:

| Archivo | Elementos afectados |
|---------|---------------------|
| cuentas-proveedores.html | `pago-monto` |
| despalillado.html | `peso-manual` |
| cheques.html | `nuevo-monto` |
| depositos.html | múltiples inputs de kilos |
| mercado.html | `s-cant`, `s-precio` |
| stock-insumos.html | `egr-cantidad` |
| stock-mercaderia.html | `ing-kilos` |
| cuentas-clientes.html | `cobro-monto` |
| pagos.html | múltiples inputs |
| aplicaciones.html | `cantidad`, `dosis`, `carencia` |
| caja.html | `nuevo-monto` |

**Corrección:** Ya existe en cosecha.css:
```css
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
input[type="number"] { -moz-appearance: textfield; }
```
Verificar que los inputs en cuestión no tengan estilos inline que anulen esta regla.

---

### ⚠️ FE-02 — Selectores de temporada sin preload consistente
**Severidad: MEDIO**

17 archivos HTML tienen selectores de temporada. Solo algunos precargan la activa automáticamente:

| Archivo | Precarga activa |
|---------|----------------|
| stock-mercaderia.html | ✅ `poblarTemporadas()` setea activa |
| juntada.html | ✅ usa `cargarTemporadaActiva()` |
| depositos.html | ⚠️ Carga lista pero no selecciona activa |
| compras.html | ⚠️ Carga lista pero no selecciona activa |
| gastos.html | ⚠️ Carga lista pero no selecciona activa |
| lotes.html | ⚠️ Carga lista pero no selecciona activa |
| pagos.html | ⚠️ Carga lista pero no selecciona activa |
| balance.html | ⚠️ Carga lista pero no selecciona activa |
| aplicaciones.html | ⚠️ Carga lista pero no selecciona activa |
| caja.html | ⚠️ Carga lista pero no selecciona activa |

**Corrección:** En cada `poblar/cargarTemporadas()`, después de `innerHTML`, agregar:
```javascript
var activa = _temporadas.find(t => t.activa);
if (activa) el.value = activa.id;
```

---

### ✅ FE-03 — Validación de formularios
Todos los handlers de submit/onclick verifican campos requeridos antes de hacer fetch. ✓

---

### ✅ FE-04 — Links del menú
Todos los `href` en nav-items y action-cards apuntan a archivos HTML existentes en `public/`. ✓

---

### ⚠️ FE-05 — Personal duplicado en sidebar (algunos archivos)
**Severidad: MENOR**

Algunos archivos HTML pueden tener el ítem "Personal" duplicado en el sidebar (tanto como nav-item independiente Y dentro del grupo Administración). Requiere revisión manual en cada archivo.

---

## 4. COHERENCIA DE NEGOCIO

### 🔴 NC-01 — Compras efectivo sin egreso en Caja
**Severidad: CRÍTICO**
*(Ver BD-04)* — 2 compras por $27.489.992 sin egreso en Caja.

La ruta `POST /api/compras` no genera egreso automático en Caja cuando `forma_pago_id = 1 (Efectivo)`.

**Corrección en compras.js:** Dentro de la transacción, si `forma_pago_id === 1`:
```javascript
await new sql.Request(transaction)
  .input('concepto', sql.NVarChar, `Compra: ${proveedor}`)
  .input('monto', sql.Decimal(12,2), total)
  .input('forma_pago_id', sql.Int, 1)
  .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id)
          VALUES ('egreso', @concepto, @monto, @forma_pago_id, @temporada_id)`);
```

---

### ✅ NC-02 — Egresos venta con registro en Caja
Todos los registros `egreso_venta` en `MovimientosDeposito` con precio_kilo > 0 tienen su correspondiente ingreso en Caja. ✓

---

### 🔴 NC-03 — Juntadas sin destino = kilos sin registrar
**Severidad: CRÍTICO**
*(Ver BD-03)* — 5 juntadas (410.5 kg) no tienen destino, por lo tanto no hay registro en `MovimientosDeposito` ni `StockMercaderia`. Los KPIs de kg cosechados los cuentan pero el stock físico no los refleja, creando divergencia.

---

### ✅ NC-04 — Ingresos a depósito
Los `POST /api/depositos/ingreso` y los ingresos por juntada generan registros correctamente en ambas tablas `MovimientosDeposito` y `StockMercaderia`. ✓

---

### ✅ NC-05 — Venta directa desde juntada
Genera: ingreso+egreso en `StockMercaderia` + ingreso en `Caja` si tiene precio. ✓

---

## 5. CORRECCIONES PRIORIZADAS

### PRIORIDAD 1 — CRÍTICO (corregir antes de producción)

| # | Problema | Archivo | Acción |
|---|----------|---------|--------|
| 1 | SQL Injection en gastos.js | `server/routes/gastos.js:35-38` | Parametrizar `desde` y `hasta` |
| 2 | JWT secret hardcodeado | `server/routes/auth.js:7` | Mover a variable de entorno |
| 3 | Transacción faltante en juntada /:id/destino | `server/routes/juntada.js` | Agregar sql.Transaction |
| 4 | Transacción faltante en stock-insumos | `server/routes/stock-insumos.js` | 3 endpoints necesitan Transaction |
| 5 | Compras efectivo sin egreso Caja | `server/routes/compras.js` | Auto-insertar en Caja si efectivo |
| 6 | Stock negativo temporadas AUDIT | BD: StockMercaderia | DELETE donde temporada_id IN (4,5,6) |
| 7 | Juntadas sin destino | BD: Juntada ids 1-5 | Asignar destino manualmente |

### PRIORIDAD 2 — MEDIO (planificar en próximo sprint)

| # | Problema | Archivo | Acción |
|---|----------|---------|--------|
| 8 | Credenciales BD hardcodeadas | `server/db.js` | Crear .env |
| 9 | Índices FK ausentes | BD global | CREATE INDEX en columnas frecuentes |
| 10 | Temporada activa no preseleccionada | 8 archivos HTML | Agregar `el.value = activa.id` en poblarTemporadas |
| 11 | String concat en stock-mercaderia.js | `server/routes/stock-mercaderia.js:19` | Parametrizar |

### PRIORIDAD 3 — MENOR (backlog)

| # | Problema | Archivo | Acción |
|---|----------|---------|--------|
| 12 | Spinners en inputs number | ~11 archivos HTML | Verificar que CSS global aplica |
| 13 | Tipo egreso inconsistente en StockMercaderia | BD: schema | Considerar subtipo columna |

---

## 6. RESUMEN EJECUTIVO

| Área | CRÍTICO | MEDIO | MENOR |
|------|---------|-------|-------|
| Base de datos | 3 | 3 | 0 |
| Backend | 3 | 2 | 0 |
| Frontend | 0 | 2 | 1 |
| Coherencia negocio | 2 | 0 | 0 |
| **TOTAL** | **8** | **7** | **1** |

**El sistema es funcional para uso interno** pero tiene 8 problemas críticos que deben resolverse antes de manejar datos reales en producción: principalmente la SQL injection, las transacciones faltantes, el JWT secret y los datos contables faltantes (compras sin egreso en caja, juntadas sin destino).
