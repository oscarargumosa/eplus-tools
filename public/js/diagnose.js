/* ═══════════════════════════════════════════════════════════════
   Diagnóstico — Split-Layout (TASK-007 Fase 5)
   Tres columnas: nav de secciones · editor · findings.
   - Click finding → salta a su sección.
   - Botón "Pídeme propuesta" por finding (Sonnet 4 on demand).
   - Diff inline en el editor (before tachado rojo, after subrayado verde).
   - Aceptar aplica el cambio + crea proposal_versions snapshot.
   ═══════════════════════════════════════════════════════════════ */

const Diagnose = (() => {
  const state = {
    projectId: null,
    workspace: null,      // { project, instance, template_sections, fields }
    run: null,            // diagnose run with findings + latest_action
    fieldsMap: {},        // field_id -> value_text (server state)
    editsMap: {},         // field_id -> value_text (in-flight unsaved edits)
    activeFieldId: null,  // currently displayed in editor
    activeFindingId: null,
    loading: false,
    error: null,
    proposingFindingId: null,  // while a propose call is in flight
    savingField: false,
    showHistory: false,
    versions: [],
    filter: { severity: '', source: '' },
  };

  function init() {
    const active = (typeof App !== 'undefined' && App.getActiveProject) ? App.getActiveProject() : null;
    state.projectId = active?.id || null;
    if (!state.projectId) {
      renderNoProject();
      return;
    }
    state.workspace = null;
    state.run = null;
    state.fieldsMap = {};
    state.activeFieldId = null;
    state.activeFindingId = null;
    state.error = null;
    state.versions = [];
    state.showHistory = false;
    renderShell();
    loadWorkspaceAndRun();
  }

  async function loadWorkspaceAndRun() {
    state.loading = true;
    render();
    try {
      const [ws, run] = await Promise.all([
        API.get(`/diagnose/projects/${state.projectId}/workspace`),
        API.get(`/diagnose/runs/project/${state.projectId}/latest`),
      ]);
      state.workspace = ws;
      state.run = run;
      // Build fields map
      state.fieldsMap = {};
      for (const f of (ws?.fields || [])) {
        state.fieldsMap[f.field_id] = f.value_text || '';
      }
      // Pick first section with content as active
      const firstField = (ws?.fields || []).find(f => (f.value_text || '').length > 30);
      state.activeFieldId = firstField?.field_id || null;
    } catch (e) {
      state.error = e.message || String(e);
    }
    state.loading = false;
    render();
  }

  async function runNewDiagnosis() {
    state.loading = true; state.error = null; render();
    try {
      state.run = await API.post('/diagnose/run', { projectId: state.projectId });
      // Reload workspace too (in case fields changed)
      state.workspace = await API.get(`/diagnose/projects/${state.projectId}/workspace`);
      state.fieldsMap = {};
      for (const f of (state.workspace?.fields || [])) state.fieldsMap[f.field_id] = f.value_text || '';
    } catch (e) {
      state.error = e.message || String(e);
    }
    state.loading = false; render();
  }

  async function proposeForFinding(findingId) {
    state.proposingFindingId = findingId;
    render();
    try {
      const action = await API.post(`/diagnose/findings/${findingId}/propose`);
      // Patch the finding in state.run.findings with latest_action
      const f = state.run.findings.find(x => x.id === findingId);
      if (f) f.latest_action = action;
      // Switch editor to the affected section
      if (action.where_field_id) state.activeFieldId = action.where_field_id;
      state.activeFindingId = findingId;
    } catch (e) {
      alert('No se pudo generar la propuesta: ' + (e.message || e));
    }
    state.proposingFindingId = null;
    render();
  }

  async function acceptAction(actionId, findingId) {
    try {
      await API.post(`/diagnose/actions/${actionId}/accept`);
      // Refresh: reload workspace + run (action applied → field text changed → finding resolved)
      const ws = await API.get(`/diagnose/projects/${state.projectId}/workspace`);
      state.workspace = ws;
      state.fieldsMap = {};
      for (const f of (ws?.fields || [])) state.fieldsMap[f.field_id] = f.value_text || '';
      // Discard any pending manual edits on fields that just got updated by IA
      state.editsMap = {};
      state.run = await API.get(`/diagnose/runs/project/${state.projectId}/latest`);
      render();
      Toast.show?.('Cambio aplicado', 'ok');
    } catch (e) {
      alert('Error al aceptar: ' + (e.message || e));
    }
  }

  async function rejectAction(actionId, findingId) {
    try {
      await API.post(`/diagnose/actions/${actionId}/reject`);
      state.run = await API.get(`/diagnose/runs/project/${state.projectId}/latest`);
      render();
    } catch (e) {
      alert('Error al rechazar: ' + (e.message || e));
    }
  }

  async function openHistory() {
    try {
      state.versions = await API.get(`/diagnose/projects/${state.projectId}/versions`);
      state.showHistory = true;
      render();
    } catch (e) {
      alert('Error cargando historial: ' + (e.message || e));
    }
  }
  function closeHistory() {
    state.showHistory = false;
    document.getElementById('diagnose-history-modal')?.remove();
  }

  async function rollback(versionId) {
    if (!confirm('¿Restaurar esta versión? Se creará un snapshot del estado actual primero (puedes volver atrás).')) return;
    try {
      await API.post(`/diagnose/projects/${state.projectId}/rollback`, { versionId });
      state.showHistory = false;
      await loadWorkspaceAndRun();
      Toast.show?.('Versión restaurada', 'ok');
    } catch (e) {
      alert('Error al hacer rollback: ' + (e.message || e));
    }
  }

  /* ── Rendering ───────────────────────────────────────────────── */

  function renderNoProject() {
    const root = document.getElementById('diagnose-content');
    if (!root) return;
    root.innerHTML = `
      <div class="max-w-2xl mx-auto text-center py-16">
        <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">monitoring</span>
        <h2 class="text-xl font-bold mb-2">Diagnóstico</h2>
        <p class="text-on-surface-variant text-sm">Selecciona un proyecto desde "Mis Proyectos" para ejecutar el diagnóstico.</p>
      </div>`;
  }

  function renderShell() {
    const root = document.getElementById('diagnose-content');
    if (!root) return;
    // Remove the max-w-7xl from the wrapper for full-width split
    root.parentElement?.classList.remove('max-w-7xl');
    root.parentElement?.classList.add('max-w-none', 'px-4');
    root.innerHTML = `<div id="diagnose-body"></div>`;
    render();
  }

  function render() {
    const body = document.getElementById('diagnose-body');
    if (!body) return;

    if (state.loading) {
      body.innerHTML = `
        <div class="py-16 text-center text-on-surface-variant">
          <span class="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
          <p class="mt-3 text-sm">Cargando…</p>
        </div>`;
      return;
    }

    if (state.error) {
      body.innerHTML = `
        <div class="bg-error/10 border border-error/30 rounded-xl p-6 max-w-2xl mx-auto">
          <span class="material-symbols-outlined text-error">error</span>
          <p class="text-sm mt-1">${esc(state.error)}</p>
          <button class="mt-3 px-3 py-1.5 bg-primary text-white rounded text-xs" onclick="Diagnose.runNew()">Reintentar</button>
        </div>`;
      return;
    }

    if (!state.run) {
      body.innerHTML = renderEmpty();
      return;
    }

    body.innerHTML = renderSplit();
    // Ensure the modal reflects current state — remove if showHistory=false,
    // (re)render if true. The modal lives in document.body, not in
    // #diagnose-body, so render() does not affect it implicitly.
    if (state.showHistory) {
      renderHistoryModal();
    } else {
      document.getElementById('diagnose-history-modal')?.remove();
    }
  }

  function renderEmpty() {
    return `
      <div class="max-w-2xl mx-auto text-center py-12">
        <span class="material-symbols-outlined text-5xl text-primary mb-3">monitoring</span>
        <h2 class="text-2xl font-bold mb-2">Diagnóstico del proyecto</h2>
        <p class="text-on-surface-variant text-sm mb-6">
          La IA analiza tu Form Part B contra las leyes EACEA, patrones del programa,
          coherencia cruzada y (si la tienes) la carta del evaluador.
        </p>
        <button onclick="Diagnose.runNew()" class="px-6 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 shadow-md">
          <span class="material-symbols-outlined text-sm align-middle mr-1">play_arrow</span>
          Lanzar diagnóstico
        </button>
      </div>`;
  }

  function renderSplit() {
    const run = state.run;
    const verdict = run.triage_verdict || 'unknown';
    const verdictInfo = {
      redesign: { title: 'Rediseñar el proyecto', cls: 'bg-error/10 border-error/30 text-error', icon: 'replay' },
      perfect:  { title: 'Perfeccionar', cls: 'bg-orange-500/10 border-orange-500/30 text-orange-700', icon: 'edit_note' },
      export:   { title: 'Listo para exportar', cls: 'bg-green-500/10 border-green-500/30 text-green-700', icon: 'task_alt' },
      unknown:  { title: 'Sin veredicto', cls: 'bg-on-surface-variant/10 border-outline-variant/30 text-on-surface-variant', icon: 'help' },
    }[verdict] || { title: verdict, cls: '', icon: 'help' };

    const scores = run.scores_by_criterion || [];
    const acceptedCount = (run.findings || []).filter(f => f.state === 'resolved').length;

    return `
      <!-- Top header: verdict + scores + actions -->
      <div class="mb-4">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div class="flex items-center gap-3">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${verdictInfo.cls} text-sm font-bold">
              <span class="material-symbols-outlined text-base">${verdictInfo.icon}</span>
              ${esc(verdictInfo.title)}
            </div>
            <span class="text-xs text-on-surface-variant">
              ${run.total_findings || 0} hallazgos · ${acceptedCount} aplicados · score ${run.total_score_estimate ?? '—'}
            </span>
          </div>
          <div class="flex gap-2">
            ${acceptedCount >= 1 ? `
              <button onclick="Diagnose.runNew()" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 shadow-sm">
                <span class="material-symbols-outlined text-sm">refresh</span>
                Recalcular diagnóstico
              </button>` : `
              <button onclick="Diagnose.runNew()" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-outline-variant/40 rounded-lg text-xs hover:bg-surface-variant">
                <span class="material-symbols-outlined text-sm">refresh</span>
                Re-ejecutar
              </button>`}
            <button onclick="Diagnose.openHistory()" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-outline-variant/40 rounded-lg text-xs hover:bg-surface-variant">
              <span class="material-symbols-outlined text-sm">history</span>
              Historial
            </button>
          </div>
        </div>

        ${run.has_letter_input ? `
          <div class="bg-primary/10 border-2 border-primary/40 rounded-xl px-4 py-2 mb-3 flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">stars</span>
            <div class="text-xs">
              <strong class="text-primary">Diagnóstico dirigido por carta EACEA</strong> ·
              ${(run.findings || []).filter(f => f.source_pass === 'D').length} findings del ponente.
            </div>
          </div>` : ''}

        <div class="grid grid-cols-2 md:grid-cols-${Math.min(scores.length || 4, 6)} gap-2 mb-1">
          ${scores.map(c => scoreCard(c)).join('')}
        </div>
      </div>

      <!-- Split: nav + editor + findings -->
      <div class="grid gap-4" style="grid-template-columns: 220px 1fr 380px; min-height:calc(100vh - 280px);">
        <!-- LEFT: sections nav -->
        <aside class="bg-surface border border-outline-variant/30 rounded-xl p-3 overflow-y-auto" style="max-height:calc(100vh - 240px);">
          <h3 class="text-[10px] font-bold uppercase text-on-surface-variant px-2 mb-2">Secciones</h3>
          ${renderSectionsNav()}
        </aside>

        <!-- CENTER: editor -->
        <section class="bg-surface border border-outline-variant/30 rounded-xl p-5 overflow-y-auto" style="max-height:calc(100vh - 240px);">
          ${renderEditor()}
        </section>

        <!-- RIGHT: findings -->
        <aside class="bg-surface border border-outline-variant/30 rounded-xl p-3 overflow-y-auto" style="max-height:calc(100vh - 240px);">
          ${renderFindingsPanel()}
        </aside>
      </div>
    `;
  }

  function scoreCard(c) {
    const cls = c.on5 >= 4 ? 'bg-green-500/10 text-green-700 border-green-500/30'
              : c.on5 >= 3 ? 'bg-yellow-500/10 text-yellow-800 border-yellow-500/30'
                           : 'bg-error/10 text-error border-error/30';
    return `
      <div class="border ${cls} rounded-lg px-2 py-1.5">
        <div class="text-[9px] uppercase font-bold opacity-75 truncate" title="${esc(c.label || c.id)}">${esc(shortenLabel(c.label || c.id))}</div>
        <div class="flex items-baseline gap-1">
          <span class="text-lg font-bold">${c.on5}</span><span class="text-[10px] opacity-70">/5</span>
        </div>
      </div>`;
  }

  function shortenLabel(s) {
    if (!s) return '';
    return s.replace(/^\d+(\.\d+)*\.?\s*/, '').slice(0, 22);
  }

  function renderSectionsNav() {
    const sections = state.workspace?.template_sections || [];
    if (sections.length === 0) {
      // Fallback: enumerate field_ids
      const fieldIds = Object.keys(state.fieldsMap || {}).sort();
      return fieldIds.map(fid => navLink(fid, fid, fid === state.activeFieldId)).join('');
    }

    // Group findings count per field_id
    const findingsByField = {};
    for (const f of (state.run?.findings || [])) {
      if (f.applies_to_section && f.state === 'open') {
        findingsByField[f.applies_to_section] = (findingsByField[f.applies_to_section] || 0) + 1;
      }
    }

    return sections.map(sec => {
      const subs = (sec.subsections || []);
      const hasContent = subs.some(ss => ss.field_ids.some(fid => (state.fieldsMap[fid] || '').length > 30));
      return `
        <div class="mb-3">
          <div class="text-[11px] font-bold uppercase text-primary px-2 mb-1">${esc(sec.number || '')} ${esc(sec.title || '').slice(0, 30)}</div>
          ${subs.map(ss => {
            const fid = ss.field_ids[0];
            if (!fid) return '';
            const has = (state.fieldsMap[fid] || '').length > 30;
            const findings = findingsByField[fid] || 0;
            return navLink(fid, `${ss.number} ${ss.title}`, fid === state.activeFieldId, { has, findings });
          }).join('')}
        </div>`;
    }).join('');
  }

  function navLink(fieldId, label, active, opts = {}) {
    const { has = true, findings = 0 } = opts;
    return `
      <button onclick="Diagnose.setActiveField('${esc(fieldId)}')"
        class="w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center justify-between gap-2 mb-0.5 transition-colors
               ${active ? 'bg-primary text-white font-medium' : 'hover:bg-surface-variant text-on-surface'}
               ${!has ? 'opacity-50' : ''}">
        <span class="truncate">${esc(label || fieldId)}</span>
        ${findings > 0 ? `<span class="${active ? 'bg-white/20 text-white' : 'bg-orange-500/15 text-orange-700'} text-[10px] font-bold px-1.5 py-0.5 rounded-full">${findings}</span>` : ''}
      </button>`;
  }

  function renderEditor() {
    if (!state.activeFieldId) {
      return `
        <div class="text-center text-on-surface-variant py-12">
          <span class="material-symbols-outlined text-4xl">article</span>
          <p class="text-sm mt-2">Selecciona una sección a la izquierda para verla.</p>
        </div>`;
    }
    const savedText = state.fieldsMap[state.activeFieldId] || '';
    const editedText = state.editsMap[state.activeFieldId];
    const currentText = editedText != null ? editedText : savedText;
    const hasUnsaved = editedText != null && editedText !== savedText;

    const findingsHere = (state.run?.findings || []).filter(f =>
      f.applies_to_section === state.activeFieldId && f.state === 'open'
    );
    const activeFinding = state.activeFindingId
      ? state.run.findings.find(f => f.id === state.activeFindingId)
      : null;
    const activeAction = activeFinding?.latest_action;
    const showDiff = activeAction && activeAction.state === 'proposed'
                     && activeAction.where_field_id === state.activeFieldId
                     && !hasUnsaved;  // hide diff overlay while user is editing

    return `
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-[10px] uppercase font-bold text-on-surface-variant">Sección</div>
          <h3 class="text-lg font-bold text-on-surface font-mono">${esc(state.activeFieldId)}</h3>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-xs text-on-surface-variant">${currentText.length} chars · ${findingsHere.length} hallazgos abiertos</div>
          ${hasUnsaved ? `
            <button onclick="Diagnose.discardEdits()" class="px-2 py-1 text-xs text-on-surface-variant hover:text-error">Descartar</button>
            <button onclick="Diagnose.saveField()" ${state.savingField ? 'disabled' : ''}
                    class="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50">
              ${state.savingField ? '<span class="material-symbols-outlined text-xs animate-spin">progress_activity</span>' : '<span class="material-symbols-outlined text-xs">save</span>'}
              ${state.savingField ? 'Guardando…' : 'Guardar cambios'}
            </button>
          ` : ''}
        </div>
      </div>

      ${showDiff ? renderDiffPanel(activeAction, savedText) : ''}

      ${hasUnsaved ? `
        <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-1.5 mb-2 text-xs text-yellow-800">
          <span class="material-symbols-outlined text-xs align-middle">edit</span>
          Estás editando — los cambios no se guardan hasta que pulses "Guardar cambios".
        </div>
      ` : ''}

      <textarea
        id="diagnose-editor-textarea"
        class="w-full font-sans text-sm leading-relaxed text-on-surface bg-surface p-4 rounded-lg border ${hasUnsaved ? 'border-yellow-500/50 ring-1 ring-yellow-500/30' : 'border-outline-variant/30'} focus:outline-none focus:ring-2 focus:ring-primary/30 resize-vertical"
        style="min-height:400px;"
        oninput="Diagnose.onEditorInput(this.value)"
        spellcheck="false"
      >${esc(currentText)}</textarea>
    `;
  }

  function renderDiffPanel(action, sectionText) {
    const beforeFound = sectionText.includes(action.before_text || '');
    return `
      <div class="bg-primary/5 border-2 border-primary/30 rounded-xl p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-bold text-primary">
            <span class="material-symbols-outlined text-base align-middle">auto_fix_high</span>
            Propuesta de Sonnet 4
            ${action.estimated_score_delta != null ? `<span class="text-xs font-normal text-on-surface-variant ml-2">+${action.estimated_score_delta} pts estimados</span>` : ''}
          </h4>
        </div>
        <div class="space-y-3 text-sm">
          ${action.before_text ? `
            <div>
              <div class="text-[10px] font-bold uppercase text-error mb-1">Antes</div>
              <div class="bg-error/5 border-l-4 border-error/40 pl-3 py-2 rounded text-xs ${beforeFound ? '' : 'opacity-60'}">
                ${esc(action.before_text)}
                ${!beforeFound ? '<div class="text-[10px] text-error mt-1">⚠ Este texto no se encuentra literal en la sección actual. Verifica antes de aceptar.</div>' : ''}
              </div>
            </div>
          ` : ''}
          <div>
            <div class="text-[10px] font-bold uppercase text-green-700 mb-1">Después</div>
            <div class="bg-green-500/5 border-l-4 border-green-500/40 pl-3 py-2 rounded text-xs">
              ${esc(action.after_text)}
            </div>
          </div>
          ${action.rationale ? `
            <div class="text-xs text-on-surface-variant italic">
              <strong>Por qué:</strong> ${esc(action.rationale)}
            </div>
          ` : ''}
          ${action.risk ? `
            <div class="bg-orange-500/10 border border-orange-500/30 rounded p-2 text-xs text-orange-800">
              <strong>⚠ Riesgo:</strong> ${esc(action.risk)}
            </div>
          ` : ''}
        </div>
        <div class="flex gap-2 mt-4">
          <button onclick="Diagnose.acceptAction('${esc(action.id)}', '${esc(action.finding_id)}')" class="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors">
            <span class="material-symbols-outlined text-sm align-middle mr-1">check</span>
            Aceptar y aplicar
          </button>
          <button onclick="Diagnose.rejectAction('${esc(action.id)}', '${esc(action.finding_id)}')" class="px-3 py-2 bg-surface border border-outline-variant/40 rounded-lg text-sm text-on-surface-variant hover:bg-surface-variant">
            Rechazar
          </button>
        </div>
      </div>
    `;
  }

  function renderTextWithHighlights(text, action) {
    const safe = esc(text);
    if (!action || !action.before_text) return safe;
    // Highlight the "before" substring in the section text
    const before = action.before_text;
    if (!text.includes(before)) return safe;
    const escBefore = esc(before);
    return safe.replace(
      escBefore,
      `<mark class="bg-error/20 text-error line-through decoration-2 decoration-error">${escBefore}</mark>` +
      `<mark class="bg-green-500/20 text-green-800 ml-1">${esc(action.after_text || '')}</mark>`
    );
  }

  function renderFindingsPanel() {
    const findings = state.run?.findings || [];
    if (findings.length === 0) {
      return `<div class="text-sm text-on-surface-variant p-4 text-center">No hay hallazgos.</div>`;
    }

    // Filter
    let visible = findings;
    if (state.filter.severity) visible = visible.filter(f => f.severity === state.filter.severity);
    if (state.filter.source) visible = visible.filter(f => f.source_pass === state.filter.source);

    // Sort: open critical/high first, then open medium, then resolved at bottom
    const sevRank = { critical: 6, high: 5, medium_high: 4, medium: 3, medium_low: 2, low: 1, positive: 0 };
    visible = [...visible].sort((a, b) => {
      const aOpen = a.state === 'open' ? 1 : 0;
      const bOpen = b.state === 'open' ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      return (sevRank[b.severity] || 3) - (sevRank[a.severity] || 3);
    });

    return `
      <div class="mb-3">
        <h3 class="text-xs font-bold uppercase text-on-surface-variant mb-2">Hallazgos (${findings.length})</h3>
        <div class="flex gap-1.5 text-[10px] flex-wrap">
          ${chip('Todos', !state.filter.source && !state.filter.severity, () => setFilter('', ''))}
          ${chip('Críticos', state.filter.severity === 'critical', () => setFilter('severity', 'critical'))}
          ${chip('Carta EACEA', state.filter.source === 'D', () => setFilter('source', 'D'))}
        </div>
      </div>
      <div class="space-y-2">
        ${visible.map(f => findingCard(f)).join('')}
      </div>
    `;
  }

  function chip(label, active, _onclickFn) {
    // We can't pass closures to onclick — use named handlers
    const handler = label === 'Todos' ? `Diagnose.setFilter('','')` :
                    label === 'Críticos' ? `Diagnose.setFilter('severity','critical')` :
                    label === 'Carta EACEA' ? `Diagnose.setFilter('source','D')` : '';
    return `<button onclick="${handler}" class="px-2 py-0.5 rounded-full ${active ? 'bg-primary text-white' : 'bg-surface-variant text-on-surface-variant hover:bg-surface-variant/70'}">${esc(label)}</button>`;
  }

  function findingCard(f) {
    const sevMap = {
      critical:    { cls: 'border-error/40 bg-error/5',                  badge: 'bg-error/15 text-error',                lbl: 'Crítico' },
      high:        { cls: 'border-error/30 bg-error/5',                  badge: 'bg-error/10 text-error',                lbl: 'Alto' },
      medium_high: { cls: 'border-orange-500/30 bg-orange-500/5',        badge: 'bg-orange-500/10 text-orange-700',      lbl: 'Medio-alto' },
      medium:      { cls: 'border-yellow-500/30 bg-yellow-500/5',        badge: 'bg-yellow-500/10 text-yellow-800',      lbl: 'Medio' },
      medium_low:  { cls: 'border-yellow-500/20 bg-yellow-500/5',        badge: 'bg-yellow-500/5 text-yellow-700',       lbl: 'Bajo' },
      low:         { cls: 'border-outline-variant/40',                   badge: 'bg-on-surface-variant/10 text-on-surface-variant', lbl: 'Bajo' },
    };
    const sev = sevMap[f.severity] || sevMap.medium;
    const fromLetter = f.source_pass === 'D';
    const isActive = state.activeFindingId === f.id;
    const action = f.latest_action;
    const isProposing = state.proposingFindingId === f.id;
    const isResolved = f.state === 'resolved';
    const isDismissed = f.state === 'dismissed';

    if (isResolved) {
      return `
        <div class="border border-green-500/30 bg-green-500/5 rounded-lg p-2 text-xs">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sm text-green-600">check_circle</span>
            <span class="line-through text-on-surface-variant truncate">${esc(f.finding_text)}</span>
          </div>
        </div>`;
    }
    if (isDismissed) {
      return `
        <div class="border border-outline-variant/30 rounded-lg p-2 text-xs opacity-50">
          <span class="line-through">${esc(f.finding_text)}</span>
        </div>`;
    }

    return `
      <div class="border ${sev.cls} ${isActive ? 'ring-2 ring-primary' : ''} rounded-lg p-3 text-xs cursor-pointer"
           onclick="Diagnose.selectFinding('${esc(f.id)}', '${esc(f.applies_to_section || '')}')">
        <div class="flex items-start gap-2 mb-2">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${sev.badge} whitespace-nowrap">${sev.lbl}</span>
          ${fromLetter ? `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold"><span class="material-symbols-outlined text-[10px]">stars</span>Carta</span>` : ''}
          ${f.applies_to_section ? `<span class="text-[9px] text-primary font-mono ml-auto">${esc(f.applies_to_section)}</span>` : ''}
        </div>
        <div class="text-on-surface mb-2 line-clamp-3">${esc(f.finding_text)}</div>

        ${action && action.state === 'proposed' ? `
          <div class="text-[10px] text-primary font-bold mb-1">
            <span class="material-symbols-outlined text-[12px] align-middle">auto_fix_high</span>
            Propuesta lista (ver editor)
          </div>
        ` : action && action.state === 'accepted' ? `
          <div class="text-[10px] text-green-600 font-bold mb-1">✓ Aplicada</div>
        ` : `
          <button onclick="event.stopPropagation(); Diagnose.propose('${esc(f.id)}')"
            ${isProposing ? 'disabled' : ''}
            class="w-full mt-1 px-2 py-1 bg-primary text-white rounded text-[11px] font-bold hover:bg-primary/90 disabled:opacity-50">
            ${isProposing ? '<span class="material-symbols-outlined text-xs animate-spin align-middle">progress_activity</span> Generando…' : '<span class="material-symbols-outlined text-xs align-middle">auto_fix_high</span> Pídeme propuesta'}
          </button>
        `}
      </div>`;
  }

  function renderHistoryModal() {
    // Append modal to body
    const existing = document.getElementById('diagnose-history-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'diagnose-history-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4';
    modal.onclick = (e) => { if (e.target === modal) Diagnose.closeHistory(); };
    modal.innerHTML = `
      <div class="bg-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div class="p-5 border-b border-outline-variant/30 flex items-center justify-between">
          <div>
            <h3 class="text-lg font-bold">Historial de versiones</h3>
            <p class="text-xs text-on-surface-variant">Cada vez que se aplica una propuesta se crea un snapshot. Puedes restaurar uno anterior.</p>
          </div>
          <button onclick="Diagnose.closeHistory()" class="p-1 hover:bg-surface-variant rounded"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="overflow-y-auto p-4">
          ${(state.versions || []).length === 0 ? '<p class="text-sm text-on-surface-variant text-center py-6">Sin versiones todavía. Acepta propuestas para crear el historial.</p>' : `
            <table class="w-full text-sm">
              <thead class="text-xs text-on-surface-variant"><tr>
                <th class="text-left pb-2">v#</th>
                <th class="text-left pb-2">Origen</th>
                <th class="text-left pb-2">Notas</th>
                <th class="text-left pb-2">Fecha</th>
                <th></th>
              </tr></thead>
              <tbody>
                ${state.versions.map(v => `
                  <tr class="border-t border-outline-variant/20">
                    <td class="py-2 font-bold">v${v.version_number}</td>
                    <td class="py-2 text-xs">${esc(v.triggered_by)}</td>
                    <td class="py-2 text-xs text-on-surface-variant truncate max-w-[200px]">${esc(v.notes || '')}</td>
                    <td class="py-2 text-xs">${new Date(v.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td class="py-2"><button onclick="Diagnose.rollback('${esc(v.id)}')" class="px-2 py-1 text-[11px] bg-surface border border-outline-variant/40 rounded hover:bg-surface-variant">Restaurar</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  /* ── Handlers exposed ──────────────────────────────────────────── */

  function setActiveField(fieldId) {
    // Warn if there are unsaved edits in the current field
    if (state.activeFieldId && state.editsMap[state.activeFieldId] != null) {
      const dirty = state.editsMap[state.activeFieldId] !== state.fieldsMap[state.activeFieldId];
      if (dirty && !confirm('Tienes cambios sin guardar en esta sección. ¿Cambiar de sección y descartar?')) {
        return;
      }
      // Discard the dirty edit on the previous section
      delete state.editsMap[state.activeFieldId];
    }
    state.activeFieldId = fieldId;
    state.activeFindingId = null;
    render();
    // Focus the textarea for immediate typing
    setTimeout(() => document.getElementById('diagnose-editor-textarea')?.focus(), 50);
  }

  function onEditorInput(newText) {
    if (!state.activeFieldId) return;
    state.editsMap[state.activeFieldId] = newText;
    // Re-render just the small bits (save button + char count) — full render
    // would steal focus. We update DOM in place.
    const wrapper = document.getElementById('diagnose-body');
    if (wrapper) {
      // Re-render only the editor block (preserving textarea focus is OK
      // because we already typed into it; full editor re-render restores
      // selection at end which is fine for short bursts).
      const sel = document.activeElement;
      const isTextarea = sel?.id === 'diagnose-editor-textarea';
      const caretStart = isTextarea ? sel.selectionStart : null;
      const caretEnd = isTextarea ? sel.selectionEnd : null;
      // Light render: only update the editor center column
      const center = document.querySelector('#diagnose-body section.bg-surface');
      if (center) {
        center.innerHTML = renderEditor();
        if (caretStart != null) {
          const ta = document.getElementById('diagnose-editor-textarea');
          if (ta) {
            ta.focus();
            ta.setSelectionRange(caretStart, caretEnd);
          }
        }
      }
    }
  }

  async function saveField() {
    if (!state.activeFieldId) return;
    const fieldId = state.activeFieldId;
    const newText = state.editsMap[fieldId];
    if (newText == null) return;
    state.savingField = true;
    render();
    try {
      await API.put(`/diagnose/projects/${state.projectId}/fields/${fieldId}`, { value_text: newText });
      state.fieldsMap[fieldId] = newText;
      delete state.editsMap[fieldId];
      Toast.show?.('Cambios guardados', 'ok');
    } catch (e) {
      alert('No se pudo guardar: ' + (e.message || e));
    }
    state.savingField = false;
    render();
  }

  function discardEdits() {
    if (!state.activeFieldId) return;
    if (!confirm('¿Descartar tus cambios y volver al texto guardado?')) return;
    delete state.editsMap[state.activeFieldId];
    render();
  }
  function setFilter(key, value) { state.filter[key] = state.filter[key] === value ? '' : value; if (key === 'severity' && value) state.filter.source = ''; if (key === 'source' && value) state.filter.severity = ''; render(); }
  function selectFinding(findingId, fieldId) {
    state.activeFindingId = findingId;
    if (fieldId) state.activeFieldId = fieldId;
    render();
    // Scroll editor to top
    document.querySelector('#diagnose-editor-text')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  return {
    init,
    runNew: runNewDiagnosis,
    setActiveField,
    setFilter,
    selectFinding,
    propose: proposeForFinding,
    acceptAction,
    rejectAction,
    openHistory,
    closeHistory,
    rollback,
    onEditorInput,
    saveField,
    discardEdits,
  };
})();
