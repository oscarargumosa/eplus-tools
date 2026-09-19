#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Trae a esta copia de trabajo los datos que el refresco diario deja en
# /opt/eplus-tools-cron.
#
# Por qué hace falta: el refresco (eplus-data-refresh.timer, 04:04) escribe
# en /opt/eplus-tools-cron y commitea a la rama `data-auto`, que no despliega
# nadie. La app sirve los ficheros de SU checkout, así que sin esto se queda
# con los datos del último deploy. Ya ha mordido dos veces: el catálogo de
# convocatorias llevaba desde junio y las movilidades desde mayo, con los 76
# cursos caducados y la pestaña vacía.
#
#     ./scripts/sync-datos-cron.sh          # copia y avisa
#     ./scripts/sync-datos-cron.sh --ver    # solo mira, no toca nada
#
# Esto es un parche. La solución de fondo es sacar estos ficheros del repo a
# /data/eplus-shared —como ya están call_vectors y call_structured— y montarlos
# en el contenedor, para que el cron los actualice sin desplegar.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

ORIGEN=/opt/eplus-tools-cron/data
DESTINO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data"
SOLO_VER="${1:-}"

# Solo lo que el refresco regenera de verdad. El resto de data/ son ficheros
# estáticos del repo y no deben pisarse.
FICHEROS=(
  funding_unified.json
  funding_unified.meta.json
  salto/trainings.json
  salto/trainings.csv
  bdns/_meta.json
  calls/_meta.json
)

[ -d "$ORIGEN" ] || { echo "No existe $ORIGEN — ¿se ha movido el checkout del cron?"; exit 1; }

cambios=0
for f in "${FICHEROS[@]}"; do
  [ -f "$ORIGEN/$f" ] || { echo "  — $f no está en el origen, se salta"; continue; }
  if [ ! -f "$DESTINO/$f" ] || ! cmp -s "$ORIGEN/$f" "$DESTINO/$f"; then
    a=$([ -f "$DESTINO/$f" ] && date -r "$DESTINO/$f" +%Y-%m-%d || echo "no estaba")
    b=$(date -r "$ORIGEN/$f" +%Y-%m-%d)
    printf "  %-30s %s → %s\n" "$f" "$a" "$b"
    if [ "$SOLO_VER" != "--ver" ]; then
      mkdir -p "$DESTINO/$(dirname "$f")"
      cp "$ORIGEN/$f" "$DESTINO/$f"
    fi
    cambios=$((cambios + 1))
  fi
done

if [ "$cambios" -eq 0 ]; then
  echo "Todo al día."
elif [ "$SOLO_VER" = "--ver" ]; then
  echo
  echo "$cambios fichero(s) por actualizar. Lanza el script sin --ver para copiarlos."
else
  echo
  echo "$cambios fichero(s) actualizados. Reinicia para que la app los lea:"
  echo "    systemctl restart eplus-dev"
fi
