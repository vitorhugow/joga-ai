# Publicar o Joga AI no Cloudflare Pages (grátis)

Frontend estático (Vite + React) no **Cloudflare Pages**. Backend continua no **Firebase** (Auth + Firestore) — já configurado no projeto `joga-ai-f7622`.

---

## O que vais ter no fim

| Peça | Onde |
|------|------|
| Site público | `https://joga-ai.pages.dev` (ou domínio próprio) |
| Login / dados | Firebase (mesmo projeto de sempre) |
| Regras Firestore | Já publicadas (`firebase deploy --only firestore:rules`) |
| Custo | **Grátis** no plano Free do Cloudflare Pages |

---

## Antes de começar

1. Conta em [cloudflare.com](https://dash.cloudflare.com/sign-up) (grátis)
2. Código no **GitHub** (recomendado) — ou deploy manual com Wrangler
3. Variáveis `VITE_FIREBASE_*` (copia do teu `.env.local`)

**Nunca** commits o `.env.local` — só defines as variáveis no painel do Cloudflare.

---

## Opção A — GitHub + Cloudflare (recomendado)

Deploy automático a cada push na branch `main`.

### A1. Subir o código para o GitHub

No Terminal, na pasta **raiz** do monorepo (`joga-ai-modern-card-v5`):

```bash
cd /Users/vitorhugow/Desktop/joga-ai-recuperado/joga-ai-modern-card-v5
git init
git add .
git commit -m "Preparar deploy Cloudflare Pages"
```

Cria um repositório vazio no GitHub e liga:

```bash
git remote add origin https://github.com/TEU_USER/joga-ai.git
git branch -M main
git push -u origin main
```

### A2. Criar projeto no Cloudflare Pages

1. Abre [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
2. **Create** → **Pages** → **Connect to Git**
3. Autoriza o GitHub e escolhe o repositório
4. Configura o build:

| Campo | Valor |
|-------|--------|
| **Production branch** | `main` |
| **Framework preset** | None |
| **Build command** | `pnpm install && pnpm --filter @workspace/joga-ai run build` |
| **Build output directory** | `artifacts/joga-ai/dist/public` |
| **Root directory** | *(deixa vazio — raiz do repo)* |

5. **Environment variables** (Production) — adiciona **todas**:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=joga-ai-f7622.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=joga-ai-f7622
VITE_FIREBASE_STORAGE_BUCKET=joga-ai-f7622.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

(Copia os valores do teu `.env.local`.)

6. **Save and Deploy**

O primeiro build demora ~2–5 minutos. Quando ficar verde, o site está em `https://NOME-DO-PROJETO.pages.dev`.

---

## Opção B — Deploy manual (sem GitHub)

Útil para testar rápido a partir do teu Mac.

### B1. Build local

```bash
cd /Users/vitorhugow/Desktop/joga-ai-recuperado/joga-ai-modern-card-v5
pnpm install
pnpm --filter @workspace/joga-ai run build
```

Confirma que existe a pasta `artifacts/joga-ai/dist/public` com `index.html`.

### B2. Login Cloudflare + publicar

```bash
cd artifacts/joga-ai
npx wrangler login
npx wrangler pages deploy dist/public --project-name=joga-ai
```

Na primeira vez o Wrangler pergunta se queres criar o projeto — confirma.

**Atenção:** deploy manual **não** injeta as variáveis `VITE_FIREBASE_*`. Para Firebase em produção, ou:

- defines as variáveis no dashboard (**Pages → joga-ai → Settings → Environment variables**) e fazes um deploy via Git (Opção A), ou
- crias um `.env.production` local só para build (não commitar) e corres `pnpm run build` antes do `wrangler pages deploy`.

---

## Depois do deploy — Firebase (obrigatório)

Sem isto, login Google/email pode falhar no domínio novo.

### 1. Domínios autorizados (Firebase Auth)

1. [Firebase Console](https://console.firebase.google.com/project/joga-ai-f7622/authentication/settings) → **Authentication** → **Settings** → **Authorized domains**
2. **Add domain**:
   - `joga-ai.pages.dev` (ou o subdomínio exacto que o Cloudflare te deu)
   - O teu domínio customizado, se tiveres (ex. `joga.ai`)

### 2. Google Sign-In (se usas login Google)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → credenciais OAuth do projeto Firebase
2. Em **Authorized JavaScript origins**, adiciona:
   - `https://joga-ai.pages.dev`
   - `https://teu-dominio.com` (se aplicável)

### 3. Testar

1. Abre o URL do Pages
2. `Cmd+Shift+R` (hard refresh)
3. Cria conta / login anónimo → monta carta → cria partida
4. Console do browser **sem** `permission-denied`

---

## Rotas da app (SPA)

O ficheiro `public/_redirects` envia todas as rotas (`/perfil`, `/partida/...`) para `index.html`. Sem isto, refrescar numa página dá 404.

---

## Domínio próprio (opcional)

Cloudflare Pages → teu projeto → **Custom domains** → segue o assistente.

Se o domínio já estiver na Cloudflare, é quase automático. Depois adiciona o domínio também no Firebase (passo acima).

---

## Comandos úteis

```bash
# Build de produção (raiz do monorepo)
pnpm install && pnpm --filter @workspace/joga-ai run build

# Deploy manual
cd artifacts/joga-ai && npx wrangler pages deploy dist/public --project-name=joga-ai

# Só regras Firestore (inalterado)
cd artifacts/joga-ai && firebase deploy --only firestore:rules
```

---

## Limites do plano grátis (resumo)

- Builds: 500/mês
- Bandwidth: generoso para MVP / testers
- Sem servidor Node — só ficheiros estáticos (perfeito para esta app)

Funcionalidades que **não** entram neste deploy (próximos passos, como combinaste):

- Recursos premium
- Pagamentos (Stripe, etc.)
- Notificações push no browser (Service Worker + backend)

---

## Problemas comuns

| Sintoma | Solução |
|--------|---------|
| Build falha `pnpm not found` | No Cloudflare: **Settings → Builds** → Node 20+ e comando com `pnpm install` |
| Página branca | Variáveis `VITE_FIREBASE_*` em falta no build |
| 404 ao refrescar `/perfil` | Confirma `_redirects` no build (`dist/public/_redirects`) |
| `auth/unauthorized-domain` | Adiciona `*.pages.dev` nos Authorized domains do Firebase |
| Google popup bloqueado | Origem OAuth no Google Cloud + domínio no Firebase |
| `permission-denied` Firestore | Rules + Auth (ver `FIRESTORE_DEPLOY.md`) |

---

## Ficheiros de deploy

```
joga-ai-modern-card-v5/
├── .node-version                    ← Node 20 para Cloudflare
└── artifacts/joga-ai/
    ├── public/_redirects            ← SPA no Pages
    ├── wrangler.toml                ← deploy manual opcional
    ├── dist/public/                 ← output do build (gerado)
    └── docs/CLOUDFLARE_PAGES_DEPLOY.md
```
