# MVP Pelada — smoke test manual

## Pré-requisitos

- `cp .env.example .env.local` e preencher Firebase
- Firebase Console: Anonymous + Email/Password + Google activos
- Publicar `firestore.rules`: `firebase deploy --only firestore:rules`
- Domínio Cloudflare Pages autorizado em Firebase Auth → Settings → Authorized domains

## Reset de conta (Fase 1 — feito ✓)

Se apagaste **todos** os utilizadores em Authentication e a coleção `users` desapareceu do Firestore: **está tudo bem**. No Firestore as coleções vazias não aparecem na consola — não precisas de criar `users` à mão.

A app recria `users/{uid}` automaticamente no primeiro acesso, em `loadUserProfile()` (`src/lib/userRepository.ts`), quando:

1. Abres o site (sessão anónima nova) **ou** fazes login Google/email
2. A app carrega o perfil → grava o documento em Firestore

### Passos depois do reset total

1. **Browser** → DevTools → Application → Local Storage → apagar **todas** as chaves `joga-ai-*` (perfis antigos com uids apagados)
2. Hard refresh: `Cmd+Shift+R`
3. Abrir o site → montar carta ou ir a `/entrar` e registar de novo
4. Confirmar no [Firestore](https://console.firebase.google.com/project/joga-ai-f7622/firestore): aparece `users/{novo-uid}`

Opcional — zerar também partidas e comunidades de teste:

- Apagar `matches/*`
- Apagar `communities/*` (inclui `members` e `joinRequests`)

Depois do reset, faz hard refresh (`Cmd+Shift+R`).

## Checklist pós-MVP real

### 1. Sessão estável

- [ ] Login Google em `/entrar` → Perfil mostra "Sessão: Google"
- [ ] Refresh 5× na Home — continua logado (não volta a banner de visitante)
- [ ] Logout → nova sessão anónima limpa

### 2. Carta e perfil (sem Diogo)

- [ ] Home mostra **teu** nome na carta (nunca "Diogo Ferreira")
- [ ] Perfil → **Editar carta** abre o diálogo e fecha correctamente
- [ ] Perfil → **Partilhar** copia link ou abre native share
- [ ] Ranking mostra empty state ou só os teus dados reais

### 3. Criar partida real

- [ ] `/criar-partida` — preencher formulário e submeter
- [ ] URL muda para `/partida/m-XXXX/pre-jogo` (id real)
- [ ] Pré-jogo: só organizador + jogadores reais do match (sem roster fictício)

### 4. Fluxo de jogo

- [ ] Pré-jogo → Iniciar → Ao vivo → Pós-jogo sem erros
- [ ] Evolução (`/perfil/evolucao`) acessível após partida

### 5. Ligação de conta (preserva UID)

- [ ] Com perfil criado **anónimo**, ir a `/entrar` e ligar Google ou email
- [ ] **Mesmo uid** — nome/carta/partida continuam
- [ ] Se `linkWithPopup` falhar, app avisa que pode mudar de conta (sem troca silenciosa)

### 6. Listagens

- [ ] `/jogos` mostra partida criada em "Com vagas"
- [ ] Home → "Jogos Disponíveis" inclui a partida
- [ ] Empty state em Jogos com botão **Criar partida** quando logado

### 7. Comunidades reais

- [ ] `/comunidades` → **Criar** abre `/comunidades/criar`
- [ ] Criar comunidade → aparece em **Descobrir**
- [ ] Comunidade criada aparece em **As Minhas**
- [ ] Noutra conta: **Pedir para entrar** → estado "Pedido pendente"
- [ ] Sem dados fictícios / label "Demo"

### 8. Features em breve (OK manter)

- [ ] Premium botões "Em breve"
- [ ] Campos "Em Breve"
- [ ] Sino (notificações) → toast "Em breve" ou escondido

## Deploy rápido

```bash
cd artifacts/joga-ai
pnpm install
PORT=5173 BASE_PATH=/ pnpm run dev
```

Build:

```bash
PORT=5173 BASE_PATH=/ pnpm run build
pnpm exec tsc --noEmit
```

Publicar regras e índices Firestore:

```bash
firebase deploy --only firestore
```

Push para GitHub → deploy automático Cloudflare Pages.

Hard refresh no browser após deploy (`Cmd+Shift+R`).
