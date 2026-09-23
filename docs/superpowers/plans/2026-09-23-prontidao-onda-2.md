# Prontidão — Onda 2 (até 03/11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deixar a temporada ao vivo (NBA volta ~03/11) aguentando 2 mil simultâneos: Lista servida de cache, push entregue dentro da validade, Fire Live que sobrevive a soluço do provedor, odds presentes no card e alguém avisado quando algo quebra.

**Architecture:** cada item da §4 da spec vira uma tarefa com teste que falha antes. O cache mora em `src/app/**` (a regra de fronteira proíbe `next/cache` em `modules/entrega`); o motor e o ruleset não mudam. A lógica testável sai do workflow e dos route handlers para módulos com PGlite; o workflow e as rotas ficam finos.

**Tech Stack:** Next.js 16.3.6 (App Router, `unstable_cache`, `revalidateTag(tag, 'max')`), Drizzle + PGlite nos testes, Vitest, `@vercel/queue` 0.4.0 (`send` com `delaySeconds`), Vercel Workflow (`workflow` 4.8.4 → 4.8.9).

**Spec:** [`docs/superpowers/specs/2026-09-23-prontidao-lancamento-2k-design.md`](../specs/2026-09-23-prontidao-lancamento-2k-design.md) — §4 (Onda 2) e §8 (minors da revisão final). Base: branch `prontidao-lancamento-2k`, commit `f7c8093` (Onda 1, ainda não mesclada).

## Global Constraints

- Motor (`src/modules/motor/**`) e `config/ruleset.v1.yaml` **não mudam** (D5). Nenhuma regra de estratégia nova.
- `modules/entrega` **não importa `next/cache`** (dependency-cruiser; ver `src/app/api/chat/ranking.ts:20-21`). Wrapper de cache mora em `src/app/**`.
- Toda chamada `revalidateTag(...)` termina em `, 'max'` (trava de `src/app/(app)/lateral/__tests__/cache-forma.test.ts:47-66`). `{ expire: 0 }` é proibido.
- Páginas pagas continuam **sem `'use cache'`** (`src/app/__tests__/paywall.test.ts:125`); a leitura do feed acontece **depois** do portão de nível, como hoje.
- `revalidateTag` só dentro de Route Handler / Server Action (fora disso lança `Invariant: static generation store missing`). Nunca em `modules/` nem em scripts `vite-node`.
- Fire Live é só 1º quarto. `apitos` mantém a UNIQUE de idempotência; nenhum retry pode depender de "não reenviar" por memória.
- Vocabulário: domínio em português (`batimento`, `faixa`, `recusada`), infraestrutura em inglês.
- **Um commit no fim** (preferência registrada do parceiro), numa branch nova `prontidao-onda-2` criada a partir de `prontidao-lancamento-2k`. Sem push, sem merge.
- `src/app/(app)/apito/[jogadorId]/page.tsx` tem um `%` não commitado de outra entrega: a Tarefa 1 edita esse arquivo, então o commit final **deve** separar as duas mudanças (ver Tarefa 13).
- Suíte completa só em lotes de 12 arquivos (o swap do macOS enche o disco).

## Review Focus

1. **Feed publicado entre um `null` em cache e a primeira visita** — quem abre a Lista logo após a publicação tem de ver a lista, não "Próxima lista às…". Teste: Tarefa 1, "null em cache nunca é confiado".
2. **`geradoEm` atravessando o cache** — `unstable_cache` serializa em JSON; `Date` volta string e `dataHora()` quebra. Teste: Tarefa 1, "geradoEm volta como Date".
3. **Retry agendado para depois da validade** — um apito de 5 min não pode ser reenviado aos 6 min. Teste: Tarefa 3, "retry que passaria da validade conta como expirado".
4. **Lote de uma inscrição só com 403** — não pode derrubar o canal inteiro nem ficar em retry global. Teste: Tarefa 3, "403 isolado num lote de 1 invalida só ela".
5. **Run antigo do Fire Live ainda vivo depois da retomada** — dois runs no mesmo jogo não podem ciclar juntos. Teste: Tarefa 6, "run que perdeu o lease para no próximo passo".

---

## Pré-voo

- [ ] **Branch:** `git switch -c prontidao-onda-2` a partir de `prontidao-lancamento-2k` (HEAD `f7c8093`). Conferir `git log origin/main -1` = `390dfe2`; se a main andou, parar e avisar o parceiro.
- [ ] **Ledger:** `.superpowers/sdd/2026-09-23-prontidao-onda-2/progress.md`.

---

### Task 1: Lista servida de cache (W2-1)

**Files:**
- Create: `src/app/(app)/feed-cacheado.ts`
- Create: `src/app/(app)/__tests__/feed-cacheado.test.ts`
- Create: `src/app/api/cron/__tests__/invalidacao-feed.test.ts`
- Modify: `src/modules/entrega/lista-secreta.ts` (extrair `recorteDoJogador` de `linhasDoJogador`, l.378-400)
- Modify: `src/app/(app)/page.tsx:317`, `src/app/(app)/fire-live/page.tsx:314-321`, `src/app/(app)/resultados/[data]/page.tsx:312`, `src/app/(app)/apito/[jogadorId]/page.tsx:229,254`
- Modify: `src/app/api/cron/lista-secreta/route.ts`, `src/app/api/cron/demo/route.ts`

**Interfaces:**
- Produces: `lerFeedCacheado(dataReferencia: string): Promise<{ conteudo: ConteudoFeed; geradoEm: Date } | null>`; `TAG_FEED = 'feed'`; `tagDoFeed(data: string): string`; `recorteDoJogador(feed: { conteudo: ConteudoFeed; geradoEm: Date } | null, jogadorId: string, atributo?: Atributo): LinhasDoJogador`.
- Consumes: `lerFeed(db, data)` (`lista-secreta.ts:463`).

**Meta revista (achado do mapeamento):** a Lista faz 17 consultas por visualização (19 com a lente HIERARQUIA). O cache do feed tira 5 (`feed_snapshot` + 4 de identidade) → **12**. As outras 10 são por usuário (sessão, acesso, preferências, experiência) e continuam dinâmicas; `jogosDoDiaResumo` muda a cada minuto no ao vivo. A meta "~6" da §4 não é alcançável só com W2-1 — registrar na §8 da spec (Tarefa 13).

- [ ] **Step 1: Teste do wrapper (falha: arquivo não existe)**

```ts
// src/app/(app)/__tests__/feed-cacheado.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `unstable_cache` falso com a semântica que importa: guarda por chave,
 * e o valor atravessa JSON — como o de verdade (unstable-cache.js:24,182).
 */
const loja = new Map<string, unknown>()
const registros: { chaves: string[]; tags: string[] }[] = []
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, chaves: string[], opcoes: { tags: string[] }) =>
    async () => {
      registros.push({ chaves, tags: opcoes.tags })
      const k = JSON.stringify(chaves)
      if (!loja.has(k)) loja.set(k, JSON.parse(JSON.stringify(await fn())))
      return loja.get(k)
    },
}))

const lerFeed = vi.fn()
vi.mock('@/modules/entrega/lista-secreta', () => ({ lerFeed: (...a: unknown[]) => lerFeed(...a) }))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))

import { lerFeedCacheado, TAG_FEED, tagDoFeed } from '../feed-cacheado'

const FEED = {
  conteudo: { dataReferencia: '2026-11-03', geradoEm: '2026-11-03T22:00:00.000Z', rulesetVersao: 'v1', itens: [] },
  geradoEm: new Date('2026-11-03T22:00:00.000Z'),
}

beforeEach(() => {
  loja.clear()
  registros.length = 0
  lerFeed.mockReset()
})

describe('lerFeedCacheado', () => {
  it('geradoEm volta como Date, mesmo depois de atravessar o JSON do cache', async () => {
    lerFeed.mockResolvedValue(FEED)
    await lerFeedCacheado('2026-11-03')
    const segunda = await lerFeedCacheado('2026-11-03')
    expect(segunda?.geradoEm).toBeInstanceOf(Date)
    expect(segunda?.geradoEm.toISOString()).toBe('2026-11-03T22:00:00.000Z')
  })

  it('a segunda leitura do mesmo dia não vai ao banco', async () => {
    lerFeed.mockResolvedValue(FEED)
    await lerFeedCacheado('2026-11-03')
    await lerFeedCacheado('2026-11-03')
    expect(lerFeed).toHaveBeenCalledTimes(1)
  })

  it('null em cache nunca é confiado: relê direto, e vê a lista recém-publicada', async () => {
    lerFeed.mockResolvedValueOnce(null).mockResolvedValueOnce(FEED)
    expect(await lerFeedCacheado('2026-11-03')).toBeNull()
    const depois = await lerFeedCacheado('2026-11-03')
    expect(depois?.conteudo.dataReferencia).toBe('2026-11-03')
  })

  it('a data entra na chave e na tag; a tag geral cobre todas as datas', async () => {
    lerFeed.mockResolvedValue(FEED)
    await lerFeedCacheado('2026-11-03')
    expect(registros[0]).toEqual({ chaves: ['feed', '2026-11-03'], tags: [TAG_FEED, tagDoFeed('2026-11-03')] })
    expect(tagDoFeed('2026-11-03')).toBe('feed-2026-11-03')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(app)/__tests__/feed-cacheado.test.ts"`
Expected: FAIL — `Failed to resolve import "../feed-cacheado"`.

- [ ] **Step 3: Implementar o wrapper**

```ts
// src/app/(app)/feed-cacheado.ts
import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { lerFeed } from '@/modules/entrega/lista-secreta'
import type { ConteudoFeed } from '@/modules/entrega/tipos-feed'

/**
 * A LISTA DO DIA, LIDA UMA VEZ — não uma vez por visita.
 *
 * O feed é o mesmo para todo assinante da data; o que muda por pessoa (nível,
 * preferências, acompanhados) continua dinâmico na página. Por isso o cache
 * guarda só o snapshot, e a página continua sem `'use cache'`: quem chama
 * esta função já passou pelo portão de nível (paywall.test.ts).
 *
 * Duas tags: `feed-<data>` para quem publica um dia, `feed` para quem
 * publica vários (a demo). A tag por data obriga a construir o wrapper por
 * chamada — `unstable_cache` fixa as tags na construção.
 *
 * `null` NUNCA é confiado. `revalidateTag(…, 'max')` serve o valor velho uma
 * vez; se o velho fosse "ainda não publicado", o primeiro assinante depois
 * da publicação veria "Próxima lista às…". Antes da publicação cada visita
 * paga uma consulta — barata, e só nessa janela.
 *
 * `revalidate: 600`: nome e foto são apresentação atual (ver
 * `comIdentidadeAtual`) e mudam sem republicar; dez minutos é o atraso
 * aceito para eles.
 */
export const TAG_FEED = 'feed'
export const tagDoFeed = (dataReferencia: string) => `feed-${dataReferencia}`

type FeedLido = { conteudo: ConteudoFeed; geradoEm: Date }

export async function lerFeedCacheado(dataReferencia: string): Promise<FeedLido | null> {
  const emCache = await unstable_cache(
    async () => {
      const feed = await lerFeed(getDb(), dataReferencia)
      return feed && { conteudo: feed.conteudo, geradoEmIso: feed.geradoEm.toISOString() }
    },
    ['feed', dataReferencia],
    { tags: [TAG_FEED, tagDoFeed(dataReferencia)], revalidate: 600 },
  )()
  if (emCache === null) return lerFeed(getDb(), dataReferencia)
  return { conteudo: emCache.conteudo, geradoEm: new Date(emCache.geradoEmIso) }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "src/app/(app)/__tests__/feed-cacheado.test.ts"` → 4 passed.

- [ ] **Step 5: Recorte puro do jogador**

Em `src/modules/entrega/lista-secreta.ts`, trocar o corpo de `linhasDoJogador` (l.378-400) por:

```ts
export async function linhasDoJogador(
  db: Db,
  dataReferencia: string,
  jogadorId: string,
  atributo?: Atributo,
): Promise<LinhasDoJogador> {
  return recorteDoJogador(await lerFeed(db, dataReferencia), jogadorId, atributo)
}

/**
 * O recorte do apito sobre um feed JÁ LIDO — puro, para a página filtrar o
 * feed em cache sem ir ao banco (W2-1).
 */
export function recorteDoJogador(
  feed: { conteudo: ConteudoFeed; geradoEm: Date } | null,
  jogadorId: string,
  atributo?: Atributo,
): LinhasDoJogador {
  if (feed === null) return { itens: [], geradoEm: null }

  const doJogador = feed.conteudo.itens.filter((i) => i.jogadorId === jogadorId)

  // Sem atributo pedido, mostra o do primeiro apito em vez de misturar linhas
  // de pontos com linhas de rebotes na mesma coluna — 25 e 8 lado a lado não
  // significam nada juntos.
  const escolhido = atributo ?? doJogador[0]?.atributo

  const itens = doJogador
    .filter((i) => i.atributo === escolhido)
    .sort((a, b) => (a.linha ?? 0) - (b.linha ?? 0))

  return { itens, geradoEm: feed.geradoEm }
}
```

- [ ] **Step 6: Teste de fonte das telas + invalidação (falha)**

```ts
// src/app/api/cron/__tests__/invalidacao-feed.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const ler = (p: string) => semComentarios(readFileSync(p, 'utf8'))

function rotas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : rotas(p)
    return n === 'route.ts' ? [p] : []
  })
}

describe('o feed em cache é invalidado por quem publica', () => {
  it('toda rota de cron que publica a Lista invalida a tag do feed', () => {
    const publicam = rotas('src/app/api/cron').filter((p) =>
      /publicarListaSecreta|simularAte/.test(ler(p)),
    )
    expect(publicam.length).toBeGreaterThanOrEqual(2)
    for (const p of publicam) {
      expect(ler(p), p).toMatch(/revalidateTag\((TAG_FEED|tagDoFeed\([^)]*\)), 'max'\)/)
    }
  })

  it('as telas leem o feed pelo cache, nunca por lerFeed/linhasDoJogador direto', () => {
    for (const p of [
      'src/app/(app)/page.tsx',
      'src/app/(app)/fire-live/page.tsx',
      'src/app/(app)/resultados/[data]/page.tsx',
      'src/app/(app)/apito/[jogadorId]/page.tsx',
    ]) {
      const fonte = ler(p)
      expect(fonte, p).toContain('lerFeedCacheado(')
      expect(fonte, p).not.toMatch(/[^a-zA-Z]lerFeed\(/)
      expect(fonte, p).not.toMatch(/[^a-zA-Z]linhasDoJogador\(/)
    }
  })
})
```

Run: `npx vitest run src/app/api/cron/__tests__/invalidacao-feed.test.ts` → FAIL nos dois.

- [ ] **Step 7: Telas usam o cache**

- `src/app/(app)/page.tsx:317`: `const feed = await lerFeed(getDb(), hoje)` → `const feed = await lerFeedCacheado(hoje)`; importar `import { lerFeedCacheado } from './feed-cacheado'`; remover `lerFeed` do import de `@/modules/entrega/lista-secreta` se ficar sem uso.
- `src/app/(app)/fire-live/page.tsx:314-321`: no `Promise.all`, `lerFeed(getDb(), hoje)` → `lerFeedCacheado(hoje)`; import `from '../feed-cacheado'`.
- `src/app/(app)/resultados/[data]/page.tsx:312`: `lerFeed(getDb(), data)` → `lerFeedCacheado(data)`; import `from '../../feed-cacheado'`.
- `src/app/(app)/apito/[jogadorId]/page.tsx`: l.229 `linhasDoJogador(getDb(), hoje, jogadorId, atributo)` → `recorteDoJogador(await lerFeedCacheado(hoje), jogadorId, atributo)`; l.254 idem com `rodada`. Imports: `recorteDoJogador` de `@/modules/entrega/lista-secreta`, `lerFeedCacheado` de `../../feed-cacheado`. **Não tocar a linha do `%`** (o diff não commitado de outra entrega, 1 linha).

Os testes de tela mockam `next/cache` com `unstable_cache: (fn) => fn`. Com o wrapper construído por chamada, `unstable_cache(fn, …)()` chama `fn()` sem argumentos — por isso a data está na closure. Se algum teste de tela quebrar por falta do mock de `next/cache`, acrescentar o mesmo bloco que `src/app/__tests__/telas-04-lista.test.ts:47` usa.

- [ ] **Step 8: Crons invalidam**

`src/app/api/cron/lista-secreta/route.ts`, depois de `publicarListaSecreta(...)`:

```ts
      // O feed em cache (W2-1) só sabe da publicação por aqui. Só invalida
      // quando algo mudou: o cron bate a cada 15 min e, sem mudança, a
      // invalidação só jogaria fora um cache bom.
      if (resultado.publicou && (resultado.mudou || (resultado.narrativas ?? 0) > 0)) {
        revalidateTag(tagDoFeed(dataReferencia), 'max')
      }
```

Imports: `import { revalidateTag } from 'next/cache'`; `import { tagDoFeed } from '@/app/(app)/feed-cacheado'`.

`src/app/api/cron/demo/route.ts`, junto do `revalidateTag(TAG_LATERAL, 'max')` (l.69): `revalidateTag(TAG_FEED, 'max')` com comentário "a demo publica vários dias: a tag geral". Import `TAG_FEED` de `@/app/(app)/feed-cacheado`.

Em `src/app/api/cron/demo/__tests__/route.test.ts`, onde hoje se espera `toHaveBeenCalledWith('lateral', 'max')`, acrescentar `expect(mocks.revalidateTag).toHaveBeenCalledWith('feed', 'max')`.

- [ ] **Step 9: Rodar**

Run: `npx vitest run src/app/api/cron/__tests__/invalidacao-feed.test.ts "src/app/(app)/__tests__/feed-cacheado.test.ts" src/app/api/cron/demo src/app/__tests__/paywall.test.ts src/app/__tests__/telas-04-lista.test.ts src/app/__tests__/telas-04-detalhe.test.ts src/modules/entrega/__tests__/lista-secreta.test.ts "src/app/(app)/lateral/__tests__/cache-forma.test.ts"`
Expected: tudo verde, **exceto** `telas-04-detalhe` pelo `%` já conhecido (conferir que a falha é a mesma de antes: a asserção do `%`, não outra).

---

### Task 2: Inscrição de push sem regravação (W2-2, parte 1)

**Files:**
- Modify: `src/modules/plataforma/push/inscricoes.ts:66-156`
- Modify: `src/modules/plataforma/__tests__/push.test.ts:83-110`
- Modify: `src/components/pwa/push-cliente.ts:113-143`, `src/components/pwa/AtivarAlertas.tsx`
- Modify: `src/app/(app)/page.tsx:809`, `src/app/(app)/conta/blocos.tsx:467` (passar `usuarioId`)
- Test: `src/components/pwa/__tests__/push-cliente.test.ts`

**Interfaces:**
- Produces: `inscreverPush(chavePublicaVapid: string, usuarioId: string, agora?: number): Promise<PushSubscription>`; `deveEnviarInscricao(guardado: string | null, atual: { usuarioId: string; endpoint: string; p256dh: string; auth: string }, agora: number): boolean`; `CHAVE_ULTIMA_INSCRICAO = 'nip.push.ultima-inscricao'`.

- [ ] **Step 1: Servidor — teste (falha)**

Em `src/modules/plataforma/__tests__/push.test.ts`, no teste "faz upsert idempotente…" (l.83), a auditoria esperada passa de `['CRIADA', 'ATUALIZADA', 'REASSOCIADA']` para `['CRIADA', 'REASSOCIADA']`, e acrescentar logo depois dele:

```ts
  it('reenviar a mesma inscrição, sem nada mudado, não grava nada', async () => {
    const sessao = await criarSessao('mesma@example.com', 'mesma')
    const agora = new Date('2026-08-21T15:00:00Z')
    await registrarInscricaoPush(banco.db, sessao, entrada, agora)
    const [antes] = await banco.db.select().from(pushInscricoes)

    const depois = new Date('2026-08-21T16:00:00Z')
    expect(await registrarInscricaoPush(banco.db, sessao, entrada, depois)).toMatchObject({
      criada: false,
      reassociada: false,
    })

    const [linha] = await banco.db.select().from(pushInscricoes)
    expect(linha?.atualizadoEm).toEqual(antes?.atualizadoEm)
    const auditoria = await banco.db.select().from(pushInscricoesAuditoria)
    expect(auditoria.map((a) => a.acao)).toEqual(['CRIADA'])
  })

  it('a mesma inscrição INVALIDADA volta a valer ao ser reenviada', async () => {
    const sessao = await criarSessao('volta@example.com', 'volta')
    const agora = new Date('2026-08-21T15:00:00Z')
    const { id } = await registrarInscricaoPush(banco.db, sessao, entrada, agora)
    await invalidarInscricoes(banco.db, [id], 'serviço de Push respondeu 404/410', agora)

    await registrarInscricaoPush(banco.db, sessao, entrada, new Date('2026-08-21T16:00:00Z'))
    const [linha] = await banco.db.select().from(pushInscricoes)
    expect(linha?.invalidadaEm).toBeNull()
  })
```

(Se `invalidarInscricoes` não estiver importado no arquivo, importar de `../push/inscricoes`. `criarSessao` e `entrada` já existem no arquivo; se a sessão de "um@…" colidir com e-mails, usar os e-mails acima.)

Run: `npx vitest run src/modules/plataforma/__tests__/push.test.ts` → FAIL ("ATUALIZADA" ainda gravada).

- [ ] **Step 2: Servidor — implementar**

Em `registrarInscricaoPush`, acrescentar `chaveP256dh` e `chaveAuth` ao select de `anterior` e, logo depois de calcular `reativada`:

```ts
    // Nada mudou: o cliente só reenviou o que já temos (toda montagem da home
    // fazia isso — W2-2). Sem UPDATE e sem auditoria; `criadoEm` intocado,
    // porque é o cursor do fan-out.
    const expiraEmEntrada =
      entrada.expirationTime === null ? null : new Date(entrada.expirationTime)
    if (
      anterior &&
      !reassociada &&
      !reativada &&
      anterior.chaveP256dh === entrada.keys.p256dh &&
      anterior.chaveAuth === entrada.keys.auth &&
      (anterior.expiraEm?.getTime() ?? null) === (expiraEmEntrada?.getTime() ?? null)
    ) {
      return { id: anterior.id, criada: false, reassociada: false }
    }
```

Run de novo → verde.

- [ ] **Step 3: Cliente — teste da decisão (falha)**

Em `src/components/pwa/__tests__/push-cliente.test.ts`:

```ts
import { deveEnviarInscricao } from '../push-cliente'

describe('deveEnviarInscricao', () => {
  const atual = { usuarioId: 'u1', endpoint: 'https://push/1', p256dh: 'P', auth: 'A' }
  const AGORA = Date.parse('2026-11-03T12:00:00Z')
  const guardar = (o: object) => JSON.stringify({ ...atual, enviadoEm: AGORA - 60_000, ...o })

  it('nada guardado → envia', () => expect(deveEnviarInscricao(null, atual, AGORA)).toBe(true))
  it('igual e recente → não envia', () =>
    expect(deveEnviarInscricao(guardar({}), atual, AGORA)).toBe(false))
  it('endpoint mudou → envia', () =>
    expect(deveEnviarInscricao(guardar({ endpoint: 'https://push/2' }), atual, AGORA)).toBe(true))
  it('outra conta no mesmo aparelho → envia (reassociação)', () =>
    expect(deveEnviarInscricao(guardar({ usuarioId: 'u2' }), atual, AGORA)).toBe(true))
  it('mais de 24 h → envia (reativa inscrição invalidada no servidor)', () =>
    expect(
      deveEnviarInscricao(guardar({ enviadoEm: AGORA - 24 * 3600_000 - 1 }), atual, AGORA),
    ).toBe(true))
  it('guardado corrompido → envia', () =>
    expect(deveEnviarInscricao('{x', atual, AGORA)).toBe(true))
})
```

Run → FAIL (não exportado).

- [ ] **Step 4: Cliente — implementar**

Em `push-cliente.ts`:

```ts
export const CHAVE_ULTIMA_INSCRICAO = 'nip.push.ultima-inscricao'
const REENVIO_MAXIMO_MS = 24 * 3600_000

type InscricaoEnviada = { usuarioId: string; endpoint: string; p256dh: string; auth: string }

/**
 * Reenviar a inscrição a cada montagem da home gravava uma linha de auditoria
 * por visita (W2-2). Só reenvia se algo mudou — ou uma vez por dia, que é o
 * que devolve à vida uma inscrição que o servidor invalidou (403/410) sem o
 * navegador saber.
 */
export function deveEnviarInscricao(
  guardado: string | null,
  atual: InscricaoEnviada,
  agora: number,
): boolean {
  if (!guardado) return true
  try {
    const g = JSON.parse(guardado) as Partial<InscricaoEnviada & { enviadoEm: number }>
    return !(
      g.usuarioId === atual.usuarioId &&
      g.endpoint === atual.endpoint &&
      g.p256dh === atual.p256dh &&
      g.auth === atual.auth &&
      typeof g.enviadoEm === 'number' &&
      agora - g.enviadoEm < REENVIO_MAXIMO_MS
    )
  } catch {
    return true
  }
}

function lerGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_INSCRICAO)
  } catch {
    return null
  }
}

function guardar(valor: InscricaoEnviada & { enviadoEm: number }): void {
  try {
    localStorage.setItem(CHAVE_ULTIMA_INSCRICAO, JSON.stringify(valor))
  } catch {
    // aba privada / storage bloqueado: só perde a economia, nunca o alerta
  }
}
```

`inscreverPush` ganha `usuarioId: string` e `agora = Date.now()`; entre obter `inscricao` e o `fetch`:

```ts
  const corpo = corpoDaInscricao(inscricao)
  const atual = { usuarioId, endpoint: corpo.endpoint, p256dh: corpo.keys.p256dh, auth: corpo.keys.auth }
  if (!deveEnviarInscricao(lerGuardado(), atual, agora)) return inscricao
```

usar `body: JSON.stringify(corpo)` e, depois do `if (!resposta.ok) throw …`, `guardar({ ...atual, enviadoEm: agora })`. Na função que faz o `DELETE` de `/api/push/inscricoes` (desativar), chamar `try { localStorage.removeItem(CHAVE_ULTIMA_INSCRICAO) } catch {}` antes do fetch.

`AtivarAlertas` ganha a prop `usuarioId: string` e a repassa nas duas chamadas de `inscreverPush` (l.49-77 e l.87-114). Em `src/app/(app)/page.tsx:809` e `src/app/(app)/conta/blocos.tsx:467`, passar `usuarioId={sessao.usuarioId}` (usar a variável de sessão já disponível no escopo; se o componente de `blocos.tsx` não a tiver, recebê-la por prop de quem o monta).

- [ ] **Step 5: Rodar**

Run: `npx vitest run src/components/pwa src/modules/plataforma/__tests__/push.test.ts src/app/api/push && npm run typecheck`
Expected: verde, 0 erros.

---

### Task 3: Entrega de push — só as que falharam, e 403 não derruba o canal (W2-2, parte 2)

**Files:**
- Modify: `src/modules/entrega/push/fanout.ts` (`mensagemLotePushSchema` l.45-52, `enviarLotePush` l.451-515)
- Modify: `src/app/api/fila/push/entregas/route.ts`
- Test: `src/modules/entrega/push/__tests__/fanout.test.ts` (novo `describe` no fim)

**Interfaces:**
- Produces: `enviarLotePush(db, porta, entrada, politica, configuracao?, agora?, publicador?: PublicadorFanoutPush): Promise<Record<string, number>>` — com `publicador`, retries viram um novo lote só com as que falharam; sem ele, comportamento antigo (lança `ErroRetryPush`). `mensagemLotePushSchema` ganha `tentativa: z.number().int().nonnegative().optional()`. Contagens ganham `recusadas`, `reagendadas`.
- Consumes: `PublicadorFanoutPush.publicarLote(mensagem, chave)`; `PublicadorFanoutVercel` precisa aceitar atraso — ver Step 3.

- [ ] **Step 1: Testes (falham)**

Acrescentar ao fim de `fanout.test.ts` (reusa `prepararConta`, `criarInscricoes`, `PublicadorFake`, `EVENTO`, `CONFIG`, `AGORA` do arquivo):

```ts
describe('entrega parcial (W2-2)', () => {
  async function loteCom(quantidade: number) {
    const conta = await prepararConta()
    await criarInscricoes(quantidade, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    await expandirEventoPush(banco.db, publicador, expansaoInicial(EVENTO), politica, CONFIG, AGORA)
    return { politica, publicador, lote: publicador.lotes[0]!.mensagem }
  }

  it('retry republica SÓ as que falharam, e confirma o lote', async () => {
    const { politica, publicador, lote } = await loteCom(4)
    const porta = new EnvioPushFake((i) =>
      i === 1
        ? { tipo: 'RETRY', motivo: 'SERVIDOR', statusCode: 503, retryAfterMs: null }
        : { tipo: 'ENVIADO', statusCode: 201 },
    )
    publicador.lotes.length = 0

    const r = await enviarLotePush(banco.db, porta, lote, politica, CONFIG, AGORA, publicador)

    expect(r.enviados).toBe(3)
    expect(r.reagendadas).toBe(1)
    expect(publicador.lotes).toHaveLength(1)
    expect(publicador.lotes[0]!.mensagem.inscricaoIds).toHaveLength(1)
    expect(publicador.lotes[0]!.mensagem.tentativa).toBe(1)
  })

  it('retry que passaria da validade conta como expirado e não republica', async () => {
    const { politica, publicador, lote } = await loteCom(1)
    const quaseVencido = { ...lote, evento: { ...lote.evento, expiraEm: new Date(AGORA.getTime() + 10_000).toISOString() } }
    publicador.lotes.length = 0
    const r = await enviarLotePush(
      banco.db,
      new EnvioPushFake([{ tipo: 'RETRY', motivo: 'SERVIDOR', statusCode: 503, retryAfterMs: 60_000 }]),
      quaseVencido,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )
    expect(r.expirados).toBe(1)
    expect(publicador.lotes).toHaveLength(0)
  })

  it('403 isolado num lote de 1 invalida só ela, sem erro global', async () => {
    const { politica, publicador, lote } = await loteCom(1)
    const r = await enviarLotePush(
      banco.db,
      new EnvioPushFake([{ tipo: 'ERRO_VAPID', statusCode: 403 }]),
      lote,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )
    expect(r.invalidados).toBe(1)
    const [linha] = await banco.db.select().from(pushInscricoes)
    expect(linha?.motivoInvalidacao).toMatch(/403/)
  })

  it('403 em uma de quatro: invalida uma, entrega três', async () => {
    const { politica, publicador, lote } = await loteCom(4)
    const r = await enviarLotePush(
      banco.db,
      new EnvioPushFake((i) =>
        i === 2 ? { tipo: 'ERRO_VAPID', statusCode: 403 } : { tipo: 'ENVIADO', statusCode: 201 },
      ),
      lote,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )
    expect(r.enviados).toBe(3)
    expect(r.invalidados).toBe(1)
  })

  it('recusa em mais da metade de um lote é global: lança e não invalida ninguém', async () => {
    const { politica, publicador, lote } = await loteCom(4)
    await expect(
      enviarLotePush(
        banco.db,
        new EnvioPushFake((i) =>
          i < 3 ? { tipo: 'ERRO_VAPID', statusCode: 403 } : { tipo: 'ENVIADO', statusCode: 201 },
        ),
        lote,
        politica,
        CONFIG,
        AGORA,
        publicador,
      ),
    ).rejects.toThrow(ErroVapidPush)
    const invalidadas = (await banco.db.select().from(pushInscricoes)).filter((l) => l.invalidadaEm)
    expect(invalidadas).toHaveLength(0)
  })
})
```

Importar `ErroVapidPush` de `../fanout`. Conferir em `src/modules/entrega/push/fake.ts` a assinatura exata do construtor de `EnvioPushFake` (array ou `(indice) => ResultadoEnvioPush`) e ajustar a forma se preciso — a ordem de envio com `paralelismo` 8 e 4 itens é a ordem da fila.

Run: `npx vitest run src/modules/entrega/push/__tests__/fanout.test.ts` → FAIL.

- [ ] **Step 2: Implementar em `enviarLotePush`**

1. Schema: `tentativa: z.number().int().nonnegative().optional()` em `mensagemLotePushSchema`.
2. Constante no topo do arquivo: `const TENTATIVAS_MAXIMAS_DO_LOTE = 5`.
3. Parâmetro novo no fim: `publicador?: PublicadorFanoutPush`.
4. Contagens: acrescentar `recusadas: 0, reagendadas: 0`.
5. Remover o `if (erroVapid) return` do laço (l.479-481) e o flag `erroVapid`; em vez dele, `const recusadas: string[] = []` e `else if (resultado.tipo === 'ERRO_VAPID') recusadas.push(linha.id)`. Guardar os retries com o id: `const retries: { id: string; resultado: ResultadoEnvioPush }[] = []` e `retries.push({ id: linha.id, resultado })`.
6. Depois do laço, antes de invalidar:

```ts
  // 401/403 em MAIS DA METADE do lote é a credencial VAPID (global): ninguém
  // é invalidado e o lote volta. Isolado, é a inscrição que o serviço recusa
  // — invalida só ela (W2-2). Antes, um único 403 derrubava o lote inteiro
  // por 5 min, a validade inteira de um apito.
  contagens.recusadas = recusadas.length
  if (recusadas.length > 0 && recusadas.length * 2 > elegiveis.length && elegiveis.length > 1) {
    throw new ErroVapidPush()
  }
  contagens.invalidados = await invalidarInscricoes(db, invalidar, 'serviço de Push respondeu 404/410', agora)
  if (recusadas.length > 0) {
    contagens.invalidados += await invalidarInscricoes(db, recusadas, 'serviço de Push respondeu 401/403', agora)
  }
```

(Lote de 1 com 403: `elegiveis.length > 1` é falso → invalida só ela. É a escolha do Review Focus 4: se a VAPID estiver mesmo quebrada, os lotes maiores detectam; a inscrição isolada invalidada volta pelo reenvio diário do cliente, Tarefa 2.)

7. Retries:

```ts
  if (retries.length > 0) {
    const atrasos = retries
      .map(({ resultado }) => (resultado.tipo === 'RETRY' ? resultado.retryAfterMs : null))
      .filter((v): v is number => v !== null)
    const motivos = retries.reduce<Record<string, number>>((acc, { resultado }) => {
      if (resultado.tipo === 'RETRY') acc[resultado.motivo] = (acc[resultado.motivo] ?? 0) + 1
      return acc
    }, {})
    const tentativa = (lote.tentativa ?? 0) + 1
    const atrasoMs =
      atrasos.length > 0
        ? Math.max(...atrasos)
        : configuracao.retryBaseSegundos * 1000 * 2 ** Math.min(tentativa - 1, 5)
    if (!publicador) throw new ErroRetryPush(atrasos.length > 0 ? Math.max(...atrasos) : null, motivos)

    const expiraEm = Date.parse(lote.evento.expiraEm)
    if (tentativa > TENTATIVAS_MAXIMAS_DO_LOTE) {
      contagens.permanentes += retries.length
    } else if (agora.getTime() + atrasoMs >= expiraEm) {
      // Reenviar depois da validade é entregar um apito que já não vale.
      contagens.expirados += retries.length
    } else {
      const ids = retries.map((r) => r.id).sort()
      await publicador.publicarLote(
        { versao: 1, evento: lote.evento, inscricaoIds: ids, pagina: lote.pagina, tentativa },
        chaveFanout('retry', lote.evento.chave, String(tentativa), ...ids),
        Math.ceil(atrasoMs / 1000),
      )
      contagens.reagendadas = ids.length
    }
  }
  return contagens
```

(Se `lote.evento.expiraEm` for opcional no `MensagemPushV1`, usar `mensagemPushExpirada` com um `agora` deslocado: `mensagemPushExpirada(lote.evento, new Date(agora.getTime() + atrasoMs))`. Conferir em `contrato.ts:89-94`.)

- [ ] **Step 3: Publicador com atraso**

`PublicadorFanoutPush.publicarLote(mensagem, idempotencyKey, atrasoSegundos?: number)`. Em `PublicadorFanoutVercel`:

```ts
  async publicarLote(mensagem: MensagemLotePush, idempotencyKey: string, atrasoSegundos?: number) {
    await send(TOPICO_PUSH_ENTREGAS, mensagem, {
      idempotencyKey,
      ...(atrasoSegundos ? { delaySeconds: atrasoSegundos } : {}),
    })
  }
```

O `PublicadorFake` do teste aceita o terceiro argumento sem mudança (parâmetro extra é ignorado).

- [ ] **Step 4: Rota passa o publicador; VAPID global volta em 60 s**

Em `src/app/api/fila/push/entregas/route.ts`: passar `new PublicadorFanoutVercel()` como 7º argumento de `enviarLotePush` (entre `configuracao` e ele, passar `new Date()`), importar de `@/modules/entrega/push/fanout`; e no `retry`, `ErroVapidPush` → `{ afterSeconds: 60 }` com comentário "300 s era a validade inteira de um apito de Fire Live".

- [ ] **Step 5: Rodar**

Run: `npx vitest run src/modules/entrega/push src/app/api/fila` → verde. Os testes antigos de `enviarLotePush` sem publicador continuam lançando `ErroRetryPush` como antes.

---

### Task 4: Expansão do push em faixas paralelas (W2-2, parte 3)

**Files:**
- Modify: `src/modules/entrega/push/fanout.ts` (`mensagemExpansaoPushSchema` l.35-43, `expandirEventoPush` l.344-416)
- Modify: `vercel.ts:36-59`
- Test: `src/modules/entrega/push/__tests__/fanout.test.ts`

**Interfaces:**
- Produces: `mensagemExpansaoPushSchema` ganha `faixa: z.boolean().optional()`. A expansão inicial (`cursor === null && !faixa`) calcula as fronteiras e publica **todas** as faixas de uma vez; cada faixa processa uma página e **não** continua. Mensagens antigas (sem `faixa`, com `cursor`) seguem a cadeia antiga — compatível com o que estiver na fila durante o deploy.

- [ ] **Step 1: Teste (falha)**

```ts
describe('expansão em faixas (W2-2)', () => {
  it('a expansão inicial publica todas as faixas de uma vez, e elas cobrem tudo sem repetir', async () => {
    const conta = await prepararConta()
    const ids = await criarInscricoes(1000, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()

    await expandirEventoPush(banco.db, publicador, expansaoInicial(EVENTO), politica, CONFIG, AGORA)
    // CONFIG usa lote 250: 1000 inscrições = 4 faixas, publicadas JÁ na primeira mensagem.
    expect(publicador.expansoes.map((e) => e.mensagem.faixa)).toEqual([true, true, true, true])
    expect(publicador.lotes).toHaveLength(0)

    for (const { mensagem } of [...publicador.expansoes]) {
      const r = await expandirEventoPush(banco.db, publicador, mensagem, politica, CONFIG, AGORA)
      expect(r.continuou).toBe(false)
    }
    const entregues = publicador.lotes.flatMap((l) => l.mensagem.inscricaoIds)
    expect(new Set(entregues).size).toBe(1000)
    expect([...entregues].sort()).toEqual([...ids].sort())
  })
})
```

O teste existente "pagina 10 mil inscrições sem omissão" (l.131) percorre a cadeia de continuações; ajustá-lo para processar as faixas publicadas (o mesmo laço acima) em vez de seguir `continuou`. A asserção de cobertura total continua a mesma.

O teste "retry depois do lote e antes da continuação repete com a mesma chave" (l.164) usa `falharContinuacao`. Com as faixas, a primeira `publicarExpansao` que falha é a de uma faixa: reescrevê-lo como "falha no meio da publicação das faixas → a reentrega da expansão inicial republica as mesmas faixas com as MESMAS chaves" (comparar os conjuntos de `chave` das duas tentativas). É a idempotência que a fila precisa; o que o teste antigo provava continua provado, na forma nova.

Run → FAIL.

- [ ] **Step 2: Implementar**

Função nova (perto de `paginaDeInscricoes`):

```ts
/**
 * Fronteiras das faixas em UMA consulta: o (criadoEm, id) de cada
 * `tamanho`-ésima inscrição ativa até o limite. Cada faixa vira uma
 * mensagem independente — a fila as consome em paralelo, em vez de 20
 * saltos em sequência para 2 mil inscrições (W2-2).
 */
async function fronteirasDasFaixas(db: Db, limite: CursorPush, tamanho: number, agora: Date) {
  const linhas = await db.execute<{ criado_em: Date | string; id: string }>(sql`
    select criado_em, id from (
      select criado_em, id, row_number() over (order by criado_em, id) as n
      from push_inscricoes
      where invalidada_em is null
        and (expira_em is null or expira_em > ${agora})
        and (criado_em, id) <= (${new Date(limite.criadoEm)}, ${limite.id}::uuid)
    ) t
    where n % ${tamanho} = 0
    order by criado_em, id
  `)
  const rows = 'rows' in linhas ? linhas.rows : linhas
  return (rows as { criado_em: Date | string; id: string }[]).map((r) => ({
    criadoEm: new Date(r.criado_em).toISOString(),
    id: r.id,
  }))
}
```

(Conferir no projeto o formato de retorno de `db.execute` — outras chamadas `tx.execute(sql\`…\`)` em `src/modules` mostram se vem `.rows`; manter só a forma que o driver usa.)

Em `expandirEventoPush`, logo depois de obter `limite`:

```ts
  if (mensagem.cursor === null && !mensagem.faixa) {
    const fronteiras = await fronteirasDasFaixas(db, limite, configuracao.tamanhoLote, agora)
    const fins = [...fronteiras.filter((f) => f.id !== limite.id || f.criadoEm !== limite.criadoEm), limite]
    let inicio: CursorPush | null = null
    for (const [pagina, fim] of fins.entries()) {
      await publicador.publicarExpansao(
        { versao: 1, evento: mensagem.evento, cursor: inicio, limiteSuperior: fim, pagina, faixa: true },
        chaveFanout('faixa', mensagem.evento.chave, fim.criadoEm, fim.id),
      )
      inicio = fim
    }
    return { expirado: false, varridas: 0, elegiveis: 0, continuou: false }
  }
```

Atenção: uma faixa com `cursor === null` (a primeira) chega com `faixa: true`, e por isso não entra neste ramo. No fim, a continuação só acontece se `!mensagem.faixa`: trocar `if (continuou) {` por `if (continuou && !mensagem.faixa) {` e devolver `continuou: continuou && !mensagem.faixa`.

- [ ] **Step 3: Concorrência dos consumers**

`vercel.ts`: `push-eventos` `maxConcurrency: 2` → `10`; `push-entregas` `maxConcurrency: 5` → `20`. Comentário: "W2-2: as faixas chegam juntas; 20 entregas × 100 × 10 envios paralelos cobrem 2 mil inscrições em uma rodada".

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/modules/entrega/push` → verde.

---

### Task 5: Alguém fica sabendo (W2-5 + push expirado + P3)

**Files:**
- Create: `src/modules/entrega/observabilidade/falhas-operacionais.ts`
- Create: `src/modules/entrega/observabilidade/__tests__/falhas-operacionais.test.ts`
- Create: `src/modules/entrega/observabilidade/notificador-webhook.ts` (+ teste no mesmo arquivo de testes)
- Create: `src/instrumentation.ts`
- Modify: `src/app/api/fila/push/entregas/route.ts`, `src/app/api/cron/saude/route.ts`, `src/modules/plataforma/assinatura/webhook.ts:364-388`

**Interfaces:**
- Produces: `registrarFalhaOperacional(db: Db, origem: OrigemOperacional, contexto: Record<string, unknown>, agora: Date): Promise<void>`; `type OrigemOperacional = 'push-expirado' | 'pagamento-aprovado-sem-direito'`; `avaliarFalhasOperacionais(db: Db, agora: Date, notificador: NotificadorOperacional): Promise<{ origem: OrigemOperacional; quantidade: number }[]>`; `NotificadorWebhook`; `notificadorDoAmbiente(ambiente?): NotificadorOperacional`.

**Decisões desta tarefa:** o canal (G8) segue pendente. O notificador real é um **webhook genérico** (`ALERTA_WEBHOOK_URL`: POST JSON `{ severidade, titulo, corpo }`), que serve Slack/Discord/Zapier; sem a variável, cai no `NotificadorLog` de hoje — "configurável e desligado", como pede a §4. O P3 **não ganha regra** (D6): continua sem conceder, só passa a alertar.

- [ ] **Step 1: Testes (falham)**

```ts
// src/modules/entrega/observabilidade/__tests__/falhas-operacionais.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { logFalhas } from '../../../dominio/db/schema'
import { avaliarFalhasOperacionais, registrarFalhaOperacional } from '../falhas-operacionais'
import { NotificadorMemoria } from '../notificador'
import { NotificadorWebhook, notificadorDoAmbiente } from '../notificador-webhook'
import { NotificadorLog } from '../notificador'

const AGORA = new Date('2026-11-03T23:00:00.000Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())
beforeEach(async () => {
  await banco.db.delete(logFalhas)
})

describe('falhas operacionais viram alerta', () => {
  it('push expirado nos últimos 10 min vira UM alerta com a soma', async () => {
    await registrarFalhaOperacional(banco.db, 'push-expirado', { quantidade: 3 }, new Date(AGORA.getTime() - 60_000))
    await registrarFalhaOperacional(banco.db, 'push-expirado', { quantidade: 2 }, new Date(AGORA.getTime() - 120_000))
    const n = new NotificadorMemoria()
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, n)).toEqual([
      { origem: 'push-expirado', quantidade: 5 },
    ])
    expect(n.enviados).toHaveLength(1)
    expect(n.enviados[0]?.severidade).toBe('ALTA')
  })

  it('a mesma falha não realerta dentro de 30 min', async () => {
    await registrarFalhaOperacional(banco.db, 'pagamento-aprovado-sem-direito', { usuarioId: 'u' }, AGORA)
    const n = new NotificadorMemoria()
    await avaliarFalhasOperacionais(banco.db, AGORA, n)
    await registrarFalhaOperacional(banco.db, 'pagamento-aprovado-sem-direito', { usuarioId: 'v' }, new Date(AGORA.getTime() + 5 * 60_000))
    await avaliarFalhasOperacionais(banco.db, new Date(AGORA.getTime() + 5 * 60_000), n)
    expect(n.enviados).toHaveLength(1)
  })

  it('falha antiga (mais de 10 min) não alerta', async () => {
    await registrarFalhaOperacional(banco.db, 'push-expirado', { quantidade: 1 }, new Date(AGORA.getTime() - 11 * 60_000))
    expect(await avaliarFalhasOperacionais(banco.db, AGORA, new NotificadorMemoria())).toEqual([])
  })
})

describe('notificador', () => {
  it('sem ALERTA_WEBHOOK_URL fica no log (desligado)', () => {
    expect(notificadorDoAmbiente({})).toBeInstanceOf(NotificadorLog)
  })

  it('com a URL, faz POST do aviso em JSON', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const n = new NotificadorWebhook('https://hooks.exemplo/abc', fetchFalso)
    await n.enviar({ severidade: 'ALTA', titulo: 'T', corpo: 'C' })
    expect(fetchFalso).toHaveBeenCalledWith('https://hooks.exemplo/abc', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchFalso.mock.calls[0]![1].body)).toEqual({ severidade: 'ALTA', titulo: 'T', corpo: 'C' })
  })

  it('webhook fora do ar não derruba quem avisa: cai no log', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const n = new NotificadorWebhook('https://hooks.exemplo/abc', vi.fn().mockRejectedValue(new Error('rede')))
    await expect(n.enviar({ severidade: 'ALTA', titulo: 'T', corpo: 'C' })).resolves.toBeUndefined()
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })
})
```

Run → FAIL (módulos não existem).

- [ ] **Step 2: Implementar `falhas-operacionais.ts`**

```ts
import { and, desc, gte, inArray } from 'drizzle-orm'

import { logFalhas } from '@/modules/dominio/db/schema'
import type { Db } from '@/modules/dominio/db/tipos'

import type { NotificadorOperacional } from './notificador'

/**
 * Falhas que ninguém via: push que venceu antes de chegar (W2-2) e
 * pagamento aprovado que não liberou acesso (P3 — D6: sem regra nova, só o
 * alerta). Quem detecta grava em `log_falhas`; a saúde (cron de 5 min)
 * soma a janela e avisa uma vez por origem, sem realerta por 30 min.
 * Janelas operacionais, não regra de estratégia: ficam aqui.
 */
export type OrigemOperacional = 'push-expirado' | 'pagamento-aprovado-sem-direito'
const ORIGENS: OrigemOperacional[] = ['push-expirado', 'pagamento-aprovado-sem-direito']
const ORIGEM_DO_ALERTA = 'alerta-operacional'
const JANELA_MS = 10 * 60_000
const REALERTA_MS = 30 * 60_000

const TITULOS: Record<OrigemOperacional, string> = {
  'push-expirado': 'Push vencendo antes de chegar',
  'pagamento-aprovado-sem-direito': 'Pagamento aprovado sem acesso liberado (P3)',
}

export async function registrarFalhaOperacional(
  db: Db,
  origem: OrigemOperacional,
  contexto: Record<string, unknown>,
  agora: Date,
): Promise<void> {
  await db.insert(logFalhas).values({
    origem,
    severidade: 'ERRO',
    mensagem: TITULOS[origem],
    contextoJson: contexto,
    ocorridoEm: agora,
  })
}

export async function avaliarFalhasOperacionais(
  db: Db,
  agora: Date,
  notificador: NotificadorOperacional,
): Promise<{ origem: OrigemOperacional; quantidade: number }[]> {
  const desde = new Date(agora.getTime() - Math.max(JANELA_MS, REALERTA_MS))
  const linhas = await db
    .select({ origem: logFalhas.origem, contextoJson: logFalhas.contextoJson, ocorridoEm: logFalhas.ocorridoEm })
    .from(logFalhas)
    .where(and(inArray(logFalhas.origem, [...ORIGENS, ORIGEM_DO_ALERTA]), gte(logFalhas.ocorridoEm, desde)))
    .orderBy(desc(logFalhas.ocorridoEm))

  const alertadas = new Set(
    linhas
      .filter((l) => l.origem === ORIGEM_DO_ALERTA && l.ocorridoEm.getTime() > agora.getTime() - REALERTA_MS)
      .map((l) => (l.contextoJson as { origem?: string } | null)?.origem),
  )

  const emitidos: { origem: OrigemOperacional; quantidade: number }[] = []
  for (const origem of ORIGENS) {
    if (alertadas.has(origem)) continue
    const recentes = linhas.filter(
      (l) => l.origem === origem && l.ocorridoEm.getTime() > agora.getTime() - JANELA_MS,
    )
    if (recentes.length === 0) continue
    const quantidade = recentes.reduce(
      (soma, l) => soma + ((l.contextoJson as { quantidade?: number } | null)?.quantidade ?? 1),
      0,
    )
    await db.insert(logFalhas).values({
      origem: ORIGEM_DO_ALERTA,
      severidade: 'ERRO',
      mensagem: TITULOS[origem],
      contextoJson: { origem, quantidade },
      ocorridoEm: agora,
    })
    await notificador.enviar({
      severidade: 'ALTA',
      titulo: TITULOS[origem],
      corpo: `${quantidade} ocorrência(s) nos últimos 10 min. Detalhes em log_falhas (origem ${origem}).`,
    })
    emitidos.push({ origem, quantidade })
  }
  return emitidos
}
```

- [ ] **Step 3: Implementar `notificador-webhook.ts`**

```ts
import { NotificadorLog, type AvisoOperacional, type NotificadorOperacional } from './notificador'

/**
 * Canal real enquanto o G8 não é decidido: um webhook genérico (Slack,
 * Discord, Zapier aceitam JSON). Sem `ALERTA_WEBHOOK_URL`, fica desligado e
 * o aviso segue para o log, como hoje. Falha do webhook nunca derruba quem
 * avisa: cai no log.
 */
export class NotificadorWebhook implements NotificadorOperacional {
  private readonly reserva = new NotificadorLog()
  constructor(
    private readonly url: string,
    private readonly buscar: typeof fetch = fetch,
  ) {}

  async enviar(aviso: AvisoOperacional): Promise<void> {
    try {
      const resposta = await this.buscar(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(aviso),
        signal: AbortSignal.timeout(5_000),
      })
      if (!resposta.ok) throw new Error(`webhook respondeu ${resposta.status}`)
    } catch (erro) {
      console.error(JSON.stringify({ evento: 'alerta_webhook_falhou', erro: String(erro) }))
      await this.reserva.enviar(aviso)
    }
  }
}

export function notificadorDoAmbiente(
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): NotificadorOperacional {
  const url = ambiente.ALERTA_WEBHOOK_URL
  return url ? new NotificadorWebhook(url) : new NotificadorLog()
}
```

Run o teste → verde.

- [ ] **Step 4: Ligar as pontas**

- `src/app/api/cron/saude/route.ts`: trocar `new NotificadorLog()` por `const notificador = notificadorDoAmbiente()`; chamar `avaliarESinalizar(getDb(), agora, ruleset, notificador)` **e** `avaliarFalhasOperacionais(getDb(), agora, notificador)`; retornar `{ alertas: emitidos, operacionais }` e `quantidade: (r) => r.alertas.length + r.operacionais.length`.
- `src/app/api/fila/push/entregas/route.ts`: depois do `console.info(... push_lote_processado ...)`, `if (contagens.expirados > 0) await registrarFalhaOperacional(getDb(), 'push-expirado', { quantidade: contagens.expirados, canal: (mensagem as { evento?: { canal?: string } }).evento?.canal ?? null }, new Date())`.
- `src/modules/plataforma/assinatura/webhook.ts:364-388`: `plataforma` não pode importar `entrega` se o dependency-cruiser proibir (conferir com `npm run boundaries` depois). Forma segura: gravar direto em `logFalhas` ali mesmo, com `origem: 'pagamento-aprovado-sem-direito'`, `severidade: 'ERRO'`, `mensagem: 'Pagamento aprovado sem acesso liberado (P3)'`, `contextoJson` = o mesmo objeto que hoje vai ao `console.warn` (sem e-mail, sem token), usando o `tx`/`db` do escopo, mantendo o `console.warn`. A string da origem tem de ser idêntica à de `OrigemOperacional`; um teste de fonte em `falhas-operacionais.test.ts` trava isso:

```ts
import { readFileSync } from 'node:fs'
it('o webhook grava a origem que a saúde lê', () => {
  expect(readFileSync('src/modules/plataforma/assinatura/webhook.ts', 'utf8')).toContain(
    "origem: 'pagamento-aprovado-sem-direito'",
  )
})
```

- [ ] **Step 5: `src/instrumentation.ts`**

```ts
import type { Instrumentation } from 'next'

/**
 * Todo erro de requisição sai numa linha JSON procurável nos logs da Vercel
 * (W2-5). Não grava no banco: um erro de banco não pode gerar outro.
 */
export const onRequestError: Instrumentation.onRequestError = async (erro, requisicao, contexto) => {
  const e = erro instanceof Error ? erro : new Error(String(erro))
  console.error(
    JSON.stringify({
      evento: 'erro_de_requisicao',
      rota: contexto.routePath,
      tipo: contexto.routeType,
      metodo: requisicao.method,
      caminho: requisicao.path.split('?')[0],
      mensagem: e.message.slice(0, 500),
      digest: (e as Error & { digest?: string }).digest ?? null,
    }),
  )
}
```

Teste de fonte curto em `falhas-operacionais.test.ts`: `expect(readFileSync('src/instrumentation.ts','utf8')).toMatch(/export const onRequestError/)`. (A query string sai do log: pode carregar token de redefinição.)

- [ ] **Step 6: Rodar**

Run: `npx vitest run src/modules/entrega/observabilidade src/app/api/fila src/modules/plataforma/__tests__/webhook-temporada.test.ts src/modules/plataforma/__tests__/spec04.test.ts && npm run boundaries && npm run typecheck`
Expected: verde, 0 violações.

---

### Task 6: Fire Live que sobrevive a soluço (W2-3, parte 1)

**Files:**
- Create: `src/modules/entrega/fire-live/passo.ts`
- Create: `src/modules/entrega/__tests__/passo-fire-live.test.ts`
- Modify: `src/workflows/fire-live.ts` (o passo `ciclarUmaVez` vira fino)
- Modify: `src/modules/entrega/fire-live/inicio.ts` (retomada de `INICIADA` parada)
- Modify: `src/modules/entrega/__tests__/inicio-fire-live.test.ts`

**Interfaces:**
- Produces: `executarPassoFireLive(deps: DepsPasso, entrada: EntradaPasso): Promise<RetornoPasso>` com
  `DepsPasso = { db: Db; ruleset: Ruleset; fila: FilaPush; ingerir: (agora: Date) => Promise<void>; agora: Date }` e
  `EntradaPasso = { jogoId: string; runId: string | null; estadoAnterior: EstadoObservado | null; iniciadoEmIso: string; ciclo: number; motorEncerrado: boolean }`;
  `RetornoPasso` move-se de `src/workflows/fire-live.ts:68-75` para `passo.ts` e ganha o motivo `'lease-perdido'`;
  `registrarBatimento(db, jogoId, runId, agora): Promise<boolean>` em `passo.ts`;
  `CICLOS_SEM_BATIMENTO_PARA_RETOMAR = 3` em `inicio.ts`.
- Consumes: `executarCiclo`, `registrarCiclo`, `encerrarExecucao` (`ciclo.ts`). O tipo da fila é o que `executarCiclo` recebe hoje (`new FilaVercel()`); usar o mesmo tipo importado de onde `executarCiclo` o declara.

**Desenho:**
- **Batimento** = `atualizado_em` gravado no início de **todo** passo (inclusive depois do fim do 1Q), com fencing: `UPDATE … SET atualizado_em = agora WHERE jogo_id = ? AND run_id = ? AND estado = 'INICIADA' RETURNING`. Nenhuma linha → este run perdeu a vez → `{ encerrar: true, motivo: 'lease-perdido' }`. Runs antigos sem `leaseToken` passam `runId: null` e pulam o batimento (compatibilidade, como hoje).
- **Erro capturado por ciclo:** qualquer exceção depois do batimento (ingestão, banco, motor) é registrada em log e o passo devolve "continua" com o estado anterior. O run não morre; o próximo ciclo tenta de novo 20 s depois. As saídas duras (6 h, jogo encerrado, sumido, limite do ruleset) continuam.
- **Retomada:** o cron `ao-vivo` retoma `INICIADA` cujo `atualizado_em` é mais velho que 3 × `intervalo_segundos`, trocando o token e zerando `run_id`. O run velho, se ainda estiver vivo, perde o próximo batimento e para.

- [ ] **Step 1: Testes do passo (falham)**

```ts
// src/modules/entrega/__tests__/passo-fire-live.test.ts
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { fireLiveExecucoes, jogos, times } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { executarPassoFireLive } from '../fire-live/passo'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-11-03T23:10:00.000Z')
const INICIO = '2026-11-03T23:00:00.000Z'
const filaMuda = { publicar: vi.fn() } as never

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterAll(async () => {
  vi.restoreAllMocks()
  await banco.fechar()
})
beforeEach(async () => {
  await banco.db.delete(fireLiveExecucoes)
  await banco.db.delete(jogos)
  await banco.db.delete(times)
  const [casa] = await banco.db.insert(times).values({ sigla: 'CAS', nome: 'Casa' }).returning()
  const [vis] = await banco.db.insert(times).values({ sigla: 'VIS', nome: 'Visitante' }).returning()
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date(INICIO),
      dataReferencia: '2026-11-03',
      timeCasaId: casa!.id,
      timeVisitanteId: vis!.id,
      quartoAtual: 2,
    })
    .returning()
  jogoId = jogo!.id
  await banco.db.insert(fireLiveExecucoes).values({
    jogoId,
    iniciadoEm: new Date(INICIO),
    estado: 'INICIADA',
    runId: 'run-1',
    atualizadoEm: new Date(INICIO),
  })
})

const entrada = (o: Partial<Parameters<typeof executarPassoFireLive>[1]> = {}) => ({
  jogoId,
  runId: 'run-1',
  estadoAnterior: { x: 1 } as never,
  iniciadoEmIso: INICIO,
  ciclo: 5,
  motorEncerrado: true,
  ...o,
})

describe('passo do Fire Live', () => {
  it('ingestão falhando não mata o run: continua com o estado anterior', async () => {
    const r = await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir: async () => { throw new Error('BDL 502') } },
      entrada({ motorEncerrado: false }),
    )
    expect(r).toMatchObject({ encerrar: false, estado: { x: 1 }, motorEncerrado: false })
  })

  it('todo passo grava o batimento, mesmo depois do fim do 1Q', async () => {
    await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir: async () => {} },
      entrada(),
    )
    const [linha] = await banco.db.select().from(fireLiveExecucoes).where(eq(fireLiveExecucoes.jogoId, jogoId))
    expect(linha?.atualizadoEm).toEqual(AGORA)
  })

  it('run que perdeu o lease para no próximo passo', async () => {
    await banco.db.update(fireLiveExecucoes).set({ runId: 'run-2' }).where(eq(fireLiveExecucoes.jogoId, jogoId))
    const ingerir = vi.fn()
    const r = await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir },
      entrada(),
    )
    expect(r).toEqual({ encerrar: true, motivo: 'lease-perdido' })
    expect(ingerir).not.toHaveBeenCalled()
  })

  it('jogo encerrado continua sendo saída dura', async () => {
    await banco.db.update(jogos).set({ status: 'ENCERRADO' }).where(eq(jogos.id, jogoId))
    const r = await executarPassoFireLive(
      { db: banco.db, ruleset, fila: filaMuda, agora: AGORA, ingerir: async () => {} },
      entrada(),
    )
    expect(r).toEqual({ encerrar: true, motivo: 'jogo-encerrado' })
  })
})
```

Run → FAIL (módulo não existe).

- [ ] **Step 2: Implementar `passo.ts`**

Mover para `src/modules/entrega/fire-live/passo.ts` o corpo de `ciclarUmaVez` (`src/workflows/fire-live.ts:93-158`), trocando `rulesetAtivo()`/`getDb()`/`new Date()`/`new FilaVercel()`/ingestão pelas `deps`:

```ts
import { and, eq } from 'drizzle-orm'

import { fireLiveExecucoes, jogos } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Ruleset } from '../../motor'
import { encerrarExecucao, executarCiclo, registrarCiclo, type EstadoObservado } from './ciclo'

export type RetornoPasso =
  | { encerrar: true; motivo: string }
  | { encerrar: false; estado: EstadoObservado; motorEncerrado: boolean; intervaloSegundos: number }

export type DepsPasso = {
  db: Db
  ruleset: Ruleset
  fila: Parameters<typeof executarCiclo>[2]
  ingerir: (agora: Date) => Promise<void>
  agora: Date
}

export type EntradaPasso = {
  jogoId: string
  runId: string | null
  estadoAnterior: EstadoObservado | null
  iniciadoEmIso: string
  ciclo: number
  motorEncerrado: boolean
}

/** Batimento com fencing: só o run dono da linha bate. */
export async function registrarBatimento(db: Db, jogoId: string, runId: string, agora: Date) {
  const linhas = await db
    .update(fireLiveExecucoes)
    .set({ atualizadoEm: agora })
    .where(
      and(
        eq(fireLiveExecucoes.jogoId, jogoId),
        eq(fireLiveExecucoes.runId, runId),
        eq(fireLiveExecucoes.estado, 'INICIADA'),
      ),
    )
    .returning({ jogoId: fireLiveExecucoes.jogoId })
  return linhas.length > 0
}

/**
 * UM ciclo do Fire Live. Reexecução é segura por construção (UNIQUE de
 * apitos/greens). Uma exceção no meio do ciclo NÃO derruba o run (W2-3): o
 * runtime tentaria o passo 3 vezes e depois mataria o workflow, deixando a
 * linha INICIADA para sempre. Aqui o erro vai ao log e o próximo ciclo tenta
 * de novo, 20 s depois. O motor é idempotente; repetir um ciclo não repete push.
 */
export async function executarPassoFireLive(deps: DepsPasso, e: EntradaPasso): Promise<RetornoPasso> {
  const { db, ruleset, agora } = deps
  const intervaloSegundos = ruleset.fire_live.observacao.intervalo_segundos
  const continuar = (estado: EstadoObservado | null, motorEncerrado: boolean): RetornoPasso => ({
    encerrar: false,
    estado: estado ?? {},
    motorEncerrado,
    intervaloSegundos,
  })

  if (e.runId !== null && !(await registrarBatimento(db, e.jogoId, e.runId, agora))) {
    return { encerrar: true, motivo: 'lease-perdido' }
  }

  if (agora.getTime() - new Date(e.iniciadoEmIso).getTime() >= 6 * 60 * 60_000) {
    await encerrarExecucao(db, e.jogoId, 'limite-de-tempo', agora)
    return { encerrar: true, motivo: 'limite-de-tempo' }
  }

  try {
    await deps.ingerir(agora)

    const [jogo] = await db.select({ status: jogos.status }).from(jogos).where(eq(jogos.id, e.jogoId)).limit(1)
    if (!jogo) {
      await encerrarExecucao(db, e.jogoId, 'jogo-nao-encontrado', agora)
      return { encerrar: true, motivo: 'jogo-nao-encontrado' }
    }
    if (jogo.status === 'ENCERRADO') {
      await encerrarExecucao(db, e.jogoId, 'jogo-encerrado', agora)
      return { encerrar: true, motivo: 'jogo-encerrado' }
    }
    if (e.motorEncerrado) return continuar(e.estadoAnterior, true)

    const resultado = await executarCiclo(db, ruleset, deps.fila, {
      jogoId: e.jogoId,
      estadoAnterior: e.estadoAnterior,
      iniciadoEm: new Date(e.iniciadoEmIso),
      agora,
    })
    if (resultado.encerrar) {
      if (resultado.motivo === 'fim-do-primeiro-quarto') return continuar(e.estadoAnterior, true)
      await encerrarExecucao(db, e.jogoId, resultado.motivo, agora)
      return { encerrar: true, motivo: resultado.motivo }
    }
    await registrarCiclo(db, e.jogoId, resultado.estado, e.ciclo + 1)
    return continuar(resultado.estado, false)
  } catch (erro) {
    console.error(
      JSON.stringify({
        evento: 'fire_live_ciclo_falhou',
        jogoId: e.jogoId,
        ciclo: e.ciclo,
        erro: erro instanceof Error ? erro.message.slice(0, 500) : String(erro),
      }),
    )
    return continuar(e.estadoAnterior, e.motorEncerrado)
  }
}
```

(Conferir se `jogos.status` usa o literal `'ENCERRADO'` e se `executarCiclo` recebe a fila na 3ª posição — é o que `src/workflows/fire-live.ts:117,131` faz hoje.)

- [ ] **Step 3: Workflow fino**

Em `src/workflows/fire-live.ts`: `runId` vem de `getWorkflowMetadata()` no corpo do workflow (já é lido para o lease), e é `null` quando não há `leaseToken`. O passo vira:

```ts
async function ciclarUmaVez(
  jogoId: string,
  runId: string | null,
  estadoAnterior: EstadoObservado | null,
  iniciadoEmIso: string,
  ciclo: number,
  motorEncerrado: boolean,
): Promise<RetornoPasso> {
  'use step'

  const db = getDb()
  return executarPassoFireLive(
    {
      db,
      ruleset: await rulesetAtivo(),
      fila: new FilaVercel(),
      agora: new Date(),
      ingerir: async (agora) => {
        const config = configDoAmbiente()
        if (!config || !config.habilitada) throw new Error('ingestão NBA indisponível durante o workflow')
        await executarSnapshotAoVivoDoJogo(db, montarFontes(db, config), jogoId, agora)
      },
    },
    { jogoId, runId, estadoAnterior, iniciadoEmIso, ciclo, motorEncerrado },
  )
}
```

e o laço chama `ciclarUmaVez(jogoId, runId, estado, iniciadoEmIso, ciclo, motorEncerrado)`, com `const runId = leaseToken ? getWorkflowMetadata().workflowRunId : null` antes do `if (leaseToken)`. Remover o tipo `RetornoPasso` local (vem de `passo.ts`) e os imports que ficaram sem uso (`eq`, `jogos`, `encerrarExecucao`, `executarCiclo`, `registrarCiclo`).

- [ ] **Step 4: Retomada — teste (falha)**

Em `src/modules/entrega/__tests__/inicio-fire-live.test.ts`:

```ts
  it('INICIADA sem batimento há mais de 3 ciclos é retomada; com batimento recente, não', async () => {
    const intervaloMs = ruleset.fire_live.observacao.intervalo_segundos * 1000
    await banco.db.insert(fireLiveExecucoes).values({
      jogoId,
      iniciadoEm: AGORA,
      estado: 'INICIADA',
      runId: 'run-velho',
      atualizadoEm: new Date(AGORA.getTime() - 3 * intervaloMs + 1_000),
    })
    expect(await reservarJogosParaObservar(banco.db, ruleset, AGORA)).toHaveLength(0)

    await banco.db
      .update(fireLiveExecucoes)
      .set({ atualizadoEm: new Date(AGORA.getTime() - 3 * intervaloMs - 1_000) })
      .where(eq(fireLiveExecucoes.jogoId, jogoId))
    const disparos = await reservarJogosParaObservar(banco.db, ruleset, AGORA)
    expect(disparos).toHaveLength(1)
    const [linha] = await banco.db.select().from(fireLiveExecucoes)
    expect(linha).toMatchObject({ estado: 'RESERVADA', runId: null })
  })
```

- [ ] **Step 5: Retomada — implementar**

Em `inicio.ts`, `export const CICLOS_SEM_BATIMENTO_PARA_RETOMAR = 3`. No UPDATE de retomada (l.95-127), o `where` passa a ser:

```ts
      and(
        inArray(fireLiveExecucoes.jogoId, idsEmJogo),
        or(
          and(
            isNull(fireLiveExecucoes.runId),
            or(
              eq(fireLiveExecucoes.estado, 'FALHOU_AO_INICIAR'),
              and(
                eq(fireLiveExecucoes.estado, 'RESERVADA'),
                or(isNull(fireLiveExecucoes.leaseExpiraEm), lte(fireLiveExecucoes.leaseExpiraEm, agora)),
              ),
            ),
          ),
          // Run que parou de bater (W2-3): o workflow morreu com a linha
          // INICIADA. Zera o run_id — o velho, se ainda vivo, perde o
          // próximo batimento e para.
          and(
            eq(fireLiveExecucoes.estado, 'INICIADA'),
            lte(
              fireLiveExecucoes.atualizadoEm,
              new Date(
                agora.getTime() -
                  CICLOS_SEM_BATIMENTO_PARA_RETOMAR * ruleset.fire_live.observacao.intervalo_segundos * 1000,
              ),
            ),
          ),
        ),
      ),
```

e o `set` ganha `runId: null, workflowIniciadoEm: null`. Atualizar o comentário do bloco ("`INICIADA` nunca é retomada" deixa de valer).

- [ ] **Step 6: Rodar**

Run: `npx vitest run src/modules/entrega/__tests__/passo-fire-live.test.ts src/modules/entrega/__tests__/inicio-fire-live.test.ts src/modules/entrega/__tests__/fire-live.test.ts && npm run typecheck && npm run boundaries`
Expected: verde, 0 erros.

---

### Task 7: Cron ao-vivo — reserva fora da ingestão, lateral fresca (W2-3, parte 2 + minor)

**Files:**
- Modify: `src/app/api/cron/ao-vivo/route.ts`
- Create: `src/app/api/cron/ao-vivo/__tests__/route.test.ts`

**Interfaces:** nenhuma nova; a rota passa a (1) reservar e iniciar os workflows mesmo quando a ingestão lança, relançando o erro da ingestão no fim, e (2) invalidar `TAG_LATERAL` quando a ingestão gravou algo (achado da revisão: na temporada, jogo fechado de madrugada só aparecia na lateral às 11:00 UTC).

- [ ] **Step 1: Teste (falha)**

```ts
// src/app/api/cron/ao-vivo/__tests__/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  executarJobComLease: vi.fn(),
  reservarJogosParaObservar: vi.fn(),
  iniciarWorkflowsReservados: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag, unstable_cache: (fn: unknown) => fn }))
vi.mock('workflow/api', () => ({ start: vi.fn() }))
vi.mock('@/workflows/fire-live', () => ({ fireLiveDoJogo: vi.fn() }))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))
vi.mock('@/modules/ingestao/jobs/contexto', () => ({
  contextoDoJob: async () => ({ agora: new Date('2026-11-04T01:00:00Z'), ruleset: { rodada: { fuso: 'America/New_York' } }, temporada: '2026-27', config: {} }),
}))
vi.mock('@/modules/ingestao/sincronizar/fonte', () => ({ montarFontes: () => ({}) }))
vi.mock('@/modules/ingestao/jobs/execucao', () => ({ executarJobComLease: m.executarJobComLease }))
vi.mock('@/modules/entrega/fire-live/inicio', () => ({
  reservarJogosParaObservar: m.reservarJogosParaObservar,
  iniciarWorkflowsReservados: m.iniciarWorkflowsReservados,
}))
vi.mock('@/modules/entrega/cron/guarda', () => ({
  executarCronProtegido: async (_r: Request, o: { tarefa: () => Promise<unknown> }) => {
    try {
      return Response.json(await o.tarefa())
    } catch (erro) {
      return Response.json({ erro: String(erro) }, { status: 500 })
    }
  },
}))

import { GET } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  m.reservarJogosParaObservar.mockResolvedValue([])
  m.iniciarWorkflowsReservados.mockResolvedValue({ iniciados: [], obsoletos: [], falhas: [] })
})

describe('cron ao-vivo', () => {
  it('ingestão falhando NÃO impede reservar e iniciar o Fire Live; a falha ainda aparece', async () => {
    m.executarJobComLease.mockRejectedValue(new Error('BDL 502'))
    const r = await GET(new Request('http://x/api/cron/ao-vivo'))
    expect(m.reservarJogosParaObservar).toHaveBeenCalled()
    expect(m.iniciarWorkflowsReservados).toHaveBeenCalled()
    expect(r.status).toBe(500)
  })

  it('ingestão que gravou algo invalida a lateral', async () => {
    m.executarJobComLease.mockResolvedValue({ executado: true, execucaoId: 'e', resultado: { snapshots: 3 } })
    await GET(new Request('http://x/api/cron/ao-vivo'))
    expect(m.revalidateTag).toHaveBeenCalledWith('lateral', 'max')
  })

  it('ingestão sem nada gravado não invalida', async () => {
    m.executarJobComLease.mockResolvedValue({ executado: true, execucaoId: 'e', resultado: { snapshots: 0 } })
    await GET(new Request('http://x/api/cron/ao-vivo'))
    expect(m.revalidateTag).not.toHaveBeenCalled()
  })
})
```

(Conferir o import de `dataReferenciaNba`/`executarJobAoVivo` de `@/modules/ingestao/jobs/orquestradores`: mockar esse módulo também, com `dataReferenciaNba: () => '2026-11-03'` e `executarJobAoVivo: vi.fn()`.)

Run → FAIL.

- [ ] **Step 2: Implementar**

```ts
      let erroDaIngestao: unknown = null
      const ingestao = await executarJobComLease(db, { /* igual */ }, async ({ confirmarLease }) => {
        await confirmarLease()
        return executarJobAoVivo(db, fontes, dataReferencia, contexto.agora)
      }).catch((erro: unknown) => {
        // A ingestão de TODOS os jogos não pode impedir o Fire Live de
        // começar (W2-3): o workflow tem ingestão própria por jogo.
        erroDaIngestao = erro
        return null
      })

      if (ingestao?.executado && Object.values(ingestao.resultado).some((v) => v > 0)) {
        // Jogo que fecha na madrugada precisa chegar à lateral agora, não
        // às 11:00 UTC do cron da rodada.
        revalidateTag(TAG_LATERAL, 'max')
      }

      const disparos = await reservarJogosParaObservar(db, contexto.ruleset, contexto.agora)
      const workflows = await iniciarWorkflowsReservados(/* igual */)
      if (erroDaIngestao) throw erroDaIngestao
      if (workflows.falhas.length > 0) throw new Error(`falharam ${workflows.falhas.length} inícios de workflow`)
```

Imports: `revalidateTag` de `next/cache`, `TAG_LATERAL` de `@/app/(app)/lateral/leitura`. Conferir o tipo de `ContagensJob` (valores numéricos) para o `some`.

`src/app/api/cron/__tests__/invalidacao-lateral.test.ts` exige a invalidação só de quem importa `executarJobRodada`/`simularAte`; não muda.

- [ ] **Step 3: Rodar**

Run: `npx vitest run src/app/api/cron` → verde.

---

### Task 8: BDL confere o quarto depois das estatísticas (W2-3, parte 3)

**Files:**
- Modify: `src/modules/ingestao/nba/adaptadores/balldontlie.ts:601-617`
- Test: o arquivo de testes do adaptador BallDontLie (localizar com `ls src/modules/ingestao/nba/**/__tests__/*balldontlie*`); se não houver teste de `boxScore`, criar `src/modules/ingestao/nba/adaptadores/__tests__/balldontlie-box-score.test.ts` usando o mesmo transporte falso que os testes vizinhos do adaptador usam para `buscarJogo`/`buscarStats`.

- [ ] **Step 1: Teste (falha)** — cenário: primeira leitura do jogo `in_progress, period 1`; estatísticas; segunda leitura `in_progress, period 2`. Esperado: `boxScore` **não** devolve linhas com `quarto: 1` (só os totais). Controle: as duas leituras em `period 1` → devolve totais + as mesmas linhas com `quarto: 1`.

- [ ] **Step 2: Implementar**

```ts
    if (jogo.status_state === 'in_progress' && jogo.period === 1) {
      // Durante o Q1 o acumulado do jogo é exatamente o split do primeiro
      // quarto. O endpoint `period=1` só é aceito depois do encerramento.
      // O quarto é conferido DE NOVO depois das estatísticas: se o Q2
      // começou entre as duas chamadas, o acumulado já não é Q1 (W2-3).
      const depois = await this.buscarJogo(jogoIdExterno)
      if (depois.status_state !== 'in_progress' || depois.period !== 1) return totais
      return [...totais, ...totais.map((linha) => ({ ...linha, quarto: 1 }))]
    }
```

- [ ] **Step 3: Rodar** os testes do adaptador → verde.

---

### Task 9: Odds antes da primeira publicação da Lista (W2-4)

**Files:**
- Modify: `src/modules/entrega/lista-secreta.ts:75-100` (opção `antesDaPrimeiraPublicacao`)
- Modify: `src/app/api/cron/lista-secreta/route.ts`
- Test: `src/modules/entrega/__tests__/lista-secreta.test.ts`

**Interfaces:**
- Produces: `publicarListaSecreta(db, ruleset, { …, antesDaPrimeiraPublicacao?: () => Promise<void> })` — chamada **uma vez por dia**: depois de passar a antecedência e só se ainda não há snapshot `LISTA_SECRETA` da data; antes de `montarFatos`/`enriquecer` (que leem `odds_agregada`). Falha do gancho é registrada e **não** impede a publicação.

**Decisão desta tarefa:** coletar só antes da primeira publicação (1 coleta extra/dia), não a cada 15 min. As odds do dia mudam pouco até o jogo, e cada coleta gasta cota das casas. O cron de 11:00 UTC continua.

- [ ] **Step 1: Testes (falham)** — no `describe('job diário da Lista Secreta')`:

```ts
  it('coleta odds antes da PRIMEIRA publicação do dia, e só dela', async () => {
    const gancho = vi.fn(async () => {})
    await publicarListaSecreta(banco.db, ruleset, { dataReferencia: HOJE, agora: CEDO_DEMAIS, antesDaPrimeiraPublicacao: gancho })
    expect(gancho).not.toHaveBeenCalled()

    await publicarListaSecreta(banco.db, ruleset, { dataReferencia: HOJE, agora: UMA_HORA_ANTES, antesDaPrimeiraPublicacao: gancho })
    await publicarListaSecreta(banco.db, ruleset, { dataReferencia: HOJE, agora: new Date(`${HOJE}T22:30:00.000Z`), antesDaPrimeiraPublicacao: gancho })
    expect(gancho).toHaveBeenCalledTimes(1)
  })

  it('coleta de odds falhando não impede a publicação', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const r = await publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: UMA_HORA_ANTES,
      antesDaPrimeiraPublicacao: async () => { throw new Error('casa fora') },
    })
    expect(r.publicou).toBe(true)
    erro.mockRestore()
  })
```

(Importar `vi` de `vitest` se o arquivo não importa.)

- [ ] **Step 2: Implementar** — em `publicarListaSecreta`, logo depois do bloco de antecedência:

```ts
  if (opcoes.antesDaPrimeiraPublicacao) {
    const [jaPublicada] = await db
      .select({ id: feedSnapshot.id })
      .from(feedSnapshot)
      .where(and(eq(feedSnapshot.dataReferencia, opcoes.dataReferencia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')))
      .limit(1)
    if (!jaPublicada) {
      // As odds do card são gravadas NA publicação (oddFaixa no snapshot).
      // Colhidas só às 11:00 UTC, a linha da noite podia não existir ainda
      // (W2-4). A publicação nunca depende disso.
      await opcoes.antesDaPrimeiraPublicacao().catch((erro: unknown) => {
        console.error(JSON.stringify({ evento: 'odds_antes_da_lista_falhou', erro: String(erro) }))
      })
    }
  }
```

(Se `feedSnapshot` não tiver coluna `id`, selecionar `hash`.)

No cron `lista-secreta/route.ts`, passar:

```ts
        antesDaPrimeiraPublicacao: async () => {
          const fontes = fontesDeOdds()
          if (fontes.length === 0) return
          const db = getDb()
          await executarJobComLease(
            db,
            { job: 'coletar-odds', janelaInicio: dataReferencia, janelaFim: dataReferencia, temporada: temporadaDe(ruleset, dataReferencia), origem: 'CRON', leaseMs: ORCAMENTO_ODDS_MS + 20_000 },
            async ({ confirmarLease }) => {
              await confirmarLease()
              return (await coletarOddsDoDia(db, ruleset, dataReferencia, agora, fontes, { prazo: new Date(Date.now() + ORCAMENTO_ODDS_MS) })).contagens
            },
          )
        },
```

com `const ORCAMENTO_ODDS_MS = 100_000` (o mesmo de `sincronizar-rodada`, que roda sob `maxDuration = 300`; sobram 200 s para a publicação e a narrativa). `temporada`: usar a mesma fonte que `sincronizar-rodada` usa (`contexto.temporada`, de `contextoDoJob()`) — se o cron da lista não tiver esse contexto, chamar `contextoDoJob()` dentro do gancho. Imports: `fontesDeOdds` de `@/modules/ingestao/odds/fontes`, `coletarOddsDoDia` de `@/modules/ingestao/odds/coleta-do-dia`, `executarJobComLease` de `@/modules/ingestao/jobs/execucao`.

- [ ] **Step 3: Rodar**

Run: `npx vitest run src/modules/entrega/__tests__/lista-secreta.test.ts src/modules/entrega/__tests__/narrativa-publicacao.test.ts src/app/api/cron && npm run boundaries` → verde.

---

### Task 10: Atualização ao vivo com jitter, `workflow` 4.8.9 (W2-6, parte 1)

**Files:**
- Modify: `src/components/AtualizarAoVivo.tsx`
- Create: `src/components/__tests__/atualizar-ao-vivo.test.ts`
- Modify: `package.json` / `package-lock.json` (`workflow`)
- Modify: `src/app/__tests__/cabecalhos-seguranca.test.ts` (versão do `next` como piso)

**Interfaces:** `proximoIntervalo(baseMs: number, aleatorio: () => number): number` exportada de `AtualizarAoVivo.tsx`.

- [ ] **Step 1: Teste (falha)**

```ts
import { describe, expect, it } from 'vitest'
import { proximoIntervalo } from '../AtualizarAoVivo'

describe('jitter do ao vivo', () => {
  it('fica em base ± 10 s', () => {
    expect(proximoIntervalo(30_000, () => 0)).toBe(20_000)
    expect(proximoIntervalo(30_000, () => 0.5)).toBe(30_000)
    expect(proximoIntervalo(30_000, () => 0.999999)).toBeLessThanOrEqual(40_000)
  })
  it('nunca abaixo de 5 s, mesmo com base pequena', () => {
    expect(proximoIntervalo(8_000, () => 0)).toBe(5_000)
  })
})
```

- [ ] **Step 2: Implementar**

```ts
const JITTER_MS = 10_000
const MINIMO_MS = 5_000

/**
 * ±10 s sobre a base: 2 mil telas abertas no mesmo apito não batem todas no
 * mesmo segundo (W2-6).
 */
export function proximoIntervalo(baseMs: number, aleatorio: () => number = Math.random): number {
  return Math.max(MINIMO_MS, Math.round(baseMs - JITTER_MS + aleatorio() * 2 * JITTER_MS))
}
```

No `useEffect`, trocar `setInterval` por um `setTimeout` encadeado:

```ts
    let id: ReturnType<typeof setTimeout>
    const agendar = () => {
      id = setTimeout(() => {
        atualizarSeVisivel()
        agendar()
      }, proximoIntervalo(intervaloMs))
    }
    agendar()
    document.addEventListener('visibilitychange', atualizarSeVisivel)
    return () => {
      clearTimeout(id)
      document.removeEventListener('visibilitychange', atualizarSeVisivel)
    }
```

O `<span hidden data-atualiza-ao-vivo={intervaloMs} />` continua com a base (os testes de fumaça leem esse valor).

- [ ] **Step 3: `workflow` 4.8.9**

Run: `npm install workflow@4.8.9 --save-exact=false` (mantém `^`); conferir `package-lock.json` com `workflow` 4.8.9 e `@workflow/core` correspondente. Se a versão não existir no registro, parar e registrar no ledger — não escolher outra sem o parceiro.

- [ ] **Step 4: Teste do `next` como piso**

Em `src/app/__tests__/cabecalhos-seguranca.test.ts`, a asserção literal da versão do `next` passa a conferir `>= 16.3.6` (achado Minor 4 da revisão): ler `package.json`, tirar `^`/`~`, comparar major/minor/patch numericamente.

- [ ] **Step 5: Rodar**

Run: `npx vitest run src/components src/app/__tests__/cabecalhos-seguranca.test.ts src/app/__tests__/telas-04-fire-live.test.ts && npm run typecheck`
(Se o nome do teste de tela do Fire Live for outro, localizar com `grep -l "data-atualiza-ao-vivo" src/app/__tests__/*`.)

---

### Task 11: Limpeza semanal (W2-6, parte 2)

**Files:**
- Create: `src/modules/plataforma/limpeza.ts`
- Create: `src/modules/plataforma/__tests__/limpeza.test.ts`
- Create: `src/app/api/cron/limpeza/route.ts`
- Modify: `vercel.ts` (`cronsDoPlano()`, só no conjunto Pro)

**Interfaces:** `limparRegistrosVencidos(db: Db, agora: Date): Promise<{ sessoes: number; tentativasLogin: number; tentativasOperacao: number; inscricoesInvalidadas: number }>`.

**Retenção (operacional, não regra de negócio — registrar na §8 para o parceiro confirmar):** tentativas de login e de operação: 7 dias (as janelas vão até 60 min); sessões encerradas ou expiradas: 30 dias; inscrições de push invalidadas: 30 dias. `eventos_conta` e auditorias **não** são tocadas.

- [ ] **Step 1: Teste (falha)** — PGlite: semear 1 linha antiga e 1 recente de cada tipo (sessão encerrada há 31 d e há 1 d; sessão ativa antiga com `expira_em` no futuro — **não** pode sair; tentativa de login há 8 d e há 1 h; tentativa de operação idem; inscrição invalidada há 31 d e há 1 d; inscrição ativa antiga — não sai). Esperado: sai só a antiga de cada tipo, e o retorno conta 1 em cada campo. Usar os helpers de criação de usuário/dispositivo/sessão do `src/modules/entrega/push/__tests__/fanout.test.ts` (`prepararConta`), copiados para o arquivo novo.

- [ ] **Step 2: Implementar**

```ts
import { and, isNotNull, lt, or } from 'drizzle-orm'

import { pushInscricoes, sessoes, tentativasLogin, tentativasOperacaoConta } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'

const DIA = 24 * 3600_000
const RETENCAO_TENTATIVAS_MS = 7 * DIA
const RETENCAO_SESSOES_MS = 30 * DIA
const RETENCAO_INSCRICOES_MS = 30 * DIA

/**
 * Tabelas que só crescem (W2-6). As contagens de limite leem janelas de até
 * 60 min; sessão encerrada e inscrição invalidada só servem para investigar
 * um caso recente. A trilha de auditoria (eventos_conta, auditoria de push)
 * fica — ela é o registro.
 */
export async function limparRegistrosVencidos(db: Db, agora: Date) {
  const antes = (ms: number) => new Date(agora.getTime() - ms)
  const tentativasLoginApagadas = await db
    .delete(tentativasLogin)
    .where(lt(tentativasLogin.tentadoEm, antes(RETENCAO_TENTATIVAS_MS)))
    .returning({ id: tentativasLogin.id })
  const tentativasOperacaoApagadas = await db
    .delete(tentativasOperacaoConta)
    .where(lt(tentativasOperacaoConta.tentadoEm, antes(RETENCAO_TENTATIVAS_MS)))
    .returning({ id: tentativasOperacaoConta.id })
  const sessoesApagadas = await db
    .delete(sessoes)
    .where(
      or(
        and(isNotNull(sessoes.encerradaEm), lt(sessoes.encerradaEm, antes(RETENCAO_SESSOES_MS))),
        lt(sessoes.expiraEm, antes(RETENCAO_SESSOES_MS)),
      ),
    )
    .returning({ id: sessoes.id })
  const inscricoesApagadas = await db
    .delete(pushInscricoes)
    .where(and(isNotNull(pushInscricoes.invalidadaEm), lt(pushInscricoes.invalidadaEm, antes(RETENCAO_INSCRICOES_MS))))
    .returning({ id: pushInscricoes.id })
  return {
    sessoes: sessoesApagadas.length,
    tentativasLogin: tentativasLoginApagadas.length,
    tentativasOperacao: tentativasOperacaoApagadas.length,
    inscricoesInvalidadas: inscricoesApagadas.length,
  }
}
```

(Conferir os nomes exportados das tabelas em `src/modules/dominio/db/schema/plataforma.ts` — `tentativas_operacao_conta` pode estar exportada com outro identificador — e se alguma FK para `sessoes` não é `cascade`; se houver FK restritiva, o teste acusa.)

Rota `src/app/api/cron/limpeza/route.ts` no padrão de `saude/route.ts`: `executarCronProtegido(requisicao, { rota: '/api/cron/limpeza', tarefa: () => limparRegistrosVencidos(getDb(), new Date()), quantidade: (r) => r.sessoes + r.tentativasLogin + r.tentativasOperacao + r.inscricoesInvalidadas })`, `maxDuration = 60`.

`vercel.ts`, em `cronsDoPlano()`, só no ramo `CRON_COMPLETO === 'true'`: `{ path: '/api/cron/limpeza', schedule: '0 8 * * 1' }` (segunda, 08:00 UTC, fora da janela de jogos). O Hobby continua com 2 crons. Atualizar o teste que conta os crons (localizar com `grep -rl "cronsDoPlano\|crons" src/**/__tests__`) de 7 para 8.

- [ ] **Step 3: Rodar** `npx vitest run src/modules/plataforma/__tests__/limpeza.test.ts` e o teste dos crons → verde.

---

### Task 12: Minors da revisão final

**Files:**
- Modify: `src/modules/plataforma/afiliados/servico.ts` (l.366-430, 602-620), `src/app/r/[codigo]/route.ts`, `src/app/ir/[codigo]/route.ts`
- Modify: `src/modules/ingestao/llm/openrouter.ts:24-32,84-124`, `src/modules/ingestao/llm/porta.ts:22-28`, `src/modules/entrega/chat.ts`
- Modify: `src/modules/plataforma/assinatura/webhook.ts:471`, `src/modules/plataforma/afiliados/servico.ts:301-302,428-430,965`
- Tests: `src/app/r/[codigo]/__tests__/route.test.ts`, `src/app/ir/[codigo]/__tests__/route.test.ts`, `src/modules/entrega/__tests__/chat.test.ts`, teste de fonte das travas

**12a — Afiliados, configuração lida uma vez.** `resolverLinkSemRegistrar` e `resolverDestinoDaCasaSemRegistrar` passam a devolver `{ destino: string; configuracao: ConfiguracaoDoLink }` (o tipo é o retorno de `configuracaoDoLink`, exportá-lo). `registrarClique` e `registrarSaidaParaCasa` ganham `configuracao?: ConfiguracaoDoLink` na entrada e só chamam `configuracaoDoLink` quando ela não vem. As rotas passam a configuração do primeiro passo. Teste: nos dois `route.test.ts`, o mock de `configuracaoDoLink`/resolvedor é chamado uma vez por clique; o comportamento de redirect com o insert falhando (Onda 1) continua.

**12b — Chat, resposta truncada é falha.** `TextoGerado` ganha `truncado: boolean`; o schema do OpenRouter lê `finish_reason: z.string().nullish()` em `choices[]`, e `truncado = choices[0]?.finish_reason === 'length'`. Em `chat.ts`, resposta com `truncado` segue o caminho de reprovação (grava `falhou_em`, conta no minuto, devolve `indisponivel`). Teste em `chat.test.ts`: `LLMFake` devolvendo `truncado: true` → `{ ok: false, motivo: 'indisponivel' }` e a mensagem com `falhouEm` preenchido. Atualizar `LLMFake` e demais implementações de `PortaLLM` para devolver `truncado: false`.

**12c — Travas com namespace.** Toda `pg_advisory_xact_lock(hashtext(x))` de chave de negócio passa à forma de duas chaves `pg_advisory_xact_lock(<namespace int>, hashtext(x))`, com os namespaces numa constante única `src/modules/dominio/db/travas.ts`: `export const TRAVA = { PAGAMENTO: 1, AFILIADO_VISITANTE: 2, AFILIADO_USUARIO: 3, SAIDA_DO_APITO: 4, PUSH_ENDPOINT: 5 } as const`. Aplicar em `webhook.ts:471`, `servico.ts:301-302,428-430,965` e `plataforma/push/inscricoes.ts:80`. Teste de fonte: nenhum `pg_advisory_xact_lock(hashtext(` de um argumento sobra em `src/modules` (fora de `__tests__`). As travas de `locks_ingestao` (tabela, não advisory) não mudam. Deploy: por alguns segundos, instâncias velha e nova usam chaves diferentes — a UNIQUE e o `onConflictDoNothing` continuam protegendo; registrar na §8.

- [ ] **Step 1–3:** para cada item, teste → ver falhar → implementar → ver passar, na ordem 12a, 12b, 12c.
- [ ] **Step 4: Rodar** `npx vitest run src/app/r src/app/ir src/modules/plataforma/__tests__ src/modules/entrega/__tests__/chat.test.ts src/app/api/chat && npm run typecheck && npm run boundaries`.

---

### Task 13: Bateria, registro e commit único

**Files:**
- Modify: spec — acrescentar "§9 Achados da Onda 2"
- Modify: este plano ("Desvios")

- [ ] **Step 1: Estáticos** — `npm run typecheck && npm run lint && npm run boundaries` → 0 erros.
- [ ] **Step 2: Suíte em lotes de 12** — mesmo procedimento da Onda 1 (lista em `.superpowers/sdd/2026-09-23-prontidao-onda-2/arquivos-de-teste.txt`, um processo por lote, parar se `df` < 2 GB). Esperado: tudo verde, exceto `telas-04-detalhe` pelo `%`; provar como na Onda 1 (versão do HEAD no lugar, 24/24, restaurar e conferir com `cmp`).
- [ ] **Step 3: Build** — `DATABASE_URL=postgres://x:y@127.0.0.1:1/db DATABASE_URL_UNPOOLED=postgres://x:y@127.0.0.1:1/db npx next build` → 0. **Nunca** sem as variáveis (o `.env.local` aponta para o Neon).
- [ ] **Step 4: §9 da spec** — desvios, a meta revista da Lista (17 → 12), as retenções da limpeza e o canal de alerta (webhook genérico) para o parceiro confirmar, as variáveis novas (`ALERTA_WEBHOOK_URL`), o cron novo (Pro), e o que ficou de fora.
- [ ] **Step 5: Commit único, separando o `%`**

`apito/[jogadorId]/page.tsx` tem a mudança desta onda **e** o `%` de outra entrega. Stage só a desta onda:

```bash
F="src/app/(app)/apito/[jogadorId]/page.tsx"
cp "$F" "$SCRATCH/apito-completo.tsx"
git show HEAD:"$F" > "$SCRATCH/apito-head.tsx"
# aplicar sobre a versão do HEAD SÓ as mudanças desta onda (imports + as duas chamadas),
# gravar em "$F", `git add -- "$F"`, e devolver a cópia completa:
cp "$SCRATCH/apito-completo.tsx" "$F"
git diff -- "$F"   # deve sobrar exatamente a linha do %
```

Depois, `git add` de cada arquivo desta onda, um a um (nunca `scripts/_*`), `git status --short` para conferir, e `git commit -F <mensagem em português, no estilo do repo, terminando com a linha Co-Authored-By>`. Sem push.

- [ ] **Step 6: Revisão final da branch** (range `f7c8093..HEAD`) com `superpowers:requesting-code-review`.

---

## Fora deste plano

- **Fila da reconciliação** (spec §5, item 4): encerrar mensal `pending` e PIX recusado depois de 7 dias — aguardando o parceiro.
- **G8** (canal definitivo do alerta): o webhook genérico cobre até a decisão.
- Teste de carga (exige banco de staging).
- `pushsubscriptionchange` no service worker (a inscrição trocada pelo navegador só volta pelo reenvio diário da Tarefa 2).

## Desvios

- Commits WIP por tarefa, com squash num commit único no fim (preferência do parceiro).
- O `%` do apito foi guardado num patch e reaplicado depois do commit.
- T13 reordenada: bateria e revisão final antes do squash.
- T1: `computouAgora`, marcado depois do await (correção da revisão final).
- T3: VAPID global republica só as recusadas e os retries, e a maioria é contada por origem.
- T4: plano congelado, chave de lote pela faixa e `DuplicateMessageError` como sucesso.
- T6: batimento no catch e fencing por `run_id`.
- T9: o gancho de odds roda depois do "sem-lista-ativa".
- Revisão final: invalidação logo depois de gravar o snapshot, alerta de push vencido na expansão
  e narrativa truncada reprovada.
- Detalhes na §9 da spec.
