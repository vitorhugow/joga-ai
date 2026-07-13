#!/usr/bin/env bash
# Copia fotos de fields/ (raiz do repo) para public/fields/ e src/assets/fields/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fields"
DEST_PUBLIC="$ROOT/artifacts/joga-ai/public/fields"
DEST_ASSETS="$ROOT/artifacts/joga-ai/src/assets/fields"
mkdir -p "$DEST_PUBLIC" "$DEST_ASSETS"
for f in field-futsal.webp field-f5.webp field-f7.webp; do
  if [[ ! -f "$SRC/$f" ]]; then
    echo "Falta: $SRC/$f"
    exit 1
  fi
  cp "$SRC/$f" "$DEST_PUBLIC/$f"
  cp "$SRC/$f" "$DEST_ASSETS/$f"
  echo "OK $f ($(wc -c < "$DEST_PUBLIC/$f") bytes)"
done
