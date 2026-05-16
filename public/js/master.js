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

    // App es const global declarada en app.js. typeof guard por si llega antes de init.
    const activeProject = (typeof App !== 'undefined' && App.getActiveProject) ? App.getActiveProject() : null;
    const projectId = activeProject?.id;
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
      const docs = await API.get(`/master/projects/${projectId}/documents`) || [];

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
      const newDoc = await API.post(`/master/projects/${projectId}/documents`, {
        versionTag: 'v1',
        language: 'es',
      });
      await loadList(projectId);
      if (newDoc && newDoc.id) {
        openMaster(newDoc.id);
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
      const doc = await API.get(`/master/documents/${masterDocId}`);
      const chapters = doc.chapters || [];

      const noChapters = chapters.length === 0;

      // Inventario CAG del proyecto (qué docs entrarían al contexto del LLM)
      let cagInv = null;
      try {
        cagInv = await API.get(`/master/projects/${doc.project_id}/cag-documents`);
      } catch (_) { /* no-op */ }

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
                   <button onclick="Master.downloadMarkdown('${esc(masterDocId)}')" class="px-3 py-2 rounded-lg bg-surface-container-low text-xs font-bold border border-outline-variant/30 inline-flex items-center gap-1.5"><span class="material-symbols-outlined text-base">download</span>Descargar .md</button>
                   <button onclick="Master.compileV1('${esc(masterDocId)}', false)" class="px-3 py-2 rounded-lg bg-surface-container-low text-xs font-bold border border-outline-variant/30">Reanudar capítulos faltantes</button>
                   <button onclick="Master.compileV1('${esc(masterDocId)}', true)" class="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-bold border border-red-200">Recompilar todo (force)</button>`
              }
            </div>
          </div>

          ${cagInv ? `
            <details class="mb-4 bg-surface-container-lowest border border-outline-variant/20 rounded-lg" ${noChapters ? 'open' : ''}>
              <summary class="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-surface-container-low">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-base text-on-surface-variant">folder_open</span>
                  <span class="font-bold text-sm">Documentos en contexto (CAG)</span>
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
          ` : ''}

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
      const d = await API.post(`/master/documents/${masterDocId}/compile-v1`, { dryRun: true });
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

  /* ── Working overlay con icono animado ─────────────────────── */

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
      .master-pencil-wrapper {
        position: relative; width: 96px; height: 96px;
        margin: 0 auto 20px;
      }
      .master-pencil-paper {
        position: absolute; inset: 0;
        border-radius: 12px;
        background: linear-gradient(180deg, #ffffff, #f8fafc);
        border: 1px solid #e2e8f0;
        box-shadow: 0 4px 12px rgba(0,0,0,.06);
      }
      .master-pencil-paper::before,
      .master-pencil-paper::after {
        content: ''; position: absolute; left: 14px; right: 14px;
        height: 2px; border-radius: 2px;
        background: linear-gradient(90deg, transparent 0%, #16A34A 50%, transparent 100%);
        background-size: 200% 100%;
        animation: master-line-write 1.4s ease-in-out infinite;
      }
      .master-pencil-paper::before { top: 30px; }
      .master-pencil-paper::after  { top: 50px; animation-delay: .35s; }
      .master-pencil-line-3 {
        position: absolute; left: 14px; right: 32px;
        top: 70px; height: 2px; border-radius: 2px;
        background: linear-gradient(90deg, transparent 0%, #16A34A 50%, transparent 100%);
        background-size: 200% 100%;
        animation: master-line-write 1.4s ease-in-out infinite;
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
      .master-working-title {
        font-size: 18px; font-weight: 800; color: #0f172a;
        margin-bottom: 6px;
      }
      .master-working-subtitle {
        font-size: 13px; color: #475569;
        min-height: 20px;
        transition: opacity .3s;
      }
      .master-working-elapsed {
        margin-top: 16px; font-size: 11px; color: #94a3b8;
        font-variant-numeric: tabular-nums;
      }
      .master-working-tip {
        margin-top: 18px; padding-top: 14px;
        border-top: 1px solid #e2e8f0;
        font-size: 11px; color: #64748b; font-style: italic;
      }
      .master-stream-viewer {
        margin-top: 20px;
        max-height: 240px; overflow-y: auto;
        background: #0f172a; color: #cbd5e1;
        border-radius: 12px; padding: 14px 16px;
        font-family: ui-monospace, SF Mono, Menlo, monospace;
        font-size: 11px; line-height: 1.5;
        text-align: left;
        white-space: pre-wrap; word-break: break-word;
        scroll-behavior: smooth;
        position: relative;
      }
      .master-stream-viewer::after {
        content: '▋';
        color: #16A34A;
        animation: master-cursor-blink 1s steps(1) infinite;
      }
      @keyframes master-cursor-blink { 50% { opacity: 0; } }
      .master-stream-empty {
        color: #64748b; font-style: italic;
      }
      .master-chapter-list {
        margin-top: 16px;
        text-align: left;
        max-height: 200px;
        overflow-y: auto;
        background: #f8fafc;
        border-radius: 12px;
        padding: 10px 14px;
        border: 1px solid #e2e8f0;
      }
      .master-chapter-item {
        display: flex; align-items: center; gap: 8px;
        padding: 4px 0;
        font-size: 11px;
        color: #475569;
        transition: color .25s;
      }
      .master-chapter-item.done { color: #16A34A; font-weight: 600; }
      .master-chapter-item.current { color: #0f172a; font-weight: 700; }
      .master-chapter-item.failed { color: #dc2626; }
      .master-chapter-icon {
        width: 18px; height: 18px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .master-chapter-icon .material-symbols-outlined { font-size: 14px; }
      .master-chapter-item.current .master-chapter-icon {
        animation: master-current-pulse 1s ease-in-out infinite;
      }
      @keyframes master-current-pulse {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.25); }
      }
    `;
    document.head.appendChild(s);
  }

  function showWorking(title, subtitles, tip, { showStream = false, showChapterList = false } = {}) {
    injectOverlayStyles();
    hideWorking(); // clean if already shown
    const overlay = document.createElement('div');
    overlay.id = 'master-working-overlay';
    overlay.innerHTML = `
      <div class="master-working-card" style="${(showStream || showChapterList) ? 'max-width: 680px;' : ''}">
        <div class="master-pencil-wrapper">
          <div class="master-pencil-paper"></div>
          <div class="master-pencil-line-3"></div>
          <div class="master-pencil-icon">
            <span class="material-symbols-outlined" style="font-size: 22px;">edit</span>
          </div>
        </div>
        <div class="master-working-title">${esc(title)}</div>
        <div class="master-working-subtitle" id="master-working-sub">${esc(subtitles[0] || '')}</div>
        <div class="master-working-elapsed" id="master-working-elapsed">0s</div>
        ${showChapterList ? `<div class="master-chapter-list" id="master-chapter-list"><div class="master-chapter-item"><div class="master-chapter-icon"><span class="material-symbols-outlined">schedule</span></div>Esperando plan de compilación…</div></div>` : ''}
        ${showStream ? `<div class="master-stream-viewer" id="master-stream-viewer"><span class="master-stream-empty">Conectando con el modelo y enviando el contexto…</span></div>` : ''}
        ${tip ? `<div class="master-working-tip">${esc(tip)}</div>` : ''}
      </div>
    `;
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
        setTimeout(() => {
          sub.textContent = subtitles[i];
          sub.style.opacity = '1';
        }, 300);
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
    // Si cambia de capítulo, vaciamos el buffer (no acumulamos entre capítulos)
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

  /* ── Streaming fetch: lee SSE chunk a chunk y dispara callbacks ── */

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

    // Watchdog: si pasa más de idleTimeoutMs sin recibir nada del server,
    // abortar la lectura para que el caller pueda recuperar.
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
      // SSE events separated by blank line
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
        try { dataObj = JSON.parse(payload); } catch (_) { /* ignore */ }
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
    if (aborted) throw new Error('SSE timeout: el servidor lleva más de 4 minutos sin enviar nada. ¿Compilación colgada?');
  }

  /* ── Compilar Maestro v1 (llamada LLM real) ─────────────────── */

  async function compileV1(masterDocId, force = false) {
    if (!confirm(`¿Compilar Maestro v1${force ? ' (recompilando, se sobrescribirán los capítulos existentes)' : ''}?\n\nLa app llamará al LLM 10 veces (un capítulo por llamada, con caché entre ellas para que no sea caro). Coste estimado: $1-2. Tiempo: 8-15 minutos.`)) return;

    resetStreamBuffer();
    showWorking(
      'Compilando Maestro v1, capítulo a capítulo',
      [
        'Cargando contexto del proyecto en la ventana del modelo (89k tokens)…',
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
        'Aplicando estilo evaluator-friendly: lenguaje concreto, sin filler…',
        'Anclando cada KPI a una actividad real del Diseño…',
        'Cuidando que cada capítulo construya sobre el anterior, sin contradicciones…',
        'La cache de Anthropic está rebajando el coste al 10% por capítulo…',
        'Si te apetece, esta es una buena ventana para revisar otro proyecto…',
      ],
      'Esto va a tardar entre 8 y 15 minutos. No cierres esta pestaña. Si quieres salir un rato a por un café o leer algo, perfecto — la app va sola y te avisa al volver. Lo bueno tarda.',
      { showStream: true, showChapterList: true }
    );

    let finalSummary = null;
    let errorObj = null;

    try {
      await fetchSSE(`/v1/master/documents/${masterDocId}/compile-v1?stream=1`, { force }, {
        onStatus: (st) => { /* opcional */ },
        onPlan: (data) => {
          if (data && Array.isArray(data.chapters)) renderChapterPlan(data.chapters);
        },
        onChapterStarted: (data) => {
          if (data && data.chapter_key) {
            markChapterCurrent(data.chapter_key);
            const sub = document.getElementById('master-working-sub');
            if (sub) sub.textContent = `Capítulo ${data.index + 1} de ${data.total}: ${data.title}`;
          }
        },
        onChunk: (data) => {
          if (data && data.text) appendToStreamViewer(data.text, data.chapter_key);
        },
        onChapterDone: (data) => {
          if (data && data.chapter_key) markChapterDone(data.chapter_key);
        },
        onChapterFailed: (data) => {
          if (data && data.chapter_key) markChapterFailed(data.chapter_key);
        },
        onDone: (summary) => { finalSummary = summary; },
        onError: (err) => { errorObj = err; },
      });

      // Eventos custom: 'plan', 'chapter_started', 'chapter_done', 'chapter_failed'
      // se manejan también dentro de fetchSSE — pero usé eventos genéricos, así que
      // expongo la handler vía objeto opts global.
      hideWorking();

      if (errorObj) {
        showToast('Error compilando', errorObj.message || 'Error desconocido', 'error');
        // Aún así, abrimos el Master por si hay capítulos parciales persistidos
        await openMaster(masterDocId);
        return;
      }
      if (finalSummary) {
        const okC = finalSummary.chapters_created;
        const failC = finalSummary.chapters_failed || 0;
        showToast(
          failC > 0 ? `⚠ Maestro compilado parcialmente` : `✓ Maestro compilado`,
          `${okC} capítulos${failC > 0 ? ` (${failC} fallaron)` : ''} · ${fmtChars(finalSummary.total_chars)} · ${fmtMoney(finalSummary.cost_usd)} · ${((finalSummary.duration_ms || 0) / 1000).toFixed(1)}s`,
          failC > 0 ? 'error' : 'success'
        );
        await openMaster(masterDocId);
      }
    } catch (err) {
      hideWorking();
      showToast('Error compilando', err.message || String(err), 'error');
      await openMaster(masterDocId);
    }
  }

  /* ── Diagnóstico (initial o advanced) ──────────────────────── */

  async function runDiagnosis(masterDocId, kind) {
    showWorking(
      kind === 'initial' ? 'Diagnosticando Maestro' : 'Diagnóstico avanzado',
      [
        'Leyendo los capítulos del Maestro…',
        'Buscando contradicciones entre secciones…',
        'Cruzando con criterios de evaluación…',
        'Clasificando hallazgos narrativos vs económicos…',
        'Priorizando severidad…',
      ],
      'Suele tardar 20-60 segundos.'
    );

    try {
      const diag = await API.post(`/master/documents/${masterDocId}/diagnose`, { kind });
      hideWorking();
      renderDiagnosis(diag);
    } catch (err) {
      hideWorking();
      showToast('Error diagnóstico', err.message || String(err), 'error');
    }
  }

  /* ── Toast simple para success/error ──────────────────────── */

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
      </div>
    `;
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
    // Errores persisten hasta cierre manual. Success se va solo a los 8s.
    if (kind !== 'error') {
      setTimeout(() => {
        if (!document.body.contains(toast)) return;
        toast.style.transition = 'opacity .4s, transform .4s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 450);
      }, 8000);
    }
  }

  function renderDiagnosis(diag) {
    const panel = document.getElementById('master-diagnosis-panel');
    if (!panel) return;

    // Tolerancia de shape: items[], o narrative[]+economic[], o array directo
    let items = [];
    if (Array.isArray(diag.items)) items = diag.items;
    else if (Array.isArray(diag.narrative) || Array.isArray(diag.economic)) {
      items = [
        ...(diag.narrative || []).map(x => ({ ...x, classification: 'narrative' })),
        ...(diag.economic || []).map(x => ({ ...x, classification: 'economic' })),
      ];
    } else if (Array.isArray(diag)) items = diag;
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

  Master.render = render;
  Master.createNewMaster = createNewMaster;
  Master.openMaster = openMaster;
  Master.previewCompile = previewCompile;
  Master.compileV1 = compileV1;
  Master.runDiagnosis = runDiagnosis;
  Master.downloadMarkdown = downloadMarkdown;

  window.Master = Master;
})();
