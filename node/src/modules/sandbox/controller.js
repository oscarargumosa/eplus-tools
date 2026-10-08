/* ── Sandbox Controller — start demo project / graduate to real ─────── */

const model = require('./model');

/**
 * POST /v1/sandbox/start
 * If the authenticated user already has a sandbox project, returns it.
 * Otherwise creates a new one pre-loaded with the Sports small-scale program.
 * Returns { project } so the frontend can redirect directly.
 */
async function startSandbox(req, res, next) {
  try {
    const userId = req.user.id;

    let project = await model.findSandboxProject(userId);
    if (!project) {
      project = await model.createSandboxProject(userId);
    }

    res.status(200).json({ ok: true, data: { project } });
  } catch (err) {
    if (err.code === 'SANDBOX_PROGRAM_MISSING') {
      return require('../../utils/httpError').sendError(res, 503, { code: err.code, message: err.message }, err);
    }
    next(err);
  }
}

/**
 * POST /v1/sandbox/graduate/:id
 * Flips is_sandbox to 0 on the given project, unblocking export / submit / invite.
 */
async function graduateSandbox(req, res, next) {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    const project = await model.findProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }
    if (!project.is_sandbox) {
      return res.status(422).json({
        ok: false,
        error: { code: 'UNPROCESSABLE', message: 'Project is not a sandbox' },
      });
    }

    await model.graduateProject(projectId);
    res.json({ ok: true, data: { id: projectId, is_sandbox: 0 } });
  } catch (err) {
    next(err);
  }
}

module.exports = { startSandbox, graduateSandbox };
