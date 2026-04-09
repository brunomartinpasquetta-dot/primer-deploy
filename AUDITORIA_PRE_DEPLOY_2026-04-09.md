# AUDITORÍA PRE-DEPLOY CosechaApp
**Fecha**: 2026-04-09
**Target**: VPS Hostinger KVM 2, Ubuntu 24.04, Docker

---

## Resumen ejecutivo

| Estado | Cantidad | Detalle |
|--------|----------|---------|
| LISTO | 4 | Variables env (parcial), .gitignore, package.json, rate limit login |
| NECESITA AJUSTE | 6 | .env.example, dotenv pinning, logs, CORS/helmet, puerto hardcodeado, bcrypt rounds |
| **FALTANTE BLOQUEANTE** | 7 | **schema.sql, seed catálogos, Dockerfile, docker-compose, Nginx conf, backup script, healthcheck** |
| DEUDA MENOR | 3 | morgan logger, .env.example incompleto, admin inicial seed |

**Estimación de esfuerzo antes del deploy real: 6-10 horas** (preparación scripts + docker + configuración VPS + piloto de testing).

---

## A) Variables de entorno y secretos

### Estado actual
Archivo `.env` existe con 6 variables, `.env.example` incompleto (solo keys vacías).

**Variables en uso (server/db.js + server/routes/auth.js):**
```
DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
```

**Hardcodeos detectados:**
| Archivo | Línea | Hit | Clasificación |
|---------|-------|-----|---------------|
| server/db.js | 4-8 | `'localhost'`, `'sa'`, `'Frutilla2026!'` como **fallbacks** de process.env | NO_ES_SECRETO (son fallbacks, no hardcodeos reales) |
| server/index.js | 89 | `const PORT = 3000` | **HARDCODEADO_MOVER** → debe leer de `process.env.PORT` |
| server/index.js | 91 | `http://localhost:${PORT}` en log | Cosmético |
| server/routes/auth.js | 8 | `JWT_EXPIRES = '8h'` | Aceptable (no secreto) |
| server/routes/auth.js | 12-13 | `RATE_LIMIT_MAX=5`, `WINDOW=15min` | Aceptable (defaults razonables) |
| server/routes/auth.js | 54 | `bcrypt.hash('admin123', 10)` | **BLOQUEANTE** — password del admin default está en código. En producción debe venir de env o crearse manualmente. |
| server/routes/cotizaciones.js | 25-28 | URLs públicas dolarapi.com | NO_ES_SECRETO (APIs públicas sin key) |
| server/routes/cotizaciones.js | 119 | MAGYP URL | NO_ES_SECRETO |

**Tareas:**
- [ ] BLOQUEANTE: Externalizar `PORT` a env (`process.env.PORT || 3000`)
- [ ] BLOQUEANTE: Regenerar `JWT_SECRET` a 64 bytes random (actual es string simple `cosecha_jwt_secret_2026`)
- [ ] BLOQUEANTE: Regenerar `DB_PASSWORD` (actual `Frutilla2026!` es simple)
- [ ] ALTO: Completar `.env.example` con comentarios de qué es cada variable y valores de ejemplo
- [ ] ALTO: Cambiar password de admin default post-deploy (o moverlo a variable `ADMIN_DEFAULT_PASSWORD` leída solo en el seed inicial)
- [ ] MEDIO: NO commitear el `.env` real del VPS al repo (ya excluido en .gitignore)

---

## B) Scripts de creación de schema

### Estado actual
**FALTANTE CRÍTICO**: No existe `schema.sql` ni `init.sql` ni ningún script que cree la DB desde cero.

Lo único presente es:
- `server/migrations/2026-04-02_*.sql` — migraciones puntuales (índices, limpieza, hardening), no creación inicial
- `scripts/*.sql` — fixes y ALTER puntuales de sesiones

**La DB actual tiene 57 tablas** y no hay forma de recrearla en un VPS nuevo sin exportar el schema manualmente.

**Tablas críticas que deben crearse:**
Aplicaciones, AplicacionEmpleados, AuditoriaClasificacion, AuditoriaCompras, AuditoriaVentas, Caja, CategoriasClasificacion, CategoriasFruta, CategoriasGasto, CategoriasTarea, Cheques, ChequeMovimientos, Clasificacion, Clientes, Compras, ComprasDetalle, Configuracion, ConfiguracionEmpresa, CuentaCorrienteClientes, CuentaCorrienteProveedores, Depositos, Despalillado, EdicionesHistorial, Embalaje, FormasPago, Gastos, Juntada, JuntadaDestino, Juntadores, LoteClasificadores, LoteCosecheros, LoteDespalilladores, LotesMercaderia, MovimientosDeposito, **NotasCredito, NotaCreditoItems** (nuevas), Pagos, Parcelas, PermisosRol, Personal, PersonalRoles, PrecioHistorico, PreciosRol, Productos, Proveedores, RemitoItems, Remitos, StockInsumos, SubCategoriasClasificacion, TareaInsumos, TareasGenerales, TareaTrabajadores, Temporadas, TiposEmbalaje, Usuarios, variedades_frutilla, VentaEmbalaje

**Constraints especiales a incluir:**
- `CK_MovimientosDeposito_tipo`: 9 valores (ingreso, ingreso_anulacion, ingreso_devolucion, ingreso_embalaje, ingreso_juntada, egreso_anulacion, egreso_descarte, egreso_despalillado, egreso_venta)
- `CK_NC_estado`, `CK_NCI_destino`, `CK_NCI_kg_positivo`
- `UX_Temporadas_activa` (unique index filtrado)
- FK `Parcelas.variedad_id → variedades_frutilla`
- FK `CuentaCorrienteClientes.movimiento_deposito_id`
- Columnas nuevas: `CuentaCorrienteClientes.nota_credito_id`, `Caja.nota_credito_id`

**Tareas:**
- [ ] BLOQUEANTE: Generar `scripts/schema-full-2026-04-09.sql` con todas las tablas, FKs, índices y CHECK constraints actuales. Puede generarse con `mssql-scripter` o `Generate Scripts` desde SSMS, o manualmente inspeccionando cada tabla con MCP.

---

## C) Scripts de seed de catálogos maestros

### Estado actual
**FALTANTE CRÍTICO**: No hay seed de catálogos.

**Catálogos a exportar como INSERTs:**

| Tabla | Rows actuales | SELECT para exportar |
|-------|---------------|---------------------|
| variedades_frutilla | 38 | `SELECT 'INSERT INTO variedades_frutilla (nombre,activa) VALUES ('''+nombre+''','+CAST(activa AS VARCHAR)+');' FROM variedades_frutilla` |
| TiposEmbalaje | 7 | Idem con sus columnas |
| CategoriasClasificacion | 4 | 4 categorías: Chica, Mediana, Grande, Descarte |
| SubCategoriasClasificacion | 9 | Referencian categoria_padre_id |
| FormasPago | 7 | **CRÍTICO**: id=7 es CuentaCorriente (único con es_cuenta_corriente=true). IDs 1-6 son no-CC. |
| CategoriasGasto | 12 | |
| CategoriasTarea | 35 | |
| CategoriasFruta | 6 | |
| Depositos | 4 | Físicos actuales: GALPON FRESCO, CAMARA DE FRIO 1, CAMARA DE FRIO 2, INSUMOS-STOCK |
| Productos | 14 | Catálogo de insumos (usar costo_total genérico, no precio real del productor) |
| PermisosRol | 92 | |
| PreciosRol | 6 | juntada(kilo), despalillado(kilo), clasificacion(hora), embalaje(hora), aplicacion(hora), trabajo_campo(hora) |

**Tareas:**
- [ ] BLOQUEANTE: Generar `scripts/seed-catalogos-2026-04-09.sql` con todos los INSERTs necesarios
- [ ] ALTO: Para Productos, usar placeholders genéricos (el productor real rellenará sus propios precios post-deploy)
- [ ] ALTO: Para Depositos, dejar placeholders y que el productor los renombre según sus instalaciones

---

## D) Script de admin inicial

### Estado actual
El código **ya crea el admin por defecto automáticamente** en `auth.js` línea 51-62:

```js
if (count.recordset[0].n === 0) {
  const hash = await bcrypt.hash('admin123', 10);
  // INSERT admin/admin123
}
```

Esto es práctico pero **inseguro para producción** — cualquier atacante que sepa que el sistema corre CosechaApp intenta `admin/admin123` y entra.

**Tareas:**
- [ ] BLOQUEANTE: Cambiar la creación automática a leer password de `process.env.ADMIN_DEFAULT_PASSWORD` y requerirla en el primer deploy
- [ ] ALTO: Forzar cambio de password en el primer login (flag `password_reset_required` en Usuarios — no existe hoy)
- [ ] MEDIO: bcrypt con 10 rounds está bien para 2026; mantener

---

## E) Configuración empresa inicial

### Estado actual
`ConfiguracionEmpresa` tiene 1 fila en la DB local. No hay seed ni se crea automáticamente al arranque.

**Tareas:**
- [ ] ALTO: Incluir en el seed un INSERT de ConfiguracionEmpresa con placeholders (razón social, CUIT, dirección, logo) para que el productor los edite post-deploy desde la UI (`empresa.html`)

---

## F) Dockerización

### Estado actual
**FALTANTE CRÍTICO**: No existe Dockerfile ni docker-compose.yml en el proyecto.

El usuario local corre SQL Server en Docker manualmente (puerto 1433), Node.js nativo con `node server/index.js`.

**Para deploy VPS se necesita:**

### Dockerfile (Node app)
Base: `node:20-alpine`, expone 3000, WORKDIR /app, COPY package*.json + npm ci --production, COPY . .

### docker-compose.yml
Servicios:
1. **db** (mssql/server:2022-latest)
   - Volumen persistente `/var/opt/mssql`
   - Variables: `SA_PASSWORD`, `ACCEPT_EULA=Y`, `MSSQL_PID=Express`
   - Healthcheck con sqlcmd
2. **app** (build desde Dockerfile)
   - Depende de db healthy
   - Variables de entorno leídas de .env (no commiteadas)
   - Restart always
3. **nginx** (opcional, puede correr en host)
   - Reverse proxy a app:3000
   - Certificados Let's Encrypt montados

**Tareas:**
- [ ] BLOQUEANTE: Crear `Dockerfile` para la app Node
- [ ] BLOQUEANTE: Crear `docker-compose.yml` con db + app
- [ ] BLOQUEANTE: Crear `docker-compose.prod.yml` con overrides de producción (sin ports expuestos, logs volumen, restart always)
- [ ] ALTO: Configurar Nginx (puede vivir fuera de Docker en el host) con reverse proxy a `localhost:3000`
- [ ] ALTO: Volumen `/var/opt/mssql` persistente para que la DB sobreviva reinicios

---

## G) Dependencias y versiones

### Estado actual

**package.json:**
```json
{
  "dependencies": {
    "bcrypt": "^6.0.0",
    "cheerio": "^1.2.0",
    "dotenv": "^17.3.1",
    "exceljs": "^4.4.0",
    "express": "^5.2.1",
    "jsonwebtoken": "^9.0.3",
    "mssql": "^12.2.1",
    "multer": "^2.1.1",
    "pdfkit": "^0.18.0",
    "pg": "^8.20.0",          // ← no usado (proyecto usa MSSQL)
    "serialport": "^13.0.0",  // ← solo dev (balanza local)
    "ws": "^8.19.0"
  }
}
```

**Problemas detectados:**
- Uso de `^` (caret) en todas las versiones → npm puede instalar versiones minor distintas en cada deploy
- Dependencia `pg` declarada pero NO usada en el código (PostgreSQL, proyecto usa MSSQL)
- `serialport` es para balanza local — no necesario en VPS
- No existe `package-lock.json` commiteado (verificar)
- No hay scripts de npm útiles para producción: faltan `start`, `migrate`, `seed`

**Tareas:**
- [ ] ALTO: Pinnear versiones quitando `^` (reemplazar por versiones exactas)
- [ ] ALTO: Remover dependencia `pg` no usada
- [ ] ALTO: Marcar `serialport` como `optionalDependencies` o removerla si no se necesita en VPS
- [ ] ALTO: Agregar scripts: `"start": "node server/index.js"`, `"migrate": "node scripts/run-migrations.js"` (no existe aún)
- [ ] MEDIO: Commitear `package-lock.json` si no está
- [ ] MEDIO: Agregar campo `engines: { node: ">=20.0.0" }`

---

## H) Archivos que NO deben subirse al VPS

### .gitignore actual
```
node_modules/
.env
*.log
/SQLQuery_*.sql
CONTEXTO-SESION-*.txt
CONTEXTO_*.txt
CONTEXTO_*.md
.claude/*
!.claude/agents/
!.claude/rules/
uploads/
```

**Correcto**: node_modules, .env, logs, contextos, .claude privado, uploads están excluidos.

**Falta excluir:**
- `.playwright-mcp/` (hay ~80 archivos sin trackear acumulados)
- `.DS_Store` (archivos de macOS)
- `e2e/*.png` (screenshots locales)
- `/tmp/`, `/backups/` si se crean en el VPS

**Tareas:**
- [ ] MEDIO: Agregar a .gitignore: `.playwright-mcp/`, `.DS_Store`, `e2e/*.png`, `/tmp/`, `/backups/`

---

## I) Health check

### Estado actual
**FALTANTE**: No existe endpoint `/health` ni `/status`.

Esto es necesario para:
- Docker healthcheck del container de la app
- Nginx para verificar upstream
- Monitoreo externo (Uptime Robot, etc)

**Endpoint propuesto:**
```js
app.get('/health', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: 'ok', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: err.message });
  }
});
```

**Tareas:**
- [ ] BLOQUEANTE: Crear endpoint `GET /health` público (sin auth) que valide DB conectividad

---

## J) Middleware de seguridad

### Estado actual

**Detectados:**
- ✅ Rate limit manual de login en `auth.js` (5 intentos / 15 min / IP) — custom, no librería
- ✅ Auth JWT con middleware `requireAuth`
- ✅ Roles con `soloAdmin` / `encargadoOAdmin`

**Faltantes:**
- ❌ `helmet` (headers de seguridad: CSP, X-Frame-Options, HSTS, etc)
- ❌ `cors` (whitelist de orígenes — crítico cuando el front está en el mismo dominio que el back)
- ❌ `express-rate-limit` global (solo login tiene rate limit custom)
- ❌ `express-validator` o validación formal de inputs
- ❌ Protección CSRF (menos crítico con JWT via header, pero a considerar)

**Tareas:**
- [ ] BLOQUEANTE: Agregar `helmet()` al middleware global
- [ ] ALTO: Agregar `cors()` con whitelist del dominio del VPS
- [ ] ALTO: Agregar `express-rate-limit` global (100 req/min por IP)
- [ ] MEDIO: Evaluar `express-validator` — el proyecto valida manualmente, podría quedar así para no refactorizar

---

## K) Logs

### Estado actual
**18+ ocurrencias** de `console.log` / `console.error` repartidas en `server/routes/`. No hay logger estructurado.

**Impacto en producción:**
- PM2 capturará stdout/stderr a archivos pero sin rotación automática
- Sin niveles (debug/info/warn/error)
- Sin timestamps consistentes
- Sin request_id para tracing

**Recomendación mínima (sin refactor grande):**
- Instalar `morgan` para access logs HTTP
- Opcional: `winston` para logs estructurados de aplicación

**Tareas:**
- [ ] ALTO: Agregar `morgan('combined')` para access logs HTTP
- [ ] MEDIO: Configurar PM2 con rotación de logs (`pm2-logrotate`)
- [ ] BAJO: Evaluar migrar `console.*` a `winston` (refactor grande, diferir)

---

## L) Puertos y URLs

### Estado actual

**Puerto:** `server/index.js:89` → `const PORT = 3000;` hardcodeado.

**URLs en frontend:** grep por `localhost` / `127.0.0.1` / `:3000` → **0 ocurrencias** en `public/`. El frontend usa rutas relativas (`/api/...`) — perfecto para deploy.

**Consecuencia**: el frontend funciona con cualquier dominio sin cambios. Solo hay que hacer que el puerto sea configurable via env.

**Tareas:**
- [ ] BLOQUEANTE: Cambiar `const PORT = 3000` → `const PORT = process.env.PORT || 3000`
- [ ] ✅ Frontend sin URLs absolutas → LISTO

---

## M) Adicionales detectados

### M1) WebSocket de balanza
El proyecto tiene un WebSocket server en `index.js:18` para la balanza serial local. En VPS no hay balanza → el WebSocket queda ocioso pero no rompe. **OK para deploy**. Considerar documentar que la balanza solo funciona si hay un gateway local que la exponga vía WS.

### M2) Uploads
`uploads/` está en `.gitignore`. Verificar si el código escribe archivos ahí (comprobantes PDF de pagos, etc). Si sí, en VPS necesita:
- Volumen Docker persistente para `uploads/`
- Backup de uploads incluido en el plan de backup

**Tareas:**
- [ ] ALTO: Grep por `multer` / `writeFile.*uploads` para confirmar qué archivos se guardan
- [ ] ALTO: Incluir volumen persistente para uploads en docker-compose

### M3) Backup de DB
No hay script de backup automático.

**Recomendación:**
- Cron nocturno en el host VPS que ejecute `docker exec cosecha-db /opt/mssql-tools/bin/sqlcmd ... BACKUP DATABASE`
- Subir el .bak a Backblaze B2 o similar con `rclone` (económico)
- Retención 30 días

**Tareas:**
- [ ] BLOQUEANTE: Crear `scripts/backup-db.sh` con cron + upload a storage externo
- [ ] ALTO: Documentar procedimiento de restore

---

## Checklist priorizado de preparación pre-deploy

### FASE 1 — Preparación del código (2-3 horas)
1. [ ] **B1.1** — Crear `scripts/schema-full-2026-04-09.sql` exportando todas las tablas + FKs + índices + CHECKs actuales
2. [ ] **B1.2** — Crear `scripts/seed-catalogos-2026-04-09.sql` con todos los catálogos maestros
3. [ ] **B1.3** — Cambiar `PORT` hardcodeado en `server/index.js` a `process.env.PORT || 3000`
4. [ ] **B1.4** — Crear endpoint `GET /health` sin auth
5. [ ] **B1.5** — Agregar `helmet()`, `cors()`, `morgan('combined')` al server (instalar deps)
6. [ ] **B1.6** — Cambiar creación automática de admin: leer password de `process.env.ADMIN_DEFAULT_PASSWORD`
7. [ ] **B1.7** — Completar `.env.example` con todas las variables + comentarios
8. [ ] **B1.8** — Pinnear versiones de package.json (quitar `^`), remover `pg` no usado
9. [ ] **B1.9** — Agregar scripts npm: `start`, `migrate`, `seed`
10. [ ] **B1.10** — Actualizar `.gitignore` con `.playwright-mcp/`, `.DS_Store`, `e2e/*.png`

### FASE 2 — Dockerización (2-3 horas)
11. [ ] **B2.1** — Crear `Dockerfile` multi-stage para la app
12. [ ] **B2.2** — Crear `docker-compose.yml` con db (mssql) + app + volumes
13. [ ] **B2.3** — Crear `docker-compose.prod.yml` con overrides producción
14. [ ] **B2.4** — Crear `scripts/init-db.sh` que ejecute schema + seed en un db vacío
15. [ ] **B2.5** — Test local: `docker-compose up` en una copia limpia y validar que arranca con datos del seed

### FASE 3 — Configuración VPS (2-3 horas, requiere VPS activo)
16. [ ] **B3.1** — Provisionar VPS Hostinger KVM 2 con Ubuntu 24.04
17. [ ] **B3.2** — Instalar Docker + docker-compose en el VPS
18. [ ] **B3.3** — Instalar Nginx en el host + configurar reverse proxy a localhost:3000
19. [ ] **B3.4** — Configurar Let's Encrypt con certbot para el dominio Hostinger
20. [ ] **B3.5** — Configurar firewall UFW (ports 22, 80, 443)
21. [ ] **B3.6** — Deploy inicial: clonar repo, crear `.env` producción, `docker-compose up -d`
22. [ ] **B3.7** — Cargar schema + seed en DB del VPS
23. [ ] **B3.8** — Crear admin inicial con password del productor

### FASE 4 — Post-deploy (1 hora)
24. [ ] **B4.1** — Configurar cron de backup nocturno
25. [ ] **B4.2** — Testing E2E en VPS con datos dummy
26. [ ] **B4.3** — Configurar monitoreo externo (Uptime Robot gratis)
27. [ ] **B4.4** — Documentar en `DEPLOY.md` el procedimiento completo para re-deploy futuros
28. [ ] **B4.5** — Handoff al productor: credenciales iniciales + guía básica de uso

---

## Bloqueantes absolutos antes del deploy

1. ❌ **Schema SQL completo** (B1.1) — sin esto no se puede crear la DB en el VPS
2. ❌ **Seed de catálogos** (B1.2) — sin esto el sistema arranca vacío y no se puede operar
3. ❌ **Dockerfile + docker-compose** (B2.1, B2.2) — el target es Docker, sin esto no hay deploy
4. ❌ **PORT en env** (B1.3) — bloqueante trivial de 1 línea
5. ❌ **Healthcheck** (B1.4) — necesario para que Docker/Nginx validen el container
6. ❌ **JWT_SECRET y DB_PASSWORD regenerados** (sección A) — los actuales son de desarrollo
7. ❌ **Script de backup** (M3) — crítico para no perder datos del productor

## Estimación total

- Fase 1 (código): **2-3 horas**
- Fase 2 (docker local): **2-3 horas**
- Fase 3 (VPS setup): **2-3 horas**
- Fase 4 (validación + handoff): **1 hora**

**Total: 7-10 horas** de trabajo concentrado antes del piloto real.

---

*Reporte generado sin modificar código ni DB. Solo análisis y documentación.*
