# Joga AI — versão reorganizada V4

Esta versão reorganiza a interface para aproximar o app do mockup premium enviado: visual claro, esportivo, moderno, com carta maior no perfil e estética de videogame de futebol sem copiar marcas.

## Onde está o app principal

O projeto React/Vite principal está em:

`artifacts/joga-ai`

Abra essa pasta no Cursor ou use essa pasta como raiz no Cloudflare Pages.

## Mudanças principais

- Carta do jogador reescrita em CSS V4.
- Carta escala como um bloco único, sem textos saindo do lugar.
- Fundo verde não invade mais a carta.
- Bandeira reposicionada para não ficar em cima da posição.
- Carta do perfil aumentada para ocupar melhor o hero verde.
- Hero do perfil ficou mais alto e mais próximo da referência visual.
- Home ajustada para dar mais destaque à carta e ao jogador.
- Helpers globais adicionados para visual premium.

## Importante

No perfil, a carta deve continuar assim:

`<PlayerCard size="profile" />`

E deve ficar dentro de:

`<div className="joga-profile-card-stage">...</div>`

Não misture CSS antigo da carta com este novo CSS.

## Cloudflare Pages

Configuração sugerida:

- Root directory: `artifacts/joga-ai`
- Build command: `npm run build`
- Output directory: `dist`

Se der erro por causa de dependências `catalog:` do Replit, abra no Cursor e troque as dependências `catalog:` por versões npm normais antes do deploy.
