# Handoff sesión 2026-05-07 · Movilidades en erasmuscantabria

## Qué se shippeó esta sesión

### eplus-tools (rama `dev-local`)
Ya commiteado por sesión anterior (commit `2069aa5`):
- `scripts/salto/scrape-salto.js` — listado paginado (8 GETs, ~8s)
- `scripts/salto/enrich-details.js` — fetcha cada ficha (77 GETs, ~70s)
- `scripts/salto/_classify-fee.js` — heurística free/paid/mixed/unknown
- `scripts/salto/reclassify-fees.js` — re-clasifica sin re-fetch
- `scripts/salto/export-csv.js` — regenera CSV desde JSON enriquecido
- `data/salto/trainings.json` — 77 ofertas con 30+ campos por oferta
- `data/salto/trainings.csv` — 22 columnas
- `data/salto/snapshots/2026-05-06.json` — histórico append-only
- `docs/SALTO_NEWS_PIPELINE.md` — doc canónico actualizado

Distribución fees del snapshot 2026-05-06: **61 free · 12 paid · 2 mixed · 2 unknown** (los 2 unknown legítimos: "depende de tu NA").
Top países: Italia 10 · España 10 · Polonia 9 · Alemania 6 · Francia 5.

### erasmuscantabria (rama `main`, commit `4a19179` local, NO pusheado)
- `design-templates/05-cursos-mockup.html` — wireframe 3 niveles con datos reales · paleta brand alineada (#1b1464, #fbff12, #c7afdf)

## Decisiones tomadas en esta sesión

**Taxonomía confirmada por Oscar:**
- **Oportunidades = movilidades** (cursos, voluntariados, intercambios donde una persona se mueve/forma) → SALTO
- **Subvenciones y convocatorias = funding calls** (financiación para entidades) → TASK-005

**Arquitectura SALTO:**
- CPT `movilidad` (no `curso` — extensible a futuros tipos: ESC voluntariado, DiscoverEU, etc.)
- Taxonomía `tipo_movilidad` (valor inicial: "Curso SALTO")
- Taxonomía `pais`
- URL archive: `/oportunidades/movilidades/`
- URL single: `/oportunidades/<slug>/` (dentro del subpath /oportunidades/)
- Página `/oportunidades/` actual queda igual (4 programas) + bloque nuevo abajo "Movilidades abiertas ahora" con grid de 6 destacadas + CTA "Ver las 77 →"

**Layout (defaults asumidos · pendiente confirmación visual mockup):**
- Listado: opción **B** (grid alterna blanca/lavanda, patrón de /proyectos/)
- Detalle: opción **C** (página propia con sidebar lavanda destacando coste)
- Filtros: tipo (chips horizontales) + país (dropdown). Sin filtro fee inicial.
- Sin imagen destacada — header con gradiente azul→lavanda + Material Symbol según tipo.
- Atribución "vía SALTO" en footer de cada card (obligatoria).

**Modo de trabajo confirmado:** **POR REPO** (Oscar no quiere dar SSH al VPS). Todo via commits a `ongpasos-droid/erasmuscantabria` + `git pull && wp-cli` que ejecuta Oscar en el VPS.

## Qué queda pendiente — orden de ataque mañana

### Pieza 1: endpoint `/v1/movilidades` en eplus-tools (~30min)
- Nuevo módulo `node/src/modules/movilidades/`
  - `routes.js` — registra `GET /v1/movilidades` y `GET /v1/movilidades/:salto_id`
  - `controller.js` — lee `data/salto/trainings.json` con filtros (`country`, `tipo`, `fee_type`, `deadline_after`, `limit`, `offset`)
  - `model.js` — cache en memoria del JSON (refresh cada 10 min)
- Registrar en `server.js`: `app.use('/v1/movilidades', require('./node/src/modules/movilidades/routes'))`
- Auth: API key pública con rate limit (igual que `/v1/entities` actual)
- Respuesta: `{ ok: true, data: { items: [...], total, limit, offset } }`
- Atribución: incluir campo `source: 'SALTO-YOUTH European Training Calendar'` en respuesta

### Pieza 2: mu-plugin `infra/mu-plugins/ec-movilidades.php` en erasmuscantabria (~45min)
- `register_post_type('movilidad', ...)` con `rewrite => ['slug' => 'oportunidades', 'with_front' => false]`
- `register_taxonomy('tipo_movilidad', 'movilidad', ...)`
- `register_taxonomy('pais', 'movilidad', ...)`
- `register_post_meta('movilidad', 'salto_id', ...)` — y todos los meta:
  `deadline_iso`, `dates_text`, `city`, `country`, `fee_type`, `fee_amount_eur`, `fee_text`, `application_url`, `source_url`, `working_languages`, `participants_count`, `organiser_name`, `organiser_type`, `summary`, `accommodation_food_text`, `travel_reimbursement_text`, `participants_countries`, `selection_date` (todos `show_in_rest=true`)
- Filtro `pre_get_posts` para excluir movilidades con `deadline_iso < CURDATE()` del archive

### Pieza 3: plantillas Astra child o shortcodes (~1h30min)
**Opción más limpia:** crear theme child `astra-erasmuscantabria` (no existe aún) con:
- `archive-movilidad.php` — render del Nivel B (grid 3-col)
- `single-movilidad.php` — render del Nivel C (detalle)
- `header-card.php` partial reusable
- CSS adicional en `style.css` del child theme (extiende brand.css)

**Opción alternativa más rápida:** shortcodes `[movilidades_grid filtros=tipo,pais]` y `[movilidad_detalle]` que se inyectan en una page WP. Pierde URLs limpias pero evita tocar theme.

→ **Default: theme child** (consistencia con el resto del WP).

### Pieza 4: sync script `scripts/movilidades-sync.mjs` en repo erasmuscantabria (~45min)
- Llama a `https://intake.eufundingschool.com/v1/movilidades?limit=200` (o como se llame el host de eplus-tools)
- Para cada item: `GET /wp-json/wp/v2/movilidad?meta_key=salto_id&meta_value=<id>`
  - Si existe → `POST` update con todos los meta
  - Si no existe → `POST` create con todos los meta + asignar términos `tipo_movilidad` y `pais`
- Marcar como `draft` (status) las movilidades cuyo deadline pasó
- Dependencia: `node-fetch` o usar `fetch` nativo Node 20+
- Auth WP REST: Application Password generado por Oscar para usuario admin (env var `WP_APP_PASSWORD`)

### Pieza 5: cron systemd timer en VPS + WP page (~30min)
- `infra/systemd/movilidades-sync.service` + `.timer` (analogía con `erasmuscantabria-backup.timer` que ya existe)
- Schedule: `OnCalendar=*-*-* 06:30:00 Europe/Madrid`
- Logs a `/var/log/movilidades-sync.log`
- WP page nueva `/oportunidades/movilidades/` (probablemente innecesaria si el archive del CPT funciona) — si lo es, crear con `wp-cli post create`
- Editar `/oportunidades/` para añadir bloque "Movilidades abiertas ahora" con shortcode/block que muestre 6 destacadas y CTA al archive

## Comando para arrancar mañana

```
hola, continuar con las movilidades SALTO
```

→ Releer este doc, confirmar layout B+C aún OK, y arrancar Pieza 1.

## Estado git al cierre

**eplus-tools (`dev-local`):**
- Sin committear (NO MÍO, no tocar): `M public/js/atlas-stats.js`, `M public/js/entities.js`, `?? data/funding_unified.json`, `?? data/funding_unified.meta.json`, `?? scripts/funding/` — estos son trabajo paralelo de TASK-005, no de TASK-004
- Mi trabajo SALTO ya commiteado en `2069aa5` (sesión anterior)
- Último commit: `800f1b3 feat(bdns): pipeline de extracción de subvenciones públicas españolas`

**erasmuscantabria (`main`):**
- Commit local nuevo: `4a19179 design: mockup cursos SALTO (3 niveles, decisión pendiente)` · NO PUSHEADO
- Sin nada más pendiente
- Mañana decidir si pushear este commit o esperar a tener piezas 2-5 listas para hacer un solo push

## Referencias clave

- Doc canónico: `docs/SALTO_NEWS_PIPELINE.md`
- TASK en `docs/PENDING.md`: TASK-004
- Mockup visual: `C:\Users\Usuario\erasmuscantabria\design-templates\05-cursos-mockup.html`
- Brand: `C:\Users\Usuario\erasmuscantabria\BRIEF.md` + `design-templates/brand.css`
- Estructura WP existente: `C:\Users\Usuario\erasmuscantabria\scripts\00-initial-setup.md`
- VPS: 91.98.145.106 · contenedor `erasmuscantabria-wp-wordpress-1` · WP-CLI vía `./scripts/wp-cli.sh <cmd>`
