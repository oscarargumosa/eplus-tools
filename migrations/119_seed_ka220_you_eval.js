/**
 * Seed the evaluation structure + criteria for "KA 220 YOU" (KA220-YOU).
 *
 * Builds eval_sections / eval_questions straight from the KA220 NA form template
 * (migration 118) so the Writer binds by field_id, applies the per-question
 * CHARACTER limits, and scores against criteria that belong ONLY to this call
 * (independent evaluation per convocatoria).
 *
 * Idempotent: skips entirely if the program already has eval_sections (never
 * overwrites manual admin edits / criteria added in the UI).
 */
'use strict';

const { randomUUID } = require('crypto');
const uuid = () => randomUUID();

// Curated narrative briefs, keyed by template field_id. Only the high-value
// scored questions are seeded here; the rest get the structure (so char limits
// + Writer guidance work) and can receive criteria later from the admin UI.
const CRITERIA_BY_FIELD = {
  rel_priorities_addressed: [
    {
      title: 'Priority addressed operationally, not just named', mandatory: 1, priority: 'alta',
      intent: 'El evaluador quiere ver que la prioridad elegida se traduce en decisiones concretas del proyecto (objetivos, actividades, target), no una mención decorativa. Nombrar la prioridad y no operacionalizarla es el error más común.',
      elements: 'Nombre exacto de la prioridad (horizontal o de campo) tal como aparece en la convocatoria. 2-3 decisiones del proyecto que se derivan directamente de esa prioridad. Conexión con el target group y con al menos una actividad/WP. Si hay prioridades adicionales (máx 2), justificar brevemente por qué son secundarias, no inflarlas.',
      example_strong: 'We address the youth-participation priority not as a slogan but through three design choices: young people co-design the toolkit in WP2 (not just receive it), the pilot is run by youth workers in 4 local clubs, and the final validation panel is 60% under-25. Inclusion is the single additional priority, addressed by the free, low-bandwidth format of all materials.',
      avoid: '- Listar las 6 prioridades horizontales "porque todas aplican".\n- Nombrar la prioridad sin derivar ninguna decisión concreta.\n- Prometer impacto sistémico desproporcionado para un KA220.\n- Cambiar la prioridad respecto a la seleccionada en el formulario.',
    },
  ],
  rel_motivation: [
    {
      title: 'Concrete problem rooted in the partners’ reality', mandatory: 1, priority: 'alta',
      intent: 'La motivación debe partir de un problema real y acotado que los socios viven, no de un diagnóstico genérico sobre Europa. El evaluador busca un "por qué este proyecto, por qué estos socios, por qué ahora".',
      elements: 'Problema concreto con algún dato o evidencia (encuesta interna, dato nacional, experiencia de los socios). Por qué no está resuelto por iniciativas actuales. Por qué este consorcio está bien posicionado para abordarlo. Proporcionalidad con la escala KA220 (no "transformar el sistema educativo europeo").',
      example_strong: 'Across our three regions, youth organisations report the same gap: volunteers run digital-skills sessions with no shared, age-appropriate curriculum, so each starts from scratch. An internal scan (Mar 2026, 22 youth workers) found 18 building their own materials ad hoc. National strategies fund equipment, not pedagogy. Our consortium already runs these sessions weekly — we feel the gap directly.',
      avoid: '- "In today’s rapidly changing digital world…" y similares.\n- Problema tan amplio que cualquier proyecto encajaría.\n- Cero evidencia del problema.\n- No explicar por qué debe financiarse precisamente esto.',
    },
  ],
  rel_objectives_results: [
    {
      title: 'Measurable objectives linked to priorities and results', mandatory: 1, priority: 'alta',
      intent: 'Traducir la motivación en 2-4 objetivos claros, medibles y alcanzables en la duración, cada uno conectado a una prioridad y a un resultado concreto. El evaluador sigue la cadena prioridad → objetivo → resultado.',
      elements: '2-4 objetivos redactados como outcomes (no actividades). Cada uno con conexión explícita a una prioridad seleccionada. Resultados concretos y tangibles (toolkit, formación, red) con cifra/alcance. Realismo temporal. Evitar objetivos solapados.',
      example_strong: 'O1 (priority: digital): by M18, produce and field-test a 6-module youth digital-skills curriculum, used by 24 youth workers. O2 (priority: participation): embed a co-design method so 120 young people shape the materials. Result R1: open-access curriculum (EN/ES/PL); R2: trained pool of 24 facilitators; R3: a short method guide reusable by other clubs.',
      avoid: '- Objetivos como actividades ("to organise", "to create").\n- Más de 4 objetivos (pérdida de foco).\n- Objetivos sin conexión a la prioridad.\n- Resultados vagos sin alcance ni formato.',
    },
  ],
  rel_eu_value: [
    {
      title: 'Transnational value that a single country could not produce', mandatory: 1, priority: 'media',
      intent: 'Mostrar qué aporta concretamente la cooperación transnacional al PROCESO y al resultado, y por qué no se conseguiría con un proyecto nacional. Evitar grandilocuencia ("impacto en toda Europa").',
      elements: 'Qué aporta cada país al proceso (tradición, red, modelo). Por qué el resultado es mejor tras el trabajo conjunto. A qué contextos UE similares es transferible. Canal simple de transferencia (materiales abiertos, traducciones).',
      example_strong: 'The curriculum is drafted in Spain, stress-tested in Poland’s municipal-club model and adapted by volunteer-run Italian clubs — three structures that cover the main organisational forms in EU youth work. That three-way validation is what makes it usable in countries not in the partnership, which a single-country project could not deliver.',
      avoid: '- "Partners come from different countries" como única justificación.\n- Transferibilidad a "toda Europa" sin condiciones.\n- No explicar el aporte de cada país.\n- Ignorar el canal de transferencia.',
    },
  ],
  needs_address: [
    {
      title: 'Needs broken down per target group with evidence', mandatory: 1, priority: 'alta',
      intent: 'Describir las necesidades desglosadas por target group y con evidencia de origen, no en bloque genérico. El evaluador valora que el equipo distingue qué necesita cada grupo.',
      elements: 'Identificación de 2-3 target groups. Para cada uno, necesidad específica con origen (encuesta, dato, experiencia). Evidencia de que las necesidades son comunes a los socios (no solo de un país). Conexión con la motivación de la sección 2.',
      example_strong: 'Youth workers (n=22) lack a shared curriculum: only 4 use structured materials. Young people 14–18 (n=180) report in intake forms that sessions feel improvised. Club managers (n=4) have no budget line for facilitator training. The three gaps repeat across all three countries.',
      avoid: '- "Young people need more digital skills" en bloque.\n- Necesidades sin ninguna evidencia.\n- Target groups demasiado amplios.\n- Contradecir el problema de la sección Relevancia.',
    },
  ],
  needs_target_groups: [
    {
      title: 'Defined target groups and real engagement mechanism', mandatory: 1, priority: 'media',
      intent: 'Definir con precisión los target groups y mostrar CÓMO los socios ya trabajan con ellos (no que los alcanzarán en el futuro). El evaluador quiere acceso real, no hipotético.',
      elements: 'Target groups con tamaño aproximado y perfil. Mecanismo concreto por el que cada socio accede a ellos (clubes propios, redes, programas en marcha). Rol del target en el proyecto (co-diseño, pilotaje, validación). Coherencia con los grupos nombrados en las necesidades.',
      example_strong: 'Primary target: 14–18 youth in the partners’ own weekly clubs (~180 reachable today). Secondary: 24 youth workers on staff/volunteer rosters. Engagement is not hypothetical — each partner runs these sessions now and will route participants into co-design (M3–M6) and piloting (M9–M14).',
      avoid: '- Target groups que el consorcio no puede alcanzar realmente.\n- "We will reach young people" sin canal.\n- Cifras infladas.\n- Cambiar los target groups respecto a las necesidades.',
    },
  ],
  part_formation: [
    {
      title: 'Complementary partners, no duplication', mandatory: 1, priority: 'alta',
      intent: 'Mostrar que los socios se complementan: capacidades distintas que encajan como piezas. Si dos socios tienen el mismo perfil, diferenciar su rol o el consorcio queda redundante.',
      elements: 'Qué aporta cada socio (metodología, implementación, diseminación, acceso a target). Diferenciación explícita cuando dos perfiles son similares. Valor añadido de la colaboración. Por qué este mix concreto y no otro.',
      example_strong: 'Partner A brings the pedagogical method; Partner B, a network of 12 grassroots clubs for piloting; Partner C, a regional youth platform for dissemination. A and C are both youth NGOs, but A is content-led and C is reach-led — hence A leads WP2 and C leads the dissemination WP, with no overlap.',
      avoid: '- "Complementary expertise" sin desagregar.\n- Dos socios con el mismo perfil sin diferenciar.\n- No explicar el valor del mix.\n- Consorcio de conveniencia sin lógica.',
    },
  ],
  part_task_allocation: [
    {
      title: 'Task allocation reflects real commitment of every partner', mandatory: 1, priority: 'alta',
      intent: 'La reparticipación de tareas debe mostrar que cada socio contribuye de forma activa y proporcional a su capacidad — sin socios pasivos ni un coordinador que lo hace todo.',
      elements: 'Reparto claro por socio (qué lidera, dónde contribuye). Proporcionalidad con el tamaño/capacidad de cada socio. Ningún socio meramente "decorativo". Conexión con los WPs y su liderazgo.',
      example_strong: 'Each partner leads at least one WP: A leads content (WP2), B leads piloting (WP3), C leads dissemination (WP4); the coordinator leads management (WP1). Smaller partner C carries a lighter content load but owns dissemination because of its 8,000-member newsletter — load matched to capacity.',
      avoid: '- Coordinador que asume el 80% de las tareas.\n- Socio sin tareas reales.\n- Reparto sin conexión a los WPs.\n- Cargas desproporcionadas para socios pequeños.',
    },
  ],
  wp_objectives: [
    {
      title: 'Specific WP objectives that ladder up to the project', mandatory: 1, priority: 'alta',
      intent: 'Los objetivos del WP deben ser específicos, medibles, y contribuir de forma clara a los objetivos generales del proyecto. El evaluador verifica la cadena objetivo-proyecto → objetivo-WP.',
      elements: '1-3 objetivos específicos del WP redactados como outcomes. Conexión explícita con al menos un objetivo general del proyecto. Coherencia con las actividades del WP. Evitar repetir el objetivo general literalmente.',
      example_strong: 'WP2 objective: produce a field-ready 6-module curriculum (contributes to project O1) and a co-design method (contributes to O2). Concretely: a validated v2 curriculum by M12 and a reusable method guide by M14 — not "improve digital education" in the abstract.',
      avoid: '- Repetir el objetivo general del proyecto.\n- Objetivos como actividades.\n- WP sin conexión clara al proyecto.\n- Objetivos no medibles.',
    },
  ],
  wp_quant_indicators: [
    {
      title: 'Quantitative indicators with unit, baseline and target', mandatory: 1, priority: 'alta',
      intent: 'Cada indicador cuantitativo debe tener unidad, baseline y target. Es el punto donde más propuestas pierden por omisión (indicadores sin baseline o sin target).',
      elements: 'Al menos 1-2 indicadores por WP. Cada uno con unidad (%, nº personas, nº clubes), baseline (hoy, o 0 si procede), target (al final). Preferir indicadores de resultado sobre actividad. Método de verificación.',
      example_strong: 'Indicator: youth workers able to deliver the curriculum independently. Unit: number. Baseline (M1): 4 of 24. Target (M14): 20 of 24, verified by observation + self-report. Indicator: dropout across pilot sessions. Unit: %. Baseline: 35%. Target: <20%.',
      avoid: '- Indicadores sin baseline o sin target.\n- Contar actividades ("nº de talleres") como resultado.\n- Targets redondos inverosímiles (siempre 100%).\n- No indicar método de verificación.',
    },
  ],
  wp_tasks_partners: [
    {
      title: 'Tasks and responsibilities concrete per partner', mandatory: 1, priority: 'media',
      intent: 'Describir las tareas del WP con responsable claro por socio. El evaluador busca que cada socio tenga un papel activo y verificable en el WP, coherente con el reparto general.',
      elements: 'Tareas con verbo accionable y responsable (lead + soporte). Meses de inicio/fin. Coherencia con la capacidad del socio. Sin tareas genéricas intercambiables entre WPs.',
      example_strong: 'T2.1 Draft curriculum (M1–M3, lead A). T2.2 Co-design workshops (M3–M6, lead A, support B with its clubs). T2.3 National adaptation (M6–M8, each implementing partner). T2.4 Revision after pilot feedback (M12, lead A). Every partner has a named task; none is idle.',
      avoid: '- Tareas sin responsable.\n- "Implementation / Activities / Monitoring" genéricas.\n- Socio sin tarea en el WP.\n- Sin meses.',
    },
  ],
  wp_activities: [
    {
      title: 'Activities described concretely with participants', mandatory: 1, priority: 'alta',
      intent: 'Las actividades deben describirse con suficiente concreción operativa: qué se hace, cómo contribuye al objetivo del WP, qué resultado produce y qué participantes (número y perfil). El evaluador penaliza actividades abstractas.',
      elements: 'Por actividad: contenido concreto, cómo ayuda a alcanzar el objetivo del WP, resultado esperado, y número + perfil de participantes. Anclaje en lugares/fechas reales cuando aplique. Coherencia con tareas y presupuesto del WP.',
      example_strong: 'Activity: 3 co-design workshops (M3, M4, M5) in the partners’ clubs, 2 days each, 12 young people + 4 youth workers per session (48 youth total). Content: storyboard each module, test drafts live. Helps reach the WP objective by grounding the curriculum in real session constraints. Result: a validated module storyboard and a feedback log feeding v2.',
      avoid: '- "Workshops will be organised" sin contenido.\n- No indicar número/perfil de participantes.\n- Actividades desconectadas del objetivo del WP.\n- Participantes inflados o incoherentes con el target.',
    },
  ],
  impact_assess: [
    {
      title: 'Concrete method to assess objective achievement', mandatory: 1, priority: 'alta',
      intent: 'Mostrar un método real para comprobar si los objetivos se han alcanzado, anclado en los indicadores definidos antes. El evaluador busca medición, no buenas intenciones.',
      elements: 'Conexión con los indicadores (unit/baseline/target) ya definidos. Instrumentos concretos (encuestas, observación, registros). Momentos de medición (intermedio/final). Responsable de la evaluación.',
      example_strong: 'Achievement is checked against the indicators set per WP: a baseline survey at M1, a midline at M9 and an endline at M16, plus structured observation of 12 sessions. The coordinator consolidates results into a short assessment report; targets met/not met are stated explicitly, not glossed.',
      avoid: '- "We will evaluate the impact" sin método.\n- No conectar con los indicadores previos.\n- Sin momentos de medición.\n- Sin responsable.',
    },
  ],
  impact_sustainability: [
    {
      title: 'Sustainability operationalised with partner commitments', mandatory: 1, priority: 'alta',
      intent: 'La sostenibilidad debe concretarse en compromisos verificables de cada socio sobre qué continúa tras el proyecto y con qué recursos. "Long-term commitment" sin plan no puntúa.',
      elements: 'Qué resultados/actividades continúan. Socio responsable de cada uno. Recurso mínimo requerido. Calendario del primer año post-proyecto. Integración en la actividad regular de cada organización.',
      example_strong: 'Each partner commits in writing: A integrates the curriculum into its annual volunteer onboarding (owner: training lead, no extra cost); C keeps the toolkit hosted and updates it yearly (next update M30); B continues co-design sessions in its clubs. The method guide stays open-access for external clubs.',
      avoid: '- "Sustainability through long-term commitment" sin plan.\n- Compromisos sin responsable nominal.\n- Sin recursos ni calendario.\n- No integrar en la actividad regular.',
    },
  ],
  impact_dissemination: [
    {
      title: 'Targeted dissemination through real partner channels', mandatory: 1, priority: 'media',
      intent: 'La diseminación debe dirigirse a audiencias concretas por canales reales de los socios, no ser un plan genérico de "redes sociales y web". El evaluador busca alcance verificable.',
      elements: 'Audiencias diferenciadas (target, stakeholders, público general). Canales propios de los socios con alcance (newsletters, redes de clubes, plataformas). Outputs públicos concretos (toolkit abierto, webinars). Visibilidad UE. Distinguir comunicación de diseminación.',
      example_strong: 'Dissemination targets three audiences via partner channels: youth workers (C’s 8,000-member newsletter + 2 webinars at M12/M16), partner clubs (direct rollout to 12 clubs), and the wider field (open-access toolkit on the EU youth platform, M15). All outputs carry the EU emblem and funding acknowledgement.',
      avoid: '- "Social media and website" sin audiencias ni alcance.\n- No usar los canales reales de los socios.\n- Outputs todos privados.\n- Confundir comunicación con diseminación.',
    },
  ],
  org_applicant_experience: [
    {
      title: 'Relevant experience and key persons, not a generic CV', mandatory: 1, priority: 'media',
      intent: 'Presentar la experiencia del solicitante RELEVANTE para este proyecto y las personas clave que lo ejecutarán, no un currículum institucional genérico. El evaluador busca capacidad real para el rol asumido.',
      elements: 'Actividades/proyectos previos directamente relacionados con el tema. Personas clave involucradas con su perfil/expertise concreto. Capacidad operativa (equipo, instalaciones, red) relevante para el rol. Evitar listar todo lo que hace la organización.',
      example_strong: 'Over the last 4 years we have run weekly digital-skills sessions for 14–18s across 5 clubs (~300 youth/year). The project lead (M. R., youth worker, 8 yrs) designed our current session format; our 25-volunteer network gives the reach to pilot. We have coordinated one prior Erasmus+ KA210.',
      avoid: '- Currículum institucional genérico sin relación con el proyecto.\n- No nombrar personas clave ni su perfil.\n- Sobredimensionar la capacidad.\n- Copiar lo mismo para todos los socios.',
    },
  ],
};

module.exports = async function (db) {
  // Resolve the KA220-YOU program
  const [progs] = await db.query(
    "SELECT id FROM intake_programs WHERE action_type = 'KA220-YOU' OR program_id = 'new_1780385232134' LIMIT 1"
  );
  if (!progs.length) { console.log('  ⊘ KA220-YOU program not found, skipping eval seed'); return; }
  const programId = progs[0].id;

  // Idempotent: do not clobber an existing eval tree (manual admin edits)
  const [[secCount]] = await db.query('SELECT COUNT(*) AS n FROM eval_sections WHERE program_id = ?', [programId]);
  if (secCount.n > 0) { console.log('  ⊘ KA220-YOU already has eval sections, skipping'); return; }

  // Load the KA220 NA template
  const [tplRows] = await db.query("SELECT template_json FROM form_templates WHERE id = '00000000-0000-4000-b000-000000000220'");
  if (!tplRows.length) { console.log('  ⊘ KA220 template missing, skipping eval seed'); return; }
  let tmpl = tplRows[0].template_json;
  if (typeof tmpl === 'string') tmpl = JSON.parse(tmpl);

  const COLORS = ['#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
  let secOrder = 0, nSec = 0, nQ = 0, nC = 0;

  // Wrap in a transaction so a mid-way failure never leaves a partial eval tree
  // (which the idempotency guard above would then refuse to repair).
  await db.beginTransaction();
  try {
  for (const sec of (tmpl.sections || [])) {
    const secId = uuid();
    await db.query(
      'INSERT INTO eval_sections (id, program_id, title, form_ref, color, max_score, sort_order) VALUES (?,?,?,?,?,0,?)',
      [secId, programId, `${sec.number}. ${sec.title}`, sec.id, COLORS[secOrder % COLORS.length], secOrder]
    );
    secOrder++; nSec++;

    let qOrder = 0;
    const subs = sec.subsections || (sec.subsections_groups || []).flatMap(g => g.subsections || []);
    for (const sub of subs) {
      const field = (sub.fields || [])[0] || {};
      const fieldId = field.id || null;
      const charLimit = field.char_limit || null;
      const wordLimit = charLimit ? Math.floor(charLimit / 7) : null;
      const qId = uuid();
      await db.query(
        `INSERT INTO eval_questions
           (id, section_id, code, title, description, field_id, char_limit, word_limit, sort_order, max_score, weight)
         VALUES (?,?,?,?,?,?,?,?,?,0,0)`,
        [qId, secId, sub.number || '', sub.title || '', (sub.guidance || []).join('\n\n'), fieldId, charLimit, wordLimit, qOrder]
      );
      qOrder++; nQ++;

      const crits = CRITERIA_BY_FIELD[fieldId];
      if (crits) {
        let cOrder = 0;
        for (const c of crits) {
          await db.query(
            `INSERT INTO eval_criteria
               (id, question_id, title, max_score, mandatory, priority, intent, elements, example_strong, avoid, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [uuid(), qId, c.title, 1, c.mandatory ? 1 : 0, c.priority || 'media',
             c.intent || null, c.elements || null, c.example_strong || null, c.avoid || null, cOrder]
          );
          cOrder++; nC++;
        }
      }
    }
  }

    await db.commit();
  } catch (e) {
    await db.rollback();
    throw e;
  }

  console.log(`  ✓ Seeded KA220-YOU eval: ${nSec} sections, ${nQ} questions, ${nC} criteria`);
};
