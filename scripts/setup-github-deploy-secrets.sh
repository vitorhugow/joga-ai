#!/usr/bin/env bash
# Configura secrets do GitHub Actions para deploy automático (Cloudflare + Firebase).
# Corre UMA VEZ no teu Mac, com gh autenticado: gh auth login
#
# Uso:
#   chmod +x scripts/setup-github-deploy-secrets.sh
#   ./scripts/setup-github-deploy-secrets.sh

set -euo pipefail

REPO="${GITHUB_REPO:-vitorhugow/joga-ai}"
ENV_FILE="${ENV_FILE:-artifacts/joga-ai/.env.local}"

echo "==> Joga AI — configurar deploy automático"
echo "    Repositório: $REPO"
echo ""

if ! command -v gh >/dev/null 2>&1; then
  echo "Instala o GitHub CLI: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Faz login: gh auth login"
  exit 1
fi

read_env() {
  local key="$1"
  if [[ -f "$ENV_FILE" ]]; then
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
  fi
}

prompt_secret() {
  local name="$1"
  local hint="$2"
  local current="${3:-}"
  local value=""

  if [[ -n "$current" ]]; then
    read -r -p "$name [$hint] (Enter = usar .env.local): " value
    value="${value:-$current}"
  else
    read -r -p "$name [$hint]: " value
  fi

  if [[ -z "$value" ]]; then
    echo "  ⚠️  $name em branco — a saltar"
    return 1
  fi

  echo "$value"
}

set_gh_secret() {
  local name="$1"
  local value="$2"
  echo "$value" | gh secret set "$name" --repo "$REPO"
  echo "  ✓ $name"
}

echo "── Firebase (build Vite) ──"
VITE_FIREBASE_API_KEY="$(read_env VITE_FIREBASE_API_KEY)"
VITE_FIREBASE_AUTH_DOMAIN="$(read_env VITE_FIREBASE_AUTH_DOMAIN)"
VITE_FIREBASE_PROJECT_ID="$(read_env VITE_FIREBASE_PROJECT_ID)"
VITE_FIREBASE_STORAGE_BUCKET="$(read_env VITE_FIREBASE_STORAGE_BUCKET)"
VITE_FIREBASE_MESSAGING_SENDER_ID="$(read_env VITE_FIREBASE_MESSAGING_SENDER_ID)"
VITE_FIREBASE_APP_ID="$(read_env VITE_FIREBASE_APP_ID)"
VITE_FIREBASE_MEASUREMENT_ID="$(read_env VITE_FIREBASE_MEASUREMENT_ID)"

for key in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID \
  VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID \
  VITE_FIREBASE_MEASUREMENT_ID; do
  val="$(prompt_secret "$key" "ver .env.local" "${!key:-}")" && set_gh_secret "$key" "$val" || true
done

echo ""
echo "── Cloudflare Pages ──"
echo "Cria token em: https://dash.cloudflare.com/profile/api-tokens"
echo "Template: Edit Cloudflare Workers + Pages:Edit"
echo "Account ID: dash.cloudflare.com → Workers & Pages → URL ou Overview"
echo ""

CF_TOKEN="$(prompt_secret "CLOUDFLARE_API_TOKEN" "token API" "")" && set_gh_secret "CLOUDFLARE_API_TOKEN" "$CF_TOKEN" || true
CF_ACCOUNT="$(prompt_secret "CLOUDFLARE_ACCOUNT_ID" "32 chars" "")" && set_gh_secret "CLOUDFLARE_ACCOUNT_ID" "$CF_ACCOUNT" || true

echo ""
echo "── Firebase CLI (regras + índices Firestore) ──"
echo "No terminal:"
echo "  cd artifacts/joga-ai && npx firebase-tools login:ci"
echo "Copia o token gerado."
echo ""

FB_TOKEN="$(prompt_secret "FIREBASE_TOKEN" "token login:ci" "")" && set_gh_secret "FIREBASE_TOKEN" "$FB_TOKEN" || true

echo ""
echo "==> Concluído!"
echo ""
echo "Próximo passo — publicar já:"
echo "  gh workflow run deploy.yml --repo $REPO"
echo ""
echo "Ou faz push para main — o workflow corre automaticamente."
echo "Site: https://joga-ai.pages.dev"
