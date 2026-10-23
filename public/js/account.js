/* ═══════════════════════════════════════════════════════════════
   Account — Área de "Mi Cuenta" (perfil, seguridad, facturación,
   preferencias). Menú lateral + secciones conmutables.
   Superficie de la persona (≠ Mi Organización = la entidad).
   ═══════════════════════════════════════════════════════════════ */

const Account = (() => {
  let wired = false;
  let me = null;

  function initials(name) {
    return (name || '?')
      .split(/\s+/)
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';
  }

  /* La sección visible la decide la ruta del sidebar (workspace Mi Cuenta):
     account-profile → profile, account-security → security, etc. */
  function sectionFromRoute(route) {
    return (route || '').replace(/^account-/, '') || 'profile';
  }

  function showSection(key) {
    document.querySelectorAll('#panel-account [data-acct-section]').forEach(el => {
      el.classList.toggle('hidden', el.dataset.acctSection !== key);
    });
  }

  /* ── Foto de perfil ───────────────────────────────────────────
     Vista previa en círculo. En el menú superior manda la foto; sin
     ella, el logo de su entidad y, si no, las iniciales. */
  function setAvatar(data) {
    if (!data) return;
    if (me) ['avatar_url', 'avatar_source', 'user_avatar_url', 'initials'].forEach(k => { if (k in data) me[k] = data[k]; });
    const src = me || data;
    const el = document.getElementById('account-avatar');
    if (el && window.EfsAvatar) {
      EfsAvatar.paint(el, { avatar_url: src.user_avatar_url, avatar_source: 'user', initials: src.initials || initials(src.name) });
    }
    const has = !!src.user_avatar_url;
    document.getElementById('account-avatar-remove')?.classList.toggle('hidden', !has);
    const lbl = document.getElementById('account-avatar-btn-label');
    if (lbl) lbl.textContent = has ? _t('Cambiar foto') : _t('Subir foto');
    const hint = document.getElementById('account-avatar-hint');
    if (hint) {
      hint.textContent = has
        ? _t('Es la imagen de tu círculo en el menú de arriba.')
        : src.avatar_source === 'organization'
          ? _t('Sin foto, en el menú se ve el logo de tu entidad. Sube una foto para usarla en su lugar.')
          : _t('Sin foto ni logo de entidad, en el menú se ven tus iniciales.');
    }
  }

  async function uploadAvatar(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { Toast.show(_t('La foto pesa más de 2 MB'), 'error'); return; }
    const form = new FormData();
    form.append('avatar', file);
    try {
      // Pasa por el indicador global (Guardando… / No se ha guardado · Reintentar).
      const json = await SaveStatus.track(async () => {
        const res = await fetch('/v1/auth/me/avatar', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + API.getToken() },
          body: form
        });
        const j = await res.json().catch(() => ({ ok: false, error: { message: _t('Respuesta inesperada del servidor ({estado})', { estado: res.status }) } }));
        if (!j.ok) throw j.error || new Error(_t('No se pudo subir la foto'));
        return j;
      }, { key: 'POST /auth/me/avatar' });
      setAvatar(json.data);
      if (typeof App !== 'undefined' && App.refreshAvatar) App.refreshAvatar();
      if (typeof Perfil !== 'undefined') Perfil.load().catch(() => {});
      Toast.show(_t('Foto actualizada'), 'ok');
    } catch (e) { Toast.show(e.message || _t('No se pudo subir la foto'), 'error'); }
  }

  async function removeAvatar() {
    try {
      setAvatar(await API.del('/auth/me/avatar'));
      if (typeof App !== 'undefined' && App.refreshAvatar) App.refreshAvatar();
      if (typeof Perfil !== 'undefined') Perfil.load().catch(() => {});
    } catch (e) { Toast.show(e.message || _t('No se pudo quitar la foto'), 'error'); }
  }

  /* ── Poblar datos del usuario ─────────────────────────────── */
  function render() {
    if (!me) return;
    setAvatar(me);
    document.getElementById('account-display-name').textContent  = me.name || '—';
    document.getElementById('account-display-email').textContent = me.email || '—';
    document.getElementById('account-name-input').value  = me.name || '';
    document.getElementById('account-email-input').value = me.email || '';

    const plan = (me.subscription === 'premium') ? _t('Plan Premium') : _t('Plan Free');
    document.getElementById('account-plan-badge').textContent = plan;

    const verified = document.getElementById('account-verified-badge');
    verified.classList.toggle('hidden', !me.email_verified);

    // Seguridad: cuentas de Google sin contraseña no piden la actual.
    const currentWrap = document.getElementById('account-current-pw-wrap');
    const hint = document.getElementById('account-pw-hint');
    if (me.has_password === false) {
      currentWrap.classList.add('hidden');
      hint.textContent = _t('Tu cuenta entró con Google. Aquí puedes crear una contraseña para entrar también con email.');
    } else {
      currentWrap.classList.remove('hidden');
    }
  }

  function msg(el, text, ok) {
    el.textContent = text;
    el.className = 'text-sm ' + (ok ? 'text-primary font-semibold' : 'text-error');
    if (ok) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3000);
  }

  /* ── Guardar perfil ───────────────────────────────────────── */
  async function saveProfile() {
    const out = document.getElementById('account-profile-msg');
    const name = document.getElementById('account-name-input').value.trim();
    if (name.length < 2) return msg(out, _t('El nombre debe tener al menos 2 caracteres'), false);

    const btn = document.getElementById('account-save-profile');
    btn.disabled = true;
    try {
      const updated = await API.patch('/auth/me', { name });
      me = { ...me, ...updated };
      render();
      if (typeof App !== 'undefined') App.updateCurrentUser({ name: me.name });
      SaveStatus.markClean('account-profile');
      msg(out, _t('Guardado'), true);
    } catch (e) {
      msg(out, e.message || _t('No se pudo guardar'), false);
    } finally {
      btn.disabled = false;
    }
  }

  /* ── Cambiar contraseña ───────────────────────────────────── */
  async function savePassword() {
    const out = document.getElementById('account-pw-msg');
    const current = document.getElementById('account-current-pw').value;
    const next    = document.getElementById('account-new-pw').value;
    const confirm = document.getElementById('account-confirm-pw').value;

    if (next.length < 8) return msg(out, _t('La nueva contraseña debe tener al menos 8 caracteres'), false);
    if (next !== confirm) return msg(out, _t('Las contraseñas no coinciden'), false);

    const btn = document.getElementById('account-save-pw');
    btn.disabled = true;
    try {
      await API.post('/auth/change-password', { current_password: current, new_password: next });
      document.getElementById('account-current-pw').value = '';
      document.getElementById('account-new-pw').value = '';
      document.getElementById('account-confirm-pw').value = '';
      // Si era cuenta Google sin contraseña, ahora ya tiene → pedir la actual la próxima vez.
      if (me) me.has_password = true;
      render();
      if (typeof Toast !== 'undefined') Toast.show(_t('Contraseña actualizada'), 'ok');
      msg(out, _t('Contraseña actualizada'), true);
    } catch (e) {
      msg(out, e.message || _t('No se pudo cambiar'), false);
    } finally {
      btn.disabled = false;
    }
  }

  /* ── Wiring (una sola vez) ────────────────────────────────── */
  function wire() {
    if (wired) return;
    wired = true;
    document.getElementById('account-save-profile')?.addEventListener('click', saveProfile);
    // Perfil con botón Guardar: al cambiar el nombre, la barra dice «Cambios sin
    // guardar · Guardar» (y avisa al cerrar) hasta que se guarda.
    document.getElementById('account-name-input')?.addEventListener('input', e => {
      if (me && e.target.value.trim() !== (me.name || '')) SaveStatus.markDirty('account-profile', { save: saveProfile });
      else SaveStatus.markClean('account-profile');
    });
    // Enter en el nombre = Guardar.
    document.getElementById('account-name-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveProfile(); } });
    document.getElementById('account-save-pw')?.addEventListener('click', savePassword);
    document.getElementById('account-avatar-input')?.addEventListener('change', e => { uploadAvatar(e.target.files[0]); e.target.value = ''; });
    document.getElementById('account-avatar-remove')?.addEventListener('click', removeAvatar);
  }

  /* ── Init (al navegar a una ruta account-*) ───────────────── */
  async function init(route) {
    wire();
    showSection(sectionFromRoute(route));
    // Lista «Tu perfil» al día (la entidad o la foto pudieron cambiar en otra pantalla).
    if (sectionFromRoute(route) === 'profile' && typeof Perfil !== 'undefined') Perfil.load().catch(() => {});
    // Ya cargamos /me una vez; sólo refrescamos datos la primera vez o si no hay.
    if (!me) {
      const cached = typeof App !== 'undefined' ? App.getCurrentUser() : null;
      if (cached) { me = { ...cached }; render(); }
      try {
        me = await API.get('/auth/me');
        render();
      } catch (e) {
        // Si falla, nos quedamos con lo cacheado; no bloqueamos la vista.
        console.warn('[Account] /me failed:', e.message);
      }
    } else {
      render();
    }
  }

  return { init, setAvatar };
})();
