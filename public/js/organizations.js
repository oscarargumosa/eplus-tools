/* ═══════════════════════════════════════════════════════════════
   Organizations — Mi Organización + Directorio
   ═══════════════════════════════════════════════════════════════ */

const Organizations = (() => {
  let myOrgInit = false;
  let dirInit   = false;
  let myOrg     = null;   // cached org data
  let myOrgs    = [];     // all user's orgs
  let activeTab = 'general';

  /* ── ORG TYPES ─────────────────────────────────────────────── */
  const ORG_TYPES = [
    'NGO','University','School/Institute','Research Centre','SME','Large Enterprise',
    'Public body','Foundation','Social enterprise','Other'
  ];

  /* ══════════════════════════════════════════════════════════════
     MI ORGANIZACIÓN
     ══════════════════════════════════════════════════════════════ */

  function initMyOrg() {
    if (!myOrgInit) {
      myOrgInit = true;
      bindMyOrgTabs();
      bindOrgSelector();
    }
    loadMyOrgs();
  }

  function bindOrgSelector() {
    const sel = document.getElementById('myorg-org-select');
    sel?.addEventListener('change', async () => {
      const id = sel.value;
      if (!id) return;
      try {
        myOrg = await API.get(`/organizations/${id}`);
        fillForm(myOrg);
        loadAllChildren();
        setTimeout(() => initOrgMap(), 100);
      } catch (e) { Toast.show(e.message || 'Error', 'error'); }
    });
    document.getElementById('myorg-btn-new-org')?.addEventListener('click', () => {
      openNewOrgModal();
    });
  }

  /* ── New org modal with ORS prefill search ────────────────── */
  function openNewOrgModal() {
    document.getElementById('org-new-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'org-new-modal';
    overlay.className = 'fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16 pb-8 overflow-y-auto';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div class="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 class="font-headline text-lg font-bold">Nueva organización</h2>
            <p class="text-white/70 text-xs">Busca en el registro Erasmus+ (ORS) para precargar datos.</p>
          </div>
          <button class="org-new-close text-white/70 hover:text-white" aria-label="Cerrar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="p-5 space-y-4">
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
            <input id="org-new-search" type="text" autocomplete="off"
              placeholder="Busca por nombre, acrónimo, ciudad, OID o PIC..."
              class="w-full pl-10 pr-3 py-3 text-sm border border-outline-variant/40 rounded-lg bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          <div id="org-new-results" class="max-h-[50vh] overflow-y-auto divide-y divide-outline-variant/20 border border-outline-variant/20 rounded-lg hidden"></div>
          <div id="org-new-hint" class="text-xs text-on-surface-variant">
            Escribe al menos 2 caracteres. Si tu entidad no sale, puedes crearla vacía y rellenar los datos a mano.
          </div>
        </div>
        <div class="px-5 py-4 border-t border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
          <button class="org-new-empty text-sm text-primary font-semibold hover:underline">
            <span class="material-symbols-outlined align-middle text-[18px]">add</span>
            No la encuentro — crear vacía
          </button>
          <button class="org-new-cancel text-sm text-on-surface-variant font-semibold hover:text-on-surface">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    const input = overlay.querySelector('#org-new-search');
    const resultsBox = overlay.querySelector('#org-new-results');
    const hint = overlay.querySelector('#org-new-hint');
    setTimeout(() => input.focus(), 60);

    const close = () => overlay.remove();
    overlay.querySelector('.org-new-close').addEventListener('click', close);
    overlay.querySelector('.org-new-cancel').addEventListener('click', close);
    overlay.querySelector('.org-new-empty').addEventListener('click', async () => {
      const name = prompt('Nombre de la nueva organización:');
      if (!name || !name.trim()) return;
      await createOrgFromData({ organization_name: name.trim() });
      close();
    });

    input.addEventListener('input', debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        resultsBox.classList.add('hidden');
        hint.textContent = 'Escribe al menos 2 caracteres. Si tu entidad no sale, puedes crearla vacía y rellenar los datos a mano.';
        return;
      }
      resultsBox.classList.remove('hidden');
      resultsBox.innerHTML = '<div class="py-6 text-center text-on-surface-variant text-sm">Buscando en ORS…</div>';
      hint.textContent = '';
      try {
        const rows = await API.post('/organizations/ors-lookup', { q });
        if (!rows || !rows.length) {
          resultsBox.innerHTML = '<div class="py-6 text-center text-on-surface-variant text-sm">Sin resultados. Prueba con otro término o crea la entidad vacía.</div>';
          return;
        }
        resultsBox.innerHTML = rows.map((r, i) => `
          <button class="org-new-pick w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors" data-idx="${i}">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm text-on-surface truncate">${esc(r.legal_name)}</div>
                <div class="text-xs text-on-surface-variant mt-0.5">
                  ${r.city ? esc(r.city) : ''}${r.city && r.country_iso ? ', ' : ''}${r.country_iso ? esc(r.country_iso) : ''}
                  ${r.website_show ? ` · ${esc(r.website_show)}` : ''}
                </div>
              </div>
              <div class="shrink-0 text-right text-[10px] font-mono leading-tight">
                ${r.oid ? `<div class="text-primary">${esc(r.oid)}</div>` : ''}
                ${r.pic ? `<div class="text-on-surface-variant">PIC ${esc(r.pic)}</div>` : ''}
                ${r.validity_label ? `<div class="${r.validity_label === 'certified' ? 'text-green-600' : 'text-amber-600'} uppercase mt-0.5">${esc(r.validity_label)}</div>` : ''}
              </div>
            </div>
          </button>
        `).join('');
        resultsBox.querySelectorAll('.org-new-pick').forEach(btn => {
          btn.addEventListener('click', async () => {
            const r = rows[parseInt(btn.dataset.idx, 10)];
            await createOrgFromData(mapOrsToOrg(r));
            close();
          });
        });
      } catch (e) {
        resultsBox.innerHTML = `<div class="py-6 text-center text-error text-sm">Error consultando ORS: ${esc(e.message || 'Error')}</div>`;
      }
    }, 350));
  }

  function mapOrsToOrg(r) {
    return {
      organization_name:   r.legal_name,
      legal_name_national: r.legal_name,
      oid:                 r.oid,
      pic:                 r.pic,
      country:             r.country_iso,
      city:                r.city,
      website:             r.website,
      national_id:         r.vat || r.registration_no || null,
    };
  }

  async function createOrgFromData(data) {
    try {
      await API.put('/organizations/mine', data);
      Toast.show('Organización creada', 'ok');
      loadMyOrgs();
    } catch (e) {
      Toast.show(e.message || 'Error', 'error');
    }
  }

  async function loadMyOrgs() {
    try {
      myOrgs = await API.get('/organizations/mine/all') || [];
      const sel = document.getElementById('myorg-org-select');
      if (!sel) return;
      if (!myOrgs.length) {
        sel.innerHTML = '<option value="">— Sin organizaciones —</option>';
        myOrg = null;
        return;
      }
      sel.innerHTML = myOrgs.map(o =>
        `<option value="${o.id}">${esc(o.acronym ? o.acronym + ' — ' : '')}${esc(o.organization_name)}</option>`
      ).join('');
      // Load first org (or previously selected)
      const targetId = myOrg?.id || myOrgs[0].id;
      sel.value = targetId;
      myOrg = await API.get(`/organizations/${targetId}`);
      fillForm(myOrg);
      loadAllChildren();
      setTimeout(() => initOrgMap(), 100);
    } catch (e) {
      console.error('loadMyOrgs', e);
      // Fallback to old single-org endpoint
      loadMyOrg();
    }
  }

  function bindMyOrgTabs() {
    document.querySelectorAll('#myorg-tab-nav [data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('#myorg-tab-nav [data-tab]').forEach(b => {
          b.classList.remove('border-b-2','border-secondary-fixed','text-primary','font-bold');
          b.classList.add('text-on-surface-variant');
        });
        btn.classList.add('border-b-2','border-secondary-fixed','text-primary','font-bold');
        btn.classList.remove('text-on-surface-variant');
        document.querySelectorAll('.myorg-tab').forEach(s => s.classList.add('hidden'));
        document.getElementById(`myorg-tab-${activeTab}`)?.classList.remove('hidden');
        // Leaflet necesita recalcular tamaño cuando vuelve a ser visible
        if (activeTab === 'general' && _orgMap) {
          setTimeout(() => _orgMap.invalidateSize(), 50);
        }
      });
    });

    // Logo upload
    document.getElementById('myorg-logo-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { Toast.show('El archivo es demasiado grande (máx. 2 MB)', 'error'); return; }
      const form = new FormData();
      form.append('logo', file);
      try {
        const res = await fetch('/v1/organizations/mine/logo', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + API.getToken() },
          body: form
        });
        const json = await res.json();
        if (!json.ok) throw json.error;
        showLogoPreview(json.data.logo_url);
        Toast.show('Logo actualizado', 'ok');
      } catch (err) { Toast.show(err.message || 'Error subiendo logo', 'error'); }
    });

    // Save buttons
    document.querySelectorAll('[data-org-save]').forEach(btn => {
      btn.addEventListener('click', () => saveSection(btn.dataset.orgSave));
    });

    // Add child buttons
    document.querySelectorAll('[data-org-add]').forEach(btn => {
      btn.addEventListener('click', () => addChild(btn.dataset.orgAdd));
    });

    // Pin de ubicación
    document.getElementById('myorg-self-locate')?.addEventListener('click', selfLocate);
    document.getElementById('myorg-save-pin')?.addEventListener('click', savePin);
  }

  async function loadMyOrg() {
    try {
      myOrg = await API.get('/organizations/mine');
      if (myOrg) {
        fillForm(myOrg);
        loadAllChildren();
        // Lazy-init map cuando el panel está visible (evita render con tamaño 0)
        setTimeout(() => initOrgMap(), 100);
      }
    } catch (e) {
      console.error('loadMyOrg', e);
    }
  }

  function fillForm(org) {
    if (!org) return;
    const fields = document.querySelectorAll('#panel-my-org [data-field]');
    fields.forEach(el => {
      const key = el.dataset.field;
      const val = org[key];
      if (el.type === 'checkbox') {
        el.checked = !!val;
      } else if (el.tagName === 'SELECT') {
        el.value = val || '';
      } else {
        el.value = val != null ? val : '';
      }
    });
    showLogoPreview(org.logo_url);
  }

  function showLogoPreview(url) {
    const container = document.getElementById('myorg-logo-preview');
    const placeholder = document.getElementById('myorg-logo-placeholder');
    if (!container) return;
    if (url) {
      const img = container.querySelector('img') || document.createElement('img');
      img.src = url + '?t=' + Date.now();
      img.alt = 'Logo';
      img.className = 'w-full h-full object-contain';
      if (!container.querySelector('img')) container.appendChild(img);
      if (placeholder) placeholder.style.display = 'none';
    } else {
      const img = container.querySelector('img');
      if (img) img.remove();
      if (placeholder) placeholder.style.display = '';
    }
  }

  function collectSection(sectionId) {
    const data = {};
    document.querySelectorAll(`#${sectionId} [data-field]`).forEach(el => {
      const key = el.dataset.field;
      if (el.type === 'checkbox') data[key] = el.checked ? 1 : 0;
      else data[key] = el.value || null;
    });
    return data;
  }

  async function saveSection(sectionId) {
    try {
      const data = collectSection(sectionId);
      const result = await API.put('/organizations/mine', data);
      if (!myOrg) myOrg = {};
      Object.assign(myOrg, data);
      if (result.id) myOrg.id = result.id;
      Toast.show('Guardado correctamente', 'ok');
    } catch (e) {
      Toast.show(e.message || 'Error al guardar', 'error');
    }
  }

  /* ── Child tables (dynamic lists) ──────────────────────────── */

  async function loadAllChildren() {
    if (!myOrg?.id) return;
    loadChildTable('accreditations');
    loadChildTable('key-staff');
    loadChildTable('stakeholders');
    loadAllProjects(); // unifica manuales + directorio
  }

  /* ── Proyectos europeos (tabla unificada) ─────────────────────────
     Una sola tabla que mezcla:
       1. Directorio Erasmus+ (kind=auto, read-only) — los 164 oficiales.
       2. Extras manuales (kind=manual, editables/borrables) — proyectos que
          el directorio no tiene (no-Erasmus+, pre-OID, otros financiadores).
     De-dup por project_identifier ↔ project_id_or_contract: si un manual
     tiene el mismo ID que uno del directorio, gana el del directorio.
     Orden: año DESC, tie-break directorio antes que manual del mismo año. */

  let _allProjects = [];

  async function loadAllProjects() {
    const tbody = document.getElementById('org-projects-unified-tbody');
    const badge = document.getElementById('org-projects-unified-count');
    if (!tbody || !myOrg?.id) return;

    // 1) Manuales (BD local)
    let manuals = [];
    try {
      manuals = await API.get(`/organizations/${myOrg.id}/eu-projects`) || [];
    } catch (e) { console.error('loadAllProjects:manuals', e); }
    // Alimentar tabla legacy oculta para que openEditForm/deleteChild encuentren los <tr> reales
    renderChildTable('eu-projects', manuals);

    // 2) Directorio Erasmus+ (si hay OID)
    let auto = [];
    let autoError = null;
    if (myOrg.oid) {
      try {
        const res = await API.get(`/entities/${encodeURIComponent(myOrg.oid)}/projects?limit=500`);
        const data = (res && res.data) || res || {};
        auto = data.projects || [];
      } catch (e) {
        autoError = e.message || 'error desconocido';
        console.warn('loadAllProjects:auto', autoError);
      }
    }

    // 3) De-dup: descartar manuales que ya estén en el directorio
    const autoIds = new Set(auto.map(p => p.project_identifier).filter(Boolean));
    const manualsKept = manuals.filter(m => {
      const mid = m.project_id_or_contract;
      return !mid || !autoIds.has(mid);
    });

    // 4) Unificar adaptando ambas formas
    const unified = [
      ...auto.map(p => ({
        kind: 'auto',
        programme: p.programme || (String(p.project_identifier || '').match(/-(KA\d+|HORIZON|CERV|LIFE|CEF|DIGITAL|CREA|EDF|ESC)-/i)?.[1]) || null,
        year: p.funding_year || (p.start_date ? new Date(p.start_date).getFullYear() : null),
        contract_id: p.project_identifier,
        role: p.role,
        title: p.project_title,
        raw: p,
      })),
      ...manualsKept.map(m => ({
        kind: 'manual',
        manual_id: m.id,
        programme: m.programme,
        year: parseInt(m.year, 10) || null,
        contract_id: m.project_id_or_contract,
        role: m.role,
        title: m.title,
        raw: m,
      })),
    ];
    unified.sort((a, b) => {
      const ya = a.year || 0, yb = b.year || 0;
      if (ya !== yb) return yb - ya;
      return a.kind === b.kind ? 0 : (a.kind === 'auto' ? -1 : 1);
    });

    _allProjects = unified;

    if (badge) badge.textContent = String(unified.length);

    // Banner de error si el directorio falló — para que el bug sea visible
    // (sin él, "auto=[]" silencioso parece que la entidad no tiene proyectos UE).
    let errorBanner = '';
    if (autoError && myOrg.oid) {
      const hint = /404|not found/i.test(autoError)
        ? 'El servidor todavía no tiene el endpoint /v1/entities/:oid/projects. Reinicia node server.js para que cargue las rutas nuevas.'
        : `Detalle: ${autoError}`;
      errorBanner = `<tr><td colspan="6" class="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-900">
        <span class="material-symbols-outlined text-[16px] align-middle mr-1">warning</span>
        No se pudo cargar el directorio Erasmus+ para OID ${esc(myOrg.oid)}. ${esc(hint)}
      </td></tr>`;
    }

    if (!unified.length) {
      const hint = myOrg.oid
        ? 'No hay proyectos. Pulsa "+ Añadir extra" para registrar uno manualmente.'
        : 'Todavía no hemos resuelto el OID de tu organización en el directorio Erasmus+. Guarda los datos generales para que el sistema lo resuelva automáticamente, o pulsa "+ Añadir extra" para registrar proyectos a mano.';
      tbody.innerHTML = `${errorBanner}<tr><td colspan="6" class="py-4 text-center text-on-surface-variant text-sm italic">${esc(hint)}</td></tr>`;
      return;
    }

    tbody.innerHTML = errorBanner + unified.map((p, i) => renderUnifiedProjectRow(p, i)).join('');
    bindUnifiedProjectActions(tbody);
  }

  function renderUnifiedProjectRow(p, idx) {
    const role    = p.role || '';
    const roleClr = role === 'coordinator' ? 'bg-secondary-fixed text-primary'
                  : role === 'partner'     ? 'bg-purple-100 text-purple-800'
                  :                          'bg-gray-100 text-gray-700';
    const isManual = p.kind === 'manual';
    const title    = p.title || '(sin título)';

    const actions = isManual
      ? `<button data-action="view"   data-idx="${idx}" class="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-primary/10 transition-colors" title="Ver"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
         <button data-action="edit"   data-idx="${idx}" class="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-primary/10 transition-colors" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
         <button data-action="delete" data-idx="${idx}" class="text-on-surface-variant hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button>`
      : `<button data-action="view"   data-idx="${idx}" class="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:bg-primary/10 px-2 py-1 rounded transition-colors"><span class="material-symbols-outlined text-[16px]">visibility</span> Ver</button>`;

    return `
      <tr class="border-t border-outline-variant/20 hover:bg-surface-container-low/30">
        <td class="px-3 py-2.5 text-sm text-on-surface">${esc(p.programme || '—')}</td>
        <td class="px-3 py-2.5 text-sm font-bold text-primary">${esc(p.year || '')}</td>
        <td class="px-3 py-2.5 text-xs font-mono text-on-surface-variant">${esc(p.contract_id || '')}</td>
        <td class="px-3 py-2.5 text-sm">
          ${role ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${roleClr}">${esc(role)}</span>` : '<span class="text-on-surface-variant/40 italic">—</span>'}
        </td>
        <td class="px-3 py-2.5 text-sm text-on-surface" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <span title="${esc(title)}">${esc(title)}</span>
          ${isManual ? `<span class="ml-2 inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-on-surface-variant">Manual</span>` : ''}
        </td>
        <td class="px-3 py-2 text-right whitespace-nowrap">${actions}</td>
      </tr>`;
  }

  function bindUnifiedProjectActions(tbody) {
    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const p = _allProjects[idx];
        if (!p) return;
        const action = btn.dataset.action;
        if (action === 'view') return openProjectDetail(p);
        if (p.kind !== 'manual') return; // edit/delete solo para manuales
        if (action === 'edit') {
          // Reusar openEditForm legacy: opera sobre los <tr> de la tabla oculta
          // y al guardar dispara loadChildTable('eu-projects') → loadAllProjects().
          const legacyTr = document.querySelector(`#org-eu-projects-tbody tr[data-child-id="${p.manual_id}"]`);
          if (!legacyTr) return Toast.show('No se pudo abrir el editor', 'error');
          openEditForm('eu-projects', p.manual_id, p.raw, legacyTr);
          // Hacer visible la tabla legacy temporalmente para que se vea el form
          legacyTr.parentElement.classList.remove('hidden');
          legacyTr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (action === 'delete') {
          deleteChild('eu-projects', p.manual_id);
        }
      });
    });
  }

  function fmtMoney(n) {
    if (n == null) return null;
    const v = Number(n);
    if (!isFinite(v) || v <= 0) return null;
    return v.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function renderProjectDetailHtml(p) {
    if (p.kind === 'auto') {
      const r = p.raw;
      const grant = fmtMoney(r.eu_grant_eur);
      const role  = r.role || '';
      const roleClr = role === 'coordinator' ? 'bg-secondary-fixed text-primary'
                    : role === 'partner'     ? 'bg-purple-100 text-purple-800'
                    :                          'bg-gray-100 text-gray-700';
      const cellRow = (label, value) => (value == null || value === '') ? '' :
        `<div class="flex flex-col gap-0.5"><span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">${esc(label)}</span><span class="text-sm text-on-surface">${esc(value)}</span></div>`;
      return `
        <div class="space-y-5">
          <div>
            <div class="flex items-center gap-2 flex-wrap mb-2">
              ${role ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${roleClr}">${esc(role)}</span>` : ''}
              ${r.is_good_practice ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">★ Good practice</span>` : ''}
              ${r.programme ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">${esc(r.programme)}</span>` : ''}
            </div>
            <h2 class="text-xl font-bold text-on-surface leading-tight pr-12">${esc(r.project_title || '')}</h2>
            ${r.project_identifier ? `<div class="text-[12px] font-mono text-on-surface-variant mt-1">${esc(r.project_identifier)}</div>` : ''}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-container-low rounded-xl">
            ${cellRow('Acción', r.action_type)}
            ${cellRow('Año', r.funding_year)}
            ${cellRow('Inicio', fmtDate(r.start_date))}
            ${cellRow('Fin', fmtDate(r.end_date))}
            ${cellRow('Subvención UE', grant)}
            ${cellRow('Coordinador', [r.coordinator_name, r.coordinator_country].filter(Boolean).join(' · '))}
          </div>
          ${r.project_summary ? `<div>
            <div class="flex items-baseline justify-between mb-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Resumen</span>
              <span class="text-[10px] text-on-surface-variant/60 italic">extracto · ${(r.project_summary || '').length} car.</span>
            </div>
            <p class="text-sm text-on-surface whitespace-pre-line">${esc(r.project_summary)}</p>
          </div>` : ''}
          ${r.project_identifier ? `<div class="pt-3 border-t border-outline-variant/20">
            <a href="https://erasmus-plus.ec.europa.eu/projects/search/details/${encodeURIComponent(r.project_identifier)}"
               target="_blank" rel="noopener"
               class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1b1464] text-[#fbff12] text-sm font-bold hover:bg-[#1b1464]/80 transition-colors">
              <span>Ver detalle completo en Erasmus+ Project Results Platform</span>
              <span class="material-symbols-outlined" style="font-size:18px;line-height:1;">open_in_new</span>
            </a>
          </div>` : ''}
        </div>`;
    }
    // manual
    const r = p.raw;
    const cellRow = (label, value) => (value == null || value === '') ? '' :
      `<div class="flex flex-col gap-0.5"><span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">${esc(label)}</span><span class="text-sm text-on-surface">${esc(value)}</span></div>`;
    return `
      <div class="space-y-5">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-on-surface-variant">Manual</span>
            ${r.role ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-700">${esc(r.role)}</span>` : ''}
          </div>
          <h2 class="text-xl font-bold text-on-surface leading-tight pr-12">${esc(r.title || '(sin título)')}</h2>
          ${r.project_id_or_contract ? `<div class="text-[12px] font-mono text-on-surface-variant mt-1">${esc(r.project_id_or_contract)}</div>` : ''}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-container-low rounded-xl">
          ${cellRow('Programa', r.programme)}
          ${cellRow('Año', r.year)}
        </div>
      </div>`;
  }

  function openProjectDetail(p) {
    const overlay = document.getElementById('org-project-drawer-overlay');
    const content = document.getElementById('org-project-drawer-content');
    if (!overlay || !content) return;

    content.innerHTML = renderProjectDetailHtml(p);
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (!document._orgProjectDrawerCloseBound) {
      document._orgProjectDrawerCloseBound = true;
      overlay.addEventListener('click', (e) => {
        if (!e.target.closest('#org-project-drawer-panel')) closeProjectDetail();
      });
      document.getElementById('org-project-drawer-close')
        ?.addEventListener('click', closeProjectDetail);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeProjectDetail();
      });
      window.addEventListener('hashchange', () => {
        if (!overlay.classList.contains('hidden')) closeProjectDetail();
      });
    }
  }

  function closeProjectDetail() {
    const overlay = document.getElementById('org-project-drawer-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ── Pin de ubicación (Leaflet) ───────────────────────────── */

  let _orgMap = null;
  let _orgMarker = null;
  let _orgCoords = { lat: null, lng: null, source: null };

  function initOrgMap() {
    if (typeof L === 'undefined') {
      // Leaflet aún no cargado; reintentar
      return setTimeout(initOrgMap, 200);
    }
    const el = document.getElementById('myorg-map');
    if (!el) return;

    // Si ya existe, solo actualizar (otra org seleccionada)
    if (_orgMap) {
      _orgMap.remove();
      _orgMap = null;
      _orgMarker = null;
    }

    // Coords iniciales: org guardadas → centroide país → Europa
    const lat0 = myOrg?.lat != null ? Number(myOrg.lat) : null;
    const lng0 = myOrg?.lng != null ? Number(myOrg.lng) : null;
    const center = lat0 != null && lng0 != null
      ? [lat0, lng0]
      : [47, 12]; // Europa central
    const zoom = lat0 != null ? 13 : 4;

    _orgMap = L.map(el).setView(center, zoom);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap · © CARTO',
    }).addTo(_orgMap);

    if (lat0 != null && lng0 != null) {
      _orgMarker = L.marker([lat0, lng0], { draggable: true }).addTo(_orgMap);
      _orgCoords = { lat: lat0, lng: lng0, source: myOrg.geocoded_source || 'manual_pin' };
      updateCoordsLabel();
      _orgMarker.on('dragend', onMarkerMove);
    } else {
      // Click en el mapa para colocar el primer pin
      _orgMap.on('click', (ev) => placeMarker(ev.latlng.lat, ev.latlng.lng, 'manual_pin'));
    }
  }

  function placeMarker(lat, lng, source) {
    if (!_orgMap) return;
    if (_orgMarker) {
      _orgMarker.setLatLng([lat, lng]);
    } else {
      _orgMarker = L.marker([lat, lng], { draggable: true }).addTo(_orgMap);
      _orgMarker.on('dragend', onMarkerMove);
    }
    _orgCoords = { lat, lng, source: source || 'manual_pin' };
    _orgMap.setView([lat, lng], Math.max(_orgMap.getZoom(), 13));
    updateCoordsLabel();
  }

  function onMarkerMove(ev) {
    const ll = ev.target.getLatLng();
    _orgCoords = { lat: ll.lat, lng: ll.lng, source: 'manual_pin' };
    updateCoordsLabel();
  }

  function updateCoordsLabel() {
    const lbl = document.getElementById('myorg-coords-label');
    const src = document.getElementById('myorg-coords-source');
    if (lbl) lbl.textContent = _orgCoords.lat != null
      ? `${_orgCoords.lat.toFixed(5)}, ${_orgCoords.lng.toFixed(5)}`
      : 'Sin pin — click en el mapa o usa "Mi ubicación"';
    if (src) {
      const labels = {
        manual_pin: '📍 Pin manual',
        self_geolocate: '🛰️ Tu ubicación (GPS)',
        mapbox: 'Mapbox geocoding',
        google: 'Google geocoding',
        nominatim: 'OSM Nominatim',
      };
      src.textContent = _orgCoords.source ? (labels[_orgCoords.source] || _orgCoords.source) : '';
    }
  }

  function selfLocate() {
    if (!('geolocation' in navigator)) {
      Toast.show('Tu navegador no soporta geolocalización', 'error');
      return;
    }
    Toast.show('Obteniendo tu ubicación…', 'ok');
    navigator.geolocation.getCurrentPosition(
      (pos) => placeMarker(pos.coords.latitude, pos.coords.longitude, 'self_geolocate'),
      (err) => Toast.show(err.message || 'No se pudo obtener tu ubicación', 'error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function savePin() {
    if (!myOrg?.id) {
      Toast.show('Guarda primero los datos generales para crear la organización', 'error');
      return;
    }
    if (_orgCoords.lat == null) {
      Toast.show('Coloca un pin en el mapa primero', 'error');
      return;
    }
    try {
      await API.patch(`/organizations/${myOrg.id}/coords`, {
        lat: _orgCoords.lat,
        lng: _orgCoords.lng,
        source: _orgCoords.source,
      });
      myOrg.lat = _orgCoords.lat;
      myOrg.lng = _orgCoords.lng;
      myOrg.geocoded_source = _orgCoords.source;
      Toast.show('Ubicación guardada', 'ok');
    } catch (e) {
      Toast.show(e.message || 'Error al guardar', 'error');
    }
  }

  async function loadChildTable(type) {
    if (!myOrg?.id) return;
    // 'eu-projects' tiene su propio cargador unificado (manuales + directorio)
    if (type === 'eu-projects') return loadAllProjects();
    try {
      const rows = await API.get(`/organizations/${myOrg.id}/${type}`);
      renderChildTable(type, rows);
    } catch (e) {
      console.error(`loadChild ${type}`, e);
    }
  }

  const CHILD_CONFIGS = {
    accreditations: [
      { f:'accreditation_type', label:'Tipo', ph:'Erasmus Charter, ECHE...' },
      { f:'accreditation_reference', label:'Referencia', ph:'Código de referencia' },
    ],
    'eu-projects': [
      { f:'programme', label:'Programa', ph:'Erasmus+, Horizon...' },
      { f:'year', label:'Año', ph:'2024', type:'number' },
      { f:'project_id_or_contract', label:'ID Contrato', ph:'2024-1-ES01-KA220...' },
      { f:'role', label:'Rol', ph:'Applicant, Partner...' },
      { f:'title', label:'Título', ph:'Título del proyecto' },
    ],
    'key-staff': [
      { f:'name', label:'Nombre', ph:'Nombre completo' },
      { f:'role', label:'Cargo', ph:'Director, Coordinador...' },
      { f:'skills_summary', label:'Competencias', ph:'Experiencia y habilidades relevantes' },
    ],
    stakeholders: [
      { f:'entity_name', label:'Entidad', ph:'Nombre de la entidad' },
      { f:'entity_type', label:'Tipo entidad', ph:'ONG, Universidad, Empresa...', select:['','NGO','University','School/Institute','Research Centre','SME','Large Enterprise','Public body','Foundation','Social enterprise','Other'] },
      { f:'relationship_type', label:'Relación', ph:'Partner, Funder, Beneficiary...' },
      { f:'contact_person', label:'Persona de contacto', ph:'Nombre completo' },
      { f:'email', label:'Email', ph:'email@ejemplo.com' },
      { f:'description', label:'Descripción', ph:'Descripción de la relación' },
    ],
  };

  function renderChildTable(type, rows) {
    const tbody = document.getElementById(`org-${type}-tbody`);
    if (!tbody) return;
    const fields = CHILD_CONFIGS[type] || [];

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${fields.length + 1}" class="py-4 text-center text-on-surface-variant text-sm">Sin registros. Pulsa + para añadir.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => `
      <tr class="border-t border-outline-variant/20 hover:bg-surface-container-low/30" data-child-id="${row.id}" data-child-type="${type}">
        ${fields.map(col => `<td class="px-3 py-2.5 text-sm text-on-surface">${esc(row[col.f]) || '<span class="text-on-surface-variant/40 italic">—</span>'}</td>`).join('')}
        <td class="px-3 py-2 text-right whitespace-nowrap">
          <button class="child-edit-btn text-on-surface-variant hover:text-primary p-1 rounded hover:bg-primary/10 transition-colors" title="Editar">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button class="child-del-btn text-on-surface-variant hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors" title="Eliminar">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </td>
      </tr>
    `).join('');

    // Bind edit & delete
    tbody.querySelectorAll('tr[data-child-id]').forEach(tr => {
      const childId = tr.dataset.childId;
      const childType = tr.dataset.childType;
      const row = rows.find(r => r.id === childId);

      tr.querySelector('.child-edit-btn').addEventListener('click', () => {
        openEditForm(childType, childId, row, tr);
      });
      tr.querySelector('.child-del-btn').addEventListener('click', () => {
        deleteChild(childType, childId);
      });
    });
  }

  function fieldHtml(col, val, attrName) {
    const cls = 'w-full px-3 py-2 text-sm border border-outline-variant/40 rounded-lg bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors';
    if (col.select) {
      return `<select ${attrName}="${col.f}" class="${cls}">
        ${col.select.map(opt => `<option value="${opt}" ${opt === (val || '') ? 'selected' : ''}>${opt || '— Seleccionar —'}</option>`).join('')}
      </select>`;
    }
    return `<input type="${col.type || 'text'}" value="${esc(val)}" placeholder="${col.ph}" ${attrName}="${col.f}" class="${cls}" />`;
  }

  function openEditForm(type, childId, row, afterTr) {
    document.querySelectorAll('.child-edit-row').forEach(r => r.remove());

    const fields = CHILD_CONFIGS[type] || [];
    const formTr = document.createElement('tr');
    formTr.className = 'child-edit-row bg-primary/5 border-t border-b border-primary/20';
    formTr.innerHTML = `
      <td colspan="${fields.length + 1}" class="px-3 py-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          ${fields.map(col => `
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">${col.label}</label>
              ${fieldHtml(col, row[col.f], 'data-edit-field')}
            </div>
          `).join('')}
        </div>
        <div class="flex justify-end gap-2">
          <button class="edit-cancel px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors">Cancelar</button>
          <button class="edit-save px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-colors">Guardar</button>
        </div>
      </td>
    `;

    afterTr.after(formTr);
    formTr.querySelector('input')?.focus();

    formTr.querySelector('.edit-cancel').addEventListener('click', () => formTr.remove());
    formTr.querySelector('.edit-save').addEventListener('click', async () => {
      const data = {};
      formTr.querySelectorAll('[data-edit-field]').forEach(inp => {
        data[inp.dataset.editField] = inp.value || null;
      });
      try {
        await API.patch(`/organizations/${myOrg.id}/${type}/${childId}`, data);
        Toast.show('Actualizado', 'ok');
        formTr.remove();
        loadChildTable(type);
      } catch (e) {
        Toast.show(e.message || 'Error al guardar', 'error');
      }
    });
  }

  async function addChild(type) {
    if (!myOrg?.id) {
      Toast.show('Primero guarda los datos generales de tu organización', 'error');
      return;
    }
    // Show an add form at the bottom of the table
    const fields = CHILD_CONFIGS[type] || [];
    const tbody = document.getElementById(`org-${type}-tbody`);
    if (!tbody) return;

    // Remove existing add form
    tbody.querySelectorAll('.child-add-row').forEach(r => r.remove());
    document.querySelectorAll('.child-edit-row').forEach(r => r.remove());

    const defaults = {
      accreditations:  { accreditation_type: '', accreditation_reference: '' },
      'eu-projects':   { programme: 'Erasmus+', year: new Date().getFullYear(), project_id_or_contract: '', role: 'applicant', title: '' },
      'key-staff':     { name: '', role: '', skills_summary: '' },
      stakeholders:    { entity_name: '', entity_type: '', relationship_type: '', contact_person: '', email: '', description: '' },
    };
    const def = defaults[type] || {};

    const formTr = document.createElement('tr');
    formTr.className = 'child-add-row bg-green-50/50 border-t-2 border-primary/20';
    formTr.innerHTML = `
      <td colspan="${fields.length + 1}" class="px-3 py-4">
        <div class="text-[11px] font-bold uppercase tracking-widest text-primary mb-3">Nuevo registro</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          ${fields.map(col => `
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">${col.label}</label>
              ${fieldHtml(col, def[col.f], 'data-add-field')}
            </div>
          `).join('')}
        </div>
        <div class="flex justify-end gap-2">
          <button class="add-cancel px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors">Cancelar</button>
          <button class="add-save px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-colors">Añadir</button>
        </div>
      </td>
    `;

    tbody.appendChild(formTr);
    formTr.querySelector('input')?.focus();

    formTr.querySelector('.add-cancel').addEventListener('click', () => formTr.remove());
    formTr.querySelector('.add-save').addEventListener('click', async () => {
      const data = {};
      formTr.querySelectorAll('[data-add-field]').forEach(inp => {
        data[inp.dataset.addField] = inp.value || null;
      });
      try {
        await API.post(`/organizations/${myOrg.id}/${type}`, data);
        Toast.show('Añadido', 'ok');
        formTr.remove();
        loadChildTable(type);
      } catch (e) {
        Toast.show(e.message || 'Error', 'error');
      }
    });
  }

  async function deleteChild(type, id) {
    if (!myOrg?.id) return;
    const ok = await Modal.show('¿Eliminar este registro?');
    if (!ok) return;
    try {
      await API.del(`/organizations/${myOrg.id}/${type}/${id}`);
      loadChildTable(type);
    } catch (e) {
      Toast.show(e.message || 'Error', 'error');
    }
  }

  /* ── Inline edit for child rows ────────────────────────────── */
  async function editChildInline(type, id, field, newVal) {
    if (!myOrg?.id) return;
    try {
      await API.patch(`/organizations/${myOrg.id}/${type}/${id}`, { [field]: newVal });
    } catch (e) {
      Toast.show(e.message || 'Error', 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     DIRECTORIO DE ORGANIZACIONES
     ══════════════════════════════════════════════════════════════ */

  let dirPage = 1;

  function initDirectory() {
    if (!dirInit) {
      dirInit = true;
      document.getElementById('org-dir-search')?.addEventListener('input', debounce(loadDirectory, 400));
      document.getElementById('org-dir-country')?.addEventListener('change', () => { dirPage = 1; loadDirectory(); });
      document.getElementById('org-dir-type')?.addEventListener('change', () => { dirPage = 1; loadDirectory(); });
    }
    loadDirectory();
  }

  async function loadDirectory() {
    const q       = document.getElementById('org-dir-search')?.value || '';
    const country = document.getElementById('org-dir-country')?.value || '';
    const org_type = document.getElementById('org-dir-type')?.value || '';
    const grid    = document.getElementById('org-dir-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="col-span-full py-8 text-center text-on-surface-variant text-sm">Cargando...</div>';
    try {
      const res = await API.get(`/organizations?q=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}&org_type=${encodeURIComponent(org_type)}&page=${dirPage}&limit=20`);
      const rows = res.rows || res;
      const meta = res.meta;

      if (!rows.length) {
        grid.innerHTML = '<div class="col-span-full py-12 text-center text-on-surface-variant">No se encontraron organizaciones</div>';
        return;
      }

      grid.innerHTML = rows.map(o => `
        <div class="bg-white rounded-xl border border-outline-variant/30 p-5 hover:shadow-md transition-shadow cursor-pointer"
             data-view-org="${o.id}">
          <div class="flex items-start gap-3 mb-2">
            ${o.logo_url
              ? `<img src="${esc(o.logo_url)}" alt="" class="w-10 h-10 rounded-lg object-contain border border-outline-variant/20 shrink-0 bg-white">`
              : `<div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-lg text-primary">apartment</span></div>`
            }
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-primary text-sm leading-tight">${esc(o.organization_name)}</h3>
              ${o.acronym ? `<span class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">${esc(o.acronym)}</span>` : ''}
            </div>
          </div>
          <div class="space-y-1 text-xs text-on-surface-variant">
            ${o.org_type ? `<div class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">category</span>${esc(o.org_type)}</div>` : ''}
            ${o.country || o.city ? `<div class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">location_on</span>${esc([o.city,o.country].filter(Boolean).join(', '))}</div>` : ''}
            ${o.pic ? `<div class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">fingerprint</span>PIC: ${esc(o.pic)}</div>` : ''}
            ${o.eu_projects_count > 0 ? `<div class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">workspace_premium</span>${o.eu_projects_count} proyecto${o.eu_projects_count > 1 ? 's' : ''} EU</div>` : ''}
          </div>
          <div class="flex flex-wrap gap-1.5 mt-3">
            ${o.is_non_profit ? '<span class="text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Non-profit</span>' : ''}
            ${o.is_public_body ? '<span class="text-[10px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Public body</span>' : ''}
            ${o.expertise_areas ? o.expertise_areas.split(',').slice(0,3).map(a => `<span class="text-[10px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">${esc(a.trim())}</span>`).join('') : ''}
          </div>
        </div>
      `).join('');

      // Bind view org clicks
      grid.querySelectorAll('[data-view-org]').forEach(card => {
        card.addEventListener('click', () => viewOrg(card.dataset.viewOrg));
      });

      // Pagination
      if (meta && meta.pages > 1) {
        const pagDiv = document.createElement('div');
        pagDiv.className = 'col-span-full flex items-center justify-center gap-4 pt-4';
        pagDiv.innerHTML = `
          <button class="dir-prev text-sm text-primary font-semibold ${dirPage <= 1 ? 'opacity-30 pointer-events-none' : ''}">&larr; Anterior</button>
          <span class="text-sm text-on-surface-variant">Página ${meta.page} de ${meta.pages}</span>
          <button class="dir-next text-sm text-primary font-semibold ${dirPage >= meta.pages ? 'opacity-30 pointer-events-none' : ''}">Siguiente &rarr;</button>
        `;
        grid.appendChild(pagDiv);
        pagDiv.querySelector('.dir-prev')?.addEventListener('click', () => dirPrev());
        pagDiv.querySelector('.dir-next')?.addEventListener('click', () => dirNext(meta.pages));
      }
    } catch (e) {
      grid.innerHTML = `<div class="col-span-full py-8 text-center text-error text-sm">${e.message || 'Error'}</div>`;
    }
  }

  function dirPrev() { if (dirPage > 1) { dirPage--; loadDirectory(); } }
  function dirNext(max) { if (dirPage < max) { dirPage++; loadDirectory(); } }

  /* ── View org detail modal ─────────────────────────────────── */
  async function viewOrg(id) {
    try {
      const org = await API.get(`/organizations/${id}`);
      showOrgDetailModal(org);
    } catch (e) {
      Toast.show(e.message || 'Error', 'error');
    }
  }

  function showOrgDetailModal(org) {
    let existing = document.getElementById('org-detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'org-detail-modal';
    modal.className = 'fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden">
        <div class="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 class="font-headline text-lg font-bold">${esc(org.organization_name)}</h2>
            ${org.acronym ? `<span class="text-white/70 text-sm">${esc(org.acronym)}</span>` : ''}
          </div>
          <button class="org-modal-close text-white/70 hover:text-white">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          ${detailSection('Datos generales', `
            ${detailRow('Tipo', org.org_type)}
            ${detailRow('OID (Erasmus+)', org.oid)}
            ${detailRow('PIC', org.pic)}
            ${detailRow('NIF / ID Nacional', org.national_id)}
            ${detailRow('Fecha fundación', org.foundation_date?.slice(0,10))}
            ${detailRow('País', org.country)}
            ${detailRow('Ciudad', org.city)}
            ${detailRow('Dirección', org.address)}
            ${detailRow('Código postal', org.post_code)}
            ${detailRow('Web', org.website ? `<a href="${esc(org.website)}" target="_blank" class="text-primary underline">${esc(org.website)}</a>` : null)}
            ${detailRow('Email', org.email)}
            ${detailRow('Teléfono', org.telephone1)}
            ${detailRow('Non-profit', org.is_non_profit ? 'Sí' : 'No')}
            ${detailRow('Public body', org.is_public_body ? 'Sí' : 'No')}
          `)}
          ${org.description ? detailSection('Descripción', `<p class="text-sm text-on-surface-variant whitespace-pre-line">${esc(org.description)}</p>`) : ''}
          ${org.activities_experience ? detailSection('Actividades y experiencia', `<p class="text-sm text-on-surface-variant whitespace-pre-line">${esc(org.activities_experience)}</p>`) : ''}
          ${(org.staff_size || org.annual_projects || org.expertise_areas || org.erasmus_roles) ? detailSection('Capacidad operativa', `
            ${detailRow('Tamaño staff', org.staff_size)}
            ${detailRow('Proyectos UE/año', org.annual_projects)}
            ${detailRow('Instalaciones formación', org.has_training_facilities ? 'Sí' : 'No')}
            ${detailRow('Infraestructura digital', org.has_digital_infrastructure ? 'Sí' : 'No')}
            ${detailRow('Áreas expertise', org.expertise_areas)}
            ${detailRow('Roles Erasmus', org.erasmus_roles)}
          `) : ''}
          ${org.eu_projects?.length ? detailSection('Proyectos UE', `
            <table class="w-full text-sm">
              <thead><tr class="text-xs text-on-surface-variant uppercase">
                <th class="text-left pb-1">Programa</th><th class="text-left pb-1">Año</th><th class="text-left pb-1">ID Contrato</th><th class="text-left pb-1">Rol</th><th class="text-left pb-1">Título</th>
              </tr></thead>
              <tbody>${org.eu_projects.map(p => `<tr class="border-t border-outline-variant/20">
                <td class="py-1">${esc(p.programme)}</td><td>${esc(p.year)}</td><td>${esc(p.project_id_or_contract)}</td><td>${esc(p.role)}</td><td>${esc(p.title)}</td>
              </tr>`).join('')}</tbody>
            </table>
          `) : ''}
          ${org.key_staff?.length ? detailSection('Personal clave', org.key_staff.map(s => `
            <div class="mb-2"><span class="font-semibold text-sm">${esc(s.name)}</span>${s.role ? ` <span class="text-xs text-on-surface-variant">(${esc(s.role)})</span>` : ''}<p class="text-xs text-on-surface-variant">${esc(s.skills_summary)}</p></div>
          `).join('')) : ''}
          ${org.stakeholders?.length ? detailSection('Stakeholders', org.stakeholders.map(s => `
            <div class="mb-2"><span class="font-semibold text-sm">${esc(s.entity_name)}</span> <span class="text-xs text-on-surface-variant">(${esc(s.relationship_type)})</span><p class="text-xs text-on-surface-variant">${esc(s.description)}</p></div>
          `).join('')) : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.org-modal-close')?.addEventListener('click', () => modal.remove());
  }

  function detailSection(title, content) {
    return `<div><h3 class="text-sm font-bold text-primary mb-2">${title}</h3><div>${content}</div></div>`;
  }
  function detailRow(label, val) {
    if (!val) return '';
    return `<div class="flex gap-2 text-sm py-0.5"><span class="text-on-surface-variant w-40 shrink-0">${label}</span><span class="font-medium">${val}</span></div>`;
  }

  /* ── Utils ──────────────────────────────────────────────────── */
  function esc(v) { if (v == null) return ''; const d = document.createElement('div'); d.textContent = String(v); return d.innerHTML; }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  /* ── Public API ─────────────────────────────────────────────── */
  return {
    initMyOrg, initDirectory, saveSection, addChild, deleteChild,
    editChildInline, viewOrg, dirPrev, dirNext, loadChildTable
  };
})();
