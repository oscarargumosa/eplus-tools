# Libro de Hechos del Proyecto + Inspector de Prompts (TASK-008)

> **Doc canónico.** Plan acordado con Oscar el 2026-05-30.
> Reúne dos ideas que convergen: (1) un *libro de hechos* del proyecto que garantiza
> coherencia entre todas las preguntas del Writer, y (2) un *inspector de prompts*
> admin-only para que Oscar pueda ver, auditar e iterar lo que la IA recibe, sin
> exponer la IP al usuario final.

---

## 1 · El problema

El A/B de SUSTRAI 2.2.1 (sesión 2026-05-29) demostró que el cableado de criterios
funciona, pero dejó vivo un defecto: **drift entre generaciones**. En dos runs del
mismo proyecto, el líder de WP1 salió distinto (Goierri Turismoa vs GOIMEN). El mismo
problema afecta a presupuesto, número de pymes, duración, hitos y glosario (AECT vs
EGTC vs EEIG).

Causa raíz: hoy `generateSection()` (`node/src/modules/developer/model.js:1002`) inyecta
el proyecto como un volcado **narrativo** (`projectContext`, `model.js:1121`), no como una
ficha de datos cerrada. El modelo *re-decide* cosas que deberían ser invariables, y las
decide distinto cada vez. No hay una verdad única que todas las secciones compartan.

Además, Oscar no tiene forma de **ver** qué prompt se está inyectando en cada generación.
El prompt se ensambla, se manda a Claude y se tira. Sin visibilidad no se puede iterar
el producto ni cuidar la IP.

---

## 2 · La visión: el Libro de Hechos del Proyecto

Un *facts ledger* por proyecto que:

1. **Se siembra** desde los datos estructurados ya existentes en Diseñar / Planner /
   Calculator: socios, presupuesto por partida, presupuesto por paquete de trabajo,
   actividades de cada WP, tareas, intellectual outputs, deliverables, participantes,
   trabajadores, hitos.
2. **Se inyecta como hechos invariables en CADA pregunta** que genera el Writer. La
   pregunta 1, la 2.2.1, la 3.1... todas parten de la misma verdad.
3. **Se realimenta**: si al redactar una pregunta el modelo produce un dato nuevo (un
   barrio, una cifra de jóvenes, un stakeholder, una sigla), ese dato vuelve al libro
   de hechos **como candidato**, de modo que las preguntas siguientes —y una
   re-generación de la pregunta 1— lo tengan en cuenta.

```
   ┌─────────────── LIBRO DE HECHOS DEL PROYECTO ───────────────┐
   │  socios · €/WP · actividades/WP · tareas · IOs ·            │
   │  deliverables · participantes · trabajadores · hitos ...    │
   └───────▲───────────────────────────────────┬────────────────┘
           │ (hechos candidatos VALIDADOS)       │ (hechos invariables)
           │                                     ▼
        Q1 → Q2 → Q2.2.1 → Q3.1 → ...  cada generación lee del libro
                                        y puede proponer hechos nuevos
```

### 2.1 · Dos tipos de hechos (se gestionan distinto)

- **Hechos duros (derivados).** Presupuesto por WP, socios, actividades, deliverables,
  tareas. **No se inventan ni se capturan de la redacción**: se *calculan en runtime*
  desde las tablas de Diseñar/Planner/Calculator, que son la fuente de verdad.
  **Regla dura: derivar, no duplicar.** Si se copiaran a una tabla y luego Oscar cambia
  el presupuesto en el Calculator, el libro mentiría. Siempre fiables.
- **Hechos blandos (emergentes).** El barrio concreto, la cifra de jóvenes, el
  stakeholder nombrado, la sigla elegida. Nacen durante la redacción y son los que
  necesitan el bucle de realimentación.

### 2.2 · Compuerta de validación (crítica)

El bucle de realimentación **nunca** ingiere automáticamente un dato generado como hecho
canónico. En el A/B el modelo se inventó validación PIC y LoI de stakeholders que no
estaban en el contexto. Si metiéramos eso al libro, **canonizaríamos alucinaciones** que
contaminarían las preguntas siguientes.

Por eso: dato nuevo generado → entra como **hecho candidato** → solo pasa a **hecho
canónico** cuando se valida (Oscar lo aprueba, o pasa un check contra los datos
estructurados). El bucle acumula sin propagar mentiras.

---

## 3 · La visión: el Inspector de Prompts (admin-only)

Buena noticia: media infraestructura **ya existe**. La tabla `ai_generations`
(migración `093_deliverable_tasks_and_ai_log.js:36`) ya guarda
`system_prompt · user_prompt · raw_response · parsed_json · validator_log · status ·
duration_ms · created_at`. Pero hoy **solo la escribe `dms-generator.js`**, no el
Writer en cascada. El primer paso es cablear `generateSection()` para que loguee ahí.

El inspector es la vista admin que lee `ai_generations` y permite:
- Ver el prompt real inyectado en cada generación de cada proyecto.
- Ver el **historial** de regeneraciones de una sección (cada run = una fila) y
  comparar runs lado a lado → ver el drift con los ojos.
- Ver el peso de cada bloque (RAG, criterios, estilo, hechos...).
- (Fase avanzada) editar los bloques de prompt y ver qué versión generó cada sección.

---

## 4 · Principio rector: DOS SUPERFICIES, DOS PÚBLICOS

Esta es la restricción de diseño más importante. **Nunca se mezclan.**

| | **Usuario final** (redactoras, clientes) | **Oscar** (admin/dueño) |
|---|---|---|
| **Dónde** | Dentro del Writer, en su proyecto | Admin → "Registro de generaciones" (rol admin) |
| **Qué ve** | Solo **sus propios datos**: ficha de hechos en lenguaje normal; "la IA ha asumido X, ¿correcto?" | El prompt completo: system, bloques, criterios, RAG, versión de bloque, drift, output |
| **Qué NO ve jamás** | System prompt, bloques internos, cableado de criterios, RAG, nombres de modelo, estructura interna | — (lo ve todo) |
| **Para qué** | Confirmar/corregir SU contenido, ganar confianza | Iterar el producto, cuidar la IP |

El usuario **nunca ve un prompt**. Ve **sus propios datos** devueltos de forma amable.
Eso no es IP — es información suya. La IP (cómo convertimos esos datos en propuesta
ganadora) vive solo en el servidor y solo la ve Oscar.

### 4.1 · Restricciones duras de protección de IP (ninguna fase las viola)

1. **El prompt NUNCA se serializa al navegador del usuario.** El endpoint de generar
   devuelve *solo el texto de la sección*. El prompt se escribe en `ai_generations`
   del lado del servidor. Ni con DevTools hay prompt que rascar.
2. **El inspector tiene endpoint propio blindado por `role=admin`.** Usuario normal → 403.
3. **Los bloques editables viven en BD del servidor**, no en el JS del frontend. La
   cáscara SPA es clonable; el motor (prompts + criterios + hechos + RAG) no sale.

### 4.2 · Principio anti-sobre-trabajo (amabilidad + calidad)

La validación de hechos del usuario es **progresiva y opcional, nunca formulario
bloqueante**:
- Por defecto todo funciona sin que el usuario toque nada (hechos duros derivados solos).
- Solo se le pregunta ante un **conflicto real** o un **hecho inventado de alto riesgo**
  (PIC, LoI, cifra clave). Una frase, no una tabla.
- La coherencia la garantiza el libro de hechos por debajo, sin cargar al usuario.

---

## 5 · Arquitectura

### 5.1 · Derivación de hechos duros (sin tabla nueva)

Una función `buildCanonicalFacts(projectId)` que compone en runtime, leyendo:
- `projects` — nombre, duración, fechas, presupuesto total, grant, cofin.
- `partners` — nombre canónico + rol (DMO/BSO/...).
- `work_packages` — WP → `leader_id` (mapa WP→líder), presupuesto por WP.
- `activities` — actividades por WP.
- `deliverables`, `wp_tasks`, `milestones` (con `due_month`).
- Resúmenes económicos derivados del Calculator (€ por WP, € por partida, por socio).

Devuelve un bloque de texto declarativo "HECHOS INVARIABLES — DO NOT CONTRADICT".
**No persiste nada**: se recalcula en cada generación, siempre fresco.

### 5.2 · Inyección en el prompt

En `generateSection()`, **antes** de `══ YOUR PROJECT ══` (`model.js:1121`):

```
══ HECHOS INVARIABLES — DO NOT CONTRADICT ══
{canonicalFacts}
```

Así el modelo lee el WP-leader en vez de re-decidirlo.

### 5.3 · Hechos blandos + tabla de candidatos

Tabla nueva `project_facts` (solo para hechos blandos/emergentes y candidatos; los duros
NO se guardan aquí, se derivan):

```sql
project_facts(
  id            CHAR(36) PK,
  project_id    CHAR(36),
  fact_key      VARCHAR(120),   -- 'target_neighbourhood', 'youth_count', ...
  fact_value    TEXT,
  status        ENUM('candidate','canonical','rejected') DEFAULT 'candidate',
  source        VARCHAR(40),    -- 'generation:s1_1', 'user', 'structured'
  created_at    DATETIME,
  validated_at  DATETIME NULL,
  validated_by  CHAR(36) NULL
)
```

Extracción de candidatos: tras generar una sección, un paso ligero (regla o LLM barato)
detecta datos nuevos no presentes en los hechos duros → inserta como `candidate`.
Solo los `canonical` se inyectan en futuras generaciones.

### 5.4 · Logging de prompts (reusar `ai_generations`)

En `generateSection()`, justo antes de `callAI()` (`model.js:1161`), llamar a un
`_logGen({ kind:'writer-section', pass: sectionId, systemPrompt, userPrompt, raw, ... })`
análogo al de `dms-generator.js:793`. Para el desglose por segmentos (ver 5.5), guardar
también un JSON de segmentos en `validator_log` o en columna nueva.

### 5.5 · Granularidad: segmentos nombrados (decisión pendiente, ver §7)

Opción recomendada: capturar el prompt como **array de segmentos etiquetados**
(`{ name, source, chars, content }`) — p.ej. `canonical_facts`, `writing_style`,
`eval_criteria`, `rag`, `research`, `previous_sections`. Permite que el inspector
muestre un panel desglosado con peso de cada parte y enlace a dónde se edita, en vez de
un muro de texto. Es lo que hace posible iterar de verdad.

### 5.6 · (Fase avanzada) Externalizar bloques hardcoded

Hoy hay bloques hardcoded en `model.js:1087-1118` ("WHAT MAKES A BAD/WINNING PROPOSAL",
formato de salida, persona). Para que Oscar los edite sin tocar código → tabla
`prompt_blocks(name, program_id, content, version, active)`. El inspector enlaza cada
segmento a su editor y versiona: cambias un bloque, las generaciones siguientes usan la
versión nueva, el historial recuerda con qué versión se generó cada sección.

---

## 6 · Plan por fases

| Fase | Qué | Esfuerzo | Entrega |
|---|---|---|---|
| **F1** | Cablear logging de `generateSection()` → `ai_generations` (`kind='writer-section'`). Segmentos nombrados. | ~0.5 d | Toda generación queda registrada con su prompt. Auditable en BD. |
| **F2** | `buildCanonicalFacts(projectId)` (hechos duros derivados) + inyección antes de YOUR PROJECT. Re-run A/B SUSTRAI 2.2.1 para verificar que mata el drift WP-leader. | ~1 d | Drift eliminado. Coherencia entre secciones. |
| **F3** | Inspector admin-only: vista Admin "Registro de generaciones" que lee `ai_generations`, lista por proyecto/sección, muestra prompt desglosado + historial + comparar runs. Endpoint `role=admin`. | ~1.5 d | Oscar ve y audita todo. IP protegida. |
| **F4** | Hechos blandos: tabla `project_facts` + extracción de candidatos post-generación + inyección de canónicos. UI de usuario: panel amable "datos que la IA tiene en cuenta" + aprobar/rechazar candidatos de alto riesgo (no bloqueante). | ~2 d | Bucle de realimentación con compuerta de validación. |
| **F5** | (Opcional) Externalizar bloques hardcoded a `prompt_blocks` + edición desde Admin + versionado. | ~2 d | Control total de prompts sin tocar código. |

**Orden de valor:** F1+F2 ya matan el drift y dan visibilidad en BD. F3 da el inspector.
F4 es el bucle completo. F5 es el "no solo en código" llevado al extremo.

---

## 7 · Decisiones (RESUELTAS 2026-05-30 — implementado)

1. **Granularidad del log** → **segmentos nombrados con contenido**. Cada bloque ══ se
   guarda en `ai_generations.segments` con `{name, source, chars, content}`.
2. **Alcance** → **las 5 fases** en una tanda.
3. **Propósito del inspector** → auditar + iterar en vivo (editor de bloques versionado).
4. **Validación de hechos blandos** → **ambas superficies**: el usuario confirma/descarta
   en el Writer (panel no bloqueante), el admin los ve en el inspector.
5. **Extractor de candidatos** → **LLM barato** (`claude-haiku-4-5`, temp 0, max 8 facts),
   no bloqueante tras cada generación.

## 8 · Estado de implementación (2026-05-30)

Las 5 fases implementadas y verificadas a nivel de plumbing (sin coste LLM):
- Migración 117 aplicada en local (segments + section_id + project_facts + prompt_blocks).
- `generateSection()` inyecta canonical facts, captura segmentos, loguea, extrae candidatos.
- Inspector admin-only (generaciones desglosadas + editor de bloques) y panel de hechos
  del usuario operativos. Endpoints bajo `requireAdminOnly` / ownership.
- Verificado: `buildCanonicalFacts(NOVA)` deriva €/WP + socios + WP→leader; el inspector
  lee segmentos; el bucle candidate→confirmar→inyección funciona.
- Pendiente: prueba en vivo en UI por Oscar + decisión de commit/MERGE.

---

## 9 · Relaciones

- **Origen:** sesión 2026-05-29 (Writer 3 palancas + A/B SUSTRAI). El A/B reveló el drift.
- **Relacionado:** `docs/DIAGNOSE_AND_IMPROVE_PLAN.md` (Diagnose verifica a posteriori;
  esto previene a priori), migración 070 (criterios narrativos ya consumidos),
  `project_cascade_writing` (mismo pipeline cascade).
- **Código a tocar:** `node/src/modules/developer/model.js` (`generateSection`),
  nueva vista Admin, migración nueva para `project_facts` (F4) y `prompt_blocks` (F5).
