# ADR-0006 — Bloco de topo unifica a restrição de presença

**Status:** aceito · 18/08/2026 · deriva das respostas P5, P6 e P7

## Contexto

A regra do Fire Live dizia: _Suporte e Randola só apitam se o jogador nível MVP não
estiver em quadra_. Três buracos:

- 15 dos 30 times não têm nenhum jogador nível MVP
- Philadelphia tem dois (Embiid nº1, Jaylen Brown nº2)
- "em quadra" podia significar fora da partida ou no banco naquele instante

## Decisão

Um conceito só, o **bloco de topo** — o conjunto que precisa estar TODO fora da partida
para liberar Suporte e Randola:

```
time COM MVP  → todos os jogadores nível MVP
time SEM MVP  → o jogador nº 1 da hierarquia
```

Critério de ausência: **DNP** (não joga a partida), não presença instantânea.

## Por que unifica

Verificação na lista do CJ: **em todos os times que têm MVP, o MVP é o jogador nº 1.**
A única anomalia é Philadelphia, que tem MVP no nº 1 e no nº 2 — e o cliente confirmou
que os dois precisam estar fora. Logo os dois casos são a mesma regra aplicada a um
conjunto de tamanho variável, não dois casos especiais.

## Consequências

- **A tabela `presenca_quadra` deixou de existir.** Sem rastreamento de substituição em
  tempo real, sem o dado mais caro que o projeto quase precisou.
- O motor lê escalação, que já é ingerida de 6 em 6 horas e confirmada até 1h antes.
- Exceções mantidas: Utah, Detroit e Denver ignoram o bloqueio.
- Se um dia um time tiver MVP fora da posição nº 1, a regra continua correta — ela olha o
  conjunto de MVPs, não a posição.
