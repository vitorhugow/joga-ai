# PlayerGameCard V3 — Joga AI

Esta versão corrige os problemas vistos no perfil:

- a carta fica maior no bloco verde;
- o fundo verde não invade mais a carta;
- bandeira e escudo não ficam em cima da posição do jogador;
- os textos continuam editáveis e escalando corretamente.

## Copiar estes arquivos

- `src/components/PlayerGameCard.jsx`
- `src/components/PlayerGameCard.css`
- `assets/card-template-blank.png` para `src/assets/card-template-blank.png`

## Importante

Substituir completamente a versão anterior da carta. Não misturar CSS antigo com CSS novo.

## Uso no perfil

No bloco verde do perfil, envolver a carta com a classe `joga-profile-card-stage`:

```jsx
<section className="profile-hero">
  <h1>Meu Perfil</h1>

  <div className="joga-profile-card-stage">
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
  </div>
</section>
```

## Ajuste essencial no CSS do perfil

Se o perfil tiver uma área verde/hero, ela precisa permitir que a carta cresça:

```css
.profile-hero {
  min-height: clamp(330px, 38vh, 460px);
  overflow: visible;
}
```

Se a carta ainda aparecer pequena, procurar no CSS do projeto por regras como estas e remover/alterar:

```css
.profile-hero .joga-player-card {
  width: 150px;
  max-width: 150px;
}
```

ou qualquer `transform: scale(...)` aplicado na carta.
