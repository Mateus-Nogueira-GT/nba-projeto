# Casas BetMGM + Altenar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dois adapters de casas de aposta (BetMGM Afiliados V2 e Altenar) atrás da porta `CasaDeAposta` existente, com vínculo de evento e de jogador por nome, prontos para virar configuração quando as contas existirem — mais o Mercado Pago elevado à mesma barra (runbook + `mp:conferir`).

**Architecture:** Adapters L0 com tradução integral na fronteira e `fetch` injetado (padrão `balldontlie-props.ts`); vínculo evento↔jogo por (data + nomes de times normalizados) gravado em `identidades_jogo`; vínculo jogador↔cotação pela nova `mapa_jogadores_casa` (espelho do `mapa_mercados`, semeadura conservadora); `coletarOdds` ganha o caminho de resolução por nome mantendo o de provedor; fiação no cron `sincronizar-rodada` atrás de `fontesDeOdds(env)`.

**Tech Stack:** TypeScript, Zod, Drizzle + Postgres, vitest + PGlite, fixtures HTTP com `vi.fn<typeof fetch>()`.

**Spec:** [`docs/superpowers/specs/2026-08-28-casas-betmgm-altenar-design.md`](../specs/2026-08-28-casas-betmgm-altenar-design.md)


> **Erratas da execução (04/09/2026)** — o plano foi executado e depois
> revisado; onde o código final diverge do texto abaixo, o código manda:
> (1) **Task 1 não criou tabela.** `mapa_jogadores_casa` foi substituída pelo
> mecanismo que já existia (`mapa_jogadores`, namespace `casa:<nome>`,
> `reconciliar.ts`); não há migração 0017. (2) **Task 9 não criou
> `docs/runbooks/mercadopago.md`** — o runbook de cobrança já existia
> (`cobranca-e-acesso.md`) e o `mp:conferir` foi encaixado nele. (3) A
> agregação saiu de `coletarOdds` por fonte para `agregarOddsDoDia`, depois de
> todas as fontes. (4) Nome de mercado da Altenar é separado em modelo +
> jogador antes de consultar `mapa_mercados`.

## Global Constraints

- **ADR-0004:** somente leitura de cotação pública. Nenhum adapter cria conta de apostador, envia aposta ou movimenta dinheiro.
- **Regra 1:** `odds.casas_minimas` e `odds.exibicao` vêm do ruleset; nenhum limiar novo em código.
- Nenhum schema de casa atravessa a porta; descarte é **contado** (`descartadas`/`aguardandoCuradoria`/`semVinculo`), nunca silencioso.
- Só `matchState=PREMATCH` (BetMGM) e `oddStatus===0` (Altenar) geram cotação; o resto descarta contado.
- `probability` da BetMGM é ignorada; a palavra "probabilidade" continua proibida em qualquer superfície.
- Fonte sem env completo = desligada; o app funciona idêntico sem nenhuma das casas.
- Domínio em português, infraestrutura em inglês. Motor (`src/modules/motor/**`) intocado.
- Commits por task com `git -c user.email=mateusnnogueira451@gmail.com -c user.name=Mateus-Nogueira-GT commit -m "..."`.

## Estrutura de arquivos

| Arquivo | Papel |
| --- | --- |
| `src/modules/ingestao/odds/fontes.ts` | lê envs, devolve fontes ativas |
| `src/modules/ingestao/odds/altenar.ts` | adapter Altenar (auth → eventos → odds) |
| `src/modules/ingestao/odds/betmgm.ts` | adapter BetMGM V2 (cursor, specifiers) |
| `src/modules/ingestao/odds/vinculo-eventos.ts` | casador puro + gravação em `identidades_jogo` |
| `src/modules/ingestao/odds/vinculo-jogadores.ts` | semeadura conservadora de `mapa_jogadores_casa` |
| `src/modules/ingestao/odds/coletar.ts` | (modificar) resolução por nome |
| `src/modules/dominio/db/schema/odds.ts` | (modificar) tabela nova |
| `scripts/odds-censo.ts` | censo de mercados/jogadores por fonte |
| `scripts/mp-conferir.ts` + `docs/runbooks/mercadopago.md` | Mercado Pago na mesma barra |
| `docs/runbooks/casas-de-aposta.md` | dia da conta: envs → censo → curadoria → flag |

---

### Task 1: Tabela `mapa_jogadores_casa` + semeadura conservadora

**Files:**
- Modify: `src/modules/dominio/db/schema/odds.ts` (após `mapaMercados`)
- Create: `src/modules/ingestao/odds/vinculo-jogadores.ts`
- Test: `src/modules/ingestao/odds/__tests__/vinculo-jogadores.test.ts`
- Modify: `src/modules/dominio/__tests__/persistencia.test.ts` (censo +1)

**Interfaces:**
- Consumes: `normalizarTexto` de `src/modules/dominio/texto`; `jogadores`, `casas` do schema.
- Produces: tabela `mapaJogadoresCasa`; `semearVinculosDeJogador(db, casaId, nomes: string[]): Promise<{ confirmados: number; pendentes: number }>`; `vinculosConfirmados(db, casaId): Promise<Map<string, string>>` (nomeNaCasa → jogadorId).

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { casas, jogadores, mapaJogadoresCasa } from '../../../dominio/db/schema'
import { semearVinculosDeJogador, vinculosConfirmados } from '../vinculo-jogadores'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let casaId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [casa] = await banco.db.insert(casas).values({ nome: 'betmgm', tipoApi: 'betmgm' }).returning()
  casaId = casa!.id
  await banco.db.insert(jogadores).values([
    { nomeCompleto: 'Stephen Curry' },
    { nomeCompleto: 'Jamal Murray' },
    // Dois "Murray" tornam "murray" sozinho AMBÍGUO de propósito.
    { nomeCompleto: 'Keegan Murray' },
  ])
}, 120_000)
afterAll(async () => banco.fechar())

describe('vínculo de jogador por nome de casa', () => {
  it('match exato normalizado e ÚNICO nasce confirmado', async () => {
    const r = await semearVinculosDeJogador(banco.db, casaId, ['Stephen  CURRY'])
    expect(r.confirmados).toBe(1)
    const mapa = await vinculosConfirmados(banco.db, casaId)
    expect([...mapa.keys()]).toContain('Stephen  CURRY')
  })

  it('ambíguo ou desconhecido nasce PENDENTE — curadoria, nunca palpite', async () => {
    const r = await semearVinculosDeJogador(banco.db, casaId, ['Murray', 'Fulano Inexistente'])
    expect(r.confirmados).toBe(0)
    expect(r.pendentes).toBe(2)
    const linhas = await banco.db.select().from(mapaJogadoresCasa)
    const pendentes = linhas.filter((l) => !l.confirmado)
    expect(pendentes.length).toBeGreaterThanOrEqual(2)
    // Pendente NÃO aparece no mapa de resolução.
    const mapa = await vinculosConfirmados(banco.db, casaId)
    expect(mapa.has('Murray')).toBe(false)
  })

  it('reexecutar não duplica nem rebaixa confirmação humana', async () => {
    await semearVinculosDeJogador(banco.db, casaId, ['Stephen  CURRY'])
    const linhas = await banco.db.select().from(mapaJogadoresCasa)
    const curry = linhas.filter((l) => l.nomeNaCasa === 'Stephen  CURRY')
    expect(curry).toHaveLength(1)
    expect(curry[0]!.confirmado).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/ingestao/odds/__tests__/vinculo-jogadores.test.ts`
Expected: FAIL — `mapaJogadoresCasa` não existe no schema

- [ ] **Step 3: Add table to `schema/odds.ts`** (após `mapaMercados`; imports já existem)

```ts
/**
 * Mesmo problema do mapa_mercados, aplicado a NOMES DE JOGADOR: casas por
 * nome (BetMGM, Altenar) não compartilham ids com o provedor NBA. O vínculo
 * nasce confirmado SÓ quando o nome normalizado casa com exatamente um
 * jogador canônico; qualquer dúvida vira pendência de curadoria — palpite
 * aqui é box score do jogador errado na média do card.
 */
export const mapaJogadoresCasa = pgTable(
  'mapa_jogadores_casa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id),
    nomeNaCasa: text('nome_na_casa').notNull(),
    jogadorId: uuid('jogador_id').references(() => jogadores.id),
    confirmado: boolean('confirmado').notNull().default(false),
  },
  (t) => [unique('mapa_jogadores_casa_unico').on(t.casaId, t.nomeNaCasa)],
)
```

(Se `jogadores` não estiver importado em `odds.ts`, importe de `./dominio`.)

- [ ] **Step 4: Write `vinculo-jogadores.ts`**

```ts
import { and, eq } from 'drizzle-orm'

import { jogadores, mapaJogadoresCasa } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { normalizarTexto } from '../../dominio/texto'

/**
 * SEMEADURA CONSERVADORA do vínculo jogador↔casa.
 *
 * Match exato do nome normalizado com EXATAMENTE um jogador canônico →
 * confirmado. Zero ou dois+ candidatos → pendente, esperando curadoria.
 * O mesmo princípio do identidade.ts da ingestão NBA: a máquina só decide o
 * caso sem ambiguidade; o resto é humano.
 *
 * Idempotente: reexecutar não duplica (UNIQUE casa+nome) e NUNCA rebaixa uma
 * confirmação já feita — onConflictDoNothing, porque a curadoria humana é
 * autoridade acima da semeadura.
 */
export async function semearVinculosDeJogador(
  db: Db,
  casaId: string,
  nomesNaCasa: string[],
): Promise<{ confirmados: number; pendentes: number }> {
  const canonicos = await db
    .select({ id: jogadores.id, nome: jogadores.nomeCompleto })
    .from(jogadores)
  const porNomeNormalizado = new Map<string, string[]>()
  for (const j of canonicos) {
    const chave = normalizarTexto(j.nome)
    porNomeNormalizado.set(chave, [...(porNomeNormalizado.get(chave) ?? []), j.id])
  }

  let confirmados = 0
  let pendentes = 0
  for (const nome of new Set(nomesNaCasa)) {
    const candidatos = porNomeNormalizado.get(normalizarTexto(nome)) ?? []
    const unico = candidatos.length === 1 ? candidatos[0]! : null
    const [inserida] = await db
      .insert(mapaJogadoresCasa)
      .values({ casaId, nomeNaCasa: nome, jogadorId: unico, confirmado: unico !== null })
      .onConflictDoNothing({ target: [mapaJogadoresCasa.casaId, mapaJogadoresCasa.nomeNaCasa] })
      .returning()
    if (!inserida) continue // já existia — a linha antiga manda
    if (inserida.confirmado) confirmados += 1
    else pendentes += 1
  }
  return { confirmados, pendentes }
}

/** Só o que a curadoria (ou a semeadura sem ambiguidade) confirmou resolve cotação. */
export async function vinculosConfirmados(db: Db, casaId: string): Promise<Map<string, string>> {
  const linhas = await db
    .select({ nome: mapaJogadoresCasa.nomeNaCasa, jogadorId: mapaJogadoresCasa.jogadorId })
    .from(mapaJogadoresCasa)
    .where(and(eq(mapaJogadoresCasa.casaId, casaId), eq(mapaJogadoresCasa.confirmado, true)))
  return new Map(linhas.filter((l) => l.jogadorId !== null).map((l) => [l.nome, l.jogadorId!]))
}
```

- [ ] **Step 5:** `npm run db:generate` (migração 0017) · atualizar o censo de tabelas em `persistencia.test.ts` (+1, ler o número no erro) · rodar o teste → PASS
- [ ] **Step 6: Commit** — `Vínculo jogador↔casa por nome: confirmado só sem ambiguidade`

---

### Task 2: Configuração das fontes (`fontes.ts`)

**Files:**
- Create: `src/modules/ingestao/odds/fontes.ts`
- Test: `src/modules/ingestao/odds/__tests__/fontes.test.ts`

**Interfaces:**
- Produces: `type FonteOdds = { nome: 'betmgm'; config: ConfigBetmgm } | { nome: 'altenar'; config: ConfigAltenar }`; `fontesDeOdds(ambiente?): FonteOdds[]`; `ConfigBetmgm = { baseUrl, apiKey, authHeader, authPrefix, brand, location, lang }`; `ConfigAltenar = { gatewayBase, origin, integration, sportId, champId: string | null }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'

import { fontesDeOdds } from '../fontes'

const vazio = {} as NodeJS.ProcessEnv
const betmgmOk = {
  ODDS_BETMGM_BASE_URL: 'https://afiliados.betmgm.example',
  ODDS_BETMGM_API_KEY: 'k',
  ODDS_BETMGM_BRAND: 'marca',
  ODDS_BETMGM_LOCATION: 'BR',
} as NodeJS.ProcessEnv
const altenarOk = {
  ODDS_ALTENAR_GATEWAY_BASE: 'https://gw.altenar.example',
  ODDS_ALTENAR_ORIGIN: 'https://nosso.app',
  ODDS_ALTENAR_INTEGRATION: 'nossa',
  ODDS_ALTENAR_SPORT_ID: '67',
} as NodeJS.ProcessEnv

describe('fontes de odds por ambiente', () => {
  it('sem env nenhum, nenhuma fonte — o app segue intacto', () => {
    expect(fontesDeOdds(vazio)).toEqual([])
  })

  it('config completa liga a fonte; padrões de auth preenchidos', () => {
    const [f] = fontesDeOdds(betmgmOk)
    expect(f).toMatchObject({ nome: 'betmgm' })
    if (f?.nome === 'betmgm') {
      expect(f.config.authHeader).toBe('Authorization')
      expect(f.config.authPrefix).toBe('Bearer ')
      expect(f.config.lang).toBe('en')
    }
  })

  it('config INCOMPLETA não liga meia-fonte — falta brand, fica fora', () => {
    const semBrand = { ...betmgmOk, ODDS_BETMGM_BRAND: undefined } as NodeJS.ProcessEnv
    expect(fontesDeOdds(semBrand)).toEqual([])
  })

  it('as duas juntas quando as duas estão completas', () => {
    const ambos = { ...betmgmOk, ...altenarOk } as NodeJS.ProcessEnv
    expect(fontesDeOdds(ambos).map((f) => f.nome).sort()).toEqual(['altenar', 'betmgm'])
  })
})
```

- [ ] **Step 2:** rodar → FAIL (módulo não existe)
- [ ] **Step 3: Write `fontes.ts`**

```ts
/**
 * QUAIS CASAS ESTÃO LIGADAS — decisão única, por ambiente.
 *
 * Fonte só existe com config COMPLETA: meia-config ligaria uma coleta que
 * falha todo dia às 9h em silêncio. Sem env nenhum, lista vazia e o app
 * inteiro segue como hoje (a tabela estática é o fallback das telas).
 */
export type ConfigBetmgm = {
  baseUrl: string
  apiKey: string
  /** O PDF não fixa o esquema de credencial — header e prefixo são config. */
  authHeader: string
  authPrefix: string
  brand: string
  location: string
  lang: string
}

export type ConfigAltenar = {
  gatewayBase: string
  origin: string
  integration: string
  sportId: string
  champId: string | null
}

export type FonteOdds =
  | { nome: 'betmgm'; config: ConfigBetmgm }
  | { nome: 'altenar'; config: ConfigAltenar }

const limpo = (v: string | undefined): string | null => {
  const s = (v ?? '').trim()
  return s === '' ? null : s
}

export function fontesDeOdds(ambiente: NodeJS.ProcessEnv = process.env): FonteOdds[] {
  const fontes: FonteOdds[] = []

  const bBase = limpo(ambiente.ODDS_BETMGM_BASE_URL)
  const bKey = limpo(ambiente.ODDS_BETMGM_API_KEY)
  const bBrand = limpo(ambiente.ODDS_BETMGM_BRAND)
  const bLocation = limpo(ambiente.ODDS_BETMGM_LOCATION)
  if (bBase && bKey && bBrand && bLocation) {
    fontes.push({
      nome: 'betmgm',
      config: {
        baseUrl: bBase,
        apiKey: bKey,
        authHeader: limpo(ambiente.ODDS_BETMGM_AUTH_HEADER) ?? 'Authorization',
        authPrefix: ambiente.ODDS_BETMGM_AUTH_PREFIX ?? 'Bearer ',
        brand: bBrand,
        location: bLocation,
        lang: limpo(ambiente.ODDS_BETMGM_LANG) ?? 'en',
      },
    })
  }

  const aBase = limpo(ambiente.ODDS_ALTENAR_GATEWAY_BASE)
  const aOrigin = limpo(ambiente.ODDS_ALTENAR_ORIGIN)
  const aIntegration = limpo(ambiente.ODDS_ALTENAR_INTEGRATION)
  const aSport = limpo(ambiente.ODDS_ALTENAR_SPORT_ID)
  if (aBase && aOrigin && aIntegration && aSport) {
    fontes.push({
      nome: 'altenar',
      config: {
        gatewayBase: aBase,
        origin: aOrigin,
        integration: aIntegration,
        sportId: aSport,
        champId: limpo(ambiente.ODDS_ALTENAR_CHAMP_ID),
      },
    })
  }

  return fontes
}
```

- [ ] **Step 4:** rodar → PASS (4 testes) · **Step 5: Commit** — `Fontes de odds por ambiente: config completa ou fonte desligada`

---

### Task 3: Adapter Altenar

**Files:**
- Create: `src/modules/ingestao/odds/altenar.ts`
- Test: `src/modules/ingestao/odds/__tests__/altenar.test.ts`

**Interfaces:**
- Consumes: `ConfigAltenar` (Task 2); `CasaDeAposta`, `CotacaoExterna` (porta); `mapaMercados` (resolução de atributo é do `coletarOdds`, não daqui — o adapter entrega `nomeMercadoNaCasa` cru e `atributo` só quando o mapa confirmado for injetado).
- Produces: `autenticarAltenar(config, buscar): Promise<string>` (token); `eventosDoDiaAltenar(config, token, dia: string, buscar): Promise<EventoAltenar[]>` com `EventoAltenar = { idExterno: string; nomeCasa: string | null; nomeVisitante: string | null; inicioIso: string | null }`; `casasAltenar(config, token, atributoDoMercado: (nome: string) => Atributo | undefined, buscar, eventoIdExterno): Promise<CasaDeAposta[]>`.

- [ ] **Step 1: Write the failing test** (fixtures espelham o guia)

```ts
import { describe, expect, it, vi } from 'vitest'

import { autenticarAltenar, casasAltenar, eventosDoDiaAltenar } from '../altenar'
import type { ConfigAltenar } from '../fontes'

const CONFIG: ConfigAltenar = {
  gatewayBase: 'https://gw.altenar.example',
  origin: 'https://nosso.app',
  integration: 'nossa',
  sportId: '67',
  champId: '3999',
}

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

describe('autenticação', () => {
  it('manda Origin e x-Integration e aceita o token em qualquer dos campos do guia', async () => {
    for (const corpo of [{ token: 't1' }, { apiToken: 't1' }, { access_token: 't1' }, { data: { token: 't1' } }]) {
      const buscar = vi.fn<typeof fetch>(async () => json(corpo))
      const token = await autenticarAltenar(CONFIG, buscar)
      expect(token).toBe('t1')
      const [url, init] = buscar.mock.calls[0]!
      expect(String(url)).toBe('https://gw.altenar.example/api/authenticate')
      const h = init!.headers as Record<string, string>
      expect(h.Origin).toBe('https://nosso.app')
      expect(h['x-Integration']).toBe('nossa')
    }
  })
})

describe('eventos do dia', () => {
  it('filtra por sportId/champId/datas e normaliza os participantes', async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      json({ data: [{ eventId: 15979600, name: 'Lakers vs Celtics', startDate: '2026-08-28T23:00:00Z' }] }),
    )
    const eventos = await eventosDoDiaAltenar(CONFIG, 'tok', '2026-08-28', buscar)
    expect(eventos).toEqual([
      {
        idExterno: '15979600',
        nomeCasa: 'Lakers',
        nomeVisitante: 'Celtics',
        inicioIso: '2026-08-28T23:00:00Z',
      },
    ])
    const url = String(buscar.mock.calls[0]![0])
    expect(url).toContain('/api/v1/events?')
    expect(url).toContain('sportId=67')
    expect(url).toContain('champId=3999')
    const h = buscar.mock.calls[0]![1]!.headers as Record<string, string>
    expect(h['X-ApiToken']).toBe('tok')
  })

  it('nome sem separador reconhecível vira participantes nulos — vínculo decide, não o adapter', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json({ data: [{ eventId: 1, name: 'All-Star Game' }] }))
    const [e] = await eventosDoDiaAltenar(CONFIG, 'tok', '2026-08-28', buscar)
    expect(e!.nomeCasa).toBeNull()
  })
})

describe('odds por evento', () => {
  const EVENTO = {
    id: 15979600,
    markets: [
      {
        marketId: 1,
        name: 'Total de Pontos - Stephen Curry',
        odds: [
          { id: 10, price: 1.85, oddStatus: 0, name: 'Mais de 24.5' },
          { id: 11, price: 1.95, oddStatus: 0, name: 'Menos de 24.5' },
        ],
      },
      {
        marketId: 2,
        name: 'Vencedor da Partida',
        odds: [{ id: 20, price: 1.5, oddStatus: 0, name: 'Lakers' }],
      },
      {
        marketId: 3,
        name: 'Total de Pontos - Jamal Murray',
        odds: [{ id: 30, price: 2.0, oddStatus: 1, name: 'Mais de 18.5' }],
      },
    ],
  }

  it('traduz mercado mapeado, extrai linha do "Mais de", pareia o under, descarta o resto CONTADO', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO))
    const atributoDoMercado = (nome: string) =>
      nome.startsWith('Total de Pontos') ? ('PONTOS' as const) : undefined
    const [casa] = await casasAltenar(CONFIG, 'tok', atributoDoMercado, buscar, '15979600')
    const cotacoes = await casa!.cotacoes('15979600')

    expect(cotacoes).toHaveLength(1)
    expect(cotacoes[0]).toMatchObject({
      jogadorNomeNaCasa: 'Stephen Curry',
      nomeMercadoNaCasa: 'Total de Pontos - Stephen Curry',
      linha: 25, // 24.5 do lado over → linha inteira do CJ
      oddOver: 1.85,
      oddUnder: 1.95,
      atributo: 'PONTOS',
    })
    // Vencedor da Partida (sem mapa) + Murray (oddStatus 1, suspensa) = 2 descartes.
    expect(casa!.descartadas!()).toBe(2)
  })

  it('pedir outro evento é bug de quem chama', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO))
    const [casa] = await casasAltenar(CONFIG, 'tok', () => undefined, buscar, '15979600')
    await expect(casa!.cotacoes('99')).rejects.toThrow(/fatiada/)
  })
})
```

- [ ] **Step 2:** rodar → FAIL · **Step 3: Write `altenar.ts`**

```ts
import { z } from 'zod'

import { linhaDoLadoOver } from './conversao'
import type { ConfigAltenar } from './fontes'
import type { CasaDeAposta, CotacaoExterna } from './porta'
import type { Atributo } from '../../motor/tipos'

/**
 * Adapter Altenar — fluxo do guia: authenticate → X-ApiToken → eventos →
 * odds por evento. Token NÃO é persistido (o guia autentica a cada request;
 * nossa coleta é 1×/dia).
 *
 * ADR-0004: o token é de LEITURA do feed público da integração, nunca conta
 * de apostador.
 */

const QUERY_COMUM =
  'culture=pt-BR&timezoneOffset=180&deviceType=2&numFormat=en-GB&countryCode=BR'

const tokenSchema = z
  .object({
    token: z.string().optional(),
    apiToken: z.string().optional(),
    access_token: z.string().optional(),
    data: z.object({ token: z.string().optional() }).optional(),
  })
  .passthrough()

export async function autenticarAltenar(
  config: ConfigAltenar,
  buscar: typeof fetch = fetch,
): Promise<string> {
  const resposta = await buscar(`${config.gatewayBase}/api/authenticate`, {
    headers: { Origin: config.origin, 'x-Integration': config.integration, accept: 'application/json' },
  })
  if (!resposta.ok) throw new Error(`altenar authenticate: HTTP ${resposta.status}`)
  const corpo = tokenSchema.parse(await resposta.json())
  const token = corpo.token ?? corpo.apiToken ?? corpo.access_token ?? corpo.data?.token
  if (!token) throw new Error('altenar authenticate: resposta sem token em nenhum campo conhecido')
  return token
}

function cabecalhos(config: ConfigAltenar, token: string): Record<string, string> {
  return {
    Origin: config.origin,
    'x-Integration': config.integration,
    accept: 'application/json',
    'X-ApiToken': token,
  }
}

export type EventoAltenar = {
  idExterno: string
  nomeCasa: string | null
  nomeVisitante: string | null
  inicioIso: string | null
}

const eventosSchema = z.object({
  data: z
    .array(
      z
        .object({
          eventId: z.union([z.string(), z.number()]).transform(String).optional(),
          id: z.union([z.string(), z.number()]).transform(String).optional(),
          name: z.string().nullish(),
          startDate: z.string().nullish(),
        })
        .passthrough(),
    )
    .default([]),
})

/** "Lakers vs Celtics" / "Lakers x Celtics" / "Lakers - Celtics" → os dois lados. */
function participantesDoNome(nome: string | null | undefined): {
  casa: string | null
  visitante: string | null
} {
  if (!nome) return { casa: null, visitante: null }
  const m = nome.split(/\s+(?:vs\.?|x|[-–])\s+/i)
  if (m.length !== 2) return { casa: null, visitante: null }
  return { casa: m[0]!.trim(), visitante: m[1]!.trim() }
}

export async function eventosDoDiaAltenar(
  config: ConfigAltenar,
  token: string,
  dia: string,
  buscar: typeof fetch = fetch,
): Promise<EventoAltenar[]> {
  const champ = config.champId ? `&champId=${config.champId}` : ''
  const url =
    `${config.gatewayBase}/api/v1/events?${QUERY_COMUM}&integration=${config.integration}` +
    `&sportId=${config.sportId}${champ}&dateFrom=${dia}&dateTo=${dia}&page=1&pageSize=100`
  const resposta = await buscar(url, { headers: cabecalhos(config, token) })
  if (!resposta.ok) throw new Error(`altenar events: HTTP ${resposta.status}`)
  const corpo = eventosSchema.parse(await resposta.json())
  return corpo.data
    .map((e) => {
      const id = e.eventId ?? e.id
      if (!id) return null
      const { casa, visitante } = participantesDoNome(e.name)
      return { idExterno: id, nomeCasa: casa, nomeVisitante: visitante, inicioIso: e.startDate ?? null }
    })
    .filter((e): e is EventoAltenar => e !== null)
}

const eventoDetalheSchema = z
  .object({
    markets: z
      .array(
        z
          .object({
            name: z.string().nullish(),
            odds: z
              .array(
                z
                  .object({
                    price: z.union([z.string(), z.number()]).transform(Number).nullish(),
                    oddStatus: z.number().nullish(),
                    name: z.string().nullish(),
                  })
                  .passthrough(),
              )
              .default([]),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough()

/** "Total de Pontos - Stephen Curry" → o nome depois do último " - ". */
function jogadorDoNomeDeMercado(nome: string): string | null {
  const partes = nome.split(' - ')
  return partes.length >= 2 ? partes[partes.length - 1]!.trim() : null
}

/** "Mais de 24.5" / "Menos de 24.5" — o lado e o valor. */
function ladoEValor(nome: string | null | undefined): { lado: 'over' | 'under'; valor: string } | null {
  if (!nome) return null
  const m = nome.match(/^(Mais de|Menos de|Over|Under)\s+(\d+(?:[.,]\d+)?)/i)
  if (!m) return null
  const lado = /^(mais|over)/i.test(m[1]!) ? 'over' : 'under'
  return { lado, valor: m[2]!.replace(',', '.') }
}

class CasaAltenar implements CasaDeAposta {
  #descartadas: number
  constructor(
    readonly nome: string,
    private readonly eventoIdExterno: string,
    private readonly itens: CotacaoExterna[],
    descartadas: number,
  ) {
    this.#descartadas = descartadas
  }
  async cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]> {
    if (jogoIdExterno !== this.eventoIdExterno) {
      throw new Error(`altenar: casa fatiada para o evento ${this.eventoIdExterno}, pedido ${jogoIdExterno}`)
    }
    return this.itens.map((c) => ({ ...c }))
  }
  descartadas(): number {
    return this.#descartadas
  }
}

/**
 * Busca `GET /api/v1/events/{id}` e traduz. `atributoDoMercado` é o mapa de
 * mercados CONFIRMADO injetado pelo chamador — mercado fora do mapa descarta
 * contado (a curadoria decide depois; o adapter nunca adivinha).
 */
export async function casasAltenar(
  config: ConfigAltenar,
  token: string,
  atributoDoMercado: (nomeMercado: string) => Atributo | undefined,
  buscar: typeof fetch = fetch,
  eventoIdExterno?: string,
): Promise<CasaDeAposta[]> {
  const id = eventoIdExterno!
  const url =
    `${config.gatewayBase}/api/v1/events/${id}?${QUERY_COMUM}` +
    `&integration=${config.integration}&sportId=${config.sportId}`
  const resposta = await buscar(url, { headers: cabecalhos(config, token) })
  if (!resposta.ok) throw new Error(`altenar event ${id}: HTTP ${resposta.status}`)
  const corpo = eventoDetalheSchema.parse(await resposta.json())

  let descartadas = 0
  const itens: CotacaoExterna[] = []

  for (const mercado of corpo.markets) {
    const nomeMercado = mercado.name ?? ''
    const atributo = atributoDoMercado(nomeMercado)
    const jogador = jogadorDoNomeDeMercado(nomeMercado)

    // Agrupa over/under pela MESMA linha dentro do mercado.
    const porLinha = new Map<string, { over: number | null; under: number | null }>()
    let ativasNoMercado = 0
    for (const odd of mercado.odds) {
      if (odd.oddStatus !== 0 || odd.price == null || !Number.isFinite(odd.price)) {
        descartadas += 1
        continue
      }
      const lv = ladoEValor(odd.name)
      if (!lv) {
        descartadas += 1
        continue
      }
      ativasNoMercado += 1
      const atual = porLinha.get(lv.valor) ?? { over: null, under: null }
      atual[lv.lado] = odd.price
      porLinha.set(lv.valor, atual)
    }

    if (atributo === undefined || jogador === null) {
      // Mercado fora do mapa (ou sem jogador no nome): tudo que sobrou vira
      // descarte contado — é o que o censo e a curadoria vão revelar.
      descartadas += ativasNoMercado
      continue
    }

    for (const [valor, lados] of porLinha) {
      const linha = linhaDoLadoOver(valor)
      if (linha === null || lados.over === null) {
        descartadas += 1
        continue
      }
      itens.push({
        jogadorNomeNaCasa: jogador,
        nomeMercadoNaCasa: nomeMercado,
        linha,
        oddOver: lados.over,
        oddUnder: lados.under,
      })
    }
  }

  return [new CasaAltenar('altenar', id, itens, descartadas)]
}
```

- [ ] **Step 4:** rodar → PASS (5 testes) · **Step 5: Commit** — `Adapter Altenar: authenticate, eventos do dia e odds por evento`

---

### Task 4: Adapter BetMGM V2

**Files:**
- Create: `src/modules/ingestao/odds/betmgm.ts`
- Test: `src/modules/ingestao/odds/__tests__/betmgm.test.ts`

**Interfaces:**
- Consumes: `ConfigBetmgm` (Task 2); porta; `linhaDoLadoOver` (conversao).
- Produces: `eventosDoDiaBetmgm(config, dia, buscar): Promise<EventoBetmgm[]>` com `EventoBetmgm = { idExterno: string; nomeCasa: string | null; nomeVisitante: string | null; inicioIso: string | null }`; `casasBetmgm(config, atributoDoMercado, buscar, eventoIdExterno): Promise<CasaDeAposta[]>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'

import { casasBetmgm, eventosDoDiaBetmgm } from '../betmgm'
import type { ConfigBetmgm } from '../fontes'

const CONFIG: ConfigBetmgm = {
  baseUrl: 'https://afiliados.betmgm.example',
  apiKey: 'chave',
  authHeader: 'Authorization',
  authPrefix: 'Bearer ',
  brand: 'marca',
  location: 'BR',
  lang: 'en',
}

const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

describe('eventos do dia (V2, cursor)', () => {
  it('segue o cursor até null e injeta lang/brand/location em TODA chamada', async () => {
    const pagina1 = {
      limit: 100,
      nextCursor: 'c2',
      data: [
        {
          id: 'ev1',
          matchState: 'PREMATCH',
          eventName: null, // o PDF avisa: pode ser nulo
          participants: [{ name: 'Los Angeles Lakers' }, { name: 'Boston Celtics' }],
          startTime: '2026-08-28T23:00:00Z',
        },
      ],
    }
    const pagina2 = {
      limit: 100,
      nextCursor: null,
      data: [
        { id: 'ev2', matchState: 'ONGOING', participants: [{ name: 'A' }, { name: 'B' }] },
      ],
    }
    const buscar = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(pagina1))
      .mockResolvedValueOnce(json(pagina2))

    const eventos = await eventosDoDiaBetmgm(CONFIG, '2026-08-28', buscar)

    // ev2 está ONGOING: pré-live não coleta — fora, sem erro.
    expect(eventos).toEqual([
      {
        idExterno: 'ev1',
        nomeCasa: 'Los Angeles Lakers',
        nomeVisitante: 'Boston Celtics',
        inicioIso: '2026-08-28T23:00:00Z',
      },
    ])
    expect(buscar).toHaveBeenCalledTimes(2)
    for (const chamada of buscar.mock.calls) {
      const url = String(chamada[0])
      expect(url).toContain('/program/v1/api/aff/v2/events')
      expect(url).toContain('lang=en')
      expect(url).toContain('brand=marca')
      expect(url).toContain('location=BR')
      expect(url).toContain('sportType=BASKETBALL')
      const h = chamada[1]!.headers as Record<string, string>
      expect(h.Authorization).toBe('Bearer chave')
    }
    expect(String(buscar.mock.calls[1]![0])).toContain('cursor=c2')
  })
})

describe('odds por evento (V2)', () => {
  const EVENTO_COM_MERCADOS = {
    limit: 100,
    nextCursor: null,
    data: [
      {
        id: 'ev1',
        matchState: 'PREMATCH',
        betMarkets: [
          {
            name: 'Player Points',
            betMarketStatus: 'OPEN',
            specifiers: [
              { name: 'player', value: 'Stephen Curry' },
              { name: 'line', value: '24.5' },
            ],
            outcomes: [
              { name: 'Over', formatDecimal: 1.85, probability: 0.51 },
              { name: 'Under', formatDecimal: 1.95, probability: 0.49 },
            ],
          },
          {
            name: 'Moneyline',
            betMarketStatus: 'OPEN',
            specifiers: [],
            outcomes: [{ name: 'Lakers', formatDecimal: 1.5 }],
          },
          {
            name: 'Player Points',
            betMarketStatus: 'SUSPENDED',
            specifiers: [
              { name: 'player', value: 'Jamal Murray' },
              { name: 'line', value: '18.5' },
            ],
            outcomes: [{ name: 'Over', formatDecimal: 2.0 }],
          },
        ],
      },
    ],
  }

  it('traduz o prop com specifiers, ignora probability, descarta o resto CONTADO', async () => {
    const buscar = vi.fn<typeof fetch>(async () => json(EVENTO_COM_MERCADOS))
    const atributoDoMercado = (nome: string) =>
      nome === 'Player Points' ? ('PONTOS' as const) : undefined
    const [casa] = await casasBetmgm(CONFIG, atributoDoMercado, buscar, 'ev1')
    const cotacoes = await casa!.cotacoes('ev1')

    expect(cotacoes).toHaveLength(1)
    expect(cotacoes[0]).toMatchObject({
      jogadorNomeNaCasa: 'Stephen Curry',
      nomeMercadoNaCasa: 'Player Points',
      linha: 25,
      oddOver: 1.85,
      oddUnder: 1.95,
      atributo: 'PONTOS',
    })
    // Moneyline (sem mapa) + mercado SUSPENDED = 2 descartes.
    expect(casa!.descartadas!()).toBe(2)
    // fields=BETMARKETS na URL — sem ele o evento vem sem mercados.
    expect(String(buscar.mock.calls[0]![0])).toContain('fields=BETMARKETS')
  })

  it('linha em specifier com chave alternativa (total/points/handicap) também resolve', async () => {
    const variante = structuredClone(EVENTO_COM_MERCADOS)
    variante.data[0]!.betMarkets[0]!.specifiers = [
      { name: 'player', value: 'Stephen Curry' },
      { name: 'total', value: '24.5' },
    ]
    const buscar = vi.fn<typeof fetch>(async () => json(variante))
    const [casa] = await casasBetmgm(CONFIG, () => 'PONTOS' as const, buscar, 'ev1')
    const cotacoes = await casa!.cotacoes('ev1')
    expect(cotacoes.some((c) => c.linha === 25)).toBe(true)
  })
})
```

- [ ] **Step 2:** rodar → FAIL · **Step 3: Write `betmgm.ts`**

```ts
import { z } from 'zod'

import { linhaDoLadoOver } from './conversao'
import type { ConfigBetmgm } from './fontes'
import type { CasaDeAposta, CotacaoExterna } from './porta'
import type { Atributo } from '../../motor/tipos'

/**
 * Adapter BetMGM Afiliados V2 (migração de 2026).
 *
 * O que o PDF fixa e este adapter honra:
 *  - prefixo `/program/v1/api` + caminhos `/aff/v2/*`;
 *  - `lang`, `brand`, `location` em 100% das chamadas;
 *  - paginação por cursor: envelope { limit, nextCursor, data } e loop até
 *    nextCursor null (máx. 100/página) — média sobre página truncada é o
 *    pior defeito silencioso possível deste produto;
 *  - `matchState` rico: SÓ `PREMATCH` vira cotação (o card é pré-live);
 *    qualquer outro estado é ignorado sem erro;
 *  - `eventName` pode ser nulo: o confronto sai de `participants`;
 *  - odds decimais NUMÉRICAS em `formatDecimal` (sem conversão americana);
 *  - `probability` existe e é IGNORADA: o % do produto é score de confiança.
 *
 * O que o PDF NÃO fixa (e vira config/censo): host, esquema de credencial e
 * a grafia exata dos props de NBA. Ver a spec, seção 8.
 */

const LIMITE_PAGINAS = 50

function url(config: ConfigBetmgm, caminho: string, extras: string): string {
  return (
    `${config.baseUrl}/program/v1/api/aff/v2/${caminho}?lang=${config.lang}` +
    `&brand=${config.brand}&location=${config.location}${extras}`
  )
}

function cabecalhos(config: ConfigBetmgm): Record<string, string> {
  return { [config.authHeader]: `${config.authPrefix}${config.apiKey}`, accept: 'application/json' }
}

const envelope = z.object({
  nextCursor: z.string().nullish(),
  data: z.array(z.unknown()).default([]),
})

/** Loop de cursor do PDF: primeira chamada sem cursor; segue até null. */
async function paginar(
  config: ConfigBetmgm,
  caminho: string,
  extras: string,
  buscar: typeof fetch,
): Promise<unknown[]> {
  const dados: unknown[] = []
  let cursor: string | null | undefined
  for (let pagina = 0; pagina < LIMITE_PAGINAS; pagina++) {
    const comCursor = cursor ? `${extras}&cursor=${encodeURIComponent(cursor)}` : extras
    const resposta = await buscar(url(config, caminho, `${comCursor}&limit=100`), {
      headers: cabecalhos(config),
    })
    if (!resposta.ok) throw new Error(`betmgm ${caminho}: HTTP ${resposta.status}`)
    const corpo = envelope.parse(await resposta.json())
    dados.push(...corpo.data)
    cursor = corpo.nextCursor
    if (!cursor) break
  }
  return dados
}

const eventoSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    matchState: z.string().nullish(),
    eventName: z.string().nullish(),
    participants: z.array(z.object({ name: z.string().nullish() }).passthrough()).default([]),
    startTime: z.string().nullish(),
  })
  .passthrough()

export type EventoBetmgm = {
  idExterno: string
  nomeCasa: string | null
  nomeVisitante: string | null
  inicioIso: string | null
}

export async function eventosDoDiaBetmgm(
  config: ConfigBetmgm,
  _dia: string,
  buscar: typeof fetch = fetch,
): Promise<EventoBetmgm[]> {
  // startTimeOffsetFrom padrão da V2 já cobre 24h; o filtro fino de dia é o
  // vínculo (data de referência) — aqui basta o recorte PREMATCH+basquete.
  const brutos = await paginar(config, 'events', '&sportType=BASKETBALL&matchState=PREMATCH', buscar)
  const eventos: EventoBetmgm[] = []
  for (const bruto of brutos) {
    const e = eventoSchema.safeParse(bruto)
    if (!e.success) continue
    if (e.data.matchState !== 'PREMATCH') continue // só pré-live vira coleta
    const [casa, visitante] = e.data.participants
    eventos.push({
      idExterno: e.data.id,
      nomeCasa: casa?.name ?? null,
      nomeVisitante: visitante?.name ?? null,
      inicioIso: e.data.startTime ?? null,
    })
  }
  return eventos
}

const mercadoSchema = z
  .object({
    name: z.string().nullish(),
    betMarketStatus: z.string().nullish(),
    specifiers: z
      .array(z.object({ name: z.string().nullish(), value: z.union([z.string(), z.number()]).transform(String).nullish() }))
      .default([]),
    outcomes: z
      .array(
        z
          .object({ name: z.string().nullish(), formatDecimal: z.number().nullish() })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough()

const eventoComMercados = eventoSchema.extend({ betMarkets: z.array(z.unknown()).default([]) })

/** Chaves de specifier onde a linha costuma viver — o censo confirma o real. */
const CHAVES_DE_LINHA = ['line', 'total', 'points', 'handicap']
const CHAVES_DE_JOGADOR = ['player', 'participant', 'playername']

function doSpecifier(
  specifiers: { name?: string | null; value?: string | null }[],
  chaves: string[],
): string | null {
  for (const s of specifiers) {
    if (s.name && chaves.includes(s.name.toLowerCase()) && s.value) return s.value
  }
  return null
}

class CasaBetmgm implements CasaDeAposta {
  #descartadas: number
  constructor(
    readonly nome: string,
    private readonly eventoIdExterno: string,
    private readonly itens: CotacaoExterna[],
    descartadas: number,
  ) {
    this.#descartadas = descartadas
  }
  async cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]> {
    if (jogoIdExterno !== this.eventoIdExterno) {
      throw new Error(`betmgm: casa fatiada para o evento ${this.eventoIdExterno}, pedido ${jogoIdExterno}`)
    }
    return this.itens.map((c) => ({ ...c }))
  }
  descartadas(): number {
    return this.#descartadas
  }
}

export async function casasBetmgm(
  config: ConfigBetmgm,
  atributoDoMercado: (nomeMercado: string) => Atributo | undefined,
  buscar: typeof fetch = fetch,
  eventoIdExterno?: string,
): Promise<CasaDeAposta[]> {
  const id = eventoIdExterno!
  const brutos = await paginar(config, 'events', `&ids=${encodeURIComponent(id)}&fields=BETMARKETS`, buscar)

  let descartadas = 0
  const itens: CotacaoExterna[] = []

  for (const bruto of brutos) {
    const e = eventoComMercados.safeParse(bruto)
    if (!e.success || e.data.id !== id) continue

    for (const mercadoBruto of e.data.betMarkets) {
      const m = mercadoSchema.safeParse(mercadoBruto)
      if (!m.success) {
        descartadas += 1
        continue
      }
      if (m.data.betMarketStatus !== 'OPEN') {
        descartadas += 1
        continue
      }

      const nomeMercado = m.data.name ?? ''
      const atributo = atributoDoMercado(nomeMercado)
      const jogador = doSpecifier(m.data.specifiers, CHAVES_DE_JOGADOR)
      const valorLinha = doSpecifier(m.data.specifiers, CHAVES_DE_LINHA)

      if (atributo === undefined || jogador === null || valorLinha === null) {
        descartadas += 1
        continue
      }
      const linha = linhaDoLadoOver(valorLinha.replace(',', '.'))
      if (linha === null) {
        descartadas += 1
        continue
      }

      const over = m.data.outcomes.find((o) => /^over/i.test(o.name ?? ''))
      const under = m.data.outcomes.find((o) => /^under/i.test(o.name ?? ''))
      if (!over || over.formatDecimal == null || !Number.isFinite(over.formatDecimal)) {
        descartadas += 1
        continue
      }
      itens.push({
        jogadorNomeNaCasa: jogador,
        nomeMercadoNaCasa: nomeMercado,
        linha,
        oddOver: over.formatDecimal,
        oddUnder:
          under?.formatDecimal != null && Number.isFinite(under.formatDecimal)
            ? under.formatDecimal
            : null,
      })
    }
  }

  return [new CasaBetmgm('betmgm', id, itens, descartadas)]
}
```

- [ ] **Step 4:** rodar → PASS (3 testes) · **Step 5: Commit** — `Adapter BetMGM V2: cursor, matchState, specifiers e formatDecimal`

---

### Task 5: Vínculo de eventos (data + times normalizados)

**Files:**
- Create: `src/modules/ingestao/odds/vinculo-eventos.ts`
- Test: `src/modules/ingestao/odds/__tests__/vinculo-eventos.test.ts`

**Interfaces:**
- Consumes: `normalizarTexto`; `identidadesJogo`, `jogos`, `times` do schema; `EventoAltenar`/`EventoBetmgm` (mesma forma: `{ idExterno, nomeCasa, nomeVisitante, inicioIso }`).
- Produces: `casarEventos(eventos, jogosDoDia): { pares: { jogoId, idExterno }[]; semPar: number; ambiguos: number }` (PURA); `vincularEventosDoDia(db, provedor, dataReferencia, eventos): Promise<{ vinculados, semPar, ambiguos }>` (grava `identidades_jogo`, idempotente por UNIQUE existente).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'

import { casarEventos } from '../vinculo-eventos'

const JOGOS = [
  {
    jogoId: 'j1',
    nomeCasa: 'Los Angeles Lakers',
    siglaCasa: 'LAL',
    nomeVisitante: 'Boston Celtics',
    siglaVisitante: 'BOS',
  },
  {
    jogoId: 'j2',
    nomeCasa: 'Denver Nuggets',
    siglaCasa: 'DEN',
    nomeVisitante: 'Miami Heat',
    siglaVisitante: 'MIA',
  },
]

describe('casador de eventos (puro)', () => {
  it('casa por nome completo normalizado, indiferente a caixa e acento', () => {
    const r = casarEventos(
      [{ idExterno: 'e1', nomeCasa: 'LOS ANGELES LAKERS', nomeVisitante: 'boston celtics', inicioIso: null }],
      JOGOS,
    )
    expect(r.pares).toEqual([{ jogoId: 'j1', idExterno: 'e1' }])
  })

  it('casa por SIGLA quando a casa abrevia', () => {
    const r = casarEventos(
      [{ idExterno: 'e2', nomeCasa: 'DEN', nomeVisitante: 'MIA', inicioIso: null }],
      JOGOS,
    )
    expect(r.pares).toEqual([{ jogoId: 'j2', idExterno: 'e2' }])
  })

  it('ordem invertida (casa/visitante trocados na casa de aposta) ainda casa', () => {
    const r = casarEventos(
      [{ idExterno: 'e3', nomeCasa: 'Boston Celtics', nomeVisitante: 'Los Angeles Lakers', inicioIso: null }],
      JOGOS,
    )
    expect(r.pares).toEqual([{ jogoId: 'j1', idExterno: 'e3' }])
  })

  it('sem par ou ambíguo NÃO vincula — conta', () => {
    const doisIguais = [...JOGOS, { ...JOGOS[0]!, jogoId: 'j9' }]
    const r = casarEventos(
      [
        { idExterno: 'e4', nomeCasa: 'Time Fantasma', nomeVisitante: 'Outro', inicioIso: null },
        { idExterno: 'e5', nomeCasa: 'Los Angeles Lakers', nomeVisitante: 'Boston Celtics', inicioIso: null },
        { idExterno: 'e6', nomeCasa: null, nomeVisitante: null, inicioIso: null },
      ],
      doisIguais,
    )
    expect(r.pares).toEqual([])
    expect(r.semPar).toBe(2) // e4 e e6
    expect(r.ambiguos).toBe(1) // e5 casa com j1 E j9
  })
})
```

- [ ] **Step 2:** rodar → FAIL · **Step 3: Write `vinculo-eventos.ts`**

```ts
import { and, eq } from 'drizzle-orm'

import { identidadesJogo, jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { normalizarTexto } from '../../dominio/texto'

/**
 * EVENTO DA CASA ↔ JOGO NOSSO, por (data de referência + os dois times).
 *
 * BetMGM e Altenar não compartilham ids com o provedor NBA; o único terreno
 * comum é o confronto do dia. O casamento aceita nome completo OU sigla,
 * normalizado, nas duas ordens (tem casa que inverte mando). Ambiguidade não
 * vincula — vira contagem no resultado do job, nunca palpite.
 */

export type EventoDaCasa = {
  idExterno: string
  nomeCasa: string | null
  nomeVisitante: string | null
  inicioIso: string | null
}

export type JogoParaCasar = {
  jogoId: string
  nomeCasa: string
  siglaCasa: string
  nomeVisitante: string
  siglaVisitante: string
}

function chavesDoLado(nome: string, sigla: string): string[] {
  return [normalizarTexto(nome), normalizarTexto(sigla)]
}

export function casarEventos(
  eventos: EventoDaCasa[],
  jogosDoDia: JogoParaCasar[],
): { pares: { jogoId: string; idExterno: string }[]; semPar: number; ambiguos: number } {
  // Índice: para cada jogo, o conjunto de pares (ladoA, ladoB) aceitos.
  const indice = jogosDoDia.map((j) => ({
    jogoId: j.jogoId,
    ladoCasa: new Set(chavesDoLado(j.nomeCasa, j.siglaCasa)),
    ladoVisitante: new Set(chavesDoLado(j.nomeVisitante, j.siglaVisitante)),
  }))

  const pares: { jogoId: string; idExterno: string }[] = []
  let semPar = 0
  let ambiguos = 0

  for (const e of eventos) {
    if (!e.nomeCasa || !e.nomeVisitante) {
      semPar += 1
      continue
    }
    const a = normalizarTexto(e.nomeCasa)
    const b = normalizarTexto(e.nomeVisitante)
    const candidatos = indice.filter(
      (j) =>
        (j.ladoCasa.has(a) && j.ladoVisitante.has(b)) ||
        (j.ladoCasa.has(b) && j.ladoVisitante.has(a)),
    )
    if (candidatos.length === 1) pares.push({ jogoId: candidatos[0]!.jogoId, idExterno: e.idExterno })
    else if (candidatos.length === 0) semPar += 1
    else ambiguos += 1
  }
  return { pares, semPar, ambiguos }
}

/** Busca os jogos do dia com nomes/siglas e grava os vínculos que casaram. */
export async function vincularEventosDoDia(
  db: Db,
  provedor: string,
  dataReferencia: string,
  eventos: EventoDaCasa[],
): Promise<{ vinculados: number; semPar: number; ambiguos: number }> {
  const casa = db.$with // (sem CTE — duas leituras simples)
  void casa
  const doDia = await db.select().from(jogos).where(eq(jogos.dataReferencia, dataReferencia))
  const listaTimes = await db.select().from(times)
  const porId = new Map(listaTimes.map((t) => [t.id, t] as const))

  const paraCasar = doDia
    .map((j) => {
      const c = porId.get(j.timeCasaId)
      const v = porId.get(j.timeVisitanteId)
      if (!c || !v) return null
      return {
        jogoId: j.id,
        nomeCasa: c.nome,
        siglaCasa: c.sigla,
        nomeVisitante: v.nome,
        siglaVisitante: v.sigla,
      }
    })
    .filter((j): j is NonNullable<typeof j> => j !== null)

  const { pares, semPar, ambiguos } = casarEventos(eventos, paraCasar)
  let vinculados = 0
  for (const par of pares) {
    await db
      .insert(identidadesJogo)
      .values({ jogoId: par.jogoId, provedor, idExterno: par.idExterno })
      .onConflictDoNothing()
    vinculados += 1
  }
  return { vinculados, semPar, ambiguos }
}
```

(Conferir na implementação o UNIQUE real de `identidades_jogo` e usar o target
correspondente; se a coluna de provedor tiver enum, acrescentar
`'betmgm' | 'altenar'` na migração da Task 1.)

- [ ] **Step 4:** rodar → PASS (4 testes) · **Step 5: Commit** — `Vínculo de eventos por confronto do dia, sem palpite em ambiguidade`

---

### Task 6: `coletarOdds` resolve jogador por nome (mantendo o caminho por id)

**Files:**
- Modify: `src/modules/ingestao/odds/coletar.ts`
- Test: `src/modules/ingestao/odds/__tests__/coletar-por-nome.test.ts`

**Interfaces:**
- Consumes: `vinculosConfirmados` (Task 1).
- Produces: `coletarOdds` inalterado na assinatura; a resolução interna de `coletarJogo` passa a ser: `c.jogadorIdExternoProvedor` → `identidades_jogador` (como hoje); senão → `vinculosConfirmados(db, casaId)` por `jogadorNomeNaCasa`; senão `semVinculo++`.

- [ ] **Step 1: Write the failing test** — PGlite com: 1 jogo + `identidades_jogo` do provedor `'altenar'`; 1 jogador canônico; `mapa_jogadores_casa` com vínculo confirmado para `'Stephen Curry'` e um pendente para `'Fulano'`; uma `CasaDeAposta` fake devolvendo 2 cotações SEM `jogadorIdExternoProvedor` (uma de cada nome). Asserções: `resultado.cotacoes === 1`, `resultado.semVinculo === 1`, snapshot e agregada gravados para o Curry com `origem: 'CASAS'` respeitando `casas_minimas` do ruleset de teste (usar ruleset com `casas_minimas: 1`).

```ts
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import {
  casas as tabelaCasas,
  identidadesJogo,
  jogadores,
  jogos,
  mapaJogadoresCasa,
  oddsAgregada,
  times,
} from '../../../dominio/db/schema'
import { carregarRuleset } from '../../../motor/ruleset/carregar'
import { coletarOdds } from '../coletar'
import type { CasaDeAposta } from '../porta'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [lal] = await banco.db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [bos] = await banco.db.insert(times).values({ sigla: 'BOS', nome: 'Celtics' }).returning()
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date('2026-08-28T23:00:00Z'),
      dataReferencia: '2026-08-28',
      timeCasaId: lal!.id,
      timeVisitanteId: bos!.id,
    })
    .returning()
  jogoId = jogo!.id
  await banco.db
    .insert(identidadesJogo)
    .values({ jogoId, provedor: 'altenar', idExterno: 'ev1' })
  const [curry] = await banco.db.insert(jogadores).values({ nomeCompleto: 'Stephen Curry' }).returning()
  const [casa] = await banco.db.insert(tabelaCasas).values({ nome: 'altenar', tipoApi: 'altenar' }).returning()
  await banco.db.insert(mapaJogadoresCasa).values([
    { casaId: casa!.id, nomeNaCasa: 'Stephen Curry', jogadorId: curry!.id, confirmado: true },
    { casaId: casa!.id, nomeNaCasa: 'Fulano', jogadorId: null, confirmado: false },
  ])
}, 120_000)
afterAll(async () => banco.fechar())

describe('coleta com resolução por NOME (casas sem id de provedor)', () => {
  it('confirmado agrega; pendente conta como semVinculo; nada silencioso', async () => {
    const casaFake: CasaDeAposta = {
      nome: 'altenar',
      async cotacoes() {
        return [
          { jogadorNomeNaCasa: 'Stephen Curry', nomeMercadoNaCasa: 'Total de Pontos', linha: 25, oddOver: 1.85, oddUnder: 1.95, atributo: 'PONTOS' },
          { jogadorNomeNaCasa: 'Fulano', nomeMercadoNaCasa: 'Total de Pontos', linha: 10, oddOver: 1.5, oddUnder: null, atributo: 'PONTOS' },
        ]
      },
    }
    const rulesetTeste = { ...ruleset, odds: { ...ruleset.odds, casas_minimas: 1 } }
    const r = await coletarOdds(
      banco.db,
      async () => [casaFake],
      'altenar',
      '2026-08-28',
      new Date('2026-08-28T12:00:00Z'),
      rulesetTeste,
    )
    expect(r.cotacoes).toBe(1)
    expect(r.semVinculo).toBe(1)
    expect(r.agregadas).toBe(1)
    const agregadas = await banco.db.select().from(oddsAgregada)
    expect(agregadas).toHaveLength(1)
    expect(agregadas[0]!.origem).toBe('CASAS')
  })
})
```

- [ ] **Step 2:** rodar → FAIL (o Fulano e o Curry caem juntos em `semVinculo`, `cotacoes === 0`)
- [ ] **Step 3: Modify `coletar.ts`** — em `coletarJogo`, após `resolverCasa(casa.nome)`, carregar uma vez por casa `const porNome = await vinculosConfirmados(db, casaId)` e trocar a resolução:

```ts
      const jogadorId = c.jogadorIdExternoProvedor
        ? jogadorPorIdExterno.get(c.jogadorIdExternoProvedor)
        : porNome.get(c.jogadorNomeNaCasa)
```

com o comentário: caminho por id é do provedor NBA (balldontlie); caminho por
nome é das casas de mercado, e SÓ vínculo confirmado resolve — pendente é
`semVinculo`, visível no resultado do job.

- [ ] **Step 4:** rodar o teste novo E `npx vitest run src/modules/ingestao/__tests__/odds.test.ts` (regressão do caminho balldontlie) → PASS
- [ ] **Step 5: Commit** — `coletarOdds resolve jogador por nome confirmado, sem tocar o caminho por id`

---

### Task 7: Censo (`odds:censo`) e runbook das casas

**Files:**
- Create: `scripts/odds-censo.ts` · Create: `docs/runbooks/casas-de-aposta.md`
- Modify: `package.json` (script `"odds:censo": "vite-node scripts/odds-censo.ts"`)

**Interfaces:**
- Consumes: `fontesDeOdds`, adapters, `eventosDoDia*`.

- [ ] **Step 1: Write `scripts/odds-censo.ts`** (somente leitura; sem teste automatizado — é ferramenta de operação; a lógica que importa já está testada nos adapters)

```ts
import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { autenticarAltenar, casasAltenar, eventosDoDiaAltenar } from '../src/modules/ingestao/odds/altenar'
import { casasBetmgm, eventosDoDiaBetmgm } from '../src/modules/ingestao/odds/betmgm'
import { fontesDeOdds } from '../src/modules/ingestao/odds/fontes'

/**
 * CENSO de mercados e jogadores de uma fonte — o passo entre "conta criada"
 * e "média no card". Imprime o que a casa oferece HOJE, com contagens, para
 * alimentar a curadoria de mapa_mercados e mapa_jogadores_casa. Somente
 * leitura: não grava nada, não liga nada.
 *
 *   npx dotenv -e .env.local -- npm run odds:censo -- --fonte=altenar
 */
async function principal() {
  const alvo = process.argv.find((a) => a.startsWith('--fonte='))?.slice(8)
  if (!alvo) throw new Error('use --fonte=betmgm|altenar')
  const fonte = fontesDeOdds().find((f) => f.nome === alvo)
  if (!fonte) throw new Error(`fonte ${alvo} sem config completa no ambiente`)

  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  console.log(`Censo da fonte ${fonte.nome} para ${hoje}\n`)

  const mercados = new Map<string, number>()
  const jogadores = new Map<string, number>()
  const contar = (mapa: Map<string, number>, chave: string) =>
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1)

  if (fonte.nome === 'altenar') {
    const token = await autenticarAltenar(fonte.config)
    const eventos = await eventosDoDiaAltenar(fonte.config, token, hoje)
    console.log(`${eventos.length} evento(s) no dia`)
    for (const e of eventos) {
      // Sem mapa: tudo cai em descartadas, mas os NOMES aparecem via censo
      // bruto — o adapter devolve nomeMercadoNaCasa nas cotações mapeadas;
      // para o censo, mapeia-se TUDO como PONTOS de mentira, só para listar.
      const [casa] = await casasAltenar(fonte.config, token, () => 'PONTOS', undefined, e.idExterno)
      for (const c of await casa!.cotacoes(e.idExterno)) {
        contar(mercados, c.nomeMercadoNaCasa)
        contar(jogadores, c.jogadorNomeNaCasa)
      }
      console.log(`  evento ${e.idExterno}: descartadas=${casa!.descartadas!()}`)
    }
  } else {
    const eventos = await eventosDoDiaBetmgm(fonte.config, hoje)
    console.log(`${eventos.length} evento(s) PREMATCH`)
    for (const e of eventos) {
      const [casa] = await casasBetmgm(fonte.config, () => 'PONTOS', undefined, e.idExterno)
      for (const c of await casa!.cotacoes(e.idExterno)) {
        contar(mercados, c.nomeMercadoNaCasa)
        contar(jogadores, c.jogadorNomeNaCasa)
      }
      console.log(`  evento ${e.idExterno}: descartadas=${casa!.descartadas!()}`)
    }
  }

  const topo = (mapa: Map<string, number>) =>
    [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
  console.log('\n== Mercados ==')
  for (const [nome, n] of topo(mercados)) console.log(`${String(n).padStart(4)}  ${nome}`)
  console.log('\n== Jogadores ==')
  for (const [nome, n] of topo(jogadores)) console.log(`${String(n).padStart(4)}  ${nome}`)
  console.log('\nPróximo passo: confirmar mapa_mercados e mapa_jogadores_casa (runbook).')
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
```

- [ ] **Step 2: Write `docs/runbooks/casas-de-aposta.md`** — o dia da conta, por fonte: (1) preencher envs (tabela da spec, seção 5); (2) `npm run odds:censo -- --fonte=X` e ler mercados/jogadores; (3) confirmar `mapa_mercados` (atributo por nome de mercado) e revisar pendências de `mapa_jogadores_casa`; (4) rodar a coleta manual uma vez e conferir `odds_agregada.qtd_casas`; (5) só então considerar a fonte "no ar" — o cron passa a coletá-la sozinho. Incluir a REGRA de chave: env e painel, nunca arquivo commitado (mesmo texto de openrouter-e-push.md).
- [ ] **Step 3:** `npx tsc --noEmit` limpo · **Step 4: Commit** — `Censo de mercados/jogadores por fonte + runbook do dia da conta`

---

### Task 8: Fiação no cron `sincronizar-rodada`

**Files:**
- Modify: `src/app/api/cron/sincronizar-rodada/route.ts`
- Test: `src/modules/ingestao/odds/__tests__/coleta-do-dia.test.ts`
- Create: `src/modules/ingestao/odds/coleta-do-dia.ts`

**Interfaces:**
- Produces: `coletarOddsDoDia(db, ruleset, dataReferencia, agora, fontes, transportes): Promise<Record<string, ResultadoColeta & { vinculados: number; semPar: number; ambiguos: number }>>` — para cada fonte ativa: eventos do dia → `vincularEventosDoDia` → `semearVinculosDeJogador` (nomes vistos) → `coletarOdds` com a fábrica da fonte. `transportes` injeta `buscar` por fonte (teste passa fakes; rota passa `fetch`).
- A rota chama `coletarOddsDoDia(..., fontesDeOdds(), { buscar: fetch })` após a sincronização e anexa o resultado à resposta JSON. Fonte com erro NÃO derruba o cron: try/catch por fonte, erro vira `{ erro: mensagem }` no resultado.

- [ ] **Step 1: teste** — PGlite: semear 1 jogo do dia + jogador; fake de fonte altenar (transportes com fixtures das Tasks 3); asserção: resultado da fonte tem `vinculados: 1`, `agregadas >= 1`; uma segunda fonte cujo transporte lança tem `{ erro }` e NÃO impede a primeira.
- [ ] **Step 2:** implementar `coleta-do-dia.ts` (orquestração fina: zero regra nova — só liga as peças das Tasks 1–6 na ordem, com try/catch por fonte e o mapa de mercados confirmado lido de `mapa_mercados` por casa).
- [ ] **Step 3:** ligar na rota do cron; `npx vitest run` inteira + `npm run boundaries` + build.
- [ ] **Step 4: Commit** — `Coleta diária de odds por fonte ativa, sem derrubar o cron`

---

### Task 9: Mercado Pago na mesma barra (runbook + `mp:conferir`)

**Files:**
- Create: `scripts/mp-conferir.ts` · Create: `docs/runbooks/mercadopago.md`
- Modify: `package.json` (`"mp:conferir": "dotenv -e .env.local -- vite-node scripts/mp-conferir.ts"`)

- [ ] **Step 1: Write `scripts/mp-conferir.ts`** — valida credenciais SEM ligar nada:

```ts
import { configDoAmbiente } from '../src/modules/plataforma/assinatura/mercadopago'

/**
 * CONFERE as credenciais do Mercado Pago sem ligar nada — o espelho do
 * odds:censo para cobrança. Chama a API real com o token do ambiente e
 * imprime o que encontrou. Não cria assinatura, não liga flag, não escreve.
 */
async function principal() {
  const config = configDoAmbiente()
  if (!config) {
    console.log('MERCADOPAGO_ACCESS_TOKEN/WEBHOOK_SECRET ausentes — nada a conferir.')
    console.log('Preencha o .env.local (sandbox) e rode de novo.')
    process.exitCode = 1
    return
  }
  console.log(`sandbox: ${config.sandbox}`)
  // GET /users/me: valida o token e mostra a conta, sem efeito colateral.
  const resposta = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  })
  if (!resposta.ok) {
    console.error(`token REPROVADO: HTTP ${resposta.status}`)
    process.exitCode = 1
    return
  }
  const eu = (await resposta.json()) as { id?: number; nickname?: string; site_id?: string }
  console.log(`token OK — conta ${eu.nickname ?? eu.id} (${eu.site_id ?? '?'})`)
  console.log('\nPróximo passo: runbook docs/runbooks/mercadopago.md (ciclo sandbox completo).')
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
```

(Conferir na implementação o shape real de `ConfigMercadoPago` — o campo é
`accessToken`; ajustar se divergir.)

- [ ] **Step 2: Write `docs/runbooks/mercadopago.md`** — dia da virada: (1) criar aplicação no painel MP, credenciais de TESTE; (2) preencher envs no `.env.local` e na Vercel com `MERCADOPAGO_CHECKOUT_ENABLED=false` e `MERCADOPAGO_SANDBOX=true`; (3) `npm run mp:conferir`; (4) registrar o webhook (`/api/webhook/mercadopago`) no painel com o secret; (5) ciclo completo no sandbox: `CADASTRO_PUBLICO_HABILITADO=true` em preview → conta → `CHECKOUT_ENABLED=true` → assinar com cartão de teste → conferir `direitos_acesso` + reconciliação; (6) a virada real: trocar credenciais para produção, `SANDBOX=false`, e SÓ então as flags em produção; (7) desligamento de emergência = `CHECKOUT_ENABLED=false` (quem já pagou continua com direito — a reconciliação cuida). Regra de chave idêntica à dos outros runbooks.
- [ ] **Step 3:** `npx tsc --noEmit` · **Step 4: Commit** — `Mercado Pago na barra "só configurar": mp:conferir + runbook da virada`

---

## Self-review

**Cobertura da spec:** §4 adapters → Tasks 3–4 · §4 vínculo evento → Task 5 · §4 vínculo jogador + tabela → Task 1 · §4 pipeline única → Task 6 · §5 config → Task 2 · §6 censo → Task 7 · §7 fiação → Task 8 · §9 Mercado Pago → Task 9. §8 (desconhecidos) permeia os adapters como descarte contado + censo.

**Consistências:** `EventoAltenar`/`EventoBetmgm` compartilham a forma `EventoDaCasa` que a Task 5 consome; `atributoDoMercado` injetado nos dois adapters é o mesmo contrato que a Task 8 monta de `mapa_mercados`; `vinculosConfirmados` (Task 1) é o que a Task 6 usa; nomes de env da Task 2 = tabela da spec §5.

**Avisos ao executor:** (1) os shapes das APIs vêm de documentação, não de chamadas reais — onde a resposta real divergir da fixture, ajustar o SCHEMA ZOD e a fixture juntos e registrar no relatório, nunca afrouxar o teste; (2) conferir o UNIQUE real de `identidades_jogo` antes do `onConflictDoNothing` da Task 5; (3) se `casas.tipoApi` tiver enum no schema, acrescentar `betmgm`/`altenar` na migração da Task 1.
