#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null 2>&1; then
  echo "Falta gh." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Hay cambios sin commitear: se probaria una cosa y se publicaria otra." >&2
  exit 1
fi

origin_url="$(git remote get-url origin)"
case "$origin_url" in
  *esi-inscripcion-demo*) ;;
  *)
    echo "origin inesperado: $origin_url" >&2
    exit 1
    ;;
esac

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  node tests/esi-tests.js src
  node tests/ui-smoke.js src
  cmp src/Panel.html index.html
else
  echo "AVISO: SKIP_TESTS=1, no se corrieron tests ni se comparo index.html." >&2
fi

GH_TOKEN="$(gh auth token)"
export GH_TOKEN

git -c credential.helper='!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f' \
  push origin HEAD:main
