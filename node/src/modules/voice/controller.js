/* ── Dictado por voz ───────────────────────────────────────────────
   Sin OpenAI (regla: IA solo por suscripción). Transcripción LOCAL,
   por una de estas dos vías (la primera que esté configurada):

   - WHISPER_URL → servidor HTTP compatible con whisper.cpp
                   (`whisper-server --convert`, endpoint /inference).
                   Sería la vía para el contenedor de producción, que no
                   tiene Python ni modelos. Hoy NO hay ninguno en marcha.
   - WHISPER_PY=1 → faster-whisper en la misma máquina, vía
                   scripts/whisper-local.py (python3 + faster-whisper,
                   modelo WHISPER_PY_MODEL, por defecto "small"). Funciona
                   en el host del VPS (dev). Una transcripción a la vez.

   Sin ninguna → 503 VOICE_UNAVAILABLE ("dictado no disponible").
   La traducción al idioma de trabajo va por utils/ai.js (ai-bridge).
   Nota: el whisper.cpp de /opt/whisper.cpp está compilado para otra CPU
   (muere con «invalid opcode»), por eso no se usa su CLI.
   ─────────────────────────────────────────────────────────────── */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ai = require('../../utils/ai');

// ISO code → full language name (for the translation prompt)
const LANG_NAMES = {
  en: 'English',    es: 'Spanish',     fr: 'French',      de: 'German',
  it: 'Italian',    pt: 'Portuguese',  nl: 'Dutch',       bg: 'Bulgarian',
  hr: 'Croatian',   el: 'Greek',       cs: 'Czech',       da: 'Danish',
  et: 'Estonian',    fi: 'Finnish',     hu: 'Hungarian',   is: 'Icelandic',
  lv: 'Latvian',    lt: 'Lithuanian',  no: 'Norwegian',   pl: 'Polish',
  ro: 'Romanian',   sr: 'Serbian',     sk: 'Slovak',      sl: 'Slovenian',
  sv: 'Swedish',    tr: 'Turkish',
};

// whisper-server (verbose_json) devuelve el idioma como nombre en inglés
const WHISPER_TO_ISO = {
  english: 'en',    spanish: 'es',     french: 'fr',      german: 'de',
  italian: 'it',    portuguese: 'pt',  dutch: 'nl',       bulgarian: 'bg',
  croatian: 'hr',   greek: 'el',       czech: 'cs',       danish: 'da',
  estonian: 'et',   finnish: 'fi',     hungarian: 'hu',   icelandic: 'is',
  latvian: 'lv',    lithuanian: 'lt',  norwegian: 'no',   polish: 'pl',
  romanian: 'ro',   serbian: 'sr',     slovak: 'sk',      slovenian: 'sl',
  swedish: 'sv',    turkish: 'tr',
};

const WHISPER_URL = (process.env.WHISPER_URL || '').trim();
const WHISPER_PY  = ['1', 'true', 'on'].includes(String(process.env.WHISPER_PY || '').toLowerCase());
const PY_SCRIPT   = path.join(__dirname, '..', '..', '..', '..', 'scripts', 'whisper-local.py');
const TIMEOUT_MS  = parseInt(process.env.WHISPER_TIMEOUT_MS || '120000', 10);

function whisperMode() {
  if (WHISPER_URL) return 'server';
  if (WHISPER_PY && fs.existsSync(PY_SCRIPT)) return 'local';
  return null;
}

/* Servidor whisper.cpp: multipart a /inference */
async function transcribeViaServer(buffer, mimetype) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype || 'audio/webm' }), 'audio.webm');
  form.append('response_format', 'verbose_json');
  form.append('language', 'auto');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(WHISPER_URL.replace(/\/$/, '') + '/inference', { method: 'POST', body: form, signal: ctrl.signal });
    if (!res.ok) throw new Error('whisper-server ' + res.status);
    const j = await res.json();
    const lang = String(j.language || j.detected_language || '').toLowerCase();
    return { text: String(j.text || '').trim(), iso: WHISPER_TO_ISO[lang] || (lang.length === 2 ? lang : null), detected: lang || null };
  } finally { clearTimeout(timer); }
}

/* faster-whisper local: una transcripción a la vez (≈700 MB de RAM con "small") */
let localBusy = Promise.resolve();

function runPy(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.WHISPER_PYTHON || 'python3', ['-I', PY_SCRIPT, file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} reject(new Error('whisper timeout')); }, TIMEOUT_MS);
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err = (err + d.toString()).slice(-2000); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('whisper exit ' + code + ': ' + err.slice(-300)));
      try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch (e) { reject(e); }
    });
  });
}

async function transcribeLocal(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  const file = path.join(dir, crypto.randomBytes(6).toString('hex') + '.webm');
  const job = localBusy.then(async () => {
    fs.writeFileSync(file, buffer);
    const j = await runPy(file);
    return { text: String(j.text || '').trim(), iso: j.language || null, detected: j.language || null };
  });
  localBusy = job.catch(() => {});
  try { return await job; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

exports.transcribe = async (req, res) => {
  try {
    const mode = whisperMode();
    if (!mode) {
      return res.status(503).json({ ok: false, error: { code: 'VOICE_UNAVAILABLE', message: 'El dictado por voz no está disponible en este momento. Puedes escribir el texto directamente.' } });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: { code: 'NO_AUDIO', message: 'No audio file provided' } });
    }

    const writeLang = String(req.body.write_lang || 'es').toLowerCase();

    // 1. Transcribir (idioma hablado autodetectado)
    const t = mode === 'server'
      ? await transcribeViaServer(req.file.buffer, req.file.mimetype)
      : await transcribeLocal(req.file.buffer);
    let text = t.text;

    // 2. Traducir al idioma de trabajo si difiere (por el ai-bridge)
    const needsTranslation = text.length > 0 && t.iso !== writeLang;
    let translated = false;
    if (needsTranslation && ai.isConfigured()) {
      const targetName = LANG_NAMES[writeLang] || 'English';
      try {
        text = (await ai.callClaude(
          `You are a translator. Translate the following text to ${targetName}. Output ONLY the translated text, nothing else. Preserve the tone, meaning and style exactly. Do not add explanations.`,
          text, 2000, { model: 'cheap', temperature: 0.3 }
        )).trim();
        translated = true;
      } catch (e) {
        // Si falla la traducción devolvemos la transcripción original
        console.warn('[Voice] translation failed:', e.message);
      }
    }

    console.log(`[Voice] ${mode} · Detected: ${t.detected} (${t.iso}), Target: ${writeLang}, Translated: ${translated}`);
    res.json({ ok: true, text, detected: t.detected, translated });
  } catch (err) {
    console.error('[Voice] Transcription error:', err.message);
    res.status(500).json({ ok: false, error: { code: 'TRANSCRIBE_FAIL', message: 'No se pudo transcribir el audio. Inténtalo de nuevo.' } });
  }
};

exports.status = (req, res) => {
  res.json({ ok: true, data: { available: !!whisperMode() } });
};
