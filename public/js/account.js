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

  /* ── Poblar datos del usuario ─────────────────────────────── */
  function render() {
    if (!me) return;
    document.getElementById('account-avatar').textContent      = initials(me.name);
    document.getElementById('account-display-name').textContent  = me.name || '—';
    document.getElementById('account-display-email').textContent = me.email || '—';
    document.getElementById('account-name-input').value  = me.name || '';
    document.getElementById('account-email-input').value = me.email || '';

    const plan = (me.subscription === 'premium') ? 'Plan Premium' : 'Plan Free';
    document.getElementById('account-plan-badge').textContent = plan;

    const verified = document.getElementById('account-verified-badge');
    verified.classList.toggle('hidden', !me.email_verified);

    // Seguridad: cuentas de Google sin contraseña no piden la actual.
    const currentWrap = document.getElementById('account-current-pw-wrap');
    const hint = document.getElementById('account-pw-hint');
    if (me.has_password === false) {
      currentWrap.classList.add('hidden');
      hint.textContent = 'Tu cuenta entró con Google. Aquí puedes crear una contraseña para entrar también con email.';
    } else {
      currentWrap.classList.remove('hidden');
    }
  }

  function msg(el, text, ok) {
    el.textContent = text;
    el.className = 'text-sm ' + (ok ? 'text-green-600' : 'text-red-600');
    if (ok) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3000);
  }

  /* ── Guardar perfil ───────────────────────────────────────── */
  async function saveProfile() {
    const out = document.getElementById('account-profile-msg');
    const name = document.getElementById('account-name-input').value.trim();
    if (name.length < 2) return msg(out, 'El nombre debe tener al menos 2 caracteres', false);

    const btn = document.getElementById('account-save-profile');
    btn.disabled = true;
    try {
      const updated = await API.patch('/auth/me', { name });
      me = { ...me, ...updated };
      render();
      if (typeof App !== 'undefined') App.updateCurrentUser({ name: me.name });
      if (typeof Toast !== 'undefined') Toast.show('Perfil actualizado', 'ok');
      msg(out, 'Guardado', true);
    } catch (e) {
      msg(out, e.message || 'No se pudo guardar', false);
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

    if (next.length < 8) return msg(out, 'La nueva contraseña debe tener al menos 8 caracteres', false);
    if (next !== confirm) return msg(out, 'Las contraseñas no coinciden', false);

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
      if (typeof Toast !== 'undefined') Toast.show('Contraseña actualizada', 'ok');
      msg(out, 'Contraseña actualizada', true);
    } catch (e) {
      msg(out, e.message || 'No se pudo cambiar', false);
    } finally {
      btn.disabled = false;
    }
  }

  /* ── Wiring (una sola vez) ────────────────────────────────── */
  function wire() {
    if (wired) return;
    wired = true;
    document.getElementById('account-save-profile')?.addEventListener('click', saveProfile);
    document.getElementById('account-save-pw')?.addEventListener('click', savePassword);
  }

  /* ── Init (al navegar a una ruta account-*) ───────────────── */
  async function init(route) {
    wire();
    showSection(sectionFromRoute(route));
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

  return { init };
})();
