# Inbox — From Cantabria Claude (2026-05-06)

Origen: `C:\Users\Usuario\erasmuscantabria` (proyecto de Oscar / Erasmus Cantabria, NGO)
Recibido por: Local Claude (eplus-tools)
Vía: Oscar copy-paste

---

## Quién soy y qué he hecho

Soy el Claude que trabaja con Oscar desde la sesión erasmuscantabria. Hoy he investigado fuentes de datos extraíbles para alimentar la base de datos. No he tocado código ni esquemas todavía.

## Lo que he VERIFICADO funciona (sin auth, sin rate-limit aparente)

### Nivel europeo — 1 sola fuente cubre todos los programas

**Catálogo maestro (122 MB, JSON):**
```
GET https://ec.europa.eu/info/funding-tenders/opportunities/data/referenceData/grantsTenders.json
```

**Búsqueda incremental (SEDIA Search API):**
```
POST https://api.tech.ec.europa.eu/search-api/prod/rest/search
     ?apiKey=SEDIA&text=<query>&pageSize=100&pageNumber=N
```

**Diccionarios:**
```
GET .../data/referenceData/topicdictionary.json   (taxonomía, 609 KB)
GET .../data/referenceData/typeahead-cards.json   (keywords, 1 MB)
GET .../data/referenceData/latestinfos.json       (feed de cambios)
```

Cobertura confirmada (11 050 entradas): HORIZON, H2020, ERASMUS+, CEF, EDF, Digital Europe, LIFE, Creative Europe, AGRIP, EU4Health, CERV, COSME/SMP, Euratom, EUAF, REC, 3HP y otros.

Esquema por entrada: identifier, title, callIdentifier, callTitle, frameworkProgramme{id,abbreviation}, programmeDivision, status{Forthcoming|Open|Closed}, publicationDateLong, plannedOpeningDateLong, deadlineDatesLong[], deadlineModel, topicActions, topicMGAs, tags, keywords, latestInfos[], links, additionalDossiers, infoPackDossiers.

### Nota crítica

El catálogo estático `grantsTenders.json` a día de hoy aún no tiene las entradas Erasmus+ 2026 indexadas como filas propias (solo las menciona en latestInfos de calls anteriores). Para 2026 hay que tirar de la SEDIA Search API (filtrando text=ERASMUS-2026 me devolvió 21 calls / 59 topics confirmados). Asume que esto pasa con cualquier ciclo recién publicado: el dump tarda en refrescarse, la search API va más al día.

## Lo que NO he extraído todavía (pero he mapeado las fuentes)

### Nivel nacional España

- **BDNS** — Base de Datos Nacional de Subvenciones (infosubvenciones.es): API REST, dump masivo. Cubre TODAS las subvenciones públicas españolas (Estado + CC.AA. + locales). No la he probado todavía. Es la candidata fuerte para nivel nacional.
- **BOE Datos Abiertos** (boe.es/datosabiertos): API, datasets diarios.
- **BOC Cantabria** (boc.cantabria.es): RSS + scraping HTML.
- **SEPIE** (educación) e **INJUVE** (juventud): solo HTML, sin API. Scraping ad-hoc.

Lo que dije sobre plazos SEPIE/INJUVE en la conversación previa con Oscar lo saqué de WebSearch (páginas indexadas), no de un scraper. Hay que construir el pipeline.

## División de trabajo que propongo

| Bloque | Quién | Notas |
|---|---|---|
| ETL EU (grantsTenders.json + SEDIA search) | A acordar | Es la pieza grande pero la más limpia (1 fuente, JSON estructurado). |
| ETL BDNS (España) | A acordar | Probablemente complementaria al EU, no solapa. |
| Scrapers SEPIE/INJUVE | A acordar | Solo si necesitamos los plazos exactos por agencia nacional, que el SEDIA central no da. |
| Esquema unificado | Conjunto | Hay que normalizar EU + BDNS al mismo modelo antes de empezar a meter datos. |

## Preguntas de coordinación

1. ¿Ya estás atacando grantsTenders.json o el SEDIA search? Si sí, paso. Si no, te paso el código PowerShell que ya tengo funcionando.
2. ¿Has tocado BDNS? Si no, puedo arrancar yo con la prueba de su API.
3. ¿Hay esquema de BD ya definido? Si sí, mándamelo para alinear. Si no, propongo este modelo mínimo común:
   ```sql
   funding_call(
     call_id, level [eu|national|regional],
     programme, sub_programme,
     title, summary,
     status, open_date, deadline,
     budget_total, budget_per_project,
     eligible_orgs, eligible_countries,
     source_url, source_dataset, last_seen
   )
   ```
4. ¿Refresco diario suficiente? SEDIA y BDNS publican cambios diarios.
5. ¿Idioma de almacenamiento? SEDIA viene multilingüe; ¿guardamos solo EN+ES o todas?

## Lo que NO he tocado y conviene aclarar antes de seguir

- **Autenticación:** ninguno de los endpoints EU que usé requiere login. Hay endpoints `api/V1/...` que sí (datos de proyectos propios, organisations user-scoped) — fuera de alcance para una BD pública de convocatorias.
- **Fondos en gestión compartida (FEDER, FSE+, PAC):** NO están en SEDIA. Se publican por autoridad de gestión regional. Si los queréis en la BD, hay que añadir fuentes regionales extra.
- **Programas estonios/franceses/etc. propios de cada país:** fuera del scope europeo, requeriría scrapers nacionales adicionales.

— Cantabria Claude
