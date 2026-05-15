/* ═══════════════════════════════════════════════════════════════
   Master — UI mínima del Documento Maestro (fase Perfeccionar)
   ═══════════════════════════════════════════════════════════════
   Funcionalidad de esta primera iteración:
     - Listar Master Documents del proyecto activo
     - Crear un Master Document vacío (entidad raíz)
     - Compilar Maestro v1 contra el LLM (con preview dry-run de coste)
     - Visualizar capítulos del Maestro en modo lectura
     - Lanzar Diagnóstico inicial y mostrar items narrative/economic

   NO incluido todavía (fases F4-F7):
     - Edición inline de capítulos
     - Regeneración con contexto unificado
     - Chat persistente con anclaje
     - Compresión a formulario y export PDF
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const Master = {};

  function el(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    return tmp.firstChild;
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleString('es', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /* ── Render principal del panel ─────────────────────────────── */

  async function render() {
    const root = document.getElementById('master-content');
    if (!root) return;

    const projectId = window._currentProjectId || (window.App && window.App.currentProjectId);
    if (!projectId) {
      root.innerHTML = `
        <div class="bg-white border border-outline-variant/20 rounded-2xl p-8 text-center">
          <span class="material-symbols-outlined text-5xl text-outline-variant/40 mb-3 block">auto_stories</span>
          <h2 class="text-lg font-bold mb-2 text-on-surface">Documento Maestro</h2>
          <p class="text-sm text-on-surface-variant mb-3">Abre un proyecto desde "Mis Proyectos" para comenzar a perfeccionarlo.</p>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[#16A34A]/10 flex items-center justify-center">
            <span class="material-symbols-outlined text-[#16A34A]">auto_stories</span>
          </div>
          <div>
            <h2 class="font-headline text-xl font-extrabold text-primary tracking-tight">Documento Maestro</h2>
            <p class="text-xs text-on-surface-variant">Fase 3 — Perfeccionar. El libro completo de tu proyecto, sin límites.</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="master-create-btn" class="px-3 py-2 rounded-lg bg-[#16A34A] text-white text-xs font-bold hover:bg-[#15803d] transition-colors flex items-center gap-2">
            <span class="material-symbols-outlined text-base">add</span> Nuevo Maestro
          </button>
        </div>
      </div>
      <div id="master-list-container"></div>
      <div id="master-detail-container" class="mt-6"></div>
    `;

    document.getElementById('master-create-btn').addEventListener('click', () => createNewMaster(projectId));

    await loadList(projectId);
  }

  /* ── Listado de Master Documents del proyecto ──────────────── */

  async function loadList(projectId) {
    const cont = document.getElementById('master-list-container');
    cont.innerHTML = '<div class="text-sm text-on-surface-variant">Cargando...</div>';

    try {
      const resp = await API.get(`/master/projects/${projectId}/documents`);
      const docs = resp.data || [];

      if (!docs.length) {
        cont.innerHTML = `
          <div class="bg-white border border-outline-variant/20 rounded-2xl p-6">
            <p class="text-sm text-on-surface-variant mb-3">Aún no has creado un Documento Maestro para este proyecto.</p>
            <p class="text-xs text-on-surface-variant mb-4">El Documento Maestro es el libro completo de tu proyecto, sin restricciones de caracteres. Es la fuente de verdad de la que luego se destila el formulario oficial.</p>
            <button onclick="Master.createNewMaster('${esc(projectId)}')" class="px-4 py-2 rounded-lg bg-[#16A34A] text-white text-sm font-bold">Crear Maestro v1</button>
          </div>`;
        return;
      }

      const rows = docs.map(d => `
        <div class="bg-white border border-outline-variant/20 rounded-xl p-4 hover:border-[#16A34A]/40 cursor-pointer transition-colors flex items-center justify-between" onclick="Master.openMaster('${esc(d.id)}')">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-[#16A34A]/10 flex items-center justify-center">
              <span class="material-symbols-outlined text-[#16A34A]">auto_stories</span>
            </div>
            <div>
              <div class="font-bold text-sm text-on-surface">${esc(d.version_tag)}${d.version_label ? ' — ' + esc(d.version_label) : ''}</div>
              <div class="text-xs text-on-surface-variant">${fmtChars(d.total_chars)} · ${esc(d.language)} · estado: ${esc(d.status)}</div>
              <div class="text-[10px] text-on-surface-variant mt-0.5">Actualizado ${fmtDate(d.updated_at)}</div>
            </div>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant">arrow_forward</span>
        </div>
      `).join('');

      cont.innerHTML = `<div class="space-y-2">${rows}</div>`;
    } catch (err) {
      cont.innerHTML = `<div class="text-sm text-red-600">Error: ${esc(err.message || err)}</div>`;
    }
  }

  /* ── Crear nuevo Master Document (entidad raíz vacía) ──────── */

  async function createNewMaster(projectId) {
    try {
      const resp = await API.post(`/master/projects/${projectId}/documents`, {
        versionTag: 'v1',
        language: 'es',
      });
      await loadList(projectId);
      if (resp.data && resp.data.id) {
        openMaster(resp.data.id);
      }
    } catch (err) {
      alert('Error creando Maestro: ' + (err.message || err));
    }
  }

  /* ── Abrir Master concreto: lista de capítulos + acciones ──── */

  async function openMaster(masterDocId) {
    const cont = document.getElementById('master-detail-container');
    cont.innerHTML = '<div class="text-sm text-on-surface-variant">Cargando...</div>';

    try {
      const resp = await API.get(`/master/documents/${masterDocId}`);
      const doc = resp.data;
      const chapters = doc.chapters || [];

      const noChapters = chapters.length === 0;

      cont.innerHTML = `
        <div class="bg-white border border-outline-variant/20 rounded-2xl p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="font-bold text-base text-on-surface">${esc(doc.version_tag)} ${doc.version_label ? '— ' + esc(doc.version_label) : ''}</h3>
              <p class="text-xs text-on-surface-variant">${chapters.length} capítulos · ${fmtChars(doc.total_chars)} · estado: ${esc(doc.status)}</p>
            </div>
            <div class="flex items-center gap-2">
              ${noChapters
                ? `<button onclick="Master.previewCompile('${esc(masterDocId)}')" class="px-3 py-2 rounded-lg bg-surface-container-low text-xs font-bold border border-outline-variant/30">Previsualizar coste</button>
                   <button onclick="Master.compileV1('${esc(masterDocId)}')" class="px-3 py-2 rounded-lg bg-[#16A34A] text-white text-xs font-bold">Compilar Maestro v1</button>`
                : `<button onclick="Master.runDiagnosis('${esc(masterDocId)}', 'initial')" class="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold">Lanzar diagnóstico</button>
                   <button onclick="Master.compileV1('${esc(masterDocId)}', true)" class="px-3 py-2 rounded-lg bg-surface-container-low text-xs font-bold border border-outline-variant/30">Recompilar (force)</button>`
              }
            </div>
          </div>

          ${noChapters ? `
            <div class="border-2 border-dashed border-outline-variant/30 rounded-xl p-6 text-center">
              <span class="material-symbols-outlined text-3xl text-outline-variant/40 mb-2 block">menu_book</span>
              <p class="text-sm text-on-surface-variant mb-1">Este Maestro está vacío.</p>
              <p class="text-xs text-on-surface-variant">Pulsa <strong>Compilar Maestro v1</strong> para generar la primera versión con la IA a partir del Diseño, el Writer draft y los interviews del proyecto.</p>
            </div>
          ` : `
            <div class="space-y-2" id="master-chapters-list">
              ${chapters.map((ch, i) => `
                <details class="bg-surface-container-lowest border border-outline-variant/20 rounded-lg" ${i === 0 ? 'open' : ''}>
                  <summary class="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-surface-container-low">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-mono text-on-surface-variant uppercase">${esc(ch.chapter_type)}</span>
                      <span class="font-bold text-sm">${esc(ch.title)}</span>
                    </div>
                    <span class="text-[10px] text-on-surface-variant">${fmtChars(ch.char_count)}</span>
                  </summary>
                  <div class="px-4 py-3 border-t border-outline-variant/10 prose prose-sm max-w-none whitespace-pre-wrap">${esc(ch.body || '(vacío)')}</div>
                </details>
              `).join('')}
            </div>
          `}

          <div id="master-diagnosis-panel" class="mt-6"></div>
        </div>
      `;
    } catch (err) {
      cont.innerHTML = `<div class="text-sm text-red-600">Error: ${esc(err.message || err)}</div>`;
    }
  }

  /* ── Preview compile cost (dry-run) ─────────────────────────── */

  async function previewCompile(masterDocId) {
    try {
      const resp = await API.post(`/master/documents/${masterDocId}/compile-v1`, { dryRun: true });
      const d = resp.data;
      alert(
        `PREVIEW COMPILACIÓN MAESTRO v1\n\n` +
        `Tokens input estimados: ~${d.inputTokensEst.toLocaleString('en')}\n` +
        `Cacheables (estables entre llamadas): ~${(d.cacheableTokensEst || 0).toLocaleString('en')}\n\n` +
        `Coste estimado primera llamada: ${fmtMoney(d.estimatedFirstCallCostUsd)}\n` +
        `Coste estimado llamadas posteriores (cache hit): ${fmtMoney(d.estimatedCachedCallCostUsd)}\n\n` +
        `Si te encaja, pulsa "Compilar Maestro v1".`
      );
    } catch (err) {
      alert('Error en preview: ' + (err.message || err));
    }
  }

  /* ── Compilar Maestro v1 (llamada LLM real) ─────────────────── */

  async function compileV1(masterDocId, force = false) {
    if (!confirm(`¿Compilar Maestro v1${force ? ' (recompilando, se sobrescribirán capítulos existentes)' : ''}?\n\nEsto llama al LLM y consume tokens. Coste típico: $1-3 esta primera llamada.`)) return;

    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Compilando... (puede tardar 1-3 min)';

    try {
      const resp = await API.post(`/master/documents/${masterDocId}/compile-v1`, { force });
      const d = resp.data;
      alert(
        `✓ Maestro compilado\n\n` +
        `Capítulos creados: ${d.chapters_created}\n` +
        `Total caracteres: ${fmtChars(d.total_chars)}\n` +
        `Coste real: ${fmtMoney(d.cost_usd)}\n` +
        `Duración: ${(d.duration_ms / 1000).toFixed(1)}s`
      );
      await openMaster(masterDocId);
    } catch (err) {
      alert('Error compilando: ' + (err.message || err));
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  /* ── Diagnóstico (initial o advanced) ──────────────────────── */

  async function runDiagnosis(masterDocId, kind) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Diagnosticando...';

    try {
      const resp = await API.post(`/master/documents/${masterDocId}/diagnose`, { kind });
      btn.disabled = false;
      btn.textContent = originalText;
      renderDiagnosis(resp.data);
    } catch (err) {
      alert('Error diagnóstico: ' + (err.message || err));
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function renderDiagnosis(diag) {
    const panel = document.getElementById('master-diagnosis-panel');
    if (!panel) return;

    const items = diag.items || [];
    const narrative = items.filter(i => i.classification === 'narrative');
    const economic = items.filter(i => i.classification === 'economic');

    const severityColor = {
      info: 'bg-blue-50 border-blue-200 text-blue-900',
      warning: 'bg-amber-50 border-amber-200 text-amber-900',
      critical: 'bg-red-50 border-red-200 text-red-900',
    };

    function renderItem(it) {
      return `
        <div class="border ${severityColor[it.severity] || severityColor.warning} rounded-lg p-3 mb-2">
          <div class="flex items-start gap-2">
            <span class="text-[10px] uppercase font-bold">${esc(it.severity)}</span>
            <div class="flex-1">
              <div class="font-bold text-sm">${esc(it.title)}</div>
              ${it.detail ? `<div class="text-xs mt-1 opacity-90">${esc(it.detail)}</div>` : ''}
              ${it.suggestion ? `<div class="text-xs mt-2 italic">💡 ${esc(it.suggestion)}</div>` : ''}
              ${it.anchor_label ? `<div class="text-[10px] mt-2 font-mono opacity-70">📍 ${esc(it.anchor_label)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    panel.innerHTML = `
      <div class="border-t border-outline-variant/20 pt-4 mt-4">
        <h4 class="font-bold text-sm mb-2 flex items-center gap-2">
          <span class="material-symbols-outlined text-base">fact_check</span>
          Diagnóstico ${esc(diag.diagnosis_kind)} — ${items.length} hallazgos
        </h4>
        ${diag.summary ? `<p class="text-xs text-on-surface-variant mb-3 italic">${esc(diag.summary)}</p>` : ''}

        ${narrative.length ? `
          <div class="mb-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Narrativos — resolvibles aquí (${narrative.length})</div>
            ${narrative.map(renderItem).join('')}
          </div>
        ` : ''}

        ${economic.length ? `
          <div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">🔒 Económicos — ir a Calculator (${economic.length})</div>
            ${economic.map(renderItem).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /* ── Hook al router de la SPA ─────────────────────────────── */

  // El router de la SPA dispara un evento cuando se entra al panel master.
  // app.js maneja la activación de panels via hash; nosotros nos enganchamos
  // a la mostrada del panel para hacer el render lazy.
  document.addEventListener('panelShown', (e) => {
    if (e.detail && e.detail.route === 'master') render();
  });

  // Fallback: si el panel se muestra sin el evento (caso navegación manual),
  // observamos cambios en la clase del panel.
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

  // Hook directo al hashchange por si el sistema de eventos no cubre el caso
  window.addEventListener('hashchange', () => {
    if (location.hash === '#master') render();
  });

  document.addEventListener('DOMContentLoaded', () => {
    observeMasterPanel();
    if (location.hash === '#master') render();
  });

  /* ── API pública ───────────────────────────────────────────── */

  Master.render = render;
  Master.createNewMaster = createNewMaster;
  Master.openMaster = openMaster;
  Master.previewCompile = previewCompile;
  Master.compileV1 = compileV1;
  Master.runDiagnosis = runDiagnosis;

  window.Master = Master;
})();
