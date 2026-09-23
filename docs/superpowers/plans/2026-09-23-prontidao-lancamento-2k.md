# Prontidão para o lançamento (Onda 1) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar, em código, os bloqueios da auditoria de 23/09 que derrubam ou deixam caro o lançamento pago de ~02/10 com 2 mil usuários simultâneos.

**Architecture:** onze correções pequenas e independentes, uma por área (banco, limite de cadastro, sessão, chat, login, pagamento, cabeçalhos, demo, portão, afiliados, agregados), cada uma com teste PGlite ou de fonte que falha antes e passa depois. Nada no motor nem no ruleset. Duas migrações aditivas (índices e uma coluna nula).

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, Neon (`@neondatabase/serverless` Pool), PGlite nos testes, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-23-prontidao-lancamento-2k-design.md`](../specs/2026-09-23-prontidao-lancamento-2k-design.md) — a §3 é a fonte de cada tarefa.

## Global Constraints

- Branch `prontidao-lancamento-2k`, no checkout principal. **Nenhum commit por tarefa**: um único commit no fim (T12) — preferência registrada do parceiro. Nunca `push`.
- `src/modules/motor/**` e `config/ruleset.v1.yaml` não mudam.
- Nenhum módulo em `src/modules/**` importa `next/cache` ou `next/*`; cache fica em `src/app/**`.
- Migração nova só com `npm run db:generate` (gera o `.sql` e o `down`). Não rodar `db:migrate` — o banco de `.env.local` é PRODUÇÃO.
- Nunca conectar ao Neon, nunca subir `next dev` contra ele.
- Disco apertado: rodar testes por arquivo; a suíte completa só em T12, em lotes (ver T12).
- `src/app/(app)/apito/[jogadorId]/page.tsx` tem um `%` não commitado de outra entrega: **não tocar, não adicionar ao stage**. O teste `telas-04-detalhe` falha por causa dele — não é regressão desta branch.
- Valores da spec, copiados: pool padrão `5`, espera `5_000` ms; CADASTRO `{ max 5, maxPorIp 30, 1 h }`, CHECKOUT `{ max 5, maxPorIp 30, 15 min }`, CANCELAMENTO `{ max 3, maxPorIp 3, 15 min }`; `ultimo_uso` só grava após `60` s; `FALHAS_DEVOLVIDAS_POR_DIA = 3`; chat `maxTokens 350`, modelos `deepseek/deepseek-v4-flash`, `openai/gpt-4o-mini`; login `50` falhas/IP/15 min; reconciliação: abandono após `7` dias, prioridade para as últimas `48` h; `next` `^16.3.6`.
- Comentários em português, no tom do arquivo tocado (explicam o PORQUÊ).

## Review Focus

1. Pessoa atrás de CGNAT que erra a senha uma vez e acerta na segunda, com outras pessoas do mesmo IP errando na janela (abaixo do teto): não pode ser barrada — só falhas contam no teto por IP, e ele é folgado. Com o IP JÁ no teto, todos ali são barrados até a janela andar; é o custo aceito de qualquer teto por IP — teste em T5.
2. Assinante com o chat caindo por falha do provedor o dia inteiro: as três primeiras falhas não gastam cota, e a pergunta falha some do histórico — testes em T4.
3. Link de afiliado inválido ou desativado continua indo para `/oferta-indisponivel` (a correção só vale para falha de REGISTRO) — teste em T10.
4. Mensal autorizado nunca vira `ENCERRADA` pela reconciliação (as renovações dependem da rede de segurança) — teste em T6.
5. `/redefinir/:token` continua com `Referrer-Policy: no-referrer` depois do cabeçalho global — teste em T7.

---

### Task 1: Pool do banco que não derruba a instância

**Files:**
- Modify: `src/modules/dominio/db/cliente.ts`
- Test: `src/modules/dominio/__tests__/cliente-pool.test.ts` (novo)

**Interfaces:**
- Produces: `opcoesDoPool(ambiente): { max: number; idleTimeoutMillis: number; connectionTimeoutMillis: number }` e `criarPool(url: string, ambiente?): Pool`, exportadas de `cliente.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/dominio/__tests__/cliente-pool.test.ts
import { describe, expect, it, vi } from 'vitest'

import { criarPool, opcoesDoPool } from '../db/cliente'

describe('pool do banco', () => {
  it('o máximo vem de DB_POOL_MAX, com 5 como padrão', () => {
    expect(opcoesDoPool({}).max).toBe(5)
    expect(opcoesDoPool({ DB_POOL_MAX: '8' }).max).toBe(8)
    expect(opcoesDoPool({ DB_POOL_MAX: 'abc' }).max).toBe(5)
    expect(opcoesDoPool({ DB_POOL_MAX: '0' }).max).toBe(5)
    expect(opcoesDoPool({}).connectionTimeoutMillis).toBe(5_000)
  })

  it('erro de conexão ociosa é registrado, não derruba o processo', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // Pool não conecta até a primeira consulta: nada vai à rede aqui.
    const pool = criarPool('postgres://u:s@127.0.0.1:1/db', {})
    expect(pool.listenerCount('error')).toBe(1)
    expect(() => pool.emit('error', new Error('conexão ociosa caiu'))).not.toThrow()
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/dominio/__tests__/cliente-pool.test.ts`
Expected: FAIL — `criarPool`/`opcoesDoPool` não exportados.

- [ ] **Step 3: Implement**

Em `cliente.ts`, substituir o corpo de criação do pool por:

```ts
/**
 * O POOL É POR INSTÂNCIA, E A INSTÂNCIA É COMPARTILHADA.
 *
 * No Fluid Compute dezenas de requisições dividem a mesma instância, e cada
 * uma dispara de 4 a 9 consultas em paralelo. Com 2 conexões, uma lentidão do
 * Neon virava fila de 10 s e depois 500 em massa (auditoria de 23/09). A URL
 * é a do pooler do Neon (PgBouncer, modo transação): conexão de cliente é
 * barata lá, o custo no Postgres é por consulta. `DB_POOL_MAX` existe para
 * ajustar no dia sem deploy de código.
 */
export function opcoesDoPool(ambiente: Readonly<Record<string, string | undefined>>) {
  const bruto = Number(ambiente.DB_POOL_MAX)
  const max = Number.isInteger(bruto) && bruto > 0 ? bruto : 5
  return { max, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 }
}

export function criarPool(
  url: string,
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): Pool {
  const pool = new Pool({ connectionString: url, ...opcoesDoPool(ambiente) })
  // O driver emite `error` quando uma conexão OCIOSA cai (restart do compute,
  // rede). Sem ouvinte, o EventEmitter lança e derruba a instância inteira —
  // junto com as requisições em andamento nela. O README do pacote manda ter.
  pool.on('error', (erro: Error) => {
    console.error(JSON.stringify({ evento: 'pool_erro', mensagem: erro.message }))
  })
  return pool
}
```

E em `criarDb()`: manter a checagem de `DATABASE_URL` e `neonConfig.webSocketConstructor = ws`, e trocar o `new Pool({...})` por `const pool = criarPool(url)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/dominio/__tests__/cliente-pool.test.ts` → PASS.
Run: `npm run typecheck` → sem erros.

---

### Task 2: Cadastro e checkout com dois tetos (e-mail estrito, IP folgado)

**Files:**
- Modify: `src/modules/plataforma/assinatura/operacoes.ts:7-42`
- Modify: `src/modules/plataforma/assinatura/checkout.ts:283-297` (bloco `if ('pronta' in reserva)`)
- Modify: `src/modules/dominio/db/schema/plataforma.ts:302-304` (índice)
- Create: migração gerada em `drizzle/` + `drizzle/down/`
- Test: `src/modules/plataforma/__tests__/operacoes-limite.test.ts` (novo)

**Interfaces:**
- Produces: `PoliticaOperacao = { maxTentativas: number; maxPorIp: number; janelaMs: number }`. `excedeuOperacoes` mantém a assinatura atual.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/plataforma/__tests__/operacoes-limite.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { tentativasOperacaoConta, usuarios } from '../../dominio/db/schema'
import { cadastrarUsuario } from '../assinatura/cadastro'
import type { ConfiguracaoProdutoPago } from '../assinatura/configuracao'
import { excedeuOperacoes, registrarOperacao } from '../assinatura/operacoes'

const AGORA = new Date('2026-10-02T15:00:00.000Z')
const IP_CGNAT = '177.20.0.1'
const config: ConfiguracaoProdutoPago = {
  checkoutHabilitado: true,
  cadastroPublicoHabilitado: true,
  frequencia: 1,
  tipoFrequencia: 'months',
  moeda: 'BRL',
  urlPublica: 'https://app.example.com',
  hostsPermitidos: new Set(['app.example.com']),
}

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())
beforeEach(async () => {
  await banco.db.delete(tentativasOperacaoConta)
  await banco.db.delete(usuarios)
})

const cadastrar = (n: number, ip = IP_CGNAT) =>
  cadastrarUsuario(
    banco.db,
    config,
    { nome: `Pessoa ${n}`, email: `pessoa${n}@exemplo.com`, senha: 'senha-forte-123' },
    { ip, agora: AGORA },
  )

describe('limite de cadastro atrás do mesmo IP (CGNAT)', () => {
  it('a sexta pessoa do mesmo IP se cadastra', async () => {
    for (let n = 1; n <= 6; n++) expect((await cadastrar(n)).ok).toBe(true)
  })

  it('o teto por IP existe: a 31ª do mesmo IP na hora é barrada', async () => {
    for (let n = 1; n <= 30; n++) expect((await cadastrar(n)).ok).toBe(true)
    expect(await cadastrar(31)).toEqual({ ok: false, motivo: 'limite' })
  })

  it('o teto por e-mail continua estrito, mesmo trocando de IP', async () => {
    for (let n = 1; n <= 5; n++) {
      await registrarOperacao(banco.db, {
        operacao: 'CADASTRO',
        identificador: 'alvo@exemplo.com',
        ip: `10.0.0.${n}`,
        sucesso: false,
        agora: AGORA,
      })
    }
    expect(
      await excedeuOperacoes(banco.db, 'CADASTRO', 'alvo@exemplo.com', AGORA, undefined, '10.0.0.99'),
    ).toBe(true)
  })
})
```

E, em `src/modules/plataforma/__tests__/checkout-sku.test.ts`, acrescentar ao fim (usa o `comprar`/`config`/`precos` do arquivo):

```ts
describe('reabrir um checkout pronto', () => {
  it('não gasta o limite de checkout', async () => {
    const porta = new PagamentoFake()
    // Seis reaberturas da MESMA compra: o limite é 5, e só a primeira
    // criação é uma operação nova.
    for (let i = 0; i < 6; i++) {
      const { resultado } = await comprar('MVP_MENSAL', porta)
      expect(resultado.status).toBe('PRONTO')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/plataforma/__tests__/operacoes-limite.test.ts src/modules/plataforma/__tests__/checkout-sku.test.ts`
Expected: FAIL — "a sexta pessoa" recebe `limite`; a 6ª reabertura lança `LimiteOperacaoError`. (Se `comprar` do arquivo não aceitar a porta como 2º argumento, ele já aceita: `comprar(sku, porta = new PagamentoFake())`.)

- [ ] **Step 3: Implement**

`operacoes.ts`:

```ts
/**
 * DOIS TETOS, NÃO UM (auditoria de 23/09, decisão D2 da spec).
 *
 * O teto por IDENTIFICADOR (e-mail, usuário) é estrito: é ele que freia quem
 * insiste na mesma conta. O teto por IP é folgado de propósito: no Brasil o
 * celular sai por CGNAT, milhares de pessoas atrás do mesmo IPv4. Com um teto
 * único de 5 somando os dois, a sexta pessoa de uma operadora na mesma hora
 * via "Muitas tentativas" e não comprava. Abuso volumétrico é trabalho do
 * firewall da Vercel, não desta tabela.
 */
export type PoliticaOperacao = { maxTentativas: number; maxPorIp: number; janelaMs: number }

export const POLITICAS_OPERACAO = {
  CADASTRO: { maxTentativas: 5, maxPorIp: 30, janelaMs: 60 * 60_000 },
  CHECKOUT: { maxTentativas: 5, maxPorIp: 30, janelaMs: 15 * 60_000 },
  CANCELAMENTO: { maxTentativas: 3, maxPorIp: 3, janelaMs: 15 * 60_000 },
} as const satisfies Record<string, PoliticaOperacao>
```

E o corpo de `excedeuOperacoes` (mesma assinatura):

```ts
  const desde = new Date(agora.getTime() - politica.janelaMs)
  const contar = async (filtro: SQL) => {
    const [linha] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(tentativasOperacaoConta)
      .where(
        and(
          eq(tentativasOperacaoConta.operacao, operacao),
          filtro,
          gte(tentativasOperacaoConta.tentadoEm, desde),
        ),
      )
    return linha?.total ?? 0
  }
  const porIdentificador = await contar(
    eq(tentativasOperacaoConta.identificadorHash, hashIdentificador(identificador)),
  )
  if (porIdentificador >= politica.maxTentativas) return true
  if (!ip) return false
  return (await contar(eq(tentativasOperacaoConta.ip, ip))) >= politica.maxPorIp
```

Ajustar o import: `import { and, eq, gte, sql, type SQL } from 'drizzle-orm'` (sai `or`).

`checkout.ts`, bloco `if ('pronta' in reserva)`: remover a chamada `await registrarOperacao(db, {...sucesso: true...})` e deixar um comentário:

```ts
  if ('pronta' in reserva) {
    // Reabrir a MESMA compra não é operação nova: quem volta do Mercado Pago
    // e clica "Assinar" de novo não pode gastar o limite (auditoria 23/09).
    return {
```

Schema, no `tentativasOperacaoConta`:

```ts
  (t) => [
    index('tentativas_operacao_conta_janela_idx').on(t.operacao, t.identificadorHash, t.tentadoEm),
    index('tentativas_operacao_conta_ip_idx').on(t.operacao, t.ip, t.tentadoEm),
  ],
```

Gerar: `npm run db:generate`. Conferir que apareceu `drizzle/0030_*.sql` com só o `CREATE INDEX` e o `drizzle/down/0030_*.sql` correspondente (`DROP INDEX`). Se o gerador pedir interação, parar e reportar.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/plataforma/__tests__/operacoes-limite.test.ts src/modules/plataforma/__tests__/checkout-sku.test.ts src/modules/plataforma/__tests__/spec04.test.ts src/modules/dominio/__tests__/persistencia.test.ts`
Expected: PASS (a `persistencia` confirma que sobe e desce com a migração nova).

---

### Task 3: Sessão sem escrita a cada visualização

**Files:**
- Modify: `src/modules/plataforma/auth/sessao.ts` (bloco `if (linha.sessao.dispositivoId)` em `validarSessao`)
- Modify: `src/modules/plataforma/auth/cookies.ts` (`sessaoAtual`)
- Test: `src/modules/plataforma/__tests__/sessao-ultimo-uso.test.ts` (novo)

**Interfaces:**
- Produces: `INTERVALO_ULTIMO_USO_MS = 60_000` exportado de `sessao.ts`. `sessaoAtual` mantém a assinatura `() => Promise<Sessao | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/plataforma/__tests__/sessao-ultimo-uso.test.ts
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { dispositivos } from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { autenticar, validarSessao } from '../auth/sessao'

const T0 = new Date('2026-10-02T15:00:00.000Z')
const depois = (ms: number) => new Date(T0.getTime() + ms)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

describe('último uso do dispositivo', () => {
  it('só grava de novo depois de 60 s', async () => {
    await adicionarUsuario(banco.db, { email: 'uso@exemplo.com', senha: 'senha-segura-123', nome: 'Uso' })
    const login = await autenticar(
      banco.db,
      { email: 'uso@exemplo.com', senha: 'senha-segura-123' },
      { fingerprint: 'fp-1', tipo: 'DESKTOP', userAgent: null, ip: '1.1.1.1' },
      T0,
    )
    if (!login.ok) throw new Error('login deveria passar')
    const ultimo = async () =>
      (await banco.db.select().from(dispositivos).where(eq(dispositivos.id, login.dispositivoId)))[0]!
        .ultimoUso

    await validarSessao(banco.db, login.token, depois(30_000), { ip: '1.1.1.1' })
    expect((await ultimo())?.toISOString()).toBe(T0.toISOString())

    await validarSessao(banco.db, login.token, depois(61_000), { ip: '1.1.1.1' })
    expect((await ultimo())?.toISOString()).toBe(depois(61_000).toISOString())
  })

  it('sessaoAtual é memorizada por requisição', () => {
    const fonte = readFileSync('src/modules/plataforma/auth/cookies.ts', 'utf8')
    expect(fonte).toMatch(/import \{ cache \} from 'react'/)
    expect(fonte).toMatch(/export const sessaoAtual = cache\(/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/plataforma/__tests__/sessao-ultimo-uso.test.ts`
Expected: FAIL — a validação a 30 s regrava `ultimoUso`; e a fonte ainda tem `export async function sessaoAtual`.

- [ ] **Step 3: Implement**

`sessao.ts` — constante perto de `JANELA_USO_SIMULTANEO_MS`:

```ts
/**
 * Com que frequência o "último uso" do dispositivo é regravado.
 *
 * Ele só alimenta `detectarUsoSimultaneo`, que olha uma janela de 5 min.
 * Gravar a cada requisição era uma escrita por visualização — ~80 por
 * segundo com 2 mil usuários (auditoria de 23/09) — para um dado que só
 * precisa de resolução de minuto.
 */
export const INTERVALO_ULTIMO_USO_MS = 60_000
```

E o bloco em `validarSessao`:

```ts
  if (linha.sessao.dispositivoId) {
    // Gravação CONDICIONAL: o filtro no WHERE decide, sem leitura extra.
    await db
      .update(dispositivos)
      .set({ ultimoUso: agora, ...(acesso?.ip ? { ipUltimo: acesso.ip } : {}) })
      .where(
        and(
          eq(dispositivos.id, linha.sessao.dispositivoId),
          or(
            isNull(dispositivos.ultimoUso),
            lt(dispositivos.ultimoUso, new Date(agora.getTime() - INTERVALO_ULTIMO_USO_MS)),
          ),
        ),
      )
  }
```

Acrescentar `lt` e `or` ao import de `drizzle-orm` (os demais já existem). Se `dispositivos.ultimoUso` for `notNull` no schema, o `isNull` é inofensivo; manter.

`cookies.ts`:

```ts
import { cache } from 'react'
// ...
/**
 * (comentário existente)
 *
 * `cache()` memoriza por REQUISIÇÃO: guarda, ações e rotas que chamam
 * `sessaoAtual` na mesma renderização validam a sessão uma vez só.
 */
export const sessaoAtual = cache(async (): Promise<Sessao | null> => {
  if (!process.env.DATABASE_URL) return null

  const token = await tokenDaSessaoAtual()
  if (!token) return null

  const r = await validarSessao(getDb(), token, new Date(), { ip: await ipDaRequisicao() })
  return r.ok ? r.sessao : null
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/plataforma/__tests__/sessao-ultimo-uso.test.ts src/modules/plataforma/__tests__/sessao-dispositivo.test.ts src/modules/plataforma/__tests__/plataforma.test.ts`
Expected: PASS. Se um teste existente de uso simultâneo depender de `ultimoUso` regravado a cada validação dentro de 60 s, ajuste o relógio do teste para passos ≥ 61 s e registre o ajuste no fim do plano (seção "Desvios").

---

### Task 4: Chat — falha marcada, não apagada; teto de tokens; fallback barato; POST protegido

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts:595-610` (`chatMensagens`)
- Create: migração gerada (`drizzle/0031_*.sql` + down)
- Modify: `src/modules/entrega/chat-limites.ts` (constante)
- Modify: `src/modules/entrega/chat.ts` (`mensagensUsadasHoje`, `ultimasMensagens`, `apagarReserva`, os dois pontos de falha em `responder`)
- Modify: `src/modules/ingestao/llm/perfis.ts:34-41` (perfil `chat`)
- Modify: `src/app/api/chat/route.ts` (início do `POST`)
- Test: `src/modules/entrega/__tests__/chat.test.ts`, `src/app/api/chat/__tests__/rota.test.ts`

**Interfaces:**
- Produces: `FALHAS_DEVOLVIDAS_POR_DIA = 3` em `chat-limites.ts` (reexportado por `chat.ts` como os outros freios, se `chat.ts` reexporta os demais); coluna `chatMensagens.falhouEm: Date | null`.

- [ ] **Step 1: Write the failing tests**

Em `chat.test.ts`, dentro de `describe('chat do assinante')`, **substituir** o fim do teste "validador reprova a resposta" (as linhas `const linhas = ...; expect(linhas).toHaveLength(0)`) por:

```ts
    // A pergunta fica, MARCADA como falha: é o que faz ela contar no limite
    // por minuto (auditoria 23/09) sem gastar a cota do dia.
    const linhas = await banco.db.select().from(chatMensagens)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.falhouEm).not.toBeNull()
```

E acrescentar ao mesmo `describe` (importar `FALHAS_DEVOLVIDAS_POR_DIA` e `ultimasMensagens` de `'../chat'` — ou `FALHAS_DEVOLVIDAS_POR_DIA` de `'../chat-limites'` se `chat.ts` não o reexportar):

```ts
  it('falhas seguidas param no limite por minuto — o laço pago fecha', async () => {
    await banco.db.delete(chatMensagens)
    const porta = new LLMFake({ falhar: true })
    const motivos: string[] = []
    for (let i = 0; i < LIMITE_POR_MINUTO + 1; i++) {
      const r = await responder(banco.db, porta, {
        usuarioId,
        texto: `pergunta ${i}`,
        dataReferencia: HOJE,
        fuso: FUSO,
        temporada: TEMPORADA,
        cotaDiaria: COTA_TESTE,
        agora: AGORA,
      })
      if (!r.ok) motivos.push(r.motivo)
    }
    expect(motivos.at(-1)).toBe('limite-por-minuto')
    expect(porta.chamadas).toHaveLength(LIMITE_POR_MINUTO)
  })

  it('só as três primeiras falhas do dia são devolvidas', async () => {
    await banco.db.delete(chatMensagens)
    const porta = new LLMFake({ falhar: true })
    for (let i = 0; i < FALHAS_DEVOLVIDAS_POR_DIA + 1; i++) {
      await responder(banco.db, porta, {
        usuarioId,
        texto: `pergunta ${i}`,
        dataReferencia: HOJE,
        fuso: FUSO,
        temporada: TEMPORADA,
        cotaDiaria: COTA_TESTE,
        // Um minuto e pouco entre elas: este teste é sobre a cota do DIA.
        agora: new Date(AGORA.getTime() + i * 61_000),
      })
    }
    expect(await mensagensUsadasHoje(banco.db, usuarioId, HOJE, FUSO)).toBe(1)
  })

  it('a pergunta que falhou não entra no histórico', async () => {
    await banco.db.delete(chatMensagens)
    await banco.db.insert(chatMensagens).values({
      usuarioId,
      papel: 'USUARIO',
      texto: 'pergunta sem resposta',
      criadoEm: AGORA,
      falhouEm: AGORA,
    })
    expect(await ultimasMensagens(banco.db, usuarioId, HOJE, FUSO)).toEqual([])
  })
```

Em `rota.test.ts`, acrescentar ao `describe('POST /api/chat')`:

```ts
  it('POST de outra origem recebe 403 e não chega à LLM', async () => {
    const { POST } = await import('../route')
    const r = await POST(
      new Request('http://local/api/chat', {
        method: 'POST',
        body: JSON.stringify({ texto: 'oi' }),
        headers: { 'content-type': 'application/json', origin: 'https://evil.test' },
      }),
    )
    expect(r.status).toBe(403)
    expect(llmFake.chamadas).toHaveLength(0)
  })

  it('POST sem JSON recebe 415', async () => {
    const { POST } = await import('../route')
    const r = await POST(
      new Request('http://local/api/chat', { method: 'POST', body: 'texto=oi' }),
    )
    expect(r.status).toBe(415)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/entrega/__tests__/chat.test.ts src/app/api/chat/__tests__/rota.test.ts`
Expected: FAIL — `falhouEm` não existe (typecheck/insert), laço não para, 403/415 não retornados.

- [ ] **Step 3: Implement**

Schema `chatMensagens`, depois de `tokensSaida`:

```ts
    /**
     * Quando a resposta desta pergunta falhou (LLM fora ou texto reprovado).
     * Nulo = respondida. A linha FICA: ela conta no limite por minuto, e só
     * as primeiras falhas do dia são devolvidas à cota (auditoria 23/09).
     */
    falhouEm: timestamp('falhou_em', { withTimezone: true }),
```

Gerar: `npm run db:generate` → `drizzle/0031_*.sql` só com `ALTER TABLE "chat_mensagens" ADD COLUMN "falhou_em" timestamp with time zone;` e o down com `DROP COLUMN`.

`chat-limites.ts`, depois de `LIMITE_POR_MINUTO`:

```ts
/**
 * Quantas falhas por dia NÃO gastam cota.
 *
 * Falha nossa não deve cobrar o assinante — mas devolver TODA falha deixava
 * um laço pago sem freio: a resposta reprovada apagava a reserva, e nem a
 * cota nem o limite por minuto andavam (auditoria 23/09). Três por dia cobre
 * o soluço do provedor; da quarta em diante, a pergunta conta.
 */
export const FALHAS_DEVOLVIDAS_POR_DIA = 3
```

(Se `chat.ts` reexporta `LIMITE_POR_MINUTO` etc., acrescentar `FALHAS_DEVOLVIDAS_POR_DIA` à mesma reexportação.)

`chat.ts` — `mensagensUsadasHoje`:

```ts
  const linhas = await db
    .select({ falhouEm: chatMensagens.falhouEm })
    .from(chatMensagens)
    .where(
      and(
        eq(chatMensagens.usuarioId, usuarioId),
        eq(chatMensagens.papel, 'USUARIO'),
        gte(chatMensagens.criadoEm, inicio),
        lt(chatMensagens.criadoEm, fim),
      ),
    )
  const falhas = linhas.filter((l) => l.falhouEm !== null).length
  return linhas.length - falhas + Math.max(0, falhas - FALHAS_DEVOLVIDAS_POR_DIA)
```

`mensagensNoUltimoMinuto`: sem mudança (já conta toda linha USUARIO; agora as falhas ficam).

`ultimasMensagens`: acrescentar `isNull(chatMensagens.falhouEm)` ao `and(...)` do `where` (importar `isNull`).

Trocar `apagarReserva` por:

```ts
/** Marca a pergunta como falha. Nunca lança: é best-effort, como a limpeza que substitui. */
async function marcarFalha(db: Db, id: string, agora: Date): Promise<void> {
  try {
    await db.update(chatMensagens).set({ falhouEm: agora }).where(eq(chatMensagens.id, id))
  } catch {
    // engolido de propósito — não mascarar o erro original.
  }
}
```

Nos dois pontos de `responder` (reprovação e `catch`), trocar `apagarReserva(db, reservaId)` por `marcarFalha(db, reservaId, entrada.agora)` e atualizar os comentários vizinhos ("apaga a reserva" → "marca a pergunta como falha; só as primeiras falhas do dia são devolvidas").

`perfis.ts`, perfil `chat`:

```ts
  chat: {
    // (comentário existente sobre o V4 Flash)
    // Sem o Haiku na cadeia: no pico, uma queda do DeepSeek passaria o chat
    // para um modelo 10–30× mais caro sem ninguém ver (auditoria 23/09).
    // 350 tokens ≈ os 1.200 caracteres que o validador aceita: acima disso a
    // resposta era paga inteira e reprovada por `muito-longo`.
    modelos: ['deepseek/deepseek-v4-flash', 'openai/gpt-4o-mini'],
    maxTokens: 350,
    temperatura: 0.4,
  },
```

`api/chat/route.ts` — importar `conteudoJson`, `lerJsonLimitado`, `origemDaMutacaoValida` de `@/modules/plataforma/push/http` e, no `POST`, logo depois do bloco `if (!config.habilitado ...)`, substituir a leitura do corpo por:

```ts
  // As mesmas guardas das outras rotas que mudam estado (push, preferências):
  // origem, tipo e tamanho do corpo ANTES de ler — o corpo antes era lido
  // inteiro (até 4,5 MB) para depois descartar tudo acima de 500 caracteres.
  if (!origemDaMutacaoValida(requisicao)) {
    return NextResponse.json({ erro: 'origem-invalida' }, { status: 403 })
  }
  if (!conteudoJson(requisicao)) {
    return NextResponse.json({ erro: 'tipo-invalido' }, { status: 415 })
  }
  const corpo = (await lerJsonLimitado(requisicao).catch(() => null)) as {
    texto?: unknown
  } | null
  const texto = typeof corpo?.texto === 'string' ? corpo.texto : ''
```

(`PainelChat.tsx` já envia `content-type: application/json`; o navegador envia `Origin` no POST.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/entrega/__tests__/chat.test.ts src/app/api/chat/__tests__/rota.test.ts src/modules/entrega/__tests__/chat-limites.test.ts src/modules/ingestao/__tests__ src/modules/dominio/__tests__/persistencia.test.ts`
Expected: PASS. Se algum teste de `ingestao/__tests__` fixar a lista de modelos do perfil `chat` ou o `maxTokens` 700, atualizar para os valores novos (é a mudança pedida) e registrar em "Desvios".

---

### Task 5: Login — tentativa reservada antes da senha, teto por IP, cadastro sem segundo scrypt

**Files:**
- Modify: `src/modules/plataforma/auth/rate-limit.ts`
- Modify: `src/modules/plataforma/auth/sessao.ts` (`autenticar`; extrair `abrirSessao`)
- Modify: `src/app/(app)/cadastrar/acoes.ts`
- Modify: `src/modules/plataforma/auth/redefinicao.ts` (hash fora da transação)
- Modify: `src/modules/dominio/db/schema/plataforma.ts:401` (índice por IP em `tentativas_login`)
- Create: migração gerada (`drizzle/0032_*.sql` + down)
- Test: `src/modules/plataforma/__tests__/login-limite.test.ts` (novo)

**Interfaces:**
- Produces:
  - `POLITICA_POR_IP: PoliticaRateLimit = { maxTentativas: 50, janelaMs: 15 * 60_000 }`
  - `reservarTentativaDeLogin(db, { identificador: string; ip: string | null; agora: Date }, politica?: PoliticaRateLimit, politicaIp?: PoliticaRateLimit): Promise<{ id: string; excedeu: boolean }>`
  - `marcarTentativaComoSucesso(db, id: string): Promise<void>`
  - `abrirSessao(db, usuarioId: string, acesso: DadosAcesso, agora: Date, opcoes: { duracaoMs: number }): Promise<Extract<ResultadoLogin, { ok: true }>>`

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/plataforma/__tests__/login-limite.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { tentativasLogin, usuarios } from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { autenticar } from '../auth/sessao'

const AGORA = new Date('2026-10-02T15:00:00.000Z')
const acesso = (ip: string) => ({ fingerprint: `fp-${ip}`, tipo: 'DESKTOP' as const, userAgent: null, ip })

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())
beforeEach(async () => {
  await banco.db.delete(tentativasLogin)
  await banco.db.delete(usuarios)
  await adicionarUsuario(banco.db, { email: 'alvo@exemplo.com', senha: 'senha-segura-123', nome: 'Alvo' })
})

describe('limite de login', () => {
  it('20 tentativas erradas em paralelo: no máximo 5 chegam a conferir a senha', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () =>
        autenticar(banco.db, { email: 'alvo@exemplo.com', senha: 'errada' }, acesso('9.9.9.9'), AGORA),
      ),
    )
    const conferidas = resultados.filter((r) => !r.ok && r.motivo === 'credenciais').length
    expect(conferidas).toBeLessThanOrEqual(5)
  })

  it('a 51ª falha do mesmo IP é barrada, mesmo em e-mails diferentes', async () => {
    for (let n = 0; n < 50; n++) {
      await autenticar(banco.db, { email: `x${n}@exemplo.com`, senha: 'errada' }, acesso('7.7.7.7'), AGORA)
    }
    const r = await autenticar(banco.db, { email: 'y@exemplo.com', senha: 'errada' }, acesso('7.7.7.7'), AGORA)
    expect(r).toEqual({ ok: false, motivo: 'excesso-de-tentativas' })
  })

  it('atrás do CGNAT, quem erra uma vez e acerta depois entra', async () => {
    // Outras 20 pessoas do mesmo IP erraram a senha na janela: bem abaixo do
    // teto de 50, e o acerto desta pessoa não pode ser barrado por elas.
    for (let n = 0; n < 20; n++) {
      await autenticar(banco.db, { email: `x${n}@exemplo.com`, senha: 'errada' }, acesso('7.7.7.7'), AGORA)
    }
    await autenticar(banco.db, { email: 'alvo@exemplo.com', senha: 'errada' }, acesso('7.7.7.7'), AGORA)
    const r = await autenticar(
      banco.db,
      { email: 'alvo@exemplo.com', senha: 'senha-segura-123' },
      acesso('7.7.7.7'),
      AGORA,
    )
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/plataforma/__tests__/login-limite.test.ts`
Expected: FAIL — o primeiro teste tem 20 `credenciais`; o segundo, `credenciais` em vez de excesso.

- [ ] **Step 3: Implement**

`rate-limit.ts` (acrescentar; manter `excedeuTentativas` e `registrarTentativa` para outros chamadores, mas fazer `registrarTentativa` devolver o id):

```ts
/**
 * Teto de FALHAS por IP. Folgado por causa do CGNAT (milhares atrás do mesmo
 * IPv4 no celular); o que ele freia é a lista de e-mails testada de um lugar
 * só, que antes não tinha freio nenhum (auditoria 23/09).
 */
export const POLITICA_POR_IP: PoliticaRateLimit = { maxTentativas: 50, janelaMs: 15 * 60_000 }

async function contarFalhas(db: Db, filtro: SQL, desde: Date): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tentativasLogin)
    .where(and(filtro, eq(tentativasLogin.sucesso, false), gte(tentativasLogin.tentadoEm, desde)))
  return linha?.total ?? 0
}

/**
 * RESERVA ANTES DE CONFERIR.
 *
 * A tentativa é gravada como falha PRESUMIDA e só depois se conta — a própria
 * tentativa entra na conta. Contar primeiro e gravar depois deixava N logins
 * paralelos lerem a mesma contagem zerada e passarem todos (auditoria 23/09).
 * Quem acerta a senha tem a linha virada para sucesso em seguida.
 *
 * Consequência aceita: tentativa barrada também conta como falha, então quem
 * insiste durante o bloqueio estende a própria janela.
 */
export async function reservarTentativaDeLogin(
  db: Db,
  dados: { identificador: string; ip: string | null; agora: Date },
  politica: PoliticaRateLimit = POLITICA_PADRAO,
  politicaIp: PoliticaRateLimit = POLITICA_POR_IP,
): Promise<{ id: string; excedeu: boolean }> {
  const identificador = dados.identificador.toLowerCase()
  const id = await registrarTentativa(db, { identificador, ip: dados.ip, sucesso: false, agora: dados.agora })
  const porIdentificador = await contarFalhas(
    db,
    eq(tentativasLogin.identificador, identificador),
    new Date(dados.agora.getTime() - politica.janelaMs),
  )
  if (porIdentificador > politica.maxTentativas) return { id, excedeu: true }
  if (!dados.ip) return { id, excedeu: false }
  const porIp = await contarFalhas(
    db,
    eq(tentativasLogin.ip, dados.ip),
    new Date(dados.agora.getTime() - politicaIp.janelaMs),
  )
  return { id, excedeu: porIp > politicaIp.maxTentativas }
}

export async function marcarTentativaComoSucesso(db: Db, id: string): Promise<void> {
  await db.update(tentativasLogin).set({ sucesso: true }).where(eq(tentativasLogin.id, id))
}
```

`registrarTentativa` passa a `Promise<string>` com `.returning({ id: tentativasLogin.id })` e `return linha!.id` (lançar se vazio, como `registrarOperacao`). Import: `import { and, eq, gte, sql, type SQL } from 'drizzle-orm'`.

Note: `excesso` na contagem por identificador usa `>` porque a própria tentativa já está na conta — 5 falhas anteriores + a atual = 6 > 5 → barrada, o mesmo limiar de antes.

`sessao.ts` — `autenticar` passa a:

```ts
  const email = credenciais.email.trim().toLowerCase()

  const reserva = await reservarTentativaDeLogin(
    db,
    { identificador: email, ip: acesso.ip, agora },
    opcoes.politica,
  )
  if (reserva.excedeu) {
    await registrar(db, null, 'LOGIN_FALHOU', 'excesso de tentativas', acesso.ip, agora)
    return { ok: false, motivo: 'excesso-de-tentativas' }
  }

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1)
  // (comentário existente sobre o hash descartável)
  const hashParaConferir = usuario?.senhaHash ?? 'scrypt$16384$8$1$AAAA$AAAA'
  const senhaConfere = await conferirSenha(credenciais.senha, hashParaConferir)

  if (!usuario || !senhaConfere) {
    // A reserva já é a falha registrada.
    await registrar(db, usuario?.id ?? null, 'LOGIN_FALHOU', 'credenciais inválidas', acesso.ip, agora)
    return { ok: false, motivo: 'credenciais' }
  }
  if (usuario.status === 'BLOQUEADO') return { ok: false, motivo: 'bloqueado' }

  await marcarTentativaComoSucesso(db, reserva.id)
  return abrirSessao(db, usuario.id, acesso, agora, opcoes)
}
```

Extrair o resto do antigo `autenticar` (do `const token = randomBytes(32)...` até o `return { ok: true, ... }`) para:

```ts
/**
 * Abre a sessão de um usuário JÁ AUTENTICADO. Separada de `autenticar` para o
 * cadastro não pagar um segundo scrypt conferindo a senha que acabou de gravar.
 */
export async function abrirSessao(
  db: Db,
  usuarioId: string,
  acesso: DadosAcesso,
  agora: Date,
  opcoes: { duracaoMs: number },
): Promise<Extract<ResultadoLogin, { ok: true }>> {
  // corpo movido sem mudança, com `usuario.id` → `usuarioId`
}
```

Atualizar o import de `rate-limit` em `sessao.ts` (`reservarTentativaDeLogin`, `marcarTentativaComoSucesso`, `type PoliticaRateLimit`; `excedeuTentativas`/`registrarTentativa` saem se não forem mais usados aqui).

`cadastrar/acoes.ts`: trocar `autenticar(getDb(), { email, senha }, {...acesso}, agora, { duracaoMs })` por `abrirSessao(getDb(), resultado.usuarioId, {...acesso}, agora, { duracaoMs: DURACAO_MS })` e remover a linha `if (!login.ok) return 'Conta criada...'` (`abrirSessao` sempre devolve `ok: true` ou lança). O import de `autenticar` vira `abrirSessao`.

`redefinicao.ts`: calcular `const senhaHash = await gerarHash(e.novaSenha)` **antes** de `return db.transaction(...)` e usar `.set({ senhaHash })` dentro, com o comentário: "scrypt fora da transação: segurava conexão e lock durante ~50 ms de CPU".

Schema `tentativasLogin`:

```ts
  (t) => [
    index('tentativas_login_janela_idx').on(t.identificador, t.tentadoEm),
    index('tentativas_login_ip_idx').on(t.ip, t.tentadoEm),
  ],
```

`npm run db:generate` → `0032_*.sql` com o `CREATE INDEX` e o down.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/plataforma/__tests__/login-limite.test.ts src/modules/plataforma/__tests__/plataforma.test.ts src/modules/plataforma/__tests__/sessao-dispositivo.test.ts src/modules/plataforma/__tests__/redefinicao.test.ts src/modules/plataforma/__tests__/spec04.test.ts src/modules/dominio/__tests__/persistencia.test.ts`
Expected: PASS. Se um teste existente conferir que tentativa barrada NÃO grava linha em `tentativas_login`, atualizar para o comportamento novo (documentado no comentário) e registrar em "Desvios".

---

### Task 6: Pagamento — lock por referência no webhook; reconciliação que esvazia

**Files:**
- Modify: `src/modules/plataforma/assinatura/webhook.ts:463` (`aplicarEventoPagamento`)
- Modify: `src/modules/plataforma/assinatura/reconciliacao.ts:146-257`
- Test: `src/modules/plataforma/__tests__/webhook-temporada.test.ts`, `src/modules/plataforma/__tests__/reconciliacao-temporada.test.ts`

**Interfaces:**
- Produces: `JANELA_ABANDONO_MS = 7 * 24 * 3600_000`, `JANELA_PRIORIDADE_MS = 48 * 3600_000` exportadas de `reconciliacao.ts`.

- [ ] **Step 1: Write the failing tests**

Em `webhook-temporada.test.ts` (reusar o evento de temporada que o arquivo já monta; se o helper tiver outro nome, usar o que existe):

```ts
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../../dominio/db/schema'

it('o evento trava a referência antes de gravar — a corrida do primeiro pagamento', async () => {
  // PGlite serializa transações, então a corrida em si não se reproduz aqui;
  // o que se fixa é a trava que a impede no Postgres de verdade.
  const consultas: string[] = []
  const dbComLog = drizzle(banco.pg, { schema, logger: { logQuery: (q) => consultas.push(q) } })
  await aplicarEventoPagamento(dbComLog, 'fake', eventoDeTemporadaAprovado(), AGORA, FIM_DA_TEMPORADA)
  const trava = consultas.findIndex((q) => q.includes('pg_advisory_xact_lock'))
  const insercao = consultas.findIndex((q) => q.includes('insert into "eventos_pagamento"'))
  expect(trava).toBeGreaterThanOrEqual(0)
  expect(trava).toBeLessThan(insercao)
})
```

(`eventoDeTemporadaAprovado()` = o `EventoPagamento` de temporada aprovado que o arquivo já usa nos outros testes; se ele for montado inline, extrair para uma função no próprio arquivo.)

Em `reconciliacao-temporada.test.ts` (usa `tentativaDeTemporada`, `PagamentoFake`, `AGORA` do arquivo; `tentativaDeTemporada` ganha um 2º parâmetro opcional `criadoEm = AGORA` passado para `.values({ ..., criadoEm })`):

```ts
describe('a fila de reconciliação esvazia', () => {
  it('temporada paga sai da fila', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-paga')
    porta.registrarPagamento({
      id: 'pay-paga',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-paga',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })
    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    const [t] = await banco.db.select().from(tentativasCheckout)
    expect(t?.status).toBe('ENCERRADA')
    const segunda = await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    expect(segunda.examinadas).toBe(0)
  })

  it('tentativa sem pagamento há mais de 7 dias sai da fila; a de ontem continua', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-velha', new Date(AGORA.getTime() - 8 * 24 * 3600_000))
    await tentativaDeTemporada('ref-nova', new Date(AGORA.getTime() - 24 * 3600_000))
    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    const linhas = await banco.db.select().from(tentativasCheckout)
    const status = Object.fromEntries(linhas.map((l) => [l.referenciaExterna, l.status]))
    expect(status['ref-velha']).toBe('ENCERRADA')
    expect(status['ref-nova']).toBe('AMBIGUA')
  })

  it('as tentativas recentes são examinadas primeiro', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-velha', new Date(AGORA.getTime() - 10 * 24 * 3600_000))
    await banco.db
      .update(tentativasCheckout)
      .set({ atualizadoEm: new Date(AGORA.getTime() - 5 * 24 * 3600_000) })
    await tentativaDeTemporada('ref-nova', new Date(AGORA.getTime() - 24 * 3600_000))
    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA, 1)
    const linhas = await banco.db.select().from(tentativasCheckout)
    const status = Object.fromEntries(linhas.map((l) => [l.referenciaExterna, l.status]))
    expect(status['ref-nova']).toBe('AMBIGUA')
    expect(status['ref-velha']).toBe('CRIADA')
  })
})
```

Atenção: a tabela tem índice único parcial de tentativa ABERTA por usuário. Se duas tentativas abertas do mesmo usuário violarem esse índice, criar um segundo usuário com `adicionarUsuario` para a segunda tentativa (o `tentativaDeTemporada` ganha então um 3º parâmetro `dono = usuarioId`).

Acrescentar também, no mesmo `describe`, a guarda do Review Focus 4 — mensal autorizado não vira `ENCERRADA`. Usar o caminho de mensal que `reconciliacao` já testa em `pagamento-estabilizacao.test.ts` (procurar `modalidade: 'MENSAL'` e `registrarAssinatura` no `PagamentoFake`) e afirmar `status === 'CRIADA'` depois de reconciliar uma assinatura `authorized`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/plataforma/__tests__/webhook-temporada.test.ts src/modules/plataforma/__tests__/reconciliacao-temporada.test.ts`
Expected: FAIL — sem `pg_advisory_xact_lock`; status `CRIADA`/`AMBIGUA` onde se espera `ENCERRADA`; a velha examinada primeiro.

- [ ] **Step 3: Implement**

`webhook.ts`, no início do `db.transaction` de `aplicarEventoPagamento`:

```ts
  return db.transaction(async (tx) => {
    // SERIALIZA os eventos do MESMO pagamento. No primeiro evento de uma
    // temporada não existe linha em `assinaturas`: duas notificações
    // simultâneas (payment.created + payment.updated, ou webhook +
    // reconciliação) passavam as duas pelo SELECT e a segunda estourava a
    // UNIQUE de `referencia_externa` — 500 no webhook (auditoria 23/09).
    const chaveDaTrava = evento.referenciaExterna ?? evento.assinaturaExternaId
    if (chaveDaTrava) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pagamento:${chaveDaTrava}`}))`)
    }
    const ocorridoEmOrigem = dataDoProvedor(evento.ocorridoEm)
```

(importar `sql` de `drizzle-orm` se ainda não estiver.)

`reconciliacao.ts`:

```ts
/** Sem pagamento encontrado depois disso, a tentativa foi abandonada. */
export const JANELA_ABANDONO_MS = 7 * 24 * 3600_000
/**
 * Quem pagou há pouco espera na frente. Com ~2 mil tentativas e 50 por
 * rodada a cada 10 min, o rodízio puro levava ~6–7 h para voltar a um
 * pagamento perdido (auditoria 23/09).
 */
export const JANELA_PRIORIDADE_MS = 48 * 3600_000
```

Na consulta de candidatas, trocar `.orderBy(asc(tentativasCheckout.atualizadoEm))` por:

```ts
    .orderBy(
      desc(sql`${tentativasCheckout.criadoEm} >= ${new Date(agora.getTime() - JANELA_PRIORIDADE_MS)}`),
      asc(tentativasCheckout.atualizadoEm),
    )
```

(importar `desc`.) Um auxiliar local:

```ts
function statusSemPagamento(tentativa: typeof tentativasCheckout.$inferSelect, agora: Date) {
  return tentativa.criadoEm.getTime() < agora.getTime() - JANELA_ABANDONO_MS ? 'ENCERRADA' : 'AMBIGUA'
}
```

- Nos dois ramos "não encontrado" (`if (!cobranca)` da temporada e `if (!assinatura)` do mensal): `status: statusSemPagamento(tentativa, agora)`.
- No ramo de temporada depois de aplicar o evento: `status: cobranca.status === 'approved' ? 'ENCERRADA' : 'CRIADA'`, com o comentário "temporada paga é pagamento único: não há renovação a vigiar".
- Mensal encontrado: sem mudança (continua `CRIADA`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/plataforma/__tests__/webhook-temporada.test.ts src/modules/plataforma/__tests__/reconciliacao-temporada.test.ts src/modules/plataforma/__tests__/pagamento-estabilizacao.test.ts src/modules/plataforma/__tests__/spec04.test.ts src/modules/plataforma/__tests__/checkout-sku.test.ts src/modules/plataforma/__tests__/upgrade.test.ts`
Expected: PASS. O teste existente "rodar duas vezes não cria dois direitos" continua valendo (a segunda rodada agora examina zero).

---

### Task 7: Cabeçalhos de segurança e Next 16.3.6

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json`, `package-lock.json`
- Test: `src/app/__tests__/cabecalhos-seguranca.test.ts` (novo)

- [ ] **Step 1: Write the failing test**

```ts
// src/app/__tests__/cabecalhos-seguranca.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const semComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('cabeçalhos de segurança', () => {
  const config = semComentarios(readFileSync('next.config.ts', 'utf8'))

  it('toda rota recebe os cinco cabeçalhos', () => {
    expect(config).toMatch(/source: '\/:path\*'/)
    for (const chave of [
      "key: 'X-Frame-Options', value: 'DENY'",
      "key: 'Content-Security-Policy', value: \"frame-ancestors 'none'\"",
      "key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'",
      "key: 'X-Content-Type-Options', value: 'nosniff'",
      "key: 'Permissions-Policy'",
    ]) {
      expect(config).toContain(chave)
    }
  })

  it('a regra global vem ANTES da de /redefinir — o no-referrer de lá prevalece', () => {
    expect(config.indexOf("source: '/:path*'")).toBeLessThan(config.indexOf("source: '/redefinir/:token'"))
  })

  it('next corrigido (GHSA-2xp9-vwfh-vxw4)', () => {
    const pacote = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pacote.dependencies.next).toBe('^16.3.6')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/__tests__/cabecalhos-seguranca.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`next.config.ts`, primeiro item do array de `headers()`:

```ts
      {
        // Toda rota. Sem isto um site de fora embutia `/conta` num iframe e
        // induzia o clique em "cancelar assinatura" (auditoria 23/09). A CSP
        // leva SÓ `frame-ancestors`: uma política completa arrisca quebrar
        // script e fica para quando houver como testá-la no navegador.
        // Vem PRIMEIRO: quando duas regras batem, a última vence por chave —
        // e `/redefinir/:token` precisa manter o `no-referrer` dela.
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
```

Next: `npm install next@^16.3.6 eslint-config-next@^16.3.6` (conferir antes com `df -h /System/Volumes/Data` > 2 GB livres). Depois, `grep '"next"' package.json` deve mostrar `^16.3.6`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/__tests__/cabecalhos-seguranca.test.ts` → PASS.
Run: `npm run typecheck` → sem erros. (O build completo roda em T12.)

---

### Task 8: A demo não semeia por cima de dado real

**Files:**
- Modify: `src/modules/ingestao/demo/autossemeadura.ts`
- Modify: `src/app/api/cron/demo/route.ts`
- Test: `src/modules/ingestao/demo/__tests__/guarda-dado-real.test.ts` (novo), `src/app/api/cron/demo/__tests__/route.test.ts`

**Interfaces:**
- Produces: `motivoParaNaoSemear(db: Db, env: Record<string, string | undefined>): Promise<'INGESTAO_REAL_HABILITADA' | 'DADO_REAL_PRESENTE' | null>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/modules/ingestao/demo/__tests__/guarda-dado-real.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { checkpointsIngestao } from '../../../dominio/db/schema'
import { motivoParaNaoSemear } from '../autossemeadura'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

describe('guarda de dado real da demo', () => {
  it('banco vazio e ingestão desligada: pode semear', async () => {
    expect(await motivoParaNaoSemear(banco.db, {})).toBeNull()
  })

  it('ingestão real habilitada: não semeia', async () => {
    expect(await motivoParaNaoSemear(banco.db, { NBA_INGESTAO_HABILITADA: 'true' })).toBe(
      'INGESTAO_REAL_HABILITADA',
    )
  })

  it('checkpoint do backfill real no banco: não semeia', async () => {
    await banco.db.insert(checkpointsIngestao).values({
      job: 'backfill-rodada',
      janelaInicio: '2025-10-21',
      janelaFim: '2025-10-21',
      temporada: '2025-26',
      provedor: 'balldontlie',
    })
    expect(await motivoParaNaoSemear(banco.db, {})).toBe('DADO_REAL_PRESENTE')
  })
})
```

(Se `checkpointsIngestao` tiver outras colunas `notNull` sem padrão, preencher com valores plausíveis conforme o schema em `src/modules/dominio/db/schema/ingestao.ts:96-120`.)

Em `route.test.ts`: acrescentar ao topo, junto dos outros mocks,

```ts
const guarda = vi.hoisted(() => ({ motivo: null as string | null }))
vi.mock('@/modules/ingestao/demo/autossemeadura', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/modules/ingestao/demo/autossemeadura')>()
  return { ...real, motivoParaNaoSemear: async () => guarda.motivo }
})
```

zerar `guarda.motivo = null` no `beforeEach`, e o teste:

```ts
  it('com dado real no banco, não chama simularAte', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'
    guarda.motivo = 'DADO_REAL_PRESENTE'
    const r = await GET(new Request('http://local/api/cron/demo', { headers: { authorization: 'Bearer segredo' } }))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ executado: false, motivo: 'DADO_REAL_PRESENTE' })
    expect(mocks.simularAte).not.toHaveBeenCalled()
  })
```

(Seguir o formato de requisição e de corpo que os testes vizinhos do arquivo já usam — se a resposta do `executarCronProtegido` embrulhar o resultado, ajustar o `toMatchObject` ao formato que os vizinhos conferem.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/ingestao/demo/__tests__/guarda-dado-real.test.ts src/app/api/cron/demo/__tests__/route.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`autossemeadura.ts`:

```ts
import { sql } from 'drizzle-orm'
import { checkpointsIngestao } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * A SEGUNDA GUARDA: o dado, não a variável.
 *
 * `DEMO_AUTOSSEMEADURA` sozinha dependia de alguém lembrar de apagá-la antes
 * do backfill da temporada real — e o cron roda todo dia às 6h de Brasília.
 * Aqui a rota olha o que importa: a ingestão real está ligada, ou o backfill
 * real já escreveu (só ele grava em `checkpoints_ingestao`)? Então semear
 * ficção por cima está fora de questão, com ou sem a variável.
 */
export async function motivoParaNaoSemear(
  db: Db,
  env: Record<string, string | undefined>,
): Promise<'INGESTAO_REAL_HABILITADA' | 'DADO_REAL_PRESENTE' | null> {
  if (env.NBA_INGESTAO_HABILITADA === 'true') return 'INGESTAO_REAL_HABILITADA'
  const [linha] = await db.select({ n: sql<number>`count(*)::int` }).from(checkpointsIngestao)
  return (linha?.n ?? 0) > 0 ? 'DADO_REAL_PRESENTE' : null
}
```

Conferir com `npm run boundaries` que `ingestao/demo` pode importar `dominio/db` (os vizinhos em `ingestao/demo/semear.ts` já importam).

`route.ts`, logo após o `if (!autossemeaduraHabilitada(...))`:

```ts
      const bloqueio = await motivoParaNaoSemear(getDb(), process.env)
      if (bloqueio) {
        console.warn(JSON.stringify({ evento: 'demo_recusada', motivo: bloqueio }))
        return { executado: false, motivo: bloqueio }
      }
```

e importar `motivoParaNaoSemear` junto de `autossemeaduraHabilitada`. Se o tipo do retorno de `tarefa` reclamar da união de motivos, declarar o `motivo` com `as const` como o ramo vizinho faz.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/ingestao/demo/__tests__/guarda-dado-real.test.ts src/app/api/cron/demo/__tests__/route.test.ts` → PASS.

---

### Task 9: Portão de cookie antes do banco nas telas de estatística

**Files:**
- Modify: `src/modules/plataforma/assinatura/guarda.ts`
- Modify: `src/app/(app)/estatisticas/jogador/[id]/page.tsx:455-457`, `src/app/(app)/estatisticas/time/[id]/page.tsx:276-279`, `src/app/(app)/estatisticas/jogo/[id]/page.tsx:245-249`
- Test: `src/modules/plataforma/__tests__/guarda-cookie.test.ts` (novo)

**Interfaces:**
- Produces: `exigirCookieDeSessao(destino: string): Promise<void>` em `guarda.ts` (redireciona para `/entrar?destino=...` sem cookie).

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/plataforma/__tests__/guarda-cookie.test.ts
import { describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ token: null as string | null, bancoUsado: false }))

vi.mock('../auth/cookies', () => ({
  tokenDaSessaoAtual: async () => estado.token,
  sessaoAtual: async () => null,
}))
vi.mock('../../dominio/db/cliente', () => ({
  getDb: () => {
    estado.bancoUsado = true
    throw new Error('não deveria tocar o banco')
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
}))

import { exigirCookieDeSessao } from '../assinatura/guarda'

describe('portão de cookie', () => {
  it('sem cookie, redireciona para entrar sem tocar o banco', async () => {
    estado.token = null
    await expect(exigirCookieDeSessao('/estatisticas/jogador/x')).rejects.toThrow(
      'REDIRECT /entrar?destino=%2Festatisticas%2Fjogador%2Fx',
    )
    expect(estado.bancoUsado).toBe(false)
  })

  it('com cookie, segue', async () => {
    estado.token = 'tok'
    await expect(exigirCookieDeSessao('/x')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/plataforma/__tests__/guarda-cookie.test.ts` → FAIL (função não existe).

- [ ] **Step 3: Implement**

`guarda.ts` (importar `tokenDaSessaoAtual` de `../auth/cookies`, junto de `sessaoAtual`):

```ts
/**
 * PORTÃO BARATO, ANTES DO BANCO.
 *
 * As telas de estatística resolvem a tela (≈10 consultas) antes de pedir
 * login, para um id inexistente responder 404. Sem cookie nenhum, esse
 * trabalho era desperdício — e um robô ou link compartilhado virava carga
 * de graça no banco (auditoria 23/09). Aqui só o cookie é lido; quem tem
 * cookie segue o caminho de sempre, e `exigirNivel` valida de verdade.
 *
 * Consequência aceita: sem cookie, um id válido que não existe manda para
 * /entrar em vez de 404.
 */
export async function exigirCookieDeSessao(destino: string): Promise<void> {
  if (!(await tokenDaSessaoAtual())) redirect(`/entrar?destino=${encodeURIComponent(destino)}`)
}
```

Nas três telas, logo depois de `if (!process.env.DATABASE_URL) return <SemBanco />` **e** da validação do uuid (a que vier por último das duas), inserir com o MESMO destino que o `exigirNivel` da tela usa:

- jogador: `await exigirCookieDeSessao(\`/estatisticas/jogador/${id}\`)`
- time: `await exigirCookieDeSessao(rotaDoTime(id))`
- jogo: `await exigirCookieDeSessao(rotaDoJogo(id))`

(importar de `@/modules/plataforma/assinatura/guarda`, onde `exigirNivel` já vem.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/plataforma/__tests__/guarda-cookie.test.ts src/app/__tests__/telas-04-estatisticas.test.ts src/app/__tests__/planos-estatisticas.test.ts src/app/__tests__/estatisticas-url-invalida.test.ts src/app/__tests__/telas-05-classificacao.test.ts src/app/__tests__/telas-06-temporada-exibida.test.ts src/app/__tests__/telas-demo.test.ts`
Expected: PASS. Os testes que mockam `auth/cookies` só com `sessaoAtual` quebram com "tokenDaSessaoAtual is not a function": acrescentar ao mock `tokenDaSessaoAtual: async () => (sessao ? 'token-de-teste' : null)` (usando a variável de sessão que cada arquivo já tem). Um teste que espere 404 para id inexistente SEM sessão passa a ver o redirect — ajustar para montar sessão ou esperar o redirect, e registrar em "Desvios".

---

### Task 10: Afiliados — falha no registro não perde o clique

**Files:**
- Modify: `src/app/r/[codigo]/route.ts`, `src/app/ir/[codigo]/route.ts`
- Test: `src/app/r/[codigo]/__tests__/route.test.ts`, `src/app/ir/[codigo]/__tests__/route.test.ts` (novos)

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/r/[codigo]/__tests__/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  resolver: vi.fn(),
  registrar: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))
vi.mock('@/modules/plataforma/auth/cookies', () => ({ sessaoAtual: async () => null }))
vi.mock('@/modules/plataforma/afiliados/servico', () => ({
  resolverLinkSemRegistrar: estado.resolver,
  registrarClique: estado.registrar,
}))

import { GET } from '../route'

const pedir = () =>
  GET(new Request('http://local/r/abc', { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } }), {
    params: Promise.resolve({ codigo: 'abc' }),
  })

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://teste'
  estado.resolver.mockReset()
  estado.registrar.mockReset()
})

describe('/r/[codigo]', () => {
  it('registro falhou: o visitante ainda chega à casa', async () => {
    estado.resolver.mockResolvedValue('https://casa.example/oferta')
    estado.registrar.mockRejectedValue(new Error('pool esgotado'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const r = await pedir()
    expect(r.headers.get('location')).toBe('https://casa.example/oferta')
  })

  it('link inválido continua em oferta-indisponivel', async () => {
    estado.resolver.mockRejectedValue(new Error('link inexistente'))
    const r = await pedir()
    expect(r.headers.get('location')).toBe('http://local/oferta-indisponivel')
  })
})
```

`ir/[codigo]/__tests__/route.test.ts`: o mesmo, com `resolverDestinoDaCasaSemRegistrar` e `registrarSaidaParaCasa` no mock de `servico`, URL `http://local/ir/abc`.

Se `requisicaoAutomatizada` classificar o user-agent do teste como robô (o que pularia o registro), trocar por um user-agent de navegador desktop comum; conferir em `src/modules/plataforma/afiliados/http.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/r/[codigo]/__tests__/route.test.ts" "src/app/ir/[codigo]/__tests__/route.test.ts"`
Expected: FAIL — o primeiro caso vai para `/oferta-indisponivel`.

- [ ] **Step 3: Implement**

`r/[codigo]/route.ts`, função `resolver` inteira:

```ts
async function resolver(request: Request, codigo: string, registrar: boolean): Promise<Response> {
  let destino: string
  try {
    if (!process.env.DATABASE_URL) throw new Error('Banco indisponível')
    destino = await resolverLinkSemRegistrar(getDb(), codigo)
  } catch {
    return NextResponse.redirect(new URL('/oferta-indisponivel', request.url), {
      status: 307,
      headers: SEM_CACHE,
    })
  }
  if (!registrar) return NextResponse.redirect(new URL(destino, request.url), { headers: SEM_CACHE })

  // O DESTINO JÁ ESTÁ RESOLVIDO: falhar ao REGISTRAR o clique (pool cheio,
  // lock) não pode mandar o visitante para "oferta indisponível" — a
  // comissão se perdia junto com o clique (auditoria 23/09). O erro vai para
  // o log e o visitante segue para a casa.
  const armario = await cookies()
  const token = armario.get(COOKIE_VISITANTE_AFILIADO)?.value ?? novoTokenVisitante()
  try {
    const sessao = await sessaoAtual()
    const clique = await registrarClique(getDb(), {
      codigo,
      visitanteToken: token,
      usuarioId: sessao?.usuarioId,
      agora: new Date(),
      automatizado: false,
    })
    destino = clique.destino
  } catch (erro) {
    console.error(JSON.stringify({ evento: 'afiliado_registro_falhou', codigo, mensagem: String(erro) }))
  }
  const resposta = NextResponse.redirect(new URL(destino, request.url), { headers: SEM_CACHE })
  resposta.cookies.set(COOKIE_VISITANTE_AFILIADO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return resposta
}
```

`ir/[codigo]/route.ts`, mesmo desenho: resolver com `resolverDestinoDaCasaSemRegistrar` num `try` (falha → `/oferta-indisponivel`); se `!registrar`, redirect para o destino; senão, `registrarSaidaParaCasa` num `try` separado (sucesso → usa o destino devolvido; falha → `console.error` e mantém o destino resolvido); o cookie só é gravado quando `!tokenExistente`, como hoje.

- [ ] **Step 4: Run tests to verify they pass**

Run: os dois arquivos do Step 2 → PASS. `npm run typecheck`.

---

### Task 11: Agregados da temporada em cache

**Files:**
- Create: `src/app/(app)/estatisticas/temporada-cacheada.ts`
- Modify: `src/app/(app)/estatisticas/page.tsx:463`, `src/app/(app)/estatisticas/jogador/[id]/page.tsx:462`, `src/app/(app)/estatisticas/time/[id]/page.tsx:285`, `src/app/(app)/resultados/[data]/page.tsx:307-311`
- Test: `src/app/(app)/estatisticas/__tests__/temporada-cacheada.test.ts` (novo)

**Interfaces:**
- Produces: `temporadaParaExibirCacheada(ruleset: RulesetDeTemporada, agora: Date): Promise<string>` e `taxaDaTemporadaCacheada(ate: string, dias: number): Promise<TaxaDaTemporada>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/(app)/estatisticas/__tests__/temporada-cacheada.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const semComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('agregados da temporada em cache', () => {
  const fonte = semComentarios(readFileSync('src/app/(app)/estatisticas/temporada-cacheada.ts', 'utf8'))

  it('as duas leituras são unstable_cache com a tag da lateral e uma hora', () => {
    expect(fonte.match(/unstable_cache\(/g)).toHaveLength(2)
    expect(fonte.match(/\{ tags: \[TAG_LATERAL\], revalidate: 3600 \}/g)).toHaveLength(2)
  })

  it('as telas usam a versão cacheada', () => {
    for (const tela of [
      'src/app/(app)/estatisticas/page.tsx',
      'src/app/(app)/estatisticas/jogador/[id]/page.tsx',
      'src/app/(app)/estatisticas/time/[id]/page.tsx',
    ]) {
      const f = semComentarios(readFileSync(tela, 'utf8'))
      expect(f).toContain('temporadaParaExibirCacheada(')
      expect(f).not.toMatch(/[^a-zA-Z]temporadaParaExibir\(/)
    }
    const resultados = semComentarios(readFileSync('src/app/(app)/resultados/[data]/page.tsx', 'utf8'))
    expect(resultados).toContain('taxaDaTemporadaCacheada(')
    expect(resultados).not.toMatch(/[^a-zA-Z]taxaDaTemporada\(/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(app)/estatisticas/__tests__/temporada-cacheada.test.ts"` → FAIL (arquivo não existe).

- [ ] **Step 3: Implement**

```ts
// src/app/(app)/estatisticas/temporada-cacheada.ts
import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, type ConfigTemporada } from '@/modules/dominio/temporada'
import {
  temporadaParaExibirNoCalendario,
  type RulesetDeTemporada,
} from '@/modules/entrega/estatisticas/temporadas'
import { taxaDaTemporada, type TaxaDaTemporada } from '@/modules/entrega/resultados'

import { TAG_LATERAL } from '../lateral/leitura'

/**
 * OS AGREGADOS DA TEMPORADA, UMA VEZ POR HORA — não uma vez por visita.
 *
 * `temporadasComDados` (GROUP BY sobre todos os jogos encerrados) e
 * `taxaDaTemporada` (CTE sobre apitos × jogos × estatísticas) mudam quando
 * um jogo fecha — poucas vezes por dia — e rodavam em toda abertura de
 * Estatísticas e Resultados. No hiato, Estatísticas é a tela principal
 * (auditoria 23/09). A tag é a da lateral: os mesmos crons que fecham a
 * rodada já a invalidam, e a lateral mostra esses mesmos números.
 *
 * Os argumentos são a chave do cache: por isso o calendário e o piso entram
 * soltos, e não o ruleset inteiro — o mesmo cuidado de `lerLateralCacheada`.
 */
const temporadaExibidaCacheada = unstable_cache(
  async (_hoje: string, config: ConfigTemporada, minimoJogos: number): Promise<string> =>
    temporadaParaExibirNoCalendario(getDb(), config, minimoJogos, new Date()),
  ['temporada-exibida'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

export function temporadaParaExibirCacheada(ruleset: RulesetDeTemporada, agora: Date): Promise<string> {
  return temporadaExibidaCacheada(
    dataDeReferencia(agora, ruleset.rodada.fuso),
    calendarioDoRuleset(ruleset),
    ruleset.temporada.minimo_jogos_para_exibir,
  )
}

export const taxaDaTemporadaCacheada = unstable_cache(
  async (ate: string, dias: number): Promise<TaxaDaTemporada> => taxaDaTemporada(getDb(), ate, dias),
  ['taxa-da-temporada'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)
```

(`_hoje` só entra na chave: é o que faz o cache virar o dia.) Conferir que `calendarioDoRuleset` aceita `RulesetDeTemporada` (é como `temporadaParaExibir` já o chama) e que `TaxaDaTemporada` é exportado de `entrega/resultados`; se não for, exportar o tipo lá.

Nas três telas de estatística: `const temporada = await temporadaParaExibir(db, ruleset, agora)` → `const temporada = await temporadaParaExibirCacheada(ruleset, agora)` e trocar o import. Em `resultados/[data]/page.tsx`, dentro do `Promise.all`: `taxaDaTemporada(getDb(), somarDias(data, 1), diasDaTemporada(...))` → `taxaDaTemporadaCacheada(somarDias(data, 1), diasDaTemporada(data, calendarioDoRuleset(ruleset)))` e trocar o import. Se `db` ou `taxaDaTemporada` ficarem sem uso numa tela, remover do import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/(app)/estatisticas/__tests__/temporada-cacheada.test.ts" "src/app/(app)/lateral/__tests__/cache-forma.test.ts" src/app/__tests__/telas-04-estatisticas.test.ts src/app/__tests__/telas-06-temporada-exibida.test.ts src/app/__tests__/telas-04-resultados.test.ts src/app/__tests__/resultados-url-invalida.test.ts src/app/__tests__/planos-estatisticas.test.ts`
Expected: PASS. Uma suíte de tela que NÃO mocke `next/cache` e renderize essas páginas vai falhar com erro de cache incremental ausente: acrescentar ao arquivo o mesmo mock que as vizinhas usam (`unstable_cache: (fn: unknown) => fn`) e registrar em "Desvios".

---

### Task 12: Bateria, registro e commit único

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-prontidao-lancamento-2k-design.md` (acrescentar "§8 Achados da execução")
- Modify: este plano (seção "Desvios", se houver)

- [ ] **Step 1: Estáticos**

Run: `npm run typecheck && npm run lint && npm run boundaries`
Expected: 0 erros (avisos pré-existentes de `scripts/_*` não contam).

- [ ] **Step 2: Suíte completa em lotes**

A execução única estoura o disco pelo swap (registrado em 22/09). Em lotes de 12 arquivos, um processo por lote, conferindo o disco antes de cada um:

```bash
find src -name "*.test.ts" -o -name "*.test.tsx" | sort > /tmp/lista-testes.txt  # usar o scratchpad da sessão
# para cada lote de 12: npx vitest run <arquivos> --maxWorkers=1 ; parar se df < 200 MB
```

Expected: todos verdes, exceto `src/app/__tests__/telas-04-detalhe.test.ts` (o `%` não commitado de outra entrega). Provar que é só ele: `git stash push -- "src/app/(app)/apito/[jogadorId]/page.tsx"` NÃO — em vez disso copiar o arquivo para o scratchpad, `git show HEAD:<arquivo> > <arquivo>`, rodar o teste, e restaurar a cópia; conferir com `git diff --stat -- <arquivo>` que a mudança voltou.

- [ ] **Step 3: Build**

Run: `npx next build` com as variáveis de banco apontando para `127.0.0.1:1` (sem tocar o Neon), como na auditoria: `DATABASE_URL=postgres://x:y@127.0.0.1:1/db DATABASE_URL_UNPOOLED=postgres://x:y@127.0.0.1:1/db npx next build`.
Expected: sai com 0.

- [ ] **Step 4: Registrar achados**

Acrescentar à spec uma "§8 Achados da execução" com o que mudou em relação ao desenho (desvios, testes existentes ajustados, o que ficou para a Onda 2).

- [ ] **Step 5: Commit único**

```bash
git add <cada arquivo desta branch, listado um a um — NUNCA o page.tsx do apito nem scripts/_*>
git status --short   # conferir: só esta entrega no stage; " M src/app/(app)/apito/[jogadorId]/page.tsx" fora
git commit -F <mensagem em português, no estilo dos commits do repo, terminando com a linha Co-Authored-By>
```

Sem push. O merge é decisão do parceiro.

---

## Desvios

- Sem commit por tarefa: commit único no fim (preferência do parceiro).
- Execução inline, sem revisão por tarefa; revisão única da branch no fim.
- Os desvios de código estão na §8 da spec.
- Task 12: disco zerado por swap duas vezes; lotes 7–18 e build rodados após reinício do Mac.
