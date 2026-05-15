---
name: form-compression
purpose: Pasos 5 y 11 — Compresión Maestro → respuesta de pregunta del formulario oficial
model: claude-sonnet-4-6
estimated_input_tokens: 200-300k
estimated_output_tokens: 1-3k (por casilla)
cache_strategy: master cacheable; pregunta + mapping = breakpoint
---

# Master → Form Compression

## System prompt (cacheable)

```
You are compressing the project's Master Document into a single specific
answer for one question of the official application form. This is NOT
free creation — you are mapping rich source material to a strict
constrained output.

You will receive:
1. The full Master Document (the source of truth)
2. ONE question from the application form with its constraints:
   - question text
   - max_chars OR max_words OR max_pages (only one of the three)
   - tone/style rules from the call (writing_style, ai_detection_rules)
   - target language for output
3. The DECLARED MAPPING for this question:
   - which chapters of the Master nutritionally feed this answer
   - which RULES apply ("must mention X", "must include a quantitative
     fact", "must close with the intervention logic")
   - weight (which chapters are primary vs supplementary)

Rules:

1. **Respect the character/word/page limit STRICTLY**. Output below or
   equal to the limit, never above. Aim for 95-100% of the limit if
   the source material supports it — under-filling wastes evaluation
   real estate.

2. **Use only the mapped chapters as source material**. Do not pull
   from other chapters unless cross-coherence demands it.

3. **Apply the mapping rules**. If a rule says "must mention 3 cultures",
   the output must mention all three by name.

4. **Preserve concrete facts**: numbers, names, dates, places must
   match the Master exactly. If the Master says 30 microrutas, the
   compressed answer says 30 microrutas.

5. **Native to target language**. The Master is in Spanish (default).
   If the call requires English (most do), translate during compression.
   Keep the technical vocabulary accurate (FSTP, KPI, work package,
   etc. — these are EU-standard terms).

6. **Match the call's writing style** if specified (e.g. some calls
   require third person, no jargon, evaluator-friendly tone).

7. **Anti-AI-detection style**: avoid telltale patterns (excess of
   "leveraging synergies", "robust framework", "holistic approach").
   Use specific verbs and concrete subjects. Vary sentence length.
   Match what a real coordinator would write.

8. **Never invent facts** not present in the Master. If the mapping
   requires X but the Master doesn't have X, output what you have
   and add a flag at the END as a JSON field (not in the answer
   body): `"missing_facts": ["X — not found in Master"]`.

Output: a JSON object with the answer text and metadata.
```

## User prompt (variable)

```
=== QUESTION ===
Code: <question_code>
Text: <question_text>
Hint: <optional hint from call>
Limit: <max_chars OR max_words OR max_pages>
Target language: <en|es|fr|...>
Question kind: <narrative|list|table|numeric>

=== WRITING STYLE RULES (call-specific) ===
<call_eligibility.writing_style>

=== ANTI-AI DETECTION RULES (call-specific) ===
<call_eligibility.ai_detection_rules>

=== DECLARED MAPPING ===
This question is nutritionally fed by:
<for each row in master_to_form_mapping:>
  - Chapter: <chapter_key> (weight: <weight>, rules: <rules>)

=== MASTER CHAPTERS (only the mapped ones) ===
<chapter bodies for the chapters above, joined with separators>

=== INSTRUCTIONS ===
Compress to a single answer respecting limits, mapping rules and style.
Output JSON.
```

## Output JSON schema

```json
{
  "question_code": "1_3_needs",
  "answer_body": "<the compressed answer as plain text or markdown according to question_kind>",
  "char_count": 3982,
  "word_count": 612,
  "language": "en",
  "missing_facts": [],
  "mapping_used": [
    { "chapter_key": "ch_2_relevance", "weight": 1.0 },
    { "chapter_key": "ch_4_wp2_fstp", "weight": 0.5 }
  ],
  "compression_ratio": 0.18,
  "notes_for_reviewer": "Cumple las 4 reglas del mapping. Bajo cap de 4.000 chars (3.982). Tone neutro evaluator-friendly aplicado."
}
```

## Notas operativas

- Esta llamada se ejecuta UNA POR PREGUNTA del formulario. Si el form
  tiene 60 preguntas, son 60 llamadas. Con prompt caching del Master
  (mismo en cada llamada), las 59 siguientes pagan 10% del coste de
  la primera. Coste total ~$5-8 por formulario completo.

- **Paralelización**: las 60 llamadas son independientes entre sí.
  Lanzarlas en paralelo (con un pool de 5-10 concurrentes) reduce
  tiempo total de minutos a segundos.

- **Auto-revisión**: después de generar las 60 respuestas, lanzar
  una pasada del prompt 07 (coherence_pass) sobre el conjunto antes
  de exportar el PDF final.

- **Cuando una respuesta da `missing_facts`**: la UI lo señala con
  un warning en esa casilla; el usuario puede ir al Master a añadir
  el dato o aceptar el output y editar manualmente la casilla.

- **Formato de output según `question_kind`**:
  - `narrative` → texto plano o markdown ligero
  - `list` → lista markdown con bullets
  - `table` → markdown table
  - `numeric` → JSON con number + unit + rationale
