# Tareas pendientes — E+ Tools

> **Cómo funciona este doc:** lista canónica de trabajo pendiente coordinado entre sesiones de Claude. Cuando Oscar pregunte "¿qué tareas tenemos pendientes?", la primera respuesta es leer este fichero. Cada tarea tiene owner, status, bloqueante, y dónde está el plan detallado.
>
> **Quién edita:** cualquier Claude o Oscar. Cuando una tarea se completa, mover a §3 (Recientemente cerrado) con la fecha. Cuando se planifica nueva, añadir a §1.

---

## 1 · En curso · bloqueadas en pre-requisito

### TASK-007 — Diagnose & Improve (replanteo de Perfeccionar)
**Status:** APROBADO el diseño · LISTO PARA EMPEZAR Fase 1
**Owner:** Local Claude (eplus-tools)
**Doc canónico:** `docs/DIAGNOSE_AND_IMPROVE_PLAN.md`
**Fecha plan:** 2026-05-25
**Reemplaza:** `PROJECT_MASTER_ARCHITECTURE.md` y `PROJECT_MASTER_IMPLEMENTATION_PLAN.md` (quedan obsoletos)

**Qué incluye:**
- **Eliminar el Master** como artefacto intermedio. Form Part B pasa a ser el documento canónico.
- **Pestaña "Diagnóstico"** como puerta única que acepta 3 puertas: greenfield, audit, reciclaje. Funciona como triaje (rediseñar/perfeccionar/exportar).
- **Pattern library de evaluadores EACEA** como activo defensible del producto. Seed corpus: 4 cartas analizadas (CoVE, FOCUS, RISE, DANCE+).
- **Catálogo controlado**: cada proyecto y carta atados a `call_id` del Admin Data E+.
- **Perfeccionar dirigido** con ediciones puntuales + diff visible + accept/reject por cambio.

**4 leyes universales EACEA confirmadas con N=4 cartas:**
1. Sustainability sin financiación post-proyecto concreta
2. Methodology con huecos de detalle
3. Inconsistencias objectives↔activities↔WP descriptions
4. Temas transversales mencionados pero no traducidos a tareas

**Decisiones cerradas (2026-05-25):**
- Borrar Masters existentes (borrador interno, sin clientes externos)
- Diagnóstico gratis limitado + Perfeccionar de pago
- MVP: todos los calls EACEA Form Part B cargados en Admin Data E+
- Formato input: Word EACEA + paste por sección. PDFs sueltos descartados
- Carta evaluador: opcional. Con carta = diagnóstico dirigido premium

**Plan por fases (10–12 semanas total):**
1. **Fase 1** (1.5–2 sem): Backend DB + parser cartas + seed corpus cargado
2. **Fase 2** (2 sem): Diagnóstico sin carta sobre proyectos de la app
3. **Fase 3** (1.5 sem): Upload de proyecto externo (Word EACEA + paste)
4. **Fase 4** (2 sem): Upload carta + diagnóstico dirigido
5. **Fase 5** (2–3 sem): Perfeccionar dirigido con diff y versionado
6. **Fase 6** (1 sem): Leyes universales como reglas duras del Writer

**Pendiente de decisión (no bloqueante):**
- Anonymización seed corpus
- Nombre comercial del producto
- Política de retención de cartas
- Tier (Premium-only o también Standard)
- Disclaimer RGPD

### TASK-001 — Refactor del directorio de entidades
**Status:** APROBADO el diseño · BLOQUEADO en pre-requisito
**Owner del bloqueo:** Oscar
**Doc canónico:** `docs/DIRECTORY_REFACTOR_PLAN.md`
**Fecha plan:** 2026-04-29

**Qué incluye:**
- Búsqueda substring (`%perma%` encuentra "permacultura cantabria")
- Eliminar sidebar de filtros · top bar con search + 2 dropdowns (país, tipo)
- Sustituir 3 scores viejos (prof/EU/vitality) por **Personal · Experiencia · Stakeholders**
- Heurística para entidades no reclamadas usando proyectos EU verificados
- RGPD: ocultar email/phone hasta opt-in del responsable (toggle `contacts_public`)
- Calculator: permite usar entidades no reclamadas. Writer: solo reclamadas con datos completos
- Fix bug display_name (caso "Permacultura Cantabria" aparece como "Cantabria")

**Pre-requisito YA RESUELTO por VPS Claude (2026-05-05):**
La fusión existe en Postgres `erasmus-pg` del VPS, no en MySQL como inicialmente preví:
- `eplus2021.projects` (317.559 filas)
- `eplus2021.organisations` (198.519 filas)
- `eplus2021.project_organisations` (839.569 filas)
- `directory.entities_master` matview (331k entities con bucketing both/directory_only/erasmus_only)
- `directory.entity_project_stats`, `entity_top_copartners`, `entity_yearly_timeline`

**Decisión arquitectural pendiente** (en `docs/handoffs/PARA_VPS.md` 2026-05-05): cómo consume la app Node los datos de Postgres — favorito: llamar a `directorio.eufundingschool.com/api/*` desde Node. Hasta cerrar esto, F1 (fix INNER JOIN bug) sigue parado.

**Cuando arrancar el desarrollo:**
Tras: (1) acuerdo Local↔VPS sobre arquitectura de consumo, (2) primer dump base de Postgres replicado en local. Ambas en curso vía buzones `docs/handoffs/`.

**Avance 2026-04-29 — bug raíz F1 confirmado:**
Sesión auditando el desajuste Consortium↔Directorio en LIVE. Confirmado contra ORS API + endpoint `/v1/entities` + BD local + VPS:
- Bug: `node/src/modules/entities/model.js:117-193` (`listEntities`) hace **INNER JOIN** con `entity_enrichment.archived=0` y busca `q` solo en `MATCH(ee.extracted_name, ee.description)`.
- Consecuencia: 165k visibles vs **288k reales** en `entities`. ~123k sin enrich son invisibles, incluido Permacultura Cantabria (validity=waiting).
- Selector Consortium (`public/js/intake.js:843-990`) además pega contra tabla vieja `organizations` (23 orgs en local). Hay que apuntarlo a `/v1/entities`.
- OIDs de test para revincular `BICYCLE` / `bicicle 2`: Permacultura Cantabria `E10151149` (PIC 940435371), Von Hope `E10157445` (PIC 940543914).
- Sesión pausada porque el VPS Claude detectó un bug grande en la BD del VPS y están arreglándolo. **No se ha tocado código.** Detalle en memoria `project_session_20260429_consortium_directory.md`.

**Fases tras desbloquear:**
- F1 (3-4h): búsqueda + UI topbar + cards limpias + fix display_name
- F2 (1d): scoring nuevo + endpoint power
- F3 (3-4h, paralelo a F2): RGPD migration 095 + toggle UI + gating
- F4 (30min): drop scores viejos de DB tras 30d estables

---

## 2 · Pendientes sin bloqueante (cuando se quiera)

### TASK-006 — Experience RAG (auto-redacción de Capacity con proyectos pasados)
**Status:** DISEÑADO · BLOQUEADO en VPS Claude (Pieza 1)
**Owner del bloqueo:** VPS Claude (Pieza 1+2+3) · Local Claude (Pieza 4 cuando llegue)
**Doc canónico:** `docs/EXPERIENCE_RAG.md`
**Handoff:** `docs/handoffs/PARA_VPS.md` 2026-05-07
**Fecha plan:** 2026-05-07

**Caso de uso:** cuando el usuario redacta un proyecto nuevo en el Writer, la app le sugiere automáticamente 4-5 proyectos pasados de su entidad relevantes para el actual y le auto-redacta el párrafo de Capacity / Relevant Experience. "Tu app conoce mejor tu palmarés que tú mismo".

**Tres piezas en VPS:**
1. **Resumen completo del proyecto** — hoy `directory-api` trunca `project_summary` a ~199 chars. VPS verifica si la BD tiene el texto íntegro; si no, scraper offline al portal Erasmus+ Project Results Platform. Bloquea todo lo demás.
2. **Vectorización 317k proyectos** — pgvector + `text-embedding-3-small` OpenAI (~$3.20 una vez, ~2 GB storage).
3. **Endpoint retrieve** — `POST /retrieve/projects-similar { entity_oid, query_text, k, exclude_identifiers }`.

**Una pieza en Local Claude (cuando VPS termine las 3):**
4. Botón "✨ Sugerir proyectos pasados relevantes" en Writer → Capacity, modal con checkboxes, párrafo auto-redactado por LLM.

**Decisiones cerradas:**
- Vectorizar todos los 317k (no solo los de la entidad del usuario).
- Modelo: `text-embedding-3-small` multilingüe, sin traducción previa.
- Usuario revisa antes de aceptar el párrafo.

**Decisiones abiertas en VPS:** Q-VPS-30 (¿BD tiene summary completo?), Q-VPS-31 (¿VPS corre el embedding worker?), Q-VPS-32 (timing).

### TASK-002 — Sync prod -> Laragon local (datos para test offline)
**Status:** LISTO_PARA_EMPEZAR
**Doc canónico:** `docs/LOCAL_SAMPLE.md`
**Script:** `scripts/sync-prod-mysql-to-local.sh`
**Fecha plan:** 2026-05-05

**Qué incluye:**
- Réplica de MySQL `eplus_tools` (288k entities + enrichment + ref_*) en Laragon vía túnel SSH ya montado.
- Excluye `users / auth_tokens / newsletter / ai_logs / llm_cache` (privacy + volumen).
- Verifica que Permacultura Cantabria (`E10151149`) y volumen ~288k entities estén tras el import.
- No incluye proyectos EU históricos (Erasmus+ 2014-2025) — esos viven en Postgres `erasmus-pg` (Directory API). Plan de sample de Postgres pendiente (§3 de LOCAL_SAMPLE.md).

**Qué falta para correr:**
1. Levantar túnel: `~/.claude/tunnel-mysql-prod.bat`
2. Crear `~/.claude/local-sync.env` con `CLAUDE_RO_PASS=...` (extraer de `~/.claude.json` -> `mcpServers.mysql-prod.env.MYSQL_PASS`)
3. Añadir `/c/laragon/bin/mysql/.../bin` al PATH
4. `bash scripts/sync-prod-mysql-to-local.sh`

**Decisión cerrada (2026-05-05):**
Oscar planteó si copiar 150 GB completos. Descartado: la BD que pesa 150 GB es la Postgres `erasmus-pg` (proyectos EU), no la MySQL `eplus_tools` (que pesa <500 MB). Para test offline basta con MySQL completo + Directory API on-demand para proyectos EU.

### TASK-004 — Movilidades SALTO → erasmuscantabria.com
**Status:** FASE 1 HECHA · ARQUITECTURA DECIDIDA 2026-05-07 · LISTO PARA IMPLEMENTAR (5 piezas)
**Doc canónico:** `docs/SALTO_NEWS_PIPELINE.md` + `docs/handoffs/SESSION_HANDOFF_2026-05-07_movilidades.md`
**Mockup:** `erasmuscantabria/design-templates/05-cursos-mockup.html` (commit local `4a19179`)
**Fecha plan:** 2026-05-06 · actualizado 2026-05-07

**Qué incluye:**
- **Fase 1 ✅** scraper + enrich completos: 77 ofertas en `data/salto/trainings.json` con 30+ campos. Distribución: 61 free · 12 paid · 2 mixed · 2 unknown.
- **Fase 2** Endpoint `/v1/movilidades` en eplus-tools (módulo `node/src/modules/movilidades/`).
- **Fase 3** mu-plugin `ec-movilidades.php` → CPT `movilidad` + taxonomías + 18 meta fields. URL `/oportunidades/<slug>/`.
- **Fase 4** Theme child `astra-erasmuscantabria` con `archive-movilidad.php` (grid B) + `single-movilidad.php` (detalle C).
- **Fase 5** Sync script Node + systemd timer 06:30 + WP page update.

**Decisiones tomadas (2026-05-07):**
- Taxonomía Oscar: **Oportunidades = movilidades** (SALTO) · **Subvenciones = funding calls** (TASK-005). No mezclar.
- CPT `movilidad` extensible a futuras fuentes (ESC, DiscoverEU)
- URL `/oportunidades/<slug>/` single · `/oportunidades/movilidades/` archive
- Layout B (grid blanca/lavanda) + C (detalle propio sidebar lavanda)
- Modo trabajo POR REPO · sin SSH directo · sin ACF (meta nativos)
- Atribución "vía SALTO" obligatoria

**Limitación SALTO:** sin API ni RSS · `robots.txt` desautoriza `b_offset`. Compliant: página 1 + URLs detalle conocidas.

**Comando para arrancar:** `hola, continuar con las movilidades SALTO`

### TASK-005 — BD unificada de financiación (EU + España)
**Status:** FASE 1 (SEDIA) HECHA · resto LISTO_PARA_EMPEZAR · 2 decisiones de Oscar pendientes
**Owner:** Local Claude (eplus-tools) — consolidado el 2026-05-06
**Fecha plan:** 2026-05-06
**Origen:** scope traspasado por Cantabria Claude (`docs/handoffs/FROM_CANTABRIA_FINAL_2026-05-06.md`)

**Qué incluye:**
- **Fase 1 ✅ SEDIA EU calls** (hecha 2026-05-06): `scripts/sedia/sync.js` + `data/calls/` con 542 calls extraídos (Open + Forthcoming). 9 programas con cobertura: Horizon Europe (406), EDF (36), NDICI/EuropeAid (34), LIFE (16), Digital (11), EUAF (7), CEF (5), Pilot Projects (4), Creative Europe (4), CERV (3), Erasmus+ (2), resto.
- **Fase 2 ✅ BDNS España** (hecha 2026-05-07): `scripts/bdns/sync.js` + `data/bdns/` con 28 calls extraídos en muestra de 2 días. Endpoints + 31-field schema + heurística `isOpen()` por capas (deadline > start > texto > flag). Rate limit real (concurrency=3 + 200ms + exp backoff retry).
- **Fase 2.5 ✅ Unifier cross-source** (hecha 2026-05-07): `scripts/funding/build-unified.js` + `data/funding_unified.json` con 647 records (542 SEDIA + 28 BDNS + 77 SALTO). Schema unificado, UUIDs deterministic, sort por estado+deadline.
- **Fase 3 BOE Datos Abiertos** (pendiente): `boe.es/datosabiertos/`, complementario al BDNS para texto íntegro de bases reguladoras.
- **Fase 4 BOC Cantabria** (pendiente): RSS + scraping HTML para regional Cantabria (lag vs BDNS).
- **Fase 5 SEPIE / INJUVE** (pendiente, condicional): solo si la BD necesita plazos por agencia nacional Erasmus+ que SEDIA central no detalla.
- **Fase 6 ❌ DESCARTADA — Schema Postgres**: Oscar eligió arquitectura B' (dump JSON estático), no Postgres + API REST. La Fase 6 original queda para v2 si la web crece.
- **Fase 7 ❌ DESCARTADA — API REST**: idem, B' no requiere endpoint backend. La web consume `data/funding_unified.json` vía `raw.githubusercontent.com` (CORS habilitado).
- **Fase 8 ✅ Refresh diario** (hecha 2026-05-07): `scripts/refresh-all.js` orquesta SALTO scrape+enrich + SEDIA + BDNS + unifier; commit+push a rama dedicada `data-auto`. Systemd timer en VPS host (`/etc/systemd/system/eplus-data-refresh.{service,timer}`), 06:00 Europe/Madrid. Smoke test E2E confirmado (commit `5e20ba63` en data-auto). Doc canónico: `docs/REFRESH_PIPELINE.md`. **Política de publicación**: cron escribe SOLO a `data-auto`, nunca a main/dev-local/dev-vps. Para llegar a Live, hace falta merger `data-auto` en `/merge`.
- **Fase 9 Backfill traducción ES** (pendiente, opcional): correr Sonnet 4.6 sobre `summary_en` de SEDIA/SALTO (619 records) para poblar `summary_es`. Coste estimado: ~$0.50.
- **Fase 10 Curado manual catálogo** (pendiente): completar `data/erasmus_plus_2026_calls.clean.json` con LIFE 16 calls + el resto que vaya saliendo, para que el `curated_enrichment` ratio suba.

**Decisiones de Oscar (2026-05-07):**
1. ✅ **Arquitectura B'** — dump JSON estático, no API REST. Sirve vía `raw.githubusercontent.com` con CORS habilitado.
2. ⏳ **3 campos faltantes SEDIA** — pendiente decisión final. Default actual: catálogo curado para Erasmus+ (1/47 matched, resto forthcoming) + LIFE manual + "Ver call document" para Horizon/EDF en v1.
3. ⏳ **Idioma** — pendiente confirmar. Default actual: SEDIA mantiene `summary_en`, BDNS nativo ES, flag `summary_es_pending: true` para 619/647 records.

**Schema preliminar acordado con Cantabria Claude (Round 1+2):**
```sql
funding_call(
  call_id              UUID,           -- generado en ETL para evitar colisiones cross-source
  source_id            VARCHAR,        -- ID nativo (SEDIA identifier, BDNS codigoBDNS)
  source               VARCHAR,        -- 'sedia' | 'bdns' | 'boe' | 'boc_cantabria' | 'sepie' | 'injuve'
  source_lang          VARCHAR(8),     -- 'en' | 'es' | 'fr' ...
  level                VARCHAR,        -- 'eu' | 'national' | 'regional' | 'local'
  programme            VARCHAR,
  sub_programme        VARCHAR,
  publishing_authority_code VARCHAR,   -- BDNS vpd, SEDIA programmeDivision, BOE sección
  nuts_code            VARCHAR,        -- ES13 = Cantabria, etc.
  title                TEXT,
  title_lang           VARCHAR(8),
  summary              TEXT,           -- 2-3 frases en ES (traducir si origen EN)
  status               VARCHAR,        -- 'forthcoming' | 'open' | 'closed'
  publication_date     DATE,
  open_date            DATE,
  deadline             DATE,
  deadline_model       VARCHAR,        -- 'single-stage' | 'two-stage' | 'continuous' | 'multiple-national'
  deadlines_extra      JSONB,          -- array para multi-deadline
  budget_total_eur     DECIMAL(14,2),
  budget_per_project_min_eur DECIMAL(14,2),
  budget_per_project_max_eur DECIMAL(14,2),
  expected_grants      INT,
  cofinancing_pct      INT,            -- 80, no 0.80
  duration_months      INT,
  audience             TEXT,           -- ES, quién puede pedirlo
  eligible_orgs        JSONB,          -- ['VET','SME','NGO',...]
  eligible_countries   JSONB,          -- ['ES','EU27',...]
  apply_url            TEXT,
  details_url          TEXT,
  documents            JSONB,          -- [{label, url}]
  tags                 JSONB,
  mrr_flag             BOOLEAN,        -- true = PRTR/Next Generation EU
  raw                  JSONB,          -- respuesta cruda de la fuente
  first_seen_at        TIMESTAMPTZ,
  last_seen_at         TIMESTAMPTZ,
  source_updated_at    TIMESTAMPTZ
);
```

**Conocimiento heredado de Cantabria Claude (no perder):**
- BDNS encoding bug: respuestas en UTF-8 mal mappeado de Latin-1. Decode con `Buffer.from(text, 'latin1').toString('utf8')`.
- BDNS `vpd=A07` NO es Cantabria, devolvió Castilla y León. Hay que descubrir el código real iterando.
- BDNS `abiertas=true` y `region=ES13` se ignoran como query param. Filtrar post-fetch.
- BDNS incluye municipales y universitarias (más amplio de lo esperado).
- BDNS `presupuestoTotal` puede venir null (no filtrar agresivo por > 0).
- SEDIA `grantsTenders.json` static (122 MB) no contiene Erasmus+ 2026 todavía — la search API va más al día.

**Bonus**: Cantabria Claude se reenfoca a web pública (`erasmuscantabria.com` en Hetzner+Coolify). Cuando esté la API, mandar handoff de vuelta `FROM_LOCAL_API_READY.md` con base URL + endpoints + auth + schema.

---

## 3 · Recientemente cerrado

| Fecha | Tarea | Commit/PR |
|---|---|---|
| 2026-05-06 | TASK-003 cerrada: réplica local Postgres `erasmus-pg` operativa. Test E2E con dump base 1.5 GB completado (288.294 entities · 317.559 projects · Permacultura Cantabria E10151149 = 164 proyectos). | dump-base-20260505-1828 |
| 2026-04-29 | Hotfix migration 091: batch UPDATEs para no romper healthcheck Coolify (502 Bad Gateway en intake.eufundingschool.com) | `7cfe7cc` en main |

---

## Convenciones

- Una tarea = una sección con `###`
- Status: `APROBADO`, `EN CURSO`, `BLOQUEADO`, `PAUSADO`, `LISTO_PARA_EMPEZAR`
- Cada tarea apunta a su doc canónico en `docs/` cuando existe
- Si una tarea se hace en otro folder/repo (ej. WordPress, designer-projects), indicarlo y poner el path
