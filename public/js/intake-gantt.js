/* ═══════════════════════════════════════════════════════════════
   IntakeGantt — Visual timeline (proportional bars, no scroll)
   Duration comes from Calculator → state.project.duration_months
   ═══════════════════════════════════════════════════════════════ */

const IntakeGantt = (() => {

  let container = null;
  let projectId = null;
  let templates = null;
  let savedTasks = [];
  let totalMonths = 36;

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const WP_COLORS = ['#1b1464','#1e40af','#0369a1','#0e7490','#155e75','#1d4ed8','#4338ca','#6366f1','#0284c7','#7c3aed'];
  function wpColor(i) { return WP_COLORS[i % WP_COLORS.length]; }

  const ACT_ICONS = {
    meeting:'groups', ltta:'flight_takeoff', io:'menu_book', me:'campaign', mgmt:'settings',
    local_ws:'school', campaign:'share', website:'language', artistic:'palette',
    equipment:'devices', goods:'inventory_2', consumables:'eco',
    fstp:'volunteer_activism', other:'more_horiz',
  };

  const ACT_TYPES_LABEL = {
    mgmt:'Management', meeting:'Transnational Meeting', ltta:'LTTA / Mobility',
    io:'Intellectual Output', me:'Multiplier Event', local_ws:'Local Workshop',
    campaign:'Dissemination', website:'Website', artistic:'Artistic Fees',
    equipment:'Equipment', goods:'Other Goods', consumables:'Consumables',
    fstp:'Financial Support to Third Parties', other:'Other Costs',
  };

  const TYPE_MAP = {
    mgmt:'project_management', meeting:'transnational_meeting', ltta:'ltta_mobility',
    io:'intellectual_output', me:'multiplier_event', local_ws:'local_workshop',
    campaign:'dissemination', website:'website', artistic:'artistic_fees',
    equipment:'equipment', goods:'other_goods', consumables:'consumables',
    fstp:'financial_support_third_parties', other:'other_costs',
  };

  function findTaskTitle(category, subtypeLabel) {
    if (!templates) return null;
    const cat = templates.find(c => c.category === category);
    if (!cat) return null;
    if (!subtypeLabel) return cat.subtypes[0]?.title || null;
    const norm = subtypeLabel.toLowerCase().trim();
    return (cat.subtypes.find(s => s.label.toLowerCase().trim() === norm) || cat.subtypes[0])?.title || null;
  }

  /* ── Main ──────────────────────────────────────────────────── */
  async function render(el, pid) {
    container = el;
    projectId = pid;
    if (!container) return;

    if (!templates) {
      try { templates = (await API.get('/intake/task-templates')).data; } catch (e) {}
    }
    if (projectId) {
      try { savedTasks = (await API.get(`/intake/projects/${projectId}/tasks`)).data || []; } catch (e) { savedTasks = []; }
    }

    const cs = (typeof Calculator !== 'undefined' && Calculator.isInitialized()) ? Calculator.getCalcState() : null;
    if (!cs || !cs.wps?.length) {
      container.innerHTML = `
        <h1 class="font-headline text-3xl font-extrabold tracking-tighter text-primary mb-1">Gantt del Proyecto</h1>
        <p class="text-on-surface-variant text-sm mb-8">Define primero los Work Packages y actividades.</p>
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <span class="material-symbols-outlined text-5xl text-outline-variant/40 mb-3">timeline</span>
        </div>` + navHTML();
      bindNav();
      return;
    }

    // Get duration from calculator state
    totalMonths = cs.projectMonths || 36;
    renderGantt(cs);
  }

  /* ── Render ────────────────────────────────────────────────── */
  function renderGantt(cs) {
    const wps = cs.wps;
    const rows = buildRows(cs);

    // Month ruler markers
    const mw = (100 / totalMonths).toFixed(3);

    let html = `
      <style>
        .gantt-sel {
          width: 32px;
          padding: 3px 0;
          font-size: 11px;
          font-weight: 700;
          text-align: center;
          color: #1b1464;
          background: #f8f9fa;
          border: 1.5px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          outline: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          transition: all 0.15s;
        }
        .gantt-sel:focus {
          border-color: #1b1464;
          background: white;
          box-shadow: 0 0 0 2px rgba(27,20,100,0.12);
        }
        .gantt-sel:hover { border-color: #1b1464; background: white; }
        .gantt-sel option { font-size: 13px; }
      </style>
      <div class="mb-5">
        <h1 class="font-headline text-3xl font-extrabold tracking-tighter text-primary mb-1">Gantt del Proyecto</h1>
        <p class="text-on-surface-variant text-sm">Duración: <strong>${totalMonths} meses</strong>. Asigna inicio y fin a cada tarea.</p>
      </div>

      <div class="rounded-2xl border border-outline-variant/20 shadow-sm bg-white overflow-hidden">
        <!-- Ruler -->
        <div class="flex" style="height:28px">
          <div class="flex-shrink-0 border-r border-outline-variant/20 flex items-center px-2" style="width:300px">
            <span class="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Actividad / Tarea</span>
          </div>
          <div class="flex-shrink-0 border-r border-outline-variant/20 flex items-center justify-center" style="width:90px">
            <span class="text-[9px] font-bold text-on-surface-variant">Inicio → Fin</span>
          </div>
          <div class="flex-1 flex relative">
            ${Array.from({length:totalMonths}, (_,i) => {
              const m = i + 1;
              const yr = m % 12 === 1;
              const sem = m % 6 === 1;
              return `<div class="flex items-center justify-center border-r ${yr ? 'border-primary/20' : sem ? 'border-outline-variant/15' : 'border-outline-variant/5'}" style="width:${mw}%">
                <span class="text-[7px] ${yr ? 'font-extrabold text-primary' : sem ? 'font-bold text-on-surface-variant/70' : 'text-on-surface-variant/30'}">${m}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;

    let curWi = -1;
    for (const row of rows) {
      if (row.wi !== curWi) {
        curWi = row.wi;
        const wp = wps[row.wi];
        const c = row.color;
        html += `
          <div class="flex items-center" style="background:${c}06; border-top:1.5px solid ${c}18">
            <div class="flex-shrink-0 px-2 py-1.5 flex items-center gap-1.5" style="width:300px">
              <span class="w-5 h-5 rounded flex items-center justify-center text-white text-[8px] font-bold" style="background:${c}">W${row.wi+1}</span>
              <span class="text-[10px] font-bold truncate" style="color:${c}">${esc(wp.name || wp.desc || 'WP'+(row.wi+1))}</span>
            </div>
            <div class="flex-1"></div>
          </div>`;
      }
      html += renderRow(row, mw);
    }

    if (!rows.length) {
      html += '<div class="py-10 text-center text-xs text-on-surface-variant/50">No hay tareas configuradas.</div>';
    }

    html += '</div>';

    // Compact legend
    html += `<div class="flex flex-wrap gap-3 mt-3 text-[9px] text-on-surface-variant">
      ${wps.map((wp, wi) => `<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm" style="background:${wpColor(wi)}"></span>WP${wi+1}</span>`).join('')}
    </div>`;

    html += navHTML();
    container.innerHTML = html;
    bindEvents(cs);
    bindNav();
  }

  /* ── Convert ISO date to relative month from project start ── */
  function dateToMonth(isoDate, projectStart) {
    if (!isoDate || !projectStart) return null;
    const d = new Date(isoDate);
    const ps = new Date(projectStart);
    if (isNaN(d) || isNaN(ps)) return null;
    return (d.getFullYear() - ps.getFullYear()) * 12 + (d.getMonth() - ps.getMonth());
  }

  /* ── Build rows from WPs + tasks ───────────────────────────── */
  function buildRows(cs) {
    const rows = [];
    const projStart = cs.projectStart;

    for (let wi = 0; wi < cs.wps.length; wi++) {
      const wp = cs.wps[wi];
      const c = wpColor(wi);

      // WP1 management tasks (from checklist in Tareas step)
      if (wi === 0) {
        const mgmtTasks = savedTasks.filter(x => x.category === 'project_management');
        mgmtTasks.forEach((t) => {
          rows.push({ wi, color: c, icon: 'admin_panel_settings',
            primary: t.title, secondary: 'Management',
            id: 'mgmt-'+t.id, start: t.start_month||0, end: t.end_month||0, taskId: t.id });
        });
      }

      for (const act of wp.activities) {
        if (act.type === 'mgmt') continue;
        const actLabel = act.subtype || act.label || ACT_TYPES_LABEL[act.type] || act.type;
        const typeName = ACT_TYPES_LABEL[act.type] || act.type;

        // Use _gantt_start/end if set, otherwise compute from date_start/end
        let start = act._gantt_start;
        let end = act._gantt_end;
        if ((start == null || start === 0) && act.date_start && projStart) {
          start = dateToMonth(act.date_start, projStart);
          if (start != null) act._gantt_start = start;
        }
        if ((end == null || end === 0) && act.date_end && projStart) {
          end = dateToMonth(act.date_end, projStart);
          if (end != null) act._gantt_end = end;
        }

        rows.push({ wi, color: c, icon: ACT_ICONS[act.type]||'task',
          primary: actLabel,
          secondary: actLabel !== typeName ? typeName : '',
          id: 'act-'+act.id, start: start||0, end: end||0, actRef: act });
      }

      // Custom tasks
      for (const t of savedTasks.filter(x => x.category === 'custom' && parseInt(x.subtype) === wi)) {
        rows.push({ wi, color: c, icon: 'edit_note',
          primary: t.title || 'Sin título', secondary: 'Personalizada',
          id: 'custom-'+t.id, start: t.start_month||0, end: t.end_month||0, taskId: t.id });
      }
    }
    return rows;
  }

  function shortTitle(t) {
    if (!t) return '';
    // Shorten common prefixes
    return t.replace(/^(Organisation of the |Implementation of the |Development of the |Delivery of the |Provision of |Production of |Acquisition of )/, '').trim();
  }

  /* ── Single row ────────────────────────────────────────────── */
  function renderRow(row, mw) {
    const s = row.start || 0;
    const e = row.end || 0;

    const opts = (val) => `<option value="">-</option>` + Array.from({length:totalMonths}, (_,i) =>
      `<option value="${i+1}" ${i+1===val?'selected':''}>${i+1}</option>`
    ).join('');

    // Grid lines + bar
    let barCSS = '';
    if (s && e && s <= e) {
      const left = ((s-1)/totalMonths*100).toFixed(2);
      const width = ((e-s+1)/totalMonths*100).toFixed(2);
      barCSS = `<div class="gantt-bar absolute top-1 bottom-1 rounded transition-all duration-300" style="left:${left}%;width:${width}%;background:${row.color};opacity:0.7"></div>`;
    }

    // Vertical grid
    let grid = '';
    for (let m = 1; m <= totalMonths; m++) {
      if (m % 12 === 1) grid += `<div class="absolute top-0 bottom-0 border-l border-primary/10" style="left:${((m-1)/totalMonths*100).toFixed(2)}%"></div>`;
      else if (m % 6 === 1) grid += `<div class="absolute top-0 bottom-0 border-l border-outline-variant/10" style="left:${((m-1)/totalMonths*100).toFixed(2)}%"></div>`;
    }

    return `
      <div class="gantt-row flex items-center border-b border-outline-variant/6 hover:bg-primary/[0.02] transition-colors" data-rid="${row.id}">
        <div class="flex-shrink-0 px-2 py-1.5 border-r border-outline-variant/10 overflow-hidden" style="width:300px">
          <div class="flex items-start gap-1.5 pl-3">
            <span class="material-symbols-outlined text-[11px] mt-0.5" style="color:${row.color}">${row.icon}</span>
            <div class="min-w-0 flex-1">
              <div class="text-[10px] font-bold text-on-surface truncate" title="${esc(row.primary)}">${esc(row.primary)}</div>
              ${row.secondary ? `<div class="text-[9px] text-on-surface-variant/60 truncate" title="${esc(row.secondary)}">↳ ${esc(row.secondary)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="flex-shrink-0 px-2 py-1 border-r border-outline-variant/10 flex items-center gap-1 justify-center" style="width:90px">
          <select class="gantt-s gantt-sel" data-rid="${row.id}">${opts(s)}</select>
          <span class="text-[10px] text-on-surface-variant/40">→</span>
          <select class="gantt-e gantt-sel" data-rid="${row.id}">${opts(e)}</select>
        </div>
        <div class="flex-1 relative" style="height:22px">
          ${grid}${barCSS}
        </div>
      </div>`;
  }

  /* ── Events ────────────────────────────────────────────────── */
  function bindEvents(cs) {
    container.querySelectorAll('.gantt-s, .gantt-e').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = sel.closest('.gantt-row');
        const rid = row.dataset.rid;
        let sVal = parseInt(row.querySelector('.gantt-s').value) || 0;
        let eVal = parseInt(row.querySelector('.gantt-e').value) || 0;
        if (sVal && eVal && eVal < sVal) { eVal = sVal; row.querySelector('.gantt-e').value = eVal; }

        // Update bar
        const barArea = row.querySelector('.flex-1.relative');
        let bar = barArea?.querySelector('.gantt-bar');
        if (sVal && eVal) {
          const left = ((sVal-1)/totalMonths*100).toFixed(2)+'%';
          const width = ((eVal-sVal+1)/totalMonths*100).toFixed(2)+'%';
          const color = bar?.style.background || row.querySelector('.material-symbols-outlined')?.style.color || '#1b1464';
          if (bar) { bar.style.left = left; bar.style.width = width; }
          else barArea.insertAdjacentHTML('beforeend', `<div class="gantt-bar absolute top-1 bottom-1 rounded transition-all duration-300" style="left:${left};width:${width};background:${color};opacity:0.7"></div>`);
        } else if (bar) { bar.remove(); }

        // Persist
        if (rid.startsWith('act-')) {
          const actId = parseInt(rid.replace('act-',''));
          for (const wp of cs.wps) { const a = wp.activities.find(x=>x.id===actId); if (a) { a._gantt_start=sVal||null; a._gantt_end=eVal||null; break; } }
          // Trigger Calculator autosave so gantt months persist to DB
          if (typeof Calculator !== 'undefined' && Calculator.scheduleSave) Calculator.scheduleSave();
        } else {
          const tid = rid.replace('mgmt-','').replace('custom-','');
          if (projectId && tid) API.patch('/intake/tasks/'+tid, { start_month:sVal||null, end_month:eVal||null }).catch(()=>{});
        }
      });
    });
  }

  /* ── Nav (only shown inside Intake, not in Writer Prep Studio) ── */
  function isInsideWriter() {
    return container && !!container.closest('#panel-developer');
  }

  function navHTML() {
    if (isInsideWriter()) return '';
    return `
      <div class="flex justify-between items-center mt-10 pt-5 border-t border-outline-variant">
        <button data-goto="4" class="intake-step-nav-btn inline-flex items-center gap-2 px-5 py-3 rounded-md text-on-surface-variant font-semibold text-sm border border-outline-variant hover:bg-surface-container-low transition-colors">
          <span class="material-symbols-outlined text-base">arrow_back</span> Tareas
        </button>
        <button data-goto="6" class="intake-step-nav-btn inline-flex items-center gap-2 px-8 py-4 rounded-md bg-secondary-fixed text-primary-container font-bold text-base shadow-[0_24px_48px_rgba(27,20,100,0.1)] hover:scale-[1.02] active:scale-95 transition-transform">
          Resumen <span class="material-symbols-outlined text-lg">arrow_forward</span>
        </button>
      </div>`;
  }

  function bindNav() {
    if (isInsideWriter()) return;
    container.querySelectorAll('.intake-step-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof Intake !== 'undefined' && Intake._calcNav) Intake._calcNav(parseInt(btn.dataset.goto));
      });
    });
  }

  return { render };
})();
