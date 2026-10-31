#!/usr/bin/env bash
# Mide la pagina real (Apps Script) desde el telefono: latencia por endpoint
# publico y peso del HTML. No escribe datos: usa un mail que no esta en la
# lista y funciones sin efectos.
#
# uso:
#   bash scripts/perf-live.sh <url/exec> [repeticiones]
#   ESI_EXEC_URL=<url/exec> bash scripts/perf-live.sh
#
# Cada corrida agrega una linea al log para comparar antes/despues.
set -u

EXEC="${1:-${ESI_EXEC_URL:-}}"
N="${2:-5}"
if [ -z "$EXEC" ]; then
  echo "uso: bash scripts/perf-live.sh <url/exec> [repeticiones]" >&2
  exit 1
fi
OUT="${TMPDIR:-/data/data/com.termux/files/usr/tmp}/esi-perf.log"
TMP="$(mktemp -d)"

stats() {
  sort -n | awk '{a[NR]=$1} END {
    if (NR == 0) { print "-"; exit }
    p50 = a[int((NR + 1) / 2)]
    printf "p50 %6.2fs  max %6.2fs\n", p50, a[NR]
  }'
}

echo "== $(date '+%Y-%m-%d %H:%M:%S') =="
echo "url: $EXEC"

# 1) HTML del panel: latencia y peso comprimido (lo que baja un celular).
for i in $(seq "$N"); do
  curl -sL --compressed -o /dev/null -m 60 \
    -w "%{time_starttransfer}\n" "$EXEC" >> "$TMP/html"
done
SIZE=$(curl -sL --compressed -o /dev/null -m 60 -w "%{size_download}" "$EXEC")
printf "%-22s %s   (%s KB gzip)\n" "html" "$(stats < "$TMP/html")" "$((SIZE / 1024))"

# 2) Endpoints publicos sin efectos.
probe() {
  local name="$1" fn="$2" args="$3"
  local f="$TMP/$name"
  : > "$f"
  for i in $(seq "$N"); do
    curl -sL -o /dev/null -m 60 -w "%{time_starttransfer}\n" \
      "$EXEC?fn=$fn&args=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$args")&callback=t" >> "$f"
  done
  printf "%-22s %s\n" "$name" "$(stats < "$f")"
}

probe "apiBootstrap" "apiBootstrap" "[]"
probe "apiLookup (sin lista)" "apiLookup" '["nadie@secundariosalsipuedes.edu.ar"]'

echo "log: $OUT"
{
  echo "$(date '+%Y-%m-%d %H:%M:%S') html $(stats < "$TMP/html") size=$((SIZE / 1024))KB"
  echo "$(date '+%Y-%m-%d %H:%M:%S') bootstrap $(stats < "$TMP/apiBootstrap")"
  echo "$(date '+%Y-%m-%d %H:%M:%S') lookup $(stats < "$TMP/apiLookup (sin lista)")"
} >> "$OUT"
rm -rf "$TMP"
