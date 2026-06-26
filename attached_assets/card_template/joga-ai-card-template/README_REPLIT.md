# Carta editável Joga AI

Este pacote tem uma carta pronta para o Replit/React usar no perfil dos jogadores.

## Arquivos

- `src/components/PlayerGameCard.jsx`
- `src/components/PlayerGameCard.css`
- `assets/card-template-blank.png`
- `assets/card-original.png`

## Como usar no projeto React/Vite

1. Copia `PlayerGameCard.jsx` e `PlayerGameCard.css` para `src/components/`.
2. Copia `card-template-blank.png` para `src/assets/`.
3. Ajusta o caminho do import da imagem se necessário.
4. Usa o componente no perfil do jogador.

Exemplo:

```jsx
import PlayerGameCard from './components/PlayerGameCard';

<PlayerGameCard
  name="KIKO"
  overall={99}
  position="ST"
  photoUrl={player.photoUrl}
  flagUrl={player.flagUrl}
  clubLogoUrl={player.clubLogoUrl}
  stats={{
    PAC: 99,
    SHO: 99,
    PAS: 89,
    DRI: 97,
    DEF: 96,
    PHY: 99,
  }}
/>
```

## Campos editáveis

- `name`: nome do jogador
- `overall`: nota geral
- `position`: posição
- `photoUrl`: foto do jogador
- `flagUrl`: bandeira
- `clubLogoUrl`: logo da equipa
- `stats.PAC`: ritmo/velocidade
- `stats.SHO`: remate/finalização
- `stats.PAS`: passe
- `stats.DRI`: drible
- `stats.DEF`: defesa
- `stats.PHY`: físico

## Instrução para o Replit

Use `PlayerGameCard` no perfil de todos os jogadores. Cada jogador deve receber os dados vindos do banco/API e preencher automaticamente nome, overall, posição, foto, bandeira, equipa e atributos. A imagem `card-template-blank.png` é apenas o fundo da carta; todos os textos devem ser renderizados por HTML/CSS por cima da imagem.
