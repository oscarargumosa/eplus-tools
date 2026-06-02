# Sync de datos prod -> Laragon local

Cómo dejar Laragon con una réplica funcional de la BD prod (`eplus_tools` en VPS) para que Claude Local pueda hacer test sin depender del túnel cada vez.

---

## Qué se clona y qué no

**Sí se clona (todas las tablas relevantes para test):**
- `entities` (~288k filas, ~200 MB con `raw_json`)
- `entity_enrichment` (parcial pero crítico para directorio)
- `entities_geocoded`, `entity_shortlists`
- `ors_crawl_state`
- `ref_*` (catálogos)
- `intake_programs`, `erasmus_eligibility`, `call_eligibility`
- Resto de tablas operacionales (proyectos, partners, work_packages, etc.) — sample real

**No se clona (datos sensibles o ruido):**
- `users` — Oscar usa su user local (`oscarargumosa@gmail.com`)
- `auth_tokens` — sesiones de prod, no aplicables en local
- `newsletter_subscribers` — RGPD
- `ai_logs`, `llm_cache` — volumen sin valor para test

**No incluye proyectos europeos históricos (Erasmus+ 2014-2025):** esos viven en la Postgres `erasmus-pg` del VPS (Directory API), no en MySQL `eplus_tools`. Cuando se necesite el sample de esa BD, ver §3.

---

## 1 · Preparar (una sola vez)

### 1.1 · Túnel SSH a prod

Ya está en `~/.claude/tunnel-mysql-prod.bat`. Lánzalo:

```cmd
%USERPROFILE%\.claude\tunnel-mysql-prod.bat
```

Mantén la ventana abierta mientras dure el sync.

### 1.2 · Password de `claude_ro`

Está en `~/.claude.json`:

```json
"mysql-prod": {
  "env": { "MYSQL_PASS": "..." }
}
```

Cópialo a `~/.claude/local-sync.env`:

```bash
echo 'CLAUDE_RO_PASS=PASSWORD_AQUI' > ~/.claude/local-sync.env
chmod 600 ~/.claude/local-sync.env
```

### 1.3 · `mysql` y `mysqldump` en PATH

Laragon trae los binarios pero no los pone en PATH por defecto. Añade a tu `.bashrc`:

```bash
export PATH="/c/laragon/bin/mysql/mysql-8.4.0-winx64/bin:$PATH"
```

(Ajustar la versión a la que tengas instalada en Laragon.)

---

## 2 · Sincronizar (cuando lo necesites)

Con el túnel arriba:

```bash
bash scripts/sync-prod-mysql-to-local.sh
```

Tarda 5-15 min según la línea (el cuello de botella es la transferencia del dump por SSH).

El script:
1. Verifica túnel + presencia de Permacultura Cantabria (`E10151149`) en prod
2. `mysqldump` remoto + gzip + descarga a `tmp/local-sync/`
3. `DROP DATABASE` + `CREATE DATABASE` local
4. Importa el dump a Laragon
5. Re-verifica que Permacultura Cantabria está presente en local

Si todo va bien, termina con `Sync completo`.

---

## 3 · Sample de proyectos EU históricos (pendiente)

La BD MySQL `eplus_tools` no contiene los ~70k proyectos Erasmus+ 2014-2025 ni los partners de cada proyecto. Esa fusión vive en la Postgres `erasmus-pg` del VPS, expuesta vía la Directory API en `https://directory.eufundingschool.com` (URL pública pendiente de confirmar) con API key.

**Cuando se necesite ese sample en local:**
- Opción A — instalar Postgres en Laragon y replicar via `pg_dump`
- Opción B — usar la Directory API directa (WebFetch + key) para queries puntuales sin replicar

Hoy, para auditar relaciones de Permacultura Cantabria con otros partners EU, hay que usar la Directory API (REST) o pedir a VPS Claude que haga el query desde dentro del VPS.

---

## 4 · Mantenimiento

- El dump se guarda en `tmp/local-sync/` con timestamp. Borrar manualmente cuando ocupen demasiado.
- Refrescar **cuando cambie algo gordo en prod** (nuevo crawl ORS, schema migration importante). No hace falta nightly — el crawl ORS no se mueve a diario.
- `tmp/` está en `.gitignore` (verificar).

---

## 5 · Datos importantes para verificar tras cada sync

| Concepto | Cómo comprobarlo |
|---|---|
| Permacultura Cantabria presente | `SELECT * FROM entities WHERE oid='E10151149'` -> 1 fila |
| Volumen razonable | `SELECT COUNT(*) FROM entities` -> ~288k |
| Bug INNER JOIN reproducible | El sample debe tener entities sin `entity_enrichment` (~123k) — si no, no se podrá auditar el bug del directorio en local |
