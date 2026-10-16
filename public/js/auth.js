/* ═══════════════════════════════════════════════════════════════
   Auth — Login, Register, Google OAuth, Verify, Reset
   ═══════════════════════════════════════════════════════════════ */

const Auth = (() => {

  let pendingResetToken = null;

  async function login(e) {
    e.preventDefault();
    clearError('login');
    setLoading('btn-login', true);
    try {
      const email    = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const data = await API.post('/auth/login', { email, password }, { noAuth: true });
      API.setToken(data.access_token);
      API.startAutoRefresh();
      App.onAuth(data.user);
    } catch (err) {
      // Special UX when email isn't verified — offer resend
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        const email = document.getElementById('login-email').value;
        App.showAuthInfo({
          icon:  '✉️',
          title: 'Verifica tu email',
          body:  'Te hemos enviado un enlace de verificación. Revisa tu bandeja de entrada (y spam) para activar tu cuenta antes de iniciar sesión.',
          actions: [
            { label: 'Reenviar email', primary: true,  onClick: () => resendVerification(email) },
            { label: '← Volver al login',                  onClick: () => App.showAuthTab('login') }
          ]
        });
        return;
      }
      showError('login', err.message || 'Error al iniciar sesión');
    } finally {
      setLoading('btn-login', false);
    }
  }

  async function register(e) {
    e.preventDefault();
    clearError('register');
    setLoading('btn-register', true);
    try {
      const name     = document.getElementById('reg-name').value;
      const email    = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      if (window.PasswordFields && !PasswordFields.matches(document.getElementById('reg-password-confirm'))) {
        showError('register', 'Las dos contraseñas no coinciden.');
        return;
      }
      const acepta_privacidad = !!document.getElementById('reg-privacy')?.checked;
      if (!acepta_privacidad) {
        showError('register', 'Para crear la cuenta tienes que marcar «He leído y acepto la política de privacidad».');
        document.getElementById('reg-privacy')?.focus();
        return;
      }
      const data = await API.post('/auth/register', { name, email, password, acepta_privacidad }, { noAuth: true });
      // No auto-login: registration now requires email verification.
      App.showAuthInfo({
        icon:  '📩',
        title: 'Revisa tu correo para confirmar tu cuenta',
        body:  `Te hemos enviado un correo a ${data.email || email} para confirmar tu dirección. Abre el enlace del correo para activar tu cuenta (si no lo ves, mira en spam).`,
        actions: [
          { label: 'Reenviar email', primary: true,  onClick: () => resendVerification(data.email || email) },
          { label: 'Ir al login',                         onClick: () => App.showAuthTab('login') }
        ]
      });
    } catch (err) {
      showError('register', err.message || 'Error al registrarse');
    } finally {
      setLoading('btn-register', false);
    }
  }

  async function resendVerification(email) {
    if (!email) return Toast.show('Introduce tu email primero', 'err');
    try {
      await API.post('/auth/resend-verification', { email }, { noAuth: true });
      Toast.show('Si la cuenta existe y no estaba verificada, te enviamos un nuevo enlace.', 'ok');
    } catch (err) {
      Toast.show(err.message || 'No se pudo reenviar', 'err');
    }
  }

  async function forgotPassword(e) {
    e.preventDefault();
    clearError('forgot');
    setLoading('btn-forgot', true);
    try {
      const email = document.getElementById('forgot-email').value;
      await API.post('/auth/forgot-password', { email }, { noAuth: true });
      App.showAuthInfo({
        icon:  '🔐',
        title: 'Revisa tu correo',
        body:  `Si existe una cuenta con ${email}, te hemos enviado un enlace para restablecer la contraseña. El enlace expira en 1 hora.`,
        actions: [
          { label: 'Volver al login', primary: true, onClick: () => App.showAuthTab('login') }
        ]
      });
    } catch (err) {
      showError('forgot', err.message || 'No se pudo enviar');
    } finally {
      setLoading('btn-forgot', false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    clearError('reset');
    setLoading('btn-reset', true);
    try {
      const password = document.getElementById('reset-password').value;
      if (window.PasswordFields && !PasswordFields.matches(document.getElementById('reset-password-confirm'))) {
        showError('reset', 'Las dos contraseñas no coinciden.');
        return;
      }
      if (!pendingResetToken) {
        showError('reset', 'Token no encontrado. Vuelve a solicitar un enlace de recuperación.');
        return;
      }
      await API.post('/auth/reset-password', { token: pendingResetToken, password }, { noAuth: true });
      // Clean URL after success
      window.history.replaceState({}, '', '/');
      pendingResetToken = null;
      App.showAuthInfo({
        icon:  '✅',
        title: 'Contraseña actualizada',
        body:  'Ya puedes iniciar sesión con tu nueva contraseña.',
        actions: [
          { label: 'Ir al login', primary: true, onClick: () => App.showAuthTab('login') }
        ]
      });
    } catch (err) {
      showError('reset', err.message || 'No se pudo cambiar la contraseña');
    } finally {
      setLoading('btn-reset', false);
    }
  }

  function handleResetPasswordUrl(token) {
    pendingResetToken = token;
    App.showAuthTab('reset');
  }

  async function handleVerifyEmailUrl(token) {
    try {
      const res = await fetch(`/v1/auth/verify-email?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      window.history.replaceState({}, '', '/');
      if (json.ok) {
        // Primera confirmación = alta completa: el servidor ya ha enviado la bienvenida.
        App.showAuthInfo({
          icon:  '✅',
          title: 'Email confirmado',
          body:  json.data?.first_time
            ? 'Tu cuenta está confirmada. Te hemos enviado un correo de bienvenida. ¡Nos vemos dentro!'
            : 'Tu cuenta ya estaba activa. Ya puedes entrar.',
          actions: [
            { label: 'Entrar', primary: true, onClick: () => App.showAuthTab('login') }
          ]
        });
      } else {
        App.showAuthInfo({
          icon:  '⚠️',
          title: 'Enlace inválido o caducado',
          body:  json.error?.message || 'Este enlace de verificación no es válido o ha caducado.',
          actions: [
            { label: 'Ir al login', primary: true, onClick: () => App.showAuthTab('login') }
          ]
        });
      }
    } catch {
      App.showAuthInfo({
        icon:  '⚠️',
        title: 'No se pudo verificar',
        body:  'Hubo un problema al validar tu enlace. Inténtalo de nuevo más tarde.',
        actions: [
          { label: 'Ir al login', primary: true, onClick: () => App.showAuthTab('login') }
        ]
      });
    }
  }

  async function handleGoogleResponse(response) {
    try {
      const data = await API.post('/auth/google', { credential: response.credential }, { noAuth: true });
      API.setToken(data.access_token);
      API.startAutoRefresh();
      App.onAuth(data.user);
      if (data.created) App.showWelcome();   // alta nueva: mismo mensaje que el registro propio
    } catch (err) {
      Toast.show(err.message || 'Error al iniciar sesión con Google', 'err');
    }
  }

  async function logout() {
    API.stopAutoRefresh();
    // Lo que estuviera esperando a guardarse se envía antes de cerrar la sesión.
    if (window.SaveStatus) { try { await SaveStatus.flush(); } catch { /* el indicador ya avisa */ } }
    try { await API.post('/auth/logout'); } catch { /* ignore */ }
    API.clearToken();
    App.onLogout();
  }

  async function tryRestore() {
    const refreshed = await API.tryRefresh();
    if (!refreshed) return false;
    try {
      const user = await API.get('/auth/me');
      API.startAutoRefresh();
      App.onAuth(user);
      return true;
    } catch {
      API.clearToken();
      return false;
    }
  }

  /* ── UI Helpers ────────────────────────────────────────────── */
  function errorEl(form) {
    return document.getElementById(`${form === 'register' ? 'reg' : form}-error`);
  }
  function showError(form, msg) {
    const el = errorEl(form);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function clearError(form) {
    const el = errorEl(form);
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
  }

  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      btn.dataset.text = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span>';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.text || btn.textContent;
      btn.disabled = false;
    }
  }

  return {
    login, register, handleGoogleResponse, logout, tryRestore,
    forgotPassword, resetPassword,
    handleVerifyEmailUrl, handleResetPasswordUrl,
    resendVerification
  };
})();

// Expose globally for Google SDK callback + HTML onclick
window.Auth = Auth;
