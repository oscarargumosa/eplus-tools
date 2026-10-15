/* ═══════════════════════════════════════════════════════════════
   Fase beta cerrada — áreas por persona (oct-2026)
   ─────────────────────────────────────────────────────────────
   Proyectos y Academia solo para quien el admin autoriza (servidor:
   node/src/utils/areas.js y requireArea → 403 AREA_REQUIRED).
   Aquí: la pantalla/modal «Fase beta» con «Solicitar acceso», las
   etiquetas «Beta» con candado en el menú, y el aviso «Ya tienes
   acceso a …» (una sola vez). Lo usan index.html y academia.html.
   ═══════════════════════════════════════════════════════════════ */

const BetaAccess = (() => {
  // Etiquetas y textos por área (las claves = utils/areas.js).
  const AREAS = {
    proyectos: {
      label: 'Proyectos',
      what:  'Diseñar, escribir, presupuestar, diagnosticar y evaluar tus proyectos, además de tus documentos y tu investigación.',
      home:  '/#my-projects',
    },
    academia: {
      label: 'Academia',
      what:  'Cursos, lecciones, tests y certificados.',
      home:  '/academia',
    },
  };

  // Rutas de la SPA (hash) que pertenecen a un área.
  const ROUTE_AREAS = {
    'dashboard': 'proyectos', 'my-projects': 'proyectos', 'my-evaluations': 'proyectos',
    'import-proposal': 'proyectos', 'create': 'proyectos', 'intake': 'proyectos',
    'developer': 'proyectos', 'master': 'proyectos', 'diagnose': 'proyectos',
    'evaluator': 'proyectos', 'calculator': 'proyectos', 'budget': 'proyectos',
    'planner': 'proyectos', 'partners': 'proyectos',
    'my-documents': 'proyectos', 'research': 'proyectos',
  };

  const LOCK = '<svg class="beta-lock" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V6z"/></svg>';

  let user = null;
  let requestsCache = null;   // { area → { status, created_at } }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = (area) => (AREAS[area] && AREAS[area].label) || area;

  function fmtDate(d) {
    try { return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return ''; }
  }

  /* ── Estado ─────────────────────────────────────────────────── */
  function setUser(u) {
    user = u || null;
    requestsCache = null;
    decorate();
  }
  function has(area) {
    if (!area) return true;
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Array.isArray(user.areas) && user.areas.includes(area);
  }
  function areaForRoute(route) { return ROUTE_AREAS[route] || null; }
  function blockedArea(route) {
    const a = areaForRoute(route);
    return a && !has(a) ? a : null;
  }

  /* ── Etiquetas «Beta» con candado ───────────────────────────── */
  function tagHtml() { return `<span class="beta-tag">${LOCK}Beta</span>`; }

  function decorate() {
    if (!user) return;
    // Barra lateral de la SPA
    document.querySelectorAll('.nav-link[data-route]').forEach(a => {
      const area = areaForRoute(a.dataset.route);
      const locked = !!area && !has(area);
      const tag = a.querySelector('.beta-tag');
      if (locked && !tag) {
        // El texto suelto del enlace, en un span que puede partirse en dos líneas.
        [...a.childNodes].forEach(n => {
          if (n.nodeType === 3 && n.textContent.trim()) {
            const span = document.createElement('span');
            span.className = 'beta-label';
            span.textContent = n.textContent.trim();
            a.replaceChild(span, n);
          }
        });
        a.insertAdjacentHTML('beforeend', tagHtml());
        a.classList.add('beta-locked');
      } else if (!locked && tag) {
        tag.remove();
        a.classList.remove('beta-locked');
      }
    });
    // Botones y enlaces marcados a mano con data-beta-area
    document.querySelectorAll('[data-beta-area]').forEach(el => {
      const locked = !has(el.dataset.betaArea);
      const tag = el.querySelector('.beta-tag');
      if (locked && !tag) el.insertAdjacentHTML('beforeend', tagHtml());
      else if (!locked && tag) tag.remove();
    });
    // Menú superior (lo pinta topbar.js)
    if (window.EfsTopbar) window.EfsTopbar.markAreas(user.role === 'admin' ? Object.keys(AREAS) : (user.areas || []));
  }

  /* ── Solicitudes de la persona ──────────────────────────────── */
  async function loadRequests() {
    if (requestsCache) return requestsCache;
    const out = {};
    try {
      const d = await API.get('/access-requests/mine');
      (d.requests || []).forEach(r => { out[r.area] = r; });
    } catch { /* sin datos: se enseña el formulario */ }
    requestsCache = out;
    return out;
  }

  /* ── Pantalla «Fase beta» ───────────────────────────────────── */
  function cardHtml(area, { modal = false } = {}) {
    const a = AREAS[area] || { label: area, what: '' };
    const titleId = `beta-title-${area}-${modal ? 'm' : 'p'}`;
    return `
      <div class="beta-card" ${modal ? `role="dialog" aria-modal="true" aria-labelledby="${titleId}"` : ''}>
        ${modal ? '<button type="button" class="beta-close" aria-label="Cerrar">&times;</button>' : ''}
        <span class="beta-eyebrow">${LOCK}Fase beta</span>
        <h2 id="${titleId}" class="beta-title">Fase beta. ${esc(a.label)} está abierta solo a clientes seleccionados.</h2>
        <p class="beta-text">${esc(a.what)} Estamos abriéndolo poco a poco para acompañar bien a cada cliente.</p>
        <div class="beta-body" data-beta-body>
          <p class="beta-text beta-muted">Cargando…</p>
        </div>
        <p class="beta-foot">Mientras tanto ya puedes usar
          <a href="/#my-org">Entidades</a>, <a href="/#convocatorias">Convocatorias</a>,
          <a href="/#movilidades">Movilidades</a>, <a href="/#eu-vision">EU Vision</a> y
          <a href="/recursos/">Recursos</a>.</p>
      </div>`;
  }

  function pendingHtml(r) {
    return `<div class="beta-status" role="status">
      <strong>Solicitud enviada el ${esc(fmtDate(r.created_at))}.</strong>
      Te escribiremos en cuanto tengas acceso.</div>`;
  }

  function formHtml(area) {
    const id = `beta-msg-${area}-${Math.random().toString(36).slice(2, 7)}`;
    return `<form class="beta-form" novalidate>
        <label for="${id}" class="beta-label">Cuéntanos tu proyecto <span class="beta-muted">(opcional)</span></label>
        <textarea id="${id}" name="message" maxlength="500" rows="3"
          placeholder="Por ejemplo: somos una asociación juvenil y preparamos un KA2 para la próxima convocatoria."></textarea>
        <div class="beta-error" role="alert" hidden></div>
        <button type="submit" class="beta-btn">Solicitar acceso</button>
      </form>
      <div class="beta-status" role="status" hidden></div>`;
  }

  async function fillBody(root, area) {
    const body = root.querySelector('[data-beta-body]');
    if (!body) return;
    const reqs = await loadRequests();
    const r = reqs[area];
    if (r && r.status === 'pending') { body.innerHTML = pendingHtml(r); return; }
    body.innerHTML = formHtml(area);
    const form = body.querySelector('form');
    const status = body.querySelector('.beta-status');
    const error = body.querySelector('.beta-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      btn.disabled = true;
      error.hidden = true;
      try {
        const d = await API.post('/access-requests', { area, message: form.message.value });
        requestsCache = null;
        form.remove();
        status.hidden = false;
        status.innerHTML = d.already
          ? `<strong>Solicitud enviada el ${esc(fmtDate(d.request && d.request.created_at))}.</strong> Te escribiremos en cuanto tengas acceso.`
          : '<strong>Solicitud recibida.</strong> Te escribiremos en cuanto tengas acceso.';
      } catch (err) {
        btn.disabled = false;
        error.hidden = false;
        error.textContent = err && err.code === 'ALREADY_GRANTED'
          ? 'Ya tienes acceso. Recarga la página para entrar.'
          : (err && err.message) || 'No se pudo enviar la solicitud. Prueba de nuevo.';
      }
    });
  }

  // Pantalla dentro de un contenedor (panel de la SPA o la academia).
  function renderInto(el, area) {
    if (!el) return;
    el.innerHTML = `<div class="beta-screen">${cardHtml(area)}</div>`;
    fillBody(el, area);
  }

  // Modal (botones como «Llevar a Diseñar» o una respuesta AREA_REQUIRED).
  let openModalEl = null;
  function open(area) {
    if (!AREAS[area]) return;
    if (openModalEl) return;
    const lastFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'beta-modal';
    wrap.innerHTML = cardHtml(area, { modal: true });
    document.body.appendChild(wrap);
    openModalEl = wrap;
    const close = () => {
      wrap.remove();
      openModalEl = null;
      document.removeEventListener('keydown', onKey);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('.beta-close').addEventListener('click', close);
    wrap.querySelectorAll('.beta-foot a').forEach(a => a.addEventListener('click', close));
    wrap.querySelector('.beta-close').focus();
    fillBody(wrap, area);
  }

  // Comprueba antes de una acción: true si puede; si no, abre el modal.
  function guard(area) {
    if (has(area)) return true;
    open(area);
    return false;
  }

  /* ── Aviso «Ya tienes acceso a …» (una sola vez) ────────────── */
  function showGranted() {
    const fresh = (user && Array.isArray(user.areas_new) ? user.areas_new : []).filter(a => AREAS[a]);
    if (!fresh.length) return;
    const names = fresh.map(label);
    const text = names.length > 1 ? names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1] : names[0];
    const box = document.createElement('div');
    box.className = 'beta-granted';
    box.setAttribute('role', 'status');
    box.innerHTML = `<div><strong>Ya tienes acceso a ${esc(text)}.</strong>
      <span>Gracias por probar EU Funding Studio en esta fase beta.</span></div>
      <button type="button" aria-label="Cerrar">&times;</button>`;
    box.querySelector('button').addEventListener('click', () => box.remove());
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 15000);
    user.areas_new = [];
    API.post('/access-requests/seen', { areas: fresh }).catch(() => {});
  }

  // Cualquier respuesta AREA_REQUIRED de la API (api.js) abre el modal.
  window.addEventListener('area:required', (e) => {
    const area = e.detail && e.detail.area;
    if (!user || !AREAS[area]) return;
    // Tras el turno: si quien llamó ya pintó la pantalla beta, no hace falta el modal.
    setTimeout(() => {
      if (document.querySelector('.beta-screen')?.offsetParent) return;
      open(area);
    }, 0);
  });

  return { AREAS, setUser, has, areaForRoute, blockedArea, decorate, renderInto, open, guard, showGranted, label };
})();
