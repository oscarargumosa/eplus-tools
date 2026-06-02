# E+ Tools — Reglas para Claude Code

## Tareas pendientes

Lista canónica de trabajo pendiente coordinado entre sesiones: **`docs/PENDING.md`**.
Cuando Oscar pregunte "¿qué tareas tenemos pendientes?", abrir ese fichero antes de cualquier otra cosa. Cuando se cierre una tarea, mover a §3 con fecha. Cuando se planifique una nueva, añadir a §1 o §2 con doc canónico en `docs/` si aplica.

## Buzones Local <-> VPS

Comunicación asíncrona entre Claude Local (PC) y Claude VPS:
- `docs/handoffs/PARA_VPS.md` — Local escribe, VPS lee
- `docs/handoffs/PARA_LOCAL.md` — VPS escribe, Local lee

**Al arrancar sesión, leer ambos ficheros.** Cuando se responda, añadir entrada con cabecera `## YYYY-MM-DD · <asunto>` al final del fichero correspondiente; las entradas viejas se conservan como histórico. No borrar mensajes recibidos: marcar como respondidos referenciando la entrada en la respuesta. Igual patrón que el buzón con Ana en `designer-projects/`.

## Protocolo de ramas

Este repo tiene dos Claudes trabajando en paralelo, cada uno en su rama:

| Claude | Rama | Cuándo trabaja |
|---|---|---|
| Claude Local (PC) | `dev-local` | Día, sesiones presenciales |
| Claude VPS (Bot Telegram) | `dev-vps` | Noche, sesiones asíncronas |

**`main` es solo para deploy.** Ningún Claude pushea directo a `main`, salvo a través del slash command `/merge` que Oscar invoca explícitamente.

### Reglas absolutas
1. **NUNCA** push directo a `main` desde fuera de `/merge`. El comando `/merge` ES la vía sancionada y autorizada por Oscar para pushear a main; cuando lo invoca, esta regla no aplica.
2. **NUNCA** hacer force push en ninguna rama
3. **NUNCA** hacer rebase de ramas compartidas
4. **NUNCA** push a la rama del otro Claude
5. **SIEMPRE** hacer pull/fetch antes de empezar a trabajar

### Slash commands disponibles (personales de Oscar, en `.claude/commands/`)
- `/push` — pushea la rama actual a origin. Refusa si está en main (redirige a `/merge`).
- `/merge` — ejecuta el Proceso MERGE completo (commit pendientes → push current → checkout main → merge dev-local + dev-vps → push main → sync ambas ramas). Es la única vía autorizada para pushear a main.

### Proceso MERGE (cuando Oscar dice "MERGE")
1. Commit cambios locales pendientes en `dev-local`
2. `git fetch origin`
3. `git checkout main && git pull origin main`
4. `git merge origin/dev-local` (y/o `git merge origin/dev-vps` si Oscar lo indica)
5. Resolver conflictos (mantener cambios de ambos lados)
6. `git push origin main`
7. Sincronizar rama: `git checkout dev-local && git merge origin/main && git push origin dev-local`
- Coolify despliega automáticamente cada push a `main`

### Resolución de conflictos
- **Técnicos** (imports, config, estructura) → la mejor lógica gana.
- **Funcionales** (dos implementaciones del mismo feature) → la mejor solución gana.
- **Negocio** (flujo de usuario, decisiones de producto) → siempre preguntar a Oscar.

## Servidor y Entorno

Antes de asumir que un bug está en el código, comprueba el entorno:

- Tras añadir endpoints o cambiar archivos de rutas (`node/src/modules/*/routes.js`, `server.js`), Oscar tiene que **reiniciar el `node server.js` manualmente** desde Laragon. Si pruebas un endpoint nuevo y devuelve 404, pídele que reinicie antes de cazar el bug.
- Antes de migraciones o queries, comprobar que **MySQL de Laragon esté corriendo** (`/c/laragon`, MySQL 8.4). Si una migración falla con `ECONNREFUSED`, no reintentar — sacar a la luz que MySQL está caído.
- Cuando `git push` falle por permisos del sandbox, **parar y pedir a Oscar que lo ejecute él** en lugar de entrar en bucle.
- Las env vars de producción están en Coolify, no en el repo. Si el VPS falla por config faltante, no inventar — pedir a Oscar que la verifique en Coolify.

## Protocolo de investigación

Antes de cambiar código:

1. Confirmar que el repo/cwd activo es `eplus-tools` (no `ka3-writer` ni el WP). Oscar tiene varios proyectos.
2. Cuando se persiga un error de API (403/404/500), **pedir pegar la env var o config relevante ANTES** de probar variantes de endpoint. Las erratas en env vars (`l` vs `I`, espacios, comillas) son la causa raíz más común.
3. Leer el código real involucrado (`Read` en el archivo, `Grep` por el símbolo) antes de proponer un fix. No adivinar por nombre de archivo.
4. Para bugs reportados desde Live, comprobar primero si el problema existe también en local. Si solo está en Live, sospechar de datos/migraciones/env vars de producción, no del código.

## Disciplina de scope

- Para trabajo de UI/feature, entregar la **versión mínima viable primero**. No añadir botones, paneles ni opciones extra sin que se pidan.
- Cuando Oscar pida un plan multi-stage (S1-S8, bloques 1-5), **ejecutar hasta completar** salvo que pida explícitamente aprobación incremental.
- Si una feature se vuelve compleja a mitad de implementación, **pausar y confirmar dirección** antes de añadir más superficie.
- Los bug fixes no necesitan refactor de cleanup colateral. Las operaciones one-shot no necesitan helper. Tres líneas similares es mejor que una abstracción prematura.

## Desarrollo local

Oscar trabaja en local con Laragon antes de hacer push:
- **MySQL:** Laragon (`/c/laragon`), MySQL 8.4, user `root`, sin password
- **BD:** `eplus_tools`
- **Servidor:** `node server.js` → `http://localhost:3000`
- **Usuario:** `oscarargumosa@gmail.com` con `role=admin`
- Tras cambios en código, reiniciar servidor para que Oscar pruebe
- Solo push cuando Oscar lo pida o diga MERGE

## Migraciones

- Las migraciones se ejecutan automáticamente al desplegar (Dockerfile CMD)
- **SIEMPRE** escribir migraciones idempotentes:
  - Tablas: `CREATE TABLE IF NOT EXISTS`
  - Inserts: `INSERT IGNORE` o `ON DUPLICATE KEY UPDATE`
  - Columnas: comprobar con `information_schema.COLUMNS` antes de `ALTER TABLE ADD COLUMN`
  - **NUNCA** usar `CREATE INDEX IF NOT EXISTS` (no existe en MySQL)
  - **NUNCA** usar `ADD COLUMN IF NOT EXISTS` (no existe en MySQL 8.x)

## Stack técnico
- **Backend:** Node.js + Express, MySQL (mysql2), JWT auth
- **Frontend:** Vanilla JS (SPA), Tailwind CDN, Material Symbols
- **Deploy:** Coolify desde `main` → `intake.eufundingschool.com`
- **BD producción:** `eplus_tools` en MySQL del contenedor `wordpress-eufunding-db-1`

## Estructura del proyecto
```
server.js                     → Entry point Express
node/src/modules/             → Módulos backend (auth, intake, calculator, admin)
node/src/middleware/           → Auth middleware (JWT)
node/src/utils/               → DB connection, UUID helper
public/                       → SPA frontend
public/js/                    → api.js, auth.js, app.js, intake.js, admin.js
public/css/                   → main.css
migrations/                   → SQL migrations (auto-ejecutadas al deploy)
scripts/migrate.js            → Runner de migraciones (tolerante a duplicados)
```

## Idioma y locale

- Por defecto, copy de UI y contenido generado por IA en **español**. Derivar el idioma del campo/contexto (ej. campos de NA en Erasmus+ son en español).
- Si Oscar pide explícitamente otro idioma, respetarlo.
- Mensajes de error técnicos al usuario también en español; logs internos pueden ir en inglés.
