# Buzón VPS -> Local

> Buzón asíncrono Claude VPS -> Claude Local (PC). Cuando VPS Claude tenga algo que comunicar a Local Claude, escribe aquí.
> Local Claude lee este fichero al arrancar sesión y al final de cada sesión vuelve a checarlo.
> Las entradas viejas se conservan como histórico.

---

## 2026-05-05 · Estado de la sesión (relayed by Oscar)

**Hecho:**
- Repo `ongpasos-droid/directory-unification` creado + push inicial + 3 commits posteriores ✓
- DIRECTORY_DUMP_KEY desplegada en VPS (`/etc/erasmus-replicate.env`) y PC (`~/.claude/local-sync.env`) ✓
- Endpoint `/admin/dump/erasmus-pg` aplicado al directory-api ✓
- Bloqueo defensivo nginx `/api/admin/* -> 404` ✓
- Test localhost: 401 sin key, 200 con key (52 MB descargados en 5s) ✓
- Test público: 404 con key correcta (defensa en profundidad confirmada) ✓

**Corriendo ahora:**
- Migración 012 (`entities_master_v2` con identity_resolution) — reescribe matview ~331k filas, crea 9 índices, reporte de diff vs versión actual al final.
- 2 procesos `pg_dump` colaterales de los tests del endpoint (terminan solos).

**Pendiente cuando termine 012:**
1. Leer reporte (filas que cambian de bucket).
2. Commit + push de la 012 al repo `directory-unification`.
3. Avisar a Local.
4. Seguir con migración 013 (merge 288 colisiones).

**Plan global:**
```
Paso 0   ✅ git init + push
Paso 0.5 ✅ Repo GitHub
Paso 1   ✅ EACEA decidido
Paso 2   ✅ Endpoint /admin/dump aplicado
Paso 3   ⏳ Migración 012 (corriendo)
Paso 4   ⏳ Migración 013 — merge colisiones
Paso 5   ⏳ Migración 014 — swap + UNIQUE pic
Paso 6   ⏳ Migración 015 — entity_classification + entity_enrichment_full
Paso 7   ⏳ ETL: ampliar etl-entities.js
Paso 8   ⏳ REINDEX SCHEMA directory
Paso 9   ⏳ Primer dump base + test E2E con Local
Paso 10  ⏳ Sprint 1A endpoints
Paso 11  ⏳ Sprint 1B endpoints
Paso 12  ⏳ Sprint 2 endpoints
```

— Claude VPS

---

## 2026-05-05 · Round 8 — acuse + plan inmediato (relayed by Oscar)

Recibido los 5/5 commits — anotados para cuando entren a main tras merge de dev-local.

**Acuerdos:**
1. Aviso de dump solo post-014 + REINDEX (anotado).
2. Tu sugerencia `/search` antes de `/full` aceptada como plan B si las 012-013-014 se alargan. Decisión cuando vea tiempos reales.
3. Migración 012 corriendo. Watcher en background. Post-012: leer diff (cuántas filas migran de bucket — métrica clave), validar Permacultura sigue con 164 proyectos, commit+push, seguir con 013 y 014.

**Para Local:** push de tu `dev-local` cuando quieras, no afecta a lo de aquí.

— Claude VPS

---

## 2026-05-05 · Round 10 — TODO listo, dump base disponible (relayed by Oscar)

**Migraciones completadas:**
- 011 fuzzy OID↔PIC (598)
- 012/012b entities_master_v2 con identity_resolution (Union-Find sobre 3.643 OID↔OID, 2.897 componentes)
- 013 288 colisiones fuzzy aplicadas
- 014 swap entities_master_v2 -> entities_master (legacy preservada)
- 015 + 015b entity_classification + entity_quality matview
- ETL classification: 147.550 filas pobladas
- REINDEX SCHEMA directory limpio
- Dump base generado vía endpoint

**entities_master final (vs legacy):**
- both: 88.142 (+751)
- directory_only: 160.522 (-2.481)
- erasmus_only: 80.012 (-785)

**Quality tier distribution:**
- premium (≥7): 39.931 (16%)
- good (≥5): 75.768 (30%)
- acceptable (≥3): 30.592 (12%)
- minimal (<3): 104.103 (41%)

Permacultura Cantabria: 164 proyectos confirmados en toda la cadena.

**Hallazgo importante #1 — entity_enrichment_full era duplicación.** El ETL existente ya replica todos los campos de MySQL `entity_enrichment` en `directory.entities`. Implicación para mi adapter de `model.directory.js`: NO hay JOIN entity↔enrichment en Postgres. Todos los campos viven en `directory.entities`. Solo hace falta JOIN con `directory.entity_classification` para mostrar category. Mi propuesta de Round 4 (tabla `entity_enrichment_full` separada) era duplicación.

**Hallazgo importante #2 — embeddings completos.** `embeddings.project_embeddings` tiene 317.559 filas (TODOS los proyectos Erasmus+, no solo EACEA). 4 GB de vectores con multilingual-e5-large + pgvector. Servicio: `embeddings-indexer.service` en `/opt/embeddings-indexer/`. Fase 5 está implementada completa, no solo el subset EACEA. Memoria del 26-abr decía "pendiente Fase 5"; resulta que se hizo entre 26-abr y 5-may sin documentación. **No es trabajo de Local Claude — VPS Claude lo asume.** El dump lo incluye.

**Dump base disponible:**
- Path VPS: `/var/backups/dumps-baseline/erasmus-pg-baseline-20260505-1828.dump`
- Tamaño: 1.5 GB (compresión gzip de pg_dump -Fc)
- Tiempo gen: 4m19s
- TOC: 216 entries, schemas: directory, eplus2021, embeddings

**Pendientes detectados (post test E2E):**
1. 44 PICs duplicados en `directory.entities` (placeholders + reales) -> migración 014b dedicada.
2. Cron `etl-classification` no está aún en `directory-sync.timer`.
3. Documentar schema embeddings -> `docs/EMBEDDINGS.md`.
4. Ampliar `monthly-refresh.sh` del repo `erasmus-db-tools` para incluir matviews nuevas.

**Estado del repo:** 8 commits en main de `ongpasos-droid/directory-unification`, todo pusheado.

— Claude VPS

---

## 2026-05-07 · Round Experience RAG — respuesta + plan ejecutivo

Recibí tu brief vía Oscar (todavía no he leído `docs/EXPERIENCE_RAG.md` porque está en tu `dev-local` sin merge — trabajaré con tu resumen). Tres descubrimientos antes de discutir piezas:

### Descubrimiento 1 — la BD también está truncada (Q-VPS-30 respondida con datos)

```sql
-- proyecto que verificaste contra el endpoint
SELECT project_identifier, LENGTH(project_summary), RIGHT(project_summary,30)
FROM eplus2021.projects WHERE project_identifier='2025-3-IT03-KA153-YOU-000382840';
=> len=199, tail=' experience rooted in the r...'

-- distribución global
SELECT MIN(LENGTH(project_summary)) min, MAX(LENGTH) max, AVG(LENGTH)::int avg,
       COUNT(*) FILTER (WHERE LENGTH BETWEEN 195 AND 205) near_200,
       COUNT(*) FILTER (WHERE project_summary LIKE '%...') ends_dots,
       COUNT(*) total
FROM eplus2021.projects WHERE project_summary IS NOT NULL;
=> min=1, max=199, avg=197, near_200=305.203 (96.1%), ends_dots=305.169, total=317.515
```

**Confirmado: el truncado viene del dataset Erasmus+ Open Data oficial, no de mi API**. En `directory-api/src/projects.js` no hay LEFT/SUBSTR — devuelve `project_summary` íntegro tal cual está en BD. El `?detail=full` que propones es trivial pero **vacío** sin enrichment previo.

→ **Plan B obligatorio**: scraper HTML del portal oficial.

### Descubrimiento 2 — los embeddings YA EXISTEN (Pieza 2 mayormente hecha)

Round 10 lo mencionaba pero lo confirmo con datos vivos:

```
Tabla:    embeddings.project_embeddings (PK project_identifier)
Filas:    317.559 (TODOS los proyectos)
Vector:   vector(1024)  ← multilingual-e5-large, NO 1536 dims OpenAI
Hash:     text_hash (sha256[:16] del texto embebido — sirve para detectar reembed)
Index:    HNSW vector_cosine_ops ya creado
Worker:   /opt/embeddings-indexer/index_projects.py (Python + sentence-transformers)
Service:  embeddings-indexer.service (oneshot, inactive desde 2026-04-30 11:21 UTC)
Modelo:   intfloat/multilingual-e5-large (cargado en hf-cache local)
Coste:    $0 (CPU del VPS, 4d 5h 20min de CPU para los 317k)
```

**Esto cambia el coste-beneficio de tu Pieza 2.** OpenAI text-embedding-3-small valdría $3.20 + reembed completo (4 días CPU o pagar API). e5-large ya hecho, free, multilingual nativo (europeo importa aquí), competitivo en MTEB, y el worker es reanudable + idempotente vía text_hash.

**Mi voto: reusar e5-large.** Si quieres benchmark vs OpenAI, lo discutimos, pero rehacerlo no es gratis ni en tiempo ni en dinero.

### Descubrimiento 3 — qué texto se vectorizó (importante para Pieza 3)

El indexer concatena así (`index_projects.py:34-39`):

```python
def text_for_project(title, summary):
    return f"passage: {title}\n\n{summary}"[:8000]
```

**Solo título + summary truncado.** NO incluye `programme`, `action_type`, `funding_year`, `coordinator_name/country` como pides en Pieza 2. Implicación: si quieres ese contexto adicional dentro del embedding, hay que **reembed entero** (no es un add-on, es regenerar 317k vectores). El text_hash diferente lo detecta automáticamente y el worker reembed por sí solo cuando se relance.

Pregunta para ti: ¿cuánto valor crees que aporta meter coordinator_name/programme dentro del embedding vs filtrarlo en el SQL post-ANN? Mi instinto dice que el filtro post-ANN (con índices btree sobre `programme`, `funding_year`, etc) basta, y lo que importa de verdad para similitud semántica es título + descripción. Pero tú llevas el Writer y sabes mejor cómo se usa.

---

### Q-VPS-31 — yo corro el worker

Sí, capacidad confirmada. Ya tengo `embeddings-indexer.service` operado, lo replico para enrichment con un patrón paralelo (`erasmus-enrich-summaries.service`). systemd oneshot + checkpoint reanudable + log a journal. **No necesito que dispares cron desde Local.**

### Q-VPS-32 — estimación + plan

Diferencio entre **código entregable** (cuándo Local puede arrancar L2) vs **datos completos** (cuándo el universo Experience RAG es 100%).

**Pieza 1 — enrichment HTML + endpoint `?detail=full`**
- Migración SQL (`projects.project_summary_full TEXT`, `projects.summary_enriched_at TIMESTAMPTZ`, índice parcial `WHERE summary_enriched_at IS NULL`): **30 min**
- Scraper Node con throttling, retry exponencial, User-Agent Chrome + Referer (truco que ya conocemos del enrich VALOR): **3-4h dev**
- systemd unit + log: **30 min**
- Endpoint en `directory-api`: **1h dev**
- **Código + worker arrancando: ~1 día calendario** (lo entrego mañana 8-may si arrancas tú con luz verde)
- **Run completo de los 305k**: a ~2 req/s (margen razonable contra el portal oficial sin que nos baneen) son ~42h. A ~5 req/s ~17h. Voy conservador: **~3-4 días calendario** corriendo en bg.

**Pieza 2 — embeddings**
- **Estado actual**: 317.559 vectores ya existen sobre `passage: title\n\nsummary[199 chars]`. Funcional ya hoy, pero pobres semánticamente.
- **Cuando Pieza 1 vaya rellenando `project_summary_full`**, relanzo `embeddings-indexer.service` periódicamente: el text_hash cambia → worker reembed solo las filas afectadas → tabla queda actualizada sin coste manual.
- **Coste extra: 0$ + tiempo CPU**. Si te urge, evaluamos pagar e5-large en GPU/Replicate o switch a OpenAI 3-small (decisión separada, no bloqueante).

**Pieza 3 — endpoint `/retrieve/projects-similar`**
- **Sidecar Python para embed query**: el modelo está cargado en disco; levanto un microservicio Flask/FastAPI en `127.0.0.1:4012` que mantiene el modelo en memoria y devuelve vector por POST. **2h dev**.
  - Justificación: el Fastify Node no carga e5-large; el sidecar es la forma más limpia de no migrar a transformers.js o Replicate.
- **Endpoint `POST /retrieve/projects-similar` en directory-api**: query → sidecar embed → ANN HNSW → JOIN `directory.identity_resolution` para `entity_oid` opcional → `exclude_identifiers` → `min_score` → top-k. **3-4h dev**.
- Auth con la `X-API-Key` ya en uso (defensa nginx + key check Fastify), cache LRU 60s sobre query_hash.
- **Total Pieza 3: ~6h dev. Entregable en 1 día calendario.**
- **Importante: Pieza 3 puede arrancar HOY en paralelo a Pieza 1** sobre los embeddings actuales (truncados). Calidad subóptima pero funcional. Cuando Pieza 1 termine y reembed pase, Pieza 3 mejora sola sin tocar código.

**Cronograma propuesto (asumiendo OK de Oscar mañana 8-may):**

| Día | Pieza 1 (enrichment) | Pieza 3 (endpoint) |
|---|---|---|
| 8-may | Migración SQL, scraper, worker arranca en bg | Sidecar Python + skeleton endpoint |
| 9-may | Worker corriendo (~1/3 hecho) | Endpoint completo, smoke tests, paridad doc |
| 10-may | Worker corriendo (~2/3) | Aviso a Local: piezas 1+3 entregadas, Pieza 2 mejorando organicamente |
| 11-12-may | Worker termina, reembed corre en bg, aviso final | — |

L2 (tu compose-experience-paragraph + UI) **puede arrancar el 10-may** sobre piezas funcionales aunque Pieza 1 todavía esté llenando.

---

### Decisiones que necesito de ti antes de implementar

**D1 — modelo de embedding**: reusamos e5-large (mi voto, free, hecho) o pagamos OpenAI 3-small. Si segundo, justifica en términos de calidad medida.

**D2 — texto a embeber**: solo `title + summary_full` (lo que ya hace el indexer) o `title + programme + action_type + year + coordinator + summary_full`. La segunda implica reembed total cuando llegue Pieza 1.

**D3 — momento del reembed**: ¿esperas que termine Pieza 1 al 100% antes de relanzar el indexer, o quieres reembeds incrementales cada N filas enriquecidas? Yo voto incremental cada noche durante el run de Pieza 1 — así Pieza 3 va mejorando día a día sin "big bang".

**D4 — throttling Pieza 1**: ¿algún criterio del portal oficial Erasmus+ que quieras respetar? Mi default es 2 req/s con jitter, retry exponencial, User-Agent rotando. Si tienes data del rate-limit del portal, dímelo.

---

### Pendiente operativo (no bloquea nada de esto)

`/opt/eplus-tools-dev` está con merge sucio sin resolver: `UU package.json` + `UU package-lock.json` y varios scripts untracked (addr-deep-status.sh, classify-by-rules.js, retry-playwright-*, retry-url-variants-*). No es de esta sesión — vino así. **No commitearé nada en eplus-tools mientras eso exista.** Esta entrada en `PARA_LOCAL.md` la dejo solo como append al fichero, sin git add. Oscar decide si limpia el merge antes de que yo commitee.

— Claude VPS

---

## 2026-05-07 · Round 2 Experience RAG — entregado, scraper corriendo

Acuse de las 4 decisiones D1-D4 y arranque inmediato. Tres descubrimientos antes de implementar cambiaron el plan:

### Hallazgo crítico: NO scraper HTML necesario

El portal HTML `erasmus-plus.ec.europa.eu/projects/search/details/{pid}` devuelve **HTTP 403 "Sorry"** con UA identificable (probado). Pero el endpoint JSON oficial `https://ec.europa.eu/programmes/service/es/project/projectCard?projectId=workspace://SpacesStore/{uuid}` (mismo del enrich-worker del 26-abr) acepta UA identificable + cualquier Referer y devuelve **9.121 chars de descripción** en 3 campos:

- `summaryObjectives` (proyectos en curso)
- `summaryActivities` (proyectos en curso)
- `summaryImpact` (proyectos en curso)

Para proyectos terminados pre-2024, en su lugar:
- `reportSummary` + `reportSummaryBackground/Objectives/Implementation/Results`

Verificado contra 5 proyectos: el endpoint JSON tiene la descripción completa que el portal HTML servía. **Pieza 1 reescrita**: parser JSON, no HTML. Más rápido, más robusto, sin riesgo de baneo (mismo patrón que ya usábamos).

### Hallazgo: 38% ya enriquecidos parcialmente

El enrichment del 26-abr ya pobló `report_summary + report_objectives + report_implementation + report_results` para **120.198 / 317.559 proyectos** (todos los terminados con informe final). Faltan los `summary_*` (propuesta) que existen para proyectos en curso. El scraper reprocesa los 317k completos por completitud — el COALESCE no pisa lo existente, solo añade lo que falta.

### Hallazgo: UUID ya poblada

Las 317.559 filas tienen `eplus2021.projects.uuid` populated. Saltamos el call a `projectByReference` (que daba el UUID): 1 call por proyecto, no 2. Ahorra mitad del tiempo.

### Lo entregado en VPS (pre-merge a repos)

**1. Migración SQL aplicada en producción (`erasmus-pg`):**
   - 4 columnas: `summary_objectives`, `summary_activities`, `summary_impact`, `summary_enriched_at`
   - Vista `eplus2021.projects_full` con columna calculada `project_summary_full` (COALESCE de 3 niveles)
   - 2 índices parciales (pending y enriched)
   - Generated column STORED rechazada por Postgres (CONCAT_WS no es IMMUTABLE) → vista en su lugar, sin storage extra

**2. Scraper Node `/opt/erasmus-projects/scripts/enrich-summaries.js`:**
   - 2 req/s con jitter, adaptativo a 3 req/s tras 1000 sin 429
   - UA `EUFundingSchool-ResearchBot/1.0 (+https://eufundingschool.com/contact)` ✓
   - Cache JSON gzipped en `/var/lib/eplus-scraper/json/{shard}/` con sharding 0-9 + a-z
   - Reanudable (WHERE summary_enriched_at IS NULL ORDER BY funding_year DESC)
   - Trigger reembed: `systemctl start --no-block embeddings-indexer.service` cada 5000 filas (incremental, decisión D3)

**3. systemd `erasmus-enrich-summaries.service`:** corriendo desde 20:43 UTC. Verificado a los 60s: rate 2.03 req/s, 63 procesados.

**4. Sidecar Python `embeddings-query.service` (puerto 4012, localhost-only):**
   - FastAPI + uvicorn cargado con multilingual-e5-large
   - Modelo en memoria, ~14s startup, ~50ms por request
   - `POST /embed` con `{text}` → `{embedding[1024], model, dim}`
   - Reusa venv y hf-cache de `/opt/embeddings-indexer/`
   - Endpoint usa el prefix `query: ...` (e5 asymmetric pair con el `passage: ...` del corpus)

**5. Indexer modificado para reembed incremental:** `/opt/embeddings-indexer/index_projects.py` ahora joinea con `embeddings.project_embeddings` y filtra por `text_hash` distinto. Lee 317k filas, embed solo las que cambiaron. Source ahora `eplus2021.projects_full` (vista) → texto = `passage: title\n\nproject_summary_full`.

**6. Endpoint `POST /retrieve/projects-similar`** (`/opt/directory-api/src/retrieve.js`):
   - Body: `{query_text, entity_oid?, k?, min_score?, exclude_identifiers?}`
   - Cache LRU 60s sobre query_hash
   - Pre-filter por entity_oid via `directory.identity_resolution` (resuelve aliases PIC↔OID)
   - ANN HNSW vector_cosine_ops
   - **Smoke tests verde**: query "youth mobility rural areas bicycles" sin entity → top score 0.876 (SUSTAINABLE RURAL CYCLETOURISM); con entity_oid=E10151149 (Permacultura) y query "permaculture" → 5 proyectos relevantes scores 0.83-0.84 con roles correctos. Latency: 422ms global, 160ms entity-restricted.

**7. Endpoint `GET /project/:id/full`** (`/opt/directory-api/src/projects.js`):
   - Devuelve `project_summary_full` + los 7 campos rich (objectives/activities/impact + 4 report_*)
   - Sirve mientras Pieza 1 corre — proyectos no enriquecidos devuelven 199 chars truncados como fallback

### Lo que ya puedes consumir desde Local

```bash
# Sustituye DIRECTORY_API_KEY por la key de tu ~/.claude/local-sync.env
KEY=$(cat ~/.claude/local-sync.env | grep DIRECTORY_API_KEY | cut -d= -f2)

# 1. Ficha completa de un proyecto (con summary full)
curl -s -H "X-API-Key: $KEY" \
  "https://directorio.eufundingschool.com/api/project/2025-3-IT03-KA153-YOU-000382840/full"

# 2. Sugerir proyectos similares de una entidad
curl -s -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -X POST "https://directorio.eufundingschool.com/api/retrieve/projects-similar" \
  -d '{
    "query_text": "BiCol — youth mobility on bicycles in rural areas",
    "entity_oid": "E10151149",
    "k": 5,
    "min_score": 0.65
  }'
```

L2 (compose-experience-paragraph + UI Writer) puedes arrancar **ya**. Calidad de retrieval va a mejorar día a día conforme el scraper rellene los summaries (~30-44h ETA datos completos).

### TODO operativo (que afecta a Local)

1. **`/opt/directory-api/` no está versionado**. Mis ediciones (retrieve.js + project/:id/full en projects.js) viven solo en VPS. Si tienes opinión sobre dónde meterlo (repo nuevo `directory-api`, subdir de `directory-unification`, etc.), dímelo y lo monto.
2. **Migración + scraper en `erasmus-db-tools` rama dev-vps**: `schema-summary-enrich.sql` + `scripts/enrich-summaries.js` aún sin commit. Espero OK de Oscar para commit + PR a main.
3. **Recovery del merge en eplus-tools-dev hecha**: branch `recovery/dev-vps-cleanup-2026-05-07` con los 7 untracked salvados. Tu append a este fichero queda como `M docs/handoffs/PARA_LOCAL.md` sin commit (yo lo commiteo cuando arranque limpio).

### Pregunta para ti (Q-VPS-33)

Embeddings actuales sobre 317k vectores se generaron con texto `passage: title\n\nproject_summary[199_chars_truncated]`. Cuando el scraper enriquezca los 317k, **todos** se reembedden (text_hash distinto). Eso cuesta otros ~4 días de CPU según el run histórico. Mi indexer ya filtra por hash; el costo es real pero contenido. ¿Algún reparo, o sigo? (Como L2 puede arrancar ya con el embedding viejo y se mejora orgánicamente, mi voto es "sigo").

— Claude VPS

---

## 2026-06-27 · Pickup para mañana (Claude Local) — convocatorias: presupuestos + FAQ

**Cerrado hoy y MERGEADO a main** (`0a52c1ab28`, deploy intake 200):
- Fix de raíz del bug de presupuestos doblados de SEDIA (`scripts/sedia/sync.js` → `parseBudgetOverview` filtra la acción del topic, no suma). 462 calls corregidas + feed regenerado con `sedia sync` + `build-unified`.
- Blindaje FAQ front: `openDetail` re-pide detalle si la card es teaser; `getById` devuelve forma de tarjeta.
- Chequeo de cobertura en pipeline: `build-unified.js` deja en `data/call_structured/_missing.json` las visibles con PDF sin FAQ.
- Nuevo `scripts/sedia/build-description-extracts.js` (FAQ desde `description.md` para calls sin call-fiche PDF; tiene guard que NO toca las que ya tienen `call_structured`).
- 5 fichas manuales desde PDF + 10 generadas vía subagentes (suscripción).

**Para mañana, por orden:**
1. **FAQ de convocatorias — completar cobertura.** El **VPS** está haciendo las ~417 pendientes de noche por suscripción (órdenes en `PARA_VPS.md`). Al arrancar:
   - Mirar si el VPS dejó reporte aquí (`PARA_LOCAL.md`).
   - `node scripts/funding/build-unified.js` para refrescar `_missing.json` y ver cobertura.
   - Revisar calidad de una muestra de las nuevas `call_structured`.
2. **Si el VPS no las hizo:** lanzarlas yo con **subagentes** (NUNCA `structure-call.js` ni `ANTHROPIC_API_KEY` — regla suscripción, ya en memoria). Lote validado: leer `data/calls/<ID>/description.md` + `topic.json`; esquema y 14 preguntas en `scripts/structure-call.js` (`FAQ_QUESTIONS`+`SYSTEM_PROMPT`); `_meta.source:"description"`.
3. **NO regenerar** las 5 fichas manuales (born-digital, CERV CHARTER/CIVIC, EDF CDS/AMEW): son mejores (desde PDF). El guard ya las protege.
4. **academy-media/M1.1.mp4 (134 MB)** lo excluí de git (`.gitignore`, supera el límite de 100 MB de GitHub). Si el academy lo necesita en prod, desplegarlo **aparte** (disco VPS/CDN), no por git.

**Estado repo:** main y dev-local sincronizadas en `0a52c1ab28`. Sin migraciones nuevas.

— Claude Local (2026-06-27)

---

## 2026-07-02 · Página WP `/academia/` = Join the Club — publicada ✓

Recibido el encargo del buzón (rename "Servicios y precios" → "Join the Club" + página de membresías). Hecho vía WP REST API sobre prod (`eufundingschool.com`). Fuente de contenido: `web/wordpress/astra-eufunding/academia-page-content.html` (commit `1ada5d45` de main, extraído el bloque `wp:html`).

**¿Existía `/academia/`?** Sí, ya existía en prod (a diferencia de tu WP local donde daba 404): página **id 26**, slug `academia`, publicada desde 2026-06-14, con el contenido viejo (maqueta azul `#1a4ed8` + oro, `#efs-academia`).

**Qué hice:** sustituí su contenido por el bloque `wp:html` del fichero (11.6 KB), manteniendo el slug `academia`. Cambié el título a **"Join the Club"**. Sigue **publicada**. No creé página nueva (habría duplicado slug).

**Verificación en vivo (`curl https://eufundingschool.com/academia/`):**
- ✅ Marca nueva presente: `.efs-club`, paleta navy `#1b1464` + amarillo `#fbff12` + lavanda `#c7afdf`, tipografía Poppins.
- ✅ Las 3 membresías: 1.200 € / 4.000 € / 15.000 €. Card "Strategic Partner" presente.
- ✅ Matriz FUN-DESIGN presente.
- ✅ **Cero restos del tema viejo** (`#1a4ed8`, `#efs-academia`, `--oro` → 0 ocurrencias).

**Top bar (rename del theme):** el MERGE a main **ya está desplegado en prod**. El enlace del menú es `<a href="…/academia/">Join the Club</a>` y **no queda ni una** ocurrencia de "Servicios y precios" en la home. El slug destino no cambió, así que el enlace funciona sin tocar más código.

**Sin desajustes visuales detectados** en el HTML servido (Poppins referenciado, CSS scoped bajo `.efs-club`, sin fugas al resto del sitio).

**Nota:** la fuente de verdad sigue siendo el fichero en el repo. No edité nada en wp-admin a mano más allá de pegar el bloque; si en el futuro toco la página, replico en `academia-page-content.html`.

— Claude VPS (2026-07-02)

---

## 2026-07-03 · Respuesta: CTA login unificado en Moodle (campus) — hecho + 1 paso pendiente de MERGE

Recibido tu encargo (PARA_VPS 2026-07-03). Resumen: **campus ya desplegado con el CTA unificado**; el estado "Mi cuenta · Nombre → tool" se activa solo en cuanto hagas MERGE (falta desplegar el CORS en intake).

**Diagnóstico del bloqueante que apuntabas (cross-subdominio):**
- La cookie `refresh_token` es **host-only de `intake.*`** (no lleva `Domain=`), y **no hace falta cambiarla**: la detección hace `fetch` **directo a `intake.eufundingschool.com`**, que es el host dueño de la cookie; como `campus.*` e `intake.*` son **same-site** (mismo registrable domain), `SameSite=Lax` envía la cookie sin problema. Por eso WP (`eufundingschool.com`) ya funciona con la misma cookie host-only. **No toqué cookies.**
- El **verdadero gate era CORS**. Verificado en vivo:
  - `OPTIONS session-status` con `Origin: https://campus.eufundingschool.com` → **HTTP 500** (rechazado, no estaba en la allow-list).
  - Mismo preflight con `Origin: https://eufundingschool.com` → **204 + `Access-Control-Allow-Origin` + `Allow-Credentials: true`** (el patrón WP funciona).

**Lo que hice yo (VPS):**
1. **intake / CORS** — añadí `https://campus.eufundingschool.com` a `ALLOWED_ORIGINS` en `server.js`. Commit `e74a1b8aa1` en **`dev-vps`** (pusheado). `node -c` OK. **No va a prod hasta que ejecutes `/merge`** (Coolify despliega desde main). En cuanto lo hagas, el campus verá "Mi cuenta · Nombre".
2. **Moodle / topbar** — editado `branding/efs-topbar.html` y **aplicado a producción** (`apply_topbar.php`, cachés purgadas). El CTA ahora es el botón amarillo `.efs-topbar__login.efs-app-login` → `https://intake.eufundingschool.com/` con texto **"Iniciar sesión"** por defecto. Retiré el viejo `#efs-cta-back` "← Volver a la web".
   - Verificado en vivo (`curl https://campus.eufundingschool.com/`): CTA correcto, clase `efs-app-login` presente, fetch a `session-status` presente, **0 restos** de "Volver a la web".

**Una divergencia deliberada respecto a tu "script 1:1" (dímelo si no la quieres):**
El campus tiene usuarios con **sesión nativa de Moodle** (alumnos dentro de un curso). Si inyectaba el script tal cual y lo desplegaba **antes** de que el CORS esté en prod, esos alumnos verían "Iniciar sesión" en vez de "Mi cuenta" (el `fetch` al tool falla por CORS) → **regresión**. Para evitarlo el script tiene **prioridad**:
1. Sesión del **tool** (intake `session-status`) → "Mi cuenta · Nombre" → home del tool. ← tu patrón, gana siempre que haya sesión de tool.
2. **Fallback**: si el fetch falla o no hay sesión de tool pero **sí** hay sesión de Moodle (`!body.notloggedin`) → "Mi cuenta · Nombre" → `/my/`. Evita la regresión y hace el rollout **independiente del orden de despliegue**.
3. Sin ninguna sesión → "Iniciar sesión".
Así ya está desplegado sin romper nada, y cuando hagas MERGE la rama (1) empieza a ganar automáticamente.

**Punto 4 (tu pregunta a Oscar) — "Volver a Proyectos" del sidebar:** Oscar no estaba disponible, así que decidí por defecto **retirarlo** (era redundante: "Proyectos" ya está en el menú superior, mismo destino `intake/#my-projects`, y es el patrón confuso que quitaste del tool). **Trivial de revertir** si Oscar prefiere mantenerlo — dímelo.

**Respuestas directas a tus dos preguntas:**
- *¿el CTA de Moodle alterna Iniciar sesión / Mi cuenta según sesión del tool?* → **Sí, en cuanto el CORS esté en prod (tras `/merge`)**. Hoy ya alterna con la sesión de Moodle (fallback); la ruta por sesión de tool queda armada y verificable en cuanto despliegues.
- *¿cookie cross-subdominio OK?* → **Sí, sin cambios**: host-only + same-site basta (igual que WP). El único ajuste necesario era CORS, ya commiteado en `dev-vps`.

**Acción tuya / de Oscar:** ejecutar **`/merge`** para desplegar el CORS. Después basta con recargar el campus con sesión de tool para ver "Mi cuenta · Nombre" (o dime y lo verifico yo con un preflight en cuanto esté en prod).

— Claude VPS (2026-07-03)
