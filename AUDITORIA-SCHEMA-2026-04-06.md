# Auditoría de Schema — CosechaFrutilla
**Fecha:** 2026-04-06
**Base de datos:** CosechaFrutilla (SQL Server)

---

## 1. Resumen ejecutivo

| Indicador | Valor |
|-----------|-------|
| Tablas | 55 |
| Foreign Keys | 120 |
| Índices (no-PK) | 96 |
| FK sin índice | **33** |
| Tablas con columna `estado` | Juntada, Despalillado, Clasificacion, Aplicaciones, TareasGenerales, LotesMercaderia, StockMercaderia, Embalaje |
| Constraint campaña activa única | **NO EXISTE** |

### Hallazgos críticos

1. **33 FK sin índice** — impacto directo en performance de JOINs y cascadas DELETE.
2. **Sin constraint de campaña activa única** en Temporadas — riesgo de múltiples temporadas activas simultáneamente.
3. **Bug kg cosechados** en balance.js — no filtra registros anulados (`estado != 'anulada'`).
4. **Bug stock mercadería** en dashboard.js — tipos de anulación (`ingreso_anulacion`, `egreso_anulacion`) no se contabilizan correctamente.
5. **Columnas duplicadas en Temporadas** — `activo` y `activa` (ambas bit, nullable) causan confusión.
6. **Índice con nombre engañoso** — `IX_Juntada_lote_id` indexa `parcela_id`, no `lote_id`. Resultado: `Juntada.lote_id` FK sin índice.

---

## 2. Inconsistencias de schema

### 2.1 Temporadas: columnas `activo` y `activa` duplicadas

```
activo  bit  nullable  DEFAULT ((1))
activa  bit  nullable  DEFAULT ((1))
```

Dos columnas boolean con semántica idéntica. El backend usa `activa` (`WHERE activa=1`), pero `activo` existe y podría confundir. Una de las dos sobra.

**Riesgo:** Queries que usen la columna incorrecta filtrarán mal.

### 2.2 Juntada y Despalillado sin `temporada_id`

Estas dos tablas de alta actividad no tienen FK a Temporadas. La asociación se hace indirectamente:
- **Juntada**: `fecha_hora` filtrado con rango de fechas de la temporada.
- **Despalillado**: ídem via `fecha_hora`.

Tablas que SÍ tienen `temporada_id`: Aplicaciones, TareasGenerales.
Tablas junction que heredan campaña del padre: LoteClasificadores (via lote_id), AplicacionEmpleados (via aplicacion_id), TareaTrabajadores (via tarea_id).

**Impacto:** Queries de pagos y reportes requieren JOIN con Parcelas o sub-query de fechas para filtrar por temporada. Es funcional pero propenso a inconsistencias cuando las fechas de temporada se solapan.

### 2.3 Tipos de fecha inconsistentes

| Tabla | Columna | Tipo |
|-------|---------|------|
| Juntada | fecha_hora | datetime (nullable) |
| Despalillado | fecha_hora | datetime (nullable) |
| LoteClasificadores | fecha | date (NOT NULL) |
| LoteClasificadores | hora_inicio/hora_fin | datetime (nullable) |
| Aplicaciones | fecha | date (nullable) |
| Aplicaciones | fecha_hora | datetime (nullable) |
| TareasGenerales | fecha | date (NOT NULL) |
| TareaTrabajadores | hora_inicio/hora_fin | datetime (nullable) |

**Problema:** `Juntada.fecha_hora` y `Despalillado.fecha_hora` son nullable, pero son el único mecanismo para asociar a temporada. Un registro con `fecha_hora = NULL` no se filtra para ninguna temporada y desaparece de reportes y pagos.

### 2.4 Índice con nombre engañoso

```
IX_Juntada_lote_id  →  indexa columna: parcela_id  (NO lote_id)
```

Esto significa que `Juntada.lote_id` (FK a LotesMercaderia) no tiene índice, mientras `parcela_id` tiene índice duplicado (ya cubierto por `IX_Juntada_parcela_id`).

### 2.5 Aplicaciones: columnas `fecha` y `fecha_hora` redundantes

Aplicaciones tiene tanto `fecha` (date) como `fecha_hora` (datetime), ambas con default `getdate()`. Potencial divergencia si se actualiza una y no la otra.

---

## 3. Constraint campaña activa

### Estado actual

Temporadas tiene **un solo índice**: el PK clustered en `id`. No existe:
- Unique filtered index en `activa = 1`
- Check constraint
- Trigger de validación

### Riesgo

Nada impide ejecutar:
```sql
UPDATE Temporadas SET activa = 1   -- Todas activas simultáneamente
```

El backend usa `SELECT TOP 1 FROM Temporadas WHERE activa=1` — con múltiples activas, la selección es indeterminista (depende del plan de ejecución).

### Recomendación

```sql
CREATE UNIQUE INDEX UX_Temporadas_activa
ON Temporadas (activa)
WHERE activa = 1;
```

Esto permite solo UNA fila con `activa=1`. Costo: ~0. Beneficio: integridad garantizada.

---

## 4. FK sin índice

**33 foreign keys** no tienen índice en la columna de la tabla hija. Esto impacta:
- Performance de JOINs (full table scans en tablas grandes)
- Velocidad de ON DELETE CASCADE / SET NULL
- Queries de reportes y pagos que cruzan estas tablas

### Lista completa

| # | Tabla | Columna FK | Referencia |
|---|-------|-----------|------------|
| 1 | AplicacionEmpleados | empleado_id | Juntadores |
| 2 | AuditoriaClasificacion | usuario_id | Usuarios |
| 3 | Clasificacion | despalillado_id | Despalillado |
| 4 | Clasificacion | empleado_id | Juntadores |
| 5 | Clasificacion | lote_id | LotesMercaderia |
| 6 | Clasificacion | sub_lote_id | LotesMercaderia |
| 7 | Clasificacion | usuario_id | Usuarios |
| 8 | Despalillado | lote_id | LotesMercaderia |
| 9 | EdicionesHistorial | usuario_id | Usuarios |
| 10 | Embalaje | clasificacion_id | Clasificacion |
| 11 | Embalaje | deposito_id | Depositos |
| 12 | Embalaje | empleado_id | Juntadores |
| 13 | Embalaje | producto_id | Productos |
| 14 | Embalaje | sub_lote_id | LotesMercaderia |
| 15 | Embalaje | usuario_id | Usuarios |
| 16 | Juntada | lote_id | LotesMercaderia |
| 17 | LoteClasificadores | empleado_id | Juntadores |
| 18 | LoteCosecheros | juntador_id | Juntadores |
| 19 | LoteDespalilladores | despalillador_id | Juntadores |
| 20 | LotesMercaderia | categoria_id | CategoriasFruta |
| 21 | LotesMercaderia | deposito_camara_id | Depositos |
| 22 | LotesMercaderia | deposito_id | Depositos |
| 23 | LotesMercaderia | lote_padre_id | LotesMercaderia |
| 24 | LotesMercaderia | parcela_id | Parcelas |
| 25 | LotesMercaderia | temporada_id | Temporadas |
| 26 | LotesMercaderia | usuario_id | Usuarios |
| 27 | MovimientosDeposito | lote_id | LotesMercaderia |
| 28 | MovimientosDeposito | sub_lote_id | LotesMercaderia |
| 29 | RemitoItems | sub_lote_id | LotesMercaderia |
| 30 | StockMercaderia | lote_id | LotesMercaderia |
| 31 | TareasGenerales | usuario_id | Usuarios |

### Priorización por impacto

**ALTA** (tablas de alto volumen, queries frecuentes):
- `Juntada.lote_id` — usado en SUM(kilos) por lote en cada registro de juntada
- `Despalillado.lote_id` — usado en SUM(kilos) por lote en cada despalillado
- `Clasificacion.lote_id` — consultas frecuentes de clasificación por lote
- `LotesMercaderia.temporada_id` — filtro por temporada en múltiples módulos
- `LotesMercaderia.parcela_id` — filtro por parcela en reportes

**MEDIA** (tablas junction, consultas moderadas):
- `LoteClasificadores.empleado_id` — pagos calcula horas por clasificador
- `LoteCosecheros.juntador_id` — asignación de cosecheros a lotes
- `LoteDespalilladores.despalillador_id` — asignación de despalilladores
- `MovimientosDeposito.lote_id` / `sub_lote_id` — trazabilidad de stock
- `StockMercaderia.lote_id` — reportes de stock

**BAJA** (tablas de auditoría/historial, consultas infrecuentes):
- `*.usuario_id` en AuditoriaClasificacion, EdicionesHistorial, Embalaje, Clasificacion, LotesMercaderia, TareasGenerales
- `Embalaje.*` — módulo aún en desarrollo

---

## 5. Causa raíz de bugs conocidos

### 5.1 Bug: kg cosechados inflados en Balance

**Archivo:** `server/routes/balance.js:51-57`

```javascript
// Kilos cosechados
const kilos = await pool.request()
  .input('id', sql.Int, temporada_id)
  .query(`SELECT ISNULL(SUM(j.kilos), 0) AS total
          FROM Juntada j
          JOIN Parcelas l ON j.parcela_id = l.id
          WHERE l.temporada_id = @id`);
```

**Causa raíz:** NO filtra `WHERE j.estado != 'anulada'`. Incluye registros anulados en la sumatoria.

**Contraste:** El módulo de pagos SÍ filtra correctamente:
```sql
-- pagos.js:67-68
SELECT ISNULL(SUM(kilos),0) FROM Juntada
WHERE juntador_id=@tid AND ISNULL(estado,'activa')!='anulada'
```

**Fix requerido:**
```sql
SELECT ISNULL(SUM(j.kilos), 0) AS total
FROM Juntada j
JOIN Parcelas l ON j.parcela_id = l.id
WHERE l.temporada_id = @id AND ISNULL(j.estado, 'activa') != 'anulada'
```

### 5.2 Bug: stock mercadería — anulaciones no contabilizadas correctamente

**Archivo:** `server/routes/dashboard.js:99-102`

```javascript
ISNULL(SUM(CASE WHEN tipo = 'ingreso' THEN kilos ELSE 0 END), 0) AS ingresados,
ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%' THEN kilos ELSE 0 END), 0) AS vendidos
FROM StockMercaderia
WHERE temporada_id = @tid
```

**Causa raíz:** Los tipos de movimiento en StockMercaderia son:
- `ingreso` — fruta que entra
- `egreso%` — fruta que sale (venta, despalillado, etc.)
- `ingreso_anulacion` — reversa un egreso (despalillado anulado)
- `egreso_anulacion` — reversa un ingreso (juntada anulada)

El dashboard suma `tipo = 'ingreso'` (match exacto) — NO incluye `ingreso_anulacion`.
Pero suma `tipo LIKE 'egreso%'` — SÍ incluye `egreso_anulacion`.

**Resultado:** Al anular una juntada:
- Se inserta `egreso_anulacion` → se RESTA de vendidos (correcto)
- Se inserta `ingreso_anulacion` → NO se suma a ingresados (incorrecto, debería restar)

**Fix requerido:** Usar lógica simétrica:
```sql
ISNULL(SUM(CASE WHEN tipo = 'ingreso' THEN kilos
                WHEN tipo = 'egreso_anulacion' THEN -kilos
                ELSE 0 END), 0) AS ingresados,
ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%' AND tipo != 'egreso_anulacion' THEN kilos
                WHEN tipo = 'ingreso_anulacion' THEN -kilos
                ELSE 0 END), 0) AS vendidos
```

O más simple, un neto:
```sql
ISNULL(SUM(CASE WHEN tipo IN ('ingreso') THEN kilos
                WHEN tipo IN ('egreso_anulacion') THEN -kilos
                ELSE 0 END), 0) AS ingresados,
ISNULL(SUM(CASE WHEN tipo IN ('egreso_despalillado','egreso_venta') THEN kilos
                WHEN tipo IN ('ingreso_anulacion') THEN -kilos
                ELSE 0 END), 0) AS egresos
```

### 5.3 Bug adicional: stock insumos puede ser negativo

**Archivo:** `server/routes/trabajos-campo.js:167,182-183`

```javascript
// Descuenta stock
await stockReq.query(`UPDATE Productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id`);
// Solo advierte si < 0, no previene
if (parseFloat(stockCheck.recordset[0].stock_actual) < 0) {
  warningStock = true;
}
```

El stock se descuenta primero y luego se verifica si quedó negativo. Solo genera un warning, no rollback. Permite stock negativo persistente.

---

## 6. Recomendaciones priorizadas

### PRIORIDAD 1 — Crítica (arreglar ya)

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1.1 | Crear unique filtered index en `Temporadas(activa) WHERE activa=1` | Previene corrupción de datos multi-temporada | 1 línea SQL |
| 1.2 | Fix balance.js: agregar `AND ISNULL(j.estado,'activa')!='anulada'` al SUM de kilos | Corrige kg cosechados inflados | 1 línea |
| 1.3 | Fix dashboard.js: contabilizar `ingreso_anulacion` y `egreso_anulacion` correctamente | Corrige stock mercadería en dashboard | 5 líneas |

### PRIORIDAD 2 — Alta (próxima semana)

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 2.1 | Crear índices en FK de alto volumen: `Juntada.lote_id`, `Despalillado.lote_id`, `Clasificacion.lote_id`, `LotesMercaderia.temporada_id`, `LotesMercaderia.parcela_id` | Performance en queries de lotes y reportes | 5 CREATE INDEX |
| 2.2 | Eliminar columna `Temporadas.activo` (duplicada de `activa`) | Elimina confusión | 1 ALTER TABLE |
| 2.3 | Renombrar `IX_Juntada_lote_id` a `IX_Juntada_parcela_id_2` o eliminarlo (duplicado) | Elimina índice engañoso | 1 DROP/RENAME INDEX |
| 2.4 | Crear índice correcto para `Juntada.lote_id` | Performance JOINs por lote | 1 CREATE INDEX |

### PRIORIDAD 3 — Media (próximo sprint)

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 3.1 | Crear índices en FK de tablas junction: `LoteClasificadores.empleado_id`, `LoteCosecheros.juntador_id`, `LoteDespalilladores.despalillador_id` | Performance en pagos (horas clasificación) | 3 CREATE INDEX |
| 3.2 | Crear índices en `MovimientosDeposito.lote_id`, `MovimientosDeposito.sub_lote_id`, `StockMercaderia.lote_id` | Performance trazabilidad stock | 3 CREATE INDEX |
| 3.3 | Hacer `Juntada.fecha_hora` y `Despalillado.fecha_hora` NOT NULL | Evita registros huérfanos de temporada | 2 ALTER TABLE (requiere verificar datos existentes) |
| 3.4 | Evaluar agregar `temporada_id` a Juntada y Despalillado | Simplifica queries de pagos, reportes y balance | Migración + actualización de routes |

### PRIORIDAD 4 — Baja (backlog)

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 4.1 | Crear índices restantes en FK de usuario_id (6 tablas) | Performance marginal | 6 CREATE INDEX |
| 4.2 | Crear índices en Embalaje FK (6 columnas) | Preparar para cuando el módulo esté activo | 6 CREATE INDEX |
| 4.3 | Resolver redundancia `Aplicaciones.fecha` / `Aplicaciones.fecha_hora` | Limpieza de schema | Análisis + migración |
| 4.4 | Agregar CHECK constraint `stock_actual >= 0` en Productos | Previene stock negativo | 1 ALTER TABLE + fix lógica trabajos-campo |

---

### Scripts SQL listos para ejecutar (Prioridad 1)

```sql
-- 1.1 Constraint temporada activa única
CREATE UNIQUE INDEX UX_Temporadas_activa
ON Temporadas (activa)
WHERE activa = 1;

-- 2.1 Índices FK de alto volumen
CREATE INDEX IX_Juntada_lote_id_real ON Juntada (lote_id);
CREATE INDEX IX_Despalillado_lote_id ON Despalillado (lote_id);
CREATE INDEX IX_Clasificacion_lote_id ON Clasificacion (lote_id);
CREATE INDEX IX_LotesMercaderia_temporada_id ON LotesMercaderia (temporada_id);
CREATE INDEX IX_LotesMercaderia_parcela_id ON LotesMercaderia (parcela_id);

-- 2.2 Limpiar columna duplicada (verificar que ningún código use 'activo')
-- ALTER TABLE Temporadas DROP COLUMN activo;

-- 2.3 Renombrar índice engañoso
-- DROP INDEX IX_Juntada_lote_id ON Juntada;
```

---

*Generado automáticamente — Auditoría de schema CosechaFrutilla 2026-04-06*
