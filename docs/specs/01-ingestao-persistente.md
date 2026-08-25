# Spec 01 — Ingestão real

**Estado:** implementada em código; rollout bloqueado pelos gates reais · 21/08/2026

**Depende de:** [Spec 00 — Estabilização](00-estabilizacao.md)

**Destrava:** dados reais para Lista Secreta, estatísticas e Fire Live

---

## Objetivo

Colocar em produção uma ingestão NBA contínua, idempotente, observável e capaz de
trocar de provedor sem corromper a identidade canônica. A entrega termina quando
um banco novo pode ser preenchido e mantido por jobs reais, inclusive durante o
primeiro quarto de uma partida.

Esta spec não reimplementa a base já entregue. O repositório possui porta
`FonteNBA`, adapter HTTP, fake, failover, sincronizadores, modelo canônico,
resolução de temporada, heartbeat e o workflow do Fire Live. Faltam homologar
fontes reais, orquestrar as peças e provar o fluxo em produção.

---

## Pré-condições da Spec 00

Antes do rollout, a estabilização precisa garantir:

1. temporada única e explícita em ingestão, motor e telas;
2. médias filtradas pela temporada do jogo;
3. identidade de origem preservada quando o failover troca de fonte;
4. crons fail-closed sem `CRON_SECRET`;
5. reserva recuperável do workflow;
6. Fire Live incluindo atletas não classificados.

---

## Escopo

### Entra

- homologação do provedor primário e do reserva com fixtures sanitizadas;
- configuração validada antes de qualquer escrita;
- orquestradores diários e ao vivo;
- quatro rotas de cron registradas na infraestrutura;
- backfill e reconciliação por janela de datas;
- logs, heartbeat e métricas operacionais;
- testes de contrato, idempotência, concorrência, failover e ponta a ponta.

### Não entra

- odds e blowout (Spec 06);
- backtest e canal definitivo de alerta (Spec 07);
- vínculo automático por semelhança de nome;
- regras esportivas novas;
- Web Push, PWA e cobrança (Specs 02–04).

---

## Contratos obrigatórios

### 1. Toda resposta identifica a fonte efetiva

O failover retorna `{ provedor, capturadoEm, dadoAtualizadoEm, dados }`. O
sincronizador não recebe o provedor por um parâmetro independente e nunca presume
que o primário respondeu. IDs externos só são gravados no namespace da fonte que
os forneceu.

Jogos precisam de identidade externa por provedor, além da chave canônica. Uma
consulta não pode obter o ID do primário e entregá-lo ao reserva. Trocar de fonte
não autoriza unir atletas ou jogos por nome; conflito vai para curadoria.

### 2. Rodada e instante são conceitos distintos

`data_hora_utc` representa o instante real. `data_referencia` representa a rodada
NBA segundo o timezone e a regra homologados com o provedor. Jobs e consultas de
Lista Secreta usam `data_referencia`; ordenação e exibição usam o instante UTC.

O harness deve cobrir uma partida noturna que cruza meia-noite UTC.

### 3. Temporada é argumento obrigatório

Cada job resolve a temporada uma vez por `temporadaDe(instante, ruleset)` e a
passa à sincronização, às médias e às consultas. É proibido derivá-la apenas com
`getUTCFullYear()` ou buscar média sem temporada.

### 4. Payload externo é validado na borda

Cada adapter real tem schema próprio e fixtures do contrato real. Ausência ou
formato inesperado não vira `[]`, `0` ou `AGENDADO`. O mapeamento cobre todos os
status, intervalo, prorrogação, relógio, paginação e timestamp de origem.

O adapter HTTP genérico existente é infraestrutura, não integração homologada.

### 5. Escrita é idempotente e atômica

Toda entidade usa constraint e upsert. Reexecutar o mesmo payload preserva
cardinalidade e conteúdo. Um box score não atualiza placar e deixa atletas pela
metade. A criação de jogador e identidade externa ocorre na mesma transação, sem
órfãos sob concorrência.

| Entidade | Identidade |
| --- | --- |
| time | `sigla` |
| jogador externo | `(provedor, provedor_player_id)` |
| jogo externo | `(provedor, jogo_id_externo)` associado ao jogo canônico |
| estatística do jogador | `(jogo_id, jogador_id)` |
| estatística por quarto | `(jogo_id, jogador_id, quarto)` |
| estatística do time | `(jogo_id, time_id)` |
| lesão/escalação | `(jogo_id, jogador_id)` |
| classificação | `(temporada, time_id)` |
| média | `(jogador_id, temporada, janela)` |

### 6. Snapshot e delta são explícitos

Para cada endpoint, o adapter declara se a resposta é snapshot completo ou
delta. Em snapshot, a ausência reconcilia o estado anterior; por exemplo, um
atleta recuperado não pode permanecer `FORA` para sempre. Em delta, remoções
exigem evento/tombstone explícito.

Médias usam apenas jogos `ENCERRADO` e uma regra documentada de “jogou” para
excluir DNP. Correções posteriores recalculam a temporada afetada.

---

## Loop ao vivo

Há um único dono do ciclo. O cron de um minuto descobre jogos previstos/em
andamento, sincroniza o estado inicial e inicia ou retoma um workflow durável por
jogo.

Em cada ciclo do workflow:

1. busca jogo, placar e box score na mesma fonte/resolução de identidade;
2. valida e persiste o snapshot numa transação;
3. confirma a transação;
4. no primeiro quarto, avalia o Fire Live sobre esse snapshot;
5. aguarda o intervalo do ruleset e repete.

Depois do primeiro quarto, o motor para, mas a atualização estatística continua
até o status final. Não se mantém uma função cron aberta com `sleep`.

---

## Jobs e cadência inicial

Todos usam a guarda da Spec 00 e lock/idempotência por janela.

| Rota | Agenda inicial | Responsabilidade |
| --- | --- | --- |
| `/api/cron/sincronizar-elenco` | `0 9 * * *` | times, elenco e agenda relevante |
| `/api/cron/sincronizar-rodada` | `0 11 * * *` | resultados, box scores, classificação e médias |
| `/api/cron/sincronizar-escalacao` | `0 */6 * * *` + janela pré-jogo | lesões e disponibilidade |
| `/api/cron/ao-vivo` | `* * * * *` | descobrir jogos e iniciar/retomar workflows |

A escalação também é atualizada numa janela próxima do início do jogo; uma
agenda fixa de seis horas não satisfaz a Lista Secreta publicada uma hora antes.
O job de rodada usa sobreposição configurável para recuperar atrasos e correções.

---

## Configuração e operação

As chaves usadas no código aparecem sem segredo no `.env.example`:

```dotenv
NBA_PRIMARIO_NOME=balldontlie
BALLDONTLIE_BASE_URL=https://api.balldontlie.io/nba/v1
BALLDONTLIE_API_KEY=
NBA_RESERVA_NOME=api-sports-nba
API_SPORTS_NBA_BASE_URL=https://v2.nba.api-sports.io
API_SPORTS_NBA_KEY=
NBA_TIMEOUT_MS=8000
NBA_RESERVA_OBRIGATORIA=true
NBA_INGESTAO_HABILITADA=false
CRON_SECRET=
```

O reserva pode ser opcional apenas se a operação aceitar explicitamente operar
sem redundância; o primário nunca pode ser usado como “reserva de si mesmo”.
Configuração inválida encerra o job antes de escrever e não imprime credenciais.

Cada execução registra `job_id`, job, janela, temporada, fonte efetiva, duração,
contagens e resultado. O heartbeat é aguardado e só marca sucesso após payload
válido e persistência confirmada. `dadoAtualizadoEm` vem da origem; horário de
resposta sozinho não prova frescor.

Falhas são tratadas assim:

- configuração ou 401/403: falha imediata e alerta;
- 429: respeita `Retry-After`, com backoff e jitter;
- timeout/5xx: retry limitado e então failover;
- payload inválido: rejeição e evidência sanitizada;
- conflito de identidade: curadoria, sem vínculo automático;
- banco: rollback e retry idempotente.

---

## Harness de validação

### Automatizado

1. contract tests por provedor com fixtures reais sanitizadas;
2. paginação, 429, 5xx, timeout, payload vazio/malformado e todos os status;
3. troca de fonte com IDs diferentes sem duplicar jogador ou jogo;
4. reexecução e concorrência real no Postgres sem mudança de cardinalidade;
5. rollback integral de box score;
6. rodada atravessando meia-noite UTC;
7. linha do tempo `AGENDADO → 1Q → INTERVALO → Q2 → ENCERRADO`;
8. escalação `FORA → ausente/ATIVO` conforme a semântica da origem;
9. médias excluindo jogo ao vivo e DNP;
10. duas temporadas sem contaminação;
11. retomada após falha entre reserva e início do workflow;
12. persistência concluída antes da avaliação do Fire Live;
13. cron sem segredo/configuração e falha parcial.

### Smoke controlado

1. backfill de um dia conhecido em banco isolado;
2. comparação de agenda, placar, box score e classificação com a fonte;
3. repetição e comparação de hash/contagem;
4. falha induzida do primário e confirmação de failover/heartbeat;
5. acompanhamento de um jogo real do início ao fim;
6. confirmação de frescor, encerramento do workflow e ausência de jobs presos.

### Pronto quando

- tabelas canônicas são preenchidas sem fixture manual;
- Lista Secreta e telas usam rodada e temporada corretas;
- um 1º quarto real alimenta o Fire Live ponta a ponta;
- retry e concorrência não criam duplicatas;
- dado malformado nunca vira zero válido;
- nenhuma fonte recebe ou grava ID de outra fonte;
- falha total preserva o último snapshot e deixa evidência operacional;
- todos os crons rejeitam chamadas sem segredo válido.

---

# Plano

### Fatia 0 — Homologação

Escolher as fontes, documentar SLA/rate limit/cobertura, capturar fixtures,
confirmar timezone, split por quarto e semântica snapshot/delta. Calcular o
orçamento de chamadas. Este é o gate para adapters reais.

### Fatia 1 — Contratos e migrations

Adicionar identidade externa de jogo, `data_referencia`, timestamp da origem e
retorno source-aware. Corrigir criação concorrente de identidades e médias.

### Fatia 2 — Adapters reais

Implementar um adapter específico por provedor, schemas de borda, paginação,
timeouts e contract tests. Completar `.env.example` e validação de configuração.

### Fatia 3 — Orquestração diária

Criar serviços de aplicação, locks e as três rotas de elenco, rodada e escalação.
Executar com fake e banco isolado antes da fonte real.

### Fatia 4 — Workflow ao vivo

Criar descoberta por minuto e o ciclo único `buscar → persistir → avaliar →
esperar`, com retomada, timeout e encerramento testados.

### Fatia 5 — Backfill e observabilidade

Adicionar comando por data/temporada com dry-run, checkpoint e relatório de
divergências. Ligar heartbeat aguardado, métricas de frescor e alerta provisório.

### Fatia 6 — Rollout

Fake em CI → fonte real em modo sombra → um dia conferido manualmente → Lista
Secreta → Fire Live em piloto → expansão por métricas.

Rollback desliga schedules e novos workflows, preserva os dados e mantém leitura
do último snapshot válido. Migrations aditivas não são revertidas no incidente.

---

## Decisões pendentes

Resolvido nesta execução:

1. BALLDONTLIE GOAT é o primário (`balldontlie`);
2. API-SPORTS API-NBA Ultra é o reserva (`api-sports-nba`) e o dono de
   estatística agregada do time;
3. `data_referencia` usa a data declarada pelo provedor, nunca truncamento UTC;
4. médias excluem jogo não encerrado e minutos nulos/zero;
5. detalhes operacionais estão em
   [ingestao-nba.md](../runbooks/ingestao-nba.md).

Gates ainda obrigatórios antes de produção:

1. duas respostas reais sanitizadas de cada fonte (jogo ao vivo e encerrado)
   para congelar o contrato e confirmar a divergência HTML/OpenAPI da BDL;
2. confirmar a regra oficial/timezone de `date` comparando as duas fontes;
3. escolher uma fonte que documente escalação completa pré-jogo; as duas
   escolhidas não oferecem essa capacidade por partida;
4. definir a janela inicial do backfill e tolerância de frescor. Nenhuma das
   APIs documenta `updated_at` para os recursos usados;
5. definir responsável/canal do alerta até a Spec 07;
6. smoke em banco isolado e sombra com credenciais de Preview.
