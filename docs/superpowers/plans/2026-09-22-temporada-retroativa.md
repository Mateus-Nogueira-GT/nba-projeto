# Temporada retroativa — plano de execução

> **Executado em 22/09/2026.** Os passos ficam marcados como registro do que
> foi feito. Três ajustes de rota durante a execução estão anotados em
> *Desvios do plano*, no fim do arquivo.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) ou superpowers:executing-plans para implementar tarefa a tarefa.
> Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** o app entra no ar em ~02/10/2026 mostrando **estatísticas, classificação e
resultados reais da temporada 2025-26** lidos do BALLDONTLIE, e vira sozinho para a
2026-27 quando a bola subir em ~03/11 — sem deploy, sem editar ruleset, sem intervenção.

**Architecture:** duas frentes que não se cruzam. **L0 (ingestão):** a fronteira passa a
resolver o jogador que o box score cita e o cadastro não conhece, que é o que hoje mata o
backfill inteiro. **L1 + L3 (domínio e entrega):** nasce o conceito de *temporada
exibida* — função pura ao lado de `temporadaDe` — e as cinco telas de consulta passam a
perguntar por ela em vez de perguntar ao calendário. **O motor não é tocado.**

**Tech Stack:** TypeScript, Zod, Drizzle + Postgres, vitest + PGlite, `vi.fn<typeof fetch>()`
para fixtures HTTP.

**Spec:** [`docs/superpowers/specs/2026-09-22-temporada-retroativa-design.md`](../specs/2026-09-22-temporada-retroativa-design.md)

---

## Restrições globais

Do `CLAUDE.md` — valem para todas as tarefas:

1. **Nenhuma regra de estratégia no código.** O único número novo (`minimo_jogos_para_exibir`)
   vai para o ruleset.
2. **O motor é puro** — e nesta entrega ele nem é aberto. Um `git diff --stat` que toque
   `src/modules/motor/**` é sinal de que algo saiu do trilho.
3. **Nunca inventar regra.** As três decisões de produto estão na seção 2 da spec. O que
   não estiver lá, pergunte.
4. Domínio em português, infraestrutura em inglês.
5. Verificação padrão de toda tarefa:
   `npm run typecheck && npm run lint && npm run boundaries && npm test`.
6. **Confira o disco antes de cada bateria de teste** (`df -h / /System/Volumes/Data`);
   abaixo de ~3 GB livres, limpe primeiro. Duas corridas completas comem ~12 GB.

---

## Ordem das etapas

| Etapa | O quê | Por que nesta ordem |
| --- | --- | --- |
| 1 | Ingestão aguenta o retroativo (T1–T2) | sem isso o backfill não completa, e todo o resto fica sem dado |
| 2 | Temporada exibida (T3–T5) | é onde mora o defeito silencioso: backfill certo + tela vazia |
| 3 | O app no hiato (T6–T7) | só faz sentido depois que há dado e as telas o encontram |
| 4 | Operação (T8–T9) | o runbook descreve o que as etapas 1–3 tornaram possível |

---

# Etapa 1 · A ingestão aguenta o retroativo

### T1: `jogadoresPorId` na porta e no adapter BALLDONTLIE

**Files:**
- Modify: `src/modules/ingestao/nba/porta.ts`, `src/modules/ingestao/nba/failover.ts`,
  `src/modules/ingestao/nba/adaptadores/balldontlie.ts`,
  `src/modules/ingestao/nba/adaptadores/api-sports.ts`
- Create: `src/modules/ingestao/nba/adaptadores/__fixtures__/balldontlie-players-by-id.json`
- Test: `src/modules/ingestao/nba/adaptadores/__tests__/balldontlie.test.ts`

**Interfaces:**

```ts
// porta.ts — capacidade nova na FonteNBA
jogadoresPorId(idsExternos: string[]): Promise<JogadorExterno[]>
```

`JogadorExterno` **já tem** `ativo: boolean` ("false quando o provedor indica que o
jogador não está mais na liga", `porta.ts:37-38`) — não precisa de campo novo.

- [x] **Step 1 — testes que falham:** lote de 3 ids devolve 3 jogadores; um aposentado
      volta com `ativo: false`; id inexistente simplesmente não aparece na resposta (não
      lança); lote de 250 ids é partido em páginas de 100 (`per_page` máximo da BDL) e o
      cursor é seguido; lista vazia não faz requisição nenhuma
- [x] **Step 2:** rodar → FAIL (método não existe)
- [x] **Step 3 — implementar:** `GET /players?player_ids[]=<id>&...&per_page=100`,
      reusando `buscarLista` (que já pagina por cursor). Mapear pelo mesmo mapeador de
      `listarJogadores`, sem duplicar a tradução
- [x] **Step 4:** API-SPORTS lança `CapacidadeNaoSuportadaError('api-sports-nba', 'jogadoresPorId')`
      até alguém documentar o equivalente — **não invente endpoint na reserva**
- [x] **Step 5:** `failover.ts` encaminha a capacidade no mesmo padrão das outras
- [x] **Step 6:** testes passam · `npm run boundaries` limpo
- [x] **Step 7:** commit `"A fronteira NBA aprende a perguntar por um jogador pelo id"`

### T2: a partida resolve o desconhecido antes de rejeitar

**Files:**
- Modify: `src/modules/ingestao/sincronizar/partida.ts`
- Test: `src/modules/ingestao/__tests__/sincronizar.test.ts`

**O defeito que esta tarefa corrige** está em `partida.ts:102-109`: hoje um único jogador
fora do cadastro descarta **a partida inteira**. A rejeição continua existindo — ela é o
que impede estatística órfã. O que muda é que ela passa a significar "o provedor também
não sabe quem é", e não "o jogador se aposentou".

A peça de gravação **já existe** e é a certa: `garantirJogadores` em
`sincronizar/identidade.ts:49`, cujo próprio comentário diz que cria os ~500 da liga e
**nunca** toca no vínculo com a lista do CJ (`mapa_jogadores`, curadoria humana).

- [x] **Step 1 — testes que falham:**
      (a) box score com um jogador fora do cadastro, que o provedor conhece → a partida
      **grava**, o jogador nasce em `jogadores` com `ativo: false` e a identidade em
      `identidades_jogador`;
      (b) box score com id que o provedor **também** não conhece → continua rejeitando,
      com a mesma mensagem;
      (c) reexecutar a mesma partida não cria jogador duplicado (idempotência);
      (d) **nenhuma linha nova em `mapa_jogadores`** — é a asserção que prova que a
      curadoria do CJ não foi tocada
- [x] **Step 2:** rodar → FAIL
- [x] **Step 3 — implementar:** entre o cálculo de `desconhecidos` e o `throw`, chamar
      `fonte.jogadoresPorId(desconhecidos)` e passar o resultado a `garantirJogadores`;
      recarregar o mapa; só então rejeitar o que sobrou. `CapacidadeNaoSuportadaError` da
      reserva é capturada e volta ao comportamento de hoje (rejeitar) — o retroativo é do
      primário
- [x] **Step 4:** o resumo do job ganha `jogadores_criados`, para o runbook ter o que ler
- [x] **Step 5:** testes passam
- [x] **Step 6:** commit `"Box score de temporada passada para de morrer no primeiro aposentado"`

---

# Etapa 2 · A tela encontra o dado

### T3: o piso de exibição entra no ruleset

**Files:** Modify: `config/ruleset.v1.yaml`, `src/modules/motor/ruleset/schema.ts`
**Test:** `src/modules/motor/__tests__/auditoria-documento.test.ts` (ou o teste de schema vizinho)

```yaml
temporada:
  mes_inicio: 10
  formato: dois_anos
  # Quantos jogos ENCERRADOS a temporada do calendário precisa ter para as telas
  # de CONSULTA passarem a mostrá-la. 1 = vira no primeiro jogo encerrado, que é
  # o que mantém a consulta alinhada com o motor (a média sai só da temporada
  # nova — decisão do parceiro, 22/09). Subir o número adia a virada da consulta
  # sem tocar em código.
  minimo_jogos_para_exibir: 1
```

- [x] **Step 1:** teste — o ruleset atual valida e expõe o campo; ausente, o schema
      recusa (não invente default no código: regra 1)
- [x] **Step 2:** implementar no schema Zod e no YAML
- [x] **Step 3:** commit `"O piso de virada da consulta sai do código antes de existir nele"`

### T4: `temporadaExibida` — função pura

**Files:** Modify: `src/modules/dominio/temporada.ts` · Test:
`src/modules/dominio/__tests__/temporada.test.ts`

```ts
export function temporadaExibida(
  doCalendario: string,
  comDados: { temporada: string; jogosEncerrados: number }[],
  minimoJogos: number,
): string
```

- [x] **Step 1 — testes que falham (puros, sem banco):**
      calendário diz `2026-27` e ela tem 0 jogos, `2025-26` tem 1.230 → devolve `2025-26`;
      `2026-27` com 1 jogo e `minimoJogos: 1` → devolve `2026-27` (a virada);
      `2026-27` com 1 jogo e `minimoJogos: 30` → ainda `2025-26` (a alavanca funciona);
      **nenhuma temporada com dado** → devolve a do calendário (tela vazia honesta, nunca
      uma temporada inventada);
      duas anteriores com dado → devolve a **mais recente**, não a maior contagem
- [x] **Step 2:** rodar → FAIL
- [x] **Step 3:** implementar ao lado de `temporadaDe`, no mesmo arquivo e com o mesmo
      contrato de pureza (data e fatos entram como argumento)
- [x] **Step 4:** commit `"A tela ganha o direito de mostrar outra temporada que não a do calendário"`

### T5: quais temporadas têm dado

**Files:** Create: `src/modules/entrega/estatisticas/temporadas.ts` · Test:
`src/modules/entrega/__tests__/estatisticas-temporadas.test.ts`

```ts
export async function temporadasComDados(
  db: Db,
  config: ConfigTemporada,
): Promise<{ temporada: string; jogosEncerrados: number }[]>
```

- [x] **Step 1 — testes que falham (PGlite):** banco só com jogos de 2025-26 → uma linha;
      banco com as duas → duas linhas, mais recente primeiro; jogo `AGENDADO` **não**
      conta (é `jogosEncerrados`); banco vazio → lista vazia
- [x] **Step 2:** implementar — agregação por rótulo de temporada derivado de
      `jogos.dataHoraUtc` no fuso do ruleset, `status = 'ENCERRADO'`. A derivação usa a
      MESMA `temporadaDe`, nunca um `EXTRACT(YEAR ...)` paralelo: duas traduções
      divergentes foi o defeito que a errata de 25/08 pegou
- [x] **Step 3:** medir — se a agregação doer, materializar; **medir antes de otimizar**
- [x] **Step 4:** commit `"O banco passa a saber dizer de que temporadas ele tem dado"`

### T6: as cinco telas param de perguntar ao calendário

**Files:** Modify:
`src/app/(app)/estatisticas/page.tsx:461` ·
`src/app/(app)/estatisticas/time/[id]/page.tsx:284` ·
`src/app/(app)/estatisticas/jogador/[id]/page.tsx:461` ·
`src/app/(app)/lateral/montar.tsx:36` ·
`src/app/api/chat/route.ts:110`
**Test:** ampliar `src/app/__tests__/telas-04-estatisticas.test.ts` e
`telas-05-classificacao.test.ts`

- [x] **Step 1 — o teste que vale por todos:** banco com **só** a temporada 2025-26,
      relógio em **02/10/2026** (quando `temporadaDe` já devolve `2026-27`) → a tela de
      estatísticas mostra os times, a classificação e as médias de 2025-26. Hoje esse
      teste falha mostrando tela vazia, **sem erro nenhum** — é o defeito silencioso que
      a spec nomeia no 5.2
- [x] **Step 2:** teste do outro lado da virada: banco com as duas temporadas e um jogo
      encerrado em 2026-27 → a tela mostra 2026-27
- [x] **Step 3:** trocar as cinco chamadas por `temporadaExibida`, alimentada por
      `temporadasComDados` e pelo piso do ruleset
- [x] **Step 4:** a tela **diz qual temporada está mostrando**. Não é enfeite: sem isso o
      assinante lê média de 2025-26 achando que é de hoje. Rodapé no padrão de
      `UltimaAtualizacao`
- [x] **Step 5:** `/resultados` **não muda** — já redireciona para `ultimaRodadaConferida`
      (`resultados/page.tsx:39`). Confirmar com um teste, não com uma edição
- [x] **Step 6:** testes passam · boundaries limpo
- [x] **Step 7:** commit `"A consulta mostra a temporada que tem dado, e diz qual é"`

---

# Etapa 3 · O app durante o hiato

### T7: a abertura e o que as telas de apito dizem

**Files:** Modify: `src/app/(app)/abrir/page.tsx`, `src/app/(app)/page.tsx`,
`src/app/(app)/fire-live/page.tsx`
**Test:** `src/app/__tests__/navegacao.test.ts`, `telas-demo.test.ts`

Decisão 1 da spec: **sem apito no hiato.** As telas existem e precisam explicar o vazio —
é a experiência dominante por ~32 dias, e é onde o esmero vale mais que o código.

- [x] **Step 1 — testes que falham:** sem jogo hoje e sem temporada corrente com dado,
      `/abrir` redireciona para `/estatisticas` (hoje manda para `/`, que dirá apenas
      "Sem jogos hoje"); com jogo no 1Q, continua indo para `/fire-live`
- [x] **Step 2:** `/` e `/fire-live` no hiato dizem **o motivo** e apontam a saída:
      a temporada ainda não começou, e as estatísticas da 2025-26 estão ali ao lado
- [x] **Step 3:** se houver jogo `AGENDADO` no banco, o texto traz a data do próximo;
      **se não houver, não promete data nenhuma** — inventar "volta em novembro" é
      inventar fato (regra 3)
- [x] **Step 4:** testes passam
- [x] **Step 5:** commit `"O app explica o hiato em vez de mostrar uma tela vazia"`

---

# Etapa 4 · Operação

### T8: runbook do retroativo

**Files:** Create: `docs/runbooks/temporada-retroativa.md` · Modify:
`docs/runbooks/ingestao-nba.md` (link), `docs/demonstracao.md` (o que deixa de valer)

- [x] **Step 1:** escrever a ordem, que é **sequencial e não negociável**:
      1. `DEMO_AUTOSSEMEADURA=false` — antes de tudo, senão o cron diário ressemeia por cima
      2. `BALLDONTLIE_API_KEY` (plano GOAT) e `NBA_INGESTAO_HABILITADA=true`
      3. `npm run ingestao:backfill -- --from=… --to=… --dry-run` — confere sem gravar
      4. `npm run demo:limpar -- --confirmar` — apaga só domínio; contas, sessões,
         assinaturas e push **permanecem**
      5. backfill de verdade, com `--resume` à mão para retomar
      6. conferir: `jogadores_criados` > 0, jogos por temporada, e a tela de estatísticas
         mostrando 2025-26
- [x] **Step 2:** documentar a janela: ~1.230 jogos × ~6 chamadas ≈ 7.400 requisições,
      ~13 min no limite de 600 req/min do GOAT
- [x] **Step 3:** documentar o desligamento: apagar a chave desliga a ingestão; o que já
      foi gravado permanece
- [x] **Step 4:** atualizar `docs/demonstracao.md` — com dado real no ar, a tabela "Diga
      que é demonstração" encolhe, e isso precisa estar escrito antes da apresentação
- [x] **Step 5:** commit `"Runbook do retroativo: a ordem em que nada se atropela"`

### T9: verificação de ponta a ponta

- [x] `npm run typecheck && npm run lint && npm run boundaries && npm test` limpos
- [x] `git diff --stat` **não** toca `src/modules/motor/**` nem `config/ruleset.v1.yaml`
      além do campo de T3
- [x] Teste de relógio: a suíte roda com data fixada em 02/10/2026 e em 04/11/2026, e as
      telas mudam de temporada sozinhas entre as duas
- [x] Rodar o backfill contra a BDL real em janela curta (`--from`/`--to` de 3 dias) antes
      de varrer a temporada inteira

---

## O que este plano NÃO faz

| Item | Por quê |
| --- | --- |
| Apito retroativo / Lista Secreta histórica | decisão 1 do parceiro |
| Média puxando da temporada anterior | decisão 2 — a P1 fica como está |
| Seletor de temporada na UI | decisão 3 — uma temporada por vez |
| Reimportar a lista de níveis do CJ | é curadoria humana, pré-requisito da **virada**, não do hiato (spec §7.1) |
| Plano Pro da Vercel / crons sub-diários | pré-requisito da virada (spec §7.2) |

## Riscos que este plano vigia

- **O defeito que não dá erro.** Backfill perfeito + tela vazia é o desfecho mais
  provável desta entrega. T6 Step 1 existe só para tornar esse desfecho impossível.
- **Ressemeadura por cima.** `DEMO_AUTOSSEMEADURA` esquecida em `true` reescreve dado
  inventado sobre dado real, silenciosamente. É o passo 1 do runbook por isso.
- **Amostra de um jogo em novembro.** Consequência aceita da decisão 2; a pergunta ao CJ
  está na spec §10.1 e não bloqueia nada aqui.

---

## Desvios do plano (registrados durante a execução)

**1 · `/resultados` não se resolve sozinho no hiato, e isso é consequência da
decisão 1, não um defeito.** `ultimaRodadaConferida` procura a última rodada
**com apito** conferido. Sem apito retroativo, ela devolve `null` no hiato e a
tela cai no dia de hoje — vazio. A T6 Step 5 confirmou por teste que a função
atravessa a virada de temporada sozinha (é o que a spec afirmava); o vazio do
hiato é coberto pelos estados da T7. Nenhuma edição foi necessária.

**2 · A lateral não podia consultar o banco.** A primeira implementação da T6
pôs `temporadaParaExibir` em `lateral/montar.tsx`. A lateral é montada em TODA
tela de aba: isso adicionou uma consulta agregada por abertura de página e
quebrou sete arquivos de teste que mockam a leitura da lateral, não o banco. A
resolução foi movida para `lerLateralCacheada`, que já é o ponto de acesso ao
banco e já está atrás do cache de uma hora. Daí nasceu
`temporadaParaExibirNoCalendario`, que recebe o piso solto em vez do ruleset —
os argumentos de `unstable_cache` são a chave do cache.

**3 · `garantirJogadores` não cria quem tem nome coincidente.** Descoberto ao
ler a função reusada pela T2: quando o nome do jogador já existe no cadastro
canônico, ele vira uma linha em `conflitos_identidade_jogador` para curadoria
humana — nome nunca autoriza unir namespaces de provedores diferentes. A
partida daquele jogador continua sendo rejeitada até alguém decidir. O
comportamento está certo e não foi alterado; **essa tabela não tem tela**, então
o runbook ganhou a consulta SQL para observá-la (passo 6.3).
