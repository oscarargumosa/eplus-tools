---
name: score-estimate
purpose: Paso 8 — Score Estimado del proyecto
model: claude-sonnet-4-6
estimated_input_tokens: 720k
estimated_output_tokens: 3-8k
cache_strategy: call docs + criterios + master cacheables
---

# Project Score Estimate

## System prompt (cacheable)

```
You are simulating the role of an EU project evaluator. Your job is to
read the project's Master Document and assign a panoramic estimated
score, NOT a per-question rating but a global view by evaluation
criteria block (Relevance, Quality, Impact, Quality of partnership).

You will use the call's official evaluation rubric. Each block has a
maximum score (e.g. 30/30 Relevance + 30/30 Quality + 25/25 Impact +
15/15 Partnership = 100/100). Total above 70/100 is typically passing;
above 85/100 is typically funded.

Rules:

1. Be HONEST and CALIBRATED. A first-draft project with thin design
   scores ~65-75. A well-iterated project scores ~80-88. A truly
   excellent, distinctive project scores 90+.

2. Do NOT inflate. The user is using this score to decide where to
   invest more time. Inflated scores destroy that signal.

3. For each block, give:
   - The points awarded
   - The maximum
   - One paragraph rationale (3-6 sentences)
   - 1-3 specific reasons points were deducted

4. Then aggregate into a global score with one paragraph overall summary.

5. Then produce a PRIORITY IMPROVEMENT LIST: the 3-5 highest-ROI changes
   the user could make to gain the most points. Be specific (which
   chapter, which type of edit, which addition).

6. Do NOT propose budget changes. If the score is hurt by a budget
   issue, name it but tell the user "this requires Calculator action".

Output: JSON with the structure below. Output must be deterministic
enough that running twice on the same input gives ±2 points.
```

## User prompt (variable)

```
=== EVALUATION RUBRIC (call: <call_code>) ===
<criteria with point allocations per block>

=== MASTER DOCUMENT (latest version) ===
<all chapters>

=== DESIGN SNAPSHOT ===
<wp + activities + budget summary>

=== INSTRUCTIONS ===
Produce the score estimate JSON.
```

## Output JSON schema

```json
{
  "diagnosis_kind": "score_estimate",
  "global_score": 82,
  "global_max": 100,
  "summary": "Sólido proyecto con dimensión transnacional clara y FSTP bien estructurado. Principales debilidades: indicadores cuantitativos débiles en Impact y plan de sostenibilidad post-M48 sin compromiso de financiación.",
  "by_block": [
    {
      "block": "Relevance and context of the project",
      "score": 28,
      "max": 30,
      "rationale": "Excelente conexión con Farm to Fork y EU Biodiversity Strategy. Las 3 culturas (pasiega, euskaldun, béarnaise) están sólidamente justificadas. Pequeña pérdida porque la sección sobre necesidades de pymes turísticas rurales podría tener más datos cuantitativos del territorio.",
      "deductions": [
        "Falta dato cuantitativo de pymes turísticas en los 3 territorios"
      ]
    },
    {
      "block": "Quality of project design and implementation",
      "score": 24,
      "max": 30,
      "rationale": "...",
      "deductions": ["...", "..."]
    },
    {
      "block": "Impact",
      "score": 18,
      "max": 25,
      "rationale": "...",
      "deductions": ["..."]
    },
    {
      "block": "Quality of partnership and cooperation arrangements",
      "score": 12,
      "max": 15,
      "rationale": "...",
      "deductions": ["..."]
    }
  ],
  "priority_improvements": [
    {
      "rank": 1,
      "potential_gain_pts": 3,
      "anchor_kind": "chapter",
      "anchor_id": "ch_6_impact",
      "title": "Cuantificar KPI de adopción post-M48",
      "action": "En el capítulo 6 (Impact), añadir tabla con KPIs medibles: nº pymes Anchor Partner activas a M48+12 (target), nº visitantes registrados año 1 post-proyecto (target), nº microrutas completadas por visitante medio (target). Anclar cada KPI a la actividad concreta que lo genera."
    },
    {
      "rank": 2,
      "potential_gain_pts": 2,
      "anchor_kind": "chapter",
      "anchor_id": "ch_7_sustainability",
      "title": "Compromiso financiero post-M48 de los Anchor Partners",
      "action": "..."
    }
  ]
}
```

## Notas operativas

- Es la pieza más pedagógica del producto. La UI debe presentarla
  como un dashboard con barras de progreso y la lista de mejoras
  como botones accionables ("Mejorar esta sección con la IA").
- Cuando el usuario aplique una mejora desde la priority list, el
  chat debería abrirse anclado al chapter correspondiente con un
  primer mensaje del asistente diciendo "Voy a trabajar la mejora 1
  de la lista de prioridades: cuantificar KPI de adopción. Te
  propongo arrancar por X".
- El Score Estimado SE GUARDA en `master_diagnoses` con
  `diagnosis_kind='score_estimate'` y `score_value`, `score_breakdown`.
- Mostrar histórico de scores entre versiones del Maestro para que
  el usuario vea la progresión.
