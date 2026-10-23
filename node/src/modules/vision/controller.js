/* ── EU Vision Controller (TASK-012) — /v1/vision/* ───────────────────
   Frontend pregunta · Node decide. Respuestas { ok, data } / { ok, error }. */

const model = require('./model');
const dir = require('../../utils/directory-api');

const { sendError } = require('../../utils/httpError');
// 5xx: mensaje genérico + requestId (el detalle va al log). Ver utils/httpError.
const fail = (res, code, message, status = 400) => sendError(res, status, { code, message });

/* GET / — mis visiones (owner) */
exports.list = async (req, res, next) => {
  try {
    res.json({ ok: true, data: await model.listByUser(req.user.id) });
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

/* GET /:id — la idea completa para editarla (solo el dueño). Los demás la ven
   con GET /:id/view, que no devuelve los campos internos. */
exports.getOne = async (req, res, next) => {
  try {
    const v = await model.getById(req.params.id);
    if (!v || !req.user || req.user.id !== v.user_id) return fail(res, 'NOT_FOUND', 'Idea no encontrada.', 404);
    const references = await model.listReferences(v.id);
    res.json({ ok: true, data: { vision: v, references, is_owner: true } });
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
    const r = await model.promote(req.params.id, req.user.id, req.lang);
    if (r.error === 'NOT_FOUND') return fail(res, 'NOT_FOUND', 'Visión no encontrada.', 404);
    res.json({ ok: true, data: r });
  } catch (e) { next(e); }
};

/* POST /:id/generate — redacción asistida (Claude de suscripción, no API) */
exports.generate = async (req, res, next) => {
  try {
    const callContext = (req.body && req.body.call_context) || {};
    // La IA redacta en el idioma de la interfaz (req.lang: 'es' | 'en').
    const r = await model.generateDraft(req.params.id, req.user.id, callContext, req.lang);
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

/* ── Ideas: tablón y solicitudes para unirse ──────────────────────────
   Solo con entidad («Mi entidad»); aceptar = avisar y compartir contactos.
   Los correos nunca bloquean la respuesta. */
const email = require('../../utils/email');

/* GET /public — tablón de ideas publicadas (?q=&programme=&call_id=&closed=1) */
exports.publicList = async (req, res, next) => {
  try {
    const { q, programme, call_id, closed } = req.query;
    res.json({ ok: true, data: await model.listPublic(req.user.id, { q, programme, call_id, closed: closed === '1' }) });
  } catch (e) { next(e); }
};

/* GET /public/counts — ideas públicas por convocatoria */
exports.publicCounts = async (req, res, next) => {
  try { res.json({ ok: true, data: await model.countsByCall() }); } catch (e) { next(e); }
};

/* GET /:id/view — ficha de una idea (pública, o la mía con las solicitudes) */
exports.view = async (req, res, next) => {
  try {
    const v = await model.getIdeaView(req.params.id, req.user.id);
    if (!v) return fail(res, 'NOT_FOUND', 'Idea no encontrada.', 404);
    res.json({ ok: true, data: v });
  } catch (e) { next(e); }
};

/* GET /requests/mine — ideas a las que he pedido unirme */
exports.myRequests = async (req, res, next) => {
  try { res.json({ ok: true, data: await model.myRequests(req.user.id) }); } catch (e) { next(e); }
};

/* GET /requests/pending-count — solicitudes pendientes en mis ideas */
exports.pendingCount = async (req, res, next) => {
  try { res.json({ ok: true, data: { count: await model.pendingForOwner(req.user.id) } }); } catch (e) { next(e); }
};

/* POST /:id/requests — { organization_id, role_offered?, message? } */
exports.createRequest = async (req, res, next) => {
  try {
    const r = await model.createRequest(req.params.id, req.user.id, req.body || {});
    if (r.error === 'NOT_AVAILABLE') return fail(res, 'NOT_AVAILABLE', 'Esta idea no está publicada.', 404);
    if (r.error === 'OWN_IDEA') return fail(res, 'OWN_IDEA', 'Es tu propia idea.');
    if (r.error === 'ORG_REQUIRED') return fail(res, 'ORG_REQUIRED', 'Vincula tu entidad para pedir unirte a una idea.');
    if (r.error === 'ALREADY_ACCEPTED') return fail(res, 'ALREADY_ACCEPTED', 'Ya formas parte de esta idea.', 409);
    if (r.error === 'REJECTED') return fail(res, 'REJECTED', 'Quien propone la idea ya respondió a tu solicitud.', 409);
    // Aviso al dueño solo con una solicitud nueva (no al editar una pendiente).
    if (!r.was_pending) {
      email.sendIdeaRequestEmail({
        to: r.idea.email, name: r.idea.name, lang: r.idea.ui_lang,
        ideaId: r.idea.id, ideaTitle: r.idea.title || '—', orgName: r.org.organization_name,
        requesterName: req.user.name || req.user.email,
        roleOffered: req.body?.role_offered, message: req.body?.message,
      }).catch(err => console.warn('[ideas] correo de solicitud no enviado:', err.message));
    }
    res.json({ ok: true, data: await model.getIdeaView(req.params.id, req.user.id) });
  } catch (e) { next(e); }
};

/* POST /:id/requests/withdraw — retirar mi solicitud */
exports.withdrawRequest = async (req, res, next) => {
  try {
    const done = await model.withdrawRequest(req.params.id, req.user.id);
    if (!done) return fail(res, 'NOT_FOUND', 'No tienes una solicitud en esta idea.', 404);
    res.json({ ok: true, data: await model.getIdeaView(req.params.id, req.user.id) });
  } catch (e) { next(e); }
};

/* POST /:id/requests/:reqId/accept | /reject — { note? } (solo el dueño) */
function decide(decision) {
  return async (req, res, next) => {
    try {
      const r = await model.decideRequest(req.params.id, req.user.id, req.params.reqId, decision, req.body?.note);
      if (r.error === 'NOT_FOUND') return fail(res, 'NOT_FOUND', 'Idea no encontrada.', 404);
      if (r.error === 'NOT_PENDING') return fail(res, 'NOT_PENDING', 'Esta solicitud ya estaba respondida.', 409);
      email.sendIdeaDecisionEmail({
        to: r.request.user_email, name: r.request.user_name, lang: r.request.ui_lang,
        ideaId: r.idea.id, ideaTitle: r.idea.title || '—', accepted: r.status === 'accepted',
        ownerName: r.idea.name, ownerEmail: r.idea.email, note: req.body?.note,
      }).catch(err => console.warn('[ideas] correo de respuesta no enviado:', err.message));
      res.json({ ok: true, data: await model.getIdeaView(req.params.id, req.user.id) });
    } catch (e) { next(e); }
  };
}
exports.acceptRequest = decide('accept');
exports.rejectRequest = decide('reject');
