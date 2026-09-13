# Diagnóstico NIP — debug completo de 13/09/2026

**Método.** A skill de diagnóstico é um loop para *um* bug com sintoma conhecido, e a regra
central dela é: sem um comando que fique vermelho, não há hipótese. Para uma varredura do
projeto inteiro, ela foi aplicada assim — **cada bug deste relatório vem com o loop que o
pegou**, um comando que rodou e ficou vermelho, e o que só foi suspeitado lendo código está
numa seção à parte, rotulado como hipótese. Nada foi corrigido: o pedido era o relatório.
A árvore ficou limpa em `f9fae8c`; toda sonda foi removida e conferida por `grep`.

## Os loops

| Loop | Comando | Veredito |
| --- | --- | --- |
| A · suíte embaralhada | `vitest run --sequence.shuffle --sequence.seed=20260913` (2 rodadas) | **VERMELHO** — 28 testes / 16 arquivos, idênticos nas duas |
| B · varredura HTTP da produção | `loop-b-prod.sh` — 38 rotas, status + texto visível + cabeçalhos | limpo (o `undefined` era payload RSC; sinal apertado ao texto visível) |
| C · fuzz do motor | `loop-c-fuzz-motor.ts` — 600 conjuntos de fatos, PRNG semeado | limpo — 39.899 apitos, 0 exceções, determinístico |
| D · invariantes do banco semeado | `loop-d-invariantes.ts` — 21 dias em PGlite + diferencial TS×SQL | **VERMELHO** — 5 empates, 8 times com V-D errado |
| E · `next build` | `npm run build` (o CI não roda) | limpo |
| F · URL inválida, autenticado | arnês descartável sobre `/apito` e `/resultados` | **VERMELHO** — `/resultados/0001-01-01` lança; e o worker trava |
| G · jogo às 21:00 BRT | força `T00:00:00Z` e procura "00:00" | refutou a hipótese do flake |
| H · uma função por vez | as cinco consultas de `/resultados` com vigia de 10s | isolou o `RangeError` |
| lint com tipos | `no-floating-promises` / `no-misused-promises` (regra provada ativa) | 0 em produção |
| produção · escrita sem sessão | webhook forjado, chat, push, preferências | todos rejeitados |

## Situação em 13/09, depois da correção

B1, B2 e T2 foram corrigidos no mesmo commit, cada um com o teste que estava vermelho antes
(spec: [`2026-09-13-correcoes-do-diagnostico-design.md`](../specs/2026-09-13-correcoes-do-diagnostico-design.md)).
O Loop D, que abriu o B1, foi rodado de novo sobre o código corrigido: **0 achados**. T1 continua
aberto, com spec própria; T3 agora deixa artefato quando ocorre.

## Bugs confirmados

### B1 · Jogos encerrados empatados, e a classificação conta o empate como derrota — **alto: está em produção, na tabela que o cliente vê**

- **Loop que pegou:** D. Em 21 dias semeados, 5 de 135 jogos `ENCERRADO` com `placar_casa = placar_visitante` (a NBA não empata), e 8 de 30 times com V-D na classificação diferente dos jogos disputados (ex.: 4-5 na tabela, 4-4 nos jogos).
- **Causa:** `semearPlacares` (`src/modules/ingestao/demo/jogos.ts:112`) deriva o placar somando os pontos de cada elenco e nada desempata. `semearClassificacao` (`jogos.ts:267`) decide com `casaVenceu = placarCasa > placarVisitante` — o empate vira derrota do mandante e vitória do visitante.
- **Produção:** ver a checagem só-leitura no fim deste relatório.
- **Correção:** desempatar na simulação (prorrogação determinística pelo mesmo PRNG: somar pontos ao lado escolhido até haver vencedor), e `semearClassificacao` tratar empate como estado inválido em vez de escolher um lado.
- **Seam de regressão:** em `demo.test.ts` / `temporada.test.ts`, após `simularAte`: nenhum jogo `ENCERRADO` com placares iguais; e, por time, `vitorias + derrotas` igual ao número de jogos encerrados.
- **CORRIGIDO.** `desempatar` em `simulacao.ts` (puro, PRNG semeado pela chave do jogo), aplicado
  em `temporada.ts` sobre as linhas filtradas; `semearClassificacao` devolve `{ linhas, empates }`
  e não atribui vitória nem derrota a empate; `demo:conferir` ganhou o item "Temporada · sem
  empate"; `npm run demo:desempatar` repara o passado. Regressão em
  `temporada-sem-empate.test.ts`, `classificacao-empate.test.ts` e `reparo-empates.test.ts`
  (autocontidos, sem dependência de ordem). **A produção só fica limpa depois de rodar o
  reparo** — ver a checagem no fim.

### B2 · `/resultados/<data>` com ano abaixo de 1000 responde 500 a usuário logado — **baixo (exige URL digitada), mas reproduzível**

- **Loop que pegou:** F e H. `/resultados/0001-01-01` autenticado lança `RangeError: Invalid time value`. As datas malformadas (`abc`, `2026-02-30`, `2026-13-45`) redirecionam corretamente; `9999-12-31` renderiza.
- **Causa:** `dataDeReferencia` devolve o ano sem zeros à esquerda (`1-01-01`); `temporadaDe` produz `"0-01"`; `diasDaTemporada` monta a abertura `"0-01-10-01T12:00:00.000Z"`, `Date.parse` dá `NaN`; `taxaDaTemporada(…, NaN)` → `somarDias` → `toISOString()` lança.
- **Correção:** `dataValida` recusar datas fora do calendário da liga (ou `dataDeReferencia` fazer `padStart(4, '0')` no ano), e `diasDaTemporada` proteger contra `NaN`.
- **Seam de regressão:** um caso `0001-01-01` no mesmo molde de `estatisticas-url-invalida.test.ts`, esperando redirect.
- **CORRIGIDO.** `dataDeReferencia` e `temporadaDe` passam a escrever o ano com quatro dígitos, e
  a janela da taxa para na primeira data que o Postgres representa — sem isso o 500 só trocava de
  causa (`22008` no lugar do `RangeError`). A rota renderiza rodada vazia, como `9999-12-31`.
  Regressão em `ano-curto.test.ts` e `resultados-url-invalida.test.ts`. `dataValida` não mudou:
  nenhum limite de ano foi inventado.

## A suíte de testes

### T1 · 28 testes em 16 arquivos dependem da ordem em que foram escritos

Com `--sequence.shuffle`, as mesmas 28 falhas nas duas rodadas. Todas da mesma forma: `beforeAll` semeia um banco e os testes mutam esse banco assumindo sequência ("reexecutar não duplica" rodando antes do "semear"; "sem link marcado" depois de um irmão marcar; o `UPDATE` de constraint sem linha porque o irmão que apaga a conta rodou antes). Como cada arquivo tem seu próprio PGlite, o vazamento é sempre **dentro** do arquivo. Não é bug de produto, mas: reordenar um `it` quebra vizinhos em silêncio, e a suíte não consegue pegar bugs de ordem reais.

Arquivos: `odds-coletar`, `saida-para-casa`, `fire-live-meia-noite`, `afiliados/servico`, `temporada` (4), `identidade-apresentacao`, `telas-05-gestao`, `telas-demo`, `odds-leitura`, `demo` (6), `persistencia` (2), `odds-vinculo-jogadores`, `experiencia/servico` (4), `backtest`, `odds-vinculo-eventos`, `preferencias`.

Correção: estado por teste (transação com rollback, ou re-semear no `beforeEach`), ou fixtures próprias nos describes que hoje são sequenciais por construção.

### T2 · Fechar o PGlite com consulta em voo trava o worker a 100% de CPU, sem fim

Um teste que falha no meio de um `Promise.all` deixa consultas pendentes; o `afterAll` chama `banco.fechar()` e o worker gira até ser morto — 5 minutos, depois 60s sob vigia, sem produzir nada. Com um dreno de 300ms antes de relançar o erro, o mesmo teste falha limpo em 6 segundos. Consequência: qualquer falha com consulta pendente pode segurar o CI até o timeout do job. Correção: `fechar()` esperar as consultas pendentes (ou fechar com timeout).

**CORRIGIDO.** `fechar()` faz um `select 1` — que entra na fila do mesmo mutex — antes de
`pg.close()`. Regressão em `ajuda-banco.test.ts`: consulta de 300 ms disparada sem `await`,
`fechar()` tem de resolver depois dela. Sem a correção o teste estoura o timeout; com ela passa
em ~300 ms.

### T3 · O flake "00:00" de `telas-demo.test.ts:428` continua sem reprodução

Uma ocorrência relatada, zero em várias execuções aqui. A hipótese mais plausível — o atributo ISO `<time dateTime="…T00:00:00.000Z">` de um jogo em hora cheia — foi **refutada** pelo loop G: com um jogo forçado às 21:00 de Brasília (00:00Z), "00:00" aparece zero vezes no HTML da Lista. Próximo passo honesto: o teste gravar o HTML em arquivo ao falhar (o arnês já tem `gravarConferencia`), para a próxima ocorrência deixar artefato.

**FEITO.** O teste grava `.superpowers/conferencia/flake-00-00.html` no `onTestFailed` (sem
depender de `CONFERENCIA=1`), e o CI sobe esse diretório como artefato quando o job falha. A
próxima ocorrência deixa o HTML para alguém ver onde o "00:00" apareceu.

## Verificado limpo

- **Motor:** 600 conjuntos aleatórios, 39.899 apitos — 0 exceções, determinístico, confiança sempre 0..100 e com faixa, chaves únicas iguais a `montarChave`, Fire Live só no quarto do ruleset, OPD só com o topo da hierarquia do atributo `FORA` e nunca para quem está fora.
- **Regra de participação:** 0 divergências entre `entrouEmQuadra` (TS) e `entrouEmQuadraSql` (SQL) em 1.998 linhas de box.
- **Box simulado:** pontos = 2·2C + 3·3C + LL, cestas = 2C + 3C, rebotes = of + def, C ≤ T, nada negativo — 0 violações; placar do time = soma dos pontos dos jogadores em 135 jogos encerrados; nenhum box em jogo agendado.
- **Apitos:** regra 5 (sem Fire Live duplicado por jogo/jogador/atributo), linha inteira ≥ 1 na Lista Secreta e nula no Fire Live, odd ≥ 1, nível 1..3.
- **`/apito/[jogadorId]`** com `abc`, `1`, uuid inexistente, atributo inválido e injeção SQL: 6/6 sem exceção de banco, ~180ms.
- **Produção, 38 rotas:** nenhum 5xx; nenhuma palavra proibida no texto visível (`probabilidade`, `Carlos`, `lista do CJ`, `undefined`, `NaN`); admin sem sessão responde "Acesso restrito"; `/conta` e `/gestao` sem sessão carregam o redirect no stream; `cache-control: private, no-store` em toda página; crons 401; webhook forjado rejeitado; push e preferências sem sessão rejeitados; `Referrer-Policy: no-referrer` em `/redefinir/:token`.
- **`next build`** limpo; **lint com tipos** 0 promessas soltas em produção; **`catch` vazio** 0; login com limite de tentativas por e-mail (admin usa o mesmo formulário).

## Estados que não são bugs, mas valem a linha

- **Mercado Pago não está configurado em produção:** o webhook responde 503 "integração de pagamento não configurada" e `/assinar` mostra "temporariamente indisponível". O botão ASSINAR do perfil leva a essa tela.
- **Cabeçalhos de segurança:** só HSTS (mais `Referrer-Policy` na redefinição). Sem `X-Content-Type-Options`, `X-Frame-Options` ou CSP — endurecimento, não defeito.
- **Limite de tentativas por e-mail** permite trancar a conta de outra pessoa com N senhas erradas — trade-off de desenho, registrado.
- **O CI não roda `next build`** — um erro de build só apareceria no deploy. **CORRIGIDO:** o passo `build` entrou no workflow.
- **Soft-404:** páginas com `notFound()` respondem 200 no stream (normal do Next com `loading.tsx`); monitoramento por status HTTP não enxerga.

## O que fazer primeiro

1. **B1** — desempatar a simulação e blindar a classificação; conferir a produção (checagem abaixo).
2. **T2** — `fechar()` esperar consultas pendentes: é o que impede um teste vermelho de virar CI travado.
3. **B2** — recusar data fora do calendário em `dataValida`.
4. **T1** — isolar estado por teste nos 16 arquivos, começando por `demo` e `temporada`.
5. Adicionar `next build` ao CI e o registro de HTML na falha de `telas-demo`.

## Checagem em produção (só leitura, 13/09/2026, Neon)

- **8 jogos `ENCERRADO` com placar igual**, de 2026-07-23 a 2026-09-09, em 354 encerrados.
- **13 dos 30 times** com V-D na classificação diferente dos jogos que disputaram.

Ou seja: o B1 não é só do banco de teste — está na classificação que a apresentação mostra.

**O reparo é `npm run demo:desempatar`**, escrito para isto: aplica aos 8 jogos a mesma decisão
que o gerador novo tomaria (mesma chave, mesmo PRNG), recomputa placares e classificação, e é
idempotente. Refazer os dias com `demo:temporada` foi descartado: mudaria placares, apitos
conferidos e taxa de acerto de jogos que estavam certos.

---

*Loops, saídas e o ledger completo ficaram no scratchpad da sessão (`scratchpad/debug/`); nada entrou no repositório além deste relatório.*
