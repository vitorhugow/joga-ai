#!/usr/bin/env bash
# Copia fotos de fields/ (raiz do repo) para public/fields/ da app.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fields"
DEST="$ROOT/artifacts/joga-ai/public/fields"
mkdir -p "$DEST"
for f in field-futsal.webp field-f5.webp field-f7.webp; do
  if [[ ! -f "$SRC/$f" ]]; then
    echo "Falta: $SRC/$f"
    exit 1
  fi
  cp "$SRC/$f" "$DEST/$f"
  echo "OK $f ($(wc -c < "$DEST/$f") bytes)"
done
