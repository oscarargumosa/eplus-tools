#!/usr/bin/env bash
# Espeja erasmus-pg de VPS a Postgres local (Docker en infra/docker-compose.local.yml)
# vía túnel SSH transitorio + endpoint /admin/dump del directory-api.
#
# Pre-requisitos:
#   1. Docker Postgres local arriba: docker compose -f infra/docker-compose.local.yml up -d
#   2. ~/.claude/local-sync.env con DIRECTORY_DUMP_KEY=...
#   3. SSH key/password a root@91.98.145.106
#   4. pg_restore en PATH (viene con Postgres client)
#
# Estado: STUB. El endpoint /admin/dump aún no está deployed en VPS Claude.
# Cuando esté operativo, este script funciona end-to-end sin cambios.
#
# Uso: bash scripts/sync-prod-pg-to-local.sh

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────
VPS_HOST="${VPS_HOST:-root@91.98.145.106}"

# Túnel SSH transitorio: localhost:4011 -> VPS:127.0.0.1:4010 (directory-api en localhost)
TUNNEL_LOCAL_PORT=4011
TUNNEL_REMOTE_PORT=4010
TUNNEL_HOST_IN_VPS="127.0.0.1"

DUMP_URL="http://127.0.0.1:${TUNNEL_LOCAL_PORT}/admin/dump/erasmus-pg"

# Postgres local (docker-compose)
LOCAL_PG_HOST="127.0.0.1"
LOCAL_PG_PORT="5433"
LOCAL_PG_USER="postgres"
LOCAL_PG_PASS="dev"
LOCAL_PG_DB="erasmus"

# Permacultura Cantabria — verificar siempre que esté tras restore
VERIFY_OID="E10151149"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_DIR="$REPO_ROOT/tmp/local-sync"
DUMP_FILE="$DUMP_DIR/erasmus-pg_$(date +%Y%m%d_%H%M%S).dump"

# ── Resolver DIRECTORY_DUMP_KEY ───────────────────────────────────
if [ -z "${DIRECTORY_DUMP_KEY:-}" ] && [ -f "$HOME/.claude/local-sync.env" ]; then
  set -a; source "$HOME/.claude/local-sync.env"; set +a
fi
if [ -z "${DIRECTORY_DUMP_KEY:-}" ]; then
  echo "ERROR Falta DIRECTORY_DUMP_KEY."
  echo "      Debe estar en ~/.claude/local-sync.env (lo monta Oscar una vez)."
  exit 1
fi

# ── Pre-checks ────────────────────────────────────────────────────
mkdir -p "$DUMP_DIR"

for cmd in ssh curl pg_restore docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR '$cmd' no está en PATH."
    exit 1
  fi
done

# Postgres local arriba?
if ! docker compose -f "$REPO_ROOT/infra/docker-compose.local.yml" ps --status running 2>/dev/null | grep -q pg-erasmus; then
  echo "ERROR Postgres local no está corriendo."
  echo "      Lanza:  docker compose -f infra/docker-compose.local.yml up -d"
  exit 1
fi

# ── Levantar túnel SSH transitorio ────────────────────────────────
echo "[1/5] levantando túnel SSH transitorio: 127.0.0.1:${TUNNEL_LOCAL_PORT} -> VPS:${TUNNEL_REMOTE_PORT}"
ssh -fN -L "127.0.0.1:${TUNNEL_LOCAL_PORT}:${TUNNEL_HOST_IN_VPS}:${TUNNEL_REMOTE_PORT}" \
    -o ServerAliveInterval=15 \
    -o ExitOnForwardFailure=yes \
    "$VPS_HOST"
TUNNEL_PID=$(pgrep -f "ssh -fN -L 127.0.0.1:${TUNNEL_LOCAL_PORT}" | tail -1 || true)
trap "[ -n \"\$TUNNEL_PID\" ] && kill \$TUNNEL_PID 2>/dev/null || true" EXIT

# Esperar que el túnel acepte conexiones
for i in 1 2 3 4 5; do
  if (exec 3<>/dev/tcp/127.0.0.1/$TUNNEL_LOCAL_PORT) 2>/dev/null; then
    break
  fi
  sleep 1
done

# ── Descargar dump ────────────────────────────────────────────────
echo "[2/5] descargando dump desde $DUMP_URL"
echo "      (~ varios minutos según tamaño y red Hetzner -> España)"

HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$DUMP_FILE" \
  -H "X-Admin-Key: $DIRECTORY_DUMP_KEY" \
  --max-time 1800 \
  "$DUMP_URL" || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR endpoint respondió HTTP $HTTP_CODE"
  if [ "$HTTP_CODE" = "404" ]; then
    echo "      404 -> el endpoint /admin/dump aún no está deployado en VPS."
    echo "      Espera al aviso de VPS Claude en docs/handoffs/PARA_LOCAL.md"
  elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    echo "      $HTTP_CODE -> X-Admin-Key incorrecta. Re-pega DIRECTORY_DUMP_KEY en ~/.claude/local-sync.env"
  fi
  exit 1
fi

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "      OK  Dump descargado: $DUMP_SIZE"

# ── Restore ───────────────────────────────────────────────────────
echo "[3/5] DROP+RECREATE database $LOCAL_PG_DB"
PGPASSWORD="$LOCAL_PG_PASS" psql -h "$LOCAL_PG_HOST" -p "$LOCAL_PG_PORT" -U "$LOCAL_PG_USER" \
  -d postgres -c "DROP DATABASE IF EXISTS \"$LOCAL_PG_DB\";"
PGPASSWORD="$LOCAL_PG_PASS" psql -h "$LOCAL_PG_HOST" -p "$LOCAL_PG_PORT" -U "$LOCAL_PG_USER" \
  -d postgres -c "CREATE DATABASE \"$LOCAL_PG_DB\";"

echo "[4/5] pg_restore (--jobs=4 para paralelizar)"
PGPASSWORD="$LOCAL_PG_PASS" pg_restore \
  -h "$LOCAL_PG_HOST" -p "$LOCAL_PG_PORT" -U "$LOCAL_PG_USER" \
  -d "$LOCAL_PG_DB" \
  --jobs=4 \
  --no-owner --no-privileges \
  --verbose \
  "$DUMP_FILE" 2>&1 | tail -20

# ── Verify ────────────────────────────────────────────────────────
echo "[5/5] verificando..."

ENT_COUNT=$(PGPASSWORD="$LOCAL_PG_PASS" psql -h "$LOCAL_PG_HOST" -p "$LOCAL_PG_PORT" -U "$LOCAL_PG_USER" \
  -d "$LOCAL_PG_DB" -tAc "SELECT COUNT(*) FROM directory.entities" 2>/dev/null || echo 0)
PROJ_COUNT=$(PGPASSWORD="$LOCAL_PG_PASS" psql -h "$LOCAL_PG_HOST" -p "$LOCAL_PG_PORT" -U "$LOCAL_PG_USER" \
  -d "$LOCAL_PG_DB" -tAc "SELECT COUNT(*) FROM eplus2021.projects" 2>/dev/null || echo 0)
PC_FOUND=$(PGPASSWORD="$LOCAL_PG_PASS" psql -h "$LOCAL_PG_HOST" -p "$LOCAL_PG_PORT" -U "$LOCAL_PG_USER" \
  -d "$LOCAL_PG_DB" -tAc "SELECT COUNT(*) FROM directory.entities WHERE oid='$VERIFY_OID'" 2>/dev/null || echo 0)

echo "      directory.entities:    $ENT_COUNT  (esperado ~288k)"
echo "      eplus2021.projects:    $PROJ_COUNT  (esperado ~317k)"

if [ "$PC_FOUND" != "1" ]; then
  echo "      ERROR Permacultura Cantabria ($VERIFY_OID) NO está en directory.entities"
  exit 1
fi
echo "      OK   Permacultura Cantabria ($VERIFY_OID) presente"

echo ""
echo "Sync Postgres completo. Dump conservado en:"
echo "  $DUMP_FILE"
