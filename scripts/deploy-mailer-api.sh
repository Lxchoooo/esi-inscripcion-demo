#!/bin/sh
# Actualiza el proyecto de Apps Script del robot de mails (cuenta esi@) usando
# la Apps Script API, sin abrir el editor ni copiar/pegar nada.
#
# Uso:
#   ESI_REFRESH_TOKEN=... ESI_SCRIPT_ID=... sh scripts/deploy-mailer-api.sh
#
# El refresh token sale del OAuth Playground con el scope
# https://www.googleapis.com/auth/script.projects. Se refresca por el proxy del
# Playground (el mismo que usa el poller), así no hace falta client secret.
#
# Requiere curl y jq. Nunca imprime el token.
set -eu

SRC="${1:-tools/mailer/esi-mailer.gs}"
: "${ESI_REFRESH_TOKEN:?falta ESI_REFRESH_TOKEN}"
: "${ESI_SCRIPT_ID:?falta ESI_SCRIPT_ID}"
[ -f "$SRC" ] || { echo "no existe $SRC" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "falta curl" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "falta jq" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Access token de corta duración (1 h), sin secreto de cliente.
PEDIDO="$(jq -nc --arg t 'https://oauth2.googleapis.com/token' --arg r "$ESI_REFRESH_TOKEN" \
  '{token_uri:$t, refresh_token:$r}')"
RESP="$(curl -sSL -X POST 'https://developers.google.com/oauthplayground/refreshAccessToken' \
  -H 'Content-Type: application/json' --data "$PEDIDO")" || {
  echo "No se pudo hablar con el proxy del Playground (red o DNS)." >&2
  exit 1
}
TOKEN="$(printf '%s' "$RESP" | jq -r '.access_token // empty' 2>/dev/null || true)"
if [ -z "$TOKEN" ]; then
  MOTIVO="$(printf '%s' "$RESP" | jq -r '.error // .error_description // empty' 2>/dev/null || true)"
  echo "No se pudo refrescar el token${MOTIVO:+: $MOTIVO}. Revisá que sea de esi@ y tenga el scope script.projects." >&2
  exit 1
fi

# 2. Contenido actual del proyecto.
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://script.googleapis.com/v1/projects/$ESI_SCRIPT_ID/content" -o "$TMP/actual.json"

# 3. Reemplaza el único archivo de código y conserva el manifiesto y cualquier
#    otro archivo (HTML/JSON). La API devuelve los .gs sin extensión (por
#    ejemplo "Código"), así que se filtra por tipo SERVER_JS. Si hubiera dos,
#    frena: mejor no adivinar cuál es el robot.
jq --rawfile src "$SRC" '
  ([.files[] | select(.type=="SERVER_JS")] | length) as $n
  | if $n != 1 then error("el proyecto debe tener exactamente un archivo SERVER_JS (tiene \($n))") else . end
  | {files: [.files[] | {name, type, source: (if .type=="SERVER_JS" then $src else .source end)}]}
' "$TMP/actual.json" > "$TMP/nuevo.json"

# 4. Guarda. El trigger de cada minuto ejecuta el contenido nuevo sin redeploy:
#    los triggers de Apps Script corren el HEAD del proyecto.
curl -fsS -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @"$TMP/nuevo.json" \
  "https://script.googleapis.com/v1/projects/$ESI_SCRIPT_ID/content" -o "$TMP/ok.json"

jq -r '"robot actualizado en esi@: " + ([.files[] | select(.type=="SERVER_JS") | .name] | join(", "))' "$TMP/ok.json"
