/* ═══════════════════════════════════════════════════════════════
   Create Project — Select call and start a new project
   ═══════════════════════════════════════════════════════════════ */

const CreateProject = (() => {
  let initialized = false;
  let programs = [];
  let programEligibility = {};
  let selectedProgram = null;
  let activeFilter = 'open';

  function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  function init() {
    if (initialized) return;
    initialized = true;
    loadPrograms();
    bindFilters();

    document.getElementById('create-btn-start')?.addEventListener('click', startProject);
    document.getElementById('create-upload-docx')?.addEventListener('change', uploadDocx);
  }

  async function loadPrograms() {
    try {
      programs = await API.get('/intake/programs', { noAuth: true });
      for (const p of programs) {
        try { programEligibility[p.id] = await API.get('/admin/data/eligibility/call/' + p.id) || {}; }
        catch(_) { programEligibility[p.id] = {}; }
      }
      renderCards();
    } catch (err) { console.error('CreateProject loadPrograms:', err); }
  }

  function bindFilters() {
    const searchInput = document.getElementById('create-prog-search');
    if (searchInput) searchInput.addEventListener('input', () => renderCards());

    document.querySelectorAll('.create-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        document.querySelectorAll('.create-filter-btn').forEach(b => {
          b.className = b.dataset.filter === activeFilter
            ? 'create-filter-btn px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#1b1464] text-[#fbff12] border border-[#1b1464] transition-colors'
            : 'create-filter-btn px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-50 text-gray-500 border border-gray-100 transition-colors';
        });
        renderCards();
      });
    });
    // Activate default
    document.querySelector('.create-filter-btn[data-filter="open"]')?.click();
  }

  function dlInfo(d) {
    if (!d) return { str: 'No deadline', diff: null, dotColor: '#d1d5db', badgeBg: 'bg-gray-100', badgeText: 'text-gray-400' };
    const dt = new Date(d);
    const diff = Math.ceil((dt - new Date()) / 86400000);
    const str = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (diff < 0) return { str, diff, dotColor: '#d1d5db', badgeBg: 'bg-gray-100', badgeText: 'text-gray-400', label: 'Closed' };
    if (diff <= 14) return { str, diff, dotColor: '#ef4444', badgeBg: 'bg-red-50', badgeText: 'text-red-700', label: diff + ' days left' };
    if (diff <= 60) return { str, diff, dotColor: '#f59e0b', badgeBg: 'bg-amber-50', badgeText: 'text-amber-700', label: diff + ' days left' };
    return { str, diff, dotColor: '#3b82f6', badgeBg: 'bg-blue-50', badgeText: 'text-blue-600', label: diff + ' days' };
  }

  function renderCards() {
    const list = document.getElementById('create-prog-list');
    if (!list) return;
    const searchVal = (document.getElementById('create-prog-search')?.value || '').toLowerCase();

    let sorted = [...programs].sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    if (searchVal) sorted = sorted.filter(p => p.name.toLowerCase().includes(searchVal) || (p.action_type || '').toLowerCase().includes(searchVal));

    sorted = sorted.filter(p => {
      const diff = p.deadline ? Math.ceil((new Date(p.deadline) - new Date()) / 86400000) : null;
      const elig = programEligibility[p.id] || {};
      const eTypes = (Array.isArray(elig.eligible_entity_types) ? elig.eligible_entity_types : []).map(e => typeof e === 'object' ? e.type : e);
      switch (activeFilter) {
        case 'open': return diff === null || diff >= 0;
        case 'urgent': return diff !== null && diff >= 0 && diff <= 30;
        case 'ngo': return eTypes.includes('ngo');
        case 'university': return eTypes.includes('university');
        case 'public_body': return eTypes.includes('public_body');
        case 'all': return true;
        default: return true;
      }
    });

    if (!sorted.length) {
      list.innerHTML = '<p class="text-sm text-on-surface-variant text-center py-8">No calls match the current filters.</p>';
      return;
    }

    list.innerHTML = sorted.map(p => {
      const dl = dlInfo(p.deadline);
      const grant = p.eu_grant_max ? '\u20AC' + Number(p.eu_grant_max).toLocaleString('en') : null;
      const isSelected = selectedProgram && selectedProgram.id === p.id;

      return `
      <div class="create-prog-card group rounded-2xl ${isSelected ? 'bg-[#1b1464] shadow-lg' : 'bg-white shadow-sm hover:shadow-md'} cursor-pointer transition-all" data-id="${p.id}">
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="w-5 h-5 rounded-full border-2 ${isSelected ? 'border-[#fbff12] bg-[#fbff12]' : 'border-gray-300'} flex items-center justify-center flex-shrink-0">
            ${isSelected ? '<div class="w-2 h-2 rounded-full bg-[#1b1464]"></div>' : ''}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold ${isSelected ? 'text-white' : 'text-on-surface group-hover:text-primary'} transition-colors truncate">${esc(p.name)}</div>
            <div class="text-[10px] ${isSelected ? 'text-white/40' : 'text-on-surface-variant/40'} mt-0.5">${esc(p.action_type || '')}</div>
          </div>
          ${grant ? `<span class="px-2.5 py-1 rounded-lg ${isSelected ? 'bg-white/15 text-[#fbff12]' : 'bg-green-50 text-green-700'} text-[10px] font-extrabold flex-shrink-0">${grant}</span>` : ''}
          <div class="flex-shrink-0 px-3 py-1.5 rounded-xl ${isSelected ? 'bg-white/10' : dl.badgeBg}" style="min-width:110px">
            <div class="flex items-center gap-2">
              <div class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${dl.diff !== null && dl.diff >= 0 && dl.diff <= 14 ? 'animate-pulse' : ''}" style="background:${dl.dotColor}"></div>
              <div>
                <div class="text-xs font-extrabold ${isSelected ? 'text-white' : dl.badgeText} tracking-tight">${dl.str}</div>
                ${dl.label ? `<div class="text-[9px] font-bold ${isSelected ? 'text-white/50' : dl.badgeText + ' opacity-60'}">${dl.label}</div>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.create-prog-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedProgram = programs.find(p => p.id === card.dataset.id);
        renderCards();
      });
    });

    if (!selectedProgram && sorted.length > 0) {
      selectedProgram = sorted[0];
      renderCards();
    }
  }

  function startProject() {
    if (!selectedProgram) { Toast.show('Select a call first', 'error'); return; }
    const p = selectedProgram;

    // Set program data in intake hidden fields
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('intake-f-start', p.start_date_min ? p.start_date_min.slice(0, 10) : '');
    setVal('intake-f-dur', p.duration_max_months || '');
    setVal('intake-f-type', p.action_type || '');

    // Navigate to intake
    if (typeof Intake !== 'undefined') {
      // Pass the selected program to intake
      Intake._setProgram(p);
      Intake.startNew();
    }

    // Close the create modal if open
    if (typeof window.closeCreateModal === 'function') window.closeCreateModal();

    // Switch to intake panel
    document.querySelectorAll('#content-area .panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById('panel-intake')?.classList.add('active');
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.route === 'intake');
    });
    location.hash = 'intake';
    document.getElementById('topbar-title').textContent = 'Diseñar';
  }

  async function uploadDocx(e) {
    const file = e.target.files[0];
    if (!file) return;

    const status = document.getElementById('create-upload-status');
    status.classList.remove('hidden');
    status.innerHTML = '<div class="flex items-center gap-2 text-sm text-primary"><span class="spinner"></span> Parsing document... extracting all sections and tables.</div>';

    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/v1/intake/parse-form-b', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + API.getToken() },
        body: fd
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || 'Parse failed');

      const data = json.data;
      const sectionCount = Object.keys(data.sections).length;
      const wpCount = data.work_packages.length;
      const taskCount = data.work_packages.reduce((s, wp) => s + wp.tasks.length, 0);
      const staffCount = data.staff_table?.length || 0;

      status.innerHTML = `
        <div class="rounded-xl bg-green-50 border border-green-200 p-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="material-symbols-outlined text-green-600">check_circle</span>
            <span class="text-sm font-bold text-green-700">Document parsed successfully</span>
          </div>
          <div class="grid grid-cols-4 gap-3 mb-3">
            <div class="text-center">
              <div class="text-lg font-extrabold text-green-700">${sectionCount}</div>
              <div class="text-[10px] text-green-600">Sections</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-extrabold text-green-700">${wpCount}</div>
              <div class="text-[10px] text-green-600">Work Packages</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-extrabold text-green-700">${taskCount}</div>
              <div class="text-[10px] text-green-600">Tasks</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-extrabold text-green-700">${staffCount}</div>
              <div class="text-[10px] text-green-600">Staff</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-on-surface">${esc(data.cover?.project_name || file.name)}</span>
            ${data.cover?.acronym ? '<span class="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-bold">' + esc(data.cover.acronym) + '</span>' : ''}
          </div>
          <button id="create-import-parsed" class="mt-3 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-[#fbff12] bg-[#1b1464] hover:bg-[#1b1464]/80 transition-colors w-full justify-center">
            <span class="material-symbols-outlined text-base">rocket_launch</span> Import and create project
          </button>
        </div>`;

      // Store parsed data for import
      window._parsedFormB = data;

      document.getElementById('create-import-parsed').addEventListener('click', () => importParsedProject(data));
    } catch (err) {
      status.innerHTML = `<div class="rounded-xl bg-red-50 border border-red-200 p-4">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-red-500">error</span>
          <span class="text-sm text-red-700">${esc(err.message)}</span>
        </div>
      </div>`;
    }
  }

  async function importParsedProject(data) {
    if (!selectedProgram) {
      Toast.show('Select a call first, then import', 'error');
      return;
    }

    const cover = data.cover || {};
    const p = selectedProgram;

    // Create the project
    try {
      const project = await API.post('/intake/projects', {
        name: cover.acronym || cover.project_name || 'Imported',
        type: p.action_type || null,
        description: cover.project_name || '',
        start_date: p.start_date_min || null,
        duration_months: p.duration_max_months || null,
        eu_grant: p.eu_grant_max ? Number(p.eu_grant_max) : 0,
        cofin_pct: p.cofin_pct || 0,
        indirect_pct: p.indirect_pct ? Number(p.indirect_pct) : 0,
      });

      const projectId = project.id;

      // Import staff as partners (extract unique organisations)
      const orgs = new Map();
      for (const s of (data.staff_table || [])) {
        const orgName = s.organisation?.trim();
        if (orgName && !orgs.has(orgName)) {
          orgs.set(orgName, { name: orgName, role: orgs.size === 0 ? 'applicant' : 'partner' });
        }
      }
      for (const [, org] of orgs) {
        try {
          await API.post('/intake/projects/' + projectId + '/partners', {
            name: org.name, city: '', country: '', role: org.role
          });
        } catch (_) {}
      }

      // Save parsed sections as form instance values
      try {
        // Find the template linked to this program
        const templateId = p.form_template_id;
        if (templateId) {
          const inst = await API.post('/admin/data/forms/instances', {
            template_id: templateId,
            program_id: p.id,
            project_id: projectId,
            title: (cover.acronym || cover.project_name || 'Imported') + ' — Imported'
          });

          // Save section contents
          const values = {};
          for (const [key, content] of Object.entries(data.sections)) {
            values[key + '.content'] = content;
          }
          // Save WP data
          for (const wp of data.work_packages) {
            const wpKey = 'wp_' + wp.number;
            values[wpKey + '.name'] = wp.name;
            values[wpKey + '.duration'] = wp.duration || '';
            values[wpKey + '.lead'] = wp.lead || '';
            values[wpKey + '.objectives'] = wp.objectives || '';
            if (wp.tasks.length) values[wpKey + '.tasks'] = wp.tasks;
            if (wp.milestones.length) values[wpKey + '.milestones'] = wp.milestones;
            if (wp.deliverables.length) values[wpKey + '.deliverables'] = wp.deliverables;
          }
          if (data.risk_table?.length) values['sec_2_1_5.s2_1_5_risk_table'] = data.risk_table.map(r => [r.number||'', r.description||'', r.wp||'', r.mitigation||'']);
          if (data.staff_table?.length) values['sec_2_1_3.s2_1_3_staff_table'] = data.staff_table.map(s => [s.name||'', s.organisation||'', s.role||'', s.profile||'']);
          if (data.events_table?.length) values['sec_4.events_table'] = data.events_table;

          await API.put('/admin/data/forms/instances/' + inst.id + '/values', { values });
        }
      } catch (e) { console.error('Save form values:', e); }

      Toast.show('Project imported: ' + (cover.acronym || cover.project_name), 'ok');

      // Navigate to intake
      if (typeof Intake !== 'undefined') {
        Intake._setProgram(p);
        Intake._loadProject(projectId, 0);
      }
      document.querySelectorAll('#content-area .panel').forEach(panel => panel.classList.remove('active'));
      document.getElementById('panel-intake')?.classList.add('active');
      location.hash = 'intake';
      document.getElementById('topbar-title').textContent = 'Intake';

    } catch (err) {
      Toast.show('Error importing: ' + err.message, 'error');
    }
  }

  return { init };
})();
