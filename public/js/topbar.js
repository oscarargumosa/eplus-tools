/* ═══════════════════════════════════════════════════════════════
   Menú superior común — comportamiento.
   Lo usan la app (index.html), la academia y las páginas públicas
   (/mision, /recursos/, /privacidad). Todos los enlaces son internos.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Menú plegable ───────────────────────────────────────────── */
  (function mobileToggle() {
    var btn = document.getElementById('efs-topbar-toggle');
    var nav = document.getElementById('efs-topbar-nav');
    if (!btn || !nav) return;
    function close() { nav.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('is-open') && !nav.contains(e.target) && e.target !== btn) close();
    });
  })();

  /* ── Sesión ───────────────────────────────────────────────────
     En la web pública el menú tiene que saber si ya has entrado, para
     enseñar «Mi cuenta» en vez de «Iniciar sesión». En la app de esto se
     encarga app.js con el usuario ya cargado, así que aquí no tocamos nada
     si la página no lo pide con data-efs-session. */
  (function sessionState() {
    var bar = document.querySelector('.efs-topbar');
    if (!bar || !bar.hasAttribute('data-efs-session')) return;

    var back    = document.getElementById('topbar-cta-back');
    var account = document.getElementById('topbar-cta-account');
    var name    = document.getElementById('topbar-user-name');
    if (!back || !account) return;

    fetch('/v1/auth/session-status', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        var data = res && res.data;
        if (!data || !data.logged_in) return;    // sin sesión: se queda «Iniciar sesión»
        if (name) name.textContent = data.first_name || 'Mi cuenta';
        back.style.display    = 'none';
        account.style.display = '';
      })
      .catch(function () { /* sin sesión o sin red: el menú se queda como está */ });
  })();
})();
