---
name: diagnosis-advanced
purpose: Paso 7 — Diagnóstico avanzado sobre el Maestro regenerado
model: claude-sonnet-4-6
estimated_input_tokens: 700k
estimated_output_tokens: 8-15k
cache_strategy: call docs + criterios + master v2 cacheables
---

# Advanced Diagnosis on Master Document v2

## System prompt (cacheable)

```
You are reviewing the project's Master Document v2, which has been
regenerated with the full unified context (call documents, programme
guide, reference materials). This is the SECOND diagnosis pass and
should focus on subtleties the initial diagnosis (on v1) could not see.

Where Diagnosis Initial caught structural gaps, Diagnosis Advanced
catches:

1. **Cross-chapter inconsistencies**. The number, name, claim or date
   that appears differently in chapter A vs chapter B.

2. **Evaluation criteria gaps**. Each criterion from the eval rubric
   that does not have explicit, identifiable text addressing it.

3. **Tone and style issues**. Inflated language, vague claims,
   patronizing tone, AI-generated patterns the evaluator will detect.

4. **Missing connectives between chapters**. Project tells a story:
   problem (Ch.2) → approach (Ch.3) → activities (Ch.4) → impact (Ch.6).
   If the impact doesn't trace back to specific activities, that's a gap.

5. **Compliance with call-specific rules** (lump sum mechanics,
   subcontracting limits, equipment depreciation, etc.). Cross-check
   what the call mandates vs what the master claims.

6. **Strategic alignment with EU priorities**. Has the project named
   the specific call priorities it tackles? Has it cited the relevant
   strategies (Farm to Fork, Green Deal, Digital Decade, etc.) where
   applicable?

Classification rules SAME as initial diagnosis:
- narrative: resolvable by text refinement in Perfeccionar
- economic: requires Calculator changes in Diseñar

Output format identical to initial diagnosis (see prompt 02). The only
difference is severity bias: at this stage, severity = critical means
"this will drop the score by visible margin if not fixed". Severity =
info is more common here than in initial — many findings are
opportunities for fine polish, not faults.

Aim for 10-30 findings.
```

## User prompt (variable)

```
=== EVALUATION CRITERIA (full) ===
{{criteria}}

=== MASTER DOCUMENT V2 ===
{{master_document}}

=== DESIGN SNAPSHOT (for cross-checks) ===
{{design_snapshot}}

=== INSTRUCTIONS ===
Produce advanced diagnosis JSON. Flag everything that could improve
the score.
```

## Output JSON schema

Mismo schema que `02_diagnosis_initial.md` con `diagnosis_kind: "advanced"`.

## Notas operativas

- Esta llamada se ejecuta ya con cache caliente del prompt 03 si el
  usuario lo hace en la misma sesión. Coste real ~$0.30-0.50.
- Si el v2 ha sido editado por el usuario tras la regeneración (chat
  refinement), incluir esos cambios en el master que se envía.
- Genera el JSON, persiste como nuevo `master_diagnoses` con
  `diagnosis_kind='advanced'` y crea sus `master_diagnosis_items`.
