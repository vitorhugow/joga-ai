# PlayerGameCard corrigido — Joga AI

Use este pacote para substituir a versão anterior da carta, porque a anterior usava fontes baseadas no tamanho da tela (`vw`) e por isso os textos estouravam quando a carta ficava pequena no perfil.

## Arquivos para copiar

- `src/components/PlayerGameCard.jsx`
- `src/components/PlayerGameCard.css`
- `assets/card-template-blank.png` para `src/assets/card-template-blank.png`

## Importante

Apaga/substitui completamente o CSS antigo da carta. Não misturar as duas versões.

## Uso

```jsx
import PlayerGameCard from './components/PlayerGameCard';

<PlayerGameCard
  size="profile"
  name={player.name}
  overall={player.overall}
  position={player.position}
  photoUrl={player.photoUrl}
  flagUrl={player.flagUrl}
  clubLogoUrl={player.clubLogoUrl}
  stats={{
    PAC: player.pace,
    SHO: player.shooting,
    PAS: player.passing,
    DRI: player.dribbling,
    DEF: player.defending,
    PHY: player.physical,
  }}
/>
```

## Tamanhos disponíveis

- `size="small"` para listas/cards pequenos
- `size="profile"` para perfil do jogador
- `size="large"` para tela detalhada

## Por que agora funciona melhor

Os textos usam `cqw`, que escala com a largura da própria carta. Assim, se a carta tiver 180px, os textos diminuem junto e não vazam para fora.
