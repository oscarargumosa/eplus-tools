/* ═══════════════════════════════════════════════════════════════
   Intake — Wizard module for creating Erasmus+ project proposals
   Uses API module for authenticated requests to /v1/intake/*
   ═══════════════════════════════════════════════════════════════ */

const Intake = (() => {
  let initialized = false;
  let step = 0;
  let selectedProgram = null;
  let _dirty = false;
  let programs = [];
  let partners = [{ _local: 1, name: '', city: '', country: '', role: 'applicant', order_index: 1 }];
  let pCounter = 1;
  let currentProjectId = null;
  let calcInitialized = false;
  let calcNeedsReinit = false;
  let _intakeSaveTimer = null;
  let _lastSaveError = null;

  function scheduleIntakeSave() {
    clearTimeout(_intakeSaveTimer);
    _intakeSaveTimer = setTimeout(() => {
      const name = document.getElementById('intake-f-name')?.value?.trim();
      if (name) saveToServer(true);
    }, 3000);
  }

  function showIntakeSaveStatus(status, msg) {
    let el = document.getElementById('intake-save-status');
    if (!el) {
      el = document.createElement('span');
      el.id = 'intake-save-status';
      el.className = 'text-[10px] font-medium ml-2 transition-opacity duration-500';
      const topbar = document.getElementById('topbar-title');
      if (topbar) topbar.parentElement.appendChild(el);
    }
    if (status === 'saving') { el.textContent = 'Guardando...'; el.style.color = '#9ca3af'; el.style.opacity = '1'; }
    else if (status === 'saved') { el.textContent = 'Guardado'; el.style.color = '#22c55e'; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 2000); }
    else if (status === 'error') { el.textContent = 'Error: ' + (msg || 'no se pudo guardar'); el.style.color = '#ef4444'; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 5000); }
  }

  /* ── Step configuration (5 steps — contexto, tareas, gantt moved to Writer) */
  const STEPS = [
    { key: 'proyecto',     label: 'Proyecto',      icon: 'description',   panel: 'intake-p1' },
    { key: 'tarifas',      label: 'Tarifas',       icon: 'euro',          panel: 'intake-dynamic', calc: 'rates' },
    { key: 'wps',          label: 'WPs',           icon: 'account_tree',  panel: 'intake-dynamic', calc: 'mergedWPs' },
    { key: 'presupuesto',  label: 'Budget',        icon: 'payments',      panel: 'intake-dynamic', calc: 'results' },
    { key: 'resumen',      label: 'Resumen',       icon: 'rocket_launch', panel: 'intake-p3' },
  ];

  /* ── National Agency → proposal language mapping ──────────────── */
  const NA_LANG = {
    EACEA:'en',
    EISMEA:'en',
    AT01:'de',
    BE01:'fr', BE02:'nl', BE03:'de', BE04:'fr', BE05:'nl',
    BG01:'bg', HR01:'hr', CY01:'el', CZ01:'cs', DK01:'da',
    EE01:'et', FI01:'fi',
    FR01:'fr', FR02:'fr',
    DE01:'de', DE02:'de', DE03:'de', DE04:'de',
    EL01:'el', EL02:'el',
    HU01:'hu', IS01:'is',
    IE01:'en', IE02:'en',
    IT01:'it', IT02:'it', IT03:'it',
    LV01:'lv', LV02:'lv',
    LI01:'de',
    LT01:'lt', LT02:'lt',
    LU01:'fr',
    MT01:'en',
    NL01:'nl', NL02:'nl',
    NO01:'no', NO02:'no',
    PL01:'pl',
    PT01:'pt', PT02:'pt',
    RO01:'ro', RS01:'sr',
    SK01:'sk', SK02:'sk',
    SI01:'sl', SI02:'sl',
    ES01:'es', ES02:'es',
    SE01:'sv', SE02:'sv',
    TR01:'tr',
  };
  const LANG_NAMES = {
    en:'English', es:'Español', fr:'Français', de:'Deutsch', it:'Italiano', pt:'Português',
    nl:'Nederlands', bg:'Български', hr:'Hrvatski', el:'Ελληνικά', cs:'Čeština', da:'Dansk',
    et:'Eesti', fi:'Suomi', hu:'Magyar', is:'Íslenska', lv:'Latviešu', lt:'Lietuvių',
    no:'Norsk', pl:'Polski', ro:'Română', sr:'Srpski', sk:'Slovenčina', sl:'Slovenščina',
    sv:'Svenska', tr:'Türkçe',
  };

  function onNAChange() {
    const naEl = document.getElementById('intake-f-na');
    const langEl = document.getElementById('intake-f-lang');
    if (!naEl || !langEl) return;
    const suggested = NA_LANG[naEl.value];
    if (!suggested) return;
    if (langEl.dataset.userTouched === '1') return;
    langEl.value = suggested;
  }

  function onLangChange() {
    const langEl = document.getElementById('intake-f-lang');
    if (langEl) langEl.dataset.userTouched = '1';
    _dirty = true;
    scheduleIntakeSave();
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    if (initialized) {
      setStep(step);
      loadPrograms();
      return;
    }
    initialized = true;
    renderStepNav();
    bindEvents();
    // Auto-reopen the last active project after a refresh, so the user lands
    // on their work instead of an empty Intake with default fallbacks (€625k target).
    let reopened = false;
    try {
      const lastId = localStorage.getItem('lastProjectId');
      if (lastId && lastId.length === 36) { // sane UUID, not intake-temp-...
        reopened = true;
        loadPrograms().then(() => loadFromServer(lastId, 0));
      }
    } catch {}
    if (!reopened) {
      setStep(0);
      loadPrograms();
    }
  }

  function startNew() {
    // Forget any auto-reopen target so a refresh during "new project" doesn't
    // bounce back to the previous one.
    try { localStorage.removeItem('lastProjectId'); } catch {}
    // Ensure initialized (render nav + bind events) but don't call setStep with stale step
    if (!initialized) {
      initialized = true;
      renderStepNav();
      bindEvents();
      loadPrograms();
    }
    // Clean slate: reset form, then apply selected program, then go to step 0
    resetForm();
    calcInitialized = false;
    calcNeedsReinit = false;
    if (selectedProgram) selectProgram(selectedProgram.id);
    setStep(0);
    // Activate contextual sidebar with a placeholder name (real name lands on first save)
    if (typeof App !== 'undefined' && App.setActiveProject) {
      App.setActiveProject({ id: null, name: selectedProgram?.name || 'Nuevo proyecto' });
    }
  }

  /* ── Dynamic step nav (uses unified PhaseTabs component) ──── */
  function renderStepNav() {
    const nav = document.getElementById('intake-step-nav');
    if (!nav || typeof PhaseTabs === 'undefined') return;
    PhaseTabs.render(nav, {
      tabs: STEPS.map(s => ({ key: s.key, label: s.label, icon: s.icon })),
      activeKey: STEPS[step]?.key,
      onSelect: (key) => {
        const idx = STEPS.findIndex(s => s.key === key);
        if (idx >= 0) setStep(idx);
      },
    });
  }

  /* ── Event binding ───────────────────────────────────────────── */
  function bindEvents() {
    // Step navigation (delegated since nav is dynamic)
    document.getElementById('intake-step-nav')?.addEventListener('click', (e) => {
      const stepEl = e.target.closest('[data-step]');
      if (!stepEl) return;
      const s = parseInt(stepEl.dataset.step);
      setStep(s);
    });

    // Next/Prev buttons
    document.querySelectorAll('.intake-btn-next').forEach(btn => {
      btn.addEventListener('click', () => nextStep());
    });
    document.querySelectorAll('.intake-btn-prev').forEach(btn => {
      btn.addEventListener('click', () => setStep(step - 1));
    });

    // Add partner
    document.getElementById('intake-btn-add-partner')?.addEventListener('click', addPartner);

    // (Context word counters removed — context moved to Writer Prep Studio)

    // Sync visible duration/start fields → hidden fields + update Calculator live
    document.getElementById('intake-f-dur-visible')?.addEventListener('change', (e) => {
      const v = parseInt(e.target.value) || 24;
      document.getElementById('intake-f-dur').value = v;
      if (calcInitialized && typeof Calculator !== 'undefined' && Calculator.isInitialized()) {
        Calculator.updateProjectData({ duration_months: v });
      }
      _dirty = true; scheduleIntakeSave();
    });
    document.getElementById('intake-f-start-visible')?.addEventListener('change', (e) => {
      document.getElementById('intake-f-start').value = e.target.value;
      if (calcInitialized && typeof Calculator !== 'undefined' && Calculator.isInitialized()) {
        Calculator.updateProjectData({ start_date: e.target.value });
      }
      _dirty = true; scheduleIntakeSave();
    });

    // Marcar dirty y autosave en cualquier campo del formulario
    document.querySelectorAll('#panel-intake input, #panel-intake select, #panel-intake textarea')
      .forEach(el => el.addEventListener('input', () => { _dirty = true; scheduleIntakeSave(); }));

    // Gate launch button on Project Summary content + auto-resize + show launch
    const descEl = document.getElementById('intake-f-desc');
    if (descEl) {
      descEl.addEventListener('input', () => {
        autoResizeDesc();
        if (descEl.value.trim().length >= 20) showPostInterview();
        updateLaunchGate();
      });
      descEl.addEventListener('blur', () => {
        if (descEl.value.trim()) exitEditMode();
      });
    }
    const descPreviewEl = document.getElementById('intake-f-desc-rendered');
    if (descPreviewEl) descPreviewEl.addEventListener('click', enterEditMode);
    const descEditBtn = document.getElementById('intake-f-desc-edit-btn');
    if (descEditBtn) descEditBtn.addEventListener('click', enterEditMode);

    // AI Interview — bind all buttons once
    document.getElementById('intake-interview-start')?.addEventListener('click', startInterview);
    document.getElementById('intake-interview-send')?.addEventListener('click', sendAnswer);
    document.getElementById('intake-interview-reset')?.addEventListener('click', resetInterview);
    document.getElementById('intake-interview-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAnswer(); }
    });
    // Voice on interview input
    const intInput = document.getElementById('intake-interview-input');
    if (intInput && typeof VoiceInput !== 'undefined') VoiceInput.attach(intInput);

    // National Agency → sugiere idioma de trabajo si el usuario no lo ha tocado
    document.getElementById('intake-f-na')?.addEventListener('change', () => {
      onNAChange();
      _dirty = true; scheduleIntakeSave();
    });

    // Idioma de trabajo: independiente de la NA una vez tocado
    document.getElementById('intake-f-lang')?.addEventListener('change', onLangChange);

    // Save/Load file buttons
    document.getElementById('intake-btn-save-file')?.addEventListener('click', saveToFile);
    document.getElementById('intake-btn-load-file')?.addEventListener('click', () => {
      document.getElementById('intake-file-in').click();
    });
    document.getElementById('intake-file-in')?.addEventListener('change', loadFromFile);

    // Server save buttons
    document.getElementById('intake-btn-save-server')?.addEventListener('click', saveToServer);
    document.getElementById('intake-btn-save-server-2')?.addEventListener('click', saveToServer);

    // Export wizard
    document.getElementById('intake-btn-export-wizard')?.addEventListener('click', exportWizard);
  }

  /* ── Programs ────────────────────────────────────────────────── */
  async function loadPrograms() {
    try {
      programs = await API.get('/intake/programs', { noAuth: true });
    } catch (err) {
      console.error('loadPrograms:', err);
    }
  }

  function selectProgram(id) {
    selectedProgram = programs.find(p => p.id === id);
    if (!selectedProgram) return;
    const p = selectedProgram;

    const setVal = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v || ''; };
    setVal('intake-f-start', p.start_date_min ? toDateStr(p.start_date_min) : '');
    setVal('intake-f-dur', p.duration_max_months || 24);
    setVal('intake-f-type', p.action_type || '');

    // Sync visible fields
    setVal('intake-f-dur-visible', p.duration_max_months || 24);
    setVal('intake-f-start-visible', p.start_date_min ? toDateStr(p.start_date_min) : '');
    setVal('intake-f-type-visible', p.action_type || '');

    // Show call summary in Step 1
    const csBox = document.getElementById('intake-call-summary-p1');
    const csText = document.getElementById('intake-call-summary-p1-text');
    const csPreview = document.getElementById('intake-call-summary-p1-preview');
    if (csBox && csText) {
      if (p.call_summary) {
        csText.textContent = p.call_summary;
        if (csPreview) csPreview.textContent = p.call_summary.split('\n')[0];
        csBox.classList.remove('hidden');
      } else { csBox.classList.add('hidden'); }
    }
  }

  /* ── Server projects ─────────────────────────────────────────── */
  async function loadServerProjects() {
    const el = document.getElementById('intake-server-projects');
    if (!el) return;
    try {
      const result = await API.get('/intake/projects');
      const projects = Array.isArray(result) ? result : (result.data || result);
      if (!projects || projects.length === 0) {
        el.innerHTML = '<div class="py-6 text-center"><span class="material-symbols-outlined text-3xl text-outline-variant block mb-2">folder_open</span><p class="text-xs text-on-surface-variant mb-2">Aún no tienes proyectos guardados</p><button onclick="document.getElementById(&apos;intake-btn-save-server&apos;)?.click()" class="text-xs font-semibold text-primary hover:underline">Guardar el actual</button></div>';
        return;
      }
      el.innerHTML = projects.map(p => `
        <div class="flex items-center justify-between p-3 rounded-lg border border-outline-variant bg-white hover:border-primary cursor-pointer transition-all mb-1.5" data-project-id="${esc(p.id)}">
          <div>
            <span class="text-sm font-bold text-primary">${esc(p.name)}</span>
            <span class="text-xs text-on-surface-variant ml-2">${esc(p.type || '')} \u00B7 ${esc(p.status || '')}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-on-surface-variant">${fmtDate(toDateStr(p.updated_at || p.created_at))}</span>
            <button type="button" class="intake-delete-project text-on-surface-variant hover:text-error transition-colors" data-id="${esc(p.id)}" title="Eliminar">
              <span class="material-symbols-outlined text-base">delete</span>
            </button>
          </div>
        </div>
      `).join('');

      // Bind click to load
      el.querySelectorAll('[data-project-id]').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.intake-delete-project')) return;
          loadFromServer(card.dataset.projectId);
        });
      });

      // Bind delete
      el.querySelectorAll('.intake-delete-project').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteFromServer(btn.dataset.id);
        });
      });
    } catch (err) {
      console.error('loadServerProjects:', err);
      el.innerHTML = '<p class="text-xs text-on-surface-variant">Error al cargar proyectos</p>';
    }
  }

  async function loadFromServer(id, targetStep) {
    try {
      const project = await API.get('/intake/projects/' + id);
      currentProjectId = project.id;

      // Notify Sandbox so the banner reflects the loaded project.
      if (typeof Sandbox !== 'undefined') Sandbox.setActiveProject(project);
      // Notify App so the contextual sidebar shows the right project name.
      if (typeof App !== 'undefined' && App.setActiveProject) App.setActiveProject(project);

      // Load project fields
      document.getElementById('intake-f-name').value = project.name || '';
      const fullnameEl = document.getElementById('intake-f-fullname');
      if (fullnameEl) fullnameEl.value = project.full_name || '';
      document.getElementById('intake-f-desc').value = project.description || '';
      setTimeout(() => { autoResizeDesc(); renderDescPreview(); }, 50);
      document.getElementById('intake-f-start').value = toDateStr(project.start_date);
      document.getElementById('intake-f-type').value = project.type || '';

      // Load national agency + proposal language (idioma de trabajo es independiente)
      const naEl = document.getElementById('intake-f-na');
      if (naEl && project.national_agency) naEl.value = project.national_agency;
      const langEl = document.getElementById('intake-f-lang');
      if (langEl && project.proposal_lang) {
        langEl.value = project.proposal_lang;
        // El proyecto ya tenía un idioma → respetarlo, no sobreescribir al tocar NA.
        langEl.dataset.userTouched = '1';
      } else {
        // Proyecto sin idioma persistido → sugerir desde NA en su primer render.
        onNAChange();
      }

      // Select matching program (sets selectedProgram + type-visible field)
      if (project.type && programs.length) {
        const match = programs.find(p => p.action_type === project.type);
        if (match) {
          selectedProgram = match;
          if (!programs.find(pr => pr.id === match.id)) programs.push(match);
          // Only set the type field from the program, preserve project's own duration/start
          const setVal = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v || ''; };
          setVal('intake-f-type', match.action_type || '');
          setVal('intake-f-type-visible', match.action_type || '');
          // Show call summary
          const csBox = document.getElementById('intake-call-summary-p1');
          const csText = document.getElementById('intake-call-summary-p1-text');
          const csPreview = document.getElementById('intake-call-summary-p1-preview');
          if (csBox && csText && match.call_summary) {
            csText.textContent = match.call_summary;
            if (csPreview) csPreview.textContent = match.call_summary.split('\n')[0];
            csBox.classList.remove('hidden');
          }
        }
      }
      // Re-apply project values that selectProgram would have overwritten
      if (project.duration_months) {
        document.getElementById('intake-f-dur').value = project.duration_months;
        const durVis = document.getElementById('intake-f-dur-visible');
        if (durVis) durVis.value = project.duration_months;
      }
      if (project.start_date) {
        document.getElementById('intake-f-start').value = toDateStr(project.start_date);
        const startVis = document.getElementById('intake-f-start-visible');
        if (startVis) startVis.value = toDateStr(project.start_date);
      }

      // Load partners
      try {
        const partnerList = await API.get('/intake/projects/' + id + '/partners');
        if (partnerList && partnerList.length > 0) {
          partners = partnerList.map(p => ({
            _server: p.id,
            _local: p.order_index,
            name: p.name || '',
            city: p.city || '',
            country: p.country || '',
            role: p.role || 'partner',
            order_index: p.order_index,
            organization_id: p.organization_id || null
          }));
          pCounter = partners.length;
        }
      } catch (e) { console.error('loadPartners:', e); }

      renderPartners();
      setStep(targetStep != null ? targetStep : 0);
      Toast.show('Proyecto cargado: ' + project.name, 'ok');
    } catch (err) {
      // If the auto-reopened project no longer exists (deleted, perms changed),
      // forget it so we don't loop on every refresh.
      try { localStorage.removeItem('lastProjectId'); } catch {}
      Toast.show('Error al cargar: ' + (err.message || err), 'err');
    }
  }

  async function deleteFromServer(id) {
    if (!confirm('\u00BFEliminar este proyecto del servidor?')) return;
    try {
      await API.del('/intake/projects/' + id);
      if (currentProjectId === id) currentProjectId = null;
      try { if (localStorage.getItem('lastProjectId') === id) localStorage.removeItem('lastProjectId'); } catch {}
      Toast.show('Proyecto eliminado', 'ok');
      loadServerProjects();
    } catch (err) {
      Toast.show('Error: ' + (err.message || err), 'err');
    }
  }

  async function saveToServer(silent) {
    const name = document.getElementById('intake-f-name').value.trim();
    if (!name) { if (!silent) Toast.show('Escribe un nombre de proyecto', 'err'); return; }

    if (silent) showIntakeSaveStatus('saving');
    try {
      const projectData = {
        name,
        full_name: document.getElementById('intake-f-fullname')?.value?.trim() || null,
        type: document.getElementById('intake-f-type').value || null,
        description: document.getElementById('intake-f-desc').value.trim() || null,
        proposal_lang: document.getElementById('intake-f-lang')?.value || 'en',
        national_agency: document.getElementById('intake-f-na')?.value || 'EACEA',
        start_date: document.getElementById('intake-f-start').value || null,
        duration_months: parseInt(document.getElementById('intake-f-dur').value) || 24,
        eu_grant: selectedProgram ? Number(selectedProgram.eu_grant_max) : 0,
        cofin_pct: selectedProgram ? (selectedProgram.cofin_pct || 80) : 80,
        indirect_pct: selectedProgram ? (Number(selectedProgram.indirect_pct) || 7) : 7,
      };
      if (currentProjectId) {
        // Guardar proyecto
        await API.patch('/intake/projects/' + currentProjectId, projectData);

        // Sync partners: update existing, create new, delete removed
        const serverPartners = await API.get('/intake/projects/' + currentProjectId + '/partners');
        const serverIds = (serverPartners || []).map(p => p.id);
        const localIds = partners.filter(p => p._server).map(p => p._server);
        const partnerOps = [];

        for (const pt of partners) {
          if (!pt.name || !pt.name.trim()) continue;
          if (pt._server) {
            // Update existing
            partnerOps.push(API.patch('/intake/partners/' + pt._server, {
              name: pt.name.trim(), city: pt.city || null, country: pt.country || null,
              organization_id: pt.organization_id || null
            }));
          } else {
            // Create new
            partnerOps.push(
              API.post('/intake/projects/' + currentProjectId + '/partners', {
                name: pt.name.trim(), city: pt.city || null, country: pt.country || null,
                organization_id: pt.organization_id || null
              }).then(created => { if (created) pt._server = created.id; })
            );
          }
        }
        // Delete removed partners
        for (const sid of serverIds) {
          if (!localIds.includes(sid)) {
            partnerOps.push(API.del('/intake/partners/' + sid).catch(() => {}));
          }
        }
        if (partnerOps.length) await Promise.all(partnerOps);

        _dirty = false;
        if (!silent) Toast.show('Proyecto actualizado', 'ok');
      } else {
        // Crear nuevo proyecto
        const project = await API.post('/intake/projects', projectData);
        currentProjectId = project.id;
        // Update contextual sidebar with the persisted project (real id + name).
        if (typeof App !== 'undefined' && App.setActiveProject) App.setActiveProject(project);

        // Socios y contexto en paralelo
        const ops = [];
        for (const pt of partners) {
          if (pt.name && pt.name.trim()) {
            ops.push(API.post('/intake/projects/' + currentProjectId + '/partners', {
              name: pt.name.trim(), city: pt.city || null, country: pt.country || null,
              organization_id: pt.organization_id || null
            }).then(created => { if (created) pt._server = created.id; }));
          }
        }
        if (ops.length) await Promise.all(ops);

        // Sync Calculator's project ID so its auto-save works
        if (calcInitialized && typeof Calculator !== 'undefined') {
          calcNeedsReinit = true;
          await ensureCalcInit();
        }

        _dirty = false;
        if (!silent) Toast.show('Proyecto guardado en servidor', 'ok');
      }
      _lastSaveError = null;
      if (silent) showIntakeSaveStatus('saved');
      if (!silent) loadServerProjects();
    } catch (err) {
      _lastSaveError = err;
      console.error('[Intake] saveToServer failed:', err && (err.code || err.status), err && err.message, err);
      if (silent) showIntakeSaveStatus('error', err && err.message);
      if (!silent) Toast.show('Error: ' + (err.message || err), 'err');
    }
  }

  /* ── Step navigation ─────────────────────────────────────────── */
  function setStep(s) {
    if (s < 0 || s >= STEPS.length) return;

    // Auto-save when changing steps (don't lose work)
    if (_dirty && currentProjectId) {
      saveToServer(true);
    } else if (_dirty && !currentProjectId) {
      // First save: create the project if we have at least a name
      const name = document.getElementById('intake-f-name')?.value?.trim();
      if (name) saveToServer(true);
    }

    const cfg = STEPS[s];

    // Hide all static panels
    document.querySelectorAll('#panel-intake .intake-step').forEach(p => {
      p.style.display = 'none';
    });

    // Show the right panel
    const panel = document.getElementById(cfg.panel);
    if (panel) panel.style.display = 'block';

    // If it's a calculator step, render into the dynamic container
    if (cfg.calc) {
      renderCalcStep(cfg.calc);
    }

    // If going to gantt step, render gantt UI
    if (cfg.key === 'gantt' && typeof IntakeGantt !== 'undefined') {
      ensureCalcInit().then(() => {
        IntakeGantt.render(document.getElementById('intake-gantt-container'), currentProjectId);
      });
    }

    // If going to tasks step, render tasks UI
    if (cfg.key === 'tareas' && typeof IntakeTasks !== 'undefined') {
      ensureCalcInit().then(() => {
        IntakeTasks.render(document.getElementById('intake-tasks-container'), currentProjectId);
      });
    }

    // If going to summary, build it with budget data + launch stats
    if (cfg.key === 'resumen') { renderLaunchStep(); setTimeout(autoResizeDesc, 60); }

    // Update unified phase-tabs: active + completion status
    if (typeof PhaseTabs !== 'undefined') {
      PhaseTabs.setActive('intake-step-nav', cfg.key);
      for (let i = 0; i < STEPS.length; i++) {
        const status = i < s ? 'complete' : (i === s ? 'in_progress' : 'pending');
        PhaseTabs.setStatus('intake-step-nav', STEPS[i].key, status);
      }
    }

    step = s;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextStep() {
    if (!validate(step)) return;
    setStep(step + 1);
  }

  /** Called by Calculator nav buttons in embedded mode */
  function calcNav(intakeStep) {
    setStep(intakeStep);
  }

  function validate(s) {
    if (s === 0) {
      if (!selectedProgram) { Toast.show('Selecciona un programa', 'err'); return false; }
      if (!document.getElementById('intake-f-name').value.trim()) {
        Toast.show('El nombre del proyecto es obligatorio', 'err');
        document.getElementById('intake-f-name').focus();
        return false;
      }
      const validPartners = partners.filter(p => p.name && p.country);
      if (validPartners.length < 2) {
        Toast.show('Necesitas al menos 2 socios con nombre y pa\u00EDs para continuar', 'err');
        return false;
      }
      return true;
    }
    return true;
  }

  /* ── Calculator lazy init ───────────────────────────────────── */
  async function ensureCalcInit() {
    if (calcInitialized && !calcNeedsReinit) return;

    // Build project data from form fields
    const projectData = {
      id: currentProjectId || 'intake-temp-' + Date.now(),
      name: document.getElementById('intake-f-name').value.trim(),
      type: document.getElementById('intake-f-type').value || null,
      start_date: document.getElementById('intake-f-start').value || null,
      duration_months: parseInt(document.getElementById('intake-f-dur').value) || 24,
      eu_grant: selectedProgram ? Number(selectedProgram.eu_grant_max) : 500000,
      cofin_pct: selectedProgram ? selectedProgram.cofin_pct : 80,
      indirect_pct: selectedProgram ? Number(selectedProgram.indirect_pct) : 7,
    };

    // Build partner list with stable IDs
    const partnerList = partners.filter(p => p.name).map((p, i) => ({
      id: p._server || ('local-' + p._local),
      name: p.name,
      city: p.city || '',
      country: p.country || '',
      order_index: i + 1,
      role: i === 0 ? 'applicant' : 'partner',
    }));

    await Calculator.initFromIntake(projectData, partnerList);
    Calculator.setNavCallback(calcNav);
    calcInitialized = true;
    calcNeedsReinit = false;

    // Auto-load ARISE demo activities if project is ARISE and no activities yet
    const calcState = Calculator.getCalcState();
    const acronym = document.getElementById('intake-f-name')?.value?.trim();
    const hasActivities = calcState.wps.some(wp => wp.activities.length > 1);
    if (acronym === 'ARISE' && !hasActivities && calcState.partners.length >= 4) {
      loadAriseActivities(calcState.partners);
    }
  }

  async function renderCalcStep(calcType) {
    try {
      await ensureCalcInit();
    } catch (err) {
      console.error('[Intake] ensureCalcInit failed:', err);
    }
    // Sync current form values into Calculator (duration/start may have changed)
    if (calcInitialized && typeof Calculator !== 'undefined' && Calculator.isInitialized()) {
      Calculator.updateProjectData({
        duration_months: parseInt(document.getElementById('intake-f-dur').value) || 24,
        start_date: document.getElementById('intake-f-start').value || null,
      });
    }
    const container = document.getElementById('intake-calc-container');
    if (container && typeof Calculator !== 'undefined' && Calculator.isInitialized()) {
      switch (calcType) {
        case 'rates':     Calculator.renderRatesInto(container); break;
        case 'mergedWPs': Calculator.renderMergedWPs(container); break;
        case 'results':   Calculator.renderResultsInto(container); break;
      }
    } else if (container) {
      container.innerHTML = '<div class="text-center py-16 text-on-surface-variant">Vuelve a Proyecto, completa los datos b\u00E1sicos y a\u00F1ade al menos 2 socios para ver esta secci\u00F3n.</div>';
    }
  }

  function loadAriseActivities(pts) {
    const st = Calculator;
    // Helper: month number (1-based) to ISO date from project start
    const psStr = document.getElementById('intake-f-start')?.value || '2027-03-01';
    const psY = parseInt(psStr.split('-')[0]);
    const psM = parseInt(psStr.split('-')[1]) - 1; // 0-based month

    function monthStartISO(m) {
      // Month 1 = project start month, Month 2 = next month, etc.
      const y = psY + Math.floor((psM + m - 1) / 12);
      const mo = (psM + m - 1) % 12;
      return `${y}-${String(mo+1).padStart(2,'0')}-01`;
    }
    function monthEndISO(m) {
      const y = psY + Math.floor((psM + m) / 12);
      const mo = (psM + m) % 12;
      const lastDay = new Date(y, mo, 0).getDate();
      const my = psY + Math.floor((psM + m - 1) / 12);
      const mm = (psM + m - 1) % 12;
      return `${my}-${String(mm+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    }
    function setDates(wi, actId, startM, endM) {
      const act = Calculator.getCalcState().wps[wi]?.activities?.find(a => a.id === actId);
      if (act) {
        act.date_start = monthStartISO(startM);
        act.date_end = monthEndISO(endM);
        act._gantt_start = startM;
        act._gantt_end = endM;
      }
    }

    // WP1: Management rates
    const wps = Calculator.getCalcState().wps;
    if (wps[0]?.activities[0]) {
      st._setAct(0, wps[0].activities[0].id, 'rate_applicant', 600);
      st._setAct(0, wps[0].activities[0].id, 'rate_partner', 300);
    }

    // WP1: 4 Transnational meetings + Local workshop
    st._addActivity(0, 'meeting'); st._addActivity(0, 'meeting'); st._addActivity(0, 'meeting');
    st._addActivity(0, 'local_ws');

    let cs = Calculator.getCalcState().wps;
    if (cs[0]?.activities[1]) { st._setActSubtype(0, cs[0].activities[1].id, 'Kick-off meeting'); st._setAct(0, cs[0].activities[1].id, 'pax', 2); st._setAct(0, cs[0].activities[1].id, 'days', 4); }
    if (cs[0]?.activities[2]) { st._setActSubtype(0, cs[0].activities[2].id, 'Mid-term meeting'); st._setAct(0, cs[0].activities[2].id, 'pax', 2); st._setAct(0, cs[0].activities[2].id, 'days', 4); if(pts[1]) st._setActHost(0, cs[0].activities[2].id, pts[1].id); }
    if (cs[0]?.activities[3]) { st._setActSubtype(0, cs[0].activities[3].id, 'Mid-term meeting'); st._setAct(0, cs[0].activities[3].id, 'pax', 2); st._setAct(0, cs[0].activities[3].id, 'days', 4); if(pts[2]) st._setActHost(0, cs[0].activities[3].id, pts[2].id); }
    if (cs[0]?.activities[4]) { st._setActSubtype(0, cs[0].activities[4].id, 'Final meeting'); st._setAct(0, cs[0].activities[4].id, 'pax', 2); st._setAct(0, cs[0].activities[4].id, 'days', 5); if(pts[3]) st._setActHost(0, cs[0].activities[4].id, pts[3].id); }

    // WP2: 2 LTTA + 2 IO
    st._addActivity(1, 'ltta'); st._addActivity(1, 'ltta');
    st._addActivity(1, 'io'); st._addActivity(1, 'io');

    cs = Calculator.getCalcState().wps;
    if (cs[1]?.activities[0]) { st._setActSubtype(1, cs[1].activities[0].id, 'Training mobility'); st._setAct(1, cs[1].activities[0].id, 'pax', 4); st._setAct(1, cs[1].activities[0].id, 'days', 6); if(pts[1]) st._setActHost(1, cs[1].activities[0].id, pts[1].id); }
    if (cs[1]?.activities[1]) { st._setActSubtype(1, cs[1].activities[1].id, 'Study visit mobility'); st._setAct(1, cs[1].activities[1].id, 'pax', 4); st._setAct(1, cs[1].activities[1].id, 'days', 6); if(pts[2]) st._setActHost(1, cs[1].activities[1].id, pts[2].id); }
    if (cs[1]?.activities[2]) { st._setActSubtype(1, cs[1].activities[2].id, 'Toolkit'); }
    if (cs[1]?.activities[3]) { st._setActSubtype(1, cs[1].activities[3].id, 'Methodological guide'); }

    // IO staff: set days to match budget
    cs = Calculator.getCalcState().wps;
    if (cs[1]?.activities[2]?.io_staff) {
      Object.keys(cs[1].activities[2].io_staff).forEach(pid => {
        const staff = cs[1].activities[2].io_staff[pid].staff;
        if (staff[0]) { staff[0].days = 20; }
      });
    }
    if (cs[1]?.activities[3]?.io_staff) {
      Object.keys(cs[1].activities[3].io_staff).forEach(pid => {
        const staff = cs[1].activities[3].io_staff[pid].staff;
        if (staff[0]) { staff[0].days = 60; }
      });
    }

    // WP3: Training big + Training + Volunteering + ME + Community WS
    st._addActivity(2, 'ltta'); st._addActivity(2, 'ltta'); st._addActivity(2, 'ltta');
    st._addActivity(2, 'me'); st._addActivity(2, 'local_ws');

    cs = Calculator.getCalcState().wps;
    if (cs[2]?.activities[0]) { st._setActSubtype(2, cs[2].activities[0].id, 'Training mobility'); st._setAct(2, cs[2].activities[0].id, 'pax', 10); st._setAct(2, cs[2].activities[0].id, 'days', 8); }
    if (cs[2]?.activities[1]) { st._setActSubtype(2, cs[2].activities[1].id, 'Training mobility'); st._setAct(2, cs[2].activities[1].id, 'pax', 4); st._setAct(2, cs[2].activities[1].id, 'days', 6); if(pts[3]) st._setActHost(2, cs[2].activities[1].id, pts[3].id); }
    if (cs[2]?.activities[2]) { st._setActSubtype(2, cs[2].activities[2].id, 'Volunteering mobility'); st._setAct(2, cs[2].activities[2].id, 'pax', 8); st._setAct(2, cs[2].activities[2].id, 'days', 50); }
    if (cs[2]?.activities[4]) { st._setActSubtype(2, cs[2].activities[4].id, 'Community workshop'); }

    // WP4: Dissemination + Website + Group mobility
    st._addActivity(3, 'campaign'); st._addActivity(3, 'website'); st._addActivity(3, 'ltta');

    cs = Calculator.getCalcState().wps;
    if (cs[3]?.activities[1]) { st._setActSubtype(3, cs[3].activities[1].id, 'Project website'); }
    if (cs[3]?.activities[2]) { st._setActSubtype(3, cs[3].activities[2].id, 'Group mobility'); st._setAct(3, cs[3].activities[2].id, 'pax', 4); st._setAct(3, cs[3].activities[2].id, 'days', 3); }

    // Set Gantt dates (month numbers)
    cs = Calculator.getCalcState().wps;
    // WP1: mgmt(1-24), kick-off(1-1), mid-term1(9-9), mid-term2(16-16), final(24-24), local_ws(auto)
    if (cs[0]?.activities[0]) setDates(0, cs[0].activities[0].id, 1, 24);
    if (cs[0]?.activities[1]) setDates(0, cs[0].activities[1].id, 1, 1);
    if (cs[0]?.activities[2]) setDates(0, cs[0].activities[2].id, 9, 9);
    if (cs[0]?.activities[3]) setDates(0, cs[0].activities[3].id, 16, 16);
    if (cs[0]?.activities[4]) setDates(0, cs[0].activities[4].id, 24, 24);
    if (cs[0]?.activities[5]) setDates(0, cs[0].activities[5].id, 2, 22);

    // WP2: training(4-5), study(13-14), toolkit IO(6-16), method guide IO(10-20)
    if (cs[1]?.activities[0]) setDates(1, cs[1].activities[0].id, 4, 5);
    if (cs[1]?.activities[1]) setDates(1, cs[1].activities[1].id, 13, 14);
    if (cs[1]?.activities[2]) setDates(1, cs[1].activities[2].id, 6, 16);
    if (cs[1]?.activities[3]) setDates(1, cs[1].activities[3].id, 10, 20);

    // WP3: training big(11-11), training2(20-20), volunteering(4-20), ME(21-24), community ws(18-23)
    if (cs[2]?.activities[0]) setDates(2, cs[2].activities[0].id, 11, 11);
    if (cs[2]?.activities[1]) setDates(2, cs[2].activities[1].id, 20, 20);
    if (cs[2]?.activities[2]) setDates(2, cs[2].activities[2].id, 4, 20);
    if (cs[2]?.activities[3]) setDates(2, cs[2].activities[3].id, 21, 24);
    if (cs[2]?.activities[4]) setDates(2, cs[2].activities[4].id, 18, 23);

    // WP4: dissemination(1-24), website(1-24), group mobility(23-23)
    if (cs[3]?.activities[0]) setDates(3, cs[3].activities[0].id, 1, 24);
    if (cs[3]?.activities[1]) setDates(3, cs[3].activities[1].id, 1, 24);
    if (cs[3]?.activities[2]) setDates(3, cs[3].activities[2].id, 23, 23);
  }

  /* ── Partners ────────────────────────────────────────────────── */
  function renderPartners() {
    const list = document.getElementById('intake-pt-list');
    if (!list) return;
    list.innerHTML = '';
    partners.forEach((p, i) => {
      const isApp = i === 0;
      const row = document.createElement('div');
      row.className = 'grid gap-2 items-center py-2 border-b border-outline-variant/50 relative';
      row.style.gridTemplateColumns = '28px 1fr 100px 110px 32px 80px 32px';
      row.innerHTML = `
        <span class="text-xs font-bold text-on-surface-variant text-center">${i + 1}</span>
        <input type="text" placeholder="Organisation name" value="${esc(p.name)}" data-idx="${i}" data-field="name"
          class="px-2.5 py-2 rounded-lg bg-white border border-outline-variant text-on-surface text-sm focus:border-primary focus:ring-2 focus:ring-secondary-fixed outline-none transition-all">
        <input type="text" placeholder="City" value="${esc(p.city)}" data-idx="${i}" data-field="city"
          class="px-2.5 py-2 rounded-lg bg-white border border-outline-variant text-on-surface text-sm focus:border-primary focus:ring-2 focus:ring-secondary-fixed outline-none transition-all">
        <input type="text" placeholder="Country" value="${esc(p.country)}" data-idx="${i}" data-field="country"
          class="px-2.5 py-2 rounded-lg bg-white border border-outline-variant text-on-surface text-sm focus:border-primary focus:ring-2 focus:ring-secondary-fixed outline-none transition-all">
        <button type="button" class="intake-search-entity w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors" data-idx="${i}" title="Buscar entidad">
          <span class="material-symbols-outlined text-base">search</span>
        </button>
        <span class="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded text-center ${isApp
          ? 'bg-secondary-fixed/20 text-primary-container border border-secondary-fixed-dim/40'
          : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'
        }">${isApp ? 'Coord.' : 'Socio'}</span>
        <button type="button" class="intake-remove-partner w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors ${isApp ? 'opacity-20 pointer-events-none' : ''}" data-idx="${i}">
          <span class="material-symbols-outlined text-base">close</span>
        </button>
      `;
      list.appendChild(row);
    });

    // Bind input changes
    list.querySelectorAll('input[data-idx]').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.idx);
        partners[idx][input.dataset.field] = input.value;
        _dirty = true; scheduleIntakeSave();
      });
    });

    // Bind entity search
    list.querySelectorAll('.intake-search-entity').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEntitySearch(parseInt(btn.dataset.idx));
      });
    });

    // Bind remove
    list.querySelectorAll('.intake-remove-partner').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (idx === 0) return;
        partners.splice(idx, 1);
        partners.forEach((p, j) => { p.order_index = j + 1; p.role = j === 0 ? 'applicant' : 'partner'; });
        calcNeedsReinit = true;
        _dirty = true;
        renderPartners();
        scheduleIntakeSave();
      });
    });
  }

  /* ── Entity search modal ─────────────────────────────────────── */
  let entityModal = null;
  let entityDebounce = null;

  function closeEntitySearch() {
    if (entityModal) { entityModal.remove(); entityModal = null; }
  }

  function openEntitySearch(partnerIdx) {
    closeEntitySearch();

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm';
    overlay.innerHTML = `
      <div class="entity-modal bg-white rounded-2xl shadow-2xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col overflow-hidden border border-outline-variant/30">
        <div class="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between">
          <div>
            <h3 class="font-headline text-lg font-bold text-primary">Directorio de entidades</h3>
            <p class="text-xs text-on-surface-variant mt-0.5">Selecciona una entidad para a\u00F1adirla al consorcio</p>
          </div>
          <button type="button" class="entity-modal-close w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="px-6 py-3 border-b border-outline-variant/20 flex flex-col gap-2">
          <input type="text" placeholder="Buscar por nombre o ciudad..." autofocus
            class="entity-search-input w-full px-4 py-2.5 rounded-lg bg-surface-container-low border border-outline-variant text-sm focus:border-primary focus:ring-2 focus:ring-secondary-fixed outline-none transition-all">
          <div class="flex gap-2">
            <select class="entity-filter-country flex-1 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant text-sm text-on-surface-variant cursor-pointer outline-none focus:border-primary">
              <option value="">Todos los pa\u00EDses</option>
            </select>
          </div>
        </div>
        <div class="entity-results flex-1 overflow-y-auto px-2 py-2"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    entityModal = overlay;

    const input = overlay.querySelector('.entity-search-input');
    const filterCountry = overlay.querySelector('.entity-filter-country');
    const results = overlay.querySelector('.entity-results');

    // Close on overlay click or close button
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeEntitySearch();
    });
    overlay.querySelector('.entity-modal-close').addEventListener('click', closeEntitySearch);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeEntitySearch();
    });

    // Load country options from ref_countries
    (async () => {
      try {
        const countries = await API.get('/admin/data/countries');
        countries.sort((a, b) => a.name_es.localeCompare(b.name_es));
        countries.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.iso2;
          opt.textContent = c.iso2 + ' \u2014 ' + c.name_es;
          filterCountry.appendChild(opt);
        });
      } catch { /* ignore — filter just won't have options */ }
    })();

    function doSearch() {
      clearTimeout(entityDebounce);
      entityDebounce = setTimeout(() => {
        searchAndRender(input.value.trim(), filterCountry.value);
      }, 250);
    }

    // Load all on open
    searchAndRender('', '');

    input.addEventListener('input', doSearch);
    filterCountry.addEventListener('change', doSearch);

    async function searchAndRender(q, country) {
      results.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">Buscando en el directorio (288k entidades)...</p>';
      try {
        // Search in the unified directory (entities/entity_enrichment view)
        const params = new URLSearchParams({ limit: '50', sort: 'quality' });
        if (q) params.set('q', q);
        if (country) params.set('country', country);
        const raw = await fetch('/v1/entities?' + params.toString(), {
          headers: { 'Authorization': 'Bearer ' + API.getToken() }
        }).then(r => r.json());
        const ents = (raw.ok && raw.data?.rows) ? raw.data.rows : [];

        if (!ents.length) {
          results.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">Sin resultados en el directorio</p>';
          return;
        }
        results.innerHTML = '<div class="space-y-2 p-2">' +
          ents.map(e => `
            <div class="entity-pick flex items-center gap-3 p-3 rounded-xl border border-outline-variant/20 hover:bg-primary/5 cursor-pointer transition-colors" data-oid="${esc(e.oid)}">
              ${e.logo_url
                ? `<img src="${esc(e.logo_url)}" alt="" class="w-10 h-10 rounded-lg object-contain border border-outline-variant/20 shrink-0 bg-white">`
                : `<div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-lg text-primary">apartment</span></div>`
              }
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-on-surface truncate">${esc(e.display_name || '(sin nombre)')}</div>
                <div class="text-xs text-on-surface-variant">${esc([e.city, e.country_code].filter(Boolean).join(', '))}${e.category ? ' · ' + esc(e.category) : ''}</div>
              </div>
              ${e.quality_tier ? `<span class="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">${esc(e.quality_tier)}</span>` : ''}
              <span class="text-[10px] font-mono text-on-surface-variant">OID: ${esc(e.oid)}</span>
              <span class="material-symbols-outlined text-primary text-lg shrink-0">add_circle</span>
            </div>
          `).join('') +
          '</div>';

        results.querySelectorAll('.entity-pick').forEach(el => {
          el.addEventListener('click', async () => {
            const oid = el.dataset.oid;
            // Visual feedback while we adopt the entity → org
            el.classList.add('opacity-50', 'pointer-events-none');
            try {
              const res = await fetch('/v1/organizations/from-entity', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + API.getToken(),
                },
                body: JSON.stringify({ oid }),
              }).then(r => r.json());
              if (!res.ok || !res.data?.id) {
                throw new Error(res.error?.message || 'No se pudo adoptar la entidad');
              }
              partners[partnerIdx].name = res.data.organization_name || '';
              partners[partnerIdx].city = res.data.city || '';
              partners[partnerIdx].country = res.data.country || '';
              partners[partnerIdx].organization_id = res.data.id;
              calcNeedsReinit = true;
              _dirty = true;
              renderPartners();
              scheduleIntakeSave();
              closeEntitySearch();
            } catch (e) {
              el.classList.remove('opacity-50', 'pointer-events-none');
              if (typeof Toast !== 'undefined') Toast.show(e.message || 'Error', 'err');
            }
          });
        });
      } catch (err) {
        results.innerHTML = '<p class="text-sm text-error py-8 text-center">Error al buscar en el directorio</p>';
      }
    }

    setTimeout(() => input.focus(), 50);
  }

  function addPartner() {
    pCounter++;
    partners.push({ _local: pCounter, name: '', city: '', country: '', role: 'partner', order_index: partners.length + 1 });
    calcNeedsReinit = true;
    _dirty = true;
    renderPartners();
  }

  /* ── Word counters ───────────────────────────────────────────── */
  function updateWC(c) {
    const ta = document.getElementById(c.ta);
    if (!ta) return;
    const n = ta.value.trim().split(/\s+/).filter(Boolean).length;
    const b = document.getElementById(c.badge);
    const f = document.getElementById(c.bar);
    if (!b || !f) return;

    b.textContent = n + ' palabra' + (n !== 1 ? 's' : '');
    if (n === 0) {
      b.className = 'text-xs font-semibold font-headline px-2.5 py-0.5 rounded border border-outline-variant bg-surface-container-low text-on-surface-variant transition-all';
      f.style.width = '0%'; f.style.background = '#cccccc';
    } else if (n < c.min) {
      b.className = 'text-xs font-semibold font-headline px-2.5 py-0.5 rounded border border-yellow-400 bg-yellow-50 text-yellow-700 transition-all';
      f.style.width = (n / c.max * 100) + '%'; f.style.background = '#eab308';
    } else if (n > c.max) {
      b.className = 'text-xs font-semibold font-headline px-2.5 py-0.5 rounded border border-error/40 bg-error-container text-on-error-container transition-all';
      f.style.width = '100%'; f.style.background = '#ba1a1a';
    } else {
      b.className = 'text-xs font-semibold font-headline px-2.5 py-0.5 rounded border border-green-300 bg-green-50 text-green-700 transition-all';
      f.style.width = (n / c.max * 100) + '%'; f.style.background = '#1b1464';
    }
  }

  /* ── Summary ─────────────────────────────────────────────────── */
  function buildSummary() {
    const name  = document.getElementById('intake-f-name').value.trim();
    const start = document.getElementById('intake-f-start').value;
    const dur   = document.getElementById('intake-f-dur').value;
    const desc  = document.getElementById('intake-f-desc').value.trim();
    const type  = document.getElementById('intake-f-type').value;

    document.getElementById('intake-sum-proj').innerHTML = `
      <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Nombre</span><span class="text-sm font-medium text-on-surface">${esc(name) || '\u2014'}</span></div>
      <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Tipo</span><span class="text-sm font-medium text-on-surface">${esc(type)}</span></div>
      <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Inicio previsto</span><span class="text-sm font-medium text-on-surface">${fmtDate(start)}</span></div>
      <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Duraci\u00F3n</span><span class="text-sm font-medium text-on-surface">${dur} meses</span></div>
      ${selectedProgram ? `<div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Subvenci\u00F3n m\u00E1x.</span><span class="text-sm font-medium text-on-surface">${Number(selectedProgram.eu_grant_max).toLocaleString('es-ES')} \u20AC</span></div>` : ''}
      ${desc ? `<div class="col-span-2">
        <details class="group">
          <summary class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant cursor-pointer select-none flex items-center gap-1">
            Descripci\u00F3n
            <span class="material-symbols-outlined text-xs transition-transform group-open:rotate-180">expand_more</span>
          </summary>
          <div class="text-sm font-medium text-on-surface leading-relaxed mt-1">${esc(desc)}</div>
        </details>
      </div>` : ''}
    `;

    document.getElementById('intake-sum-partners').innerHTML = partners.map((pt, i) => `
      <div class="flex items-center gap-2 py-2.5 ${i < partners.length - 1 ? 'border-b border-outline-variant/50' : ''}">
        <span class="text-xs font-bold text-on-surface-variant w-4">${i + 1}</span>
        <span class="font-headline text-sm font-bold text-primary">${esc(pt.name) || '\u2014'}</span>
        <span class="text-outline-variant">\u00B7</span>
        <span class="text-sm text-on-surface-variant flex-1">${[pt.city, pt.country].filter(Boolean).join(', ') || '\u2014'}</span>
        <span class="text-[11px] font-bold uppercase tracking-wide ${i === 0 ? 'text-primary' : 'text-on-surface-variant'}">${i === 0 ? 'Coordinador' : 'Socio'}</span>
      </div>
    `).join('');

    // Context summary removed — context is now in Writer Prep Studio

    // Budget summary (from Calculator state)
    const budgetEl = document.getElementById('intake-sum-budget');
    if (calcInitialized && typeof Calculator !== 'undefined' && Calculator.isInitialized()) {
      const cs = Calculator.getCalcState();
      const pb = Calculator.getPartnerBudgets();
      const fmt = n => '\u20AC' + Math.round(n).toLocaleString('es-ES');
      const fmtN = n => n ? Math.round(n).toLocaleString('es-ES') : '\u2014';

      // --- Helper: render EACEA line items (activities within a budget line) ---
      function renderLineItems(items) {
        if (!items.length) return '';
        return items.map(it => `
          <tr class="bgt-item">
            <td class="pl-12 py-0.5 text-on-surface-variant">${it.wp} <span class="text-on-surface">${it.label}</span></td>
            <td class="text-right font-mono">${fmtN(it.units)}</td>
            <td class="text-right font-mono">${fmtN(it.rate)}</td>
            <td class="text-right font-mono">${fmt(it.total)}</td>
          </tr>
        `).join('');
      }

      // --- Helper: render a sub-line (e.g. "Travel", "Accommodation") with expandable detail ---
      function subLine(label, items, indent) {
        const total = items.reduce((s, it) => s + it.total, 0);
        const units = items.reduce((s, it) => s + it.units, 0);
        const avgRate = units > 0 ? total / units : 0;
        const id = 'bgt-' + Math.random().toString(36).slice(2, 8);
        const hasItems = items.length > 0;
        return `
          <tr class="border-b border-outline-variant/5 ${hasItems ? 'cursor-pointer hover:bg-surface-container-low' : ''}" ${hasItems ? `onclick="document.querySelectorAll('.${id}').forEach(r=>r.classList.toggle('hidden'))"` : ''}>
            <td class="py-1 ${indent}" style="padding-left:${indent === 'pl-10' ? '2.5rem' : '2rem'}">
              ${hasItems ? '<span class="material-symbols-outlined text-[11px] align-middle mr-0.5 text-on-surface-variant">expand_more</span>' : '<span class="inline-block w-3"></span>'}
              ${label}
            </td>
            <td class="text-right font-mono">${hasItems ? fmtN(units) : '\u2014'}</td>
            <td class="text-right font-mono">${hasItems && avgRate ? fmtN(avgRate) : '\u2014'}</td>
            <td class="text-right font-mono font-medium">${total > 0 ? fmt(total) : '\u2014'}</td>
          </tr>
          ${items.map(it => `
            <tr class="${id} hidden border-b border-outline-variant/3">
              <td class="py-0.5 text-[10px] text-on-surface-variant" style="padding-left:3.5rem">
                <span class="font-semibold" style="color:${(pb.wpColors && pb.wpColors[it.wpIdx]) || '#666'}">${it.wp}</span> ${it.label}
              </td>
              <td class="text-right font-mono text-[10px]">${fmtN(it.units)}</td>
              <td class="text-right font-mono text-[10px]">${fmtN(it.rate)}</td>
              <td class="text-right font-mono text-[10px]">${fmt(it.total)}</td>
            </tr>
          `).join('')}
        `;
      }

      // --- Header: total budget ---
      let budgetHTML = `
        <div class="bg-primary text-white rounded-xl p-4 mb-4">
          <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Total presupuesto</div>
          <div class="font-headline text-2xl font-bold">${fmt(cs.total)}</div>
          <div class="flex gap-4 mt-2 text-xs opacity-70 flex-wrap">
            <span>Directo: <strong>${fmt(cs.directCosts)}</strong></span>
            <span>Indirecto ${cs.indirectPct}%: <strong>${fmt(cs.indirect)}</strong></span>
            <span>Target: <strong>${fmt(cs.financials.totalProject)}</strong></span>
          </div>
        </div>

        <!-- Tabs: Resumen | Por Socio -->
        <div class="flex gap-0 border-b-2 border-outline-variant/20 mb-4">
          <button class="intake-budget-tab px-4 py-2 text-xs font-bold uppercase tracking-wide border-b-2 -mb-[2px] cursor-pointer transition-colors border-primary text-primary" data-tab="summary" onclick="window._intakeBudgetTab('summary')">Resumen</button>
          <button class="intake-budget-tab px-4 py-2 text-xs font-bold uppercase tracking-wide border-b-2 -mb-[2px] cursor-pointer transition-colors border-transparent text-on-surface-variant hover:text-primary" data-tab="partners" onclick="window._intakeBudgetTab('partners')">Por Socio</button>
        </div>

        <!-- Tab: Resumen -->
        <div id="intake-budget-summary">
          <div class="space-y-1">
            ${cs.wps.map((wp, i) => {
              const wpDirect = wp.activities.reduce((s, a) => s + (a.total || 0), 0);
              return `<div class="flex justify-between py-1.5 text-sm border-b border-outline-variant/10">
                <span class="font-medium text-on-surface">WP${i+1} \u00B7 ${esc(wp.desc || wp.name || 'Sin t\u00EDtulo')}</span>
                <span class="font-mono text-on-surface-variant">${fmt(wpDirect)}</span>
              </div>`;
            }).join('')}
          </div>
          <div class="flex justify-between py-2 text-sm font-bold border-t border-outline-variant/30 mt-2">
            <span>Costes directos</span><span class="font-mono">${fmt(cs.directCosts)}</span>
          </div>
          <div class="flex justify-between py-1 text-xs text-on-surface-variant">
            <span>+ Indirecto ${cs.indirectPct}%</span><span class="font-mono">+ ${fmt(cs.indirect)}</span>
          </div>
          <div class="flex justify-between py-2 text-sm font-bold bg-primary/5 rounded px-2 mt-1">
            <span>TOTAL</span><span class="font-mono">${fmt(cs.total)}</span>
          </div>
        </div>

        <!-- Tab: Por Socio (EACEA official structure) -->
        <div id="intake-budget-partners" style="display:none">
          ${pb.partners.map((p, pi) => {
            const b = p.budget;
            const indAmt = b.directTotal * pb.indirectPct / 100;
            const grandTotal = b.directTotal + indAmt;
            const pctOfTotal = cs.total > 0 ? (grandTotal / cs.total * 100).toFixed(1) : '0';
            const sum = key => b.lines[key].reduce((s, it) => s + it.total, 0);

            return `
            <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 mb-4 overflow-hidden" style="border-top:3px solid ${p.color}">
              <!-- Partner header (always visible) -->
              <div class="flex items-center gap-2 px-4 py-3 cursor-pointer select-none" onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.expand-icon').classList.toggle('rotate-180')">
                <span class="w-7 h-7 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0" style="background:${p.color}">BE${String(pi+1).padStart(2,'0')}</span>
                <div class="flex-1 min-w-0">
                  <div class="font-headline text-sm font-bold truncate">${esc(p.name)}</div>
                  <div class="text-[10px] text-on-surface-variant">${p.country || ''}${p.isApplicant ? ' \u00B7 Coordinador' : ''}</div>
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="font-mono text-sm font-bold" style="color:${p.color}">${fmt(grandTotal)}</div>
                  <div class="text-[10px] text-on-surface-variant">${pctOfTotal}% del total</div>
                </div>
                <span class="material-symbols-outlined text-base text-on-surface-variant expand-icon transition-transform">expand_more</span>
              </div>

              <!-- EACEA Budget Table (collapsed by default) -->
              <div class="hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-[11px] border-collapse">
                    <thead>
                      <tr class="text-[9px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30" style="background:${p.color}08">
                        <th class="text-left py-1.5 px-3 font-bold">Concepto</th>
                        <th class="text-right py-1.5 px-2 font-bold w-16">Units</th>
                        <th class="text-right py-1.5 px-2 font-bold w-20">Cost/Unit</th>
                        <th class="text-right py-1.5 px-3 font-bold w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <!-- ═══ A. DIRECT PERSONNEL COSTS ═══ -->
                      <tr class="font-bold border-b border-outline-variant/20" style="background:${p.color}06">
                        <td class="py-1.5 px-3" colspan="3">A. DIRECT PERSONNEL COSTS</td>
                        <td class="text-right py-1.5 px-3 font-mono">${b.A > 0 ? fmt(b.A) : '\u2014'}</td>
                      </tr>
                      <!-- A.1 Employees -->
                      <tr class="border-b border-outline-variant/10 font-semibold">
                        <td class="py-1 pl-5">A.1 Employees (or equivalent)</td>
                        <td class="text-right font-mono" colspan="2">person months</td>
                        <td class="text-right font-mono px-3">${b.A1 > 0 ? fmt(b.A1) : '\u2014'}</td>
                      </tr>
                      ${subLine('Project Coordinator', b.lines.A1_coord, 'pl-10')}
                      ${subLine('Other Staff (IOs)', b.lines.A1_staff, 'pl-10')}
                      <!-- A.2-A.5 (empty) -->
                      <tr class="border-b border-outline-variant/5 text-on-surface-variant/50"><td class="py-0.5 pl-5">A.2 Natural persons under direct contract</td><td colspan="3" class="text-right px-3">\u2014</td></tr>
                      <tr class="border-b border-outline-variant/5 text-on-surface-variant/50"><td class="py-0.5 pl-5">A.3 Seconded persons</td><td colspan="3" class="text-right px-3">\u2014</td></tr>
                      <tr class="border-b border-outline-variant/5 text-on-surface-variant/50"><td class="py-0.5 pl-5">A.4 SME Owners without salary</td><td colspan="3" class="text-right px-3">\u2014</td></tr>
                      <tr class="border-b border-outline-variant/10 text-on-surface-variant/50"><td class="py-0.5 pl-5">A.5 Volunteers</td><td colspan="3" class="text-right px-3">\u2014</td></tr>

                      <!-- ═══ B. SUBCONTRACTING ═══ -->
                      <tr class="font-bold border-b border-outline-variant/20 text-on-surface-variant/60" style="background:${p.color}06">
                        <td class="py-1.5 px-3" colspan="3">B. Subcontracting costs</td>
                        <td class="text-right py-1.5 px-3 font-mono">\u2014</td>
                      </tr>

                      <!-- ═══ C. PURCHASE COSTS ═══ -->
                      <tr class="font-bold border-b border-outline-variant/20" style="background:${p.color}06">
                        <td class="py-1.5 px-3" colspan="3">C. Purchase costs</td>
                        <td class="text-right py-1.5 px-3 font-mono">${b.C > 0 ? fmt(b.C) : '\u2014'}</td>
                      </tr>
                      <!-- C.1 Travel and subsistence -->
                      <tr class="border-b border-outline-variant/10 font-semibold">
                        <td class="py-1 pl-5">C.1 Travel and subsistence</td>
                        <td class="text-right font-mono" colspan="2">per travel or day</td>
                        <td class="text-right font-mono px-3">${b.C1 > 0 ? fmt(b.C1) : '\u2014'}</td>
                      </tr>
                      ${subLine('Travel', b.lines.C1_travel, 'pl-10')}
                      ${subLine('Accommodation', b.lines.C1_accom, 'pl-10')}
                      ${subLine('Subsistence', b.lines.C1_subs, 'pl-10')}
                      <!-- C.2 Equipment -->
                      <tr class="border-b border-outline-variant/10 font-semibold">
                        <td class="py-1 pl-5">C.2 Equipment</td>
                        <td colspan="2"></td>
                        <td class="text-right font-mono px-3">${b.C2 > 0 ? fmt(b.C2) : '\u2014'}</td>
                      </tr>
                      ${b.lines.C2.length ? subLine('Equipment items', b.lines.C2, 'pl-10') : ''}
                      <!-- C.3 Other goods, works and services -->
                      <tr class="border-b border-outline-variant/10 font-semibold">
                        <td class="py-1 pl-5">C.3 Other goods, works and services</td>
                        <td colspan="2"></td>
                        <td class="text-right font-mono px-3">${b.C3 > 0 ? fmt(b.C3) : '\u2014'}</td>
                      </tr>
                      ${subLine('Consumables', b.lines.C3_cons, 'pl-10')}
                      ${subLine('Services: Meetings, Seminars', b.lines.C3_meet, 'pl-10')}
                      ${subLine('Services: Communication / Dissemination', b.lines.C3_comms, 'pl-10')}
                      ${subLine('Website', b.lines.C3_web, 'pl-10')}
                      ${subLine('Artistic Fees', b.lines.C3_art, 'pl-10')}
                      ${subLine('Other', b.lines.C3_other, 'pl-10')}

                      <!-- ═══ D. OTHER COST CATEGORIES ═══ -->
                      <tr class="font-bold border-b border-outline-variant/20 text-on-surface-variant/60" style="background:${p.color}06">
                        <td class="py-1.5 px-3" colspan="3">D. Other cost categories</td>
                        <td class="text-right py-1.5 px-3 font-mono">\u2014</td>
                      </tr>
                      <tr class="border-b border-outline-variant/10 text-on-surface-variant/50"><td class="py-0.5 pl-5">D.1 Financial support to third parties</td><td colspan="3" class="text-right px-3">\u2014</td></tr>

                      <!-- ═══ TOTALS ═══ -->
                      <tr class="font-bold border-b-2 border-outline-variant/30" style="background:${p.color}0c">
                        <td class="py-2 px-3" colspan="3">TOTAL DIRECT COSTS (A+B+C+D)</td>
                        <td class="text-right py-2 px-3 font-mono">${fmt(b.directTotal)}</td>
                      </tr>
                      <tr class="border-b border-outline-variant/20">
                        <td class="py-1.5 px-3 font-semibold" colspan="3">E. Indirect costs ${pb.indirectPct}%</td>
                        <td class="text-right py-1.5 px-3 font-mono font-semibold">${fmt(indAmt)}</td>
                      </tr>
                      <tr class="font-bold text-white" style="background:${p.color}">
                        <td class="py-2 px-3 rounded-bl-lg" colspan="3">TOTAL COSTS (A+B+C+D+E)</td>
                        <td class="text-right py-2 px-3 font-mono rounded-br-lg">${fmt(grandTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <!-- Progress bar -->
              <div class="h-1" style="background:${p.color}15"><div class="h-full transition-all" style="width:${pctOfTotal}%;background:${p.color}"></div></div>
            </div>`;
          }).join('')}
          <div class="bg-primary text-white rounded-xl p-3 flex justify-between items-center">
            <span class="font-headline font-bold text-sm">TOTAL PROYECTO</span>
            <span class="font-mono text-lg font-bold">${fmt(cs.total)}</span>
          </div>
        </div>`;

      if (budgetEl) {
        budgetEl.innerHTML = budgetHTML;
      }

      // Tab switcher
      window._intakeBudgetTab = function(tab) {
        document.getElementById('intake-budget-summary').style.display = tab === 'summary' ? '' : 'none';
        document.getElementById('intake-budget-partners').style.display = tab === 'partners' ? '' : 'none';
        document.querySelectorAll('.intake-budget-tab').forEach(btn => {
          const active = btn.dataset.tab === tab;
          btn.className = 'intake-budget-tab px-4 py-2 text-xs font-bold uppercase tracking-wide border-b-2 -mb-[2px] cursor-pointer transition-colors ' +
            (active ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-primary');
        });
      };
    } else if (budgetEl) {
      budgetEl.innerHTML = '<p class="text-sm text-on-surface-variant italic">No se ha configurado el presupuesto a\u00FAn</p>';
    }
  }

  /* ── Launch step (step 10) ─────────────────────────────────── */
  function renderLaunchStep() {
    // Mark Resumen as active and the previous step as complete in the phase tabs.
    const resIdx = STEPS.length - 1;
    if (typeof PhaseTabs !== 'undefined') {
      PhaseTabs.setActive('intake-step-nav', STEPS[resIdx].key);
      if (resIdx > 0) PhaseTabs.setStatus('intake-step-nav', STEPS[resIdx - 1].key, 'complete');
      PhaseTabs.setStatus('intake-step-nav', STEPS[resIdx].key, 'in_progress');
    }

    // Show call summary if available
    const summaryBox = document.getElementById('intake-call-summary-box');
    const summaryText = document.getElementById('intake-call-summary-text');
    const summaryPreview = document.getElementById('intake-call-summary-preview');
    if (summaryBox && summaryText && selectedProgram) {
      if (selectedProgram.call_summary) {
        summaryText.textContent = selectedProgram.call_summary;
        if (summaryPreview) summaryPreview.textContent = selectedProgram.call_summary.split('\n')[0];
        summaryBox.classList.remove('hidden');
      } else {
        summaryBox.classList.add('hidden');
      }
    }

    initInterview();
  }

  /* ── AI Interview ──────────────────────────────────────────── */
  let interviewLoading = false;

  async function initInterview() {
    const startBtn = document.getElementById('intake-interview-start');
    const chatEl = document.getElementById('intake-interview-chat');
    if (!startBtn || !chatEl) return;

    // Load existing interview if project is saved
    if (!currentProjectId) return;
    try {
      const res = await API.get('/intake/projects/' + currentProjectId + '/interview');
      if (res.turns && res.turns.length > 0) {
        startBtn.classList.add('hidden');
        chatEl.classList.remove('hidden');
        const msgEl = document.getElementById('intake-interview-messages');
        if (msgEl) msgEl.innerHTML = '';
        res.turns.forEach(t => {
          if (t.content === '[INTERVIEW_COMPLETE]') return;
          renderInterviewTurn(t.role, t.content);
        });
        if (res.completed) {
          const inputArea = document.getElementById('intake-interview-input-area');
          if (inputArea) inputArea.classList.add('hidden');
        }
        // Update progress
        const userCount = res.turns.filter(t => t.role === 'user').length;
        updateInterviewProgress(userCount, 6);
        // If summary exists, populate textarea and show launch section
        if (res.summary) {
          const desc = document.getElementById('intake-f-desc');
          if (desc && !desc.value.trim()) {
            desc.value = res.summary;
            desc.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(autoResizeDesc, 50);
          }
          showPostInterview();
        }
      }
    } catch (e) { /* no interview yet, that's ok */ }
  }

  async function startInterview() {
    if (!currentProjectId) {
      // Auto-save project first
      const name = document.getElementById('intake-f-name')?.value?.trim();
      if (!name) { Toast.show('Guarda el proyecto antes de iniciar la entrevista', 'err'); return; }
      await saveToServer(true);
      if (!currentProjectId) {
        const detail = _lastSaveError && (_lastSaveError.message || _lastSaveError.code) || 'causa desconocida';
        Toast.show('Error guardando el proyecto: ' + detail, 'err');
        return;
      }
    }
    // Also save calculator state so backend has WP data
    if (typeof Calculator !== 'undefined') {
      try { await ensureCalcInit(); await Calculator.forceSave(); } catch (e) {}
    }

    const startBtn = document.getElementById('intake-interview-start');
    if (startBtn) startBtn.classList.add('hidden');
    const chatEl = document.getElementById('intake-interview-chat');
    if (chatEl) chatEl.classList.remove('hidden');

    // Show typing indicator and call API
    showTypingIndicator();
    try {
      const res = await API.post('/intake/projects/' + currentProjectId + '/interview/next', { answer: null });
      removeTypingIndicator();
      if (res.content) renderInterviewTurn('assistant', res.content);
      updateInterviewProgress(res.progress || 0, res.total_questions || 6);
    } catch (e) {
      removeTypingIndicator();
      renderInterviewTurn('assistant', 'Error starting interview: ' + e.message);
    }
  }

  async function sendAnswer() {
    if (interviewLoading) return;
    const inputEl = document.getElementById('intake-interview-input');
    if (!inputEl) return;
    const answer = inputEl.value.trim();
    if (!answer) return;

    // Render user bubble
    renderInterviewTurn('user', answer);
    inputEl.value = '';
    interviewLoading = true;
    const sendBtn = document.getElementById('intake-interview-send');
    if (sendBtn) sendBtn.disabled = true;

    showTypingIndicator();
    try {
      const res = await API.post('/intake/projects/' + currentProjectId + '/interview/next', { answer });
      removeTypingIndicator();

      if (res.type === 'summary') {
        // Interview complete — populate summary textarea and show launch section
        const desc = document.getElementById('intake-f-desc');
        if (desc) {
          desc.value = res.content;
          desc.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(autoResizeDesc, 50);
        }
        updateInterviewProgress(res.progress, res.total_questions);
        // Hide input area, show completion message
        const inputArea = document.getElementById('intake-interview-input-area');
        if (inputArea) inputArea.classList.add('hidden');
        renderInterviewTurn('assistant', 'The interview is complete! I have generated a Project Summary draft below. Please review and edit it before launching.');
        Toast.show('Project Summary generated!', 'ok');
        // Show post-interview launch section
        showPostInterview();
        // Scroll to textarea
        desc?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        renderInterviewTurn('assistant', res.content);
        updateInterviewProgress(res.progress || 0, res.total_questions || 6);
      }
    } catch (e) {
      removeTypingIndicator();
      renderInterviewTurn('assistant', 'Error: ' + e.message + '. Please try again.');
    }
    interviewLoading = false;
    if (sendBtn) sendBtn.disabled = false;
    document.getElementById('intake-interview-input')?.focus();
  }

  function renderInterviewTurn(role, content) {
    const msgEl = document.getElementById('intake-interview-messages');
    if (!msgEl) return;
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    if (role === 'assistant') {
      msgEl.insertAdjacentHTML('beforeend', `
        <div class="flex gap-2.5 items-start">
          <span class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span class="material-symbols-outlined text-primary text-xs">smart_toy</span>
          </span>
          <div class="bg-secondary-fixed/10 rounded-xl rounded-tl-sm px-3.5 py-2.5 text-sm text-on-surface leading-relaxed max-w-[85%]">${escaped}</div>
        </div>`);
    } else {
      msgEl.insertAdjacentHTML('beforeend', `
        <div class="flex justify-end">
          <div class="bg-primary/10 rounded-xl rounded-tr-sm px-3.5 py-2.5 text-sm text-on-surface leading-relaxed max-w-[85%]">${escaped}</div>
        </div>`);
    }
    msgEl.scrollTop = msgEl.scrollHeight;
  }

  function showTypingIndicator() {
    const msgEl = document.getElementById('intake-interview-messages');
    if (!msgEl) return;
    msgEl.insertAdjacentHTML('beforeend', `
      <div id="intake-interview-typing" class="flex gap-2.5 items-start">
        <span class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span class="material-symbols-outlined text-primary text-xs">smart_toy</span>
        </span>
        <div class="bg-secondary-fixed/10 rounded-xl rounded-tl-sm px-3.5 py-2.5 text-sm text-on-surface-variant">
          <span class="inline-flex gap-1"><span class="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style="animation-delay:0ms"></span><span class="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style="animation-delay:150ms"></span><span class="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style="animation-delay:300ms"></span></span>
        </div>
      </div>`);
    msgEl.scrollTop = msgEl.scrollHeight;
  }

  function removeTypingIndicator() {
    document.getElementById('intake-interview-typing')?.remove();
  }

  function updateInterviewProgress(current, total) {
    const bar = document.getElementById('intake-interview-progress-bar');
    const label = document.getElementById('intake-interview-progress-label');
    if (bar) bar.style.width = Math.round((current / total) * 100) + '%';
    if (label) label.textContent = current + '/' + total;
  }

  function showPostInterview() {
    const postEl = document.getElementById('intake-post-interview');
    if (postEl) postEl.classList.remove('hidden');
    // Re-render stats
    const statsEl = document.getElementById('intake-launch-stats');
    if (statsEl) {
      const nPartners = partners.filter(p => p.name).length;
      let nWPs = 0, nActs = 0, budget = '—';
      if (calcInitialized && typeof Calculator !== 'undefined' && Calculator.isInitialized()) {
        const cs = Calculator.getCalcState();
        nWPs = cs.wps.length;
        nActs = cs.wps.reduce((s, wp) => s + wp.activities.length, 0);
        budget = '\u20AC' + Math.round(cs.total).toLocaleString('es-ES');
      }
      statsEl.innerHTML = [
        { icon: 'groups', label: 'Partners', value: nPartners },
        { icon: 'account_tree', label: 'Work Packages', value: nWPs },
        { icon: 'task_alt', label: 'Actividades', value: nActs },
        { icon: 'payments', label: 'Presupuesto', value: budget },
      ].map(s => `
        <div class="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-4 text-center">
          <span class="material-symbols-outlined text-2xl text-primary mb-1 block">${s.icon}</span>
          <div class="font-headline text-xl font-extrabold text-on-surface">${s.value}</div>
          <div class="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">${s.label}</div>
        </div>
      `).join('');
    }
    // Bind launch button
    const btn = document.getElementById('intake-btn-launch');
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', launchProject);
    }
    updateLaunchGate();
  }

  async function resetInterview() {
    if (!confirm('Restart the interview? All answers will be deleted.')) return;
    try {
      await API.del('/intake/projects/' + currentProjectId + '/interview');
      const msgEl = document.getElementById('intake-interview-messages');
      if (msgEl) msgEl.innerHTML = '';
      const chatEl = document.getElementById('intake-interview-chat');
      if (chatEl) chatEl.classList.add('hidden');
      const startBtn = document.getElementById('intake-interview-start');
      if (startBtn) startBtn.classList.remove('hidden');
      const inputArea = document.getElementById('intake-interview-input-area');
      if (inputArea) inputArea.classList.remove('hidden');
      updateInterviewProgress(0, 6);
      const desc = document.getElementById('intake-f-desc');
      if (desc) { desc.value = ''; desc.dispatchEvent(new Event('input', { bubbles: true })); }
      // Hide post-interview section
      const postEl = document.getElementById('intake-post-interview');
      if (postEl) postEl.classList.add('hidden');
    } catch (e) { Toast.show('Error resetting interview', 'error'); }
  }

  function autoResizeDesc() {
    const el = document.getElementById('intake-f-desc');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  /**
   * Toggle vista renderizada (preview) ↔ edición (textarea).
   * Vista por defecto cuando hay texto. Click en la vista → modo edición.
   * Blur del textarea con texto → vuelve a vista.
   */
  function renderDescPreview() {
    const ta = document.getElementById('intake-f-desc');
    const out = document.getElementById('intake-f-desc-rendered');
    const editBtn = document.getElementById('intake-f-desc-edit-btn');
    if (!ta || !out) return;
    const raw = (ta.value || '').trim();
    if (!raw) {
      // Sin texto: solo textarea visible (modo composición).
      out.classList.add('hidden'); out.innerHTML = '';
      ta.classList.remove('hidden');
      if (editBtn) editBtn.classList.add('hidden');
      return;
    }
    out.innerHTML = mdSummaryToHtml(raw);
    // Si NO está en modo edición ahora, mostrar preview y ocultar textarea.
    if (!ta.dataset.editing) {
      out.classList.remove('hidden');
      ta.classList.add('hidden');
      if (editBtn) editBtn.classList.remove('hidden');
    }
  }

  function enterEditMode() {
    const ta = document.getElementById('intake-f-desc');
    const out = document.getElementById('intake-f-desc-rendered');
    const editBtn = document.getElementById('intake-f-desc-edit-btn');
    if (!ta || !out) return;
    ta.dataset.editing = '1';
    out.classList.add('hidden');
    ta.classList.remove('hidden');
    if (editBtn) editBtn.classList.add('hidden');
    setTimeout(() => { autoResizeDesc(); ta.focus(); }, 0);
  }

  function exitEditMode() {
    const ta = document.getElementById('intake-f-desc');
    if (!ta) return;
    delete ta.dataset.editing;
    renderDescPreview();
  }

  // Markdown más completo: **bold**, *italic*, # headers, listas (* / -), párrafos.
  // Escapa HTML para evitar XSS. Después de procesar markdown, elimina cualquier
  // asterisco/guion suelto que quede para que la vista esté limpia.
  function mdSummaryToHtml(text) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let t = String(text).replace(/\r\n/g, '\n').trim();
    const blocks = t.split(/\n{2,}/);

    const renderInline = (s) => {
      let r = esc(s);
      r = r.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
      r = r.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
      r = r.replace(/(?<![A-Za-z0-9])\*([^*\n]+?)\*(?![A-Za-z0-9])/g, '<em>$1</em>');
      r = r.replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, '<em>$1</em>');
      r = r.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
      r = r.replace(/[ \t]*\*[ \t]*/g, ' ');
      return r.replace(/  +/g, ' ').trim();
    };

    const html = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';

      const headingMatch = trimmed.match(/^(#{1,6})[ \t]+(.+)$/);
      if (headingMatch && !/\n/.test(trimmed)) {
        const level = Math.min(6, Math.max(2, headingMatch[1].length + 1));
        return `<h${level}>${renderInline(headingMatch[2])}</h${level}>`;
      }

      const lines = trimmed.split('\n');
      const isList = lines.every(l => /^\s*[*\-•][ \t]+/.test(l));
      if (isList && lines.length >= 1) {
        const items = lines.map(l => l.replace(/^\s*[*\-•][ \t]+/, '').trim());
        return `<ul>${items.map(it => `<li>${renderInline(it)}</li>`).join('')}</ul>`;
      }

      const inlineRendered = renderInline(trimmed).replace(/\n/g, '<br>');
      if (/^<strong>[^<]+<\/strong>$/.test(inlineRendered)) {
        return `<h3>${inlineRendered.replace(/<\/?strong>/g, '')}</h3>`;
      }
      return `<p>${inlineRendered}</p>`;
    }).join('');

    return html;
  }

  function updateLaunchGate() {
    const desc = document.getElementById('intake-f-desc');
    const btn = document.getElementById('intake-btn-launch');
    if (!desc || !btn) return;
    const hasText = desc.value.trim().length >= 20;
    btn.disabled = !hasText;
    btn.classList.toggle('opacity-40', !hasText);
    btn.classList.toggle('pointer-events-none', !hasText);
    btn.title = hasText ? '' : 'Escribe el Project Summary antes de continuar';
  }

  async function launchProject() {
    // Auto-save if not saved yet
    if (!currentProjectId) {
      const name = document.getElementById('intake-f-name')?.value?.trim();
      if (!name) { Toast.show('Escribe un nombre de proyecto antes de continuar', 'err'); return; }
      await saveToServer(true);
      if (!currentProjectId) {
        const detail = _lastSaveError && (_lastSaveError.message || _lastSaveError.code) || 'causa desconocida';
        Toast.show('Error guardando el proyecto: ' + detail, 'err');
        return;
      }
    }

    // Save current state first (project + partners)
    await saveToServer(true);

    // Ensure Calculator is initialized before saving (user may have skipped WP steps)
    if (typeof Calculator !== 'undefined') {
      try {
        await ensureCalcInit();
        await Calculator.forceSave();
        console.log('[Intake] Calculator state saved before launch');
      } catch (err) {
        console.warn('[Intake] Calculator save warning:', err);
      }
    }

    try {
      await API.patch('/intake/projects/' + currentProjectId + '/launch', {});
      Toast.show('Proyecto lanzado a escritura', 'ok');

      // Navigate to Write module
      location.hash = 'developer';
      document.querySelectorAll('#content-area .panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('panel-developer');
      if (panel) panel.classList.add('active');
      document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.route === 'developer');
      });
      document.getElementById('topbar-title').textContent = 'Write';
      if (typeof Developer !== 'undefined') Developer.init();
    } catch (err) {
      Toast.show('Error: ' + (err.message || err), 'err');
    }
  }

  /* ── File save/load ──────────────────────────────────────────── */
  function buildJSON() {
    return {
      meta: { version: '1.0', tool: 'erasmus-intake', generated_at: new Date().toISOString(), source_module: 'intake' },
      program: selectedProgram ? selectedProgram.program_id : null,
      fields: {
        proj_name:    document.getElementById('intake-f-name').value.trim(),
        proj_type:    document.getElementById('intake-f-type').value,
        proj_desc:    document.getElementById('intake-f-desc').value.trim(),
        proj_start:   document.getElementById('intake-f-start').value,
        months:       String(document.getElementById('intake-f-dur').value),
        eu_grant:     selectedProgram ? String(selectedProgram.eu_grant_max) : '0',
        cofin_pct:    selectedProgram ? String(selectedProgram.cofin_pct) : '0',
        indirect_pct: selectedProgram ? String(selectedProgram.indirect_pct) : '0',
      },
      partners: partners.map(pt => ({ name: pt.name, city: pt.city, country: pt.country, role: pt.role, order_index: pt.order_index }))
    };
  }

  function saveToFile() {
    const json = buildJSON();
    const slug = (json.fields.proj_name || 'intake').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = slug + '-intake.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
    Toast.show('Intake guardado como JSON', 'ok');
  }

  function loadFromFile(ev) {
    const file = ev.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = e => {
      try {
        const d = JSON.parse(e.target.result);
        restoreFromJSON(d);
        Toast.show('Archivo cargado', 'ok');
      } catch { Toast.show('Error al leer el JSON', 'err'); }
    };
    r.readAsText(file);
    ev.target.value = '';
  }

  function restoreFromJSON(d) {
    const f = d.fields || {};
    if (f.proj_name) document.getElementById('intake-f-name').value = f.proj_name;
    if (f.proj_desc) document.getElementById('intake-f-desc').value = f.proj_desc;
    if (f.proj_start) document.getElementById('intake-f-start').value = f.proj_start;
    if (f.proj_type) document.getElementById('intake-f-type').value = f.proj_type;
    if (f.months) {
      const sel = document.getElementById('intake-f-dur');
      for (const o of sel.options) { if (o.value == f.months) { o.selected = true; break; } }
    }

    // Match program (only set selectedProgram + type, don't overwrite project duration/start)
    if (d.program && programs.length) {
      const match = programs.find(p => p.program_id === d.program);
      if (match) {
        selectedProgram = match;
        const setVal = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v || ''; };
        setVal('intake-f-type', match.action_type || '');
        setVal('intake-f-type-visible', match.action_type || '');
      }
    }

    const pl = d.partners || (d.state && d.state.partners);
    if (pl && pl.length) {
      partners = pl.map((p, i) => ({
        _local: i + 1, name: p.name || '', city: p.city || '', country: p.country || '',
        role: i === 0 ? 'applicant' : 'partner', order_index: i + 1
      }));
      pCounter = partners.length;
      renderPartners();
    }

    currentProjectId = null;
    setStep(0);
  }

  function exportWizard() {
    const json = buildJSON();
    // Add wizard-specific fields
    json.state = {
      maxReached: 1,
      partners: partners.map(pt => ({ ...pt })),
      routes: {}, wps: [], workerRates: [], wrCounter: 0,
      perdiemRates: {}, extraDestinations: []
    };
    const slug = (json.fields.proj_name || 'proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = slug + '-wizard-ready.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
    Toast.show('JSON exportado para Calculator', 'ok');
  }

  /* ── Reset form ──────────────────────────────────────────────── */
  function resetForm() {
    currentProjectId = null;
    _dirty = false;
    calcInitialized = false;
    calcNeedsReinit = false;
    document.getElementById('intake-f-name').value = '';
    const fullnameEl = document.getElementById('intake-f-fullname');
    if (fullnameEl) fullnameEl.value = '';
    document.getElementById('intake-f-desc').value = '';
    renderDescPreview();
    document.getElementById('intake-f-start').value = '';
    // Reset visible fields too
    const startVis = document.getElementById('intake-f-start-visible');
    if (startVis) startVis.value = '';
    const durVis = document.getElementById('intake-f-dur-visible');
    if (durVis) durVis.value = '24';
    const typeVis = document.getElementById('intake-f-type-visible');
    if (typeVis) typeVis.value = '';
    partners = [{ _local: 1, name: '', city: '', country: '', role: 'applicant', order_index: 1 }];
    pCounter = 1;
    renderPartners();
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toDateStr(v) {
    if (!v) return '';
    // Handle ISO datetime strings like "2026-08-31T22:00:00.000Z"
    if (typeof v === 'string') return v.slice(0, 10);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }

  function fmtDate(iso) {
    const s = toDateStr(iso);
    if (!s) return '\u2014';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  /* ── Demo preload ────────────────────────────────────────────── */
  async function preloadDemo() {
    init();
    resetForm();

    // Select first program if available
    if (programs.length > 0) selectProgram(programs[0].id);

    // Project data — ARISE KA3-Youth (load from server if exists)
    document.getElementById('intake-f-name').value = 'ARISE';
    const fullName = document.getElementById('intake-f-fullname');
    if (fullName) fullName.value = 'Acci\u00F3n para la Resiliencia e Innovaci\u00F3n Social en Europa';
    document.getElementById('intake-f-desc').value = 'ARISE is a KA3 European Youth Together project that empowers young people aged 18\u201330 to become agents of social inclusion through sport and non-formal education. Through a network of 4 organisations in 4 countries, the project designs and tests innovative youth-led programmes combining physical activity, intercultural dialogue and digital storytelling to reach marginalised communities \u2014 particularly young migrants, NEETs and youth with fewer opportunities in rural and peri-urban areas. Over 24 months, ARISE will train 80 youth leaders, run 16 local pilot actions, organise 3 transnational youth exchanges and produce an open-access Youth Inclusion Toolkit validated by peer evaluation across all partner countries.';
    document.getElementById('intake-f-start').value = '2027-03-01';
    const durHidden = document.getElementById('intake-f-dur');
    if (durHidden) durHidden.value = '24';

    // 4 Partners — from organization directory
    partners = [
      { _local: 1, _server: null, name: 'Permacultura Cantabria',  city: 'Santander',              country: 'Spain',   role: 'applicant', order_index: 1, organization_id: 'a95547b3-ed92-4b7f-acd4-1d9911983124' },
      { _local: 2, _server: null, name: 'Citizens In Power',       city: 'Nicosia',                country: 'Cyprus',  role: 'partner',   order_index: 2, organization_id: 'e27edf33-3607-44e0-99d0-495f92887795' },
      { _local: 3, _server: null, name: 'Culture Goes Europe',     city: 'Magdeburg',              country: 'Germany', role: 'partner',   order_index: 3, organization_id: '14eae096-5d0a-4b59-926d-29cb097fbc2c' },
      { _local: 4, _server: null, name: 'Oriel APS',               city: 'San Giovanni Lupatoto',  country: 'Italy',   role: 'partner',   order_index: 4, organization_id: 'b1c2d3e4-f5a6-47b8-9c0d-1e2f3a4b5c6d' },
    ];
    pCounter = 4;
    renderPartners();

    // Init calculator with demo data
    calcInitialized = false;
    calcNeedsReinit = false;
    await ensureCalcInit();

    // Now populate Calculator state with activities
    const cs = Calculator.getCalcState();
    const pts = cs.partners;
    const st = Calculator;

    // Routes (real approximate distances)
    if (pts.length >= 4) {
      st._setRouteBand(pts[0].id, pts[1].id, 4); // Santander\u2013Nicosia ~3200km (3000-3999)
      st._setRouteBand(pts[0].id, pts[2].id, 3); // Santander\u2013Magdeburg ~1700km (500-1999)
      st._setRouteBand(pts[0].id, pts[3].id, 3); // Santander\u2013Verona ~1400km (500-1999)
      st._setRouteBand(pts[1].id, pts[2].id, 4); // Nicosia\u2013Magdeburg ~2800km (2000-2999)
      st._setRouteBand(pts[1].id, pts[3].id, 4); // Nicosia\u2013Verona ~2200km (2000-2999)
      st._setRouteBand(pts[2].id, pts[3].id, 3); // Magdeburg\u2013Verona ~900km (500-1999)
    }

    // Extra destination: Brussels (EACEA)
    st._addExtraDest();
    const edState = Calculator.getCalcState();
    if (edState.extraDests.length > 0) {
      st._setExtraDest(0, 'name', 'Brussels (EACEA)');
      st._setExtraDest(0, 'country', 'Belgium');
      if (pts.length >= 4) {
        st._setRouteBand(pts[0].id, edState.extraDests[0].id, 3); // Santander\u2013Brussels ~1300km
        st._setRouteBand(pts[1].id, edState.extraDests[0].id, 4); // Nicosia\u2013Brussels ~2900km
        st._setRouteBand(pts[2].id, edState.extraDests[0].id, 2); // Magdeburg\u2013Brussels ~650km (500-1999)
        st._setRouteBand(pts[3].id, edState.extraDests[0].id, 3); // Verona\u2013Brussels ~1000km
      }
    }

    // WPs & activities
    const tmpDiv = document.createElement('div');
    st.renderMergedWPs(tmpDiv);

    // WP1: Management
    const wps = Calculator.getCalcState().wps;
    if (wps[0] && wps[0].activities[0]) {
      st._setAct(0, wps[0].activities[0].id, 'rate_applicant', 600);
      st._setAct(0, wps[0].activities[0].id, 'rate_partner', 300);
    }
    // WP1: 4 Transnational meetings
    st._addActivity(0, 'meeting'); st._addActivity(0, 'meeting'); st._addActivity(0, 'meeting');
    // WP1: Local workshops
    st._addActivity(0, 'local_ws');

    let cs2 = Calculator.getCalcState().wps;
    // Kick-off (idx 1 in WP1 activities, after mgmt)
    if (cs2[0]?.activities[1]) { const a = cs2[0].activities[1]; st._setActSubtype(0, a.id, 'Kick-off meeting'); st._setAct(0, a.id, 'pax', 2); st._setAct(0, a.id, 'days', 4); }
    // Mid-term 1 (idx 2)
    if (cs2[0]?.activities[2]) { const a = cs2[0].activities[2]; st._setActSubtype(0, a.id, 'Mid-term meeting'); st._setAct(0, a.id, 'pax', 2); st._setAct(0, a.id, 'days', 4); st._setActHost(0, a.id, pts[1]?.id); }
    // Mid-term 2 (idx 3)
    if (cs2[0]?.activities[3]) { const a = cs2[0].activities[3]; st._setActSubtype(0, a.id, 'Mid-term meeting'); st._setAct(0, a.id, 'pax', 2); st._setAct(0, a.id, 'days', 4); st._setActHost(0, a.id, pts[2]?.id); }
    // Final (idx 4)
    if (cs2[0]?.activities[4]) { const a = cs2[0].activities[4]; st._setActSubtype(0, a.id, 'Final meeting'); st._setAct(0, a.id, 'pax', 2); st._setAct(0, a.id, 'days', 5); st._setActHost(0, a.id, pts[3]?.id); }
    // Local Workshop WP1 (idx 5)
    // leave default (8 pax, 6 sessions, 50€)

    // WP2: LTTA Training + Study visit + IO Toolkit + IO Methodological guide
    st._addActivity(1, 'ltta'); st._addActivity(1, 'ltta');
    st._addActivity(1, 'io'); st._addActivity(1, 'io');

    cs2 = Calculator.getCalcState().wps;
    // Training mobility (idx 0 of WP2)
    if (cs2[1]?.activities[0]) { const a = cs2[1].activities[0]; st._setActSubtype(1, a.id, 'Training mobility'); st._setAct(1, a.id, 'pax', 4); st._setAct(1, a.id, 'days', 6); st._setActHost(1, a.id, pts[1]?.id); }
    // Study visit (idx 1)
    if (cs2[1]?.activities[1]) { const a = cs2[1].activities[1]; st._setActSubtype(1, a.id, 'Study visit mobility'); st._setAct(1, a.id, 'pax', 4); st._setAct(1, a.id, 'days', 6); st._setActHost(1, a.id, pts[2]?.id); }
    // Toolkit IO (idx 2)
    if (cs2[1]?.activities[2]) { st._setActSubtype(1, cs2[1].activities[2].id, 'Toolkit'); }
    // Methodological guide IO (idx 3)
    if (cs2[1]?.activities[3]) { st._setActSubtype(1, cs2[1].activities[3].id, 'Methodological guide'); }

    // WP3: Training mobility (big) + Training mobility + Volunteering + ME + Local WS
    st._addActivity(2, 'ltta'); st._addActivity(2, 'ltta'); st._addActivity(2, 'ltta');
    st._addActivity(2, 'me'); st._addActivity(2, 'local_ws');

    cs2 = Calculator.getCalcState().wps;
    // Training mobility big (idx 0 of WP3)
    if (cs2[2]?.activities[0]) { const a = cs2[2].activities[0]; st._setActSubtype(2, a.id, 'Training mobility'); st._setAct(2, a.id, 'pax', 10); st._setAct(2, a.id, 'days', 8); }
    // Training mobility 2 (idx 1)
    if (cs2[2]?.activities[1]) { const a = cs2[2].activities[1]; st._setActSubtype(2, a.id, 'Training mobility'); st._setAct(2, a.id, 'pax', 4); st._setAct(2, a.id, 'days', 6); st._setActHost(2, a.id, pts[3]?.id); }
    // Volunteering (idx 2)
    if (cs2[2]?.activities[2]) { const a = cs2[2].activities[2]; st._setActSubtype(2, a.id, 'Volunteering mobility'); st._setAct(2, a.id, 'pax', 8); st._setAct(2, a.id, 'days', 50); }
    // ME (idx 3) - 30 local pax per partner
    // Local WS community (idx 4)
    if (cs2[2]?.activities[4]) { st._setActSubtype(2, cs2[2].activities[4].id, 'Community workshop'); }

    // WP4: Dissemination + Website + Group mobility
    st._addActivity(3, 'campaign'); st._addActivity(3, 'website'); st._addActivity(3, 'ltta');

    cs2 = Calculator.getCalcState().wps;
    // Website (idx 1 of WP4)
    if (cs2[3]?.activities[1]) { st._setActSubtype(3, cs2[3].activities[1].id, 'Project website'); }
    // Group mobility (idx 2)
    if (cs2[3]?.activities[2]) { const a = cs2[3].activities[2]; st._setActSubtype(3, a.id, 'Group mobility'); st._setAct(3, a.id, 'pax', 4); st._setAct(3, a.id, 'days', 3); }

    setStep(0);
    Toast.show('Demo cargada: ARISE KA3-Youth \u2014 4 socios (del directorio), 4 WPs', 'ok');
  }

  async function openProject(id) {
    // Remember as the active project so a refresh reopens it instead of
    // showing the empty Intake (which used to fall back to defaults €625k target).
    try { localStorage.setItem('lastProjectId', id); } catch {}
    // Initialize intake without resetting step
    if (!initialized) {
      initialized = true;
      renderStepNav();
      bindEvents();
      await loadPrograms();
    } else if (!programs.length) {
      await loadPrograms();
    }
    // Show intake panel
    document.querySelectorAll('#content-area .panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('panel-intake');
    if (panel) panel.classList.add('active');
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.route === 'intake');
    });
    location.hash = 'intake';
    document.getElementById('topbar-title').textContent = 'Diseñar';
    // Activate contextual sidebar with the project name (loadFromServer fills the rest later)
    if (typeof App !== 'undefined' && App.setActiveProject) {
      App.setActiveProject({ id, name: 'Cargando...' });
    }
    // Load project and go to step 0 (Proyecto)
    loadFromServer(id, 0);
  }

  function _setProgram(p) {
    selectedProgram = p;
    if (p) {
      if (!programs.find(pr => pr.id === p.id)) programs.push(p);
      // Sync all UI fields so the correct call data is displayed
      selectProgram(p.id);
    }
  }

  function hasUnsavedChanges() { return _dirty; }

  function getProposalLang() {
    return document.getElementById('intake-f-lang')?.value || 'en';
  }

  return { init, startNew, openProject, getProposalLang, _setProgram, _calcNav: calcNav, _preloadDemo: preloadDemo, _loadProject: loadFromServer, hasUnsavedChanges };
})();
