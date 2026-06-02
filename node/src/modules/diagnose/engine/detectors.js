// Detectors: heuristic functions that evaluate a project's Form Part B
// against a given pattern. Each detector returns a Finding object (or null
// if the pattern does not apply to this project).
//
// Finding shape:
//   {
//     applies_to_section: 's5_1_text' | null,
//     evidence_quote: string | null,
//     suggested_action: string,        // human-readable action for the user
//     estimated_score_delta: number,   // negative = points being lost now
//   }
//
// Each detector is keyed by a substring of pattern_text (lowercased) so that
// it can be looked up by `dispatchDetector(pattern_text, form)`.

const { fieldsMatching, allText } = require('./load-form');

// ─── Helpers ────────────────────────────────────────────────────────────────

function hasAny(text, regexes) {
  if (!text) return false;
  return regexes.some(r => r.test(text));
}
function findQuote(text, regex, maxLen = 240) {
  if (!text) return null;
  const m = regex.exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 40);
  const end = Math.min(text.length, m.index + m[0].length + 100);
  return text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
function pickWeakest(fields) {
  // From a dict of field_id->text, return the field with the LEAST content
  // (most likely to be the offender).
  const entries = Object.entries(fields).filter(([_, v]) => v && v.length > 0);
  if (entries.length === 0) return null;
  entries.sort((a, b) => a[1].length - b[1].length);
  return entries[0][0];
}

// ─── Detectors keyed by pattern_text substring (lowercase) ─────────────────

const DETECTORS = {

  // 1. Sustainability lacks concrete post-project funding strategy
  'sustainability lacks concrete post-project funding': (form) => {
    // Look at sustainability-related fields: s5*, s6*, anything with "sustain"
    const candidates = {
      ...fieldsMatching(form, 's5'),
      ...fieldsMatching(form, 's6'),
    };
    if (Object.keys(candidates).length === 0) {
      // No sustainability section detected — check global text
      const all = allText(form);
      if (!/sustainab/i.test(all)) {
        return {
          applies_to_section: null,
          evidence_quote: null,
          suggested_action: 'El proyecto no parece tener una sección de Sustainability. Asegúrate de incluir una con plan de financiación post-proyecto.',
          estimated_score_delta: -1.5,
        };
      }
      return null;
    }

    // Combine sustainability text
    const sustainText = Object.values(candidates).join('\n\n');

    // Look for CONCRETE funding markers
    const concreteMarkers = [
      /membership fee/i, /annual fee/i, /subscription fee/i,
      /paid (services?|consulting)/i, /commercial (model|revenue|service)/i,
      /co[- ]financing/i, /co[- ]funding/i, /partnership (agreement|with)/i,
      /municipal(ity)? (funding|support)/i, /regional (fund|support)/i,
      /booking commission/i, /service fee/i, /tour operator/i,
      /revenue model/i, /business model/i, /sustainable funding/i,
      /financial commitment/i, /pledge/i,
    ];
    const hasConcrete = hasAny(sustainText, concreteMarkers);

    // Look for the RED FLAG: only "future EU funding" mentioned
    const futureEuMarkers = [
      /future (eu|european) (funding|calls?|programs?)/i,
      /apply (for|to) (future|next) (eu|european)/i,
      /further (eu|european) funding/i,
      /seek (additional|further) (eu|european)/i,
    ];
    const hasFutureEuOnly = hasAny(sustainText, futureEuMarkers) && !hasConcrete;

    if (hasConcrete) {
      // Has concrete sources — no finding
      return null;
    }

    const weakField = pickWeakest(candidates) || Object.keys(candidates)[0];
    return {
      applies_to_section: weakField,
      evidence_quote: findQuote(sustainText, /sustainab\w+|fund\w+/i) || sustainText.slice(0, 200),
      suggested_action: hasFutureEuOnly
        ? 'Tu sustainability solo menciona "future EU funding". Esto es el patrón que más penaliza en EACEA. Añade al menos 2 fuentes concretas (membership fees, paid services, co-financing regional, commission por bookings, partnerships específicos).'
        : 'No detecto fuentes concretas de financiación post-proyecto. Añade: membership fees / paid services / co-financing regional / revenue model / partnerships concretos.',
      estimated_score_delta: -1.5,
    };
  },

  // 2. Methodology lacks sufficient detail
  'methodology lacks sufficient detail': (form) => {
    // Look at sections with "methodology" in the field_id or value
    const candidates = {
      ...fieldsMatching(form, 's3'),  // typical methodology section
      ...fieldsMatching(form, 's2_2'),
    };

    const methodFields = Object.entries(candidates).filter(([_, v]) =>
      /methodology|method|approach|theoretical framework|phases?/i.test(v || '')
    );

    if (methodFields.length === 0) {
      const all = allText(form);
      if (!/methodology|methodological/i.test(all)) {
        return {
          applies_to_section: 's3_1_text',
          evidence_quote: null,
          suggested_action: 'No detecto una metodología documentada. EACEA penaliza Quality si la metodología no está explícita y con suficiente detalle.',
          estimated_score_delta: -1.5,
        };
      }
      return null;
    }

    // Check detail: text should mention specific methods, phases, steps
    for (const [fieldId, text] of methodFields) {
      const len = text.length;
      const phaseHits = (text.match(/\b(phase|stage|step|methodology|approach)\b/gi) || []).length;
      const methodHits = (text.match(/\b(qualitative|quantitative|action research|theory of change|participatory|co[- ]design|delphi|focus group|survey|interview|case study|pilot)\b/gi) || []).length;

      if (len < 400 || (phaseHits < 2 && methodHits < 2)) {
        return {
          applies_to_section: fieldId,
          evidence_quote: text.slice(0, 200).replace(/\s+/g, ' '),
          suggested_action: 'La metodología de esta sección es vaga. Añade: nombre del método (ej. theory of change, action research), fases concretas (preparación / pilot / scale-up), criterios de evaluación, y vínculo con los needs identificados.',
          estimated_score_delta: -1.0,
        };
      }
    }
    return null;
  },

  // 3. Inconsistencies between objectives, activities, and work packages
  'inconsistencies between objectives, activities': (form) => {
    // Detect: count of "specific objectives" mentioned in s1 vs WPs in s4
    const s1 = Object.values(fieldsMatching(form, 's1')).join('\n');
    const s4 = Object.values(fieldsMatching(form, 's4')).join('\n');

    // Count enumerations of specific objectives in s1
    const objs = (s1.match(/\b(first|second|third|fourth|fifth|sixth|specific objective|objective\s*\d+)\b/gi) || []).length;
    // Mention of N objectives
    const nMatch = s1.match(/\b(three|four|five|six|seven|eight)\s+(articulated\s+)?(specific\s+)?objectives?\b/i);
    const claimedN = nMatch ? wordToNum(nMatch[1]) : null;

    if (claimedN && objs > 0) {
      // Heuristic: if "three specific objectives" claimed but ≥4 distinct objs found
      const actualOrdinalsFound = new Set();
      const ord = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
      for (const o of ord) {
        if (new RegExp(`\\b${o}\\s+(specific\\s+)?objective`, 'i').test(s1)) {
          actualOrdinalsFound.add(o);
        }
      }
      if (actualOrdinalsFound.size > claimedN) {
        return {
          applies_to_section: 's1_2_text',
          evidence_quote: nMatch[0] + ' / ' + [...actualOrdinalsFound].join(', '),
          suggested_action: `Inconsistencia interna: el proyecto declara "${claimedN} objetivos específicos" pero luego enumera ${actualOrdinalsFound.size}. Revisa s1.1 y s1.2 — son lo primero que mira el ponente.`,
          estimated_score_delta: -1.0,
        };
      }
    }

    // Also: are there WPs in s4? If WP count diverges from objectives count
    const wpFields = Object.keys(fieldsMatching(form, 's4_2_wp_'));
    if (objs > 0 && wpFields.length > 0 && claimedN) {
      // Hard to assert. Skip for now.
    }

    return null;
  },

  // 4. Transversal themes mentioned but not translated into concrete tasks
  'transversal themes mentioned but not translated': (form) => {
    const all = allText(form);
    const s4 = Object.values(fieldsMatching(form, 's4')).join('\n');

    const themes = ['green', 'digital', 'inclusion', 'gender', 'non-discrimination'];
    const flagged = [];

    for (const theme of themes) {
      const mentioned = new RegExp(`\\b${theme}\\b`, 'gi').test(all);
      if (!mentioned) continue;

      // Is the theme actually present in WP/task text (s4)?
      const taskedRe = new RegExp(`\\b${theme}\\b`, 'gi');
      const hits = (s4.match(taskedRe) || []).length;
      // Heuristic: if mentioned globally but appears <2 times in s4 (the
      // sections with WPs/tasks), it's probably ornamental.
      if (hits < 2) {
        flagged.push(theme);
      }
    }

    if (flagged.length === 0) return null;
    return {
      applies_to_section: 's4_2_text',
      evidence_quote: `Mentioned themes without tasks: ${flagged.join(', ')}`,
      suggested_action: `Estos temas transversales aparecen mencionados pero no se traducen en tareas concretas en los WPs: ${flagged.join(', ')}. Añade al menos 1 actividad por tema con KPI medible, o quítalos como prioridades.`,
      estimated_score_delta: -0.8 * flagged.length,
    };
  },

  // 5. Budget equal allocation among partners
  'budget allocation equal among partners': (form) => {
    // Use project.calc_state JSON to check budget distribution
    const calc = form.project?.calc_state;
    if (!calc) return null;

    let state;
    try { state = typeof calc === 'string' ? JSON.parse(calc) : calc; } catch (e) { return null; }
    const partners = state?.partners || [];
    if (partners.length < 2) return null;

    // Compute total per partner from any per-partner budget array
    const totals = partners.map(p => {
      // try multiple field names
      return Number(p.total_cost || p.eligible_costs || p.grant || p.budget || 0);
    });
    if (totals.every(t => t === 0)) return null;

    // Are all totals equal? (within 2% tolerance)
    const max = Math.max(...totals);
    const min = Math.min(...totals);
    const spread = (max - min) / (max || 1);

    if (spread < 0.02 && partners.length > 2) {
      return {
        applies_to_section: 's6_1_details',
        evidence_quote: `${partners.length} partners with near-equal budgets (max-min spread: ${(spread * 100).toFixed(1)}%)`,
        suggested_action: 'El budget está distribuido equitativamente entre todos los partners. EACEA penaliza esto si hay coordinador o partners con más responsabilidades. Justifica explícitamente por qué la distribución es equitativa, o ajusta el reparto al workload real.',
        estimated_score_delta: -1.0,
      };
    }
    return null;
  },

  // 6. Activities not clearly linked to objectives
  'activities not clearly linked to specific objectives': (form) => {
    const s4 = Object.values(fieldsMatching(form, 's4_2_wp_')).join('\n');
    if (!s4) return null;

    // Count activities (approximation: lines with "activity" or A.x labels)
    const activities = (s4.match(/(\bactivity\b|\bA\d+(\.\d+)?\b|\btask\b)/gi) || []).length;
    if (activities < 3) return null;

    // Count explicit objective references
    const objRefs = (s4.match(/(\bO\d+\b|objective\s*\d+|specific objective)/gi) || []).length;

    const ratio = objRefs / activities;
    if (ratio < 0.3) {
      return {
        applies_to_section: 's4_2_text',
        evidence_quote: `${activities} actividades, solo ${objRefs} referencias a objetivos`,
        suggested_action: 'Tus actividades no referencian explícitamente los objetivos a los que contribuyen. Añade "Contribuye a Objective N" en la descripción de cada actividad/WP.',
        estimated_score_delta: -0.6,
      };
    }
    return null;
  },

  // 7. Cost-benefit analysis or cost-effectiveness not justified
  'cost-benefit analysis or cost-effectiveness': (form) => {
    const budgetText = Object.values({
      ...fieldsMatching(form, 's6'),
      ...fieldsMatching(form, 's4'),
    }).join('\n');
    if (!budgetText) return null;

    const has = /(cost[- ](benefit|effective|efficien)|value for money|cost-effectiveness analysis)/i.test(budgetText);
    if (has) return null;

    return {
      applies_to_section: 's6_1_details',
      evidence_quote: null,
      suggested_action: 'No detecto análisis de cost-effectiveness ni de cost-benefit. Añade un párrafo breve justificando por qué cada major cost line es razonable (benchmark, proxy, oferta competitiva).',
      estimated_score_delta: -0.6,
    };
  },

  // 8. Indicators without specific numerical targets
  'indicators without specific numerical targets': (form) => {
    const text = Object.values(fieldsMatching(form, 's3')).join('\n') +
                 Object.values(fieldsMatching(form, 's7')).join('\n');
    if (!text) return null;

    // Find sentences/lines that mention 'indicator' or 'KPI'
    const lines = text.split(/[.\n]/).filter(l => /indicator|kpi|target/i.test(l));
    if (lines.length === 0) return null;

    // Of those, count how many include a digit/% target
    const withTarget = lines.filter(l => /\d{1,4}\s*%|\d{2,}\b|≥|<=|>=|=\s*\d/.test(l)).length;
    const withoutTarget = lines.length - withTarget;

    if (withoutTarget > lines.length * 0.5 && withoutTarget > 2) {
      return {
        applies_to_section: 's3_3_text',
        evidence_quote: lines.find(l => !/\d/.test(l))?.trim().slice(0, 180) || null,
        suggested_action: `${withoutTarget} de ${lines.length} indicadores que mencionas no tienen un target numérico ("80% participants", "from X to Y"). Añade target específico a cada KPI.`,
        estimated_score_delta: -0.8,
      };
    }
    return null;
  },

  // 9. Youth involvement (YOUTH programme-specific)
  'youth involvement in project design and evaluation': (form) => {
    const all = allText(form);
    if (!/young people|youth/i.test(all)) return null;

    // Look for evidence of design involvement
    const designInvol = /young people.{0,100}(designed|co[- ]designed|designed by|involved in (the )?(design|planning))/i.test(all)
                       || /(design|planning) phase.{0,100}young people/i.test(all)
                       || /youth (advisory|board|panel|council)/i.test(all);
    const evalInvol = /young people.{0,100}(evaluat|review|assess)/i.test(all)
                     || /youth[- ]led (evaluation|review)/i.test(all);

    if (designInvol && evalInvol) return null;

    return {
      applies_to_section: 's1_2_text',
      evidence_quote: null,
      suggested_action: `En convocatorias YOUTH, EACEA verifica que los jóvenes participan en DISEÑO y EVALUACIÓN, no solo como participants. ${!designInvol ? 'Falta evidencia de involvement en diseño. ' : ''}${!evalInvol ? 'Falta evidencia de involvement en evaluación.' : ''} Añade workshops de co-design, youth advisory board, o youth-led evaluation.`,
      estimated_score_delta: -1.2,
    };
  },

  // 10. Fewer opportunities barriers (YOUTH)
  'fewer opportunities barriers': (form) => {
    const all = allText(form);
    if (!/fewer opportunities/i.test(all)) {
      return {
        applies_to_section: 's1_3_text',
        evidence_quote: null,
        suggested_action: 'En propuestas YOUTH, identifica "young people with fewer opportunities" como target group explícito y describe las barreras (linguistic, economic, geographic, disability) y plan para superarlas.',
        estimated_score_delta: -1.0,
      };
    }
    // Mentioned — check if barriers are addressed
    const barriersAddressed = /(barriers?|obstacles?).{0,100}(addressed|overcome|plan to|strategy)/i.test(all)
                              || /(plan to (include|reach|engage)|outreach strategy)/i.test(all);
    if (barriersAddressed) return null;
    return {
      applies_to_section: 's1_3_text',
      evidence_quote: null,
      suggested_action: 'Mencionas "fewer opportunities" pero no detecto plan concreto para abordar barreras. "Selection by motivation" no es plan de inclusión. Añade barreras específicas + acciones (translation, scholarships, transport support).',
      estimated_score_delta: -0.8,
    };
  },
};

// ─── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Find a detector matching a pattern_text. Matching is by substring (case-insensitive).
 * Returns the detector function, or null.
 */
function lookupDetector(patternText) {
  if (!patternText) return null;
  const needle = patternText.toLowerCase();
  for (const [key, fn] of Object.entries(DETECTORS)) {
    if (needle.startsWith(key) || needle.includes(key)) return fn;
  }
  return null;
}

function wordToNum(w) {
  const m = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8 };
  return m[w?.toLowerCase()] || null;
}

module.exports = { lookupDetector, DETECTORS };
