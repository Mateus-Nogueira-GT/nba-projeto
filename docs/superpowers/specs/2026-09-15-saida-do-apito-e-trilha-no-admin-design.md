# A saída do apito carrega sua origem, e o admin ganha a trilha — design

**Status:** implementada em 15/09/2026.
**Origem:** a call de 08/09 (rastreamento de afiliados e gestão de banca) e o pedido de 15/09.

Hoje a NIP sabe que um usuário saiu para uma casa, e sabe o que ele registrou ter apostado —
mas não sabe que as duas coisas são a mesma. Esta spec fecha esse meio.

## 1 · Ponto de partida: as duas metades já existem

**A saída existe e está no ar.** A tela do apito (`src/app/(app)/apito/[jogadorId]/page.tsx`)
mostra a saída para a casa parceira quando o admin marcou um link ativo; o `<a>` aponta para
`/ir/{codigo}`, que grava em `eventos_afiliados` uma linha `tipo = 'SAIDA_CASA'` com o usuário,
o link e a atribuição de primeiro toque. O painel do parceiro já conta essas saídas.

**A aposta registrada existe e está no ar.** `entradas_realizadas` guarda o que o usuário
declarou ter feito fora da plataforma: usuário, dia, jogador, atributo, linha, unidades e odd,
com chave natural única nos cinco primeiros.

**O que falta é o meio.** A saída **não sabe de onde nasceu**: `saidaDoApito(db)` recebe só o
banco e devolve *o* link marcado, igual para todos os apitos; o evento gravado tem `linkId`, mas
nenhuma referência ao jogador, atributo ou linha que a pessoa estava olhando quando clicou. Sem
esse dado, quando o usuário volta e registra uma entrada, não há como dizer se foi aquela saída
que o levou lá — só que ele saiu em algum momento do dia.

## 2 · Escopo

Entra:

- A saída para a casa passa a carregar **de qual apito nasceu**.
- O admin ganha, por saída, a trilha: quando, por qual link e casa, de qual apito, e **se aquele
  usuário registrou aquela entrada depois**.

Fica fora, por decisão de 15/09:

- **A API da casa.** A documentação ainda não chegou (os arquivos enviados em 15/09 eram análise
  de tráfego de um offer server, não documentação de API). Se ela trouxer postback ou API de
  relatório, isso substitui o CSV manual que o ADR-0010 assumiu e pede um ADR próprio.
- **Endurecer a detecção de robô.** Ver §10.
- **Qualquer mudança em `entradas_realizadas`.** Nenhum campo novo: nem casa, nem status, nem
  resultado. A gestão continua guardando o que já guarda.
- **O caminho contrário** — apostas registradas que não tiveram saída pelo app. Útil (mede quanto
  do volume escapa do link de afiliado), mas não neste primeiro momento.
- **Qualquer coisa no painel do PARCEIRO.** Ele fica idêntico.

## 3 · Decisões

| # | Decisão | Por quê |
| --- | --- | --- |
| 1 | O vínculo é **derivado na leitura**, não gravado na gestão | Gravar o id da saída em `entradas_realizadas` obrigaria a gestão a consultar afiliados no caminho de ESCRITA, acoplando entrega à plataforma comercial na hora em que o usuário aperta "Registrei". Derivando, cada lado grava só o que sabe |
| 2 | A rota recebe a **chave do apito** e resolve para o id no servidor | `chave` (`montarChave`) é exatamente o índice único de `apitos` e **já viaja no item do feed** — não muda o snapshot. A resolução é contra o índice: quem forjar o parâmetro só consegue referenciar um apito que EXISTE, nunca inventar um. E o que se grava é `apito_id`, chave estrangeira de verdade |
| 3 | Chave que não resolve grava saída **sem origem**, nunca uma origem inventada | Degradar para "não sei" é honesto; degradar para um palpite contamina a trilha |
| 4 | A trilha vive **só no admin** | O painel do parceiro é de terceiro. A aposta é auto-declarada pelo assinante; expor isso a terceiro é dado pessoal sem ganho, e contradiz o runbook, que já manda mascarar `indicado` no CSV |
| 5 | Nada disso gera comissão | A aposta é auto-declarada e a NIP não a viu. O ADR-0010 já fixa: sem relatório conciliável, a plataforma não afirma cadastro, depósito nem comissão. A tela do admin rotula como declarado |
| 6 | O dia sai de `dataDeReferencia(ocorridoEm, fuso)` | O mesmo helper da rodada. Sem ele, a saída das 23h de Brasília cai no dia seguinte em UTC e o casamento falha justamente no horário de maior movimento |

## 4 · Onde o vínculo mora

Não há coluna nova em `entradas_realizadas` e não há tabela de junção. O evento de saída ganha a
origem; a correlação é uma **consulta** no admin, casando pela chave natural que a gestão já usa:

```
entrada registrada  (usuarioId, dataReferencia, jogadorId, atributo, linha)
saída com origem    (usuarioId, dia(ocorridoEm), apito → jogadorId, atributo, linha)
```

Os dois lados usam `smallint` para `linha` e o mesmo enum de atributo, então a igualdade é exata
— não há arredondamento nem conversão no meio.

## 5 · A saída carrega o apito

**Schema.** `eventos_afiliados` ganha `apito_id uuid` anulável, com referência a `apitos.id` e um
`check` de que só é preenchido quando `tipo = 'SAIDA_CASA'` — no mesmo estilo dos checks que a
tabela já tem (`eventos_afiliados_tipo_valido`).

**O que a tela tem em mãos.** `ItemFeed` **não** carrega o id do apito — o feed é um snapshot
materializado, com `chave`, `jogoId`, `jogadorId`, `atributo` e `linha`, mas sem o `id` da linha
em `apitos`. Carrega, porém, a `chave`: e `montarChave(jogoId, jogadorId, atributo, estrategia,
linha)` é **exatamente** o índice único de `apitos` (`nullsNotDistinct`, porque a linha é NULL no
Fire Live). É por ela que a origem viaja — sem tocar no formato do snapshot, e portanto sem
inutilizar os snapshots já gravados.

**Leitura.** `saidaDoApito(db)` continua devolvendo o link único que o admin marcou: a regra de
QUAL casa não muda. A tela do apito passa a incluir a chave do item exibido na URL da saída.

**Rota.** `/ir/{codigo}` aceita a chave como parâmetro, resolve o apito pelo índice único e grava
o `apito_id` encontrado. Chave que não resolve — forjada, de um apito apagado, ou de um snapshot
velho — grava a saída **sem origem** e redireciona normalmente: um parâmetro ruim não vira dado
inventado, e nunca vira erro na cara de quem clicou.

**`registrarSaidaParaCasa`** ganha `chaveDoApito?: string | null` na entrada, resolve e grava.

## 6 · A trilha no admin

Uma seção nova em `/admin/afiliados` — o arquivo já tem 646 linhas e sete seções
(`Configuração da operação`, `Casas e ofertas`, `Parceiros e links`, `Importar relatório`,
`Recebimentos`, `Liberar comissão`, `Registrar repasse`); a oitava entra no mesmo molde, e a
consulta vive em `plataforma/afiliados/servico.ts` como as outras.

Por saída, em ordem cronológica decrescente: quando ocorreu, o parceiro e a campanha, a casa de
destino, o apito de origem (jogador, atributo, linha) quando houver, e o desfecho — **registrou**
a entrada correspondente, ou **não registrou**. A coluna do desfecho leva o rótulo de que é
declaração do usuário, não confirmação da casa.

O recorte é por período, como o resto do painel.

## 7 · O que a tela do apito passa a fazer

Uma mudança: o `href` deixa de ser `/ir/{codigo}` e passa a levar a chave do item que está sendo
exibido naquela tela (`principal.chave`, que a tela já tem em mãos). Nada mais muda — mesmo texto, mesmo `rel="nofollow sponsored"`, mesmo aviso
do ADR-0004, mesma regra de só aparecer quando há link ativo.

## 8 · O que não muda, de propósito

O painel do parceiro. A gestão (nenhum campo novo, nenhuma tela nova). O cálculo de comissão. A
regra de qual casa recebe a saída. E a regra 4 do `CLAUDE.md` continua intacta: isto é um `<a>`
que redireciona, sem envio de aposta, sem credencial de casa, sem movimentação de dinheiro.

## 9 · Pronto quando

- Uma saída disparada da tela de um apito grava o evento **com** `apito_id`.
- Uma saída com chave que não resolve — forjada ou de snapshot velho — grava o evento **sem**
  origem, redireciona normalmente e não lança.
- Uma saída disparada fora da tela do apito (sem o parâmetro) continua funcionando como hoje.
- O formato do snapshot do feed **não muda**: um snapshot gravado antes desta mudança continua
  sendo lido sem erro.
- A trilha do admin encontra a entrada registrada do **mesmo** dia, e não encontra a de outro dia.
- Uma saída às 23h de Brasília é casada com a entrada do **mesmo dia local**, não do dia seguinte.
- O painel do parceiro renderiza exatamente o que renderizava antes.
- Nenhum teste nomeia jogador ou time.
- Bateria verde: `typecheck`, `lint`, `boundaries`, `test`, `build`.

## 10 · Riscos e o que ficou registrado

- **Apito de Fire Live não tem linha.** `apitos.linha` é anulável e é NULL em todo apito de Fire
  Live (o índice único usa `nullsNotDistinct` justamente por isso). Uma saída nascida de um apito
  de Fire Live carrega a origem, mas **nunca casa** com uma entrada registrada, porque a gestão
  exige linha. Isso é correto, não defeito: não existe a entrada correspondente para casar. A
  trilha mostra a saída com origem e desfecho "não registrou".
- **A correlação não é prova.** Mesmo com tudo casando, a NIP não viu a aposta. Duas pessoas
  podem sair pelo mesmo apito e só uma apostar; alguém pode registrar uma entrada sem nunca ter
  saído pelo app. O número serve para operação, nunca para cobrança.
- **Tráfego de robô infla o que o parceiro vê, e isto não está resolvido.** O único filtro hoje é
  `requisicaoAutomatizada`: método `HEAD` e user-agent de robô conhecido. Um relatório de tráfego
  de offer server trazido pelo parceiro em 15/09 mostrou **265 de 353 linhas (75%) vindas de IP
  de datacenter** — AWS, Google Cloud, Hetzner, OVH, netcup, DigitalOcean. Um robô nessas faixas
  com user-agent de navegador passa reto pelo nosso filtro, cria atribuição de 30 dias e infla
  "Cliques observados", que é número que o parceiro vê. Fora do escopo desta spec por decisão de
  15/09, mas é o próximo assunto de afiliados — e é urgente se já houver parceiro ativo.
- **A documentação da API da casa muda o desenho de comissão, não o desta spec.** Esta costura é
  interna e independente: quando a API chegar, ela encaixa por cima sem retrabalho aqui.

## 11 · O que a implementação descobriu

Achados de 15/09, registrados aqui porque valem para quem mexer nisto depois — não
são defeitos abertos.

- **Contar linhas "Sim" conta a mais.** Saídas repetidas do mesmo usuário, pelo mesmo
  apito, no mesmo dia aparecem todas com "Sim" contra uma ÚNICA entrada declarada.
  Linha a linha a afirmação é verdadeira — aquela saída foi seguida de uma aposta
  declarada — mas somar a coluna superestima. Reforça o §10: o número serve para
  operação, nunca para cobrança.
- **"Não" tem dois significados, e a tela diz isso.** Ele cobre tanto "não declarou"
  quanto "não havia como casar": visitante sem conta, ou apito de Fire Live, que não
  tem linha. Optou-se por explicar no texto da seção em vez de criar um terceiro
  estado, que contrariaria a decisão de §6.
- **A trilha não filtra por status.** Os joins são por id: parceiro suspenso e oferta
  encerrada continuam aparecendo. É o certo para um histórico — some da trilha o que
  nunca aconteceu, não o que deixou de valer. Apito apagado vira origem nula (a FK é
  `on delete set null`) e a saída permanece.
- **Dívida: a data exibida e o dia do casamento vêm de autoridades diferentes.** O
  casamento usa `ruleset.rodada.fuso`, porque é com ele que a gestão escreve
  `data_referencia`. A coluna "Quando" usa o formatador do painel, que tem
  `America/Sao_Paulo` cravado — como `periodo.ts`. Hoje coincidem. O conserto é do
  painel inteiro, não desta seção, e por isso ficou de fora: fazer só uma coluna
  divergir seria inconsistência por uma hipótese.
- **Dívida: uma consulta por linha do recorte**, até 200, para casar a entrada. Foi o
  preço de manter o dia local em `dataDeReferencia` em vez de reescrever a regra de
  fuso dentro do SQL. É o primeiro lugar a otimizar se a trilha crescer.
- **Dívida: a seção corta em 200 sem avisar**, enquanto o cartão "Saídas para casas"
  mostra o total real do período. É o padrão das outras seções (200/500), mas num
  período movimentado a diferença não se explica sozinha.
