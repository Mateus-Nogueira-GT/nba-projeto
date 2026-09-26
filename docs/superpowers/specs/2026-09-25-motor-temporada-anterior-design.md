# Motor NIP na temporada 2025-26, com filtro de temporada

**Data:** 25/09/2026 · **Status:** aguardando aprovação do parceiro
**Depende de:** chave BallDontLie do plano GOAT e backfill de 2025-26
([runbook](../../runbooks/temporada-retroativa.md))

## 1. O que é

O parceiro quer ver a metodologia NIP aplicada à temporada 2025-26 inteira, jogo a jogo,
como se o NIP já existisse, e poder alternar entre 2025-26 e 2026-27 com um botão.

> "O motor deve rodar em ambas, motor é estático e somente a temporada e seus respectivos
> jogadores mudam." — parceiro, 25/09

Isto **revoga a decisão 1 da spec de 22/09** ("hiato: só consulta, sem apito retroativo"). O
resto daquela spec continua valendo.

**Critério de sucesso:** escolher 2025-26 no filtro e navegar pelas rodadas passadas em
Resultados, Lista Secreta e Estatísticas, vendo os apitos que o motor teria dado e o resultado de
cada um.

## 2. Decisões do parceiro (25/09)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Onde aparece | **Resultados, Lista Secreta e Estatísticas.** Placar público, Ao Vivo e landing ficam só com a temporada atual. |
| 2 | Time do jogador | **2025-26: o time real daquela temporada** (Giannis no Milwaukee), com o nível que o CJ deu a ele. **2026-27: a lista do CJ inteira**, como hoje. |
| 3 | Ordem da hierarquia de um time de 2025-26 | **Nível do jogador primeiro** (MVP, All Star, Suporte, Randola); dentro do mesmo nível, **a posição do jogador no time dele na lista do CJ**. |
| 4 | Desfalques em 2025-26 | Os jogos já aconteceram: **desfalque é quem não jogou** (fora do box score ou 0 minutos). Sem relatório de lesões. |
| 5 | Onde guardar | **Tabelas separadas** para os apitos, os greens e a Lista de 2025-26. |
| 6 | Plano grátis | **2025-26 inteiro aberto** para o grátis nas três telas. As regras de plano de 2026-27 não mudam. |
| 7 | Lista do CJ | **Não é apagada.** A limpeza da demonstração apaga só o que foi inventado (ver §7). |

Decorrências assumidas (apresentadas ao parceiro, sem objeção):

- **Média sem olhar o futuro:** num jogo do dia D, a média do jogador é a de 2025-26 **até D−1**.
  Usar a média da temporada inteira inflaria a taxa de acerto. No começo da temporada, sem jogos
  suficientes, não sai apito, exatamente como acontecerá em 2026-27.
- **Jogador de 2025-26 que não está na lista do CJ** (aposentado, fora da liga) não tem nível,
  então não apita e não entra na hierarquia.
- **Sem odds de 2025-26.** O motor não usa odd para decidir o apito (a odd é só exibição), então a
  falta delas não muda quem apita; o card sai sem a pílula de odd.

## 3. Dados

### 3.1 Time por jogo no box score (dado canônico)

`estatisticas_jogo` não guarda por qual time o jogador atuou. Ganha a coluna
**`time_id uuid NULL REFERENCES times(id)`**, preenchida pela ingestão a partir do time que a
BallDontLie devolve em cada linha de `/stats`. Migração aditiva; linhas antigas ficam nulas.
É dado da NBA, não estratégia, e serve também às Estatísticas.

### 3.2 Tabelas novas (temporada anterior)

- **`apitos_retroativos`** — mesmas colunas de `apitos` (menos as de push e de odd, que não se
  aplicam), mais `temporada`, `data_referencia` e `niveis_versao_id` (a lista do CJ usada). Chave
  única `(jogo_id, jogador_id, atributo, estrategia, linha)`, como `apitos` (regra 5). O "bateu" é
  calculado na leitura, contra o box score, exatamente como Resultados já faz com `apitos`.
- **`greens_retroativos`** — os greens do Fire Live de 2025-26 (marcos no 1º quarto), para o bloco
  de greens de Resultados; forma de `greens` sem as colunas de push.
- **`feed_retroativo`** — a Lista Secreta de cada dia de 2025-26 como teria saído antes dos
  jogos: mesma forma de `feed_snapshot` (`data_referencia`, `estrategia`, `jogo_id`,
  `conteudo_json`, `hash`) mais `temporada` e `niveis_versao_id`.

Nenhuma tabela atual muda, fora a coluna de 3.1. A lista do CJ (`niveis`, `niveis_versao`,
`mapa_jogadores`) não é tocada.

### 3.3 Como cada fato de 2025-26 é montado

| Fato | Origem em 2025-26 |
|---|---|
| Nível do jogador por atributo | versão **ativa** da lista do CJ (`niveis`) |
| Time do jogador no dia D | `estatisticas_jogo.time_id` do **último jogo dele até D** (cobre trocas no meio da temporada) |
| Hierarquia do time no dia D | jogadores da lista do CJ que pertencem ao time em D, ordenados por nível do jogador e, no mesmo nível, pela posição no time dele na lista do CJ |
| Bloco de topo (ADR-0006) | calculado sobre essa hierarquia, sem mudança de regra |
| Média | `estatisticas_jogo` de 2025-26 **até D−1**, na janela do ruleset |
| Desfalque | jogador da hierarquia sem linha no box score do jogo, ou com 0 minutos |
| 1º quarto (Fire Live) | `estatisticas_quarto` período 1 |

## 4. Rodar o motor

- **Função nova `montarFatosRetroativos(db, data, temporada)`** em `src/modules/dominio/`, ao lado
  de `montarFatos`, com **a mesma saída**. Ela é a única peça que sabe de temporada anterior.
- **O motor não muda.** `avaliar(fatos, ruleset)` com o ruleset ativo. Nenhum número de estratégia
  entra no código (regra 1).
- **Script de operação `motor:retroativo`** (não é cron): percorre as datas de 2025-26 e, para
  cada uma, monta os fatos, chama o motor, grava `apitos_retroativos` e `feed_retroativo` e
  confere cada apito contra o box score.
- **Fire Live:** apita quem chegou a 75% da média no 1º quarto (regra do ruleset), usando o total
  do período 1. O green é conferido pelos marcos do ruleset. **Limitação registrada:** sem lance a
  lance, sabe-se se o jogador chegou ao marco até o fim do quarto, não o minuto exato.
- **Nunca push.** O script não importa nada de `entrega/push` nem da fila; um teste de fronteira
  (dependency-cruiser) trava isso.
- **Reexecutável.** Rodar de novo não duplica (chave única). Se o CJ trocar a lista, rodar de novo
  regrava 2025-26 com a versão nova: o script apaga a temporada daquela tabela e recalcula dentro
  de uma transação por dia.

## 5. Telas

- **Seletor de temporada** "2025-26 | 2026-27" no topo de Resultados, Lista Secreta e
  Estatísticas. Vai na URL (`?temporada=2025-26`). Padrão: `temporadaExibida` (2025-26 durante o
  hiato; 2026-27 a partir do primeiro jogo, sozinho, como hoje).
- **Resultados em 2025-26:** rodada a rodada, com as setas navegando pelas datas de 2025-26, cada
  apito com o veredito e o bloco de greens do Fire Live. Lê `apitos_retroativos`.
- **Lista Secreta em 2025-26:** seletor de data dentro de 2025-26; a Lista como teria saído,
  lendo `feed_retroativo`, sem odd, com link para o Resultado do dia.
- **Estatísticas em 2025-26:** jogador, time e jogo. "Apitos da estratégia" do jogador lê
  `apitos_retroativos`; a Hierarquia NIP do time mostra a ordem montada para 2025-26 (§3.3).
- **Plano:** em 2025-26 as três telas são abertas para o grátis (decisão 6). Em 2026-27 valem os
  portões de hoje (`exigirNivel` + `atende`), sem mudança.
- **Texto:** a tela diz que 2025-26 é "a metodologia NIP aplicada à temporada passada", para
  ninguém entender que os apitos foram publicados na época. "Confiança", nunca "probabilidade".
- **Fora:** Placar público, landing, Ao Vivo e push nunca leem as tabelas retroativas.

## 6. Testes

Os 15 testes-âncora do motor ficam intocados (o motor não muda). Novos, com PGlite, sem mock:

1. `montarFatosRetroativos` usa o time real de 2025-26, não o da lista (Giannis no MIL).
2. Jogador trocado no meio da temporada muda de time na data certa.
3. Hierarquia: nível do jogador primeiro, depois a posição na lista do CJ.
4. Média do dia D nunca inclui o jogo de D nem posteriores.
5. Quem não jogou (sem linha ou 0 min) é desfalque; OPD só com desfalque em prefixo.
6. Jogador fora da lista do CJ não apita nem entra na hierarquia.
7. Rodar o script duas vezes não duplica; trocar a versão da lista regrava a temporada.
8. Nada retroativo chega ao Placar público, à landing, ao Ao Vivo nem à fila de push.
9. Grátis vê 2025-26 nas três telas; continua sem ver a Lista de 2026-27.
10. `?temporada=` inválido cai na temporada exibida.

## 7. Ordem de operação em produção

1. Chave GOAT ativa (retestar `/stats?period=1`).
2. **Guardar a lista do CJ:** exportar de produção todas as versões de `niveis_versao`, `niveis` e
   `mapa_jogadores` para um arquivo de backup. A fonte também está em
   `data/fontes/introducao-ia-nba.md`.
3. Limpar a demonstração e fazer o backfill de 2025-26 pelo runbook. A limpeza precisa vir antes:
   os jogadores inventados têm os mesmos nomes dos reais, e o backfill não cria jogador com nome
   já existente (vira conflito de identidade). Como `niveis.jogador_id` aponta para esses
   jogadores inventados, as linhas da lista no banco saem junto — por isso o passo 2 vem antes.
4. **Restaurar a lista do CJ** a partir do backup do passo 2, com as mesmas versões, a mesma
   versão ativa, níveis, times e ordem, agora ligada aos jogadores reais pelo nome na lista. O que
   não bater exato fica para o parceiro confirmar em `/admin/mapeamento`; nome nunca autoriza
   vínculo sozinho. Um script de restauração com teste garante que nada da lista se perde
   (contagem de linhas por versão igual antes e depois, fora os pendentes de confirmação).
5. `motor:retroativo` sobre 2025-26.
6. Conferir: contagem de apitos por mês, amostra de dias em Resultados, um jogador conhecido em
   Estatísticas.

Todo o código e os testes podem ser feitos antes da chave, com dado de teste. Só os passos 1–6
esperam o GOAT.

## 8. Fora do escopo

- As regras novas do CJ da reunião de 23/09 (rebotes 8 → 7, AST/REB ≥ 4, matchup) — spec
  própria.
- O backtest do admin continua como está.
- Odds históricas.
- Temporadas anteriores a 2025-26.

## 9. Registro (25/09/2026 — execução)

Implementado em 12 tarefas (branch `motor-temporada-anterior`, base `f4c9e3d`), por
subagentes, com revisão a cada tarefa. O motor (`src/modules/motor`) e o
`config/ruleset.v1.yaml` não foram tocados — confirmado por `git diff` no fim.

### O que foi construído

- Coluna `estatisticas_jogo.time_id` (migração 0033) e as tabelas
  `apitos_retroativos`, `greens_retroativos`, `feed_retroativo` (migração 0034).
- `montarFatosRetroativos`, com a fronteira de temporada (§3.3) e a hierarquia por
  atributo.
- `motor:retroativo` (script de operação, nunca cron): roda o motor de sempre sobre
  um intervalo de uma temporada já encerrada, com `--dry-run`, é reexecutável e
  recusa a temporada do calendário.
- `lista-cj:backup` / `lista-cj:restaurar`, com confirmação humana em
  `/admin/mapeamento` para cada nome.
- Seletor de temporada em Resultados, Lista Secreta e Estatísticas.

### Decisões tomadas em seu nome (e por quê)

A spec não cobria tudo — nestes pontos alguém precisava decidir para o código andar.
Nenhuma delas muda a metodologia; são sobre COMO os dados de 2025-26 chegam até o
motor.

- **A restauração da lista do CJ não liga ninguém pelo nome sozinha.** Mesmo com nome
  idêntico, o vínculo fica pendente em `/admin/mapeamento` até você confirmar (é a
  mesma regra que já valia hoje: "nome nunca autoriza vínculo"). Sem essa confirmação,
  a hierarquia de 2025-26 fica vazia e o motor retroativo não apita ninguém — por
  isso o runbook tem o passo de confirmar e rodar a restauração de novo.
- **Rodar `lista-cj:restaurar` de novo RECONSTRÓI os níveis de cada versão
  restaurada, do zero, a partir do backup mais os vínculos confirmados até
  aquele momento.** Confirmar um nome de novo (por exemplo, para corrigir uma
  confirmação errada) troca o vínculo; e qualquer nível que alguém tenha
  inserido à mão numa versão já restaurada, no meio do caminho, é descartado
  no próximo `restaurar` — só o que está no backup mais as confirmações conta.
  Custo: nada de ajuste manual de nível sobrevive a uma nova rodada do
  comando; qualquer correção tem que passar por `/admin/mapeamento` antes de
  restaurar de novo, nunca direto no banco.
- **Jogador trocado no meio de 2025-26 conta como desfalque no time antigo até o
  primeiro jogo pelo novo time; jogador que se lesionou por muito tempo conta como
  desfalque no último time dele.** É a consequência direta das decisões 2 e 4 que
  você já tinha dado, mas vale avisar: isso abre OPD para o time antigo logo depois
  de uma troca, mesmo sabendo que o jogador já saiu.
- **Fora do hiato, Resultados e Lista Secreta abrem direto na temporada do calendário**
  (2026-27), não na "temporada exibida" que a spec original citava — se seguisse a
  spec ao pé da letra, a Lista Secreta paga ficaria presa em 2025-26 até o primeiro
  jogo da nova temporada terminar, no dia da estreia. Estatísticas continuam com o
  comportamento de hoje (a "exibida"), porque ali não há paywall que possa "sair do
  ar" por isso. Em qualquer tela, o seletor manual sempre funciona.
- **A hierarquia de 2025-26 é por atributo**: o nível e a posição do jogador que
  valem são os do atributo em avaliação (hoje só Pontos), não uma ordem única do
  time. Isso segue o mesmo padrão que já existe hoje.

O restante das decisões técnicas tomadas durante a execução — sobre nomes de
função, formato de teste, ordem de arquivo — está registrado no ledger
(`.superpowers/sdd/2026-09-25-motor-temporada-anterior/progress.md`, as
linhas `Ruling:`) e não muda nada do que você vê no produto.

### O que confirmar quando for para produção

1. **Confirmar em `/admin/mapeamento` os nomes da lista do CJ** depois de rodar
   `lista-cj:restaurar` — sem isso 2025-26 fica sem apito (passo 9 do runbook).
2. **Aceitar (ou pedir para revisar) o ponto acima sobre jogador trocado/lesionado**
   contando como desfalque no time antigo — é o que a metodologia já manda fazer,
   mas gera OPD num time que o jogador já deixou.
3. Rodar o runbook (`docs/runbooks/temporada-retroativa.md`) na ordem, com a chave
   GOAT ativa.
4. **Aceitar (ou definir a regra para) o jogador da lista do CJ que ainda não
   jogou em 2025-26.** Exemplo: um jogador machucado desde a estreia que só volta
   em janeiro. Em 2025-26 o time de cada um é o do último jogo dele (decisão 2);
   quem ainda não jogou nenhum jogo na temporada **não tem time** até a primeira
   partida. Nesse trecho:
   - ele **não está na hierarquia** de time nenhum;
   - por isso **não conta como desfalque** — a ausência dele não abre OPD para
     ninguém do time;
   - e o **bloco de topo do Fire Live** (ADR-0006) é calculado sem ele: se ele
     for um MVP do time, o topo passa a ser os outros MVPs — ou, sem nenhum, o
     nº 1 da hierarquia montada sem ele.
   Isso **não foi remendado** com um "time provável" inventado (o da lista do CJ,
   o da temporada anterior, o do cadastro do provedor): escolher um desses seria
   criar uma regra de metodologia que ninguém definiu (regra 3 do projeto). Vocês
   (parceiro e CJ) precisam aceitar o comportamento acima ou dizer qual regra
   vale, e aí ela entra no código.

### O que ficou para depois (não bloqueia o lançamento)

Pequenos ajustes registrados durante a execução, nenhum deles muda o resultado que
você vê hoje — ficam como lista de manutenção:

- Alguns casos de borda raros (jogo logo após meia-noite em São Paulo, jogo de
  pré-temporada, filtro de data numa tela de resultados) que só apareceriam em
  situações incomuns e não vazam dado — comportamento pré-existente ou sem efeito
  prático hoje.
- Duas pequenas diferenças de código (não de regra) entre trechos que fazem contas
  parecidas de médias e de nível de apito no Fire Live — documentadas para quem for
  mexer depois, sem impacto observável agora.
- Links de navegação em Estatísticas que, em alguns casos, não repetem a temporada
  escolhida na URL da próxima tela (o seletor continua funcionando, só não "viaja"
  automaticamente por todo clique).
- `scripts/backfill-ingestao.ts` tem a mesma validação de data um pouco frouxa que
  foi corrigida no `motor:retroativo` — fora do escopo desta entrega, vale corrigir
  numa manutenção futura.
