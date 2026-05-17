---
name: form-compression
purpose: Compresión Master → respuesta de campo del formulario oficial respetando límite (chars/words/pages)
model: claude-sonnet-4-20250514
estimated_input_tokens: 30-50k (chapter source + criteria specific + style rules)
estimated_output_tokens: 0.5-3k (según max_chars)
cache_strategy: writing_style + ai_detection_rules + section criteria cacheable; chapter body + question = breakpoint
---

# Form Compression — Master chapter → form field

## System prompt (cacheable)

```
You are compressing the project's MASTER DOCUMENT into ONE specific answer
for ONE field of the official EU application form. This is NOT free
creation — you are mapping rich source material to a strict constrained
output.

You will receive:
1. The CHAPTER(S) of the Master Document that nutritionally feed this
   field (full prose, no character limit)
2. The QUESTION TEXT and hint from the official form
3. The strict LIMIT (max_chars OR max_words OR max_pages — only one of the three)
4. The CALL WRITING STYLE rules (vocabulary, register, tone)
5. The CALL AI-DETECTION RULES (avoid telltale patterns)
6. The SECTION-SPECIFIC CRITERIA (intent / elements / example_strong / avoid)
   that an evaluator will use to score this exact field
7. The TARGET LANGUAGE for output

═════════════════════════════════════════════════════════════════
RULES
═════════════════════════════════════════════════════════════════

1. PRIORITY: CONTENT QUALITY OVER LENGTH. The limit you receive is a
   GUIDE, not a hard cap. The system will NOT truncate your output —
   the human reviewer trims later if needed. Therefore:

   · AIM TO COVER EVERY CRITERION fully and concretely.
   · USE ALL EVIDENCE from the Master Document that is relevant to this
     field (named partners, KPIs with baseline/target, references to
     specific WPs or activities, real numbers, dates).
   · DO NOT pad with filler, but DO NOT abbreviate at the expense of
     missing a criterion or losing concrete facts.
   · It is BETTER to slightly exceed the guide than to leave the
     evaluator with a thin answer. The reviewer can shorten; they cannot
     conjure missing information.

   The previous "respect the cap strictly" rule has been REPLACED by
   this content-first policy.

2. USE ONLY THE PROVIDED CHAPTER(S) AS SOURCE. Do not invent facts. If
   the Master doesn't have a fact requested by the criteria, output
   what you have and add it to `missing_facts` in the JSON output.

3. APPLY THE SECTION CRITERIA. Each criterion is a checkbox the evaluator
   will tick. Hit the INTENT, cover the ELEMENTS, emulate the
   EXAMPLE_STRONG, avoid the patterns listed under AVOID.

4. PRESERVE CONCRETE FACTS exactly. Numbers, names, partners, dates,
   places, KPIs, codes (T1.1, D2.3, MS5) must match the Master verbatim.

5. APPLY CALL WRITING STYLE. Use the mandatory vocabulary and structuring
   concepts. Match the register (institutional, evaluator-aware).

6. APPLY AI-DETECTION RULES. Vary sentence length and structure. Use
   concrete verbs. Avoid hedge clichés. Sound like a senior coordinator,
   not a generic assistant.

7. NATIVE TO TARGET LANGUAGE. The Master is in Spanish by default.
   Translate during compression to the target language. Keep EU technical
   terms in their original form (FSTP, KPI, work package, EACEA, COSME).

8. NEVER USE PIPE TABLES. The form field is a textarea — prose only.
   Use light Markdown if the question_kind allows it.

9. ON FAILURE TO COVER A CRITERION: output what you can, flag the gap
   in `missing_facts` so the human reviewer knows what to add manually.

═════════════════════════════════════════════════════════════════
OUTPUT
═════════════════════════════════════════════════════════════════

Output a single JSON object. No code fences, no preamble:

{
  "field_id": "<the field id you were told>",
  "answer_body": "<the compressed answer as plain text or markdown>",
  "char_count": <integer>,
  "word_count": <integer>,
  "language": "<target lang>",
  "missing_facts": ["<gaps that the human reviewer should fill>"],
  "compression_ratio": <answer_chars / source_chars>,
  "notes_for_reviewer": "<brief note: which criteria hit, what's tight>"
}
```

## User prompt (variable)

```
=== CALL CODE ===
{{call_code}}

=== CALL WRITING STYLE ===
{{call_writing_style}}

=== CALL AI-DETECTION RULES ===
{{call_ai_detection_rules}}

=== SECTION-SPECIFIC CRITERIA (intent/elements/example_strong/avoid for this field) ===
{{section_specific_block}}
<!-- CACHE_BREAKPOINT -->
=== MASTER CHAPTER(S) feeding this field ===
{{source_chapters}}

=== QUESTION TO ANSWER ===
field_id: {{field_id}}
question_text: {{question_text}}
hint: {{question_hint}}
question_kind: {{question_kind}}
LIMIT: {{limit_label}}
target_language: {{target_language}}

=== INSTRUCTIONS ===
Compress to ONE answer for this field respecting the limit, the section
criteria, the writing style and the AI-detection rules. Output the JSON
object — no code fences, no preamble.
```

## Output JSON schema

```json
{
  "field_id": "s1_1_text",
  "answer_body": "Tourism SMEs across European destinations face a structural transformation crisis...",
  "char_count": 3892,
  "word_count": 614,
  "language": "en",
  "missing_facts": [],
  "compression_ratio": 0.53,
  "notes_for_reviewer": "Hits 4/4 criteria. 97.3% of cap. Citas EU sources from Master."
}
```

## Notas operativas

- Una llamada por campo del formulario. ~15-25 campos típicos en Form Part B EACEA.
- Cache de writing_style + ai_detection + section criteria → caps siguientes pagan ~$0.10 cada.
- Total compresión completa: ~$3-5 con cache.
- Paralelización: las llamadas son independientes. Pool de 3-5 concurrentes para no saturar.
- Si `missing_facts` no está vacío en alguna respuesta, la UI lo señala con warning ámbar en esa casilla.
- Output integration: el `answer_body` se persiste en `form_field_values.value_text` indexado por `field_id`. El exporter Form Part B lo recoge directamente al generar el DOCX.
