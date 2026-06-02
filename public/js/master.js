/* ═══════════════════════════════════════════════════════════════
   Master — UI Perfeccionar (2 sub-tabs)
   ═══════════════════════════════════════════════════════════════
   Estructura:
     - Tab 1 — Mejorar el Master:
         Compilar + diagnóstico + propuestas inline (Aceptar /
         Otra variante / Descartar) por sugerencia. Edición manual
         como acción secundaria. SIN chat conversacional.
     - Tab 2 — Preparar formulario oficial:
         Comprimir Master → form_field_values. Descargar Form Part B.

   Modelo IA proactiva:
     · La IA detecta gaps en el diagnóstico.
     · Al desplegar una sugerencia, la IA propone reescritura
       concreta del capítulo (one-shot, sin conversación).
     · El usuario solo decide: Aplicar / Otra variante / Descartar.

   Severidad reetiquetada:
     info → "menor", warning → "a revisar", critical → "prioritario".
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const Master = {};

  // Factory de estado: usado al cargar el módulo y cada vez que cambia el
  // proyecto activo. CENTRALIZADO para evitar olvidar campos al reinicializar.
  function _emptyState(projectId = null) {
    return {
      projectId,
      masterDoc: null,
      activeTab: 'improve',
      activeDiagnosis: null,
      compressResult: null,
      proposals: {},
      askAiResults: {},
      formPreview: null,
      formActiveItemId: null,
      formFieldEdits: {},
      formFieldProposals: {},
    };
  }
  let _state = _emptyState();

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mdLite(s) {
    let t = esc(s || '');
    t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+)$/gm, '<strong class="block mt-2 mb-1 text-on-surface">$1</strong>');
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return t;
  }

  function isAdmin() {
    return !!(typeof App !== 'undefined' && App.isAdmin && App.isAdmin());
  }

  function fmtMoney(usd) {
    if (usd === null || usd === undefined) return '—';
    if (usd < 0.01) return `~$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  }

  function fmtChars(n) {
    if (!n) return '0';
    if (n < 1000) return n + ' chars';
    return (n / 1000).toFixed(1) + 'k chars';
  }

  // Etiquetas y colores por severidad (renombradas y suavizadas).
  const SEVERITY_LABEL = { info: 'menor', warning: 'a revisar', critical: 'prioritario' };
  const SEVERITY_RING  = { info: 'border-blue-200 bg-blue-50', warning: 'border-amber-200 bg-amber-50', critical: 'border-rose-200 bg-rose-50' };
  const SEVERITY_BADGE = { info: 'bg-blue-100 text-blue-800', warning: 'bg-amber-100 text-amber-800', critical: 'bg-rose-100 text-rose-800' };
  function sevLabel(s) { return SEVERITY_LABEL[s] || SEVERITY_LABEL.warning; }
  function sevRing(s)  { return SEVERITY_RING[s]  || SEVERITY_RING.warning; }
  function sevBadge(s) { return SEVERITY_BADGE[s] || SEVERITY_BADGE.warning; }

  /* ── Render principal ──────────────────────────────────────── */

  async function render() {
    const root = document.getElementById('master-content');
    if (!root) return;

    const activeProject = (typeof App !== 'undefined' && App.getActiveProject) ? App.getActiveProject() : null;
    const projectId = activeProject?.id;
    if (!projectId) {
      _state = _emptyState();
      root.innerHTML = `
        <div class="bg-white border border-outline-variant/20 rounded-2xl p-8 text-center">
          <span class="material-symbols-outlined text-5xl text-outline-variant/40 mb-3 block">auto_stories</span>
          <h2 class="text-lg font-bold mb-2 text-on-surface">Documento Maestro</h2>
          <p class="text-sm text-on-surface-variant mb-3">Abre un proyecto desde "Mis Proyectos" para comenzar a perfeccionarlo.</p>
        </div>`;
      return;
    }

    if (_state.projectId !== projectId) {
      _state = _emptyState(projectId);
    }

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <span class="material-symbols-outlined text-secondary-fixed text-xl">auto_stories</span>
          </div>
          <div>
            <h2 class="font-headline text-xl font-extrabold text-primary tracking-tight">Perfeccionar</h2>
            <p class="text-xs text-on-surface-variant">Compila, mejora con IA y exporta el documento maestro del proyecto.</p>
          </div>
        </div>
        <div id="master-header-meta" class="text-xs text-on-surface-variant"></div>
      </div>

      <div id="master-tabs-bar"></div>
      <div id="master-tab-content"></div>
    `;

    await loadOrCreateMaster(projectId);
    renderTabsBar();
    await showTab(_state.activeTab);
  }

  async function loadOrCreateMaster(projectId) {
    try {
      let docs = await API.get(`/master/projects/${projectId}/documents`) || [];
      let doc = docs[0] || null;
      if (!doc) {
        doc = await API.post(`/master/projects/${projectId}/documents`, { versionTag: 'v1', language: 'es' });
      }
      const full = await API.get(`/master/documents/${doc.id}`);
      _state.masterDoc = full;
      _updateHeaderMeta();
    } catch (err) {
      console.error('[Master] loadOrCreateMaster error', err);
      _state.masterDoc = null;
    }
  }

  function _updateHeaderMeta() {
    const meta = document.getElementById('master-header-meta');
    if (!meta) return;
    if (!_state.masterDoc) { meta.textContent = ''; return; }
    const d = _state.masterDoc;
    const chapters = d.chapters || [];
    meta.innerHTML = `<span class="font-mono">${chapters.length} capítulos · ${fmtChars(d.total_chars)} · estado <strong>${esc(d.status)}</strong></span>`;
  }

  /* ── Barra de sub-tabs ──────────────────────────────────────── */

  function renderTabsBar() {
    const host = document.getElementById('master-tabs-bar');
    if (!host) return;
    const hasChapters = (_state.masterDoc?.chapters || []).length > 0;

    const TABS = [
      { id: 'improve',  icon: 'auto_fix_high', label: 'Mejorar el Master', disabled: false },
      { id: 'compress', icon: 'compress',      label: 'Preparar formulario oficial', disabled: !hasChapters },
    ];

    host.innerHTML = `
      <div class="flex items-center gap-1 mb-6 border-b border-outline-variant/30 pb-3 overflow-x-auto">
        ${TABS.map(t => {
          const active = _state.activeTab === t.id;
          const onclick = t.disabled ? '' : `onclick="Master.showTab('${t.id}')"`;
          const cls = active
            ? 'bg-primary text-white shadow-md'
            : (t.disabled ? 'text-on-surface-variant/40 cursor-not-allowed' : 'text-on-surface-variant hover:bg-surface-container-low');
          return `
            <button ${onclick} ${t.disabled ? 'disabled' : ''} class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${cls}">
              <span class="material-symbols-outlined text-sm">${t.icon}</span> ${esc(t.label)}
            </button>`;
        }).join('')}
      </div>
    `;
  }

  async function showTab(tabId) {
    if (!['improve', 'compress'].includes(tabId)) tabId = 'improve';
    _state.activeTab = tabId;
    renderTabsBar();
    const host = document.getElementById('master-tab-content');
    if (!host) return;
    host.innerHTML = '<div class="text-sm text-on-surface-variant py-6 text-center">Cargando...</div>';
    if (tabId === 'improve') return renderTabImprove(host);
    if (tabId === 'compress') return renderTabCompress(host);
  }

  /* ── Tab 1 — Mejorar el Master (unificada) ─────────────────── */

  async function renderTabImprove(host) {
    const doc = _state.masterDoc;
    if (!doc) { host.innerHTML = '<div class="text-sm text-red-600">No se ha podido cargar el Master.</div>'; return; }
    const chapters = doc.chapters || [];
    const noChapters = chapters.length === 0;
    const admin = isAdmin();

    // Cargar diagnóstico más reciente si no está en estado
    if (!noChapters && !_state.activeDiagnosis) {
      try {
        const diags = await API.get(`/master/documents/${doc.id}/diagnoses`) || [];
        const last = diags.find(d => d.status === 'ready');
        if (last) {
          const full = await API.get(`/master/diagnoses/${last.id}`);
          _state.activeDiagnosis = full;
        }
      } catch (_) {}
    }

    const diag = _state.activeDiagnosis;
    const hasDiag = !!diag;
    const items = hasDiag ? (diag.items || []) : [];
    const openItems = items.filter(i => i.state === 'open');
    const resolvedItems = items.filter(i => i.state === 'resolved');
    const dismissedItems = items.filter(i => i.state === 'dismissed');
    const allHandled = hasDiag && items.length > 0 && openItems.length === 0;
    const total = items.length;
    const handled = resolvedItems.length + dismissedItems.length;
    const pct = total > 0 ? Math.round((handled / total) * 100) : 0;

    // Agrupar items por capítulo (resuelto vía _resolveChapterForItem)
    const itemsByChapter = {};
    const orphanItems = [];
    for (const it of items) {
      const ch = _resolveChapterForItem(it);
      if (ch) {
        if (!itemsByChapter[ch.id]) itemsByChapter[ch.id] = [];
        itemsByChapter[ch.id].push(it);
      } else {
        orphanItems.push(it);
      }
    }

    host.innerHTML = `
      <div class="bg-white border border-outline-variant/20 rounded-2xl p-6">

        <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h3 class="font-bold text-base text-on-surface">${noChapters ? 'Crea la versión extendida del proyecto' : 'Mejora con IA capítulo a capítulo'}</h3>
            <p class="text-xs text-on-surface-variant mt-1">${noChapters
              ? 'El Master expande cada sección del formulario oficial a su forma completa, sin límites. Es la fuente de verdad de la que se destila el formulario después.'
              : 'La IA detecta gaps y propone una reescritura concreta para cada uno. Solo tienes que decidir: aplicar, pedir otra variante o descartar.'}</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap justify-end">
            ${_renderImproveHeaderActions(doc, noChapters, hasDiag, allHandled, admin)}
          </div>
        </div>


        ${hasDiag && total > 0 ? `
          <div class="mb-4 p-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-on-surface">Progreso · diagnóstico ${diag.diagnosis_kind === 'advanced' ? 'avanzado' : 'inicial'}</span>
              <span class="text-xs text-on-surface-variant">${handled} de ${total} ${total === 1 ? 'sugerencia abordada' : 'sugerencias abordadas'} · ${pct}%</span>
            </div>
            <div class="w-full h-2 bg-outline-variant/20 rounded-full overflow-hidden">
              <div class="h-full bg-primary transition-all" style="width:${pct}%"></div>
            </div>
            ${diag.summary ? `<p class="text-xs text-on-surface-variant mt-2 italic">${esc(diag.summary)}</p>` : ''}
            <div class="flex items-center justify-end mt-2">
              <button onclick="Master._showCreateItemForm('${esc(diag.id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors"><span class="material-symbols-outlined text-sm">add_circle</span>Añadir sugerencia manual</button>
            </div>
            <div id="master-create-item-form-host"></div>
          </div>
        ` : ''}

        ${noChapters ? `
          <div class="border-2 border-dashed border-outline-variant/30 rounded-xl p-8 text-center">
            <span class="material-symbols-outlined text-4xl text-outline-variant/40 mb-2 block">menu_book</span>
            <p class="text-sm text-on-surface-variant mb-1">Este Maestro está vacío.</p>
            <p class="text-xs text-on-surface-variant">Pulsa <strong>Compilar Maestro</strong>. La IA generará la primera versión a partir del Diseño, las entrevistas y los documentos del proyecto.</p>
            <p class="text-[10px] text-on-surface-variant mt-3 italic">El proceso tarda 8-15 min. Puedes salir de la pestaña; cada capítulo se guarda al terminar.</p>
          </div>
        ` : `
          <div class="space-y-2" id="master-chapters-list">
            ${chapters.map((ch, i) => {
              const chItems = itemsByChapter[ch.id] || [];
              const hasOpen = chItems.some(it => it.state === 'open');
              return renderChapterCard(ch, { items: chItems, startOpen: hasOpen || (!hasDiag && i === 0) });
            }).join('')}
          </div>
        `}

        ${orphanItems.length ? `
          <div class="mt-6">
            <h4 class="font-bold text-sm text-on-surface-variant mb-2 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base">help_outline</span>
              Sugerencias sin capítulo asignado (${orphanItems.length})
            </h4>
            <p class="text-xs text-on-surface-variant mb-3">El diagnóstico no logró anclar estas sugerencias a un capítulo concreto. Puedes resolverlas manualmente o descartarlas.</p>
            <div class="space-y-2">
              ${orphanItems.map(it => _renderItemBanner(it, chapters[0]?.id || '')).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    _injectFlashStyles();
  }

  function _renderImproveHeaderActions(doc, noChapters, hasDiag, allHandled, admin) {
    if (noChapters) {
      return `
        <button onclick="Master.compileV1('${esc(doc.id)}')" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 shadow-md transition-all"><span class="material-symbols-outlined text-sm">play_arrow</span>Compilar Maestro</button>
      `;
    }
    return `
      <button onclick="Master.runDiagnosis('${esc(doc.id)}', 'initial')" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${hasDiag ? 'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30' : 'bg-primary hover:bg-primary/90 text-white shadow-md'} transition-all">
        <span class="material-symbols-outlined text-sm">${hasDiag ? 'refresh' : 'fact_check'}</span>
        ${hasDiag ? 'Re-lanzar diagnóstico' : 'Lanzar diagnóstico'}
      </button>
      ${allHandled ? `<button onclick="Master.runDiagnosis('${esc(doc.id)}', 'advanced')" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 shadow-md transition-colors"><span class="material-symbols-outlined text-sm">psychology</span>Diagnóstico avanzado</button>` : ''}
      ${allHandled ? `<button onclick="Master.goToCompress()" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 shadow-md transition-all"><span class="material-symbols-outlined text-sm">arrow_forward</span>Pasar a Comprimir</button>` : ''}
    `;
  }

  function _renderCagInventory(cagInv, openByDefault) {
    return `
      <details class="mb-4 bg-surface-container-lowest border border-outline-variant/20 rounded-lg" ${openByDefault ? 'open' : ''}>
        <summary class="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-surface-container-low">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-base text-on-surface-variant">folder_open</span>
            <span class="font-bold text-sm">Documentos en contexto (CAG)</span>
            <span class="text-[9px] font-mono text-on-surface-variant uppercase bg-surface-container px-1.5 py-0.5 rounded">admin</span>
          </div>
          <span class="text-[10px] font-mono text-on-surface-variant">${(cagInv.docs || []).length} docs · ${(cagInv.total_tokens_estimated || 0).toLocaleString('es-ES')} tokens</span>
        </summary>
        <div class="px-4 py-3 border-t border-outline-variant/10 space-y-1.5">
          ${(cagInv.docs || []).length === 0
            ? `<p class="text-xs text-on-surface-variant italic">No hay documentos con texto extraído para esta convocatoria. El Maestro se compilará sólo con el Diseño del proyecto.</p>`
            : (cagInv.docs || []).map(d => `
                <div class="flex items-center gap-3 text-xs">
                  <span class="px-1.5 py-0.5 rounded ${d.origin === 'project' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'} text-[10px] font-bold whitespace-nowrap">${d.origin === 'project' ? 'PROYECTO' : 'CONVOCATORIA'}</span>
                  <span class="flex-1 truncate font-medium text-on-surface">${esc(d.title)}</span>
                  <span class="font-mono text-[10px] text-on-surface-variant whitespace-nowrap">${(d.tokens_estimated || 0).toLocaleString('es-ES')} tok</span>
                </div>
              `).join('')}
        </div>
      </details>
    `;
  }

  /* ── Tarjeta de capítulo ────────────────────────────────────── */

  function renderChapterCard(ch, opts) {
    opts = opts || {};
    const items = Array.isArray(opts.items) ? opts.items : [];
    const openItems = items.filter(i => i.state === 'open');
    const resolvedItems = items.filter(i => i.state === 'resolved');
    const startOpen = !!opts.startOpen;
    const id = ch.id;

    return `
      <details id="master-chapter-card-${esc(id)}" class="bg-surface-container-lowest border border-outline-variant/20 rounded-lg mb-2 transition-shadow ${openItems.length ? 'ring-1 ring-amber-300' : ''}" ${startOpen || openItems.length ? 'open' : ''} data-chapter-id="${esc(id)}">
        <summary class="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-surface-container-low">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[10px] font-mono text-on-surface-variant uppercase">${esc(ch.chapter_type)}</span>
            <span class="font-bold text-sm truncate">${esc(ch.title)}</span>
            ${openItems.length ? `<span class="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold whitespace-nowrap"><span class="material-symbols-outlined text-xs">priority_high</span>${openItems.length} ${openItems.length === 1 ? 'sugerencia' : 'sugerencias'}</span>` : ''}
            ${!openItems.length && resolvedItems.length ? `<span class="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold whitespace-nowrap"><span class="material-symbols-outlined text-xs">check_circle</span>${resolvedItems.length} resuelta${resolvedItems.length === 1 ? '' : 's'}</span>` : ''}
          </div>
          <span class="text-[10px] text-on-surface-variant ml-2 whitespace-nowrap">${fmtChars(ch.char_count)}</span>
        </summary>

        <div class="border-t border-outline-variant/10">
          ${items.length ? `<div class="px-4 pt-3 space-y-2" id="master-items-${esc(id)}">${items.map(it => _renderItemBanner(it, id)).join('')}</div>` : ''}

          <div class="px-4 py-3">
            <div id="master-chapter-view-${esc(id)}">
              <div class="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed" id="master-chapter-body-${esc(id)}">${mdLite(ch.body || '(vacío)')}</div>
              <div class="mt-3 flex justify-between items-center gap-2 flex-wrap">
                <button onclick="Master._toggleAskAi('${esc(id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors">
                  <span class="material-symbols-outlined text-sm">auto_fix_high</span>Pedir mejora a la IA…
                </button>
                <button onclick="Master._toggleEdit('${esc(id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">
                  <span class="material-symbols-outlined text-sm">edit</span>Editar manualmente
                </button>
              </div>
              <div id="master-ask-ai-${esc(id)}" class="hidden mt-3 border border-primary/30 rounded-lg p-3 bg-primary/5">
                <p class="text-[11px] text-on-surface-variant mb-2 italic">Dile a la IA qué quieres que mejore en este capítulo. Te devolverá una reescritura concreta que podrás aplicar o descartar.</p>
                <textarea id="master-ask-ai-input-${esc(id)}" rows="2" placeholder="Ej: hazlo más conciso, añade un párrafo sobre sostenibilidad, mejora la voz, etc." class="w-full px-2 py-2 text-xs border border-outline-variant/30 rounded resize-none"></textarea>
                <div class="flex items-center justify-end gap-2 mt-2">
                  <button onclick="Master._cancelAskAi('${esc(id)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Cancelar</button>
                  <button onclick="Master._submitAskAi('${esc(id)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all"><span class="material-symbols-outlined text-sm">auto_fix_high</span>Proponer mejora</button>
                </div>
                <div id="master-ask-ai-result-${esc(id)}" class="mt-3"></div>
              </div>
            </div>
            <div id="master-chapter-edit-${esc(id)}" class="hidden">
              <textarea id="master-chapter-textarea-${esc(id)}" class="w-full min-h-[260px] px-3 py-2 text-sm border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/15 font-mono">${esc(ch.body || '')}</textarea>
              <div class="mt-2 flex items-center justify-end gap-2">
                <button onclick="Master._cancelEdit('${esc(id)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Cancelar</button>
                <button onclick="Master._saveEdit('${esc(id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all"><span class="material-symbols-outlined text-sm">save</span>Guardar cambios</button>
              </div>
            </div>
          </div>
        </div>
      </details>
    `;
  }

  /* ── Banner de sugerencia (item del diagnóstico) ────────────── */

  function _renderItemBanner(it, chapterId) {
    const sev = sevRing(it.severity);
    const badge = sevBadge(it.severity);
    const label = sevLabel(it.severity);
    const isOpen = it.state === 'open';
    const opacity = isOpen ? '' : 'opacity-60';
    const isEconomic = it.classification === 'economic';

    return `
      <div class="border ${sev} ${opacity} rounded-lg p-3" data-item-id="${esc(it.id)}">
        <div class="flex items-start gap-2 mb-2">
          <span class="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${badge}">${esc(label)}</span>
          ${isEconomic ? `<span class="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-on-surface/5 border border-outline-variant/30 text-on-surface-variant"><span class="material-symbols-outlined text-[10px] align-middle">savings</span> económico</span>` : ''}
          ${!isOpen ? `<span class="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-on-surface/10 text-on-surface-variant">${it.state === 'resolved' ? '✓ resuelto' : '⊘ descartado'}</span>` : ''}
          <div class="flex-1 min-w-0">
            <div class="font-bold text-sm">${esc(it.title)}</div>
            ${it.detail ? `<div class="text-xs mt-1 text-on-surface-variant whitespace-pre-wrap">${mdLite(it.detail)}</div>` : ''}
            ${it.suggestion ? `<div class="text-xs mt-2 italic text-on-surface whitespace-pre-wrap"><span class="material-symbols-outlined text-xs align-middle text-amber-500">tips_and_updates</span> ${mdLite(it.suggestion)}</div>` : ''}
          </div>
        </div>

        ${isOpen && isEconomic ? `
          <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-current/10">
            <span class="text-[11px] italic text-on-surface-variant flex-1"><span class="material-symbols-outlined text-xs align-middle">info</span> Se arregla volviendo a <strong>Diseñar</strong> o <strong>Escribir</strong> (presupuesto, partners, contexto).</span>
            <button onclick="Master._patchItemState('${esc(it.id)}', 'resolved')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition-colors"><span class="material-symbols-outlined text-xs">check</span>Marcar como resuelto</button>
            <button onclick="Master._patchItemState('${esc(it.id)}', 'dismissed')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface-variant bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Descartar</button>
          </div>
        ` : ''}

        ${isOpen && !isEconomic ? `
          <div class="pt-2 border-t border-current/10">
            <div id="master-proposal-${esc(it.id)}">
              ${_renderProposalPanel(it, chapterId)}
            </div>
          </div>
        ` : ''}

        ${!isOpen ? `
          <div class="flex justify-end pt-2 border-t border-current/10">
            <button onclick="Master._patchItemState('${esc(it.id)}', 'open')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Reabrir</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  /* ── Panel de propuesta inline ──────────────────────────────── */

  function _renderProposalPanel(it, chapterId) {
    const proposal = _state.proposals[it.id];
    if (!proposal) {
      return `
        <div class="flex flex-wrap items-center gap-2">
          <button onclick="Master._loadProposalForItem('${esc(it.id)}', '${esc(chapterId)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all"><span class="material-symbols-outlined text-xs">auto_fix_high</span>Ver propuesta de la IA</button>
          <button onclick="Master._patchItemState('${esc(it.id)}', 'resolved')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Lo arreglo a mano</button>
          <button onclick="Master._patchItemState('${esc(it.id)}', 'dismissed')" class="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface-variant bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Descartar</button>
        </div>
      `;
    }
    if (proposal.loading) {
      return `
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
          <svg class="animate-spin h-4 w-4 text-primary" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          <span class="text-xs text-on-surface-variant italic">${proposal.attempts > 1 ? 'Generando otra variante…' : 'Generando propuesta…'}</span>
        </div>
      `;
    }
    if (proposal.error) {
      return `
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <span class="material-symbols-outlined text-sm text-red-600">error</span>
          <span class="text-xs text-red-700 flex-1">No se pudo generar propuesta: ${esc(proposal.error)}</span>
          <button onclick="Master._loadProposalForItem('${esc(it.id)}', '${esc(chapterId)}', { regenerate: true })" class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-white bg-primary hover:bg-primary/90">Reintentar</button>
        </div>
      `;
    }
    const newBody = proposal.new_body || '';
    return `
      <div class="space-y-2">
        ${proposal.rationale ? `<p class="text-[11px] text-on-surface-variant italic"><span class="material-symbols-outlined text-xs align-middle text-primary">auto_fix_high</span> ${esc(proposal.rationale)}</p>` : ''}
        <div class="bg-white border border-outline-variant/30 rounded-lg p-3 max-h-[280px] overflow-y-auto">
          <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Texto propuesto${proposal.attempts > 1 ? ` (variante ${proposal.attempts})` : ''}</div>
          <div class="prose prose-sm max-w-none whitespace-pre-wrap text-xs leading-relaxed">${mdLite(newBody)}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button onclick="Master._acceptProposal('${esc(it.id)}', '${esc(chapterId)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all"><span class="material-symbols-outlined text-xs">check</span>Aplicar al Master</button>
          <button onclick="Master._loadProposalForItem('${esc(it.id)}', '${esc(chapterId)}', { regenerate: true })" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors"><span class="material-symbols-outlined text-xs">refresh</span>Otra variante</button>
          <button onclick="Master._patchItemState('${esc(it.id)}', 'dismissed')" class="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface-variant bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Descartar</button>
        </div>
      </div>
    `;
  }

  function _refreshProposalPanel(itemId, chapterId) {
    const item = (_state.activeDiagnosis?.items || []).find(i => i.id === itemId);
    if (!item) return;
    const host = document.getElementById('master-proposal-' + itemId);
    if (!host) return;
    host.innerHTML = _renderProposalPanel(item, chapterId);
  }

  async function _loadProposalForItem(itemId, chapterId, opts) {
    opts = opts || {};
    const item = (_state.activeDiagnosis?.items || []).find(i => i.id === itemId);
    if (!item) return;

    const prev = _state.proposals[itemId];
    const attempts = (prev?.attempts || 0) + 1;
    _state.proposals[itemId] = { loading: true, attempts };
    _refreshProposalPanel(itemId, chapterId);

    // Instrucción concisa al endpoint propose-rewrite
    let instruction = `Aborda este punto del diagnóstico:\n\n${item.title}`;
    if (item.detail) instruction += `\n\nDetalle: ${item.detail}`;
    if (item.suggestion) instruction += `\n\nSugerencia: ${item.suggestion}`;

    try {
      const res = await API.post(`/master/chapters/${chapterId}/propose-rewrite`, { instruction, attempt: attempts });
      const data = res.data || res;
      if (!data.new_body) {
        _state.proposals[itemId] = { error: 'La IA no devolvió un texto reescrito. Pulsa reintentar.', attempts };
      } else {
        _state.proposals[itemId] = {
          new_body: data.new_body,
          rationale: data.rationale || '',
          attempts,
        };
      }
    } catch (e) {
      _state.proposals[itemId] = { error: (e.message || String(e)), attempts };
    }
    _refreshProposalPanel(itemId, chapterId);
  }

  async function _acceptProposal(itemId, chapterId) {
    const proposal = _state.proposals[itemId];
    if (!proposal || !proposal.new_body) return;
    const newBody = proposal.new_body;

    // Aplicar en backend (PATCH directo del chapter body)
    try {
      await API.patch(`/master/chapters/${chapterId}`, { body: newBody });
    } catch (e) {
      showToast('Error al aplicar', e.message || String(e), 'error');
      return;
    }

    // Actualizar estado local
    const ch = (_state.masterDoc?.chapters || []).find(c => c.id === chapterId);
    if (ch) { ch.body = newBody; ch.char_count = newBody.length; }
    // Refrescar body visual
    const bodyEl = document.getElementById('master-chapter-body-' + chapterId);
    if (bodyEl) bodyEl.innerHTML = mdLite(newBody);
    const ta = document.getElementById('master-chapter-textarea-' + chapterId);
    if (ta) ta.value = newBody;
    _updateHeaderMeta();

    // Marcar item como resuelto (silent — re-renderizamos manualmente)
    await _patchItemState(itemId, 'resolved', { silent: true, skipRerender: true });

    // Limpiar propuesta del estado
    delete _state.proposals[itemId];

    // Feedback visual: scroll + flash + toast
    const card = document.getElementById('master-chapter-card-' + chapterId);
    if (card) {
      card.open = true;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      _flashChapter(chapterId);
    }
    showToast('Mejora aplicada', 'El capítulo se actualizó con la propuesta de la IA.', 'success');

    // Re-render del tab (refresca banners e items)
    await showTab('improve');
  }

  /* ── "Pedir mejora a la IA" (libre, sin item) ───────────────── */

  function _toggleAskAi(chapterId) {
    const box = document.getElementById('master-ask-ai-' + chapterId);
    if (!box) return;
    const isHidden = box.classList.contains('hidden');
    box.classList.toggle('hidden');
    if (isHidden) {
      setTimeout(() => document.getElementById('master-ask-ai-input-' + chapterId)?.focus(), 50);
    }
  }
  function _cancelAskAi(chapterId) {
    const box = document.getElementById('master-ask-ai-' + chapterId);
    if (box) box.classList.add('hidden');
    const result = document.getElementById('master-ask-ai-result-' + chapterId);
    if (result) result.innerHTML = '';
    const input = document.getElementById('master-ask-ai-input-' + chapterId);
    if (input) input.value = '';
    delete _state.askAiResults[chapterId];
  }
  async function _submitAskAi(chapterId) {
    const input = document.getElementById('master-ask-ai-input-' + chapterId);
    const result = document.getElementById('master-ask-ai-result-' + chapterId);
    if (!input || !result) return;
    const instr = input.value.trim();
    if (!instr) { showToast('Escribe una instrucción', '', 'error'); return; }

    result.innerHTML = `
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
        <svg class="animate-spin h-4 w-4 text-primary" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        <span class="text-xs text-on-surface-variant italic">Generando propuesta…</span>
      </div>
    `;

    try {
      const res = await API.post(`/master/chapters/${chapterId}/propose-rewrite`, { instruction: instr, attempt: 1 });
      const data = res.data || res;
      if (!data.new_body) {
        result.innerHTML = `<div class="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">La IA no devolvió un texto reescrito. Reformula tu instrucción.</div>`;
        return;
      }
      // Guardar en estado (NO en atributo HTML) para evitar problemas de escape.
      _state.askAiResults[chapterId] = { new_body: data.new_body, rationale: data.rationale || '' };
      result.innerHTML = `
        <div class="space-y-2">
          ${data.rationale ? `<p class="text-[11px] text-on-surface-variant italic"><span class="material-symbols-outlined text-xs align-middle text-primary">auto_fix_high</span> ${esc(data.rationale)}</p>` : ''}
          <div class="bg-white border border-outline-variant/30 rounded-lg p-3 max-h-[280px] overflow-y-auto">
            <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Texto propuesto</div>
            <div class="prose prose-sm max-w-none whitespace-pre-wrap text-xs leading-relaxed">${mdLite(data.new_body)}</div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="Master._acceptAskAi('${esc(chapterId)}', this)" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all"><span class="material-symbols-outlined text-xs">check</span>Aplicar al Master</button>
            <button onclick="Master._submitAskAi('${esc(chapterId)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors"><span class="material-symbols-outlined text-xs">refresh</span>Otra variante</button>
            <button onclick="Master._cancelAskAi('${esc(chapterId)}')" class="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface-variant bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Descartar</button>
          </div>
        </div>
      `;
    } catch (e) {
      result.innerHTML = `<div class="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">Error: ${esc(e.message || String(e))}</div>`;
    }
  }
  async function _acceptAskAi(chapterId, btn) {
    const stored = _state.askAiResults[chapterId];
    if (!stored || !stored.new_body) {
      showToast('Propuesta no encontrada', 'Vuelve a generar la propuesta y aplica.', 'error');
      return;
    }
    const newBody = stored.new_body;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined text-xs">check</span>Aplicando…'; }
    try {
      await API.patch(`/master/chapters/${chapterId}`, { body: newBody });
      const ch = (_state.masterDoc?.chapters || []).find(c => c.id === chapterId);
      if (ch) { ch.body = newBody; ch.char_count = newBody.length; }
      const bodyEl = document.getElementById('master-chapter-body-' + chapterId);
      if (bodyEl) bodyEl.innerHTML = mdLite(newBody);
      const ta = document.getElementById('master-chapter-textarea-' + chapterId);
      if (ta) ta.value = newBody;
      _updateHeaderMeta();
      _cancelAskAi(chapterId);
      delete _state.askAiResults[chapterId];
      _flashChapter(chapterId);
      showToast('Mejora aplicada', 'El capítulo se actualizó con la propuesta de la IA.', 'success');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-xs">check</span>Aplicar al Master'; }
      console.error('[_acceptAskAi] error', e);
      showToast('Error al aplicar', e.message || String(e), 'error');
    }
  }

  /* ── Resolver capítulo a partir de un item del diagnóstico ─── */

  function _resolveChapterForItem(item) {
    if (!item) return null;
    const chapters = _state.masterDoc?.chapters || [];
    if (item.anchor_kind === 'chapter' && item.anchor_id) {
      const aid = String(item.anchor_id);
      let ch = chapters.find(c => c.chapter_key === aid);
      if (!ch) ch = chapters.find(c => c.id === aid);
      if (ch) return ch;
    }
    if (item.anchor_label) {
      const lbl = item.anchor_label.toLowerCase();
      const ch = chapters.find(c =>
        (c.title || '').toLowerCase().includes(lbl) ||
        (c.chapter_key || '').toLowerCase().includes(lbl.replace(/\s+/g, '_'))
      );
      if (ch) return ch;
    }
    if (item.anchor_kind === 'wp') {
      const ch = chapters.find(c => (c.chapter_key || '').startsWith('ch_4_2_wp_'));
      if (ch) return ch;
    }
    return null;
  }

  /* ── Edición manual del body ────────────────────────────────── */

  function _toggleEdit(chapterId) {
    document.getElementById('master-chapter-view-' + chapterId)?.classList.add('hidden');
    document.getElementById('master-chapter-edit-' + chapterId)?.classList.remove('hidden');
    document.getElementById('master-chapter-textarea-' + chapterId)?.focus();
  }
  function _cancelEdit(chapterId) {
    const ch = (_state.masterDoc?.chapters || []).find(c => c.id === chapterId);
    const ta = document.getElementById('master-chapter-textarea-' + chapterId);
    if (ta && ch) ta.value = ch.body || '';
    document.getElementById('master-chapter-edit-' + chapterId)?.classList.add('hidden');
    document.getElementById('master-chapter-view-' + chapterId)?.classList.remove('hidden');
  }
  async function _saveEdit(chapterId) {
    const ta = document.getElementById('master-chapter-textarea-' + chapterId);
    if (!ta) return;
    const newBody = ta.value;
    try {
      const res = await API.patch(`/master/chapters/${chapterId}`, { body: newBody });
      const saved = res.data || res;
      const ch = (_state.masterDoc?.chapters || []).find(c => c.id === chapterId);
      if (ch) {
        ch.body = saved.body || newBody;
        ch.char_count = (saved.body || newBody).length;
      }
      const bodyEl = document.getElementById('master-chapter-body-' + chapterId);
      if (bodyEl) bodyEl.innerHTML = mdLite(saved.body || newBody);
      _cancelEdit(chapterId);
      _updateHeaderMeta();
      _flashChapter(chapterId);
      showToast('Cambios guardados', '', 'success');
    } catch (e) {
      showToast('Error al guardar', e.message || String(e), 'error');
    }
  }

  /* ── Items: estado y creación manual ────────────────────────── */

  async function _patchItemState(itemId, state, opts) {
    opts = opts || {};
    try {
      const res = await API.patch(`/master/diagnosis-items/${itemId}`, { state });
      if (_state.activeDiagnosis && Array.isArray(_state.activeDiagnosis.items)) {
        const idx = _state.activeDiagnosis.items.findIndex(i => i.id === itemId);
        if (idx >= 0) _state.activeDiagnosis.items[idx] = res.data || res;
      }
      if (!opts.skipRerender && _state.activeTab === 'improve') await showTab('improve');
      if (!opts.silent) {
        showToast(state === 'resolved' ? 'Marcado como resuelto' : state === 'dismissed' ? 'Descartado' : 'Reabierto', '', 'success');
      }
    } catch (e) {
      showToast('Error al actualizar', e.message || String(e), 'error');
    }
  }

  function _showCreateItemForm(diagnosisId) {
    const host = document.getElementById('master-create-item-form-host');
    if (!host) return;
    host.innerHTML = `
      <div class="bg-white border-2 border-primary/30 rounded-xl p-4 mt-3">
        <h5 class="font-bold text-sm mb-2 flex items-center gap-1.5"><span class="material-symbols-outlined text-base">add_circle</span>Crear sugerencia manual</h5>
        <p class="text-xs text-on-surface-variant mb-3">¿Hay algo que el diagnóstico automático no detectó y quieres abordar? Añádelo aquí.</p>
        <div class="grid grid-cols-2 gap-2 mb-2">
          <input id="ci-title" placeholder="Título de la sugerencia (obligatorio)" class="col-span-2 px-2 py-1.5 text-xs border border-outline-variant/30 rounded" />
          <select id="ci-classification" class="px-2 py-1.5 text-xs border border-outline-variant/30 rounded">
            <option value="narrative">Narrativa</option>
            <option value="economic">Económica</option>
          </select>
          <select id="ci-severity" class="px-2 py-1.5 text-xs border border-outline-variant/30 rounded">
            <option value="info">Menor</option>
            <option value="warning" selected>A revisar</option>
            <option value="critical">Prioritaria</option>
          </select>
          <textarea id="ci-detail" placeholder="Detalle (opcional)" rows="2" class="col-span-2 px-2 py-1.5 text-xs border border-outline-variant/30 rounded resize-none"></textarea>
          <textarea id="ci-suggestion" placeholder="Sugerencia / qué hacer (opcional)" rows="2" class="col-span-2 px-2 py-1.5 text-xs border border-outline-variant/30 rounded resize-none"></textarea>
        </div>
        <div class="flex gap-2 justify-end">
          <button onclick="Master._cancelCreateItem()" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Cancelar</button>
          <button onclick="Master._submitCustomItem('${esc(diagnosisId)}')" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 shadow-md transition-all">Añadir</button>
        </div>
      </div>
    `;
  }
  function _cancelCreateItem() {
    const host = document.getElementById('master-create-item-form-host');
    if (host) host.innerHTML = '';
  }
  async function _submitCustomItem(diagnosisId) {
    const title = (document.getElementById('ci-title')?.value || '').trim();
    if (!title) { showToast('Falta el título', '', 'error'); return; }
    const payload = {
      title,
      classification: document.getElementById('ci-classification')?.value || 'narrative',
      severity: document.getElementById('ci-severity')?.value || 'warning',
      detail: (document.getElementById('ci-detail')?.value || '').trim() || null,
      suggestion: (document.getElementById('ci-suggestion')?.value || '').trim() || null,
    };
    try {
      const res = await API.post(`/master/diagnoses/${diagnosisId}/items`, payload);
      if (_state.activeDiagnosis && Array.isArray(_state.activeDiagnosis.items)) {
        _state.activeDiagnosis.items.push(res.data || res);
      }
      _cancelCreateItem();
      await showTab('improve');
      showToast('Sugerencia añadida', '', 'success');
    } catch (e) {
      showToast('Error al crear sugerencia', e.message || String(e), 'error');
    }
  }

  /* ── Flash visual sobre un capítulo recién actualizado ──────── */

  function _injectFlashStyles() {
    if (document.getElementById('master-flash-styles')) return;
    const s = document.createElement('style');
    s.id = 'master-flash-styles';
    s.textContent = `
      .master-chapter-flash {
        animation: masterChapterFlash 1.4s ease-out;
      }
      @keyframes masterChapterFlash {
        0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0); background: rgba(34,197,94,0.18); }
        20%  { box-shadow: 0 0 0 6px rgba(34,197,94,0.18); background: rgba(34,197,94,0.18); }
        100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); background: transparent; }
      }
    `;
    document.head.appendChild(s);
  }
  function _flashChapter(chapterId) {
    const card = document.getElementById('master-chapter-card-' + chapterId);
    if (!card) return;
    card.classList.remove('master-chapter-flash');
    void card.offsetWidth; // restart animation
    card.classList.add('master-chapter-flash');
    setTimeout(() => card.classList.remove('master-chapter-flash'), 1500);
  }

  /* ── Tab 2 — Preparar formulario oficial ───────────────────── */

  async function renderTabCompress(host) {
    const doc = _state.masterDoc;
    if (!doc) { host.innerHTML = '<div class="text-sm text-red-600">No hay Master cargado.</div>'; return; }
    const projectId = doc.project_id;

    host.innerHTML = `<div class="text-sm text-on-surface-variant py-6 text-center"><span class="material-symbols-outlined animate-spin text-base align-middle">progress_activity</span> Cargando previsualización del formulario…</div>`;

    // Cargar preview (no llama al LLM, solo lee BD + form_field_values)
    let preview;
    try {
      preview = await API.get(`/exporter/projects/${projectId}/form-part-b/preview`);
    } catch (e) {
      host.innerHTML = `<div class="bg-white border border-red-200 rounded-2xl p-6 text-sm text-red-700">No se pudo cargar la previsualización: ${esc(e.message || e)}</div>`;
      return;
    }
    _state.formPreview = preview;

    const g = preview.global || {};
    const sections = preview.sections || [];
    const allItems = sections.flatMap(s => s.items);
    const firstFilled = allItems.find(i => i.is_filled) || allItems[0];
    if (!_state.formActiveItemId || !allItems.find(i => i.id === _state.formActiveItemId)) {
      _state.formActiveItemId = firstFilled ? firstFilled.id : null;
    }

    const pagesPct = g.target_pages ? Math.round((g.total_pages_estimate / g.target_pages) * 100) : 0;
    const pageColor = g.total_pages_estimate > g.target_pages + 10
      ? 'text-red-700 bg-red-50 border-red-200'
      : g.total_pages_estimate > g.target_pages - 5
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-green-700 bg-green-50 border-green-200';
    const pageBarColor = g.total_pages_estimate > g.target_pages + 10 ? 'bg-red-500'
      : g.total_pages_estimate > g.target_pages - 5 ? 'bg-amber-500' : 'bg-primary';

    host.innerHTML = `
      <div class="bg-white border border-outline-variant/20 rounded-2xl p-6">

        <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h3 class="font-bold text-base text-on-surface">Preparar formulario oficial</h3>
            <p class="text-xs text-on-surface-variant mt-1">Vista previa del Form Part B (EACEA) campo a campo. Edita lo que quieras y descarga el .docx cuando estés listo.</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap justify-end">
            <button onclick="Master._seedFromMaster('${esc(doc.id)}')" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 shadow-md transition-all" title="Copia el contenido del Master a cada campo sin llamar al LLM (gratis, instantáneo)"><span class="material-symbols-outlined text-sm">content_copy</span>Rellenar desde Master (sin IA)</button>
            <button onclick="Master._recompressAll('${esc(doc.id)}')" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors" title="Re-genera cada campo con IA (cuesta dinero, 2-5 min)"><span class="material-symbols-outlined text-sm">refresh</span>Re-comprimir con IA</button>
            <div class="flex flex-col gap-0.5">
              <label for="master-export-lang" class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Idioma descarga</label>
              <select id="master-export-lang" class="px-2 py-1.5 rounded-lg bg-white border border-outline-variant text-on-surface text-xs focus:border-primary outline-none">
                <option value="">Mismo que trabajo</option>
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="pt">Português</option>
                <option value="nl">Nederlands</option>
                <option value="pl">Polski</option>
                <option value="ro">Română</option>
                <option value="el">Ελληνικά</option>
                <option value="cs">Čeština</option>
                <option value="da">Dansk</option>
                <option value="fi">Suomi</option>
                <option value="sv">Svenska</option>
                <option value="hu">Magyar</option>
                <option value="bg">Български</option>
                <option value="hr">Hrvatski</option>
                <option value="sk">Slovenčina</option>
                <option value="sl">Slovenščina</option>
                <option value="et">Eesti</option>
                <option value="lv">Latviešu</option>
                <option value="lt">Lietuvių</option>
                <option value="is">Íslenska</option>
                <option value="no">Norsk</option>
                <option value="sr">Srpski</option>
                <option value="tr">Türkçe</option>
              </select>
            </div>
            <button onclick="Master._downloadFormDocx('${esc(projectId || '')}')" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 shadow-md transition-colors"><span class="material-symbols-outlined text-sm">picture_as_pdf</span>Descargar Form Part B (.docx)</button>
          </div>
        </div>

        <!-- Medidor global -->
        <div class="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="border ${pageColor} rounded-lg p-3">
            <div class="text-[10px] uppercase font-bold tracking-wider opacity-80">Páginas estimadas</div>
            <div class="text-2xl font-extrabold">${g.total_pages_estimate || 0} <span class="text-xs font-normal opacity-70">/ ${g.target_pages || 120}</span></div>
            <div class="w-full h-1.5 rounded-full bg-white/50 mt-1 overflow-hidden">
              <div class="h-full ${pageBarColor}" style="width: ${Math.min(100, pagesPct)}%"></div>
            </div>
          </div>
          <div class="border border-outline-variant/30 bg-surface-container-lowest rounded-lg p-3">
            <div class="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Campos narrativos</div>
            <div class="text-2xl font-extrabold text-on-surface">${g.narrative_filled || 0} <span class="text-xs font-normal opacity-70">/ ${g.narrative_total || 0}</span> rellenados</div>
            <div class="text-[10px] text-on-surface-variant mt-1">${(g.narrative_chars_used || 0).toLocaleString('es-ES')} / ${(g.narrative_chars_cap || 0).toLocaleString('es-ES')} caracteres</div>
          </div>
          <div class="border border-outline-variant/30 bg-surface-container-lowest rounded-lg p-3">
            <div class="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Estructurado</div>
            <div class="text-xs text-on-surface space-y-0.5 mt-1">
              <div>${g.wp_count || 0} Work Packages</div>
              <div>${g.partner_count || 0} partners · ${(preview.tables_summary?.staff?.count || 0)} staff</div>
              <div>${g.eu_projects_count || 0} proyectos UE previos</div>
            </div>
          </div>
        </div>

        <!-- Layout sidebar + panel -->
        <div class="flex gap-0 items-start border border-outline-variant/20 rounded-2xl overflow-hidden" style="min-height: 60vh">

          <aside class="w-72 flex-shrink-0 bg-[#edf2f9] border-r border-outline-variant/20 flex flex-col">
            <div class="px-4 py-3 border-b border-outline-variant/20">
              <div class="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Secciones del formulario</div>
            </div>
            <div class="flex-1 overflow-y-auto p-2" style="max-height: 75vh">
              ${sections.map(sec => `
                <div class="mb-3">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant px-2 py-1">${esc(sec.label)}</div>
                  ${(sec.items || []).map(it => _renderSidebarItem(it)).join('')}
                </div>
              `).join('')}
            </div>
          </aside>

          <main class="flex-1 bg-white p-6 overflow-y-auto" style="max-height: 75vh" id="form-preview-main">
            ${_renderFormFieldPanel(_state.formActiveItemId)}
          </main>

        </div>
      </div>
    `;
  }

  function _renderSidebarItem(it) {
    const isActive = _state.formActiveItemId === it.id;
    const cls = isActive
      ? 'bg-primary text-white shadow-sm'
      : 'text-on-surface hover:bg-white/60';
    let icon = 'description';
    if (it.kind === 'wp') icon = 'view_module';
    else if (it.kind === 'declaration') icon = 'check_box';
    else if (it.kind === 'narrative_with_table') icon = 'table_view';
    else if (it.kind === 'staff_effort_matrix') icon = 'groups';

    // Estado visual
    let badge = '';
    if (it.warnings && it.warnings.length) {
      if (it.warnings.includes('no_value') || it.warnings.includes('no_tasks')) {
        badge = `<span class="material-symbols-outlined text-xs ${isActive ? 'text-white/80' : 'text-amber-500'}">warning</span>`;
      } else if (it.warnings.some(w => w.startsWith('over_limit'))) {
        badge = `<span class="material-symbols-outlined text-xs ${isActive ? 'text-white/80' : 'text-red-500'}">priority_high</span>`;
      } else if (it.warnings.includes('table_empty')) {
        badge = `<span class="material-symbols-outlined text-xs ${isActive ? 'text-white/80' : 'text-amber-500'}">warning</span>`;
      }
    } else if (it.is_filled && it.kind !== 'wp' && it.kind !== 'declaration') {
      badge = `<span class="material-symbols-outlined text-xs ${isActive ? 'text-white/80' : 'text-green-600'}">check_circle</span>`;
    }
    return `
      <button onclick="Master._selectFormField('${esc(it.id)}')" class="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg ${cls} mb-0.5 transition-colors">
        <span class="material-symbols-outlined text-sm mt-0.5 flex-shrink-0 ${isActive ? '' : 'text-on-surface-variant'}">${icon}</span>
        <div class="flex-1 min-w-0">
          <div class="text-[11px] font-mono opacity-80">${esc(it.number)}</div>
          <div class="text-xs font-medium truncate">${esc(it.label)}</div>
        </div>
        ${badge}
      </button>
    `;
  }

  function _selectFormField(itemId) {
    _state.formActiveItemId = itemId;
    // Re-render solo el panel central + actualizar sidebar (highlight)
    const main = document.getElementById('form-preview-main');
    if (main) main.innerHTML = _renderFormFieldPanel(itemId);
    // Highlight nuevo en sidebar
    document.querySelectorAll('aside button').forEach(btn => {
      const wasActive = btn.classList.contains('bg-primary');
      const text = btn.textContent || '';
      const isThis = btn.getAttribute('onclick') === `Master._selectFormField('${itemId}')`;
      if (isThis && !wasActive) {
        btn.classList.remove('text-on-surface', 'hover:bg-white/60');
        btn.classList.add('bg-primary', 'text-white', 'shadow-sm');
      } else if (!isThis && wasActive) {
        btn.classList.remove('bg-primary', 'text-white', 'shadow-sm');
        btn.classList.add('text-on-surface', 'hover:bg-white/60');
      }
    });
  }

  function _renderFormFieldPanel(itemId) {
    if (!itemId || !_state.formPreview) {
      return `<div class="text-sm text-on-surface-variant py-12 text-center">Selecciona un campo en la izquierda para ver su contenido.</div>`;
    }
    const allItems = _state.formPreview.sections.flatMap(s => s.items);
    const it = allItems.find(i => i.id === itemId);
    if (!it) return `<div class="text-sm text-red-600">Campo no encontrado.</div>`;

    if (it.kind === 'wp') return _renderWpPanel(it);
    if (it.kind === 'declaration') return _renderDeclarationPanel(it);
    if (it.kind === 'staff_effort_matrix') return _renderStaffEffortMatrix(it);
    return _renderNarrativePanel(it); // narrative + narrative_with_table
  }

  function _renderStaffEffortMatrix(it) {
    const rows = it.matrix_rows || [];
    const totalsByWp = it.matrix_totals_by_wp || [];
    const totalPm = it.matrix_total_pm || 0;
    const fmt = n => {
      if (!n || Number(n) === 0) return '—';
      const v = Number(n);
      return v % 1 === 0 ? String(v) : v.toFixed(1).replace('.0','');
    };

    if (!rows.length) {
      return `<div class="text-sm text-amber-700">No hay partners definidos en este proyecto.</div>`;
    }

    return `
      <div class="flex items-start justify-between mb-4 gap-4">
        <div>
          <div class="text-[11px] font-mono text-on-surface-variant uppercase">4.2 · Staff effort</div>
          <h4 class="font-headline text-lg font-bold text-on-surface">Staff effort per participant</h4>
          <p class="text-xs text-on-surface-variant mt-1">Number of person/months per partner over the whole project duration. WP-leader figures appear in <strong>bold</strong>.</p>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase tracking-wider text-on-surface-variant">Total project effort</div>
          <div class="font-headline text-2xl font-extrabold text-primary">${fmt(totalPm)} <span class="text-xs font-normal">PM</span></div>
        </div>
      </div>

      <div class="border border-outline-variant/30 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[11px]">
            <thead class="bg-surface-container-lowest">
              <tr class="text-on-surface-variant">
                <th class="px-3 py-2 text-left font-bold text-[10px] uppercase">Participant</th>
                ${rows[0].cells.map(c => `<th class="px-2 py-2 text-right font-bold text-[10px] uppercase whitespace-nowrap" title="${esc(c.wp_title)}">${esc(c.wp_code)}</th>`).join('')}
                <th class="px-3 py-2 text-right font-bold text-[10px] uppercase bg-primary/5">Total PM</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `<tr class="border-t border-outline-variant/10">
                <td class="px-3 py-2 text-on-surface whitespace-nowrap">
                  <span class="font-semibold">${esc(r.partner_acronym || r.partner_name)}</span>
                  ${r.is_coordinator ? '<span class="ml-1 text-[9px] uppercase bg-primary/10 text-primary px-1 rounded">coord.</span>' : ''}
                  <div class="text-[10px] text-on-surface-variant/70 truncate max-w-[200px]" title="${esc(r.partner_name)}">${esc(r.partner_name)}</div>
                </td>
                ${r.cells.map(c => {
                  const isZero = !c.pm || Number(c.pm) === 0;
                  const cls = isZero ? 'text-on-surface-variant/40' : (c.is_leader ? 'font-extrabold text-primary' : 'font-mono');
                  return `<td class="px-2 py-2 text-right ${cls} text-[11px]">${fmt(c.pm)}</td>`;
                }).join('')}
                <td class="px-3 py-2 text-right font-mono font-bold bg-primary/5">${fmt(r.total)}</td>
              </tr>`).join('')}
              <tr class="border-t-2 border-outline-variant/30 bg-surface-container-low font-bold">
                <td class="px-3 py-2 text-on-surface uppercase text-[10px]">Total per WP</td>
                ${totalsByWp.map(t => `<td class="px-2 py-2 text-right font-mono">${fmt(t.pm)}</td>`).join('')}
                <td class="px-3 py-2 text-right font-mono font-extrabold bg-primary/10">${fmt(totalPm)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-3 py-2 bg-surface-container-lowest text-[10px] text-on-surface-variant italic">
          Cálculo: PM = A.Personnel € / (tarifa-día del rol × 22). Cada rol usa su propia tarifa (Manager / Profesional / Técnico / Auxiliar), no una media. WP-leader marcado en <strong class="text-primary">bold</strong>.
        </div>
      </div>
    `;
  }

  function _renderNarrativePanel(it) {
    // Garantiza que los buckets existen aunque _state se haya reinicializado parcialmente.
    if (!_state.formFieldProposals) _state.formFieldProposals = {};
    if (!_state.formFieldEdits) _state.formFieldEdits = {};
    const charPct = it.max_chars ? Math.round((it.char_count / it.max_chars) * 100) : 0;
    const charColor = !it.max_chars ? 'text-on-surface-variant'
      : it.char_count > it.max_chars ? 'text-red-700'
      : it.char_count > it.max_chars * 0.95 ? 'text-amber-700' : 'text-on-surface-variant';
    const proposal = _state.formFieldProposals[it.id];
    const isEdited = _state.formFieldEdits[it.id] !== undefined;
    const docId = _state.masterDoc?.id || '';
    const warnings = Array.isArray(it.warnings) ? it.warnings : [];

    return `
      <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <div class="text-[11px] font-mono text-on-surface-variant uppercase">${esc(it.number)}</div>
          <h4 class="font-headline text-lg font-bold text-on-surface">${esc(it.label)}</h4>
          <div class="flex items-center gap-3 mt-1">
            <span class="text-xs ${charColor}"><strong>${it.char_count.toLocaleString('es-ES')}</strong>${it.max_chars ? ` / ${it.max_chars.toLocaleString('es-ES')}` : ''} chars · ~${it.page_estimate} pág</span>
            ${it.is_filled ? `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-green-100 text-green-700">✓ rellenado</span>` : `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">sin contenido</span>`}
            ${warnings.some(w => w.startsWith('over_limit')) ? `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700">excede límite</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap justify-end">
          ${docId && it.chapter_key ? `<button onclick="Master._recompressField('${esc(docId)}','${esc(it.id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors"><span class="material-symbols-outlined text-sm">refresh</span>Re-comprimir desde el Master</button>` : ''}
          <button onclick="Master._toggleFormAskAi('${esc(it.id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors"><span class="material-symbols-outlined text-sm">auto_fix_high</span>Pedir mejora a la IA</button>
        </div>
      </div>

      ${it.max_chars ? `
        <div class="w-full h-1.5 rounded-full bg-outline-variant/20 mb-3 overflow-hidden">
          <div class="h-full ${it.char_count > it.max_chars ? 'bg-red-500' : it.char_count > it.max_chars * 0.95 ? 'bg-amber-500' : 'bg-primary'}" style="width: ${Math.min(100, charPct)}%"></div>
        </div>
      ` : ''}

      <div class="mb-4">
        <textarea id="form-field-text-${esc(it.id)}" rows="16" oninput="Master._onFormFieldEdit('${esc(it.id)}', this.value)" class="w-full px-3 py-2 text-sm border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/15 font-serif leading-relaxed">${esc(isEdited ? _state.formFieldEdits[it.id] : (it.value || ''))}</textarea>
        ${isEdited ? `
          <div class="flex items-center justify-between mt-2">
            <span class="text-[11px] italic text-amber-700"><span class="material-symbols-outlined text-xs align-middle">edit</span> Hay cambios sin guardar</span>
            <div class="flex gap-2">
              <button onclick="Master._cancelFormFieldEdit('${esc(it.id)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Descartar cambios</button>
              <button onclick="Master._saveFormFieldEdit('${esc(it.id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all"><span class="material-symbols-outlined text-sm">save</span>Guardar edición</button>
            </div>
          </div>
        ` : ''}
      </div>

      <div id="form-ask-ai-${esc(it.id)}" class="hidden border border-primary/30 rounded-lg p-3 bg-primary/5 mt-3">
        <p class="text-[11px] text-on-surface-variant mb-2 italic">Dile a la IA qué quieres mejorar en este campo. La propuesta respetará el límite oficial de caracteres.</p>
        <textarea id="form-ask-ai-input-${esc(it.id)}" rows="2" placeholder="Ej: refuerza el alineamiento con la prioridad X de la convocatoria, etc." class="w-full px-2 py-2 text-xs border border-outline-variant/30 rounded resize-none"></textarea>
        <div class="flex items-center justify-end gap-2 mt-2">
          <button onclick="Master._cancelFormAskAi('${esc(it.id)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Cancelar</button>
          <button onclick="Master._submitFormAskAi('${esc(it.id)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all"><span class="material-symbols-outlined text-sm">auto_fix_high</span>Proponer mejora</button>
        </div>
        <div id="form-ask-ai-result-${esc(it.id)}" class="mt-3"></div>
      </div>

      ${it.kind === 'narrative_with_table' && it.table_rows ? _renderInlineTable(it) : ''}
    `;
  }

  function _renderInlineTable(it) {
    if (!it.table_rows || !it.table_rows.length) {
      return `
        <div class="mt-4 border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div class="flex items-center gap-2 mb-1">
            <span class="material-symbols-outlined text-amber-600">warning</span>
            <span class="font-bold text-sm text-amber-800">Tabla ${esc(it.table_label || '')} vacía</span>
          </div>
          <p class="text-xs text-amber-700">El formulario oficial requiere esta tabla. Rellénala en la pestaña <strong>Escribir</strong> (Consorcio / Riesgos / Actividades) antes de descargar.</p>
        </div>
      `;
    }
    const headers = Object.keys(it.table_rows[0]);
    return `
      <div class="mt-4 border border-outline-variant/30 rounded-lg overflow-hidden">
        <div class="px-3 py-2 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
          <span class="text-xs font-bold text-on-surface">Tabla ${esc(it.table_label || '')} · ${it.table_rows.length} ${it.table_rows.length === 1 ? 'fila' : 'filas'}</span>
          <span class="text-[10px] text-on-surface-variant italic">Solo lectura. Para editar, ve a Escribir.</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-surface-container-lowest">
              <tr>${headers.map(h => `<th class="px-2 py-1.5 text-left font-bold text-[10px] uppercase text-on-surface-variant border-b border-outline-variant/20">${esc(h.replace(/_/g, ' '))}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${it.table_rows.map(row => `<tr class="border-b border-outline-variant/10">${headers.map(h => `<td class="px-2 py-1.5 align-top text-on-surface">${esc(row[h] || '')}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function _renderWpPanel(wp) {
    return `
      <div class="flex items-start justify-between mb-4 gap-4">
        <div>
          <div class="text-[11px] font-mono text-on-surface-variant uppercase">${esc(wp.number)} · ${esc(wp.wp_code || '')}</div>
          <h4 class="font-headline text-lg font-bold text-on-surface">${esc(wp.wp_title || wp.label)}</h4>
          <div class="text-xs text-on-surface-variant mt-1 flex items-center gap-3 flex-wrap">
            <span>Duración: <strong>${esc(wp.wp_duration)}</strong></span>
            ${wp.person_months > 0 ? `<span>· Effort: <strong>${wp.person_months} PM</strong></span>` : ''}
            ${wp.budget && wp.budget.total > 0 ? `<span>· Budget: <strong>${Math.round(wp.budget.total).toLocaleString('es-ES')} €</strong></span>` : ''}
          </div>
        </div>
      </div>
      ${wp.wp_objectives ? `
        <div class="mb-4 p-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg">
          <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Objetivos</div>
          <p class="text-sm whitespace-pre-wrap">${esc(wp.wp_objectives)}</p>
        </div>
      ` : ''}
      ${_renderWpBudgetTable(wp.budget)}
      ${_renderWpSubtable('Tasks', wp.tasks, ['task_no', 'task_name', 'task_description'])}
      ${_renderWpSubtable('Milestones', wp.milestones, ['ms_no', 'ms_name', 'ms_due', 'ms_description'])}
      ${_renderWpSubtable('Deliverables', wp.deliverables, ['del_no', 'del_name', 'del_type', 'del_due', 'del_description'])}
    `;
  }

  // Tabla oficial "Estimated budget — Resources" del Form Part B
  // Columnas según template EACEA:
  // Participant · Costs (PM) · A Personnel · B Subcontracting ·
  // C.1a Travel (€) · C.1b Accommodation (travels) · (persons travelling) · C.1c Subsistence ·
  // C.2 Equipment · C.3 Other · D.1 FSTP · E Indirect · Total
  function _renderWpBudgetTable(budget) {
    if (!budget || !Array.isArray(budget.rows) || !budget.rows.length) {
      return `
        <div class="mt-4 border border-amber-200 bg-amber-50 rounded-lg p-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-amber-600 text-base">warning</span>
          <span class="text-xs text-amber-800"><strong>Sin presupuesto</strong> para este WP. Crea o regenera el budget en <strong>Diseñar / Calculator</strong>.</span>
        </div>
      `;
    }
    const fmt = n => Math.round(Number(n) || 0).toLocaleString('es-ES');
    const rowsWithMoney = budget.rows.filter(r => Number(r.total) > 0 || Number(r.person_months) > 0);
    if (!rowsWithMoney.length) {
      return `
        <div class="mt-4 border border-amber-200 bg-amber-50 rounded-lg p-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-amber-600 text-base">warning</span>
          <span class="text-xs text-amber-800"><strong>Budget vacío</strong> para este WP. Asigna actividades en Calculator.</span>
        </div>
      `;
    }

    // Totales por columna
    const totals = rowsWithMoney.reduce((t, r) => ({
      pm:        t.pm        + (Number(r.person_months)      || 0),
      a:         t.a         + (Number(r.a_personnel)        || 0),
      b:         t.b         + (Number(r.b_subcontracting)   || 0),
      c1a:       t.c1a       + (Number(r.c1a_travel)         || 0),
      travels:   t.travels   + (Number(r.travels)            || 0),
      persons:   t.persons   + (Number(r.persons_travelling) || 0),
      c1c:       t.c1c       + (Number(r.c1c_subsistence)    || 0),
      c2:        t.c2        + (Number(r.c2_equipment)       || 0),
      c3:        t.c3        + (Number(r.c3_other)           || 0),
      d1:        t.d1        + (Number(r.d1_third_parties)   || 0),
      indirect:  t.indirect  + (Number(r.e_indirect)         || 0),
      total:     t.total     + (Number(r.total)              || 0),
    }), { pm:0, a:0, b:0, c1a:0, travels:0, persons:0, c1c:0, c2:0, c3:0, d1:0, indirect:0, total:0 });

    const numCell = (v, opts) => {
      const zero = !v || Number(v) === 0;
      const cls = zero ? 'text-on-surface-variant/40' : (opts && opts.bold ? 'font-semibold' : '');
      return `<td class="px-1.5 py-1.5 text-right font-mono text-[10.5px] ${cls}">${zero ? '—' : fmt(v)}</td>`;
    };

    return `
      <div class="mt-4 border border-outline-variant/30 rounded-lg overflow-hidden">
        <div class="px-3 py-1.5 bg-surface-container-low text-xs font-bold text-on-surface flex items-center justify-between">
          <span><span class="material-symbols-outlined text-base align-middle mr-1">account_balance_wallet</span>Estimated budget — Resources</span>
          <span class="text-on-surface-variant">Total WP: <strong>${fmt(budget.total)} €</strong></span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-[10.5px]">
            <thead class="bg-surface-container-lowest">
              <tr class="text-on-surface-variant">
                <th class="px-1.5 py-1 text-left font-bold text-[9.5px] uppercase">Participant</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase" title="Person-months">Costs (PM)</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">A. Personnel</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">B. Subc.</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">C.1a Travel €</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase" title="Number of travels">Travels</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase" title="Persons travelling">Persons</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">C.1c Subsist.</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">C.2 Equip.</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">C.3 Other</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">D.1 FSTP</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">E. Indirect</th>
                <th class="px-1.5 py-1 text-right font-bold text-[9.5px] uppercase">Total €</th>
              </tr>
            </thead>
            <tbody>
              ${rowsWithMoney.map(r => {
                const roles = Array.isArray(r.by_role) ? r.by_role.filter(x => Number(x.a_personnel) > 0) : [];
                const mainRow = `<tr class="border-t border-outline-variant/10">
                <td class="px-1.5 py-1.5 text-on-surface whitespace-nowrap font-semibold">${esc(r.acronym || r.name || '?')}${r.is_coordinator ? ' <span class="text-[9px] uppercase bg-primary/10 text-primary px-1 rounded">coord.</span>' : ''}</td>
                ${numCell(r.person_months)}
                ${numCell(r.a_personnel)}
                ${numCell(r.b_subcontracting)}
                ${numCell(r.c1a_travel)}
                ${numCell(r.travels)}
                ${numCell(r.persons_travelling)}
                ${numCell(r.c1c_subsistence)}
                ${numCell(r.c2_equipment)}
                ${numCell(r.c3_other)}
                ${numCell(r.d1_third_parties)}
                ${numCell(r.e_indirect)}
                <td class="px-1.5 py-1.5 text-right font-mono font-bold text-[10.5px]">${fmt(r.total)}</td>
              </tr>`;
                const subRows = roles.map(rr => `<tr class="border-t border-outline-variant/5 bg-surface-container-lowest/50 text-on-surface-variant">
                <td class="px-1.5 py-0.5 pl-6 whitespace-nowrap text-[10px] italic">└ ${esc(rr.role_label || rr.line_item)}${rr.rate > 0 ? ` <span class="text-[9px] text-on-surface-variant/60">(${fmt(rr.rate)} €/día)</span>` : ' <span class="text-[9px] text-amber-700">(sin tarifa)</span>'}</td>
                ${numCell(rr.person_months)}
                ${numCell(rr.a_personnel)}
                <td colspan="10" class="px-1.5 py-0.5"></td>
              </tr>`).join('');
                return mainRow + subRows;
              }).join('')}
              <tr class="border-t-2 border-outline-variant/30 bg-surface-container-low font-bold">
                <td class="px-1.5 py-1.5 text-on-surface uppercase text-[10px]">Total</td>
                ${numCell(totals.pm, {bold:true})}
                ${numCell(totals.a, {bold:true})}
                ${numCell(totals.b, {bold:true})}
                ${numCell(totals.c1a, {bold:true})}
                ${numCell(totals.travels, {bold:true})}
                ${numCell(totals.persons, {bold:true})}
                ${numCell(totals.c1c, {bold:true})}
                ${numCell(totals.c2, {bold:true})}
                ${numCell(totals.c3, {bold:true})}
                ${numCell(totals.d1, {bold:true})}
                ${numCell(totals.indirect, {bold:true})}
                <td class="px-1.5 py-1.5 text-right font-mono font-extrabold">${fmt(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-3 py-1.5 bg-surface-container-lowest text-[10px] text-on-surface-variant italic">Indirect ${budget.indirect_pct || 0}% sobre directos · datos del Calculator/Designer · PM = A.Personnel € / (tarifa-día del rol × 22) — un PM por rol con su tarifa propia.</div>
      </div>
    `;
  }

  function _renderWpSubtable(label, rows, columns) {
    if (!rows || !rows.length) {
      return `
        <div class="mt-4 border border-amber-200 bg-amber-50 rounded-lg p-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-amber-600 text-base">warning</span>
          <span class="text-xs text-amber-800"><strong>${esc(label)}</strong> vacío — rellénalo en Escribir → ${esc(label === 'Tasks' ? 'Tareas' : label === 'Milestones' ? 'Entregables (milestones)' : 'Entregables')}.</span>
        </div>
      `;
    }
    return `
      <div class="mt-4 border border-outline-variant/30 rounded-lg overflow-hidden">
        <div class="px-3 py-1.5 bg-surface-container-low text-xs font-bold text-on-surface">${esc(label)} (${rows.length})</div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-surface-container-lowest">
              <tr>${columns.map(c => `<th class="px-2 py-1.5 text-left font-bold text-[10px] uppercase text-on-surface-variant">${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map(row => `<tr class="border-t border-outline-variant/10">${columns.map(c => `<td class="px-2 py-1.5 align-top text-on-surface">${esc(row[c] || '')}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function _renderDeclarationPanel(it) {
    return `
      <div class="flex items-start justify-between mb-4 gap-4">
        <div>
          <div class="text-[11px] font-mono text-on-surface-variant uppercase">${esc(it.number)}</div>
          <h4 class="font-headline text-lg font-bold text-on-surface">${esc(it.label)}</h4>
        </div>
      </div>
      <div class="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
        <p class="font-bold mb-1"><span class="material-symbols-outlined text-base align-middle">info</span> Declaración administrativa</p>
        <p class="text-xs">Las declaraciones de la sección 6 (double funding, FSTP, Seal of Excellence) se rellenan directamente en el portal EACEA al subir el formulario. La IA no las genera.</p>
      </div>
    `;
  }

  function _onFormFieldEdit(fieldId, newValue) {
    _state.formFieldEdits[fieldId] = newValue;
    // Sólo re-render del panel para mostrar los botones Guardar/Descartar
    const main = document.getElementById('form-preview-main');
    if (main && _state.formActiveItemId === fieldId) {
      // Re-render manteniendo focus/selection es complejo — mejor solo
      // mostrar/ocultar el bloque "hay cambios sin guardar". Truco simple:
      // si no estaba en estado isEdited y ahora sí, re-renderizo. Una vez
      // editing, el panel ya tiene los botones.
      const wasEditingMarker = main.querySelector('[data-editing-marker]');
      if (!wasEditingMarker) {
        // primera edición: re-render
        const sel = document.getElementById('form-field-text-' + fieldId)?.selectionStart;
        main.innerHTML = _renderFormFieldPanel(fieldId);
        const ta = document.getElementById('form-field-text-' + fieldId);
        if (ta) { ta.focus(); if (sel != null) ta.setSelectionRange(sel, sel); }
      }
    }
  }

  async function _saveFormFieldEdit(fieldId) {
    const instanceId = _state.formPreview?.instance_id;
    if (!instanceId) { showToast('Falta instance_id', 'Re-comprime el formulario primero.', 'error'); return; }
    const newValue = _state.formFieldEdits[fieldId];
    if (newValue == null) return;
    try {
      const res = await API.patch(`/exporter/form-field-values/${instanceId}/${fieldId}`, { value_text: newValue });
      const data = res.data || res;
      // Actualizar estado local
      const allItems = _state.formPreview.sections.flatMap(s => s.items);
      const it = allItems.find(i => i.id === fieldId);
      if (it) {
        it.value = data.value_text;
        it.char_count = data.char_count;
        it.is_filled = data.value_text && data.value_text.trim().length > 50;
        it.warnings = it.warnings.filter(w => !w.startsWith('over_limit') && w !== 'no_value');
        if (data.char_count > (it.max_chars || Infinity)) it.warnings.push(`over_limit_by_${data.char_count - it.max_chars}`);
        if (!it.is_filled) it.warnings.push('no_value');
      }
      delete _state.formFieldEdits[fieldId];
      showToast('Cambios guardados', data.truncated ? 'Se aplicó truncado para no exceder el límite.' : '', 'success');
      // Re-render del tab para refrescar medidor + sidebar
      await showTab('compress');
    } catch (e) {
      console.error('[_saveFormFieldEdit]', e);
      showToast('Error al guardar', e.message || String(e), 'error');
    }
  }

  function _cancelFormFieldEdit(fieldId) {
    delete _state.formFieldEdits[fieldId];
    const main = document.getElementById('form-preview-main');
    if (main) main.innerHTML = _renderFormFieldPanel(fieldId);
  }

  function _toggleFormAskAi(fieldId) {
    const box = document.getElementById('form-ask-ai-' + fieldId);
    if (!box) return;
    const isHidden = box.classList.contains('hidden');
    box.classList.toggle('hidden');
    if (isHidden) setTimeout(() => document.getElementById('form-ask-ai-input-' + fieldId)?.focus(), 50);
  }
  function _cancelFormAskAi(fieldId) {
    const box = document.getElementById('form-ask-ai-' + fieldId);
    if (box) box.classList.add('hidden');
    const result = document.getElementById('form-ask-ai-result-' + fieldId);
    if (result) result.innerHTML = '';
    const input = document.getElementById('form-ask-ai-input-' + fieldId);
    if (input) input.value = '';
    delete _state.formFieldProposals[fieldId];
  }
  async function _submitFormAskAi(fieldId) {
    // Reutiliza propose-rewrite del Master para refinar el campo.
    // El "chapter" del Master mapeado al field es el que se reescribe;
    // luego se re-comprime el field automáticamente.
    const item = _state.formPreview.sections.flatMap(s => s.items).find(i => i.id === fieldId);
    if (!item || !item.chapter_key) {
      showToast('Sin capítulo mapeado', 'No se puede refinar este campo con IA.', 'error');
      return;
    }
    const chapter = (_state.masterDoc?.chapters || []).find(c => c.chapter_key === item.chapter_key);
    if (!chapter) {
      showToast('Capítulo no encontrado', `Falta capítulo ${item.chapter_key}`, 'error');
      return;
    }
    const input = document.getElementById('form-ask-ai-input-' + fieldId);
    const result = document.getElementById('form-ask-ai-result-' + fieldId);
    const instr = (input?.value || '').trim();
    if (!instr) { showToast('Escribe una instrucción', '', 'error'); return; }

    if (result) result.innerHTML = `
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
        <svg class="animate-spin h-4 w-4 text-primary" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        <span class="text-xs text-on-surface-variant italic">Generando propuesta para este campo…</span>
      </div>`;

    try {
      // Llamada al propose-rewrite del Master para reescribir el capítulo
      // con la instrucción. Luego habrá que re-comprimirlo para que respete
      // el límite del field. Por simplicidad y coste: aplicamos directamente
      // al field truncando al cap.
      const res = await API.post(`/master/chapters/${chapter.id}/propose-rewrite`, { instruction: instr + (item.max_chars ? `\n\nNOTA: el texto resultante se truncará a ${item.max_chars} caracteres. Sé conciso pero completo.` : ''), attempt: 1 });
      const data = res.data || res;
      if (!data.new_body) {
        if (result) result.innerHTML = `<div class="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">La IA no devolvió texto. Reformula la instrucción.</div>`;
        return;
      }
      _state.formFieldProposals[fieldId] = { new_body: data.new_body, rationale: data.rationale };
      if (result) result.innerHTML = `
        <div class="space-y-2">
          ${data.rationale ? `<p class="text-[11px] text-on-surface-variant italic"><span class="material-symbols-outlined text-xs align-middle text-primary">auto_fix_high</span> ${esc(data.rationale)}</p>` : ''}
          <div class="bg-white border border-outline-variant/30 rounded-lg p-3 max-h-[260px] overflow-y-auto">
            <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Texto propuesto (${data.new_body.length} chars${item.max_chars ? ` · cap: ${item.max_chars}` : ''})</div>
            <div class="prose prose-sm max-w-none whitespace-pre-wrap text-xs leading-relaxed">${mdLite(data.new_body)}</div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="Master._acceptFormProposal('${esc(fieldId)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all"><span class="material-symbols-outlined text-xs">check</span>Aplicar al formulario</button>
            <button onclick="Master._submitFormAskAi('${esc(fieldId)}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors"><span class="material-symbols-outlined text-xs">refresh</span>Otra variante</button>
            <button onclick="Master._cancelFormAskAi('${esc(fieldId)}')" class="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-on-surface-variant bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 transition-colors">Descartar</button>
          </div>
        </div>
      `;
    } catch (e) {
      if (result) result.innerHTML = `<div class="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">Error: ${esc(e.message || String(e))}</div>`;
    }
  }

  async function _acceptFormProposal(fieldId) {
    const stored = _state.formFieldProposals[fieldId];
    const instanceId = _state.formPreview?.instance_id;
    if (!stored || !instanceId) { showToast('Propuesta no encontrada', '', 'error'); return; }
    try {
      // Persistir el texto propuesto en form_field_values (con truncado defensivo en backend)
      const res = await API.patch(`/exporter/form-field-values/${instanceId}/${fieldId}`, { value_text: stored.new_body });
      const data = res.data || res;
      const it = _state.formPreview.sections.flatMap(s => s.items).find(i => i.id === fieldId);
      if (it) {
        it.value = data.value_text;
        it.char_count = data.char_count;
        it.is_filled = true;
        it.warnings = (it.warnings || []).filter(w => !w.startsWith('over_limit') && w !== 'no_value');
        if (data.char_count > (it.max_chars || Infinity)) it.warnings.push(`over_limit_by_${data.char_count - it.max_chars}`);
      }
      delete _state.formFieldProposals[fieldId];
      _cancelFormAskAi(fieldId);
      showToast('Propuesta aplicada', data.truncated ? 'Se aplicó truncado para respetar el límite.' : '', 'success');
      await showTab('compress');
    } catch (e) {
      showToast('Error al aplicar', e.message || String(e), 'error');
    }
  }

  async function _recompressField(docId, fieldId) {
    if (!confirm('Re-comprimir este campo desde el Master sobrescribirá cualquier edición manual previa. ¿Continuar?')) return;
    showToast('Re-comprimiendo campo…', 'Suele tardar 10-30s', 'info');
    try {
      const res = await API.post(`/master/documents/${docId}/compress-field/${fieldId}`, { target_language: 'es' });
      const data = res.data || res;
      const it = _state.formPreview.sections.flatMap(s => s.items).find(i => i.id === fieldId);
      if (it) {
        it.value = data.value_text;
        it.char_count = data.char_count;
        it.is_filled = true;
      }
      showToast('Campo re-comprimido', `${data.char_count} chars`, 'success');
      await showTab('compress');
    } catch (e) {
      showToast('Error al re-comprimir', e.message || String(e), 'error');
    }
  }

  async function _recompressAll(docId) {
    if (!confirm('¿Re-comprimir todos los campos del formulario con IA?\n\nEsto sobrescribe cualquier edición manual y vuelve a generar todo desde el Master con la IA (~2-5 min, 15-20 llamadas al LLM, coste ~$3-5).')) return;
    await compressToForm(docId);
  }

  async function _seedFromMaster(docId) {
    if (!confirm('¿Rellenar el formulario copiando el contenido del Master?\n\nEsto NO usa IA: copia cada capítulo del Master directamente al campo correspondiente del formulario, truncando al límite oficial. Es instantáneo y gratis. Sobrescribirá cualquier contenido previo en los campos.')) return;
    const banner = document.createElement('div');
    banner.id = 'master-seed-banner';
    banner.className = 'fixed top-16 left-1/2 -translate-x-1/2 bg-primary text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm font-bold';
    banner.innerHTML = '<span class="material-symbols-outlined align-middle text-base mr-1 animate-spin">progress_activity</span> Copiando del Master al formulario…';
    document.body.appendChild(banner);
    try {
      const res = await API.post(`/master/documents/${docId}/seed-form-from-master`, {});
      const data = res.data || res;
      banner.remove();
      const seeded = data.seeded || 0;
      const errors = data.errors || 0;
      showToast(
        errors ? 'Formulario rellenado parcialmente' : 'Formulario rellenado',
        `${seeded} campos · ${errors ? errors + ' errores · ' : ''}sin coste de API`,
        errors ? 'warning' : 'success'
      );
      _state.compressResult = data;
      await showTab('compress');
    } catch (e) {
      banner.remove();
      showToast('Error al rellenar', e.message || String(e), 'error');
    }
  }

  /* ── Acciones rápidas del header ────────────────────────────── */

  function goToCompress() { showTab('compress'); }

  async function previewCompile(masterDocId) {
    try {
      const d = await API.post(`/master/documents/${masterDocId}/compile-v1`, { dryRun: true });
      alert(
        `PREVIEW COMPILACIÓN MAESTRO\n\n` +
        `Tokens input estimados: ~${d.inputTokensEst.toLocaleString('en')}\n` +
        `Cacheables (estables entre llamadas): ~${(d.cacheableTokensEst || 0).toLocaleString('en')}\n\n` +
        `Coste estimado primera llamada: ${fmtMoney(d.estimatedFirstCallCostUsd)}\n` +
        `Coste estimado llamadas posteriores (cache hit): ${fmtMoney(d.estimatedCachedCallCostUsd)}\n`
      );
    } catch (err) {
      alert('Error en preview: ' + (err.message || err));
    }
  }

  /* ── Working overlay (igual que antes) ──────────────────────── */

  let workingTimer = null;
  let workingStart = 0;
  let subtitleTimer = null;

  function injectOverlayStyles() {
    if (document.getElementById('master-overlay-styles')) return;
    const s = document.createElement('style');
    s.id = 'master-overlay-styles';
    s.textContent = `
      #master-working-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        animation: master-fade-in .25s ease-out;
      }
      @keyframes master-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .master-working-card {
        background: white; border-radius: 24px; padding: 36px 44px;
        box-shadow: 0 20px 60px rgba(0,0,0,.25);
        max-width: 480px; text-align: center;
        border: 1px solid rgba(22, 163, 74, .15);
      }
      .master-pencil-wrapper { position: relative; width: 96px; height: 96px; margin: 0 auto 20px; }
      .master-pencil-paper {
        position: absolute; inset: 0; border-radius: 12px;
        background: linear-gradient(180deg, #ffffff, #f8fafc);
        border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,.06);
      }
      .master-pencil-paper::before, .master-pencil-paper::after {
        content: ''; position: absolute; left: 14px; right: 14px; height: 2px; border-radius: 2px;
        background: linear-gradient(90deg, transparent 0%, #16A34A 50%, transparent 100%);
        background-size: 200% 100%; animation: master-line-write 1.4s ease-in-out infinite;
      }
      .master-pencil-paper::before { top: 30px; }
      .master-pencil-paper::after  { top: 50px; animation-delay: .35s; }
      .master-pencil-line-3 {
        position: absolute; left: 14px; right: 32px; top: 70px; height: 2px; border-radius: 2px;
        background: linear-gradient(90deg, transparent 0%, #16A34A 50%, transparent 100%);
        background-size: 200% 100%; animation: master-line-write 1.4s ease-in-out infinite;
        animation-delay: .7s;
      }
      @keyframes master-line-write {
        0%   { background-position: 200% 0; opacity: .3; }
        50%  { background-position: 0% 0;   opacity: 1; }
        100% { background-position: -200% 0; opacity: .3; }
      }
      .master-pencil-icon {
        position: absolute; bottom: -6px; right: -6px;
        width: 40px; height: 40px; border-radius: 50%;
        background: #16A34A; color: white;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(22,163,74,.4);
        animation: master-pencil-bounce 1.4s ease-in-out infinite;
      }
      @keyframes master-pencil-bounce {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        25%      { transform: translate(-6px, -3px) rotate(-8deg); }
        50%      { transform: translate(-12px, 0) rotate(0deg); }
        75%      { transform: translate(-6px, 3px) rotate(8deg); }
      }
      .master-working-title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
      .master-working-subtitle { font-size: 13px; color: #475569; min-height: 20px; transition: opacity .3s; }
      .master-working-elapsed { margin-top: 16px; font-size: 11px; color: #94a3b8; font-variant-numeric: tabular-nums; }
      .master-working-tip { margin-top: 18px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; font-style: italic; }
      .master-stream-viewer {
        margin-top: 20px; max-height: 240px; overflow-y: auto;
        background: #0f172a; color: #cbd5e1; border-radius: 12px; padding: 14px 16px;
        font-family: ui-monospace, SF Mono, Menlo, monospace; font-size: 11px; line-height: 1.5;
        text-align: left; white-space: pre-wrap; word-break: break-word; scroll-behavior: smooth; position: relative;
      }
      .master-stream-viewer::after { content: '▋'; color: #16A34A; animation: master-cursor-blink 1s steps(1) infinite; }
      @keyframes master-cursor-blink { 50% { opacity: 0; } }
      .master-stream-empty { color: #64748b; font-style: italic; }
      .master-chapter-list {
        margin-top: 16px; text-align: left; max-height: 200px; overflow-y: auto;
        background: #f8fafc; border-radius: 12px; padding: 10px 14px; border: 1px solid #e2e8f0;
      }
      .master-chapter-item {
        display: flex; align-items: center; gap: 8px; padding: 4px 0;
        font-size: 11px; color: #475569; transition: color .25s;
      }
      .master-chapter-item.done { color: #16A34A; font-weight: 600; }
      .master-chapter-item.current { color: #0f172a; font-weight: 700; }
      .master-chapter-item.failed { color: #dc2626; }
      .master-chapter-icon { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .master-chapter-icon .material-symbols-outlined { font-size: 14px; }
      .master-chapter-item.current .master-chapter-icon { animation: master-current-pulse 1s ease-in-out infinite; }
      @keyframes master-current-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.25); } }
    `;
    document.head.appendChild(s);
  }

  function showWorking(title, subtitles, tip, { showStream = false, showChapterList = false } = {}) {
    injectOverlayStyles();
    hideWorking();
    const overlay = document.createElement('div');
    overlay.id = 'master-working-overlay';
    overlay.innerHTML = `
      <div class="master-working-card" style="${(showStream || showChapterList) ? 'max-width: 680px;' : ''}">
        <div class="master-pencil-wrapper">
          <div class="master-pencil-paper"></div>
          <div class="master-pencil-line-3"></div>
          <div class="master-pencil-icon"><span class="material-symbols-outlined" style="font-size: 22px;">edit</span></div>
        </div>
        <div class="master-working-title">${esc(title)}</div>
        <div class="master-working-subtitle" id="master-working-sub">${esc(subtitles[0] || '')}</div>
        <div class="master-working-elapsed" id="master-working-elapsed">0s</div>
        ${showChapterList ? `<div class="master-chapter-list" id="master-chapter-list"><div class="master-chapter-item"><div class="master-chapter-icon"><span class="material-symbols-outlined">schedule</span></div>Esperando plan de compilación…</div></div>` : ''}
        ${showStream ? `<div class="master-stream-viewer" id="master-stream-viewer"><span class="master-stream-empty">Conectando con el modelo y enviando el contexto…</span></div>` : ''}
        ${tip ? `<div class="master-working-tip">${esc(tip)}</div>` : ''}
      </div>`;
    document.body.appendChild(overlay);
    workingStart = Date.now();
    workingTimer = setInterval(() => {
      const elap = Math.floor((Date.now() - workingStart) / 1000);
      const m = Math.floor(elap / 60);
      const s = elap % 60;
      const el = document.getElementById('master-working-elapsed');
      if (el) el.textContent = m > 0 ? `${m}m ${s}s` : `${s}s`;
    }, 500);
    if (subtitles.length > 1) {
      let i = 0;
      subtitleTimer = setInterval(() => {
        i = (i + 1) % subtitles.length;
        const sub = document.getElementById('master-working-sub');
        if (!sub) return;
        sub.style.opacity = '0';
        setTimeout(() => { sub.textContent = subtitles[i]; sub.style.opacity = '1'; }, 300);
      }, 6500);
    }
  }
  function hideWorking() {
    if (workingTimer) { clearInterval(workingTimer); workingTimer = null; }
    if (subtitleTimer) { clearInterval(subtitleTimer); subtitleTimer = null; }
    const overlay = document.getElementById('master-working-overlay');
    if (overlay) overlay.remove();
  }

  let streamBuffer = '';
  let currentChapterKey = null;
  function appendToStreamViewer(text, chapterKey) {
    const viewer = document.getElementById('master-stream-viewer');
    if (!viewer) return;
    if (chapterKey && chapterKey !== currentChapterKey) {
      currentChapterKey = chapterKey;
      streamBuffer = '';
      viewer.innerHTML = '';
    }
    if (viewer.querySelector('.master-stream-empty')) viewer.innerHTML = '';
    streamBuffer += text;
    const display = streamBuffer.length > 3000 ? '…' + streamBuffer.slice(-3000) : streamBuffer;
    viewer.textContent = display;
    viewer.scrollTop = viewer.scrollHeight;
  }
  function resetStreamBuffer() { streamBuffer = ''; currentChapterKey = null; }

  function renderChapterPlan(chapters) {
    const list = document.getElementById('master-chapter-list');
    if (!list) return;
    list.innerHTML = chapters.map((c, i) => `
      <div class="master-chapter-item" data-chapter-key="${esc(c.key)}">
        <div class="master-chapter-icon"><span class="material-symbols-outlined">radio_button_unchecked</span></div>
        <span><strong>${i + 1}.</strong> ${esc(c.title)}</span>
      </div>
    `).join('');
  }
  function markChapterCurrent(chapterKey) {
    document.querySelectorAll('.master-chapter-item').forEach(el => {
      el.classList.remove('current');
      if (el.dataset.chapterKey === chapterKey) {
        el.classList.add('current');
        el.querySelector('.material-symbols-outlined').textContent = 'edit_note';
      }
    });
  }
  function markChapterDone(chapterKey) {
    const el = document.querySelector(`.master-chapter-item[data-chapter-key="${chapterKey}"]`);
    if (!el) return;
    el.classList.remove('current');
    el.classList.add('done');
    el.querySelector('.material-symbols-outlined').textContent = 'check_circle';
  }
  function markChapterFailed(chapterKey) {
    const el = document.querySelector(`.master-chapter-item[data-chapter-key="${chapterKey}"]`);
    if (!el) return;
    el.classList.remove('current');
    el.classList.add('failed');
    el.querySelector('.material-symbols-outlined').textContent = 'error';
  }

  async function fetchSSE(url, body, { onStatus, onChunk, onDone, onError, onPlan, onChapterStarted, onChapterDone, onChapterFailed, idleTimeoutMs = 240000 }) {
    const token = (typeof API !== 'undefined' && API.getToken) ? API.getToken() : null;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    });
    if (!res.ok && res.status !== 200) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let lastEventAt = Date.now();
    let aborted = false;
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventAt > idleTimeoutMs) {
        aborted = true;
        reader.cancel('SSE idle timeout').catch(() => {});
        clearInterval(watchdog);
      }
    }, 5000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        lastEventAt = Date.now();
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() || '';
        for (const ev of events) {
          if (!ev.trim()) continue;
          let eventName = 'message';
          let dataLines = [];
          for (const line of ev.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
          }
          const payload = dataLines.join('\n');
          let dataObj = null;
          try { dataObj = JSON.parse(payload); } catch (_) {}
          if (eventName === 'status' && onStatus) onStatus(dataObj);
          else if (eventName === 'chunk' && onChunk) onChunk(dataObj);
          else if (eventName === 'plan' && onPlan) onPlan(dataObj);
          else if (eventName === 'chapter_started' && onChapterStarted) onChapterStarted(dataObj);
          else if (eventName === 'chapter_done' && onChapterDone) onChapterDone(dataObj);
          else if (eventName === 'chapter_failed' && onChapterFailed) onChapterFailed(dataObj);
          else if (eventName === 'done' && onDone) onDone(dataObj);
          else if (eventName === 'error' && onError) onError(dataObj);
        }
      }
    } finally {
      clearInterval(watchdog);
    }
    if (aborted) throw new Error('SSE timeout: el servidor lleva más de 4 minutos sin enviar nada.');
  }

  async function compileV1(masterDocId, force = false) {
    if (!confirm(`¿Compilar Maestro${force ? ' (recompilando, se sobrescribirán los capítulos existentes)' : ''}?\n\nLa app llamará al LLM 10+ veces (un capítulo por llamada, con caché entre ellas). Tiempo: 8-15 minutos.`)) return;

    resetStreamBuffer();
    showWorking(
      'Compilando Maestro, capítulo a capítulo',
      [
        'Cargando contexto del proyecto en la ventana del modelo…',
        'Activando prompt caching para reutilizar el contexto entre capítulos…',
        'Cruzando criterios de evaluación con la convocatoria…',
        'Procesando work packages, actividades y tareas del Diseño…',
        'Integrando perfiles de socios y experiencia previa UE…',
        'Sintetizando la voz del coordinador desde las entrevistas…',
        'Escribiendo en stream — cada token cuenta…',
        'Cada capítulo se persiste en cuanto termina, no se pierde nada…',
        'Buen momento para una pausa: prepárate un café, da un paseo…',
        'El modelo está deliberando sobre la mejor forma de contar tu proyecto…',
        'Estamos exigiéndole calidad, no velocidad. Lo bueno se hace esperar…',
      ],
      'Esto va a tardar entre 8 y 15 minutos. No cierres esta pestaña. Si quieres salir un rato, perfecto — la app va sola.',
      { showStream: true, showChapterList: true }
    );

    let finalSummary = null;
    let errorObj = null;

    try {
      await fetchSSE(`/v1/master/documents/${masterDocId}/compile-v1?stream=1`, { force }, {
        onPlan: (data) => { if (data && Array.isArray(data.chapters)) renderChapterPlan(data.chapters); },
        onChapterStarted: (data) => {
          if (data && data.chapter_key) {
            markChapterCurrent(data.chapter_key);
            const sub = document.getElementById('master-working-sub');
            if (sub) sub.textContent = `Capítulo ${data.index + 1} de ${data.total}: ${data.title}`;
          }
        },
        onChunk: (data) => { if (data && data.text) appendToStreamViewer(data.text, data.chapter_key); },
        onChapterDone: (data) => { if (data && data.chapter_key) markChapterDone(data.chapter_key); },
        onChapterFailed: (data) => { if (data && data.chapter_key) markChapterFailed(data.chapter_key); },
        onDone: (summary) => { finalSummary = summary; },
        onError: (err) => { errorObj = err; },
      });

      hideWorking();
      if (errorObj) {
        showToast('Error compilando', errorObj.message || 'Error desconocido', 'error');
      } else if (finalSummary) {
        const okC = finalSummary.chapters_created;
        const failC = finalSummary.chapters_failed || 0;
        showToast(
          failC > 0 ? `⚠ Maestro compilado parcialmente` : `✓ Maestro compilado`,
          `${okC} capítulos${failC > 0 ? ` (${failC} fallaron)` : ''} · ${fmtChars(finalSummary.total_chars)} · ${((finalSummary.duration_ms || 0) / 1000).toFixed(1)}s`,
          failC > 0 ? 'error' : 'success'
        );
      }
      await loadOrCreateMaster(_state.projectId);
      _state.activeDiagnosis = null; // forzar recarga
      renderTabsBar();
      await showTab('improve');
    } catch (err) {
      hideWorking();
      showToast('Error compilando', err.message || String(err), 'error');
      await loadOrCreateMaster(_state.projectId);
      await showTab('improve');
    }
  }

  async function runDiagnosis(masterDocId, kind) {
    showWorking(
      kind === 'initial' ? 'Diagnosticando Maestro' : 'Diagnóstico avanzado',
      [
        'Leyendo los capítulos del Maestro…',
        'Buscando contradicciones entre secciones…',
        'Cruzando con criterios de evaluación…',
        'Clasificando sugerencias narrativas vs económicas…',
        'Priorizando severidad…',
      ],
      'Suele tardar 20-60 segundos.'
    );

    try {
      const diag = await API.post(`/master/documents/${masterDocId}/diagnose`, { kind });
      hideWorking();
      let items = [];
      if (Array.isArray(diag.items)) items = diag.items;
      else if (Array.isArray(diag.narrative) || Array.isArray(diag.economic)) {
        items = [
          ...(diag.narrative || []).map(x => ({ ...x, classification: 'narrative' })),
          ...(diag.economic || []).map(x => ({ ...x, classification: 'economic' })),
        ];
      } else if (Array.isArray(diag)) items = diag;
      _state.activeDiagnosis = { ...diag, items };
      _state.proposals = {}; // limpiar propuestas previas
      await showTab('improve');
    } catch (err) {
      hideWorking();
      showToast('Error diagnóstico', err.message || String(err), 'error');
    }
  }

  /* ── Toast ───────────────────────────────────────────────── */

  function showToast(title, body, kind = 'info') {
    const color = kind === 'success' ? '#16A34A' : kind === 'error' ? '#dc2626' : '#1b1464';
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 24px; right: 24px; z-index: 10000;
      background: white; border-left: 4px solid ${color};
      padding: 14px 18px; border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.18);
      max-width: 480px;
      animation: master-toast-in .3s ease-out;
    `;
    toast.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div style="flex: 1;">
          <div style="font-weight: 800; font-size: 13px; color: ${color}; margin-bottom: 4px;">${esc(title)}</div>
          <div style="font-size: 12px; color: #475569; line-height: 1.5; word-break: break-word;">${esc(body)}</div>
        </div>
        <button style="background: transparent; border: none; cursor: pointer; padding: 4px; margin: -4px;" aria-label="cerrar">
          <span class="material-symbols-outlined" style="font-size: 18px; color: #94a3b8;">close</span>
        </button>
      </div>`;
    if (!document.getElementById('master-toast-styles')) {
      const s = document.createElement('style');
      s.id = 'master-toast-styles';
      s.textContent = `@keyframes master-toast-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
      document.head.appendChild(s);
    }
    toast.querySelector('button').addEventListener('click', () => {
      toast.style.transition = 'opacity .3s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    });
    document.body.appendChild(toast);
    if (kind !== 'error') {
      setTimeout(() => {
        if (!document.body.contains(toast)) return;
        toast.style.transition = 'opacity .4s, transform .4s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 450);
      }, 5000);
    }
  }

  /* ── Download Markdown ──────────────────────────────────────── */

  async function downloadMarkdown(masterDocId) {
    const token = (typeof API !== 'undefined' && API.getToken) ? API.getToken() : null;
    try {
      const res = await fetch(`/v1/master/documents/${masterDocId}/export.md?download=1`, {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition') || '';
      const m = disp.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : `master_${masterDocId.substring(0, 8)}.md`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Markdown descargado', filename, 'success');
    } catch (err) {
      showToast('Error descargando', err.message || String(err), 'error');
    }
  }

  /* ── Compresión a formulario oficial ─────────────────────────── */

  async function compressToForm(masterDocId) {
    if (!confirm('¿Comprimir el Master al formulario oficial EACEA?\n\nEsto llamará al LLM una vez por cada campo del formulario (~15-20 llamadas) respetando los límites oficiales. Tiempo: 2-5 min.')) return;
    const banner = document.createElement('div');
    banner.id = 'master-compress-banner';
    banner.className = 'fixed top-16 left-1/2 -translate-x-1/2 bg-primary text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm font-bold';
    banner.innerHTML = '<span class="material-symbols-outlined align-middle text-base mr-1 animate-spin">progress_activity</span> Comprimiendo al formulario oficial... (puede tardar 2-5 min)';
    document.body.appendChild(banner);
    try {
      const res = await API.post(`/master/documents/${masterDocId}/compress-to-form`, { target_language: 'es' });
      const data = res.data || res;
      banner.remove();
      const okCount = data.compressed || 0;
      const errCount = data.errors || 0;
      const msg = `${okCount} campos comprimidos${errCount ? ' · ' + errCount + ' errores' : ''}`;
      showToast('Formulario generado', msg, errCount > 0 ? 'warning' : 'success');
      _state.compressResult = data;
      await showTab('compress');
    } catch (e) {
      banner.remove();
      showToast('Error al comprimir', e.message || String(e), 'error');
    }
  }

  async function _downloadFormDocx(projectId) {
    if (!projectId) { showToast('Falta project_id', '', 'error'); return; }
    const targetLang = (document.getElementById('master-export-lang')?.value || '').trim();
    try {
      if (targetLang) {
        showToast('Traduciendo y generando…', 'Puede tardar 1-3 min', 'info');
      }
      const token = (typeof API !== 'undefined' && API.getToken) ? API.getToken() : '';
      const url = `/v1/exporter/projects/${projectId}/form-part-b.docx${targetLang ? `?lang=${encodeURIComponent(targetLang)}` : ''}`;
      const res = await fetch(url, {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        showToast('Error al generar Form Part B', `HTTP ${res.status} — ${errText.substring(0, 200)}`, 'error');
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      const suffix = targetLang ? `_${targetLang}` : '';
      a.download = `Form_Part_B_${projectId.substring(0,8)}${suffix}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
      showToast('Form Part B descargado', targetLang ? `Traducido a ${targetLang}` : '', 'success');
    } catch (e) {
      showToast('Error al descargar', e.message || String(e), 'error');
    }
  }

  /* ── Hook al router SPA ─────────────────────────────────────── */

  document.addEventListener('panelShown', (e) => {
    if (e.detail && e.detail.route === 'master') render();
  });

  function observeMasterPanel() {
    const panel = document.getElementById('panel-master');
    if (!panel) return;
    const observer = new MutationObserver(() => {
      if (panel.classList.contains('active') || panel.style.display !== 'none') {
        render();
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  window.addEventListener('hashchange', () => {
    if (location.hash === '#master') render();
  });

  document.addEventListener('DOMContentLoaded', () => {
    observeMasterPanel();
    if (location.hash === '#master') render();
  });

  /* ── API pública ───────────────────────────────────────────── */

  Master.render = render;
  Master.showTab = showTab;
  Master.goToCompress = goToCompress;
  Master.previewCompile = previewCompile;
  Master.compileV1 = compileV1;
  Master.runDiagnosis = runDiagnosis;
  Master.downloadMarkdown = downloadMarkdown;
  Master.compressToForm = compressToForm;
  Master._downloadFormDocx = _downloadFormDocx;
  Master._patchItemState = _patchItemState;
  Master._loadProposalForItem = _loadProposalForItem;
  Master._acceptProposal = _acceptProposal;
  Master._toggleEdit = _toggleEdit;
  Master._cancelEdit = _cancelEdit;
  Master._saveEdit = _saveEdit;
  Master._toggleAskAi = _toggleAskAi;
  Master._cancelAskAi = _cancelAskAi;
  Master._submitAskAi = _submitAskAi;
  Master._acceptAskAi = _acceptAskAi;
  Master._showCreateItemForm = _showCreateItemForm;
  Master._cancelCreateItem = _cancelCreateItem;
  Master._submitCustomItem = _submitCustomItem;
  // Tab Comprimir (previsualización)
  Master._selectFormField = _selectFormField;
  Master._onFormFieldEdit = _onFormFieldEdit;
  Master._saveFormFieldEdit = _saveFormFieldEdit;
  Master._cancelFormFieldEdit = _cancelFormFieldEdit;
  Master._toggleFormAskAi = _toggleFormAskAi;
  Master._cancelFormAskAi = _cancelFormAskAi;
  Master._submitFormAskAi = _submitFormAskAi;
  Master._acceptFormProposal = _acceptFormProposal;
  Master._recompressField = _recompressField;
  Master._recompressAll = _recompressAll;
  Master._seedFromMaster = _seedFromMaster;

  window.Master = Master;
})();
