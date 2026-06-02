/**
 * Loads the full context needed to render the EACEA Form Part B for a project.
 * Source-of-truth: live tables (work_packages, activities, deliverables, milestones,
 * partners, etc.) + form_field_values (Writer narrative texts).
 */
'use strict';

const db = require('../../utils/db');
const { buildEaceaTables } = require('../budget/eacea-tables');

async function loadFormBContext(projectId, userId) {
  const [[project]] = await db.execute(
    `SELECT id, name, full_name, type, description, proposal_lang,
            national_agency, start_date, duration_months, deadline,
            eu_grant, cofin_pct, indirect_pct
       FROM projects
      WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
  if (!project) { const e = new Error('Project not found'); e.status = 404; throw e; }

  const [programRows] = await db.execute(
    `SELECT name, action_type, eu_grant_max, deadline, deadline_time,
            duration_min_months, duration_max_months, min_partners
       FROM intake_programs WHERE action_type = ? LIMIT 1`,
    [project.type]
  );
  const program = programRows[0] || null;

  const [partners] = await db.execute(
    `SELECT id, name, legal_name, country, role, order_index, organization_id
       FROM partners WHERE project_id = ? ORDER BY role DESC, order_index`,
    [projectId]
  );

  const partnerIds = partners.map(p => p.id);
  const orgIds = partners.map(p => p.organization_id).filter(Boolean);

  const [wps] = await db.execute(
    `SELECT id, code, title, summary, objectives, leader_id,
            duration_from_month, duration_to_month, order_index
       FROM work_packages WHERE project_id = ? ORDER BY order_index`,
    [projectId]
  );
  const wpIds = wps.map(w => w.id);

  const [activities] = wpIds.length ? await db.execute(
    `SELECT a.id, a.wp_id, a.type, a.subtype, a.label, a.description,
            a.online, a.gantt_start_month, a.gantt_end_month, a.order_index,
            a.date_start, a.date_end
       FROM activities a
      WHERE a.wp_id IN (${wpIds.map(() => '?').join(',')})
      ORDER BY a.wp_id, a.order_index`,
    wpIds
  ) : [[]];

  // Mobility details: host + duración + pax — necesarios para la tabla
  // "Events and mobility" del .docx. Cargamos para todas las activities
  // tipo meeting/ltta de los WPs del proyecto.
  const activityIds = activities.filter(a => a.type === 'meeting' || a.type === 'ltta').map(a => a.id);
  const mobilityByActId = {};
  const mobParticipantsByActId = {};
  if (activityIds.length) {
    const [mobRows] = await db.execute(
      `SELECT mob.activity_id, mob.host_partner_id, mob.host_extra_dest_id, mob.host_active,
              mob.pax_per_partner, mob.duration_days, mob.local_pax
         FROM activity_mobility mob
        WHERE mob.activity_id IN (${activityIds.map(() => '?').join(',')})`,
      activityIds
    ).catch(() => [[]]);
    for (const m of mobRows) mobilityByActId[m.activity_id] = m;

    const [partRows] = await db.execute(
      `SELECT amp.activity_id, amp.partner_id, amp.active,
              p.name AS partner_name, p.country
         FROM activity_mobility_participants amp
         LEFT JOIN partners p ON p.id = amp.partner_id
        WHERE amp.activity_id IN (${activityIds.map(() => '?').join(',')})`,
      activityIds
    ).catch(() => [[]]);
    for (const r of partRows) {
      if (!mobParticipantsByActId[r.activity_id]) mobParticipantsByActId[r.activity_id] = [];
      mobParticipantsByActId[r.activity_id].push(r);
    }
  }

  // Extra destinations indexed by id (para resolver host_extra_dest_id → nombre)
  const [extraDestRows] = await db.execute(
    `SELECT id, name, country FROM extra_destinations WHERE project_id = ?`,
    [projectId]
  ).catch(() => [[]]);
  const extraDestById = {};
  for (const ed of (extraDestRows || [])) extraDestById[ed.id] = ed;

  // Enriquecer activities con los datos de mobility
  for (const a of activities) {
    if (a.type === 'meeting' || a.type === 'ltta') {
      a.mobility = mobilityByActId[a.id] || null;
      a.mobility_participants = mobParticipantsByActId[a.id] || [];
    }
  }

  const [tasks] = await db.execute(
    `SELECT t.id, t.work_package_id, t.code, t.title, t.description, t.sort_order
       FROM wp_tasks t
      WHERE t.project_id = ?
      ORDER BY t.work_package_id, t.sort_order`,
    [projectId]
  );

  const [deliverables] = await db.execute(
    `SELECT id, work_package_id, code, title, description, type, dissemination_level,
            due_month, sort_order, lead_partner_id, rationale
       FROM deliverables WHERE project_id = ?
      ORDER BY work_package_id, sort_order, code`,
    [projectId]
  );

  const [milestones] = await db.execute(
    `SELECT id, work_package_id, code, title, description, due_month,
            verification, sort_order, lead_partner_id, deliverable_id
       FROM milestones WHERE project_id = ?
      ORDER BY work_package_id, sort_order, code`,
    [projectId]
  );

  const [contextRows] = await db.execute(
    `SELECT problem, target_groups, approach
       FROM intake_contexts WHERE project_id = ? LIMIT 1`,
    [projectId]
  );
  const context = contextRows[0] || null;

  const [risks] = await db.execute(
    `SELECT id, wp_id, risk_no, description, mitigation, likelihood, impact, sort_order
       FROM project_risks WHERE project_id = ? ORDER BY sort_order, created_at`,
    [projectId]
  );

  const [fieldValues] = await db.execute(
    `SELECT fv.field_id, fv.value_text
       FROM form_field_values fv
       JOIN form_instances fi ON fi.id = fv.instance_id
      WHERE fi.project_id = ?`,
    [projectId]
  );
  const writer = {};
  for (const r of fieldValues) writer[r.field_id] = r.value_text || '';

  // ── EACEA Form Part B tables (single source of truth) ──────────────────
  // Delegated to budget/eacea-tables.js. Returns a richly structured payload
  // with per-WP rows, per-partner aggregations, the Staff Effort matrix, and
  // grand totals — all computed from the same query plan. This guarantees
  // that what the user sees in Calculator (Resumen → Form Part B), Developer
  // (Escribir) and the Form Part B .docx is byte-identical.
  let eaceaTables;
  try {
    eaceaTables = await buildEaceaTables(projectId, userId);
  } catch (e) {
    // Si el proyecto no tiene budget o falla algo, seguimos con tablas vacías
    eaceaTables = { wps: [], by_partner: [], staff_effort: { rows: [], totals_by_wp: [], grand_total_pm: 0 }, indirect_pct: 0 };
  }
  const indirectPct = eaceaTables.indirect_pct || 0;

  // Adaptamos a los shapes que ya usan los renderers existentes:
  //   · budgetByWp: { wpId → { rows, total, indirect_pct } }
  //   · staffEffort: { partnerId → { wpId → pm } }
  //   · travelsMatrix: { partnerId → { wpId → {travels, persons} } }
  //   · wpPmByWp: { wpId → personDays } (legado, para wps_effort table)
  const budgetByWp = {};
  for (const wp of eaceaTables.wps) {
    budgetByWp[wp.wp_id] = {
      rows: wp.rows.map(r => ({
        beneficiary_id: r.partner_id,
        name: r.name,
        acronym: r.acronym,
        is_coordinator: r.is_coordinator,
        project_partner_id: r.partner_id,
        person_months: r.person_months,
        a_personnel: r.a_personnel,
        b_subcontracting: r.b_subcontracting,
        c1a_travel: r.c1a_travel,
        c1b_accommodation: r.c1b_accommodation,
        c1c_subsistence: r.c1c_subsistence,
        c2_equipment: r.c2_equipment,
        c3_other: r.c3_other,
        d1_third_parties: r.d1_third_parties,
        e_indirect: r.e_indirect,
        total: r.total,
        travels: r.travels,
        persons_travelling: r.persons_travelling,
        is_leader: r.is_leader,
      })),
      total: wp.totals?.total || 0,
      indirect_pct: indirectPct,
    };
  }
  const staffEffort = {};
  const travelsMatrix = {};
  for (const row of (eaceaTables.staff_effort?.rows || [])) {
    staffEffort[row.partner_id] = {};
    for (const cell of row.cells) {
      staffEffort[row.partner_id][cell.wp_id] = cell.pm;
    }
  }
  // travelsMatrix se rellena desde wpRows
  for (const wp of eaceaTables.wps) {
    for (const r of wp.rows) {
      if (!travelsMatrix[r.partner_id]) travelsMatrix[r.partner_id] = {};
      travelsMatrix[r.partner_id][wp.wp_id] = {
        travels: r.travels || 0,
        persons: r.persons_travelling || 0,
      };
    }
  }
  // wpPmByWp en person-days (para el renderer legado de wps_effort)
  const wpPmByWp = {};
  for (const wp of eaceaTables.wps) {
    wpPmByWp[wp.wp_id] = (wp.totals?.person_months || 0) * 22;
  }

  // Master document chapters — used to inject per-WP narrative into the docx
  // (cada capítulo ch_4_2_wp_* es la prosa larga de un WP escrita por la IA
  // durante el compile). Si no hay Master, queda vacío y el docx renderiza
  // sólo los objetivos cortos como antes.
  const [masterChapters] = await db.execute(
    `SELECT mc.chapter_key, mc.title, mc.body, mc.ref_entity_type, mc.ref_entity_id
       FROM master_chapters mc
       JOIN master_documents md ON md.id = mc.master_doc_id
      WHERE md.project_id = ?
      ORDER BY md.updated_at DESC, mc.sort_order ASC`,
    [projectId]
  ).catch(() => [[]]);
  // Indexed by chapter_key (latest master_document wins because ORDER BY DESC)
  const masterByKey = {};
  const masterByWpId = {};
  for (const ch of masterChapters) {
    if (!masterByKey[ch.chapter_key]) masterByKey[ch.chapter_key] = ch;
    if (ch.ref_entity_type === 'work_package' && ch.ref_entity_id && !masterByWpId[ch.ref_entity_id]) {
      masterByWpId[ch.ref_entity_id] = ch;
    }
  }

  let keyStaff = [];
  let selectedStaff = [];
  let euProjects = [];
  if (orgIds.length) {
    const [s] = await db.execute(
      `SELECT ks.id, ks.organization_id, ks.name AS full_name, ks.role, ks.skills_summary AS bio,
              p.id AS partner_id, p.name AS partner_name, p.country
         FROM org_key_staff ks
         JOIN partners p ON p.organization_id = ks.organization_id
        WHERE p.project_id = ? AND ks.organization_id IN (${orgIds.map(() => '?').join(',')})
        ORDER BY p.order_index, ks.name`,
      [projectId, ...orgIds]
    );
    keyStaff = s;

    // Staff explicitly selected for this project (Writer → Consortium tab),
    // with project-specific role and refined skills.
    const [pps] = await db.execute(
      `SELECT pps.id, pps.staff_id, pps.partner_id, pps.project_role,
              pps.custom_skills,
              ks.name AS full_name, ks.role AS directory_role,
              ks.skills_summary AS directory_bio,
              p.name AS partner_name, p.legal_name AS partner_legal_name, p.country
         FROM project_partner_staff pps
         JOIN org_key_staff ks ON ks.id = pps.staff_id
         JOIN partners p       ON p.id  = pps.partner_id
        WHERE pps.project_id = ? AND pps.selected = 1
        ORDER BY p.order_index, ks.name`,
      [projectId]
    );
    selectedStaff = pps;

    const [e] = await db.execute(
      `SELECT ep.id, ep.organization_id, ep.title,
              ep.project_id_or_contract AS reference_no,
              ep.programme, ep.role, ep.year, ep.beneficiary_name,
              p.name AS partner_name
         FROM org_eu_projects ep
         JOIN partners p ON p.organization_id = ep.organization_id
        WHERE p.project_id = ? AND ep.organization_id IN (${orgIds.map(() => '?').join(',')})
        ORDER BY p.order_index, ep.year DESC`,
      [projectId, ...orgIds]
    );
    euProjects = e;
  }

  // Build per-WP buckets for convenience.
  const wpById = {};
  for (const w of wps) {
    const masterCh = masterByWpId[w.id] || null;
    const totalPersonDays = wpPmByWp[w.id] || 0;
    const personMonths = totalPersonDays / 22;
    wpById[w.id] = {
      ...w,
      activities: [],
      tasks: [],
      deliverables: [],
      milestones: [],
      writerText: writer[`s4_2_wp_${w.id}`] || '',
      masterNarrative: masterCh ? (masterCh.body || '') : '',
      personMonths: Math.round(personMonths * 10) / 10,
      budget: budgetByWp[w.id] || { rows: [], total: 0, indirect_pct: indirectPct },
    };
  }
  for (const a of activities) if (wpById[a.wp_id]) wpById[a.wp_id].activities.push(a);
  for (const t of tasks)      if (wpById[t.work_package_id]) wpById[t.work_package_id].tasks.push(t);
  for (const d of deliverables) if (wpById[d.work_package_id]) wpById[d.work_package_id].deliverables.push(d);
  for (const m of milestones)  if (wpById[m.work_package_id]) wpById[m.work_package_id].milestones.push(m);

  const partnerById = {};
  for (const p of partners) partnerById[p.id] = p;

  return {
    project,
    program,
    partners,
    partnerById,
    wps: wps.map(w => wpById[w.id]),
    activities,
    deliverables,
    milestones,
    context,
    writer,
    keyStaff,
    selectedStaff,
    euProjects,
    risks,
    staffEffort,        // partnerId → wpId → PM
    travelsMatrix,      // partnerId → wpId → { travels, persons }
    extraDestById,      // id → { name, country }
  };
}

module.exports = { loadFormBContext };
