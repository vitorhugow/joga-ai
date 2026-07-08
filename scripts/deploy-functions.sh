#!/usr/bin/env bash
# Cloud Functions — NÃO deploy local. Usa só o CI.
set -euo pipefail

cat <<'EOF'
⚠️  Cloud Functions não se fazem deploy a partir do Mac.

Motivo: deploy local em paralelo com o GitHub Actions causa erros 409 no Cloud Run.

Usa uma destas opções:
  • Push para main com alterações em artifacts/joga-ai/functions/**
  • gh workflow run deploy-functions.yml --repo vitorhugow/joga-ai

EOF
exit 1
