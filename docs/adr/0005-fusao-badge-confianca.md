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
