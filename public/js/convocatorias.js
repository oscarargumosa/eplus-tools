/* ═══════════════════════════════════════════════════════════════
   Convocatorias — Lista de calls UE/ES (funding_unified)
   Patrón espejo de Movilidades: contador prominente, search bar,
   chips de estado, programa filter, cards con drawer detail.
   ═══════════════════════════════════════════════════════════════ */

const Convocatorias = (() => {

  let allItems = [];
  let loaded   = false;
  let bound    = false;
  let isAdmin  = false;  // set on init() based on App.isAdmin()
  const state  = { q: '', status: '', programme: '', sort: 'deadline', curation: '', availability: '' };
  // curation filter values (admin): '' (all), 'unreviewed', 'reviewed', 'in_efs', 'hidden'
  // availability filter values (public): '' (all), 'efs' (only available in EFS)

  /* ── helpers ─────────────────────────────────────────────── */

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  const LOCALE = () => (I18N.lang === 'en' ? 'en-GB' : 'es-ES');
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function daysUntil(iso) {
    if (!iso) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return Math.round((d - today) / 86400000);
  }

  // Píldora de plazo: escala de urgencia en la paleta de marca (azul > lavanda > blanco).
  function deadlinePill(item) {
    const base = 'text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap';
    if (item.status === 'forthcoming') {
      return `<span class="${base} bg-lavender-soft text-violet">${_t('Próxima')}</span>`;
    }
    const d = daysUntil(item.deadline);
    if (d === null) {
      return item.status === 'open'
        ? `<span class="${base} bg-white text-primary border border-outline-variant">${_t('Abierta')}</span>`
        : '';
    }
    if (d < 0)    return `<span class="${base} bg-surface-container-high text-on-surface-variant">${_t('Cerrada')}</span>`;
    if (d === 0)  return `<span class="${base} bg-primary text-white">${_t('Hoy')}</span>`;
    if (d <= 7)   return `<span class="${base} bg-violet text-white">${d === 1 ? _t('1 día') : _t('{n} días', { n: d })}</span>`;
    if (d <= 30)  return `<span class="${base} bg-lavender-soft text-primary">${_t('{n} días', { n: d })}</span>`;
    return         `<span class="${base} bg-white text-on-surface-variant border border-outline-variant">${_t('{n} días', { n: d })}</span>`;
  }

  function fmtMoney(n) {
    if (n == null || isNaN(Number(n))) return null;
    const v = Number(n);
    if (v >= 1e9)  return `€${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6)  return `€${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3)  return `€${(v / 1e3).toFixed(0)}k`;
    return `€${v}`;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(LOCALE(), { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Partes de la fecha para la caja «día grande + mes/año».
  function dateParts(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return {
      day:   String(d.getDate()).padStart(2, '0'),
      month: d.toLocaleDateString(LOCALE(), { month: 'short' }).replace('.', ''),
      year:  String(d.getFullYear()),
    };
  }

  // Resumen en el idioma de la interfaz si la convocatoria lo trae (es dato: no se traduce).
  function pickSummary(item) {
    return (I18N.lang === 'en' ? (item.summary_en || item.summary_es) : (item.summary_es || item.summary_en)) || '';
  }

  function sourceBadge(src) {
    const map = {
      sedia:  { label: 'EU · SEDIA', class: 'bg-white text-primary border-primary/20' },
      salto:  { label: 'Erasmus+ Youth', class: 'bg-lavender-soft text-violet border-lavender/30' },   // i18n-no (nombre de la fuente)
      bdns:   { label: 'ES · BDNS', class: 'bg-white text-violet border-violet/20' },   // i18n-no (nombre de la fuente)
    };
    const m = map[src] || { label: src || '—', class: 'bg-white text-on-surface-variant border-outline-variant' };
    return `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${m.class}">${escapeHtml(m.label)}</span>`;
  }

  function availabilityBadge(item) {
    if (!item.available_in_efs) return '';
    const code = escapeHtml(item.source_id || item.call_id || '');
    // Fase beta: sin el área «proyectos», candado y «Beta» (el clic abre «Solicitar acceso»).
    const locked = typeof BetaAccess !== 'undefined' && !BetaAccess.has('proyectos');
    return `<button type="button"
      class="conv-create-project inline-flex items-center gap-1 whitespace-nowrap max-w-full overflow-hidden text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-secondary-fixed text-primary hover:bg-secondary-fixed-dim transition-colors"
      data-action-type="${code}"
      data-title="${escapeHtml(item.title || '')}"
      data-deadline="${escapeHtml(item.deadline || '')}"
      data-grant="${escapeHtml(String(item.budget_per_project_max_eur || ''))}"
      title="${_t('Crear un proyecto vinculado a esta convocatoria')}">
      ${locked
        ? `<span class="material-symbols-outlined text-[12px]" style="font-variation-settings:'FILL' 1">lock</span>
      ${_t('Crear proyecto')} <span class="beta-tag">Beta</span>`
        : `<span class="material-symbols-outlined text-[12px]" style="font-variation-settings:'FILL' 1">check_circle</span>
      ${_t('Disponible → Crear proyecto')}`}
    </button>`;
  }

  /* ── lifecycle ───────────────────────────────────────────── */

  async function init() {
    isAdmin = !!(typeof App !== 'undefined' && App.isAdmin && App.isAdmin());
    bindEvents();
    if (!loaded) await load();
    populateProgrammes();
    renderAdminToolbar();
    render();
  }

  function renderAdminToolbar() {
    if (!isAdmin) return;
    const host = document.getElementById('convocatorias-status-chips');
    if (!host || host.querySelector('[data-curation]')) return;
    const html = `
      <span class="text-[10px] text-on-surface-variant ml-3 mr-1 self-center">|  Admin:</span>
      <button type="button" data-curation="" class="conv-chip is-active">${_t('Todas')}</button>
      <button type="button" data-curation="unreviewed" class="conv-chip">${_t('Sin revisar')}</button>
      <button type="button" data-curation="reviewed"   class="conv-chip">${_t('Revisadas')}</button>
      <button type="button" data-curation="in_efs"     class="conv-chip">${_t('En Studio')}</button>
      <button type="button" data-curation="hidden"     class="conv-chip">${_t('Ocultas')}</button>`;
    host.insertAdjacentHTML('beforeend', html);
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-curation]');
      if (!btn) return;
      state.curation = btn.dataset.curation;
      host.querySelectorAll('[data-curation]').forEach(b => b.classList.toggle('is-active', b === btn));
      render();
    });
  }

  async function load() {
    const list = document.getElementById('convocatorias-list');
    try {
      // pedimos todas (limit alto), filtramos client-side para velocidad
      const res = await API.get('/convocatorias?limit=2000');
      const data = (res && res.data) || res || {};
      const raw = data.items || [];

      // Defensa en profundidad: aplicamos los mismos filtros que el backend
      // (por si el servidor todavía no está reiniciado con la nueva versión).
      const today = todayISO();
      allItems = raw.filter(r => {
        if (String(r.source || '').toLowerCase() === 'salto') return false;
        if (String(r.status || '').toLowerCase() === 'closed') return false;
        if (r.deadline && String(r.deadline) < today) return false;
        return true;
      });

      loaded = true;
      const meta = document.getElementById('convocatorias-meta');
      if (meta) {
        const open = allItems.filter(r => String(r.status || '').toLowerCase() === 'open').length;
        const fc   = allItems.filter(r => String(r.status || '').toLowerCase() === 'forthcoming').length;
        const ts   = data.meta && data.meta.generatedAt ? new Date(data.meta.generatedAt).toISOString().slice(0, 10) : null;
        meta.textContent = _t('Fuente: SEDIA + BDNS · {open} abiertas · {fc} próximas', { open, fc })
          + (ts ? ' · ' + _t('actualizado {fecha}', { fecha: ts }) : '');
      }
    } catch (err) {
      list.innerHTML = `<div class="col-span-full text-center text-error py-12 text-sm">${escapeHtml(_t('No se pudieron cargar las convocatorias: {error}', { error: err.message || _t('error desconocido') }))}</div>`;
    }
  }

  function populateProgrammes() {
    const sel = document.getElementById('convocatorias-programme');
    if (!sel || sel.dataset.populated === '1') return;
    const counts = {};
    for (const c of allItems) {
      const p = c.programme || '—';
      counts[p] = (counts[p] || 0) + 1;
    }
    const opts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `<option value="${escapeHtml(p)}">${escapeHtml(p)} (${n})</option>`)
      .join('');
    sel.insertAdjacentHTML('beforeend', opts);
    sel.dataset.populated = '1';
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    const q    = document.getElementById('convocatorias-q');
    const sort = document.getElementById('convocatorias-sort');
    const prog = document.getElementById('convocatorias-programme');
    const chips = document.getElementById('convocatorias-status-chips');

    if (q)    q.addEventListener('input',   debounce(() => { state.q = q.value.trim(); render(); }, 180));
    if (sort) sort.addEventListener('change', () => { state.sort = sort.value; render(); });
    if (prog) prog.addEventListener('change', () => { state.programme = prog.value; render(); });

    if (chips) {
      chips.addEventListener('click', (e) => {
        // Public status chips
        const statusBtn = e.target.closest('[data-status]');
        if (statusBtn) {
          chips.querySelectorAll('[data-status]').forEach(c => c.classList.remove('is-active'));
          statusBtn.classList.add('is-active');
          state.status = statusBtn.dataset.status;
          render();
          return;
        }
        // Availability chip ("Disponibles en EFS") — independent toggle
        const availBtn = e.target.closest('[data-availability]');
        if (availBtn) {
          const wasActive = availBtn.classList.contains('is-active');
          availBtn.classList.toggle('is-active', !wasActive);
          state.availability = wasActive ? '' : availBtn.dataset.availability;
          render();
          return;
        }
      });
    }

    document.getElementById('convocatorias-list')?.addEventListener('click', (e) => {
      // Admin curation toolbar — intercept BEFORE generic card click.
      const adminBtn = e.target.closest('.conv-admin-act');
      if (adminBtn) {
        e.stopPropagation();
        const toolbar = adminBtn.closest('.conv-admin-toolbar');
        handleAdminAction(toolbar.dataset.sourceId, adminBtn.dataset.act);
        return;
      }
      // Create-project button — intercept BEFORE generic card click.
      const btn = e.target.closest('.conv-create-project');
      if (btn) {
        e.stopPropagation();
        createProjectFromCall(btn);
        return;
      }
      // "Visión" en la tarjeta — arranca EU Vision sin abrir el detalle.
      const visionBtn = e.target.closest('.conv-card-vision');
      if (visionBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof App !== 'undefined' && App.requireLogin && !App.requireLogin({ what: _t('empezar tu visión') })) return;
        if (typeof Vision !== 'undefined') Vision.startForCall(visionBtn.dataset.callId);
        return;
      }
      const card = e.target.closest('[data-call-id]');
      if (card) openDetail(card.dataset.callId);
    });

    // Semantic search
    const semQ = document.getElementById('convocatorias-semantic-q');
    const semGo = document.getElementById('convocatorias-semantic-go');
    const semClear = document.getElementById('convocatorias-semantic-clear');
    semGo?.addEventListener('click', () => runSemanticSearch(semQ.value));
    semQ?.addEventListener('keydown', e => { if (e.key === 'Enter') runSemanticSearch(semQ.value); });
    semClear?.addEventListener('click', () => {
      semQ.value = '';
      semClear.classList.add('hidden');
      render();
    });
  }

  async function runSemanticSearch(query) {
    if (!query || query.trim().length < 3) return;
    const list = document.getElementById('convocatorias-list');
    list.innerHTML = '<div class="col-span-full text-center text-on-surface-variant py-12 text-sm"><span class="spinner"></span> ' + _t('Buscando con IA…') + '</div>';
    try {
      const res = await API.get('/convocatorias/search-semantic?q=' + encodeURIComponent(query) + '&top=12');
      const items = res.items || [];
      if (!items.length) {
        list.innerHTML = '<div class="col-span-full text-center text-on-surface-variant py-12 text-sm">' + _t('Sin resultados. Prueba con otras palabras clave.') + '</div>';
        return;
      }
      // Marry semantic results with full feed data (for budget, badges, etc.)
      const enriched = items.map(it => {
        const full = allItems.find(x => x.source_id === it.source_id) || it;
        return { ...full, _semanticScore: it.score, _semanticSnippet: it.snippet };
      });
      list.innerHTML = enriched.map(item => {
        const card = renderCard(item);
        const snippetBlock = `<div class="mt-3 pt-3 border-t border-outline-variant/15 text-[11px] text-on-surface-variant italic">… ${escapeHtml((item._semanticSnippet || '').slice(0, 200))} …</div>`;
        return card.replace('</article>', snippetBlock + '</article>');
      }).join('');
      document.getElementById('convocatorias-semantic-clear')?.classList.remove('hidden');
    } catch (e) {
      list.innerHTML = `<div class="col-span-full text-center text-error py-12 text-sm">${escapeHtml(_t('Error: {error}', { error: e.message || e }))}</div>`;
    }
  }

  async function handleAdminAction(sourceId, action) {
    if (!sourceId || !action) return;
    const item = allItems.find(i => i.source_id === sourceId);
    if (!item) return;
    const cur = item.curation || {};
    try {
      if (action === 'hidden') {
        const updated = await API.patch(`/convocatorias/curation/${encodeURIComponent(sourceId)}`, { hidden: !cur.hidden });
        item.curation = updated;
      } else if (action === 'reviewed') {
        const updated = await API.patch(`/convocatorias/curation/${encodeURIComponent(sourceId)}`, { reviewed: !cur.reviewed_at });
        item.curation = updated;
      } else if (action === 'notes') {
        await openNotesModal(item);
        return;
      } else if (action === 'import') {
        if (!confirm(_t('¿Importar "{titulo}" a Data E+ (queda INACTIVA, abre el editor)?', { titulo: item.title }))) return;
        const r = await API.post('/admin/data/programs/import-from-feed', { source_id: sourceId });
        // Navigate to Admin and open the editor for this program — same flow
        // as the "Importar de catálogo EU" modal in admin.
        location.hash = '#admin';
        // Wait one tick so app.js navigate() calls Admin.init() before we ask
        // for the editor (init mounts the DOM).
        setTimeout(() => {
          if (typeof Admin !== 'undefined' && Admin.openConvocatoria) {
            Admin.openConvocatoria(r.id, item.title);
          }
        }, 150);
        return;
      }
      render();
    } catch (e) {
      alert(_t('Error: {error}', { error: e.message || e }));
    }
  }

  function fmtTimestamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(LOCALE(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function openNotesModal(item) {
    let modal = document.getElementById('conv-notes-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'conv-notes-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6 overflow-y-auto';
    const renderInner = () => {
      const log = (item.curation && item.curation.notes_log) || [];
      const entries = log.length === 0
        ? '<p class="text-sm text-on-surface-variant text-center py-6">' + _t('Sin notas aún. Añade la primera abajo.') + '</p>'
        : log.map((n, i) => `
          <div class="flex gap-3 px-3 py-3 rounded-lg bg-surface-container-low border border-outline-variant/15">
            <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span class="text-[10px] font-bold text-primary">${escapeHtml((n.author_name || '?').slice(0,2).toUpperCase())}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-1">
                <div class="text-[11px] font-bold text-on-surface">${escapeHtml(n.author_name || '—')}</div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-on-surface-variant">${escapeHtml(fmtTimestamp(n.created_at))}</span>
                  <button type="button" class="conv-note-del text-on-surface-variant/40 hover:text-error transition-colors" data-idx="${i}" title="${_t('Eliminar')}">
                    <span class="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </div>
              </div>
              <div class="text-[13px] text-on-surface whitespace-pre-wrap">${escapeHtml(n.text || '')}</div>
            </div>
          </div>`).join('');

      modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-10 max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <div class="min-w-0 flex-1 pr-3">
              <h3 class="font-headline text-base font-bold text-primary truncate">${_t('Notas admin')} · ${escapeHtml(item.title || '')}</h3>
              <p class="text-[11px] text-on-surface-variant mt-0.5 font-mono">${escapeHtml(item.source_id || '')}</p>
            </div>
            <button id="conv-notes-close" type="button" class="text-on-surface-variant hover:text-error flex-shrink-0">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            ${entries}
          </div>
          <div class="px-6 py-4 border-t border-outline-variant/20 bg-surface-container-low rounded-b-2xl">
            <textarea id="conv-note-text" rows="2" placeholder="${_t('Escribe una nota (visible solo para admins)…')}"
              class="w-full px-3 py-2 rounded-lg border border-outline-variant/40 focus:border-primary focus:outline-none text-sm resize-y"></textarea>
            <div class="flex items-center justify-end mt-2">
              <button id="conv-note-add" type="button" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-xs font-bold hover:bg-violet disabled:opacity-50">
                <span class="material-symbols-outlined text-[14px]">add</span> ${_t('Añadir nota')}
              </button>
            </div>
          </div>
        </div>`;
      bindModal();
    };
    const bindModal = () => {
      modal.querySelector('#conv-notes-close')?.addEventListener('click', () => modal.remove());
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      modal.querySelector('#conv-note-add')?.addEventListener('click', async () => {
        const ta = modal.querySelector('#conv-note-text');
        const text = (ta.value || '').trim();
        if (!text) return;
        const btn = modal.querySelector('#conv-note-add');
        btn.disabled = true;
        try {
          const updated = await API.patch(`/convocatorias/curation/${encodeURIComponent(item.source_id)}`, { add_note: text });
          item.curation = updated;
          ta.value = '';
          renderInner();
          render();
        } catch (e) { alert(_t('Error: {error}', { error: e.message || e })); btn.disabled = false; }
      });
      modal.querySelectorAll('.conv-note-del').forEach(b => b.addEventListener('click', async () => {
        if (!confirm(_t('¿Eliminar esta nota?'))) return;
        try {
          const updated = await API.patch(`/convocatorias/curation/${encodeURIComponent(item.source_id)}`, { delete_note_index: parseInt(b.dataset.idx, 10) });
          item.curation = updated;
          renderInner();
          render();
        } catch (e) { alert(_t('Error: {error}', { error: e.message || e })); }
      }));
    };
    document.body.appendChild(modal);
    renderInner();
  }

  async function createProjectFromCall(btn) {
    const actionType = btn.dataset.actionType;
    const title      = btn.dataset.title || actionType;
    const deadline   = btn.dataset.deadline || null;
    const grantStr   = btn.dataset.grant || '';
    const grant      = grantStr ? parseFloat(grantStr) : null;

    // If not logged in: redirect to login with redirect hint.
    // API es un const global (no cuelga de window): con window.API nunca había token.
    const token = (typeof API !== 'undefined' && API.getToken && API.getToken());
    if (!token) {
      sessionStorage.setItem('post_login_create_call', JSON.stringify({ actionType, title, deadline, grant }));
      location.hash = '#auth';
      return;
    }
    // Fase beta: crear un proyecto pide el área «proyectos» → «Solicitar acceso».
    if (typeof BetaAccess !== 'undefined' && !BetaAccess.guard('proyectos')) return;

    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner inline-block"></span> ' + _t('Creando…');
    try {
      const project = await API.post('/intake/projects', {
        name: title.slice(0, 200),
        type: actionType,
        deadline: deadline || null,
        eu_grant: grant || 0,
      });
      const pid = project?.id || project?.data?.id;
      // Navigate to My Projects and open the new one.
      location.hash = '#my-projects';
      if (pid && typeof window.Intake !== 'undefined' && typeof Intake.openProject === 'function') {
        setTimeout(() => Intake.openProject(pid), 200);
      }
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      alert(_t('Error creando proyecto: {error}', { error: err.message || err }));
    }
  }

  /* ── render ─────────────────────────────────────────────── */

  function filterAndSort() {
    let out = allItems.slice();

    if (state.status) out = out.filter(i => String(i.status || '').toLowerCase() === state.status);
    if (state.programme) out = out.filter(i => i.programme === state.programme);
    if (state.availability === 'efs') out = out.filter(i => !!i.available_in_efs);

    // Admin curation filters (only meaningful when isAdmin)
    if (isAdmin && state.curation) {
      switch (state.curation) {
        case 'unreviewed': out = out.filter(i => !i.curation?.reviewed_at && !i.curation?.hidden); break;
        case 'reviewed':   out = out.filter(i => !!i.curation?.reviewed_at); break;
        case 'in_efs':     out = out.filter(i => !!i.available_in_efs); break;
        case 'hidden':     out = out.filter(i => !!i.curation?.hidden); break;
      }
    }

    if (state.q) {
      const needle = state.q.toLowerCase();
      out = out.filter(i =>
        [i.title, i.summary_en, i.summary_es, i.programme, i.sub_programme, i.source_id, ...(i.keywords || [])]
          .filter(Boolean).join(' ').toLowerCase().includes(needle)
      );
    }

    // Secondary sort comparator (deadline/recent/opening/budget/title)
    const nullsLast = (av, bv, asc = true) => {
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    };
    const secondary = (a, b) => {
      if (state.sort === 'deadline') return nullsLast(a.deadline, b.deadline, true);   // próximas primero
      if (state.sort === 'recent')   return nullsLast(a.publication_date, b.publication_date, false); // recientes primero
      if (state.sort === 'opening')  return nullsLast(a.open_date, b.open_date, true);  // próximas a abrir primero
      if (state.sort === 'budget')   return (Number(b.budget_total_eur) || 0) - (Number(a.budget_total_eur) || 0);
      if (state.sort === 'title')    return (a.title || '').localeCompare(b.title || '');
      return 0;
    };
    // Primary sort: convocatorias YA disponibles en EFS aparecen primero.
    // Son las que el usuario puede usar para crear un proyecto AHORA, así que
    // queremos dirigir la atención ahí.
    out.sort((a, b) => {
      const aEfs = a.available_in_efs ? 1 : 0;
      const bEfs = b.available_in_efs ? 1 : 0;
      if (aEfs !== bEfs) return bEfs - aEfs; // true first
      return secondary(a, b);
    });
    return out;
  }

  function render() {
    const list    = document.getElementById('convocatorias-list');
    const counter = document.getElementById('convocatorias-count');
    if (!list) return;

    const items = filterAndSort();
    if (counter) counter.textContent = items.length;

    if (!items.length) {
      list.innerHTML = `<div class="col-span-full text-center text-on-surface-variant py-12 text-sm">${_t('No hay convocatorias que coincidan con la búsqueda.')}</div>`;
      return;
    }
    list.innerHTML = items.map(renderCard).join('');
  }

  function renderCard(item) {
    const id        = escapeHtml(item.call_id);
    const programme = item.sub_programme || item.programme || '';
    const summary   = pickSummary(item);
    const totalBudget = fmtMoney(item.budget_total_eur);
    const perProj   = fmtMoney(item.budget_per_project_max_eur || item.budget_per_project_min_eur);

    // Línea destacada (estilo manual «Upcoming events»): caja blanca con la
    // fecha en Poppins ligera a la izquierda, importe en cifra ligera a la derecha.
    const dl = dateParts(item.deadline);
    const deadlineCell = item.deadline
      ? (dl
          ? `<div class="bg-white rounded-2xl px-3 py-2 min-w-[92px]">
               <div class="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">${_t('Deadline')}</div>
               <div class="flex items-baseline gap-1.5 text-primary">
                 <span class="text-[30px] font-light leading-none tabular-nums">${escapeHtml(dl.day)}</span>
                 <span class="text-[12px] leading-tight">${escapeHtml(dl.month)}<br>${escapeHtml(dl.year)}</span>
               </div>
             </div>`
          : `<div class="text-[12px] text-on-surface"><span class="text-on-surface-variant">${_t('Deadline:')}</span> <strong>${escapeHtml(fmtDate(item.deadline))}</strong></div>`)
      : '';

    const perProjCell = perProj
      ? `<div class="text-right text-primary min-w-0">
           <div class="text-[10px] font-semibold text-on-surface-variant">${_t('Hasta')}</div>
           <div class="leading-none"><span class="text-[24px] font-light tabular-nums">${escapeHtml(perProj)}</span><span class="text-[11px] font-medium">${_t('/proyecto')}</span></div>
         </div>`
      : (totalBudget
          ? `<div class="text-right text-primary min-w-0">
               <div class="leading-none"><span class="text-[24px] font-light tabular-nums">${escapeHtml(totalBudget)}</span> <span class="text-[11px] font-medium">${_t('total')}</span></div>
             </div>`
          : '');

    const moneyRow = (deadlineCell || perProjCell)
      ? `<div class="flex items-end justify-between gap-3 flex-wrap mt-auto pt-1">
           ${deadlineCell}
           ${perProjCell}
         </div>`
      : '';

    const cur = item.curation || {};
    const isHidden    = !!cur.hidden;
    const isReviewed  = !!cur.reviewed_at;
    const notesLog    = Array.isArray(cur.notes_log) ? cur.notes_log : [];
    const notesCount  = notesLog.length;
    const lastNote    = notesCount ? notesLog[notesCount - 1] : null;
    const isInEfs     = !!item.available_in_efs;
    const cardClasses = isHidden
      ? 'bg-cream/60 rounded-3xl border-2 border-dashed border-outline/40 p-5 opacity-60 hover:opacity-100 transition-all cursor-pointer flex flex-col gap-3'
      : 'bg-cream rounded-3xl border border-transparent p-5 hover:shadow-lg hover:shadow-primary/10 hover:border-primary/25 transition-all cursor-pointer flex flex-col gap-3';

    const adminToolbar = isAdmin ? `
      <div class="conv-admin-toolbar absolute top-2 right-2 flex items-center gap-1 bg-white/95 backdrop-blur rounded-full px-1.5 py-1 shadow-sm border border-outline-variant/20" data-source-id="${escapeHtml(item.source_id || '')}">
        <button type="button" class="conv-admin-act w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors ${isHidden ? 'text-primary' : 'text-on-surface-variant/50'}"
          data-act="hidden" title="${isHidden ? _t('Oculta — click para mostrar') : _t('Ocultar al público')}">
          <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' ${isHidden ? 1 : 0}">${isHidden ? 'visibility_off' : 'visibility'}</span>
        </button>
        <button type="button" class="conv-admin-act w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors ${isReviewed ? 'text-primary' : 'text-on-surface-variant/50'}"
          data-act="reviewed" title="${isReviewed ? (cur.reviewed_at ? _t('Revisada ({fecha}) — click para desmarcar', { fecha: cur.reviewed_at.slice(0,10) }) : _t('Revisada — click para desmarcar')) : _t('Marcar como revisada')}">
          <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' ${isReviewed ? 1 : 0}">${isReviewed ? 'task_alt' : 'radio_button_unchecked'}</span>
        </button>
        <button type="button" class="conv-admin-act relative w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors ${notesCount ? 'text-violet' : 'text-on-surface-variant/50'}"
          data-act="notes" title="${notesCount ? (notesCount === 1 ? _t('1 nota') : _t('{n} notas', { n: notesCount })) + ' · ' + _t('última: {autor} {fecha}', { autor: escapeHtml(lastNote.author_name || '?'), fecha: escapeHtml((lastNote.created_at || '').slice(0,10)) }) : _t('Añadir nota admin')}">
          <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' ${notesCount ? 1 : 0}">${notesCount ? 'sticky_note_2' : 'edit_note'}</span>
          ${notesCount ? `<span class="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full bg-violet text-white text-[8px] font-bold flex items-center justify-center">${notesCount}</span>` : ''}
        </button>
        ${isInEfs
          ? `<span class="w-7 h-7 rounded-full flex items-center justify-center text-primary" title="${_t('Ya importada en Studio')}"><span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 1">verified</span></span>`
          : `<button type="button" class="conv-admin-act w-7 h-7 rounded-full flex items-center justify-center hover:bg-primary/10 text-primary transition-colors" data-act="import" title="${_t('Importar a Studio')}"><span class="material-symbols-outlined text-[16px]">download</span></button>`}
      </div>` : '';

    return `
    <article data-call-id="${id}" data-source-id="${escapeHtml(item.source_id || '')}"
      class="${cardClasses} relative">

      ${adminToolbar}

      <div class="flex items-start gap-2 justify-between flex-wrap ${isAdmin ? 'pt-9' : ''}">
        ${availabilityBadge(item) || sourceBadge(item.source)}
        ${deadlinePill(item)}
      </div>

      <h3 class="text-base font-semibold text-primary leading-tight ${isHidden ? 'line-through' : ''}" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(item.title || '')}</h3>

      ${programme ? `<div class="text-[11px] font-semibold text-primary uppercase tracking-wider truncate">${escapeHtml(programme)}</div>` : ''}

      ${summary ? `<p class="text-xs text-on-surface-variant" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(summary)}</p>` : ''}

      ${moneyRow}

      <div class="flex items-center justify-between pt-3 border-t border-outline-variant gap-2">
        <span class="text-[11px] text-on-surface-variant truncate font-mono">${escapeHtml(item.source_id || '')}</span>
        <span class="flex items-center gap-3 whitespace-nowrap">
          <button type="button" class="conv-card-vision inline-flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant hover:text-primary transition-colors"
            data-call-id="${id}" title="${_t('Empezar mi visión sobre esta convocatoria')}">
            <span class="material-symbols-outlined" style="font-size:14px;line-height:1;">explore</span>${_t('Visión')}
          </button>
          ${isInEfs
            ? `<span class="text-[11px] font-bold text-primary">${_t('Ver →')}</span>`
            : `<span class="text-[11px] font-bold text-primary bg-secondary-fixed rounded-full px-3 py-1">${_t('Ver →')}</span>`}
        </span>
      </div>
    </article>`;
  }

  /* ── detail drawer ───────────────────────────────────────── */

  function row(label, val) {
    if (!val || val === 'N/A') return '';
    return `<div class="flex flex-col gap-0.5">
      <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">${escapeHtml(label)}</span>
      <span class="text-sm text-on-surface">${escapeHtml(val)}</span>
    </div>`;
  }

  function block(label, val) {
    if (!val || val === 'N/A') return '';
    return `<div>
      <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">${escapeHtml(label)}</div>
      <p class="text-sm text-on-surface whitespace-pre-line">${escapeHtml(val)}</p>
    </div>`;
  }

  function renderSummaryTable(item) {
    // 20-row structured summary table (per Oscar's spec). Uses AI-extracted
    // fields when feed lacks them.
    const fmt = (v) => (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) ? null : v;
    const money = (n) => n ? `€${Number(n).toLocaleString(LOCALE())}` : null;
    const pct = (n) => n != null ? `${n}%` : null;
    const list = (arr) => Array.isArray(arr) && arr.length ? arr.join(' · ') : null;

    const rows = [
      [_t('Programa'),                            fmt(item.programme)],
      [_t('Código de la convocatoria'),           fmt(item.source_id)],
      [_t('Objetivo principal'),                  fmt(item.main_objective)],
      [_t('Presupuesto total'),                   money(item.budget_total_eur)],
      [_t('Presupuesto por proyecto'),            money(item.budget_per_project_max_eur) || money(item.budget_per_project_min_eur)],
      [_t('Nº estimado de proyectos'),            fmt(item.expected_grants)],
      [_t('% financiación europea'),              pct(item.cofinancing_pct)],
      [_t('Cofinanciación requerida'),            item.cofinancing_pct != null ? _t('{pct}% del solicitante', { pct: 100 - Number(item.cofinancing_pct) }) : null],
      [_t('Fecha de publicación'),                fmt(fmtDate(item.publication_date))],
      [_t('Fecha de apertura'),                   fmt(fmtDate(item.open_date))],
      [_t('Deadline'),                            fmt(fmtDate(item.deadline))],
      [_t('Duración del proyecto'),               item.duration_months ? (Number(item.duration_months) === 1 ? _t('1 mes') : _t('{n} meses', { n: item.duration_months })) : null],
      [_t('Tipo de convocatoria'),                fmt(item.call_type) || fmt(item.deadline_model)],
      [_t('Dirección General / Agencia'),         fmt(item.managing_agency)],
      [_t('Plataforma de presentación'),          fmt(item.submission_platform) || 'EU Funding & Tenders Portal'],
      [_t('Nº mínimo de socios'),                 fmt(item.min_partners) || fmt(item.min_countries)],
      [_t('Países mínimos requeridos'),           fmt(item.min_countries)],
      [_t('Tipos de socios elegibles'),           list(item.eligible_entity_types)],
      [_t('Tipo de coordinador permitido'),       list(item.coordinator_types_allowed)],
      [_t('Actividades financiables'),            list(item.eligible_activities)],
      [_t('Público objetivo'),                    fmt(item.audience_ai) || fmt(item.audience)],
      [_t('Prioridades temáticas'),               list(item.themes_ai) || list(item.crossCuttingPriorities)],
    ];
    const present = rows.filter(([, v]) => v !== null);
    if (!present.length) return '';
    return `
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">${_t('Tabla resumen')}</div>
        <table class="w-full text-sm">
          <tbody>
            ${present.map(([k, v]) => `
              <tr class="border-b border-outline-variant/15 last:border-b-0">
                <td class="py-2 pr-3 text-on-surface-variant text-[12px] font-semibold w-1/3 align-top">${escapeHtml(k)}</td>
                <td class="py-2 text-on-surface text-[13px] align-top">${escapeHtml(String(v))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // True when an FAQ answer means "the LLM couldn't find this in the document".
  // Hide those — better silence than a useless "no se especifica".
  function isUnansweredFaq(text) {
    if (!text) return true;
    const t = String(text).toLowerCase().trim();
    if (t.length < 6) return true;
    const patterns = [
      /\bel documento no\b/,
      /\bel texto no\b/,
      /\bla convocatoria no\b/,
      /\bla call no\b/,
      /\bno se especifica\b/,
      /\bno se indica\b/,
      /\bno se menciona\b/,
      /\bno especifica\b/,
      /\bno indica\b/,
      /\bno detalla\b/,
      /\bno proporciona\b/,
      /\bno se proporciona\b/,
      /\bno está especific/,
      /\bno se aclara\b/,
      /\bno aclara\b/,
      /\bno se define\b/,
      /\bno se detalla\b/,
      /\bsin información\b/,
    ];
    return patterns.some(rx => rx.test(t));
  }

  function renderFaq(item) {
    if (!item.faq || !item.faq.length) return '';
    const visible = item.faq.filter(f => !isUnansweredFaq(f.a));
    if (!visible.length) return '';
    const hiddenCount = item.faq.length - visible.length;
    const hiddenNote = hiddenCount > 0
      ? `<span class="text-[10px] text-on-surface-variant/60 ml-2">(${hiddenCount === 1 ? _t('1 pregunta sin respuesta clara oculta') : _t('{n} preguntas sin respuesta clara ocultas', { n: hiddenCount })})</span>` : '';
    return `
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">${_t('Preguntas frecuentes')}${hiddenNote}</div>
        <div class="space-y-1.5">
          ${visible.map((f, i) => `
            <details class="group rounded-lg bg-cream border border-transparent px-3 py-2.5 ${i === 0 ? 'open' : ''}" ${i === 0 ? 'open' : ''}>
              <summary class="cursor-pointer text-sm font-semibold text-on-surface flex items-center gap-2 list-none">
                <span class="material-symbols-outlined text-[16px] text-primary transition-transform group-open:rotate-90">chevron_right</span>
                <span class="flex-1">${escapeHtml(f.q || '')}</span>
              </summary>
              <div class="mt-2 ml-6 text-[13px] text-on-surface whitespace-pre-wrap">${escapeHtml(f.a || '')}</div>
            </details>`).join('')}
        </div>
      </div>`;
  }

  function renderListSection(label, arr, icon = 'list') {
    if (!Array.isArray(arr) || !arr.length) return '';
    return `
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2 flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px]">${icon}</span>${escapeHtml(label)}
        </div>
        <ul class="space-y-1 list-disc list-inside text-[13px] text-on-surface">
          ${arr.map(it => `<li>${escapeHtml(it)}</li>`).join('')}
        </ul>
      </div>`;
  }

  function renderDetail(item) {
    const programme = [item.programme, item.sub_programme].filter(Boolean).join(' · ');
    const summary   = pickSummary(item);
    const budget    = fmtMoney(item.budget_total_eur);
    const minProj   = fmtMoney(item.budget_per_project_min_eur);
    const maxProj   = fmtMoney(item.budget_per_project_max_eur);
    const projRange = (minProj && maxProj && minProj !== maxProj) ? `${minProj} – ${maxProj}` : (maxProj || minProj);

    // "Solicitar" ahora arranca el paso previo: crear tu Visión sobre esta
    // convocatoria (EU Vision). El enlace al portal oficial queda como
    // secundario para quien quiera ir directo a solicitar fuera.
    const apply = `<button type="button" id="conv-start-vision"
            data-call-id="${escapeHtml(item.call_id || '')}"
            class="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-secondary-fixed text-primary text-sm font-bold hover:bg-secondary-fixed-dim transition-colors">
            <span class="material-symbols-outlined" style="font-size:18px;line-height:1;">explore</span>
            <span>${_t('Empezar mi visión')}</span>
          </button>`;
    const applyExternal = item.apply_url
      ? `<a href="${escapeHtml(item.apply_url)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1 text-[12px] text-on-surface-variant hover:text-primary hover:underline">
            <span>${_t('Solicitar en el portal oficial')}</span>
            <span class="material-symbols-outlined" style="font-size:14px;line-height:1;">open_in_new</span>
          </a>`
      : '';

    const details = item.details_url
      ? `<a href="${escapeHtml(item.details_url)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-transparent border border-primary text-primary text-sm font-bold hover:bg-lavender-soft transition-colors">
            <span>${_t('Ver en portal')}</span>
            <span class="material-symbols-outlined" style="font-size:16px;line-height:1;">open_in_new</span>
          </a>`
      : '';

    const docs = (item.documents || []).slice(0, 12).map(d => `
      <li><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" class="text-sm text-primary hover:underline">${escapeHtml(d.label || d.url)}</a></li>
    `).join('');

    const keywords = (item.keywords || []).slice(0, 12).map(k =>
      `<span class="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cream text-on-surface-variant border border-outline-variant">${escapeHtml(k)}</span>`
    ).join(' ');

    const priorities = (item.crossCuttingPriorities || []).map(k =>
      `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-lavender-soft text-violet">${escapeHtml(k)}</span>`
    ).join(' ');

    return `
      <div class="space-y-5">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-2">
            ${sourceBadge(item.source)}
            ${deadlinePill(item)}
          </div>
          <h2 class="text-xl font-bold text-primary leading-tight pr-12">${escapeHtml(item.title || '')}</h2>
          ${programme ? `<div class="text-[12px] font-semibold text-primary uppercase tracking-wider mt-1">${escapeHtml(programme)}</div>` : ''}
        </div>

        ${summary ? `<p class="text-sm text-on-surface-variant">${escapeHtml(summary)}</p>` : ''}

        ${renderSummaryTable(item)}

        ${renderListSection(_t('Actividades financiables'), item.eligible_activities, 'check_circle')}
        ${renderListSection(_t('Gastos elegibles'), item.eligible_costs, 'paid')}
        ${renderListSection(_t('Gastos NO permitidos'), item.non_eligible_costs, 'block')}
        ${renderListSection(_t('Resultados esperados'), item.expected_outcomes, 'rocket_launch')}

        ${renderFaq(item)}

        ${priorities ? `<div><div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">${_t('Prioridades transversales')}</div><div class="flex flex-wrap gap-1.5">${priorities}</div></div>` : ''}
        ${keywords ? `<div><div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">${_t('Palabras clave')}</div><div class="flex flex-wrap gap-1.5">${keywords}</div></div>` : ''}

        ${docs ? `<div><div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">${_t('Documentos oficiales')}</div><ul class="list-disc list-inside space-y-1">${docs}</ul></div>` : ''}

        <div class="pt-4 border-t border-outline-variant/20">
          <button type="button" id="conv-chat-open"
            data-source-id="${escapeHtml(item.source_id || '')}"
            data-title="${escapeHtml(item.title || '')}"
            class="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-lavender-soft text-primary text-sm font-bold hover:bg-[#dcd3ee] transition-colors">
            <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1">smart_toy</span>
            ${_t('Chat con esta convocatoria')}
          </button>
        </div>

        <div class="flex items-center justify-between pt-4 border-t border-outline-variant/20 flex-wrap gap-3">
          <div class="flex items-center gap-4">${details}${applyExternal}</div>
          <div>${apply}</div>
        </div>
      </div>
    `;
  }

  /* ── per-call chat ───────────────────────────────────────── */
  let _chatThread = []; // [{role, content}]
  function openChat(sourceId, title) {
    _chatThread = [];
    const content = document.getElementById('convocatorias-drawer-content');
    if (!content) return;
    content.innerHTML = `
      <div class="flex flex-col h-full">
        <div class="flex items-center gap-2 pb-3 border-b border-outline-variant/20 mb-3">
          <button type="button" id="conv-chat-back" class="text-on-surface-variant hover:text-primary">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] uppercase tracking-wider text-on-surface-variant">${_t('Chat con la convocatoria')}</div>
            <div class="text-sm font-bold text-on-surface truncate">${escapeHtml(title)}</div>
          </div>
        </div>
        <div id="conv-chat-messages" class="flex-1 overflow-y-auto space-y-3 mb-3 min-h-[300px]">
          <div class="text-xs text-on-surface-variant text-center py-6">
            ${_t('Pregúntame lo que quieras sobre esta convocatoria: presupuesto, quién puede aplicar, criterios de evaluación, fechas, qué entregar… Solo respondo en base al documento oficial.')}
          </div>
        </div>
        <div class="border-t border-outline-variant/20 pt-3">
          <form id="conv-chat-form" class="flex gap-2">
            <input id="conv-chat-input" type="text" placeholder="${_t('Escribe tu pregunta…')}"
              class="flex-1 px-4 py-2 rounded-full border border-outline-variant focus:border-primary focus:outline-none text-sm">
            <button type="submit" class="px-5 py-2 rounded-full bg-primary text-white text-sm font-bold hover:bg-violet">${_t('Enviar')}</button>
          </form>
          <div class="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            ${[_t('¿Cuál es el presupuesto?'), _t('¿Quién puede aplicar?'), _t('¿Qué documentos hay que entregar?'), _t('¿Cuáles son los criterios de evaluación?')].map(s =>
              `<button type="button" class="conv-chat-suggest px-2 py-1 rounded-full bg-cream hover:bg-lavender-soft text-primary" data-q="${escapeHtml(s)}">${escapeHtml(s)}</button>`
            ).join('')}
          </div>
        </div>
      </div>`;

    document.getElementById('conv-chat-back')?.addEventListener('click', () => {
      const item = allItems.find(i => i.source_id === sourceId);
      if (item) content.innerHTML = renderDetail(item);
    });
    document.getElementById('conv-chat-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const input = document.getElementById('conv-chat-input');
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      await sendChat(sourceId, q);
    });
    document.querySelectorAll('.conv-chat-suggest').forEach(btn => {
      btn.addEventListener('click', () => sendChat(sourceId, btn.dataset.q));
    });
  }

  async function sendChat(sourceId, q) {
    const msgs = document.getElementById('conv-chat-messages');
    if (!msgs) return;
    if (_chatThread.length === 0) msgs.innerHTML = ''; // clear placeholder
    _chatThread.push({ role: 'user', content: q });
    msgs.insertAdjacentHTML('beforeend', `
      <div class="flex justify-end">
        <div class="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm bg-primary text-white text-sm">${escapeHtml(q)}</div>
      </div>`);
    const thinkingId = 'thinking_' + Date.now();
    msgs.insertAdjacentHTML('beforeend', `
      <div id="${thinkingId}" class="flex justify-start">
        <div class="max-w-[80%] px-3 py-2 rounded-2xl rounded-tl-sm bg-cream text-on-surface-variant text-sm"><span class="spinner inline-block"></span> ${_t('Pensando…')}</div>
      </div>`);
    msgs.scrollTop = msgs.scrollHeight;
    try {
      const res = await API.post(`/convocatorias/${encodeURIComponent(sourceId)}/chat`, { messages: _chatThread });
      const ans = res.answer || _t('(sin respuesta)');
      _chatThread.push({ role: 'assistant', content: ans });
      document.getElementById(thinkingId)?.remove();
      msgs.insertAdjacentHTML('beforeend', `
        <div class="flex justify-start">
          <div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm bg-lavender-soft text-on-surface text-sm whitespace-pre-wrap">${escapeHtml(ans)}</div>
        </div>`);
      msgs.scrollTop = msgs.scrollHeight;
    } catch (e) {
      document.getElementById(thinkingId)?.remove();
      const msg = (e && (e.code === 'NO_VECTORS' || /no vectors/i.test(e.message || '')))
        ? _t('Esta convocatoria aún no está indexada para chat. Aparecerán pronto las nuevas.')
        : _t('Error: {error}', { error: e.message || e });
      msgs.insertAdjacentHTML('beforeend', `
        <div class="flex justify-start">
          <div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm bg-error-container/50 border border-error/20 text-error text-sm">${escapeHtml(msg)}</div>
        </div>`);
    }
  }

  async function openDetail(callId) {
    // Muro de login: el teaser deja explorar las cards, pero abrir el
    // detalle de una call exige cuenta (lead-gen).
    if (typeof App !== 'undefined' && App.requireLogin && !App.requireLogin({ what: _t('el detalle de esta convocatoria') })) return;
    const item = allItems.find(i => String(i.call_id) === String(callId));
    if (!item) return;
    if (typeof Track !== 'undefined') Track.event('call_opened', { route: 'convocatorias', ref_id: callId, programme: item.programme });
    const overlay = document.getElementById('convocatorias-drawer-overlay');
    const content = document.getElementById('convocatorias-drawer-content');
    if (!overlay || !content) return;

    content.innerHTML = renderDetail(item);
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (!document._convocatoriasDrawerCloseBound) {
      document._convocatoriasDrawerCloseBound = true;
      overlay.addEventListener('click', (e) => {
        if (!e.target.closest('#convocatorias-drawer-panel')) closeDetail();
      });
      document.getElementById('convocatorias-drawer-close')
        ?.addEventListener('click', closeDetail);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeDetail();
      });
      window.addEventListener('hashchange', () => {
        if (!overlay.classList.contains('hidden')) closeDetail();
      });
    }
    // Drawer-level delegation: chat button (re-renders on each open, so bind inside drawer scope)
    content.addEventListener('click', (e) => {
      const btn = e.target.closest('#conv-chat-open');
      if (btn) {
        e.preventDefault();
        openChat(btn.dataset.sourceId, btn.dataset.title);
        return;
      }
      // "Empezar mi visión": cierra el drawer y arranca EU Vision con esta call.
      const sv = e.target.closest('#conv-start-vision');
      if (sv) {
        e.preventDefault();
        closeDetail();
        if (typeof Vision !== 'undefined') Vision.startForCall(sv.dataset.callId);
      }
    });

    // Blindaje: si la lista se cargó en modo teaser (la petición salió sin
    // sesión válida), la tarjeta NO trae el detalle (FAQ, actividades, costes…)
    // y el drawer saldría incompleto en silencio. Re-pedimos el detalle
    // completo —ya con sesión— y re-renderizamos. Solo una vez por card.
    if (item.teaser && !item._detailFetched) {
      try {
        const res  = await API.get('/convocatorias/' + encodeURIComponent(item.call_id));
        const full = (res && res.data) || res;
        if (full && typeof full === 'object') {
          Object.assign(item, full);
          item.teaser = false;
          item._detailFetched = true;
          // Re-render solo si el drawer sigue mostrando ESTA card.
          if (!overlay.classList.contains('hidden')) content.innerHTML = renderDetail(item);
        }
      } catch (_) { /* dejamos el teaser ya pintado; no degradamos a error */ }
    }
  }

  function closeDetail() {
    const overlay = document.getElementById('convocatorias-drawer-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  return { init };
})();
