/* ═══════════════════════════════════════════════════════════════
   Perfil — completar el perfil (23-oct-2026). Ver docs/PERFIL.md.
   · Primer acceso: asistente de 5 pasos (foto, teléfono, entidad,
     ubicación, sobre ti), cada uno con «Omitir».
   · Después: al entrar (una vez por sesión) una ventana corta con
     solo lo que falta y «Ahora no».
   · Siempre: anillo de progreso en el círculo del usuario, línea en
     su menú, tarjeta en Inicio y la lista en Mi cuenta › Perfil.
   API: GET/PATCH /v1/profile/me, POST /v1/profile/me/wizard-seen.
   ═══════════════════════════════════════════════════════════════ */

const Perfil = (() => {
  let data = null;
  const SEEN_TAB = 'efs_perfil_aviso';      // sessionStorage: ya recordado en esta pestaña
  const SEEN_AT = 'efs_perfil_aviso_at';    // localStorage: última vez en este navegador
  const GAP_MS = 4 * 60 * 60 * 1000;        // vuelve a recordarlo si pasa más de 4 h
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = (kind, fn) => { try { return fn(kind === 'tab' ? sessionStorage : localStorage); } catch (e) { return null; } };

  function stepInfo(key) {
    return {
      photo:        { icon: 'photo_camera', title: _t('Tu foto'),       short: _t('Foto de perfil') },
      phone:        { icon: 'call',         title: _t('Tu teléfono'),   short: _t('Teléfono') },
      organization: { icon: 'apartment',    title: _t('Tu entidad'),    short: _t('Entidad') },
      location:     { icon: 'location_on',  title: _t('Dónde estás'),   short: _t('Ubicación en el mapa') },
      about:        { icon: 'badge',        title: _t('Sobre ti'),      short: _t('Cargo y presentación') },
    }[key];
  }

  async function load() {
    data = await API.get('/profile/me');
    paintProgress();
    return data;
  }

  /* ── Arranque: lo llama App.showApp() ─────────────────────── */
  async function start() {
    try { await load(); } catch (e) { return; }
    if (!data.completion.missing.length) return;
    if (data.wizard_pending) {
      openWizard(data.completion.missing, { first: true });
    } else if (shouldRemind()) {
      openReminder();
    }
  }

  function shouldRemind() {
    if (store('tab', s => s.getItem(SEEN_TAB))) return false;
    const at = Number(store('local', s => s.getItem(SEEN_AT)) || 0);
    // Pestaña nueva poco después de otra: no insistir.
    if (at && Date.now() - at < GAP_MS) { store('tab', s => s.setItem(SEEN_TAB, '1')); return false; }
    return true;
  }
  function markReminded() {
    store('tab', s => s.setItem(SEEN_TAB, '1'));
    store('local', s => s.setItem(SEEN_AT, String(Date.now())));
  }
  /* Al cerrar sesión: la próxima entrada vuelve a recordarlo. */
  function reset() {
    data = null;
    store('tab', s => s.removeItem(SEEN_TAB));
    store('local', s => s.removeItem(SEEN_AT));
    paintProgress();
  }

  /* ── Progreso a la vista ───────────────────────────────────── */
  function paintProgress() {
    const c = data && data.completion;
    const pct = c ? c.percent : 100;
    const incomplete = !!c && c.missing.length > 0;
    const acct = document.getElementById('topbar-cta-account');
    if (acct) {
      acct.classList.toggle('efs-perfil-ring', incomplete);
      acct.style.setProperty('--perfil-pct', String(pct));
      acct.title = incomplete ? _t('Mi cuenta · perfil al {pct} %', { pct }) : _t('Mi cuenta');
    }
    // Línea en el menú del círculo.
    const menu = document.getElementById('efs-account-menu');
    let item = document.getElementById('efs-account-menu-perfil');
    if (menu && incomplete) {
      if (!item) {
        item = document.createElement('button');
        item.type = 'button';
        item.id = 'efs-account-menu-perfil';
        item.setAttribute('role', 'menuitem');
        item.className = 'efs-account-menu__perfil';
        item.addEventListener('click', () => { menu.hidden = true; openWizard(data.completion.missing); });
        const who = document.getElementById('efs-account-menu-who');
        menu.insertBefore(item, who ? who.nextSibling : menu.firstChild);
      }
      item.textContent = _t('Completar mi perfil · {pct} %', { pct });
    } else if (item) item.remove();
    paintCards();
  }

  function checklistHtml(c, { editAll = false } = {}) {
    return c.steps.map(s => {
      const i = stepInfo(s.key);
      return `<li class="flex items-center gap-3 py-2">
        <span class="material-symbols-outlined text-[20px] ${s.done ? 'text-primary' : 'text-on-surface-variant/60'}" style="font-variation-settings:'FILL' ${s.done ? 1 : 0}">${s.done ? 'check_circle' : i.icon}</span>
        <span class="flex-1 text-sm ${s.done ? 'text-on-surface-variant' : 'font-semibold text-on-surface'}">${esc(i.short)}</span>
        ${(!s.done || editAll) ? `<button type="button" data-perfil-step="${s.key}" class="text-xs font-bold text-primary hover:underline">${s.done ? _t('Cambiar') : _t('Añadir')}</button>` : ''}
      </li>`;
    }).join('');
  }
  function barHtml(pct) {
    return `<div class="h-2 rounded-full bg-surface-container-low overflow-hidden"><div class="h-full rounded-full bg-primary transition-all" style="width:${pct}%"></div></div>`;
  }
  function wireSteps(root) {
    root.querySelectorAll('[data-perfil-step]').forEach(b => b.addEventListener('click', () => openWizard([b.dataset.perfilStep], { single: true })));
  }

  /* Tarjetas: Inicio (solo si falta algo) y Mi cuenta › Perfil (siempre). */
  function paintCards() {
    const c = data && data.completion;
    const home = document.getElementById('perfil-home-card');
    if (home) {
      if (!c || !c.missing.length) { home.classList.add('hidden'); home.innerHTML = ''; }
      else {
        home.classList.remove('hidden');
        home.innerHTML = `
          <div class="bg-white rounded-2xl border-2 border-[#e9ff60] p-6 flex flex-col md:flex-row md:items-center gap-5">
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold uppercase tracking-widest text-primary mb-1">${_t('Tu perfil está al {pct} %', { pct: c.percent })}</div>
              <div class="font-headline text-lg font-bold text-on-surface mb-3">${_t('Complétalo para que socios y entidades te encuentren')}</div>
              ${barHtml(c.percent)}
              <div class="flex flex-wrap gap-2 mt-3">${c.missing.map(k => `<button type="button" data-perfil-step="${k}" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-container-low text-on-surface hover:bg-lavender-soft"><span class="material-symbols-outlined text-[16px]">${stepInfo(k).icon}</span>${esc(stepInfo(k).short)}</button>`).join('')}</div>
            </div>
            <button type="button" data-perfil-all class="shrink-0 px-5 py-2.5 rounded-full bg-primary text-white text-sm font-bold hover:bg-violet">${_t('Completar ahora')}</button>
          </div>`;
        wireSteps(home);
        home.querySelector('[data-perfil-all]').addEventListener('click', () => openWizard(data.completion.missing));
      }
    }
    const acc = document.getElementById('perfil-account-card');
    if (acc && c) {
      acc.innerHTML = `
        <div class="flex items-center justify-between gap-3 mb-2">
          <h2 class="text-base font-bold text-on-surface">${_t('Tu perfil')}</h2>
          <span class="text-sm font-bold text-primary">${c.percent} %</span>
        </div>
        ${barHtml(c.percent)}
        <p class="text-xs text-on-surface-variant mt-3">${_t('Es el mismo perfil en todo EU Funding Studio. Tu teléfono solo lo ve nuestro equipo.')}</p>
        <ul class="mt-2 divide-y divide-outline-variant/20">${checklistHtml(c, { editAll: true })}</ul>`;
      wireSteps(acc);
    }
  }

  /* ── Ventana corta: solo lo que falta ─────────────────────── */
  function openReminder() {
    markReminded();
    const c = data.completion;
    const overlay = shell(`
      <div class="p-6">
        <div class="flex items-start gap-4 mb-4">
          <span class="material-symbols-outlined text-3xl text-primary">person_check</span>
          <div>
            <h2 class="font-headline text-lg font-bold text-on-surface">${_t('Tu perfil está al {pct} %', { pct: c.percent })}</h2>
            <p class="text-sm text-on-surface-variant mt-1">${_t('Te falta poco. Con el perfil completo, otras entidades te encuentran y te proponen proyectos.')}</p>
          </div>
        </div>
        ${barHtml(c.percent)}
        <ul class="mt-3 divide-y divide-outline-variant/20">${checklistHtml({ steps: c.steps.filter(s => !s.done) })}</ul>
        <div class="flex gap-3 mt-5">
          <button type="button" data-close class="flex-1 py-3 rounded-full border border-primary text-sm font-semibold text-primary hover:bg-primary/5">${_t('Ahora no')}</button>
          <button type="button" data-go class="flex-1 py-3 rounded-full bg-primary text-white text-sm font-bold hover:bg-violet">${_t('Completar ahora')}</button>
        </div>
      </div>`, 'max-w-md');
    overlay.querySelectorAll('[data-perfil-step]').forEach(b => b.addEventListener('click', () => { overlay.remove(); openWizard([b.dataset.perfilStep], { single: true }); }));
    overlay.querySelector('[data-go]').addEventListener('click', () => { overlay.remove(); openWizard(c.missing); });
  }

  /* Marco común de las ventanas (cierra con Esc, fuera o [data-close]). */
  function shell(inner, width, onClose) {
    document.getElementById('perfil-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'perfil-modal';
    overlay.className = 'fixed inset-0 bg-black/40 z-40 flex items-start sm:items-center justify-center p-4 overflow-y-auto';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl w-full ${width} overflow-hidden my-auto">${inner}</div>`;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
    const onKey = e => {
      const mini = document.getElementById('mini-modal');   // con una confirmación abierta, Esc es para ella
      if (e.key === 'Escape' && (!mini || mini.classList.contains('hidden'))) close();
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close]')) close(); });
    overlay._close = close;
    document.body.appendChild(overlay);
    return overlay;
  }

  /* ── Asistente ─────────────────────────────────────────────
     keys: pasos a recorrer. first: es el del primer acceso (al cerrarlo
     se marca visto). single: un solo paso (desde una lista). */
  function openWizard(keys, { first = false, single = false } = {}) {
    if (!data || !keys || !keys.length) return;
    if (!first && keys.length === 1) single = true;   // un solo paso: sin «Paso 1 de 1»
    if (first) API.post('/profile/me/wizard-seen', {}).catch(() => {});
    markReminded();
    let idx = 0;
    let saveCurrent = null;   // guardar del paso visible (devuelve true si puede seguir)
    let map = null;

    const overlay = shell(`
      <div class="bg-primary text-white px-6 pt-5 pb-4">
        <div class="flex items-center justify-between gap-3">
          <div class="text-[11px] font-bold uppercase tracking-widest text-white/70" data-w-count></div>
          <button type="button" data-close class="text-white/70 hover:text-white" aria-label="${_t('Cerrar')}"><span class="material-symbols-outlined">close</span></button>
        </div>
        <h2 class="font-headline text-xl font-bold mt-1" data-w-title></h2>
        <div class="flex gap-1.5 mt-3" data-w-dots></div>
      </div>
      <div class="p-6" data-w-body></div>
      <div class="px-6 pb-6 flex items-center gap-3">
        <button type="button" data-w-skip class="text-sm font-semibold text-on-surface-variant hover:text-primary"></button>
        <span class="flex-1"></span>
        <button type="button" data-w-next class="px-6 py-3 rounded-full bg-[#e9ff60] text-primary text-sm font-bold hover:brightness-95 disabled:opacity-50"></button>
      </div>`, 'max-w-xl', () => { if (map) map.remove(); paintProgress(); });

    const $ = sel => overlay.querySelector(sel);
    const body = $('[data-w-body]');
    const next = $('[data-w-next]');
    const skip = $('[data-w-skip]');

    if (first) {
      // Bienvenida antes del primer paso.
      $('[data-w-count]').textContent = _t('Bienvenida');
      $('[data-w-title]').textContent = _t('¡Hola, {nombre}! Completa tu perfil', { nombre: (data.name || '').split(/\s+/)[0] || '' });
      body.innerHTML = `
        <p class="text-sm text-on-surface leading-relaxed">${_t('Son {n} pasos rápidos. Así otras entidades te encuentran, la Comunidad te reconoce y podemos ayudarte mejor con tus proyectos.', { n: keys.length })}</p>
        <ul class="mt-4 space-y-2">${keys.map(k => `<li class="flex items-center gap-3 text-sm"><span class="material-symbols-outlined text-primary">${stepInfo(k).icon}</span>${esc(stepInfo(k).short)}</li>`).join('')}</ul>
        <p class="text-xs text-on-surface-variant mt-4">${_t('Puedes omitir cualquier paso y terminarlo más tarde en Mi cuenta.')}</p>`;
      skip.textContent = _t('Más tarde');
      next.textContent = _t('Empezar');
      skip.onclick = () => overlay._close();
      next.onclick = () => show(0);
    }

    function dots() {
      $('[data-w-dots]').innerHTML = single ? '' : keys.map((k, i) =>
        `<span class="h-1.5 flex-1 rounded-full ${i < idx ? 'bg-[#e9ff60]' : i === idx ? 'bg-white' : 'bg-white/25'}"></span>`).join('');
    }

    function show(i) {
      if (map) { map.remove(); map = null; }
      idx = i;
      if (idx >= keys.length) return finish();
      const key = keys[idx];
      $('[data-w-count]').textContent = single ? _t('Tu perfil') : _t('Paso {n} de {total}', { n: idx + 1, total: keys.length });
      $('[data-w-title]').textContent = stepInfo(key).title;
      dots();
      skip.textContent = single ? _t('Cancelar') : _t('Omitir');
      next.textContent = single || idx === keys.length - 1 ? _t('Guardar') : _t('Guardar y seguir');
      next.disabled = false;
      skip.onclick = () => (single ? overlay._close() : show(idx + 1));
      next.onclick = async () => {
        next.disabled = true;
        try {
          const go = saveCurrent ? await saveCurrent() : true;
          if (go !== false) { paintProgress(); single ? overlay._close() : show(idx + 1); }
        } catch (e) {
          Toast.show(e.message || _t('No se ha podido guardar'), 'error');
        } finally { next.disabled = false; }
      };
      saveCurrent = STEPS[key](body);
    }

    function finish() {
      const c = data.completion;
      $('[data-w-count]').textContent = _t('Listo');
      $('[data-w-title]').textContent = c.missing.length ? _t('Tu perfil está al {pct} %', { pct: c.percent }) : _t('¡Perfil completo!');
      $('[data-w-dots]').innerHTML = '';
      body.innerHTML = `
        ${barHtml(c.percent)}
        <p class="text-sm text-on-surface mt-4">${c.missing.length
          ? _t('Te lo recordaremos la próxima vez que entres. También puedes terminarlo en Mi cuenta › Perfil.')
          : _t('Gracias. Puedes cambiar cualquier dato cuando quieras en Mi cuenta › Perfil.')}</p>`;
      skip.textContent = '';
      next.textContent = _t('Cerrar');
      next.onclick = () => overlay._close();
    }

    /* Cada paso pinta su formulario y devuelve su función de guardar. */
    const STEPS = {
      photo(el) {
        el.innerHTML = `
          <p class="text-sm text-on-surface-variant mb-5">${_t('Con tu foto, la gente te reconoce en la Comunidad, en los proyectos y en los mensajes.')}</p>
          <div class="flex items-center gap-5">
            <div data-p-avatar class="efs-avatar efs-avatar--lg" style="width:88px;height:88px;font-size:26px"></div>
            <div>
              <label class="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-primary hover:bg-violet cursor-pointer">
                <span class="material-symbols-outlined text-base">photo_camera</span><span data-p-label></span>
                <input type="file" data-p-file accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" />
              </label>
              <p class="text-xs text-on-surface-variant mt-2">${_t('JPG, PNG o WebP, hasta 2 MB.')}</p>
            </div>
          </div>`;
        const paint = () => {
          EfsAvatar.paint(el.querySelector('[data-p-avatar]'), { avatar_url: data.avatar_url, avatar_source: 'user', initials: initials(data.name) });
          el.querySelector('[data-p-label]').textContent = data.avatar_url ? _t('Cambiar foto') : _t('Subir foto');
        };
        paint();
        el.querySelector('[data-p-file]').addEventListener('change', async e => {
          const file = e.target.files[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) { Toast.show(_t('La foto pesa más de 2 MB'), 'error'); return; }
          const form = new FormData();
          form.append('avatar', file);
          try {
            const res = await fetch('/v1/auth/me/avatar', { method: 'POST', headers: { 'Authorization': 'Bearer ' + API.getToken() }, body: form });
            const j = await res.json().catch(() => ({ ok: false, error: { message: _t('No se pudo subir la foto') } }));
            if (!j.ok) throw j.error || new Error(_t('No se pudo subir la foto'));
            data.avatar_url = j.data.user_avatar_url || j.data.avatar_url;
            paint();
            if (App.refreshAvatar) App.refreshAvatar();
            await load();
            Toast.show(_t('Foto actualizada'), 'ok');
          } catch (err) { Toast.show(err.message || _t('No se pudo subir la foto'), 'error'); }
        });
        return null;   // la foto se guarda al elegirla
      },

      phone(el) {
        const countries = data.catalog.countries.filter(c => c.dial);
        const cur = splitPhone(data.phone, countries);
        const def = cur.dial || dialFor(data.country, countries) || dialFor(guessCountry(), countries) || '34';
        el.innerHTML = `
          <p class="text-sm text-on-surface-variant mb-5">${_t('Para poder llamarte si necesitas ayuda con un proyecto o una convocatoria.')}</p>
          <label class="block text-sm font-semibold text-on-surface mb-1.5">${_t('Teléfono móvil')}</label>
          <div class="flex gap-2">
            <select data-p-dial class="w-32 border border-outline-variant rounded-lg px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary" aria-label="${_t('Prefijo')}">
              ${[...new Set(countries.map(c => c.dial))].sort((a, b) => a - b).map(d => {
                const names = countries.filter(c => c.dial === d).map(c => c.key).join(' · ');
                return `<option value="${d}" ${d === def ? 'selected' : ''}>+${d} ${esc(names)}</option>`;
              }).join('')}
            </select>
            <input data-p-num type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" value="${esc(cur.number)}"
              placeholder="600 112 233" class="flex-1 border border-outline-variant rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <p class="flex items-start gap-2 text-xs text-on-surface-variant mt-3 bg-surface-container-low rounded-lg p-3">
            <span class="material-symbols-outlined text-[18px] text-primary">lock</span>
            <span>${_t('Solo lo ve el equipo de EU Funding Studio. Nunca se muestra a otros usuarios.')}</span>
          </p>`;
        setTimeout(() => el.querySelector('[data-p-num]').focus(), 60);
        el.querySelector('[data-p-num]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next.click(); } });
        return async () => {
          const num = el.querySelector('[data-p-num]').value.trim();
          if (!num) { Toast.show(_t('Escribe tu teléfono o pulsa «Omitir».'), 'error'); return false; }
          const raw = num.replace(/[\s().-]/g, '');
          const phone = raw.startsWith('+') || raw.startsWith('00') ? raw : '+' + el.querySelector('[data-p-dial]').value + raw.replace(/^0+(?=\d{7})/, '');
          data = await API.patch('/profile/me', { phone });
        };
      },

      organization(el) {
        if (data.orgs.length) {
          el.innerHTML = `
            <p class="text-sm text-on-surface-variant mb-4">${_t('Ya estás vinculado/a a tu entidad. Si tienes varias, elige la que quieres que se vea en tu perfil.')}</p>
            <div class="space-y-2">${data.orgs.map(o => `
              <label class="flex items-center gap-3 p-3 rounded-xl border border-outline-variant/40 cursor-pointer hover:border-primary/40">
                <input type="radio" name="p-org" value="${esc(o.id)}" ${o.id === data.organization_id ? 'checked' : ''} class="text-primary focus:ring-primary">
                <span class="flex-1 min-w-0"><span class="block text-sm font-semibold truncate" translate="no">${esc(o.name)}</span>
                <span class="block text-xs text-on-surface-variant">${esc([o.city, o.country].filter(Boolean).join(', '))}</span></span>
              </label>`).join('')}</div>
            <a href="#account-org" data-close class="inline-block text-xs font-semibold text-primary hover:underline mt-3">${_t('Gestionar mis entidades')}</a>`;
          return async () => {
            const id = el.querySelector('input[name="p-org"]:checked')?.value;
            if (id && id !== data.organization_id) data = await API.patch('/profile/me', { organization_id: id });
          };
        }
        el.innerHTML = `
          <p class="text-sm text-on-surface-variant mb-4">${_t('Busca la empresa, asociación o centro donde trabajas. Si nadie la ha reclamado todavía, puedes ser su responsable aquí.')}</p>
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
            <input type="text" data-p-q autocomplete="off" placeholder="${_t('Nombre, acrónimo, ciudad, OID o PIC…')}"
              class="w-full pl-10 pr-3 py-3 text-sm border border-outline-variant/40 rounded-lg bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          <div data-p-results class="mt-3 max-h-[40vh] overflow-y-auto divide-y divide-outline-variant/20 border border-outline-variant/20 rounded-lg hidden"></div>
          <p class="text-xs text-on-surface-variant mt-3">${_t('¿No aparece?')} <a href="#account-org" data-close class="font-semibold text-primary hover:underline">${_t('Créala en Mi entidad')}</a></p>
          <label class="flex items-center gap-3 mt-5 p-3 rounded-xl bg-surface-container-low cursor-pointer">
            <input type="checkbox" data-p-noorg ${data.no_organization ? 'checked' : ''} class="rounded text-primary focus:ring-primary">
            <span class="text-sm text-on-surface">${_t('No pertenezco a ninguna entidad')}</span>
          </label>`;
        const input = el.querySelector('[data-p-q]');
        const box = el.querySelector('[data-p-results]');
        setTimeout(() => input.focus(), 60);
        let seq = 0, timer = null, rows = [];
        input.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            const q = input.value.trim();
            if (q.length < 2) { box.classList.add('hidden'); return; }
            const my = ++seq;
            box.classList.remove('hidden');
            box.innerHTML = `<div class="py-5 text-center text-on-surface-variant text-sm">${_t('Buscando…')}</div>`;
            try {
              rows = await API.get('/organizations/claim/search?q=' + encodeURIComponent(q)) || [];
              if (my !== seq) return;
              if (!rows.length) { box.innerHTML = `<div class="py-5 text-center text-on-surface-variant text-sm">${_t('Sin resultados. Prueba con el nombre legal, el OID o el PIC.')}</div>`; return; }
              box.innerHTML = rows.map((r, i) => `
                <div class="flex items-center gap-3 px-4 py-3">
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold text-sm text-on-surface truncate" translate="no">${esc(r.name)}</div>
                    <div class="text-xs text-on-surface-variant truncate">${esc([r.city, r.country_code].filter(Boolean).join(', '))}${r.pic ? ' · PIC ' + esc(r.pic) : ''}</div>
                  </div>
                  ${r.claimed_by_me ? `<span class="text-xs font-semibold text-primary">${_t('Ya es tuya')}</span>`
                    : r.claimed ? `<a href="#account-org" data-close class="text-right text-xs text-on-surface-variant"><span class="block font-semibold">${_t('Ya tiene responsable')}</span><span class="text-primary font-semibold hover:underline">${_t('Pide una revisión en Mi entidad')}</span></a>`
                    : `<button type="button" data-claim="${i}" class="shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90">${_t('Es mi entidad')}</button>`}
                </div>`).join('');
              box.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => claim(rows[+b.dataset.claim])));
            } catch (e) {
              if (my === seq) box.innerHTML = `<div class="py-5 text-center text-error text-sm">${_t('No se pudo buscar. Inténtalo de nuevo.')}</div>`;
            }
          }, 300);
        });
        async function claim(r) {
          const ok = await Modal.confirm(_t('Vas a ser la persona responsable de «{nombre}» en EU Funding Studio. Cada entidad tiene una sola. ¿Confirmas que trabajas en esta entidad?', { nombre: r.name }));
          if (!ok) return;
          try {
            await API.post('/organizations/claim', { oid: r.oid });
            await load();
            if (App.refreshAvatar) App.refreshAvatar();
            Toast.show(_t('¡Hecho! La entidad ya es tuya. Completa su ficha en Mi entidad cuando quieras.'), 'ok');
            show(idx);   // repinta el paso con la entidad ya vinculada
          } catch (e) {
            Toast.show(e && e.code === 'ALREADY_CLAIMED' ? _t('Esa entidad ya tiene responsable. Pide una revisión en Mi entidad.') : (e.message || _t('No se ha podido guardar')), 'error');
          }
        }
        return async () => {
          const noorg = el.querySelector('[data-p-noorg]').checked;
          if (!noorg) { Toast.show(_t('Elige tu entidad, marca «No pertenezco a ninguna entidad» o pulsa «Omitir».'), 'error'); return false; }
          data = await API.patch('/profile/me', { no_organization: true });
        };
      },

      location(el) {
        const org = data.orgs.find(o => o.id === data.organization_id) || data.orgs[0];
        let point = data.location ? { lat: data.location.lat, lng: data.location.lng } : null;
        let fromOrg = data.location && data.location.source === 'organization';
        el.innerHTML = `
          <p class="text-sm text-on-surface-variant mb-3">${_t('Pulsa en el mapa la ciudad o zona donde trabajas. Guardamos un punto aproximado (a 1 km), nunca tu dirección, y nadie lo ve hasta que decidas mostrarlo en la Comunidad.')}</p>
          ${org && org.location ? `<button type="button" data-p-orgloc class="inline-flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-full text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/5"><span class="material-symbols-outlined text-[16px]">apartment</span>${_t('Usar la ciudad de mi entidad')}</button>` : ''}
          <div data-p-map class="w-full h-72 rounded-xl overflow-hidden bg-surface-container-low border border-outline-variant/30"></div>
          <div class="grid sm:grid-cols-2 gap-3 mt-3">
            <label class="block"><span class="block text-xs font-semibold text-on-surface mb-1">${_t('Ciudad o zona (opcional)')}</span>
              <input data-p-label maxlength="120" value="${esc(data.location ? data.location.label : '')}" class="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary" /></label>
            <label class="block"><span class="block text-xs font-semibold text-on-surface mb-1">${_t('País')}</span>
              <select data-p-country class="w-full border border-outline-variant rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">—</option>${data.catalog.countries.map(c => `<option value="${c.key}" ${c.key === (data.country || guessCountry()) ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
              </select></label>
          </div>`;
        const holder = el.querySelector('[data-p-map]');
        let marker = null;
        const place = (ll, fly) => {
          point = { lat: ll.lat, lng: ll.lng };
          if (!map) return;
          if (!marker) {
            marker = new maplibregl.Marker({ color: '#e11d48', draggable: true }).setLngLat([ll.lng, ll.lat]).addTo(map);
            marker.on('dragend', () => { const p = marker.getLngLat(); point = { lat: p.lat, lng: p.lng }; fromOrg = false; });
          } else marker.setLngLat([ll.lng, ll.lat]);
          if (fly) map.flyTo({ center: [ll.lng, ll.lat], zoom: Math.max(map.getZoom(), 9) });
        };
        const boot = () => {
          if (!holder.isConnected) return;
          if (typeof maplibregl === 'undefined') return setTimeout(boot, 200);
          const start = point || (org && org.location) || null;
          map = new maplibregl.Map({
            container: holder, style: STYLE_URL, attributionControl: { compact: true },
            center: start ? [start.lng, start.lat] : [10, 50], zoom: start ? 8 : 3.2,
          });
          map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
          map.on('click', e => { fromOrg = false; place(e.lngLat, false); });
          if (point) place(point, false);
        };
        boot();
        el.querySelector('[data-p-orgloc]')?.addEventListener('click', () => {
          fromOrg = true;
          place(org.location, true);
          const lbl = el.querySelector('[data-p-label]');
          if (!lbl.value && org.city) lbl.value = org.city;
          if (org.country) el.querySelector('[data-p-country]').value = org.country;
        });
        return async () => {
          if (!point) { Toast.show(_t('Pulsa en el mapa para marcar tu punto o pulsa «Omitir».'), 'error'); return false; }
          const label = el.querySelector('[data-p-label]').value.trim();
          const country = el.querySelector('[data-p-country]').value || null;
          data = await API.patch('/profile/me', {
            country,
            location: fromOrg ? { source: 'organization', label } : { lat: point.lat, lng: point.lng, label },
          });
        };
      },

      about(el) {
        const chips = (list, sel, name) => list.map(r => `
          <label class="cursor-pointer"><input type="checkbox" name="${name}" value="${r.key}" ${sel.includes(r.key) ? 'checked' : ''} class="peer sr-only">
          <span class="inline-block px-3 py-1.5 rounded-full text-xs font-semibold border border-outline-variant/50 text-on-surface peer-checked:bg-primary peer-checked:text-white peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary">${esc(r.label)}</span></label>`).join('');
        const extra = data.sectors.length || data.actions.length;
        el.innerHTML = `
          <label class="block text-sm font-semibold text-on-surface mb-1.5">${_t('Tu cargo')}</label>
          <input data-p-headline maxlength="120" value="${esc(data.headline)}" placeholder="${_t('Por ejemplo: Coordinadora de proyectos europeos')}"
            class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary mb-4" />
          <div class="text-sm font-semibold text-on-surface mb-2">${_t('¿Qué haces en los proyectos?')} <span class="font-normal text-on-surface-variant">${_t('(puedes marcar varias)')}</span></div>
          <div class="flex flex-wrap gap-2 mb-4">${chips(data.catalog.roles, data.roles, 'p-roles')}</div>
          <label class="block text-sm font-semibold text-on-surface mb-1.5">${_t('Preséntate en pocas líneas')}</label>
          <textarea data-p-bio maxlength="700" rows="4" placeholder="${_t('Quién eres, en qué proyectos trabajas y qué buscas.')}"
            class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary">${esc(data.bio)}</textarea>
          <div class="text-right text-[11px] text-on-surface-variant" data-p-count></div>
          <details class="mt-2" ${extra ? 'open' : ''}>
            <summary class="text-sm font-semibold text-primary cursor-pointer">${_t('Más sobre tu trabajo (opcional)')}</summary>
            <div class="text-xs font-semibold text-on-surface mt-3 mb-2">${_t('Ámbitos')}</div>
            <div class="flex flex-wrap gap-2">${chips(data.catalog.sectors, data.sectors, 'p-sectors')}</div>
            <div class="text-xs font-semibold text-on-surface mt-3 mb-2">${_t('Programas y acciones')}</div>
            <div class="flex flex-wrap gap-2">${chips(data.catalog.actions, data.actions, 'p-actions')}</div>
          </details>`;
        const bio = el.querySelector('[data-p-bio]');
        const count = () => { el.querySelector('[data-p-count]').textContent = bio.value.length + ' / 700'; };
        bio.addEventListener('input', count); count();
        setTimeout(() => el.querySelector('[data-p-headline]').focus(), 60);
        const picked = name => [...el.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
        return async () => {
          const headline = el.querySelector('[data-p-headline]').value.trim();
          if (!headline && !bio.value.trim()) { Toast.show(_t('Escribe tu cargo y una presentación breve, o pulsa «Omitir».'), 'error'); return false; }
          data = await API.patch('/profile/me', {
            headline, bio: bio.value, roles: picked('p-roles'), sectors: picked('p-sectors'), actions: picked('p-actions'),
          });
        };
      },
    };

    if (!first) show(0);
  }

  /* ── utilidades ─────────────────────────────────────────────── */
  function initials(name) {
    return (name || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  }
  function guessCountry() {
    const m = /-([A-Z]{2})\b/.exec((navigator.language || '').toUpperCase());
    return m ? m[1] : (I18N.lang === 'es' ? 'ES' : null);
  }
  function dialFor(code, countries) {
    const c = code && countries.find(x => x.key === code);
    return c ? c.dial : null;
  }
  // «+34 600112233» → { dial: '34', number: '600112233' }
  function splitPhone(phone, countries) {
    const m = /^\+(\d+)\s(\d+)$/.exec(phone || '');
    if (m && countries.some(c => c.dial === m[1])) return { dial: m[1], number: m[2] };
    return { dial: null, number: phone || '' };
  }

  return { start, reset, load, open: keys => openWizard(keys || (data && data.completion.missing) || [], { single: !!keys && keys.length === 1 }) };
})();
