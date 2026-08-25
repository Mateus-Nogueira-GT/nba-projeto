# Spec 08 — Fechamento do v0: plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Estado:** etapas 0–4 executadas · 23/08/2026 — T0–T15 implementados e
verificados (453 testes, typecheck, lint, fronteiras e build limpos). Restam a
Etapa 5 (T16–T20, exige operador humano: conta Vercel, credenciais, aparelhos)
e as tarefas bloqueadas por gate (G1–G9)
**Depende de:** specs [05](05-feed-fire-live.md), [06](06-odds-e-blowout.md) e
[07](07-backtest-e-alerta.md) — este documento não as substitui: **sequencia** as
fatias delas mais a operação de deploy, separando o executável hoje do bloqueado
por decisão externa.
**Destrava:** tudo o que resta do v0 que está do nosso lado.

**Goal:** entregar a tela do Fire Live, o card completo (odds + blowout), o
alerta de dado parado, o backtest de rulesets e um ambiente Preview homologado —
sem tocar em nenhuma decisão que pertence ao cliente ou ao CJ.

**Arquitetura:** cada fatia respeita as camadas existentes: regra nova de número
vai para o ruleset, cálculo vai para o motor (puro), orquestração vai para a
entrega, tela lê snapshot materializado. Nada aqui muda estrutura — só preenche
o que as specs já desenharam.

**Stack:** Next.js 16 App Router · Drizzle + Neon · Vercel (Cron, Workflow,
Queues) · Vitest · dependency-cruiser.

---

## Restrições globais

Copiadas do `CLAUDE.md` — valem para TODAS as tarefas deste plano:

1. **Nenhuma regra de estratégia no código.** Número mágico → `config/ruleset.v1.yaml`.
2. **O motor é puro.** `src/modules/motor/**` não importa I/O, rede, banco, relógio.
3. **Nunca inventar regra que o cliente não definiu.** Área não coberta → parar e perguntar.
4. **Somente leitura de odds** (ADR-0004). Sem envio de aposta, credencial de casa, movimentação de dinheiro.
5. **Idempotência no apito** — `UNIQUE (jogo_id, jogador_id, atributo, estrategia, linha)`.
6. **Fire Live é só 1º quarto.** Nada além, em nenhuma hipótese.
7. **O % é nota de confiança, nunca "probabilidade"** — em código, teste e UI.
8. Domínio em português, infraestrutura em inglês. `nível do jogador` ≠ `nível do apito`.
9. Toda tela informa o horário da última atualização.
10. Verificação padrão de toda tarefa: `npm run typecheck && npm run lint && npm run boundaries && npm test` limpos em Node 24.

---

## Gates — o que trava o quê

Cada gate é uma pergunta já registrada nas specs. Tarefa listada aqui **não
começa** antes da resposta; todas as demais tarefas não dependem de gate nenhum.

| Gate | Pergunta (dono) | Trava |
| --- | --- | --- |
| G1 | Excluir jogadores: por dispositivo ou por conta? (CJ) | T10b |
| G2 | Apito sai da tela quando o 1Q acaba? (CJ) | texto/estado do card em T8 — proposta enviada: mantém até o fim do jogo, marcado "encerrado" |
| G3 | Ordenação do Fire Live? (CJ) | ordenação final em T8 — proposta enviada: mais recente primeiro |
| G4 | Quais casas de odds, com qual contrato? (cliente) | coleta real de odds (pós-T12) |
| G5 | A odd exibida é do over? (CJ) | idem G4 e card |
| G6 | Cadência de coleta de odds? (cliente, custo de contrato) | cron de odds |
| G7 | Onde fica o texto do blowout — "introdução das estratégias" não é tela que exista (cliente) | texto editorial de T1 (a função pura não é travada) |
| G8 | Canal do alerta que acorda alguém? (cliente) | adapter real de T5 (porta + memória não são travados) |
| G9 | Decisões comerciais da Spec 04 + smoke MP aprovado | rollout de produção (fora deste plano) |

T8 com G2/G3: a tela é construída com as **propostas das specs** claramente
marcadas no código (`// PROPOSTA aguardando CJ — spec 05, pergunta N`) e o gate
vale para o rollout público, não para o desenvolvimento — sem alguma ordenação a
tela não compila. Se o CJ responder diferente, é troca localizada.

---

## Ordem das etapas

| Etapa | O quê | Por que nesta ordem |
| --- | --- | --- |
| 0 | Node pinado | `boundaries` está cego em Node 20 — guarda mais importante do projeto |
| 1 | Puros + alerta (06·F1–F2, 07·F1–F3) | zero dependência externa; protege o que já existe |
| 2 | Fire Live (spec 05 inteira) | o push precisa de destino — maior buraco de produto |
| 3 | Odds sem contrato (06·F3–F4) | porta, fake e curadoria não dependem de casa contratada |
| 4 | Backtest (07·F4–F6) | ferramenta construível com fixture; histórico real vem depois |
| 5 | Operação: Preview homologado | precisa das etapas 1–2 para o smoke fazer sentido |

---

# Etapa 0 · Ferramentas

### T0: Pinar Node 24

**Files:** Create: `.nvmrc` · Modify: `package.json`

- [x] **Step 1:** criar `.nvmrc` com conteúdo `24` e adicionar ao `package.json`, depois de `"private": true`:

```json
"engines": { "node": ">=22" },
```

- [x] **Step 2:** `nvm install 24 && nvm use 24 && npm run boundaries` → esperado: `✔ no dependency violations`
- [x] **Step 3:** `git add .nvmrc package.json && git commit -m "Pina Node 24: a guarda de fronteira não roda em Node 20"`

---

# Etapa 1 · Funções puras e alerta de dado parado

### T1: Blowout (motor puro) — spec 06, fatia 1

**Files:**
- Create: `src/modules/motor/avisos/blowout.ts`
- Modify: `src/modules/motor/index.ts` (reexportar)
- Test: `src/modules/motor/__tests__/blowout.test.ts`

**Interfaces:**
- Consumes: `Ruleset` (já valida `avisos.blowout` em `ruleset/schema.ts:139`)
- Produces: `emBlowout(jogo, ruleset): boolean` — consumida futuramente pelo texto editorial (G7)

- [x] **Step 1 — teste que falha:**

```ts
import { describe, expect, it } from 'vitest'
import { emBlowout } from '../avisos/blowout'
import { rulesetDeTeste } from './ancoras.test' // mesmo helper da suíte âncora

describe('aviso de blowout', () => {
  const jogo4Q = (casa: number, visitante: number) => ({
    quartoAtual: 4, placarCasa: casa, placarVisitante: visitante,
  })
  it('25 de diferença no 4º quarto aciona', () =>
    expect(emBlowout(jogo4Q(110, 85), rulesetDeTeste())).toBe(true))
  it('24 de diferença não aciona', () =>
    expect(emBlowout(jogo4Q(110, 86), rulesetDeTeste())).toBe(false))
  it('25 de diferença no 3º quarto não aciona', () =>
    expect(emBlowout({ quartoAtual: 3, placarCasa: 110, placarVisitante: 85 }, rulesetDeTeste())).toBe(false))
  it('placar desconhecido não aciona', () =>
    expect(emBlowout({ quartoAtual: 4, placarCasa: null, placarVisitante: null }, rulesetDeTeste())).toBe(false))
  it('trocar o limiar no ruleset muda o resultado sem mudar código', () => {
    const r = rulesetDeTeste()
    r.avisos.blowout.diferenca_pontos = 20
    expect(emBlowout(jogo4Q(110, 88), r)).toBe(true)
  })
})
```

(Se `rulesetDeTeste` não estiver exportado da suíte âncora, extraí-lo para
`__tests__/ajuda-ruleset.ts` e importar nos dois lugares.)

- [x] **Step 2:** `npx vitest run src/modules/motor/__tests__/blowout.test.ts` → FAIL (módulo não existe)
- [x] **Step 3 — implementação:**

```ts
import type { Ruleset } from '../ruleset/schema'

/** Jogo decidido: titulares tendem a sair. Quarto e diferença saem do ruleset. */
export function emBlowout(
  jogo: { quartoAtual: number | null; placarCasa: number | null; placarVisitante: number | null },
  ruleset: Ruleset,
): boolean {
  const { quarto, diferenca_pontos } = ruleset.avisos.blowout
  if (jogo.quartoAtual !== quarto) return false
  if (jogo.placarCasa === null || jogo.placarVisitante === null) return false
  return Math.abs(jogo.placarCasa - jogo.placarVisitante) >= diferenca_pontos
}
```

- [x] **Step 4:** teste passa · `npm run boundaries` limpo
- [x] **Step 5:** commit `"Blowout: função pura sobre o ruleset homologado (spec 06, fatia 1)"`

**Fora desta tarefa:** o texto editorial e onde ele aparece — G7.

### T2: Agregação de odds (motor puro) — spec 06, fatia 2

**Files:**
- Create: `src/modules/motor/odds/agregar.ts`
- Modify: `src/modules/motor/index.ts`
- Test: `src/modules/motor/__tests__/odds.test.ts`

**Interfaces:**
- Produces (contrato da spec 06, consumido pela coleta pós-G4 e pelo backtest):

```ts
export type OrigemOdds = 'CASAS' | 'TABELA_ESTATICA'
export type FaixaOdds = { min: number; max: number; mediana: number; qtdCasas: number; origem: OrigemOdds }

export function agregar(
  cotacoes: { casa: string; oddOver: number | null }[],
  nivel: Nivel,
  linha: number,
  ruleset: Ruleset,
): FaixaOdds | null
```

- [x] **Step 1 — testes que falham** (mediana com 2, 3 e 5 casas; outlier não desloca a mediana; abaixo de `casas_minimas` cai na `tabela_estatica[nivel][linha]` com origem `TABELA_ESTATICA`; linha sem entrada na tabela → `null`; `casas_minimas: 3` no ruleset muda o comportamento do caso de 2 casas — sem mudar código; cotação com `oddOver: null` não conta como casa):

```ts
it('mediana de 3 casas resiste a outlier', () => {
  const faixa = agregar(
    [{ casa: 'a', oddOver: 1.5 }, { casa: 'b', oddOver: 1.55 }, { casa: 'c', oddOver: 9.0 }],
    'MVP', 25, rulesetDeTeste(),
  )
  expect(faixa).toMatchObject({ mediana: 1.55, min: 1.5, max: 9.0, qtdCasas: 3, origem: 'CASAS' })
})
it('uma casa só cai para a tabela estática', () => {
  const faixa = agregar([{ casa: 'a', oddOver: 1.5 }], 'MVP', 25, rulesetDeTeste())
  expect(faixa).toMatchObject({ origem: 'TABELA_ESTATICA', min: 1.3, max: 1.7 })
})
```

- [x] **Step 2:** rodar → FAIL
- [x] **Step 3:** implementar — filtrar `oddOver !== null`; se `qtdCasas >= ruleset.odds.casas_minimas`, ordenar e tirar mediana (par: média dos centrais), `min`/`max` dos valores; senão ler `ruleset.odds.tabela_estatica[nivel]?.[linha]` (par `[min, max]`, `mediana = (min + max) / 2`, `qtdCasas: 0`) ou `null` se a linha não existir
- [x] **Step 4:** testes passam · boundaries limpo
- [x] **Step 5:** commit `"Agregação de odds: mediana, faixa e fallback, tudo do ruleset (spec 06, fatia 2)"`

### T3: Frescor no ruleset + janela de jogo — spec 07, fatia 1

**Files:**
- Modify: `config/ruleset.v1.yaml`, `src/modules/motor/ruleset/schema.ts`,
  `src/modules/ingestao/health/heartbeat.ts` (LIMITES_PADRAO vira default derivado do ruleset no chamador; a função pura mantém o parâmetro `limites`)
- Create: `src/modules/entrega/observabilidade/janela.ts`
- Test: `src/modules/entrega/__tests__/observabilidade.test.ts`

**Interfaces:**
- Produces: `emJanelaDeJogo(db: Db, agora: Date, antecedenciaMinutos: number): Promise<boolean>`
- Ruleset ganha bloco **operacional** (mesma natureza de `fire_live.observacao` — não é regra de estratégia):

```yaml
avisos:
  dado_parado:
    fora_de_jogo_minutos: 30      # valores atuais de LIMITES_PADRAO,
    em_janela_segundos: 90        # movidos para cá pela regra 1
    janela_antecedencia_minutos: 30
    realerta_minutos: 30
```

- [x] **Step 1:** teste de schema: ruleset atual valida e expõe os quatro números
- [x] **Step 2:** teste da janela com PGlite (padrão de `ajuda-banco.ts`): jogo `AO_VIVO` → true; jogo `AGENDADO` para daqui 20 min → true; para daqui 2 h → false; nenhum jogo → false; jogo `ENCERRADO` → false
- [x] **Step 3:** implementar — consulta em `jogos` por `status = 'AO_VIVO'` OU (`status = 'AGENDADO'` E `dataHoraUtc` entre `agora` e `agora + antecedencia`), usando o índice `jogos_data_idx`
- [x] **Step 4:** testes passam
- [x] **Step 5:** commit `"Frescor sai do código para o ruleset; janela de jogo consultável (spec 07, fatia 1)"`

### T4: Cron de saúde com realerta — spec 07, fatia 2

**Files:**
- Create: `src/app/api/cron/saude/route.ts`, `src/modules/entrega/observabilidade/alerta.ts`
- Modify: `vercel.ts` (cron `/api/cron/saude`, `*/5 * * * *`)
- Test: ampliar `src/modules/entrega/__tests__/observabilidade.test.ts`

**Interfaces:**
- Consumes: `avaliarFrescor(linhas, agora, emJanelaDeJogo, limites)` de `heartbeat.ts:66` · `emJanelaDeJogo` de T3 · `executarCronProtegido` de `cron/guarda.ts` · `logFalhas` de `schema/observabilidade.ts`
- Produces: `avaliarESinalizar(db, agora, ruleset, notificador): Promise<AlertaEmitido[]>`

- [x] **Step 1 — testes que falham:** provedor com `dadoMaisRecenteEm` de 1 h atrás fora de janela → 1 linha em `log_falhas` (`origem: 'alerta-dado-parado'`, severidade alta, contexto com provedor e atraso); segunda execução 5 min depois → **0 linhas novas** (realerta de 30 min); mesma situação **em janela de jogo** com dado de 2 min → alerta (limite 90 s); dado fresco → nada
- [x] **Step 2:** rodar → FAIL
- [x] **Step 3:** implementar — ler `saude_provedor`, chamar `emJanelaDeJogo` e `avaliarFrescor` com os limites do ruleset; antes de gravar, buscar em `log_falhas` o último alerta do mesmo provedor (`origem = 'alerta-dado-parado'` e `contextoJson->>'provedor'`) e suprimir se `ocorridoEm > agora - realerta_minutos`; despachar pelo notificador (T5); rota embrulha em `executarCronProtegido`
- [x] **Step 4:** testes passam
- [x] **Step 5:** commit `"Alerta de dado parado: cron de saúde com supressão de realerta (spec 07, fatia 2)"`

### T5: Porta de notificação operacional — spec 07, fatia 3 (parcial)

**Files:**
- Create: `src/modules/entrega/observabilidade/notificador.ts` (porta + `NotificadorMemoria` + `NotificadorLog` como default de produção até G8)

**Interfaces:**

```ts
export type AvisoOperacional = { severidade: 'ALTA' | 'MEDIA'; titulo: string; corpo: string }
export interface NotificadorOperacional { enviar(aviso: AvisoOperacional): Promise<void> }
```

- [x] **Step 1:** teste — `NotificadorMemoria` acumula avisos; T4 conta por ele
- [x] **Step 2:** implementar; `NotificadorLog` grava `console.error` estruturado (JSON, sem segredo)
- [x] **Step 3:** commit `"Porta de notificação operacional; canal real aguarda decisão do cliente (G8)"`

**Fora:** o adapter real (e-mail/Slack/WhatsApp) — G8.

---

# Etapa 2 · Fire Live na tela (spec 05 inteira)

### T6: Snapshot por jogo — spec 05, fatia 1

**Files:**
- Modify: `src/modules/dominio/db/schema/motor.ts:83-94`
- Create: migration via `npm run db:generate` (gera o down junto)
- Test: ampliar `src/modules/dominio/__tests__/persistencia.test.ts`

- [x] **Step 1 — testes que falham:** duas gravações `FIRE_LIVE` do mesmo dia com `jogoId` distintos coexistem; mesma `(data, estrategia, jogoId)` conflita (upsert); `LISTA_SECRETA` com `jogoId` NULL continua uma linha por dia — dois inserts NULL colidem (`nullsNotDistinct`)
- [x] **Step 2:** alterar o schema:

```ts
jogoId: uuid('jogo_id').references(() => jogos.id, { onDelete: 'cascade' }),
// ...
(t) => [
  unique('feed_snapshot_unico').on(t.dataReferencia, t.estrategia, t.jogoId).nullsNotDistinct(),
],
```

- [x] **Step 3:** `npm run db:generate` · conferir o SQL gerado e o down
- [x] **Step 4:** testes passam (PGlite aplica as migrations)
- [x] **Step 5:** commit `"feed_snapshot por jogo: workflows simultâneos não disputam a mesma linha (spec 05, fatia 1)"`

### T7: Materialização no ciclo — spec 05, fatia 2

**Files:**
- Create: `src/modules/entrega/fire-live/feed.ts`
- Modify: `src/modules/entrega/fire-live/ciclo.ts` (chamar ao fim de `executarCiclo`, depois do outbox)
- Test: ampliar `src/modules/entrega/__tests__/fire-live.test.ts` (a suíte já tem replay gravado)

**Interfaces:**
- Produces (consumido por T8):

```ts
export type ItemFireLive = ItemFeed & {
  jogoId: string
  adversarioSigla: string
  quartoAtual: number | null
  encerrado: boolean            // 1Q acabou — exibição conforme G2 (proposta: fica até o fim do jogo)
  valorNoQuarto: number         // progresso contra alvo1Q
}
export async function materializarFeedFireLive(db, jogoId, itens, geradoEm): Promise<void>
```

- [x] **Step 1 — testes que falham:** replay da suíte produz snapshot com os apitos do jogo; replay idêntico **não muda o `hash`** (mesma proteção da Lista Secreta); dois jogos gravam linhas separadas
- [x] **Step 2:** implementar — montar `ItemFireLive[]` dos apitos já em mãos no ciclo (sem segunda leitura), serializar como `ConteudoFeed`, upsert por `(dataReferencia, 'FIRE_LIVE', jogoId)` pulando escrita quando o hash não mudou
- [x] **Step 3:** testes passam · `npm run boundaries` (a regra `tela-nao-chama-o-motor` segue de pé — quem materializa é o ciclo, que já executa o motor)
- [x] **Step 4:** commit `"Fire Live materializa feed por jogo no próprio ciclo (spec 05, fatia 2)"`

### T8: Tela /fire-live — spec 05, fatia 3

**Files:**
- Create: `src/app/(app)/fire-live/page.tsx`, `src/modules/entrega/fire-live/leitura.ts`
- Test: ampliar `src/modules/entrega/__tests__/fire-live.test.ts` (leitura), teste de estados vazios

**Interfaces:**
- Consumes: snapshots de T7 · `CardEntrada` (já exibe alvo, modo fire e OPD) · `UltimaAtualizacao` · guarda de acesso igual à de `/` (`sessaoAtual` + `avaliarAcesso`)
- Produces: `lerFeedFireLive(db, dataReferencia): Promise<{ itens: ItemFireLive[]; geradoEm: string | null; estadoVazio: EstadoVazio | null }>` com `type EstadoVazio = 'SEM_JOGO_HOJE' | 'AGUARDANDO_PRIMEIRO_JOGO' | 'NENHUM_EM_1Q' | 'SEM_APITO_AINDA'`

- [x] **Step 1 — testes que falham:** cada um dos quatro estados vazios sai da combinação certa de `jogos` (nenhum hoje / primeiro às 21h30 / em andamento sem 1Q / em 1Q sem apito); com snapshots, itens de N jogos aparecem juntos
- [x] **Step 2:** implementar leitura (junta as N linhas do dia) e página — server component `force-dynamic`, mesmo padrão visual de `/`; cada estado vazio com texto próprio que **explica o motivo** (é a experiência dominante da tela — spec 05, riscos); rodapé `UltimaAtualizacao`
- [x] **Step 3:** ordenação: mais recente primeiro, com `// PROPOSTA aguardando CJ — spec 05, pergunta 3`; item `encerrado` permanece com selo "1Q encerrado", com `// PROPOSTA aguardando CJ — spec 05, pergunta 2`
- [x] **Step 4:** testes passam · boundaries limpo (a tela não importa o motor — só tipos)
- [x] **Step 5:** commit `"Tela /fire-live: quatro estados vazios explicados e cards ao vivo (spec 05, fatia 3)"`

### T9: Push abre o jogo certo — spec 05, fatia 5

**Files:**
- Modify: `public/sw.js` (função `abrirNotificacao`, handler em `sw.js:264`; incrementar `VERSAO_CACHE`)
- Test: `src/components/pwa/__tests__/service-worker.test.ts`

- [x] **Step 1 — teste que falha:** notificação com `dados.jogoId` → navega para `/fire-live?jogo=<id>`; sem `jogoId` → `/fire-live`
- [x] **Step 2:** implementar em `abrirNotificacao`; incrementar `VERSAO_CACHE` (runbook do PWA: nunca `skipWaiting` no install)
- [x] **Step 3:** `npm run test:spec02 && npm run test:spec03` limpos
- [x] **Step 4:** commit `"Toque no push do Fire Live abre a tela no jogo certo (spec 05, fatia 5)"`

### T10a: Filtros por time e por jogo — spec 05, fatia 4 (parte livre)

**Files:** Modify: `src/app/(app)/fire-live/page.tsx`, `src/modules/entrega/fire-live/leitura.ts`

- [x] **Step 1 — testes:** `?time=SIGLA` recorta; `?jogo=<id>` recorta; combinados se compõem; valor desconhecido → lista vazia com estado explicado (não erro)
- [x] **Step 2:** implementar como recorte de leitura (searchParams), links de filtro no padrão dos chips de `/`
- [x] **Step 3:** commit `"Filtros por time e por jogo no Fire Live (spec 05, fatia 4a)"`

### T10b: Excluir jogadores — **BLOQUEADA por G1**

Definida na spec 05 (localStorage vs tabela). Quando o CJ responder: implementar
conforme a resposta, com teste "jogador excluído não reaparece após recarregar".

---

# Etapa 3 · Odds sem contrato

### T11: Porta de casa de aposta + fake — spec 06, fatia 3

**Files:**
- Create: `src/modules/ingestao/odds/porta.ts`, `src/modules/ingestao/odds/fake.ts`,
  `src/modules/ingestao/odds/__fixtures__/cotacoes.json`
- Test: `src/modules/ingestao/__tests__/odds.test.ts`

**Interfaces (contrato literal da spec 06):**

```ts
export type CotacaoExterna = {
  jogadorNomeNaCasa: string
  nomeMercadoNaCasa: string
  linha: number
  oddOver: number | null
  oddUnder: number | null
}
export interface CasaDeAposta {
  readonly nome: string
  cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]>
}
```

- [x] **Step 1:** teste — fake devolve as cotações da fixture; nenhum campo com nome de casa atravessa para o domínio
- [x] **Step 2:** implementar; fixture com dois "provedores" fake e grafias divergentes do mesmo jogador (matéria-prima do T12)
- [x] **Step 3:** commit `"Porta anticorrupção de casas de aposta + adapter fake (spec 06, fatia 3)"`

### T12: Reconciliação e curadoria — spec 06, fatia 4

**Files:**
- Create: `src/modules/ingestao/odds/reconciliar.ts`, `src/app/(admin)/admin/mercados/page.tsx`, `.../acoes.ts`
- Test: ampliar `src/modules/ingestao/__tests__/odds.test.ts`

**Interfaces:**
- Consumes: `pontuar()` de `dominio/texto.ts:57` (mesma régua da lista do CJ e da busca) · tabela `mapa_mercados` · guarda de admin (o padrão que a auditoria corrigiu em `/admin/mapeamento`)
- Produces: `sugerirVinculos(cotacoes, jogadores): Sugestao[]` — **nunca** vínculo automático; confirmação humana grava em `mapa_mercados`

- [x] **Step 1:** testes — nome exato pontua 1 e ainda assim vira sugestão (não vínculo); mercado desconhecido entra na fila de curadoria; vínculo confirmado é reutilizado nas próximas cargas
- [x] **Step 2:** implementar serviço + tela (mesmo desenho de `/admin/mapeamento`, **com a guarda**)
- [x] **Step 3:** commit `"Curadoria de mercados e nomes de casas: sugestão automática, vínculo humano (spec 06, fatia 4)"`

**Depois desta tarefa, odds para até G4/G5/G6** (coleta real, cron e card).
O teste de varredura de credenciais já existente cobre o ADR-0004; mantê-lo verde.

---

# Etapa 4 · Backtest (spec 07, parte A)

### T13: Executor — spec 07, fatia 4

**Files:**
- Create: `src/modules/entrega/backtest/executar.ts`
- Test: `src/modules/entrega/__tests__/backtest.test.ts` (temporada de fixture via PGlite)

**Interfaces (contrato literal da spec 07):**

```ts
export type PeriodoBacktest = { de: string; ate: string }
export type ResultadoBacktest = {
  ruleset: string
  periodo: PeriodoBacktest
  apitos: number
  porNivel: Record<Nivel, number>
  porMetodo: Record<Metodo, number>
  acertos: number
  indeterminados: number
}
export async function executarBacktest(db: Db, ruleset: Ruleset, periodo: PeriodoBacktest): Promise<ResultadoBacktest>
```

- [x] **Step 1 — testes que falham:** mesma entrada duas vezes → resultado **idêntico**; delta do MVP 6→7 no candidato muda a contagem; **zero linhas novas em `apitos`** após a execução (a distinção mais importante da spec); jogo sem box score → `indeterminados`, nunca erro; nenhum teste importa mock do motor
- [x] **Step 2:** implementar — laço por data do período: `montarFatos` (o mesmo do job diário) + `avaliar` + classificação de acerto contra `estatisticas_jogo`; nada gravado
- [x] **Step 3:** se o laço doer em período longo: carregar histórico uma vez e recortar por data em memória (seguro por construção — motor puro); medir antes
- [x] **Step 4:** commit `"Backtest: reexecução do motor sobre o histórico, sem gravar nada (spec 07, fatia 4)"`

### T14: Comparação — spec 07, fatia 5

**Files:** Create: `src/modules/entrega/backtest/comparar.ts` · Test: ampliar `backtest.test.ts`

- [x] **Step 1:** teste — dois rulesets diferindo só no delta do MVP → `Diferenca` com apitos a mais/a menos, jogadores que entraram/saíram, variação de acertos, e o tamanho da amostra junto do resultado (risco declarado da spec: número sem amostra tem cara de conclusão)
- [x] **Step 2:** implementar `comparar(a: ResultadoBacktest, b: ResultadoBacktest): Diferenca`
- [x] **Step 3:** commit `"Comparação de rulesets no backtest (spec 07, fatia 5)"`

### T15: Painel + candidatos + CSV — spec 07, fatia 6

**Files:**
- Create: `src/app/(admin)/admin/backtest/page.tsx`, `.../acoes.ts`, `src/modules/entrega/backtest/csv.ts`
- Test: ampliar `backtest.test.ts` (CSV) + teste de guarda da rota

- [x] **Step 1:** testes — CSV escapa vírgula/aspas e traz cabeçalho em português; ruleset candidato inválido é recusado por `carregarRuleset` na gravação; a página exige ADMIN
- [x] **Step 2:** implementar — tabela `rulesets` guarda **candidatos** (`status: provisorio`; o ativo continua no disco/git, ADR-0002); tela escolhe período + dois rulesets e mostra a `Diferenca`; exportar CSV; rodapé fixo: *"medição de comportamento de regra sobre dado histórico — não é sugestão de aposta nem promessa de retorno"* (P12)
- [x] **Step 3:** commit `"Painel de backtest: candidatos versionados, comparação e CSV (spec 07, fatia 6)"`

---

# Etapa 5 · Operação: Preview homologado

Tarefas de infraestrutura — sem TDD, com verificação explícita por passo.
Runbooks correspondentes em `docs/runbooks/`.

### T16: Provisionar

- [ ] `vercel login && vercel link` (projeto novo `ia-da-nba`) → existe `.vercel/`
- [ ] Neon via Marketplace, conectado ao projeto → `DATABASE_URL` (endpoint **pooled**) nas env vars
- [ ] `vercel env pull .env.local` → arquivo existe e nunca entra no git
- [ ] `npm run db:migrate` → 12 migrations aplicadas; conferir tabelas no `db:studio`
- [ ] Cadastrar em Preview: `CRON_SECRET` (openssl rand -hex 32) · trio VAPID (`npx web-push generate-vapid-keys`) · e as travas exatamente assim: `PUSH_ENABLED=false`, `NBA_INGESTAO_HABILITADA=false`, `MERCADOPAGO_CHECKOUT_ENABLED=false`, `CADASTRO_PUBLICO_HABILITADO=false`, `MERCADOPAGO_SANDBOX=true`, `ESTATISTICAS_EXIGEM_DIREITO=false`

### T17: Deploy Preview + smoke fail-closed

- [ ] `vercel deploy` → URL de preview
- [ ] Log do build menciona os triggers `push-eventos` e `push-entregas` aceitos
- [ ] `curl -s -o /dev/null -w "%{http_code}" <url>/api/cron/ao-vivo` → **401** (se 200, parar tudo: cron aberto)
- [ ] `/entrar`, `/estatisticas`, `/offline`, `/fire-live` abrem sem 500

### T18: Primeiro ADMIN

- [ ] Seguir `docs/runbooks/bootstrap-admin.md` (arquivo `.env.bootstrap.local`, `chmod 600`, apagar as variáveis depois) → login em `/admin/entrar` funciona; reexecução termina sem alterar nada

### T19: Homologação Mercado Pago (sandbox)

- [ ] Credenciais **de teste** + webhook com os três tópicos apontando para `/api/webhook/mercadopago`
- [ ] Seguir a "Ordem de homologação" 1–9 do runbook `cobranca-e-acesso.md`, coletando as "Evidências mínimas" listadas lá
- [ ] Nada disso liga checkout: G9 continua fechado

### T20: Smoke de push e PWA em aparelho real

- [ ] Conta na `PUSH_INTERNAL_ALLOWLIST`; ativar alertas por gesto explícito em preview HTTPS
- [ ] Evento Fire Live controlado → push chega; **toque abre `/fire-live?jogo=<id>` (T9)**
- [ ] Smoke de segurança do runbook do PWA: nenhum HTML autenticado no Cache Storage; `/offline` correta
- [ ] Testar foreground, background e app encerrado em Android e iPhone

---

## Fica explicitamente de fora (e por quê)

| Item | Motivo |
| --- | --- |
| Coleta real de odds, cron e card com odd | G4, G5, G6 |
| Adapter real do alerta | G8 |
| Excluir jogadores | G1 |
| Texto do blowout na UI | G7 |
| Rebotes e assistências | é INSERT da lista do CJ, não código |
| Green fora do 1º quarto | pergunta aberta com o CJ desde a spec 02 |
| Rollout de produção, cadastro público, push público | G9 — runbook de cobrança manda: webhook antes de checkout, piloto antes de público |

## Riscos herdados que este plano vigia

- **Tela vazia é a experiência dominante do Fire Live** — T8 gasta o esmero em texto, não em código.
- **Backtest sobre duas semanas dá número com cara de conclusão** — T14 põe a amostra ao lado do resultado.
- **Alarme falso mata o alerta verdadeiro** — T3/T4 calibram janela e realerta antes de qualquer canal barulhento.
- **Escrita a cada 20 s por jogo** — o hash de T7 corta regravação; medir antes de otimizar.
