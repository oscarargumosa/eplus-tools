# E+ Tools — Plan de implementación del Documento Maestro

> Plan ejecutable derivado de `docs/PROJECT_MASTER_ARCHITECTURE.md`.
>
> Cada paso del roadmap §16 descompuesto en sub-tareas de 2-4 horas,
> con dependencias, decisiones técnicas pendientes y estimaciones
> de coste. Pensado para que cualquier sesión de trabajo (Oscar +
> Claude) sepa qué atacar y en qué orden.
>
> **Estado**: plan **redactado**, **implementación parcial**.
> Lo que ya está hecho aparece marcado ✅.
> **Última revisión**: 2026-05-16 (sesión nocturna).

---

## 0. Estado actual (lo que ya está hecho)

### ✅ Bloque foundation (rama `wip/master-doc-foundation`, sin push)

1. **Truncados eliminados** en `node/src/modules/developer/model.js`
   - `wp.summary` (antes 400 chars) → sin truncar
   - `act.description` (antes 250 chars) → sin truncar
   - `act.description` WP focus (antes 400 chars) → sin truncar
   - `milestone.description` y `verification` (antes 300/200 chars) → sin truncar
   - `deliverable.description` (antes 300 chars) → sin truncar
   - `task.description` (antes ignorada) → ahora incluida
   - `pifText` (antes 600 chars) → sin truncar
   - `orgs.description` profile (antes 400 chars) → sin truncar
   - `act.description` en buildProjectContext (antes 300/150 chars) → sin truncar
   - `projectContext` en improveSection (antes 3000 chars) → sin truncar

2. **Migración 103 aplicada**: 12 piezas estructurales nuevas
   (master_documents, master_chapters, master_exports, chat_threads,
   chat_messages, call_form_templates, call_form_questions,
   master_to_form_mapping, call_documents, master_diagnoses,
   master_diagnosis_items, + ALTER project_documents.doc_purpose).

3. **Stubs del módulo `master/`**: routes + controller + model
   con CRUD básico para todas las tablas nuevas. Registrado en
   `server.js` bajo `/v1/master/*`. Sin pipeline LLM conectado
   (endpoints LLM devuelven 501 hasta fase 3).

4. **Templates de prompts CAG** en `docs/PROMPTS_CAG/`: 8 prompts
   versionados (compile, diagnosis initial/advanced, regeneration,
   score, compression, coherence, chat).

5. **Plan canónico** (este documento) + **arquitectura canónica**
   (`docs/PROJECT_MASTER_ARCHITECTURE.md`).

**NO incluido todavía** (siguientes pasos):
- Cualquier UI nueva
- Cualquier llamada real al LLM Anthropic (todo en stubs/prompts)
- Parsing de PDFs de la convocatoria
- Carga de plantillas de formulario oficiales

---

## 1. Decisiones técnicas pendientes (necesitan input de Oscar)

Antes de seguir, hay 7 decisiones que hay que cerrar:

| # | Decisión | Default sugerido si no responde |
|---|---|---|
| D1 | Convocatoria piloto para mapping Maestro → Formulario | SMP-COSME-2026-TOURSME-01 (la de SUSTRAI) |
| D2 | Modelo Anthropic primario para fase Perfeccionar | claude-sonnet-4-6 (mejor ratio precio/calidad) |
| D3 | ¿API key de Anthropic ya activa en `.env`? ¿Coolify la tiene? | Verificar antes de cualquier llamada real |
| D4 | ¿Cómo se generan los PDFs de export? | docxtemplater (ya en deps) + render a PDF con headless Chromium, o LibreOffice headless |
| D5 | ¿Idioma default del Master? | Español. Compresión a formulario aplica traducción si la call lo requiere |
| D6 | ¿Quién puede subir documentos de convocatoria (call_documents)? | Solo admin role |
| D7 | ¿Hay un budget cap por proyecto en tokens Anthropic / mes? | Aún sin definir; recomiendo monitorización por `ai_usage_log` antes de hard cap |

---

## 2. Fases de implementación

### Fase F1 — Foundation (✅ HECHO)

Lo que está en §0. Lista para revisión y merge si Oscar aprueba.

---

### Fase F2 — Compilación inicial del Maestro v1 (paso 3)

**Objetivo**: que el usuario pueda pulsar "Compilar Maestro" y obtener
una primera versión del Documento Maestro a partir de su Diseño +
Writer draft.

**Estimación total**: 8-12 horas (1-2 sesiones).

#### F2.1 — Cliente Anthropic con prompt caching (2-3h)
- Crear `node/src/modules/master/anthropic-client.js`
- Wrapper con prompt caching (cache_control breakpoints)
- Manejo de errores: 429, 5xx, timeout
- Logging a `ai_usage_log` (tokens, cache hit ratio, coste estimado)
- Test con un prompt corto trivial para validar API key

#### F2.2 — Pipeline CAG base (3-4h)
- `node/src/modules/master/cag-pipeline.js`
- Función `runPrompt(promptKey, vars)` que:
  1. Carga el template del prompt (.md con frontmatter en docs/PROMPTS_CAG/)
  2. Sustituye variables con interpolación segura
  3. Marca bloques cacheables
  4. Llama a Anthropic vía anthropic-client
  5. Parsea output (JSON estructurado)
  6. Persiste resultado y métricas
- Streaming + persistencia incremental (capítulos a medida que llegan)

#### F2.3 — Endpoint compileMasterV1 (2-3h)
- Reemplazar el stub 501 en `controller.compileMasterV1`
- Carga: design (buildEnrichedContext), writer draft, interviews, criteria
- Llama prompt `01_compile_master_v1`
- Persiste con `model.createMasterDocument` + `model.createChapter` por capítulo
- Devuelve el Master compilado al frontend
- Idempotencia: si ya existe v1 ready, devolver 409 con mensaje

#### F2.4 — UI mínima viable (3-4h)
- Nueva pestaña/sección en `public/js/master.js` (no existe aún)
- Botón "Compilar Maestro v1" en el proyecto
- Vista de lectura del Master con navegación entre capítulos
- Indicador de `needs_enrichment_flags` por capítulo
- NO edición todavía (eso viene en F5)

**Bloqueantes**: D1, D2, D3.

---

### Fase F3 — Diagnóstico inicial (paso 4)

**Objetivo**: tras compilar el Master v1, generar la lista de
contradicciones y huecos.

**Estimación total**: 6-8 horas.

#### F3.1 — Endpoint runDiagnosis kind='initial' (2-3h)
- Reemplazar stub
- Carga: master v1 + eval criteria + design snapshot
- Llama prompt `02_diagnosis_initial`
- Persiste en `master_diagnoses` + `master_diagnosis_items`

#### F3.2 — UI panel de diagnóstico (3-4h)
- Lista de items agrupados por classification (narrativo vs económico)
- Severidad con colores (info/warning/critical)
- Cada item clickeable: enlace al anchor (chapter, activity, partner, budget_line)
- Items económicos abren modal "Esto requiere ir a Calculator" con
  redirección con un click
- Items narrativos abren el chat anclado al capítulo correspondiente
  (esto requiere F5 — Chat)
- Estado per-item: open / resolved / dismissed

#### F3.3 — Diagnosis re-run (1h)
- Permite ejecutar el diagnóstico múltiples veces; cada ejecución es
  un nuevo `master_diagnoses` row con timestamp.
- UI muestra "Última ejecución hace Xh" y botón "Volver a diagnosticar".

**Bloqueantes**: F2 completo.

---

### Fase F4 — Mapping declarativo y compresión a formulario (pasos 5/11)

**Objetivo**: que el usuario pueda exportar el formulario oficial (60
o 120 págs) destilado del Master.

**Estimación total**: 14-20 horas (2-3 sesiones). **Es la fase más
laboriosa porque requiere modelar el formulario oficial de la
convocatoria piloto a mano.**

#### F4.1 — Plantilla del formulario para la convocatoria piloto (4-6h)
- Crear seeders SQL para `call_form_templates` y `call_form_questions`
  de la convocatoria piloto (D1, default SMP-COSME-2026-TOURSME-01)
- Cada pregunta con su question_code, max_chars/max_words/max_pages,
  question_kind, hint
- Total esperado: 20-50 preguntas para un formulario completo
- Trabajo manual con el PDF oficial de la call delante

#### F4.2 — Mapping declarativo Master → Form (3-4h)
- Crear seeders SQL para `master_to_form_mapping`
- Por cada question_code, declarar qué chapter_keys del Master la
  nutren, con weight y rules en texto libre
- Trabajo de diseño en colaboración con Oscar (necesita su criterio
  experto sobre qué chapters mapean a qué)

#### F4.3 — Endpoint compressToForm (3-4h)
- Reemplazar stub
- Itera por cada question del form_template
- Para cada question, llama prompt `06_form_compression` con su
  mapping específico
- Paralelización con pool de 5-10 concurrentes
- Persiste output en una tabla nueva `master_form_answers`
  (NOTA: esta tabla NO está en la migración 103; añadir migración 104
  cuando se llegue aquí)
- Endpoint devuelve el objeto completo para mostrar a Oscar antes
  de exportar PDF

#### F4.4 — Migración 104 — master_form_answers (1h)
```sql
CREATE TABLE master_form_answers (
  id CHAR(36) PRIMARY KEY,
  master_doc_id CHAR(36) NOT NULL,
  form_template_id CHAR(36) NOT NULL,
  question_code VARCHAR(100) NOT NULL,
  answer_body MEDIUMTEXT,
  char_count INT, word_count INT,
  language VARCHAR(10),
  missing_facts JSON,
  compression_ratio DECIMAL(5,2),
  notes TEXT,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- KEY + FKs
);
```

#### F4.5 — Generación de PDF formulario (3-5h)
- Decidir D4 (docxtemplater + headless Chromium vs LibreOffice)
- Plantilla DOCX que mimicra el Part B oficial (estructura, encabezados)
- Rellena con las answers + datos del proyecto
- Genera PDF y lo persiste en disco; metadata en `master_exports`
- Endpoint GET `/v1/master/exports/:id/download` sirve el PDF

**Bloqueantes**: F2 completo, D1 confirmado, D4 decidido,
acceso al PDF oficial de la convocatoria piloto.

---

### Fase F5 — Chat persistente con anclaje (paso 9)

**Objetivo**: el usuario refina el Master charlando con la IA, anclando
visualmente al capítulo activo.

**Estimación total**: 8-10 horas.

#### F5.1 — Endpoint chat con LLM real (3-4h)
- Reemplazar el stub `appendMessage` para que, cuando role=user,
  dispare automáticamente una llamada al LLM con prompt
  `08_chat_refinement` y persiste también la respuesta (role=assistant)
- Construye el contexto CAG: master actual + call docs + criterios +
  historia del hilo + anchor
- Parsea proposed_edit JSON si viene al final del mensaje
- Marca cache breakpoints en mensajes "estables"

#### F5.2 — UI chat panel (4-5h)
- Sidebar derecho con el chat siempre visible
- Etiqueta de anchor que cambia al hacer click en capítulos del Master
- Render de markdown + JSON proposed_edit con botones
  "Aplicar al Master" / "Pedir otra versión"
- Aplicar → POST PATCH al chapter + marca el mensaje como
  applied_to_master

#### F5.3 — Poda automática de historia larga (1h)
- Cuando un hilo supera 100 mensajes, generar resumen automático
  con un prompt corto y comprimir los 50 más antiguos en un solo
  mensaje "system" tipo memoria.

**Bloqueantes**: F2 completo.

---

### Fase F6 — Regeneración + Diagnóstico avanzado + Score (pasos 6, 7, 8)

**Objetivo**: pipeline completo de la fase Perfeccionar.

**Estimación total**: 14-18 horas.

#### F6.1 — Carga de call_documents al subir PDFs (3-4h)
- Endpoint admin: POST `/v1/master/calls/:callId/documents`
- Acepta PDF/DOCX, extrae texto (puppeteer o pdf-parse + mammoth)
- Persiste body_text en `call_documents`, calcula char_count y
  token_count_est
- UI admin: subida múltiple drag-and-drop por convocatoria

#### F6.2 — Endpoint regenerateWithUnifiedContext (4-5h)
- Reemplazar stub
- Carga ALL de: call_documents + reference docs + design + master v1 +
  diagnosis findings + chat history
- Llama prompt `03_regeneration_unified` con streaming
- Persiste como nuevo `master_documents` v2 (parent_id apuntando a v1)
- Trigger UX: botón con preview del coste estimado antes de ejecutar

#### F6.3 — Endpoint runDiagnosis kind='advanced' (1-2h)
- Variante del F3.1 con prompt `04_diagnosis_advanced` sobre el v2

#### F6.4 — Endpoint computeScoreEstimate (2-3h)
- Reemplazar stub
- Llama prompt `05_score_estimate`
- Persiste en `master_diagnoses` con score_value + score_breakdown
- UI: dashboard con barras de progreso por bloque + priority improvement list

#### F6.5 — Botón "Mejorar esta área con IA" desde score (1h)
- Abre el chat anclado al chapter de la priority improvement
- Primer mensaje del asistente preformateado con la acción recomendada

**Bloqueantes**: F2 + F5 completos.

---

### Fase F7 — Repaso de coherencia + Export final (pasos 10, 11)

**Objetivo**: cerrar el ciclo de Perfeccionar antes del export final.

**Estimación total**: 6-8 horas.

#### F7.1 — Endpoint coherencePass (2-3h)
- Reemplazar stub
- Llama prompt `07_coherence_pass`
- Persiste como nuevo `master_documents` v4_ready

#### F7.2 — UI diff aceptable item por item (3-4h)
- Lista de changes_log con accept/reject por item
- Vista before/after lado a lado

#### F7.3 — Export amplio (1h)
- Endpoint `/v1/master/documents/:id/export-amplio`
- Render del Master completo a PDF (100-200 pág)
- Persiste en `master_exports` con export_kind='amplio'

---

### Fase F8 — Convocatorias adicionales

Replicar F4.1 + F4.2 + F4.3 + F4.5 para las 3-4 convocatorias
restantes ya cargadas en BD. Estimación 3-5 días por convocatoria
(formularios distintos, mappings distintos).

---

### Fase F9 — Fase Evaluar (futuro)

Sin diseñar todavía. Pendiente sesión de producto con Oscar.

---

## 3. Resumen de horas y orden recomendado

| Fase | Horas | Bloqueantes | Recomendado tras |
|---|---|---|---|
| F1 Foundation | ✅ HECHO | — | — |
| F2 Compilación Maestro v1 | 8-12 | D1, D2, D3 | F1 |
| F3 Diagnóstico inicial | 6-8 | F2 | F2 |
| F4 Mapping + Compresión + Export form | 14-20 | F2, D1, D4 | F2 (no necesita F3) |
| F5 Chat persistente | 8-10 | F2 | F2 |
| F6 Regen + Diag avanzado + Score | 14-18 | F2, F5 | F2 + F5 |
| F7 Coherence pass + Export amplio | 6-8 | F6 | F6 |
| F8 Más convocatorias | 24-40 | F4 | F4 |
| F9 Fase Evaluar | TBD | — | — |
| **TOTAL F2-F7** | **56-76 h** | | |

Orden ejecutivo sugerido:

```
1. Cierre F1 con Oscar (revisar, mergear si OK)
2. F2 (Compilación Maestro v1) ← primer hito visible
3. F3 (Diagnóstico inicial) ← refuerza ya el ciclo de iteración
4. F4.1 + F4.2 (Mapping convocatoria piloto) — trabajo manual con Oscar
5. F5 (Chat) ← desbloquea refinamiento real
6. F4.3 + F4.4 + F4.5 (Compresión + Export form)
7. F6 (Regen + Diag avanzado + Score)
8. F7 (Coherence pass)
9. F8 (Resto convocatorias)
```

Con sesiones de 4-6h productivas, completar F2-F7 son ~12-15 sesiones.
Realista en 3-4 semanas si Oscar tiene continuidad. F8 es trabajo
incremental que no bloquea.

---

## 4. Coste de IA en producción (proyección)

Tras todas las fases implementadas, un proyecto refinado al máximo
consume aproximadamente:

| Operación | Coste (Sonnet 4.6) | Frecuencia |
|---|---|---|
| Compilación Master v1 | $1.20-3.00 | 1 vez por proyecto |
| Diagnóstico inicial | $0.20-0.35 | 1-3 veces |
| Regeneración con contexto unificado | $2.00-4.00 | 1-2 veces |
| Diagnóstico avanzado | $0.30-0.50 | 1-2 veces |
| Score estimate | $0.25-0.40 | 2-5 veces (entre iteraciones) |
| Chat refinement | $0.15-0.25 por turno × 40 turnos | ~$8 total |
| Compresión a formulario | $5-8 (60 preguntas × ~$0.10) | 1-3 veces (multi-convocatoria) |
| Coherence pass | $0.80-1.50 | 1-2 veces |
| Export amplio (sin LLM) | $0 | n veces |
| **TOTAL típico por proyecto** | **$15-25** | |

Sobre precios premium del servicio (probablemente cientos a miles de
euros por proyecto), el coste de IA es <2% del revenue. Margen muy
cómodo.

---

## 5. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Coste de IA descontrolado por bucles | Hard cap por proyecto en `ai_usage_log` (D7); alertas a partir del 80% del cap |
| Salida del LLM no parseable como JSON | Estructura robusta de prompts + retry con corrección de error en segundo intento + fallback a parsing best-effort |
| API key Anthropic se queda sin saldo | Monitorización de balance + alerta proactiva en Coolify |
| El mapping declarativo Master→Form queda desactualizado al cambiar el formulario oficial | Versionar el mapping con el template; cuando la EU saque nuevo PDF de la call, crear nuevo template_id y migrar mappings |
| Usuarios suben PDFs gigantes (>100 págs) que rompen el bundle CAG | Validación al subir: warning si >50 págs, hard limit a 200 págs por doc |
| Pérdida de trabajo si la regeneración falla a mitad | Streaming + persistencia incremental por capítulo (ya contemplado) |
| Migración de schema rompe SUSTRAI | Todas las migraciones idempotentes; backups antes de cada deploy |

---

## 6. Cómo retomar este plan en sesiones futuras

1. Lee `docs/PROJECT_MASTER_ARCHITECTURE.md` (la visión).
2. Lee este documento (`docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md`).
3. Revisa `docs/PROMPTS_CAG/` para entender los outputs LLM esperados.
4. Mira la lista de tareas (sección §0 marca lo hecho).
5. Confirma con Oscar las decisiones técnicas pendientes (§1) que apliquen al siguiente paso.
6. Arranca por el siguiente paso del orden ejecutivo (§3).

Cuando termines una sesión, actualiza la sección §0 con lo que añadiste
y la sección §1 con decisiones que se hayan cerrado.

---

*Generado en sesión nocturna 2026-05-16 por Claude Local autónomo
mientras Oscar dormía. Revisable y modificable.*
