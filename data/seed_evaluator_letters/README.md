# Seed corpus de cartas de evaluador EACEA

> **Propósito:** primera población de la `pattern_library` para el sistema
> Diagnose & Improve (TASK-007, `docs/DIAGNOSE_AND_IMPROVE_PLAN.md`).
>
> **Fecha:** 2026-05-25
> **Cartas:** 4 (3 oficiales EACEA + 1 narrativa libre)
> **Programas cubiertos:** 3 (CoVE Horizon, KA3 Youth Together, Sport Volunteering)

## Estructura

Cada carta vive en `{program_code}/{filename}`. El `program_code` es el
`intake_programs.program_id` (VARCHAR identificador externo).

```
data/seed_evaluator_letters/
├── cove_horizon_2025/                  # placeholder, refine when full call loaded
│   └── 3d_cove_letter.txt              # pegada como texto en sesión
├── ka3_youth_together_2026/            # existe en intake_programs
│   ├── focus_101246479.pdf             # ERASMUS-YOUTH-2025-YOUTH-TOG · rejected
│   └── rise_101246449.pdf              # ERASMUS-YOUTH-2025-YOUTH-TOG · passed threshold, not awarded
└── sport_volunteering_2025/            # placeholder
    └── dance_plus.docx                 # narrative letter, no scores per criterion
```

## Metadata de cada carta (consumido por el loader)

> El loader (`scripts/diagnose/load-seed-corpus.js`) lee esta tabla para crear
> las filas en `evaluation_letters`. Cada `program_id` debe existir en
> `intake_programs` antes de cargar.

| Filename | program_id | UUID program | proposal_number | acronym | total_score | threshold | result | source_format | language |
|---|---|---|---|---|---|---|---|---|---|
| `cove_horizon_2025/3d_cove_letter.txt` | `cove_horizon_2025` | `11111111-1111-4111-8111-111111111101` | `(unknown)` | `3D-CoVE` | `79.00` | `60` (estimated) | `awarded` (likely) | `eacea_pdf` | `en` |
| `ka3_youth_together_2026/focus_101246479.pdf` | `ka3_youth_together_2026` | `00000000-0000-4000-a000-000000000001` | `101246479` | `FOCUS` | `53.00` | `60` | `rejected_threshold` | `eacea_pdf` | `en` |
| `ka3_youth_together_2026/rise_101246449.pdf` | `ka3_youth_together_2026` | `00000000-0000-4000-a000-000000000001` | `101246449` | `RISE` | `68.00` | `60` | `rejected_ranking` | `eacea_pdf` | `en` |
| `sport_volunteering_2025/dance_plus.docx` | `sport_volunteering_2025` | `11111111-1111-4111-8111-111111111102` | `(unknown)` | `DANCE+` | `null` | `null` | `unknown` | `narrative` | `en` |

## Notas importantes

1. **CoVE Horizon (3D-CoVE)**: pegada como texto en sesión por Oscar. No tenemos
   el PDF original. El score total 79 es la suma de los 4 criterios (28+17+18+16).

2. **FOCUS y RISE** son a la **misma convocatoria** (ERASMUS-YOUTH-2025-YOUTH-TOG)
   y comparten el partner portugués ASSOCIACAO EDUCATIVA NACIONAL DE INCLUSAO E
   INOVAÇAO NAS ESCOLAS. Detectable como red de competidores/aliados.

3. **RISE es el proyecto de Permacultura Cantabria** (coordinador, partner 1).
   Pasó threshold (68/60) pero no fue concedido por ranking. **Caso de uso
   ideal para Perfeccionar dirigido.**

4. **DANCE+** no tiene scores explícitos por criterio — es una carta narrativa.
   El parser tendrá que extraer findings sin score. Útil para validar el
   modo `source_format = 'narrative'` del parser.

5. **Programs placeholder**: `cove_horizon_2025` y `sport_volunteering_2025` se
   crearon con datos mínimos el 2026-05-25 para no bloquear el seed corpus.
   Refinar cuando Oscar cargue los calls completos en Admin Data E+.

## Privacidad y RGPD

Las cartas contienen información identificativa de partners y proyectos.
Decisión pendiente sobre anonimización (ver `docs/DIAGNOSE_AND_IMPROVE_PLAN.md` §11).
Repositorio actual es privado — riesgo bajo, pero conviene cerrar la política antes
de aceptar uploads de clientes externos en producción.
