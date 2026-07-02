# EXPERIENCE_RAG — Recuperación semántica de proyectos pasados

> Doc canónico del sistema "tu app conoce mejor tu palmarés que tú mismo".
> Última actualización: 2026-05-07
> Estado: **diseño**, ninguna fase implementada todavía.

---

## El caso de uso

Cuando un usuario está redactando un proyecto nuevo en el Writer (ej. "BiCol" con Permacultura Cantabria), la app debe:

1. **Saber todos los proyectos UE pasados de la entidad** (164 en el caso de Permacultura).
2. **Entender semánticamente** el proyecto actual (título + summary + objetivos).
3. **Recuperar 4-5 proyectos pasados relevantes** que sirvan para demostrar trayectoria.
4. **Auto-redactar un párrafo** de la sección "Capacity / Relevant Experience" mencionando esos proyectos en el contexto del proyecto actual.

Resultado esperado: el usuario pulsa un botón y obtiene un párrafo del estilo:

> *Permacultura Cantabria has coordinated youth-work mobilities in rural sustainability since 2014. Recent examples directly relevant to the BiCol consortium include* `[2025-3-IT03-KA153-YOU-000382840 — Co-Projecting Healthy and Inclusive Rural Spaces]`*,* `[2024-1-ES02-KA210-YOU-000xxxxx — Bioconstrucción y juventud]` *and* `[2023-2-ES02-KA152-YOU-000xxxxx — Dragon Dreaming for Youth Workers]` *— all of which combine experiential rural training with intercultural mobility, the same pedagogical core that BiCol scales to bicycling as a vehicle for inclusion.*

Este es el **momento mágico**: pasa de "una herramienta donde meto datos" a "una herramienta que ya sabe quién soy".

---

## Arquitectura en 3 fases

### Fase 1 — Resumen completo en la ficha (depende de VPS Claude)

**Problema actual:** `directory-api` devuelve `project_summary` truncado a ~200 chars (con `...` literal de la fuente). Insuficiente para vectorizar y para mostrar en la ficha.

**Lo que pedimos a VPS Claude:**
- Verificar si `erasmus-pg` tiene la descripción completa o solo el extracto.
- Si la tiene: nuevo parámetro `?detail=full` en `/entity/:oid/projects` que devuelva `project_summary` íntegro. O nuevo endpoint `/project/:project_identifier/full` con todos los campos.
- Si no la tiene: scraper offline que enriquezca la BD desde el Erasmus+ Project Results Platform (HTML público en `https://erasmus-plus.ec.europa.eu/projects/search/details/{project_identifier}`), 1 worker que procese 317k → ~3-5 días con throttling razonable.

**Frontend Local Claude:** ya está listo. El drawer en `Mi Organización → ficha de proyecto` renderiza `project_summary` íntegro sin truncar — cuando llegue completo desde VPS, el usuario lo ve sin un solo cambio.

### Fase 2 — Vectorización offline (todo en VPS)

**Schema** (en `erasmus-pg`):

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE project_embeddings (
  project_identifier TEXT PRIMARY KEY,
  embedding vector(1536) NOT NULL,
  embedded_text_hash TEXT NOT NULL,  -- SHA-256 del texto que se vectorizó
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_name TEXT NOT NULL DEFAULT 'text-embedding-3-small'
);

CREATE INDEX project_embeddings_ann
  ON project_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Texto que se vectoriza** (concatenado, separado por `\n\n`):

```
{project_title}

Programme: {programme}
Action: {action_type}
Year: {funding_year}
Coordinator: {coordinator_name} ({coordinator_country})

{project_summary_full}
```

**Modelo:** `text-embedding-3-small` de OpenAI (1536 dims, $0.02 / 1M tokens).

**Worker:**
- Job único una sola vez para los 317k existentes.
- Job incremental diario: vectorizar lo que tenga `project_embeddings.project_identifier IS NULL OR projects.updated_at > project_embeddings.embedded_at`.
- Batch de 100 proyectos por request (OpenAI permite hasta 2048).
- Rate limit: 3000 req/min (default tier 1).

**Cost analysis:**
- 317k proyectos × ~500 tokens/proyecto promedio = ~160M tokens.
- 160M × $0.02 / 1M = **~$3.20 una sola vez**.
- Storage: 317k × 1536 dims × 4 bytes (float32) = **~2 GB** en pgvector.

**Endpoint nuevo** (en directory-api):

```
POST /retrieve/projects-similar
Headers: X-API-Key: ...
Body: {
  "entity_oid": "E10151149",       // opcional — restringe a esa entidad
  "query_text": "BiCol — youth mobility on bicycles in rural areas",
  "k": 5,
  "min_score": 0.65,                // umbral de similitud coseno
  "exclude_identifiers": ["..."]    // p.ej. el del proyecto que se redacta
}

Response: {
  "results": [
    {
      "project_identifier": "2025-3-IT03-KA153-YOU-000382840",
      "score": 0.87,
      "project_title": "...",
      "funding_year": 2025,
      "role": "partner",
      "summary_excerpt": "..." // 200 char preview
    },
    ...
  ]
}
```

### Fase 3 — Botón "Sugerir experiencia con proyectos previos" en el Writer

**Lugar UI:** Writer → sección **Capacity / Relevant Experience** → botón flotante junto al textarea:

```
[ ✨ Sugerir proyectos pasados relevantes ]
```

**Backend nuevo** (en `node/src/modules/writer/` o `node/src/modules/developer/`):

```
POST /v1/writer/suggest-experience-projects
Body: { project_id: "uuid-del-proyecto-en-intake" }
```

Lógica:
1. Lee `project.title` + `project.summary` + `project.objectives` del intake.
2. Lee `org.oid` (la entidad coordinadora del proyecto actual).
3. Llama a `directory-api: POST /retrieve/projects-similar` con `entity_oid=oid`, `query_text=concat`, `k=8`, `exclude_identifiers=[]`.
4. Devuelve los resultados al frontend.

**Modal frontend:**
- Lista de 8 candidatos con checkbox (5 marcados por defecto, los de mayor score).
- Cada card: título, año, programa, role, score, summary excerpt.
- Botón "Generar párrafo de experiencia con los seleccionados →".

**Segundo endpoint** (composición narrativa):

```
POST /v1/writer/compose-experience-paragraph
Body: {
  project_id: "uuid",
  selected_project_identifiers: ["...", "...", "..."]
}
```

Lógica:
1. Carga proyecto actual (título + summary + cluster temático).
2. Carga los proyectos seleccionados con su descripción completa.
3. Prompt a Claude/GPT:

```
You are writing the "Relevant Experience" subsection of an EU funding application
for {entity_name}. The current project being applied for is:

  Title: {current.title}
  Summary: {current.summary}
  Programme: {current.programme}

The applicant has these directly relevant past projects:
{for each selected: identifier, title, year, role, summary}

Write 1 paragraph (max 150 words) that:
  - Opens with the entity's track record in the topic area.
  - Names the past projects with their identifiers and roles, in chronological order.
  - Explicitly connects each past project to a competence the current proposal needs.
  - Ends with a sentence about what's new in the current proposal.

Language: {project.language} (default: English).
Tone: factual, professional, no marketing fluff.
```

Devuelve el párrafo. El usuario lo copia/edita en el textarea.

---

## Decisiones abiertas

1. **¿Vectorizamos los 317k o solo los de la entidad del usuario?**
   - **Recomendado: todos.** Coste único ~$3.20. Permite también "proyectos similares fuera de tu palmarés" como inspiración o para sugerir partners potenciales.

2. **¿Modelo OpenAI o Voyage?**
   - **Recomendado: `text-embedding-3-small` de OpenAI.** Ya tenemos OPENAI_API_KEY, mismo proveedor que el resto, calidad sobrada para retrieval de proyectos.

3. **¿Idioma del texto a vectorizar?**
   - El `project_summary` viene en el idioma original del proyecto (ES, IT, FR, EN, etc.).
   - `text-embedding-3-small` es multilingüe.
   - El query del usuario también puede estar en cualquier idioma.
   - **Decisión: vectorizar tal cual, sin traducir.** Embedding multilingüe maneja cross-lingual retrieval razonablemente.

4. **¿Cache del retrieve en local?**
   - **Recomendado: cache MySQL local con TTL 24h** por `(entity_oid, query_hash)`. El usuario que pulse "Sugerir" dos veces seguidas no debe ir al VPS dos veces.

5. **¿Auto-aplicar el párrafo o que el usuario lo revise?**
   - **Siempre revisar.** El botón inserta texto borrador con un banner "✨ Generado a partir de tus proyectos pasados — revisa antes de seguir".

---

## Tabla de propiedad

| Pieza | Quién |
|---|---|
| Endpoint `?detail=full` o scraper de descripciones | **VPS Claude** |
| Schema `project_embeddings` + worker de embedding | **VPS Claude** |
| Endpoint `POST /retrieve/projects-similar` | **VPS Claude** |
| Endpoint `POST /v1/writer/suggest-experience-projects` (proxy) | **Local Claude** |
| Endpoint `POST /v1/writer/compose-experience-paragraph` (LLM call) | **Local Claude** |
| Botón + modal en Writer | **Local Claude** |
| Cache MySQL del retrieve | **Local Claude** |

---

## Order de implementación

1. **Fase 1** desbloquea Fase 2 (necesitamos texto completo para vectorizar bien).
2. **Fase 2** desbloquea Fase 3 (necesitamos el endpoint retrieve).
3. **Fase 3** es trabajo Local Claude puro y se puede hacer en cuanto Fase 2 esté lista.

Mientras VPS Claude está en Fase 1+2, Local Claude no tiene trabajo en este sistema. No empezar Fase 3 antes de tener el endpoint retrieve testeado.
