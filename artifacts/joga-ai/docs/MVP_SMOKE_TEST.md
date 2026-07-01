# Joga AI — checklist de release (smoke test)

**Produção:** https://joga-ai.pages.dev  
**Firebase:** `joga-ai-f7622`

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
- [ ] Perfil → Editar carta / Partilhar funcionam
- [ ] Ranking → empty state ou só os teus dados (“Liga em breve”)

## 3. Partida (organizador)

- [ ] `/criar-partida` → `/partida/m-XXXX/pre-jogo`
- [ ] Só organizador vê **Iniciar partida** e **Cancelar partida**
- [ ] Pré-jogo → Ao vivo → Pós-jogo sem erros
- [ ] Ao terminar ao vivo: **+1 Físico** no Perfil **sem** abrir Pós-jogo (jogador no plantel)

## 4. Pós-jogo e evolução

- [ ] Votar → **+1 Ritmo** + golos/assistências/defesas na carta
- [ ] Faltas/cartões → **−1 Ritmo** cada
- [ ] Artilheiro → +1 extra (FIN ou Saída no GR)
- [ ] Notas reveladas (todos votam / organizador / 24h) → Drible +1 se nota ≥ 8
- [ ] `/perfil/evolucao` mostra ganhos da última pelada
- [ ] Organizador **Excluir pelada** → stats revertem para **todos** os jogadores

## 5. Listagens

- [ ] `/jogos` mostra partidas de outras contas (“Com vagas”)
- [ ] Partidas concluídas/canceladas **não** aparecem em Jogos
- [ ] Home → Jogos disponíveis actualizado

## 6. Comunidades

- [ ] Criar comunidade → aparece em **As Minhas** (refresh OK)
- [ ] Capa: carregar → Guardar → persiste após refresh
- [ ] Pública → entrada imediata; Privada → pedido pendente
- [ ] Admin: aprovar/recusar no sino (tab Pedidos)

## 7. Notificações

- [ ] Sino → tab **Para ti**: bem-vindo, votar, nota saiu, evolução
- [ ] Sino → tab **Pedidos** (só admin): pedidos de entrada
- [ ] Sem spinner infinito

## 8. Fora do MVP v1 (OK)

- [ ] Premium / Campos → “Em breve”
- [ ] Ranking global → “Liga em breve”

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
