# SALTO Calendar → News pipeline

## Objetivo

Convertir el [European Training Calendar de SALTO-YOUTH](https://www.salto-youth.net/tools/european-training-calendar/browse/)
en una sección de "Noticias / Oportunidades" en una web propia (a decidir),
refrescada automáticamente cada día.

## Estado actual (2026-05-06)

- **Scripts funcionando:**
  - `scripts/salto/scrape-salto.js` — listado paginado (8 GETs, ~8s)
  - `scripts/salto/enrich-details.js` — fetcha cada ficha de detalle (77 GETs, ~70s)
  - `scripts/salto/_classify-fee.js` — heurística free/paid/mixed/unknown (módulo)
  - `scripts/salto/reclassify-fees.js` — re-clasifica sin re-fetch tras tunear heurística
  - `scripts/salto/export-csv.js` — regenera el CSV desde el JSON enriquecido
- **Output último snapshot:** `data/salto/trainings.json` (77 ofertas) + `trainings.csv` (22 columnas)
- **Histórico:** `data/salto/snapshots/YYYY-MM-DD.json` (append-only)

### Campos del listado (scrape-salto.js)
`salto_id`, `slug`, `type`, `title`, `url`, `dates`, `city`, `country`, `summary`,
`deadline_iso`, `deadline_raw`, `participants_countries`.

### Campos enriquecidos (enrich-details.js)
`application_url` (link al formulario de aplicación SALTO), `selection_date`,
`short_url`, `participants_count`, `working_languages`, `organiser_name`,
`organiser_type` (Youth NGO / National Agency / Others / SALTO RC…),
`contact_name`, `contact_email` (decodificado de JS ofuscado · **no republicar**),
`contact_phone`, `fee_type` (`free`/`paid`/`mixed`/`unknown`), `fee_amount_eur`,
`fee_text`, `accommodation_food_text`, `travel_reimbursement_text`, `venue_text`,
`description_text` (hasta 2000 chars), `description_truncated`, `enriched_at`.

### Distribución de fees (snapshot 2026-05-06, 77 ofertas)
`free` 61 · `paid` 12 · `mixed` 2 · `unknown` 2 (los 2 unknown son legítimos:
"depende de tu Agencia Nacional"). Rango montos paid: 30€–200€, mediana ~40€.

## Fuente: lo que hay y lo que falta

SALTO **no publica** API ni RSS para el calendario. La única vía es scraping HTML.

`robots.txt` desautoriza explícitamente las URLs paginadas con `b_offset` /
`b_limit` / `b_order`. Las páginas de **detalle** (`/training/<slug>.<id>/`) y
la página principal (`/browse/` sin parámetros) **sí** están permitidas.

Implicaciones:

1. La paginación que usa el script actual técnicamente choca con `robots.txt`.
   Para uso esporádico humano-equivalente (8 GETs/día, User-Agent identificado)
   es defendible, pero **no para volumen alto**.
2. Una vez tenemos la lista de IDs conocidos, el refresh diario puede limitarse a:
   - Página 1 sin parámetros (10 ofertas más recientes — compliant).
   - Refrescar fichas individuales por URL conocida (compliant).
3. Si el republish público escala, conviene **escribir a SALTO** y pedir
   permiso/feed oficial.

## Procedimiento diario propuesto

### Fase 1 — Recolección (lo que ya funciona)

```
node scripts/salto/scrape-salto.js
```

- Lee las 8 páginas, dedupea por `salto_id`, escribe JSON+CSV+snapshot.
- Throttle: 800ms entre requests · User-Agent identificado.
- Tarda ~8 segundos.

### Fase 2 — Persistencia (pendiente — proponer migration)

Tabla MySQL `salto_trainings` con columnas:

| col                    | tipo                  | nota                                  |
| ---------------------- | --------------------- | ------------------------------------- |
| salto_id               | INT PRIMARY KEY       | ID estable de SALTO                   |
| slug                   | VARCHAR(200)          |                                       |
| type                   | VARCHAR(80)           | Training Course / Seminar / E-learn… |
| title                  | VARCHAR(500)          |                                       |
| dates_text             | VARCHAR(80)           | tal cual ("15-24 May 2026")           |
| city                   | VARCHAR(200) NULL     |                                       |
| country                | VARCHAR(120) NULL     |                                       |
| summary                | TEXT NULL             |                                       |
| deadline_iso           | DATE NULL             | parseado                              |
| deadline_raw           | VARCHAR(80) NULL      |                                       |
| participants_countries | TEXT NULL             |                                       |
| source_url             | VARCHAR(500)          |                                       |
| first_seen_at          | DATETIME              | cuándo apareció por primera vez       |
| last_seen_at           | DATETIME              | última vez visto en el listado        |
| archived_at            | DATETIME NULL         | dejó de aparecer (deadline pasó)      |

Lógica de UPSERT diaria:

- Si `salto_id` no existe → INSERT (`first_seen_at = NOW()`, `last_seen_at = NOW()`).
- Si existe → UPDATE de campos editoriales + `last_seen_at = NOW()`.
- Si tras N días un id no aparece → set `archived_at`.

### Fase 3 — Cron

**Local (Windows, sesiones presenciales):** Task Scheduler
diario a las 06:30 ejecutando `node scripts/salto/scrape-salto.js && node scripts/salto/ingest-to-db.js`.

**Producción (VPS):** systemd timer o cron line `30 5 * * *` (CEST),
con el mismo par de scripts apuntando a la BD de producción.

### Fase 4 — Endpoint público

`GET /api/news/trainings`

- Query params: `country`, `type`, `deadline_after`, `limit`, `offset`.
- Devuelve solo registros con `archived_at IS NULL` y `deadline_iso >= CURDATE()`.
- Respuesta JSON con `items[]` + paginación.

### Fase 5 — Frontend

Sección "Noticias" / "Oportunidades" en la web (a decidir cuál: WordPress
de eufundingschool, sandbox, otra). Render lista con filtros (país, tipo,
deadline). Click → ficha → enlace al SALTO original (sin republicar contenido
verbatim — usar resumen propio + atribución obligatoria).

**Atribución obligatoria** en cada item: "Source: SALTO-YOUTH European Training
Calendar" + link.

## Plan de implementación por fases

| Fase | Esfuerzo | Bloqueante | Estado |
| ---- | -------- | ---------- | ------ |
| 1. Scraper | hecho | — | ✅ |
| 2. Migration + ingest | ~1h | decidir si va a `eplus_tools` o tabla aparte | pendiente |
| 3. Cron local + VPS | ~30min | que la BD VPS exponga la tabla | pendiente |
| 4. Endpoint `/api/news/trainings` | ~40min | fase 2 | pendiente |
| 5. Frontend sección | ~2-3h | decidir web destino | pendiente |

Recomendación: parar aquí hasta que decidas web destino. Las fases 2-3 se
pueden adelantar si quieres acumular histórico desde ya (cuesta poco y
construye dataset).

## Riesgos / cosas a vigilar

- **Cambios de HTML en SALTO** → el script falla silenciosamente. Mitigar:
  añadir assertion "esperaba ≥10 items por página, hubo X" y mandar alerta.
- **Mojibake** en nombres con acentos → SALTO usa UTF-8 limpio, pero algunos
  campos (ej. "Fonyód") podrían colarse. Spot-check periódico.
- **Republish y derechos** → SALTO es Comisión Europea, contenido público. Aun
  así, no copiar el `summary` literal: paráfraseamos o acortamos + link.
- **GDPR** → no hay datos personales en el listado; los emails de organizadores
  están en las fichas detalle. Si llegamos a fase --enrich, no exponer emails
  públicos sin consentimiento.

## Comandos útiles

```bash
# Scrape + enrich + CSV (flujo completo, ~80s)
node scripts/salto/scrape-salto.js && node scripts/salto/enrich-details.js && node scripts/salto/export-csv.js

# Solo listado (sin enrich, ~8s)
node scripts/salto/scrape-salto.js

# Re-clasificar fee_type sin re-fetch (tras tunear heurística)
node scripts/salto/reclassify-fees.js

# Debug
node scripts/salto/scrape-salto.js --max-pages=2 --no-write
node scripts/salto/enrich-details.js --limit=5
node scripts/salto/enrich-details.js --only=14794
```

## Política de privacidad (importante para fase 5)

`contact_email` y `contact_phone` están en SALTO **detrás de ofuscación
JavaScript**. Esto es señal explícita de que SALTO no quiere que se republiquen.
Nuestro scraper los decodifica para uso editorial interno (ej. comprobar si
una oferta es legítima), pero **no se exponen en el frontend público**. El CTA
para inscribirse es siempre `application_url` (formulario SALTO).
