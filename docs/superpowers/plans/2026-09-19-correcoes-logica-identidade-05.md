# Correções de lógica — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os cinco defeitos de funcionamento que a auditoria de 19/09 encontrou na Identidade 05 — um contador que ignora os filtros, um aproveitamento com dois formatos, uma doca que ignora `CHAT_HABILITADO`, um cron que não invalida a lateral, e um caminho de cache que nunca rodou contra o Next real — sem tocar no motor nem no ruleset.

**Architecture:** Cinco correções pequenas e independentes, cada uma com o teste que a trava: (1) um formatador único em `src/components/formato.ts`; (2) `contador.total` no cabeçalho e "N de M" na Lista; (3) o portão `configuracaoChat().habilitado` na montagem da lateral (camada de leitura, não no componente); (4) `revalidateTag(TAG_LATERAL, 'max')` na demo e um teste de fonte que obriga toda rota de cron que escreve rodada a invalidar; (5) um teste de fonte que fixa a forma do cache e um roteiro de preview que prova a invalidação de verdade. Nenhuma tabela, rota ou campo novo.

**Tech Stack:** Next.js 16.3 (`unstable_cache` + `revalidateTag(tag, 'max')`, sem `cacheComponents`), Vitest com `renderToStaticMarkup` e PGlite; `vi.mock('next/cache')` nas suítes de tela.

**Spec:** [`docs/superpowers/specs/2026-09-19-correcoes-logica-identidade-05-design.md`](../specs/2026-09-19-correcoes-logica-identidade-05-design.md) · **Irmã:** [`plano de UX no desktop`](2026-09-19-correcoes-ux-desktop-identidade-05.md). Os dois podem rodar na mesma branch — o de UX primeiro. Se rodarem em branches separadas, este cria `correcoes-logica-05` no worktree `nba-projeto-logica` (Task 0.1).

## Global Constraints

- **Domínio em português, infraestrutura em inglês.**
- **O motor não muda; o ruleset não muda.** Nada em `src/modules/motor/**` nem em `config/`. `npm run boundaries` continua verde.
- **Regra 3 do CLAUDE.md:** nenhuma das cinco correções é regra de estratégia; se alguma tarefa esbarrar numa decisão que o ruleset não cobre, parar e perguntar.
- **Um número, uma função** (spec §3.1): `formatarAproveitamento` é o único lugar que escreve aproveitamento; call-site nunca formata.
- **A regra de ambiente mora em um lugar** (spec §3.2): `configuracaoChat()` decide; ninguém lê `CHAT_HABILITADO` direto.
- **Quem escreve o que a lateral lê, invalida a lateral** (spec §3.3): o teste de fonte da Task 4.2 é a lei; a próxima rota de cron cai nela.
- **O paywall não vaza:** `paywall.test.ts` continua verde em toda tarefa (a lateral segue lendo só dado grátis).
- **Verificação de cada tarefa:** `npx vitest run <alvos>`; **ao fim de cada fase:** `npm run typecheck && npm run lint && npm run boundaries && npm test`.
- **Um commit só, no final** (preferência do parceiro, MEMORY.md). A Task 5.3 commita. Sem push, sem PR. Nunca commitar em `main`.
- **Disco:** antes de suíte ou build, `df -h /`; abaixo de 3 GB, limpar conforme MEMORY.md (`disco-cheio-mac`).

---

# Fase 0 · Preparação

### Task 0.1: Onde trabalhar

- [ ] **Na mesma branch do plano de UX** (recomendado): `cd ../nba-projeto-ux` e seguir. Os arquivos que os dois planos tocam em comum são `CabecalhoTela.tsx` (o de UX não o toca), `Lateral.tsx` (o de UX acrescenta `mostrarClassificacao`; este não o toca), `montar.tsx` (o de UX acrescenta `semClassificacao`; este acrescenta o portão do chat — as duas mudanças convivem) e `ClassificacaoCompacta.tsx` (o de UX muda a estrutura; este muda uma célula). Nenhum conflito de linha.
- [ ] **Em branch própria** (se o parceiro preferir): `git worktree add ../nba-projeto-logica -b correcoes-logica-05 main && cd ../nba-projeto-logica && cp -al ../nba-projeto/node_modules node_modules` e copiar as specs/planos de 19/09 como na Task 0.1 do plano de UX.
- [ ] `df -h / && npx vitest run src/modules/entrega/__tests__/lateral.test.ts --reporter=dot` → verde.

---

# Fase 1 · O formatador

### Task 1.1: `formatarAproveitamento` em `src/components/formato.ts`

**Files:**
- Modify: `src/components/formato.ts`
- Test: `src/components/__tests__/formato.test.ts` (novo — o diretório `src/components/__tests__` não existe; criar)

- [ ] **Step 1: Teste**

```ts
// src/components/__tests__/formato.test.ts
import { describe, expect, it } from 'vitest'

import { formatarAproveitamento } from '../formato'

/**
 * UM aproveitamento, UMA forma (correções de lógica 19/09, §4.2). A lateral
 * escrevia "89" e a tabela cheia "89,0" a 300 px de distância. A forma
 * vencedora é a da tabela: uma casa, vírgula — distingue 66,7 de 66,3 na
 * briga por play-in.
 */
describe('formatarAproveitamento', () => {
  it('uma casa decimal, vírgula, sem o símbolo (a unidade fica no cabeçalho)', () => {
    expect(formatarAproveitamento(0.8889)).toBe('88,9')
    expect(formatarAproveitamento(0.6667)).toBe('66,7')
    expect(formatarAproveitamento(1)).toBe('100,0')
    expect(formatarAproveitamento(0)).toBe('0,0')
  })

  it('null é travessão: temporada sem jogo não é zero por cento', () => {
    expect(formatarAproveitamento(null)).toBe('—')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/__tests__/formato.test.ts`.

- [ ] **Step 3: A função** — ao fim de `formato.ts`:

```ts
/**
 * "88,9" — o aproveitamento de um time, com UMA casa e vírgula.
 *
 * Único lugar que escreve aproveitamento (correções de lógica 19/09): a
 * lateral arredondava para inteiro e a tabela cheia de Estatísticas escrevia
 * uma casa — o mesmo time, dois números, a 300 px de distância. A casa fica
 * porque distingue 66,7 de 66,3 na briga por play-in; a unidade NÃO fica,
 * porque mora no cabeçalho da coluna, não repetida 30 vezes.
 *
 * `null` é travessão: temporada sem jogo não é zero por cento.
 */
export function formatarAproveitamento(v: number | null): string {
  return v === null ? '—' : (v * 100).toFixed(1).replace('.', ',')
}
```

- [ ] **Step 4: Verificar** — `npx vitest run src/components/__tests__/formato.test.ts` → verde.

### Task 1.2: Os dois call-sites usam o formatador

**Files:**
- Modify: `src/app/(app)/estatisticas/page.tsx` (~248 e ~397)
- Modify: `src/components/lateral/ClassificacaoCompacta.tsx` (~78)
- Modify: `src/components/lateral/__tests__/classificacao-compacta.test.ts` (criado pelo plano de UX, Task 5.4; se este plano rodar antes, criar com o mesmo cabeçalho e fixture de lá)

- [ ] **Step 1: Teste na lateral**

```ts
  it('o aproveitamento sai com uma casa, igual à tabela cheia (correções de lógica 19/09)', () => {
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    // a fixture tem aproveitamento 0.8333
    expect(html).toContain('<td>83,3</td>')
    expect(html).not.toContain('<td>83</td>')
  })
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: `ClassificacaoCompacta.tsx`**

Import: `import { formatarAproveitamento } from '@/components/formato'`. A célula:

```tsx
                <td>{formatarAproveitamento(linha.aproveitamento)}</td>
```

- [ ] **Step 4: `estatisticas/page.tsx`** — apagar a função local `aproveitamentoEscrito` (~248–250, com o comentário); importar `formatarAproveitamento` de `@/components/formato`; na coluna (~397): `celula: (l) => formatarAproveitamento(l.aproveitamento),`.

- [ ] **Step 5: Verificar** — `npx vitest run src/components/lateral src/app/__tests__/telas-05-classificacao.test.ts src/app/__tests__/telas-04-estatisticas.test.ts && npm run typecheck && npm run lint` → verde. Se `telas-05-classificacao` afirmava um inteiro na lateral, a asserção passa a uma casa.

### Fase 1 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 2 · O contador conta o que a tela mostra

### Task 2.1: `contador.total` no `CabecalhoTela`

**Files:**
- Modify: `src/components/navegacao/CabecalhoTela.tsx` (~73 e ~138–162)
- Modify: `src/app/__tests__/navegacao.test.ts` (`describe('cabeçalho de tela (identidade 05)')`)

- [ ] **Step 1: Teste**

```ts
  it('com filtro, o contador diz "N de M": o número da tela é o que ela MOSTRA (correções de lógica 19/09)', () => {
    const com = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'LISTA SECRETA',
        titulo: 'Hoje',
        contador: { numero: 3, total: 12, rotulo: 'entradas em 7 jogos' },
      }),
    )
    expect(com).toContain('>3</strong>')
    expect(com).toContain('de 12 entradas em 7 jogos')

    // sem filtro os dois coincidem e a frase é a de sempre
    const sem = renderToStaticMarkup(
      createElement(CabecalhoTela, {
        sobrancelha: 'LISTA SECRETA',
        titulo: 'Hoje',
        contador: { numero: 12, total: 12, rotulo: 'entradas em 7 jogos' },
      }),
    )
    expect(sem).toContain('>12</strong>')
    expect(sem).not.toContain('de 12')
  })
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: O componente**

Tipo da prop:

```tsx
  /**
   * O número da tela e o que ele conta ("37" · "entradas em 7 jogos").
   * `total`, quando difere de `numero`, vira "3 de 12 entradas…": o número
   * grande é o que a tela MOSTRA depois dos filtros, e o total é o que existe
   * (correções de lógica 19/09).
   */
  contador?: { numero: number; total?: number; rotulo: string }
```

O rótulo (~149):

```tsx
          <span style={{ /* … igual … */ }}>
            {contador.total !== undefined && contador.total !== contador.numero
              ? `de ${contador.total} ${contador.rotulo}`
              : contador.rotulo}
          </span>
```

- [ ] **Step 4: Verificar** — `npx vitest run src/app/__tests__/navegacao.test.ts` → verde.

### Task 2.2: A Lista passa os dois números

**Files:**
- Modify: `src/app/(app)/page.tsx` (~611)
- Modify: `src/app/__tests__/telas-04-lista.test.ts`

- [ ] **Step 1: Teste**

```ts
  it('com filtro na URL, o contador diz "N de M" — o cabeçalho não pode dizer 12 sobre uma tela com 3 cards', async () => {
    const html = await renderizar({ metodo: 'OPD' })
    const cards = (html.match(/<article/g) ?? []).length
    const { lerFeed, agruparPorJogador } = await import('../../modules/entrega/lista-secreta')
    const feed = await lerFeed(banco.db, HOJE)
    const total = agruparPorJogador(feed!.conteudo.itens).length
    expect(cards).toBeLessThan(total)
    expect(html).toContain(`>${cards}</strong>`)
    expect(html).toContain(`de ${total} entrada`)
  }, 60_000)
```

Se a semente não tiver apito OPD em `HOJE`, usar o recorte que a suíte já usa nos testes de filtro (procurar `renderizar({` no arquivo) — o que importa é `cards < total`.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: A página** (~611)

```tsx
        contador={{
          // O número grande é o que a tela MOSTRA (depois dos filtros e do
          // corte de quantidade); o total é o que foi publicado. Iguais sem
          // filtro; "3 de 12" com.
          numero: cartoes.length,
          total: entradasPublicadas.length,
          rotulo: `entrada${entradasPublicadas.length === 1 ? '' : 's'} em ${jogosComApito} jogo${jogosComApito === 1 ? '' : 's'}`,
        }}
```

- [ ] **Step 4: Verificar** — `npx vitest run src/app/__tests__/telas-04-lista.test.ts src/app/__tests__/telas-05-gratis.test.ts` → verde. O teste existente "o contador escreve o total de entradas…" continua: sem filtro, `cartoes.length === entradasPublicadas.length`.

### Fase 2 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 3 · A doca respeita `CHAT_HABILITADO`

### Task 3.1: O portão em `montar.tsx`

**Files:**
- Modify: `src/app/(app)/lateral/montar.tsx`
- Test: `src/app/__tests__/lateral-montar.test.tsx` (novo)

- [ ] **Step 1: Teste** — mocka a leitura (não sobe PGlite: o que se prova é fiação)

```ts
// src/app/__tests__/lateral-montar.test.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A doca do assistente só existe quando o chat EXISTE (correções de lógica
 * 19/09, §4.3). `Lateral` é componente puro e recebe `assistente`; quem
 * consulta `configuracaoChat()` é a montagem, na camada de leitura — o mesmo
 * lugar que a `Moldura` usa para o botão flutuante.
 */
const DADOS = {
  noite: null,
  temporada: null,
  classificacao: { temporada: '2026-27', conferencias: [] },
}

vi.mock('@/app/(app)/lateral/leitura', () => ({
  TAG_LATERAL: 'lateral',
  lerLateralCacheada: async () => DADOS,
}))
vi.mock('@/modules/entrega/ruleset-ativo', () => ({
  rulesetAtivo: async () => ({
    rodada: { fuso: 'America/Sao_Paulo' },
    temporada: { inicio: '2026-10-01', fim: '2027-06-30' },
  }),
}))

import { lateralPadrao } from '../(app)/lateral/montar'

beforeEach(() => {
  vi.stubEnv('CHAT_HABILITADO', 'true')
  vi.stubEnv('CHAT_COTA_DIARIA_MVP', '20')
  vi.stubEnv('CHAT_COTA_DIARIA_ALL_STAR', '60')
})
afterAll(() => vi.unstubAllEnvs())

const renderizar = async (props: { assistente: boolean; gratis: boolean }) =>
  renderToStaticMarkup(<>{await lateralPadrao(props)}</>)

describe('a doca do assistente na lateral', () => {
  it('aparece para o nível com direito, com o chat ligado', async () => {
    expect(await renderizar({ assistente: true, gratis: false })).toContain('Pergunte ao assistente')
  })

  it('NÃO aparece com CHAT_HABILITADO desligada — a doca mandava para um /chat que responde 404', async () => {
    vi.stubEnv('CHAT_HABILITADO', 'nao')
    expect(await renderizar({ assistente: true, gratis: false })).not.toContain('Pergunte ao assistente')
  })

  it('NÃO aparece com a flag ligada mas uma cota vazia (degradar, spec §14)', async () => {
    vi.stubEnv('CHAT_COTA_DIARIA_MVP', '')
    expect(await renderizar({ assistente: true, gratis: false })).not.toContain('Pergunte ao assistente')
  })

  it('NÃO aparece para o grátis, mesmo com o chat ligado', async () => {
    expect(await renderizar({ assistente: false, gratis: true })).not.toContain('Pergunte ao assistente')
  })
})
```

O arquivo usa JSX (`<>…</>`): nomear `.test.tsx`. Se `calendarioDoRuleset` exigir outros campos do ruleset, completar o mock com o que `src/modules/dominio/temporada.ts` lê (ver `calendarioDoRuleset`).

- [ ] **Step 2: Rodar e ver falhar** — o segundo e o terceiro `it` ficam vermelhos.

- [ ] **Step 3: `montar.tsx`**

Import: `import { configuracaoChat } from '@/modules/entrega/chat-limites'`.

```tsx
  // Duas perguntas, como na Moldura: `assistente` diz se ESTE nível tem
  // direito; `configuracaoChat().habilitado` diz se o chat EXISTE (flag +
  // cotas). Sem a segunda, a doca mandava o assinante para um /chat que
  // responde 404 — enquanto o botão flutuante, que já perguntava, sumia.
  return (
    <Lateral
      dados={dados}
      assistente={assistente && configuracaoChat().habilitado}
      gratis={gratis}
    />
  )
```

(Se o plano de UX já passou `mostrarClassificacao={!semClassificacao}`, manter.)

- [ ] **Step 4: Verificar** — `npx vitest run src/app/__tests__/lateral-montar.test.tsx src/app/__tests__/telas-05-gratis.test.ts src/app/__tests__/chat-botao.test.ts && npm run typecheck && npm run boundaries` → verde. O `boundaries` precisa aceitar `app/(app)/lateral → modules/entrega/chat-limites`; a `Moldura` (em `components`) já importa o mesmo módulo, então a regra existente cobre.

### Fase 3 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 4 · A demo invalida a lateral

### Task 4.1: `revalidateTag(TAG_LATERAL, 'max')` na demo

**Files:**
- Modify: `src/app/api/cron/demo/route.ts`
- Modify: `src/app/api/cron/demo/__tests__/route.test.ts`

- [ ] **Step 1: Teste** — acrescentar aos `mocks` e às `vi.mock`:

```ts
const mocks = vi.hoisted(() => ({
  db: { teste: true },
  ruleset: { rodada: { fuso: 'America/Sao_Paulo' } },
  porta: { nome: 'llm-de-mentira' },
  simularAte: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  // `leitura.ts` chama `unstable_cache` ao ser importado; devolver a função
  // crua é o bastante — este teste não lê a lateral.
  unstable_cache: (fn: unknown) => fn,
}))
```

No `beforeEach`: `mocks.revalidateTag.mockReset()`. Dois testes novos:

```ts
  it('depois de avançar a temporada, invalida a lateral — que é cacheada por uma hora', async () => {
    process.env.DEMO_AUTOSSEMEADURA = 'true'
    await pedir()
    expect(mocks.revalidateTag).toHaveBeenCalledWith('lateral', 'max')
    // depois de simular, não antes
    expect(mocks.simularAte.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revalidateTag.mock.invocationCallOrder[0]!,
    )
  })

  it('pular (sem a variável) não invalida nada', async () => {
    delete process.env.DEMO_AUTOSSEMEADURA
    await pedir()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: A rota**

Imports (os dois últimos, como na sincronização):

```ts
import { revalidateTag } from 'next/cache'
import { TAG_LATERAL } from '@/app/(app)/lateral/leitura'
```

Na `tarefa`:

```ts
      const resumo = await simularAte(getDb(), ruleset, new Date(), {
        llm: portaLLMDoAmbiente(),
        orcamentoMs: ORCAMENTO_MS,
      })
      // A rodada simulada acabou de mudar jogos, box scores e classificação
      // — exatamente o que a lateral lê, cacheado por uma hora. Sem isto a
      // Lista mostrava a rodada nova e a lateral, a anterior.
      revalidateTag(TAG_LATERAL, 'max')
      return { executado: true, resumo }
```

- [ ] **Step 4: Verificar** — `npx vitest run src/app/api/cron/demo && npm run typecheck && npm run boundaries` → verde.

### Task 4.2: Teste de fonte — quem escreve rodada, invalida

**Files:**
- Test: `src/app/api/cron/__tests__/invalidacao-lateral.test.ts` (novo)

- [ ] **Step 1: O teste**

```ts
// src/app/api/cron/__tests__/invalidacao-lateral.test.ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * QUEM ESCREVE O QUE A LATERAL LÊ, INVALIDA A LATERAL (correções de lógica
 * 19/09, §3.3). A lateral é cacheada por uma hora sob `TAG_LATERAL`; toda
 * rota de cron que mexe em rodada — sincronização real ou simulação —
 * precisa chamar `revalidateTag(TAG_LATERAL, 'max')`. A demo esqueceu; a
 * próxima rota não pode esquecer.
 */
const RAIZ = 'src/app/api/cron'

/** Os módulos cuja importação diz "esta rota escreve rodada". */
const ESCREVE_RODADA = [
  '@/modules/ingestao/demo/temporada',
  '@/modules/ingestao/jobs/orquestradores',
]

function rotas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : rotas(caminho)
    return e.name === 'route.ts' ? [caminho] : []
  })
}

describe('invalidação da lateral', () => {
  const escritoras = rotas(RAIZ).filter((r) => {
    const fonte = readFileSync(r, 'utf8')
    return ESCREVE_RODADA.some((m) => fonte.includes(`from '${m}'`))
  })

  it('há pelo menos as duas rotas conhecidas: sincronizar-rodada e demo', () => {
    expect(escritoras.some((r) => r.includes('sincronizar-rodada'))).toBe(true)
    expect(escritoras.some((r) => r.includes('/demo/'))).toBe(true)
  })

  it.each(escritoras)('%s invalida TAG_LATERAL com o perfil max', (rota) => {
    const fonte = readFileSync(rota, 'utf8')
    expect(fonte).toContain("import { TAG_LATERAL } from '@/app/(app)/lateral/leitura'")
    expect(fonte).toContain("revalidateTag(TAG_LATERAL, 'max')")
  })
})
```

Conferir o nome exato do módulo que `sincronizar-rodada/route.ts` importa para executar a rodada (linhas 5–9: `@/modules/ingestao/jobs/orquestradores`). Se a rota `ao-vivo` também escrever box score parcial que a lateral leia — não lê: a lateral usa a última noite CONFERIDA — não entra na lista.

- [ ] **Step 2: Rodar** — `npx vitest run src/app/api/cron/__tests__/invalidacao-lateral.test.ts` → verde (a Task 4.1 já corrigiu a demo). Para ver o teste morder, comentar a linha do `revalidateTag` na demo e rodar de novo: vermelho; descomentar.

### Fase 4 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 5 · A forma do cache, e a prova na preview

### Task 5.1: Teste de fonte — `leitura.ts` e todo `revalidateTag`

**Files:**
- Test: `src/app/(app)/lateral/__tests__/cache-forma.test.ts` (novo)

- [ ] **Step 1: O teste**

```ts
// src/app/(app)/lateral/__tests__/cache-forma.test.ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * O CACHE DA LATERAL NUNCA RODA NOS TESTES: toda suíte de tela mocka
 * `next/cache`. Este teste fixa a FORMA — tag, revalidação e o perfil 'max'
 * em toda invalidação —, e o roteiro de preview do plano (Task 5.2) prova o
 * comportamento contra o Next de verdade. As duas coisas juntas são o que
 * há; nenhuma sozinha basta.
 *
 * O 'max' importa: sem o perfil, a documentação desta versão descreve a
 * invalidação como stale-while-revalidate, e a lateral serviria a rodada
 * velha UMA vez depois de cada cron.
 */
describe('a forma do cache da lateral', () => {
  const leitura = readFileSync('src/app/(app)/lateral/leitura.ts', 'utf8')

  it('lerLateralCacheada é unstable_cache com a tag e uma hora', () => {
    expect(leitura).toContain("export const TAG_LATERAL = 'lateral'")
    expect(leitura).toMatch(/unstable_cache\(/)
    expect(leitura).toMatch(/\{ tags: \[TAG_LATERAL\], revalidate: 3600 \}/)
  })

  it('toda chamada de revalidateTag no app passa o perfil max', () => {
    const fontes: string[] = []
    const visitar = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') visitar(caminho)
        } else if (/\.tsx?$/.test(e.name)) fontes.push(caminho)
      }
    }
    visitar('src')

    const semPerfil: string[] = []
    for (const arquivo of fontes) {
      const fonte = readFileSync(arquivo, 'utf8')
      for (const chamada of fonte.matchAll(/revalidateTag\(([^)]*)\)/g)) {
        if (!/,\s*'max'\s*$/.test(chamada[1]!)) semPerfil.push(`${arquivo}: ${chamada[0]}`)
      }
    }
    expect(semPerfil).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar** — `npx vitest run "src/app/(app)/lateral"` → verde. Se aparecer um `revalidateTag` sem `'max'` em outro lugar do app, ele é o mesmo defeito e ganha o perfil — nunca a exceção no teste.

### Task 5.2: Roteiro de preview — a invalidação de verdade

Sem código. Executar UMA vez antes do commit, anotar o resultado na mensagem do commit.

**Onde:** a preview da Vercel do branch, se `CRON_SECRET` e `DEMO_AUTOSSEMEADURA=true` estiverem no ambiente de preview (conferir em `vercel env ls preview`). Senão, local: `npm run build && DEMO_AUTOSSEMEADURA=true CRON_SECRET=segredo npm run start` contra o Postgres local com a temporada demo carregada (`npm run demo:temporada`, runbook de deploy).

- [ ] **Passo 1:** Chrome a 1440, sessão MVP, abrir `/`. Anotar a data em "ÚLTIMA NOITE" na lateral e o título da rodada no cabeçalho.
- [ ] **Passo 2:** Recarregar duas vezes. Esperado: a lateral não muda e a resposta é rápida (o cache está servindo). Se o painel de funções da Vercel mostrar a consulta da lateral a cada carga, o `unstable_cache` NÃO está cacheando — parar aqui e conferir `node_modules/next/dist/docs` sobre `unstable_cache` nesta versão antes de seguir.
- [ ] **Passo 3:** Disparar a demo:

```bash
curl -s -H "authorization: Bearer $CRON_SECRET" https://<preview>/api/cron/demo | jq .
```

Esperado: `executado: true` e `resumo.diasProduzidos ≥ 1`. Se `diasProduzidos: 0` (a demo já rodou hoje), o cache pode não mudar de conteúdo — usar o Passo 3b.

- [ ] **Passo 3b (se necessário):** forçar uma mudança visível — `npm run demo:temporada -- --ate=<amanhã>` no local, ou aguardar o cron do dia seguinte na preview.
- [ ] **Passo 4:** Recarregar `/` IMEDIATAMENTE. Esperado: "ÚLTIMA NOITE" mostra a rodada nova, sem esperar a hora. Se mostrar a antiga UMA vez e a nova na recarga seguinte, o perfil `'max'` não está fazendo o que a documentação diz nesta versão — abrir `node_modules/next/dist/docs/…/revalidateTag` e conferir a assinatura; corrigir `leitura.ts`/as duas rotas conforme o que a doc desta versão prescrever, e ajustar o teste da Task 5.1 para a forma correta.
- [ ] **Passo 5:** Anotar: `Roteiro de preview 5.2: cache serve (passo 2 ok); demo invalida (passo 4 ok em <ambiente>, <data/hora>)`.

### Task 5.3: Bateria e commit único

- [ ] **Step 1:** `df -h /` (limpar se < 3 GB); `npm run typecheck && npm run lint && npm run boundaries && npm test` → tudo verde.
- [ ] **Step 2:** `git status` — só os arquivos das tarefas acima (mais as specs/planos de 19/09, se ainda não estiverem no commit do plano de UX).
- [ ] **Step 3:**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Correções de lógica: o que a auditoria da Identidade 05 achou no funcionamento

- formatarAproveitamento em components/formato.ts: um aproveitamento, uma
  forma ("88,9"); a lateral deixa de arredondar para inteiro.
- O contador da Lista conta o que a tela mostra: "3 de 12 entradas" com
  filtro, "12 entradas" sem. CabecalhoTela.contador ganha `total`.
- A doca do assistente respeita configuracaoChat().habilitado, no
  montar.tsx — mesmo portão do botão flutuante.
- /api/cron/demo invalida TAG_LATERAL com 'max' depois de simularAte; um
  teste de fonte obriga toda rota de cron que escreve rodada a invalidar.
- Teste de fonte fixa a forma do cache da lateral (tag, 3600, 'max' em
  toda invalidação); roteiro de preview executado: <resultado do 5.2>.

Spec: docs/superpowers/specs/2026-09-19-correcoes-logica-identidade-05-design.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

Sem push, sem PR: o parceiro decide.
