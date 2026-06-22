/* ═══════════════════════════════════════════════════════════════
   Anthropic Client — Master module, with prompt caching
   ═══════════════════════════════════════════════════════════════
   Wrapper sobre @anthropic-ai/sdk con prompt caching activado para
   la fase Perfeccionar (CAG). Lazy-init de cliente para no romper
   prod si la API key falla al cargar el módulo (ver memoria
   feedback-lazy-sdk-init — incidente voice 2026-04-26).

   Reutiliza ai_usage_log de node/src/utils/ai.js para tracking
   uniforme de tokens y coste.

   Uso:
     const { callWithCache } = require('./anthropic-client');
     const result = await callWithCache({
       systemBlocks: [
         { content: '<system prompt estable>', cache: true },
         { content: '<call docs cacheables>', cache: true },
       ],
       userBlocks: [
         { content: '<master + diseño actual>' },
       ],
       maxTokens: 8192,
       temperature: 0.4,
       ctx: { projectId, userId, endpoint: '/v1/master/compile-v1' },
     });
   ═══════════════════════════════════════════════════════════════ */

const pool = require('../../utils/db');
const aiContext = require('../../utils/aiContext');

let Anthropic = null;

function getClient() {
  if (!Anthropic) Anthropic = require('@anthropic-ai/sdk');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: key });
}

function getModel() {
  return process.env.AI_MODEL || 'claude-sonnet-4-6';
}

/* ── Usage logging (fire-and-forget, never throws) ──────────── */

async function logUsage({ ctx, model, usage, status, durationMs, endpoint }) {
  try {
    await pool.query(
      `INSERT INTO ai_usage_log
         (user_id, project_id, endpoint, provider, model,
          tokens_in, tokens_out, status, duration_ms)
       VALUES (?, ?, ?, 'anthropic', ?, ?, ?, ?, ?)`,
      [
        ctx.userId || null,
        ctx.projectId || null,
        endpoint || ctx.endpoint || null,
        model || null,
        (usage?.input_tokens || 0) + (usage?.cache_creation_input_tokens || 0) + (usage?.cache_read_input_tokens || 0),
        usage?.output_tokens || 0,
        status || 'success',
        durationMs || null,
      ]
    );
  } catch (err) {
    console.error('[anthropic-client] usage log failed:', err.message);
  }
}

/* ── Estimación rápida de tokens (heurística 1 tok ≈ 3.5 chars) ──
   Útil para previsualizar coste antes de tirar la llamada. */

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

function estimateCostUsd({ inputTokens, cachedTokens = 0, outputTokens }) {
  // Sonnet 4 precios (mayo 2025): $3/Mtok input, $15/Mtok output.
  // Cache read es ~10% del precio normal de input. Cache write es 1.25x.
  const inputCost  = (inputTokens - cachedTokens) * 3   / 1_000_000;
  const cachedCost = cachedTokens * 0.30                / 1_000_000;
  const outputCost = outputTokens * 15                  / 1_000_000;
  return inputCost + cachedCost + outputCost;
}

/* ── callWithCache: API principal del wrapper ─────────────────
   systemBlocks: array de bloques del system prompt. Cada bloque puede
                 marcarse con cache=true para incluir cache_control.
                 Anthropic permite hasta 4 cache breakpoints.
   userBlocks:   array de bloques del user message. Similar.
   maxTokens:    output cap (default 8192).
   temperature:  default 0.4 (más determinista que ai.js que usa 0.9).
   stream:       si true, devuelve un async iterable de eventos.
   ctx:          { projectId, userId, endpoint } para tracking. */

async function callWithCache({
  systemBlocks = [],
  userBlocks = [],
  maxTokens = 8192,
  temperature = 0.4,
  stream = false,
  ctx = {},
  endpoint = null,
}) {
  const client = getClient();
  const model = getModel();
  const fullCtx = { ...aiContext.get(), ...ctx };
  const t0 = Date.now();

  // Build system as array of typed blocks (text + cache_control)
  const system = systemBlocks
    .filter(b => b && b.content)
    .map(b => {
      const block = { type: 'text', text: b.content };
      if (b.cache) block.cache_control = { type: 'ephemeral' };
      return block;
    });

  // Build user message: similar pattern, multiple text blocks possible
  const userContent = userBlocks
    .filter(b => b && b.content)
    .map(b => {
      const block = { type: 'text', text: b.content };
      if (b.cache) block.cache_control = { type: 'ephemeral' };
      return block;
    });

  if (system.length === 0 && userContent.length === 0) {
    throw new Error('callWithCache: at least one system or user block required');
  }

  const payload = {
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: userContent.length ? userContent : [{ type: 'text', text: ' ' }] }],
  };

  // Anthropic SDK rechaza llamadas no-stream si max_tokens > 8192 (timeout 10 min).
  // Auto-switch a streaming "collected" cuando esto pase, manteniendo la API del caller.
  // Si el caller pasa onText, también va a streaming aunque maxTokens sea bajo —
  // útil para SSE / visualización en tiempo real.
  const needsStreaming = stream || maxTokens > 8192 || typeof arguments[0]?.onText === 'function';

  if (needsStreaming && !stream) {
    return await callWithCacheStreaming(client, payload, {
      ctx: fullCtx, model, t0, endpoint,
      onText: arguments[0]?.onText,
    });
  }

  if (stream) {
    // Streaming mode raw: caller iterates events. Logging happens at the end.
    const events = await client.messages.create({ ...payload, stream: true });
    return {
      events,
      finalize: async (usage) => {
        logUsage({ ctx: fullCtx, model, usage, status: 'success', durationMs: Date.now() - t0, endpoint });
      },
    };
  }

  try {
    const response = await client.messages.create(payload);
    logUsage({ ctx: fullCtx, model, usage: response.usage, status: 'success', durationMs: Date.now() - t0, endpoint });
    const text = (response.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return {
      text,
      usage: response.usage,
      stopReason: response.stop_reason,
      model,
      durationMs: Date.now() - t0,
      costUsd: estimateCostUsd({
        inputTokens: (response.usage?.input_tokens || 0) + (response.usage?.cache_creation_input_tokens || 0) + (response.usage?.cache_read_input_tokens || 0),
        cachedTokens: response.usage?.cache_read_input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      }),
    };
  } catch (err) {
    logUsage({ ctx: fullCtx, model, usage: null, status: 'error', durationMs: Date.now() - t0, endpoint });
    // Mejor error message para 429 (rate limit) y 5xx
    if (err.status === 429) {
      const e = new Error('Anthropic rate limit reached. Try again in a few seconds.');
      e.code = 'RATE_LIMITED';
      e.status = 429;
      throw e;
    }
    if (err.status >= 500) {
      const e = new Error('Anthropic temporarily unavailable. Try again later.');
      e.code = 'UPSTREAM_ERROR';
      e.status = 502;
      throw e;
    }
    throw err;
  }
}

/* ── Streaming collected: usa streaming pero acumula y devuelve
   el mismo shape que callWithCache normal. Necesario para
   llamadas con max_tokens > 8192 (límite del SDK Anthropic). ── */

async function callWithCacheStreaming(client, payload, { ctx, model, t0, endpoint, onText }) {
  let fullText = '';
  let finalUsage = null;
  let stopReason = null;

  try {
    const streamObj = await client.messages.stream(payload);

    streamObj.on('text', (textDelta) => {
      fullText += textDelta;
      if (typeof onText === 'function') {
        try { onText(textDelta, fullText); } catch (_) { /* swallow UI errors */ }
      }
    });

    // Esperar a que termine el stream
    const final = await streamObj.finalMessage();
    finalUsage = final.usage;
    stopReason = final.stop_reason;

    const inputTokens = (finalUsage?.input_tokens || 0) +
                        (finalUsage?.cache_creation_input_tokens || 0) +
                        (finalUsage?.cache_read_input_tokens || 0);
    const cachedTokens = finalUsage?.cache_read_input_tokens || 0;
    const outputTokens = finalUsage?.output_tokens || 0;

    logUsage({
      ctx, model,
      usage: finalUsage,
      status: 'success',
      durationMs: Date.now() - t0,
      endpoint,
    });

    return {
      text: fullText,
      usage: finalUsage,
      stopReason,
      model,
      durationMs: Date.now() - t0,
      costUsd: estimateCostUsd({ inputTokens, cachedTokens, outputTokens }),
    };
  } catch (err) {
    logUsage({ ctx, model, usage: finalUsage, status: 'error', durationMs: Date.now() - t0, endpoint });
    if (err.status === 429) {
      const e = new Error('Anthropic rate limit reached. Try again in a few seconds.');
      e.code = 'RATE_LIMITED';
      e.status = 429;
      throw e;
    }
    if (err.status >= 500) {
      const e = new Error('Anthropic temporarily unavailable. Try again later.');
      e.code = 'UPSTREAM_ERROR';
      e.status = 502;
      throw e;
    }
    throw err;
  }
}

/* ── Parsing helper: extract JSON object from LLM output ──────
   El LLM a veces envuelve el JSON en ```json ... ``` o lo
   acompaña con texto. Esta función extrae el primer objeto JSON
   válido. Si falla, devuelve null (caller decide qué hacer). */

function extractJson(text) {
  if (!text) return null;
  // Strip code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Try direct parse first
  try {
    return JSON.parse(candidate.trim());
  } catch (_) { /* try harder */ }
  // Find first balanced {...} or [...] block
  const start = Math.min(
    ...['{', '['].map(c => {
      const i = candidate.indexOf(c);
      return i === -1 ? Infinity : i;
    })
  );
  if (start === Infinity) return null;
  let depth = 0;
  let end = -1;
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === open) depth++;
    else if (candidate[i] === close) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

/* ── Self-test: dry-run sin gastar tokens ────────────────────
   Útil para verificar que el client está bien configurado
   sin tirar una llamada real. */

function selfCheck() {
  return {
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    apiKeyPrefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 12) + '...' : null,
    model: getModel(),
    sdkLoaded: Anthropic !== null,
  };
}

module.exports = {
  callWithCache,
  estimateTokens,
  estimateCostUsd,
  extractJson,
  selfCheck,
  getModel,
};
