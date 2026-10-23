/* ═══════════════════════════════════════════════════════════════
   Menú superior común — comportamiento.
   Lo usan la app (index.html), la academia y las páginas públicas
   (/mision, /recursos/, /privacidad). Todos los enlaces son internos.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Avatar de «Mi cuenta» ───────────────────────────────────
     Orden: foto del usuario → logo de su entidad → iniciales.
     data = { avatar_url, avatar_source: 'organization'|'user'|'initials', initials }
     Si la imagen falla al cargar, se queda con las iniciales. */
  window.EfsAvatar = {
    paint: function (el, data) {
      if (!el) return;
      data = data || {};
      var initials = data.initials || '?';
      el.classList.remove('is-logo');
      el.textContent = initials;
      if (!data.avatar_url) return;
      var img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onload = function () {
        el.textContent = '';
        if (data.avatar_source === 'organization') el.classList.add('is-logo');
        el.appendChild(img);
      };
      img.src = data.avatar_url;
    },
    paintAll: function (data) {
      document.querySelectorAll('[data-efs-avatar]').forEach(function (el) { window.EfsAvatar.paint(el, data); });
    }
  };

  /* ── Menú del círculo de usuario ─────────────────────────────
     Al pulsar el círculo se abre un menú pequeño: Mi cuenta, Mi entidad
     y Cerrar sesión. Sin JS el enlace lleva a Mi cuenta. */
  (function accountMenu() {
    var acct = document.getElementById('topbar-cta-account');
    if (!acct || document.getElementById('efs-account-menu')) return;
    var wrap = acct.parentNode;
    wrap.classList.add('efs-topbar__cta--menu');
    acct.setAttribute('aria-haspopup', 'menu');
    acct.setAttribute('aria-expanded', 'false');
    acct.setAttribute('aria-controls', 'efs-account-menu');
    var menu = document.createElement('div');
    menu.id = 'efs-account-menu';
    menu.className = 'efs-account-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    menu.innerHTML =
      '<p class="efs-account-menu__who" id="efs-account-menu-who"></p>' +
      '<a role="menuitem" href="/#account-profile">' + _t('Mi cuenta') + '</a>' +
      '<a role="menuitem" href="/#account-org">' + _t('Mi entidad') + '</a>' +
      '<button type="button" role="menuitem" data-efs-logout>' + _t('Cerrar sesión') + '</button>';
    wrap.appendChild(menu);
    var items = function () { return menu.querySelectorAll('[role="menuitem"]'); };
    function close(focusBack) {
      if (menu.hidden) return;
      menu.hidden = true;
      acct.setAttribute('aria-expanded', 'false');
      if (focusBack) acct.focus();
    }
    function open() {
      var n = document.getElementById('topbar-user-name');
      menu.querySelector('#efs-account-menu-who').textContent = n && n.textContent.trim() !== '…' ? n.textContent.trim() : _t('Mi cuenta');
      menu.hidden = false;
      acct.setAttribute('aria-expanded', 'true');
      items()[0].focus();
    }
    acct.addEventListener('click', function (e) {
      e.preventDefault();
      if (menu.hidden) open(); else close(false);
    });
    menu.addEventListener('click', function (e) {
      var t = e.target.closest('[role="menuitem"]');
      if (!t) return;
      close(false);
      if (t.hasAttribute('data-efs-logout')) {
        e.preventDefault();
        // En la app, el cierre de siempre (borra el token y vuelve a la portada).
        if (window.Auth && typeof window.Auth.logout === 'function') { window.Auth.logout(); return; }
        fetch('/v1/auth/logout', { method: 'POST', credentials: 'include' })
          .catch(function () {})
          .then(function () { location.href = '/'; });
      }
    });
    menu.addEventListener('keydown', function (e) {
      var list = Array.prototype.slice.call(items());
      var i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Tab') close(false);
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && !acct.contains(e.target)) close(false);
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

  /* ── Fase beta: «Beta» y candado en las áreas que la persona no tiene ──
     Proyectos y Academia (lista en node/src/utils/areas.js). La app y la
     academia llaman a EfsTopbar.markAreas(areas) con el usuario cargado; las
     páginas públicas lo hacen con /auth/session-status (más abajo). */
  var AREA_LINKS = { proyectos: /#my-projects$/, academia: /^\/academia\/?$/ };
  var LOCK_SVG = '<svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V6z"/></svg>';
  function markAreas(areas) {
    var have = areas || [];
    document.querySelectorAll('.efs-topbar__menu a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var area = null;
      Object.keys(AREA_LINKS).forEach(function (k) { if (AREA_LINKS[k].test(href)) area = k; });
      if (!area) return;
      var tag = a.querySelector('.efs-topbar__beta');
      var locked = have.indexOf(area) === -1;
      if (locked && !tag) {
        a.insertAdjacentHTML('beforeend', ' <span class="efs-topbar__beta">' + LOCK_SVG + 'Beta</span>');
        a.setAttribute('data-beta-locked', area);
        a.setAttribute('aria-label', _t('{seccion} (fase beta, acceso restringido)', { seccion: a.textContent.replace('Beta', '').trim() }));
      } else if (!locked && tag) {
        tag.remove();
        a.removeAttribute('data-beta-locked');
        a.removeAttribute('aria-label');
      }
    });
  }
  window.EfsTopbar = { markAreas: markAreas };

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
        if (!data || !data.logged_in) {          // sin sesión: se queda «Iniciar sesión»
          bar.classList.add('efs-topbar--invitado');
          return;
        }
        if (name) name.textContent = data.first_name || _t('Mi cuenta');
        window.EfsAvatar.paintAll(data);
        back.style.display    = 'none';
        account.style.display = '';
        if (Array.isArray(data.areas)) markAreas(data.areas);
      })
      .catch(function () { /* sin sesión o sin red: el menú se queda como está */ });
  })();
})();
