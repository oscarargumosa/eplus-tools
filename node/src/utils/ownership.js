/* ── Ownership helpers — cierre de IDOR ──────────────────────────────
   Comprueban que un recurso (proyecto, o algo que cuelga de un proyecto)
   pertenece al usuario de la sesión. Si no existe o no es suyo lanzan un
   error con status 404 (no revelamos si existe). El rol 'admin' pasa
   salvo que se pida { allowAdmin: false }.

   Uso en controladores:
     await own.assertProjectOwner(req.params.projectId, req.user);
   o como middleware de ruta:
     router.get('/projects/:projectId/x', requireAuth, own.ownProjectParam('projectId'), ctrl.x);
*/
const pool = require('./db');

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

function notFound(what = 'Resource') {
  const e = new Error(`${what} not found`);
  e.status = 404;
  e.code = 'NOT_FOUND';
  return e;
}

/* Comprueba la propiedad de un proyecto. Devuelve { id, user_id }. */
async function assertProjectOwner(projectId, user, { allowAdmin = true } = {}) {
  if (!projectId || !user) throw notFound('Project');
  const [rows] = await pool.query('SELECT id, user_id FROM projects WHERE id = ?', [projectId]);
  const p = rows[0];
  if (!p) throw notFound('Project');
  if (p.user_id === user.id) return p;
  if (allowAdmin && isAdmin(user)) return p;
  throw notFound('Project');
}

/* Resuelve el proyecto de un diagnosis_run y comprueba propiedad. */
async function assertRunOwner(runId, user, opts) {
  const [rows] = await pool.query('SELECT project_id FROM diagnosis_runs WHERE id = ?', [runId]);
  if (!rows[0]) throw notFound('Run');
  await assertProjectOwner(rows[0].project_id, user, opts).catch(() => { throw notFound('Run'); });
  return rows[0].project_id;
}

/* Resuelve el proyecto de un diagnosis_finding (vía su run). */
async function assertFindingOwner(findingId, user, opts) {
  const [rows] = await pool.query(
    `SELECT r.project_id FROM diagnosis_findings f
     JOIN diagnosis_runs r ON r.id = f.run_id
     WHERE f.id = ?`,
    [findingId]
  );
  if (!rows[0]) throw notFound('Finding');
  await assertProjectOwner(rows[0].project_id, user, opts).catch(() => { throw notFound('Finding'); });
  return rows[0].project_id;
}

/* Resuelve el proyecto de una improvement_action. */
async function assertActionOwner(actionId, user, opts) {
  const [rows] = await pool.query('SELECT project_id FROM improvement_actions WHERE id = ?', [actionId]);
  if (!rows[0]) throw notFound('Action');
  await assertProjectOwner(rows[0].project_id, user, opts).catch(() => { throw notFound('Action'); });
  return rows[0].project_id;
}

/* Resuelve el proyecto de una project_task. */
async function assertTaskOwner(taskId, user, opts) {
  const [rows] = await pool.query('SELECT project_id FROM project_tasks WHERE id = ?', [taskId]);
  if (!rows[0]) throw notFound('Task');
  await assertProjectOwner(rows[0].project_id, user, opts).catch(() => { throw notFound('Task'); });
  return rows[0].project_id;
}

/* Fábrica de middleware: resuelve el recurso desde req.params[param]. */
function paramGuard(assertFn, param, opts) {
  return async (req, res, next) => {
    try {
      await assertFn(req.params[param], req.user, opts);
      next();
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: e.message } });
      }
      next(e);
    }
  };
}

module.exports = {
  isAdmin,
  notFound,
  assertProjectOwner,
  assertRunOwner,
  assertFindingOwner,
  assertActionOwner,
  assertTaskOwner,
  ownProjectParam: (param = 'projectId', opts) => paramGuard(assertProjectOwner, param, opts),
  ownRunParam:     (param = 'runId', opts)     => paramGuard(assertRunOwner, param, opts),
  ownFindingParam: (param = 'findingId', opts) => paramGuard(assertFindingOwner, param, opts),
  ownActionParam:  (param = 'actionId', opts)  => paramGuard(assertActionOwner, param, opts),
};
