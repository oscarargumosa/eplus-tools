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

  // Colores de WP con la paleta de marca (misma tabla que intake-tasks.js).
  // FILL = barras y muestras; INK = texto/iconos sobre blanco (≥4,5:1); ON = texto sobre FILL.
  const WP_COLORS = ['#4312d8','#d4ec3c','#b392f6','#1b0759','#8b93d6','#7349f0','#c9b9e3','#8a8aa3'];
  const WP_INK    = ['#4312d8','#1b0759','#5b2fd6','#1b0759','#4312d8','#7349f0','#5b2fd6','#55577a'];
  const WP_ON     = ['#ffffff','#1b0759','#ffffff','#e9ff60','#1b0759','#ffffff','#1b0759','#ffffff'];
  function wpColor(i) { return WP_COLORS[i % WP_COLORS.length]; }
  function wpInk(i) { return WP_INK[i % WP_INK.length]; }
  function wpOn(i) { return WP_ON[i % WP_ON.length]; }

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

  // Mismo criterio que findTemplate() de intake-tasks.js: así la tarea de cada
  // actividad es la misma fila de project_tasks que edita la pestaña Tareas.
  function findTemplate(category, subtypeLabel) {
    if (!templates) return null;
    const cat = templates.find(c => c.category === category);
    if (!cat) return null;
    if (!subtypeLabel) return cat.subtypes[0] || null;
    const norm = subtypeLabel.toLowerCase().trim();
    return cat.subtypes.find(sub => sub.label.toLowerCase().trim() === norm) || cat.subtypes[0] || null;
  }

  let rowsById = new Map();

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
          color: #4312d8;
          background: #f8f8f8;
          border: 1.5px solid #d6d3dc;
          border-radius: 6px;
          cursor: pointer;
          outline: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          transition: all 0.15s;
        }
        .gantt-sel:focus {
          border-color: #4312d8;
          background: white;
          box-shadow: 0 0 0 2px rgba(67,18,216,0.12);
        }
        .gantt-sel:hover { border-color: #4312d8; background: white; }
        .gantt-sel option { font-size: 13px; }
        .gantt-sel.gantt-inh { color: #8a8aa3; font-weight: 500; border-style: dashed; }
      </style>
      <div class="mb-5">
        <h1 class="font-headline text-3xl font-extrabold tracking-tighter text-primary mb-1">Gantt del Proyecto</h1>
        <p class="text-on-surface-variant text-sm">Duración: <strong>${totalMonths} meses</strong>. Cada actividad lleva debajo su tarea (con el código de la pestaña Tareas). Una tarea sin fechas propias toma las de su actividad.</p>
      </div>

      <!-- En móvil (css/movil.css) el cronograma se desplaza en horizontal dentro de
           su caja, con la columna de tareas fija a la izquierda. -->
      <div class="gantt-box rounded-2xl border border-outline-variant/20 shadow-sm bg-white overflow-hidden">
        <div class="gantt-inner">
        <!-- Ruler -->
        <div class="flex" style="height:28px">
          <div class="gantt-lbl flex-shrink-0 border-r border-outline-variant/20 flex items-center px-2" style="width:300px">
            <span class="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Actividad / Tarea</span>
          </div>
          <div class="gantt-dates flex-shrink-0 border-r border-outline-variant/20 flex items-center justify-center" style="width:90px">
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
            <div class="gantt-lbl flex-shrink-0 px-2 py-1.5 flex items-center gap-1.5" style="width:300px">
              <span class="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold" style="background:${c};color:${wpOn(row.wi)}">W${row.wi+1}</span>
              <span class="text-[10px] font-bold truncate" style="color:${row.ink}">${esc(wp.name || wp.desc || 'WP'+(row.wi+1))}</span>
            </div>
            <div class="flex-1"></div>
          </div>`;
      }
      html += renderRow(row, mw);
    }

    if (!rows.length) {
      html += '<div class="py-10 text-center text-xs text-on-surface-variant/50">No hay tareas configuradas.</div>';
    }

    html += '</div></div>';

    // Compact legend
    html += `<div class="flex flex-wrap gap-3 mt-3 text-[9px] text-on-surface-variant">
      <span class="flex items-center gap-1"><span class="w-5 h-2.5 rounded-sm" style="background:#4312d8;opacity:.7"></span>Actividad</span>
      <span class="flex items-center gap-1"><span class="w-5 h-2.5 rounded-sm" style="${taskBarBg('#4312d8')};opacity:.6"></span>Tarea</span>
      <span class="flex items-center gap-1"><span class="w-5 h-2.5 rounded-sm" style="${taskBarBg('#4312d8')};opacity:.25"></span>Tarea con las fechas de su actividad</span>
      <span class="mx-1 text-outline-variant">·</span>
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
  // Orden y códigos T<wp>.<n> iguales que en la pestaña Tareas: gestión (WP1) →
  // cada actividad seguida de su tarea → tareas personalizadas.
  function buildRows(cs) {
    const rows = [];
    const projStart = cs.projectStart;
    const mgmtOrder = ((templates || []).find(c => c.category === 'project_management')?.subtypes || []).map(x => x.key);

    for (let wi = 0; wi < cs.wps.length; wi++) {
      const wp = cs.wps[wi];
      const c = wpColor(wi), ink = wpInk(wi);
      let n = 0;
      const nextCode = () => `T${wi + 1}.${++n}`;

      // WP1: tareas de gestión marcadas en Tareas
      if (wi === 0) {
        savedTasks.filter(x => x.category === 'project_management')
          .sort((a, b) => mgmtOrder.indexOf(a.subtype) - mgmtOrder.indexOf(b.subtype))
          .forEach(t => rows.push({ kind: 'task', wi, color: c, ink, icon: 'admin_panel_settings', code: nextCode(),
            primary: t.title, secondary: 'Gestión del proyecto',
            id: 'task-' + t.id, start: t.start_month || 0, end: t.end_month || 0, taskId: t.id }));
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

        const actId = 'act-' + act.id;
        rows.push({ kind: 'act', wi, color: c, ink, icon: ACT_ICONS[act.type] || 'task',
          primary: actLabel,
          secondary: actLabel !== typeName ? typeName : '',
          id: actId, start: start || 0, end: end || 0, actRef: act });

        // La tarea de esta actividad (pestaña Tareas). Sin fechas propias, hereda las de la actividad.
        const code = nextCode();
        const category = TYPE_MAP[act.type];
        if (!category) continue;
        const sub = act.subtype || '';
        const tmpl = findTemplate(category, sub);
        const subKey = tmpl?.key || (sub ? sub.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) : '');
        const saved = savedTasks.find(t => t.category === category && t.subtype === subKey && t.wp_id === String(wi));
        const own = !!(saved && saved.start_month && saved.end_month);
        const title = saved?.title || tmpl?.title || actLabel;
        rows.push({ kind: 'task', wi, color: c, ink, icon: 'subdirectory_arrow_right', code,
          primary: shortTitle(title), secondary: '', fullTitle: title,
          id: saved ? 'task-' + saved.id : 'new-' + act.id,
          start: own ? saved.start_month : (start || 0), end: own ? saved.end_month : (end || 0),
          inherited: !own, parentId: actId, taskId: saved?.id || null,
          newTask: saved ? null : { category, subtype: subKey, wp_id: String(wi), title, description: tmpl?.description || '' } });
      }

      // Tareas personalizadas
      for (const t of savedTasks.filter(x => x.category === 'custom' && parseInt(x.subtype) === wi)) {
        rows.push({ kind: 'task', wi, color: c, ink, icon: 'edit_note', code: nextCode(),
          primary: t.title || 'Sin título', secondary: 'Personalizada',
          id: 'task-' + t.id, start: t.start_month || 0, end: t.end_month || 0, taskId: t.id });
      }
    }
    rowsById = new Map(rows.map(r => [r.id, r]));
    return rows;
  }

  function shortTitle(t) {
    if (!t) return '';
    // Shorten common prefixes
    return t.replace(/^(Organisation of the |Implementation of the |Development of the |Delivery of the |Provision of |Production of |Acquisition of )/, '').trim();
  }

  /* ── Single row ────────────────────────────────────────────── */
  // Barra de tarea: rayada, para distinguirla de la de su actividad.
  function taskBarBg(color) {
    return `background:repeating-linear-gradient(135deg, ${color} 0 5px, ${color}88 5px 10px)`;
  }

  function barHTML(row, s, e) {
    if (!(s && e && s <= e)) return '';
    const left = ((s-1)/totalMonths*100).toFixed(2);
    const width = ((e-s+1)/totalMonths*100).toFixed(2);
    const isTask = row.kind === 'task';
    const bg = isTask ? taskBarBg(row.color) : `background:${row.color}`;
    const op = isTask ? (row.inherited ? 0.25 : 0.6) : 0.7;
    return `<div class="gantt-bar absolute ${isTask ? 'top-1.5 bottom-1.5' : 'top-1 bottom-1'} rounded transition-all duration-300" style="left:${left}%;width:${width}%;${bg};opacity:${op}"></div>`;
  }

  function renderRow(row, mw) {
    const s = row.start || 0;
    const e = row.end || 0;
    const isTask = row.kind === 'task';

    const opts = (val) => `<option value="">-</option>` + Array.from({length:totalMonths}, (_,i) =>
      `<option value="${i+1}" ${i+1===val?'selected':''}>${i+1}</option>`
    ).join('');

    // Vertical grid
    let grid = '';
    for (let m = 1; m <= totalMonths; m++) {
      if (m % 12 === 1) grid += `<div class="absolute top-0 bottom-0 border-l border-primary/10" style="left:${((m-1)/totalMonths*100).toFixed(2)}%"></div>`;
      else if (m % 6 === 1) grid += `<div class="absolute top-0 bottom-0 border-l border-outline-variant/10" style="left:${((m-1)/totalMonths*100).toFixed(2)}%"></div>`;
    }

    const inh = isTask && row.inherited;
    const selCls = 'gantt-sel' + (inh ? ' gantt-inh' : '');
    const selTitle = inh ? ' title="Toma las fechas de su actividad. Cámbialas para darle fechas propias."' : '';
    const label = isTask
      ? `<div class="flex items-start gap-1.5 ${row.parentId ? 'pl-7' : 'pl-3'}">
            <span class="text-[8px] font-mono font-bold px-1 py-px rounded mt-px flex-shrink-0" style="background:${row.color}18;color:${row.ink}">${esc(row.code || '')}</span>
            <div class="min-w-0 flex-1">
              <div class="text-[10px] text-on-surface truncate" title="${esc(row.fullTitle || row.primary)}">${esc(row.primary)}</div>
              ${row.secondary ? `<div class="text-[9px] text-on-surface-variant/60 truncate">${esc(row.secondary)}</div>` : ''}
            </div>
          </div>`
      : `<div class="flex items-start gap-1.5 pl-3">
            <span class="material-symbols-outlined text-[11px] mt-0.5" style="color:${row.ink}">${row.icon}</span>
            <div class="min-w-0 flex-1">
              <div class="text-[10px] font-bold text-on-surface truncate" title="${esc(row.primary)}">${esc(row.primary)}</div>
              ${row.secondary ? `<div class="text-[9px] text-on-surface-variant/60 truncate" title="${esc(row.secondary)}">↳ ${esc(row.secondary)}</div>` : ''}
            </div>
          </div>`;

    return `
      <div class="gantt-row flex items-center border-b border-outline-variant/6 hover:bg-primary/[0.02] transition-colors" data-rid="${row.id}">
        <div class="gantt-lbl flex-shrink-0 px-2 ${isTask ? 'py-1' : 'py-1.5'} border-r border-outline-variant/10 overflow-hidden" style="width:300px">
          ${label}
        </div>
        <div class="gantt-dates flex-shrink-0 px-2 py-1 border-r border-outline-variant/10 flex items-center gap-1 justify-center" style="width:90px">
          <select class="gantt-s ${selCls}" data-rid="${row.id}"${selTitle}>${opts(s)}</select>
          <span class="text-[10px] text-on-surface-variant/40">→</span>
          <select class="gantt-e ${selCls}" data-rid="${row.id}"${selTitle}>${opts(e)}</select>
        </div>
        <div class="gantt-track flex-1 relative" style="height:${isTask ? 18 : 22}px">
          ${grid}${barHTML(row, s, e)}
        </div>
      </div>`;
  }

  // Repinta selects y barra de una fila con sus valores actuales.
  function paintRow(rowEl, row) {
    const s = row.start || 0, e = row.end || 0;
    const inh = row.kind === 'task' && row.inherited;
    rowEl.querySelectorAll('.gantt-s, .gantt-e').forEach(sel => {
      sel.value = String((sel.classList.contains('gantt-s') ? s : e) || '');
      sel.classList.toggle('gantt-inh', inh);
      if (inh) sel.title = 'Toma las fechas de su actividad. Cámbialas para darle fechas propias.';
      else sel.removeAttribute('title');
    });
    const track = rowEl.querySelector('.gantt-track');
    track?.querySelector('.gantt-bar')?.remove();
    if (track) track.insertAdjacentHTML('beforeend', barHTML(row, s, e));
  }

  /* ── Events ────────────────────────────────────────────────── */
  function bindEvents(cs) {
    container.querySelectorAll('.gantt-s, .gantt-e').forEach(sel => {
      sel.addEventListener('change', async () => {
        const rowEl = sel.closest('.gantt-row');
        const row = rowsById.get(rowEl.dataset.rid);
        if (!row) return;
        let sVal = parseInt(rowEl.querySelector('.gantt-s').value) || 0;
        let eVal = parseInt(rowEl.querySelector('.gantt-e').value) || 0;
        if (sVal && eVal && eVal < sVal) eVal = sVal;

        if (row.kind === 'act') {
          row.start = sVal; row.end = eVal;
          paintRow(rowEl, row);
          const act = row.actRef;
          if (act) { act._gantt_start = sVal || null; act._gantt_end = eVal || null; }
          // Trigger Calculator autosave so gantt months persist to DB
          if (typeof Calculator !== 'undefined' && Calculator.scheduleSave) Calculator.scheduleSave();
          // Las tareas que heredan de esta actividad se mueven con ella
          for (const t of rowsById.values()) {
            if (t.parentId === row.id && t.inherited) {
              t.start = sVal; t.end = eVal;
              const tEl = container.querySelector(`.gantt-row[data-rid="${t.id}"]`);
              if (tEl) paintRow(tEl, t);
            }
          }
          return;
        }

        // Tarea: elegir un mes le da fechas propias (si falta el otro, se copia el mismo);
        // vaciar cualquiera de los dos la devuelve a las fechas de su actividad.
        const cleared = !sel.value;
        if (!cleared) { if (sVal && !eVal) eVal = sVal; if (eVal && !sVal) sVal = eVal; }
        const own = !cleared && !!(sVal && eVal);
        const parent = row.parentId ? rowsById.get(row.parentId) : null;
        row.inherited = !!parent && !own;
        row.start = row.inherited ? parent.start : sVal;
        row.end = row.inherited ? parent.end : eVal;
        paintRow(rowEl, row);
        if (!projectId) return;
        const months = { start_month: own ? sVal : null, end_month: own ? eVal : null };
        try {
          if (row.taskId) {
            await API.patch('/intake/tasks/' + row.taskId, months);
            const st = savedTasks.find(t => t.id === row.taskId);
            if (st) Object.assign(st, months);
          } else if (row.newTask && own) {
            // La tarea aún no estaba guardada (la pestaña Tareas la propone desde la plantilla)
            const res = await API.post(`/intake/projects/${projectId}/tasks`, { ...row.newTask, ...months });
            row.taskId = res?.data?.id || res?.id || null;
            if (row.taskId) { savedTasks.push({ id: row.taskId, ...row.newTask, ...months }); row.newTask = null; }
          }
        } catch (e) { /* el indicador global de guardado avisa y ofrece reintentar */ }
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
        <button data-goto="4" class="intake-step-nav-btn inline-flex items-center gap-2 px-5 py-3 rounded-full text-on-surface-variant font-semibold text-sm border border-outline-variant hover:bg-surface-container-low transition-colors">
          <span class="material-symbols-outlined text-base">arrow_back</span> Tareas
        </button>
        <button data-goto="6" class="intake-step-nav-btn inline-flex items-center gap-2 px-8 py-4 rounded-full bg-secondary-fixed text-primary-container font-bold text-base shadow-[0_24px_48px_rgba(67,18,216,0.1)] hover:scale-[1.02] active:scale-95 transition-transform">
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
