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

---

## Identidade 02

> **Nota de 25/08/2026 — parcialmente superada pela Identidade 03 (abaixo).**
> A anatomia do card, o fundo chapado e a pílula como portadora única da cor
> mudaram de novo. O que esta seção estabelece de DOUTRINA continua integral:
> um canal por informação, rampa mono-matiz, brilho de confiança só no grau
> máximo, redundância escrita em todo sinal. A 03 é outra execução das mesmas
> regras.

A seção acima descreve o desenho original, de quando este documento foi escrito, com um
**anel único** fundindo apito e confiança (ADR-0005). O visual mudou de novo em agosto de
2026, a partir do mockup de referência do cliente. Esta seção documenta o que está no ar
hoje — não substitui a anterior, porque a lógica de "um canal por informação" e a
proibição de reintroduzir a escala multi-matiz continuam valendo integralmente; só a
forma de aplicá-las mudou. Se você está mantendo o design system daqui a alguns meses,
leia esta seção primeiro — ela é a que corresponde ao código de `src/design-system/`.

### Tipografia

Três famílias, cada uma com um papel fixo — não são intercambiáveis:

| Token semântico       | Família                        | Papel                                              |
| ---------------------- | ------------------------------- | --------------------------------------------------- |
| `semantico.fonteTitulo` | Anton (`--fonte-anton`)        | títulos, nomes de jogador, números grandes (a pílula de confiança, o placar) |
| `semantico.fonteRotulo` | Barlow Condensed (`--fonte-barlow-condensed`) | rótulos em caixa alta e letter-spacing largo — sobrancelhas, linhas de apoio, chips |
| `semantico.fonteCorpo`  | Barlow (`--fonte-barlow`)      | texto corrido, quando existe (a identidade 02 é quase toda título+rótulo) |

As três são carregadas via `next/font/google` em `src/app/layout.tsx` e expostas como
variáveis CSS (`--fonte-anton` etc.); os tokens primitivos (`primitivo.ts`) sempre
declaram um fallback de sistema depois da variável, então uma falha de rede no Google
Fonts degrada para `Arial Narrow`/`system-ui`, nunca quebra o layout.

### A pílula de confiança e a rampa turquesa

A pílula (`design-system/componentes/Pilula.tsx`) é o componente de contorno genérico —
ela não sabe se está mostrando confiança, o selo VIVO ou qualquer outra coisa; quem chama
decide a cor e o texto. Para a confiança especificamente (`CardEntrada.tsx`), a cor vem
de `faixaDaConfianca` (`src/modules/motor/confianca.ts`, motor puro — não lê nada, só
recebe o valor e o ruleset) mapeada para um token `semantico.confiancaGrau{1..5}`.

Os cinco degraus são **um matiz só, turquesa**, de escuro (grau 1, menor confiança) a
claro (grau 5, maior) — `primitivo.ts`, `turquesa700` → `turquesa300`. Isso é
deliberado, não estético: uma escala de matizes diferentes (a da proposta comercial
original, vermelho→azul→verde) colide visualmente com as quatro cores categóricas do
apito (🟡🟠🟢🔵) e cria o mesmo conflito de leitura que o ADR-0005 eliminou em 18/08. Uma
rampa de intensidade dentro de um único matiz nunca é confundível com uma cor categórica
— é sempre "mais ou menos saturado de turquesa", nunca "isto é amarelo ou isto é verde".

Os cinco limiares (não os cinco tons — os **valores de confiança** que definem cada
degrau) vêm do ruleset, não do código:

```yaml
# config/ruleset.v1.yaml
confianca_exibicao:
  origem: demonstracao # calibração real ainda é pergunta em aberto ao CJ
  faixas:
    - { de: 80, grau: 1, rotulo: CONFIANÇA BOA }
    - { de: 83, grau: 2, rotulo: CONFIANÇA SÓLIDA }
    - { de: 86, grau: 3, rotulo: CONFIANÇA FORTE }
    - { de: 89, grau: 4, rotulo: CONFIANÇA MUITO FORTE }
    - { de: 93, grau: 5, rotulo: CONFIANÇA MÁXIMA }
```

Note a amplitude: 80 a 93+, porque a confiança calculada pelo motor **só varia de 80 a
95** na prática (é derivada de nível do jogador + nível do apito, não um número livre).
Uma escala pensada para 0-99 gastaria a maior parte dos seus degraus em valores que nunca
ocorrem — o mesmo defeito, na origem, que motivou remover a escala em primeiro lugar.
Trocar esses cinco valores não exige tocar em código (regra 1 do CLAUDE.md do projeto).

### A regra do brilho: só o grau 5

O card ganha um brilho ao redor (`boxShadow` na cor da pílula) exclusivamente quando
`grauConfianca === 5` — a faixa máxima. É um sinal deliberadamente raro: se qualquer grau
brilhasse, o brilho deixaria de significar "isto aqui é excepcional" e viraria decoração.
`CardEntrada.tsx`, variável `brilha`.

### Colisão de canais — verificada por teste, não por inspeção

`src/design-system/__tests__/tokens.test.ts`, describe `'rampa de confiança (identidade
02)'`, confere mecanicamente três coisas toda vez que a suíte roda:

1. nenhum dos cinco degraus da rampa turquesa é igual a uma cor categórica do apito ou a
   uma cor metálica de nível do jogador;
2. os cinco degraus são todos distintos entre si (a rampa não "achata" em algum ponto);
3. todo degrau passa em contraste AA (4.5:1) como texto sobre a superfície do card.

Se alguém trocar um valor de `turquesa*` em `primitivo.ts` para algo que colida com uma
cor do apito, é este teste que quebra — não um comentário lido meses depois.

### O que mudou no anel do apito

O "anel único" do ADR-0005 (um círculo cuja cor era o nível do apito e cujo número era a
confiança) não existe mais como um único elemento: virou dois. O nível do apito é hoje a
borda colorida do `Avatar` (um quadrado arredondado, não mais um círculo — ver
`Avatar.tsx` e os testes de `como-funciona`) mais o selo de canto `N{1,2,3}`/`T`; a
confiança é a pílula separada descrita acima, com sua própria cor. Ver a nota de
"superação parcial" em `docs/adr/0005-fusao-badge-confianca.md` para o histórico completo
dessa mudança e o que da decisão original ainda vale.

## Identidade 03 · Broadcast

Reforma de 25/08/2026 (spec
[`2026-08-25-identidade-03-broadcast-design.md`](superpowers/specs/2026-08-25-identidade-03-broadcast-design.md),
brainstorm com mockups aprovados no navegador). O diagnóstico que a motivou: a 02
acertou a direção "transmissão esportiva" e falhou no acabamento. Tipografia
intocada (Anton/Barlow Condensed/Barlow).

### O que mudou

- **Fim do fundo chapado.** `componente.fundoTela` é gradiente (175°, tinta800 →
  marinho850); a `Moldura`, a `MolduraConta`, `/entrar` e `/offline` o usam. O
  admin fica utilitário de propósito — é ferramenta interna.
- **Card em 3 zonas:** cabeçalho (avatar · nome · apoio · % em Anton 30px na cor
  do grau) · contexto (Barrinhas no pré-live, BarraAlvo no Fire Live) · rodapé
  (faixa translúcida com linha · média · odd). Borda lateral esquerda de 3px na
  cor do grau de confiança.
- **Temperatura por contexto.** Pré-live é FRIO (`componente.contextoFrio`); o
  Fire Live inteiro é QUENTE (`contextoQuente`, roxo/laranja) — a urgência é da
  tela ao vivo, não só do modo fire. Testes transversais garantem que nenhuma
  tela pré-live veste o universo quente.
- **Três brilhos, três donos** (teste nominal em `card.test.ts`): grau 5 de
  confiança → card na cor do grau · turbo → `turboBrilho` azul · modo fire →
  brilho do universo quente. O mockup dava brilho no % de grau 4; a doutrina
  venceu o mockup.
- **Barrinhas com par próprio.** `barrinhaBateu #2FBF71` / `barrinhaFalhou
  #CC3B3B` — o verde do mockup era o categórico do apito nível 3 (colisão de
  canais) e o vermelho reprovou em AA com o valor escrito dentro (3.75 → 4.93).
- **Componentes novos:** `Barrinhas` (últ. 5 com VALOR), `PlacarMini` (sem
  cronômetro — decisão da spec 02 mantida), `BarraAlvo`, `ChipFiltro`. Todos na
  galeria do admin.
- **Exclusão de jogadores no Fire Live** (`jogadores_ocultos`): preferência por
  CONTA, recorte de leitura puro; o push não cala (pergunta ao CJ).

### Pendência de lapidação (auditoria da manhã)

O selo PREENCHIDO no topo direito do cabeçalho ("PRÉ-LIVE" laranja / "■ AO
VIVO" vermelho), presente nos mockups, não foi implementado — o `CabecalhoTela`
comunica o contexto por sobrancelha + marcador colorido. Reestruturar o
cabeçalho de todas as telas por um badge ficou para depois da auditoria.
