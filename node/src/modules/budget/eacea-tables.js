/**
 * EACEA Form Part B tables — single source of truth.
 *
 * Builds the matrices used by:
 *   · Calculator → Resumen → tab "Form Part B"
 *   · Developer (Escribir) per-WP budget reference
 *   · Master (Perfeccionar) → Preparar formulario oficial
 *   · Exporter (.docx) when rendering Estimated Budget Resources
 *
 * Cualquier divergencia entre módulos viene de duplicar la lógica de
 * cálculo. Este módulo concentra ese cálculo en un solo sitio.
 *
 * Devuelve:
 *   {
 *     project, indirect_pct,
 *     wps: [{ wp_id, code, title, leader_id, leader_acronym,
 *             rows: [{ partner_id, acronym, is_coordinator, is_leader,
 *                      person_months, a_personnel, b_subcontracting,
 *                      c1a_travel, travels, persons_travelling,
 *                      c1c_subsistence, c1b_accommodation,
 *                      c2_equipment, c3_other, d1_third_parties,
 *                      e_indirect, total }],
 *             totals: { ...same fields summed } }],
 *     by_partner: [{ partner_id, acronym, is_coordinator,
 *                    total_pm, total_amount, by_wp: [...] }],
 *     staff_effort: {
 *       rows: [{ partner_id, partner_name, partner_acronym, is_coordinator,
 *                cells: [{ wp_id, wp_code, is_leader, pm }], total_pm }],
 *       totals_by_wp: [{ wp_id, wp_code, pm }],
 *       grand_total_pm
 *     },
 *     summary: { grand_total_amount, grand_total_pm,
 *                by_category: { a_personnel, b_subcontracting, c1, c2, c3, d1, e_indirect } }
 *   }
 */
'use strict';

const db = require('../../utils/db');

async function buildEaceaTables(projectId, userId) {
  // 1. Asserts ownership + load project
  const [[project]] = await db.execute(
    `SELECT id, name, full_name, type, duration_months
       FROM projects
      WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
  if (!project) { const e = new Error('Project not found'); e.status = 404; throw e; }

  // 2. Partners and work packages of THIS project
  const [partners] = await db.execute(
    `SELECT id, name, legal_name, country, role, order_index
       FROM partners WHERE project_id = ? ORDER BY role DESC, order_index`,
    [projectId]
  );
  const [wps] = await db.execute(
    `SELECT id, code, title, leader_id, duration_from_month, duration_to_month, order_index
       FROM work_packages WHERE project_id = ? ORDER BY order_index`,
    [projectId]
  );
  const wpIds = wps.map(w => w.id);
  if (!wpIds.length) {
    return {
      project: { id: project.id, name: project.name, type: project.type },
      indirect_pct: 0,
      wps: [], by_partner: [],
      staff_effort: { rows: [], totals_by_wp: [], grand_total_pm: 0 },
      summary: { grand_total_amount: 0, grand_total_pm: 0, by_category: {} },
    };
  }

  // 3. Person-months per partner × WP (sources: IO days + mobility person-days
  //    + 10% mgmt overhead). Same logic as exporter — centralised here.
  const staffEffortDays = {}; // partnerId → { wpId → days }
  function addEffort(pid, wid, days) {
    if (!pid || !wid || !days) return;
    if (!staffEffortDays[pid]) staffEffortDays[pid] = {};
    staffEffortDays[pid][wid] = (staffEffortDays[pid][wid] || 0) + days;
  }
  const [ioRows] = await db.execute(
    `SELECT a.wp_id, io.partner_id, COALESCE(SUM(io.days), 0) AS days
       FROM activity_intellectual_outputs io
       JOIN activities a ON a.id = io.activity_id
      WHERE a.wp_id IN (${wpIds.map(() => '?').join(',')})
      GROUP BY a.wp_id, io.partner_id`,
    wpIds
  ).catch(() => [[]]);
  for (const r of ioRows) addEffort(r.partner_id, r.wp_id, Number(r.days) || 0);

  const [mobEffortRows] = await db.execute(
    `SELECT a.wp_id, amp.partner_id,
            COALESCE(SUM(mob.pax_per_partner * mob.duration_days), 0) AS person_days
       FROM activity_mobility mob
       JOIN activities a ON a.id = mob.activity_id
       JOIN activity_mobility_participants amp ON amp.activity_id = mob.activity_id
      WHERE a.wp_id IN (${wpIds.map(() => '?').join(',')})
        AND amp.active = 1
        AND a.online = 0
      GROUP BY a.wp_id, amp.partner_id`,
    wpIds
  ).catch(() => [[]]);
  for (const r of mobEffortRows) addEffort(r.partner_id, r.wp_id, Number(r.person_days) || 0);

  const [mgmtRows] = await db.execute(
    `SELECT a.wp_id, amp.partner_id, w.duration_from_month, w.duration_to_month
       FROM activity_management mgmt
       JOIN activities a ON a.id = mgmt.activity_id
       JOIN activity_management_partners amp ON amp.activity_id = mgmt.activity_id
       JOIN work_packages w ON w.id = a.wp_id
      WHERE a.wp_id IN (${wpIds.map(() => '?').join(',')})
        AND amp.active = 1`,
    wpIds
  ).catch(() => [[]]);
  const projectMonths = project.duration_months || 24;
  for (const r of mgmtRows) {
    const wpMonths = (r.duration_from_month != null && r.duration_to_month != null)
      ? (r.duration_to_month - r.duration_from_month + 1)
      : projectMonths;
    const days = wpMonths * 22 * 0.10;
    addEffort(r.partner_id, r.wp_id, days);
  }

  // Convert person-days → person-months (22 days/month)
  const staffEffortPM = {};
  for (const [pid, wpMap] of Object.entries(staffEffortDays)) {
    staffEffortPM[pid] = {};
    for (const [wid, days] of Object.entries(wpMap)) {
      staffEffortPM[pid][wid] = Math.round((days / 22) * 10) / 10;
    }
  }

  // 4. Travels & persons travelling per partner × WP
  const travels = {}; // partnerId → { wpId → { travels, persons } }
  const [travelsRows] = await db.execute(
    `SELECT a.wp_id, amp.partner_id,
            COUNT(*) AS travels,
            COALESCE(SUM(mob.pax_per_partner), 0) AS persons
       FROM activity_mobility mob
       JOIN activities a ON a.id = mob.activity_id
       JOIN activity_mobility_participants amp ON amp.activity_id = mob.activity_id
      WHERE a.wp_id IN (${wpIds.map(() => '?').join(',')})
        AND amp.active = 1
        AND a.online = 0
      GROUP BY a.wp_id, amp.partner_id`,
    wpIds
  ).catch(() => [[]]);
  for (const r of travelsRows) {
    if (!travels[r.partner_id]) travels[r.partner_id] = {};
    travels[r.partner_id][r.wp_id] = {
      travels: Number(r.travels) || 0,
      persons: Number(r.persons) || 0,
    };
  }

  // 5. Budget breakdown per WP × partner × category (from budget_costs)
  let indirectPct = 0;
  const budgetByWp = {}; // wp_id → array of partner rows (€ columns)
  const [budgets] = await db.execute(
    `SELECT id, indirect_pct FROM budget_projects WHERE project_id = ? LIMIT 1`,
    [projectId]
  );
  if (budgets.length) {
    const budgetId = budgets[0].id;
    indirectPct = Number(budgets[0].indirect_pct || 0);
    const [bwps] = await db.execute(
      `SELECT id, number, label FROM budget_work_packages WHERE budget_id = ? ORDER BY number`,
      [budgetId]
    );
    const wpIdToBwpId = {};
    for (const w of wps) {
      let bwp = bwps.find(b => b.label && w.code && b.label.startsWith(w.code + ' '));
      if (!bwp) bwp = bwps[Math.max(0, w.order_index || 0)] || null;
      if (bwp) wpIdToBwpId[w.id] = bwp.id;
    }
    const bwpIds = Object.values(wpIdToBwpId);
    const bwpToWp = {};
    for (const [wpId, bwpId] of Object.entries(wpIdToBwpId)) bwpToWp[bwpId] = wpId;

    const partnerByAcronym = {};
    for (const p of partners) {
      partnerByAcronym[(p.name || '').toLowerCase()] = p.id;
      if (p.legal_name) partnerByAcronym[p.legal_name.toLowerCase()] = p.id;
    }

    if (bwpIds.length) {
      const [budgetRows] = await db.execute(
        `SELECT bc.wp_id AS bwp_id, bb.id AS beneficiary_id, bb.name, bb.acronym, bb.is_coordinator,
                COALESCE(SUM(CASE WHEN bc.category = 'A' THEN bc.total_cost ELSE 0 END), 0) AS a_personnel,
                COALESCE(SUM(CASE WHEN bc.category = 'B' THEN bc.total_cost ELSE 0 END), 0) AS b_subcontracting,
                COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C1' AND bc.line_item = 'Travel'        THEN bc.total_cost ELSE 0 END), 0) AS c1a_travel,
                COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C1' AND bc.line_item = 'Accommodation' THEN bc.total_cost ELSE 0 END), 0) AS c1b_accommodation,
                COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C1' AND bc.line_item = 'Subsistence'   THEN bc.total_cost ELSE 0 END), 0) AS c1c_subsistence,
                COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C2' THEN bc.total_cost ELSE 0 END), 0) AS c2_equipment,
                COALESCE(SUM(CASE WHEN bc.category = 'C' AND bc.subcategory = 'C3' THEN bc.total_cost ELSE 0 END), 0) AS c3_other,
                COALESCE(SUM(CASE WHEN bc.category = 'D' THEN bc.total_cost ELSE 0 END), 0) AS d1_third_parties,
                COALESCE(SUM(bc.total_cost), 0) AS direct_total
           FROM budget_beneficiaries bb
           LEFT JOIN budget_costs bc
             ON bc.beneficiary_id = bb.id
            AND bc.budget_id = bb.budget_id
            AND bc.wp_id IN (${bwpIds.map(() => '?').join(',')})
          WHERE bb.budget_id = ?
          GROUP BY bc.wp_id, bb.id
          ORDER BY bc.wp_id, bb.sort_order, bb.number`,
        [...bwpIds, budgetId]
      );
      for (const r of budgetRows) {
        if (!r.bwp_id) continue;
        const wpId = bwpToWp[r.bwp_id];
        if (!wpId) continue;
        if (!budgetByWp[wpId]) budgetByWp[wpId] = [];
        const projectPartnerId = partnerByAcronym[(r.acronym || '').toLowerCase()]
                              || partnerByAcronym[(r.name || '').toLowerCase()];
        const direct = Number(r.direct_total || 0);
        const eIndirect = Math.round(direct * indirectPct) / 100;
        const total = direct + eIndirect;
        const pm = projectPartnerId ? (staffEffortPM[projectPartnerId]?.[wpId] || 0) : 0;
        const tr = projectPartnerId ? (travels[projectPartnerId]?.[wpId] || { travels: 0, persons: 0 }) : { travels: 0, persons: 0 };
        budgetByWp[wpId].push({
          partner_id: projectPartnerId || r.beneficiary_id,
          acronym: r.acronym || r.name || '?',
          name: r.name || '',
          is_coordinator: !!r.is_coordinator,
          person_months: pm,
          a_personnel: Number(r.a_personnel) || 0,
          b_subcontracting: Number(r.b_subcontracting) || 0,
          c1a_travel: Number(r.c1a_travel) || 0,
          c1b_accommodation: Number(r.c1b_accommodation) || 0,
          c1c_subsistence: Number(r.c1c_subsistence) || 0,
          travels: tr.travels,
          persons_travelling: tr.persons,
          c2_equipment: Number(r.c2_equipment) || 0,
          c3_other: Number(r.c3_other) || 0,
          d1_third_parties: Number(r.d1_third_parties) || 0,
          e_indirect: eIndirect,
          total: total,
        });
      }
    }
  }

  // 6. Build wps array with totals per WP
  function leaderAcronym(leaderId) {
    const p = partners.find(x => x.id === leaderId);
    return p ? (p.name || p.legal_name || '?') : '';
  }
  function emptyRow(p) {
    return {
      partner_id: p.id, acronym: p.name || '?', name: p.legal_name || p.name || '',
      is_coordinator: p.role === 'applicant',
      person_months: 0, a_personnel: 0, b_subcontracting: 0,
      c1a_travel: 0, c1b_accommodation: 0, c1c_subsistence: 0,
      travels: 0, persons_travelling: 0,
      c2_equipment: 0, c3_other: 0, d1_third_parties: 0, e_indirect: 0, total: 0,
    };
  }
  function sumRows(rows, fields) {
    return fields.reduce((acc, f) => {
      acc[f] = rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
      // round euros to integer; PMs to 1 decimal; counts already integer
      if (['person_months'].includes(f)) acc[f] = Math.round(acc[f] * 10) / 10;
      else if (['travels', 'persons_travelling'].includes(f)) acc[f] = Math.round(acc[f]);
      else acc[f] = Math.round(acc[f] * 100) / 100;
      return acc;
    }, {});
  }
  const SUM_FIELDS = ['person_months','a_personnel','b_subcontracting','c1a_travel','c1b_accommodation','c1c_subsistence','travels','persons_travelling','c2_equipment','c3_other','d1_third_parties','e_indirect','total'];

  const wpsOut = wps.map(w => {
    let rows = budgetByWp[w.id] || [];
    // Ensure every partner appears with at least a zero row, then merge PM/travels.
    for (const p of partners) {
      if (!rows.find(r => r.partner_id === p.id)) {
        const stub = emptyRow(p);
        stub.person_months = staffEffortPM[p.id]?.[w.id] || 0;
        const tr = travels[p.id]?.[w.id] || { travels: 0, persons: 0 };
        stub.travels = tr.travels;
        stub.persons_travelling = tr.persons;
        if (stub.person_months > 0 || stub.travels > 0) rows.push(stub);
      }
    }
    // Mark leader
    rows.forEach(r => { r.is_leader = r.partner_id === w.leader_id; });
    // Sort: leader first, then coord, then by acronym
    rows.sort((a, b) => {
      if (a.is_leader !== b.is_leader) return a.is_leader ? -1 : 1;
      if (a.is_coordinator !== b.is_coordinator) return a.is_coordinator ? -1 : 1;
      return (a.acronym || '').localeCompare(b.acronym || '');
    });
    return {
      wp_id: w.id, code: w.code, title: w.title,
      duration_from_month: w.duration_from_month, duration_to_month: w.duration_to_month,
      leader_id: w.leader_id, leader_acronym: leaderAcronym(w.leader_id),
      rows,
      totals: sumRows(rows, SUM_FIELDS),
    };
  });

  // 7. By partner — aggregated over all WPs
  const byPartner = partners.map(p => {
    const byWp = wpsOut.map(w => {
      const r = w.rows.find(x => x.partner_id === p.id);
      return r ? { wp_id: w.wp_id, code: w.code, ...r } : { wp_id: w.wp_id, code: w.code, person_months: 0, total: 0 };
    });
    const totals = sumRows(byWp, SUM_FIELDS);
    return {
      partner_id: p.id, acronym: p.name || '?', name: p.legal_name || p.name || '',
      is_coordinator: p.role === 'applicant',
      by_wp: byWp,
      totals,
    };
  });

  // 8. Staff effort matrix (subset of the WP data, flat structure)
  const staffEffortRows = partners.map(p => {
    const cells = wpsOut.map(w => ({
      wp_id: w.wp_id, wp_code: w.code, wp_title: w.title,
      is_leader: w.leader_id === p.id,
      pm: staffEffortPM[p.id]?.[w.wp_id] || 0,
    }));
    const total = Math.round(cells.reduce((s, c) => s + c.pm, 0) * 10) / 10;
    return {
      partner_id: p.id,
      partner_name: p.legal_name || p.name || '?',
      partner_acronym: p.name || '?',
      is_coordinator: p.role === 'applicant',
      cells, total_pm: total,
    };
  });
  const totalsByWp = wpsOut.map(w => ({
    wp_id: w.wp_id, wp_code: w.code,
    pm: Math.round(staffEffortRows.reduce((s, r) => {
      const c = r.cells.find(x => x.wp_id === w.wp_id);
      return s + (c ? c.pm : 0);
    }, 0) * 10) / 10,
  }));
  const grandPm = Math.round(staffEffortRows.reduce((s, r) => s + r.total_pm, 0) * 10) / 10;

  // 9. Summary by category (project-wide)
  const summaryByCat = sumRows(wpsOut.map(w => w.totals), SUM_FIELDS);

  return {
    project: { id: project.id, name: project.name, type: project.type, duration_months: project.duration_months },
    indirect_pct: indirectPct,
    wps: wpsOut,
    by_partner: byPartner,
    staff_effort: {
      rows: staffEffortRows,
      totals_by_wp: totalsByWp,
      grand_total_pm: grandPm,
    },
    summary: {
      grand_total_amount: summaryByCat.total,
      grand_total_pm: grandPm,
      by_category: summaryByCat,
    },
  };
}

module.exports = { buildEaceaTables };
