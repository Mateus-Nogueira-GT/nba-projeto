# Temporada simulada: a demonstração ganha 7 semanas de história que o motor produziu

**Data:** 06/09/2026 · **Status:** implementada em 07/09/2026 — ver o plano e as erratas 4 e 4b
**Substitui:** a Peça A (seed de demonstração) de
[`2026-08-23-demo-e-telas-cj-design.md`](2026-08-23-demo-e-telas-cj-design.md), que fica
como registro histórico.

---

## 1 · Objetivo em uma frase

Trocar a demonstração de **um dia roteirizado** (6 jogos de história moldados à mão
para reproduzir os exemplos do documento do CJ) por **uma temporada simulada de 7
semanas**, em que cada dia é jogado por sorteio dentro de faixas por nível, e a
Lista Secreta de cada dia foi publicada pelo motor real **antes** de aquele dia ser
jogado — de modo que a taxa de acerto da tela de Resultados seja algo que a
estratégia produziu, não algo que alguém escolheu.

## 2 · Problema

O seed atual ([`semear.ts`](../../../src/modules/ingestao/demo/semear.ts)) foi feito
para provar o motor: os apitos que aparecem na tela saem de `avaliar()` com o ruleset
homologado. Mas os **fatos** que o motor lê são roteirizados:

- **A história tem 6 dias e 8 times.** Quatro confrontos fixos girando em
  round-robin. A aba de estatísticas mostra uma "temporada 2025-26" com 6 jogos por
  time e 22 times sem jogo nenhum.
- **Os cenários são escolhidos** (`CENARIOS`: "Brunson 1 jogo abaixo → amarelo",
  "Curry 3 → verde + turbo"). Quem oscila, quanto e desde quando é decisão do
  código. A oscilação existe porque foi digitada, não porque aconteceu.
- **As médias são escritas direto** em `medias_jogador` com `jogos: 40`, não
  recalculadas de jogos. Média e histórico não se explicam mutuamente.
- **A tela de Resultados só tem quem foi posto lá.** `desde: 1` marca quem "apitou
  ontem e bateu ontem" — o acerto é roteiro. Um cliente que pergunte "essa taxa é
  real?" não tem resposta honesta.

O que o parceiro pediu (brainstorm de 06/09) é uma demo que **pareça uma temporada
em andamento** e cujo desempenho histórico **seja consequência das regras**.

## 3 · Decisões (fechadas no brainstorm)

### §1 · Janela e calendário

- **Sete semanas para trás**, terminando em hoje. Início = hoje − 49 dias, nunca
  antes de 1º de outubro do ano-base da temporada corrente (`temporadaDe` +
  `mes_inicio`), para não cruzar a fronteira de temporada que `recalcularMedias`
  respeita.
- **Os 30 times da lista do CJ** jogam. Cada time faz **3 ou 4 jogos por semana**,
  nunca dois dias seguidos sem pelo menos **um dia de descanso** entre dois jogos.
  Uma rodada tem entre 4 e 10 jogos; nenhum dia da janela fica sem jogo.
- **Horários**: jogos entre 19h e 22h30 de Brasília (`ruleset.rodada.fuso`), em
  meia-horas. O dia de rodada é `data_referencia`; `data_jogo` é a data UTC gerada
  (o upsert já trata as duas chaves naturais — o `criarJogo` atual sobrevive).
- **Hoje** tem rodada `AGENDADA`. O primeiro jogo do dia fica `AO_VIVO` com o 1º
  quarto parcial. Rótulo de temporada continua vindo do ruleset ("2025-26").

### §2 · O que cada jogo produz

Por jogo, **um box score por jogador dos dois elencos** (6 a 9 por time na lista do
CJ, 230 no total, versão de níveis ativa — nunca `jogadores.time_id`), sorteado dentro de faixas
por nível de PONTOS, com rebotes e assistências derivados pelo nível por atributo
(`niveisDoJogador`, já existente):

| Nível do jogador | Pontos (média-alvo) | Minutos-alvo |
| ---------------- | ------------------- | ------------ |
| MVP              | 27–31               | 34–37        |
| All Star         | 18–23               | 30–34        |
| Suporte          | 11–16               | 22–28        |
| Randola          | 5–9                 | 10–18        |

As faixas são as de `FAIXA_PPG`/`mediaDe` de hoje — a **média-alvo** de cada jogador
é fixa (função da semente e do nome, como já é), e cada jogo é a média-alvo mais um
desvio sorteado. Os desvios não são simétricos de propósito: há uma cauda para
baixo grande o bastante para produzir **oscilações** (jogo ≤ média − delta do
ruleset) numa fração plausível dos jogos (~25–30% dos jogos de um MVP ficam abaixo
de média − 3), e para produzir **sequências** de 2 e 3 jogos abaixo ocasionalmente.
As médias que o motor lê são as **amostrais**, recalculadas de jogos — não a alvo.

Invariantes de cada box score (testadas):

- pontos = 2·cestas de 2 + 3·cestas de 3 + lances livres (`decomporPontos`);
- os minutos dos jogadores do time somam **240** (48 min × 5); quem joga mais
  pontua mais; prorrogação não existe na simulação;
- placar do jogo = soma dos pontos do elenco (derivação de `semearPlacares`, mantida);
- `estatisticas_time_jogo` recebe o placar espalhado pelos 4 quartos, como
  `semearBoxScoreDoTime` faz hoje.

**Desfalques.** Cada dia, uma fração pequena de jogadores é sorteada como fora
(`lesoes_escalacao`), com peso maior para quem está no topo da hierarquia, para que
a OPD aconteça de vez em quando — e ela só apita quando o desfalque é prefixo, como
manda a regra. Quem está fora não recebe box score naquele jogo.

**Mistura de dados do documento.** Os valores nominais em `DO_DOCUMENTO` (Shai 31
ppg, Jokić 12,9 rpg…) continuam sendo as médias-alvo desses jogadores — a demo
segue reconhecível para quem leu o documento — mas ninguém mais tem cenário
escrito na temporada simulada. (Os cenários roteirizados sobrevivem só como
fixture de teste — ver errata na seção 4.)

### §3 · O que roda por dia

Uma função, `simularAte(db, ruleset, hoje, opcoes)`, com um contrato: **para cada
dia entre o início da janela e hoje que ainda não existe no banco, produza-o;
depois pare**. Rodar de novo não faz nada. Se o cron perder três dias, a próxima
execução produz os três.

"Dia existe" = há jogo com aquela `data_referencia` e status `ENCERRADO` com box
score. Um dia pela metade (jogos criados, sem box) é refeito inteiro — o upsert de
jogos e de `estatisticas_jogo` por chave natural torna isso seguro.

Para cada **dia passado** que falta, nesta ordem — e a ordem é o que torna os
resultados honestos:

1. **Agendar a rodada** do dia (`jogos` como `AGENDADO`, com horários) e os
   desfalques do dia. O calendário é determinístico por (semente, dia): o dia 23
   tem os mesmos jogos seja produzido hoje ou daqui a uma semana.
2. **Publicar a Lista Secreta daquele dia** pelo caminho real:
   `publicarListaSecreta(db, ruleset, { dataReferencia: dia, agora: 1h antes do 1º
   jogo, ignorarAntecedencia: true })` — sem `llm`. `montarFatos` lê as médias e o
   histórico **até a véspera** (só existem jogos até ali) — os apitos nascem das
   regras do CJ sobre o que se sabia antes do jogo. Eu não escrevo apito nenhum.
3. **Jogar os jogos**: box scores sorteados (§2), placar, `estatisticas_time_jogo`,
   status `ENCERRADO`.
4. **Recalcular médias** com `recalcularMedias` (função real da ingestão, janela do
   ruleset) e **reescrever a classificação** (`semearClassificacao`, mantida).

Não há passo "conferir": `conferirRodadas` é leitura — a tela de Resultados cruza
os apitos com o box score na hora de renderizar. Assim que o box do dia existe, o
green/red daquele dia existe.

Para **hoje**, depois dos dias passados:

- rodada `AGENDADA` + desfalques do dia; o primeiro jogo vira `AO_VIVO` com 1º quarto
  parcial (`estatisticas_quarto`, `estatisticas_jogo` parciais, placar parcial,
  `estatisticas_time_jogo` só do Q1) e `executarCiclo` real com `FilaEmMemoria`
  gera os apitos do Fire Live — bloco reaproveitado do seed atual, parametrizado
  pelo jogo que o calendário escolheu em vez de OKC × DEN fixo;
- **Lista Secreta de hoje com narrativas reais** (`llm` do ambiente);
- **odds** das casas fictícias para a lista de hoje (`semearOdds`, reaproveitada).

**LLM.** Só o dia de hoje recebe a porta real. Cinquenta dias × ~50 itens seriam
~2.500 chamadas pagas por textos que ninguém abre. Os dias passados publicam **sem
porta** (snapshot sem narrativa, que é o que `publicarListaSecreta` faz quando
`llm` está ausente) — e como `publicarListaSecreta` só regrava o snapshot na transição de
hash, a republicação de hoje pelo cron `lista-secreta` (quando existir) continua
funcionando como hoje.

**Orçamento de tempo.** `simularAte` recebe `orcamentoMs` e **para entre dias**
quando o orçamento acaba, devolvendo `{ diasProduzidos, diasRestantes }`. O cron
passa 240 s (a função tem `maxDuration = 300`); a execução seguinte continua. A
carga inicial das 7 semanas roda **uma vez, à mão**, por `npm run demo:temporada`
(sem orçamento) — é onde 50 publicações + ~350 jogos custam minutos, não segundos.

**Onde roda.** `/api/cron/demo` (9h UTC / 6h BRT, um dos dois diários do Hobby)
passa a chamar `simularAte` em vez de `semearDemo`. A guarda
`DEMO_AUTOSSEMEADURA=true` fica como está. `sincronizar-rodada` (11h UTC) não muda:
sem provedor configurado ele não tem de onde ler, e já convive com a demo hoje.

**Dois cenários fixos, declarados.** Para que a apresentação mostre as duas peças
que o documento do CJ mais destaca, o dia de hoje garante (a) **um desfalque em
prefixo** em algum jogo e (b) **um jogador do bloco de topo com ≥75% da média no
1º quarto** do jogo ao vivo — o modo fire. São os dois únicos pontos em que a
simulação força um resultado; o restante da temporada é sorteio. Isso está escrito
aqui e no código para que ninguém descubra depois.

### §4 · Selo, limpeza e testes

**Selo de demonstração.** Com `DEMO_AUTOSSEMEADURA=true`, o app mostra uma faixa
discreta — "Temporada demonstrativa · dados simulados" — em todas as telas,
Resultados incluída. O componente é servidor (lê o env no layout); o visual é
assunto da fase de UX, aqui entra a informação e a regra de quando aparece. Sem a
variável, nada é renderizado.

**O dia do provedor real.** A regra do runbook continua: `DEMO_AUTOSSEMEADURA`
desligada, `npm run demo:limpar` (`limparDemo` já apaga tudo o que a demo gera),
só então ligar a ingestão. Nada da simulação toca `usuarios`, `rulesets`,
`dispositivos` ou a lista de níveis do CJ como documento.

**Testes.**

- *Motor de simulação, puro (`simulacao.ts`, sem banco):*
  - mesma semente → temporada idêntica (calendário e box scores);
  - calendário: 30 times, 3–4 jogos por time por semana, nunca dois dias seguidos,
    nenhum dia da janela vazio, nenhum time jogando duas vezes no mesmo dia;
  - box score: minutos do time somam 240; pontos = aritmética das cestas; quem não
    joga (desfalque) não tem linha;
  - distribuição: a média amostral de 49 dias de cada jogador fica dentro da faixa
    do nível (com tolerância de 1,5 ponto); existem oscilações e sequências de 2 e 3
    jogos abaixo em volume plausível (entre 10% e 40% dos jogos de MVP abaixo de
    média − 3; ao menos uma sequência de 3 na liga).
- *Integração (PGlite, `simularAte`):*
  - 3 dias → cada dia passado tem `feed_snapshot`, apitos `LISTA_SECRETA` com
    `jogo_id` daquele dia, jogos `ENCERRADO` com box; `conferirRodadas` devolve
    green **e** red; médias em `medias_jogador` batem com a média das linhas de
    `estatisticas_jogo`;
  - rodar de novo não muda contagem nenhuma;
  - apagar o box do dia 2 e rodar recompõe só o dia 2, com os mesmos jogos;
  - com `orcamentoMs` pequeno, para entre dias e informa `diasRestantes`; a
    chamada seguinte completa;
  - hoje: um jogo `AO_VIVO`, apitos `FIRE_LIVE`, odds agregadas para a lista de
    hoje, narrativas só no snapshot de hoje.
- *Rota do cron:* com a variável desligada, `executado: false`; ligada, chama
  `simularAte` com orçamento e devolve o resumo.
- *Aceite:* `npm run demo:conferir` com todos os itens ✓, mais os novos:
  "temporada tem ≥ 45 dias com jogo", "todos os 30 times têm ≥ 20 jogos",
  "Resultados tem green e red", "faixa de demonstração renderiza com o env ligado".

## 4 · Arquitetura

> **Errata de 06/09 (ao escrever o plano).** A primeira versão desta seção mandava
> apagar de `semear.ts` os cenários roteirizados (`CENARIOS`, os 6 dias, o
> `historicoOscilacao`). Ao mapear o código, oito suítes de OUTRAS features
> (chat, detalhe do apito, narrativas, tela de partida, fotos) dependem
> literalmente desses cenários — "Reaves apita porque Luka está fora", "LeBron
> em oscilação", "Curry turbo". São os exemplos numéricos do documento do CJ, e
> são o que torna aqueles testes legíveis. Reescrevê-los para um mundo sorteado
> os enfraqueceria. Decisão: **`semearDemo` continua existindo como fixture de
> teste dos exemplos do documento**, e nada mais. Produção (cron, `demo:seed`,
> `demo:temporada`) e o teste de fumaça das telas passam a usar `simularAte`.
> Os pedaços compartilhados são extraídos e reexportados, não duplicados.

```
src/modules/ingestao/demo/
  simulacao.ts        NOVO · puro: calendário + desfalques + box scores por
                      (semente, dia). Sem I/O, tempo entra como argumento.
  temporada.ts        NOVO · simularAte — orquestra por dia contra o banco.
  cadastro.ts         NOVO · extraído de semear.ts: times, jogadores, mapa,
                      níveis (PONTOS importados + REB/AST derivados). Usado
                      pelos dois seeders.
  jogos.ts            NOVO · extraído: upsertJogoDemo (as duas chaves naturais),
                      semearPlacares, semearBoxScoreDoTime, semearClassificacao
                      — os três ganham `jogoIds?` para trabalhar só o dia.
  ao-vivo.ts          NOVO · extraído: o bloco do 1º quarto ao vivo, com os
                      protagonistas como parâmetro em vez de Shai/Jokić/Murray.
  odds.ts             NOVO · extraído: semearOdds e CASAS_DEMO.
  semear.ts           FICA como fixture (semearDemo + limparDemo), importando
                      dos módulos acima. Nenhum comportamento muda.
  dados.ts            FICA. `semente` passa a ser exportada.
scripts/
  demo-temporada.ts   NOVO · carga inicial/sem orçamento (npm run demo:temporada)
  demo-seed.ts        passa a chamar simularAte (mesmo nome, runbook não muda)
src/app/api/cron/demo/route.ts     chama simularAte com orçamento
src/components/navegacao/FaixaDemonstracao.tsx   NOVO
src/app/layout.tsx                 renderiza <FaixaDemonstracao/> quando o env liga
```

`simulacao.ts` não importa nada com I/O e recebe tempo como argumento — mesma
disciplina do motor, pelo mesmo motivo: é o que deixa testar a distribuição sem
banco.

**Semente.** Uma constante (`SEMENTE_TEMPORADA = 'ia-nba-demo-2025-26'`) combinada
com o dia e com os nomes; a temporada é reproduzível em qualquer banco. Trocar a
constante troca a temporada inteira — é o único botão.

**Resumo devolvido** (`ResumoTemporada`): dias produzidos, dias restantes, jogos
criados, box scores, publicações, itens da lista de hoje, apitos do Fire Live,
linhas com odd, times classificados — o cron reporta `quantidade` a partir dele.

## 4b · Errata de execução (06/09, onda 1 implementada e revisada)

A revisão adversarial do gerador reprovou três coisas que esta spec pedia. Duas
eram impossíveis como escritas. Ficam registradas aqui porque mudam o que o
produto mostra na tela.

**Os minutos do time não somam 240.** A spec pedia as duas coisas ao mesmo
tempo — a tabela de minutos-alvo por nível e a soma de 240 por time — e elas são
incompatíveis: 29 dos 30 elencos não chegam a 240 nem somando o teto da faixa de
todo mundo, porque a lista do CJ nomeia 6 a 9 jogadores dos 15 de um elenco real.
Forçar 240 inflava o MVP mediano para 46,5 minutos, com 15,8% das linhas cravadas
em 48. Vale a tabela de minutos-alvo, e a soma por time fica entre 150 e 215. É o
mesmo motivo que já faz o placar da demo ser baixo, e está documentado no código.

**Cada time joga 3 vezes por semana, não "3 ou 4".** O calendário precisou virar
função fechada do dia absoluto, e não da janela: com a janela deslizando um dia a
cada execução do cron, o mesmo 15/08 saía com confrontos diferentes conforme o dia
em que o cron rodasse. O efeito seria grave e silencioso — todo dia passado ficaria
para sempre "incompleto", e cada reexecução empilharia um segundo jogo por cima do
primeiro, com time jogando duas vezes no mesmo dia e as médias contando dobrado.
A cura é um rodízio de ciclo fixo, e dentro de sete dias três é o teto de dias não
adjacentes. A rodada passa a ter 6 ou 7 jogos, e cada time faz 21 em 49 dias.

**A tolerância de 1,5 ponto vale para a maioria, não para todos.** Em 49 dias cada
jogador faz 21 jogos, e o espalhamento que as oscilações exigem deixa o erro-padrão
da média em torno de 1,3 — quem tem média-alvo colada na borda da faixa sai fora
por ruído amostral, não por defeito. O teste trava duas coisas: ao menos 93% dos
jogadores dentro de ±1,5, e ninguém além de 6. Medido em 200 janelas: 95,6% e 4,67.

Duas coisas que a spec pedia e o plano não tinha entregue, agora implementadas: a
**cauda assimétrica** dos desvios (o plano gerava um sino simétrico, e sem a cauda
inferior as sequências de 3 jogos abaixo sumiam em algumas janelas) e uma **guarda
de pureza de verdade** para o gerador — as regras do dependency-cruiser só olhavam
para `motor/`, então `npm run boundaries` aprovava qualquer I/O dentro de
`ingestao/demo/`. Agora há três regras próprias, verificadas contra mutantes.

### Duas regras que o dia de hoje impôs (onda 2)

**O bloco de hoje não roda enquanto o passado tiver buraco.** A spec dizia "para
hoje, depois dos dias passados", supondo que os passados sempre terminam. Com o
orçamento de tempo do cron eles podem não terminar — e publicar a lista de hoje
sobre uma janela pela metade produz apito explicado por um histórico que não
existe. Hoje nasce só quando todos os dias pendentes foram produzidos. A
consequência prática está no runbook: num banco vazio, o cron sozinho leva dias
até abrir a primeira rodada, e é por isso que a carga inicial das 7 semanas é
feita à mão.

**A porta de LLM vai nas duas publicações de hoje, não só na primeira.** A
narrativa só é gerada na transição de hash. Publicar sem porta, cotar as odds e
republicar com porta deixaria o hash já fixado sem texto — e quando a
republicação chegasse ao mesmo hash (o caso comum: as médias mudaram porque
ontem fechou, mas as odds das mesmas linhas não), a LLM nunca mais seria
chamada e a lista do dia ficaria sem narrativa para sempre. O custo é uma
segunda passada sobre a lista de **um** dia, e só quando algo mudou — outra
ordem de grandeza do que a seção 3 recusou.

## 5 · Fora de escopo (decisão explícita)

- **Rebotes e assistências como classificação própria** — continuam derivados do
  nível de pontos, como hoje; a lista real por atributo ainda não chegou.
- **Playoffs, All-Star break, back-to-back reais** — a NBA real tem; a demo não
  precisa.
- **Visual da faixa e um contador "taxa de acerto da temporada"** na tela de
  Resultados — fase de UX. A tela continua mostrando a janela de 7 dias.
- **Fotos** — `demo:fotos` fica separado (toca rede).
- **Rodar a carga inicial pelo cron** — é à mão, uma vez.

## 6 · Ordem de implementação e verificação

1. `simulacao.ts` com os testes puros (calendário → desfalques → box score →
   distribuição).
2. Extrair de `semear.ts` os módulos compartilhados (`cadastro.ts`, `jogos.ts`,
   `ao-vivo.ts`, `odds.ts`) sem mudar comportamento — a suíte atual da demo é o
   teste de regressão da extração.
3. `temporada.ts` (`simularAte`) com os testes PGlite; scripts e cron.
4. Faixa de demonstração + teste de tela; `telas-demo.test.ts` passa a semear
   com `simularAte`.
5. `demo:conferir` estendido; carga inicial local; `demo:conferir` ✓; runbook
   ([`deploy.md`](../../runbooks/deploy.md), seção da demo) atualizado com
   `demo:temporada` e a nota de que o cron só produz o incremento.
