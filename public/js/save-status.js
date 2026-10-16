/* ═══════════════════════════════════════════════════════════════
   Indicador global de guardado — «Guardando… / ✓ Guardado / ⚠ No se ha guardado»
   ─────────────────────────────────────────────────────────────
   Una persona escribió preguntando si su proyecto se había guardado
   antes de cerrar. Este módulo lo dice en la barra superior, en todas
   las pantallas, con una sola fuente de verdad:

   - api.js pasa por SaveStatus.track() cada escritura de datos del
     usuario (POST/PUT/PATCH/DELETE a /v1, salvo IA, auth y eventos:
     ver shouldTrack). Los fetch directos (subir foto/logo) también.
   - Los autoguardados con espera (debounce) usan SaveStatus.debounce()
     en vez de setTimeout: así se sabe que hay algo pendiente, se puede
     forzar (flush) al cambiar de sección y se avisa al cerrar.
   - Las pantallas con botón «Guardar» marcan SaveStatus.markDirty()
     al editar y markClean() al guardar: «Cambios sin guardar».
   - Si una escritura falla: «⚠ No se ha guardado · Reintentar»;
     Reintentar repite la última petición fallida de cada recurso.
   - beforeunload avisa si hay algo pendiente, en curso o fallido.
   Estilos en /css/save-status.css. Se pinta dentro de .efs-topbar.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SHOW_SAVING_AFTER = 300;   // ms: «Guardando…» solo si dura (sin parpadeo por tecla)
  var MIN_SAVING_VISIBLE = 600;  // ms: una vez visible, no desaparece de golpe

  var inflight = 0;
  var pending = new Map();   // key → { timer, fn }   autoguardados programados
  var failed = new Map();    // key → { retry, message }
  var dirty = new Map();     // key → { save }        pantallas con botón Guardar
  var lastSaved = null;      // Date del último guardado correcto
  var editing = false;       // la pantalla actual es de edición (lo dice app.js)

  var lastSig = '';
  var el, txt, btn, shownState = 'idle', savingSince = 0, savingTimer = null, settleTimer = null;

  /* ── Qué escrituras cuentan como «guardar» ───────────────────── */
  // Rutas que no son datos del usuario: sesión, métricas, y llamadas de IA
  // o procesos con su propia barra de progreso (generar, mejorar, evaluar…).
  var EXCLUDE = [
    /^\/(events|track)\b/,
    /^\/auth\/(?!me(\/|$))/,                      // todo /auth salvo el perfil (/auth/me)
    /^\/access-requests/,
    /^\/sandbox\//,
    /^\/academia\/courses\/[^/]+\/(enroll|certificate)$/,
    /\/(phase|test|test\/submit)$/,              // progreso de lecciones, no lo escribe la persona
    /(^|\/)(generate|generate-[\w-]+|improve[\w-]*|refine(\/[\w-]+)?|evaluate|ai-[\w-]+|chat|suggest[\w-]*|propose[\w-]*|diagnose|compile-v1|compress[\w-]*|preview[\w-]*|autolink|auto-[\w-]+|apply[\w-]*|regenerate|resync|run|rollback|restore|ors-lookup|lookup|search|parse[\w-]*|paste-proposal|upload[\w-]*|transcribe|import[\w-]*|seed-form-from-master|process-all|download|duplicate|handoff|consortium|smart-shortlist|graduate|seen|claim|dispute|refresh|from-intake)(\/|$)/,
    /^\/admin\/access\/requests\//,
    /^\/developer\/projects\/[^/]+\/instance$/      // abrir un proyecto en Escribir crea su formulario
  ];
  function shouldTrack(method, path, opts) {
    if (opts && opts.save === false) return false;
    if (opts && opts.save === true) return true;
    if (!method || method === 'GET' || method === 'HEAD') return false;
    var p = String(path || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/v1(?=\/)/, '').split('?')[0];
    for (var i = 0; i < EXCLUDE.length; i++) if (EXCLUDE[i].test(p)) return false;
    return true;
  }

  /* ── Registro de escrituras ──────────────────────────────────── */
  // factory: función que lanza la petición y devuelve una promesa.
  // key: identifica el recurso (método + ruta); un acierto posterior en la
  // misma clave borra su fallo anterior.
  function track(factory, opts) {
    opts = opts || {};
    var key = opts.key || ('w' + Math.random());
    var retry = function () { return track(factory, opts); };
    inflight++;
    update();
    var p;
    try { p = Promise.resolve(factory()); }
    catch (e) { p = Promise.reject(e); }
    return p.then(function (res) {
      inflight--;
      failed.delete(key);
      lastSaved = new Date();
      update();
      return res;
    }, function (err) {
      inflight--;
      // Sesión caducada o área cerrada: la app ya saca a entrar o a «Solicitar
      // acceso»; no se deja un «Reintentar» que volvería a fallar.
      if (!(err && (err.code === 'UNAUTHORIZED' || err.code === 'AREA_REQUIRED'))) {
        failed.set(key, { retry: retry, message: errorText(err) });
      }
      update();
      throw err;
    });
  }

  function errorText(err) {
    if (!err) return 'Error desconocido';
    if (err.code === 'NETWORK_ERROR') return 'Sin conexión con el servidor';
    return err.message || String(err);
  }

  /* ── Autoguardado con espera (debounce) ──────────────────────── */
  // Sustituye a «clearTimeout(t); t = setTimeout(fn, ms)». Mientras hay
  // algo programado, el indicador dice «Guardando…» y salir avisa.
  function debounce(key, fn, ms) {
    var cur = pending.get(key);
    if (cur) clearTimeout(cur.timer);
    var entry = { fn: fn, timer: null };
    entry.timer = setTimeout(function () { run(key, entry); }, ms == null ? 800 : ms);
    pending.set(key, entry);
    update();
  }
  function run(key, entry) {
    if (pending.get(key) !== entry) return;
    pending.delete(key);
    var r;
    try { r = entry.fn(); }
    catch (e) {
      failed.set('debounce:' + key, { retry: entry.fn, message: errorText(e) });
      if (window.console) console.error('[SaveStatus]', key, e);
    }
    update();
    return r;
  }
  function cancel(key) {
    var cur = pending.get(key);
    if (cur) { clearTimeout(cur.timer); pending.delete(key); update(); }
  }
  function isPending(key) { return pending.has(key); }
  // Lanza ya todos los autoguardados programados (antes de navegar o cerrar).
  function flush() {
    var out = [];
    Array.from(pending.keys()).forEach(function (key) {
      var entry = pending.get(key);
      clearTimeout(entry.timer);
      out.push(Promise.resolve(run(key, entry)).catch(function () {}));
    });
    return Promise.all(out);
  }

  /* ── Guardados de módulo (varias peticiones en un solo «guardar») ──
     fail(key, err, retry, covers): el módulo registra su propio fallo con
     una función que repite el guardado entero con los datos de ahora.
     covers (RegExp sobre «MÉTODO /ruta») son las peticiones sueltas que ese
     guardado ya incluye: Reintentar no las repite por separado (podrían
     llegar después y pisar datos nuevos con un cuerpo viejo) y ok(key) las
     da por resueltas. */
  var covers = new Map();   // key → RegExp
  function fail(key, err, retry, re) {
    if (re) covers.set(key, re);
    failed.set(key, { retry: retry, message: errorText(err), module: true });
    update();
  }
  function ok(key) {
    var re = covers.get(key);
    var changed = failed.delete(key);
    if (re) failed.forEach(function (v, k) { if (!v.module && re.test(k)) { failed.delete(k); changed = true; } });
    lastSaved = new Date();
    update();
    return changed;
  }

  /* ── Pantallas con botón Guardar ─────────────────────────────── */
  function markDirty(key, opts) { dirty.set(key, opts || {}); update(); }
  function markClean(key) { if (dirty.delete(key)) update(); }

  function hasUnsaved() { return inflight > 0 || pending.size > 0 || failed.size > 0 || dirty.size > 0; }

  function retryAll() {
    var list = Array.from(failed.entries());
    // Lo que ya repite un guardado de módulo no se reenvía suelto.
    var res = list.filter(function (kv) { return kv[1].module && covers.get(kv[0]); })
      .map(function (kv) { return covers.get(kv[0]); });
    list = list.filter(function (kv) {
      if (!kv[1].module && res.some(function (re) { return re.test(kv[0]); })) { failed.delete(kv[0]); return false; }
      return true;
    });
    list.forEach(function (kv) {
      failed.delete(kv[0]);
      try {
        var r = kv[1].retry && kv[1].retry();
        if (r && r.catch) r.catch(function () {});
      } catch (e) {}
    });
    // Un fallo de autoguardado sin función de reintento: se lanza lo pendiente.
    flush();
    update();
  }

  function saveDirty() {
    dirty.forEach(function (d) { if (typeof d.save === 'function') { try { d.save(); } catch (e) {} } });
  }

  function setEditing(on) { editing = !!on; update(); }

  // Al cerrar sesión: se olvida todo (otro usuario podría entrar después).
  function reset() {
    pending.forEach(function (e) { clearTimeout(e.timer); });
    pending.clear(); failed.clear(); dirty.clear();
    lastSaved = null; editing = false; update();
  }

  /* ── Pintado ─────────────────────────────────────────────────── */
  var ICONS = {
    saving: '<span class="efs-save__spin" aria-hidden="true"></span>',
    saved:  '<svg class="efs-save__ico" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9.55 17.6 4.3 12.35l1.4-1.4 3.85 3.85 8.75-8.75 1.4 1.4z"/></svg>',
    error:  '<svg class="efs-save__ico" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M1 21 12 2l11 19zm11-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2m-1-3h2v-5h-2z"/></svg>',
    dirty:  '<svg class="efs-save__ico" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>'
  };

  // Iconos del botón: según el ancho se ven o no (save-status.css).
  var BTN_ICONS = {
    // ⚠ dentro del botón: en móvil el fallo es una sola pieza (⚠ + Reintentar).
    warn: '<svg class="efs-save__btnwarn" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M1 21 12 2l11 19zm11-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2m-1-3h2v-5h-2z"/></svg>',
    retry: '<svg class="efs-save__btnico" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M12 20q-3.35 0-5.675-2.325T4 12t2.325-5.675T12 4q1.725 0 3.3.713T18 6.75V4h2v7h-7V9h4.2q-.8-1.4-2.187-2.2T12 6Q9.5 6 7.75 7.75T6 12t1.75 4.25T12 18q1.925 0 3.475-1.1T17.65 14h2.1q-.7 2.65-2.85 4.325T12 20"/></svg>',
    save:  '<svg class="efs-save__btnico" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M21 7v12q0 .825-.587 1.413T19 21H5q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h12zm-9 11q1.25 0 2.125-.875T15 15t-.875-2.125T12 12t-2.125.875T9 15t.875 2.125T12 18m-6-8h9V6H6z"/></svg>'
  };

  function hhmm(d) {
    try { return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  function wanted() {
    if (failed.size) return 'error';
    if (inflight > 0 || pending.size > 0) return 'saving';
    if (dirty.size) return 'dirty';
    if (lastSaved) return 'saved';
    return editing ? 'clean' : 'idle';
  }

  function ensureEl() {
    if (el) return el;
    var inner = document.querySelector('.efs-topbar__inner');
    if (!inner) return null;
    el = document.createElement('div');
    el.className = 'efs-save';
    el.id = 'efs-save-status';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.innerHTML = '<span class="efs-save__icon"></span><span class="efs-save__txt"></span>' +
      '<button type="button" class="efs-save__btn" hidden></button>';
    txt = el.querySelector('.efs-save__txt');
    btn = el.querySelector('.efs-save__btn');
    btn.addEventListener('click', function () {
      if (btn.dataset.action === 'retry') retryAll();
      else if (btn.dataset.action === 'save') saveDirty();
    });
    var cta = inner.querySelector('.efs-topbar__cta');
    inner.insertBefore(el, cta || null);
    return el;
  }

  function paint(state) {
    if (!ensureEl()) return;
    shownState = state;
    el.dataset.state = state;
    if (state === 'idle') { el.hidden = true; lastSig = ''; return; }
    el.hidden = false;
    var icon = el.querySelector('.efs-save__icon');
    // Tres largos de texto según el ancho (save-status.css): l (normal),
    // m (escritorio con el menú justo) y s (móvil). Los lectores de pantalla
    // leen siempre la frase completa (sr).
    var l = '', m = '', sm = '', sr = '', title = '', action = '', btnText = '', iconHtml = '';
    var t = lastSaved ? hhmm(lastSaved) : '';
    if (state === 'saving') { iconHtml = ICONS.saving; l = m = sm = 'Guardando…'; sr = 'Guardando los cambios…'; }
    else if (state === 'saved') {
      iconHtml = ICONS.saved;
      l = m = 'Guardado' + (t ? ' · ' + t : ''); sm = 'Guardado';
      sr = 'Todos los cambios guardados' + (t ? ' a las ' + t : '');
      title = 'Todos los cambios están guardados' + (t ? ' (último guardado a las ' + t + ')' : '');
    }
    else if (state === 'clean') {
      iconHtml = ICONS.saved; l = m = 'Todo guardado'; sm = 'Guardado';
      sr = title = 'No hay cambios pendientes de guardar';
    }
    else if (state === 'dirty') {
      iconHtml = ICONS.dirty; l = 'Cambios sin guardar'; m = 'Sin guardar'; sm = '';
      sr = 'Hay cambios sin guardar';
      var canSave = Array.from(dirty.values()).some(function (d) { return typeof d.save === 'function'; });
      if (canSave) { action = 'save'; btnText = 'Guardar'; }
      title = 'Hay cambios sin guardar' + (canSave ? '. Pulsa Guardar.' : '');
    }
    else if (state === 'error') {
      iconHtml = ICONS.error; l = 'No se ha guardado'; m = 'No guardado'; sm = '';
      var first = failed.values().next().value;
      var why = first && first.message ? ': ' + String(first.message).trim().replace(/[.\s]+$/, '') : '';
      sr = title = 'No se ha guardado' + why + '. Pulsa Reintentar.';
      action = 'retry'; btnText = 'Reintentar';
    }
    // Mismo contenido: no se toca el DOM. Si se rehiciera, un clic en
    // «Guardar» que dispara el change del campo (al perder el foco) perdería
    // el botón entre mousedown y mouseup y el clic no llegaría.
    var sig = [state, l, m, sm, sr, title, action, btnText].join('|');
    if (sig === lastSig) return;
    lastSig = sig;
    icon.innerHTML = iconHtml;
    txt.innerHTML = '<span class="efs-save__l" aria-hidden="true"></span><span class="efs-save__m" aria-hidden="true"></span>' +
      '<span class="efs-save__s" aria-hidden="true"></span><span class="efs-sr"></span>';
    txt.children[0].textContent = l; txt.children[1].textContent = m;
    txt.children[2].textContent = sm; txt.children[3].textContent = sr;
    el.title = title;
    btn.hidden = !action;
    btn.dataset.action = action;
    btn.setAttribute('aria-label', action === 'retry' ? 'Reintentar guardar' : action === 'save' ? 'Guardar los cambios' : '');
    btn.innerHTML = (action === 'retry' ? BTN_ICONS.warn + BTN_ICONS.retry : action === 'save' ? BTN_ICONS.save : '') +
      '<span class="efs-save__btntxt"></span>';
    btn.lastChild.textContent = btnText;
  }

  function update() {
    var w = wanted();
    clearTimeout(settleTimer);
    if (w === 'saving') {
      if (shownState === 'saving') return;
      if (!savingTimer) {
        savingTimer = setTimeout(function () {
          savingTimer = null;
          if (wanted() === 'saving') { savingSince = Date.now(); paint('saving'); }
        }, SHOW_SAVING_AFTER);
      }
      return;
    }
    clearTimeout(savingTimer); savingTimer = null;
    // «Guardando…» ya visible: se mantiene un mínimo para que se lea.
    if (shownState === 'saving' && w !== 'error') {
      var left = MIN_SAVING_VISIBLE - (Date.now() - savingSince);
      if (left > 0) { settleTimer = setTimeout(update, left); return; }
    }
    paint(w);
  }

  /* ── Salir de la página con algo sin guardar ─────────────────── */
  window.addEventListener('beforeunload', function (e) {
    if (!hasUnsaved()) return;
    flush();
    e.preventDefault();
    e.returnValue = '';
    return '';
  });
  // Móvil: al cambiar de app o bloquear la pantalla, guardar lo programado.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  // La hora de «Guardado · HH:MM» se pinta al guardar; aquí no hace falta refrescarla.

  window.SaveStatus = {
    shouldTrack: shouldTrack, track: track,
    debounce: debounce, cancel: cancel, flush: flush, isPending: isPending,
    fail: fail, ok: ok,
    markDirty: markDirty, markClean: markClean,
    hasUnsaved: hasUnsaved, retry: retryAll, setEditing: setEditing, reset: reset,
    // Envuelve un fetch directo de escritura (subidas): falla si !res.ok.
    trackFetch: function (factory, key) {
      return track(function () {
        return Promise.resolve(factory()).then(function (res) {
          if (res && res.ok === false) {
            var err = new Error('El servidor respondió ' + res.status);
            err.response = res;
            throw err;
          }
          return res;
        });
      }, { key: key });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureEl);
  else ensureEl();
})();
