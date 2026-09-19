# ADR-0012 — A IA sugere o que o MOTOR ranqueia

**Status:** aceito · 19/09/2026 · decisão do dono da plataforma
**Altera:** [ADR-0009](0009-llm-narra-nunca-decide.md), que continua valendo na sua
afirmação central. **Não altera** a [ADR-0004](0004-odds-somente-leitura.md): nenhuma
aposta é enviada, nenhuma conta de casa é vinculada, nenhum dinheiro se move.

## Contexto

A ADR-0009 fechou uma porta de propósito: *"A tentação óbvia — e o erro que este ADR fecha
— seria deixar a LLM opinar sobre QUEM apita."* O prompt do assistente carregava a
proibição em bloco:

> NÃO SUGIRA APOSTA: nada de palpite, de valor a apostar, de promessa de resultado ou de
> dizer se uma entrada vai bater.

O parceiro pediu a capacidade: o assinante deve poder perguntar "em quem eu aposto no time
tal?" e receber uma avaliação **estatística** dos jogadores.

O risco que a ADR-0009 protege continua real, e é preciso: **um modelo a quem se pede
"avalie os melhores jogadores" CALCULA**, e calcular é exatamente onde ele inventa número.
A carga de 07/09 mediu isso — depois de corrigidas todas as outras causas, a última
reprovação que sobrou foi o modelo derivando uma média a partir dos fatos.

Um prompt dizendo "seja 100% estatístico" não é guardrail. É torcida.

## Decisão

**Quem ranqueia é o motor. A IA recebe a lista pronta e narra.**

1. Uma **função pura** (`motor/sugestao/taxa-na-linha.ts`) conta quantas vezes cada
   jogador bateu cada linha do nível dele nos últimos N jogos ENCERRADOS, e devolve a
   lista **já ordenada**. Sem I/O, sem LLM, testável sem mock.
2. Os parâmetros moram no ruleset (`sugestao_estatistica`): critério, janela, mínimo de
   jogos, quantos por time, o que ordena e o tamanho do recorte. Regra 1 do projeto.
3. O **recorte** do que entra nos fatos é determinístico, em código: os times são um
   conjunto fechado de 30, então achar o time da pergunta é busca em lista, não trabalho
   de modelo.
4. A **separação das duas vozes é estrutural**. Quem monta o texto dos fatos é o código, e
   é ele que escreve os dois cabeçalhos — APITADOS PELA METODOLOGIA e NÃO APITADOS.
5. A marca **"fora da lista de hoje"** é **verificada depois da resposta, em código**. Se
   o texto nomeia alguém do segundo grupo sem a marca, é reprovado (`sem-marca-fora-da-lista`):
   a cota volta ao assinante e o texto não chega à tela.

## O que mudou, e o que não mudou

**Não mudou:** a LLM continua sem decidir. Ela não escolhe quem entra no ranking, não
define a ordem e não calcula taxa. A ADR-0009 permanece.

**Mudou:** o produto passou a EXIBIR uma segunda leitura, estatística, ao lado da
metodologia. Em noites sem apito do time perguntado, a resposta é só estatística — e é por
isso que a marcação é verificada em vez de pedida.

## Consequências

- **Duas vozes no mesmo produto.** Em algumas noites o assistente vai apontar alguém que o
  CJ não sinalizou. O guardrail 5 é o que impede isso de ser lido como metodologia.
- **A malha do validador afrouxa.** Ele só aceita número presente nos fatos; injetar um
  ranking aumenta a lista de permitidos. O recorte (§3) é o freio, e os valores estão no
  YAML: `jogos_lembrados: 0` e `maximo_por_time: 5` devolvem a malha fina sem tocar código.
- **A capacidade vale em TODAS as telas**, inclusive no Fire Live durante o 1º quarto,
  porque o parceiro escolheu um assistente só em vez de um segundo, restrito à Gestão.
  Decisão registrada, não descuido. A janela exclui a partida em andamento.
- **"chance" e "vai bater" entram nas palavras proibidas**, dos dois lados (prompt e
  validador). Uma taxa de acerto é o número que mais parece previsão, e sem elas o modelo
  escorrega de "bateu 8 das últimas 10" para "tem boa chance hoje".
- **A taxa vai como "8 de 10", nunca como "80%".** Porcentagem convida a ser lida como
  chance de acontecer; a fração afirma sobre o passado, que é o que o dado diz.
- **O custo de leitura é por evento, não por usuário:** `unstable_cache` na rota, com tag
  própria, invalidada pelo mesmo cron que fecha a rodada.
- **Degradar é obrigatório.** Falhar a leitura do ranking devolve `undefined`, e o
  assistente responde como antes desta ADR. A dica é acréscimo, não requisito.

## Alternativas descartadas

- **Duas passadas de LLM** (uma para achar o recorte, outra para responder): contexto mais
  enxuto e validador mais apertado, mas duas chamadas pagas por mensagem e mais latência.
  O matcher determinístico entrega quase o mesmo recorte por uma chamada.
- **Ranking materializado em tabela:** leitura mais barata e auditável, mas tabela nova,
  migração, e um job que, ao falhar, guarda o ranking de ontem em silêncio — sem o TTL que
  salva o cache. Cabe depois, embrulhando a mesma função pura.
- **Prompt dizendo "seja 100% estatístico":** é o que esta ADR existe para não fazer.

## A pergunta que fica para o CJ

`sugestao_estatistica.ordenacao` está em `menor_linha`: o ranking ordena pela taxa da linha
mais baixa do nível de cada jogador — a aposta mais conservadora dele. Foi preciso escolher
porque cada nível tem linhas próprias (MVP em 20/25/30/35, RANDOLA em 5/10) e comparar as
taxas de linhas diferentes é comparar coisas diferentes. **É definição de metodologia e
deve ser confirmada com o CJ**; trocar o valor no YAML muda o ranking sem tocar código.
