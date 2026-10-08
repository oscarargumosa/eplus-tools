# Dashboard de Entidades — Plan completo

> **Status:** borrador (2026-04-25, generado por Claude VPS).
> Pendiente de cerrar decisiones de arquitectura y arrancar Fase 1.
> Documento autosuficiente: cualquier Claude (Local/VPS) puede leerlo y continuar.

---

## 0. Contexto

### Qué tenemos hasta hoy
Tras varias semanas de crawling con el módulo de **entity enrichment** sobre la API de Erasmus+ (ORS), hemos cosechado información de **165.606 entidades vivas** (escuelas, universidades, ONGs, ayuntamientos, fundaciones, etc.) en toda Europa. Tenemos sus emails, teléfonos, redes sociales, idiomas web, CMS detectado, logos, descripciones y un score interno de profesionalidad / EU readiness / vitalidad.

La fase de extracción masiva está prácticamente cerrada: el último retry (Playwright + variantes) se desactivó el 2026-04-25 con rendimiento decreciente. Lo recuperable está recuperado.

### Qué queremos construir
Un **dashboard explorable** dentro del portal `eplus-tools` (NO en WordPress) que permita a los usuarios de EU Funding School descubrir, filtrar, comparar y exportar entidades europeas como herramienta de búsqueda de partners y de inteligencia sobre el ecosistema Erasmus+.

Tiene que ser **estético, rápido y útil**. Es la prueba viva del valor de la plataforma y uno de los ganchos principales del lead magnet.

### Dónde vive
- **NO en WordPress**: el portal público (`eufundingschool.com`) sigue en WP, pero el dashboard vive dentro del repo `eplus-tools`, que es la app moderna del ecosistema (Node.js, ya tiene server.js, public/, scripts/, migrations/).
- **URL prevista (a confirmar):** `tools.eufundingschool.com/entities` o ruta dentro del portal actual de etools.
- **Trabajo en local** desde `dev-local`. El VPS solo aporta planificación y los datos.

### Quién lo usará
Los 3 buyer personas de EU Funding School (ver `claude-memory/shared/eufundingschool_marketing.md`):
1. Profesional de oficina técnica que escribe propuestas Erasmus+
2. Coordinador internacional de centro educativo
3. Consultor freelance / ONG buscando socios europeos

Los tres comparten una necesidad: **encontrar entidades partners reales y contactables**. Esta herramienta resuelve eso.

---

## 1. Auditoría completa de los datos disponibles

### 1.1 Volúmenes

| Concepto | Filas |
|---|---|
| `entities` (universo total) | 288.294 |
| → con website (scrapeables) | 203.612 |
| → sin website (no scrapeables) | 84.682 |
| `entity_enrichment` (procesadas) | 203.506 |
| → archived=1 (descartadas: dns_fail + soft_404) | 37.900 |
| → archived=0 (vivas, base del dashboard) | **165.606** |
| `entity_classification` | 147.550 |
| `entity_duplicates` | 25.337 |
| `entities_enrichment_targets` (drenado 100%) | 189.586 |

### 1.2 Cobertura de campos en `entity_enrichment` (sobre las 165.606 vivas)

#### ✅ Campos OPS para el dashboard

| Campo | Cobertura | Calidad | Uso propuesto |
|---|---|---|---|
| `extracted_name` | 91,4% | alta | Título principal de la ficha |
| `score_professionalism` (0-100) | 91,4% | alta | Filtro/ranking |
| `score_eu_readiness` (0-100) | 91,4% | alta | Filtro/ranking |
| `score_vitality` (0-100) | 91,4% | alta | Filtro/ranking |
| `website_languages` (JSON ISO codes) | 84,8% | alta | Filtro multilenguaje, mapas |
| `cms_detected` (enum) | 68,8% | alta | Filtro/estadística "tech stack" |
| `logo_url` | 68,2% | media | Avatar de la ficha |
| `social_links` (JSON) | 58,5% | alta | Iconos en ficha |
| `description` | 57,7% | media | Snippet en card |
| `phones` (JSON multi) | 53,8% | alta | Contacto |
| `legal_form` (15 enums) | 48,3% | alta | Filtro |
| `emails` (JSON multi) | 47,5% | alta (~200 basura) | Contacto |
| `eu_programs` (JSON) | 12,8% | alta | Badge "ya en Erasmus+" |
| `students_count` | 12,5% | media | Solo escuelas |
| `year_founded` | 3,7% | OK | Informativo |

#### Campos de la tabla `entities` (joineables vía oid)

| Campo | Cobertura | Uso |
|---|---|---|
| `legal_name` | 100% | Fallback de `extracted_name` |
| `country_code` | ~100% | Filtro principal, mapa |
| `city` | alta | Geo-localización |
| `vat` | alta | Identificador real (mejor que `vat_number` del enrichment) |
| `validity_label` | 100% | Filtro (certified/waiting/unknown) |
| `is_social_only` | 100% | Excluir |

#### ❌ Campos muertos (cobertura 0% o no fiable) — se eliminan de la vista

| Campo | Cobertura |
|---|---|
| `parent_organization` | 0% |
| `last_news_date` | 0% |
| `employees_count` | 0% |
| `staff_names` | 0% |
| `vat_number` (usar `entities.vat`) | 2,5% |
| `addresses` (usar `entities.city`) | 5,9% |

### 1.3 Tabla complementaria `entity_classification`

Categoría auto-detectada con confianza (high/medium/low):

| Categoría | Total | Alta confianza |
|---|---|---|
| school | 35.485 | 30.097 |
| ngo | 8.491 | 8.491 |
| university | 7.777 | 7.777 |
| municipality | 5.058 | 3.117 |
| foundation | 3.201 | 3.201 |
| association | 9.809 | 0 (todas medium) |
| company | 9.244 | 0 |
| cultural | 2.602 | 0 |
| vet, youth_org, sport_club, adult_edu, research, public_admin | <2k cada una | varía |
| **other** (sin clasificar) | **62.610** | — |

### 1.4 Distribución por país (top 15)

| País | Vivas | Con email | Con tel | Con social |
|---|---|---|---|---|
| TR | 24.686 | 2.805 | 13.783 | 5.182 |
| DE | 14.786 | 7.807 | 7.484 | 8.193 |
| ES | 13.470 | 6.989 | 7.099 | 9.343 |
| IT | 11.723 | 7.815 | 5.986 | 7.963 |
| PL | 11.062 | 6.409 | 7.193 | 7.475 |
| FR | 9.402 | 3.624 | 4.688 | 5.972 |
| EL | 5.740 | 2.424 | 2.162 | 2.704 |
| UK | 5.397 | 2.230 | 2.359 | 3.542 |
| RO | 4.778 | 2.239 | 2.015 | 2.655 |
| CZ | 4.694 | 3.152 | 3.344 | 3.354 |
| BE | 4.180 | 2.299 | 2.386 | 3.025 |
| AT | 4.169 | 2.466 | 2.416 | 2.687 |
| PT | 3.960 | 2.096 | 2.153 | 2.855 |
| HU | 3.928 | 2.209 | 2.136 | 2.536 |
| NL | 3.734 | 2.090 | 1.919 | 2.607 |

### 1.5 Salud por entidad (sobre 9 campos clave)

| Campos rellenos / 9 | Entidades | % | Tier propuesto |
|---|---|---|---|
| 7-9 | 15.364 | 9,3% | 💎 premium |
| 5-6 | 68.619 | 41,4% | ⭐ buena |
| 3-4 | 54.954 | 33,2% | 👌 aceptable |
| 0-2 | 26.669 | 16,1% | ❓ mínima |

> El **quality_tier** se calculará y persistirá como columna en la vista pública (Fase 1) para poder filtrar/ordenar sin recalcular.

### 1.6 Basura puntual a limpiar

- 156 emails con `@example.com`
- 20 emails de `sentry.io` / `wixpress.com`
- 12 emails con extensiones `.png/.jpg`
- 7 emails `noreply@`
- 5 emails `test@`
- 106 entidades con URL malformada (`http:www.`, `http\\\\`)

Total: ~300 filas a sanear (0,18%). Trabajo de 1h.

### 1.7 Top distribuciones

**legal_form (top 10):** ets 17k · state_school 15,7k · association 11,2k · aps 10k · fundacion 5,2k · university 4,5k · ev 3,8k · plc_ltd 2,8k · gmbh 1,9k · municipality 1,6k

**cms_detected (top 10):** wordpress 68k · meb_tr 17,8k · drupal 4,8k · joomla 4,8k · wix 3,2k · typo3 3,2k · sch_gr 2,3k · edupage 1,3k · wordpress_com 620 · blogspot 603

### 1.8 Frescura

- Última escritura en `entity_enrichment`: 2026-04-24 23:00 UTC
- Última escritura con datos: 2026-04-24 22:53 UTC
- Pipeline de retry: detenido y eliminado de PM2 el 2026-04-25

### 1.9 Conclusión de la auditoría

**La base de datos está coherente, completa y limpia.** No hay filas a medias, no hay corrupción, no hay trabajo huérfano. Es viable arrancar el dashboard sobre lo que hay sin necesidad de reabrir el crawler.

---

## 2. Decisiones que faltan por cerrar (Fase 0)

Antes de codificar nada, cerrar con Oscar:

### 2.1 Arquitectura — DECIDIR

Tres caminos (recomiendo C):

**Opción A — App separada en subdominio**
- `tools.eufundingschool.com/entities` con Next.js
- Hereda branding pero técnicamente independiente
- ✅ Rendimiento óptimo, ✅ control total UX
- ❌ Subdominio (no "dentro" del menú principal)

**Opción B — Dentro de WordPress como plugin**
- `eufundingschool.com/entidades` con plugin PHP custom
- ✅ URL nativa de WP
- ❌ WP no escala bien con 165k filas y filtros pesados

**Opción C — Híbrida (recomendada)** ⭐
- Landing pública en WP (`eufundingschool.com/entidades`): hero + stats globales + 6 fichas destacadas + CTA
- Aplicación real en `eplus-tools` con su propia ruta
- ✅ SEO en WP, ✅ herramienta seria fuera, ✅ branding consistente
- Es la estrategia que separa "marketing" de "producto" sin mezclarlas

> **NOTA del autor:** Oscar precisó que "el trabajo va dentro del portal de etools, NO en WordPress". Eso encaja con **Opción A** o con **Opción C** (parte de producto). Si optamos por C, la landing WP es opcional y se hace al final.

### 2.2 Stack técnico — propuesta

- **Frontend:** Next.js 15 (App Router) + Tailwind + shadcn/ui + Framer Motion
- **Backend:** Node.js + Express o Hono (alineado con `server.js` actual del repo) + mysql2
- **DB:** MySQL existente (eplus_tools). No migramos.
- **Búsqueda:** MySQL FULLTEXT inicialmente. Si crece la demanda → Meilisearch o Typesense en Fase 7.
- **Caché:** Redis (Coolify lo ofrece como service one-click)
- **Mapa:** MapLibre GL JS + GeoJSON Europa
- **Gráficos:** Recharts o Visx
- **Auth (Fase 6):** reusar el "Sistema base compartido" pendiente en memoria. Si no está listo cuando lleguemos, integramos NextAuth con magic-link.
- **Deploy:** Coolify en VPS (mismo cluster que `intake.eufundingschool.com`)

### 2.3 Modelo de pricing — DECIDIR

Propuesta:
- **Free (sin login):** ver 50 fichas/día, búsqueda básica, sin export, sin contacto
- **Registrado (gratis):** 200/día, listas, favoritos, comparador
- **Pro (pago):** ilimitado, export CSV, scoring detallado, alertas, plantillas de email

Alternativa: lanzar abierto y gateamos en Fase 7. Es lo más seguro para validar tracción primero.

### 2.4 Mockups — DECIDIR

Tres niveles posibles:
1. Solo descripción Markdown (rápido, suficiente para empezar)
2. Wireframes ASCII en este mismo documento
3. Figma o equivalente (más tiempo, mejor para alinearse con diseñadora)

Recomiendo nivel 2 antes de Fase 3.

---

## 3. Modelo de vista pública

### 3.1 Vista propuesta `v_entities_public`

```sql
CREATE OR REPLACE VIEW v_entities_public AS
SELECT
  e.oid,
  COALESCE(NULLIF(ee.extracted_name,''), e.legal_name) AS display_name,
  e.legal_name,
  e.country_code,
  e.city,
  e.website,
  e.vat,
  e.validity_label,
  ec.category,
  ec.confidence AS category_confidence,
  ee.description,
  ee.legal_form,
  ee.year_founded,
  ee.emails,
  ee.phones,
  ee.social_links,
  ee.website_languages,
  ee.cms_detected,
  ee.logo_url,
  ee.eu_programs,
  ee.has_erasmus_accreditation,
  ee.students_count,
  ee.score_professionalism,
  ee.score_eu_readiness,
  ee.score_vitality,
  -- Campo calculado: cuántos de los 9 campos clave están presentes
  (
    (ee.extracted_name IS NOT NULL) +
    (ee.description IS NOT NULL AND CHAR_LENGTH(ee.description) > 50) +
    (COALESCE(JSON_LENGTH(ee.emails),0) > 0) +
    (COALESCE(JSON_LENGTH(ee.phones),0) > 0) +
    (COALESCE(JSON_LENGTH(ee.social_links),0) > 0) +
    (ee.logo_url IS NOT NULL) +
    (ee.year_founded IS NOT NULL) +
    (ee.legal_form IS NOT NULL) +
    (COALESCE(JSON_LENGTH(ee.website_languages),0) > 0)
  ) AS quality_score_raw,
  CASE
    WHEN /* score_raw 7-9 */ ... THEN 'premium'
    WHEN /* 5-6 */ ... THEN 'good'
    WHEN /* 3-4 */ ... THEN 'acceptable'
    ELSE 'minimal'
  END AS quality_tier,
  ee.last_fetched_at
FROM entities e
JOIN entity_enrichment ee ON ee.oid = e.oid AND ee.archived = 0
LEFT JOIN entity_classification ec ON ec.oid = e.oid;
```

### 3.2 Índices necesarios

```sql
ALTER TABLE entity_enrichment ADD FULLTEXT INDEX ft_name_desc (extracted_name, description);
-- entity_classification ya tiene índice por oid + category
-- entities ya tiene country_code indexado
```

### 3.3 Tablas de cache para stats

```sql
CREATE TABLE stats_cache (
  metric_key VARCHAR(50) PRIMARY KEY,
  value JSON,
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- recargar cada hora con cron
```

Stats a precomputar: `by_country`, `by_category`, `by_cms`, `by_language`, `global_kpis`.

---

## 4. Arquitectura técnica propuesta

### 4.1 API contract

```
GET  /api/entities                  ?country=ES&category=school&page=1&limit=24
GET  /api/entities/search?q=texto   full-text + filtros
GET  /api/entities/:oid             ficha completa
GET  /api/entities/:oid/similar     3 entidades similares
GET  /api/stats/global              KPIs cards
GET  /api/stats/by-country
GET  /api/stats/by-category
GET  /api/stats/by-cms
POST /api/entities/export           CSV (auth required)
POST /api/lists                     crear lista
POST /api/lists/:id/items           añadir a lista
GET  /api/me/lists                  listas del usuario
```

### 4.2 Caché y rate limiting

- Endpoints `/stats/*`: caché Redis 1h
- Endpoints `/entities/:oid`: caché Redis 1h
- Endpoints `/entities` (listado): caché Redis 5min, key = hash de query params
- Rate limit: 100 req/min IP no autenticada, 1000 req/min usuario autenticado

### 4.3 Frontend

```
app/
  layout.tsx              header + footer + theme
  entities/
    page.tsx              listado + filtros + buscador
    [oid]/page.tsx        ficha
    map/page.tsx          mapa Europa
    stats/page.tsx        dashboard estadísticas
    me/
      lists/page.tsx      mis listas (auth)
      favorites/page.tsx  mis favoritos
  api/...                 proxy a backend si hace falta
components/
  EntityCard.tsx
  EntityFilters.tsx
  EntitySearch.tsx
  CountryMap.tsx
  StatsBlock.tsx
  ...
lib/
  api.ts                  cliente API
  brand.ts                colores y tokens del brand kit
```

---

## 5. Plan por fases

Cada fase deja algo desplegado y funcional antes de continuar. Cero trabajo huérfano.

### Fase 0 — Decisiones (este documento)
**Entregable:** decisiones cerradas en este mismo MD.
**Pendiente:** ver sección 2.

### Fase 1 — Datos limpios (1 sesión)
**Entregable:** vista `v_entities_public` + cleanup + índices full-text + stats_cache.

Trabajo:
1. Crear `v_entities_public` (SQL del bloque 3.1)
2. Limpiar las ~300 filas con basura (emails @example, .png, etc.)
3. Normalizar las 106 URLs malformadas
4. Crear índice FULLTEXT
5. Crear tabla `stats_cache` + script Node que la rellena
6. Cron en Coolify: refresh cada hora
7. Migración SQL versionada en `migrations/`

### Fase 2 — API backend (1-2 sesiones)
**Entregable:** API REST desplegada en Coolify, autenticada con API key, cacheada.

Trabajo:
1. Estructura `server/api/v1/entities/*` integrada en server.js actual o como app separada
2. Implementar todos los endpoints de la sección 4.1 (excepto los `/me/*`, esos en Fase 6)
3. Validación con Zod
4. Caché Redis (servicio Coolify)
5. Rate limiting con `express-rate-limit`
6. OpenAPI autogenerado en `/api/v1/docs`
7. Deploy + health checks

### Fase 3 — Frontend base (1 sesión)
**Entregable:** Next.js desplegado, con header/footer/branding consistente con la web principal.

Trabajo:
1. Bootstrap Next.js 15 + Tailwind + shadcn/ui
2. Tema con brand kit (paleta de `eufundingschool_brandkit.md`)
3. Header/footer copiados de la web (componentes reutilizables)
4. Layout `/entities` con sidebar de filtros + main de resultados
5. Skeleton states bonitos
6. Deploy en Coolify
7. (Opcional) Landing en WP con stats vivas

### Fase 4 — Vistas core (2 sesiones)

**Sesión 4a — Explorar y buscar:**
- Cards con logo + nombre + país (bandera) + tipo + badges + score
- Filtros laterales: país (multi), categoría (multi), idioma (multi), CMS, tier de calidad, tiene email/tel/social/erasmus+
- Search bar full-text con debounce 300ms
- Scroll infinito con react-virtuoso
- URL state shareable
- Empty state + loading shimmer
- Animaciones de entrada (Framer Motion)

**Sesión 4b — Ficha de entidad:**
- Hero: logo + nombre + bandera + badges + score visual 0-100
- Bloque contacto: emails (mailto), teléfonos (tel:), redes (iconos)
- Bloque "Sobre": descripción + año + tipo legal + idiomas
- Bloque "Tech": CMS + screenshot del sitio (vía servicio externo o self-hosted)
- Bloque "Programas EU": badges si tiene Erasmus+
- Bloque "Similares": 3 entidades parecidas
- Botones: añadir a lista, contactar, exportar, abrir web
- Compartir vía URL pública

### Fase 5 — Visualizaciones (1-2 sesiones)
**Entregable:** dashboard "wow" con mapa y gráficos.

- Mapa Europa con MapLibre + GeoJSON. Click en país → filtra. Heatmap por densidad o score medio.
- Página `/entities/stats`:
  - KPI cards arriba: total entidades, países, idiomas, % con email
  - Bar chart top 15 países
  - Donut categorías
  - Bar horizontal CMS (con logos)
  - Bar idiomas
- Animaciones on-scroll consistentes con `knowledge_web_design_elite.md`

### Fase 6 — Funciones de usuario (2 sesiones)

**Sesión 6a — Auth y listas:**
- Login Google / email magic-link (NextAuth)
- Listas / favoritos (corazón en cards)
- Vista "Mis listas" en `/entities/me/lists`
- Compartir lista por URL

**Sesión 6b — Comparador y exports:**
- Comparador 2-3 entidades lado a lado
- Export CSV de filtrado o lista (auth)
- Plantillas de email pre-rellenadas con datos de la entidad

### Fase 7 — Pulido + lanzamiento (1 sesión)
- SEO: sitemap.xml con las 165k fichas (Google las indexa → tráfico orgánico)
- Open Graph dinámicos por ficha
- Performance: Lighthouse 90+ mobile
- A11y: contraste, navegación teclado, screen reader
- Analytics: PostHog o Plausible
- Tests E2E con Playwright en flujos críticos
- Documentación de uso

---

## 6. Funciones del dashboard (detalle)

### 6.1 Las 6 funciones que tiene que dominar

1. **Explorar** — listado infinito con cards bonitas, animaciones suaves
2. **Buscar** — full-text + filtros combinables, URL state
3. **Ver ficha** — detalle completo de cada entidad con todos los datos enriquecidos
4. **Visualizar** — mapa de Europa interactivo + gráficos de stats
5. **Operar** — favoritos, listas personalizadas, comparador 2-3 lado a lado, exportar CSV
6. **Conectar** — botón "contactar como partner" con plantilla pre-rellenada, CTA al evaluador IA

### 6.2 Diferenciación premium (gancho conversión)

| Función | Free anónimo | Registrado | Pro |
|---|---|---|---|
| Ver fichas | 50/día | 200/día | ilimitado |
| Búsqueda | básica | avanzada | avanzada + alertas |
| Filtros | básicos | todos | todos |
| Listas | ❌ | ✅ | ✅ |
| Comparador | ❌ | ✅ | ✅ |
| Export CSV | ❌ | ❌ | ✅ |
| Score detallado | ❌ | parcial | completo |
| Plantillas email | ❌ | 1 | ilimitadas |

> Decisión final pendiente — ver sección 2.3.

---

## 7. Estimación

| Fase | Sesiones | Acumulado |
|---|---|---|
| 0 — Decisiones | 0,5 | 0,5 |
| 1 — Datos limpios | 1 | 1,5 |
| 2 — API backend | 1-2 | 2,5-3,5 |
| 3 — Frontend base | 1 | 3,5-4,5 |
| 4 — Vistas core | 2 | 5,5-6,5 |
| 5 — Visualizaciones | 1-2 | 6,5-8,5 |
| 6 — Funciones usuario | 2 | 8,5-10,5 |
| 7 — Pulido | 1 | 9,5-11,5 |

**MVP (sin login, sin listas, sin export):** Fases 0-5 → ~7-8 sesiones
**Producto completo:** Fases 0-7 → ~10-12 sesiones

---

## 8. Anexos

### 8.1 Diccionario de campos OPS finales

(Ver sección 1.2 para cobertura)

### 8.2 Comandos SQL útiles para verificar la BD

```bash
# Conexión
docker exec -it <contenedor-mysql> mysql -uroot -p eplus_tools   # contraseña: ver nota interna del VPS

# Conteos clave
SELECT 'vivas', COUNT(*) FROM entity_enrichment WHERE archived=0;
SELECT 'con email', COUNT(*) FROM entity_enrichment WHERE archived=0 AND JSON_LENGTH(emails)>0;

# Distribución país
SELECT e.country_code, COUNT(*) FROM entities e
JOIN entity_enrichment ee ON ee.oid=e.oid WHERE ee.archived=0
GROUP BY e.country_code ORDER BY 2 DESC LIMIT 15;
```

### 8.3 Estructura del repo `eplus-tools` (relevante)

```
/opt/eplus-tools-dev/
├── server.js              entry point Node.js actual
├── public/                static actual
├── scripts/               batch/cron scripts (enrichment, classify, etc.)
├── migrations/            migraciones SQL versionadas
├── docs/                  documentación (este archivo está aquí)
└── package.json
```

### 8.4 Credenciales y URLs

- DB: ver `.env` (BD `eplus_tools`; host y credenciales: ver nota interna del VPS)
- Producción actual: `intake.eufundingschool.com`
- Repo: `ongpasos-droid/eplus-tools`
- Ramas: `main` (deploy) | `dev-local` (PC) | `dev-vps` (servidor)

### 8.5 Memoria relacionada

- `claude-memory/shared/eufundingschool_brandkit.md` — paleta y tipografía
- `claude-memory/shared/eufundingschool_marketing.md` — buyer personas
- `claude-memory/shared/knowledge_web_design_elite.md` — manual de diseño
- `claude-memory/shared/protocolo_ramas.md` — protocolo de ramas

---

**Próximo paso:** cerrar las decisiones de la sección 2 con Oscar, traer este documento a `main` desde local, y arrancar Fase 1.
