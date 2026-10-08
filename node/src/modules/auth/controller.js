const bcrypt = require('bcryptjs');
const User = require('./model');
const { signToken, signRefreshToken, verifyRefreshToken } = require('../../middleware/auth');
const subscribersModel = require('../subscribers/model');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../../utils/email');

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
// logout, oidc). Las antiguas iban con path '/': se borran al reemitir.
const REFRESH_COOKIE_PATH = '/v1/auth';
function cookieOpts() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     REFRESH_COOKIE_PATH,
    maxAge:   30 * 24 * 60 * 60 * 1000  // 30 days
  };
}

function setRefreshCookie(res, token) {
  res.clearCookie('refresh_token', { path: '/' });
  res.cookie('refresh_token', token, cookieOpts());
}

function clearRefreshCookie(res) {
  const base = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' };
  res.clearCookie('refresh_token', { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie('refresh_token', { ...base, path: '/' });
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
      const { email, password, name } = req.body;

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
          message: 'Account created. Check your email to verify your address before signing in.',
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
        return res.status(401).json({
          ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' }
        });
      }

      if (!user.email_verified) {
        return res.status(403).json({
          ok: false,
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Please verify your email before signing in. Check your inbox or request a new link.'
          }
        });
      }

      const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, subscription: user.subscription };
      const tokenUser = { ...safeUser, token_version: user.token_version || 0 };
      const accessToken  = signToken(tokenUser);
      const refreshToken = signRefreshToken(tokenUser);

      setRefreshCookie(res, refreshToken);
      _promoteWarm(safeUser);
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
        email: payload.email,
        name:  payload.name || payload.email.split('@')[0]
      });

      const accessToken  = signToken(user);
      const refreshToken = signRefreshToken(user);
      delete user.token_version;

      setRefreshCookie(res, refreshToken);
      _promoteWarm(user);
      res.json({
        ok: true,
        data: { user, access_token: accessToken }
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
          error: { code: 'INVALID_OR_EXPIRED', message: 'This verification link is invalid or has expired.' }
        });
      }
      res.json({ ok: true, data: { message: 'Email verified. You can now sign in.', email: result.email } });
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
          error: { code: 'INVALID_OR_EXPIRED', message: 'This reset link is invalid or has expired.' }
        });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await User.updatePassword(result.userId, passwordHash);

      // If they reset their password, treat the email as verified.
      await User.markEmailVerified(result.userId);
      // Cierra todas las sesiones abiertas (p. ej. las de quien robó la cuenta).
      await User.bumpTokenVersion(result.userId);

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
        return res.status(401).json({
          ok: false, error: { code: 'UNAUTHORIZED', message: 'No refresh token' }
        });
      }

      let payload;
      try {
        payload = verifyRefreshToken(token);
      } catch {
        return res.status(401).json({
          ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' }
        });
      }

      const user = await User.findById(payload.sub);
      if (!user) {
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

      const accessToken = signToken({ ...user, token_version: tv });
      res.json({ ok: true, data: { access_token: accessToken } });
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

      // Cierra las demás sesiones; esta sigue con tokens nuevos.
      const tv   = await User.bumpTokenVersion(req.user.id);
      const user = await User.findById(req.user.id);
      const tokenUser = { ...user, token_version: tv };
      setRefreshCookie(res, signRefreshToken(tokenUser));
      res.json({ ok: true, data: { message: 'Contraseña actualizada', access_token: signToken(tokenUser) } });
    } catch (err) {
      console.error('[AUTH] Change password error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo cambiar la contraseña' } });
    }
  },

  /* ── GET /v1/auth/session-status ───────────────────────────── */
  /* Public, cookie-only check used by eufundingschool.com (WP) to
   * decide whether to render "Iniciar sesión" or "Mi cuenta · Name"
   * in the menu. Never throws auth errors — always 200 with data. */
  async sessionStatus(req, res) {
    try {
      const token = req.cookies?.refresh_token;
      if (!token) return res.json({ ok: true, data: { logged_in: false } });

      let payload;
      try { payload = verifyRefreshToken(token); }
      catch { return res.json({ ok: true, data: { logged_in: false } }); }

      const user = await User.findById(payload.sub);
      if (!user) return res.json({ ok: true, data: { logged_in: false } });
      if ((payload.tv || 0) !== await User.getTokenVersion(user.id)) {
        return res.json({ ok: true, data: { logged_in: false } });
      }

      const firstName = (user.name || '').trim().split(/\s+/)[0] || null;
      return res.json({ ok: true, data: { logged_in: true, first_name: firstName } });
    } catch (err) {
      console.error('[AUTH] Session status error:', err.message);
      return res.json({ ok: true, data: { logged_in: false } });
    }
  },

  /* ── POST /v1/auth/logout ──────────────────────────────────── */
  logout(_req, res) {
    clearRefreshCookie(res);
    res.json({ ok: true, data: { message: 'Logged out' } });
  },

  /* ── POST /v1/auth/logout-all ──────────────────────────────── */
  /* Cierra TODAS las sesiones del usuario (todos los dispositivos). */
  async logoutAll(req, res) {
    try {
      await User.bumpTokenVersion(req.user.id);
      clearRefreshCookie(res);
      res.json({ ok: true, data: { message: 'Todas las sesiones cerradas' } });
    } catch (err) {
      console.error('[AUTH] Logout-all error:', err.message);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudieron cerrar las sesiones' } });
    }
  }
};

module.exports = AuthController;
