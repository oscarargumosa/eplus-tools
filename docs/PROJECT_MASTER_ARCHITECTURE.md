# E+ Tools — Arquitectura canónica del producto

> ⚠️ **OBSOLETO desde 2026-05-25** — el concepto de "Documento Maestro" descrito
> aquí se elimina en el replanteo del sistema. Ver `docs/DIAGNOSE_AND_IMPROVE_PLAN.md`
> como documento canónico actual. Este archivo se mantiene como referencia histórica
> hasta completar la Fase 5 del plan nuevo; luego se elimina.

> Documento canónico de la arquitectura del producto E+ Tools tras la sesión
> de diseño 2026-05-15/16. Recoge las decisiones cerradas para que cualquier
> sesión futura (con Claude Local, Claude VPS, o cualquier desarrollador)
> arranque del mismo punto sin perder contexto.
>
> **Estado**: arquitectura **cerrada** a nivel conceptual. Pendiente de
> implementación.
> **Última revisión**: 2026-05-16.

---

## 1. La idea en una frase

> **No escribes una propuesta. Construyes el libro de tu proyecto. La propuesta es lo que la app destila para presentar a la convocatoria.**

El Documento Maestro es la fuente de verdad del proyecto. El formulario oficial que se sube a Europa es una **derivada destilada** de ese Maestro. El mismo Maestro puede destilar múltiples envíos a múltiples convocatorias sin reescribir.

---

## 2. El modelo de 4 fases

El proceso completo de un proyecto pasa por cuatro fases nombradas:

```
1. Diseñar       Estructura económica + conceptual (Calculator + Intake).
                 Únicas fases donde se tocan números.
2. Escribir      Primer borrador narrativo (Writer cascada actual).
                 Sirve como sonda diagnóstica del Diseño.
3. Perfeccionar  Documento Maestro + ciclos de refinamiento iterativo
                 con IA hasta llegar al proyecto óptimo. Aquí solo se
                 toca texto, nunca presupuesto.
4. Evaluar       Evaluación contra criterios. Fase futura.
                 También permite evaluar proyectos ajenos / pasados.
```

Sidebar mental del producto y eje pedagógico para formaciones: *"Tu proyecto pasa por 4 fases: Diseñar, Escribir, Perfeccionar, Evaluar."*

### Regla absoluta entre fases

**Cualquier cambio económico (presupuesto, partidas, partners, actividades nuevas con coste) se hace SIEMPRE en la fase 1 (Diseñar).** Las fases 2-4 trabajan exclusivamente sobre texto. Si en mitad de la fase 3 se detecta que falta una actividad con presupuesto (ej. un concurso en WP4), la app redirige al usuario al Calculator de la fase 1, y al volver marca las secciones del Maestro afectadas como "stale" para revisión.

Esto evita bucles infinitos entre número y narrativa.

---

## 3. El Documento Maestro

### Qué es

Un documento estructurado, sin límites de caracteres, que contiene **el proyecto en su forma más completa posible**:

- Resumen ejecutivo
- Relevancia, contexto, motivación
- Grupos objetivo y necesidades
- Cada WP con descripción larga, actividades con texto rico, tareas detalladas
- Consorcio con justificación de cada partner
- Impacto esperado, sostenibilidad post-proyecto, plan de explotación
- Presupuesto justificado narrativamente
- Q&A enriquecida sobre todas las preguntas del Part B

Puede ocupar 100-200 páginas. Es el **activo intelectual** del proyecto, conservable durante años y útil más allá de una sola convocatoria.

### Organización

Se organiza **por estructura del proyecto** (Resumen, WPs, Consorcio, Impacto, Presupuesto), no por las preguntas del formulario oficial. Razón: es como piensa el usuario, como habla con sus partners y como vende el proyecto. El mapping a las preguntas del Part B se hace declarativo (ver §6).

### Idioma

Siempre en el **idioma nativo del coordinador** (más fluido, más rico). La traducción al idioma de envío se hace solo en la fase de compresión al formulario oficial (§6).

### Usos del Maestro más allá del envío

- Hablar con partners potenciales: les pasas el Maestro completo, no el formulario raquítico.
- Material de venta y captación de cofinanciadores.
- Briefings para tu equipo y tu organización.
- Base para presentar el mismo proyecto a múltiples convocatorias.
- Anexo histórico interno para defensa del proyecto.

### Dos exportaciones del mismo Maestro

```
              ┌─────────────────────────────────┐
              │   DOCUMENTO MAESTRO             │
              │   (única fuente de verdad)      │
              └─────────────────────────────────┘
                          │
                  ┌───────┴───────┐
                  ▼               ▼
        ┌────────────────┐  ┌─────────────────────┐
        │  EXPORT AMPLIO │  │  EXPORT FORMULARIO  │
        │  100-200 pág.  │  │  60 o 120 pág.      │
        │                │  │                     │
        │  Uso interno,  │  │  Lo que se sube a   │
        │  partners,     │  │  la convocatoria.   │
        │  formaciones.  │  │  Estructura exacta. │
        └────────────────┘  └─────────────────────┘
```

No son dos documentos paralelos. Son dos **modos de exportación** del mismo Maestro. La fuente es una; las salidas, múltiples.

---

## 4. El flujo completo en 11 pasos

```
─── Fase 1: DISEÑAR ──────────────────────────────────────────
Paso 1   Calculator                  Presupuesto, partners, estructura.
                                     Solo aquí se tocan números.
Paso 2   Diseño rico                 Cada WP y actividad con descripción
                                     amplia (sin truncar).

─── Fase 2: ESCRIBIR ─────────────────────────────────────────
Paso 3   Compilación Maestro v1      La IA monta el Documento Maestro
                                     inicial con todo el Diseño + Q&A
                                     a las preguntas del Part B.
                                     [Snapshot automático]
Paso 4   Diagnóstico inicial         Lista de contradicciones y huecos
                                     sobre la base estructural. Permite
                                     volver a fase 1 si toca.
Paso 5   EXPORT Formulario v1        (Opcional) El cliente básico
                                     puede acabar aquí, exportando ya
                                     el formulario oficial.

─── Fase 3: PERFECCIONAR ─────────────────────────────────────
Paso 6   Regeneración con            La IA recarga TODO el contexto
         contexto unificado          (call, programme guide, docs
         → Maestro v2                aportados, criterios eval, maestro
                                     v1) y regenera todos los campos
                                     con visión global. Sin chunks RAG.
Paso 7   Diagnóstico avanzado        Contradicciones textuales sobre
                                     la versión enriquecida.
Paso 8   Score Estimado              Nota panorámica global (sobre los
                                     criterios completos de la
                                     convocatoria) + áreas débiles
                                     priorizadas para mejorar.
Paso 9   Refinamiento                Chat único persistente con anclaje
         conversacional              visual al campo activo. La IA
         → Maestro v3                tiene siempre todo el Maestro
                                     cargado. El usuario refina campo
                                     por campo. Los cambios persisten
                                     en el Diseño/Maestro, no en el
                                     formulario.
Paso 10  Repaso de coherencia        Pasada final de la IA sobre el
         → Maestro v4 "ready"        Maestro entero. Asegura tono,
                                     consistencia, eliminación de
                                     contradicciones residuales.
Paso 11  EXPORT Formulario v2        Versión final del formulario
         (final)                     destilada del Maestro maduro.

─── Fase 4: EVALUAR (futuro) ─────────────────────────────────
                                     Evaluación contra criterios de
                                     proyectos pasados, propios o
                                     ajenos. Diseño pendiente.
```

---

## 5. CAG (Cache Augmented Generation), no RAG

### Decisión

Los documentos del proyecto que el LLM necesita durante la fase de Perfeccionar (call PDF, programme guide, criterios de evaluación, documentos aportados por el usuario, Documento Maestro) **no se vectorizan**. Se cargan **enteros** en cada llamada al LLM, con prompt caching para amortizar el coste.

### Por qué CAG y no RAG aquí

- **RAG** (que es lo que el writer actual hace) trocea los documentos y solo pasa los fragmentos relevantes. Pierde contexto, no detecta contradicciones transversales, ningún chunk ve el todo.
- **CAG** pasa el documento entero en cada llamada. El LLM tiene atención total. Lo que el otro Claude (externo) hace cuando Oscar le mete los PDFs adjuntos, replicado dentro del producto.

### Capacidad real

Modelos usados (Claude Sonnet 4.6 / Opus 4.7) tienen **1M tokens de contexto** ≈ 2.500 páginas. El escenario máximo realista por proyecto:

| Bloque | Páginas | Tokens |
|---|---|---|
| ~20 documentos del usuario × 15 págs | 300 | ~240k |
| Documento Maestro | 150 | ~120k |
| Criterios + prompts del sistema | 20 | ~16k |
| **Total cargado** | **~470** | **~380k** |
| **Margen libre** | ~2.000 | ~620k (62%) |

Cabe holgado, sin degradación de atención.

### Coste real con prompt caching

| Operación | Coste estimado (Sonnet 4.6) |
|---|---|
| Primera llamada de sesión (carga todo) | ~$1.15 |
| Llamadas siguientes (cache hit) | ~$0.17 cada una |
| **Proyecto completo** (regeneración + 40 turnos chat + diagnósticos + compresión) | **~$9-12** |
| Cliente que vuelve al día siguiente | +$1.15 nuevo arranque, luego $0.17/turno |

Sobre un servicio premium facturado a cientos o miles de euros por proyecto, el coste de IA es despreciable.

### Qué pasa con la vectorización existente

No se tira. Sigue siendo útil para casos donde el universo es demasiado grande para CAG:

| Caso de uso | Tecnología |
|---|---|
| Documentos del proyecto vivo | **CAG** |
| Búsqueda en 317k proyectos UE históricos | **RAG** |
| Research Module (papers académicos) | **RAG** |
| Histórico de propuestas presentadas por la org | **RAG** |

**CAG para el contexto del proyecto. RAG para buscar en grandes catálogos.**

---

## 6. Mapeo Maestro → Formulario oficial

### Cómo se comprime

La compresión Maestro → Formulario **no es magia del LLM**. Es un mapeo **declarativo por convocatoria** + compresión guiada por la IA.

Cada convocatoria europea (KA2 Cooperation Partnerships, SMP-COSME, CERV Citizens, etc.) tiene su formulario oficial con su estructura y sus límites exactos. La app tiene almacenado por convocatoria:

```
Convocatoria: KA2 Cooperation Partnerships >€60k
Formulario:   120 páginas
Estructura:
  Sección 1. Relevance                  máximo 4 págs
    Pregunta 1.1. Objetivos             máximo 2.000 caracteres
    Pregunta 1.2. Prioridades           máximo 3.000 caracteres
    Pregunta 1.3. Necesidades           máximo 4.000 caracteres
  Sección 2. Quality of work plan       máximo 8 págs
  Sección 3. Quality of partnership     máximo 3 págs
  ...
```

Y para cada pregunta, el mapping a las partes del Maestro que la nutren:

```
Pregunta 1.3 "Necesidades" (max 4.000 chars):
  Lee del Maestro:
    - Capítulo 1.2 (¿Por qué este proyecto?)
    - Capítulo 1.3 (Grupos objetivo)
    - Capítulo 4.1 (Impacto esperado en pymes locales)
  Reglas:
    - Mencionar las 3 culturas (pasiega, euskaldun, béarnaise)
    - Incluir al menos un dato cuantitativo
    - Terminar con la lógica de intervención
```

Con esto declarado, la compresión es **predecible y controlable**: cada casilla tiene su consulta al Maestro + sus restricciones de salida. El LLM destila, pero no adivina.

### Multi-convocatoria

Cuando se presenta el mismo proyecto a otra convocatoria distinta:
- El **Maestro es el mismo**
- Solo cambia el **mapping a la nueva estructura de formulario**
- La compresión se re-ejecuta con el mapping nuevo
- El usuario recibe un PDF distinto, mismo proyecto

Ahorra semanas de re-trabajo en cada presentación adicional.

### Tamaños oficiales por convocatoria

- Erasmus+ KA2 Cooperation Partnerships **< €60k**: ~60 páginas
- Erasmus+ KA2 Cooperation Partnerships **≥ €60k**: ~120 páginas
- (Más convocatorias por documentar conforme se carguen)

---

## 7. Versionado y exportaciones

### Tres tipos de versionado conviven

| Tipo | Cuándo se crea | Visible | Propósito |
|---|---|---|---|
| **Snapshot automático** | Cada N minutos | No | Recuperación, deshacer |
| **Versión nombrada** | Manual o por hito | Sí, sidebar | Hitos significativos |
| **Foto de envío** | Al exportar formulario | Sí, etiquetada | Histórico legal |

### Modelo de exportaciones

No hay "fotos fijas inmutables" como entidad separada. El proyecto siempre está vivo y editable. Lo que existe son **exportaciones realizadas**, cada una un PDF persistido con timestamp:

```
Proyecto SUSTRAI (siempre vivo)
├── Documento Maestro (única fuente, evoluciona libremente)
└── Exportaciones realizadas:
    ├── 15/03/2026  Formulario KA2-COOP-2026     [Lista para presentar]
    ├── 15/03/2026  Documento Amplio              [Compartido con partners]
    ├── 20/09/2026  Formulario KA2-LumpSum-2027   [Lista para presentar]
    └── 02/11/2026  Formulario COSME-2027         [Borrador]
```

### Estados de una exportación

- **Borrador**: el usuario la generó pero no la ha marcado como definitiva.
- **Lista para presentar**: el usuario la marcó explícitamente como la versión que se presenta a la convocatoria.

Cuando se marca una exportación como "Lista para presentar", el PDF queda guardado con ese estado, junto con la fecha y la convocatoria. El proyecto sigue editable; si más tarde se reexporta y se reetiqueta, **siempre se conservan todas las exportaciones históricas**. Cada una con su timestamp.

---

## 8. Documentos adjuntos al contexto

### Tipos

Tres clases de documentos entran al contexto del LLM:

1. **Documentos de la convocatoria** (subidos por admin, una vez por convocatoria, sirven para todos los proyectos que la usen):
   - Call PDF oficial
   - Programme Guide
   - Anexos técnicos (Annotated Grant Agreement, etc.)
   - Criterios de evaluación

2. **Documentos referenciados por la convocatoria** (estrategias UE, normativa, prioridades — opcionales, los carga el admin si la convocatoria los cita).

3. **Documentos aportados por el usuario** en su proyecto:
   - Estudios sectoriales del territorio
   - Datos sociológicos
   - Cartas de soporte
   - Memorias de pilotos previos
   - Cualquier evidencia que justifique el proyecto

### Procesamiento al subir

Los documentos se procesan una vez al subirlos:
- Extracción de texto (PDF, DOCX, etc.)
- Almacenamiento en BD como bloques nombrados
- **No se vectorizan** (estamos en CAG, no RAG, para esta capa)

### Carga al contexto

Cuando el usuario arranca una sesión de Perfeccionar, la app monta el bundle CAG completo (call + guide + refs + docs del usuario + maestro + criterios + prompts del sistema) y se lo pasa al LLM en la primera llamada de la sesión, marcado para caching de Anthropic.

Las llamadas posteriores en la misma sesión reutilizan la caché y solo pagan por los tokens nuevos (la última pregunta del chat + la parte del Maestro modificada).

### Caché TTL

Por defecto la caché de Anthropic vive **1 hora**. Si el usuario abandona la sesión y vuelve más tarde, la app detecta cache miss y rearma el bundle. Es transparente para el usuario; solo se nota como un pequeño retardo extra en la primera llamada de cada sesión.

---

## 9. El chat conversacional

### Un solo hilo persistente con anclaje visual

```
┌─────────────────────────┬─────────────────────────────┐
│                         │  💬 CHAT DE PROYECTO        │
│  Documento Maestro      │  ────────────────────────── │
│                         │  Anclado a: Actividad 2.3   │
│  Capítulo 2.3 — FSTP    │                             │
│  Reto SUSTRAI           │  Tú: "Refuerza el matiz     │
│  ┌─────────────────┐    │       de Cantabria"         │
│  │ texto rico que   │    │                            │
│  │ estás refinando  │←──┼─ IA: "Añado un dato sobre  │
│  └─────────────────┘    │       Valles Pasiegos y    │
│                         │       la trashumancia.      │
│  [click en otro         │       ¿Te encaja con lo    │
│   capítulo para         │       que habíamos          │
│   anclar el chat]       │       hablado en 1.2?"     │
└─────────────────────────┴─────────────────────────────┘
```

### Propiedades

- **Un solo hilo persistente** por proyecto. La IA recuerda todo lo hablado en la sesión actual y en sesiones anteriores.
- **Anclaje visual** al campo donde estés: una etiqueta indica "Anclado a Actividad 2.3". Si saltas a otro campo, la etiqueta cambia pero el hilo es el mismo.
- **Referencias cruzadas naturales**: si en un campo se contradice algo dicho en otro, la IA lo detecta proactivamente. *"Espera, en 1.2 dijimos X, ¿quieres que ajustemos también allí?"*
- **Cambios se persisten en el Maestro**, no en el formulario. La compresión al formulario es una fase posterior.

### Flujo en cada actividad

1. La IA precarga la descripción enriquecida actual de la actividad + contexto WP + draft Writer relacionado + criterios de evaluación.
2. Empieza ella proactivamente: *"He detectado tres cosas que reforzaría: A, B, C. ¿Empezamos por una?"*
3. Chat libre: aclaración, ejemplo, matiz, idea nueva.
4. Cuando el usuario acepta una mejora → se persiste en `activities.description` del Diseño.
5. La actividad se marca como "✓ revisada".

---

## 10. Diagnóstico de contradicciones

### Cuándo se ejecuta

Dos veces durante el flujo (pasos 4 y 7):

- **Diagnóstico inicial** (paso 4): sobre la base estructural recién compilada. Detecta huecos estructurales que conviene resolver antes de invertir tokens en regenerar todo.
- **Diagnóstico avanzado** (paso 7): sobre la versión enriquecida tras regeneración con contexto unificado. Detecta contradicciones textuales finas que requieren refinamiento.

### Salida

Lista de items accionables, clasificados en dos cubos:

| Tipo | Comportamiento |
|---|---|
| **Narrativo** (~95% de casos) | Item con link al campo del Diseño que toca enriquecer. El usuario lo resuelve en la fase Perfeccionar. |
| **Económico** (~5%) | Item con candado: "Esto toca Presupuesto → ve a Calculator." No editable desde Perfeccionar. |

Ejemplos del primer cubo:
- *"El draft promete pilotos en Quality pero ninguna actividad describe el método de testing."* → enlace a WP3
- *"Output 2 sin KPI medible."* → enlace a actividad IO Guide en WP2
- *"Partner 4 sin track record mencionado para Cooperation Partnerships."* → enlace a Consortium → Partner 4

Ejemplos del segundo cubo:
- *"Presupuesto de Subcontracting al 35% — el límite de la convocatoria es 25%."*
- *"WP4 con 5 actividades pero solo €8.000 asignados; coste por actividad < €2k."*

---

## 11. Score Estimado del proyecto

### Qué es

La IA carga todos los criterios de evaluación de la convocatoria y produce una **nota global panorámica** del proyecto (no campo por campo).

### Salida

```
┌─────────────────────────────────────────────────────┐
│ Score estimado: 82/100                              │
│                                                     │
│ Por capítulo:                                       │
│   Relevance ........................ 28/30  ✓      │
│   Quality of work plan ............. 24/30  ⚠      │
│   Impact ........................... 18/25  ⚠      │
│   Quality of partnership ........... 12/15  ✓      │
│                                                     │
│ Áreas más débiles (mejora prioritaria):             │
│   1. Indicadores medibles del WP3 (-3 pts)         │
│   2. Plan de sostenibilidad post-proyecto (-2 pts) │
│   3. Diversidad geográfica del consorcio (-2 pts)  │
│                                                     │
│ [Mejorar las 3 áreas con la IA]   [Ver detalle]    │
└─────────────────────────────────────────────────────┘
```

### Valor pedagógico

Es la pieza que en formaciones hace ver al cliente cuánto le falta y qué tocar. Convierte "perfeccionar el proyecto" de proceso abstracto en proceso medible.

---

## 12. Impact set: cuando algo cambia a media iteración

Si en mitad de la fase Perfeccionar el usuario decide añadir una actividad nueva (con coste asociado), debe ir a Calculator. Pero al volver, no debe reescribir todo el proyecto: solo lo afectado.

### Concepto

Cuando se hace un cambio estructural (alta/baja de actividad, reasignación de presupuesto), la app calcula el **impact set**: qué secciones del Maestro/formulario dependen de esa actividad o de ese WP.

```
Cambio detectado:  NUEVA actividad "Concurso ideación SMEs" en WP4 (€8.000)
                   Reasignación: WP3 -€4.000, WP5 -€4.000

Secciones impactadas (4):
  ● 4.2 WP4 description           — debe incluir la nueva actividad
  ● 4.2 WP3 description           — debe justificar la reducción
  ● 4.2 WP5 description           — íd
  ● 3.3 Budget allocation         — refleja el nuevo reparto
  ○ 2.1 Relevance                 — opcional, si refuerza engagement
  ○ 2.5 Impact                    — opcional, si el concurso mueve KPIs

[Revisar una a una con IA]   [Refinamiento holístico de las 4]
```

Las secciones fuera del impact set **no se tocan**. Solo las afectadas entran en revisión.

Esto resuelve el problema de "no quiero rehacer todo cada vez que cambio una cosa pequeña".

---

## 13. Planes comerciales (decisión aparcada)

**Decisión actual**: todo es **premium** durante la fase de pre-desarrollo. El corte entre plan básico y plan premium se decide más adelante cuando se acerque el lanzamiento comercial.

Cuando llegue el momento, la separación natural sería:

- **Básico**: hasta paso 5 (export del formulario v1 desde la compilación Maestro v1).
- **Premium**: todo lo de la fase Perfeccionar (pasos 6-11) — regeneración con contexto unificado, diagnóstico avanzado, score estimado, refinamiento conversacional, repaso de coherencia, export mejorado.

---

## 14. Convocatorias soportadas

### Hoy

Las 4-5 convocatorias actualmente cargadas en la BD (Erasmus+ KA2 y similares que comparten formulario europeo en Funding & Tenders).

### Futuro

KAs nacionales (proyectos de movilidad presentados a las agencias nacionales, con formularios distintos del europeo). Trabajo posterior, no bloqueante para el lanzamiento.

### Cada convocatoria requiere

- Plantilla del formulario oficial declarada (estructura + límites por sección).
- Documentos canónicos cargados (call PDF, programme guide, anexos).
- Criterios de evaluación parseados.
- Mapping declarativo Maestro → casillas del formulario.

Trabajo estimado: 3-5 días por convocatoria nueva.

---

## 15. Cambios pendientes al sistema actual

Esta arquitectura requiere modificar el sistema existente. Lo que hay que tocar, en orden de dependencia:

### Bloqueantes (gratis o casi gratis)

1. **Eliminar los truncados del Diseño** (`model.js` del developer):
   - `wp.summary` (hoy 400 chars) → sin truncar
   - `act.description` (hoy 250 chars en cascada, 400 en WP focus) → sin truncar
   - `milestone.description`, `deliverable.description` (hoy 300) → sin truncar
   - `task.description` (hoy ignorado) → incluir

   Sin esto, todo el trabajo de enriquecimiento manual del usuario se descarta antes de llegar al LLM.

### Estructurales (semanas)

2. **Tabla nueva** `master_documents` para persistir el Documento Maestro estructurado por capítulos y secciones.

3. **Tabla nueva** `master_exports` para registrar cada exportación (PDF, fecha, convocatoria destino, estado borrador/lista-para-presentar).

4. **Tabla nueva** `call_form_templates` para almacenar por convocatoria la estructura del formulario oficial (secciones, preguntas, límites de caracteres).

5. **Tabla nueva** `master_to_form_mapping` para el mapping declarativo (qué partes del Maestro alimentan qué pregunta del formulario, con reglas de compresión).

6. **Tabla nueva** `chat_threads` y `chat_messages` para el hilo persistente único por proyecto.

7. **Refactor del pipeline LLM**: cambiar de RAG (chunks vectorizados) a CAG (bundle completo + prompt caching de Anthropic) para los documentos del proyecto.

8. **Nuevo módulo de procesamiento de documentos** que extraiga texto (PDF, DOCX) sin vectorizar.

9. **Nueva UI por fase**: hoy el sidebar tiene módulos por área. Pasaría a tener **4 fases** como nivel superior, con módulos dentro de cada fase.

### Futuro

10. **Fase Evaluar** (paso 12+): evaluación contra criterios de proyectos pasados, propios o ajenos.

---

## 16. Roadmap de implementación sugerido

Orden propuesto, de menor a mayor riesgo:

1. **Eliminar truncados** (bloqueante, gratis): el ciclo manual actual deja de perder texto.
2. **Tabla `master_documents` + UI básica**: el Maestro existe como entidad persistible.
3. **Compilación Maestro v1** (paso 3): la IA monta el primer Maestro a partir del Diseño + Writer actual.
4. **Diagnóstico inicial** (paso 4): primera versión del diagnóstico de contradicciones, modo narrativo+económico.
5. **Mapping declarativo Maestro → Formulario** para 1 convocatoria piloto (la que vais a usar para SUSTRAI).
6. **EXPORT Formulario v1** (paso 5): pipeline de compresión por mapping, con la convocatoria piloto.
7. **Tablas `chat_threads` + UI chat persistente** con anclaje visual (paso 9).
8. **Refactor a CAG**: bundle de contexto completo + prompt caching para la fase Perfeccionar.
9. **Regeneración con contexto unificado** (paso 6).
10. **Diagnóstico avanzado + Score estimado** (pasos 7-8).
11. **Refinamiento conversacional + Repaso coherencia** (pasos 9-10).
12. **EXPORT Formulario v2** (paso 11): compresión mejorada.
13. **Convocatorias adicionales**: replicar el mapping para las 3-4 convocatorias restantes.
14. **Fase Evaluar** (paso 12+): trabajo futuro.

---

## 17. La propuesta de valor para los clientes

> *"En esta app no escribes una propuesta. Construyes el libro de tu proyecto. La propuesta que envías a Europa es solo lo que cabe de ese libro en el formulario. Pero el libro queda contigo: lo usas para tus partners, tus financiadores, tu equipo y para presentar el mismo proyecto a otras convocatorias sin reescribirlo."*

Esta frase resume el cambio mental que justifica que un cliente pague significativamente más que por una herramienta tradicional de redacción asistida. Ya no es *"te ayudo a escribir el formulario"*, es *"te ayudo a construir y mantener vivos tus proyectos"*, del que se derivan envíos puntuales a convocatorias.

---

## 18. Origen de este documento

Conversación de diseño entre Oscar y Claude Local, sesiones 2026-05-15 y 2026-05-16, tras la experiencia real de presentar SUSTRAI (proyecto vivo, convocatoria SMP-COSME-2026-TOURSME). El borrador inicial generado por el Writer cascada actual alcanzaba ~75 puntos; Oscar lo mejoró pasándolo a un Claude externo con todos los documentos adjuntos, lo que sirvió de evidencia de que CAG > RAG para esta capa, y de que el Documento Maestro debe ser la fuente de verdad, no el formulario oficial.

Las decisiones aquí recogidas son **cerradas** a nivel conceptual. La implementación se ejecuta por iteraciones siguiendo el roadmap §16.
