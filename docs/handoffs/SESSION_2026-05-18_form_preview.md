# Session Handoff — 2026-05-18 — Rediseño "Preparar formulario oficial"

> Sesión autónoma de 4h. Oscar se fue dejando libertad de criterio para
> rediseñar la pestaña "Preparar formulario oficial". Sin llamadas a la
> API de Anthropic durante la sesión — todo el trabajo es código y diseño.

---

## TL;DR

Antes la pestaña era una **lista plana** de resultados de compresión, sin
forma de revisar lo que iba a salir en el `.docx`. El usuario descargaba a
ciegas un docx de **170+ páginas** con tablas vacías o desbordadas.

Ahora la pestaña es una **previsualización completa estilo "Escribir"**:
sidebar con todas las secciones del Form Part B, panel central con el
contenido de cada campo, medidor global de páginas, edición manual + IA
proactiva por campo, tablas estructuradas renderizadas en línea, y warnings
claros cuando algo falta.

**El exporter también está saneado**: limites por campo, truncado defensivo
en cada celda de tabla, sin texto que rompa el layout del docx.

---

## Qué cambió

### Backend

**Nuevo: `node/src/modules/exporter/field-limits.js`**
- Caps por campo (`FIELD_CHAR_LIMITS`) calibrados a ~120 págs totales:
  - 1.1/1.2/1.3 → 10-13k chars cada uno
  - 2.1.1 → 8k · 2.1.2 → 6k · 2.1.4 → 4k
  - 2.2.1 → 8k · 2.2.2 → 5k
  - 3.1 → 8k · 3.2/3.3 → 6k cada uno
  - 4.1 → 3k · 5.1 → 3k · 5.2 → 1.5k
  - summary → 2.5k · s6_2 → 2.5k
- Caps por celda de tabla (`TABLE_CELL_LIMITS`): `task_description` 600,
  `del_description` 600, `risk_description` 500, etc. Evita filas desbordadas.
- Helpers: `truncate(text, max)`, `capNarrative(id, text)`, `capTableRows(rows)`,
  `estimatePages(text)` (1.500 chars ≈ 1 pág).

**`node/src/modules/exporter/render-form-b.js`** — sanea los placeholders:
- Cada campo narrativo pasa por `capNarrative(id, text)` antes de ir a docxtemplater.
- Cada tabla pasa por `capTableRows(rows)`. Las tablas anidadas de WP (tasks,
  milestones, deliverables) también se capan.
- Añadido `s2_1_5_outside_text` (antes faltaba).
- Añadido `s5_2_text` al output.
- `tasks_gantt` no se capa (las celdas son marcas de 1 carácter).

**`node/src/modules/exporter/controller.js`** — endpoint preview reescrito:
- `GET /v1/exporter/projects/:projectId/form-part-b/preview` ahora devuelve
  un payload rico con:
  - `global`: `total_pages_estimate`, `target_pages`, `narrative_chars_used`,
    `narrative_chars_cap`, `narrative_filled/total`, `wp_count`, etc.
  - `sections`: array agrupado por sección del formulario, cada uno con sus
    items (`kind`: `narrative` | `narrative_with_table` | `wp` | `declaration`).
  - Para `narrative_with_table` (2.1.3 Staff, 2.1.5 Risks): incluye
    `table_rows` con los datos estructurados.
  - Para `wp` (4.2): items sintéticos por WP con `tasks`, `milestones`,
    `deliverables` ya capados.
  - `tables_summary`: contador por tabla con flag `empty`.
- Nuevo: `PATCH /v1/exporter/form-field-values/:instanceId/:fieldId`
  para guardar edición manual del usuario. Trunca al cap, marca
  `manually_edited: true` en `value_json`.

**`node/src/modules/master/controller.js`**:
- `compressToForm` aplica `effectiveMaxChars = field.max_chars || getFieldLimit(field.id)` —
  inyecta el cap en el prompt aunque el template JSON no lo tenga.
- Truncado defensivo tras la respuesta del LLM (`truncate(answerBody, effectiveMaxChars)`),
  por si el modelo se pasa pese a la instrucción.
- Nuevo endpoint `POST /v1/master/documents/:id/compress-field/:fieldId`:
  re-comprime UN solo campo desde el Master sin tirar las 16 llamadas.

### Frontend

**`public/js/master.js`** — tab "Preparar formulario oficial" rediseñado:
- Carga `/exporter/projects/:id/form-part-b/preview` al abrir la pestaña.
- Layout sidebar + main idéntico al de Escribir/Developer.
- Medidor de páginas en el header con 3 colores (verde < 115, ámbar 115-130, rojo > 130).
- Por cada campo:
  - **Narrativo**: textarea editable + medidor de chars con barra de progreso ·
    botón "Re-comprimir desde el Master" (llama al endpoint nuevo) ·
    botón "Pedir mejora a la IA" (reusa propose-rewrite del Master + PATCH al field).
  - **Con tabla** (2.1.3, 2.1.5): textarea + tabla read-only debajo. Si está
    vacía, warning ámbar con link mental a Escribir.
  - **WP**: bloque por WP con duración + objetivos + 3 sub-tablas (tasks,
    milestones, deliverables). Cada sub-tabla vacía → warning específico.
  - **Declaración**: aviso de que se rellena en el portal EACEA.
- Botón "Re-comprimir todo" con confirmación (sobrescribe ediciones manuales).
- Botón "Descargar Form Part B (.docx)" siempre visible.

---

## Test plan manual para cuando Oscar vuelva

> ⚠ Algunas pruebas implican llamadas al LLM (€). Marcadas con `[€]`.
> Las que no, son seguras de correr cuantas veces quieras.

### Smoke tests (sin LLM, gratis)

1. **Servidor arranca limpio**
   - Ya está corriendo en PID 27136. Verifica con `netstat -ano | findstr ":3000.*LISTENING"`.
   - Logs en `tmp/server.log` no deberían tener stack traces nuevos.

2. **Tab "Preparar formulario oficial" carga preview**
   - Abre el panel Perfeccionar de SUSTRAI (proyecto con Master compilado).
   - Pulsa la sub-tab "Preparar formulario oficial".
   - **Esperado**: spinner breve → vista con medidor de páginas + sidebar + panel central. SIN llamada al LLM.
   - **Bug si**: spinner infinito, error 404/500, sidebar vacío.

3. **Sidebar muestra secciones correctas**
   - Verifica que aparecen las 8 secciones: Project Summary, 1. RELEVANCE,
     2.1, 2.2, 3. IMPACT, 4. WORK PLAN, 5. OTHER, 6. DECLARATIONS.
   - Cada item del sidebar muestra el número (1.1, 2.1.3, etc.) y badge:
     ✓ verde si rellenado, ⚠ ámbar si vacío, ❗ rojo si excede límite.

4. **Selección de campo (no llama API)**
   - Click en cualquier item del sidebar → panel central se actualiza al instante.
   - El item activo en sidebar queda con fondo azul (`bg-primary`).
   - Re-selecciona otro item → cambia sin lag.

5. **Tabla 2.1.3 (Staff) y 2.1.5 (Risks)**
   - Si tu proyecto tiene staff seleccionado en Escribir → debe verse la tabla con N filas.
   - Si no hay staff → debe aparecer warning ámbar "Tabla Staff vacía".

6. **4.2 — Work Packages**
   - Cada WP debe aparecer como item separado en el sidebar.
   - Click en un WP → panel muestra objetivos + 3 sub-tablas (tasks/milestones/deliverables).
   - Sub-tabla vacía → warning ámbar.

7. **Edición manual de un campo narrativo**
   - Selecciona 1.1. Modifica el textarea.
   - **Esperado**: aparecen botones "Guardar edición" / "Descartar cambios".
   - Pulsa "Guardar" → toast "Cambios guardados" · medidor de páginas se actualiza.
   - Recarga la pestaña (Ctrl+R sobre el navegador) → la edición persiste.
   - **Bug si**: cambios no persisten · botones no aparecen · 401/403.

8. **Truncado defensivo en edición manual**
   - Mete texto de >15.000 chars en 1.1 (max_chars: 12.000). Guarda.
   - **Esperado**: toast "Cambios guardados. Se aplicó truncado para no exceder el límite."
   - Verifica que el textarea muestra `[…]` al final.

9. **Descarga DOCX (sin LLM)**
   - Pulsa "Descargar Form Part B (.docx)".
   - Verifica que el `.docx` baja en pocos segundos.
   - Abre el `.docx` → comprueba:
     - El número total de páginas debería estar entre 100 y 130 (antes era 170+).
     - Las tablas de Staff, Risks, WPs no deben tener filas vacías ni desbordadas.
     - Los textos narrativos deben caber en sus secciones sin saltar tablas.

### Tests con LLM (€)

10. `[€]` **"Pedir mejora a la IA" en un campo narrativo**
    - Selecciona 1.1. Click "Pedir mejora a la IA" en el panel central.
    - Escribe "Hazlo más conciso" → "Proponer mejora".
    - **Esperado**: 10-30s → propuesta inline con rationale + nuevo texto.
    - Pulsa "Aplicar al formulario" → textarea actualizado, toast verde.
    - Coste: ~$0.05.

11. `[€]` **"Re-comprimir desde el Master"**
    - Selecciona 1.2. Edita el textarea manualmente (cambio cualquiera).
    - Click "Re-comprimir desde el Master" → confirma.
    - **Esperado**: 15-30s → contenido del campo vuelve a generarse desde el
      capítulo del Master, perdiendo la edición manual.
    - Coste: ~$0.05.

12. `[€][€€€]` **"Re-comprimir todo"**
    - Click "Re-comprimir todo" → confirm.
    - **Esperado**: 2-5 min · 15-20 llamadas LLM · todos los campos refrescados.
    - Coste: ~$3-5.
    - **Solo correr si confías que el flujo de 1 campo (test 11) funciona.**

---

## Archivos cambiados

```
A  docs/PROMPTS_CAG/10_propose_rewrite.md         (sesión anterior — propose-rewrite endpoint)
A  node/src/modules/exporter/field-limits.js      (caps por campo + por celda + helpers)
M  docs/PROMPTS_CAG/01b_compile_single_chapter.md (interview_summary — sesión anterior)
M  node/src/modules/exporter/controller.js        (preview rico + PATCH field value)
M  node/src/modules/exporter/render-form-b.js     (capNarrative + capTableRows + nuevos placeholders)
M  node/src/modules/exporter/routes.js            (+ PATCH route)
M  node/src/modules/master/controller.js          (compressSingleField + effectiveMaxChars + truncate defensivo)
M  node/src/modules/master/routes.js              (+ compress-field route)
M  public/js/app.js                               (App.isAdmin export — sesión anterior)
M  public/js/master.js                            (Tab Compress reescrito completo)
```

---

## Endpoints nuevos · API

| Método | Path | Auth | Llama LLM? | Para qué |
|---|---|---|---|---|
| `GET`   | `/v1/exporter/projects/:projectId/form-part-b/preview`         | sí | ❌ | Carga la preview rica del formulario |
| `PATCH` | `/v1/exporter/form-field-values/:instanceId/:fieldId`          | sí | ❌ | Edición manual de un campo |
| `POST`  | `/v1/master/documents/:id/compress-field/:fieldId`             | sí | ✅ | Re-comprime UN campo desde el Master |

---

## Decisiones de diseño tomadas

1. **Sincronización Master ↔ Formulario: unidireccional**.
   El Master es la fuente de verdad de redacción. Comprimir genera el
   formulario. Si el usuario edita un campo del formulario, queda solo en
   el formulario. Re-comprimir sobrescribe ediciones manuales (con confirm).

2. **Tablas en la previsualización: solo lectura**.
   Las tablas (staff, risks, WP-tasks, etc.) se renderizan inline pero
   no se editan aquí. Para editar: ir a Escribir. Esto evita duplicar UI
   y mantiene "el Master/Diseño es la fuente, el formulario es la vista
   final". Si está vacía, warning ámbar con texto explicativo.

3. **Límites: blandos**. Si un campo se pasa, sale warning rojo pero
   permite descargar. El usuario sabe lo que hace.

4. **Caps de chars calibrados a ~120 págs total** según breakdown EACEA
   (Relevance 12-15p · Quality 25-30p · Impact 12-14p · WPs+tablas ~50p).

5. **Re-comprimir campo a campo**: ahorra €€€. Para una edición pequeña
   en un capítulo del Master, solo refrescas el campo afectado, no los 16.

---

## Limitaciones conocidas / pendientes (no shippeado)

1. **Tabla 4.2 Events/mobility no aparece como item independiente** en
   el sidebar. Los meetings/mobility quedan dentro de cada WP. Si quieres
   verlos como sección aparte, hay que añadir un item sintético en
   `FIELD_META` (`exporter/controller.js`) y en el sidebar.

2. **Tabla 4.2 Effort per WP (person-months)** no se muestra en la preview.
   En el docx sí se renderiza (con PM vacíos porque no tracking). Si quieres
   verla, añadir un item `kind: 'table'` con `table_key: 'wps_effort'`.

3. **Annex de proyectos UE previos**: aparece en el medidor (`eu_projects_count`)
   pero no como item del sidebar. Bajo solicitud lo añado.

4. **Edición de tablas inline**: no implementada. Volver a Escribir.

5. **El medidor de páginas es una estimación**, no exacta. Calibrado a
   1.500 chars/pág + ~0.4 pág/fila de tabla. El docx real puede variar
   un 10-15%.

6. **Form templates en BD**: si el `form_templates.template_json` en
   tu BD local tiene campos `max_chars` definidos, se respetan; si no,
   se usa el fallback de `field-limits.js`. **Recomendado**: actualizar
   el `template_json` en BD copiando los caps de `field-limits.js` para
   no depender del fallback. Migración pendiente.

---

## Verificación final

- ✓ `node --check` pasa en todos los archivos JS modificados.
- ✓ Servidor arranca limpio en PID 27136.
- ✓ Endpoints nuevos responden 401 sin auth (correcto).
- ✓ master.js sirve `200` por HTTP.
- ✓ Sin git commit. Pendiente revisión Oscar.

---

## Cómo retomar

1. Refrescar el navegador con **Ctrl+Shift+R** (fuerza recarga del JS).
2. Abrir un proyecto con Master compilado (SUSTRAI o cualquier otro).
3. Ir a Perfeccionar → "Preparar formulario oficial".
4. Correr el smoke test del 1 al 9 (sin coste).
5. Si todo bien, probar 10 y 11 (un par de € en total).
6. Decidir si quieres que itere algo o si commiteamos.

Buena tarde.
