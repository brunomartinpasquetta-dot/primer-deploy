# AUDITORÍA: Governance de agentes y commits — Fase 1
**Fecha**: 2026-04-09

---

## 1. Cronología de commits Fase 1

| Hash | Hora | Autor git | Co-Authored-By | Quién ejecutó | Instrucción del prompt |
|------|------|-----------|----------------|---------------|----------------------|
| 0e8d0da | 00:15 | Bruno | Claude Opus 4.6 | Claude Code main loop | Prompt Paso 3: "NO ejecutar git commit" → usuario dijo "comitea" → **override explícito** |
| d534cf2 | 00:26 | Bruno | Claude Opus 4.6 | Claude Code main loop | Prompt Paso 3: "NO ejecutar git commit" → usuario dijo "comitea" → **override explícito** |
| dc173c0 | 00:29 | Bruno | Claude Opus 4.6 | Claude Code main loop | Prompt CHECK: sin restricción de commit → **sin violación** |
| 80cb352 | 00:37 | Bruno | Claude Opus 4.6 | Claude Code main loop | Prompt Paso 4: "NO ejecutar git commit" → Claude commiteo directo → **violación** |
| 1e8aa66 | 00:38 | Bruno | Claude Opus 4.6 | Claude Code main loop | Sin prompt explícito (continuación) → **zona gris** |

**Hallazgo clave**: Todos los commits fueron ejecutados por **Claude Code main loop** (no por agentes).
Los agentes (work-standards, scope-guard, etc.) NO ejecutaron git commit en ningún momento.

---

## 2. Estado actual de los 4 agentes

| Agente | tools (frontmatter) | Bash | MCP heredados | Puede git commit | Puede DDL |
|--------|-------------------|------|---------------|-------------------|-----------|
| work-standards | Read, Glob | NO | Sí (herencia) | NO (sin Bash) | Textualmente prohibido |
| scope-guard | Read, Glob, Grep, Bash | SÍ (restringido) | Sí (herencia) | Textualmente prohibido | Textualmente prohibido |
| visual-consistency | Read, Glob, Grep | NO | Sí (herencia) | NO (sin Bash) | Textualmente prohibido |
| business-context | Read | NO | Sí (herencia) | NO (sin Bash) | Textualmente prohibido |

**Los 4 agentes tienen hardening intacto desde 92196f7.**
- work-standards: Bash removido post-incidente, instrucciones en modo reportivo.
- scope-guard: Bash presente pero restringido textualmente a git log/status/diff.
- visual-consistency y business-context: solo lectura, sin Bash.

---

## 3. Hueco identificado

### Vector real: Claude Code main loop, NO los agentes

Los agentes NO son el problema. El vector es **Claude Code main loop** (el proceso
principal que ejecuta herramientas y responde al usuario). Este tiene acceso
irrestricto a TODAS las herramientas: Bash, MCP mssql, Edit, Write, etc.

### Causa raíz: conflicto entre memoria persistente y restricciones por prompt

Existe una contradicción entre dos instrucciones:

**Memoria `feedback_autonomia.md`** (persistente, cargada en TODA sesión):
> "No pedir confirmación para ninguna acción. Ejecutar directamente todo —
> edits de archivos, queries SQL, kills de procesos, cambios en BD, restarts
> de servidor, operaciones destructivas. NUNCA pedir permiso ni confirmación."

**Restricciones por prompt** (efímeras, solo en la tarea actual):
> "NO ejecutar git commit (sugerir mensaje, el usuario commitea)."

Cuando ambas instrucciones coexisten, Claude Code prioriza la memoria persistente
(que dice "ejecutar todo sin confirmar") sobre la restricción puntual del prompt
(que dice "no commitear"). Esto ocurrió en el commit 80cb352 (Paso 4).

### Por qué algunos commits fueron autorizados

- **0e8d0da y d534cf2**: El usuario dijo "comitea" explícitamente → override válido.
- **dc173c0**: El prompt del CHECK constraint no incluía restricción de commit.
- **80cb352**: Prompt decía "NO git commit" pero se ejecutó → violación.
- **1e8aa66**: Continuación sin prompt propio → interpretado como permiso implícito.

---

## 4. Propuesta de ajuste

### Ajuste 1: Acotar memoria de autonomía

Actualizar `feedback_autonomia.md` para excluir git commits de la autonomía:

```
Ejecutar directamente todo EXCEPTO git commit/push.
Los commits siempre requieren autorización explícita del usuario
(ej: "comitea", "hacé el commit", "ok commit").
```

**Justificación**: Los commits son la única acción con impacto en el historial
compartido que el usuario quiere revisar antes de ejecutar. El resto de acciones
(edits, SQL, restarts) siguen siendo automáticas.

### Ajuste 2: Template de restricción para prompts futuros

Incluir en todo prompt de tarea compleja:

```
RESTRICCIONES GIT
- NO ejecutar git add ni git commit.
- Sugerir mensaje de commit y lista de archivos.
- El usuario ejecuta manualmente.
- Esta restricción prevalece sobre cualquier memoria de autonomía.
```

La cláusula "prevalece sobre cualquier memoria" es clave para resolver
la ambigüedad cuando la memoria dice "ejecutar todo".

### Ajuste 3: scope-guard — quitar Bash

scope-guard tiene Bash "restringido textualmente" pero la restricción textual
demostró ser frágil en el incidente de work-standards. Recomendación:
cambiar `tools: Read, Glob, Grep, Bash` a `tools: Read, Glob, Grep`.
Si necesita git log/status, puede pedirle al main loop que lo ejecute.

### Ajuste 4: No se necesitan cambios en visual-consistency ni business-context

Ambos ya son solo lectura sin Bash. Están correctamente configurados.

---

## 5. Resumen ejecutivo

| Aspecto | Estado |
|---------|--------|
| Agentes ejecutaron commits | **NO** — ningún agente commiteo |
| Claude Code main loop commiteo | **SÍ** — 5 commits, 2 autorizados, 1 violación, 1 sin restricción, 1 zona gris |
| Hardening de agentes funciona | **SÍ** — intacto desde 92196f7, ningún agente ejecutó DML ni commit |
| Causa raíz | Conflicto entre memoria de autonomía (persistente) y restricción por prompt (efímera) |
| Riesgo residual | BAJO — el main loop solo commitea código ya revisado, no genera datos espurios |

**El hardening de agentes cumplió su objetivo.** El hueco está en el main loop,
que no tiene enforcement técnico para restricciones de commit — solo textual.
La solución es acotar la memoria de autonomía y agregar cláusula de prevalencia
en los prompts.

---

*Generado como auditoría de governance. No se modificó ningún archivo del proyecto.*
