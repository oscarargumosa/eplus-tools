/* ═══════════════════════════════════════════════════════════════
   AI Parse — Extract project content into Form Part B structure
   Uses Claude API to parse document sections
   ═══════════════════════════════════════════════════════════════ */

let Anthropic = null;
const evalModel = require('../modules/evaluator/model');
const aiContext = require('../utils/aiContext');
const { logUsage } = require('../utils/ai');

const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';

/* ── Initialize client (lazy load SDK) ───────────────────────── */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  if (!Anthropic) {
    try { Anthropic = require('@anthropic-ai/sdk'); }
    catch (e) { throw new Error('Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk'); }
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/* ── Flatten template into leaf sections ─────────────────────── */
function flattenSections(templateJson) {
  const sections = [];

  if (templateJson.cover_page) {
    sections.push({
      id: templateJson.cover_page.id || 'cover',
      number: null,
      title: templateJson.cover_page.title || 'Cover Page',
      fields: templateJson.cover_page.fields || [],
    });
  }

  if (templateJson.project_summary) {
    sections.push({
      id: templateJson.project_summary.id || 'summary',
      number: null,
      title: templateJson.project_summary.title || 'Project Summary',
      fields: templateJson.project_summary.fields || [],
    });
  }

  for (const sec of (templateJson.sections || [])) {
    const subs = sec.subsections || [];
    const groups = sec.subsections_groups || [];

    if (subs.length === 0 && groups.length === 0 && sec.fields) {
      sections.push({ id: sec.id, number: sec.number, title: sec.title, fields: sec.fields || [], guidance: sec.guidance });
    }

    for (const sub of subs) {
      sections.push({ id: sub.id, number: sub.number, title: sub.title, fields: sub.fields || [], guidance: sub.guidance });
    }

    for (const grp of groups) {
      for (const sub of (grp.subsections || [])) {
        sections.push({ id: sub.id, number: sub.number, title: sub.title, fields: sub.fields || [], guidance: sub.guidance });
      }
    }
  }

  return sections;
}

/* ── Build fields description for prompt ─────────────────────── */
function buildSectionPrompt(sections) {
  let prompt = '';
  for (const sec of sections) {
    if (!sec.fields || sec.fields.length === 0) continue;
    const label = sec.number ? `Section ${sec.number}: ${sec.title}` : sec.title;
    prompt += `\n### ${label}\n`;
    for (const f of sec.fields) {
      prompt += `- Field ID: "${sec.id}.${f.id}" (type: ${f.type}) — ${f.label}\n`;
      if (f.type === 'table' && f.columns) {
        prompt += `  Table columns: ${f.columns.join(' | ')}\n`;
      }
    }
  }
  return prompt;
}

/* ── Main: parse in batches of sections ──────────────────────── */
async function parseDocument({ jobId, instanceId, documentText, templateJson }) {
  const client = getClient();
  const allSections = flattenSections(templateJson);
  const sectionsWithFields = allSections.filter(s => s.fields && s.fields.length > 0);
  const total = sectionsWithFields.length;

  console.log(`[AI-PARSE] Starting job ${jobId}: ${total} sections with fields`);

  await evalModel.updateParseJob(jobId, {
    status: 'processing',
    progress_json: { total, done: 0, sections_done: [], current: 'Preparando documento...' },
  });

  // Truncate document to ~120K words (~150K tokens) to stay within context
  const words = documentText.split(/\s+/);
  const maxWords = 120000;
  const docText = words.length > maxWords
    ? words.slice(0, maxWords).join(' ') + '\n[... document truncated ...]'
    : documentText;

  console.log(`[AI-PARSE] Document: ${words.length} words${words.length > maxWords ? ` (truncated to ${maxWords})` : ''}`);

  // Split sections into batches of ~5 to balance speed vs accuracy
  const BATCH_SIZE = 5;
  const batches = [];
  for (let i = 0; i < sectionsWithFields.length; i += BATCH_SIZE) {
    batches.push(sectionsWithFields.slice(i, i + BATCH_SIZE));
  }

  const sectionsDone = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const batchLabel = batch.map(s => s.number || s.id).join(', ');

    console.log(`[AI-PARSE] Batch ${b + 1}/${batches.length}: sections ${batchLabel}`);

    await evalModel.updateParseJob(jobId, {
      progress_json: {
        total,
        done: sectionsDone.length,
        sections_done: [...sectionsDone],
        current: `Secciones ${batchLabel}`,
      },
    });

    try {
      const fieldsPrompt = buildSectionPrompt(batch);
      const result = await parseBatch(client, docText, fieldsPrompt, batch);

      // Save each field value
      const vals = {};
      let fieldCount = 0;
      for (const [key, value] of Object.entries(result)) {
        if (value !== undefined && value !== null && value !== '') {
          vals[key] = value;
          fieldCount++;
        }
      }

      if (Object.keys(vals).length > 0) {
        await evalModel.saveFormValues(instanceId, vals);
      }

      for (const sec of batch) {
        sectionsDone.push(sec.id);
      }

      console.log(`[AI-PARSE] ✓ Batch ${b + 1} done (${fieldCount} fields filled)`);

    } catch (err) {
      console.error(`[AI-PARSE] ✗ Batch ${b + 1} failed:`, err.message);
      // Mark sections as done anyway so progress advances
      for (const sec of batch) sectionsDone.push(sec.id);
    }

    // Update progress
    await evalModel.updateParseJob(jobId, {
      progress_json: { total, done: sectionsDone.length, sections_done: sectionsDone, current: null },
    });
  }

  await evalModel.updateParseJob(jobId, {
    status: 'complete',
    progress_json: { total, done: sectionsDone.length, sections_done: sectionsDone, current: null },
  });

  console.log(`[AI-PARSE] Job ${jobId} complete: ${sectionsDone.length}/${total} sections`);
}

/* ── Parse a batch of sections ───────────────────────────────── */
async function parseBatch(client, documentText, fieldsPrompt, sections) {

  const ctx = aiContext.get();
  const t0 = Date.now();
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      messages: [{
      role: 'user',
      content: `You are an expert at extracting structured content from Erasmus+ project proposals (Form Part B format).

I have a project proposal document and I need you to extract the content for specific form sections and fields.

## FIELDS TO EXTRACT
${fieldsPrompt}

## DOCUMENT TEXT
${documentText}

## INSTRUCTIONS

1. Read the ENTIRE document carefully.
2. For each Field ID listed above, find the corresponding content in the document.
3. Project proposals typically follow numbered sections (1, 1.1, 1.2, 2.1, 2.1.1, etc.) but the document format may vary — the content may be under different headings or spread across the document.
4. For "textarea" fields: extract the FULL relevant text, preserving the original writing. Include all paragraphs that belong to that section.
5. For "text" or "email" fields: extract the specific short value.
6. For "table" fields: return a JSON array of arrays (rows × columns). Each row is an array of cell values.
7. If content for a field genuinely cannot be found, set the value to "" (empty string).
8. Use the Field ID exactly as given (format: "section_id.field_id").

## IMPORTANT
- Do NOT invent or fabricate content. Only extract what is actually in the document.
- Even if sections aren't numbered in the document, look for content by TOPIC (e.g., "risk management", "sustainability", "dissemination").
- Work packages might be described as "WP1", "WP2" etc. or under different naming.

Return ONLY a valid JSON object. No markdown, no explanation, no code fences.
Example: {"sec_1_1.s1_1_text": "The project addresses...", "cover.call_id": "ERASMUS-2026-YOUTH"}`
      }],
    });
    logUsage({ ctx, model: MODEL, usage: response.usage, status: 'success', durationMs: Date.now() - t0 });
  } catch (err) {
    logUsage({ ctx, model: MODEL, usage: null, status: 'error', durationMs: Date.now() - t0 });
    throw err;
  }

  const text = response.content[0]?.text || '{}';

  // Clean potential markdown wrapping
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(cleaned);
}

module.exports = { parseDocument, flattenSections };
