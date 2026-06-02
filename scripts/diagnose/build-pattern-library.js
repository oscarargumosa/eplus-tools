// Aggregate evaluation_findings into pattern_library.
//
// Strategy (F1, heuristic, no LLM):
//   - For each canonical pattern (see PATTERNS list below), test all findings
//     against its keyword rules.
//   - A finding matches if it satisfies ANY of the pattern's match rules.
//   - Count matched findings, group by program. Compute scope:
//       universal = matches findings across ≥2 programs AND total ≥2
//       programme = matches findings within 1 program with N≥2
//       emergent  = matches findings with N=1
//   - Update evaluation_findings.pattern_id where matched (audit trail).
//   - Upsert pattern_library rows.
//
// Idempotent: TRUNCATEs pattern_library before re-inserting. Findings'
// pattern_id is reset and re-assigned each run. Safe to re-run after adding
// new letters.

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const pool = require('../../node/src/utils/db');

// ─── Canonical patterns (from docs/DIAGNOSE_AND_IMPROVE_PLAN.md §2) ─────────
//
// Each pattern has:
//   text:        canonical formulation (goes into pattern_library.pattern_text)
//   criterion:   typical EACEA criterion (loose; for filtering)
//   severity:    typical severity (averaged later anyway)
//   scope_hint:  'universal' | 'programme'  (only used if N qualifies)
//   programme:   program_id (intake_programs.program_id, VARCHAR) if scope_hint='programme'
//   writer_rule: human-readable rule for the Writer
//   matches:     array of test functions. Each receives the finding text;
//                returns true if the finding matches the pattern.
//
// A finding matches the pattern if ANY match function returns true.
// Use simple keyword/regex tests — no NLP, no LLM.

// Each pattern matcher: ANY rule that fires on a NEGATIVE finding counts as a hit.
// Negative findings are pre-filtered (is_positive=0) so we don't need to re-check
// negativity. Permissive on purpose — the parser fragments sentences sometimes,
// so requiring multiple keywords in the same fragment is too strict.
const PATTERNS = [
  // ─── 4 LEYES UNIVERSALES EACEA ─────────────────────────────────────────────
  {
    text: 'Sustainability lacks concrete post-project funding strategy',
    criterion: 'IMPACT',
    severity: 'medium_high',
    writer_rule: 'En la sección de Sustainability, validar que hay al menos una fuente concreta de financiación post-proyecto (membership fees, paid services, regional co-financing, partnerships). "Future EU funding" no cuenta como única fuente.',
    matches: [
      t => /\bsustainab(le|ility)/i.test(t),
      t => /post[- ]project (funding|financ|sustainab)/i.test(t),
      t => /financial (support|strategy|resource).{0,40}(not|lack|insufficient)/i.test(t),
      t => /(securing )?ongoing funding/i.test(t),
    ],
  },
  {
    text: 'Methodology lacks sufficient detail',
    criterion: 'QUALITY',
    severity: 'medium',
    writer_rule: 'La metodología tiene que detallar fases, métodos concretos por fase, criterios de evaluación, y cómo encaja con los needs identificados. Frases tipo "applying participatory approach" sin método son penalizadas.',
    matches: [
      t => /\bmethodology\b/i.test(t),
      t => /(approach|methodologies?).{0,30}(lack|not (well |fully )?(elaborat|detail))/i.test(t),
    ],
  },
  {
    text: 'Inconsistencies between objectives, activities, and work packages',
    criterion: 'QUALITY',
    severity: 'medium_high',
    writer_rule: 'Cada objetivo debe tener al menos una activity asociada con métricas medibles. Verificar coherencia entre WP descriptions y deliverables/dissemination strategy.',
    matches: [
      t => /(activit(y|ies))/i.test(t) && /(objective|goal|work[- ]package|wp)/i.test(t) && /(link|connect|consist|coher|logical|sequenc)/i.test(t),
      t => /(work[- ]packages?|wp).{0,40}(interaction|sequen|global view)/i.test(t),
      t => /(logical (structure|flow|link)|workplan structure|work[- ]plan structure)/i.test(t),
      t => /(overlap with).{0,40}(activities|elements)/i.test(t),
    ],
  },
  {
    text: 'Transversal themes mentioned but not translated into concrete tasks',
    criterion: 'RELEVANCE',
    severity: 'medium',
    writer_rule: 'Si un tema transversal (green, digital, social, EU values, non-discrimination, gender, health) aparece como objetivo o priority, tiene que aparecer también como tarea concreta en al menos un WP, con KPI medible.',
    matches: [
      t => /\b(green|digital|social|inclusion|non[- ]discrimination|gender)\b/i.test(t) && /(poorly|not (adequately|sufficient(ly)?|develop|address|implement)|insufficient|inadequately)/i.test(t),
      t => /\beu (values?|added value|youth strategy)\b/i.test(t) && /(not (sufficient|adequate|fully)|insufficient|lack)/i.test(t),
      t => /(addresses?|recogni[sz]es?).{0,40}(importance|relevance|topic)/i.test(t) && /\b(but|however)\b/i.test(t),
      t => /\bnon[- ]discrimination\b/i.test(t),
    ],
  },

  // ─── 4 CASI-LEYES (3/4) ────────────────────────────────────────────────────
  {
    text: 'Budget allocation equal among partners not justified by varying responsibilities',
    criterion: 'QUALITY',
    severity: 'medium_high',
    writer_rule: 'Si hay coordinador o partners con más workload, su PM/budget tiene que reflejarlo. Distribución equal entre todos los partners en un WP donde uno lleva la batuta = penalización segura.',
    matches: [
      t => /(equal|same).{0,50}(allocat|distribut|fund|resource|cost|unit)/i.test(t) && /(partner|all)/i.test(t),
      t => /(staff costs?|unit cost|per[- ]month effort|person[- ]month)/i.test(t) && /(same|equal|even|all (the )?partners)/i.test(t),
      t => /(efforts?).{0,30}(not equal|are not equal)/i.test(t),
      t => /(equal funds?|equal resources?)/i.test(t),
    ],
  },
  {
    text: 'Activities not clearly linked to specific objectives',
    criterion: 'QUALITY',
    severity: 'medium',
    writer_rule: 'Cada actividad del Gantt debe identificar el objetivo al que contribuye. Actividades "huérfanas" (eg. Brussels trip, multiplier event) sin link explícito a un objective = warning.',
    matches: [
      t => /\bactivit(y|ies)\b/i.test(t) && /(link|connect)/i.test(t) && /(objective|goal)/i.test(t),
      t => /(brussels trip|trip|multiplier event)/i.test(t) && /(link|objective|goal)/i.test(t),
      t => /(some activities|certain activities).{0,40}(not (clearly|fully) link|insufficient)/i.test(t),
    ],
  },
  {
    text: 'Cost-benefit analysis or cost-effectiveness not justified',
    criterion: 'QUALITY',
    severity: 'medium',
    writer_rule: 'Sección de budget debe incluir una tabla breve de cost-effectiveness explicando por qué cada unit cost es razonable. Falta esta tabla = penaliza Quality.',
    matches: [
      t => /\bcost[- ](benefit|effective|efficien)/i.test(t) && /(not|lack|without|insufficient|justif)/i.test(t),
      t => /(specific costs?|how (specific )?costs? are calculated)/i.test(t) && /(not|lack)/i.test(t),
      t => /(detailed cost[- ]benefit)/i.test(t),
    ],
  },
  {
    text: 'Indicators without specific numerical targets or qualitative dimension',
    criterion: 'QUALITY',
    severity: 'medium_high',
    writer_rule: 'Cada KPI debe tener target numérico (no solo "improve" sino "improve from X to Y"). Indicadores deben cubrir tanto dimensión cuantitativa como cualitativa.',
    matches: [
      t => /\b(indicators?|kpis?)\b/i.test(t) && /(specific|numerical|measurable|target)/i.test(t),
      t => /(quantitative)/i.test(t) && /(qualitative)/i.test(t),
      t => /\b(indicators?|kpis?)\b/i.test(t) && /(not (fully |sufficiently )?(explained|detailed|attached|address|specific))/i.test(t),
      t => /\bquality standards?\b/i.test(t),
    ],
  },

  // ─── YOUTH-specific (FOCUS + RISE) ─────────────────────────────────────────
  {
    text: 'Youth involvement in project design and evaluation not evidenced',
    criterion: 'RELEVANCE',
    severity: 'medium_high',
    programme: 'ka3_youth_together_2026',
    writer_rule: 'En propuestas YOUTH, evidenciar explícitamente que los jóvenes participaron en el DISEÑO del proyecto (workshops co-design, advisory board, etc.) y participarán en la EVALUACIÓN (no solo como participantes).',
    matches: [
      t => /(young people|youth)/i.test(t) && /(design|involvement|involved|implementation|evaluation)/i.test(t) && /(not|unclear|insufficient|lack)/i.test(t),
      t => /\b(real involvement|their involvement)\b/i.test(t) && /(design|implementation|evaluation)/i.test(t),
    ],
  },
  {
    text: 'Fewer opportunities barriers not adequately addressed',
    criterion: 'RELEVANCE',
    severity: 'medium_high',
    programme: 'ka3_youth_together_2026',
    writer_rule: 'En propuestas YOUTH, identificar barreras concretas (lingüísticas, económicas, geográficas, discapacidad) que afectan a young people with fewer opportunities, y plan específico para superarlas. "Selection by motivation" no es plan de inclusión.',
    matches: [
      t => /fewer opportunities/i.test(t),
      t => /(barriers? to (the )?participation|obstacles? to (the )?participation)/i.test(t),
    ],
  },
  {
    text: 'Needs analysis lacks country-specific data',
    criterion: 'RELEVANCE',
    severity: 'medium_high',
    programme: 'ka3_youth_together_2026',
    writer_rule: 'Needs analysis debe presentar datos disaggregados POR PAÍS para cada partner. Datos genéricos sobre EU o limitados a uno de los países = penaliza Relevance.',
    matches: [
      t => /needs analysis/i.test(t) && /(country|partner|disaggregat|specific data)/i.test(t),
      t => /(description of needs|true needs analysis|each partner country)/i.test(t),
      t => /(limited data|with limited data)/i.test(t) && /(country|each)/i.test(t),
    ],
  },
  {
    text: 'Partnership geographically imbalanced (West-heavy or under-represented regions)',
    criterion: 'PARTNERSHIP',
    severity: 'medium',
    programme: 'ka3_youth_together_2026',
    writer_rule: 'En proyectos transnacionales EU, incluir partners de al menos 4 países cubriendo varias regiones europeas (N/S/E/W). Concentración en una región (eg. todo Sur o todo Oeste) = penaliza Partnership.',
    matches: [
      t => /(pan[- ]european|geographical(ly)?)/i.test(t) && /(not|imbalanc|heavily|truly)/i.test(t),
      t => /(west|south|east|north).{0,20}european/i.test(t) && /(balance|focused|concentration|states)/i.test(t),
      t => /(geographical|geographic).{0,20}(dimension|balance|representation)/i.test(t) && /(not|insufficient|imbalan)/i.test(t),
    ],
  },

  // ─── CoVE-specific (3D-CoVE, N=1, emergent until more CoVE letters arrive) ─
  {
    text: 'Work plan lacks global view of WP interactions',
    criterion: 'QUALITY',
    severity: 'medium_high',
    programme: 'cove_horizon_2025',
    writer_rule: 'En propuestas CoVE incluir un gráfico de interacción entre WPs mostrando dependencias y secuencia. Su ausencia es shortcoming recurrente.',
    matches: [
      t => /work[- ]plan structure/i.test(t) && /(global view|interaction|wp interaction)/i.test(t),
      t => /(work[- ]packages?).{0,30}(interaction|sequenc)/i.test(t) && /(not|lack)/i.test(t),
    ],
  },
  {
    text: 'Management, QC, and Dissemination plans not formal deliverables',
    criterion: 'QUALITY',
    severity: 'medium_high',
    programme: 'cove_horizon_2025',
    writer_rule: 'Los planes de management, quality control y dissemination deben aparecer como deliverables formales (D1.x, D2.x...), no solo como procesos descritos en prosa.',
    matches: [
      t => /(management|quality|dissemination|qc).{0,30}(plans?|manual)/i.test(t) && /(not.{0,30}deliverable|not (part of|among) (the )?deliverable)/i.test(t),
    ],
  },
];

// ─── Aggregation logic ──────────────────────────────────────────────────────

function matchFinding(pattern, finding) {
  if (!finding.finding_text) return false;
  const text = (finding.finding_text + ' ' + (finding.fragment_quote || '')).toLowerCase();
  for (const fn of pattern.matches) {
    try {
      if (fn(text)) return true;
    } catch (e) {
      // skip broken match function
    }
  }
  return false;
}

const SEVERITY_RANK = { critical:6, high:5, medium_high:4, medium:3, medium_low:2, low:1, positive:0 };
const SEVERITY_FROM_RANK = ['positive','low','medium_low','medium','medium_high','high','critical'];

function severityAvg(severities) {
  if (severities.length === 0) return 'medium';
  const sum = severities.reduce((a, s) => a + (SEVERITY_RANK[s] ?? 3), 0);
  const avg = Math.round(sum / severities.length);
  return SEVERITY_FROM_RANK[Math.max(0, Math.min(6, avg))];
}

(async () => {
  const conn = pool;

  console.log(`\nPattern library builder — ${new Date().toISOString()}\n`);

  // 1. Load all findings (with their letter's program info)
  const [findings] = await conn.query(`
    SELECT ef.id, ef.letter_id, ef.program_id,
           ef.criterion, ef.sub_criterion, ef.severity, ef.is_positive,
           ef.finding_text, ef.fragment_quote,
           el.proposal_acronym, ip.program_id AS program_code
    FROM evaluation_findings ef
    JOIN evaluation_letters el ON ef.letter_id = el.id
    JOIN intake_programs ip ON ef.program_id = ip.id
    WHERE ef.is_positive = 0
  `);

  console.log(`Loaded ${findings.length} negative findings from ${new Set(findings.map(f=>f.letter_id)).size} letters.`);

  // 2. For each pattern, find matching findings
  const patternStats = [];

  for (const p of PATTERNS) {
    const matched = findings.filter(f => matchFinding(p, f));
    if (matched.length === 0) {
      patternStats.push({ pattern: p, matches: [], scope: 'emergent', programmes: new Set() });
      continue;
    }

    const programmes = new Set(matched.map(f => f.program_code));
    const letterIds = [...new Set(matched.map(f => f.letter_id))];
    let scope;
    if (programmes.size >= 2 && letterIds.length >= 2) {
      scope = 'universal';
    } else if (letterIds.length >= 2) {
      scope = 'programme';
    } else {
      scope = 'emergent';
    }

    patternStats.push({
      pattern: p,
      matches: matched,
      letterIds,
      programmes,
      scope,
      severityAvg: severityAvg(matched.map(m => m.severity)),
    });
  }

  // 3. Reset previous pattern_library rows + clear finding.pattern_id
  await conn.query(`UPDATE evaluation_findings SET pattern_id = NULL`);
  await conn.query(`TRUNCATE TABLE pattern_library`);

  // 4. Insert patterns and update findings
  let inserted = 0, linked = 0;
  for (const ps of patternStats) {
    if (ps.matches.length === 0) {
      // Still insert the pattern as 'emergent' with occurrences_count=0,
      // so it shows up in the Admin UI as "not yet seen".
      const id = uuidv4();
      const progUuid = ps.pattern.programme
        ? (await conn.query(`SELECT id FROM intake_programs WHERE program_id=? LIMIT 1`, [ps.pattern.programme]))[0][0]?.id
        : null;
      await conn.query(
        `INSERT INTO pattern_library
         (id, scope, programme_id, pattern_text, criterion, severity_avg,
          occurrences_count, letter_ids, writer_rule_text, active)
         VALUES (?, 'emergent', ?, ?, ?, ?, 0, JSON_ARRAY(), ?, 1)`,
        [id, progUuid, ps.pattern.text, ps.pattern.criterion, ps.pattern.severity, ps.pattern.writer_rule]
      );
      inserted++;
      continue;
    }

    const id = uuidv4();
    let progUuid = null;
    if (ps.scope === 'programme' && ps.pattern.programme) {
      const [rows] = await conn.query(`SELECT id FROM intake_programs WHERE program_id=? LIMIT 1`, [ps.pattern.programme]);
      progUuid = rows[0]?.id || null;
    } else if (ps.scope === 'programme' && ps.programmes.size === 1) {
      const code = [...ps.programmes][0];
      const [rows] = await conn.query(`SELECT id FROM intake_programs WHERE program_id=? LIMIT 1`, [code]);
      progUuid = rows[0]?.id || null;
    }

    await conn.query(
      `INSERT INTO pattern_library
       (id, scope, programme_id, pattern_text, criterion, severity_avg,
        occurrences_count, letter_ids, writer_rule_text, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, ps.scope, progUuid, ps.pattern.text, ps.pattern.criterion,
       ps.severityAvg, ps.letterIds.length, JSON.stringify(ps.letterIds),
       ps.pattern.writer_rule]
    );
    inserted++;

    // Link findings to this pattern
    const findingIds = ps.matches.map(m => m.id);
    if (findingIds.length > 0) {
      await conn.query(
        `UPDATE evaluation_findings SET pattern_id = ? WHERE id IN (?)`,
        [id, findingIds]
      );
      linked += findingIds.length;
    }

    const progList = [...ps.programmes].join(', ');
    console.log(`  [${ps.scope.toUpperCase().padEnd(9)}] N=${ps.letterIds.length} (${progList})  ${ps.pattern.text.slice(0, 60)}...`);
  }

  console.log(`\n${inserted} patterns inserted, ${linked} findings linked.`);

  // 5. Quick summary by scope
  const [byScope] = await conn.query(
    `SELECT scope, COUNT(*) AS n FROM pattern_library WHERE occurrences_count > 0 GROUP BY scope`
  );
  console.log('\nActive patterns by scope:');
  for (const r of byScope) console.log(`  ${r.scope.padEnd(10)} ${r.n}`);

  await conn.end();
})().catch(err => {
  console.error('Aggregator error:', err);
  process.exit(1);
});
