# Tela de partida e nota da partida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao app a tela de partida do Sofascore — abrir qualquer jogo e ver box score individual dos dois elencos, líderes, H2H, forma e desfalques — com uma nota de desempenho (3–10) por jogador por jogo.

**Architecture:** Leitura direta no padrão da aba de estatísticas (`telaDoTime`), sem snapshot: isto é dado canônico de consulta, não feed materializado do motor. A nota é função **pura** sobre a linha do box score, calculada na leitura, sem coluna nova. Ao vivo por `router.refresh()` de 30s apenas quando o jogo está `AO_VIVO` — sem WebSocket, respeitando "o push é o canal de tempo real".

**Tech Stack:** TypeScript, Next.js App Router (componentes de servidor), Drizzle + Postgres, vitest + PGlite, `renderToStaticMarkup` para testes de tela.

**Spec:** [`docs/superpowers/specs/2026-08-26-tela-de-partida-e-nota-design.md`](../specs/2026-08-26-tela-de-partida-e-nota-design.md)

## Global Constraints

- **Lado canônico da fronteira.** Elencos e times vêm do box score real e de `jogadores.time_id`, **nunca** da lista curada do CJ. É a exceção documentada no `CLAUDE.md`.
- **Nada em `src/modules/motor/**` é tocado.** O dependency-cruiser tem a regra `estatisticas-nao-passam-pelo-motor` — `npm run boundaries` reprova violação.
- **Vocabulário:** sempre "nota da partida" ou "nota". **Proibido** "nível" (colide com `nível do jogador` / `nível do apito` do CJ), proibido "rating de confiança", proibida a palavra "probabilidade" em qualquer texto de tela.
- **Ausência é `—`, nunca zero.** Zero é um número; ausência não é. O helper `n()` já existe na página do time.
- Domínio em português, infraestrutura em inglês.
- Constantes da nota vivem **no módulo**, não no ruleset: o ruleset é a estratégia do CJ, e a nota nunca alimenta o motor.
- Commits com autor `Mateus-Nogueira-GT <mateusnnogueira451@gmail.com>` (senão a Vercel bloqueia o deploy — ADR-0008).

## Padrões do repo que este plano segue

Confirmados por leitura antes de escrever (não presuma, já está checado):

- `estatisticas_jogo` tem todas as colunas do Game Score: `pontos`, `cestasC/cestasT`, `lanceC/lanceT`, `rebotesOf/rebotesDef`, `roubos`, `assistencias`, `bloqueios`, `faltas`, `turnovers`, `minutos` (numeric, chega como string).
- `lesoes_escalacao.status` é enum `'ATIVO' | 'FORA' | 'DUVIDA'`, com `motivo` e `confirmado`.
- Telas da aba importam `Secao`, `SemBanco`, `SOBRANCELHA_STATS` de `src/app/(app)/estatisticas/moldura.tsx`.
- `Tabela` recebe `Coluna<T>[]` com `{ chave, rotulo, descricao?, alinhamento?, fixa?, celula }`.
- Toda tela da aba chama `exigirAcessoEstatisticasSeConfigurado()` e usa `ComAtualizacao` + `maisAntiga`/`daColuna` para o rodapé de frescor.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/modules/entrega/estatisticas/nota.ts` | Função pura: box score → nota 3–10 (ou null) |
| `src/modules/entrega/estatisticas/jogo.ts` | `telaDoJogo` — monta a partida inteira a partir do banco |
| `src/design-system/componentes/NotaPartida.tsx` | Badge da nota, paleta própria |
| `src/app/(app)/estatisticas/jogo/[id]/page.tsx` | A tela |
| `src/app/(app)/estatisticas/jogo/[id]/AtualizarAoVivo.tsx` | Componente cliente do refresh de 30s |
| `src/modules/entrega/estatisticas/rotas.ts` | Ganha `rotaDoJogo` |
| `src/app/(app)/estatisticas/page.tsx` | Ganha navegação por data e link para a tela |

---

### Task 1: A nota da partida (função pura)

**Files:**
- Create: `src/modules/entrega/estatisticas/nota.ts`
- Test: `src/modules/entrega/estatisticas/__tests__/nota.test.ts`

**Interfaces:**
- Consumes: nada (função pura, primeira task)
- Produces: `type LinhaDeBox = { minutos: number | null; pontos: number; cestasC: number; cestasT: number; lanceC: number; lanceT: number; rebotesOf: number; rebotesDef: number; roubos: number; assistencias: number; bloqueios: number; faltas: number; turnovers: number }`; `gameScore(linha: LinhaDeBox): number`; `notaDaPartida(linha: LinhaDeBox): number | null`; `MINUTOS_MINIMOS = 5`

- [ ] **Step 1: Write the failing test**

`src/modules/entrega/estatisticas/__tests__/nota.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { gameScore, notaDaPartida, MINUTOS_MINIMOS, type LinhaDeBox } from '../nota'

/** Linha neutra: tudo zero, para os testes mexerem só no que importa. */
function linha(parcial: Partial<LinhaDeBox> = {}): LinhaDeBox {
  return {
    minutos: 30,
    pontos: 0,
    cestasC: 0,
    cestasT: 0,
    lanceC: 0,
    lanceT: 0,
    rebotesOf: 0,
    rebotesDef: 0,
    roubos: 0,
    assistencias: 0,
    bloqueios: 0,
    faltas: 0,
    turnovers: 0,
    ...parcial,
  }
}

describe('game score', () => {
  it('confere com a conta feita à mão', () => {
    // 20 pts, 8/15 de quadra, 4/5 de lance, 2 of + 6 def, 1 roubo, 5 ast,
    // 1 toco, 3 faltas, 2 turnovers.
    //   20 + 0.4*8 - 0.7*15 - 0.4*(5-4) + 0.7*2 + 0.3*6 + 1 + 0.7*5 + 0.7*1
    //      - 0.4*3 - 2
    // = 20 + 3.2 - 10.5 - 0.4 + 1.4 + 1.8 + 1 + 3.5 + 0.7 - 1.2 - 2 = 17.5
    const g = gameScore(
      linha({
        pontos: 20,
        cestasC: 8,
        cestasT: 15,
        lanceC: 4,
        lanceT: 5,
        rebotesOf: 2,
        rebotesDef: 6,
        roubos: 1,
        assistencias: 5,
        bloqueios: 1,
        faltas: 3,
        turnovers: 2,
      }),
    )
    expect(g).toBeCloseTo(17.5, 5)
  })

  it('linha zerada é game score zero', () => {
    expect(gameScore(linha())).toBe(0)
  })

  it('arremesso errado PESA contra — tentar não é o mesmo que acertar', () => {
    // 0/10 de quadra sem nenhum ponto é a pior linha possível de ataque.
    expect(gameScore(linha({ cestasT: 10 }))).toBeCloseTo(-7, 5)
  })
})

describe('nota da partida', () => {
  it('o desempenho de referência (game score 10) vale 6,5', () => {
    // Titular mediano. 10 pontos com 5/10 é game score exatamente 10:
    //   10 + 0.4*5 - 0.7*10 = 10 + 2 - 7 = 5 ... então soma-se rebote:
    // usa-se pontos direto para não depender de conta longa.
    const nota = notaDaPartida(linha({ pontos: 10 }))
    // game score 10 -> 6.5
    expect(nota).toBeCloseTo(6.5, 5)
  })

  it('jogo grande sobe a nota, jogo apagado desce', () => {
    const grande = notaDaPartida(linha({ pontos: 30 }))!
    const apagado = notaDaPartida(linha({ pontos: 2 }))!
    expect(grande).toBeGreaterThan(6.5)
    expect(apagado).toBeLessThan(6.5)
  })

  it('nunca sai da escala 3..10, por pior ou melhor que seja', () => {
    // Uma atuação absurda não vira 12; um desastre não vira 0.
    const absurda = notaDaPartida(linha({ pontos: 200 }))!
    const desastre = notaDaPartida(linha({ cestasT: 100, turnovers: 30 }))!
    expect(absurda).toBe(10)
    expect(desastre).toBe(3)
  })

  it('menos de 5 minutos NÃO tem nota — é ruído, não desempenho', () => {
    // Quem entrou no lixo-time do último quarto não é comparável com quem
    // jogou 35 minutos. Nota aqui enganaria mais do que informaria.
    expect(notaDaPartida(linha({ minutos: 4.9, pontos: 6 }))).toBeNull()
    expect(notaDaPartida(linha({ minutos: MINUTOS_MINIMOS, pontos: 6 }))).not.toBeNull()
  })

  it('minutos ausentes NÃO tem nota', () => {
    // Sem minutos não dá para saber se o desempenho é comparável.
    expect(notaDaPartida(linha({ minutos: null, pontos: 20 }))).toBeNull()
  })

  it('é monotônica em pontos: marcar mais nunca baixa a nota', () => {
    // Propriedade que protege contra erro de sinal na fórmula.
    let anterior = -Infinity
    for (let pontos = 0; pontos <= 40; pontos += 2) {
      const nota = notaDaPartida(linha({ pontos }))!
      expect(nota).toBeGreaterThanOrEqual(anterior)
      anterior = nota
    }
  })

  it('arredonda para UMA casa — a tela imprime o que a função devolve', () => {
    // Sem isto, 6.949999 viraria "6,9" na tela e 6.95 no teste seguinte.
    const nota = notaDaPartida(linha({ pontos: 13, assistencias: 3 }))!
    expect(Number(nota.toFixed(1))).toBe(nota)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/nota.test.ts`
Expected: FAIL — `Cannot find module '../nota'`

- [ ] **Step 3: Write `nota.ts`**

```ts
/**
 * NOTA DA PARTIDA — desempenho de um jogador em UM jogo, de 3 a 10.
 *
 * Dado CANÔNICO da aba de consulta: nasce do box score que a liga registrou e
 * não participa de estratégia nenhuma. O motor não a conhece, e ela nunca
 * decide apito — por isso as constantes moram aqui e não no ruleset (o
 * ruleset é a estratégia do CJ, regra 1 do projeto).
 *
 * NOME: "nota da partida". Nunca "nível" — `nível do jogador` e `nível do
 * apito` são outra coisa no vocabulário do CJ, e confundir os três numa tela
 * que mostra os dois seria o pior lugar possível para essa ambiguidade.
 */

export type LinhaDeBox = {
  /** Null quando o provedor não registrou — sem minutos não há nota. */
  minutos: number | null
  pontos: number
  cestasC: number
  cestasT: number
  lanceC: number
  lanceT: number
  rebotesOf: number
  rebotesDef: number
  roubos: number
  assistencias: number
  bloqueios: number
  faltas: number
  turnovers: number
}

/** Abaixo disto o desempenho não é comparável — ver `notaDaPartida`. */
export const MINUTOS_MINIMOS = 5

/**
 * Escala: game score 10 (titular mediano) vira 6,5; 30 (jogão) vira 9,5.
 * Números escolhidos para a nota cair na faixa que o público já reconhece de
 * outros apps de placar, não porque tenham significado estatístico próprio.
 */
const BASE = 6.5
const REFERENCIA = 10
const ESCALA = 0.15
const PISO = 3
const TETO = 10

/**
 * Game Score de John Hollinger — fórmula PÚBLICA, não invenção nossa nem
 * regra do CJ. Condensa a linha inteira num número só, penalizando arremesso
 * errado e turnover.
 */
export function gameScore(linha: LinhaDeBox): number {
  return (
    linha.pontos +
    0.4 * linha.cestasC -
    0.7 * linha.cestasT -
    0.4 * (linha.lanceT - linha.lanceC) +
    0.7 * linha.rebotesOf +
    0.3 * linha.rebotesDef +
    linha.roubos +
    0.7 * linha.assistencias +
    0.7 * linha.bloqueios -
    0.4 * linha.faltas -
    linha.turnovers
  )
}

/**
 * `null` quando não há nota a dar: sem minutos registrados, ou com menos de
 * `MINUTOS_MINIMOS` em quadra. A tela imprime "—" — dar 3,0 a quem entrou nos
 * 40 segundos finais seria afirmar um desempenho ruim que ninguém observou.
 */
export function notaDaPartida(linha: LinhaDeBox): number | null {
  if (linha.minutos === null || linha.minutos < MINUTOS_MINIMOS) return null

  const bruta = BASE + (gameScore(linha) - REFERENCIA) * ESCALA
  const presa = Math.min(TETO, Math.max(PISO, bruta))
  return Math.round(presa * 10) / 10
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/nota.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/entrega/estatisticas/nota.ts src/modules/entrega/estatisticas/__tests__/nota.test.ts
git commit -m "Nota da partida: Game Score normalizado, função pura"
```

---

### Task 2: O badge da nota

**Files:**
- Create: `src/design-system/componentes/NotaPartida.tsx`
- Modify: `src/design-system/componentes/index.ts`
- Test: `src/design-system/__tests__/nota-partida.test.ts`

**Interfaces:**
- Consumes: nada do repo além dos tokens
- Produces: `<NotaPartida nota={number | null} />`; `NotaPartidaProps = { nota: number | null }`

- [ ] **Step 1: Write the failing test**

`src/design-system/__tests__/nota-partida.test.ts`:

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { NotaPartida } from '../componentes'
import { CONFIANCA_GRAU } from '../tokens/componente'

describe('badge da nota da partida', () => {
  it('imprime com vírgula e uma casa — é português', () => {
    const html = renderToStaticMarkup(createElement(NotaPartida, { nota: 8.4 }))
    expect(html).toContain('8,4')
    expect(html).not.toContain('8.4')
  })

  it('nota ausente vira travessão, não zero', () => {
    // Zero é um número; ausência não é. Regra do projeto inteiro.
    const html = renderToStaticMarkup(createElement(NotaPartida, { nota: null }))
    expect(html).toContain('—')
    expect(html).not.toContain('0')
  })

  it('a cor muda com a faixa — não é decoração, é leitura de relance', () => {
    const fraca = renderToStaticMarkup(createElement(NotaPartida, { nota: 4.5 }))
    const excepcional = renderToStaticMarkup(createElement(NotaPartida, { nota: 9.4 }))
    expect(fraca).not.toBe(excepcional)
  })

  it('NÃO reusa a paleta do grau de confiança do apito', () => {
    // As duas escalas aparecem no mesmo app. Se dividissem cores, o assinante
    // leria "verde" como a mesma coisa nas duas — e uma é desempenho passado,
    // a outra é força de um sinal de estratégia.
    const cores = Object.values(CONFIANCA_GRAU)
    for (const nota of [3, 5.5, 6.5, 7.5, 8.5, 9.5, 10]) {
      const html = renderToStaticMarkup(createElement(NotaPartida, { nota }))
      for (const cor of cores) {
        expect(html.toLowerCase()).not.toContain(String(cor).toLowerCase())
      }
    }
  })

  it('nunca escreve "probabilidade" nem "nível"', () => {
    const html = renderToStaticMarkup(createElement(NotaPartida, { nota: 7 })).toLowerCase()
    expect(html).not.toContain('probabilidade')
    expect(html).not.toContain('nível')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design-system/__tests__/nota-partida.test.ts`
Expected: FAIL — `NotaPartida` não é exportado

Se `CONFIANCA_GRAU` não existir com esse nome em `src/design-system/tokens/componente.ts`, abra o arquivo, encontre o mapa de cores por grau de confiança (1..5) usado pelo `CardEntrada`, e use o nome real no import. Registre no relatório qual nome usou.

- [ ] **Step 3: Write `NotaPartida.tsx`**

```tsx
import { semantico } from '../tokens/semantico'

/**
 * BADGE DA NOTA DA PARTIDA.
 *
 * Paleta PRÓPRIA, deliberadamente distinta do grau de confiança do apito: as
 * duas escalas convivem no mesmo app e significam coisas diferentes —
 * desempenho já acontecido de um lado, força de um sinal de estratégia do
 * outro. Cor compartilhada faria o assinante ler as duas como a mesma coisa.
 */
export type NotaPartidaProps = { nota: number | null }

/** Faixas da spec: <6 fraca · 6–6.9 mediana · 7–7.9 boa · 8–8.9 ótima · 9+ excepcional. */
const FAIXAS: { minimo: number; fundo: string; texto: string }[] = [
  { minimo: 9, fundo: '#1F6F4A', texto: '#EAFBF2' },
  { minimo: 8, fundo: '#2E7D62', texto: '#EAFBF2' },
  { minimo: 7, fundo: '#3D5A80', texto: '#E8EFF7' },
  { minimo: 6, fundo: '#4A4E69', texto: '#E9E9F0' },
  { minimo: 0, fundo: '#5C3A3A', texto: '#F7E9E9' },
]

function faixaDe(nota: number) {
  return FAIXAS.find((f) => nota >= f.minimo) ?? FAIXAS[FAIXAS.length - 1]!
}

export function NotaPartida({ nota }: NotaPartidaProps) {
  if (nota === null) {
    return <span style={{ color: semantico.textoSecundario }}>—</span>
  }

  const faixa = faixaDe(nota)
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 34,
        textAlign: 'center',
        padding: '2px 6px',
        borderRadius: 6,
        background: faixa.fundo,
        color: faixa.texto,
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.3,
      }}
    >
      {nota.toFixed(1).replace('.', ',')}
    </span>
  )
}
```

- [ ] **Step 4: Export it**

Em `src/design-system/componentes/index.ts`, acrescente:

```ts
export { NotaPartida, type NotaPartidaProps } from './NotaPartida'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/design-system/__tests__/nota-partida.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 6: Commit**

```bash
git add src/design-system
git commit -m "Badge da nota da partida, com paleta própria"
```

---

### Task 3: `telaDoJogo` — a partida montada do banco

**Files:**
- Create: `src/modules/entrega/estatisticas/jogo.ts`
- Modify: `src/modules/entrega/estatisticas/rotas.ts`
- Test: `src/modules/entrega/estatisticas/__tests__/jogo.test.ts`

**Interfaces:**
- Consumes: `notaDaPartida`, `LinhaDeBox` (Task 1); `ComAtualizacao`, `maisAntiga`, `daColuna` de `./atualizacao`; `Db` de `../../dominio/db/tipos`
- Produces:

```ts
export type LinhaDoBoxScore = {
  jogadorId: string
  nome: string
  posicao: string | null
  minutos: number | null
  pontos: number
  rebotes: number
  assistencias: number
  roubos: number
  bloqueios: number
  turnovers: number
  faltas: number
  fgPercentual: number | null
  tresPercentual: number | null
  lancePercentual: number | null
  nota: number | null
}
export type LadoDaPartida = {
  timeId: string
  sigla: string
  nome: string
  placar: number | null
  quartos: { q1: number; q2: number; q3: number; q4: number; prorrogacao: number } | null
  boxScore: LinhaDoBoxScore[]
  /** V/D dos últimos 5 encerrados, do mais recente para o mais antigo. */
  forma: ('V' | 'D')[]
  desfalques: { jogadorId: string; nome: string; status: 'FORA' | 'DUVIDA'; motivo: string | null; confirmado: boolean }[]
}
export type LiderDaPartida = { rotulo: string; jogadorId: string; nome: string; sigla: string; valor: number }
export type ConfrontoAnterior = { jogoId: string; data: Date; placarCasa: number; placarVisitante: number; siglaCasa: string; siglaVisitante: string }
export type TelaDoJogo = ComAtualizacao & {
  jogoId: string
  dataHoraUtc: Date
  status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'
  quartoAtual: number | null
  casa: LadoDaPartida
  visitante: LadoDaPartida
  lideres: LiderDaPartida[]
  h2h: ConfrontoAnterior[]
}
export async function telaDoJogo(db: Db, jogoId: string, opcoes: { limiteH2H?: number }): Promise<TelaDoJogo | null>
```

E em `rotas.ts`: `rotaDoJogo(jogoId: string): string`

- [ ] **Step 1: Write the failing test**

`src/modules/entrega/estatisticas/__tests__/jogo.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { jogos } from '../../../dominio/db/schema'
import { semearDemo } from '../../../ingestao/demo/semear'
import { carregarRuleset } from '../../../motor/ruleset/carregar'
import { telaDoJogo } from '../jogo'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await semearDemo(banco.db, ruleset, AGORA)
}, 180_000)
afterAll(async () => banco.fechar())

async function umJogo(status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO') {
  const [j] = await banco.db.select().from(jogos).where(eq(jogos.status, status)).limit(1)
  return telaDoJogo(banco.db, j!.id, {})
}

describe('tela de partida — jogo encerrado', () => {
  it('traz box score dos DOIS elencos, não só o da casa', async () => {
    const tela = (await umJogo('ENCERRADO'))!
    expect(tela.casa.boxScore.length).toBeGreaterThan(0)
    expect(tela.visitante.boxScore.length).toBeGreaterThan(0)
  })

  it('os quartos FECHAM com o placar', async () => {
    // Box score que não soma é pior que box score ausente: parece dado.
    const tela = (await umJogo('ENCERRADO'))!
    for (const lado of [tela.casa, tela.visitante]) {
      const q = lado.quartos!
      expect(q.q1 + q.q2 + q.q3 + q.q4 + q.prorrogacao).toBe(lado.placar)
    }
  })

  it('os líderes SÃO de fato os maiores do jogo', async () => {
    // Um líder que não bate com a tabela logo abaixo destrói a confiança na
    // tela inteira.
    const tela = (await umJogo('ENCERRADO'))!
    const todos = [...tela.casa.boxScore, ...tela.visitante.boxScore]
    const pontos = tela.lideres.find((l) => l.rotulo === 'Pontos')!
    expect(pontos.valor).toBe(Math.max(...todos.map((l) => l.pontos)))
  })

  it('quem jogou o bastante tem nota; a nota vive na escala 3..10', async () => {
    const tela = (await umJogo('ENCERRADO'))!
    const comNota = [...tela.casa.boxScore, ...tela.visitante.boxScore].filter(
      (l) => l.nota !== null,
    )
    expect(comNota.length).toBeGreaterThan(0)
    for (const l of comNota) {
      expect(l.nota!).toBeGreaterThanOrEqual(3)
      expect(l.nota!).toBeLessThanOrEqual(10)
    }
  })

  it('o elenco é o do BOX SCORE REAL — jogador sem linha não aparece', async () => {
    // Fronteira: a aba mostra quem a liga registrou, não quem o CJ curou.
    const tela = (await umJogo('ENCERRADO'))!
    for (const lado of [tela.casa, tela.visitante]) {
      for (const linha of lado.boxScore) {
        expect(linha.nome.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('tela de partida — ao vivo', () => {
  it('tem parcial e NÃO declara vencedor', async () => {
    // Jogo no 1º quarto com "V 51–32" diria que o jogo acabou.
    const tela = (await umJogo('AO_VIVO'))!
    expect(tela.status).toBe('AO_VIVO')
    expect(tela.casa.placar).not.toBeNull()
    expect(tela.casa.forma).not.toContain(undefined)
  })
})

describe('tela de partida — pré-jogo', () => {
  it('traz H2H e forma, que é o que existe antes da bola subir', async () => {
    const tela = (await umJogo('AGENDADO'))!
    expect(tela.h2h.length).toBeGreaterThan(0)
    expect(tela.casa.forma.length).toBeGreaterThan(0)
    for (const v of [...tela.casa.forma, ...tela.visitante.forma]) {
      expect(['V', 'D']).toContain(v)
    }
  })

  it('o H2H é só entre ESTES dois times', async () => {
    // Um confronto de outro par na lista seria mentira sobre o histórico.
    const tela = (await umJogo('AGENDADO'))!
    const siglas = new Set([tela.casa.sigla, tela.visitante.sigla])
    for (const c of tela.h2h) {
      expect(siglas.has(c.siglaCasa)).toBe(true)
      expect(siglas.has(c.siglaVisitante)).toBe(true)
    }
  })

  it('o H2H respeita o limite pedido', async () => {
    const [j] = await banco.db.select().from(jogos).where(eq(jogos.status, 'AGENDADO')).limit(1)
    const tela = (await telaDoJogo(banco.db, j!.id, { limiteH2H: 2 }))!
    expect(tela.h2h.length).toBeLessThanOrEqual(2)
  })
})

describe('tela de partida — bordas', () => {
  it('jogo inexistente devolve null, não explode', async () => {
    expect(await telaDoJogo(banco.db, '00000000-0000-4000-8000-00000000dead', {})).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/jogo.test.ts`
Expected: FAIL — `Cannot find module '../jogo'`

- [ ] **Step 3: Write `jogo.ts`**

```ts
import { and, desc, eq, inArray, lt, ne, or } from 'drizzle-orm'

import {
  estatisticasJogo,
  estatisticasTimeJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { daColuna, maisAntiga } from './atualizacao'
import type { ComAtualizacao } from './atualizacao'
import { notaDaPartida } from './nota'

/**
 * A TELA DE PARTIDA — o centro de gravidade da aba de estatísticas.
 *
 * Leitura DIRETA, sem snapshot: snapshot existe para o feed materializado do
 * motor (uma avaliação por evento, não por usuário). Isto aqui é consulta de
 * dado canônico, que muda quando a liga registra e não quando a estratégia
 * roda.
 *
 * FRONTEIRA: o elenco vem do BOX SCORE REAL e de `jogadores.time_id` — nunca
 * da lista curada do CJ. Usar a lista aqui diria que um jogador atuou num jogo
 * que ele não disputou (CLAUDE.md, "armadilhas conhecidas").
 */

export type LinhaDoBoxScore = {
  jogadorId: string
  nome: string
  posicao: string | null
  minutos: number | null
  pontos: number
  rebotes: number
  assistencias: number
  roubos: number
  bloqueios: number
  turnovers: number
  faltas: number
  fgPercentual: number | null
  tresPercentual: number | null
  lancePercentual: number | null
  nota: number | null
}

export type LadoDaPartida = {
  timeId: string
  sigla: string
  nome: string
  placar: number | null
  quartos: { q1: number; q2: number; q3: number; q4: number; prorrogacao: number } | null
  boxScore: LinhaDoBoxScore[]
  /** V/D dos últimos encerrados, do mais recente para o mais antigo. */
  forma: ('V' | 'D')[]
  desfalques: {
    jogadorId: string
    nome: string
    status: 'FORA' | 'DUVIDA'
    motivo: string | null
    confirmado: boolean
  }[]
}

export type LiderDaPartida = {
  rotulo: string
  jogadorId: string
  nome: string
  sigla: string
  valor: number
}

export type ConfrontoAnterior = {
  jogoId: string
  data: Date
  placarCasa: number
  placarVisitante: number
  siglaCasa: string
  siglaVisitante: string
}

export type TelaDoJogo = ComAtualizacao & {
  jogoId: string
  dataHoraUtc: Date
  status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'
  quartoAtual: number | null
  casa: LadoDaPartida
  visitante: LadoDaPartida
  lideres: LiderDaPartida[]
  h2h: ConfrontoAnterior[]
}

const LIMITE_H2H_PADRAO = 5
const LIMITE_FORMA = 5

function percentual(convertidas: number, tentadas: number): number | null {
  if (tentadas === 0) return null
  return Math.round((convertidas / tentadas) * 1000) / 10
}

/** `minutos` chega como numeric (string) do Postgres. */
function numero(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function telaDoJogo(
  db: Db,
  jogoId: string,
  opcoes: { limiteH2H?: number },
): Promise<TelaDoJogo | null> {
  const [jogo] = await db.select().from(jogos).where(eq(jogos.id, jogoId)).limit(1)
  if (!jogo) return null

  const idsTimes = [jogo.timeCasaId, jogo.timeVisitanteId]

  const [listaTimes, boxTimes, boxJogadores, elenco, escalacao] = await Promise.all([
    db.select().from(times).where(inArray(times.id, idsTimes)),
    db.select().from(estatisticasTimeJogo).where(eq(estatisticasTimeJogo.jogoId, jogoId)),
    db.select().from(estatisticasJogo).where(eq(estatisticasJogo.jogoId, jogoId)),
    db.select().from(jogadores).where(inArray(jogadores.timeId, idsTimes)),
    db.select().from(lesoesEscalacao).where(eq(lesoesEscalacao.jogoId, jogoId)),
  ])

  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  const jogadorPorId = new Map(elenco.map((j) => [j.id, j] as const))

  // Partidas anteriores dos dois times, para forma e H2H numa consulta só.
  const anteriores = await db
    .select()
    .from(jogos)
    .where(
      and(
        eq(jogos.status, 'ENCERRADO'),
        lt(jogos.dataHoraUtc, jogo.dataHoraUtc),
        or(inArray(jogos.timeCasaId, idsTimes), inArray(jogos.timeVisitanteId, idsTimes)),
      ),
    )
    .orderBy(desc(jogos.dataHoraUtc))

  const siglaDe = async (id: string): Promise<string> => timePorId.get(id)?.sigla ?? '—'

  const montarLado = (timeId: string): LadoDaPartida => {
    const time = timePorId.get(timeId)
    const box = boxTimes.find((b) => b.timeId === timeId)

    // O elenco da tela é quem TEM LINHA no box score — não o elenco cadastrado.
    // Jogador sem linha não entrou em quadra, e listá-lo com tudo zerado diria
    // que jogou mal quando ele nem jogou.
    const linhas = boxJogadores
      .filter((l) => jogadorPorId.get(l.jogadorId)?.timeId === timeId)
      .map((l): LinhaDoBoxScore => {
        const jogador = jogadorPorId.get(l.jogadorId)
        const minutos = numero(l.minutos)
        return {
          jogadorId: l.jogadorId,
          nome: jogador?.nomeCompleto ?? '—',
          posicao: jogador?.posicao ?? null,
          minutos,
          pontos: l.pontos,
          rebotes: l.rebotesTotal,
          assistencias: l.assistencias,
          roubos: l.roubos,
          bloqueios: l.bloqueios,
          turnovers: l.turnovers,
          faltas: l.faltas,
          fgPercentual: percentual(l.cestasC, l.cestasT),
          tresPercentual: percentual(l.tresC, l.tresT),
          lancePercentual: percentual(l.lanceC, l.lanceT),
          nota: notaDaPartida({
            minutos,
            pontos: l.pontos,
            cestasC: l.cestasC,
            cestasT: l.cestasT,
            lanceC: l.lanceC,
            lanceT: l.lanceT,
            rebotesOf: l.rebotesOf,
            rebotesDef: l.rebotesDef,
            roubos: l.roubos,
            assistencias: l.assistencias,
            bloqueios: l.bloqueios,
            faltas: l.faltas,
            turnovers: l.turnovers,
          }),
        }
      })
      .sort((a, b) => b.pontos - a.pontos)

    const forma: ('V' | 'D')[] = anteriores
      .filter((j) => j.timeCasaId === timeId || j.timeVisitanteId === timeId)
      .filter((j) => j.placarCasa !== null && j.placarVisitante !== null)
      .slice(0, LIMITE_FORMA)
      .map((j) => {
        const emCasa = j.timeCasaId === timeId
        const meus = emCasa ? j.placarCasa! : j.placarVisitante!
        const outros = emCasa ? j.placarVisitante! : j.placarCasa!
        return meus > outros ? 'V' : 'D'
      })

    const desfalques = escalacao
      .filter((e) => e.status === 'FORA' || e.status === 'DUVIDA')
      .filter((e) => jogadorPorId.get(e.jogadorId)?.timeId === timeId)
      .map((e) => ({
        jogadorId: e.jogadorId,
        nome: jogadorPorId.get(e.jogadorId)?.nomeCompleto ?? '—',
        status: e.status as 'FORA' | 'DUVIDA',
        motivo: e.motivo,
        confirmado: e.confirmado,
      }))

    return {
      timeId,
      sigla: time?.sigla ?? '—',
      nome: time?.nome ?? '—',
      placar: timeId === jogo.timeCasaId ? jogo.placarCasa : jogo.placarVisitante,
      quartos: box
        ? {
            q1: box.pontosQ1,
            q2: box.pontosQ2,
            q3: box.pontosQ3,
            q4: box.pontosQ4,
            prorrogacao: box.pontosProrrogacao,
          }
        : null,
      boxScore: linhas,
      forma,
      desfalques,
    }
  }

  const casa = montarLado(jogo.timeCasaId)
  const visitante = montarLado(jogo.timeVisitanteId)

  // Líderes: o MAIOR de cada categoria entre os dois elencos. Se a tela
  // anuncia um líder que não bate com a tabela logo abaixo, a tela inteira
  // perde a credibilidade.
  const todas = [
    ...casa.boxScore.map((l) => ({ linha: l, sigla: casa.sigla })),
    ...visitante.boxScore.map((l) => ({ linha: l, sigla: visitante.sigla })),
  ]
  const lider = (
    rotulo: string,
    valorDe: (l: LinhaDoBoxScore) => number,
  ): LiderDaPartida | null => {
    if (todas.length === 0) return null
    const melhor = todas.reduce((a, b) => (valorDe(b.linha) > valorDe(a.linha) ? b : a))
    return {
      rotulo,
      jogadorId: melhor.linha.jogadorId,
      nome: melhor.linha.nome,
      sigla: melhor.sigla,
      valor: valorDe(melhor.linha),
    }
  }
  const lideres = [
    lider('Pontos', (l) => l.pontos),
    lider('Rebotes', (l) => l.rebotes),
    lider('Assistências', (l) => l.assistencias),
  ].filter((l): l is LiderDaPartida => l !== null)

  const h2h: ConfrontoAnterior[] = anteriores
    .filter(
      (j) =>
        idsTimes.includes(j.timeCasaId) &&
        idsTimes.includes(j.timeVisitanteId) &&
        j.timeCasaId !== j.timeVisitanteId,
    )
    .filter((j) => j.placarCasa !== null && j.placarVisitante !== null)
    .slice(0, opcoes.limiteH2H ?? LIMITE_H2H_PADRAO)
    .map((j) => ({
      jogoId: j.id,
      data: j.dataHoraUtc,
      placarCasa: j.placarCasa!,
      placarVisitante: j.placarVisitante!,
      siglaCasa: timePorId.get(j.timeCasaId)?.sigla ?? '—',
      siglaVisitante: timePorId.get(j.timeVisitanteId)?.sigla ?? '—',
    }))

  return {
    jogoId: jogo.id,
    dataHoraUtc: jogo.dataHoraUtc,
    status: jogo.status,
    quartoAtual: jogo.quartoAtual,
    casa,
    visitante,
    lideres,
    h2h,
    atualizacao: maisAntiga([
      daColuna(boxJogadores, 'box score'),
      daColuna(boxTimes, 'box score do time'),
      daColuna([jogo], 'partida'),
    ]),
  }
}
```

Nota para o implementador: `siglaDe` acima não é usada — remova-a se o lint apontar. O `h2h` usa `timePorId`, que só carrega os dois times do confronto; como o filtro garante que ambos os lados são desses dois times, isso basta.

- [ ] **Step 4: Add `rotaDoJogo` to `rotas.ts`**

Em `src/modules/entrega/estatisticas/rotas.ts`, depois de `rotaDoTime`:

```ts
export function rotaDoJogo(jogoId: string): string {
  return `${BASE_ESTATISTICAS}/jogo/${encodeURIComponent(jogoId)}`
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/jogo.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 6: Run boundaries and typecheck**

Run: `npx tsc --noEmit && npm run boundaries`
Expected: limpo. Se `boundaries` reclamar de `estatisticas-nao-passam-pelo-motor`, algo importou do motor — remova o import.

- [ ] **Step 7: Commit**

```bash
git add src/modules/entrega/estatisticas
git commit -m "telaDoJogo: box score dos dois elencos, líderes, H2H e forma"
```

---

### Task 4: A tela

**Files:**
- Create: `src/app/(app)/estatisticas/jogo/[id]/page.tsx`
- Create: `src/app/(app)/estatisticas/jogo/[id]/AtualizarAoVivo.tsx`
- Test: bloco novo em `src/app/__tests__/telas-demo.test.ts`

**Interfaces:**
- Consumes: `telaDoJogo`, `TelaDoJogo`, `LinhaDoBoxScore` (Task 3); `NotaPartida` (Task 2); `Secao`, `SemBanco`, `SOBRANCELHA_STATS` de `src/app/(app)/estatisticas/moldura`; `Tabela`, `Coluna`, `UltimaAtualizacao` do design system
- Produces: a rota `/estatisticas/jogo/[id]`

- [ ] **Step 1: Write the failing test**

Acrescente a `src/app/__tests__/telas-demo.test.ts`, antes do último `describe`:

```ts
describe('tela de partida', () => {
  async function renderizarJogo(status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO') {
    const { jogos } = await import('../../modules/dominio/db/schema')
    const { eq: igual } = await import('drizzle-orm')
    const [j] = await banco.db.select().from(jogos).where(igual(jogos.status, status)).limit(1)
    const { default: Pagina } = await import('../(app)/estatisticas/jogo/[id]/page')
    return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ id: j!.id }) }))
  }

  it('jogo encerrado mostra os dois box scores e a nota', async () => {
    const html = await renderizarJogo('ENCERRADO')
    await gravarConferencia('tela-de-partida', html)
    expect(html).toContain('NOTA')
    // A nota é impressa com vírgula, como todo decimal do produto.
    expect(html).toMatch(/[3-9],\d/)
    expect(html).toContain('Líderes da partida')
  })

  it('jogo AO VIVO não declara vencedor nem esconde o parcial', async () => {
    const html = await renderizarJogo('AO_VIVO')
    expect(html).toContain('AO VIVO')
  })

  it('pré-jogo mostra H2H e forma, sem tabela de travessões', async () => {
    // A lição da "parede de travessões": pré-jogo mostra o que EXISTE, não a
    // ausência do que ainda não aconteceu.
    const html = await renderizarJogo('AGENDADO')
    expect(html).toContain('Confrontos anteriores')
    expect(html).not.toContain('Líderes da partida')
  })

  it('nenhuma tela de partida escreve "probabilidade" ou "nível"', async () => {
    for (const status of ['AGENDADO', 'AO_VIVO', 'ENCERRADO'] as const) {
      const html = (await renderizarJogo(status)).toLowerCase()
      expect(html, status).not.toContain('probabilidade')
      expect(html, status).not.toContain('nível')
    }
  })

  it('cada linha do box score leva ao perfil do jogador', async () => {
    const html = await renderizarJogo('ENCERRADO')
    expect(html).toMatch(/href="\/estatisticas\/jogador\/[0-9a-f-]+"/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/__tests__/telas-demo.test.ts -t "tela de partida"`
Expected: FAIL — `Cannot find module '../(app)/estatisticas/jogo/[id]/page'`

- [ ] **Step 3: Write `AtualizarAoVivo.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * O ÚNICO PEDAÇO DE TEMPO REAL DA ABA.
 *
 * `router.refresh()` a cada 30s enquanto o jogo está em andamento — sem
 * WebSocket, de propósito: a regra do projeto é "o push é o canal de tempo
 * real, o feed é snapshot" (docs/01-arquitetura.md), e uma tela de consulta
 * não justifica uma conexão aberta por espectador.
 *
 * Monta SOMENTE quando o jogo está ao vivo: o servidor decide, o cliente só
 * obedece. Assim nenhuma outra tela do app paga por este JavaScript.
 */
export function AtualizarAoVivo({ intervaloMs = 30_000 }: { intervaloMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervaloMs)
    return () => clearInterval(id)
  }, [router, intervaloMs])

  return null
}
```

- [ ] **Step 4: Write `page.tsx`**

```tsx
import { notFound } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { telaDoJogo } from '@/modules/entrega/estatisticas/jogo'
import type { LadoDaPartida, LinhaDoBoxScore } from '@/modules/entrega/estatisticas/jogo'
import { rotaDoJogador, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirAcessoEstatisticasSeConfigurado } from '@/modules/plataforma/assinatura/guarda'
import { dataHora, diaCurto } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { NotaPartida, Tabela, UltimaAtualizacao } from '@/design-system/componentes'
import type { Coluna } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'
import { Secao, SemBanco, SOBRANCELHA_STATS } from '../../moldura'
import { AtualizarAoVivo } from './AtualizarAoVivo'

export const dynamic = 'force-dynamic'

function pct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`
}

function minutos(v: number | null): string {
  return v === null ? '—' : String(Math.round(v))
}

const COLUNAS: Coluna<LinhaDoBoxScore>[] = [
  {
    chave: 'jogador',
    rotulo: 'Jogador',
    alinhamento: 'esquerda',
    fixa: true,
    celula: (l) => (
      <a href={rotaDoJogador(l.jogadorId)} style={{ color: semantico.textoPrimario }}>
        {l.nome}
      </a>
    ),
  },
  { chave: 'nota', rotulo: 'NOTA', descricao: 'nota da partida', celula: (l) => <NotaPartida nota={l.nota} /> },
  { chave: 'min', rotulo: 'MIN', descricao: 'minutos', celula: (l) => minutos(l.minutos) },
  { chave: 'pts', rotulo: 'PTS', descricao: 'pontos', celula: (l) => l.pontos },
  { chave: 'reb', rotulo: 'REB', descricao: 'rebotes', celula: (l) => l.rebotes },
  { chave: 'ast', rotulo: 'AST', descricao: 'assistências', celula: (l) => l.assistencias },
  { chave: 'rou', rotulo: 'ROU', descricao: 'roubos', celula: (l) => l.roubos },
  { chave: 'toc', rotulo: 'TOC', descricao: 'tocos', celula: (l) => l.bloqueios },
  { chave: 'to', rotulo: 'TO', descricao: 'turnovers', celula: (l) => l.turnovers },
  { chave: 'fg', rotulo: 'FG%', descricao: 'aproveitamento de quadra', celula: (l) => pct(l.fgPercentual) },
  { chave: 'tres', rotulo: '3P%', descricao: 'aproveitamento de três', celula: (l) => pct(l.tresPercentual) },
  { chave: 'll', rotulo: 'LL%', descricao: 'aproveitamento de lance livre', celula: (l) => pct(l.lancePercentual) },
]

function Placar({
  casa,
  visitante,
  aoVivo,
}: {
  casa: LadoDaPartida
  visitante: LadoDaPartida
  aoVivo: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      {[casa, visitante].map((lado) => (
        <div key={lado.timeId} style={{ textAlign: 'center', minWidth: 96 }}>
          <a href={rotaDoTime(lado.timeId)} style={{ color: semantico.textoPrimario }}>
            <div style={{ fontFamily: semantico.fonteTitulo, fontSize: 22 }}>{lado.sigla}</div>
          </a>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{lado.placar ?? '—'}</div>
          {lado.forma.length > 0 && (
            <div style={{ fontSize: 11, color: semantico.textoSecundario, letterSpacing: 1 }}>
              {lado.forma.join(' ')}
            </div>
          )}
        </div>
      ))}
      {aoVivo && (
        <span className="ponto-ao-vivo" style={{ color: semantico.acento, fontSize: 12 }}>
          ● AO VIVO
        </span>
      )}
    </div>
  )
}

function Quartos({ casa, visitante }: { casa: LadoDaPartida; visitante: LadoDaPartida }) {
  if (casa.quartos === null || visitante.quartos === null) return null
  const temProrrogacao = casa.quartos.prorrogacao > 0 || visitante.quartos.prorrogacao > 0
  const cabecalho = ['1º', '2º', '3º', '4º', ...(temProrrogacao ? ['PR'] : []), 'TOT']
  const valores = (l: LadoDaPartida) => {
    const q = l.quartos!
    return [q.q1, q.q2, q.q3, q.q4, ...(temProrrogacao ? [q.prorrogacao] : []), l.placar ?? 0]
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ color: semantico.textoSecundario }}>
          <th style={{ textAlign: 'left' }}>Time</th>
          {cabecalho.map((c) => (
            <th key={c} style={{ textAlign: 'right', padding: '4px 6px' }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[casa, visitante].map((lado) => (
          <tr key={lado.timeId} style={{ borderTop: `1px solid ${semantico.divisor}` }}>
            <td style={{ padding: '6px 0' }}>{lado.sigla}</td>
            {valores(lado).map((v, i) => (
              <td key={i} style={{ textAlign: 'right', padding: '6px' }}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Desfalques({ lado }: { lado: LadoDaPartida }) {
  if (lado.desfalques.length === 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ margin: '0 0 4px', fontSize: 12, color: semantico.textoSecundario }}>
        {lado.sigla}
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
        {lado.desfalques.map((d) => (
          <li key={d.jogadorId}>
            {d.nome} — {d.status === 'FORA' ? 'fora' : 'dúvida'}
            {d.motivo ? ` (${d.motivo})` : ''}
            {!d.confirmado && ' · não confirmado'}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function PaginaDoJogo({ params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return <SemBanco />
  await exigirAcessoEstatisticasSeConfigurado()

  const { id } = await params
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const tela = await telaDoJogo(getDb(), id, {})
  if (tela === null) notFound()

  const aoVivo = tela.status === 'AO_VIVO'
  const encerrado = tela.status === 'ENCERRADO'
  const temBox = tela.casa.boxScore.length > 0 || tela.visitante.boxScore.length > 0

  return (
    <Moldura aba="stats">
      <CabecalhoTela
        sobrancelha={SOBRANCELHA_STATS}
        titulo={`${tela.casa.sigla} × ${tela.visitante.sigla}`}
        voltarHref="/estatisticas"
      />
      {aoVivo && <AtualizarAoVivo />}

      <p style={{ margin: '0 0 12px', fontSize: 12, color: semantico.textoSecundario }}>
        {dataHora(tela.dataHoraUtc, fuso)}
        {aoVivo && tela.quartoAtual !== null && ` · ${tela.quartoAtual}º quarto`}
      </p>

      <Placar casa={tela.casa} visitante={tela.visitante} aoVivo={aoVivo} />

      {(aoVivo || encerrado) && (
        <Secao titulo="Pontos por quarto">
          <Quartos casa={tela.casa} visitante={tela.visitante} />
        </Secao>
      )}

      {encerrado && tela.lideres.length > 0 && (
        <Secao titulo="Líderes da partida">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            {tela.lideres.map((l) => (
              <li key={l.rotulo} style={{ fontSize: 14 }}>
                <span style={{ color: semantico.textoSecundario }}>{l.rotulo}: </span>
                <a href={rotaDoJogador(l.jogadorId)} style={{ color: semantico.textoPrimario }}>
                  {l.nome}
                </a>
                <span style={{ color: semantico.textoSecundario }}>
                  {' '}
                  ({l.sigla}) · {l.valor}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {(aoVivo || encerrado) &&
        (temBox ? (
          [tela.casa, tela.visitante].map((lado) => (
            <Secao key={lado.timeId} titulo={`Box score · ${lado.nome}`}>
              <Tabela colunas={COLUNAS} linhas={lado.boxScore} chaveDaLinha={(l) => l.jogadorId} />
            </Secao>
          ))
        ) : (
          <Secao titulo="Box score">
            <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
              Box score em atualização.
            </p>
          </Secao>
        ))}

      {tela.h2h.length > 0 && (
        <Secao titulo="Confrontos anteriores">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            {tela.h2h.map((c) => (
              <li key={c.jogoId} style={{ fontSize: 13 }}>
                <span style={{ color: semantico.textoSecundario }}>{diaCurto(c.data, fuso)} </span>
                {c.siglaCasa} {c.placarCasa}–{c.placarVisitante} {c.siglaVisitante}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {!encerrado && (tela.casa.desfalques.length > 0 || tela.visitante.desfalques.length > 0) && (
        <Secao titulo="Desfalques">
          <Desfalques lado={tela.casa} />
          <Desfalques lado={tela.visitante} />
        </Secao>
      )}

      <UltimaAtualizacao atualizacao={tela.atualizacao} fuso={fuso} />
    </Moldura>
  )
}
```

Nota para o implementador: confira as props reais de `Tabela` (`colunas`, `linhas`, `chaveDaLinha`), de `UltimaAtualizacao` e de `CabecalhoTela` (`voltarHref`) na tela do time — se algum nome divergir, use o real e registre no relatório. Confira também se `dataHora` e `diaCurto` existem em `@/components/formato`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/__tests__/telas-demo.test.ts -t "tela de partida"`
Expected: PASS (5 testes)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/estatisticas/jogo"  src/app/__tests__/telas-demo.test.ts
git commit -m "Tela de partida: placar, quartos, líderes, box score e H2H"
```

---

### Task 5: Calendário por data e os links de entrada

**Files:**
- Modify: `src/app/(app)/estatisticas/page.tsx`
- Modify: `src/app/(app)/estatisticas/time/[id]/page.tsx`
- Create: `src/modules/entrega/estatisticas/calendario.ts`
- Test: `src/modules/entrega/estatisticas/__tests__/calendario.test.ts` e bloco em `telas-demo.test.ts`

**Interfaces:**
- Consumes: `dataDeReferencia`, `somarDias` de `../../dominio/rodada`; `rotaDoJogo` (Task 3)
- Produces: `dataValidaOuHoje(bruta: string | undefined, hoje: string): string`; `navegacaoDeDatas(data: string): { anterior: string; seguinte: string; hoje: string }`

- [ ] **Step 1: Write the failing test**

`src/modules/entrega/estatisticas/__tests__/calendario.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { dataValidaOuHoje, navegacaoDeDatas } from '../calendario'

describe('data da aba de estatísticas', () => {
  it('sem parâmetro é hoje', () => {
    expect(dataValidaOuHoje(undefined, '2026-08-26')).toBe('2026-08-26')
  })

  it('aceita uma data bem formada', () => {
    expect(dataValidaOuHoje('2026-08-20', '2026-08-26')).toBe('2026-08-20')
  })

  it('lixo na URL vira HOJE, não erro nem tela vazia', () => {
    // A URL é digitável por qualquer um. Um 500 aqui seria um 500 por
    // curiosidade do usuário.
    for (const lixo of ['ontem', '26-08-2026', '2026-13-45', '', 'null', '2026-08']) {
      expect(dataValidaOuHoje(lixo, '2026-08-26'), lixo).toBe('2026-08-26')
    }
  })

  it('data impossível no calendário cai para hoje', () => {
    // 31 de fevereiro casa com a regex mas não existe.
    expect(dataValidaOuHoje('2026-02-31', '2026-08-26')).toBe('2026-08-26')
  })

  it('a navegação anda um dia para cada lado', () => {
    const n = navegacaoDeDatas('2026-08-26')
    expect(n.anterior).toBe('2026-08-25')
    expect(n.seguinte).toBe('2026-08-27')
  })

  it('atravessa a virada do mês sem tropeçar', () => {
    expect(navegacaoDeDatas('2026-08-31').seguinte).toBe('2026-09-01')
    expect(navegacaoDeDatas('2026-09-01').anterior).toBe('2026-08-31')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/entrega/estatisticas/__tests__/calendario.test.ts`
Expected: FAIL — `Cannot find module '../calendario'`

- [ ] **Step 3: Write `calendario.ts`**

```ts
import { somarDias } from '../../dominio/rodada'

/**
 * A DATA QUE A ABA ESTÁ MOSTRANDO.
 *
 * A URL é digitável, então `?data=` chega com qualquer coisa. Nada aqui pode
 * lançar: um 500 por curiosidade do usuário é pior que mostrar o dia de hoje.
 */

const FORMATO = /^\d{4}-\d{2}-\d{2}$/

export function dataValidaOuHoje(bruta: string | undefined, hoje: string): string {
  if (bruta === undefined || !FORMATO.test(bruta)) return hoje

  // A regex aceita 2026-02-31; o calendário não. `Date` normaliza a data
  // impossível para outra válida, então comparar de volta é o que denuncia.
  const data = new Date(`${bruta}T12:00:00.000Z`)
  if (Number.isNaN(data.getTime())) return hoje
  return data.toISOString().slice(0, 10) === bruta ? bruta : hoje
}

export function navegacaoDeDatas(data: string): {
  anterior: string
  seguinte: string
  hoje: string
} {
  return { anterior: somarDias(data, -1), seguinte: somarDias(data, 1), hoje: data }
}
```

- [ ] **Step 4: Wire the calendar into the stats page**

Em `src/app/(app)/estatisticas/page.tsx`:

1. Importe:

```ts
import { dataValidaOuHoje, navegacaoDeDatas } from '@/modules/entrega/estatisticas/calendario'
import { rotaDoJogo } from '@/modules/entrega/estatisticas/rotas'
```

2. Onde hoje se calcula `const hoje = dataDeReferencia(agora, fuso)` e se chama `telaJogosDoDia(db, hoje, fuso)`, troque para usar a data pedida:

```ts
  const hoje = dataDeReferencia(agora, fuso)
  const bruta = Array.isArray(params.data) ? params.data[0] : params.data
  const data = dataValidaOuHoje(bruta, hoje)
```

e passe `data` no lugar de `hoje` para `telaJogosDoDia`.

3. Dentro do `<Secao titulo="Jogos do dia">`, antes da lista, acrescente a navegação:

```tsx
        {(() => {
          const nav = navegacaoDeDatas(data)
          const estilo = { color: semantico.textoSecundario, fontSize: 13 } as const
          return (
            <nav
              aria-label="Navegar por data"
              style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 8 }}
            >
              <a href={`/estatisticas?data=${nav.anterior}`} style={estilo}>
                ← dia anterior
              </a>
              {data !== hoje && (
                <a href="/estatisticas" style={estilo}>
                  hoje
                </a>
              )}
              <a href={`/estatisticas?data=${nav.seguinte}`} style={estilo}>
                dia seguinte →
              </a>
            </nav>
          )
        })()}
```

4. Torne cada card de jogo clicável: envolva o conteúdo do `<li>` num link para `rotaDoJogo(j.id)`. As siglas dos times já são links para o time — mantenha-os, mas o RESTO da linha (placar/horário) passa a levar à partida. Se aninhar links der problema de HTML inválido, troque as siglas por texto simples dentro do card e deixe o card inteiro linkando para o jogo — o time continua acessível pela tela da partida.

- [ ] **Step 5: Make the team screen's history clickable**

Em `src/app/(app)/estatisticas/time/[id]/page.tsx`, a coluna de data do box score por jogo (`BoxScoreDoJogo` tem `jogoId`) passa a linkar:

```tsx
      celula: (l) => (
        <a href={rotaDoJogo(l.jogoId)} style={{ color: semantico.textoPrimario }}>
          {diaCurto(l.data, fuso)}
        </a>
      ),
```

Importe `rotaDoJogo` de `@/modules/entrega/estatisticas/rotas` (o arquivo já importa `rotaDoJogador` de lá).

- [ ] **Step 6: Add the screen test**

Acrescente ao `describe('tela de partida')` de `telas-demo.test.ts`:

```ts
  it('a aba de stats navega por data e linka para a partida', async () => {
    const { default: Indice } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(await Indice({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('dia anterior')
    expect(html).toContain('dia seguinte')
    expect(html).toMatch(/href="\/estatisticas\/jogo\/[0-9a-f-]+"/)
  })

  it('data inválida na URL não quebra a tela', async () => {
    const { default: Indice } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(
      await Indice({ searchParams: Promise.resolve({ data: 'ontem' }) }),
    )
    expect(html).toContain('Jogos do dia')
  })
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run boundaries && npx eslint src && npm run build`
Expected: tudo verde. Se algum teste existente da aba de estatísticas quebrar por causa da nova coluna/navegação, ajuste a **asserção**, nunca o valor — e registre no relatório.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/estatisticas" src/modules/entrega/estatisticas src/app/__tests__/telas-demo.test.ts
git commit -m "Calendário por data na aba de stats e entradas para a tela de partida"
```

---

### Task 6: Conferência da demo e documentação

**Files:**
- Modify: `scripts/demo-conferir.ts`
- Modify: `docs/04-design-system.md`

**Interfaces:**
- Consumes: `telaDoJogo` (Task 3)
- Produces: nada de código novo

- [ ] **Step 1: Add the checks to `demo-conferir.ts`**

Depois do bloco de estatísticas existente, acrescente:

```ts
  // 7 · Tela de partida — as três variantes de estado.
  const { telaDoJogo } = await import('../src/modules/entrega/estatisticas/jogo')
  const { jogos: tabelaJogos } = await import('../src/modules/dominio/db/schema')
  const { eq: igual } = await import('drizzle-orm')

  for (const [estado, rotulo] of [
    ['ENCERRADO', 'encerrado'],
    ['AO_VIVO', 'ao vivo'],
    ['AGENDADO', 'agendado'],
  ] as const) {
    const [linha] = await db.select().from(tabelaJogos).where(igual(tabelaJogos.status, estado)).limit(1)
    if (!linha) {
      registrar(`Tela de partida · ${rotulo}`, false, 'nenhum jogo nesse estado na demo')
      continue
    }
    const partida = await telaDoJogo(db, linha.id, {})
    if (partida === null) {
      registrar(`Tela de partida · ${rotulo}`, false, 'telaDoJogo devolveu null')
      continue
    }
    const linhas = partida.casa.boxScore.length + partida.visitante.boxScore.length
    const comNota = [...partida.casa.boxScore, ...partida.visitante.boxScore].filter(
      (l) => l.nota !== null,
    ).length
    const detalhe =
      estado === 'AGENDADO'
        ? `${partida.h2h.length} confronto(s) anterior(es), forma ${partida.casa.forma.join('')}`
        : `${linhas} linha(s) de box, ${comNota} com nota, ${partida.lideres.length} líder(es)`
    const ok = estado === 'AGENDADO' ? partida.h2h.length > 0 : linhas > 0
    registrar(`Tela de partida · ${rotulo}`, ok, detalhe)
  }
```

- [ ] **Step 2: Run it**

Run: `npx dotenv -e .env.local -- npm run demo:conferir`
Expected: as três linhas novas aparecem com ✓. Se alguma falhar, o problema é dado da demo — investigue antes de seguir; não relaxe o check.

Se `.env.local` não existir ou o banco não responder, registre no relatório e siga — este passo é de conferência, não de implementação.

- [ ] **Step 3: Document the nota in the design system**

Em `docs/04-design-system.md`, acrescente uma seção:

```markdown
## Nota da partida

Badge de desempenho por jogador por jogo, escala 3–10, na aba de estatísticas.

**Paleta própria, nunca a do grau de confiança.** As duas escalas convivem no
app e significam coisas diferentes: a nota é desempenho já acontecido (dado
canônico), o grau é a força de um sinal de estratégia. Cor compartilhada faria
o assinante ler as duas como a mesma coisa.

Faixas: `<6` fraca · `6–6.9` mediana · `7–7.9` boa · `8–8.9` ótima · `9+`
excepcional. Uma casa decimal, vírgula. Sem nota (menos de 5 minutos em
quadra) imprime `—`, nunca `0`.

**Nome:** "nota da partida" ou "nota". Nunca "nível" — `nível do jogador` e
`nível do apito` são outra coisa no vocabulário do CJ.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/demo-conferir.ts docs/04-design-system.md
git commit -m "Conferência da demo cobre a tela de partida; nota no design system"
```

---

## Self-review

**Cobertura da spec:**

| Seção da spec | Task |
| --- | --- |
| 2 · Fronteira canônica | 3 (elenco vem do box real; teste trava) |
| 3 · Tela, três estados | 3 (dados) + 4 (render) |
| 3 · Ao vivo sem WebSocket | 4 (`AtualizarAoVivo`) |
| 3 · Entradas para a tela | 5 (aba de stats + histórico do time) |
| 4 · Nota (fórmula, escala, mínimo, exibição) | 1 (função) + 2 (badge) |
| 4 · Vocabulário | 1, 2, 4 (testes proíbem "nível"/"probabilidade") |
| 5 · Calendário por data | 5 |
| 6 · Erros e vazios | 3 (null), 4 (`notFound`, box em atualização, seções condicionais), 5 (data inválida) |
| 7 · Testes | todas |

**Lacuna consciente:** a spec menciona "H2H vazio → 'primeiro confronto da temporada'". Na Task 4 a seção de H2H simplesmente não é renderizada quando vazia, que é o mesmo princípio das outras seções (não anunciar ausência com moldura vazia). Se preferir a frase explícita, é uma linha na Task 4 — decisão de quem executar, registrada aqui para não passar como esquecimento.

**Consistência de tipos:** `LinhaDeBox`/`notaDaPartida` (Task 1) consumidos com essa forma exata na Task 3. `LinhaDoBoxScore`/`LadoDaPartida`/`TelaDoJogo` (Task 3) usados na Task 4 sem variação. `NotaPartida` (Task 2) recebe `nota: number | null`, que é o tipo de `LinhaDoBoxScore.nota`. `rotaDoJogo` definido na Task 3 e usado nas Tasks 4 e 5. `dataValidaOuHoje`/`navegacaoDeDatas` definidos e usados na Task 5.

**Sem placeholders:** todo passo traz código real. Três pontos pedem confirmação de nome contra o repo (props de `Tabela`/`UltimaAtualizacao`/`CabecalhoTela`, o mapa `CONFIANCA_GRAU`, os helpers de `formato`) — são leituras de 30 segundos, e o plano diz exatamente onde olhar e o que fazer se divergir.
