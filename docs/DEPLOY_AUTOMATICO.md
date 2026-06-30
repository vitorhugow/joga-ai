# Deploy automático completo

Deploy em cada push para `main` via GitHub Actions (`.github/workflows/deploy.yml`).

## Configuração única (5 minutos)

No **teu Mac**, na raiz do repositório:

```bash
chmod +x scripts/setup-github-deploy-secrets.sh
./scripts/setup-github-deploy-secrets.sh
```

O script pede:
1. Variáveis `VITE_FIREBASE_*` (lê de `artifacts/joga-ai/.env.local` se existir)
2. Token Cloudflare (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`)
3. Token Firebase (`firebase login:ci` → `FIREBASE_TOKEN`)

Depois dispara o deploy:

```bash
gh workflow run deploy.yml --repo vitorhugow/joga-ai
```

## Publicar só Firestore (regras + índices)

Se só mudaste `firestore.rules` ou `firestore.indexes.json`:

```bash
./scripts/deploy-firestore.sh
```

Ou com token CI:

```bash
FIREBASE_TOKEN=xxx ./scripts/deploy-firestore.sh
```

## O que o workflow faz

| Passo | Secret necessário |
|-------|-------------------|
| Build frontend | `VITE_FIREBASE_*` |
| Cloudflare Pages | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Firestore rules + indexes | `FIREBASE_TOKEN` |

Se um secret faltar, esse passo é saltado (com aviso no summary do Actions).

## URLs

- Site: https://joga-ai.pages.dev
- Firebase: https://console.firebase.google.com/project/joga-ai-f7622
- Actions: https://github.com/vitorhugow/joga-ai/actions/workflows/deploy.yml

## Memória do agente

A regra `.cursor/rules/auto-deploy-on-change.mdc` instrui o agente a:
- Fazer deploy após alterações relevantes
- Lembrar de publicar Firestore quando `firestore.rules` mudar
- Indicar ao utilizador o script de secrets se o deploy automático falhar
