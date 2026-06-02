# Session Handoff — 2026-05-17 — Perfeccionar Flow Redesign

> Sesión maratón del 17-may. Mucho trabajo cerrado + diseño pendiente
> para arrancar fresh mañana.

---

## TL;DR

Hoy se cerró **toda la infraestructura de Perfeccionar** (calidad del
compile, chat refinement, comprimir a formulario oficial, exporter
Form Part B, todos los bugs Designer↔Writer cascade). En vivo se
probó la compresión a formulario y funcionó parcialmente — pendiente
verificar que los fixes finales (output cap mayor + fallback raw +
exclusión sección 6) cierran el problema.

**Lo que queda PENDIENTE para mañana**: refactor de UX de Perfeccionar
en 3 sub-tabs con flujo guiado (decidido pero no implementado).

---

## Lo que se completó hoy (commiteado en main)

### Calidad del compile Master (Paso 1)

- `loadProjectQualityContext()` en `master/model.js`: carga eval_tree
  completo con `intent/elements/example_strong/avoid` + reglas
  transversales (`writing_style`, `additional_rules`,
  `ai_detection_rules`). Indexa por código de subsección.
- `compileMasterV1`: fix del join roto (`programme_id` → join via
  `intake_programs.action_type`). Inyecta 4 variables nuevas al
  prompt 01b. Pre-carga `getWpItemsBlock` por WP (tasks + milestones
  + deliverables narrables). `target_words` por capítulo.
- Prompt `01b_compile_single_chapter.md` reescrito con estructura
  EACEA literal, reglas anti-tabla, target_words, criteria-driven.
- `cag-pipeline.js`: normaliza CRLF→LF antes del regex de frontmatter
  (templates editados en Windows fallaban silenciosamente).
- Bundle CAG cap reducido 80k→50k tokens (320k→200k chars) para hacer
  hueco a las nuevas variables.

### Chat refinement por capítulo (Paso 2)

- `POST /v1/master/chapters/:id/refine` con modes
  `free`/`validate`/`rewrite`/`apply`.
- Persistencia en `chat_messages` por anchor=chapter.
- Prompt `08_chat_refinement.md` reescrito: anchor-aware, criteria-
  driven, special modes.
- UI: chat panel lateral por capítulo en master.js, botón "Validar
  contra criterios", `proposed_edit` con "Aplicar al Master",
  refresh inline.

### Bug-fixes Designer↔Writer sync (saveFullState)

1. **Bug A — Summary/objectives/description machacados**: snapshot
   pre-delete + restore por order_index/type+label.
2. **Bug B — Brussels routes con basura**: parseRouteKey robusto;
   extra_dests insertadas antes; endpoints traducidos al uuid real;
   loadFullState devuelve db_id para que frontend reconstruya keys
   con `_edN`.
3. **Bug C — Routes pierden km al recargar**: bug del roundtrip.
   Fix backend+frontend.
4. **Bug D — Perdiem extra_dest mal aplicado**: buildResPartner usaba
   perdiem del partner que viaja en vez del destino. Fix alineado
   con backend.
5. **Bug E — Deliverables/milestones/wp_tasks borrados por CASCADE**:
   Las tres tablas tenían `ON DELETE CASCADE` sobre work_packages.
   saveFullState snapshot pre-delete + restore con wpOrderToNewId
   manteniendo IDs originales para preservar deliverable_tasks y
   milestone→deliverable links.

### Calidad TOURSME

- Diagnóstico: criterios oficiales YA estaban cargados en Plus Data
  (68 criterios estructurados en 14 subsecciones de TOURSME). El bug
  era que el query usaba `programme_id` que no existe en `projects`.
- 3 campos transversales en `call_eligibility` (writing_style,
  additional_rules, ai_detection_rules) también ya estaban llenos
  para TOURSME (~3.300 tokens). El LLM tampoco los leía. Ahora SÍ.

### Compresión Master → formulario oficial

- `POST /v1/master/documents/:id/compress-to-form`:
  - Parsea form_templates.template_json
  - Extrae fields textarea recursivamente
  - Mapea cada field al capítulo del Master (`s1_1_text` →
    `ch_1_1_*`)
  - Excluye sección 6 (Declarations administrativas)
  - Llama prompt 06 por cada field
  - Persiste en `form_field_values`
  - Fallback: si JSON no parsea, persiste raw text
- Prompt `06_form_compression.md` reescrito con variables
  consistentes y cache_breakpoint.
- UI: botón "Comprimir a formulario oficial" en master.js, panel
  de resultados con fields/chars/gaps, botón "Descargar Form Part B
  (.docx)".

### Patches manuales SUSTRAI

- Aplicados a 9 capítulos del Master (39903b0a...): añadidos los
  principios operativos del doc ref `SUSTRAI_Project_Document_AMPLIO.docx`
  (distribución 10+10+10, 2 rondas FSTP M8-M12/M20-M28, 4 reuniones
  transnacionales con ubicación, 5 fuentes de ingreso post-proyecto,
  codificación T1.1/D2.3/MS5).
- Master ahora: 216.715 chars (~173 págs).
- 6 master_documents viejos de SUSTRAI eliminados (cleanup).

---

## PENDIENTE para mañana — Refactor UX Perfeccionar

### Decisión tomada (Oscar)

1. **Un solo Master por proyecto** (eliminar botón "Nuevo Maestro").
2. **3 sub-tabs en panel Perfeccionar** (paralelo a Diseñar/Escribir):
   - **Tab 1 — Crear versión extendida**: si no hay Master → botón
     Compilar; si hay → lectura de los 22 capítulos + Recompilar +
     Descargar .md. SIN chat aquí.
   - **Tab 2 — Diagnóstico y refinamiento**: botón Lanzar diagnóstico
     → items accionables. Cada item con 3 acciones:
     - **Abordar con chat** → abre chat refinement con anchor al
       capítulo del item y mensaje pre-cargado tipo "Aborda este gap:
       [item.title]. [item.suggestion]"
     - **Descartar** → marca item como ignorado
     - **Aplicar manualmente** → marca como resuelto sin chat
     Cuando todos los items están resueltos/descartados, botón
     "Lanzar diagnóstico avanzado" para segunda pasada más fina.
   - **Tab 3 — Preparar formulario oficial**: botón Comprimir →
     panel de fields generados + Descargar Form Part B (.docx).
3. **Opción A elegida**: chat solo disponible desde un item del
   diagnóstico, no por capítulo individual. Si el usuario quiere
   refinar algo que el diagnóstico no detectó, primero relanza el
   diagnóstico o crea item personalizado.

### Cambios técnicos a implementar mañana (~2h)

| # | Cambio | Lugar |
|---|---|---|
| 1 | Eliminar botón "Nuevo Maestro" — un único Master por proyecto, lazy-create | `master.js render()` |
| 2 | Sub-tabs (Crear/Diagnosticar/Comprimir) en panel-master | `master.js openMaster()` re-render con 3 paneles |
| 3 | Quitar chat lateral por capítulo del render | `master.js` |
| 4 | En cada item de diagnóstico: botones "Abordar con chat", "Descartar", "Aplicar manualmente" | `master.js renderDiagnosis()` |
| 5 | Endpoint `PATCH /master/diagnosis-items/:id` con `{state}` | `master/controller.js` + `routes.js` (tabla `master_diagnosis_items.state` ya existe) |
| 6 | Mensaje pre-cargado al chat cuando se abre desde un item | El message inicial se rellena con `item.suggestion` |
| 7 | Botón "Crear item personalizado" para añadir items que el diagnóstico no detectó | UI + endpoint POST item |
| 8 | Botón "Master listo, pasar a Comprimir" cuando todos los items están resueltos | Lógica de transición entre tabs |

### Punto de partida exacto para mañana

1. Leer este handoff completo.
2. Abrir [[project-master-tier-premium]] y [[session-2026-05-17]] (esta sesión).
3. Comenzar por **cambio #2** (sub-tabs) — es el más visible y desbloquea el resto.
4. Implementar #4-6 en sequence.
5. Test E2E con SUSTRAI: lanzar diagnóstico, abordar 2-3 items con chat, comprimir, descargar.

---

## Bloque extra cerrado entre los dos último commits (botón download + bug token)

- Fix `_downloadFormDocx` en master.js: usaba `localStorage.getItem('jwt')`
  pero el token vive en `API.getToken()` (variable en memoria). Daba 401.
  Cambio a `API.getToken()`.
- Botón **"Descargar Form Part B (.docx)"** movido al header del panel
  Master (al lado de Lanzar diagnóstico / Comprimir / Descargar .md)
  para que sea siempre accesible, no solo dentro del panel de resultados
  de compress.
- Pasa `doc.project_id` (no instance_id como antes — el exporter va
  por project_id: `/v1/exporter/projects/:projectId/form-part-b.docx`).

---

## Hallazgos del último round de Q&A con Oscar (importante para mañana)

### Aclaración terminológica "Prep Studio"

**No existe pestaña con el nombre "Prep Studio" en la UI actual**. Lo que
internamente se llamaba "Prep Studio v2" son las 5 sub-pestañas del
módulo Escribir:

```
Cronograma · Consorcio · Relevancia · Actividades · Tareas · Entregables · Escribir · Revisar
```

Cuando hables con el usuario, NO uses "Prep Studio" — usa los nombres
visibles ("pestaña Relevancia", "pestaña Consorcio", etc.).

### Qué se lee REALMENTE de la pestaña Escribir al compilar el Master

Después de Q&A exhaustivo con Oscar, queda claro: **TODO lo que el
usuario rellena en las pestañas visibles se inyecta al compile**.

| Pestaña visible en Escribir | Tabla BD donde guarda | Se lee al compilar? |
|---|---|---|
| Cronograma | `work_packages.duration_from/to` | ✅ vía enriched_context |
| Consorcio (datos socios + staff) | `partners`, `partner_staff`, etc. | ✅ vía enriched_context |
| **Relevancia (Problem / Target groups / Approach)** | **`intake_contexts`** | **✅ vía enriched_context** (líneas 693-700 de developer/model.js) |
| Actividades / Tareas / Entregables (WPs) | `work_packages.summary`, `wp_tasks`, `milestones`, `deliverables` | ✅ vía enriched_context + wp_explicit_items |
| Escribir (cascade Writer general) | `writer_sections` | Vacío en SUSTRAI (tabla legacy del cascade antiguo, opcional) |
| Resumen / Project Summary (lo que ves arriba del proyecto) | **`projects.interview_summary` (4.151 chars en SUSTRAI)** | **❌ NO se lee — pendiente cablear** |

**Mi error durante la sesión**: dije "Relevancia vacía" mirando
`writer_sections` (tabla legacy obsoleta) cuando la tabla activa es
`intake_contexts` y SÍ está llena con 4.818 chars (problem 1.650 +
target_groups 1.525 + approach 1.643).

### TAREA pendiente añadida para mañana (5 min)

**Cablear `projects.interview_summary` al compile**:

En `node/src/modules/master/controller.js::compileMasterV1`, leer
también `projects.interview_summary` y `projects.description` (4.151
chars en SUSTRAI) e inyectarlos al prompt como una variable nueva
`{{project_executive_summary}}` o concatenarlos al `enriched_context`
debajo de un header `═══ EXECUTIVE SUMMARY (del usuario) ═══`.

Coste: 5 min de código. Beneficio: el compile ya tiene la voz
ejecutiva del usuario sobre el proyecto, no solo el desglose técnico.

### Diagnóstico final de calidad del Master del 17/5

El Master compilado tiene **216.715 chars (~173 págs)** + los patches
aplicados manualmente desde `SUSTRAI_Project_Document_AMPLIO.docx`.
La calidad es alta. **Lo que falta detalle operativo (10+10+10, 2
rondas FSTP con meses, 4 reuniones transnacionales con ubicación, 5
fuentes ingreso post-proyecto, códigos T/D/MS) es CONTEXTO no metido
en el design del Intake** — no es bug de prompt sino que el modelo
de datos del Intake no contempla esos campos. Subsanado vía patches
manuales para SUSTRAI.

A futuro: si Oscar mete esa información en los WP summaries o en
campos nuevos del schema, el compile lo absorberá sin más.

---

## Lista actualizada de TAREAS para mañana (en orden)

1. **[5 min]** Cablear `projects.interview_summary` al compile como
   variable nueva.
2. **[2h]** Refactor UX Perfeccionar en 3 sub-tabs (detalle arriba):
   1. Crear versión extendida
   2. Diagnóstico + chat refinement (Opción A — chat solo desde items)
   3. Preparar formulario oficial
3. **[30 min]** Verificar end-to-end que el exporter Form Part B
   (`/v1/exporter/projects/:projectId/form-part-b.docx`) lee
   correctamente de `form_field_values` tras un compress-to-form
   y genera DOCX válido para EACEA.
4. **[opcional]** Si tras los tres anteriores hay tiempo: empezar a
   modelar campos de schema para meeting locations + revenue sources
   post-project (esas dos dimensiones del doc ref no encajan en
   ningún sitio del design hoy).

---

## Estado git al cierre

```
Rama: dev-local
Último commit antes de cerrar: <ver git log -1>
Todas las ramas (main, dev-local, dev-vps, wip/master-doc-foundation) sincronizadas con main tras /merge.
```

## Estado SUSTRAI al cierre

- Master único: `39903b0a-dc70-4c03-bd8e-97bb88f445b6` (216.715 chars,
  ~173 págs, status=ready) con los 22 capítulos + los patches
  manuales del 17/may.
- 6 master_documents viejos borrados.
- TOURSME tiene 68 criterios + 3 reglas transversales cargados en
  Plus Data — el compile los lee correctamente.
- Pendiente: probar el flujo completo Compilar → Diagnóstico → Chat
  refinement → Comprimir → Descargar DOCX. Quedó testado parcial.

---

*Fin handoff 2026-05-17. Buen trabajo hoy.*
