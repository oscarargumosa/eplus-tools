/* ── EU Vision Controller (TASK-012) — /v1/vision/* ───────────────────
   Frontend pregunta · Node decide. Respuestas { ok, data } / { ok, error }. */

const model = require('./model');
const dir = require('../../utils/directory-api');

const fail = (res, code, message, status = 400) =>
  res.status(status).json({ ok: false, error: { code, message } });

/* GET / — mis visiones (owner). Devuelve también mi entidad, para que el
   frontend sepa si puede ofrecer el ámbito "de mi entidad". */
exports.list = async (req, res, next) => {
  try {
    const [rows, entity_oid] = await Promise.all([
      model.listByUser(req.user.id),
      model.myEntityOid(req.user.id),
    ]);
    const entity = entity_oid ? (await model.entityCards([entity_oid]))[entity_oid] || { oid: entity_oid } : null;
    res.json({ ok: true, data: { rows, entity } });
  } catch (e) { next(e); }
};

/* GET /public — tablón de visiones publicadas (optionalAuth: el invitado
   las ve, no interactúa). Excluye las de mi propia entidad si se pide, para
   que "Explorar" no repita lo que ya sale en "De mi entidad". */
exports.publicList = async (req, res, next) => {
  try {
    const mine = req.user ? await model.myEntityOid(req.user.id) : null;
    const rows = await model.listPublic({
      q: req.query.q,
      programme: req.query.programme,
      exclude_entity_oid: req.query.exclude_mine === '1' ? mine : null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ ok: true, data: { rows, my_entity_oid: mine } });
  } catch (e) { next(e); }
};

/* GET /entity — visiones de mi entidad (las mías + las públicas de mis
   compañeros de la misma entidad). */
exports.entityList = async (req, res, next) => {
  try {
    const entity_oid = await model.myEntityOid(req.user.id);
    if (!entity_oid) return res.json({ ok: true, data: { rows: [], entity: null } });
    const [rows, cards] = await Promise.all([
      model.listByEntity(entity_oid, req.user.id),
      model.entityCards([entity_oid]),
    ]);
    res.json({ ok: true, data: { rows, entity: cards[entity_oid] || { oid: entity_oid } } });
  } catch (e) { next(e); }
};

/* POST / — crear borrador */
exports.create = async (req, res, next) => {
  try {
    const { call_id } = req.body || {};
    if (!call_id) return fail(res, 'CALL_REQUIRED', 'Falta la convocatoria (call_id).');
    const vision = await model.create(req.user.id, req.body || {});
    res.json({ ok: true, data: vision });
  } catch (e) { next(e); }
};

/* GET /:id — ficha (optionalAuth). Privada → solo dueño. Pública → cualquiera. */
exports.getOne = async (req, res, next) => {
  try {
    const v = await model.getById(req.params.id);
    if (!v) return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    const isOwner = !!(req.user && req.user.id === v.user_id);
    if (v.visibility !== 'public' && !isOwner) {
      return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    }
    const references = await model.listReferences(v.id);
    // Quién la firma: la entidad, con nombre y logo. Es lo que ve el público.
    const cards = v.entity_oid ? await model.entityCards([v.entity_oid]) : {};
    const author = v.entity_oid ? (cards[v.entity_oid] || { oid: v.entity_oid }) : null;
    const data = { vision: v, references, is_owner: isOwner, author };
    // El interés solo lo ve el dueño; los invitados ni lo ven.
    if (isOwner) data.interests = await model.listInterest(v.id, req.user.id);
    res.json({ ok: true, data });
  } catch (e) { next(e); }
};

/* PATCH /:id — autosave de paso */
exports.update = async (req, res, next) => {
  try {
    const v = await model.update(req.params.id, req.user.id, req.body || {});
    if (!v) return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    res.json({ ok: true, data: v });
  } catch (e) { next(e); }
};

/* POST /:id/publish — { visibility } */
exports.publish = async (req, res, next) => {
  try {
    const visibility = req.body?.visibility === 'public' ? 'public' : 'private';
    const r = await model.setVisibility(req.params.id, req.user.id, visibility);
    if (r.error === 'NOT_FOUND') return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    if (r.error === 'ENTITY_REQUIRED') return fail(res, 'ENTITY_REQUIRED', 'Vincula tu entidad antes de publicar.');
    if (r.error === 'INCOMPLETE') return fail(res, 'INCOMPLETE', 'Completa la visión antes de publicarla.');
    res.json({ ok: true, data: r.vision });
  } catch (e) { next(e); }
};

/* POST /:id/references — adjuntar proyecto similar */
exports.addReference = async (req, res, next) => {
  try {
    const refs = await model.addReference(req.params.id, req.user.id, req.body || {});
    if (!refs) return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    res.json({ ok: true, data: refs });
  } catch (e) { next(e); }
};

/* DELETE /:id/references/:refId */
exports.removeReference = async (req, res, next) => {
  try {
    const refs = await model.removeReference(req.params.id, req.user.id, req.params.refId);
    if (!refs) return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    res.json({ ok: true, data: refs });
  } catch (e) { next(e); }
};

/* POST /:id/promote — semilla de Intake */
exports.promote = async (req, res, next) => {
  try {
    const r = await model.promote(req.params.id, req.user.id);
    if (r.error === 'NOT_FOUND') return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    res.json({ ok: true, data: r });
  } catch (e) { next(e); }
};

/* POST /:id/generate — redacción asistida (Claude de suscripción, no API) */
exports.generate = async (req, res, next) => {
  try {
    const callContext = (req.body && req.body.call_context) || {};
    const r = await model.generateDraft(req.params.id, req.user.id, callContext);
    if (r.error === 'NOT_FOUND') return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    res.json({ ok: true, data: r.draft });
  } catch (e) {
    if (e.code === 'AI_DISABLED' || e.code === 'ENOENT') return fail(res, 'AI_UNAVAILABLE', 'La IA de suscripción no está disponible en este entorno.', 503);
    if (e.code === 'AI_TIMEOUT') return fail(res, 'AI_TIMEOUT', 'La IA tardó demasiado. Inténtalo de nuevo.', 504);
    if (e.code === 'AI_PARSE') return fail(res, 'AI_PARSE', 'La IA devolvió un formato inesperado. Inténtalo de nuevo.', 502);
    next(e);
  }
};

/* POST /suggest-projects — proxy Experience RAG */
exports.suggestProjects = async (req, res, next) => {
  try {
    const { query_text } = req.body || {};
    if (!query_text || String(query_text).trim().length < 8) {
      return fail(res, 'QUERY_REQUIRED', 'Escribe algo más de contexto para buscar proyectos similares.');
    }
    const body = {
      query_text: String(query_text).slice(0, 2000),
      entity_oid: req.body.entity_oid || undefined,
      k: Math.max(1, Math.min(10, parseInt(req.body.k, 10) || 5)),
      min_score: req.body.min_score != null ? Number(req.body.min_score) : 0.65,
      exclude_identifiers: Array.isArray(req.body.exclude_identifiers) ? req.body.exclude_identifiers : undefined,
    };
    const data = await dir.retrieveProjectsSimilar(body);
    res.json({ ok: true, data });
  } catch (e) {
    if (e.status && e.status >= 400 && e.status < 500) {
      return fail(res, 'DIRECTORY_ERROR', 'El servicio de proyectos similares no está disponible ahora.', 502);
    }
    next(e);
  }
};

/* GET /project/:identifier/full — proxy lectura del drawer */
exports.projectFull = async (req, res, next) => {
  try {
    const data = await dir.getProjectFull(req.params.identifier);
    res.json({ ok: true, data });
  } catch (e) {
    if (e.status === 404) return fail(res, 'NOT_FOUND', 'Proyecto no encontrado.', 404);
    if (e.status && e.status >= 400 && e.status < 500) {
      return fail(res, 'DIRECTORY_ERROR', 'No se pudo cargar el proyecto ahora.', 502);
    }
    next(e);
  }
};

/* ── Comunidad (v2) ─────────────────────────────────────────────────── */

/* POST /:id/interest — mostrar interés (no invitados) */
exports.addInterest = async (req, res, next) => {
  try {
    const r = await model.addInterest(req.params.id, req.user.id, req.body || {});
    if (r.error === 'NOT_AVAILABLE') return fail(res, 'NOT_AVAILABLE', 'Esta visión no está abierta a interés.', 404);
    if (r.error === 'OWN_VISION') return fail(res, 'OWN_VISION', 'Es tu propia visión.');
    res.json({ ok: true, data: r });
  } catch (e) { next(e); }
};

/* GET /:id/interest — quién mostró interés (solo dueño) */
exports.listInterest = async (req, res, next) => {
  try {
    const rows = await model.listInterest(req.params.id, req.user.id);
    if (rows == null) return fail(res, 'FORBIDDEN', 'Solo el dueño puede ver el interés.', 403);
    res.json({ ok: true, data: rows });
  } catch (e) { next(e); }
};
