/* ═══════════════════════════════════════════════════════════════
   Menú superior común — comportamiento.
   Lo usan la app (index.html) y las páginas de la web pública.
   Estaba suelto en dos <script> dentro de index.html.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Páginas que ya han salido de WordPress y viven en este repo
     (docs/SALIDA_DE_WORDPRESS.md). Fuera de producción se usa la versión en
     código; en producción siguen apuntando a WordPress hasta el cutover (P5). */
  var YA_EN_CODIGO = {
    'https://eufundingschool.com/academia/': '/mision'
  };

  /* ── Enlaces que salen del producto ──────────────────────────
     Recursos, Academia y Misión viven fuera de la app. En local y en dev
     hay que evitar que pinchar en ellas te saque del entorno en el que
     estás trabajando y te tire la sesión. */
  (function fixExternalLinks() {
    var host    = location.hostname;
    var isLocal = host === 'localhost' || host === '127.0.0.1';
    var isDev   = host.indexOf('dev.') === 0;
    if (!isLocal && !isDev) return;   // en producción, enlaces tal cual

    // Lo que ya está en código se queda dentro del entorno, sea cual sea.
    document.querySelectorAll('.efs-topbar__menu a[href]').forEach(function (a) {
      var destino = YA_EN_CODIGO[a.getAttribute('href')];
      if (!destino) return;
      a.href   = destino;
      a.target = '_self';
      a.removeAttribute('title');
    });

    if (isLocal) {
      // Laragon sí tiene su propio WordPress: se reescriben al dominio local.
      document.querySelectorAll('.efs-topbar a[href*="eufundingschool.com"]').forEach(function (a) {
        a.href = a.href.replace('https://eufundingschool.com', 'http://eufundingschool.test');
      });
      return;
    }

    var brand = document.querySelector('.efs-topbar__brand');
    if (brand) brand.href = '/';
    document.querySelectorAll('.efs-topbar__menu a[href^="http"]').forEach(function (a) {
      a.target = '_blank';
      a.rel    = 'noopener';
      a.title  = a.textContent.trim() + ' — vive fuera de dev; se abre en otra pestaña';
    });
  })();

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
