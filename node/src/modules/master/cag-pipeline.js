/* ═══════════════════════════════════════════════════════════════
   CAG Pipeline — Carga prompts, sustituye variables, llama Anthropic
   ═══════════════════════════════════════════════════════════════
   Lee templates de docs/PROMPTS_CAG/*.md, parsea su frontmatter,
   extrae system prompt + user prompt template, sustituye variables
   con interpolación segura, llama al cliente Anthropic con caching
   activado y devuelve el output parseado como JSON.

   Convención de templates (ver docs/PROMPTS_CAG/README.md):

     ---
     name: <slug>
     purpose: <descripción corta>
     model: <override opcional>
     ---

     ## System prompt (cacheable)

     ```
     <texto del system prompt>
     ```

     ## User prompt (variable)

     ```
     <user prompt con {{placeholders}}>
     ```

   Las variables se inyectan con sustitución literal de {{key}} por
   el valor correspondiente del objeto vars. Sin lógica condicional,
   sin loops — si necesitas armar un bloque complejo, lo pre-armas
   en el caller y se lo pasas como una sola variable.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { callWithCache, extractJson, estimateTokens } = require('./anthropic-client');

const PROMPTS_DIR = path.join(__dirname, '..', '..', '..', '..', 'docs', 'PROMPTS_CAG');

/* ── Cache de templates en memoria (lectura única por proceso) ──
   Los prompts no cambian entre llamadas durante la vida del proceso.
   Releemos si el mtime del fichero cambia (útil en desarrollo). */

const templateCache = new Map();

function loadTemplate(promptKey) {
  const filePath = path.join(PROMPTS_DIR, promptKey + (promptKey.endsWith('.md') ? '' : '.md'));
  const stat = fs.statSync(filePath);
  const cached = templateCache.get(filePath);
  if (cached && cached.mtime === stat.mtimeMs) return cached.parsed;

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parseTemplate(raw, promptKey);
  templateCache.set(filePath, { mtime: stat.mtimeMs, parsed });
  return parsed;
}

function parseTemplate(raw, promptKey) {
  // Normaliza line endings — los templates editados en Windows vienen
  // con CRLF y el regex del frontmatter es sensible al separador.
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Frontmatter delimitado por --- al inicio
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error(`Template ${promptKey} sin frontmatter`);
  }
  const fm = parseFrontmatter(fmMatch[1]);
  const body = fmMatch[2];

  // Bloques de código triple-backtick dentro de secciones marcadas
  // System prompt: primera sección "## System prompt..." con ``` ... ```
  // User prompt: sección "## User prompt..." con ``` ... ```
  const systemBlock = extractCodeBlockUnder(body, /##\s+System prompt/i);
  const userBlock   = extractCodeBlockUnder(body, /##\s+(?:Per-turn )?[Uu]ser prompt/);
  const outputBlock = extractCodeBlockUnder(body, /##\s+Output(?:\s+JSON\s+schema)?/i);

  return {
    name: fm.name || promptKey,
    model: fm.model || null,
    purpose: fm.purpose || null,
    systemTemplate: systemBlock || '',
    userTemplate: userBlock || '',
    outputHint: outputBlock || null,
    raw,
  };
}

function parseFrontmatter(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

function extractCodeBlockUnder(body, sectionPattern) {
  // Find the section heading, then the next ``` block after it
  const m = body.match(sectionPattern);
  if (!m) return null;
  const after = body.slice(m.index);
  // Buscamos el primer triple-backtick block (puede ser ``` o ```text/json/etc)
  const codeMatch = after.match(/```[a-z]*\n([\s\S]*?)\n```/);
  return codeMatch ? codeMatch[1] : null;
}

/* ── Sustitución de variables ─────────────────────────────────
   Reemplaza {{varName}} en el template por vars[varName].
   Si una variable referenciada no está en vars, deja el placeholder
   intacto y registra warning (para debug). */

function substitute(template, vars) {
  if (!template) return '';
  const warnings = [];
  const result = template.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (match, key) => {
    if (vars[key] === undefined || vars[key] === null) {
      warnings.push(key);
      return match;
    }
    return String(vars[key]);
  });
  if (warnings.length) {
    console.warn(`[cag-pipeline] missing vars: ${[...new Set(warnings)].join(', ')}`);
  }
  return result;
}

/* ── runPrompt: API principal ─────────────────────────────────
   Ejecuta un prompt completo y devuelve { text, parsed, usage, cost }.
   - promptKey: nombre del fichero sin .md (ej. "01_compile_master_v1")
   - vars: objeto con las variables a sustituir
   - opts: { maxTokens, temperature, ctx, endpoint, cacheableUserBlocks }
   - cacheableUserBlocks: array adicional de bloques user marcados como
     cacheables (típicamente call_documents body_text que son grandes
     y estables entre llamadas a distintos prompts del mismo proyecto).
*/

async function runPrompt(promptKey, vars = {}, opts = {}) {
  const tpl = loadTemplate(promptKey);

  // System prompt: siempre cacheable (es estable por prompt y por sesión)
  const systemText = tpl.systemTemplate;
  const systemBlocks = [{ content: systemText, cache: true }];

  // User prompt: si contiene <!-- CACHE_BREAKPOINT -->, partir en 2 bloques.
  // El primero (cacheable) lleva las partes pesadas y estables (criteria, design,
  // writer draft, interviews). El segundo (variable) lleva los datos por capítulo.
  const userTextFull = substitute(tpl.userTemplate, vars);
  const userBlocks = [];

  if (opts.cacheableUserBlocks && Array.isArray(opts.cacheableUserBlocks)) {
    for (const block of opts.cacheableUserBlocks) {
      if (block && block.content) {
        userBlocks.push({ content: block.content, cache: true });
      }
    }
  }

  const cacheMarker = '<!-- CACHE_BREAKPOINT -->';
  if (userTextFull.includes(cacheMarker)) {
    const parts = userTextFull.split(cacheMarker);
    // Todas las partes intermedias se marcan cacheables; solo la última es variable.
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i].trim()) userBlocks.push({ content: parts[i], cache: true });
    }
    userBlocks.push({ content: parts[parts.length - 1], cache: false });
  } else {
    userBlocks.push({ content: userTextFull, cache: false });
  }

  // Pre-llamada: log estimación de tokens
  const estimatedInput = estimateTokens(systemText) +
    userBlocks.reduce((s, b) => s + estimateTokens(b.content || ''), 0);
  const cacheableTokens = estimateTokens(systemText) +
    userBlocks.filter(b => b.cache).reduce((s, b) => s + estimateTokens(b.content || ''), 0);
  console.log(`[cag] runPrompt(${promptKey}) — input ≈ ${estimatedInput} tokens (${userBlocks.length} user blocks, ${userBlocks.filter(b => b.cache).length} cacheable, ~${cacheableTokens} cacheable tokens)`);

  const response = await callWithCache({
    systemBlocks,
    userBlocks,
    maxTokens: opts.maxTokens || 8192,
    temperature: opts.temperature ?? 0.4,
    ctx: opts.ctx || {},
    endpoint: opts.endpoint || `cag:${promptKey}`,
    onText: opts.onText,
  });

  // Try to extract JSON from output
  const parsed = extractJson(response.text);

  return {
    promptKey,
    text: response.text,
    parsed,
    usage: response.usage,
    model: response.model,
    durationMs: response.durationMs,
    costUsd: response.costUsd,
    parseWarning: parsed === null ? 'Could not extract JSON from output (raw text in .text)' : null,
  };
}

/* ── dryRun: simular runPrompt sin tirar llamada ─────────────
   Útil para tests, previews de coste, depuración. */

function dryRun(promptKey, vars = {}, opts = {}) {
  const tpl = loadTemplate(promptKey);
  const userText = substitute(tpl.userTemplate, vars);
  const extras = (opts.cacheableUserBlocks || []).reduce((s, b) => s + (b.content || '').length, 0);
  const inputTokens = estimateTokens(tpl.systemTemplate) +
    estimateTokens(userText) +
    Math.ceil(extras / 3.5);

  return {
    promptKey,
    systemPreview: tpl.systemTemplate.substring(0, 500),
    userPreview: userText.substring(0, 500),
    inputTokensEst: inputTokens,
    cacheableTokensEst: Math.ceil(extras / 3.5) + estimateTokens(tpl.systemTemplate),
    estimatedFirstCallCostUsd:
      (inputTokens * 3 + Math.ceil(extras / 3.5) * 1.25) / 1_000_000 +
      (opts.maxTokens || 8192) * 15 / 1_000_000,
    estimatedCachedCallCostUsd:
      ((inputTokens - estimateTokens(tpl.systemTemplate) - Math.ceil(extras / 3.5)) * 3 +
       (estimateTokens(tpl.systemTemplate) + Math.ceil(extras / 3.5)) * 0.30) / 1_000_000 +
      (opts.maxTokens || 8192) * 15 / 1_000_000,
  };
}

/* ── List available prompts (introspection) ───────────────── */

function listPrompts() {
  if (!fs.existsSync(PROMPTS_DIR)) return [];
  return fs.readdirSync(PROMPTS_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('README'))
    .map(f => f.replace(/\.md$/, ''))
    .sort();
}

module.exports = {
  runPrompt,
  dryRun,
  listPrompts,
  loadTemplate,
  substitute,
};
