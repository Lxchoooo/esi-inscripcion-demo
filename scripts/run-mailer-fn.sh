#!/bin/sh
# Ejecuta una función del proyecto de Apps Script del robot (cuenta esi@) sin
# abrir el editor, usando la Apps Script API.
#
# Uso:
#   ESI_REFRESH_TOKEN=... ESI_SCRIPT_ID=... sh scripts/run-mailer-fn.sh <funcion> [params-json]
#
# Ejemplo:
#   sh scripts/run-mailer-fn.sh diagnosticoCierre
#   sh scripts/run-mailer-fn.sh encolarCierrePrueba
#
# Necesita un refresh token de esi@ con permiso para ejecutar funciones
# (scope https://www.googleapis.com/auth/script.scriptapp). Si el token solo
# tiene script.projects, Google contesta 403 y hay que correr la función a
# mano en script.google.com.
#
# Requiere curl y jq. Nunca imprime el token.
set -eu

FN="${1:-${FN:-diagnosticoCierre}}"
PARAMS="${2:-${PARAMS:-[]}}"
: "${ESI_REFRESH_TOKEN:?falta ESI_REFRESH_TOKEN}"
: "${ESI_SCRIPT_ID:?falta ESI_SCRIPT_ID}"
command -v curl >/dev/null 2>&1 || { echo "falta curl" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "falta jq" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

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
  echo "No se pudo refrescar el token${MOTIVO:+: $MOTIVO}." >&2
  exit 1
fi

CUERPO="$(jq -nc --arg fn "$FN" --argjson p "$PARAMS" '{function:$fn, parameters:$p, devMode:true}')"
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary "$CUERPO" \
  "https://script.googleapis.com/v1/scripts/$ESI_SCRIPT_ID:run" -o "$TMP/run.json" || {
  echo "Fallo la llamada a scripts.run." >&2
  exit 1
}

if jq -e '.error' "$TMP/run.json" >/dev/null 2>&1; then
  echo "scripts.run devolvió error:" >&2
  jq -r '.error | "  code: \(.code)\n  status: \(.status)\n  message: \(.message)"' "$TMP/run.json" >&2
  exit 1
fi

# El resultado de la función viene dentro de response.result (y el log de la
# ejecución, si Apps Script lo devuelve, en response.@type + response.result).
jq -r '.response.result // .response // .' "$TMP/run.json"
echo "ejecutado: $FN"
