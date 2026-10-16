/* ═══════════════════════════════════════════════════════════════
   Academia — panel de admin (solo role 'admin'). Vive dentro de
   /academia (academia.html) para no tocar la SPA:
     /academia/admin                      → primer curso
     /academia/admin/<curso>              alumnos del curso
     /academia/admin/<curso>/lecciones    resumen por lección
     /academia/admin/<curso>/alumno/<id>  una persona lección a lección
     /academia/admin/corazones            hojas con más corazones
     /academia/admin/comentarios          dudas y comentarios
   API: /v1/academia/admin/*. Las valoraciones con estrellas NO salen aquí
   (son solo para cada alumno).
   ═══════════════════════════════════════════════════════════════ */

const AcademiaAdmin = (() => {
  let h;   // utilidades de academia.js: esc, ms, go
  const day = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const when = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const yes = (v) => (v === null ? '<span class="aca-na" title="La lección no lo pide">—</span>'
    : v ? '<span class="aca-yes" aria-label="Sí">✓</span>' : '<span class="aca-no" aria-label="No">○</span>');
  const SOURCE = { open: 'Se matriculó', manual: 'Equipo', purchase: 'Compra' };

  function shell(courses, active, sub, body) {
    const { esc } = h;
    const tab = (href, label, on) => `<a class="ac-tab${on ? ' is-on' : ''}" href="${href}" data-nav ${on ? 'aria-current="page"' : ''}>${label}</a>`;
    return `<div class="ac-wrap aca">
      <p class="ac-crumb"><a href="/academia" data-nav>Academia</a> / Administración</p>
      <div class="aca-head"><h1>Panel de la academia</h1>
        ${courses.length > 1 ? `<label class="aca-course">Curso <select id="aca-course">${courses.map(c => `<option value="${esc(c.slug)}"${c.slug === active ? ' selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>` : ''}</div>
      <nav class="ac-tabs aca-tabs" aria-label="Secciones del panel">
        ${tab(`/academia/admin/${esc(active)}`, 'Alumnos', sub === 'alumnos')}
        ${tab(`/academia/admin/${esc(active)}/lecciones`, 'Lecciones', sub === 'lecciones')}
        ${tab('/academia/admin/corazones', 'Corazones', sub === 'corazones')}
        ${tab('/academia/admin/comentarios', 'Comentarios', sub === 'comentarios')}
      </nav>
      <div id="aca-live" class="efs-sr" role="status" aria-live="polite"></div>
      ${body}</div>`;
  }

  async function render(root, parts, helpers) {
    h = helpers;
    document.title = 'Panel de la academia — EU Funding Studio';
    const courses = await API.get('/academia/admin/courses');
    const special = ['corazones', 'comentarios'].includes(parts[0]) ? parts[0] : null;
    const course = special ? (sessionStorage.getItem('aca-course') || courses[0]?.slug) : (parts[0] || courses[0]?.slug);
    if (!course) { root.innerHTML = shell([], '', '', '<p class="ac-note-info">Todavía no hay cursos.</p>'); return; }
    try { sessionStorage.setItem('aca-course', course); } catch { /* sin almacenamiento */ }
    if (special === 'corazones') await viewHearts(root, courses, course);
    else if (special === 'comentarios') await viewComments(root, courses, course);
    else if (parts[1] === 'lecciones') await viewLessons(root, courses, course);
    else if (parts[1] === 'alumno' && parts[2]) await viewStudent(root, courses, course, parts[2]);
    else await viewStudents(root, courses, course);
    const sel = root.querySelector('#aca-course');
    if (sel) sel.addEventListener('change', () => h.go(`/academia/admin/${encodeURIComponent(sel.value)}`));
  }

  const live = (msg) => { const el = document.getElementById('aca-live'); if (el) el.textContent = msg; };

  /* ── Alumnos ── */
  async function viewStudents(root, courses, slug) {
    const { esc } = h;
    const d = await API.get(`/academia/admin/courses/${encodeURIComponent(slug)}/students`);
    const rows = d.students;
    const body = `
      <section class="ac-card aca-tools">
        <form id="aca-enroll" class="aca-enroll" novalidate>
          <label for="aca-email">Matricular a una persona (con su cuenta de Studio)</label>
          <div><input id="aca-email" type="email" autocomplete="off" placeholder="correo@ejemplo.org" required>
            <button class="ac-btn ac-btn--primary" type="submit">Matricular</button></div>
          <p class="ac-note-info" id="aca-enroll-msg" role="status"></p>
        </form>
        <button class="ac-btn ac-btn--ghost" id="aca-csv" type="button">${h.ms('download')} Exportar CSV</button>
      </section>
      <p class="ac-note-info">${rows.length} ${rows.length === 1 ? 'persona matriculada' : 'personas matriculadas'} · acceso ${d.course.access === 'open' ? 'abierto (cualquiera con acceso a la academia se matricula al entrar)' : 'solo con matrícula'}.</p>
      <div class="aca-table-wrap"><table class="aca-table">
        <thead><tr><th>Persona</th><th>Alta</th><th class="ta-r">Lecciones</th><th class="ta-r">Tests</th><th class="ta-r">Intentos</th><th class="ta-r">Nota media</th><th>Última actividad</th><th>Certificado</th><th><span class="efs-sr">Acciones</span></th></tr></thead>
        <tbody>${rows.map(s => {
          const pct = s.total ? Math.round(100 * s.done / s.total) : 0;
          return `<tr>
            <td><a href="/academia/admin/${esc(slug)}/alumno/${esc(s.id)}" data-nav><b>${esc(s.name || '(sin nombre)')}</b></a>${s.staff ? ' <span class="ac-pill">Equipo</span>' : ''}<br><small>${esc(s.email)}</small></td>
            <td class="nw">${day(s.enrolled_at)}<br><small>${esc(SOURCE[s.source] || s.source)}</small></td>
            <td class="ta-r"><span class="aca-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso"><span style="width:${pct}%"></span></span>${s.done}/${s.total}</td>
            <td class="ta-r">${s.tests_passed}/${s.tests_total}</td><td class="ta-r">${s.attempts}</td><td class="ta-r">${s.avg_best ?? '—'}</td>
            <td class="nw">${when(s.last_activity)}</td>
            <td>${s.certificate ? `<a href="/academia/certificado/${esc(s.certificate)}" target="_blank" rel="noopener">${esc(s.certificate)}</a>` : '—'}</td>
            <td><button class="ac-linklike ac-linklike--muted" data-revoke="${esc(s.id)}" data-name="${esc(s.name || s.email)}">Quitar matrícula</button></td></tr>`;
        }).join('') || '<tr><td colspan="9" class="ac-note-info">Nadie matriculado todavía.</td></tr>'}</tbody></table></div>`;
    root.innerHTML = shell(courses, slug, 'alumnos', body);

    root.querySelector('#aca-enroll').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = root.querySelector('#aca-enroll-msg');
      msg.textContent = 'Matriculando…';
      try {
        const r = await API.post(`/academia/admin/courses/${encodeURIComponent(slug)}/enrollments`, { email: root.querySelector('#aca-email').value });
        msg.textContent = r.already ? `${r.user.name || r.user.email} ya estaba matriculada.`
          : `${r.user.name || r.user.email} matriculada. Se le ha enviado el correo de bienvenida al curso.${r.hasArea ? '' : ' Ojo: no tiene acceso a la Academia (fase beta); dáselo en Usuarios y accesos.'}`;
        if (!r.already) setTimeout(() => viewStudents(root, courses, slug).then(() => live(msg.textContent)), 600);
      } catch (e2) { msg.textContent = e2?.message || 'No se pudo matricular'; }
    });
    root.querySelector('#aca-csv').addEventListener('click', () => downloadCsv(slug));
    root.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`¿Quitar la matrícula de ${b.dataset.name}? Su progreso se conserva por si vuelve a matricularse.`)) return;
      try { await API.del(`/academia/admin/courses/${encodeURIComponent(slug)}/enrollments/${encodeURIComponent(b.dataset.revoke)}`); await viewStudents(root, courses, slug); live('Matrícula quitada'); }
      catch (e) { alert(e?.message || 'No se pudo quitar'); }
    }));
  }

  async function downloadCsv(slug) {
    const r = await fetch(`/v1/academia/admin/courses/${encodeURIComponent(slug)}/export.csv`, { headers: { Authorization: `Bearer ${API.getToken()}` }, credentials: 'include' });
    if (!r.ok) { alert('No se pudo exportar'); return; }
    const blob = await r.blob();
    const name = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || `academia-${slug}.csv`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ── Una persona ── */
  async function viewStudent(root, courses, slug, userId) {
    const { esc } = h;
    const d = await API.get(`/academia/admin/courses/${encodeURIComponent(slug)}/students/${encodeURIComponent(userId)}`);
    const done = d.lessons.filter(l => l.completed).length;
    const body = `
      <p><a href="/academia/admin/${esc(slug)}" data-nav>← Todos los alumnos</a></p>
      <section class="ac-card"><h2>${esc(d.user.name || '(sin nombre)')} <small>${esc(d.user.email)}</small></h2>
        <p class="ac-note-info" style="margin:0">${d.user.enrolled_at ? `Matriculada el ${day(d.user.enrolled_at)} (${esc(SOURCE[d.user.source] || d.user.source)})` : 'Sin matrícula en este curso'} · ${done}/${d.lessons.length} lecciones completadas</p></section>
      <div class="aca-table-wrap"><table class="aca-table">
        <thead><tr><th>Lección</th><th class="ta-c">Vídeo</th><th class="ta-c">Lectura</th><th class="ta-c">Test</th><th class="ta-r">Mejor nota</th><th>Intentos</th><th>Estado</th></tr></thead>
        <tbody>${d.lessons.map(l => `<tr>
          <td><b>${esc(l.code)}</b> ${esc(l.title)}</td>
          <td class="ta-c">${yes(l.video)}</td><td class="ta-c">${yes(l.reading)}</td><td class="ta-c">${yes(l.test)}</td>
          <td class="ta-r">${l.best ?? '—'}</td>
          <td>${l.attempts.length ? l.attempts.map(a => `<span class="aca-att ${a.passed ? 'is-ok' : ''}" title="${esc(when(a.date))}">${a.score}</span>`).join(' ') : '—'}</td>
          <td>${l.completed ? (l.legacy ? 'Completada (regla anterior)' : '<b>Completada</b>') : l.started ? 'Empezada' : 'Pendiente'}</td></tr>`).join('')}</tbody></table></div>`;
    root.innerHTML = shell(courses, slug, 'alumnos', body);
  }

  /* ── Lecciones ── */
  async function viewLessons(root, courses, slug) {
    const { esc } = h;
    const d = await API.get(`/academia/admin/courses/${encodeURIComponent(slug)}/lessons`);
    const body = `<p class="ac-note-info">Sobre ${d.students} ${d.students === 1 ? 'persona matriculada' : 'personas matriculadas'}. «Nota media» es la media de la mejor nota de cada persona.</p>
      <div class="aca-table-wrap"><table class="aca-table">
        <thead><tr><th>Lección</th><th class="ta-r">Empezada</th><th class="ta-r">Vídeo visto</th><th class="ta-r">Lectura terminada</th><th class="ta-r">Test aprobado</th><th class="ta-r">Completada</th><th class="ta-r">Intentos</th><th class="ta-r">Suspensos</th><th class="ta-r">Nota media</th></tr></thead>
        <tbody>${d.lessons.map(l => `<tr><td><b>${esc(l.code)}</b> ${esc(l.title)}</td>
          <td class="ta-r">${l.started}</td><td class="ta-r">${l.video}</td><td class="ta-r">${l.reading}</td><td class="ta-r">${l.passed}</td>
          <td class="ta-r"><b>${l.completed}</b></td><td class="ta-r">${l.attempts}</td><td class="ta-r">${l.fails}</td><td class="ta-r">${l.avg_best ?? '—'}</td></tr>`).join('')}</tbody></table></div>`;
    root.innerHTML = shell(courses, slug, 'lecciones', body);
  }

  /* ── Corazones ── */
  async function viewHearts(root, courses, slug) {
    const { esc } = h;
    const d = await API.get('/academia/admin/hearts');
    const body = `<p class="ac-note-info">Las hojas de las lecturas con más corazones. ${d.total} ${d.total === 1 ? 'corazón' : 'corazones'} de ${d.people} ${d.people === 1 ? 'alumno' : 'alumnos'} (no cuenta el equipo).</p>
      ${d.top.length ? `<div class="aca-table-wrap"><table class="aca-table">
        <thead><tr><th class="ta-r">♥</th><th>Hoja</th><th>Lección</th></tr></thead>
        <tbody>${d.top.map(t => `<tr><td class="ta-r"><b>${t.n}</b></td>
          <td><small>${esc(t.heading || '')}</small><br>${esc(t.excerpt || '')}</td>
          <td><a href="/academia/${esc(t.course_slug)}/${esc(t.slug)}" data-nav>${esc(t.code)} · ${esc(t.title)}</a><br><small>${esc(t.course)}</small></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="ac-empty">Todavía nadie ha marcado ninguna hoja.</p>'}`;
    root.innerHTML = shell(courses, slug, 'corazones', body);
  }

  /* ── Comentarios ── */
  async function viewComments(root, courses, slug, filter) {
    const { esc } = h;
    const f = filter || 'open';
    const rows = await API.get(`/academia/admin/comments?filter=${encodeURIComponent(f)}`);
    const FILTERS = { open: 'Abiertos', tutor: 'Para el tutor, sin resolver', resolved: 'Resueltos', hidden: 'Ocultos', withdrawn: 'Retirados', all: 'Todos' };
    const body = `<div class="aca-filter"><label>Mostrar <select id="aca-filter">${Object.entries(FILTERS).map(([k, v]) => `<option value="${k}"${k === f ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <span class="ac-note-info">${rows.length} ${rows.length === 1 ? 'hilo' : 'hilos'}. Para responder, abre la lección: verás el hilo con el resto.</span></div>
      <div class="aca-comments">${rows.map(c => `<article class="ac-msg" data-id="${esc(c.id)}">
          <header><b>${esc(c.author || '(cuenta borrada)')}</b> <small>${esc(c.author_email || '')}</small>
            <small class="ac-msg__tags">${c.kind === 'question' ? 'Pregunta' : 'Comentario'} · ${c.audience === 'tutor' ? 'Para el tutor' : 'Comunidad'} · ${c.visibility === 'private' ? 'Privado' : 'Compartido'}
            ${c.resolved_at ? ' · Resuelto' : ''}${c.status === 'hidden' ? ' · Oculto' : ''}${c.withdrawn_at ? ' · Retirado' : ''}</small></header>
          <p class="ac-msg__body">${esc(c.body)}</p>
          <p class="ac-note-info" style="margin:6px 0 0"><a href="/academia/${esc(c.course_slug)}/${esc(c.lesson_slug)}#ac-discussion">${esc(c.code)} · ${esc(c.lesson)}</a> · ${esc(when(c.created_at))} ·
            ${c.replies} ${c.replies === 1 ? 'respuesta' : 'respuestas'}${c.staff_replies ? ' (con respuesta del equipo)' : ''} · ${c.likes} me gusta</p>
          <div class="ac-msg__actions">
            ${c.resolved_at ? `<button class="ac-linklike" data-act="reopen">Reabrir</button>` : `<button class="ac-linklike" data-act="resolve">Marcar resuelto</button>`}
            ${c.status === 'hidden' ? `<button class="ac-linklike" data-act="show">Volver a mostrar</button>` : `<button class="ac-linklike" data-act="hide">Ocultar</button>`}
            <button class="ac-linklike ac-linklike--muted" data-act="delete">Borrar</button>
          </div></article>`).join('') || '<p class="ac-empty">No hay mensajes con este filtro.</p>'}</div>`;
    root.innerHTML = shell(courses, slug, 'comentarios', body);
    root.querySelector('#aca-filter').addEventListener('change', (e) => viewComments(root, courses, slug, e.target.value));
    root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id, act = b.dataset.act;
      try {
        if (act === 'delete') {
          if (!confirm('¿Borrar el hilo y sus respuestas? No se puede deshacer. Si solo quieres que no se vea, usa «Ocultar».')) return;
          await API.del(`/academia/admin/comments/${encodeURIComponent(id)}`);
        } else await API.post(`/academia/admin/comments/${encodeURIComponent(id)}`, { action: act });
        await viewComments(root, courses, slug, f);
        live('Hecho');
      } catch (e) { alert(e?.message || 'No se pudo'); }
    }));
  }

  return { render };
})();
