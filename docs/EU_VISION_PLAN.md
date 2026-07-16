# EU Vision — Modelo de datos + Plan de implementación

> **Estado:** DISEÑO APROBADO (flujo validado con mockup) · pendiente de arrancar F1
> **Owner:** Local Claude (eplus-tools)
> **Fecha:** 2026-07-11
> **Mockup de referencia:** `scratchpad/eu-vision-mockup.html` (artifact `f24ee8ba`)

---

## 1 · Qué es

**EU Vision = un asistente de 5–10 min que convierte una idea vaga en una "ficha de visión" concreta**, compartible con la comunidad y lista para arrancar en Diseñar (Intake).

Es un **paso 0**, antes de la Fase 1 (Design). No compite con Intake: lo alimenta. Nueva pestaña en el topbar (`#eu-vision`), junto a Convocatorias / Movilidades.

**Principio rector:** la visión se construye **siempre sobre una convocatoria ya elegida**. De la call sacamos criterios, presupuesto y tipo de socio (ya los tenemos desmenuzados), así que al usuario **solo le preguntamos lo suyo**: el reto, el porqué europeo y a quién busca.

### Los dos consumidores de la ficha
1. **Comunidad** (v2) — se publica en "Explorar visiones"; otras entidades marcan "Me interesa participar". El interés queda vinculado **a la entidad** del interesado.
2. **Intake** — botón "Llevar a Diseñar" precarga el proyecto y los textos alimentan al Writer vía el Libro de Hechos (TASK-008).

---

## 2 · Alcance

### MVP (v1)
- Pestaña EU Vision = lista "Mis Visiones" (borradores + completas) + "Nueva visión".
- Entrada: elegir convocatoria (atajo de calls abiertas + CTA "Ir a Convocatorias"). También entrable desde la ficha de una call en Convocatorias.
- Asistente de 5 pasos: reto · valor europeo · escala (rango + WPs) · consorcio · revisar.
- Panel derecho **solo lectura** con lo que pide la convocatoria (autorrellenado de `call_structured`).
- Proyectos aprobados similares (Experience RAG) + **lectura en panel lateral** (drawer) sin salir del asistente.
- Ficha de visión (one-pager). **Nace privada**; toggle para publicar.
- "Llevar a Diseñar" → semilla de Intake.

### v2 (fuera del MVP, pero el modelo de datos ya lo contempla)
- Área de comunidad "Explorar visiones" (tablón público).
- "Me interesa participar" vinculado a entidad + aviso por correo según ajustes del usuario.
- Vista de dueño "quién ha mostrado interés".
- Rama "no sé qué convocatoria quiero" → vive en **Convocatorias**, no aquí.

---

## 3 · Modelo de datos

Migración `123_vision_tables.sql`. Convenciones del Core: `CHAR(36)` UUID (generado en Node), `snake_case`, importes `DECIMAL(14,2)`, bools `TINYINT(1)`, arrays como `JSON`, FKs con `ON DELETE CASCADE`, `InnoDB` + `utf8mb4`. **Idempotente** (`CREATE TABLE IF NOT EXISTS`, índices inline).

### 3.1 · `visions` — una por idea/convocatoria

```sql
CREATE TABLE IF NOT EXISTS visions (
  id               CHAR(36)      NOT NULL,
  user_id          CHAR(36)      NOT NULL,               -- dueño
  entity_oid       VARCHAR(15)   NULL,                   -- entidad del dueño (directorio); requerida para publicar
  -- convocatoria elegida (denormalizada para pintar lista/ficha sin join al feed)
  call_id          VARCHAR(190)  NOT NULL,               -- id unificado de la call (funding_unified / convocatorias)
  call_title       VARCHAR(255)  NULL,
  programme        VARCHAR(80)   NULL,
  call_deadline    DATE          NULL,
  -- respuestas del usuario
  title            VARCHAR(255)  NULL,
  problem          TEXT          NULL,                   -- el reto
  european_value   TEXT          NULL,                   -- qué se perdería Europa
  budget_option_eur DECIMAL(14,2) NULL,                  -- importe/rango elegido
  budget_label     VARCHAR(120)  NULL,                   -- ej "30.000 € · piloto"
  wp_count         TINYINT       NULL,                   -- nº paquetes de trabajo
  duration_months  SMALLINT      NULL,
  partner_types    JSON          NULL,                   -- ["ONG juvenil rural","Centro FP", ...]
  partner_countries JSON         NULL,                   -- ["PT","IT","EL"]
  own_role         VARCHAR(255)  NULL,                   -- rol que ofrezco (opcional)
  differentiator   TEXT          NULL,                   -- ángulo diferencial (opcional)
  -- estado
  status           ENUM('draft','complete') NOT NULL DEFAULT 'draft',
  visibility       ENUM('private','public') NOT NULL DEFAULT 'private',
  current_step     TINYINT       NOT NULL DEFAULT 1,     -- progreso del asistente (1..5)
  published_at     DATETIME      NULL,
  project_id       CHAR(36)      NULL,                   -- link cuando se promociona a Intake
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vision_user (user_id),
  KEY idx_vision_visibility (visibility, published_at),
  KEY idx_vision_call (call_id),
  CONSTRAINT fk_vision_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> `project_id` se deja sin FK dura para no acoplar el borrado de un proyecto al de su visión (se limpia en Node si hace falta).

### 3.2 · `vision_references` — proyectos similares adjuntados como inspiración

```sql
CREATE TABLE IF NOT EXISTS vision_references (
  id                 CHAR(36)     NOT NULL,
  vision_id          CHAR(36)     NOT NULL,
  project_identifier VARCHAR(120) NOT NULL,              -- id del proyecto Erasmus+ (Experience RAG)
  title              VARCHAR(255) NULL,
  programme          VARCHAR(80)  NULL,
  funding_year       SMALLINT     NULL,
  coordinator_country VARCHAR(8)  NULL,
  match_score        DECIMAL(4,3) NULL,                  -- 0.000–1.000
  snapshot           JSON         NULL,                  -- resumen cacheado (sobrevive a cambios del API)
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vref (vision_id, project_identifier),
  KEY idx_vref_vision (vision_id),
  CONSTRAINT fk_vref_vision FOREIGN KEY (vision_id) REFERENCES visions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.3 · `vision_interests` — interés de la comunidad (tabla lista ya; UI en v2)

```sql
CREATE TABLE IF NOT EXISTS vision_interests (
  id          CHAR(36)    NOT NULL,
  vision_id   CHAR(36)    NOT NULL,
  user_id     CHAR(36)    NOT NULL,                      -- quién muestra interés
  entity_oid  VARCHAR(15) NULL,                          -- su entidad (la vinculación que pide Oscar)
  message     TEXT        NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interest (vision_id, user_id),           -- un interés por usuario y visión
  KEY idx_interest_vision (vision_id),
  CONSTRAINT fk_interest_vision FOREIGN KEY (vision_id) REFERENCES visions (id) ON DELETE CASCADE,
  CONSTRAINT fk_interest_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Nota:** `partner_types`/`partner_countries` van como `JSON` embebido en `visions` (patrón ya usado en `entity_enrichment` y `events`), no en tablas hijas — no se consultan por separado.

---

## 4 · API — `/v1/vision`

Módulo nuevo `node/src/modules/vision/` (`routes.js` + `controller.js` + `model.js`), registrado en `server.js`:
`app.use('/v1/vision', require('./node/src/modules/vision/routes'));`

Formato de respuesta estándar del Core: `{ ok:true, data }` / `{ ok:false, error }`.

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| GET | `/` | requireAuth | Lista mis visiones (borradores + completas) |
| POST | `/` | requireAuth | Crea borrador `{ call_id, call_title, programme, call_deadline }` → `id` |
| GET | `/:id` | optionalAuth | Ficha. Privada → solo dueño. Pública → cualquiera (invitado la ve, sin datos de interés) |
| PATCH | `/:id` | requireAuth (dueño) | Autosave de paso `{ problem?, european_value?, budget_*?, wp_count?, partner_*?, current_step? }` |
| POST | `/:id/publish` | requireAuth (dueño) | `{ visibility:'public'\|'private' }` · publicar exige `entity_oid` y `status='complete'` |
| POST | `/:id/references` | requireAuth (dueño) | Adjunta proyecto similar `{ project_identifier, ...snapshot }` |
| DELETE | `/:id/references/:refId` | requireAuth (dueño) | Quita referencia |
| POST | `/:id/promote` | requireAuth (dueño) | Crea proyecto en Intake desde la visión → `{ project_id }` |
| POST | `/suggest-projects` | requireAuth | Proxy a Experience RAG `{ query_text, entity_oid?, k?, min_score? }` |
| GET | `/project/:identifier/full` | requireAuth | Proxy a `project/:id/full` (lectura del drawer) |
| GET | `/public` | optionalAuth | Tablón "Explorar visiones" (v2) |
| POST | `/:id/interest` | requireAuth (no invitados) | Mostrar interés `{ message? }` (v2) |
| GET | `/:id/interest` | requireAuth (solo dueño) | Quién ha mostrado interés (v2) |

### Puente con el directorio (VPS)
`node/src/utils/directory-api.js` **ya existe** con las funciones de entidades, pero **le faltan** dos wrappers para Experience RAG (el VPS ya expone ambos endpoints — ver `PARA_LOCAL.md` 2026-05-07 Round 2):

```js
// añadir a directory-api.js
async function retrieveProjectsSimilar(body)      // POST /retrieve/projects-similar
  { return fetchJson('/retrieve/projects-similar', { method:'POST', body }); }
async function getProjectFull(identifier)         // GET /project/:id/full
  { return fetchJson('/project/' + encodeURIComponent(identifier) + '/full'); }
```

`/v1/vision/suggest-projects` y `/v1/vision/project/:id/full` son proxies finos sobre estas dos (mantienen la `X-API-Key` server-side, nunca en el navegador).

---

## 5 · Frontend — puntos de integración exactos

- **Topbar** (`public/index.html` ~L120): añadir `<li><a href="#eu-vision">EU Vision</a></li>`.
- **Router** (`public/js/app.js`):
  - `VISION_ROUTES = ['eu-vision', 'eu-vision-explore']`.
  - Añadir la vista pública a `PUBLIC_ROUTES` para que el invitado pueda ver visiones públicas (gating con el login-wall existente: ver sí, "interés" no).
  - Grupo de sidebar `sidebar-group-vision` (toggle igual que `-proyectos`/`-entidades`/`-account`).
  - `if (route === 'eu-vision' && typeof Vision !== 'undefined') Vision.init();`
- **Nuevo módulo** `public/js/vision.js` — lista, asistente (5 pasos), drawer de lectura, ficha. Traslada el mockup. Cargar `<script>` en `index.html`.
- **CTA desde Convocatorias** (`public/js/convocatorias.js`, vista de detalle): botón "Crear mi visión para esta convocatoria" → `navigate('eu-vision', ...)` con la call precargada (querystring o estado). El sidebar EU Vision incluye un ítem "Convocatorias" para el camino inverso.
- **Semilla de Intake** (`/:id/promote`): crea el proyecto con el modelo de Intake y engancha con el **Libro de Hechos** (TASK-008 `buildCanonicalFacts`) para que `problem` + `european_value` + socios buscados entren como hechos canónicos del Writer.

---

## 6 · Reutilización (qué NO se construye de cero)

| Necesidad | Ya existe | Dónde |
|---|---|---|
| Criterios/objetivos/presupuesto por call | 193 calls desmenuzadas | `data/call_structured/*.json` (módulo `convocatorias`) |
| Proyectos similares (4-5 de inspiración) | Endpoint Experience RAG | `directorio.eufundingschool.com/api/retrieve/projects-similar` |
| Resumen completo de un proyecto (drawer) | Endpoint `project/:id/full` | idem (VPS, TASK-006) |
| Que la visión alimente al Writer | Libro de Hechos | TASK-008 `buildCanonicalFacts()` |
| Invitado ve pero no interactúa | login-wall / guest-funnel | `app.js` `requireLogin`, `PUBLIC_ROUTES`, `optionalAuth` |
| Cliente HTTP al directorio | `directory-api.js` | falta añadir 2 wrappers (§4) |

---

## 7 · Plan por fases

1. **F1 — Datos + backend núcleo** (~0.5–1d): migración `123`, módulo `vision/` (CRUD + publish + promote), 2 wrappers en `directory-api.js`, registro en `server.js`. Sin UI. Verificar con curl.
2. **F2 — Pestaña + lista + asistente** (~1.5–2d): topbar + router + sidebar-group-vision + `vision.js` (lista "Mis Visiones", asistente 5 pasos, panel derecho leyendo `convocatorias`, autosave por paso vía PATCH). Entrada "elegir convocatoria".
3. **F3 — Proyectos similares + lectura** (~1d): `suggest-projects` (disparo tras el paso 1 + refresco manual) + drawer de lectura (`project/:id/full`) + adjuntar/quitar `vision_references`.
4. **F4 — Ficha + publicar + a Diseñar** (~1d): one-pager, toggle privado/público, "Llevar a Diseñar" (promote → Intake + wiring Libro de Hechos). CTA desde Convocatorias.
5. **F5 — Comunidad (v2)**: tablón "Explorar visiones" + "Me interesa" (vinculado a entidad) + aviso por correo según ajustes + vista de dueño "quién mostró interés".

---

## 8 · Decisiones abiertas (no bloqueantes para F1)

- **Entidad al publicar:** una visión puede nacer sin entidad reclamada (`entity_oid` NULL), pero **publicar exige entidad** (para vincular el interés). ¿Confirmado?
- **Varias visiones por call:** permitido (un usuario puede explorar varias ideas sobre la misma convocatoria).
- **Disparo de similares:** automático tras escribir el reto + botón "actualizar sugerencias". ¿OK vs solo manual?
- **Autosave:** por paso (PATCH al pasar de paso) vs on-blur. Default: por paso.
- **Promote a Intake:** crea proyecto nuevo (no reutiliza uno existente). ¿OK?
- **RGPD/retención:** texto de visiones públicas — base legal y retención. A decidir con la capa de comunidad (v2).
- **Aviso de interés:** canal (Resend transaccional) y condición (ajustes del usuario) — se diseña en v2.

---

## 9 · Notas de arranque

- Comando para retomar: **"continuar con EU Vision"**.
- Al arrancar F1: `git fetch`, confirmar cwd `eplus-tools`, MySQL Laragon arriba.
- Tras registrar el módulo en `server.js`, Oscar reinicia `node server.js` (endpoints nuevos → 404 si no).
- Los endpoints de Experience RAG del VPS ya están en producción; para probar en local hace falta la `DIRECTORY_API_KEY` en env (misma que consume `directory-api.js`).
