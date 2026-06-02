#!/usr/bin/env bash
# Espeja eplus_tools (MySQL prod, VPS) a Laragon local vía el túnel SSH ya montado.
# Excluye tablas con datos personales/operacionales.
# Verifica que Permacultura Cantabria (E10151149) y sus relaciones queden presentes.
#
# Pre-requisitos:
#   1. Túnel mysql-prod arriba en 127.0.0.1:3307 — lanzar `~/.claude/tunnel-mysql-prod.bat`
#   2. Password de claude_ro accesible — env CLAUDE_RO_PASS o `~/.claude/local-sync.env`
#      (extraer de ~/.claude.json → mcpServers.mysql-prod.env.MYSQL_PASS)
#   3. Laragon MySQL corriendo en 127.0.0.1:3306 con user root sin password
#
# Uso: bash scripts/sync-prod-mysql-to-local.sh

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────
TUNNEL_HOST="127.0.0.1"
TUNNEL_PORT="3307"
PROD_USER="claude_ro"
PROD_DB="eplus_tools"

LOCAL_HOST="127.0.0.1"
LOCAL_USER="${LOCAL_MYSQL_USER:-root}"
LOCAL_DB="${LOCAL_DB:-eplus_tools}"

# OID a verificar siempre (Permacultura Cantabria)
VERIFY_OID="E10151149"

# Tablas a excluir del dump (datos personales / operacionales / volumen)
EXCLUDE_TABLES=(
  "users"
  "auth_tokens"
  "newsletter_subscribers"
  "ai_logs"
  "llm_cache"
)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_DIR="$REPO_ROOT/tmp/local-sync"
DUMP_FILE="$DUMP_DIR/eplus_tools_$(date +%Y%m%d_%H%M%S).sql.gz"

# ── Resolver password ─────────────────────────────────────────────
if [ -z "${CLAUDE_RO_PASS:-}" ] && [ -f "$HOME/.claude/local-sync.env" ]; then
  set -a; source "$HOME/.claude/local-sync.env"; set +a
fi
if [ -z "${CLAUDE_RO_PASS:-}" ]; then
  echo "ERROR Falta CLAUDE_RO_PASS."
  echo "      Extrae de ~/.claude.json (mcpServers.mysql-prod.env.MYSQL_PASS)"
  echo "      y guarda en ~/.claude/local-sync.env como:"
  echo "          CLAUDE_RO_PASS=xxx"
  exit 1
fi

# ── Pre-checks ────────────────────────────────────────────────────
mkdir -p "$DUMP_DIR"

if ! (exec 3<>/dev/tcp/$TUNNEL_HOST/$TUNNEL_PORT) 2>/dev/null; then
  echo "ERROR Túnel mysql-prod no responde en $TUNNEL_HOST:$TUNNEL_PORT"
  echo "      Lanza primero: ~/.claude/tunnel-mysql-prod.bat"
  exit 1
fi

if ! command -v mysql >/dev/null 2>&1 || ! command -v mysqldump >/dev/null 2>&1; then
  echo "ERROR mysql / mysqldump no están en PATH."
  echo "      En Laragon, suelen estar en C:\\laragon\\bin\\mysql\\mysql-X.X.X-winx64\\bin"
  echo "      Añade ese bin al PATH o lanza este script desde la consola de Laragon."
  exit 1
fi

# Pre-verificar que Permacultura Cantabria existe en prod (sino, túnel apunta mal)
PC_PROD=$(MYSQL_PWD="$CLAUDE_RO_PASS" mysql \
  -h "$TUNNEL_HOST" -P "$TUNNEL_PORT" -u "$PROD_USER" \
  -Nse "SELECT COUNT(*) FROM entities WHERE oid='$VERIFY_OID'" "$PROD_DB" 2>/dev/null || echo 0)
if [ "$PC_PROD" != "1" ]; then
  echo "ERROR Permacultura Cantabria ($VERIFY_OID) no aparece en prod vía túnel."
  echo "      Algo raro con el túnel o el usuario. Abortando."
  exit 1
fi
echo "OK   Túnel y Permacultura Cantabria verificados en prod."

# ── Dump ──────────────────────────────────────────────────────────
echo ""
echo "[1/4] mysqldump prod -> $DUMP_FILE"
echo "      ~288k entities + enrichment. Esperar 5-15 min."

IGNORE_ARGS=()
for t in "${EXCLUDE_TABLES[@]}"; do
  IGNORE_ARGS+=( "--ignore-table=${PROD_DB}.${t}" )
done

MYSQL_PWD="$CLAUDE_RO_PASS" mysqldump \
  -h "$TUNNEL_HOST" -P "$TUNNEL_PORT" -u "$PROD_USER" \
  --single-transaction --quick --skip-lock-tables \
  --no-tablespaces --skip-triggers --skip-routines --skip-events \
  --hex-blob --default-character-set=utf8mb4 \
  "${IGNORE_ARGS[@]}" \
  "$PROD_DB" \
  | gzip > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "      Tamaño dump: $DUMP_SIZE"

# ── Recreate local DB ─────────────────────────────────────────────
echo ""
echo "[2/4] DROP+CREATE $LOCAL_DB en Laragon..."
mysql -h "$LOCAL_HOST" -u "$LOCAL_USER" -e \
  "DROP DATABASE IF EXISTS \`$LOCAL_DB\`; CREATE DATABASE \`$LOCAL_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# ── Import ────────────────────────────────────────────────────────
echo ""
echo "[3/4] importando dump a Laragon..."
gunzip -c "$DUMP_FILE" | mysql -h "$LOCAL_HOST" -u "$LOCAL_USER" --default-character-set=utf8mb4 "$LOCAL_DB"

# ── Verify ────────────────────────────────────────────────────────
echo ""
echo "[4/4] verificando..."

ENT_COUNT=$(mysql -h "$LOCAL_HOST" -u "$LOCAL_USER" "$LOCAL_DB" -Nse "SELECT COUNT(*) FROM entities" 2>/dev/null || echo 0)
ENR_COUNT=$(mysql -h "$LOCAL_HOST" -u "$LOCAL_USER" "$LOCAL_DB" -Nse "SELECT COUNT(*) FROM entity_enrichment" 2>/dev/null || echo 0)
PC_FOUND=$(mysql -h "$LOCAL_HOST" -u "$LOCAL_USER" "$LOCAL_DB" -Nse "SELECT COUNT(*) FROM entities WHERE oid='$VERIFY_OID'" 2>/dev/null || echo 0)
PC_NAME=$(mysql -h "$LOCAL_HOST" -u "$LOCAL_USER" "$LOCAL_DB" -Nse "SELECT legal_name FROM entities WHERE oid='$VERIFY_OID'" 2>/dev/null || echo "")

echo "      entities:           $ENT_COUNT"
echo "      entity_enrichment:  $ENR_COUNT"

if [ "$PC_FOUND" != "1" ]; then
  echo "      ERROR Permacultura Cantabria ($VERIFY_OID) NO está en el import."
  exit 1
fi

echo "      OK   Permacultura Cantabria presente: $PC_NAME"
echo ""
echo "Sync completo. Dump conservado en: $DUMP_FILE"
echo ""
echo "Tablas excluidas (no clonadas de prod):"
for t in "${EXCLUDE_TABLES[@]}"; do echo "  - $t"; done
echo ""
echo "Si necesitas users/auth para test local, corre:"
echo "  node scripts/seed-local-admin.js"
