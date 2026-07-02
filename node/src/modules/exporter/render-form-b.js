/**
 * Renders an EACEA Application Form Part B (BB / LSII) as a .docx buffer
 * by feeding the official template (docs/templates/form_part_b_eacea_template.docx)
 * to docxtemplater.
 *
 * Phase 1 fills:
 *   · cover-page metadata (title, acronym, coordinator)
 *   · 16 narrative "Insert text" anchors mapped to Writer fields
 *
 * Phase 2 fills the dynamic-row tables:
 *   · 2.1.3 Staff
 *   · 2.1.5 Risks
 *   · 4.2 Work Packages (with nested Tasks, Milestones, Deliverables)
 *   · 4.2 Staff effort per WP
 *   · 4.2 Events meetings and mobility
 *   · 4.2 Timetable Gantt (24-month grid)
 *   · Annex List of previous projects
 *
 * Tables we don't have data for (Subcontracting, Staff effort per participant,
 * Estimated budget per WP) are left as the template's empty rows — they're
 * "n/a for prefixed Lump Sum Grants" anyway.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { capNarrative, capTableRows, truncate } = require('./field-limits');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', '..', 'docs', 'templates', 'form_part_b_eacea_template.docx');

let cachedTemplateBuffer = null;
function loadTemplate() {
  if (!cachedTemplateBuffer) cachedTemplateBuffer = fs.readFileSync(TEMPLATE_PATH);
  return cachedTemplateBuffer;
}

// ── Plain-text normalization for narrative fields ──────────────────────────

function normalizeWriterText(text) {
  if (!text) return '';
  let s = String(text).replace(/\r\n/g, '\n');
  s = s
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, m => m.replace(/\s+$/, ' '));
  return s.trim();
}

// ── Data shaping helpers ───────────────────────────────────────────────────

function leaderName(ctx, leaderId) {
  if (!leaderId) return '';
  const p = ctx.partnerById[leaderId];
  return p ? (p.legal_name || p.name || '') : '';
}

function partnerCode(ctx, partnerId) {
  if (!partnerId) return '';
  const idx = ctx.partners.findIndex(p => p.id === partnerId);
  return idx >= 0 ? `P${idx + 1}` : '';
}

const blank = v => (v == null ? '' : String(v));

function buildStaff(ctx) {
  return (ctx.selectedStaff || []).map(s => ({
    staff_name_function: blank(s.full_name),
    staff_organisation: blank(s.partner_legal_name || s.partner_name),
    staff_role_tasks: blank(s.project_role || s.directory_role),
    staff_profile: blank(s.custom_skills && s.custom_skills.trim() ? s.custom_skills : s.directory_bio),
  }));
}

function buildRisks(ctx) {
  const wpCode = {};
  for (const w of (ctx.wps || [])) wpCode[w.id] = w.code || '';
  return (ctx.risks || []).map(r => ({
    risk_no: blank(r.risk_no),
    risk_description: [
      r.description || '',
      (r.impact || r.likelihood) ? `(Impact: ${r.impact || '—'}, Likelihood: ${r.likelihood || '—'})` : '',
    ].filter(Boolean).join(' '),
    risk_wp_code: r.wp_id ? blank(wpCode[r.wp_id]) : 'cross-cutting',
    risk_mitigation: blank(r.mitigation),
  }));
}

function buildWPs(ctx) {
  return (ctx.wps || []).map((wp, idx) => {
    const wpNum = idx + 1;
    const dur = `M${wp.duration_from_month || 1} - M${wp.duration_to_month || ctx.project.duration_months || '?'}`;

    // Compose wp_objectives = short objectives/summary from BD +
    // (if available) the full per-WP narrative chapter from the Master.
    // The Master narrative is the rich prose written by the LLM during
    // compile (rationale, methodology, KPIs, division of work). Without
    // this concat, the docx WP section is too sparse.
    const shortObj = normalizeWriterText(wp.objectives || wp.summary || '');
    const masterNar = normalizeWriterText(wp.masterNarrative || '');
    let composedObj = shortObj;
    if (masterNar && masterNar.length > 200) {
      composedObj = shortObj
        ? `${shortObj}\n\n${masterNar}`
        : masterNar;
    }

    // Tabla de presupuesto WP × partner × categoría — concatenada como texto
    // legible al final de wp_objectives porque el template del .docx no tiene
    // placeholders para "Estimated budget per WP". Si el evaluador necesita
    // el desglose, lo encuentra aquí.
    const budget = wp.budget;
    if (budget && Array.isArray(budget.rows) && budget.rows.length) {
      const hasMoney = budget.rows.some(r => Number(r.total) > 0);
      if (hasMoney) {
        const fmt = n => Math.round(Number(n) || 0).toLocaleString('es-ES');
        const lines = [];
        lines.push('');
        lines.push('───────────────────────────────────────');
        lines.push('ESTIMATED BUDGET — RESOURCES (Work Package breakdown)');
        lines.push('───────────────────────────────────────');
        for (const r of budget.rows) {
          if (Number(r.total) <= 0) continue;
          const acronym = r.acronym || r.name || '?';
          const segs = [];
          if (Number(r.a_personnel) > 0)       segs.push(`A Personnel ${fmt(r.a_personnel)} €`);
          if (Number(r.b_subcontracting) > 0)  segs.push(`B Subcontracting ${fmt(r.b_subcontracting)} €`);
          const c1 = Number(r.c1a_travel) + Number(r.c1b_accommodation) + Number(r.c1c_subsistence);
          if (c1 > 0)                           segs.push(`C1 Travel+Stay ${fmt(c1)} €`);
          if (Number(r.c2_equipment) > 0)      segs.push(`C2 Equipment ${fmt(r.c2_equipment)} €`);
          if (Number(r.c3_other) > 0)          segs.push(`C3 Other ${fmt(r.c3_other)} €`);
          if (Number(r.d1_third_parties) > 0)  segs.push(`D1 FSTP ${fmt(r.d1_third_parties)} €`);
          if (Number(r.e_indirect) > 0)        segs.push(`Indirect ${fmt(r.e_indirect)} €`);
          lines.push(`• ${acronym}${r.is_coordinator ? ' (coord.)' : ''}: ${segs.join(' · ')}. TOTAL ${fmt(r.total)} €.`);
        }
        lines.push('');
        lines.push(`Work Package total: ${fmt(budget.total)} € (indirect ${budget.indirect_pct || 0}% included).`);
        composedObj = composedObj + '\n\n' + lines.join('\n');
      }
    }

    return {
      wp_number: wpNum,
      wp_title: blank(wp.title || wp.code),
      wp_duration: dur,
      wp_lead: leaderName(ctx, wp.leader_id),
      wp_objectives: composedObj,
      tasks: (wp.tasks || []).map(t => ({
        task_no: blank(t.code),
        task_name: blank(t.title),
        task_description: blank(t.description),
        task_participant_name: leaderName(ctx, wp.leader_id),
        task_participant_role: 'COO',
        task_in_kind: blank(t.in_kind_subcontracting),
      })),
      milestones: (wp.milestones || []).map(m => ({
        ms_no: blank(m.code),
        ms_name: blank(m.title),
        ms_wp_no: wpNum,
        ms_lead: leaderName(ctx, m.lead_partner_id || wp.leader_id),
        ms_description: blank(m.description),
        ms_due: m.due_month != null ? `M${m.due_month}` : '',
        ms_verification: blank(m.verification),
      })),
      deliverables: (wp.deliverables || []).map(d => ({
        del_no: blank(d.code),
        del_name: blank(d.title),
        del_wp_no: wpNum,
        del_lead: leaderName(ctx, d.lead_partner_id || wp.leader_id),
        del_type: blank(d.type),
        del_dissemination: blank(d.dissemination_level),
        del_due: d.due_month != null ? `M${d.due_month}` : '',
        del_description: blank(d.description),
      })),
    };
  });
}

function buildWpsEffort(ctx) {
  return (ctx.wps || []).map((wp, idx) => {
    // personMonths viene calculado en loadFormBContext (model.js) sumando
    // días de IO, mobility person-days, y overhead de mgmt. Es una estimación
    // razonable para la tabla "Estimated budget / Resources" del docx.
    const pm = wp.personMonths || 0;
    return {
      eff_wp_no: idx + 1,
      eff_wp_title: blank(wp.title || wp.code),
      eff_lead_no: wp.leader_id ? (ctx.partners.findIndex(p => p.id === wp.leader_id) + 1 || '') : '',
      eff_lead_short: leaderName(ctx, wp.leader_id),
      eff_start: wp.duration_from_month != null ? `M${wp.duration_from_month}` : '',
      eff_end: wp.duration_to_month != null ? `M${wp.duration_to_month}` : '',
      eff_pm: pm > 0 ? pm.toFixed(1).replace('.0', '') : '',
    };
  });
}

function buildEvents(ctx) {
  // Solo meetings + LTTAs (excluyendo activities online, que no son eventos físicos).
  const events = (ctx.activities || []).filter(a =>
    (a.type === 'meeting' || a.type === 'ltta') && !a.online
  );

  return events.map((a, i) => {
    const wp = (ctx.wps || []).find(w => w.id === a.wp_id);
    const wpNum = wp ? (ctx.wps.indexOf(wp) + 1) : '?';
    const mob = a.mobility || {};
    const parts = a.mobility_participants || [];

    // Resolver location: host_partner.country o extra_destination.name
    let location = '';
    if (mob.host_partner_id) {
      const host = ctx.partnerById?.[mob.host_partner_id];
      if (host) location = host.country || host.name || '';
    } else if (mob.host_extra_dest_id) {
      const ed = ctx.extraDestById?.[mob.host_extra_dest_id];
      if (ed) location = ed.name || ed.country || '';
    }

    // Listar TODOS los partners que participan (activos en activity_mobility_participants
    // + el host si es partner) — son los que tienen presupuesto asignado a esa
    // movilidad. Si no hay datos de participantes, fallback al leader.
    const activeIds = new Set();
    for (const p of parts) {
      if (p.active && p.partner_id) activeIds.add(p.partner_id);
    }
    if (mob.host_partner_id && mob.host_active !== 0) activeIds.add(mob.host_partner_id);
    let participantsLabel = '';
    if (activeIds.size > 0) {
      const acrs = [...activeIds].map(pid => {
        const p = ctx.partnerById?.[pid];
        return p ? (p.name || p.legal_name || '') : '';
      }).filter(Boolean);
      participantsLabel = acrs.join(', ');
    } else if (wp && wp.leader_id) {
      participantsLabel = leaderName(ctx, wp.leader_id);
    }

    // Total de personas asistiendo: pax_per_partner × partners activos
    // (incluyendo o no al host según convención EACEA — incluimos host).
    const totalPax = Number(mob.pax_per_partner || 0) * activeIds.size;
    const days = Number(mob.duration_days || 0);
    const attendeesLabel = totalPax > 0
      ? `${totalPax} pax${days > 0 ? ` · ${days} d` : ''}`
      : (days > 0 ? `${days} d` : '');

    // Tipo de evento: subtipo si lo tiene, si no a partir del tipo.
    // En 'event_name' damos el subtipo o un fallback corto. En 'event_type',
    // marcamos meeting/ltta directamente.
    const subtype = (a.subtype || '').trim();
    let shortName = subtype || (a.type === 'meeting' ? 'Transnational Meeting' : 'LTTA / Mobility');
    // Si el label es muy corto (p.ej. "Kick-off"), usarlo como nombre primario.
    if (a.label && a.label.length > 0 && a.label.length <= 40) shortName = a.label.trim();

    // Descripción: una sola frase corta (≤140 chars). Si la activity tiene
    // description, cogemos la primera frase. Si no, vacío.
    let shortDesc = '';
    if (a.description && a.description.trim()) {
      const firstSentence = a.description.trim().split(/[.\n](?:\s|$)/)[0] || '';
      shortDesc = firstSentence.slice(0, 140);
      if (shortDesc.length < firstSentence.length) shortDesc += '…';
    }

    return {
      event_no: `E${wpNum}.${i + 1}`,
      event_participant: participantsLabel,
      event_description: shortDesc,
      event_name: shortName,
      event_type: a.type === 'meeting' ? 'Meeting' : 'LTTA',
      event_area: subtype, // subtipo en la columna "area" (training, study visit, etc.)
      event_location: location,
      event_attendees: attendeesLabel,
    };
  });
}

function buildGantt(ctx) {
  const months = 24; // template grid is 24 months (small projects)
  return (ctx.activities || []).map(a => {
    const wp = (ctx.wps || []).find(w => w.id === a.wp_id);
    const wpCode = wp ? wp.code : '?';
    const row = { gantt_activity: `${wpCode} · ${a.label || ''}`.trim() };
    const start = a.gantt_start_month || 0;
    const end = a.gantt_end_month || 0;
    for (let m = 1; m <= months; m++) {
      row[`gantt_m${m}`] = (start <= m && m <= end) ? '■' : '';
    }
    return row;
  });
}

function buildEuProjects(ctx) {
  return (ctx.euProjects || []).map(p => ({
    ep_participant: blank(p.partner_name),
    ep_reference: [p.reference_no, p.title].filter(Boolean).join(' — '),
    ep_period: blank(p.year),
    ep_role: blank(p.role),
    ep_amount: '',
    ep_website: '',
  }));
}

// ── Map ctx → flat placeholder object ──────────────────────────────────────

function buildPlaceholders(ctx) {
  const { project, partners, program, writer } = ctx;
  const coordinator = partners.find(p => p.role === 'applicant') || partners[0] || null;

  return {
    // Header watermark "Call: [identifier] — [name]"
    call_identifier: project.type || '',
    call_name: (program && program.name) || project.type || '',

    // Cover
    project_title: project.full_name || project.name || '',
    project_acronym: project.name || '',
    coordinator_name: coordinator ? (coordinator.legal_name || coordinator.name || '') : '',
    coordinator_org: coordinator ? (coordinator.legal_name || coordinator.name || '') : '',

    // 16 narrative sections — capped per-field so a single overflowing
    // chapter can't blow up the .docx layout. Limits live in field-limits.js.
    s1_1_text:               capNarrative('s1_1_text',           normalizeWriterText(writer.s1_1_text)),
    s1_2_text:               capNarrative('s1_2_text',           normalizeWriterText(writer.s1_2_text)),
    s1_3_text:               capNarrative('s1_3_text',           normalizeWriterText(writer.s1_3_text)),
    s2_1_1_text:             capNarrative('s2_1_1_text',         normalizeWriterText(writer.s2_1_1_text)),
    s2_1_2_text:             capNarrative('s2_1_2_text',         normalizeWriterText(writer.s2_1_2_text)),
    s2_1_3_outside_text:     capNarrative('s2_1_3_staff_table',  normalizeWriterText(writer.s2_1_3_staff_table)),
    s2_1_4_text:             capNarrative('s2_1_4_text',         normalizeWriterText(writer.s2_1_4_text)),
    s2_1_5_outside_text:     capNarrative('s2_1_5_risk_table',   normalizeWriterText(writer.s2_1_5_risk_table)),
    s2_2_1_text:             capNarrative('s2_2_1_text',         normalizeWriterText(writer.s2_2_1_text)),
    s2_2_2_text:             capNarrative('s2_2_2_text',         normalizeWriterText(writer.s2_2_2_text)),
    s3_1_text:               capNarrative('s3_1_text',           normalizeWriterText(writer.s3_1_text)),
    s3_2_text:               capNarrative('s3_2_text',           normalizeWriterText(writer.s3_2_text)),
    s3_3_text:               capNarrative('s3_3_text',           normalizeWriterText(writer.s3_3_text)),
    s4_1_text:               capNarrative('s4_1_text',           normalizeWriterText(writer.s4_1_text)),
    s5_1_text:               capNarrative('s5_1_text',           normalizeWriterText(writer.s5_1_text)),
    s5_2_text:               capNarrative('s5_2_text',           normalizeWriterText(writer.s5_2_text)),
    s6_2_justification:      capNarrative('s6_2_justification',  normalizeWriterText(writer.s6_2_justification)),
    subcontracting_other_text: '',

    // Phase 2 dynamic tables — per-cell caps applied to every row so a single
    // long description doesn't destroy the table layout.
    staff:        capTableRows(buildStaff(ctx)),
    risks:        capTableRows(buildRisks(ctx)),
    wps:          capTableRows(buildWPs(ctx)).map(wp => ({
      ...wp,
      tasks:        capTableRows(wp.tasks || []),
      milestones:   capTableRows(wp.milestones || []),
      deliverables: capTableRows(wp.deliverables || []),
    })),
    wps_effort:   capTableRows(buildWpsEffort(ctx)),
    events:       capTableRows(buildEvents(ctx)),
    tasks_gantt:  buildGantt(ctx), // gantt cells are 1-char marks, no need to cap
    euProjects:   capTableRows(buildEuProjects(ctx)),
    // Estimated budget — Resources (project-wide table). Filled from
    // eacea-tables (single source of truth shared with Calculator and the
    // preview UI). One row per partner + a Total row.
    ...buildSummaryByPartner(ctx),
  };
}

// ── Estimated budget — Resources (project-wide) ────────────────────────
//
// El template parcheado tiene 15 grid-columns, una por concepto del EACEA:
//   {#summary_by_partner}{sbp_acronym} {sbp_pm} {sbp_a} {sbp_b} {sbp_travels}
//     {sbp_persons} {sbp_c1a} {sbp_c1b} {sbp_c1c} {sbp_c2} {sbp_c3}
//     {sbp_grants} {sbp_d1} {sbp_indirect} {sbp_total}{/summary_by_partner}
//   Total {tot_pm} {tot_a} {tot_b} {tot_travels} {tot_persons} {tot_c1a}
//     {tot_c1b} {tot_c1c} {tot_c2} {tot_c3} {tot_grants} {tot_prizes}
//     {tot_d1} {tot_indirect} {tot_total}
//
// Construimos el array summary_by_partner agregando los totales por partner
// sobre todos los WPs.

function fmtEur(n) {
  if (n == null || Number(n) === 0) return '';
  return Math.round(Number(n)).toLocaleString('es-ES') + ' €';
}
function fmtPm(n) {
  if (n == null || Number(n) === 0) return '';
  const v = Number(n);
  return (v % 1 === 0 ? String(v) : v.toFixed(1).replace('.0','')) + ' PM';
}
function fmtInt(n) {
  if (n == null || Number(n) === 0) return '';
  return String(Math.round(Number(n)));
}

function buildSummaryByPartner(ctx) {
  // Cada WP en ctx.wps tiene wp.budget = { rows, total, indirect_pct }
  // donde rows es array de partners con todas las columnas.
  const partnerAgg = new Map(); // partner_id → aggregate
  for (const wp of (ctx.wps || [])) {
    const rows = wp.budget && wp.budget.rows ? wp.budget.rows : [];
    for (const r of rows) {
      const key = r.project_partner_id || r.beneficiary_id || r.acronym || r.name;
      const agg = partnerAgg.get(key) || {
        acronym: r.acronym || r.name || '?',
        is_coordinator: !!r.is_coordinator,
        pm: 0, a: 0, b: 0, c1a: 0, c1b_accom: 0, c1c: 0, c2: 0, c3: 0,
        d1: 0, indirect: 0, total: 0, travels: 0, persons: 0,
      };
      agg.pm        += Number(r.person_months)       || 0;
      agg.a         += Number(r.a_personnel)         || 0;
      agg.b         += Number(r.b_subcontracting)    || 0;
      agg.c1a       += Number(r.c1a_travel)          || 0;
      agg.c1b_accom += Number(r.c1b_accommodation)   || 0;
      agg.c1c       += Number(r.c1c_subsistence)     || 0;
      agg.c2        += Number(r.c2_equipment)        || 0;
      agg.c3        += Number(r.c3_other)            || 0;
      agg.d1        += Number(r.d1_third_parties)    || 0;
      agg.indirect  += Number(r.e_indirect)          || 0;
      agg.total     += Number(r.total)               || 0;
      agg.travels   += Number(r.travels)             || 0;
      agg.persons   += Number(r.persons_travelling)  || 0;
      partnerAgg.set(key, agg);
    }
  }
  const partnersList = [...partnerAgg.values()].sort((a, b) => {
    if (a.is_coordinator !== b.is_coordinator) return a.is_coordinator ? -1 : 1;
    return (a.acronym || '').localeCompare(b.acronym || '');
  });

  // Loop rows (1 por partner) — una columna por concepto EACEA (sin subtotales).
  const summary_by_partner = partnersList.map(p => ({
    sbp_acronym:  p.acronym + (p.is_coordinator ? ' (coord.)' : ''),
    sbp_pm:       fmtPm(p.pm),
    sbp_a:        fmtEur(p.a),
    sbp_b:        fmtEur(p.b),
    sbp_travels:  fmtInt(p.travels),
    sbp_persons:  fmtInt(p.persons),
    sbp_c1a:      fmtEur(p.c1a),
    sbp_c1b:      fmtEur(p.c1b_accom),
    sbp_c1c:      fmtEur(p.c1c),
    sbp_c2:       fmtEur(p.c2),
    sbp_c3:       fmtEur(p.c3),
    sbp_grants:   '', // # grants — no lo trackeamos
    sbp_d1:       fmtEur(p.d1),
    sbp_indirect: fmtEur(p.indirect),
    sbp_total:    fmtEur(p.total),
  }));

  // Totales fila Total
  const grand = partnersList.reduce((g, p) => ({
    pm: g.pm + p.pm, a: g.a + p.a, b: g.b + p.b, c1a: g.c1a + p.c1a, c1b_accom: g.c1b_accom + p.c1b_accom,
    c1c: g.c1c + p.c1c, c2: g.c2 + p.c2, c3: g.c3 + p.c3, d1: g.d1 + p.d1,
    indirect: g.indirect + p.indirect, total: g.total + p.total,
    travels: g.travels + p.travels, persons: g.persons + p.persons,
  }), { pm:0, a:0, b:0, c1a:0, c1b_accom:0, c1c:0, c2:0, c3:0, d1:0, indirect:0, total:0, travels:0, persons:0 });

  return {
    summary_by_partner,
    tot_pm:       fmtPm(grand.pm),
    tot_a:        fmtEur(grand.a),
    tot_b:        fmtEur(grand.b),
    tot_travels:  fmtInt(grand.travels),
    tot_persons:  fmtInt(grand.persons),
    tot_c1a:      fmtEur(grand.c1a),
    tot_c1b:      fmtEur(grand.c1b_accom),
    tot_c1c:      fmtEur(grand.c1c),
    tot_c2:       fmtEur(grand.c2),
    tot_c3:       fmtEur(grand.c3),
    tot_grants:   '',
    tot_prizes:   '',
    tot_d1:       fmtEur(grand.d1),
    tot_indirect: fmtEur(grand.indirect),
    tot_total:    fmtEur(grand.total),
  };
}

// ── Public entry point ────────────────────────────────────────────────────

async function renderFormBDocx(ctx) {
  const buf = loadTemplate();
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(buildPlaceholders(ctx));
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { renderFormBDocx };
