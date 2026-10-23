/* ═══════════════════════════════════════════════════════════════
   RGPD — «Descargar mis datos» y «Eliminar mi cuenta» (Mi cuenta › Tus datos)
   ─────────────────────────────────────────────────────────────
   Inventario de tablas con datos de una persona (migraciones + BD, 23-oct-2026).
   Tolerante: una tabla o columna que aún no exista (BD sin migrar, módulos de
   otras ramas como community_*) se salta sin error.

   Al eliminar (todo en una transacción; los ficheros se borran al confirmar):
   - Lo suyo se BORRA: proyectos y todo lo que cuelga de ellos, presupuestos,
     formularios, visiones, listas de entidades, documentos privados y de sus
     proyectos (con sus ficheros), fuentes privadas, entrevistas, chats de IA,
     academia (matrícula, intentos, notas, certificados, eventos), analítica
     (events), suscripción al boletín, sesiones, foto de perfil.
   - Lo que es de otros y solo le referencia se ANONIMIZA o se LIBERA:
     audit_log (sin actor/IP/navegador), ai_usage_log (sin usuario, para el
     coste), fuentes públicas de investigación (sin added_by), comentarios de
     la academia con respuestas de otras personas (quedan sin autor),
     entidades reclamadas (sin dueño, sin sello, sin documentos de reclamación),
     columnas de «quién lo revisó» (resolved_by, granted_by, verified_by…).
   - Las entidades que creó y no usa nadie más (ni otras personas en sus
     proyectos, ni enlazadas, ni del directorio) se borran enteras.
   Un admin no puede eliminarse (debe quitarse antes el rol).
   ═══════════════════════════════════════════════════════════════ */
const fsp  = require('fs/promises');
const path = require('path');
const db   = require('../../utils/db');
const storage = require('../../utils/private-storage');

const SKIP = new Set(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR']);
const PUBLIC_UPLOADS = path.join(__dirname, '../../../../public/uploads');

/* Consulta tolerante: null si la tabla/columna no existe. */
async function q(conn, sql, params = []) {
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } catch (e) {
    if (SKIP.has(e.code)) return null;
    throw e;
  }
}
/* Lista de ids (o [] si la tabla no existe). */
async function ids(conn, sql, params, col = 'id') {
  const rows = await q(conn, sql, params);
  return rows ? rows.map(r => r[col]).filter(v => v !== null && v !== undefined) : [];
}
// Lista vacía → IN (NULL): no casa con nada y no fuerza conversiones de tipo
// (con modo estricto, «id IN ('-')» sobre una columna INT falla en DELETE/UPDATE).
const IN = (arr) => (arr && arr.length ? arr : [null]);
const omit = (rows, cols) => rows && rows.map(r => { const o = { ...r }; cols.forEach(c => delete o[c]); return o; });

/* Ids de todo lo que cuelga de la persona (comunes a exportar y eliminar). */
async function collect(conn, userId) {
  const S = {};
  S.projects  = await ids(conn, 'SELECT id FROM projects WHERE user_id = ?', [userId]);
  const P = IN(S.projects);
  S.wps       = await ids(conn, 'SELECT id FROM work_packages WHERE project_id IN (?)', [P]);
  S.activities = S.wps.length ? await ids(conn, 'SELECT id FROM activities WHERE wp_id IN (?)', [S.wps]) : [];
  S.partners  = await ids(conn, 'SELECT id FROM partners WHERE project_id IN (?)', [P]);
  S.wpTasks   = await ids(conn, 'SELECT id FROM wp_tasks WHERE project_id IN (?)', [P]);
  S.deliverables = await ids(conn, 'SELECT id FROM deliverables WHERE project_id IN (?)', [P]);
  S.threads   = await ids(conn, 'SELECT id FROM chat_threads WHERE project_id IN (?) OR user_id = ?', [P, userId]);
  S.runs      = await ids(conn, 'SELECT id FROM diagnosis_runs WHERE project_id IN (?)', [P]);
  S.budgets   = await ids(conn, 'SELECT id FROM budget_projects WHERE user_id = ? OR project_id IN (?)', [userId, P]);
  S.forms     = await ids(conn, 'SELECT id FROM form_instances WHERE user_id = ? OR project_id IN (?)', [userId, P]);
  S.visions   = await ids(conn, 'SELECT id FROM visions WHERE user_id = ?', [userId]);
  S.shortlists = await ids(conn, 'SELECT id FROM entity_shortlists WHERE user_id = ?', [userId]);
  S.docs      = await ids(conn,
    "SELECT id FROM documents WHERE (owner_type = 'user_private' AND owner_id = ?) OR (owner_type = 'project' AND owner_id IN (?))",
    [userId, P]);
  S.orgs      = (await q(conn,
    `SELECT id, oid, owner_user_id, claimed_by_user_id, logo_url FROM organizations
      WHERE owner_user_id = ? OR claimed_by_user_id = ?`, [userId, userId])) || [];
  return S;
}


/* ══ Descargar mis datos ══════════════════════════════════════════ */
async function exportData(userId) {
  const conn = db;
  const S = await collect(conn, userId);
  const D = {};
  const add = async (key, sql, params, drop = []) => {
    const rows = await q(conn, sql, params);
    if (rows) D[key] = omit(rows, drop);
  };
  const P = IN(S.projects);

  // Cuenta
  await add('cuenta', `SELECT id, email, name, role, subscription, email_verified, avatar_url, organization_id,
                              privacy_accepted_at, created_at, updated_at,
                              (password_hash IS NOT NULL AND password_hash <> '') AS tiene_contrasena
                         FROM users WHERE id = ?`, [userId]);
  await add('sesiones', `SELECT created_at, last_used_at, expires_at, revoked_at, revoked_reason, user_agent, ip
                           FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
  await add('areas_beta', 'SELECT area, granted_at, seen_at FROM user_areas WHERE user_id = ?', [userId]);
  await add('solicitudes_de_acceso', 'SELECT id, area, message, status, created_at, resolved_at FROM access_requests WHERE user_id = ?', [userId]);
  await add('boletin', 'SELECT email, source, tag, unsubscribed, consent_ip, created_at, updated_at FROM newsletter_subscribers WHERE user_id = ? OR email = (SELECT email FROM users WHERE id = ?)', [userId, userId]);
  await add('registro_de_actividad', `SELECT ts, action, target_type, ip, user_agent FROM audit_log
                                        WHERE actor_user_id = ? ORDER BY ts DESC LIMIT 5000`, [userId]);
  await add('analitica_de_uso', 'SELECT ts, name, route, ref_id, programme, seconds, props FROM events WHERE user_id = ? ORDER BY ts DESC LIMIT 20000', [userId]);
  await add('uso_de_ia', 'SELECT created_at, endpoint, provider, model, tokens_in, tokens_out, status, project_id FROM ai_usage_log WHERE user_id = ?', [userId]);

  // Proyectos y todo lo que cuelga de ellos
  const PR = {};
  const addP = async (key, sql, params, drop = []) => {
    const rows = await q(conn, sql, params);
    if (rows) PR[key] = omit(rows, drop);
  };
  await addP('projects', 'SELECT * FROM projects WHERE user_id = ?', [userId]);
  for (const t of ['partners', 'work_packages', 'wp_tasks', 'deliverables', 'milestones', 'project_risks', 'project_facts',
    'routes', 'extra_destinations', 'intake_contexts', 'proposal_versions', 'improvement_actions', 'diagnosis_runs',
    'project_partner_pifs', 'project_extra_staff', 'project_partner_eu_projects', 'project_partner_staff',
    'project_tasks', 'project_sources', 'project_documents', 'prep_field_chats', 'writer_research_docs', 'dms_snapshots', 'dms_comments']) {
    await addP(t, `SELECT * FROM ${t} WHERE project_id IN (?)`, [P]);
  }
  await addP('activities', 'SELECT * FROM activities WHERE wp_id IN (?)', [IN(S.wps)]);
  for (const t of ['activity_campaigns', 'activity_generic_costs', 'activity_intellectual_outputs', 'activity_local_workshops',
    'activity_management', 'activity_management_partners', 'activity_management_staff', 'activity_mobility',
    'activity_mobility_participants', 'activity_multiplier_events']) {
    await addP(t, `SELECT * FROM ${t} WHERE activity_id IN (?)`, [IN(S.activities)]);
  }
  await addP('partner_rates', 'SELECT * FROM partner_rates WHERE partner_id IN (?)', [IN(S.partners)]);
  await addP('worker_rates', 'SELECT * FROM worker_rates WHERE partner_id IN (?)', [IN(S.partners)]);
  await addP('wp_task_participants', 'SELECT * FROM wp_task_participants WHERE task_id IN (?)', [IN(S.wpTasks)]);
  await addP('deliverable_tasks', 'SELECT * FROM deliverable_tasks WHERE deliverable_id IN (?)', [IN(S.deliverables)]);
  await addP('diagnosis_findings', 'SELECT * FROM diagnosis_findings WHERE run_id IN (?)', [IN(S.runs)]);
  await addP('chat_threads', 'SELECT * FROM chat_threads WHERE id IN (?)', [IN(S.threads)]);
  await addP('chat_messages', 'SELECT * FROM chat_messages WHERE thread_id IN (?)', [IN(S.threads)]);
  await addP('intake_interviews', 'SELECT * FROM intake_interviews WHERE user_id = ? OR project_id IN (?)', [userId, P]);
  await addP('writer_interviews', 'SELECT * FROM writer_interviews WHERE user_id = ? OR project_id IN (?)', [userId, P]);
  await addP('ai_generations', 'SELECT * FROM ai_generations WHERE user_id = ? OR project_id IN (?)', [userId, P], ['system_prompt']);
  D.proyectos = PR;

  // Presupuestos y formularios (evaluador)
  await add('presupuestos', 'SELECT * FROM budget_projects WHERE id IN (?)', [IN(S.budgets)]);
  await add('presupuestos_socios', 'SELECT * FROM budget_beneficiaries WHERE budget_id IN (?)', [IN(S.budgets)]);
  await add('presupuestos_paquetes', 'SELECT * FROM budget_work_packages WHERE budget_id IN (?)', [IN(S.budgets)]);
  await add('presupuestos_costes', 'SELECT * FROM budget_costs WHERE budget_id IN (?)', [IN(S.budgets)]);
  await add('formularios', 'SELECT * FROM form_instances WHERE id IN (?)', [IN(S.forms)]);
  await add('formularios_respuestas', 'SELECT * FROM form_field_values WHERE instance_id IN (?)', [IN(S.forms)]);
  await add('formularios_lectura_ia', 'SELECT id, instance_id, status, error_message, created_at, updated_at FROM ai_parse_jobs WHERE user_id = ?', [userId]);

  // Visiones, listas de entidades
  await add('visiones', 'SELECT * FROM visions WHERE user_id = ?', [userId]);
  await add('visiones_referencias', 'SELECT * FROM vision_references WHERE vision_id IN (?)', [IN(S.visions)]);
  await add('visiones_interes', 'SELECT * FROM vision_interests WHERE user_id = ?', [userId]);
  await add('listas_de_entidades', 'SELECT * FROM entity_shortlists WHERE user_id = ?', [userId]);
  await add('listas_de_entidades_elementos', 'SELECT * FROM entity_shortlist_items WHERE shortlist_id IN (?)', [IN(S.shortlists)]);

  // Documentos (metadatos; los ficheros se listan, no se incluyen)
  await add('documentos', `SELECT id, owner_type, owner_id, doc_type, title, description, file_type, file_size_bytes,
                                  storage_path, tags, status, created_at, updated_at
                             FROM documents WHERE id IN (?)`, [IN(S.docs)]);
  await add('fuentes_de_investigacion', 'SELECT * FROM research_sources WHERE added_by = ?', [userId], ['full_text']);

  // Entidades (las que creó o reclamó) y su documentación
  const O = IN(S.orgs.map(o => o.id));
  await add('entidades', 'SELECT * FROM organizations WHERE id IN (?)', [O]);
  await add('entidades_enlazadas', 'SELECT organization_id, role, created_at FROM user_organizations WHERE user_id = ?', [userId]);
  for (const t of ['org_accreditations', 'org_associated_partners', 'org_eu_projects', 'org_key_staff', 'org_pif_variants', 'org_stakeholders']) {
    await add('entidades_' + t.replace(/^org_/, ''), `SELECT * FROM ${t} WHERE organization_id IN (?)`, [O]);
  }
  await add('entidades_documentos_reclamacion', `SELECT id, organization_id, doc_type, original_name, mime, size_bytes, created_at
                                                   FROM org_claim_documents WHERE user_id = ? OR organization_id IN (?)`, [userId, O]);
  await add('entidades_conflictos', `SELECT id, organization_id, message, status, created_at, resolved_at
                                       FROM org_claim_disputes WHERE claimant_user_id = ?`, [userId]);

  // Academia
  for (const t of ['academia_enrollments', 'academia_attempts', 'academia_notes', 'academia_hearts', 'academia_comment_likes',
    'academia_comments', 'academia_certificates', 'academia_events']) {
    await add(t, `SELECT * FROM ${t} WHERE user_id = ?`, [userId]);
  }

  // Comunidad (si existe en esta instalación)
  for (const [t, col] of [['community_profiles', 'user_id'], ['community_posts', 'user_id'], ['community_hearts', 'user_id'],
    ['community_group_members', 'user_id'], ['community_reports', 'reporter_id'], ['community_messages', 'sender_id']]) {
    await add(t, `SELECT * FROM ${t} WHERE ${col} = ?`, [userId]);
  }
  await add('community_connections', 'SELECT * FROM community_connections WHERE requester_id = ? OR addressee_id = ?', [userId, userId]);

  // Ficheros guardados (solo la lista)
  const files = [];
  const [[u]] = await db.query('SELECT avatar_url FROM users WHERE id = ?', [userId]);
  if (u && u.avatar_url) files.push({ tipo: 'foto de perfil', ruta: u.avatar_url });
  (D.documentos || []).forEach(d => d.storage_path && files.push({ tipo: 'documento', nombre: d.title, ruta: d.storage_path }));
  (D.fuentes_de_investigacion || []).forEach(r => r.file_path && files.push({ tipo: 'fuente de investigación', nombre: r.title, ruta: r.file_path }));
  S.orgs.forEach(o => o.logo_url && /^\/uploads\/logos\//.test(o.logo_url) && files.push({ tipo: 'logo de entidad', ruta: o.logo_url }));
  (D.entidades_documentos_reclamacion || []).forEach(d => files.push({ tipo: 'documento de reclamación', nombre: d.original_name }));

  return {
    formato: 'EU Funding Studio · copia de tus datos personales',
    generado: new Date().toISOString(),
    notas: [
      'Incluye tu cuenta, tus proyectos y todo lo que cuelga de ellos, presupuestos, visiones, documentos, entidades, academia y actividad.',
      'Los ficheros (documentos, fotos, logos) se listan en «ficheros»; puedes descargarlos desde la aplicación.',
      'No se incluyen contraseñas ni enlaces de acceso.',
    ],
    ficheros: files,
    datos: D,
  };
}

/* ══ Eliminar mi cuenta ═══════════════════════════════════════════ */
/* Devuelve { deleted: true, counts } o lanza { status, code, message }. */
async function deleteAccount(userId) {
  const conn = await db.getConnection();
  const counts = {};
  const filesToRemove = { stored: [], public: [], claim: [] };
  const run = async (key, sql, params) => {
    try {
      const [r] = await conn.query(sql, params);
      if (r.affectedRows) counts[key] = (counts[key] || 0) + r.affectedRows;
    } catch (e) {
      if (!SKIP.has(e.code)) throw e;
    }
  };
  let user;
  try {
    await conn.beginTransaction();
    [[user]] = await conn.query('SELECT id, email, name, role, avatar_url, ui_lang FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!user) throw Object.assign(new Error('Cuenta no encontrada'), { status: 404, code: 'NOT_FOUND' });
    if (user.role === 'admin') {
      throw Object.assign(new Error('Una cuenta de administración no se puede eliminar desde aquí. Pide antes a otra persona administradora que te quite el rol.'),
        { status: 403, code: 'ADMIN_CANNOT_DELETE' });
    }

    const S = await collect(conn, userId);
    const P = IN(S.projects);
    const DOCS = IN(S.docs);

    // ── Ficheros que se borrarán al confirmar ──
    const docRows = (await q(conn, 'SELECT storage_path FROM documents WHERE id IN (?)', [DOCS])) || [];
    docRows.forEach(d => d.storage_path && filesToRemove.stored.push(d.storage_path));
    const jobRows = (await q(conn, 'SELECT document_path FROM ai_parse_jobs WHERE user_id = ?', [userId])) || [];
    jobRows.forEach(j => j.document_path && filesToRemove.stored.push(j.document_path));
    const privSources = (await q(conn, "SELECT id, file_path FROM research_sources WHERE added_by = ? AND visibility = 'private'", [userId])) || [];
    privSources.forEach(r => r.file_path && filesToRemove.stored.push(r.file_path));
    if (user.avatar_url && /^\/uploads\/avatars\//.test(user.avatar_url)) filesToRemove.public.push(user.avatar_url);

    // ── Documentos (privados y de sus proyectos) ──
    await run('document_chunks', 'DELETE FROM document_chunks WHERE document_id IN (?)', [DOCS.map(v => (v === null ? null : String(v)))]);
    await run('document_programs', 'DELETE FROM document_programs WHERE document_id IN (?)', [DOCS]);
    await run('project_documents', 'DELETE FROM project_documents WHERE project_id IN (?) OR document_id IN (?)', [P, DOCS]);
    await run('writer_research_docs', 'DELETE FROM writer_research_docs WHERE project_id IN (?)', [P]);
    await run('documents', 'DELETE FROM documents WHERE id IN (?)', [DOCS]);

    // ── Hijos de sus proyectos sin clave foránea ──
    for (const t of ['ai_generations', 'dms_comments', 'dms_snapshots', 'intake_interviews', 'prep_field_chats',
      'project_extra_staff', 'project_partner_eu_projects', 'project_partner_staff', 'project_sources', 'project_tasks',
      'writer_interviews']) {
      await run(t, `DELETE FROM ${t} WHERE project_id IN (?)`, [P]);
    }
    // ── Lo suyo por usuario ──
    await run('ai_generations', 'DELETE FROM ai_generations WHERE user_id = ?', [userId]);
    await run('ai_parse_jobs', 'DELETE FROM ai_parse_jobs WHERE user_id = ?', [userId]);
    await run('intake_interviews', 'DELETE FROM intake_interviews WHERE user_id = ?', [userId]);
    await run('writer_interviews', 'DELETE FROM writer_interviews WHERE user_id = ?', [userId]);
    await run('dms_comments', 'DELETE FROM dms_comments WHERE author_id = ?', [userId]);
    await run('dms_snapshots', 'DELETE FROM dms_snapshots WHERE user_id = ?', [userId]);
    await run('budget_projects', 'DELETE FROM budget_projects WHERE id IN (?)', [IN(S.budgets)]);   // hijos en cascada
    await run('form_instances', 'DELETE FROM form_instances WHERE id IN (?)', [IN(S.forms)]);       // respuestas en cascada
    await run('entity_shortlists', 'DELETE FROM entity_shortlists WHERE user_id = ?', [userId]);   // elementos en cascada
    await run('events', 'DELETE FROM events WHERE user_id = ?', [userId]);
    await run('newsletter_subscribers', 'DELETE FROM newsletter_subscribers WHERE user_id = ? OR email = ?', [userId, user.email]);
    await run('ai_usage_log (anonimizado)', 'UPDATE ai_usage_log SET user_id = NULL, project_id = NULL WHERE user_id = ? OR project_id IN (?)', [userId, P]);

    // Fuentes de investigación: las privadas se borran; las públicas quedan sin autor.
    if (privSources.length) {
      const ps = privSources.map(r => r.id);
      await run('project_sources', 'DELETE FROM project_sources WHERE source_id IN (?)', [ps]);
      await run('research_sources', 'DELETE FROM research_sources WHERE id IN (?)', [ps]);
    }
    await run('research_sources (anonimizado)', 'UPDATE research_sources SET added_by = NULL WHERE added_by = ?', [userId]);

    // Academia: certificados y eventos se borran (su FK los dejaría con nombre y sin dueño).
    await run('academia_certificates', 'DELETE FROM academia_certificates WHERE user_id = ?', [userId]);
    await run('academia_events', 'DELETE FROM academia_events WHERE user_id = ?', [userId]);
    // Comentarios: se borran los suyos salvo los que tienen respuestas de otras
    // personas (borrarlos borraría esas respuestas): esos quedan sin autor (FK).
    const myComments = await ids(conn, 'SELECT id FROM academia_comments WHERE user_id = ?', [userId]);
    if (myComments.length) {
      const keep = new Set(await ids(conn,
        'SELECT DISTINCT parent_id FROM academia_comments WHERE parent_id IN (?) AND (user_id IS NULL OR user_id <> ?)',
        [myComments, userId], 'parent_id'));
      const del = myComments.filter(id => !keep.has(id));
      if (del.length) await run('academia_comments', 'DELETE FROM academia_comments WHERE id IN (?)', [del]);
      if (keep.size) await run('academia_comments (anonimizado)', 'UPDATE academia_comments SET user_id = NULL WHERE id IN (?)', [[...keep]]);
    }

    // ── Entidades ──
    await claimDocsFiles(conn, 'SELECT stored_name FROM org_claim_documents WHERE user_id = ?', [userId], filesToRemove);
    await run('org_claim_documents', 'DELETE FROM org_claim_documents WHERE user_id = ?', [userId]);
    await run('org_claim_disputes', 'DELETE FROM org_claim_disputes WHERE claimant_user_id = ?', [userId]);
    await run('org_claim_disputes (sin dueño)', 'UPDATE org_claim_disputes SET owner_user_id = NULL WHERE owner_user_id = ?', [userId]);
    for (const o of S.orgs) {
      const [[{ n: linkedUo }]] = await conn.query(
        'SELECT COUNT(*) AS n FROM user_organizations WHERE organization_id = ? AND user_id <> ?', [o.id, userId]);
      const [[{ n: linkedU }]] = await conn.query(
        'SELECT COUNT(*) AS n FROM users WHERE organization_id = ? AND id <> ?', [o.id, userId]);
      const linked = linkedUo + linkedU;
      const [[{ n: usedByOthers }]] = await conn.query(
        `SELECT COUNT(*) AS n FROM partners p JOIN projects pr ON pr.id = p.project_id
          WHERE p.organization_id = ? AND pr.user_id <> ?`, [o.id, userId]);
      const inCommunity = ((await q(conn, 'SELECT 1 FROM community_profiles WHERE organization_id = ? AND user_id <> ? LIMIT 1', [o.id, userId])) || []).length;
      const claimedByOther = o.claimed_by_user_id && o.claimed_by_user_id !== userId;
      const fromDirectory = o.oid && !String(o.oid).startsWith('local-');
      const ownLogo = o.logo_url && /^\/uploads\/logos\//.test(o.logo_url);

      await claimDocsFiles(conn, 'SELECT stored_name FROM org_claim_documents WHERE organization_id = ?', [o.id], filesToRemove);
      if (!linked && !usedByOthers && !inCommunity && !claimedByOther && !fromDirectory) {
        // Entidad creada por la persona y que no usa nadie más: se borra entera.
        await run('org_claim_documents', 'DELETE FROM org_claim_documents WHERE organization_id = ?', [o.id]);
        await run('org_claim_disputes', 'DELETE FROM org_claim_disputes WHERE organization_id = ?', [o.id]);
        await run('organizations', 'DELETE FROM organizations WHERE id = ?', [o.id]);   // hijos org_* en cascada
        if (ownLogo) filesToRemove.public.push(o.logo_url);
        continue;
      }
      // Se libera: sin dueño, sin sello y sin documentos de reclamación.
      if (o.claimed_by_user_id === userId) {
        await run('org_claim_documents', 'DELETE FROM org_claim_documents WHERE organization_id = ?', [o.id]);
        await run('organizations (liberada)',
          `UPDATE organizations SET claimed_at = NULL, verified_at = NULL, verified_by = NULL, verification_status = NULL,
                  verification_reviewed_at = NULL, verification_note = NULL, claimed_by_user_id = NULL
            WHERE id = ? AND claimed_by_user_id = ?`, [o.id, userId]);
      }
      await run('organizations (sin creador)', 'UPDATE organizations SET owner_user_id = NULL WHERE id = ? AND owner_user_id = ?', [o.id, userId]);
      // Si nadie más está enlazado: fuera su logo subido y los datos de personas de contacto.
      if (!linked) {
        await run('organizations (sin datos de contacto)',
          `UPDATE organizations SET legal_rep_first_name = NULL, legal_rep_family_name = NULL, legal_rep_email = NULL,
                  legal_rep_telephone1 = NULL, legal_rep_telephone2 = NULL, cp_first_name = NULL, cp_family_name = NULL,
                  cp_email = NULL, cp_telephone1 = NULL, cp_telephone2 = NULL
                  ${ownLogo ? ', logo_url = NULL' : ''}
            WHERE id = ?`, [o.id]);
        if (ownLogo) filesToRemove.public.push(o.logo_url);
      }
    }
    await run('user_organizations', 'DELETE FROM user_organizations WHERE user_id = ?', [userId]);

    // ── Referencias de «quién lo hizo» en datos de otros: a NULL ──
    for (const [t, col] of [['access_requests', 'resolved_by'], ['user_areas', 'granted_by'], ['organizations', 'verified_by'],
      ['evaluation_letters', 'uploaded_by_user_id'], ['prompt_blocks', 'updated_by'], ['eval_criteria_rubric', 'edited_by'],
      ['project_facts', 'validated_by'], ['proposal_versions', 'created_by_user_id'], ['improvement_actions', 'created_by_user_id'],
      ['project_documents', 'added_by'], ['community_groups', 'created_by'], ['community_reports', 'resolved_by']]) {
      await run(`${t}.${col} (anonimizado)`, `UPDATE ${t} SET ${col} = NULL WHERE ${col} = ?`, [userId]);
    }

    // ── Registro de auditoría: sin actor, IP ni navegador ──
    await run('audit_log (anonimizado)',
      'UPDATE audit_log SET actor_user_id = NULL, actor_email_masked = NULL, ip = NULL, user_agent = NULL WHERE actor_user_id = ?', [userId]);
    await run('audit_log (anonimizado)',
      "UPDATE audit_log SET target_id = NULL WHERE target_type = 'user' AND target_id = ?", [userId]);

    // ── Proyectos (todo lo que cuelga, en cascada) y la cuenta ──
    // users en cascada: sesiones, áreas, solicitudes, visiones, academia, comunidad, tokens.
    await run('projects', 'DELETE FROM projects WHERE user_id = ?', [userId]);
    await run('users', 'DELETE FROM users WHERE id = ?', [userId]);

    // Constancia sin datos personales: solo qué tipo de cosas y cuántas.
    await conn.query(
      `INSERT INTO audit_log (actor_user_id, actor_email_masked, action, target_type, target_id, ip, user_agent, meta)
       VALUES (NULL, NULL, 'account.delete', 'user', NULL, NULL, NULL, ?)`,
      [JSON.stringify({ role: user.role, counts })]
    );
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch { /* ya cerrada */ }
    throw e;
  } finally {
    conn.release();
  }

  // Ficheros: solo tras confirmar (si algo falla antes, no se pierde nada).
  for (const p of filesToRemove.stored) await storage.removeStored(p).catch(() => {});
  for (const p of filesToRemove.public) {
    const m = /^\/uploads\/(avatars|logos)\/([A-Za-z0-9._-]+)$/.exec(p);
    if (m) await fsp.unlink(path.join(PUBLIC_UPLOADS, m[1], m[2])).catch(() => {});
  }
  const { claimDocPath } = require('../organizations/model');
  for (const name of filesToRemove.claim) {
    const f = claimDocPath(name);
    if (f) await fsp.unlink(f).catch(() => {});
  }
  return { deleted: true, user: { email: user.email, name: user.name }, counts };
}

async function claimDocsFiles(conn, sql, params, filesToRemove) {
  const rows = (await q(conn, sql, params)) || [];
  rows.forEach(r => r.stored_name && filesToRemove.claim.push(r.stored_name));
}

module.exports = { exportData, deleteAccount };
