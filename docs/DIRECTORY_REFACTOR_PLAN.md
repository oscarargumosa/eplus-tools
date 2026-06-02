# Directory Refactor — Plan de ejecución

**Última revisión:** 2026-05-05
**Status:** APROBADO el diseño · pre-requisito de datos RESUELTO · esperando endpoints directory-api (Sprint 1 VPS Claude) y migración 012
**Owner:** Oscar (negocio) · Claude VPS (datos+API) · Claude Local (app)
**Doc canónico:** este. Cualquier cambio de alcance se registra aquí.

> **Cambio de alcance 2026-05-05:** la versión 2026-04-29 de este plan asumía que la integración de proyectos EU sería una BBDD nueva en MySQL `eplus_tools`. La realidad: VPS Claude ya construyó la fusión completa en Postgres `erasmus-pg` del VPS. Este plan está reescrito para reflejar esa realidad. Coordinación en `docs/handoffs/PARA_VPS.md`.

---

## 0 · Contexto y motivación

El directorio de entidades actual (`/v1/entities` + UI sidebar de filtros) tiene 4 problemas que justifican el refactor:

1. **Búsqueda no encuentra cosas obvias.** Usa `MATCH ... AGAINST` (FULLTEXT NATURAL MODE) sobre `extracted_name + description`. Como muchos `extracted_name` salieron del scraping con basura ("Cantabria" en lugar de "Permacultura Cantabria"), buscar "permacultura" no encuentra esa entidad. Tampoco busca en `legal_name`.
2. **Filtros poco útiles** (tier, idioma, CMS, contacto): Oscar no quiere que el usuario los vea. La calidad de tier es opaca. El idioma se deduce del país. El contacto entra en conflicto con RGPD.
3. **Datos personales visibles** (email, teléfono): viola RGPD si se muestran sin consentimiento explícito de la organización dueña.
4. **Scoring opaco e irrelevante**: las 3 barras (`score_professionalism`, `score_eu_readiness`, `score_vitality`) se calculan a partir de heurística scraping y no responden a la pregunta real del usuario: *"¿esta entidad tiene los datos que necesito para escribir un proyecto con ella?"*.

Bug subyacente bloqueante (F1): `node/src/modules/entities/model.js:120,187` hace `INNER JOIN entity_enrichment ON ... AND archived=0` -> filtra ~123k de las 288k entities en prod (todas las que no tienen enrichment). Permacultura Cantabria es una de las invisibles.

---

## 1 · Decisiones cerradas (Q&A 2026-04-29, vigentes 2026-05-05)

| # | Pregunta | Decisión |
|---|---|---|
| Q1 | Búsqueda: substring vs prefix | **Substring puro** (`%perma%`). Cubre el caso "alfa" -> "Alphatest" y "test" -> "Alpha test". |
| Q2 | Entidades no reclamadas en cards | Mostrar 3 barras igual, calculadas con **heurística "proyectos EU"**: ≥5 proyectos verificados -> asume mín. 1-2 personal y 12 stakeholders. **Badge visible:** "No es miembro de la plataforma" en cards no-reclamadas. |
| Q2b | Diferenciación funcional reclamada vs no | **Calculator (presupuestar): permite ambas.** **Writer (escribir): solo entidades reclamadas con datos completos + acuerdo del consorcio.** |
| Q3 | Estructura "Personal" | Aprovecha tablas existentes en MySQL: `org_key_staff`. Definición de "completo" + fórmula en §4. |
| Q4 | Fuente de "Experiencia" | **Dos fuentes:** (a) Postgres `directory.entity_project_stats` (proyectos UE oficiales 2014-2025) + (b) MySQL `org_eu_projects` (carga manual por usuario). Suman. |
| Q5 | Stakeholders | Ya existe `org_stakeholders` en MySQL. Modelo: entidades locales/nacionales con las que la org colabora. |
| Q6 | RGPD email/phone | **OCULTOS por defecto en TODOS los sitios.** Visibilidad solo si: (i) la org está reclamada, Y (ii) el responsable hace click en toggle "hacer datos visibles". Aplica en cards, ficha, Atlas popup, smart shortlist. |
| Q7 | Scores viejos | **Eliminar UI primero, columnas DB en limpieza posterior.** No aportan UX. |

---

## 2 · Pre-requisito (RESUELTO 2026-05-05)

**Antes:** Oscar tenía pendiente integrar BBDD externa proyectos EU. Tablas previstas: `eu_projects`, `eu_project_partners` en MySQL.

**Ahora:** la integración existe en **Postgres `erasmus-pg` del VPS**, con un schema más rico que el originalmente previsto. Tablas canónicas:

### Schema `eplus2021` (datos oficiales UE Erasmus+ 2014-2025)
- `projects` (317.559 filas, 99% con `project_summary`)
- `organisations` (198.519 filas)
- `project_organisations` (839.569 filas — relación N:M con `role`, `contribution_eur`, etc.)

### Schema `directory` (capa unificada construida por VPS Claude)
- `entities` (288.294 filas — equivalente al MySQL `entities` pero canónica)
- `identity_resolution` (453.363 mapeos OID↔PIC fuzzy)
- `entities_master` matview (331.299 — bucketing `both/directory_only/erasmus_only`)
- `entity_project_stats` matview (167.853 — agregados por OID: project_count, programmes, etc.)
- `entity_top_copartners` matview (1.413.337 — top 20 socios por OID)
- `entity_yearly_timeline` matview (443.820)
- `entity_classification` (sincronizado desde MySQL — pendiente migración 015 VPS)
- `entity_enrichment_full` (sincronizado desde MySQL — pendiente migración 015 VPS)

Acceso: `https://directorio.eufundingschool.com/api/*` con header `X-API-Key: 0df89a4bab006f...`. Rate limit 10/s.

---

## 3 · Decisión arquitectónica clave: ¿la app consume Postgres cómo?

Hoy `node/src/modules/entities/model.js` consulta MySQL `eplus_tools.entities + entity_enrichment + entity_classification` directamente. Para mostrar datos de proyectos EU, hay que cambiar de fuente.

**Decisión:** la app **llama al directory-api del VPS por HTTP**, no usa MySQL para listEntities/getEntity.

### Por qué no sync MySQL <- Postgres

- Schema drift: cada matview nueva del VPS exige una migración nueva en MySQL.
- Latencia de actualización: ETL cada 6h vs lectura on-demand HTTP.
- Cost: replicar 6.9 GB Postgres en MySQL no aporta — solo necesitamos query, no write.
- Separación de responsabilidades: MySQL `eplus_tools` queda como BD operacional (proyectos, partners, write); Postgres queda como BD de directorio público (read-only).

### Feature flag para transición segura

```
ENTITIES_BACKEND=mysql        # default, modo legacy (consulta directa MySQL)
ENTITIES_BACKEND=directory_api # llama directory-api por HTTP
```

Switch sin redeploy: actualizar env var en Coolify, reload. Si hay problemas, vuelta atrás instantánea.

Implementación:
- `node/src/modules/entities/backend.js` -> selector según `process.env.ENTITIES_BACKEND`
- `node/src/utils/directory-api.js` -> cliente HTTP (fetch + X-API-Key + retry exponencial + cache LRU 60s)
- `model.js` actual queda como `model.mysql.js` (modo legacy)
- `model.directory.js` nuevo (modo directory-api)

Tras 1-2 semanas estables en `directory_api`, drop del modo `mysql` y consolidación.

---

## 4 · Endpoints de directory-api requeridos por la app

Lista negociada con VPS Claude en `docs/handoffs/PARA_VPS.md` (Round 2, Sprint 1):

### Sprint 1 — desbloquea feature flag
1. **`GET /search`** con filtros `q, country, category, tier, tier+, language, cms, has_email, has_phone, sort, page, limit`. Substring sobre `extracted_name + description + legal_name`.
2. **`GET /facets`** — counts por country/category/language/cms para los dropdowns UI.
3. **`GET /stats/breakdown?dim={country|category|language|cms|tier}`** — stats granulares.
4. **`GET /entity/:id/full`** — ficha + stats + top 5 copartners + 5 años timeline en una llamada (evita N+1).

### Sprint 2 — completa la migración
5. **`GET /entity/:id/similar?country=&category=&tier_min=&limit=`** — top N similares por quality.
6. **`GET /entities?ids=OID1,OID2,...&fields=...`** — bulk lookup (max 100 IDs/request).

### Endpoints que se quedan en Node
- `POST /v1/entities/smart-shortlist` — usa proyectos del usuario, no es lookup directorio.

---

## 5 · Tablas/columnas nuevas en MySQL `eplus_tools` (sí siguen siendo necesarias)

### Migración `095_org_contacts_visibility.sql` (RGPD)

```sql
ALTER TABLE organizations
  ADD COLUMN contacts_public TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN contacts_public_at DATETIME NULL;
```

Aplica solo a organizations **reclamadas**. Las entities sin reclamar nunca exponen contactos (porque no hay responsable que pueda autorizar). Esto vive en MySQL porque es estado del usuario, no del crawl.

---

## 6 · Fórmulas de las 3 barras (sin cambios — solo cambia la fuente de datos)

Devuelven valor 0..100. Calculadas en backend (Node) o en matview Postgres (preferible para no recalcular en cada request).

### 6.1 — Personal (orgs reclamadas)
| Componente | Peso |
|---|---|
| Contacto principal: `name` no vacío | 30% |
| Contacto principal: `email` no vacío | 30% |
| Contacto principal: `role` (cargo) no vacío | 30% |
| Por cada `org_key_staff` adicional con `name` no vacío | +10% |
| Cap máximo | 100% |

Datos: MySQL `organizations + org_key_staff`.

### 6.2 — Experiencia (orgs reclamadas)

```
n_projects = COUNT(org_eu_projects WHERE organization_id = X)             -- MySQL, manual
           + (entity_project_stats.project_count WHERE oid = X)           -- Postgres, oficial
score = MIN(100, n_projects * 10)
```

### 6.3 — Stakeholders (orgs reclamadas)

```
n_stakeholders = COUNT(org_stakeholders WHERE organization_id = X)
score = MIN(100, n_stakeholders * 10)
```

Datos: MySQL `org_stakeholders`.

### 6.4 — Heurística para entidades NO reclamadas

Datos exclusivamente de Postgres:

```
n_eu_projects = entity_project_stats.project_count WHERE oid = X

-- Personal inferido (cap 50% sin reclamar)
if n_eu_projects >= 20:   personal = 50
if n_eu_projects >= 10:   personal = 40
if n_eu_projects >= 5:    personal = 30
else:                     personal = MIN(20, n_eu_projects * 4)

-- Experiencia (real, verificada)
experiencia = MIN(100, n_eu_projects * 10)

-- Stakeholders inferidos por co-participación
n_co_partners = COUNT(DISTINCT entity_top_copartners.partner_oid WHERE oid = X)
stakeholders = MIN(100, n_co_partners * 10)
```

> **Cap a 50% para Personal cuando no está reclamada** — para que reclamar siempre suba el score, no baje.

### 6.5 — Resumen visual (cards)

```
[ logo ] Permacultura Cantabria (ES · Penagos)
         Asociación cultural y medioambiental
         Personal     ████████░░  80%
         Experiencia  ██████░░░░  60%
         Stakeholders ████░░░░░░  40%
         [⚠ No es miembro de la plataforma]    ← solo si !claimed
```

---

## 7 · Búsqueda — implementación en directory-api

### 7.1 — Filtro `q` (substring)

```sql
WHERE (
     em.name        ILIKE '%' || $1 || '%'      -- entities_master.name (COALESCE listo)
  OR ee.legal_name  ILIKE '%' || $1 || '%'      -- directory.entities.legal_name
  OR ee.description ILIKE '%' || $1 || '%'      -- entity_enrichment_full.description (post-mig 015)
)
```

Postgres con `pg_trgm` + GIN puede acelerar `ILIKE %x%` masivamente. VPS Claude evalúa en migración 015.

### 7.2 — Display name — fix Permacultura Cantabria

Aprovechar columna `name` ya calculada en `entities_master`. Confirmar con VPS Claude que la fórmula del COALESCE es:

```sql
CASE
  WHEN extracted_name IS NULL OR extracted_name = '' THEN legal_name
  WHEN char_length(extracted_name) < char_length(legal_name) / 3
       AND legal_name ILIKE '%' || extracted_name || '%' THEN legal_name
  ELSE extracted_name
END AS name
```

Si la matview hoy hace solo `COALESCE(extracted_name, legal_name)`, abrir issue para que use esta versión más robusta. Esto arregla "Cantabria" -> "ASOCIACION CULTURAL Y MEDIOAMBIENTAL PERMACULTURA CANTABRIA" sin re-scrapear.

### 7.3 — Filtros que se conservan
- `country` (dropdown ISO list)
- `category` (dropdown — desde `directory.entity_classification`, sincronizada en mig 015 VPS)

### 7.4 — Filtros que se eliminan del UI (pero el endpoint los acepta)
`tier`, `language`, `cms`, `has_email`, `has_phone`. La app no los pasa, pero el endpoint los soporta para herramientas internas.

---

## 8 · UI — rediseño del directorio (sin cambios respecto a v1)

### 8.1 — Layout

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 [ buscar...                ]  [País ▾]  [Tipo ▾] [⌕] │
├─────────────────────────────────────────────────────────┤
│  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐            │
│  │ card  │  │ card  │  │ card  │  │ card  │            │
│  └───────┘  └───────┘  └───────┘  └───────┘            │
│  (paginación)                                           │
└─────────────────────────────────────────────────────────┘
```

Eliminado: sidebar izquierda completa.

### 8.2 — Card

```
┌─────────────────────────────────────┐
│ [logo]  ASOCIACION CULTURAL Y...    │
│         ES · Penagos · ONG          │
│                                     │
│         Personal      ███████░ 70%  │
│         Experiencia   ████░░░░ 40%  │
│         Stakeholders  ███████░ 70%  │
│                                     │
│  ⚠ No es miembro                    │ ← solo si !claimed
└─────────────────────────────────────┘
```

**Sin email, sin teléfono.**

### 8.3 — Ficha de detalle

- Header: logo + display_name + país + ciudad + tipo + status (reclamada/no)
- 3 barras grandes
- Pestañas: Datos generales · Personal · Experiencia · Stakeholders · Acreditaciones
- Email / phone:
  - Si **!claimed** -> no se muestran. Mensaje: *"Esta organización aún no es miembro de la plataforma. Reclámala si te pertenece."*
  - Si **claimed** AND `contacts_public=1` -> visibles
  - Si **claimed** AND `contacts_public=0` -> ocultos con mensaje *"El responsable ha optado por mantener los datos de contacto privados."*

### 8.4 — Toggle de visibilidad RGPD

En **Mi Organización · Datos generales** (solo el dueño/admin de la org):

```
Visibilidad de datos de contacto
○ Privados (solo yo)               [predeterminado]
○ Públicos (visibles en directorio, ficha, atlas, shortlist)
```

Aplica a `email + phone` en simultáneo. Granularidad fina (mostrar email pero no phone) la dejamos para v2.

---

## 9 · Replicación local de Postgres `erasmus-pg`

Para que Claude Local pueda hacer test offline contra los mismos datos que Live:

- Postgres 16 en Docker: `infra/docker-compose.local.yml` (puerto 5433, ya creado).
- Sync: `scripts/sync-prod-pg-to-local.sh` (descarga dump vía endpoint `/admin/dump` con SSH tunnel, ya creado, esperando endpoint operativo).

Ver `docs/handoffs/PARA_VPS.md` para coordinación.

---

## 10 · Fases de ejecución

| Fase | Descripción | Bloqueado por | Owner | Estimación |
|---|---|---|---|---|
| **PRE** | ~~Oscar integra BBDD proyectos EU~~ -> RESUELTO 2026-05-05 (Postgres VPS) | — | — | — |
| **VPS-S0** | Endpoint `/admin/dump` + admin key + primer dump base + replicación local | DIRECTORY_DUMP_KEY desplegada ✓ | VPS Claude | esta semana |
| **VPS-012-014** | Migraciones 012 (entities_master_v2 fuzzy OID↔OID) + 013 (merge colisiones) + 014 (swap + UNIQUE pic) | VPS-S0 | VPS Claude | esta semana |
| **VPS-015** | Sync MySQL `entity_classification` + `entity_enrichment_full` -> Postgres + matview `entity_quality` | VPS-S0 | VPS Claude | esta semana |
| **VPS-Sprint-1** | Endpoints `/search` filtros + `/facets` + `/stats/breakdown` + `/entity/:id/full` | VPS-015 | VPS Claude | siguiente |
| **L1-stub** | `infra/docker-compose.local.yml` + `scripts/sync-prod-pg-to-local.sh` (stub) + `node/src/utils/directory-api.js` cliente + `node/src/modules/entities/backend.js` switch ENTITIES_BACKEND | — | Local Claude | HOY 2026-05-05 (1/5...5/5) |
| **L2-cutover** | Implementar `model.directory.js` consumiendo directory-api + paridad funcional con `model.mysql.js` | VPS-Sprint-1 | Local Claude | tras Sprint 1 |
| **L3-search** | Substring search + fix display_name + eliminar filtros viejos en UI | L2-cutover | Local Claude | 3-4h |
| **L4-scoring** | Cálculo 3 barras nuevas (Personal/Experiencia/Stakeholders) en cards/ficha + eliminar 3 scores viejos del UI | L3-search | Local Claude | 1 día |
| **L5-rgpd** | Migration 095 + toggle UI en Mi Org + gating en cards/ficha/atlas/shortlist | — (paralelo a L4) | Local Claude | 3-4h |
| **VPS-Sprint-2** | Endpoints `/entity/:id/similar` + bulk `/entities?ids=...` | VPS-Sprint-1 | VPS Claude | tras L4 |
| **L6-cleanup** | Drop columnas scores viejos en MySQL tras 30d sin reclamaciones · drop modo mysql del feature flag | L4 estable | Local Claude | 30min cuando toque |

---

## 11 · Funciones que NO se incluyen (out of scope)

- Re-enrichment masivo del scraper. Solo si tras L3 + display_name fix sigue siendo problema visible.
- Granularidad fina de visibilidad RGPD (email sí, phone no).
- Filtros avanzados (idioma, CMS, etc.) en UI — explícitamente quitados.
- Mensajería interna entre orgs.
- Filtro "solo reclamadas" en directorio — para más adelante.

---

## 12 · Punto de retorno

Si pasan >2 semanas sin tocar el plan, revalidar todo. El contexto cambia rápido. Antes de retomar:
1. Releer este doc completo.
2. Releer `docs/handoffs/PARA_VPS.md` y `PARA_LOCAL.md` para ver dónde se quedó la coordinación.
3. Verificar status de las migraciones 012-015 en VPS y endpoints en directory-api.
4. Confirmar que las decisiones del §1 siguen vigentes con Oscar.
