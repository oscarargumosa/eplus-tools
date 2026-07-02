# DIAGNOSE & IMPROVE — Sistema replanteado

> **Estado:** APROBADO el diseño · LISTO PARA EMPEZAR Fase 1
> **Fecha plan:** 2026-05-25
> **Owner:** Local Claude (eplus-tools)
> **Reemplaza a:** `PROJECT_MASTER_ARCHITECTURE.md` y `PROJECT_MASTER_IMPLEMENTATION_PLAN.md` (ambos quedan obsoletos cuando este plan se ejecute)

---

## 0 · TL;DR

Replanteo del sistema de Perfeccionar / Evaluar. Lo que cambia:

- **Eliminar el "Master document"** como artefacto intermedio. El **Form Part B es el documento canónico** desde el primer minuto.
- **Crear una pestaña "Diagnóstico"** como puerta única que acepta tres tipos de cliente: greenfield (proyecto recién escrito), audit (proyecto importado), reciclaje (proyecto + carta de evaluador). El Diagnóstico funciona como triaje (rediseñar / perfeccionar / exportar).
- **Construir un DB de patrones de evaluadores EACEA** — el activo defensible del producto. Cada carta subida se parsea en findings estructurados que (a) dirigen la mejora del proyecto del cliente y (b) alimentan reglas duras del Writer para todos los proyectos futuros.
- **Catálogo controlado**: cada proyecto y cada carta están vinculados a un `call_id` que existe en Admin Data E+. No hay inputs huérfanos.
- **Perfeccionar pasa de "regenerar todo de una vez" a "ediciones puntuales con diff visible y accept/reject por cambio"**. Esto solo baja el consumo de tokens entre 10x y 20x en la fase final, sin perder calidad.

---

## 1 · Contexto y motivación

### Síntoma reportado

El usuario percibe que cuando llega a la fase **Perfeccionar**, la app **no mejora el proyecto** — y al imprimir el Form que sale de Perfeccionar contra el que sale de Escribir, **el de Escribir es de mayor calidad**.

### Causa raíz (verificada en código, no por intuición)

1. **El "Master" se regenera desde Diseño + entrevistas + documentos del proyecto, ignorando lo escrito en el Writer.** El usuario pule en Escribir y al entrar a Perfeccionar ve otro texto que la IA ha generado en paralelo. No es continuación, es texto sustitutivo.
2. **El Master no es lo que evalúa EACEA.** Lo que evalúa es el Form Part B. El Master es un artefacto intermedio de ~200k chars que ningún ponente lee.
3. **`/propose-rewrite` aplica reescrituras de capítulo completo sin verificación**: no compara `new_body` contra `body`, no muestra diff al usuario, no guarda versión anterior. Si el LLM falla o devuelve texto plano, se sobreescribe igual.
4. **El diagnóstico es por capítulo, no cross-section**. La inconsistencia clásica de propuestas EU (sección 1.1 promete X, sección 1.2 lo contradice) **nunca se detecta** porque ningún prompt mira el documento cruzado.
5. **"Mejor" no está definido**. Sin una medida concreta (puntos en rúbrica EACEA, coherencia interna, concreción), "mejorar" es ruleta — el LLM siempre devuelve algo distinto y la app lo llama "mejora".

### Bug concreto encontrado en SUSTRAI (ejemplo real)

- En `s1.1` (Relevance): *"This ambition is concretized in **three articulated specific objectives**…"*
- En `s1.2` (Needs): *"…The **first specific objective**… The **second**… The **third**… The **fourth specific objective**…"*

La propuesta dice "3 objetivos" en una sección y "4 objetivos" en la siguiente. **El Perfeccionar actual nunca detecta esto** porque solo mira capítulos del Master regenerado, no compara secciones del Form.

---

## 2 · Hallazgos del análisis de 4 cartas de evaluador

### Las cartas analizadas (seed corpus inicial)

| Carta | Programa | Score | Resultado | Formato |
|---|---|---|---|---|
| **CoVE Horizon (3D-CoVE)** | Erasmus+ Centres of Vocational Excellence (EACEA-managed) | 79/100 | Probablemente concedido | Carta EACEA oficial estructurada |
| **FOCUS** | ERASMUS-YOUTH-2025-YOUTH-TOG (EACEA-managed) | 53/60 | Rechazado por threshold | Carta EACEA oficial estructurada |
| **RISE** (proyecto de Permacultura Cantabria) | ERASMUS-YOUTH-2025-YOUTH-TOG (mismo call que FOCUS) | 68/60 | Pasó threshold, no concedido por ranking | Carta EACEA oficial estructurada |
| **DANCE+** | Erasmus+ Sport / Volunteering in Sport | sin score visible | n/d | Carta narrativa (formato libre, sin scores explícitos) |

### Las 4 LEYES UNIVERSALES EACEA (4/4 cartas, atravesando 3 programas distintos)

Estos patrones aparecen en TODAS las cartas analizadas. Son **leyes del sistema EACEA**, no opiniones de ponentes individuales:

| # | Ley | Cita representativa |
|---|---|---|
| 1 | **Sustainability sin financiación post-proyecto concreta** | RISE: *"lacks a sufficiently concrete strategy for securing ongoing funding… does not sufficiently address a detailed financial strategy or resource allocation plan"* |
| 2 | **Methodology con huecos de detalle** | RISE: *"the overall methodology is not elaborated upon in sufficient detail… does not clearly demonstrate the use of established methodologies"* |
| 3 | **Inconsistencias entre objectives ↔ activities ↔ WP descriptions** | RISE: *"does not clearly demonstrate explicit links between some activities (e.g., the Brussels trip) and their respective objectives"* |
| 4 | **Temas transversales (green/digital/social/EU values/health) mencionados pero no traducidos a tareas** | CoVE: *"green skills poorly developed and not sufficiently addressed in the tasks"* |

**Implicación operativa:** estos 4 puntos deben ir al Writer como **reglas duras desde el día uno**. Por ejemplo: bloquear el avance en Sustainability sin una fuente concreta de financiación post-proyecto que no sea "futuras solicitudes EU".

### 4 casi-leyes (3/4 cartas)

| # | Patrón | Cartas |
|---|---|---|
| 5 | **Budget — equal allocation entre partners sin justificar variaciones** | CoVE + FOCUS + RISE |
| 6 | **Activities sin link claro con objectives** | FOCUS + RISE + DANCE+ |
| 7 | **Cost-benefit / efficiency justification ausente** | FOCUS + RISE + DANCE+ |
| 8 | **Indicators sin specific numerical targets ni qualitative dimension** | FOCUS + RISE + DANCE+ |

### Patrones específicos por programa (confirmados con N=2)

#### YOUTH (FOCUS + RISE oficial)

1. Youth involvement en project design Y evaluation (no solo participation)
2. Fewer opportunities como target con barreras abordadas
3. Needs analysis disaggregated por país con datos específicos
4. Geographical balance N/S/E/W europeo

#### CoVE Horizon (N=1, esperando confirmación)

1. WP interaction graph requerido
2. Management/QC/Dissemination plans como deliverables formales
3. Curriculum content detallado
4. Smart specialisation alignment
5. Units = person-months (no working days)

#### Sport / Volunteering (DANCE+, N=1)

1. Health improvements conectados con holistic approach (food/health/well-being)
2. Roles diferenciados de participantes (learner/trainer/coordinator)
3. Allocation específica de actividades por expertise del partner
4. Continuidad/build upon de proyectos previos del coordinador

### Vocabulario del ponente mapeado a severidad

Construcciones del ponente que el parser usa para asignar severidad sin necesitar LLM:

| Construcción | Severidad | Interpretación |
|---|---|---|
| "is a major shortcoming" | **Crítica** | ~2 puntos perdidos |
| "is a shortcoming" / "is inadequate" | **Alta** | ~1 punto perdido |
| "does not sufficiently address" / "is not adequately addressed" / "lacks sufficient" | **Media-alta** | Score bajo en el sub-criterio |
| "does not clearly demonstrate" / "is not detailed enough" / "falls short in" | **Media** | Mantiene la nota baja |
| "lacks clarity on" / "is not fully clear" | **Media-baja** | Pequeño descuento |
| "small shortcoming" / "minor concern" | **Baja** | Negligible si todo lo demás es bueno |
| "However, …" tras frase positiva | **Variable** | Marca un "pero", suele ser media-baja |

---

## 3 · Visión nueva del sistema

### Tres puertas de entrada, un cuello común

```
                    ┌──────────────────────────────┐
                    │   DIAGNÓSTICO (cuello único) │
                    │                              │
                    │   Input:                     │
                    │   - Proyecto (escrito acá    │
                    │     o subido desde fuera)    │
                    │   - Carta evaluador (opc.)   │
                    │                              │
                    │   Output:                    │
                    │   - Score estimado por       │
                    │     criterio                 │
                    │   - Lista priorizada findings│
                    │   - Veredicto triaje         │
                    └──────────────┬───────────────┘
                                   │
               ┌───────────────────┼───────────────────┐
               ▼                   ▼                   ▼
       "REDISEÑAR"           "PERFECCIONAR"        "EXPORTAR"
       (vuelve a Design      (pasadas dirigidas    (descarga
        con el material       sobre el Form)        EACEA Word)
        existente como base)
```

### Las 3 puertas en detalle

| Puerta | Cliente | Por dónde entra | Tiempo de trabajo |
|---|---|---|---|
| **A — Greenfield** | "Voy a presentarme por primera vez" | Pantalla inicio → "Nuevo proyecto" → Diseñar → Escribir → Diagnóstico → bifurca | 10–30 h |
| **B — Audit / 2ª opinión** | "Tengo borrador, dudo de su calidad" | Pantalla inicio → "Diagnosticar existente" → seleccionar call del catálogo → subir Form externo | 1–5 h |
| **C — Reciclaje** | "Mi proyecto fue rechazado, quiero re-presentarlo" | Pantalla inicio → "Diagnosticar existente" → seleccionar call → subir Form + carta evaluador | 2–8 h |

**Independientemente de la puerta, desde el Diagnóstico hacia abajo el flujo es idéntico.** Esa es la elegancia.

### Veredicto del triaje (regla numérica, no opinión del LLM)

```
Para cada criterio EACEA (Relevance, Quality, Impact…),
el sistema estima 0–5 puntos con justificación.

Veredicto:
  - Si ≥2 criterios están por debajo de 3/5     → "REDISEÑAR"
  - Si todos están ≥3/5 pero alguno bajo 4/5    → "PERFECCIONAR"
  - Si todos ≥4/5                               → "PULIR Y ENVIAR"
```

Esto hace el triaje **defendible ante el cliente** — no es opinión del LLM, es una regla que se puede explicar.

### El pattern library de evaluadores: el activo defensible

Cada carta subida se parsea en findings estructurados y alimenta una base de datos de patrones por programa. Con N=20+ cartas por programa, el sistema **conoce qué errores penalizan los ponentes EACEA mejor que cualquier consultor humano**.

El pattern library alimenta dos cosas a la vez:

1. **El Diagnóstico** — verifica si el proyecto del cliente cae en alguno de los patrones conocidos.
2. **El Writer** — desde el día uno escribe **evitando** los patrones, no esperando a Diagnóstico para corregirlos.

**Este es el círculo virtuoso real**: cada cliente nuevo que sube su carta de rechazo te da un activo que sirve a todos los demás clientes.

---

## 4 · Modelo "catálogo controlado"

### Regla absoluta

> Cada proyecto, cada carta de evaluador, cada finding, cada patrón vive **vinculado a un `call_id` del catálogo Admin Data E+**.
>
> No existe "proyecto genérico" ni "carta suelta". Si el call no está cargado en Admin → no se puede entrar.

### Cómo se traduce en UX

Pantalla de subida empieza por **seleccionar la convocatoria del catálogo**, no por subir archivo:

```
┌───────────────────────────────────────────────────┐
│  ¿A qué convocatoria pertenece tu proyecto?       │
│                                                   │
│  [ Buscar convocatoria del catálogo ▾ ]           │
│                                                   │
│  Ejemplos:                                        │
│  - ERASMUS-YOUTH-2025-YOUTH-TOG                   │
│  - SMP-COSME-2026-TOURSME-01                      │
│  - HORIZON-ERASMUS-2025-COVE                      │
│                                                   │
│  Si no encuentras tu convocatoria, contáctanos.   │
│  No podemos atenderla hasta cargarla.             │
└───────────────────────────────────────────────────┘
       │
       ▼ (call seleccionado)
       │
┌───────────────────────────────────────────────────┐
│  Convocatoria: ERASMUS-YOUTH-2025-YOUTH-TOG       │
│  Formato esperado: Form Part B EACEA              │
│                                                   │
│  [ Sube tu proyecto ]                             │
│  [ Sube carta de evaluador (opcional) ]           │
└───────────────────────────────────────────────────┘
```

### Modelo de growth (operativo, no por código)

1. Cargas la call X en Admin Data E+ (topic.json, conditions, criterios, formato Form Part B).
2. Cuando hay 1+ cartas en seed corpus de esa call → call "abierta" en la web pública.
3. Marketing: anuncias "Ya disponible: diagnóstico para convocatoria X".

**El ritmo de apertura de productos lo controla el catálogo, no el ritmo de releases.**

### Formatos de formulario soportados

| Estado | Formatos |
|---|---|
| **MVP** | Form Part B EACEA (Word template estandarizado) + paste por sección |
| **Futuro** | Formularios de Agencias Nacionales: KA1 movilidades, KA210 small-scale, KA220 cooperation partnerships, etc. — formato distinto (Beneficiary Module / PDF descargable) |

Cada propuesta y cada carta llevan `form_type` y `awarding_authority` como propiedades de primera clase para que el sistema sepa qué parser, qué plantilla y qué pattern library aplicar.

---

## 5 · Decisiones cerradas (2026-05-25)

| # | Decisión | Razón |
|---|---|---|
| 1 | **Borrar Masters existentes** sin archivar | El sistema está en borrador interno, sin clientes externos. Sin coste de migración. |
| 2 | **Diagnóstico gratis limitado + Perfeccionar de pago** | Mejor top-of-funnel para captar mercado de proyectos rechazados (65–75% de rechazo en Erasmus+). |
| 3 | **MVP cubre todos los calls EACEA Form Part B cargados en Admin Data E+** | Modelo abierto por catálogo. Crece operativamente, no por código. Disclaimer + invitación a subir carta mitiga los programas con pocas cartas reales. |
| 4 | **Formato input MVP: Word EACEA Form Part B + paste por sección** | El call determina qué plantilla aplicar. PDFs sueltos descartados (parser frágil). |
| 5 | **Carta de evaluador OPCIONAL en Perfeccionar** | Con carta = diagnóstico dirigido (premium). Sin carta = aplica las 8 leyes universales + casi-leyes + patrones del programa. |

---

## 6 · Arquitectura nueva

### Qué se ELIMINA

| Pieza actual | Por qué se elimina |
|---|---|
| **Master document como artefacto intermedio** | No lo lee ningún evaluador. Compite con el Form. Pierde ediciones del Writer. Origen del problema "no mejora". |
| **Botón "Compilar Maestro"** | Sin Master, sin botón. |
| **22 capítulos del Master** | Sin Master, sin capítulos. |
| **Endpoint `/propose-rewrite` que aplica capítulo entero** | One-shot rewrite = regression to the mean. Se sustituye por **ediciones puntuales con diff**. |
| **Endpoint `/compress-to-form` mecánico** | Sin Master, no hay nada que comprimir. El Form es el documento desde el inicio. |
| **Diagnóstico capítulo-a-capítulo del Master** | Se sustituye por diagnóstico cross-section + contra criterios + contra patrones del DB. |
| **Tablas `master_*`** | Drop completo en migración inicial. |

### Qué se MANTIENE

| Pieza | Por qué |
|---|---|
| **Intake / Design (puerta A)** | Funciona bien. Genera el esqueleto económico + activities + summary. |
| **Writer cascade** | Sección a sección con revisión humana. **La pieza más sólida. No se toca.** Se le añadirán reglas duras del pattern library. |
| **Criterios EACEA cargados + Form Part B template** | Base de todo, reusable. |
| **`form_field_values` como tabla central** | **El Form pasa a ser EL documento canónico.** Toda la arquitectura nueva opera sobre esta tabla. |
| **Voice input** | Sin tocar. |
| **National Agency selector + idioma del proyecto** | Sin tocar. |
| **Calculator + budget + consortium + activities** | Sin tocar. |

### Qué se AÑADE

#### Tablas nuevas

| Tabla | Propósito | FK clave |
|---|---|---|
| `evaluation_letters` | Carta cruda subida (archivo + metadata: programa, año, score, threshold, fuente, formato) | `call_id` (NOT NULL) |
| `evaluation_findings` | Findings parseados estructurados (criterion, sub_criterion, severity, finding_text, fragment_quote, applies_to_section) | `letter_id`, hereda `call_id` |
| `pattern_library` | Patrones agregados (pattern_text, programme, action_type, occurrences_count, severity_avg, type universal/programme/emergent) | Agrupable por `(form_type, programme, awarding_authority)` |
| `proposal_versions` | Historial de versiones del Form para diff y rollback | `proposal_id`, hereda `call_id` |
| `improvement_actions` | Cada finding del diagnóstico se materializa como una "action" con estado (proposed/accepted/rejected/dismissed) y diff aplicado | `finding_id`, `proposal_id` |

#### Columnas nuevas en tablas existentes

| Extensión | Propósito |
|---|---|
| `proposals.source` ENUM('greenfield','imported','recycled') | Saber por qué puerta entró cada proyecto |
| `proposals.form_type` | `eacea_part_b` \| `na_ka1` \| `na_ka210` \| `na_ka220` (extensible) |
| `proposals.awarding_authority` | `eacea` \| `sepie_es` \| `dgepic_pt` \| `agenzia_giovani_it` \| ... |

#### Endpoints nuevos

```
POST /v1/diagnose/upload-proposal      ← subir Form externo (Word/paste)
POST /v1/diagnose/upload-letter        ← subir carta evaluador
POST /v1/diagnose/run                  ← ejecutar diagnóstico
GET  /v1/diagnose/{id}                 ← resultado
POST /v1/improve/{finding_id}/accept   ← aplicar una edición puntual
POST /v1/improve/{finding_id}/reject
GET  /v1/proposals/{id}/versions       ← historial
GET  /v1/patterns/{call_id}            ← patrones para una call (admin + uso interno)
```

#### UI nueva

1. **Diagnóstico — entrada**: selecciona call del catálogo, después "Subir proyecto" o "Usar proyecto de la app". Opcional: "Subir carta de evaluador".
2. **Diagnóstico — resultado**: score por criterio, veredicto triaje (3 botones: Rediseñar / Perfeccionar / Exportar), lista findings ordenados por impacto.
3. **Perfeccionar dirigido**: para cada finding abierto, panel con propuesta de edit + diff visible + riesgo + botones Aceptar/Rechazar/Modificar. Sidebar con progreso.
4. **Admin → Pattern library**: tabla filtrable por programa, año, severidad.

#### Lógica nueva

- **Parser de cartas EACEA oficiales** (regex + LLM verificador, usando tabla de severidad ya mapeada).
- **Parser de Form Part B externo** (Word con plantilla EACEA → `form_field_values`). MVP solo plantilla oficial.
- **Motor de diagnóstico** con 4 pasadas configurables:
  - **Pasada A**: Universal laws check (las 4 leyes universales + 4 casi-leyes).
  - **Pasada B**: Programme-specific rules check (patrones YOUTH/CoVE/Sport del DB).
  - **Pasada C**: Cross-section coherence (s1.1↔s1.2, etc.).
  - **Pasada D**: Evaluator letter mapping (si hay carta subida) — mapea findings de la carta a secciones del Form del cliente.
- **Motor de mejora dirigida** que genera ediciones puntuales con diff, riesgo explícito y delta de score estimado.

---

## 7 · Plan de implementación por fases (secuenciado)

> **Regla absoluta:** cada fase deja algo entregable a producción. No big-bang. Si Oscar pausa entre fase y fase, el sistema queda funcional.

### Fase 1 — Backend del DB y parser de cartas (1.5 – 2 semanas)

**Objetivo:** tener el pattern library inicial cargada y consultable.

**Pasos secuenciados:**

1. Migración SQL que **borra las tablas `master_*`** y limpia residuos del Master. Idempotente.
2. Migración SQL que crea las 4 tablas nuevas (`evaluation_letters`, `evaluation_findings`, `pattern_library`, `proposal_versions`) con `call_id` FK obligatoria.
3. Migración SQL que añade columnas nuevas a `proposals` (`source`, `form_type`, `awarding_authority`).
4. Mover las 3 cartas oficiales (CoVE Horizon, FOCUS, RISE) y la narrativa (DANCE+) al repo en `data/seed_evaluator_letters/{call_id}/{filename}` (decisión pendiente de Oscar: ¿con o sin anonimización?).
5. Parser de carta EACEA oficial (Node, regex + LLM verificador opcional para casos ambiguos). Pruebas unitarias contra las 3 cartas oficiales.
6. Loader que ingiere las 4 cartas como **seed corpus** en `evaluation_letters` + `evaluation_findings`.
7. Agregador inicial que pobla `pattern_library` desde los findings, marcando severidad y tipo (universal/programme/emergent).
8. Endpoint admin `GET /v1/patterns/{call_id}` y `GET /v1/patterns/all` (para inspeccionar).
9. UI mínima en Admin → Pattern library (tabla filtrable, sin edición todavía).

**Entregable:** la pattern library inicial cargada, consultable vía Admin. No hay UI cliente todavía.

### Fase 2 — Diagnóstico sin carta (2 semanas)

**Objetivo:** cualquier cliente con un proyecto escrito dentro de la app puede ejecutar el diagnóstico.

**Pasos secuenciados:**

1. Motor de diagnóstico — Pasada A (universal laws + casi-leyes). Prompt + lógica.
2. Motor de diagnóstico — Pasada B (programme-specific rules — consulta pattern library por `call_id`).
3. Motor de diagnóstico — Pasada C (cross-section coherence — busca contradicciones explícitas entre secciones del Form).
4. Endpoint `POST /v1/diagnose/run` que ejecuta las 3 pasadas, persiste el resultado, devuelve veredicto triaje + findings priorizados.
5. UI: pantalla nueva "Diagnóstico" en la nav del proyecto (sustituye visualmente lo que era "Perfeccionar").
6. UI: pantalla de resultado con score por criterio, veredicto triaje (3 botones grandes), lista findings con severidad y sección a la que aplican.
7. Tests E2E sobre los proyectos internos (SUSTRAI, NOVA, etc.).

**Entregable:** Diagnóstico funcional sobre proyectos creados dentro de la app. Vendible como "Audit AI" gratis-limitado.

### Fase 3 — Upload de proyecto externo (1.5 semanas)

**Objetivo:** abrir puerta B (audit con proyecto importado).

**Pasos secuenciados:**

1. Parser de Word EACEA Form Part B template → `form_field_values`. Detecta headings y mapea a `field_id`.
2. Endpoint `POST /v1/diagnose/upload-proposal` que recibe el Word, lo parsea, crea un `proposals` record con `source='imported'`, vincula a `call_id`, devuelve el `proposal_id`.
3. UI: pantalla "Diagnosticar proyecto existente" — selector de call del catálogo + drag & drop / upload del Word.
4. UI: manejo de errores (qué campos no detectó el parser → permitir paste manual).
5. Modo paste por sección como alternativa (sin Word).

**Entregable:** puerta B abierta. Clientes con borrador externo pueden subirlo y diagnosticarlo.

### Fase 4 — Upload de carta + diagnóstico dirigido (2 semanas)

**Objetivo:** abrir puerta C (reciclaje con carta de evaluador) — la palanca premium.

**Pasos secuenciados:**

1. Parser de carta de evaluador para los 2 formatos detectados: (a) oficial EACEA PDF + Word, (b) narrativa libre. (Resúmenes en bullet points avisan al usuario de pérdida de información.)
2. Motor de diagnóstico — Pasada D: para cada finding de la carta, localizar la sección del Form del cliente a la que aplica (heurística: criterion → sub_criterion → sección esperada).
3. Endpoint `POST /v1/diagnose/upload-letter` que recibe la carta, parsea findings, los persiste en `evaluation_findings`, los enlaza al `proposal_id`.
4. UI: paso opcional en el upload "¿Tienes carta de evaluador?" con UX que deje claro que es premium-quality.
5. UI resultado: findings de la carta aparecen marcados ("según el evaluador…") junto a los detectados por el sistema.
6. **Cada carta nueva subida alimenta `pattern_library`** automáticamente. Si un finding nuevo aparece en 2+ cartas del mismo call, sube a "patrón confirmado".

**Entregable:** puerta C completa. Diagnóstico dirigido por carta. El producto premium real.

### Fase 5 — Perfeccionar dirigido con diff (2 – 3 semanas)

**Objetivo:** reemplazar el Perfeccionar actual con ediciones puntuales y diff visible.

**Pasos secuenciados:**

1. Motor de mejora puntual: por cada finding "accionable", el LLM propone **ediciones específicas** (no reescritura entera) con formato `{ changes: [{ type, where, before, after, why }], facts_preserved, estimated_score_delta }`.
2. Endpoint `POST /v1/improve/{finding_id}/accept` que aplica la edit al `form_field_values` y crea un `proposal_versions` con el diff.
3. Endpoint `POST /v1/improve/{finding_id}/reject` que marca el finding como dismissed.
4. UI: pantalla "Perfeccionar dirigido" con lista de findings priorizados por delta de score estimado. Por cada finding, panel con propuesta + diff (verde/rojo) + riesgo + botones Aceptar / Rechazar / Modificar.
5. UI: sidebar con progreso (X de Y findings handled) y score estimado actualizado tras cada edit.
6. UI: pantalla de historial / rollback (ver `proposal_versions`).
7. **Eliminar la pestaña antigua del Master.** Banner explicando el cambio + acceso "Ver versión anterior" temporal (luego se quita).

**Entregable:** Perfeccionar funciona como debería. Sustituye al Master para todos los efectos prácticos.

### Fase 6 — Las leyes universales como reglas del Writer (1 semana)

**Objetivo:** cerrar el loop. Lo aprendido en pattern library blinda el Writer desde origen.

**Pasos secuenciados:**

1. Hook en el Writer: antes de cerrar la sección de Sustainability, validar que hay una fuente concreta de financiación post-proyecto (regex + LLM verificador).
2. Hook en el Writer: para cada objective, verificar que hay al menos una activity vinculada con KPIs medibles.
3. Hook en el Writer: detectar temas transversales que aparecen como objetivos pero no figuran en ninguna tarea WP.
4. Hook en el Writer: indicators con targets numéricos — validación frontend cuando el usuario escribe.
5. Patrones específicos del call seleccionado se cargan al iniciar el Writer (consulta `pattern_library` por `call_id`).
6. UI: avisos amables, no bloqueantes — "Atención: este punto suele penalizar en YOUTH-TOG. Considera añadir…".

**Entregable:** el Writer empieza a producir proyectos "blindados" contra los errores que penalizan los ponentes.

### Fase 7 y siguientes (opcional, sin fecha)

- **Más pasadas de diagnóstico:** concreción (frases vagas con propuesta de cifra/método), ajuste a límites (truncar campos que se pasan de chars señalando qué se pierde), validación de unidades (PM vs working days).
- **Soporte para formularios de Agencias Nacionales:** KA1, KA210, KA220. Parser específico, plantilla específica, pattern library específica.
- **Mejoras de coste/eficiencia:** prompt caching agresivo, modelos por tarea (Haiku para parsing/clasificación), pasadas que solo envíen los campos cambiados.

---

## 8 · Seed corpus inicial

| Carta | Ruta destino (pendiente confirmar) | Estado |
|---|---|---|
| **CoVE Horizon (3D-CoVE)** | `data/seed_evaluator_letters/cove_horizon_3d/letter.txt` | Pegada como texto en sesión 2026-05-25 |
| **FOCUS (YOUTH-TOG)** | `data/seed_evaluator_letters/erasmus_youth_2025_youth_tog/focus_101246479.pdf` | PDF original en `Downloads/`, mover al repo |
| **RISE (YOUTH-TOG)** | `data/seed_evaluator_letters/erasmus_youth_2025_youth_tog/rise_101246449.pdf` | PDF original en `Downloads/`, mover al repo |
| **DANCE+** | `data/seed_evaluator_letters/sport_volunteering_dance/letter.docx` | Docx original en `Downloads/`, mover al repo |

**Decisión pendiente:** ¿estas cartas se commitean al repo tal cual (son evaluaciones reales con metadata de partners y nombres)? Posibles soluciones:
- (a) Commitear sin anonimización en `data/` (es repo privado).
- (b) Anonimizar partners/personas antes de commitear.
- (c) Mantener en disco local, no en el repo, y solo subir los `evaluation_findings` ya parseados.

Recomendación por defecto: (a) — repo privado, ningún coste adicional.

---

## 9 · Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Borrado del Master rompe proyectos internos en uso (SUSTRAI, etc.)** | Confirmado por Oscar 2026-05-25: borrado seguro porque todo es borrador interno sin clientes externos. SUSTRAI tiene los 52 campos del Form ya rellenos. |
| **Diagnóstico tibio en programas con pocas cartas reales** | Disclaimer + UX que invita a subir carta para "ayudar a mejorar el sistema". El usuario que aporta carta acelera la calidad para todos. |
| **Parser de Word EACEA falla en variantes de plantilla** | Modo paste por sección como fallback. Logs de fallos del parser para mejora iterativa. |
| **LLM propone "mejoras" que pierden hechos clave del texto original** | Output contract estricto del LLM: `{ changes: [...], facts_preserved: [...] }`. El frontend valida que `facts_preserved` contiene los nombres/cifras/dates del original antes de permitir aplicar. |
| **Curva de adopción interna: el equipo está acostumbrado al Master** | Solo es Oscar trabajando hoy, sin equipo. Curva = 0. |
| **Coste de tokens en Claude API al escalar** | (1) Prompt caching agresivo de criterios EACEA + form template + estilo. (2) Haiku para parsing/clasificación/embeddings. (3) Pasadas quirúrgicas en Perfeccionar reducen output de ~50k a ~3k tokens por proyecto. Estimación: factura Claude baja entre 40–60% sin perder calidad. |

---

## 10 · Cosas que NO se construyen ahora (anti-scope)

- ❌ Self-hosting de LLM en el VPS. Evaluado y descartado 2026-05-25: economía no cuadra hasta >200 proyectos/mes, calidad penaliza donde más duele. Patrón híbrido (Ollama en VPS para tareas auxiliares + Claude para output final) sí se considera, pero como optimización posterior, no MVP.
- ❌ Soporte para PDFs sueltos genéricos (no plantilla EACEA). Riesgo de parser frágil. Solo paste por sección como alternativa al Word oficial.
- ❌ Soporte para formularios KA1/KA210/KA220. Fase futura cuando Oscar monte esos formularios en Admin.
- ❌ Anonymización automática de cartas de evaluador. Decisión pendiente sobre formato seed corpus.
- ❌ Sistema de pagos / cobro del producto premium. La diferenciación gratis/pago se construye como gating funcional; la pasarela de pago entra cuando haya cliente real.

---

## 11 · Pendientes de decisión (no bloqueantes para arrancar Fase 1)

1. **Anonymización de cartas seed corpus** (a/b/c arriba).
2. **Nombre comercial del producto Diagnóstico** (en la web pública). Candidatos: "Audit AI", "Diagnóstico EU", "Evaluación EACEA".
3. **Política de retención**: ¿cuánto tiempo guardamos las cartas subidas por clientes? ¿Se borran al borrar el proyecto?
4. **Tier premium**: ¿el Diagnóstico dirigido por carta es solo Premium o también Standard? (Premium-first: solo Premium hasta validar demanda.)
5. **Disclaimer legal**: añadir checkbox "Al subir tu carta contribuyes al pattern collectivo de tu convocatoria; tus datos identificativos no se comparten, solo los findings agregados". Revisar con perspectiva RGPD.

---

## 12 · Glosario rápido (para no-programadores)

- **Form Part B EACEA**: el formulario oficial de la Agencia Ejecutiva (EACEA) en Bruselas. PDF/Word con campos de tamaño fijo. Es lo que el ponente europeo lee y puntúa.
- **Master document** (deprecated): artefacto intermedio que la app generaba en la fase Perfeccionar — prosa libre de ~200k chars sin límites de campo. Se elimina en este replanteo.
- **Pattern library**: base de datos de errores/elogios recurrentes que los ponentes EACEA hacen, agregada por programa.
- **Finding**: cada crítica concreta de un evaluador, parseada y estructurada (criterio, sub-criterio, severidad, texto, sección afectada).
- **Diff**: visualización lado a lado de antes/después de una edición, con lo añadido en verde y lo quitado en rojo.
- **Cascade**: forma de redactar sección a sección con revisión humana entre cada paso. Es como funciona hoy el Writer.
- **Triaje**: clasificación inicial del proyecto del cliente en "rediseñar / perfeccionar / pulir y enviar" según su nota estimada en la rúbrica.

---

## Cambios respecto al sistema anterior

| Aspecto | Antes (con Master) | Después (sistema replanteado) |
|---|---|---|
| Documento canónico | Master de 200k chars regenerado en Perfeccionar | Form Part B desde el primer minuto |
| Cómo "mejora" la app | One-shot rewrite de capítulos del Master | Ediciones puntuales con diff y accept/reject por cambio |
| Detección de incoherencias | Solo dentro del Master, capítulo a capítulo | Cross-section en el Form (s1.1↔s1.2, etc.) |
| Uso de cartas de evaluador | No existe | Input opcional que dirige el diagnóstico y alimenta pattern library |
| Activo defensible del producto | Ninguno (cualquiera con ChatGPT puede competir) | Pattern library propia que mejora con cada carta subida |
| Coste de tokens en Perfeccionar | ~50k tokens output por proyecto | ~3k tokens output por proyecto (10–20× menos) |
| Puertas de entrada | 1 (greenfield) | 3 (greenfield + audit + reciclaje) |
| Acoplamiento a convocatoria | Implícito y débil | Explícito: cada proyecto/carta atado a `call_id` del catálogo |

---

*Documento canónico del replanteo. Cualquier cambio sustancial al plan se refleja aquí y se referencia en `docs/PENDING.md` (TASK-007).*
