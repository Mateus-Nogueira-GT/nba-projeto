# Temporada simulada — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o seed de "um dia roteirizado" por uma temporada simulada de 7 semanas em que cada dia é sorteado dentro de faixas por nível e a Lista Secreta de cada dia é publicada pelo motor real ANTES de o dia ser jogado — de modo que a taxa de acerto de Resultados seja consequência das regras.

**Architecture:** Um gerador puro (`simulacao.ts`: calendário, desfalques, box scores por semente+dia) e um orquestrador por dia (`temporada.ts`: `simularAte`) que reaproveita o pipeline real — `publicarListaSecreta`, `recalcularMedias`, `executarCiclo`. Os pedaços do seed atual que os dois seeders compartilham (cadastro, upsert de jogo, placares, box de time, classificação, bloco ao vivo, odds) são extraídos para módulos próprios. `semearDemo` sobrevive **só** como fixture dos exemplos literais do documento do CJ para as suítes de outras features; produção (cron, scripts) e o teste de fumaça das telas usam `simularAte`.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle + Postgres (Neon em produção, PGlite nos testes), Vitest, vite-node para scripts.

**Spec:** [`docs/superpowers/specs/2026-09-06-temporada-simulada-design.md`](../specs/2026-09-06-temporada-simulada-design.md) — leia a errata da seção 4 antes de começar.

## Global Constraints

- Domínio em português, infraestrutura em inglês (CLAUDE.md). Nomes de função, tipo e variável em português.
- `simulacao.ts` **não importa nada com I/O, rede, banco ou relógio** — tempo e a lista entram como argumento (mesma disciplina do motor). Pode importar de `./dados` (puro) e de `../../motor/tipos` (só tipos e constantes).
- Nenhuma regra de estratégia no código: nada em `simulacao.ts` lê ou reproduz delta, marco, multiplicador. Os testes de distribuição usam os deltas **do ruleset carregado**, nunca digitados.
- Idempotência: rodar `simularAte` duas vezes no mesmo instante não muda contagem alguma. `apitos` tem UNIQUE — nunca contornar.
- `semearDemo` (fixture) **não muda de comportamento**: a suíte `src/modules/ingestao/__tests__/demo.test.ts` inteira é o teste de regressão das extrações das Tasks 3 e 4.
- Faixas da spec §2 (média-alvo por nível de PONTOS): MVP 27–31 · All Star 18–23 · Suporte 11–16 · Randola 5–9. Minutos-alvo: MVP 34–37 · All Star 30–34 · Suporte 22–28 · Randola 10–18. Minutos do time somam 240.
- Semente: `SEMENTE_TEMPORADA = 'ia-nba-demo-2025-26'`.
- Texto da faixa: exatamente `Temporada demonstrativa · dados simulados`. Só aparece com `DEMO_AUTOSSEMEADURA === 'true'`.
- Cron `/api/cron/demo` passa `orcamentoMs: 240_000` (a função tem `maxDuration = 300`).
- Comandos de verificação ao fim de cada task: `npx vitest run <arquivo>`; ao fim do plano: `npm run typecheck && npm run lint && npm run boundaries && npm test`.
- Commits pequenos, mensagem em português, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/modules/ingestao/demo/dados.ts` | modificar | exportar `semente` |
| `src/modules/ingestao/demo/simulacao.ts` | criar | puro: `criarSorteio`, `gerarCalendario`, `elencosDaLista`, `desfalquesDoDia`, `boxScoreDoTime` |
| `src/modules/ingestao/demo/__tests__/simulacao.test.ts` | criar | testes puros do gerador |
| `src/modules/ingestao/demo/cadastro.ts` | criar (extração) | times, jogadores, mapa, níveis PONTOS + REB/AST derivados |
| `src/modules/ingestao/demo/jogos.ts` | criar (extração) | `upsertJogoDemo`, `semearPlacares`, `semearBoxScoreDoTime`, `semearClassificacao` |
| `src/modules/ingestao/demo/ao-vivo.ts` | criar (extração) | `semearJogoAoVivo` parametrizado |
| `src/modules/ingestao/demo/odds.ts` | criar (extração) | `semearOdds`, `CASAS_DEMO` |
| `src/modules/ingestao/demo/semear.ts` | modificar | vira fixture fina: `semearDemo` + `limparDemo` importando dos módulos acima |
| `src/modules/ingestao/demo/temporada.ts` | criar | `simularAte` |
| `src/modules/ingestao/__tests__/temporada.test.ts` | criar | integração PGlite |
| `scripts/demo-temporada.ts` | criar | carga inicial com progresso |
| `scripts/demo-seed.ts` | modificar | chama `simularAte` |
| `package.json` | modificar | script `demo:temporada` |
| `src/app/api/cron/demo/route.ts` | modificar | chama `simularAte` com orçamento |
| `src/app/api/cron/demo/__tests__/route.test.ts` | criar | guarda + orçamento |
| `src/components/navegacao/FaixaDemonstracao.tsx` | criar | a faixa |
| `src/components/navegacao/index.ts` | modificar | reexport |
| `src/app/layout.tsx` | modificar | renderiza a faixa |
| `src/app/__tests__/faixa-demonstracao.test.ts` | criar | render com/sem env |
| `src/app/__tests__/telas-demo.test.ts` | modificar | semeia com `simularAte` |
| `scripts/demo-conferir.ts` | modificar | itens novos |
| `docs/runbooks/deploy.md` | modificar | seção da demo |

---

### Task 1: Gerador puro — sorteio e calendário

**Files:**
- Modify: `src/modules/ingestao/demo/dados.ts:17` (exportar `semente`)
- Create: `src/modules/ingestao/demo/simulacao.ts`
- Test: `src/modules/ingestao/demo/__tests__/simulacao.test.ts`

**Interfaces:**
- Consumes: `semente(nome: string): number` de `./dados` (hash FNV já existente, hoje não exportado).
- Produces:
  - `SEMENTE_TEMPORADA: string`
  - `criarSorteio(chave: string): () => number` — PRNG determinístico em [0,1).
  - `type JogoSim = { casa: string; visitante: string; horaLocal: string }`
  - `type Calendario = Map<string, JogoSim[]>` (chave `YYYY-MM-DD`)
  - `gerarCalendario(opcoes: { siglas: readonly string[]; dias: readonly string[]; semente: string }): Calendario`

- [ ] **Step 1: Exportar `semente` em `dados.ts`**

Em `src/modules/ingestao/demo/dados.ts`, troque `function semente(nome: string): number {` por `export function semente(nome: string): number {`. Nada mais muda.

- [ ] **Step 2: Escrever os testes do sorteio e do calendário (falham)**

Crie `src/modules/ingestao/demo/__tests__/simulacao.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { somarDias } from '../../../dominio/rodada'
import { lerListaDeNiveis } from '../../niveis/parser'
import { criarSorteio, gerarCalendario, SEMENTE_TEMPORADA } from '../simulacao'

const analise = lerListaDeNiveis(readFileSync('data/fontes/introducao-ia-nba.md', 'utf8'))
const SIGLAS = [...new Set(analise.jogadores.map((j) => j.timeSigla).filter((s): s is string => s !== null))]

function diasDesde(inicio: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => somarDias(inicio, i))
}

describe('criarSorteio', () => {
  it('é determinístico por chave e devolve valores em [0,1)', () => {
    const a = criarSorteio('x')
    const b = criarSorteio('x')
    const c = criarSorteio('y')
    const sa = Array.from({ length: 5 }, () => a())
    const sb = Array.from({ length: 5 }, () => b())
    const sc = Array.from({ length: 5 }, () => c())
    expect(sa).toEqual(sb)
    expect(sa).not.toEqual(sc)
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('gerarCalendario', () => {
  const DIAS = diasDesde('2026-07-19', 49)
  const calendario = gerarCalendario({ siglas: SIGLAS, dias: DIAS, semente: SEMENTE_TEMPORADA })

  it('a lista do CJ tem 30 times com sigla', () => {
    expect(SIGLAS).toHaveLength(30)
  })

  it('mesma semente → calendário idêntico; semente diferente → outro', () => {
    const outra = gerarCalendario({ siglas: SIGLAS, dias: DIAS, semente: SEMENTE_TEMPORADA })
    expect([...outra.entries()]).toEqual([...calendario.entries()])
    const diferente = gerarCalendario({ siglas: SIGLAS, dias: DIAS, semente: 'outra' })
    expect([...diferente.entries()]).not.toEqual([...calendario.entries()])
  })

  it('nenhum dia fica vazio e cada rodada tem entre 4 e 10 jogos', () => {
    for (const dia of DIAS) {
      const jogos = calendario.get(dia) ?? []
      expect(jogos.length).toBeGreaterThanOrEqual(4)
      expect(jogos.length).toBeLessThanOrEqual(10)
    }
  })

  it('nenhum time joga duas vezes no mesmo dia nem em dias seguidos', () => {
    let ontem = new Set<string>()
    for (const dia of DIAS) {
      const hoje = new Set<string>()
      for (const j of calendario.get(dia) ?? []) {
        expect(j.casa).not.toBe(j.visitante)
        for (const s of [j.casa, j.visitante]) {
          expect(hoje.has(s)).toBe(false)
          expect(ontem.has(s)).toBe(false)
          hoje.add(s)
        }
      }
      ontem = hoje
    }
  })

  it('cada time faz 3 ou 4 jogos por semana: ≤4 em qualquer janela de 7 dias, ≥3 em cada bloco de 7, 20–26 na temporada', () => {
    const jogosPorTime = new Map<string, number[]>() // índices de dia
    DIAS.forEach((dia, i) => {
      for (const j of calendario.get(dia) ?? []) {
        for (const s of [j.casa, j.visitante]) jogosPorTime.set(s, [...(jogosPorTime.get(s) ?? []), i])
      }
    })
    expect(jogosPorTime.size).toBe(30)
    for (const [, indices] of jogosPorTime) {
      expect(indices.length).toBeGreaterThanOrEqual(20)
      expect(indices.length).toBeLessThanOrEqual(26)
      for (let inicio = 0; inicio + 7 <= DIAS.length; inicio++) {
        const naJanela = indices.filter((i) => i >= inicio && i < inicio + 7).length
        expect(naJanela).toBeLessThanOrEqual(4)
        if (inicio % 7 === 0) expect(naJanela).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('horários em meia-horas entre 19:00 e 22:30', () => {
    for (const dia of DIAS) {
      for (const j of calendario.get(dia) ?? []) {
        expect(j.horaLocal).toMatch(/^(19|20|21|22):(00|30)$/)
      }
    }
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/modules/ingestao/demo/__tests__/simulacao.test.ts`
Expected: FAIL — `Cannot find module '../simulacao'`.

- [ ] **Step 4: Implementar `simulacao.ts` (sorteio + calendário)**

Crie `src/modules/ingestao/demo/simulacao.ts`:

```ts
/**
 * GERADOR PURO DA TEMPORADA SIMULADA.
 *
 * Nada aqui toca banco, rede ou relógio: dias, elencos e semente entram como
 * argumento e o resultado é função só deles. É a mesma disciplina do motor,
 * pelo mesmo motivo — dá para testar a distribuição sem subir Postgres.
 *
 * Tudo é determinístico pela SEMENTE combinada com o dia e com o nome: o dia
 * 23 tem os mesmos jogos e os mesmos números seja produzido hoje ou daqui a
 * uma semana. É isso que deixa o cron preencher lacunas sem reescrever nada.
 */
import { semente } from './dados'

export const SEMENTE_TEMPORADA = 'ia-nba-demo-2025-26'

/** mulberry32 sobre o hash FNV de `dados.ts`. Determinístico por chave. */
export function criarSorteio(chave: string): () => number {
  let a = semente(chave) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function embaralhar<T>(lista: readonly T[], sorteio: () => number): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j]!, copia[i]!]
  }
  return copia
}

// ---------------------------------------------------------------------------
// CALENDÁRIO
// ---------------------------------------------------------------------------

export type JogoSim = { casa: string; visitante: string; horaLocal: string }
export type Calendario = Map<string, JogoSim[]>

const HORARIOS = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30'] as const

/**
 * Regras do calendário (spec §1): ninguém joga em dias seguidos; entre 8 e 10
 * jogos por dia quando há times descansados o bastante; quem descansou há
 * mais tempo entra primeiro. Com 30 times isso dá 3–4 jogos por semana para
 * cada um — o próprio descanso obrigatório é o teto.
 */
export function gerarCalendario(opcoes: {
  siglas: readonly string[]
  dias: readonly string[]
  semente: string
}): Calendario {
  const ultimoJogo = new Map<string, number>()
  const calendario: Calendario = new Map()

  opcoes.dias.forEach((dia, indice) => {
    const sorteio = criarSorteio(`${opcoes.semente}|calendario|${dia}`)
    const elegiveis = opcoes.siglas.filter((s) => (ultimoJogo.get(s) ?? -Infinity) < indice - 1)
    const teto = 8 + Math.floor(sorteio() * 3)

    // Embaralha ANTES de ordenar por descanso: o sort é estável, então o
    // empate entre times igualmente descansados sai do sorteio, não da
    // ordem da lista.
    const porDescanso = embaralhar(elegiveis, sorteio).sort(
      (a, b) => (ultimoJogo.get(a) ?? -1) - (ultimoJogo.get(b) ?? -1),
    )
    const quantos = Math.min(teto * 2, porDescanso.length - (porDescanso.length % 2))
    const escalados = embaralhar(porDescanso.slice(0, quantos), sorteio)

    const jogos: JogoSim[] = []
    for (let i = 0; i + 1 < escalados.length; i += 2) {
      const a = escalados[i]!
      const b = escalados[i + 1]!
      const aEmCasa = sorteio() < 0.5
      jogos.push({
        casa: aEmCasa ? a : b,
        visitante: aEmCasa ? b : a,
        horaLocal: HORARIOS[Math.floor(sorteio() * HORARIOS.length)]!,
      })
      ultimoJogo.set(a, indice)
      ultimoJogo.set(b, indice)
    }
    calendario.set(dia, jogos)
  })

  return calendario
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/modules/ingestao/demo/__tests__/simulacao.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
git add src/modules/ingestao/demo/dados.ts src/modules/ingestao/demo/simulacao.ts src/modules/ingestao/demo/__tests__/simulacao.test.ts
git commit -m "Temporada simulada: sorteio determinístico e calendário de 30 times

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Gerador puro — elencos, desfalques e box score

**Files:**
- Modify: `src/modules/ingestao/demo/simulacao.ts`
- Test: `src/modules/ingestao/demo/__tests__/simulacao.test.ts`

**Interfaces:**
- Consumes: `JogadorNaLista` (`../niveis/parser`, tipo), `mediaDe`, `niveisDoJogador` (`./dados`), `NIVEIS`, `Nivel`, `Atributo` (`../../motor/tipos`).
- Produces:
  - `type JogadorSim = { nome: string; nivel: Nivel; posicaoHierarquia: number; niveis: Record<Atributo, Nivel>; medias: { ppg: number; rpg: number; apg: number } }`
  - `elencosDaLista(jogadores: readonly JogadorNaLista[]): Map<string, JogadorSim[]>` — por sigla, ordenado por hierarquia.
  - `desfalquesDoDia(opcoes: { dia: string; jogos: readonly JogoSim[]; elencos: Map<string, JogadorSim[]>; semente: string }): Map<string, string[]>` — sigla → nomes fora.
  - `type LinhaBox = { nome: string; minutos: number; pontos: number; rebotes: number; assistencias: number }`
  - `boxScoreDoTime(opcoes: { chave: string; elenco: readonly JogadorSim[]; fora: readonly string[] }): LinhaBox[]`
  - `MINIMO_EM_QUADRA = 6`

- [ ] **Step 1: Escrever os testes (falham)**

Acrescente ao fim de `simulacao.test.ts`:

```ts
import { readFileSync as lerArquivo } from 'node:fs'
import { carregarRuleset } from '../../../motor/ruleset/carregar'
import { boxScoreDoTime, desfalquesDoDia, elencosDaLista, MINIMO_EM_QUADRA } from '../simulacao'
import type { JogadorSim, LinhaBox } from '../simulacao'

const ruleset = carregarRuleset(lerArquivo('config/ruleset.v1.yaml', 'utf8'))
const FAIXA_PPG = { MVP: [27, 31], ALL_STAR: [18, 23], SUPORTE: [11, 16], RANDOLA: [5, 9] } as const

describe('elencosDaLista', () => {
  const elencos = elencosDaLista(analise.jogadores)

  it('um elenco por sigla, 6 a 9 jogadores, ordenado por hierarquia', () => {
    expect(elencos.size).toBe(30)
    for (const [, elenco] of elencos) {
      expect(elenco.length).toBeGreaterThanOrEqual(6)
      expect(elenco.length).toBeLessThanOrEqual(9)
      for (let i = 1; i < elenco.length; i++) {
        expect(elenco[i]!.posicaoHierarquia).toBeGreaterThan(elenco[i - 1]!.posicaoHierarquia)
      }
    }
  })

  it('a média-alvo de pontos cai na faixa do nível (ou no número do documento)', () => {
    for (const [, elenco] of elencos) {
      for (const j of elenco) {
        const [min, max] = FAIXA_PPG[j.nivel]
        // LeBron é SUPORTE na lista e 25,7 no documento — o documento manda.
        if (j.nome.toLowerCase() === 'lebron james') continue
        expect(j.medias.ppg).toBeGreaterThanOrEqual(min)
        expect(j.medias.ppg).toBeLessThanOrEqual(max)
      }
    }
  })
})

describe('temporada inteira simulada (calendário + desfalques + box)', () => {
  const DIAS = diasDesde('2026-07-19', 49)
  const elencos = elencosDaLista(analise.jogadores)
  const calendario = gerarCalendario({ siglas: SIGLAS, dias: DIAS, semente: SEMENTE_TEMPORADA })

  type Registro = { dia: string; sigla: string; jogador: JogadorSim; linha: LinhaBox }
  const registros: Registro[] = []
  const foraPorDia = new Map<string, Map<string, string[]>>()

  for (const dia of DIAS) {
    const jogos = calendario.get(dia) ?? []
    const fora = desfalquesDoDia({ dia, jogos, elencos, semente: SEMENTE_TEMPORADA })
    foraPorDia.set(dia, fora)
    for (const jogo of jogos) {
      for (const sigla of [jogo.casa, jogo.visitante]) {
        const elenco = elencos.get(sigla)!
        const linhas = boxScoreDoTime({
          chave: `${SEMENTE_TEMPORADA}|${dia}|${jogo.casa}x${jogo.visitante}|${sigla}`,
          elenco,
          fora: fora.get(sigla) ?? [],
        })
        for (const linha of linhas) {
          registros.push({ dia, sigla, jogador: elenco.find((j) => j.nome === linha.nome)!, linha })
        }
      }
    }
  }

  it('é determinístico: a mesma chave produz o mesmo box', () => {
    const elenco = elencos.get('OKC')!
    const a = boxScoreDoTime({ chave: 'k', elenco, fora: [] })
    const b = boxScoreDoTime({ chave: 'k', elenco, fora: [] })
    expect(a).toEqual(b)
    expect(boxScoreDoTime({ chave: 'outra', elenco, fora: [] })).not.toEqual(a)
  })

  it('quem está fora não tem linha, e sobram ao menos 6 em quadra', () => {
    for (const [dia, fora] of foraPorDia) {
      for (const [sigla, nomes] of fora) {
        const elenco = elencos.get(sigla)!
        expect(elenco.length - nomes.length).toBeGreaterThanOrEqual(MINIMO_EM_QUADRA)
        const linhas = registros.filter((r) => r.dia === dia && r.sigla === sigla)
        for (const nome of nomes) expect(linhas.some((l) => l.linha.nome === nome)).toBe(false)
      }
    }
  })

  it('desfalques acontecem, e o topo da hierarquia cai com mais frequência', () => {
    let topo = 0
    let resto = 0
    let jogosDoTopo = 0
    let jogosDoResto = 0
    for (const [, fora] of foraPorDia) {
      for (const [sigla, nomes] of fora) {
        const elenco = elencos.get(sigla)!
        for (const j of elenco) {
          const caiu = nomes.includes(j.nome)
          if (j.posicaoHierarquia <= 3) {
            jogosDoTopo += 1
            if (caiu) topo += 1
          } else {
            jogosDoResto += 1
            if (caiu) resto += 1
          }
        }
      }
    }
    expect(topo).toBeGreaterThan(0)
    expect(topo / jogosDoTopo).toBeGreaterThan(resto / jogosDoResto)
  })

  it('os minutos do time fecham 240 e ninguém passa de 48', () => {
    const porTimeJogo = new Map<string, number>()
    for (const r of registros) {
      expect(r.linha.minutos).toBeLessThanOrEqual(48)
      expect(r.linha.minutos).toBeGreaterThan(0)
      const chave = `${r.dia}|${r.sigla}`
      porTimeJogo.set(chave, (porTimeJogo.get(chave) ?? 0) + r.linha.minutos)
    }
    for (const [, soma] of porTimeJogo) expect(soma).toBe(240)
  })

  it('a média da liga por nível fica na faixa; cada jogador fica a ≤5 pontos da própria média-alvo', () => {
    const porJogador = new Map<string, { alvo: number; nivel: JogadorSim['nivel']; pontos: number[] }>()
    for (const r of registros) {
      const chave = `${r.sigla}|${r.jogador.nome}`
      const atual = porJogador.get(chave) ?? { alvo: r.jogador.medias.ppg, nivel: r.jogador.nivel, pontos: [] }
      atual.pontos.push(r.linha.pontos)
      porJogador.set(chave, atual)
    }
    const desvioPorNivel = new Map<string, number[]>()
    for (const [, j] of porJogador) {
      const media = j.pontos.reduce((a, v) => a + v, 0) / j.pontos.length
      expect(Math.abs(media - j.alvo)).toBeLessThanOrEqual(5)
      desvioPorNivel.set(j.nivel, [...(desvioPorNivel.get(j.nivel) ?? []), media - j.alvo])
    }
    for (const [, desvios] of desvioPorNivel) {
      const medio = desvios.reduce((a, v) => a + v, 0) / desvios.length
      expect(Math.abs(medio)).toBeLessThanOrEqual(1)
    }
  })

  it('oscilações existem em volume plausível: 10%–45% dos jogos de MVP ficam ≤ média − delta', () => {
    const delta = ruleset.oscilacao.delta.MVP
    const deMvp = registros.filter((r) => r.jogador.nivel === 'MVP')
    const abaixo = deMvp.filter((r) => r.linha.pontos <= r.jogador.medias.ppg - delta).length
    const fracao = abaixo / deMvp.length
    expect(fracao).toBeGreaterThanOrEqual(0.1)
    expect(fracao).toBeLessThanOrEqual(0.45)
  })

  it('existem sequências de 2 e de 3 jogos abaixo de média − delta na liga', () => {
    const porJogador = new Map<string, { nivel: JogadorSim['nivel']; alvo: number; serie: number[] }>()
    for (const r of registros) {
      const chave = `${r.sigla}|${r.jogador.nome}`
      const atual = porJogador.get(chave) ?? { nivel: r.jogador.nivel, alvo: r.jogador.medias.ppg, serie: [] }
      atual.serie.push(r.linha.pontos)
      porJogador.set(chave, atual)
    }
    let maiorSequencia = 0
    for (const [, j] of porJogador) {
      const delta = ruleset.oscilacao.delta[j.nivel]
      let atual = 0
      for (const p of j.serie) {
        atual = p <= j.alvo - delta ? atual + 1 : 0
        maiorSequencia = Math.max(maiorSequencia, atual)
      }
    }
    expect(maiorSequencia).toBeGreaterThanOrEqual(3)
  })

  it('rebotes e assistências são inteiros não negativos', () => {
    for (const r of registros) {
      expect(Number.isInteger(r.linha.rebotes)).toBe(true)
      expect(Number.isInteger(r.linha.assistencias)).toBe(true)
      expect(r.linha.rebotes).toBeGreaterThanOrEqual(0)
      expect(r.linha.assistencias).toBeGreaterThanOrEqual(0)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ingestao/demo/__tests__/simulacao.test.ts`
Expected: FAIL — `elencosDaLista is not a function` (ou export ausente).

- [ ] **Step 3: Implementar elencos, desfalques e box**

Acrescente a `src/modules/ingestao/demo/simulacao.ts` (imports no topo, resto no fim):

```ts
import type { JogadorNaLista } from '../niveis/parser'
import { NIVEIS } from '../../motor/tipos'
import type { Atributo, Nivel } from '../../motor/tipos'
import { mediaDe, niveisDoJogador, semente } from './dados'
```

(remova o `import { semente } from './dados'` anterior — ele vira a linha acima.)

```ts
// ---------------------------------------------------------------------------
// ELENCOS
// ---------------------------------------------------------------------------

export type JogadorSim = {
  nome: string
  nivel: Nivel
  posicaoHierarquia: number
  niveis: Record<Atributo, Nivel>
  medias: { ppg: number; rpg: number; apg: number }
}

/** Por sigla, na ordem da hierarquia do CJ. Quem não tem sigla fica de fora. */
export function elencosDaLista(jogadores: readonly JogadorNaLista[]): Map<string, JogadorSim[]> {
  const elencos = new Map<string, JogadorSim[]>()
  for (const j of jogadores) {
    if (j.timeSigla === null) continue
    const lista = elencos.get(j.timeSigla) ?? []
    lista.push({
      nome: j.nomeNaLista,
      nivel: j.nivel,
      posicaoHierarquia: j.posicaoHierarquia,
      niveis: niveisDoJogador(j.nomeNaLista, j.nivel),
      medias: mediaDe(j.nomeNaLista, j.nivel),
    })
    elencos.set(j.timeSigla, lista)
  }
  for (const lista of elencos.values()) lista.sort((a, b) => a.posicaoHierarquia - b.posicaoHierarquia)
  return elencos
}

// ---------------------------------------------------------------------------
// DESFALQUES
// ---------------------------------------------------------------------------

/** Menos que isso em quadra e os minutos não fecham 240 sem ninguém passar de 48. */
export const MINIMO_EM_QUADRA = 6
const CHANCE_FORA_TOPO = 0.06
const CHANCE_FORA_RESTO = 0.03

/**
 * Quem está fora em cada time que joga no dia. O topo da hierarquia cai com
 * mais frequência de propósito: é o desfalque em PREFIXO que abre a OPD, e
 * sem ele a regra nunca apareceria na demonstração.
 */
export function desfalquesDoDia(opcoes: {
  dia: string
  jogos: readonly JogoSim[]
  elencos: Map<string, JogadorSim[]>
  semente: string
}): Map<string, string[]> {
  const fora = new Map<string, string[]>()
  for (const jogo of opcoes.jogos) {
    for (const sigla of [jogo.casa, jogo.visitante]) {
      const elenco = opcoes.elencos.get(sigla) ?? []
      const sorteio = criarSorteio(`${opcoes.semente}|desfalques|${opcoes.dia}|${sigla}`)
      const nomes: string[] = []
      for (const j of elenco) {
        if (elenco.length - nomes.length <= MINIMO_EM_QUADRA) break
        const chance = j.posicaoHierarquia <= 3 ? CHANCE_FORA_TOPO : CHANCE_FORA_RESTO
        if (sorteio() < chance) nomes.push(j.nome)
      }
      fora.set(sigla, nomes)
    }
  }
  return fora
}

// ---------------------------------------------------------------------------
// BOX SCORE
// ---------------------------------------------------------------------------

export type LinhaBox = { nome: string; minutos: number; pontos: number; rebotes: number; assistencias: number }

const MINUTOS_ALVO: Record<Nivel, [number, number]> = {
  MVP: [34, 37],
  ALL_STAR: [30, 34],
  SUPORTE: [22, 28],
  RANDOLA: [10, 18],
}

/**
 * Espalhamento do jogo a jogo em torno da média-alvo, por nível do ATRIBUTO.
 * É desvio de simulação, não regra do CJ: nada aqui é lido pelo motor. Os
 * números foram escolhidos para que 10–45% dos jogos de um MVP fiquem abaixo
 * de média − 3 (o teste de distribuição trava isso contra o ruleset).
 */
const SIGMA: Record<Atributo, Record<Nivel, number>> = {
  PONTOS: { MVP: 6, ALL_STAR: 5, SUPORTE: 4, RANDOLA: 3 },
  REBOTES: { MVP: 3, ALL_STAR: 2.5, SUPORTE: 2, RANDOLA: 2 },
  ASSISTENCIAS: { MVP: 2.5, ALL_STAR: 2, SUPORTE: 1.5, RANDOLA: 1.5 },
}

/** Soma de três uniformes centrada em zero — sino simples, desvio ≈ 1. */
function ruido(sorteio: () => number): number {
  return (sorteio() + sorteio() + sorteio() - 1.5) * 2
}

function minutosDoTime(emQuadra: readonly JogadorSim[], sorteio: () => number): number[] {
  const alvos = emQuadra.map((j) => {
    const [min, max] = MINUTOS_ALVO[j.nivel]
    return min + sorteio() * (max - min)
  })
  const soma = alvos.reduce((a, v) => a + v, 0)
  const minutos = alvos.map((m) => Math.min(48, Math.max(1, Math.round((m / soma) * 240))))
  // Fecha exatamente 240 sem ninguém passar de 48: o resto vai para quem tem espaço.
  let falta = 240 - minutos.reduce((a, v) => a + v, 0)
  for (let i = 0; falta !== 0 && i < minutos.length; i++) {
    const ajuste = falta > 0 ? Math.min(falta, 48 - minutos[i]!) : Math.max(falta, 1 - minutos[i]!)
    minutos[i] = minutos[i]! + ajuste
    falta -= ajuste
  }
  return minutos
}

export function boxScoreDoTime(opcoes: {
  chave: string
  elenco: readonly JogadorSim[]
  fora: readonly string[]
}): LinhaBox[] {
  const emQuadra = opcoes.elenco.filter((j) => !opcoes.fora.includes(j.nome))
  if (emQuadra.length === 0) return []
  const minutos = minutosDoTime(emQuadra, criarSorteio(`${opcoes.chave}|minutos`))

  return emQuadra.map((j, i) => {
    const sorteio = criarSorteio(`${opcoes.chave}|${j.nome}`)
    const [min, max] = MINUTOS_ALVO[j.nivel]
    // Mais minutos, mais produção — mas pouco: o fator fica entre 0,85 e 1,045
    // para a média da temporada não escapar da faixa do nível.
    const fator = 0.85 + 0.15 * Math.min(1.3, minutos[i]! / ((min + max) / 2))
    const valor = (media: number, sigma: number) => Math.max(0, Math.round(media * fator + ruido(sorteio) * sigma))
    return {
      nome: j.nome,
      minutos: minutos[i]!,
      pontos: valor(j.medias.ppg, SIGMA.PONTOS[j.nivel]),
      rebotes: valor(j.medias.rpg, SIGMA.REBOTES[j.niveis.REBOTES]),
      assistencias: valor(j.medias.apg, SIGMA.ASSISTENCIAS[j.niveis.ASSISTENCIAS]),
    }
  })
}
```

Nota: `NIVEIS` importado só se for usado; se o lint reclamar de import não usado, remova-o.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/ingestao/demo/__tests__/simulacao.test.ts`
Expected: PASS. Se o teste de fração (10–45%) ou o de desvio médio (≤1) falhar, ajuste **só** `SIGMA.PONTOS` ou o fator de minutos; não toque nos testes.

- [ ] **Step 5: Fronteira e commit**

Run: `npm run boundaries` — Expected: sem violação (o módulo só importa `./dados`, `../niveis/parser` como tipo e `../../motor/tipos`).

```bash
git add src/modules/ingestao/demo/simulacao.ts src/modules/ingestao/demo/__tests__/simulacao.test.ts
git commit -m "Temporada simulada: elencos, desfalques e box score sorteados por nível

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Extrair `cadastro.ts` e `jogos.ts` de `semear.ts` (sem mudar comportamento)

**Files:**
- Create: `src/modules/ingestao/demo/cadastro.ts`
- Create: `src/modules/ingestao/demo/jogos.ts`
- Modify: `src/modules/ingestao/demo/semear.ts` (passos 1, 1b, `criarJogo`, `semearPlacares`, `semearBoxScoreDoTime`, `semearClassificacao`)
- Test (regressão): `src/modules/ingestao/__tests__/demo.test.ts`, `src/modules/ingestao/__tests__/demo-fotos.test.ts`

**Interfaces:**
- Produces (`cadastro.ts`):
  - `ARQUIVO_LISTA`, `PROVEDOR_DEMO`, `chaveDeNome(nome: string): string`
  - `type Cadastro = { analise: ResultadoParse; timePorSigla: Map<string, string>; jogadorPorChave: Map<string, string>; versaoNiveis: string }`
  - `semearCadastro(db: Db, agora: Date): Promise<Cadastro>`
- Produces (`jogos.ts`):
  - `upsertJogoDemo(db, opcoes: { timeCasaId: string; timeVisitanteId: string; quandoUtc: Date; dataReferencia: string; status?: 'AGENDADO'|'AO_VIVO'|'ENCERRADO'; quartoAtual?: number | null }): Promise<string>`
  - `semearPlacares(db, jogoIds?: readonly string[]): Promise<number>`
  - `semearBoxScoreDoTime(db, agora: Date, jogoIds?: readonly string[]): Promise<number>`
  - `semearClassificacao(db, ruleset, dataReferencia: string): Promise<number>`

- [ ] **Step 1: Rodar a suíte da demo antes de mexer (linha de base)**

Run: `npx vitest run src/modules/ingestao/__tests__/demo.test.ts src/modules/ingestao/__tests__/demo-fotos.test.ts`
Expected: PASS. Anote o número de testes.

- [ ] **Step 2: Criar `cadastro.ts` movendo os passos 1 e 1b**

Crie `src/modules/ingestao/demo/cadastro.ts` com o conteúdo dos passos "1 · Times e jogadores canônicos" e "1b · REBOTES e ASSISTÊNCIAS" de `semear.ts` (linhas ~98–180), embrulhados assim:

```ts
import { readFile } from 'node:fs/promises'

import { jogadores, mapaJogadores, niveis, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { ativarVersaoNiveis } from '../../dominio/repositorios/niveis'
import { ATRIBUTOS } from '../../motor/tipos'
import { importarListaDeNiveis } from '../niveis/importar'
import { lerListaDeNiveis } from '../niveis/parser'
import type { ResultadoParse } from '../niveis/parser'
import { niveisDoJogador, nomeDeExibicao, posicaoDe } from './dados'

export const ARQUIVO_LISTA = 'data/fontes/introducao-ia-nba.md'
export const PROVEDOR_DEMO = 'demo'

/** A CHAVE é o nome do CJ em caixa baixa — `nomeCompleto` recebe a versão de exibição. */
export const chaveDeNome = (nome: string): string => nome.toLowerCase()

export type Cadastro = {
  analise: ResultadoParse
  timePorSigla: Map<string, string>
  /** chaveDeNome(nomeNaLista) → jogadores.id */
  jogadorPorChave: Map<string, string>
  versaoNiveis: string
}

/**
 * Times, jogadores, vínculo (mapa_jogadores) e níveis — a parte do seed que
 * os DOIS seeders (fixture roteirizada e temporada simulada) compartilham.
 * Idempotente: reexecutar não insere ninguém de novo.
 */
export async function semearCadastro(db: Db, agora: Date): Promise<Cadastro> {
  const conteudo = await readFile(ARQUIVO_LISTA, 'utf8')
  const analise = lerListaDeNiveis(conteudo)

  // ... (cole aqui, sem alterar, o corpo do passo 1: times, jogadores,
  //      mapaJogadores, importarListaDeNiveis + ativarVersaoNiveis)
  // ... (cole aqui, sem alterar, o passo 1b: níveis derivados de REB/AST)

  return {
    analise,
    timePorSigla,
    jogadorPorChave: jaExistentes,
    versaoNiveis: relatorio.versao,
  }
}
```

Em `semear.ts`: remova esses dois passos e as importações que só eles usavam; no início de `semearDemo` escreva:

```ts
const { analise, timePorSigla, jogadorPorChave: jaExistentes, versaoNiveis } = await semearCadastro(db, agora)
```

e mantenha `export { ARQUIVO_LISTA } from './cadastro'` em `semear.ts` (há quem importe de lá). No `return` final troque `versaoNiveis: relatorio.versao` por `versaoNiveis`.

- [ ] **Step 3: Criar `jogos.ts` movendo `criarJogo` (como função de módulo), `semearPlacares`, `semearBoxScoreDoTime`, `semearClassificacao`**

Crie `src/modules/ingestao/demo/jogos.ts`:

```ts
import { and, eq, isNotNull, or, sql } from 'drizzle-orm'

import { classificacao, jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { intervaloDoDia } from '../../dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import type { Ruleset } from '../../motor/ruleset/schema'

type StatusJogo = 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'

/**
 * Upsert de jogo pelas DUAS chaves naturais. (Cole aqui o comentário longo
 * de `criarJogo` sobre `data_referencia` × `data_jogo` — ele explica o 23505.)
 */
export async function upsertJogoDemo(
  db: Db,
  opcoes: {
    timeCasaId: string
    timeVisitanteId: string
    quandoUtc: Date
    dataReferencia: string
    status?: StatusJogo
    quartoAtual?: number | null
  },
): Promise<string> {
  const situacao = { status: opcoes.status ?? ('AGENDADO' as const), quartoAtual: opcoes.quartoAtual ?? null }
  const dataJogoUtc = opcoes.quandoUtc.toISOString().slice(0, 10)
  const [existente] = await db
    .select({ id: jogos.id })
    .from(jogos)
    .where(
      and(
        eq(jogos.timeCasaId, opcoes.timeCasaId),
        eq(jogos.timeVisitanteId, opcoes.timeVisitanteId),
        or(eq(jogos.dataReferencia, opcoes.dataReferencia), eq(jogos.dataJogo, dataJogoUtc)),
      ),
    )
    .limit(1)

  if (existente) {
    await db.update(jogos).set(situacao).where(eq(jogos.id, existente.id))
    return existente.id
  }
  const [linha] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: opcoes.quandoUtc,
      dataReferencia: opcoes.dataReferencia,
      timeCasaId: opcoes.timeCasaId,
      timeVisitanteId: opcoes.timeVisitanteId,
      ...situacao,
    })
    .returning({ id: jogos.id })
  if (!linha) throw new Error('upsertJogoDemo: insert sem retorno')
  return linha.id
}

/** `and j.id in (...)` quando há filtro; vazio quando não há. */
function filtroDeJogos(jogoIds: readonly string[] | undefined) {
  if (jogoIds === undefined) return sql``
  if (jogoIds.length === 0) return sql`and false`
  return sql`and j.id in (${sql.join(
    jogoIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`
}

function contarLinhas(resultado: unknown): number {
  const linhas = Array.isArray(resultado)
    ? (resultado as unknown[])
    : ((resultado as { rows?: unknown[] }).rows ?? [])
  return linhas.length
}

export async function semearPlacares(db: Db, jogoIds?: readonly string[]): Promise<number> {
  // (cole o SQL atual de semearPlacares, acrescentando `${filtroDeJogos(jogoIds)}`
  //  logo após `where j.status = 'ENCERRADO'`)
  const resultado = await db.execute(sql`
    with pontos_por_time as (
      select ej.jogo_id, n.time_id, sum(ej.pontos)::int as pontos
      from estatisticas_jogo ej
      join niveis n on n.jogador_id = ej.jogador_id and n.atributo = 'PONTOS'
      join niveis_versao nv on nv.id = n.niveis_versao_id and nv.ativa = true
      group by 1, 2
    )
    update jogos j
       set placar_casa = casa.pontos,
           placar_visitante = fora.pontos
      from pontos_por_time casa, pontos_por_time fora
     where j.status = 'ENCERRADO'
       ${filtroDeJogos(jogoIds)}
       and casa.jogo_id = j.id and casa.time_id = j.time_casa_id
       and fora.jogo_id = j.id and fora.time_id = j.time_visitante_id
    returning j.id
  `)
  return contarLinhas(resultado)
}

export async function semearBoxScoreDoTime(db: Db, agora: Date, jogoIds?: readonly string[]): Promise<number> {
  // (cole o SQL atual de semearBoxScoreDoTime; na CTE `por_time`, a linha
  //  `join jogos j on j.id = ej.jogo_id and j.status = 'ENCERRADO'` ganha
  //  `${filtroDeJogos(jogoIds)}` logo depois de `and j.status = 'ENCERRADO'`)
  ...
  return contarLinhas(resultado)
}

export async function semearClassificacao(db: Db, ruleset: Ruleset, dataReferencia: string): Promise<number> {
  // (cole o corpo atual, sem alterar)
}
```

Em `semear.ts`: apague as três funções e o closure `criarJogo`; importe as quatro de `./jogos`; substitua cada `criarJogo(casa, visitante, quandoUtc, dia, extra)` por:

```ts
const timeCasaId = idDoTime(casa)
const timeVisitanteId = idDoTime(visitante)
const jogoId =
  timeCasaId && timeVisitanteId
    ? await upsertJogoDemo(db, { timeCasaId, timeVisitanteId, quandoUtc, dataReferencia: dia, ...extra })
    : null
```

(há três chamadas: histórico, rodada de hoje; mantenha a semântica `null` quando a sigla não existe.) `semearPlacares(db)` e `semearBoxScoreDoTime(db, agora)` continuam sendo chamadas sem filtro na fixture.

- [ ] **Step 4: Rodar a regressão**

Run: `npx vitest run src/modules/ingestao/__tests__/demo.test.ts src/modules/ingestao/__tests__/demo-fotos.test.ts && npm run typecheck`
Expected: PASS com o mesmo número de testes do Step 1; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ingestao/demo/cadastro.ts src/modules/ingestao/demo/jogos.ts src/modules/ingestao/demo/semear.ts
git commit -m "Demo: extrai cadastro e jogos do seed para módulos compartilhados

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Extrair `ao-vivo.ts` e `odds.ts` (sem mudar comportamento)

**Files:**
- Create: `src/modules/ingestao/demo/ao-vivo.ts`
- Create: `src/modules/ingestao/demo/odds.ts`
- Modify: `src/modules/ingestao/demo/semear.ts`
- Test (regressão): `src/modules/ingestao/__tests__/demo.test.ts`, `src/modules/entrega/estatisticas/__tests__/jogo.test.ts`

**Interfaces:**
- Produces (`ao-vivo.ts`):
  - `type JogadorAoVivo = { nome: string; jogadorId: string; nivel: Nivel; timeId: string }`
  - `semearJogoAoVivo(db, ruleset, opcoes: { jogoId: string; timeCasaId: string; timeVisitanteId: string; elenco: readonly JogadorAoVivo[]; protagonistas: Record<Atributo, string | null>; chave: string; agora: Date }): Promise<void>`
- Produces (`odds.ts`): `CASAS_DEMO`, `semearOdds(db, ruleset, dataReferencia: string, agora: Date): Promise<number>`

- [ ] **Step 1: Criar `odds.ts`**

Mova `CASAS_DEMO` e `semearOdds` (com seus comentários) de `semear.ts` para `src/modules/ingestao/demo/odds.ts`, exportando os dois. Imports necessários: `inArray` (drizzle), `casas, oddsAgregada, oddsSnapshot` (schema), `Db`, `lerFeed` (`../../entrega/lista-secreta`), `faixaEstatica` (`../../motor/atributos`), `agregar` (`../../motor/odds/agregar`), `Ruleset`.

- [ ] **Step 2: Criar `ao-vivo.ts` com o bloco do 1º quarto parametrizado**

Crie `src/modules/ingestao/demo/ao-vivo.ts`. É o bloco `if (jogoAoVivo !== null) { ... }` de `semear.ts` (do `const quarto = ruleset.fire_live.quarto` até o `insert(fireLiveExecucoes)`), com estas substituições e nada mais:

```ts
import { eq } from 'drizzle-orm'

import { estatisticasJogo, estatisticasQuarto, estatisticasTimeJogo, fireLiveExecucoes, jogos } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { marcosDoNivel } from '../../motor/atributos'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo, Nivel } from '../../motor/tipos'
import { boxComplementar, decomporPontos, historicoOscilacao, mediaDe, naFaixa, niveisDoJogador } from './dados'

export type JogadorAoVivo = { nome: string; jogadorId: string; nivel: Nivel; timeId: string }

/**
 * 1º QUARTO AO VIVO — o elenco inteiro dos dois times. (Cole aqui os
 * comentários do bloco original: elenco inteiro, marcos de REB/AST dentro do
 * 1Q irreal de propósito, box parcial da tela de partida, box do time só do
 * Q1.)
 *
 * `protagonistas`: quem cruza o primeiro marco de green por atributo (e, em
 * pontos, os 75% do modo fire). Na fixture são Shai/Jokić/Murray; na
 * temporada simulada, o bloco de topo do jogo que o calendário escolheu.
 * `chave` entra no gerador de variação — '1Q' preserva os números da fixture.
 */
export async function semearJogoAoVivo(
  db: Db,
  ruleset: Ruleset,
  opcoes: {
    jogoId: string
    timeCasaId: string
    timeVisitanteId: string
    elenco: readonly JogadorAoVivo[]
    protagonistas: Record<Atributo, string | null>
    chave: string
    agora: Date
  },
): Promise<void> {
  const quarto = ruleset.fire_live.quarto
  const quartos = ruleset.fire_live.quartos_por_jogo
  let pontosCasa = 0
  let pontosVisitante = 0

  for (const j of opcoes.elenco) {
    const m = mediaDe(j.nome, j.nivel)
    const derivados = niveisDoJogador(j.nome, j.nivel)
    const noQuarto = (media: number, atributo: Atributo): number => {
      const sequencia = historicoOscilacao(media / quartos, 1, 0, {
        variacao: `${opcoes.chave}|${j.nome}|${atributo}`,
      })
      return Math.max(0, sequencia[0] ?? Math.round(media / quartos))
    }
    const cruzarMarco = (atributo: Atributo, media: number): number | null => {
      const marco = marcosDoNivel(derivados[atributo], atributo, ruleset)[0]
      if (marco === undefined) return null
      return atributo === 'PONTOS'
        ? Math.max(Math.ceil(media * ruleset.fire_live.modo_fire.percentual_media), marco)
        : marco
    }
    const valorDoQuarto = (atributo: Atributo, media: number): number =>
      j.nome === opcoes.protagonistas[atributo]
        ? (cruzarMarco(atributo, media) ?? noQuarto(media, atributo))
        : noQuarto(media, atributo)

    const valores = {
      pontos: valorDoQuarto('PONTOS', m.ppg),
      rebotes: valorDoQuarto('REBOTES', m.rpg),
      assistencias: valorDoQuarto('ASSISTENCIAS', m.apg),
    }
    // ... (estatisticasQuarto upsert, estatisticasJogo parcial upsert com
    //      `naFaixa(j.nome, '1q-min', [4, 11])`, exatamente como no original)

    if (j.timeId === opcoes.timeCasaId) pontosCasa += valores.pontos
    else pontosVisitante += valores.pontos
  }

  await db.update(jogos).set({ placarCasa: pontosCasa, placarVisitante: pontosVisitante }).where(eq(jogos.id, opcoes.jogoId))

  for (const [timeId, pontosTime] of [
    [opcoes.timeCasaId, pontosCasa],
    [opcoes.timeVisitanteId, pontosVisitante],
  ] as const) {
    // ... (estatisticasTimeJogo só do Q1, exatamente como no original)
  }

  await db.insert(fireLiveExecucoes).values({ jogoId: opcoes.jogoId, iniciadoEm: opcoes.agora }).onConflictDoNothing()
}
```

No original a variação era `` `1Q|${j.nomeNaLista}|${atributo}` `` — com `chave: '1Q'` a string fica idêntica, e os números da fixture não mudam.

- [ ] **Step 3: Substituir o bloco em `semear.ts`**

No lugar do bloco `if (jogoAoVivo !== null) { ... }`:

```ts
if (jogoAoVivo !== null) {
  const timeCasaId = idDoTime('OKC')
  const timeVisitanteId = idDoTime('DEN')
  if (timeCasaId && timeVisitanteId) {
    const elenco: JogadorAoVivo[] = []
    for (const j of analise.jogadores) {
      if (j.timeSigla !== 'OKC' && j.timeSigla !== 'DEN') continue
      const jogadorId = jaExistentes.get(chaveDeNome(j.nomeNaLista))
      if (jogadorId === undefined) continue
      elenco.push({ nome: j.nomeNaLista, jogadorId, nivel: j.nivel, timeId: j.timeSigla === 'OKC' ? timeCasaId : timeVisitanteId })
    }
    await semearJogoAoVivo(db, ruleset, {
      jogoId: jogoAoVivo,
      timeCasaId,
      timeVisitanteId,
      elenco,
      protagonistas: { PONTOS: 'Shai', REBOTES: 'Jokic', ASSISTENCIAS: 'Jamal Murray' },
      chave: '1Q',
      agora,
    })
  }
}
```

Importe `semearOdds` de `./odds` e `semearJogoAoVivo`, `JogadorAoVivo` de `./ao-vivo`. Remova de `semear.ts` os imports que sobraram sem uso.

- [ ] **Step 4: Regressão + typecheck + lint**

Run: `npx vitest run src/modules/ingestao/__tests__/demo.test.ts src/modules/entrega/estatisticas/__tests__/jogo.test.ts src/app/__tests__/telas-demo.test.ts && npm run typecheck && npm run lint`
Expected: PASS, mesmo número de testes; sem erro de tipo ou lint.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ingestao/demo/ao-vivo.ts src/modules/ingestao/demo/odds.ts src/modules/ingestao/demo/semear.ts
git commit -m "Demo: extrai o 1º quarto ao vivo (parametrizado) e as odds fictícias

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `simularAte` — dias passados (agendar → publicar → jogar → recalcular)

**Files:**
- Create: `src/modules/ingestao/demo/temporada.ts`
- Test: `src/modules/ingestao/__tests__/temporada.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `publicarListaSecreta` (`../../entrega/lista-secreta`), `recalcularMedias` (`../sincronizar/medias`), `excluded` (`../sincronizar/upsert`), `dataDeReferencia`/`intervaloDoDia`/`somarDias` (`../../dominio/rodada`), `calendarioDoRuleset`/`temporadaDe` (`../../dominio/temporada`).
- Produces:
  - `type OpcoesTemporada = { llm?: PortaLLM; diasDeHistorico?: number; orcamentoMs?: number; semente?: string; aoProduzirDia?: (dia: string, indice: number, total: number) => void }`
  - `type ResumoTemporada = { inicio: string; hoje: string; diasProduzidos: number; diasRestantes: number; jogosCriados: number; boxScores: number; publicacoes: number; jogosHoje: number; itensListaSecreta: number; apitosFireLive: number; linhasComOdd: number; classificados: number; times: number; jogadores: number; versaoNiveis: string }`
  - `simularAte(db: Db, ruleset: Ruleset, agora: Date, opcoes?: OpcoesTemporada): Promise<ResumoTemporada>`
  - Nesta task, o bloco de HOJE ainda não existe: `jogosHoje`, `itensListaSecreta`, `apitosFireLive`, `linhasComOdd` saem 0. A Task 6 completa.

- [ ] **Step 1: Escrever os testes dos dias passados (falham)**

Crie `src/modules/ingestao/__tests__/temporada.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { apitos, estatisticasJogo, feedSnapshot, jogos, lesoesEscalacao, mediasJogador } from '../../dominio/db/schema'
import { somarDias } from '../../dominio/rodada'
import { conferirRodadas } from '../../entrega/resultados'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { simularAte } from '../demo/temporada'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
// 15:00 em Brasília de um sábado de setembro — dentro da temporada 2025-26.
const AGORA = new Date('2026-09-05T18:00:00.000Z')
const HOJE = '2026-09-05'

describe('simularAte — dias passados (PGlite)', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let resumo: Awaited<ReturnType<typeof simularAte>>

  beforeAll(async () => {
    banco = await bancoDeTeste()
    resumo = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 3 })
  }, 180_000)
  afterAll(async () => {
    await banco.fechar()
  })

  it('produz exatamente os dias da janela, nenhum a mais', async () => {
    expect(resumo.inicio).toBe(somarDias(HOJE, -3))
    expect(resumo.hoje).toBe(HOJE)
    expect(resumo.diasProduzidos).toBe(3)
    expect(resumo.diasRestantes).toBe(0)
    const passados = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
    expect(new Set(passados.map((j) => j.dataReferencia)).size).toBe(3)
    for (const j of passados) {
      expect(j.dataReferencia >= resumo.inicio).toBe(true)
      expect(j.status).toBe('ENCERRADO')
      expect(j.placarCasa).not.toBeNull()
      expect(j.placarVisitante).not.toBeNull()
    }
  })

  it('cada dia passado tem Lista Secreta publicada ANTES do jogo e apitos ligados aos jogos daquele dia', async () => {
    const passados = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
    for (const dia of new Set(passados.map((j) => j.dataReferencia))) {
      const [snapshot] = await banco.db
        .select()
        .from(feedSnapshot)
        .where(and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')))
        .limit(1)
      expect(snapshot, `snapshot de ${dia}`).toBeDefined()
      const idsDoDia = passados.filter((j) => j.dataReferencia === dia).map((j) => j.id)
      const primeiro = Math.min(...passados.filter((j) => j.dataReferencia === dia).map((j) => j.dataHoraUtc.getTime()))
      expect(snapshot!.geradoEm.getTime()).toBeLessThan(primeiro)
      const doDia = await banco.db.select().from(apitos).where(inArray(apitos.jogoId, idsDoDia))
      expect(doDia.every((a) => a.estrategia === 'LISTA_SECRETA')).toBe(true)
    }
    expect(resumo.publicacoes).toBe(3)
  })

  it('o placar é a soma do box, e todo jogo encerrado tem box dos dois lados', async () => {
    const passados = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
    const box = await banco.db.select().from(estatisticasJogo)
    for (const j of passados) {
      const doJogo = box.filter((b) => b.jogoId === j.id)
      expect(doJogo.length).toBeGreaterThanOrEqual(12)
      const total = doJogo.reduce((s, b) => s + b.pontos, 0)
      expect(total).toBe(j.placarCasa! + j.placarVisitante!)
      expect(doJogo.every((b) => Number(b.minutos) > 0)).toBe(true)
      expect(doJogo.every((b) => b.cestasC * 0 + b.doisC * 2 + b.tresC * 3 + b.lanceC === b.pontos)).toBe(true)
    }
    expect(resumo.boxScores).toBe(box.length)
  })

  it('as médias em medias_jogador são as amostrais dos jogos simulados', async () => {
    const medias = await banco.db.select().from(mediasJogador).where(eq(mediasJogador.janela, 'TEMPORADA'))
    expect(medias.length).toBeGreaterThan(100)
    const box = await banco.db.select().from(estatisticasJogo)
    for (const m of medias.slice(0, 20)) {
      const doJogador = box.filter((b) => b.jogadorId === m.jogadorId)
      expect(m.jogos).toBe(doJogador.length)
      const ppg = doJogador.reduce((s, b) => s + b.pontos, 0) / doJogador.length
      expect(Number(m.ppg)).toBeCloseTo(ppg, 1)
    }
  })

  it('a conferência (leitura) vê os dias passados e há green E red', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 3)
    const cards = dias.flatMap((d) => d.jogadores).filter((j) => j.valor !== null)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.some((j) => j.maiorLinhaBatida !== null)).toBe(true)
    expect(cards.some((j) => j.maiorLinhaBatida === null)).toBe(true)
  })

  it('rodar de novo no mesmo instante não muda nada', async () => {
    const antes = {
      jogos: (await banco.db.select().from(jogos)).length,
      box: (await banco.db.select().from(estatisticasJogo)).length,
      apitos: (await banco.db.select().from(apitos)).length,
      lesoes: (await banco.db.select().from(lesoesEscalacao)).length,
    }
    const segunda = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 3 })
    expect(segunda.diasProduzidos).toBe(0)
    expect({
      jogos: (await banco.db.select().from(jogos)).length,
      box: (await banco.db.select().from(estatisticasJogo)).length,
      apitos: (await banco.db.select().from(apitos)).length,
      lesoes: (await banco.db.select().from(lesoesEscalacao)).length,
    }).toEqual(antes)
  }, 120_000)

  it('apagar o box de um dia faz só aquele dia ser refeito, com os mesmos jogos', async () => {
    const dia = somarDias(HOJE, -2)
    const doDia = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    const ids = doDia.map((j) => j.id)
    const chaves = doDia.map((j) => `${j.timeCasaId}|${j.timeVisitanteId}`).sort()
    await banco.db.delete(estatisticasJogo).where(inArray(estatisticasJogo.jogoId, ids))
    await banco.db.update(jogos).set({ status: 'AGENDADO', placarCasa: null }).where(inArray(jogos.id, ids))

    const terceira = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 3 })
    expect(terceira.diasProduzidos).toBe(1)
    const refeito = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    expect(refeito.map((j) => `${j.timeCasaId}|${j.timeVisitanteId}`).sort()).toEqual(chaves)
    expect(refeito.every((j) => j.status === 'ENCERRADO')).toBe(true)
  }, 120_000)

  it('com orçamento pequeno para entre dias e informa o que falta; a chamada seguinte completa', async () => {
    const outro = await bancoDeTeste()
    try {
      const parcial = await simularAte(outro.db, ruleset, AGORA, { diasDeHistorico: 3, orcamentoMs: 1 })
      expect(parcial.diasProduzidos).toBeLessThan(3)
      expect(parcial.diasProduzidos + parcial.diasRestantes).toBe(3)
      const completo = await simularAte(outro.db, ruleset, AGORA, { diasDeHistorico: 3 })
      expect(completo.diasRestantes).toBe(0)
      expect(completo.diasProduzidos).toBe(parcial.diasRestantes)
    } finally {
      await outro.fechar()
    }
  }, 180_000)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ingestao/__tests__/temporada.test.ts`
Expected: FAIL — `Cannot find module '../demo/temporada'`.

- [ ] **Step 3: Implementar `temporada.ts` (dias passados)**

Crie `src/modules/ingestao/demo/temporada.ts`:

```ts
import { and, eq, gte, inArray, lt } from 'drizzle-orm'

import { estatisticasJogo, jogos, lesoesEscalacao } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { dataDeReferencia, intervaloDoDia, somarDias } from '../../dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { publicarListaSecreta } from '../../entrega/lista-secreta'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { PortaLLM } from '../llm'
import { recalcularMedias } from '../sincronizar/medias'
import { excluded } from '../sincronizar/upsert'
import { chaveDeNome, semearCadastro } from './cadastro'
import type { Cadastro } from './cadastro'
import { boxComplementar, decomporPontos } from './dados'
import { semearBoxScoreDoTime, semearClassificacao, upsertJogoDemo } from './jogos'
import {
  boxScoreDoTime,
  desfalquesDoDia,
  elencosDaLista,
  gerarCalendario,
  SEMENTE_TEMPORADA,
} from './simulacao'
import type { Calendario, JogadorSim, JogoSim } from './simulacao'

export const DIAS_DE_HISTORICO_PADRAO = 49

export type OpcoesTemporada = {
  /** Só o dia de HOJE recebe a porta. Dias passados publicam sem narrativa. */
  llm?: PortaLLM
  diasDeHistorico?: number
  /** Para entre dias quando estoura. O bloco de hoje roda sempre. */
  orcamentoMs?: number
  semente?: string
  aoProduzirDia?: (dia: string, indice: number, total: number) => void
}

export type ResumoTemporada = {
  inicio: string
  hoje: string
  diasProduzidos: number
  diasRestantes: number
  jogosCriados: number
  boxScores: number
  publicacoes: number
  jogosHoje: number
  itensListaSecreta: number
  apitosFireLive: number
  linhasComOdd: number
  classificados: number
  times: number
  jogadores: number
  versaoNiveis: string
}

type Contexto = {
  db: Db
  ruleset: Ruleset
  cadastro: Cadastro
  elencos: Map<string, JogadorSim[]>
  calendario: Calendario
  semente: string
  fuso: string
}

/**
 * Para cada dia entre o início da janela e hoje que ainda não existe no
 * banco, produza-o; depois pare. Rodar de novo não faz nada. Se o cron perder
 * três dias, a próxima execução produz os três. Ver spec §3.
 */
export async function simularAte(
  db: Db,
  ruleset: Ruleset,
  agora: Date,
  opcoes: OpcoesTemporada = {},
): Promise<ResumoTemporada> {
  const inicioDaExecucao = Date.now()
  const orcamento = opcoes.orcamentoMs ?? Number.POSITIVE_INFINITY
  const semente = opcoes.semente ?? SEMENTE_TEMPORADA
  const { fuso } = ruleset.rodada
  const config = calendarioDoRuleset(ruleset)

  const cadastro = await semearCadastro(db, agora)
  const elencos = elencosDaLista(cadastro.analise.jogadores)
  const siglas = [...elencos.keys()].sort()

  const hoje = dataDeReferencia(agora, fuso)
  const inicio = inicioDaJanela(hoje, agora, opcoes.diasDeHistorico ?? DIAS_DE_HISTORICO_PADRAO, config)
  const dias: string[] = []
  for (let d = inicio; d <= hoje; d = somarDias(d, 1)) dias.push(d)
  const calendario = gerarCalendario({ siglas, dias, semente })

  const contexto: Contexto = { db, ruleset, cadastro, elencos, calendario, semente, fuso }

  const passados = dias.filter((d) => d < hoje)
  const completos = await diasCompletos(db, inicio, hoje, calendario)
  const pendentes = passados.filter((d) => !completos.has(d))

  let diasProduzidos = 0
  let jogosCriados = 0
  let boxScores = 0
  let publicacoes = 0
  let classificados = 0
  for (const [indice, dia] of pendentes.entries()) {
    if (Date.now() - inicioDaExecucao > orcamento) break
    opcoes.aoProduzirDia?.(dia, indice, pendentes.length)
    const r = await produzirDiaPassado(contexto, dia)
    diasProduzidos += 1
    jogosCriados += r.jogos
    boxScores += r.boxScores
    publicacoes += r.publicou ? 1 : 0
    classificados = r.classificados
  }

  return {
    inicio,
    hoje,
    diasProduzidos,
    diasRestantes: pendentes.length - diasProduzidos,
    jogosCriados,
    boxScores,
    publicacoes,
    jogosHoje: 0,
    itensListaSecreta: 0,
    apitosFireLive: 0,
    linhasComOdd: 0,
    classificados,
    times: cadastro.timePorSigla.size,
    jogadores: cadastro.jogadorPorChave.size,
    versaoNiveis: cadastro.versaoNiveis,
  }
}

/** hoje − N dias, nunca antes da abertura da temporada corrente (spec §1). */
function inicioDaJanela(
  hoje: string,
  agora: Date,
  diasDeHistorico: number,
  config: ReturnType<typeof calendarioDoRuleset>,
): string {
  const temporada = temporadaDe(agora, config)
  const anoBase = temporada.slice(0, 4)
  const abertura = `${anoBase}-${String(config.mesInicio).padStart(2, '0')}-01`
  const recuado = somarDias(hoje, -diasDeHistorico)
  return recuado < abertura ? abertura : recuado
}

/**
 * "Dia existe" = todos os jogos do calendário daquele dia estão ENCERRADOS e
 * cada um tem box score. Um dia pela metade é refeito inteiro (spec §3).
 */
async function diasCompletos(db: Db, inicio: string, hoje: string, calendario: Calendario): Promise<Set<string>> {
  const linhas = await db
    .select({ id: jogos.id, dia: jogos.dataReferencia, status: jogos.status })
    .from(jogos)
    .where(and(gte(jogos.dataReferencia, inicio), lt(jogos.dataReferencia, hoje)))
  if (linhas.length === 0) return new Set()
  const comBox = new Set(
    (
      await db
        .selectDistinct({ jogoId: estatisticasJogo.jogoId })
        .from(estatisticasJogo)
        .where(inArray(estatisticasJogo.jogoId, linhas.map((l) => l.id)))
    ).map((l) => l.jogoId),
  )
  const porDia = new Map<string, { total: number; prontos: number }>()
  for (const l of linhas) {
    const atual = porDia.get(l.dia) ?? { total: 0, prontos: 0 }
    atual.total += 1
    if (l.status === 'ENCERRADO' && comBox.has(l.id)) atual.prontos += 1
    porDia.set(l.dia, atual)
  }
  const completos = new Set<string>()
  for (const [dia, c] of porDia) {
    const esperado = calendario.get(dia)?.length ?? 0
    if (esperado > 0 && c.total === esperado && c.prontos === esperado) completos.add(dia)
  }
  return completos
}

type JogoAgendado = { jogo: JogoSim; jogoId: string; quandoUtc: Date; timeCasaId: string; timeVisitanteId: string }

function instanteLocal(dia: string, horaLocal: string, fuso: string): Date {
  const [h, m] = horaLocal.split(':').map(Number)
  return new Date(intervaloDoDia(dia, fuso).inicio.getTime() + (h! * 60 + m!) * 60_000)
}

/** Agenda a rodada do dia (upsert) e devolve os jogos com ids. Ordem: horário, depois casa. */
async function agendarRodada(
  c: Contexto,
  dia: string,
  status: 'AGENDADO' | 'ENCERRADO' = 'AGENDADO',
): Promise<JogoAgendado[]> {
  const agendados: JogoAgendado[] = []
  const doDia = [...(c.calendario.get(dia) ?? [])].sort((a, b) =>
    a.horaLocal === b.horaLocal ? a.casa.localeCompare(b.casa) : a.horaLocal.localeCompare(b.horaLocal),
  )
  for (const jogo of doDia) {
    const timeCasaId = c.cadastro.timePorSigla.get(jogo.casa)
    const timeVisitanteId = c.cadastro.timePorSigla.get(jogo.visitante)
    if (!timeCasaId || !timeVisitanteId) continue
    const quandoUtc = instanteLocal(dia, jogo.horaLocal, c.fuso)
    const jogoId = await upsertJogoDemo(c.db, { timeCasaId, timeVisitanteId, quandoUtc, dataReferencia: dia, status })
    agendados.push({ jogo, jogoId, quandoUtc, timeCasaId, timeVisitanteId })
  }
  return agendados
}

/**
 * Sorteia os desfalques do dia, grava-os e devolve, por sigla, quem está fora
 * — UNIÃO do sorteio com o que já estava gravado para aqueles jogos. Assim um
 * desfalque forçado ontem (a OPD garantida de hoje) continua valendo quando o
 * dia é refeito amanhã.
 */
async function registrarDesfalques(
  c: Contexto,
  dia: string,
  agendados: readonly JogoAgendado[],
  forcados: ReadonlyMap<string, string[]> = new Map(),
): Promise<Map<string, string[]>> {
  const sorteados = desfalquesDoDia({
    dia,
    jogos: agendados.map((a) => a.jogo),
    elencos: c.elencos,
    semente: c.semente,
  })
  for (const a of agendados) {
    for (const sigla of [a.jogo.casa, a.jogo.visitante]) {
      const nomes = [...(sorteados.get(sigla) ?? []), ...(forcados.get(sigla) ?? [])]
      for (const nome of nomes) {
        const jogadorId = c.cadastro.jogadorPorChave.get(chaveDeNome(nome))
        if (!jogadorId) continue
        await c.db
          .insert(lesoesEscalacao)
          .values({ jogoId: a.jogoId, jogadorId, status: 'FORA', motivo: 'temporada simulada', confirmado: true })
          .onConflictDoUpdate({ target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId], set: { status: 'FORA' } })
      }
    }
  }
  const gravados = await c.db
    .select({ jogoId: lesoesEscalacao.jogoId, jogadorId: lesoesEscalacao.jogadorId })
    .from(lesoesEscalacao)
    .where(and(inArray(lesoesEscalacao.jogoId, agendados.map((a) => a.jogoId)), eq(lesoesEscalacao.status, 'FORA')))
  const nomePorId = new Map([...c.cadastro.jogadorPorChave].map(([chave, id]) => [id, chave] as const))
  const fora = new Map<string, string[]>()
  for (const a of agendados) {
    for (const sigla of [a.jogo.casa, a.jogo.visitante]) {
      const elenco = c.elencos.get(sigla) ?? []
      const doJogo = gravados.filter((g) => g.jogoId === a.jogoId).map((g) => nomePorId.get(g.jogadorId))
      fora.set(
        sigla,
        elenco.filter((j) => doJogo.includes(chaveDeNome(j.nome))).map((j) => j.nome),
      )
    }
  }
  return fora
}

async function produzirDiaPassado(
  c: Contexto,
  dia: string,
): Promise<{ jogos: number; boxScores: number; publicou: boolean; classificados: number }> {
  // 1 · agendar + desfalques
  const agendados = await agendarRodada(c, dia)
  if (agendados.length === 0) return { jogos: 0, boxScores: 0, publicou: false, classificados: 0 }
  const fora = await registrarDesfalques(c, dia, agendados)

  // 2 · publicar com o que se sabia até a véspera — 1h antes do primeiro jogo, sem LLM
  const primeiro = agendados[0]!.quandoUtc
  const antecedenciaMs = c.ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000
  const publicacao = await publicarListaSecreta(c.db, c.ruleset, {
    dataReferencia: dia,
    agora: new Date(primeiro.getTime() - antecedenciaMs),
    ignorarAntecedencia: true,
  })

  // 3 · jogar
  let boxScores = 0
  for (const a of agendados) {
    const linhas: (typeof estatisticasJogo.$inferInsert)[] = []
    const placar = { casa: 0, visitante: 0 }
    for (const lado of ['casa', 'visitante'] as const) {
      const sigla = a.jogo[lado]
      const box = boxScoreDoTime({
        chave: `${c.semente}|${dia}|${a.jogo.casa}x${a.jogo.visitante}|${sigla}`,
        elenco: c.elencos.get(sigla) ?? [],
        fora: fora.get(sigla) ?? [],
      })
      for (const l of box) {
        const jogadorId = c.cadastro.jogadorPorChave.get(chaveDeNome(l.nome))
        if (!jogadorId) continue
        placar[lado] += l.pontos
        linhas.push({
          jogoId: a.jogoId,
          jogadorId,
          minutos: l.minutos.toFixed(2),
          pontos: l.pontos,
          rebotesTotal: l.rebotes,
          assistencias: l.assistencias,
          ...decomporPontos(l.pontos),
          ...boxComplementar(`${c.semente}|${dia}|${l.nome}`, l.rebotes),
        })
      }
    }
    if (linhas.length > 0) {
      await c.db
        .insert(estatisticasJogo)
        .values(linhas)
        .onConflictDoUpdate({
          target: [estatisticasJogo.jogoId, estatisticasJogo.jogadorId],
          set: {
            minutos: excluded('minutos'),
            pontos: excluded('pontos'),
            rebotesTotal: excluded('rebotes_total'),
            rebotesOf: excluded('rebotes_of'),
            rebotesDef: excluded('rebotes_def'),
            assistencias: excluded('assistencias'),
            cestasC: excluded('cestas_c'),
            cestasT: excluded('cestas_t'),
            doisC: excluded('dois_c'),
            doisT: excluded('dois_t'),
            tresC: excluded('tres_c'),
            tresT: excluded('tres_t'),
            lanceC: excluded('lance_c'),
            lanceT: excluded('lance_t'),
            roubos: excluded('roubos'),
            bloqueios: excluded('bloqueios'),
            turnovers: excluded('turnovers'),
            faltas: excluded('faltas'),
          },
        })
      boxScores += linhas.length
    }
    await c.db
      .update(jogos)
      .set({ status: 'ENCERRADO', quartoAtual: null, placarCasa: placar.casa, placarVisitante: placar.visitante })
      .where(eq(jogos.id, a.jogoId))
  }
  await semearBoxScoreDoTime(c.db, agendados[agendados.length - 1]!.quandoUtc, agendados.map((a) => a.jogoId))

  // 4 · recalcular médias (função real) e classificação
  await recalcularMedias(c.db, {
    janela: c.ruleset.media.janela,
    configTemporada: calendarioDoRuleset(c.ruleset),
    agora: primeiro,
  })
  const classificados = await semearClassificacao(c.db, c.ruleset, dia)

  return { jogos: agendados.length, boxScores, publicou: publicacao.publicou, classificados }
}
```

Observações para quem implementa:
- `estatisticasJogo.$inferInsert` exige `jogoId` e `jogadorId`; os demais têm default. `minutos` é `numeric` → string.
- `decomporPontos` devolve `doisC, doisT, tresC, tresT, lanceC, lanceT, cestasC, cestasT`; `boxComplementar` devolve `rebotesOf, rebotesDef, roubos, bloqueios, turnovers, faltas`. Os nomes casam com as colunas.
- Se o typecheck reclamar do `set` com `excluded(...)` (tipo `SQL`), é o mesmo padrão de `sincronizar/medias.ts` — copie a forma de lá.
- No teste "placar é a soma do box" a expressão `b.cestasC * 0 + b.doisC * 2 + b.tresC * 3 + b.lanceC === b.pontos` é a aritmética de `decomporPontos`; se falhar, o erro está na leitura das colunas, não no gerador.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/ingestao/__tests__/temporada.test.ts`
Expected: PASS (8 testes). Se "há green E red" falhar por não haver apito em 3 dias (médias nascem no dia 2), aumente `diasDeHistorico` desse `describe` para 5 — e só ele.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ingestao/demo/temporada.ts src/modules/ingestao/__tests__/temporada.test.ts
git commit -m "Temporada simulada: simularAte produz os dias passados pelo pipeline real

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `simularAte` — o dia de hoje (rodada agendada, jogo ao vivo, lista com narrativa, odds)

**Files:**
- Modify: `src/modules/ingestao/demo/temporada.ts`
- Test: `src/modules/ingestao/__tests__/temporada.test.ts`

**Interfaces:**
- Consumes: `semearJogoAoVivo`/`JogadorAoVivo` (`./ao-vivo`), `semearOdds` (`./odds`), `executarCiclo` (`../../entrega/fire-live/ciclo`), `FilaEmMemoria` (`../../entrega/fila/memoria`), `NIVEIS` (`../../motor/tipos`).
- Produces: `ResumoTemporada` completo (`jogosHoje`, `itensListaSecreta`, `apitosFireLive`, `linhasComOdd` preenchidos).

- [ ] **Step 1: Escrever os testes de hoje (falham)**

Acrescente a `temporada.test.ts` um novo `describe` (usa um banco próprio com 21 dias, porque os testes estatísticos de nível precisam de temporada):

```ts
import { LLMFake } from '../llm'
import { lerFeed } from '../../entrega/lista-secreta'
import { lerFeedFireLive } from '../../entrega/fire-live/leitura'
import { oddsAgregada } from '../../dominio/db/schema'

describe('simularAte — hoje e a temporada de 3 semanas (PGlite)', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let resumo: Awaited<ReturnType<typeof simularAte>>

  beforeAll(async () => {
    banco = await bancoDeTeste()
    resumo = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
  }, 300_000)
  afterAll(async () => {
    await banco.fechar()
  })

  it('hoje tem rodada agendada, e exatamente um jogo ao vivo no 1º quarto', async () => {
    const hoje = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, HOJE))
    expect(hoje.length).toBeGreaterThanOrEqual(4)
    expect(resumo.jogosHoje).toBe(hoje.length)
    const aoVivo = hoje.filter((j) => j.status === 'AO_VIVO')
    expect(aoVivo).toHaveLength(1)
    expect(aoVivo[0]!.quartoAtual).toBe(ruleset.fire_live.quarto)
    expect(hoje.filter((j) => j.status === 'AGENDADO')).toHaveLength(hoje.length - 1)
    // o ao vivo é o PRIMEIRO da rodada
    const primeiro = Math.min(...hoje.map((j) => j.dataHoraUtc.getTime()))
    expect(aoVivo[0]!.dataHoraUtc.getTime()).toBe(primeiro)
  })

  it('a Lista Secreta de hoje sai com narrativa e com odds; as de ontem, sem narrativa', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed).not.toBeNull()
    expect(feed!.conteudo.itens.length).toBeGreaterThan(0)
    expect(resumo.itensListaSecreta).toBe(feed!.conteudo.itens.length)
    expect(feed!.conteudo.itens.some((i) => i.narrativa)).toBe(true)
    expect(feed!.conteudo.itens.some((i) => i.oddFaixa !== null)).toBe(true)
    expect(resumo.linhasComOdd).toBeGreaterThan(0)
    expect((await banco.db.select().from(oddsAgregada)).length).toBe(resumo.linhasComOdd)

    const ontem = await lerFeed(banco.db, somarDias(HOJE, -1))
    expect(ontem).not.toBeNull()
    expect(ontem!.conteudo.itens.every((i) => !i.narrativa)).toBe(true)
  })

  it('hoje há uma OPD (desfalque em prefixo garantido) e o Fire Live tem apito em modo fire', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed!.conteudo.itens.some((i) => i.metodo === 'OPD')).toBe(true)
    const fire = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
    expect(fire.itens.length).toBeGreaterThan(0)
    expect(resumo.apitosFireLive).toBeGreaterThan(0)
    expect(fire.itens.some((i) => i.modoFire)).toBe(true)
  })

  it('ao longo de 3 semanas a estratégia produz apitos de nível 1, 2 e 3 e ao menos um turbo', async () => {
    const todos = await banco.db.select().from(apitos).where(eq(apitos.estrategia, 'LISTA_SECRETA'))
    const niveis = new Set(todos.map((a) => a.nivelApito))
    expect(niveis.has(1)).toBe(true)
    expect(niveis.has(2)).toBe(true)
    expect(niveis.has(3)).toBe(true)
    expect(todos.some((a) => a.turbo)).toBe(true)
  })

  it('a taxa de acerto de 7 dias existe e não é 0% nem 100%', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const conferidos = dias.reduce((s, d) => s + d.conferidos, 0)
    const acertos = dias.reduce((s, d) => s + d.acertos, 0)
    expect(conferidos).toBeGreaterThan(20)
    expect(acertos).toBeGreaterThan(0)
    expect(acertos).toBeLessThan(conferidos)
  })

  it('rodar de novo hoje não duplica apito nem odd', async () => {
    const antes = {
      apitos: (await banco.db.select().from(apitos)).length,
      odds: (await banco.db.select().from(oddsAgregada)).length,
      jogos: (await banco.db.select().from(jogos)).length,
    }
    await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 21, llm: new LLMFake() })
    expect({
      apitos: (await banco.db.select().from(apitos)).length,
      odds: (await banco.db.select().from(oddsAgregada)).length,
      jogos: (await banco.db.select().from(jogos)).length,
    }).toEqual(antes)
  }, 120_000)

  it('no dia seguinte, o jogo que estava ao vivo vira encerrado com box completo, e nasce uma rodada nova', async () => {
    const amanha = new Date(AGORA.getTime() + 24 * 60 * 60_000)
    const r = await simularAte(banco.db, ruleset, amanha, { diasDeHistorico: 21 })
    expect(r.diasProduzidos).toBe(1)
    const ontem = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, HOJE))
    expect(ontem.every((j) => j.status === 'ENCERRADO' && j.placarCasa !== null)).toBe(true)
    const box = await banco.db.select().from(estatisticasJogo).where(inArray(estatisticasJogo.jogoId, ontem.map((j) => j.id)))
    expect(box.every((b) => Number(b.minutos) >= 1)).toBe(true)
    const hojeNovo = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, somarDias(HOJE, 1)))
    expect(hojeNovo.filter((j) => j.status === 'AO_VIVO')).toHaveLength(1)
  }, 180_000)
})
```

(`ItemFeed` em `src/modules/entrega/tipos-feed.ts` tem `narrativa?: string | null`, `oddFaixa`, `metodo`, `turbo` — nomes conferidos.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/ingestao/__tests__/temporada.test.ts -t "hoje"`
Expected: FAIL — hoje não tem jogos (`jogosHoje` 0).

- [ ] **Step 3: Implementar o bloco de hoje**

Em `temporada.ts`, imports adicionais:

```ts
import { executarCiclo } from '../../entrega/fire-live/ciclo'
import { FilaEmMemoria } from '../../entrega/fila/memoria'
import { NIVEIS } from '../../motor/tipos'
import type { Atributo } from '../../motor/tipos'
import { semearJogoAoVivo } from './ao-vivo'
import type { JogadorAoVivo } from './ao-vivo'
import { semearOdds } from './odds'
```

Em `simularAte`, depois do laço dos dias passados e antes do `return`:

```ts
  const deHoje = await produzirHoje(contexto, hoje, agora, opcoes.llm)
```

e no `return` use `jogosHoje: deHoje.jogos, itensListaSecreta: deHoje.itens, apitosFireLive: deHoje.apitosFireLive, linhasComOdd: deHoje.linhasComOdd`.

Função nova:

```ts
/**
 * HOJE: rodada agendada, o primeiro jogo ao vivo no 1º quarto, Lista Secreta
 * com narrativa real e odds das casas fictícias. Os DOIS cenários forçados da
 * spec §3 vivem aqui, e só aqui: (a) um desfalque em prefixo — o nº 1 da casa
 * do último jogo do dia — para a OPD aparecer; (b) o bloco de topo do jogo ao
 * vivo com ≥75% da média no 1º quarto — o modo fire. O resto é sorteio.
 */
async function produzirHoje(
  c: Contexto,
  hoje: string,
  agora: Date,
  llm: PortaLLM | undefined,
): Promise<{ jogos: number; itens: number; apitosFireLive: number; linhasComOdd: number }> {
  const agendados = await agendarRodada(c, hoje)
  if (agendados.length === 0) return { jogos: 0, itens: 0, apitosFireLive: 0, linhasComOdd: 0 }

  const aoVivo = agendados[0]!
  await c.db
    .update(jogos)
    .set({ status: 'AO_VIVO', quartoAtual: c.ruleset.fire_live.quarto })
    .where(eq(jogos.id, aoVivo.jogoId))

  // (a) desfalque em prefixo garantido — no último jogo do dia; se só há um
  //     jogo, no visitante dele (o protagonista do modo fire é da casa).
  const alvoOpd = agendados.length > 1 ? agendados[agendados.length - 1]! : aoVivo
  const siglaOpd = agendados.length > 1 ? alvoOpd.jogo.casa : alvoOpd.jogo.visitante
  const numeroUm = (c.elencos.get(siglaOpd) ?? [])[0]
  const forcados = new Map<string, string[]>(numeroUm ? [[siglaOpd, [numeroUm.nome]]] : [])
  const fora = await registrarDesfalques(c, hoje, agendados, forcados)

  // (b) o jogo ao vivo: elenco dos dois times sem os desfalcados, protagonistas do bloco de topo
  const elencoAoVivo: JogadorAoVivo[] = []
  for (const lado of ['casa', 'visitante'] as const) {
    const sigla = aoVivo.jogo[lado]
    for (const j of c.elencos.get(sigla) ?? []) {
      if ((fora.get(sigla) ?? []).includes(j.nome)) continue
      const jogadorId = c.cadastro.jogadorPorChave.get(chaveDeNome(j.nome))
      if (!jogadorId) continue
      elencoAoVivo.push({ nome: j.nome, jogadorId, nivel: j.nivel, timeId: lado === 'casa' ? aoVivo.timeCasaId : aoVivo.timeVisitanteId })
    }
  }
  const protagonistas = escolherProtagonistas(c, aoVivo.jogo, fora)
  await semearJogoAoVivo(c.db, c.ruleset, {
    jogoId: aoVivo.jogoId,
    timeCasaId: aoVivo.timeCasaId,
    timeVisitanteId: aoVivo.timeVisitanteId,
    elenco: elencoAoVivo,
    protagonistas,
    chave: `${c.semente}|1Q|${hoje}`,
    agora,
  })

  // o motor calcula — com narrativa real só aqui
  const publicacao = await publicarListaSecreta(c.db, c.ruleset, { dataReferencia: hoje, agora, ignorarAntecedencia: true, llm })
  const ciclo = await executarCiclo(c.db, c.ruleset, new FilaEmMemoria(), {
    jogoId: aoVivo.jogoId,
    estadoAnterior: null,
    iniciadoEm: agora,
    agora,
  })
  const apitosFireLive = ciclo.encerrar ? 0 : ciclo.apitosNovos

  const linhasComOdd = await semearOdds(c.db, c.ruleset, hoje, agora)
  if (linhasComOdd > 0) {
    // republica para o card ganhar a faixa/média (o hash cobre o item inteiro)
    await publicarListaSecreta(c.db, c.ruleset, { dataReferencia: hoje, agora, ignorarAntecedencia: true, llm })
  }
  const itens = publicacao.publicou ? publicacao.itens : 0
  return { jogos: agendados.length, itens, apitosFireLive, linhasComOdd }
}

/**
 * PONTOS: o bloco de topo da CASA — o primeiro MVP, ou o nº 1 se não houver
 * (ADR-0006). REBOTES/ASSISTÊNCIAS: o melhor nível derivado no jogo,
 * excluindo o protagonista de pontos, desempate pela hierarquia.
 */
function escolherProtagonistas(
  c: Contexto,
  jogo: JogoSim,
  fora: ReadonlyMap<string, string[]>,
): Record<Atributo, string | null> {
  const emQuadra = (sigla: string) => (c.elencos.get(sigla) ?? []).filter((j) => !(fora.get(sigla) ?? []).includes(j.nome))
  const casa = emQuadra(jogo.casa)
  const todos = [...casa, ...emQuadra(jogo.visitante)]
  const pontos = casa.find((j) => j.nivel === 'MVP') ?? casa[0] ?? null
  const melhorEm = (atributo: Atributo): string | null => {
    const candidatos = todos.filter((j) => j.nome !== pontos?.nome)
    candidatos.sort((a, b) => {
      const dif = NIVEIS.indexOf(a.niveis[atributo]) - NIVEIS.indexOf(b.niveis[atributo])
      return dif !== 0 ? dif : a.posicaoHierarquia - b.posicaoHierarquia
    })
    return candidatos[0]?.nome ?? null
  }
  return { PONTOS: pontos?.nome ?? null, REBOTES: melhorEm('REBOTES'), ASSISTENCIAS: melhorEm('ASSISTENCIAS') }
}
```

Atenção à ordem no dia seguinte: `diasCompletos` vê o jogo de ontem `AO_VIVO` com box parcial como incompleto → `produzirDiaPassado(ontem)` reagenda (o `upsertJogoDemo` põe `AGENDADO`), republica (hash tende a não mudar), joga (box completo substitui o parcial pelo upsert), recalcula. Só então `produzirHoje` roda. É exatamente o que o último teste do Step 1 verifica.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/ingestao/__tests__/temporada.test.ts`
Expected: PASS (todos). Se "nível 1, 2 e 3 e turbo" falhar em 21 dias, suba `diasDeHistorico` desse `describe` para 28 antes de mexer em qualquer outra coisa; se seguir falhando, o problema é na fração de oscilações (Task 2) — volte lá.

- [ ] **Step 5: Boundaries + commit**

Run: `npm run boundaries && npm run typecheck`

```bash
git add src/modules/ingestao/demo/temporada.ts src/modules/ingestao/__tests__/temporada.test.ts
git commit -m "Temporada simulada: o dia de hoje — rodada, jogo ao vivo, lista com narrativa e odds

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Scripts e cron passam a usar `simularAte`

**Files:**
- Create: `scripts/demo-temporada.ts`
- Modify: `scripts/demo-seed.ts`
- Modify: `package.json` (scripts)
- Modify: `src/app/api/cron/demo/route.ts`
- Test: `src/app/api/cron/demo/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `simularAte`, `ResumoTemporada` (Task 6), `autossemeaduraHabilitada`, `executarCronProtegido`, `portaLLMDoAmbiente`, `rulesetAtivo`.

- [ ] **Step 1: Escrever o teste da rota (falha)**

Crie `src/app/api/cron/demo/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  simularAte: vi.fn(async () => ({
    inicio: '2026-07-19',
    hoje: '2026-09-06',
    diasProduzidos: 1,
    diasRestantes: 0,
    jogosCriados: 7,
    boxScores: 110,
    publicacoes: 1,
    jogosHoje: 8,
    itensListaSecreta: 42,
    apitosFireLive: 3,
    linhasComOdd: 42,
    classificados: 30,
    times: 30,
    jogadores: 230,
    versaoNiveis: 'niveis-x',
  })),
}))

vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))
vi.mock('@/modules/entrega/ruleset-ativo', () => ({ rulesetAtivo: async () => ({}) }))
vi.mock('@/modules/ingestao/llm', () => ({ portaLLMDoAmbiente: () => undefined }))
vi.mock('@/modules/ingestao/demo/temporada', () => ({ simularAte: mocks.simularAte }))

import { GET } from '../route'

describe('/api/cron/demo', () => {
  const env = { ...process.env }
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    process.env.CRON_SECRET = 'segredo'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    mocks.simularAte.mockClear()
    process.env = { ...env }
  })

  const pedir = () =>
    GET(new Request('https://app.test/api/cron/demo', { headers: { authorization: 'Bearer segredo' } }))

  it('sem DEMO_AUTOSSEMEADURA pula sem tocar no banco', async () => {
    delete process.env.DEMO_AUTOSSEMEADURA
    const resposta = await pedir()
    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ executado: false, motivo: 'DEMO_AUTOSSEMEADURA_DESLIGADA' })
    expect(mocks.simularAte).not.toHaveBeenCalled()
  })

  it('com a variável ligada chama simularAte com orçamento de 240s e devolve o resumo', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'
    const resposta = await pedir()
    expect(resposta.status).toBe(200)
    expect(mocks.simularAte).toHaveBeenCalledTimes(1)
    const opcoes = mocks.simularAte.mock.calls[0]![3] as { orcamentoMs?: number }
    expect(opcoes.orcamentoMs).toBe(240_000)
    expect(await resposta.json()).toMatchObject({ executado: true, resumo: { itensListaSecreta: 42, diasRestantes: 0 } })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/cron/demo/__tests__/route.test.ts`
Expected: FAIL — `simularAte` não é chamado (a rota ainda chama `semearDemo`).

- [ ] **Step 3: Reescrever a rota**

`src/app/api/cron/demo/route.ts`:

```ts
import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { autossemeaduraHabilitada } from '@/modules/ingestao/demo/autossemeadura'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { portaLLMDoAmbiente } from '@/modules/ingestao/llm'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Margem para o resumo sair antes de a Vercel cortar a função (maxDuration 300). */
const ORCAMENTO_MS = 240_000

/**
 * A TEMPORADA SIMULADA AVANÇA UM DIA.
 *
 * `simularAte` produz os dias que faltam entre o início da janela e hoje —
 * normalmente só ontem — e monta a rodada de hoje. Se o cron perdeu dias,
 * produz o que couber no orçamento e continua na execução seguinte
 * (`diasRestantes` no resumo). A CARGA INICIAL das 7 semanas não é daqui:
 * roda uma vez, à mão, por `npm run demo:temporada` (ver runbook de deploy).
 *
 * Ocupa um dos DOIS crons diários que o plano Hobby permite (ADR-0003, nota de
 * 25/08). Só roda com `DEMO_AUTOSSEMEADURA=true`; sem a variável responde 200
 * com `executado: false` — pular não é falha.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/demo',
    tarefa: async () => {
      if (!autossemeaduraHabilitada(process.env)) {
        return { executado: false, motivo: 'DEMO_AUTOSSEMEADURA_DESLIGADA' as const }
      }
      const ruleset = await rulesetAtivo()
      const resumo = await simularAte(getDb(), ruleset, new Date(), {
        llm: portaLLMDoAmbiente(),
        orcamentoMs: ORCAMENTO_MS,
      })
      return { executado: true, resumo }
    },
    quantidade: (r) => ('resumo' in r && r.resumo ? r.resumo.itensListaSecreta : 0),
  })
}
```

- [ ] **Step 4: Script `demo-temporada.ts` e `demo-seed.ts`**

Crie `scripts/demo-temporada.ts`:

```ts
import { readFile } from 'node:fs/promises'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { simularAte } from '../src/modules/ingestao/demo/temporada'
import { portaLLMDoAmbiente } from '../src/modules/ingestao/llm'
import { carregarRuleset } from '../src/modules/motor/ruleset/carregar'

/**
 * Produz a temporada simulada até hoje — a carga inicial das 7 semanas e
 * qualquer lacuna. Sem orçamento de tempo: é para rodar daqui, não da Vercel.
 *
 *   npx dotenv -e .env.local -- npm run demo:temporada
 *
 * Idempotente e resumível: interrompida no meio, a execução seguinte continua
 * do último dia completo. Para desfazer, demo:limpar.
 *
 * A porta de LLM entra pelo mesmo motivo do cron: só o dia de HOJE ganha
 * narrativa, e quem grava o snapshot primeiro fixa o hash.
 */
async function principal() {
  const ruleset = carregarRuleset(await readFile('config/ruleset.v1.yaml', 'utf8'))
  const resumo = await simularAte(getDb(), ruleset, new Date(), {
    llm: portaLLMDoAmbiente(),
    aoProduzirDia: (dia, indice, total) => console.log(`  produzindo ${dia} (${indice + 1}/${total})`),
  })

  console.log('Temporada simulada:')
  console.log(`  janela ................ ${resumo.inicio} → ${resumo.hoje}`)
  console.log(`  dias produzidos ....... ${resumo.diasProduzidos} (restam ${resumo.diasRestantes})`)
  console.log(`  jogos criados ......... ${resumo.jogosCriados}`)
  console.log(`  box scores ............ ${resumo.boxScores}`)
  console.log(`  listas publicadas ..... ${resumo.publicacoes}`)
  console.log(`  jogos hoje ............ ${resumo.jogosHoje}`)
  console.log(`  itens na Lista Secreta  ${resumo.itensListaSecreta}`)
  console.log(`  apitos do Fire Live ... ${resumo.apitosFireLive}`)
  console.log(`  linhas com odd ........ ${resumo.linhasComOdd}`)
  console.log(`  times classificados ... ${resumo.classificados}`)
  console.log(`  times / jogadores ..... ${resumo.times} / ${resumo.jogadores} (níveis ${resumo.versaoNiveis})`)
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
```

Substitua o conteúdo de `scripts/demo-seed.ts` por:

```ts
/**
 * `demo:seed` é um APELIDO de `demo:temporada`: o nome sobrevive porque o
 * runbook e a memória do parceiro o conhecem. O seed roteirizado de um dia
 * (`semearDemo`) continua existindo só como fixture de teste.
 */
import './demo-temporada'
```

Em `package.json`, ao lado de `"demo:seed"`, acrescente `"demo:temporada": "vite-node scripts/demo-temporada.ts",`.

- [ ] **Step 5: Rodar o teste da rota, typecheck e lint**

Run: `npx vitest run src/app/api/cron/demo/__tests__/route.test.ts && npm run typecheck && npm run lint`
Expected: PASS; limpo.

- [ ] **Step 6: Commit**

```bash
git add scripts/demo-temporada.ts scripts/demo-seed.ts package.json src/app/api/cron/demo/route.ts src/app/api/cron/demo/__tests__/route.test.ts
git commit -m "Demo: cron e scripts avançam a temporada simulada com simularAte

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Faixa "Temporada demonstrativa · dados simulados"

**Files:**
- Create: `src/components/navegacao/FaixaDemonstracao.tsx`
- Modify: `src/components/navegacao/index.ts`
- Modify: `src/app/layout.tsx`
- Test: `src/app/__tests__/faixa-demonstracao.test.ts`

**Interfaces:**
- Consumes: `autossemeaduraHabilitada(env)` (`@/modules/ingestao/demo/autossemeadura`), `semantico` (tokens).
- Produces: `FaixaDemonstracao({ env?: Record<string, string | undefined> }): ReactElement | null` — `env` default `process.env`.

- [ ] **Step 1: Teste (falha)**

Crie `src/app/__tests__/faixa-demonstracao.test.ts`:

```ts
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FaixaDemonstracao } from '../../components/navegacao/FaixaDemonstracao'

describe('FaixaDemonstracao', () => {
  it('aparece, com o texto exato, quando DEMO_AUTOSSEMEADURA=true', () => {
    const html = renderToStaticMarkup(FaixaDemonstracao({ env: { DEMO_AUTOSSEMEADURA: 'true' } }) as ReactElement)
    expect(html).toContain('Temporada demonstrativa · dados simulados')
    expect(html).toContain('role="note"')
  })

  it('não renderiza nada sem a variável (ou com valor ambíguo)', () => {
    expect(FaixaDemonstracao({ env: {} })).toBeNull()
    expect(FaixaDemonstracao({ env: { DEMO_AUTOSSEMEADURA: '1' } })).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/__tests__/faixa-demonstracao.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Componente, reexport e layout**

`src/components/navegacao/FaixaDemonstracao.tsx`:

```tsx
import { semantico } from '@/design-system/tokens/semantico'
import { autossemeaduraHabilitada } from '@/modules/ingestao/demo/autossemeadura'

/**
 * O selo que responde, antes de alguém perguntar, ao rótulo "2025-26" e à
 * taxa de acerto: enquanto o banco é de demonstração, TODA tela diz isso.
 * Aparece só com DEMO_AUTOSSEMEADURA=true — a mesma guarda do cron, para a
 * faixa e o dado fictício ligarem e desligarem juntos. O visual definitivo é
 * assunto da fase de UX; aqui é a informação e a regra.
 */
export function FaixaDemonstracao({ env = process.env }: { env?: Record<string, string | undefined> }) {
  if (!autossemeaduraHabilitada(env)) return null
  return (
    <div
      role="note"
      style={{
        background: semantico.superficieElevada,
        color: semantico.textoSecundario,
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        textAlign: 'center',
        padding: '4px 12px',
        borderBottom: `1px solid ${semantico.divisor}`,
      }}
    >
      Temporada demonstrativa · dados simulados
    </div>
  )
}
```

Em `src/components/navegacao/index.ts` acrescente `export { FaixaDemonstracao } from './FaixaDemonstracao'`.

Em `src/app/layout.tsx`: importe `import { FaixaDemonstracao } from '@/components/navegacao'` e, no `<body>`, logo após `<RegistrarServiceWorker />`, insira `<FaixaDemonstracao />`.

Se `semantico.fonteRotulo` não existir com esse nome, use o token de rótulo que `CabecalhoTela.tsx` usa — nunca um valor cru.

- [ ] **Step 4: Rodar, build de tipos, lint**

Run: `npx vitest run src/app/__tests__/faixa-demonstracao.test.ts && npm run typecheck && npm run lint && npm run boundaries`
Expected: PASS; limpo (a regra `componente-nao-usa-token-primitivo` continua satisfeita: só `semantico`).

- [ ] **Step 5: Commit**

```bash
git add src/components/navegacao/FaixaDemonstracao.tsx src/components/navegacao/index.ts src/app/layout.tsx src/app/__tests__/faixa-demonstracao.test.ts
git commit -m "Faixa de demonstração: toda tela diz que a temporada é simulada

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Fumaça das telas semeada pela temporada simulada

**Files:**
- Modify: `src/app/__tests__/telas-demo.test.ts`

**Interfaces:**
- Consumes: `simularAte` (Task 6), `LLMFake`.

- [ ] **Step 1: Trocar o seed do `beforeAll`**

Em `telas-demo.test.ts`:
- troque `import { semearDemo } from '../../modules/ingestao/demo/semear'` por `import { simularAte } from '../../modules/ingestao/demo/temporada'`;
- no `beforeAll`, troque `await semearDemo(banco.db, await rulesetAtivo(), AGORA, new LLMFake())` por `await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 7, llm: new LLMFake() })`;
- `AGORA` continua `2026-01-15T18:00:00.000Z` (janeiro está dentro de 2025-26; a abertura é 1º de outubro de 2025, então a janela não é cortada).

- [ ] **Step 2: Tirar as dependências do roteiro**

No teste `'Ao vivo: cabeçalho vermelho, placar 1Q, selo VIVO e barra de progresso'`, substitua `expect(html).toContain('OKC') // placar do jogo ao vivo da demo` por:

```ts
    // A sigla da CASA do jogo ao vivo — quem joga hoje é decisão do calendário simulado.
    const { jogos, times } = await import('../../modules/dominio/db/schema')
    const [aoVivo] = await banco.db.select().from(jogos).where(eq(jogos.status, 'AO_VIVO')).limit(1)
    const [casa] = await banco.db.select().from(times).where(eq(times.id, aoVivo!.timeCasaId)).limit(1)
    expect(html).toContain(casa!.sigla)
```

No teste `'os horários dos jogos saem no fuso, não no do servidor'`, substitua o par de `expect` por:

```ts
    // Um jogo AGENDADO de hoje, no horário LOCAL — o calendário simulado sorteia
    // entre 19:00 e 22:30 de Brasília; num servidor em UTC ele sairia depois da
    // meia-noite (e no dia seguinte).
    const { jogos } = await import('../../modules/dominio/db/schema')
    const [agendado] = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.dataReferencia, HOJE), eq(jogos.status, 'AGENDADO')))
      .limit(1)
    const local = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO, hourCycle: 'h23' }).format(agendado!.dataHoraUtc)
    expect(html).toContain(local)
    expect(html).not.toContain('00:00')
```

Atualize o comentário que dizia "O seed marca os jogos às 20h, 21h, 22h e 23h LOCAIS".

- [ ] **Step 3: Rodar a suíte**

Run: `npx vitest run src/app/__tests__/telas-demo.test.ts`
Expected: PASS. Se um teste de Resultados falhar por "Nenhuma rodada encerrada ainda", suba `diasDeHistorico` para 10 — a conferência precisa de médias, e elas nascem no segundo dia.

- [ ] **Step 4: Commit**

```bash
git add src/app/__tests__/telas-demo.test.ts
git commit -m "Fumaça das telas: semeia com a temporada simulada, sem depender do roteiro

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `demo:conferir`, runbook, carga local e verificação final

**Files:**
- Modify: `scripts/demo-conferir.ts`
- Modify: `docs/runbooks/deploy.md` (seção "Antes de apresentar ao cliente")
- Modify: `docs/superpowers/specs/2026-09-06-temporada-simulada-design.md` (status)

- [ ] **Step 1: Itens novos no `demo-conferir.ts`**

Logo depois do bloco `// 4 · Resultados`, acrescente:

```ts
  // 4b · Temporada simulada — o que dá lastro aos números.
  const { jogos: tabelaJogosTemporada } = await import('../src/modules/dominio/db/schema')
  const { eq: igualA, lt: menorQue, and: e } = await import('drizzle-orm')
  const encerrados = await db
    .select({ dia: tabelaJogosTemporada.dataReferencia, casa: tabelaJogosTemporada.timeCasaId, visitante: tabelaJogosTemporada.timeVisitanteId })
    .from(tabelaJogosTemporada)
    .where(e(igualA(tabelaJogosTemporada.status, 'ENCERRADO'), menorQue(tabelaJogosTemporada.dataReferencia, hoje)))
  const diasComJogo = new Set(encerrados.map((j) => j.dia)).size
  registrar('Temporada · dias com jogo', diasComJogo >= 45, `${diasComJogo} dia(s) encerrados (esperado ≥ 45)`)
  const jogosPorTime = new Map<string, number>()
  for (const j of encerrados) {
    for (const t of [j.casa, j.visitante]) jogosPorTime.set(t, (jogosPorTime.get(t) ?? 0) + 1)
  }
  const minimo = Math.min(...jogosPorTime.values())
  registrar('Temporada · jogos por time', jogosPorTime.size === 30 && minimo >= 20, `${jogosPorTime.size} times, mínimo ${minimo} jogos (esperado ≥ 20)`)
  const cards = rodadas.flatMap((r) => r.jogadores).filter((j) => j.valor !== null)
  const greens = cards.filter((j) => j.maiorLinhaBatida !== null).length
  registrar('Resultados · green e red', greens > 0 && greens < cards.length, `${greens} green / ${cards.length - greens} red em ${cards.length} conferidos`)
  registrar(
    'Faixa de demonstração',
    process.env.DEMO_AUTOSSEMEADURA === 'true',
    process.env.DEMO_AUTOSSEMEADURA === 'true' ? 'ligada (DEMO_AUTOSSEMEADURA=true)' : 'DESLIGADA — o app não avisa que os dados são simulados',
  )
```

Troque o item `'  · destaque turbo'` para informativo — o turbo é MVP em 3 jogos abaixo e não existe todo dia numa temporada sorteada:

```ts
  const turbo = itensFeed.filter((i) => i.turbo).length
  registrar('  · destaque turbo (varia por dia)', true, turbo > 0 ? `${turbo} apito(s) turbo` : 'nenhum hoje — depende de 3 jogos abaixo seguidos')
```

E `'Resultados'` passa a olhar 7 dias: `conferirRodadas(db, hoje, 7)`.

- [ ] **Step 2: Runbook**

Em `docs/runbooks/deploy.md`, seção "Antes de apresentar ao cliente", substitua o parágrafo e o bloco de comandos por:

```markdown
A demonstração é uma **temporada simulada de 7 semanas** que avança um dia por
vez: o cron das 9h UTC (`/api/cron/demo`, com `DEMO_AUTOSSEMEADURA=true`)
encerra a rodada de ontem e monta a de hoje. Sem ele, no dia seguinte o Fire
Live abre em "Sem jogos hoje" — aconteceu em 25/08/2026.

A **carga inicial** das 7 semanas (e qualquer lacuna de dias que o cron tenha
perdido) roda daqui, uma vez — a função da Vercel tem 300 s e a carga custa
minutos:

```bash
npx dotenv -e .env.local -- npm run demo:temporada  # produz a temporada até HOJE
npx dotenv -e .env.local -- npm run demo:fotos      # headshots (toca rede)
npx dotenv -e .env.local -- npm run demo:conferir   # a lista de conferência
```

`demo:seed` é apelido de `demo:temporada`. Tudo é idempotente e resumível:
interrompido no meio, continua do último dia completo. A Lista Secreta de cada
dia passado foi publicada pelo motor **antes** de o dia ser jogado; a taxa de
acerto em Resultados é consequência das regras, não roteiro. Só o dia de hoje
recebe narrativas da LLM.

Com a variável ligada o app mostra a faixa "Temporada demonstrativa · dados
simulados" em todas as telas. **No dia do provedor real:** desligue
`DEMO_AUTOSSEMEADURA`, rode `demo:limpar --confirmar` e só então ligue a
ingestão.
```

Mantenha o parágrafo seguinte sobre `demo:conferir` (atualize "resultados" para "resultados com green e red, temporada") e remova a frase "O seed é reexecutável e faz upsert" (já dita acima).

- [ ] **Step 3: Verificação completa**

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`
Expected: tudo limpo, suíte inteira verde. Se `npm test` estourar tempo em PGlite, rode as suítes lentas separadas (`temporada.test.ts`, `telas-demo.test.ts`, `demo.test.ts`) e registre no PR.

- [ ] **Step 4: Carga local e conferência**

Run (precisa de `.env.local` com `DATABASE_URL` da demo):

```bash
npx dotenv -e .env.local -- npm run demo:temporada
npx dotenv -e .env.local -- npm run demo:conferir
```

Expected: `✓ Demonstração pronta para apresentar.` com todos os itens ✓ (o turbo é informativo). Se a variável `DEMO_AUTOSSEMEADURA` não estiver no `.env.local`, o item "Faixa de demonstração" fica ✗ — é o comportamento certo; ligue-a no painel e no `.env.local`.

- [ ] **Step 5: Status da spec e commit**

Na spec, troque `**Status:** brainstorm fechado com o parceiro, aguardando revisão` por `**Status:** implementada em <data> — ver plano`.

```bash
git add scripts/demo-conferir.ts docs/runbooks/deploy.md docs/superpowers/specs/2026-09-06-temporada-simulada-design.md
git commit -m "Demo: conferência da temporada simulada e runbook da carga inicial

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Auto-revisão (feita ao escrever)

**Cobertura da spec.** §1 janela/calendário → Task 1 (+ `inicioDaJanela` na Task 5). §2 faixas, minutos 240, aritmética das cestas, placar derivado, box de time por quarto, desfalques com peso no topo, `DO_DOCUMENTO` preservado → Tasks 2 e 5 (`decomporPontos`/`boxComplementar`/`semearBoxScoreDoTime` reaproveitados). §3 ordem agendar→publicar→jogar→recalcular, "dia existe", sem passo de conferência, hoje com AO_VIVO/narrativa/odds, LLM só hoje, orçamento, cron, dois cenários forçados → Tasks 5, 6, 7. §4 faixa → Task 8; limpeza → runbook (Task 10), `limparDemo` intocado; testes puros → Tasks 1–2; integração PGlite → Tasks 5–6; rota do cron → Task 7; aceite `demo:conferir` → Task 10. Errata (fixture) → Tasks 3–4 mantêm `semearDemo` e a suíte `demo.test.ts` intacta.

**Consistência de nomes.** `simularAte(db, ruleset, agora, opcoes)` com `OpcoesTemporada { llm, diasDeHistorico, orcamentoMs, semente, aoProduzirDia }` em Tasks 5, 6, 7, 9. `upsertJogoDemo` (Task 3) usado em Task 5. `semearJogoAoVivo` com `{ jogoId, timeCasaId, timeVisitanteId, elenco, protagonistas, chave, agora }` em Tasks 4 e 6. `boxScoreDoTime({ chave, elenco, fora })`, `desfalquesDoDia({ dia, jogos, elencos, semente })`, `elencosDaLista(jogadores)` em Tasks 2 e 5. `semearBoxScoreDoTime(db, agora, jogoIds?)` em Tasks 3 e 5.

**Riscos conhecidos, com o que fazer.** (1) Tempo das suítes PGlite de 21 dias — o Step 4 da Task 6 diz o que ajustar. (2) `semantico.fonteRotulo` — o Step 3 da Task 8 manda usar o token do `CabecalhoTela`. (3) A fração de oscilações depende de `SIGMA` — só ela pode ser ajustada; os testes travam contra o delta do ruleset.
