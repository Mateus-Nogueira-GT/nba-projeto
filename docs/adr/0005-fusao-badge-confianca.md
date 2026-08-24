# ADR-0005 — Fusão da badge de confiança com o anel de apito

**Status:** aceito · 18/08/2026 · decisão do cliente

## Contexto

Três sistemas de cor disputavam o mesmo card. Dois usavam as mesmas quatro cores com
significados quase invertidos: verde é o melhor na escala de confiança e o terceiro nível
de apito; azul é o penúltimo na escala e o turbo no apito.

Além disso: o % só varia de **80 a 95**, então a escala de 5 faixas da p.4 usava 2. E o %
é **derivado** de nível + nível de apito — a badge não carregava informação que o anel já
não tivesse.

## Decisão

Um anel único: **a cor é o nível do apito, o número dentro é a confiança.**
A escala de 5 faixas (0-29 / 30-50 / 51-69 / 70-86 / 87-99) é **removida**.

Canais finais: borda metálica = nível do jogador · anel = apito + confiança.

## Consequências

- Card significativamente mais legível — leitura em segundos, com o jogo rolando.
- **A p.4 da proposta aprovada vende a escala de 5 faixas.** Precisa ser comunicado ao cliente.
- Cor deixa de ser canal único: todo sinal ganha redundância (número do nível, rótulo textual).

## Nota de superação parcial — 24/08/2026

Em 24/08/2026, seis dias depois desta decisão, o cliente pediu o contrário do que fixamos
acima: a pílula do card volta a ser **colorida pela faixa de confiança**. Este ADR é
registro histórico — não reescrevemos o texto acima — mas ele hoje descreve só parte do
comportamento real. Esta nota marca a fronteira entre o que continua valendo e o que foi
substituído.

**Continua valendo:**

- A fusão em si — nível do apito e confiança não voltaram a ser dois badges redundantes
  competindo pelo mesmo espaço do card. O que existia como "anel único" migrou, numa
  fatia posterior, para a borda colorida + selo de canto do `Avatar` (a "dívida do
  círculo" — o indicador do apito é hoje um quadrado arredondado, não um círculo; ver os
  testes de `como-funciona`), mas o princípio é o mesmo: o nível do apito tem exatamente
  um lugar na tela, não dois.
- **A proibição continua em pé**: nenhuma escala de confiança pode voltar a usar as 4
  cores categóricas do apito (🟡 🟠 🟢 🔵) nem reproduzir a escala multi-matiz de 5
  faixas da p.4 da proposta original. Essa é a parte da decisão de 18/08 que o cliente
  NÃO revogou em 24/08 — só pediu que a confiança voltasse a ter cor, com uma condição:
  sem colidir com o apito.

**Foi superado:**

- "A escala de 5 faixas é removida" — não está mais certo. A escala de 5 faixas voltou,
  mas redesenhada para não repetir o defeito original: em vez de 5 matizes (a escala da
  p.4 ia de vermelho a azul, como se a confiança pudesse cair a valores que na prática
  nunca ocorrem), é uma **rampa de intensidade de UM matiz só — turquesa** —, recalibrada
  para a amplitude real da confiança (80 a 95, não 0 a 99). Os cinco degraus vêm de
  `config/ruleset.v1.yaml` → `confianca_exibicao.faixas` (grau 1 "CONFIANÇA BOA" em 80,
  até grau 5 "CONFIANÇA MÁXIMA" em 93) e chegam ao token em
  `src/design-system/tokens/semantico.ts` (`confiancaGrau1`..`confiancaGrau5`,
  degraus de `turquesa700` a `turquesa300`). Hoje `origem: demonstracao` no ruleset — a
  calibração real ainda é pergunta em aberto ao CJ (ver `docs/specs/README.md`).
- A colisão com os canais do apito não é mais só uma afirmação do texto acima — é
  verificada por teste: `src/design-system/__tests__/tokens.test.ts`, describe `'rampa de
  confiança (identidade 02)'`, confere que nenhum dos cinco degraus da rampa coincide com
  as cores categóricas do apito ou com as metálicas de nível do jogador, e que todos os
  cinco passam em contraste AA sobre a superfície do card.
- Efeito colateral novo, que este ADR original não previa: o card ganhou um brilho ao
  redor quando a confiança está no grau máximo (grau 5) — `CardEntrada.tsx`, `brilha =
  grau === 5`. É um quinto sinal visual, não coberto pela decisão de 18/08.

Detalhe de implementação e o raciocínio de cor completo:
`docs/superpowers/specs/2026-08-24-identidade-rota-transmissao-design.md`, seção "A rampa
de confiança (decisão central de cor)".
