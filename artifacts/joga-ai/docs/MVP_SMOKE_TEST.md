# MVP Pelada — smoke test manual

## Pré-requisitos

- `cp .env.example .env.local` e preencher Firebase
- Firebase Console: Anonymous + Email/Password + Google activos
- Publicar `firestore.rules`: `firebase deploy --only firestore:rules`
- Domínio Cloudflare Pages autorizado em Firebase Auth → Settings → Authorized domains

## Reset de conta (uma vez, antes de testar MVP limpo)

Para zerar dados de teste e remover conteúdo fictício antigo:

1. **Firebase Console** → [Firestore](https://console.firebase.google.com/project/joga-ai-f7622/firestore):
   - Apagar `users/{teu-uid}` (e subcoleção `evolution` se existir)
   - Apagar `matches/*` que não queiras manter (ou todos para zerar)
   - Apagar `communities/*` de teste (inclui subcoleções `members` e `joinRequests`)
2. **No browser** do site publicado → DevTools → Application → Local Storage → apagar chaves `joga-ai-*`
3. **Opcional:** Authentication → Users → apagar conta de teste e voltar a registar (só se quiseres uid novo)

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

Publicar regras Firestore:

```bash
firebase deploy --only firestore:rules
```

Push para GitHub → deploy automático Cloudflare Pages.

Hard refresh no browser após deploy (`Cmd+Shift+R`).
