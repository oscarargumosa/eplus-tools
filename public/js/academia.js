/* ═══════════════════════════════════════════════════════════════
   Academia — cliente. Rutas (history API):
     /academia                      catálogo
     /academia/<curso>              ficha del curso (si ya está matriculado, salta a su lección)
     /academia/<curso>/<lección>    aula: vídeo, lectura por hojas, test, notas
   El servidor (/v1/academia) es quien decide: tiempos de lectura, vídeo visto,
   apertura del test y certificado. Aquí solo se pinta y se le avisa.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const root = document.getElementById('ac-root');
  const SLIDE_MS = 7000;
  let user = null;
  let cleanup = [];          // timers y listeners de la vista actual

  /* ── utilidades ─────────────────────────────────────────────── */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ms = (name) => `<span class="ms" aria-hidden="true">${name}</span>`;
  const dot = (state) => `<span class="ac-dot ac-dot--${state}" aria-hidden="true"></span>`;
  const stateLabel = { done: 'completada', in_progress: 'empezada', pending: 'pendiente' };
  const $ = (sel, el = root) => el.querySelector(sel);
  const go = (path) => { history.pushState({}, '', path); render(); window.scrollTo(0, 0); };
  const later = (fn, t) => { const id = setTimeout(fn, t); cleanup.push(() => clearTimeout(id)); return id; };
  const errMsg = (e) => esc(e?.message || 'Algo ha fallado. Vuelve a intentarlo.');
  const fmtWait = (t) => {
    const s = Math.max(1, Math.ceil(t / 1000));
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
    return `${Math.floor(s / 3600)} h ${Math.ceil((s % 3600) / 60)} min`;
  };

  /* Certificado: la persona confirma su nombre completo antes de emitirlo. */
  function certFormHtml(name) {
    return `<form class="ac-cert ac-cert--form" id="ac-cert-form" novalidate>${ms('workspace_premium')}<div style="flex:1">
      <b>Has completado el curso.</b> Confirma tu nombre completo tal como quieres que aparezca en el certificado.
      Después no se podrá cambiar.
      <label for="ac-cert-name" style="display:block;margin-top:10px">Nombre y apellidos</label>
      <input id="ac-cert-name" type="text" autocomplete="name" maxlength="150" required value="${esc(name || '')}" style="width:100%;max-width:420px;margin-top:6px">
      <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-weight:400">
        <input type="checkbox" id="ac-cert-ok"> El nombre es correcto</label>
      <div id="ac-cert-err" class="ac-err" style="display:none;margin-top:10px"></div>
      <button class="ac-btn ac-btn--primary" type="submit" style="margin-top:12px">Emitir mi certificado</button></div></form>`;
  }
  function wireCertForm(courseSlug) {
    const f = $('#ac-cert-form');
    if (!f) return;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#ac-cert-err');
      err.style.display = 'none';
      try {
        const r = await API.post(`/academia/courses/${encodeURIComponent(courseSlug)}/certificate`,
          { fullName: $('#ac-cert-name').value, confirm: $('#ac-cert-ok').checked });
        f.outerHTML = `<div class="ac-cert">${ms('workspace_premium')}<div><b>Certificado emitido.</b><br>
          <a href="/academia/certificado/${esc(r.serial)}" target="_blank" rel="noopener">Ver tu certificado (${esc(r.serial)})</a></div></div>`;
      } catch (e2) {
        err.textContent = e2?.message || 'No se pudo emitir el certificado';
        err.style.display = '';
      }
    });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-nav]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', render);

  /* ── sesión ─────────────────────────────────────────────────── */
  async function restoreSession() {
    try {
      if (await API.tryRefresh()) {
        user = await API.get('/auth/me');
        API.startAutoRefresh();
      }
    } catch { user = null; }
    // Fase beta: áreas del usuario (etiquetas del menú y pantalla «Solicitar acceso»).
    if (user && typeof BetaAccess !== 'undefined') { BetaAccess.setUser(user); BetaAccess.showGranted(); }
    const back = document.getElementById('topbar-cta-back');
    const acct = document.getElementById('topbar-cta-account');
    if (user && acct) {
      back.style.display = 'none';
      acct.style.display = '';
      document.getElementById('topbar-user-name').textContent = (user.name || user.email || '').split(' ')[0];
      if (window.EfsAvatar) EfsAvatar.paintAll(user);   // foto → logo de su entidad → iniciales
    }
  }

  function loginBox(msg) {
    return `<div class="ac-card ac-login">
      <h2>Entra para empezar</h2>
      <p class="ac-note-info">${esc(msg || 'Usa tu cuenta de EU Funding Studio. Tu progreso se guarda en ella.')}</p>
      <form id="ac-login-form" novalidate>
        <label for="ac-email">Correo electrónico</label>
        <input id="ac-email" type="email" autocomplete="email" required>
        <label for="ac-pass">Contraseña</label>
        <input id="ac-pass" type="password" autocomplete="current-password" required>
        <div id="ac-login-err" class="ac-err" style="display:none;margin-top:12px"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
          <button class="ac-btn ac-btn--primary" type="submit">Entrar</button>
          <a class="ac-btn ac-btn--ghost" href="/">Entrar con Google en Studio</a>
        </div>
      </form>
    </div>`;
  }

  function wireLogin() {
    const f = $('#ac-login-form');
    if (!f) return;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#ac-login-err');
      err.style.display = 'none';
      try {
        const data = await API.post('/auth/login', { email: $('#ac-email').value, password: $('#ac-pass').value }, { noAuth: true });
        API.setToken(data.access_token);
        API.startAutoRefresh();
        user = data.user;
        await restoreSession();
        render();
      } catch (e2) {
        err.textContent = e2?.message || 'No se pudo iniciar sesión';
        err.style.display = '';
      }
    });
  }

  /* ── router ─────────────────────────────────────────────────── */
  async function render() {
    cleanup.forEach(fn => fn()); cleanup = [];
    const parts = location.pathname.replace(/\/+$/, '').split('/').slice(2).map(decodeURIComponent);
    // Fase beta: sin el área «academia», pantalla «Solicitar acceso» (no se piden datos).
    if (user && typeof BetaAccess !== 'undefined' && !BetaAccess.has('academia')) {
      BetaAccess.renderInto(root, 'academia');
      return;
    }
    try {
      // Panel de admin de la academia (solo role admin): public/js/admin-academia.js
      if (parts[0] === 'admin' && typeof AcademiaAdmin !== 'undefined') {
        if (!user) throw { code: 'UNAUTHORIZED' };
        if (user.role !== 'admin') throw { message: 'Esta página es solo para administración.' };
        await AcademiaAdmin.render(root, parts.slice(1), { esc, ms, go });
        return;
      }
      if (!parts.length) await viewCatalog();
      else if (parts.length === 1) await viewCourse(parts[0]);
      else await viewLesson(parts[0], parts[1]);
    } catch (e) {
      if (e?.code === 'AREA_REQUIRED' && typeof BetaAccess !== 'undefined') {
        BetaAccess.renderInto(root, e.area || 'academia');
        return;
      }
      if (e?.code === 'UNAUTHORIZED' && !user) {
        // Sin sesión la academia no se ve (acceso cerrado a invitados): a entrar y volver aquí.
        location.replace('/entrar?volver=' + encodeURIComponent(location.pathname));
        return;
      }
      if (e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_ENROLLED') {
        root.innerHTML = `<div class="ac-wrap">${loginBox(e.code === 'NOT_ENROLLED' ? 'No estás matriculado en este curso.' : null)}</div>`;
        wireLogin();
      } else {
        root.innerHTML = `<div class="ac-wrap"><div class="ac-empty"><p>${errMsg(e)}</p>
          <a class="ac-btn ac-btn--ghost" href="/academia" data-nav>Volver a la Academia</a></div></div>`;
      }
    }
  }

  /* ── idioma de los cursos (banderas) ────────────────────────── */
  // El catálogo se filtra por idioma del curso (academia_courses.lang). La
  // elección se recuerda en este navegador; la primera vez, la del navegador.
  const LANGS = {
    es: { label: 'Español', flag: `<svg viewBox="0 0 30 20" width="24" height="16" aria-hidden="true"><rect width="30" height="20" fill="#c60b1e"/><rect y="5" width="30" height="10" fill="#ffc400"/></svg>` },
    en: { label: 'English', flag: `<svg viewBox="0 0 60 30" width="24" height="16" aria-hidden="true"><clipPath id="ac-uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#ac-uk-t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></svg>` },
  };
  const CATALOG_TXT = {
    es: { lead: 'Cursos para entender Erasmus+ y diseñar proyectos con criterio, dentro de la misma plataforma en la que los escribes.',
          courses: 'Cursos en español', empty: 'Todavía no hay cursos publicados en español.',
          go: 'Ver el curso', cont: 'Continuar', switchTo: 'Ver los cursos en' },
    en: { lead: 'Courses to understand Erasmus+ and design projects with judgement, inside the same platform where you write them.',
          courses: 'Courses in English', empty: 'English courses are on their way. In the meantime you can browse the Spanish ones.',
          go: 'View course', cont: 'Continue', switchTo: 'Show courses in' },
  };
  // Elección guardada; si no la hay, la del navegador, pero solo si ya hay
  // cursos en ese idioma (no se abre la Academia en una lista vacía).
  function getLang(counts) {
    try { const v = localStorage.getItem('ac-lang'); if (LANGS[v]) return v; } catch { /* sin almacenamiento */ }
    const nav = /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
    return counts[nav] ? nav : (Object.keys(LANGS).find(l => counts[l]) || 'es');
  }
  function setLang(l) { try { localStorage.setItem('ac-lang', l); } catch { /* sin almacenamiento */ } }
  const flagOf = (l) => LANGS[l] || LANGS.es;

  /* ── catálogo ───────────────────────────────────────────────── */
  async function viewCatalog() {
    document.title = 'Academia — EU Funding Studio';
    const all = await API.get('/academia/courses');
    const counts = Object.fromEntries(Object.keys(LANGS).map(l => [l, all.filter(c => (c.lang || 'es') === l).length]));
    const lang = getLang(counts);
    const t = CATALOG_TXT[lang];
    document.documentElement.lang = lang;
    const other = Object.keys(LANGS).find(l => l !== lang && counts[l]);
    const courses = all.filter(c => (c.lang || 'es') === lang);
    const lead = courses[0];
    const card = (c) => {
      const pct = c.enrolled && c.lessons ? Math.round(100 * c.done / c.lessons) : 0;
      const f = flagOf(c.lang || 'es');
      return `<a class="ac-course" href="/academia/${esc(c.slug)}" data-nav>
        ${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" loading="lazy" width="640" height="360">` : ''}
        <div class="ac-course__body">
          <div class="ac-course__tags"><span class="ac-flag" title="${esc(f.label)}">${f.flag}<span class="efs-sr">${esc(f.label)}</span></span>
            ${c.level ? `<span class="ac-pill">${esc(c.level)}</span>` : ''} ${c.status === 'draft' ? '<span class="ac-pill ac-pill--draft">Borrador</span>' : ''}</div>
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.subtitle || '')}</p>
          ${c.enrolled ? `<div class="ac-progress" aria-label="Progreso ${pct} %"><span style="width:${pct}%"></span></div>` : ''}
          <div class="ac-course__meta"><span>${c.modules} módulos · ${c.lessons} lecciones${c.hours ? ` · ${c.hours} h` : ''}</span>
            <span>${c.certificate ? 'Certificado obtenido' : c.enrolled ? `${c.done}/${c.lessons}` : ''}</span></div>
        </div></a>`;
    };
    const switcher = `<div class="ac-langs" role="group" aria-label="${esc(t.switchTo)}">
      ${Object.entries(LANGS).map(([l, v]) => `<button type="button" class="ac-lang${l === lang ? ' is-on' : ''}" data-lang="${l}" aria-pressed="${l === lang}">
        ${v.flag}<span>${v.label}</span>${counts[l] ? `<small>${counts[l]}</small>` : ''}</button>`).join('')}
    </div>`;
    root.innerHTML = `<div class="ac-wrap">
      <section class="ac-hero">
        <div>
          <h1>Academia <em>EU Funding Studio</em><span class="ac-icon" aria-hidden="true"></span></h1>
          <p>${esc(t.lead)}</p>
          ${lead ? `<div class="ac-hero__actions"><a class="ac-btn ac-btn--primary" href="/academia/${esc(lead.slug)}" data-nav>${lead.enrolled ? t.cont : t.go}</a></div>` : ''}
        </div>
        ${lead?.cover_url ? `<img src="${esc(lead.cover_url)}" alt="" width="640" height="400">` : ''}
      </section>
      <section class="ac-section">
        <div class="ac-section__head"><h2>${esc(t.courses)}</h2>${switcher}</div>
        ${courses.length ? `<div class="ac-courses">${courses.map(card).join('')}</div>`
          : `<div class="ac-empty"><p>${esc(t.empty)}</p>${other ? `<button type="button" class="ac-btn ac-btn--ghost ac-lang-go" data-lang="${other}">${flagOf(other).flag} ${esc(t.switchTo)} ${esc(flagOf(other).label)}</button>` : ''}</div>`}
      </section></div>`;
    root.querySelectorAll('.ac-lang, .ac-lang-go').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.lang === lang) return;
      setLang(b.dataset.lang);
      viewCatalog();
    }));
  }

  /* ── ficha del curso ────────────────────────────────────────── */
  async function viewCourse(slug) {
    const c = await API.get(`/academia/courses/${encodeURIComponent(slug)}`);
    // Matriculado y con lecciones pendientes: la ficha sobra, directo a la
    // lección por la que va (la 1-1 si empieza). Se sustituye la URL para que
    // «Atrás» no rebote. La ficha queda para quien no está matriculado (hace de
    // presentación del curso) y para el curso terminado (certificado).
    if (user && c.enrolled && c.next_lesson && !c.certificate && !c.certificateReady) {
      history.replaceState({}, '', `/academia/${encodeURIComponent(c.slug)}/${encodeURIComponent(c.next_lesson)}`);
      return viewLesson(c.slug, c.next_lesson);
    }
    document.title = `${c.title} — Academia`;
    const total = c.modules.reduce((n, m) => n + m.lessons.length, 0);
    const done = c.modules.reduce((n, m) => n + m.lessons.filter(l => l.state === 'done').length, 0);
    const nextHref = `/academia/${esc(c.slug)}/${esc(c.next_lesson)}`;
    const cta = !user ? ''
      : c.enrolled ? `<a class="ac-btn ac-btn--primary" href="${nextHref}" data-nav>${done ? 'Continuar' : 'Empezar'}</a>`
      : c.canEnroll ? `<button class="ac-btn ac-btn--primary" id="ac-enroll">Empezar el curso</button>`
      : '<span class="ac-note-info">Este curso necesita matrícula.</span>';
    const first = c.modules[0]?.lessons[0];
    root.innerHTML = `<div class="ac-wrap">
      <p class="ac-crumb"><a href="/academia" data-nav>Academia</a> / ${esc(c.title)}</p>
      <section class="ac-hero" style="margin-top:10px">
        <div>
          <h1>${esc(c.title)}</h1>
          <p>${esc(c.description || c.subtitle || '')}</p>
          <div class="ac-facts">
            ${c.level ? `<span>Nivel <b>${esc(c.level)}</b></span>` : ''}
            <span><b>${c.modules.length}</b> módulos</span><span><b>${total}</b> lecciones</span>
            ${c.hours ? `<span><b>${c.hours}</b> horas</span>` : ''}
            <span>Aprobado con <b>${c.passing_score} %</b> en cada test</span>
          </div>
          <div class="ac-hero__actions">${cta}
            ${c.enrolled ? `<span class="ac-note-info" style="color:#e7e1f3">${done} de ${total} lecciones completadas</span>` : ''}</div>
        </div>
        ${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" width="640" height="400">` : ''}
      </section>
      ${!user ? loginBox() : ''}
      ${c.certificate ? `<div class="ac-cert">${ms('workspace_premium')}<div><b>Has completado el curso.</b><br>
        <a href="/academia/certificado/${esc(c.certificate.serial)}" target="_blank" rel="noopener">Ver tu certificado (${esc(c.certificate.serial)})</a></div></div>`
        : c.certificateReady ? certFormHtml(c.suggestedName) : ''}
      <section class="ac-section">
        <h2>Temario</h2>
        ${!c.enrolled ? `<p class="ac-note-info" style="margin:-8px 0 14px">${ms('lock')} Las lecciones se abren al empezar el curso.</p>` : ''}
        <div class="ac-modules">
          ${c.modules.map((m, i) => {
            const md = m.lessons.filter(l => l.state === 'done').length;
            return `<details class="ac-module"${i === 0 || m.lessons.some(l => l.slug === c.next_lesson) ? ' open' : ''}>
              <summary><span class="ac-module__n">${m.number}</span>
                <span class="ac-module__t"><b>${esc(m.title)}</b><small>${m.lessons.length} lecciones${c.enrolled ? ` · ${md} completadas` : ''}</small></span>${ms('expand_more')}</summary>
              <ol>${m.lessons.map(l => c.enrolled
                ? `<li><a href="/academia/${esc(c.slug)}/${esc(l.slug)}" data-nav>
                ${dot(l.state)}<span>${esc(l.code)} · ${esc(l.title)}</span><small>${l.minutes ? `${l.minutes} min de vídeo` : ''}</small></a></li>`
                : `<li><span class="ac-locked" aria-label="${esc(l.code)} ${esc(l.title)}, disponible al matricularte">
                ${ms('lock')}<span>${esc(l.code)} · ${esc(l.title)}</span><small>${l.minutes ? `${l.minutes} min de vídeo` : ''}</small></span></li>`).join('')}</ol>
            </details>`;
          }).join('')}
        </div>
      </section></div>`;
    wireLogin();
    wireCertForm(c.slug);
    $('#ac-enroll')?.addEventListener('click', async () => {
      try { await API.post(`/academia/courses/${encodeURIComponent(c.slug)}/enroll`); go(`/academia/${c.slug}/${first.slug}`); }
      catch (e) { alert(e?.message || 'No se pudo hacer la matrícula'); }
    });
  }

  /* ── aula ───────────────────────────────────────────────────── */
  // Organización del aula de Proyecto Emociona (components/TrainingLesson.tsx):
  // temario lateral · «Tu recorrido» · vídeo (+ anterior/siguiente) · recursos
  // en pestañas (Lectura por hojas · Esquema · Infografía · PDF) · test · valoración ·
  // notas · dudas y comentarios · anterior/siguiente.
  const circleLabel = { done: 'Lección terminada', in_progress: 'Lección en proceso', pending: 'Lección pendiente' };
  const circle = (state) => `<span class="ac-circle ac-circle--${state}" role="img" aria-label="${circleLabel[state]}" title="${circleLabel[state]}"></span>`;
  const fmtDate = (d) => { try { return new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Temario lateral: módulos plegables (solo abierto el de la lección actual). */
  function syllabusHtml(course, currentSlug) {
    const t = course.tests || { total: 0, passed: 0 };
    const pct = t.total ? Math.round((100 * t.passed) / t.total) : 0;
    return `<span class="ac-syl__course">${esc(course.title)}</span>
      ${t.total ? `<p class="ac-syl__tests">Evaluaciones: ${t.passed}/${t.total} · ${pct} %</p>` : ''}
      ${course.modules.map(m => {
        const open = m.lessons.some(l => l.slug === currentSlug);
        const md = m.lessons.filter(l => l.state === 'done').length;
        return `<details class="ac-syl__mod"${open ? ' open' : ''}><summary><span>Módulo ${m.number} · ${esc(m.title)}</span>
            <small>${md}/${m.lessons.length}</small></summary>
          ${m.lessons.map(l => `<a class="l" data-slug="${esc(l.slug)}" href="/academia/${esc(course.slug)}/${esc(l.slug)}" data-nav
            ${l.slug === currentSlug ? 'aria-current="page"' : ''}>${circle(l.state)}<span><b class="n">${esc(l.code)}</b> ${esc(l.title)}</span></a>`).join('')}
        </details>`;
      }).join('')}`;
  }

  async function viewLesson(courseSlug, lessonSlug) {
    if (!user) throw { code: 'UNAUTHORIZED' };
    const base = `/academia/courses/${encodeURIComponent(courseSlug)}`;
    const lp = `${base}/lessons/${encodeURIComponent(lessonSlug)}`;
    const [d, course0] = await Promise.all([API.get(lp), API.get(base)]);
    let course = course0;
    const L = d.lesson;
    let phases = d.phases;
    document.title = `${L.code} · ${L.title} — Academia`;
    const lessonHref = (s) => `/academia/${esc(course.slug)}/${esc(s)}`;
    const pager = (small) => `<nav class="ac-pager${small ? ' ac-pager--small' : ''}" aria-label="Navegación de lecciones">
        ${d.prev ? `<a href="${lessonHref(d.prev.slug)}" data-nav><small>← Anterior</small><b>${esc(d.prev.code)} · ${esc(d.prev.title)}</b></a>` : '<span></span>'}
        ${d.next ? `<a class="next" href="${lessonHref(d.next.slug)}" data-nav><small>Siguiente →</small><b>${esc(d.next.code)} · ${esc(d.next.title)}</b></a>` : ''}
      </nav>`;

    root.innerHTML = `<div class="ac-lesson">
      <aside class="ac-syl" id="ac-syl" aria-label="Temario">${syllabusHtml(course, L.slug)}</aside>
      <div class="ac-main">
        <div>
          <p class="ac-crumb"><a href="/academia" data-nav>Academia</a> / <a href="/academia/${esc(course.slug)}" data-nav>${esc(course.title)}</a></p>
          <div class="ac-title"><p class="ac-kicker">Lección ${d.index} de ${d.count} · Módulo ${d.module.number} · ${esc(d.module.title)}</p>
            <h1>${esc(L.code)} · ${esc(L.title)}</h1>${L.idea ? `<p>${esc(L.idea)}</p>` : ''}</div>
        </div>
        <div id="ac-certslot"></div>
        <section class="ac-route" id="ac-route" aria-label="Pasos de la lección"></section>
        ${L.video_url ? `<div id="ac-video-wrap"><div class="ac-video"><video id="ac-video" controls preload="metadata" playsinline
            src="${esc(L.video_url)}" ${L.video_poster ? `poster="${esc(L.video_poster)}"` : ''}></video></div>${pager(true)}</div>` : ''}
        <section class="ac-card" id="ac-reading" aria-label="Recursos de estudio"></section>
        <section class="ac-card" id="ac-test" aria-label="Test de la lección"></section>
        <section class="ac-card ac-rating" id="ac-rating" aria-label="Valorar la clase"></section>
        <section class="ac-card ac-notes">
          <h2>${ms('edit_note')} Mis notas <small>Solo las ves tú</small></h2>
          <label class="efs-sr" for="ac-note">Mis notas de esta lección</label>
          <textarea id="ac-note" placeholder="Escribe aquí lo que quieras recordar de esta lección">${esc(d.note.body)}</textarea>
          <div class="ac-notes__state" id="ac-note-state" aria-live="polite"></div>
        </section>
        <section class="ac-card ac-disc" id="ac-discussion" aria-label="Dudas y comentarios"></section>
        ${pager(false)}
      </div></div>`;

    const cur = $('#ac-syl [aria-current="page"]');
    // Solo dentro del temario (no mueve la página).
    if (cur) { const syl = $('#ac-syl'); syl.scrollTop = Math.max(0, cur.offsetTop - syl.clientHeight / 2); }

    let wasCompleted = phases.completed;
    const phase = async (body) => {
      phases = await API.post(`${lp}/phase`, body);
      paintPhases();
      return phases;
    };

    /* Al completar la lección: se repinta el temario y, si era la última que
       faltaba, aparece el formulario del certificado arriba. */
    async function onMaybeCompleted() {
      if (!phases.completed || wasCompleted) return;
      wasCompleted = true;
      try {
        course = await API.get(base);
        const syl = $('#ac-syl'), top = syl.scrollTop;
        syl.innerHTML = syllabusHtml(course, L.slug); syl.scrollTop = top;
        if (course.certificateReady && !course.certificate) { $('#ac-certslot').innerHTML = certFormHtml(course.suggestedName); wireCertForm(course.slug); }
      } catch { /* se verá al recargar */ }
    }

    /* «Tu recorrido»: cinco pasos enlazados a su sección (TrainingPhases.tsx). */
    function paintPhases() {
      const p = phases;
      const items = [
        p.hasVideo ? { label: 'Ver el vídeo', done: p.videoSeen, href: '#ac-video-wrap' } : null,
        p.hasReading ? { label: 'Leer los contenidos', done: p.readingDone, href: '#ac-reading' } : null,
        p.hasTest ? { label: 'Hacer el test', done: p.testPassed, href: '#ac-test' } : null,
        { label: 'Comentar o preguntar', done: p.discussed, href: '#ac-discussion', optional: true },
        { label: 'Valorar la clase', done: p.rating != null, href: '#ac-rating', optional: true },
      ].filter(Boolean);
      const allNew = (!p.hasVideo || p.videoSeen) && (!p.hasReading || p.readingDone) && (!p.hasTest || p.testPassed);
      const title = p.completed ? (p.legacyCompleted && !allNew ? 'Completada anteriormente' : 'Lección terminada') : 'Tu recorrido';
      $('#ac-route').innerHTML = `<div class="ac-route__head"><strong class="${p.completed ? 'is-done' : ''}">${title}</strong>
          <small>${p.completed ? (p.legacyCompleted && !allNew ? 'La terminaste con la regla anterior (test aprobado). Puedes repasarla cuando quieras.' : 'Has visto el vídeo, terminado la lectura y aprobado el test.')
            : 'La lección se completa al ver el vídeo, terminar la lectura y aprobar el test.'}</small></div>
        <ul class="ac-route__list">${items.map(it => `<li class="${it.done ? 'is-done' : ''}"><a href="${it.href}" data-jump>
          <span class="ac-route__mark" aria-hidden="true">${it.done ? ms('check') : ''}</span>
          <span>${it.label}${it.optional ? ' <small>· opcional</small>' : ''}</span>
          <span class="efs-sr">${it.done ? ', hecho' : ', pendiente'}</span></a></li>`).join('')}</ul>
        ${p.testSubmitted && !p.testPassed ? `<p class="ac-route__note">Test entregado · última nota ${p.lastScore}/100. Se aprueba con un ${p.passingScore} %: repasa y vuelve a intentarlo, sin límite.</p>` : ''}`;
      const curDot = $(`#ac-syl a[data-slug="${CSS.escape(L.slug)}"] .ac-circle`);
      if (curDot) {
        const st = p.completed ? 'done' : 'in_progress';
        curDot.className = `ac-circle ac-circle--${st}`; curDot.setAttribute('aria-label', circleLabel[st]); curDot.title = circleLabel[st];
      }
      paintTestIdle();
      onMaybeCompleted();
    }
    const onJump = (e) => {
      const a = e.target.closest('a[data-jump]');
      if (!a) return;
      const t = document.querySelector(a.getAttribute('href'));
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    };
    root.addEventListener('click', onJump);
    cleanup.push(() => root.removeEventListener('click', onJump));

    phase({ action: 'start' }).catch(() => paintPhases());

    /* vídeo: una muestra con la posición cada ~5 s mientras se reproduce, y al
       pausar o terminar. Un watchId por visita; el servidor descarta los saltos. */
    const video = $('#ac-video');
    if (video && !phases.videoSeen) {
      const watchId = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
      let lastSent = 0, sending = false;
      const send = async (force) => {
        if (phases.videoSeen || sending) return;
        if (!force && Date.now() - lastSent < 5000) return;
        lastSent = Date.now(); sending = true;
        try { await phase({ action: 'video', watchId, to: video.currentTime }); } catch { /* reintenta en la siguiente */ }
        finally { sending = false; }
      };
      const onTime = () => { if (!video.paused) send(false); };
      const onPause = () => send(true);
      video.addEventListener('timeupdate', onTime);
      video.addEventListener('pause', onPause);
      video.addEventListener('ended', onPause);
      cleanup.push(() => { video.pause(); });
    }

    /* ── recursos de estudio en pestañas (StudyResources.tsx) ──────── */
    const slides = [{ cover: true }];
    let k = 0;
    L.reading.forEach((s, si) => s.paragraphs.forEach(p => slides.push({
      heading: s.heading, html: p, section: si + 1, sections: L.reading.length, key: L.slide_keys[k++] })));
    const hasSlides = slides.length > 1;
    const tabs = [
      hasSlides ? { id: 'lectura', label: 'Lectura' } : null,
      L.mind_map ? { id: 'esquema', label: 'Esquema' } : null,
      L.infographic ? { id: 'infografia', label: 'Infografía' } : null,
      L.pdf_url ? { id: 'pdf', label: 'PDF' } : null,
    ].filter(Boolean);
    let tab = tabs[0]?.id;
    const box = $('#ac-reading');
    if (!tabs.length) box.remove();
    else {
      box.innerHTML = `<div class="ac-tabs" role="tablist" aria-label="Recursos de estudio">
          ${tabs.map(t => `<button type="button" role="tab" class="ac-tab${t.id === tab ? ' is-on' : ''}" id="ac-tab-${t.id}"
            aria-controls="ac-panel-${t.id}" aria-selected="${t.id === tab}" tabindex="${t.id === tab ? 0 : -1}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        ${hasSlides ? `<div role="tabpanel" id="ac-panel-lectura" aria-labelledby="ac-tab-lectura"><div class="ac-deck" id="ac-deck"
            tabindex="0" aria-roledescription="presentación" aria-label="Lectura de la lección"></div></div>` : ''}
        ${L.mind_map ? `<div role="tabpanel" id="ac-panel-esquema" aria-labelledby="ac-tab-esquema" hidden>${mindMapHtml(L.mind_map)}</div>` : ''}
        ${L.infographic ? `<div role="tabpanel" id="ac-panel-infografia" aria-labelledby="ac-tab-infografia" hidden>${infographicHtml(L.infographic)}</div>` : ''}
        ${L.pdf_url ? `<div role="tabpanel" id="ac-panel-pdf" aria-labelledby="ac-tab-pdf" hidden><div class="ac-pdf">
            <div><h3>Toda la lección en un documento</h3><p class="ac-note-info">El dossier de la lección, listo para imprimir o leer sin conexión.</p></div>
            <a class="ac-btn ac-btn--ghost" href="${esc(L.pdf_url)}" target="_blank" rel="noopener">${ms('picture_as_pdf')} Abrir el PDF</a></div></div>` : ''}
        ${L.guide_ref ? `<p class="ac-note-info ac-guide">Referencia en la Guía del Programa: ${esc(L.guide_ref)}</p>` : ''}`;
      // Cambiar de pestaña solo oculta paneles: la lectura sigue donde estaba.
      const setTab = (id, focus) => {
        tab = id;
        box.querySelectorAll('[role=tab]').forEach(b => {
          const on = b.dataset.tab === id;
          b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
          if (on && focus) b.focus();
        });
        box.querySelectorAll('[role=tabpanel]').forEach(p => { p.hidden = p.id !== `ac-panel-${id}`; });
      };
      const tl = box.querySelector('[role=tablist]');
      tl.addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) setTab(b.dataset.tab); });
      tl.addEventListener('keydown', (e) => {
        const i = tabs.findIndex(t => t.id === tab);
        const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (n === null) return;
        e.preventDefault();
        setTab(tabs[(n + tabs.length) % tabs.length].id, true);
      });
      wireMindMap(box); wireInfographic(box);
    }

    /* ── lectura por hojas (StudyDeck.tsx) ─────────────────────────── */
    let idx = phases.readingDone ? 0 : Math.max(0, phases.slides.reached);
    let dir = 1;
    let timerEnd = 0;          // ms epoch en que se puede pasar de la hoja frontera
    let timerRaf = null;
    let finishing = false;     // evita pedir «lectura terminada» dos veces a la vez
    const loved = new Set(d.hearts || []);
    let pop = null;
    const R = 11, CIRC = 2 * Math.PI * R;

    const readCount = () => {
      const p = phases;
      if (p.readingDone) return slides.length;
      if (p.slides.reached < 0) return 0;
      return p.slides.reached + (Date.now() >= timerEnd ? 1 : 0);
    };

    function slideHtml(i) {
      const s = slides[i];
      if (s.cover) {
        return `<div class="ac-deck__cover"><p class="ac-deck__kicker">Lección ${esc(L.code)}</p><h3>${esc(L.title)}</h3><dl>
          ${L.idea ? `<div><dt>La idea</dt><dd>${esc(L.idea)}</dd></div>` : ''}
          ${L.goal ? `<div><dt>Al terminar podrás</dt><dd>${esc(L.goal)}</dd></div>` : ''}
          ${L.why ? `<div><dt>Por qué importa</dt><dd>${esc(L.why)}</dd></div>` : ''}</dl>
          <p class="ac-deck__hint">Pasa las hojas para leer la lección párrafo a párrafo.${phases.readingDone ? '' : ' Cada hoja nueva se desbloquea a los 7 segundos; al terminar la última, tu lectura queda registrada.'}</p></div>`;
      }
      const on = loved.has(s.key);
      return `<p class="ac-deck__kicker">${s.section} / ${s.sections} · ${esc(s.heading || L.title)}</p><div class="ac-deck__text">${s.html}</div>
        ${s.key ? `<button type="button" class="ac-heart${on ? ' is-on' : ''}${pop === s.key ? ' is-pop' : ''}" id="ac-heart" aria-pressed="${on}"
          aria-label="${on ? 'Te encanta esta hoja. Pulsa para quitar el corazón' : 'Marcar esta hoja: me encanta'}" title="${on ? 'Te encanta' : 'Me encanta'}">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.6-9.2C.9 8 2.9 4.5 6.4 4.5c2.1 0 3.6 1.2 4.6 2.7 1-1.5 2.5-2.7 4.6-2.7 3.5 0 5.5 3.5 4 6.8-2.1 4.6-9.6 9.2-9.6 9.2z"/></svg></button>` : ''}`;
    }

    function paintDeck() {
      const deck = $('#ac-deck');
      if (!deck) return;
      const p = phases;
      const frontier = !p.readingDone && idx === p.slides.reached;
      const waiting = frontier && Date.now() < timerEnd;
      const last = idx === slides.length - 1;
      const canNext = idx < slides.length - 1 && !waiting && (p.readingDone || idx <= p.slides.reached);
      const read = readCount();
      deck.innerHTML = `<header class="ac-deck__head">
          <span class="ac-deck__label">Lectura</span>
          <span class="ac-deck__status${p.readingDone ? ' is-done' : ''}">${p.readingDone ? `${ms('check')} Lectura completada` : `Leídas ${read} de ${slides.length}`}</span>
        </header>
        <div class="ac-deck__bar4" aria-hidden="true"><span style="transform:scaleX(${(idx + 1) / slides.length})"></span></div>
        <div class="ac-deck__stage" aria-live="polite"><article class="ac-deck__slide ac-deck__slide--${dir > 0 ? 'next' : 'prev'}"
          aria-roledescription="hoja" aria-label="Hoja ${idx + 1} de ${slides.length}">${slideHtml(idx)}</article></div>
        <p class="ac-err ac-deck__err" id="ac-deck-err" role="alert" hidden></p>
        <nav class="ac-deck__nav" aria-label="Pasar hojas">
          <button type="button" class="ac-btn ac-btn--ghost ac-btn--sm" id="ac-prev" ${idx === 0 ? 'disabled' : ''}>${ms('chevron_left')} Anterior</button>
          <span class="ac-deck__count">
            ${!p.readingDone ? `<span class="ac-timer${waiting ? '' : ' is-done'}" role="img" id="ac-timer" aria-label="${waiting ? 'Tiempo mínimo de lectura de esta hoja' : 'Hoja leída'}">
              <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle class="t-bg" cx="14" cy="14" r="${R}"/>
              <circle class="t-fg" cx="14" cy="14" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${waiting ? CIRC : 0}"/></svg>
              <span class="ac-timer__n" id="ac-timer-n">${waiting ? '' : '✓'}</span></span>` : ''}
            ${idx + 1} / ${slides.length}</span>
          ${last ? '<span class="ac-deck__end"></span>' : `<button type="button" class="ac-btn ac-btn--primary ac-btn--sm" id="ac-next" ${canNext ? '' : 'disabled'}>Siguiente ${ms('chevron_right')}</button>`}
        </nav>`;
      $('#ac-prev').onclick = () => goSlide(idx - 1);
      const nx = $('#ac-next');
      if (nx) nx.onclick = () => goSlide(idx + 1);
      const ht = $('#ac-heart');
      if (ht) { ht.onclick = () => toggleHeart(slides[idx].key); ht.addEventListener('animationend', () => { pop = null; ht.classList.remove('is-pop'); }); }
      if (waiting) tick();
      else if (frontier && last && !finishing) { finishing = true; onTimerDone().finally(() => { finishing = false; }); }
    }

    function deckError(msg) {
      const el = $('#ac-deck-err');
      if (el) { el.textContent = msg; el.hidden = false; }
    }

    async function toggleHeart(key) {
      const on = !loved.has(key);
      if (on) loved.add(key); else loved.delete(key);
      pop = on ? key : null;
      paintDeck();
      try {
        await API.post(`${lp}/heart`, { slideKey: key, on });
      } catch {
        // No se guardó: el corazón vuelve a como estaba.
        if (on) loved.delete(key); else loved.add(key);
        pop = null;
        paintDeck();
        deckError('No se pudo guardar el corazón. Inténtalo de nuevo.');
      }
    }

    function tick() {
      cancelAnimationFrame(timerRaf);
      const fg = $('#ac-timer .t-fg'), n = $('#ac-timer-n');
      if (!fg) return;
      const left = timerEnd - Date.now();
      if (left <= 0) { onTimerDone(); return; }
      fg.setAttribute('stroke-dashoffset', String(CIRC * (left / SLIDE_MS)));
      n.textContent = String(Math.ceil(left / 1000));
      timerRaf = requestAnimationFrame(tick);
    }
    cleanup.push(() => cancelAnimationFrame(timerRaf));

    async function onTimerDone() {
      if (idx === slides.length - 1 && !phases.readingDone) {
        try { await phase({ action: 'read' }); }
        catch (e) { if (e?.waitMs) { timerEnd = Date.now() + e.waitMs; } else { deckError('No se pudo guardar tu lectura. Espera un momento y vuelve a intentarlo.'); return; } }
      }
      paintDeck();
    }

    let advancing = false;     // un doble clic no debe saltar dos hojas
    async function goSlide(n) {
      if (n < 0 || n > slides.length - 1 || n === idx) return;
      if (n < idx) { dir = -1; idx = n; paintDeck(); return; }
      if (n > idx + 1 && !phases.readingDone && n > phases.slides.reached) return;  // no se salta ninguna hoja sin leer
      dir = 1;
      if (n <= phases.slides.reached || phases.readingDone) { idx = n; paintDeck(); return; }
      if (advancing || Date.now() < timerEnd) return;
      advancing = true;
      try {
        await phase({ action: 'slide', index: n });
        idx = n;
        timerEnd = Date.now() + SLIDE_MS;
      } catch (e) {
        if (e?.waitMs) timerEnd = Date.now() + e.waitMs;
        else deckError('No se pudo guardar tu lectura. Espera un momento y vuelve a intentarlo.');
      } finally { advancing = false; }
      paintDeck();
    }

    const deckEl = $('#ac-deck');
    if (deckEl) {
      deckEl.addEventListener('keydown', (e) => {
        if (e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goSlide(idx + 1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goSlide(idx - 1); }
        if (e.key === 'Home') { e.preventDefault(); goSlide(0); }
      });
      // Deslizar en móvil: más de 50 px en horizontal.
      let touchX = null, touchY = null;
      deckEl.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
      deckEl.addEventListener('touchend', (e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
        touchX = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) goSlide(dx < 0 ? idx + 1 : idx - 1);
      });

      // Primera visita: se registra la portada y arranca su tiempo. Al volver,
      // se retoma en la última hoja alcanzada con el tiempo que le quede.
      if (!phases.readingDone) {
        if (phases.slides.reached < 0) {
          try { await phase({ action: 'slide', index: 0 }); timerEnd = Date.now() + SLIDE_MS; } catch { /* sin conexión: se pinta igual */ }
        } else {
          timerEnd = Date.now() + phases.slides.waitMs;
        }
      }
      paintDeck();
    }

    /* ── test (LearningControl.tsx): una pregunta por pantalla ─────── */
    let attempt = null, answers = [], qi = 0, history = null, lastResult = null;

    async function loadHistory() {
      try { history = await API.get(`${lp}/test/history`); } catch { history = null; }
    }

    function historyHtml(openId) {
      if (!history || !history.attempts.length) return '';
      return `<div class="ac-hist"><h3>Mis resultados</h3>
        ${history.attempts.map(a => `<details class="ac-hist__item"${a.id === openId ? ' open' : ''}>
          <summary><span class="ac-hist__badge ${a.passed ? 'is-ok' : 'is-ko'}">${a.passed ? 'Superado' : 'Repasar'}</span>
            <span>Intento ${a.n} · <b>${a.score}/100</b> · ${esc(fmtDate(a.date))}</span>${ms('expand_more')}</summary>
          ${reviewHtml(a.questions)}</details>`).join('')}</div>`;
    }

    function reviewHtml(qs) {
      return `<ol class="ac-review">${qs.map(q => `<li class="ac-review__item">
          <p class="ac-review__q">${esc(q.question)}</p>
          <p><span class="ac-mark ${q.ok ? 'is-ok' : 'is-ko'}">${q.ok ? '✓ Acierto' : '✗ Incorrecta'}</span> · Tu respuesta: ${esc(q.options[q.chosen])}</p>
          ${!q.ok && q.feedback ? `<p class="ac-review__fb">${esc(q.feedback)}</p>` : ''}
          ${!q.ok ? `<p class="ac-review__right"><b>Respuesta correcta:</b> ${esc(q.options[q.correct])}</p>` : ''}
          <p class="ac-review__fb"><b>Por qué:</b> ${esc(q.explanation)}</p>
          ${q.help ? `<details class="ac-review__help"><summary>Explicación de cada opción</summary><ul>${q.options.map((o, k) => `<li><b>${esc(o)}</b>: ${esc(q.help[k])}</li>`).join('')}</ul></details>` : ''}
        </li>`).join('')}</ol>`;
    }

    const helpsNote = () => (phases.helps
      ? `<p class="ac-help-on">${ms('lightbulb')} <span><b>Ayudas activadas.</b> Ahora verás la explicación de cada opción mientras respondes. Léelas con calma y vuelve a intentarlo.</span></p>`
      : '');

    function paintTestIdle() {
      if (attempt) return;
      const p = phases, tb = $('#ac-test');
      if (!L.questions) { tb.innerHTML = `<h2>${ms('quiz')} Test</h2><p class="ac-note-info">Esta lección no tiene test.</p>`; return; }
      if (!p.testUnlocked) {
        tb.innerHTML = `<h2>${ms('quiz')} Test de la lección</h2><div class="ac-lock">${ms('lock')}
          <p style="margin:0">Para hacer el test, mira el vídeo hasta el final <b>o</b> termina la lectura.</p></div>`;
        return;
      }
      const r = lastResult;
      tb.innerHTML = `<h2>${ms('quiz')} Test de la lección <small>${L.questions} preguntas · se aprueba con ${p.passingScore} %</small></h2>
        ${r ? `<div class="ac-result${r.passed ? '' : ' ac-result--fail'}" role="status"><div class="ac-result__score">${r.score}<small>/100</small></div>
            <div><b>${r.passed ? 'Test superado.' : 'Todavía no.'}</b> ${r.right} de ${r.total} correctas.
            ${r.passed ? (r.lessonCompleted ? 'Lección completada.' : 'Para completar la lección te falta ' + [!p.videoSeen && p.hasVideo ? 'ver el vídeo' : '', !p.readingDone && p.hasReading ? 'terminar la lectura' : ''].filter(Boolean).join(' y ') + '.')
              : 'Abajo tienes la corrección con la respuesta correcta de cada pregunta. Repasa y vuelve a intentarlo cuando quieras.'}
            ${r.certificate ? `<br><a href="/academia/certificado/${esc(r.certificate)}" target="_blank" rel="noopener">Has terminado el curso: ver tu certificado</a>` : ''}</div></div>`
          : p.testPassed ? `<div class="ac-result"><div class="ac-result__score">${p.bestScore}<small>/100</small></div><div><b>Test superado.</b>
              <span class="ac-note-info">Puedes repetirlo cuando quieras: cuenta tu mejor nota.</span></div></div>`
          : p.attempts ? `<p class="ac-note-info">Llevas ${p.attempts} ${p.attempts === 1 ? 'intento' : 'intentos'}. Tu mejor nota: ${p.bestScore}/100. Puedes intentarlo las veces que quieras.</p>` : ''}
        ${r && r.certificateReady && !r.certificate ? certFormHtml(r.suggestedName) : ''}
        ${helpsNote()}
        <div class="ac-test__actions">
          ${r && r.passed && d.next ? `<a class="ac-btn ac-btn--primary" href="${lessonHref(d.next.slug)}" data-nav>Siguiente lección ${ms('chevron_right')}</a>` : ''}
          <button class="ac-btn ${p.testPassed ? 'ac-btn--ghost' : (r && r.passed && d.next ? 'ac-btn--ghost' : 'ac-btn--primary')}" id="ac-test-start">
          ${p.attempts ? 'Nuevo intento' : 'Empezar el test'}</button></div>
        <div id="ac-test-err"></div>
        ${historyHtml(r ? r.attemptId : null)}`;
      $('#ac-test-start').onclick = startTest;
      if (r && r.certificateReady) wireCertForm(course.slug);
    }

    async function startTest() {
      try {
        attempt = await API.post(`${lp}/test`);
        answers = new Array(attempt.questions.length).fill(null); qi = 0;
        lastResult = null;
        paintQuestion(true);
      } catch (e) {
        $('#ac-test-err').innerHTML = `<div class="ac-err" style="margin-top:12px">${errMsg(e)}</div>`;
      }
    }

    function paintQuestion(focus) {
      const q = attempt.questions[qi], n = attempt.questions.length;
      const name = `ac-q-${qi}`;
      $('#ac-test').innerHTML = `<h2>${ms('quiz')} Test de la lección <small>Pregunta ${qi + 1} de ${n}</small></h2>
        <div class="ac-qbar" aria-hidden="true"><span style="transform:scaleX(${(qi + 1) / n})"></span></div>
        ${attempt.helps ? '<p class="ac-help-on ac-help-on--sm">' + ms('lightbulb') + ' <span>Ayudas activadas: debajo de cada opción tienes su explicación.</span></p>' : ''}
        <fieldset class="ac-q"><legend id="ac-q-legend" tabindex="-1">${esc(q.question)}</legend>
          <div class="ac-opts">${q.options.map((o, i) => `<label class="ac-opt${answers[qi] === i ? ' is-chosen' : ''}">
            <input type="radio" name="${name}" value="${i}" ${answers[qi] === i ? 'checked' : ''}>
            <span class="ac-opt__k" aria-hidden="true">${'ABCDEF'[i]}</span>
            <span class="ac-opt__t">${esc(o)}${q.help ? `<small class="ac-opt__help">${esc(q.help[i])}</small>` : ''}</span></label>`).join('')}</div>
        </fieldset>
        <div class="ac-qnav">
          <button type="button" class="ac-btn ac-btn--ghost" id="ac-qprev" ${qi === 0 ? 'disabled' : ''}>${ms('chevron_left')} Anterior</button>
          ${qi < n - 1 ? `<button type="button" class="ac-btn ac-btn--primary" id="ac-qnext" ${answers[qi] === null ? 'disabled' : ''}>Siguiente ${ms('chevron_right')}</button>`
            : `<button type="button" class="ac-btn ac-btn--primary" id="ac-qsend" ${answers.every(a => a !== null) ? '' : 'disabled'}>Entregar el test</button>`}
        </div>
        ${qi === n - 1 && !answers.every(a => a !== null) ? '<p class="ac-note-info" style="margin:10px 0 0">Te faltan preguntas por responder.</p>' : ''}
        <div id="ac-test-err"></div>`;
      $('#ac-test').querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', () => {
        answers[qi] = Number(r.value);
        $('#ac-test').querySelectorAll('.ac-opt').forEach((lb, i) => lb.classList.toggle('is-chosen', i === answers[qi]));
        const nx = $('#ac-qnext'); if (nx) nx.disabled = false;
        const sd = $('#ac-qsend'); if (sd) sd.disabled = !answers.every(a => a !== null);
      }));
      $('#ac-qprev').onclick = () => { qi -= 1; paintQuestion(true); };
      const nx = $('#ac-qnext'); if (nx) nx.onclick = () => { qi += 1; paintQuestion(true); };
      const sd = $('#ac-qsend'); if (sd) sd.onclick = submitTest;
      if (focus) $('#ac-q-legend').focus({ preventScroll: true });
    }

    async function submitTest() {
      const sd = $('#ac-qsend'); if (sd) sd.disabled = true;
      try {
        const r = await API.post(`${lp}/test/submit`, { attemptId: attempt.attemptId, answers });
        lastResult = { ...r, attemptId: attempt.attemptId };
        attempt = null;
        await loadHistory();
        phases = await API.post(`${lp}/phase`, { action: 'start' });
        paintPhases();
        $('#ac-test').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      } catch (e) {
        if (sd) sd.disabled = false;
        $('#ac-test-err').innerHTML = `<div class="ac-err" style="margin-top:12px">${errMsg(e)}</div>`;
      }
    }

    /* ── valoración de la clase: solo para la persona ──────────────── */
    function paintRating() {
      const r = phases.rating;
      $('#ac-rating').innerHTML = `<h2>${ms('star')} Valora la clase <small>Solo para ti</small></h2>
        <div class="ac-stars" role="group" aria-label="Tu valoración de la clase">
          ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="ac-star${n <= (r || 0) ? ' is-on' : ''}" data-n="${n}" aria-pressed="${r === n}"
            aria-label="${n} ${n === 1 ? 'estrella' : 'estrellas'}">${n <= (r || 0) ? '★' : '☆'}</button>`).join('')}
          ${r != null ? '<button type="button" class="ac-linklike" id="ac-rate-clear">Quitar valoración</button>' : ''}
        </div>
        <p class="ac-note-info" style="margin:8px 0 0">Te sirve para recordar qué clases te gustaron más. No la ve nadie más.</p>
        <p class="ac-err" id="ac-rate-err" role="alert" hidden></p>`;
      $('#ac-rating').querySelectorAll('.ac-star').forEach(b => b.onclick = () => rate(Number(b.dataset.n)));
      const cl = $('#ac-rate-clear'); if (cl) cl.onclick = () => rate(null);
    }
    async function rate(n) {
      try {
        const res = await API.post(`${lp}/rating`, { rating: n });
        phases = { ...phases, rating: res.rating };
        paintRating(); paintPhases();
      } catch (e) { const el = $('#ac-rate-err'); el.textContent = e?.message || 'No se pudo guardar'; el.hidden = false; }
    }
    paintRating();

    /* ── dudas y comentarios (TrainingDiscussion.tsx) ──────────────── */
    let disc = { threads: [], staff: false }, replyTo = null;
    async function loadDiscussion() {
      try { disc = await API.get(`${lp}/discussion`); } catch { /* se queda lo que había */ }
      paintDiscussion();
    }
    const MAX = 4000;
    function paintDiscussion() {
      const el = $('#ac-discussion');
      const draft = $('#ac-msg')?.value || '';
      const aud = $('#ac-aud')?.value || 'community', kind = $('#ac-kind')?.value || 'question', share = $('#ac-share')?.checked || false;
      const privacy = replyTo ? replyTo.visibility : (aud === 'community' || share ? 'shared' : 'private');
      el.innerHTML = `<h2>${ms('forum')} Dudas y comentarios</h2>
        <form class="ac-disc__form" id="ac-disc-form" novalidate>
          ${replyTo ? `<p class="ac-disc__replying">Respuesta a <b>${esc(replyTo.author)}</b> · ${replyTo.visibility === 'private' ? 'privada, para el tutor' : 'compartida con el curso'}
              <button type="button" class="ac-linklike" id="ac-reply-cancel">Cancelar</button></p>`
            : `<div class="ac-disc__opts">
              <label>Para<select id="ac-aud"><option value="community"${aud === 'community' ? ' selected' : ''}>Comunidad del curso</option>
                <option value="tutor"${aud === 'tutor' ? ' selected' : ''}>Tutor</option></select></label>
              <label>Tipo<select id="ac-kind"><option value="question"${kind === 'question' ? ' selected' : ''}>Pregunta</option>
                <option value="comment"${kind === 'comment' ? ' selected' : ''}>Comentario</option></select></label></div>
            ${aud === 'tutor' ? `<label class="ac-disc__share"><input type="checkbox" id="ac-share"${share ? ' checked' : ''}> Compartir la pregunta o comentario y sus respuestas con el resto del curso</label>` : ''}`}
          <label class="efs-sr" for="ac-msg">Tu mensaje</label>
          <textarea id="ac-msg" rows="3" maxlength="${MAX}" placeholder="${replyTo ? 'Escribe tu respuesta…' : 'Escribe aquí tu duda o comentario…'}">${esc(draft)}</textarea>
          <div class="ac-disc__send">
            <button class="ac-btn ac-btn--ghost" type="submit" id="ac-msg-send" ${draft.trim() ? '' : 'disabled'}>${replyTo ? 'Responder' : 'Enviar'}</button>
            <small class="ac-note-info">${privacy === 'private' ? 'Privado: solo lo veis tú y el equipo docente.' : 'Lo verá el resto de alumnos del curso.'}</small>
            <small class="ac-disc__count" id="ac-msg-count">${draft.length}/${MAX}</small>
          </div>
          <p class="ac-err" id="ac-disc-err" role="alert" hidden></p>
        </form>
        <div class="ac-disc__list">${disc.threads.length ? disc.threads.map(threadHtml).join('') : '<p class="ac-note-info">Todavía no hay mensajes en esta lección. ¿Tienes alguna duda? Pregunta: seguro que no eres la única persona.</p>'}</div>`;
      wireDiscussion();
    }
    const authorLine = (m) => `<b>${esc(m.author)}</b>${m.tutor ? ' <span class="ac-pill">Equipo docente</span>' : ''} <small>${esc(fmtDate(m.date))}</small>`;
    function threadHtml(t) {
      const tags = [t.kind === 'question' ? 'Pregunta' : 'Comentario', t.audience === 'tutor' ? 'Para el tutor' : 'Comunidad', t.visibility === 'private' ? 'Privado' : 'Compartido'];
      const body = (m) => (m.withdrawn && m.body == null ? '<p class="ac-msg__body ac-msg__body--off">Mensaje retirado por su autor.</p>'
        : `<p class="ac-msg__body">${esc(m.body)}</p>${m.withdrawn ? '<small class="ac-note-info">Retirado por su autor (solo lo ve el equipo).</small>' : ''}`);
      return `<article class="ac-msg${t.mine ? ' is-mine' : ''}" data-id="${esc(t.id)}">
        <header>${authorLine(t)}<small class="ac-msg__tags">${tags.join(' · ')}${t.resolved ? ' · Resuelta' : ''}${t.hidden ? ' · Oculto' : ''}</small></header>
        ${body(t)}
        ${t.replies.map(r => `<div class="ac-msg__reply"><header>${authorLine(r)}</header>${body(r)}
          ${r.mine && !r.withdrawn ? `<button type="button" class="ac-linklike" data-withdraw="${esc(r.id)}">Retirar</button>` : ''}</div>`).join('')}
        <div class="ac-msg__actions">
          ${t.canLike ? `<button type="button" class="ac-like${t.liked ? ' is-on' : ''}" data-like="${esc(t.id)}" aria-pressed="${t.liked}">${ms('thumb_up')} Me gusta${t.likes ? ` · ${t.likes}` : ''}</button>` : ''}
          ${!t.withdrawn && !t.hidden ? `<button type="button" class="ac-linklike" data-reply="${esc(t.id)}">Responder</button>` : ''}
          ${t.mine && !t.withdrawn ? `<button type="button" class="ac-linklike ac-linklike--muted" data-withdraw="${esc(t.id)}">Retirar</button>` : ''}
        </div></article>`;
    }
    function wireDiscussion() {
      const el = $('#ac-discussion'), ta = $('#ac-msg'), send = $('#ac-msg-send');
      ta.addEventListener('input', () => { send.disabled = !ta.value.trim(); $('#ac-msg-count').textContent = `${ta.value.length}/${MAX}`; });
      ['#ac-aud', '#ac-share'].forEach(s => { const x = $(s); if (x) x.addEventListener('change', paintDiscussion); });
      const rc = $('#ac-reply-cancel'); if (rc) rc.onclick = () => { replyTo = null; paintDiscussion(); };
      $('#ac-disc-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#ac-disc-err'); err.hidden = true;
        send.disabled = true; send.textContent = 'Enviando…';
        try {
          await API.post(`${lp}/discussion`, replyTo ? { body: ta.value, parentId: replyTo.id }
            : { body: ta.value, audience: $('#ac-aud').value, kind: $('#ac-kind').value, share: !!$('#ac-share')?.checked });
          ta.value = ''; replyTo = null;
          phases = { ...phases, discussed: true }; paintPhases();
          await loadDiscussion();
        } catch (e2) {
          err.textContent = e2?.message || 'No se pudo enviar'; err.hidden = false;
          send.disabled = false; send.textContent = replyTo ? 'Responder' : 'Enviar';
        }
      });
      el.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => {
        replyTo = disc.threads.find(t => t.id === b.dataset.reply) || null;
        paintDiscussion();
        $('#ac-msg').focus();
      });
      el.querySelectorAll('[data-withdraw]').forEach(b => b.onclick = async () => {
        if (!confirm('¿Retirar el mensaje? Dejará de verse, aunque se guarda una copia por si hiciera falta.')) return;
        try { await API.post(`${lp}/discussion/${encodeURIComponent(b.dataset.withdraw)}/withdraw`); await loadDiscussion();
          phases = await API.post(`${lp}/phase`, { action: 'start' }); paintPhases(); }
        catch (e2) { alert(e2?.message || 'No se pudo retirar'); }
      });
      el.querySelectorAll('[data-like]').forEach(b => b.onclick = async () => {
        const t = disc.threads.find(x => x.id === b.dataset.like);
        try { const r = await API.post(`${lp}/discussion/${encodeURIComponent(t.id)}/like`, { on: !t.liked }); t.liked = r.liked; t.likes = r.likes; paintDiscussion(); }
        catch { /* sin cambios */ }
      });
    }
    paintDiscussion();
    loadDiscussion();

    await loadHistory();
    paintPhases();

    /* notas privadas: guardado automático */
    const ta = $('#ac-note'), st = $('#ac-note-state');
    let rev = d.note.revision, saved = d.note.body, saveT = null;
    const save = async () => {
      if (ta.value === saved) return;
      st.textContent = 'Guardando…';
      try {
        const r = await API.put(`${lp}/note`, { body: ta.value, revision: rev });
        rev = r.revision; saved = r.body; st.textContent = 'Guardado';
      } catch (e) {
        if (e?.code === 'NOTE_CONFLICT') {
          rev = e.note?.revision || 0; saved = e.note?.body || '';
          st.textContent = 'La nota se cambió en otra pestaña. Copia tu texto si lo necesitas y recarga la página.';
        } else st.textContent = 'No se pudo guardar. Se reintentará al seguir escribiendo.';
      }
    };
    ta.addEventListener('input', () => { st.textContent = 'Sin guardar'; clearTimeout(saveT); saveT = setTimeout(save, 1200); });
    ta.addEventListener('blur', save);
    const warn = (e) => { if (ta.value !== saved) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    cleanup.push(() => { clearTimeout(saveT); save(); window.removeEventListener('beforeunload', warn); });

    // Enlace directo a una sección (#ac-discussion desde el correo al tutor, etc.).
    if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView({ block: 'start' }); }
  }

  /* Esquema: idea central + ramas numeradas plegables (StudyResources.tsx). */
  function mindMapHtml(map) {
    const br = Array.isArray(map.branches) ? map.branches : [];
    return `<div class="ac-mm">
      <div class="ac-mm__head"><div class="ac-mm__center"><strong>${esc(map.center || '')}</strong>${map.lead ? `<span>${esc(map.lead)}</span>` : ''}</div>
        <button type="button" class="ac-linklike" data-mm-all>Cerrar todas las ramas</button></div>
      <ol class="ac-mm__branches">${br.map((b, i) => `<li class="ac-mm__branch">
        <button type="button" class="ac-mm__title" aria-expanded="true" aria-controls="ac-mm-${i}"><span class="ac-mm__num">${i + 1}</span>
          <span>${esc(b.title)}</span><span class="ac-mm__chev" aria-hidden="true">−</span></button>
        <ul class="ac-mm__ideas" id="ac-mm-${i}">${(b.ideas || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></li>`).join('')}</ol></div>`;
  }
  function wireMindMap(scope) {
    const mm = scope.querySelector('.ac-mm');
    if (!mm) return;
    const btns = [...mm.querySelectorAll('.ac-mm__title')];
    const set = (b, open) => {
      b.setAttribute('aria-expanded', String(open));
      b.querySelector('.ac-mm__chev').textContent = open ? '−' : '+';
      document.getElementById(b.getAttribute('aria-controls')).hidden = !open;
    };
    const syncAll = () => { mm.querySelector('[data-mm-all]').textContent = btns.every(b => b.getAttribute('aria-expanded') === 'true') ? 'Cerrar todas las ramas' : 'Abrir todas las ramas'; };
    btns.forEach(b => b.addEventListener('click', () => { set(b, b.getAttribute('aria-expanded') !== 'true'); syncAll(); }));
    mm.querySelector('[data-mm-all]').addEventListener('click', () => {
      const all = btns.every(b => b.getAttribute('aria-expanded') === 'true');
      btns.forEach(b => set(b, !all)); syncAll();
    });
  }

  /* Infografía: imagen + <dialog> para ampliarla + descarga. */
  function infographicHtml(img) {
    const dims = img.width && img.height ? ` width="${Number(img.width)}" height="${Number(img.height)}"` : '';
    return `<div class="ac-info">
      <button type="button" class="ac-info__open" data-info-open aria-label="Ampliar la infografía">
        <img src="${esc(img.src)}" alt="${esc(img.alt || 'Infografía de la lección')}"${dims} loading="lazy">
        <span class="ac-info__zoom" aria-hidden="true">${ms('zoom_in')} Toca para ampliar</span></button>
      <p class="ac-info__actions"><a href="${esc(img.src)}" download>${ms('download')} Descargar la infografía</a></p>
      <dialog class="ac-info__dialog" aria-label="Infografía ampliada">
        <button type="button" class="ac-info__close" data-info-close aria-label="Cerrar">${ms('close')}</button>
        <div class="ac-info__scroll"><img src="${esc(img.src)}" alt="${esc(img.alt || 'Infografía de la lección')}"${dims}></div>
      </dialog></div>`;
  }
  function wireInfographic(scope) {
    const dlg = scope.querySelector('.ac-info__dialog');
    if (!dlg) return;
    scope.querySelector('[data-info-open]').addEventListener('click', () => dlg.showModal());
    scope.querySelector('[data-info-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  restoreSession().then(render);
})();
