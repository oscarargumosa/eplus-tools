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
function cookieOpts() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   30 * 24 * 60 * 60 * 1000  // 30 days
  };
}

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
      if (!user) {
        return res.status(401).json({
          ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' }
        });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
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
      const accessToken  = signToken(safeUser);
      const refreshToken = signRefreshToken(safeUser);

      res.cookie('refresh_token', refreshToken, cookieOpts());
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
      const user = await User.findOrCreateFromGoogle({
        email: payload.email,
        name:  payload.name || payload.email.split('@')[0]
      });

      const accessToken  = signToken(user);
      const refreshToken = signRefreshToken(user);

      res.cookie('refresh_token', refreshToken, cookieOpts());
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

      const accessToken = signToken(user);
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
      res.json({ ok: true, data: { message: 'Contraseña actualizada' } });
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

      const firstName = (user.name || '').trim().split(/\s+/)[0] || null;
      return res.json({ ok: true, data: { logged_in: true, first_name: firstName } });
    } catch (err) {
      console.error('[AUTH] Session status error:', err.message);
      return res.json({ ok: true, data: { logged_in: false } });
    }
  },

  /* ── POST /v1/auth/logout ──────────────────────────────────── */
  logout(_req, res) {
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.json({ ok: true, data: { message: 'Logged out' } });
  }
};

module.exports = AuthController;
