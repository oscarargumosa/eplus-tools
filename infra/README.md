# `infra/` — desarrollo local

Servicios de soporte para Claude Local que NO se despliegan en Coolify (la app sí).

## `docker-compose.local.yml`

Postgres 16 que replica `erasmus-pg` del VPS para test offline del directorio de entidades.

```bash
# Levantar
docker compose -f infra/docker-compose.local.yml up -d

# Estado
docker compose -f infra/docker-compose.local.yml ps

# Logs
docker compose -f infra/docker-compose.local.yml logs -f pg-erasmus

# Tirar (NO borra el volumen — los datos persisten)
docker compose -f infra/docker-compose.local.yml down

# Reset completo (BORRA datos)
docker compose -f infra/docker-compose.local.yml down -v
```

Conexión local:
```
host: 127.0.0.1
port: 5433
db:   erasmus
user: postgres
pass: dev
```

Restaurar el dump más reciente del VPS: ver `scripts/sync-prod-pg-to-local.sh`.

## `pg-init/`

Scripts SQL que Postgres ejecuta una sola vez al primer arranque del contenedor (volumen vacío). Aquí van extensiones (`pg_trgm`, `unaccent`) que el dump del VPS asume disponibles.

Si añades una extensión nueva:
1. Edita `pg-init/01-extensions.sql`
2. `docker compose down -v` + `up -d` (reset)
3. O `docker exec erasmus-pg-local psql -U postgres -d erasmus -c "CREATE EXTENSION ..."` (sin reset)
