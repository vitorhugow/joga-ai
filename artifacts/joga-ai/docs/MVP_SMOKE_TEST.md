# MVP Pelada — smoke test manual

## Pré-requisitos

- `cp .env.example .env.local` e preencher Firebase
- Firebase Console: Anonymous + Email/Password + Google activos
- Publicar `firestore.rules`: `firebase deploy --only firestore:rules`

## Checklist

### 1. Sessão anónima + carta

- [ ] Abrir `/` — modal "Monta a tua carta" aparece
- [ ] Preencher nome, posição, número — carta na Home mostra **teu** nome (não "Diogo Ferreira")
- [ ] Perfil (`/perfil`) reflecte os mesmos dados

### 2. Criar partida real

- [ ] `/criar-partida` — preencher formulário e submeter
- [ ] URL muda para `/partida/m-XXXX/pre-jogo` (id real, não `100`)
- [ ] Organizador aparece na lista de jogadores do pré-jogo

### 3. Fluxo de jogo

- [ ] Pré-jogo → Iniciar → Ao vivo → Pós-jogo sem erros
- [ ] Evolução (`/perfil/evolucao`) acessível após partida

### 4. Ligação de conta (preserva UID)

- [ ] Com perfil e partida criados **anónimo**, ir a `/entrar` e ligar Google ou email
- [ ] **Mesmo uid** — verificar no Perfil que nome/carta/partida continuam
- [ ] Nota: `linkWithPopup` / `linkWithCredential` em `src/lib/auth.ts` faz upgrade sem trocar uid

### 5. Listagens

- [ ] `/jogos` mostra partida criada em "Com vagas"
- [ ] Home → "Jogos Disponíveis" inclui a partida

### 6. Features demo (não bloqueiam MVP)

- [ ] Ranking / Comunidades marcados "Demo"
- [ ] Premium botões "Em breve"
- [ ] Campos "Em Breve"

## Deploy rápido

```bash
cd artifacts/joga-ai
pnpm install
PORT=5173 BASE_PATH=/ pnpm run dev
```

Build:

```bash
PORT=5173 BASE_PATH=/ pnpm run build
```

Hard refresh no browser após deploy (`Cmd+Shift+R`).
