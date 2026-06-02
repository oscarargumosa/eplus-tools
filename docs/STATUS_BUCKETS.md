# Status buckets de entidades ORS

Documenta el mapeo entre los códigos `validityType` que devuelve el ORS API y las
columnas derivadas que usa el directorio público.

## Códigos verificados (2026-04-29)

Verificación manual contra `webgate.ec.europa.eu/funding-tenders` con muestras de
3 entidades por código.

| validity_type | validity_label             | status_bucket | is_certified | can_apply | Estado portal real         |
|---------------|----------------------------|---------------|--------------|-----------|----------------------------|
| 42284356      | `na_certified`             | `certified`   | true         | true      | NA Certified               |
| 42284353      | `waiting_na_certification` | `in_review`   | false        | true      | Waiting for NA Certification |
| 42284359      | `waiting_confirmation`     | `declared`    | false        | true      | Waiting for Confirmation   |
| 42284365      | `registered`               | `declared`    | false        | true      | Registered                 |
| 42284362      | `invalidated`              | `invalid`     | false        | false     | Invalidated                |

Para entidades `erasmus_only` (que solo aparecen en proyectos Erasmus históricos,
no en ORS actual) `status_bucket = 'unknown'`, ambos booleanos `false`.

## Buckets para la UI

| Bucket      | Significado para el usuario             | Color sugerido | Icono sugerido |
|-------------|-----------------------------------------|----------------|----------------|
| `certified` | Operativa al 100% — apta para todo      | verde          | check          |
| `in_review` | Documentación enviada, en revisión NA   | naranja        | reloj          |
| `declared`  | Solo dada de alta, sin docs aún         | amarillo       | info           |
| `invalid`   | NO operativa — no puede presentar       | rojo           | stop           |
| `unknown`   | Histórica (proyectos Erasmus, sin ORS)  | gris           | interrogación  |

## Filtros API

- `GET /search?status=certified,in_review` — multi-bucket
- `GET /search?certified=true` — atajo a is_certified
- `GET /search?can_apply=true` — atajo a can_apply
- `GET /map?status=certified` — pinta solo el bucket en el mapa

## Una sola fuente de verdad

El portal `webgate.ec.europa.eu` es el único registro oficial. No hay otro
sistema de validación; lo que vemos en su API ORS es lo que hay.
