# Publicar Firestore e partilhar com testers — guia completo

Projeto Firebase: **joga-ai-f7622**  
Pasta do código: `artifacts/joga-ai` (dentro do teu projeto Cursor)

---

## Onde fazer cada coisa (resumo)

| O quê | Onde |
|-------|------|
| Comandos `firebase ...` | **Terminal** (app Terminal do Mac **ou** terminal integrado do Cursor) |
| Ver regras, Auth, base de dados | **Browser** → [Firebase Console](https://console.firebase.google.com/project/joga-ai-f7622) |
| Testar a app | **Browser** → `http://localhost:5173` (com `pnpm run dev` a correr) |
| Credenciais da app | Ficheiro `.env.local` no Cursor (já tens) |

**Não** editas regras à mão no site se usares o deploy — o ficheiro `firestore.rules` no código é a fonte da verdade.

---

## ✅ Regras já publicadas (se seguiste o assistente)

As regras do ficheiro `firestore.rules` foram enviadas para o projeto **joga-ai-f7622**.

Confirma no browser:

1. Abre: **https://console.firebase.google.com/project/joga-ai-f7622/firestore/rules**
2. Deves ver regras com `isSignedIn()`, `users/{userId}`, `matches/{matchId}`, etc.
3. **Não** deve estar só a regra aberta de teste (`allow read, write: if true` para sempre)

---

## PARTE A — Terminal: publicar regras (faz TU uma vez)

### A1. Abrir o Terminal

**Opção 1 — Terminal do Mac (recomendado)**

1. `Cmd + Espaço` → escreve **Terminal** → Enter  
2. Aparece uma janela preta/branca com texto tipo `vitorhugow@Mac ~ %`

**Opção 2 — Terminal dentro do Cursor**

1. Abre o projeto no Cursor  
2. Menu **Terminal** → **New Terminal** (ou `` Ctrl + ` ``)  
3. A barra em baixo do editor — é aqui que colas os comandos

### A2. Ir à pasta certa

Copia **tudo** e Enter:

```bash
cd /Users/vitorhugow/Desktop/joga-ai-recuperado/joga-ai-modern-card-v5/artifacts/joga-ai
```

**Como saber que estás no sítio certo:**

```bash
pwd
ls firestore.rules firebase.json
```

Deves ver os dois ficheiros listados.

### A3. Instalar Firebase CLI (só se `firebase` não existir)

```bash
npm install -g firebase-tools
firebase --version
```

(Já tens instalado se aparecer `15.x.x` ou similar.)

### A4. Login Google (só na primeira vez)

```bash
firebase login
```

- Abre o **Chrome/Safari** sozinho  
- Escolhe a conta Google do projeto **joga-ai**  
- Clica **Allow** / **Permitir**  
- Volta ao Terminal → `Success! Logged in as ...`

### A5. Ligar ao projeto (já existe `.firebaserc`)

O ficheiro `.firebaserc` já aponta para `joga-ai-f7622`. Confirma:

```bash
firebase use
```

Deve dizer: `Active Project: joga-ai-f7622`

Se não tiveres `.firebaserc`:

```bash
firebase use --add
```

→ escolhe **joga-ai-f7622** → alias **default**

### A6. Publicar as regras

```bash
firebase deploy --only firestore:rules
```

**Sucesso** = estas linhas no Terminal:

```
✔  cloud.firestore: rules file firestore.rules compiled successfully
✔  firestore: released rules firestore.rules to cloud.firestore
✔  Deploy complete!
```

**Cada vez que alterares `firestore.rules`**, repete só o A6.

---

## PARTE B — Browser: Firebase Console (checklist para testers)

Abre estes links **no Chrome** (conta Google do dono do projeto):

### B1. Regras do Firestore

**URL:** https://console.firebase.google.com/project/joga-ai-f7622/firestore/rules

- Separador **Regras** (Rules)  
- Texto deve bater certo com o ficheiro `firestore.rules` do repo  
- Se vires banner amarelo *"modo de teste"* / *"test mode"*: depois do deploy das rules do repo, esse modo deixa de ser a regra activa (as tuas rules substituem)

### B2. Authentication (obrigatório para a app)

**URL:** https://console.firebase.google.com/project/joga-ai-f7622/authentication/providers

Em **Sign-in method**, activa:

| Método | Estado |
|--------|--------|
| **Anonymous** | Enabled |
| **Email/Password** | Enabled |
| **Google** | Enabled (recomendado) |

Clica em cada um → toggle **Enable** → Save.

### B3. Firestore Database existe

**URL:** https://console.firebase.google.com/project/joga-ai-f7622/firestore

- Se pedir criar base de dados: escolhe região (ex. `europe-west1`)  
- Para testers com rules publicadas: modo **production** está OK — as rules do repo protegem

### B4. (Opcional) Ver utilizadores depois dos testes

**URL:** https://console.firebase.google.com/project/joga-ai-f7622/authentication/users

Aqui aparecem contas anónimas e email/Google quando as pessoas testam.

---

## PARTE C — Partilhar a app com outras pessoas

Hoje a app corre em **localhost** — só tu na mesma máquina/rede vês. Para **outras pessoas** precisas de URL pública.

### Opção 1 — Mesma Wi‑Fi (rápido, só casa/escritório)

1. No Terminal, na pasta `artifacts/joga-ai`:

```bash
PORT=5173 BASE_PATH=/ pnpm run dev
```

2. No Terminal, descobre o teu IP local:

```bash
ipconfig getifaddr en0
```

(ex.: `192.168.1.231`)

3. No telemóvel/PC dos testers (mesma Wi‑Fi), abrem:

```
http://192.168.1.231:5173
```

4. O teu Mac tem de estar ligado com o `pnpm run dev` a correr.

### Opção 2 — Internet (testers fora de casa)

**Recomendado:** [Cloudflare Pages](CLOUDFLARE_PAGES_DEPLOY.md) (grátis) — guia passo a passo em `docs/CLOUDFLARE_PAGES_DEPLOY.md`.

Alternativas: Firebase Hosting, Vercel, Netlify (liga ao repo GitHub).

O Firestore e Auth **já funcionam** na cloud — só falta hospedar o frontend com as variáveis `VITE_FIREBASE_*` no painel de deploy.

**Importante:** no `.env.local` as chaves Firebase são públicas no frontend (normal). A segurança vem das **rules** que já publicaste.

---

## PARTE D — Testar depois de publicar

1. Terminal → `pnpm run dev` na pasta `artifacts/joga-ai`  
2. Browser → http://localhost:5173  
3. `Cmd + Option + I` → separador **Console**  
4. Cria conta → monta carta → cria partida  
5. **Não** deve aparecer `FirebaseError: permission-denied`

Se aparecer `permission-denied`:

- Auth Anonymous desligado? → Parte B2  
- Rules não publicadas? → Parte A6  
- Índice em falta? → Console mostra link azul para criar índice → clica e espera 2–5 min

---

## Comandos copy-paste (sequência completa)

```bash
cd /Users/vitorhugow/Desktop/joga-ai-recuperado/joga-ai-modern-card-v5/artifacts/joga-ai
firebase login
firebase use joga-ai-f7622
firebase deploy --only firestore:rules
```

Depois confirma no browser:  
https://console.firebase.google.com/project/joga-ai-f7622/firestore/rules

---

## Problemas comuns

| Sintoma | Onde resolver |
|--------|----------------|
| `firebase: command not found` | Terminal → `npm install -g firebase-tools` |
| `Not in a Firebase app directory` | Terminal → `cd` para `artifacts/joga-ai` (Parte A2) |
| `HTTP Error: 403` | Login com conta errada → `firebase login` com dono do projeto |
| Popup login não abre | Terminal do Mac em vez do Cursor |
| `permission-denied` na app | Console → Auth + Rules (Partes B1, B2) |
| Testers não abrem o site | Precisas URL pública (Parte C) ou mesma Wi‑Fi |

---

## Ficheiros importantes no projeto

```
artifacts/joga-ai/
├── .env.local          ← chaves Firebase (não commitar)
├── .firebaserc         ← liga CLI ao projeto joga-ai-f7622
├── firebase.json       ← diz ao Firebase onde estão as rules
├── firestore.rules     ← regras de segurança (publicar com deploy)
└── docs/FIRESTORE_DEPLOY.md  ← este guia
```
