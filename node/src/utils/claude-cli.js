/* ── Claude CLI (suscripción) ─────────────────────────────────────────
   Invoca el Claude Code instalado y autenticado con la suscripción de
   Óscar, en modo headless (`claude -p`, prompt por stdin). NO usa la API
   (ANTHROPIC_API_KEY) — cero coste medido. Regla de negocio: la API solo
   se usa bajo autorización expresa de Óscar; este util es la vía "de
   momento" para features de IA en local.

   En entornos sin el CLI (VPS/contenedor de prod) `spawn` falla con
   ENOENT y el llamante debe degradar con un mensaje claro.

   Se puede desactivar explícitamente con VISION_AI_SUBSCRIPTION=off.     */

const { spawn } = require('child_process');
const os = require('os');

function available() {
  return process.env.VISION_AI_SUBSCRIPTION !== 'off';
}

/**
 * Ejecuta un prompt de un solo turno contra el Claude de suscripción.
 * @param {string} prompt  Prompt completo y autocontenido.
 * @param {object} opts     { timeoutMs?, model? }
 * @returns {Promise<string>} Texto de la respuesta (stdout, trim).
 */
function runSubscription(prompt, { timeoutMs = 180000, model } = {}) {
  return new Promise((resolve, reject) => {
    if (!available()) {
      const e = new Error('claude-cli disabled (VISION_AI_SUBSCRIPTION=off)');
      e.code = 'AI_DISABLED';
      return reject(e);
    }
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

module.exports = { runSubscription, available };
