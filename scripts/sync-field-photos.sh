#!/usr/bin/env bash
# Sincroniza fotos → public/fields/ como thumbnails quadradas 512×512.
# Fonte: fields/ (raiz) ou, se não existir, public/fields/ já existente.
# A app lê /fields/*.webp — substitui os 3 ficheiros e faz commit + push.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fields"
DEST="$ROOT/artifacts/joga-ai/public/fields"
mkdir -p "$DEST"

to_square() {
  local input="$1"
  local output="$2"
  if command -v ffmpeg >/dev/null 2>&1; then
    ffmpeg -y -loglevel error -i "$input" \
      -vf "crop=min(iw\,ih):min(iw\,ih),scale=512:512" \
      -compression_level 6 "$output"
  else
    cp "$input" "$output"
  fi
}

for f in field-futsal.webp field-f5.webp field-f7.webp; do
  if [[ -f "$SRC/$f" ]]; then
    INPUT="$SRC/$f"
    SRC_LABEL="fields/"
  elif [[ -f "$DEST/$f" ]]; then
    INPUT="$DEST/$f"
    SRC_LABEL="public/fields/ (existente)"
  else
    echo "Falta: $f — coloca em fields/ ou artifacts/joga-ai/public/fields/"
    exit 1
  fi
  TMP="$(mktemp --suffix=.webp)"
  to_square "$INPUT" "$TMP"
  mv "$TMP" "$DEST/$f"
  echo "OK $f ← $SRC_LABEL, 512×512 ($(wc -c < "$DEST/$f") bytes)"
done
