# EU Funding School — Pricing Framework v1
*Documento elaborado: 2026-04-28 · Sesión de pensamiento estratégico Oscar + Claude*

---

## Cómo leer este documento

No es solo "el pricing definitivo". Es la **base teórica completa** del modelo: el proceso por el que llegamos a las decisiones, las opciones que consideramos y descartamos, y por qué. La conversación duró ~3 horas y atravesó varias revisiones; este documento las consolida.

Tres niveles de lectura según tu interés:

1. **Solo decisiones** → §1 (Resumen ejecutivo) y §11 (Pricing definitivo).
2. **Decisiones + razonamiento** → añade §2-6 (proceso de pensamiento).
3. **Todo** → completo, incluida la deliberación interna y los caminos descartados.

---

## 1. Resumen ejecutivo

**EU Funding School** es una plataforma SaaS + Academia online para preparar propuestas Erasmus+ centralizadas y descentralizadas. Vendemos **acceso a una convocatoria concreta + formación específica + uso de la herramienta de IA + acompañamiento docente**.

**Decisiones cerradas en esta sesión:**

| Decisión | Resultado |
|---|---|
| Unidad de cobro | El **slot por call concreta** (Topic ID + amount presupuestario) |
| Pricing | **1 % del presupuesto del proyecto** con curva regresiva >800k y cap absoluto 25.000€ |
| Diferenciación tier | Por capping de uso (iteraciones, módulos), **NUNCA por degradar la IA** |
| Estructura pedagógica | **12 cohortes pedagógicas** que absorben los 47 Topic IDs + 129 SKUs |
| Formato cohorte | 8 clases live × 2h con experto + lecciones grabadas + herramienta + IA + soporte |
| Capacidad por cohorte | Sin cerrar de momento. Si se llena, se sube precio o se abre 2ª edición |
| Calendario operativo | Captación primavera/verano · Cursos oct-dic · Uso herramienta ene-feb · Cursos terminan 45 días antes de deadline |
| Sandbox gratuito | Sport SSCP 30k + KA210 30k accesibles capadas para juego |
| Cambio de guía (mediados dic) | Disclaimer + reasignación automática · devolución solo si desaparece sin equivalente |
| Riesgo cap consultivo | Slots >25.000€ se sacan del catálogo automático y van por venta consultiva individual |

---

## 2. Posicionamiento (anclaje narrativo del producto)

**No vendemos software.** No vendemos "una IA que escribe proyectos". No vendemos un curso suelto. Vendemos **una infraestructura completa para preparar propuestas Erasmus+ competitivas, anclada a una convocatoria concreta con una deadline real**.

El cliente entra a la plataforma porque tiene una convocatoria en mente — Capacity Building Sport, KA220-VET, CoVE — y quiere presentarse con la mayor probabilidad de éxito. La unidad mental con la que llega es **la call**, no "una herramienta". Por eso toda la economía del producto se construye sobre la call como contenedor.

El diferencial frente a alternativas:

- Frente a software puro (herramientas IA): nosotros llevamos formación experta + acompañamiento docente.
- Frente a consultoría tradicional: nosotros escalamos vía cohortes y herramienta.
- Frente a cursos genéricos sobre Erasmus+: nuestros cursos están anclados a una deadline real con producción real al final.
- Frente a hacerlo solo: ahorramos meses de aprendizaje, ajuste presupuestario y reescritura iterativa.

---

## 3. Catálogo Erasmus+ como base del modelo

Toda la arquitectura comercial se levanta sobre el catálogo oficial Erasmus+. Oscar entregó dos archivos en esta sesión que viven en `data/`:

- **2026 oficial** (Programme Guide del 12/11/2025): 129 SKUs reales · 47 Topic IDs · 14 familias.
- **2027 especulativo** con deadlines integrados como columna del Excel: misma estructura + fechas derivadas del patrón histórico.

Estructura completa documentada en `data/README.md` y memoria `reference_erasmus_2026_catalog`.

**Distribución por tier presupuestario:**

| Tier | Rango | SKUs | % del catálogo |
|---|---|---:|---:|
| XS | < 60.000 € | 6 | 4,7 % |
| S | 60.000 – 500.000 € | 72 | 55,8 % |
| M | 500.000 – 1.500.000 € | 42 | 32,6 % |
| L | ≥ 1.500.000 € | 9 | 7,0 % |

**El 88% del catálogo está concentrado en S+M**, y ahí debe pulirse la experiencia.

**Distribución por manager:**
- **EACEA (centralizado, Form Part B único)**: 33 topics — corto plazo, ya construido.
- **National Agency (descentralizado, formularios distintos por país)**: 14 topics — apertura otoño 2026.
- **KA1**: no entra en el catálogo 2026/2027, se espera a la guía 2028 para evitar invertir en algo que cambia.

---

## 4. La dimensión temporal: deadlines como motor del modelo

La integración del calendario 2027 reveló el patrón crítico:

```
22 ene 2027  Sport Events (SNCESE + LSSNCESE)               2 topics
10 feb 2027  CBHE — 11 regiones                            11 topics
11 feb 2027  EMJM Mob + EMJM Design                         2 topics
26 feb 2027  CB Youth × 4 + KA3 EYT                         5 topics
 5 mar 2027  Sport (CB+SCP+SSCP) + KA220 ×5 +
             KA210 ×4 + ENGO ×2                            16 topics
10 mar 2027  Alliances for Innovation (3 lots)              3 topics
26 mar 2027  CB VET × 6 + Teacher Academies                 7 topics
 9 abr 2027  EPSD                                           1 topic
 3 sep 2027  CoVE                                           1 topic
```

**44 de 47 topics (94 %) cierran en 11 semanas (22-ene a 9-abr).** CoVE en septiembre es el único calendario alternativo.

### Implicaciones que esto tiene en el negocio

1. **El año tiene UN PICO**, no flujo continuo. La planificación operativa, la producción de contenido, las campañas y la capacidad humana se diseñan alrededor de este pico.
2. **El calendario público es el lead magnet principal.** Una página `/convocatorias-2027` con countdowns por deadline es contenido SEO de alta intención.
3. **Cada deadline genera una cohorte natural.** Todos los que presentan KA220 marzo 2027 son una promoción.
4. **Cada call regional es un micro-mercado.** Las 11 regiones de CBHE son 11 campañas de marketing distintas con la misma deadline.
5. **El boletín deja de ser genérico** y pasa a ser alertas calendarizadas ("falta 1 mes para la deadline de KA220").

---

## 5. El proceso de pensamiento sobre cómo cobrar

Esta es la deliberación interna que la conversación atravesó. Se documenta para que cualquier revisión futura entienda **por qué** decidimos lo que decidimos.

### 5.1 Punto de partida (modelo viejo en BUSINESS_PLAN.md)

El plan anterior tenía:
- Plan Básico 0,5 % del presupuesto
- Plan Premium 2 %
- Plan Colaboración 1 % + 1 % éxito
- Plan Shadow 3 % solo si aprobado

Conflictos detectados: incompatible con la idea "año 1 100% gratis" del propio documento. Tiers abstractos sin anclaje a la call. Diferencia Premium/Standard basada en degradar la IA.

### 5.2 Decisión: NO degradar IA

> **La diferenciación entre niveles de pago se hace por capping de uso (iteraciones, módulos, número de refinados), nunca por bajar la calidad de la IA.**

Razón: degradar IA es contraproducente para la marca ("entonces el básico es flojo"). El usuario debe ver SIEMPRE la misma calidad de salida; lo que cambia es cuánta puede usar. Coherente con `project_writer_freemium`: priorizar calidad máxima en todos los planes, capar por uso.

### 5.3 Tres modelos puros que se descartaron

**Modelo A — "Tier = derecho a 1 proyecto en ese rango"**
- Problema: si una entidad presenta 5 KA220 al año, paga 5× la formación que es la misma. Se rebela.

**Modelo B — "Tier = saldo presupuestario consumible"**
- Problema: vendemos "saldo de presupuesto", algo que no tiene relación con nuestro coste real (que está en el ciclo de generación + IA + iteración + docencia, no en el techo del proyecto). Abre incentivos perversos.

**Modelo C — "N slots/año por tier"**
- Problema: hay que adivinar el N. Si te quedas corto regalas; si te pasas, mata el upsell.

### 5.4 Modelo D adoptado: "Slot por call con descuento por repetición en familia"

Estructura final:

1. El usuario **no compra "Tier M" abstracto**, compra **un slot para una call concreta** (Topic ID + cap presupuestario).
2. El tier define el **precio** del slot, no un saldo.
3. Cada slot incluye: acceso a la cohorte (8 clases live + lecciones grabadas), herramienta full + IA + iteración, soporte asíncrono.
4. **Primer slot en una familia = precio completo** (incluye Academia).
5. **Slots adicionales en la misma familia = precio reducido** (la formación ya está pagada — solo pagas herramienta + IA + iteración).
6. **Slot en familia nueva = vuelve a precio completo** (otra audiencia, otros criterios, otros expertos).

### 5.5 La revisión sobre "precio plano dentro de la familia"

Inicialmente propuse precio plano dentro de la familia (un KA220 120k al mismo precio que un KA220 400k), porque el formulario es el mismo. **Oscar corrigió este error** señalando algo que solo el experto sabe:

| KA220 120k | KA220 400k |
|---|---|
| 3 socios | 8-12 socios |
| 3 WPs | 5 WPs |
| 9 actividades | 25+ actividades |
| Presupuesto sencillo | Presupuesto complejo de cuadrar |

El dolor real que la herramienta ahorra **escala con el tamaño del proyecto**. Cobrar lo mismo penaliza al pequeño y regala al grande. **Conclusión: el precio del slot SÍ debe escalar con el amount.**

### 5.6 La estructura de SKUs como problema cognitivo

129 SKUs parece inmanejable. Pero la objeción "no puedo ofrecer un menú de 130 precios" es engañosa: ningún cliente necesita ver 129 productos. La UX del producto debe ser un **sistema de asesoramiento**, no un catálogo plano:

```
Inicio → ¿Qué quieres presentar?
  ▾ Selector de Cohorte (12 opciones)

[Selecciona "Cooperation Partnerships KA220 — National Agency"]

  Esta call existe en 5 sectores y 3 tamaños presupuestarios:

  Sector ─────────────  120k €    250k €    400k €
  Schools (KA220-SCH)   1.200€    2.500€    4.000€
  VET (KA220-VET)       1.200€    2.500€    4.000€
  Higher Ed             1.200€    2.500€    4.000€
  Adult ed              1.200€    2.500€    4.000€
  Youth                 1.200€    2.500€    4.000€
```

El cliente solo ve los 15 SKUs de KA220, no los 129.

### 5.7 La revelación de las cohortes pedagógicas

Inicialmente se pensaron 47 cursos (uno por Topic ID). Oscar corrigió: **las cohortes las define la guía oficial**. Si una familia tiene 11 regiones, no son 11 cursos — es **un curso con módulos regionales como mini-unidades didácticas**. CBHE Latinoamérica, CBHE Asia, CBHE África comparten estructura central; lo que cambia es una mini-clase específica.

Resultado: **47 topics → 12 cohortes pedagógicas**. Detalle en §7.

### 5.8 La curva regresiva por encima de 800k

Una vez fijado el 1 % lineal, los proyectos grandes producían slots de 40.000–64.000€ (CoVE 4M, EMJM Mob 5M, Eur Univ 6,4M). Eso ya no es SaaS, es contrato consultivo. Decisión: **curva regresiva piecewise marginal + cap absoluto a 25.000€**. Detalle en §11.4.

---

## 6. Las tres unidades vendibles

El producto no es "el slot" en sí, sino tres unidades que se combinan. Reconocer esta separación permite up-sell y down-sell limpios:

| Unidad | Qué es | Coste real |
|---|---|---|
| **🎓 Academia** | Curso específico de la cohorte (8 clases live + lecciones grabadas + comunidad anual) | Producción de contenido (alta, una vez); profesor (variable) |
| **🔧 Slot de proyecto** | Acceso a la herramienta full + IA sin tope técnico + iteración para una call concreta con su cap | IA por uso (~0,08 €/refinado); plataforma; soporte |
| **⭐ Premium adicional** | Consultoría 1:1, evaluación profunda, anuncios Partner Finder, asesoría estratégica | Servicios humanos puntuales |

### 6.1 Tres mecánicas de combinación que conviven

Cada perfil de cliente tiene su recorrido natural:

**Mecánica 1 — "Slot con curso incluido"** (cliente warm)
- Compras tu primer slot KA220 → la Academia de KA220 viene incluida durante todo el ciclo.
- No se vende slot suelto sin Academia si nunca has hecho esa familia. Sin formación el slot fracasa y manchamos el producto.

**Mecánica 2 — "Curso primero + descuento al slot"** (cliente cold)
- El cliente entra por la Academia (se inscribe a un curso). Al final del curso, oferta: presenta tu proyecto con descuento al slot.
- Funciona cuando el canal principal es formación pública (masterclasses, ads, blog).

**Mecánica 3 — "Slot directo, curso opcional"** (cliente hot, veterano)
- Sube un proyecto rechazado al Evaluador → identificación automática de la familia → slot Premium directo.
- No necesita Academia. Si quiere profundizar en una familia nueva, le ofrecemos curso a precio reducido.

Las tres mecánicas se asignan a las etapas del funnel que ya están implementadas en `centralize.es` con tags efs:cold / warm / hot.

---

## 7. Las 12 cohortes pedagógicas

Estructura definitiva derivada de la guía oficial. La cohorte agrupa topics que comparten audiencia + Form Part B + calendario.

| # | Cohorte | Topics absorbidos | Deadline 2027 | Tickets |
|---:|---|---|---|---|
| 1 | **CBHE** (módulos regionales 11) | 11 topics CBHE | 10-feb-2027 | 200k–2M € |
| 2 | **CB Youth + KA3 EYT** (módulo región/SSA) | 4 CB Youth + 1 EYT | 26-feb-2027 | 300k–500k € |
| 3 | **CB VET** (módulos 6 regiones) | 6 topics CB VET | 26-mar-2027 | 500k flat |
| 4 | **Sport Cooperation & Capacity** | CB Sport + Coop Sport + Small-Scale Sport | 5-mar-2027 | 30k–400k € |
| 5 | **Sport Events** | SNCESE + LSSNCESE | 22-ene-2027 | 200k–1,5M € |
| 6 | **KA2 Cooperation & Small-Scale + ENGO** | KA220 (5 sectores) + KA210 (4 sectores) + PCOOP-ENGO (Edu+Youth) | 5-mar-2027 | 30k–400k € |
| 7 | **Alliances for Innovation** (3 lots) | Edu-Enterp + Blueprint + STEM | 10-mar-2027 | 1M–4M € |
| 8 | **EMJM** (Mobility + Design) | EMJM-MOB + EMJM-DESIGN | 11-feb-2027 | 55k–5M € |
| 9 | **Teacher Academies** | TEACH-ACA | 26-mar-2027 | 1,5M flat |
| 10 | **EPSD** (KA240-SCH, nuevo 2026) | KA240-SCH | 9-abr-2027 | 400k flat |
| 11 | **CoVE** (calendario propio septiembre) | PEX-COVE | 3-sep-2027 | 4M flat |
| 12 | **European Universities** (consultivo individual) | EUR-UNIV | varía | 6,4M |

Detalle en `data/cohorts_v1.json`.

### Notas operativas

- **EMJM tiene un outlier**: EMJM-DESIGN (55k) y EMJM-MOB (5M) están en la misma cohorte por deadline pero son productos comercialmente distintos. EMJM-DESIGN puede absorberse a la Academia de Teacher Academies o quedar como "preparación premium" independiente. Decisión final pendiente.
- **European Universities** (6,4M) se trata aparte: venta consultiva individual, no entra en flujo SaaS.
- **KA2 Coop & Small-Scale + ENGO** es la cohorte más voluminosa (29 SKUs, 11 topics) — formato pedagógico debe contemplar módulos por sector (SCH/VET/HED/ADU/YOU) y por escala (KA220 vs KA210 vs ENGO).

---

## 8. Calendario operativo (con cursos de 2 meses + 45 días buffer)

Aplicando las reglas operativas (curso = 2 meses · termina 45 días antes de deadline · captación 1-2 meses antes del inicio):

| Fase | Cuándo | Qué pasa |
|---|---|---|
| **Captación** | Mayo–Septiembre 2026 | Calendario público en web + ads segmentadas por familia/región + masterclasses gratuitas + boletín alertas |
| **Apertura cursos** | Octubre 2026 (8 oct: Sport Events) → Diciembre 2026 (10 dic: CB VET) | 8 cohortes empiezan en 11 semanas |
| **Pico simultáneo** | 10 dic 2026 – 24 feb 2027 | Hasta 8 cohortes activas en paralelo. Cuello operativo gestionado con 4-5 profesores |
| **Uso de la herramienta** | Enero–Marzo 2027 | Alumnos escriben sus proyectos con la plataforma + IA + iteración |
| **Pico deadlines** | 22 ene 2027 – 9 abr 2027 | 11 deadlines en 11 semanas. 44/47 topics cierran aquí |
| **Valle** | Abril–Junio 2027 | Resultados, post-mortem, evaluaciones de propuestas no aprobadas, captación CoVE |
| **Mini-pico CoVE** | Julio–Septiembre 2027 | Cohorte CoVE arranca jun, deadline 3 sep |

**Calendario detallado de cohortes 2027:**

```
Deadline      Cohorte                              Curso empieza  Curso termina
2027-01-22    Sport Events                         8-oct-2026     8-dic-2026
2027-02-10    CBHE                                 27-oct-2026    27-dic-2026
2027-02-11    EMJM                                 28-oct-2026    28-dic-2026
2027-02-26    CB Youth + EYT                       12-nov-2026    12-ene-2027
2027-03-05    KA2 Coop+SS+ENGO + Sport Coop+Cap    19-nov-2026    19-ene-2027
2027-03-10    AoI                                  24-nov-2026    24-ene-2027
2027-03-26    CB VET + Teacher Academies           10-dic-2026    10-feb-2027
2027-04-09    EPSD                                 24-dic-2026    24-feb-2027
2027-09-03    CoVE                                 19-jun-2027    19-jul-2027
```

### Política de cambio de guía (mediados diciembre)

La guía Erasmus+ del año siguiente se publica oficialmente a mediados de diciembre del año previo. Si para entonces los cursos llevan 6-8 semanas en marcha, una ola de devoluciones masiva paraliza la operación. **Política adoptada:**

| Escenario | Resultado | Acción cliente |
|---|---|---|
| Cosmético (presupuesto +/-10%, nombre, alguna región) | Curso y slot siguen. Actualizamos contenido en 1-2 semanas | Solo notificación |
| Sustancial pero hay equivalente (cambia estructura pero misma audiencia) | Reasignación automática al equivalente | Confirma o pide devolución |
| Desaparición sin equivalente (raro, sólo al final del periodo) | Devolución completa O crédito íntegro aplicable a otra cohorte | Cliente elige |

**Disclaimer público (versión final propuesta para T&C):**

> *Las convocatorias Erasmus+ son publicadas oficialmente por la Comisión Europea a mediados de diciembre del año previo. Tu inscripción cubre la familia de programa contratada (KA220-VET, CBHE, CoVE, etc.). Si el programa cambia de nombre, presupuesto o estructura sin desaparecer, tu acceso se actualiza automáticamente al equivalente y el curso se ajusta. Si el programa desaparece sin equivalente directo (escenario excepcional, típico solo al final del periodo 2021-2027), puedes elegir entre devolución completa o crédito íntegro aplicable a cualquier otra cohorte activa en la plataforma.*

---

## 9. Capacidad operativa

### 9.1 El cuello en el pico

Entre el 10-dic-2026 y el 24-feb-2027 hay hasta **8 cohortes activas en paralelo**. Si cada cohorte tiene 8 clases live × 2h = 16h docencia, son **128 horas de docencia experta concentradas en 11 semanas**.

Con **4-5 profesores disponibles** (incluyendo Oscar), la matemática es:
- 8 cohortes / 4-5 profesores = 1,6-2 cohortes por profesor
- ~25-30h docencia/semana por profesor en pico
- Factible con asignación clara desde septiembre

### 9.2 Capacidad por cohorte

Sin cerrar de momento. Si una cohorte se llena (>45 alumnos), dos opciones:

1. **Subir precio en la siguiente edición** (palanca de precio).
2. **Abrir una segunda edición paralela** con otro profesor (palanca de capacidad).

**Filosofía adoptada**: precio premium desde el inicio + descuento "primer año" para suavizar entrada. Esto evita la subida brutal de precio el año siguiente y crea sensación de oportunidad limitada en el lanzamiento.

### 9.3 Up-sell de consultoría 1:1

Para los alumnos que necesitan más que las 8 clases grupales, oferta de consultorías privadas. Tabla orientativa (a calibrar):

| Producto | Formato | Precio orientativo |
|---|---|---|
| Sesión 1:1 30 min "Quick check" | Vídeo · revisar duda concreta | 80–150 € |
| Sesión 1:1 60 min "Strategy session" | Revisión consortium / partners / target | 200–300 € |
| Pack 3 sesiones | Acompañamiento durante el slot | 500–700 € |
| Revisión completa de propuesta | Lectura + feedback escrito | 800–1.500 € |

Margen alto (>90% sobre la hora del experto) y up-sell natural para perfiles que necesitan más atención.

---

## 10. Estrategia descartada: Early Bird

Inicialmente propuesto como palanca para suavizar el pico operativo y captar antes. **Descartado por Oscar** con razón operativa concreta:

> *No compensa porque tengo que hacer una campaña de captación quizás de interesados en primavera, de captación en verano, para empezar el curso con unas deadlines bastante apretadas.*

La captación primavera-verano + curso con deadline real ya genera urgencia natural (la deadline del cliente final), no hace falta fabricarla con descuentos por anticipación. Decisión revisitable más adelante si la curva de demanda lo justifica.

---

## 11. Pricing definitivo v2

### 11.1 La fórmula

**Precio del slot = función regresiva del presupuesto del proyecto del cliente:**

| Tramo de presupuesto | Tasa marginal | Ejemplo |
|---|---|---|
| 0 – 800.000 € | **1,0 %** | 200k → 2.000 € · 500k → 5.000 € · 800k → 8.000 € |
| 800.000 – 1.500.000 € | **0,7 %** sobre exceso | 1M → 9.400 € · 1,5M → 12.900 € |
| 1.500.000 – 3.000.000 € | **0,5 %** sobre exceso | 2M → 15.400 € · 3M → 20.400 € |
| 3.000.000 € en adelante | **0,3 %** sobre exceso | 4M → 23.400 € · 5M → cap 25.000 € |
| **Cap absoluto** | **25.000 €** | Por encima → consultivo individual |

Datos completos en `data/pricing_v2_regressive.json` y `.csv`.

### 11.2 Discurso al cliente

> *El precio de tu slot es el 1% del presupuesto de tu proyecto. A partir de 800.000€ aplicamos descuentos progresivos para que ningún slot supere los 25.000€. Por encima de ese tamaño hablamos de una propuesta consultiva personalizada, con presupuesto a medida.*

### 11.3 Matriz cohorte × tier (precio del slot, rango)

| Cohorte | XS (<60k) | S (60k–500k) | M (500k–1,5M) | L (≥1,5M) |
|---|---|---|---|---|
| Sport Coop & Capacity | 300€ | 600–4.000€ | — | — |
| Sport Events | — | 2.000–4.500€ | 9.400€ | 12.900€ |
| CBHE | — | 2.000–4.000€ | 6.000–9.400€ | 15.400€ |
| CB Youth + EYT | — | 3.000–4.500€ | 5.000€ | — |
| KA2 Coop+SS+ENGO | 300€ | 600–4.000€ | — | — |
| AoI | — | — | 9.400€ | 12.900–23.400€ |
| CB VET | — | — | 5.000€ | — |
| Teacher Academies | — | — | — | 12.900€ |
| EPSD | — | 4.000€ | — | — |
| EMJM (mixto) | 550€ | — | — | 25.000€ (consultivo) |
| CoVE | — | — | — | 23.400€ |
| European Universities | — | — | — | 25.000€ (consultivo) |

### 11.4 Cómo se sale el cap consultivo del catálogo automático

Los 4 SKUs por encima del cap (CoVE 4M antes de cap, EMJM Mob 5M, EurUniv 6,4M, AoI Blueprint 4M antes) **NO se venden como slot estándar**. Son **propuestas comerciales individuales**:
- Reunión inicial 1:1 con Oscar para entender alcance
- Propuesta a medida (puede incluir slot a 25.000 + consultoría dedicada + revisión exhaustiva)
- Factura individual, contrato consultivo
- Plazo y entrega negociables

El catálogo público muestra "consultivo" en lugar de precio para esos casos. Esto preserva la integridad del catálogo automático y abre canal de venta high-touch para los clientes top.

### 11.5 Modificadores aún por definir (siguiente iteración)

- **Descuento de repetición en familia**: % exacto cuando un cliente compra el 2º/3º/4º slot en la misma cohorte (formación ya pagada). Recomendación inicial: **40-50%** porque la formación pesa ~50% del bundle.
- **Descuento "primer año"**: % aplicado a toda la temporada inaugural para captar cohortes inaugurales. Recomendación inicial: **30-40%**.
- **Precio del curso suelto** (Mecánica 2 - cliente cold que entra solo por Academia): a calibrar entre 49-300€ según cohorte.
- **Precio de consultoría 1:1**: bandas orientativas en §9.3, pendiente concretar.
- **Cap operativo por cohorte**: Sin cerrar. Plan: subir precio si se llena.

---

## 12. Estimaciones económicas (proyección temporada 2026-2027)

### 12.1 Escenario realista (30 alumnos por cohorte ordinaria, 5-10 clientes en consultivas)

| Bloque | Cohortes | Volumen | Slot avg | Facturación |
|---|---|---|---|---|
| **SaaS escalable** (Sport Events, CBHE, CB Youth+EYT, Sport Coop, KA2, CB VET, EPSD, Teacher Acad) | 8 | 30/cohorte | ~5.500 € | **~1.320.000 €** |
| **AoI** (medio escalable) | 1 | 15 clientes | 14.650 € | **~220.000 €** |
| **Premium consultivo** (CoVE, EurUniv, EMJM Mob, AoI Blueprint cap) | mix | 5-10 clientes total | 25.000 € | **~250.000 €** |
| **Ligeros KA210/SSCP** (sub-formato auto-servicio) | sub-cohorte | 50 clientes | 500 € | **~25.000 €** |
| **Up-sell consultoría 1:1, evaluación, partner ads** | — | — | — | **+10–20%** |
| **TOTAL temporada realista** | | | | **~1.815.000–2.000.000 €** |

### 12.2 Comparación con BUSINESS_PLAN.md v2.0

El plan de negocio anterior estimaba 482k–1.200k€. El framework nuevo, con catálogo completo + 12 cohortes + curva regresiva, da **un techo natural de ~2M€/año** si la cobertura es alta y los profesores cubren las 8 cohortes en paralelo.

### 12.3 Escenario conservador

Si solo se llenan al 50% las cohortes y los consultivos cierran 2-3 contratos en lugar de 5-10:
- SaaS escalable: 660.000 €
- AoI: 110.000 €
- Premium consultivo: 100.000 €
- Ligeros: 12.500 €
- **Total: ~880.000 €**

Por encima del realista anterior y por debajo del óptimo del v2 BUSINESS_PLAN. Posición sana para el primer año de mercado.

### 12.4 Costes operativos relevantes

| Concepto | Estimación temporada |
|---|---|
| Profesorado (4-5 expertos × 2 cohortes promedio) | 50.000–80.000 € |
| Producción contenido grabado por cohorte | 30.000–50.000 € (alta) · ~5.000 €/año mantenimiento |
| APIs IA (Anthropic, OpenAI) escalando | 8.000–15.000 € |
| Plataforma (Hetzner, Coolify, Resend, GHL) | 3.000–5.000 € |
| Marketing y campañas segmentadas por cohorte | 15.000–30.000 € |
| Gestoría / legal | 5.000 € |
| **Total** | **~110.000–185.000 €** |

Margen operativo estimado en escenario realista: **80-90%** (alta).

---

## 13. Cómo se ve en la experiencia del cliente

La filosofía es **"tienda con sistema de asesoramiento"**, no catálogo plano de 129 productos. El cliente nunca ve la complejidad combinatoria.

```
Inicio
  ¿Qué quieres presentar?

  ▾ Cohorte (12 opciones agrupadas por tipo)
     CBHE · CB Youth · CB VET · Sport Coop · Sport Events ·
     ENGO · KA220+KA210 · AoI · Teacher Academies ·
     EPSD · CoVE · EMJM
  
  ▾ Presupuesto del proyecto
     XS (<60k) · S (60k-500k) · M (500k-1,5M) · L (≥1,5M)

  → Slot tier S para cohorte CBHE-LA: 4.000€
     · 8 clases live + lecciones grabadas
     · Herramienta + IA + iteración hasta deadline
     · Cohorte 27-oct-2026 a 27-dic-2026
     · Deadline call: 10-feb-2027

  [Comprar slot]   [Más info]   [Probar sandbox primero]
```

### Cuatro entradas naturales al funnel

1. **"Quiero presentar X call"** → entra al selector cohorte → compra slot.
2. **"Quiero aprender Erasmus+"** → entra a la Academia → curso suelto → up-sell slot al final.
3. **"Tengo un proyecto rechazado, mejóralo"** → Evaluador puerta de entrada → identifica familia → slot Premium directo.
4. **"Quiero jugar con la herramienta sin compromiso"** → Sandbox Sport SSCP 30k → graduate cuando tenga proyecto real.

Detalle visual en la presentación HTML/PDF (`web/presentation/efs-pricing-deck.html`).

---

## 14. Próximos pasos del producto (resumen)

Lo que tendría que estar listo para el ciclo 2026-2027:

| Hito | Cuándo | Estado |
|---|---|---|
| Catálogo Erasmus+ 2026 + 2027 ingestados como `intake_programs` | mayo-jun 2026 | pendiente |
| Sistema de cohortes en BD (tabla `cohorts` + relación `slots`) | jun 2026 | pendiente |
| Stripe + facturación por LLC + IVA reverse charge | jun-jul 2026 | pendiente |
| UI selector de cohortes + tier presupuestario | jul 2026 | pendiente |
| Producción contenido grabado de las 12 cohortes | jul-sep 2026 | pendiente |
| Sistema de cohortes en plataforma (asignar profesor, alumnos, calendario clases) | ago 2026 | pendiente |
| Calendario público `/convocatorias-2027` | ago-sep 2026 | pendiente |
| Campañas segmentadas por cohorte en Meta/LinkedIn Ads | sep-oct 2026 | pendiente |
| Apertura primera cohorte (Sport Events) | 8-oct-2026 | pendiente |
| Pico operativo | 10-dic-2026 a 24-feb-2027 | pendiente |

Plan detallado en `docs/ROADMAP_2026_2027.md`.

---

## 15. Decisiones aún abiertas (registro)

Cosas que quedaron sin cerrar y que tendrás que decidir más adelante:

1. **% exacto descuento de repetición** en misma familia (banda 40-50%).
2. **% exacto descuento "primer año"** (banda 30-40%).
3. **Precio del curso suelto** (Mecánica 2): 49–300€ según cohorte.
4. **Cap real por cohorte**: sin cerrar. Plan: dejarlo abierto y subir precio si se llena.
5. **EMJM Design**: mantener en cohorte EMJM, mover a Teacher Academies, o cohorte propia "preparación".
6. **Profesores invitados**: contratos / honorarios / equity.
7. **KA1 a partir de guía 2028**: integrar al catálogo cuando salga.
8. **Calendario público vs sandbox como CTA principal**: A/B test cuando tengamos tráfico.

---

## 16. Anexos

### 16.1 Recursos en el repositorio

| Archivo | Qué es |
|---|---|
| `data/erasmus_plus_2026_calls.*` | Catálogo oficial 2026 (xlsx, csv, json, clean, by_topic, notes) |
| `data/erasmus_plus_2027_calls_speculative.*` | Catálogo 2027 con deadlines (incluye `by_month.json`) |
| `data/pricing_v1_one_percent.json` | Pricing v1 (1% lineal puro) — referencia histórica |
| `data/pricing_v2_regressive.json` | **Pricing v2 definitivo** (curva regresiva + cap 25k) |
| `data/pricing_v2_regressive.csv` | Versión tabular para abrir en Excel |
| `data/cohorts_v1.json` | 12 cohortes con sus deadlines y rangos |
| `data/README.md` | Documentación del directorio |
| `docs/PRICING_FRAMEWORK.md` | **Este documento** |
| `docs/ROADMAP_2026_2027.md` | Plan temporal mes a mes |
| `docs/BUSINESS_OVERVIEW.md` | Documento previo de revisión global del negocio |
| `docs/BUSINESS_PLAN.md` | Plan v2.0 (abril 2026) — referencia histórica |
| `web/presentation/efs-pricing-deck.html` | Presentación visual UX |
| `scripts/process_calls_catalog.js` | Pipeline xlsx → json (parametrizable por año) |
| `scripts/generate_pricing_v1.js` | Generador 1% lineal |
| `scripts/generate_pricing_v2.js` | Generador curva regresiva |

### 16.2 Memorias persistentes asociadas

- `reference_erasmus_2026_catalog` — el catálogo y su pipeline.
- `project_pricing_framework_v1` — decisiones de pricing consolidadas.
- `project_roadmap_2026_2027` — plan temporal ejecutable.
- `project_business_model` — base estratégica (modelo viejo, mantener como referencia histórica).

### 16.3 Para futuras sesiones

Cuando una sesión nueva arranque y el tema sea pricing, cohortes, calendario o lanzamiento:

1. Leer este documento (`PRICING_FRAMEWORK.md`).
2. Leer `ROADMAP_2026_2027.md` para el plan temporal.
3. Cargar las memorias `project_pricing_framework_v1` y `project_roadmap_2026_2027`.
4. Si hay que decidir pricing nuevo, partir de `data/pricing_v2_regressive.json`.

---

*Documento elaborado en sesión interactiva 2026-04-28. Actualizar este archivo cada vez que se cierre una de las decisiones abiertas en §15 o se modifique la curva en §11.*

---

## 17. El Máster como producto del ecosistema (añadido 2026-04-30)

*Ideas surgidas en sesión de pensamiento estratégico Oscar + Claude VPS.*

### 17.1 Decisión de producto

Se está diseñando un **Máster en Gestión de Proyectos Erasmus+** (título propio, 15 ECTS, 6 meses, online, ~2.200€). Es el único máster en el mercado español dedicado exclusivamente a Erasmus+ — todos los competidores cubren "proyectos europeos en general" y diluyen Erasmus+ en 1-2 módulos.

Estructura pedagógica:
- Bloque 0: El ecosistema Erasmus+ (fundamentos)
- Bloque 1: KA1 — Movilidad
- Bloque 2: KA2 — Asociaciones de cooperación (módulo central, 4 ECTS)
- Bloque 3: KA3 — Apoyo a la reforma política
- Bloque 4: Especializaciones (CBHE, CB VET, CB Youth, Sport)
- Bloque 5: Implementación, reporting y auditoría
- TFM: Propuesta real sobre convocatoria abierta

### 17.2 Lógica de compra diferente a los slots

El PRICING_FRAMEWORK está construido sobre la lógica: **el cliente llega con una call en mente → compra un slot → ejecuta con la herramienta → deadline.**

El máster opera sobre una lógica distinta: **el cliente quiere formarse en Erasmus+ como profesión → aprende todo el ecosistema → 6 meses → sale preparado.**

Son dos motivaciones de compra que no se cancelan pero tampoco son idénticas:

| | Slot por cohorte | Máster |
|---|---|---|
| Motivación | Tengo una call concreta y una deadline | Quiero construir una carrera o profesionalizar mi equipo |
| Horizonte | Semanas (deadline del proyecto) | 6 meses |
| Perfil | Organización con proyecto en curso | Profesional o equipo que quiere sistematizar |
| Precio | 1% del presupuesto del proyecto | ~2.200€ fijo |
| Output | Propuesta presentada | Competencia profesional + TFM real |

### 17.3 El máster como fábrica de clientes recurrentes

Un alumni del máster emerge como el cliente ideal para el modelo de slots:
- Ya conoce qué cohortes le interesan (no necesita educarse desde cero en cada slot)
- Sabe usar la herramienta (no abandona en la curva de aprendizaje)
- Confía en EU Funding School como su referencia → compra slots año tras año

**El máster no es el producto principal — es la fábrica de clientes recurrentes de alta calidad.**

### 17.4 Tensión real: doble pago por formación

El slot ya incluye Academia (8 clases live por cohorte). Si un alumni del máster compra un slot, paga dos veces por formación.

**Solución propuesta:** los alumni del máster acceden al slot **sin la Academia** (solo herramienta + IA + soporte de la cohorte). Esto coincide con el "descuento de repetición" del §11.5, que ya está marcado como pendiente de cerrar. Propuesta concreta: **alumni del máster = descuento automático del 40-50% en cualquier slot**, equivalente al peso de la Academia en el bundle.

### 17.5 Riesgo a vigilar

El máster a 2.200€ cubre todo el ecosistema Erasmus+. Para quien tiene una deadline concreta, el slot de esa cohorte ya cubre la misma formación más la herramienta y el acompañamiento — y a veces por menos precio (KA210 SSCP a 300€, Sport Coop a 600€). El máster podría percibirse como "más caro y más lento."

**Conclusión:** el máster tiene sentido como producto siempre que su buyer NO sea el mismo que el buyer del slot. Si alguien quiere presentar una call concreta, el slot es la respuesta. Si alguien quiere construir una carrera o profesionalizar un equipo de forma sistemática, el máster es la respuesta. Los canales de captación deben reflejar esto.

### 17.6 Decisiones abiertas relacionadas con el máster

- Precio exacto del máster (referencia: 1.800–2.400€, con early bird y pago fraccionado)
- % de descuento en slots para alumni del máster
- Si el TFM puede contar como "primer slot" y descontar su coste del primer slot real
- Timing de lanzamiento respecto al ciclo de cohortes 2026-2027
