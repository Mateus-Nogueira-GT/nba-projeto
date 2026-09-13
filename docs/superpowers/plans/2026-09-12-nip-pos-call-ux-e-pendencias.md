# NIP pós-call · UX dos prints e pendências nossas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o que a call de 08/09 e os prints de 12/09 pediram e depende de nós: a demonstração viva de novo, as três correções de UX (larguras, classificação por conferência com logo, perfil de verdade), a recuperação de senha, a conta de teste, a saída rastreada do apito para a casa parceira e o filtro da gestão de banca.

**Architecture:** Nada no motor, nada no ruleset. A moldura ganha uma segunda largura; a classificação passa a nascer por conferência a partir de um mapa de domínio e da recomputação que já existe; o perfil vira a conta do usuário com ações de servidor sem JavaScript obrigatório; a recuperação de senha nasce como token de uso único emitido pelo admin — o mesmo token que um provedor de e-mail vai entregar depois; a saída para a casa reaproveita o link rastreado de afiliados; a gestão ganha a tabela das entradas que o usuário registrou.

**Tech Stack:** Next.js App Router (server components + server actions), React 19, Drizzle + Postgres (Neon em produção, PGlite nos testes), Vitest, estilos inline lendo `semantico`/`componente`, `globals.css` só para o que inline não faz (media query).

**Spec:** [`docs/superpowers/specs/2026-09-12-nip-pos-call-ux-e-pendencias-design.md`](../specs/2026-09-12-nip-pos-call-ux-e-pendencias-design.md)

## Global Constraints

- **Motor intocável e ruleset intocável** (`CLAUDE.md` regras 1 e 2; a spec §1). `npm run boundaries` limpo.
- **Nunca inventar regra de estratégia** (regra 3). Tudo que depende de terceiros (planos Star/MVP, Telegram, modelo real de gestão, casas por documentar) **não entra** — spec §6.
- **Somente leitura de odds** (regra 4, ADR-0004): a saída para a casa é um link rastreado com o aviso "a odd da sua casa pode ser outra"; nenhum formulário de aposta, nenhuma credencial de casa, nenhum valor movimentado. A gestão de banca registra o que o usuário **já fez em outro lugar**.
- **Escrita:** o `%` é **nota de confiança**, nunca "probabilidade" (14 testes travam isso). O rótulo do grau 5 é `SINAL MAIS FORTE` e vem do ruleset (spec §7 — feito). Nota da partida é "nota", nunca "nível". Linha inteira com `+`. Odd sempre média rotulada ou faixa.
- **Logos:** entram em **toda tela** (spec §4.4, decisão de 12/09). São arquivos estáticos em `public/times/<SIGLA>.svg`, mapeados por `identidadeDoTime()` e renderizados por `LogoTime` — **não** há carga de `times.logo_url` (a spec §5.2 errou nisso; o fechamento corrige o texto).
- **Sem e-mail e sem armazenamento de arquivo** (spec §5.3): a recuperação de senha é por link emitido pelo admin; a foto de perfil é um conjunto de avatares prontos. Os dois ficam desenhados para o provedor entrar depois sem refazer nada.
- **Um commit só, no final** (preferência do parceiro, 12/09). As tasks terminam em verificação, não em commit; a Task 12 commita tudo.
- **Verificação de cada task:** `npm run typecheck && npm run lint && npm run boundaries` e a suíte do que foi tocado. "Commit existe" não é "commit verde".
- **Domínio em português, infraestrutura em inglês.** Nomes de componente, prop, função, tabela e teste em português.

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
| --- | --- | --- |
| `src/components/navegacao/Moldura.tsx`, `Esqueleto.tsx` | a segunda largura (`dados`) | 1 |
| `src/app/(app)/**/page.tsx` (7 telas) | declaram a largura | 1 |
| `src/modules/dominio/conferencias.ts` (novo) | sigla → Leste/Oeste, fato de franquia | 2 |
| `src/modules/ingestao/demo/cadastro.ts` | grava a conferência ao criar o time | 2 |
| `scripts/demo-conferencias.ts` (novo) + `package.json` | preenche o banco existente e recomputa a classificação | 2 |
| `src/design-system/componentes/Tabela.tsx` + `src/app/globals.css` | coluna `soDesktop` | 3 |
| `src/app/(app)/estatisticas/page.tsx` | logo, nome, jogos atrás, duas conferências lado a lado | 3 |
| `src/modules/dominio/db/schema/plataforma.ts` + migrations | `usuarios.foto_url`, `redefinicoes_senha`, `entradas_realizadas` | 4, 7, 10 |
| `public/avatares/*.svg` (novos) + `src/design-system/componentes/AvatarUsuario.tsx` (novo) | identidade visual do usuário | 4 |
| `src/app/(app)/conta/page.tsx`, `conta/acoes.ts` | o perfil inteiro | 4, 5, 6 |
| `src/modules/plataforma/auth/sessao.ts` | encerrar sessões de um dispositivo; dispositivo da sessão atual | 5 |
| `src/modules/plataforma/auth/redefinicao.ts` (novo) | emitir e concluir redefinição por token | 7 |
| `src/app/(admin)/admin/usuarios/acoes.ts`, `page.tsx` | admin emite o link | 7 |
| `src/app/redefinir/page.tsx`, `redefinir/[token]/page.tsx`, `redefinir/[token]/acoes.ts` (novos) | fluxo público | 7 |
| `src/app/(app)/entrar/page.tsx` | link "esqueci a senha" | 7 |
| `scripts/criar-conta-teste.ts` (novo) + `package.json` | conta da equipe com cortesia | 8 |
| `src/modules/dominio/db/schema/afiliados.ts` + migration | `links_afiliados.saida_do_apito` | 9 |
| `src/modules/entrega/saida-para-casa.ts` (novo) | qual link o apito usa | 9 |
| `src/app/(admin)/admin/afiliados/acoes.ts` | admin escolhe o link | 9 |
| `src/app/(app)/apito/[jogadorId]/page.tsx` | o CTA de saída | 9 |
| `src/modules/entrega/gestao-realizadas.ts` (novo) | registrar e listar entradas realizadas | 10 |
| `src/app/(app)/gestao/page.tsx`, `gestao/acoes.ts` (novo) | filtro e botão "registrei" | 10 |
| `src/app/__tests__/telas-05-*.test.ts` (novos) | fumaça das telas desta passada | 1–10 |
| `docs/04-design-system.md`, a spec | fechamento | 12 |

---

### Task 0: A rodada de amanhã existir (operacional, sem código)

**Contexto:** spec §5.0. A temporada simulada parou em 08/09; produção mostra "Nenhum jogo hoje" e amanhã abre vazia. A decisão entre ligar `DEMO_AUTOSSEMEADURA` na Vercel ou rodar a carga à mão é do parceiro (spec §9).

- [ ] **Step 1: Confirmar o estado** — na árvore da apresentação, `npx dotenv -e .env.local -- npx vite-node -e` com a consulta `select max(data_referencia) from jogos` (ou o script `scratchpad/hoje.ts` desta sessão). Esperado hoje: `2026-09-08`.
- [ ] **Step 2 (saída manual): produzir a rodada** — `cd /Users/mateusnascimentonogueiradasilva/nba-projeto && OPENROUTER_API_KEY="" npx dotenv -e .env.local -- npm run demo:temporada && npx dotenv -e .env.local -- npm run demo:fotos && npx dotenv -e .env.local -- npm run demo:conferir`. Esperado: `✓ Temporada pronta até hoje` e o gate verde. Repetir na manhã do dia 13.
- [ ] **Step 2 (saída definitiva): ligar o cron** — no painel da Vercel, `DEMO_AUTOSSEMEADURA=1` em Production, depois `vercel env pull`. Esperado no dia seguinte: a rodada nasce às 6h e a faixa "Temporada demonstrativa" acende.
- [ ] **Step 3: Conferir em produção** — abrir `/estatisticas` e ver "Jogos do dia" com jogos, e `/` com a lista publicada.

---

### Task 1: A segunda largura da moldura

**Files:**
- Modify: `src/components/navegacao/Moldura.tsx`
- Modify: `src/components/navegacao/Esqueleto.tsx:35-47`
- Modify: `src/app/(app)/estatisticas/page.tsx`, `estatisticas/jogador/[id]/page.tsx`, `estatisticas/time/[id]/page.tsx`, `estatisticas/jogo/[id]/page.tsx`, `estatisticas/moldura.tsx`, `resultados/[data]/page.tsx`, `gestao/page.tsx`, `conta/page.tsx`
- Test: `src/app/__tests__/navegacao.test.ts`

**Interfaces:**
- Produces: `Moldura` e `Esqueleto` aceitam `largura?: 'leitura' | 'dados'` (padrão `'leitura'`). `LARGURA_DA_MOLDURA = { leitura: 640, dados: 1120 } as const`, exportado de `Moldura.tsx`.

- [ ] **Step 1: Teste que falha** — em `src/app/__tests__/navegacao.test.ts`, dentro do `describe` existente da navegação:

```ts
import { Moldura, LARGURA_DA_MOLDURA } from '../../components/navegacao/Moldura'
import { Esqueleto } from '../../components/navegacao/Esqueleto'

it('a moldura tem duas larguras: leitura (padrão) e dados', () => {
  const leitura = renderToStaticMarkup(createElement(Moldura, { aba: 'lista', children: 'x' }))
  const dados = renderToStaticMarkup(
    createElement(Moldura, { aba: 'stats', largura: 'dados', children: 'x' }),
  )
  expect(leitura).toContain(`max-width:${LARGURA_DA_MOLDURA.leitura}px`)
  expect(dados).toContain(`max-width:${LARGURA_DA_MOLDURA.dados}px`)
  // o respiro lateral não muda com a largura — é o que protege o celular
  expect(dados).toContain('padding:24px 16px')
})

it('o esqueleto de carregamento acompanha a largura, senão a tela pula quando o conteúdo chega', () => {
  const html = renderToStaticMarkup(createElement(Esqueleto, { aba: 'stats', largura: 'dados' }))
  expect(html).toContain(`max-width:${LARGURA_DA_MOLDURA.dados}px`)
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/navegacao.test.ts`. Esperado: FAIL — `LARGURA_DA_MOLDURA` não é exportado; `largura` não existe na prop.

- [ ] **Step 3: Implementar** — em `Moldura.tsx`:

```tsx
/**
 * DUAS LARGURAS, não uma (spec 12/09, §4.1). `leitura` (640) é a coluna de
 * varredura — Lista, Fire Live, detalhe: linha curta é decisão de
 * legibilidade. `dados` (1120) é para tabela, box score, perfil: ali a largura
 * vira informação, e a 640 a página ficava vazia em volta de uma tabela
 * espremida. No celular as duas caem para a largura da tela com o mesmo
 * respiro de 16px — só o desktop muda.
 */
export const LARGURA_DA_MOLDURA = { leitura: 640, dados: 1120 } as const
export type LarguraDaMoldura = keyof typeof LARGURA_DA_MOLDURA

export function Moldura({
  aba,
  largura = 'leitura',
  children,
}: {
  aba: Aba | null
  largura?: LarguraDaMoldura
  children: ReactNode
}) {
  // ...main igual...
        <div style={{ maxWidth: LARGURA_DA_MOLDURA[largura], margin: '0 auto' }}>{children}</div>
```

Em `Esqueleto.tsx`, a mesma prop e o mesmo `maxWidth: LARGURA_DA_MOLDURA[largura]` (importar de `./Moldura`). Depois, nas telas de dados, `<Moldura aba="stats" largura="dados">` em: `estatisticas/page.tsx`, `estatisticas/jogador/[id]/page.tsx`, `estatisticas/time/[id]/page.tsx`, `estatisticas/jogo/[id]/page.tsx`, `estatisticas/moldura.tsx` (o `SemBanco`), `resultados/[data]/page.tsx`, `gestao/page.tsx`, `conta/page.tsx`. Lista, Fire Live, apito e como-funciona **ficam** em leitura. Os `loading.tsx` que usam `Esqueleto` para telas de dados recebem `largura="dados"` também (`grep -rn '<Esqueleto' src/app`).

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/app/__tests__/navegacao.test.ts src/app/__tests__` (a suíte de telas inteira: nenhuma outra asserção pode ter mudado). Esperado: PASS.

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar a task no checklist; **não commitar**.

---

### Task 2: Conferências — o dado que falta

**Files:**
- Create: `src/modules/dominio/conferencias.ts`
- Modify: `src/modules/ingestao/demo/cadastro.ts:57-60`
- Create: `scripts/demo-conferencias.ts`
- Modify: `package.json` (script `demo:conferencias`)
- Test: `src/modules/dominio/__tests__/conferencias.test.ts` (novo), `src/modules/ingestao/__tests__/demo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Conferencia = 'Leste' | 'Oeste'
  export const CONFERENCIA_POR_SIGLA: Readonly<Record<string, Conferencia>>
  export function conferenciaDe(sigla: string): Conferencia | null   // null para sigla fora da NBA
  ```
- Consumes: `semearClassificacao(db, ruleset, dataReferencia)` de `src/modules/ingestao/demo/jogos.ts` — já lê `times.conferencia` e numera a posição **por conferência**; com o dado no lugar, o trilho de playoff/play-in fica certo sem mexer em tela.

- [ ] **Step 1: Teste que falha** — `src/modules/dominio/__tests__/conferencias.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CONFERENCIA_POR_SIGLA, conferenciaDe } from '../conferencias'

describe('conferências da NBA — fato de franquia, não de elenco', () => {
  it('30 times, 15 em cada conferência', () => {
    const valores = Object.values(CONFERENCIA_POR_SIGLA)
    expect(valores).toHaveLength(30)
    expect(valores.filter((c) => c === 'Leste')).toHaveLength(15)
    expect(valores.filter((c) => c === 'Oeste')).toHaveLength(15)
  })
  it('exemplos que todo mundo sabe', () => {
    expect(conferenciaDe('BOS')).toBe('Leste')
    expect(conferenciaDe('LAL')).toBe('Oeste')
    expect(conferenciaDe('mia')).toBe('Leste') // caixa não importa
  })
  it('sigla fora da NBA não ganha conferência inventada', () => {
    expect(conferenciaDe('XXX')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/dominio/__tests__/conferencias.test.ts`. Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** — `src/modules/dominio/conferencias.ts`:

```ts
/**
 * CONFERÊNCIA POR FRANQUIA — fato da liga, não da curadoria.
 *
 * Mora no domínio (não no design system, que é apresentação; não na
 * ingestão, que é provedor) porque a classificação é dado canônico e a
 * entrega precisa dele para numerar posição por conferência. Os elencos da
 * lista do CJ são projetados; a conferência de uma franquia, não.
 */
export type Conferencia = 'Leste' | 'Oeste'

export const CONFERENCIA_POR_SIGLA: Readonly<Record<string, Conferencia>> = {
  ATL: 'Leste', BOS: 'Leste', BKN: 'Leste', CHA: 'Leste', CHI: 'Leste',
  CLE: 'Leste', DET: 'Leste', IND: 'Leste', MIA: 'Leste', MIL: 'Leste',
  NYK: 'Leste', ORL: 'Leste', PHI: 'Leste', TOR: 'Leste', WAS: 'Leste',
  DAL: 'Oeste', DEN: 'Oeste', GSW: 'Oeste', HOU: 'Oeste', LAC: 'Oeste',
  LAL: 'Oeste', MEM: 'Oeste', MIN: 'Oeste', NOP: 'Oeste', OKC: 'Oeste',
  PHX: 'Oeste', POR: 'Oeste', SAC: 'Oeste', SAS: 'Oeste', UTA: 'Oeste',
}

/** `null` para sigla desconhecida: a tela mostra a falta em vez de mentir. */
export function conferenciaDe(sigla: string): Conferencia | null {
  return CONFERENCIA_POR_SIGLA[sigla.trim().toUpperCase()] ?? null
}
```

Em `cadastro.ts:59`, o insert passa a gravar a conferência (import `conferenciaDe` de `../../dominio/conferencias`):

```ts
await db
  .insert(times)
  .values({ sigla, nome, conferencia: conferenciaDe(sigla) })
  .onConflictDoUpdate({ target: times.sigla, set: { conferencia: conferenciaDe(sigla) } })
```

(`onConflictDoUpdate` no lugar do `onConflictDoNothing`: um banco antigo, sem conferência, ganha o dado na próxima semeadura sem apagar nada.)

- [ ] **Step 4: Teste do seed** — em `src/modules/ingestao/__tests__/demo.test.ts`, dentro do `describe` que já semeia:

```ts
it('todo time semeado nasce com conferência, e a classificação numera por conferência', async () => {
  const lista = await banco.db.select({ sigla: times.sigla, conferencia: times.conferencia }).from(times)
  expect(lista.length).toBeGreaterThan(0)
  for (const t of lista) expect(t.conferencia, t.sigla).toMatch(/^(Leste|Oeste)$/)
  const linhas = await banco.db.select().from(classificacao)
  const primeiros = linhas.filter((l) => l.posicao === 1)
  // duas conferências → dois primeiros lugares
  expect(primeiros).toHaveLength(2)
})
```

`npx vitest run src/modules/ingestao/__tests__/demo.test.ts`. Esperado: PASS (o seed já grava conferência e `semearClassificacao` já numera por ela).

- [ ] **Step 5: O script de carga para o banco existente** — `scripts/demo-conferencias.ts`:

```ts
import { eq } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { times } from '../src/modules/dominio/db/schema'
import { conferenciaDe } from '../src/modules/dominio/conferencias'
import { dataDeReferencia } from '../src/modules/dominio/rodada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { semearClassificacao } from '../src/modules/ingestao/demo/jogos'

/**
 * Preenche `times.conferencia` num banco já semeado e RECOMPUTA a
 * classificação, que passa a numerar posição por conferência (é assim que a
 * NBA classifica, e é o único recorte em que playoff/play-in significa algo).
 *
 *   npx dotenv -e .env.local -- npm run demo:conferencias
 *
 * Idempotente: reexecutar dá o mesmo resultado.
 */
async function principal() {
  const db = getDb()
  const lista = await db.select({ id: times.id, sigla: times.sigla }).from(times)
  let gravadas = 0
  const semConferencia: string[] = []
  for (const t of lista) {
    const conferencia = conferenciaDe(t.sigla)
    if (conferencia === null) {
      semConferencia.push(t.sigla)
      continue
    }
    await db.update(times).set({ conferencia }).where(eq(times.id, t.id))
    gravadas += 1
  }
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  const linhas = await semearClassificacao(db, ruleset, hoje)
  console.log(`Conferência gravada em ${gravadas} de ${lista.length} times.`)
  if (semConferencia.length > 0) console.log(`Sem conferência (sigla fora da NBA): ${semConferencia.join(', ')}`)
  console.log(`Classificação recomputada: ${linhas} linhas, posição por conferência.`)
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
```

Em `package.json`, ao lado dos outros `demo:*`: `"demo:conferencias": "vite-node scripts/demo-conferencias.ts"`.

- [ ] **Step 6: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npx vitest run src/modules/dominio src/modules/ingestao`. Esperado: verde. **Rodar contra o Neon só na Task 12.**

---

### Task 3: A classificação — duas conferências, logo, colunas do desktop

**Files:**
- Modify: `src/design-system/componentes/Tabela.tsx:5-26` (tipo `Coluna`) e a renderização de `th`/`td`
- Modify: `src/app/globals.css`
- Modify: `src/app/(app)/estatisticas/page.tsx:284-365` (`COLUNAS_DA_CLASSIFICACAO`), `:496-516` (render)
- Test: `src/design-system/__tests__/tabela.test.ts`, `src/app/__tests__/telas-05-classificacao.test.ts` (novo)

**Interfaces:**
- Produces: `Coluna<T>.soDesktop?: boolean` — a coluna some abaixo de 900 px (classe `so-desktop`). `jogosAtras(lider, linha)` local à página.
- Consumes: `LogoTime` (`src/design-system/componentes/LogoTime.tsx`, props `sigla`, `tamanho`, `decorativo`), `identidadeDoTime(sigla).nome` (`src/design-system/times.ts`), `TelaClassificacao['linhas'][number]` com `conferencia`, `posicao`, `vitorias`, `derrotas`, `aproveitamento`, `sequencia`, `forma`.

- [ ] **Step 1: Teste do componente que falha** — em `src/design-system/__tests__/tabela.test.ts`:

```ts
it('coluna soDesktop leva a classe que o CSS esconde no celular — no cabeçalho e nas células', () => {
  const html = renderToStaticMarkup(
    createElement(Tabela, {
      legenda: 'teste',
      colunas: [
        { chave: 'a', rotulo: 'A', celula: () => 'x' },
        { chave: 'b', rotulo: 'B', soDesktop: true, celula: () => 'y' },
      ],
      linhas: [{ id: '1' }],
      chaveDaLinha: (l: { id: string }) => l.id,
    }),
  )
  expect(html.match(/class="so-desktop"/g)).toHaveLength(2) // 1 th + 1 td
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/design-system/__tests__/tabela.test.ts`. Esperado: FAIL — nenhuma classe no HTML.

- [ ] **Step 3: Implementar a coluna** — em `Tabela.tsx`, no tipo:

```ts
  /**
   * Some abaixo de 900 px (classe `so-desktop`, em globals.css). Para colunas
   * que só cabem na largura de dados — nome por extenso, jogos atrás. Estilo
   * inline não faz media query; é a única razão de existir uma classe aqui.
   */
  soDesktop?: boolean
```

e, onde a tabela renderiza `<th ...>` e `<td ...>` por coluna, acrescentar `className={coluna.soDesktop ? 'so-desktop' : undefined}`. Em `globals.css`, ao fim:

```css
/*
 * Colunas que só cabem na largura de dados (Tabela, `soDesktop`). Inline não
 * faz media query — é a única regra de layout que mora aqui.
 */
.so-desktop {
  display: none;
}
@media (min-width: 900px) {
  .so-desktop {
    display: table-cell;
  }
}
/* Duas conferências lado a lado no desktop, empilhadas no celular. */
.grade-conferencias {
  display: grid;
  gap: 24px;
}
@media (min-width: 900px) {
  .grade-conferencias {
    grid-template-columns: 1fr 1fr;
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/design-system/__tests__/tabela.test.ts`. Esperado: PASS.

- [ ] **Step 5: Teste da tela que falha** — `src/app/__tests__/telas-05-classificacao.test.ts`, com o arnês de `telas-demo.test.ts` (copiar o cabeçalho: mocks de `sessaoAtual`, `avaliarAcesso`, `getDb`, `next/navigation`; `simularAte` 21 dias com `LLMFake`; `vi.useFakeTimers({ toFake: ['Date'] })`). Como o seed da Task 2 já grava conferência, o banco de teste nasce dividido:

```ts
describe('classificação por conferência (spec 12/09, §4.2)', () => {
  it('duas tabelas, Leste e Oeste, cada uma com 15 times e posição reiniciando em 1º', async () => {
    const { default: Pagina } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('CLASSIFICAÇÃO · LESTE')
    expect(html).toContain('CLASSIFICAÇÃO · OESTE')
    expect(html).not.toMatch(/CLASSIFICAÇÃO<\/span>/) // nunca a tabela única
    expect(html.match(/>1º</g)).toHaveLength(2)
    expect(html.match(/>15º</g)).toHaveLength(2)
    expect(html).not.toContain('>16º<')
  })

  it('o trilho é por conferência: 6 playoff e 4 play-in em CADA lado, com a linha de corte', async () => {
    const { default: Pagina } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html.match(/>playoff</g)).toHaveLength(12)
    expect(html.match(/>play-in</g)).toHaveLength(8)
    expect(html.match(/corte do play-in/g)).toHaveLength(2)
  })

  it('todo time tem logo — e a sigla continua escrita ao lado (a logo nunca é canal único)', async () => {
    const { default: Pagina } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html.match(/src="\/times\/[A-Z]{3}\.svg"/g)).toHaveLength(30)
    const { times } = await import('../../modules/dominio/db/schema')
    for (const t of await banco.db.select({ sigla: times.sigla }).from(times))
      expect(html).toContain(`>${t.sigla}</a>`)
  })

  it('nome por extenso e jogos atrás só no desktop; o líder tem "—" em jogos atrás', async () => {
    const { default: Pagina } = await import('../(app)/estatisticas/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('class="so-desktop">Los Angeles Lakers')
    // quem lidera não está atrás de ninguém
    expect(html.match(/class="so-desktop">—</g)!.length).toBeGreaterThanOrEqual(2)
  })

  it('time sem conferência não cai em "Leste" por padrão: aparece num grupo rotulado', async () => {
    const { times } = await import('../../modules/dominio/db/schema')
    const [alvo] = await banco.db.select({ id: times.id }).from(times).limit(1)
    await banco.db.update(times).set({ conferencia: null }).where(eq(times.id, alvo!.id))
    try {
      const { default: Pagina } = await import('../(app)/estatisticas/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).toContain('CLASSIFICAÇÃO · SEM CONFERÊNCIA')
    } finally {
      await banco.db.update(times).set({ conferencia: 'Leste' }).where(eq(times.id, alvo!.id))
    }
  })
})
```

(A última asserção precisa de `semearClassificacao` rodado depois do update para a linha de classificação perder a conferência — chame `await semearClassificacao(banco.db, await rulesetAtivo(), HOJE)` dentro do `try` e de novo no `finally`.)

- [ ] **Step 6: Rodar e ver falhar** — `npx vitest run src/app/__tests__/telas-05-classificacao.test.ts`. Esperado: FAIL nos rótulos, nas logos e nas colunas novas.

- [ ] **Step 7: Implementar a tela** — em `estatisticas/page.tsx`:

```tsx
import { LogoTime } from '@/design-system/componentes/LogoTime'
import { identidadeDoTime } from '@/design-system/times'

/** Jogos atrás do líder da conferência: ((Vl − V) + (D − Dl)) / 2. */
function jogosAtras(lider: LinhaDaClassificacao, l: LinhaDaClassificacao): string {
  if (lider.timeId === l.timeId) return '—'
  const gb = (lider.vitorias - l.vitorias + (l.derrotas - lider.derrotas)) / 2
  return gb === 0 ? '—' : gb.toFixed(1).replace('.0', '').replace('.', ',')
}

function colunasDaClassificacao(lider: LinhaDaClassificacao): Coluna<LinhaDaClassificacao>[] {
  return [
    { /* pos — igual ao de hoje */ },
    {
      chave: 'time',
      rotulo: 'TIME',
      descricao: 'time',
      celula: (l) => (
        <a href={rotaDoTime(l.timeId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: semantico.texto100 }}>
          {/* decorativo: a sigla ao lado é o texto — a logo nunca é canal único */}
          <LogoTime sigla={l.sigla} tamanho={22} decorativo />
          <span style={{ fontFamily: semantico.fonteTitulo, fontSize: 16, letterSpacing: 0.5 }}>{l.sigla}</span>
        </a>
      ),
    },
    { chave: 'nome', rotulo: 'FRANQUIA', descricao: 'nome do time', soDesktop: true, celula: (l) => identidadeDoTime(l.sigla).nome },
    { /* vd, aprov, seq, ultimos — iguais */ },
    { chave: 'gb', rotulo: 'JA', descricao: 'jogos atrás do líder', alinhamento: 'direita', soDesktop: true, celula: (l) => jogosAtras(lider, l) },
    { /* trilho — igual; posicao agora é por conferência */ },
  ]
}
```

No render, os grupos viram uma grade e o grupo sem conferência ganha rótulo explícito:

```tsx
<div className="grade-conferencias">
  {grupos.map((conferencia) => {
    const linhas = classificacao.linhas.filter((l) => l.conferencia === conferencia)
    const titulo = conferencia === null ? 'Classificação · sem conferência' : `Classificação · ${conferencia}`
    return (
      <Secao key={conferencia ?? 'sem'} titulo={titulo} aux={`temporada ${temporada}`}>
        <Tabela
          legenda={`Classificação da conferência ${conferencia ?? 'não informada'}, da primeira posição para a última; corte do play-in após a ${TRILHO.playIn}ª`}
          colunas={colunasDaClassificacao(linhas[0]!)}
          linhas={linhas}
          chaveDaLinha={(l) => l.timeId}
          vazio="Sem classificação registrada para esta temporada."
        />
        <p style={{ margin: '6px 0 0', fontSize: 11, color: semantico.texto40 }}>
          playoff da 1ª à {TRILHO.playoff}ª · play-in até a {TRILHO.playIn}ª · corte do play-in entre a {TRILHO.playIn}ª e a {TRILHO.playIn + 1}ª
        </p>
      </Secao>
    )
  })}
</div>
```

(`Secao` escreve o título em caixa alta — é de onde vem `CLASSIFICAÇÃO · LESTE` no teste. Sem linhas, `linhas[0]` é `undefined`: proteja com `linhas.length === 0 ? COLUNAS_SEM_LIDER : colunasDaClassificacao(linhas[0])`, onde `COLUNAS_SEM_LIDER` omite a coluna `gb`.)

- [ ] **Step 8: Rodar e ver passar** — `npx vitest run src/app/__tests__/telas-05-classificacao.test.ts src/app/__tests__/telas-demo.test.ts src/app/__tests__/telas-04-estatisticas.test.ts`. Esperado: PASS. Se algum teste antigo afirmava a tabela única (ex.: `'Classificação'` sem conferência), ajuste-o para a forma nova — o dado mudou de propósito.

- [ ] **Step 9: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`.

---

### Task 4: Perfil · identidade — foto, nome, avatares prontos

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts:30-43` (`usuarios.fotoUrl`)
- Create: migration via `npm run db:generate` (gera `drizzle/00NN_*.sql` e o `down/` automaticamente)
- Create: `public/avatares/01.svg` … `08.svg`
- Create: `src/design-system/componentes/AvatarUsuario.tsx` (+ export em `componentes/index.ts`)
- Modify: `src/app/(app)/conta/acoes.ts` (novas ações `atualizarNome`, `escolherAvatar`), `conta/page.tsx` (cabeçalho de identidade)
- Test: `src/design-system/__tests__/avatar-usuario.test.ts` (novo), `src/app/__tests__/telas-05-conta.test.ts` (novo), `src/modules/dominio/__tests__/persistencia.test.ts` (contagem de tabelas não muda: é coluna)

**Interfaces:**
- Produces: `usuarios.fotoUrl: text | null`; `AVATARES_PRONTOS = ['/avatares/01.svg', …, '/avatares/08.svg']` exportado de `AvatarUsuario.tsx`; `<AvatarUsuario nome email fotoUrl tamanho? />`; ações `atualizarNome(formData)` e `escolherAvatar(formData)` que redirecionam para `/conta?aviso=nome-ok` / `?aviso=avatar-ok` / `?erro=...`.

- [ ] **Step 1: Schema + migration** — em `usuarios`, depois de `nome`:

```ts
  /** Avatar escolhido (caminho em public/avatares) — ou, no futuro, upload. */
  fotoUrl: text('foto_url'),
```

`npm run db:generate` → confira o `.sql` gerado (só `alter table usuarios add column foto_url text`) e o `down/` correspondente. `npx vitest run src/modules/dominio/__tests__/persistencia.test.ts` → PASS (sobe e desce; a contagem de 68 tabelas não muda).

- [ ] **Step 2: Os avatares** — gere os 8 SVGs com um script descartável (não entra no repo):

```bash
mkdir -p public/avatares && for i in 1 2 3 4 5 6 7 8; do
  cores=("#E0B24A" "#C3CCDA" "#C8823C" "#7C8AA3" "#3DD37E" "#4DA3FF" "#FF9838" "#5CE0CE")
  c=${cores[$((i-1))]}
  cat > public/avatares/0$i.svg <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Avatar $i"><rect width="64" height="64" rx="16" fill="#1B2740"/><circle cx="32" cy="24" r="11" fill="$c"/><path d="M12 58c2-13 10-19 20-19s18 6 20 19" fill="$c"/></svg>
SVG
done
```

(As oito cores são as do design system — metálicas dos níveis e os acentos — para o avatar pertencer à identidade em vez de parecer importado.)

- [ ] **Step 3: Teste do componente que falha** — `src/design-system/__tests__/avatar-usuario.test.ts`:

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AvatarUsuario, AVATARES_PRONTOS } from '../componentes/AvatarUsuario'

describe('AvatarUsuario', () => {
  it('com foto, mostra a imagem com o nome como texto alternativo', () => {
    const html = renderToStaticMarkup(
      createElement(AvatarUsuario, { nome: 'Ana Souza', email: 'ana@x.com', fotoUrl: AVATARES_PRONTOS[0] }),
    )
    expect(html).toContain(`src="${AVATARES_PRONTOS[0]}"`)
    expect(html).toContain('alt="Ana Souza"')
  })
  it('sem foto, as iniciais do nome; sem nome, a inicial do e-mail — nunca um quadrado vazio', () => {
    expect(renderToStaticMarkup(createElement(AvatarUsuario, { nome: 'Ana Souza', email: 'ana@x.com', fotoUrl: null }))).toContain('>AS<')
    expect(renderToStaticMarkup(createElement(AvatarUsuario, { nome: null, email: 'ana@x.com', fotoUrl: null }))).toContain('>A<')
  })
  it('há oito avatares prontos e todos apontam para public/avatares', () => {
    expect(AVATARES_PRONTOS).toHaveLength(8)
    for (const a of AVATARES_PRONTOS) expect(a).toMatch(/^\/avatares\/0[1-8]\.svg$/)
  })
})
```

- [ ] **Step 4: Rodar e ver falhar** — `npx vitest run src/design-system/__tests__/avatar-usuario.test.ts`. Esperado: FAIL — módulo não existe.

- [ ] **Step 5: Implementar o componente** — `AvatarUsuario.tsx`:

```tsx
import { iniciaisDe } from './Avatar'
import { semantico } from '../tokens/semantico'

export const AVATARES_PRONTOS = Array.from({ length: 8 }, (_, i) => `/avatares/0${i + 1}.svg`)

export type AvatarUsuarioProps = {
  nome: string | null
  email: string
  fotoUrl: string | null
  tamanho?: number
}

/**
 * O rosto da CONTA — não confundir com o `Avatar` do jogador, que carrega
 * anel de nível do apito e fundo do time. Sem foto, as iniciais do nome; sem
 * nome, a inicial do e-mail: nunca um quadrado vazio.
 */
export function AvatarUsuario({ nome, email, fotoUrl, tamanho = 64 }: AvatarUsuarioProps) {
  const iniciais = nome && nome.trim() ? iniciaisDe(nome) : email.slice(0, 1).toUpperCase()
  return (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: tamanho,
        height: tamanho,
        borderRadius: 16,
        overflow: 'hidden',
        background: semantico.superficieElevada,
        border: `1px solid ${semantico.divisor}`,
        flexShrink: 0,
      }}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar local, sem otimização
        <img src={fotoUrl} alt={nome ?? email} width={tamanho} height={tamanho} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span aria-label={nome ?? email} style={{ fontFamily: semantico.fonteTitulo, fontSize: tamanho * 0.36, color: semantico.textoSecundario, letterSpacing: 1 }}>
          {iniciais}
        </span>
      )}
    </span>
  )
}
```

Exportar em `componentes/index.ts`. (`iniciaisDe` já é exportado por `Avatar.tsx`.)

- [ ] **Step 6: Rodar e ver passar** — `npx vitest run src/design-system/__tests__/avatar-usuario.test.ts`. Esperado: PASS.

- [ ] **Step 7: Teste da tela que falha** — `src/app/__tests__/telas-05-conta.test.ts` (arnês de `telas-demo.test.ts`; o mock de `sessaoAtual` devolve `USUARIO_DEMO`, que o `beforeAll` insere com `nome: 'Demo Teste'`):

```ts
describe('perfil — a conta da pessoa, não um relatório sobre ela (spec 12/09, §4.3)', () => {
  it('o topo tem foto ou iniciais, nome e e-mail', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('>DT<') // iniciais de "Demo Teste", sem foto
    expect(html).toContain('Demo Teste')
    expect(html).toContain('demo@teste.com')
  })
  it('a pessoa escolhe um dos oito avatares e troca o nome sem JavaScript', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html.match(/name="fotoUrl" value="\/avatares\/0[1-8]\.svg"/g)).toHaveLength(8)
    expect(html).toContain('name="nome"')
  })
})
```

- [ ] **Step 8: Rodar e ver falhar** — `npx vitest run src/app/__tests__/telas-05-conta.test.ts`. Esperado: FAIL.

- [ ] **Step 9: Implementar ações e cabeçalho** — em `conta/acoes.ts`:

```ts
'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { usuarios } from '@/modules/dominio/db/schema'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { AVATARES_PRONTOS } from '@/design-system/componentes/AvatarUsuario'

const nomeSchema = z.string().trim().min(2, 'Nome muito curto.').max(60, 'Nome muito longo.')

export async function atualizarNome(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const nome = nomeSchema.safeParse(formulario.get('nome'))
  if (!nome.success) redirect(`/conta?erro=${encodeURIComponent(nome.error.issues[0]!.message)}`)
  await getDb().update(usuarios).set({ nome: nome.data }).where(eq(usuarios.id, sessao.usuarioId))
  redirect('/conta?aviso=nome-ok')
}

export async function escolherAvatar(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const fotoUrl = String(formulario.get('fotoUrl') ?? '')
  // Só o catálogo: caminho livre viraria injeção de imagem de fora.
  if (fotoUrl !== '' && !AVATARES_PRONTOS.includes(fotoUrl)) redirect('/conta?erro=Avatar%20inv%C3%A1lido.')
  await getDb().update(usuarios).set({ fotoUrl: fotoUrl || null }).where(eq(usuarios.id, sessao.usuarioId))
  redirect('/conta?aviso=avatar-ok')
}
```

Na `page.tsx`, ler o usuário (`db.select({ nome, email, fotoUrl }).from(usuarios).where(eq(usuarios.id, sessao.usuarioId))`) e renderizar, logo abaixo do `CabecalhoTela`:

```tsx
<section style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
  <AvatarUsuario nome={usuario.nome} email={usuario.email} fotoUrl={usuario.fotoUrl} tamanho={72} />
  <div style={{ minWidth: 0 }}>
    <p style={{ margin: 0, fontFamily: semantico.fonteTitulo, fontSize: 22, textTransform: 'uppercase' }}>{usuario.nome ?? 'Sem nome'}</p>
    <p style={{ margin: '2px 0 0', color: semantico.textoSecundario, fontSize: 13 }}>{usuario.email}</p>
    <p style={{ margin: '6px 0 0' }}><Selo>{assinatura?.plano ?? 'SEM PLANO'}</Selo></p>
  </div>
</section>
{aviso && <p role="status" style={{ color: semantico.apitoNivel3 }}>{TEXTO_DO_AVISO[aviso]}</p>}
{erro && <p role="alert" style={{ color: semantico.alerta }}>{erro}</p>}

<details>
  <summary>Editar nome e avatar</summary>
  <form action={atualizarNome}><label>Nome <input name="nome" defaultValue={usuario.nome ?? ''} maxLength={60} required /></label><button type="submit">Salvar nome</button></form>
  <form action={escolherAvatar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
    {AVATARES_PRONTOS.map((a) => (
      <button key={a} type="submit" name="fotoUrl" value={a} aria-label={`Escolher avatar ${a.slice(-6, -4)}`} aria-pressed={usuario.fotoUrl === a} style={{ padding: 0, border: usuario.fotoUrl === a ? `2px solid ${semantico.acento}` : `1px solid ${semantico.divisor}`, borderRadius: 12, background: 'transparent' }}>
        <AvatarUsuario nome={null} email={usuario.email} fotoUrl={a} tamanho={44} />
      </button>
    ))}
    <button type="submit" name="fotoUrl" value="">Sem avatar</button>
  </form>
</details>
```

`TEXTO_DO_AVISO = { 'nome-ok': 'Nome atualizado.', 'avatar-ok': 'Avatar atualizado.', 'senha-ok': 'Senha alterada.', 'email-ok': 'E-mail alterado.', 'sessao-ok': 'Sessão encerrada.' }` — as três últimas chegam nas Tasks 5.

- [ ] **Step 10: Rodar e ver passar** — `npx vitest run src/app/__tests__/telas-05-conta.test.ts src/design-system`. Esperado: PASS.

- [ ] **Step 11: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`.

---

### Task 5: Perfil · segurança — senha, e-mail, dispositivos

**Files:**
- Modify: `src/modules/plataforma/auth/sessao.ts` (duas funções novas)
- Modify: `src/app/(app)/conta/acoes.ts` (`trocarSenha`, `trocarEmail`, `encerrarDispositivo`), `conta/page.tsx`
- Test: `src/modules/plataforma/__tests__/sessao-dispositivo.test.ts` (novo), `src/app/__tests__/telas-05-conta.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // sessao.ts
  export async function encerrarSessoesDoDispositivo(db: Db, usuarioId: string, dispositivoId: string, motivo: string, agora: Date): Promise<number>
  export async function dispositivoDaSessao(db: Db, token: string): Promise<string | null>
  ```
- Consumes: `conferirSenha(senha, hash)`, `gerarHash(senha)` (`auth/senha.ts`); `tokenDaSessaoAtual()` (`auth/cookies.ts`); `dispositivosDoUsuario(db, usuarioId)` (`admin/usuarios.ts`, devolve `{ id, tipo, ultimoUso, temSessaoAtiva, ... }`).
- **Escopo declarado:** trocar e-mail exige a senha atual e vale na hora. A confirmação no endereço novo (spec §4.3) **depende do provedor de e-mail** (§5.3) e entra quando ele existir — a tela avisa isso em uma linha.

- [ ] **Step 1: Teste da sessão que falha** — `src/modules/plataforma/__tests__/sessao-dispositivo.test.ts` (com `bancoDeTeste()`; crie um usuário via `adicionarUsuario` e autentique duas vezes com `autenticar(db, { email, senha }, { fingerprint, tipo, userAgent, ip }, agora)` usando dois fingerprints — cada um vira um dispositivo com sessão):

```ts
it('encerra só as sessões daquele dispositivo, e só se ele for do usuário', async () => {
  const [d1, d2] = await banco.db.select({ id: dispositivos.id, usuarioId: dispositivos.usuarioId }).from(dispositivos)
  const encerradas = await encerrarSessoesDoDispositivo(banco.db, d1!.usuarioId, d1!.id, 'usuario', new Date())
  expect(encerradas).toBe(1)
  const abertas = await banco.db.select().from(sessoes).where(isNull(sessoes.encerradaEm))
  expect(abertas.map((s) => s.dispositivoId)).toEqual([d2!.id])
  // outro usuário não encerra o que não é dele
  expect(await encerrarSessoesDoDispositivo(banco.db, '00000000-0000-4000-8000-000000000099', d2!.id, 'usuario', new Date())).toBe(0)
})

it('dispositivoDaSessao devolve o dispositivo do token vivo, e null para token desconhecido', async () => {
  expect(await dispositivoDaSessao(banco.db, tokenDoPrimeiroLogin)).toBeTruthy()
  expect(await dispositivoDaSessao(banco.db, 'nao-existe')).toBeNull()
})
```

(`tokenDoPrimeiroLogin` é o `token` que `autenticar` devolve no `ResultadoLogin` bem-sucedido — leia `sessao.ts:23-58` para o formato exato.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/plataforma/__tests__/sessao-dispositivo.test.ts`. Esperado: FAIL — funções não existem.

- [ ] **Step 3: Implementar no `sessao.ts`** (usa `hashDoToken`, que já existe no arquivo):

```ts
/**
 * "Encerrar sessão" POR DISPOSITIVO, pelo próprio usuário (perfil). Escopado
 * ao `usuarioId` de propósito: o id do dispositivo vem de um formulário, e
 * sem o escopo qualquer id colado encerraria a sessão de outra pessoa.
 */
export async function encerrarSessoesDoDispositivo(
  db: Db,
  usuarioId: string,
  dispositivoId: string,
  motivo: string,
  agora: Date,
): Promise<number> {
  const encerradas = await db
    .update(sessoes)
    .set({ encerradaEm: agora, motivoEncerramento: motivo })
    .where(and(eq(sessoes.usuarioId, usuarioId), eq(sessoes.dispositivoId, dispositivoId), isNull(sessoes.encerradaEm)))
    .returning({ id: sessoes.id })
  return encerradas.length
}

/** O dispositivo da sessão viva deste token — para a tela marcar "este aparelho". */
export async function dispositivoDaSessao(db: Db, token: string): Promise<string | null> {
  const [s] = await db
    .select({ dispositivoId: sessoes.dispositivoId })
    .from(sessoes)
    .where(and(eq(sessoes.tokenHash, hashDoToken(token)), isNull(sessoes.encerradaEm)))
    .limit(1)
  return s?.dispositivoId ?? null
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/modules/plataforma/__tests__/sessao-dispositivo.test.ts`. Esperado: PASS.

- [ ] **Step 5: Teste da tela que falha** — em `telas-05-conta.test.ts`:

```ts
it('trocar senha exige a atual; trocar e-mail exige a senha; a tela diz que a confirmação por e-mail vem com o provedor', async () => {
  const { default: Pagina } = await import('../(app)/conta/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  expect(html).toContain('name="senhaAtual"')
  expect(html).toContain('name="novaSenha"')
  expect(html).toContain('name="novoEmail"')
  expect(html).toContain('minlength="12"')
  expect(html.toLowerCase()).toContain('confirmação por e-mail')
})

it('cada dispositivo tem "encerrar sessão", e o aparelho em uso está marcado', async () => {
  const { default: Pagina } = await import('../(app)/conta/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  expect(html).toContain('name="dispositivoId"')
  expect(html).toContain('Encerrar sessão')
})
```

(No arnês não há cookie de sessão, então `dispositivoDaSessao` devolve `null` e nenhum aparelho é "este"; a marcação "este aparelho" fica coberta pelo teste de `dispositivoDaSessao`. Se quiser cobrir a tela, mocke `tokenDaSessaoAtual` no `vi.mock` de `auth/cookies` para devolver o token do login semeado.)

- [ ] **Step 6: Implementar as ações** — em `conta/acoes.ts`:

```ts
import { conferirSenha, gerarHash } from '@/modules/plataforma/auth/senha'
import { tokenDaSessaoAtual } from '@/modules/plataforma/auth/cookies'
import { encerrarSessoesDoDispositivo } from '@/modules/plataforma/auth/sessao'

const senhaSchema = z.string().min(12, 'A senha precisa ter ao menos 12 caracteres.').max(128)
const emailSchema = z.string().trim().toLowerCase().email('E-mail inválido.')

async function usuarioComSenhaConferida(usuarioId: string, senhaAtual: string) {
  const [u] = await getDb().select({ id: usuarios.id, senhaHash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1)
  if (!u || !(await conferirSenha(senhaAtual, u.senhaHash))) return null
  return u
}

export async function trocarSenha(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const nova = senhaSchema.safeParse(formulario.get('novaSenha'))
  if (!nova.success) redirect(`/conta?erro=${encodeURIComponent(nova.error.issues[0]!.message)}`)
  const u = await usuarioComSenhaConferida(sessao.usuarioId, String(formulario.get('senhaAtual') ?? ''))
  if (!u) redirect('/conta?erro=Senha%20atual%20incorreta.')
  await getDb().update(usuarios).set({ senhaHash: await gerarHash(nova.data) }).where(eq(usuarios.id, u.id))
  redirect('/conta?aviso=senha-ok')
}

export async function trocarEmail(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const novo = emailSchema.safeParse(formulario.get('novoEmail'))
  if (!novo.success) redirect(`/conta?erro=${encodeURIComponent(novo.error.issues[0]!.message)}`)
  const u = await usuarioComSenhaConferida(sessao.usuarioId, String(formulario.get('senhaAtual') ?? ''))
  if (!u) redirect('/conta?erro=Senha%20atual%20incorreta.')
  const [ocupado] = await getDb().select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, novo.data)).limit(1)
  if (ocupado && ocupado.id !== u.id) redirect('/conta?erro=Este%20e-mail%20j%C3%A1%20est%C3%A1%20em%20uso.')
  await getDb().update(usuarios).set({ email: novo.data }).where(eq(usuarios.id, u.id))
  redirect('/conta?aviso=email-ok')
}

export async function encerrarDispositivo(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const dispositivoId = String(formulario.get('dispositivoId') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(dispositivoId)) redirect('/conta?erro=Dispositivo%20inv%C3%A1lido.')
  await encerrarSessoesDoDispositivo(getDb(), sessao.usuarioId, dispositivoId, 'usuario', new Date())
  redirect('/conta?aviso=sessao-ok')
}
```

Na `page.tsx`: `const token = await tokenDaSessaoAtual(); const esteAparelho = token ? await dispositivoDaSessao(db, token) : null`. Bloco **Segurança** com os dois formulários (`senhaAtual` + `novaSenha` com `minLength={12}`; `senhaAtual` + `novoEmail`) e a linha: *"A troca de e-mail vale na hora. A confirmação por e-mail no endereço novo entra quando a NIP tiver envio de e-mail."*. Bloco **Dispositivos**: cada linha vira `tipo · último uso · {esteAparelho === d.id ? 'este aparelho' : ''}` com `<form action={encerrarDispositivo}><input type="hidden" name="dispositivoId" value={d.id} /><button type="submit" disabled={!d.temSessaoAtiva}>Encerrar sessão</button></form>`.

- [ ] **Step 7: Rodar e ver passar** — `npx vitest run src/app/__tests__/telas-05-conta.test.ts src/modules/plataforma`. Esperado: PASS.

- [ ] **Step 8: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`.

---

### Task 6: Perfil · assinatura, blocos e o desktop em duas colunas

**Files:**
- Modify: `src/app/(app)/conta/page.tsx`
- Modify: `src/app/globals.css` (classe `grade-conta`)
- Test: `src/app/__tests__/telas-05-conta.test.ts`

**Interfaces:**
- Consumes: `avaliarAcesso(db, usuarioId)` → `{ permitido, validoAte, motivo }`; `assinaturas` (`plano`, `status`, `proximaCobranca`); `diaCompleto(date, fuso)` e `dataHora` (`components/formato.ts`).

- [ ] **Step 1: Teste que falha**:

```ts
it('sem plano não parece erro: é uma chamada com o botão de assinar, não quatro traços', async () => {
  const { default: Pagina } = await import('../(app)/conta/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  expect(html).not.toContain('Não contratado')
  expect(html.match(/>—</g) ?? []).toHaveLength(0)
  expect(html).toContain('href="/assinar"')
})

it('os quatro blocos, nesta ordem: Conta · Assinatura · Alertas · Dispositivos — e a grade do desktop', async () => {
  const { default: Pagina } = await import('../(app)/conta/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  const ordem = ['>CONTA<', '>ASSINATURA<', '>ALERTAS<', '>DISPOSITIVOS<'].map((m) => html.indexOf(m))
  expect(ordem.every((i) => i >= 0)).toBe(true)
  expect([...ordem].sort((a, b) => a - b)).toEqual(ordem)
  expect(html).toContain('class="grade-conta"')
})

it('com plano vigente, a contagem regressiva para a próxima cobrança está escrita em dias', async () => {
  const { assinaturas } = await import('../../modules/dominio/db/schema')
  await banco.db.insert(assinaturas).values({ usuarioId: USUARIO_DEMO, plano: 'MENSAL', status: 'ATIVA', proximaCobranca: new Date(AGORA.getTime() + 5 * 86_400_000), atualizadoEm: AGORA })
  try {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toMatch(/próxima cobrança em 5 dias/i)
  } finally {
    await banco.db.delete(assinaturas).where(eq(assinaturas.usuarioId, USUARIO_DEMO))
  }
})
```

(Confira as colunas obrigatórias de `assinaturas` no schema antes do insert — `mercadopagoId` pode ser nulo; se a tabela exigir outros campos, preencha-os no teste.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/telas-05-conta.test.ts`. Esperado: FAIL.

- [ ] **Step 3: Implementar** — em `conta/page.tsx`, um `Bloco` local:

```tsx
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: 16, borderRadius: 14, border: `1px solid ${semantico.divisor}`, background: semantico.superficie }}>
      <h2 style={{ margin: '0 0 12px', fontFamily: semantico.fonteRotulo, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: semantico.textoSecundario }}>{titulo}</h2>
      {children}
    </section>
  )
}

function diasAte(data: Date | null, agora: Date): number | null {
  if (!data) return null
  return Math.max(0, Math.ceil((data.getTime() - agora.getTime()) / 86_400_000))
}
```

e o corpo: identidade (Task 4) → `<div className="grade-conta">` com `Bloco "Conta"` (editar nome/avatar, segurança da Task 5), `Bloco "Assinatura"` (com plano: `plano`, `válido até`, e `próxima cobrança em N dias` quando `proximaCobranca`; sem plano: parágrafo *"Sem plano ativo. Com o plano você recebe a Lista Secreta antes dos jogos e o Fire Live no 1º quarto."* + `<Link href="/assinar">Assinar</Link>`; o botão de cancelar continua onde está, dentro do bloco), `Bloco "Alertas"` (`AtivarAlertas` + `PainelExperiencia`), `Bloco "Dispositivos"` (Task 5) `</div>` e o `Sair` no fim. Em `globals.css`:

```css
.grade-conta { display: grid; gap: 16px; }
@media (min-width: 900px) { .grade-conta { grid-template-columns: 1fr 1fr; } }
```

Remova a lista "Explorar": os dois links vão para o rodapé da tela em uma linha (`Estatísticas · Como funciona`), porque não são conta.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/app/__tests__/telas-05-conta.test.ts src/app/__tests__/telas-demo.test.ts`. Esperado: PASS. (Se `telas-demo.test.ts` afirmava "Não contratado" ou a lista "Explorar", ajuste: mudaram de propósito.)

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`.

---

### Task 7: Recuperação de senha por link emitido pelo admin

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts` (tabela `redefinicoesSenha`)
- Create: migration via `npm run db:generate`
- Create: `src/modules/plataforma/auth/redefinicao.ts`
- Modify: `src/app/(admin)/admin/usuarios/acoes.ts`, `page.tsx`
- Create: `src/app/redefinir/page.tsx`, `src/app/redefinir/[token]/page.tsx`, `src/app/redefinir/[token]/acoes.ts`
- Modify: `src/app/(app)/entrar/page.tsx:52`
- Test: `src/modules/plataforma/__tests__/redefinicao.test.ts` (novo), `src/modules/dominio/__tests__/persistencia.test.ts` (68 → 69), `src/app/__tests__/telas-05-redefinir.test.ts` (novo)

**Interfaces:**
- Produces:
  ```ts
  export const VALIDADE_DA_REDEFINICAO_MS = 60 * 60_000
  export async function emitirRedefinicao(db: Db, e: { usuarioId: string; criadaPorId: string | null; agora: Date }): Promise<{ token: string; expiraEm: Date }>
  export type ResultadoRedefinicao = { ok: true } | { ok: false; motivo: 'token' | 'expirada' | 'usada' | 'senha' }
  export async function concluirRedefinicao(db: Db, e: { token: string; novaSenha: string; agora: Date }): Promise<ResultadoRedefinicao>
  ```
- **O mesmo token serve ao e-mail depois:** o provedor só troca quem ENTREGA o link; `emitirRedefinicao` não muda.

- [ ] **Step 1: Schema + migration** — em `plataforma.ts`:

```ts
/**
 * REDEFINIÇÃO DE SENHA — token de uso único, com validade curta, guardado
 * como hash (o token em claro só existe no link). Hoje quem emite é o admin,
 * que entrega o link por fora; quando houver provedor de e-mail, ele entrega
 * o mesmo link — nada aqui muda.
 */
export const redefinicoesSenha = pgTable(
  'redefinicoes_senha',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    usadaEm: timestamp('usada_em', { withTimezone: true }),
    criadaPorId: uuid('criada_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('redefinicoes_senha_usuario_idx').on(t.usuarioId)],
)
```

`npm run db:generate`; em `persistencia.test.ts` as duas asserções `toBe(68)` viram `toBe(69)`. `npx vitest run src/modules/dominio/__tests__/persistencia.test.ts` → PASS.

- [ ] **Step 2: Teste do serviço que falha** — `src/modules/plataforma/__tests__/redefinicao.test.ts` (com `bancoDeTeste()` e um usuário criado por `adicionarUsuario(db, { email, senha: 'senha-antiga-12' })`):

```ts
describe('redefinição de senha por token', () => {
  it('emite um token que não fica em claro no banco, e concluir troca a senha e queima o token', async () => {
    const agora = new Date('2026-09-12T12:00:00Z')
    const { token, expiraEm } = await emitirRedefinicao(banco.db, { usuarioId, criadaPorId: null, agora })
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(expiraEm.getTime() - agora.getTime()).toBe(VALIDADE_DA_REDEFINICAO_MS)
    const [linha] = await banco.db.select().from(redefinicoesSenha)
    expect(linha!.tokenHash).not.toContain(token)

    expect(await concluirRedefinicao(banco.db, { token, novaSenha: 'nova-senha-forte-12', agora })).toEqual({ ok: true })
    const [u] = await banco.db.select({ senhaHash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, usuarioId))
    expect(await conferirSenha('nova-senha-forte-12', u!.senhaHash)).toBe(true)
    expect(await concluirRedefinicao(banco.db, { token, novaSenha: 'outra-senha-forte-12', agora })).toEqual({ ok: false, motivo: 'usada' })
  })
  it('token desconhecido, expirado ou senha curta não trocam nada', async () => {
    const agora = new Date('2026-09-12T12:00:00Z')
    expect(await concluirRedefinicao(banco.db, { token: 'x', novaSenha: 'nova-senha-forte-12', agora })).toEqual({ ok: false, motivo: 'token' })
    const { token } = await emitirRedefinicao(banco.db, { usuarioId, criadaPorId: null, agora })
    expect(await concluirRedefinicao(banco.db, { token, novaSenha: 'curta', agora })).toEqual({ ok: false, motivo: 'senha' })
    const depois = new Date(agora.getTime() + VALIDADE_DA_REDEFINICAO_MS + 1)
    expect(await concluirRedefinicao(banco.db, { token, novaSenha: 'nova-senha-forte-12', agora: depois })).toEqual({ ok: false, motivo: 'expirada' })
  })
  it('concluir encerra todas as sessões abertas do usuário — senha nova, sessões antigas fora', async () => {
    // autentique uma vez antes (ver sessao-dispositivo.test.ts), depois:
    const agora = new Date()
    const { token } = await emitirRedefinicao(banco.db, { usuarioId, criadaPorId: null, agora })
    await concluirRedefinicao(banco.db, { token, novaSenha: 'nova-senha-forte-12', agora })
    const abertas = await banco.db.select().from(sessoes).where(and(eq(sessoes.usuarioId, usuarioId), isNull(sessoes.encerradaEm)))
    expect(abertas).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/modules/plataforma/__tests__/redefinicao.test.ts`. Esperado: FAIL — módulo não existe.

- [ ] **Step 4: Implementar** — `src/modules/plataforma/auth/redefinicao.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'

import type { Db } from '../../dominio/db/tipos'
import { redefinicoesSenha, sessoes, usuarios } from '../../dominio/db/schema'
import { gerarHash } from './senha'

export const VALIDADE_DA_REDEFINICAO_MS = 60 * 60_000
const MINIMO_SENHA = 12 // o mesmo do cadastro

const hashDe = (token: string) => createHash('sha256').update(token).digest('hex')

export async function emitirRedefinicao(
  db: Db,
  e: { usuarioId: string; criadaPorId: string | null; agora: Date },
): Promise<{ token: string; expiraEm: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiraEm = new Date(e.agora.getTime() + VALIDADE_DA_REDEFINICAO_MS)
  await db.insert(redefinicoesSenha).values({
    usuarioId: e.usuarioId,
    tokenHash: hashDe(token),
    expiraEm,
    criadaPorId: e.criadaPorId,
    criadaEm: e.agora,
  })
  return { token, expiraEm }
}

export type ResultadoRedefinicao = { ok: true } | { ok: false; motivo: 'token' | 'expirada' | 'usada' | 'senha' }

export async function concluirRedefinicao(
  db: Db,
  e: { token: string; novaSenha: string; agora: Date },
): Promise<ResultadoRedefinicao> {
  if (e.novaSenha.length < MINIMO_SENHA) return { ok: false, motivo: 'senha' }
  const [r] = await db.select().from(redefinicoesSenha).where(eq(redefinicoesSenha.tokenHash, hashDe(e.token))).limit(1)
  if (!r) return { ok: false, motivo: 'token' }
  if (r.usadaEm) return { ok: false, motivo: 'usada' }
  if (r.expiraEm.getTime() < e.agora.getTime()) return { ok: false, motivo: 'expirada' }
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ senhaHash: await gerarHash(e.novaSenha) }).where(eq(usuarios.id, r.usuarioId))
    await tx.update(redefinicoesSenha).set({ usadaEm: e.agora }).where(eq(redefinicoesSenha.id, r.id))
    // Senha nova, sessões antigas fora: é o que quem perdeu a senha espera.
    await tx
      .update(sessoes)
      .set({ encerradaEm: e.agora, motivoEncerramento: 'redefinicao' })
      .where(and(eq(sessoes.usuarioId, r.usuarioId), isNull(sessoes.encerradaEm)))
  })
  return { ok: true }
}
```

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run src/modules/plataforma/__tests__/redefinicao.test.ts`. Esperado: PASS.

- [ ] **Step 6: O admin emite o link** — em `admin/usuarios/acoes.ts` (siga o padrão de `acaoBloquear`, que já usa `exigirAdmin()`):

```ts
export async function acaoEmitirRedefinicao(formulario: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin) redirect('/admin/entrar')
  const usuarioId = String(formulario.get('usuarioId') ?? '')
  const { token } = await emitirRedefinicao(getDb(), { usuarioId, criadaPorId: admin.usuarioId, agora: new Date() })
  const base = process.env.APP_PUBLIC_URL ?? ''
  // O link volta pela URL para o admin copiar; nunca é gravado nem logado.
  redirect(`/admin/usuarios?redefinicao=${encodeURIComponent(`${base}/redefinir/${token}`)}`)
}
```

Na `admin/usuarios/page.tsx`, um botão "Emitir link de redefinição" por linha (form com `usuarioId` oculto) e, quando `searchParams.redefinicao` existir, um `<p role="status">Link de redefinição (válido por 1 hora, uso único): <code>{link}</code></p>` no topo.

- [ ] **Step 7: A página pública** — `src/app/redefinir/[token]/acoes.ts`:

```ts
'use server'
import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { concluirRedefinicao } from '@/modules/plataforma/auth/redefinicao'

const MENSAGEM = { token: 'Link inválido.', expirada: 'Link expirado. Peça um novo.', usada: 'Este link já foi usado.', senha: 'A senha precisa ter ao menos 12 caracteres.' } as const

export async function concluir(formulario: FormData): Promise<void> {
  const token = String(formulario.get('token') ?? '')
  const r = await concluirRedefinicao(getDb(), { token, novaSenha: String(formulario.get('novaSenha') ?? ''), agora: new Date() })
  if (!r.ok) redirect(`/redefinir/${token}?erro=${encodeURIComponent(MENSAGEM[r.motivo])}`)
  redirect('/entrar?aviso=senha-redefinida')
}
```

`src/app/redefinir/[token]/page.tsx`: título "Nova senha", um `<form action={concluir}>` com `<input type="hidden" name="token" value={token} />`, `<input type="password" name="novaSenha" minLength={12} required autoComplete="new-password" />`, o erro de `searchParams.erro` em `role="alert"`. `src/app/redefinir/page.tsx` (a "esqueci a senha" sem provedor): *"Ainda não enviamos e-mail. Peça o link de redefinição a quem administra a sua conta; ele vale por uma hora e só funciona uma vez."* Em `entrar/page.tsx:52`: `Ainda não tem conta? <a href="/cadastrar">Cadastre-se</a> · <a href="/redefinir">Esqueci a senha</a>`.

- [ ] **Step 8: Teste das telas** — `src/app/__tests__/telas-05-redefinir.test.ts` (sem banco: as duas páginas renderizam com `getDb` mockado como no arnês):

```ts
it('a página do token tem o formulário e nunca mostra o token em texto', async () => {
  const { default: Pagina } = await import('../redefinir/[token]/page')
  const html = renderToStaticMarkup(await Pagina({ params: Promise.resolve({ token: 'abc' }), searchParams: Promise.resolve({}) }))
  expect(html).toContain('name="novaSenha"')
  expect(html).toContain('minlength="12"')
  expect(html).toContain('type="hidden" name="token"')
  expect(html).not.toMatch(/>abc</)
})
it('a tela de entrar leva ao "esqueci a senha", e ela explica que o link vem do admin', async () => {
  const { default: Entrar } = await import('../(app)/entrar/page')
  expect(renderToStaticMarkup(await Entrar({ searchParams: Promise.resolve({}) }))).toContain('href="/redefinir"')
  const { default: Esqueci } = await import('../redefinir/page')
  expect(renderToStaticMarkup(await Esqueci()).toLowerCase()).toContain('uma hora')
})
```

`npx vitest run src/app/__tests__/telas-05-redefinir.test.ts`. Esperado: PASS. (Confira a assinatura real de `entrar/page.tsx` — se ela não recebe `searchParams`, chame sem argumento.)

- [ ] **Step 9: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npx vitest run src/modules/plataforma src/app/__tests__`.

---

### Task 8: Conta de teste para a equipe

**Files:**
- Create: `scripts/criar-conta-teste.ts`
- Modify: `package.json` (script `conta:teste`)
- Test: nenhum automatizado — é operação (o serviço que ele chama já é testado); o Step 3 é a verificação

**Interfaces:**
- Consumes: `adicionarUsuario(db, { email, senha, nome })` (`admin/usuarios.ts`), `concederCortesia(db, { usuarioId, referencia, inicio, fim })` e `avaliarAcesso(db, usuarioId, agora)` (`assinatura/direito.ts`).

- [ ] **Step 1: O script** — `scripts/criar-conta-teste.ts` (modelo: `conceder-cortesia.ts` e `bootstrap-admin.ts` — senha por variável, nunca impressa):

```ts
import { eq } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { usuarios } from '../src/modules/dominio/db/schema'
import { adicionarUsuario } from '../src/modules/plataforma/admin/usuarios'
import { avaliarAcesso, concederCortesia } from '../src/modules/plataforma/assinatura/direito'

/**
 * Conta de TESTE para a equipe (tarefa da call de 08/09): cria o usuário se
 * não existir e concede cortesia sem expiração. A senha entra por variável e
 * nunca é impressa. Reexecutar não duplica.
 *
 *   CONTA_TESTE_EMAIL=equipe@nip.test CONTA_TESTE_SENHA='...12+ caracteres...' \
 *   npx dotenv -e .env.local -- npm run conta:teste
 */
async function principal() {
  const email = (process.env.CONTA_TESTE_EMAIL ?? '').trim().toLowerCase()
  const senha = process.env.CONTA_TESTE_SENHA ?? ''
  const nome = process.env.CONTA_TESTE_NOME || 'Conta de teste'
  delete process.env.CONTA_TESTE_SENHA
  if (!email || senha.length < 12) throw new Error('Defina CONTA_TESTE_EMAIL e CONTA_TESTE_SENHA (12+ caracteres)')

  const db = getDb()
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1)
  const { id } = existente ?? (await adicionarUsuario(db, { email, senha, nome }))
  const agora = new Date()
  await concederCortesia(db, { usuarioId: id, referencia: `cortesia:teste:${email}`, inicio: agora, fim: null })
  const acesso = await avaliarAcesso(db, id, agora)
  if (!acesso.permitido) throw new Error(`conta criada mas acesso negado: ${acesso.motivo}`)
  console.log(`${existente ? 'Conta já existia' : 'Conta criada'}: ${email} · acesso ativo por cortesia.`)
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
```

`package.json`: `"conta:teste": "vite-node scripts/criar-conta-teste.ts"`.

- [ ] **Step 2: Verificar que compila** — `npm run typecheck && npm run lint`.

- [ ] **Step 3: Provar em PGlite, sem Neon** — escreva um teste descartável ou rode uma vez no arnês: `npx vitest run src/modules/plataforma/__tests__/plataforma.test.ts` prova `adicionarUsuario`/`concederCortesia`. A execução real contra o Neon é da Task 12 (com a senha escolhida pelo parceiro; ele entrega o e-mail à equipe, nunca a senha por escrito aqui).

---

### Task 9: Saída do apito para a casa parceira

**Files:**
- Modify: `src/modules/dominio/db/schema/afiliados.ts:143-160` (`linksAfiliados.saidaDoApito`)
- Create: migration via `npm run db:generate`
- Create: `src/modules/entrega/saida-para-casa.ts`
- Modify: `src/app/(admin)/admin/afiliados/acoes.ts` (+ botão na página que lista links)
- Modify: `src/app/(app)/apito/[jogadorId]/page.tsx:745-767`
- Test: `src/modules/entrega/__tests__/saida-para-casa.test.ts` (novo), `src/app/__tests__/telas-04-detalhe.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SaidaParaCasa = { codigo: string; rotulo: string }   // rotulo = nome da oferta
  export async function saidaDoApito(db: Db): Promise<SaidaParaCasa | null>
  export async function definirSaidaDoApito(db: Db, linkId: string | null, agora: Date): Promise<void>
  ```
- Consumes: `/ir/[codigo]` (`src/app/ir/[codigo]/route.ts`) — o redirecionamento rastreado que já registra o clique e leva à casa. `linksAfiliados` (`codigo`, `ativo`, `campanhaId`), `campanhasAfiliados` (`ofertaId`, `status`), `ofertasAfiliados` (`nome`, `status`).
- **Regra 4 intacta:** um `<a>` para `/ir/…` com o aviso do ADR-0004; nada mais.

- [ ] **Step 1: Schema + migration** — em `linksAfiliados`:

```ts
    /**
     * O link que a tela do apito usa como saída para a casa (spec 12/09,
     * §5.4). No máximo UM (índice único parcial); o admin escolhe. Sem nenhum
     * marcado, a tela não mostra saída — nunca inventa destino.
     */
    saidaDoApito: boolean('saida_do_apito').notNull().default(false),
```

e, no array de índices da tabela: `uniqueIndex('links_afiliados_saida_do_apito_unica').on(t.saidaDoApito).where(sql\`${t.saidaDoApito}\`)`. `npm run db:generate` → PASS em `persistencia.test.ts` (coluna, não tabela: continua 69).

- [ ] **Step 2: Teste da entrega que falha** — `src/modules/entrega/__tests__/saida-para-casa.test.ts` (com `bancoDeTeste()`; semeie parceiro → oferta ATIVA → campanha ATIVA → link ativo pelos serviços de `afiliados/servico.ts`, `criarParceiro`, `criarOferta`, `criarCampanhaComLink`; leia as assinaturas no arquivo):

```ts
it('sem link marcado, não há saída — a tela não inventa destino', async () => {
  expect(await saidaDoApito(banco.db)).toBeNull()
})
it('marcar um link o torna a saída; marcar outro desmarca o anterior (só existe um)', async () => {
  await definirSaidaDoApito(banco.db, link1.id, new Date())
  expect(await saidaDoApito(banco.db)).toEqual({ codigo: link1.codigo, rotulo: oferta.nome })
  await definirSaidaDoApito(banco.db, link2.id, new Date())
  expect((await saidaDoApito(banco.db))?.codigo).toBe(link2.codigo)
  const marcados = await banco.db.select().from(linksAfiliados).where(eq(linksAfiliados.saidaDoApito, true))
  expect(marcados).toHaveLength(1)
})
it('link inativo ou oferta pausada não servem de saída', async () => {
  await definirSaidaDoApito(banco.db, link2.id, new Date())
  await banco.db.update(ofertasAfiliados).set({ status: 'PAUSADA' }).where(eq(ofertasAfiliados.id, oferta.id))
  expect(await saidaDoApito(banco.db)).toBeNull()
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/modules/entrega/__tests__/saida-para-casa.test.ts`. Esperado: FAIL.

- [ ] **Step 4: Implementar** — `src/modules/entrega/saida-para-casa.ts`:

```ts
import { and, eq } from 'drizzle-orm'

import type { Db } from '../dominio/db/tipos'
import { campanhasAfiliados, linksAfiliados, ofertasAfiliados } from '../dominio/db/schema'

export type SaidaParaCasa = { codigo: string; rotulo: string }

/**
 * O link rastreado que o apito oferece como saída para a casa parceira. Só
 * existe se o admin marcou um, e só vale se o link, a campanha e a oferta
 * estiverem ativos — senão a tela não mostra saída. Somente leitura (regra
 * 4): é um `<a>` para /ir/<codigo>, que já registra o clique.
 */
export async function saidaDoApito(db: Db): Promise<SaidaParaCasa | null> {
  const [l] = await db
    .select({ codigo: linksAfiliados.codigo, rotulo: ofertasAfiliados.nome })
    .from(linksAfiliados)
    .innerJoin(campanhasAfiliados, eq(linksAfiliados.campanhaId, campanhasAfiliados.id))
    .innerJoin(ofertasAfiliados, eq(campanhasAfiliados.ofertaId, ofertasAfiliados.id))
    .where(
      and(
        eq(linksAfiliados.saidaDoApito, true),
        eq(linksAfiliados.ativo, true),
        eq(campanhasAfiliados.status, 'ATIVA'),
        eq(ofertasAfiliados.status, 'ATIVA'),
      ),
    )
    .limit(1)
  return l ?? null
}

export async function definirSaidaDoApito(db: Db, linkId: string | null, agora: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(linksAfiliados).set({ saidaDoApito: false, atualizadoEm: agora }).where(eq(linksAfiliados.saidaDoApito, true))
    if (linkId) await tx.update(linksAfiliados).set({ saidaDoApito: true, atualizadoEm: agora }).where(eq(linksAfiliados.id, linkId))
  })
}
```

Em `admin/afiliados/acoes.ts`: `acaoDefinirSaidaDoApito(formData)` → `exigirAdmin()` → `definirSaidaDoApito(getDb(), String(formData.get('linkId')) || null, new Date())` → `redirect('/admin/afiliados')`; na página que lista links, um botão "Usar como saída do apito" por link e "Nenhuma saída" no topo.

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run src/modules/entrega/__tests__/saida-para-casa.test.ts`. Esperado: PASS.

- [ ] **Step 6: Teste da tela que falha** — em `telas-04-detalhe.test.ts`:

```ts
it('sem link marcado, o detalhe não oferece saída; com link, oferece a saída rastreada com o aviso do ADR-0004 — e nunca um formulário de aposta', async () => {
  const item = await sujeito()
  let html = await renderizar(item)
  expect(html).not.toContain('href="/ir/')
  // semeie parceiro/oferta/campanha/link como no teste da entrega e marque:
  await definirSaidaDoApito(banco.db, link.id, new Date())
  html = await renderizar(item)
  expect(html).toContain(`href="/ir/${link.codigo}"`)
  expect(html).toContain('rel="nofollow sponsored"')
  expect(html.toLowerCase()).toContain('a odd da sua casa pode ser outra')
  expect(html).not.toMatch(/<form[^>]*aposta/i)
  expect(html).not.toContain('name="valor"')
})
```

- [ ] **Step 7: Implementar o CTA** — em `apito/[jogadorId]/page.tsx`, ler `const saida = await saidaDoApito(db)` junto das outras leituras e, logo depois do `VER ESTATÍSTICAS`:

```tsx
{saida && (
  <p style={{ margin: '12px 0 0' }}>
    <a
      href={`/ir/${saida.codigo}`}
      rel="nofollow sponsored"
      style={{ display: 'block', padding: 12, borderRadius: 12, textAlign: 'center', border: `1.5px solid ${semantico.acento}`, color: semantico.acento, fontFamily: semantico.fonteTitulo, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', textDecoration: 'none' }}
    >
      VER NA CASA PARCEIRA · {saida.rotulo}
    </a>
    <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: semantico.texto55 }}>
      Você sai da NIP. A odd da sua casa pode ser outra; nenhuma aposta é feita por aqui.
    </span>
  </p>
)}
```

- [ ] **Step 8: Rodar e ver passar** — `npx vitest run src/app/__tests__/telas-04-detalhe.test.ts src/modules/entrega`. Esperado: PASS.

- [ ] **Step 9: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`.

---

### Task 10: Gestão de banca — sugeridas × realizadas

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts` (tabela `entradasRealizadas`)
- Create: migration via `npm run db:generate`
- Create: `src/modules/entrega/gestao-realizadas.ts`
- Create: `src/app/(app)/gestao/acoes.ts`
- Modify: `src/app/(app)/gestao/page.tsx:223-262`
- Test: `src/modules/entrega/__tests__/gestao-realizadas.test.ts` (novo), `src/app/__tests__/telas-05-gestao.test.ts` (novo), `persistencia.test.ts` (69 → 70)

**Interfaces:**
- Produces:
  ```ts
  export type EntradaRealizada = { id: string; dataReferencia: string; jogadorId: string; nome: string; atributo: Atributo; linha: number; unidades: number; odd: number | null; registradaEm: Date }
  export async function registrarEntradaRealizada(db: Db, e: { usuarioId: string; dataReferencia: string; jogadorId: string; atributo: Atributo; linha: number; unidades: number; odd: number | null; agora: Date }): Promise<void>   // upsert pela chave natural
  export async function entradasRealizadasDoDia(db: Db, usuarioId: string, dataReferencia: string): Promise<EntradaRealizada[]>
  ```
- Consumes: `planoDoDia(...)` → `PlanoDoDia.entradas: { item: ItemFeed, entrada }[]` (`entrega/gestao.ts`); `atributoEnum` do schema (`apitos.atributo` usa o mesmo).
- **O que o botão grava:** o que o usuário DIGITOU (unidades, odd opcional) — a NIP não sabe o que ele apostou, só o que ele registra. Somente leitura continua valendo.

- [ ] **Step 1: Schema + migration** — em `plataforma.ts` (importe `jogadores` e `atributoEnum` do schema de domínio como os outros arquivos fazem):

```ts
/**
 * ENTRADAS REALIZADAS — o que o usuário registra ter feito em outro lugar,
 * separado do que a NIP sugeriu (spec 12/09, §5.5). A plataforma continua
 * somente leitura: nada aqui envia aposta. Chave natural evita duplicar no
 * segundo toque.
 */
export const entradasRealizadas = pgTable(
  'entradas_realizadas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    dataReferencia: text('data_referencia').notNull(),
    jogadorId: uuid('jogador_id').notNull().references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    linha: smallint('linha').notNull(),
    unidades: numeric('unidades', { precision: 6, scale: 2 }).notNull(),
    odd: numeric('odd', { precision: 6, scale: 2 }),
    registradaEm: timestamp('registrada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('entradas_realizadas_unica').on(t.usuarioId, t.dataReferencia, t.jogadorId, t.atributo, t.linha)],
)
```

`npm run db:generate`; `persistencia.test.ts` → `toBe(70)`; rodar → PASS.

- [ ] **Step 2: Teste da entrega que falha** — `gestao-realizadas.test.ts` (banco semeado com `simularAte` 7 dias; pegue um item do feed de hoje):

```ts
it('registrar duas vezes a mesma entrada atualiza, não duplica; e a lista do dia traz o nome do jogador', async () => {
  const e = { usuarioId: USUARIO, dataReferencia: HOJE, jogadorId: item.jogadorId, atributo: item.atributo, linha: item.linha!, unidades: 1.5, odd: 1.62, agora: new Date() }
  await registrarEntradaRealizada(banco.db, e)
  await registrarEntradaRealizada(banco.db, { ...e, unidades: 2 })
  const lista = await entradasRealizadasDoDia(banco.db, USUARIO, HOJE)
  expect(lista).toHaveLength(1)
  expect(lista[0]).toMatchObject({ nome: item.nome, unidades: 2, odd: 1.62, linha: item.linha })
})
it('a lista é por usuário e por dia', async () => {
  expect(await entradasRealizadasDoDia(banco.db, '00000000-0000-4000-8000-000000000099', HOJE)).toEqual([])
  expect(await entradasRealizadasDoDia(banco.db, USUARIO, '2020-01-01')).toEqual([])
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/modules/entrega/__tests__/gestao-realizadas.test.ts`. Esperado: FAIL.

- [ ] **Step 4: Implementar** — `src/modules/entrega/gestao-realizadas.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm'

import type { Db } from '../dominio/db/tipos'
import { entradasRealizadas, jogadores } from '../dominio/db/schema'

type Atributo = (typeof entradasRealizadas.$inferSelect)['atributo']

export type EntradaRealizada = {
  id: string; dataReferencia: string; jogadorId: string; nome: string
  atributo: Atributo; linha: number; unidades: number; odd: number | null; registradaEm: Date
}

export async function registrarEntradaRealizada(
  db: Db,
  e: { usuarioId: string; dataReferencia: string; jogadorId: string; atributo: Atributo; linha: number; unidades: number; odd: number | null; agora: Date },
): Promise<void> {
  const valores = { unidades: e.unidades.toFixed(2), odd: e.odd === null ? null : e.odd.toFixed(2), registradaEm: e.agora }
  await db
    .insert(entradasRealizadas)
    .values({ usuarioId: e.usuarioId, dataReferencia: e.dataReferencia, jogadorId: e.jogadorId, atributo: e.atributo, linha: e.linha, ...valores })
    .onConflictDoUpdate({
      target: [entradasRealizadas.usuarioId, entradasRealizadas.dataReferencia, entradasRealizadas.jogadorId, entradasRealizadas.atributo, entradasRealizadas.linha],
      set: valores,
    })
}

export async function entradasRealizadasDoDia(db: Db, usuarioId: string, dataReferencia: string): Promise<EntradaRealizada[]> {
  const linhas = await db
    .select({ id: entradasRealizadas.id, dataReferencia: entradasRealizadas.dataReferencia, jogadorId: entradasRealizadas.jogadorId, nome: jogadores.nomeCompleto, atributo: entradasRealizadas.atributo, linha: entradasRealizadas.linha, unidades: entradasRealizadas.unidades, odd: entradasRealizadas.odd, registradaEm: entradasRealizadas.registradaEm })
    .from(entradasRealizadas)
    .innerJoin(jogadores, eq(entradasRealizadas.jogadorId, jogadores.id))
    .where(and(eq(entradasRealizadas.usuarioId, usuarioId), eq(entradasRealizadas.dataReferencia, dataReferencia)))
    .orderBy(desc(entradasRealizadas.registradaEm))
  return linhas.map((l) => ({ ...l, unidades: Number(l.unidades), odd: l.odd === null ? null : Number(l.odd) }))
}
```

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run src/modules/entrega/__tests__/gestao-realizadas.test.ts`. Esperado: PASS.

- [ ] **Step 6: Teste da tela que falha** — `telas-05-gestao.test.ts` (arnês padrão; hoje tem lista publicada no seed de 21 dias):

```ts
it('duas visões, SUGERIDAS e REALIZADAS, por URL; a sugerida tem o botão "registrei" com unidades e odd', async () => {
  const { default: Pagina } = await import('../(app)/gestao/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  expect(html).toContain('href="/gestao?ver=realizadas"')
  expect(html).toContain('aria-current="page"') // a aba SUGERIDAS ativa
  expect(html).toContain('name="unidades"')
  expect(html).toContain('name="odd"')
  expect(html).toContain('>Registrei<')
})
it('a visão REALIZADAS lista o que foi registrado e repete a fronteira de somente leitura', async () => {
  const feed = await lerFeed(banco.db, HOJE)
  const item = feed!.conteudo.itens.find((i) => i.linha !== null)!
  await registrarEntradaRealizada(banco.db, { usuarioId: USUARIO_DEMO, dataReferencia: HOJE, jogadorId: item.jogadorId, atributo: item.atributo, linha: item.linha!, unidades: 1, odd: null, agora: AGORA })
  const { default: Pagina } = await import('../(app)/gestao/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ ver: 'realizadas' }) }))
  expect(html).toContain(item.nome)
  expect(html).toMatch(/1 unidade/)
  expect(html.toLowerCase()).toContain('somente leitura')
})
```

- [ ] **Step 7: Implementar** — `gestao/acoes.ts`:

```ts
'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { registrarEntradaRealizada } from '@/modules/entrega/gestao-realizadas'

const schema = z.object({
  dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jogadorId: z.string().uuid(),
  atributo: z.enum(['PONTOS', 'REBOTES', 'ASSISTENCIAS']),
  linha: z.coerce.number().int().min(1),
  unidades: z.coerce.number().positive().max(100),
  odd: z.union([z.literal(''), z.coerce.number().min(1.01).max(100)]).transform((v) => (v === '' ? null : v)),
})

export async function registrarEntrada(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/gestao')
  const dados = schema.safeParse(Object.fromEntries(formulario))
  if (!dados.success) redirect('/gestao?erro=Confira%20unidades%20e%20odd.')
  await registrarEntradaRealizada(getDb(), { usuarioId: sessao.usuarioId, ...dados.data, agora: new Date() })
  redirect('/gestao?ver=realizadas')
}
```

Na `page.tsx`: ler `ver = params.ver === 'realizadas' ? 'realizadas' : 'sugeridas'`; um seletor com dois `<a>` (`/gestao` e `/gestao?ver=realizadas`, `aria-current="page"` no ativo; estilo do seletor POR JOGO/POR NÍVEL da Lista). Em **sugeridas**, cada linha do plano ganha, à direita, `<form action={registrarEntrada}>` com `dataReferencia`, `jogadorId`, `atributo`, `linha` ocultos, `<input name="unidades" type="number" step="0.5" min="0.5" defaultValue={1} />`, `<input name="odd" type="number" step="0.01" placeholder="odd" />`, `<button>Registrei</button>`. Em **realizadas**, `entradasRealizadasDoDia(db, sessao.usuarioId, hoje)` em lista: nome · `${ATRIBUTO} ${linha}+` · `N unidade(s)` · odd ou "—" · hora; vazio: *"Nada registrado hoje. Registre pela visão Sugeridas o que você fez fora daqui."*; rodapé: *"Somente leitura: a NIP não envia aposta nem sabe o que você apostou — só o que você registra."*

- [ ] **Step 8: Rodar e ver passar** — `npx vitest run src/app/__tests__/telas-05-gestao.test.ts src/app/__tests__/telas-demo.test.ts`. Esperado: PASS.

- [ ] **Step 9: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`.

---

### Task 11: Varredura de sobras — "Carlos", "confiança máxima", telas de largura

**Files:**
- Modify: o que a varredura apontar
- Test: `src/app/__tests__/telas-demo.test.ts` (asserção transversal)

- [ ] **Step 1: Varrer** — `grep -rn "Carlos\|CJ\b" src --include='*.tsx' | grep -v test` (a call pediu método nomeado pelo app; o vocabulário técnico "lista do CJ" em rótulo de tela também entra na varredura — se aparecer para o assinante, vira "lista NIP"; nos comentários de código pode ficar). `grep -rn 'CONFIANÇA MÁXIMA' src docs/04-design-system.md` deve ser vazio (feito em 12/09).
- [ ] **Step 2: Teste transversal** — em `telas-demo.test.ts`, no `describe('regras transversais da identidade')`, acrescente à lista de proibições `'Carlos'` e `'lista do CJ'` para todo HTML renderizado. Rodar; corrigir as sobras.
- [ ] **Step 3: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`.

---

### Task 12: Fechamento — bateria, capturas, spec, migrations no Neon, um commit

**Files:**
- Modify: `docs/superpowers/specs/2026-09-12-nip-pos-call-ux-e-pendencias-design.md` (§5.2 e status), `docs/04-design-system.md`
- Test: tudo

- [ ] **Step 1: Bateria inteira** — `npm run typecheck && npm run lint && npm run boundaries && npm test`. Esperado: verde, sem exceção. Se uma suíte falhar só quando roda em paralelo, rode-a isolada antes de investigar (armadilha conhecida).
- [ ] **Step 2: Capturas em duas larguras** — `scripts/captura-telas.sh 1800` (390 px) e uma segunda passada com a janela em 1280 px (o script aceita a altura; para a largura, edite a moldura `iframe{width}` e `--window-size` para 1280 no comando ou passe por variável). Olhar cada PNG: nenhuma tela rola na horizontal; Estatísticas, Resultados, Gestão e Perfil ocupam a largura de dados no desktop; Lista e Fire Live ficam em 640.
- [ ] **Step 3: A spec** — em §5.2, trocar "Duas colunas … `logo_url`" por: as logos são estáticas em `public/times/` (30 SVGs) e chegam pela `identidadeDoTime()`; o único dado que faltava era a conferência, agora carregada por `demo:conferencias`. Cabeçalho: `**Status:** implementada em <data>` para o que este plano cobre, com a lista do que ficou para os planos e o Telegram (§6).
- [ ] **Step 4: Design system** — em `docs/04-design-system.md`, na seção da Identidade 04, acrescentar: as duas larguras da moldura e quando usar cada uma; `Coluna.soDesktop`; `AvatarUsuario` e os oito avatares; a regra "logo nunca é canal único".
- [ ] **Step 5: Neon, nesta ordem** — `npx dotenv -e .env.local -- npm run db:status` (deve listar as migrations novas como pendentes) → `npx dotenv -e .env.local -- npm run db:migrate` → `npx dotenv -e .env.local -- npm run demo:conferencias` (esperado: `Conferência gravada em 30 de 30 times` e a classificação recomputada) → `CONTA_TESTE_EMAIL=… CONTA_TESTE_SENHA=… npx dotenv -e .env.local -- npm run conta:teste` com a senha que o parceiro escolher → `npx dotenv -e .env.local -- npm run demo:conferir` (verde). Se a Task 0 foi pela saída manual, `demo:temporada` antes de tudo.
- [ ] **Step 6: Commit único** — `git add -A` (confira com `git status` que **não** há `node_modules`, `.superpowers/` nem `scratchpad/` no índice) e:

```bash
git commit -F - <<'EOF'
NIP pós-call: duas larguras de moldura, classificação por conferência com logo, perfil de verdade, senha por link, conta de teste, saída para a casa e gestão com entradas realizadas

<corpo: uma linha por task, com a decisão não óbvia de cada uma — a segunda
largura em vez de uma só; a conferência como dado de domínio e a posição
recomputada por conferência (o trilho estava errado: marcava playoff sobre a
liga inteira); a logo em toda tela e nunca canal único; o perfil com ações sem
JavaScript; a redefinição de senha por token cujo entregador hoje é o admin e
amanhã um provedor de e-mail; a saída do apito como link rastreado, regra 4
intacta; as entradas realizadas como o que o usuário registra, não o que a NIP
sabe.>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: Publicar** — `git push -u origin nip-pos-call`, `gh pr create --base main --fill`, esperar o CI (`verificar`) verde, `gh pr merge --squash --delete-branch` — só depois de o parceiro ver as capturas e dizer que sim.

---

## Auto-revisão

**Cobertura da spec.** §4.1 larguras → Task 1. §4.2 classificação (conferência, logo, trilho, colunas, lado a lado, grupo "sem conferência") → Tasks 2 e 3. §4.3 perfil (identidade, foto, nome, e-mail, senha, dispositivos, assinatura, blocos, desktop, estados) → Tasks 4, 5, 6; a confirmação de e-mail declarada como dependente do provedor (§5.3). §4.4 logo em tudo → Task 3 cobre a classificação; Task 12 confere as demais telas (cabeçalho de jogo e card já usam `LogoTime`; time, partida e jogos do dia — verificar na captura e, onde faltar, acrescentar `<LogoTime … decorativo />` ao lado da sigla). §5.0 rodada → Task 0. §5.1 #1 senha → Task 7. #2 conta de teste → Task 8. #3 dados → Task 2. #4 → Task 1. #5 → Tasks 4–6. #6 saída → Task 9. #7 gestão → Task 10. #8 planos e #9 Telegram → **fora**, por decisão da spec (§6). §7 → feito antes do plano. §5.3 → assumidas as saídas sem dependência (admin, avatares), com o caminho do provedor desenhado. Call: "remover Carlos" → Task 11.

**Placeholder scan.** Os trechos "igual ao de hoje" nas colunas da Task 3 apontam para código existente em `estatisticas/page.tsx:284-365`, que o executor copia — não é placeholder. As assinaturas de `autenticar`, `criarParceiro`/`criarOferta`/`criarCampanhaComLink` e `entrar/page.tsx` são lidas do arquivo indicado na própria task.

**Consistência de nomes.** `LARGURA_DA_MOLDURA`/`largura` (1 → 1). `conferenciaDe` (2 → 2, 3). `soDesktop` (3 → 3). `AvatarUsuario`/`AVATARES_PRONTOS` (4 → 4, 6). `encerrarSessoesDoDispositivo`/`dispositivoDaSessao` (5 → 5). `emitirRedefinicao`/`concluirRedefinicao`/`VALIDADE_DA_REDEFINICAO_MS` (7 → 7). `saidaDoApito`/`definirSaidaDoApito` (9 → 9). `registrarEntradaRealizada`/`entradasRealizadasDoDia` (10 → 10). Contagem de tabelas: 68 → 69 (Task 7) → 70 (Task 10); as Tasks 4 e 9 só adicionam coluna.

**Riscos.** (1) `hashDoToken` em `sessao.ts` pode não estar acessível ao novo helper se for `const` dentro de outro escopo — se for o caso, mova-o para o topo do arquivo (mesmo arquivo, sem exportar). (2) A ordem dos índices em `linksAfiliados` já existe como array; acrescente ao array, não crie outro. (3) `entrar/page.tsx` e as páginas de admin podem receber `searchParams` com formato diferente do assumido nos testes — leia a assinatura antes de escrever a asserção. (4) O seed de teste (`simularAte`) cria times a partir da lista do CJ com siglas reais, então todos ganham conferência; se alguma sigla da lista não estiver na NBA (ex.: erro de digitação no documento), o teste "30 logos" cai para 29 e o grupo "sem conferência" aparece — isso é o comportamento certo, e o número no teste ajusta-se ao que o seed produz.
