/* ═══════════════════════════════════════════════════════════════
   Idiomas de la interfaz — lado del navegador (oct-2026).
   Las reglas están en node/src/utils/i18n.js. Aquí:
     _t('Texto en español {x}', { x })  → el texto en el idioma de la
       página (si falta la traducción, el español).
     I18N.apply(el)  → traduce una zona pintada con JS (mismas reglas
       que el servidor: nodos de texto + placeholder/title/aria-label/alt).
     Selector: cualquier enlace con data-lang="es|en".
   El servidor ya manda la página traducida y fija <html lang>; para el
   inglés carga antes /i18n/en.js (window.__I18N_EN__).
   Se carga en <head>, sin defer: _t tiene que existir antes que el resto.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.documentElement;
  var lang = root.lang === 'en' ? 'en' : 'es';
  var dict = lang === 'en' ? (window.__I18N_EN__ || {}) : {};
  var PENDING = 'studio_lang_elegido';   // eligió idioma sin sesión: se guarda al entrar

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function interpolate(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }

  function t(text, vars) {
    var v = lang !== 'es' ? dict[norm(text)] : null;
    return interpolate(v || String(text == null ? '' : text), vars);
  }

  /* ── Zonas pintadas con JS ───────────────────────────────────── */
  var TEXT_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP_TAGS = { CODE: 1, PRE: 1, TEXTAREA: 1, SVG: 1, svg: 1, MATH: 1, KBD: 1, SAMP: 1, SCRIPT: 1, STYLE: 1 };
  var ICON_CLASS = /(^|\s)material-(symbols-outlined|symbols-rounded|icons)(\s|$)/;
  var HAS_LETTER = /[A-Za-zÀ-ÿ]/;

  function lookup(s) { return lang !== 'es' ? dict[norm(s)] : null; }

  function apply(el) {
    if (lang === 'es' || !el || el.nodeType !== 1) return el;
    if (el.getAttribute('translate') === 'no' || SKIP_TAGS[el.tagName] || ICON_CLASS.test(el.getAttribute('class') || '')) return el;
    TEXT_ATTRS.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v && HAS_LETTER.test(v)) { var tr = lookup(v); if (tr) el.setAttribute(a, tr); }
    });
    if (el.hasAttribute('data-i18n-html')) {
      var h = lookup(el.innerHTML);
      if (h) el.innerHTML = h;
      return el;
    }
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        if (!HAS_LETTER.test(c.nodeValue)) continue;
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(c.nodeValue);
        var tr2 = lookup(m[2]);
        if (tr2) c.nodeValue = m[1] + tr2 + m[3];
      } else if (c.nodeType === 1) {
        apply(c);
      }
    }
    return el;
  }

  /* ── Cambiar de idioma ───────────────────────────────────────── */
  function loggedIn() { return !!(window.API && typeof API.getToken === 'function' && API.getToken()); }

  function go(newLang) {
    // El servidor guarda la cookie y devuelve la misma página en ese idioma
    // (en la web pública, la dirección /en/…). El #hash se conserva.
    var u = new URL(location.href);
    u.searchParams.set('lang', newLang);
    location.href = u.toString();
  }

  function saveToAccount(newLang) {
    return API.patch('/auth/me/lang', { lang: newLang }).catch(function () { /* la cookie basta */ });
  }

  function setLang(newLang) {
    if (newLang !== 'es' && newLang !== 'en') return;
    if (loggedIn()) {
      saveToAccount(newLang).then(function () { go(newLang); });
      return;
    }
    try { localStorage.setItem(PENDING, newLang); } catch (e) { /* sin almacenamiento */ }
    go(newLang);
  }

  /* Al entrar: si eligió idioma antes de iniciar sesión, se guarda en su
     cuenta; si no, manda el de su cuenta. Devuelve true si la página se
     va a recargar en otro idioma. */
  function syncAccount(user) {
    if (!user) return false;
    var pending = null;
    try { pending = localStorage.getItem(PENDING); localStorage.removeItem(PENDING); } catch (e) { /* nada */ }
    if (pending === 'es' || pending === 'en' || !user.ui_lang) {
      if (user.ui_lang !== lang) { user.ui_lang = lang; saveToAccount(lang); }
      return false;
    }
    if (user.ui_lang !== lang) {
      // Una sola vez por pestaña: si el navegador no guarda la cookie, no se recarga en bucle.
      try {
        if (sessionStorage.getItem('studio_lang_sync') === user.ui_lang) return false;
        sessionStorage.setItem('studio_lang_sync', user.ui_lang);
      } catch (e) { return false; }
      go(user.ui_lang);
      return true;
    }
    return false;
  }

  function markSelector() {
    var links = document.querySelectorAll('[data-lang]');
    for (var i = 0; i < links.length; i++) {
      var on = links[i].getAttribute('data-lang') === lang;
      if (on) links[i].setAttribute('aria-current', 'true'); else links[i].removeAttribute('aria-current');
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-lang]');
    if (!a) return;
    e.preventDefault();
    var l = a.getAttribute('data-lang');
    if (l !== lang) setLang(l);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markSelector);
  else markSelector();

  window._t = t;
  window.I18N = { lang: lang, t: t, apply: apply, setLang: setLang, syncAccount: syncAccount };
})();
