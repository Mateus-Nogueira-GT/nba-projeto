# Motor NIP na temporada anterior — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rodar o motor NIP, sem mudança, sobre a temporada 2025-26 (time real da época, nível do
CJ) e mostrar o resultado em Resultados, Lista Secreta e Estatísticas com um seletor de temporada.

**Architecture:** uma montagem de fatos nova (`dominio/retroativo`) produz o mesmo `Fatos` que o
motor já consome, trocando só a origem do time, da hierarquia, da média e do desfalque. Um executor
de operação (`entrega/retroativo`) grava o resultado em tabelas separadas (`apitos_retroativos`,
`feed_retroativo`, `greens_retroativos`), que só as três telas leem, e só quando a URL pede uma
temporada anterior. A lista do CJ ganha backup e restauração para sobreviver à limpeza da demo.

**Tech Stack:** Next.js 16.3.6 (App Router), TypeScript, Drizzle + Postgres (Neon), Vitest +
PGlite (`bancoDeTeste()`), vite-node para scripts, dependency-cruiser.

**Spec:** [`docs/superpowers/specs/2026-09-25-motor-temporada-anterior-design.md`](../specs/2026-09-25-motor-temporada-anterior-design.md)

## Global Constraints

- `src/modules/motor/**` **não muda** (nem uma linha). Os 15 testes-âncora continuam verdes sem edição.
- `config/ruleset.v1.yaml` **não muda**. Nenhum número de estratégia no código (regra 1 do CLAUDE.md).
- `src/modules/dominio/retroativo/**` e `src/modules/entrega/retroativo/**` **nunca** importam
  `src/modules/entrega/push/**`, `src/modules/entrega/fila/**` nem gravam em `apitos`, `greens` ou
  `feed_snapshot`.
- Temporada anterior = **qualquer temporada com dado que não seja a do calendário** (`temporadaDe(agora)`).
  Nada de `'2025-26'` escrito no código de produção; só em testes.
- Em 2025-26: time = o do último jogo do jogador até o dia; hierarquia = nível do jogador, depois
  `posicaoHierarquia` da lista do CJ, **por atributo**; média = jogos até D−1; desfalque = jogador da
  hierarquia sem participação no jogo (`entrouEmQuadra` falso ou sem linha).
- Plano grátis vê as temporadas anteriores inteiras nas três telas; em 2026-27 os portões de hoje não mudam.
- "Confiança", nunca "probabilidade". Texto: "a metodologia NIP aplicada à temporada passada".
- Idempotência: `apitos_retroativos` tem `UNIQUE (jogo_id, jogador_id, atributo, estrategia, linha) NULLS NOT DISTINCT`.
- Commits: um WIP por tarefa (`wip(retroativo): Task N — …`), squash num commit único na Task 12
  (preferência do parceiro). Nunca `git add -A`. Nunca stage de `referencias/`, `scripts/_*`, `.superpowers/`.
- Suíte completa só em lotes de 12 arquivos; `df -h /System/Volumes/Data` antes (parar abaixo de 5 GB).
- Sem migração em produção, sem deploy e sem comando contra o Neon durante a execução do plano.

## Review Focus

1. **Olhar o futuro:** um jogo do dia D com o jogador tendo jogado em D+1 — a média e o histórico
   não podem conter D nem depois (Task 4, teste "sem futuro").
2. **Troca no meio da temporada:** jogador que mudou de time em janeiro conta para o time antigo
   em dezembro e para o novo em fevereiro (Task 4).
3. **Temporada na URL inválida ou forjada** (`?temporada=abc`, `?temporada=2019-20` sem dado): cai
   na temporada exibida, nunca erro nem tela vazia (Task 8).
4. **Grátis na temporada atual continua bloqueado** depois que o carregador aprendeu a abrir a
   anterior — `?temporada=` apontando para a atual não pode abrir a Lista paga (Task 9).
5. **Reexecução depois de trocar a lista do CJ:** a temporada é regravada, não somada (Task 6).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/dominio/db/schema/retroativo.ts` (novo) | tabelas `apitos_retroativos`, `greens_retroativos`, `feed_retroativo` |
| `src/modules/dominio/db/schema/dominio.ts` | coluna `estatisticas_jogo.time_id` |
| `src/modules/ingestao/nba/porta.ts`, `adaptadores/balldontlie.ts`, `sincronizar/partida.ts` | levar o time da linha de stats até o banco |
| `src/modules/dominio/retroativo/regras.ts` (novo, puro) | `timeNaData`, `ordenarHierarquia`, `mediasAte` |
| `src/modules/dominio/retroativo/fatos.ts` (novo) | `montarFatosRetroativos` |
| `src/modules/entrega/retroativo/executar.ts` (novo) | `executarDiaRetroativo`, `executarTemporadaRetroativa` |
| `src/modules/entrega/retroativo/leitura.ts` (novo) | leituras das três telas |
| `src/modules/entrega/retroativo/temporada.ts` (novo) | `temporadaDaUrl`, `ehTemporadaAnterior` |
| `src/modules/ingestao/niveis/backup.ts` (novo) | `exportarListaDoCj`, `restaurarListaDoCj` |
| `scripts/motor-retroativo.ts`, `scripts/lista-cj-backup.ts`, `scripts/lista-cj-restaurar.ts` (novos) | operação |
| `src/ui/SeletorTemporada.tsx` (novo) | o botão "2025-26 \| 2026-27" |
| `src/features/{resultados,lista,estatisticas}/…` | ligar as telas |
| `.dependency-cruiser.cjs` | regra `retroativo-sem-push` |
| `docs/runbooks/temporada-retroativa.md` | nova ordem de operação |

---

### Task 1: Time por jogo no box score

**Files:**
- Modify: `src/modules/ingestao/nba/porta.ts:67-98` (`LinhaBoxScore`)
- Modify: `src/modules/ingestao/nba/adaptadores/balldontlie.ts:84-103` (`linhaStatsSchema`), `:378-403` (`mapearLinhaStatsBalldontlie`)
- Modify: `src/modules/ingestao/sincronizar/partida.ts:49-71` (`linhaDeJogador`), `:150-263` (`persistirBoxScore`)
- Modify: `src/modules/dominio/db/schema/dominio.ts:183-224` (`estatisticasJogo`)
- Create: migração gerada `drizzle/0033_*.sql` + `drizzle/down/0033_*.sql`
- Test: `src/modules/ingestao/__tests__/box-score-time.test.ts`

**Interfaces:**
- Produces: `LinhaBoxScore.timeSiglaExterna: string | null`; coluna `estatisticasJogo.timeId: uuid | null`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/modules/ingestao/__tests__/box-score-time.test.ts
import { describe, expect, it } from 'vitest'
import { mapearLinhaStatsBalldontlie } from '../nba/adaptadores/balldontlie'

const linhaBruta = {
  id: 1, min: '34:10', fgm: 10, fga: 20, fg3m: 2, fg3a: 5, ftm: 5, fta: 6,
  oreb: 2, dreb: 8, reb: 10, ast: 7, stl: 1, blk: 1, turnover: 3, pf: 2, pts: 27,
  plus_minus: 5,
  player: { id: 15 },
  team: { id: 17, abbreviation: 'MIL' },
}

describe('box score leva o time da linha', () => {
  it('a sigla do time vem da linha de stats da BallDontLie', () => {
    expect(mapearLinhaStatsBalldontlie(linhaBruta, null).timeSiglaExterna).toBe('MIL')
  })
  it('linha sem time não quebra: vira null', () => {
    const { team: _t, ...semTime } = linhaBruta
    expect(mapearLinhaStatsBalldontlie(semTime, null).timeSiglaExterna).toBeNull()
  })
})
```

Acrescente no mesmo arquivo um caso com PGlite: `bancoDeTeste()`, semeie um time `MIL`, um jogador
com identidade `balldontlie`/`15` e um jogo; chame `persistirBoxScore` com uma linha
`timeSiglaExterna: 'MIL'` e confira `estatisticas_jogo.time_id` = id do MIL; com sigla desconhecida,
`time_id` fica `null` (não rejeita o snapshot — o time é informação extra, não identidade).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ingestao/__tests__/box-score-time.test.ts`
Expected: FAIL — `timeSiglaExterna` é `undefined`.

- [ ] **Step 3: Implementar**

Em `porta.ts`, dentro de `LinhaBoxScore`, depois de `jogadorIdExterno`:

```ts
  /** Sigla do time pelo qual o jogador atuou NESTE jogo. Base do time real da temporada anterior. */
  timeSiglaExterna: string | null
```

Em `balldontlie.ts`, no `linhaStatsSchema`, acrescente
`team: z.object({ abbreviation: z.string().min(1) }).passthrough().optional().nullable(),`
e em `mapearLinhaStatsBalldontlie`:

```ts
    timeSiglaExterna: linha.team?.abbreviation?.toUpperCase() ?? null,
```

Qualquer outro adaptador que devolva `LinhaBoxScore` (procure com
`grep -rn "LinhaBoxScore" src/modules/ingestao`) passa `timeSiglaExterna: null`.

Em `dominio.ts`, dentro de `estatisticasJogo`, depois de `jogadorId`:

```ts
    /** Time pelo qual o jogador atuou neste jogo. Null em linhas anteriores à coluna. */
    timeId: uuid('time_id').references(() => times.id),
```

Em `partida.ts`, dentro de `persistirBoxScore`, carregue `const siglas = await mapaDeTimes(db)` (de
`./identidade`) antes do laço e passe o `timeId` ao valor inserido:

```ts
      timeId: l.timeSiglaExterna ? (siglas.get(l.timeSiglaExterna) ?? null) : null,
```

e inclua `timeId: sql.raw('excluded.time_id')` no `set` do `onConflictDoUpdate`, no mesmo padrão
das outras colunas daquele `set`.

- [ ] **Step 4: Gerar a migração**

Run: `npm run db:generate`
Expected: `drizzle/0033_*.sql` com `ALTER TABLE "estatisticas_jogo" ADD COLUMN "time_id" uuid;` e a
FK; `drizzle/down/0033_*.sql` gerado sem erro. Se `gerar-down.mjs` falhar na `ADD CONSTRAINT`,
acrescente a entrada em `CONSTRAINTS_ANTERIORES` como o script pede.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/modules/ingestao/__tests__/box-score-time.test.ts src/modules/ingestao/__tests__ src/modules/dominio/__tests__/migracoes-pendentes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/ingestao/nba/porta.ts src/modules/ingestao/nba/adaptadores/balldontlie.ts \
  src/modules/ingestao/sincronizar/partida.ts src/modules/dominio/db/schema/dominio.ts \
  drizzle/ src/modules/ingestao/__tests__/box-score-time.test.ts
git commit -m "wip(retroativo): Task 1 — time por jogo no box score"
```

---

### Task 2: Tabelas da temporada anterior

**Files:**
- Create: `src/modules/dominio/db/schema/retroativo.ts`
- Modify: `src/modules/dominio/db/schema/index.ts` (reexportar)
- Create: migração `drizzle/0034_*.sql` + down
- Test: `src/modules/dominio/__tests__/retroativo-schema.test.ts`

**Interfaces:**
- Produces: `apitosRetroativos`, `greensRetroativos`, `feedRetroativo` (Drizzle tables).

- [ ] **Step 1: Teste que falha**

```ts
// src/modules/dominio/__tests__/retroativo-schema.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from './ajuda-banco'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => { banco = await bancoDeTeste() })
afterAll(async () => { await banco.fechar() })

describe('tabelas da temporada anterior', () => {
  it('as três existem e a chave de apito é a mesma de apitos, com NULL colidindo', async () => {
    const { rows } = await banco.pg.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where tablename = 'apitos_retroativos'`,
    )
    const unico = rows.map((r) => r.indexdef).find((d) => d.includes('UNIQUE'))
    expect(unico).toMatch(/jogo_id, jogador_id, atributo, estrategia, linha/)
    expect(unico).toMatch(/NULLS NOT DISTINCT/)
    for (const t of ['greens_retroativos', 'feed_retroativo']) {
      const r = await banco.pg.query(`select 1 from information_schema.tables where table_name = $1`, [t])
      expect(r.rows).toHaveLength(1)
    }
  })
})
```

- [ ] **Step 2: Ver falhar** — Run: `npx vitest run src/modules/dominio/__tests__/retroativo-schema.test.ts` → FAIL (tabela não existe).

- [ ] **Step 3: Implementar**

```ts
// src/modules/dominio/db/schema/retroativo.ts
import {
  boolean, date, index, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core'

import { jogadores, jogos } from './dominio'
import { niveisVersao } from './editorial'
import { atributoEnum, estrategiaEnum, metodoEnum, nivelJogadorEnum } from './enums'

/**
 * TEMPORADA ANTERIOR — o motor NIP aplicado a uma temporada que já terminou.
 *
 * Tabelas SEPARADAS de `apitos`/`greens`/`feed_snapshot` por decisão do parceiro
 * (spec 25/09, decisão 5): nada daqui foi publicado na época, nada daqui gera
 * push, nada daqui entra no Placar público. Só Resultados, Lista Secreta e
 * Estatísticas leem, e só quando a URL pede uma temporada anterior.
 */
export const apitosRetroativos = pgTable(
  'apitos_retroativos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    temporada: text('temporada').notNull(),
    dataReferencia: date('data_referencia').notNull(),
    niveisVersaoId: uuid('niveis_versao_id').notNull().references(() => niveisVersao.id),
    rulesetVersao: text('ruleset_versao').notNull(),
    jogoId: uuid('jogo_id').notNull().references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id').notNull().references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    estrategia: estrategiaEnum('estrategia').notNull(),
    metodo: metodoEnum('metodo'),
    nivelJogador: nivelJogadorEnum('nivel_jogador').notNull(),
    nivelApito: smallint('nivel_apito').notNull(),
    turbo: boolean('turbo').notNull().default(false),
    modoFire: boolean('modo_fire').notNull().default(false),
    opdOrigemNivel: smallint('opd_origem_nivel'),
    linha: smallint('linha'),
    // "confianca", NUNCA "probabilidade" (P12).
    confianca: numeric('confianca', { precision: 5, scale: 2 }),
    alvo1q: smallint('alvo_1q'),
    geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Mesma chave de `apitos` (regra 5): rodar de novo nunca duplica.
    unique('apitos_retroativos_dedup')
      .on(t.jogoId, t.jogadorId, t.atributo, t.estrategia, t.linha)
      .nullsNotDistinct(),
    index('apitos_retroativos_temporada_data_idx').on(t.temporada, t.dataReferencia),
    index('apitos_retroativos_jogador_idx').on(t.jogadorId),
  ],
)

export const greensRetroativos = pgTable(
  'greens_retroativos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    temporada: text('temporada').notNull(),
    dataReferencia: date('data_referencia').notNull(),
    jogoId: uuid('jogo_id').notNull().references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id').notNull().references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    nivelJogador: nivelJogadorEnum('nivel_jogador').notNull(),
    marco: smallint('marco').notNull(),
    valor: smallint('valor').notNull(),
  },
  (t) => [
    unique('greens_retroativos_unico').on(t.jogoId, t.jogadorId, t.atributo, t.marco),
    index('greens_retroativos_temporada_data_idx').on(t.temporada, t.dataReferencia),
  ],
)

export const feedRetroativo = pgTable(
  'feed_retroativo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    temporada: text('temporada').notNull(),
    dataReferencia: date('data_referencia').notNull(),
    niveisVersaoId: uuid('niveis_versao_id').notNull().references(() => niveisVersao.id),
    conteudoJson: jsonb('conteudo_json').notNull(),
    hash: text('hash').notNull(),
    geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('feed_retroativo_unico').on(t.temporada, t.dataReferencia)],
)
```

Em `schema/index.ts`: `export * from './retroativo'`. Confira que `atributoEnum`, `estrategiaEnum`,
`metodoEnum`, `nivelJogadorEnum` são os nomes exportados em `schema/enums.ts` (ajuste o import se
o nome real diferir).

- [ ] **Step 4: Gerar migração** — Run: `npm run db:generate` → `drizzle/0034_*.sql` + down sem erro.

- [ ] **Step 5: Ver passar** — Run: `npx vitest run src/modules/dominio/__tests__/retroativo-schema.test.ts src/modules/dominio/__tests__/migracoes-pendentes.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/dominio/db/schema/retroativo.ts src/modules/dominio/db/schema/index.ts drizzle/ \
  src/modules/dominio/__tests__/retroativo-schema.test.ts
git commit -m "wip(retroativo): Task 2 — tabelas da temporada anterior"
```

---

### Task 3: Regras puras da temporada anterior

**Files:**
- Create: `src/modules/dominio/retroativo/regras.ts`
- Test: `src/modules/dominio/retroativo/__tests__/regras.test.ts`

**Interfaces:**
- Consumes: `Atributo`, `Nivel`, `NIVEIS`, `JogoHistorico` de `@/modules/motor/tipos` (tipos e constantes; `dominio` pode importar tipos do motor, como `fatos.ts` já faz).
- Produces:
  - `timeNaData(jogos: { data: string; timeId: string | null }[], ate: string): string | null`
  - `ordenarHierarquia(entradas: EntradaHierarquia[]): Map<string, number>` onde
    `type EntradaHierarquia = { jogadorId: string; nivel: Nivel; posicaoCj: number }` — devolve jogadorId → posição 1..N
  - `mediasAte(historico: JogoHistorico[], tamanhoJanela: number | null): Partial<Record<Atributo, number>>`

- [ ] **Step 1: Teste que falha**

```ts
// src/modules/dominio/retroativo/__tests__/regras.test.ts
import { describe, expect, it } from 'vitest'
import { mediasAte, ordenarHierarquia, timeNaData } from '../regras'

describe('timeNaData', () => {
  const jogos = [
    { data: '2025-11-01', timeId: 'MIL' },
    { data: '2026-01-10', timeId: 'MIA' },
  ]
  it('usa o último jogo ATÉ a data', () => {
    expect(timeNaData(jogos, '2025-12-15')).toBe('MIL')
    expect(timeNaData(jogos, '2026-02-01')).toBe('MIA')
  })
  it('o jogo do próprio dia conta (o time do jogo é fato do jogo)', () => {
    expect(timeNaData(jogos, '2026-01-10')).toBe('MIA')
  })
  it('antes do primeiro jogo, não há time', () => {
    expect(timeNaData(jogos, '2025-10-01')).toBeNull()
  })
  it('linha sem time é ignorada', () => {
    expect(timeNaData([{ data: '2025-11-01', timeId: null }], '2025-12-01')).toBeNull()
  })
})

describe('ordenarHierarquia — nível do jogador, depois a posição na lista do CJ', () => {
  it('MVP antes de All Star, mesmo com posição do CJ maior', () => {
    const ordem = ordenarHierarquia([
      { jogadorId: 'a', nivel: 'ALL_STAR', posicaoCj: 1 },
      { jogadorId: 'b', nivel: 'MVP', posicaoCj: 3 },
      { jogadorId: 'c', nivel: 'ALL_STAR', posicaoCj: 2 },
      { jogadorId: 'd', nivel: 'RANDOLA', posicaoCj: 1 },
    ])
    expect([...ordem.entries()]).toEqual([['b', 1], ['a', 2], ['c', 3], ['d', 4]])
  })
  it('empate total desempata pelo id, para ser determinístico', () => {
    const ordem = ordenarHierarquia([
      { jogadorId: 'z', nivel: 'SUPORTE', posicaoCj: 2 },
      { jogadorId: 'y', nivel: 'SUPORTE', posicaoCj: 2 },
    ])
    expect([...ordem.keys()]).toEqual(['y', 'z'])
  })
})

describe('mediasAte — sem olhar o futuro', () => {
  const h = (data: string, pontos: number, jogou = true) =>
    ({ jogoId: data, data, jogou, pontos, rebotes: 0, assistencias: 0 })
  it('média de quem jogou; DNP não entra', () => {
    expect(mediasAte([h('2025-11-03', 20), h('2025-11-02', 0, false), h('2025-11-01', 10)], null).PONTOS).toBe(15)
  })
  it('janela de N usa os N mais recentes que jogou', () => {
    expect(mediasAte([h('2025-11-03', 30), h('2025-11-02', 20), h('2025-11-01', 10)], 2).PONTOS).toBe(25)
  })
  it('sem jogo, sem média', () => {
    expect(mediasAte([], null)).toEqual({})
  })
})
```

- [ ] **Step 2: Ver falhar** — Run: `npx vitest run src/modules/dominio/retroativo/__tests__/regras.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// src/modules/dominio/retroativo/regras.ts
import { NIVEIS, type Atributo, type JogoHistorico, type Nivel } from '../../motor/tipos'

/**
 * REGRAS DA TEMPORADA ANTERIOR (spec 25/09) — puras, sem banco.
 *
 * Na temporada anterior o jogador conta pelo time em que JOGOU (decisão 2),
 * e a hierarquia do time é remontada com o nível que o CJ deu a cada um
 * (decisão 3). O motor não sabe de nada disso: recebe `Fatos` como sempre.
 */

/** Time do jogador na data: o do último jogo dele até ela, inclusive. */
export function timeNaData(
  jogos: readonly { data: string; timeId: string | null }[],
  ate: string,
): string | null {
  let melhor: { data: string; timeId: string } | null = null
  for (const j of jogos) {
    if (j.timeId === null || j.data > ate) continue
    if (melhor === null || j.data > melhor.data) melhor = { data: j.data, timeId: j.timeId }
  }
  return melhor?.timeId ?? null
}

export type EntradaHierarquia = { jogadorId: string; nivel: Nivel; posicaoCj: number }

/** Nível do jogador primeiro; no mesmo nível, a posição dele na lista do CJ. */
export function ordenarHierarquia(entradas: readonly EntradaHierarquia[]): Map<string, number> {
  const ordenadas = [...entradas].sort(
    (a, b) =>
      NIVEIS.indexOf(a.nivel) - NIVEIS.indexOf(b.nivel) ||
      a.posicaoCj - b.posicaoCj ||
      a.jogadorId.localeCompare(b.jogadorId),
  )
  return new Map(ordenadas.map((e, i) => [e.jogadorId, i + 1] as const))
}

const CAMPO: Record<Atributo, 'pontos' | 'rebotes' | 'assistencias'> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistencias',
}

/**
 * Média por atributo sobre o histórico JÁ recortado até a véspera. Mesma
 * regra de `recalcularMedias`: só jogo em que o jogador entrou em quadra,
 * os N mais recentes quando a janela tem tamanho.
 */
export function mediasAte(
  historico: readonly JogoHistorico[],
  tamanhoJanela: number | null,
): Partial<Record<Atributo, number>> {
  const jogados = historico
    .filter((h) => h.jogou)
    .sort((a, b) => b.data.localeCompare(a.data))
  const recorte = tamanhoJanela === null ? jogados : jogados.slice(0, tamanhoJanela)
  if (recorte.length === 0) return {}
  const medias: Partial<Record<Atributo, number>> = {}
  for (const atributo of Object.keys(CAMPO) as Atributo[]) {
    const soma = recorte.reduce((s, h) => s + h[CAMPO[atributo]], 0)
    medias[atributo] = Number((soma / recorte.length).toFixed(2))
  }
  return medias
}
```

**Mova** `tamanhoDaJanela` de `src/modules/ingestao/sincronizar/medias.ts` para
`src/modules/dominio/janela.ts` (exportada) e faça `medias.ts` importá-la de lá — `dominio` não pode
importar `ingestao`, e a Task 4 precisa dela. `toFixed(2)` espelha o `media()` de `medias.ts`.

- [ ] **Step 4: Ver passar** — mesmo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dominio/retroativo/ src/modules/dominio/janela.ts src/modules/ingestao/sincronizar/medias.ts
git commit -m "wip(retroativo): Task 3 — regras puras da temporada anterior"
```

---

### Task 4: `montarFatosRetroativos`

**Files:**
- Create: `src/modules/dominio/retroativo/fatos.ts`
- Test: `src/modules/dominio/retroativo/__tests__/fatos.test.ts`

**Interfaces:**
- Consumes: Task 3 (`timeNaData`, `ordenarHierarquia`, `mediasAte`); Task 1 (`estatisticasJogo.timeId`); `indexarClassificacoes`, `chavesEstrategiaConfirmadas` de `../fatos-editoriais`; `entrouEmQuadra`, `colunasDeParticipacao` de `../participacao`; `intervaloDoDia` de `../rodada`; `tamanhoDaJanela`, `JanelaMedia` de `../janela` (movida na Task 3).
- Produces: `montarFatosRetroativos(db: Db, dataReferencia: string, config: { fuso: string; janela: JanelaMedia; quartoFireLive: number }): Promise<Fatos & { niveisVersaoId: string | null }>`

Regras de montagem (cada uma é um caso de teste):
1. Versão ativa da lista do CJ; sem ela → `{ dataReferencia, times: [], jogos: [], niveisVersaoId: null }`.
2. Jogos do dia (`intervaloDoDia`), **apenas `status = 'ENCERRADO'`**.
3. Para cada jogador da lista: histórico = `estatisticas_jogo` com `jogos.dataHoraUtc < inicio` (já é o padrão de `montarFatos`), mais o `timeId` de cada linha.
4. Time no dia = `timeNaData(linhas do jogador com data ≤ fim do dia, dataReferencia)` — inclui o jogo do dia (é fato do jogo).
5. Por time e **por atributo**: `ordenarHierarquia` com `nivel` = classificação do CJ naquele atributo e `posicaoCj` = `posicaoHierarquia` do CJ naquele atributo; preencha `posicaoHierarquiaPorAtributo` com o resultado e `posicaoHierarquia` = a de PONTOS (ou a menor), igual a `indexarClassificacoes`.
6. `medias` = `mediasAte(historico, tamanhoDaJanela(config.janela))`.
7. `escalacao` do jogo: para cada jogador da hierarquia dos dois times, `'FORA'` se não há linha dele no box do jogo ou `entrouEmQuadra` é falso; `'ATIVO'` caso contrário.
8. `quartoAtual = config.quartoFireLive` e `estatisticasQuarto` = só as linhas do quarto `config.quartoFireLive` (o Fire Live só age nesse quarto; a Lista Secreta não olha `quartoAtual`).
9. `elencoCanonico` do time = os jogadores da lista que tiveram linha naquele jogo por aquele time (o Fire Live observa quem jogou).

- [ ] **Step 1: Teste que falha**

Crie o arquivo com `bancoDeTeste()` e uma semente mínima inserida direto (`db.insert(schema.x).values(...)`):
times `MIL`, `MIA`, `BOS`; jogadores `giannis`, `lillard`, `jogadorForaDaLista`; versão ativa da lista
com `giannis` = MVP/MIA/pos 1 e `lillard` = ALL_STAR/MIA/pos 2 em PONTOS; jogos ENCERRADOS em
2025-11-01 (MIL×BOS), 2025-11-02 (MIL×BOS), 2025-11-03 (MIL×BOS, giannis sem linha), 2025-11-04 (MIL×BOS, giannis joga 50);
`estatisticas_jogo` com `time_id` = MIL. Casos:

```ts
it('conta o Giannis pelo Milwaukee, não pelo Miami da lista', async () => {
  const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
  const mil = f.times.find((t) => t.sigla === 'MIL')!
  expect(mil.jogadores.map((j) => j.id)).toContain(GIANNIS)
  expect(f.times.find((t) => t.sigla === 'MIA')).toBeUndefined()
})
it('sem futuro: a média do dia 03 não vê o 50 do dia 04', async () => {
  const f = await montarFatosRetroativos(db, '2025-11-03', CONFIG)
  const g = f.times.flatMap((t) => t.jogadores).find((j) => j.id === GIANNIS)!
  expect(g.historico.every((h) => h.data < '2025-11-03')).toBe(true)
  expect(g.medias.PONTOS).not.toBe(50)
})
it('quem não jogou no dia é FORA na escalação', async () => {
  const f = await montarFatosRetroativos(db, '2025-11-03', CONFIG)
  expect(f.jogos[0].escalacao[GIANNIS]).toBe('FORA')
})
it('hierarquia: MVP antes de All Star', async () => {
  const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
  const mil = f.times.find((t) => t.sigla === 'MIL')!
  expect(mil.jogadores[0].id).toBe(GIANNIS)
  expect(mil.jogadores[0].posicaoHierarquiaPorAtributo?.PONTOS).toBe(1)
})
it('jogador fora da lista do CJ não entra', async () => {
  const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
  expect(f.times.flatMap((t) => t.jogadores).map((j) => j.id)).not.toContain(FORA_DA_LISTA)
})
it('troca no meio da temporada: muda de time na data do primeiro jogo pelo novo', async () => {
  // semeie lillard com linha MIL em 2025-11-01 e MIA em 2026-01-10 (jogo MIA×BOS encerrado)
  expect((await montarFatosRetroativos(db, '2025-12-01', CONFIG)).times.find((t) => t.sigla === 'MIL')!
    .jogadores.map((j) => j.id)).toContain(LILLARD)
  expect((await montarFatosRetroativos(db, '2026-01-10', CONFIG)).times.find((t) => t.sigla === 'MIA')!
    .jogadores.map((j) => j.id)).toContain(LILLARD)
})
it('jogo não encerrado fica de fora', async () => {
  await db.insert(schema.jogos).values({ ...jogoBase, id: JOGO_AGENDADO, dataReferencia: '2025-11-02',
    dataHoraUtc: new Date('2025-11-02T23:30:00Z'), status: 'AGENDADO' })
  const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
  expect(f.jogos.map((j) => j.id)).not.toContain(JOGO_AGENDADO)
})
it('sem versão ativa da lista, nada', async () => {
  await db.update(schema.niveisVersao).set({ ativa: false })
  const f = await montarFatosRetroativos(db, '2025-11-02', CONFIG)
  expect(f).toEqual({ dataReferencia: '2025-11-02', times: [], jogos: [], niveisVersaoId: null })
})
```

com `const CONFIG = { fuso: 'America/Sao_Paulo', janela: 'temporada' as const, quartoFireLive: 1 }`
(nos testes o fuso pode ser literal; em produção vem do ruleset). `jogoBase` é o objeto de jogo
da semente (times, fuso, `dataHoraUtc`); os testes que alteram a semente usam um `beforeEach` com
`bancoDeTeste()` novo, para não vazar estado entre casos.

- [ ] **Step 2: Ver falhar** — Run: `npx vitest run src/modules/dominio/retroativo/__tests__/fatos.test.ts` → FAIL.

- [ ] **Step 3: Implementar** `fatos.ts` seguindo as regras 1–9 acima, no mesmo estilo de
`src/modules/dominio/fatos.ts` (carga em lote com `Promise.all`, índices em `Map`, comentário de
cabeçalho explicando que é a única peça que sabe de temporada anterior). Consultas:
- `niveisVersao` ativa + `niveis` da versão (como `montarFatos` linhas 65–71);
- `jogos` do dia com `status = 'ENCERRADO'`;
- `estatisticasJogo` ⋈ `jogos` dos jogadores da lista com `jogos.dataHoraUtc < fim` (traz `timeId`, `data`, participação), e separe: `< inicio` vira histórico; `= dia` alimenta escalação e elenco canônico;
- `estatisticasQuarto` dos jogos do dia com `quarto = config.quartoFireLive`;
- `chavesEstrategiaConfirmadas(db, idsJogador)`.

- [ ] **Step 4: Ver passar** — mesmo comando → PASS. Rode também `npm run boundaries` (a pasta nova não pode importar `ingestao`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dominio/retroativo/
git commit -m "wip(retroativo): Task 4 — montarFatosRetroativos"
```

---

### Task 5: Executor da temporada anterior

**Files:**
- Create: `src/modules/entrega/retroativo/executar.ts`
- Create: `src/modules/entrega/retroativo/feed.ts`
- Modify: `.dependency-cruiser.cjs` (regra nova)
- Test: `src/modules/entrega/retroativo/__tests__/executar.test.ts`

**Interfaces:**
- Consumes: `montarFatosRetroativos` (Task 4); `avaliar`, `avaliarFireLive`, `montarChave` de `../../motor`; tabelas da Task 2; `ItemFeed`, `ConteudoFeed` de `../tipos-feed`; `calendarioDoRuleset`, `temporadaDe` de `../../dominio/temporada`.
- Produces:
  - `executarDiaRetroativo(db: Db, ruleset: Ruleset, dataReferencia: string): Promise<{ apitos: number; greens: number; jogos: number }>`
  - `montarItensRetroativos(apitos: Apito[], fatos: Fatos, nomes: Map<string, { nome: string; fotoUrl: string | null; timeSigla: string; timeNome: string }>): ItemFeed[]` (puro, em `feed.ts`)

Comportamento:
1. `temporada = temporadaDe(new Date(`${data}T12:00:00Z`), calendarioDoRuleset(ruleset))`.
2. `fatos = await montarFatosRetroativos(db, data, { fuso, janela: ruleset.media.janela, quartoFireLive: ruleset.fire_live.quarto })`; sem jogos → retorna zeros sem escrever nada.
3. `apitos = avaliar(fatos, ruleset)` (Lista Secreta e Fire Live).
4. Greens: para cada jogo e cada time do jogo, `avaliarFireLive(time, jogo, ruleset, { opdPreLive })`, onde `opdPreLive` = mapa jogadorId → nivelApito dos apitos `LISTA_SECRETA` com `metodo === 'OPD'` daquele jogo; guarde `.greens`.
5. Numa transação por dia: `DELETE` de `apitos_retroativos`, `greens_retroativos`, `feed_retroativo` com `data_referencia = data`; `INSERT` de tudo (com `temporada`, `dataReferencia`, `niveisVersaoId`, `rulesetVersao = ruleset.versao`); `feed_retroativo` com `conteudoJson: ConteudoFeed` (`itens = montarItensRetroativos(...)` só com `LISTA_SECRETA`, `oddFaixa: null`, `ultimos5` a partir do `historico` do fato (5 mais recentes, `bateu = valor >= linha`), `mediaTemporada` = média do atributo no fato) e `hash` = sha256 do JSON.
   Apagar e regravar o dia é o que faz a troca da lista do CJ **regravar**, não somar (Review Focus 5).
6. `executarTemporadaRetroativa(db, ruleset, { de, ate, aoConcluirDia? })` percorre as datas (use `datasDoPeriodo` de `../backtest/executar`) e soma os contadores.

- [ ] **Step 1: Teste que falha** — em `executar.test.ts`, com `bancoDeTeste()` e a mesma semente da Task 4 estendida para produzir um apito (Giannis com histórico abaixo da média o bastante para a oscilação do ruleset real — use `carregarRuleset` do motor e escolha os números lendo `config/ruleset.v1.yaml` seção `oscilacao`; o teste deve DIZER no comentário qual regra do yaml ele exercita):

```ts
it('grava apitos da temporada anterior e nada em apitos/greens/feed_snapshot', async () => {
  const r = await executarDiaRetroativo(db, ruleset, DIA)
  expect(r.apitos).toBeGreaterThan(0)
  expect(await contar(db, 'apitos_retroativos')).toBe(r.apitos)
  expect(await contar(db, 'apitos')).toBe(0)
  expect(await contar(db, 'greens')).toBe(0)
  expect(await contar(db, 'feed_snapshot')).toBe(0)
})
it('rodar duas vezes não duplica', async () => {
  await executarDiaRetroativo(db, ruleset, DIA)
  const antes = await contar(db, 'apitos_retroativos')
  await executarDiaRetroativo(db, ruleset, DIA)
  expect(await contar(db, 'apitos_retroativos')).toBe(antes)
})
it('trocar a lista do CJ regrava o dia com a versão nova', async () => {
  await executarDiaRetroativo(db, ruleset, DIA)
  const versaoNova = await ativarOutraVersaoSemOGiannis(db) // helper do teste
  await executarDiaRetroativo(db, ruleset, DIA)
  const linhas = await db.select().from(schema.apitosRetroativos)
  expect(linhas.every((l) => l.niveisVersaoId === versaoNova)).toBe(true)
  expect(linhas.some((l) => l.jogadorId === GIANNIS)).toBe(false)
})
it('o feed do dia não tem odd e tem ultimos5 do histórico', async () => {
  await executarDiaRetroativo(db, ruleset, DIA)
  const [f] = await db.select().from(schema.feedRetroativo)
  const itens = (f.conteudoJson as ConteudoFeed).itens
  expect(itens.every((i) => i.oddFaixa === null)).toBe(true)
})
```

com `contar(db, tabela)` = `select count(*)::int` via `banco.pg.query`.

Em `montarItensRetroativos`, teste puro no mesmo arquivo: um `Apito` e um `Fatos` literais →
`ItemFeed` com `chave === apito.chaveDeduplicacao`, `nome`, `timeSigla` do mapa, `oddFaixa: null`.

- [ ] **Step 2: Ver falhar** — Run: `npx vitest run src/modules/entrega/retroativo/__tests__/executar.test.ts` → FAIL.

- [ ] **Step 3: Implementar** `feed.ts` (puro) e `executar.ts` conforme o comportamento 1–6. Cabeçalho
de `executar.ts` diz: "nunca push — este módulo não importa `entrega/push` nem `entrega/fila`, e a
regra `retroativo-sem-push` do dependency-cruiser garante".

- [ ] **Step 4: Regra de fronteira** — em `.dependency-cruiser.cjs`, dentro de `forbidden`:

```js
    {
      name: 'retroativo-sem-push',
      comment:
        'A temporada anterior nunca publica: nada de push, fila ou das tabelas do app ao vivo (spec 25/09).',
      severity: 'error',
      from: { path: '^src/modules/(dominio|entrega)/retroativo' },
      to: { path: '^src/modules/entrega/(push|fila)' },
    },
```

- [ ] **Step 5: Ver passar** — Run: `npx vitest run src/modules/entrega/retroativo/__tests__/executar.test.ts && npm run boundaries` → PASS, 0 violações.

- [ ] **Step 6: Commit**

```bash
git add src/modules/entrega/retroativo/ .dependency-cruiser.cjs
git commit -m "wip(retroativo): Task 5 — executor da temporada anterior"
```

---

### Task 6: Script `motor:retroativo`

**Files:**
- Create: `scripts/motor-retroativo.ts`
- Modify: `package.json` (script)
- Test: `src/modules/entrega/retroativo/__tests__/script.test.ts`

**Interfaces:**
- Consumes: `executarTemporadaRetroativa` (Task 5); `rulesetAtivo` de `src/modules/entrega/ruleset-ativo.ts`; `temporadaDe`, `calendarioDoRuleset`.

- [ ] **Step 1: Teste que falha** (teste de fiação, padrão de `src/modules/ingestao/__tests__/fiacao-llm.test.ts`):

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('script motor:retroativo', () => {
  const fonte = readFileSync('scripts/motor-retroativo.ts', 'utf8')
  it('recusa a temporada do calendário (só temporada anterior)', () => {
    expect(fonte).toMatch(/temporadaDe\(/)
    expect(fonte).toMatch(/temporada do calendário/i)
  })
  it('exige --de e --ate e tem --dry-run', () => {
    expect(fonte).toMatch(/--de=/)
    expect(fonte).toMatch(/--ate=/)
    expect(fonte).toMatch(/--dry-run/)
  })
  it('não importa push nem fila', () => {
    expect(fonte).not.toMatch(/entrega\/(push|fila)/)
  })
  it('está no package.json', () => {
    expect(readFileSync('package.json', 'utf8')).toMatch(/"motor:retroativo": "vite-node scripts\/motor-retroativo\.ts"/)
  })
})
```

- [ ] **Step 2: Ver falhar** — `npx vitest run src/modules/entrega/retroativo/__tests__/script.test.ts` → FAIL.

- [ ] **Step 3: Implementar** o script: lê `--de=YYYY-MM-DD --ate=YYYY-MM-DD [--dry-run]`; carrega o
ruleset ativo; **recusa** se `temporadaDe(de)` ou `temporadaDe(ate)` for a temporada do calendário
(`temporadaDe(new Date())`) com a mensagem "motor:retroativo só roda em temporada anterior — a
temporada do calendário é publicada pelo job diário"; com `--dry-run` imprime quantas datas e jogos
encerrados há no intervalo e sai; sem ele, chama `executarTemporadaRetroativa` imprimindo um resumo
por dia e o total; `fecharDb()` no `finally` (padrão de `scripts/demo-limpar.ts`).
`package.json`: `"motor:retroativo": "vite-node scripts/motor-retroativo.ts"`.

- [ ] **Step 4: Ver passar** — mesmo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/motor-retroativo.ts package.json src/modules/entrega/retroativo/__tests__/script.test.ts
git commit -m "wip(retroativo): Task 6 — script motor:retroativo"
```

---

### Task 7: Backup e restauração da lista do CJ

**Files:**
- Create: `src/modules/ingestao/niveis/backup.ts`
- Create: `scripts/lista-cj-backup.ts`, `scripts/lista-cj-restaurar.ts`
- Modify: `package.json`
- Test: `src/modules/ingestao/niveis/__tests__/backup.test.ts`

**Interfaces:**
- Produces:
  - `type BackupListaCj = { geradoEm: string; versoes: { versao: string; origemArquivo: string | null; importadoPor: string | null; importadoEm: string; ativa: boolean; niveis: { nome: string; nomeNaLista: string | null; timeSigla: string; atributo: Atributo; nivel: Nivel; posicaoHierarquia: number }[] }[] }`
  - `exportarListaDoCj(db: Db): Promise<BackupListaCj>`
  - `restaurarListaDoCj(db: Db, backup: BackupListaCj, opcoes: { provedor: string }): Promise<{ versoes: number; ligados: number; pendentes: string[] }>`

Regras da restauração:
1. Cada versão é recriada com o mesmo `versao` (texto), origem, autor e `ativa`; se já existe (mesmo `versao`), reaproveita (idempotente).
2. Cada linha liga ao jogador por: (a) `mapa_jogadores` **confirmado** com `nome_na_lista` = `nomeNaLista`; senão (b) **um único** jogador cujo `normalizarTexto(nome_completo)` = `normalizarTexto(nome)`. No caso (b) grava/atualiza `mapa_jogadores` com `jogador_id` preenchido e **sem** `confirmado_em` — aparece em `/admin/mapeamento` para o parceiro confirmar (nome nunca confirma sozinho). Zero ou vários candidatos → vai para `pendentes` e grava `mapa_jogadores` com `jogador_id = NULL`.
3. `niveis` usa `onConflictDoNothing` na chave `niveis_unico`: rodar de novo depois que o parceiro confirmar os pendentes em `/admin/mapeamento` completa a lista sem duplicar.
4. Time por `times.sigla`.

- [ ] **Step 1: Teste que falha** — PGlite: semeie uma versão ativa e uma inativa com 3 jogadores
(nomes "Giannis Antetokounmpo", "Luka Dončić", "Fulano"), exporte, apague `niveis`,
`niveis_versao`, `mapa_jogadores` e os jogadores (como a limpeza da demo), crie jogadores "reais"
"Giannis Antetokounmpo" e "Luka Doncic" (sem acento) e dois "Fulano", restaure. Esperado:

```ts
expect(r.versoes).toBe(2)
expect(r.pendentes).toEqual(['Fulano'])            // dois candidatos: não escolhe
expect(await contarNiveisDaVersaoAtiva(db)).toBe(2) // Giannis e Luka ligados
expect(versaoAtiva.versao).toBe(backup.versoes.find((v) => v.ativa)!.versao)
const mapa = await db.select().from(schema.mapaJogadores)
expect(mapa.filter((m) => m.jogadorId && !m.confirmadoEm)).toHaveLength(2) // ligados por nome, não confirmados
// segunda rodada não duplica
const r2 = await restaurarListaDoCj(db, backup, { provedor: 'balldontlie' })
expect(await contarNiveisDaVersaoAtiva(db)).toBe(2)
```

e um caso "o parceiro confirma o Fulano em mapa_jogadores e a restauração completa": atualize
`mapa_jogadores` do "Fulano" com `jogador_id` e `confirmado_em`, restaure de novo, conte 3.

- [ ] **Step 2: Ver falhar** — `npx vitest run src/modules/ingestao/niveis/__tests__/backup.test.ts` → FAIL.

- [ ] **Step 3: Implementar** `backup.ts` com as regras 1–4 (use `normalizarTexto` de
`src/modules/dominio/texto.ts`), e os scripts:
- `scripts/lista-cj-backup.ts`: grava `backups/lista-cj-<AAAA-MM-DDTHHMM>.json` (crie a pasta; acrescente `backups/` ao `.gitignore`) e imprime o caminho e as contagens por versão.
- `scripts/lista-cj-restaurar.ts --arquivo=<caminho>`: lê o JSON, restaura, imprime ligados e pendentes (um por linha) e lembra: "confirme os pendentes em /admin/mapeamento e rode de novo".
- `package.json`: `"lista-cj:backup"`, `"lista-cj:restaurar"` com `vite-node`.

- [ ] **Step 4: Ver passar** — mesmo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ingestao/niveis/backup.ts src/modules/ingestao/niveis/__tests__/backup.test.ts \
  scripts/lista-cj-backup.ts scripts/lista-cj-restaurar.ts package.json .gitignore
git commit -m "wip(retroativo): Task 7 — backup e restauração da lista do CJ"
```

---

### Task 8: Temporada na URL e o seletor

**Files:**
- Create: `src/modules/entrega/retroativo/temporada.ts`
- Create: `src/ui/SeletorTemporada.tsx`
- Test: `src/modules/entrega/retroativo/__tests__/temporada.test.ts`, `src/ui/__tests__/seletor-temporada.test.tsx`

**Interfaces:**
- Consumes: `temporadasComDados(db, config)` e `temporadaParaExibir` de `src/modules/entrega/estatisticas/temporadas.ts`; `Segmentado` de `src/ui/controles.tsx`.
- Produces:
  - `temporadaDaUrl(valor: string | string[] | undefined, opcoes: { exibida: string; disponiveis: string[] }): string` — devolve `valor` se for string e estiver em `disponiveis`; senão `exibida`.
  - `ehTemporadaAnterior(temporada: string, doCalendario: string): boolean` — `temporada !== doCalendario`.
  - `<SeletorTemporada temporadas={string[]} atual={string} hrefDe={(t: string) => string} />`

- [ ] **Step 1: Testes que falham**

```ts
// temporada.test.ts
import { describe, expect, it } from 'vitest'
import { ehTemporadaAnterior, temporadaDaUrl } from '../temporada'

const opcoes = { exibida: '2025-26', disponiveis: ['2025-26', '2026-27'] }
describe('temporadaDaUrl', () => {
  it('aceita uma temporada disponível', () => expect(temporadaDaUrl('2026-27', opcoes)).toBe('2026-27'))
  it('lixo cai na exibida', () => expect(temporadaDaUrl('abc', opcoes)).toBe('2025-26'))
  it('temporada sem dado cai na exibida', () => expect(temporadaDaUrl('2019-20', opcoes)).toBe('2025-26'))
  it('array (param repetido) cai na exibida', () => expect(temporadaDaUrl(['2026-27', 'x'], opcoes)).toBe('2025-26'))
  it('ausente cai na exibida', () => expect(temporadaDaUrl(undefined, opcoes)).toBe('2025-26'))
})
describe('ehTemporadaAnterior', () => {
  it('a do calendário não é anterior', () => expect(ehTemporadaAnterior('2026-27', '2026-27')).toBe(false))
  it('outra é', () => expect(ehTemporadaAnterior('2025-26', '2026-27')).toBe(true))
})
```

```tsx
// seletor-temporada.test.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SeletorTemporada } from '../SeletorTemporada'

describe('SeletorTemporada', () => {
  const html = renderToStaticMarkup(
    <SeletorTemporada temporadas={['2025-26', '2026-27']} atual="2025-26" hrefDe={(t) => `/resultados?temporada=${t}`} />,
  )
  it('um link por temporada, a atual anunciada', () => {
    expect(html).toContain('href="/resultados?temporada=2026-27"')
    expect(html).toMatch(/aria-current="(page|true)"[^>]*>[^<]*2025-26|2025-26[\s\S]*aria-current/)
  })
  it('com uma temporada só, não desenha nada', () => {
    expect(renderToStaticMarkup(<SeletorTemporada temporadas={['2026-27']} atual="2026-27" hrefDe={(t) => t} />)).toBe('')
  })
})
```

- [ ] **Step 2: Ver falhar** — `npx vitest run src/modules/entrega/retroativo/__tests__/temporada.test.ts src/ui/__tests__/seletor-temporada.test.tsx` → FAIL.

- [ ] **Step 3: Implementar** as duas funções (puras) e o componente, que devolve `null` com menos de
duas temporadas e senão `<Segmentado rotulo="Temporada" opcoes={temporadas.map((t) => ({ valor: t, rotulo: t, href: hrefDe(t), ativo: t === atual }))} compacto />`
(confira os nomes exatos das props em `src/ui/controles.tsx:12`).

- [ ] **Step 4: Ver passar** — mesmo comando, mais `npx vitest run src/ui/__tests__/marca-e-vocabulario.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/entrega/retroativo/temporada.ts src/ui/SeletorTemporada.tsx \
  src/modules/entrega/retroativo/__tests__/temporada.test.ts src/ui/__tests__/seletor-temporada.test.tsx
git commit -m "wip(retroativo): Task 8 — temporada na URL e seletor"
```

---

### Task 9: Resultados e Lista Secreta na temporada anterior

**Files:**
- Create: `src/modules/entrega/retroativo/leitura.ts`
- Modify: `src/features/resultados/carregar.ts`, `src/features/resultados/TelaResultados.tsx`, `src/app/(app)/resultados/**/page.tsx` (repassar `searchParams`)
- Modify: `src/features/lista/carregar.ts`, `src/features/lista/TelaLista.tsx`, `src/app/(app)/page.tsx`
- Test: `src/features/resultados/__tests__/fumaca.test.tsx` (novos casos), `src/features/lista/__tests__/fumaca.test.tsx` (novos casos), `src/modules/entrega/retroativo/__tests__/leitura.test.ts`

**Interfaces:**
- Consumes: tabelas (Task 2); `JogadorConferido`, `RecapDaNoite`, `GreenDoDia` de `src/modules/entrega/resultados.ts`; Task 8.
- Produces (em `leitura.ts`):
  - `recapRetroativo(db: Db, dataReferencia: string): Promise<RecapDaNoite>` — mesma forma de `recapDaNoite`, lendo `apitos_retroativos` (LISTA_SECRETA) + `estatisticas_jogo` para `valor`/`bateu`, com a mesma regra de participação (`entrouEmQuadra`) e o mesmo agrupamento por jogo; `noiteEncerrada: true`.
  - `greensRetroativosDoDia(db, dataReferencia): Promise<GreenDoDia[]>` e `fireLiveRetroativo(db, dataReferencia)` com a forma de `conferirFireLive`.
  - `feedRetroativoDoDia(db, dataReferencia): Promise<ConteudoFeed | null>`.
  - `datasRetroativas(db, temporada): Promise<string[]>` — datas com apito ou feed na temporada, em ordem (navegação das setas).

Para não duplicar a conferência, **extraia** de `src/modules/entrega/resultados.ts` a parte de
`conferirRodadas` que transforma linhas (apito + box) em `JogadorConferido` para uma função
exportada `conferirLinhas(linhas: LinhaApitoComBox[]): JogadorConferido[]` e use-a nos dois lados.
Os testes existentes de Resultados precisam continuar verdes sem mudar asserção.

Regras de tela:
- `carregarResultados` e `carregarLista` leem `temporada = temporadaDaUrl(params.temporada, { exibida, disponiveis })`.
- **Temporada anterior:** depois de `exigirNivel('GRATIS', …)` (login continua exigido), **não** aplica corte nem portão de plano (decisão 6); lê só de `leitura.ts`; mostra `SeletorTemporada` e a faixa "A metodologia NIP aplicada à temporada passada. Nenhum destes apitos foi publicado na época."
- **Temporada do calendário:** exatamente o caminho de hoje, incluindo o portão `atende(acesso.nivel,'MVP')` da Lista e o corte do grátis em Resultados.
- Resultados: a rota `/resultados/[data]` aceita data de temporada anterior; as setas usam `datasRetroativas`; sem `?temporada=`, uma data de temporada anterior implica a temporada dela.
- Lista: em temporada anterior aceita `?data=` (validada: tem de estar em `datasRetroativas`, senão a primeira data disponível); cada card linka `/resultados/<data>?temporada=<t>`; sem pílula de odd.

- [ ] **Step 1: Testes que falham** — nas fumaças (PGlite, harness existente de cada área), semeie um
dia de temporada anterior com `executarDiaRetroativo` (Task 5) e acrescente:

```ts
it('temporada anterior: o grátis vê os apitos em Resultados, com o veredito', async () => {
  const html = await renderizarComo('GRATIS', `/resultados/${DIA_ANTERIOR}`, { temporada: TEMPORADA_ANTERIOR })
  expect(html).toContain(NOME_DO_APITADO)
  expect(html).toMatch(/Bateu|Não bateu/)
  expect(html).toContain('aplicada à temporada passada')
})
it('temporada anterior: o grátis vê a Lista do dia', async () => {
  const html = await renderizarListaComo('GRATIS', { temporada: TEMPORADA_ANTERIOR, data: DIA_ANTERIOR })
  expect(html).toContain(NOME_DO_APITADO)
})
it('temporada do calendário na URL NÃO abre a Lista paga para o grátis', async () => {
  const html = await renderizarListaComo('GRATIS', { temporada: TEMPORADA_DO_CALENDARIO })
  for (const id of JOGADORES_DO_FEED_DE_HOJE) expect(html).not.toContain(id)
})
it('?temporada=lixo cai na exibida sem erro', async () => {
  await expect(renderizarComo('MVP', '/resultados', { temporada: 'lixo' })).resolves.toBeTruthy()
})
```

(Use os helpers de render que cada fumaça já tem; `renderizarComo`/`renderizarListaComo` acima são
os nomes a criar como finos wrappers dos existentes se não houver equivalente.)

Em `leitura.test.ts`: `recapRetroativo` confere igual a `recapDaNoite` para os mesmos números
(semeie o mesmo apito nas duas tabelas e compare `bateram`, `conferidos`, `porJogo[0].cards[0].valor`).

- [ ] **Step 2: Ver falhar** — rode os três arquivos → FAIL.

- [ ] **Step 3: Implementar** `leitura.ts`, a extração de `conferirLinhas`, e a ligação nas duas telas.

- [ ] **Step 4: Ver passar** — rode os três arquivos e `src/app/__tests__/paywall.test.ts`, `src/modules/entrega/__tests__/resultados*.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/entrega/retroativo/leitura.ts src/modules/entrega/resultados.ts \
  src/features/resultados/ src/features/lista/ "src/app/(app)/resultados" "src/app/(app)/page.tsx" \
  src/modules/entrega/retroativo/__tests__/leitura.test.ts
git commit -m "wip(retroativo): Task 9 — Resultados e Lista na temporada anterior"
```

---

### Task 10: Estatísticas na temporada anterior

**Files:**
- Modify: `src/modules/entrega/estatisticas/jogador.ts` (`apitosDoJogador`), `src/modules/entrega/estatisticas/time.ts` (`hierarquiaDoTime`, `telaDoTime`)
- Modify: `src/features/estatisticas/{indice,jogador,time}.ts` e as telas correspondentes
- Test: `src/features/estatisticas/__tests__/fumaca.test.tsx` (novos casos)

**Interfaces:**
- Consumes: Tasks 2, 3, 8.
- Produces:
  - `apitosDoJogador(db, jogadorId, limite, opcoes?: { temporadaAnterior?: string })` — com a opção, lê `apitos_retroativos` daquela temporada (mesmo tipo de retorno `ApitoDoJogador[]`).
  - `hierarquiaDoTime(db, timeId, atributo, jogoId, opcoes?: { temporadaAnterior?: { temporada: string; data: string } })` — com a opção, monta a hierarquia com `timeNaData` + `ordenarHierarquia` (Task 3) sobre `estatisticas_jogo.time_id` até `data` (último dia da temporada se não houver `?data=`), mesmo tipo `LinhaHierarquia[]`, sem `fora`.

Regras:
- As três telas leem `temporadaDaUrl`; hoje elas já usam `temporadaParaExibirCacheada` — a URL passa a poder trocar a temporada **dentro das disponíveis**.
- Em temporada anterior: `profundidade` liberada para todos (decisão 6) — o "Jogo a jogo", "Números completos" e "Apitos da estratégia" aparecem para o grátis; em 2026-27, a régua de hoje.
- `SeletorTemporada` no topo do índice, do jogador e do time; os links internos (jogador ↔ time ↔ jogo) carregam `?temporada=`.
- `exigirCookieDeSessao` continua antes de qualquer consulta (I3).

- [ ] **Step 1: Testes que falham** na fumaça de Estatísticas:

```ts
beforeEach(async () => {
  await semearTemporadaAnterior(db)            // helper do teste: times, lista do CJ, jogos ENCERRADOS de 2025-26
  await executarDiaRetroativo(db, ruleset, DIA_ANTERIOR)
})
it('jogador na temporada anterior: grátis vê "Apitos da estratégia" com os retroativos', async () => {
  const html = await renderizarJogadorComo('GRATIS', GIANNIS, { temporada: TEMPORADA_ANTERIOR })
  expect(html).toContain('Apitos da estratégia')
  expect(html).toContain(DIA_ANTERIOR_EXIBIDO)        // a data do apito retroativo, como a tela formata
})
it('time na temporada anterior: Hierarquia NIP com o time REAL (Giannis no MIL)', async () => {
  const html = await renderizarTimeComo('GRATIS', TIME_MIL, { temporada: TEMPORADA_ANTERIOR })
  expect(html).toContain(NOME_GIANNIS)
  expect(html.indexOf(NOME_GIANNIS)).toBeLessThan(html.indexOf(NOME_ALL_STAR_DO_MIL))
})
it('temporada do calendário: grátis continua sem a profundidade', async () => {
  const html = await renderizarJogadorComo('GRATIS', GIANNIS, { temporada: TEMPORADA_DO_CALENDARIO })
  expect(html).not.toContain('Apitos da estratégia')
})
it('links internos preservam ?temporada=', async () => {
  const html = await renderizarJogadorComo('GRATIS', GIANNIS, { temporada: TEMPORADA_ANTERIOR })
  expect(html).toMatch(/href="\/estatisticas\/(jogo|time)\/[^"]*temporada=2025-26/)
})
```

`renderizarJogadorComo`/`renderizarTimeComo` são wrappers finos dos helpers de render que a fumaça
de Estatísticas já tem (mesma sessão simulada, mesmos mocks), acrescentando `searchParams`.

- [ ] **Step 2: Ver falhar** → FAIL. **Step 3: Implementar.** **Step 4: Ver passar** (fumaça de
Estatísticas + `estatisticas-url-invalida.test.ts` + `guarda-cookie.test.ts`) → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/entrega/estatisticas/ src/features/estatisticas/ "src/app/(app)/estatisticas"
git commit -m "wip(retroativo): Task 10 — Estatísticas na temporada anterior"
```

---

### Task 11: Guardas — o que nunca lê a temporada anterior

**Files:**
- Test: `src/modules/entrega/retroativo/__tests__/fronteiras.test.ts`

- [ ] **Step 1: Escrever o teste** (teste de fonte, padrão do repositório):

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : arquivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

const PROIBIDOS = [
  'src/features/landing', 'src/features/ao-vivo', 'src/app/(publico)/placar', 'src/app/(publico)/conheca',
  'src/app/_cache/placar.ts', 'src/app/_cache/landing.ts', 'src/modules/entrega/push', 'src/modules/entrega/fila',
  'src/modules/entrega/fire-live', 'src/app/api/cron',
]

describe('a temporada anterior não vaza para o que é público ou publica', () => {
  for (const alvo of PROIBIDOS) {
    it(alvo, () => {
      const lista = statSync(alvo).isDirectory() ? arquivos(alvo) : [alvo]
      for (const f of lista) {
        const fonte = readFileSync(f, 'utf8')
        expect(fonte, f).not.toMatch(/apitosRetroativos|greensRetroativos|feedRetroativo|entrega\/retroativo/)
      }
    })
  }
})
```

- [ ] **Step 2: Rodar** — `npx vitest run src/modules/entrega/retroativo/__tests__/fronteiras.test.ts` → PASS (se falhar, a violação é real: corrija o import, não o teste).

- [ ] **Step 3: Commit**

```bash
git add src/modules/entrega/retroativo/__tests__/fronteiras.test.ts
git commit -m "wip(retroativo): Task 11 — guardas de fronteira"
```

---

### Task 12: Runbook, bateria e commit único

**Files:**
- Modify: `docs/runbooks/temporada-retroativa.md`
- Modify: `docs/superpowers/specs/2026-09-25-motor-temporada-anterior-design.md` (§9 Registro)
- Modify: `docs/superpowers/specs/2026-09-22-temporada-retroativa-design.md` (nota: decisão 1 revogada em 25/09, com link)

- [ ] **Step 1: Runbook** — reescreva a ordem para: (1) GOAT e reteste `/stats?period=1`;
(2) `npm run lista-cj:backup` e guardar o arquivo fora do repo também; (3) desligar
`DEMO_AUTOSSEMEADURA`; (4) `BALLDONTLIE_API_KEY` + `NBA_INGESTAO_HABILITADA=true`;
(5) **`npm run db:migrate` (0033–0034) antes do deploy**; (6) backfill dry-run e 3 dias;
(7) `demo:limpar --confirmar`; (8) backfill completo; (9) `npm run lista-cj:restaurar -- --arquivo=…`,
confirmar pendentes em `/admin/mapeamento`, restaurar de novo; (10) `npm run motor:retroativo -- --de=… --ate=…`
(primeiro `--dry-run`); (11) conferência: `select date_trunc('month', data_referencia), count(*) from apitos_retroativos group by 1`,
um dia em Resultados com `?temporada=`, um jogador conhecido em Estatísticas. Mantenha as seções "Como desligar" e "O que este runbook não faz".

- [ ] **Step 2: Bateria** — `npm run typecheck`, `npm run lint`, `npm run boundaries`; a suíte em
lotes de 12 (`git ls-files 'src/**/*.test.ts' 'src/**/*.test.tsx'` dividido em lotes, conferindo o
disco entre eles); `next build` com `DATABASE_URL=postgres://x:y@127.0.0.1:1/db DATABASE_URL_UNPOOLED=postgres://x:y@127.0.0.1:1/db`.
Todos verdes; os 15 testes-âncora sem edição (`git diff <base> -- src/modules/motor` vazio).

- [ ] **Step 3: §9 da spec** — registro: desvios do plano, testes novos, o que ficou para depois.

- [ ] **Step 4: Squash**

```bash
git reset --soft <base>
git add <todos os arquivos das Tasks 1–12, um a um; nada de scripts/_*, referencias/, .superpowers/, backups/>
git commit -m "feat(retroativo): motor NIP na temporada anterior, com filtro de temporada"
```

- [ ] **Step 5: Revisão final** com `superpowers:requesting-code-review`. Sem push, sem merge, sem migração em produção.

---

## Ordem e dependências

1 → 2 → 3 → 4 → 5 → 6 → (7 independente, pode ir em paralelo depois da 2) → 8 → 9 → 10 → 11 → 12.
