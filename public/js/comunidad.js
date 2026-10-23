/* ═══════════════════════════════════════════════════════════════
   Comunidad — cliente (history API). Ver comunidad.html y docs/COMUNIDAD.md.
   El servidor (/v1/community) decide qué se ve: perfiles visibles,
   ubicaciones según audiencia y precisión, mensajes y grupos. Aquí solo
   se pinta lo que llega; todo el texto de otras personas pasa por esc().
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const root = document.getElementById('cm-root');
  const live = document.getElementById('cm-live');
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';   // mismo mapa que el Atlas de Entidades
  let user = null;        // /auth/me
  let me = null;          // /community/me (perfil propio, contadores, catálogo)
  let cleanup = [];

  /* ── utilidades ─────────────────────────────────────────────── */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ms = (name) => `<span class="ms" aria-hidden="true">${name}</span>`;
  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => Array.from(el.querySelectorAll(sel));
  const say = (t) => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };
  const later = (fn, t) => { const id = setTimeout(fn, t); cleanup.push(() => clearTimeout(id)); return id; };
  const go = (path) => { history.pushState({}, '', path); render(); window.scrollTo(0, 0); };
  const errText = (e) => (e && e.message) || 'Algo ha fallado. Vuelve a intentarlo.';
  const label = (list, key) => ((me.catalog[list] || []).find(x => x.key === key) || {}).label || key;
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  function ago(d) {
    const t = new Date(d).getTime();
    if (!t) return '';
    const s = Math.round((t - Date.now()) / 1000);
    const a = Math.abs(s);
    if (a < 60) return 'ahora';
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
    return new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const linkHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  // Bandera en PNG servida por Studio (los emoji de bandera salen como letras en Windows).
  const flag = (code) => /^[A-Z]{2}$/.test(code || '')
    ? `<img class="cm-flag" src="/img/banderas/${code.toLowerCase()}.png" srcset="/img/banderas/${code.toLowerCase()}@2x.png 2x" width="20" height="15" alt="" loading="lazy">`
    : '';
  const NO_ORG = 'Sin entidad';

  // Avatar: foto → logo de la entidad → iniciales. Si la imagen falla, iniciales.
  function av(p, size = '') {
    const cls = `cm-av ${size ? 'cm-av--' + size : ''} ${p.avatar_source === 'organization' ? 'is-logo' : ''}`;
    if (!p.avatar_url) return `<span class="${cls}" aria-hidden="true">${esc(p.initials || '?')}</span>`;
    return `<span class="${cls}" aria-hidden="true" data-initials="${esc(p.initials || '?')}"><img src="${esc(p.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback></span>`;
  }
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-fallback')) return;
    const box = img.parentNode;
    box.classList.remove('is-logo');
    box.textContent = box.dataset.initials || '?';
  }, true);

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
    if (user && typeof BetaAccess !== 'undefined') { BetaAccess.setUser(user); BetaAccess.showGranted(); }
    const back = document.getElementById('topbar-cta-back');
    const acct = document.getElementById('topbar-cta-account');
    if (user && acct) {
      back.style.display = 'none';
      acct.style.display = '';
      document.getElementById('topbar-user-name').textContent = (user.name || '').split(' ')[0] || 'Mi cuenta';
      if (window.EfsAvatar) EfsAvatar.paintAll(user);
    }
  }

  /* ── cabecera de la comunidad ───────────────────────────────── */
  const TABS = [
    ['personas', '/comunidad', 'Personas y mapa', 'diversity_3', 'Personas'],
    ['conversaciones', '/comunidad/conversaciones', 'Conversaciones', 'forum', 'Conversaciones'],
    ['grupos', '/comunidad/grupos', 'Grupos', 'groups', 'Grupos'],
    ['actividad', '/comunidad/actividad', 'Mi actividad', 'notifications', 'Actividad'],
  ];
  function shell(tab) {
    const n = (me.counts.requests || 0) + (me.counts.unread || 0);
    root.innerHTML = `
      <div class="cm-head"><div class="cm-head__inner">
        <div class="cm-head__row">
          <div><h1>Comunidad</h1>
            <p>Personas y entidades que preparan proyectos europeos: encuentra socios, pregunta y comparte lo que aprendes.</p></div>
          <a class="cm-btn cm-btn--ghost cm-btn--sm" href="/comunidad/perfil" data-nav>${ms('badge')}Mi perfil</a>
        </div>
        <nav class="cm-tabs" aria-label="Comunidad">
          ${TABS.map(([k, href, txt, icon, short]) => `<a class="cm-tab ${k === tab ? 'is-on' : ''}" href="${href}" data-nav ${k === tab ? 'aria-current="page"' : ''}>
            ${ms(icon)}<span class="cm-tab__long">${txt}</span><span class="cm-tab__short">${short}</span>${k === 'actividad' && n ? ` <span class="cm-badge" aria-label="${n} pendientes">${n > 99 ? '99+' : n}</span>` : ''}</a>`).join('')}
        </nav>
      </div></div>
      <div class="cm-wrap cm-main" id="cm-view"></div>`;
    const on = $('.cm-tab.is-on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return $('#cm-view');
  }

  /* ── router ─────────────────────────────────────────────────── */
  async function render() {
    cleanup.forEach(fn => { try { fn(); } catch { /* nada */ } }); cleanup = [];
    const parts = location.pathname.replace(/\/+$/, '').split('/').slice(2).map(decodeURIComponent);
    if (!user) { location.replace('/entrar?volver=' + encodeURIComponent(location.pathname + location.search)); return; }
    if (typeof BetaAccess !== 'undefined' && !BetaAccess.has('comunidad')) { BetaAccess.renderInto(root, 'comunidad'); return; }
    try {
      me = await API.get('/community/me');
      const [a, b] = parts;
      if (!a) await viewHome();
      else if (a === 'personas' && b) await viewPerson(b);
      else if (a === 'perfil') await viewEditProfile();
      else if (a === 'conversaciones') await viewConversations(b);
      else if (a === 'grupos' && b) await viewGroup(b);
      else if (a === 'grupos') await viewGroups();
      else if (a === 'actividad') await viewActivity();
      else if (a === 'mensajes' && b) await viewMessages(b);
      else { history.replaceState({}, '', '/comunidad'); await viewHome(); }
    } catch (e) {
      if (e && e.code === 'AREA_REQUIRED' && typeof BetaAccess !== 'undefined') { BetaAccess.renderInto(root, 'comunidad'); return; }
      if (e && e.code === 'UNAUTHORIZED') { location.replace('/entrar?volver=' + encodeURIComponent(location.pathname)); return; }
      const view = me ? ($('#cm-view') || shell('')) : root;
      view.innerHTML = `<div class="cm-empty">${ms('error')}<p>${esc(errText(e))}</p>
        <a class="cm-btn cm-btn--ghost" href="/comunidad" data-nav>Volver a la comunidad</a></div>`;
    }
  }

  /* ── mapa (MapLibre + OpenFreeMap, sin claves ni coste) ─────── */
  function whenMapLib() {
    return new Promise((resolve, reject) => {
      let n = 0;
      (function wait() {
        if (window.maplibregl) return resolve(window.maplibregl);
        if (++n > 100) return reject(new Error('No se pudo cargar el mapa'));
        setTimeout(wait, 100);
      })();
    });
  }
  async function newMap(el, opts = {}) {
    const ml = await whenMapLib();
    const map = new ml.Map({ container: el, style: STYLE_URL, center: opts.center || [10, 49], zoom: opts.zoom ?? 3.2,
      attributionControl: { compact: true }, cooperativeGestures: !!opts.cooperative });
    map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
    if (opts.fullscreen) map.addControl(new ml.FullscreenControl(), 'top-left');
    map.on('error', (e) => console.warn('[mapa]', e && e.error && e.error.message));
    cleanup.push(() => map.remove());
    return map;
  }
  function pinEl(p) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cm-pin ${p.avatar_source === 'organization' ? 'is-logo' : ''} ${p.is_me ? 'is-me' : ''}`;
    b.setAttribute('aria-label', p.is_me ? 'Tu punto en el mapa' : `Ver a ${p.name}`);
    if (p.avatar_url) {
      const img = new Image();
      img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = p.avatar_url;
      img.onerror = () => { b.classList.remove('is-logo'); b.textContent = p.initials || '?'; };
      b.appendChild(img);
    } else b.textContent = p.initials || '?';
    return b;
  }
  function popupHtml(p) {
    return `<div class="cm-pop">${av(p, 'sm')}<div><b>${esc(p.name)}${p.is_me ? ' (tú)' : ''}</b>
      ${p.org ? `<small>${esc(p.org)}</small>` : ''}
      <small>${p.precision === 'exact' ? 'Ubicación exacta' : 'Ubicación aproximada'}${p.label ? ' · ' + esc(p.label) : ''}</small>
      <a href="/comunidad/personas/${encodeURIComponent(p.id)}" data-nav>Ver perfil</a></div></div>`;
  }

  /* Puntos agrupados: círculos para los grupos, avatares para cada persona. */
  async function peopleMap(el, points) {
    const ml = await whenMapLib();
    const map = await newMap(el, { fullscreen: true, cooperative: matchMedia('(max-width: 760px)').matches });
    const markers = new Map();
    const byId = new Map(points.map(p => [p.id, p]));
    let popup = null;
    const openPopup = (p) => {
      if (popup) popup.remove();
      popup = new ml.Popup({ offset: 22, maxWidth: '300px' }).setLngLat([p.lng, p.lat]).setHTML(popupHtml(p)).addTo(map);
    };
    map.on('load', () => {
      map.addSource('people', {
        type: 'geojson', cluster: true, clusterRadius: 48, clusterMaxZoom: 12,
        data: { type: 'FeatureCollection', features: points.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id } })) },
      });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'people', filter: ['has', 'point_count'],
        paint: { 'circle-color': '#3c45a3', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3,
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28] } });
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'people', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' } });
      map.on('click', 'clusters', async (e) => {
        const f = e.features[0];
        try {
          const z = await map.getSource('people').getClusterExpansionZoom(f.properties.cluster_id);
          map.easeTo({ center: f.geometry.coordinates, zoom: z });
        } catch { /* nada */ }
      });
      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
      const sync = () => {
        if (!map.getSource('people') || !map.isSourceLoaded('people')) return;
        const seen = new Set();
        for (const f of map.querySourceFeatures('people')) {
          if (f.properties.cluster) continue;
          const id = f.properties.id;
          if (seen.has(id)) continue;
          seen.add(id);
          if (!markers.has(id)) {
            const p = byId.get(id);
            const el2 = pinEl(p);
            el2.addEventListener('click', (ev) => { ev.stopPropagation(); openPopup(p); });
            markers.set(id, new ml.Marker({ element: el2 }).setLngLat([p.lng, p.lat]).addTo(map));
          }
        }
        for (const [id, mk] of markers) if (!seen.has(id)) { mk.remove(); markers.delete(id); }
      };
      map.on('sourcedata', (e) => { if (e.sourceId === 'people' && e.isSourceLoaded) sync(); });
      map.on('moveend', sync);
      if (points.length > 1) {
        const b = new ml.LngLatBounds();
        points.forEach(p => b.extend([p.lng, p.lat]));
        map.fitBounds(b, { padding: 60, maxZoom: 6, duration: 0 });
      } else if (points.length === 1) map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 6 });
    });
    return { map, highlight: (id, on) => { const mk = markers.get(id); if (mk) mk.getElement().classList.toggle('is-hot', on); } };
  }

  /* ── tarjeta de persona ─────────────────────────────────────── */
  function personCard(p) {
    const tags = [
      p.seeks_partners ? `<span class="cm-chip cm-chip--partner">${ms('person_search')}Busca socios</span>` : '',
      p.offers_partner ? `<span class="cm-chip cm-chip--lav">${ms('handshake')}Se ofrece como socio</span>` : '',
      ...p.roles.slice(0, 2).map(s => `<span class="cm-chip cm-chip--role">${esc(label('roles', s))}</span>`),
      ...p.sectors.slice(0, 2).map(s => `<span class="cm-chip">${esc(label('sectors', s))}</span>`),
      ...p.actions.slice(0, 1).map(s => `<span class="cm-chip">${esc(label('actions', s).split(' · ')[0])}</span>`),
    ].join('');
    const orgTxt = p.org ? p.org.name : (p.no_organization ? NO_ORG : '');
    return `<a class="cm-person" href="/comunidad/personas/${encodeURIComponent(p.id)}" data-nav data-person="${esc(p.id)}">
      <div class="cm-person__top">${av(p)}<div class="cm-person__who"><b>${esc(p.name)}${p.is_me ? ' (tú)' : ''}</b>
        ${p.headline ? `<small>${esc(p.headline)}</small>` : ''}</div></div>
      ${orgTxt || p.country_label ? `<div class="cm-person__org">${ms(p.org ? 'apartment' : 'person')}<span>${esc(orgTxt)}${orgTxt && p.country_label ? ' · ' : ''}${flag(p.country)}${esc(p.country_label || '')}</span></div>` : ''}
      ${tags ? `<div class="cm-chips">${tags}</div>` : ''}
    </a>`;
  }

  /* ═══ Portada: mapa + filtros + personas ═══════════════════════ */
  async function viewHome() {
    document.title = 'Comunidad — EU Funding Studio';
    const view = shell('personas');
    const qs = new URLSearchParams(location.search);
    const f = { q: qs.get('q') || '', role: qs.get('rol') || '', sector: qs.get('ambito') || '', action: qs.get('accion') || '', country: qs.get('pais') || '', seeks: qs.get('socios') === '1' };
    const p = me.profile;
    const nudge = !p.visible
      ? `<div class="cm-note"><p><b>Tu perfil aún no es visible.</b> Complétalo y decide si quieres aparecer en el directorio y en el mapa. Nadie lo verá hasta que lo actives.</p>
          <a class="cm-btn cm-btn--main" href="/comunidad/perfil" data-nav>Completar mi perfil</a></div>`
      : (!p.own_location ? `<div class="cm-note"><p><b>Aún no estás en el mapa.</b> Puedes situarte en tu ciudad o en la de tu entidad, con la precisión que quieras.</p>
          <a class="cm-btn cm-btn--ghost" href="/comunidad/perfil#ubicacion" data-nav>${ms('add_location')}Situarme</a></div>` : '');
    const opt = (list, cur, all) => `<option value="">${all}</option>` + me.catalog[list].map(o => `<option value="${esc(o.key)}" ${o.key === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    view.innerHTML = `${nudge}
      <form class="cm-filters" id="cm-filters" role="search" aria-label="Filtrar personas">
        <div class="cm-field cm-field--q"><label for="f-q">Buscar</label><input id="f-q" type="search" name="q" value="${esc(f.q)}" placeholder="Nombre, entidad, ciudad…" autocomplete="off"></div>
        <div class="cm-field"><label for="f-role">Rol</label><select id="f-role" name="role">${opt('roles', f.role, 'Todos')}</select></div>
        <div class="cm-field"><label for="f-sector">Ámbito</label><select id="f-sector" name="sector">${opt('sectors', f.sector, 'Todos')}</select></div>
        <div class="cm-field"><label for="f-action">Acción</label><select id="f-action" name="action">${opt('actions', f.action, 'Todas')}</select></div>
        <div class="cm-field"><label for="f-country">País</label><select id="f-country" name="country">${opt('countries', f.country, 'Todos')}</select></div>
        <label class="cm-check"><input type="checkbox" name="seeks" ${f.seeks ? 'checked' : ''}> Busca socios</label>
      </form>
      <div class="cm-map" id="cm-map" aria-label="Mapa de la comunidad"></div>
      <div class="cm-count"><h2 id="cm-count">Personas</h2><span id="cm-count-note"></span></div>
      <div class="cm-people" id="cm-people"><div class="cm-skel"></div><div class="cm-skel"></div><div class="cm-skel"></div></div>
      <div class="cm-more" id="cm-more-wrap" hidden><button class="cm-btn cm-btn--ghost" type="button" id="cm-more">Ver más personas</button></div>`;

    let mapApi = null;
    let shown = 24;
    let data = null;
    const form = $('#cm-filters');
    const read = () => ({ q: form.q.value.trim(), role: form.role.value, sector: form.sector.value, action: form.action.value, country: form.country.value, seeks: form.seeks.checked });

    function paintList() {
      const list = data.people;
      $('#cm-count').textContent = list.length === 1 ? '1 persona' : `${list.length} personas`;
      $('#cm-count-note').textContent = data.points.length ? `${data.points.length} en el mapa` : '';
      $('#cm-people').innerHTML = list.length
        ? list.slice(0, shown).map(personCard).join('')
        : `<div class="cm-empty" style="grid-column:1/-1">${ms('travel_explore')}<p>No hay nadie con estos filtros todavía.</p></div>`;
      $('#cm-more-wrap').hidden = list.length <= shown;
    }
    async function load() {
      const v = read();
      const params = new URLSearchParams();
      if (v.q) params.set('q', v.q);
      if (v.role) params.set('rol', v.role);
      if (v.sector) params.set('ambito', v.sector);
      if (v.action) params.set('accion', v.action);
      if (v.country) params.set('pais', v.country);
      if (v.seeks) params.set('socios', '1');
      history.replaceState({}, '', '/comunidad' + (params.toString() ? '?' + params : ''));
      const api = new URLSearchParams({ q: v.q, role: v.role, sector: v.sector, action: v.action, country: v.country, seeks: v.seeks ? '1' : '' });
      data = await API.get('/community/people?' + api);
      shown = 24;
      paintList();
      const mapEl = $('#cm-map');
      if (!mapEl) return;
      if (mapApi) { mapApi.map.remove(); mapApi = null; }
      mapEl.innerHTML = '';
      mapApi = await peopleMap(mapEl, data.points);
      if (!data.points.length) mapEl.insertAdjacentHTML('beforeend', '<p class="cm-map__note">Nadie comparte su ubicación con estos filtros.</p>');
    }
    let t = null;
    form.addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => load().catch(err => say(errText(err))), e.target.name === 'q' ? 350 : 0);
    });
    form.addEventListener('submit', (e) => e.preventDefault());
    $('#cm-more').addEventListener('click', () => { shown += 24; paintList(); });
    // Pasar por una tarjeta resalta su avatar en el mapa (solo identidad, nunca coordenadas nuevas).
    const peopleEl = $('#cm-people');
    peopleEl.addEventListener('mouseover', (e) => { const c = e.target.closest('[data-person]'); if (c && mapApi) mapApi.highlight(c.dataset.person, true); });
    peopleEl.addEventListener('mouseout', (e) => { const c = e.target.closest('[data-person]'); if (c && mapApi) mapApi.highlight(c.dataset.person, false); });
    await load();
  }

  /* ═══ Perfil de una persona ════════════════════════════════════ */
  async function viewPerson(id) {
    const view = shell('personas');
    view.innerHTML = '<div class="cm-skel"></div>';
    let p;
    try { p = await API.get('/community/people/' + encodeURIComponent(id)); }
    catch (e) {
      view.innerHTML = `<div class="cm-empty">${ms('visibility_off')}<p>${esc(errText(e))}</p><a class="cm-btn cm-btn--ghost" href="/comunidad" data-nav>Ver la comunidad</a></div>`;
      return;
    }
    document.title = `${p.name} — Comunidad — EU Funding Studio`;
    const chips = (list, keys, cls = '') => keys.length ? `<div class="cm-chips">${keys.map(k => `<span class="cm-chip ${cls}">${esc(label(list, k))}</span>`).join('')}</div>` : '<p class="cm-muted">—</p>';
    const c = p.connection;
    let actions = '';
    if (c.state === 'self') actions = `<a class="cm-btn cm-btn--main" href="/comunidad/perfil" data-nav>${ms('edit')}Editar mi perfil</a>
      ${p.visible ? '' : '<span class="cm-muted">Tu perfil está oculto: solo lo ves tú.</span>'}`;
    else if (c.state === 'none') actions = `<button class="cm-btn cm-btn--main" data-act="connect">${ms('person_add')}Conectar</button>
      <span class="cm-muted">Al conectar podréis escribiros en privado.</span>`;
    else if (c.state === 'pending_out') actions = `<span class="cm-chip cm-chip--lav">${ms('schedule')}Solicitud enviada</span>
      <button class="cm-btn cm-btn--quiet" data-act="remove" data-id="${c.id}">Retirar solicitud</button>`;
    else if (c.state === 'pending_in') actions = `${c.message ? `<p style="margin:0 0 6px;flex-basis:100%">«${esc(c.message)}»</p>` : ''}
      <button class="cm-btn cm-btn--main" data-act="accept" data-id="${c.id}">Aceptar conexión</button>
      <button class="cm-btn cm-btn--ghost" data-act="decline" data-id="${c.id}">Rechazar</button>`;
    else if (c.state === 'connected') actions = `<a class="cm-btn cm-btn--main" href="/comunidad/mensajes/${c.id}" data-nav>${ms('chat')}Escribir un mensaje</a>
      <span class="cm-chip cm-chip--lav">${ms('check')}Conectados</span>
      <button class="cm-btn cm-btn--quiet" data-act="remove" data-id="${c.id}" data-confirm="1">Eliminar conexión</button>`;

    view.innerHTML = `<a class="cm-back" href="/comunidad" data-nav>${ms('arrow_back')}Personas y mapa</a>
      <div class="cm-profile">
        <div>
          <section class="cm-card">
            <div class="cm-id">${av(p, 'lg')}<div><h1>${esc(p.name)}</h1>${p.headline ? `<p>${esc(p.headline)}</p>` : ''}
              ${p.country_label || (p.location && p.location.label) ? `<p class="cm-muted cm-where">${ms('location_on')} ${esc(p.location && p.location.label ? p.location.label + (p.country_label ? ', ' : '') : '')}${flag(p.country)}${esc(p.country_label || '')}</p>` : ''}</div></div>
            ${!p.org && p.no_organization ? `<div class="cm-org"><span class="cm-av" aria-hidden="true">${ms('person')}</span><div><b>${NO_ORG}</b><small>No pertenece a ninguna entidad</small></div></div>` : ''}
            ${p.org ? `<div class="cm-org">${av({ avatar_url: p.org.logo_url, avatar_source: 'organization', initials: p.org.name.slice(0, 2).toUpperCase() })}
              <div><b>${esc(p.org.name)}${p.org.verified ? `<span class="cm-verified" title="Entidad verificada por el equipo de EU Funding Studio">${ms('verified')}Verificada</span>` : ''}</b>
              ${p.org.city ? `<small>${esc(p.org.city)}</small>` : ''}</div></div>` : ''}
            ${p.seeks_partners || p.offers_partner ? `<div class="cm-chips" style="margin-top:16px">
              ${p.seeks_partners ? `<span class="cm-chip cm-chip--partner">${ms('person_search')}Busca socios</span>` : ''}
              ${p.offers_partner ? `<span class="cm-chip cm-chip--lav">${ms('handshake')}Se ofrece como socio</span>` : ''}</div>` : ''}
            ${p.bio ? `<p class="cm-bio">${esc(p.bio)}</p>` : ''}
            <div class="cm-actions" style="margin-top:20px" id="cm-conn">${actions}</div>
            <div id="cm-conn-msg"></div>
          </section>
          <section class="cm-card">
            <h2>Aportaciones recientes</h2>
            ${p.recent_posts.length ? `<ul class="cm-list">${p.recent_posts.map(x => `<li><a href="/comunidad/conversaciones/${x.id}" data-nav><b>${esc(x.title || x.excerpt.slice(0, 80))}</b></a>
              <div class="cm-muted">${esc(x.topic_label || '')} · ${esc(ago(x.created_at))}</div></li>`).join('')}</ul>` : '<p class="cm-muted">Todavía no ha publicado en las conversaciones.</p>'}
          </section>
        </div>
        <aside>
          <section class="cm-card">
            <h2>Trabaja en</h2>
            <h3>Roles</h3>${chips('roles', p.roles, 'cm-chip--role')}
            <h3>Ámbitos</h3>${chips('sectors', p.sectors)}
            <h3>Acciones que le interesan</h3>${chips('actions', p.actions)}
          </section>
          ${p.location ? `<section class="cm-card"><h2>Dónde está</h2><div class="cm-map cm-map--sm" id="cm-pmap"></div>
            <p class="cm-muted" style="margin:8px 0 0">${p.location.precision === 'exact' ? 'Ubicación exacta' : 'Ubicación aproximada (unos 1-2 km)'}</p></section>` : ''}
        </aside>
      </div>`;

    if (p.location) {
      newMap($('#cm-pmap'), { center: [p.location.lng, p.location.lat], zoom: p.location.precision === 'exact' ? 11 : 9, cooperative: true }).then(map => {
        map.on('load', () => new maplibregl.Marker({ element: pinEl({ ...p, is_me: p.is_me }) }).setLngLat([p.location.lng, p.location.lat]).addTo(map));
      }).catch(() => {});
    }

    $('#cm-conn').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (b.dataset.confirm && !confirm('¿Eliminar la conexión? Se borrarán también vuestros mensajes privados, para las dos personas.')) return;
      b.disabled = true;
      try {
        if (act === 'connect') {
          const msg = prompt('Si quieres, añade una nota breve para presentarte (opcional):', '') ;
          if (msg === null) { b.disabled = false; return; }
          await API.post('/community/connections', { to: p.id, message: msg });
          say('Solicitud enviada');
        } else if (act === 'accept') { await API.post(`/community/connections/${b.dataset.id}/accept`); say('Conexión aceptada'); }
        else if (act === 'decline') { await API.post(`/community/connections/${b.dataset.id}/decline`); say('Solicitud rechazada'); }
        else if (act === 'remove') { await API.del(`/community/connections/${b.dataset.id}`); say('Hecho'); }
        render();
      } catch (err) {
        b.disabled = false;
        $('#cm-conn-msg').innerHTML = `<div class="cm-err" style="margin-top:12px">${esc(errText(err))}</div>`;
      }
    });
  }

  /* ═══ Editar mi perfil ═════════════════════════════════════════ */
  async function viewEditProfile() {
    document.title = 'Mi perfil — Comunidad — EU Funding Studio';
    const view = shell('');
    const p = me.profile;
    const orgs = me.orgs;
    const checks = (name, list, sel) => `<div class="cm-pick">${me.catalog[list].map(o => `<label class="cm-check"><input type="checkbox" name="${name}" value="${esc(o.key)}" ${sel.includes(o.key) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}</div>`;
    const radio = (name, val, cur, txt, extra = '') => `<label class="cm-check"><input type="radio" name="${name}" value="${val}" ${val === cur ? 'checked' : ''} ${extra}> ${txt}</label>`;
    const mode0 = p.own_location ? (p.location_source || 'manual') : 'none';
    const orgSel = p.organization_id || '';
    view.innerHTML = `<div class="cm-narrow">
      <a class="cm-back" href="/comunidad" data-nav>${ms('arrow_back')}Volver a la comunidad</a>
      <form class="cm-form" id="cm-pf" novalidate>
        <section class="cm-card">
          <label class="cm-switch"><input type="checkbox" name="visible" ${p.visible ? 'checked' : ''}><span class="cm-switch__ui" aria-hidden="true"></span>
            <span><b>Mostrar mi perfil en la comunidad</b>
            <span class="cm-muted">Si lo desactivas, nadie lo ve (ni en el directorio ni en el mapa) y borramos la ubicación guardada. Puedes prepararlo antes de activarlo.
            Tus aportaciones en las conversaciones sí muestran tu nombre.</span></span></label>
        </section>
        <section class="cm-card">
          <h2>Sobre ti</h2>
          <p class="cm-muted">Tu nombre y tu foto son los de <a href="/#account-profile">Mi cuenta</a>. Nunca mostramos tu correo ni tu teléfono.</p>
          <div class="cm-row"><label class="cm-label" for="pf-headline">Cargo</label>
            <input id="pf-headline" type="text" name="headline" maxlength="120" value="${esc(p.headline || '')}" placeholder="Por ejemplo: coordinadora de proyectos europeos"></div>
          <div class="cm-row"><label class="cm-label" for="pf-bio">Presentación breve</label>
            <textarea id="pf-bio" name="bio" rows="4" maxlength="700" placeholder="Qué hace tu entidad, qué proyectos has preparado, qué buscas en la comunidad.">${esc(p.bio || '')}</textarea></div>
        </section>
        <section class="cm-card">
          <h2>Tu entidad</h2>
          <label class="cm-check cm-noorg" style="margin:0 0 12px"><input type="checkbox" name="no_organization" ${p.no_organization ? 'checked' : ''}> No pertenezco a ninguna entidad</label>
          ${orgs.length ? `<div id="pf-org-box"><p class="cm-muted">Se muestra su nombre, su logo y si está verificada. Viene de <a href="/#account-org">Mi entidad</a>.</p>
            <div class="cm-row"><label class="cm-label" for="pf-org">Entidad</label><select id="pf-org" name="organization_id">
              <option value="">No mostrar ninguna</option>${orgs.map(o => `<option value="${esc(o.id)}" ${o.id === orgSel ? 'selected' : ''}>${esc(o.name)}${o.verified ? ' (verificada)' : ''}</option>`).join('')}</select></div></div>`
          : `<p class="cm-muted" id="pf-org-box">Aún no tienes ninguna entidad. Puedes añadirla o reclamarla en <a href="/#account-org">Mi entidad</a>; después aparecerá aquí.</p>`}
          <div class="cm-grid2"><div><label class="cm-label" for="pf-country">País</label><div class="cm-flag-pick"><span id="pf-flag">${flag(p.country)}</span><select id="pf-country" name="country"><option value="">—</option>
            ${me.catalog.countries.map(c => `<option value="${c.key}" ${c.key === p.country ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div></div></div>
        </section>
        <section class="cm-card">
          <h2>En qué trabajas</h2>
          <h3 class="cm-label">Roles</h3>${checks('roles', 'roles', p.roles)}
          <h3 class="cm-label" style="margin-top:16px">Ámbitos</h3>${checks('sectors', 'sectors', p.sectors)}
          <h3 class="cm-label" style="margin-top:16px">Acciones que te interesan</h3>${checks('actions', 'actions', p.actions)}
          <h3 class="cm-label" style="margin-top:16px">Socios</h3>
          <div class="cm-pick"><label class="cm-check"><input type="checkbox" name="seeks_partners" ${p.seeks_partners ? 'checked' : ''}> Busco socios</label>
            <label class="cm-check"><input type="checkbox" name="offers_partner" ${p.offers_partner ? 'checked' : ''}> Me ofrezco como socio</label></div>
        </section>
        <section class="cm-card" id="ubicacion">
          <h2>Tu lugar en el mapa</h2>
          <p class="cm-muted">Es voluntario. No usamos tu ubicación del navegador ni tu dirección: solo el punto que elijas.</p>
          <p class="cm-loc-hidden" id="pf-loc-hidden" hidden>${ms('visibility_off')} Tu perfil está oculto: puedes preparar tu punto, pero no saldrá en el mapa hasta que actives «Mostrar mi perfil en la comunidad».</p>
          <div class="cm-radios" id="pf-mode">
            ${radio('location_mode', 'none', mode0, 'No aparecer en el mapa')}
            ${radio('location_mode', 'organization', mode0, 'La ciudad de mi entidad')}
            ${radio('location_mode', 'manual', mode0, 'Marcar un punto')}
          </div>
          <p class="cm-muted" id="pf-orgloc-note" hidden style="margin:8px 0 0"></p>
          <div id="pf-manual" class="cm-row" hidden>
            <p class="cm-muted" style="margin:0 0 8px">Pulsa en el mapa para colocar la chincheta; después puedes arrastrarla.</p>
            <div class="cm-map cm-map--pick" id="pf-map"></div>
          </div>
          <div id="pf-loc-opts" class="cm-row">
            <label class="cm-label" for="pf-label">Ciudad o zona (se muestra junto al punto)</label>
            <input id="pf-label" type="text" name="location_label" maxlength="120" value="${esc(p.location_label || '')}" placeholder="Por ejemplo: Santander">
            <h3 class="cm-label" style="margin-top:14px">Precisión</h3>
            <div class="cm-radios">${radio('location_precision', 'approx', p.location_precision, 'Aproximada (redondeada a 1-2 km)')}${radio('location_precision', 'exact', p.location_precision, 'Exacta')}</div>
            <h3 class="cm-label" style="margin-top:14px">Quién la ve</h3>
            <div class="cm-radios">${radio('location_audience', 'members', p.location_audience, 'Todos los miembros')}${radio('location_audience', 'connections', p.location_audience, 'Solo mis conexiones')}${radio('location_audience', 'hidden', p.location_audience, 'Nadie')}</div>
          </div>
        </section>
        <div class="cm-savebar"><div id="pf-msg" role="status"></div>
          <a class="cm-btn cm-btn--ghost" href="/comunidad" data-nav>Cancelar</a>
          <button class="cm-btn cm-btn--main" type="submit">Guardar mi perfil</button></div>
      </form></div>`;

    const form = $('#cm-pf');
    let pick = p.own_location && p.location_source === 'manual' ? { ...p.own_location } : null;
    let pickMap = null, pickMarker = null;

    function orgLoc() {
      if (form.no_organization.checked) return null;
      return orgs.find(x => x.id === (form.organization_id ? form.organization_id.value : '')) || null;
    }
    // Chincheta roja como la de Google Maps; la punta (abajo) marca el punto.
    function redPin() {
      const el = document.createElement('div');
      el.setAttribute('aria-label', 'Tu punto en el mapa');
      el.innerHTML = `<svg class="cm-redpin" viewBox="0 0 30 42" aria-hidden="true"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 42 15 42s15-16.1 15-27.2C30 6.6 23.3 0 15 0z" fill="#EA4335"/><path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 42 15 42s15-16.1 15-27.2C30 6.6 23.3 0 15 0z" fill="none" stroke="#B31412" stroke-width="1.2"/><circle cx="15" cy="14.5" r="5.2" fill="#B31412"/></svg>`;
      return el;
    }
    async function ensurePickMap() {
      if (pickMap) { pickMap.resize(); return; }
      const center = pick ? [pick.lng, pick.lat] : [5, 47];
      pickMap = await newMap($('#pf-map'), { center, zoom: pick ? 9 : 3.4 });
      const place = (lngLat) => {
        pick = { lat: lngLat.lat, lng: lngLat.lng };
        if (!pickMarker) {
          pickMarker = new maplibregl.Marker({ element: redPin(), anchor: 'bottom', draggable: true }).setLngLat(lngLat).addTo(pickMap);
          pickMarker.on('dragend', () => { const l = pickMarker.getLngLat(); pick = { lat: l.lat, lng: l.lng }; });
        } else pickMarker.setLngLat(lngLat);
      };
      pickMap.on('load', () => { if (pick) place({ lng: pick.lng, lat: pick.lat }); });
      pickMap.on('click', (e) => place(e.lngLat));
    }
    function sync() {
      const visible = form.visible.checked;
      const mode = form.location_mode.value;
      const o = orgLoc();
      const orgRadio = form.querySelector('input[name=location_mode][value=organization]');
      orgRadio.disabled = !(o && o.has_location);
      const note = $('#pf-orgloc-note');
      const noOrg = form.no_organization.checked;
      $('#pf-org-box').hidden = noOrg;
      $('#pf-flag').innerHTML = flag(form.country.value);
      if (noOrg) { note.hidden = false; note.textContent = 'Sin entidad: marca tu punto en el mapa si quieres aparecer.'; }
      else if (!o) { note.hidden = false; note.textContent = 'Para usar la ciudad de tu entidad, elige antes tu entidad.'; }
      else if (!o.has_location) { note.hidden = false; note.textContent = 'Tu entidad aún no tiene ubicación en «Mi entidad». Puedes marcar un punto.'; }
      else note.hidden = true;
      if (orgRadio.disabled && mode === 'organization') form.querySelector('input[name=location_mode][value=manual]').checked = true;
      const m2 = form.location_mode.value;
      $('#pf-manual').hidden = m2 !== 'manual';
      $('#pf-loc-opts').hidden = m2 === 'none';
      if (m2 === 'manual') ensurePickMap().catch(() => {});
      // Antes se atenuaba toda la sección (opacity .6) y parecía que el mapa fallaba.
      $('#pf-loc-hidden').hidden = visible || m2 === 'none';
    }
    form.addEventListener('change', sync);
    sync();
    if (location.hash === '#ubicacion') later(() => $('#ubicacion').scrollIntoView({ block: 'start' }), 50);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('#pf-msg');
      const all = (n) => $$(`input[name=${n}]:checked`, form).map(i => i.value);
      const mode = form.location_mode.value;
      if (form.visible.checked && mode === 'manual' && !pick && form.location_audience.value !== 'hidden') {
        msg.className = 'cm-err'; msg.textContent = 'Pulsa en el mapa para marcar tu punto, o elige «No aparecer en el mapa».'; return;
      }
      const body = {
        visible: form.visible.checked, headline: form.headline.value, bio: form.bio.value,
        no_organization: form.no_organization.checked,
        organization_id: form.organization_id && !form.no_organization.checked ? form.organization_id.value : '', country: form.country.value,
        roles: all('roles'), sectors: all('sectors'), actions: all('actions'),
        seeks_partners: form.seeks_partners.checked, offers_partner: form.offers_partner.checked,
        location_mode: mode, lat: pick ? pick.lat : null, lng: pick ? pick.lng : null, location_label: form.location_label.value,
        location_precision: form.location_precision.value, location_audience: form.location_audience.value,
      };
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        me = await API.put('/community/me/profile', body);
        msg.className = 'cm-ok';
        msg.textContent = me.profile.visible ? 'Guardado. Tu perfil es visible en la comunidad.' : 'Guardado. Tu perfil sigue oculto: solo lo ves tú.';
        say(msg.textContent);
      } catch (err) {
        msg.className = 'cm-err'; msg.textContent = errText(err);
      } finally { btn.disabled = false; }
    });
  }

  /* ═══ Conversaciones (foro por temas) y grupos ═════════════════ */
  function postHtml(p, { reply = false } = {}) {
    const a = p.author;
    const who = a.profile_visible ? `<a href="/comunidad/personas/${encodeURIComponent(a.id)}" data-nav><b>${esc(a.name)}</b></a>` : `<b>${esc(a.name)}</b>`;
    const sub = [a.headline || a.org, ago(p.created_at)].filter(Boolean).join(' · ');
    const heartTitle = p.mine ? 'No puedes dar corazón a tu propia aportación' : (p.hearted ? 'Quitar corazón' : 'Dar corazón');
    return `<article class="${reply ? 'cm-reply' : 'cm-post'}" data-post="${p.id}">
      <div class="cm-post__head">${av(a, 'sm')}<div class="cm-post__meta">${who}${!reply && p.topic_label ? ` <span class="cm-chip cm-chip--lav" style="margin-left:4px">${esc(p.topic_label)}</span>` : ''}<small>${esc(sub)}</small></div>
        ${menuHtml(p)}</div>
      ${p.title ? `<h3>${esc(p.title)}</h3>` : ''}
      ${p.body ? `<p class="cm-post__body">${esc(p.body)}</p>` : ''}
      ${p.link_url ? `<a class="cm-link" href="${esc(p.link_url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${ms('link')}<span>${esc(linkHost(p.link_url))}</span></a>` : ''}
      <div class="cm-post__bar">
        <button type="button" class="cm-heart" data-heart="${p.id}" aria-pressed="${p.hearted}" ${p.mine ? 'disabled' : ''} title="${heartTitle}" aria-label="${heartTitle}. ${p.hearts} corazones">
          ${ms('favorite')}<span>${p.hearts}</span></button>
        ${!reply ? `<button type="button" class="cm-btn cm-btn--quiet" data-reply-focus="${p.id}">${ms('reply')}Responder${p.replies && p.replies.length ? ` (${p.replies.length})` : ''}</button>` : ''}
      </div>
      <div data-report-slot></div>
      ${!reply ? `<div class="cm-replies" ${p.replies && p.replies.length ? '' : 'hidden'}>${(p.replies || []).map(r => postHtml(r, { reply: true })).join('')}</div>
        <form class="cm-replyform" data-reply="${p.id}"><label class="cm-sr" for="r-${p.id}">Tu respuesta</label>
          <textarea id="r-${p.id}" name="body" rows="1" maxlength="5000" placeholder="Escribe una respuesta…" required></textarea>
          <button class="cm-btn cm-btn--primary cm-btn--sm" type="submit">Responder</button></form>` : ''}
    </article>`;
  }
  function menuHtml(p) {
    const items = [];
    if (!p.mine) items.push(`<button type="button" role="menuitem" data-report="${p.id}">Denunciar al equipo</button>`);
    if (p.mine) items.push(`<button type="button" role="menuitem" data-remove="${p.id}">Retirar mi aportación</button>`);
    else if (p.can_moderate) items.push(`<button type="button" role="menuitem" data-remove="${p.id}">Ocultar (equipo)</button>`);
    return `<div class="cm-menu"><button type="button" class="cm-btn cm-btn--quiet" data-menu aria-haspopup="menu" aria-expanded="false" aria-label="Más opciones">${ms('more_horiz')}</button>
      <div class="cm-menu__list" role="menu" hidden>${items.join('')}</div></div>`;
  }

  /* Lista + acciones. `scope`: { topic } o { group }. */
  function mountFeed(el, scope) {
    let before = null;
    async function load(more) {
      const q = new URLSearchParams();
      if (scope.group) q.set('group', scope.group);
      if (scope.topic) q.set('topic', scope.topic);
      if (more && before) q.set('before', before);
      const d = await API.get('/community/posts?' + q);
      const html = d.posts.map(p => postHtml(p)).join('');
      if (!more) el.innerHTML = html || `<div class="cm-empty">${ms('forum')}<p>Todavía no hay aportaciones aquí. ¿Empiezas tú?</p></div>`;
      else el.insertAdjacentHTML('beforeend', html);
      before = d.posts.length ? d.posts[d.posts.length - 1].id : before;
      let btn = el.parentNode.querySelector('[data-more]');
      if (d.more && !btn) {
        el.insertAdjacentHTML('afterend', '<div class="cm-more"><button class="cm-btn cm-btn--ghost" type="button" data-more>Ver más</button></div>');
        btn = el.parentNode.querySelector('[data-more]');
        btn.addEventListener('click', () => load(true).catch(e => say(errText(e))));
      } else if (!d.more && btn) btn.parentNode.remove();
    }
    function closeMenus(except) {
      $$('.cm-menu__list', el).forEach(m => { if (m !== except) { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); } });
    }
    const onDoc = (e) => { if (!e.target.closest('.cm-menu')) closeMenus(); };
    document.addEventListener('click', onDoc);
    cleanup.push(() => document.removeEventListener('click', onDoc));

    el.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.hasAttribute('data-menu')) {
        const list = t.nextElementSibling;
        closeMenus(list);
        list.hidden = !list.hidden;
        t.setAttribute('aria-expanded', String(!list.hidden));
        if (!list.hidden) list.querySelector('button')?.focus();
        return;
      }
      if (t.dataset.heart) {
        if (t.disabled) return;
        try {
          const r = await API.post(`/community/posts/${t.dataset.heart}/heart`);
          t.setAttribute('aria-pressed', String(r.hearted));
          t.querySelector('span:last-child').textContent = r.hearts;
          t.title = r.hearted ? 'Quitar corazón' : 'Dar corazón';
          t.setAttribute('aria-label', `${t.title}. ${r.hearts} corazones`);
        } catch (err) { say(errText(err)); }
        return;
      }
      if (t.dataset.replyFocus) { el.querySelector(`#r-${t.dataset.replyFocus}`)?.focus(); return; }
      if (t.dataset.remove) {
        closeMenus();
        if (!confirm('¿Retirar esta aportación? Dejará de verse en la comunidad.')) return;
        try {
          await API.del(`/community/posts/${t.dataset.remove}`);
          const art = el.querySelector(`[data-post="${t.dataset.remove}"]`);
          if (art) art.remove();
          say('Aportación retirada');
        } catch (err) { say(errText(err)); }
        return;
      }
      if (t.dataset.report) {
        closeMenus();
        const art = el.querySelector(`[data-post="${t.dataset.report}"]`);
        const slot = art.querySelector(':scope > [data-report-slot]');
        slot.innerHTML = `<form class="cm-report" data-report-form="${t.dataset.report}">
          <label class="cm-label" for="rep-${t.dataset.report}">¿Qué problema ves? Solo lo lee el equipo de EU Funding Studio.</label>
          <textarea id="rep-${t.dataset.report}" name="reason" rows="2" maxlength="500"></textarea>
          <div class="cm-composer__foot"><button type="button" class="cm-btn cm-btn--quiet cm-btn--sm" data-report-cancel>Cancelar</button>
          <button class="cm-btn cm-btn--primary cm-btn--sm" type="submit">Enviar denuncia</button></div></form>`;
        slot.querySelector('textarea').focus();
        return;
      }
      if (t.hasAttribute('data-report-cancel')) { t.closest('[data-report-slot]').innerHTML = ''; }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { const open = $$('.cm-menu__list:not([hidden])', el)[0]; if (open) { closeMenus(); open.previousElementSibling.focus(); } }
    });
    el.addEventListener('submit', async (e) => {
      const f = e.target;
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      if (f.dataset.reply) {
        const body = f.body.value.trim();
        if (!body) return;
        btn.disabled = true;
        try {
          const thread = await API.post('/community/posts', { parent_id: Number(f.dataset.reply), body });
          const last = thread.replies[thread.replies.length - 1];
          const box = f.parentNode.querySelector('.cm-replies');
          box.hidden = false;
          box.insertAdjacentHTML('beforeend', postHtml(last, { reply: true }));
          f.body.value = '';
          say('Respuesta publicada');
        } catch (err) { say(errText(err)); alert(errText(err)); }
        finally { btn.disabled = false; }
      } else if (f.dataset.reportForm) {
        btn.disabled = true;
        try {
          await API.post(`/community/posts/${f.dataset.reportForm}/report`, { reason: f.reason.value });
          f.outerHTML = '<div class="cm-ok" style="margin-top:10px">Gracias. El equipo lo revisará; la otra persona no sabe quién lo ha enviado.</div>';
        } catch (err) { btn.disabled = false; say(errText(err)); }
      }
    });
    return { load, prepend: (p) => { const empty = el.querySelector('.cm-empty'); if (empty) empty.remove(); el.insertAdjacentHTML('afterbegin', postHtml(p)); } };
  }

  function composerHtml({ group = false, topic = '' } = {}) {
    const topics = me.catalog.topics;
    const cur = topics.find(t => t.key === topic) || topics[0];
    return `<div class="cm-composer" id="cm-composer">
      <button type="button" class="cm-composer__open" id="cm-compose-open">${av(me.profile, 'sm')}<span>${group ? 'Escribe al grupo…' : 'Comparte una pregunta, un recurso o una búsqueda de socios…'}</span></button>
      <form id="cm-compose" hidden novalidate>
        ${group ? '' : `<div class="cm-grid2"><div><label class="cm-label" for="c-topic">Tema</label><select id="c-topic" name="topic">
          ${topics.map(t => `<option value="${t.key}" ${t.key === cur.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div></div>
          <p class="cm-composer__ask" id="c-ask">${esc(cur.ask)}</p>`}
        <div><label class="cm-label" for="c-title">Título <span class="cm-muted">(opcional)</span></label><input id="c-title" type="text" name="title" maxlength="160"></div>
        <div><label class="cm-label" for="c-body">Texto</label><textarea id="c-body" name="body" rows="4" maxlength="5000"></textarea></div>
        <div><label class="cm-label" for="c-link">Enlace <span class="cm-muted" id="c-link-hint">${!group && cur.link_required ? '(obligatorio en Recursos)' : '(opcional)'}</span></label>
          <input id="c-link" type="url" name="link_url" maxlength="500" placeholder="https://…" inputmode="url"></div>
        <div id="c-err" class="cm-err" hidden></div>
        <div class="cm-composer__foot"><button type="button" class="cm-btn cm-btn--quiet" id="cm-compose-cancel">Cancelar</button>
          <button type="submit" class="cm-btn cm-btn--main">Publicar</button></div>
      </form></div>`;
  }
  function wireComposer({ group = null, feed }) {
    const open = $('#cm-compose-open'), form = $('#cm-compose');
    open.addEventListener('click', () => { open.hidden = true; form.hidden = false; form.body.focus(); });
    $('#cm-compose-cancel').addEventListener('click', () => { form.hidden = true; open.hidden = false; $('#c-err').hidden = true; });
    if (form.topic) form.topic.addEventListener('change', () => {
      const t = me.catalog.topics.find(x => x.key === form.topic.value);
      $('#c-ask').textContent = t.ask;
      $('#c-link-hint').textContent = t.link_required ? '(obligatorio en Recursos)' : '(opcional)';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#c-err');
      err.hidden = true;
      const body = { title: form.title.value, body: form.body.value, link_url: form.link_url.value };
      if (group) body.group_id = group; else body.topic = form.topic.value;
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const p = await API.post('/community/posts', body);
        feed.prepend(p);
        form.reset();
        if (form.topic) form.topic.dispatchEvent(new Event('change'));
        form.hidden = true; open.hidden = false;
        say('Aportación publicada');
      } catch (e2) {
        // El formulario conserva lo escrito ante un error.
        err.textContent = errText(e2); err.hidden = false;
      } finally { btn.disabled = false; }
    });
  }

  async function viewConversations(postId) {
    document.title = 'Conversaciones — Comunidad — EU Funding Studio';
    const view = shell('conversaciones');
    if (postId) {
      view.innerHTML = `<div class="cm-narrow"><a class="cm-back" href="/comunidad/conversaciones" data-nav>${ms('arrow_back')}Todas las conversaciones</a><div class="cm-posts" id="cm-feed"></div></div>`;
      const p = await API.get('/community/posts/' + encodeURIComponent(postId));
      if (p.group_id) { history.replaceState({}, '', `/comunidad/grupos/${p.group_id}`); return viewGroup(p.group_id); }
      const feed = mountFeed($('#cm-feed'), {});
      $('#cm-feed').innerHTML = postHtml(p);
      void feed;
      return;
    }
    const topic = new URLSearchParams(location.search).get('tema') || '';
    const topics = me.catalog.topics;
    view.innerHTML = `<div class="cm-narrow">
      <nav class="cm-topics" aria-label="Temas">
        <a class="cm-topic ${!topic ? 'is-on' : ''}" href="/comunidad/conversaciones" data-nav ${!topic ? 'aria-current="page"' : ''}>Todas</a>
        ${topics.map(t => `<a class="cm-topic ${t.key === topic ? 'is-on' : ''}" href="/comunidad/conversaciones?tema=${t.key}" data-nav ${t.key === topic ? 'aria-current="page"' : ''}>${esc(t.label)}</a>`).join('')}
      </nav>
      ${composerHtml({ topic })}
      <div class="cm-posts" id="cm-feed"><div class="cm-skel"></div><div class="cm-skel"></div></div></div>`;
    const feed = mountFeed($('#cm-feed'), { topic: topics.some(t => t.key === topic) ? topic : '' });
    wireComposer({ feed });
    await feed.load(false);
  }

  async function viewGroups() {
    document.title = 'Grupos — Comunidad — EU Funding Studio';
    const view = shell('grupos');
    const gs = await API.get('/community/groups');
    view.innerHTML = `<p class="cm-muted" style="margin:0 0 16px;max-width:70ch">Los grupos los abre el equipo de EU Funding Studio por acción o sector. Sus conversaciones solo las leen y escriben quienes se unen.</p>
      ${gs.length ? `<div class="cm-groups">${gs.map(g => `<article class="cm-group">
        <h2><a href="/comunidad/grupos/${g.id}" data-nav style="text-decoration:none">${esc(g.name)}</a></h2>
        ${g.description ? `<p>${esc(g.description)}</p>` : ''}
        <div class="cm-group__foot"><span class="cm-muted">${g.members} ${g.members === 1 ? 'miembro' : 'miembros'}${g.last_post_at ? ' · activo ' + esc(ago(g.last_post_at)) : ''}</span>
          ${g.is_member ? `<a class="cm-btn cm-btn--primary cm-btn--sm" href="/comunidad/grupos/${g.id}" data-nav>Entrar</a>`
            : `<button class="cm-btn cm-btn--ghost cm-btn--sm" data-join="${g.id}">Unirme</button>`}</div></article>`).join('')}</div>`
      : `<div class="cm-empty">${ms('groups')}<p>Todavía no hay grupos abiertos.</p></div>`}`;
    view.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-join]');
      if (!b) return;
      b.disabled = true;
      try { await API.post(`/community/groups/${b.dataset.join}/join`); go(`/comunidad/grupos/${b.dataset.join}`); }
      catch (err) { b.disabled = false; say(errText(err)); }
    });
  }

  async function viewGroup(id) {
    const view = shell('grupos');
    const g = await API.get('/community/groups/' + encodeURIComponent(id));
    document.title = `${g.name} — Comunidad — EU Funding Studio`;
    view.innerHTML = `<div class="cm-narrow">
      <a class="cm-back" href="/comunidad/grupos" data-nav>${ms('arrow_back')}Grupos</a>
      <section class="cm-card" style="margin-bottom:18px">
        <h1 style="font-size:24px">${esc(g.name)}</h1>
        ${g.description ? `<p style="margin:8px 0 0;max-width:65ch">${esc(g.description)}</p>` : ''}
        <div class="cm-actions" style="margin-top:14px"><span class="cm-muted">${g.members} ${g.members === 1 ? 'miembro' : 'miembros'}</span>
          ${g.is_member ? `<button class="cm-btn cm-btn--quiet cm-btn--sm" data-leave>Salir del grupo</button>` : `<button class="cm-btn cm-btn--main" data-join>Unirme al grupo</button>`}</div>
      </section>
      ${g.is_member ? composerHtml({ group: true }) : ''}
      ${g.can_read ? `${!g.is_member ? '<p class="cm-ok" style="margin:0 0 14px">Ves este grupo como equipo, para moderar. Para escribir, únete.</p>' : ''}<div class="cm-posts" id="cm-feed"><div class="cm-skel"></div></div>`
        : `<div class="cm-empty">${ms('lock')}<p>Las conversaciones del grupo solo las leen y escriben sus miembros.</p></div>`}
    </div>`;
    view.querySelector('[data-join]')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await API.post(`/community/groups/${g.id}/join`); render(); } catch (err) { e.target.disabled = false; say(errText(err)); }
    });
    view.querySelector('[data-leave]')?.addEventListener('click', async (e) => {
      if (!confirm('¿Salir del grupo? Dejarás de ver sus conversaciones.')) return;
      try { await API.del(`/community/groups/${g.id}/join`); render(); } catch (err) { say(errText(err)); }
    });
    if (g.can_read) {
      const feed = mountFeed($('#cm-feed'), { group: g.id });
      if (g.is_member) wireComposer({ group: g.id, feed });
      await feed.load(false);
    }
  }

  /* ═══ Mi actividad: conexiones, solicitudes y conversaciones ═══ */
  function personRow(p, right = '') {
    const name = p.profile_visible ? `<a href="/comunidad/personas/${encodeURIComponent(p.id)}" data-nav><b>${esc(p.name)}</b></a>` : `<b>${esc(p.name)}</b>`;
    return `<div class="cm-row-person">${av(p, 'sm')}<div class="cm-row-person__txt">${name}<small>${esc(p.headline || p.org || '')}</small></div>${right}</div>`;
  }
  async function viewActivity() {
    document.title = 'Mi actividad — Comunidad — EU Funding Studio';
    const view = shell('actividad');
    const d = await API.get('/community/activity');
    view.innerHTML = `<div class="cm-act">
      <div>
        <section class="cm-card">
          <h2>Conversaciones privadas</h2>
          ${d.connections.length ? `<div>${d.connections.map(c => `<a class="cm-convo" href="/comunidad/mensajes/${c.id}" data-nav>
              ${av(c.person, 'sm')}<div class="cm-row-person__txt"><b>${esc(c.person.name)}</b>
              <small class="${c.unread ? 'cm-unread' : ''}">${c.last_message ? esc(c.last_message.body) : 'Aún no os habéis escrito'}</small></div>
              ${c.unread ? `<span class="cm-badge" aria-label="${c.unread} sin leer">${c.unread}</span>` : `<small class="cm-muted">${c.last_message ? esc(ago(c.last_message.at)) : ''}</small>`}</a>`).join('')}</div>`
          : `<p class="cm-muted">Cuando conectes con alguien podréis escribiros aquí. Busca personas en el <a href="/comunidad" data-nav>mapa</a>.</p>`}
        </section>
      </div>
      <div>
        <section class="cm-card">
          <h2>Solicitudes recibidas</h2>
          ${d.incoming.length ? `<ul class="cm-list">${d.incoming.map(r => `<li>${personRow(r.person)}
              ${r.message ? `<p style="margin:8px 0 0;font-size:14px">«${esc(r.message)}»</p>` : ''}
              <div class="cm-actions" style="margin-top:10px"><button class="cm-btn cm-btn--primary cm-btn--sm" data-accept="${r.id}">Aceptar</button>
              <button class="cm-btn cm-btn--ghost cm-btn--sm" data-decline="${r.id}">Rechazar</button></div></li>`).join('')}</ul>`
          : '<p class="cm-muted">No tienes solicitudes pendientes.</p>'}
        </section>
        <section class="cm-card">
          <h2>Mis conexiones</h2>
          ${d.connections.length ? `<ul class="cm-list">${d.connections.map(c => `<li>${personRow(c.person, `<button class="cm-btn cm-btn--quiet cm-btn--sm" data-remove="${c.id}" data-confirm="1">Eliminar</button>`)}</li>`).join('')}</ul>`
          : '<p class="cm-muted">Todavía no tienes conexiones.</p>'}
        </section>
        <section class="cm-card">
          <h2>Solicitudes enviadas</h2>
          ${d.outgoing.length ? `<ul class="cm-list">${d.outgoing.map(r => `<li>${personRow(r.person, `<button class="cm-btn cm-btn--quiet cm-btn--sm" data-remove="${r.id}">Retirar</button>`)}</li>`).join('')}</ul>`
          : '<p class="cm-muted">No tienes solicitudes esperando respuesta.</p>'}
        </section>
      </div></div>`;
    view.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.confirm && !confirm('¿Eliminar la conexión? Se borrarán también vuestros mensajes privados, para las dos personas.')) return;
      b.disabled = true;
      try {
        if (b.dataset.accept) await API.post(`/community/connections/${b.dataset.accept}/accept`);
        else if (b.dataset.decline) await API.post(`/community/connections/${b.dataset.decline}/decline`);
        else if (b.dataset.remove) await API.del(`/community/connections/${b.dataset.remove}`);
        render();
      } catch (err) { b.disabled = false; say(errText(err)); }
    });
  }

  /* ═══ Mensajes privados de una conexión ════════════════════════ */
  async function viewMessages(id) {
    const view = shell('actividad');
    const d = await API.get(`/community/connections/${encodeURIComponent(id)}/messages`);
    document.title = `Mensajes con ${d.person.name} — Comunidad — EU Funding Studio`;
    const msgHtml = (m) => `<div class="cm-msg ${m.mine ? 'cm-msg--me' : 'cm-msg--them'}" data-mid="${m.id}">${esc(m.body)}<small>${esc(ago(m.at))}</small></div>`;
    view.innerHTML = `<div class="cm-narrow">
      <a class="cm-back" href="/comunidad/actividad" data-nav>${ms('arrow_back')}Mi actividad</a>
      <section class="cm-chat" aria-label="Conversación privada con ${esc(d.person.name)}">
        <div class="cm-chat__head">${personRow(d.person)}<span class="cm-muted" style="font-size:12.5px">Solo la veis vosotros</span></div>
        <div class="cm-chat__log" id="cm-log" aria-live="polite">${d.messages.length ? d.messages.map(msgHtml).join('') : '<p class="cm-muted" style="margin:auto;text-align:center">Escribe el primer mensaje.</p>'}</div>
        <form class="cm-chat__form" id="cm-send"><label class="cm-sr" for="cm-msg">Tu mensaje</label>
          <textarea id="cm-msg" name="body" rows="1" maxlength="4000" placeholder="Escribe un mensaje…"></textarea>
          <button class="cm-btn cm-btn--main" type="submit">${ms('send')}Enviar</button></form>
      </section></div>`;
    const log = $('#cm-log');
    log.scrollTop = log.scrollHeight;
    let last = d.messages.length ? d.messages[d.messages.length - 1].id : 0;
    const form = $('#cm-send');
    form.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = form.body.value.trim();
      if (!body) return;
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const m = await API.post(`/community/connections/${d.connection_id}/messages`, { body });
        if (!last) log.innerHTML = '';
        log.insertAdjacentHTML('beforeend', msgHtml(m));
        last = m.id;
        form.body.value = '';
        log.scrollTop = log.scrollHeight;
      } catch (err) { say(errText(err)); alert(errText(err)); }
      finally { btn.disabled = false; form.body.focus(); }
    });
    // Sondeo suave mientras la conversación está abierta (no hay correos ni avisos externos).
    const poll = async () => {
      if (!document.hidden && document.body.contains(log)) {
        try {
          const n = await API.get(`/community/connections/${d.connection_id}/messages`);
          const fresh = n.messages.filter(m => m.id > last);
          if (fresh.length) {
            if (!last) log.innerHTML = '';
            log.insertAdjacentHTML('beforeend', fresh.map(msgHtml).join(''));
            last = fresh[fresh.length - 1].id;
            log.scrollTop = log.scrollHeight;
          }
        } catch (e) { if (e && e.code === 'NOT_FOUND') { log.insertAdjacentHTML('beforeend', '<p class="cm-err">Esta conexión ya no existe.</p>'); return; } }
      }
      later(poll, 15000);
    };
    later(poll, 15000);
  }

  /* ── arranque ───────────────────────────────────────────────── */
  restoreSession().then(render);
})();
