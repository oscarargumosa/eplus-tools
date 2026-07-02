/* ═══════════════════════════════════════════════════════════════
   Public registry enrichment — datos del registro de la org
   ═══════════════════════════════════════════════════════════════
   Adjunta a la entidad del directorio un bloque `local_registry`
   con la información que el dueño metió en "Mi Organización", para
   mostrarla en la ficha pública del Partner Engine.

   PRIVACIDAD (regla dura):
   - Solo aplica si la org existe localmente y `is_public = 1`.
   - NUNCA se exponen datos personales (nombres/emails de
     representantes, persona de contacto, contactos de stakeholders).
     De las personas solo se expone SU EXISTENCIA (boolean).
   - Sí se exponen identificadores corporativos públicos (CIF/NIF,
     PIC, OID), códigos de acreditación y nombres de entidades
     colaboradoras (stakeholders), porque son datos institucionales.

   Si la org no existe localmente, `local_registry.claimed = false`
   y el front muestra "no se dispone de la data".
   ═══════════════════════════════════════════════════════════════ */

const pool = require('../../utils/db');

const STAKEHOLDER_SAMPLE = 5;

function hasText(s) {
  return typeof s === 'string' && s.trim() !== '';
}

async function getRegistry(oid, pic) {
  if (!oid && !pic) return null;
  let org;
  try {
    const conds = [];
    const params = [];
    if (oid) { conds.push('oid = ?'); params.push(oid); }
    if (pic) { conds.push('pic = ?'); params.push(pic); }
    const [[row]] = await pool.query(
      `SELECT id, national_id,
              legal_rep_first_name, legal_rep_family_name,
              cp_first_name, cp_family_name
         FROM organizations
        WHERE (${conds.join(' OR ')}) AND is_public = 1
        LIMIT 1`,
      params
    );
    org = row || null;
  } catch (e) {
    if (/Unknown column|doesn't exist/i.test(e.message)) return { claimed: false };
    throw e;
  }
  if (!org) return { claimed: false };

  // Hijos: acreditaciones (códigos), stakeholders (nombres org + nº), nº staff.
  let accreditations = [];
  let stakeholders_count = 0;
  let stakeholders_sample = [];
  let key_staff_count = 0;
  try {
    const [accs] = await pool.query(
      `SELECT accreditation_type, accreditation_reference
         FROM org_accreditations WHERE organization_id = ?`,
      [org.id]
    );
    accreditations = (accs || []).map(a => ({
      type: hasText(a.accreditation_type) ? a.accreditation_type : null,
      reference: hasText(a.accreditation_reference) ? a.accreditation_reference : null,
    }));

    const [[sc]] = await pool.query(
      `SELECT COUNT(*) AS n FROM org_stakeholders WHERE organization_id = ?`,
      [org.id]
    );
    stakeholders_count = parseInt(sc?.n, 10) || 0;

    const [sample] = await pool.query(
      `SELECT entity_name, entity_type, relationship_type
         FROM org_stakeholders
        WHERE organization_id = ? AND entity_name IS NOT NULL AND entity_name <> ''
        ORDER BY created_at ASC
        LIMIT ?`,
      [org.id, STAKEHOLDER_SAMPLE]
    );
    stakeholders_sample = (sample || []).map(s => ({
      name: s.entity_name,
      type: hasText(s.entity_type) ? s.entity_type : null,
      relationship: hasText(s.relationship_type) ? s.relationship_type : null,
    }));

    const [[kc]] = await pool.query(
      `SELECT COUNT(*) AS n FROM org_key_staff WHERE organization_id = ?`,
      [org.id]
    );
    key_staff_count = parseInt(kc?.n, 10) || 0;
  } catch (e) {
    if (!/Unknown column|doesn't exist/i.test(e.message)) throw e;
  }

  return {
    claimed: true,
    national_id: hasText(org.national_id) ? org.national_id : null,
    // Personas: SOLO existencia, nunca el valor.
    has_legal_rep:      hasText(org.legal_rep_first_name) && hasText(org.legal_rep_family_name),
    has_contact_person: hasText(org.cp_first_name) && hasText(org.cp_family_name),
    key_staff_count,
    accreditations,
    stakeholders_count,
    stakeholders_sample,
  };
}

async function attachToEntity(entity) {
  if (!entity) return entity;
  const oid = entity.oid || entity.OID || null;
  const pic = entity.pic || entity.PIC || null;
  const local_registry = await getRegistry(oid, pic);
  return { ...entity, local_registry: local_registry || { claimed: false } };
}

module.exports = { getRegistry, attachToEntity };
