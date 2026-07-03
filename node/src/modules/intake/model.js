/* ── Intake Model — Database queries for projects, partners, contexts ─── */

const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');

/* ── INTAKE PROGRAMS ────────────────────────────────────────────────── */

/**
 * List all active intake programs
 */
async function findActivePrograms() {
  const sql = `
    SELECT id, program_id, name, action_type, deadline, start_date_min, start_date_max,
           duration_min_months, duration_max_months, eu_grant_max, cofin_pct, indirect_pct,
           hide_cofin, hide_indirect, budget_options,
           min_partners, notes, call_summary, created_at
    FROM intake_programs
    WHERE active = 1
    ORDER BY name ASC
  `;
  const [rows] = await db.execute(sql);
  return rows;
}

/* ── PROJECTS ──────────────────────────────────────────────────────── */

/**
 * Create a new project with auto-generated UUID
 * Also creates an empty intake_contexts row
 */
async function createProject(userId, projectData) {
  const id = genUUID();
  const contextId = genUUID();
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const sql = `
    INSERT INTO projects (
      id, user_id, name, type, description, proposal_lang, national_agency, start_date, duration_months,
      deadline, eu_grant, cofin_pct, indirect_pct, hide_cofin, hide_indirect, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `;

  const params = [
    id,
    userId,
    projectData.name,
    projectData.type || null,
    projectData.description || null,
    projectData.proposal_lang || 'en',
    projectData.national_agency || null,
    projectData.start_date || null,
    projectData.duration_months || null,
    projectData.deadline || null,
    projectData.eu_grant || 0,
    projectData.cofin_pct || 0,
    projectData.indirect_pct || 0,
    projectData.hide_cofin ? 1 : 0,
    projectData.hide_indirect ? 1 : 0,
    now,
    now
  ];

  await db.execute(sql, params);

  // Auto-create intake_contexts row
  const contextSql = `
    INSERT INTO intake_contexts (id, project_id, problem, target_groups, approach, created_at, updated_at)
    VALUES (?, ?, '', '', '', ?, ?)
  `;
  await db.execute(contextSql, [contextId, id, now, now]);

  return findProjectById(id, userId);
}

/**
 * Find single project by ID and verify ownership
 */
async function findProjectById(projectId, userId) {
  const sql = `
    SELECT id, user_id, name, full_name, type, description, proposal_lang, national_agency, start_date, duration_months,
           deadline, eu_grant, cofin_pct, indirect_pct, hide_cofin, hide_indirect, status, is_sandbox, calc_state, created_at, updated_at
    FROM projects
    WHERE id = ? AND user_id = ?
  `;
  const [rows] = await db.execute(sql, [projectId, userId]);
  return rows[0] || null;
}

/**
 * List all projects for a user (paginated)
 */
async function findProjectsByUserId(userId, page = 1, perPage = 20) {
  const offset = (page - 1) * perPage;
  const limit = Math.min(perPage, 100); // Max 100 per page

  const countSql = 'SELECT COUNT(*) as total FROM projects WHERE user_id = ?';
  const [countRows] = await db.execute(countSql, [userId]);
  const total = countRows[0].total;

  const sql = `
    SELECT id, user_id, name, full_name, type, description, proposal_lang, start_date, duration_months,
           deadline, eu_grant, cofin_pct, indirect_pct, status, is_sandbox, created_at, updated_at
    FROM projects
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await db.execute(sql, [userId, String(limit), String(offset)]);

  return {
    data: rows,
    total,
    page,
    per_page: limit,
    total_pages: Math.ceil(total / limit)
  };
}

/**
 * Update specific fields of a project (autosave)
 * Returns only the updated fields + id + updated_at
 */
async function updateProjectFields(projectId, userId, updates) {
  // Verify ownership first
  const project = await findProjectById(projectId, userId);
  if (!project) return null;

  // Allowed fields for update
  const allowedFields = [
    'name', 'full_name', 'type', 'description', 'proposal_lang', 'national_agency', 'start_date', 'duration_months',
    'deadline', 'eu_grant', 'cofin_pct', 'indirect_pct', 'hide_cofin', 'hide_indirect', 'status', 'calc_state'
  ];

  const fieldsToUpdate = {};
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fieldsToUpdate[key] = value;
    }
  }

  if (Object.keys(fieldsToUpdate).length === 0) {
    return { id: projectId, updated_at: project.updated_at };
  }

  const now = new Date().toISOString().split('T')[0];
  fieldsToUpdate.updated_at = now;

  // Build UPDATE clause dynamically
  const setClauses = Object.keys(fieldsToUpdate).map(k => `${k} = ?`);
  const params = Object.values(fieldsToUpdate);
  params.push(projectId);
  params.push(userId);

  const sql = `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`;
  await db.execute(sql, params);

  // Return only updated fields + id + updated_at
  return { id: projectId, ...fieldsToUpdate };
}

/**
 * Delete a project (owner check required)
 */
async function deleteProject(projectId, userId) {
  const project = await findProjectById(projectId, userId);
  if (!project) return false;

  // Delete all related data first
  await db.execute('DELETE FROM intake_contexts WHERE project_id = ?', [projectId]);
  await db.execute('DELETE FROM partners WHERE project_id = ?', [projectId]);
  await db.execute('DELETE FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);

  return true;
}

/* ── PARTNERS ──────────────────────────────────────────────────────── */

/**
 * List all partners for a project
 */
async function findPartnersByProjectId(projectId, userId) {
  // Verify project ownership
  const project = await findProjectById(projectId, userId);
  if (!project) return null;

  // LEFT JOIN organizations + entities para devolver coords cuando el partner está
  // vinculado. Prioridad: organizations.lat/lng (user-edited) > entities.geocoded_lat/lng (auto).
  // Calculator lo usa para auto-derivar bandas km.
  const sql = `
    SELECT
      p.id, p.project_id, p.name, p.legal_name, p.city, p.country, p.role,
      p.order_index, p.organization_id, p.created_at, p.updated_at,
      o.oid AS oid,
      COALESCE(o.lat, e.geocoded_lat) AS lat,
      COALESCE(o.lng, e.geocoded_lng) AS lng,
      CASE
        WHEN o.lat IS NOT NULL THEN o.geocoded_source
        ELSE e.geocoded_source
      END AS geo_source
    FROM partners p
    LEFT JOIN organizations o ON o.id = p.organization_id
    LEFT JOIN entities      e ON e.oid = o.oid
    WHERE p.project_id = ?
    ORDER BY p.order_index ASC
  `;
  const [rows] = await db.execute(sql, [projectId]);
  return rows.map(r => ({
    ...r,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
  }));
}

/**
 * Create a new partner for a project
 * Auto-set order_index and role (first = applicant, rest = partner)
 */
async function createPartner(projectId, userId, partnerData) {
  // Verify project ownership
  const project = await findProjectById(projectId, userId);
  if (!project) return null;

  const id = genUUID();
  const now = new Date().toISOString().split('T')[0];

  // Get max order_index
  const [maxRows] = await db.execute(
    'SELECT MAX(order_index) as max_idx FROM partners WHERE project_id = ?',
    [projectId]
  );
  const nextIndex = (maxRows[0]?.max_idx || 0) + 1;

  // First partner is always applicant, rest are partners
  const role = nextIndex === 1 ? 'applicant' : 'partner';

  const sql = `
    INSERT INTO partners (id, project_id, name, legal_name, city, country, role, order_index, organization_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    id,
    projectId,
    partnerData.name || '',
    partnerData.legal_name || '',
    partnerData.city || '',
    partnerData.country || '',
    role,
    nextIndex,
    partnerData.organization_id || null,
    now,
    now
  ];

  await db.execute(sql, params);

  return findPartnerById(id);
}

/**
 * Find a single partner by ID
 */
async function findPartnerById(partnerId) {
  const sql = `
    SELECT id, project_id, name, legal_name, city, country, role, order_index, created_at, updated_at
    FROM partners
    WHERE id = ?
  `;
  const [rows] = await db.execute(sql, [partnerId]);
  return rows[0] || null;
}

/**
 * Update a partner (ownership check via project_id)
 */
async function updatePartner(partnerId, userId, updates) {
  const partner = await findPartnerById(partnerId);
  if (!partner) return null;

  // Verify ownership through project
  const project = await findProjectById(partner.project_id, userId);
  if (!project) return null;

  const allowedFields = ['name', 'legal_name', 'city', 'country', 'organization_id'];
  const fieldsToUpdate = {};

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fieldsToUpdate[key] = value;
    }
  }

  if (Object.keys(fieldsToUpdate).length === 0) {
    return partner;
  }

  const now = new Date().toISOString().split('T')[0];
  fieldsToUpdate.updated_at = now;

  const setClauses = Object.keys(fieldsToUpdate).map(k => `${k} = ?`);
  const params = Object.values(fieldsToUpdate);
  params.push(partnerId);

  const sql = `UPDATE partners SET ${setClauses.join(', ')} WHERE id = ?`;
  await db.execute(sql, params);

  return { id: partnerId, ...fieldsToUpdate };
}

/**
 * Delete a partner (ownership check via project_id)
 */
async function deletePartner(partnerId, userId) {
  const partner = await findPartnerById(partnerId);
  if (!partner) return false;

  // Verify ownership
  const project = await findProjectById(partner.project_id, userId);
  if (!project) return false;

  await db.execute('DELETE FROM partners WHERE id = ?', [partnerId]);

  // Reorder remaining partners
  await reorderPartnersAfterDelete(partner.project_id);

  return true;
}

/**
 * Reorder partners after deletion to ensure continuous order_index
 */
async function reorderPartnersAfterDelete(projectId) {
  const [partners] = await db.execute(
    'SELECT id FROM partners WHERE project_id = ? ORDER BY order_index ASC',
    [projectId]
  );

  for (let i = 0; i < partners.length; i++) {
    await db.execute(
      'UPDATE partners SET order_index = ? WHERE id = ?',
      [i + 1, partners[i].id]
    );
  }
}

/**
 * Bulk reorder partners
 * Input: [{ id, order_index }, ...]
 */
async function reorderPartners(projectId, userId, orderUpdates) {
  // Verify project ownership
  const project = await findProjectById(projectId, userId);
  if (!project) return false;

  // Update each partner's order_index
  for (const update of orderUpdates) {
    const [result] = await db.execute(
      'UPDATE partners SET order_index = ? WHERE id = ? AND project_id = ?',
      [update.order_index, update.id, projectId]
    );
    if (result.affectedRows === 0) return false;
  }

  return true;
}

/* ── INTAKE CONTEXTS ────────────────────────────────────────────────── */

/**
 * Get intake contexts for a project
 */
async function findContextsByProjectId(projectId, userId) {
  // Verify project ownership
  const project = await findProjectById(projectId, userId);
  if (!project) return null;

  const sql = `
    SELECT id, project_id, problem, target_groups, approach, created_at, updated_at
    FROM intake_contexts
    WHERE project_id = ?
  `;
  const [rows] = await db.execute(sql, [projectId]);
  return rows;
}

/**
 * Find a single context by ID
 */
async function findContextById(contextId) {
  const sql = `
    SELECT id, project_id, problem, target_groups, approach, created_at, updated_at
    FROM intake_contexts
    WHERE id = ?
  `;
  const [rows] = await db.execute(sql, [contextId]);
  return rows[0] || null;
}

/**
 * Update context fields (autosave)
 */
async function updateContextFields(contextId, userId, updates) {
  const context = await findContextById(contextId);
  if (!context) return null;

  // Verify ownership through project
  const project = await findProjectById(context.project_id, userId);
  if (!project) return null;

  const allowedFields = ['problem', 'target_groups', 'approach'];
  const fieldsToUpdate = {};

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fieldsToUpdate[key] = value;
    }
  }

  if (Object.keys(fieldsToUpdate).length === 0) {
    return { id: contextId, updated_at: context.updated_at };
  }

  const now = new Date().toISOString().split('T')[0];
  fieldsToUpdate.updated_at = now;

  const setClauses = Object.keys(fieldsToUpdate).map(k => `${k} = ?`);
  const params = Object.values(fieldsToUpdate);
  params.push(contextId);

  const sql = `UPDATE intake_contexts SET ${setClauses.join(', ')} WHERE id = ?`;
  await db.execute(sql, params);

  return { id: contextId, ...fieldsToUpdate };
}

/* ── ENTITY SEARCH ─────────────────────────────────────────────── */

async function searchEntities({ q, country, type } = {}) {
  let sql = `
    SELECT DISTINCT e.id, e.name, e.city, e.country_iso2, e.type, e.pic_number,
           c.name_es AS country_name
    FROM ref_entities e
    LEFT JOIN ref_countries c ON c.iso2 = e.country_iso2
    WHERE e.active = 1`;
  const params = [];
  if (q) {
    const like = `%${q}%`;
    sql += ' AND (e.name LIKE ? OR e.city LIKE ? OR e.pic_number LIKE ?)';
    params.push(like, like, like);
  }
  if (country) {
    sql += ' AND e.country_iso2 = ?';
    params.push(country);
  }
  if (type) {
    sql += ' AND e.type = ?';
    params.push(type);
  }
  sql += ' ORDER BY e.name ASC LIMIT 50';
  const [rows] = await db.query(sql, params);
  return rows;
}

module.exports = {
  findActivePrograms,
  createProject,
  findProjectById,
  findProjectsByUserId,
  updateProjectFields,
  deleteProject,
  findPartnersByProjectId,
  createPartner,
  findPartnerById,
  updatePartner,
  deletePartner,
  reorderPartners,
  findContextsByProjectId,
  findContextById,
  updateContextFields,
  searchEntities,
  // Tasks
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  deleteAllTasks,
  // Interview
  getInterviewTurns,
  saveInterviewTurn,
  deleteInterview,
  saveInterviewSummary,
  buildInterviewContext,
};

/* ── Project Tasks ───────────────────────────────────────────── */

async function listTasks(projectId) {
  const [rows] = await db.query(
    'SELECT * FROM project_tasks WHERE project_id = ? ORDER BY wp_id, sort_order, created_at',
    [projectId]
  );
  return rows;
}

async function createTask(data) {
  const id = genUUID();
  await db.query(
    `INSERT INTO project_tasks (id, project_id, wp_id, category, subtype, title, description, partner_id, start_month, end_month, deliverable, milestone, kpi, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.project_id, data.wp_id || null, data.category, data.subtype, data.title, data.description || null,
     data.partner_id || null, data.start_month || null, data.end_month || null,
     data.deliverable || null, data.milestone || null, data.kpi || null, data.sort_order || 0]
  );
  return { id };
}

async function updateTask(id, data) {
  const fields = [];
  const params = [];
  for (const key of ['wp_id', 'title', 'description', 'partner_id', 'start_month', 'end_month', 'deliverable', 'milestone', 'kpi', 'status', 'sort_order']) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
  }
  if (!fields.length) return;
  params.push(id);
  await db.query(`UPDATE project_tasks SET ${fields.join(', ')} WHERE id = ?`, params);

  // Propagate partner_id changes to the corresponding wp_tasks.lead_partner_id
  // so the DMS generator (which reads from wp_tasks) sees the new leader
  // without waiting for the lazy sync inside the generator.
  if (data.partner_id !== undefined) {
    try {
      const [rows] = await db.query(`SELECT project_id FROM project_tasks WHERE id = ?`, [id]);
      const projectId = rows[0]?.project_id;
      if (projectId) {
        const { syncWpTaskLeadersFromProjectTasks } = require('../developer/model');
        await syncWpTaskLeadersFromProjectTasks(projectId);
      }
    } catch (e) { /* non-fatal: generator's own lazy sync will catch up */ }
  }
}

async function deleteTask(id) {
  await db.query('DELETE FROM project_tasks WHERE id = ?', [id]);
}

async function deleteAllTasks(projectId) {
  await db.query('DELETE FROM project_tasks WHERE project_id = ?', [projectId]);
}

/* ══ INTERVIEW ══════════════════════════════════════════════════ */

async function getInterviewTurns(projectId) {
  const [rows] = await db.query(
    'SELECT turn_index, role, content, created_at FROM intake_interviews WHERE project_id = ? ORDER BY turn_index',
    [projectId]
  );
  return rows;
}

async function saveInterviewTurn(projectId, userId, turnIndex, role, content) {
  const id = genUUID();
  await db.query(
    'INSERT INTO intake_interviews (id, project_id, user_id, turn_index, role, content) VALUES (?,?,?,?,?,?)',
    [id, projectId, userId, turnIndex, role, content]
  );
  return id;
}

async function deleteInterview(projectId) {
  await db.query('DELETE FROM intake_interviews WHERE project_id = ?', [projectId]);
  await db.query('UPDATE projects SET interview_summary = NULL WHERE id = ?', [projectId]);
}

async function saveInterviewSummary(projectId, summary) {
  await db.query('UPDATE projects SET interview_summary = ? WHERE id = ?', [summary, projectId]);
}

async function buildInterviewContext(projectId, userId) {
  // Project
  const [projects] = await db.query(
    'SELECT name, full_name, type, description, start_date, duration_months, eu_grant, cofin_pct, indirect_pct, calc_state FROM projects WHERE id = ? AND user_id = ?',
    [projectId, userId]
  );
  const proj = projects[0];
  if (!proj) return null;

  // Partners
  const [partners] = await db.query(
    'SELECT name, city, country, role FROM partners WHERE project_id = ? ORDER BY order_index',
    [projectId]
  );

  // Call summary from programme
  const [progs] = await db.query(
    'SELECT name, call_summary, eu_grant_max FROM intake_programs WHERE action_type = ? AND active = 1 LIMIT 1',
    [proj.type]
  );
  const programme = progs[0] || {};

  // Load WPs and activities from relational tables (primary source)
  let wps = [];
  const [wpRows] = await db.query(
    'SELECT id, code, title, summary, order_index FROM work_packages WHERE project_id = ? ORDER BY order_index',
    [projectId]
  );
  if (wpRows.length) {
    for (const wp of wpRows) {
      const [actRows] = await db.query(
        'SELECT label, type, subtype, description FROM activities WHERE wp_id = ? ORDER BY order_index',
        [wp.id]
      );
      wps.push({
        code: wp.code || `WP${wp.order_index + 1}`,
        name: wp.title || `Work Package ${wp.order_index + 1}`,
        summary: wp.summary || '',
        activities: actRows.map(a => ({
          label: a.label || a.type,
          subtype: a.subtype || '',
          desc: a.description || '',
        }))
      });
    }
  }
  // Fallback: try calc_state JSON if no WPs in tables
  if (!wps.length && proj.calc_state) {
    try {
      const cs = typeof proj.calc_state === 'string' ? JSON.parse(proj.calc_state) : proj.calc_state;
      if (cs && cs.wps) {
        wps = cs.wps.map((wp, i) => ({
          code: `WP${i + 1}`,
          name: wp.name || `Work Package ${i + 1}`,
          summary: wp.summary || '',
          activities: (wp.activities || []).map(a => ({
            label: a.label || a.type,
            subtype: a.subtype || '',
            desc: a.desc || '',
          }))
        }));
      }
    } catch (e) { /* calc_state not parseable */ }
  }

  // Format context string
  let ctx = `Project: ${proj.full_name || proj.name} (${proj.type})\n`;
  ctx += `Duration: ${proj.duration_months || '?'} months\n`;
  if (proj.start_date) ctx += `Start: ${String(proj.start_date).slice(0, 10)}\n`;
  ctx += `EU Grant: €${Number(proj.eu_grant || programme.eu_grant_max || 0).toLocaleString('es-ES')}\n\n`;

  ctx += `Partners (${partners.length}):\n`;
  partners.forEach((p, i) => {
    ctx += `  ${i + 1}. ${p.name} — ${p.city}, ${p.country} (${p.role})\n`;
  });

  if (wps.length) {
    ctx += `\nWork Packages (${wps.length} total):\n`;
    wps.forEach(wp => {
      ctx += `\n  ${wp.code}: ${wp.name}\n`;
      if (wp.summary) ctx += `    Summary: ${wp.summary}\n`;
      if (wp.activities.length) {
        ctx += `    Activities (${wp.activities.length}):\n`;
        wp.activities.forEach(a => {
          ctx += `      - ${a.label}${a.subtype ? ` (${a.subtype})` : ''}\n`;
          if (a.desc) ctx += `        Description: ${a.desc}\n`;
        });
      }
    });
  }

  if (programme.call_summary) {
    ctx += `\nCall priorities:\n${programme.call_summary}\n`;
  }

  return ctx;
}
