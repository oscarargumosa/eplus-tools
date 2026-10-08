/* ── Claude CLI (suscripción) ─────────────────────────────────────────
   Invoca el Claude Code instalado y autenticado con la suscripción de
   Óscar, en modo headless (`claude -p`, prompt por stdin). NO usa la API
   (ANTHROPIC_API_KEY) — cero coste medido. Regla de negocio: la API solo
   se usa bajo autorización expresa de Óscar; este util es la vía "de
   momento" para features de IA en local.

   En entornos sin el CLI (contenedor de prod) `spawn` fallaría con ENOENT,
   así que ahí se usa el **ai-bridge**: un servicio del host que expone ese
   mismo `claude -p` por HTTP a la red interna de Docker (sigue siendo la
   suscripción, no la API). Se activa poniendo AI_BRIDGE_URL; sin ella, el
   comportamiento es el de siempre (spawn local).

   Si no hay ni CLI ni puente, el llamante debe degradar con un mensaje claro.

   Se puede desactivar explícitamente con VISION_AI_SUBSCRIPTION=off.     */

const { spawn } = require('child_process');
const os = require('os');

const BRIDGE_URL = (process.env.AI_BRIDGE_URL || '').trim();

function available() {
  return process.env.VISION_AI_SUBSCRIPTION !== 'off';
}

/* ── Cola del puente ─────────────────────────────────────────────
   El ai-bridge admite AI_BRIDGE_CONCURRENCY (2) llamadas a la vez y
   devuelve 429 si está lleno (lo comparten otras apps del VPS). Aquí
   limitamos las nuestras con un semáforo y, si aun así llega un 429,
   reintentamos con backoff exponencial. Si la espera en cola supera
   AI_BRIDGE_QUEUE_TIMEOUT_MS, fallamos con AI_BUSY (mensaje claro).   */
const MAX_PARALLEL     = Math.max(1, parseInt(process.env.AI_BRIDGE_CONCURRENCY || '2', 10));
const MAX_RETRIES      = Math.max(0, parseInt(process.env.AI_BRIDGE_RETRIES || '4', 10));
const QUEUE_TIMEOUT_MS = parseInt(process.env.AI_BRIDGE_QUEUE_TIMEOUT_MS || '120000', 10);
// undici (fetch de Node) corta a los 300 s esperando cabeceras: no pedimos más.
const MAX_TIMEOUT_MS   = 290000;

let running = 0;
const waiters = [];

function acquire() {
  if (running < MAX_PARALLEL) { running++; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const w = { resolve, timer: null };
    w.timer = setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i !== -1) waiters.splice(i, 1);
      reject(busyError());
    }, QUEUE_TIMEOUT_MS);
    waiters.push(w);
  });
}

function release() {
  const w = waiters.shift();
  if (w) { clearTimeout(w.timer); w.resolve(); } // el hueco pasa al siguiente
  else running = Math.max(0, running - 1);
}

function busyError() {
  const e = new Error('La IA está ocupada en este momento. Inténtalo de nuevo en un minuto.');
  e.code = 'AI_BUSY';
  e.status = 503;
  return e;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Puente HTTP al CLI del host. Mismos errores que la vía local, para que
   el llamante no tenga que distinguir de dónde vino la respuesta.        */
async function bridgeOnce(prompt, { timeoutMs, model }) {
  const ctrl = new AbortController();
  // Margen de 5 s para que el timeout del puente (502) llegue antes que el nuestro.
  const timer = setTimeout(() => ctrl.abort(), timeoutMs + 5000);
  try {
    const res = await fetch(BRIDGE_URL.replace(/\/$/, '') + '/run', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token': process.env.AI_BRIDGE_TOKEN || '',
      },
      body: JSON.stringify({ prompt, model, timeoutMs }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return String(body.text || '').trim();
    const e = new Error('ai-bridge ' + res.status + ': ' + (body.error || 'sin detalle'));
    e.code = body.code || (res.status === 429 ? 'AI_BUSY' : res.status === 413 ? 'AI_PROMPT_TOO_LARGE' : 'AI_ERROR');
    e.httpStatus = res.status;
    throw e;
  } catch (e) {
    if (e.name === 'AbortError') {
      const t = new Error('La IA ha tardado demasiado en responder (más de ' + Math.round(timeoutMs / 1000) + ' s).');
      t.code = 'AI_TIMEOUT'; t.status = 504;
      throw t;
    }
    if (!e.code && e.name === 'TypeError') { // fetch failed: puente caído o inalcanzable
      const u = new Error('No se puede contactar con el servicio de IA (ai-bridge). Inténtalo más tarde.');
      u.code = 'AI_UNAVAILABLE'; u.status = 503;
      throw u;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function runViaBridge(prompt, { timeoutMs, model }) {
  timeoutMs = Math.min(timeoutMs, MAX_TIMEOUT_MS);
  await acquire();
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await bridgeOnce(prompt, { timeoutMs, model });
      } catch (e) {
        const busy = e.httpStatus === 429 || e.code === 'AI_BUSY';
        if (!busy) throw e;
        if (attempt >= MAX_RETRIES) throw busyError();
        // 1,5 s · 3 s · 6 s · 12 s (+ azar) — el puente lo comparten otras apps
        await sleep(1500 * 2 ** attempt + Math.floor(Math.random() * 500));
      }
    }
  } finally {
    release();
  }
}

function bridgeEnabled() { return !!BRIDGE_URL; }

/**
 * Ejecuta un prompt de un solo turno contra el Claude de suscripción.
 * @param {string} prompt  Prompt completo y autocontenido.
 * @param {object} opts     { timeoutMs?, model? }
 * @returns {Promise<string>} Texto de la respuesta (stdout, trim).
 */
function runSubscription(prompt, { timeoutMs = 180000, model } = {}) {
  if (!available()) {
    const e = new Error('claude-cli disabled (VISION_AI_SUBSCRIPTION=off)');
    e.code = 'AI_DISABLED';
    return Promise.reject(e);
  }
  if (BRIDGE_URL) return runViaBridge(prompt, { timeoutMs, model });
  return new Promise((resolve, reject) => {
    const args = ['-p'];
    if (model) args.push('--model', model);
    // shell:true → compat Windows (claude es un shim npm .cmd). El prompt
    // va por stdin, no por la línea de comandos, así que no hay inyección.
    const child = spawn('claude', args, { shell: true, windowsHide: true, cwd: os.tmpdir() });
    let out = '', err = '';
    const timer = setTimeout(() => { try { child.kill(); } catch {} const e = new Error('claude-cli timeout'); e.code = 'AI_TIMEOUT'; reject(e); }, timeoutMs);
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out.trim());
      const e = new Error('claude-cli exit ' + code + ': ' + err.slice(0, 300));
      e.code = 'AI_ERROR';
      reject(e);
    });
    child.stdin.on('error', () => {}); // EPIPE si el hijo muere pronto
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

module.exports = { runSubscription, available, bridgeEnabled };
