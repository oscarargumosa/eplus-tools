# E+ Tools / EU Funding School — Visión global de negocio

> **Propósito de este documento.** Reunir en un solo sitio TODO lo decidido (y lo contradictorio) sobre modelo de negocio, productos, servicios, funnel, activos estratégicos, costes y posicionamiento, para poder diseñar el pricing con la foto completa.
>
> **Fuentes consolidadas aquí:**
> - `docs/BUSINESS_PLAN.md` (v2.0, abril 2026) — fuente principal y más reciente.
> - Memoria `project_business_model.md` — encuadre 6-fases + Business Model Canvas (versión anterior, diferencias marcadas).
> - Memorias de producto (Writer, Sandbox, Newsletter, Voice, Atlas, Documents, Research, Organizations, Sidebar, Three-phase model, Form Part B, Prep Studio v2, Cascade Writing).
> - Memorias estratégicas (`project_web_ecosystem_strategy`, `project_70k_directory_strategy`, `project_email_strategy`, `project_writer_freemium`, `project_writer_tiers`, `project_infra_roadmap`, `project_vps_ai_architecture`).
> - Estado operativo (`project_current_status`, `project_session_*`, `project_session_20260428_auth_email_google`).
>
> **Última actualización:** 2026-04-28.

---

## 1. Resumen ejecutivo en 7 frases

1. **Producto:** plataforma SaaS para diseñar, escribir, evaluar y mejorar propuestas Erasmus+ de principio a fin, con 7 módulos integrados (Intake, Calculadora, Planificador, Redactor, Evaluador, Entidades, Comunidad).
2. **Posicionamiento:** *no vendemos "una IA que escribe proyectos"*; vendemos infraestructura estratégica para llegar a **propuestas de 90+ puntos** con metodología, criterios y red.
3. **Mercado:** entidades Erasmus+ centralizadas EACEA (ONGs, VETs, empresas, universidades, organizaciones juveniles) en ~130 países elegibles. Comprador real = entidad; usuario = trabajador individual.
4. **Estrategia de entrada año 1 (BUSINESS_PLAN v2.0):** funnel **gratuito al 100%** con *precio tachado siempre visible*; el "pago" es completar el PIF de la entidad → construye dataset y red.
5. **Pricing actual sobre la mesa:** % del presupuesto máximo de la call (referencia 400.000€) → Básico 0,5% (2.000€), Premium 2% (8.000€), Colaboración 1%+1% éxito (4k+4k), Shadow 3% solo si aprobado (12.000€).
6. **Servicios complementarios:** Evaluación IA 150€/proyecto, Entidad Socia Premium 750€/año (precio fundador), masterclasses gratuitas como captación.
7. **Activos / moats:** dataset propio (cada evaluación lo alimenta), red de entidades socias garantizadas en consorcio, conocimiento profundo EACEA, directorio europeo ~70k entidades, acceso directo a leads (Facebook + ONG directories).

---

## 2. ⚠️ Tensiones a resolver ANTES de cerrar pricing

Hay decisiones que aparecen contradictorias en distintos documentos. Es importante zanjarlas antes del diseño.

### 2.1 ¿Año 1 = 100% gratis vs Año 1 = caja real?

| Fuente | Postura |
|---|---|
| `docs/BUSINESS_PLAN.md` §3.1 | **"Acceso gratuito (año 1)"** — plataforma 100% sin coste, evaluación gratis, escritura gratis. El pago aparece "para la siguiente convocatoria". |
| `docs/BUSINESS_PLAN.md` §5 (Estimación Económica Año 1) | Ingresos año 1 = 482k–1.200k € incluyendo Plan Básico, Premium, Evaluaciones, Colaboración y Shadow. **Esto solo cuadra si el funnel gratuito caduca antes de que termine el año** o si conviven cohortes (early gratis + nuevas calls de pago). |
| Memoria `project_business_model.md` (versión vieja) | Vende formación, licencias, evaluaciones, upgrade y partnerships **desde el inicio**. No habla de año 1 gratis. |
| Memoria `project_web_ecosystem_strategy.md` (web) | **Fase 1 (web): zero sales.** Fase 2 (6-12 meses): course 49-149€. *Este eje es la web, NO el tool — pero conviene alinear narrativa.* |
| Memoria `project_writer_freemium.md` | Capping freemium "DESPUÉS de terminar la experiencia al 100%, no antes". |

**Pregunta a resolver:** ¿el funnel gratuito **cierra después de la primera call** del usuario (es decir, cobramos a partir de la segunda call que use), o **toda la primera ronda 2026 es gratis** y el pago empieza en 2027?

### 2.2 Pricing por % de la call vs Pricing fijo por tier

| Fuente | Postura |
|---|---|
| `BUSINESS_PLAN.md` §3.2 | **% del presupuesto máximo** de la call (0,5% / 2% / 1%+1% / 3%). Lógica: a mayor presupuesto, mayor precio automático; el cliente compara con grant, no con software. |
| Memoria `project_writer_freemium.md` | "Pricing Pro €1.500–4.000 por propuesta" — pricing **por propuesta** sin referencia a % de la call. |
| Memoria `project_business_model.md` | Habla de "1% upfront + 1% si aprobado" para Success Partnership y "1,5% del presupuesto" para Proposal Upgrade. Coherente con %. |
| Memoria `project_writer_tiers.md` | "Premium = paid subscription", "Standard = included or low cost" — vocabulario suscripción, no por proyecto. |

**Pregunta a resolver:** ¿el modelo es **suscripción anual por call/familia** (lo que dice BUSINESS_PLAN §3.2: "2.000€/año/call"), **pago por propuesta concreta**, o **híbrido**? Las tres versiones aparecen en distintos sitios.

### 2.3 Free tier infinito vs límites por proyecto/refinados

| Fuente | Postura |
|---|---|
| `BUSINESS_PLAN.md` §3.1 | "Plataforma al 100% — IA sin limitaciones, **1 proyecto activo**". |
| Memoria `project_writer_freemium.md` | Métrica de capado = "refinados por sección por mes (no tokens)". Ejemplo: Free 2/sección/mes, Pro ilimitado. Circuit breaker global 50 refinados/usuario/día. |
| Memoria `project_current_status.md` | "Refine cap" 50/día implementado. Tier caps NO. |

**Pregunta a resolver:** los límites del free tier, ¿se expresan como **número de proyectos activos** (orientado a entidad), como **refinados por sección/mes** (orientado a uso de IA), o ambos?

### 2.4 Writer Premium vs Standard

| Fuente | Postura |
|---|---|
| Memoria `project_writer_tiers.md` (20 días) | Dos tiers: Premium (mejor IA + full context: criterios, docs vectorizados, research, intake) → 90+ puntos; Standard (IA base + intake) → 80-85 puntos. |
| Memoria `project_writer_freemium.md` (6 días, más reciente) | **TODO Claude Sonnet 4 sin diferenciación**, decisión: "priorizar calidad máxima". Margen irrelevante al ticket Pro. |

**Implicación:** la diferenciación Premium/Standard ya **no es por modelo de IA**, sino que está abierta. Opciones que quedan vivas:
- Diferenciar por **profundidad de contexto** inyectado en los prompts (Premium accede a criterios, RAG de call_documents, research vectorizada; Standard solo intake).
- Diferenciar por **número de iteraciones / refinados**.
- Diferenciar por **velocidad / prioridad de cola**.
- Diferenciar por **acceso a módulos** (Premium = Evaluador + Research + Atlas; Standard = solo Writer básico).
- Diferenciar por **derecho a entrar en consorcio** (Premium = Entidad Socia incluida; Básico = no).

**Pregunta a resolver:** ¿qué diferencia exactamente Básico de Premium en el tool, hoy que la IA es la misma?

### 2.5 Producto core: 7 módulos integrados o 3 fases (Design → Write → Evaluate)?

| Fuente | Postura |
|---|---|
| `BUSINESS_PLAN.md` §1 | "**7 módulos**: Intake, Calculadora, Planificador, Redactor, Evaluador, Entidades, Comunidad". |
| Memoria `project_three_phases.md` | "Producto en **3 fases**: Design (Intake) → Write (Developer) → Evaluate". |
| `docs/CLAUDE.md` | "Módulos M0-M5 (intake, calculator, planner, developer, evaluator, partners)". 6 módulos backend, sin "Comunidad". |
| Memoria `project_sidebar_structure.md` | Sidebar = Proposal Builder (Design/Write/Evaluate) + Organization + Library. **3 secciones**, no 7 módulos. |

**Implicación práctica para pricing:** la narrativa comercial puede usar 3 fases (más vendible y memorizable), pero internamente hay 6-7 piezas. Conviene decidir en qué nivel se empaqueta el pricing.

### 2.6 Comunidad y Formación: ¿son producto o son captación?

| Fuente | Postura |
|---|---|
| `BUSINESS_PLAN.md` §1 | "Comunidad" es **uno de los 7 módulos del producto**. |
| `BUSINESS_PLAN.md` §4.1 | "Cursos de formación por call" = línea de ingreso año 1. |
| `BUSINESS_PLAN.md` §7.3 | Masterclasses gratuitas como captación, "potencial de pago futuro". |
| Memoria `project_web_ecosystem_strategy.md` | Phase 2 (6-12 meses): course MVP €49-149. |
| Memoria `project_business_model.md` | "A) Formación por call + acceso a la tool" como gancho de entrada de pago. |

**Pregunta a resolver:** ¿la formación es producto de pago (curso por call), captación gratuita (masterclass), o ambos en cohortes distintas?

---

## 3. Posicionamiento y mensaje

### 3.1 Frase central

> *"Aprender → Construir → Evaluar → Mejorar → Ganar → Conectar"*
> *(de `project_business_model.md`)*

### 3.2 Narrativa pública (BUSINESS_PLAN §1)

> "**E+ Tools** es una plataforma SaaS para gestionar proyectos de financiación europea (Erasmus+) de principio a fin. La competencia vende PDFs y herramientas separadas. E+ Tools vende el flujo completo sin fricción, con IA que maximiza la puntuación del proyecto."

### 3.3 Diferenciadores estratégicos

1. **Profundidad de contexto** (no "más barato", sino "más informado"): criterios EACEA reales, docs vectorizados, research, intake.
2. **Intensidad de optimización**: el Básico no es malo, el Premium activa más capas de análisis y refinamiento.
3. **La creatividad sigue siendo del applicant**: la herramienta no fabrica ideas, estructura y optimiza ideas humanas.
4. **15 años de experiencia real** (Oscar) detrás de la metodología.
5. **Único modelo del mercado** que ofrece **garantía de socio en consorcio** (Entidad Socia Premium / Partner Pool).

---

## 4. Mercado y segmentos

### 4.1 Cliente

**Comprador real = la entidad.** **Usuario = trabajador individual** dentro de la entidad. El user prueba gratis → se engancha → convence a su organización de pagar.

### 4.2 Segmentos

| Segmento | Tipo | Comportamiento esperado |
|---|---|---|
| ONGs | Volumen | Plan Básico, formación, evaluación |
| Centros VET | Volumen / Premium | Plan Premium en CoVE/Capacity Building |
| Empresas con actividad europea | Premium | Plan Premium / Colaboración |
| Universidades | Premium | Plan Premium / consorcios |
| Organizaciones juveniles | Volumen | KA3 Youth Together |
| Consultores junior / freelance | Captación | Formación + uso de la tool con varias entidades (modelo Scribe/Writer) |

### 4.3 Canales de adquisición disponibles HOY

- **Grupos de Facebook** con miles de coordinadores Erasmus+ activos (acceso directo, coste 0).
- **Directorios de ONGs europeas** (leads cualificados con contacto directo).
- **Red propia** de Oscar (15 años en el sector).
- **Directorio ORS scrapeado ~70.000 entidades** (USO RESTRINGIDO — ver §6).
- **WordPress + blog** `eufundingschool.com` con SEO y newsletter (cold list construyéndose desde abril 2026).

### 4.4 Convocatorias objetivo año 1 (9 calls)

| Call | Tipo | Presupuesto promedio |
|---|---|---|
| KA3 Youth Together | Juventud | 400k€ |
| Capacity Building VET × 4 | Formación profesional | 400k€ |
| Sports × 3 | Deporte (Small-scale Sports KA210-YOU ya está en Live) | 60k€-400k€ |
| CoVE | Excelencia VET | hasta 4M€ |

**Nota:** CoVE puede ser hasta **4M€** → si el pricing es % de la call, una sola CoVE Premium = 80.000€.

---

## 5. Inventario de productos y servicios

### 5.1 Módulos del producto (lo que vive en el tool)

| Módulo | Estado | Función |
|---|---|---|
| **Intake (Design)** | Live | Captura de requisitos del proyecto: programa, datos, consorcio, contexto, partners, actividades, presupuesto. Output = "skeleton con números reales". |
| **Calculadora** | Live | Presupuesto EACEA-compliant: tarifas, rutas (Haversine geodésica oficial), per diems, WPs, actividades. |
| **Planificador** | Parcial | Timeline + Gantt + asignación temporal. |
| **Redactor (Writer/Developer)** | Live (v2 overhaul 2026-04-22) | Generación cascada sección a sección de Form Part B EACEA, **Evaluar y Refinar con IA** (3 actos), **Mejorar con IA** (instrucción manual). Per-WP dynamic sections. Iteration tracker. |
| **Evaluador** | Live (parcial) | Scoring contra criterios EACEA reales. Briefs narrativos (5 campos: intent / elements / examples / avoid / weak-strong). |
| **Entidades / Organizations** | Live | Gestión de socios, claim model (unclaimed / claimed_provisional / verified), access modes (open / request / closed), org PIF variants reusables. |
| **Atlas** | Live (2026-04-26) | MapLibre 2D/3D mundial, ~165k entidades geocoded, clustering nativo, popup rico. |
| **Directorio público** | Live | Buscador de entidades + ficha pública + visibilidad por tier. |
| **Documents** | Live | Upload PDF/DOCX, vectorización local (384-dim), RAG por proyecto. |
| **Research** | Spec (no construido) | Paper finder OpenAlex, librería vectorizada, RAG, harvest nightly. Spec en `docs/RESEARCH_MODULE.md`. |
| **Sandbox demo** | Live | Proyecto pre-cargado Small-scale Sports, banner MODO DEMO, graduate, launch lock. Pieza clave del funnel cold→warm. |
| **Voice Input** | Live | Whisper + auto-traducción al idioma del proyecto. Activado en todos los textareas dinámicamente. |
| **Form Part B builder (WP form)** | Live (2026-04-26) | 5 cards estructuradas (Header / Tasks / Milestones / Deliverables / Budget) + AI fill maestro. Cap 15 deliverables por proyecto con Hamilton allocation. |
| **Prep Studio v2** | Live | 5 tabs (Consorcio / Presupuesto / Relevancia / Actividades / Análisis) con PIF variants y enriched AI context. |
| **Newsletter / Subscribers** | Live | Captura local + sync centralize.es (LeadConnector). Tags efs:cold/warm/hot promocionados automáticamente. |
| **Auth + Email + Google** | Live (commit dev-local pendiente push) | Email verification, password reset (Resend), Google OAuth, scribe role, 8h sessions. |
| **Sidebar** | Live | Proposal Builder (Design/Write/Evaluate) + Organization + Library + Admin. |

### 5.2 Activos extra-tool

| Activo | Estado | Valor |
|---|---|---|
| **Web `eufundingschool.com`** (WP child theme `astra-eufunding`, monorepo) | Live, top bar común con tool | Motor SEO, newsletter, blog, masterclasses |
| **Directorio ORS ~70k entidades** | Vive en `dev-vps`, geocoded | Activo interno: matchmaking de partners, custom audiences, enriquecimiento de fichas |
| **Form Part B EACEA template** (`docs/form_part_b_eacea.json`) | Live | Universal para todas las calls EACEA |
| **64 criterios Sports KA210** ingestados desde brief | Live | Empieza a alimentar el evaluador |
| **Video ecosystem** (Remotion + ElevenLabs) | Pipeline construido | Lecciones / social media |
| **Brand alineada** (paleta, tokens, Poppins) | Live (con Ana) | Cohesión tool + WP + presentaciones |
| **Entidad Socia Premium / Partner Pool** | Plan no implementado | Producto premium principal de margen |

### 5.3 Servicios de pago propuestos (BUSINESS_PLAN v2.0)

#### A) Planes recurrentes anuales por call

| Plan | Incluye | % del presupuesto máximo | Precio (call de 400k€) |
|---|---|---|---|
| **Básico** | Formación incluida + licencia IA limitada | 0,5% | 2.000€/año/call |
| **Premium** | Máxima potencia IA | 2% | 8.000€/año/call |
| **Colaboración** | Premium + entidad socia nuestra + persistencia 3 calls | 1% + 1% éxito | 4.000€ + 4.000€ si aprobado |
| **Shadow** *(no público)* | Solo si aprobado + entidad socia + persistencia | 3% solo si aprobado | 12.000€ si aprobado |

#### B) Servicios sueltos

| Servicio | Precio actual propuesto | Notas |
|---|---|---|
| Evaluación IA automática | 150€/proyecto | Gratis año 1 con PIF completo. Alimenta dataset. |
| Entidad Socia Premium | 750€/año (precio fundador) | Garantía de ser socio en mínimo 1 proyecto/año. 4-5 plazas por país. |
| Masterclass por call | Gratis (registro) | Captación. Conversión esperada 10-15% al Plan Básico. |
| Curso por call (formación) | (no fijado) | Línea de ingreso año 1. Posible 49-149€ según `web_ecosystem_strategy`. |
| Asesoría individual | Por sesión / hora | Mencionada en `project_business_model.md`, no fijada. |

#### C) Servicios premium del modelo viejo (memoria `project_business_model`) que no aparecen ya en BUSINESS_PLAN v2 — decidir si siguen vivos

| Servicio | Cómo se planteaba |
|---|---|
| **Proposal Upgrade** | Mejora intensiva de propuesta concreta, ~1,5% del presupuesto |
| **Success Partnership** | 1% upfront + 1% si aprobado, hasta 3 años, re-presentación |
| **Partnership Track** | Sin pago inicial, 2% success fee + presencia en consorcios |
| **Servicios express KA1** | Precio cerrado por proyecto (caja rápida, centros escolares) |

**Implicación:** algunas se han renombrado en v2 (Colaboración ≈ Partnership Track + Success Partnership), otras (Proposal Upgrade, KA1 express) no aparecen.

### 5.4 Modelo de escasez por call (BUSINESS_PLAN §4.3)

- **Máx 20 plazas Plan Básico** por convocatoria
- **Máx 10 plazas Plan Premium** por convocatoria
- **4-5 Entidades Socias Premium** por país

Funciones: urgencia de compra, calidad operativa, justifica subida futura.

---

## 6. Funnel y modelo de adquisición

### 6.1 Funnel principal (BUSINESS_PLAN §6)

```
[Captación]
  Grupos FB / directorios / SEO / masterclass
        ↓
[Sandbox demo]  (Small-scale Sports pre-cargado, MODO DEMO, graduate)
        ↓
[Registro + email verify + Google OAuth]
        ↓
[Tag: efs:warm]
        ↓
[PIF de la entidad completo]  ← muro de fricción del tier gratuito
        ↓
[Evaluación IA gratuita]    [dataset + enganche]
        ↓
[Proyecto escrito gratis]   [dependencia + trabajo invertido]
        ↓
[Tag: efs:hot]
        ↓
[Campaña post-proyecto automática]
  - "Tu proyecto puntuó X/100"
  - "Ahorraste N horas"
  - "Siguiente call abre en X semanas"
  - Llamada de venta agendable
        ↓
[Conversión licencia de pago siguiente call]
```

### 6.2 Métricas para introducir precios (BUSINESS_PLAN §6.2)

No hay fecha fija — hay umbrales:

| Métrica | Umbral |
|---|---|
| Entidades con perfil completo | +200 |
| Proyectos escritos completos | +50 |
| Proyectos aprobados con E+ Tools | +3 |
| Tasa de respuesta a campaña post-proyecto | +20% |

### 6.3 Viral loop integrado

Cada proyecto necesita 4+ socios. Invitar socios al consorcio es flujo natural → socios no registrados reciben invitación → crean perfil → entran al funnel.

### 6.4 Estrategia web (Phase 1 fase organic-only)

- Blog + newsletter = motor de captación.
- Intake como **sandbox** ("juega y aprende"), NO como producto en fase 1.
- 3 listas tags: cold (form WP) → warm (signup tool) → hot (proyecto real).
- First tactical target: CoVE Sept 2026.
- Provider email: Resend (transactional) + GHL/centralize (marketing). Nunca mezclar.

### 6.5 Restricción crítica del 70k directorio

**NUNCA mass mailing.** Solo:
1. Asset interno del tool (Partner matchmaking).
2. Custom Audiences en Meta/LinkedIn Ads.
3. Cold outreach 1-a-1 personalizado (50-100/día max).
4. Enriquecimiento de fichas de Organizations.

Razones: RGPD, reputación dominio, blacklists, cierre de cuenta CRM.

---

## 7. Estimaciones económicas (BUSINESS_PLAN §5)

### 7.1 Tres escenarios año 1

| Escenario | Plan Básico | Plan Premium | Total estimado |
|---|---|---|---|
| Conservador (40% ocupación) | 72 entidades · 144k€ | 36 entidades · 288k€ | **~482k€** |
| Realista (70% ocupación) | 120 · 240k€ | 60 · 480k€ | **~789,5k€** |
| Óptimo (100% ocupación) | 180 · 360k€ | 90 · 720k€ | **~1.200k€** |

### 7.2 Costes año 1

| Concepto | Coste |
|---|---|
| APIs IA + ElevenLabs | 5.000€ |
| Infraestructura VPS/Coolify | 2.400€ |
| Marketing 9 lanzamientos | 9.000€ |
| Herramientas SaaS | 2.000€ |
| Gestoría / legal | 3.000€ |
| **Total** | **21.400€** |

*(no incluye personal — asume fundador con apoyo IA)*

### 7.3 Beneficio bruto

| Escenario | Beneficio |
|---|---|
| Conservador | 460,6k€ |
| Realista | 768,1k€ |
| Óptimo | 1.178,6k€ |

### 7.4 COGS por uso de IA (memoria `writer_freemium`)

- Ciclo Evaluar+Refinar = 3 llamadas Claude Sonnet 4 ≈ **0,08 USD**
- Decisión: priorizar calidad máxima (no Gemini, no prompt caching). Margen irrelevante al ticket.
- Circuit breaker: 50 refinados/usuario/día (ya implementado).
- Tier caps por sección/mes: pendiente.

---

## 8. Modelo Usuario / Entidad y roles

### 8.1 Estructura de datos

```
Usuario (persona física)
    └── puede pertenecer a N entidades con roles distintos

Entidad (organización)
    ├── tiene N usuarios
    ├── tiene sus proyectos, PIF, documentación propia
    └── identificada por OID o PIC europeo

Proyecto
    └── pertenece al USUARIO creador (privado por defecto)
```

### 8.2 La licencia va ligada a la entidad, no al usuario

Una entidad paga por una call → cuántos usuarios tenga es irrelevante. Esto simplifica pricing y es lo que esperan las organizaciones.

### 8.3 Roles dentro de una entidad

| Rol | Quién | Permisos |
|---|---|---|
| Legal Rep | Director, presidente | Firmar, aprobar, transferir ownership |
| Admin | Coordinador de proyectos | Todo lo operativo |
| Writer | Escriba interno o externo | Redactar proyectos asignados |

**Roles de plataforma (`users.role`):**
- `user` — usuario normal
- `admin` — Oscar (full power)
- `writer` — escriba (legacy, en revisión)
- `scribe` — usuario de data-entry con acceso solo a Admin → Data E+ (calls, eligibility, criterios). Migración 093.

### 8.4 Registro sin verificación

3 campos: email + nombre + OID o nombre de entidad. Sin verificación EU Login en fase 1 (la fricción mataría adopción). Verificación formal solo cuando hay dinero en juego (pago licencia o consorcio real).

### 8.5 Modelo de claim de entidades

| Estado | Significado |
|---|---|
| `unclaimed` | Solo en catálogo ORS, sin user vinculado |
| `claimed_provisional` | 1+ users la han reclamado sin verificación |
| `verified` | 1 user verificado por Oscar manualmente; los demás bajan a collaborator |

| Access mode | Quién puede usarla |
|---|---|
| `open` | Cualquiera (default unclaimed) |
| `request` | Bajo aprobación admin |
| `closed` | Solo collaborators invitados (default claimed) |

---

## 9. Activos estratégicos / Moats

### 9.1 Foso económico que crece solo

1. **Dataset propio** — cada evaluación alimenta el modelo. A más datos, mejor IA, mayor ventaja.
2. **Red de entidades socias** — nadie más en Europa garantiza ser socio en un consorcio.
3. **Conocimiento profundo Erasmus+** — elegibilidad, criterios EACEA, formatos. Barrera de entrada alta.
4. **Acceso directo al mercado** — grupos FB + directorio ORS ya disponibles.
5. **Modelo alineado con éxito del cliente** — Colaboración / Shadow solo cobra si aprueba.
6. **Directorio europeo de entidades** — activo de datos que no existe accesible.

### 9.2 Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Free tier resuelve y no convierte | Muro de pago en exportación y consorcio |
| Tasa de aprobación baja afecta ingresos variables | 87% ingresos garantizados, solo 13% variable |
| Difícil llenar plazas en calls nicho | Empezar KA3 + Sports (más comunidad) |
| Complejidad operativa Shadow | Sistema interno desde día 1, máx 10 Shadow año 1 |
| Subida precio Entidad Socia genera bajas | Precio fundador garantizado por contrato 2 años |

---

## 10. Estructura societaria

- **LLC americana existente** gestiona los ingresos.
- B2B europeo aplica reverse charge IVA → no requiere registro IVA UE en primeros años.
- **SL operativa española** cuando ingresos B2B España >50k€/año.
- **No crear holding ahora.** La LLC actúa como holding natural si surgen múltiples productos.
- Estrategia salida: SaaS vertical en nicho regulado con dataset propio → múltiplo 5-10× ARR. Comprador estratégico (organismo europeo / editorial educativa) > comprador financiero.

---

## 11. Estado operativo actual (snapshot)

### 11.1 Producto (al cierre de 2026-04-28)

- ✅ Intake, Calculator, Writer (cascade + WP form 5 cards + Evaluar y Refinar + Mejorar con IA), Evaluator, Organizations, Atlas, Documents, Sandbox, Newsletter, Voice — todos en producción.
- ✅ Auth + Email verify + Password reset + Google OAuth + Scribe role — committed dev-local, **pendiente MERGE**.
- ✅ Top bar común WP+tool — desplegado en `intake.eufundingschool.com`. Pendiente prod WP por secretos GitHub Actions.
- ✅ Brand alineada con Ana (paleta, tokens, Poppins).
- ⏳ Research module — spec hecho, no construido.
- ⏳ Form Part B export `.docx` — diferido.
- ⏳ Pricing/billing/Stripe — no implementado.
- ⏳ PIF como muro de acceso al tier gratuito — no implementado.
- ⏳ Precio tachado siempre visible — no implementado.
- ⏳ Campaña post-proyecto automática — no implementada.
- ⏳ Sistema de pagos (Stripe) — no configurado.

### 11.2 Web

- ✅ `eufundingschool.com` (WP + child theme astra-eufunding monorepo).
- ✅ Newsletter capture + GHL/centralize sync funcional (tags cold/warm/hot promocionados).
- ✅ Política de privacidad publicada.
- ✅ Blog estructura local lista, primer artículo pillar en draft.
- ⏳ Despliegue automático del child theme via GitHub Actions — bloqueado por 5 secretos no configurados.

### 11.3 Infra

- VPS Hetzner CX43 (16GB Falkenstein); IP: ver nota interna del VPS.
- Coolify auto-deploy desde main.
- MySQL en contenedor `wordpress-eufunding-db-1`, BD `eplus_tools`.
- Resend transactional (domain verified abril 2026).
- centralize.es (LeadConnector) marketing.
- Stack IA: Anthropic Claude Sonnet 4 (writer/evaluator), OpenAI Whisper (voice), ElevenLabs (TTS videos), embeddings locales 384-dim.

### 11.4 Datos

- 64 criterios Sports KA210 ingestados en Live.
- ~70k–165k entities en directorio ORS (dev-vps), geocoded.
- Test projects: VocAI (KA2 CoVE), NOVA (full draft 6 WPs / 12 actividades / 3 clusters), `bicicle 2` (proyecto de prueba real).

---

## 12. Apéndice — Preguntas abiertas para diseñar pricing

Para cerrar el pricing necesitas decisiones explícitas en estos 12 ejes. Las contradicciones de §2 derivan de no haberlas zanjado todavía.

### A. Eje temporal del free tier
- A1. ¿Cuándo termina el funnel gratuito? (al final de la primera call del usuario / al final de 2026 / nunca, hay free tier permanente / fin de un trial de N meses)
- A2. ¿La gratuidad es total o degradada? (todo gratis con PIF / gratis pero solo 1 proyecto activo / freemium con caps en refinados)

### B. Unidad de cobro
- B1. ¿Suscripción anual por call/familia, pago por propuesta, o suscripción mensual de la entidad sin atar a call?
- B2. ¿Una entidad con licencia Premium para CoVE puede usar la tool para Sports gratis, paga aparte, o requiere licencia separada?

### C. Eje de pricing
- C1. ¿% del presupuesto máximo de la call (lógica BUSINESS_PLAN) o tier fijo en €?
- C2. Si es %, ¿se calcula sobre el techo oficial de la call o sobre el presupuesto real del proyecto del usuario?
- C3. ¿Se aplica el modelo de escasez (20 Básico / 10 Premium por call) o no?

### D. Diferenciación Básico vs Premium (ahora que la IA es la misma)
- D1. ¿Profundidad de contexto inyectado en prompts? (Premium con criterios + RAG docs + research; Básico con solo intake)
- D2. ¿Número de iteraciones / refinados/sección/mes?
- D3. ¿Acceso a módulos? (Premium = Evaluador + Atlas + Research; Básico = Writer básico)
- D4. ¿Velocidad / prioridad de cola?
- D5. ¿Derecho a Entidad Socia incluida?

### E. Servicios premium: cuáles siguen vivos
- E1. ¿Sigue Proposal Upgrade (1,5% del presupuesto, mejora intensiva puntual) o se absorbe en Premium?
- E2. ¿Success Partnership (1%+1%) y Plan Colaboración del nuevo plan son lo mismo?
- E3. ¿Servicios express KA1 (caja rápida) entran o quedan fuera?
- E4. ¿Asesorías individuales tienen precio definido?

### F. Formación
- F1. ¿Curso por call es producto de pago (e.g. 49-149€) o gancho gratuito?
- F2. ¿Se incluye en Plan Básico/Premium o se vende suelto?
- F3. ¿Formación universal vs por call (ROI distinto)?

### G. Entidad Socia Premium / Partner Pool
- G1. ¿750€/año precio fundador es punto de entrada o ya el precio definitivo?
- G2. ¿Cuántas plazas reales hay año 1 (4-5 por país × cuántos países)?
- G3. ¿La garantía es 1 proyecto/año, o 1 oportunidad de proyecto/año (no garantía de aprobación)?

### H. Evaluación IA suelta
- H1. 150€/proyecto si se aplica fuera del plan de pago, ¿incluye iteraciones o solo 1 evaluación inicial?
- H2. ¿Gratis indefinido para entidades con PIF completo (lo que dice BUSINESS_PLAN §3.1) o solo año 1?

### I. Modelo de propiedad de licencia
- I1. La licencia es de la entidad. Pero si una entidad tiene licencia Premium y un usuario freelance la usa para varias entidades, ¿se permite?
- I2. ¿Cómo se gestiona el caso freelance (Scribe / Writer externo) que rota entre entidades?

### J. Pricing de calls grandes (CoVE 4M€)
- J1. ¿% lineal? (CoVE Premium = 80.000€ — ticket muy alto, mercado consultivo)
- J2. ¿Cap en € absoluto? (e.g. máximo 15.000€/call independiente del tamaño)
- J3. ¿Tier Enterprise específico para calls >1M€?

### K. Métricas de éxito y ajuste
- K1. ¿Subida progresiva de precios año 2-3 ya planeada en pricing?
- K2. ¿Cómo se contractualiza el precio fundador (Entidad Socia) durante 2 años?

### L. Stripe / billing
- L1. ¿Pago por adelantado anual o mensual?
- L2. ¿Reembolso si la call no se llega a presentar?
- L3. ¿Pricing diferente en USD/EUR según LLC americana o IVA reverse charge?

---

## 13. Próximos pasos sugeridos

1. **Resolver las 12 preguntas del Apéndice §12** (al menos las A-D, que son las estructurales).
2. **Decidir si esta segunda capa de pricing reemplaza o convive con BUSINESS_PLAN v2.0** — si reemplaza, archivar BUSINESS_PLAN.md y subir este documento como v3.
3. **Validar contra la base instalada actual** (proyectos en Live: VocAI, NOVA, bicicle 2) cuánto pagaría hoy Oscar por cada uno con el nuevo modelo, para sanity-check.
4. **Implementar PIF como muro del tier gratuito** (BUSINESS_PLAN §11) — necesario para el funnel.
5. **Diseñar UI del precio tachado** ("Estás usando el plan KA3 valorado en 8.000€ — gratis durante tu primer proyecto") — clave para preparar la conversión.
6. **Configurar Stripe** y plan de invoicing por LLC americana (reverse charge UE B2B).

---

*Documento vivo. Actualizar cuando se cierren las preguntas del §12.*
