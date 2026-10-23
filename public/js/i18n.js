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

  /* ── Traducir lo que escribe otra persona ─────────────────────
     I18N.translatable(el, { text }) pone bajo `el` un botón «Traducir al
     inglés» (o «al español»). El original nunca se toca en el servidor:
     la traducción (/v1/translate, IA de suscripción, guardada por texto e
     idioma) solo se enseña aquí, marcada, y se puede volver al original.
     No sale si el texto ya parece estar en el idioma de la interfaz. */
  var STOP = {   // i18n-no-inicio — palabras para adivinar el idioma, no se ven
    es: ' de la el los las que en y para con por una un del se no es su al lo como más pero sus le ya o este esta son también ',
    en: ' the and of to in for with is are on that this be by as from it at an or we our your have will not can '
  };   // i18n-no-fin
  function guessLang(text) {
    var words = String(text).toLowerCase().match(/[a-záéíóúñü]+/g) || [];
    var es = 0, en = 0;
    words.slice(0, 400).forEach(function (w) {
      if (STOP.es.indexOf(' ' + w + ' ') !== -1) es++;
      if (STOP.en.indexOf(' ' + w + ' ') !== -1) en++;
    });
    if (es >= 2 && es > en * 1.5) return 'es';
    if (en >= 2 && en > es * 1.5) return 'en';
    return null;
  }

  function translatable(el, opts) {
    opts = opts || {};
    if (!el || el.dataset.trReady) return;
    var text = String(opts.text != null ? opts.text : el.innerText || '').trim();
    if (!text || guessLang(text) === lang) return;
    el.dataset.trReady = '1';
    var bar = document.createElement('div');
    bar.className = 'efs-tr';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'efs-tr__btn';
    var note = document.createElement('span');
    note.className = 'efs-tr__nota';
    note.hidden = true;
    note.textContent = t('Traducción automática');
    bar.appendChild(note);
    bar.appendChild(btn);
    el.insertAdjacentElement('afterend', bar);
    var original = el.innerHTML, translated = null, showing = false;
    function label() {
      btn.textContent = showing ? t('Ver original') : (lang === 'en' ? t('Traducir al inglés') : t('Traducir al español'));
      note.hidden = !showing;
    }
    label();
    btn.addEventListener('click', function () {
      if (showing) { el.innerHTML = original; showing = false; label(); return; }
      if (translated != null) { el.innerText = translated; showing = true; label(); return; }
      btn.disabled = true;
      btn.textContent = t('Traduciendo…');
      API.post('/translate', { text: text, to: lang }).then(function (d) {
        translated = d.translated;
        el.innerText = translated;
        showing = true;
      }).catch(function (err) {
        if (window.Toast) Toast.show((err && err.message) || t('No se ha podido traducir'), 'err');
      }).then(function () { btn.disabled = false; label(); });
    });
  }

  (function trStyles() {
    var css = document.createElement('style');
    css.textContent =
      '.efs-tr{display:flex;align-items:center;gap:.5rem;margin-top:.35rem;font-size:12px;line-height:1.4}' +
      '.efs-tr__btn{background:none;border:0;padding:.15rem 0;color:#4312d8;font:inherit;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px}' +
      '.efs-tr__btn:disabled{opacity:.6;cursor:progress}' +
      '.efs-tr__btn:focus-visible{outline:2px solid #4312d8;outline-offset:2px;border-radius:4px}' +
      '.efs-tr__nota{color:#55577a;font-style:italic}' +
      '.efs-tr__nota::after{content:" ·"}';
    document.head.appendChild(css);
  })();

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
  window.I18N = { lang: lang, t: t, apply: apply, setLang: setLang, syncAccount: syncAccount, translatable: translatable, guessLang: guessLang };
})();
