/* ═══════════════════════════════════════════════════════════════
   Smart Shortlist — IA matching para Partner Engine
   ═══════════════════════════════════════════════════════════════
   Recibe lenguaje natural ("5 VET partners en España para KA220"),
   extrae filtros estructurados con LLM, los aplica sobre el atlas
   y devuelve los top N con un resumen de lo que el LLM ha entendido.
   ═══════════════════════════════════════════════════════════════ */

const m = require('./model');
const { callClaude, enforceRefineCap } = require('../../utils/ai');
const pool = require('../../utils/db');

const ok  = (res, data) => res.json({ ok: true, data });
const { sendError } = require('../../utils/httpError');
// 5xx: mensaje genérico + requestId (el detalle va al log). Ver utils/httpError.
const err = (res, msg, status = 400) => sendError(res, status, { message: msg });

/* ── Extrae JSON limpio de un texto de Claude (puede llevar md fences) */
function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/);
  const raw = fence ? fence[1] : text;
  // primer { hasta su match
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/* ── Carga las opciones (countries, categories, languages) desde stats_cache */
async function loadOptions() {
  const [rows] = await pool.query(
    `SELECT metric_key, value FROM stats_cache
     WHERE metric_key IN ('by_country','by_category','by_language')`
  );
  const out = { countries: [], categories: [], languages: [] };
  for (const r of rows) {
    let v = r.value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
    if (r.metric_key === 'by_country')  out.countries  = (v || []).map(x => x.country_code).filter(Boolean);
    if (r.metric_key === 'by_category') out.categories = (v || []).map(x => x.category).filter(Boolean);
    if (r.metric_key === 'by_language') out.languages  = (v || []).map(x => x.lang).filter(Boolean);
  }
  return out;
}

const CATEGORY_HINTS = {
  vet: 'vocational training providers',
  ka1: 'mobility-focused entities',
  ka2: 'cooperation partnerships',
  ka210: 'small-scale partnerships',
  ka220: 'cooperation partnerships',
  cove: 'centres of vocational excellence',
  inclusion: 'NGOs working with vulnerable groups',
};

exports.smartShortlist = async (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    if (!query) return err(res, 'query required');
    if (query.length > 600) return err(res, 'query too long (max 600 chars)');

    // Cap por usuario (reusa el contador de refinados; ajustable luego)
    try { await enforceRefineCap(req.user.id, req.user.role); }
    catch (e) { return err(res, e.message, e.status || 429); }

    const opts = await loadOptions();

    const systemPrompt = `Eres un asistente que ayuda a buscar entidades europeas en un directorio Erasmus+.
Tu única tarea es convertir una petición en lenguaje natural a un JSON con los filtros estructurados que se aplicarán al directorio.

Devuelves SOLO un objeto JSON válido. Sin texto antes ni después.

Esquema:
{
  "country":   string|null,   // ISO 2-letter; null si no especificado. Códigos disponibles: ${opts.countries.slice(0, 35).join(', ')}
  "category":  string|null,   // null si no especificado. Disponibles: ${opts.categories.slice(0, 20).join(', ')}
  "tier":      "premium"|"good"|"acceptable"|"premium+"|null,  // calidad de la ficha; "premium+" = premium o good
  "language":  string|null,   // ISO 2-letter web language; null si no aplica
  "has_email": boolean,       // true si pide explícitamente entidades contactables por email
  "has_phone": boolean,
  "count":     number,        // cuántas pedir (1-30); por defecto 5
  "q":         string|null,   // términos clave libres para full-text (ciudad, palabras del nombre, temas)
  "summary":   string         // 1 frase en español: qué has entendido
}

Reglas:
- "premium" en tier solo si el usuario pide explícitamente alta calidad; por defecto null.
- Si la petición menciona acrónimos KA210/KA220/KA1/KA2/CoVE/VET, usa eso como contexto pero NO los pongas en category (no son categorías de entidad).
- Para "VET": pon "vet" en category si está disponible, o usa q="VET vocational" si no.
- Si la petición habla de "5 partners", count=5. Si no especifica, count=5.
- summary debe ser corto y útil al usuario, no robótico.`;

    const userPrompt = `Petición: "${query}"\n\nDevuelve el JSON con los filtros.`;

    const raw = await callClaude(systemPrompt, userPrompt, 600);
    const parsed = extractJson(raw);
    if (!parsed) return err(res, 'No pude interpretar la petición. Reformula.', 422);

    const filters = {
      q:         parsed.q || '',
      country:   parsed.country || '',
      category:  parsed.category || '',
      tier:      parsed.tier || '',
      language:  parsed.language || '',
      has_email: parsed.has_email ? '1' : undefined,
      has_phone: parsed.has_phone ? '1' : undefined,
      sort:      'quality',
      page:      1,
      limit:     Math.max(1, Math.min(30, parseInt(parsed.count, 10) || 5)),
    };

    // Aplica los filtros al atlas
    let listing = await m.listEntities(filters);

    // Si vacío, intenta relajar tier (a veces el LLM pone "premium" sin necesidad)
    if (!listing.rows.length && filters.tier) {
      filters.tier = '';
      listing = await m.listEntities(filters);
    }

    ok(res, {
      interpretation: {
        ...parsed,
        original: query,
      },
      filters_applied: filters,
      results: listing.rows,
      total_matching: listing.meta.total,
    });
  } catch (e) {
    err(res, e.message, e.status || 500);
  }
};
