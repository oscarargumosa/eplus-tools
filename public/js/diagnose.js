/* ═══════════════════════════════════════════════════════════════
   Diagnóstico — replaces the old "Perfeccionar" / Master panel.
   Runs 3 passes (universal laws, programme rules, cross-section
   coherence) against the project's Form Part B and shows findings
   with triage verdict + scores per criterion.
   ═══════════════════════════════════════════════════════════════ */

const Diagnose = (() => {
  let state = {
    projectId: null,
    run: null,
    loading: false,
    error: null,
  };

  function init() {
    const active = (typeof App !== 'undefined' && App.getActiveProject) ? App.getActiveProject() : null;
    state.projectId = active?.id || null;

    if (!state.projectId) {
      renderNoProject();
      return;
    }

    // Reset run if project changed
    renderShell();
    loadLatestRun();
  }

  async function loadLatestRun() {
    if (!state.projectId) return;
    state.loading = true;
    state.error = null;
    render();

    try {
      const resp = await API.get(`/diagnose/runs/project/${state.projectId}/latest`);
      state.run = resp;
      state.loading = false;
      render();
    } catch (e) {
      state.error = e.message || String(e);
      state.loading = false;
      render();
    }
  }

  async function runNewDiagnosis() {
    if (!state.projectId) return;
    state.loading = true;
    state.error = null;
    render();

    try {
      const resp = await API.post('/diagnose/run', { projectId: state.projectId });
      state.run = resp;
      state.loading = false;
      render();
    } catch (e) {
      state.error = e.message || String(e);
      state.loading = false;
      render();
    }
  }

  /* ── Renderers ────────────────────────────────────────────────── */

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
    root.innerHTML = `<div id="diagnose-body"></div>`;
    render();
  }

  function render() {
    const body = document.getElementById('diagnose-body');
    if (!body) return;

    if (state.loading) {
      body.innerHTML = `
        <div class="py-12 text-center text-on-surface-variant">
          <span class="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
          <p class="mt-3 text-sm">Ejecutando diagnóstico…</p>
          <p class="text-xs mt-1 text-on-surface-variant/70">Cargo el Form, busco patrones EACEA y comprobaciones cruzadas.</p>
        </div>`;
      return;
    }

    if (state.error) {
      body.innerHTML = `
        <div class="bg-error/10 border border-error/30 rounded-xl p-6 max-w-2xl mx-auto">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-error">error</span>
            <div class="flex-1">
              <h3 class="font-bold text-error">Error al ejecutar el diagnóstico</h3>
              <p class="text-sm mt-1 text-on-surface">${esc(state.error)}</p>
              <button class="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90" onclick="Diagnose.runNew()">Reintentar</button>
            </div>
          </div>
        </div>`;
      return;
    }

    if (!state.run) {
      // Empty state — no diagnosis yet
      body.innerHTML = `
        <div class="max-w-2xl mx-auto text-center py-12">
          <span class="material-symbols-outlined text-5xl text-primary mb-3">monitoring</span>
          <h2 class="text-2xl font-bold mb-2">Diagnóstico del proyecto</h2>
          <p class="text-on-surface-variant text-sm mb-6">
            La IA analiza tu Form Part B contra las leyes EACEA confirmadas con cartas reales,
            patrones específicos de la convocatoria y coherencia cruzada entre secciones.
          </p>
          <div class="grid grid-cols-3 gap-3 max-w-lg mx-auto mb-6 text-left">
            <div class="bg-surface border border-outline-variant/30 rounded-xl p-3">
              <div class="text-xs font-bold text-primary">Pasada A</div>
              <div class="text-xs text-on-surface-variant mt-1">Leyes EACEA universales</div>
            </div>
            <div class="bg-surface border border-outline-variant/30 rounded-xl p-3">
              <div class="text-xs font-bold text-primary">Pasada B</div>
              <div class="text-xs text-on-surface-variant mt-1">Reglas del programa</div>
            </div>
            <div class="bg-surface border border-outline-variant/30 rounded-xl p-3">
              <div class="text-xs font-bold text-primary">Pasada C</div>
              <div class="text-xs text-on-surface-variant mt-1">Coherencia cruzada</div>
            </div>
          </div>
          <button onclick="Diagnose.runNew()" class="px-6 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 shadow-md">
            <span class="material-symbols-outlined text-sm align-middle mr-1">play_arrow</span>
            Lanzar diagnóstico
          </button>
        </div>`;
      return;
    }

    // We have a run — render results
    renderResult(body, state.run);
  }

  function renderResult(body, run) {
    const verdict = run.triage_verdict || 'unknown';
    const verdictInfo = {
      redesign: { title: 'Rediseñar el proyecto', cls: 'bg-error/10 border-error/30 text-error', icon: 'replay', desc: 'Hay ≥2 criterios por debajo del threshold mínimo (3/5). Recomendamos volver al Diseño con el material existente como base.' },
      perfect:  { title: 'Perfeccionar', cls: 'bg-orange-500/10 border-orange-500/30 text-orange-700', icon: 'edit_note', desc: 'Hay margen de mejora. Aplica las recomendaciones dirigidas para subir nota.' },
      export:   { title: 'Listo para exportar', cls: 'bg-green-500/10 border-green-500/30 text-green-700', icon: 'task_alt', desc: 'Todos los criterios estimados ≥4/5. El proyecto está en condiciones de enviarse.' },
      unknown:  { title: 'Sin veredicto', cls: 'bg-on-surface-variant/10 border-outline-variant/30 text-on-surface-variant', icon: 'help', desc: 'No se pudo calcular el veredicto.' },
    }[verdict] || { title: verdict, cls: '', icon: 'help', desc: '' };

    const scores = run.scores_by_criterion || [];
    const findings = run.findings || [];

    const findingsByCriterion = findings.reduce((acc, f) => {
      const k = f.criterion || 'OTHER';
      (acc[k] = acc[k] || []).push(f);
      return acc;
    }, {});

    body.innerHTML = `
      <!-- Header with refresh -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-on-surface">Diagnóstico</h2>
          <p class="text-xs text-on-surface-variant">Última ejecución: ${formatDate(run.finished_at || run.started_at)}</p>
        </div>
        <button onclick="Diagnose.runNew()" class="px-4 py-2 bg-surface border border-outline-variant/40 rounded-lg text-xs font-medium hover:bg-surface-variant transition-colors">
          <span class="material-symbols-outlined text-sm align-middle mr-1">refresh</span>
          Re-ejecutar
        </button>
      </div>

      ${run.has_letter_input ? `
        <div class="bg-primary/10 border-2 border-primary/40 rounded-2xl p-4 mb-4 flex items-center gap-3">
          <span class="material-symbols-outlined text-primary text-2xl">stars</span>
          <div class="flex-1">
            <div class="font-bold text-primary text-sm">Diagnóstico dirigido por carta EACEA</div>
            <div class="text-xs text-on-surface-variant mt-1">
              ${findings.filter(f => f.source_pass === 'D').length} findings vienen directamente del ponente que evaluó el proyecto.
              Resolverlos primero es la prioridad antes de re-presentar.
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Verdict card -->
      <div class="border ${verdictInfo.cls} rounded-2xl p-5 mb-6">
        <div class="flex items-start gap-4">
          <span class="material-symbols-outlined text-3xl">${verdictInfo.icon}</span>
          <div class="flex-1">
            <h3 class="text-xl font-bold">${esc(verdictInfo.title)}</h3>
            <p class="text-sm mt-1 opacity-90">${esc(verdictInfo.desc)}</p>
            <div class="text-xs mt-2 opacity-80">
              <strong>${findings.length}</strong> hallazgos · <strong>${run.critical_findings || 0}</strong> críticos · <strong>${run.high_findings || 0}</strong> altos
              · Score estimado: <strong>${run.total_score_estimate ?? '—'}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Scores grid -->
      <h3 class="text-sm font-bold uppercase text-on-surface-variant mb-3">Score estimado por criterio</h3>
      <div class="grid grid-cols-1 md:grid-cols-${Math.min(scores.length, 4)} gap-3 mb-8">
        ${scores.map(c => scoreCard(c)).join('')}
      </div>

      <!-- Findings -->
      <h3 class="text-sm font-bold uppercase text-on-surface-variant mb-3">Hallazgos a resolver (${findings.length})</h3>
      ${findings.length === 0
        ? `<div class="bg-green-500/5 border border-green-500/30 rounded-xl p-6 text-center text-sm">
             <span class="material-symbols-outlined text-3xl text-green-600 mb-2">check_circle</span>
             <p>No se detectaron hallazgos. Excelente trabajo.</p>
           </div>`
        : Object.entries(findingsByCriterion).map(([crit, list]) =>
            `<div class="mb-6">
               <h4 class="text-xs font-bold uppercase text-primary mb-2">${esc(crit)} (${list.length})</h4>
               ${list.map(findingCard).join('')}
             </div>`).join('')}
    `;
  }

  function scoreCard(c) {
    const pct = c.max > 0 ? Math.round((c.estimated / c.max) * 100) : 0;
    const color =
      c.on5 >= 4 ? 'bg-green-500/10 text-green-700 border-green-500/30' :
      c.on5 >= 3 ? 'bg-yellow-500/10 text-yellow-800 border-yellow-500/30' :
                   'bg-error/10 text-error border-error/30';
    return `
      <div class="border ${color} rounded-xl p-3">
        <div class="text-[10px] uppercase font-bold opacity-80 truncate" title="${esc(c.label || c.id)}">${esc(c.label || c.id)}</div>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="text-2xl font-bold">${c.on5}</span>
          <span class="text-xs opacity-70">/ 5</span>
        </div>
        <div class="text-[10px] opacity-70">${c.estimated} / ${c.max} pts</div>
      </div>`;
  }

  function findingCard(f) {
    const sevColors = {
      critical:    { cls: 'bg-error/15 text-error border-error/40', label: 'Crítico' },
      high:        { cls: 'bg-error/10 text-error border-error/30', label: 'Alto' },
      medium_high: { cls: 'bg-orange-500/10 text-orange-700 border-orange-500/30', label: 'Medio-alto' },
      medium:      { cls: 'bg-yellow-500/10 text-yellow-800 border-yellow-500/30', label: 'Medio' },
      medium_low:  { cls: 'bg-yellow-500/5 text-yellow-700 border-yellow-500/30', label: 'Bajo' },
      low:         { cls: 'bg-on-surface-variant/10 text-on-surface-variant border-outline-variant/40', label: 'Bajo' },
      positive:    { cls: 'bg-green-500/10 text-green-700 border-green-500/30', label: 'Positivo' },
    };
    const sev = sevColors[f.severity] || sevColors.medium;
    const passLabels = { A: 'Ley universal', B: 'Programa', C: 'Coherencia', D: 'Carta evaluador' };
    const fromLetter = f.source_pass === 'D';
    const cardCls = fromLetter
      ? 'bg-primary/5 border-2 border-primary/30'
      : 'bg-surface border border-outline-variant/30';

    return `
      <div class="${cardCls} rounded-xl p-4 mb-2">
        <div class="flex items-start gap-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${sev.cls} whitespace-nowrap mt-0.5">${sev.label}</span>
          <div class="flex-1 min-w-0">
            ${fromLetter
              ? `<div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold mb-1">
                   <span class="material-symbols-outlined text-[12px]">stars</span>
                   Según evaluador EACEA
                 </div>`
              : ''}
            <div class="text-sm font-medium text-on-surface">${esc(f.finding_text)}</div>
            ${f.applies_to_section
              ? `<div class="text-[11px] text-primary mt-1"><strong>Sección:</strong> ${esc(f.applies_to_section)}</div>`
              : ''}
            ${f.suggested_action
              ? `<div class="text-xs text-on-surface-variant mt-2 italic">→ ${esc(f.suggested_action)}</div>`
              : ''}
            ${f.evidence_quote
              ? `<details class="text-[11px] text-on-surface-variant/80 mt-2"><summary class="cursor-pointer">${fromLetter ? 'Cita literal del ponente' : 'Evidencia'}</summary><blockquote class="border-l-2 ${fromLetter ? 'border-primary/40' : 'border-outline-variant/40'} pl-3 mt-1 italic">${esc(f.evidence_quote)}</blockquote></details>`
              : ''}
            <div class="flex items-center gap-2 mt-2 text-[10px] text-on-surface-variant/70">
              <span>${passLabels[f.source_pass] || f.source_pass}</span>
              ${f.estimated_score_delta != null ? `<span>· Impacto estimado: ${f.estimated_score_delta} pts</span>` : ''}
            </div>
          </div>
        </div>
      </div>`;
  }

  function formatDate(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) { return d; }
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  return { init, runNew: runNewDiagnosis };
})();
