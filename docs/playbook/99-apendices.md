# Apéndices

---

## Apéndice A · FUN-DESIGN™ en una página

*La página que puedes imprimir, colgar en la pared o poner al final de un deck.*

```
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                            FUN-DESIGN™                                     │
   │                Designing Better European Projects                          │
   │                                                                            │
   │   L   Fase                                Herramienta     Entregable       │
   │   ─   ───────────────────────────────     ────────────    ──────────────   │
   │   F   Find the Opportunity                🔎 EUFinder     Funding Opp.     │
   │   U   Unlock & Share the Project Vision    🔓 EUUnlocker   Project Vision   │
   │   N   Nail Down the Activities            🏗 EUDesigner    Architecture     │
   │   D   Deliver the Concept Note            📨 EUConnector   Concept Note     │
   │   E   Engage the Consortium               🔗 EULinker      Consortium Str.  │
   │   S   Show the European Added Value        🔬 EUResearcher  Added Value      │
   │   I   Integrate the Delivery Plan         🛡 EUAuditor     Delivery Plan    │
   │   G   Generate the Proposal               ✍️ EUWriter      Proposal         │
   │   N   Nurture Future Opportunities         🏆 EUEvaluator   Eval + Improve   │
   │                                                                            │
   │   PRINCIPIO:  No se escribe hasta haber diseñado.                          │
   │   TESIS:      Human + AI. No vendemos IA. Vendemos Better Projects.        │
   └──────────────────────────────────────────────────────────────────────────┘
```

---

## Apéndice B · Glosario

| Término | Definición |
|---------|------------|
| **FUN-DESIGN™** | Metodología propietaria de diseño de proyectos europeos. Acróstico de las 9 etapas F·U·N·D·E·S·I·G·N. |
| **EU Funding Studio** | Nombre del ecosistema y de la metodología. |
| **EU Funding School** | Marca comercial y pública (`eufundingschool.com`): itinerario y certificación. |
| **E+ Tools** | El producto SaaS: la plataforma de diseño, escritura y evaluación. |
| **Libro del proyecto** | El objeto rico (100–200 pág.) que el diseñador construye; la fuente de verdad. La propuesta es su destilación. |
| **Form Part B** | Formulario oficial de la propuesta EACEA. Template universal por tipo de acción (~60–120 págs). |
| **Hechos Invariables** | Afirmaciones "DO NOT CONTRADICT" inyectadas en cada generación para garantizar coherencia. Duros (derivados) y blandos (validados). |
| **Evaluation thinking** | Diseñar la propuesta desde la mente del evaluador, anclando cada sección a su criterio. |
| **Consortium Strategy** | Entregable de la etapa E: el consorcio diseñado y justificado, listo para la sección Partnership. |
| **Design Capacity** | Modelo de negocio: capacidad de diseño acumulada (en € de presupuesto activable) que no caduca. |
| **Activate Proposal** | Acción que consume capacidad. Diseñar es gratis; activar es de pago. |
| **EACEA** | Agencia europea que gestiona y evalúa muchas convocatorias. Su rúbrica (*Guide for Experts*) es la referencia de puntuación. |
| **Drift** | Incoherencia entre secciones de un documento largo generado a trozos. FUN-DESIGN™ lo elimina con Hechos Invariables. |
| **Design Capacity / Certification / Reputation** | Los tres sistemas independientes: lo que compras / lo que consigues / lo que eres. |

---

## Apéndice C · Cómo se implementa FUN-DESIGN™ en E+ Tools

Mapa entre la metodología (las 9 herramientas `EU—`) y el producto real (módulos backend).
Estado a fecha de este borrador.

| Fase | Herramienta | Módulo E+ Tools | Estado |
|------|-------------|-----------------|--------|
| F · Find the Opportunity | 🔎 EUFinder | Base de conocimiento de calls / intake | Conocimiento *Live* · buscador conversacional *Roadmap* |
| U · Unlock the Vision | 🔓 EUUnlocker | Intake + capa de ecosistema/publicación | *Roadmap* |
| N · Nail Down Activities | 🏗 EUDesigner | Intake / Design (M0) | *Live* |
| D · Deliver Concept Note | 📨 EUConnector | Partners (M5) + comunicación | *Roadmap* |
| E · Engage the Consortium | 🔗 EULinker | Partners (M5) + mapa EUAtlas | Atlas *Live* · linking *Roadmap* |
| S · Show Added Value | 🔬 EUResearcher | Research module | *Roadmap* (especificado) |
| I · Integrate Delivery Plan | 🛡 EUAuditor | Planner (M2) + Calculator (M1) | *Live* |
| G · Generate the Proposal | ✍️ EUWriter | Developer (M3) — 4 sub-fases, 25+ dimensiones | *Live* (v2) · export `.docx` *Roadmap* |
| N · Nurture Opportunities | 🏆 EUEvaluator | Evaluator (M4) | *Live* parcial |

> El **Calculator** (M1, Haversine + per diems + WPs) no es una fase visible: es el motor de
> presupuesto que trabaja por debajo de EUDesigner y EUAuditor. **EUAtlas** (mapa MapLibre 2D/3D,
> ~165.000 entidades) es la infraestructura de datos bajo EULinker.

**Piezas transversales del producto:**

- **Canonical Facts / Prompt Inspector** — el "Libro de Hechos del Proyecto" y su
  herramienta de inspección (admin-only). Implementa los Hechos Invariables de la Parte II.
- **Documents** — subida de PDF/DOCX y contexto por proyecto, que alimenta a EUWriter.
- **EUAtlas** — mapa MapLibre 2D/3D sobre ~165.000 entidades geocodificadas.
- **Sandbox demo** — proyecto Small-scale Sports precargado para probar el flujo.

> ℹ️ **Recordatorio de honestidad.** La metodología FUN-DESIGN™ está completa; la plataforma
> se implementa por fases. Este apéndice es la fuente de verdad sobre qué está vivo y qué es
> roadmap — manténlo actualizado conforme la plataforma avance.

---

## Apéndice D · Notas de versión

- **v0.2** — Metodología actualizada a la estructura canónica de las **9 herramientas
  `EU—`** (EUFinder · EUUnlocker · EUDesigner · EUConnector · EULinker · EUResearcher ·
  EUAuditor · EUWriter · EUEvaluator), con las frases FUN-DESIGN™ y los entregables
  encadenados (fuente: *The Philosophy Behind EU Funding Studio*).
- **v0.1** — Primer borrador completo del playbook: manifiesto + 8 partes + apéndices,
  alineado con la documentación del producto (visión, writer, ecosistema, Design Capacity,
  roadmap 2026–2027).

**Pendiente para futuras versiones:**

- Casos prácticos reales (una convocatoria de principio a fin).
- Diagramas e infografías maquetados (los bloques ` ``` ` de este borrador son las
  especificaciones).
- Mockups de la plataforma por etapa.
- Revisión del capítulo de negocio conforme se consolide el pricing.
- Maquetación editorial (portada, tipografía, iconografía propia).

---

← *Anterior:* **[Parte VIII · The Future](08-future.md)**  ·  ↑ *Volver al* **[Índice](README.md)**
