const bcrypt = require('bcryptjs');
const User = require('./model');
const { signToken, signRefreshToken, verifyRefreshToken, getUserAreas } = require('../../middleware/auth');
const accessModel = require('../access/model');
const subscribersModel = require('../subscribers/model');
const { sendVerificationEmail, sendPasswordResetEmail, onNewUser, sendAccountDeletedEmail } = require('../../utils/email');
const AccountData = require('./account-data');
const { audit } = require('../../utils/audit');
const { setSessionHint, clearSessionHint } = require('../../middleware/guestGate');
const Sessions = require('./sessions');

const SALT_ROUNDS = 12;

/** Fire-and-forget: promote newsletter subscriber to 'warm' on signup/login.
 *  Never block or fail the auth flow if this errors. */
function _promoteWarm(user) {
  if (!user?.email) return;
  subscribersModel
    .promoteByEmail(user.email, 'warm', user.id || null)
    .catch(err => console.warn('[subscribers] promote warm failed:', err.message));
}

/* ── Cookie options ──────────────────────────────────────────── */
// La cookie de refresco solo viaja a /v1/auth (refresh, session-status,
// logout). Las antiguas iban con path '/': se borran al reemitir.
const REFRESH_COOKIE_PATH = '/v1/auth';
/* Áreas beta del usuario (utils/areas.js) y las recién concedidas cuyo
   aviso «Ya tienes acceso» aún no ha visto. Si falla, sin áreas: la API
   sigue protegiendo igual. */
async function withAreas(user) {
  try {
    user.areas = await getUserAreas(user.id, user.role);
    user.areas_new = user.role === 'admin' ? [] : await accessModel.unseenAreas(user.id);
  } catch (e) {
    console.warn('[AUTH] áreas no disponibles:', e.message);
    user.areas = user.areas || [];
    user.areas_new = [];
  }
  return user;
}

function cookieOpts() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     REFRESH_COOKIE_PATH,
    maxAge:   30 * 24 * 60 * 60 * 1000  // 30 days
  };
}

// Junto a la de refresco va la cookie-pista `studio_sesion` (Path=/), con la
// que el servidor decide si «/» es la landing o la app (middleware/guestGate).
function setRefreshCookie(res, token) {
  res.clearCookie('refresh_token', { path: '/' });
  res.cookie('refresh_token', token, cookieOpts());
  setSessionHint(res);
}

/* Abre una sesión en servidor (user_sessions), pone la cookie de refresco
   y devuelve el access token ligado a ella. */
async function startSession(req, res, tokenUser) {
  const s = await Sessions.create(tokenUser.id, req);
  setRefreshCookie(res, signRefreshToken(tokenUser, s));
  return signToken(tokenUser, s.sid);
}

function clearRefreshCookie(res) {
  const base = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' };
  res.clearCookie('refresh_token', { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie('refresh_token', { ...base, path: '/' });
  clearSessionHint(res);
}

// Hash ficticio (coste 12): el login tarda lo mismo exista o no el email.
const DUMMY_HASH = '$2a$12$xA8k87fuxaCFXKimDvOxDucEmjc6y7vW3zO2U8Hu7H3oPWdkxvWxC';

function validatePassword(password) {
  if (!password || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe incluir al menos una mayúscula y un número';
  }
  return null;
}

const AuthController = {

  /* ── POST /v1/auth/register ────────────────────────────────── */
  async register(req, res) {
    try {
      const { email, password, name, acepta_privacidad } = req.body;

      // Casilla obligatoria «He leído y acepta la política de privacidad».
      if (acepta_privacidad !== true) {
        return res.status(400).json({
          ok: false, error: { code: 'PRIVACY_REQUIRED', message: 'Para crear la cuenta tienes que aceptar la política de privacidad.' }
        });
      }

      const pwErr = validatePassword(password);
      if (pwErr) return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: pwErr } });

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          ok: false, error: { code: 'VALIDATION', message: 'Email no válido' }
        });
      }

      const existing = await User.findByEmail(email);
      if (existing) {
        return res.status(409).json({
          ok: false, error: { code: 'CONFLICT', message: 'Ya existe una cuenta con este email' }
        });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await User.create({ email, passwordHash, name });
      audit(req, 'auth.register', { actor: user, targetType: 'user', targetId: user.id });

      // Generate verification token & send email (do NOT auto-login)
      const token = await User.createVerificationToken(user.id);
      const result = await sendVerificationEmail({ to: user.email, name: user.name, token });
      if (!result.ok && !result.mock) {
        console.error('[AUTH] Verification email failed:', result.error);
      }

      _promoteWarm(user);
      res.status(201).json({
        ok: true,
        data: {
          message: 'Cuenta creada. Te hemos enviado un correo para confirmar tu dirección antes de entrar.',
          email: user.email,
          requires_verification: true
        }
      });
    } catch (err) {
      console.error('[AUTH] Register error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Registration failed' } });
    }
  },

  /* ── POST /v1/auth/login ───────────────────────────────────── */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      const user = await User.findByEmail(email);
      // Siempre un bcrypt (contra el hash ficticio si no hay usuario o no tiene
      // contraseña) para no revelar por tiempo qué emails existen.
      const hash  = (user && user.password_hash) ? user.password_hash : DUMMY_HASH;
      const valid = await bcrypt.compare(String(password), hash);
      if (!user || !user.password_hash || !valid) {
        audit(req, 'auth.login.failed', user
          ? { actor: user, targetType: 'user', targetId: user.id, meta: { reason: 'bad_password' } }
          : { actor: { email }, meta: { reason: 'unknown_user' } });
        return res.status(401).json({
          ok: false, error: { code: 'UNAUTHORIZED', message: 'Email o contraseña incorrectos' }
        });
      }

      if (!user.email_verified) {
        return res.status(403).json({
          ok: false,
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Confirma tu email antes de entrar. Revisa tu bandeja o pide un enlace nuevo.'
          }
        });
      }

      const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, subscription: user.subscription };
      const tokenUser = { ...safeUser, token_version: user.token_version || 0 };
      const accessToken = await startSession(req, res, tokenUser);
      _promoteWarm(safeUser);
      audit(req, 'auth.login', { actor: safeUser, targetType: 'user', targetId: safeUser.id, meta: { method: 'password' } });
      await withAreas(safeUser);
      res.json({
        ok: true,
        data: { user: safeUser, access_token: accessToken }
      });
    } catch (err) {
      console.error('[AUTH] Login error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Login failed' } });
    }
  },

  /* ── POST /v1/auth/google ──────────────────────────────────── */
  async google(req, res) {
    try {
      const { credential } = req.body;
      if (!credential) {
        return res.status(400).json({
          ok: false, error: { code: 'BAD_REQUEST', message: 'Google credential is required' }
        });
      }

      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

      const ticket = await client.verifyIdToken({
        idToken:  credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });

      const payload = ticket.getPayload();
      // Solo se enlaza/crea cuenta por email si Google lo da por verificado.
      if (!payload || !payload.email || payload.email_verified !== true) {
        return res.status(401).json({
          ok: false, error: { code: 'EMAIL_NOT_VERIFIED', message: 'Google no ha verificado este email' }
        });
      }
      const user = await User.findOrCreateFromGoogle({
        email:   payload.email,
        name:    payload.name || payload.email.split('@')[0],
        picture: payload.picture || null
      });

      const accessToken = await startSession(req, res, user);
      delete user.token_version;
      _promoteWarm(user);
      audit(req, 'auth.login', { actor: user, targetType: 'user', targetId: user.id, meta: { method: 'google' } });
      // Alta nueva: correo de bienvenida + aviso al dueño; la SPA enseña el mensaje con `created`.
      const created = !!user.created;
      delete user.created;
      if (created) onNewUser(user, 'Google');
      await withAreas(user);
      res.json({
        ok: true,
        data: { user, access_token: accessToken, created }
      });
    } catch (err) {
      console.error('[AUTH] Google login error:', err.message);
      res.status(401).json({
        ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid Google credential' }
      });
    }
  },

  /* ── GET /v1/auth/verify-email?token=… ─────────────────────── */
  async verifyEmail(req, res) {
    try {
      const token = req.query.token || req.body?.token;
      if (!token) return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Token required' } });

      const result = await User.consumeVerificationToken(String(token));
      if (!result) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_OR_EXPIRED', message: 'Este enlace de confirmación no es válido o ha caducado.' }
        });
      }
      // Primera verificación = alta completa: bienvenida a la persona + aviso al dueño.
      if (result.firstTime) onNewUser({ id: result.userId, email: result.email, name: result.name }, 'Registro propio');
      res.json({ ok: true, data: { message: 'Email confirmado. Ya puedes entrar.', email: result.email, first_time: !!result.firstTime } });
    } catch (err) {
      console.error('[AUTH] Verify email error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Verification failed' } });
    }
  },

  /* ── POST /v1/auth/resend-verification ─────────────────────── */
  async resendVerification(req, res) {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Email required' } });

      const user = await User.findByEmail(email);
      // Always respond with a generic ok to avoid leaking which emails exist
      if (user && !user.email_verified) {
        const token = await User.createVerificationToken(user.id);
        const result = await sendVerificationEmail({ to: user.email, name: user.name, token });
        if (!result.ok && !result.mock) console.error('[AUTH] Resend verification failed:', result.error);
      }
      res.json({ ok: true, data: { message: 'If an unverified account exists, a new link has been sent.' } });
    } catch (err) {
      console.error('[AUTH] Resend verification error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Resend failed' } });
    }
  },

  /* ── POST /v1/auth/forgot-password ─────────────────────────── */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Email required' } });

      const user = await User.findByEmail(email);
      // Always respond ok (avoid email enumeration)
      if (user) {
        const token = await User.createPasswordResetToken(user.id);
        const result = await sendPasswordResetEmail({ to: user.email, name: user.name, token });
        if (!result.ok && !result.mock) console.error('[AUTH] Reset email failed:', result.error);
      }
      res.json({ ok: true, data: { message: 'If an account exists with that email, a reset link has been sent.' } });
    } catch (err) {
      console.error('[AUTH] Forgot password error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Request failed' } });
    }
  },

  /* ── POST /v1/auth/reset-password ──────────────────────────── */
  async resetPassword(req, res) {
    try {
      const { token, password } = req.body || {};
      if (!token) return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Token required' } });

      const pwErr = validatePassword(password);
      if (pwErr) return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: pwErr } });

      const result = await User.consumePasswordResetToken(String(token));
      if (!result) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_OR_EXPIRED', message: 'Este enlace para cambiar la contraseña no es válido o ha caducado.' }
        });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await User.updatePassword(result.userId, passwordHash);

      // If they reset their password, treat the email as verified.
      // Si la cuenta no estaba verificada, el alta se completa aquí: bienvenida + aviso.
      if (await User.markEmailVerified(result.userId)) {
        const u = await User.findById(result.userId);
        if (u) onNewUser(u, 'Registro propio');
      }
      // Cierra todas las sesiones abiertas (p. ej. las de quien robó la cuenta).
      await User.bumpTokenVersion(result.userId);
      await Sessions.revokeAll(result.userId, 'password');
      audit(req, 'auth.password.reset', { actor: { id: result.userId }, targetType: 'user', targetId: result.userId });

      res.json({ ok: true, data: { message: 'Password updated. You can now sign in.' } });
    } catch (err) {
      console.error('[AUTH] Reset password error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Reset failed' } });
    }
  },

  /* ── POST /v1/auth/refresh ─────────────────────────────────── */
  async refresh(req, res) {
    try {
      const token = req.cookies?.refresh_token;
      if (!token) {
        clearSessionHint(res);
        return res.status(401).json({
          ok: false, error: { code: 'UNAUTHORIZED', message: 'No refresh token' }
        });
      }

      let payload;
      try {
        payload = verifyRefreshToken(token);
      } catch {
        clearRefreshCookie(res);
        return res.status(401).json({
          ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' }
        });
      }

      const user = await User.findById(payload.sub);
      if (!user) {
        clearRefreshCookie(res);
        return res.status(401).json({
          ok: false, error: { code: 'UNAUTHORIZED', message: 'User not found' }
        });
      }

      // Sesión revocada (logout-all o cambio de contraseña posterior al token)
      const tv = await User.getTokenVersion(user.id);
      if ((payload.tv || 0) !== tv) {
        clearRefreshCookie(res);
        return res.status(401).json({
          ok: false, error: { code: 'TOKEN_REVOKED', message: 'Session revoked' }
        });
      }

      // Rotación: el refresh usado deja de valer y se emite otro. Uno ya
      // rotado que vuelve a llegar = robado: cae toda la sesión.
      const r = payload.sid
        ? await Sessions.rotate(payload)
        : await Sessions.adoptLegacy(user.id, token, req);   // refresh antiguo sin jti: una vez
      if (r.status === 'reuse') {
        audit(req, 'auth.refresh.reuse', { actor: { id: user.id }, targetType: 'session', targetId: payload.sid || null });
      }
      if (r.status !== 'ok' && r.status !== 'grace') {
        clearRefreshCookie(res);
        return res.status(401).json({
          ok: false, error: { code: 'TOKEN_REVOKED', message: 'Session revoked' }
        });
      }

      const tokenUser = { ...user, token_version: tv };
      setRefreshCookie(res, signRefreshToken(tokenUser, r));
      res.json({ ok: true, data: { access_token: signToken(tokenUser, r.sid) } });
    } catch (err) {
      console.error('[AUTH] Refresh error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Token refresh failed' } });
    }
  },

  /* ── GET /v1/auth/me ───────────────────────────────────────── */
  async me(req, res) {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          ok: false, error: { code: 'NOT_FOUND', message: 'User not found' }
        });
      }
      // Tells the account UI whether to ask for the current password on change
      // (Google-only accounts have no password yet).
      const hash = await User.getPasswordHash(req.user.id);
      user.has_password = !!(hash && hash.length);
      await withAreas(user);
      // Círculo de «Mi cuenta»: foto → logo de su entidad → iniciales.
      Object.assign(user, await User.getAvatar(user.id, user.name));
      res.json({ ok: true, data: user });
    } catch (err) {
      console.error('[AUTH] Me error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get user' } });
    }
  },

  /* ── PATCH /v1/auth/me ─────────────────────────────────────── */
  /* Self-service profile update. Currently only the display name. */
  async updateMe(req, res) {
    try {
      const { name } = req.body || {};
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'El nombre debe tener al menos 2 caracteres' } });
      }
      if (name.trim().length > 120) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'El nombre es demasiado largo' } });
      }
      const user = await User.updateName(req.user.id, name);
      res.json({ ok: true, data: user });
    } catch (err) {
      console.error('[AUTH] Update me error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo actualizar el perfil' } });
    }
  },

  /* ── POST /v1/auth/change-password ─────────────────────────── */
  /* Authenticated password change. Requires the current password unless
   * the account has none yet (Google-only), in which case it just sets one. */
  async changePassword(req, res) {
    try {
      const { current_password, new_password } = req.body || {};

      const pwErr = validatePassword(new_password);
      if (pwErr) return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: pwErr } });

      const currentHash = await User.getPasswordHash(req.user.id);
      const hasPassword = !!(currentHash && currentHash.length);

      if (hasPassword) {
        if (!current_password) {
          return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'Introduce tu contraseña actual' } });
        }
        const valid = await bcrypt.compare(current_password, currentHash);
        if (!valid) {
          return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'La contraseña actual no es correcta' } });
        }
      }

      const passwordHash = await bcrypt.hash(new_password, SALT_ROUNDS);
      await User.updatePassword(req.user.id, passwordHash);

      // Cierra todas las sesiones; esta sigue con una sesión nueva.
      const tv   = await User.bumpTokenVersion(req.user.id);
      await Sessions.revokeAll(req.user.id, 'password');
      const user = await User.findById(req.user.id);
      const accessToken = await startSession(req, res, { ...user, token_version: tv });
      audit(req, 'auth.password.change', { targetType: 'user', targetId: req.user.id });
      res.json({ ok: true, data: { message: 'Contraseña actualizada', access_token: accessToken } });
    } catch (err) {
      console.error('[AUTH] Change password error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo cambiar la contraseña' } });
    }
  },

  /* ── GET /v1/auth/session-status ───────────────────────────── */
  /* Public, cookie-only check used by the public pages (/mision,
   * /recursos/…) to decide whether to render "Iniciar sesión" or
   * "Mi cuenta · Name" in the menu. Never throws auth errors — always 200 with data. */
  async sessionStatus(req, res) {
    try {
      // También deja la cookie-pista coherente: la landing la consulta para
      // saltar a la app si quien llega ya tiene sesión (p. ej. de antes del cierre).
      const out = () => { clearSessionHint(res); return res.json({ ok: true, data: { logged_in: false } }); };
      const token = req.cookies?.refresh_token;
      if (!token) return out();

      let payload;
      try { payload = verifyRefreshToken(token); }
      catch { return out(); }

      const user = await User.findById(payload.sub);
      if (!user) return out();
      if ((payload.tv || 0) !== await User.getTokenVersion(user.id)) return out();
      if (!await Sessions.peek(payload, token)) return out();

      setSessionHint(res);
      const firstName = (user.name || '').trim().split(/\s+/)[0] || null;
      // Áreas beta: el menú de las páginas públicas marca «Beta» lo cerrado.
      let areas = [];
      try { areas = await getUserAreas(user.id, user.role); } catch { /* sin áreas: todo marcado */ }
      const av = await User.getAvatar(user.id, user.name).catch(() => ({}));
      return res.json({ ok: true, data: {
        logged_in: true, first_name: firstName, areas,
        avatar_url: av.avatar_url || null, avatar_source: av.avatar_source || 'initials',
        initials: av.initials || null,
      } });
    } catch (err) {
      console.error('[AUTH] Session status error:', err.message);
      return res.json({ ok: true, data: { logged_in: false } });
    }
  },

  /* ── POST/DELETE /v1/auth/me/avatar — foto de perfil ─────────── */
  async uploadAvatar(req, res) {
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
      const prev = await User.getAvatarUrl(req.user.id);
      await User.setAvatarUrl(req.user.id, '/uploads/avatars/' + req.file.filename);
      User.removeAvatarFile(prev);
      const user = await User.findById(req.user.id);
      res.json({ ok: true, data: await User.getAvatar(req.user.id, user && user.name) });
    } catch (err) {
      console.error('[AUTH] Avatar upload error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo guardar la foto' } });
    }
  },

  async deleteAvatar(req, res) {
    try {
      const prev = await User.getAvatarUrl(req.user.id);
      await User.setAvatarUrl(req.user.id, null);
      User.removeAvatarFile(prev);
      const user = await User.findById(req.user.id);
      res.json({ ok: true, data: await User.getAvatar(req.user.id, user && user.name) });
    } catch (err) {
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo quitar la foto' } });
    }
  },

  /* ── GET /v1/auth/me/export — «Descargar mis datos» (RGPD) ─── */
  async exportMe(req, res) {
    try {
      const data = await AccountData.exportData(req.user.id);
      audit(req, 'account.export', { targetType: 'user', targetId: req.user.id });
      const day = new Date().toISOString().slice(0, 10);
      res.set('Cache-Control', 'no-store');
      res.set('Content-Disposition', `attachment; filename="mis-datos-eu-funding-studio-${day}.json"`);
      res.type('application/json').send(JSON.stringify({ ok: true, data }, null, 2));
    } catch (err) {
      console.error('[AUTH] Export error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo preparar la copia de tus datos' } });
    }
  },

  /* ── POST /v1/auth/me/delete — «Eliminar mi cuenta» (RGPD) ──── */
  /* Pide la contraseña (o, en cuentas solo de Google, que escriba su email)
     y la confirmación expresa. Un admin no puede eliminarse. */
  async deleteMe(req, res) {
    try {
      const { password, email, confirm } = req.body || {};
      const fail = (status, code, message) => res.status(status).json({ ok: false, error: { code, message } });
      if (confirm !== true) return fail(400, 'CONFIRM_REQUIRED', 'Marca la casilla para confirmar que quieres eliminar la cuenta.');

      const user = await User.findById(req.user.id);
      if (!user) return fail(404, 'NOT_FOUND', 'Cuenta no encontrada');
      if (user.role === 'admin') {
        return fail(403, 'ADMIN_CANNOT_DELETE', 'Una cuenta de administración no se puede eliminar desde aquí. Pide antes a otra persona administradora que te quite el rol.');
      }
      const hash = await User.getPasswordHash(user.id);
      if (hash && hash.length) {
        if (!password || !(await bcrypt.compare(String(password), hash))) {
          return fail(403, 'BAD_PASSWORD', 'La contraseña no es correcta.');
        }
      } else if (String(email || '').trim().toLowerCase() !== String(user.email).toLowerCase()) {
        return fail(400, 'EMAIL_MISMATCH', 'Escribe exactamente el email de tu cuenta.');
      }

      const result = await AccountData.deleteAccount(user.id);
      // Las sesiones se van con la cuenta (FK); se vacían las cachés de este proceso.
      await Sessions.revokeAll(user.id, 'deleted');
      require('../../middleware/auth').invalidateUserState(user.id);
      clearRefreshCookie(res);
      // Aviso por correo (sin clave de Resend, en desarrollo, solo se anota en el log).
      sendAccountDeletedEmail({ to: result.user.email, name: result.user.name })
        .then(r => { if (r && r.ok === false) console.warn('[AUTH] correo de baja no enviado:', r.error); })
        .catch(e => console.warn('[AUTH] correo de baja no enviado:', e.message));
      res.json({ ok: true, data: { message: 'Tu cuenta se ha eliminado.' } });
    } catch (err) {
      if (err && err.status && err.status < 500) {
        return res.status(err.status).json({ ok: false, error: { code: err.code || 'ERROR', message: err.message } });
      }
      console.error('[AUTH] Delete account error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo eliminar la cuenta. No se ha borrado nada; inténtalo de nuevo.' } });
    }
  },

  /* ── POST /v1/auth/logout ──────────────────────────────────── */
  /* Revoca en servidor la sesión de esta cookie: el refresh deja de valer
     aunque alguien lo hubiera copiado, y el access ligado cae en ≤30 s. */
  async logout(req, res) {
    const token = req.cookies?.refresh_token;
    if (token) {
      try {
        await Sessions.revokeByToken(verifyRefreshToken(token), token);
      } catch (err) {
        // Cookie caducada o falsa: no hay sesión que revocar.
        if (!/JsonWebTokenError|TokenExpiredError|NotBeforeError/.test(err && err.name)) console.error('[AUTH] Logout error:', err.message);
      }
    }
    clearRefreshCookie(res);
    res.json({ ok: true, data: { message: 'Logged out' } });
  },

  /* ── POST /v1/auth/logout-all ──────────────────────────────── */
  /* Cierra TODAS las sesiones del usuario (todos los dispositivos). */
  async logoutAll(req, res) {
    try {
      await User.bumpTokenVersion(req.user.id);
      await Sessions.revokeAll(req.user.id, 'logout_all');
      clearRefreshCookie(res);
      audit(req, 'auth.logout_all', { targetType: 'user', targetId: req.user.id });
      res.json({ ok: true, data: { message: 'Todas las sesiones cerradas' } });
    } catch (err) {
      console.error('[AUTH] Logout-all error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudieron cerrar las sesiones' } });
    }
  }
};

module.exports = AuthController;
