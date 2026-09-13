# Correções do diagnóstico de 13/09 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o empate da simulação e da classificação (e repará-lo em produção), fechar o 500 da data com ano curto, impedir que um teste vermelho trave o worker do PGlite, e dar ao CI o `build` e o artefato de falha que faltavam.

**Architecture:** O desempate nasce no gerador puro, sobre as linhas filtradas que viram placar, com o PRNG semeado pela chave do jogo — reproduzível em qualquer banco, inclusive no script de reparo. A classificação passa a contar empate como estado inválido em vez de escolher um lado. A data com ano curto é consertada na raiz (o ano sem zeros) em dois lugares. O arnês de teste espera as consultas em voo antes de fechar o PGlite.

**Tech Stack:** Next.js App Router, Drizzle + Postgres (Neon em produção, PGlite nos testes), Vitest, vite-node para scripts, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-09-13-correcoes-do-diagnostico-design.md`](../specs/2026-09-13-correcoes-do-diagnostico-design.md)

## Global Constraints

- **Motor e ruleset intocáveis** (`CLAUDE.md` regras 1 e 2). O desempate é regra de simulação, vive em `simulacao.ts`, **não** entra no ruleset. `npm run boundaries` limpo — `simulacao.ts` continua sem importar de `dominio/`, `entrega/`, `plataforma/` (regra `simulacao-sem-outras-camadas`).
- **Nunca inventar regra que o cliente não definiu** (regra 3): sem limite de ano em `dataValida`, sem prazo, sem heurística. Uma cesta de desempate (`CESTA_DE_DESEMPATE = 2`), e só.
- **O placar é a soma do box dos jogadores.** Sempre. Qualquer mudança em `pontos` refaz o desdobramento com `decomporPontos` para `2·doisC + 3·tresC + lanceC = pontos` continuar valendo.
- **A convenção de chave dos boxes não muda**: `` `${semente}|${dia}|${casa}x${visitante}|${sigla}` ``. Mudar reescreveria a temporada inteira. A chave do desempate é `` `${semente}|${dia}|${casa}x${visitante}|desempate` ``, com `semente` = `SEMENTE_TEMPORADA` (`'ia-nba-demo-2025-26'`) quando o script não passa outra.
- **Empate é estado inválido:** `semearClassificacao` não atribui vitória nem derrota a jogo empatado e devolve `{ linhas, empates }`. Nunca lança por isso.
- **Nada roda contra o Neon antes da Task 8.** Os scripts são escritos e testados em PGlite.
- **Um commit só, no final** (preferência do parceiro). As tasks terminam em verificação; a Task 8 commita.
- **Verificação de cada task:** `npm run typecheck && npm run lint && npm run boundaries` e a suíte do que foi tocado. Armadilha conhecida: duas execuções do vitest ao mesmo tempo fabricam falhas fantasmas — uma de cada vez.
- **Testes novos são autocontidos** (PGlite próprio, semeadura própria, sem depender da ordem de irmãos). Não acrescentar testes a `demo.test.ts` nem a `temporada.test.ts`, que já dependem de ordem (T1, spec própria).
- **Domínio em português; comentário explica a decisão, não o mecanismo.**

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
| --- | --- | --- |
| `src/modules/dominio/__tests__/ajuda-banco.ts` | `fechar()` espera consultas em voo | 1 |
| `src/modules/dominio/__tests__/ajuda-banco.test.ts` (novo) | regressão do travamento | 1 |
| `src/modules/ingestao/demo/simulacao.ts` | `desempatar`, `CESTA_DE_DESEMPATE` (puro) | 2 |
| `src/modules/ingestao/demo/__tests__/simulacao.test.ts` | testes do `desempatar` | 2 |
| `src/modules/ingestao/demo/temporada.ts` | aplica o desempate nas linhas filtradas; resumo ganha `empates` | 3, 4 |
| `src/modules/ingestao/__tests__/temporada-sem-empate.test.ts` (novo) | nenhum empate após `simularAte`; V+D = jogos | 3 |
| `src/modules/ingestao/demo/jogos.ts` | `semearClassificacao` → `{ linhas, empates }` | 4 |
| `src/modules/ingestao/demo/semear.ts`, `scripts/demo-conferencias.ts`, `scripts/demo-temporada.ts` | chamadores do retorno novo | 4 |
| `scripts/demo-conferir.ts` | gate "Temporada · sem empate" | 4 |
| `src/modules/ingestao/__tests__/classificacao-empate.test.ts` (novo) | empate plantado → `empates: 1`, ninguém ganha nem perde | 4 |
| `src/modules/ingestao/demo/reparo-empates.ts` (novo) | `repararEmpates(db, ruleset, opcoes)` | 5 |
| `scripts/demo-desempatar.ts` (novo) + `package.json` | `npm run demo:desempatar` | 5 |
| `src/modules/ingestao/__tests__/reparo-empates.test.ts` (novo) | repara empate plantado; idempotente; mesma escolha do gerador | 5 |
| `src/modules/dominio/rodada.ts`, `src/modules/dominio/temporada.ts` | ano com quatro dígitos | 6 |
| `src/app/(app)/resultados/[data]/page.tsx` | guarda `Number.isFinite` em `diasDaTemporada` | 6 |
| `src/modules/dominio/__tests__/ano-curto.test.ts` (novo), `src/app/__tests__/resultados-url-invalida.test.ts` (novo) | ano 1 sai com quatro dígitos; a rota não lança | 6 |
| `.github/workflows/ci.yml` | `build` + artefato de conferência na falha | 7 |
| `src/app/__tests__/telas-demo.test.ts` | `onTestFailed` grava o HTML do flake | 7 |

---

### Task 1: `fechar()` do arnês espera as consultas em voo

**Files:**
- Modify: `src/modules/dominio/__tests__/ajuda-banco.ts:49`
- Test: `src/modules/dominio/__tests__/ajuda-banco.test.ts` (novo)

**Interfaces:**
- Produces: `bancoDeTeste()` continua devolvendo `{ pg, db, subir, descer, contarTabelas, fechar }`; `fechar` passa a ser `async () => Promise<void>` e só resolve depois que toda consulta pendente terminou. Todas as tasks seguintes escrevem testes que chamam `fechar()` no `afterAll` e dependem disto para não travar quando falham.

- [ ] **Step 1: Teste que falha** — `src/modules/dominio/__tests__/ajuda-banco.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { bancoDeTeste } from './ajuda-banco'

describe('bancoDeTeste.fechar', () => {
  it('espera a consulta em voo antes de fechar — sem isso o worker gira para sempre', async () => {
    const banco = await bancoDeTeste()
    // Uma consulta que demora, disparada SEM await: é o estado em que um teste
    // que falha no meio de um Promise.all deixa o banco quando o afterAll roda.
    const emVoo = banco.pg.query('select pg_sleep(0.3)').catch(() => undefined)
    const inicio = Date.now()
    await banco.fechar()
    // Fechou DEPOIS da consulta, não durante: provado pelo tempo que esperou.
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(250)
    await emVoo
  }, 10_000)
})
```

(Se o PGlite desta versão não tiver `pg_sleep`, troque a consulta por `select count(*) from generate_series(1, 5000000)` e o limite de 250ms por `toBeGreaterThan(0)` — o que importa é que `fechar()` só resolve depois dela.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/dominio/__tests__/ajuda-banco.test.ts`. Esperado: FAIL por timeout de 10s (o `close()` seco trava com consulta em voo) — é exatamente o sintoma do diagnóstico.

- [ ] **Step 3: Implementar** — em `ajuda-banco.ts`, a linha 49 `return { pg, db, subir, descer, contarTabelas, fechar: () => pg.close() }` vira:

```ts
  /**
   * FECHAR SÓ DEPOIS DO QUE ESTÁ EM VOO. Um teste que falha no meio de um
   * Promise.all deixa consultas pendentes; `pg.close()` nesse estado gira o
   * worker a 100% de CPU sem fim (diagnóstico de 13/09). O `select 1` entra
   * na fila do mesmo mutex do PGlite e só volta quando o que estava na frente
   * terminou — aí fechar é seguro.
   */
  const fechar = async () => {
    await pg.query('select 1').catch(() => undefined)
    await pg.close()
  }
  return { pg, db, subir, descer, contarTabelas, fechar }
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/modules/dominio/__tests__/ajuda-banco.test.ts`. Esperado: PASS em ~300ms.

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npx vitest run src/modules/dominio`. Nenhum teste existente pode mudar de resultado: `fechar()` já era `await`ado em todo `afterAll`. Marcar a task; **não commitar**.

---

### Task 2: `desempatar` — puro, determinístico, sobre linhas com `pontos`

**Files:**
- Modify: `src/modules/ingestao/demo/simulacao.ts` (depois de `boxScoreDoTime`, ~linha 345)
- Test: `src/modules/ingestao/demo/__tests__/simulacao.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CESTA_DE_DESEMPATE = 2
  export function desempatar<T extends { pontos: number }>(
    casa: readonly T[],
    visitante: readonly T[],
    sorteio: () => number,
  ): { casa: T[]; visitante: T[]; desempatou: 'casa' | 'visitante' | null }
  ```
  Devolve **cópias** (nunca muta a entrada). Sem empate: cópias iguais e `null`. Com empate: `sorteio() < 0.5` escolhe `casa`, senão `visitante`; se o lado escolhido não tiver linhas, o outro; se nenhum tiver, inalterado e `null`. Na linha de maior `pontos` do lado escolhido (a primeira, em empate de pontos), `pontos += CESTA_DE_DESEMPATE`.
- Consumes: `criarSorteio(chave): () => number` do mesmo arquivo (já existe, linha 22).

- [ ] **Step 1: Teste que falha** — em `simulacao.test.ts`, acrescente ao import de `../simulacao` os nomes `desempatar` e `CESTA_DE_DESEMPATE`, e no fim do arquivo:

```ts
describe('desempatar — a NBA não empata, a demo também não', () => {
  const linha = (nome: string, pontos: number) => ({ nome, pontos })
  const soma = (lado: { pontos: number }[]) => lado.reduce((t, l) => t + l.pontos, 0)

  it('sem empate, devolve cópias iguais e não decide nada', () => {
    const casa = [linha('a', 20), linha('b', 10)]
    const fora = [linha('c', 25)]
    const r = desempatar(casa, fora, criarSorteio('x'))
    expect(r.desempatou).toBeNull()
    expect(r.casa).toEqual(casa)
    expect(r.visitante).toEqual(fora)
    expect(r.casa).not.toBe(casa) // cópia, não a mesma referência
  })

  it('com empate, soma UMA cesta ao maior pontuador de um lado só — e o placar deixa de empatar', () => {
    const casa = [linha('a', 12), linha('b', 18)]
    const fora = [linha('c', 30)]
    const r = desempatar(casa, fora, criarSorteio('jogo-1|desempate'))
    expect(r.desempatou).not.toBeNull()
    expect(soma(r.casa)).not.toBe(soma(r.visitante))
    const ladoMudado = r.desempatou === 'casa' ? r.casa : r.visitante
    const ladoIntacto = r.desempatou === 'casa' ? r.visitante : r.casa
    expect(soma(ladoMudado)).toBe(30 + CESTA_DE_DESEMPATE)
    expect(ladoIntacto).toEqual(r.desempatou === 'casa' ? fora : casa)
    // a cesta foi para o maior pontuador do lado
    const maior = ladoMudado.reduce((m, l) => (l.pontos > m.pontos ? l : m))
    expect(maior.pontos).toBe((r.desempatou === 'casa' ? 18 : 30) + CESTA_DE_DESEMPATE)
  })

  it('é determinístico pela chave: mesma chave, mesmo lado', () => {
    const casa = [linha('a', 10)]
    const fora = [linha('b', 10)]
    const a = desempatar(casa, fora, criarSorteio('k'))
    const b = desempatar(casa, fora, criarSorteio('k'))
    expect(a.desempatou).toBe(b.desempatou)
    expect(a).toEqual(b)
  })

  it('escolhe cada lado em alguma chave — o sorteio não é viciado', () => {
    const casa = [linha('a', 10)]
    const fora = [linha('b', 10)]
    const lados = new Set(
      Array.from({ length: 40 }, (_, i) => desempatar(casa, fora, criarSorteio(`k${i}`)).desempatou),
    )
    expect(lados).toEqual(new Set(['casa', 'visitante']))
  })

  it('lado sorteado sem linhas: a cesta vai para o outro; os dois sem linhas: nada a decidir', () => {
    const r = desempatar([], [linha('b', 0)], criarSorteio('k'))
    expect(r.desempatou).toBe('visitante')
    expect(r.visitante[0]!.pontos).toBe(CESTA_DE_DESEMPATE)
    const vazio = desempatar([], [], criarSorteio('k'))
    expect(vazio.desempatou).toBeNull()
  })

  it('não muta a entrada', () => {
    const casa = [linha('a', 10)]
    const fora = [linha('b', 10)]
    desempatar(casa, fora, criarSorteio('k'))
    expect(casa[0]!.pontos).toBe(10)
    expect(fora[0]!.pontos).toBe(10)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/ingestao/demo/__tests__/simulacao.test.ts`. Esperado: FAIL — `desempatar` não é exportado.

- [ ] **Step 3: Implementar** — em `simulacao.ts`, depois de `boxScoreDoTime`:

```ts
/** Uma cesta. Só um lado é somado, então o resultado nunca volta a empatar. */
export const CESTA_DE_DESEMPATE = 2

/**
 * DESEMPATE — a NBA não empata, a demo também não.
 *
 * Age sobre as linhas que VÃO PARA O BANCO (as já filtradas), porque é a soma
 * delas que vira placar (`semearPlacares`): decidir sobre o box cru decidiria
 * sobre um placar que não existe. A cesta vai para o maior pontuador do lado
 * sorteado, e o sorteio vem da chave do jogo — mesma chave, mesma escolha, em
 * qualquer banco, inclusive no script que repara o passado.
 *
 * Regra de simulação, não de estratégia: não muda apito nenhum e não entra no
 * ruleset. Nunca muta a entrada: devolve cópias.
 */
export function desempatar<T extends { pontos: number }>(
  casa: readonly T[],
  visitante: readonly T[],
  sorteio: () => number,
): { casa: T[]; visitante: T[]; desempatou: 'casa' | 'visitante' | null } {
  const soma = (lado: readonly T[]) => lado.reduce((total, l) => total + l.pontos, 0)
  const copia = { casa: casa.map((l) => ({ ...l })), visitante: visitante.map((l) => ({ ...l })) }
  if (soma(casa) !== soma(visitante)) return { ...copia, desempatou: null }

  const sorteado: 'casa' | 'visitante' = sorteio() < 0.5 ? 'casa' : 'visitante'
  const outro = sorteado === 'casa' ? 'visitante' : 'casa'
  const lado = copia[sorteado].length > 0 ? sorteado : outro
  if (copia[lado].length === 0) return { ...copia, desempatou: null }

  // `>` estrito: em empate de pontos, a primeira linha — estável entre execuções.
  const maior = copia[lado].reduce((m, l) => (l.pontos > m.pontos ? l : m))
  maior.pontos += CESTA_DE_DESEMPATE
  return { ...copia, desempatou: lado }
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/modules/ingestao/demo/__tests__/simulacao.test.ts`. Esperado: PASS.

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries` (a regra `simulacao-sem-outras-camadas` continua limpa: nada novo importado). Marcar; **não commitar**.

---

### Task 3: O gerador aplica o desempate nas linhas filtradas

**Files:**
- Modify: `src/modules/ingestao/demo/temporada.ts` (passo "3 · Jogar", ~linhas 568-613; e o import de `./simulacao`)
- Test: `src/modules/ingestao/__tests__/temporada-sem-empate.test.ts` (novo)

**Interfaces:**
- Consumes: `desempatar`, `criarSorteio`, `CESTA_DE_DESEMPATE`, tipo `LinhaBox` de `./simulacao`; `decomporPontos`, `boxComplementar` de `./dados` (já importados no arquivo).
- Produces: nenhum símbolo novo — muda o comportamento de `simularAte`: nenhum jogo `ENCERRADO` nasce empatado. A Task 5 depende de a chave do desempate ser exatamente `` `${c.semente}|${dia}|${a.jogo.casa}x${a.jogo.visitante}|desempate` ``.

- [ ] **Step 1: Teste que falha** — `src/modules/ingestao/__tests__/temporada-sem-empate.test.ts` (autocontido; segue o arnês de `temporada.test.ts`, que semeia com `simularAte`):

```ts
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { classificacao, jogos } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { LLMFake } from '../llm'
import { simularAte } from '../demo/temporada'

const AGORA = new Date('2026-01-15T18:00:00.000Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await simularAte(banco.db, carregarRuleset('config/ruleset.v1.yaml'), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
}, 180_000)
afterAll(async () => {
  await banco.fechar()
})

describe('a temporada simulada não empata (diagnóstico de 13/09, B1)', () => {
  it('nenhum jogo encerrado tem placares iguais', async () => {
    const empatados = await banco.db
      .select({ id: jogos.id })
      .from(jogos)
      .where(
        and(eq(jogos.status, 'ENCERRADO'), sql`${jogos.placarCasa} = ${jogos.placarVisitante}`),
      )
    expect(empatados).toEqual([])
  })

  it('por time, vitórias + derrotas é o número de jogos encerrados', async () => {
    const encerrados = await banco.db
      .select({ casa: jogos.timeCasaId, visitante: jogos.timeVisitanteId })
      .from(jogos)
      .where(and(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))
    const jogosPorTime = new Map<string, number>()
    for (const j of encerrados)
      for (const t of [j.casa, j.visitante]) jogosPorTime.set(t, (jogosPorTime.get(t) ?? 0) + 1)
    const tabela = await banco.db.select().from(classificacao)
    expect(tabela.length).toBeGreaterThan(0)
    for (const linha of tabela)
      expect(linha.vitorias + linha.derrotas, `time ${linha.timeId}`).toBe(
        jogosPorTime.get(linha.timeId) ?? 0,
      )
  })
})
```

(Se `carregarRuleset` tiver assinatura diferente neste arquivo, use `rulesetAtivo()` de `../../entrega/ruleset-ativo`, como `temporada.test.ts` faz — leia o cabeçalho dele.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/ingestao/__tests__/temporada-sem-empate.test.ts`. Esperado: FAIL — o diagnóstico mediu 5 empates em 21 dias e 8 times divergentes; o primeiro teste devolve uma lista não vazia. (Se por sorte da semeadura passar, o segundo falha nos times empatados; se os dois passarem, a semeadura mudou — investigue antes de seguir.)

- [ ] **Step 3: Implementar** — em `temporada.ts`, importe `desempatar` e `criarSorteio` de `./simulacao` (e `type LinhaBox`), e troque o laço do passo "3 · Jogar" — hoje ele empurra linhas de inserção direto dentro do `for (const lado ...)` — por:

```ts
  // 3 · Jogar. Só agora os números do dia existem.
  let boxScores = 0
  for (const a of agendados) {
    // As linhas FILTRADAS de cada lado (sem vínculo e homônimo já descartados):
    // são elas que `semearPlacares` soma, então é sobre elas que se desempata.
    const porLado: Record<'casa' | 'visitante', Array<LinhaBox & { jogadorId: string }>> = {
      casa: [],
      visitante: [],
    }
    for (const lado of ['casa', 'visitante'] as const) {
      const sigla = a.jogo[lado]
      const timeId = lado === 'casa' ? a.timeCasaId : a.timeVisitanteId
      const box = boxScoreDoTime({
        // CONVENÇÃO DE CHAVE — é ela que faz a temporada ser reproduzível em
        // qualquer banco. Mudar este formato reescreve a temporada inteira.
        chave: `${c.semente}|${dia}|${a.jogo.casa}x${a.jogo.visitante}|${sigla}`,
        elenco: c.elencos.get(sigla) ?? [],
        fora: fora.get(sigla) ?? [],
      })
      for (const l of box) {
        // `LinhaBox.nome` é o nome CRU da lista do CJ ('shai', 'jokic').
        const jogadorId = c.cadastro.jogadorPorChave.get(chaveDeNome(l.nome))
        if (!jogadorId) continue
        // Homônimo em dois elencos: só joga por quem a LISTA diz (ver
        // `timeDaLista`). A linha é descartada DEPOIS de gerada, nunca antes —
        // o gerador é uma sequência, e tirar um jogador do meio dela mudaria
        // os números de todos os que vêm atrás.
        if (c.timeDoJogador.get(jogadorId) !== timeId) continue
        porLado[lado].push({ ...l, jogadorId })
      }
    }
    // DESEMPATE antes da inserção — a NBA não empata; a demo também não. A
    // chave é a do jogo mais `|desempate`: o reparo do passado reproduz a
    // mesma escolha (ver `reparo-empates.ts`).
    const decidido = desempatar(
      porLado.casa,
      porLado.visitante,
      criarSorteio(`${c.semente}|${dia}|${a.jogo.casa}x${a.jogo.visitante}|desempate`),
    )
    // O desdobramento em 2C/3C/LL sai do valor FINAL de pontos: é o que mantém
    // `2·doisC + 3·tresC + lanceC = pontos` na linha que recebeu a cesta.
    const linhas: (typeof estatisticasJogo.$inferInsert)[] = [
      ...decidido.casa,
      ...decidido.visitante,
    ].map((l) => ({
      jogoId: a.jogoId,
      jogadorId: l.jogadorId,
      minutos: l.minutos.toFixed(2),
      pontos: l.pontos,
      rebotesTotal: l.rebotes,
      assistencias: l.assistencias,
      ...decomporPontos(l.pontos),
      ...boxComplementar(`${c.semente}|${dia}|${l.nome}`, l.rebotes),
    }))
    if (linhas.length > 0) {
      // (o upsert existente continua igual daqui para baixo)
```

Tudo abaixo de `if (linhas.length > 0)` — o `onConflictDoUpdate`, o `boxScores += linhas.length`, o `update(jogos)` para `ENCERRADO` — fica como está.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/modules/ingestao/__tests__/temporada-sem-empate.test.ts`. Esperado: PASS nos dois. Depois `npx vitest run src/modules/ingestao` inteiro: `temporada.test.ts` tem asserções sobre números de jogos específicos (ex.: a média de um jogador num dia); **só os jogos que empatavam mudam**, então se alguma asserção quebrar, confira que é um deles (o teste diz o jogo/dia) e atualize o número esperado com a razão escrita — nunca afrouxe a asserção.

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 4: A classificação trata empate como estado inválido, e o gate reprova empate

**Files:**
- Modify: `src/modules/ingestao/demo/jogos.ts:234-334` (`semearClassificacao`)
- Modify: `src/modules/ingestao/demo/temporada.ts:96,194-234,533-541,655-657`; `src/modules/ingestao/demo/semear.ts:441-450`; `scripts/demo-conferencias.ts:33-37`; `scripts/demo-temporada.ts` (impressão do resumo); `scripts/demo-conferir.ts` (novo item de gate)
- Test: `src/modules/ingestao/__tests__/classificacao-empate.test.ts` (novo)

**Interfaces:**
- Produces: `semearClassificacao(db, ruleset, dataReferencia): Promise<{ linhas: number; empates: number }>`. `simularAte` e o resumo por dia ganham `empates: number`. `demo:conferir` ganha o item **"Temporada · sem empate"** (reprova se houver).
- Consumes: nada das tasks anteriores (o teste planta o empate à mão).

- [ ] **Step 1: Teste que falha** — `src/modules/ingestao/__tests__/classificacao-empate.test.ts`:

```ts
import { and, eq, isNotNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { classificacao, jogos } from '../../dominio/db/schema'
import { dataDeReferencia } from '../../dominio/rodada'
import { rulesetAtivo } from '../../entrega/ruleset-ativo'
import { LLMFake } from '../llm'
import { semearClassificacao } from '../demo/jogos'
import { simularAte } from '../demo/temporada'

const AGORA = new Date('2026-01-15T18:00:00.000Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let ruleset: Awaited<ReturnType<typeof rulesetAtivo>>
let hoje: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  ruleset = await rulesetAtivo()
  hoje = dataDeReferencia(AGORA, ruleset.rodada.fuso)
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7, llm: new LLMFake() })
}, 180_000)
afterAll(async () => {
  await banco.fechar()
})

describe('semearClassificacao — empate é estado inválido, não derrota', () => {
  it('sem empate, devolve empates: 0 e o número de linhas', async () => {
    const r = await semearClassificacao(banco.db, ruleset, hoje)
    expect(r.empates).toBe(0)
    expect(r.linhas).toBe((await banco.db.select().from(classificacao)).length)
  })

  it('um empate plantado é contado e não vira vitória nem derrota de ninguém', async () => {
    const [jogo] = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))
      .limit(1)
    expect(jogo).toBeDefined()
    const antes = new Map(
      (await banco.db.select().from(classificacao)).map((l) => [l.timeId, l] as const),
    )
    const casaAntes = antes.get(jogo!.timeCasaId)!
    const visitanteAntes = antes.get(jogo!.timeVisitanteId)!
    const casaVenceu = jogo!.placarCasa! > jogo!.placarVisitante!

    // Planta o empate direto no placar (só para este teste; o gerador não produz).
    await banco.db
      .update(jogos)
      .set({ placarVisitante: jogo!.placarCasa })
      .where(eq(jogos.id, jogo!.id))
    try {
      const r = await semearClassificacao(banco.db, ruleset, hoje)
      expect(r.empates).toBe(1)
      const depois = new Map(
        (await banco.db.select().from(classificacao)).map((l) => [l.timeId, l] as const),
      )
      // Quem tinha vencido perde a vitória; quem tinha perdido perde a derrota —
      // e ninguém ganha nada em troca.
      const casaDepois = depois.get(jogo!.timeCasaId)!
      const visitanteDepois = depois.get(jogo!.timeVisitanteId)!
      expect(casaDepois.vitorias).toBe(casaAntes.vitorias - (casaVenceu ? 1 : 0))
      expect(casaDepois.derrotas).toBe(casaAntes.derrotas - (casaVenceu ? 0 : 1))
      expect(visitanteDepois.vitorias).toBe(visitanteAntes.vitorias - (casaVenceu ? 0 : 1))
      expect(visitanteDepois.derrotas).toBe(visitanteAntes.derrotas - (casaVenceu ? 1 : 0))
    } finally {
      await banco.db
        .update(jogos)
        .set({ placarVisitante: jogo!.placarVisitante })
        .where(eq(jogos.id, jogo!.id))
      await semearClassificacao(banco.db, ruleset, hoje)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/ingestao/__tests__/classificacao-empate.test.ts`. Esperado: FAIL — `r.empates` é `undefined` (a função devolve número) e, na versão atual, o empate vira vitória do visitante.

- [ ] **Step 3: Implementar** — em `jogos.ts`, `semearClassificacao`:

  - assinatura: `): Promise<{ linhas: number; empates: number }> {`
  - no laço dos jogos encerrados (hoje `for (const j of ...) { if (j.placarCasa === null || j.placarVisitante === null) continue; const casaVenceu = j.placarCasa > j.placarVisitante; ... }`), antes de `const casaVenceu`:

```ts
    // EMPATE É ESTADO INVÁLIDO, não derrota. A NBA não empata; um empate aqui é
    // dado errado (a demo antiga produzia — diagnóstico de 13/09). Decidir com
    // `>` dava a vitória ao visitante e mentia na tabela; lançar derrubaria o
    // cron das 6h por um dado velho. Fica fora da conta e vai para o retorno,
    // e o `demo:conferir` reprova enquanto houver um.
    if (j.placarCasa === j.placarVisitante) {
      empates += 1
      continue
    }
```

  com `let empates = 0` declarado antes do laço, e o `return ordenados.length` do fim vira `return { linhas: ordenados.length, empates }`.

  Chamadores:

  - `temporada.ts:655-657`:
    ```ts
    const resultado = await semearClassificacao(c.db, c.ruleset, dia)
    return { jogos: agendados.length, boxScores, publicou, classificados: resultado.linhas, empates: resultado.empates }
    ```
    o tipo de retorno em `:533` ganha `empates: number`; o retorno vazio em `:541` ganha `empates: 0`; no agregador (`:194-234`) declare `let empates = 0`, some `empates += r.empates` onde `classificados = r.classificados` é atribuído, e inclua `empates` no objeto devolvido; o tipo `ResumoTemporada` (`:96`) ganha `empates: number`.
  - `semear.ts:441`: `const resultado = await semearClassificacao(db, ruleset, dataReferencia)`; onde o retorno usa `classificados`, use `classificados: resultado.linhas` e acrescente `empates: resultado.empates` (e `empates: number` no tipo de retorno da função, visível na assinatura).
  - `scripts/demo-conferencias.ts:35-37`:
    ```ts
    const resultado = await semearClassificacao(db, ruleset, hoje)
    console.log(`Classificação recomputada: ${resultado.linhas} linhas, posição por conferência.`)
    if (resultado.empates > 0)
      console.log(`⚠ ${resultado.empates} jogo(s) encerrado(s) empatado(s) fora da conta — rode: npm run demo:desempatar`)
    ```
  - `scripts/demo-temporada.ts`, depois da linha que imprime `listas publicadas`:
    ```ts
    if (resumo.empates > 0)
      console.log(`\n⚠ ${resumo.empates} jogo(s) encerrado(s) empatado(s) — rode: npm run demo:desempatar`)
    ```
  - `scripts/demo-conferir.ts`, logo depois do item `'  · um jogo ao vivo'` (importe `sql` de `drizzle-orm` se ainda não estiver, e `and`/`eq` já estão):
    ```ts
    // A NBA não empata. Um empate na tabela é dado errado na frente do cliente
    // (diagnóstico de 13/09); reprova até `demo:desempatar` consertar.
    const [empatados] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tabelaJogos)
      .where(
        and(
          eq(tabelaJogos.status, 'ENCERRADO'),
          sql`${tabelaJogos.placarCasa} = ${tabelaJogos.placarVisitante}`,
        ),
      )
    registrar(
      'Temporada · sem empate',
      (empatados?.n ?? 0) === 0,
      (empatados?.n ?? 0) === 0
        ? 'nenhum jogo encerrado empatado'
        : `${empatados!.n} jogo(s) encerrado(s) empatado(s) — rode "npm run demo:desempatar"`,
    )
    ```
    (`db` e `tabelaJogos` são os nomes que o arquivo já usa no item "rodada de hoje" — confira as linhas ~290-300 e siga o mesmo padrão.)

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/modules/ingestao/__tests__/classificacao-empate.test.ts src/modules/ingestao/__tests__/temporada-sem-empate.test.ts`. Esperado: PASS. Depois `npx vitest run src/modules/ingestao scripts 2>/dev/null; npx vitest run src/modules/ingestao` — os testes de `demo.test.ts`/`temporada.test.ts` que liam `classificados` como número continuam válidos (o campo `classificados` continua número no resumo).

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. O typecheck é quem garante que nenhum chamador ficou lendo número onde agora vem objeto. Marcar; **não commitar**.

---

### Task 5: O reparo em produção — `demo:desempatar`

**Files:**
- Create: `src/modules/ingestao/demo/reparo-empates.ts`
- Create: `scripts/demo-desempatar.ts`
- Modify: `package.json` (script `demo:desempatar`, ao lado de `demo:conferencias`)
- Test: `src/modules/ingestao/__tests__/reparo-empates.test.ts` (novo)

**Interfaces:**
- Produces:
  ```ts
  export async function repararEmpates(
    db: Db,
    ruleset: Ruleset,
    opcoes: { hoje: string; semente?: string },
  ): Promise<{ encontrados: number; reparados: number; classificacao: { linhas: number; empates: number } }>
  ```
- Consumes: `desempatar`, `criarSorteio`, `SEMENTE_TEMPORADA` (`./simulacao`); `decomporPontos` (`./dados`); `semearPlacares(db, ids)`, `semearClassificacao(db, ruleset, hoje)` (`./jogos`). O join do time é o **mesmo** de `semearPlacares` (`niveis` da versão ativa, atributo `PONTOS`) — nunca `jogadores.time_id`.

- [ ] **Step 1: Teste que falha** — `src/modules/ingestao/__tests__/reparo-empates.test.ts`:

```ts
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { estatisticasJogo, jogos, times } from '../../dominio/db/schema'
import { dataDeReferencia } from '../../dominio/rodada'
import { rulesetAtivo } from '../../entrega/ruleset-ativo'
import { LLMFake } from '../llm'
import { decomporPontos } from '../demo/dados'
import { semearPlacares } from '../demo/jogos'
import { repararEmpates } from '../demo/reparo-empates'
import { criarSorteio, desempatar, SEMENTE_TEMPORADA } from '../demo/simulacao'
import { simularAte } from '../demo/temporada'

const AGORA = new Date('2026-01-15T18:00:00.000Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let ruleset: Awaited<ReturnType<typeof rulesetAtivo>>
let hoje: string

/** As linhas do jogo com o time pelo vínculo da LISTA (o mesmo join de `semearPlacares`). */
async function linhasPorLado(jogoId: string, timeCasaId: string) {
  const r = await banco.db.execute(sql`
    select ej.id, ej.pontos::int as pontos, n.time_id
      from estatisticas_jogo ej
      join niveis n on n.jogador_id = ej.jogador_id and n.atributo = 'PONTOS'
      join niveis_versao nv on nv.id = n.niveis_versao_id and nv.ativa = true
     where ej.jogo_id = ${jogoId}
  `)
  const linhas = (('rows' in r ? r.rows : r) as { id: string; pontos: number; time_id: string }[])
  return {
    casa: linhas.filter((l) => l.time_id === timeCasaId),
    visitante: linhas.filter((l) => l.time_id !== timeCasaId),
  }
}
const soma = (l: { pontos: number }[]) => l.reduce((t, x) => t + x.pontos, 0)

beforeAll(async () => {
  banco = await bancoDeTeste()
  ruleset = await rulesetAtivo()
  hoje = dataDeReferencia(AGORA, ruleset.rodada.fuso)
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7, llm: new LLMFake() })
}, 180_000)
afterAll(async () => {
  await banco.fechar()
})

describe('repararEmpates — o passado empatado recebe a MESMA decisão que o gerador daria', () => {
  it('sem empate, não encontra nem escreve nada', async () => {
    const r = await repararEmpates(banco.db, ruleset, { hoje })
    expect(r).toMatchObject({ encontrados: 0, reparados: 0 })
    expect(r.classificacao.empates).toBe(0)
  })

  it('repara um empate plantado, com a escolha do `desempatar` puro, e a segunda execução não faz nada', async () => {
    const [jogo] = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))
      .limit(1)
    expect(jogo).toBeDefined()
    const lados = await linhasPorLado(jogo!.id, jogo!.timeCasaId)
    expect(lados.casa.length).toBeGreaterThan(0)
    expect(lados.visitante.length).toBeGreaterThan(0)

    // PLANTA o empate no box (não só no placar): o lado mais fraco recebe a
    // diferença no seu maior pontuador, desdobramento refeito — e o placar é
    // recomputado do box, como em produção.
    const diff = soma(lados.casa) - soma(lados.visitante)
    const fraco = diff > 0 ? lados.visitante : lados.casa
    const alvo = fraco.reduce((m, l) => (l.pontos > m.pontos ? l : m))
    const novo = alvo.pontos + Math.abs(diff)
    await banco.db
      .update(estatisticasJogo)
      .set({ pontos: novo, ...decomporPontos(novo) })
      .where(eq(estatisticasJogo.id, alvo.id))
    await semearPlacares(banco.db, [jogo!.id])
    const [empatado] = await banco.db.select().from(jogos).where(eq(jogos.id, jogo!.id))
    expect(empatado!.placarCasa).toBe(empatado!.placarVisitante)

    // O que o gerador decidiria com a mesma chave:
    const [casa] = await banco.db.select({ sigla: times.sigla }).from(times).where(eq(times.id, jogo!.timeCasaId))
    const [visitante] = await banco.db.select({ sigla: times.sigla }).from(times).where(eq(times.id, jogo!.timeVisitanteId))
    const antes = await linhasPorLado(jogo!.id, jogo!.timeCasaId)
    const esperado = desempatar(
      antes.casa,
      antes.visitante,
      criarSorteio(`${SEMENTE_TEMPORADA}|${jogo!.dataReferencia}|${casa!.sigla}x${visitante!.sigla}|desempate`),
    )

    const r = await repararEmpates(banco.db, ruleset, { hoje })
    expect(r).toMatchObject({ encontrados: 1, reparados: 1 })
    expect(r.classificacao.empates).toBe(0)
    const [reparado] = await banco.db.select().from(jogos).where(eq(jogos.id, jogo!.id))
    expect(reparado!.placarCasa).not.toBe(reparado!.placarVisitante)
    const depois = await linhasPorLado(jogo!.id, jogo!.timeCasaId)
    expect(soma(depois.casa)).toBe(soma(esperado.casa))
    expect(soma(depois.visitante)).toBe(soma(esperado.visitante))
    // placar continua sendo a soma do box
    expect(reparado!.placarCasa).toBe(soma(depois.casa))
    expect(reparado!.placarVisitante).toBe(soma(depois.visitante))

    const segunda = await repararEmpates(banco.db, ruleset, { hoje })
    expect(segunda).toMatchObject({ encontrados: 0, reparados: 0 })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/ingestao/__tests__/reparo-empates.test.ts`. Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** — `src/modules/ingestao/demo/reparo-empates.ts`:

```ts
import { eq, sql } from 'drizzle-orm'

import type { Db } from '../../dominio/db/tipos'
import { estatisticasJogo } from '../../dominio/db/schema'
import type { Ruleset } from '../../motor/ruleset/schema'
import { decomporPontos } from './dados'
import { semearClassificacao, semearPlacares } from './jogos'
import { criarSorteio, desempatar, SEMENTE_TEMPORADA } from './simulacao'

type Empatado = {
  id: string
  data_referencia: string
  time_casa_id: string
  casa: string
  visitante: string
}
type Linha = { id: string; pontos: number; time_id: string }

const linhasDe = (r: unknown) => (typeof r === 'object' && r !== null && 'rows' in r ? (r as { rows: unknown[] }).rows : (r as unknown[]))

/**
 * REPARO DO PASSADO EMPATADO — a mesma decisão que o gerador teria tomado.
 *
 * O gerador antigo produzia empates (diagnóstico de 13/09); o novo não. Este
 * reparo aplica `desempatar` às linhas já gravadas, com a MESMA chave que o
 * gerador usa: mesma escolha de lado, em qualquer banco. O time de cada linha
 * é o do vínculo da LISTA do CJ (versão ativa), o mesmo join de
 * `semearPlacares` — nunca `jogadores.time_id`, que é o time real do provedor.
 *
 * Idempotente: sem empate, não encontra nem escreve nada.
 */
export async function repararEmpates(
  db: Db,
  ruleset: Ruleset,
  opcoes: { hoje: string; semente?: string },
): Promise<{ encontrados: number; reparados: number; classificacao: { linhas: number; empates: number } }> {
  const semente = opcoes.semente ?? SEMENTE_TEMPORADA
  const empatados = linhasDe(
    await db.execute(sql`
      select j.id, j.data_referencia::text as data_referencia, j.time_casa_id,
             c.sigla as casa, v.sigla as visitante
        from jogos j
        join times c on c.id = j.time_casa_id
        join times v on v.id = j.time_visitante_id
       where j.status = 'ENCERRADO' and j.placar_casa = j.placar_visitante
       order by j.data_referencia, j.id
    `),
  ) as Empatado[]

  const reparados: string[] = []
  for (const jogo of empatados) {
    const linhas = linhasDe(
      await db.execute(sql`
        select ej.id, ej.pontos::int as pontos, n.time_id
          from estatisticas_jogo ej
          join niveis n on n.jogador_id = ej.jogador_id and n.atributo = 'PONTOS'
          join niveis_versao nv on nv.id = n.niveis_versao_id and nv.ativa = true
         where ej.jogo_id = ${jogo.id}
      `),
    ) as Linha[]
    const casa = linhas.filter((l) => l.time_id === jogo.time_casa_id)
    const visitante = linhas.filter((l) => l.time_id !== jogo.time_casa_id)
    const decidido = desempatar(
      casa,
      visitante,
      criarSorteio(`${semente}|${jogo.data_referencia}|${jogo.casa}x${jogo.visitante}|desempate`),
    )
    if (decidido.desempatou === null) continue
    const antes = new Map(linhas.map((l) => [l.id, l.pontos] as const))
    const mudada = [...decidido.casa, ...decidido.visitante].find((l) => l.pontos !== antes.get(l.id))
    if (!mudada) continue
    await db
      .update(estatisticasJogo)
      .set({ pontos: mudada.pontos, ...decomporPontos(mudada.pontos) })
      .where(eq(estatisticasJogo.id, mudada.id))
    reparados.push(jogo.id)
  }

  if (reparados.length > 0) await semearPlacares(db, reparados)
  const classificacao = await semearClassificacao(db, ruleset, opcoes.hoje)
  return { encontrados: empatados.length, reparados: reparados.length, classificacao }
}
```

`scripts/demo-desempatar.ts` (modelo: `scripts/demo-conferencias.ts`):

```ts
import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { repararEmpates } from '../src/modules/ingestao/demo/reparo-empates'

/**
 * Repara os jogos encerrados que nasceram empatados na demo antiga, com a
 * mesma decisão que o gerador novo tomaria, e recomputa a classificação.
 *
 *   npx dotenv -e .env.local -- npm run demo:desempatar
 *
 * Idempotente: rodar de novo não encontra empate e não escreve nada.
 */
async function principal() {
  const db = getDb()
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  const r = await repararEmpates(db, ruleset, { hoje })
  console.log(`Empates encontrados: ${r.encontrados} · reparados: ${r.reparados}`)
  console.log(`Classificação recomputada: ${r.classificacao.linhas} linhas · empates restantes: ${r.classificacao.empates}`)
  if (r.classificacao.empates > 0) process.exitCode = 1
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
```

`package.json`, ao lado de `"demo:conferencias"`: `"demo:desempatar": "vite-node scripts/demo-desempatar.ts"`.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/modules/ingestao/__tests__/reparo-empates.test.ts`. Esperado: PASS. Se o `rows` do `db.execute` vier com forma diferente no PGlite, ajuste `linhasDe` (é o único ponto que depende disso; `resultados.ts` tem um `linhasDe` já testado — reuse a mesma leitura).

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. O script **não roda contra o Neon** aqui. Marcar; **não commitar**.

---

### Task 6: Ano com quatro dígitos, e a rota que não lança

**Files:**
- Modify: `src/modules/dominio/rodada.ts:53-58` (`dataDeReferencia`)
- Modify: `src/modules/dominio/temporada.ts:35-49` (`temporadaDe`)
- Modify: `src/app/(app)/resultados/[data]/page.tsx:83-89` (`diasDaTemporada`)
- Test: `src/modules/dominio/__tests__/ano-curto.test.ts` (novo), `src/app/__tests__/resultados-url-invalida.test.ts` (novo)

**Interfaces:**
- Produces: `dataDeReferencia` devolve sempre `YYYY-MM-DD` com quatro dígitos de ano; `temporadaDe` devolve o ano inicial com quatro dígitos nos dois formatos. Nenhuma assinatura muda.

- [ ] **Step 1: Testes que falham** — `src/modules/dominio/__tests__/ano-curto.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { dataDeReferencia } from '../rodada'
import { calendarioDoRuleset, temporadaDe } from '../temporada'
import { carregarRuleset } from '../../motor/ruleset/carregar'

const FUSO = 'America/Sao_Paulo'

describe('ano com quatro dígitos (diagnóstico de 13/09, B2)', () => {
  it('dataDeReferencia não perde os zeros do ano', () => {
    expect(dataDeReferencia(new Date('0001-01-01T12:00:00.000Z'), FUSO)).toBe('0001-01-01')
    expect(dataDeReferencia(new Date('0999-12-31T12:00:00.000Z'), FUSO)).toBe('0999-12-31')
    expect(dataDeReferencia(new Date('2026-01-15T18:00:00.000Z'), FUSO)).toBe('2026-01-15')
  })

  it('temporadaDe escreve o ano inicial com quatro dígitos — é ele que vira a abertura da temporada', () => {
    const cal = calendarioDoRuleset(carregarRuleset('config/ruleset.v1.yaml'))
    const rotulo = temporadaDe(new Date('0001-01-01T12:00:00.000Z'), cal)
    expect(rotulo).toMatch(/^\d{4}(-\d{2})?$/)
    expect(rotulo.startsWith('0000')).toBe(true)
  })
})
```

(Se `carregarRuleset` tiver outra assinatura, use `rulesetAtivo()` de `../../entrega/ruleset-ativo` num `beforeAll`.)

`src/app/__tests__/resultados-url-invalida.test.ts` (arnês de `telas-demo.test.ts`, sem semeadura — a rodada vazia basta):

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: '00000000-0000-4000-8000-000000000001', email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', () => ({
  avaliarAcesso: async () => ({ permitido: true }),
}))
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db, fecharDb: async () => {} }))
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return { ...real, useRouter: () => ({ refresh: () => {} }) }
})

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})

async function renderizar(data: string) {
  const { default: Pagina } = await import('../(app)/resultados/[data]/page')
  return Pagina({ params: Promise.resolve({ data }), searchParams: Promise.resolve({}) })
}

describe('URL de resultados: data válida de qualquer ano não lança', () => {
  it.each(['0001-01-01', '0999-12-31', '9999-12-31'])('%s renderiza uma rodada vazia', async (data) => {
    await expect(renderizar(data)).resolves.toBeDefined()
  })
  it.each(['abc', '2026-02-30', '2026-13-45', '2026-1-5'])('%s redireciona para a rodada de hoje', async (data) => {
    await expect(renderizar(data)).rejects.toThrow('NEXT_REDIRECT')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/dominio/__tests__/ano-curto.test.ts src/app/__tests__/resultados-url-invalida.test.ts`. Esperado: FAIL — `'1-01-01'` em vez de `'0001-01-01'`; e `0001-01-01`/`0999-12-31` rejeitam com `RangeError: Invalid time value` (o sintoma do diagnóstico).

- [ ] **Step 3: Implementar** — em `rodada.ts`, `dataDeReferencia`:

```ts
export function dataDeReferencia(agora: Date, fuso: string): string {
  const p = partes(agora, fuso)
  // Quatro dígitos SEMPRE: `Intl` devolve "1" para o ano 1, e uma data "1-01-01"
  // chegava a `Date.parse` como NaN três funções depois (diagnóstico de 13/09).
  const ano = String(p.year).padStart(4, '0')
  const mes = String(p.month).padStart(2, '0')
  const dia = String(p.day).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
```

Em `temporada.ts`, `temporadaDe` — os dois retornos passam a preencher o ano:

```ts
  const anoInicialTexto = String(anoInicial).padStart(4, '0')
  if (config.formato === 'ano_inicial') return anoInicialTexto

  // "2025-26" — dois dígitos finais do ano seguinte, com zero à esquerda na
  // virada de século (2099-00).
  const seguinte = String((anoInicial + 1) % 100).padStart(2, '0')
  return `${anoInicialTexto}-${seguinte}`
```

Em `page.tsx`, `diasDaTemporada` — a última linha `return Math.max(1, dias + 1)` vira:

```ts
  // Defesa em profundidade: com o ano preenchido isto não dispara, mas uma
  // abertura ilegível não pode virar NaN dentro de `somarDias`.
  return Number.isFinite(dias) ? Math.max(1, dias + 1) : 1
```

- [ ] **Step 4: Rodar e ver passar** — os dois arquivos acima, depois `npx vitest run src/modules/dominio src/app/__tests__/telas-04-resultados.test.ts src/app/__tests__/resultados-url-invalida.test.ts`. Esperado: PASS; nenhum rótulo de temporada existente muda (anos de quatro dígitos já vinham certos).

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 7: CI com `build` e artefato de conferência; o flake deixa HTML

**Files:**
- Modify: `.github/workflows/ci.yml` (depois do passo `test`)
- Modify: `src/app/__tests__/telas-demo.test.ts` (teste "os horários dos jogos saem no fuso, não no do servidor", ~linha 402)

**Interfaces:**
- Produces: em falha de CI, o artefato `conferencia` contém `.superpowers/conferencia/flake-00-00.html` quando esse teste falhou.

- [ ] **Step 1: O teste grava o HTML ao falhar** — em `telas-demo.test.ts`, acrescente `onTestFailed` ao import de `vitest`, e dentro do teste "os horários dos jogos saem no fuso, não no do servidor", logo depois da linha que define `html`:

```ts
    // Flake registrado em 13/09 e nunca reproduzido: na próxima ocorrência, o
    // HTML fica em disco para alguém ver ONDE o "00:00" apareceu. Não depende
    // de CONFERENCIA=1 — é justamente no CI, sem ela, que o flake vive.
    onTestFailed(async () => {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const dir = process.env.CONFERENCIA_DIR ?? '.superpowers/conferencia'
      await mkdir(dir, { recursive: true })
      await writeFile(`${dir}/flake-00-00.html`, html)
    })
```

- [ ] **Step 2: Provar que grava** — temporariamente troque `expect(html).not.toContain('00:00')` por `expect(html).toContain('NUNCA-EXISTE')`, rode `npx vitest run src/app/__tests__/telas-demo.test.ts -t "os horários dos jogos"`, confira que falha **e** que `.superpowers/conferencia/flake-00-00.html` existe; **desfaça a troca** e apague o arquivo. Rode de novo: PASS.

- [ ] **Step 3: CI** — em `.github/workflows/ci.yml`, depois do passo `test`:

```yaml
      - name: build
        run: npm run build

      - name: conferência (HTML das telas na falha)
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: conferencia
          path: .superpowers/conferencia
          if-no-files-found: ignore
```

Verificado em 13/09: `next build` passa sem `.env.local` — nenhuma variável nova no CI.

- [ ] **Step 4: Verificar** — `npm run build` local (limpo) e `npm run lint`. Marcar; **não commitar**.

---

### Task 8: Fechamento — bateria, commit único, publicação e reparo

**Files:**
- Modify: `docs/superpowers/specs/2026-09-13-correcoes-do-diagnostico-design.md` (status), `docs/superpowers/relatorios/2026-09-13-diagnostico-nip.md` (marcar o que foi corrigido)
- Test: tudo

- [ ] **Step 1: Bateria inteira** — `npm run typecheck && npm run lint && npm run boundaries && npm test && npm run build`. Esperado: verde. Se uma suíte falhar só em paralelo, rode-a isolada antes de investigar.

- [ ] **Step 2: Os loops do diagnóstico, de novo** — `npx vite-node <scratchpad>/debug/loop-d-invariantes.ts` (invariantes de 21 dias): esperado **0 empates, 0 times divergentes** — o loop que abriu o bug fecha verde. Se o scratchpad da sessão não existir mais, o teste `temporada-sem-empate.test.ts` cobre o mesmo.

- [ ] **Step 3: Docs** — na spec, `**Status:** implementada em <data>`. No relatório, marcar B1, B2 e T2 como corrigidos com o commit.

- [ ] **Step 4: Commit único** — `git add -A` (confira com `git status` que **não** há `node_modules`, `.superpowers/` nem `scratchpad/` no índice) e:

```bash
git commit -F - <<'EOF'
Tira o empate da demo, repara o passado e fecha os furos do diagnóstico de 13/09

A simulação passa a desempatar no gerador, sobre as linhas que viram placar,
com o PRNG semeado pela chave do jogo: o placar continua sendo a soma do box e
a temporada continua reproduzível. A classificação deixa de decidir empate com
">" — que dava a vitória ao visitante e mentia na tabela — e passa a contá-lo
como estado inválido; o demo:conferir reprova enquanto houver um. O script
demo:desempatar aplica a mesma decisão ao passado que já está em produção.

A data com ano abaixo de 1000 deixava de ter quatro dígitos em dois lugares e
virava NaN três funções depois — um 500 para usuário logado. Consertado na raiz.

O arnês de teste passa a esperar as consultas em voo antes de fechar o PGlite:
fechar com consulta pendente girava o worker a 100% de CPU sem fim, e um teste
vermelho podia segurar o CI até o timeout. O CI ganha o build e sobe o HTML de
conferência quando falha.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Publicar** — `git push -u origin <branch>`, `gh pr create --base main --fill`, CI verde (agora com `build`), `gh pr merge --squash --delete-branch`, deploy de produção pronto.

- [ ] **Step 6: Reparo no Neon, nesta ordem, uma vez** — `npx dotenv -e .env.local -- npm run demo:desempatar` (esperado: `Empates encontrados: 8 · reparados: 8` e `empates restantes: 0`) → `npx dotenv -e .env.local -- npm run demo:conferir` (verde, com o item novo "Temporada · sem empate") → a consulta só-leitura do diagnóstico (`scratchpad/debug/prod-empates.ts`, ou o SQL equivalente): **0 empates, 0 divergentes**.

- [ ] **Step 7: Conferir na tela** — abrir `/estatisticas` em produção e ver a classificação sem V-D estranho; abrir `/resultados/2026-09-09` (um dos dias que tinha empate) e ver o jogo com vencedor.

---

## Auto-revisão

**Cobertura da spec.** §3.1 desempate → Task 2. §3.2 ponto de aplicação → Task 3. §3.3 classificação + gate → Task 4. §3.4 reparo → Task 5. §4 B2 (dois `padStart` + guarda) → Task 6. §5 T2 → Task 1. §6 infra (CI build, artefato, `onTestFailed`) → Task 7. §7 "pronto quando": nenhum empate após `simularAte` (Task 3), `desempatar` puro (Task 2), `empates: n` (Task 4), reparo idempotente e igual ao gerador (Task 5), gate (Task 4), rotas de ano curto (Task 6), `fechar()` (Task 1), CI (Task 7), produção 0/0 (Task 8). §8 ordem de publicação → Task 8. §9 riscos: a escolha do reparo igual à do gerador é afirmada pelo teste da Task 5; `pg_sleep` tem alternativa escrita na Task 1.

**Placeholder scan.** Todo passo de código tem o código. Os pontos "confira o nome que o arquivo usa" (`db`/`tabelaJogos` no `demo-conferir`, `carregarRuleset` vs `rulesetAtivo`) apontam para linhas concretas e trazem a alternativa — não são lacunas.

**Consistência de nomes.** `desempatar`/`CESTA_DE_DESEMPATE`/`criarSorteio`/`SEMENTE_TEMPORADA` (2 → 3, 5). `semearClassificacao` devolvendo `{ linhas, empates }` (4 → 5, e o teste da 5 lê `classificacao.empates`). `repararEmpates(db, ruleset, { hoje, semente? })` (5 → script). `fechar()` assíncrono (1 → todos os `afterAll`). A chave do desempate é a mesma string nas Tasks 3 e 5 e no teste da 5.

**Riscos.** (1) O `rows` de `db.execute` no PGlite: a Task 5 isola a leitura em `linhasDe` e aponta o `linhasDe` já testado de `resultados.ts`. (2) `temporada.test.ts` afirma números de jogos específicos; só os jogos que empatavam mudam — a Task 3 diz como tratar. (3) `demo.test.ts` e `temporada.test.ts` dependem de ordem (T1); nenhuma task acrescenta teste a eles.
