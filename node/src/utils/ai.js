/* ── Shared AI Utilities ─────────────────────────────────────── */

const pool = require('./db');
const aiContext = require('./aiContext');

let Anthropic = null;

const DAILY_REFINE_CAP = parseInt(process.env.DAILY_REFINE_CAP || '50', 10);

function getClient() {
  if (!Anthropic) Anthropic = require('@anthropic-ai/sdk');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: key });
}

/* ── Usage logging (fire-and-forget, never throws) ──────────── */
async function logUsage({ ctx, model, usage, status, durationMs }) {
  try {
    await pool.query(
      `INSERT INTO ai_usage_log
         (user_id, project_id, endpoint, provider, model,
          tokens_in, tokens_out, status, duration_ms)
       VALUES (?, ?, ?, 'anthropic', ?, ?, ?, ?, ?)`,
      [
        ctx.userId || null,
        ctx.projectId || null,
        ctx.endpoint || null,
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

/** Single-turn Claude call (system + one user message) */
async function callClaude(systemPrompt, userPrompt, maxTokens = 4096) {
  const client = getClient();
  const model = process.env.AI_MODEL || 'claude-sonnet-4-6';
  const ctx = aiContext.get();
  const t0 = Date.now();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.9,
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

/** Multi-turn Claude call (system + message history) */
async function callClaudeChat(systemPrompt, messages, maxTokens = 2048) {
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
  callClaude,
  callClaudeChat,
  logUsage,
  enforceRefineCap,
  DAILY_REFINE_CAP,
};
