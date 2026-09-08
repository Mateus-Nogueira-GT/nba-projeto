# Identidade 04 · Varredura e análise: a passada de UX com os aspectos do Sofascore

**Data:** 07/09/2026 · **Status:** brainstorm fechado por grilling (22 perguntas, 3 rodadas) e
confirmado pelo parceiro; **os cinco artboards foram aprovados em 07/09** e as fases 1–7 estão
em execução; o fechamento inclui o loop de depuração automática da §10
**Herda de:** [`02 Rota Transmissão`](2026-08-24-identidade-rota-transmissao-design.md) e
[`03 Broadcast`](2026-08-25-identidade-03-broadcast-design.md), que ficam. Depende de
[`temporada simulada`](2026-09-06-temporada-simulada-design.md) mesclada (PR #12).
**Fontes:** pesquisa do Sofascore por quatro ângulos (estrutura, visual, features, crítica);
inventário do front atual; as cinco telas renderizadas a 390 px.

---

## 1 · Objetivo em uma frase

Dar ao assinante um app que se **lê por varredura** onde ele decide (Lista Secreta, Fire
Live) e que **recompensa a análise** onde ele quer entender e conferir (detalhe do apito,
Resultados, Estatísticas) — preservando a identidade Broadcast e trazendo do Sofascore a
gramática, não a paleta.

## 2 · Problema

O parceiro abriu o app e disse: "a UX no geral está muito feia". Renderizadas a 390 px, as
telas mostram o porquê. A identidade está lá — escuro, Anton, laranja, universo frio e
quente — mas **tudo é texto dentro de caixa**: nenhum rosto (só monogramas), nenhum
escudo, seis fileiras de filtros antes do primeiro card da Lista, o mesmo jogador três
vezes seguidas (um card por atributo), e a aba de Estatísticas é uma grade de caixinhas
com sigla e número. É consistente e é funcional. Parece protótipo porque não tem
*matéria*: imagem, hierarquia, respiro.

O que o parceiro viu no Sofascore — e marcou: o **ao vivo**, a **tela de partida**, o
**rating do jogador** e o **polimento** — não é quantidade de dado na tela. A pesquisa
foi clara: o Sofascore é sofisticado porque tem uma gramática que se aprende uma vez e
se lê por varredura (um átomo visual na mesma posição em toda tela; densidade obtida
*removendo* cromo; cor sempre semântica; número como protagonista tipográfico; tempo
real delegado ao push). E a crítica mostra o limite dele: venceu como app para
**analisar um jogo a fundo** e perde para o Flashscore na **varredura rápida** — toda vez
que algo estranho (anúncio, aba de odds, redesign) quebra a fronteira entre seções, a
sofisticação some.

Para nós isso divide o produto em dois trabalhos. **Levar a densidade do detalhe para o
card da lista é exatamente o erro que "parecer Sofascore" induz.**

## 3 · Princípios (fechados no grilling)

1. **Para o assinante**, em uso diário, à noite, com o jogo rolando. A apresentação ao
   cliente é gate, não alvo: o que impressiona numa demo é uma tela que parece feita para
   uso diário.
2. **A identidade fica.** Anton / Barlow Condensed / Barlow; tema escuro; laranja de UI;
   rampa de confiança turquesa mono-matiz; universo frio (pré-live) e quente (Fire Live);
   as três camadas de token; os três canais do card (faixa metálica = nível do jogador,
   anel = nível do apito, borda lateral = grau de confiança). Do Sofascore vêm padrões de
   interação e de acabamento, **não paleta** — a escada de cores do rating dele não entra.
3. **Varredura e análise.** Lista Secreta e Fire Live ficam **mais enxutas**: um sinal por
   card, a cor da borda decide, nada antes do primeiro apito. A sofisticação vai para o
   detalhe do apito, os Resultados e as Estatísticas.
4. **Ao vivo sem WebSocket.** A regra de arquitetura não muda: o push é o canal de tempo
   real; o feed é snapshot. O refresh de 30 s que hoje só a tela de partida tem vai para
   o Fire Live. A sofisticação é na *apresentação* do ao vivo, não na latência.
5. **As cinco abas ficam.** ENTRADAS · AO VIVO · STATS · GESTÃO · PERFIL. A casa é a Lista
   Secreta.
6. **Tela crua não entra.** Nenhuma tela vira código antes de um mockup aprovado. A spec
   vem com os mockups; o plano de implementação nasce depois da aprovação.
7. **Nada entre o assinante e o apito.** Nenhum modal durante o 1º quarto; nenhum bloco
   antes do sinal do apito no card (narrativa e odd vêm *depois* do nível e do grau).
8. **Regras de escrita continuam invioláveis.** O % é nota de confiança, nunca
   probabilidade; a nota da partida se chama "nota", nunca "nível"; linha sempre inteira
   com "+"; odd sempre faixa.

## 4 · Por tela

### 4.1 · Lista Secreta — varredura

**Estrutura.** Agrupada **por jogo**, em ordem de horário. O cabeçalho do jogo —
`BOS @ OKC · 21h30` — é a **única fronteira de seção** da tela: sem divisórias entre
cards, sem títulos intermediários. Dentro de cada jogo, os cards em ordem de nível do
apito e grau (turbo primeiro).

**Alternância.** Um seletor no cabeçalho da tela: **POR JOGO** (padrão — montar a noite)
· **POR NÍVEL** (pegar os melhores — os cards em ordem global de nível e grau, com a
sigla do jogo em cada um). Persistido por conta, pelo mesmo mecanismo de
`jogadores_ocultos`.

**Filtros.** A parede de seis fileiras sai da tela. Vira um botão **FILTRAR** no cabeçalho
que abre uma folha inferior com os mesmos recortes (quantidade, atributo, método, nível,
time, posição). Recorte ativo aparece como um chip só, ao lado do botão, com o "×" para
limpar. Os filtros continuam na URL.

**O card.** O card de três zonas continua sendo o **único formato** (foi aprovado pelo
cliente; a leitura primária é a cor da borda). O que muda nele:
- ganha o **rosto** do jogador (ver 5.3) e a **sigla do time forte** no lugar do escudo;
- a zona 2 (contexto) mostra por padrão as barrinhas dos últimos 5; um chip de **lente**
  no cabeçalho da tela troca a zona 2 de *todos* os cards de uma vez — `ÚLT. 5` ·
  `MÉDIA × LINHA` · `ODDS` · `HIERARQUIA` — sem abrir card nenhum;
- o mesmo jogador com dois ou três atributos vira **um card com abas de atributo**
  (PTS · REB · AST) no rodapé, em vez de três cards seguidos — o que a tela de hoje mais
  repete;
- o link "linhas e confiança →" entre os cards some: o card inteiro é o link para o
  detalhe, e o nome do jogador é o link para as Estatísticas (os dois caminhos que já
  existem).

**Estado vazio antes da publicação.** "Próxima lista às 20h30" + os Resultados de ontem.
Nunca tela em branco.

### 4.2 · Fire Live — varredura, quente

**Estrutura.** A mesma de 4.1: por jogo, com o cabeçalho do jogo trazendo o **placar do
1º quarto** (o `PlacarMini` de hoje vira o cabeçalho de seção). Três estados naturais,
como chips no topo e como ordem: **NO 1º Q AGORA** (puxado para cima) · **AGUARDANDO** ·
**1º Q ENCERRADO**. O apito não some quando o quarto acaba: congela no estado final.

**Ao vivo, honesto.** Um dicionário de status de largura fixa (`PRÉ · 1º Q · FIM 1º Q ·
FT`) sempre na mesma posição do card, para nada pular a cada refresh. Um token semântico
`aoVivo` próprio — sólido + tinta — distinto do erro de rede, do amarelo do nível 1 e do
laranja do nível 2 (o Fire Live inteiro é quente; o ao vivo precisa se destacar *dentro*
do quente). O selo **■ AO VIVO** no canto do cabeçalho, pendência anotada desde a 03.
Carimbo **"atualizado há 12 s"** no cabeçalho e a frase, uma vez por tela: *o apito chega
no push; a tela é o detalhe*. Nunca esconder a defasagem.

**Refresh.** `AtualizarAoVivo` (30 s, só com a tela visível) passa a ser montado no Fire
Live enquanto houver jogo em 1º quarto. Anima-se **só** a chegada de apito novo e a
mudança de nível (≤ 200 ms); nada pulsa continuamente.

**A barra.** A `BarraAlvo` ganha **dois marcos** visíveis — 75% da média (modo fire) e a
linha da entrada — e o ponto **"apitou aqui"**, no instante do push. Depois de FIM 1º Q
a barra congela. Não entra sparkline por minuto: os snapshots são a cada 30 s e a
janela tem 12 minutos; uma curva de 24 pontos sugere um tempo real que não existe.

### 4.3 · Detalhe do apito — análise

Página de entidade com **esqueleto fixo**: a ordem das seções não muda durante a
temporada.

- **Cabeçalho**: avatar com rosto, anel do nível do apito e selo N1/N2/N3/T; nome
  (link para Estatísticas); atributo e linha; pílula do grau de confiança com o %.
- **Acima da dobra**: o **fato gerador** em uma frase (a narrativa LLM) e o gráfico
  **jogador × linha** — a comparação que importa para o apostador é contra a *linha*,
  não contra outro jogador.
- **Forma no atributo**: os **últimos 10** jogos como barras verticais com o valor, a
  linha marcada como régua horizontal, bateu/não bateu no par próprio das barrinhas. É a
  oscilação visualizada; as `Barrinhas` de 5 continuam no card.
- **Comparação**: média da temporada · linha · adversário (o que o provedor der).
- **Por que entrou**: uma linha por fator que disparou, em ordem fixa e no vocabulário do
  CJ — nível do jogador no atributo; método com o **fato** que o sustenta (oscilação: os
  N jogos abaixo do limiar, com os valores; OPD: quem do topo está fora, com a hierarquia
  mostrada — Philadelphia com dois MVPs fica óbvio); modo fire; turbo (qual das duas
  regras). **Sem pesos**: os fatores e os fatos, nunca o bônus de nível nem o "+4 do
  turbo" — mostrar a fórmula expõe o CJ e faz o % parecer soma de probabilidades. A
  narrativa é legenda dessa lista, não substituto.
- **Odds por casa**: a lista completa que o card resume, em **texto**, sem logo, sem
  link, sem CTA; a faixa e a média no topo; o disclaimer do ADR-0004 fixo no rodapé.
- **O jogo**: placar por quarto, desfalques, próximo jogo do jogador.
- No Fire Live, a mesma página com a seção do 1º quarto no topo (pontos no 1º Q × 75% ×
  linha).

### 4.4 · Resultados — análise, o recap da noite

- **Âncora "Hoje"** com setas ontem/amanhã e a data na rota (`/resultados/2026-09-07`).
  O rótulo é da *rodada*, não da data local.
- **Cabeçalho da noite**: `N apitos · N bateram · taxa` e o **apito da noite** em
  destaque (o maior valor sobre a linha, ou o turbo que bateu).
- **Contador da temporada**: a taxa de acerto acumulada desde o início da janela, com o
  número de apitos conferidos — agora que ela é consequência das regras, é o argumento
  de venda do produto e vive aqui.
- **Agrupado por jogo**, com o placar final por quarto no cabeçalho de seção — a mesma
  gramática de 4.1 e 4.2.
- **O card conferido** é o mesmo `CardEntrada`, no estado CONFERIDO (ver 5.1): o rodapé
  `PONTOS 24+ · ODD 1,30–1,70` recebe **`fez 27 ✓`** (ou `fez 19 ✗`); a barrinha nova
  entra na sequência; DNP é neutro, nem ✓ nem ✗.
- Os greens do Fire Live continuam como bloco próprio, com o marco batido.

### 4.5 · Estatísticas — análise, dado canônico

A sobrancelha `DADO CANÔNICO · SEM ESTRATÉGIA` continua em toda tela da aba. **A nota da
partida é "o número" do jogador** — no box score, nas listas e como média recente no
perfil. Ela **nunca** aparece no card do apito: competiria com o nível do apito e o grau,
que medem outra coisa.

- **Índice**: a busca no topo; **jogos do dia** como lista com sigla forte, horário e —
  quando houver — placar e status (`1º Q · AO VIVO`), a mesma fila do Fire Live vista
  pelo lado do dado; **classificação** como tabela (posição, sigla forte, V–D, %,
  sequência, últimos 5 como pontinhos), com o trilho de playoff/play-in marcado, em vez
  da grade de caixinhas.
- **Jogador**: cabeçalho com rosto, nome, time atual, posição; **quatro números grandes**
  (pontos, rebotes, assistências, nota média recente); bloco "Em jogo" quando ao vivo;
  **histórico de apitos** do jogador com ✓/✗ — a versão nossa da aba *Games* com rating,
  e o mecanismo de confiança verificável aplicado ao CJ; a tabela de jogos com o valor
  do atributo e a nota da partida por jogo.
- **Time**: campanha; **a hierarquia do CJ por atributo**, com o desfalque marcado em
  **prefixo** — é a OPD visualizada (o *depth chart* do Sofascore com a regra do CJ em
  cima); box por jogo. As **duas visões** de time rotuladas na tela, sem ambiguidade:
  **"time na lista do CJ"** (`mapa_jogadores`, projetado — Giannis no Miami) e **"time
  atual"** (`jogadores.time_id`, o real do provedor). A crítica ao Sofascore mostra que
  cobertura inconsistente é lida como bug; aqui a inconsistência é *intencional* e por
  isso precisa de rótulo.
- **Jogo**: a tela de partida já é a mais próxima do alvo; recebe o rosto no box score,
  o **1º quarto em destaque** no placar por quarto (é o que o Fire Live observa) e os
  desfalques com a hierarquia marcada.

## 5 · Transversal

### 5.1 · O card fecha o ciclo

O `CardEntrada` ganha um **ciclo de vida explícito** e é o **mesmo componente** na Lista
Secreta, no Fire Live e nos Resultados: `PRÉ → 1º Q → FIM 1º Q → FT → CONFERIDO`. O
estado vem do jogo e do box score, nunca de um campo digitado. Ao virar CONFERIDO, o
rodapé recebe `fez N ✓` / `fez N ✗`. **Conferência pela linha mais baixa** — a que as
barrinhas já leem: quem pegou a linha de 20 e viu 23 acertou, mesmo que 25 e 30 não
tenham caído. Antes de marcar ✓/✗ há um estado explícito **"aguardando dado oficial"**
com o carimbo da última atualização; nunca inferir de parcial.

### 5.2 · A nota da partida como o número do jogador

Já existe (Game Score de Hollinger normalizado de 3 a 10, paleta própria, vocabulário
travado). Passa a aparecer também na lista de jogadores, no índice e como **média
recente** no perfil. Regra: nunca ao lado do % de confiança de um jeito que pareça a
mesma coisa; nunca no card do apito.

### 5.3 · Imagem

- **Rostos**: curadoria do mapa completo — os 229 jogadores da lista do CJ, com as grafias
  dele, cada `personId` da NBA verificado **um a um** contra o CDN *e contra o nome*
  (responder 200 não prova identidade: id trocado é o rosto de outra pessoa). O mapa
  atual tem 13 nomes.
- **A foto é lida ao vivo** de `jogadores.foto_url` na leitura do feed, não congelada
  no JSON do snapshot na publicação. Hoje ela é apresentação presa dentro de estratégia;
  foi o que deixou 0 de 137 cards com rosto na carga de 07/09.
- **Escudos: não.** São marca registrada e o produto é pago; até resposta por escrito,
  a **sigla em tipografia forte** (Anton, tamanho de título) faz o papel — resolve a
  maior parte do efeito sem o risco.

### 5.4 · Acabamento

No design system existente, sem trocar paleta:

- um token de **texto em cinco opacidades** (`texto100 … texto40`) para separar número
  de rótulo em cards e tabelas — é assim que o Sofascore obtém densidade sem borda;
- `font-variant-numeric: tabular-nums` em linhas, odds, graus, placares e tabelas;
- tokens de **duração**: `≤ 200 ms` para estado, `300–500 ms` só para a entrada de card
  novo; nada pulsa continuamente;
- o token `aoVivo` sólido + tinta (4.2), e o selo de contexto no cabeçalho (`PRÉ-LIVE`
  laranja / `■ AO VIVO` vermelho) que a 03 desenhou e nunca entrou;
- o azul do turbo ganha par claro/escuro e tinta a 20–25% para o brilho;
- a **faixa de demonstração** ganha o visual definitivo (deixado para esta passada pela
  spec da temporada): uma linha fina em `texto60` sobre `superficieElevada`, nunca um
  banner.

### 5.5 · Narrativa: o que a UX herda da carga de 07/09

Três defeitos anteriores a esta passada, mas que ela expõe no card e por isso entram:

- **O prompt faz o modelo inventar o % de confiança.** O sistema diz que "o percentual é
  nota de confiança" e os fatos enviados não incluem o percentual; o modelo escreve
  "nota de confiança: 66%" e o validador reprova — 219 de 276 chamadas em 07/09. Correção:
  instruir "não cite o percentual; ele já está no card" e pedir 240 caracteres para não
  estourar 280. Regra de estratégia não muda.
- **A republicação após as odds regera todas as narrativas.** Reaproveitar a narrativa
  do snapshot anterior quando (jogador, atributo, linha) é idêntico; gerar só para item
  novo. Corta o custo diário pela metade.
- **Fotos** — ver 5.3.

## 6 · Arquitetura

```
src/design-system/tokens/semantico.ts     + texto100…texto40, aoVivo, duracoes, turboClaro/Escuro
src/design-system/tokens/componente.ts    + cabecalhoJogo, cardConferido, seloContexto, faixaDemo
src/design-system/componentes/
  CardEntrada.tsx                          estado do ciclo (PRÉ…CONFERIDO), abas de atributo,
                                           rodapé "fez N ✓/✗", rosto
  CabecalhoJogo.tsx                        NOVO · "BOS @ OKC · 21h30" + placar/status; única fronteira
  FormaNoAtributo.tsx                      NOVO · últimos 10 como barras com a linha marcada
  HierarquiaDoTime.tsx                     NOVO · a lista do CJ por atributo com o desfalque em prefixo
  SeloContexto.tsx                         NOVO · PRÉ-LIVE / ■ AO VIVO
  Barrinhas.tsx, BarraAlvo.tsx             marcos e "apitou aqui"; barrinha nova ao conferir
  Tabela.tsx                               nota, rosto, tabular-nums
src/components/navegacao/
  CabecalhoTela.tsx                        seletor POR JOGO / POR NÍVEL, botão FILTRAR, chips de lente,
                                           carimbo "atualizado há Ns"
  FolhaDeFiltros.tsx                       NOVO · folha inferior com os recortes; filtros seguem na URL
  FaixaDemonstracao.tsx                    visual definitivo
src/modules/entrega/
  lista-secreta.ts                         fotoUrl lida ao vivo; agrupamento por jogo; estado do ciclo
  resultados.ts                            recap da noite, apito da noite, contador da temporada,
                                           "aguardando dado oficial"
  estatisticas/{jogador,time}.ts           histórico de apitos ✓/✗; hierarquia por atributo; nota média
  narrativa.ts                             prompt sem percentual, 240 chars; reaproveitamento por item
  preferencias.ts                          NOVO · ordem (jogo/nível) e lente por conta — mecanismo de
                                           jogadores_ocultos
src/app/(app)/
  page.tsx, fire-live/page.tsx             por jogo; AtualizarAoVivo no Fire Live
  apito/[jogadorId]/page.tsx               esqueleto fixo de análise
  resultados/[data]/page.tsx               NOVO · data na rota; /resultados redireciona para hoje
  estatisticas/**                          índice, jogador, time, jogo
src/modules/ingestao/demo/fotos.ts         mapa completo, verificado nome a nome
```

O motor **não muda**. O "por que entrou" lê o que o apito já registra (método, nível,
histórico); se um fato não estiver no apito, ele vem de `montarFatos` na leitura — nunca
recalculado na tela (regra `tela-nao-chama-o-motor`).

## 7 · Mockups

Um canvas com **cinco artboards a 390 px**, na identidade atual, cada um com o estado
principal e um estado secundário:

1. Lista Secreta — por jogo; e por nível (variante)
2. Fire Live — no 1º Q agora; e 1º Q encerrado
3. Detalhe do apito — pré-live; e no Fire Live
4. Resultados — a noite; e o card conferido em close
5. Estatísticas · jogador — perfil; e time com a hierarquia

Gate: nenhuma tela vira tarefa do plano antes de o parceiro aprovar o artboard dela.
Aprovação parcial libera tarefas parciais.

## 8 · Fora de escopo e em stand-by

- **Stand-by, com o CJ**: o fuso da rodada — Brasília parte a noite americana em duas
  rodadas e joga a costa oeste em "amanhã"; a unidade natural do apostador é a noite de
  NBA. É uma linha no ruleset e muda o rótulo de toda tela com data.
- **Fora desta passada**: notificações granulares (escopo não contratado); compartilhar
  card como imagem (decisão comercial); movimento de odds desde a publicação (depende do
  contrato com as casas); linha compacta na Lista (o card foi aprovado); Live Activities
  e widgets (PWA não tem); qualquer recurso social; escudos de time.
- **Não copiar, nunca**: probabilidade em qualquer forma (win probability, implied,
  winning odds em %); casas decimais no score de confiança; attack momentum de time,
  play-by-play, heatmap; anúncio, interstício ou modal no 1º quarto; paywall que fatia o
  sinal.

## 9 · Ordem

1. Tokens e componentes novos (5.4, `CabecalhoJogo`, `SeloContexto`, `FormaNoAtributo`,
   `HierarquiaDoTime`), com a galeria de admin atualizada — é o alfabeto das telas.
2. Foto ao vivo + curadoria dos rostos + prompt da narrativa + reaproveitamento (5.3, 5.5)
   — o que dá matéria às telas antes de redesenhá-las.
3. Lista Secreta (4.1) e o ciclo do card (5.1).
4. Fire Live (4.2).
5. Detalhe do apito (4.3).
6. Resultados (4.4).
7. Estatísticas (4.5).

Cada tela: mockup aprovado → tarefa → fumaça renderizada → `demo:conferir`. Depois do
lançamento, **anatomia do card e posição das abas congelam pela temporada**; mudança só
com feature junto — o app é ritual diário e cada reorganização cobra reaprendizado de
toda a base.

## 10 · Depuração automática — o loop de fechamento

Pedido do parceiro em 07/09, depois de ver as telas prontas: **"debugue tudo automático,
como se fosse um loop"**. Esta seção é o contrato desse loop.

### 10.1 · Por que ele existe

A suíte prova que cada peça responde. Ela não prova que **a noite inteira fecha**. Esta
passada mexeu em nove telas por três frentes paralelas, e os defeitos que sobram depois de
uma integração assim não são de unidade — são de **costura**: a mesma partida com data
diferente em duas seções da mesma tela (achado real da revisão da 5.1, causado por ler o
rótulo da rodada em UTC de um lado e o horário do jogo no fuso do outro); o mesmo apito com
linha de um jeito na Lista e de outro no detalhe; um estado de borda que nenhum teste
visitou porque o sorteio da temporada não o produziu naquele dia.

Achado de costura não aparece para quem olha um arquivo. Aparece para quem **roda a noite
inteira e compara o que as telas dizem entre si**. É isso que o loop faz, e é por isso que
ele roda **depois** da integração, nunca no lugar da revisão por tarefa.

### 10.2 · O ciclo

Cada rodada tem quatro passos, nesta ordem:

1. **Bateria fixa**, sem julgamento humano: `typecheck`, `lint`, `boundaries`, a suíte
   inteira, `demo:conferir` sobre um banco PGlite semeado por `simularAte`, e a captura das
   telas a 390 px (`scripts/captura-telas.sh`). Qualquer vermelho aqui é defeito, ponto.
2. **Varredura por lentes independentes**, cada uma cega para as outras — ver 10.3.
3. **Verificação adversarial de cada achado**: quem acha não conserta, e quem verifica
   tenta **refutar**. Achado que não sobrevive à tentativa de refutação é registrado como
   rejeitado, com o motivo, e **não volta na rodada seguinte** (o loop guarda o que já viu;
   sem isso ele nunca converge).
4. **Correção com teste primeiro**: o achado confirmado vira um teste que falha, depois a
   correção, depois o commit. Um commit por achado ou por grupo coeso de achados.

### 10.3 · As lentes

Independentes de propósito: uma varredura única encontra o que ela sabe procurar, e o
defeito de costura mora exatamente onde ninguém estava olhando.

- **Escrita** — as regras de 3.8 varridas no HTML renderizado de *todas* as telas, não no
  código: "probabilidade" (a única ocorrência lícita é a frase do rodapé do detalhe que a
  nega), nota da partida chamada de "nível", linha com meio ponto, odd fora de faixa,
  decimal no score de confiança, e a regra nova de 4.4 — taxa da noite ou da temporada no
  mesmo elemento que uma nota de confiança.
- **Estados de borda**, que o sorteio não garante: dia sem lista publicada, jogo encerrado
  sem box score, jogador sem foto, filtro que zera a lista, parâmetro inválido na URL, DNP,
  turbo, jogador oculto, primeiro dia da temporada (sem histórico), e o jogo que atravessa
  a meia-noite de Brasília.
- **Coerência entre telas** — a lente que só existe aqui. O **mesmo apito** lido na Lista,
  no detalhe, no Fire Live, nos Resultados e no perfil do jogador tem de contar a **mesma
  história**: mesma linha, mesma data, mesmo veredito, mesma média, mesma faixa de odd.
  Divergência entre duas telas é defeito mesmo quando as duas passam nos seus testes.
- **Acessibilidade e fronteiras** — texto alternativo, ordem de leitura, `aria-current`,
  contraste dos pares novos; `boundaries` limpo, motor intocado, aba de estatísticas sem
  importar do motor nem como tipo.
- **Fidelidade visual** — cada captura a 390 px contra o artboard aprovado: estrutura,
  ordem das seções, rótulos. Acabamento de um ou dois pixels é nota, não defeito.

### 10.4 · Quando para

**Duas rodadas seguidas sem achado novo.** Não é contagem de achados nem número fixo de
rodadas: o alvo é o silêncio, e o silêncio só conta quando se repete.

### 10.5 · O que o loop não pode fazer

Estes limites valem mais que qualquer achado:

- **Não inventa regra de estratégia.** Achado que depende de decisão do CJ ou do parceiro
  vira linha em "decisões pendentes" no relatório — nunca código. Vale a regra 3 do
  `CLAUDE.md`: regra inventada aqui vira push errado no celular de assinante pagante.
- **Não toca o ruleset nem o motor.** Se a correção exige mudar o motor, o achado é da
  próxima passada.
- **Não mexe na anatomia do card nem na posição das abas** — congeladas pela temporada
  (§9).
- **Não silencia teste.** Teste vermelho é defeito até prova em contrário; apagar asserção
  para ficar verde é o oposto do que o loop existe para fazer.
- **Não roda contra o Neon.** PGlite e o arnês de captura bastam, e a árvore da
  apresentação fica fora.

### 10.6 · Saída

Um relatório com três listas: **corrigidos** (com o commit e o teste que os trava),
**rejeitados** (com o motivo da refutação) e **decisões pendentes** (o que precisa do CJ ou
do parceiro). O relatório é a prova de que o loop parou por silêncio, e não por cansaço.
