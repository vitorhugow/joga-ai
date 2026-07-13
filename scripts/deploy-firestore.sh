#!/usr/bin/env bash
# Publica regras e índices Firestore do projeto joga-ai-f7622.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/artifacts/joga-ai"

if [[ -n "${FIREBASE_TOKEN:-}" ]]; then
  pnpm exec firebase deploy --only firestore:rules,firestore:indexes,storage --non-interactive --token "$FIREBASE_TOKEN"
elif command -v firebase >/dev/null 2>&1; then
  firebase deploy --only firestore:rules,firestore:indexes,storage
else
  pnpm exec firebase deploy --only firestore:rules,firestore:indexes,storage
fi

echo "✓ Firestore + Storage rules publicados em joga-ai-f7622"
