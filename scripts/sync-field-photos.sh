#!/usr/bin/env bash
# Sincroniza fotos de fields/ (raiz) → public/fields/ antes do build.
# A app lê sempre de /fields/ — podes editar public/fields/ directamente ou usar fields/ na raiz.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fields"
DEST="$ROOT/artifacts/joga-ai/public/fields"
mkdir -p "$DEST"
for f in field-futsal.webp field-f5.webp field-f7.webp; do
  if [[ -f "$SRC/$f" ]]; then
    cp "$SRC/$f" "$DEST/$f"
    echo "OK $f ← fields/ ($(wc -c < "$DEST/$f") bytes)"
  elif [[ -f "$DEST/$f" ]]; then
    echo "OK $f (já em public/fields/, $(wc -c < "$DEST/$f") bytes)"
  else
    echo "Falta: $f (coloca em fields/ ou artifacts/joga-ai/public/fields/)"
    exit 1
  fi
done
