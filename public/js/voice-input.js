/* ═══════════════════════════════════════════════════════════════
   Voice Input — dictado (whisper.cpp local en el servidor) para textareas
   Records audio via MediaRecorder, sends to /v1/voice/transcribe,
   and inserts the transcribed text into the textarea.
   Uses the project's proposal_lang for automatic translation.
   ═══════════════════════════════════════════════════════════════ */

const VoiceInput = (() => {
  let activeBtn = null;
  let activeTA  = null;
  let mediaRec  = null;
  let stream    = null;
  let chunks    = [];
  // Disponibilidad del dictado en el servidor (null = sin comprobar)
  let available = null;
  let checking  = null;
  // El dictado necesita un servicio de transcripción propio (sin OpenAI); si
  // el servidor no lo tiene, el micro se ve apagado y lo explica, para que no
  // parezca que la IA está rota (el resto de la IA va por la suscripción).
  const UNAVAILABLE_MSG = 'El dictado por voz todavía no está activado. Escribe el texto directamente: el resto de funciones de IA funcionan con normalidad.';
  const OFF_TITLE = 'Dictado por voz: todavía no está activado';

  async function checkAvailable() {
    if (available !== null) return available;
    if (checking) return checking;
    checking = (async () => {
      try {
        const token = typeof API !== 'undefined' ? API.getToken() : null;
        if (!token) return true; // sin sesión no se puede preguntar: no se guarda
        const r = await fetch('/v1/voice/status', {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include',
        });
        if (!r.ok) return true; // ante la duda, dejamos intentar (sin guardar)
        const j = await r.json();
        available = !!j.data?.available;
        if (!available) document.querySelectorAll('.voice-btn').forEach(markOff);
        return available;
      } catch { return true; }
    })();
    // Se suelta al terminar (no dentro: sin await, terminaría antes de asignarse)
    checking.finally(() => { checking = null; });
    return checking;
  }

  function markOff(btn) {
    btn.classList.add('voice-off');
    btn.title = OFF_TITLE;
    btn.setAttribute('aria-label', OFF_TITLE);
    btn.innerHTML = '<span class="material-symbols-outlined">mic_off</span>';
  }

  function showUnavailable() {
    if (typeof Toast !== 'undefined') Toast.show(UNAVAILABLE_MSG, 'err');
  }

  /* ── Get the target write language from the project ──────────── */
  // El idioma de trabajo se decide en el selector de Intake Step 1 (`#intake-f-lang`)
  // y se persiste en `projects.proposal_lang`. Developer.js hidrata `window.__projectLang`
  // al cargar un proyecto. La NA es metadato; no la usamos para inferir idioma aquí.
  function getWriteLang() {
    const langEl = document.getElementById('intake-f-lang');
    if (langEl && langEl.value) return langEl.value;
    if (window.__projectLang) return window.__projectLang;
    return 'en';
  }

  /* ── Attach mic button to a textarea ─────────────────────────── */
  function attach(textarea) {
    if (!textarea || textarea.dataset.voiceAttached) return;
    // Opt-out: explicit attribute or any ancestor marked .voice-skip.
    // Used by table-cell textareas where a mic button would crowd the cell.
    if (textarea.dataset.noVoice === '1') return;
    if (typeof textarea.closest === 'function' && textarea.closest('.voice-skip')) return;
    textarea.dataset.voiceAttached = '1';

    // Wrap textarea in a relative container
    let wrapper = textarea.parentElement;
    if (!wrapper.classList.contains('voice-wrap')) {
      wrapper = document.createElement('div');
      wrapper.className = 'voice-wrap';
      textarea.parentNode.insertBefore(wrapper, textarea);
      wrapper.appendChild(textarea);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-btn';
    btn.title = 'Dictar por voz';
    btn.innerHTML = '<span class="material-symbols-outlined">mic</span>';
    btn.addEventListener('click', () => toggle(textarea, btn));
    wrapper.appendChild(btn);
    if (available === false) markOff(btn);
    else if (available === null) {
      checkAvailable();
      // Los textareas de la página existen antes de iniciar sesión: se vuelve a
      // preguntar al usarlos (ya con sesión).
      const recheck = () => { if (available === null) checkAvailable(); };
      textarea.addEventListener('focus', recheck);
      btn.addEventListener('mouseenter', recheck);
    }
  }

  /* ── Toggle recording ────────────────────────────────────────── */
  function toggle(textarea, btn) {
    if (mediaRec && activeTA === textarea) {
      stop();
    } else {
      if (mediaRec) stop();
      start(textarea, btn);
    }
  }

  /* ── Start recording ─────────────────────────────────────────── */
  async function start(textarea, btn) {
    if (!(await checkAvailable())) { showUnavailable(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (typeof Toast !== 'undefined') {
        Toast.show('Permiso de micrófono denegado. Actívalo en el navegador.', 'err');
      }
      return;
    }

    chunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRec = new MediaRecorder(stream, { mimeType });

    mediaRec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      stream = null;

      if (chunks.length === 0) return;

      const blob = new Blob(chunks, { type: mimeType });
      chunks = [];

      // Show loading state
      btn.innerHTML = '<span class="material-symbols-outlined voice-spin">progress_activity</span>';
      btn.classList.remove('voice-active');
      btn.classList.add('voice-loading');
      textarea.classList.remove('voice-recording');

      try {
        const text = await transcribe(blob);
        if (text) {
          insertText(textarea, text);
          if (typeof Toast !== 'undefined') Toast.show('Transcripción completada', 'ok');
        }
      } catch (err) {
        if (err.code === 'VOICE_UNAVAILABLE') { available = false; showUnavailable(); }
        else if (typeof Toast !== 'undefined') Toast.show('Error: ' + err.message, 'err');
      } finally {
        btn.innerHTML = '<span class="material-symbols-outlined">mic</span>';
        btn.classList.remove('voice-loading');
        if (available === false) document.querySelectorAll('.voice-btn').forEach(markOff);
      }
    };

    mediaRec.start(1000);

    activeBtn = btn;
    activeTA  = textarea;
    btn.classList.add('voice-active');
    btn.innerHTML = '<span class="material-symbols-outlined">stop</span>';
    btn.title = 'Parar y transcribir';
    textarea.classList.add('voice-recording');

    if (typeof Toast !== 'undefined') Toast.show('Grabando... pulsa de nuevo para parar', 'ok');
  }

  /* ── Stop recording ──────────────────────────────────────────── */
  function stop() {
    if (mediaRec && mediaRec.state !== 'inactive') {
      mediaRec.stop();
    }
    mediaRec = null;

    if (activeBtn) {
      activeBtn.classList.remove('voice-active');
      activeBtn.innerHTML = '<span class="material-symbols-outlined">mic</span>';
      activeBtn.title = 'Dictar por voz';
      activeBtn = null;
    }
    if (activeTA) {
      activeTA.classList.remove('voice-recording');
      activeTA = null;
    }
  }

  /* ── Send audio to backend for Whisper transcription ─────────── */
  async function transcribe(blob) {
    const form = new FormData();
    form.append('audio', blob, 'recording.webm');
    form.append('write_lang', getWriteLang());

    const token = typeof API !== 'undefined' ? API.getToken() : null;
    const resp = await fetch('/v1/voice/transcribe', {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'include',
      body: form,
    });

    const data = await resp.json().catch(() => ({}));
    if (!data.ok) {
      const e = new Error(data.error?.message || 'No se pudo transcribir el audio');
      e.code = data.error?.code || (resp.status === 503 ? 'VOICE_UNAVAILABLE' : '');
      throw e;
    }
    return data.text;
  }

  /* ── Insert text at cursor position in textarea ──────────────── */
  function insertText(textarea, text) {
    const start  = textarea.selectionStart || textarea.value.length;
    const prefix = textarea.value.substring(0, start);
    const suffix = textarea.value.substring(start);
    const sep    = prefix.length > 0 && !/[\s\n]$/.test(prefix) ? ' ' : '';

    textarea.value = prefix + sep + text + suffix;
    textarea.selectionStart = textarea.selectionEnd = start + sep.length + text.length;
    textarea.focus();

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ── Auto-attach to all textareas + watch for new ones ─────────── */
  function init() {
    document.querySelectorAll('textarea').forEach(attach);
    // Al entrar, el token llega después de DOMContentLoaded: se pregunta en cuanto lo haya.
    let tries = 0;
    const poll = setInterval(() => {
      const hasToken = typeof API !== 'undefined' && API.getToken();
      if (available !== null || ++tries > 30) return clearInterval(poll);
      if (hasToken) checkAvailable();
    }, 2000);

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'TEXTAREA') attach(node);
          else if (node.querySelectorAll) {
            node.querySelectorAll('textarea').forEach(attach);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  return { init, attach, stop };
})();

document.addEventListener('DOMContentLoaded', () => VoiceInput.init());
