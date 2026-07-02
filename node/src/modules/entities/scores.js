/* ═══════════════════════════════════════════════════════════════
   Entity scores — Personal · Experiencia · Alianzas
   ═══════════════════════════════════════════════════════════════
   Cada score 0–10. Sustituyen al trío legacy
   (score_professionalism / score_eu_readiness / score_vitality).

   Reglas (acordadas con Oscar 2026-05-07):

   PERSONAL  — viene de los datos que el dueño metió en "Mi Organización"
     · 1 pt si tiene representante legal completo
     · 1 pt si tiene persona de contacto completa
     · 1 pt por cada miembro de Personal clave (org_key_staff)
     · Cap 10. Sin org local registrada → 0.

   EXPERIENCIA — actividad histórica E+ del directorio
     · 1 pt por cada proyecto en `total_projects`
     · Cap 10. is_newcomer=true si total = 0.

   ALIANZAS — stakeholders/colaboradores que la org haya declarado
     · 1 pt por cada row en org_stakeholders
     · Cap 10.
   ═══════════════════════════════════════════════════════════════ */

const pool = require('../../utils/db');

const CAP = 10;

function nonEmpty(s) {
  return typeof s === 'string' && s.trim() !== '';
}

async function _lookupOrg(oid, pic) {
  if (!oid && !pic) return null;
  try {
    const conds = [];
    const params = [];
    if (oid) { conds.push('oid = ?'); params.push(oid); }
    if (pic) { conds.push('pic = ?'); params.push(pic); }
    const [[row]] = await pool.query(
      `SELECT id,
              legal_rep_first_name, legal_rep_family_name,
              cp_first_name, cp_family_name
         FROM organizations
        WHERE ${conds.join(' OR ')}
        LIMIT 1`,
      params
    );
    return row || null;
  } catch (e) {
    if (/Unknown column|doesn't exist/i.test(e.message)) return null;
    throw e;
  }
}

async function _countChildren(orgId, table) {
  if (!orgId) return 0;
  try {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE organization_id = ?`, [orgId]);
    return parseInt(row?.n, 10) || 0;
  } catch (e) {
    if (/Unknown column|doesn't exist/i.test(e.message)) return 0;
    throw e;
  }
}

async function computeForEntity(entity) {
  if (!entity) return { score_personal: 0, score_experience: 0, score_alliances: 0, is_newcomer: true };

  const oid = entity.oid || null;
  const pic = entity.pic || null;
  const org = await _lookupOrg(oid, pic);

  // PERSONAL
  let personal = 0;
  if (org) {
    if (nonEmpty(org.legal_rep_first_name) && nonEmpty(org.legal_rep_family_name)) personal += 1;
    if (nonEmpty(org.cp_first_name) && nonEmpty(org.cp_family_name)) personal += 1;
    const staffCount = await _countChildren(org.id, 'org_key_staff');
    personal += staffCount;
  }
  if (personal > CAP) personal = CAP;

  // EXPERIENCIA
  const total = parseInt(entity.total_projects, 10) || 0;
  const experience = Math.min(total, CAP);
  const is_newcomer = total === 0;

  // ALIANZAS
  let alliances = 0;
  if (org) {
    const stakeholderCount = await _countChildren(org.id, 'org_stakeholders');
    alliances = Math.min(stakeholderCount, CAP);
  }

  return {
    score_personal:   personal,
    score_experience: experience,
    score_alliances:  alliances,
    is_newcomer,
  };
}

async function attachToEntity(entity) {
  if (!entity) return entity;
  const scores = await computeForEntity(entity);
  return { ...entity, ...scores };
}

/* ── Versión bulk para listados (1 sola query) ─────────────── */
async function attachToList(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const oids = rows.map(r => r?.oid).filter(Boolean);
  const pics = rows.map(r => r?.pic).filter(Boolean).map(String);

  const orgsByOid = new Map();
  const orgsByPic = new Map();

  if (oids.length || pics.length) {
    try {
      const conds = [];
      const params = [];
      if (oids.length) { conds.push('o.oid IN (?)'); params.push(oids); }
      if (pics.length) { conds.push('o.pic IN (?)'); params.push(pics); }
      const [orgs] = await pool.query(
        `SELECT o.id, o.oid, o.pic,
                o.legal_rep_first_name, o.legal_rep_family_name,
                o.cp_first_name, o.cp_family_name,
                (SELECT COUNT(*) FROM org_key_staff WHERE organization_id = o.id) AS staff_count,
                (SELECT COUNT(*) FROM org_stakeholders WHERE organization_id = o.id) AS stakeholder_count
           FROM organizations o
          WHERE (${conds.join(' OR ')})`,
        params
      );
      for (const o of orgs) {
        if (o.oid)               orgsByOid.set(o.oid, o);
        if (o.pic)               orgsByPic.set(String(o.pic), o);
      }
    } catch (e) {
      if (!/Unknown column|doesn't exist/i.test(e.message)) throw e;
    }
  }

  return rows.map(r => {
    const org = (r?.oid && orgsByOid.get(r.oid)) ||
                (r?.pic && orgsByPic.get(String(r.pic))) || null;
    let personal = 0;
    if (org) {
      if (nonEmpty(org.legal_rep_first_name) && nonEmpty(org.legal_rep_family_name)) personal += 1;
      if (nonEmpty(org.cp_first_name)        && nonEmpty(org.cp_family_name))        personal += 1;
      personal += parseInt(org.staff_count, 10) || 0;
    }
    if (personal > CAP) personal = CAP;
    const total = parseInt(r.total_projects, 10) || 0;
    const experience = Math.min(total, CAP);
    const is_newcomer = total === 0;
    const alliances = org ? Math.min(parseInt(org.stakeholder_count, 10) || 0, CAP) : 0;
    return {
      ...r,
      score_personal:   personal,
      score_experience: experience,
      score_alliances:  alliances,
      is_newcomer,
    };
  });
}

module.exports = {
  computeForEntity,
  attachToEntity,
  attachToList,
};
