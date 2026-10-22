#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null 2>&1; then
  echo "Falta gh." >&2
  exit 1
fi

GH_TOKEN="$(gh auth token)"
export GH_TOKEN

git -c credential.helper='!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f' \
  push origin HEAD:main
