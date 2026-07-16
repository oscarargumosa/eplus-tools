# Parte V · Advanced Proposal Design

> *El corazón técnico del método: cómo se convierte un diseño en un Form Part B de 90+
> puntos. La estructura, los criterios y —lo más importante— el* evaluation thinking.

---

## Capítulo · El Form Part B como estructura, no como muro

Para muchas organizaciones, el Form Part B es un muro: 60 páginas en una Cooperation
Partnership pequeña (<60.000 €), hasta ~120 en una grande (≥60.000 €). Para FUN-DESIGN™ no
es un muro, sino una **estructura conocida y predecible**.

La clave: el Form Part B es un **template universal** por tipo de acción. Las convocatorias
del mismo tipo comparten formulario. Eso permite tratarlo como lo que es —un conjunto
estable de ~15+ secciones, cada una con sus preguntas, sus límites de palabras y su peso en
la nota— y no como un documento nuevo cada vez.

```
   FORM PART B (estructura estable por tipo de acción)
   ├── Relevance
   ├── Needs analysis & objectives
   ├── Quality of project design and implementation
   │     ├── Work Packages
   │     ├── Milestones
   │     └── Deliverables
   ├── Partnership & cooperation arrangements
   ├── Impact
   ├── Dissemination & sustainability
   └── Budget (derivado del Calculator)
```

Cada sección es, para EUWriter, una **llamada independiente** con su propio contexto y sus
propios criterios. Y todas beben del mismo libro del proyecto y los mismos Hechos
Invariables — por eso no se contradicen.

---

## Capítulo · Dos capas de criterios

Conviene no confundir dos cosas que operan a la vez dentro de EUWriter:

1. **Los criterios oficiales de la convocatoria** — la rúbrica pública, que **varía por
   call** en número y peso.
2. **Las 25+ dimensiones expertas de EUWriter** — un marco propietario, constante, destilado
   por consultores y evaluadores europeos e incrustado en cada pregunta del motor.

> 💡 Más de **25 dimensiones de evaluación**, criterios de calidad y conceptos estratégicos
> —lo que distingue una propuesta sobresaliente de una del montón— están embebidos en cada
> pregunta de EUWriter. No son los criterios de la call: son la inteligencia experta que se
> aplica *sobre* ellos.

### Los criterios oficiales: una rúbrica viva

Un error común es pensar que existe "una lista fija de criterios oficiales". No la hay.
**Varían por convocatoria**, tanto en número como en peso. Algunos ejemplos reales:

| Convocatoria | Nº de criterios | Estructura de puntuación |
|--------------|-----------------|--------------------------|
| KA3 — Youth Together | 22 | Relevance 30 · Quality of design 30 · Partnership 20 · Impact 20 |
| KA2 — Cooperation Partnerships (ES) | 18 | 30 / 30 / 20 / 20 |
| KA210 — Small-scale (Sport) | 64 (ingestados) | 30 / 30 / 20 / 20 · umbral 60 |
| Sport Events | — | 100 puntos |

El patrón EACEA canónico para la mayoría de acciones Erasmus+ de cooperación es
**30 / 30 / 20 / 20 con umbral de aprobación de 60**. Pero la rúbrica concreta —qué se
pregunta, cuánto pesa, qué palabras clave busca el evaluador— se ingiere por convocatoria.

### La anatomía de un criterio

En FUN-DESIGN™, cada criterio no es una etiqueta: es un objeto rico con **nueve campos**
que capturan el conocimiento experto sobre cómo se evalúa:

```
   CRITERION
   ├── Title        ¿cómo se llama?
   ├── Meaning      ¿qué evalúa realmente el evaluador?
   ├── Structure    ¿cómo debe estructurarse la respuesta?
   ├── Relations    ¿con qué otras secciones se relaciona?
   ├── Rules        pesos, elegibilidad, límites
   ├── Red flags    ¿qué hace que un evaluador reste?
   ├── Rubric       la rúbrica en JSON (bandas de puntuación)
   ├── Max score    puntos máximos de este criterio
   └── Mandatory    ¿es eliminatorio?
```

> 💡 Aquí vive el activo más valioso de EU Funding Studio: **el criterio experto
> sistematizado**. No es una IA adivinando qué quiere el evaluador; es la rúbrica real —la
> *Guide for Experts on Quality Assessment* de EACEA— convertida en instrucciones operables.

---

## Capítulo · Evaluation Thinking

El principio que atraviesa toda la Parte V:

> 💡 **Diseña la propuesta desde la mente del evaluador, no desde la del solicitante.**

*Evaluation thinking* significa escribir cada sección respondiendo, implícitamente, a la
pregunta que el evaluador tiene delante en su rúbrica. No "qué quiero contar", sino "qué
tiene que encontrar el evaluador aquí para darme la puntuación máxima".

Esto cambia la escritura por completo:

- Cada afirmación de impacto se ancla a un **indicador**.
- Cada socio se justifica contra el criterio **Partnership**.
- Cada actividad se conecta con el **objetivo** que sirve y el **presupuesto** que la
  financia.
- Se eliminan de raíz las *red flags* que hacen restar.

### EUWriter como aplicación del evaluation thinking

EUWriter materializa este pensamiento en cuatro sub-fases:

```
   1. CONTEXTO         Reúne datos del proyecto, presupuesto, call y criterios de la sección.
        ↓
   2. BORRADOR         Genera cada sección anclada a sus criterios.
        ↓
   3. PULIDO           Evalúa el texto con semáforo ✅ ⚠️ ❌ y hace preguntas de mejora.
        ↓
   4. REVISIÓN FINAL   Tabla-resumen con score por sección (p. ej. TOTAL 88/100) y checks
                       de consistencia global.
```

El "Pulido" es donde el evaluation thinking se hace visible: no basta con que el texto
exista; tiene que **pasar la rúbrica**. Un ⚠️ o un ❌ no es un juicio estético, es una
predicción de puntos perdidos —y una invitación a mejorar con IA antes de presentar.

### La puntuación estimada

El resultado tangible es una estimación de nota **por criterio**, no un número opaco:

```
   Score estimado: 88/100
   ├── Relevance ................ 28/30   ⚠️  falta anclar un indicador
   ├── Quality of work plan ..... 26/30   ✅
   ├── Partnership .............. 18/20   ✅
   └── Impact ................... 16/20   ⚠️  sostenibilidad genérica
```

Con las áreas más débiles señaladas y priorizadas. El diseñador humano decide qué mejorar;
la IA ejecuta la mejora. Ese bucle —estimar, señalar, mejorar, reestimar— es lo que empuja
una propuesta de 68 hacia 90.

---

## Capítulo · Cero contradicciones: la consistencia como ventaja competitiva

En un documento de 120 páginas escrito por partes, la incoherencia es el enemigo silencioso
(recordemos el *drift* de la Parte I). FUN-DESIGN™ lo convierte en imposible por diseño:

- El **presupuesto** lo produce el Calculator una sola vez; todas las secciones lo citan,
  ninguna lo reinventa.
- Los **líderes de Work Package**, las cifras de participantes, las fechas — son Hechos
  Invariables inyectados en cada generación.
- La **Revisión final** ejecuta checks de consistencia explícitos antes de dar por buena la
  propuesta.

> 💡 Donde la competencia lucha por que 120 páginas no se contradigan, FUN-DESIGN™ **parte
> de la coherencia** y construye desde ahí. La consistencia deja de ser un problema para
> convertirse en una ventaja visible ante el evaluador.

---

← *Anterior:* **[Parte IV · The AI Specialists](04-ai-specialists.md)**  ·  → *Continúa en* **[Parte VI · Building Winning Consortia](06-winning-consortia.md)**
