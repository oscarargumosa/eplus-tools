/* ═══════════════════════════════════════════════════════════════
   API Client — HTTP helper for communicating with Node backend
   ═══════════════════════════════════════════════════════════════ */

const API = (() => {
  const BASE = '/v1';
  let accessToken = null;

  function setToken(token) { accessToken = token }
  function getToken()      { return accessToken }
  function clearToken()    { accessToken = null }

  // Escrituras de datos del usuario: pasan por el indicador global de
  // guardado (save-status.js), que dice «Guardando… / Guardado / No se ha
  // guardado · Reintentar». Reintentar repite esta misma petición.
  function request(method, path, body, opts = {}) {
    if (method !== 'GET' && !opts._retried && window.SaveStatus && SaveStatus.shouldTrack(method, path, opts)) {
      // Clave del recurso: método + ruta (+ campo, si varias escrituras van a la
      // misma ruta, p. ej. PUT /developer/instances/:id/field con field_id).
      const sub = body && (body.field_id || body.fieldId || body.section_path);
      const key = opts.saveKey || (method + ' ' + path.split('?')[0] + (sub ? ' #' + sub : ''));
      return SaveStatus.track(() => send(method, path, body, opts), { key });
    }
    return send(method, path, body, opts);
  }

  async function send(method, path, body, opts = {}) {
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
      if (refreshed) return send(method, path, body, { ...opts, _retried: true });
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

  // Una sola renovación a la vez: el servidor rota la cookie de refresco en
  // cada uso, así que varias peticiones con 401 comparten la misma.
  let refreshing = null;
  function tryRefresh() {
    if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function doRefresh() {
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

  /* ── Renovación proactiva: el access dura 30 min; se renueva cada 12 ── */
  let refreshTimer = null;

  // Caducidad (ms) del access token en memoria; 0 si no se puede leer.
  function tokenExpiry() {
    try {
      const p = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(p)).exp * 1000;
    } catch { return 0; }
  }

  // Al volver a la pestaña (o tras suspender el equipo) con el token a punto
  // de caducar, se renueva ya: las subidas y descargas no reintentan solas.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && accessToken && tokenExpiry() - Date.now() < 5 * 60 * 1000) tryRefresh();
  });

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(async () => {
      if (!accessToken) return stopAutoRefresh();
      await tryRefresh();
    }, 12 * 60 * 1000); // 12 minutos
  }

  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  return { setToken, getToken, clearToken, get, post, patch, put, del, tryRefresh, startAutoRefresh, stopAutoRefresh };
})();
