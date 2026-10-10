# Comparação de jogadores e de times — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uma tela `/estatisticas/comparar` que põe dois jogadores, ou dois times, lado a lado com
os mesmos números das páginas de cada um, mais os jogos entre os dois times.

**Architecture:** a comparação não calcula nada novo: chama `telaDoJogador`/`telaDoTime` duas
vezes, em paralelo, e monta a tela. A única fonte nova é `boxDoTimePorJogo`, que soma o box dos
jogadores por (jogo, time) porque `estatisticas_time_jogo` está vazia em produção, e a página do
time passa a usá-la também. O portão é o das estatísticas: profundidade = temporada anterior ou
MVP.

**Tech Stack:** Next.js 16 App Router (server components), React 19, Drizzle/Postgres, Vitest +
PGlite (`bancoDeTeste()`), CSS Modules com tokens de `src/ui/tokens.css`.

**Spec:** `docs/superpowers/specs/2026-10-09-comparacao-de-jogadores-e-times-design.md`

## Global Constraints

- Nenhuma regra de estratégia, apito ou nível NIP na comparação (spec §1); nenhum texto com
  "probabilidade" (o teste `src/ui/__tests__/marca-e-vocabulario.test.ts` varre `src/features`).
- Cores e fontes só por tokens de `src/ui/tokens.css`; nenhum hex em CSS Module novo.
- Telas (`src/features`) não importam de `src/modules/motor` (regra do depcruise
  `tela-v2-nao-chama-o-motor`); rodar `npx depcruise src --config .dependency-cruiser.cjs`.
- Ordem dos portões como nas páginas: UUID → `exigirCookieDeSessao` → banco (404 antes de avaliar
  acesso) → `exigirNivel('GRATIS', rota)`.
- `.env.local` é PRODUÇÃO: nunca rodar script com ele. Testes só no PGlite.
- Commit único no fim, pelo parceiro (regra do projeto "commitar só no final"); os passos de commit
  abaixo são o ponto de parada de cada tarefa, não um `git commit`.
- A suíte inteira roda em lotes de 12 arquivos com `--maxWorkers=1` (disco apertado), nunca de
  uma vez.

## Review Focus

1. Jogador sem nenhum jogo na temporada escolhida (acabou de chegar, ou 2025-26 para um novato):
   a tela mostra "Nenhuma partida disponível neste recorte" dos dois lados e não divide por zero →
   teste na Tarefa 5.
2. Time com jogo de hoje ainda AO VIVO: as médias usam só jogos encerrados, e o jogo em andamento
   não entra no saldo de confrontos → teste na Tarefa 2 e na Tarefa 4.
3. Grátis na temporada atual com um `b` pago na URL: nenhum número de `perfilNumeros`,
   `historico` ou `jogosDoTime` pode chegar ao HTML (a silhueta cobre os dois lados) → teste na
   Tarefa 5.
4. `a` e `b` em ordem trocada: a tela é a mesma espelhada, e o destaque continua certo (quem é
   melhor não depende da coluna) → teste na Tarefa 5.
5. Jogador que trocou de time no meio da temporada: as médias são as dele, não do time; o
   cabeçalho mostra o time atual do provedor, como a página faz → teste na Tarefa 4.

---

### Task 1: `boxDoTimePorJogo` — o box do time somado dos jogadores

**Files:**
- Create: `src/modules/entrega/estatisticas/box-do-time.ts`
- Modify: `src/modules/entrega/estatisticas/time.ts:140-170` (troca a leitura de
  `estatisticasTimeJogo` pela função nova)
- Test: `src/modules/entrega/estatisticas/__tests__/box-do-time.test.ts`

**Interfaces:**
- Consumes: `estatisticasJogo`, `estatisticasQuarto`, `jogos` de `src/modules/dominio/db/schema`;
  `percentual` de `./numeros`; `QuebraPorQuarto` de `./time.ts`.
- Produces:
  ```ts
  export type BoxDoTime = {
    jogoId: string
    timeId: string
    pontos: number
    porQuarto: { q1: number; q2: number; q3: number; q4: number; prorrogacao: number }
    rebotesTotal: number
    assistencias: number
    cestasC: number
    cestasT: number
    tresC: number
    tresT: number
    turnovers: number
  }
  export async function boxDoTimePorJogo(db: Db, idsJogo: string[]): Promise<Map<string, BoxDoTime>>
  // chave do Map: `${jogoId}|${timeId}`
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/modules/entrega/estatisticas/__tests__/box-do-time.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import {
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  jogadores,
  jogos,
  times,
} from '../../../dominio/db/schema'
import { boxDoTimePorJogo } from '../box-do-time'

/**
 * A BallDontLie não tem box de time: `estatisticas_time_jogo` ficou com 0
 * linhas em produção (09/10/2026). O box do time é a SOMA do box dos
 * jogadores, por (jogo, time em que atuaram).
 */
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
const id: Record<string, string> = {}

beforeAll(async () => {
  banco = await bancoDeTeste()
  for (const sigla of ['AAA', 'BBB']) {
    const [t] = await banco.db.insert(times).values({ sigla, nome: sigla }).returning()
    id[sigla] = t!.id
  }
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataReferencia: '2025-11-01',
      dataHoraUtc: new Date('2025-11-01T23:00:00Z'),
      timeCasaId: id.AAA!,
      timeVisitanteId: id.BBB!,
      status: 'ENCERRADO',
      placarCasa: 101,
      placarVisitante: 90,
    })
    .returning()
  id.jogo = jogo!.id
  // Dois jogadores do AAA, um do BBB e um SEM time_id (linha anterior à 0033).
  const [a1, a2, b1, semTime] = await banco.db
    .insert(jogadores)
    .values([
      { nomeCompleto: 'A Um', timeId: id.AAA! },
      { nomeCompleto: 'A Dois', timeId: id.AAA! },
      { nomeCompleto: 'B Um', timeId: id.BBB! },
      { nomeCompleto: 'Sem Time', timeId: null },
    ])
    .returning()
  await banco.db.insert(estatisticasJogo).values([
    { jogoId: id.jogo!, jogadorId: a1!.id, timeId: id.AAA!, pontos: 60, rebotesTotal: 20, assistencias: 10, cestasC: 20, cestasT: 40, tresC: 5, tresT: 10, turnovers: 3 },
    { jogoId: id.jogo!, jogadorId: a2!.id, timeId: id.AAA!, pontos: 41, rebotesTotal: 25, assistencias: 12, cestasC: 15, cestasT: 30, tresC: 3, tresT: 12, turnovers: 4 },
    { jogoId: id.jogo!, jogadorId: b1!.id, timeId: id.BBB!, pontos: 90, rebotesTotal: 40, assistencias: 20, cestasC: 35, cestasT: 80, tresC: 10, tresT: 30, turnovers: 9 },
    { jogoId: id.jogo!, jogadorId: semTime!.id, timeId: null, pontos: 999, rebotesTotal: 0, assistencias: 0, cestasC: 0, cestasT: 0, tresC: 0, tresT: 0, turnovers: 0 },
  ])
  await banco.db.insert(estatisticasQuarto).values([
    { jogoId: id.jogo!, jogadorId: a1!.id, quarto: 1, pontos: 30, rebotes: 0, assistencias: 0 },
    { jogoId: id.jogo!, jogadorId: a1!.id, quarto: 2, pontos: 30, rebotes: 0, assistencias: 0 },
    { jogoId: id.jogo!, jogadorId: a2!.id, quarto: 3, pontos: 21, rebotes: 0, assistencias: 0 },
    { jogoId: id.jogo!, jogadorId: a2!.id, quarto: 4, pontos: 20, rebotes: 0, assistencias: 0 },
  ])
  // A tabela de time fica VAZIA, como em produção.
  expect(await banco.db.select().from(estatisticasTimeJogo)).toHaveLength(0)
})
afterAll(async () => banco.fechar())

describe('boxDoTimePorJogo', () => {
  it('soma o box dos jogadores por (jogo, time), com os pontos por quarto', async () => {
    const mapa = await boxDoTimePorJogo(banco.db, [id.jogo!])
    expect(mapa.get(`${id.jogo}|${id.AAA}`)).toEqual({
      jogoId: id.jogo,
      timeId: id.AAA,
      pontos: 101,
      porQuarto: { q1: 30, q2: 30, q3: 21, q4: 20, prorrogacao: 0 },
      rebotesTotal: 45,
      assistencias: 22,
      cestasC: 35,
      cestasT: 70,
      tresC: 8,
      tresT: 22,
      turnovers: 7,
    })
    expect(mapa.get(`${id.jogo}|${id.BBB}`)?.pontos).toBe(90)
  })

  it('jogador sem time_id não entra em time nenhum', async () => {
    const mapa = await boxDoTimePorJogo(banco.db, [id.jogo!])
    expect([...mapa.values()].map((b) => b.pontos).sort()).toEqual([101, 90].sort())
  })

  it('sem ids, devolve um Map vazio sem ir ao banco', async () => {
    expect((await boxDoTimePorJogo(banco.db, [])).size).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/box-do-time.test.ts`
Expected: FAIL — `Cannot find module '../box-do-time'`.

- [ ] **Step 3: Implementar a função**

```ts
// src/modules/entrega/estatisticas/box-do-time.ts
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { estatisticasJogo, estatisticasQuarto } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * O BOX DO TIME É A SOMA DO BOX DOS JOGADORES.
 *
 * `estatisticas_time_jogo` não serve de fonte: a BallDontLie não tem box de
 * time e a tabela ficou com 0 linhas em produção (09/10/2026) — a página do
 * time mostrava "box do time ainda não chegou" em todos os jogos. Soma-se
 * `estatisticas_jogo` por (jogo, `time_id` em que o jogador atuou), e os
 * pontos por quarto vêm de `estatisticas_quarto` pelo mesmo vínculo.
 *
 * Linha de jogador sem `time_id` (anterior à 0033) fica de fora: não se sabe
 * de que lado ela estava, e somá-la num lado qualquer inventaria número.
 */
export type BoxDoTime = {
  jogoId: string
  timeId: string
  pontos: number
  porQuarto: { q1: number; q2: number; q3: number; q4: number; prorrogacao: number }
  rebotesTotal: number
  assistencias: number
  cestasC: number
  cestasT: number
  tresC: number
  tresT: number
  turnovers: number
}

export const chaveDoBox = (jogoId: string, timeId: string): string => `${jogoId}|${timeId}`

export async function boxDoTimePorJogo(db: Db, idsJogo: string[]): Promise<Map<string, BoxDoTime>> {
  if (idsJogo.length === 0) return new Map()

  const soma = (coluna: Parameters<typeof sql>[0]) => sql<number>`coalesce(sum(${coluna}), 0)::int`
  const [totais, quartos] = await Promise.all([
    db
      .select({
        jogoId: estatisticasJogo.jogoId,
        timeId: estatisticasJogo.timeId,
        pontos: soma(estatisticasJogo.pontos),
        rebotesTotal: soma(estatisticasJogo.rebotesTotal),
        assistencias: soma(estatisticasJogo.assistencias),
        cestasC: soma(estatisticasJogo.cestasC),
        cestasT: soma(estatisticasJogo.cestasT),
        tresC: soma(estatisticasJogo.tresC),
        tresT: soma(estatisticasJogo.tresT),
        turnovers: soma(estatisticasJogo.turnovers),
      })
      .from(estatisticasJogo)
      .where(and(inArray(estatisticasJogo.jogoId, idsJogo), isNotNull(estatisticasJogo.timeId)))
      .groupBy(estatisticasJogo.jogoId, estatisticasJogo.timeId),
    // O quarto é por jogador; o time vem da linha de jogo do MESMO jogador.
    db
      .select({
        jogoId: estatisticasQuarto.jogoId,
        timeId: estatisticasJogo.timeId,
        quarto: estatisticasQuarto.quarto,
        pontos: soma(estatisticasQuarto.pontos),
      })
      .from(estatisticasQuarto)
      .innerJoin(
        estatisticasJogo,
        and(
          eq(estatisticasJogo.jogoId, estatisticasQuarto.jogoId),
          eq(estatisticasJogo.jogadorId, estatisticasQuarto.jogadorId),
        ),
      )
      .where(and(inArray(estatisticasQuarto.jogoId, idsJogo), isNotNull(estatisticasJogo.timeId)))
      .groupBy(estatisticasQuarto.jogoId, estatisticasJogo.timeId, estatisticasQuarto.quarto),
  ])

  const mapa = new Map<string, BoxDoTime>()
  for (const t of totais) {
    mapa.set(chaveDoBox(t.jogoId, t.timeId!), {
      jogoId: t.jogoId,
      timeId: t.timeId!,
      pontos: t.pontos,
      porQuarto: { q1: 0, q2: 0, q3: 0, q4: 0, prorrogacao: 0 },
      rebotesTotal: t.rebotesTotal,
      assistencias: t.assistencias,
      cestasC: t.cestasC,
      cestasT: t.cestasT,
      tresC: t.tresC,
      tresT: t.tresT,
      turnovers: t.turnovers,
    })
  }
  for (const q of quartos) {
    const box = mapa.get(chaveDoBox(q.jogoId, q.timeId!))
    if (!box) continue
    // 1..4 são os quartos; qualquer número acima é prorrogação.
    if (q.quarto === 1) box.porQuarto.q1 += q.pontos
    else if (q.quarto === 2) box.porQuarto.q2 += q.pontos
    else if (q.quarto === 3) box.porQuarto.q3 += q.pontos
    else if (q.quarto === 4) box.porQuarto.q4 += q.pontos
    else box.porQuarto.prorrogacao += q.pontos
  }
  return mapa
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/box-do-time.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Escrever o teste da página do time com a tabela de time vazia**

Acrescente em `src/modules/entrega/estatisticas/__tests__/box-do-time.test.ts`:

```ts
import { telaDoTime } from '../time'

describe('telaDoTime lê o box somado dos jogadores', () => {
  it('com estatisticas_time_jogo vazia, o jogo traz nosso/deles, FG%, 3P%, REB, AST e TO', async () => {
    const tela = await telaDoTime(banco.db, id.AAA!, { temporada: '2025-26' })
    const [jogo] = tela!.jogosDoTime
    expect(jogo).toMatchObject({
      nosso: { q1: 30, q2: 30, q3: 21, q4: 20, prorrogacao: 0, total: 101 },
      deles: { total: 90 },
      fgPercentual: 50,
      rebotesTotal: 45,
      assistencias: 22,
      turnovers: 7,
    })
    expect(jogo!.tresPercentual).toBeCloseTo(36.4, 1)
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/box-do-time.test.ts`
Expected: FAIL — `nosso` é `null`.

- [ ] **Step 7: Trocar a fonte em `telaDoTime`**

Em `src/modules/entrega/estatisticas/time.ts`:

```ts
import { boxDoTimePorJogo, chaveDoBox } from './box-do-time'
// ...dentro de telaDoTime, no lugar do Promise.all que lia estatisticasTimeJogo:
const [boxes, listaTimes] = await Promise.all([
  boxDoTimePorJogo(db, idsJogo),
  db.select().from(times),
])
// ...e no map das partidas:
const nosso = boxes.get(chaveDoBox(jogo.id, timeId))
const deles = boxes.get(chaveDoBox(jogo.id, adversarioId))
// `quebra` passa a receber o BoxDoTime:
nosso: nosso ? quebraDoBox(nosso) : null,
deles: deles ? quebraDoBox(deles) : null,
fgPercentual: nosso ? percentual(nosso.cestasC, nosso.cestasT) : null,
tresPercentual: nosso ? percentual(nosso.tresC, nosso.tresT) : null,
rebotesTotal: nosso?.rebotesTotal ?? null,
assistencias: nosso?.assistencias ?? null,
turnovers: nosso?.turnovers ?? null,
```

e substitua a função `quebra` por:

```ts
function quebraDoBox(b: BoxDoTime): QuebraPorQuarto {
  return { ...b.porQuarto, total: b.pontos }
}
```

Remova o import de `estatisticasTimeJogo` de `time.ts`. Atualize o comentário de
`BoxScoreDoJogo.nosso` (linhas 45-52): "NULL quando nenhum jogador do time tem linha com
`time_id` neste jogo".

- [ ] **Step 8: Rodar os testes do time e o typecheck**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/box-do-time.test.ts src/features/estatisticas/__tests__/fumaca.test.tsx --maxWorkers=1 && npx tsc --noEmit -p .`
Expected: PASS; o fumaça do time continua passando porque a demo grava `time_id` desde 09/10
(`src/modules/ingestao/demo/temporada.ts`).

- [ ] **Step 9: Ponto de parada da tarefa** (sem commit; o parceiro commita no fim)

---

### Task 2: `confrontosEntre` — os jogos entre dois times na temporada

**Files:**
- Create: `src/modules/entrega/estatisticas/confrontos.ts`
- Test: `src/modules/entrega/estatisticas/__tests__/confrontos.test.ts`

**Interfaces:**
- Consumes: `jogos`, `times` do schema; `ConfrontoAnterior` de `./jogo.ts`; `intervaloDaTemporada`
  de `src/modules/entrega/estatisticas/temporadas.ts:189` (é o que `src/features/estatisticas/time.ts` já usa).
- Produces:
  ```ts
  export type Confrontos = { jogos: ConfrontoAnterior[]; vitoriasA: number; vitoriasB: number }
  export async function confrontosEntre(
    db: Db,
    timeA: string,
    timeB: string,
    periodo: { de: string; ate: string },
  ): Promise<Confrontos>
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/modules/entrega/estatisticas/__tests__/confrontos.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { jogos, times } from '../../../dominio/db/schema'
import { confrontosEntre } from '../confrontos'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
const id: Record<string, string> = {}
const PERIODO = { de: '2025-10-01', ate: '2026-06-30' }

beforeAll(async () => {
  banco = await bancoDeTeste()
  for (const sigla of ['AAA', 'BBB', 'CCC']) {
    const [t] = await banco.db.insert(times).values({ sigla, nome: sigla }).returning()
    id[sigla] = t!.id
  }
  const partidas: [string, string, string, number | null, number | null, 'ENCERRADO' | 'AO_VIVO'][] = [
    ['2025-11-01', 'AAA', 'BBB', 100, 90, 'ENCERRADO'], // A vence
    ['2025-12-01', 'BBB', 'AAA', 95, 80, 'ENCERRADO'], // B vence
    ['2026-01-01', 'AAA', 'BBB', 110, 105, 'ENCERRADO'], // A vence
    ['2025-11-15', 'AAA', 'CCC', 120, 70, 'ENCERRADO'], // outro adversário: fora
    ['2025-06-01', 'AAA', 'BBB', 99, 98, 'ENCERRADO'], // temporada anterior: fora
    ['2026-02-01', 'BBB', 'AAA', 20, 18, 'AO_VIVO'], // em andamento: fora
  ]
  for (const [data, casa, fora, pc, pv, status] of partidas) {
    await banco.db.insert(jogos).values({
      dataReferencia: data,
      dataHoraUtc: new Date(`${data}T23:00:00Z`),
      timeCasaId: id[casa]!,
      timeVisitanteId: id[fora]!,
      placarCasa: pc,
      placarVisitante: pv,
      status,
    })
  }
})
afterAll(async () => banco.fechar())

describe('confrontosEntre', () => {
  it('só os jogos ENCERRADOS entre os dois, na temporada, do mais recente ao mais antigo', async () => {
    const c = await confrontosEntre(banco.db, id.AAA!, id.BBB!, PERIODO)
    expect(c.jogos.map((j) => `${j.siglaCasa} ${j.placarCasa}-${j.placarVisitante} ${j.siglaVisitante}`)).toEqual([
      'AAA 110-105 BBB',
      'BBB 95-80 AAA',
      'AAA 100-90 BBB',
    ])
    expect(c).toMatchObject({ vitoriasA: 2, vitoriasB: 1 })
  })

  it('a ordem de A e B só troca o lado do saldo', async () => {
    const c = await confrontosEntre(banco.db, id.BBB!, id.AAA!, PERIODO)
    expect(c).toMatchObject({ vitoriasA: 1, vitoriasB: 2 })
  })

  it('sem jogo entre os dois, lista vazia e saldo zero', async () => {
    expect(await confrontosEntre(banco.db, id.BBB!, id.CCC!, PERIODO)).toEqual({
      jogos: [],
      vitoriasA: 0,
      vitoriasB: 0,
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/confrontos.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/modules/entrega/estatisticas/confrontos.ts
import { and, desc, eq, gte, inArray, lte, or } from 'drizzle-orm'

import { jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { ConfrontoAnterior } from './jogo'

/**
 * OS JOGOS ENTRE DOIS TIMES na temporada — o "confronto" da comparação.
 *
 * É a mesma pergunta do `h2h` da página do jogo, mas para um par escolhido
 * pelo usuário e sem âncora num jogo: entram só os ENCERRADOS do período,
 * do mais recente ao mais antigo. Jogo em andamento tem placar parcial e não
 * é confronto decidido — fica de fora, como na coluna "Res" da página do time.
 */
export type Confrontos = { jogos: ConfrontoAnterior[]; vitoriasA: number; vitoriasB: number }

export async function confrontosEntre(
  db: Db,
  timeA: string,
  timeB: string,
  periodo: { de: string; ate: string },
): Promise<Confrontos> {
  const [linhas, siglas] = await Promise.all([
    db
      .select()
      .from(jogos)
      .where(
        and(
          eq(jogos.status, 'ENCERRADO'),
          gte(jogos.dataReferencia, periodo.de),
          lte(jogos.dataReferencia, periodo.ate),
          or(
            and(eq(jogos.timeCasaId, timeA), eq(jogos.timeVisitanteId, timeB)),
            and(eq(jogos.timeCasaId, timeB), eq(jogos.timeVisitanteId, timeA)),
          ),
        ),
      )
      .orderBy(desc(jogos.dataHoraUtc)),
    db.select({ id: times.id, sigla: times.sigla }).from(times).where(inArray(times.id, [timeA, timeB])),
  ])
  const sigla = new Map(siglas.map((t) => [t.id, t.sigla] as const))

  let vitoriasA = 0
  let vitoriasB = 0
  const lista: ConfrontoAnterior[] = []
  for (const j of linhas) {
    if (j.placarCasa === null || j.placarVisitante === null) continue
    const vencedor = j.placarCasa > j.placarVisitante ? j.timeCasaId : j.timeVisitanteId
    if (vencedor === timeA) vitoriasA += 1
    else vitoriasB += 1
    lista.push({
      jogoId: j.id,
      data: j.dataHoraUtc,
      placarCasa: j.placarCasa,
      placarVisitante: j.placarVisitante,
      siglaCasa: sigla.get(j.timeCasaId) ?? '—',
      siglaVisitante: sigla.get(j.timeVisitanteId) ?? '—',
    })
  }
  return { jogos: lista, vitoriasA, vitoriasB }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/confrontos.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Ponto de parada da tarefa**

---

### Task 3: `rotaDaComparacao` e o contrato da URL

**Files:**
- Modify: `src/modules/entrega/estatisticas/rotas.ts` (fim do arquivo)
- Test: `src/modules/entrega/estatisticas/__tests__/rotas.test.ts` (crie se não existir; se existir,
  acrescente o `describe`)

**Interfaces:**
- Produces:
  ```ts
  export type TipoDaComparacao = 'jogador' | 'time'
  export function rotaDaComparacao(
    tipo: TipoDaComparacao,
    a: string,
    b?: string,
    contexto?: Pick<ContextoEstatisticas, 'periodo' | 'temporada'>,
  ): string
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest'

import { rotaDaComparacao } from '../rotas'

describe('rotaDaComparacao', () => {
  it('só A: a tela da escolha do segundo', () => {
    expect(rotaDaComparacao('jogador', 'id-a')).toBe('/estatisticas/comparar?tipo=jogador&a=id-a')
  })
  it('A e B com período e temporada escolhidos', () => {
    expect(rotaDaComparacao('time', 'id-a', 'id-b', { periodo: '5', temporada: '2025-26' })).toBe(
      '/estatisticas/comparar?tipo=time&a=id-a&b=id-b&periodo=5&temporada=2025-26',
    )
  })
  it('codifica os ids', () => {
    expect(rotaDaComparacao('jogador', 'a b', 'c&d')).toContain('a=a%20b&b=c%26d')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/rotas.test.ts`
Expected: FAIL — `rotaDaComparacao` não exportada.

- [ ] **Step 3: Implementar**

Acrescente ao fim de `src/modules/entrega/estatisticas/rotas.ts`:

```ts
export type TipoDaComparacao = 'jogador' | 'time'

/**
 * A comparação lado a lado. Sem `b`, é a tela de ESCOLHA do segundo — é
 * para lá que o botão "Comparar com…" das páginas aponta. `periodo` e
 * `temporada` viajam só quando escolhidos, como nas outras rotas da aba.
 */
export function rotaDaComparacao(
  tipo: TipoDaComparacao,
  a: string,
  b?: string,
  contexto?: Pick<ContextoEstatisticas, 'periodo' | 'temporada'>,
): string {
  const params = new URLSearchParams({ tipo, a })
  if (b !== undefined) params.set('b', b)
  if (contexto?.periodo !== undefined) params.set('periodo', contexto.periodo)
  if (contexto?.temporada !== undefined) params.set('temporada', contexto.temporada)
  return `${BASE_ESTATISTICAS}/comparar?${params.toString()}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/rotas.test.ts`
Expected: PASS.

- [ ] **Step 5: Ponto de parada da tarefa**

---

### Task 4: `carregarComparacao` — o carregador da tela

**Files:**
- Create: `src/features/estatisticas/comparar.ts`
- Test: `src/features/estatisticas/__tests__/comparar.test.ts`

**Interfaces:**
- Consumes: `telaDoJogador` (`src/modules/entrega/estatisticas/jogador.ts:378`), `telaDoTime`
  (`time.ts:102`), `confrontosEntre` (Tarefa 2), `buscar` (`busca.ts:75`, com
  `{ apenas: 'JOGADOR' | 'TIME', limite: 8 }`), `temporadaDasEstatisticas`
  (`src/features/estatisticas/temporada.ts:40`), `contextoEstatisticas` (`rotas.ts`),
  `exigirCookieDeSessao`/`exigirNivel`/`atende` (`src/modules/plataforma/assinatura/guarda.ts`),
  `intervaloDaTemporada` (`src/modules/entrega/estatisticas/temporadas.ts:189`, como em `src/features/estatisticas/time.ts`).
- Produces:
  ```ts
  export type LadoJogador = { tela: TelaJogador }
  export type LadoTime = { tela: TelaTime; medias: MediasDoTime }
  export type MediasDoTime = {
    jogos: number
    pontosMarcados: number | null
    pontosCedidos: number | null
    rebotes: number | null
    assistencias: number | null
    tresTentadas: number | null
    tresConvertidas: number | null
    erros: number | null
  }
  export type DadosDaComparacao =
    | { modo: 'escolha'; tipo: TipoDaComparacao; a: LadoJogador | LadoTime; termo: string; resultados: ResultadoBusca[]; temporada: string; seletor: TemporadaDasEstatisticas; fuso: string; fusoDia: string }
    | { modo: 'comparacao'; tipo: 'jogador'; a: LadoJogador; b: LadoJogador; contexto: ContextoEstatisticas; temporada: string; seletor: TemporadaDasEstatisticas; fuso: string; fusoDia: string; agora: Date; profundidade: boolean }
    | { modo: 'comparacao'; tipo: 'time'; a: LadoTime; b: LadoTime; confrontos: Confrontos; temporada: string; seletor: TemporadaDasEstatisticas; fuso: string; fusoDia: string; agora: Date; profundidade: boolean }
  export function mediasDoTime(jogos: BoxScoreDoJogo[]): MediasDoTime   // pura
  export async function carregarComparacao(params: Params): Promise<DadosDaComparacao>
  ```

- [ ] **Step 1: Escrever o teste da função pura `mediasDoTime`**

```ts
// src/features/estatisticas/__tests__/comparar.test.ts
import { describe, expect, it } from 'vitest'

import type { BoxScoreDoJogo } from '@/modules/entrega/estatisticas/time'
import { mediasDoTime } from '../comparar'

const jogo = (p: Partial<BoxScoreDoJogo>): BoxScoreDoJogo => ({
  jogoId: 'x',
  data: new Date('2025-11-01T23:00:00Z'),
  adversarioSigla: 'ADV',
  emCasa: true,
  resultado: 'V',
  placar: '100–90',
  nosso: { q1: 25, q2: 25, q3: 25, q4: 25, prorrogacao: 0, total: 100 },
  deles: { q1: 22, q2: 23, q3: 22, q4: 23, prorrogacao: 0, total: 90 },
  fgPercentual: 50,
  tresPercentual: 40,
  rebotesTotal: 45,
  assistencias: 25,
  turnovers: 12,
  ...p,
})

describe('mediasDoTime', () => {
  it('média por jogo só dos jogos encerrados com box', () => {
    const m = mediasDoTime([
      jogo({ nosso: { q1: 30, q2: 30, q3: 30, q4: 30, prorrogacao: 0, total: 120 }, deles: { q1: 20, q2: 20, q3: 20, q4: 20, prorrogacao: 0, total: 80 }, rebotesTotal: 55, assistencias: 35, turnovers: 10 }),
      jogo({}),
      jogo({ resultado: null, nosso: null, deles: null }), // ao vivo, sem box: fora
    ])
    expect(m).toEqual({
      jogos: 2,
      pontosMarcados: 110,
      pontosCedidos: 85,
      rebotes: 50,
      assistencias: 30,
      tresTentadas: null,
      tresConvertidas: null,
      erros: 11,
    })
  })

  it('sem jogo com box, tudo nulo e zero jogos', () => {
    expect(mediasDoTime([jogo({ nosso: null, deles: null })])).toMatchObject({ jogos: 0, pontosMarcados: null })
  })
})
```

Observação: `BoxScoreDoJogo` não carrega `tresC`/`tresT`; as médias de bolas de 3 ficam `null`
até a Tarefa 1 expor `tresTentadas`/`tresConvertidas` no `BoxScoreDoJogo`. Faça isso agora,
dentro desta tarefa: acrescente `tresTentadas: number | null` e `tresConvertidas: number | null`
ao tipo `BoxScoreDoJogo` em `time.ts`, preenchidos de `nosso?.tresT`/`nosso?.tresC`, e troque o
teste acima para esperar `tresTentadas: 25, tresConvertidas: 10` quando os dois jogos tiverem
`tresTentadas: 25, tresConvertidas: 10`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/features/estatisticas/__tests__/comparar.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o carregador**

```ts
// src/features/estatisticas/comparar.ts
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset } from '@/modules/dominio/temporada'
import { intervaloDaTemporada } from '@/modules/entrega/estatisticas/temporadas'
import { buscar, type ResultadoBusca } from '@/modules/entrega/estatisticas/busca'
import { confrontosEntre, type Confrontos } from '@/modules/entrega/estatisticas/confrontos'
import { telaDoJogador, type TelaJogador } from '@/modules/entrega/estatisticas/jogador'
import {
  contextoEstatisticas,
  rotaDaComparacao,
  type ContextoEstatisticas,
  type TipoDaComparacao,
} from '@/modules/entrega/estatisticas/rotas'
import { telaDoTime, type BoxScoreDoJogo, type TelaTime } from '@/modules/entrega/estatisticas/time'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { atende, exigirCookieDeSessao, exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { temporadaDasEstatisticas, type TemporadaDasEstatisticas } from './temporada'

type Params = Record<string, string | string[] | undefined>

export type MediasDoTime = {
  jogos: number
  pontosMarcados: number | null
  pontosCedidos: number | null
  rebotes: number | null
  assistencias: number | null
  tresTentadas: number | null
  tresConvertidas: number | null
  erros: number | null
}
export type LadoJogador = { tela: TelaJogador }
export type LadoTime = { tela: TelaTime; medias: MediasDoTime }

type Base = {
  temporada: string
  seletor: TemporadaDasEstatisticas
  fuso: string
  fusoDia: string
  agora: Date
}
export type DadosDaComparacao =
  | (Base & { modo: 'escolha'; tipo: TipoDaComparacao; a: LadoJogador | LadoTime; termo: string; resultados: ResultadoBusca[] })
  | (Base & { modo: 'comparacao'; tipo: 'jogador'; a: LadoJogador; b: LadoJogador; contexto: ContextoEstatisticas; profundidade: boolean })
  | (Base & { modo: 'comparacao'; tipo: 'time'; a: LadoTime; b: LadoTime; confrontos: Confrontos; profundidade: boolean })

/** Média por jogo dos jogos com box. Pura: a tela e o teste a chamam sem banco. */
export function mediasDoTime(jogos: BoxScoreDoJogo[]): MediasDoTime {
  const comBox = jogos.filter((j) => j.nosso !== null && j.deles !== null)
  const n = comBox.length
  const media = (f: (j: BoxScoreDoJogo) => number | null): number | null => {
    const valores = comBox.map(f).filter((v): v is number => v !== null)
    return valores.length === 0 ? null : valores.reduce((t, v) => t + v, 0) / valores.length
  }
  return {
    jogos: n,
    pontosMarcados: media((j) => j.nosso!.total),
    pontosCedidos: media((j) => j.deles!.total),
    rebotes: media((j) => j.rebotesTotal),
    assistencias: media((j) => j.assistencias),
    tresTentadas: media((j) => j.tresTentadas),
    tresConvertidas: media((j) => j.tresConvertidas),
    erros: media((j) => j.turnovers),
  }
}

const primeiro = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

/**
 * Portões na ordem das páginas: tipo e UUIDs → cookie → banco (404) → nível.
 * `a === b` é 404: comparar algo consigo mesmo não é uma tela.
 */
export async function carregarComparacao(params: Params): Promise<DadosDaComparacao> {
  const tipo = primeiro(params.tipo)
  if (tipo !== 'jogador' && tipo !== 'time') notFound()
  const a = primeiro(params.a)
  const b = primeiro(params.b)
  if (!a || !z.uuid().safeParse(a).success) notFound()
  if (b !== undefined && (!z.uuid().safeParse(b).success || b === a)) notFound()
  const rota = rotaDaComparacao(tipo, a, b)
  await exigirCookieDeSessao(rota)

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const db = getDb()
  const calendario = calendarioDoRuleset(ruleset)
  const seletor = await temporadaDasEstatisticas(params, ruleset, agora)
  const { temporada } = seletor
  const { temporada: _crua, ...semTemporada } = contextoEstatisticas(params)
  const contexto = seletor.escolhida ? { ...semTemporada, temporada: seletor.escolhida } : semTemporada
  const periodo = seletor.anterior ? intervaloDaTemporada(temporada, calendario) : undefined
  const base = { temporada, seletor, fuso: ruleset.rodada.fuso_exibicao, fusoDia: ruleset.rodada.fuso, agora }

  const lado = async (id: string): Promise<LadoJogador | LadoTime> => {
    if (tipo === 'jogador') {
      const tela = await telaDoJogador(db, id, { temporada, calendario, periodo: contexto.periodo })
      if (tela === null) notFound()
      return { tela }
    }
    const tela = await telaDoTime(db, id, periodo ? { temporada, periodo } : { temporada })
    if (tela === null) notFound()
    return { tela, medias: mediasDoTime(tela.jogosDoTime) }
  }

  if (b === undefined) {
    const ladoA = await lado(a)
    const termo = (primeiro(params.q) ?? '').trim()
    await exigirNivel('GRATIS', rota)
    const resultados = termo.length > 0 ? await buscar(db, termo, { apenas: tipo === 'jogador' ? 'JOGADOR' : 'TIME', limite: 8 }) : []
    return { ...base, modo: 'escolha', tipo, a: ladoA, termo, resultados: resultados.filter((r) => r.id !== a) }
  }

  const [ladoA, ladoB] = await Promise.all([lado(a), lado(b)])
  const { acesso } = await exigirNivel('GRATIS', rota)
  const profundidade = seletor.anterior || atende(acesso.nivel, 'MVP')

  if (tipo === 'jogador') {
    return { ...base, modo: 'comparacao', tipo, a: ladoA as LadoJogador, b: ladoB as LadoJogador, contexto, profundidade }
  }
  const intervalo = periodo ?? intervaloDaTemporada(temporada, calendario)
  const confrontos = profundidade ? await confrontosEntre(db, a, b, intervalo) : { jogos: [], vitoriasA: 0, vitoriasB: 0 }
  return { ...base, modo: 'comparacao', tipo, a: ladoA as LadoTime, b: ladoB as LadoTime, confrontos, profundidade }
}
```

`ResultadoBusca` tem `id`, `nome` e `tipo` (`busca.ts:8-28`): o filtro `r.id !== a` está certo.

- [ ] **Step 4: Rodar o teste puro e o typecheck**

Run: `npx vitest run src/features/estatisticas/__tests__/comparar.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Escrever os testes de integração do carregador (PGlite, temporada simulada)**

Acrescente ao mesmo arquivo um bloco com a MESMA preparação do
`src/features/estatisticas/__tests__/fumaca.test.tsx` (copie os `vi.mock` de `cookies`, `direito`,
`next/cache`, `db/cliente`, `next/navigation` e o `beforeAll` com `simularAte(..., { diasDeHistorico: 21 })`;
o arquivo precisa chamar-se `.test.tsx` se renderizar, aqui basta `.test.ts`), e os casos:

```ts
describe('carregarComparacao', () => {
  it('jogadores: os números de cada lado são os da página do jogador', async () => {
    const [j1, j2] = (await banco.db.select({ id: jogadores.id }).from(jogadores).limit(2)).map((j) => j.id)
    const dados = await carregarComparacao({ tipo: 'jogador', a: j1!, b: j2!, periodo: '5' })
    expect(dados.modo).toBe('comparacao')
    if (dados.modo !== 'comparacao' || dados.tipo !== 'jogador') throw new Error('modo errado')
    const pagina = await carregarJogador(j1!, { periodo: '5' })
    expect(dados.a.tela.perfilNumeros).toEqual(pagina.tela.perfilNumeros)
    expect(dados.a.tela.historico).toEqual(pagina.tela.historico)
    expect(dados.b.tela.perfil.id).toBe(j2)
  })

  it('times: as médias saem do mesmo jogosDoTime da página do time, e os confrontos só entre os dois', async () => {
    const [t1, t2] = (await banco.db.select({ id: times.id }).from(times).limit(2)).map((t) => t.id)
    const dados = await carregarComparacao({ tipo: 'time', a: t1!, b: t2! })
    if (dados.modo !== 'comparacao' || dados.tipo !== 'time') throw new Error('modo errado')
    const pagina = await carregarTime(t1!, {})
    expect(dados.a.medias).toEqual(mediasDoTime(pagina.tela.jogosDoTime))
    for (const c of dados.confrontos.jogos) {
      expect([c.siglaCasa, c.siglaVisitante].sort()).toEqual([dados.a.tela.time.sigla, dados.b.tela.time.sigla].sort())
    }
  })

  it('grátis na temporada atual: profundidade false, sem confrontos lidos', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const [t1, t2] = (await banco.db.select({ id: times.id }).from(times).limit(2)).map((t) => t.id)
      const dados = await carregarComparacao({ tipo: 'time', a: t1!, b: t2! })
      if (dados.modo !== 'comparacao') throw new Error('modo errado')
      expect(dados.profundidade).toBe(false)
      if (dados.tipo === 'time') expect(dados.confrontos.jogos).toEqual([])
    } finally {
      nivelDoTeste = 'MVP'
    }
  })

  it('sem b: modo escolha com a busca filtrada pelo tipo e sem o próprio A', async () => {
    const [j1] = (await banco.db.select({ id: jogadores.id, nome: jogadores.nomeCompleto }).from(jogadores).limit(1))
    const dados = await carregarComparacao({ tipo: 'jogador', a: j1!.id, q: j1!.nome.split(' ')[0]! })
    expect(dados.modo).toBe('escolha')
    if (dados.modo !== 'escolha') throw new Error('modo errado')
    expect(dados.resultados.every((r) => r.tipo === 'JOGADOR')).toBe(true)
    expect(dados.resultados.some((r) => r.id === j1!.id)).toBe(false)
  })

  it.each([
    [{ tipo: 'clube', a: '00000000-0000-4000-8000-000000000001' }],
    [{ tipo: 'jogador', a: 'nao-e-uuid' }],
    [{ tipo: 'jogador', a: '00000000-0000-4000-8000-000000000001', b: '00000000-0000-4000-8000-000000000001' }],
  ])('%j dá notFound', async (params) => {
    await expect(carregarComparacao(params as Params)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
  })
})
```

`ResultadoBusca.tipo` é `'JOGADOR' | 'TIME'`. O erro de `notFound()` no Next 16 tem `digest`
`NEXT_HTTP_ERROR_FALLBACK;404`; o `rejects.toThrow` acima casa pelo `digest` — se a mensagem vier
vazia, troque por `await expect(...).rejects.toMatchObject({ digest: expect.stringContaining('404') })`.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/features/estatisticas/__tests__/comparar.test.ts --maxWorkers=1`
Expected: PASS (7 testes).

- [ ] **Step 7: Ponto de parada da tarefa**

---

### Task 5: A tela e a rota

**Files:**
- Create: `src/features/estatisticas/TelaComparar.tsx`
- Create: `src/features/estatisticas/Comparar.module.css`
- Create: `src/app/(app)/estatisticas/comparar/page.tsx`
- Modify: `src/features/estatisticas/regras.ts` (função pura `melhorDaLinha`)
- Test: `src/features/estatisticas/__tests__/comparar-tela.test.tsx`; `melhorDaLinha` em
  `src/features/estatisticas/__tests__/comum.test.tsx` (acrescente um `describe`)

**Interfaces:**
- Consumes: `DadosDaComparacao` (Tarefa 4); `CabecalhoStats`, `SecaoStats`, `Silhueta`,
  `UltimaAtualizacao` de `./Comum`; `GraficoDesempenho`; `SeletorTemporada` e
  `AVISO_TEMPORADA_ANTERIOR` de `@/ui/SeletorTemporada`; `FotoJogador`, `LogoTime` de `@/ui/midia`;
  `num`, `pct`, `aproveitamento`, `diaMes` de `./regras`; `rotaDoJogador`, `rotaDoTime`,
  `rotaDoJogo`, `rotaDaComparacao`.
- Produces:
  ```ts
  // regras.ts
  export type Vencedor = 'a' | 'b' | null
  export function melhorDaLinha(a: number | null, b: number | null, menorEhMelhor = false): Vencedor
  // TelaComparar.tsx
  export function TelaComparar({ dados }: { dados: DadosDaComparacao }): JSX.Element
  ```

- [ ] **Step 1: Teste de `melhorDaLinha`**

```ts
// em src/features/estatisticas/__tests__/comum.test.tsx
import { melhorDaLinha } from '../regras'

describe('melhorDaLinha', () => {
  it('o maior vence; em erros e faltas o menor vence; empate e nulo não destacam', () => {
    expect(melhorDaLinha(25.1, 24.9)).toBe('a')
    expect(melhorDaLinha(3, 4)).toBe('b')
    expect(melhorDaLinha(3, 4, true)).toBe('a')
    expect(melhorDaLinha(5, 5)).toBeNull()
    expect(melhorDaLinha(null, 5)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar; implementar em `regras.ts`**

```ts
export type Vencedor = 'a' | 'b' | null

/** Quem ganha a linha da comparação. Nulo de um lado ou empate: ninguém. */
export function melhorDaLinha(a: number | null, b: number | null, menorEhMelhor = false): Vencedor {
  if (a === null || b === null || a === b) return null
  const aVence = menorEhMelhor ? a < b : a > b
  return aVence ? 'a' : 'b'
}
```

Run: `npx vitest run src/features/estatisticas/__tests__/comum.test.tsx` → PASS.

- [ ] **Step 3: Escrever o teste de fumaça da tela (falha)**

```tsx
// src/features/estatisticas/__tests__/comparar-tela.test.tsx
// Mesma preparação (vi.mock + beforeAll com simularAte) de fumaca.test.tsx.
import { renderToStaticMarkup } from 'react-dom/server'
import { carregarComparacao } from '../comparar'
import { TelaComparar } from '../TelaComparar'

const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

async function renderizar(params: Record<string, string>) {
  const dados = await carregarComparacao(params)
  return renderToStaticMarkup(<TelaComparar dados={dados} />)
}

describe('TelaComparar', () => {
  it('jogadores lado a lado: os dois nomes, as médias e a forma recente', async () => {
    const [j1, j2] = await doisJogadoresComHistorico()
    const html = await renderizar({ tipo: 'jogador', a: j1.id, b: j2.id })
    const t = texto(html)
    expect(t).toContain(j1.nome)
    expect(t).toContain(j2.nome)
    for (const rotulo of ['Pontos', 'Rebotes', 'Assistências', 'Minutos', 'FG%', '3P%', 'LL%', 'Roubos', 'Tocos', 'Erros'])
      expect(t).toContain(rotulo)
    expect(t).toContain('Forma recente')
    expect(html).toContain('data-vencedor=')
  })

  it('ordem trocada espelha a tela e mantém o vencedor', async () => {
    const [j1, j2] = await doisJogadoresComHistorico()
    const ab = texto(await renderizar({ tipo: 'jogador', a: j1.id, b: j2.id }))
    const ba = texto(await renderizar({ tipo: 'jogador', a: j2.id, b: j1.id }))
    // A linha de pontos destaca a MESMA pessoa nas duas ordens.
    const vencedor = (t: string) => t.match(/Pontos[^]*?data-vencedor="([ab])"/)?.[1]
    const nomeDoVencedor = (t: string, v: string | undefined) => (v === 'a' ? t.indexOf(j1.nome) < t.indexOf(j2.nome) : v === 'b')
    expect(nomeDoVencedor(ab, vencedor(ab))).toBe(nomeDoVencedor(ba, vencedor(ba)))
  })

  it('times: campanha, médias e os jogos entre eles', async () => {
    const [t1, t2] = await doisTimesQueSeEnfrentaram()
    const t = texto(await renderizar({ tipo: 'time', a: t1.id, b: t2.id }))
    expect(t).toContain('Pontos marcados')
    expect(t).toContain('Pontos cedidos')
    expect(t).toContain('Jogos entre eles')
    expect(t).toMatch(new RegExp(`${t1.sigla} \\d+ × \\d+ ${t2.sigla}`))
  })

  it('grátis na temporada atual: silhueta e nenhum número pago no HTML', async () => {
    nivelDoTeste = 'GRATIS'
    try {
      const [j1, j2] = await doisJogadoresComHistorico()
      const dados = await carregarComparacao({ tipo: 'jogador', a: j1.id, b: j2.id })
      const html = renderToStaticMarkup(<TelaComparar dados={dados} />)
      expect(texto(html)).toContain('Assinar')
      expect(html).not.toContain('data-vencedor=')
      expect(html).not.toContain('Forma recente')
    } finally {
      nivelDoTeste = 'MVP'
    }
  })

  it('jogador sem partida no recorte: aviso dos dois lados, sem NaN', async () => {
    const semJogo = await jogadorSemPartidas()
    const [j1] = await doisJogadoresComHistorico()
    const t = texto(await renderizar({ tipo: 'jogador', a: semJogo.id, b: j1.id }))
    expect(t).toContain('Nenhuma partida disponível neste recorte')
    expect(t).not.toContain('NaN')
  })

  it('sem b: a escolha do segundo com a busca', async () => {
    const [j1] = await doisJogadoresComHistorico()
    const t = texto(await renderizar({ tipo: 'jogador', a: j1.id }))
    expect(t).toContain('Comparar com')
    expect(t).toContain('Buscar jogador')
  })

  it('nunca escreve "probabilidade"', async () => {
    const [j1, j2] = await doisJogadoresComHistorico()
    expect(texto(await renderizar({ tipo: 'jogador', a: j1.id, b: j2.id })).toLowerCase()).not.toContain('probabilidade')
  })
})
```

Os auxiliares `doisJogadoresComHistorico`, `doisTimesQueSeEnfrentaram` e `jogadorSemPartidas` leem o
banco simulado: dois jogadores com linhas em `estatisticas_jogo`; dois times com um jogo
`ENCERRADO` entre si (`jogos` com `timeCasaId`/`timeVisitanteId`); um jogador inserido à mão sem
nenhuma linha de box.

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/features/estatisticas/__tests__/comparar-tela.test.tsx --maxWorkers=1`
Expected: FAIL — `TelaComparar` não existe.

- [ ] **Step 5: Escrever a tela**

```tsx
// src/features/estatisticas/TelaComparar.tsx
import Link from 'next/link'

import { rotaDaComparacao, rotaDoJogador, rotaDoJogo, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { AVISO_TEMPORADA_ANTERIOR, SeletorTemporada } from '@/ui/SeletorTemporada'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { IconeBusca } from '@/ui/icones'
import { FaixaAviso } from '@/ui/blocos'
import { CabecalhoStats, SecaoStats, Silhueta, UltimaAtualizacao } from './Comum'
import { GraficoDesempenho } from './GraficoDesempenho'
import type { DadosDaComparacao, LadoJogador, LadoTime, MediasDoTime } from './comparar'
import { aproveitamento, diaMes, melhorDaLinha, num, pct, type Vencedor } from './regras'
import s from './Comparar.module.css'

type Linha = { rotulo: string; a: number | null; b: number | null; formato: (v: number | null) => string; menorEhMelhor?: boolean }

/** Uma linha da tabela lado a lado: A à esquerda, B à direita, o melhor marcado. */
function LinhaComparada({ l }: { l: Linha }) {
  const vencedor: Vencedor = melhorDaLinha(l.a, l.b, l.menorEhMelhor)
  return (
    <li className={s.linha} data-vencedor={vencedor ?? undefined}>
      <span className={`${s.valor} num`} data-lado="a" data-melhor={vencedor === 'a' || undefined}>{l.formato(l.a)}</span>
      <span className={s.rotulo}>{l.rotulo}</span>
      <span className={`${s.valor} num`} data-lado="b" data-melhor={vencedor === 'b' || undefined}>{l.formato(l.b)}</span>
    </li>
  )
}

function linhasDoJogador(a: LadoJogador, b: LadoJogador): Linha[] {
  const na = a.tela.perfilNumeros
  const nb = b.tela.perfilNumeros
  return [
    { rotulo: 'Pontos', a: na.ataque.pontos, b: nb.ataque.pontos, formato: num },
    { rotulo: 'Rebotes', a: na.defesa.rebotesTotal, b: nb.defesa.rebotesTotal, formato: num },
    { rotulo: 'Assistências', a: na.ataque.assistencias, b: nb.ataque.assistencias, formato: num },
    { rotulo: 'Minutos', a: na.posse.minutos, b: nb.posse.minutos, formato: num },
    { rotulo: 'FG%', a: na.ataque.fgPercentual, b: nb.ataque.fgPercentual, formato: pct },
    { rotulo: '3P%', a: na.ataque.tresPercentual, b: nb.ataque.tresPercentual, formato: pct },
    { rotulo: 'LL%', a: na.ataque.lancePercentual, b: nb.ataque.lancePercentual, formato: pct },
    { rotulo: 'Roubos', a: na.defesa.roubos, b: nb.defesa.roubos, formato: num },
    { rotulo: 'Tocos', a: na.defesa.bloqueios, b: nb.defesa.bloqueios, formato: num },
    { rotulo: 'Erros', a: na.posse.turnovers, b: nb.posse.turnovers, formato: num, menorEhMelhor: true },
    { rotulo: 'Faltas', a: na.posse.faltas, b: nb.posse.faltas, formato: num, menorEhMelhor: true },
  ]
}

function linhasDoTime(a: LadoTime, b: LadoTime): Linha[] {
  const ca = a.tela.campanha
  const cb = b.tela.campanha
  const ma: MediasDoTime = a.medias
  const mb: MediasDoTime = b.medias
  return [
    { rotulo: 'Vitórias', a: ca?.vitorias ?? null, b: cb?.vitorias ?? null, formato: num },
    { rotulo: 'Derrotas', a: ca?.derrotas ?? null, b: cb?.derrotas ?? null, formato: num, menorEhMelhor: true },
    { rotulo: 'Aproveitamento', a: ca?.aproveitamento ?? null, b: cb?.aproveitamento ?? null, formato: aproveitamento },
    { rotulo: 'Pontos marcados', a: ma.pontosMarcados, b: mb.pontosMarcados, formato: num },
    { rotulo: 'Pontos cedidos', a: ma.pontosCedidos, b: mb.pontosCedidos, formato: num, menorEhMelhor: true },
    { rotulo: 'Rebotes', a: ma.rebotes, b: mb.rebotes, formato: num },
    { rotulo: 'Assistências', a: ma.assistencias, b: mb.assistencias, formato: num },
    { rotulo: 'Bolas de 3 tentadas', a: ma.tresTentadas, b: mb.tresTentadas, formato: num },
    { rotulo: 'Bolas de 3 convertidas', a: ma.tresConvertidas, b: mb.tresConvertidas, formato: num },
    { rotulo: 'Erros', a: ma.erros, b: mb.erros, formato: num, menorEhMelhor: true },
  ]
}

export function TelaComparar({ dados }: { dados: DadosDaComparacao }) {
  const { tipo, seletor, fuso, fusoDia } = dados
  const voltarPara = rotaDaComparacao(tipo, dados.a.tela === undefined ? '' : ladoId(dados.a), dados.modo === 'comparacao' ? ladoId(dados.b) : undefined)
  const cabecalho = (lado: LadoJogador | LadoTime, posicao: 'a' | 'b') =>
    'perfil' in lado.tela ? (
      <Link href={rotaDoJogador(lado.tela.perfil.id)} className={s.lado} data-lado={posicao}>
        <FotoJogador url={lado.tela.perfil.fotoUrl} nome={lado.tela.perfil.nome} tamanho={56} />
        <strong>{lado.tela.perfil.nome}</strong>
        <span className={s.fraco}>{[lado.tela.perfil.timeSigla, lado.tela.perfil.posicao].filter(Boolean).join(' · ')}</span>
      </Link>
    ) : (
      <Link href={rotaDoTime(lado.tela.time.id)} className={s.lado} data-lado={posicao}>
        <LogoTime sigla={lado.tela.time.sigla} tamanho={56} />
        <strong>{lado.tela.time.nome}</strong>
        <span className={s.fraco}>{lado.tela.campanha ? `${lado.tela.campanha.vitorias}–${lado.tela.campanha.derrotas}` : 'sem campanha'}</span>
      </Link>
    )

  return (
    <article className={s.pagina} aria-label="Comparação">
      <CabecalhoStats sobretitulo="Estatísticas" titulo={tipo === 'jogador' ? 'Comparar jogadores' : 'Comparar times'} voltar={{ href: '/estatisticas', rotulo: 'Estatísticas' }} />
      <SeletorTemporada seletor={seletor} />
      {seletor.retroativa && <FaixaAviso>{AVISO_TEMPORADA_ANTERIOR}</FaixaAviso>}

      <header className={s.topo}>
        {cabecalho(dados.a, 'a')}
        <span className={s.versus} aria-hidden>×</span>
        {dados.modo === 'comparacao' ? cabecalho(dados.b, 'b') : <EscolhaDoSegundo dados={dados} />}
      </header>

      {dados.modo === 'comparacao' && !dados.profundidade && (
        <Silhueta forma="numeros" recurso="A comparação lado a lado" voltar={voltarPara} />
      )}

      {dados.modo === 'comparacao' && dados.profundidade && dados.tipo === 'jogador' && (
        <>
          <SecaoStats titulo="Médias da temporada" aux="por jogo">
            <ul className={s.linhas}>{linhasDoJogador(dados.a, dados.b).map((l) => <LinhaComparada key={l.rotulo} l={l} />)}</ul>
          </SecaoStats>
          <SecaoStats titulo="Forma recente" aux={rotuloDoPeriodo(dados.contexto.periodo)}>
            <div className={s.formas}>
              {[dados.a, dados.b].map((lado, i) => (
                <div key={i} className={s.forma}>
                  <GraficoDesempenho historico={lado.tela.historico} atributo={dados.contexto.atributo} fuso={fusoDia} hrefDoJogo={rotaDoJogo} />
                </div>
              ))}
            </div>
          </SecaoStats>
        </>
      )}

      {dados.modo === 'comparacao' && dados.profundidade && dados.tipo === 'time' && (
        <>
          <SecaoStats titulo="Campanha e médias" aux="por jogo">
            <ul className={s.linhas}>{linhasDoTime(dados.a, dados.b).map((l) => <LinhaComparada key={l.rotulo} l={l} />)}</ul>
          </SecaoStats>
          <SecaoStats titulo="Jogos entre eles" aux={`${dados.a.tela.time.sigla} ${dados.confrontos.vitoriasA} × ${dados.confrontos.vitoriasB} ${dados.b.tela.time.sigla}`}>
            {dados.confrontos.jogos.length === 0 ? (
              <p className={s.fraco}>Os dois ainda não se enfrentaram nesta temporada.</p>
            ) : (
              <ul className={s.confrontos}>
                {dados.confrontos.jogos.map((j) => (
                  <li key={j.jogoId}>
                    <Link href={rotaDoJogo(j.jogoId)}>
                      <span className="num">{diaMes(j.data, fusoDia)}</span>
                      <span>{j.siglaCasa} <strong className="num">{j.placarCasa}–{j.placarVisitante}</strong> {j.siglaVisitante}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SecaoStats>
        </>
      )}

      {dados.modo === 'comparacao' && (
        <UltimaAtualizacao em={dados.a.tela.atualizacao.em} fonte={dados.a.tela.atualizacao.fonte} agora={dados.agora} fuso={fuso} />
      )}
    </article>
  )
}

function ladoId(lado: LadoJogador | LadoTime): string {
  return 'perfil' in lado.tela ? lado.tela.perfil.id : lado.tela.time.id
}

function rotuloDoPeriodo(periodo: '5' | '10' | 'temporada'): string {
  return periodo === 'temporada' ? 'temporada inteira' : `últimos ${periodo} jogos`
}

/** O lado B vazio: a busca filtrada pelo tipo; cada resultado completa a URL. */
function EscolhaDoSegundo({ dados }: { dados: Extract<DadosDaComparacao, { modo: 'escolha' }> }) {
  const a = ladoId(dados.a)
  return (
    <div className={s.escolha} data-lado="b">
      <form action="/estatisticas/comparar" method="get" role="search" className={s.busca}>
        <input type="hidden" name="tipo" value={dados.tipo} />
        <input type="hidden" name="a" value={a} />
        {dados.seletor.escolhida && <input type="hidden" name="temporada" value={dados.seletor.escolhida} />}
        <label htmlFor="busca-comparar">Comparar com…</label>
        <span className={s.campo}>
          <IconeBusca tamanho={18} />
          <input id="busca-comparar" name="q" defaultValue={dados.termo} placeholder={dados.tipo === 'jogador' ? 'Buscar jogador' : 'Buscar time'} autoFocus />
        </span>
        <button type="submit">Buscar</button>
      </form>
      {dados.termo && dados.resultados.length === 0 && <p className={s.fraco}>Nada encontrado para “{dados.termo}”.</p>}
      <ul className={s.resultados}>
        {dados.resultados.map((r) => (
          <li key={r.id}>
            <Link href={rotaDaComparacao(dados.tipo, a, r.id, dados.seletor.escolhida ? { temporada: dados.seletor.escolhida } : undefined)}>{r.nome}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Nomes conferidos: `FotoJogador` e `LogoTime({ sigla, tamanho })` em `src/ui/midia.tsx`; `FaixaAviso` e
`BotaoSecundario({ href, children })` em `src/ui/blocos.tsx`; `ResultadoBusca` tem `id`, `nome` e
`tipo: 'JOGADOR' | 'TIME'`. `SeletorTemporada` recebe `{ temporadas, atual, hrefDe }`
(`src/ui/SeletorTemporada.tsx:8`): passe `temporadas={seletor.disponiveis}`, `atual={seletor.temporada}`
e `hrefDe={(t) => rotaDaComparacao(tipo, ladoId(dados.a), dados.modo === 'comparacao' ? ladoId(dados.b) : undefined, { temporada: t })}`
— copie a forma de `TelaJogador.tsx:211`. O `<SeletorTemporada seletor={seletor} />` do esqueleto acima é
abreviação: use esta assinatura.

CSS em `src/features/estatisticas/Comparar.module.css`, só com tokens:

```css
.pagina { display: grid; gap: var(--e-4); }
.topo {
  position: sticky; top: 0; z-index: 1;
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--e-3);
  padding: var(--e-3) 0; background: var(--fundo);
}
.lado { display: grid; justify-items: center; gap: var(--e-1); text-align: center; color: inherit; text-decoration: none; }
.versus { color: var(--texto-3); font-family: var(--fonte-heroi); font-size: var(--t-24); }
.fraco { color: var(--texto-3); font-size: var(--t-13); }
.linhas { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.linha { display: grid; grid-template-columns: 1fr auto 1fr; align-items: baseline; gap: var(--e-2); padding: var(--e-2) 0; border-bottom: 1px solid var(--borda); }
.valor { font-size: var(--t-16); }
.valor[data-lado='a'] { text-align: right; }
.valor[data-melhor] { color: var(--bateu-texto); font-weight: 700; }
.rotulo { color: var(--texto-3); font-size: var(--t-13); text-align: center; min-width: 96px; }
.formas { display: grid; grid-template-columns: 1fr 1fr; gap: var(--e-3); }
@media (max-width: 360px) { .formas { grid-template-columns: 1fr; } }
.confrontos { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--e-2); }
.confrontos a { display: flex; gap: var(--e-3); color: inherit; text-decoration: none; }
.escolha { display: grid; gap: var(--e-2); }
.busca { display: grid; gap: var(--e-1); }
.campo { display: flex; align-items: center; gap: var(--e-2); }
.resultados { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--e-1); }
```

`--bateu-texto` é o verde de "bateu" em `src/ui/tokens.css` (linha 59; o tema claro o redefine). Nunca escreva hex aqui.

A página:

```tsx
// src/app/(app)/estatisticas/comparar/page.tsx
import type { Metadata } from 'next'

import { carregarComparacao } from '@/features/estatisticas/comparar'
import { TelaComparar } from '@/features/estatisticas/TelaComparar'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Comparar' }

export default async function PaginaComparar({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const dados = await carregarComparacao((await searchParams) ?? {})
  return <TelaComparar dados={dados} />
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/features/estatisticas/__tests__/comparar-tela.test.tsx --maxWorkers=1 && npx tsc --noEmit -p . && npx depcruise src --config .dependency-cruiser.cjs`
Expected: PASS; sem violação de fronteira.

- [ ] **Step 7: Registrar a rota nas varreduras de páginas**

`src/app/__tests__/telas-abrir.test.ts` cerca toda página de `(app)` por um portão: rode
`npx vitest run src/app/__tests__/telas-abrir.test.ts` e, se ele listar `/estatisticas/comparar`
como sem portão, acrescente a rota à lista que o teste espera (o portão está em
`carregarComparacao`). Rode também `src/app/__tests__/paywall.test.ts`.

- [ ] **Step 8: Ponto de parada da tarefa**

---

### Task 6: O botão "Comparar com…" nas páginas

**Files:**
- Modify: `src/features/estatisticas/TelaJogador.tsx:208` (`acoes=` do `CabecalhoStats`)
- Modify: `src/features/estatisticas/TelaTime.tsx:126`
- Create: `src/features/estatisticas/BotaoComparar.tsx`
- Test: `src/features/estatisticas/__tests__/fumaca.test.tsx` (dois casos novos)

**Interfaces:**
- Produces: `export function BotaoComparar({ tipo, id, temporada }: { tipo: 'jogador' | 'time'; id: string; temporada?: string })`

- [ ] **Step 1: Teste que falha**

Acrescente a `fumaca.test.tsx`, nos `describe` de jogador e de time:

```ts
it('(comparar) o botão "Comparar com…" leva à escolha do segundo, com a temporada escolhida', async () => {
  const html = await renderizarJogador(alvo, { temporada })
  expect(html).toContain(`href="${rotaDaComparacao('jogador', alvo, undefined, { temporada })}"`)
  expect(texto(html)).toContain('Comparar com')
})
// e, para o time:
it('(comparar) o botão "Comparar com…" na página do time', async () => {
  const html = await renderizarTime(sujeito.timeId, {})
  expect(html).toContain(`href="${rotaDaComparacao('time', sujeito.timeId)}"`)
})
```

Use os auxiliares de renderização que o arquivo já tem (`renderizarJogador`/`renderizarTime`, ou os
nomes que lá existirem).

- [ ] **Step 2: Rodar e ver falhar; implementar o botão**

```tsx
// src/features/estatisticas/BotaoComparar.tsx
import Link from 'next/link'

import { rotaDaComparacao } from '@/modules/entrega/estatisticas/rotas'
import s from './Comum.module.css'

/** Ao lado de "Acompanhar": abre a escolha do segundo, já com este lado A. */
export function BotaoComparar({ tipo, id, temporada }: { tipo: 'jogador' | 'time'; id: string; temporada?: string }) {
  return (
    <Link href={rotaDaComparacao(tipo, id, undefined, temporada ? { temporada } : undefined)} className={s.botaoSecundario}>
      Comparar com…
    </Link>
  )
}
```

Use `BotaoSecundario({ href, children })` de `src/ui/blocos.tsx` no lugar do `Link` com classe própria:
`<BotaoSecundario href={rotaDaComparacao(...)}>Comparar com…</BotaoSecundario>`.

Nas telas:

```tsx
// TelaJogador.tsx:208
acoes={<><BotaoAcompanhar tipo="JOGADOR" id={id} inicial={dados.acompanhado} /><BotaoComparar tipo="jogador" id={id} temporada={seletor.escolhida} /></>}
// TelaTime.tsx:126
acoes={<><BotaoAcompanhar tipo="TIME" id={id} inicial={dados.acompanhado} /><BotaoComparar tipo="time" id={id} temporada={seletor.escolhida} /></>}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run src/features/estatisticas/__tests__/fumaca.test.tsx --maxWorkers=1`
Expected: PASS.

- [ ] **Step 4: Ponto de parada da tarefa**

---

### Task 7: Fechamento

**Files:**
- Modify: `docs/00-visao.md` ou `docs/01-arquitetura.md` (uma linha na aba de estatísticas: a
  comparação e a fonte do box do time)
- Modify: `src/features/assinatura/matriz.ts` — se o texto de benefícios ainda disser algo
  diferente, o item do MVP vira exatamente "Comparação entre jogadores, times e confrontos"

- [ ] **Step 1: Suíte inteira em lotes**

Run (um lote por vez, `--maxWorkers=1`): o script de lotes usado em 09/10
(`find src -name '*.test.ts*' | sort | split -l 12`), conferindo `df -k` antes de cada lote.
Expected: 0 falhas além das que já se provaram de carga (reexecutar isoladas).

- [ ] **Step 2: Tipos, lint e fronteiras**

Run: `npx tsc --noEmit -p . && npm run -s lint && npx depcruise src --config .dependency-cruiser.cjs`
Expected: 0 erros; 0 violações.

- [ ] **Step 3: Documentação**

Uma linha em `docs/00-visao.md` na aba de estatísticas: "Comparar: dois jogadores ou dois times
lado a lado (`/estatisticas/comparar`), MVP na temporada atual e aberto na anterior; o box do time
é a soma do box dos jogadores (a BallDontLie não dá box de time)".

- [ ] **Step 4: Entrega ao parceiro**

Comandos de `git add`/`commit`/`push` com a lista dos arquivos criados e alterados; conferir em
produção, logado: `/estatisticas/comparar?tipo=time&a=…&b=…` em 2025-26 e o botão nas páginas.
