/* ═══════════════════════════════════════════════════════════════
   Budget — Detailed Budget (Lump Sum II) EACEA
   ═══════════════════════════════════════════════════════════════ */

const Budget = (() => {

  let initialized = false;
  let budgets = [];
  let current = null;        // { budget, beneficiaries, workPackages, costMap }
  let activeTab = 'setup';   // 'setup' | 'ben-{id}' | 'summary'
  let saveTimers = {};

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(n) { return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* ── WP color palette (blues) ──────────────────────────────── */
  const WP_COLORS = [
    { bg: 'bg-[#1b1464]/10', border: 'border-[#1b1464]/30', text: 'text-[#1b1464]', header: 'bg-[#1b1464]/10', accent: '#1b1464' },
    { bg: 'bg-[#1e40af]/10', border: 'border-[#1e40af]/30', text: 'text-[#1e40af]', header: 'bg-[#1e40af]/10', accent: '#1e40af' },
    { bg: 'bg-[#0369a1]/10', border: 'border-[#0369a1]/30', text: 'text-[#0369a1]', header: 'bg-[#0369a1]/10', accent: '#0369a1' },
    { bg: 'bg-[#0e7490]/10', border: 'border-[#0e7490]/30', text: 'text-[#0e7490]', header: 'bg-[#0e7490]/10', accent: '#0e7490' },
    { bg: 'bg-[#155e75]/10', border: 'border-[#155e75]/30', text: 'text-[#155e75]', header: 'bg-[#155e75]/10', accent: '#155e75' },
    { bg: 'bg-[#1d4ed8]/10', border: 'border-[#1d4ed8]/30', text: 'text-[#1d4ed8]', header: 'bg-[#1d4ed8]/10', accent: '#1d4ed8' },
    { bg: 'bg-[#4338ca]/10', border: 'border-[#4338ca]/30', text: 'text-[#4338ca]', header: 'bg-[#4338ca]/10', accent: '#4338ca' },
    { bg: 'bg-[#6366f1]/10', border: 'border-[#6366f1]/30', text: 'text-[#6366f1]', header: 'bg-[#6366f1]/10', accent: '#6366f1' },
    { bg: 'bg-[#0284c7]/10', border: 'border-[#0284c7]/30', text: 'text-[#0284c7]', header: 'bg-[#0284c7]/10', accent: '#0284c7' },
    { bg: 'bg-[#7c3aed]/10', border: 'border-[#7c3aed]/30', text: 'text-[#7c3aed]', header: 'bg-[#7c3aed]/10', accent: '#7c3aed' },
  ];

  function wpColor(idx) { return WP_COLORS[idx % WP_COLORS.length]; }

  /* ── Category labels matching EACEA Excel ──────────────────── */
  const CAT_LABELS = {
    A:  'A. DIRECT PERSONNEL COSTS',
    A1: 'A1. Employees (or equivalent) person months',
    A2: 'A.2 Natural persons under direct contract',
    A3: 'A.3 Seconded persons',
    A4: 'A.4 SME Owners without salary',
    A5: 'A.5 Volunteers',
    B:  'B. Subcontracting costs',
    C:  'C. Purchase costs',
    C1: 'C.1 Travel and subsistence',
    C2: 'C.2 Equipment (depreciation)',
    C3: 'C.3 Other goods, works and services',
    D:  'D. Other cost categories',
    D1: 'D.1 Financial support to third parties',
  };

  /* ── Init ──────────────────────────────────────────────────── */
  function init() {
    if (!initialized) {
      initialized = true;
      document.getElementById('budget-new-btn')?.addEventListener('click', createNew);
      document.getElementById('budget-back-btn')?.addEventListener('click', () => showView('list'));
    }
    showView('list');
    loadList();
  }

  function showView(name) {
    document.querySelectorAll('.budget-view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById(name === 'list' ? 'budget-list-view' : 'budget-editor-view');
    if (el) el.classList.remove('hidden');
  }

  /* ── List view ─────────────────────────────────────────────── */
  async function loadList() {
    const el = document.getElementById('budget-list');
    if (!el) return;
    el.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">Cargando...</p>';
    try {
      const res = await API.get('/budget');
      budgets = Array.isArray(res) ? res : (res.data || []);
      if (!budgets.length) {
        el.innerHTML = `
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <span class="material-symbols-outlined text-6xl text-outline-variant/40 mb-4">account_balance_wallet</span>
            <h3 class="font-headline text-lg font-bold text-primary mb-2">No tienes presupuestos</h3>
            <p class="text-sm text-on-surface-variant mb-6 max-w-sm">Crea tu primer presupuesto con la estructura oficial Lump Sum II de EACEA.</p>
            <button type="button" id="budget-empty-new" class="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-md transition-all">
              <span class="material-symbols-outlined text-lg">add</span> Crear presupuesto
            </button>
          </div>`;
        document.getElementById('budget-empty-new')?.addEventListener('click', createNew);
        return;
      }
      el.innerHTML = budgets.map(b => `
        <div class="budget-card flex items-center gap-4 p-4 rounded-xl border border-outline-variant/30 bg-white hover:border-primary hover:shadow-md cursor-pointer transition-all group" data-bid="${esc(b.id)}">
          <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-amber-600 text-xl">receipt_long</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-headline text-sm font-bold text-primary truncate">${esc(b.name)}</div>
            <div class="text-xs text-on-surface-variant mt-0.5">Max grant: ${fmt(b.max_grant)} € — Co-fin: ${b.cofin_pct}%</div>
          </div>
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${b.status === 'complete' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}">${esc(b.status)}</span>
          <button class="budget-delete w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors opacity-0 group-hover:opacity-100" data-bid="${esc(b.id)}" title="Eliminar">
            <span class="material-symbols-outlined text-base">delete</span>
          </button>
        </div>`).join('');

      el.querySelectorAll('.budget-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.budget-delete')) return;
          openBudget(card.dataset.bid);
        });
      });
      el.querySelectorAll('.budget-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('¿Eliminar este presupuesto?')) return;
          try { await API.del('/budget/' + btn.dataset.bid); Toast.show('Eliminado', 'ok'); loadList(); }
          catch (err) { Toast.show('Error: ' + (err.message || err), 'err'); }
        });
      });
    } catch (e) {
      el.innerHTML = '<p class="text-sm text-error py-8 text-center">Error al cargar</p>';
    }
  }

  async function createNew() {
    try {
      const res = await API.post('/budget', { name: 'Nuevo presupuesto' });
      const id = res.id || res.data?.id;
      Toast.show('Presupuesto creado', 'ok');
      openBudget(id);
    } catch (e) { Toast.show('Error: ' + (e.message || e), 'err'); }
  }

  /* ── Open budget editor ────────────────────────────────────── */
  async function openBudget(id) {
    try {
      const res = await API.get(`/budget/${id}/full`);
      current = res.data || res;
      document.getElementById('budget-title').textContent = current.budget.name || 'Presupuesto';
      showView('editor');
      activeTab = 'setup';
      renderConfig();
      renderTabs();
      renderTabContent();
    } catch (e) {
      Toast.show('Error: ' + (e.message || e), 'err');
    }
  }

  async function reload() {
    if (!current) return;
    const res = await API.get(`/budget/${current.budget.id}/full`);
    current = res.data || res;
    renderTabs();
    renderTabContent();
  }

  /* ── Config bar ────────────────────────────────────────────── */
  function renderConfig() {
    const el = document.getElementById('budget-config');
    if (!el || !current) return;
    const b = current.budget;
    el.innerHTML = `
      <div class="flex items-center gap-2">
        <label class="text-[10px] font-bold uppercase text-on-surface-variant">Nombre</label>
        <input type="text" id="cfg-name" value="${esc(b.name)}" class="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-xs w-48 focus:ring-1 focus:ring-primary outline-none">
      </div>
      <div class="flex items-center gap-2">
        <label class="text-[10px] font-bold uppercase text-on-surface-variant">Max Grant (€)</label>
        <input type="number" id="cfg-max-grant" value="${b.max_grant}" class="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-xs w-32 focus:ring-1 focus:ring-primary outline-none" step="1000">
      </div>
      <div class="flex items-center gap-2">
        <label class="text-[10px] font-bold uppercase text-on-surface-variant">Co-fin %</label>
        <input type="number" id="cfg-cofin" value="${b.cofin_pct}" class="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-xs w-20 focus:ring-1 focus:ring-primary outline-none" min="0" max="100">
      </div>
      <div class="flex items-center gap-2">
        <label class="text-[10px] font-bold uppercase text-on-surface-variant">Indirect %</label>
        <input type="number" id="cfg-indirect" value="${b.indirect_pct}" class="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-xs w-20 focus:ring-1 focus:ring-primary outline-none" min="0" max="25" step="0.5">
      </div>`;

    // Auto-save config changes
    for (const [inputId, field] of [['cfg-name','name'],['cfg-max-grant','max_grant'],['cfg-cofin','cofin_pct'],['cfg-indirect','indirect_pct']]) {
      document.getElementById(inputId)?.addEventListener('change', async (e) => {
        const val = field === 'name' ? e.target.value : Number(e.target.value);
        try {
          await API.patch(`/budget/${current.budget.id}`, { [field]: val });
          current.budget[field] = val;
          if (field === 'name') document.getElementById('budget-title').textContent = val;
          if (activeTab === 'summary') renderTabContent();
        } catch (err) { Toast.show('Error: ' + err.message, 'err'); }
      });
    }
  }

  /* ── Tabs ──────────────────────────────────────────────────── */
  function renderTabs() {
    const el = document.getElementById('budget-tabs');
    if (!el || !current) return;

    const tabs = [{ id: 'setup', label: 'Configuración', icon: 'settings' }];
    for (const ben of current.beneficiaries) {
      tabs.push({ id: `ben-${ben.id}`, label: `BE ${String(ben.number).padStart(3,'0')} ${ben.acronym || ''}`.trim(), icon: 'business' });
    }
    tabs.push({ id: 'summary', label: 'Resumen', icon: 'summarize' });

    // Wrap in pill-style container matching Prep Studio
    el.className = 'flex items-center gap-1 mb-6 bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-1.5 overflow-x-auto';
    el.innerHTML = tabs.map(t => `
      <button class="budget-tab flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all
        ${activeTab === t.id ? 'bg-[#1b1464] text-[#fbff12] shadow-md' : 'text-on-surface-variant hover:bg-surface-container-low'}"
        data-tab="${t.id}">
        <span class="material-symbols-outlined text-sm">${t.icon}</span> ${esc(t.label)}
      </button>`).join('');

    el.querySelectorAll('.budget-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        renderTabs();
        renderTabContent();
      });
    });
  }

  /* ── Tab content router ────────────────────────────────────── */
  function renderTabContent() {
    if (activeTab === 'setup') renderSetup();
    else if (activeTab === 'summary') renderSummary();
    else if (activeTab.startsWith('ben-')) renderBeneficiaryCosts(activeTab.replace('ben-', ''));
  }

  /* ── Setup tab: beneficiaries + work packages ──────────────── */
  function renderSetup() {
    const el = document.getElementById('budget-tab-content');
    if (!el) return;

    const ins = current.instructions;
    const insHtml = ins ? `
      <!-- Instructions (EACEA page 1) -->
      <div class="rounded-2xl border border-amber-200/50 bg-amber-50/30 overflow-hidden mb-6">
        <div class="px-5 py-3 border-b border-amber-200/30 bg-amber-50/50">
          <h3 class="text-xs font-bold uppercase tracking-widest text-amber-700">Instructions — Datos del proyecto</h3>
        </div>
        <div class="p-5 space-y-4">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Call type</span>
              <p class="text-sm font-semibold text-on-surface mt-0.5 truncate" title="${esc(ins.call_type)}">${esc(ins.call_type || '—')}</p>
            </div>
            <div>
              <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Acronym</span>
              <p class="text-sm font-semibold text-primary mt-0.5">${esc(ins.acronym || '—')}</p>
            </div>
            <div>
              <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Max EU grant</span>
              <p class="text-sm font-semibold text-on-surface mt-0.5">${fmt(ins.max_grant)} EUR</p>
            </div>
            <div>
              <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Co-financing</span>
              <p class="text-sm font-semibold text-on-surface mt-0.5">${ins.cofin_pct}%</p>
            </div>
          </div>
          ${ins.worker_rates?.length ? `
          <div>
            <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Worker categories & daily rates</span>
            <div class="mt-2 overflow-x-auto">
              <table class="w-full text-xs">
                <thead><tr class="text-on-surface-variant border-b border-amber-200/40">
                  <th class="text-left py-1.5 font-bold">Partner</th>
                  ${[...new Set(ins.worker_rates.map(w => w.category))].map(c => `<th class="text-right py-1.5 font-bold">${esc(c)}</th>`).join('')}
                </tr></thead>
                <tbody>${(() => {
                  const cats = [...new Set(ins.worker_rates.map(w => w.category))];
                  const byPartner = {};
                  for (const w of ins.worker_rates) {
                    if (!byPartner[w.partner_name]) byPartner[w.partner_name] = {};
                    byPartner[w.partner_name][w.category] = w.rate;
                  }
                  return Object.entries(byPartner).map(([name, rates]) =>
                    `<tr class="border-b border-amber-200/20"><td class="py-1.5 font-medium">${esc(name)}</td>${cats.map(c => `<td class="text-right font-mono">${rates[c] ? fmt(rates[c]) : '—'}</td>`).join('')}</tr>`
                  ).join('');
                })()}</tbody>
              </table>
            </div>
          </div>` : ''}
        </div>
      </div>` : '';

    el.innerHTML = `
      ${insHtml}
      <div class="grid lg:grid-cols-2 gap-6">
        <!-- Beneficiaries -->
        <div class="rounded-2xl border border-outline-variant/30 bg-white overflow-hidden">
          <div class="px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-lowest">
            <h3 class="text-xs font-bold uppercase tracking-widest text-primary">Beneficiaries</h3>
            <button id="setup-add-ben" class="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
              <span class="material-symbols-outlined text-xs">add</span> Add
            </button>
          </div>
          <div id="setup-ben-list" class="p-4 space-y-2"></div>
        </div>

        <!-- Work Packages -->
        <div class="rounded-2xl border border-outline-variant/30 bg-white overflow-hidden">
          <div class="px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-lowest">
            <h3 class="text-xs font-bold uppercase tracking-widest text-primary">Work Packages</h3>
            <button id="setup-add-wp" class="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
              <span class="material-symbols-outlined text-xs">add</span> Add
            </button>
          </div>
          <div id="setup-wp-list" class="p-4 space-y-2"></div>
        </div>
      </div>`;

    // Render beneficiaries
    const benList = document.getElementById('setup-ben-list');
    if (!current.beneficiaries.length) {
      benList.innerHTML = '<p class="text-xs text-on-surface-variant text-center py-4">Añade los socios del proyecto</p>';
    } else {
      benList.innerHTML = current.beneficiaries.map(b => `
        <div class="flex items-center gap-2 p-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest group">
          <span class="text-[10px] font-mono font-bold text-primary/50 w-10 flex-shrink-0">BE ${String(b.number).padStart(3,'0')}</span>
          <input type="text" value="${esc(b.name)}" placeholder="Entidad" class="ben-field flex-1 min-w-0 px-2 py-1 text-xs border-none bg-transparent focus:bg-white focus:ring-1 focus:ring-primary/20 rounded" data-bid="${b.id}" data-f="name">
          <input type="text" value="${esc(b.acronym)}" placeholder="Acron." class="ben-field w-16 flex-shrink-0 px-2 py-1 text-xs border-none bg-transparent focus:bg-white focus:ring-1 focus:ring-primary/20 rounded" data-bid="${b.id}" data-f="acronym">
          <input type="text" value="${esc(b.country)}" placeholder="Pais" class="ben-field w-16 flex-shrink-0 px-2 py-1 text-xs border-none bg-transparent focus:bg-white focus:ring-1 focus:ring-primary/20 rounded" data-bid="${b.id}" data-f="country">
          <button type="button" class="ben-coord flex-shrink-0 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide transition-colors ${b.is_coordinator ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-transparent text-on-surface-variant/40 border border-outline-variant/20 hover:border-primary/30 hover:text-primary/60'}" data-bid="${b.id}" title="Toggle coordinador">
            C
          </button>
          <button class="ben-del flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-on-surface-variant/30 hover:text-error transition-colors opacity-0 group-hover:opacity-100" data-bid="${b.id}">
            <span class="material-symbols-outlined text-xs">close</span>
          </button>
        </div>`).join('');

      benList.querySelectorAll('.ben-field').forEach(inp => {
        inp.addEventListener('change', () => {
          debouncedUpdate('ben', inp.dataset.bid, { [inp.dataset.f]: inp.value });
        });
      });
      benList.querySelectorAll('.ben-coord').forEach(btn => {
        btn.addEventListener('click', () => {
          const isCoord = btn.classList.contains('bg-primary/15');
          const newVal = isCoord ? 0 : 1;
          debouncedUpdate('ben', btn.dataset.bid, { is_coordinator: newVal });
          // Toggle visual
          if (newVal) {
            btn.classList.add('bg-primary/15', 'text-primary', 'border-primary/30');
            btn.classList.remove('bg-transparent', 'text-on-surface-variant/40', 'border-outline-variant/20');
          } else {
            btn.classList.remove('bg-primary/15', 'text-primary', 'border-primary/30');
            btn.classList.add('bg-transparent', 'text-on-surface-variant/40', 'border-outline-variant/20');
          }
        });
      });
      benList.querySelectorAll('.ben-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este beneficiario y todos sus costes?')) return;
          await API.del(`/budget/${current.budget.id}/beneficiaries/${btn.dataset.bid}`);
          reload();
        });
      });
    }

    // Render work packages
    const wpList = document.getElementById('setup-wp-list');
    if (!current.workPackages.length) {
      wpList.innerHTML = '<p class="text-xs text-on-surface-variant text-center py-4">Añade los work packages del proyecto</p>';
    } else {
      wpList.innerHTML = current.workPackages.map((wp, wi) => {
        const wc = wpColor(wi);
        return `
        <div class="flex items-center gap-2 p-3 rounded-xl border ${wc.border} ${wc.bg} group">
          <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${wc.accent}"></span>
          <span class="text-[10px] font-mono font-bold w-14" style="color:${wc.accent}">WP ${String(wp.number).padStart(3,'0')}</span>
          <input type="text" value="${esc(wp.label)}" placeholder="Work Package name" class="wp-field flex-1 px-2 py-1 text-xs border-none bg-transparent focus:bg-white focus:ring-1 focus:ring-primary/20 rounded" data-wid="${wp.id}">
          <button class="wp-del w-6 h-6 flex items-center justify-center rounded text-on-surface-variant/30 hover:text-error transition-colors opacity-0 group-hover:opacity-100" data-wid="${wp.id}">
            <span class="material-symbols-outlined text-xs">close</span>
          </button>
        </div>`;
      }).join('');

      wpList.querySelectorAll('.wp-field').forEach(inp => {
        inp.addEventListener('change', () => {
          debouncedUpdate('wp', inp.dataset.wid, { label: inp.value });
        });
      });
      wpList.querySelectorAll('.wp-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este WP y todos sus costes?')) return;
          await API.del(`/budget/${current.budget.id}/work-packages/${btn.dataset.wid}`);
          reload();
        });
      });
    }

    // Add buttons
    document.getElementById('setup-add-ben')?.addEventListener('click', async () => {
      await API.post(`/budget/${current.budget.id}/beneficiaries`, { name: '', acronym: '', country: '' });
      reload();
    });
    document.getElementById('setup-add-wp')?.addEventListener('click', async () => {
      await API.post(`/budget/${current.budget.id}/work-packages`, { label: '' });
      reload();
    });
  }

  /* ── Beneficiary costs tab ─────────────────────────────────── */
  async function renderBeneficiaryCosts(benId) {
    const el = document.getElementById('budget-tab-content');
    if (!el) return;

    const ben = current.beneficiaries.find(b => b.id === benId);
    if (!ben) { el.innerHTML = '<p class="text-sm text-error">Beneficiario no encontrado</p>'; return; }

    if (!current.workPackages.length) {
      el.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">Primero añade Work Packages en la pestaña Configuración.</p>';
      return;
    }

    // Fetch costs for this beneficiary
    let costs;
    try {
      const res = await API.get(`/budget/${current.budget.id}/costs?beneficiary_id=${benId}`);
      costs = Array.isArray(res) ? res : (res.data || []);
    } catch (e) { costs = []; }

    // Group costs by WP
    const byWp = {};
    for (const c of costs) {
      if (!byWp[c.wp_id]) byWp[c.wp_id] = [];
      byWp[c.wp_id].push(c);
    }

    const indPct = Number(current.budget.indirect_pct ?? 7);

    let html = `<div class="text-xs font-bold text-primary mb-3">${esc(ben.name)} (${esc(ben.acronym)}) — ${esc(ben.country)}</div>`;

    // One section per WP
    for (let wi = 0; wi < current.workPackages.length; wi++) {
      const wp = current.workPackages[wi];
      const wc = wpColor(wi);
      const wpCosts = byWp[wp.id] || [];
      const wpDirect = wpCosts.reduce((s, c) => s + Number(c.total_cost || 0), 0);
      const wpIndirect = wpDirect * (indPct / 100);
      const wpTotal = wpDirect + wpIndirect;

      html += `<div class="mb-6 rounded-2xl border ${wc.border} overflow-hidden">
        <div class="${wc.header} border-b ${wc.border} flex items-center justify-between px-4 py-2.5">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" style="background:${wc.accent}"></span>
            <span class="text-xs font-bold" style="color:${wc.accent}">WP ${String(wp.number).padStart(3,'0')}: ${esc(wp.label)}</span>
          </div>
          <span class="text-xs font-bold" style="color:${wc.accent}">${fmt(wpTotal)} €</span>
        </div>
        <table class="w-full text-xs">
          <thead>
            <tr class="bg-surface-container-lowest">
              <th class="text-left px-3 py-2 font-bold text-on-surface-variant w-8"></th>
              <th class="text-left px-3 py-2 font-bold text-on-surface-variant">Item</th>
              <th class="text-right px-3 py-2 font-bold text-on-surface-variant w-24">Units</th>
              <th class="text-right px-3 py-2 font-bold text-on-surface-variant w-28">Cost/Unit (€)</th>
              <th class="text-right px-3 py-2 font-bold text-on-surface-variant w-28">Total (€)</th>
            </tr>
          </thead>
          <tbody>`;

      let currentCat = '';
      let currentSub = '';
      let catTotal = 0;

      for (const c of wpCosts) {
        // Category header
        if (c.category !== currentCat) {
          if (currentCat) {
            html += `<tr class="bg-primary/5"><td colspan="4" class="px-3 py-1 text-[10px] font-bold text-primary uppercase">Total ${CAT_LABELS[currentCat] || currentCat}</td><td class="text-right px-3 py-1 text-[10px] font-bold text-primary cat-total" data-cat="${currentCat}">${fmt(catTotal)}</td></tr>`;
          }
          currentCat = c.category;
          catTotal = 0;
          html += `<tr class="bg-amber-50/50"><td colspan="5" class="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">${CAT_LABELS[c.category] || c.category}</td></tr>`;
          currentSub = '';
        }

        // Subcategory header
        if (c.subcategory && c.subcategory !== currentSub) {
          currentSub = c.subcategory;
          html += `<tr><td></td><td colspan="4" class="px-3 py-1 text-[10px] font-bold text-on-surface-variant/70">${CAT_LABELS[c.subcategory] || c.subcategory}</td></tr>`;
        }

        catTotal += Number(c.total_cost || 0);

        html += `<tr class="border-b border-outline-variant/10 hover:bg-primary/5 transition-colors">
          <td class="px-3 py-1.5"></td>
          <td class="px-3 py-1.5 text-on-surface">${esc(c.line_item)}</td>
          <td class="px-1 py-1"><input type="number" class="cost-input w-full text-right px-2 py-1 rounded border border-outline-variant/20 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary/20 outline-none" value="${c.units || ''}" data-cid="${c.id}" data-f="units" min="0" step="1"></td>
          <td class="px-1 py-1"><input type="number" class="cost-input w-full text-right px-2 py-1 rounded border border-outline-variant/20 bg-transparent focus:bg-white focus:ring-1 focus:ring-primary/20 outline-none" value="${c.cost_per_unit || ''}" data-cid="${c.id}" data-f="cost_per_unit" min="0" step="0.01"></td>
          <td class="text-right px-3 py-1.5 font-mono font-bold cost-total" data-cid="${c.id}">${fmt(c.total_cost)}</td>
        </tr>`;
      }

      // Last category total
      if (currentCat) {
        html += `<tr class="bg-primary/5"><td colspan="4" class="px-3 py-1 text-[10px] font-bold text-primary uppercase">Total ${CAT_LABELS[currentCat] || currentCat}</td><td class="text-right px-3 py-1 text-[10px] font-bold text-primary">${fmt(catTotal)}</td></tr>`;
      }

      // Direct + indirect + total
      html += `
        <tr style="background:${wc.accent}10"><td colspan="4" class="px-3 py-2 text-xs font-bold" style="color:${wc.accent}">TOTAL DIRECT COSTS (A+B+C+D)</td><td class="text-right px-3 py-2 text-xs font-bold" style="color:${wc.accent}">${fmt(wpDirect)}</td></tr>
        <tr class="bg-surface-container-lowest"><td colspan="4" class="px-3 py-1.5 text-xs text-on-surface-variant">E. Indirect costs ${indPct}%</td><td class="text-right px-3 py-1.5 text-xs text-on-surface-variant">${fmt(wpIndirect)}</td></tr>
        <tr style="background:${wc.accent}20"><td colspan="4" class="px-3 py-2 text-xs font-extrabold" style="color:${wc.accent}">TOTAL COSTS (A+B+C+D+E)</td><td class="text-right px-3 py-2 text-xs font-extrabold" style="color:${wc.accent}">${fmt(wpTotal)}</td></tr>`;

      html += '</tbody></table></div>';
    }

    el.innerHTML = html;

    // Bind cost inputs
    el.querySelectorAll('.cost-input').forEach(inp => {
      inp.addEventListener('change', async () => {
        const cid = inp.dataset.cid;
        const field = inp.dataset.f;
        const val = Number(inp.value) || 0;

        // Find the other field in same row
        const row = inp.closest('tr');
        const units = Number(row.querySelector('[data-f="units"]').value) || 0;
        const cpu = Number(row.querySelector('[data-f="cost_per_unit"]').value) || 0;
        const total = units * cpu;

        // Update total cell
        const totalCell = row.querySelector('.cost-total');
        if (totalCell) totalCell.textContent = fmt(total);

        // Save to backend
        try {
          await API.patch(`/budget/costs/${cid}`, { units, cost_per_unit: cpu });
        } catch (e) { console.error('[Budget] save error:', e); }

        // Re-render to update all totals (debounced)
        if (saveTimers._rerender) clearTimeout(saveTimers._rerender);
        saveTimers._rerender = setTimeout(() => renderBeneficiaryCosts(benId), 500);
      });
    });
  }

  /* ── Summary tab ───────────────────────────────────────────── */
  function renderSummary() {
    const el = document.getElementById('budget-tab-content');
    if (!el || !current) return;

    const indPct = Number(current.budget.indirect_pct ?? 7);
    const maxGrant = Number(current.budget.max_grant || 0);
    const cofinPct = Number(current.budget.cofin_pct || 80);

    // Build cost map from current data
    const allCosts = [];
    for (const key of Object.keys(current.costMap || {})) {
      for (const c of current.costMap[key]) allCosts.push(c);
    }

    // Per-beneficiary totals
    const benTotals = {};
    for (const ben of current.beneficiaries) {
      const benCosts = allCosts.filter(c => c.beneficiary_id === ben.id);
      const direct = benCosts.reduce((s, c) => s + Number(c.total_cost || 0), 0);
      const indirect = direct * (indPct / 100);
      benTotals[ben.id] = { direct, indirect, total: direct + indirect };
    }

    const projectDirect = Object.values(benTotals).reduce((s, t) => s + t.direct, 0);
    const projectIndirect = Object.values(benTotals).reduce((s, t) => s + t.indirect, 0);
    const projectTotal = projectDirect + projectIndirect;
    const maxEU = Math.min(maxGrant, projectTotal * (cofinPct / 100));

    let html = `
      <div class="rounded-2xl border border-outline-variant/30 overflow-hidden mb-6">
        <div class="px-5 py-3 bg-primary/5 border-b border-outline-variant/20">
          <h3 class="text-xs font-bold uppercase tracking-widest text-primary">Proposal Budget — Resumen por Beneficiario</h3>
        </div>
        <table class="w-full text-xs">
          <thead>
            <tr class="bg-surface-container-lowest">
              <th class="text-left px-4 py-2 font-bold text-on-surface-variant">Beneficiario</th>
              <th class="text-right px-4 py-2 font-bold text-on-surface-variant">Direct Costs</th>
              <th class="text-right px-4 py-2 font-bold text-on-surface-variant">Indirect (${indPct}%)</th>
              <th class="text-right px-4 py-2 font-bold text-on-surface-variant">Total Costs</th>
              <th class="text-right px-4 py-2 font-bold text-on-surface-variant">% of Budget</th>
            </tr>
          </thead>
          <tbody>`;

    for (const ben of current.beneficiaries) {
      const t = benTotals[ben.id] || { direct: 0, indirect: 0, total: 0 };
      const pct = projectTotal > 0 ? ((t.total / projectTotal) * 100).toFixed(1) : '0.0';
      html += `<tr class="border-b border-outline-variant/10">
        <td class="px-4 py-2"><span class="font-mono text-primary/50 mr-2">BE ${String(ben.number).padStart(3,'0')}</span> <strong>${esc(ben.acronym || ben.name)}</strong> <span class="text-on-surface-variant">${esc(ben.country)}</span></td>
        <td class="text-right px-4 py-2 font-mono">${fmt(t.direct)}</td>
        <td class="text-right px-4 py-2 font-mono">${fmt(t.indirect)}</td>
        <td class="text-right px-4 py-2 font-mono font-bold">${fmt(t.total)}</td>
        <td class="text-right px-4 py-2">${pct}%</td>
      </tr>`;
    }

    html += `</tbody>
      <tfoot>
        <tr class="bg-primary/10 font-extrabold">
          <td class="px-4 py-2 text-primary">TOTAL PROJECT</td>
          <td class="text-right px-4 py-2 text-primary font-mono">${fmt(projectDirect)}</td>
          <td class="text-right px-4 py-2 text-primary font-mono">${fmt(projectIndirect)}</td>
          <td class="text-right px-4 py-2 text-primary font-mono">${fmt(projectTotal)}</td>
          <td class="text-right px-4 py-2 text-primary">100%</td>
        </tr>
      </tfoot>
    </table></div>`;

    // Grant summary
    const overBudget = projectTotal > maxGrant && maxGrant > 0;
    html += `
      <div class="grid grid-cols-3 gap-4">
        <div class="rounded-2xl border ${overBudget ? 'border-red-300 bg-red-50' : 'border-outline-variant/30 bg-white'} p-5 text-center">
          <div class="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Total Costs</div>
          <div class="text-xl font-extrabold ${overBudget ? 'text-red-600' : 'text-primary'}">${fmt(projectTotal)} €</div>
          ${overBudget ? '<div class="text-[10px] text-red-500 mt-1">Excede el grant máximo</div>' : ''}
        </div>
        <div class="rounded-2xl border border-outline-variant/30 bg-white p-5 text-center">
          <div class="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Max EU Contribution (${cofinPct}%)</div>
          <div class="text-xl font-extrabold text-green-600">${fmt(maxEU)} €</div>
        </div>
        <div class="rounded-2xl border border-outline-variant/30 bg-white p-5 text-center">
          <div class="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Max Grant Amount</div>
          <div class="text-xl font-extrabold text-primary">${fmt(maxGrant)} €</div>
        </div>
      </div>`;

    el.innerHTML = html;
  }

  /* ── Helpers ───────────────────────────────────────────────── */
  function debouncedUpdate(type, id, data) {
    const key = `${type}-${id}`;
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(async () => {
      try {
        if (type === 'ben') await API.patch(`/budget/${current.budget.id}/beneficiaries/${id}`, data);
        if (type === 'wp') await API.patch(`/budget/${current.budget.id}/work-packages/${id}`, data);
        // Update local state
        if (type === 'ben') {
          const b = current.beneficiaries.find(x => x.id === id);
          if (b) Object.assign(b, data);
        }
        if (type === 'wp') {
          const w = current.workPackages.find(x => x.id === id);
          if (w) Object.assign(w, data);
        }
        renderTabs();
      } catch (e) { console.error('[Budget] update error:', e); }
    }, 500);
  }

  /* ── Download EACEA Excel ──────────────────────────────────── */
  async function downloadBudgetXlsx(budgetId, budgetName) {
    const btn = document.getElementById('budget-download-xlsx-std') || document.getElementById('budget-download-xlsx');
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined text-base animate-spin">progress_activity</span> Generando...'; }
    try {
      const res = await fetch(`/v1/budget/${budgetId}/export-excel`, {
        headers: { 'Authorization': `Bearer ${API.getToken()}` },
        credentials: 'include',
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status}: ${txt.substring(0, 200)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safe = (budgetName || 'budget').replace(/[^a-z0-9_\-]+/gi, '_').substring(0, 40);
      a.download = `${safe}_EACEA.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[Budget] download error:', e);
      alert('Error descargando Excel: ' + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  }

  /* ── Embeddable: open budget editor inside any container ──── */
  async function openInContainer(budgetId, containerEl) {
    // Inject the editor HTML structure into the container
    containerEl.innerHTML = `
      <div class="flex items-center gap-3 mb-4">
        <span class="material-symbols-outlined text-xl text-[#1b1464]">receipt_long</span>
        <h2 id="budget-title" class="font-headline text-base font-extrabold text-on-surface truncate max-w-md"></h2>
      </div>
      <div id="budget-config" class="flex items-center gap-4 mb-4 p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/20 flex-wrap"></div>
      <div id="budget-tabs"></div>
      <div id="budget-tab-content" class="min-h-[40vh]"></div>`;

    try {
      const res = await API.get(`/budget/${budgetId}/full`);
      current = res.data || res;
      document.getElementById('budget-title').textContent = current.budget.name || 'Presupuesto';
      activeTab = 'setup';
      renderConfig();
      renderTabs();
      renderTabContent();
    } catch (e) {
      containerEl.innerHTML = `<div class="text-center py-8 text-error"><p>Error cargando presupuesto: ${esc(e.message)}</p></div>`;
    }
  }

  return { init, openInContainer };
})();
