# ADR-0011 — A moldura veste o nível do jogador, e a confiança sai do card

**Status:** aceito · 19/09/2026 · decisão do dono da plataforma

## Contexto

A Identidade 05 subiu e o parceiro mandou três blocos de feedback sobre a mesma tela. Lidos
juntos, eles dizem duas coisas:

1. **A cor está apagada.** O nível do jogador vivia num tracinho metálico de 56 × 3 px acima
   da borda do card e num rótulo cinza de 12 px, igual para os quatro níveis. O bronze do
   Suporte (`#C8823C`, saturação 56%) é, literalmente, um laranja fraco — e o card do Josh
   Hart, que é Suporte na lista do CJ, foi o exemplo que ele deu.
2. **A hierarquia está invertida.** O número grande do canto (34 px) era a nota de
   confiança; a odd, que é o que faz o assinante montar múltipla, era texto cinza de 12 px
   no rodapé.

O [ADR-0005](0005-fusao-badge-confianca.md) tinha fundido nível do apito e confiança num
anel único justamente para preservar a nota no card. A borda lateral de 3 px vestia o grau
de confiança — uma rampa turquesa que, no grau alto, o parceiro leu como "a linha verde da
lateral", verde sendo a cor do nível 3 do apito.

## Decisão

**Os dois canais continuam dois. Trocam de superfície.**

| Canal | Antes | Agora |
| --- | --- | --- |
| Nível do JOGADOR | tracinho de 56 × 3 px + rótulo cinza de 12 px | **moldura do card**: borda de 1 px em toda a volta, lateral de 6 px, véu a 12% no cabeçalho e no rodapé, e o rótulo em Bebas 20 px na cor |
| Nível do APITO | anel do avatar de 2 px | anel de 3 px + o numeral `N{n}` ao lado do nome, na mesma cor |
| Confiança | número de 34 px, borda lateral, brilho do grau 5 | **sai do card** |

E a **odd** ocupa o canto que era da nota: `ODD MÉDIA` em 12 px sobre o valor em Bebas 38 px.

Sete cores subiram de saturação e de contraste, medidas contra as cinco superfícies de card
do app — o bronze do Suporte saiu de `#C8823C` para `#F08040`, que é o "laranja mais vivo e
brilhante" pedido. O Randola trocou o grafite pelo branco.

## Consequências

- **A p.4 da proposta aprovada vende a nota de confiança no card.** Tirá-la de lá é decisão
  do dono da plataforma, de 19/09, e precisa chegar ao CJ antes da próxima apresentação.
  Não é defeito nem esquecimento.
- **Nenhum dado muda.** O item do feed continua carregando a confiança, o push continua
  usando, e a Lista continua ordenando por ela. O que muda é que o card não a desenha. Quem
  a desenha é a tela de análise do apito, que já a mostrava em pílula, rampa e por linha.
- A rampa turquesa (`confiancaGrau1..5`) e o [ADR-0005](0005-fusao-badge-confianca.md)
  **sobrevivem na análise do apito**. Este ADR supera a parte do 0005 que punha o número no
  card, não a fusão nem a proibição de reusar as cores do apito numa escala de confiança.
- Dos três brilhos da identidade 03 sobram dois — turbo e modo fire. O terceiro dono era o
  grau 5 de confiança.
- **Bronze e laranja do nível 2 passam a conviver no mesmo card** (o do Josh Hart), a 13° de
  matiz de distância. É o pedido explícito do feedback; separam-se por posição — moldura ×
  anel — e não por hue.
- **O branco do Randola divide-se em dois usos.** Texto do nível em branco cheio, como
  pedido; moldura em branco a 55%. Branco cheio na moldura faria o card do jogador MENOS
  importante gritar mais alto que o do MVP.
- O `grafite` do primitivo ficou órfão e saiu.

Raciocínio de cor completo, com os números de contraste por superfície:
`docs/superpowers/specs/2026-09-19-cores-vivas-e-hierarquia-do-card-design.md`, seção 4.
