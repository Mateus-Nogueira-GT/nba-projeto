# Design System — IA da NBA

## O problema que este documento resolve

Os documentos de origem carregam **três sistemas de cor simultâneos** disputando o mesmo
card, e dois deles usam as mesmas quatro cores com significados quase invertidos:

| Sistema             | Origem                           | Cores                                               |
| ------------------- | -------------------------------- | --------------------------------------------------- |
| Nível do jogador    | doc de estratégias (borda)       | dourado · prata · bronze · preto                    |
| Nível do apito      | doc de estratégias (círculo)     | 🟡 1 · 🟠 2 · 🟢 3 · 🔵 turbo                       |
| Escala de confiança | proposta comercial p.4 (badge %) | 🔴 0-29 · 🟠 30-50 · 🟡 51-69 · 🔵 70-86 · 🟢 87-99 |

Verde é o **melhor** na escala de confiança e o **terceiro** nível de apito. Azul é o
**penúltimo** na escala e o **turbo** no apito. Amarelo e laranja significam duas coisas
ao mesmo tempo no mesmo card.

## Regra estrutural

> **Cada informação precisa de um canal visual próprio.**

| Informação                     | Canal                                           | Estado                 |
| ------------------------------ | ----------------------------------------------- | ---------------------- |
| **Nível do jogador**           | borda metálica — dourado, prata, bronze, preto  | mantido                |
| **Nível do apito + confiança** | **anel único**: a cor é o nível, o número é o % | **fundido (ADR-0005)** |
| ~~Escala de 5 faixas~~         | —                                               | **removida**           |

### Por que a fusão é correta, e não só conveniente

O % do documento **só varia de 80 a 95**. Contra a escala de 5 faixas da proposta, isso
significa que vermelho, laranja e amarelo **nunca são atingidos** — todo card sai azul ou
verde. Uma escala de 5 faixas que usa 2.

Pior: o % é **derivado** de `nível do jogador + nível do apito`. Ou seja, a badge colorida
não carregava nenhuma informação que o anel já não tivesse. Era redundância pintada de
duas cores contraditórias.

> ⚠️ **Consequência contratual:** a p.4 da proposta aprovada vende a escala de 5 faixas.
> Essa mudança precisa ser comunicada ao cliente.

---

## Camadas de token

Três camadas, para que ajuste de marca não vire caça a hex no código.

```
primitivo    →  --nba-amber-500: #F5A524
                (paleta crua, sem significado)

semântico    →  --apito-nivel-1: var(--nba-amber-500)
                (intenção — é aqui que o resto do sistema fala)

componente   →  --card-anel-cor: var(--apito-nivel-1)
                (aplicação específica)
```

**Nenhum componente referencia primitivo diretamente.** Trocar a paleta inteira deve ser
um diff na camada primitiva.

### Tokens semânticos do domínio

```css
/* Nível do jogador — tratamento metálico, canal exclusivo */
--nivel-mvp:        /* dourado  */
--nivel-all-star:   /* prata    */
--nivel-suporte:    /* bronze   */
--nivel-randola:    /* preto    */

/* Nível do apito — canal exclusivo, definido pelo CJ */
--apito-nivel-1:    /* amarelo  */
--apito-nivel-2:    /* laranja  */
--apito-nivel-3:    /* verde    */
--apito-turbo:      /* azul + raios e fogo */
--apito-modo-fire:  /* chamas ao redor da barra */
```

---

## Anatomia do card

```
┌─────────────────────────────────────────────────────┐
│ ╔═══════╗                                  ╭─────╮  │  borda metálica = NÍVEL
│ ║ FOTO  ║  NOME DO JOGADOR          ANEL → │ 92% │  │  anel colorido  = APITO
│ ║       ║  ⬤ Time · Pos · PTS              ╰─────╯  │  número no anel = CONFIANÇA
│ ╚═══════╝  ▪▪▫▪▪  últimas partidas                  │
│                                                     │
│  odd 1,30 – 1,70 · média de N casas                 │
│  [OPD nível 2]  ← só quando há cruzamento pré-live  │
└─────────────────────────────────────────────────────┘
```

Elementos obrigatórios pelo documento do CJ: foto, nível, círculo de apito com a cor,
escudo do time, posição e o atributo principal (pontos / rebotes / assistências).

---

## Acessibilidade — requisito técnico, não boa intenção

O app comunica por cor em dois canais simultâneos. Sem redundância, uma parcela real dos
assinantes literalmente não consegue ler o produto que está pagando.

**Toda cor carrega codificação redundante:**

| Sinal            | Cor           | Redundância obrigatória                                 |
| ---------------- | ------------- | ------------------------------------------------------- |
| Nível do apito   | anel          | o **número do nível** visível (1/2/3)                   |
| Nível do jogador | borda         | **rótulo textual** (MVP / All Star / Suporte / Randola) |
| Turbo            | azul + efeito | movimento + ícone, nunca só a cor                       |
| Modo Fire        | chamas        | ícone + rótulo                                          |

Contraste mínimo WCAG AA (4.5:1 texto, 3:1 elementos gráficos). O amarelo do nível 1 é o
risco maior: **exige fundo escuro ou texto escuro dentro do anel**, nunca branco sobre amarelo.

### O que a implementação apurou

Ao calcular as razões de verdade (`tokens/contraste.ts`), duas coisas mudaram:

**O texto escuro dentro do anel não é exceção do amarelo — é regra dos quatro.** Sobre o
branco, os anéis dão 1,54 · 2,14 · 1,94 · 2,63; sobre o tom escuro, 12,67 · 9,08 · 10,02 ·
7,41. Uma regra única em vez de um caso especial.

**O "preto" do nível Randola virou grafite.** Borda preta sobre superfície escura tem razão
~1,3 e desaparece. Borda invisível não é canal — o grafite entrega 4,88:1. É desvio
consciente do documento de origem, pela razão que o próprio documento estabelece.

Todas as combinações da galeria são verificadas em `__tests__/tokens.test.ts`, e a própria
galeria imprime as razões calculadas em tempo de renderização.

---

## Escrita da interface

Decorre do fato de que o % **não é probabilidade** (ver `02-motor-regras.md`).

| ❌ Nunca             | ✅ Usar                              |
| -------------------- | ------------------------------------ |
| "Probabilidade: 92%" | "Confiança: 92"                      |
| "92% de chance"      | "Nível de confiança da análise"      |
| "Odd 1,45"           | "Odd média entre casas: 1,30 – 1,70" |
| "Entrada garantida"  | "Entrada sugerida pela estratégia"   |

A odd é sempre **faixa**, nunca valor único — ela varia por casa e por minuto, e exibir
um número exato cria expectativa que o produto não controla.

---

## Densidade

O produto é lido **em pé, com o jogo rolando, em segundos**. A leitura primária é a cor
do anel; o número é confirmação; o resto é contexto. Se o usuário precisa ler para
decidir, o card falhou — ele deve conseguir varrer a lista inteira sem ler nada além dos anéis.
