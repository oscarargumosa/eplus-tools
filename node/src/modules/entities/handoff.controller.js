/* ═══════════════════════════════════════════════════════════════
   Handoff Controller — Partner Engine → Writer / Intake
   ═══════════════════════════════════════════════════════════════
   Crear consorcio: dada una shortlist (oids), genera un proyecto
   nuevo en /intake con esas entidades pre-cargadas como partners.
   El usuario continúa la propuesta en el flujo Design → Write.
   ═══════════════════════════════════════════════════════════════ */

const pool = require('../../utils/db');
const uuid = require('../../utils/uuid');
const sl   = require('./shortlists.model');

const ok  = (res, data) => res.json({ ok: true, data });
const { sendError } = require('../../utils/httpError');
// 5xx: mensaje genérico + requestId (el detalle va al log). Ver utils/httpError.
const err = (res, msg, status = 400) => sendError(res, status, { message: msg });

/* ── Helpers ──────────────────────────────────────────────────── */

async function fetchEntities(oids) {
  if (!oids?.length) return [];
  const [rows] = await pool.query(
    `SELECT v.oid, v.display_name, v.legal_name, v.country_code, v.city
     FROM v_entities_public v
     WHERE v.oid IN (?)`,
    [oids]
  );
  return rows;
}

async function getUserDefaultOrg(userId) {
  // Reuses the link table from organizations module
  const [rows] = await pool.query(
    `SELECT o.id, o.organization_name, o.legal_name_national, o.legal_name_latin,
            o.country, o.city
     FROM user_organizations uo
     JOIN organizations o ON o.id = uo.organization_id
     WHERE uo.user_id = ?
     ORDER BY uo.created_at ASC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/* ── POST /v1/entities/handoff/consortium ────────────────────── */
exports.consortium = async (req, res) => {
  try {
    const { shortlist_id, oids: rawOids, project_name } = req.body || {};
    let oids = Array.isArray(rawOids) ? rawOids.filter(Boolean) : [];

    // Si llega shortlist_id, validamos ownership y cargamos sus items
    let listName = project_name || null;
    if (shortlist_id) {
      if (!await sl.isOwner(req.user.id, shortlist_id)) return err(res, 'Forbidden', 403);
      const detail = await sl.getShortlistDetail(req.user.id, shortlist_id);
      if (!detail) return err(res, 'Shortlist not found', 404);
      if (!oids.length) oids = (detail.items || []).map(it => it.oid);
      if (!listName) listName = detail.name;
    }

    if (!oids.length) return err(res, 'No entities provided');
    if (oids.length > 30) return err(res, 'Too many entities (max 30)');

    const entities = await fetchEntities(oids);
    if (!entities.length) return err(res, 'None of the OIDs were found in the atlas', 422);

    // Crear el proyecto (ID + intake_context vacío)
    const projectId = uuid();
    const today = new Date().toISOString().split('T')[0];
    const projectName = listName || `Consorcio (${entities.length} partners) — ${today}`;

    await pool.query(
      `INSERT INTO projects
         (id, user_id, name, type, description, proposal_lang, national_agency,
          start_date, duration_months, deadline, eu_grant, cofin_pct, indirect_pct,
          status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, 'en', NULL, NULL, NULL, NULL, 0, 0, 0, 'draft', ?, ?)`,
      [
        projectId,
        req.user.id,
        projectName,
        `Generado desde Partner Engine sobre ${entities.length} entidades preseleccionadas.` +
          (shortlist_id ? ` Shortlist: ${listName}.` : ''),
        today,
        today,
      ]
    );

    // intake_contexts row mínima (si la tabla existe)
    try {
      await pool.query(
        `INSERT INTO intake_contexts (id, project_id, created_at) VALUES (?, ?, ?)`,
        [uuid(), projectId, today]
      );
    } catch (_) { /* tabla puede no existir o tener distinto schema; skip */ }

    // Determinar applicant = entidad propia del user (si tiene)
    const myOrg = await getUserDefaultOrg(req.user.id).catch(() => null);
    let order = 0;
    if (myOrg) {
      await pool.query(
        `INSERT INTO partners (id, project_id, name, legal_name, city, country, role, order_index)
         VALUES (?, ?, ?, ?, ?, ?, 'applicant', ?)`,
        [
          uuid(), projectId,
          (myOrg.organization_name || 'Mi organización').slice(0, 100),
          (myOrg.legal_name_national || myOrg.legal_name_latin || myOrg.organization_name || 'Mi organización').slice(0, 200),
          (myOrg.city || '').slice(0, 100),
          (myOrg.country || 'ES').slice(0, 100),
          order++,
        ]
      );
    }

    // Insertar partners (cada entidad de la shortlist como rol 'partner')
    for (const e of entities) {
      await pool.query(
        `INSERT INTO partners (id, project_id, name, legal_name, city, country, role, order_index)
         VALUES (?, ?, ?, ?, ?, ?, 'partner', ?)`,
        [
          uuid(), projectId,
          (e.display_name || e.legal_name || 'Sin nombre').slice(0, 100),
          (e.legal_name || e.display_name || '').slice(0, 200),
          (e.city || '').slice(0, 100),
          (e.country_code || 'XX').slice(0, 100),
          order++,
        ]
      );
    }

    // Vincular el user al proyecto si existe la tabla
    try {
      await pool.query(
        `UPDATE users SET organization_id = COALESCE(organization_id, ?) WHERE id = ?`,
        [myOrg?.id || null, req.user.id]
      );
    } catch (_) {}

    ok(res, {
      project_id: projectId,
      partners_added: entities.length + (myOrg ? 1 : 0),
      applicant: myOrg ? myOrg.organization_name : null,
      consortium: entities.map(e => ({
        oid: e.oid,
        name: e.display_name || e.legal_name,
        country: e.country_code,
      })),
    });
  } catch (e) {
    err(res, e.message, e.status || 500);
  }
};
