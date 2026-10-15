/* ═══════════════════════════════════════════════════════════════
   Shortlists — Partner Pool del usuario
   ═══════════════════════════════════════════════════════════════
   - Toggle de entidades en la default shortlist (heart en ficha)
   - Panel /shortlists con vista de listas y items guardados
   - Export CSV
   - Plantilla de contacto pre-rellenada (copy + mailto)
   - Crear consorcio (handoff a Writer en S6)
   ═══════════════════════════════════════════════════════════════ */

const Shortlists = (() => {
  let initDone = false;
  let activeShortlistId = null;
  let cachedLists = [];

  /* ── Init panel ───────────────────────────────────────────── */
  async function init() {
    if (!initDone) {
      bindEvents();
      initDone = true;
    }
    await loadLists();
    renderTabs();
    if (cachedLists.length === 0) {
      // Aún no hay shortlists — crear default
      await ensureDefault();
      await loadLists();
      renderTabs();
    }
    if (!activeShortlistId && cachedLists.length) {
      activeShortlistId = cachedLists.find(s => s.is_default)?.id || cachedLists[0].id;
    }
    if (activeShortlistId) await viewShortlist(activeShortlistId);
  }

  function bindEvents() {
    document.getElementById('shortlists-new-btn')?.addEventListener('click', async () => {
      const name = await Modal.prompt('Nombre de la nueva shortlist', '', { placeholder: 'Ej: KA220 Sports Spain' });
      if (!name) return;
      try {
        const { id } = await API.post('/entities/shortlists', { name });
        await loadLists();
        renderTabs();
        activeShortlistId = id;
        await viewShortlist(id);
      } catch (e) { Toast.show(e.message || 'Error', 'err'); }
    });
  }

  /* ── Backend calls ────────────────────────────────────────── */
  async function loadLists() {
    if (!API.getToken()) { cachedLists = []; return; }
    try { cachedLists = await API.get('/entities/shortlists'); }
    catch { cachedLists = []; }
  }

  async function ensureDefault() {
    if (!API.getToken()) return null;
    try {
      const { id } = await API.post('/entities/shortlists', { name: 'Mi Pool', description: 'Entidades guardadas' });
      return id;
    } catch { return null; }
  }

  async function viewShortlist(id) {
    activeShortlistId = id;
    const wrap = document.getElementById('shortlist-detail');
    if (!wrap) return;
    wrap.innerHTML = `<div class="py-12 text-center text-on-surface-variant">Cargando…</div>`;
    try {
      const data = await API.get(`/entities/shortlists/${id}`);
      wrap.innerHTML = renderShortlistDetail(data);
      bindDetailEvents(data);
    } catch (e) {
      wrap.innerHTML = `<div class="py-12 text-center text-error">${esc(e.message || 'Error')}</div>`;
    }
  }

  function renderTabs() {
    const tabs = document.getElementById('shortlists-tabs');
    if (!tabs) return;
    if (!cachedLists.length) {
      tabs.innerHTML = `<div class="text-sm text-on-surface-variant">Sin shortlists todavía</div>`;
      return;
    }
    tabs.innerHTML = cachedLists.map(s => `
      <button type="button" data-shortlist="${esc(s.id)}"
        class="shortlist-tab inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors
               ${s.id === activeShortlistId ? 'bg-primary text-white' : 'bg-white text-primary hover:bg-secondary-fixed/40 border border-outline-variant/30'}">
        ${s.is_default ? '<span class="material-symbols-outlined text-[16px]">favorite</span>' : ''}
        ${esc(s.name)}
        <span class="text-[11px] font-normal opacity-70">${s.item_count}</span>
      </button>
    `).join('');
    tabs.querySelectorAll('[data-shortlist]').forEach(b => {
      b.addEventListener('click', () => viewShortlist(b.dataset.shortlist));
    });
  }

  function renderShortlistDetail(data) {
    const items = data.items || [];
    return `
      <header class="flex flex-wrap items-end gap-3 mb-5 px-4 lg:px-0">
        <div class="min-w-0 flex-1">
          <h2 class="font-headline text-2xl font-extrabold text-primary">${esc(data.name)}</h2>
          ${data.description ? `<p class="text-sm text-on-surface-variant mt-1">${esc(data.description)}</p>` : ''}
          <div class="text-xs text-on-surface-variant mt-1">
            ${items.length} entidad${items.length === 1 ? '' : 'es'} · actualizado ${relativeTime(new Date(data.updated_at))}
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <button type="button" data-action="export"
            class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-outline-variant/40 text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[16px]">download</span>
            Export CSV
          </button>
          <button type="button" data-action="consortium"
            class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-secondary-fixed text-primary hover:bg-secondary-fixed-dim transition-colors">
            <span class="material-symbols-outlined text-[16px]">handshake</span>
            Crear consorcio
          </button>
          ${!data.is_default ? `
          <button type="button" data-action="rename"
            class="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container" title="Renombrar">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button type="button" data-action="delete"
            class="p-2 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error" title="Eliminar shortlist">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
          ` : ''}
        </div>
      </header>

      ${items.length === 0 ? `
        <div class="py-16 text-center px-4">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-container flex items-center justify-center">
            <span class="material-symbols-outlined text-primary/40 text-[32px]">favorite_border</span>
          </div>
          <h3 class="font-bold text-primary mb-1">Tu shortlist está vacía</h3>
          <p class="text-sm text-on-surface-variant mb-4">Ve al Directorio, abre una entidad y pulsa "Añadir a shortlist".</p>
          <a href="#organizations" class="text-xs font-semibold text-primary bg-secondary-fixed px-4 py-2 rounded-full hover:bg-secondary-fixed-dim">Ir al Directorio</a>
        </div>
      ` : `
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 px-4 lg:px-0">
          ${items.map(it => renderShortlistItem(it)).join('')}
        </div>
      `}
    `;
  }

  function renderShortlistItem(it) {
    if (!it.display_name && !it.oid) return '';
    const logo = it.logo_url
      ? `<img src="${esc(it.logo_url)}" referrerpolicy="no-referrer" class="w-10 h-10 rounded-lg object-contain bg-white border border-outline-variant/20 shrink-0" onerror="this.style.display='none'">`
      : `<div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-primary text-[18px]">apartment</span></div>`;
    return `
      <div class="bg-white rounded-2xl border border-outline-variant/25 p-4 relative">
        <button type="button" data-remove="${esc(it.oid)}" title="Quitar de shortlist"
          class="absolute top-2 right-2 p-1.5 rounded-lg text-on-surface-variant/60 hover:text-error hover:bg-error/10">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
        <button type="button" data-view-oid="${esc(it.oid)}" class="w-full text-left">
          <div class="flex items-start gap-3 mb-2 pr-6">
            ${logo}
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-primary text-sm leading-tight line-clamp-2">${esc(it.display_name || '(sin nombre)')}</h3>
              <div class="text-[11px] text-on-surface-variant mt-0.5">${esc(it.country_code || '')}${it.city ? ' · ' + esc(it.city) : ''}</div>
            </div>
          </div>
          ${it.category ? `<span class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">${esc(it.category)}</span>` : ''}
        </button>
      </div>
    `;
  }

  function bindDetailEvents(data) {
    const wrap = document.getElementById('shortlist-detail');
    if (!wrap) return;
    wrap.querySelectorAll('[data-action="export"]').forEach(b => b.addEventListener('click', () => exportCsv(data.id)));
    wrap.querySelectorAll('[data-action="consortium"]').forEach(b => b.addEventListener('click', () => createConsortium(data)));
    wrap.querySelectorAll('[data-action="rename"]').forEach(b => b.addEventListener('click', () => renameShortlist(data)));
    wrap.querySelectorAll('[data-action="delete"]').forEach(b => b.addEventListener('click', () => deleteShortlist(data)));
    wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const oid = b.dataset.remove;
      try {
        await API.del(`/entities/shortlists/${data.id}/items/${encodeURIComponent(oid)}`);
        await loadLists(); renderTabs();
        await viewShortlist(data.id);
        Toast.show('Quitado del shortlist', 'ok');
      } catch (er) { Toast.show(er.message || 'Error', 'err'); }
    }));
    wrap.querySelectorAll('[data-view-oid]').forEach(b => b.addEventListener('click', () => {
      if (typeof Entities !== 'undefined') Entities.openFicha(b.dataset.viewOid);
    }));
  }

  /* ── Toggle desde la ficha (heart icon) ──────────────────── */
  async function toggle(oid, btn) {
    if (!API.getToken()) {
      Toast.show('Inicia sesión para guardar entidades', 'err');
      return;
    }
    try {
      const r = await API.post('/entities/shortlists/toggle', { oid });
      Toast.show(r.added ? 'Añadido a Mi Pool' : 'Quitado de Mi Pool', 'ok');
      if (btn) {
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) {
          icon.textContent = r.added ? 'favorite' : 'favorite_border';
          icon.style.fontVariationSettings = r.added ? "'FILL' 1" : "'FILL' 0";
        }
      }
    } catch (e) { Toast.show(e.message || 'Error', 'err'); }
  }

  /* ── Contact template generator ───────────────────────────── */
  async function openContactTemplate(oid) {
    let entity = null;
    try { entity = await API.get(`/entities/${encodeURIComponent(oid)}`); }
    catch (e) { Toast.show(e.message || 'Error', 'err'); return; }

    const name = entity.display_name || entity.legal_name || 'colleagues';
    const email = (entity.emails || [])[0] || '';
    const country = entity.country_code || '';
    const cat = entity.category || 'organisation';

    const subject = `Erasmus+ partnership opportunity — exploring collaboration with ${name}`;
    const body = [
      `Dear ${name} team,`, '',
      `My name is [YOUR NAME] and I'm reaching out from [YOUR ORGANISATION] (${country ? '' : ''}EU). We're preparing an Erasmus+ proposal in [PROGRAMME / KA action] focused on [TOPIC] and we believe your work as a ${cat} aligns very well with what we want to build.`, '',
      `Would you be open to a 20-min introductory call in the next two weeks to explore whether a partnership makes sense?`, '',
      `Some context about us: [1-2 lines about your organisation, expertise and prior EU projects].`, '',
      `Looking forward to hearing from you.`, '',
      `Best regards,`,
      `[YOUR NAME]`,
      `[ROLE] · [YOUR ORGANISATION]`,
      `[EMAIL] · [PHONE]`
    ].join('\n');

    showContactModal({ to: email, subject, body, entity });
  }

  function showContactModal({ to, subject, body, entity }) {
    document.getElementById('contact-template-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'contact-template-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/30 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div class="px-5 py-4 border-b border-outline-variant/30 flex items-center gap-3">
          <span class="material-symbols-outlined text-primary">mail</span>
          <div class="flex-1">
            <h3 class="font-bold text-primary">Plantilla de contacto</h3>
            <p class="text-xs text-on-surface-variant">${esc(entity.display_name || '')}</p>
          </div>
          <button type="button" class="ct-close p-2 rounded-lg hover:bg-surface-container">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="p-5 space-y-3 overflow-y-auto">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Para</label>
            <input class="ct-to w-full mt-1 px-3 py-2 text-sm border border-outline-variant/40 rounded-lg" value="${esc(to)}">
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Asunto</label>
            <input class="ct-subject w-full mt-1 px-3 py-2 text-sm border border-outline-variant/40 rounded-lg" value="${esc(subject)}">
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Mensaje</label>
            <textarea class="ct-body w-full mt-1 px-3 py-2 text-sm border border-outline-variant/40 rounded-lg" rows="14">${esc(body)}</textarea>
          </div>
        </div>
        <div class="px-5 py-3 border-t border-outline-variant/30 flex items-center justify-between gap-2 bg-surface-container-low/40">
          <p class="text-[11px] text-on-surface-variant">Edita los <strong>[campos]</strong> antes de enviar.</p>
          <div class="flex items-center gap-2">
            <button type="button" class="ct-copy text-xs font-semibold px-4 py-2 rounded-full bg-white border border-outline-variant/40 hover:border-primary hover:text-primary inline-flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">content_copy</span> Copiar
            </button>
            <button type="button" class="ct-mailto text-xs font-semibold px-4 py-2 rounded-full bg-secondary-fixed text-primary hover:bg-secondary-fixed-dim inline-flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">send</span> Abrir en correo
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.ct-close').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('.ct-copy').onclick = () => {
      const txt = `Para: ${modal.querySelector('.ct-to').value}\nAsunto: ${modal.querySelector('.ct-subject').value}\n\n${modal.querySelector('.ct-body').value}`;
      navigator.clipboard.writeText(txt);
      Toast.show('Plantilla copiada al portapapeles', 'ok');
    };
    modal.querySelector('.ct-mailto').onclick = () => {
      const to = modal.querySelector('.ct-to').value;
      const subj = encodeURIComponent(modal.querySelector('.ct-subject').value);
      const bod  = encodeURIComponent(modal.querySelector('.ct-body').value);
      window.location.href = `mailto:${to}?subject=${subj}&body=${bod}`;
    };
  }

  /* ── Export CSV ──────────────────────────────────────────── */
  async function exportCsv(id) {
    const token = API.getToken();
    if (!token) { Toast.show('Inicia sesión para exportar', 'err'); return; }
    try {
      const r = await fetch(`/v1/entities/shortlists/${id}/export.csv`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const name = (m && m[1]) || 'shortlist.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      Toast.show('CSV descargado', 'ok');
    } catch (e) { Toast.show(e.message || 'Error', 'err'); }
  }

  /* ── Rename / delete ─────────────────────────────────────── */
  async function renameShortlist(data) {
    const name = await Modal.prompt('Nuevo nombre', data.name, {});
    if (!name || name === data.name) return;
    try {
      await API.patch(`/entities/shortlists/${data.id}`, { name });
      await loadLists(); renderTabs();
      await viewShortlist(data.id);
    } catch (e) { Toast.show(e.message || 'Error', 'err'); }
  }
  async function deleteShortlist(data) {
    const ok = await Modal.confirm(`¿Eliminar shortlist "${data.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await API.del(`/entities/shortlists/${data.id}`);
      await loadLists(); renderTabs();
      activeShortlistId = cachedLists[0]?.id || null;
      if (activeShortlistId) await viewShortlist(activeShortlistId);
      else document.getElementById('shortlist-detail').innerHTML = '<div class="py-12 text-center text-on-surface-variant">No hay shortlists</div>';
    } catch (e) { Toast.show(e.message || 'Error', 'err'); }
  }

  /* ── Crear consorcio (handoff a Writer / Intake) ─────────── */
  async function createConsortium(data) {
    if (!API.getToken()) { Toast.show('Inicia sesión', 'err'); return; }
    if (!data.items?.length) { Toast.show('La shortlist está vacía', 'err'); return; }
    const ok = await Modal.confirm(`Crear un proyecto nuevo en Intake con ${data.items.length} partners de "${data.name}"? Podrás continuar la propuesta desde ahí.`);
    if (!ok) return;
    try {
      const r = await API.post('/entities/handoff/consortium', {
        shortlist_id: data.id,
        oids: data.items.map(i => i.oid),
      });
      if (r.project_id) {
        Toast.show(`Proyecto creado con ${r.partners_added} partners. Abriendo Intake…`, 'ok');
        // Navegar a Intake y abrir el proyecto recién creado
        if (typeof App !== 'undefined') App.navigate('intake', true, false);
        if (typeof Intake !== 'undefined' && Intake.openProject) {
          setTimeout(() => Intake.openProject(r.project_id), 200);
        }
      } else {
        Toast.show('Consorcio listo. Continúa desde Mis Proyectos.', 'ok');
      }
    } catch (e) { Toast.show(e.message || 'Error creando consorcio', 'err'); }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function esc(v) { if (v == null) return ''; const d = document.createElement('div'); d.textContent = String(v); return d.innerHTML; }
  function relativeTime(date) {
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'hace unos segundos';
    if (diff < 3600) return `hace ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff/3600)} h`;
    return `hace ${Math.floor(diff/86400)} días`;
  }

  return { init, toggle, openContactTemplate, viewShortlist, exportCsv };
})();
