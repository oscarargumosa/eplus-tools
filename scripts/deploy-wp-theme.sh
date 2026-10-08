#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  scripts/deploy-wp-theme.sh
#
#  Despliegue manual one-shot del child theme `astra-eufunding`
#  a producción. Úsalo para arreglar HOY el WP de prod sin esperar
#  al GitHub Actions, o si el workflow falla.
#
#  Uso:
#    1. Edita las 4 variables de abajo (o expórtalas como env vars)
#    2. Ejecuta:  bash scripts/deploy-wp-theme.sh
#
#  Para despliegues automáticos en cada push: ver
#  .github/workflows/wp-theme-deploy.yml — montado para no tener
#  que volver a usar este script salvo emergencia.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuración (rellena estas 4 variables) ───────────────────
WP_SSH_HOST="${WP_SSH_HOST:-}"               # IP o dominio del server (ver nota interna del VPS)
WP_SSH_USER="${WP_SSH_USER:-root}"            # usuario SSH
WP_SSH_PORT="${WP_SSH_PORT:-22}"              # puerto
WP_THEME_PATH="${WP_THEME_PATH:-}"            # ruta absoluta del theme en prod
# ej: /var/lib/docker/volumes/<vol>/_data/themes/astra-eufunding
# ej: /home/coolify/applications/<wp-app-uuid>/wp-content/themes/astra-eufunding

# ── Validación ────────────────────────────────────────────────
if [[ -z "$WP_SSH_HOST" ]]; then
  echo "ERROR: WP_SSH_HOST no está definido (IP o dominio del server: ver nota interna del VPS)."
  exit 1
fi
if [[ -z "$WP_THEME_PATH" ]]; then
  echo "ERROR: WP_THEME_PATH no está definido."
  echo "Edita scripts/deploy-wp-theme.sh o exporta WP_THEME_PATH antes de correr."
  exit 1
fi

# ── Source local ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/../web/wordpress/astra-eufunding/"

if [[ ! -d "$SOURCE" ]]; then
  echo "ERROR: no se encuentra el theme en $SOURCE"
  exit 1
fi

# ── Confirmación interactiva ──────────────────────────────────
echo "─────────────────────────────────────────────"
echo "  Source:  $SOURCE"
echo "  Target:  $WP_SSH_USER@$WP_SSH_HOST:$WP_THEME_PATH"
echo "  SSH key: ~/.ssh/id_* o ~/.ssh/config"
echo "─────────────────────────────────────────────"
read -r -p "¿Continuar con rsync --delete? (yes/no): " ans
[[ "$ans" == "yes" ]] || { echo "Cancelado."; exit 0; }

# ── Rsync ─────────────────────────────────────────────────────
rsync -avz --delete \
  -e "ssh -p $WP_SSH_PORT" \
  --exclude '.git' \
  "$SOURCE" \
  "$WP_SSH_USER@$WP_SSH_HOST:$WP_THEME_PATH/"

echo ""
echo "✓ Theme desplegado. Ctrl+F5 en eufundingschool.com para ver el topbar."
