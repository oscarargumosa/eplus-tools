/* ═══════════════════════════════════════════════════════════════
   Landing de EU Funding Studio (invitados en «/»).
   - Si quien llega ya tiene sesión (cookie de refresco), a la app.
   - ?volver=<ruta> o un hash de la app (#convocatorias…): las CTA lo
     llevan a /entrar o /crear-cuenta para volver allí tras el acceso.
   - Vídeo de bienvenida: el reproductor solo aparece si el fichero existe.
   - CTA fijo en móvil, revelado al hacer scroll y analítica propia.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);

  /* ── Destino tras entrar ─────────────────────────────────────── */
  // Solo rutas de este mismo sitio: se resuelve como URL y se exige el mismo
  // origen («//x», «/\x», «/%09/x»… salen fuera). Devuelve ruta + búsqueda + ancla.
  function rutaInterna(v) {
    if (typeof v !== 'string' || v.charAt(0) !== '/' || v.length >= 500) return null;
    try {
      var u = new URL(v, location.origin);
      // «/.//x» se resuelve a la ruta «//x», que el navegador leería como otro sitio.
      return u.origin === location.origin ? '/' + u.pathname.replace(/^\/+/, '') + u.search + u.hash : null;
    } catch (e) { return null; }
  }
  var volver = rutaInterna(params.get('volver'));
  var hash = location.hash.slice(1);
  // Un hash que no es un ancla de esta página es una sección de la app (#convocatorias…)
  if (!volver && hash && /^[a-z0-9-]{2,40}$/i.test(hash) && !document.getElementById(hash)) {
    volver = '/#' + hash;
  }
  if (volver === '/') volver = null;

  var extra = [];
  if (volver) extra.push('volver=' + encodeURIComponent(volver));
  if (params.get('sandbox') === 'start') extra.push('sandbox=start');
  var query = extra.length ? '?' + extra.join('&') : '';

  function track(name, props) {
    try { if (window.Track) window.Track.event(name, Object.assign({ route: 'landing' }, props || {})); } catch (e) { /* sin analítica no pasa nada */ }
  }

  var ctas = document.querySelectorAll('a[data-cta]');
  for (var i = 0; i < ctas.length; i++) {
    (function (a) {
      a.href = (a.getAttribute('data-cta') === 'entrar' ? '/entrar' : '/crear-cuenta') + query;
      a.addEventListener('click', function () {
        track('cta_click', { to: a.getAttribute('data-cta'), where: a.getAttribute('data-donde') });
        if (window.Track) window.Track.flush(true);
      });
    })(ctas[i]);
  }

  if (volver) {
    var aviso = document.getElementById('aviso-volver');
    if (aviso) aviso.hidden = false;
  }

  /* ── ¿Ya tiene sesión? (p. ej. entró antes del cierre a invitados) ── */
  fetch('/v1/auth/session-status', { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (res) {
      if (!res || !res.data || !res.data.logged_in) return;
      // La respuesta ya ha puesto la cookie-pista: «/» servirá la app.
      var destino = volver || ('/' + (location.hash || ''));
      history.replaceState(null, '', destino);
      if (destino.charAt(1) === '#' || destino === '/') location.reload();
      else location.replace(destino);
    })
    .catch(function () { /* sin red: se queda la landing */ });

  /* ── Vídeo de bienvenida ─────────────────────────────────────── */
  var video = document.getElementById('video-bienvenida');
  var espera = document.getElementById('video-espera');
  function existe(url, tipo) {
    // HEAD y tipo correcto: sin fichero, el servidor de pruebas responde la app en HTML (200).
    return fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { return r.ok && (r.headers.get('content-type') || '').indexOf(tipo) === 0; })
      .catch(function () { return false; });
  }
  if (video && espera) {
    var src = video.getAttribute('src');
    var poster = video.getAttribute('poster');
    Promise.all([existe(src, 'video/'), poster ? existe(poster, 'image/') : Promise.resolve(false)])
      .then(function (ok) {
        if (!ok[0]) return;                       // se queda el aviso digno, sin reproductor roto
        var marco = document.getElementById('video-marco');
        if (marco) marco.classList.remove('sin-video');
        espera.removeAttribute('role');
        video.hidden = false;
        video.addEventListener('play', function () { track('video_play', { where: 'bienvenida' }); }, { once: true });
        if (ok[1]) { espera.hidden = true; return; }
        // Sin póster: portada de marca con botón de reproducir, en vez de un fotograma gris
        video.removeAttribute('poster');
        espera.innerHTML = '<img class="video__icono" src="/img/marca/icono-lima.svg" alt="" width="56" height="56">' +
          '<button type="button" class="btn btn--lima" id="video-play">' +
          '<svg class="ico ico--lleno" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>Ver el vídeo de bienvenida</button>';
        espera.querySelector('#video-play').addEventListener('click', function () {
          espera.hidden = true;
          video.focus();
          var pr = video.play();
          if (pr && pr.catch) pr.catch(function () { /* el navegador pide otro clic: ya tiene los controles */ });
        });
      });
  }

  /* ── CTA fijo en móvil: tras el hero, fuera en el cierre ─────── */
  var fijo = document.getElementById('cta-fijo');
  var heroCtas = document.getElementById('hero-ctas');
  var final = document.getElementById('final');
  if (fijo && heroCtas && 'IntersectionObserver' in window) {
    var pasadoHero = false, enFinal = false;
    var pintar = function () {
      var ver = pasadoHero && !enFinal;
      fijo.classList.toggle('is-visible', ver);
      fijo.setAttribute('aria-hidden', ver ? 'false' : 'true');
      var a = fijo.querySelector('a');
      if (a) a.tabIndex = ver ? 0 : -1;
      document.body.classList.add('con-fijo');
    };
    new IntersectionObserver(function (e) {
      pasadoHero = !e[0].isIntersecting && e[0].boundingClientRect.top < 0;
      pintar();
    }).observe(heroCtas);
    if (final) new IntersectionObserver(function (e) { enFinal = e[0].isIntersecting; pintar(); }, { threshold: 0.15 }).observe(final);
  }

  /* ── Revelado al hacer scroll ────────────────────────────────── */
  var revela = document.querySelectorAll('.revela');
  var captura = document.documentElement.classList.contains('modo-captura');
  if (captura || !('IntersectionObserver' in window)) {
    for (var k = 0; k < revela.length; k++) revela[k].classList.add('is-in');
    // la captura de página entera no hace scroll: que no se queden imágenes en blanco
    if (captura) document.querySelectorAll('img[loading="lazy"]').forEach(function (im) { im.loading = 'eager'; });
  } else {
    // Escalonado entre hermanos de la misma lista (≤ 60 ms, tope 6)
    for (var j = 0; j < revela.length; j++) {
      var el = revela[j];
      var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
      if (el.parentNode.children.length > 2) el.style.setProperty('--retardo', (Math.min(idx, 6) * 0.06) + 's');
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    for (var m = 0; m < revela.length; m++) io.observe(revela[m]);
  }

  /* ── Analítica propia (/v1/events): vista de la landing ─────── */
  window.addEventListener('DOMContentLoaded', function () {
    if (!window.Track) return;
    window.Track.init();
    window.Track.enterSection('landing');
  });
})();
