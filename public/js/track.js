/* ═══════════════════════════════════════════════════════════════
   Track — first-party behavioral tracking (TASK-009 Fase 1)
   ═══════════════════════════════════════════════════════════════
   - device_id persistente (localStorage) para coser invitado→usuario
   - cola de eventos + flush por lotes (timer + sendBeacon en cierre)
   - tiempo activo por sección vía Page Visibility API
   Doc: docs/LEAD_QUALIFICATION_PLAN.md
   ═══════════════════════════════════════════════════════════════ */

const Track = (() => {
  const ENDPOINT   = '/v1/events';
  const DEVICE_KEY = 'efs_did';
  const FLUSH_MS   = 5000;
  const MAX_QUEUE  = 30;

  let queue = [];
  let sessionId = null;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function deviceId() {
    let id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch {}
    if (!id) { id = uuid(); try { localStorage.setItem(DEVICE_KEY, id); } catch {} }
    return id;
  }

  function token() {
    return (typeof API !== 'undefined' && API.getToken) ? API.getToken() : null;
  }

  /* ── Encolar un evento ──────────────────────────────────────── */
  function event(name, props = {}) {
    if (!name) return;
    const { route, ref_id, programme, seconds, ...rest } = props;
    queue.push({
      name,
      route:     route || null,
      ref_id:    ref_id != null ? String(ref_id) : null,
      programme: programme || null,
      seconds:   typeof seconds === 'number' ? seconds : undefined,
      device_id: deviceId(),
      session_id: sessionId,
      props:     Object.keys(rest).length ? rest : undefined,
    });
    if (queue.length >= MAX_QUEUE) flush();
  }

  /* ── Enviar el lote ─────────────────────────────────────────── */
  function flush(viaBeacon = false) {
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    const body = JSON.stringify({ events: batch });
    const tok = token();
    // Sin sesión, sendBeacon es ideal (sobrevive al cierre de página).
    // Con sesión necesitamos fetch para llevar el header Authorization.
    if (!tok && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      } catch {}
    }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          tok ? { Authorization: 'Bearer ' + tok } : {}
        ),
        body,
      }).catch(() => {});
    } catch {}
  }

  /* ── Tiempo activo por sección (Page Visibility) ────────────── */
  let curRoute = null, enterTs = 0, activeMs = 0, visible = true;
  const now = () => (window.performance && performance.now) ? performance.now() : Date.now();
  function accrue() { if (visible && enterTs) { activeMs += now() - enterTs; enterTs = now(); } }

  function leaveSection() {
    if (!curRoute) return;
    accrue();
    const secs = Math.round(activeMs / 1000);
    if (secs > 0) event('section_time', { route: curRoute, seconds: secs });
    curRoute = null; activeMs = 0; enterTs = 0;
  }

  // Llamado desde app.navigate() en cada cambio de sección.
  function enterSection(route) {
    if (!route || route === curRoute) return;
    leaveSection();
    curRoute = route; activeMs = 0; enterTs = now();
    event('section_view', { route });
  }

  /* ── Init (desde el boot, antes de App.init) ────────────────── */
  function init() {
    if (sessionId) return;        // idempotente
    sessionId = uuid();
    deviceId();
    event('session_start', { route: location.hash.slice(1) || null });
    setInterval(() => flush(), FLUSH_MS);
    document.addEventListener('visibilitychange', () => {
      visible = !document.hidden;
      if (document.hidden) { accrue(); flush(true); }
      else { enterTs = now(); }
    });
    window.addEventListener('pagehide', () => { leaveSection(); flush(true); });
  }

  return { init, event, enterSection, flush };
})();
