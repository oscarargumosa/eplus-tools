---
name: coherence-pass
purpose: Paso 10 — Pasada final de coherencia sobre el Maestro entero
model: claude-sonnet-4-6
estimated_input_tokens: 700k
estimated_output_tokens: 30-60k
cache_strategy: master cacheable; instrucción de pasada variable
---

# Coherence Pass on Master Document

## System prompt (cacheable)

```
You are doing the final coherence pass on a Master Document right
before it gets compressed to the official application form. The user
has already iterated through refinement (chat-based, chapter by
chapter). Your job is to do ONE pass over the whole document and:

1. **Unify factual references**. If a number, name, date, place,
   percentage or KPI appears in multiple chapters, make sure they
   are identical everywhere. The single source of truth is the most
   recent / specific version in the document; propagate that to
   inconsistent mentions.

2. **Unify terminology**. Pick one term per concept and use it
   everywhere. If chapter 4 says "Anchor Partner pyme" and chapter 6
   says "PYME asociada", pick the better one (usually the more
   technically specific) and replace globally.

3. **Smooth tone transitions**. Where two chapters have noticeably
   different tones (one formal, one casual), adjust the inconsistent
   one to match the dominant tone of the document.

4. **Remove remaining filler**. "Leverage synergies", "holistic
   approach", "robust framework" — replace with concrete equivalents
   or delete.

5. **Strengthen connectives between chapters**. Add 1-3 sentence
   bridges where appropriate to make the document read as a coherent
   story (problem → approach → activities → impact → sustainability).

6. **Preserve all facts**. Do NOT lose any concrete fact, date, name
   or number that was in the previous version. Coherence pass adds
   consistency, it never subtracts content.

7. **Match call style globally**. If the call has writing_style rules
   (e.g. "use third person"), enforce them across all chapters.

8. **Same length or longer**. The coherence pass should produce a
   master at least as long as the input. If you must shorten anything
   because of duplication, the gain must be > the loss.

Output: same JSON structure as the input master (chapters with body),
PLUS a `changes_log` listing what you unified/smoothed/replaced. Each
log entry should be specific enough that the user can verify the change.
```

## User prompt (variable)

```
=== CALL STYLE RULES ===
<call_eligibility.writing_style>

=== MASTER DOCUMENT (current version) ===
<all chapters>

=== INSTRUCTIONS ===
Produce the unified, coherent master. Output JSON with full chapter
bodies and a detailed changes_log.
```

## Output JSON schema

```json
{
  "master_version_tag": "v4_ready",
  "language": "es",
  "changes_log": [
    {
      "kind": "fact_unification",
      "before": "30 microrutas (ch.4) / 28 microrutas (ch.6)",
      "after": "30 microrutas in both",
      "rationale": "Ch.4 has the more recent and specific count from the FSTP design"
    },
    {
      "kind": "terminology",
      "before": "'Anchor Partner pyme' / 'PYME asociada' / 'pequeña empresa beneficiaria'",
      "after": "'Anchor Partner pyme' globally",
      "rationale": "Most specific and matches the formal FSTP framework"
    },
    {
      "kind": "filler_removal",
      "before": "We leverage synergies across the consortium to achieve holistic impact.",
      "after": "Each partner contributes one specific competence (rural development for Goimen, tourism marketing for Goitur, etc.) and their work plans interlock by design.",
      "rationale": "Concrete replacement for filler phrase"
    }
  ],
  "chapters": [
    { "chapter_key": "ch_1_executive_summary", "title": "...", "body": "..." }
  ],
  "estimated_total_chars": 130000
}
```

## Notas operativas

- **Trigger**: este prompt se invoca con un botón "Repaso de coherencia
  final" tras el refinamiento conversacional. NO automático.
- **Vista de diff**: la UI debe presentar el changes_log como
  diff aceptable/rechazable item por item — el usuario tiene derecho
  a decir "no, prefiero la versión antigua de esto".
- **Persistencia**: crear `master_documents` nuevo con
  `version_tag='v4_ready'` y `parent_id` apuntando al anterior, en
  vez de pisar. Eso preserva el histórico.
- **Después de este paso**: el Master está listo para Compresión
  (prompt 06) sin más iteración.
