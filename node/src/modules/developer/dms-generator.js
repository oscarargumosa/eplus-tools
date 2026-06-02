/**
 * Holistic Deliverables + Milestones generator (v2)
 * ─────────────────────────────────────────────────────────────────
 * Replaces the per-WP `aiFillWp` D/MS generation and the deterministic
 * `autoDistributeDeliverables` / `autoGenerateMilestones`.
 *
 * Pipeline:
 *   Pass 1 — STRUCTURAL PLAN
 *     One AI call sees the whole project (all WPs, all wp_tasks, all
 *     activities with Gantt months, partners). Returns a skeleton:
 *     which tasks each deliverable groups, due_month, lead_partner_id,
 *     type, dissemination_level. Plus the milestone list with explicit
 *     deliverable_id linkage.
 *
 *   Pass 2 — PROFESSIONAL COPYWRITING
 *     Second AI call takes the validated plan + few-shot examples from
 *     the KA210 sports seed (gold-standard D/MS narrative) and produces
 *     EACEA-grade titles and descriptions (format, language, length).
 *
 *   Pass 3 — EACEA CRITIC (optional, only if pass 1+2 valid)
 *     Third AI call scores the result against the same rubric an
 *     evaluator would use. If <4/5, feeds the critique back into a
 *     surgical pass-2 retry (max 1).
 *
 * Deterministic validator runs after each AI pass and either:
 *   - auto-fixes (date < task end_month → snap to task end_month,
 *     MS numbering with gaps → re-number, lead concentration > 50%
 *     → redistribute across non-coordinator partners)
 *   - rejects with field-level errors → surgical AI retry
 *
 * Persistence is transactional: the existing auto-generated rows are
 * deleted only after the new plan validates. User-edited rows
 * (auto_generated=0) are preserved by code/title match.
 */
'use strict';

const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');
const ai = require('../../utils/ai');
const { seedWpTasksFromProject, syncWpTaskLeadersFromProjectTasks } = require('./model');

const HARD_CAP = 15;
const HARD_MIN = 8;
const DEFAULT_TARGET = 15;

/**
 * Per-WP deliverable quota derived from non-mgmt activities + a fixed
 * management-summary slot in WP1.
 *
 * @param ctx  Loaded project context from _loadProjectContext.
 * @param targetCount  User-requested total deliverables (clamped to [8, 15]).
 * @returns { target, quota: { [wp_id]: count }, mgmtSlotWpId: string|null }
 */
function _computeQuota(ctx, targetCount) {
  const target = Math.max(HARD_MIN, Math.min(HARD_CAP, Number(targetCount) || DEFAULT_TARGET));
  const wps = ctx.wps || [];
  const acts = ctx.activities || [];

  // Count non-mgmt activities per WP.
  const nonMgmtByWp = {};
  for (const a of acts) {
    if (a.type === 'mgmt') continue;
    nonMgmtByWp[a.wp_id] = (nonMgmtByWp[a.wp_id] || 0) + 1;
  }
  const totalNonMgmt = Object.values(nonMgmtByWp).reduce((s, n) => s + n, 0);

  // WP1 receives a fixed slot for the management-summary deliverable
  // (only if there are mgmt activities in WP1 — otherwise it's pointless).
  const wp1 = wps[0] || null;
  const wp1HasMgmt = wp1 ? acts.some(a => a.wp_id === wp1.id && a.type === 'mgmt') : false;
  const mgmtSlot = (wp1 && wp1HasMgmt) ? 1 : 0;
  const remaining = Math.max(0, target - mgmtSlot);

  // Proportional allocation of the remaining budget, with min 1 per WP.
  const quota = {};
  for (const wp of wps) {
    const c = nonMgmtByWp[wp.id] || 0;
    const raw = totalNonMgmt > 0 ? Math.round((remaining * c) / totalNonMgmt) : 0;
    quota[wp.id] = Math.max(1, raw);
  }
  if (wp1 && mgmtSlot) quota[wp1.id] = (quota[wp1.id] || 0) + mgmtSlot;

  // Adjust residual so the sum equals target exactly. Trim from the WP with
  // the most slots first; pad onto the WP with the most non-mgmt activities.
  let sum = Object.values(quota).reduce((s, n) => s + n, 0);
  let safety = 50;
  while (sum > target && safety-- > 0) {
    const sorted = wps.slice().sort((a, b) => (quota[b.id] || 0) - (quota[a.id] || 0));
    const wp = sorted[0];
    const min = (wp1 && wp.id === wp1.id && mgmtSlot) ? 1 + mgmtSlot : 1;
    if ((quota[wp.id] || 0) > min) { quota[wp.id]--; sum--; }
    else break;
  }
  safety = 50;
  while (sum < target && safety-- > 0) {
    const sorted = wps.slice().sort((a, b) => (nonMgmtByWp[b.id] || 0) - (nonMgmtByWp[a.id] || 0));
    const wp = sorted[0];
    quota[wp.id] = (quota[wp.id] || 0) + 1;
    sum++;
  }

  return { target, quota, mgmtSlotWpId: mgmtSlot ? wp1.id : null };
}
const MAX_REPAIR_ATTEMPTS = 2;
const PASS1_TOKENS = 8000;
const PASS2_TOKENS = 8000;
const PASS3_TOKENS = 2000;

// Few-shot examples extracted from migrations/075_seed_ka210_you_sports.js.
// These are the gold-standard "example_strong" entries the seed authors wrote
// to anchor what an EACEA-grade D/MS architecture looks like.
const FEW_SHOT_EXAMPLES = `
EXAMPLE — Management WP architecture (KA210 sports, M1–M24)
  Tasks:    T1.1 Project governance setup; T1.5 Reporting cycles
  Deliverables:
    D1.1 — Partnership Agreement (signed by all partners). PDF, EN, ~6 pp, SEN. Lead: Coordinator. Due M2. Source tasks: T1.1.
    D1.4 — Interim Report. PDF, EN, ~20 pp, SEN. Lead: Coordinator. Due M12. Source tasks: T1.5.
    D1.5 — Final Report. PDF, EN, ~30 pp, SEN. Lead: Coordinator. Due M24. Source tasks: T1.5.
  Milestones:
    MS1 — Partnership Agreement signed by all partners. M2. Linked to D1.1. Verification: scanned signed PA.
    MS2 — Interim report submitted and accepted by the Agency. M12. Linked to D1.4. Verification: Agency acceptance email.
    MS3 — Final report submitted. M24. Linked to D1.5. Verification: eForm submission receipt.

EXAMPLE — Dissemination WP architecture (KA210 sports, M1–M24)
  Tasks:    T5.1 Strategy (M1–M3); T5.2 Continuous communication (M1–M24); T5.3 Focused dissemination of mature results (M15–M24); T5.4 Final event (M24); T5.5 Sustainability handover (M20–M24)
  Deliverables:
    D5.1 — Dissemination and communication strategy. PDF, EN, ~10 pp, SEN. Lead: WP5 Lead. Due M3. Source tasks: T5.1.
    D5.2 — Project web-section on partner websites with EU visibility. HTML, multilingual, PU. Lead: WP5 Lead. Due M3. Source tasks: T5.2.
    D5.3 — Open-access final toolkit. PDF + 5 videos, EN/ES/IT/PL, ~25 pp, PU. Lead: WP5 Lead. Due M22. Source tasks: T5.3.
    D5.4 — 2 webinar recordings + slides. MP4 + PDF, EN, PU. Lead: Partner C. Due M22. Source tasks: T5.3.
    D5.5 — Final dissemination event report. PDF, EN, ~8 pp, PU. Lead: WP5 Lead. Due M24. Source tasks: T5.4.
    D5.6 — Sustainability plan. PDF, EN, ~8 pp, PU. Lead: Coordinator. Due M24. Source tasks: T5.5.
  Milestones:
    MS6 — Dissemination strategy approved by consortium. M3. Linked to D5.1. Verification: signed strategy doc.
    MS7 — Project web-section live on all partner sites. M3. Linked to D5.2. Verification: live URL list.
    MS8 — Open-access toolkit published on EU Project Results Platform. M22. Linked to D5.3. Verification: platform URL + DOI.
    MS9 — Sustainability plan approved with named partner commitments. M24. Linked to D5.6. Verification: signed commitment letters.

INTERNAL COHERENCE RULE — every deliverable traces back to ≥1 task; every milestone closes ≥1 deliverable (except kickoff M1 and project closure); responsible partner is consistent across the task→D→MS chain; chronology never inverts (MS month ≥ D month ≥ max task end_month).
`.trim();

const VALID_D_TYPES = ['R', 'DEM', 'DEC', 'DATA', 'DMP', 'ETHICS', 'SECURITY', 'OTHER'];
const VALID_DL = ['PU', 'SEN', 'R-UE/EU-R', 'C-UE/EU-C', 'S-UE/EU-S'];

// ───────────────────────────────────────────────────────────────────
// Context loaders
// ───────────────────────────────────────────────────────────────────

async function _loadProjectContext(projectId, userId) {
  const [projRows] = await db.execute(
    `SELECT id, name, type, description, duration_months, proposal_lang
       FROM projects WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
  if (!projRows.length) {
    const err = new Error('Project not found');
    err.status = 404;
    throw err;
  }
  const project = projRows[0];

  const [partners] = await db.execute(
    `SELECT id, name, legal_name, country, role
       FROM partners WHERE project_id = ? ORDER BY order_index`,
    [projectId]
  );

  const [wps] = await db.execute(
    `SELECT id, code, title, summary, objectives, leader_id,
            duration_from_month, duration_to_month, order_index
       FROM work_packages WHERE project_id = ? ORDER BY order_index`,
    [projectId]
  );

  // Seed wp_tasks from project_tasks for any WP that has none.
  // Mirrors the lazy-seed in listWpTasks so the generator works even when
  // the per-WP pages haven't been visited yet.
  const [emptyWps] = await db.execute(
    `SELECT wp.id FROM work_packages wp
      WHERE wp.project_id = ?
        AND NOT EXISTS (SELECT 1 FROM wp_tasks t WHERE t.work_package_id = wp.id)`,
    [projectId]
  );
  for (const row of emptyWps) {
    await seedWpTasksFromProject(row.id);
  }

  // Propagate leader assignments saved in *Escribir → Tareas* (project_tasks)
  // to wp_tasks rows that still have NULL lead_partner_id. Without this, the
  // deterministic leader rule below falls back to the WP leader even when
  // the user already assigned a specific partner to the originating task.
  try { await syncWpTaskLeadersFromProjectTasks(projectId); }
  catch (e) { console.warn('[dms-generator] leader sync skipped:', e?.message || e); }

  const [tasks] = await db.execute(
    `SELECT t.id, t.work_package_id, t.code, t.title, t.description, t.sort_order,
            t.lead_partner_id,
            wp.code AS wp_code
       FROM wp_tasks t
       JOIN work_packages wp ON wp.id = t.work_package_id
      WHERE t.project_id = ?
      ORDER BY wp.order_index, t.sort_order`,
    [projectId]
  );

  const [activities] = await db.execute(
    `SELECT a.id, a.wp_id, a.label, a.subtype, a.gantt_start_month, a.gantt_end_month, a.type
       FROM activities a
       JOIN work_packages wp ON wp.id = a.wp_id
      WHERE wp.project_id = ?
      ORDER BY wp.order_index, a.order_index`,
    [projectId]
  );

  const [ctxRows] = await db.execute(
    `SELECT problem, target_groups, approach
       FROM intake_contexts WHERE project_id = ? LIMIT 1`,
    [projectId]
  );
  const intake = ctxRows[0] || {};

  // Programme-aware defaults: KA3 expects more substantial deliverables;
  // KA210 small-scale expects lighter / fewer; Cooperation Partnerships
  // (KA220) expect a balanced mix.
  let programmeHint = 'Erasmus+ Cooperation Partnership / standard';
  const t = String(project.type || '').toUpperCase();
  if (t.includes('SSCP') || t.includes('KA210')) {
    programmeHint = 'KA210 Small-scale Partnership: keep the deliverable set lean (~6–10), most outputs PU, lump-sum logic — every deliverable must be tied to a verifiable activity';
  } else if (t.includes('KA220')) {
    programmeHint = 'KA220 Cooperation Partnership: balanced mix of management, content and dissemination deliverables; aim for 12–15 high-quality outputs with explicit innovation';
  } else if (t.includes('KA3') || t.includes('NETWORKS') || t.includes('POLICY')) {
    programmeHint = 'KA3 Policy Reform: substantial deliverables expected (research reports, policy papers, large-scale events); strong evidence base; deliverables must demonstrate systemic impact';
  }

  return { project, partners, wps, tasks, activities, intake, programmeHint };
}

// ───────────────────────────────────────────────────────────────────
// Pass 1 — Structural plan
// ───────────────────────────────────────────────────────────────────

function _buildPass1Prompt(ctx, opts) {
  const { project, partners, wps, tasks, activities, intake, programmeHint } = ctx;
  const duration = project.duration_months || 24;
  const quotaInfo = opts && opts.quotaInfo ? opts.quotaInfo : _computeQuota(ctx, DEFAULT_TARGET);
  const quotaLines = wps.map(wp => {
    const isWp1Mgmt = quotaInfo.mgmtSlotWpId === wp.id;
    return `  - WP_ID="${wp.id}" (${wp.code}): EXACTLY ${quotaInfo.quota[wp.id] || 0} deliverables${isWp1Mgmt ? ' (including 1 management-summary deliverable that groups ALL project_management tasks + the kick-off meeting task)' : ''}`;
  }).join('\n');

  const partnerLines = partners.map(p =>
    `  - partner_id="${p.id}" | ${p.name || p.legal_name} (${p.country || '?'}) [${p.role}]`
  ).join('\n') || '  (no partners)';

  const tasksByWp = {};
  for (const t of tasks) {
    if (!tasksByWp[t.work_package_id]) tasksByWp[t.work_package_id] = [];
    tasksByWp[t.work_package_id].push(t);
  }
  const actsByWp = {};
  for (const a of activities) {
    if (!actsByWp[a.wp_id]) actsByWp[a.wp_id] = [];
    actsByWp[a.wp_id].push(a);
  }

  const wpBlocks = wps.map(wp => {
    const wpTasks = tasksByWp[wp.id] || [];
    const wpActs  = actsByWp[wp.id] || [];

    const taskLines = wpTasks.map(t =>
      `    - task_id="${t.id}" code=${t.code || ''} | ${t.title}${t.description ? ' — ' + String(t.description).slice(0, 200) : ''}`
    ).join('\n') || '    (no tasks defined)';

    const actLines = wpActs.map(a => {
      const start = a.gantt_start_month || '?';
      const end   = a.gantt_end_month || a.gantt_start_month || '?';
      return `    - [${a.type || ''}] ${a.label || a.subtype || ''} (M${start}–M${end})`;
    }).join('\n') || '    (no activities)';

    return `WP_ID="${wp.id}"  ${wp.code} — ${wp.title}
  Duration: M${wp.duration_from_month || '?'}–M${wp.duration_to_month || '?'}
  Leader partner_id: ${wp.leader_id || '(not set)'}
  Summary: ${(wp.summary || '').slice(0, 400)}
  Objectives: ${(wp.objectives || '').slice(0, 400)}
  TASKS (use task_id verbatim in deliverables.task_ids — every D MUST cite ≥1):
${taskLines}
  ACTIVITIES (Gantt months are the binding timing constraint):
${actLines}`;
  }).join('\n\n');

  const system = `You are an Erasmus+ proposal architect filling Section 4.2 (Work Packages) — specifically the Deliverables and Milestones tables — of the EU Application Form Part B.

You receive the FULL project (all WPs, all tasks, all activities with months, all partners). You produce ONE coherent JSON plan covering the whole project. This is structural only; copywriting comes later.

HARD CONSTRAINTS — violating any is a failure:
1. Total deliverables = EXACTLY ${quotaInfo.target}. Per-WP quota (mandatory, NO deviation allowed):
${quotaLines}
2. Every deliverable cites at least one task_id from the provided TASKS list of the SAME WP. You MUST group several tasks under one deliverable so the quota fits.
3. ZERO ORPHAN TASKS. Every task_id in the input MUST appear in at least one deliverable.task_ids array. Tasks are grouped naturally: a single deliverable is typically a report or output evidencing several related tasks.
4. due_month of a deliverable ≥ the latest end_month of its source activities for that WP, AND within the WP's [duration_from_month, duration_to_month] range.
5. Every milestone EITHER closes one deliverable (deliverable_id present) OR is one of two allowed special MS: kickoff (M1, WP1) and final-closure (M${duration}, last WP). No other free-floating milestones.
6. Milestones are numbered MS1, MS2, … globally with NO gaps, ordered by due_month ascending.
7. ≥ 1 dissemination_level='PU' deliverable in the dissemination/communication WP.
8. No two deliverables with the same code.
9. Lead partner assignment is handled by a downstream deterministic rule — you may propose any, it will be overridden by the rule (task-leader consensus → WP leader → coordinator).

PROGRAMME HINT: ${programmeHint}.

OUTPUT — a single JSON object. CRITICAL: wp_id, task_ids and lead_partner_id MUST be verbatim UUID strings copied from the WP_ID="...", task_id="..." and partner UUIDs in the input. Never use codes (WP1, T1.1) — always use the UUID strings.

{
  "deliverables": [
    {
      "code": "D{wpNum}.{n}",          // human code: D1.1, D2.3, etc.
      "wp_id": "<UUID copied from WP_ID=\\"...\\">",
      "task_ids": ["<UUID copied from task_id=\\"...\\">", "..."],
      "type": "R|DEM|DEC|DATA|DMP|ETHICS|SECURITY|OTHER",
      "dissemination_level": "PU|SEN|R-UE/EU-R|C-UE/EU-C|S-UE/EU-S",
      "due_month": <int 1–${duration}>,
      "lead_partner_id": "<UUID copied from PARTNERS list>",
      "rationale": "<one sentence explaining why this D exists>"
    }
  ],
  "milestones": [
    {
      "code": "MS{n}",                  // global, contiguous, sorted by month
      "wp_id": "<UUID>",
      "deliverable_id_ref": null,       // null for kickoff/closure; otherwise a CODE from deliverables[].code (e.g. "D2.1")
      "due_month": <int 1–${duration}>,
      "lead_partner_id": "<UUID>",
      "verification": "<short sentence stating how completion is verified>",
      "kind": "kickoff|deliverable|closure"
    }
  ]
}

Output JSON only, no markdown fences.`;

  const user = `PROJECT: ${project.name} — ${project.full_name || ''}
Type: ${project.type}
Total duration: ${duration} months
Proposal language: ${project.proposal_lang || 'en'}

CONTEXT:
  Problem: ${(intake.problem || '(not specified)').slice(0, 600)}
  Target groups: ${(intake.target_groups || '(not specified)').slice(0, 400)}
  Approach: ${(intake.approach || '(not specified)').slice(0, 400)}

PARTNERS (use these UUIDs as lead_partner_id):
${partnerLines}

WORK PACKAGES:

${wpBlocks}

Now design the deliverables and milestones plan. Return JSON only.`;

  return { system, user };
}

// ───────────────────────────────────────────────────────────────────
// Pass 2 — Professional copywriting
// ───────────────────────────────────────────────────────────────────

function _buildPass2Prompt(ctx, plan) {
  const { project, partners, wps, tasks, programmeHint } = ctx;
  const lang = project.proposal_lang === 'es' ? 'Spanish'
             : project.proposal_lang === 'fr' ? 'French'
             : project.proposal_lang === 'it' ? 'Italian'
             : 'English';

  const partnerById = Object.fromEntries(partners.map(p => [p.id, p]));
  const taskById    = Object.fromEntries(tasks.map(t => [t.id, t]));
  const wpById      = Object.fromEntries(wps.map(w => [w.id, w]));

  const planLines = plan.deliverables.map(d => {
    const lead = partnerById[d.lead_partner_id]?.name || '?';
    const wp = wpById[d.wp_id];
    const taskTitles = (d.task_ids || []).map(id => taskById[id]?.title).filter(Boolean).join('; ');
    return `  ${d.code} — wp=${wp?.code} lead=${lead} type=${d.type} dl=${d.dissemination_level} M${d.due_month}
    Source tasks: ${taskTitles || '(none)'}
    Rationale: ${d.rationale || ''}`;
  }).join('\n');

  const msLines = plan.milestones.map(m => {
    const lead = partnerById[m.lead_partner_id]?.name || '?';
    const wp = wpById[m.wp_id];
    return `  ${m.code} — wp=${wp?.code} lead=${lead} M${m.due_month} kind=${m.kind} closes=${m.deliverable_id_ref || '(none)'}
    Verification hint: ${m.verification || ''}`;
  }).join('\n');

  const system = `You are an Erasmus+ proposal copywriter. The structural plan is already validated; your job is to produce EACEA-grade titles and descriptions in ${lang}.

QUALITY BAR — match these gold-standard patterns:

${FEW_SHOT_EXAMPLES}

WRITING RULES:
- Title: short (≤ 8 words), specific, names the artifact (not the activity). "Partnership Agreement" not "Sign agreement".
- Description: ONE line, ~15–25 words. Include: format (PDF/HTML/MP4), language(s), approximate length (pp/min), and how it is delivered. NO marketing fluff.
- Verification (milestones): one short sentence with a verifiable evidence type (signed doc, Agency email, platform URL, attendance list).
- Avoid generic words like "materials", "outputs", "communication"; name the artifact.
- Programme hint: ${programmeHint}.

OUTPUT — a JSON object:
{
  "deliverables": [
    { "code": "<same as plan>", "title": "<EACEA-grade>", "description": "<one line, ${lang}>" }
  ],
  "milestones": [
    { "code": "<same as plan>", "title": "<EACEA-grade>", "description": "<one line, ${lang}>", "verification": "<verifiable evidence, ${lang}>" }
  ]
}

Output JSON only, no markdown fences. Preserve the codes from the plan exactly.`;

  const user = `PROJECT: ${project.name}
Language: ${lang}

STRUCTURAL PLAN (already validated — do NOT change codes, types, dates, leads or task linkage; only write the prose):

DELIVERABLES:
${planLines}

MILESTONES:
${msLines}

Now write titles + descriptions + verifications. Return JSON only.`;

  return { system, user };
}

// ───────────────────────────────────────────────────────────────────
// Pass 3 — EACEA critic (optional)
// ───────────────────────────────────────────────────────────────────

function _buildPass3Prompt(ctx, plan, copy) {
  const partnerById = Object.fromEntries(ctx.partners.map(p => [p.id, p]));
  const taskById    = Object.fromEntries(ctx.tasks.map(t => [t.id, t]));
  const wpById      = Object.fromEntries(ctx.wps.map(w => [w.id, w]));
  const cById = Object.fromEntries((copy.deliverables || []).map(d => [d.code, d]));
  const mCopyById = Object.fromEntries((copy.milestones || []).map(m => [m.code, m]));
  const coordinator = ctx.partners.find(p => p.role === 'applicant');

  // Lead-distribution summary so the critic doesn't hallucinate
  const leadCounts = {};
  for (const d of plan.deliverables) {
    const lead = partnerById[d.lead_partner_id]?.name || '?';
    leadCounts[lead] = (leadCounts[lead] || 0) + 1;
  }
  const leadSummary = Object.entries(leadCounts)
    .map(([n, c]) => `${n}=${c}/${plan.deliverables.length}`)
    .join(', ');

  const dLines = plan.deliverables.map(d => {
    const c = cById[d.code] || {};
    const lead = partnerById[d.lead_partner_id]?.name || '?';
    const wpCode = wpById[d.wp_id]?.code || '?';
    const taskNames = (d.task_ids || []).map(id => taskById[id]?.code || taskById[id]?.title || '?').join(',');
    return `  ${d.code} [${wpCode}] M${d.due_month} ${d.type}/${d.dissemination_level} lead="${lead}" tasks=[${taskNames}] — ${c.title || '?'} :: ${c.description || '?'}`;
  }).join('\n');

  const mLines = plan.milestones.map(m => {
    const c = mCopyById[m.code] || {};
    const lead = partnerById[m.lead_partner_id]?.name || '?';
    const wpCode = wpById[m.wp_id]?.code || '?';
    return `  ${m.code} [${wpCode}] M${m.due_month} kind=${m.kind} closes=${m.deliverable_id_ref || '—'} lead="${lead}" — ${c.title || '?'} :: verification: ${c.verification || '?'}`;
  }).join('\n');

  const system = `You are an EACEA evaluator scoring this Deliverables/Milestones architecture against the Feasibility (4) and Quality of Project Design (3) criteria.

Score 1–5 (5 = excellent). For each criterion below, give a 1–5 and ONE concrete weakness if any:

CRITERIA:
- coverage: every WP has at least one D and one MS; no orphan WPs.
- traceability: each D names which task(s) produce it; each non-special MS closes a D.
- chronology: MS month ≥ D month ≥ activity end month for the relevant tasks.
- distribution: lead-partner concentration < 50% on the coordinator; partners with relevant expertise lead their domains.
- specificity: titles/descriptions name a verifiable artifact (not generic "materials"); verification methods are concrete.
- dissemination: at least one PU deliverable in the dissemination WP; sustainability is a deliverable, not a sentence.

Output JSON:
{ "scores": { "coverage": <1-5>, "traceability": <1-5>, "chronology": <1-5>, "distribution": <1-5>, "specificity": <1-5>, "dissemination": <1-5> },
  "average": <number>,
  "weaknesses": ["<critic 1>", "<critic 2>", ...],
  "verdict": "ship|repair" }

If average ≥ 4 set verdict="ship". Otherwise "repair" with up to 3 weaknesses to fix. Output JSON only.`;

  const coordName = coordinator?.name || '?';
  const user = `Coordinator partner: "${coordName}".
Lead distribution across ${plan.deliverables.length} deliverables: ${leadSummary}.

DELIVERABLES:
${dLines}

MILESTONES:
${mLines}

Score now. Reminder: dissemination_level codes (PU, SEN, R-UE/EU-R, C-UE/EU-C, S-UE/EU-S) are EU classification labels, NOT partner names.`;

  return { system, user };
}

// ───────────────────────────────────────────────────────────────────
// Deterministic validator + auto-repair
// ───────────────────────────────────────────────────────────────────

/**
 * Apply the agreed deliverable-leader rule.
 * @returns partner_id or null when nothing resolves (caller will use last-resort fallback).
 */
function _resolveDeliverableLeader(d, ctx) {
  const { taskById, wpById, coordinator, partnerById } = ctx;
  // 1) Consensus among linked tasks: all task leaders identical → use that partner.
  const taskLeaders = (d.task_ids || [])
    .map(id => taskById[id]?.lead_partner_id)
    .filter(pid => pid && partnerById[pid]);
  if (taskLeaders.length) {
    const allSame = taskLeaders.every(pid => pid === taskLeaders[0]);
    if (allSame) return taskLeaders[0];
  }
  // 2) WP leader.
  const wp = wpById[d.wp_id];
  if (wp && wp.leader_id && partnerById[wp.leader_id]) return wp.leader_id;
  // 3) Project coordinator.
  if (coordinator && partnerById[coordinator.id]) return coordinator.id;
  return null;
}

/**
 * Milestones inherit responsibility from their linked deliverable when present;
 * otherwise fall back to WP leader → coordinator.
 */
function _resolveMilestoneLeader(m, ctx, plannedDeliverableByCode) {
  const { wpById, coordinator, partnerById } = ctx;
  // 1) Linked deliverable → use its (already resolved) leader.
  if (m.deliverable_id_ref) {
    const d = plannedDeliverableByCode[m.deliverable_id_ref];
    if (d && d.lead_partner_id && partnerById[d.lead_partner_id]) return d.lead_partner_id;
  }
  // 2) WP leader.
  const wp = wpById[m.wp_id];
  if (wp && wp.leader_id && partnerById[wp.leader_id]) return wp.leader_id;
  // 3) Project coordinator.
  if (coordinator && partnerById[coordinator.id]) return coordinator.id;
  return null;
}

function _validateAndRepair(plan, ctx, opts) {
  const errors = [];
  const fixes = [];
  const { partners, wps, tasks, activities } = ctx;
  const duration = ctx.project.duration_months || 24;
  const quotaInfo = opts && opts.quotaInfo ? opts.quotaInfo : _computeQuota(ctx, DEFAULT_TARGET);

  const partnerById = Object.fromEntries(partners.map(p => [p.id, p]));
  const taskById    = Object.fromEntries(tasks.map(t => [t.id, t]));
  const wpById      = Object.fromEntries(wps.map(w => [w.id, w]));
  const coordinator = partners.find(p => p.role === 'applicant');

  // Build per-task end_month from activities, by best-effort overlap with the WP's activities
  const wpEndMonth = {};
  const wpStartMonth = {};
  for (const wp of wps) {
    const acts = activities.filter(a => a.wp_id === wp.id);
    const ends = acts.map(a => a.gantt_end_month || a.gantt_start_month).filter(Boolean);
    const starts = acts.map(a => a.gantt_start_month).filter(Boolean);
    wpEndMonth[wp.id] = ends.length ? Math.max(...ends) : (wp.duration_to_month || duration);
    wpStartMonth[wp.id] = starts.length ? Math.min(...starts) : (wp.duration_from_month || 1);
  }

  // ── Deliverables ──
  if (!Array.isArray(plan.deliverables)) {
    errors.push({ field: 'deliverables', error: 'missing or not an array' });
    return { ok: false, errors, fixes, plan };
  }

  // Hard cap (absolute)
  if (plan.deliverables.length > HARD_CAP) {
    errors.push({ field: 'deliverables', error: `count ${plan.deliverables.length} exceeds absolute cap ${HARD_CAP}` });
  }
  // Total target
  if (plan.deliverables.length !== quotaInfo.target) {
    errors.push({ field: 'deliverables', error: `count ${plan.deliverables.length} != target ${quotaInfo.target}` });
  }
  // Per-WP quota
  const deliveriesByWp = {};
  for (const d of plan.deliverables) {
    if (!d.wp_id) continue;
    deliveriesByWp[d.wp_id] = (deliveriesByWp[d.wp_id] || 0) + 1;
  }
  for (const wp of wps) {
    const expected = quotaInfo.quota[wp.id] || 0;
    const got = deliveriesByWp[wp.id] || 0;
    if (got !== expected) {
      errors.push({ field: 'wp_quota', error: `WP ${wp.code}: expected ${expected} deliverables, got ${got}` });
    }
  }

  // Validate each
  const seenCodes = new Set();
  for (const d of plan.deliverables) {
    if (!d.code) errors.push({ code: d.code, error: 'missing code' });
    else if (seenCodes.has(d.code)) errors.push({ code: d.code, error: 'duplicate code' });
    else seenCodes.add(d.code);

    if (!wpById[d.wp_id]) errors.push({ code: d.code, error: `wp_id ${d.wp_id} not in project` });
    if (!Array.isArray(d.task_ids) || !d.task_ids.length) {
      errors.push({ code: d.code, error: 'no task_ids — every deliverable must cite ≥1 task' });
    } else {
      const bad = d.task_ids.filter(id => !taskById[id]);
      if (bad.length) errors.push({ code: d.code, error: `task_ids not in project: ${bad.join(',')}` });
    }
    if (!VALID_D_TYPES.includes(d.type)) {
      fixes.push({ code: d.code, field: 'type', from: d.type, to: 'R' });
      d.type = 'R';
    }
    if (!VALID_DL.includes(d.dissemination_level)) {
      fixes.push({ code: d.code, field: 'dissemination_level', from: d.dissemination_level, to: 'PU' });
      d.dissemination_level = 'PU';
    }

    // Chronology: due_month ≥ max(task end_month) for tasks in this WP
    if (wpById[d.wp_id]) {
      const wpEnd = wpEndMonth[d.wp_id];
      const wpStart = wpStartMonth[d.wp_id];
      if (typeof d.due_month !== 'number' || d.due_month < 1 || d.due_month > duration) {
        const fixed = Math.min(duration, Math.max(wpStart, wpEnd));
        fixes.push({ code: d.code, field: 'due_month', from: d.due_month, to: fixed, reason: 'invalid month' });
        d.due_month = fixed;
      }
      // If due_month < wpStart, push to wpStart (D can't exist before its WP starts)
      if (d.due_month < wpStart) {
        fixes.push({ code: d.code, field: 'due_month', from: d.due_month, to: wpStart, reason: 'before WP start' });
        d.due_month = wpStart;
      }
    }

    // ── Deterministic deliverable-leader rule ──────────────────────
    // Regla (acordada con Oscar):
    //   1) Si todas las tasks vinculadas (d.task_ids) comparten el mismo líder
    //      → ese partner lidera la deliverable.
    //   2) Si no hay consenso (o no hay tasks con líder) → líder del WP.
    //   3) Si el WP no tiene líder asignado → coordinador del proyecto.
    // Sobrescribe la elección de la IA siempre que la regla dé un resultado
    // diferente — así el responsable queda predecible y libre de ambigüedad.
    const ruleLeader = _resolveDeliverableLeader(d, { taskById, wpById, coordinator, partnerById });
    if (ruleLeader && ruleLeader !== d.lead_partner_id) {
      fixes.push({ code: d.code, field: 'lead_partner_id', from: d.lead_partner_id, to: ruleLeader, reason: 'rule: task-lead / WP-leader / coordinator' });
      d.lead_partner_id = ruleLeader;
    } else if (!partnerById[d.lead_partner_id]) {
      // Rule couldn't resolve (no tasks, no WP leader, no coordinator). Last-resort fallback.
      const fallback = coordinator?.id || partners[0]?.id || null;
      fixes.push({ code: d.code, field: 'lead_partner_id', from: d.lead_partner_id, to: fallback, reason: 'last-resort fallback' });
      d.lead_partner_id = fallback;
    }
  }

  // ── Zero orphan tasks (auto-repair) ──
  // Every wp_task must appear in at least one deliverable.task_ids of the
  // same WP. Auto-assign each orphan to the deliverable in its WP whose
  // due_month is the closest match (preferring later/equal months).
  const citedTaskIds = new Set();
  for (const d of plan.deliverables) {
    for (const tid of (d.task_ids || [])) citedTaskIds.add(tid);
  }
  const orphanTasks = tasks.filter(t => !citedTaskIds.has(t.id));
  for (const t of orphanTasks) {
    // Prefer a deliverable in the same WP. Among those, the one with the
    // largest due_month (because deliverables typically close their tasks).
    const candidates = plan.deliverables.filter(d => d.wp_id === t.work_package_id);
    let target = null;
    if (candidates.length) {
      target = candidates.slice().sort((a, b) => (b.due_month || 0) - (a.due_month || 0))[0];
    }
    if (target) {
      target.task_ids = Array.isArray(target.task_ids) ? target.task_ids : [];
      if (!target.task_ids.includes(t.id)) {
        target.task_ids.push(t.id);
        fixes.push({ code: target.code, field: 'task_ids', from: '(orphan)', to: t.code || t.id, reason: `orphan task ${t.code || ''} auto-assigned to closest D in WP` });
      }
    } else {
      errors.push({ task_id: t.id, error: `orphan task "${t.code || t.id}" — no deliverable in WP to attach it to` });
    }
  }

  // ── Milestones ──
  if (!Array.isArray(plan.milestones)) {
    errors.push({ field: 'milestones', error: 'missing or not an array' });
    return { ok: errors.length === 0, errors, fixes, plan };
  }

  // Build a code → deliverable lookup for ms.deliverable_id_ref
  const dByCode = Object.fromEntries(plan.deliverables.map(d => [d.code, d]));

  for (const m of plan.milestones) {
    if (!wpById[m.wp_id]) errors.push({ code: m.code, error: `wp_id ${m.wp_id} not in project` });

    if (m.kind === 'deliverable') {
      const d = dByCode[m.deliverable_id_ref];
      if (!d) {
        errors.push({ code: m.code, error: `deliverable_id_ref ${m.deliverable_id_ref} not found` });
      } else {
        // MS month ≥ D month
        if (typeof m.due_month !== 'number' || m.due_month < d.due_month) {
          fixes.push({ code: m.code, field: 'due_month', from: m.due_month, to: d.due_month, reason: `MS must close after its D ${d.code} (M${d.due_month})` });
          m.due_month = d.due_month;
        }
        // align WP with deliverable
        if (m.wp_id !== d.wp_id) {
          fixes.push({ code: m.code, field: 'wp_id', from: m.wp_id, to: d.wp_id, reason: 'align with deliverable' });
          m.wp_id = d.wp_id;
        }
      }
    } else if (m.kind === 'kickoff') {
      if (m.due_month !== 1) {
        fixes.push({ code: m.code, field: 'due_month', from: m.due_month, to: 1, reason: 'kickoff fixed at M1' });
        m.due_month = 1;
      }
    } else if (m.kind === 'closure') {
      if (m.due_month !== duration) {
        fixes.push({ code: m.code, field: 'due_month', from: m.due_month, to: duration, reason: `closure fixed at M${duration}` });
        m.due_month = duration;
      }
    } else {
      errors.push({ code: m.code, error: `unknown kind '${m.kind}'` });
    }

    // ── Deterministic milestone-leader rule ────────────────────────
    // Misma filosofía que en deliverables: si la milestone cierra una
    // deliverable concreta, hereda su líder; si no, líder del WP; si no,
    // coordinador del proyecto.
    const ruleMsLeader = _resolveMilestoneLeader(m, { wpById, coordinator, partnerById }, dByCode);
    if (ruleMsLeader && ruleMsLeader !== m.lead_partner_id) {
      fixes.push({ code: m.code, field: 'lead_partner_id', from: m.lead_partner_id, to: ruleMsLeader, reason: 'rule: linked-deliverable / WP-leader / coordinator' });
      m.lead_partner_id = ruleMsLeader;
    } else if (!partnerById[m.lead_partner_id]) {
      const fallback = coordinator?.id || partners[0]?.id || null;
      fixes.push({ code: m.code, field: 'lead_partner_id', from: m.lead_partner_id, to: fallback, reason: 'last-resort fallback' });
      m.lead_partner_id = fallback;
    }
  }

  // Re-number milestones contiguously by (due_month asc, kind kickoff < deliverable < closure)
  const kindWeight = { kickoff: 0, deliverable: 1, closure: 2 };
  plan.milestones.sort((a, b) => {
    if (a.due_month !== b.due_month) return a.due_month - b.due_month;
    return (kindWeight[a.kind] || 1) - (kindWeight[b.kind] || 1);
  });
  for (let i = 0; i < plan.milestones.length; i++) {
    const newCode = `MS${i + 1}`;
    if (plan.milestones[i].code !== newCode) {
      fixes.push({ code: plan.milestones[i].code, field: 'code', from: plan.milestones[i].code, to: newCode, reason: 'global renumbering' });
      plan.milestones[i].code = newCode;
    }
  }

  return { ok: errors.length === 0, errors, fixes, plan };
}

// ───────────────────────────────────────────────────────────────────
// AI plumbing
// ───────────────────────────────────────────────────────────────────

function _stripJson(s) {
  return String(s || '')
    .replace(/^\s*```json\s*/i, '')
    .replace(/^\s*```\s*/, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

async function _callAndParse(systemPrompt, userPrompt, maxTokens, label, projectId, userId) {
  const t0 = Date.now();
  let raw = null;
  let parsed = null;
  let status = 'success';
  try {
    raw = await ai.callClaude(systemPrompt, userPrompt, maxTokens);
    parsed = JSON.parse(_stripJson(raw));
  } catch (err) {
    status = 'error';
    await _logGen({ projectId, userId, kind: 'dms-v2', pass: label, systemPrompt, userPrompt, raw, parsed: null, validatorLog: { error: err.message }, status, durationMs: Date.now() - t0 });
    const e = new Error(`AI ${label} returned invalid JSON: ${err.message}`);
    e.status = 502;
    throw e;
  }
  await _logGen({ projectId, userId, kind: 'dms-v2', pass: label, systemPrompt, userPrompt, raw, parsed, validatorLog: null, status, durationMs: Date.now() - t0 });
  return parsed;
}

async function _logGen({ projectId, userId, kind, pass, systemPrompt, userPrompt, raw, parsed, validatorLog, status, durationMs }) {
  try {
    await db.execute(
      `INSERT INTO ai_generations (id, project_id, user_id, kind, pass, system_prompt, user_prompt, raw_response, parsed_json, validator_log, status, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [genUUID(), projectId, userId || null, kind, pass, systemPrompt || null, userPrompt || null, raw || null, parsed ? JSON.stringify(parsed) : null, validatorLog ? JSON.stringify(validatorLog) : null, status, durationMs || null]
    );
  } catch (err) {
    console.error('[ai_generations] insert failed:', err.message);
  }
}

// ───────────────────────────────────────────────────────────────────
// Persist
// ───────────────────────────────────────────────────────────────────

async function _snapshotCurrent(conn, projectId, userId, label) {
  // Capture ALL current D + MS + their task linkage. Used as a "restore point"
  // before _persist wipes the project's D/MS.
  const [delivs] = await conn.execute(`SELECT * FROM deliverables WHERE project_id = ?`, [projectId]);
  const [miles]  = await conn.execute(`SELECT * FROM milestones    WHERE project_id = ?`, [projectId]);
  let links = [];
  if (delivs.length) {
    const ids = delivs.map(d => d.id);
    const placeholders = ids.map(() => '?').join(',');
    const [linkRows] = await conn.execute(
      `SELECT * FROM deliverable_tasks WHERE deliverable_id IN (${placeholders})`,
      ids
    );
    links = linkRows;
  }
  if (!delivs.length && !miles.length) return null;  // nothing to snapshot
  const id = genUUID();
  await conn.execute(
    `INSERT INTO dms_snapshots (id, project_id, user_id, label, deliverables, milestones, deliverable_tasks)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, projectId, userId || null, label || null, JSON.stringify(delivs), JSON.stringify(miles), JSON.stringify(links)]
  );
  return id;
}

async function _persist(projectId, userId, plan, copy, critic, ctx) {
  const conn = await db.getConnection();
  const dCopyByCode = Object.fromEntries((copy.deliverables || []).map(d => [d.code, d]));
  const mCopyByCode = Object.fromEntries((copy.milestones || []).map(m => [m.code, m]));
  const score = (critic && typeof critic.average === 'number') ? critic.average : null;
  const now = new Date();

  try {
    await conn.beginTransaction();

    // Snapshot current state so the user can restore later
    const snapshotId = await _snapshotCurrent(conn, projectId, userId, 'pre-apply v2');

    // Wipe ALL existing D + MS for this project
    await conn.execute(`DELETE FROM milestones    WHERE project_id = ?`, [projectId]);
    await conn.execute(`DELETE FROM deliverables  WHERE project_id = ?`, [projectId]);

    // Insert deliverables (track new id by code for milestone linkage)
    const dIdByCode = {};
    for (let i = 0; i < plan.deliverables.length; i++) {
      const d = plan.deliverables[i];
      const c = dCopyByCode[d.code] || {};
      const id = genUUID();
      dIdByCode[d.code] = id;
      await conn.execute(
        `INSERT INTO deliverables
           (id, work_package_id, project_id, code, title, description, type, dissemination_level, due_month, lead_partner_id, sort_order, auto_generated, rationale, kpi, last_critic_score, last_critic_run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          id, d.wp_id, projectId, d.code,
          (c.title || d.code).slice(0, 250),
          c.description || null,
          d.type, d.dissemination_level, d.due_month, d.lead_partner_id, i,
          d.rationale || null,
          d.kpi || null,
          score, score != null ? now : null,
        ]
      );
      // Trace task linkage
      for (const taskId of (d.task_ids || [])) {
        try {
          await conn.execute(
            `INSERT INTO deliverable_tasks (deliverable_id, task_id) VALUES (?, ?)`,
            [id, taskId]
          );
        } catch (e) { /* dup pk */ }
      }
    }

    // Insert milestones
    for (let i = 0; i < plan.milestones.length; i++) {
      const m = plan.milestones[i];
      const c = mCopyByCode[m.code] || {};
      const linkedDelivId = m.deliverable_id_ref ? (dIdByCode[m.deliverable_id_ref] || null) : null;
      await conn.execute(
        `INSERT INTO milestones
           (id, work_package_id, project_id, code, title, description, due_month, verification, lead_partner_id, deliverable_id, sort_order, auto_generated, kind, rationale, last_critic_score, last_critic_run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          genUUID(), m.wp_id, projectId, m.code,
          (c.title || m.code).slice(0, 250),
          c.description || null,
          m.due_month, c.verification || m.verification || null, m.lead_partner_id, linkedDelivId, i,
          m.kind || null,
          m.rationale || null,
          score, score != null ? now : null,
        ]
      );
    }

    await conn.commit();
    return { snapshotId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ───────────────────────────────────────────────────────────────────
// Public entrypoints
// ───────────────────────────────────────────────────────────────────

/**
 * Generate a preview (no persistence). Returns the validated plan,
 * pretty copy, validator report and EACEA critic verdict.
 */
async function generatePreview(projectId, userId, opts) {
  const ctx = await _loadProjectContext(projectId, userId);
  if (!ctx.wps.length) {
    const err = new Error('Project has no work packages');
    err.status = 400; throw err;
  }
  if (!ctx.tasks.length) {
    const err = new Error('Project has no wp_tasks — generate tasks first (Tareas tab)');
    err.status = 400; throw err;
  }

  // Compute the per-WP deliverable quota up-front; reused for prompt + validator.
  const quotaInfo = _computeQuota(ctx, opts && opts.targetCount);
  const valOpts = { quotaInfo };

  // ── Pass 1: structural plan ──
  const p1 = _buildPass1Prompt(ctx, valOpts);
  let plan = await _callAndParse(p1.system, p1.user, PASS1_TOKENS, 'plan', projectId, userId);

  // Validate + auto-repair
  let v = _validateAndRepair(plan, ctx, valOpts);

  // Surgical retry if hard errors remain. Pass the canonical UUID lists
  // again so the AI cannot keep substituting codes for ids.
  let attempts = 0;
  while (!v.ok && attempts < MAX_REPAIR_ATTEMPTS) {
    attempts++;
    const wpUuids = ctx.wps.map(w => `  WP_ID="${w.id}" (${w.code} ${w.title})`).join('\n');
    const taskUuids = ctx.tasks.map(t => `  task_id="${t.id}" (${t.code || ''} ${t.title})`).join('\n');
    const partnerUuids = ctx.partners.map(p => `  partner_id="${p.id}" (${p.name})`).join('\n');
    const repairSystem = `You are repairing a deliverables/milestones JSON plan that failed validation. Fix ONLY the listed errors and return the corrected JSON. CRITICAL: wp_id, task_ids and lead_partner_id are UUID strings — copy them from the lists below verbatim. Do not use short codes like "WP1" or "T1.1". Output JSON only.`;
    const repairUser = `VALID UUIDs:
WPs:
${wpUuids}
TASKS:
${taskUuids}
PARTNERS:
${partnerUuids}

Original plan:
${JSON.stringify(plan, null, 2)}

Validation errors to fix:
${JSON.stringify(v.errors, null, 2)}

Return the corrected JSON now.`;
    plan = await _callAndParse(repairSystem, repairUser, PASS1_TOKENS, `plan-repair-${attempts}`, projectId, userId);
    v = _validateAndRepair(plan, ctx, valOpts);
  }

  if (!v.ok) {
    const err = new Error(`Plan failed validation after ${attempts} repairs: ${JSON.stringify(v.errors)}`);
    err.status = 502; throw err;
  }

  // ── Pass 2: copywriting ──
  const p2 = _buildPass2Prompt(ctx, plan);
  const copy = await _callAndParse(p2.system, p2.user, PASS2_TOKENS, 'copy', projectId, userId);

  // ── Pass 3: EACEA critic ──
  let critic = null;
  try {
    const p3 = _buildPass3Prompt(ctx, plan, copy);
    critic = await _callAndParse(p3.system, p3.user, PASS3_TOKENS, 'critic', projectId, userId);
  } catch (e) {
    critic = { error: e.message };
  }

  // Build a UI-friendly preview joining plan + copy
  const partnerById = Object.fromEntries(ctx.partners.map(p => [p.id, p.name]));
  const taskById    = Object.fromEntries(ctx.tasks.map(t => [t.id, { code: t.code, title: t.title, wp_code: t.wp_code }]));
  const wpById      = Object.fromEntries(ctx.wps.map(w => [w.id, w]));
  const dCopyByCode = Object.fromEntries((copy.deliverables || []).map(d => [d.code, d]));
  const mCopyByCode = Object.fromEntries((copy.milestones || []).map(m => [m.code, m]));

  const previewDeliverables = plan.deliverables.map(d => ({
    ...d,
    title: dCopyByCode[d.code]?.title || d.code,
    description: dCopyByCode[d.code]?.description || '',
    wp_code: wpById[d.wp_id]?.code,
    lead_partner_name: partnerById[d.lead_partner_id] || null,
    source_tasks: (d.task_ids || []).map(id => taskById[id]).filter(Boolean),
  }));

  const previewMilestones = plan.milestones.map(m => ({
    ...m,
    title: mCopyByCode[m.code]?.title || m.code,
    description: mCopyByCode[m.code]?.description || '',
    verification: mCopyByCode[m.code]?.verification || m.verification || '',
    wp_code: wpById[m.wp_id]?.code,
    lead_partner_name: partnerById[m.lead_partner_id] || null,
  }));

  return {
    plan,         // raw validated plan with internal ids
    copy,         // raw copy
    deliverables: previewDeliverables,
    milestones:   previewMilestones,
    validator: { fixes: v.fixes, repair_attempts: attempts },
    critic,
    cap: HARD_CAP,
    target: quotaInfo.target,
    quota_by_wp: ctx.wps.map(wp => ({ wp_id: wp.id, code: wp.code, count: quotaInfo.quota[wp.id] || 0 })),
  };
}

/**
 * Persist a previously generated preview. The preview must have been
 * produced by generatePreview() in the same request flow — clients re-post
 * the {plan, copy} payload they got back.
 */
async function applyPreview(projectId, userId, payload) {
  const ctx = await _loadProjectContext(projectId, userId);
  if (!payload || !payload.plan || !payload.copy) {
    const err = new Error('Missing plan/copy in payload');
    err.status = 400; throw err;
  }

  // Re-validate before persist using the same per-WP quota that was used
  // for the preview. Infer the target from the plan's own deliverable count
  // (clamped to [HARD_MIN, HARD_CAP]) so re-validation aligns with what the
  // user accepted.
  const inferredTarget = payload.plan.deliverables?.length || DEFAULT_TARGET;
  const quotaInfo = _computeQuota(ctx, inferredTarget);
  const v = _validateAndRepair(payload.plan, ctx, { quotaInfo });
  if (!v.ok) {
    const err = new Error(`Plan failed re-validation: ${JSON.stringify(v.errors)}`);
    err.status = 400; throw err;
  }

  const result = await _persist(projectId, userId, payload.plan, payload.copy, payload.critic || null, ctx);

  return {
    persisted: true,
    deliverables_count: payload.plan.deliverables.length,
    milestones_count:   payload.plan.milestones.length,
    snapshot_id:        result.snapshotId,
  };
}

// ───────────────────────────────────────────────────────────────────
// Programme metadata: cap recommended for the project's call action
// ───────────────────────────────────────────────────────────────────

async function listProjectTasks(projectId, userId) {
  const [proj] = await db.execute(`SELECT id FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]);
  if (!proj.length) { const e = new Error('Project not found'); e.status = 404; throw e; }
  const [rows] = await db.execute(
    `SELECT t.id, t.work_package_id, t.code, t.title, wp.code AS wp_code, wp.order_index
       FROM wp_tasks t JOIN work_packages wp ON wp.id = t.work_package_id
      WHERE t.project_id = ? ORDER BY wp.order_index, t.sort_order`,
    [projectId]
  );
  return rows;
}

async function getProgrammeMeta(projectId, userId) {
  const [rows] = await db.execute(
    `SELECT p.type, p.duration_months, p.proposal_lang, ip.name AS programme_name, ip.action_type, ip.eu_grant_max
       FROM projects p
       LEFT JOIN intake_programs ip ON ip.action_type = p.type
      WHERE p.id = ? AND p.user_id = ?`,
    [projectId, userId]
  );
  if (!rows.length) {
    const err = new Error('Project not found'); err.status = 404; throw err;
  }
  const r = rows[0];
  const t = String(r.type || '').toUpperCase();
  let cap_recommended = HARD_CAP;
  let cap_reason = 'EACEA general guidance';
  if (t.includes('SSCP') || t.includes('KA210')) { cap_recommended = 8;  cap_reason = 'KA210 Small-scale: lean set, 6–10 typical'; }
  else if (t.includes('KA220'))                   { cap_recommended = 13; cap_reason = 'KA220 Cooperation Partnership: 12–15 balanced'; }
  else if (t.includes('KA3') || t.includes('NETWORK') || t.includes('POLICY')) { cap_recommended = 15; cap_reason = 'KA3 Policy: substantial outputs expected'; }
  return {
    project_type: r.type,
    programme_name: r.programme_name,
    proposal_lang: r.proposal_lang,
    duration_months: r.duration_months,
    cap_recommended,
    cap_hard: HARD_CAP,
    cap_reason,
  };
}

// ───────────────────────────────────────────────────────────────────
// Stand-alone validation of an arbitrary plan (used by the editable
// tables to live-check after manual edits).
// ───────────────────────────────────────────────────────────────────

async function validateExistingPlan(projectId, userId) {
  const ctx = await _loadProjectContext(projectId, userId);

  // Build a plan-shaped object from the persisted state (D + MS).
  const [delivs] = await db.execute(
    `SELECT id, work_package_id, code, type, dissemination_level, due_month, lead_partner_id
       FROM deliverables WHERE project_id = ? ORDER BY sort_order`,
    [projectId]
  );
  const [miles] = await db.execute(
    `SELECT id, work_package_id, code, due_month, lead_partner_id, deliverable_id, kind
       FROM milestones WHERE project_id = ? ORDER BY sort_order`,
    [projectId]
  );
  const [tasks] = await db.execute(
    `SELECT deliverable_id, task_id FROM deliverable_tasks WHERE deliverable_id IN
       (SELECT id FROM deliverables WHERE project_id = ?)`,
    [projectId]
  );

  const tasksByD = {};
  for (const t of tasks) {
    if (!tasksByD[t.deliverable_id]) tasksByD[t.deliverable_id] = [];
    tasksByD[t.deliverable_id].push(t.task_id);
  }
  const dById = Object.fromEntries(delivs.map(d => [d.id, d]));

  const plan = {
    deliverables: delivs.map(d => ({
      code: d.code, wp_id: d.work_package_id, task_ids: tasksByD[d.id] || [],
      type: d.type, dissemination_level: d.dissemination_level,
      due_month: d.due_month, lead_partner_id: d.lead_partner_id,
    })),
    milestones: miles.map(m => {
      // Heuristic for legacy rows where `kind` is NULL: only month=1 is plausibly kickoff,
      // only month=duration is plausibly closure; otherwise treat as deliverable-closing
      // (validator will then flag missing deliverable_id_ref as a real issue).
      let kind = m.kind;
      if (!kind) {
        const dur = ctx.project.duration_months || 24;
        if (m.due_month === 1) kind = 'kickoff';
        else if (m.due_month === dur) kind = 'closure';
        else kind = 'deliverable';
      }
      return {
        code: m.code, wp_id: m.work_package_id, due_month: m.due_month,
        lead_partner_id: m.lead_partner_id,
        deliverable_id_ref: m.deliverable_id ? dById[m.deliverable_id]?.code : null,
        kind,
      };
    }),
  };

  // Re-validate WITHOUT mutating anything
  const cloned = JSON.parse(JSON.stringify(plan));
  const v = _validateAndRepair(cloned, ctx);
  return {
    ok: v.ok,
    errors: v.errors,
    suggested_fixes: v.fixes,
  };
}

// ───────────────────────────────────────────────────────────────────
// Auto-link orphan milestones to their best-match deliverable
// (heuristic: same WP + closest due_month, prefer same lead partner).
// ───────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────
// Apply the deterministic fixes the validator suggested, in-place,
// without regenerating anything via AI. Useful when the user wants
// to clean up an existing plan without redoing the whole flow.
// ───────────────────────────────────────────────────────────────────

async function applySuggestedFixes(projectId, userId) {
  const ctx = await _loadProjectContext(projectId, userId);

  // Snapshot first so the operation is reversible
  const conn = await db.getConnection();
  let snapshotId = null;
  try {
    snapshotId = await _snapshotCurrent(conn, projectId, userId, 'pre-apply-fixes');
  } catch (e) { /* non-fatal */ }
  finally { conn.release(); }

  // Build plan from current persisted state, run the validator (which mutates
  // the plan with fixes), then write the mutations back to DB.
  const [delivs] = await db.execute(
    `SELECT id, work_package_id, code, type, dissemination_level, due_month, lead_partner_id
       FROM deliverables WHERE project_id = ? ORDER BY sort_order`,
    [projectId]
  );
  const [miles] = await db.execute(
    `SELECT id, work_package_id, code, due_month, lead_partner_id, deliverable_id, kind
       FROM milestones WHERE project_id = ? ORDER BY sort_order`,
    [projectId]
  );
  const [taskLinks] = await db.execute(
    `SELECT deliverable_id, task_id FROM deliverable_tasks WHERE deliverable_id IN
       (SELECT id FROM deliverables WHERE project_id = ?)`,
    [projectId]
  );
  const tasksByD = {};
  for (const t of taskLinks) (tasksByD[t.deliverable_id] ||= []).push(t.task_id);

  const dById = Object.fromEntries(delivs.map(d => [d.id, d]));
  const duration = ctx.project.duration_months || 24;

  // Build plan with the SAME id mapping so we can write back
  const plan = {
    deliverables: delivs.map(d => ({
      _persistedId: d.id,
      code: d.code, wp_id: d.work_package_id, task_ids: tasksByD[d.id] || [],
      type: d.type, dissemination_level: d.dissemination_level,
      due_month: d.due_month, lead_partner_id: d.lead_partner_id,
    })),
    milestones: miles.map(m => {
      let kind = m.kind;
      if (!kind) {
        if (m.due_month === 1) kind = 'kickoff';
        else if (m.due_month === duration) kind = 'closure';
        else kind = 'deliverable';
      }
      return {
        _persistedId: m.id,
        code: m.code, wp_id: m.work_package_id, due_month: m.due_month,
        lead_partner_id: m.lead_partner_id,
        deliverable_id_ref: m.deliverable_id ? dById[m.deliverable_id]?.code : null,
        kind,
      };
    }),
  };

  const v = _validateAndRepair(plan, ctx);

  // Apply the mutations from the validator to DB
  let updated = 0;
  for (const d of plan.deliverables) {
    await db.execute(
      `UPDATE deliverables SET code = ?, type = ?, dissemination_level = ?, due_month = ?, lead_partner_id = ?
        WHERE id = ?`,
      [d.code, d.type, d.dissemination_level, d.due_month, d.lead_partner_id, d._persistedId]
    );
    updated++;
  }
  // Re-link MS to D by code
  const dIdByCode = Object.fromEntries(delivs.map(d => [d.code, d.id]));
  for (const m of plan.milestones) {
    const newDelivId = m.deliverable_id_ref ? (dIdByCode[m.deliverable_id_ref] || null) : null;
    await db.execute(
      `UPDATE milestones SET code = ?, due_month = ?, lead_partner_id = ?, deliverable_id = ?, kind = ?
        WHERE id = ?`,
      [m.code, m.due_month, m.lead_partner_id, newDelivId, m.kind, m._persistedId]
    );
    updated++;
  }

  return {
    applied: v.fixes.length,
    rows_updated: updated,
    snapshot_id: snapshotId,
    remaining_errors: v.errors.length,
  };
}

async function autolinkOrphanMilestones(projectId, userId) {
  // Confirm ownership
  const [proj] = await db.execute(
    `SELECT id FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]
  );
  if (!proj.length) { const e = new Error('Project not found'); e.status = 404; throw e; }

  const [orphans] = await db.execute(
    `SELECT id, work_package_id, due_month, lead_partner_id, code
       FROM milestones
      WHERE project_id = ? AND deliverable_id IS NULL
        AND (kind IS NULL OR kind = 'deliverable' OR kind = '')`,
    [projectId]
  );
  const [delivs] = await db.execute(
    `SELECT id, work_package_id, due_month, lead_partner_id, code
       FROM deliverables WHERE project_id = ?`,
    [projectId]
  );

  const linked = [];
  for (const m of orphans) {
    const candidates = delivs.filter(d => d.work_package_id === m.work_package_id);
    if (!candidates.length) continue;
    // Score: prefer matching lead and closest due_month
    let best = null, bestScore = Infinity;
    for (const d of candidates) {
      const monthDist = Math.abs((d.due_month || 0) - (m.due_month || 0));
      const leadPenalty = (d.lead_partner_id && m.lead_partner_id && d.lead_partner_id !== m.lead_partner_id) ? 5 : 0;
      const score = monthDist + leadPenalty;
      if (score < bestScore) { best = d; bestScore = score; }
    }
    if (best && bestScore <= 3) {  // only auto-link when reasonably close in time
      await db.execute(
        `UPDATE milestones SET deliverable_id = ?, kind = 'deliverable' WHERE id = ?`,
        [best.id, m.id]
      );
      linked.push({ milestone_code: m.code, deliverable_code: best.code, score: bestScore });
    }
  }

  return { linked_count: linked.length, total_orphans: orphans.length, links: linked };
}

// ───────────────────────────────────────────────────────────────────
// Regenerate a single deliverable (and its closing milestone if any)
// using the same 3-pass machinery but locked to that one D's slot.
// ───────────────────────────────────────────────────────────────────

async function regenerateDeliverable(deliverableId, userId, hint) {
  const [rows] = await db.execute(
    `SELECT d.*, p.user_id FROM deliverables d
       JOIN projects p ON p.id = d.project_id
      WHERE d.id = ? AND p.user_id = ?`,
    [deliverableId, userId]
  );
  if (!rows.length) { const e = new Error('Deliverable not found'); e.status = 404; throw e; }
  const d = rows[0];
  const ctx = await _loadProjectContext(d.project_id, userId);

  const [taskLinks] = await db.execute(
    `SELECT t.id, t.code, t.title, t.description FROM deliverable_tasks dt
       JOIN wp_tasks t ON t.id = dt.task_id WHERE dt.deliverable_id = ?`,
    [deliverableId]
  );

  const wp = ctx.wps.find(w => w.id === d.work_package_id);
  const partners = ctx.partners.map(p => `  partner_id="${p.id}" | ${p.name} (${p.country})`).join('\n');
  const taskList = taskLinks.length
    ? taskLinks.map(t => `  task_id="${t.id}" | ${t.code} ${t.title}${t.description ? ' — ' + t.description.slice(0, 200) : ''}`).join('\n')
    : ctx.tasks.filter(t => t.work_package_id === d.work_package_id)
        .map(t => `  task_id="${t.id}" | ${t.code} ${t.title}`).join('\n');

  const lang = ctx.project.proposal_lang === 'es' ? 'Spanish' : 'English';

  const system = `You are improving ONE deliverable in an Erasmus+ proposal. Output an EACEA-grade title and description in ${lang}.
Quality bar:
${FEW_SHOT_EXAMPLES.split('\n\n')[0]}

Output JSON only:
{ "title": "<≤8 words, names the artifact>", "description": "<one line, ~15–25 words, includes format/lang/length>", "rationale": "<one sentence why this D exists>", "kpi": "<one verifiable indicator like '≥50 attendees' or '20+ pages PDF'>" }`;

  const user = `WP ${wp?.code} — ${wp?.title}
Tasks this deliverable covers (or could cover):
${taskList}

Partners:
${partners}

Current values: code=${d.code} type=${d.type} dl=${d.dissemination_level} M${d.due_month}
Current title: "${d.title}"
Current description: ${d.description || '(empty)'}

User hint: ${hint || '(none — just upgrade the prose)'}

Return JSON only.`;

  const t0 = Date.now();
  const raw = await ai.callClaude(system, user, 1500);
  const parsed = JSON.parse(_stripJson(raw));
  await _logGen({ projectId: d.project_id, userId, kind: 'dms-v2', pass: 'regen-d', systemPrompt: system, userPrompt: user, raw, parsed, validatorLog: null, status: 'success', durationMs: Date.now() - t0 });

  await db.execute(
    `UPDATE deliverables SET title = ?, description = ?, rationale = ?, kpi = ?, auto_generated = 1 WHERE id = ?`,
    [(parsed.title || d.title).slice(0, 250), parsed.description || null, parsed.rationale || null, parsed.kpi || null, deliverableId]
  );

  return { id: deliverableId, ...parsed };
}

// ───────────────────────────────────────────────────────────────────
// Snapshot listing + restore
// ───────────────────────────────────────────────────────────────────

async function listSnapshots(projectId, userId) {
  const [proj] = await db.execute(
    `SELECT id FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]
  );
  if (!proj.length) { const e = new Error('Project not found'); e.status = 404; throw e; }
  const [rows] = await db.execute(
    `SELECT id, label, created_at,
            JSON_LENGTH(deliverables) AS d_count, JSON_LENGTH(milestones) AS m_count
       FROM dms_snapshots
      WHERE project_id = ? ORDER BY created_at DESC LIMIT 20`,
    [projectId]
  );
  return rows;
}

async function restoreSnapshot(snapshotId, userId) {
  const [rows] = await db.execute(
    `SELECT s.*, p.user_id FROM dms_snapshots s
       JOIN projects p ON p.id = s.project_id
      WHERE s.id = ? AND p.user_id = ?`,
    [snapshotId, userId]
  );
  if (!rows.length) { const e = new Error('Snapshot not found'); e.status = 404; throw e; }
  const snap = rows[0];
  const projectId = snap.project_id;
  const delivs = typeof snap.deliverables === 'string' ? JSON.parse(snap.deliverables) : snap.deliverables;
  const miles  = typeof snap.milestones    === 'string' ? JSON.parse(snap.milestones)    : snap.milestones;
  const links  = snap.deliverable_tasks ? (typeof snap.deliverable_tasks === 'string' ? JSON.parse(snap.deliverable_tasks) : snap.deliverable_tasks) : [];

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // Snapshot CURRENT state before overwriting (so restore is also reversible)
    await _snapshotCurrent(conn, projectId, userId, 'pre-restore');

    await conn.execute(`DELETE FROM milestones    WHERE project_id = ?`, [projectId]);
    await conn.execute(`DELETE FROM deliverables  WHERE project_id = ?`, [projectId]);

    for (const d of delivs) {
      await conn.execute(
        `INSERT INTO deliverables (id, work_package_id, project_id, code, title, description, type, dissemination_level, due_month, sort_order, lead_partner_id, auto_generated, rationale, kpi, last_critic_score, last_critic_run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.id, d.work_package_id, d.project_id, d.code, d.title, d.description, d.type, d.dissemination_level, d.due_month, d.sort_order, d.lead_partner_id, d.auto_generated || 0, d.rationale || null, d.kpi || null, d.last_critic_score || null, d.last_critic_run_at || null]
      );
    }
    for (const link of links) {
      try {
        await conn.execute(`INSERT INTO deliverable_tasks (deliverable_id, task_id) VALUES (?, ?)`, [link.deliverable_id, link.task_id]);
      } catch (e) { /* ignore */ }
    }
    for (const m of miles) {
      await conn.execute(
        `INSERT INTO milestones (id, work_package_id, project_id, code, title, description, due_month, verification, sort_order, lead_partner_id, deliverable_id, auto_generated, kind, rationale, last_critic_score, last_critic_run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.id, m.work_package_id, m.project_id, m.code, m.title, m.description, m.due_month, m.verification, m.sort_order, m.lead_partner_id, m.deliverable_id, m.auto_generated || 0, m.kind || null, m.rationale || null, m.last_critic_score || null, m.last_critic_run_at || null]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback(); throw err;
  } finally {
    conn.release();
  }
  return { restored: true, deliverables_count: delivs.length, milestones_count: miles.length };
}

// ───────────────────────────────────────────────────────────────────
// AI history (audit log) listing
// ───────────────────────────────────────────────────────────────────

async function listAiHistory(projectId, userId, limit = 30) {
  const [proj] = await db.execute(
    `SELECT id FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]
  );
  if (!proj.length) { const e = new Error('Project not found'); e.status = 404; throw e; }
  // mysql2 prepared statements treat LIMIT ? oddly in some versions — inline the safe integer.
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 30));
  const [rows] = await db.execute(
    `SELECT id, kind, pass, status, duration_ms, created_at
       FROM ai_generations
      WHERE project_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [projectId]
  );
  return rows;
}

// ───────────────────────────────────────────────────────────────────
// Comments thread (per D or MS)
// ───────────────────────────────────────────────────────────────────

async function listComments(projectId, userId, targetKind, targetId) {
  const [proj] = await db.execute(`SELECT id FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]);
  if (!proj.length) { const e = new Error('Project not found'); e.status = 404; throw e; }
  const [rows] = await db.execute(
    `SELECT id, target_kind, target_id, body, resolved, author_id, created_at, updated_at
       FROM dms_comments
      WHERE project_id = ? AND target_kind = ? AND target_id = ?
      ORDER BY created_at ASC`,
    [projectId, targetKind, targetId]
  );
  return rows;
}

async function listAllComments(projectId, userId) {
  const [proj] = await db.execute(`SELECT id FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]);
  if (!proj.length) { const e = new Error('Project not found'); e.status = 404; throw e; }
  const [rows] = await db.execute(
    `SELECT id, target_kind, target_id, body, resolved, created_at
       FROM dms_comments WHERE project_id = ? ORDER BY created_at DESC`,
    [projectId]
  );
  return rows;
}

async function createComment(projectId, userId, body) {
  if (!body || !body.target_kind || !body.target_id || !body.text) {
    const e = new Error('Missing target_kind/target_id/text'); e.status = 400; throw e;
  }
  const [proj] = await db.execute(`SELECT id FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]);
  if (!proj.length) { const e = new Error('Project not found'); e.status = 404; throw e; }
  const id = genUUID();
  await db.execute(
    `INSERT INTO dms_comments (id, project_id, target_kind, target_id, author_id, body) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, projectId, body.target_kind, body.target_id, userId, String(body.text).slice(0, 4000)]
  );
  return { id };
}

async function updateComment(commentId, userId, body) {
  // Check ownership through project
  const [rows] = await db.execute(
    `SELECT c.id FROM dms_comments c JOIN projects p ON p.id = c.project_id WHERE c.id = ? AND p.user_id = ?`,
    [commentId, userId]
  );
  if (!rows.length) { const e = new Error('Comment not found'); e.status = 404; throw e; }
  const sets = [];
  const vals = [];
  if (typeof body.text === 'string') { sets.push('body = ?'); vals.push(body.text.slice(0, 4000)); }
  if (typeof body.resolved === 'boolean') { sets.push('resolved = ?'); vals.push(body.resolved ? 1 : 0); }
  if (!sets.length) return { id: commentId };
  vals.push(commentId);
  await db.execute(`UPDATE dms_comments SET ${sets.join(', ')} WHERE id = ?`, vals);
  return { id: commentId };
}

async function deleteComment(commentId, userId) {
  const [rows] = await db.execute(
    `SELECT c.id FROM dms_comments c JOIN projects p ON p.id = c.project_id WHERE c.id = ? AND p.user_id = ?`,
    [commentId, userId]
  );
  if (!rows.length) { const e = new Error('Comment not found'); e.status = 404; throw e; }
  await db.execute(`DELETE FROM dms_comments WHERE id = ?`, [commentId]);
  return { deleted: true };
}

// ───────────────────────────────────────────────────────────────────
// CSV export (Application Form 4.2 table layout)
// ───────────────────────────────────────────────────────────────────

function _csvCell(s) {
  if (s == null) return '';
  const str = String(s).replace(/"/g, '""');
  return /[",\n;]/.test(str) ? `"${str}"` : str;
}

async function exportCsv(projectId, userId) {
  const [proj] = await db.execute(`SELECT id, name FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]);
  if (!proj.length) { const e = new Error('Project not found'); e.status = 404; throw e; }

  const [delivs] = await db.execute(
    `SELECT d.*, wp.code AS wp_code, p.name AS lead_name
       FROM deliverables d
       JOIN work_packages wp ON wp.id = d.work_package_id
       LEFT JOIN partners p ON p.id = d.lead_partner_id
      WHERE d.project_id = ? ORDER BY wp.order_index, d.sort_order`,
    [projectId]
  );
  const [taskLinks] = await db.execute(
    `SELECT dt.deliverable_id, t.code FROM deliverable_tasks dt
       JOIN wp_tasks t ON t.id = dt.task_id
      WHERE dt.deliverable_id IN (SELECT id FROM deliverables WHERE project_id = ?)`,
    [projectId]
  );
  const tasksByD = {};
  for (const tl of taskLinks) {
    (tasksByD[tl.deliverable_id] ||= []).push(tl.code);
  }
  const [miles] = await db.execute(
    `SELECT m.*, wp.code AS wp_code, p.name AS lead_name, d.code AS d_code
       FROM milestones m
       JOIN work_packages wp ON wp.id = m.work_package_id
       LEFT JOIN partners p ON p.id = m.lead_partner_id
       LEFT JOIN deliverables d ON d.id = m.deliverable_id
      WHERE m.project_id = ? ORDER BY wp.order_index, m.sort_order`,
    [projectId]
  );

  const lines = [];
  lines.push('# DELIVERABLES');
  lines.push(['WP', 'Code', 'Title', 'Description', 'Type', 'Dissemination', 'Due Month', 'Lead', 'Source Tasks', 'KPI', 'Rationale']
    .map(_csvCell).join(','));
  for (const d of delivs) {
    lines.push([
      d.wp_code, d.code, d.title, d.description, d.type, d.dissemination_level,
      d.due_month, d.lead_name, (tasksByD[d.id] || []).join(' + '), d.kpi, d.rationale,
    ].map(_csvCell).join(','));
  }
  lines.push('');
  lines.push('# MILESTONES');
  lines.push(['WP', 'Code', 'Title', 'Description', 'Due Month', 'Verification', 'Lead', 'Closes Deliverable', 'Kind']
    .map(_csvCell).join(','));
  for (const m of miles) {
    lines.push([
      m.wp_code, m.code, m.title, m.description, m.due_month, m.verification,
      m.lead_name, m.d_code || '', m.kind || '',
    ].map(_csvCell).join(','));
  }
  return lines.join('\n');
}

module.exports = {
  generatePreview,
  applyPreview,
  listProjectTasks,
  validateExistingPlan,
  applySuggestedFixes,
  autolinkOrphanMilestones,
  regenerateDeliverable,
  getProgrammeMeta,
  listSnapshots,
  restoreSnapshot,
  listAiHistory,
  listComments,
  listAllComments,
  createComment,
  updateComment,
  deleteComment,
  exportCsv,
  // Exposed for unit tests
  _validateAndRepair,
  _loadProjectContext,
  HARD_CAP,
};
