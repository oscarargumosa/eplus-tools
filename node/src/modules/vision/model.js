/* ── EU Vision Model (TASK-012) ───────────────────────────────────────
   CRUD de visiones + referencias + interés. Doc: docs/EU_VISION_PLAN.md
   Regla de propiedad: toda mutación exige (id, user_id) del dueño.       */

const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');
const intakeModel = require('../intake/model');
const claudeCli = require('../../utils/claude-cli');

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
  await db.query(
    `INSERT INTO visions (id, user_id, entity_oid, call_id, call_title, programme, call_deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, s(entity_oid, 15), s(call_id, 190), s(call_title, 255), s(programme, 80), call_deadline || null]
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
    `SELECT v.*, (SELECT COUNT(*) FROM vision_interests i WHERE i.vision_id = v.id) AS interest_count
       FROM visions v
      WHERE v.user_id = ?
      ORDER BY v.updated_at DESC`,
    [userId]
  );
  return rows;
}

/* ── Update allowed fields (owner) ──────────────────────────────────── */
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
  themes:           jsonOrNull,
  own_role:         (v) => s(v, 255),
  differentiator:   (v) => (v == null ? null : String(v).slice(0, 4000)),
  entity_oid:       (v) => s(v, 15),
  current_step:     (v) => Math.max(1, Math.min(5, parseInt(v, 10) || 1)),
};

async function update(id, userId, patch = {}) {
  const current = await getById(id);
  if (!current || current.user_id !== userId) return null;

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
    if (!v.entity_oid) return { error: 'ENTITY_REQUIRED' };
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
async function promote(id, userId) {
  const v = await getById(id);
  if (!v || v.user_id !== userId) return { error: 'NOT_FOUND' };
  if (v.project_id) return { project_id: v.project_id, already: true };

  const project = await intakeModel.createProject(userId, {
    name: v.title || (v.programme ? `Visión · ${v.programme}` : 'Visión Erasmus+'),
    type: v.programme || null,
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

/* ── Interest (community; UI en v2, backend listo) ──────────────────── */
async function addInterest(visionId, userId, { entity_oid, message } = {}) {
  const v = await getById(visionId);
  if (!v || v.visibility !== 'public') return { error: 'NOT_AVAILABLE' };
  if (v.user_id === userId) return { error: 'OWN_VISION' };
  const iid = genUUID();
  await db.query(
    `INSERT INTO vision_interests (id, vision_id, user_id, entity_oid, message)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE entity_oid = VALUES(entity_oid), message = VALUES(message)`,
    [iid, visionId, userId, s(entity_oid, 15), message ? String(message).slice(0, 2000) : null]
  );
  return { ok: true };
}

async function listInterest(visionId, userId) {
  const v = await getById(visionId);
  if (!v || v.user_id !== userId) return null; // solo el dueño ve quién mostró interés
  const [rows] = await db.query(
    `SELECT id, user_id, entity_oid, message, created_at
       FROM vision_interests WHERE vision_id = ? ORDER BY created_at DESC`,
    [visionId]
  );
  return rows;
}

/* ── Redacción asistida por IA (Claude de suscripción, no API) ────────
   Combina: lo que pide la convocatoria + la idea en bruto del usuario +
   los proyectos de referencia que le gustaron → borrador coherente de
   visión (título + reto + valor europeo) que el usuario revisa y aprueba.
   NO guarda nada: devuelve el borrador para que el frontend lo confirme. */

function _list(a, n = 6) { return (Array.isArray(a) ? a : []).slice(0, n).map(x => '- ' + String(x)).join('\n'); }

function buildVisionPrompt(v, refs, call = {}) {
  const money = (x) => (x == null ? null : Number(x).toLocaleString('es-ES') + ' €');
  const budget = [money(call.budget_per_project_min_eur), money(call.budget_per_project_max_eur)].filter(Boolean).join(' – ');
  const refsBlock = (refs || []).map((r, i) => {
    const s = r.snapshot && typeof r.snapshot === 'object' ? r.snapshot : {};
    const desc = s.summary || s.project_summary_full || s.description || '';
    return `${i + 1}. ${r.title || r.project_identifier}${r.coordinator_country ? ' (' + r.coordinator_country + ')' : ''}${desc ? '\n   ' + String(desc).slice(0, 600) : ''}`;
  }).join('\n');

  return `Eres un experto en propuestas de proyectos europeos (Erasmus+, Horizon, CERV, LIFE, ESF+…). Tu tarea es dar forma a la VISIÓN inicial de un proyecto: un resumen breve, concreto y con lógica de financiación europea, para que el promotor lo comparta con socios potenciales y lo lleve a redacción.

Escribe en español claro y directo. Nada de jerga vacía ni promesas huecas. No inventes cifras ni datos duros (presupuestos, socios, fechas) que no aparezcan abajo. No uses herramientas ni leas ficheros: responde solo con el JSON pedido.

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

async function generateDraft(id, userId, callContext = {}) {
  const v = await getById(id);
  if (!v || v.user_id !== userId) return { error: 'NOT_FOUND' };
  const refs = await listReferences(id);
  const prompt = buildVisionPrompt(v, refs, callContext || {});
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
  promote, addInterest, listInterest,
  generateDraft,
};
