/* ═══════════════════════════════════════════════════════════════
   Admin — Data E+ reference tables management
   Sections: Convocatorias · Países · Per Diem · Personal
   ═══════════════════════════════════════════════════════════════ */

const Admin = (() => {
  let initialized = false;
  let activeSection = 'convocatorias';

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    if (initialized) { loadSection(activeSection); return; }
    initialized = true;
    bindNav();
    // Inspector nav is admin-only (scribes excluded) — IP protection.
    try {
      const role = (typeof App !== 'undefined' && App.getCurrentUser && App.getCurrentUser()?.role) || null;
      if (role === 'admin') document.getElementById('admin-nav-inspector')?.classList.remove('hidden');
    } catch (_) {}
    loadSection('convocatorias');
  }

  /* ── Section nav ─────────────────────────────────────────────── */
  function bindNav() {
    document.querySelectorAll('#admin-section-nav [data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeSection = btn.dataset.section;
        document.querySelectorAll('#admin-section-nav [data-section]').forEach(b => {
          b.classList.remove('border-b-2', 'border-secondary-fixed', 'text-primary', 'font-bold');
          b.classList.add('text-on-surface-variant');
        });
        btn.classList.add('border-b-2', 'border-secondary-fixed', 'text-primary', 'font-bold');
        btn.classList.remove('text-on-surface-variant');
        loadSection(activeSection);
      });
    });
  }

  function loadSection(section) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`admin-sec-${section}`)?.classList.remove('hidden');
    switch (section) {
      case 'convocatorias': loadConvocatorias(); break;
      case 'countries':   loadCountries(); break;
      case 'perdiem':     loadPerdiem(); break;
      case 'workers':     loadWorkers(); bindWorkerAdd(); break;
      case 'entities':    loadEntities(); break;
      case 'eligibility': loadEligibility(); break;
      case 'all-docs':      loadAllDocs(); break;
      case 'platform-docs': loadPlatformDocs(); break;
      case 'library':       loadAdminLibrary(); break;
      case 'patterns':      loadPatterns(); break;
      case 'inspector':     loadInspector(); break;
    }
  }

  /* ── Generic helpers ─────────────────────────────────────────── */
  function setLoading(tbodyId) {
    const el = document.getElementById(tbodyId);
    if (el) el.innerHTML = '<tr><td colspan="20" class="py-8 text-center text-on-surface-variant text-sm">Cargando...</td></tr>';
  }

  function setError(tbodyId, msg) {
    const el = document.getElementById(tbodyId);
    if (el) el.innerHTML = `<tr><td colspan="20" class="py-8 text-center text-error text-sm">${msg}</td></tr>`;
  }

  function fmtDate(d) { return d ? d.slice(0, 10) : '—'; }

  function badge(active) {
    return active
      ? '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">Active</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">Inactive</span>';
  }

  function actionBtns(id, section) {
    return `
      <button onclick="Admin.openEdit('${section}','${id}')" class="text-primary hover:underline text-xs font-semibold mr-3">Edit</button>
      <button onclick="Admin.confirmDelete('${section}','${id}')" class="text-gray-400 hover:text-red-500 text-xs font-semibold transition-colors">Delete</button>`;
  }

  /* ── Inline editor helper ────────────────────────────────────── */

  // Makes a <td> inline-editable. Returns the td element.
  function editable(value, type = 'text') {
    const td = document.createElement('td');
    td.className = 'px-4 py-2';
    if (type === 'bool') {
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !!value;
      chk.className = 'w-4 h-4 accent-primary cursor-pointer';
      td.appendChild(chk);
    } else {
      const inp = document.createElement('input');
      inp.type = type === 'number' ? 'number' : type === 'date' ? 'date' : 'text';
      inp.value = value != null ? value : '';
      inp.className = 'w-full border border-outline rounded px-2 py-1 text-sm bg-surface focus:outline-none focus:ring-1 focus:ring-primary';
      if (type === 'number') { inp.step = '0.01'; inp.min = '0'; }
      td.appendChild(inp);
    }
    return td;
  }

  function editableTd(value, type = 'text') {
    const td = editable(value, type);
    return td.outerHTML; // fallback for innerHTML context (not used for inline, just kept)
  }

  // Reads value from an editable <td> created by editable()
  function readTd(td, type = 'text') {
    if (type === 'bool') return td.querySelector('input').checked ? 1 : 0;
    const v = td.querySelector('input').value.trim();
    return v === '' ? null : v;
  }

  // Switches a row to edit mode
  function makeRowEditable(tr, fields, endpoint, reloadFn) {
    // fields: array of { key, type, tdIndex } where tdIndex is the column index to replace
    const originalHTML = tr.innerHTML;

    // Replace target cells with inputs
    const cells = tr.querySelectorAll('td');
    const editCells = {};
    fields.forEach(({ key, type, tdIndex, value }) => {
      const newTd = editable(value, type);
      newTd.className = 'px-2 py-1';
      tr.replaceChild(newTd, cells[tdIndex]);
      editCells[key] = { td: newTd, type };
    });

    // Replace action cell with save/cancel
    const lastTd = tr.querySelector('td:last-child');
    lastTd.innerHTML = `
      <button class="btn-save text-primary hover:underline text-xs font-semibold mr-2">Guardar</button>
      <button class="btn-cancel text-on-surface-variant hover:underline text-xs">Cancelar</button>`;

    lastTd.querySelector('.btn-cancel').addEventListener('click', () => {
      tr.innerHTML = originalHTML;
    });

    lastTd.querySelector('.btn-save').addEventListener('click', async () => {
      const payload = {};
      Object.entries(editCells).forEach(([key, { td, type }]) => {
        payload[key] = readTd(td, type);
      });
      try {
        await API.patch(endpoint, payload);
        Toast.show('Guardado', 'ok');
        reloadFn();
      } catch (e) {
        Toast.show('Error: ' + e.message, 'error');
      }
    });
  }

  /* ══ CONVOCATORIAS (unified) ════════════════════════════════ */

  let convActiveSubtab = 'data';

  function convShowView(view) {
    document.querySelectorAll('#admin-sec-convocatorias .conv-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`conv-view-${view}`)?.classList.remove('hidden');
  }

  async function loadConvocatorias() {
    ev = { programId: null, programName: '', sections: [], activeSectionIdx: 0, activeQuestionIdx: 0 };
    convShowView('list');
    const list = document.getElementById('conv-program-list');
    list.innerHTML = '<p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Cargando convocatorias...</p>';
    try {
      const programs = await API.get('/admin/data/programs/full');
      if (!programs.length) {
        list.innerHTML = `<div class="text-center py-16">
          <span class="material-symbols-outlined text-5xl text-outline-variant/40 mb-4">campaign</span>
          <p class="text-sm text-on-surface-variant mb-4">No hay convocatorias configuradas</p>
          <button id="conv-first-call" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors">
            <span class="material-symbols-outlined text-sm">add</span> Nueva convocatoria
          </button>
        </div>`;
        document.getElementById('conv-first-call')?.addEventListener('click', () => convNewProgram());
        return;
      }
      programs.sort((a, b) => {
        if (a.active !== b.active) return b.active - a.active;
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
      });

      const fmtDeadline = d => {
        if (!d) return null;
        const dt = new Date(d);
        const diff = Math.ceil((dt - new Date()) / 86400000);
        const str = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        return { str, diff, urgent: diff >= 0 && diff <= 30, past: diff < 0 };
      };

      list.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <button id="conv-new-program" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors">
              <span class="material-symbols-outlined text-sm">add</span> Nueva convocatoria
            </button>
            <button id="conv-import-feed" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-primary bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 transition-colors">
              <span class="material-symbols-outlined text-sm">download</span> Importar de catálogo EU
            </button>
          </div>
          <span class="text-xs text-on-surface-variant">${programs.length} convocatoria${programs.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="grid grid-cols-1 gap-2">
        ${programs.map(p => {
          const dl = fmtDeadline(p.deadline);
          const dlBadge = dl
            ? `<span class="px-2 py-1 rounded-lg text-[10px] font-bold ${dl.past ? 'bg-gray-100 text-gray-400' : dl.urgent ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}">${dl.str}${dl.diff >= 0 ? ' (' + dl.diff + 'd)' : ''}</span>`
            : '';
          const grant = p.eu_grant_max ? `<span class="px-2 py-1 rounded-lg bg-green-50 text-green-700 text-[10px] font-bold">\u20AC${Number(p.eu_grant_max).toLocaleString('en')}</span>` : '';
          const statusBadge = p.active
            ? '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">ACTIVA</span>'
            : '<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-[10px] font-bold">INACTIVA</span>';
          return `
          <div class="conv-card group flex items-center gap-3 px-4 py-3.5 bg-white rounded-xl border border-outline-variant/20 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer" data-id="${p.id}">
            <div class="w-9 h-9 rounded-lg ${p.active ? 'bg-[#1b1464]' : 'bg-gray-300'} flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-white text-base">campaign</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate">${esc(p.name)}</div>
              <div class="flex items-center gap-2 mt-0.5 text-[10px] text-on-surface-variant">
                <span>${esc(p.action_type || '')}</span>
                ${p.template_name ? `<span class="text-primary/50">· ${esc(p.template_name)}</span>` : ''}
                <span class="text-primary/40">· ${p.section_count || 0} sec · ${p.criteria_count || 0} crit · ${p.doc_count || 0} docs</span>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              ${grant} ${dlBadge} ${statusBadge}
              <button class="conv-dup text-on-surface-variant/30 hover:text-primary transition-colors" data-id="${p.id}" title="Duplicar">
                <span class="material-symbols-outlined text-sm">content_copy</span>
              </button>
              <button class="conv-del text-on-surface-variant/30 hover:text-error transition-colors" data-id="${p.id}" data-name="${esc(p.name)}" title="Eliminar">
                <span class="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          </div>`;
        }).join('')}
        </div>`;

      document.getElementById('conv-new-program')?.addEventListener('click', () => convNewProgram());
      document.getElementById('conv-import-feed')?.addEventListener('click', () => convImportFromFeed());
      list.querySelectorAll('.conv-card').forEach(card => {
        card.addEventListener('click', e => {
          if (e.target.closest('.conv-del') || e.target.closest('.conv-dup')) return;
          const prog = programs.find(p => p.id === card.dataset.id);
          convOpenProgram(prog.id, prog.name, prog);
        });
      });
      list.querySelectorAll('.conv-del').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); evalDeleteProgram(btn.dataset.id, btn.dataset.name); });
      });
      list.querySelectorAll('.conv-dup').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          if (!confirm('Duplicar esta convocatoria con todos sus criterios, elegibilidad y documentos?')) return;
          try {
            Toast.show('Duplicando...', 'ok');
            const result = await API.post(`/admin/data/programs/${btn.dataset.id}/duplicate`);
            Toast.show('Convocatoria duplicada: ' + (result.name || ''), 'ok');
            loadConvocatorias();
          } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
        });
      });
    } catch (e) { list.innerHTML = `<p class="text-sm text-error">${e.message}</p>`; }
  }

  async function convNewProgram() {
    try {
      Toast.show('Creando convocatoria...', 'ok');
      const name = 'Nueva convocatoria';
      const { id } = await API.post('/admin/data/programs', {
        name,
        program_id: 'new_' + Date.now(),
        action_type: '',
        active: 1
      });
      // No pre-load eval template — admin links form template first, then generates eval from it
      convOpenProgram(id, name);
    } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
  }

  async function convImportFromFeed() {
    let modal = document.getElementById('conv-import-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'conv-import-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-10 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <div>
            <h3 class="font-headline text-base font-bold text-primary">Importar de catálogo EU</h3>
            <p class="text-xs text-on-surface-variant mt-0.5">Busca el código o título de la convocatoria. Se importará como INACTIVA y abrirá el editor.</p>
          </div>
          <button id="conv-import-close" class="text-on-surface-variant hover:text-error">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="px-6 py-3 border-b border-outline-variant/20">
          <input id="conv-import-search" type="text" placeholder="Ej: ERASMUS-EDU-2026-PEX-COVE o Centres of Vocational"
            class="w-full px-3 py-2 rounded-lg border border-outline-variant/40 focus:border-primary focus:outline-none text-sm" autofocus />
        </div>
        <div id="conv-import-list" class="flex-1 overflow-y-auto px-3 py-3">
          <p class="text-sm text-on-surface-variant text-center py-10"><span class="spinner"></span> Cargando catálogo...</p>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const closeFn = () => modal.remove();
    document.getElementById('conv-import-close').addEventListener('click', closeFn);
    modal.addEventListener('click', e => { if (e.target === modal) closeFn(); });

    let allCalls = [];
    try {
      const res = await API.get('/convocatorias?limit=2000');
      allCalls = (res.items || []).filter(c => c.source !== 'salto');
    } catch (e) {
      document.getElementById('conv-import-list').innerHTML = `<p class="text-sm text-error text-center py-10">Error: ${esc(e.message || e)}</p>`;
      return;
    }

    const renderList = (filter) => {
      const f = filter.toLowerCase();
      const filtered = !f ? allCalls.slice(0, 200)
        : allCalls.filter(c =>
            (c.source_id || '').toLowerCase().includes(f) ||
            (c.title || '').toLowerCase().includes(f) ||
            (c.programme || '').toLowerCase().includes(f)
          ).slice(0, 200);

      const listEl = document.getElementById('conv-import-list');
      if (filtered.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-on-surface-variant text-center py-10">Sin resultados</p>';
        return;
      }
      listEl.innerHTML = `
        <div class="text-[10px] text-on-surface-variant px-2 mb-2">${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}${f ? '' : ' (mostrando primeros 200)'}</div>
        ${filtered.map(c => {
          const dlBadge = c.deadline
            ? `<span class="text-[10px] text-on-surface-variant">DL ${c.deadline.slice(0, 10)}</span>` : '';
          const efsBadge = c.available_in_efs
            ? '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[9px] font-bold">YA EN EFS</span>' : '';
          const grant = c.budget_per_project_max_eur
            ? `<span class="text-[10px] text-on-surface-variant">€${Number(c.budget_per_project_max_eur).toLocaleString('en')}</span>` : '';
          return `
          <button class="conv-import-row group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-container transition-colors" data-source-id="${esc(c.source_id || c.call_id)}">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-on-surface group-hover:text-primary truncate">${esc(c.title || '—')}</div>
              <div class="flex items-center gap-2 mt-0.5 text-[10px] text-on-surface-variant font-mono">${esc(c.source_id || c.call_id)}</div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">${grant} ${dlBadge} ${efsBadge}</div>
          </button>`;
        }).join('')}`;
      listEl.querySelectorAll('.conv-import-row').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sid = btn.dataset.sourceId;
          btn.disabled = true; btn.style.opacity = '0.5';
          try {
            const result = await API.post('/admin/data/programs/import-from-feed', { source_id: sid });
            closeFn();
            Toast.show(result.already_existed ? 'Ya existía, abriendo...' : 'Convocatoria importada (INACTIVA)', 'ok');
            convOpenProgram(result.id, sid);
          } catch (e) {
            Toast.show('Error: ' + (e.message || e), 'err');
            btn.disabled = false; btn.style.opacity = '1';
          }
        });
      });
    };

    renderList('');
    document.getElementById('conv-import-search').addEventListener('input', e => renderList(e.target.value));
  }

  async function convOpenProgram(programId, programName, prog) {
    ev.programId = programId;
    ev.programName = programName;
    ev.activeSectionIdx = 0;
    ev.activeQuestionIdx = 0;
    convActiveSubtab = 'data';

    convShowView('editor');
    document.getElementById('conv-editor-title').textContent = programName;
    document.getElementById('conv-editor-subtitle').textContent = prog?.action_type || '';
    const badgeEl = document.getElementById('conv-editor-badge');
    if (prog) {
      badgeEl.innerHTML = prog.active
        ? '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">ACTIVA</span>'
        : '<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-[10px] font-bold">INACTIVA</span>';
    }

    // Bind back
    const backBtn = document.getElementById('conv-back-btn');
    backBtn.onclick = () => loadConvocatorias();

    // Bind sub-tabs
    document.querySelectorAll('#conv-subtabs .conv-subtab').forEach(btn => {
      btn.onclick = () => {
        convActiveSubtab = btn.dataset.subtab;
        document.querySelectorAll('#conv-subtabs .conv-subtab').forEach(b => {
          b.classList.remove('border-secondary-fixed', 'text-primary');
          b.classList.add('border-transparent', 'text-on-surface-variant');
        });
        btn.classList.add('border-secondary-fixed', 'text-primary');
        btn.classList.remove('border-transparent', 'text-on-surface-variant');
        convRenderSubtab();
      };
    });
    // Reset active tab visual
    document.querySelectorAll('#conv-subtabs .conv-subtab').forEach(b => {
      b.classList.remove('border-secondary-fixed', 'text-primary');
      b.classList.add('border-transparent', 'text-on-surface-variant');
    });
    document.querySelector('#conv-subtabs [data-subtab="data"]').classList.add('border-secondary-fixed', 'text-primary');
    document.querySelector('#conv-subtabs [data-subtab="data"]').classList.remove('border-transparent', 'text-on-surface-variant');

    // Load eval tree for criteria tab
    ev.sections = await API.get('/admin/data/eval/' + ev.programId);

    convRenderSubtab();
  }

  function convRenderSubtab() {
    const content = document.getElementById('conv-subtab-content');
    switch (convActiveSubtab) {
      case 'data':        evalRenderCallData(content); break;
      case 'eligibility': evalRenderEligibility(content); break;
      case 'intake':      convRenderIntakeTab(content); break;
      case 'form':        convRenderFormTab(content); break;
      case 'budget':      convRenderBudgetTab(content); break;
      case 'criteria':    convRenderCriteriaTab(content); break;
      case 'docs':        convRenderDocsTab(content); break;
    }
  }

  /* ── Criteria sub-tab: reuses eval sidebar + main ─────────── */
  async function convRenderCriteriaTab(content) {
    // If no sections exist but template is linked, offer to generate
    if (!ev.sections.length) {
      const programs = await API.get('/admin/data/programs');
      const prog = programs.find(p => p.id === ev.programId);
      if (prog?.form_template_id) {
        content.innerHTML = `
          <div class="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto">
            <span class="material-symbols-outlined text-5xl text-purple-300 mb-4">auto_awesome</span>
            <h3 class="font-headline text-lg font-bold text-primary mb-2">Generar estructura de evaluacion desde el formulario</h3>
            <p class="text-sm text-on-surface-variant mb-6">Esta convocatoria tiene un form template vinculado pero no tiene criterios de evaluacion. Puedes generar automaticamente las secciones y preguntas basandote en la estructura del formulario.</p>
            <p class="text-xs text-on-surface-variant mb-6">Se crearan las secciones (Relevance, Quality, Partnership, Impact, etc.) con todas sus preguntas. Los pesos y criterios los configuras despues.</p>
            <button id="conv-generate-eval" class="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors shadow-md">
              <span class="material-symbols-outlined text-lg">auto_awesome</span> Generar desde form template
            </button>
            <div class="mt-6 w-full border-t border-outline-variant/20 pt-4">
              <button id="conv-manual-section" class="text-xs text-on-surface-variant hover:text-primary transition-colors">o crear secciones manualmente</button>
            </div>
          </div>`;
        document.getElementById('conv-generate-eval')?.addEventListener('click', async () => {
          try {
            Toast.show('Generando estructura...', 'ok');
            await API.post(`/admin/data/programs/${ev.programId}/generate-eval`, { template_id: prog.form_template_id });
            ev.sections = await API.get('/admin/data/eval/' + ev.programId);
            Toast.show(`Generadas ${ev.sections.length} secciones con sus preguntas`, 'ok');
            convRenderCriteriaTab(content);
          } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
        });
        document.getElementById('conv-manual-section')?.addEventListener('click', () => {
          convRenderCriteriaEditor(content);
        });
        return;
      }
      // No template linked either
      content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <span class="material-symbols-outlined text-5xl text-outline-variant/40 mb-4">rule</span>
          <h3 class="font-headline text-lg font-bold text-primary mb-2">Sin criterios de evaluacion</h3>
          <p class="text-sm text-on-surface-variant mb-6">Vincula primero un form template en la pestana "Form" para poder generar las preguntas automaticamente.</p>
        </div>`;
      return;
    }
    convRenderCriteriaEditor(content);
  }

  function convRenderCriteriaEditor(content) {
    content.innerHTML = `
      <div class="flex gap-0 items-start" style="min-height:70vh">
        <div id="eval-sidebar" class="w-72 flex-shrink-0 bg-[#edf2f9] rounded-l-2xl flex flex-col border-r border-outline-variant/20">
          <div class="px-5 py-3">
            <div class="text-[11px] text-on-surface-variant font-medium">Evaluation framework</div>
          </div>
          <div id="eval-sidebar-sections" class="px-3 py-1"></div>
          <div class="p-3">
            <button id="eval-add-section-btn" class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-primary border border-dashed border-primary/30 hover:bg-primary/5 transition-colors">
              <span class="material-symbols-outlined text-sm">add</span> Add section
            </button>
          </div>
        </div>
        <div id="eval-main" class="flex-1 min-w-0 bg-white rounded-r-2xl border border-l-0 border-outline-variant/20">
          <div id="eval-main-content" class="p-6">
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <span class="material-symbols-outlined text-5xl text-outline-variant/40 mb-3">edit_note</span>
              <p class="text-sm text-on-surface-variant">Selecciona una pregunta del sidebar para editar.</p>
            </div>
          </div>
        </div>
      </div>`;

    // Bind add section
    document.getElementById('eval-add-section-btn')?.addEventListener('click', async () => {
      const title = prompt('Section title (e.g. Relevance):');
      if (!title) return;
      const maxStr = prompt('Max score for this section (EU fixed, e.g. 30):');
      const maxScore = parseFloat(maxStr) || 0;
      try {
        await API.post('/admin/data/eval/sections', { program_id: ev.programId, title, color: EVAL_COLORS[ev.sections.length % EVAL_COLORS.length], max_score: maxScore, sort_order: ev.sections.length });
        ev.sections = await API.get('/admin/data/eval/' + ev.programId);
        evalRenderSidebar();
        Toast.show('Section added', 'ok');
      } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
    });

    ev.activeSectionIdx = 0;
    ev.activeQuestionIdx = 0;
    evalRenderSidebar();
    evalRenderMain();
  }

  /* ── Intake sub-tab: select intake template ─────────────── */
  const INTAKE_TEMPLATES = [
    { id: 'eacea_standard', name: 'EACEA Standard', desc: 'Centralizados (KA3, CBHE, Alliances, Jean Monnet, Sport, etc.)' },
  ];

  async function convRenderIntakeTab(content) {
    const programs = await API.get('/admin/data/programs');
    const prog = programs.find(p => p.id === ev.programId) || {};
    const current = prog.intake_template || '';

    content.innerHTML = `
      <div class="max-w-lg">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-2 h-10 rounded-full bg-teal-500"></div>
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-primary">INTAKE TEMPLATE</div>
            <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">Tipo de Intake (Design)</h3>
          </div>
        </div>
        <p class="text-sm text-on-surface-variant mb-4">Define que estructura de intake/design usaran los proyectos de esta convocatoria.</p>
        <div class="space-y-2 mb-4">
          ${INTAKE_TEMPLATES.map(t => `
            <label class="flex items-center gap-3 p-4 rounded-xl border ${current === t.id ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-primary/30'} cursor-pointer transition-colors">
              <input type="radio" name="intake-tpl" value="${t.id}" ${current === t.id ? 'checked' : ''} class="accent-primary">
              <div class="flex-1">
                <p class="text-sm font-bold text-on-surface">${esc(t.name)}</p>
                <p class="text-xs text-on-surface-variant">${esc(t.desc)}</p>
              </div>
              ${current === t.id ? '<span class="material-symbols-outlined text-primary">check_circle</span>' : ''}
            </label>
          `).join('')}
        </div>
        <button id="intake-tpl-save" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors">
          <span class="material-symbols-outlined text-sm">save</span> Guardar
        </button>
      </div>`;

    document.getElementById('intake-tpl-save')?.addEventListener('click', async () => {
      const selected = content.querySelector('input[name="intake-tpl"]:checked')?.value;
      if (!selected) return Toast.show('Selecciona un tipo', 'err');
      try {
        await API.patch('/admin/data/programs/' + ev.programId, { intake_template: selected });
        Toast.show('Intake template guardado', 'ok');
        convRenderIntakeTab(content);
      } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
    });
  }

  /* ── Budget sub-tab: select budget template ─────────────── */
  const BUDGET_TEMPLATES = [
    { id: 'eacea_lump_sum', name: 'EACEA Lump Sum', desc: 'Centralizados — presupuesto por Work Packages con lump sum, costes indirectos 7%' },
  ];

  async function convRenderBudgetTab(content) {
    const programs = await API.get('/admin/data/programs');
    const prog = programs.find(p => p.id === ev.programId) || {};
    const current = prog.budget_template || '';

    content.innerHTML = `
      <div class="max-w-lg">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-2 h-10 rounded-full bg-emerald-500"></div>
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-primary">BUDGET TEMPLATE</div>
            <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">Tipo de Presupuesto</h3>
          </div>
        </div>
        <p class="text-sm text-on-surface-variant mb-4">Define que estructura de presupuesto usaran los proyectos de esta convocatoria.</p>
        <div class="space-y-2 mb-4">
          ${BUDGET_TEMPLATES.map(t => `
            <label class="flex items-center gap-3 p-4 rounded-xl border ${current === t.id ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-primary/30'} cursor-pointer transition-colors">
              <input type="radio" name="budget-tpl" value="${t.id}" ${current === t.id ? 'checked' : ''} class="accent-primary">
              <div class="flex-1">
                <p class="text-sm font-bold text-on-surface">${esc(t.name)}</p>
                <p class="text-xs text-on-surface-variant">${esc(t.desc)}</p>
              </div>
              ${current === t.id ? '<span class="material-symbols-outlined text-primary">check_circle</span>' : ''}
            </label>
          `).join('')}
        </div>
        <button id="budget-tpl-save" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors">
          <span class="material-symbols-outlined text-sm">save</span> Guardar
        </button>
      </div>`;

    document.getElementById('budget-tpl-save')?.addEventListener('click', async () => {
      const selected = content.querySelector('input[name="budget-tpl"]:checked')?.value;
      if (!selected) return Toast.show('Selecciona un tipo', 'err');
      try {
        await API.patch('/admin/data/programs/' + ev.programId, { budget_template: selected });
        Toast.show('Budget template guardado', 'ok');
        convRenderBudgetTab(content);
      } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
    });
  }

  /* ── Form sub-tab: read-only template viewer ─────────────── */
  async function convRenderFormTab(content) {
    content.innerHTML = '<p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Cargando template...</p>';
    try {
      // Get programme to find form_template_id
      const programs = await API.get('/admin/data/programs');
      const prog = programs.find(p => p.id === ev.programId);
      const templates = await API.get('/admin/data/forms/templates');

      if (!prog?.form_template_id || fm.forceTemplateSelect) {
        // No template linked (or admin chose to change it) — show selector
        const current = prog?.form_template_id || '';
        content.innerHTML = `
          <div class="max-w-lg">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-2 h-10 rounded-full bg-purple-500"></div>
              <div>
                <div class="text-[10px] font-bold uppercase tracking-widest text-primary">FORM TEMPLATE</div>
                <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">${current ? 'Cambiar formulario' : 'Vincular formulario'}</h3>
              </div>
            </div>
            <p class="text-sm text-on-surface-variant mb-4">Elige el formulario de esta convocatoria. Los formularios de Agencia Nacional (copia-pega) no se suben como documento.</p>
            <select id="conv-template-select" class="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 text-sm mb-3">
              <option value="">— Seleccionar template —</option>
              ${templates.map(t => `<option value="${t.id}" ${t.id === current ? 'selected' : ''}>${esc(t.name)} (v${t.version}${t.year ? ', ' + t.year : ''})</option>`).join('')}
            </select>
            <div class="flex items-center gap-2">
              <button id="conv-link-template" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors">
                <span class="material-symbols-outlined text-sm">link</span> ${current ? 'Actualizar' : 'Vincular'} template
              </button>
              ${current ? '<button id="conv-cancel-template" class="text-xs text-on-surface-variant hover:underline px-3">Cancelar</button>' : ''}
            </div>
          </div>`;
        document.getElementById('conv-link-template')?.addEventListener('click', async () => {
          const tplId = document.getElementById('conv-template-select').value;
          if (!tplId) return Toast.show('Selecciona un template', 'err');
          try {
            await API.patch('/admin/data/programs/' + ev.programId, { form_template_id: tplId });
            Toast.show('Template vinculado', 'ok');
            fm.forceTemplateSelect = false; fm.activeSection = null;
            convRenderFormTab(content);
          } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
        });
        document.getElementById('conv-cancel-template')?.addEventListener('click', () => {
          fm.forceTemplateSelect = false;
          convRenderFormTab(content);
        });
        return;
      }

      // Template linked — show read-only viewer
      const tpl = await API.get('/admin/data/forms/templates/' + prog.form_template_id);
      fm.template = tpl.template_json;
      fm.values = {};
      fm.instanceId = null;
      if (!fm.activeSection) fm.activeSection = '__cover';

      // Build nav + content
      const tmpl = fm.template;
      const navItems = [];
      navItems.push({ id: '__cover', label: 'Cover Page', icon: 'badge' });
      navItems.push({ id: '__summary', label: 'Project Summary', icon: 'summarize' });
      if (tmpl.sections) {
        for (const sec of tmpl.sections) {
          navItems.push({ id: sec.id, label: `${sec.number}. ${sec.title}`, icon: 'folder', level: 0 });
          for (const sub of (sec.subsections || [])) {
            navItems.push({ id: sub.id, label: `${sub.number} ${sub.title}`, icon: 'article', level: 1 });
          }
          for (const grp of (sec.subsections_groups || [])) {
            for (const sub of (grp.subsections || [])) {
              navItems.push({ id: sub.id, label: `${sub.number} ${sub.title}`, icon: 'article', level: 1 });
            }
          }
        }
      }
      if (tmpl.annexes) navItems.push({ id: '__annexes', label: 'Annexes', icon: 'attach_file' });

      content.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-2 h-10 rounded-full bg-purple-500"></div>
            <div>
              <div class="text-[10px] font-bold uppercase tracking-widest text-primary">FORM TEMPLATE</div>
              <h3 class="font-headline text-base font-extrabold text-on-surface tracking-tight">${esc(tpl.name)} <span class="text-on-surface-variant font-normal text-sm">v${tpl.version}</span></h3>
            </div>
          </div>
          <button id="conv-change-template" class="text-xs text-primary hover:underline">Cambiar template</button>
        </div>
        <div class="flex gap-4 items-start" style="min-height:60vh">
          <div id="conv-form-nav" class="w-56 flex-shrink-0 space-y-0.5">
            ${navItems.map(it => `
            <div class="conv-form-nav-item flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all text-xs ${fm.activeSection === it.id ? 'bg-[#1b1464] text-white font-bold' : 'text-primary/70 hover:bg-primary/5'}"
                 data-sid="${it.id}" style="${it.level ? 'padding-left:'+(12 + it.level * 12)+'px' : ''}">
              <span class="material-symbols-outlined text-sm">${it.icon}</span>
              <span class="truncate">${esc(it.label)}</span>
            </div>`).join('')}
          </div>
          <div id="forms-main-content" class="flex-1 min-w-0"></div>
        </div>`;

      // Bind nav
      content.querySelectorAll('.conv-form-nav-item').forEach(el => {
        el.addEventListener('click', () => {
          fm.activeSection = el.dataset.sid;
          convRenderFormTab(content);
        });
      });
      // Bind change template — show the dropdown selector (pre-selected)
      document.getElementById('conv-change-template')?.addEventListener('click', () => {
        fm.forceTemplateSelect = true;
        convRenderFormTab(content);
      });

      // Render active section
      const secData = formsFindSection(fm.activeSection);
      if (secData) formsRenderSection(secData);
    } catch (e) { content.innerHTML = `<p class="text-sm text-error">${e.message}</p>`; }
  }

  /* ── Docs sub-tab ────────────────────────────────────────── */
  async function convRenderDocsTab(content) {
    content.innerHTML = `
      <div class="flex items-center gap-3 mb-5">
        <div class="w-2 h-10 rounded-full bg-amber-500"></div>
        <div>
          <div class="text-[10px] font-bold uppercase tracking-widest text-primary">CALL KNOWLEDGE BASE</div>
          <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">Documentos de la convocatoria</h3>
        </div>
      </div>
      <p class="text-sm text-on-surface-variant mb-4">Los documentos subidos se vectorizan y estarán disponibles como contexto para el Writer (IA).</p>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
          <h4 class="text-xs font-bold uppercase text-on-surface-variant mb-3">Subir documento nuevo</h4>
          <form id="conv-doc-upload-form" class="space-y-3">
            <input type="file" id="conv-doc-file" accept=".pdf,.docx,.txt,.csv,.xlsx" required multiple
              class="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#1b1464] file:text-[#fbff12] file:cursor-pointer">
            <div class="grid grid-cols-3 gap-3">
              <input type="text" id="conv-doc-title" placeholder="Titulo (auto desde nombre del archivo)"
                class="px-3 py-2 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
              <select id="conv-doc-type" class="px-3 py-2 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="programme_guide">Programme Guide</option>
                <option value="call_document">Call Document</option>
                <option value="annex">Annex</option>
                <option value="template">Template</option>
                <option value="faq">FAQ</option>
                <option value="other">Other</option>
              </select>
              <input type="text" id="conv-doc-tags" placeholder="Tags (comma separated)"
                class="px-3 py-2 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer select-none">
                <input type="checkbox" id="conv-doc-transversal" class="rounded border-outline-variant accent-primary">
                <span>Transversal</span>
                <span class="text-[10px] text-on-surface-variant/60">(disponible para todas las calls)</span>
              </label>
            </div>
            <button id="conv-doc-submit-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-outlined text-sm">cloud_upload</span>
              <span id="conv-doc-submit-label">Subir y vectorizar</span>
            </button>
          </form>
          <div id="conv-doc-progress" class="hidden mt-3 pt-3 border-t border-outline-variant/20"></div>
        </div>

        <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest flex flex-col">
          <h4 class="text-xs font-bold uppercase text-on-surface-variant mb-3">Seleccionar existentes</h4>
          <p class="text-xs text-on-surface-variant/70 mb-3">Documentos del mismo tipo de call o transversales ya subidos en otras convocatorias.</p>
          <button type="button" id="conv-doc-pick-existing" class="mt-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-[#1b1464] border-2 border-[#1b1464]/30 hover:bg-[#1b1464]/5 transition-colors">
            <span class="material-symbols-outlined text-sm">library_add</span> Buscar documentos existentes
          </button>
        </div>
      </div>

      <div id="conv-docs-list"><p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Cargando...</p></div>`;

    // Load docs
    convLoadDocs();

    // Auto-fill title from filename when 1 file is picked; clear when N>1
    const stripExt = n => n.replace(/\.[^.]+$/, '');
    document.getElementById('conv-doc-file')?.addEventListener('change', (e) => {
      const files = e.target.files;
      const titleEl = document.getElementById('conv-doc-title');
      if (!titleEl) return;
      if (files.length === 1) {
        titleEl.value = stripExt(files[0].name);
        titleEl.disabled = false;
        titleEl.placeholder = 'Titulo (auto desde nombre del archivo)';
      } else if (files.length > 1) {
        titleEl.value = '';
        titleEl.disabled = true;
        titleEl.placeholder = `${files.length} archivos — se usará el nombre de cada uno`;
      }
    });

    // Bind upload (loop for multi-file with per-file progress)
    document.getElementById('conv-doc-upload-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const files = Array.from(document.getElementById('conv-doc-file').files);
      if (!files.length) return;

      const titleOverride = files.length === 1 ? document.getElementById('conv-doc-title').value : '';
      const tags = document.getElementById('conv-doc-tags').value;
      const isTransversal = document.getElementById('conv-doc-transversal').checked;
      const tagList = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      if (isTransversal && !tagList.includes('transversal')) tagList.push('transversal');
      const docType = document.getElementById('conv-doc-type').value;

      const progEl = document.getElementById('conv-doc-progress');
      const submitBtn = document.getElementById('conv-doc-submit-btn');
      const submitLbl = document.getElementById('conv-doc-submit-label');
      const fileInput = document.getElementById('conv-doc-file');
      const titleInput = document.getElementById('conv-doc-title');

      progEl.classList.remove('hidden');
      progEl.innerHTML = `
        <div id="conv-prog-summary" class="text-xs font-bold text-on-surface-variant mb-2 flex items-center gap-2">
          <span class="material-symbols-outlined text-base animate-spin text-primary">sync</span>
          <span>Procesando 0 / ${files.length}</span>
        </div>
        <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          ${files.map((f, i) => `
            <div class="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white/40" data-prog-idx="${i}">
              <span class="prog-icon material-symbols-outlined text-on-surface-variant/50 text-base">schedule</span>
              <span class="flex-1 truncate" title="${esc(f.name)}">${esc(f.name)}</span>
              <span class="prog-status text-[10px] text-on-surface-variant/70 font-medium">en cola</span>
            </div>`).join('')}
        </div>`;

      const updateRow = (i, status, label) => {
        const row = progEl.querySelector(`[data-prog-idx="${i}"]`);
        if (!row) return;
        const icon = row.querySelector('.prog-icon');
        const stat = row.querySelector('.prog-status');
        if (status === 'uploading') {
          icon.textContent = 'sync'; icon.className = 'prog-icon material-symbols-outlined text-primary text-base animate-spin';
          stat.textContent = 'subiendo...'; stat.className = 'prog-status text-[10px] text-primary font-bold';
          row.classList.add('bg-primary/5');
        } else if (status === 'done') {
          icon.textContent = 'check_circle'; icon.className = 'prog-icon material-symbols-outlined text-green-600 text-base';
          stat.textContent = label || 'subido · vectorizando'; stat.className = 'prog-status text-[10px] text-green-700 font-bold';
          row.classList.remove('bg-primary/5'); row.classList.add('bg-green-50');
        } else if (status === 'failed') {
          icon.textContent = 'error'; icon.className = 'prog-icon material-symbols-outlined text-red-600 text-base';
          stat.textContent = label || 'fallo'; stat.className = 'prog-status text-[10px] text-red-700 font-bold';
          row.classList.remove('bg-primary/5'); row.classList.add('bg-red-50');
        }
      };

      submitBtn.disabled = true;
      fileInput.disabled = true;
      if (titleInput) titleInput.disabled = true;

      let ok = 0, fail = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        submitLbl.textContent = `Subiendo ${i + 1} / ${files.length}...`;
        document.getElementById('conv-prog-summary').querySelector('span:last-child').textContent = `Procesando ${i + 1} / ${files.length} — ${file.name}`;
        updateRow(i, 'uploading');
        const title = titleOverride || stripExt(file.name);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', title);
        fd.append('tags', tagList.join(','));
        fd.append('doc_type', 'call');
        fd.append('program_id', ev.programId);
        try {
          const res = await fetch('/v1/documents/official', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + API.getToken() },
            body: fd
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error?.message || 'Upload failed');
          await API.post(`/admin/data/programs/${ev.programId}/docs`, {
            document_id: json.data.id,
            doc_type: docType,
            label: title
          });
          ok++;
          updateRow(i, 'done');
        } catch (err) {
          fail++;
          updateRow(i, 'failed', err.message.slice(0, 40));
        }
      }

      const summary = document.getElementById('conv-prog-summary');
      summary.innerHTML = fail
        ? `<span class="material-symbols-outlined text-base text-red-600">error</span><span class="text-red-700">Completado: ${ok} subido(s) · ${fail} fallido(s)</span>`
        : `<span class="material-symbols-outlined text-base text-green-600">task_alt</span><span class="text-green-700">${ok} documento(s) subido(s) — vectorización en curso</span>`;

      submitBtn.disabled = false;
      fileInput.disabled = false;
      if (titleInput) { titleInput.disabled = false; titleInput.placeholder = 'Titulo (auto desde nombre del archivo)'; }
      submitLbl.textContent = 'Subir y vectorizar';
      document.getElementById('conv-doc-upload-form').reset();
      convLoadDocs();
    });

    // Pick existing documents modal
    document.getElementById('conv-doc-pick-existing')?.addEventListener('click', async () => {
      let available;
      try {
        available = await API.get(`/admin/data/programs/${ev.programId}/available-docs`);
      } catch (e) { Toast.show('Error cargando documentos: ' + e.message, 'error'); return; }

      if (!available.length) {
        Toast.show('No hay documentos disponibles para vincular', 'info');
        return;
      }

      const TYPE_ICONS = { programme_guide: '\ud83d\udcd5', call_document: '\ud83d\udcd8', annex: '\ud83d\udcce', template: '\ud83d\udcc4', faq: '\u2753', other: '\ud83d\udcc1' };
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]';
      overlay.style.animation = 'fadeIn .15s ease';

      // Group by source call
      const grouped = {};
      for (const d of available) {
        const key = d.source_call_name || 'Otros';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(d);
      }

      let listHtml = '';
      for (const [callName, docs] of Object.entries(grouped)) {
        listHtml += `<div class="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-primary sticky top-0 bg-white/95 backdrop-blur-sm z-10">${esc(callName)}</div>`;
        listHtml += docs.map(d => pickDocRow(d, TYPE_ICONS)).join('');
      }

      overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden" style="animation:critIn .2s ease">
          <div class="px-5 py-4 border-b border-outline-variant/20 flex items-center gap-3">
            <span class="material-symbols-outlined text-primary text-xl">library_add</span>
            <div class="flex-1">
              <h3 class="font-bold text-on-surface">Seleccionar documentos existentes</h3>
              <p class="text-xs text-on-surface-variant">${available.length} documentos disponibles</p>
            </div>
            <button id="pick-doc-close" class="p-1 rounded-lg hover:bg-surface-container-low"><span class="material-symbols-outlined">close</span></button>
          </div>
          <div class="flex-1 overflow-y-auto px-3 py-2">${listHtml}</div>
          <div class="px-5 py-3 border-t border-outline-variant/20 flex items-center justify-between">
            <span id="pick-doc-count" class="text-xs text-on-surface-variant">0 seleccionados</span>
            <button id="pick-doc-confirm" class="px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors disabled:opacity-30" disabled>
              Vincular seleccionados
            </button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const updateCount = () => {
        const n = overlay.querySelectorAll('.pick-doc-cb:checked').length;
        overlay.querySelector('#pick-doc-count').textContent = n + ' seleccionados';
        overlay.querySelector('#pick-doc-confirm').disabled = n === 0;
      };
      overlay.querySelectorAll('.pick-doc-cb').forEach(cb => cb.addEventListener('change', updateCount));
      overlay.querySelector('#pick-doc-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelector('#pick-doc-confirm').addEventListener('click', async () => {
        const checked = [...overlay.querySelectorAll('.pick-doc-cb:checked')];
        let linked = 0;
        for (const cb of checked) {
          try {
            await API.post(`/admin/data/programs/${ev.programId}/docs`, {
              document_id: parseInt(cb.dataset.docId),
              doc_type: cb.dataset.docType || 'other',
              label: cb.dataset.label || ''
            });
            linked++;
          } catch (e) { console.warn('Link failed for doc', cb.dataset.docId, e); }
        }
        overlay.remove();
        Toast.show(`${linked} documento(s) vinculados`, 'ok');
        convLoadDocs();
      });
    });
  }

  function pickDocRow(d, TYPE_ICONS) {
    const size = d.file_size_bytes ? `${(d.file_size_bytes / 1024).toFixed(0)} KB` : '';
    const tags = (d.tags || []).map(t =>
      `<span class="px-1.5 py-0.5 rounded-full ${t === 'transversal' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'} text-[9px] font-medium">${esc(t)}</span>`
    ).join(' ');
    return `<label class="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer hover:bg-surface-container-low transition-colors border border-transparent hover:border-outline-variant/20 mb-1">
      <input type="checkbox" class="pick-doc-cb accent-primary rounded" data-doc-id="${d.id}" data-doc-type="${esc(d.doc_type || 'other')}" data-label="${esc(d.label || d.title)}">
      <span class="text-lg">${TYPE_ICONS[d.doc_type] || '\ud83d\udcc1'}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-on-surface truncate">${esc(d.label || d.title)}</p>
        <p class="text-[10px] text-on-surface-variant">${esc(d.doc_type || '')} · ${d.file_type || ''} · ${size} · de: ${esc(d.source_call_name || '?')}</p>
        ${tags ? `<div class="flex gap-1 mt-0.5">${tags}</div>` : ''}
      </div>
    </label>`;
  }

  async function convLoadDocs() {
    const container = document.getElementById('conv-docs-list');
    try {
      const inv = await API.get(`/admin/data/programs/${ev.programId}/cag-inventory`);
      const docs = inv.docs || [];
      if (!docs.length) {
        container.innerHTML = `<div class="text-center py-8 text-on-surface-variant/50">
          <span class="material-symbols-outlined text-4xl opacity-30">folder_off</span>
          <p class="mt-2 text-sm">No hay documentos. Sube la Programme Guide, call document, etc.</p>
        </div>`;
        return;
      }
      const TYPE_ICONS = { programme_guide: '\ud83d\udcd5', call_document: '\ud83d\udcd8', annex: '\ud83d\udcce', template: '\ud83d\udcc4', faq: '\u2753', other: '\ud83d\udcc1' };

      const BUDGET_CHARS  = inv.budget_chars  || 320000;
      const BUDGET_TOKENS = inv.budget_tokens || 80000;
      const RAG_ONLY_SENTINEL = 9999;

      const headerHtml = `
        <div class="mb-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-bold text-on-surface uppercase tracking-wide">Presupuesto CAG (Documento Maestro)</p>
            <p id="cag-budget-readout" class="text-xs font-mono text-on-surface-variant">— / ${BUDGET_TOKENS.toLocaleString('es-ES')} tokens</p>
          </div>
          <div class="w-full h-2 rounded-full bg-outline-variant/20 overflow-hidden">
            <div id="cag-budget-bar" class="h-full bg-primary transition-all" style="width: 0%"></div>
          </div>
          <p class="text-[11px] text-on-surface-variant mt-2">
            <strong>Sólo los docs con prioridad 0 o "Forzar CAG" entran al contexto del LLM</strong> al compilar el Maestro.
            La barra de arriba mide exactamente eso. El resto (prioridad ≥ 1, default) se queda en RAG y no consume budget.
            Cambia un doc de 1 → 0 para meterlo al CAG; márcalo "Solo RAG" si quieres dejarlo fuera explícitamente.
            Los cambios se previsualizan en vivo; pulsa "Guardar prioridades" para persistir.
          </p>
        </div>`;

      const docsHtml = docs.map(d => {
        const size = d.body_text_chars
          ? `${(d.body_text_chars || 0).toLocaleString('es-ES')} chars \u00b7 ${(d.tokens_estimated || 0).toLocaleString('es-ES')} tokens`
          : (d.file_size_bytes ? `${(d.file_size_bytes / 1024).toFixed(0)} KB (sin extraer)` : '');
        const statusIcon = d.doc_status === 'active' ? 'check_circle' : d.doc_status === 'processing' ? 'sync' : 'pending';
        const statusColor = d.doc_status === 'active' ? 'text-green-500' : d.doc_status === 'processing' ? 'text-blue-500' : 'text-gray-400';
        const initialOrder = d.sort_order ?? 0;
        const isRagOnly = initialOrder >= RAG_ONLY_SENTINEL;
        const isForced  = initialOrder < 0;
        const chars = d.body_text_chars || 0;
        const tokens = d.tokens_estimated || 0;
        return `<div class="conv-doc-row flex items-center gap-3 p-3 rounded-xl bg-white border border-outline-variant/20 mb-2 hover:border-primary/30 transition-colors"
                     data-id="${d.id}" data-chars="${chars}" data-tokens="${tokens}">
          <input type="number" min="-1" max="${RAG_ONLY_SENTINEL}" class="conv-doc-order w-14 text-center font-mono text-sm border border-outline-variant/40 rounded-lg py-1.5"
                 value="${initialOrder}" ${(isRagOnly || isForced) ? 'disabled' : ''}
                 title="Prioridad (menor número = más prioritario; ${RAG_ONLY_SENTINEL} = nunca CAG)">
          <span class="text-xl">${TYPE_ICONS[d.doc_type] || '\ud83d\udcc1'}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-on-surface truncate">${esc(d.label || d.doc_title)}</p>
            <p class="text-xs text-on-surface-variant">${d.doc_type} \u00b7 ${d.file_type || ''} \u00b7 ${size}</p>
          </div>
          <label class="conv-doc-force-wrap inline-flex items-center gap-1.5 text-[10px] font-bold whitespace-nowrap cursor-pointer select-none" title="Forzar este doc al top del CAG (entra primero antes que cualquier prioridad numerica)">
            <input type="checkbox" class="conv-doc-force accent-green-600" ${isForced ? 'checked' : ''}>
            <span class="text-green-700">Forzar CAG</span>
          </label>
          <label class="conv-doc-ragonly-wrap inline-flex items-center gap-1.5 text-[10px] font-bold whitespace-nowrap cursor-pointer select-none" title="Forzar a que este doc se quede solo en RAG y nunca entre al CAG">
            <input type="checkbox" class="conv-doc-ragonly accent-amber-500" ${isRagOnly ? 'checked' : ''}>
            <span class="text-amber-700">Solo RAG</span>
          </label>
          <span class="conv-doc-fitbadge px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"></span>
          <span class="material-symbols-outlined ${statusColor} text-base" title="${d.doc_status}">${statusIcon}</span>
          ${d.storage_path
            ? `<a href="${esc(d.storage_path)}" target="_blank" rel="noopener" class="text-on-surface-variant/40 hover:text-primary transition-colors" title="Abrir documento en nueva pestaña">
                 <span class="material-symbols-outlined text-lg">open_in_new</span>
               </a>`
            : ''}
          <button class="conv-doc-del text-on-surface-variant/30 hover:text-error transition-colors" data-id="${d.id}">
            <span class="material-symbols-outlined text-lg">delete</span>
          </button>
        </div>`;
      }).join('');

      container.innerHTML = headerHtml + docsHtml + `
        <div class="flex justify-end items-center gap-3 mt-3">
          <span id="conv-docs-save-status" class="text-xs text-on-surface-variant"></span>
          <button id="conv-docs-save-order" class="text-xs font-semibold text-primary hover:underline">
            Guardar prioridades
          </button>
        </div>`;

      const barEl     = container.querySelector('#cag-budget-bar');
      const readoutEl = container.querySelector('#cag-budget-readout');

      const BADGE_BASE = 'conv-doc-fitbadge px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap';

      function recalcAndRepaint() {
        const rows = Array.from(container.querySelectorAll('.conv-doc-row'));
        rows.sort((a, b) => {
          const av = parseInt(a.querySelector('.conv-doc-order').value, 10);
          const bv = parseInt(b.querySelector('.conv-doc-order').value, 10);
          const aN = Number.isFinite(av) ? av : 1;
          const bN = Number.isFinite(bv) ? bv : 1;
          return aN - bN || a.dataset.id.localeCompare(b.dataset.id);
        });
        let accFit = 0;       // lo que realmente entra al CAG (cabe)
        let accAttempted = 0; // lo que el usuario quiso meter (cabe + no cabe)
        let overflowCount = 0;
        for (const row of rows) {
          const ragOnly = row.querySelector('.conv-doc-ragonly').checked;
          const forced  = row.querySelector('.conv-doc-force').checked;
          const ordVal  = parseInt(row.querySelector('.conv-doc-order').value, 10);
          const ord     = Number.isFinite(ordVal) ? ordVal : 1;
          const chars   = parseInt(row.dataset.chars, 10) || 0;
          const badge   = row.querySelector('.conv-doc-fitbadge');

          if (ragOnly || ord >= 9999) {
            badge.textContent = 'SOLO RAG';
            badge.className = BADGE_BASE + ' bg-amber-100 text-amber-700';
          } else if (chars === 0) {
            badge.textContent = 'SIN TEXTO';
            badge.className = BADGE_BASE + ' bg-gray-100 text-gray-400';
          } else if (forced || ord < 0) {
            accAttempted += chars;
            if ((accFit + chars) <= BUDGET_CHARS) {
              accFit += chars;
              badge.textContent = 'FORZADO';
              badge.className = BADGE_BASE + ' bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300';
            } else {
              overflowCount++;
              badge.textContent = 'NO CABE';
              badge.className = BADGE_BASE + ' bg-red-100 text-red-700';
            }
          } else if (ord === 0) {
            accAttempted += chars;
            if ((accFit + chars) <= BUDGET_CHARS) {
              accFit += chars;
              badge.textContent = 'EN CAG';
              badge.className = BADGE_BASE + ' bg-green-100 text-green-700';
            } else {
              overflowCount++;
              badge.textContent = 'NO CABE';
              badge.className = BADGE_BASE + ' bg-red-100 text-red-700';
            }
          } else {
            badge.textContent = 'RAG';
            badge.className = BADGE_BASE + ' bg-blue-50 text-blue-700';
          }
        }
        const parent = rows[0]?.parentNode;
        if (parent) for (const r of rows) parent.appendChild(r);

        // La barra y el contador muestran lo INTENTADO (lo que pediste meter al CAG).
        // Si pasas del 100%, se pone roja para avisarte de que hay overflow.
        const usedTokens = Math.ceil(accAttempted / 4);
        const usedPctRaw = (accAttempted / BUDGET_CHARS) * 100;
        const usedPct = Math.round(usedPctRaw);
        if (readoutEl) {
          const overflowNote = overflowCount > 0
            ? ` · ${overflowCount} doc(s) no caben`
            : '';
          readoutEl.textContent = `${usedTokens.toLocaleString('es-ES')} / ${BUDGET_TOKENS.toLocaleString('es-ES')} tokens (${usedPct}%${overflowNote})`;
          readoutEl.className = 'text-xs font-mono ' + (usedPctRaw > 100 ? 'text-error font-bold' : 'text-on-surface-variant');
        }
        if (barEl) {
          barEl.style.width = Math.min(100, usedPct) + '%';
          barEl.className = 'h-full transition-all ' + (usedPctRaw > 100 ? 'bg-error' : usedPctRaw > 90 ? 'bg-amber-500' : 'bg-primary');
        }
      }

      // ── Auto-save con debounce ─────────────────────────────────
      const statusEl = container.querySelector('#conv-docs-save-status');
      let saveTimer = null;
      let inFlight = false;
      let queuedAfterFlight = false;

      async function flushSave() {
        if (inFlight) { queuedAfterFlight = true; return; }
        inFlight = true;
        if (statusEl) { statusEl.textContent = 'Guardando…'; statusEl.className = 'text-xs text-on-surface-variant'; }
        const rows = Array.from(container.querySelectorAll('.conv-doc-row'));
        const items = rows.map(r => ({
          id: r.dataset.id,
          sort_order: parseInt(r.querySelector('.conv-doc-order').value, 10) || 0,
        }));
        try {
          await API.post(`/admin/data/programs/${ev.programId}/docs/reorder`, { items });
          if (statusEl) { statusEl.textContent = 'Guardado ✓'; statusEl.className = 'text-xs text-green-600 font-semibold'; }
          setTimeout(() => { if (statusEl && statusEl.textContent === 'Guardado ✓') statusEl.textContent = ''; }, 1500);
        } catch (e) {
          if (statusEl) { statusEl.textContent = 'Error al guardar: ' + e.message; statusEl.className = 'text-xs text-error font-semibold'; }
        } finally {
          inFlight = false;
          if (queuedAfterFlight) { queuedAfterFlight = false; flushSave(); }
        }
      }

      function scheduleSave() {
        if (statusEl) { statusEl.textContent = 'Cambios sin guardar…'; statusEl.className = 'text-xs text-amber-600 font-semibold'; }
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, 600);
      }

      // Bind events: cada cambio → recalc visual + scheduleSave
      container.querySelectorAll('.conv-doc-order').forEach(inp => {
        inp.addEventListener('input', () => { recalcAndRepaint(); scheduleSave(); });
      });
      container.querySelectorAll('.conv-doc-ragonly').forEach(cb => {
        cb.addEventListener('change', () => {
          const row = cb.closest('.conv-doc-row');
          const orderInput = row.querySelector('.conv-doc-order');
          const forceCb = row.querySelector('.conv-doc-force');
          if (cb.checked) {
            if (forceCb && forceCb.checked) forceCb.checked = false;
            orderInput.value = RAG_ONLY_SENTINEL;
            orderInput.disabled = true;
          } else {
            orderInput.disabled = false;
            orderInput.value = 1;
          }
          recalcAndRepaint();
          scheduleSave();
        });
      });

      container.querySelectorAll('.conv-doc-force').forEach(cb => {
        cb.addEventListener('change', () => {
          const row = cb.closest('.conv-doc-row');
          const orderInput = row.querySelector('.conv-doc-order');
          const ragCb = row.querySelector('.conv-doc-ragonly');
          if (cb.checked) {
            if (ragCb && ragCb.checked) ragCb.checked = false;
            orderInput.value = -1;
            orderInput.disabled = true;
          } else {
            orderInput.disabled = false;
            orderInput.value = 1;
          }
          recalcAndRepaint();
          scheduleSave();
        });
      });

      container.querySelectorAll('.conv-doc-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Eliminar este documento de la convocatoria?')) return;
          try {
            await API.del('/admin/data/call-docs/' + btn.dataset.id);
            Toast.show('Documento eliminado', 'ok');
            convLoadDocs();
          } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
        });
      });

      const saveBtn = container.querySelector('#conv-docs-save-order');
      saveBtn?.addEventListener('click', async () => {
        const rows = Array.from(container.querySelectorAll('.conv-doc-row'));
        const items = rows.map(r => ({
          id: r.dataset.id,
          sort_order: parseInt(r.querySelector('.conv-doc-order').value, 10) || 0,
        }));
        try {
          await API.post(`/admin/data/programs/${ev.programId}/docs/reorder`, { items });
          Toast.show('Prioridades guardadas', 'ok');
          convLoadDocs();
        } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
      });

      // Pintar estado inicial
      recalcAndRepaint();
    } catch (e) { container.innerHTML = `<p class="text-sm text-error">${e.message}</p>`; }
  }


  /* OLD CONVOCATORIAS TABLE (kept for backwards compat) ════ */

  async function loadPrograms() {
    setLoading('admin-programs-tbody');
    try {
      const rows = await API.get('/admin/data/programs');
      const tbody = document.getElementById('admin-programs-tbody');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-12 text-center"><span class="material-symbols-outlined text-4xl text-outline-variant block mb-2">event_note</span><p class="text-sm text-on-surface-variant mb-3">No hay convocatorias configuradas</p><button onclick="document.getElementById(&apos;btn-add-program&apos;).click()" class="text-xs font-semibold text-primary hover:underline">+ Añadir convocatoria</button></td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => `
        <tr data-id="${r.id}" class="border-b border-outline-variant/30 hover:bg-surface-container-low/50 transition-colors">
          <td class="px-4 py-3 font-medium">${r.name}</td>
          <td class="px-4 py-3 text-sm text-on-surface-variant">${r.action_type}</td>
          <td class="px-4 py-3 text-sm">${fmtDate(r.deadline)}</td>
          <td class="px-4 py-3 text-sm">${r.eu_grant_max ? '€' + Number(r.eu_grant_max).toLocaleString('es-ES') : '—'}</td>
          <td class="px-4 py-3">${badge(r.active)}</td>
          <td class="px-4 py-3 text-right">${actionBtns(r.id, 'programs')}</td>
        </tr>`).join('');

      // Attach inline edit to each row
      tbody.querySelectorAll('tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        const row = rows.find(r => String(r.id) === id);
        tr.querySelector('[onclick*="openEdit"]')?.addEventListener('click', e => {
          e.preventDefault(); e.stopImmediatePropagation();
          makeRowEditable(tr, [
            { key: 'name',        type: 'text',   tdIndex: 0, value: row.name },
            { key: 'action_type', type: 'text',   tdIndex: 1, value: row.action_type },
            { key: 'deadline',    type: 'date',   tdIndex: 2, value: row.deadline ? row.deadline.slice(0,10) : '' },
            { key: 'eu_grant_max',type: 'number', tdIndex: 3, value: row.eu_grant_max },
            { key: 'active',      type: 'bool',   tdIndex: 4, value: row.active },
          ], `/admin/data/programs/${id}`, loadPrograms);
        }, { once: true });
      });
    } catch (e) { setError('admin-programs-tbody', 'Error al cargar: ' + e.message); }
  }

  /* ══ PAÍSES (con región y tipo de participación) ═════════════ */

  const TYPE_LABELS = {
    eu_member:     'EU Member',
    associated:    'Associated',
    third_partial: 'Third country'
  };
  const TYPE_COLORS = {
    eu_member:     'bg-blue-100 text-blue-800',
    associated:    'bg-blue-50 text-blue-600',
    third_partial: 'bg-gray-100 text-gray-600'
  };

  async function loadCountries() {
    setLoading('admin-countries-tbody');

    // Bind filters once
    ['countries-filter-type','countries-filter-zone'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener('change', loadCountries); }
    });

    // Load region filter once
    const regionSel = document.getElementById('countries-filter-region');
    if (regionSel && regionSel.options.length <= 1) {
      try {
        const regions = await API.get('/admin/data/eligibility/regions');
        regions.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = `R${r.id} — ${r.name_es}`;
          regionSel.appendChild(opt);
        });
      } catch(_){}
      regionSel.addEventListener('change', loadCountries);
    }

    try {
      const type   = document.getElementById('countries-filter-type')?.value   || '';
      const zone   = document.getElementById('countries-filter-zone')?.value   || '';
      const region = regionSel?.value || '';

      const qs = new URLSearchParams();
      if (type)   qs.set('type', type);
      if (region) qs.set('region', region);
      let rows = await API.get('/admin/data/eligibility' + (qs.toString() ? '?' + qs : ''));
      if (zone) rows = rows.filter(r => r.perdiem_zone === zone);

      const tbody = document.getElementById('admin-countries-tbody');
      if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-on-surface-variant text-sm">No results</td></tr>'; return; }
      tbody.innerHTML = rows.map(r => `
        <tr class="border-b border-outline-variant/30 hover:bg-surface-container-low/50 transition-colors">
          <td class="px-4 py-2.5 font-mono text-sm font-bold text-primary">${r.iso2}</td>
          <td class="px-4 py-2.5 font-medium">${r.name_es}</td>
          <td class="px-4 py-2.5">
            <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[r.participation_type] || ''}">
              ${TYPE_LABELS[r.participation_type] || r.participation_type || '—'}
            </span>
          </td>
          <td class="px-4 py-2.5 text-sm text-on-surface-variant">${r.erasmus_region ? 'R' + r.erasmus_region + ' — ' + (r.region_name_es || '') : '—'}</td>
          <td class="px-4 py-2.5 text-center"><span class="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-bold">Zona ${r.perdiem_zone}</span></td>
          <td class="px-4 py-2.5 text-center">${r.erasmus_eligible ? '✅' : '❌'}</td>
        </tr>`).join('');
    } catch (e) { setError('admin-countries-tbody', 'Error: ' + e.message); }
  }

  /* ══ PER DIEM ════════════════════════════════════════════════ */

  const ZONE_STYLES = {
    A: { bg: '#1e3a5f', label: 'Alto coste' },
    B: { bg: '#2563eb', label: 'Medio-alto' },
    C: { bg: '#3b82f6', label: 'Medio' },
    D: { bg: '#60a5fa', label: 'Bajo coste' },
  };

  async function loadPerdiem() {
    const wrap = document.getElementById('admin-perdiem-cards');
    wrap.innerHTML = '<div class="col-span-full text-center py-8 text-on-surface-variant"><span class="spinner"></span></div>';
    try {
      const rows = await API.get('/admin/data/perdiem');
      wrap.innerHTML = rows.map(r => {
        const s = ZONE_STYLES[r.zone] || ZONE_STYLES.A;
        const accom = Number(r.amount_accommodation) || 0;
        const subs  = Number(r.amount_subsistence) || 0;
        const total = Number(r.amount_day) || 0;
        const pctA  = total ? Math.round(accom / total * 100) : 60;
        const pctS  = total ? Math.round(subs / total * 100) : 40;
        return `
        <div class="perdiem-card bg-white rounded-xl border border-outline-variant/30 overflow-hidden" data-id="${r.id}" data-zone="${r.zone}">
          <div class="px-4 py-3 text-white flex items-center justify-between" style="background:${s.bg}">
            <div>
              <span class="text-lg font-bold">Zona ${r.zone}</span>
              <span class="text-xs opacity-80 ml-2">${s.label}</span>
            </div>
            <span class="text-2xl font-black">€${total.toFixed(0)}</span>
          </div>
          <div class="p-4 space-y-3" data-mode="view">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-base" style="color:${s.bg}">hotel</span>
                <span class="text-sm text-on-surface-variant">Alojamiento</span>
              </div>
              <span class="font-bold text-primary">€${accom.toFixed(2)}</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div class="h-full rounded-full" style="width:${pctA}%;background:${s.bg}"></div>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-base" style="color:${s.bg}">restaurant</span>
                <span class="text-sm text-on-surface-variant">Manutención</span>
              </div>
              <span class="font-bold text-primary">€${subs.toFixed(2)}</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div class="h-full rounded-full opacity-60" style="width:${pctS}%;background:${s.bg}"></div>
            </div>
            <div class="pt-2 border-t border-outline-variant/20 flex justify-between items-center">
              <span class="text-xs text-on-surface-variant">${pctA}% / ${pctS}%</span>
              <button class="perdiem-edit-btn text-xs px-3 py-1 rounded-lg border border-primary/20 text-primary hover:bg-primary/5 transition-colors flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">edit</span> Editar
              </button>
            </div>
          </div>
          <div class="p-4 space-y-3 hidden" data-mode="edit">
            <label class="block">
              <span class="text-xs text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-sm">hotel</span>Alojamiento €/día</span>
              <input type="number" step="0.01" name="amount_accommodation" value="${accom.toFixed(2)}"
                class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </label>
            <label class="block">
              <span class="text-xs text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-sm">restaurant</span>Manutención €/día</span>
              <input type="number" step="0.01" name="amount_subsistence" value="${subs.toFixed(2)}"
                class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </label>
            <div class="flex items-center justify-between pt-1">
              <span class="perdiem-edit-total text-sm font-bold text-primary">Total: €${total.toFixed(2)}</span>
              <div class="flex gap-2">
                <button class="perdiem-cancel-btn text-xs px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-gray-50">Cancelar</button>
                <button class="perdiem-save-btn text-xs px-3 py-1.5 rounded-lg bg-[#1b1464] text-[#fbff12] font-semibold hover:bg-[#1b1464]/80">Save</button>
              </div>
            </div>
          </div>
        </div>`;
      }).join('');

      /* bind card events */
      wrap.querySelectorAll('.perdiem-card').forEach(card => {
        const id = card.dataset.id;
        const zone = card.dataset.zone;
        const viewDiv = card.querySelector('[data-mode="view"]');
        const editDiv = card.querySelector('[data-mode="edit"]');
        const inpA = editDiv.querySelector('[name="amount_accommodation"]');
        const inpS = editDiv.querySelector('[name="amount_subsistence"]');
        const totalSpan = editDiv.querySelector('.perdiem-edit-total');

        const updateTotal = () => {
          const t = (parseFloat(inpA.value) || 0) + (parseFloat(inpS.value) || 0);
          totalSpan.textContent = `Total: €${t.toFixed(2)}`;
        };
        inpA.addEventListener('input', updateTotal);
        inpS.addEventListener('input', updateTotal);

        card.querySelector('.perdiem-edit-btn').addEventListener('click', () => {
          viewDiv.classList.add('hidden'); editDiv.classList.remove('hidden');
        });
        card.querySelector('.perdiem-cancel-btn').addEventListener('click', () => {
          editDiv.classList.add('hidden'); viewDiv.classList.remove('hidden');
        });
        card.querySelector('.perdiem-save-btn').addEventListener('click', async () => {
          try {
            await API.patch(`/admin/data/perdiem/${id}`, {
              zone,
              amount_accommodation: inpA.value,
              amount_subsistence: inpS.value,
            });
            Toast.show('Per diem actualizado', 'ok');
            loadPerdiem();
          } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
        });
      });
    } catch (e) { wrap.innerHTML = `<div class="col-span-full text-center py-8 text-red-500">${e.message}</div>`; }
  }

  /* ══ PERSONAL (matriz categoría × zona) ═════════════════════ */

  const INP = 'px-2 py-1 border border-primary/30 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';

  async function loadWorkers() {
    setLoading('admin-workers-tbody');
    try {
      const rows = await API.get('/admin/data/workers/matrix');
      const tbody = document.getElementById('admin-workers-tbody');
      tbody.innerHTML = rows.map(r => `
        <tr data-id="${r.id}" class="border-b border-outline-variant/30 hover:bg-surface-container-low/50 transition-colors worker-row">
          <td class="px-4 py-3 font-mono text-sm font-bold text-primary worker-code">${r.code}</td>
          <td class="px-4 py-3 font-medium worker-name">${r.name_es}</td>
          ${['A','B','C','D'].map(z => {
            const rd = r.zones[z]?.rate_day;
            const pm = rd != null ? (rd * 22).toFixed(0) : null;
            return `<td class="px-4 py-2 text-center worker-zone" data-zone="${z}" data-zone-id="${r.zones[z]?.id || ''}" data-rate="${rd ?? ''}">
              <span class="font-bold text-primary text-sm">\u20AC${rd ?? '\u2014'}</span>
              ${pm != null ? `<br><span class="text-[10px] text-on-surface-variant/60">\u20AC${Number(pm).toLocaleString('en')}</span>` : ''}
            </td>`;
          }).join('')}
          <td class="px-4 py-3">${badge(r.active)}</td>
          <td class="px-4 py-3 text-right worker-actions">
            <button class="worker-edit-btn text-xs px-2 py-1 rounded border border-primary/20 text-primary hover:bg-primary/5 transition-colors" title="Edit">
              <span class="material-symbols-outlined text-sm">edit</span>
            </button>
            <button class="worker-del-btn text-xs px-2 py-1 rounded border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors ml-1" title="Delete">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </td>
        </tr>`).join('');

      tbody.querySelectorAll('.worker-row').forEach(tr => {
        const id = tr.dataset.id;
        const row = rows.find(r => String(r.id) === id);
        tr.querySelector('.worker-edit-btn').addEventListener('click', () => workerMakeEditable(tr, row));
        tr.querySelector('.worker-del-btn').addEventListener('click', async () => {
          if (!confirm('Delete this category and all its zone rates?')) return;
          try { await API.del(`/admin/data/workers/${id}`); Toast.show('Deleted', 'ok'); loadWorkers(); }
          catch(e) { Toast.show('Error: ' + e.message, 'err'); }
        });
      });
    } catch (e) { setError('admin-workers-tbody', 'Error: ' + e.message); }
  }

  function workerMakeEditable(tr, row) {
    const codeTd = tr.querySelector('.worker-code');
    const nameTd = tr.querySelector('.worker-name');
    const actionsTd = tr.querySelector('.worker-actions');

    codeTd.innerHTML = `<input type="text" value="${row.code}" class="w-20 ${INP} font-mono">`;
    nameTd.innerHTML = `<input type="text" value="${row.name_es}" class="w-full ${INP}">`;

    tr.querySelectorAll('.worker-zone').forEach(td => {
      const rate = td.dataset.rate;
      const zone = td.dataset.zone;
      td.innerHTML = `<input type="number" step="0.01" value="${rate}" class="w-20 ${INP} text-center" data-zone="${zone}">`;
    });

    actionsTd.innerHTML = `
      <button class="worker-save-btn text-xs px-3 py-1 rounded bg-[#1b1464] text-[#fbff12] font-semibold hover:bg-[#1b1464]/80">Save</button>
      <button class="worker-cancel-btn text-xs px-3 py-1 rounded border border-outline-variant/30 text-on-surface-variant ml-1">Cancel</button>`;

    actionsTd.querySelector('.worker-cancel-btn').addEventListener('click', () => loadWorkers());
    actionsTd.querySelector('.worker-save-btn').addEventListener('click', async () => {
      const newCode = codeTd.querySelector('input').value.trim();
      const newName = nameTd.querySelector('input').value.trim();
      if (!newCode || !newName) { Toast.show('Code and name required', 'err'); return; }
      try {
        // Save category
        await API.patch(`/admin/data/workers/${row.id}`, { code: newCode, name_es: newName, name_en: row.name_en, rate_day: 0, active: row.active });
        // Save each zone rate
        const zoneInputs = tr.querySelectorAll('.worker-zone input');
        for (const inp of zoneInputs) {
          const zone = inp.dataset.zone;
          const zoneId = tr.querySelector(`.worker-zone[data-zone="${zone}"]`).dataset.zoneId;
          if (zoneId && inp.value) {
            await API.patch(`/admin/data/workers/zone/${zoneId}`, { rate_day: Number(inp.value) });
          }
        }
        Toast.show('Category and rates saved', 'ok');
        loadWorkers();
      } catch(e) { Toast.show('Error: ' + e.message, 'err'); }
    });
  }

  function workerShowAddForm() {
    const tbody = document.getElementById('admin-workers-tbody');
    if (tbody.querySelector('.worker-add-row')) return;
    const tr = document.createElement('tr');
    tr.className = 'worker-add-row border-b border-outline-variant/30 bg-primary/5';
    tr.innerHTML = `
      <td class="px-4 py-2"><input type="text" placeholder="CODE" class="w-20 ${INP} font-mono" id="new-worker-code"></td>
      <td class="px-4 py-2"><input type="text" placeholder="Category name" class="w-full ${INP}" id="new-worker-name"></td>
      ${['A','B','C','D'].map(z => `
        <td class="px-4 py-2 text-center"><input type="number" step="0.01" placeholder="Zone ${z}" class="w-20 ${INP} text-center" id="new-worker-zone-${z}"></td>`).join('')}
      <td class="px-4 py-2">&nbsp;</td>
      <td class="px-4 py-2 text-right">
        <button id="new-worker-save" class="text-xs px-3 py-1 rounded bg-[#1b1464] text-[#fbff12] font-semibold hover:bg-[#1b1464]/80">Add</button>
        <button id="new-worker-cancel" class="text-xs px-3 py-1 rounded border border-outline-variant/30 text-on-surface-variant ml-1">Cancel</button>
      </td>`;
    tbody.prepend(tr);
    tr.querySelector('#new-worker-code').focus();

    tr.querySelector('#new-worker-cancel').addEventListener('click', () => tr.remove());
    tr.querySelector('#new-worker-save').addEventListener('click', async () => {
      const code = tr.querySelector('#new-worker-code').value.trim();
      const name = tr.querySelector('#new-worker-name').value.trim();
      const rateA = tr.querySelector('#new-worker-zone-A').value;
      if (!code || !name || !rateA) { Toast.show('Code, name and at least Zone A rate required', 'err'); return; }
      try {
        await API.post('/admin/data/workers', { code, name_es: name, name_en: name, rate_day: Number(rateA), active: 1 });
        Toast.show('Category created with zone rates', 'ok');
        loadWorkers();
      } catch(e) { Toast.show('Error: ' + e.message, 'err'); }
    });
  }

  function bindWorkerAdd() {
    const btn = document.getElementById('worker-add-btn');
    if (btn && !btn.dataset.bound) { btn.dataset.bound = '1'; btn.addEventListener('click', workerShowAddForm); }
  }

  /* ══ ENTIDADES ═══════════════════════════════════════════════ */

  async function loadEntities() {
    setLoading('admin-entities-tbody');
    try {
      const rows = await API.get('/admin/data/entities');
      const tbody = document.getElementById('admin-entities-tbody');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-on-surface-variant text-sm">Sin entidades</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => `
        <tr data-id="${r.id}" class="border-b border-outline-variant/30 hover:bg-surface-container-low/50 transition-colors">
          <td class="px-4 py-3 font-medium">${r.name}</td>
          <td class="px-4 py-3 text-sm text-on-surface-variant">${r.city || '—'}</td>
          <td class="px-4 py-3 font-mono text-sm font-bold text-primary">${r.country_iso2}</td>
          <td class="px-4 py-3 text-sm"><span class="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-bold">${r.type}</span></td>
          <td class="px-4 py-3 text-xs font-mono text-on-surface-variant">${r.pic_number || '—'}</td>
          <td class="px-4 py-3">${badge(r.active)}</td>
          <td class="px-4 py-3 text-right">${actionBtns(r.id, 'entities')}</td>
        </tr>`).join('');

      tbody.querySelectorAll('tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        const row = rows.find(r => String(r.id) === id);
        tr.querySelector('[onclick*="openEdit"]')?.addEventListener('click', e => {
          e.preventDefault(); e.stopImmediatePropagation();
          makeRowEditable(tr, [
            { key: 'name',         type: 'text', tdIndex: 0, value: row.name },
            { key: 'city',         type: 'text', tdIndex: 1, value: row.city },
            { key: 'country_iso2', type: 'text', tdIndex: 2, value: row.country_iso2 },
            { key: 'type',         type: 'text', tdIndex: 3, value: row.type },
            { key: 'pic_number',   type: 'text', tdIndex: 4, value: row.pic_number },
            { key: 'active',       type: 'bool', tdIndex: 5, value: row.active },
          ], `/admin/data/entities/${id}`, loadEntities);
        }, { once: true });
      });
    } catch (e) { setError('admin-entities-tbody', 'Error: ' + e.message); }
  }

  /* ══ DELETE ══════════════════════════════════════════════════ */

  async function confirmDelete(section, id) {
    const ok = await Modal.show('¿Eliminar este registro? Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      const endpoints = { programs: 'programs', countries: 'countries', perdiem: 'perdiem', workers: 'workers', entities: 'entities' };
      await API.del(`/admin/data/${endpoints[section]}/${id}`);
      Toast.show('Eliminado correctamente', 'ok');
      loadSection(section);
    } catch (e) {
      Toast.show('Error al eliminar: ' + e.message, 'error');
    }
  }

  /* ══ ELEGIBILIDAD POR CONVOCATORIA ══════════════════════════════ */

  const COUNTRY_TYPE_OPTIONS = [
    { value: 'eu_member',     label: 'EU Member States' },
    { value: 'associated',    label: 'Associated countries' },
    { value: 'third_partial', label: 'Third countries (partner)' },
  ];
  const ENTITY_TYPE_OPTIONS = [
    { value: 'ngo',         label: 'NGO / Youth NGO' },
    { value: 'public_body', label: 'Public body (local/regional/national)' },
    { value: 'university',  label: 'Education or research institution' },
    { value: 'foundation',  label: 'Foundation' },
    { value: 'for_profit',  label: 'For-profit organisation' },
    { value: 'social_enterprise', label: 'Social enterprise' },
    { value: 'dmo',         label: 'DMO (Destination Management Organisation — turismo)' },
    { value: 'bso',         label: 'BSO (Business Support Organisation — apoyo a empresas)' },
  ];

  function eligShowView(v) {
    document.querySelectorAll('#admin-sec-eligibility .elig-view').forEach(el => el.classList.add('hidden'));
    document.getElementById(`elig-view-${v}`)?.classList.remove('hidden');
  }

  async function loadEligibility() {
    eligShowView('programs');
    const list = document.getElementById('elig-program-list');
    list.innerHTML = '<p class="text-sm text-on-surface-variant py-4">Loading...</p>';
    try {
      const programs = await API.get('/admin/data/programs');
      if (!programs.length) { list.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">No programmes found.</p>'; return; }
      list.innerHTML = programs.map(p => `
        <div class="elig-prog-card group flex items-center gap-4 p-5 bg-white rounded-2xl border border-outline-variant/30 hover:border-primary hover:shadow-lg cursor-pointer transition-all" data-id="${p.id}">
          <div class="w-12 h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 group-hover:bg-secondary-fixed transition-colors">
            <span class="material-symbols-outlined text-white text-xl">verified</span>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-primary truncate">${p.name}</h3>
            <p class="text-xs text-on-surface-variant">${p.action_type || '—'}</p>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">chevron_right</span>
        </div>`).join('');

      list.querySelectorAll('.elig-prog-card').forEach(card => {
        card.addEventListener('click', () => eligOpenProgram(card.dataset.id, programs.find(p => String(p.id) === card.dataset.id)?.name || ''));
      });
    } catch (e) { list.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`; }
  }

  async function eligOpenProgram(programId, programName) {
    eligShowView('editor');
    document.getElementById('elig-program-title').textContent = programName + ' — Eligibility';
    document.getElementById('elig-back-btn').onclick = () => loadEligibility();

    const wrap = document.getElementById('elig-form-wrap');
    wrap.innerHTML = '<p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Loading...</p>';

    try {
      const data = await API.get(`/admin/data/eligibility/call/${programId}`) || {};
      const countryTypes  = safeJSON(data.eligible_country_types, []);
      const entityTypes   = safeJSON(data.eligible_entity_types, []);
      const activityTypes = safeJSON(data.activity_location_types, []);

      wrap.innerHTML = `
      <!-- Country eligibility -->
      <div class="bg-white rounded-xl border border-outline-variant/30 p-5">
        <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-base">public</span> Eligible countries
        </h3>
        <p class="text-xs text-on-surface-variant mb-3">Which country types can submit applications?</p>
        <div class="space-y-2" id="elig-country-types">
          ${COUNTRY_TYPE_OPTIONS.map(o => `
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" value="${o.value}" class="accent-primary" ${countryTypes.includes(o.value) ? 'checked' : ''}>
              <span class="text-sm">${o.label}</span>
            </label>`).join('')}
        </div>
      </div>

      <!-- Entity types -->
      <div class="bg-white rounded-xl border border-outline-variant/30 p-5">
        <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-base">business</span> Eligible entity types
        </h3>
        <p class="text-xs text-on-surface-variant mb-3">Which organisations can participate, and can they coordinate?</p>
        <div class="space-y-2" id="elig-entity-types">
          ${ENTITY_TYPE_OPTIONS.map(o => {
            const match = entityTypes.find(e => e.type === o.value);
            const checked = !!match;
            const canCoord = match ? match.can_coordinate : true;
            return `
            <div class="flex items-center gap-3 py-1">
              <input type="checkbox" value="${o.value}" class="elig-ent-check accent-primary" ${checked ? 'checked' : ''}>
              <span class="text-sm flex-1">${o.label}</span>
              <label class="flex items-center gap-1 text-xs text-on-surface-variant">
                <input type="checkbox" class="elig-ent-coord accent-primary" data-type="${o.value}" ${canCoord ? 'checked' : ''}>
                Can coordinate
              </label>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Consortium composition -->
      <div class="bg-white rounded-xl border border-outline-variant/30 p-5">
        <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-base">groups</span> Consortium composition
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label class="block">
            <span class="text-xs text-on-surface-variant">Min. partners (beneficiaries)</span>
            <input type="number" id="elig-min-partners" min="1" value="${data.min_partners || 1}"
              class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          </label>
          <label class="block">
            <span class="text-xs text-on-surface-variant">Min. countries</span>
            <input type="number" id="elig-min-countries" min="1" value="${data.min_countries || 1}"
              class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          </label>
          <label class="block">
            <span class="text-xs text-on-surface-variant">Max applications as coordinator</span>
            <input type="number" id="elig-max-coord" min="1" value="${data.max_coord_applications || ''}" placeholder="No limit"
              class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          </label>
          <label class="block">
            <span class="text-xs text-on-surface-variant">Max applications as partner</span>
            <input type="number" id="elig-max-partner" min="1" value="${data.max_partner_applications || ''}" placeholder="No limit"
              class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          </label>
          <label class="block">
            <span class="text-xs text-on-surface-variant">Max applications as applicant</span>
            <input type="number" id="elig-max-applicant" min="1" value="${data.max_applicant_applications || ''}" placeholder="No limit"
              class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
          </label>
        </div>
      </div>

      <!-- Activity location -->
      <div class="bg-white rounded-xl border border-outline-variant/30 p-5">
        <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-base">location_on</span> Activity location
        </h3>
        <p class="text-xs text-on-surface-variant mb-3">Where must activities take place?</p>
        <div class="space-y-2" id="elig-activity-types">
          ${COUNTRY_TYPE_OPTIONS.map(o => `
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" value="${o.value}" class="accent-primary" ${activityTypes.includes(o.value) ? 'checked' : ''}>
              <span class="text-sm">${o.label}</span>
            </label>`).join('')}
        </div>
      </div>

      <!-- Additional rules -->
      <div class="bg-white rounded-xl border border-outline-variant/30 p-5">
        <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-base">description</span> Additional rules
        </h3>
        <textarea id="elig-additional-rules" rows="3" placeholder="Free text for additional eligibility notes..."
          class="w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">${data.additional_rules || ''}</textarea>
      </div>

      <!-- Save -->
      <div class="flex justify-end">
        <button id="elig-save-btn" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors">
          <span class="material-symbols-outlined text-sm">save</span> Save eligibility
        </button>
      </div>`;

      // Save handler
      document.getElementById('elig-save-btn').addEventListener('click', async () => {
        const selCountry = [...document.querySelectorAll('#elig-country-types input:checked')].map(i => i.value);
        const selEntity  = [...document.querySelectorAll('#elig-entity-types .elig-ent-check:checked')].map(i => {
          const coordCb = document.querySelector(`.elig-ent-coord[data-type="${i.value}"]`);
          return { type: i.value, can_coordinate: coordCb?.checked ?? true, label: ENTITY_TYPE_OPTIONS.find(o => o.value === i.value)?.label || i.value };
        });
        const selActivity = [...document.querySelectorAll('#elig-activity-types input:checked')].map(i => i.value);

        try {
          await API.put(`/admin/data/eligibility/call/${programId}`, {
            eligible_country_types: selCountry,
            eligible_entity_types: selEntity,
            min_partners: document.getElementById('elig-min-partners').value,
            min_countries: document.getElementById('elig-min-countries').value,
            max_coord_applications: document.getElementById('elig-max-coord').value || null,
            max_partner_applications: document.getElementById('elig-max-partner').value || null,
            max_applicant_applications: document.getElementById('elig-max-applicant').value || null,
            activity_location_types: selActivity,
            additional_rules: document.getElementById('elig-additional-rules').value,
          });
          Toast.show('Eligibility saved', 'ok');
        } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
      });
    } catch (e) { wrap.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`; }
  }

  function safeJSON(val, fallback) {
    if (!val) return fallback;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') try { return JSON.parse(val); } catch(_) { return fallback; }
    return fallback;
  }

  // kept for compatibility — now handled by inline listener
  function openEdit() {}

  /* ══ EVALUADOR (EACEA-style per program) ═════════════════════ */

  const EVAL_COLORS = ['#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1e40af', '#1d4ed8', '#0369a1'];
  let ev = { programId: null, programName: '', sections: [], activeSectionIdx: 0, activeQuestionIdx: 0 };

  /* ── Field info tooltip system ─────────────────────────────── */
  const FIELD_HELP = {
    // ── Question fields ──────────────────────────────────────
    q_code: { title: 'Code (Question identifier)',
      text: `<p>The unique identifier for this question within the evaluation form. Must match exactly what appears in the official call document or programme guide.</p>
      <p>It helps evaluators, writers, and the system locate the exact section being evaluated. The code also appears in the sidebar navigation and in all reports.</p>
      <div class="tip-example">Examples: "1.1", "2.3", "4.2"</div>
      <p><strong>Important:</strong> Do not invent codes. Copy them from the official evaluation grid of the call.</p>` },

    q_title: { title: 'Title (Question name)',
      text: `<p>The official name of this evaluation question, exactly as it appears in the programme guide or call document.</p>
      <p>Do not modify, paraphrase, or translate it. The AI writer and evaluator use this title to understand the scope of the answer.</p>
      <div class="tip-example">Example: "Background, context and rationale" (not "Explain the context" or "Why is this project needed")</div>
      <p><strong>Where to find it:</strong> In the Programme Guide, under the section "Award criteria" or "Evaluation grid" for your specific action type.</p>` },

    q_description: { title: 'Description (What the question asks)',
      text: `<p>A brief explanation of what this question is really asking for, based on the call guidelines. This is the context that the AI writer will use to understand what evaluators expect to read.</p>
      <p>It should answer: <strong>What should the applicant demonstrate in this section?</strong></p>
      <div class="tip-example">Example for 1.1: "To what extent is the proposal based on a sound and well-documented needs analysis? How clearly does it identify the problems and challenges to be addressed, considering the specific context of each partner country?"</div>
      <p><strong>Tip:</strong> You can copy the guiding questions from the Programme Guide or the application form instructions. Keep it faithful to the original wording.</p>` },

    q_word_limit: { title: 'Word limit',
      text: `<p>Maximum number of words allowed for the answer to this question, as specified in the application form (usually in the eForm).</p>
      <p>The AI writer will respect this limit when generating text, ensuring the output fits within the allowed space.</p>
      <div class="tip-example">Common values: 3000 words, 5000 words, 10000 characters</div>
      <p><strong>Leave empty</strong> if the call doesn't specify a word limit for this particular question. Some calls use page limits instead.</p>
      <p><strong>Where to find it:</strong> In the application form (eForm) itself, each text field usually shows a character or word counter.</p>` },

    q_page_limit: { title: 'Page limit',
      text: `<p>Maximum number of pages allowed for this answer. Some calls (especially older formats or annexes) use pages instead of words.</p>
      <p>Use decimals for half pages (e.g., 1.5). Leave empty if the call uses word limits instead.</p>
      <div class="tip-example">Common values: 2 pages, 3 pages, 1.5 pages</div>
      <p><strong>Note:</strong> When both word limit and page limit apply, fill in both. The AI writer will use whichever is more restrictive.</p>` },

    q_writing_guidance: { title: 'Writing guidance (specific to this question)',
      text: `<p>Specific writing instructions that apply ONLY to this question. Use this to adjust the tone, style, or approach for this particular answer.</p>
      <p>This complements (or overrides) the global Writing Style defined in Call Data. Leave empty if the global rules are sufficient.</p>
      <div class="tip-example">Examples:<br>
      &bull; "Use a more narrative, storytelling tone here. Include real experiences from partner organizations."<br>
      &bull; "Be very technical and data-driven. Include tables and statistics."<br>
      &bull; "This section should read like a project management plan. Use bullet points, timelines, and deliverable lists."<br>
      &bull; "Write from the consortium's perspective using 'we'. Mention each partner by name at least once."</div>
      <p><strong>When to use it:</strong> When a question requires a different writing approach than the rest of the proposal. For example, the "Background" section needs narrative + data, while "Work plan" needs structured lists.</p>` },

    q_scoring_logic: { title: 'Scoring logic',
      text: `<p>Determines how the individual criteria scores are combined to calculate the final score for this question.</p>
      <p><strong>Sum</strong> (most common): All criteria points are added together. If criteria are worth 2+2+3+3 = 10 pts total.<br>
      <strong>Average</strong>: The mean of all criteria scores is used.<br>
      <strong>Min</strong>: The lowest criterion score becomes the question score (strictest mode).</p>
      <div class="tip-example">In 95% of cases, use "Sum". The EU evaluation grid works by adding up sub-scores.</div>
      <p><strong>When in doubt:</strong> Use "Sum". Only use "Average" or "Min" if you have a specific reason to do so.</p>` },

    q_max_score: { title: 'Max score (question points)',
      text: `<p>Maximum points that can be awarded for this question. The sum of all question max scores within a section must equal the section's total (e.g., 30 pts for Relevance).</p>
      <p>Also, the sum of all criteria max scores within this question should equal this number.</p>
      <div class="tip-example">Example: Section "Relevance" = 30 pts, with 3 questions:<br>
      &bull; 1.1 Background = 15 pts (50%)<br>
      &bull; 1.2 Objectives = 8 pts (27%)<br>
      &bull; 1.3 Target groups = 7 pts (23%)<br>
      Total = 30 pts &#10004;</div>
      <p><strong>How to decide:</strong> The EU doesn't always specify per-question scores — only per-section. Use your experience and knowledge of what evaluators prioritize to distribute the section score across questions.</p>` },

    // ── Criterion fields ──────────────────────────────────────
    c_title: { title: 'Criterion title',
      text: `<p>Short, descriptive name that clearly identifies what specific aspect of the answer is being evaluated by this criterion.</p>
      <p>It should be self-explanatory — someone reading just the title should understand what this criterion checks.</p>
      <div class="tip-example">Good examples:<br>
      &bull; "Evidence-based problem statement"<br>
      &bull; "SMART general objectives"<br>
      &bull; "Geographical balance of the consortium"<br>
      &bull; "Risk management plan"<br><br>
      Bad examples (too vague):<br>
      &bull; "Quality" — quality of what?<br>
      &bull; "Good description" — what makes it good?<br>
      &bull; "Relevant" — relevant to what?</div>` },

    // ── Part A question-level fields (narrative brief format) ────
    q_general_context: { title: 'Context of the question',
      text: `<p>One paragraph (4-6 sentences) framing what this question is really about and what the evaluator looks for. It's the mental frame before reading the criteria.</p>
      <div class="tip-example">Example for 1.1: "This question asks two things at once: explain the problem the project addresses and demonstrate it fits the call's purpose. Even a good idea scores low if relevance to the call is unclear. The evaluator checks: is it a real problem? who is affected? why does it matter? what change will the project create? does it fit this specific call?"</div>` },

    q_connects_from: { title: 'Connects from (APOYA EN)',
      text: `<p>Which earlier questions does this one rest on? Write narratively, not as bare bullets. If this is the first question, say "Is the opening question — no prior sections".</p>
      <div class="tip-example">"Builds on 1.1 (needs) which provides the problem framing; the data described there must be consistent with the quantitative evidence in this answer."</div>` },

    q_connects_to: { title: 'Connects to (ALIMENTA A)',
      text: `<p>Which later questions build on this one? This helps the Writer keep cross-references consistent.</p>
      <div class="tip-example">"Feeds 2.1.1 (methodology) — the objectives defined here must be directly answered by the methodology. Also feeds 3.1 (impact) which must measure change against these objectives."</div>` },

    q_global_rule: { title: 'Global rule (optional)',
      text: `<p>A transversal principle that applies to ALL criteria of this question. Only for special cases like Small-scale logic. Leave empty if no such rule exists.</p>
      <div class="tip-example">"Small-scale logic: focused scope, limited objectives, ambition proportional to budget and duration."</div>
      <p><strong>Rule of thumb:</strong> if it only applies to 1-2 criteria, write it in EVITAR of those criteria instead.</p>` },

    // ── Criterion fields (narrative brief format) ─────────────────
    c_priority: { title: 'Priority',
      text: `<p>How critical this criterion is to the final score. Helps the Writer allocate attention across multiple criteria.</p>
      <p><strong>Alta:</strong> core criterion; weak performance here tanks the question score.<br>
      <strong>Media:</strong> important but compensable.<br>
      <strong>Baja:</strong> nice-to-have, secondary.</p>
      <p>Not all criteria should be "alta" — that defeats the purpose.</p>` },

    c_intent: { title: 'INTENCIÓN (what this paragraph must demonstrate)',
      text: `<p>2-3 sentences that explain what this paragraph must achieve. It's the "purpose" of the criterion — the job it does in the evaluator's mind.</p>
      <div class="tip-example">"The paragraph must open by describing the situation that led to the project idea. Focus is on the PROBLEM, not on what you will do. The evaluator must understand in 30 seconds what the problem is and why it deserves attention."</div>` },

    c_elements: { title: 'ELEMENTOS (concrete content required)',
      text: `<p>What must appear concretely in the text. Can be prose or a short list.</p>
      <div class="tip-example">"Sector and geographic context. One clearly formulated main problem (not mixed). Who is directly affected (specific target groups, not 'society'). Why it matters: consequences of inaction."</div>` },

    c_example_weak: { title: 'EJEMPLO DÉBIL (what a bad writer would put)',
      text: `<p>1-2 real sentences that a weak writer would use. Contrast to the strong example is the gold of the brief — the AI learns far better from concrete contrast than abstract description.</p>
      <div class="tip-example">"Sport plays a fundamental role in European society, and there is a need to strengthen its impact on young people."</div>
      <p><strong>Obligatorio.</strong> Without weak+strong examples, the brief loses 80% of its value.</p>` },

    c_example_strong: { title: 'EJEMPLO FUERTE (what a good writer would put)',
      text: `<p>1-2 real sentences that a strong writer would use — concrete, evidenced, specific.</p>
      <div class="tip-example">"In small grassroots sport clubs across northern Spain, over 70% of coaches are volunteers without formal pedagogical training. This contributes to early dropout among adolescents aged 12-16, particularly girls, who leave competitive sport after negative experiences in their first years."</div>
      <p><strong>Obligatorio.</strong> Should be in the same language as the final proposal.</p>` },

    c_avoid: { title: 'EVITAR (red flags specific to this criterion)',
      text: `<p>3-4 specific errors that penalize this criterion. Specific, not generic — "avoid generic phrases about sport" is better than "be specific".</p>
      <div class="tip-example">"Starting with 'This project aims to...'<br>
      Generic phrases about the importance of sport.<br>
      Long explanations about Erasmus+ or the call.<br>
      Mixing several unrelated problems."</div>` },

    c_max_score: { title: 'Max score (criterion points)',
      text: `<p>Maximum points that can be awarded for this specific criterion. The sum of all criteria max scores within a question must equal that question's max score.</p>
      <div class="tip-example">Common values and when to use them:<br>
      &bull; <strong>1 point</strong> (pass/fail): For simple, binary criteria. Either it's there or it's not.<br>
      &bull; <strong>2 points</strong> (3 levels): For criteria with nuance — absent/partial/complete.<br>
      &bull; <strong>3 points</strong> (4 levels): For complex criteria that need finer granularity.<br>
      &bull; <strong>4-5 points</strong>: Rarely used, only for very critical criteria that deserve extra weight.</div>
      <p><strong>Tip:</strong> More important criteria should have higher max scores. For example, "Evidence-based problem statement" (core of the proposal) might be worth 3 pts, while "Timeliness" (nice to have) might be worth 1 pt.</p>
      <p><strong>Verification:</strong> The Score Distribution bar above shows whether your criteria scores add up correctly to the question's max score.</p>` },

    c_mandatory: { title: 'Mandatory criterion',
      text: `<p>Determines whether this criterion is a <strong>must-have</strong> or a <strong>nice-to-have</strong>.</p>
      <p><strong>Yes (mandatory):</strong> If this criterion scores 0, the entire question may be flagged as weak regardless of how well other criteria scored. Use this for requirements that are essential for the proposal to be considered valid.</p>
      <p><strong>No (optional):</strong> A low score here can be compensated by high scores on other criteria. Use this for criteria that add quality but aren't strictly required.</p>
      <div class="tip-example">Typically mandatory:<br>
      &bull; Evidence-based problem statement<br>
      &bull; Clear objectives<br>
      &bull; Budget-activity coherence<br>
      &bull; Partner roles and responsibilities<br><br>
      Typically optional:<br>
      &bull; Innovation dimension<br>
      &bull; Previous cooperation experience<br>
      &bull; Digital dissemination plan</div>
      <p><strong>Rule of thumb:</strong> If the Programme Guide says "the proposal MUST..." or "applicants SHALL...", make it mandatory. If it says "where applicable" or "if relevant", make it optional.</p>` },

    // ── Call Data fields ──────────────────────────────────────
    cd_writing_style: { title: 'Writing style (global rules)',
      text: `<p>Global writing rules that apply to <strong>ALL answers</strong> in this programme. These define the overall tone, voice, and style of the entire proposal.</p>
      <p>The AI writer will follow these rules across every question. Individual questions can have additional guidance in their own "Writing guidance" field.</p>
      <div class="tip-example">Example:<br><br>
      "Write in formal but accessible academic English. Use third person ('the consortium will...') for general statements and first person plural ('we have identified...') for consortium-specific experiences. Vary sentence length between 10 and 30 words. Use active voice predominantly. Reference partner organizations by their full name the first time, then by acronym. Include specific numbers and dates rather than vague references. Avoid superlatives ('the best', 'the most innovative') — let the evidence speak for itself."</div>
      <p><strong>Why it matters:</strong> A consistent writing style makes the proposal feel like one coherent document rather than sections written by different people (or by AI).</p>` },

    cd_ai_rules: { title: 'AI detection rules',
      text: `<p>Specific instructions to make the text sound authentically human and <strong>avoid AI detection</strong>. This is critical because EU evaluators actively reject proposals that appear AI-generated.</p>
      <p>The European Commission has issued warnings about AI-generated applications, and some national agencies have started using detection tools.</p>
      <div class="tip-example">Example:<br><br>
      "FORBIDDEN PATTERNS (never use these):<br>
      &bull; 'Furthermore', 'Moreover', 'Additionally' at the start of sentences<br>
      &bull; 'It is worth noting that...', 'It should be noted that...'<br>
      &bull; 'In conclusion', 'To summarize', 'In summary'<br>
      &bull; 'In today's rapidly changing world/landscape'<br>
      &bull; 'This is crucial/vital/essential for...'<br>
      &bull; 'Leveraging', 'synergies', 'holistic approach'<br>
      &bull; Lists where every item starts with the same grammatical structure<br><br>
      REQUIRED PATTERNS (always include):<br>
      &bull; Occasional short sentences (5-8 words) between longer ones<br>
      &bull; Specific anecdotes or experiences from named partner staff<br>
      &bull; Slightly imperfect transitions between paragraphs<br>
      &bull; Vary paragraph length: some 2 sentences, some 5-6<br>
      &bull; Use field-specific jargon that a real practitioner would use<br>
      &bull; Reference specific local contexts, street names, institutions by name<br>
      &bull; Include self-criticism: 'while our experience in X is limited, we compensate through...'"</div>
      <p><strong>Impact:</strong> A proposal flagged as AI-generated can be rejected outright, regardless of quality. This field is as important as the content itself.</p>` },

    // ── Section score ──────────────────────────────────────
    sec_max_score: { title: 'Section max score (EU fixed)',
      text: `<p>The total points allocated by the EU evaluation grid for this entire section/block. This value is <strong>fixed by the call</strong> and comes from the official Programme Guide.</p>
      <div class="tip-example">Typical distribution for KA3 Youth Together:<br>
      &bull; 1. Relevance = 30 pts<br>
      &bull; 2. Quality of design = 30 pts<br>
      &bull; 3. Partnership = 20 pts<br>
      &bull; 4. Impact = 20 pts<br>
      &bull; Total = 100 pts</div>
      <p>The sum of all question scores within this section must equal this number. Use the Score Distribution bar to verify.</p>` },
  };

  function fieldInfo(key) {
    return `<span class="field-info" data-help="${key}"><span class="material-symbols-outlined">info</span></span>`;
  }

  // Global click handler for field-info buttons
  function closeFieldInfo() {
    document.querySelectorAll('.field-info-popup, .field-info-overlay').forEach(p => p.remove());
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.field-info');
    closeFieldInfo();
    if (!btn) return;
    e.stopPropagation();
    const help = FIELD_HELP[btn.dataset.help];
    if (!help) return;
    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'field-info-overlay';
    overlay.addEventListener('click', closeFieldInfo);
    document.body.appendChild(overlay);
    // Popup
    const popup = document.createElement('div');
    popup.className = 'field-info-popup';
    popup.innerHTML = `<button class="tip-close">&times;</button><h4>${help.title}</h4>${help.text}`;
    document.body.appendChild(popup);
    popup.querySelector('.tip-close').addEventListener('click', closeFieldInfo);
  });

  function evalShowView(view) {
    document.querySelectorAll('#admin-sec-evaluator .eval-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`eval-view-${view}`)?.classList.remove('hidden');
  }

  async function loadEvaluator() {
    ev = { programId: null, programName: '', sections: [], activeSectionIdx: 0, activeQuestionIdx: 0 };
    evalShowView('programs');
    const list = document.getElementById('eval-program-list');
    list.innerHTML = '<p class="text-sm text-on-surface-variant">Loading programmes...</p>';
    try {
      const programs = await API.get('/admin/data/programs');
      if (!programs.length) { list.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">No programmes found. Create one in the Convocatorias tab first.</p>'; return; }
      // Sort by deadline (closest first, null at end)
      programs.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
      });

      const fmtDeadline = d => {
        if (!d) return null;
        const dt = new Date(d);
        const diff = Math.ceil((dt - new Date()) / 86400000);
        const str = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        return { str, diff, urgent: diff >= 0 && diff <= 30, past: diff < 0 };
      };
      const fmtGrant = v => v ? '\u20AC ' + Number(v).toLocaleString('en') : null;

      list.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <button id="eval-new-program" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors">
            <span class="material-symbols-outlined text-sm">add</span> New call
          </button>
          <span class="text-xs text-on-surface-variant">${programs.length} call${programs.length !== 1 ? 's' : ''} · sorted by deadline</span>
        </div>
        <div class="grid grid-cols-1 gap-2">
        ${programs.map(p => {
          const dl = fmtDeadline(p.deadline);
          const grant = fmtGrant(p.eu_grant_max);
          const dlBadge = dl
            ? `<span class="px-2 py-1 rounded-lg text-[10px] font-bold ${dl.past ? 'bg-gray-100 text-gray-400' : dl.urgent ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}">${dl.str}${dl.diff >= 0 ? ' (' + dl.diff + 'd)' : ''}</span>`
            : '<span class="px-2 py-1 rounded-lg bg-gray-50 text-gray-400 text-[10px]">No deadline</span>';
          return `
          <div class="eval-prog-card group flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-outline-variant/20 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer" data-id="${p.id}">
            <div class="w-8 h-8 rounded-lg ${p.active ? 'bg-[#1b1464]' : 'bg-gray-300'} flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-white text-base">description</span>
            </div>
            <div class="flex-1 min-w-0 eval-prog-open">
              <div class="text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate">${p.name}</div>
              <div class="text-[10px] text-on-surface-variant mt-0.5">${p.action_type || ''}</div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              ${grant ? `<span class="px-2 py-1 rounded-lg bg-green-50 text-green-700 text-[10px] font-bold">${grant}</span>` : ''}
              ${dlBadge}
              <button class="eval-prog-del text-on-surface-variant/30 hover:text-error transition-colors" data-id="${p.id}" data-name="${p.name.replace(/"/g, '&quot;')}">
                <span class="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          </div>`;
        }).join('')}
        </div>`;
      document.getElementById('eval-new-program')?.addEventListener('click', () => evalNewProgram());
      list.querySelectorAll('.eval-prog-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.eval-prog-del')) return;
          const prog = programs.find(p => p.id === card.dataset.id);
          evalOpenProgram(prog.id, prog.name);
        });
        card.querySelector('.eval-prog-del')?.addEventListener('click', e => {
          e.stopPropagation();
          evalDeleteProgram(e.currentTarget.dataset.id, e.currentTarget.dataset.name);
        });
      });
    } catch (e) { list.innerHTML = `<p class="text-sm text-error">${e.message}</p>`; }
  }

  /* ── Delete programme with confirmation ─────────────────────── */
  function evalDeleteProgram(id, name) {
    // Create confirmation overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" style="animation:critIn .2s ease">
        <div class="bg-red-50 px-6 py-4 flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <span class="material-symbols-outlined text-red-500 text-xl">warning</span>
          </div>
          <div>
            <h3 class="font-bold text-red-700 text-sm">Delete programme</h3>
            <p class="text-xs text-red-500">This action cannot be undone</p>
          </div>
        </div>
        <div class="px-6 py-4 space-y-3">
          <p class="text-sm text-on-surface-variant">This will permanently delete <strong class="text-primary">${name}</strong> and all its evaluation sections, questions and criteria.</p>
          <label class="block">
            <span class="text-xs text-on-surface-variant">Type <strong>DELETE</strong> to confirm:</span>
            <input type="text" id="del-confirm-input" placeholder="DELETE" autocomplete="off"
              class="mt-1 w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
          </label>
        </div>
        <div class="px-6 py-3 bg-gray-50 flex justify-end gap-2">
          <button id="del-cancel" class="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant border border-outline-variant/30 hover:bg-gray-100 transition-colors">Cancel</button>
          <button id="del-execute" disabled class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-400 cursor-not-allowed transition-colors">Delete programme</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const inp = overlay.querySelector('#del-confirm-input');
    const btn = overlay.querySelector('#del-execute');

    inp.focus();
    inp.addEventListener('input', () => {
      const match = inp.value.trim() === 'DELETE';
      btn.disabled = !match;
      btn.className = match
        ? 'px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer'
        : 'px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-400 cursor-not-allowed transition-colors';
    });

    overlay.querySelector('#del-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.innerHTML = '<span class="spinner"></span> Deleting...';
      btn.disabled = true;
      try {
        await API.del(`/admin/data/programs/${id}`);
        Toast.show('Programme deleted', 'ok');
        overlay.remove();
        loadConvocatorias();
      } catch (e) {
        Toast.show('Error: ' + e.message, 'err');
        overlay.remove();
      }
    });
  }

  /* ── New programme: create + seed template + open editor ────── */
  const EVAL_TEMPLATE = {
    sections: [
      { title: '1. Relevance of the project', color: '#1e3a5f', maxScore: 30, evalNotes: `RELEVANCE OF THE PROJECT (max 30 points)

The extent to which:
• The proposal is relevant to the objectives and priorities of the Action. In addition, the proposal will be considered as highly relevant if it addresses one or more of the 'European Youth Together' specific priorities.
• The proposal is based on a genuine and adequate needs analysis.
• The proposal is innovative and complementary to other initiatives already carried out by the participating organisations.
• The proposal brings added value at EU level through results that would not be attained by activities carried out in a single country.

KEY EVALUATOR FOCUS:
- Is the problem well-documented with data from multiple EU sources?
- Does it clearly show why transnational cooperation is needed?
- Are EU policy priorities explicitly referenced?
- Is there genuine innovation beyond what already exists?`, questions: [
        { code: '1.1', title: 'Background, context and rationale', weight: 40, maxScore: 12, threshold: 0 },
        { code: '1.2', title: 'Objectives and EU added value', weight: 30, maxScore: 9, threshold: 0 },
        { code: '1.3', title: 'Target groups and participants', weight: 30, maxScore: 9, threshold: 0 },
      ]},
      { title: '2. Quality of the project design', color: '#2563eb', maxScore: 30, evalNotes: `QUALITY OF PROJECT DESIGN AND IMPLEMENTATION (max 30 points)

The extent to which:
• The project objectives are clearly defined and realistic, and address issues relevant to the participating organisations and target groups.
• The proposed methodology is clear, adequate and feasible, including appropriate phases for preparation, implementation, monitoring, evaluation and dissemination.
• The work plan is coherent and effective, including appropriate phases for preparation, implementation, monitoring, evaluation and dissemination.
• The project includes adequate quality and risk management measures.
• The project is cost-effective and allocates appropriate resources to each activity.

KEY EVALUATOR FOCUS:
- Is there a clear logical framework (needs → objectives → activities → outputs → impact)?
- Is the Gantt chart/timeline realistic with milestones?
- Are quality assurance and risk management concrete?
- Is the budget proportionate to activities?`, questions: [
        { code: '2.1', title: 'Methodology and approach', weight: 34, maxScore: 10.2, threshold: 0 },
        { code: '2.2', title: 'Work plan and activities', weight: 33, maxScore: 9.9, threshold: 0 },
        { code: '2.3', title: 'Quality and risk management', weight: 33, maxScore: 9.9, threshold: 0 },
      ]},
      { title: '3. Quality of the partnership', color: '#3b82f6', maxScore: 20, evalNotes: `QUALITY OF THE PARTNERSHIP AND COOPERATION ARRANGEMENTS (max 20 points)

The extent to which:
• The project involves an appropriate mix of complementary participating organisations with the necessary profile, competence, experience and expertise to successfully deliver all aspects of the project.
• The proposed distribution of responsibilities and tasks demonstrates the commitment and active contribution of all participating organisations.
• The project involves effective mechanisms for coordination and communication between the participating organisations and with other relevant stakeholders.
• The project involves newcomers and less experienced organisations to the Action.

KEY EVALUATOR FOCUS:
- Does each partner bring unique, complementary expertise?
- Is the geographical spread meaningful (not just token partners)?
- Are roles clearly distributed with a RACI matrix?
- Is there a real partnership agreement with decision-making procedures?`, questions: [
        { code: '3.1', title: 'Consortium composition and competence', weight: 50, maxScore: 10, threshold: 0 },
        { code: '3.2', title: 'Cooperation and communication', weight: 50, maxScore: 10, threshold: 0 },
      ]},
      { title: '4. Impact and dissemination', color: '#60a5fa', maxScore: 20, evalNotes: `IMPACT, DISSEMINATION AND SUSTAINABILITY (max 20 points)

The extent to which:
• The project has a clear and convincing potential impact on its participants, participating organisations, target groups, and the wider community.
• The proposal contains concrete and logical steps to integrate the results of the project activities into the regular work of the participating organisation.
• The proposal contains concrete and effective steps to make known the results of the project within the participating organisations, to share the results with other organisations and the public, and to acknowledge EU funding.
• The proposal describes concrete and effective steps to ensure the sustainability of the project: its capacity to continue to have an impact and to produce results after the EU grant has been used up.

KEY EVALUATOR FOCUS:
- Are impact indicators measurable with baselines and targets?
- Is there a real sustainability plan (not just vague intentions)?
- Are dissemination channels specific and appropriate for each audience?
- Are multiplier events planned in partner countries?`, questions: [
        { code: '4.1', title: 'Expected impact and sustainability', weight: 40, maxScore: 8, threshold: 0 },
        { code: '4.2', title: 'Dissemination and exploitation of results', weight: 35, maxScore: 7, threshold: 0 },
        { code: '4.3', title: 'Wider impact and policy contribution', weight: 25, maxScore: 5, threshold: 0 },
      ]},
    ]
  };

  async function evalNewProgram() {
    try {
      Toast.show('Creating programme...', 'ok');
      const name = 'New programme';
      const { id } = await API.post('/admin/data/programs', {
        name,
        program_id: 'new_' + Date.now(),
        action_type: '',
        active: 1
      });
      await API.post(`/admin/data/eval/${id}/import`, EVAL_TEMPLATE);
      // Open directly into Call Data (activeSectionIdx = -1)
      evalOpenProgram(id, name);
    } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
  }

  async function evalOpenProgram(programId, programName) {
    ev.programId = programId;
    ev.programName = programName;
    ev.activeSectionIdx = -1; // -1 = Call Data section
    ev.activeQuestionIdx = 0;
    evalShowView('editor');
    document.getElementById('eval-program-name').textContent = programName;

    // Bind back button
    const backBtn = document.getElementById('eval-back-btn');
    if (backBtn && !backBtn.dataset.bound) {
      backBtn.dataset.bound = '1';
      backBtn.addEventListener('click', loadEvaluator);
    }
    // Bind add section
    const addSecBtn = document.getElementById('eval-add-section-btn');
    if (addSecBtn && !addSecBtn.dataset.bound) {
      addSecBtn.dataset.bound = '1';
      addSecBtn.addEventListener('click', async () => {
        const title = prompt('Section title (e.g. Relevance):');
        if (!title) return;
        const maxStr = prompt('Max score for this section (EU fixed, e.g. 30):');
        const maxScore = parseFloat(maxStr) || 0;
        try {
          await API.post('/admin/data/eval/sections', { program_id: ev.programId, title, color: EVAL_COLORS[ev.sections.length % EVAL_COLORS.length], max_score: maxScore, sort_order: ev.sections.length });
          await evalReload();
          Toast.show('Section added', 'ok');
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    }
    await evalReload();
  }

  async function evalReload() {
    ev.sections = await API.get('/admin/data/eval/' + ev.programId);
    evalRenderSidebar();
    evalRenderMain();
  }

  function evalRenderSidebar() {
    const container = document.getElementById('eval-sidebar-sections');
    if (!ev.sections.length) {
      container.innerHTML = '<p class="px-4 py-6 text-xs text-on-surface-variant text-center">No sections yet.<br>Add one below.</p>';
      return;
    }
    container.innerHTML = ev.sections.map((sec, si) => {
      const isActive = si === ev.activeSectionIdx;
      const questions = sec.questions || [];
      return `
        <div class="eval-sidebar-sec mb-1" data-si="${si}">
          <div class="eval-sec-chip flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer ${isActive ? 'active' : ''}" data-si="${si}">
            <span class="text-xs font-bold flex-1 truncate ${isActive ? '' : 'text-primary/70'}">${sec.title}</span>
          </div>
          ${isActive ? `<div class="ml-3 mt-1 mb-2 pl-3 border-l-2 border-primary/15">` +
            questions.map((q, qi) => {
              const isQ = qi === ev.activeQuestionIdx;
              return `<div class="eval-q-item flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${isQ ? 'active' : ''}" data-si="${si}" data-qi="${qi}">
                <span class="text-[11px] font-mono font-bold ${isQ ? 'text-primary' : 'text-primary/40'}">${q.code}</span>
                <span class="text-[11px] truncate ${isQ ? 'text-primary font-semibold' : 'text-on-surface-variant'}">${q.title}</span>
              </div>`;
            }).join('') +
            `<button class="eval-add-q flex items-center gap-1 px-3 py-1.5 mt-1 text-[11px] text-primary/50 hover:text-primary font-semibold transition-colors" data-si="${si}">
              <span class="material-symbols-outlined text-sm">add</span> Add question
            </button></div>` : ''}
        </div>`;
    }).join('');

    // Bind section clicks (including Call Data at -1)
    container.querySelectorAll('.eval-sec-chip[data-si]').forEach(div => {
      div.addEventListener('click', (e) => {
        if (e.target.closest('.eval-del-sec')) return;
        ev.activeSectionIdx = parseInt(div.dataset.si);
        ev.activeQuestionIdx = 0;
        evalRenderSidebar();
        evalRenderMain();
      });
    });
    // Bind question clicks
    container.querySelectorAll('.eval-q-item').forEach(div => {
      div.addEventListener('click', () => {
        ev.activeSectionIdx = parseInt(div.dataset.si);
        ev.activeQuestionIdx = parseInt(div.dataset.qi);
        evalRenderSidebar();
        evalRenderMain();
      });
    });
    // Bind add question
    container.querySelectorAll('.eval-add-q').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sec = ev.sections[parseInt(btn.dataset.si)];
        const code = prompt('Question code (e.g. 1.1):');
        if (!code) return;
        const title = prompt('Question title:');
        if (!title) return;
        try {
          await API.post('/admin/data/eval/questions', { section_id: sec.id, code, title, sort_order: (sec.questions || []).length });
          await evalReload();
          Toast.show('Question added', 'ok');
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    });
    // Bind delete section
    container.querySelectorAll('.eval-del-sec').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this section and all its questions/criteria?')) return;
        try {
          await API.del('/admin/data/eval/sections/' + btn.dataset.id);
          ev.activeSectionIdx = 0; ev.activeQuestionIdx = 0;
          await evalReload();
          Toast.show('Deleted', 'ok');
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    });
  }

  function evalRenderMain() {
    const content = document.getElementById('eval-main-content');

    const sec = ev.sections[ev.activeSectionIdx];
    if (!sec || !sec.questions || !sec.questions.length) {
      content.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-center">
        <span class="material-symbols-outlined text-5xl text-outline-variant/40 mb-3">edit_note</span>
        <p class="text-sm text-on-surface-variant">Select a question from the sidebar to start editing.</p>
      </div>`;
      return;
    }
    const q = sec.questions[ev.activeQuestionIdx];
    if (!q) { content.innerHTML = ''; return; }
    const criteria = q.criteria || [];

    // ── Score verification calculations ──
    const secMaxScore = parseFloat(sec.max_score) || 0;
    const questionsInSec = sec.questions || [];
    const qScoreSum = questionsInSec.reduce((s, qq) => s + parseFloat(qq.max_score || 0), 0);
    const secOk = secMaxScore > 0 && Math.abs(qScoreSum - secMaxScore) < 0.1;
    const critScoreSum = (q.criteria || []).reduce((s, cc) => s + parseFloat(cc.max_score || 0), 0);
    const qMax = parseFloat(q.max_score) || 0;
    const critOk = qMax > 0 && Math.abs(critScoreSum - qMax) < 0.1;

    content.innerHTML = `
      <!-- Section header -->
      <div class="flex items-center gap-3 mb-4">
        <div class="w-2 h-10 rounded-full" style="background:${sec.color}"></div>
        <div class="flex-1">
          <div class="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2" style="color:${sec.color}">
            ${sec.title}
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold" style="background:${sec.color}15">${secMaxScore} pts</span>
          </div>
          <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">${q.code} &mdash; ${q.title}</h3>
        </div>
      </div>

      <!-- E+ Guide notes -->
      <div class="rounded-xl border border-amber-200/60 mb-4 bg-amber-50/50 overflow-hidden">
        <button id="eval-notes-toggle" class="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-amber-100/50 transition-colors">
          <span class="material-symbols-outlined text-sm text-amber-600">menu_book</span>
          <span class="text-[11px] font-bold uppercase tracking-widest text-amber-700">E+ Programme Guide notes</span>
          <span class="material-symbols-outlined text-sm text-amber-400 ml-auto eval-notes-chevron transition-transform">expand_more</span>
        </button>
        <div id="eval-notes-body" class="hidden px-4 pb-3">
          <div id="eval-notes-display" class="text-xs text-amber-900/80 leading-relaxed whitespace-pre-wrap mb-2">${sec.eval_notes || '<span class="text-amber-400 italic">No guide notes yet. Click Edit to add the evaluation criteria from the E+ Programme Guide for this section.</span>'}</div>
          <div id="eval-notes-edit-wrap" class="hidden mb-2">
            <textarea id="eval-notes-textarea" rows="6" class="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-xs focus:border-amber-400 outline-none resize-vertical leading-relaxed" placeholder="Paste the evaluation criteria text from the E+ Programme Guide for this section...">${sec.eval_notes || ''}</textarea>
          </div>
          <div class="flex gap-2">
            <button id="eval-notes-edit-btn" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
              <span class="material-symbols-outlined text-xs">edit</span> Edit
            </button>
            <button id="eval-notes-save-btn" class="hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors">
              <span class="material-symbols-outlined text-xs">save</span> Save
            </button>
          </div>
        </div>
      </div>

      <!-- Score distribution bar -->
      <div class="eval-score-dist rounded-xl border border-outline-variant/20 p-4 mb-5 bg-surface-container-lowest">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Score distribution</span>
          <div class="flex items-center gap-1.5 text-[11px]">
            <span class="dist-icon material-symbols-outlined text-sm ${secOk ? 'text-green-500' : 'text-red-500'}">${secOk ? 'check_circle' : 'error'}</span>
            <span class="dist-label font-bold ${secOk ? 'text-green-600' : 'text-red-600'}">Total: ${qScoreSum} / ${secMaxScore || '?'} pts</span>
          </div>
        </div>
        <div class="flex gap-2 items-end">
          ${questionsInSec.map((qq, qi) => {
            const pts = parseFloat(qq.max_score) || 0;
            const pct = secMaxScore > 0 ? (pts / secMaxScore * 100) : 0;
            const isThis = qi === ev.activeQuestionIdx;
            return `<div class="flex-1 flex flex-col items-center gap-1 eval-score-q" data-qi="${qi}" data-qid="${qq.id}">
              <input type="number" class="eval-score-input w-14 px-1 py-0.5 rounded-lg border text-center text-[11px] font-bold outline-none transition-all
                ${isThis ? 'border-primary/40 bg-white' : 'border-transparent bg-transparent hover:border-outline-variant/40 hover:bg-white'}"
                style="color:${isThis ? sec.color : '#787682'}"
                value="${pts}" step="0.5" min="0" data-qid="${qq.id}" data-qi="${qi}">
              <div class="w-full rounded-lg transition-all" style="height:${Math.max(pct * 0.6, 4)}px;background:${isThis ? sec.color : sec.color + '30'}"></div>
              <span class="text-[10px] font-bold cursor-pointer ${isThis ? '' : 'text-on-surface-variant/40'}" style="${isThis ? 'color:'+sec.color : ''}">${qq.code}</span>
              <span class="text-[9px] ${isThis ? 'font-bold' : 'text-on-surface-variant/40'}" style="${isThis ? 'color:'+sec.color : ''}">${pct.toFixed(0)}%</span>
            </div>`;
          }).join('')}
        </div>
        <div class="dist-msg ${!secOk && secMaxScore > 0 ? 'mt-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-semibold flex items-center gap-1' : 'hidden'}">
          ${!secOk && secMaxScore > 0 ? `<span class="material-symbols-outlined text-sm">error</span>
          ${qScoreSum < secMaxScore ? 'Missing ' + (secMaxScore - qScoreSum) + ' pts. Add ' + (secMaxScore - qScoreSum) + ' pts.' : 'Excess ' + (qScoreSum - secMaxScore) + ' pts. Remove ' + (qScoreSum - secMaxScore) + ' pts.'}` : ''}
        </div>
      </div>

      <!-- Question config -->
      <div class="rounded-2xl border border-outline-variant/20 p-5 mb-5 bg-surface-container-lowest">
        <div class="flex items-center gap-2 mb-4">
          <span class="material-symbols-outlined text-sm" style="color:${sec.color}">tune</span>
          <span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Question configuration</span>
        </div>
        <div class="grid grid-cols-4 gap-3 mb-3">
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Code ${fieldInfo('q_code')}</label>
            <input type="text" id="eq-code" value="${q.code}" class="px-3 py-2 rounded-lg border border-outline-variant text-sm font-mono font-bold focus:border-primary outline-none" style="color:${sec.color}">
          </div>
          <div class="col-span-3 flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Title ${fieldInfo('q_title')}</label>
            <input type="text" id="eq-title" value="${q.title}" class="px-3 py-2 rounded-lg border border-outline-variant text-sm font-semibold focus:border-primary outline-none">
          </div>
        </div>
        <div class="flex flex-col gap-1 mb-3">
          <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Description ${fieldInfo('q_description')}</label>
          <textarea id="eq-description" rows="3" class="px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed">${q.description || ''}</textarea>
        </div>

        <!-- PARTE A: bloque genérico de la pregunta (narrative brief) -->
        <div class="rounded-xl border border-outline-variant/30 p-4 mb-3" style="background:${sec.color}08">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-[10px] font-black uppercase tracking-widest" style="color:${sec.color}">Parte A &middot; Bloque de la pregunta</span>
            <span class="text-[9px] text-on-surface-variant/60">(narrative brief)</span>
          </div>
          <div class="flex flex-col gap-1 mb-3">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Contexto de la pregunta ${fieldInfo('q_general_context')}</label>
            <textarea id="eq-general-context" rows="3" class="px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="Un párrafo (4-6 frases) framing what the evaluator looks for...">${q.general_context || ''}</textarea>
          </div>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Apoya en ${fieldInfo('q_connects_from')}</label>
              <textarea id="eq-connects-from" rows="2" class="px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="Narrativa de qué preguntas previas sustentan ésta...">${q.connects_from || ''}</textarea>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Alimenta a ${fieldInfo('q_connects_to')}</label>
              <textarea id="eq-connects-to" rows="2" class="px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="Narrativa de qué preguntas posteriores se construyen sobre ésta...">${q.connects_to || ''}</textarea>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Regla global (opcional) ${fieldInfo('q_global_rule')}</label>
            <textarea id="eq-global-rule" rows="2" class="px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="Principio transversal aplicable a todos los criterios (ej. small-scale logic). Deja vacío si no aplica.">${q.global_rule || ''}</textarea>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Word limit ${fieldInfo('q_word_limit')}</label>
            <input type="number" id="eq-word-limit" value="${q.word_limit || ''}" min="0" class="w-full px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none text-center" placeholder="\u2014">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Page limit ${fieldInfo('q_page_limit')}</label>
            <input type="number" id="eq-page-limit" value="${q.page_limit || ''}" step="0.5" min="0" class="w-full px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none text-center" placeholder="\u2014">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Writing guidance ${fieldInfo('q_writing_guidance')}</label>
            <textarea id="eq-writing-guidance" rows="2" class="px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="e.g. Use narrative style, include partner experiences...">${q.writing_guidance || ''}</textarea>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Scoring logic ${fieldInfo('q_scoring_logic')}</label>
            <select id="eq-scoring-logic" class="px-3 py-2 rounded-lg border border-outline-variant text-sm focus:border-primary outline-none cursor-pointer">
              <option value="sum" ${(q.scoring_logic || 'sum') === 'sum' ? 'selected' : ''}>Sum (add all criteria scores)</option>
              <option value="average" ${q.scoring_logic === 'average' ? 'selected' : ''}>Average</option>
              <option value="min" ${q.scoring_logic === 'min' ? 'selected' : ''}>Min (lowest criterion wins)</option>
            </select>
          </div>
        </div>
        <div class="flex justify-end">
          <button id="eq-save" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-sm">save</span> Save question
          </button>
        </div>
      </div>

      <!-- Criteria -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sm" style="color:${sec.color}">checklist</span>
            <span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Evaluation criteria</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:${sec.color}15;color:${sec.color}">${criteria.length}</span>
          </div>
          <button id="eval-add-crit" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-sm">add</span> Add criterion
          </button>
        </div>
        <!-- Criteria score bar -->
        <div class="eval-crit-score-bar rounded-xl border border-outline-variant/20 p-3 mb-3 bg-surface-container-lowest">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2 text-[11px]">
              <span class="crit-bar-icon material-symbols-outlined text-sm ${critOk ? 'text-green-500' : 'text-red-500'}">${critOk ? 'check_circle' : 'error'}</span>
              <span class="crit-bar-label font-bold ${critOk ? 'text-green-600' : 'text-red-600'}">Criteria: ${critScoreSum} / ${qMax} pts</span>
              ${!critOk && qMax > 0 ? `<span class="crit-bar-diff text-[10px] font-semibold px-2 py-0.5 rounded-lg ${critScoreSum < qMax ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}">${critScoreSum < qMax ? 'need ' + (qMax - critScoreSum) + ' more' : (critScoreSum - qMax) + ' excess'}</span>` : ''}
            </div>
            <span class="text-[10px] text-on-surface-variant/50">${criteria.length} ${criteria.length === 1 ? 'criterion' : 'criteria'}</span>
          </div>
          <div class="flex gap-1 h-3 rounded-full overflow-hidden bg-gray-100">
            ${criteria.length === 0 ? '' : criteria.map((c, i) => {
              const cPts = parseFloat(c.max_score) || 0;
              const cPct = qMax > 0 ? (cPts / qMax * 100) : (100 / criteria.length);
              return `<div class="rounded-full transition-all" style="width:${Math.max(cPct, 2)}%;background:${sec.color};opacity:${0.4 + (i % 2) * 0.3 + 0.3}"
                title="Criterion ${i+1}: ${c.title} — ${cPts} pts"></div>`;
            }).join('')}
          </div>
          ${criteria.length > 0 ? `<div class="flex gap-1 mt-1">
            ${criteria.map((c, i) => {
              const cPts = parseFloat(c.max_score) || 0;
              const cPct = qMax > 0 ? (cPts / qMax * 100) : (100 / criteria.length);
              return `<div class="text-center" style="width:${Math.max(cPct, 2)}%">
                <span class="text-[8px] font-bold text-on-surface-variant/50">${cPts}</span>
              </div>`;
            }).join('')}
          </div>` : ''}
        </div>
        <div id="eval-crit-list" class="grid gap-3">
          ${criteria.length === 0 ? '<div class="rounded-2xl border-2 border-dashed border-outline-variant/40 py-10 text-center"><span class="material-symbols-outlined text-3xl text-outline-variant/30 mb-2">playlist_add</span><p class="text-xs text-on-surface-variant">No criteria yet. Add one to define how this question is scored.</p></div>' :
            criteria.map((c, i) => evalCriterionCard(c, i, sec.color)).join('')}
        </div>
      </div>`;

    // Save question
    document.getElementById('eq-save')?.addEventListener('click', async () => {
      try {
        await API.patch('/admin/data/eval/questions/' + q.id, {
          code: document.getElementById('eq-code').value,
          title: document.getElementById('eq-title').value,
          description: document.getElementById('eq-description').value,
          general_context: document.getElementById('eq-general-context').value || null,
          connects_from: document.getElementById('eq-connects-from').value || null,
          connects_to: document.getElementById('eq-connects-to').value || null,
          global_rule: document.getElementById('eq-global-rule').value || null,
          word_limit: parseInt(document.getElementById('eq-word-limit').value) || null,
          page_limit: parseFloat(document.getElementById('eq-page-limit').value) || null,
          writing_guidance: document.getElementById('eq-writing-guidance').value,
          scoring_logic: document.getElementById('eq-scoring-logic').value
        });
        await evalReload();
        Toast.show('Saved', 'ok');
      } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
    });
    // E+ Guide notes toggle/edit/save
    document.getElementById('eval-notes-toggle')?.addEventListener('click', () => {
      const body = document.getElementById('eval-notes-body');
      const chevron = content.querySelector('.eval-notes-chevron');
      body.classList.toggle('hidden');
      if (chevron) chevron.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
    });
    document.getElementById('eval-notes-edit-btn')?.addEventListener('click', () => {
      document.getElementById('eval-notes-display').classList.add('hidden');
      document.getElementById('eval-notes-edit-wrap').classList.remove('hidden');
      document.getElementById('eval-notes-save-btn').classList.remove('hidden');
      document.getElementById('eval-notes-edit-btn').classList.add('hidden');
      document.getElementById('eval-notes-textarea').focus();
    });
    document.getElementById('eval-notes-save-btn')?.addEventListener('click', async () => {
      const notes = document.getElementById('eval-notes-textarea').value;
      try {
        await API.patch('/admin/data/eval/sections/' + sec.id, { eval_notes: notes });
        await evalReload();
        Toast.show('Guide notes saved', 'ok');
      } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
    });

    // Click on question code to navigate
    content.querySelectorAll('.eval-score-q span[class*="cursor-pointer"]').forEach(el => {
      el.addEventListener('click', () => {
        const qi = parseInt(el.parentElement.dataset.qi);
        ev.activeQuestionIdx = qi;
        evalRenderSidebar();
        evalRenderMain();
      });
    });
    // Inline score edit in distribution bar — live update + save on blur
    content.querySelectorAll('.eval-score-input').forEach(inp => {
      // Live recalculate total as user types
      inp.addEventListener('input', () => {
        const bar = content.querySelector('.eval-score-dist');
        if (!bar) return;
        let sum = 0;
        content.querySelectorAll('.eval-score-input').forEach(i => { sum += parseFloat(i.value) || 0; });
        const ok = secMaxScore > 0 && Math.abs(sum - secMaxScore) < 0.1;
        const icon = bar.querySelector('.dist-icon');
        const label = bar.querySelector('.dist-label');
        const msg = bar.querySelector('.dist-msg');
        if (icon) { icon.textContent = ok ? 'check_circle' : 'error'; icon.className = `material-symbols-outlined text-sm ${ok ? 'text-green-500' : 'text-red-500'}`; }
        if (label) { label.textContent = `Total: ${sum} / ${secMaxScore} pts`; label.className = `font-bold ${ok ? 'text-green-600' : 'text-red-600'}`; }
        if (msg) {
          if (ok) { msg.innerHTML = ''; msg.className = 'hidden'; }
          else {
            const diff = sum - secMaxScore;
            msg.className = 'mt-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-semibold flex items-center gap-1';
            msg.innerHTML = `<span class="material-symbols-outlined text-sm">error</span> ${diff > 0 ? 'Excess ' + diff + ' pts. Remove ' + diff + ' pts.' : 'Missing ' + Math.abs(diff) + ' pts. Add ' + Math.abs(diff) + ' pts.'}`;
          }
        }
      });
      // Save on blur/change
      inp.addEventListener('change', async () => {
        const qid = inp.dataset.qid;
        const newScore = parseFloat(inp.value) || 0;
        try {
          await API.patch('/admin/data/eval/questions/' + qid, { max_score: newScore });
          await evalReload();
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    });
    // Add criterion — creates empty one and reloads
    document.getElementById('eval-add-crit')?.addEventListener('click', async () => {
      try {
        await API.post('/admin/data/eval/criteria', { question_id: q.id, title: 'New criterion', sort_order: criteria.length });
        await evalReload();
        Toast.show('Criterion added', 'ok');
      } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
    });
    evalBindCriteriaEvents(content);
  }

  /* ── Action Type picker (modal) ─────────────────────────────── */
  const ACTION_TYPES = [
    { group: 'EACEA — Centralizados', items: [
      { code: 'ERASMUS-EDU-2026-EUR-UNIV', name: 'European Universities' },
      { code: 'ERASMUS-EDU-2026-PEX-COVE', name: 'Centres of Vocational Excellence' },
      { code: 'ERASMUS-EDU-2026-PEX-EMJM-MOB', name: 'Erasmus Mundus Joint Masters' },
      { code: 'ERASMUS-EDU-2026-EMJM-DESIGN', name: 'Erasmus Mundus Design Measures' },
      { code: 'ERASMUS-EDU-2026-PI-ALL-INNO-EDU-ENTERP', name: 'Alliances for Education and Enterprises' },
      { code: 'ERASMUS-EDU-2026-PI-ALL-INNO-BLUEPRINT', name: 'Alliances for Sectoral Cooperation on Skills' },
      { code: 'ERASMUS-EDU-2026-PI-ALL-INNO-STEM', name: 'Alliances for Innovation in STEM' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-1', name: 'Capacity Building in Higher Education, Region 1' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-2', name: 'Capacity Building in Higher Education, Region 2' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-3', name: 'Capacity Building in Higher Education, Region 3' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-5', name: 'Capacity Building in Higher Education, Region 5' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-6', name: 'Capacity Building in Higher Education, Region 6' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-7', name: 'Capacity Building in Higher Education, Region 7' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-8', name: 'Capacity Building in Higher Education, Region 8' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-9', name: 'Capacity Building in Higher Education, Region 9' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-10', name: 'Capacity Building in Higher Education, Region 10' },
      { code: 'ERASMUS-EDU-2026-CBHE-REGION-11', name: 'Capacity Building in Higher Education, Region 11' },
      { code: 'ERASMUS-EDU-2026-CBHE-CROSS-REGIONAL', name: 'Capacity Building in Higher Education, Cross-Regional Strand' },
      { code: 'ERASMUS-EDU-2026-CB-VET-WB', name: 'Capacity Building in VET in Western Balkans' },
      { code: 'ERASMUS-EDU-2026-CB-VET-NE', name: 'Capacity Building in VET in Neighbourhood East' },
      { code: 'ERASMUS-EDU-2026-CB-VET-SMC', name: 'Capacity Building in VET in South-Mediterranean Countries' },
      { code: 'ERASMUS-EDU-2026-CB-VET-SSA', name: 'Capacity Building in VET in Sub-Saharan Africa' },
      { code: 'ERASMUS-EDU-2026-CB-VET-LA', name: 'Capacity Building in VET in Latin America' },
      { code: 'ERASMUS-EDU-2026-CB-VET-CA', name: 'Capacity Building in VET in Caribbean' },
      { code: 'ERASMUS-YOUTH-2026-CB', name: 'Capacity Building in the field of Youth' },
      { code: 'ERASMUS-YOUTH-2026-YOUTH-TOG', name: 'European Youth Together' },
      { code: 'ERASMUS-EDU-2026-PCOOP-ENGO', name: 'Cooperation Partnerships for European NGOs in Education and Training' },
      { code: 'ERASMUS-YOUTH-2026-PCOOP-ENGO', name: 'Cooperation Partnerships for European NGOs in Youth' },
      { code: 'ERASMUS-SPORT-2026-SCP', name: 'Cooperation Partnerships in Sport' },
      { code: 'ERASMUS-SPORT-2026-SSCP', name: 'Small-scale Partnerships in Sport' },
      { code: 'ERASMUS-SPORT-2026-CB', name: 'Capacity Building in the field of Sport' },
      { code: 'ERASMUS-SPORT-2026-SNCESE', name: 'Not-for-profit European Sport Events' },
      { code: 'ERASMUS-SPORT-2026-LSSNCESE', name: 'Large-scale Not-for-profit European Sport Events' },
      { code: 'ERASMUS-EDU-2026-VIRT-EXCH-SSA', name: 'Erasmus+ Virtual Exchanges in Sub-Saharan Africa' },
      { code: 'ERASMUS-EDU-2026-VIRT-EXCH-WB', name: 'Erasmus+ Virtual Exchanges in Western Balkans' },
      { code: 'ERASMUS-EDU-2026-VIRT-EXCH-SMC', name: 'Erasmus+ Virtual Exchanges in South-Mediterranean Countries' },
      { code: 'ERASMUS-EDU-2026-VIRT-EXCH-NE', name: 'Erasmus+ Virtual Exchanges in Neighbourhood East' },
      { code: 'ERASMUS-JMO-2026-HEI-TCH-RSCH-MODULE', name: 'Jean Monnet Module' },
      { code: 'ERASMUS-JMO-2026-HEI-TCH-RSCH-CHAIR', name: 'Jean Monnet Chair' },
      { code: 'ERASMUS-JMO-2026-HEI-TCH-RSCH-COE', name: 'Jean Monnet Centre of Excellence' },
      { code: 'ERASMUS-JMO-2026-OFET-TT', name: 'Jean Monnet Teacher Training' },
      { code: 'ERASMUS-JMO-2026-OFET-LEARNING-EU', name: 'Jean Monnet Learning EU Initiatives' },
      { code: 'ERASMUS-JMO-2026-NETWORKS-SCHOOLS', name: 'Jean Monnet Networks in other fields of education and training' },
    ]},
    { group: 'National Agencies — Descentralizados', items: [
      { code: 'KA121-SCH', name: 'Accredited projects for mobility of learners and staff in School Education' },
      { code: 'KA121-VET', name: 'Accredited projects for mobility of learners and staff in Vocational Education and Training' },
      { code: 'KA121-ADU', name: 'Accredited projects for mobility of learners and staff in Adult Education' },
      { code: 'KA122-SCH', name: 'Short-term projects for mobility of learners and staff in School Education' },
      { code: 'KA122-VET', name: 'Short-term projects for mobility of learners and staff in Vocational Education and Training' },
      { code: 'KA122-ADU', name: 'Short-term projects for mobility of learners and staff in Adult Education' },
      { code: 'KA131-HED', name: 'Mobility of higher education students and staff supported by internal policy funds' },
      { code: 'KA171-HED', name: 'Mobility of higher education students and staff supported by external policy funds' },
      { code: 'KA151-YOU', name: 'Youth Participation Activities' },
      { code: 'KA152-YOU', name: 'Mobility of young people' },
      { code: 'KA153-YOU', name: 'Mobility of youth workers' },
      { code: 'KA154-YOU', name: 'DiscoverEU Inclusion Action' },
      { code: 'KA210-SCH', name: 'Small-scale Partnerships in School Education' },
      { code: 'KA210-VET', name: 'Small-scale Partnerships in Vocational Education and Training' },
      { code: 'KA210-ADU', name: 'Small-scale Partnerships in Adult Education' },
      { code: 'KA210-YOU', name: 'Small-scale Partnerships in Youth' },
      { code: 'KA220-SCH', name: 'Cooperation Partnerships in School Education' },
      { code: 'KA220-VET', name: 'Cooperation Partnerships in Vocational Education and Training' },
      { code: 'KA220-ADU', name: 'Cooperation Partnerships in Adult Education' },
      { code: 'KA220-YOU', name: 'Cooperation Partnerships in Youth' },
    ]},
    { group: 'EISMEA — Single Market Programme', items: [
      { code: 'SMP-COSME-2026-TOURSME-01', name: 'Sustainable Competitiveness in Tourism — Supporting Tourism SMEs (SMP-GFS)' },
    ]},
  ];

  function openActionTypePicker() {
    const current = document.getElementById('cd-action-type')?.value || '';
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]';
    overlay.style.animation = 'fadeIn .15s ease';

    let html = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden" style="animation:critIn .2s ease">
        <div class="px-5 py-4 border-b border-outline-variant/20 flex items-center gap-3">
          <span class="material-symbols-outlined text-primary text-xl">campaign</span>
          <div class="flex-1">
            <h3 class="font-headline text-base font-bold text-primary">Seleccionar Action Type</h3>
            <p class="text-xs text-on-surface-variant">Elige la convocatoria Erasmus+</p>
          </div>
          <button id="atp-close" class="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
            <span class="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>
        <div class="px-5 py-3 border-b border-outline-variant/10">
          <input type="text" id="atp-search" placeholder="Buscar por codigo o nombre..." autofocus
            class="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
        </div>
        <div id="atp-list" class="flex-1 overflow-y-auto px-3 py-2">`;

    for (const g of ACTION_TYPES) {
      html += `<div class="atp-group" data-group="${g.group}">
        <div class="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant sticky top-0 bg-white/95 backdrop-blur-sm">${g.group}</div>`;
      for (const it of g.items) {
        const isCurrent = it.code === current;
        html += `<div class="atp-item flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${isCurrent ? 'bg-primary/10 border border-primary/30' : 'hover:bg-surface-container-low border border-transparent'}" data-code="${it.code}">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-mono font-bold ${isCurrent ? 'text-primary' : 'text-on-surface-variant'}">${it.code}</div>
            <div class="text-sm ${isCurrent ? 'text-primary font-semibold' : 'text-on-surface'}">${it.name}</div>
          </div>
          ${isCurrent ? '<span class="material-symbols-outlined text-primary text-lg mt-0.5">check_circle</span>' : ''}
        </div>`;
      }
      html += '</div>';
    }

    html += `</div>
        <div class="px-5 py-3 border-t border-outline-variant/20 flex justify-between items-center bg-gray-50">
          <button id="atp-clear" class="text-xs text-on-surface-variant hover:text-error transition-colors">Limpiar seleccion</button>
          <span id="atp-count" class="text-xs text-on-surface-variant"></span>
        </div>
      </div>`;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector('#atp-search');
    const listEl = overlay.querySelector('#atp-list');
    const countEl = overlay.querySelector('#atp-count');

    // Count
    const total = ACTION_TYPES.reduce((s, g) => s + g.items.length, 0);
    countEl.textContent = total + ' convocatorias';

    // Search filter
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      let visible = 0;
      listEl.querySelectorAll('.atp-item').forEach(el => {
        const match = !q || el.dataset.code.toLowerCase().includes(q) || el.textContent.toLowerCase().includes(q);
        el.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      listEl.querySelectorAll('.atp-group').forEach(g => {
        const hasVisible = g.querySelector('.atp-item:not([style*="display: none"])');
        g.style.display = hasVisible ? '' : 'none';
      });
      countEl.textContent = (q ? visible + ' / ' : '') + total + ' convocatorias';
    });

    // Select item
    listEl.querySelectorAll('.atp-item').forEach(el => {
      el.addEventListener('click', () => {
        const code = el.dataset.code;
        document.getElementById('cd-action-type').value = code;
        const label = document.getElementById('cd-action-type-label');
        if (label) { label.textContent = code; label.classList.remove('text-on-surface-variant'); label.classList.add('text-on-surface'); }
        overlay.remove();
      });
    });

    // Clear
    overlay.querySelector('#atp-clear').addEventListener('click', () => {
      document.getElementById('cd-action-type').value = '';
      const label = document.getElementById('cd-action-type-label');
      if (label) { label.textContent = 'Seleccionar convocatoria...'; label.classList.add('text-on-surface-variant'); label.classList.remove('text-on-surface'); }
      overlay.remove();
    });

    // Close
    overlay.querySelector('#atp-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Scroll to current
    if (current) {
      setTimeout(() => {
        const active = listEl.querySelector(`[data-code="${current}"]`);
        if (active) active.scrollIntoView({ block: 'center' });
      }, 100);
    }

    searchInput.focus();
  }

  async function evalRenderCallData(content) {
    // Fetch current program data + call eligibility (for writing rules)
    let programs, elig;
    try { programs = await API.get('/admin/data/programs'); } catch { programs = []; }
    try { elig = await API.get('/admin/data/eligibility/call/' + ev.programId); } catch { elig = null; }
    const prog = programs.find(p => p.id === ev.programId) || {};
    prog._writing_style = elig?.writing_style || '';
    prog._ai_detection_rules = elig?.ai_detection_rules || '';
    const fmtDate = d => d ? d.slice(0, 10) : '';

    content.innerHTML = `
      <div class="flex items-center gap-3 mb-5">
        <div class="w-2 h-10 rounded-full bg-primary"></div>
        <div>
          <div class="text-[10px] font-bold uppercase tracking-widest text-primary">Programme / Call</div>
          <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">Call Data</h3>
        </div>
      </div>
      <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="col-span-2 flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Programme name</label>
            <input type="text" id="cd-name" value="${prog.name || ''}" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm font-semibold focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Action type</label>
            <input type="hidden" id="cd-action-type" value="${esc(prog.action_type || '')}">
            <button type="button" id="cd-action-type-btn" class="w-full text-left px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none bg-white hover:bg-surface-container-low transition-colors flex items-center gap-2">
              <span class="material-symbols-outlined text-primary/50 text-base">campaign</span>
              <span id="cd-action-type-label" class="flex-1 truncate ${prog.action_type ? 'text-on-surface' : 'text-on-surface-variant'}">${prog.action_type ? esc(prog.action_type) : 'Seleccionar convocatoria...'}</span>
              <span class="material-symbols-outlined text-on-surface-variant text-base">expand_more</span>
            </button>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Deadline</label>
            <div class="flex gap-2">
              <input type="date" id="cd-deadline" value="${fmtDate(prog.deadline)}" class="flex-1 px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
              <input type="time" id="cd-deadline-time" value="${prog.deadline_time || '17:00'}" class="w-28 px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none" title="Hora de Bruselas (CET)">
            </div>
            <span class="text-[9px] text-on-surface-variant/60">Brussels time (CET)</span>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">EU Grant max</label>
            <input type="number" id="cd-grant" value="${prog.eu_grant_max || ''}" step="1000" min="0" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Co-financing %</label>
            <input type="number" id="cd-cofin" value="${prog.cofin_pct || ''}" min="0" max="100" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Indirect costs %</label>
            <input type="number" id="cd-indirect" value="${prog.indirect_pct || ''}" step="0.01" min="0" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Min partners</label>
            <input type="number" id="cd-partners" value="${prog.min_partners || 2}" min="1" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Max partners</label>
            <input type="number" id="cd-partners-max" value="${prog.max_partners ?? ''}" min="1" placeholder="Sin límite" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Start date from</label>
            <input type="date" id="cd-start-min" value="${fmtDate(prog.start_date_min)}" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Start date to</label>
            <input type="date" id="cd-start-max" value="${fmtDate(prog.start_date_max)}" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Duration min (months)</label>
            <input type="number" id="cd-dur-min" value="${prog.duration_min_months || ''}" min="1" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Duration max (months)</label>
            <input type="number" id="cd-dur-max" value="${prog.duration_max_months || ''}" min="1" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Status</label>
            <select id="cd-active" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none cursor-pointer">
              <option value="1" ${prog.active ? 'selected' : ''}>Active</option>
              <option value="0" ${!prog.active ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div class="col-span-2 mt-2 border-t border-outline-variant/20 pt-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-sm text-primary">info</span>
            <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Call summary (visible in Intake)</span>
          </div>
          <div class="flex flex-col gap-1 mb-4">
            <textarea id="cd-call-summary" rows="4" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="Brief description of this call: what type of projects, budget range, thematic focus, target audience... This will be shown to users in the Intake form.">${prog.call_summary || ''}</textarea>
          </div>
        </div>
        <div class="col-span-2 mt-2 border-t border-outline-variant/20 pt-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-sm text-primary">edit_note</span>
            <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Writing rules (global)</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Writing style ${fieldInfo('cd_writing_style')}</label>
              <textarea id="cd-writing-style" rows="4" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="Tone, voice, sentence variety, formality level...">${prog._writing_style || ''}</textarea>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">AI detection rules ${fieldInfo('cd_ai_rules')}</label>
              <textarea id="cd-ai-rules" rows="4" class="px-3 py-2.5 rounded-xl border border-outline-variant text-sm focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="Patterns to avoid, forbidden expressions...">${prog._ai_detection_rules || ''}</textarea>
            </div>
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <button id="cd-save" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-sm">save</span> Save call data
          </button>
        </div>
      </div>`;

    // Bind action type picker modal
    document.getElementById('cd-action-type-btn')?.addEventListener('click', () => openActionTypePicker());

    document.getElementById('cd-save')?.addEventListener('click', async () => {
      try {
        await API.patch('/admin/data/programs/' + ev.programId, {
          name: document.getElementById('cd-name').value,
          action_type: document.getElementById('cd-action-type').value,
          deadline: document.getElementById('cd-deadline').value || null,
          deadline_time: document.getElementById('cd-deadline-time').value || '17:00',
          eu_grant_max: document.getElementById('cd-grant').value || null,
          cofin_pct: document.getElementById('cd-cofin').value || null,
          indirect_pct: document.getElementById('cd-indirect').value || null,
          min_partners: document.getElementById('cd-partners').value || 2,
          max_partners: document.getElementById('cd-partners-max').value || null,
          start_date_min: document.getElementById('cd-start-min').value || null,
          start_date_max: document.getElementById('cd-start-max').value || null,
          duration_min_months: document.getElementById('cd-dur-min').value || null,
          duration_max_months: document.getElementById('cd-dur-max').value || null,
          active: parseInt(document.getElementById('cd-active').value),
          call_summary: document.getElementById('cd-call-summary').value || null
        });
        // Also save writing rules to call_eligibility
        await API.put('/admin/data/eligibility/call/' + ev.programId, {
          ...elig,
          writing_style: document.getElementById('cd-writing-style').value,
          ai_detection_rules: document.getElementById('cd-ai-rules').value
        });
        ev.programName = document.getElementById('cd-name').value;
        const titleEl = document.getElementById('conv-editor-title') || document.getElementById('eval-program-name');
        if (titleEl) titleEl.textContent = ev.programName;
        Toast.show('Call data saved', 'ok');
      } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
    });
  }

  async function evalRenderEligibility(content) {
    content.innerHTML = '<p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Loading eligibility…</p>';
    let data;
    try { data = await API.get(`/admin/data/eligibility/call/${ev.programId}`) || {}; } catch { data = {}; }
    const countryTypes  = safeJSON(data.eligible_country_types, []);
    const entityTypes   = safeJSON(data.eligible_entity_types, []);
    const activityTypes = safeJSON(data.activity_location_types, []);

    content.innerHTML = `
      <div class="flex items-center gap-3 mb-5">
        <div class="w-2 h-10 rounded-full bg-primary"></div>
        <div>
          <div class="text-[10px] font-bold uppercase tracking-widest text-primary">Programme / Call</div>
          <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">Eligibility Criteria</h3>
        </div>
      </div>
      <div class="space-y-4">
        <!-- Country eligibility -->
        <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
          <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-base">public</span> Eligible countries
          </h3>
          <p class="text-xs text-on-surface-variant mb-3">Which country types can submit applications?</p>
          <div class="space-y-2" id="ev-elig-country-types">
            ${COUNTRY_TYPE_OPTIONS.map(o => `
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" value="${o.value}" class="accent-primary" ${countryTypes.includes(o.value) ? 'checked' : ''}>
                <span class="text-sm">${o.label}</span>
              </label>`).join('')}
          </div>
        </div>

        <!-- Entity types -->
        <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
          <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-base">business</span> Eligible entity types
          </h3>
          <p class="text-xs text-on-surface-variant mb-3">Which organisations can participate, and can they coordinate?</p>
          <div class="space-y-2" id="ev-elig-entity-types">
            ${ENTITY_TYPE_OPTIONS.map(o => {
              const match = entityTypes.find(e => e.type === o.value);
              const checked = !!match;
              const canCoord = match ? match.can_coordinate : true;
              return `
              <div class="flex items-center gap-3 py-1">
                <input type="checkbox" value="${o.value}" class="ev-elig-ent-check accent-primary" ${checked ? 'checked' : ''}>
                <span class="text-sm flex-1">${o.label}</span>
                <label class="flex items-center gap-1 text-xs text-on-surface-variant">
                  <input type="checkbox" class="ev-elig-ent-coord accent-primary" data-type="${o.value}" ${canCoord ? 'checked' : ''}>
                  Can coordinate
                </label>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Consortium composition -->
        <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
          <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-base">groups</span> Consortium composition
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label class="block">
              <span class="text-xs text-on-surface-variant">Min. partners (beneficiaries)</span>
              <input type="number" id="ev-elig-min-partners" min="1" value="${data.min_partners || 1}"
                class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </label>
            <label class="block">
              <span class="text-xs text-on-surface-variant">Min. countries</span>
              <input type="number" id="ev-elig-min-countries" min="1" value="${data.min_countries || 1}"
                class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </label>
            <label class="block">
              <span class="text-xs text-on-surface-variant">Max applications as coordinator</span>
              <input type="number" id="ev-elig-max-coord" min="1" value="${data.max_coord_applications || ''}" placeholder="No limit"
                class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </label>
            <label class="block">
              <span class="text-xs text-on-surface-variant">Max applications as partner</span>
              <input type="number" id="ev-elig-max-partner" min="1" value="${data.max_partner_applications || ''}" placeholder="No limit"
                class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </label>
            <label class="block">
              <span class="text-xs text-on-surface-variant">Max applications as applicant</span>
              <input type="number" id="ev-elig-max-applicant" min="1" value="${data.max_applicant_applications || ''}" placeholder="No limit"
                class="mt-1 w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </label>
          </div>
        </div>

        <!-- Activity location -->
        <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
          <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-base">location_on</span> Activity location
          </h3>
          <p class="text-xs text-on-surface-variant mb-3">Where must activities take place?</p>
          <div class="space-y-2" id="ev-elig-activity-types">
            ${COUNTRY_TYPE_OPTIONS.map(o => `
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" value="${o.value}" class="accent-primary" ${activityTypes.includes(o.value) ? 'checked' : ''}>
                <span class="text-sm">${o.label}</span>
              </label>`).join('')}
          </div>
        </div>

        <!-- Additional rules -->
        <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
          <h3 class="font-bold text-primary text-sm flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-base">description</span> Additional rules
          </h3>
          <textarea id="ev-elig-additional-rules" rows="3" placeholder="Free text for additional eligibility notes..."
            class="w-full px-3 py-2 border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">${data.additional_rules || ''}</textarea>
        </div>

        <!-- Save -->
        <div class="flex justify-end">
          <button id="ev-elig-save-btn" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors">
            <span class="material-symbols-outlined text-sm">save</span> Save eligibility
          </button>
        </div>
      </div>`;

    document.getElementById('ev-elig-save-btn').addEventListener('click', async () => {
      const selCountry = [...document.querySelectorAll('#ev-elig-country-types input:checked')].map(i => i.value);
      const selEntity  = [...document.querySelectorAll('#ev-elig-entity-types .ev-elig-ent-check:checked')].map(i => {
        const coordCb = document.querySelector(`.ev-elig-ent-coord[data-type="${i.value}"]`);
        return { type: i.value, can_coordinate: coordCb?.checked ?? true, label: ENTITY_TYPE_OPTIONS.find(o => o.value === i.value)?.label || i.value };
      });
      const selActivity = [...document.querySelectorAll('#ev-elig-activity-types input:checked')].map(i => i.value);

      try {
        await API.put(`/admin/data/eligibility/call/${ev.programId}`, {
          eligible_country_types: selCountry,
          eligible_entity_types: selEntity,
          min_partners: document.getElementById('ev-elig-min-partners').value,
          min_countries: document.getElementById('ev-elig-min-countries').value,
          max_coord_applications: document.getElementById('ev-elig-max-coord').value || null,
          max_partner_applications: document.getElementById('ev-elig-max-partner').value || null,
          max_applicant_applications: document.getElementById('ev-elig-max-applicant').value || null,
          activity_location_types: selActivity,
          additional_rules: document.getElementById('ev-elig-additional-rules').value,
        });
        Toast.show('Eligibility saved', 'ok');
      } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
    });
  }

  function evalCriterionCard(c, i, color) {
    const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const tints = ['#f8fafc', '#eff6ff', '#f0f4fa', '#e8eef6', '#dbeafe', '#edf2f9'];
    const bg = tints[i % tints.length];
    const priority = c.priority || 'media';
    const prioColors = {
      alta:  { bg: 'bg-red-100',    fg: 'text-red-700',    dot: '#dc2626' },
      media: { bg: 'bg-amber-100',  fg: 'text-amber-700',  dot: '#d97706' },
      baja:  { bg: 'bg-slate-100',  fg: 'text-slate-600',  dot: '#64748b' }
    };
    const pc = prioColors[priority];
    // Completeness indicator: which narrative fields are filled
    const hasIntent = !!(c.intent && c.intent.trim());
    const hasElements = !!(c.elements && c.elements.trim());
    const hasWeak = !!(c.example_weak && c.example_weak.trim());
    const hasStrong = !!(c.example_strong && c.example_strong.trim());
    const hasAvoid = !!(c.avoid && c.avoid.trim());
    const filled = [hasIntent, hasElements, hasWeak, hasStrong, hasAvoid].filter(Boolean).length;
    const examplesOk = hasWeak && hasStrong;

    return `
      <div class="eval-crit-card rounded-2xl border border-outline-variant/25 p-5 relative overflow-hidden" data-id="${c.id}" style="background:${bg};border-left-color:${color}">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold text-white shadow-sm" style="background:${color}">${i+1}</div>
            <div>
              <div class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Criterion ${i+1}</div>
              <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold" style="background:${color}15;color:${color}">max ${c.max_score} pts</span>
                <span class="px-2 py-0.5 rounded-lg ${pc.bg} ${pc.fg} text-[10px] font-bold uppercase">${priority}</span>
                ${c.mandatory ? '<span class="px-2 py-0.5 rounded-lg bg-blue-900/10 text-blue-900 text-[10px] font-bold">MANDATORY</span>' : '<span class="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-semibold">optional</span>'}
                <span class="px-2 py-0.5 rounded-lg text-[10px] font-semibold ${filled === 5 ? 'bg-green-100 text-green-700' : filled >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}">${filled}/5 fields</span>
                ${!examplesOk ? '<span class="px-2 py-0.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold">⚠ examples missing</span>' : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button class="eval-save-crit inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors shadow-sm" data-id="${c.id}">
              <span class="material-symbols-outlined text-sm">save</span> Save
            </button>
            <button class="eval-del-crit w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors" data-id="${c.id}">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        </div>
        <!-- Narrative brief fields -->
        <div class="grid gap-3">
          <!-- Title -->
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Título ${fieldInfo('c_title')}</label>
            <input type="text" data-field="title" value="${esc(c.title)}" class="ec-field px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-white text-sm font-semibold focus:border-primary outline-none">
          </div>
          <!-- Meta: priority, max_score, mandatory -->
          <div class="grid grid-cols-3 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Prioridad ${fieldInfo('c_priority')}</label>
              <select data-field="priority" class="ec-field px-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-sm focus:border-primary outline-none cursor-pointer">
                <option value="alta"  ${priority === 'alta'  ? 'selected' : ''}>Alta</option>
                <option value="media" ${priority === 'media' ? 'selected' : ''}>Media</option>
                <option value="baja"  ${priority === 'baja'  ? 'selected' : ''}>Baja</option>
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Max score ${fieldInfo('c_max_score')}</label>
              <input type="number" data-field="max_score" value="${c.max_score}" step="0.5" min="0" class="ec-field px-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-sm font-bold focus:border-primary outline-none" style="color:${color}">
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">Obligatorio ${fieldInfo('c_mandatory')}</label>
              <select data-field="mandatory" class="ec-field px-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-sm focus:border-primary outline-none cursor-pointer">
                <option value="1" ${c.mandatory ? 'selected' : ''}>Sí</option>
                <option value="0" ${!c.mandatory ? 'selected' : ''}>No</option>
              </select>
            </div>
          </div>
          <!-- INTENCIÓN -->
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">INTENCIÓN ${fieldInfo('c_intent')}</label>
            <textarea data-field="intent" rows="3" class="ec-field px-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-xs focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="2-3 frases: qué debe demostrar este párrafo...">${esc(c.intent)}</textarea>
          </div>
          <!-- ELEMENTOS -->
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center">ELEMENTOS ${fieldInfo('c_elements')}</label>
            <textarea data-field="elements" rows="3" class="ec-field px-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-xs focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="Qué tiene que aparecer concretamente en el texto...">${esc(c.elements)}</textarea>
          </div>
          <!-- EJEMPLOS débil / fuerte -->
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${hasWeak ? 'text-on-surface-variant' : 'text-red-500'}">
                <span class="material-symbols-outlined text-xs">thumb_down</span> Ejemplo DÉBIL ${fieldInfo('c_example_weak')}
              </label>
              <textarea data-field="example_weak" rows="3" class="ec-field px-3 py-2 rounded-xl border ${hasWeak ? 'border-outline-variant/40' : 'border-red-300'} bg-white text-xs italic focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="1-2 frases reales que un mal escritor pondría...">${esc(c.example_weak)}</textarea>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${hasStrong ? 'text-on-surface-variant' : 'text-red-500'}">
                <span class="material-symbols-outlined text-xs text-green-600">thumb_up</span> Ejemplo FUERTE ${fieldInfo('c_example_strong')}
              </label>
              <textarea data-field="example_strong" rows="3" class="ec-field px-3 py-2 rounded-xl border ${hasStrong ? 'border-outline-variant/40' : 'border-red-300'} bg-white text-xs italic focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="1-2 frases que un buen escritor pondría...">${esc(c.example_strong)}</textarea>
            </div>
          </div>
          <!-- EVITAR -->
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center gap-1">
              <span class="material-symbols-outlined text-xs text-error/60">block</span> EVITAR ${fieldInfo('c_avoid')}
            </label>
            <textarea data-field="avoid" rows="3" class="ec-field px-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-xs focus:border-primary outline-none resize-vertical leading-relaxed" placeholder="3-4 errores típicos específicos que penalizan este criterio...">${esc(c.avoid)}</textarea>
          </div>
        </div>
      </div>`;
  }

  function autoGrowTextarea(el) {
    const grow = () => {
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight + 2) + 'px';
    };
    el.style.overflow = 'hidden';
    el.style.resize = 'none';
    el.addEventListener('input', grow);
    // Defer initial grow so CSS/layout has settled (textarea may be briefly 0 height)
    requestAnimationFrame(grow);
  }

  function evalBindCriteriaEvents(container) {
    // Auto-grow every textarea in the editor (criteria cards + Part A block)
    container.querySelectorAll('textarea').forEach(autoGrowTextarea);
    // Save individual criterion
    container.querySelectorAll('.eval-save-crit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.eval-crit-card');
        const id = btn.dataset.id;
        const data = {};
        card.querySelectorAll('.ec-field').forEach(el => {
          const field = el.dataset.field;
          if (field === 'mandatory') data[field] = parseInt(el.value);
          else if (field === 'max_score') data[field] = parseFloat(el.value) || 0;
          else data[field] = el.value;
        });
        try {
          await API.patch('/admin/data/eval/criteria/' + id, data);
          Toast.show('Criterion saved', 'ok');
          await evalReload();
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    });
    // Delete criterion
    container.querySelectorAll('.eval-del-crit').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this criterion?')) return;
        try {
          await API.del('/admin/data/eval/criteria/' + btn.dataset.id);
          await evalReload();
          Toast.show('Deleted', 'ok');
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    });
  }

  /* ══════════════════════════════════════════════════════��═══════
     ALL DOCS — admin view of every document in the system
     ══════════════════════════════════════════════════════════════ */

  let allDocs = [];

  async function loadAllDocs() {
    const tbody = document.getElementById('admin-all-docs-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-on-surface-variant text-sm">Cargando...</td></tr>';
    try {
      allDocs = await API.get('/documents/admin/all');
      renderAllDocs();
      bindAllDocsFilters();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-red-500 text-sm">Error: ${e.message}</td></tr>`;
    }
  }

  function renderAllDocs(filter) {
    const tbody = document.getElementById('admin-all-docs-tbody');
    let filtered = allDocs;

    const search = (filter?.search || document.getElementById('admin-docs-search')?.value || '').toLowerCase();
    const typeFilter = filter?.type ?? (document.getElementById('admin-docs-filter-type')?.value || '');

    if (search) {
      filtered = filtered.filter(d =>
        (d.title || '').toLowerCase().includes(search) ||
        (d.owner_name || '').toLowerCase().includes(search) ||
        (d.owner_email || '').toLowerCase().includes(search) ||
        (d.tags || []).some(t => t.toLowerCase().includes(search))
      );
    }
    if (typeFilter) {
      filtered = filtered.filter(d => d.doc_type === typeFilter);
    }

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-on-surface-variant text-sm">No se encontraron documentos.</td></tr>';
      return;
    }

    const typeLabels = { support: 'Support', project: 'Project', evaluation: 'Evaluation', call: 'Call' };
    const typeBadge = (t) => {
      const cls = {
        support: 'bg-primary/8 text-primary',
        project: 'bg-tertiary/10 text-tertiary',
        evaluation: 'bg-warning/10 text-warning',
        call: 'bg-secondary/10 text-secondary',
      };
      return `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-medium ${cls[t] || cls.support}">${typeLabels[t] || t || 'Support'}</span>`;
    };

    const fmtSize = (b) => {
      if (!b) return '-';
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
      return (b / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

    const esc = (s) => { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

    tbody.innerHTML = filtered.map(d => {
      const tags = (d.tags || []).map(t => `<span class="inline-block px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">${esc(t)}</span>`).join(' ');
      const owner = d.owner_name
        ? `<span title="${esc(d.owner_email)}">${esc(d.owner_name)}</span>`
        : (d.owner_type === 'platform' ? '<span class="text-primary font-medium">Plataforma</span>' : '-');
      const vecIcon = d.vectorized
        ? '<span class="material-symbols-outlined text-[16px] text-green-600" title="Vectorizado">check_circle</span>'
        : '<span class="material-symbols-outlined text-[16px] text-on-surface-variant/40" title="No vectorizado">cancel</span>';
      const projects = (d.projects || []).map(p => `<span class="inline-block px-1.5 py-0.5 rounded bg-tertiary/10 text-tertiary text-[10px]">${esc(p.name)}</span>`).join(' ') || '<span class="text-on-surface-variant/40">—</span>';

      return `<tr class="border-b border-outline-variant/10 hover:bg-surface-container-low/50">
        <td class="px-4 py-3 font-medium text-on-surface max-w-[200px] truncate" title="${esc(d.title)}">${esc(d.title)}</td>
        <td class="px-4 py-3">${typeBadge(d.doc_type)}</td>
        <td class="px-4 py-3">${owner}</td>
        <td class="px-4 py-3">${tags || '-'}</td>
        <td class="px-4 py-3 text-center">${vecIcon}</td>
        <td class="px-4 py-3">${projects}</td>
        <td class="px-4 py-3 text-on-surface-variant">${fmtSize(d.file_size_bytes)}</td>
        <td class="px-4 py-3 text-on-surface-variant">${fmtDate(d.created_at)}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-1">
            <button class="adm-doc-download p-1 rounded hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors" data-id="${d.id}" title="Descargar">
              <span class="material-symbols-outlined text-[16px]">download</span>
            </button>
            <button class="adm-doc-delete p-1 rounded hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors" data-id="${d.id}" title="Eliminar">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // Bind actions
    tbody.querySelectorAll('.adm-doc-download').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const res = await fetch(`/v1/documents/download/${btn.dataset.id}`, {
            headers: { 'Authorization': `Bearer ${API.getToken()}` },
          });
          if (!res.ok) throw new Error('Download failed');
          const blob = await res.blob();
          const disp = res.headers.get('Content-Disposition') || '';
          const m = disp.match(/filename="?(.+?)"?$/);
          const fname = m ? decodeURIComponent(m[1]) : 'document';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fname;
          a.click();
          URL.revokeObjectURL(a.href);
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    });
    tbody.querySelectorAll('.adm-doc-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este documento?')) return;
        try {
          await API.del('/documents/my/' + btn.dataset.id);
          Toast.show('Documento eliminado', 'ok');
          loadAllDocs();
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    });
  }

  function bindAllDocsFilters() {
    const search = document.getElementById('admin-docs-search');
    const typeFilter = document.getElementById('admin-docs-filter-type');
    if (!search || search._bound) return;
    search._bound = true;

    let debounce;
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderAllDocs(), 300);
    });
    typeFilter.addEventListener('change', () => renderAllDocs());
  }

  /* ══════════════════════════════════════════════════════════════
     PLATFORM DOCS — official documents management
     ══════════════════════════════════════════════════════════════ */

  let platformDocs = [];

  async function loadPlatformDocs() {
    const container = document.getElementById('admin-docs-list');
    container.innerHTML = '<p class="text-center py-8 text-on-surface-variant text-sm">Loading...</p>';
    try {
      platformDocs = await API.get('/documents/official');
      renderPlatformDocs();
    } catch (e) {
      container.innerHTML = `<p class="text-center py-8 text-red-500 text-sm">Error: ${e.message}</p>`;
    }
    bindAdminDocUpload();
  }

  function renderPlatformDocs() {
    const container = document.getElementById('admin-docs-list');
    if (!platformDocs.length) {
      container.innerHTML = `<div class="text-center py-8 text-on-surface-variant">
        <span class="material-symbols-outlined text-[36px] opacity-30">description</span>
        <p class="mt-2 text-sm">No hay documentos oficiales aún.</p>
      </div>`;
      return;
    }
    container.innerHTML = platformDocs.map(d => {
      const tags = (d.tags || []).map(t => `<span class="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">${t}</span>`).join(' ');
      const size = d.file_size_bytes ? `${(d.file_size_bytes / 1024).toFixed(0)} KB` : '';
      const date = new Date(d.created_at).toLocaleDateString('es-ES');
      return `<div class="flex items-center gap-4 p-3 rounded-lg hover:bg-surface-container-low transition-colors border border-outline-variant/20 mb-2">
        <span class="material-symbols-outlined text-[28px] text-primary/60">description</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-on-surface truncate">${d.title}</p>
          <p class="text-xs text-on-surface-variant">${d.file_type || ''} · ${size} · ${date}</p>
          <div class="flex gap-1 mt-1">${tags}</div>
        </div>
        <button class="admin-doc-delete text-on-surface-variant hover:text-red-500 transition-colors" data-id="${d.id}" title="Eliminar">
          <span class="material-symbols-outlined text-[20px]">delete</span>
        </button>
      </div>`;
    }).join('');

    container.querySelectorAll('.admin-doc-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este documento?')) return;
        try {
          await API.del('/documents/official/' + btn.dataset.id);
          Toast.show('Documento eliminado', 'ok');
          loadPlatformDocs();
        } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
      });
    });
  }

  function bindAdminDocUpload() {
    const btn = document.getElementById('btn-admin-upload-doc');
    const modal = document.getElementById('admin-doc-upload-modal');
    const cancel = document.getElementById('btn-cancel-admin-upload');
    const form = document.getElementById('admin-doc-upload-form');
    if (!btn || btn._bound) return;
    btn._bound = true;

    btn.addEventListener('click', () => modal.classList.remove('hidden'));
    cancel.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    const stripExt = n => n.replace(/\.[^.]+$/, '');
    const fileInput = document.getElementById('admin-doc-file');
    const titleInput = document.getElementById('admin-doc-title');
    fileInput?.addEventListener('change', () => {
      const files = fileInput.files;
      if (!titleInput) return;
      if (files.length === 1) {
        titleInput.value = stripExt(files[0].name);
        titleInput.disabled = false;
        titleInput.placeholder = 'Auto desde nombre del archivo';
      } else if (files.length > 1) {
        titleInput.value = '';
        titleInput.disabled = true;
        titleInput.placeholder = `${files.length} archivos — se usará el nombre de cada uno`;
      }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const files = Array.from(fileInput.files);
      if (!files.length) return;

      const titleOverride = files.length === 1 ? titleInput.value : '';
      const description = document.getElementById('admin-doc-desc').value;
      const tags = document.getElementById('admin-doc-tags').value;

      const progEl = document.getElementById('admin-doc-progress');
      const submitBtn = document.getElementById('admin-doc-submit-btn');
      const submitLbl = document.getElementById('admin-doc-submit-label');
      const escTxt = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

      progEl.classList.remove('hidden');
      progEl.innerHTML = `
        <div id="admin-prog-summary" class="text-xs font-bold mb-2 flex items-center gap-2">
          <span class="material-symbols-outlined text-base animate-spin text-primary">sync</span>
          <span>Procesando 0 / ${files.length}</span>
        </div>
        <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          ${files.map((f, i) => `
            <div class="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-surface-container-low" data-prog-idx="${i}">
              <span class="prog-icon material-symbols-outlined text-on-surface-variant/50 text-base">schedule</span>
              <span class="flex-1 truncate" title="${escTxt(f.name)}">${escTxt(f.name)}</span>
              <span class="prog-status text-[10px] text-on-surface-variant/70 font-medium">en cola</span>
            </div>`).join('')}
        </div>`;

      const updateRow = (i, status, label) => {
        const row = progEl.querySelector(`[data-prog-idx="${i}"]`);
        if (!row) return;
        const icon = row.querySelector('.prog-icon');
        const stat = row.querySelector('.prog-status');
        if (status === 'uploading') {
          icon.textContent = 'sync'; icon.className = 'prog-icon material-symbols-outlined text-primary text-base animate-spin';
          stat.textContent = 'subiendo...'; stat.className = 'prog-status text-[10px] text-primary font-bold';
        } else if (status === 'done') {
          icon.textContent = 'check_circle'; icon.className = 'prog-icon material-symbols-outlined text-green-600 text-base';
          stat.textContent = label || 'subido'; stat.className = 'prog-status text-[10px] text-green-700 font-bold';
        } else if (status === 'failed') {
          icon.textContent = 'error'; icon.className = 'prog-icon material-symbols-outlined text-red-600 text-base';
          stat.textContent = label || 'fallo'; stat.className = 'prog-status text-[10px] text-red-700 font-bold';
        }
      };

      submitBtn.disabled = true;
      fileInput.disabled = true;
      if (titleInput) titleInput.disabled = true;

      let ok = 0, fail = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        submitLbl.textContent = `Subiendo ${i + 1}/${files.length}...`;
        document.getElementById('admin-prog-summary').querySelector('span:last-child').textContent = `Procesando ${i + 1} / ${files.length} — ${file.name}`;
        updateRow(i, 'uploading');
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', titleOverride || stripExt(file.name));
        fd.append('description', description);
        fd.append('tags', tags);
        fd.append('ownerType', 'platform');
        try {
          const res = await fetch('/v1/documents/official', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + API.getToken() },
            body: fd
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error?.message || 'Upload failed');
          ok++;
          updateRow(i, 'done');
        } catch (err) {
          fail++;
          updateRow(i, 'failed', err.message.slice(0, 40));
        }
      }

      const summary = document.getElementById('admin-prog-summary');
      summary.innerHTML = fail
        ? `<span class="material-symbols-outlined text-base text-red-600">error</span><span class="text-red-700">Completado: ${ok} subido(s) · ${fail} fallido(s)</span>`
        : `<span class="material-symbols-outlined text-base text-green-600">task_alt</span><span class="text-green-700">${ok} documento(s) subido(s)</span>`;

      submitBtn.disabled = false;
      fileInput.disabled = false;
      if (titleInput) { titleInput.disabled = false; titleInput.placeholder = 'Auto desde nombre del archivo'; }
      submitLbl.textContent = 'Subir';
      form.reset();
      loadPlatformDocs();
      // Auto-close modal after 2s if all OK; keep open if there were failures
      if (!fail) setTimeout(() => { modal.classList.add('hidden'); progEl.classList.add('hidden'); progEl.innerHTML = ''; }, 1800);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     Admin Library — search OpenAlex & manage research library
     ═══════════════════════════════════════════════════════════════ */

  let libResults = null;
  let libPage = 1;
  let libTab = 'search';
  let libInitialized = false;

  function loadAdminLibrary() {
    if (!libInitialized) {
      bindLibraryEvents();
      libInitialized = true;
    }
    loadLibraryStats();
    showLibTab('saved');
  }

  function bindLibraryEvents() {
    document.getElementById('library-search-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      libPage = 1;
      searchLibrary();
    });
    document.getElementById('library-tab-search')?.addEventListener('click', () => showLibTab('search'));
    document.getElementById('library-tab-saved')?.addEventListener('click', () => showLibTab('saved'));
    document.getElementById('library-prev')?.addEventListener('click', () => { if (libPage > 1) { libPage--; searchLibrary(); } });
    document.getElementById('library-next')?.addEventListener('click', () => { libPage++; searchLibrary(); });
    document.getElementById('btn-process-all-sources')?.addEventListener('click', async () => {
      try {
        await API.post('/research/process-all');
        Toast.show('Vectorization started for all pending OA sources', 'ok');
      } catch (e) { Toast.show(e.message, 'error'); }
    });
  }

  function showLibTab(tab) {
    libTab = tab;
    const searchTab = document.getElementById('library-tab-search');
    const savedTab = document.getElementById('library-tab-saved');
    const searchList = document.getElementById('library-search-results');
    const savedList = document.getElementById('library-saved-list');
    const pagination = document.getElementById('library-pagination');

    if (tab === 'search') {
      searchTab.classList.add('font-bold', 'text-primary', 'border-b-2', 'border-primary');
      savedTab.classList.remove('font-bold', 'text-primary', 'border-b-2', 'border-primary');
      searchList.classList.remove('hidden');
      savedList.classList.add('hidden');
      if (libResults) pagination.classList.remove('hidden');
    } else {
      savedTab.classList.add('font-bold', 'text-primary', 'border-b-2', 'border-primary');
      searchTab.classList.remove('font-bold', 'text-primary', 'border-b-2', 'border-primary');
      searchList.classList.add('hidden');
      savedList.classList.remove('hidden');
      pagination.classList.add('hidden');
      loadLibrarySaved();
    }
  }

  async function loadLibraryStats() {
    try {
      const sources = await API.get('/research/library');
      document.getElementById('library-count').textContent = sources.length;
      document.getElementById('library-stats').textContent = `${sources.length} sources in library`;
    } catch (_) {}
  }

  async function searchLibrary() {
    const q = document.getElementById('library-search-query').value.trim();
    if (!q) return;

    const params = new URLSearchParams({ q, page: libPage, per_page: 20, open_access: '1' });
    const country = document.getElementById('library-search-country').value;
    if (country) params.set('country', country);
    if (!document.getElementById('library-search-oa').checked) params.delete('open_access');

    const container = document.getElementById('library-search-results');
    container.innerHTML = '<div class="text-center py-8 text-on-surface-variant text-sm">Searching OpenAlex...</div>';

    try {
      const data = await API.get(`/research/search?${params}`);
      libResults = data;
      showLibTab('search');

      if (!data.results.length) {
        container.innerHTML = '<div class="text-center py-8 text-on-surface-variant text-sm">No results found.</div>';
        document.getElementById('library-pagination').classList.add('hidden');
        return;
      }

      container.innerHTML = data.results.map((r, i) => `
        <div class="flex items-start gap-3 py-3 ${i > 0 ? 'border-t border-outline-variant/10' : ''}">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5 flex-wrap">
              ${r.is_open_access ? '<span class="text-[10px] font-bold text-green-600">OA</span>' : '<span class="text-[10px] text-on-surface-variant/50">Closed</span>'}
              <span class="text-[11px] text-on-surface-variant">${r.publication_year || ''}</span>
              ${r.citation_count ? `<span class="text-[11px] text-on-surface-variant">Cited: ${r.citation_count}</span>` : ''}
            </div>
            <h4 class="text-xs font-bold text-on-surface leading-snug">${esc(r.title)}</h4>
            ${r.abstract ? `<p class="text-[11px] text-on-surface-variant/70 mt-0.5 line-clamp-1">${esc(r.abstract.slice(0, 200))}</p>` : ''}
            ${r.topics?.length ? `<div class="flex flex-wrap gap-1 mt-1">${r.topics.slice(0, 3).map(t => `<span class="inline-block px-1 py-0.5 rounded bg-primary/8 text-primary text-[9px]">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="flex-shrink-0">
            ${r.saved_id
              ? '<span class="text-[11px] text-green-600 font-medium">Saved</span>'
              : `<button class="lib-save-btn px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors" data-idx="${i}">+ Add</button>`
            }
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.lib-save-btn').forEach(btn => {
        btn.addEventListener('click', () => addToLibrary(parseInt(btn.dataset.idx)));
      });

      // Pagination
      const totalPages = Math.ceil(data.total / data.perPage);
      const pg = document.getElementById('library-pagination');
      if (totalPages > 1) {
        pg.classList.remove('hidden');
        document.getElementById('library-page-info').textContent = `${data.page} / ${totalPages}`;
        document.getElementById('library-prev').disabled = data.page <= 1;
        document.getElementById('library-next').disabled = data.page >= totalPages;
      } else {
        pg.classList.add('hidden');
      }
    } catch (e) {
      container.innerHTML = `<div class="text-center py-8 text-error text-sm">${esc(e.message)}</div>`;
    }
  }

  async function addToLibrary(idx) {
    const r = libResults?.results?.[idx];
    if (!r) return;
    try {
      const saved = await API.post('/research/sources', {
        external_id: r.external_id, source_api: 'openalex',
        title: r.title, authors: r.authors, publication_year: r.publication_year,
        abstract: r.abstract, url: r.url, pdf_url: r.pdf_url,
        language: r.language, is_open_access: r.is_open_access,
        citation_count: r.citation_count, topics: r.topics,
      });
      r.saved_id = saved.id;
      searchLibrary(); // re-render
      loadLibraryStats();
      Toast.show('Added to library', 'ok');
    } catch (e) { Toast.show(e.message, 'error'); }
  }

  async function loadLibrarySaved() {
    const container = document.getElementById('library-saved-list');
    container.innerHTML = '<div class="text-center py-8 text-on-surface-variant text-sm">Loading...</div>';
    try {
      const sources = await API.get('/research/sources?all=true');
      if (!sources.length) {
        container.innerHTML = '<div class="text-center py-8 text-on-surface-variant text-sm">Library is empty. Search and add sources above.</div>';
        return;
      }
      container.innerHTML = sources.map((s, i) => `
        <div class="flex items-start gap-3 py-3 ${i > 0 ? 'border-t border-outline-variant/10' : ''}">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5 flex-wrap">
              ${s.is_open_access ? '<span class="text-[10px] font-bold text-green-600">OA</span>' : ''}
              <span class="text-[11px] text-on-surface-variant">${s.publication_year || ''}</span>
              <span class="text-[10px] px-1 py-0.5 rounded ${s.source_api === 'upload' ? 'bg-purple-500/10 text-purple-600' : 'bg-blue-500/10 text-blue-600'}">${s.source_api === 'upload' ? 'Uploaded' : 'OpenAlex'}</span>
              ${s.status === 'vectorized'
                ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-bold">Vectorized</span>'
                : s.status === 'error'
                  ? `<button class="lib-vectorize-btn text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error font-medium hover:bg-error/20 cursor-pointer" data-id="${s.id}">Error — Retry</button>`
                  : s.pdf_url || s.source_api === 'upload'
                    ? `<button class="lib-vectorize-btn text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium hover:bg-amber-500/20 cursor-pointer" data-id="${s.id}">Vectorize</button>`
                    : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant/50">No PDF</span>'
              }
            </div>
            <h4 class="text-xs font-bold text-on-surface leading-snug">${esc(s.title)}</h4>
            ${s.topics?.length ? `<div class="flex flex-wrap gap-1 mt-1">${s.topics.slice(0, 4).map(t => `<span class="inline-block px-1 py-0.5 rounded bg-primary/8 text-primary text-[9px]">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
          <button class="lib-del-btn flex-shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors" data-id="${s.id}">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      `).join('');

      container.querySelectorAll('.lib-vectorize-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.textContent = 'Processing...';
          btn.disabled = true;
          try {
            await API.post(`/research/sources/${btn.dataset.id}/download`);
            Toast.show('Download & vectorization started', 'ok');
            setTimeout(() => { loadLibrarySaved(); loadLibraryStats(); }, 4000);
          } catch (e) { Toast.show(e.message, 'error'); btn.textContent = 'Retry'; btn.disabled = false; }
        });
      });

      container.querySelectorAll('.lib-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Remove from library?')) return;
          try {
            await API.del(`/research/sources/${btn.dataset.id}`);
            Toast.show('Removed', 'ok');
            loadLibrarySaved();
            loadLibraryStats();
          } catch (e) { Toast.show(e.message, 'error'); }
        });
      });
    } catch (e) {
      container.innerHTML = `<div class="text-center py-8 text-error text-sm">${esc(e.message)}</div>`;
    }
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ══ FORMULARIOS INTERACTIVOS ═══════════════════════════════════ */

  let fm = { programId: null, programName: '', templateId: null, instanceId: null, template: null, values: {}, activeSection: null };

  function formsShowView(v) {
    document.querySelectorAll('#admin-sec-forms .forms-view').forEach(el => el.classList.add('hidden'));
    document.getElementById(`forms-view-${v}`)?.classList.remove('hidden');
  }

  async function loadForms() {
    formsShowView('list');
    const list = document.getElementById('forms-program-list');
    list.innerHTML = '<p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Loading...</p>';
    try {
      const templates = await API.get('/admin/data/forms/templates');
      if (!templates.length) { list.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">No form templates found.</p>'; return; }
      list.innerHTML = templates.map(t => `
        <div class="forms-tpl-card group flex items-center gap-4 p-5 bg-white rounded-2xl border border-outline-variant/30 hover:border-primary hover:shadow-lg cursor-pointer transition-all" data-id="${t.id}">
          <div class="w-12 h-12 rounded-xl ${t.active ? 'bg-[#1b1464]' : 'bg-gray-300'} flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-white text-xl">article</span>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-primary truncate">${esc(t.name)}</h3>
            <p class="text-xs text-on-surface-variant">${esc(t.description || '')}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="px-2 py-1 rounded-lg text-[10px] font-bold ${t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${t.active ? 'Active' : 'Inactive'}</span>
            <span class="px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-bold">v${esc(t.version)}</span>
            <span class="px-2 py-1 rounded-lg bg-primary/5 text-primary text-[10px] font-bold">${t.year || '—'}</span>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">chevron_right</span>
        </div>`).join('');

      list.querySelectorAll('.forms-tpl-card').forEach(card => {
        card.addEventListener('click', () => formsOpenTemplateView(card.dataset.id));
      });
    } catch (e) { list.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`; }
  }

  async function formsOpenTemplateView(templateId) {
    fm.templateId = templateId;
    formsShowView('editor');
    document.getElementById('forms-back-instances').onclick = () => loadForms();
    document.getElementById('forms-save-all').classList.add('hidden');

    const sidebar = document.getElementById('forms-sidebar');
    const content = document.getElementById('forms-main-content');
    content.innerHTML = '<p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Loading...</p>';

    try {
      const tpl = await API.get('/admin/data/forms/templates/' + templateId);
      fm.template = tpl.template_json;
      fm.values = {};
      fm.instanceId = null;
      document.getElementById('forms-editor-title').textContent = tpl.name + ' — v' + tpl.version + ' (' + (tpl.year || '') + ')';

      // Hub sidebar: Form + Documents
      sidebar.innerHTML = `<div class="space-y-0.5 sticky top-0">
        <div class="forms-hub-item flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer bg-[#1b1464] text-white font-bold text-xs" data-view="form">
          <span class="material-symbols-outlined text-sm">article</span>
          <span>View Form</span>
        </div>
        <div class="forms-hub-item flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer text-primary/70 hover:bg-primary/5 text-xs" data-view="docs">
          <span class="material-symbols-outlined text-sm">folder_open</span>
          <span>Call Documents</span>
        </div>
      </div>`;

      // Show form overview by default
      formsShowCallHub(tpl, 'form');

      sidebar.querySelectorAll('.forms-hub-item').forEach(el => {
        el.addEventListener('click', () => {
          sidebar.querySelectorAll('.forms-hub-item').forEach(b => {
            b.className = b.className.replace('bg-[#1b1464] text-white font-bold', 'text-primary/70 hover:bg-primary/5');
          });
          el.className = el.className.replace('text-primary/70 hover:bg-primary/5', 'bg-[#1b1464] text-white font-bold');
          formsShowCallHub(tpl, el.dataset.view);
        });
      });
    } catch (e) { content.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`; }
  }

  function formsShowCallHub(tpl, view) {
    const content = document.getElementById('forms-main-content');

    if (view === 'form') {
      // Show full interactive form with sidebar navigation
      const sidebar = document.getElementById('forms-sidebar');

      // Rebuild sidebar with hub items + form nav
      const tmpl = fm.template;
      const navItems = [];
      navItems.push({ id: '__cover', label: 'Cover Page', icon: 'badge' });
      navItems.push({ id: '__summary', label: 'Project Summary', icon: 'summarize' });
      if (tmpl.sections) {
        for (const sec of tmpl.sections) {
          navItems.push({ id: sec.id, label: `${sec.number}. ${sec.title}`, icon: 'folder', level: 0 });
          for (const sub of (sec.subsections || [])) {
            navItems.push({ id: sub.id, label: `${sub.number} ${sub.title}`, icon: 'article', level: 1 });
          }
          for (const grp of (sec.subsections_groups || [])) {
            for (const sub of (grp.subsections || [])) {
              navItems.push({ id: sub.id, label: `${sub.number} ${sub.title}`, icon: 'article', level: 1 });
            }
          }
        }
      }
      if (tmpl.annexes) navItems.push({ id: '__annexes', label: 'Annexes', icon: 'attach_file' });

      if (!fm.activeSection) fm.activeSection = navItems[0]?.id;

      sidebar.innerHTML = `<div class="space-y-0.5 sticky top-0">
        <div class="forms-hub-item flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer bg-primary/10 text-primary font-bold text-xs mb-1" data-view="docs">
          <span class="material-symbols-outlined text-sm">folder_open</span>
          <span>Call Documents</span>
        </div>
        <div class="mx-3 my-2 border-b border-primary/10"></div>
        ${navItems.map(it => `
        <div class="forms-nav-item flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all text-xs ${fm.activeSection === it.id ? 'bg-[#1b1464] text-white font-bold' : 'text-primary/70 hover:bg-primary/5'}"
             data-sid="${it.id}" style="${it.level ? 'padding-left:'+(12 + it.level * 12)+'px' : ''}">
          <span class="material-symbols-outlined text-sm">${it.icon}</span>
          <span class="truncate">${esc(it.label)}</span>
        </div>`).join('')}
      </div>`;

      // Bind nav clicks
      sidebar.querySelectorAll('.forms-nav-item').forEach(el => {
        el.addEventListener('click', () => {
          fm.activeSection = el.dataset.sid;
          formsShowCallHub(tpl, 'form');
        });
      });
      sidebar.querySelector('.forms-hub-item[data-view="docs"]')?.addEventListener('click', () => {
        fm.activeSection = null;
        formsShowCallHub(tpl, 'docs');
      });

      // Render active section
      const secData = formsFindSection(fm.activeSection);
      if (secData) formsRenderSection(secData);
    } else if (view === 'docs') {
      // Rebuild sidebar to just show hub items
      const sidebar = document.getElementById('forms-sidebar');
      sidebar.innerHTML = `<div class="space-y-0.5 sticky top-0">
        <div class="forms-hub-item flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer text-primary/70 hover:bg-primary/5 text-xs" data-view="form">
          <span class="material-symbols-outlined text-sm">article</span>
          <span>View Form</span>
        </div>
        <div class="forms-hub-item flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer bg-[#1b1464] text-white font-bold text-xs" data-view="docs">
          <span class="material-symbols-outlined text-sm">folder_open</span>
          <span>Call Documents</span>
        </div>
      </div>`;
      sidebar.querySelectorAll('.forms-hub-item').forEach(el => {
        el.addEventListener('click', () => formsShowCallHub(tpl, el.dataset.view));
      });

      content.innerHTML = `
        <div class="flex items-center gap-3 mb-5">
          <div class="w-2 h-10 rounded-full bg-primary"></div>
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-primary">Call Knowledge Base</div>
            <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">Call Documents</h3>
          </div>
        </div>
        <p class="text-sm text-on-surface-variant mb-4">Documents uploaded here are vectorized and available as AI knowledge base. They also appear in Docs oficiales.</p>

        <!-- Upload form -->
        <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest mb-5">
          <h4 class="text-xs font-bold uppercase text-on-surface-variant mb-3">Upload document</h4>
          <form id="call-doc-upload-form" class="space-y-3">
            <input type="file" id="call-doc-file" accept=".pdf,.docx,.txt,.csv,.xlsx" required multiple
              class="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#1b1464] file:text-[#fbff12] file:cursor-pointer">
            <div class="grid grid-cols-2 gap-3">
              <input type="text" id="call-doc-title" placeholder="Title (auto from filename)"
                class="px-3 py-2 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
              <input type="text" id="call-doc-tags" placeholder="Tags (comma separated)"
                class="px-3 py-2 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
            </div>
            <textarea id="call-doc-desc" rows="2" placeholder="Description..."
              class="w-full px-3 py-2 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"></textarea>
            <button id="call-doc-submit-btn" type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="material-symbols-outlined text-sm">cloud_upload</span>
              <span id="call-doc-submit-label">Upload & vectorize</span>
            </button>
          </form>
          <div id="call-doc-progress" class="hidden mt-3 pt-3 border-t border-outline-variant/20"></div>
        </div>

        <!-- Document list -->
        <div id="call-docs-list"><p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Loading...</p></div>`;

      // Load docs linked to programs using this template
      formsLoadCallDocs();

      // Auto-fill title from filename when 1 file picked
      const stripExt = n => n.replace(/\.[^.]+$/, '');
      document.getElementById('call-doc-file')?.addEventListener('change', (e) => {
        const files = e.target.files;
        const titleEl = document.getElementById('call-doc-title');
        if (!titleEl) return;
        if (files.length === 1) {
          titleEl.value = stripExt(files[0].name);
          titleEl.disabled = false;
          titleEl.placeholder = 'Title (auto from filename)';
        } else if (files.length > 1) {
          titleEl.value = '';
          titleEl.disabled = true;
          titleEl.placeholder = `${files.length} archivos — se usará el nombre de cada uno`;
        }
      });

      // Bind upload (loop for multi-file with per-file progress)
      document.getElementById('call-doc-upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const files = Array.from(document.getElementById('call-doc-file').files);
        if (!files.length) return;

        // Find first program linked to this template
        const programs = await API.get('/admin/data/programs');
        const linked = programs.find(p => p.form_template_id === fm.templateId);
        if (!linked) { Toast.show('No programme linked to this template', 'error'); return; }

        const titleOverride = files.length === 1 ? document.getElementById('call-doc-title').value : '';
        const description = document.getElementById('call-doc-desc').value;
        const tags = document.getElementById('call-doc-tags').value;

        const progEl = document.getElementById('call-doc-progress');
        const submitBtn = document.getElementById('call-doc-submit-btn');
        const submitLbl = document.getElementById('call-doc-submit-label');
        const fileInput = document.getElementById('call-doc-file');
        const titleInput = document.getElementById('call-doc-title');

        progEl.classList.remove('hidden');
        progEl.innerHTML = `
          <div id="call-prog-summary" class="text-xs font-bold text-on-surface-variant mb-2 flex items-center gap-2">
            <span class="material-symbols-outlined text-base animate-spin text-primary">sync</span>
            <span>Procesando 0 / ${files.length}</span>
          </div>
          <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            ${files.map((f, i) => `
              <div class="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white/40" data-prog-idx="${i}">
                <span class="prog-icon material-symbols-outlined text-on-surface-variant/50 text-base">schedule</span>
                <span class="flex-1 truncate" title="${esc(f.name)}">${esc(f.name)}</span>
                <span class="prog-status text-[10px] text-on-surface-variant/70 font-medium">en cola</span>
              </div>`).join('')}
          </div>`;

        const updateRow = (i, status, label) => {
          const row = progEl.querySelector(`[data-prog-idx="${i}"]`);
          if (!row) return;
          const icon = row.querySelector('.prog-icon');
          const stat = row.querySelector('.prog-status');
          if (status === 'uploading') {
            icon.textContent = 'sync'; icon.className = 'prog-icon material-symbols-outlined text-primary text-base animate-spin';
            stat.textContent = 'subiendo...'; stat.className = 'prog-status text-[10px] text-primary font-bold';
          } else if (status === 'done') {
            icon.textContent = 'check_circle'; icon.className = 'prog-icon material-symbols-outlined text-green-600 text-base';
            stat.textContent = label || 'subido · vectorizando'; stat.className = 'prog-status text-[10px] text-green-700 font-bold';
          } else if (status === 'failed') {
            icon.textContent = 'error'; icon.className = 'prog-icon material-symbols-outlined text-red-600 text-base';
            stat.textContent = label || 'fallo'; stat.className = 'prog-status text-[10px] text-red-700 font-bold';
          }
        };

        submitBtn.disabled = true;
        fileInput.disabled = true;
        if (titleInput) titleInput.disabled = true;

        let ok = 0, fail = 0;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          submitLbl.textContent = `Uploading ${i + 1}/${files.length}...`;
          document.getElementById('call-prog-summary').querySelector('span:last-child').textContent = `Procesando ${i + 1} / ${files.length} — ${file.name}`;
          updateRow(i, 'uploading');
          const fd = new FormData();
          fd.append('file', file);
          fd.append('title', titleOverride || stripExt(file.name));
          fd.append('description', description);
          fd.append('tags', tags);
          fd.append('doc_type', 'call');
          fd.append('program_id', linked.id);
          try {
            const res = await fetch('/v1/documents/official', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + API.getToken() },
              body: fd
            });
            const json = await res.json();
            if (!json.ok) throw new Error(json.error?.message || 'Upload failed');
            ok++;
            updateRow(i, 'done');
          } catch (err) {
            fail++;
            updateRow(i, 'failed', err.message.slice(0, 40));
          }
        }

        const summary = document.getElementById('call-prog-summary');
        summary.innerHTML = fail
          ? `<span class="material-symbols-outlined text-base text-red-600">error</span><span class="text-red-700">Completado: ${ok} subido(s) · ${fail} fallido(s)</span>`
          : `<span class="material-symbols-outlined text-base text-green-600">task_alt</span><span class="text-green-700">${ok} documento(s) subido(s) — vectorización en curso</span>`;

        submitBtn.disabled = false;
        fileInput.disabled = false;
        if (titleInput) { titleInput.disabled = false; titleInput.placeholder = 'Title (auto from filename)'; }
        submitLbl.textContent = 'Upload & vectorize';
        document.getElementById('call-doc-upload-form').reset();
        formsLoadCallDocs();
      });
    }
  }

  async function formsLoadCallDocs() {
    const container = document.getElementById('call-docs-list');
    try {
      const allDocs = await API.get('/documents/official');
      // Filter to docs linked to programs using this template
      const programs = await API.get('/admin/data/programs');
      const linkedProgramIds = programs.filter(p => p.form_template_id === fm.templateId).map(p => p.id);

      // Get program-doc links
      const docs = allDocs.filter(d => d.doc_type === 'call');

      if (!docs.length) {
        container.innerHTML = `<div class="text-center py-8 text-on-surface-variant/50">
          <span class="material-symbols-outlined text-4xl opacity-30">folder_off</span>
          <p class="mt-2 text-sm">No documents yet. Upload Programme Guide, call documents, etc.</p>
        </div>`;
        return;
      }

      container.innerHTML = docs.map(d => {
        const size = d.file_size_bytes ? `${(d.file_size_bytes / 1024).toFixed(0)} KB` : '';
        const date = new Date(d.created_at).toLocaleDateString();
        const statusIcon = d.status === 'active' ? 'check_circle' : d.status === 'processing' ? 'sync' : 'error';
        const statusColor = d.status === 'active' ? 'text-green-500' : d.status === 'processing' ? 'text-blue-500' : 'text-red-500';
        const tags = (d.tags || []).map(t => `<span class="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">${esc(t)}</span>`).join(' ');
        return `<div class="flex items-center gap-4 p-4 rounded-xl bg-white border border-outline-variant/20 mb-2 hover:border-primary/30 transition-colors">
          <span class="material-symbols-outlined text-2xl text-primary/50">description</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-on-surface truncate">${esc(d.title)}</p>
            <p class="text-xs text-on-surface-variant">${d.file_type || ''} · ${size} · ${date}</p>
            ${tags ? `<div class="flex gap-1 mt-1">${tags}</div>` : ''}
          </div>
          <span class="material-symbols-outlined ${statusColor}" title="${d.status}">${statusIcon}</span>
          <button class="call-doc-delete text-on-surface-variant/30 hover:text-error transition-colors" data-id="${d.id}">
            <span class="material-symbols-outlined text-lg">delete</span>
          </button>
        </div>`;
      }).join('');

      container.querySelectorAll('.call-doc-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this document?')) return;
          try {
            await API.del('/documents/official/' + btn.dataset.id);
            Toast.show('Document deleted', 'ok');
            formsLoadCallDocs();
          } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
        });
      });
    } catch (e) { container.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`; }
  }

  async function formsOpenEditor(instanceId) {
    fm.instanceId = instanceId;
    formsShowView('editor');
    document.getElementById('forms-back-instances').onclick = () => loadForms();
    document.getElementById('forms-save-all').classList.remove('hidden');

    const content = document.getElementById('forms-main-content');
    content.innerHTML = '<p class="text-sm text-on-surface-variant py-4"><span class="spinner"></span> Loading form...</p>';

    try {
      const inst = await API.get('/admin/data/forms/instances/' + instanceId);
      fm.template = inst.template_json;
      fm.values = await API.get('/admin/data/forms/instances/' + instanceId + '/values') || {};
      document.getElementById('forms-editor-title').textContent = inst.title || inst.program_name + ' — Form';

      // Build sidebar from template sections
      formsRenderSidebar();
      // Render first section by default
      const firstSec = fm.template.sections?.[0];
      if (firstSec) {
        fm.activeSection = firstSec.id;
        formsRenderSection(firstSec);
      }

      // Save all handler
      document.getElementById('forms-save-all').onclick = () => formsSaveAll();
    } catch (e) { content.innerHTML = `<p class="text-red-500 text-sm">${e.message}</p>`; }
  }

  function formsRenderSidebar() {
    const sidebar = document.getElementById('forms-sidebar');
    const tpl = fm.template;
    const items = [];

    // Cover page + summary
    items.push({ id: '__cover', label: 'Cover Page', icon: 'badge' });
    items.push({ id: '__summary', label: 'Project Summary', icon: 'summarize' });

    // Main sections
    if (tpl.sections) {
      for (const sec of tpl.sections) {
        items.push({ id: sec.id, label: `${sec.number}. ${sec.title}`, icon: 'folder', level: 0 });
        // Subsections
        const subs = sec.subsections || [];
        const groups = sec.subsections_groups || [];
        for (const sub of subs) {
          items.push({ id: sub.id, label: `${sub.number} ${sub.title}`, icon: 'article', level: 1 });
        }
        for (const grp of groups) {
          for (const sub of (grp.subsections || [])) {
            items.push({ id: sub.id, label: `${sub.number} ${sub.title}`, icon: 'article', level: 1 });
          }
        }
      }
    }

    // Annexes
    if (tpl.annexes) items.push({ id: '__annexes', label: 'Annexes', icon: 'attach_file' });

    sidebar.innerHTML = `<div class="space-y-0.5 sticky top-0">${items.map(it => `
      <div class="forms-nav-item flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all text-xs ${fm.activeSection === it.id ? 'bg-[#1b1464] text-white font-bold' : 'text-primary/70 hover:bg-primary/5'}"
           data-sid="${it.id}" style="${it.level ? 'padding-left:'+(12 + it.level * 12)+'px' : ''}">
        <span class="material-symbols-outlined text-sm">${it.icon}</span>
        <span class="truncate">${esc(it.label)}</span>
      </div>`).join('')}</div>`;

    sidebar.querySelectorAll('.forms-nav-item').forEach(el => {
      el.addEventListener('click', () => {
        fm.activeSection = el.dataset.sid;
        formsRenderSidebar();
        // Find the section/subsection data
        const secData = formsFindSection(el.dataset.sid);
        if (secData) formsRenderSection(secData);
      });
    });
  }

  function formsFindSection(id) {
    const tpl = fm.template;
    if (id === '__cover') return { _special: 'cover', ...tpl.cover_page };
    if (id === '__summary') return { _special: 'summary', ...tpl.project_summary };
    if (id === '__annexes') return { _special: 'annexes', ...tpl.annexes };

    for (const sec of (tpl.sections || [])) {
      if (sec.id === id) return sec;
      for (const sub of (sec.subsections || [])) {
        if (sub.id === id) return sub;
      }
      for (const grp of (sec.subsections_groups || [])) {
        for (const sub of (grp.subsections || [])) {
          if (sub.id === id) return sub;
        }
      }
    }
    return null;
  }

  function formsRenderSection(sec) {
    const content = document.getElementById('forms-main-content');

    // Header
    let html = `<div class="flex items-center gap-3 mb-5">
      <div class="w-2 h-10 rounded-full bg-primary"></div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-widest text-primary">${sec.number ? 'Section ' + sec.number : (sec._special || 'Form')}</div>
        <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">${esc(sec.title)}</h3>
      </div>
    </div>`;

    // Guidance (collapsible)
    if (sec.guidance && Array.isArray(sec.guidance)) {
      html += `<details class="mb-4 rounded-xl bg-blue-50/50 border border-blue-100 group">
        <summary class="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
          <span class="material-symbols-outlined text-sm text-blue-400">info</span>
          <span class="text-xs font-bold text-blue-600 flex-1">Instructions & guidance</span>
          <span class="material-symbols-outlined text-sm text-blue-400 group-open:rotate-180 transition-transform">expand_more</span>
        </summary>
        <div class="px-4 pb-3">
          ${sec.guidance.map(g => `<p class="text-xs text-blue-800/70 mb-1">${esc(g)}</p>`).join('')}
        </div>
      </details>`;
    }

    // Fields
    html += '<div class="space-y-4">';

    if (sec.fields) {
      for (const f of sec.fields) {
        // Pre-seed risk table with 10 rows (R1-R10)
        if (f.id === 's2_1_5_risk_table' && f.type === 'table') {
          const riskKey = (sec.id || sec._special) + '.' + f.id;
          if (!fm.values[riskKey] || !fm.values[riskKey].length) {
            const cols = f.columns?.length || 4;
            fm.values[riskKey] = Array.from({ length: 10 }, (_, i) =>
              Array.from({ length: cols }, (_, ci) => ci === 0 ? `R${i + 1}` : '')
            );
          }
        }
        html += formsRenderField(f, sec.id || sec._special);
      }
    }

    // If section has subsections (parent section), show overview
    if (sec.subsections && !sec.fields) {
      html += `<p class="text-sm text-on-surface-variant py-4">Select a subsection from the sidebar to start editing.</p>`;
    }
    if (sec.subsections_groups) {
      html += `<p class="text-sm text-on-surface-variant py-4">Select a subsection from the sidebar to start editing.</p>`;
    }

    // Work package template
    if (sec.work_package_template) {
      html += formsRenderWorkPackages(sec);
    }

    // Additional tables
    if (sec.additional_tables) {
      for (const tbl of sec.additional_tables) {
        html += formsRenderTableField(tbl, sec.id);
      }
    }

    // Annexes tables
    if (sec.tables) {
      for (const tbl of sec.tables) {
        html += formsRenderTableField(tbl, '__annexes');
      }
    }

    html += '</div>';
    content.innerHTML = html;

    // Bind auto-collect on change
    content.querySelectorAll('.form-field-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.key;
        fm.values[key] = inp.value;
      });
    });

    // WP count change
    const wpCountInput = document.getElementById('forms-wp-count');
    if (wpCountInput) {
      wpCountInput.addEventListener('change', () => {
        const n = Math.max(2, Math.min(15, parseInt(wpCountInput.value) || 4));
        fm.values['__meta.wp_count'] = n;
        // Re-render this section
        const secData = formsFindSection(fm.activeSection);
        if (secData) formsRenderSection(secData);
      });
    }
  }

  function formsRenderField(f, sectionId) {
    const key = sectionId + '.' + f.id;
    const val = fm.values[key] || '';

    if (f.type === 'textarea') {
      return `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">${esc(f.label)}</label>
        ${f.guidance ? `<p class="text-xs text-on-surface-variant/70 mb-2">${Array.isArray(f.guidance) ? f.guidance.map(g => esc(g)).join(' ') : esc(f.guidance)}</p>` : ''}
        <textarea class="form-field-input w-full px-4 py-3 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-vertical min-h-[120px] leading-relaxed" data-key="${key}" rows="6" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>
      </div>`;
    }

    if (f.type === 'text' || f.type === 'email') {
      return `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">${esc(f.label)}</label>
        <input type="${f.type}" class="form-field-input w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" data-key="${key}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}">
      </div>`;
    }

    if (f.type === 'radio') {
      return `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">${esc(f.label)}</label>
        <div class="flex gap-4">${(f.options || []).map(o => `
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="${key}" value="${o}" class="form-field-input accent-primary" data-key="${key}" ${val === o ? 'checked' : ''}>
            <span class="text-sm">${o}</span>
          </label>`).join('')}
        </div>
      </div>`;
    }

    if (f.type === 'table') {
      return formsRenderTableField(f, sectionId);
    }

    return '';
  }

  function formsRenderTableField(f, sectionId) {
    const key = sectionId + '.' + f.id;
    const data = fm.values[key];
    const rows = Array.isArray(data) ? data : [];
    const cols = f.columns || [];

    return `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
      <div class="flex items-center justify-between mb-3">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">${esc(f.title || f.label)}</label>
        <button class="forms-add-row inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors" data-key="${key}" data-cols="${cols.length}">
          <span class="material-symbols-outlined text-sm">add</span> Add row
        </button>
      </div>
      ${f.guidance ? `<details class="mb-2 text-xs"><summary class="text-on-surface-variant/70 cursor-pointer select-none flex items-center gap-1"><span class="material-symbols-outlined text-xs">info</span> Instructions</summary><p class="mt-1 text-on-surface-variant/60 pl-4">${esc(typeof f.guidance === 'string' ? f.guidance : (Array.isArray(f.guidance) ? f.guidance.join(' ') : ''))}</p></details>` : ''}
      ${f.note ? `<p class="text-xs text-amber-600 mb-2">${esc(f.note)}</p>` : ''}
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr>${cols.map(c => `<th class="text-left px-2 py-2 border-b border-outline-variant/30 text-on-surface-variant font-bold text-[10px] uppercase">${esc(c.length > 40 ? c.substring(0, 40) + '…' : c)}</th>`).join('')}<th class="w-8"></th></tr>
          </thead>
          <tbody class="forms-table-body" data-key="${key}">
            ${rows.length ? rows.map((row, ri) => `<tr class="forms-table-row" data-ri="${ri}">
              ${cols.map((c, ci) => `<td class="px-1 py-1"><input type="text" class="forms-cell w-full px-2 py-1.5 rounded border border-outline-variant/20 text-xs focus:border-primary outline-none" data-key="${key}" data-ri="${ri}" data-ci="${ci}" value="${esc(row[ci] || '')}"></td>`).join('')}
              <td class="px-1"><button class="forms-del-row text-on-surface-variant/30 hover:text-error" data-key="${key}" data-ri="${ri}"><span class="material-symbols-outlined text-sm">close</span></button></td>
            </tr>`).join('') : `<tr><td colspan="${cols.length + 1}" class="text-center py-4 text-on-surface-variant/40">No rows yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function formsGetWpCount() {
    const saved = fm.values['__meta.wp_count'];
    return saved ? parseInt(saved) : 4;
  }

  function formsRenderWorkPackages(sec) {
    const tpl = sec.work_package_template;
    if (!tpl) return '';
    const wpCount = formsGetWpCount();

    // WP count control
    let html = `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest mb-4">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">inventory_2</span>
          <span class="text-sm font-bold text-primary">Number of Work Packages</span>
        </div>
        <input type="number" id="forms-wp-count" min="2" max="15" value="${wpCount}"
          class="w-20 px-3 py-2 rounded-xl border border-outline-variant/30 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary/20">
        <span class="text-xs text-on-surface-variant">Min 2. 4 pre-loaded by default.</span>
      </div>
    </div>`;

    // Instructions collapsible
    html += `<details class="mb-4 rounded-xl bg-amber-50/50 border border-amber-200">
      <summary class="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
        <span class="material-symbols-outlined text-sm text-amber-500">tips_and_updates</span>
        <span class="text-xs font-bold text-amber-700 flex-1">Work packages instructions</span>
        <span class="material-symbols-outlined text-sm text-amber-400">expand_more</span>
      </summary>
      <div class="px-4 pb-3 space-y-1">
        <p class="text-xs text-amber-800/70"><strong>WP1</strong> should cover management and coordination (meetings, monitoring, financial management, progress reports) and cross-cutting activities.</p>
        <p class="text-xs text-amber-800/70"><strong>WP2+</strong> should be used for the other project activities.</p>
        <p class="text-xs text-amber-800/70"><strong>Last WP</strong> should be dedicated to Impact and dissemination.</p>
        <p class="text-xs text-amber-800/70"><strong>Deliverables:</strong> recommended max <strong>10-15 for the entire project</strong>. You may be asked to reduce during grant preparation.</p>
        <p class="text-xs text-amber-800/70"><strong>Milestones:</strong> use only for major outputs in complex projects. Limit the number per WP.</p>
        <p class="text-xs text-amber-800/70"><strong>Tasks:</strong> continuous numbering linked to WP (T1.1, T1.2, T2.1, etc.).</p>
        <p class="text-xs text-amber-800/70">Enter each activity/milestone/deliverable <strong>only once</strong> (under one work package).</p>
      </div>
    </details>`;

    // Render each WP
    for (let i = 1; i <= wpCount; i++) {
      const wpId = 'wp_' + i;
      const wpLabel = i === 1 ? 'WP1: Project management and coordination'
                    : i === wpCount ? `WP${i}: Impact and dissemination`
                    : `WP${i}`;

      // Pre-seed activities (2 empty rows) — T{wp}.{n}
      const actKey = wpId + '.wp_activities_table';
      if (!fm.values[actKey]) {
        const actCols = tpl.fields.find(f => f.id === 'wp_activities_table')?.columns?.length || 6;
        fm.values[actKey] = Array.from({ length: 2 }, (_, ti) =>
          Array.from({ length: actCols }, (_, ci) => ci === 0 ? `T${i}.${ti + 1}` : '')
        );
      }

      // Pre-seed deliverables — D{wp}.{n} (3 for WP1, 4 for rest)
      const delKey = wpId + '.wp_deliverables_table';
      if (!fm.values[delKey]) {
        const defaultDelCount = i === 1 ? 3 : 4;
        const delCols = tpl.fields.find(f => f.id === 'wp_deliverables_table')?.columns?.length || 8;
        fm.values[delKey] = Array.from({ length: defaultDelCount }, (_, di) =>
          Array.from({ length: delCols }, (_, ci) => ci === 0 ? `D${i}.${di + 1}` : '')
        );
      }

      // Pre-seed milestones — MS{global_n} (correlative across all WPs)
      const msKey = wpId + '.wp_milestones_table';
      if (!fm.values[msKey]) {
        const msCols = tpl.fields.find(f => f.id === 'wp_milestones_table')?.columns?.length || 5;
        // Count existing milestones across all previous WPs
        let globalMs = 0;
        for (let j = 1; j < i; j++) {
          const prev = fm.values['wp_' + j + '.wp_milestones_table'];
          if (Array.isArray(prev)) globalMs += prev.length;
        }
        fm.values[msKey] = [
          Array.from({ length: msCols }, (_, ci) => ci === 0 ? `MS${globalMs + 1}` : '')
        ];
      }

      html += `<details class="rounded-2xl border-2 border-primary/15 bg-white mb-3 group/wp" ${i <= 2 ? 'open' : ''}>
        <summary class="flex items-center gap-3 px-5 py-4 cursor-pointer select-none">
          <div class="w-9 h-9 rounded-xl bg-[#1b1464] flex items-center justify-center flex-shrink-0">
            <span class="text-xs font-extrabold text-[#fbff12]">${i}</span>
          </div>
          <span class="font-bold text-primary text-sm flex-1">${esc(wpLabel)}</span>
          <span class="material-symbols-outlined text-primary/40 group-open/wp:rotate-180 transition-transform">expand_more</span>
        </summary>
        <div class="px-5 pb-5 space-y-4">`;

      for (const f of tpl.fields) {
        html += formsRenderField({ ...f, id: f.id }, wpId);
      }

      html += '</div></details>';
    }

    return html;
  }

  function formsRenumberMilestones() {
    const wpCount = formsGetWpCount();
    let global = 1;
    for (let w = 1; w <= wpCount; w++) {
      const key = 'wp_' + w + '.wp_milestones_table';
      const rows = fm.values[key];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        row[0] = `MS${global}`;
        global++;
      }
    }
    // Also update DOM if visible
    document.querySelectorAll('.forms-table-body[data-key$=".wp_milestones_table"]').forEach(tbody => {
      tbody.querySelectorAll('.forms-table-row').forEach(tr => {
        const cell = tr.querySelector('.forms-cell[data-ci="0"]');
        if (cell) {
          const key = tbody.dataset.key;
          const ri = parseInt(tr.dataset.ri);
          const rows = fm.values[key];
          if (rows && rows[ri]) cell.value = rows[ri][0];
        }
      });
    });
  }

  async function formsSaveAll() {
    // Collect all current field values from DOM
    document.querySelectorAll('.form-field-input').forEach(inp => {
      if (inp.type === 'radio') {
        if (inp.checked) fm.values[inp.dataset.key] = inp.value;
      } else {
        fm.values[inp.dataset.key] = inp.value;
      }
    });

    // Collect table data
    document.querySelectorAll('.forms-table-body').forEach(tbody => {
      const key = tbody.dataset.key;
      const rows = [];
      tbody.querySelectorAll('.forms-table-row').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('.forms-cell').forEach(cell => cells.push(cell.value));
        rows.push(cells);
      });
      if (rows.length) fm.values[key] = rows;
    });

    try {
      await API.put('/admin/data/forms/instances/' + fm.instanceId + '/values', { values: fm.values });
      Toast.show('Form saved', 'ok');
    } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
  }

  // Delegate table add/remove row events
  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.forms-add-row');
    if (addBtn) {
      const key = addBtn.dataset.key;
      const cols = parseInt(addBtn.dataset.cols) || 1;
      if (!fm.values[key]) fm.values[key] = [];
      const newRow = new Array(cols).fill('');

      // Auto-number first cell based on table type
      const existingRows = fm.values[key].length;
      if (key.includes('s2_1_5_risk_table')) {
        newRow[0] = `R${existingRows + 1}`;
      } else if (key.includes('.wp_activities_table')) {
        // Tasks: T{wp}.{n} — e.g. T1.3, T2.5
        const wpNum = key.match(/wp_(\d+)/)?.[1] || '1';
        newRow[0] = `T${wpNum}.${existingRows + 1}`;
      } else if (key.includes('.wp_deliverables_table')) {
        // Deliverables: D{wp}.{n} — e.g. D1.4, D2.5
        const wpNum = key.match(/wp_(\d+)/)?.[1] || '1';
        newRow[0] = `D${wpNum}.${existingRows + 1}`;
      }

      fm.values[key].push(newRow);

      // Renumber milestones globally if it's a milestone table
      if (key.includes('.wp_milestones_table')) formsRenumberMilestones();

      // Re-render current section
      const secData = formsFindSection(fm.activeSection);
      if (secData) formsRenderSection(secData);
      return;
    }

    const delBtn = e.target.closest('.forms-del-row');
    if (delBtn) {
      const key = delBtn.dataset.key;
      const ri = parseInt(delBtn.dataset.ri);
      if (fm.values[key] && Array.isArray(fm.values[key])) {
        fm.values[key].splice(ri, 1);
        // Renumber milestones globally after delete
        if (key.includes('.wp_milestones_table')) formsRenumberMilestones();
        const secData = formsFindSection(fm.activeSection);
        if (secData) formsRenderSection(secData);
      }
    }
  });

  /* ═════════════════════════════════════════════════════════════════
     Pattern Library (Diagnose & Improve, TASK-007)
     ════════════════════════════════════════════════════════════════ */

  let _patternsCache = null;
  let _lettersCache = null;
  let _patternsStatsCache = null;

  async function loadPatterns() {
    const tbody = document.getElementById('patterns-tbody');
    const lettersTbody = document.getElementById('patterns-letters-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-on-surface-variant text-sm">Cargando…</td></tr>';
    if (lettersTbody) lettersTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-on-surface-variant text-sm">Cargando…</td></tr>';

    try {
      const [stats, patterns, letters] = await Promise.all([
        API.get('/diagnose/stats'),
        API.get('/diagnose/patterns'),
        API.get('/diagnose/letters'),
      ]);
      _patternsStatsCache = stats;
      _patternsCache = patterns;
      _lettersCache = letters;

      renderPatternsStats(stats);
      renderProgrammeFilter(stats.programmes || []);
      renderPatternsTable();
      renderLettersTable(letters);

      // bind filters once
      const scopeSel = document.getElementById('patterns-filter-scope');
      const progSel = document.getElementById('patterns-filter-programme');
      if (scopeSel && !scopeSel.dataset.bound) {
        scopeSel.dataset.bound = '1';
        scopeSel.addEventListener('change', renderPatternsTable);
      }
      if (progSel && !progSel.dataset.bound) {
        progSel.dataset.bound = '1';
        progSel.addEventListener('change', renderPatternsTable);
      }
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-error text-sm">Error: ${e.message || e}</td></tr>`;
    }
  }

  function renderPatternsStats(stats) {
    const wrap = document.getElementById('patterns-stats');
    if (!wrap) return;
    const by = stats.patterns_by_scope || {};
    const card = (label, value, hint) =>
      `<div class="bg-surface border border-outline-variant/30 rounded-xl p-3">
         <div class="text-2xl font-bold text-on-surface">${value}</div>
         <div class="text-xs text-on-surface-variant">${label}</div>
         ${hint ? `<div class="text-[10px] text-on-surface-variant/70 mt-1">${hint}</div>` : ''}
       </div>`;
    wrap.innerHTML =
      card('Cartas', stats.letters_total || 0) +
      card('Findings', stats.findings_total || 0) +
      card('Patrones', stats.patterns_active || 0) +
      card('Universales', by.universal || 0, 'N≥2 cartas en ≥2 programas') +
      card('Por programa', by.programme || 0, 'N≥2 en mismo programa');
  }

  function renderProgrammeFilter(programmes) {
    const sel = document.getElementById('patterns-filter-programme');
    if (!sel) return;
    const opts = ['<option value="">Todos los programas</option>']
      .concat((programmes || []).map(p =>
        `<option value="${p.programme_code}">${escapeHTML(p.programme_name || p.programme_code)}</option>`));
    sel.innerHTML = opts.join('');
  }

  function renderPatternsTable() {
    const tbody = document.getElementById('patterns-tbody');
    if (!tbody) return;
    const patterns = _patternsCache?.data || _patternsCache || [];
    const scope = document.getElementById('patterns-filter-scope')?.value || '';
    const prog = document.getElementById('patterns-filter-programme')?.value || '';

    const filtered = patterns.filter(p => {
      if (scope && p.scope !== scope) return false;
      if (prog) {
        if (p.scope === 'universal') return true;
        if (p.programme_code !== prog) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-on-surface-variant text-sm">Sin patrones con esos filtros.</td></tr>';
      return;
    }

    const scopeBadge = (s) => {
      const colors = {
        universal: 'bg-primary/10 text-primary',
        programme: 'bg-tertiary/10 text-tertiary',
        emergent:  'bg-on-surface-variant/15 text-on-surface-variant',
      };
      return `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[s] || ''}">${s.toUpperCase()}</span>`;
    };
    const sevBadge = (s) => {
      const colors = {
        critical:    'bg-error/15 text-error',
        high:        'bg-error/10 text-error',
        medium_high: 'bg-orange-500/10 text-orange-700',
        medium:      'bg-yellow-500/10 text-yellow-800',
        medium_low:  'bg-yellow-500/5 text-yellow-700',
        low:         'bg-on-surface-variant/10 text-on-surface-variant',
        positive:    'bg-green-500/10 text-green-700',
      };
      return `<span class="px-2 py-0.5 rounded text-[10px] font-medium ${colors[s] || ''}">${s}</span>`;
    };

    tbody.innerHTML = filtered.map(p => `
      <tr class="border-t border-outline-variant/20">
        <td class="p-3 align-top">${scopeBadge(p.scope)}</td>
        <td class="p-3 align-top text-xs text-on-surface-variant">${escapeHTML(p.programme_name || (p.scope === 'universal' ? '— todos —' : '—'))}</td>
        <td class="p-3 align-top">
          <div class="font-medium text-on-surface">${escapeHTML(p.pattern_text)}</div>
          ${p.writer_rule_text ? `<div class="text-xs text-on-surface-variant mt-1 italic">→ ${escapeHTML(p.writer_rule_text)}</div>` : ''}
        </td>
        <td class="p-3 align-top text-xs text-on-surface-variant">${escapeHTML(p.criterion || '—')}</td>
        <td class="p-3 align-top text-center font-bold">${p.occurrences_count}</td>
        <td class="p-3 align-top">${sevBadge(p.severity_avg)}</td>
      </tr>
    `).join('');
  }

  function renderLettersTable(lettersResp) {
    const tbody = document.getElementById('patterns-letters-tbody');
    if (!tbody) return;
    const letters = lettersResp?.data || lettersResp || [];
    if (letters.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-on-surface-variant text-sm">Sin cartas cargadas.</td></tr>';
      return;
    }
    const resultBadge = (r) => {
      const map = {
        awarded:             { txt: 'Concedido',    cls: 'bg-green-500/10 text-green-700' },
        rejected_threshold:  { txt: 'No threshold', cls: 'bg-error/15 text-error' },
        rejected_ranking:    { txt: 'No ranking',   cls: 'bg-orange-500/10 text-orange-700' },
        unknown:             { txt: 'Desconocido',  cls: 'bg-on-surface-variant/10 text-on-surface-variant' },
      };
      const x = map[r] || map.unknown;
      return `<span class="px-2 py-0.5 rounded text-[10px] font-medium ${x.cls}">${x.txt}</span>`;
    };
    tbody.innerHTML = letters.map(l => `
      <tr class="border-t border-outline-variant/20">
        <td class="p-3 align-top font-bold">${escapeHTML(l.proposal_acronym || '—')}</td>
        <td class="p-3 align-top text-xs">${escapeHTML(l.programme_name || l.programme_code || '—')}</td>
        <td class="p-3 align-top text-xs">${l.total_score != null ? `${l.total_score} / ${l.total_threshold || '—'}` : '<span class="text-on-surface-variant">—</span>'}</td>
        <td class="p-3 align-top">${resultBadge(l.result)}</td>
        <td class="p-3 align-top text-xs text-on-surface-variant">${escapeHTML(l.source_format)}</td>
        <td class="p-3 align-top text-center">
          <span class="font-bold">${l.findings_count}</span>
          <span class="text-[10px] text-on-surface-variant">(+${l.positives_count} pos)</span>
        </td>
      </tr>
    `).join('');
  }

  function escapeHTML(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Opens the convocatorias editor directly. Works whether the Admin section
  // is already mounted or being navigated to. Used by Convocatorias tab to
  // jump to the editor after importing a call from the public feed.
  async function openConvocatoria(programId, programName) {
    if (!programId) return;
    // Make sure the admin DOM is ready and the convocatorias section is loaded.
    if (typeof activeSection !== 'undefined') activeSection = 'convocatorias';
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    const sec = document.getElementById('admin-sec-convocatorias');
    if (sec) sec.classList.remove('hidden');
    // Highlight the convocatorias tab if visible
    document.querySelectorAll('.admin-tab').forEach(b => {
      const isThis = b.dataset.section === 'convocatorias';
      b.classList.toggle('border-b-2', isThis);
      b.classList.toggle('border-secondary-fixed', isThis);
      b.classList.toggle('text-primary', isThis);
      b.classList.toggle('font-bold', isThis);
      b.classList.toggle('text-on-surface-variant', !isThis);
    });
    // Fetch program meta so we can pass `prog` to convOpenProgram
    try {
      const programs = await API.get('/admin/data/programs/full');
      const prog = programs.find(p => p.id === programId);
      convOpenProgram(programId, programName || prog?.name || '', prog);
    } catch (e) {
      convOpenProgram(programId, programName || '');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     TASK-008 · Prompt Inspector (admin-only)
     Reads ai_generations + prompt_blocks. The product IP lives here and
     never reaches a non-admin (server enforces requireAdminOnly).
     ═══════════════════════════════════════════════════════════════ */
  const SEG_LABEL = {
    base_persona: 'Persona base', writing_style: 'Estilo de escritura', ai_detection: 'Anti-detección IA',
    antipatterns: 'Anti-patrones', output_format: 'Formato de salida', canonical_facts: 'Hechos invariables',
    project_context: 'Contexto del proyecto', wp_focus: 'Foco del WP', mandatory_constraint: 'Restricción obligatoria',
    eval_criteria: 'Criterios del evaluador', rag: 'Docs de convocatoria (RAG)', research: 'Investigación temática',
    previous_sections: 'Secciones previas', now_write: 'Instrucción final',
  };

  function loadInspector() {
    bindInspectorTabs();
    loadGenerations();
  }

  function bindInspectorTabs() {
    const tg = document.getElementById('insp-tab-gen');
    const tb = document.getElementById('insp-tab-blocks');
    const pg = document.getElementById('insp-pane-gen');
    const pb = document.getElementById('insp-pane-blocks');
    if (!tg || tg._bound) return;
    tg._bound = true;
    const activate = (which) => {
      const gen = which === 'gen';
      tg.className = `px-3 py-1.5 text-sm rounded-lg ${gen ? 'bg-primary text-secondary-fixed font-semibold' : 'bg-surface-variant text-on-surface-variant'}`;
      tb.className = `px-3 py-1.5 text-sm rounded-lg ${!gen ? 'bg-primary text-secondary-fixed font-semibold' : 'bg-surface-variant text-on-surface-variant'}`;
      pg.classList.toggle('hidden', !gen);
      pb.classList.toggle('hidden', gen);
      if (gen) loadGenerations(); else loadPromptBlocks();
    };
    tg.addEventListener('click', () => activate('gen'));
    tb.addEventListener('click', () => activate('blocks'));
  }

  async function loadGenerations() {
    const pane = document.getElementById('insp-pane-gen');
    if (!pane) return;
    pane.innerHTML = '<p class="text-sm text-on-surface-variant py-6">Cargando generaciones…</p>';
    try {
      const rows = await API.get('/admin/inspector/generations?kind=writer-section&limit=100');
      if (!rows.length) { pane.innerHTML = '<p class="text-sm text-on-surface-variant py-6">Aún no hay generaciones registradas. Genera una sección en el Writer y vuelve aquí.</p>'; return; }
      pane.innerHTML = `
        <div class="overflow-x-auto border border-outline-variant/40 rounded-xl">
          <table class="w-full text-sm">
            <thead class="bg-surface-variant/40 text-on-surface-variant text-xs">
              <tr><th class="text-left px-3 py-2">Fecha</th><th class="text-left px-3 py-2">Proyecto</th><th class="text-left px-3 py-2">Sección</th><th class="text-right px-3 py-2">Prompt</th><th class="text-right px-3 py-2">Salida</th><th class="text-right px-3 py-2">ms</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr class="border-t border-outline-variant/30 hover:bg-surface-variant/30 cursor-pointer" data-gen="${r.id}">
                  <td class="px-3 py-2 whitespace-nowrap text-xs">${new Date(r.created_at).toLocaleString('es')}</td>
                  <td class="px-3 py-2">${esc(r.project_name || '—')}</td>
                  <td class="px-3 py-2 font-mono text-xs">${esc(r.section_id || r.pass || '')}</td>
                  <td class="px-3 py-2 text-right text-xs">${((r.system_len||0)+(r.user_len||0)).toLocaleString('es')} ch</td>
                  <td class="px-3 py-2 text-right text-xs">${(r.output_len||0).toLocaleString('es')} ch</td>
                  <td class="px-3 py-2 text-right text-xs ${r.status==='error'?'text-error':''}">${r.status==='error'?'ERR':(r.duration_ms||'')}</td>
                  <td class="px-3 py-2 text-right"><span class="material-symbols-outlined text-base text-on-surface-variant">chevron_right</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div id="insp-gen-detail" class="mt-4"></div>`;
      pane.querySelectorAll('[data-gen]').forEach(tr => tr.addEventListener('click', () => openGeneration(tr.dataset.gen)));
    } catch (e) {
      pane.innerHTML = `<p class="text-sm text-error py-6">Error: ${esc(e.message || 'no se pudo cargar')}</p>`;
    }
  }

  async function openGeneration(id) {
    const box = document.getElementById('insp-gen-detail');
    if (!box) return;
    box.innerHTML = '<p class="text-sm text-on-surface-variant py-4">Cargando prompt…</p>';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const g = await API.get('/admin/inspector/generations/' + id);
      let segs = [];
      try { segs = typeof g.segments === 'string' ? JSON.parse(g.segments) : (g.segments || []); } catch (_) {}
      const totalCh = segs.reduce((s, x) => s + (x.chars || 0), 0) || 1;
      box.innerHTML = `
        <div class="border border-outline-variant/40 rounded-xl p-4 bg-surface-variant/20">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-primary">${esc(g.project_name || '')} · ${esc(g.section_id || g.pass || '')}</h3>
            <span class="text-xs text-on-surface-variant">${new Date(g.created_at).toLocaleString('es')} · ${g.duration_ms||'?'} ms</span>
          </div>
          <div class="space-y-2 mb-4">
            ${segs.length ? segs.map((s, i) => `
              <div class="border border-outline-variant/40 rounded-lg overflow-hidden">
                <button class="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-variant/40" data-seg="${i}">
                  <span class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm text-on-surface-variant">expand_more</span>
                    <span class="font-semibold text-sm">${esc(SEG_LABEL[s.name] || s.name)}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-variant text-on-surface-variant font-mono">${esc(s.source||'')}</span>
                  </span>
                  <span class="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span class="inline-block h-1.5 rounded bg-primary/60" style="width:${Math.max(4, Math.round((s.chars||0)/totalCh*120))}px"></span>
                    ${(s.chars||0).toLocaleString('es')} ch
                  </span>
                </button>
                <pre class="hidden px-3 py-2 text-xs whitespace-pre-wrap bg-surface text-on-surface border-t border-outline-variant/30 max-h-80 overflow-auto" data-seg-body="${i}">${esc(s.content||'')}</pre>
              </div>`).join('') : '<p class="text-xs text-on-surface-variant">Sin segmentos (generación antigua). Mostrando prompt completo abajo.</p>'}
          </div>
          <details class="mb-2"><summary class="text-sm font-semibold cursor-pointer text-on-surface-variant">System prompt (${(g.system_prompt||'').length.toLocaleString('es')} ch)</summary><pre class="mt-2 px-3 py-2 text-xs whitespace-pre-wrap bg-surface rounded max-h-96 overflow-auto">${esc(g.system_prompt||'')}</pre></details>
          <details class="mb-2"><summary class="text-sm font-semibold cursor-pointer text-on-surface-variant">User prompt (${(g.user_prompt||'').length.toLocaleString('es')} ch)</summary><pre class="mt-2 px-3 py-2 text-xs whitespace-pre-wrap bg-surface rounded max-h-96 overflow-auto">${esc(g.user_prompt||'')}</pre></details>
          <details><summary class="text-sm font-semibold cursor-pointer text-primary">Salida generada (${(g.raw_response||'').length.toLocaleString('es')} ch)</summary><pre class="mt-2 px-3 py-2 text-xs whitespace-pre-wrap bg-surface rounded max-h-96 overflow-auto">${esc(g.raw_response||'')}</pre></details>
        </div>`;
      box.querySelectorAll('[data-seg]').forEach(btn => btn.addEventListener('click', () => {
        const body = box.querySelector(`[data-seg-body="${btn.dataset.seg}"]`);
        if (body) body.classList.toggle('hidden');
      }));
    } catch (e) {
      box.innerHTML = `<p class="text-sm text-error py-4">Error: ${esc(e.message || '')}</p>`;
    }
  }

  async function loadPromptBlocks() {
    const pane = document.getElementById('insp-pane-blocks');
    if (!pane) return;
    pane.innerHTML = '<p class="text-sm text-on-surface-variant py-6">Cargando bloques…</p>';
    try {
      const blocks = await API.get('/admin/prompt-blocks');
      pane.innerHTML = `
        <p class="text-sm text-on-surface-variant mb-3">Bloques de prompt editables. Editarlos cambia lo que recibe la IA en las próximas generaciones. Los marcados <em>default</em> aún viven en código — al guardar creas la versión 1 editable.</p>
        <div class="space-y-2">
          ${blocks.filter(b => b.program_id === null).map(b => `
            <div class="border border-outline-variant/40 rounded-xl p-3">
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-semibold text-sm">${esc(b.name)}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded ${b.is_default ? 'bg-surface-variant text-on-surface-variant' : 'bg-primary/15 text-primary'} ml-2">${b.is_default ? 'default (código)' : 'v'+b.version}</span>
                  <span class="text-xs text-on-surface-variant ml-2">${(b.chars||0).toLocaleString('es')} ch</span>
                </div>
                <button class="text-sm px-3 py-1 rounded-lg bg-primary text-secondary-fixed font-semibold" data-edit-block="${esc(b.name)}">Editar</button>
              </div>
              <div class="hidden mt-3" data-block-editor="${esc(b.name)}"></div>
            </div>`).join('')}
        </div>`;
      pane.querySelectorAll('[data-edit-block]').forEach(btn => btn.addEventListener('click', () => editPromptBlock(btn.dataset.editBlock)));
    } catch (e) {
      pane.innerHTML = `<p class="text-sm text-error py-6">Error: ${esc(e.message || '')}</p>`;
    }
  }

  async function editPromptBlock(name) {
    const box = document.querySelector(`[data-block-editor="${CSS.escape(name)}"]`);
    if (!box) return;
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = '<p class="text-xs text-on-surface-variant py-2">Cargando…</p>';
    try {
      const b = await API.get('/admin/prompt-blocks/' + encodeURIComponent(name));
      box.innerHTML = `
        <textarea class="w-full h-64 p-3 text-xs font-mono border border-outline-variant rounded-lg bg-surface" data-block-text>${esc(b.content || '')}</textarea>
        <div class="flex items-center gap-2 mt-2">
          <button class="text-sm px-4 py-1.5 rounded-lg bg-primary text-secondary-fixed font-semibold" data-save-block>Guardar versión nueva</button>
          <span class="text-xs text-on-surface-variant" data-block-msg></span>
        </div>`;
      box.querySelector('[data-save-block]').addEventListener('click', async () => {
        const content = box.querySelector('[data-block-text]').value;
        const msg = box.querySelector('[data-block-msg]');
        msg.textContent = 'Guardando…';
        try {
          const r = await API.put('/admin/prompt-blocks/' + encodeURIComponent(name), { content });
          msg.textContent = `Guardado · v${r.version}`;
          loadPromptBlocks();
        } catch (e) { msg.textContent = 'Error: ' + (e.message || ''); }
      });
    } catch (e) {
      box.innerHTML = `<p class="text-xs text-error py-2">Error: ${esc(e.message || '')}</p>`;
    }
  }

  return { init, openEdit, confirmDelete, openConvocatoria };
})();
