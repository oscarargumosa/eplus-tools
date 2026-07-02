/* ═══════════════════════════════════════════════════════════════
   IntakeTasks — WP Activities → Auto-generated Tasks
   Stacked layout: Activity header → Task card below (full width)
   WP1: inline checklist, all others: editable + add custom
   ═══════════════════════════════════════════════════════════════ */

const IntakeTasks = (() => {

  let templates = null;
  let container = null;
  let projectId = null;
  let mgmtEnabled = new Set();
  let customTasks = {};
  let savedTasks = [];
  let saveTimers = {};
  let leaderCtx = null; // { showLeaders, partners, wps[] }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const TYPE_MAP = {
    mgmt:'project_management', meeting:'transnational_meeting', ltta:'ltta_mobility',
    io:'intellectual_output', me:'multiplier_event', local_ws:'local_workshop',
    personal_work:'personal_work',
    campaign:'dissemination', website:'website', artistic:'artistic_fees',
    equipment:'equipment', goods:'other_goods', consumables:'consumables', other:'other_costs',
    fstp:'financial_support_third_parties',
  };

  const ACT_ICONS = {
    meeting:'groups', ltta:'flight_takeoff', io:'menu_book', me:'campaign',
    local_ws:'school', personal_work:'psychology', campaign:'share', website:'language', artistic:'palette',
    equipment:'devices', goods:'inventory_2', consumables:'eco', other:'more_horiz',
    fstp:'volunteer_activism',
  };

  function findTemplate(category, subtypeLabel) {
    if (!templates) return null;
    const cat = templates.find(c => c.category === category);
    if (!cat) return null;
    if (!subtypeLabel) return cat.subtypes[0] || null;
    const norm = subtypeLabel.toLowerCase().trim();
    return cat.subtypes.find(s => s.label.toLowerCase().trim() === norm) || cat.subtypes[0] || null;
  }

  const WP_COLORS = ['#1b1464','#1e40af','#0369a1','#0e7490','#155e75','#1d4ed8','#4338ca','#6366f1','#0284c7','#7c3aed'];
  function wpColor(i) { return WP_COLORS[i % WP_COLORS.length]; }

  /* ── Main ──────────────────────────────────────────────────── */
  async function render(el, pid, ctx) {
    container = el;
    projectId = pid;
    leaderCtx = ctx && ctx.showLeaders ? ctx : null;
    if (!container) return;

    if (!templates) {
      try {
        const res = await API.get('/intake/task-templates');
        templates = res.data || res;
      } catch (e) { container.innerHTML = '<p class="text-error text-sm">Error cargando templates</p>'; return; }
    }

    if (projectId) {
      try {
        const res = await API.get(`/intake/projects/${projectId}/tasks`);
        savedTasks = res.data || res || [];
        mgmtEnabled = new Set(savedTasks.filter(t => t.category === 'project_management').map(t => t.subtype));
        customTasks = {};
        savedTasks.filter(t => t.category === 'custom').forEach(t => {
          const wi = parseInt(t.subtype) || 0;
          if (!customTasks[wi]) customTasks[wi] = [];
          customTasks[wi].push({ id: t.id, title: t.title, description: t.description, partner_id: t.partner_id || null });
        });
      } catch (e) { /* ignore */ }
    }

    const cs = (typeof Calculator !== 'undefined' && Calculator.isInitialized()) ? Calculator.getCalcState() : null;
    if (!cs || !cs.wps?.length) {
      container.innerHTML = `
        <h1 class="font-headline text-3xl font-extrabold tracking-tighter text-primary mb-1">Tareas del Proyecto</h1>
        <p class="text-on-surface-variant text-base mb-8">Define primero los Work Packages y actividades en el paso anterior.</p>
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <span class="material-symbols-outlined text-5xl text-outline-variant/40 mb-3">account_tree</span>
          <p class="text-sm text-on-surface-variant">Vuelve al paso WPs para configurar las actividades.</p>
        </div>`;
      return;
    }
    renderAll(cs);
  }

  let totalWPs = 0;

  function renderAll(cs) {
    totalWPs = cs.wps.length;
    let html = `
      <div class="mb-8">
        <h1 class="font-headline text-3xl font-extrabold tracking-tighter text-primary mb-1">Tareas del Proyecto</h1>
        <p class="text-on-surface-variant text-sm">Cada actividad genera su tarea recomendada. Puedes editar títulos, descripciones y añadir tareas nuevas.</p>
      </div>`;
    for (let wi = 0; wi < cs.wps.length; wi++) html += renderWP(cs.wps[wi], wi);

    html += navButtons(3, 5, 'Gantt');
    container.innerHTML = html;
    bindEvents();
    bindNav();
  }

  function buildWPTitleSelect(wi, currentName, color) {
    const isFirst = wi === 0;
    const isLast  = wi === totalWPs - 1 && totalWPs > 1;
    let titles = [];
    if (isFirst) {
      titles = Calculator.WP1_TITLES || [];
    } else if (isLast) {
      titles = Calculator.LAST_WP_TITLES || [];
    } else {
      // Middle WPs: flat list grouped by category
      const tax = Calculator.WP_TAXONOMY || [];
      let opts = '';
      for (const g of tax) {
        opts += `<optgroup label="${esc(g.cat)}">`;
        for (const t of g.titles) opts += `<option value="${esc(t)}" ${t===currentName?'selected':''}>${esc(t)}</option>`;
        opts += '</optgroup>';
      }
      return `<select class="wp-title-select text-sm font-bold bg-transparent border-none focus:outline-none cursor-pointer max-w-full" style="color:${color}" data-wi="${wi}">${opts}</select>`;
    }
    const opts = titles.map(t => `<option value="${esc(t)}" ${t===currentName?'selected':''}>${esc(t)}</option>`).join('');
    return `<select class="wp-title-select text-sm font-bold bg-transparent border-none focus:outline-none cursor-pointer max-w-full" style="color:${color}" data-wi="${wi}">${opts}</select>`;
  }

  /* ── WP Block ──────────────────────────────────────────────── */
  function renderWP(wp, wi) {
    const c = wpColor(wi);
    const n = wi + 1;
    const acts = wp.activities.filter(a => a.type !== 'mgmt');
    const custs = customTasks[wi] || [];
    const total = acts.length + custs.length + (wi === 0 ? mgmtEnabled.size : 0);

    const titleSelect = buildWPTitleSelect(wi, wp.name || wp.desc || '', c);

    let h = `
    <div class="mb-10">
      <!-- WP Header -->
      <div class="flex items-center gap-4 mb-4">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-base shadow-lg" style="background:linear-gradient(135deg,${c},${c}bb)">WP${n}</div>
        <div class="flex-1">
          ${titleSelect}
          <div class="flex items-center gap-3 mt-0.5 text-[11px] text-on-surface-variant">
            <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-xs" style="color:${c}">task_alt</span> ${total} tarea${total!==1?'s':''}</span>
            <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-xs" style="color:${c}">bolt</span> ${acts.length} actividad${acts.length!==1?'es':''}</span>
          </div>
        </div>
      </div>

      <div class="ml-7 border-l-3 pl-6 space-y-4" style="border-color:${c}25">`;

    // Task-code counter: mirrors the seed iteration order (mgmt → activities → custom)
    // so the codes T1.1, T1.2, … line up with wp_tasks when available.
    let taskIdx = 0;

    // WP1 management checklist (renderMgmt assigns its own codes internally)
    if (wi === 0) h += renderMgmt(c, () => taskIdx++);

    // Activities → Tasks (stacked)
    for (const act of acts) h += renderActTask(act, wi, c, taskIdx++);

    // Custom tasks
    for (let ci = 0; ci < custs.length; ci++) h += renderCustom(custs[ci], wi, ci, c, taskIdx++);

    // Add button
    h += `
        <button class="add-custom-task flex items-center gap-2 w-full px-5 py-3.5 rounded-2xl text-xs font-bold transition-all hover:shadow-md group" style="border:2px dashed ${c}30; color:${c}; background:${c}03" data-wi="${wi}">
          <span class="w-8 h-8 rounded-xl flex items-center justify-center transition-colors" style="background:${c}10">
            <span class="material-symbols-outlined text-sm group-hover:scale-110 transition-transform" style="color:${c}">add</span>
          </span>
          Añadir tarea personalizada
        </button>`;

    h += '</div></div>';
    return h;
  }

  /* ── WP1 Management checklist ──────────────────────────────── */
  function renderMgmt(c, advanceIdx) {
    const cat = (templates||[]).find(x => x.category === 'project_management');
    if (!cat) return '';

    let h = `
      <div class="rounded-2xl overflow-hidden shadow-sm" style="border:1.5px solid ${c}20">
        <div class="px-5 py-3 flex items-center justify-between" style="background:linear-gradient(135deg,${c}08,${c}03)">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-base" style="color:${c}">admin_panel_settings</span>
            <span class="text-xs font-bold" style="color:${c}">Tareas de gestión del proyecto</span>
          </div>
          <button class="mgmt-toggle-all px-3 py-1 rounded-lg text-[10px] font-bold text-white transition-all hover:shadow-md" style="background:${c}">${mgmtEnabled.size >= 10 ? 'Deseleccionar' : 'Seleccionar todas'}</button>
        </div>
        <div class="divide-y" style="divide-color:${c}08">`;

    for (let i = 0; i < cat.subtypes.length; i++) {
      const sub = cat.subtypes[i];
      const on = mgmtEnabled.has(sub.key);
      const savedMgmt = on
        ? savedTasks.find(t => t.category === 'project_management' && t.subtype === sub.key)
        : null;
      // Reserve a T-code slot for enabled mgmt items (they become wp_tasks).
      const tCode = on && typeof advanceIdx === 'function' ? taskCodeFor(0, advanceIdx()) : '';
      const leaderHtml = on
        ? `<div class="ml-8 -mt-1 mb-1">${renderLeaderBlock(0, savedMgmt ? { partner_id: savedMgmt.partner_id } : null, savedMgmt ? `data-tid="${esc(savedMgmt.id)}"` : `data-cat="project_management" data-sub="${esc(sub.key)}" data-wi="0"`, { allPartners: true })}</div>`
        : '';
      h += `
        <div data-mgmt-row="${esc(sub.key)}" style="${on?`background:${c}05`:''}">
          <label class="mgmt-check flex items-start gap-3 px-5 py-4 cursor-pointer transition-all hover:bg-surface-container-lowest" data-sub="${esc(sub.key)}">
            <div class="mt-0.5 flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all ${on?'text-white shadow-sm':'border-2 border-outline-variant/40 bg-white'}" style="${on?`background:${c}`:''}">
              ${on?'<span class="material-symbols-outlined text-xs">check</span>':''}
            </div>
            <input type="checkbox" class="mgmt-cb sr-only" data-sub="${esc(sub.key)}" ${on?'checked':''}>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                ${tCode ? `<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">${esc(tCode)}</span>` : ''}
                <span class="text-xs font-bold ${on?'text-on-surface':'text-on-surface/80'}">${i+1}. ${esc(sub.label)}</span>
              </div>
              <p class="text-[11px] text-on-surface-variant mt-1 leading-relaxed">${esc(sub.description)}</p>
            </div>
          </label>
          ${leaderHtml}
        </div>`;
    }
    h += '</div></div>';
    return h;
  }

  /* ── Leader/participants helpers ──────────────────────────── */
  function wpForIndex(wi) {
    if (!leaderCtx || !leaderCtx.wps) return null;
    return leaderCtx.wps[wi] || null;
  }
  // Map a (wi, taskIndex) pair to the corresponding T-code (T1.1, T1.2, …)
  // from wp_tasks if available, falling back to a deterministic guess so the
  // UI never shows an empty code chip.
  function taskCodeFor(wi, idxInWp) {
    const wp = wpForIndex(wi);
    if (wp && Array.isArray(wp.wp_tasks) && wp.wp_tasks[idxInWp]?.code) {
      return wp.wp_tasks[idxInWp].code;
    }
    return `T${wi + 1}.${idxInWp + 1}`;
  }
  function eligiblePartnersFor(wi, opts) {
    if (!leaderCtx || !leaderCtx.partners) return [];
    // Management tasks (WP1 checklist) allow ANY project partner as leader,
    // regardless of WP budget. For all other tasks, restrict to partners
    // with budget > 0 in the WP.
    if (opts && opts.allPartners) return leaderCtx.partners;
    const wp = wpForIndex(wi);
    if (!wp) return [];
    const eligible = new Set(wp.eligible_partner_ids || []);
    return leaderCtx.partners.filter(p => eligible.has(p.id));
  }
  function partnerName(pid) {
    if (!leaderCtx || !leaderCtx.partners || !pid) return '';
    const p = leaderCtx.partners.find(x => x.id === pid);
    return p ? (p.name || p.acronym || '') : '';
  }
  function effectiveLeaderId(savedPartnerId, wi) {
    // If user already chose a leader, respect it. Otherwise default to WP leader.
    if (savedPartnerId) return savedPartnerId;
    const wp = wpForIndex(wi);
    return wp && wp.leader_id ? wp.leader_id : '';
  }

  /**
   * Bloque común que muestra: líder de la WP (info) + selector de líder de
   * la tarea + chips de participantes (derivados del presupuesto).
   * Se renderiza al pie de cada tarjeta de tarea cuando leaderCtx está activo.
   *
   * @param wi              Índice del WP
   * @param saved           Fila de project_tasks (si ya existe), o null
   * @param leaderKeyAttrs  HTML attrs adicionales para el <select> (data-* para identificar la task al guardar)
   */
  function renderLeaderBlock(wi, saved, leaderKeyAttrs, opts) {
    if (!leaderCtx) return '';
    const allPartners = !!(opts && opts.allPartners);
    const wp = wpForIndex(wi);
    const eligible = eligiblePartnersFor(wi, opts);
    const currentLead = effectiveLeaderId(saved?.partner_id, wi);
    const wpLeaderTxt = wp && wp.leader_acronym
      ? `<span class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary" title="Líder de este Work Package"><span class="material-symbols-outlined text-[12px]">military_tech</span>WP lidera: ${esc(wp.leader_acronym)}</span>`
      : '<span class="text-[10px] italic text-on-surface-variant/60">WP sin líder asignado</span>';

    const emptyMsg = allPartners
      ? 'Sin partners en el proyecto'
      : 'Sin partners con presupuesto en este WP';
    const leaderSelect = eligible.length
      ? `<select class="task-leader-edit text-[11px] font-semibold px-2 py-1 rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:ring-2 focus:ring-primary/15" ${leaderKeyAttrs}>
          <option value="">— Sin líder —</option>
          ${eligible.map(p => `<option value="${esc(p.id)}" ${p.id === currentLead ? 'selected' : ''}>${esc(p.name || p.acronym || '')}</option>`).join('')}
        </select>`
      : `<span class="text-[10px] italic text-on-surface-variant/60">${emptyMsg}</span>`;

    const partsLabel = allPartners ? 'Participantes' : 'Participantes (presupuesto)';
    const chipTitleNonLead = allPartners
      ? 'Participa en la tarea de gestión'
      : 'Participa (recibe presupuesto en este WP)';
    const partsChips = eligible.length
      ? eligible.map(p => {
          const isLead = p.id === currentLead;
          const cls = isLead
            ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
            : 'bg-primary/5 text-primary border-primary/15';
          const icon = isLead ? 'workspace_premium' : 'check_circle';
          return `<span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${cls}" title="${isLead ? 'Líder de la task' : chipTitleNonLead}">
            <span class="material-symbols-outlined text-[11px]">${icon}</span>${esc(p.name || p.acronym || '')}
          </span>`;
        }).join('')
      : '';
    const emptyParticipantsMsg = allPartners
      ? 'Añade partners al proyecto para activar esta lista.'
      : 'Asigna importes en Diseñar para activar partners.';

    return `
      <div class="mt-3 pt-3 border-t border-outline-variant/15 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div>
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-[9.5px] font-bold uppercase tracking-wider text-on-surface-variant">Liderazgo</span>
            ${wpLeaderTxt}
          </div>
          <label class="text-[10px] text-on-surface-variant block mb-0.5">${allPartners ? 'Líder de esta tarea (cualquier socio)' : 'Líder de esta tarea'}</label>
          ${leaderSelect}
        </div>
        <div>
          <div class="text-[9.5px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">${partsLabel}</div>
          ${partsChips
            ? `<div class="flex flex-wrap gap-1">${partsChips}</div>`
            : `<span class="text-[10px] italic text-on-surface-variant/60">${emptyParticipantsMsg}</span>`}
        </div>
      </div>`;
  }

  /* ── Activity → Task (stacked, full width) ─────────────────── */
  function renderActTask(act, wi, c, taskIdx) {
    const category = TYPE_MAP[act.type];
    const sub = act.subtype || '';
    const tmpl = findTemplate(category, sub);
    const icon = ACT_ICONS[act.type] || 'task';

    // Render the body whenever we have at least a category mapping, even if
    // the specific subtype template is missing. The fallback subKey uses
    // the activity subtype label slug so the row persists per task instance.
    const subKey = tmpl?.key || (sub ? sub.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) : '');
    const renderableBody = !!category;
    const saved = renderableBody
      ? savedTasks.find(t => t.category === category && t.subtype === subKey && t.wp_id === String(wi))
      : null;
    const title = saved?.title || tmpl?.title || act.label || '';
    const desc = saved?.description || tmpl?.description || '';
    const headline = tmpl
      ? `<span class="text-[10px] font-bold uppercase tracking-wider text-green-600">Tarea recomendada</span>`
      : `<span class="text-[10px] font-bold uppercase tracking-wider text-amber-600">Tarea (sin plantilla específica — edítala libremente)</span>`;

    const tCode = typeof taskIdx === 'number' ? taskCodeFor(wi, taskIdx) : '';
    return `
      <div class="rounded-2xl overflow-hidden shadow-sm" style="border:1.5px solid ${c}15">
        <!-- Activity badge -->
        <div class="px-5 py-2.5 flex items-center gap-2.5" style="background:${c}06">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:${c}15">
            <span class="material-symbols-outlined text-sm" style="color:${c}">${icon}</span>
          </div>
          ${tCode ? `<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style="background:${c}15;color:${c}">${esc(tCode)}</span>` : ''}
          <span class="text-xs font-bold" style="color:${c}">${esc(act.label)}</span>
          ${sub ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" style="background:${c}10;color:${c}">${esc(sub)}</span>` : ''}
        </div>
        <!-- Task (editable, full width) -->
        <div class="px-5 py-4 bg-white">
          ${renderableBody ? `
            <div class="flex items-center gap-1.5 mb-2">
              <span class="material-symbols-outlined text-xs ${tmpl ? 'text-green-500' : 'text-amber-500'}">task_alt</span>
              ${headline}
            </div>
            <input type="text" class="task-title-edit w-full text-sm font-bold text-on-surface px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest focus:bg-white focus:border-primary/30 focus:ring-2 focus:ring-primary/10 outline-none transition-all mb-2" value="${esc(title)}" data-wi="${wi}" data-cat="${category}" data-sub="${esc(subKey)}">
            <textarea class="task-desc-edit w-full text-xs text-on-surface-variant leading-relaxed px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest focus:bg-white focus:border-primary/30 focus:ring-2 focus:ring-primary/10 outline-none resize-vertical min-h-[80px] transition-all" rows="3" data-wi="${wi}" data-cat="${category}" data-sub="${esc(subKey)}">${esc(desc)}</textarea>
            ${renderLeaderBlock(wi, saved, `data-wi="${wi}" data-cat="${category}" data-sub="${esc(subKey)}"`)}
          ` : `
            <div class="py-4 text-center text-[10px] text-on-surface-variant/40">Elige un subtipo en la actividad para ver la tarea recomendada</div>
          `}
        </div>
      </div>`;
  }

  /* ── Custom task (editable + deletable) ────────────────────── */
  function renderCustom(task, wi, ci, c, taskIdx) {
    const tCode = typeof taskIdx === 'number' ? taskCodeFor(wi, taskIdx) : '';
    return `
      <div class="rounded-2xl overflow-hidden shadow-sm group" style="border:1.5px solid ${c}15">
        <div class="px-5 py-2.5 flex items-center justify-between" style="background:${c}06">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:${c}15">
              <span class="material-symbols-outlined text-sm" style="color:${c}">edit_note</span>
            </div>
            ${tCode ? `<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style="background:${c}15;color:${c}">${esc(tCode)}</span>` : ''}
            <span class="text-xs font-bold" style="color:${c}">Tarea personalizada</span>
          </div>
          <button class="delete-custom w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-error/10 hover:text-error text-on-surface-variant/30 transition-all" data-wi="${wi}" data-ci="${ci}" data-tid="${task.id}">
            <span class="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
        <div class="px-5 py-4 bg-white">
          <input type="text" class="custom-title w-full text-sm font-bold text-on-surface px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest focus:bg-white focus:border-primary/30 focus:ring-2 focus:ring-primary/10 outline-none transition-all mb-2" value="${esc(task.title)}" placeholder="Título de la tarea..." data-tid="${task.id}">
          <textarea class="custom-desc w-full text-xs text-on-surface-variant leading-relaxed px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest focus:bg-white focus:border-primary/30 focus:ring-2 focus:ring-primary/10 outline-none resize-vertical min-h-[60px] transition-all" rows="2" placeholder="Descripción..." data-tid="${task.id}">${esc(task.description)}</textarea>
          ${renderLeaderBlock(wi, { partner_id: task.partner_id }, `data-tid="${task.id}"`)}
        </div>
      </div>`;
  }

  /* ── Events ────────────────────────────────────────────────── */
  function bindEvents() {
    // Management checkboxes
    container.querySelectorAll('.mgmt-check').forEach(label => {
      label.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return; // let checkbox handle itself
        const cb = label.querySelector('.mgmt-cb');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
      });
    });
    container.querySelectorAll('.mgmt-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        const sub = cb.dataset.sub;
        if (cb.checked) mgmtEnabled.add(sub); else mgmtEnabled.delete(sub);
        // Persist immediately (per-item, so partner_id assignment can chain
        // without race with the bulk debounce).
        await toggleMgmtItemImmediate(sub, cb.checked);
        rerender();
      });
    });

    container.querySelectorAll('.mgmt-toggle-all').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cat = templates.find(x => x.category === 'project_management');
        if (!cat) return;
        const enableAll = !cat.subtypes.every(s => mgmtEnabled.has(s.key));
        if (enableAll) cat.subtypes.forEach(s => mgmtEnabled.add(s.key));
        else mgmtEnabled.clear();
        // Apply each toggle immediately so partner_ids on the surviving rows
        // are preserved by the existing diff logic in saveMgmt.
        saveMgmt();
        // Wait a tick so the debounced saveMgmt has fired by next render
        setTimeout(rerender, 600);
        rerender();
      });
    });

    // Editable task fields
    container.querySelectorAll('.task-title-edit, .task-desc-edit').forEach(inp => {
      inp.addEventListener('input', () => debounceTaskSave(inp));
    });

    // Add custom
    container.querySelectorAll('.add-custom-task').forEach(btn => {
      btn.addEventListener('click', () => addCustom(parseInt(btn.dataset.wi)));
    });

    // Edit custom
    container.querySelectorAll('.custom-title, .custom-desc').forEach(inp => {
      inp.addEventListener('input', () => debounceCustomSave(inp.dataset.tid, inp));
    });

    // Delete custom
    container.querySelectorAll('.delete-custom').forEach(btn => {
      btn.addEventListener('click', () => delCustom(parseInt(btn.dataset.wi), parseInt(btn.dataset.ci), btn.dataset.tid));
    });

    // WP title select
    container.querySelectorAll('.wp-title-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const wi = parseInt(sel.dataset.wi);
        Calculator._applyWPTitle(wi, sel.value);
      });
    });

    // Leader select (per task — works for both template tasks and custom tasks)
    container.querySelectorAll('.task-leader-edit').forEach(sel => {
      sel.addEventListener('change', () => saveTaskLeader(sel));
    });
  }

  async function saveTaskLeader(sel) {
    if (!projectId) return;
    const newPid = sel.value || null;
    const tid = sel.dataset.tid; // present for custom tasks AND management tasks (data-tid path)
    if (tid) {
      try {
        await API.patch('/intake/tasks/' + tid, { partner_id: newPid });
        // Update both caches so the re-render reflects the change instantly:
        //   - savedTasks: source of truth for renderActTask / renderMgmt
        //   - customTasks: derived cache used by renderCustom
        const savedHit = savedTasks.find(x => x.id === tid);
        if (savedHit) savedHit.partner_id = newPid;
        for (const wi of Object.keys(customTasks)) {
          const arr = customTasks[wi];
          const ix = arr.findIndex(x => x.id === tid);
          if (ix >= 0) { arr[ix].partner_id = newPid; break; }
        }
        rerender();
      } catch (e) { Toast.show('No se pudo guardar el líder: ' + (e.message || e), 'err'); }
      return;
    }
    // Template task: ensure persisted row exists, then patch partner_id
    const cat = sel.dataset.cat, sub = sel.dataset.sub, wi = sel.dataset.wi;
    if (!cat || !wi) return;
    const card = sel.closest('.bg-white');
    const title = card?.querySelector('.task-title-edit')?.value || '';
    const desc = card?.querySelector('.task-desc-edit')?.value || '';
    let existing = savedTasks.find(t => t.category === cat && t.subtype === sub && t.wp_id === wi);
    try {
      if (!existing) {
        const res = await API.post(`/intake/projects/${projectId}/tasks`, { category: cat, subtype: sub, wp_id: wi, title, description: desc, partner_id: newPid });
        existing = { id: res.data?.id || res.id, category: cat, subtype: sub, wp_id: wi, title, description: desc, partner_id: newPid };
        savedTasks.push(existing);
      } else {
        await API.patch('/intake/tasks/' + existing.id, { partner_id: newPid });
        existing.partner_id = newPid;
      }
      rerender();
    } catch (e) { Toast.show('No se pudo guardar el líder: ' + (e.message || e), 'err'); }
  }

  function rerender() {
    const cs = Calculator.isInitialized() ? Calculator.getCalcState() : null;
    if (cs) renderAll(cs);
  }

  /* ── Add custom task ───────────────────────────────────────── */
  async function addCustom(wi) {
    if (!projectId) { Toast.show('Guarda el proyecto primero', 'err'); return; }
    try {
      const res = await API.post(`/intake/projects/${projectId}/tasks`, {
        category: 'custom', subtype: String(wi), title: '', description: '',
      });
      const id = res.data?.id || res.id;
      if (!customTasks[wi]) customTasks[wi] = [];
      customTasks[wi].push({ id, title: '', description: '' });
      rerender();
      setTimeout(() => {
        const inputs = container.querySelectorAll(`.custom-title[data-tid="${id}"]`);
        if (inputs.length) inputs[0].focus();
      }, 50);
    } catch (e) { Toast.show('Error al crear tarea: ' + (e.message||e), 'err'); }
  }

  async function delCustom(wi, ci, tid) {
    try {
      await API.del('/intake/tasks/' + tid);
      if (customTasks[wi]) customTasks[wi].splice(ci, 1);
      rerender();
    } catch (e) { Toast.show('Error: ' + e.message, 'err'); }
  }

  /* ── Save helpers ──────────────────────────────────────────── */
  function debounceTaskSave(inp) {
    const key = `t-${inp.dataset.wi}-${inp.dataset.cat}-${inp.dataset.sub}`;
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(async () => {
      if (!projectId) return;
      const card = inp.closest('.bg-white');
      const title = card?.querySelector('.task-title-edit')?.value || '';
      const desc = card?.querySelector('.task-desc-edit')?.value || '';
      const cat = inp.dataset.cat, sub = inp.dataset.sub, wi = inp.dataset.wi;
      const existing = savedTasks.find(t => t.category === cat && t.subtype === sub && t.wp_id === wi);
      try {
        if (existing) {
          await API.patch('/intake/tasks/' + existing.id, { title, description: desc });
          existing.title = title; existing.description = desc;
        } else {
          const res = await API.post(`/intake/projects/${projectId}/tasks`, { category: cat, subtype: sub, wp_id: wi, title, description: desc });
          savedTasks.push({ id: res.data?.id, category: cat, subtype: sub, wp_id: wi, title, description: desc });
        }
      } catch (e) { console.error('[Tasks] save:', e); }
    }, 800);
  }

  function debounceCustomSave(tid, inp) {
    if (saveTimers['c'+tid]) clearTimeout(saveTimers['c'+tid]);
    saveTimers['c'+tid] = setTimeout(async () => {
      const card = inp.closest('.bg-white');
      const title = card?.querySelector('.custom-title')?.value || '';
      const desc = card?.querySelector('.custom-desc')?.value || '';
      try {
        await API.patch('/intake/tasks/' + tid, { title, description: desc });
      } catch (e) { console.error('[Tasks] saveCustom:', e); }
    }, 800);
  }

  /**
   * Create or delete a single management project_task immediately so the UI
   * has the saved row id available right after the checkbox toggle (the
   * leader select needs it to PATCH partner_id). Avoids the race that the
   * old bulk debounce had.
   */
  async function toggleMgmtItemImmediate(subKey, enabled) {
    if (!projectId) return;
    try {
      const existing = savedTasks.find(x => x.category === 'project_management' && x.subtype === subKey);
      if (enabled) {
        if (existing) return;
        const tmpl = _findTemplateBySubKey('project_management', subKey);
        const res = await API.post(`/intake/projects/${projectId}/tasks`, {
          category: 'project_management',
          subtype: subKey,
          wp_id: '0',
          title: tmpl?.title || tmpl?.label || subKey,
          description: tmpl?.description || '',
        });
        savedTasks.push({
          id: res.data?.id || res.id,
          category: 'project_management',
          subtype: subKey,
          wp_id: '0',
          title: tmpl?.title || tmpl?.label || subKey,
          description: tmpl?.description || '',
          partner_id: null,
        });
      } else {
        if (!existing) return;
        await API.del('/intake/tasks/' + existing.id);
        savedTasks = savedTasks.filter(x => x.id !== existing.id);
      }
    } catch (e) {
      console.error('[Tasks] toggleMgmt:', e);
      if (typeof Toast !== 'undefined') Toast.show('Error guardando la tarea: ' + (e.message || e), 'err');
    }
  }

  function _findTemplateBySubKey(catKey, subKey) {
    const cat = (templates || []).find(c => c.category === catKey);
    if (!cat) return null;
    return cat.subtypes.find(s => s.key === subKey) || null;
  }

  let mgmtTimer = null;
  function saveMgmt() {
    if (mgmtTimer) clearTimeout(mgmtTimer);
    mgmtTimer = setTimeout(async () => {
      if (!projectId) return;
      try {
        // Diff against current saved set: only delete deselected items and
        // only create newly selected ones — preserves partner_id and other
        // edits on still-enabled mgmt tasks.
        const existing = savedTasks.filter(x => x.category === 'project_management');
        const wanted = new Set(mgmtEnabled);
        const existingByKey = new Map(existing.map(t => [t.subtype, t]));

        // Delete subs no longer wanted
        for (const t of existing) {
          if (!wanted.has(t.subtype)) {
            await API.del('/intake/tasks/' + t.id);
          }
        }
        savedTasks = savedTasks.filter(x => x.category !== 'project_management' || wanted.has(x.subtype));

        // Create newly enabled subs
        const toCreate = [...wanted].filter(k => !existingByKey.has(k));
        if (toCreate.length) {
          const res = await API.post(`/intake/projects/${projectId}/tasks/generate`, {
            activities: toCreate.map(k => ({ category: 'project_management', subtype: k }))
          });
          (res.data || []).forEach(c => savedTasks.push(c));
        }
      } catch (e) { console.error('[Tasks] saveMgmt:', e); }
    }, 500);
  }

  /* ── Nav buttons (hidden when inside Writer Prep Studio) ────── */
  function isInsideWriter() {
    return container && !!container.closest('#panel-developer');
  }

  function navButtons(prevStep, nextStep, nextLabel) {
    if (isInsideWriter()) return '';
    return `
      <div class="flex justify-between items-center mt-10 pt-5 border-t border-outline-variant">
        ${prevStep !== null ? `<button data-goto="${prevStep}" class="intake-step-nav-btn inline-flex items-center gap-2 px-5 py-3 rounded-md text-on-surface-variant font-semibold text-sm border border-outline-variant hover:bg-surface-container-low transition-colors">
          <span class="material-symbols-outlined text-base">arrow_back</span> Anterior
        </button>` : '<span></span>'}
        ${nextStep !== null ? `<button data-goto="${nextStep}" class="intake-step-nav-btn inline-flex items-center gap-2 px-8 py-4 rounded-md bg-secondary-fixed text-primary-container font-bold text-base shadow-[0_24px_48px_rgba(27,20,100,0.1)] hover:scale-[1.02] active:scale-95 transition-transform">
          ${nextLabel || 'Siguiente'} <span class="material-symbols-outlined text-lg">arrow_forward</span>
        </button>` : ''}
      </div>`;
  }

  function bindNav() {
    if (isInsideWriter()) return;
    container.querySelectorAll('.intake-step-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = parseInt(btn.dataset.goto);
        if (typeof Intake !== 'undefined' && Intake._calcNav) Intake._calcNav(step);
      });
    });
  }

  return { render };
})();
