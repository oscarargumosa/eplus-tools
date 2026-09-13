#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# EU Funding Studio — monta la instancia DEV del VPS
#
#   ./scripts/setup-dev-vps.sh clon     → BD eplus_tools_dev = copia de la live
#   ./scripts/setup-dev-vps.sh limpia   → BD eplus_tools_dev vacía + migraciones
#
# No toca producción en ningún caso: solo lee de eplus_tools.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

MODO="${1:-}"
[[ "$MODO" == "clon" || "$MODO" == "limpia" ]] || { echo "Uso: $0 clon|limpia"; exit 1; }

cd /opt/eplus-tools-dev
DB_PASS=$(grep -m1 '^DB_PASS=' .env | cut -d= -f2-)
MY="mysql -h 127.0.0.1 -P 3306 -u root -p${DB_PASS}"

echo "▸ Creando BD eplus_tools_dev…"
$MY -e "CREATE DATABASE IF NOT EXISTS eplus_tools_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if [[ "$MODO" == "clon" ]]; then
  echo "▸ Volcando la live (eplus_tools, ~692 MB) — puede tardar varios minutos…"
  mysqldump -h 127.0.0.1 -P 3306 -u root -p"${DB_PASS}" \
    --single-transaction --quick --routines --triggers --no-tablespaces \
    eplus_tools | $MY eplus_tools_dev
  echo "▸ Clon terminado."
else
  echo "▸ Aplicando migraciones sobre BD vacía…"
  npm run migrate
fi

echo "▸ Tablas en dev: $($MY -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='eplus_tools_dev';")"

echo "▸ Arrancando el servicio…"
systemctl enable --now eplus-dev
sleep 3
systemctl --no-pager --lines=5 status eplus-dev || true
curl -s -o /dev/null -w "▸ localhost:3013 responde %{http_code}\n" http://127.0.0.1:3013/ || true

cat <<'FIN'

Falta lo que depende del DNS (dev.eufundingschool.com A 91.98.145.106):
  mv /etc/nginx/conf.d/dev.eufundingschool.com.conf.pendiente-dns \
     /etc/nginx/conf.d/dev.eufundingschool.com.conf
  nginx -t && systemctl reload nginx
  certbot --nginx -d dev.eufundingschool.com
FIN
