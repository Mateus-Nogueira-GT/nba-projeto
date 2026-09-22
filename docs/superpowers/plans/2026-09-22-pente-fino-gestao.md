# Pente fino da Gestão de banca — plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) ou superpowers:executing-plans para implementar tarefa a tarefa.
> Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** provar, botão a botão e com escrita no banco, que a aba `/gestao` funciona para
quem tem acesso — sobre uma temporada simulada de muitas partidas, várias rodadas e mais
de uma conta — e fechar o buraco de teste que deixou a conta ADMIN ver um formulário
inerte sem ninguém perceber.

**Architecture:** nada muda em `src/app` nem em `src/modules` — o defeito não é de código.
Entram **testes** (três suítes novas em `src/app/__tests__`, sobre PGlite + `simularAte`,
sem simular `direito`), **um runbook** com o roteiro do navegador, **um aviso** no runbook
do bootstrap, e — condicionado a D03 — **Playwright** em `e2e/`. O motor não é aberto.

**Tech Stack:** TypeScript, vitest 4 + PGlite (`bancoDeTeste`), `react-dom/server`
(`renderToStaticMarkup`), Drizzle, `simularAte` + `LLMFake`; opcionalmente
`@playwright/test` com o Chromium já instalado em `~/Library/Caches/ms-playwright`.

**Spec:** [`docs/superpowers/specs/2026-09-22-pente-fino-gestao-design.md`](../specs/2026-09-22-pente-fino-gestao-design.md)

---

## Restrições globais

Do `CLAUDE.md` e das preferências do parceiro — valem para todas as tarefas:

1. **Nenhuma regra de estratégia no código**; **o motor é puro e nem é aberto aqui**. Um
   `git diff --stat` que toque `src/modules/motor/**` ou `config/ruleset*.yaml` é sinal
   de que algo saiu do trilho.
2. **Nunca inventar regra.** Os limites de unidades/odd/linha são os do Zod em
   `gestao/acoes.ts`; os números da simulação são os de `demo/simulacao.ts`. O plano
   afirma sobre eles, não os muda.
3. **Nada de simular `direito`** nas suítes novas: o objetivo de T1–T3 é percorrer
   `usuarios → direitos_acesso → nível` de verdade. Só sessão (`cookies`), `next/cache`
   e `db/cliente` são substituídos, como nas suítes vizinhas.
4. **`DEMO_AUTOSSEMEADURA` não é tocada** — nem em `.env.local`, nem na Vercel. É o
   interruptor do parceiro.
5. Domínio em português, infraestrutura em inglês. Comentários contam o **porquê**.
6. Verificação padrão: `npm run typecheck && npm run lint && npm run boundaries && npm test`.
7. **Disco antes de cada bateria:** `df -h / /System/Volumes/Data`; abaixo de ~3 GB
   livres, limpar primeiro (`rm -rf .next node_modules/.vite node_modules/.cache`;
   `npm cache clean --force`). Duas corridas completas comem ~12 GB.
8. **Um commit só, no final** (preferência do parceiro). As tarefas terminam em
   verificação; a T6 commita. Nunca em `main` — branch `pente-fino-gestao`.

---

## Ordem das etapas

| Etapa | O quê | Por que nesta ordem |
| --- | --- | --- |
| 0 | Separar o trabalho da Superbet que está solto; abrir a branch | dois assuntos num commit é o que torna um revert impossível |
| 1 | Acesso real (T1) | é a causa raiz; sem este teste, o sintoma volta em silêncio |
| 2 | Lógica de ponta a ponta e cenários (T2, T3) | só faz sentido depois que o caminho de acesso está provado — as duas suítes dependem de cortesia real |
| 3 | O navegador (T4 runbook; T5 Playwright se D03) | o roteiro descreve o que as etapas 1–2 tornaram possível de provar à mão |
| 4 | Fechamento (T6) | verificação completa e o commit único |

---

# Etapa 0 · Preparação

### T0: separar a Superbet e abrir a branch

**Files:** nenhum novo. Git apenas.

O trabalho da Superbet (adapter, testes, runbooks) está no working tree sem commit e **não
é desta entrega**. Ele é commitado primeiro, sozinho, na `main` — com autorização do
parceiro, que ainda não a deu (ele perguntou "quer que eu feche num commit só e suba?" e
a resposta está pendente).

- [ ] **Step 1:** confirmar com o parceiro: "commito a Superbet agora, separado?" Se
      **não**, `git stash push -u -m superbet` e seguir; `git stash pop` no fim da T6.
- [ ] **Step 2 (se sim):**

```bash
git add src/modules/ingestao/odds/superbet.ts src/modules/ingestao/__tests__/odds-superbet.test.ts \
        src/modules/ingestao/odds/fontes.ts src/modules/ingestao/odds/coleta-do-dia.ts \
        scripts/odds-censo.ts docs/runbooks/casas-de-aposta.md docs/runbooks/deploy.md
git commit -m "Superbet entra como terceira casa: SSE na lista, JSON no detalhe, e o mercado N+ do CJ vem pronto"
```

`src/app/(app)/apito/[jogadorId]/page.tsx` também está modificado — **conferir com
`git diff` o que é antes de incluir**; se for resto de outra sessão, deixar de fora.

- [ ] **Step 3:** `git checkout -b pente-fino-gestao`
- [ ] **Step 4:** `git status --short` mostra só `docs/superpowers/{specs,plans}/2026-09-22-pente-fino-gestao*.md` como novos.

---

# Etapa 1 · O caminho real de acesso

### T1: `gestao-acesso-real.test.ts` — sem simular `direito`

**Files:**
- Create: `src/app/__tests__/gestao-acesso-real.test.ts`
- Modify: `docs/runbooks/bootstrap-admin.md` (uma seção nova, no fim)
- Test: o próprio arquivo

**Interfaces:**
- Consumes: `bancoDeTeste()` → `{ db, fechar }`; `simularAte(db, ruleset, agora, { diasDeHistorico, llm })`;
  `concederCortesia(db, { usuarioId, referencia, inicio, fim, nivelDoPlano })` → `Promise<string>`;
  `registrarEntrada(formData)` (lança o erro de `redirect`, com `digest`);
  `Pagina({ searchParams: Promise<Record<string, string | string[] | undefined>> })`.
- Produces: nada que outra tarefa importe — é o padrão de arnês que T2 e T3 repetem.

**O que este arquivo prova e nenhum outro provava:** que a tela decide silhueta × formulário
lendo `direitos_acesso` de verdade. Por isso **não há `vi.mock('.../direito')`** aqui.

- [ ] **Step 1: escrever o teste (falha porque o runbook ainda não tem a seção — ver Step 5 — e porque as asserções ainda não foram vistas passar)**

```ts
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas, usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { lerFeed } from '../../modules/entrega/lista-secreta'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { concederCortesia } from '../../modules/plataforma/assinatura/direito'

/**
 * O CAMINHO REAL DE ACESSO — a causa raiz do "aperto e não acontece nada".
 *
 * Todas as outras suítes de /gestao simulam `avaliarAcesso`. Aqui não: a
 * conta nasce em `usuarios` sem direito nenhum (exatamente como o ADMIN do
 * bootstrap), a tela é renderizada por cima disso, e só depois a cortesia
 * REAL é concedida. Se alguém um dia fizer ADMIN bypassar `atende()`, ou
 * quebrar o LEFT JOIN de `avaliarAcesso`, é aqui que fica vermelho.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string
let sessao: { usuarioId: string; email: string; dispositivoId: string | null } | null = null

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => sessao,
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
  // Como o ADMIN do bootstrap: linha em `usuarios`, nada em `direitos_acesso`.
  // A metodologia já aceita — o portão dela é de outra suíte (telas-metodologia).
  const [u] = await banco.db
    .insert(usuarios)
    .values({
      email: 'admin-sem-direito@teste.com',
      senhaHash: 'x',
      metodologiaAceitaEm: new Date('2026-01-01T00:00:00.000Z'),
    })
    .returning({ id: usuarios.id })
  usuarioId = u!.id
  sessao = { usuarioId, email: 'admin-sem-direito@teste.com', dispositivoId: null }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

async function renderizar(params: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/gestao/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(params) }))
}

function formularioValido(): FormData {
  const f = new FormData()
  f.set('dataReferencia', HOJE)
  f.set('jogadorId', usuarioId) // qualquer uuid — o portão recusa antes do Zod olhar
  f.set('atributo', 'PONTOS')
  f.set('linha', '20')
  f.set('unidades', '1')
  f.set('odd', '')
  return f
}

describe('conta sem direito — o que o ADMIN do bootstrap vê', () => {
  it('a tela mostra a silhueta e o convite, e NENHUM campo do formulário', async () => {
    const html = await renderizar()
    expect(html).not.toContain('name="unidades"')
    expect(html).not.toContain('>Registrei<')
    expect(html).toContain('Registrar entradas começa no')
    expect(html).toContain('href="/assinar?nivel=MVP&amp;voltar=%2Fgestao"')
  })

  it('a silhueta é inerte por CSS — é a razão do "clico e nada acontece"', () => {
    const css = readFileSync('src/components/planos/SilhuetaPaga.module.css', 'utf8')
    const bloco = css.slice(css.indexOf('.silhueta {'), css.indexOf('}', css.indexOf('.silhueta {')))
    expect(bloco).toContain('pointer-events: none')
  })

  it('a AÇÃO recusa no servidor, pelo caminho real, e não grava nada', async () => {
    const { registrarEntrada } = await import('../(app)/gestao/acoes')
    await expect(registrarEntrada(formularioValido())).rejects.toMatchObject({
      digest: expect.stringContaining('/assinar?nivel=MVP'),
    })
    const linhas = await banco.db
      .select()
      .from(entradasRealizadas)
      .where(eq(entradasRealizadas.usuarioId, usuarioId))
    expect(linhas).toHaveLength(0)
  })
})

describe('a mesma conta, depois de `npm run cortesia`', () => {
  it('o formulário aparece, com chips de banca, unidades, odd e Registrei', async () => {
    await concederCortesia(banco.db, {
      usuarioId,
      referencia: 'cortesia:admin-sem-direito@teste.com',
      inicio: AGORA,
      fim: null,
      nivelDoPlano: 'ALL_STAR',
    })
    const html = await renderizar()
    expect(html).toContain('name="unidades"')
    expect(html).toContain('name="odd"')
    expect(html).toContain('>Registrei<')
    expect(html).toContain('href="/gestao?banca=500"')
    expect(html).not.toContain('Registrar entradas começa no')
  })

  it('e a ação passa a gravar — a mesma cortesia libera tela e servidor', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const item = feed!.conteudo.itens.find((i) => i.linha !== null)!
    const f = formularioValido()
    f.set('jogadorId', item.jogadorId)
    f.set('atributo', item.atributo)
    f.set('linha', String(item.linha))
    const { registrarEntrada } = await import('../(app)/gestao/acoes')
    await expect(registrarEntrada(f)).rejects.toMatchObject({
      digest: expect.stringContaining('/gestao?ver=realizadas'),
    })
    const linhas = await banco.db
      .select()
      .from(entradasRealizadas)
      .where(eq(entradasRealizadas.usuarioId, usuarioId))
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ jogadorId: item.jogadorId, linha: item.linha, unidades: '1.00', odd: null })
  })
})

describe('o runbook do bootstrap avisa', () => {
  it('diz que o ADMIN nasce Grátis e aponta o comando de cortesia', () => {
    const runbook = readFileSync('docs/runbooks/bootstrap-admin.md', 'utf8')
    expect(runbook).toContain('npm run cortesia')
    expect(runbook.toLowerCase()).toContain('grátis')
  })
})
```

- [ ] **Step 2: rodar → o último `describe` FALHA** (o runbook ainda não tem a seção); os
      demais devem PASSAR — se algum falhar, é achado, não erro do teste: registre.

Run: `npx vitest run src/app/__tests__/gestao-acesso-real.test.ts`

- [ ] **Step 3: acrescentar ao fim de `docs/runbooks/bootstrap-admin.md`:**

```markdown
## Depois do bootstrap: ver o app como assinante

O ADMIN nasce **Grátis** no app consumidor. `papel = 'ADMIN'` abre o painel
`/admin/*`; o nível de assinatura sai só de `direitos_acesso`, e o bootstrap não
grava nada lá — de propósito: administrar o sistema e ter direito ao produto são
duas coisas. Sem direito, `/gestao`, o Fire Live e as estatísticas pagas mostram
a **silhueta** (o cadeado), que é inerte por CSS. Clicar nela não faz nada, e é
assim que deve ser para quem não paga.

Para testar como assinante, conceda cortesia à própria conta:

    CORTESIA_EMAIL=<e-mail do admin> CORTESIA_ATE=2026-12-31 \
      npx dotenv -e .env.local -- npm run cortesia

Reexecutar atualiza a mesma cortesia; `CORTESIA_ATE` faz expirar sozinha.
Detalhes em `cobranca-e-acesso.md`.
```

- [ ] **Step 4: rodar de novo → PASS (todos)**
- [ ] **Step 5: `npm run typecheck && npm run lint`** limpos.

---

# Etapa 2 · A lógica de ponta a ponta

### T2: `gestao-ponta-a-ponta.test.ts` — registrar, redirecionar, ver; 49 dias

**Files:**
- Create: `src/app/__tests__/gestao-ponta-a-ponta.test.ts`
- Test: o próprio arquivo

**Interfaces:**
- Consumes: os mesmos de T1, mais `registrarEntradaRealizada(db, {...})` e `somarDias(dia, n)`.
- Produces: nada.

**O que este arquivo prova:** o ciclo inteiro que o navegador faria, menos o clique — ação
real → redirect (pelo `digest`) → página real renderizada com o `searchParams` do redirect.
Duas contas com cortesia real.

- [ ] **Step 1: escrever o teste**

```ts
import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas, usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia, somarDias } from '../../modules/dominio/rodada'
import { registrarEntradaRealizada } from '../../modules/entrega/gestao-realizadas'
import { lerFeed } from '../../modules/entrega/lista-secreta'
import type { ItemFeed } from '../../modules/entrega/lista-secreta'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { concederCortesia } from '../../modules/plataforma/assinatura/direito'

/**
 * A GESTÃO DE PONTA A PONTA, SEM NAVEGADOR — sobre 49 dias de temporada
 * simulada (~315 partidas) e duas contas com cortesia REAL.
 *
 * Cada caso é o que o navegador faria: a AÇÃO de verdade, o destino do
 * redirect lido do `digest`, e a PÁGINA de verdade renderizada com esse
 * destino. Nenhuma asserção nomeia jogador: o sujeito vem do feed.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioA: string
let usuarioB: string
let itens: ItemFeed[]
let sessao: { usuarioId: string; email: string; dispositivoId: string | null } | null = null

vi.mock('../../modules/plataforma/auth/cookies', () => ({ sessaoAtual: async () => sessao }))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db, fecharDb: async () => {} }))

async function contaComCortesia(email: string): Promise<string> {
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email, senhaHash: 'x', metodologiaAceitaEm: new Date('2026-01-01T00:00:00.000Z') })
    .returning({ id: usuarios.id })
  await concederCortesia(banco.db, {
    usuarioId: u!.id,
    referencia: `cortesia:${email}`,
    inicio: AGORA,
    fim: null,
    nivelDoPlano: 'ALL_STAR',
  })
  return u!.id
}

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 49, llm: new LLMFake() })
  usuarioA = await contaComCortesia('a@teste.com')
  usuarioB = await contaComCortesia('b@teste.com')
  const feed = await lerFeed(banco.db, HOJE)
  itens = feed!.conteudo.itens.filter((i) => i.linha !== null)
  expect(itens.length).toBeGreaterThanOrEqual(4) // os casos abaixo usam quatro itens distintos
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 360_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

const como = (usuarioId: string, email: string) => {
  sessao = { usuarioId, email, dispositivoId: null }
}

async function renderizar(params: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/gestao/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(params) }))
}

const semEntidades = (t: string) =>
  t.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const textoDaTela = (html: string) => semEntidades(html.replace(/<[^>]+>/g, ''))

function formulario(item: ItemFeed, unidades: string, odd: string): FormData {
  const f = new FormData()
  f.set('dataReferencia', HOJE)
  f.set('jogadorId', item.jogadorId)
  f.set('atributo', item.atributo)
  f.set('linha', String(item.linha))
  f.set('unidades', unidades)
  f.set('odd', odd)
  return f
}

async function acionar(f: FormData): Promise<string> {
  const { registrarEntrada } = await import('../(app)/gestao/acoes')
  try {
    await registrarEntrada(f)
  } catch (erro) {
    const digest = (erro as { digest?: string }).digest ?? ''
    // O `digest` do redirect do Next carrega o destino depois do último ';'
    // — é o que a tela receberia como URL.
    return digest.split(';').find((p) => p.startsWith('/')) ?? digest
  }
  throw new Error('registrarEntrada devia ter redirecionado')
}

const linhasDe = (usuarioId: string) =>
  banco.db.select().from(entradasRealizadas).where(eq(entradasRealizadas.usuarioId, usuarioId))

describe('registrar → redirecionar → ver', () => {
  it('entrada válida: redireciona para Realizadas, e ela mostra o que foi digitado', async () => {
    como(usuarioA, 'a@teste.com')
    const destino = await acionar(formulario(itens[0]!, '1.5', '1.62'))
    expect(destino).toContain('/gestao?ver=realizadas')

    const html = await renderizar({ ver: 'realizadas' })
    const texto = textoDaTela(html)
    expect(texto).toContain(itens[0]!.nome)
    expect(texto).toContain('1.5 unidades')
    expect(texto).toContain('odd 1.62')

    const linhas = await linhasDe(usuarioA)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ unidades: '1.50', odd: '1.62', dataReferencia: HOJE })
  })

  it('registrar DE NOVO a mesma linha atualiza: uma entrada, valores novos', async () => {
    como(usuarioA, 'a@teste.com')
    await acionar(formulario(itens[0]!, '3', '2.10'))

    const texto = textoDaTela(await renderizar({ ver: 'realizadas' }))
    expect(texto).toContain('3 unidades')
    expect(texto).toContain('odd 2.10')
    expect(texto).not.toContain('1.5 unidades')

    const linhas = await linhasDe(usuarioA)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ unidades: '3.00', odd: '2.10' })
  })

  it('inválido: vai para ?erro=, a tela traduz o código, e o banco não muda', async () => {
    como(usuarioA, 'a@teste.com')
    const antes = await linhasDe(usuarioA)
    const destino = await acionar(formulario(itens[1]!, '0', '1.9'))
    expect(destino).toContain('/gestao?erro=entrada-invalida')

    const html = await renderizar({ erro: 'entrada-invalida' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Confira unidades e odd.')
    expect(await linhasDe(usuarioA)).toHaveLength(antes.length)
  })
})

describe('o que a visão Realizadas NÃO mostra', () => {
  it('entrada de ONTEM não aparece hoje', async () => {
    como(usuarioA, 'a@teste.com')
    await registrarEntradaRealizada(banco.db, {
      usuarioId: usuarioA,
      dataReferencia: somarDias(HOJE, -1),
      jogadorId: itens[2]!.jogadorId,
      atributo: itens[2]!.atributo,
      linha: itens[2]!.linha!,
      unidades: 9.5,
      odd: null,
      agora: AGORA,
    })
    const texto = textoDaTela(await renderizar({ ver: 'realizadas' }))
    expect(texto).not.toContain('9.5 unidades')
  })

  it('a entrada de OUTRO usuário não aparece — e aparece para ele', async () => {
    como(usuarioB, 'b@teste.com')
    await acionar(formulario(itens[3]!, '7.5', ''))
    expect(textoDaTela(await renderizar({ ver: 'realizadas' }))).toContain('7.5 unidades')

    como(usuarioA, 'a@teste.com')
    expect(textoDaTela(await renderizar({ ver: 'realizadas' }))).not.toContain('7.5 unidades')
  })

  it('N entradas saem da mais recente para a mais antiga', async () => {
    como(usuarioB, 'b@teste.com')
    const [p, q, r] = [itens[0]!, itens[1]!, itens[2]!]
    for (const [i, item] of [p, q, r].entries()) {
      await registrarEntradaRealizada(banco.db, {
        usuarioId: usuarioB,
        dataReferencia: HOJE,
        jogadorId: item.jogadorId,
        atributo: item.atributo,
        linha: item.linha!,
        unidades: 1,
        odd: null,
        agora: new Date(AGORA.getTime() + (i + 1) * 60_000),
      })
    }
    const texto = textoDaTela(await renderizar({ ver: 'realizadas' }))
    expect(texto.indexOf(r.nome)).toBeLessThan(texto.indexOf(q.nome))
    expect(texto.indexOf(q.nome)).toBeLessThan(texto.indexOf(p.nome))
  })
})

describe('banca', () => {
  it('inválida cai no padrão de R$ 1.000, sem NaN', async () => {
    como(usuarioA, 'a@teste.com')
    for (const banca of ['abc', '0', '-5']) {
      const html = await renderizar({ banca })
      expect(html).not.toContain('NaN')
      expect(html).toMatch(/aria-current="page"[^>]*>R\$\s?1\.000,00</)
    }
  })

  it('R$ 500 muda a unidade e os limites, e marca o chip', async () => {
    como(usuarioA, 'a@teste.com')
    const html = await renderizar({ banca: '500' })
    expect(html).toMatch(/aria-current="page"[^>]*>R\$\s?500,00</)
    expect(html).toMatch(/R\$\s?5,00/) // 1 unidade = 1% da banca (ruleset gestao_banca)
    expect(html).not.toMatch(/aria-current="page"[^>]*>R\$\s?1\.000,00</)
  })
})
```

- [ ] **Step 2: rodar** — `npx vitest run src/app/__tests__/gestao-ponta-a-ponta.test.ts`.
      Esperado: PASS. Qualquer vermelho é **achado** (a tela ou a ação se comportando
      diferente do que a spec §5 afirma): registrar no relatório da T6, **não** ajustar a
      asserção para passar.
- [ ] **Step 3:** conferir o tempo: a suíte deve ficar abaixo de 4 min. Se passar disso,
      reduzir `diasDeHistorico` para 35 **e anotar no cabeçalho do arquivo** o porquê.

### T3: `gestao-cenarios-temporada.test.ts` — rodada cheia, rodada vazia, outra semente, volume

**Files:**
- Create: `src/app/__tests__/gestao-cenarios-temporada.test.ts`
- Test: o próprio arquivo

**Interfaces:**
- Consumes: os de T1/T2, mais `jogos`, `estatisticasJogo` do schema e `count` do drizzle.
- Produces: nada.

- [ ] **Step 1: escrever o teste**

```ts
import { count, countDistinct, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { estatisticasJogo, jogos, usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { lerFeed } from '../../modules/entrega/lista-secreta'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { concederCortesia } from '../../modules/plataforma/assinatura/direito'

/**
 * CENÁRIOS DA TEMPORADA — duas sementes, dois bancos.
 *
 * A semente padrão numa PGlite com 49 dias (a janela inteira, ~315 partidas)
 * e uma segunda semente noutra PGlite com 21 dias: se a Gestão só funciona
 * porque a primeira rodada é generosa, a segunda mostra. E a TRAVA DE VOLUME
 * é o que impede a temporada de encurtar em silêncio num refactor da
 * simulação — uma demo pela metade parece funcionar.
 */

const FUSO = 'America/Sao_Paulo'
type Banco = Awaited<ReturnType<typeof bancoDeTeste>>
type Mundo = { banco: Banco; agora: Date; hoje: string; usuarioId: string }

let ativo: Mundo
let a: Mundo
let b: Mundo

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: ativo.usuarioId, email: 'x@teste.com', dispositivoId: null }),
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => ativo.banco.db, fecharDb: async () => {} }))

async function mundo(agora: Date, diasDeHistorico: number, semente?: string): Promise<Mundo> {
  const banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), agora, { diasDeHistorico, llm: new LLMFake(), semente })
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: `${semente ?? 'padrao'}@teste.com`, senhaHash: 'x', metodologiaAceitaEm: agora })
    .returning({ id: usuarios.id })
  await concederCortesia(banco.db, {
    usuarioId: u!.id,
    referencia: `cortesia:${semente ?? 'padrao'}`,
    inicio: agora,
    fim: null,
    nivelDoPlano: 'ALL_STAR',
  })
  return { banco, agora, hoje: dataDeReferencia(agora, FUSO), usuarioId: u!.id }
}

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  a = await mundo(new Date('2026-01-15T18:00:00.000Z'), 49)
  b = await mundo(new Date('2026-02-20T18:00:00.000Z'), 21, 'pente-fino-b')
  vi.useFakeTimers({ toFake: ['Date'] })
}, 600_000)

afterAll(async () => {
  vi.useRealTimers()
  await a.banco.fechar()
  await b.banco.fechar()
})

function entrar(m: Mundo) {
  ativo = m
  vi.setSystemTime(m.agora)
}

async function renderizar(params: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/gestao/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(params) }))
}

describe('trava de volume — a temporada tem MUITAS partidas mesmo', () => {
  it('49 dias: ≥ 250 jogos encerrados, ≥ 3.500 linhas de box, ≥ 40 rodadas', async () => {
    const [encerrados] = await a.banco.db
      .select({ n: count() })
      .from(jogos)
      .where(eq(jogos.status, 'ENCERRADO'))
    const [box] = await a.banco.db.select({ n: count() }).from(estatisticasJogo)
    const [rodadas] = await a.banco.db.select({ n: countDistinct(jogos.dataReferencia) }).from(jogos)
    expect(encerrados!.n).toBeGreaterThanOrEqual(250)
    expect(box!.n).toBeGreaterThanOrEqual(3500)
    expect(rodadas!.n).toBeGreaterThanOrEqual(40)
  })
})

describe.each([
  ['semente padrão, 49 dias', () => a],
  ['semente pente-fino-b, 21 dias', () => b],
])('rodada cheia · %s', (_rotulo, pegar) => {
  it('um "Registrei" por item com linha, e o resumo conta os apitos certos', async () => {
    const m = pegar()
    entrar(m)
    const feed = await lerFeed(m.banco.db, m.hoje)
    const itens = feed!.conteudo.itens
    const comLinha = itens.filter((i) => i.linha !== null)
    expect(itens.length).toBeGreaterThan(0)

    const html = await renderizar()
    const registrei = (html.match(/>Registrei</g) ?? []).length
    expect(registrei).toBe(comLinha.length)
    expect(html).toContain(`${itens.length} apito${itens.length === 1 ? '' : 's'} na lista`)

    const siglas = new Set(itens.map((i) => i.timeSigla))
    const grupos = (html.match(/<section style="display:grid;gap:8px"/g) ?? []).length
    expect(grupos).toBe(siglas.size)
  })

  it('item SEM linha: sem formulário e sem erro — o link do jogador continua', async () => {
    const m = pegar()
    entrar(m)
    const feed = await lerFeed(m.banco.db, m.hoje)
    const semLinha = feed!.conteudo.itens.find((i) => i.linha === null)
    if (!semLinha) return // esta semente não produziu um; a outra pode
    const html = await renderizar()
    expect(html).toContain(`href="/apito/${semLinha.jogadorId}?atributo=${semLinha.atributo}"`)
    const trecho = html.slice(html.indexOf(`/apito/${semLinha.jogadorId}`), html.indexOf('</div>', html.indexOf(`/apito/${semLinha.jogadorId}`) + 400))
    expect(trecho).not.toContain('>Registrei<')
  })
})

describe('rodada SEM lista publicada', () => {
  it('avisa e leva para a Lista Secreta em vez de uma tela vazia muda', async () => {
    entrar(a)
    // Amanhã ainda não foi produzido: o feed de amanhã não existe.
    vi.setSystemTime(new Date(a.agora.getTime() + 24 * 60 * 60 * 1000))
    const html = await renderizar()
    expect(html).toContain('A lista de hoje ainda não foi publicada.')
    expect(html).toContain('Ver a Lista Secreta')
    expect(html).not.toContain('>Registrei<')
    vi.setSystemTime(a.agora)
  })
})
```

- [ ] **Step 2: rodar** — `npx vitest run src/app/__tests__/gestao-cenarios-temporada.test.ts`.
      Esperado: PASS. Um vermelho na trava de volume com a simulação intocada significa que
      os pisos (250 / 3.500 / 40) estão altos demais para a janela de janeiro (a temporada
      abre em outubro): **medir** os números reais com um `console.log` provisório e fixar
      os pisos em ~80 % do medido, anotando o valor medido no comentário.
- [ ] **Step 3:** `df -h /` — as três suítes novas sobem quatro PGlites; conferir o disco
      antes de rodar `npm test` inteiro na T6.

---

# Etapa 3 · O navegador de verdade

### T4: `docs/runbooks/pente-fino-gestao.md` — o roteiro manual

**Files:**
- Create: `docs/runbooks/pente-fino-gestao.md`
- Modify: `docs/runbooks/deploy.md` — uma linha na seção da demo apontando para o novo runbook

**Interfaces:** nenhuma de código. É o documento que o parceiro segue no navegador.

- [ ] **Step 1: escrever o runbook**

```markdown
# Runbook — pente fino da Gestão no navegador

**Data:** 22/09/2026 · implementa a seção 5 da spec
[`2026-09-22-pente-fino-gestao-design.md`](../superpowers/specs/2026-09-22-pente-fino-gestao-design.md).

O que os testes automatizados não fazem é **clicar**. Este roteiro faz, num navegador de
verdade, sobre a temporada simulada de 49 dias — e a cada passo diz o que conferir na tela
**e** no banco. Leva ~30 minutos.

---

## 0 · Antes de qualquer coisa: onde este banco está

`.env.local` e a produção apontam para o **mesmo Neon**. Isso é seguro enquanto o banco só
tiver dado simulado, porque `demo:temporada` é idempotente. **Confira:**

    vercel env ls production | grep -E 'NBA_INGESTAO_HABILITADA|DEMO_AUTOSSEMEADURA'

- `NBA_INGESTAO_HABILITADA` ausente ou `false` → siga.
- `NBA_INGESTAO_HABILITADA=true` → **pare.** O Neon tem dado real. Crie um branch no
  console do Neon (Branches → Create branch, a partir de `main`), copie a connection
  string do branch para `DATABASE_URL` no `.env.local`, e só então siga.
- `DEMO_AUTOSSEMEADURA`: **não mexa.** É o interruptor do parceiro; este roteiro não
  depende dela.

## 1 · Dado: a temporada com muitas partidas

    df -h / /System/Volumes/Data          # abaixo de 3 GB livres, limpe antes
    npx dotenv -e .env.local -- npm run demo:temporada
    npx dotenv -e .env.local -- npm run demo:conferir

Termina em `✓ Temporada pronta até hoje.` Se disser `! Faltam N dia(s)`, rode
`demo:temporada` de novo. Ordem de grandeza: ~49 dias, ~315 jogos, ~4.600 linhas de box.

## 2 · Conta: a sua, como assinante

    CORTESIA_EMAIL=<seu e-mail> CORTESIA_ATE=2026-12-31 \
      npx dotenv -e .env.local -- npm run cortesia

Saída esperada: `Cortesia ativa para … · direito <uuid>`. Se disser "usuário não existe",
a conta ainda não foi criada — `npm run admin:bootstrap` ou cadastro pela tela.

Para o teste de dois usuários (passo 6), uma segunda conta:

    CONTA_TESTE_EMAIL=segunda@nip.test CONTA_TESTE_SENHA='<12+ caracteres, letra e número>' \
      npx dotenv -e .env.local -- npm run conta:teste

## 3 · Subir

    npm run dev

Abra `http://localhost:3000/entrar`, entre, aceite a metodologia se for a primeira vez,
e vá para `/gestao`. Deixe uma segunda aba aberta em `npm run db:studio` (Drizzle Studio)
na tabela `entradas_realizadas`, filtrada pelo seu `usuario_id`.

## 4 · Roteiro — marque cada linha

Legenda: **T** = o que a tela mostra · **B** = o que o banco mostra (Drizzle Studio, F5).

### Acesso
- [ ] Antes da cortesia (ou com a segunda conta ainda sem ela): `/gestao` mostra 4 blocos
      borrados, um cadeado e "Registrar entradas começa no MVP". **Clicar nos blocos não
      faz nada — é o esperado.** T: sem campos. B: nada.
- [ ] Depois da cortesia: chips R$ 200/500/1.000/5.000, "Outro valor", os 4 números, as
      linhas agrupadas por time, cada uma com unidades/odd/Registrei.

### Banca
- [ ] Clicar **R$ 500** → URL `?banca=500`; chip destacado; "1 unidade" = R$ 5,00; teto,
      stop win e stop loss mudam. Os valores das linhas mudam junto.
- [ ] Digitar **750** em "Outro valor" → **Aplicar** → URL `?banca=750`; "1 unidade" = R$ 7,50.
- [ ] Digitar **-5** → Aplicar → o navegador barra (`min=1`). Editar a URL para
      `?banca=abc` → volta a R$ 1.000, sem "NaN" em lugar nenhum.

### Registrar
- [ ] Na primeira linha: unidades **1,5**, odd **1,62**, **Registrei** → a URL vira
      `?ver=realizadas`; a entrada aparece: "PTS N+ · 1.5 unidades · odd 1.62" e a hora.
      B: 1 linha, `unidades 1.50`, `odd 1.62`, `data_referencia` = hoje.
- [ ] Voltar a **Sugeridas**, **mesma linha**: unidades **3**, odd **2,10**, Registrei →
      Realizadas mostra "3 unidades · odd 2.10" — **uma entrada só**. B: **ainda 1 linha**,
      valores novos, `registrada_em` avançou.
- [ ] Outra linha, odd **em branco** → Realizadas mostra "odd —". B: `odd` nulo.
- [ ] Odd **0,5** → o navegador barra (`min=1.01`). Para testar o servidor: F12 → Console
      → `document.querySelectorAll('form[action] input[name=odd]')[0].form.noValidate=true`
      → Registrei → URL `?erro=entrada-invalida` e "Confira unidades e odd." no topo.
      B: **nenhuma linha nova**.
- [ ] **JavaScript desligado** (Chrome: F12 → ⋮ → Settings → Debugger → Disable JavaScript;
      recarregar): repetir o **Aplicar** e um **Registrei**. Os dois funcionam igual — a
      tela promete isso e este é o único lugar que confere.

### Realizadas
- [ ] Registrar 3 linhas diferentes com um minuto entre elas → a mais recente aparece
      **primeiro**.
- [ ] Na segunda conta (outra janela anônima): registrar **7,5 unidades**. Na sua conta,
      Realizadas **não** mostra "7.5 unidades". B: `usuario_id` diferentes.
- [ ] Rodapé: "Somente leitura: a NIP não envia aposta…" presente.

### Sessão
- [ ] Em `/conta`, encerrar a sessão deste aparelho; voltar à aba da Gestão (ainda
      renderizada) e clicar Registrei → cai em `/entrar?destino=/gestao`, sem gravar.

## 5 · Depois

Cada item que **não** se comportou como descrito é um achado: anote tela, ação, esperado,
observado, e o estado do banco. Achado é matéria de spec nova, não de correção inline.

Para desfazer a demo (só se este banco for um branch ou for aceitável perder a demo):
`npx dotenv -e .env.local -- npm run demo:limpar -- --confirmar`. Contas e cortesias ficam.
```

- [ ] **Step 2:** em `docs/runbooks/deploy.md`, logo após o bloco de comandos de
      `demo:temporada`, acrescentar: `Para conferir a Gestão botão a botão sobre essa
      temporada, ver [pente-fino-gestao.md](pente-fino-gestao.md).`
- [ ] **Step 3:** `npm run lint` (o markdown não é lintado, mas o comando é a verificação
      padrão) — limpo.

### T5 (condicionada a D03 = sim): Playwright — o roteiro da T4 repetível

**Files:**
- Modify: `package.json` (devDependency + script `e2e`), `.gitignore` (`test-results/`, `playwright-report/`)
- Create: `playwright.config.ts`, `e2e/gestao.spec.ts`

**Interfaces:**
- Consumes: o app rodando em `E2E_BASE_URL` (padrão `http://localhost:3000`), a temporada
  carregada (T4 §1) e uma conta com cortesia (`E2E_EMAIL`, `E2E_SENHA` — T4 §2).
  Campos do login: `name="email"`, `name="senha"` (`src/app/(app)/entrar/formulario.tsx`).
- Produces: `npm run e2e`.

Não entra no CI: precisa de `next dev` e de banco. Roda à mão, depois do runbook.

- [ ] **Step 1: instalar**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium   # reaproveita ~/Library/Caches/ms-playwright
```

- [ ] **Step 2: `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

/**
 * E2E da Gestão — fora do CI. Precisa de `npm run dev` no ar, da temporada
 * simulada carregada e de uma conta com cortesia (runbook pente-fino-gestao).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1, // as specs escrevem na MESMA conta; em paralelo uma apagaria a outra
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
})
```

- [ ] **Step 3: `package.json`** — em `scripts`: `"e2e": "playwright test"`. Em
      `.gitignore`: `test-results/` e `playwright-report/`.

- [ ] **Step 4: `e2e/gestao.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL ?? ''
const SENHA = process.env.E2E_SENHA ?? ''
test.skip(!EMAIL || !SENHA, 'defina E2E_EMAIL e E2E_SENHA (conta com cortesia)')

/** Login real pela tela; aceita a metodologia se for a primeira vez. */
async function entrar(page: Page) {
  await page.goto('/entrar?destino=/')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="senha"]', SENHA)
  await page.locator('form button[type="submit"]').first().click()
  await page.goto('/gestao')
  if (page.url().includes('/metodologia')) {
    await page.locator('form button[type="submit"]').first().click()
    await page.goto('/gestao')
  }
  await expect(page).toHaveURL(/\/gestao/)
}

test.describe('Gestão de banca — botão a botão', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page)
  })

  test('assinante vê o formulário, não a silhueta', async ({ page }) => {
    await expect(page.locator('input[name="unidades"]').first()).toBeVisible()
    await expect(page.getByText('Registrar entradas começa no')).toHaveCount(0)
  })

  test('chips e Aplicar mudam a banca pela URL', async ({ page }) => {
    await page.getByRole('link', { name: /R\$\s?500,00/ }).click()
    await expect(page).toHaveURL(/banca=500/)
    await expect(page.getByText(/R\$\s?5,00/).first()).toBeVisible()

    await page.fill('input[name="banca"]', '750')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page).toHaveURL(/banca=750/)
    await expect(page.getByText(/R\$\s?7,50/).first()).toBeVisible()
  })

  test('registrar, registrar de novo, e ver uma entrada só', async ({ page }) => {
    const primeira = page.locator('form[action]').filter({ has: page.locator('input[name="unidades"]') }).first()

    await primeira.locator('input[name="unidades"]').fill('1.5')
    await primeira.locator('input[name="odd"]').fill('1.62')
    await primeira.getByRole('button', { name: 'Registrei' }).click()
    await expect(page).toHaveURL(/ver=realizadas/)
    await expect(page.getByText('1.5 unidades')).toBeVisible()
    await expect(page.getByText('odd 1.62')).toBeVisible()

    await page.goto('/gestao')
    const mesma = page.locator('form[action]').filter({ has: page.locator('input[name="unidades"]') }).first()
    await mesma.locator('input[name="unidades"]').fill('3')
    await mesma.locator('input[name="odd"]').fill('2.10')
    await mesma.getByRole('button', { name: 'Registrei' }).click()
    await expect(page).toHaveURL(/ver=realizadas/)
    // Uma entrada só: a antiga sumiu e a nova está lá — é o upsert visto da tela.
    await expect(page.getByText('3 unidades')).toHaveCount(1)
    await expect(page.getByText('1.5 unidades')).toHaveCount(0)
  })

  test('odd inválida passa do navegador e é recusada no servidor', async ({ page }) => {
    const form = page.locator('form[action]').filter({ has: page.locator('input[name="odd"]') }).first()
    await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true))
    await form.locator('input[name="odd"]').fill('0.5')
    await form.getByRole('button', { name: 'Registrei' }).click()
    await expect(page).toHaveURL(/erro=entrada-invalida/)
    await expect(page.getByRole('alert')).toHaveText('Confira unidades e odd.')
  })
})

test.describe('sem JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('Aplicar e Registrei funcionam por formulário puro', async ({ page }) => {
    await entrar(page)
    await page.fill('input[name="banca"]', '800')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page).toHaveURL(/banca=800/)

    const form = page.locator('form[action]').filter({ has: page.locator('input[name="unidades"]') }).first()
    await form.locator('input[name="unidades"]').fill('2')
    await form.getByRole('button', { name: 'Registrei' }).click()
    await expect(page).toHaveURL(/ver=realizadas/)
    await expect(page.getByText('2 unidades')).toBeVisible()
  })
})
```

- [ ] **Step 5: rodar** com o app no ar e a temporada carregada:

```bash
E2E_EMAIL=<e-mail com cortesia> E2E_SENHA='<senha>' npm run e2e
```

Esperado: PASS. Se `entrar` cair em `/metodologia` e o seletor genérico não achar o botão,
abrir `src/app/(app)/metodologia/page.tsx`, ler o `name`/texto do botão de aceite e trocar
o seletor por ele — **sem** mudar a tela.

- [ ] **Step 6:** `npm run typecheck && npm run lint`. Se o lint reclamar de `e2e/**`
      (parser sem o projeto TS), adicionar `'e2e/**'` ao array `ignores` de
      `eslint.config.mjs` e rodar de novo → limpo.

---

# Etapa 4 · Fechamento

### T6: verificação completa e o commit único

**Files:** nenhum novo.

- [ ] **Step 1:** `df -h / /System/Volumes/Data` — ≥ 3 GB livres, senão limpar.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm run boundaries && npm test`
      — tudo verde. `git diff --stat` **não** toca `src/modules/motor/**`, `config/`, nem
      `src/app/(app)/gestao/**`.
- [ ] **Step 3: relatório de achados** — se T2/T3/T4 apontaram algo que a tela ou a ação
      fazem diferente da spec §5, listar em `docs/superpowers/specs/2026-09-22-pente-fino-gestao-design.md`,
      numa seção nova `## 9. Achados da execução`, um por linha: elemento · esperado ·
      observado · onde está provado. Nenhum achado → escrever "Nenhum: a aba se comportou
      como a spec §5 descreve, em todos os casos automatizados e no roteiro manual."
- [ ] **Step 4:** se T0 fez `stash`, `git stash pop` **antes** do commit e conferir que os
      arquivos da Superbet voltaram sem conflito.
- [ ] **Step 5: commit**

```bash
git add src/app/__tests__/gestao-acesso-real.test.ts \
        src/app/__tests__/gestao-ponta-a-ponta.test.ts \
        src/app/__tests__/gestao-cenarios-temporada.test.ts \
        docs/runbooks/pente-fino-gestao.md docs/runbooks/bootstrap-admin.md docs/runbooks/deploy.md \
        docs/superpowers/specs/2026-09-22-pente-fino-gestao-design.md \
        docs/superpowers/plans/2026-09-22-pente-fino-gestao.md
# se T5 rodou:
git add package.json package-lock.json .gitignore playwright.config.ts e2e/
git commit -m "Gestão de banca provada botão a botão: acesso real, 49 dias de temporada, duas contas — e o aviso que faltava ao ADMIN"
```

Sem push, sem PR: o parceiro decide.

---

## Desvios do plano

Registrados na execução de 22/09 (a lista completa, com o custo de cada um, está no ledger
da execução). Nenhum toca `src/app`, `src/modules` ou `config/`.

- **T0:** já feita antes da retomada (Superbet em `2858d9f`, sem o `%` do apito, que segue
  fora deste trabalho).
- **T2:** "N entradas…" usava `itens[0..2]`, que são o **mesmo jogador** em três linhas (o
  feed traz um item por linha). Os sujeitos passaram a ser três **jogadores** distintos; a
  asserção de ordem ficou intacta e foi provada vermelha com o `orderBy` invertido.
- **T3:** "rodada cheia" contava um "Registrei" por item do feed (18); a tela mostra um por
  card (6). O teste conta cards (achado 1 da spec §9). "Item sem linha" virou `skip` com
  motivo em vez de `return` verde (achado 2). Números medidos anotados na trava de volume.
- **T4:** três fatos corrigidos no runbook — a frase final é do `demo:temporada`, não do
  `demo:conferir`; `vercel env ls` não mostra valor (achado 3); sessão se encerra por
  "Sair" em `/conta`. Passos falam em card/jogador, e há uma linha para observar o achado 1.
- **T5:** `@playwright/test` fixo em **1.62.1** (reaproveita o Chromium 1234 do cache; a
  1.63 baixaria outro); `entrar()` espera a URL sair de `/entrar`; o formulário do card é
  achado por `input[name=unidades]`, não `form[action]`; o `alert` é filtrado pelo texto
  (o anunciador de rotas do Next também é `role="alert"`). Não rodou ao vivo (achado 4).
- **Revisão final (Opus, branch inteira):** quatro correções importantes, todas em teste e
  documento — o T1 passou a usar uma conta **ADMIN** de fato (sem isso, um "conserto" que
  deixasse ADMIN pular o portão passava verde; provado com o bypass plantado); o teste de
  banca compara os quatro números e a exposição entre R$ 1.000 e R$ 500 em vez de procurar
  "R$ 5,00" solto (provado com a tela ignorando a banca); o E2E entra **uma vez**, com JS,
  num projeto `setup`, e todas as specs reaproveitam a sessão (o login é função de cliente
  e sem JS não envia — conferido renderizando o formulário: `action="javascript:throw…"`;
  e um login por teste criava um aparelho por teste); o §0 do runbook confere o **dado**
  antes da configuração. Mais: o diagnóstico do runbook vem antes da cortesia, `/cadastrar`
  no lugar de `admin:bootstrap`, e o aviso do bootstrap usa o arquivo de variáveis dele.
- **Commits:** a execução commitou por tarefa na branch e esmagou tudo num commit só no
  fim — a preferência de "um commit só" é sobre o histórico que fica.
