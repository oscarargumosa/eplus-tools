/* ── Master · control de acceso (IDOR) ──────────────────────────
   Todo recurso del Maestro cuelga de un proyecto (projects.user_id).
   El dueño del proyecto accede; role 'admin' pasa siempre; el resto
   recibe 404. :projectId se valida con router.param (reutiliza el
   helper de developer); los :id se validan por tipo de recurso.
   ─────────────────────────────────────────────────────────────── */
const pool = require('../../utils/db');
const { isAdmin, projectParam } = require('../developer/access');

// SQL que, dado el :id, devuelve el user_id dueño del proyecto.
const OWNER_SQL = {
  document:  `SELECT p.user_id FROM master_documents d JOIN projects p ON p.id = d.project_id WHERE d.id = ?`,
  chapter:   `SELECT p.user_id FROM master_chapters c JOIN master_documents d ON d.id = c.master_doc_id
                JOIN projects p ON p.id = d.project_id WHERE c.id = ?`,
  export:    `SELECT p.user_id FROM master_exports e JOIN projects p ON p.id = e.project_id WHERE e.id = ?`,
  thread:    `SELECT p.user_id FROM chat_threads t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`,
  diagnosis: `SELECT p.user_id FROM master_diagnoses g JOIN projects p ON p.id = g.project_id WHERE g.id = ?`,
  diagnosisItem: `SELECT p.user_id FROM master_diagnosis_items i JOIN master_diagnoses g ON g.id = i.diagnosis_id
                JOIN projects p ON p.id = g.project_id WHERE i.id = ?`,
};

function own(kind) {
  return (req, res, next) => {
    Promise.resolve().then(async () => {
      const [[row]] = await pool.query(OWNER_SQL[kind], [req.params.id]);
      if (!row) return res.status(404).json({ ok: false, error: `${kind} not found` });
      if (!isAdmin(req.user) && row.user_id !== req.user.id) {
        return res.status(404).json({ ok: false, error: `${kind} not found` });
      }
      next();
    }).catch(next);
  };
}

module.exports = {
  projectParam,
  ownDocument:      own('document'),
  ownChapter:       own('chapter'),
  ownExport:        own('export'),
  ownThread:        own('thread'),
  ownDiagnosis:     own('diagnosis'),
  ownDiagnosisItem: own('diagnosisItem'),
};
