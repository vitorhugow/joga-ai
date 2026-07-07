#!/usr/bin/env bash
# Adiciona domínios ao Firebase Auth (Authorized domains).
# Uso: ./scripts/add-firebase-auth-domain.sh jogaai.pt www.jogaai.pt
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-joga-ai-f7622}"
API_KEY="${VITE_FIREBASE_API_KEY:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/artifacts/joga-ai/.env.local}"

if [[ -z "$API_KEY" && -f "$ENV_FILE" ]]; then
  API_KEY="$(grep -E '^VITE_FIREBASE_API_KEY=' "$ENV_FILE" | cut -d= -f2-)"
fi

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 dominio [dominio2 ...]"
  echo "Exemplo: $0 jogaai.pt www.jogaai.pt"
  exit 1
fi

if [[ -z "$API_KEY" ]]; then
  echo "Define VITE_FIREBASE_API_KEY ou artifacts/joga-ai/.env.local"
  exit 1
fi

echo "==> Domínios autorizados actuais ($PROJECT):"
CURRENT=$(curl -s "https://identitytoolkit.googleapis.com/v1/projects?key=${API_KEY}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for x in d.get('authorizedDomains',[]): print(x)
")
echo "$CURRENT"
echo ""

NEW_DOMAINS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && NEW_DOMAINS+=("$line")
done <<< "$CURRENT"

for d in "$@"; do
  host="${d#https://}"
  host="${host#http://}"
  host="${host%%/*}"
  if printf '%s\n' "${NEW_DOMAINS[@]}" | grep -qx "$host"; then
    echo "✓ $host já está na lista"
  else
    NEW_DOMAINS+=("$host")
    echo "+ a adicionar: $host"
  fi
done

echo ""
echo "Para adicionar manualmente (a API pública não permite PATCH):"
echo "  https://console.firebase.google.com/project/${PROJECT}/authentication/settings"
echo ""
echo "Domínios que DEVEM estar na lista:"
printf '  - %s\n' "${NEW_DOMAINS[@]}"
