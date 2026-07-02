# Ecosistema Call Center + Escribas — Las dos máquinas conectadas

*Sesión de pensamiento estratégico Oscar + Claude · 2026-06-27*
*Borrador de trabajo. Captura el modelo tal y como lo razonó Oscar, con la unit economics validada y los riesgos marcados. No sustituye a `PRICING_v2_CREDITS.md` ni a `ROADMAP_2026_2027.md`: se conecta con ellos (el SaaS que se vende aquí es el de ese pricing).*

---

## 0. La idea en una frase

EU Funding School monta **un solo sistema con dos máquinas que se alimentan entre sí**:

> **Call center = motor de DEMANDA.** Recluta socios premium, vende el SaaS, capta entidades para actividades y para la red europea.
> **Escribas = motor de OFERTA.** Escriben los proyectos donde esos socios premium pagan por entrar.

No son dos líneas de negocio sueltas. Son un **flywheel de dos lados**: el call center llena los slots que las escribas monetizan, y cada socio premium contento es un caso de éxito que el call center usa para reclutar al siguiente.

```
   ┌──────────────────────────────────────────────────────────┐
   │                                                          │
   │   CALL CENTER (demanda)            ESCRIBAS (oferta)      │
   │   ─────────────────────            ────────────────       │
   │   · Recluta socios premium  ─────► · Escriben proyectos   │
   │   · Vende SaaS                      de €250k con el SaaS   │
   │   · Capta para actividades   ◄───── · Socios premium      │
   │   · Engorda la red europea          entran pagando        │
   │                                                          │
   │        ▲                                   │             │
   │        └────── caso de éxito ◄─────────────┘             │
   │              (socio contento = prueba social)            │
   └──────────────────────────────────────────────────────────┘
```

**La ventaja defensible que sostiene todo:** la herramienta paralela (cloud) que rankea cada entidad por fondos conseguidos, proyectos presentados, socios y coordinaciones. Permite llamar a las top ~150 entidades por país, segmentadas por tipo (Universidad / FP / ONG / escuelas), sabiendo de antemano que son de alta capacidad. Nadie más en el espacio tiene esa lista priorizada.

---

## 0.5 · Secuencia de crecimiento — ORDEN MAESTRO DE PRIORIDADES

> Decidido por Oscar el 2026-06-27. **Este es el orden. Las ideas nuevas que vayan surgiendo se encajan dentro de estas fases, no las adelantan.** Sirve como ancla anti-dispersión.

El orden no es arbitrario: sigue la cadena de dependencias del flywheel. **No se puede vender lo que no está terminado (Fase 1); no se puede activar la oferta de escribas sin la demanda de socios premium que genera el call center (Fase 2).** Producto → motor de demanda → motor de oferta.

### Fase 1 — PRODUCTO: desarrollar en profundidad el SaaS de EU Funding School
Hasta tener el producto que se quiere comercializar y vender. Tres capacidades:
1. **Escribir** distintos tipos de proyectos (Writer por línea/programa).
2. **Evaluar** proyectos (Diagnose & Improve — TASK-007).
3. **Academia** con los 4 tipos de cursos.

- **Por qué primero:** sin producto terminado no hay nada que vender ni que enseñar; las Fases 2 y 3 se apoyan en él.
- **Riesgo a vigilar:** *perfeccionismo / scope infinito.* Es la fase más larga y la más fácil de estirar para siempre. Definir un "producto vendible mínimo" por capacidad y congelarlo; no perseguir el 100% antes de pasar a vender.
- **Solape sano:** se puede hacer **pre-validación** con los socios y escribas actuales mientras se construye, sin abrir aún el motor comercial.

### Fase 2 — VENDER: motor de demanda (call center + marketing)
Vender, desarrollar y **formar a 1-3 personas** para hacer llamadas + campañas + publicidad.

- **Por qué segundo:** es el motor de demanda. Genera caja del SaaS y, sobre todo, **llena las plazas de socio premium** que la Fase 3 necesita.
- **Riesgo a vigilar:** lanzar el call center antes de que el producto aguante la demo. Si se vende lo que aún no está pulido, se queman leads de alto valor (las top-50 por país).
- **Engancha con:** §3 (secuencia de llamadas) y TASK-009 (captación/cualificación de leads ya en marcha).

### Fase 3 — ESCRIBIR: motor de oferta (escribas)
Empezar a escribir proyectos con **las escribas actuales + los mejores alumnos** de las formaciones de la Academia.

- **Por qué tercero:** depende de la Fase 2 (demanda de socios de pago, §6) y de la Fase 1 (la Academia es la que produce a los mejores alumnos → futuras escribas).
- **Riesgo a vigilar:** escalar nº de escribas antes de tener demanda de plazas premium que las alimente; y dilución de calidad al subir volumen (R2).
- **Solape sano:** las escribas actuales pueden ir escribiendo con los socios actuales en paralelo desde antes; lo que se desbloquea en Fase 3 es la **escala**.

**Resumen de la cadena:** Fase 1 construye el producto y forma a la cantera (Academia) → Fase 2 genera la demanda (clientes SaaS + socios premium) → Fase 3 convierte cantera + demanda en oferta de proyectos a escala.

---

## 1. Decisiones firmes (no se relitigan)

1. **El call center NO hace venta tradicional.** Cada contacto es una **propuesta de reunión/alianza**, no un cierre. La cultura Erasmus+ se mueve por relaciones y consorcios.
2. **CRM de arranque: Centralize** (marca blanca de GoHighLevel). Más adelante, si hace falta, se sube a GoHighLevel directo para más herramientas.
3. **Las llamadas se hacen en SECUENCIA, no metiendo los 7 objetivos en una.** Una llamada con 7 metas no consigue ninguna. (Ver §3.)
4. **Conversión SaaS base prudente: 2,5%** (no 5%).
5. **Al escalar escribas, se modela con tasa de aprobación conservadora (10%)** aunque el histórico real sea 35% — el 10% protege la viabilidad frente a la dilución de calidad por volumen. (Ver §5 y §6.)
6. **El SaaS ya construido es el producto.** La caja no depende de construir nada nuevo.

---

## 2. Las dos máquinas en detalle

### Máquina A — Call Center (motor de demanda)

- **Equipo:** 3 trabajadores + 5-6 voluntarios / jóvenes emprendedores que aprenden a llamar.
- **Llamadas:** ~1 hora, agendadas (el lead reservó) o semi-frías (email muy personalizado proponiendo conocerse).
- **Volumen modelado:** 6 llamadas/día × 3 personas = 18/día × 5 días = 90/semana × 40 semanas = **3.600 llamadas/año.**
- **Sede de las actividades:** Cantabria, donde se realizan ~10 cursos/formaciones/eventos anuales sobre los que las entidades pueden organizar sus proyectos.

### Máquina B — Escribas (motor de oferta)

- **Qué hacen:** escriben proyectos de ~€250k para socios premium que pagan **€1.000-1.200/año** por ir de socio en un proyecto.
- **Estructura típica de proyecto:** 5 socios, de los cuales 3-4 son de pago.
- **Herramienta:** el SaaS construido por EU Funding School (un proyecto por semana con facilidad).

---

## 3. La secuencia de llamadas y los 7 objetivos

El error a evitar es cargar los 7 objetivos en una sola llamada. Se distribuyen a lo largo de una **secuencia** (primera llamada → seguimiento → conversión), donde cada contacto tiene **una meta primaria** y un único next-step claro. Los demás objetivos se rellenan como datos *si surgen*, no como guion.

Los **7 objetivos internos** (la agenda completa que se cubre a lo largo de la relación, no de una llamada):

| # | Objetivo | Naturaleza |
|---|----------|------------|
| 1 | **Mejorar la base de datos** y conocer la entidad + al decisor (qué proyectos hacen, dificultades, hacia dónde van) | Enriquecimiento — base de todo |
| 2 | **Invitar a la red europea** (hacerse socios de las asociaciones EU → reforzar los pequeños lobbies) | Membresía |
| 3 | **Generar consorcio mutuo** (escribir proyectos juntos, ir de socios mutuamente — win-win) | Núcleo del negocio |
| 4 | **Atraer actividades a Cantabria** (FP, formación de profesorado → los 10 cursos anuales) | Actividades |
| 5 | **Dar a conocer el SaaS + EU Funding School** (aprender a escribir proyectos, ahorrar trabajo) | Venta SaaS |
| 6 | **Invitar al encuentro anual** + intercambio de voluntarios/emprendedores (enviar y recibir) | Comunidad / red |
| 7 | *(implícito en 1)* Identificar al responsable de decisión y su contexto | Cualificación |

**Mapeo a Centralize/GHL:** cada objetivo se convierte en un bloque de campos personalizados + una etapa del pipeline, de modo que la escriba/teleoperador va dejando anotaciones estructuradas por área en cada llamada. La disposición de llamada (call disposition) marca qué objetivos se tocaron y cuál es el next-step.

**North-star metric por llamada:** *reuniones cualificadas agendadas.* El dinero viene detrás de la relación; se mide el paso de relación, no el cierre.

---

## 4. Modelo financiero — Máquina A (Call Center)

Cifras **netas** (Oscar confirmó que ya descuentan gastos), sobre las 3.600 llamadas/año.

| Vía | Cálculo | Resultado |
|-----|---------|-----------|
| **SaaS** | 3.600 × 2,5% = 90 clientes × €1.000 | **€90.000** |
| **Proyectos** | 100 presentados × 10% concedidos = 10 × €20.000 neto* | **€200.000** |
| **Actividades** | 300 personas × 7 días × €100/día neto** | **€210.000** |
| **Encuentro anual** | No genera caja directa; refuerza red y BD | — |
| | **Total ≈** | **€500.000 neto-ish/año** |

\* **€20.000 neto por proyecto** = ~8% del presupuesto total. Lógica: proyecto medio €250k, rendimiento histórico de la entidad ~10%, el trozo de presupuesto de nuestra entidad (siendo normalmente 4 socios) ronda €60-71k, y queda ~€20-25k limpio tras gastos de todo tipo. **Es margen, no subvención bruta.**

\** **€100/día neto** = sobre ~€220/persona/día brutos, descontando alojamiento, comidas, estancia y profesorado.

**Antes de superávit hay que restar:** 3 salarios, coste de Centralize/GHL, y gestión de voluntarios. Los €500k son revenue-ish neto de coste de delivery por unidad, no beneficio final de la máquina.

---

## 5. Modelo financiero — Máquina B (una escriba)

Unit economics de **una sola escriba**, deliberadamente conservadora (sandbagged por los dos lados: 10% de aprobación vs. 35% real, y 10 proyectos vs. 30-40 posibles).

| Concepto | Cálculo | Resultado |
|----------|---------|-----------|
| **Cuotas de socio** | 10 proyectos × 3-4 socios de pago × €1.200 | **~€48.000** |
| **Proyecto concedido** | 10% de 10 = 1 proyecto × €25.000 neto | **€25.000** |
| **Coste trabajador** | salario anual | **−€32.000** |
| | **Superávit** | **€30.000–42.000** |

**Escenarios:**
- **Pesimista:** cubre sus propios gastos (la escriba se autofinancia).
- **Realista:** superávit €30-42k.
- **Optimista:** 3 proyectos concedidos en vez de 1; y una escriba con el SaaS puede presentar **30-40 proyectos/año** (un proyecto/semana), no 10.

---

## 6. El cuello de botella real del modelo escribas

**No es la capacidad de escribir — es la demanda de plazas de socio de pago.**

Si una escriba sube a 30 proyectos/año, necesita colocar **90-120 plazas premium/año** (30 × 3-4 × €1.200). El SaaS escribe el proyecto en una semana; lo que no es automático es encontrar 90-120 entidades dispuestas a pagar €1.200 por entrar.

**Aquí es donde Máquina A alimenta a Máquina B:** el call center es el que llena esas plazas. La escalabilidad del modelo escribas está gobernada por el ritmo al que el call center genera socios premium cualificados.

---

## 7. Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|--------|------------|
| R1 | **7 objetivos en una llamada = cero objetivos** | Secuencia de llamadas, una meta primaria por contacto (§3) |
| R2 | **Throughput vs. tasa de aprobación vs. churn de socios.** A 40 proyectos/escriba la calidad puede bajar, la aprobación caer, y el socio que pagó €1.200 esperando opciones reales no renueva | Proteger la tasa de aprobación como si fuera el producto — para el socio de pago, lo es. Modelar al 10% al escalar fuerza a no apostar la viabilidad a una calidad no garantizable a volumen |
| R3 | **Voluntarios noveles llamando a las cuentas más valiosas** (top-50 por país) | Profesionales en el tier alto; voluntarios en enriquecimiento de BD, research y agendado de warm leads |
| R4 | **Capacidad agregada de entrega.** El equipo sostiene a la vez: presentar ~2 propuestas/semana, ejecutar los consorcios concedidos, llenar y operar 10 actividades residenciales, onboardear ~90 clientes SaaS | Dimensionar el equipo contra la **suma** de cargas, no contra las 3.600 llamadas. Hacer el plan de capacidad de entrega ANTES que el de lead-gen |
| R5 | **RGPD / outreach en frío** (construcción de BD vía llamada + email) | B2B da margen, pero cerrar la base legal del enriquecimiento antes, no después |
| R6 | **Setup de Centralize/GHL** bien hecho lleva tiempo | Mapear los 7 objetivos a campos/pipeline desde el día 1 (§3) |

---

## 8. Recomendación de arranque

**Pilotar antes de escalar.** 1-2 callers + 1 escriba, un país, un segmento, 4-6 semanas. Medir:
- Conversión real por tipo de llamada.
- Plazas premium vendidas por escriba.
- Coste real de delivery por vía.

Con esos datos se escala a 3 trabajadores + voluntarios y al modelo de varias escribas **con confianza**, no con proyección.

---

## 9. Cómo se conecta con el resto del ecosistema

- **SaaS vendido aquí** = el del `PRICING_v2_CREDITS.md` (monedero de crédito, foco 4 líneas KA2/KA3/CB/Sport).
- **Actividades en Cantabria** = encajan con las cohortes/cursos del `ROADMAP_2026_2027.md` y la academia aparcada de pricing.
- **Red europea / lobbies** = las asociaciones EU cuya membresía se promueve en el objetivo 2.
- **Directorio de entidades** = la herramienta cloud de ranking es prima del directorio unificado (entities + proyectos EU) ya en producción.

---

## 10. Próximos pasos (pendiente de decisión de Oscar)

- [ ] Validar/ajustar este doc.
- [ ] Definir los **tipos de llamada** concretos de la secuencia (cuántos, qué meta primaria, qué next-step).
- [ ] Especificar el **mapeo exacto** de los 7 objetivos a campos/pipelines de Centralize.
- [ ] Construir el **plan de capacidad de entrega** (R4) — dimensionar equipo vs. carga agregada.
- [ ] Modelo financiero combinado con **columna de costes** completa (salarios + GHL + overhead).
- [ ] Diseñar el **piloto** (§8).
