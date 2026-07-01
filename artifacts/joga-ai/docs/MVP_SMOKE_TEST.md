# Joga AI — checklist de release (smoke test)

**Produção:** https://joga-ai.pages.dev  
**Firebase:** `joga-ai-f7622`  
**Versão actual:** v1.1 (RSVP, export PNG, narrativa, Liga/Duelos, badges, carta loan)

Correr com **2 contas** (organizador + jogador) antes de cada release grande.

## Pré-requisitos

- Firebase Auth: Anonymous + Email/Password + Google activos
- Domínio `joga-ai.pages.dev` em Authentication → Authorized domains
- CI verde (Pages + Firestore rules/indexes)
- Hard refresh após deploy: `Cmd+Shift+R`

## Reset de teste (opcional)

1. DevTools → Local Storage → apagar chaves `joga-ai-*`
2. Firestore: apagar `matches/*`, `communities/*` de teste
3. Hard refresh e nova sessão

---

## 1. Sessão e conta

- [ ] Login Google em `/entrar` → Perfil mostra sessão ligada
- [ ] Refresh 5× na Home — mantém sessão
- [ ] Logout → nova sessão anónima
- [ ] Ligar conta anónima a Google/email — **mesmo uid** preservado
- [ ] Google já usado noutra conta → aviso claro (não troca silenciosa)

## 2. Carta e perfil

- [ ] Home mostra **teu** nome na carta (nunca dados demo)
- [ ] Perfil → Editar carta / **Partilhar** funcionam
- [ ] Perfil → **Partilhar** descarrega PNG da carta (ou abre sheet nativo no mobile)
- [ ] Ranking global → empty state ou só os teus dados (“Liga em breve” — ver §8)

## 3. Partida (organizador)

- [ ] `/criar-partida` → `/partida/m-XXXX/pre-jogo`
- [ ] Só organizador vê **Iniciar partida** e **Cancelar partida**
- [ ] Organizador vê botão **Convidar** (ícone partilha) → link copiado para clipboard
- [ ] Pré-jogo → Ao vivo → Pós-jogo sem erros
- [ ] Ao terminar ao vivo: **+1 Físico** no Perfil **sem** abrir Pós-jogo (jogador no plantel)

## 4. RSVP e lista de espera (v1.1)

*Requer 2 contas: organizador cria partida cheia ou com vagas limitadas.*

- [ ] Jogador (não organizador) em `/partida/m-XXXX/pre-jogo` vê banner **Queres jogar nesta pelada?**
- [ ] **Confirmar presença** → entra no plantel (ou **Lista de espera** se lotado)
- [ ] Jogador confirmado vê **Estás confirmado nesta pelada** + **Sair da pelada**
- [ ] Na lista de espera: posição visível + **Sair da lista**
- [ ] Organizador remove jogador ou alguém sai → **primeiro da lista promovido** automaticamente
- [ ] Organizador com lista de espera vê secção **Lista de espera** com contagem

## 5. Pós-jogo e evolução

- [ ] Votar → **+1 Ritmo** + golos/assistências/defesas na carta
- [ ] Faltas/cartões → **−1 Ritmo** cada
- [ ] Artilheiro → +1 extra (FIN ou Saída no GR)
- [ ] Notas reveladas (todos votam / organizador / 24h) → Drible +1 se nota ≥ 8
- [ ] Pós-jogo mostra bloco **Relato** com narrativa automática (`data-testid="match-narrative"`)
- [ ] Pós-jogo → **Partilhar evolução** exporta PNG da carta com ganhos
- [ ] `/perfil/evolucao` mostra ganhos da última pelada
- [ ] Organizador **Excluir pelada** → stats revertem para **todos** os jogadores

## 6. Listagens

- [ ] `/jogos` mostra partidas de outras contas (“Com vagas”)
- [ ] Partidas concluídas/canceladas **não** aparecem em Jogos
- [ ] Home → Jogos disponíveis actualizado

## 7. Comunidades

- [ ] Criar comunidade → aparece em **As Minhas** (refresh OK)
- [ ] Capa: carregar → Guardar → persiste após refresh
- [ ] Pública → entrada imediata; Privada → pedido pendente
- [ ] Admin: aprovar/recusar no sino (tab Pedidos)
- [ ] Tabs visíveis (membro): **Partidas**, **Resultados**, **Liga**, **Duelos**, **Membros**
- [ ] Tab **Resultados** → narrativa por pelada (ou empty state “Sem resultados registados”)
- [ ] Tab **Liga** → rankings Golos / Assistências / Nota média / MVP (ou “Sem dados de liga ainda”)
- [ ] Tab **Duelos** → selector adversário + carta duelo; secção **As tuas rivalidades** após jogos

## 8. Distintivos e carta loan (v1.1)

- [ ] Após pelada com nota revelada / marcos → secção **Distintivos** no Perfil (se desbloqueados)
- [ ] Sino in-app mostra notificação de badge desbloqueado
- [ ] Organizador adiciona visitante no pré-jogo → link `/entrar?claim=guest-...` copiado
- [ ] Visitante abre link → registo/login → carta migrada para conta ligada (**mesmo uid** após claim)

## 9. Notificações (in-app apenas)

- [ ] Sino → tab **Para ti**: bem-vindo, votar, nota saiu, evolução, badges
- [ ] Sino → tab **Pedidos** (só admin): pedidos de entrada
- [ ] Sem spinner infinito
- [ ] **Fora de âmbito v1.1:** push FCM / Cloud Functions (plano Spark) — só sino in-app

## 10. Fora do MVP v1 (OK)

- [ ] Premium / Campos → “Em breve”
- [ ] Ranking **global** (`/ranking`) → ainda “Liga em breve” (liga por comunidade está na tab **Liga**)

---

## Deploy

```bash
cd artifacts/joga-ai && npx vite build
git push origin main   # CI → Pages + Firestore (requer FIREBASE_TOKEN)
```

Deploy manual Firestore:

```bash
./scripts/deploy-firestore.sh
```
