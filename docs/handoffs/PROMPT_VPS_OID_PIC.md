# Prompt para Claude VPS — reparar OID/PIC en `erasmus-pg`

> Copiar desde la línea de abajo y pegarlo entero en la sesión del VPS.
> Origen: sesión 2026-09-22 (Óscar no podía añadir socios en el Intake).
> Petición original sin respuesta: `docs/handoffs/PARA_VPS.md` 2026-06-27.

---

Tarea de **datos** sobre `erasmus-pg`. No toques código de la app: el lado app ya está resuelto.

## Contexto

En el Intake de E+ Tools, el buscador de entidades no encuentra **ORIEL APS** y devuelve **ONG PASOS sin OID**, así que no se pueden añadir como socios. La causa está en los datos del directorio, no en el front.

**OID y PIC son identificadores distintos de la misma organización, y no se deben fusionar:**

- **OID** — `E` + 8-9 dígitos (`E10151149`). Organisation Registration System. Es el que usa Erasmus+ desde 2019-2020.
- **PIC** — 9 dígitos (`940435371`). Participant Portal. Sigue vivo en Horizon Europe y otros programas de gestión directa.

El problema: en algunas filas **el OID quedó guardado en la columna `pic` y `oid` se quedó vacío**. Diagnóstico verificado el 2026-06-27 contra tu propia API (`GET /search?q=oriel`):

```
oid        pic         name        total_projects
(vacío)    E10200340   ORIEL APS   343    ← su OID está METIDO EN pic
(vacío)    910151486   ORIEL APS     8    ← duplicado de la MISMA org; este pic sí es un PIC real
```

Yo ya he metido en la app una capa que recoloca los identificadores **por formato** (`E\d{6,}` = OID, `\d{9}` = PIC) para desbloquear a Óscar hoy. Es un parche de lectura. **La reparación de verdad es en origen, y es la tuya.**

## Paso 0 — Verifica el terreno antes de tocar nada

No asumas nombres: dime primero qué encuentras.

```sql
-- ¿En qué esquema/tabla vive esto realmente?
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_name IN ('entities','entities_master','organisations') ORDER BY 1,2;

-- Columnas, tipos y constraints de la tabla de entidades
\d+ <esquema>.entities

-- ¿Hay UNIQUE/PK sobre oid? ¿Qué vistas materializadas dependen de ella?
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'entities';
SELECT schemaname, matviewname FROM pg_matviews;
```

Importa porque existe `directory.identity_resolution` (resuelve alias PIC↔OID) y la matview `directory.entities_master`: si tocas `entities`, hay que refrescar lo que dependa.

## Paso 1 — Cuantifica (solo lectura). Repórtame estos números ANTES de reparar

```sql
-- a) Filas sin OID
SELECT count(*) FROM entities WHERE oid IS NULL OR trim(oid) = '';

-- b) De esas, cuántas llevan un OID escondido en pic
SELECT count(*) FROM entities
 WHERE (oid IS NULL OR trim(oid) = '') AND trim(pic) ~ '^E\d{6,}$';

-- c) El caso inverso: un PIC metido en la columna oid
SELECT count(*) FROM entities
 WHERE trim(oid) ~ '^\d{9}$';

-- d) COLISIONES: filas cuyo pic-con-forma-de-OID YA existe como oid de otra fila.
--    Estas NO se pueden mover con un UPDATE: son fusiones, no recolocaciones.
SELECT count(*) FROM entities e
 WHERE (e.oid IS NULL OR trim(e.oid) = '') AND trim(e.pic) ~ '^E\d{6,}$'
   AND EXISTS (SELECT 1 FROM entities x WHERE upper(trim(x.oid)) = upper(trim(e.pic)));

-- e) Panorama de duplicados por nombre
SELECT name, count(*) FROM entities GROUP BY name HAVING count(*) > 1 ORDER BY 2 DESC LIMIT 50;
```

## Paso 2 — Backup antes de escribir

```sql
CREATE TABLE entities_backup_20260922 AS SELECT * FROM entities;
SELECT count(*) FROM entities_backup_20260922;
```

## Paso 3 — Recolocar los OID mal puestos (solo los SIN colisión)

Dentro de una transacción, y comprobando el recuento antes de confirmar:

```sql
BEGIN;

UPDATE entities e
   SET oid = upper(trim(e.pic)),
       pic = NULL
 WHERE (e.oid IS NULL OR trim(e.oid) = '')
   AND trim(e.pic) ~ '^E\d{6,}$'
   AND NOT EXISTS (SELECT 1 FROM entities x WHERE upper(trim(x.oid)) = upper(trim(e.pic)));

-- Debe coincidir con (b) − (d) del paso 1. Si no cuadra, ROLLBACK y me avisas.
COMMIT;
```

⚠️ **No inventes el PIC real.** Si no lo conoces, `pic` se queda en NULL. Prefiero un hueco honesto a un dato fabricado.

## Paso 4 — ORIEL APS: fusión manual (caso confirmado a mano)

`E10200340` (343 proyectos) y `910151486` (8 proyectos) son la **misma** organización real.

- Superviviente: la de **343 proyectos**.
- Conserva **ambos** identificadores: `oid = 'E10200340'`, `pic = '910151486'`.
- Repunta los proyectos/relaciones de la fila absorbida antes de borrarla.
- Revisa `directory.identity_resolution` para que el alias siga resolviendo.

## Paso 5 — ONG PASOS (caso nuevo)

Es la entidad de Óscar y sale **sin OID**. Sospecho el mismo patrón. Dime qué tiene su fila:

```sql
SELECT oid, pic, name, country_code, city, total_projects
  FROM entities
 WHERE name ILIKE '%PASOS%' OR name ILIKE '%ONG PASOS%';
```

## Paso 6 — El barrido masivo de duplicados: NO lo hagas a ciegas

Fusionar por nombre en bloque puede unir organizaciones distintas que se llaman parecido. Criterio mínimo: **nombre + país + solapamiento de proyectos**. Si un caso no está claro, **déjalo y anótalo** — que lo decida Óscar.

## Paso 7 — Refresca y verifica de punta a punta

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY directory.entities_master;  -- y las que dependan
```

Luego contra la API, que es lo que consume la app:

```bash
curl -s -H "X-API-Key: $KEY" "https://directorio.eufundingschool.com/api/search?q=oriel" | head -c 600
curl -s -H "X-API-Key: $KEY" "https://directorio.eufundingschool.com/api/search?q=pasos" | head -c 600
```

Criterio de éxito: **un solo ORIEL APS**, con `oid = E10200340`, sus 343 proyectos, y ONG PASOS con OID.

## Paso 8 — Repórtame en `PARA_LOCAL.md`

Con cabecera `## 2026-09-22 · OID/PIC reparado` e incluyendo:

1. Los conteos (a)-(e) del paso 1, antes y después.
2. Cuántas filas moviste y cuántas quedaron como colisión pendiente.
3. Estado final de ORIEL y de ONG PASOS.
4. Qué dependencias refrescaste.
5. Lo que decidiste NO tocar y por qué.

**Responde aunque no puedas hacerlo**, aunque sea para decir que estás bloqueado: llevo desde el 27 de junio sin respuesta en este asunto y ahora bloquea a un usuario real.
