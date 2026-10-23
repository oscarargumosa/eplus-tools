/* Script de leccion-01.html: en fichero aparte (no en línea) por la CSP. */
  /* ── Sound effects (Web Audio API) ── */
  let sfxCtx = null;
  function getSfxCtx() {
    if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
    return sfxCtx;
  }

  function playWhoosh() {
    try {
      const ctx = getSfxCtx();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.8) * 0.25;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.04);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start();
    } catch(e) {}
  }

  function playPop() {
    try {
      const ctx = getSfxCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(); osc.stop(ctx.currentTime + 0.18);
    } catch(e) {}
  }

  const audio     = document.getElementById('narration');
  const btnPlay   = document.getElementById('btn-play');
  const progressEl= document.getElementById('progress');
  const timerEl   = document.getElementById('timer');

  let started = false;
  let currentSlide = 0;
  const shown = new Set();

  /* ── State helpers ── */
  function show(id) {
    document.getElementById(id).classList.add('active');
  }
  function hide(id) {
    document.getElementById(id).classList.remove('active');
  }
  function showPoint(id) {
    if (!shown.has(id)) {
      shown.add(id);
      document.getElementById(id).classList.add('visible');
      playPop();
    }
  }

  /* ── Audio-driven sync ── */
  audio.addEventListener('timeupdate', () => {
    const t = audio.currentTime;

    // Slides (con whoosh en transiciones)
    if (t < 7.5) {
      if (currentSlide !== 0) { currentSlide = 0; show('s0'); hide('s1'); hide('s2'); }
    } else if (t < 33) {
      if (currentSlide !== 1) { currentSlide = 1; playWhoosh(); hide('s0'); show('s1'); hide('s2'); }
    } else {
      if (currentSlide !== 2) { currentSlide = 2; playWhoosh(); hide('s0'); hide('s1'); show('s2'); }
    }

    // Content points con pop
    if (t >= 9.5)  showPoint('p0');
    if (t >= 15.5) showPoint('p1');
    if (t >= 21)   showPoint('p2');
    if (t >= 27)   showPoint('p3');

    // Progress bar
    const dur = audio.duration || 42;
    progressEl.style.width = (t / dur * 100) + '%';

    // Timer
    const s = Math.floor(t);
    const d = Math.floor(dur);
    timerEl.textContent = `${fmt(s)} / ${fmt(d)}`;
  });

  audio.addEventListener('ended', () => {
    btnPlay.textContent = '↺ Repetir';
  });

  function fmt(s) {
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }

  /* ── Controls ── */
  function togglePlay() {
    if (!started || audio.ended) {
      restart();
      return;
    }
    if (audio.paused) {
      audio.play();
      btnPlay.textContent = '⏸ Pausar';
    } else {
      audio.pause();
      btnPlay.textContent = '▶ Play';
    }
  }

  function restart() {
    shown.clear();
    currentSlide = 0;
    ['p0','p1','p2','p3'].forEach(id => document.getElementById(id).classList.remove('visible'));
    hide('s1'); hide('s2'); hide('s0');
    audio.currentTime = 0;
    audio.play().then(() => {
      started = true;
      btnPlay.textContent = '⏸ Pausar';
      // Trigger first slide immediately
      show('s0');
    }).catch(() => {});
  }

/* Botones de la página: data-action="Leccion.funcion" (js/acciones.js) */
Acciones.modulo('Leccion', { restart, togglePlay });
