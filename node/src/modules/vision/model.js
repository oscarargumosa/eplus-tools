/* ── EU Vision Model (TASK-012) ───────────────────────────────────────
   CRUD de visiones + referencias + interés. Doc: docs/EU_VISION_PLAN.md
   Regla de propiedad: toda mutación exige (id, user_id) del dueño.       */

const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');
const intakeModel = require('../intake/model');
const claudeCli = require('../../utils/claude-cli');
const { tl } = require('../../utils/i18n');

const s = (v, n) => (v == null ? null : String(v).slice(0, n));
const jsonOrNull = (v) => {
  if (v == null) return null;
  try { return JSON.stringify(Array.isArray(v) ? v : []); } catch { return null; }
};

/* ── Completeness: título + texto de la visión ──────────────────────── */
function isComplete(v) {
  return !!(v.title && v.vision_text);
}

/* ── Create draft ───────────────────────────────────────────────────── */
async function create(userId, { call_id, call_title, programme, call_deadline, entity_oid } = {}) {
  const id = genUUID();
  // La idea nace con la primera entidad de «Mi entidad» (se cambia en Detalles).
  // i18n-no-inicio (consultas SQL)
  const [[org]] = await db.query(
    `SELECT o.id, o.oid FROM user_organizations uo JOIN organizations o ON o.id = uo.organization_id
      WHERE uo.user_id = ? ORDER BY uo.created_at LIMIT 1`, [userId]);
  // i18n-no-fin
  await db.query(
    `INSERT INTO visions (id, user_id, organization_id, entity_oid, call_id, call_title, programme, call_deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, org ? org.id : null, s(entity_oid, 15) || (org && org.oid) || null,
     s(call_id, 190), s(call_title, 255), s(programme, 80), call_deadline || null]
  );
  return getById(id);
}

/* ── Read (raw, no ownership check) ─────────────────────────────────── */
async function getById(id) {
  const [rows] = await db.query(`SELECT * FROM visions WHERE id = ?`, [id]);
  return rows[0] || null;
}

/* ── List my visions (owner) ────────────────────────────────────────── */
async function listByUser(userId) {
  const [rows] = await db.query(
    `SELECT v.*,
            (SELECT COUNT(*) FROM vision_interests i WHERE i.vision_id = v.id AND i.status = 'pending')  AS pending_count,
            (SELECT COUNT(*) FROM vision_interests i WHERE i.vision_id = v.id AND i.status = 'accepted') AS partners_count
       FROM visions v
      WHERE v.user_id = ?
      ORDER BY v.updated_at DESC`,
    [userId]
  );
  return rows;
}

/* ── Update allowed fields (owner) ──────────────────────────────────── */
const LOOKING_FOR_KEYS = ['coordinator', 'partners'];
const EDITABLE = {
  title:            (v) => s(v, 255),
  problem:          (v) => (v == null ? null : String(v).slice(0, 8000)),
  european_value:   (v) => (v == null ? null : String(v).slice(0, 8000)),
  vision_text:      (v) => (v == null ? null : String(v).slice(0, 8000)),
  budget_option_eur:(v) => (v == null ? null : Number(v)),
  budget_label:     (v) => s(v, 120),
  wp_count:         (v) => (v == null ? null : Math.max(0, Math.min(127, parseInt(v, 10) || 0))),
  duration_months:  (v) => (v == null ? null : Math.max(0, Math.min(600, parseInt(v, 10) || 0))),
  partner_types:    jsonOrNull,
  partner_countries:jsonOrNull,
  looking_for:      (v) => jsonOrNull(Array.isArray(v) ? v.filter(x => LOOKING_FOR_KEYS.includes(x)) : []),
  themes:           jsonOrNull,
  own_role:         (v) => s(v, 255),
  differentiator:   (v) => (v == null ? null : String(v).slice(0, 4000)),
  entity_oid:       (v) => s(v, 15),
  organization_id:  (v) => s(v, 36),
  current_step:     (v) => Math.max(1, Math.min(5, parseInt(v, 10) || 1)),
};

async function update(id, userId, patch = {}) {
  const current = await getById(id);
  if (!current || current.user_id !== userId) return null;

  // Entidad del dueño: solo una de «Mi entidad»; su OID se guarda también.
  if (Object.prototype.hasOwnProperty.call(patch, 'organization_id')) {
    const org = patch.organization_id ? await userHasOrg(userId, String(patch.organization_id)) : null;
    patch = { ...patch };
    if (org) { patch.organization_id = org.id; patch.entity_oid = org.oid || null; }
    else if (patch.organization_id) delete patch.organization_id;   // entidad ajena: se ignora
  }

  const sets = [];
  const params = [];
  for (const [k, transform] of Object.entries(EDITABLE)) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      sets.push(`${k} = ?`);
      params.push(transform(patch[k]));
    }
  }

  // Recompute status from the merged view.
  const merged = { ...current, ...patch };
  sets.push(`status = ?`);
  params.push(isComplete(merged) ? 'complete' : 'draft');

  params.push(id);
  await db.query(`UPDATE visions SET ${sets.join(', ')} WHERE id = ?`, params);
  return getById(id);
}

/* ── Publish / unpublish (owner) ────────────────────────────────────
   Publicar exige entidad vinculada + ficha completa (para el interés). */
async function setVisibility(id, userId, visibility) {
  const v = await getById(id);
  if (!v || v.user_id !== userId) return { error: 'NOT_FOUND' };
  if (visibility === 'public') {
    if (!v.organization_id && !v.entity_oid) return { error: 'ENTITY_REQUIRED' };
    if (!isComplete(v)) return { error: 'INCOMPLETE' };
    await db.query(
      `UPDATE visions SET visibility = 'public', published_at = COALESCE(published_at, NOW()) WHERE id = ?`,
      [id]
    );
  } else {
    await db.query(`UPDATE visions SET visibility = 'private' WHERE id = ?`, [id]);
  }
  return { vision: await getById(id) };
}

/* ── References (similar projects attached as inspiration) ──────────── */
async function listReferences(visionId) {
  const [rows] = await db.query(
    `SELECT * FROM vision_references WHERE vision_id = ? ORDER BY match_score DESC, created_at ASC`,
    [visionId]
  );
  return rows;
}

async function addReference(id, userId, ref = {}) {
  const v = await getById(id);
  if (!v || v.user_id !== userId) return null;
  const refId = genUUID();
  await db.query(
    `INSERT INTO vision_references
       (id, vision_id, project_identifier, title, programme, funding_year, coordinator_country, match_score, snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), programme = VALUES(programme), funding_year = VALUES(funding_year),
       coordinator_country = VALUES(coordinator_country), match_score = VALUES(match_score), snapshot = VALUES(snapshot)`,
    [
      refId, id, s(ref.project_identifier, 120), s(ref.title, 255), s(ref.programme, 80),
      ref.funding_year == null ? null : parseInt(ref.funding_year, 10),
      s(ref.coordinator_country, 8),
      ref.match_score == null ? null : Number(ref.match_score),
      ref.snapshot ? JSON.stringify(ref.snapshot).slice(0, 8000) : null,
    ]
  );
  return listReferences(id);
}

async function removeReference(id, userId, refId) {
  const v = await getById(id);
  if (!v || v.user_id !== userId) return null;
  await db.query(`DELETE FROM vision_references WHERE id = ? AND vision_id = ?`, [refId, id]);
  return listReferences(id);
}

/* ── Promote to Intake — crea proyecto semilla y enlaza ─────────────── */
async function promote(id, userId, lang = 'es') {
  const v = await getById(id);
  if (!v || v.user_id !== userId) return { error: 'NOT_FOUND' };
  if (v.project_id) return { project_id: v.project_id, already: true };

  const project = await intakeModel.createProject(userId, {
    name: v.title || (v.programme ? tl(lang, 'Visión · {programa}', { programa: v.programme }) : tl(lang, 'Visión Erasmus+')),
    // El Intake casa el proyecto con su convocatoria por action_type (= call_id).
    // `programme` es solo "Erasmus+": guardarlo como tipo dejaba la acción vacía y bloqueada.
    type: v.call_id || v.programme || null,
    description: v.european_value || v.problem || null,
    deadline: v.call_deadline || null,
    duration_months: v.duration_months || null,
    eu_grant: v.budget_option_eur || 0,
  });

  // Sembrar el reto en intake_contexts (lo lee el Writer / Libro de Hechos).
  if (v.problem) {
    await db.query(
      `UPDATE intake_contexts SET problem = ? WHERE project_id = ?`,
      [String(v.problem).slice(0, 8000), project.id]
    );
  }
  await db.query(`UPDATE visions SET project_id = ? WHERE id = ?`, [project.id, id]);
  return { project_id: project.id };
}

/* ── Ideas publicadas: tablón y solicitudes para unirse ────────────────
   Decisión de Óscar (23-oct-2026): solo se solicita en nombre de una entidad
   («Mi entidad»); aceptar = avisar y compartir contactos (el socio no entra
   solo en el consorcio de Diseñar). vision_interests guarda las solicitudes. */

// i18n-no-inicio (consultas SQL; los mensajes visibles están en el controlador)
// Entidad del dueño: la elegida en «Mi entidad» o, en visiones antiguas, la del
// OID (ficha reclamada o directorio). Subconsultas: un OID puede repetirse.
const OWNER_ORG_SQL = `
  COALESCE((SELECT o.organization_name FROM organizations o WHERE o.id = v.organization_id),
           (SELECT o.organization_name FROM organizations o WHERE o.oid = v.entity_oid ORDER BY o.claimed_by_user_id IS NULL, o.created_at LIMIT 1),
           (SELECT e.legal_name FROM entities e WHERE e.oid = v.entity_oid LIMIT 1)) AS org_name,
  COALESCE((SELECT o.country FROM organizations o WHERE o.id = v.organization_id),
           (SELECT o.country FROM organizations o WHERE o.oid = v.entity_oid ORDER BY o.claimed_by_user_id IS NULL, o.created_at LIMIT 1),
           (SELECT e.country_code FROM entities e WHERE e.oid = v.entity_oid LIMIT 1)) AS org_country,
  COALESCE((SELECT o.logo_url FROM organizations o WHERE o.id = v.organization_id),
           (SELECT o.logo_url FROM organizations o WHERE o.oid = v.entity_oid ORDER BY o.claimed_by_user_id IS NULL, o.created_at LIMIT 1)) AS org_logo`;

const CARD_SQL = `
  v.id, v.title, v.vision_text, v.programme, v.call_id, v.call_title, v.call_deadline,
  v.themes, v.partner_types, v.partner_countries, v.looking_for, v.budget_option_eur,
  v.wp_count, v.duration_months, v.published_at, (v.user_id = ?) AS is_owner,
  ${OWNER_ORG_SQL},
  (SELECT COUNT(*) FROM vision_interests i WHERE i.vision_id = v.id AND i.status = 'accepted') AS partners_count,
  (SELECT i.status FROM vision_interests i WHERE i.vision_id = v.id AND i.user_id = ?) AS my_status`;

/* Tablón: ideas públicas. Por defecto solo las de convocatorias abiertas. */
async function listPublic(userId, { q, programme, call_id, closed } = {}) {
  const where = [`v.visibility = 'public'`];
  const params = [userId, userId];
  if (!closed) where.push('(v.call_deadline IS NULL OR v.call_deadline >= CURDATE())');
  if (call_id) { where.push('v.call_id = ?'); params.push(s(call_id, 190)); }
  if (programme) { where.push('v.programme = ?'); params.push(s(programme, 80)); }
  const needle = String(q || '').trim().slice(0, 100);
  if (needle) {
    const like = '%' + needle.replace(/[\\%_]/g, c => '\\' + c) + '%';
    where.push('(v.title LIKE ? OR v.vision_text LIKE ? OR v.call_title LIKE ? OR v.programme LIKE ?)');
    params.push(like, like, like, like);
  }
  const [rows] = await db.query(
    `SELECT ${CARD_SQL} FROM visions v WHERE ${where.join(' AND ')}
      ORDER BY v.published_at DESC LIMIT 200`, params);
  return rows;
}

/* Cuántas ideas públicas hay por convocatoria (tarjetas de Convocatorias). */
async function countsByCall() {
  const [rows] = await db.query(
    `SELECT call_id, COUNT(*) AS n FROM visions
      WHERE visibility = 'public' AND call_id IS NOT NULL GROUP BY call_id`);
  const out = {};
  rows.forEach(r => { out[r.call_id] = Number(r.n); });
  return out;
}

// Entidad de una solicitud (organizations.id): nombre, país y logo.
const REQ_ORG_SQL = `
  o.organization_name AS org_name, o.country AS org_country, o.city AS org_city,
  o.logo_url AS org_logo, o.oid AS org_oid, o.website AS org_website`;

/* Ficha pública de una idea (o la del dueño, con sus solicitudes). */
async function getIdeaView(id, userId) {
  const [[row]] = await db.query(`SELECT ${CARD_SQL}, v.visibility, v.status, v.user_id FROM visions v WHERE v.id = ?`, [userId, userId, id]);
  if (!row) return null;
  const isOwner = row.user_id === userId;
  if (row.visibility !== 'public' && !isOwner) return null;
  delete row.user_id;

  const [partners] = await db.query(
    `SELECT i.id, i.role_offered, ${REQ_ORG_SQL}
       FROM vision_interests i LEFT JOIN organizations o ON o.id = i.organization_id
      WHERE i.vision_id = ? AND i.status = 'accepted' ORDER BY i.decided_at`, [id]);

  const [[mine]] = await db.query(
    `SELECT i.id, i.status, i.organization_id, i.role_offered, i.message, i.decision_note, i.created_at, i.decided_at
       FROM vision_interests i WHERE i.vision_id = ? AND i.user_id = ?`, [id, userId]);
  const view = { idea: row, partners, my_request: mine || null, is_owner: isOwner };

  // Si me aceptaron, veo el contacto del dueño.
  if (mine && mine.status === 'accepted') {
    const [[owner]] = await db.query(
      `SELECT u.name, u.email FROM visions v JOIN users u ON u.id = v.user_id WHERE v.id = ?`, [id]);
    view.owner_contact = owner || null;
  }
  // El dueño ve las solicitudes; el email del solicitante, solo una vez aceptada.
  if (isOwner) {
    const [reqs] = await db.query(
      `SELECT i.id, i.status, i.role_offered, i.message, i.decision_note, i.created_at, i.decided_at,
              u.name AS user_name, IF(i.status = 'accepted', u.email, NULL) AS user_email, ${REQ_ORG_SQL}
         FROM vision_interests i
         JOIN users u ON u.id = i.user_id
         LEFT JOIN organizations o ON o.id = i.organization_id
        WHERE i.vision_id = ? AND i.status <> 'withdrawn'
        ORDER BY FIELD(i.status, 'pending', 'accepted', 'rejected'), i.created_at DESC`, [id]);
    view.requests = reqs;
  }
  return view;
}

async function userHasOrg(userId, orgId) {
  const [[r]] = await db.query(
    `SELECT o.id, o.organization_name, o.oid FROM user_organizations uo
       JOIN organizations o ON o.id = uo.organization_id
      WHERE uo.user_id = ? AND uo.organization_id = ? LIMIT 1`, [userId, orgId]);
  return r || null;
}

async function ownerOf(visionId) {
  const [[r]] = await db.query(
    `SELECT v.id, v.title, v.visibility, v.user_id, u.name, u.email, u.ui_lang
       FROM visions v JOIN users u ON u.id = v.user_id WHERE v.id = ?`, [visionId]);
  return r || null;
}

/* Pedir unirse. Devuelve { request, idea, owner, org } para avisar al dueño. */
async function createRequest(visionId, userId, { organization_id, role_offered, message } = {}) {
  const idea = await ownerOf(visionId);
  if (!idea || idea.visibility !== 'public') return { error: 'NOT_AVAILABLE' };
  if (idea.user_id === userId) return { error: 'OWN_IDEA' };
  const org = organization_id ? await userHasOrg(userId, String(organization_id)) : null;
  if (!org) return { error: 'ORG_REQUIRED' };

  const [[prev]] = await db.query(
    `SELECT id, status FROM vision_interests WHERE vision_id = ? AND user_id = ?`, [visionId, userId]);
  if (prev && prev.status === 'accepted') return { error: 'ALREADY_ACCEPTED' };
  if (prev && prev.status === 'rejected') return { error: 'REJECTED' };
  const fields = [org.id, org.oid || null, s(role_offered, 255), message ? String(message).slice(0, 2000) : null];
  let reqId;
  if (prev) {
    reqId = prev.id;
    await db.query(
      `UPDATE vision_interests SET organization_id = ?, entity_oid = ?, role_offered = ?, message = ?,
              status = 'pending', decided_at = NULL, decided_by = NULL, decision_note = NULL
        WHERE id = ?`, [...fields, reqId]);
  } else {
    reqId = genUUID();
    await db.query(
      `INSERT INTO vision_interests (id, vision_id, user_id, organization_id, entity_oid, role_offered, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`, [reqId, visionId, userId, ...fields]);
  }
  return { request_id: reqId, was_pending: !!(prev && prev.status === 'pending'), idea, org };
}

/* Retirar mi solicitud (pendiente o aceptada). */
async function withdrawRequest(visionId, userId) {
  const [r] = await db.query(
    `UPDATE vision_interests SET status = 'withdrawn'
      WHERE vision_id = ? AND user_id = ? AND status IN ('pending', 'accepted')`, [visionId, userId]);
  return r.affectedRows > 0;
}

/* El dueño acepta o rechaza una solicitud pendiente. */
async function decideRequest(visionId, ownerId, requestId, decision, note) {
  const idea = await ownerOf(visionId);
  if (!idea || idea.user_id !== ownerId) return { error: 'NOT_FOUND' };
  const status = decision === 'accept' ? 'accepted' : 'rejected';
  const [upd] = await db.query(
    `UPDATE vision_interests SET status = ?, decided_at = NOW(), decided_by = ?, decision_note = ?
      WHERE id = ? AND vision_id = ? AND status = 'pending'`,
    [status, ownerId, note ? String(note).slice(0, 1000) : null, requestId, visionId]);
  if (!upd.affectedRows) return { error: 'NOT_PENDING' };
  const [[req]] = await db.query(
    `SELECT i.id, i.status, u.name AS user_name, u.email AS user_email, u.ui_lang, o.organization_name AS org_name
       FROM vision_interests i JOIN users u ON u.id = i.user_id
       LEFT JOIN organizations o ON o.id = i.organization_id WHERE i.id = ?`, [requestId]);
  return { status, idea, request: req };
}

/* Mis solicitudes (las ideas a las que he pedido unirme). */
async function myRequests(userId) {
  const [rows] = await db.query(
    `SELECT i.id AS request_id, i.status, i.role_offered, i.message, i.decision_note, i.created_at, i.decided_at,
            o.organization_name AS my_org_name,
            v.id, v.title, v.programme, v.call_title, v.call_deadline, v.visibility,
            ${OWNER_ORG_SQL},
            IF(i.status = 'accepted', u.name, NULL)  AS owner_name,
            IF(i.status = 'accepted', u.email, NULL) AS owner_email
       FROM vision_interests i
       JOIN visions v ON v.id = i.vision_id
       JOIN users u ON u.id = v.user_id
       LEFT JOIN organizations o ON o.id = i.organization_id
      WHERE i.user_id = ? AND i.status <> 'withdrawn'
      ORDER BY i.updated_at DESC`, [userId]);
  return rows;
}

/* Solicitudes pendientes en mis ideas (contador de la pestaña Ideas). */
async function pendingForOwner(userId) {
  const [[r]] = await db.query(
    `SELECT COUNT(*) AS n FROM vision_interests i JOIN visions v ON v.id = i.vision_id
      WHERE v.user_id = ? AND i.status = 'pending'`, [userId]);
  return Number(r.n) || 0;
}

// i18n-no-fin

/* ── Redacción asistida por IA (Claude de suscripción, no API) ────────
   Combina: lo que pide la convocatoria + la idea en bruto del usuario +
   los proyectos de referencia que le gustaron → borrador coherente de
   visión (título + reto + valor europeo) que el usuario revisa y aprueba.
   NO guarda nada: devuelve el borrador para que el frontend lo confirme. */

function _list(a, n = 6) { return (Array.isArray(a) ? a : []).slice(0, n).map(x => '- ' + String(x)).join('\n'); }

function buildVisionPrompt(v, refs, call = {}, lang = 'es') {
  const money = (x) => (x == null ? null : Number(x).toLocaleString('es-ES') + ' €');
  const budget = [money(call.budget_per_project_min_eur), money(call.budget_per_project_max_eur)].filter(Boolean).join(' – ');
  const refsBlock = (refs || []).map((r, i) => {
    const s = r.snapshot && typeof r.snapshot === 'object' ? r.snapshot : {};
    const desc = s.summary || s.project_summary_full || s.description || '';
    return `${i + 1}. ${r.title || r.project_identifier}${r.coordinator_country ? ' (' + r.coordinator_country + ')' : ''}${desc ? '\n   ' + String(desc).slice(0, 600) : ''}`;
  }).join('\n');

  // i18n-no-inicio (prompt para la IA: no lo ve la persona)
  // Idioma de respuesta = idioma de la interfaz. El resto del prompt no se traduce.
  const writeIn = lang === 'en'
    ? 'Escribe en inglés británico (British English), claro y directo: la persona usa la aplicación en inglés. El título y el texto de la visión, en inglés.'
    : 'Escribe en español claro y directo.';

  return `Eres un experto en propuestas de proyectos europeos (Erasmus+, Horizon, CERV, LIFE, ESF+…). Tu tarea es dar forma a la VISIÓN inicial de un proyecto: un resumen breve, concreto y con lógica de financiación europea, para que el promotor lo comparta con socios potenciales y lo lleve a redacción.

${writeIn} Nada de jerga vacía ni promesas huecas. No inventes cifras ni datos duros (presupuestos, socios, fechas) que no aparezcan abajo. No uses herramientas ni leas ficheros: responde solo con el JSON pedido.

## LO QUE PIDE LA CONVOCATORIA
Convocatoria: ${call.title || v.call_title || v.call_id || '—'} (${call.programme || v.programme || '—'})
Objetivo: ${call.main_objective || call.summary_es || '—'}
Actividades esperadas:
${_list(call.eligible_activities) || '- (no especificadas)'}
Resultados esperados:
${_list(call.expected_outcomes) || '- (no especificados)'}
Prioridades/temas: ${(Array.isArray(call.themes_ai) ? call.themes_ai.join(', ') : '') || '—'}
Presupuesto por proyecto: ${budget || '—'}${call.cofinancing_pct ? ' · cofinanciación UE ' + call.cofinancing_pct + '%' : ''}

## LA IDEA DEL PROMOTOR (en bruto, puede estar incompleta o mal redactada)
Reto que quiere resolver: ${v.problem || '(no lo ha escrito aún)'}
Su idea de valor europeo: ${v.european_value || '(no la ha escrito aún)'}
Temas que ha marcado: ${(Array.isArray(v.themes) ? v.themes.join(', ') : '') || '—'}
Tipo de socios que busca: ${(Array.isArray(v.partner_types) ? v.partner_types.join(', ') : '') || '—'}
Países: ${(Array.isArray(v.partner_countries) ? v.partner_countries.join(', ') : '') || '—'}
Escala: ${v.budget_option_eur != null ? money(v.budget_option_eur) : '—'}${v.wp_count ? ' · ' + v.wp_count + ' paquetes de trabajo' : ''}

## PROYECTOS APROBADOS QUE LE GUSTARON (inspiración de enfoque y calidad — NO copiar)
${refsBlock || '(ninguno seleccionado)'}

## TAREA
Genera la visión como UN SOLO TEXTO claro y cercano, que cualquiera entienda (no un experto en fondos). Que encaje con lo que pide la convocatoria, respete la idea del promotor y se inspire (sin copiar) en los proyectos de referencia. Si el promotor apenas ha escrito, constrúyela a partir de la convocatoria + referencias + temas marcados.

Escríbelo en DOS párrafos cortos separados por una línea en blanco (un salto de línea doble \\n\\n): el primero, qué problema aborda y cómo, en una pincelada; el segundo, por qué importa a nivel europeo (qué se perdería si no se hace). 4-7 frases en total. Sin jerga, sin promesas huecas, sin cifras inventadas. No dejes el texto como un único bloque.

Devuelve SOLO un JSON válido, sin markdown ni texto alrededor, con esta forma exacta (el \\n\\n dentro del string separa los dos párrafos):
{
  "title": "título corto y evocador de la visión (máx. 90 caracteres)",
  "vision_text": "primer párrafo…\\n\\nsegundo párrafo…"
}`;
  // i18n-no-fin
}

function _parseJson(raw) {
  let s = String(raw || '').trim();
  // quitar fences ```json ... ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // si viene con texto alrededor, aislar el primer objeto {...}
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

async function generateDraft(id, userId, callContext = {}, lang = 'es') {
  const v = await getById(id);
  if (!v || v.user_id !== userId) return { error: 'NOT_FOUND' };
  const refs = await listReferences(id);
  const prompt = buildVisionPrompt(v, refs, callContext || {}, lang);
  const raw = await claudeCli.runSubscription(prompt, { timeoutMs: 180000 });
  let parsed;
  try { parsed = _parseJson(raw); }
  catch (e) { const err = new Error('AI returned invalid JSON'); err.code = 'AI_PARSE'; throw err; }
  const clip = (x, n) => (x == null ? '' : String(x).slice(0, n));
  return {
    draft: {
      title: clip(parsed.title, 255),
      vision_text: clip(parsed.vision_text || parsed.problem, 8000),
    },
  };
}

module.exports = {
  create, getById, listByUser, update, setVisibility,
  listReferences, addReference, removeReference,
  promote, listPublic, countsByCall, getIdeaView, userHasOrg,
  createRequest, withdrawRequest, decideRequest, myRequests, pendingForOwner,
  generateDraft,
};
