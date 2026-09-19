# Design System — IA da NBA

> **Referência atual: Identidade 04**, na seção final deste documento. As anatomias
> anteriores ficam como histórico. A escrita vigente distingue nota de confiança
> (inteira, sem `%`), taxa observada (com `%`) e nota da partida (uma casa decimal).

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
| "Odd 1,45" sem qualificação | "Odd média 1,45" ou "Faixa de odds 1,30–1,70", conforme o ruleset |
| "Entrada garantida"  | "Entrada sugerida pela estratégia"   |

A forma da odd obedece `odds.exibicao` no ruleset: `media` ou `faixa`. Esta é a
errata da decisão de 25/08, preservada pelo repasse da Identidade 04. A regra de
escrita é **nenhuma odd sem dizer o que é**. A tela não muda a escolha do ruleset,
nem trata cotação exibida como valor garantido na casa.

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
    - { de: 93, grau: 5, rotulo: SINAL MAIS FORTE, rotulo_curto: MAIS FORTE }
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

## Nota da partida

Badge de desempenho por jogador por jogo, escala 3–10, na aba de estatísticas.

**Paleta própria, nunca a do grau de confiança.** As duas escalas convivem no
app e significam coisas diferentes: a nota é desempenho já acontecido (dado
canônico), o grau é a força de um sinal de estratégia. Cor compartilhada faria
o assinante ler as duas como a mesma coisa.

Faixas: `<6` fraca · `6–6.9` mediana · `7–7.9` boa · `8–8.9` ótima · `9+`
excepcional. Uma casa decimal, vírgula. Sem nota (menos de 5 minutos em
quadra) imprime `—`, nunca `0`.

**Nome:** "nota da partida" ou "nota". Nunca "nível" — `nível do jogador` e
`nível do apito` são outra coisa no vocabulário do CJ.

## Identidade 04 — referência vigente

A implementação mantém Anton, Barlow Condensed e Barlow, a paleta Broadcast e as
três camadas de tokens. Lista Secreta e Fire Live priorizam leitura rápida; detalhe,
Resultados e Estatísticas oferecem a análise. A anatomia de três zonas do card e
a posição das abas ficam **congeladas durante a temporada**. Uma reorganização
exige uma feature própria, não uma correção de acabamento.

### Duas larguras de moldura

A `Moldura` tem duas larguras, nunca uma só (spec 12/09, §4.1). `leitura` (640) é a
coluna das telas de varredura — Lista Secreta, Fire Live, o detalhe do apito, Como
funciona: ali uma linha curta é decisão de legibilidade, não limitação. `dados` (1120)
é para o que carrega tabela, box score ou a conta da pessoa — Estatísticas, Resultados,
Gestão de banca, Perfil: nessas telas a largura vira informação, e a coluna de leitura
deixava a tabela espremida no meio de uma página vazia em volta. No celular as duas
caem para a largura da tela com o mesmo respiro de 16px — só o desktop distingue.

### Vocabulário numérico

| Informação | Escrita | Uso |
| --- | --- | --- |
| Nota de confiança | `90`, sem decimal nem `%` | Força da análise; nunca chance de retorno |
| Taxa da noite/temporada | `68%`, acompanhada da amostra | Resultados observados, fora do elemento da confiança |
| Nota da partida | `7,4` | Desempenho do box score, apenas na consulta de estatísticas |
| Linha | `20+` | Inteira; a leitura do card e a conferência usam a menor linha publicada |
| Odd | `ODD MÉDIA 1,55` ou faixa qualificada | Forma definida por `odds.exibicao`; sem links para casas |

O rodapé conferido preserva o artboard: linha e `fez N` com veredito; a odd continua
no detalhe. Esta descrição registra o comportamento existente, sem decidir a
pendência comercial sobre sua inclusão no card. A redação dos dois sentidos de
“média” também permanece como está até a decisão editorial do parceiro.

### Tokens e componentes

- `texto100`, `texto70`, `texto55`, `texto40`: hierarquia de texto; não substituem a
  verificação de contraste sobre a superfície concreta.
- `aoVivoSolido`, `aoVivoTinta`, `aoVivoBorda`: status ao vivo dentro do universo
  quente. Rótulo e forma acompanham a cor.
- `turboClaro`, `turboEscuro`: apoio ao turbo. O brilho quente pertence ao modo fire;
  não se aplica automaticamente a todo card da tela ao vivo.
- `duracaoEstado` (200 ms), `duracaoEntrada` (400 ms): transições breves, sem pulsação
  contínua. O número usa `tabular-nums` para não deslocar a leitura.
- `CabecalhoJogo`: única fronteira entre jogos, com siglas, horário, status e placar.
- `FormaNoAtributo`: últimos dez jogos e régua da linha; `Barrinhas` mantém os últimos
  cinco no card e pode destacar a conferência mais recente.
- `HierarquiaDoTime`: curadoria NIP por atributo com desfalques em prefixo; deixa visível
  a diferença entre time da lista e time atual do provedor.
- `BarraAlvo`: alvo, marco do modo fire e ponto do apito **somente quando existe o valor
  observado naquele instante**. Horário do apito não é valor; não se inventa esse ponto.
- `SeloContexto`, `FolhaDeFiltros` e `FaixaDemonstracao`: contexto explícito, recortes
  fora da lista de cards e aviso fino de dados simulados.
- `Coluna.soDesktop` na `Tabela`: esconde a coluna abaixo de 900 px — para o que só cabe
  na largura de dados, como nome do time por extenso ou jogos atrás do líder. `separadorApos`
  desenha, ao fim de uma linha, a régua cheia no dobro da espessura da régua entre
  registros — o corte de significado dentro da mesma tabela, como o fim do play-in na
  classificação. Quem usa qualquer um dos dois escreve ao lado o que ele significa: forma
  nunca é canal único.
- `AvatarUsuario` e os oito avatares prontos (`AVATARES_PRONTOS`): o rosto da CONTA, não
  o do jogador. Sem foto, as iniciais do nome; sem nome, a inicial do e-mail — nunca um
  quadrado vazio. Não é o `Avatar` do jogador: aquele carrega o anel do nível do apito e o
  fundo por time, que não significam nada para a pessoa dona da conta.
- **Logo nunca é canal único.** `LogoTime` aparece sempre ao lado da sigla ou do nome do
  time, nunca sozinha — é a sigla (ou o nome) que carrega a identificação quando a imagem
  falha ou não existe. `decorativo` só vale `true` quando o texto ao lado já nomeia o
  time; do contrário, é a própria logo que leva o `alt`.

### Ciclo e navegação

`PRE → Q1 → FIM_Q1 → AGUARDANDO_OFICIAL → CONFERIDO` é derivado da partida e do
box score. Jogo encerrado sem dado suficiente não recebe erro de aposta. Uma linha
com produção prova participação mesmo com minutos arredondados para zero. A linha
inteira zerada com zero minutos é DNP, neutra; minutos ausentes e produção ausente
aguardam dado oficial. Perfil, recap e contador usam essa mesma evidência.

A Lista agrupa por jogo ou por nível e reúne os atributos em um card por jogador.
As lentes `ULT5`, `MEDIA_LINHA`, `ODDS` e `HIERARQUIA`, junto da ordem, são preferências
por conta; filtros continuam na URL. O nome abre Estatísticas; o corpo do card abre
o detalhe do atributo escolhido. O Fire Live mantém o apito após o 1º quarto e
mostra o placar desse quarto, sem substituí-lo pelo total posterior da partida.

Resultados sem data abrem a última rodada conferida. Uma rodada ainda em andamento
declara espera, sem vender uma taxa parcial como resultado final da noite. A consulta
de Estatísticas mantém o elenco real; a seção explicitamente rotulada de apitos e
hierarquia usa a curadoria NIP. O adversário é resolvido no contexto de cada jogo.

### Verificação reproduzível

O fechamento usa os testes de tela em `src/app/__tests__/telas-04-*.test.ts`, as
verificações de componentes e a regressão de participação entre telas. O helper
`conferencia.ts` renderiza o HTML com o CSS real; `scripts/captura-telas.sh` produz
capturas de 390 px e desktop. `demo:conferir -- --pglite` semeia sete semanas com
`simularAte` e verifica leituras reais sem acessar o Neon. Captura estática verifica
apresentação; não substitui um smoke autenticado do deploy.

## Transmissão ao vivo e identidade oficial

A experiência de 08/09/2026 mantém a anatomia da Identidade 04 e acrescenta uma
camada de transmissão. O Fire Live apresenta um jogo por vez: o seletor horizontal
usa nome completo e escudo do catálogo oficial, e o painel sticky conserva placar do
primeiro quarto e quadra durante a rolagem. Cada alvo continua em cartão separado.

As transições são respostas finitas a mudanças reais de snapshot. Placar, progresso,
alvo batido e entrada em Modo Fire possuem movimentos distintos; não há relógio,
posse ou pulso contínuo inventado. `prefers-reduced-motion` prevalece sobre a intensidade
salva. Hover e foco do Modo Fire usam o mesmo vocabulário e preservam o rótulo textual.

O som local abre ligado em 50%, mas depende do primeiro gesto aceito pelo navegador.
Um lote de apitos produz um toque curto. Eventos vistos são limitados aos 100 mais
recentes, compartilhados por `BroadcastChannel`/`storage` e serializados por Web Locks
quando disponível. Mute local não altera Push; exclusões por jogador, atributo e canal
valem para os dois meios identificáveis.

Nomes de jogador exibidos vêm da projeção oficial por UUID/`personId`; aliases continuam
válidos para busca e regras editoriais. Casos sem vínculo confirmado permanecem no
relatório de reconciliação, sem fusão por sobrenome. Times usam `TIMES_NBA`, com nome
completo e SVG local, e podem ser acompanhados como atalhos sem expandir o elenco.

As preferências ficam em Perfil: intensidade, som, volume, somente acompanhados,
atributos e jogadores silenciados. Lista, Fire Live e perfis estatísticos oferecem o
controle de acompanhamento; páginas de time oferecem o equivalente para times.

---

## Identidade 05 — Manual da Marca (referência vigente)

Spec: `docs/superpowers/specs/2026-09-18-identidade-05-manual-da-marca-design.md`.

A paleta e as fontes são as do Manual da Marca (v1.0, 16/09/2026): azul `#0057B8` para ação
e estado ativo, vermelho `#C8102E` para atenção, navy `#001D3D` no cromo, cinza `#A6ABB4`
no texto secundário, branco no texto principal, e as quatro superfícies do manual (fundo
`#071426`, cartão `#101C30`, campo `#18243A`, divisória `#2A3852`). Bebas Neue em título
curto, chamada e número de impacto; Montserrat na interface, no campo, no botão e no dado.
O laranja saiu da interface. O 🟠 do nível 2 do apito ficou: é vocabulário homologado do
CJ, e sinal não é decoração.

**Azul é preenchimento, nunca tinta.** O azul do manual tem o mesmo matiz do azul do turbo
(212° contra 211°). Como texto sobre o cartão ele dá 2,48 e reprova; qualquer tinta clara o
bastante para passar em AA seria, aos olhos, o 🔵 do CJ — um quarto canal de cor dizendo o
que o anel já diz, e dizendo errado. Então o estado ativo é pílula preenchida com
`textoSobreAcento`, o link é branco sublinhado, o contorno ativo virou preenchimento e o
anel de foco é branco (`focoAnel`). O teste `tokens.test.ts` › "azul nunca é tinta" varre
`design-system/componentes`, `components` e `app` atrás de acento em `color`, `stroke`,
`border` ou `outline`.

**Vermelho: cheio no selo, claro na tinta.** `vivoSelo` é o vermelho do manual com branco
em cima (5,88); `aoVivo` e `alerta` são a tinta clara `#FF5C70`, que passa em AA como texto
sobre o cartão (5,70). É a mesma divisão que o app já fazia, com o pigmento trocado.

**Texto sobre cor virou dois tokens.** `textoSobreCor` (escuro) ficou para o número dentro
do anel do apito — sobre o amarelo do nível 1, o branco daria ~1,5, e é isso que o teste
"texto BRANCO dentro do anel reprovaria" registra. `textoSobreAcento` (branco) cobre tudo
que senta sobre o azul ou o vermelho: CTA, pílula ativa, selo, chip ativo.

**Os dois universos foram re-derivados do manual**, não inventados: o frio é o cartão e o
campo com 10% de azul; o quente, o cartão com 12% e o campo com 15% de vermelho — que dá
quase o roxo da identidade 03, agora com origem declarada.

Os canais de estratégia não mudaram: anel do apito, faixa metálica do nível do jogador,
rampa turquesa de confiança, nota da partida e o par das barrinhas seguem como estavam.

**A fonte de número é medida, não escolhida.** `scripts/medir-digitos.mjs` roda a família no
Chrome e mede os dígitos duplos; a Bebas Neue deu 27,20 px em todos, ou seja, largura fixa,
e por isso pode vestir placar, confiança e contador sem o card pular a cada refresh de 30 s.
Trocar a fonte de título obriga a medir de novo.

### A moldura de três regiões

A `Moldura` tem cromo, conteúdo e lateral, e o que muda entre larguras é só onde cada um
senta. Abaixo de 1024 px o cromo é a barra inferior; a partir dali é a barra do topo, com a
marca à esquerda, as cinco pílulas e o atalho da conta. A partir de 1280 px nasce a coluna
da direita, de 320 px, com a última noite conferida, a classificação por conferência e a
doca do assistente — e só nas telas de aba, porque o detalhe do apito e a tela teórica são
leitura corrida.

As DUAS barras saem no HTML e o CSS esconde uma. É isso que mantém a moldura como componente
de servidor: sem medir janela, sem `usePathname`, sem JavaScript em toda página só para
escolher uma barra. Os pontos de quebra vivem em `semantico.larguraTopo` e
`larguraLateral`, e o `.module.css` os repete porque media query não lê variável CSS — um
teste compara os dois.

A lateral é lida por `modules/entrega/lateral.ts` e cacheada por hora
(`app/(app)/lateral/leitura.ts`), com a tag revalidada pelo cron da rodada. Ela só lê dado
grátis, e é isso que permite um cache compartilhado entre usuários.

### A Lista na anatomia do StatsHub

Título, controles, contador, cards — a mesma página que o Player Trends. A fileira de
filtros tem duas formas: a folha inferior no celular (identidade 04) e um chip com menu por
grupo a partir de 1024 px, com o rótulo mostrando o que está filtrando. As lentes viraram
abas com sublinhado. Cada jogo é um `<details open>` cujo `<summary>` é o próprio
`CabecalhoJogo`; fechar um jogo é gesto da sessão, não preferência da conta. O contador
("37 entradas em 7 jogos") é o número da tela, e saiu da frase da rodada. Acompanhar virou
uma estrela no canto do card, no lugar do botão solto que quebrava o ritmo da grade.

### O paywall veste silhueta

O grátis vê a MESMA moldura do assinante — sobrancelha, H1, selo, cabeçalhos de jogo reais —
com uma faixa azul no topo e silhuetas no lugar dos cards. A silhueta é forma pura: a única
prop é `forma`, ela não recebe dado nenhum e a quantidade de blocos é fixa, porque quantos
apitos existem hoje também é sinal. Desfoque é CSS, e CSS o leitor desliga: um conteúdo real
borrado entregaria nome, nível e confiança no código-fonte de quem não paga. `paywall.test.ts`
e `telas-05-gratis.test.ts` cobram as duas coisas — a assinatura da silhueta e a ausência de
qualquer nome do feed no HTML do grátis.
