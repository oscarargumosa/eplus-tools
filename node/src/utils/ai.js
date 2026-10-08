/* ── Shared AI Utilities ───────────────────────────────────────
   Regla de negocio: IA SOLO por suscripción. Si AI_BRIDGE_URL está
   definida, TODO pasa por el ai-bridge del VPS (claude -p de la
   suscripción, ver docs/AI_BRIDGE.md) y nunca se llama a la API de
   Anthropic. La vía API (ANTHROPIC_API_KEY) queda solo como legado
   para entornos sin puente; sin puente y sin clave → AI_NOT_CONFIGURED.
   ─────────────────────────────────────────────────────────────── */

const pool = require('./db');
const aiContext = require('./aiContext');
const claudeCli = require('./claude-cli');

let Anthropic = null;

const DAILY_REFINE_CAP = parseInt(process.env.DAILY_REFINE_CAP || '50', 10);
// El puente rechaza prompts > 200 KB (413). Dejamos margen.
const BRIDGE_MAX_PROMPT_BYTES = parseInt(process.env.AI_BRIDGE_MAX_PROMPT_BYTES || String(195 * 1024), 10);
const BRIDGE_TIMEOUT_MS = parseInt(process.env.AI_BRIDGE_TIMEOUT_MS || '240000', 10);

function useBridge() { return claudeCli.bridgeEnabled(); }

/** ¿Hay alguna vía de IA disponible? (puente o, en legado, clave API) */
function isConfigured() {
  if (useBridge()) return claudeCli.available();
  return !!process.env.ANTHROPIC_API_KEY;
}

function notConfiguredError() {
  const e = new Error('La IA no está configurada en este servidor (falta AI_BRIDGE_URL).');
  e.code = 'AI_NOT_CONFIGURED';
  e.status = 503;
  return e;
}

function getClient() {
  // Con puente no se crea NUNCA el cliente de la API de pago.
  if (useBridge()) {
    const e = new Error('API de Anthropic desactivada: este servidor usa el ai-bridge (suscripción).');
    e.code = 'AI_API_DISABLED';
    throw e;
  }
  if (!Anthropic) Anthropic = require('@anthropic-ai/sdk');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw notConfiguredError();
  return new Anthropic({ apiKey: key });
}

/* ── Vía puente: el CLI solo recibe texto, así que system, historial y
   límite de longitud viajan dentro del propio prompt. ──────────────── */

// Modelo para el CLI: 'cheap' → haiku; si no, AI_BRIDGE_MODEL (vacío = el del CLI).
function bridgeModel(model) {
  if (model === 'cheap') return process.env.AI_BRIDGE_MODEL_CHEAP || 'haiku';
  return process.env.AI_BRIDGE_MODEL || undefined;
}

function lengthHint(maxTokens) {
  // Solo para salidas cortas: en las largas max_tokens era un tope de seguridad.
  if (!maxTokens || maxTokens > 1200) return '';
  return `\n\n(Length limit: keep your reply under about ${Math.round(maxTokens * 0.7)} words.)`;
}

function buildSinglePrompt(systemPrompt, userPrompt, maxTokens) {
  let p = '';
  if (systemPrompt) p += `<instructions>\n${systemPrompt}\n</instructions>\n\n`;
  p += userPrompt || '';
  return p + lengthHint(maxTokens);
}

/** Serializa un chat multi-turno a un único prompt de texto. */
function buildChatPrompt(systemPrompt, messages, maxTokens) {
  let p = '';
  if (systemPrompt) p += `<instructions>\n${systemPrompt}\n</instructions>\n\n`;
  p += '<conversation>\n';
  for (const m of messages || []) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = Array.isArray(m.content)
      ? m.content.map(c => (typeof c === 'string' ? c : c?.text || '')).join('\n')
      : String(m.content ?? '');
    p += `<${role}>\n${content}\n</${role}>\n`;
  }
  p += '</conversation>\n\n';
  p += 'You are the assistant in the conversation above. Write ONLY your next reply to the last user message, following the instructions. No role labels, no tags, no preamble.';
  return p + lengthHint(maxTokens);
}

async function runBridge(prompt, { model, timeoutMs, ctx: ctxOverride, endpoint } = {}) {
  if (!claudeCli.available()) throw notConfiguredError();
  if (Buffer.byteLength(prompt, 'utf8') > BRIDGE_MAX_PROMPT_BYTES) {
    const e = new Error(`El texto enviado a la IA es demasiado largo (${Math.round(Buffer.byteLength(prompt, 'utf8') / 1024)} KB; máximo ${Math.round(BRIDGE_MAX_PROMPT_BYTES / 1024)} KB).`);
    e.code = 'AI_PROMPT_TOO_LARGE';
    e.status = 413;
    throw e;
  }
  const ctx = { ...aiContext.get(), ...(ctxOverride || {}) };
  if (endpoint) ctx.endpoint = endpoint;
  const cliModel = bridgeModel(model);
  const t0 = Date.now();
  try {
    const text = await claudeCli.runSubscription(prompt, { timeoutMs: timeoutMs || BRIDGE_TIMEOUT_MS, model: cliModel });
    // Sin contador real de tokens: estimación 1 tok ≈ 3,5 caracteres.
    logUsage({ ctx, provider: 'ai-bridge', model: cliModel || 'cli-default',
      usage: { input_tokens: Math.ceil(prompt.length / 3.5), output_tokens: Math.ceil(text.length / 3.5) },
      status: 'success', durationMs: Date.now() - t0 });
    return text;
  } catch (err) {
    logUsage({ ctx, provider: 'ai-bridge', model: cliModel || 'cli-default', usage: null,
      status: err.code === 'AI_BUSY' ? 'busy' : 'error', durationMs: Date.now() - t0 });
    if (!err.status) err.status = err.code === 'AI_BUSY' ? 503 : 502;
    throw err;
  }
}

/* ── Usage logging (fire-and-forget, never throws) ──────────── */
async function logUsage({ ctx, model, usage, status, durationMs, provider }) {
  try {
    ctx = ctx || {};
    await pool.query(
      `INSERT INTO ai_usage_log
         (user_id, project_id, endpoint, provider, model,
          tokens_in, tokens_out, status, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ctx.userId || null,
        ctx.projectId || null,
        ctx.endpoint || null,
        provider || 'anthropic',
        model || null,
        usage?.input_tokens || 0,
        usage?.output_tokens || 0,
        status || 'success',
        durationMs || null,
      ]
    );
  } catch (err) {
    console.error('[ai-usage-log] insert failed:', err.message);
  }
}

/** Single-turn Claude call (system + one user message)
 *  opts: { model?: 'cheap' | id, timeoutMs?, temperature? } */
async function callClaude(systemPrompt, userPrompt, maxTokens = 4096, opts = {}) {
  if (useBridge()) {
    return runBridge(buildSinglePrompt(systemPrompt, userPrompt, maxTokens), opts);
  }
  const client = getClient();
  const model = opts.model === 'cheap'
    ? (process.env.AI_CHEAP_MODEL || 'claude-haiku-4-5-20251001')
    : (process.env.AI_MODEL || 'claude-sonnet-4-6');
  const ctx = aiContext.get();
  const t0 = Date.now();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: opts.temperature ?? 0.9,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    logUsage({ ctx, model, usage: response.usage, status: 'success', durationMs: Date.now() - t0 });
    return response.content[0]?.text || '';
  } catch (err) {
    logUsage({ ctx, model, usage: null, status: 'error', durationMs: Date.now() - t0 });
    throw err;
  }
}

/** Multi-turn Claude call (system + message history)
 *  Por el puente, el historial se serializa en un único prompt. */
async function callClaudeChat(systemPrompt, messages, maxTokens = 2048, opts = {}) {
  if (useBridge()) {
    return runBridge(buildChatPrompt(systemPrompt, messages, maxTokens), opts);
  }
  const client = getClient();
  const model = process.env.AI_MODEL || 'claude-sonnet-4-6';
  const ctx = aiContext.get();
  const t0 = Date.now();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      system: systemPrompt,
      messages,
    });
    logUsage({ ctx, model, usage: response.usage, status: 'success', durationMs: Date.now() - t0 });
    return response.content[0]?.text || '';
  } catch (err) {
    logUsage({ ctx, model, usage: null, status: 'error', durationMs: Date.now() - t0 });
    throw err;
  }
}

/* ── Circuit breaker ──────────────────────────────────────────
   Refine flow: Evaluar+Refinar ciclo completo = 3 Claude calls
   (refine/evaluate phase1 + refine/apply phase2 + phase3 re-eval).
   Cap is enforced on the `/refine/*` endpoints at controller level.
   Admins bypass.
   ─────────────────────────────────────────────────────────── */
async function countRefinesToday(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c
       FROM ai_usage_log
      WHERE user_id = ?
        AND endpoint LIKE '%/refine/%'
        AND status = 'success'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    [userId]
  );
  return rows[0]?.c || 0;
}

async function enforceRefineCap(userId, role) {
  if (!userId) return;
  if (role === 'admin') return;
  const n = await countRefinesToday(userId);
  if (n >= DAILY_REFINE_CAP) {
    const err = new Error(`Has alcanzado el límite diario de ${DAILY_REFINE_CAP} refinados. Vuelve mañana.`);
    err.code = 'RATE_LIMITED';
    err.status = 429;
    throw err;
  }
}

module.exports = {
  getClient,
  isConfigured,
  useBridge,
  runBridge,
  buildSinglePrompt,
  buildChatPrompt,
  callClaude,
  callClaudeChat,
  logUsage,
  enforceRefineCap,
  DAILY_REFINE_CAP,
};
