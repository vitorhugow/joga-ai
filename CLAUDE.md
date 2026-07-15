# Joga AI

PWA/TWA de futebol amador (peladas) para Portugal e Brasil. Cartas estilo FIFA que
evoluem, peladas ao vivo, comunidades, votação pós-jogo, pagamentos.

- App: `artifacts/joga-ai/` (React + Vite). Functions: `artifacts/joga-ai/functions/`
- Firebase: `joga-ai-f7622` · Produção: `jogaai.pt` (Cloudflare Pages via GitHub Actions)
- Responder SEMPRE em português de Portugal. Conciso.

## Regras invioláveis

1. **A carta do jogador é sagrada.** Nunca alterar layout, estrutura ou conteúdo do
   `PlayerCard`. Skins só mudam gradiente/brilho da moldura via CSS custom properties.
   Podes escalá-la (pódio, landing), nunca reestruturá-la.
2. **Clube PRO (9,99€) INCLUI tudo do PRO Jogador (4,99€).** Usar sempre
   `hasPlayerPro()` (cobre ambos). NUNCA criar `hasPlayerProOnly()` — já causou
   inconsistência em 5 pontos de gate. A inclusão é assimétrica: PRO Jogador NÃO
   ganha ferramentas de clube (`isOrganizerPro` para essas).
3. **Modelo SEM reembolsos.** Nunca usar `stripe.refunds.create`. Qualquer devolução
   vira saldo interno (`users/{uid}.peladaBalanceCents`). Reversals de transferência
   existem (trazem cash de volta à plataforma) — não são reembolsos.
4. **Taxa de 0,50€ em todos os pagamentos avulsos de pelada.** Sem isenções. Não
   existe modelo de "sem taxa" nem teto — foi abandonado. Se encontrares
   `organizerNoFeeCap` ou similar, é fóssil.
5. **Entitlements só o Admin SDK escreve.** Cliente lê. As rules bloqueiam escrita
   cliente em `entitlements`, `peladaBalanceCents`, `lastMatchNickname`.
6. **Gates de Clube PRO validam por `entitlements`, nunca por `communities.proActive`.**
   O `proActive` é cache derivado. Já houve bug de ele ficar `true` para sempre.
7. **Nunca commitar chaves.** Segredos Stripe em Firebase Secrets Manager.

## Armadilhas que já partiram produção

- **`undefined` no Firestore.** `setDoc`/`updateDoc` rejeitam a escrita INTEIRA se
  algum campo for `undefined`. Jogadores manuais (sem conta) têm `userId`/`photoUrl`
  undefined. SEMPRE `stripUndefined()` / `sanitizeLivePlayers()` (em
  `src/lib/firestoreUtils.ts`) antes de qualquer write. Nunca
  `ignoreUndefinedProperties` global — mascara bugs.
- **Notificações cross-user só via Cloud Functions** (admin SDK). As rules permitem
  ao cliente escrever APENAS na própria caixa (`isOwner`). Já houve buraco que
  permitia spam com popup a toda a base.
- **Estado da partida vive no Firestore**, não em localStorage:
  `matches/{id}/state/setup` e `state/live`. localStorage é só cache de leitura.
  Relógio derivado: `elapsed = accumulatedMs + (status==="running" ? now - startedAt : 0)`.
  Nunca guardar um contador.
- **Isenção de mensalista NÃO pode depender de `proActive`.** Segue só
  `communities/{cid}/mensalistas/{uid}.active` + `currentPeriodEnd`. Se o clube perde
  o PRO, quem pagou o mês continua isento até ao fim do período.
- **Rules: `&&` vs `||`.** Já houve gate com `!A && B !== true` que só bloqueava se
  ambas falhassem. Ler duas vezes.
- **CSS global (`html`/`body`/`#root`)**: um ajuste pequeno já bloqueou o scroll de
  toda a app. `min-height` tem de ser `100dvh`/`100vh`, nunca `100%`. Testar de facto.
- **`pickBestRoster`**: critério primário é o `savedAt` mais recente; nº de jogadores
  só como desempate. "Mais jogadores ganha" impede remoções de vingar.

## Deploy

- **Só o CI faz deploy das functions.** Nunca `firebase deploy --only functions`
  local em paralelo com o workflow — gera conflitos 409 no Cloud Run.
  Usar: `gh workflow run deploy-functions.yml --repo vitorhugow/joga-ai`
- Frontend: push para `main` → Cloudflare Pages publica sozinho.
- Functions em `europe-west1`. Plano Blaze.
- Envs `VITE_*` são build-time: têm de estar nas Environment Variables da
  Cloudflare Pages (Production), não só nos secrets do GitHub.
- App Check está DESLIGADO (`APP_CHECK_ENABLED = false` em `AppServices.tsx`) — o
  `exchangeRecaptchaV3Token` devolvia 400 e bloqueava as Firebase Installations,
  matando o FCM. Não reativar sem resolver isso.
- Webhooks Stripe são separados por modo (test/live) E há dois endpoints:
  `stripeWebhook` (conta) e `stripeConnectWebhook` (connected accounts, secret
  próprio `STRIPE_CONNECT_WEBHOOK_SECRET`).

## Decisões de produto fechadas

- Grátis para sempre (canais de aquisição): narrativa da partida, stats básicas de
  comunidade, votação, retrospetiva, rankings, badges, imagem de resultado
  partilhável (PRO só melhora qualidade/watermark).
- Gateado a PRO Jogador: stats avançadas pós-jogo, histórico completo (grátis: 10),
  evolução além de 90 dias, skins premium, export HD da carta, apelido automático.
- `MENSALISTA_FEE_PERCENT = 5`. Alterar não afeta subscrições já criadas.
- Mensalistas via Direct charges: a subscrição vive na conta Connect do organizador
  (ele é o merchant of record).
- Apelidos automáticos nunca são negativos nem humilhantes.
- Fotos de campo: ilustrações/fotos fixas por tipo, nunca Google Maps.

## Workflow

- Ler o estado ATUAL dos ficheiros antes de editar — não assumir que estão como numa
  sessão anterior. Localizar anchors reais.
- Verificar de facto, não assumir: correr `npm run build` (app e functions) e
  confirmar no ficheiro que a alteração ficou lá.
- Reportar honestamente o que NÃO foi feito ou não foi possível testar.
- Alterações de CSS global e de rules merecem cuidado extra — são onde ajustes
  pequenos partem coisas grandes.
