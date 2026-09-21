# Motor de Estratégias — especificação formal

Tradução das regras do CJ (prosa) para contrato executável.
Fonte: `Introdução I.A da NBA.md` + `ranking jogadores nba.md`.

## Contrato

```
avaliar(fatos, ruleset) → apitos[]
```

Sem banco dentro. Sem `Date.now()` dentro. Sem rede dentro. O relógio e a data entram
como parte de `fatos`.

Por quê: motor puro é **determinístico e reexecutável**, e isso habilita o backtest
(rodar `ruleset v1` contra `v2` em cima da temporada passada e medir qual apitou melhor).
Isso é uma arma comercial enorme pro CJ e custa quase zero se a arquitetura nascer assim.
É impossível de retrofitar se o motor nascer grudado no banco.

---

## Dois eixos independentes na lista do CJ

A lista carrega duas informações que o código **precisa separar**:

| Eixo                                                     | O que é                   | Usado por                     |
| -------------------------------------------------------- | ------------------------- | ----------------------------- |
| **Posição ordinal (1..N)**                               | hierarquia dentro do time | **somente OPD**               |
| **Rótulo de nível** (MVP / All Star / Suporte / Randola) | classe do jogador         | oscilação, %, odds, Fire Live |

Os sufixos "principal"/"secundário" da lista são redundantes com a posição ordinal e
**não têm efeito no motor** — nenhuma regra do documento os consulta. São mantidos apenas
como texto informativo do card.

**A classificação é por atributo.** O doc diz "Shai é MVP _em pontos_", "Jokic é MVP _em
rebotes_". Desde 21/09/2026, os três atributos têm classificação no banco de dados, mas
`niveis.atributos` (ruleset) lista apenas `[PONTOS]` até que o CJ forneça as tabelas de % e odds
para rebotes e assistências. O modelo já nasce com a chave `(jogador, atributo)`.

---

## Lista Secreta · Método 1 — Oscilação

A notação do documento é ambígua ("≤5 abaixo"), mas o exemplo do LeBron resolve:
**o `≤` se aplica ao placar, não ao déficit.**

```
apitado  ⟺  pontos_no_jogo ≤ (média − delta[nível])
```

Conferência: LeBron, média 25,7, Suporte, delta 5 → 25,7 − 5 = 20,7 → apita com **≤20**.
Bate exatamente com o documento. A média entra com precisão cheia, sem arredondar.

| Nível                             | delta | Apita já no nível 1?             |
| --------------------------------- | ----- | -------------------------------- |
| MVP                               | 6     | sim                              |
| **Luka Dončić** (exceção nominal) | **7** | sim                              |
| All Star                          | 5     | sim                              |
| Suporte                           | 5     | **não — só a partir do nível 2** |
| Randola                           | 4     | **não — só a partir do nível 2** |

**Níveis** = jogos consecutivos abaixo do limiar:

```
1 jogo   → 🟡 nível 1
2 jogos  → 🟠 nível 2
3 jogos  → 🟢 nível 3
MVP no 3 → 🔵 MODO TURBO (raios e fogo) — E acumula os +4% de confiança
```

**Parâmetros homologados:** a média é a **da temporada inteira e móvel** (recalcula a cada
jogo novo). Um **jogo não disputado não quebra a sequência** — é como se a data não
existisse. "Abaixo" significa **abaixo do limiar** (média − delta), não abaixo da média pura.

> Efeito de borda conhecido: a sequência atravessa lesões longas. Um jogador com 1 jogo
> abaixo do limiar que se lesiona por 3 semanas volta ainda carregando nível 1. É o
> comportamento pedido; ver `05-perguntas-abertas.md`.

---

## Lista Secreta · Método 2 — OPD

Escala **invertida** em relação à oscilação: quem está mais perto da vaga recebe o nível
mais alto.

```
desfalque em bloco a partir do topo → os 3 seguintes apitam
   próximo imediato  → 🟢 nível 3
   segundo depois    → 🟠 nível 2
   terceiro depois   → 🟡 nível 1
```

**A trava crítica: o desfalque é obrigatoriamente prefixo da hierarquia.**

```
Luka fora, resto joga        → Reaves 🟢, Grimes 🟠, Kessler 🟡
Luka + Reaves fora           → Grimes 🟢, Kessler 🟠, Mamukelashvili 🟡
Reaves fora, Luka joga       → NENHUM apito
```

**Turbo da OPD** = OPD nível 3 **+** oscilação nível 2 → 🔵.
Ou seja: os dois métodos rodam em paralelo e se combinam. Não são exclusivos.

Escalações oficiais saem até 1h antes do jogo → a lista **reprocessa a cada mudança de
status** ao longo do dia.

---

## Fire Live — exclusivamente 1º quarto

| Caso                      | Alvo no 1Q        | Trava      |
| ------------------------- | ----------------- | ---------- |
| Pontos · classificado     | `(média/4) × 1,5` | alvo ≥ 4   |
| Pontos · **Randola**      | `(média/4) × 2,5` | alvo ≥ 4   |
| Pontos · não classificado | `(média/4) × 3`   | —          |
| Assistências              | `(média/4) + 1`   | só apg ≥ 5 |
| Rebotes                   | `(média/4) × 2`   | alvo > 2   |

**Arredondamento — resolvido por dedução.** Testei os 4 exemplos do documento contra as
políticas possíveis. Só uma satisfaz os quatro:

> precisão cheia no cálculo, arredonda meio-pra-cima **só no final**.

O `"11 rpg → 3 por quarto"` do exemplo de rebotes é arredondamento narrativo, não passo
operacional — se fosse operacional, o exemplo de pontos não-classificado daria 3 e não 4.

**Modo Fire** (só MVP e All Star): atingir **75%** da média total no 1Q → chamas na barra.

**Cruzamento entre estratégias:** em pontos, se o jogador já estava apitado em OPD
pré-live, a barra do Fire Live **precisa exibir isso**, com o nível e a cor da OPD.

### Restrição de presença — o bloco de topo

Suporte e Randola só apitam em pontos quando o **bloco de topo** do time está inteiramente
**fora da partida** (critério DNP — não é preciso rastrear substituição em tempo real):

```
bloco_topo =
   time COM MVP  → todos os jogadores nível MVP   (Philadelphia tem 2: exige os dois fora)
   time SEM MVP  → o jogador nº 1 da hierarquia   (vale para 15 dos 30 times)
```

Verificação que sustenta a unificação: em **todos** os times que têm MVP, o MVP é o
jogador nº 1. Logo os dois casos são a mesma regra. Ver [ADR-0006](adr/0006-bloco-de-topo.md).

Exceções que ignoram o bloqueio: **Utah, Detroit e Denver**.

---

## Testes-âncora

Contrato mínimo do motor. Devem ser escritos **antes** da implementação.
A1–A9 saem direto dos exemplos do documento do CJ. A10–A15 saem das respostas do cliente
de 18/08/2026 — cada resposta ambígua virou um teste que trava a interpretação.

| #       | Entrada                                      | Saída esperada                                |
| ------- | -------------------------------------------- | --------------------------------------------- |
| A1      | LeBron, média 25,7, Suporte                  | apita com ≤ 20                                |
| A2      | 24 ppg, classificado                         | alvo 1Q = 9                                   |
| A3      | 5,4 ppg, não classificado                    | alvo 1Q = 4                                   |
| A4      | 5 apg                                        | alvo 1Q = 2                                   |
| A5      | 11 rpg                                       | alvo 1Q = 6                                   |
| A6      | Luka + Reaves fora (Lakers)                  | Grimes 🟢, Kessler 🟠, Mamukelashvili 🟡      |
| A7      | Reaves fora, Luka joga                       | nenhum apito                                  |
| A8      | LeBron: jogos 25, 16, 20                     | oscilação nível 2                             |
| A9      | Mesmo apito avaliado 2×                      | 1 único disparo (idempotência)                |
| **A10** | Abaixo · DNP · abaixo                        | **oscilação nível 2** — o DNP não quebra (P2) |
| **A11** | Philadelphia, só Embiid fora                 | Suporte/Randola **bloqueados** (P7)           |
| **A12** | Philadelphia, Embiid **e** Jaylen Brown fora | Suporte/Randola **liberados** (P7)            |
| **A13** | Charlotte (sem MVP), nº 1 fora               | Suporte/Randola **liberados** (P6)            |
| **A14** | Randola em oscilação nível 2                 | confiança = tabela base, **sem bônus** (P8)   |
| **A15** | MVP em oscilação nível 3                     | anel **azul turbo** E confiança **+4%** (P9)  |

Se o motor passa nesses quinze, a fundação está certa.

---

## Probabilidade ≠ probabilidade

`Suporte, linha 20 pts = 80%` convive com `odd 3,00–5,00`. Uma odd de 4,00 implica ~25%
na conta da casa. Os dois números não são a mesma grandeza.

**Confirmado pelo cliente: o % é NOTA DE CONFIANÇA da análise do CJ, não probabilidade de
evento.** Por isso a seção do ruleset chama-se `confianca`, e não `probabilidades` — para
que o nome errado não sobreviva no código.

Consequência direta de UI: escrever "probabilidade: 80%" ao lado de uma odd configura
promessa de retorno. Ver `04-design-system.md`.
