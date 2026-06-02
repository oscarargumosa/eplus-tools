# Prompts CAG — Documento Maestro

Templates de system prompts para la fase **Perfeccionar** del producto.
Todos siguen la arquitectura CAG (Cache Augmented Generation) definida
en `docs/PROJECT_MASTER_ARCHITECTURE.md` §5: el contexto completo entra
en cada llamada y se aprovecha el prompt caching de Anthropic.

## Convenciones

Cada prompt vive en su propio fichero `.md` con esta estructura:

```
---
name: <slug-kebab-case>
purpose: <fase del flujo a la que pertenece>
model: claude-sonnet-4-6 | claude-opus-4-7 | claude-haiku-4-5-20251001
estimated_input_tokens: <rango realista>
estimated_output_tokens: <rango realista>
cache_strategy: <qué bloques se marcan para cache>
---

## Bloque cacheable (estable)

[Aquí va el system prompt + documentos de la convocatoria + criterios eval.
 Estos bloques se marcan con `cache_control: { type: 'ephemeral' }` en la
 llamada a Anthropic SDK.]

## Bloque variable (cambia por proyecto / por llamada)

[Aquí va el Documento Maestro del proyecto, las secciones previas, etc.]

## Output esperado

[Estructura JSON o markdown que la app espera para parsear.]
```

## Lista de prompts

| Archivo | Fase | Uso |
|---|---|---|
| `01_compile_master_v1.md` | Compilación (paso 3) | Genera el Maestro inicial a partir del Diseño + Writer draft |
| `02_diagnosis_initial.md` | Diagnóstico inicial (paso 4) | Detecta huecos estructurales tras Maestro v1 |
| `03_regeneration_unified.md` | Regeneración (paso 6) | Regenera el Maestro con contexto completo (call, programme guide, refs) |
| `04_diagnosis_advanced.md` | Diagnóstico avanzado (paso 7) | Contradicciones textuales sobre versión enriquecida |
| `05_score_estimate.md` | Score Estimado (paso 8) | Nota panorámica del proyecto contra criterios de evaluación |
| `06_form_compression.md` | Compresión (pasos 5/11) | Destila del Maestro a la pregunta del formulario oficial |
| `07_coherence_pass.md` | Repaso coherencia (paso 10) | Pasada final de consistencia sobre todo el Maestro |
| `08_chat_refinement.md` | Refinamiento (paso 9) | Sistema prompt para el chat conversacional persistente |

## Coste estimado (Sonnet 4.6, cache hit)

| Prompt | Tokens input | Tokens output | Cache hit ratio | Coste/llamada |
|---|---|---|---|---|
| 01 compile_master_v1 | 100-200k | 30-60k | N/A (primera) | $1.20-3.00 |
| 02 diagnosis_initial | 380k | 5-10k | 100% (tras 01) | $0.20-0.35 |
| 03 regeneration_unified | 600-800k | 50-100k | 50% | $2.00-4.00 |
| 04 diagnosis_advanced | 700k | 8-15k | 95% | $0.30-0.50 |
| 05 score_estimate | 720k | 3-8k | 95% | $0.25-0.40 |
| 06 form_compression | 200-300k | 1-3k (por casilla) | 80% | $0.10-0.20 por casilla |
| 07 coherence_pass | 700k | 30-60k | 95% | $0.80-1.50 |
| 08 chat_refinement (por turno) | 700k | 1-5k | 99% | $0.15-0.25 |

Coste total estimado por proyecto completo: **~$10-15** con caching agresivo.

## Cómo se integran

Cada prompt se carga vía un módulo Node (próxima iteración):

```js
const cag = require('./node/src/modules/master/cag-pipeline');
const result = await cag.runPrompt('02_diagnosis_initial', { projectId, masterDocId });
```

El módulo `cag-pipeline` construye el bundle (call docs + master + criterios)
con el system prompt cacheado, llama a Anthropic con `cache_control` y
retorna la respuesta parseada.

## Reglas para escribir/editar estos prompts

1. **Bloque cacheable primero, variable después**. Anthropic cachea desde
   el principio del prompt hasta el último `cache_control` marker.

2. **Idioma del prompt**: inglés para instrucciones de comportamiento al
   modelo. El contenido del proyecto va en idioma nativo del coordinador
   (configurable, default español).

3. **Output estructurado** siempre que sea posible (JSON, markdown bien
   delimitado con secciones). Evita prosa libre que la app tiene que
   parsear con regex frágiles.

4. **Idempotencia**: ejecutar el mismo prompt dos veces con el mismo input
   debe dar resultados muy similares. Si necesitas variación, controla
   `temperature` desde el código, no desde el prompt.

5. **Versionado**: cuando cambies un prompt sustancialmente, súbele el
   sufijo `_vN` (`02_diagnosis_initial_v2.md`) en lugar de pisar el
   anterior. Permite A/B comparar resultados.

## Referencias

- Arquitectura general: `docs/PROJECT_MASTER_ARCHITECTURE.md`
- Plan de implementación: `docs/PROJECT_MASTER_IMPLEMENTATION_PLAN.md`
- Prompt caching de Anthropic: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
