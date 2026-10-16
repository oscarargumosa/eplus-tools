/* ═══════════════════════════════════════════════════════════════
   Comunidad — sección del equipo (solo admin) — #admin-community
   Denuncias (ocultar la aportación o descartar), aportaciones
   recientes u ocultas (ocultar / volver a mostrar) y grupos (crear,
   editar, archivar). API: /v1/admin/community. Ver docs/COMUNIDAD.md.
   Pinta todo dentro de <section id="panel-admin-community">.
   ═══════════════════════════════════════════════════════════════ */

const AdminCommunity = (() => {
  const state = { tab: 'reports', reportStatus: 'open', postFilter: 'recent' };
  let bound = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (d) => { const dt = new Date(d); return isNaN(dt) ? '—' : dt.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const toast = (m, t) => { if (typeof Toast !== 'undefined') Toast.show(m, t); };
  const panel = () => document.getElementById('panel-admin-community');
  const where = (x) => x.group_name ? `Grupo «${esc(x.group_name)}»` : (x.topic_label ? `Tema ${esc(x.topic_label)}` : 'Respuesta');
  const btn = (act, id, txt, strong) => `<button type="button" data-act="${act}" data-id="${esc(id)}" class="px-4 py-1.5 rounded-full text-xs font-bold ${strong ? 'bg-primary text-white' : 'border border-outline-variant/60 text-on-surface-variant'}">${txt}</button>`;

  function shell() {
    const tab = (k, txt) => `<button type="button" data-tab="${k}" class="px-4 py-2 rounded-full text-sm font-semibold ${state.tab === k ? 'bg-primary text-white' : 'bg-white border border-outline-variant/40 text-primary'}">${txt}</button>`;
    panel().innerHTML = `<div class="max-w-6xl mx-auto py-8 px-4">
      <div class="mb-6">
        <h1 class="font-headline text-2xl font-extrabold text-primary tracking-tight">Comunidad</h1>
        <p class="text-sm text-on-surface-variant mt-1">Moderación y grupos. Las denuncias son privadas: la persona denunciada no sabe quién la envió. Los mensajes privados entre conexiones no se ven desde aquí. <a class="underline" href="/comunidad" target="_blank" rel="noopener">Abrir la comunidad</a></p>
      </div>
      <div class="flex flex-wrap gap-2 mb-5" role="tablist">${tab('reports', 'Denuncias')}${tab('posts', 'Aportaciones')}${tab('groups', 'Grupos')}</div>
      <div id="acm-body"><p class="py-8 text-center text-on-surface-variant text-sm">Cargando…</p></div>
    </div>`;
  }

  function setCount(n) {
    const el = document.getElementById('admin-community-count');
    if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n || '');
    el.classList.toggle('hidden', !n);
  }
  async function refreshCount() {
    try { const d = await API.get('/admin/community/pending-count'); setCount(d.count); } catch { /* sin contador */ }
  }

  function bind() {
    if (bound) return;
    bound = true;
    panel().addEventListener('click', onClick);
    panel().addEventListener('change', (e) => {
      if (e.target.id === 'acm-report-status') { state.reportStatus = e.target.value; load(); }
      if (e.target.id === 'acm-post-filter') { state.postFilter = e.target.value; load(); }
    });
    panel().addEventListener('submit', onSubmit);
  }

  function init() { shell(); bind(); load(); refreshCount(); }

  async function load() {
    const body = document.getElementById('acm-body');
    if (!body) return;
    body.innerHTML = '<p class="py-8 text-center text-on-surface-variant text-sm">Cargando…</p>';
    try {
      if (state.tab === 'reports') renderReports(await API.get('/admin/community/reports?status=' + state.reportStatus));
      else if (state.tab === 'posts') renderPosts(await API.get('/admin/community/posts?filter=' + state.postFilter));
      else renderGroups(await API.get('/admin/community/groups'));
    } catch (e) {
      body.innerHTML = `<p class="py-8 text-center text-error text-sm">${esc(e.message || 'No se pudo cargar')}</p>`;
    }
  }

  function postBox(x) {
    return `<div class="mt-2 p-3 rounded-lg bg-surface-container-low text-sm">
      ${x.title ? `<div class="font-bold text-primary">${esc(x.title)}</div>` : ''}
      <div class="whitespace-pre-wrap break-words">${esc(x.body)}</div>
      ${x.link_url ? `<div class="text-xs mt-1 break-all">Enlace: ${esc(x.link_url)}</div>` : ''}</div>`;
  }

  function renderReports(items) {
    const sel = `<div class="mb-4"><label for="acm-report-status" class="block text-xs font-semibold text-on-surface-variant mb-1">Mostrar</label>
      <select id="acm-report-status" class="border border-outline-variant/40 rounded-lg px-3 py-2 text-sm bg-white">
        <option value="open" ${state.reportStatus === 'open' ? 'selected' : ''}>Pendientes</option>
        <option value="hidden" ${state.reportStatus === 'hidden' ? 'selected' : ''}>Resueltas: aportación oculta</option>
        <option value="dismissed" ${state.reportStatus === 'dismissed' ? 'selected' : ''}>Descartadas</option></select></div>`;
    document.getElementById('acm-body').innerHTML = sel + (items.length ? `<div class="space-y-3">${items.map(r => `
      <article class="bg-white border border-outline-variant/30 rounded-xl p-4">
        <div class="text-xs text-on-surface-variant">${where(r)} · aportación de <b class="text-on-surface">${esc(r.author_name)}</b> · ${fmt(r.post_at)}</div>
        ${postBox(r)}
        <div class="text-xs text-on-surface-variant mt-2">Denuncia de <b class="text-on-surface">${esc(r.reporter_name)}</b> · ${fmt(r.created_at)}${r.reason ? ` · «${esc(r.reason)}»` : ' · sin motivo escrito'}</div>
        ${r.hidden ? `<div class="text-xs mt-1 text-on-surface-variant">La aportación ya está oculta (${r.hidden_by === 'author' ? 'la retiró su autor' : 'por el equipo'}).</div>` : ''}
        ${r.status === 'open' ? `<div class="flex flex-wrap gap-2 mt-3">${r.hidden ? '' : btn('report-hide', r.id, 'Ocultar la aportación', true)}${btn('report-dismiss', r.id, 'Descartar denuncia')}</div>` : ''}
      </article>`).join('')}</div>` : '<p class="py-8 text-center text-on-surface-variant text-sm">No hay denuncias con este filtro.</p>');
  }

  function renderPosts(items) {
    const sel = `<div class="mb-4"><label for="acm-post-filter" class="block text-xs font-semibold text-on-surface-variant mb-1">Mostrar</label>
      <select id="acm-post-filter" class="border border-outline-variant/40 rounded-lg px-3 py-2 text-sm bg-white">
        <option value="recent" ${state.postFilter === 'recent' ? 'selected' : ''}>Publicadas (las 100 últimas)</option>
        <option value="hidden" ${state.postFilter === 'hidden' ? 'selected' : ''}>Ocultas o retiradas</option></select></div>`;
    document.getElementById('acm-body').innerHTML = sel + (items.length ? `<div class="space-y-3">${items.map(p => `
      <article class="bg-white border border-outline-variant/30 rounded-xl p-4">
        <div class="text-xs text-on-surface-variant">${where(p)} · <b class="text-on-surface">${esc(p.author_name)}</b> · ${fmt(p.created_at)}
          ${p.open_reports ? ` · <b class="text-error">${p.open_reports} denuncia(s) pendiente(s)</b>` : ''}</div>
        ${postBox(p)}
        ${p.hidden ? `<div class="text-xs mt-2 text-on-surface-variant">${p.hidden_by === 'author' ? 'Retirada por su autor.' : 'Oculta por el equipo.'}${p.hidden_reason ? ` «${esc(p.hidden_reason)}»` : ''}</div>` : ''}
        <div class="flex flex-wrap gap-2 mt-3">${!p.hidden ? btn('post-hide', p.id, 'Ocultar') : (p.hidden_by === 'team' ? btn('post-unhide', p.id, 'Volver a mostrar') : '')}
          ${!p.hidden && !p.group_id ? `<a class="px-4 py-1.5 rounded-full text-xs font-bold border border-outline-variant/60 text-on-surface-variant" href="/comunidad/conversaciones/${p.parent_id || p.id}" target="_blank" rel="noopener">Ver en la comunidad</a>` : ''}</div>
      </article>`).join('')}</div>` : '<p class="py-8 text-center text-on-surface-variant text-sm">No hay aportaciones con este filtro.</p>');
  }

  function groupForm(g) {
    const id = g ? g.id : 'new';
    return `<form data-group-form="${id}" class="grid gap-3">
      <div><label class="block text-xs font-semibold text-on-surface-variant mb-1" for="acm-gn-${id}">Nombre</label>
        <input id="acm-gn-${id}" name="name" maxlength="120" required value="${esc(g ? g.name : '')}" class="w-full border border-outline-variant/40 rounded-lg px-3 py-2 text-sm bg-white" placeholder="Por ejemplo: KA2 Juventud"></div>
      <div><label class="block text-xs font-semibold text-on-surface-variant mb-1" for="acm-gd-${id}">Descripción</label>
        <textarea id="acm-gd-${id}" name="description" maxlength="600" rows="2" class="w-full border border-outline-variant/40 rounded-lg px-3 py-2 text-sm bg-white">${esc(g ? g.description || '' : '')}</textarea></div>
      ${g ? `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" ${g.archived ? 'checked' : ''}> Archivado (desaparece de la comunidad; sus conversaciones se conservan)</label>` : ''}
      <div><button type="submit" class="px-4 py-1.5 rounded-full bg-primary text-white text-xs font-bold">${g ? 'Guardar cambios' : 'Crear grupo'}</button></div>
    </form>`;
  }

  function renderGroups(items) {
    document.getElementById('acm-body').innerHTML = `
      <section class="bg-white border border-outline-variant/30 rounded-xl p-4 mb-5"><h2 class="font-bold text-primary mb-3">Nuevo grupo</h2>${groupForm(null)}</section>
      ${items.length ? `<div class="space-y-3">${items.map(g => `<details class="bg-white border border-outline-variant/30 rounded-xl p-4">
        <summary class="cursor-pointer"><b class="text-primary">${esc(g.name)}</b>
          <span class="text-xs text-on-surface-variant"> · ${g.members} miembro(s) · ${g.posts} aportación(es)${g.archived ? ' · archivado' : ''}</span></summary>
        <div class="mt-3">${groupForm(g)}</div></details>`).join('')}</div>` : '<p class="text-sm text-on-surface-variant">Todavía no hay grupos.</p>'}`;
  }

  async function onClick(e) {
    const t = e.target.closest('[data-tab]');
    if (t) { state.tab = t.dataset.tab; shell(); load(); return; }
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    b.disabled = true;
    try {
      const id = encodeURIComponent(b.dataset.id);
      if (b.dataset.act === 'report-hide') await API.post(`/admin/community/reports/${id}/resolve`, { action: 'hide' });
      else if (b.dataset.act === 'report-dismiss') await API.post(`/admin/community/reports/${id}/resolve`, { action: 'dismiss' });
      else if (b.dataset.act === 'post-hide') {
        const reason = typeof Modal !== 'undefined' ? await Modal.prompt('Motivo (solo lo ve el equipo):', '') : prompt('Motivo (solo lo ve el equipo):', '');
        if (reason === null) { b.disabled = false; return; }
        await API.post(`/admin/community/posts/${id}/hide`, { reason });
      } else if (b.dataset.act === 'post-unhide') await API.post(`/admin/community/posts/${id}/unhide`, {});
      toast('Hecho', 'ok');
      refreshCount();
      await load();
    } catch (err) {
      b.disabled = false;
      toast(err.message || 'No se pudo guardar', 'error');
    }
  }

  async function onSubmit(e) {
    const f = e.target.closest('form[data-group-form]');
    if (!f) return;
    e.preventDefault();
    const id = f.dataset.groupForm;
    const body = { name: f.name.value, description: f.description.value, archived: f.archived ? f.archived.checked : false };
    try {
      if (id === 'new') await API.post('/admin/community/groups', body);
      else await API.put(`/admin/community/groups/${encodeURIComponent(id)}`, body);
      toast(id === 'new' ? 'Grupo creado' : 'Grupo guardado', 'ok');
      await load();
    } catch (err) { toast(err.message || 'No se pudo guardar', 'error'); }
  }

  return { init, refreshCount };
})();
