# SPRINT 4 — Clubes PRO (spec para implementação)

## Modelo fechado (decisões finais, 04/07/2026)
- Taxa de 0,50€ SEMPRE, em todas as peladas com pagamentos (receita base).
- Planos: PRO Jogador 4,99€ · **Clube PRO 9,99€** (substitui "PRO Organizador";
  id interno continua `organizer_pro` — não migrar dados).
- Sem isenção de taxas em nenhum plano (decisão deliberada; margem do Clube
  PRO é quase pura). Economia típica/clube ativo: ~10€ taxas + 9,99€ ≈ 20€/mês.

## Já implementado nesta entrega
- billing.ts: waiver removido, taxa fixa no checkout de pelada.
- Rebrand Premium/Perfil → "Clube PRO" + lista de vantagens nova.
- Clube PRO cria peladas DE COMUNIDADE abertas ao público
  (CriarPartida deixa de forçar openToExternal=false quando orgPro).
- `proBadge` no modelo (input/listing/saved/payload/loader) gravado na
  criação quando orgPro + selo ✦ Clube PRO no MatchCard.
  ⚠️ VERIFICAR: mapeamento de listagens em communityRepository
  (loadAvailableMatches/list*) pode precisar de passar `proBadge` ao objeto.

## A implementar (por prioridade)

### 1. Mensalistas (a feature âncora)
Org define o PREÇO MENSAL dele (campo por comunidade/pelada recorrente).
- Doc: `communities/{id}/mensalistas/{uid}`: { priceCents, status:
  'em_dia'|'pendente'|'suspenso', paidUntil, updatedAt }.
- Jogador paga a mensalidade pela app: nova function
  `createMensalistaCheckout` (mode payment, valor = priceCents do org
  + 0,50€ taxa, transfer_data → org, metadata {kind:'mensalista',
  communityId, uid}); webhook marca paidUntil = +1 mês.
- Em cada pelada dessa comunidade: mensalista em dia → chip "Mensalista ✓"
  e paid=true automático no RSVP (client verifica doc; rules: leitura
  para membros).
- Gestor (ver §4): lista de mensalistas, em dia/pendentes, botão lembrar.

### 2. Prioridade no Encontrar Jogos
Ordenar listagens públicas: proBadge primeiro (estável, depois por data).
Local: onde o Encontrar/Home ordena availableMatches.

### 3. Marca do clube (branding)
- `communities/{id}.branding`: { logoUrl, primaryColor } — upload simples
  (Firebase Storage) na página de configurações, só admin+Clube PRO.
- Aplicar: header da convocatória/PreJogo, e na imagem de resultado
  (resultImage.ts: desenhar logo no canto + faixa na cor primária,
  com fallback ao layout atual).

### 4. Painel do Clube (gestor)
Página `/comunidade/{id}/gestor` (só admin da comunidade + Clube PRO):
- Pagamentos: por pelada, quem pagou (paidVia app/manual), pendentes.
- Presenças: confirmou-e-faltou (cruzar RSVP vs presença marcada),
  "pagou e não foi", assiduidade por jogador.
- Época: golos/assist/MVPs agregados do clube, export CSV simples.
Fontes: matches da comunidade (participantUserIds, players[].paid),
matchResults/summary. Sem escrita nova — é leitura+agregação.

### 5. Experiência premium na pelada PRO
- Moldura dourada na imagem de resultado quando proBadge.
- Badge de participação "Joguei numa pelada ✦" (users/{uid}/badges).

## Gates
Tudo acima gated por `isOrganizerPro(entitlements)` (id organizer_pro,
label "Clube PRO"). Painel /admin continua a conceder manualmente.
