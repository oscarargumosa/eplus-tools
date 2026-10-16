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
        rememberOrg(id);
        renderSwitcher();
        fillForm(myOrg);
        resetItineraryCounts(myOrg);
        loadAllChildren();
        loadClaimDocs();
        setTimeout(() => initOrgMap(), 100);
      } catch (e) { Toast.show(e.message || 'Error', 'error'); }
    });
    document.getElementById('myorg-btn-new-org')?.addEventListener('click', () => {
      openClaimModal();
    });
  }

  /* ── Crear entidad desde el registro ORS (si no está en nuestra BD) ── */
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
                ${r.validity_label ? `<div class="${r.validity_label === 'certified' ? 'text-primary font-bold' : 'text-on-surface-variant'} uppercase mt-0.5">${esc(r.validity_label)}</div>` : ''}
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
      const res = await API.put('/organizations/mine', { ...data, new_org: true });
      Toast.show('Entidad creada', 'ok');
      if (res && res.id) { myOrg = { id: res.id }; rememberOrg(res.id); }
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
        sel.innerHTML = '<option value="">— Sin entidad —</option>';
        myOrg = null;
        renderSwitcher();
        showClaimEmptyState();
        return;
      }
      showEditorState();
      sel.innerHTML = myOrgs.map(o =>
        `<option value="${o.id}">${esc(o.acronym ? o.acronym + ' — ' : '')}${esc(o.organization_name)}</option>`
      ).join('');
      // La elegida antes (en memoria o en este navegador) si sigue siendo suya; si no, la primera.
      const has = (id) => id && myOrgs.some(o => o.id === id);
      const targetId = has(myOrg?.id) ? myOrg.id : has(rememberedOrg()) ? rememberedOrg() : myOrgs[0].id;
      sel.value = targetId;
      myOrg = await API.get(`/organizations/${targetId}`);
      renderSwitcher();
      fillForm(myOrg);
      resetItineraryCounts(myOrg);
      loadAllChildren();
      loadClaimDocs();
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
        const qs = myOrg?.id ? `?org_id=${encodeURIComponent(myOrg.id)}` : '';
        const res = await fetch('/v1/organizations/mine/logo' + qs, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + API.getToken() },
          body: form
        });
        const json = await res.json();
        if (!json.ok) throw json.error;
        showLogoPreview(json.data.logo_url);
        if (myOrg) myOrg.logo_url = json.data.logo_url;
        renderItinerary();
        if (typeof App !== 'undefined' && App.refreshAvatar) App.refreshAvatar();
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
      const result = await API.put('/organizations/mine', myOrg?.id ? { ...data, org_id: myOrg.id } : data);
      if (!myOrg) myOrg = {};
      Object.assign(myOrg, data);
      if (result.id) myOrg.id = result.id;
      Toast.show('Guardado correctamente', 'ok');
      renderItinerary();
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
        // El directorio limita a 200 por llamada; paginamos para orgs con
        // muchos proyectos (algunas superan 300).
        const PAGE = 200;
        let offset = 0;
        while (offset < 4000) {
          const res = await API.get(`/entities/${encodeURIComponent(myOrg.oid)}/projects?limit=${PAGE}&offset=${offset}`);
          const data = (res && res.data) || res || {};
          const batch = data.projects || [];
          auto.push(...batch);
          if (batch.length < PAGE) break;
          offset += batch.length;
        }
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
    _counts['eu-projects'] = unified.length;
    renderItinerary();

    if (badge) badge.textContent = String(unified.length);

    // Banner de error si el directorio falló — para que el bug sea visible
    // (sin él, "auto=[]" silencioso parece que la entidad no tiene proyectos UE).
    let errorBanner = '';
    if (autoError && myOrg.oid) {
      const hint = /404|not found/i.test(autoError)
        ? 'El servidor todavía no tiene el endpoint /v1/entities/:oid/projects. Reinicia node server.js para que cargue las rutas nuevas.'
        : `Detalle: ${autoError}`;
      errorBanner = `<tr><td colspan="7" class="px-4 py-3 bg-[#f3f8d2] border-b border-[#d6e949] text-sm text-ink">
        <span class="material-symbols-outlined text-[16px] align-middle mr-1">warning</span>
        No se pudo cargar el directorio Erasmus+ para OID ${esc(myOrg.oid)}. ${esc(hint)}
      </td></tr>`;
    }

    if (!unified.length) {
      const hint = myOrg.oid
        ? 'No hay proyectos. Pulsa "+ Añadir extra" para registrar uno manualmente.'
        : 'Todavía no hemos resuelto el OID de tu organización en el directorio Erasmus+. Guarda los datos generales para que el sistema lo resuelva automáticamente, o pulsa "+ Añadir extra" para registrar proyectos a mano.';
      tbody.innerHTML = `${errorBanner}<tr><td colspan="7" class="py-4 text-center text-on-surface-variant text-sm italic">${esc(hint)}</td></tr>`;
      renderProjectsStats([]);
      return;
    }

    tbody.innerHTML = errorBanner + unified.map((p, i) => renderUnifiedProjectRow(p, i)).join('');
    bindUnifiedProjectActions(tbody);
    renderProjectsStats(unified);
  }

  function renderUnifiedProjectRow(p, idx) {
    const role    = p.role || '';
    const roleClr = role === 'coordinator' ? 'bg-secondary-fixed text-primary'
                  : role === 'partner'     ? 'bg-lavender-soft text-violet'
                  :                          'bg-surface-container text-on-surface-variant';
    const isManual = p.kind === 'manual';
    const title    = p.title || '(sin título)';
    const grant    = isManual ? null : fmtMoney(p.raw && p.raw.eu_grant_eur);

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
        <td class="px-3 py-2.5 text-sm text-right font-semibold whitespace-nowrap ${grant ? 'text-on-surface' : 'text-on-surface-variant/40'}">${grant || '—'}</td>
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

  /* ── Estadística por tipo de proyecto ─────────────────────────
     Clasifica cada proyecto en una familia (KA1/KA2/KA3/CB/Deporte…)
     a partir del código de acción del contrato (KA153, KA220…) y,
     como fallback, del action_type textual del directorio. */
  const FAMILY_META = {
    KA1:   { label: 'KA1 · Movilidad',     color: '#d6e949', on: '#3c45a3', icon: 'flight_takeoff' },
    KA2:   { label: 'KA2 · Cooperación',   color: '#997fc7', on: '#ffffff', icon: 'handshake' },
    KA3:   { label: 'KA3 · Apoyo político',color: '#e7e1f3', on: '#3c45a3', icon: 'policy' },
    CB:    { label: 'Capacity Building',   color: '#222351', on: '#ffffff', icon: 'public' },
    Sport: { label: 'Deporte',             color: '#ffffff', on: '#3c45a3', icon: 'sports_soccer' },
    ESC:   { label: 'Cuerpo Solidaridad',  color: '#514daa', on: '#ffffff', icon: 'volunteer_activism' },
    JM:    { label: 'Jean Monnet',         color: '#8a8aa3', on: '#ffffff', icon: 'school' },
    Otros: { label: 'Otros',               color: '#d6d3dc', on: '#222351', icon: 'category' },
  };
  const FAMILY_ORDER = ['KA1', 'KA2', 'KA3', 'CB', 'Sport', 'ESC', 'JM', 'Otros'];

  function projectFamily(p) {
    const id = String(p.contract_id || '');
    const at = String((p.raw && p.raw.action_type) || '');
    const m = id.match(/KA(\d)\d{2}/i) || at.match(/KA(\d)\d{2}/i);
    if (m) return 'KA' + m[1];
    if (/capacity building/i.test(at))             return 'CB';
    if (/sport/i.test(at))                          return 'Sport';
    if (/jean monnet/i.test(at))                    return 'JM';
    if (/youth together|policy|peer learning/i.test(at)) return 'KA3';
    if (/solidarity|^ESC/i.test(at) || /^ESC/i.test(id)) return 'ESC';
    return 'Otros';
  }

  function renderProjectsStats(unified) {
    const host = document.getElementById('org-projects-stats');
    if (!host) return;
    if (!unified || !unified.length) { host.innerHTML = ''; return; }

    const fams = {};
    let totalAmount = 0;
    let coordAmount = 0, coordCount = 0;
    for (const p of unified) {
      const fam = projectFamily(p);
      const amt = p.kind === 'manual' ? 0 : (Number(p.raw && p.raw.eu_grant_eur) || 0);
      if (!fams[fam]) fams[fam] = { count: 0, amount: 0 };
      fams[fam].count += 1;
      fams[fam].amount += amt;
      totalAmount += amt;
      if (String(p.role || '').toLowerCase() === 'coordinator') {
        coordAmount += amt;
        coordCount += 1;
      }
    }
    const totalCount = unified.length;
    // El resto (partner + cualquier otro rol) se agrupa como "socio" para
    // que coordinador + socio sumen siempre el total movilizado.
    const partnerAmount = totalAmount - coordAmount;
    const partnerCount  = totalCount - coordCount;
    const present = FAMILY_ORDER.filter(k => fams[k]);

    // Barra apilada por nº de proyectos
    const segments = present.map(k => {
      const pct = (fams[k].count / totalCount) * 100;
      const meta = FAMILY_META[k];
      return `<div title="${esc(meta.label)}: ${fams[k].count}" style="width:${pct}%;background:${meta.color}"></div>`;
    }).join('');

    // Tarjetas por familia
    const maxCount = Math.max(...present.map(k => fams[k].count));
    const cards = present.map(k => {
      const meta = FAMILY_META[k];
      const f = fams[k];
      const money = fmtMoney(f.amount);
      const barPct = maxCount ? (f.count / maxCount) * 100 : 0;
      return `
        <div class="bg-white rounded-xl border border-outline-variant/30 p-3 flex flex-col">
          <div class="flex items-center gap-1.5 mb-1.5">
            <span class="material-symbols-outlined text-[16px] rounded-full p-1 leading-none" style="background:${meta.color};color:${meta.on};box-shadow:inset 0 0 0 1px rgba(34,35,81,.12)">${meta.icon}</span>
            <span class="text-[11px] font-bold text-on-surface leading-tight">${esc(meta.label)}</span>
          </div>
          <div class="flex items-baseline gap-1">
            <span class="text-3xl font-light text-primary leading-none">${f.count}</span>
            <span class="text-[11px] font-semibold text-on-surface-variant">proyecto${f.count === 1 ? '' : 's'}</span>
          </div>
          <div class="text-[12px] font-semibold ${money ? 'text-on-surface-variant' : 'text-on-surface-variant/40'}">${money || '—'}</div>
          <div class="mt-2 h-1.5 rounded-full bg-surface-container overflow-hidden">
            <div class="h-full rounded-full" style="width:${barPct}%;background:${meta.color};box-shadow:inset 0 0 0 1px rgba(34,35,81,.18)"></div>
          </div>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div class="rounded-2xl p-5 text-white" style="background:linear-gradient(135deg,#514daa,#3c45a3 55%,#222351)">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-lavender-soft">Experiencia Erasmus+</div>
            <div class="text-4xl font-light leading-none mt-1">${totalCount} <span class="text-base font-semibold text-white/70">proyectos</span></div>
          </div>
          <div class="text-right">
            <div class="text-[11px] font-bold uppercase tracking-wider text-lavender-soft">Financiación total movilizada</div>
            <div class="text-4xl font-light leading-none mt-1" style="color:#d6e949">${fmtMoney(totalAmount) || '0 €'}</div>
          </div>
        </div>
        <div class="mt-4 flex h-2.5 rounded-full overflow-hidden bg-white/15">${segments}</div>
        <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="rounded-xl bg-white/10 px-3.5 py-2.5">
            <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-lavender-soft">
              <span class="material-symbols-outlined text-[15px]" style="color:#d6e949">military_tech</span> Fondos gestionados como coordinador
            </div>
            <div class="text-xl font-light leading-tight mt-1">${fmtMoney(coordAmount) || '0 €'}</div>
            <div class="text-[11px] text-lavender-soft">${coordCount} proyecto${coordCount === 1 ? '' : 's'} liderado${coordCount === 1 ? '' : 's'}</div>
          </div>
          <div class="rounded-xl bg-white/10 px-3.5 py-2.5">
            <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-lavender-soft">
              <span class="material-symbols-outlined text-[15px] text-white/80">handshake</span> Fondos como socio en consorcios
            </div>
            <div class="text-xl font-light leading-tight mt-1">${fmtMoney(partnerAmount) || '0 €'}</div>
            <div class="text-[11px] text-lavender-soft">${partnerCount} proyecto${partnerCount === 1 ? '' : 's'} como socio</div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">${cards}</div>`;
  }

  function renderProjectDetailHtml(p) {
    if (p.kind === 'auto') {
      const r = p.raw;
      const grant = fmtMoney(r.eu_grant_eur);
      const role  = r.role || '';
      const roleClr = role === 'coordinator' ? 'bg-secondary-fixed text-primary'
                    : role === 'partner'     ? 'bg-lavender-soft text-violet'
                    :                          'bg-surface-container text-on-surface-variant';
      const cellRow = (label, value) => (value == null || value === '') ? '' :
        `<div class="flex flex-col gap-0.5"><span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">${esc(label)}</span><span class="text-sm text-on-surface">${esc(value)}</span></div>`;
      return `
        <div class="space-y-5">
          <div>
            <div class="flex items-center gap-2 flex-wrap mb-2">
              ${role ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${roleClr}">${esc(role)}</span>` : ''}
              ${r.is_good_practice ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#f3f8d2] text-ink border border-[#d6e949]">★ Good practice</span>` : ''}
              ${r.programme ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-lavender-soft text-primary border border-lavender/40">${esc(r.programme)}</span>` : ''}
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
               class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#3c45a3] text-[#d6e949] text-sm font-bold hover:bg-[#514daa] transition-colors">
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
            ${r.role ? `<span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">${esc(r.role)}</span>` : ''}
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
      _orgMarker = L.marker([lat0, lng0], { draggable: true, icon: brandPin() }).addTo(_orgMap);
      _orgCoords = { lat: lat0, lng: lng0, source: myOrg.geocoded_source || 'manual_pin' };
      updateCoordsLabel();
      _orgMarker.on('dragend', onMarkerMove);
    } else {
      // Click en el mapa para colocar el primer pin
      _orgMap.on('click', (ev) => placeMarker(ev.latlng.lat, ev.latlng.lng, 'manual_pin'));
    }
  }

  // Chincheta con la paleta de marca (azul con centro lima) en lugar del azul por defecto de Leaflet
  function brandPin() {
    return L.divIcon({
      className: '',
      iconSize: [30, 40],
      iconAnchor: [15, 39],
      html: '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 39 15 39s14-13.7 14-24.1C29 7.2 22.7 1 15 1z" fill="#3c45a3" stroke="#222351" stroke-width="1.5"/>'
        + '<circle cx="15" cy="15" r="5.5" fill="#d6e949"/></svg>',
    });
  }

  function placeMarker(lat, lng, source) {
    if (!_orgMap) return;
    if (_orgMarker) {
      _orgMarker.setLatLng([lat, lng]);
    } else {
      _orgMarker = L.marker([lat, lng], { draggable: true, icon: brandPin() }).addTo(_orgMap);
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
      _counts[type] = (rows || []).length;
      renderItinerary();
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
          <button class="edit-cancel px-4 py-2 text-sm font-semibold text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors rounded-full">Cancelar</button>
          <button class="edit-save px-5 py-2 rounded-full text-sm font-semibold text-white bg-primary hover:bg-violet transition-colors">Guardar</button>
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
    formTr.className = 'child-add-row bg-lavender-soft/50 border-t-2 border-primary/20';
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
          <button class="add-cancel px-4 py-2 text-sm font-semibold text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors rounded-full">Cancelar</button>
          <button class="add-save px-5 py-2 rounded-full text-sm font-semibold text-white bg-primary hover:bg-violet transition-colors">Añadir</button>
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
            ${o.is_non_profit ? '<span class="text-[10px] font-semibold uppercase tracking-wider bg-secondary-fixed text-primary px-2 py-0.5 rounded-full">Non-profit</span>' : ''}
            ${o.is_public_body ? '<span class="text-[10px] font-semibold uppercase tracking-wider bg-lavender-soft text-primary px-2 py-0.5 rounded-full">Public body</span>' : ''}
            ${o.expertise_areas ? o.expertise_areas.split(',').slice(0,3).map(a => `<span class="text-[10px] font-medium bg-cream text-ink px-2 py-0.5 rounded-full">${esc(a.trim())}</span>`).join('') : ''}
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
            ${detailRow('Web', safeHref(org.website) ? `<a href="${safeHref(org.website)}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${esc(org.website)}</a>` : esc(org.website), true)}
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
  // val se escapa salvo que venga ya como HTML seguro (isHtml).
  function detailRow(label, val, isHtml) {
    if (!val) return '';
    return `<div class="flex gap-2 text-sm py-0.5"><span class="text-on-surface-variant w-40 shrink-0">${label}</span><span class="font-medium">${isHtml ? val : esc(val)}</span></div>`;
  }

  /* ── Utils ──────────────────────────────────────────────────── */
  function esc(v) { if (v == null) return ''; const d = document.createElement('div'); d.textContent = String(v); return d.innerHTML; }
  // Enlaces externos: solo http/https (o los esquemas de `allow`, p. ej. mailto:).
  // Cualquier otro (javascript:, data:…) → '' (sin enlace). Devuelve el valor
  // ya escapado para meterlo en un atributo href="…".
  function safeHref(url, allow) {
    if (url == null) return '';
    let u = String(url).trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u)) u = (u.startsWith('//') ? 'https:' : 'https://') + u;
    let proto;
    try { proto = new URL(u).protocol; } catch (e) { return ''; }
    if (!(allow || ['http:', 'https:']).includes(proto)) return '';
    return u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  /* ── Public API ─────────────────────────────────────────────── */

  /* ══════════════════════════════════════════════════════════════
     RECLAMAR ENTIDAD + ITINERARIO
     Decisión 8-oct-2026: sin verificación previa, un solo dueño por
     entidad; documentación legal recomendada → sello «Verificada».
     ══════════════════════════════════════════════════════════════ */

  let _counts = {};      // filas de las tablas hijas (key-staff, eu-projects…)
  let _claimDocs = [];   // documentación legal aportada
  let _verification = null; // { status: null|pending|verified|rejected, verified, note }

  const DOC_TYPES = [
    ['estatutos',         'Estatutos'],
    ['escrituras',        'Escrituras'],
    ['acta_constitucion', 'Acta de constitución'],
    ['poderes',           'Acreditación de poderes'],
    ['otro',              'Otro documento'],
  ];

  function showClaimEmptyState() {
    document.getElementById('myorg-editor')?.classList.add('hidden');
    document.getElementById('myorg-itinerary')?.classList.add('hidden');
    document.getElementById('myorg-org-select')?.classList.add('hidden');
    document.getElementById('myorg-btn-new-org')?.classList.add('hidden');
    const host = document.getElementById('myorg-claim-empty');
    if (!host) return;
    host.classList.remove('hidden');
    host.innerHTML = `
      <div class="bg-white rounded-2xl border border-outline-variant/30 p-6 sm:p-8 max-w-3xl">
        <div class="flex items-start gap-4 mb-5">
          <div class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[26px]">apartment</span>
          </div>
          <div>
            <h2 class="font-headline text-xl font-extrabold text-primary">Busca tu entidad y hazla tuya</h2>
            <p class="text-sm text-on-surface-variant mt-1">Ya tenemos en nuestra base de datos las entidades que han participado en proyectos europeos. Encuentra la tuya, reclámala y te diremos qué le falta paso a paso. Cuanto más completa esté tu ficha, más fácil es que otra entidad te elija como socia.</p>
          </div>
        </div>
        <div id="myorg-claim-search-host"></div>
      </div>`;
    renderClaimSearch(document.getElementById('myorg-claim-search-host'), { onDone: () => {} });
  }

  function showEditorState() {
    document.getElementById('myorg-claim-empty')?.classList.add('hidden');
    document.getElementById('myorg-editor')?.classList.remove('hidden');
    document.getElementById('myorg-itinerary')?.classList.remove('hidden');
    document.getElementById('myorg-org-select')?.classList.remove('hidden');
    document.getElementById('myorg-btn-new-org')?.classList.remove('hidden');
  }

  /* Buscador reutilizable (estado vacío y modal «Otra entidad»). */
  function renderClaimSearch(host, { onDone }) {
    if (!host) return;
    host.innerHTML = `
      <div class="relative">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
        <input type="text" autocomplete="off" data-claim-input
          placeholder="Nombre, acrónimo, ciudad, OID o PIC de tu entidad…"
          class="w-full pl-10 pr-3 py-3 text-sm border border-outline-variant/40 rounded-lg bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
      </div>
      <div data-claim-results class="mt-3 max-h-[50vh] overflow-y-auto divide-y divide-outline-variant/20 border border-outline-variant/20 rounded-lg hidden"></div>
      <div class="mt-4 text-xs text-on-surface-variant">
        ¿No aparece tu entidad?
        <button type="button" data-claim-fallback class="text-primary font-semibold hover:underline">Créala desde el registro oficial de la UE o desde cero</button>.
      </div>`;
    const input = host.querySelector('[data-claim-input]');
    const box = host.querySelector('[data-claim-results]');
    setTimeout(() => input.focus(), 60);
    host.querySelector('[data-claim-fallback]').addEventListener('click', () => { onDone(); openNewOrgModal(); });

    let rows = [];
    let seq = 0;
    input.addEventListener('input', debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { box.classList.add('hidden'); return; }
      const my = ++seq;
      box.classList.remove('hidden');
      box.innerHTML = '<div class="py-6 text-center text-on-surface-variant text-sm">Buscando…</div>';
      try {
        rows = await API.get(`/organizations/claim/search?q=${encodeURIComponent(q)}`) || [];
        if (my !== seq) return;
        if (!rows.length) {
          box.innerHTML = '<div class="py-6 text-center text-on-surface-variant text-sm">Sin resultados. Prueba con el nombre legal, el OID o el PIC.</div>';
          return;
        }
        box.innerHTML = rows.map((r, i) => {
          let action;
          if (r.claimed_by_me) {
            action = `<span class="text-xs font-semibold text-primary inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">check_circle</span>Ya es tuya</span>`;
          } else if (r.claimed) {
            action = `<div class="text-right">
                <div class="text-xs font-semibold text-on-surface-variant">Ya tiene responsable</div>
                <button type="button" data-dispute="${i}" class="text-[11px] text-primary font-semibold hover:underline">¿Es tu entidad? Pide una revisión</button>
              </div>`;
          } else {
            action = `<button type="button" data-claim="${i}" class="shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors">Es mi entidad</button>`;
          }
          return `
            <div class="flex items-center gap-3 px-4 py-3">
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm text-on-surface truncate">${esc(r.name)}${r.verified ? ' <span class="material-symbols-outlined text-[15px] text-primary align-[-3px]" style="font-variation-settings:\'FILL\' 1" title="Verificada">verified</span>' : ''}</div>
                <div class="text-xs text-on-surface-variant mt-0.5 truncate">
                  ${[r.city, r.country_code].filter(Boolean).map(esc).join(', ')}
                  ${r.oid && !String(r.oid).startsWith('local-') ? ` · <span class="font-mono">${esc(r.oid)}</span>` : ''}
                  ${r.pic ? ` · PIC <span class="font-mono">${esc(r.pic)}</span>` : ''}
                </div>
              </div>
              ${action}
            </div>`;
        }).join('');
        box.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => claim(rows[+b.dataset.claim])));
        box.querySelectorAll('[data-dispute]').forEach(b => b.addEventListener('click', () => dispute(rows[+b.dataset.dispute])));
      } catch (e) {
        if (my !== seq) return;
        box.innerHTML = `<div class="py-6 text-center text-error text-sm">No se pudo buscar: ${esc(e.message || 'error')}</div>`;
      }
    }, 300));

    async function claim(r) {
      const ok = await Modal.confirm(
        `Vas a ser la persona responsable de «${r.name}» en EU Funding Studio. Cada entidad tiene una sola. ` +
        '¿Confirmas que trabajas en esta entidad? Después podrás subir sus estatutos, escrituras o tus poderes para que la revisemos.'
      );
      if (!ok) return;
      try {
        const res = await API.post('/organizations/claim', { oid: r.oid });
        Toast.show('¡Hecho! La entidad ya es tuya. Ahora completa su ficha.', 'ok');
        myOrg = { id: res.id };
        rememberOrg(res.id);
        onDone();
        loadMyOrgs();
        if (typeof App !== 'undefined' && App.refreshAvatar) App.refreshAvatar();
      } catch (e) {
        // Ya tiene dueño (por OID o por PIC): ofrecer la revisión.
        if (e && e.code === 'ALREADY_CLAIMED') return dispute(r);
        Toast.show(e.message || 'No se pudo reclamar', 'error');
      }
    }

    async function dispute(r) {
      const msg = await Modal.prompt(
        `«${r.name}» ya tiene una persona responsable en EU Funding Studio. Si crees que debería ser tuya, cuéntanos tu cargo en la entidad: pediremos la documentación a las dos partes.`,
        '', { placeholder: 'Tu cargo en la entidad' }
      );
      if (msg === null) return;
      try {
        await API.post('/organizations/claim/dispute', { oid: r.oid, message: msg });
        Toast.show('Solicitud registrada. Te escribiremos para pedirte la documentación.', 'ok');
      } catch (e) {
        Toast.show(e.message || 'No se pudo enviar la solicitud', 'error');
      }
    }
  }

  function openClaimModal() {
    document.getElementById('org-claim-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'org-claim-modal';
    overlay.className = 'fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-16 pb-8 overflow-y-auto';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div class="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 class="font-headline text-lg font-bold">Añadir otra entidad</h2>
            <p class="text-white/70 text-xs">Búscala en nuestra base de datos y reclámala.</p>
          </div>
          <button class="org-claim-close text-white/70 hover:text-white" aria-label="Cerrar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="p-5" id="org-claim-modal-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.org-claim-close').addEventListener('click', close);
    renderClaimSearch(overlay.querySelector('#org-claim-modal-body'), { onDone: close });
  }

  /* ── Itinerario: qué le falta a la ficha ──────────────────────── */

  const ITINERARY = [
    { key: 'identity', title: 'Identificación', tab: 'general',
      why: 'Quien te invita como socio necesita tu PIC, tu nombre legal y tu tipo de entidad para la solicitud.',
      fields: ['organization_name', 'legal_name_national', 'org_type', 'pic', 'national_id', 'foundation_date'] },
    { key: 'contact', title: 'Ubicación y contacto', tab: 'general',
      why: 'Para que puedan escribirte y encontrarte en el mapa.',
      fields: ['country', 'city', 'address', 'post_code', 'website', 'email', 'telephone1'] },
    { key: 'logo', title: 'Logo', tab: 'general',
      why: 'Una ficha con logo se reconoce de un vistazo en el directorio.',
      fields: ['logo_url'] },
    { key: 'about', title: 'Presentación y especialidad', tab: 'experience',
      why: 'Es lo primero que lee quien busca socio: a qué os dedicáis y en qué sois buenos.',
      fields: ['description', 'activities_experience', 'expertise_areas', 'erasmus_roles'] },
    { key: 'capacity', title: 'Capacidad', tab: 'experience',
      why: 'Ayuda a saber si podéis asumir un proyecto.',
      fields: ['staff_size', 'annual_projects'] },
    { key: 'legal_rep', title: 'Representante legal', tab: 'representatives',
      why: 'Sin estos datos no se puede firmar el mandato de socio.',
      fields: ['legal_rep_first_name', 'legal_rep_family_name', 'legal_rep_position', 'legal_rep_email'] },
    { key: 'contact_person', title: 'Persona de contacto', tab: 'representatives',
      why: 'La persona a la que escribirán para proponeros un proyecto.',
      fields: ['cp_first_name', 'cp_family_name', 'cp_email', 'cp_telephone1'] },
    { key: 'staff', title: 'Personal clave', tab: 'representatives', count: 'key-staff', anchor: 'key-staff',
      why: 'Los evaluadores puntúan la experiencia del equipo: añade al menos una persona.' },
    { key: 'projects', title: 'Proyectos europeos', tab: 'experience', count: 'eu-projects', anchor: 'eu-projects',
      why: 'Tu experiencia previa es lo que más pesa al elegir socio.' },
    { key: 'docs', title: 'Documentación legal', docs: true, recommended: true,
      why: 'Estatutos, escrituras, acta de constitución o acreditación de poderes. El equipo la revisa y, si todo está bien, tu entidad lleva el sello «Verificada».' },
    { key: 'public', title: 'Visible en el directorio', tab: 'general', fields: ['is_public'],
      why: 'Si no está visible, nadie podrá encontrarte como socio.' },
    { key: 'accreditations', title: 'Acreditaciones', tab: 'accreditations', count: 'accreditations', anchor: 'accreditations', optional: true,
      why: 'Carta Erasmus, acreditación KA1… Solo si las tenéis.' },
  ];

  function resetItineraryCounts(org) {
    _counts = {
      'key-staff':      (org?.key_staff || []).length,
      'eu-projects':    (org?.eu_projects || []).length,
      'accreditations': (org?.accreditations || []).length,
    };
    _claimDocs = [];
    _verification = null;
    renderItinerary();
  }

  function filled(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return v !== 0;
    return !!v;
  }

  function fieldEl(step, f) {
    // «description» está en dos pestañas: buscar dentro de la del paso.
    return document.querySelector(`#myorg-tab-${step.tab} [data-field="${f}"]`)
      || document.querySelector(`#myorg-editor [data-field="${f}"]`);
  }

  function fieldLabel(step, f) {
    if (f === 'logo_url') return 'Logo';
    const el = fieldEl(step, f);
    // Subir por los ancestros: el dictado por voz envuelve los textarea.
    let lab = el?.closest('label') || null;
    for (let n = el?.parentElement; !lab && n && n.id !== 'myorg-editor'; n = n.parentElement) {
      lab = n.querySelector(':scope > label');
    }
    return (lab?.textContent || f).replace('*', '').trim();
  }

  function stepStatus(step) {
    if (step.docs) return { done: _claimDocs.length > 0 ? 1 : 0, total: 1, missing: [] };
    if (step.count) return { done: (_counts[step.count] || 0) > 0 ? 1 : 0, total: 1, missing: [] };
    const missing = step.fields.filter(f => !filled(myOrg?.[f]));
    return { done: step.fields.length - missing.length, total: step.fields.length, missing };
  }

  function renderItinerary() {
    const host = document.getElementById('myorg-itinerary');
    if (!host || !myOrg?.id) return;
    const rows = ITINERARY.map(step => ({ step, st: stepStatus(step) }));
    const scored = rows.filter(r => !r.step.optional);
    const pct = Math.round(100 * scored.reduce((a, r) => a + r.st.done / r.st.total, 0) / scored.length);
    const vstatus = _verification && _verification.verified ? 'verified' : (_verification && _verification.status) || null;
    const next = rows.find(r => !r.step.optional && r.st.done < r.st.total);

    const stepHtml = rows.map(({ step, st }) => {
      const complete = st.done >= st.total;
      const isNext = next && next.step.key === step.key;
      const tag = step.optional ? 'Opcional' : step.recommended ? 'Recomendado' : '';
      const missingTxt = st.missing.length && st.missing.length < st.total
        ? `<div class="text-[11px] text-on-surface-variant mt-1">Falta: ${st.missing.map(f => esc(fieldLabel(step, f))).join(', ')}</div>` : '';
      return `
        <li class="flex items-start gap-3 py-3 ${isNext ? 'bg-secondary-fixed/20 -mx-3 px-3 rounded-lg' : ''}">
          <span class="material-symbols-outlined text-[22px] mt-0.5 ${complete ? 'text-primary' : 'text-on-surface-variant/40'}" ${complete ? 'style="font-variation-settings:\'FILL\' 1"' : ''}>${complete ? 'check_circle' : 'radio_button_unchecked'}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold ${complete ? 'text-on-surface-variant' : 'text-on-surface'}">${esc(step.title)}</span>
              ${!step.count && !step.docs && st.total > 1 ? `<span class="text-[11px] text-on-surface-variant">${st.done}/${st.total}</span>` : ''}
              ${tag ? `<span class="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant/70">${tag}</span>` : ''}
              ${isNext ? '<span class="text-[10px] uppercase tracking-wider font-bold text-primary">Siguiente paso</span>' : ''}
            </div>
            ${complete ? '' : `<div class="text-xs text-on-surface-variant mt-0.5">${esc(step.why)}</div>${missingTxt}`}
          </div>
          ${complete ? '' : `<button type="button" data-goto="${step.key}" class="shrink-0 text-xs font-semibold text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5">Completar</button>`}
        </li>`;
    }).join('');

    host.innerHTML = `
      <div class="bg-white rounded-2xl border border-outline-variant/30 overflow-hidden">
        <div class="p-5 sm:p-6 border-b border-outline-variant/20">
          <div class="flex items-start gap-4 flex-wrap">
            <div class="flex-1 min-w-[220px]">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="font-headline text-lg font-extrabold text-primary">Tu ficha está al ${pct} %</h2>
                ${verificationBadge(vstatus)}
              </div>
              <p class="text-xs text-on-surface-variant mt-1">Cuanto más completa esté tu ficha, más fácil es que otra entidad te elija como socia.</p>
            </div>
            <button type="button" id="myorg-itinerary-toggle" class="text-xs font-semibold text-primary hover:underline">${_itineraryOpen ? 'Ocultar pasos' : 'Ver pasos'}</button>
          </div>
          <div class="mt-4 h-2.5 rounded-full bg-surface-container-low overflow-hidden">
            <div class="h-full rounded-full bg-primary transition-all duration-500" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="${_itineraryOpen ? '' : 'hidden'}">
          <ul class="px-5 sm:px-6 divide-y divide-outline-variant/15">${stepHtml}</ul>
          <div id="myorg-claim-docs" class="px-5 sm:px-6 py-5 border-t border-outline-variant/20 bg-surface-container-low/40">
            ${renderDocsBox()}
          </div>
        </div>
      </div>`;

    host.querySelector('#myorg-itinerary-toggle')?.addEventListener('click', () => {
      _itineraryOpen = !_itineraryOpen;
      renderItinerary();
    });
    host.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => gotoStep(b.dataset.goto)));
    bindDocsBox(host);
  }
  let _itineraryOpen = true;

  function gotoStep(key) {
    const step = ITINERARY.find(s => s.key === key);
    if (!step) return;
    if (step.docs) {
      document.getElementById('myorg-claim-docs')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    document.querySelector(`#myorg-tab-nav [data-tab="${step.tab}"]`)?.click();
    let target = null;
    if (step.count) {
      target = document.querySelector(`#myorg-editor [data-org-add="${step.anchor}"]`);
    } else {
      const f = stepStatus(step).missing[0];
      target = f === 'logo_url'
        ? document.getElementById('myorg-logo-preview')
        : fieldEl(step, f);
    }
    if (!target) return;
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target.matches('input,select,textarea')) target.focus({ preventScroll: true });
      target.classList.add('ring-2', 'ring-secondary-fixed');
      setTimeout(() => target.classList.remove('ring-2', 'ring-secondary-fixed'), 2200);
    }, 80);
  }

  /* ── Documentación legal (privada: solo tú y el equipo de Studio) ── */

  function renderDocsBox() {
    const label = Object.fromEntries(DOC_TYPES);
    const list = _claimDocs.length
      ? `<ul class="mt-3 space-y-1.5">${_claimDocs.map(d => `
          <li class="flex items-center gap-2 text-sm bg-white rounded-lg border border-outline-variant/20 px-3 py-2">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">description</span>
            <span class="font-semibold text-xs text-primary shrink-0">${esc(label[d.doc_type] || 'Documento')}</span>
            <span class="truncate flex-1 text-xs text-on-surface-variant">${esc(d.original_name)}</span>
            <button type="button" data-doc-dl="${esc(d.id)}" class="text-on-surface-variant hover:text-primary" title="Descargar"><span class="material-symbols-outlined text-[18px]">download</span></button>
            <button type="button" data-doc-del="${esc(d.id)}" class="text-on-surface-variant hover:text-error" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button>
          </li>`).join('')}</ul>`
      : '';
    return `
      <div class="flex items-start gap-3">
        <span class="material-symbols-outlined text-[22px] text-primary mt-0.5">verified_user</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-on-surface">Acredita tu entidad <span class="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant/70 ml-1">Recomendado</span></div>
          <p class="text-xs text-on-surface-variant mt-0.5">Sube los estatutos, las escrituras, el acta de constitución o un documento que acredite tus poderes en la entidad. No es obligatorio. El equipo de EU Funding Studio lo revisa y, si todo está bien, tu ficha lleva el sello «Verificada» (te avisamos por correo). Si alguien más reclama tu entidad, te pediremos esta documentación. Solo la ves tú y el equipo de EU Funding Studio.</p>
          ${verificationNote()}
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <select id="myorg-doc-type" class="border border-outline-variant/40 rounded-lg px-3 py-2 text-sm bg-white">
              ${DOC_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
            <label class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary/90 cursor-pointer transition-colors">
              <span class="material-symbols-outlined text-base">upload</span> Subir documento
              <input type="file" id="myorg-doc-input" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" class="hidden" />
            </label>
            <span class="text-[11px] text-on-surface-variant">PDF, imagen o Word · máx. 15 MB</span>
          </div>
          ${list}
        </div>
      </div>`;
  }

  function bindDocsBox(host) {
    host.querySelector('#myorg-doc-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !myOrg?.id) return;
      if (file.size > 15 * 1024 * 1024) { Toast.show('El archivo pesa más de 15 MB', 'error'); return; }
      const form = new FormData();
      form.append('doc_type', host.querySelector('#myorg-doc-type')?.value || 'otro');
      form.append('file', file);
      try {
        const res = await fetch(`/v1/organizations/${encodeURIComponent(myOrg.id)}/claim-docs`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + API.getToken() },
          body: form,
        });
        const json = await res.json();
        if (!json.ok) throw json.error || new Error('Error');
        await loadClaimDocs();
        Toast.show(_verification && _verification.verified
          ? 'Documento añadido'
          : 'Documento subido. Queda pendiente de revisión: te avisaremos por correo.', 'ok');
      } catch (err) { Toast.show(err.message || 'Error subiendo el documento', 'error'); }
    });
    host.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await Modal.confirm('¿Eliminar este documento?')) return;
      try {
        await API.del(`/organizations/${encodeURIComponent(myOrg.id)}/claim-docs/${encodeURIComponent(b.dataset.docDel)}`);
        await loadClaimDocs();
      } catch (err) { Toast.show(err.message || 'Error', 'error'); }
    }));
    host.querySelectorAll('[data-doc-dl]').forEach(b => b.addEventListener('click', async () => {
      try {
        const doc = _claimDocs.find(d => d.id === b.dataset.docDl);
        const res = await fetch(`/v1/organizations/${encodeURIComponent(myOrg.id)}/claim-docs/${encodeURIComponent(b.dataset.docDl)}/file`, {
          headers: { 'Authorization': 'Bearer ' + API.getToken() },
        });
        if (!res.ok) throw new Error('No se pudo descargar');
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url; a.download = doc?.original_name || 'documento';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (err) { Toast.show(err.message || 'Error', 'error'); }
    }));
  }

  async function loadClaimDocs() {
    if (!myOrg?.id) return;
    const id = myOrg.id;
    try {
      const out = await API.get(`/organizations/${encodeURIComponent(id)}/claim-docs`) || {};
      if (myOrg?.id !== id) return;
      _claimDocs = Array.isArray(out) ? out : (out.documents || []);
      _verification = out.verification || null;
    } catch (e) {
      _claimDocs = [];
      _verification = null;
    }
    renderItinerary();
  }

  /* Sello de la ficha: solo «Verificada» si un admin la revisó. */
  function verificationBadge(status) {
    const pill = 'inline-flex items-center gap-1 rounded-full text-[11px] font-bold px-2.5 py-1';
    if (status === 'verified') {
      return `<span class="${pill} bg-[#f3f8d2] text-primary border border-secondary-fixed"><span class="material-symbols-outlined text-[15px]" style="font-variation-settings:'FILL' 1">verified</span>Verificada</span>`;
    }
    if (status === 'pending') {
      return `<span class="${pill} bg-lavender-soft text-primary border border-lavender/40"><span class="material-symbols-outlined text-[15px]">hourglass_top</span>Pendiente de revisión</span>`;
    }
    if (status === 'rejected') {
      return `<span class="${pill} bg-error-container text-on-error-container border border-error/20"><span class="material-symbols-outlined text-[15px]">gpp_bad</span>No verificada</span>`;
    }
    return `<span class="${pill} font-semibold bg-surface-container-low text-on-surface-variant border border-outline-variant/30"><span class="material-symbols-outlined text-[15px]">gpp_maybe</span>Sin verificar</span>`;
  }

  function verificationNote() {
    const v = _verification;
    if (!v) return '';
    if (v.verified) return '<p class="text-xs text-primary font-semibold mt-2">Documentación revisada: tu entidad lleva el sello «Verificada».</p>';
    if (v.status === 'pending') return '<p class="text-xs text-primary font-semibold mt-2">Tu documentación está pendiente de revisión. Te avisaremos por correo.</p>';
    if (v.status === 'rejected') return `<p class="text-xs text-error font-semibold mt-2">No hemos podido verificarla${v.note ? ': ' + esc(v.note) : ''}. Puedes subir otro documento.</p>`;
    return '';
  }

  /* Entidad elegida en «Mis entidades» (se recuerda en este navegador). */
  const MYORG_KEY = 'efs.myorg.selected';
  function rememberOrg(id) { try { localStorage.setItem(MYORG_KEY, id || ''); } catch { /* sin almacenamiento */ } }
  function rememberedOrg() { try { return localStorage.getItem(MYORG_KEY) || null; } catch { return null; } }

  /* «Mis entidades»: tarjetas para cambiar de entidad cuando hay más de una. */
  function renderSwitcher() {
    const host = document.getElementById('myorg-switcher');
    if (!host) return;
    if (myOrgs.length < 2) { host.classList.add('hidden'); host.innerHTML = ''; return; }
    host.classList.remove('hidden');
    host.innerHTML = `
      <h2 class="text-[11px] font-bold uppercase tracking-[.16em] text-on-surface-variant mb-2">Mis entidades <span class="font-semibold">(${myOrgs.length})</span></h2>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Mis entidades">
        ${myOrgs.map(o => {
          const on = myOrg && myOrg.id === o.id;
          const name = (o.acronym ? o.acronym + ' — ' : '') + (o.organization_name || '');
          const mark = Number(o.verified) ? `<span class="material-symbols-outlined text-[16px] text-primary" style="font-variation-settings:'FILL' 1" title="Verificada">verified</span>` : '';
          const logo = o.logo_url
            ? `<img src="${esc(o.logo_url)}" alt="" class="w-7 h-7 rounded-full object-contain bg-white border border-outline-variant/30 shrink-0" referrerpolicy="no-referrer">`
            : `<span class="w-7 h-7 rounded-full bg-primary text-secondary-fixed text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc((o.acronym || o.organization_name || '?').slice(0, 2).toUpperCase())}</span>`;
          return `<button type="button" role="radio" aria-checked="${on}" data-switch-org="${esc(o.id)}"
              class="flex items-center gap-2 max-w-full sm:max-w-[320px] min-w-0 pl-1.5 pr-3 py-1.5 rounded-full border text-sm transition-colors ${on ? 'border-primary bg-primary text-white' : 'border-outline-variant/50 bg-white text-on-surface hover:border-primary/60'}">
              ${logo}<span class="truncate font-semibold">${esc(name)}</span>${on ? '' : mark}</button>`;
        }).join('')}
      </div>`;
    host.querySelectorAll('[data-switch-org]').forEach(b => b.addEventListener('click', () => {
      const sel = document.getElementById('myorg-org-select');
      if (!sel || sel.value === b.dataset.switchOrg) return;
      sel.value = b.dataset.switchOrg;
      sel.dispatchEvent(new Event('change'));
    }));
  }


  return {
    initMyOrg, initDirectory, saveSection, addChild, deleteChild,
    editChildInline, viewOrg, dirPrev, dirNext, loadChildTable
  };
})();
