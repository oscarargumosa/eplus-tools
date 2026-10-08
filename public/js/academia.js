/* ═══════════════════════════════════════════════════════════════
   Academia — cliente. Rutas (history API):
     /academia                      catálogo
     /academia/<curso>              ficha del curso con el temario
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
    const back = document.getElementById('topbar-cta-back');
    const acct = document.getElementById('topbar-cta-account');
    if (user && acct) {
      back.style.display = 'none';
      acct.style.display = '';
      document.getElementById('topbar-user-name').textContent = (user.name || user.email || '').split(' ')[0];
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
    try {
      if (!parts.length) await viewCatalog();
      else if (parts.length === 1) await viewCourse(parts[0]);
      else await viewLesson(parts[0], parts[1]);
    } catch (e) {
      if (e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_ENROLLED') {
        root.innerHTML = `<div class="ac-wrap">${loginBox(e.code === 'NOT_ENROLLED' ? 'No estás matriculado en este curso.' : null)}</div>`;
        wireLogin();
      } else {
        root.innerHTML = `<div class="ac-wrap"><div class="ac-empty"><p>${errMsg(e)}</p>
          <a class="ac-btn ac-btn--ghost" href="/academia" data-nav>Volver a la Academia</a></div></div>`;
      }
    }
  }

  /* ── catálogo ───────────────────────────────────────────────── */
  async function viewCatalog() {
    document.title = 'Academia — EU Funding Studio';
    const courses = await API.get('/academia/courses');
    const lead = courses[0];
    const card = (c) => {
      const pct = c.enrolled && c.lessons ? Math.round(100 * c.done / c.lessons) : 0;
      return `<a class="ac-course" href="/academia/${esc(c.slug)}" data-nav>
        ${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" loading="lazy" width="640" height="360">` : ''}
        <div class="ac-course__body">
          <div>${c.level ? `<span class="ac-pill">${esc(c.level)}</span>` : ''} ${c.status === 'draft' ? '<span class="ac-pill ac-pill--draft">Borrador</span>' : ''}</div>
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.subtitle || '')}</p>
          ${c.enrolled ? `<div class="ac-progress" aria-label="Progreso ${pct} %"><span style="width:${pct}%"></span></div>` : ''}
          <div class="ac-course__meta"><span>${c.modules} módulos · ${c.lessons} lecciones${c.hours ? ` · ${c.hours} h` : ''}</span>
            <span>${c.certificate ? 'Certificado obtenido' : c.enrolled ? `${c.done}/${c.lessons}` : ''}</span></div>
        </div></a>`;
    };
    root.innerHTML = `<div class="ac-wrap">
      <section class="ac-hero">
        <div>
          <h1>Academia EU Funding Studio</h1>
          <p>Cursos para entender Erasmus+ y diseñar proyectos con criterio, dentro de la misma plataforma en la que los escribes.</p>
          ${lead ? `<div class="ac-hero__actions"><a class="ac-btn ac-btn--primary" href="/academia/${esc(lead.slug)}" data-nav>${lead.enrolled ? 'Continuar' : 'Ver el curso'}</a></div>` : ''}
        </div>
        ${lead?.cover_url ? `<img src="${esc(lead.cover_url)}" alt="" width="640" height="400">` : ''}
      </section>
      <section class="ac-section">
        <h2>Cursos</h2>
        ${courses.length ? `<div class="ac-courses">${courses.map(card).join('')}</div>`
          : '<div class="ac-empty">Todavía no hay cursos publicados.</div>'}
      </section></div>`;
  }

  /* ── ficha del curso ────────────────────────────────────────── */
  async function viewCourse(slug) {
    const c = await API.get(`/academia/courses/${encodeURIComponent(slug)}`);
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
            ${c.enrolled ? `<span class="ac-note-info" style="color:#cfd0ea">${done} de ${total} lecciones completadas</span>` : ''}</div>
        </div>
        ${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" width="640" height="400">` : ''}
      </section>
      ${!user ? loginBox() : ''}
      ${c.certificate ? `<div class="ac-cert">${ms('workspace_premium')}<div><b>Has completado el curso.</b><br>
        <a href="/academia/certificado/${esc(c.certificate.serial)}" target="_blank" rel="noopener">Ver tu certificado (${esc(c.certificate.serial)})</a></div></div>` : ''}
      <section class="ac-section">
        <h2>Temario</h2>
        <div class="ac-modules">
          ${c.modules.map((m, i) => {
            const md = m.lessons.filter(l => l.state === 'done').length;
            return `<details class="ac-module"${i === 0 || m.lessons.some(l => l.slug === c.next_lesson) ? ' open' : ''}>
              <summary><span class="ac-module__n">${m.number}</span>
                <span class="ac-module__t"><b>${esc(m.title)}</b><small>${m.lessons.length} lecciones${c.enrolled ? ` · ${md} completadas` : ''}</small></span>${ms('expand_more')}</summary>
              <ol>${m.lessons.map(l => `<li><a href="/academia/${esc(c.slug)}/${esc(l.slug)}" data-nav>
                ${dot(l.state)}<span>${esc(l.code)} · ${esc(l.title)}</span><small>${l.minutes ? `${l.minutes} min de vídeo` : ''}</small></a></li>`).join('')}</ol>
            </details>`;
          }).join('')}
        </div>
      </section></div>`;
    wireLogin();
    $('#ac-enroll')?.addEventListener('click', async () => {
      try { await API.post(`/academia/courses/${encodeURIComponent(c.slug)}/enroll`); go(`/academia/${c.slug}/${first.slug}`); }
      catch (e) { alert(e?.message || 'No se pudo hacer la matrícula'); }
    });
  }

  /* ── aula ───────────────────────────────────────────────────── */
  async function viewLesson(courseSlug, lessonSlug) {
    if (!user) throw { code: 'UNAUTHORIZED' };
    const base = `/academia/courses/${encodeURIComponent(courseSlug)}`;
    const lp = `${base}/lessons/${encodeURIComponent(lessonSlug)}`;
    const [d, course] = await Promise.all([API.get(lp), API.get(base)]);
    const L = d.lesson;
    let phases = d.phases;
    let attempt = null, answers = [], qi = 0;   // test en curso
    document.title = `${L.code} · ${L.title} — Academia`;

    root.innerHTML = `<div class="ac-lesson">
      <aside class="ac-syl" id="ac-syl" aria-label="Temario">
        <a class="ac-syl__course" href="/academia/${esc(course.slug)}" data-nav>${esc(course.title)}</a>
        ${course.modules.map(m => `<h4>Módulo ${m.number} · ${esc(m.title)}</h4>
          ${m.lessons.map(l => `<a class="l${l.slug === L.slug ? ' is-current' : ''}" data-slug="${esc(l.slug)}" href="/academia/${esc(course.slug)}/${esc(l.slug)}" data-nav
            aria-label="${esc(l.code)} ${esc(l.title)}, ${stateLabel[l.state]}">${dot(l.state)}<span>${esc(l.code)} · ${esc(l.title)}</span></a>`).join('')}`).join('')}
      </aside>
      <div class="ac-main">
        <div>
          <p class="ac-crumb"><a href="/academia/${esc(course.slug)}" data-nav>${esc(course.title)}</a> / Módulo ${d.module.number} · ${esc(d.module.title)}</p>
          <button class="ac-btn ac-btn--ghost ac-syl__toggle" id="ac-syl-toggle" style="margin-top:8px">${ms('menu_book')} Temario</button>
          <div class="ac-title"><h1>${esc(L.code)} · ${esc(L.title)}</h1>${L.idea ? `<p>${esc(L.idea)}</p>` : ''}</div>
        </div>
        <div class="ac-phases" id="ac-phases"></div>
        ${L.video_url ? `<div class="ac-video"><video id="ac-video" controls preload="metadata" playsinline
            src="${esc(L.video_url)}" ${L.video_poster ? `poster="${esc(L.video_poster)}"` : ''}></video></div>` : ''}
        <section class="ac-card" id="ac-reading">
          <h2>${ms('auto_stories')} Lectura <small id="ac-reading-hint"></small></h2>
          <div class="ac-deck" id="ac-deck" tabindex="0"></div>
          <div class="ac-res">
            ${L.pdf_url ? `<a class="ac-btn ac-btn--ghost" href="${esc(L.pdf_url)}" target="_blank" rel="noopener">${ms('picture_as_pdf')} Dossier en PDF</a>` : ''}
          </div>
          ${L.guide_ref ? `<p class="ac-note-info" style="margin:14px 0 0">Referencia en la Guía del Programa: ${esc(L.guide_ref)}</p>` : ''}
        </section>
        <section class="ac-card" id="ac-test"></section>
        <section class="ac-card ac-notes">
          <h2>${ms('edit_note')} Mis notas <small>Solo las ves tú</small></h2>
          <textarea id="ac-note" placeholder="Escribe aquí lo que quieras recordar de esta lección">${esc(d.note.body)}</textarea>
          <div class="ac-notes__state" id="ac-note-state"></div>
        </section>
        <nav class="ac-pager" aria-label="Lecciones">
          ${d.prev ? `<a href="/academia/${esc(course.slug)}/${esc(d.prev.slug)}" data-nav><small>Anterior</small><b>${esc(d.prev.code)} · ${esc(d.prev.title)}</b></a>` : '<span></span>'}
          ${d.next ? `<a class="next" href="/academia/${esc(course.slug)}/${esc(d.next.slug)}" data-nav><small>Siguiente</small><b>${esc(d.next.code)} · ${esc(d.next.title)}</b></a>` : ''}
        </nav>
      </div></div>`;

    $('#ac-syl-toggle').addEventListener('click', () => $('#ac-syl').classList.toggle('is-open'));
    $('#ac-syl .is-current')?.scrollIntoView({ block: 'center' });

    const phase = async (body) => {
      phases = await API.post(`${lp}/phase`, body);
      paintPhases();
      return phases;
    };

    function paintPhases() {
      const p = phases;
      const item = (state, icon, title, sub, locked) => `<div class="ac-phase${locked ? ' ac-phase--locked' : ''}">${dot(state)}
        <div><b>${title}</b><small>${sub}</small></div></div>`;
      $('#ac-phases').innerHTML = [
        L.video_url ? item(p.videoSeen ? 'done' : 'pending', 'play_circle', 'Ver el vídeo', p.videoSeen ? 'Visto' : `${Math.round((L.video_seconds || 0) / 60)} min · hasta el final`) : '',
        item(p.readingDone ? 'done' : p.slides.reached >= 0 ? 'in_progress' : 'pending', 'auto_stories', 'Leer',
          p.readingDone ? 'Lectura terminada' : `${Math.max(0, p.slides.reached + 1)} de ${p.slides.total} hojas`),
        item(p.testPassed ? 'done' : 'pending', 'quiz', 'Hacer el test',
          p.testPassed ? `Aprobado · ${p.bestScore} %` : p.testUnlocked ? `Abierto · aprobado con ${p.passingScore} %` : 'Se abre con el vídeo o la lectura', !p.testUnlocked),
      ].join('');
      const cur = $(`#ac-syl a[data-slug="${CSS.escape(L.slug)}"] .ac-dot`);
      if (cur) cur.className = `ac-dot ac-dot--${p.testPassed ? 'done' : 'in_progress'}`;
      paintTestIdle();
    }

    phase({ action: 'start' }).catch(() => paintPhases());

    /* vídeo: muestras de los últimos 31 s, seguidas; un salto empieza una cadena nueva */
    const video = $('#ac-video');
    if (video && !phases.videoSeen) {
      const dur = L.video_seconds;
      let watchId = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
      let lastTo = null, lastSent = 0, sending = false;
      const send = async (force) => {
        if (phases.videoSeen || sending) return;
        const t = video.currentTime;
        if (!dur || t < dur - 31) return;
        if (!force && Date.now() - lastSent < 2000) return;
        const from = lastTo ?? t;
        lastSent = Date.now(); sending = true;
        try { await phase({ action: 'video', watchId, from, to: t }); lastTo = t; } catch { /* reintenta en la siguiente */ }
        finally { sending = false; }
      };
      const onSeek = () => { watchId = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2); lastTo = null; };
      const onTime = () => send(false);
      const onPause = () => send(true);
      video.addEventListener('timeupdate', onTime);
      video.addEventListener('seeking', onSeek);
      video.addEventListener('pause', onPause);
      video.addEventListener('ended', onPause);
      cleanup.push(() => { video.pause(); });
    }

    /* lectura por hojas */
    const slides = [{ cover: true }];
    for (const s of L.reading) for (const p of s.paragraphs) slides.push({ heading: s.heading, html: p });
    let idx = phases.readingDone ? 0 : Math.max(0, phases.slides.reached);
    let timerEnd = 0;          // ms epoch en que se puede pasar de la hoja frontera
    let timerRaf = null;
    let finishing = false;     // evita pedir «lectura terminada» dos veces a la vez

    function slideHtml(i) {
      const s = slides[i];
      if (s.cover) {
        return `<div class="ac-deck__cover"><div class="ac-deck__kicker">Lección ${esc(L.code)}</div><h3>${esc(L.title)}</h3><dl>
          ${L.idea ? `<div><dt>La idea</dt><dd>${esc(L.idea)}</dd></div>` : ''}
          ${L.goal ? `<div><dt>Al terminar podrás</dt><dd>${esc(L.goal)}</dd></div>` : ''}
          ${L.why ? `<div><dt>Por qué importa</dt><dd>${esc(L.why)}</dd></div>` : ''}</dl></div>`;
      }
      return `<div class="ac-deck__kicker">${esc(s.heading || L.title)}</div><div class="ac-deck__text">${s.html}</div>`;
    }

    function paintDeck() {
      const p = phases;
      const frontier = !p.readingDone && idx === p.slides.reached;
      const waiting = frontier && Date.now() < timerEnd;
      const last = idx === slides.length - 1;
      $('#ac-deck').innerHTML = `<div class="ac-deck__stage ac-fade">${slideHtml(idx)}</div>
        <div class="ac-deck__bar">
          <button class="ac-btn ac-btn--ghost" id="ac-prev" ${idx === 0 ? 'disabled' : ''} aria-label="Hoja anterior">${ms('chevron_left')}</button>
          <span class="ac-deck__count">Hoja ${idx + 1} de ${slides.length}</span>
          <div class="ac-progress"><span style="width:${Math.round(100 * (Math.max(p.slides.reached, idx) + 1) / slides.length)}%"></span></div>
          ${waiting ? `<svg class="ac-timer" id="ac-timer" viewBox="0 0 30 30" role="img" aria-label="Tiempo mínimo de lectura">
              <circle class="t-bg" cx="15" cy="15" r="12"/><circle class="t-fg" cx="15" cy="15" r="12" stroke-dasharray="75.4" stroke-dashoffset="0"/>
              <text x="15" y="19" text-anchor="middle" id="ac-timer-n"></text></svg>` : ''}
          ${last && p.readingDone ? `<span class="ac-pill">Lectura terminada</span>`
            : last ? '' : `<button class="ac-btn ac-btn--primary" id="ac-next" ${waiting ? 'disabled' : ''}>Siguiente ${ms('chevron_right')}</button>`}
        </div>`;
      $('#ac-reading-hint').textContent = p.readingDone ? 'Terminada · puedes releerla cuando quieras' : 'Cada hoja necesita al menos 7 segundos';
      $('#ac-prev').onclick = () => { if (idx > 0) { idx -= 1; paintDeck(); } };
      const nx = $('#ac-next');
      if (nx) nx.onclick = advance;
      if (waiting) tick();
      else if (frontier && last && !finishing) { finishing = true; onTimerDone().finally(() => { finishing = false; }); }
    }

    function tick() {
      cancelAnimationFrame(timerRaf);
      const fg = $('#ac-timer .t-fg'), n = $('#ac-timer-n');
      if (!fg) return;
      const left = timerEnd - Date.now();
      if (left <= 0) { onTimerDone(); return; }
      fg.setAttribute('stroke-dashoffset', String(75.4 * (1 - left / SLIDE_MS)));
      n.textContent = String(Math.ceil(left / 1000));
      timerRaf = requestAnimationFrame(tick);
    }
    cleanup.push(() => cancelAnimationFrame(timerRaf));

    async function onTimerDone() {
      if (idx === slides.length - 1 && !phases.readingDone) {
        try { await phase({ action: 'read' }); }
        catch (e) { if (e?.waitMs) { timerEnd = Date.now() + e.waitMs; } else return; }
      }
      paintDeck();
    }

    async function advance() {
      if (idx < phases.slides.reached || phases.readingDone) { idx += 1; paintDeck(); return; }
      if (Date.now() < timerEnd) return;
      try {
        await phase({ action: 'slide', index: idx + 1 });
        idx += 1;
        timerEnd = Date.now() + SLIDE_MS;
      } catch (e) {
        if (e?.waitMs) timerEnd = Date.now() + e.waitMs;
      }
      paintDeck();
    }

    $('#ac-deck').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); if (idx < slides.length - 1) advance(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (idx > 0) { idx -= 1; paintDeck(); } }
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

    /* test */

    function paintTestIdle() {
      if (attempt) return;
      const p = phases, box = $('#ac-test');
      if (!L.questions) { box.innerHTML = `<h2>${ms('quiz')} Test</h2><p class="ac-note-info">Esta lección no tiene test.</p>`; return; }
      if (!p.testUnlocked) {
        box.innerHTML = `<h2>${ms('quiz')} Test de la lección</h2><div class="ac-lock">${ms('lock')}
          <p style="margin:0">Mira el vídeo hasta el final <b>o</b> termina la lectura para abrir el test.</p></div>`;
        return;
      }
      box.innerHTML = `<h2>${ms('quiz')} Test de la lección <small>${L.questions} preguntas · aprobado con ${p.passingScore} %</small></h2>
        ${p.testPassed ? `<div class="ac-result"><div class="ac-result__score">${p.bestScore} %</div><div><b>Aprobado.</b> Lección completada.<br>
          <span class="ac-note-info">Puedes repetirlo cuando quieras: cuenta tu mejor nota.</span></div></div>`
          : p.attempts ? `<p class="ac-note-info">Llevas ${p.attempts} ${p.attempts === 1 ? 'intento' : 'intentos'}. Tu mejor nota: ${p.bestScore} %.</p>` : ''}
        <div style="margin-top:16px"><button class="ac-btn ${p.testPassed ? 'ac-btn--ghost' : 'ac-btn--primary'}" id="ac-test-start">
          ${p.testPassed ? 'Repetir el test' : p.attempts ? 'Intentarlo de nuevo' : 'Empezar el test'}</button></div>
        <div id="ac-test-err"></div>`;
      $('#ac-test-start').onclick = startTest;
    }

    async function startTest() {
      try {
        attempt = await API.post(`${lp}/test`);
        answers = new Array(attempt.questions.length).fill(null); qi = 0;
        paintQuestion();
      } catch (e) {
        $('#ac-test-err').innerHTML = `<div class="ac-err" style="margin-top:12px">${errMsg(e)}</div>`;
      }
    }

    function paintQuestion() {
      const q = attempt.questions[qi], n = attempt.questions.length;
      const all = answers.every(a => a !== null);
      $('#ac-test').innerHTML = `<h2>${ms('quiz')} Test de la lección <small>Pregunta ${qi + 1} de ${n}</small></h2>
        <p class="ac-q">${esc(q.question)}</p>
        <div class="ac-opts" role="radiogroup">${q.options.map((o, i) => `<button class="ac-opt${answers[qi] === i ? ' is-chosen' : ''}" role="radio"
          aria-checked="${answers[qi] === i}" data-i="${i}"><span class="ac-opt__k">${'ABCDEF'[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
        <div class="ac-qnav">
          <button class="ac-btn ac-btn--ghost" id="ac-qprev" ${qi === 0 ? 'disabled' : ''}>${ms('chevron_left')} Anterior</button>
          <div class="ac-qdots" aria-hidden="true">${answers.map((a, i) => `<i class="${a !== null ? 'on' : ''}${i === qi ? ' cur' : ''}"></i>`).join('')}</div>
          ${qi < n - 1 ? `<button class="ac-btn ac-btn--ghost" id="ac-qnext">Siguiente ${ms('chevron_right')}</button>`
            : `<button class="ac-btn ac-btn--primary" id="ac-qsend" ${all ? '' : 'disabled'}>Entregar</button>`}
        </div>
        ${qi === n - 1 && !all ? '<p class="ac-note-info" style="margin:10px 0 0">Te faltan preguntas por responder.</p>' : ''}
        <div id="ac-test-err"></div>`;
      $('#ac-test').querySelectorAll('.ac-opt').forEach(b => b.onclick = () => {
        answers[qi] = Number(b.dataset.i);
        if (qi < n - 1) { qi += 1; } paintQuestion();
      });
      $('#ac-qprev').onclick = () => { qi -= 1; paintQuestion(); };
      const nx = $('#ac-qnext'); if (nx) nx.onclick = () => { qi += 1; paintQuestion(); };
      const sd = $('#ac-qsend'); if (sd) sd.onclick = submitTest;
    }

    async function submitTest() {
      try {
        const r = await API.post(`${lp}/test/submit`, { attemptId: attempt.attemptId, answers });
        attempt = null;
        phases = await API.post(`${lp}/phase`, { action: 'start' });
        paintPhases();
        $('#ac-test').innerHTML = `<h2>${ms('quiz')} Resultado</h2>
          <div class="ac-result${r.passed ? '' : ' ac-result--fail'}"><div class="ac-result__score">${r.score} %</div>
            <div><b>${r.passed ? 'Aprobado.' : 'Todavía no.'}</b> ${r.right} de ${r.total} correctas (se aprueba con ${r.passingScore} %).
            ${r.certificate ? `<br><a href="/academia/certificado/${esc(r.certificate)}" target="_blank" rel="noopener">Has terminado el curso: ver tu certificado</a>` : ''}</div></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
            ${r.passed && d.next ? `<a class="ac-btn ac-btn--primary" href="/academia/${esc(course.slug)}/${esc(d.next.slug)}" data-nav>Siguiente lección</a>` : ''}
            <button class="ac-btn ${r.passed ? 'ac-btn--ghost' : 'ac-btn--primary'}" id="ac-test-start">${r.passed ? 'Repetir el test' : 'Intentarlo de nuevo'}</button></div>
          <div class="ac-review">${r.review.map((q, i) => `<div class="ac-review__item">
            <b>${i + 1}. ${esc(q.question)}</b>
            <p class="${q.chosen === q.correct ? 'ac-review__ok' : 'ac-review__ko'}">${q.chosen === q.correct ? 'Correcta' : 'Incorrecta'}: ${esc(q.options[q.chosen])}</p>
            ${q.feedback ? `<p class="ac-review__fb">${esc(q.feedback)}</p>` : ''}
            ${q.chosen !== q.correct ? `<p class="ac-review__right"><b>Respuesta correcta:</b> ${esc(q.options[q.correct])}</p>${q.correctFeedback ? `<p class="ac-review__fb">${esc(q.correctFeedback)}</p>` : ''}` : ''}
          </div>`).join('')}</div>`;
        $('#ac-test-start').onclick = startTest;
        $('#ac-test').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        $('#ac-test-err').innerHTML = `<div class="ac-err" style="margin-top:12px">${errMsg(e)}</div>`;
      }
    }

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
  }

  restoreSession().then(render);
})();
