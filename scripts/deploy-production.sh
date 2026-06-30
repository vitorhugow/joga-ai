#!/usr/bin/env bash
# Deploy completo: build + Cloudflare Pages + Firestore.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Build"
pnpm install
pnpm --filter @workspace/joga-ai run build

echo "==> Cloudflare Pages"
cd artifacts/joga-ai
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN não definido — salta Pages (usa integração Git ou define o token)."
else
  pnpm exec wrangler pages deploy dist/public --project-name=joga-ai --branch=main
fi

echo "==> Firestore"
"$ROOT/scripts/deploy-firestore.sh"

echo "✓ Deploy completo — https://joga-ai.pages.dev"
