# Session Handoff — 2026-05-16 (nocturna) — Master Doc Foundation

> Sesión autónoma de Claude Local mientras Oscar dormía.
> Trabajo dejado en la rama **`wip/master-doc-foundation`** **sin push**.
> Para retomar: leer este doc + `docs/PROJECT_MASTER_ARCHITECTURE.md` +
> `docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md`.

---

## TL;DR

Construí la base estructural completa para el Documento Maestro:
truncados eliminados, 12 tablas SQL nuevas, módulo `master/` con
stubs CRUD, 8 templates de prompts CAG en `docs/PROMPTS_CAG/`, plan
de implementación con descomposición por fases y horas estimadas.
**Cero código LLM real ejecutado** (sin gastar API). **Cero push.**
Todo está en la rama `wip/master-doc-foundation` localmente.

SUSTRAI no se ha tocado. El servidor local está corriendo en :3000
con las migraciones aplicadas y la nueva ruta `/v1/master/*` activa.
Brussels Event Participation sigue funcionando como anoche.

---

## 1. Qué se hizo (por bloques)

### Bloque 1 — Truncados eliminados ✅

En `node/src/modules/developer/model.js`:

| Campo | Antes | Ahora |
|---|---|---|
| `wp.summary` | 400 chars | sin truncar |
| `act.description` (cascada) | 250 chars | sin truncar |
| `act.description` (WP focus) | 400 chars | sin truncar |
| `act.description` (buildProjectContext) | 300/150 chars | sin truncar |
| `milestone.description` | 300 chars | sin truncar |
| `milestone.verification` | 200 chars | sin truncar |
| `deliverable.description` | 300 chars | sin truncar |
| `task.description` | ignorada | incluida sin truncar |
| `pifText` profile partner | 600 chars | sin truncar |
| `orgs.description` profile partner | 400 chars | sin truncar |
| `projectContext` en improveSection | 3000 chars | sin truncar |

**Lo que NO toqué** (a propósito):
- `staff.skills_summary` (80 chars) — es resumen breve por diseño
- `problem`/`approach` (200 chars) en `buildSectionRagQuery` — son keywords
  para el RAG semántico, no contenido
- `ragChunks` (8000 chars) — chunks RAG, deben quedarse compactos

### Bloque 2 — Migración 103 ✅ APLICADA EN LARAGON

`migrations/103_master_document_foundation.sql` creó 12 piezas:

1. `master_documents` — entidad raíz del Master por proyecto, versionado
2. `master_chapters` — capítulos del Master (body MEDIUMTEXT sin límites)
3. `master_exports` — PDFs exportados con estado borrador/lista_para_presentar
4. `chat_threads` — hilo de chat por proyecto y fase
5. `chat_messages` — mensajes con anchor visual + métricas LLM (tokens, cache)
6. `call_form_templates` — plantillas del formulario oficial por convocatoria
7. `call_form_questions` — preguntas con max_chars/words/pages
8. `master_to_form_mapping` — mapping declarativo Master → respuesta de formulario
9. `call_documents` — documentos canónicos parseados (NO vectorizados — CAG)
10. `master_diagnoses` — ejecuciones de diagnóstico (initial/advanced/score)
11. `master_diagnosis_items` — items accionables con classification narrative/economic
12. `project_documents.doc_purpose` — ALTER columna añadida (core vs support)

Idempotente. Aplicada con éxito local. **Pendiente aplicar en prod cuando
se haga merge a main**.

### Bloque 3 — Módulo `master/` ✅

```
node/src/modules/master/
├── routes.js       — Express routes bajo /v1/master/*
├── controller.js   — Capa HTTP con ok/bad helpers
└── model.js        — CRUD básico para las 11 tablas nuevas
```

Registrado en `server.js` línea 118 (`app.use('/v1/master', ...)`).

Endpoints implementados (todos require requireAuth):
- `GET/POST /v1/master/projects/:projectId/documents`
- `GET/PATCH/DELETE /v1/master/documents/:id`
- `GET/POST /v1/master/documents/:id/chapters`
- `PATCH/DELETE /v1/master/chapters/:id`
- `GET /v1/master/projects/:projectId/exports`
- `POST /v1/master/exports/:id/mark-ready`
- `GET /v1/master/projects/:projectId/threads/main`
- `GET/POST /v1/master/threads/:id/messages`
- `GET /v1/master/calls/:callId/form-templates`
- `GET /v1/master/form-templates/:id`
- `GET /v1/master/calls/:callId/documents`
- `GET /v1/master/documents/:id/diagnoses`
- `GET /v1/master/diagnoses/:id`

Endpoints LLM (devuelven 501 con mensaje "no conectado todavía"):
- `POST /v1/master/documents/:id/compile-v1`
- `POST /v1/master/documents/:id/regenerate`
- `POST /v1/master/documents/:id/diagnose`
- `POST /v1/master/documents/:id/score`
- `POST /v1/master/documents/:id/compress-to-form`
- `POST /v1/master/documents/:id/coherence-pass`

Servidor levantado y respondiendo: `curl http://localhost:3000/v1/master/...`
devuelve 401 (auth) o el dato esperado.

### Bloque 4 — Prompts CAG ✅

Carpeta `docs/PROMPTS_CAG/` con 8 ficheros:

| Archivo | Propósito |
|---|---|
| `README.md` | Índice + convenciones + tabla de costes estimados |
| `01_compile_master_v1.md` | Compilación inicial del Master |
| `02_diagnosis_initial.md` | Diagnóstico tras v1, clasificación narrative/economic |
| `03_regeneration_unified.md` | Regeneración con contexto unificado (CAG completo) |
| `04_diagnosis_advanced.md` | Diagnóstico sobre versión enriquecida |
| `05_score_estimate.md` | Score panorámico por bloque + priority improvement list |
| `06_form_compression.md` | Master → respuesta de pregunta del formulario |
| `07_coherence_pass.md` | Pasada final de coherencia sobre todo el Master |
| `08_chat_refinement.md` | System prompt del chat persistente |

Cada prompt tiene frontmatter con metadata (modelo, tokens estimados,
cache strategy), system prompt detallado, user prompt template, output
JSON schema esperado y notas operativas.

### Bloque 5 — Plan de implementación ✅

`docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md` con:
- Estado actual (qué está hecho)
- 7 decisiones técnicas pendientes
- 9 fases (F1-F9) con sub-tareas de 2-4h
- Estimaciones de horas y orden recomendado
- Proyección de coste IA por proyecto en producción
- Riesgos identificados y mitigaciones

---

## 2. Lo que NO se hizo (y por qué)

| Cosa | Por qué |
|---|---|
| Llamadas reales a Anthropic | No estaba confirmado el estado de la API key. Decisión D3 pendiente. |
| Parsing de PDFs de la convocatoria | Requiere decidir D4 (qué librería). No bloqueante para el resto. |
| UI nueva | UI necesita prueba en navegador con interacción real, no autónoma sin riesgo. |
| Mapping de convocatoria piloto | Requiere D1 confirmado + trabajo manual con el PDF oficial delante. |
| Cualquier push a Git | Regla auto-impuesta de la sesión nocturna: cero push. |
| Cualquier toque a SUSTRAI | Regla auto-impuesta: cero riesgo al proyecto vivo. |

---

## 3. Estado del git al cierre

```
Rama actual:        wip/master-doc-foundation
Branch from:        dev-local @ 5a404d677 (igual a origin/main)
Commits locales:    pendientes (ver Bloque 7)
Push:               NO realizado
```

Ficheros tocados (todos commiteables):
- M `node/src/modules/developer/model.js` (truncados eliminados)
- M `server.js` (registro /v1/master)
- A `migrations/103_master_document_foundation.sql`
- A `node/src/modules/master/routes.js`
- A `node/src/modules/master/controller.js`
- A `node/src/modules/master/model.js`
- A `docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md`
- A `docs/PROMPTS_CAG/README.md`
- A `docs/PROMPTS_CAG/01_compile_master_v1.md`
- A `docs/PROMPTS_CAG/02_diagnosis_initial.md`
- A `docs/PROMPTS_CAG/03_regeneration_unified.md`
- A `docs/PROMPTS_CAG/04_diagnosis_advanced.md`
- A `docs/PROMPTS_CAG/05_score_estimate.md`
- A `docs/PROMPTS_CAG/06_form_compression.md`
- A `docs/PROMPTS_CAG/07_coherence_pass.md`
- A `docs/PROMPTS_CAG/08_chat_refinement.md`
- A `docs/handoffs/SESSION_HANDOFF_2026-05-16_master-doc-foundation.md` (este fichero)

---

## 4. Decisiones que Oscar tiene que tomar antes de seguir

(Mismas 7 de `PROJECT_MASTER_IMPLEMENTATION_PLAN.md` §1)

| # | Decisión | Default si no responde |
|---|---|---|
| D1 | Convocatoria piloto para mapping | SMP-COSME-2026-TOURSME-01 (la de SUSTRAI) |
| D2 | Modelo Anthropic primario | claude-sonnet-4-6 |
| D3 | ¿API key Anthropic ya activa? | Verificar `.env` y Coolify antes de fase F2 |
| D4 | Generador de PDFs | docxtemplater + Chromium headless |
| D5 | Idioma default del Master | Español, traducción solo en compresión final |
| D6 | Quién sube call_documents | Solo admin role |
| D7 | Cap de tokens Anthropic / mes | Sin definir, monitorización primero |

---

## 5. Punto exacto para retomar mañana

### Si Oscar aprueba la rama:

1. Revisar diff: `git diff main wip/master-doc-foundation`
2. Si OK: merge a dev-local + push, luego `/merge` a main vía slash command
3. Aplicar migración 103 en prod (Coolify la ejecuta auto en el deploy)
4. Confirmar D1-D3 conmigo
5. Arrancar fase F2.1 — Cliente Anthropic con prompt caching (2-3h)

### Si Oscar no aprueba algo:

1. Identificar qué le chirría
2. Branch se queda como está; ajustar lo necesario antes de mergear
3. Si rechaza el approach entero, la branch se borra y volvemos a dev-local
   sin daño (SUSTRAI intacto)

### Si Oscar quiere ir más rápido:

Prioridad recomendada para arrancar mañana (3-4 horas productivas):
1. F2.1 — Anthropic client (2-3h) → test con un prompt corto
2. F2.2 — CAG pipeline base (3-4h) → función runPrompt funcional
3. Primer test E2E: compilar el Master v1 de SUSTRAI con el prompt 01

---

## 6. Archivos clave para abrir mañana

En orden de lectura sugerido:

1. Este handoff
2. `docs/PROJECT_MASTER_ARCHITECTURE.md` (la visión cerrada anoche)
3. `docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md` (el plan ejecutable)
4. `docs/PROMPTS_CAG/01_compile_master_v1.md` (el primer prompt a integrar)
5. `node/src/modules/master/model.js` (lo que ya hay de plumbing)

---

## 7. SUSTRAI backup vigente

`tmp/sustrai_full_backup_2026-05-15T21-47-28-213Z.json` (397 rows, 49 tablas).

Restore si algo se rompe:
```bash
node tmp/restore_sustrai_full.js tmp/sustrai_full_backup_2026-05-15T21-47-28-213Z.json --confirm
```

Project_id: `11373f08-a611-4ce7-9249-fa81b588a18e`.

---

*Fin del handoff. Suerte mañana.*
