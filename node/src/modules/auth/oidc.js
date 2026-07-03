/* ═══════════════════════════════════════════════════════════════
   OIDC login contra Authentik (login único del ecosistema).
   Authorization Code + PKCE. Authentik AUTENTICA; nosotros seguimos
   emitiendo nuestro propio refresh_token/JWT, así que requireAuth,
   session-status, la SPA y la barra de WordPress NO cambian.
   ═══════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const User   = require('./model');
const { signRefreshToken, SECRET } = require('../../middleware/auth');

const ISSUER        = () => (process.env.OIDC_ISSUER || '').replace(/\/?$/, '/'); // trailing slash
const CLIENT_ID     = () => process.env.OIDC_CLIENT_ID || '';
const CLIENT_SECRET = () => process.env.OIDC_CLIENT_SECRET || '';
const REDIRECT_URI  = () => process.env.OIDC_REDIRECT_URI
  || ((process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '') + '/v1/auth/oidc/callback');

function configured() { return !!(ISSUER() && CLIENT_ID() && CLIENT_SECRET()); }

let _meta = null;
async function discover() {
  if (_meta) return _meta;
  const r = await fetch(ISSUER() + '.well-known/openid-configuration');
  if (!r.ok) throw new Error(`OIDC discovery failed (${r.status})`);
  _meta = await r.json();
  return _meta;
}

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const txCookieOpts = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/v1/auth/oidc'
});
const sessionCookieOpts = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000
});

const OidcController = {

  /* ── GET /v1/auth/oidc/login ───────────────────────────────── */
  async login(req, res) {
    if (!configured()) return res.status(503).send('Login no configurado');
    try {
      const meta      = await discover();
      const state     = b64url(crypto.randomBytes(24));
      const nonce     = b64url(crypto.randomBytes(24));
      const verifier  = b64url(crypto.randomBytes(32));
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      const ret = (typeof req.query.ret === 'string' && req.query.ret.startsWith('/')) ? req.query.ret : '/';

      // Guardamos state/nonce/verifier firmados en una cookie corta (10 min)
      res.cookie('oidc_tx', jwt.sign({ state, nonce, verifier, ret }, SECRET(), { expiresIn: '10m' }), txCookieOpts());

      const params = new URLSearchParams({
        client_id:             CLIENT_ID(),
        response_type:         'code',
        scope:                 'openid email profile',
        redirect_uri:          REDIRECT_URI(),
        state, nonce,
        code_challenge:        challenge,
        code_challenge_method: 'S256',
      });
      res.redirect(`${meta.authorization_endpoint}?${params}`);
    } catch (err) {
      console.error('[OIDC] login error:', err.message);
      res.status(500).send('No se pudo iniciar sesión');
    }
  },

  /* ── GET /v1/auth/oidc/callback ────────────────────────────── */
  async callback(req, res) {
    if (!configured()) return res.status(503).send('Login no configurado');
    try {
      const { code, state, error } = req.query;
      if (error) { console.warn('[OIDC] provider error:', error); return res.redirect('/?login=error'); }

      const txRaw = req.cookies?.oidc_tx;
      if (!code || !state || !txRaw) return res.redirect('/?login=error');

      let tx;
      try { tx = jwt.verify(txRaw, SECRET()); } catch { return res.redirect('/?login=error'); }
      res.clearCookie('oidc_tx', { path: '/v1/auth/oidc' });
      if (state !== tx.state) return res.redirect('/?login=error');

      const meta = await discover();

      // 1) code → tokens (back-channel, con client_secret + PKCE)
      const tr = await fetch(meta.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          code:          String(code),
          redirect_uri:  REDIRECT_URI(),
          code_verifier: tx.verifier,
          client_id:     CLIENT_ID(),
          client_secret: CLIENT_SECRET(),
        }),
      });
      if (!tr.ok) { console.error('[OIDC] token exchange failed:', tr.status, await tr.text()); return res.redirect('/?login=error'); }
      const tok = await tr.json();

      // 2) userinfo → email + nombre
      const ur = await fetch(meta.userinfo_endpoint, { headers: { Authorization: `Bearer ${tok.access_token}` } });
      if (!ur.ok) { console.error('[OIDC] userinfo failed:', ur.status); return res.redirect('/?login=error'); }
      const info  = await ur.json();
      const email = (info.email || '').toLowerCase().trim();
      if (!email) return res.redirect('/?login=error');
      const name  = info.name || [info.given_name, info.family_name].filter(Boolean).join(' ') || email.split('@')[0];

      // 3) enlazar/crear por email y emitir NUESTRA sesión (misma cookie de siempre)
      const user = await User.findOrCreateFromGoogle({ email, name });
      res.cookie('refresh_token', signRefreshToken(user), sessionCookieOpts());

      // La SPA se restaura sola al cargar (tryRestore → /auth/refresh → /auth/me)
      res.redirect((typeof tx.ret === 'string' && tx.ret.startsWith('/')) ? tx.ret : '/');
    } catch (err) {
      console.error('[OIDC] callback error:', err.message);
      res.redirect('/?login=error');
    }
  },
};

module.exports = OidcController;
