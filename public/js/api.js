/* ═══════════════════════════════════════════════════════════════
   API Client — HTTP helper for communicating with Node backend
   ═══════════════════════════════════════════════════════════════ */

const API = (() => {
  const BASE = '/v1';
  let accessToken = null;

  function setToken(token) { accessToken = token }
  function getToken()      { return accessToken }
  function clearToken()    { accessToken = null }

  async function request(method, path, body, opts = {}) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken && !opts.noAuth) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const config = { method, headers, credentials: 'include' };
    if (body && method !== 'GET') config.body = JSON.stringify(body);

    let res;
    // Retry hasta 2 veces en errores de red
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        res = await fetch(url, config);
        break;
      } catch (err) {
        if (attempt === 2) {
          throw { code: 'NETWORK_ERROR', message: 'No se puede conectar con el servidor. Comprueba tu conexión.' };
        }
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }

    // Auto-refresh on 401
    if (res.status === 401 && accessToken && !opts._retried) {
      const refreshed = await tryRefresh();
      if (refreshed) return request(method, path, body, { ...opts, _retried: true });
      clearToken();
      window.dispatchEvent(new Event('auth:logout'));
      throw { code: 'UNAUTHORIZED', message: 'Sesión caducada, por favor inicia sesión de nuevo' };
    }

    // Un proxy que corta por tiempo (502/504) responde HTML, no JSON: se
    // explica en vez de enseñar «Unexpected token <» (la IA tarda 15-90 s).
    let json;
    try { json = await res.json(); }
    catch {
      throw (res.status === 502 || res.status === 504)
        ? { code: 'GATEWAY_TIMEOUT', message: 'El servidor tardó demasiado en responder (las funciones de IA pueden tardar hasta un par de minutos). Inténtalo de nuevo.' }
        : { code: 'BAD_RESPONSE', message: `Respuesta inesperada del servidor (${res.status}). Inténtalo de nuevo.` };
    }
    if (!json.ok) {
      // Fase beta: área no concedida → la SPA enseña «Solicitar acceso» (beta-access.js).
      if (json.error && json.error.code === 'AREA_REQUIRED') {
        window.dispatchEvent(new CustomEvent('area:required', { detail: json.error }));
      }
      throw json.error || { code: 'UNKNOWN', message: 'Error en la solicitud' };
    }
    return json.data;
  }

  async function tryRefresh() {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      const json = await res.json();
      if (json.ok && json.data.access_token) {
        accessToken = json.data.access_token;
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  const get   = (path, opts)       => request('GET',    path, null, opts);
  const post  = (path, body, opts) => request('POST',   path, body, opts);
  const patch = (path, body, opts) => request('PATCH',  path, body, opts);
  const put   = (path, body, opts) => request('PUT',    path, body, opts);
  const del   = (path, opts)       => request('DELETE', path, null, opts);

  /* ── Proactive refresh: renew token every 45 min ──────────── */
  let refreshTimer = null;

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(async () => {
      if (!accessToken) return stopAutoRefresh();
      await tryRefresh();
    }, 45 * 60 * 1000); // 45 minutes
  }

  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  return { setToken, getToken, clearToken, get, post, patch, put, del, tryRefresh, startAutoRefresh, stopAutoRefresh };
})();
