# Spec 01 — Ingestão persistente e crons

**Estado:** proposta · 19/08/2026
**Depende de:** nada
**Destrava:** absolutamente tudo. Enquanto isto não existir, nada do que já foi
construído roda com dado real.

---

## Problema

A camada L0 está inteira: porta anticorrupção, adapter HTTP, adapter fake, failover
com heartbeat, import da lista do CJ. **Nenhum job em produção a invoca para
persistir.** 8 tabelas canônicas não recebem escrita nenhuma:

```
jogadores · jogos · estatisticas_jogo · estatisticas_quarto
estatisticas_time_jogo · classificacao · lesoes_escalacao · medias_jogador
```

Consequência em cadeia: `montarFatos` devolve vazio → a Lista Secreta não publica;
nenhum jogo tem `quarto_atual = 1` → o Fire Live nunca dispara; as três telas de
estatísticas ficam em branco.

`times` é a única canônica com escrita, e vem do import da lista — não do provedor.

---

## Três buracos de contrato descobertos

Não são detalhes de implementação; mudam o modelo de dados.

### 1 · Nenhuma tabela canônica guarda id de provedor

Só `mapa_jogadores.provedor_player_id` existe. Para `jogos` não há nada — e o
sistema tem **duas fontes com failover**, cujos ids são diferentes entre si.

> **Decisão proposta:** a chave natural de um jogo é
> `(data_hora_utc::date, time_casa_id, time_visitante_id)`, estável entre
> provedores. Guardar `id_externo` por provedor seria criar dois jogos para a
> mesma partida quando o failover trocasse de fonte.
>
> Custo: dois jogos do mesmo par no mesmo dia (não acontece na NBA) quebrariam a
> chave. Aceito.

Migration: `UNIQUE (data_hora_utc::date, time_casa_id, time_visitante_id)` em
`jogos`. Exige coluna gerada ou índice funcional.

### 2 · A porta `FonteNBA` não cobre dois dados que as telas usam

| Falta na porta | Quem consome |
| --- | --- |
| `classificacao(temporada)` | tela do time, menu de times |
| box score do **time** com quebra por quarto | tela do time |

O box score do time pode ser somado a partir das linhas de jogador, mas os
**pontos por quarto do time** não: a soma dos jogadores classificados ≠ pontos do
time, porque a lista do CJ não cobre o elenco inteiro. Precisa vir do provedor.

Adicionar à porta:

```ts
classificacao(temporada: string): Promise<LinhaClassificacaoExterna[]>
boxScoreDoTime(jogoIdExterno: string): Promise<LinhaBoxScoreTimeExterna[]>
```

### 3 · `medias_jogador` não vem de provedor nenhum

É **derivada**. O ruleset manda: `media.janela: temporada`, `media.modo: movel`.
Logo, recalcular após cada rodada, sobre `estatisticas_jogo`.

> **Regra 1 do CLAUDE.md:** a janela sai do ruleset, nunca do código. O job lê
> `ruleset.media.janela` e decide o recorte a partir dela.

---

## Escopo

### Entra

- Módulo `src/modules/ingestao/sincronizar/` com uma função por entidade
- Persistência **idempotente** de todo o canônico
- Cálculo de `medias_jogador`
- Quatro rotas de cron, na cadência contratada
- **Loop ao vivo** — ver abaixo, é o mais crítico

### Não entra

- Odds (spec 06)
- Alerta de dado parado (spec 07) — o heartbeat já grava; falta só quem avalia
- Reconciliação automática de nomes: segue com confirmação humana no painel

---

## O loop ao vivo é o item crítico

A cadência da visão lista "Fire Live e estatísticas ao vivo: ciclo curto". Isso
não é um cron diário: **é o que escreve `estatisticas_quarto` durante a partida**,
e é dele que o Fire Live lê.

Sem este loop, o workflow do 1º quarto sobe, observa um estado que nunca muda,
avalia zero jogadores e encerra pela trava de tempo — sem nenhum apito. O Fire
Live inteiro depende dele.

```
cron a cada minuto
   ↓
jogos com status AO_VIVO (ou que deveriam ter começado)
   ↓
boxScore(jogo) -> upsert estatisticas_quarto + estatisticas_jogo
                  upsert jogos.quarto_atual, placar, tempo_restante
```

Cadência: o intervalo de observação do Fire Live é 20s
(`fire_live.observacao.intervalo_segundos`). O Vercel Cron tem granularidade de
1 minuto — o loop ao vivo precisa **iterar dentro da invocação** ou ser um
Workflow, como o Fire Live. Ver "Riscos".

---

## Contrato de persistência

Toda função de sincronização é **reexecutável sem efeito colateral**. Chave
natural e `onConflictDoUpdate`, seguindo o padrão de `importarListaDeNiveis`.

| Entidade | Chave natural | Conflito |
| --- | --- | --- |
| `times` | `sigla` | atualiza nome, logo, conferência |
| `jogadores` | `mapa_jogadores(provedor, provedor_player_id)` | atualiza perfil e `ativo` |
| `jogos` | `(data, casa, visitante)` | atualiza status, quarto, placar |
| `estatisticas_jogo` | `(jogo, jogador)` | atualiza tudo |
| `estatisticas_quarto` | `(jogo, jogador, quarto)` | atualiza tudo |
| `estatisticas_time_jogo` | `(jogo, time)` | atualiza tudo |
| `lesoes_escalacao` | `(jogo, jogador)` | atualiza status e motivo |
| `classificacao` | `(temporada, time)` | atualiza campanha |
| `medias_jogador` | `(jogador, temporada, janela)` | recalcula |

Toda escrita carimba `atualizado_em` — a aba de estatísticas exibe esse horário e
ele não pode ser o do relógio da consulta.

**Jogador sem mapeamento confirmado não é inventado.** Se o provedor traz um
jogador que não está em `mapa_jogadores`, o registro entra em `jogadores` e o
nome cai na fila de curadoria do painel. Nunca se cria vínculo automático — a
lista do CJ é curadoria humana (CLAUDE.md, Armadilhas).

---

## Crons

| Rota | Expressão | O que faz |
| --- | --- | --- |
| `/api/cron/sincronizar-elenco` | `0 9 * * *` | times, jogadores, jogos do dia |
| `/api/cron/sincronizar-rodada` | `0 11 * * *` | box score, box do time, classificação, médias |
| `/api/cron/sincronizar-escalacao` | `0 */6 * * *` | lesões e desfalques |
| `/api/cron/ao-vivo` | `* * * * *` | placar, quarto atual, quebra por quarto |

Todas autenticadas por `CRON_SECRET`, como as duas existentes.

> A rodada roda às 11h UTC de propósito: a NBA fecha de madrugada no fuso de
> Brasília, e a classificação só é confiável depois do último jogo.

---

## Regras que isto toca

- **Regra 1** — janela da média sai do ruleset
- **Regra 3** — não inventar: jogador sem mapeamento vai para curadoria, não para
  vínculo automático
- **Armadilha do elenco projetado** — `jogadores.time_id` recebe o time REAL do
  provedor; o vínculo de estratégia continua vindo de `niveis.time_id`

---

## Perguntas antes de codar

1. **Quem é o provedor primário e o reserva?** `PROVEDOR_NBA` já existe no
   ambiente, mas não há credencial nem base URL de nenhum dos dois.
2. **A temporada tem rótulo oficial?** Hoje a aba deriva de `getUTCFullYear()`,
   com TODO. A NBA atravessa o ano civil; "2025-26" não sai daí.
3. **O provedor entrega quebra por quarto do time?** Se não, os pontos por quarto
   da tela do time ficam sem fonte, e a spec 05 muda.

---

## Pronto quando

- Um banco vazio, após um ciclo completo de todos os crons, tem as 8 tabelas
  canônicas preenchidas
- Rodar qualquer cron **duas vezes seguidas** não muda contagem nem conteúdo
- `montarFatos` devolve times e jogos para o dia sincronizado
- Um jogo marcado como `AO_VIVO` com `quarto_atual = 1` faz o cron do Fire Live
  reservar e o workflow disparar apito de ponta a ponta
- A média calculada bate com a média manual de um jogador de fixture
- Falha do provedor primário faz o reserva assumir sem que o job perceba, e
  `saude_provedor` registra a degradação

---

# Plano

### Fatia 1 · Fechar o contrato (sem I/O)

1. Migration: índice único natural de `jogos`
2. Estender `porta.ts` com `classificacao` e `boxScoreDoTime` + tipos externos
3. Implementar os dois métodos no adapter fake — o fake é o que sustenta os testes
4. `FonteComFailover` ganha os dois métodos por delegação

**Verificação:** testes de failover cobrindo os métodos novos.

### Fatia 2 · Sincronização, uma entidade por vez

Ordem obrigatória — cada uma depende da anterior:

1. `sincronizarTimes` → `sincronizarJogadores` → `sincronizarJogos`
2. `sincronizarEscalacao`
3. `sincronizarBoxScore` (jogador + quarto) e `sincronizarBoxScoreDoTime`
4. `sincronizarClassificacao`
5. `recalcularMedias` — lê a janela do ruleset

Cada uma com teste de idempotência: rodar duas vezes, comparar o banco.

### Fatia 3 · Crons

Quatro rotas, todas com a guarda de `CRON_SECRET` e registro em `vercel.ts`.

### Fatia 4 · Loop ao vivo

1. Decidir entre Workflow e cron-com-iteração (ver Riscos)
2. Escrever placar, quarto e quebra por quarto
3. **Teste de ponta a ponta:** ingestão ao vivo alimenta o ciclo do Fire Live e
   produz apito — hoje esse caminho só é exercitado com fixture escrita à mão

### Fatia 5 · Fechar o alerta

Ligar `registrarBatimento` ao failover em produção. `avaliarFrescor` já existe e
nunca é chamado; quem o chama é a spec 07.

---

## Riscos

**O loop ao vivo pode não caber em cron.** Granularidade mínima do Vercel Cron é
1 minuto; o Fire Live observa a cada 20s. Um cron que itere 3× com espera dentro
da invocação resolve, mas gasta CPU ativa. A alternativa é um Workflow por
janela de rodada, como o do 1º quarto. **Decidir com medição, não por preferência.**

**Custo de API.** Um loop de 20s × 8 jogos simultâneos × 30 min é ~720 chamadas
por rodada só de box score. Confirmar limite do contrato com o provedor antes de
fixar a cadência.

**A chave natural de jogo assume um confronto por dia.** Verdadeiro na NBA
regular. Se um dia deixar de ser, a UNIQUE falha de forma barulhenta — que é o
comportamento correto.
