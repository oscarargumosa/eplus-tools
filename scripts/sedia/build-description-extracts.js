/**
 * build-description-extracts.js
 *
 * Muchas calls SEDIA (Horizon, Euratom, EuropeAid, …) no publican un "call
 * fiche" PDF por topic: su documento es el Work Programme multi-topic. Pero el
 * API de SEDIA sí da la descripción del topic (objetivos, scope, expected
 * outcomes), que `sync.js extract` guarda como data/calls/<slug>/description.md.
 *
 * Este paso convierte esa descripción en un "extract" (data/call_extracts/
 * <slug>.json) con el MISMO formato que los extracts de PDF, para que
 * structure-call.js genere su FAQ + scope_summary igual que con un PDF.
 *
 * No pisa los extracts de PDF (más ricos): solo crea entrada cuando NO existe ya
 * un extract para esa call. Solo procesa calls visibles (no cerradas / deadline
 * futuro) con descripción suficientemente larga.
 *
 * Orden en el pipeline:  sync extract  →  (fetch-call-pdfs + extract-call-text)
 *                        →  build-description-extracts  →  structure-call
 *
 * Usage:
 *   node scripts/sedia/build-description-extracts.js [--force] [--min=600]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CALLS_DIR = path.join(__dirname, '..', '..', 'data', 'calls');
const OUT_DIR = path.join(__dirname, '..', '..', 'data', 'call_extracts');
const STRUCTURED_DIR = path.join(__dirname, '..', '..', 'data', 'call_structured');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const MIN_CHARS = (() => {
  const a = args.find((x) => x.startsWith('--min='));
  return a ? parseInt(a.split('=')[1], 10) : 600;
})();

function slugifyId(id) {
  return id.replace(/[\/\\:*?"<>|]/g, '_');
}

function htmlToText(h) {
  return h
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);

  let created = 0, existing = 0, thin = 0, noDesc = 0, notVisible = 0;
  for (const dir of fs.readdirSync(CALLS_DIR)) {
    if (dir.startsWith('_')) continue;
    const base = path.join(CALLS_DIR, dir);
    if (!fs.statSync(base).isDirectory()) continue;
    const tp = path.join(base, 'topic.json');
    if (!fs.existsSync(tp)) continue;
    let topic;
    try { topic = JSON.parse(fs.readFileSync(tp, 'utf8')); } catch { continue; }
    const sid = topic.identifier;
    if (!sid) continue;

    // Solo visibles (mismas reglas que el grid de Convocatorias).
    if (String(topic.status || '').toLowerCase() === 'closed') { notVisible++; continue; }
    if (topic.deadline && String(topic.deadline) < today) { notVisible++; continue; }

    // Nunca regenerar una call que YA tiene call_structured (manual o de PDF):
    // crear su extract haría que structure-call la sobrescribiese con una versión
    // peor. Solo generamos extracts para calls SIN FAQ todavía. (--force lo salta.)
    if (!FORCE && fs.existsSync(path.join(STRUCTURED_DIR, slugifyId(sid) + '.json'))) { existing++; continue; }

    // Nunca pisar un extract de PDF (más rico). Solo regeneramos los que este
    // mismo script creó (source: 'description'); un extract de PDF se respeta.
    const outPath = path.join(OUT_DIR, slugifyId(sid) + '.json');
    if (fs.existsSync(outPath)) {
      let prev = null;
      try { prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}
      if (!(FORCE || (prev && prev.source === 'description'))) { existing++; continue; }
    }

    // Texto de la descripción del topic.
    let desc = '';
    const mdP = path.join(base, 'description.md');
    const htP = path.join(base, 'description.html');
    if (fs.existsSync(mdP)) desc = fs.readFileSync(mdP, 'utf8');
    else if (fs.existsSync(htP)) desc = htmlToText(fs.readFileSync(htP, 'utf8'));
    desc = desc.replace(/\r/g, '').trim();
    if (!desc) { noDesc++; continue; }
    if (desc.length < MIN_CHARS) { thin++; continue; }

    // Bloque de datos de la convocatoria, para que el FAQ cuantitativo
    // (presupuesto, nº de proyectos, fechas) salga con datos reales en vez de
    // "el documento no lo especifica" (que el frontend oculta).
    const b = topic.budget || {};
    const eur = (n) => (n ? `${Number(n).toLocaleString('es-ES')} €` : null);
    const factLines = [
      ['Programa', topic.programme],
      ['Tipo de acción', topic.actionType],
      ['Presupuesto total estimado', eur(b.total_eur)],
      ['Nº de subvenciones previstas', b.expected_grants],
      ['Contribución mínima por proyecto', eur(b.min_contribution_eur)],
      ['Contribución máxima por proyecto', eur(b.max_contribution_eur)],
      ['Apertura', topic.opening],
      ['Fecha límite', topic.deadline ? `${topic.deadline}${topic.deadlineModel ? ` (${topic.deadlineModel})` : ''}` : null],
    ].filter(([, v]) => v !== null && v !== undefined && v !== '');
    const facts = factLines.map(([k, v]) => `- ${k}: ${v}`).join('\n');
    const text = `=== DATOS DE LA CONVOCATORIA ===\n${facts}\n\n=== DESCRIPCIÓN DEL TOPIC ===\n${desc}`;

    fs.writeFileSync(outPath, JSON.stringify({
      source_id: sid,
      source_url: topic.topicUrl || null,
      source: 'description', // provenance: descripción del topic (API), no un PDF
      num_pages: null,
      num_chars: text.length,
      text,
      extracted_at: new Date().toISOString(),
    }, null, 2));
    created++;
  }

  console.log(`[desc-extracts] creados: ${created} | ya existían (PDF u otro): ${existing} | descripción <${MIN_CHARS} chars: ${thin} | sin descripción: ${noDesc} | no visibles: ${notVisible}`);
}

main();
