/* ═══════════════════════════════════════════════════════════════
   Evaluator — Upload project → auto-fill Form Part B
   ═══════════════════════════════════════════════════════════════ */

const Evaluator = (() => {

  /* ── State ─────────────────────────────────────────────────── */
  let initialized = false;
  let programs = [];
  let currentProgram = null;
  let currentInstance = null;
  let template = null;
  let values = {};
  let activeSectionId = null;
  let parseJobId = null;
  let pollTimer = null;
  let saveTimers = {};
  let sectionsDone = [];
  let funTipTimer = null;
  let funTipIndex = 0;

  const FUN_TIPS = [
    { icon: '🎓', text: 'Erasmus+ ha financiado más de 13 millones de participantes desde 1987.' },
    { icon: '🌍', text: '¿Sabías que el programa lleva el nombre de Erasmo de Rotterdam, humanista del siglo XV?' },
    { icon: '💡', text: 'La IA está leyendo tu propuesta sección por sección, como un evaluador experto.' },
    { icon: '📊', text: 'Un buen proyecto Erasmus+ combina relevancia, calidad, impacto y viabilidad.' },
    { icon: '🤝', text: 'Los consorcios más exitosos incluyen al menos 3 países diferentes.' },
    { icon: '⏱️', text: 'Un evaluador humano tarda 3-4 horas en leer una propuesta. La IA lo hace en minutos.' },
    { icon: '🏆', text: 'Solo el 15-20% de las propuestas KA2 son aprobadas. ¡La calidad importa!' },
    { icon: '📝', text: 'La coherencia entre secciones es uno de los factores clave para una buena evaluación.' },
    { icon: '🔬', text: 'La IA busca contenido por tema, no solo por número de sección.' },
    { icon: '🌟', text: 'Los proyectos con mayor impacto suelen tener un plan de sostenibilidad claro.' },
    { icon: '🎯', text: 'Consejo: los objetivos SMART hacen que tu propuesta destaque.' },
    { icon: '🗺️', text: 'Erasmus+ está presente en más de 170 países de todo el mundo.' },
    { icon: '💶', text: 'El presupuesto total de Erasmus+ 2021-2027 es de 26.200 millones de euros.' },
    { icon: '📚', text: 'Una propuesta bien estructurada facilita el trabajo del evaluador... y de la IA.' },
    { icon: '🚀', text: 'Casi terminando... tu formulario estará listo en un momento.' },
  ];

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Init ──────────────────────────────────────────────────── */
  function init() {
    if (!initialized) {
      initialized = true;
      bindGlobalEvents();
    }
    showView('programs');
    loadPrograms();
  }

  function bindGlobalEvents() {
    // Back button
    document.getElementById('eval-user-back')?.addEventListener('click', () => {
      stopPolling();
      showView('programs');
    });

    // Upload input
    document.getElementById('eval-upload-input')?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) uploadDocument(e.target.files[0]);
      e.target.value = '';
    });

    // Dropzone click
    const dz = document.getElementById('eval-dropzone');
    if (dz) {
      dz.addEventListener('click', () => document.getElementById('eval-upload-input')?.click());
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('border-primary', 'bg-primary/15'); });
      dz.addEventListener('dragleave', () => { dz.classList.remove('border-primary', 'bg-primary/15'); });
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('border-primary', 'bg-primary/15');
        if (e.dataTransfer.files?.[0]) uploadDocument(e.dataTransfer.files[0]);
      });
    }
  }

  /* ── View toggling ─────────────────────────────────────────── */
  function showView(name) {
    document.querySelectorAll('.eval-user-view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById(name === 'programs' ? 'eval-user-programs' : 'eval-user-editor');
    if (el) el.classList.remove('hidden');
  }

  /* ── Load programs ─────────────────────────────────────────── */
  async function loadPrograms() {
    const el = document.getElementById('eval-user-program-list');
    if (!el) return;
    el.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">Cargando convocatorias...</p>';

    try {
      const result = await API.get('/evaluator/programs');
      programs = Array.isArray(result) ? result : (result.data || []);

      if (!programs.length) {
        el.innerHTML = `
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <span class="material-symbols-outlined text-6xl text-outline-variant/40 mb-4">search_off</span>
            <h3 class="font-headline text-lg font-bold text-primary mb-2">No hay convocatorias disponibles</h3>
            <p class="text-sm text-on-surface-variant max-w-sm">Las convocatorias aparecerán aquí cuando el administrador cargue los formularios en Data E+.</p>
          </div>`;
        return;
      }

      el.innerHTML = programs.map(p => {
        const deadlineStr = p.deadline ? new Date(p.deadline).toLocaleDateString('es-ES') : 'Sin fecha';
        const isUrgent = p.deadline && (new Date(p.deadline) - new Date()) < 30 * 86400000 && (new Date(p.deadline) > new Date());
        const isPast = p.deadline && new Date(p.deadline) < new Date();

        return `
          <div class="eval-program-card flex items-center gap-4 p-5 rounded-2xl border border-outline-variant/30 bg-white hover:border-primary hover:shadow-lg cursor-pointer transition-all group"
               data-program-id="${esc(p.id)}" data-template-id="${esc(p.template_id)}">
            <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
              <span class="material-symbols-outlined text-primary text-2xl">fact_check</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-headline text-sm font-bold text-primary truncate">${esc(p.name)}</div>
              <div class="text-xs text-on-surface-variant mt-0.5">${esc(p.action_type || '')} — ${esc(p.template_name || '')}</div>
            </div>
            ${p.eu_grant_max ? `<span class="text-xs font-bold text-primary bg-cream px-2.5 py-0.5 rounded-full">${Number(p.eu_grant_max).toLocaleString('es-ES')} €</span>` : ''}
            <span class="text-xs ${isUrgent ? 'text-red-700 font-bold' : isPast ? 'text-on-surface-variant/40' : 'text-on-surface-variant'}">${deadlineStr}</span>
            <span class="material-symbols-outlined text-primary/30 group-hover:text-primary transition-colors">chevron_right</span>
          </div>`;
      }).join('');

      // Bind clicks
      el.querySelectorAll('.eval-program-card').forEach(card => {
        card.addEventListener('click', () => {
          const prog = programs.find(p => p.id === card.dataset.programId);
          if (prog) selectProgram(prog);
        });
      });
    } catch (e) {
      console.error('[Evaluator] loadPrograms:', e);
      el.innerHTML = '<p class="text-sm text-error py-8 text-center">Error al cargar convocatorias</p>';
    }
  }

  /* ── Select program → create/load instance ─────────────────── */
  async function selectProgram(prog) {
    currentProgram = prog;
    document.getElementById('eval-user-title').textContent = prog.name;

    // Check if user already has an instance for this program
    try {
      const existing = await API.get('/evaluator/instances');
      const instances = Array.isArray(existing) ? existing : (existing.data || []);
      const match = instances.find(i => i.program_name === prog.name);

      let instanceId;
      if (match) {
        instanceId = match.id;
      } else {
        const created = await API.post('/evaluator/instances', {
          program_id: prog.id,
          template_id: prog.template_id,
          title: prog.name,
        });
        instanceId = created.id || created.data?.id;
      }

      // Load full instance with template
      const inst = await API.get(`/evaluator/instances/${instanceId}`);
      currentInstance = inst.data || inst;
      template = currentInstance.template_json;

      // Load existing values
      const vals = await API.get(`/evaluator/instances/${instanceId}/values`);
      values = vals.data || vals || {};

      showView('editor');
      renderSidebar();
      showDropzone(true);
      hideProgressBar();

      // Select first section by default
      const items = getSidebarItems();
      if (items.length) {
        activeSectionId = items[0].id;
        renderSidebar();
        renderSection(activeSectionId);
      }
    } catch (e) {
      console.error('[Evaluator] selectProgram:', e);
      Toast.show('Error al cargar formulario: ' + (e.message || e), 'err');
    }
  }

  /* ── Get sidebar items from template ───────────────────────── */
  function getSidebarItems() {
    if (!template) return [];
    const items = [];

    // Cover page + summary
    if (template.cover_page) items.push({ id: '__cover', label: 'Cover Page', icon: 'badge', level: 0 });
    if (template.project_summary) items.push({ id: '__summary', label: 'Project Summary', icon: 'summarize', level: 0 });

    // Main sections
    if (template.sections) {
      for (const sec of template.sections) {
        const subs = sec.subsections || [];
        const groups = sec.subsections_groups || [];
        const hasChildren = subs.length > 0 || groups.length > 0;

        if (!hasChildren) {
          items.push({ id: sec.id, label: `${sec.number}. ${sec.title}`, icon: 'folder', level: 0 });
        } else {
          // Only show leaf subsections (navigable)
          for (const sub of subs) {
            items.push({ id: sub.id, label: `${sub.number} ${sub.title}`, icon: 'article', level: 0 });
          }
          for (const grp of groups) {
            for (const sub of (grp.subsections || [])) {
              items.push({ id: sub.id, label: `${sub.number} ${sub.title}`, icon: 'article', level: 0 });
            }
          }
        }
      }
    }

    // Annexes
    if (template.annexes) items.push({ id: '__annexes', label: 'Previous Projects', icon: 'history', level: 0 });

    // Insert WPs right after sec_4_1 (replacing sec_4_2 which is just instructions)
    const wpCount = getWpCount();
    if (wpCount > 0) {
      // Find the position of 4.1 Work plan and remove 4.2
      const idx41 = items.findIndex(it => it.id === 'sec_4_1');
      const idx42 = items.findIndex(it => it.id === 'sec_4_2');
      if (idx42 >= 0) items.splice(idx42, 1); // Remove 4.2 (WPs replace it)

      const insertAt = idx41 >= 0 ? idx41 + 1 : items.length;
      for (let i = wpCount; i >= 1; i--) {
        const wpName = values[`wp_${i}.name`] || `Work Package ${i}`;
        const shortName = wpName.length > 30 ? wpName.substring(0, 30) + '...' : wpName;
        items.splice(insertAt, 0, { id: `__wp_${i}`, label: `WP${i}: ${shortName}`, icon: 'inventory_2', level: 1 });
      }
    }

    return items;
  }

  function getWpCount() {
    let max = 0;
    for (const key of Object.keys(values)) {
      const m = key.match(/^wp_(\d+)\./);
      if (m) max = Math.max(max, parseInt(m[1]));
    }
    return max;
  }

  /* ── Render sidebar ────────────────────────────────────────── */
  function renderSidebar() {
    const nav = document.getElementById('eval-user-sidebar-nav');
    if (!nav) return;

    const items = getSidebarItems();
    nav.innerHTML = items.map(it => {
      const isActive = activeSectionId === it.id;
      const isDone = sectionsDone.includes(it.id);
      const statusIcon = isDone
        ? `<span class="material-symbols-outlined text-xs ${isActive ? 'text-secondary-fixed' : 'text-primary'}">check_circle</span>`
        : '';

      return `
        <div class="eval-sidebar-item flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all text-xs mb-0.5
          ${isActive ? 'bg-[#3c45a3] text-white font-bold' : 'text-primary/70 hover:bg-primary/5'}"
          data-sid="${it.id}">
          <span class="material-symbols-outlined text-sm">${it.icon}</span>
          <span class="flex-1 truncate">${esc(it.label)}</span>
          ${statusIcon}
        </div>`;
    }).join('');

    nav.querySelectorAll('.eval-sidebar-item').forEach(el => {
      el.addEventListener('click', () => {
        activeSectionId = el.dataset.sid;
        renderSidebar();
        renderSection(activeSectionId);
      });
    });
  }

  /* ── Find section data from template ───────────────────────── */
  function findSection(id) {
    if (!template) return null;
    if (id === '__cover') return { _special: 'cover', ...template.cover_page };
    if (id === '__summary') return { _special: 'summary', ...template.project_summary };
    if (id === '__annexes') return { _special: 'annexes', id: '__annexes', title: 'List of Previous Projects', fields: [{ id: 'previous_projects', label: 'List of previous projects (last 4 years)', type: 'table', columns: template.annexes?.tables?.[0]?.columns || ['Participant', 'Project Reference', 'Period', 'Role', 'Amount (EUR)', 'Website'] }] };

    // Work packages (virtual sections from parsed data)
    const wpMatch = id.match(/^__wp_(\d+)$/);
    if (wpMatch) {
      const wpNum = parseInt(wpMatch[1]);
      return { _special: 'wp', _wpNum: wpNum, id: `__wp_${wpNum}`, number: `WP${wpNum}`, title: values[`wp_${wpNum}.name`] || `Work Package ${wpNum}` };
    }

    for (const sec of (template.sections || [])) {
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

  /* ── Render section content ────────────────────────────────── */
  function renderSection(sectionId) {
    const content = document.getElementById('eval-user-main-content');
    if (!content) return;

    const sec = findSection(sectionId);
    if (!sec) {
      content.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">Sección no encontrada</p>';
      return;
    }

    // Work Package — special render
    if (sec._special === 'wp') {
      renderWorkPackage(content, sec._wpNum);
      return;
    }

    // Header
    let html = `<div class="flex items-center gap-3 mb-5">
      <div class="w-2 h-10 rounded-full bg-primary"></div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-widest text-primary">${sec.number ? 'Section ' + sec.number : (sec._special || 'Form')}</div>
        <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">${esc(sec.title)}</h3>
      </div>
    </div>`;

    // Guidance
    if (sec.guidance && Array.isArray(sec.guidance)) {
      html += `<details class="mb-4 rounded-xl bg-lavender-soft/50 border border-lavender/30 group" open>
        <summary class="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
          <span class="material-symbols-outlined text-sm text-violet">info</span>
          <span class="text-xs font-bold text-violet flex-1">Instructions & guidance</span>
          <span class="material-symbols-outlined text-sm text-violet group-open:rotate-180 transition-transform">expand_more</span>
        </summary>
        <div class="px-4 pb-3">
          ${sec.guidance.map(g => `<p class="text-xs text-ink/80 mb-1">${esc(g)}</p>`).join('')}
        </div>
      </details>`;
    }

    // Fields
    html += '<div class="space-y-4">';
    if (sec.fields) {
      const textareaCount = sec.fields.filter(f => f.type === 'textarea').length;
      for (const f of sec.fields) {
        // Check conditional visibility
        if (f.conditional_on) {
          const [condField, condVal] = f.conditional_on.split('=');
          const condKey = (sec.id || sec._special) + '.' + condField;
          if (values[condKey] !== condVal) continue;
        }
        html += renderField(f, sec.id || sec._special, textareaCount);
      }
    }

    if ((sec.subsections || sec.subsections_groups) && !sec.fields) {
      html += '<p class="text-sm text-on-surface-variant py-4">Selecciona una subsección del menú lateral.</p>';
    }

    html += '</div>';
    content.innerHTML = html;

    // Bind auto-save on change/blur
    content.querySelectorAll('.eval-field-input').forEach(inp => {
      const handler = () => {
        const key = inp.dataset.key;
        if (inp.type === 'radio') {
          if (inp.checked) {
            values[key] = inp.value;
            debouncedSave(key, inp.value);
            // Re-render section to show/hide conditional fields
            renderSection(sectionId);
          }
        } else {
          values[key] = inp.value;
          debouncedSave(key, inp.value);
        }
      };
      inp.addEventListener(inp.type === 'radio' ? 'change' : 'input', handler);
    });

    // Bind table cell changes
    content.querySelectorAll('.eval-table-cell').forEach(cell => {
      cell.addEventListener('input', () => {
        const key = cell.dataset.key;
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        if (!values[key]) values[key] = [];
        if (!values[key][r]) values[key][r] = [];
        values[key][r][c] = cell.value;
        debouncedSave(key, values[key]);
      });
    });

    // Bind expand buttons — show full row in modal
    content.querySelectorAll('.eval-expand-cell').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const r = parseInt(btn.dataset.row);
        const row = (values[key] && values[key][r]) || [];

        // Find column headers from the table header
        const table = btn.closest('.rounded-2xl')?.querySelector('table');
        const headers = [];
        if (table) {
          table.querySelectorAll('thead th').forEach(th => headers.push(th.textContent.trim()));
        }

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]';
        overlay.innerHTML = `
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" style="animation:critIn .2s ease">
            <div class="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 class="font-bold text-primary text-sm">Edit row ${r + 1}</h3>
              <button id="expand-close" class="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div class="p-6 space-y-4">
              ${row.map((val, ci) => {
                const label = headers[ci] || 'Column ' + (ci + 1);
                const isLong = (val || '').length > 80;
                return `<div>
                  <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">${esc(label)}</label>
                  ${isLong
                    ? `<textarea class="expand-row-field w-full px-4 py-3 text-sm border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 resize-vertical leading-relaxed" rows="6" data-col="${ci}">${esc(val || '')}</textarea>`
                    : `<input type="text" class="expand-row-field w-full px-4 py-2.5 text-sm border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" data-col="${ci}" value="${esc(val || '')}">`
                  }
                </div>`;
              }).join('')}
            </div>
            <div class="px-6 py-3 bg-surface flex justify-end sticky bottom-0">
              <button id="expand-save" class="px-5 py-2 rounded-full text-xs font-bold text-[#d6e949] bg-[#3c45a3] hover:bg-[#514daa] transition-colors">Save</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('.expand-row-field')?.focus();
        overlay.querySelector('#expand-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#expand-save').addEventListener('click', () => {
          if (!values[key]) values[key] = [];
          if (!values[key][r]) values[key][r] = [];
          overlay.querySelectorAll('.expand-row-field').forEach(field => {
            const ci = parseInt(field.dataset.col);
            values[key][r][ci] = field.value;
            // Update corresponding cell in the table
            const cell = content.querySelector(`.eval-table-cell[data-key="${key}"][data-row="${r}"][data-col="${ci}"]`);
            if (cell) cell.value = field.value;
          });
          debouncedSave(key, values[key]);
          overlay.remove();
        });
      });
    });
  }

  /* ── Render a single field ─────────────────────────────────── */
  function renderField(f, sectionId, fieldCount) {
    const key = sectionId + '.' + f.id;
    const val = values[key] || '';

    if (f.type === 'textarea') {
      // Bigger textarea when it's the only/main field in the section
      const isSolo = fieldCount === 1;
      const minH = isSolo ? 'min-h-[400px]' : 'min-h-[150px]';
      const rows = isSolo ? 18 : 8;
      return `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">${esc(f.label)}</label>
        ${f.guidance ? `<p class="text-xs text-on-surface-variant/70 mb-2">${Array.isArray(f.guidance) ? f.guidance.map(g => esc(g)).join(' ') : esc(f.guidance)}</p>` : ''}
        <textarea class="eval-field-input w-full px-4 py-3 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-vertical ${minH} leading-relaxed" data-key="${key}" rows="${rows}" placeholder="${esc(f.placeholder || 'Sin datos')}">${esc(val)}</textarea>
      </div>`;
    }

    if (f.type === 'text' || f.type === 'email') {
      return `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">${esc(f.label)}</label>
        <input type="${f.type}" class="eval-field-input w-full px-4 py-2.5 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" data-key="${key}" value="${esc(val)}" placeholder="${esc(f.placeholder || 'Sin datos')}">
      </div>`;
    }

    if (f.type === 'radio') {
      return `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3 block">${esc(f.label)}</label>
        <div class="flex gap-3">${(f.options || []).map(o => {
          const isChecked = val === o;
          return `<label class="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${isChecked ? 'border-[#3c45a3] bg-[#3c45a3]/5' : 'border-outline-variant/20 hover:border-primary/30'}">
            <input type="radio" name="${key}" value="${o}" class="eval-field-input accent-[#3c45a3]" data-key="${key}" ${isChecked ? 'checked' : ''}>
            <span class="text-sm font-bold ${isChecked ? 'text-[#3c45a3]' : 'text-on-surface-variant'}">${o}</span>
          </label>`;
        }).join('')}
        </div>
      </div>`;
    }

    if (f.type === 'table') {
      return renderTableField(f, sectionId);
    }

    return '';
  }

  /* ── Render table field ────────────────────────────────────── */
  function colWidth(name) {
    const n = (name || '').toLowerCase();
    if (/^(risk\s*no|#|no\.?|number)$/i.test(n.trim())) return 'w-14';
    if (n.includes('work package no') || n.includes('wp')) return 'w-20';
    if (n.includes('organisation') || n.includes('role')) return 'w-32';
    if (n.includes('name and function') || n.includes('name')) return 'w-36';
    return '';
  }

  function renderTableField(f, sectionId) {
    const key = sectionId + '.' + f.id;
    const tableData = values[key] || [];
    const cols = f.columns || [];

    let html = `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest">
      <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3 block">${esc(f.label)}</label>
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse table-fixed">
          <thead><tr>
            ${cols.map(c => `<th class="text-left px-2 py-1.5 border-b border-outline-variant/30 font-bold text-on-surface-variant ${colWidth(c)}">${esc(c)}</th>`).join('')}
          </tr></thead>
          <tbody>`;

    const rows = Array.isArray(tableData) ? tableData : [];
    if (rows.length) {
      for (let r = 0; r < rows.length; r++) {
        html += '<tr>';
        for (let c = 0; c < cols.length; c++) {
          const cellVal = (rows[r] && rows[r][c]) || '';
          const isLong = cellVal.length > 60;
          html += `<td class="px-2 py-1 border-b border-outline-variant/10 align-top">
            <div class="flex items-start gap-1">
              <textarea class="eval-table-cell w-full px-1.5 py-1 text-xs border border-outline-variant/10 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary/20 rounded resize-none overflow-hidden leading-relaxed" rows="${isLong ? 3 : 1}" data-key="${key}" data-row="${r}" data-col="${c}">${esc(cellVal)}</textarea>
              ${isLong ? `<button class="eval-expand-cell flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-primary/30 hover:text-primary hover:bg-primary/5 transition-colors mt-0.5" data-key="${key}" data-row="${r}" data-col="${c}" title="Expand"><span class="material-symbols-outlined text-sm">open_in_full</span></button>` : ''}
            </div>
          </td>`;
        }
        html += '</tr>';
      }
    } else {
      html += `<tr><td colspan="${cols.length}" class="text-center py-4 text-on-surface-variant/50">Sin datos</td></tr>`;
    }

    html += `</tbody></table></div></div>`;
    return html;
  }

  /* ── Debounced auto-save ───────────────────────────────────── */
  function debouncedSave(key, value) {
    // Espera vía SaveStatus: «Guardando…» en la barra, se fuerza al salir y
    // un fallo se ve («No se ha guardado · Reintentar»), ya no solo en consola.
    const inst = currentInstance;
    SaveStatus.debounce('eval:' + key, async () => {
      if (!inst) return;
      try {
        await API.put(`/evaluator/instances/${inst.id}/values`, {
          values: { [key]: value }
        }, { saveKey: 'PUT eval values #' + inst.id + ':' + key });
      } catch (e) {
        console.error('[Evaluator] save error:', e);
      }
    }, 800);
  }

  /* ── Upload document ───────────────────────────────────────── */
  async function uploadDocument(file) {
    if (!currentInstance) return;

    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.type)) {
      Toast.show('Solo se aceptan archivos PDF o DOCX', 'err');
      return;
    }

    // Show progress
    showDropzone(false);
    showProgressBar(0, 0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await fetch(`/v1/evaluator/instances/${currentInstance.id}/upload-parse`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API.getToken()}` },
        body: formData,
      });
      const json = await resp.json();

      if (!json.ok) {
        Toast.show('Error: ' + (json.error?.message || 'Upload failed'), 'err');
        showDropzone(true);
        hideProgressBar();
        return;
      }

      parseJobId = json.data.jobId;
      sectionsDone = [];

      // DOCX files are parsed instantly (no AI needed)
      if (json.data.instant) {
        hideProgressBar();
        showParseStatus(false);
        Toast.show('Documento procesado correctamente', 'ok');
        await refreshValues();
        renderSidebar();
        if (activeSectionId) renderSection(activeSectionId);
      } else {
        Toast.show('Documento subido. Analizando con IA...', 'ok');
        startPolling();
      }
    } catch (e) {
      console.error('[Evaluator] upload error:', e);
      Toast.show('Error al subir: ' + (e.message || e), 'err');
      showDropzone(true);
      hideProgressBar();
    }
  }

  /* ── Polling for parse status ──────────────────────────────── */
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollParseStatus, 2000);
    // Also poll immediately
    pollParseStatus();
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function pollParseStatus() {
    if (!parseJobId) { stopPolling(); return; }

    try {
      const resp = await API.get(`/evaluator/parse-jobs/${parseJobId}`);
      const job = resp.data || resp;

      const progress = job.progress_json || {};
      const total = progress.total || 0;
      const done = progress.done || 0;
      const newSections = progress.sections_done || [];
      const current = progress.current;

      // Update progress bar
      showProgressBar(done, total, current);

      // Check for newly completed sections
      const prevDone = sectionsDone.length;
      sectionsDone = newSections;

      if (newSections.length > prevDone) {
        // Re-render sidebar to show checkmarks
        renderSidebar();

        // If user is viewing a section that just completed, refresh values
        if (activeSectionId && newSections.includes(activeSectionId)) {
          await refreshValues();
          renderSection(activeSectionId);
        }
      }

      // Check if complete or error
      if (job.status === 'complete') {
        stopPolling();
        hideProgressBar();
        showParseStatus(false);
        Toast.show('Formulario rellenado correctamente', 'ok');

        // Refresh all values
        await refreshValues();
        renderSidebar();
        if (activeSectionId) renderSection(activeSectionId);
      }

      if (job.status === 'error') {
        stopPolling();
        hideProgressBar();
        showDropzone(true);
        showParseStatus(false);
        Toast.show('Error en análisis: ' + (job.error_message || 'Unknown error'), 'err');
      }
    } catch (e) {
      console.error('[Evaluator] poll error:', e);
    }
  }

  async function refreshValues() {
    if (!currentInstance) return;
    try {
      const vals = await API.get(`/evaluator/instances/${currentInstance.id}/values`);
      values = vals.data || vals || {};
    } catch (e) {
      console.error('[Evaluator] refreshValues:', e);
    }
  }

  /* ── UI helpers ────────────────────────────────────────────── */
  function showDropzone(visible) {
    const dz = document.getElementById('eval-dropzone');
    if (dz) dz.classList.toggle('hidden', !visible);
  }

  function showProgressBar(done, total, current) {
    const bar = document.getElementById('eval-progress-bar');
    if (!bar) return;
    bar.classList.remove('hidden');

    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('eval-progress-label').textContent =
      current ? `Procesando: ${current} (${done}/${total})` : `Procesando sección ${done} de ${total}...`;
    document.getElementById('eval-progress-pct').textContent = `${pct}%`;
    document.getElementById('eval-progress-fill').style.width = `${pct}%`;

    showParseStatus(true, `Sección ${done}/${total}`);

    // Start fun tips if not already running
    if (!funTipTimer) startFunTips();
  }

  function hideProgressBar() {
    const bar = document.getElementById('eval-progress-bar');
    if (bar) bar.classList.add('hidden');
    stopFunTips();
  }

  function showParseStatus(visible, text) {
    const el = document.getElementById('eval-parse-status');
    if (!el) return;
    if (visible) {
      el.classList.remove('hidden');
      el.classList.add('flex');
      if (text) document.getElementById('eval-parse-text').textContent = text;
    } else {
      el.classList.add('hidden');
      el.classList.remove('flex');
    }
  }

  /* ── Fun tips during loading ───────────────────────────────── */
  function startFunTips() {
    stopFunTips();
    funTipIndex = Math.floor(Math.random() * FUN_TIPS.length);
    showFunTip();
    funTipTimer = setInterval(() => {
      funTipIndex = (funTipIndex + 1) % FUN_TIPS.length;
      showFunTip();
    }, 6000);
  }

  function stopFunTips() {
    if (funTipTimer) { clearInterval(funTipTimer); funTipTimer = null; }
    const el = document.getElementById('eval-fun-tip');
    if (el) el.classList.add('hidden');
  }

  function showFunTip() {
    let el = document.getElementById('eval-fun-tip');
    if (!el) {
      // Create the fun tip element after the progress bar
      const bar = document.getElementById('eval-progress-bar');
      if (!bar) return;
      el = document.createElement('div');
      el.id = 'eval-fun-tip';
      el.className = 'mb-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#3c45a3]/5 to-primary/5 border border-primary/10 transition-all duration-500';
      bar.insertAdjacentElement('afterend', el);
    }
    el.classList.remove('hidden');
    const tip = FUN_TIPS[funTipIndex];
    el.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-2xl flex-shrink-0" style="animation: pulse 2s infinite">${tip.icon}</span>
        <div>
          <div class="text-[10px] font-bold uppercase tracking-widest text-primary/50 mb-0.5">¿Sabías que...?</div>
          <p class="text-sm text-on-surface leading-relaxed">${esc(tip.text)}</p>
        </div>
      </div>`;
  }

  /* ── Public API ────────────────────────────────────────────── */
  /* ── Render Work Package ───────────────────────────────────── */
  function renderWorkPackage(container, wpNum) {
    const prefix = `wp_${wpNum}`;
    const name = values[`${prefix}.name`] || `Work Package ${wpNum}`;
    const duration = values[`${prefix}.duration`] || '—';
    const lead = values[`${prefix}.lead`] || '—';
    const objectives = values[`${prefix}.objectives`] || '';
    const tasks = values[`${prefix}.tasks`] || [];
    const milestones = values[`${prefix}.milestones`] || [];
    const deliverables = values[`${prefix}.deliverables`] || [];

    const taskCols = ['Task No', 'Task Name', 'Description', 'Participants', 'Role', 'Subcontracting'];
    const msCols = ['MS No', 'Milestone Name', 'WP No', 'Lead Beneficiary', 'Description', 'Due Date', 'Means of Verification'];
    const delCols = ['Del. No', 'Deliverable Name', 'WP No', 'Lead', 'Type', 'Dissemination', 'Due Date', 'Description'];

    let html = `
      <div class="flex items-center gap-3 mb-5">
        <div class="w-10 h-10 rounded-xl bg-[#3c45a3] flex items-center justify-center flex-shrink-0">
          <span class="text-sm font-extrabold text-[#d6e949]">${wpNum}</span>
        </div>
        <div class="flex-1">
          <div class="text-[10px] font-bold uppercase tracking-widest text-primary">Work Package ${wpNum}</div>
          <h3 class="font-headline text-lg font-extrabold text-on-surface tracking-tight">${esc(name)}</h3>
        </div>
      </div>

      <!-- Header info -->
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="rounded-xl bg-primary/5 p-3">
          <div class="text-[10px] font-bold uppercase text-on-surface-variant/50">Duration</div>
          <div class="text-sm font-bold text-primary">${esc(duration)}</div>
        </div>
        <div class="rounded-xl bg-primary/5 p-3">
          <div class="text-[10px] font-bold uppercase text-on-surface-variant/50">Lead Beneficiary</div>
          <div class="text-sm font-bold text-primary">${esc(lead)}</div>
        </div>
      </div>

      <!-- Objectives -->
      <div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest mb-4">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">Objectives</label>
        <textarea class="eval-field-input w-full px-4 py-3 rounded-xl border border-outline-variant/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-vertical min-h-[80px] leading-relaxed" data-key="${prefix}.objectives" rows="3" placeholder="Sin datos">${esc(objectives)}</textarea>
      </div>

      <!-- Tasks -->
      ${renderWpTable('Tasks', `${prefix}.tasks`, taskCols, tasks)}

      <!-- Milestones -->
      ${renderWpTable('Milestones', `${prefix}.milestones`, msCols, milestones)}

      <!-- Deliverables -->
      ${renderWpTable('Deliverables', `${prefix}.deliverables`, delCols, deliverables)}
    `;

    container.innerHTML = html;

    // Bind field changes
    container.querySelectorAll('.eval-field-input').forEach(inp => {
      inp.addEventListener('input', () => {
        values[inp.dataset.key] = inp.value;
        debouncedSave(inp.dataset.key, inp.value);
      });
    });

    // Bind table cells
    container.querySelectorAll('.eval-table-cell').forEach(cell => {
      cell.addEventListener('input', () => {
        const key = cell.dataset.key;
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        if (!values[key]) values[key] = [];
        if (!values[key][r]) values[key][r] = [];
        values[key][r][c] = cell.value;
        debouncedSave(key, values[key]);
      });
    });

    // Bind expand buttons
    container.querySelectorAll('.eval-expand-cell').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const r = parseInt(btn.dataset.row);
        const row = (values[key] && values[key][r]) || [];
        const table = btn.closest('.rounded-2xl')?.querySelector('table');
        const headers = [];
        if (table) table.querySelectorAll('thead th').forEach(th => headers.push(th.textContent.trim()));

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]';
        overlay.innerHTML = `
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" style="animation:critIn .2s ease">
            <div class="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 class="font-bold text-primary text-sm">Edit row ${r + 1}</h3>
              <button id="expand-close" class="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div class="p-6 space-y-4">
              ${row.map((val, ci) => {
                const label = headers[ci] || 'Column ' + (ci + 1);
                const isLong = (val || '').length > 80;
                return `<div>
                  <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">${esc(label)}</label>
                  ${isLong
                    ? `<textarea class="expand-row-field w-full px-4 py-3 text-sm border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 resize-vertical leading-relaxed" rows="6" data-col="${ci}">${esc(val || '')}</textarea>`
                    : `<input type="text" class="expand-row-field w-full px-4 py-2.5 text-sm border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" data-col="${ci}" value="${esc(val || '')}">`}
                </div>`;
              }).join('')}
            </div>
            <div class="px-6 py-3 bg-surface flex justify-end sticky bottom-0">
              <button id="expand-save" class="px-5 py-2 rounded-full text-xs font-bold text-[#d6e949] bg-[#3c45a3] hover:bg-[#514daa] transition-colors">Save</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.expand-row-field')?.focus();
        overlay.querySelector('#expand-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#expand-save').addEventListener('click', () => {
          if (!values[key]) values[key] = [];
          if (!values[key][r]) values[key][r] = [];
          overlay.querySelectorAll('.expand-row-field').forEach(field => {
            const ci = parseInt(field.dataset.col);
            values[key][r][ci] = field.value;
            const cell = container.querySelector(`.eval-table-cell[data-key="${key}"][data-row="${r}"][data-col="${ci}"]`);
            if (cell) cell.value = field.value;
          });
          debouncedSave(key, values[key]);
          overlay.remove();
        });
      });
    });
  }

  function renderWpTable(title, key, cols, data) {
    const rows = Array.isArray(data) ? data : [];
    // Convert objects to arrays if needed
    const arrayRows = rows.map(row => {
      if (Array.isArray(row)) return row;
      // Convert object to array matching column order
      return Object.values(row);
    });

    const narrowCols = ['Task No', 'MS No', 'Del. No', 'WP No', 'Due Date', 'Role', 'Subcontracting', 'Dissemination', 'Type'];

    return `<div class="rounded-2xl border border-outline-variant/20 p-5 bg-surface-container-lowest mb-4">
      <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3 block">${esc(title)} (${arrayRows.length})</label>
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse table-fixed">
          <thead><tr>
            ${cols.map(c => `<th class="text-left px-2 py-1.5 border-b border-outline-variant/30 font-bold text-on-surface-variant ${narrowCols.includes(c) ? 'w-16' : ''}">${esc(c)}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${arrayRows.length ? arrayRows.map((row, ri) => `<tr>
              ${cols.map((c, ci) => {
                const cellVal = row[ci] || '';
                const isLong = cellVal.length > 60;
                return `<td class="px-2 py-1 border-b border-outline-variant/10 align-top">
                  <div class="flex items-start gap-1">
                    <textarea class="eval-table-cell w-full px-1.5 py-1 text-xs border border-outline-variant/10 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary/20 rounded resize-none overflow-hidden leading-relaxed" rows="${isLong ? 2 : 1}" data-key="${key}" data-row="${ri}" data-col="${ci}">${esc(cellVal)}</textarea>
                    ${isLong ? `<button class="eval-expand-cell flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-primary/30 hover:text-primary hover:bg-primary/5 mt-0.5" data-key="${key}" data-row="${ri}" data-col="${ci}"><span class="material-symbols-outlined text-xs">open_in_full</span></button>` : ''}
                  </div>
                </td>`;
              }).join('')}
            </tr>`).join('') : `<tr><td colspan="${cols.length}" class="text-center py-4 text-on-surface-variant/50">No data</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  return { init };
})();
