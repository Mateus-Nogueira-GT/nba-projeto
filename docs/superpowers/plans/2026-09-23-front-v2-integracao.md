# Front v2 no projeto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar as telas do app pelas do front v2 do cliente, ligadas ao back real, sem perder
nenhum portão de plano, cache, PWA ou regra do projeto.

**Architecture:** entram `src/ui`, `src/features` e as rotas finas de `src/app` do v2. Ficam o
nosso `src/modules`, `src/app/api`, as rotas `r/` e `ir/`, os workflows e a infraestrutura. A
troca vai área por área: em cada tarefa, a área nova entra, a antiga sai e os testes daquela área
são reapontados, então o projeto fica verde no fim de cada tarefa. Os wrappers de cache da Onda 2
vão primeiro para `src/app/_cache/`, para as duas versões poderem usá-los durante a transição.

**Tech Stack:** Next.js 16.3.6 (App Router, rotas paralelas e interceptadas), React 19, CSS
Modules com variáveis, Drizzle e PGlite nos testes, Vitest e Playwright 1.62.1 local.

**Spec:** [`docs/superpowers/specs/2026-09-23-front-v2-integracao-design.md`](../specs/2026-09-23-front-v2-integracao-design.md)
**Fonte do front:** `referencias/nip-front-v2/` (cópia exata) e
`referencias/nip-front-v2-prints/` (os prints e o `indice.json`).

## Global Constraints

- `src/modules` é o NOSSO. Nada de `referencias/nip-front-v2/src/modules` nem de `src/dados-falsos`
  entra. A única mudança em `modules` que vem do front são os dois apelidos de tipo da Tarefa 9.
- `consulta-falsa` nunca entra: todo `import … from '@/modules/dominio/db/consulta-falsa'` vira
  `from 'drizzle-orm'`.
- Motor e ruleset não mudam. Fire Live só no 1º quarto. "Confiança", nunca "probabilidade".
  `nível do jogador` ≠ `nível do apito`.
- O portão de nível (`exigirNivel` + `atende`) vem antes de qualquer leitura paga, e nenhum item
  do feed chega ao HTML do plano grátis. O feed é lido por `lerFeedCacheado`. Página paga não tem
  `'use cache'`. Toda `revalidateTag(…)` termina em `, 'max'`.
- As estatísticas de jogador, time e jogo chamam `exigirCookieDeSessao` antes de qualquer consulta.
- Admin: `exigirAdmin()` no servidor em toda página e em toda ação.
- Paleta e tipografia do Manual da Marca (tokens do v2). Laranja não é cor de interface. Nada
  de texto abaixo de 12px. Campos com 52px e botões com 48px. O logo é o arquivo. Animações
  de 150–250ms, desligadas com `prefers-reduced-motion`.
- Um commit no fim (preferência do parceiro): commits WIP por tarefa e squash na Tarefa 14.
- Suíte completa só em lotes de 12. `next build` só com o banco em `127.0.0.1:1`.
- **As decisões D1–D7 da spec §7 já estão respondidas** (23/09): confiança com `%` na linha; landing
  com a noite conferida de ontem e só números de hoje; placar público com cache de 1 h; quantidades
  do v2; três temas com Marinho padrão; "Sixth Man AI"; prints fora do git.

## Review Focus

1. **Plano grátis vendo item pago.** Uma `carregar.ts` do v2 que leia o feed antes do `atende`,
   ou que passe o item para um componente de cliente. Teste: o grátis renderiza a Lista, o Ao Vivo
   e o detalhe, e o HTML não contém nenhum `jogadorId` do feed (Tarefas 3, 4 e 11).
2. **Painel interceptado sem portão.** `@painel/(.)apito` renderiza o detalhe por outro caminho
   que o da página. Teste: o painel também exige MVP (Tarefa 3).
3. **Hidratação com dado real.** A fachada devolvia dado estável, e o real tem `Date`, `null` e
   listas vazias. Teste: cada fumaça roda também com banco vazio, sem semente (Tarefas 3–10).
4. **Admin aberto.** A fachada devolvia sempre ADMIN. Teste: um usuário comum em `/admin/*`
   recebe redirect ou 404, nunca a página (Tarefa 9).
5. **Tema sem cookie ou com cookie inválido.** Teste: `nip-tema=xyz` cai no Marinho (Tarefa 1).

---

## Pré-voo

- [ ] `git switch -c front-v2` a partir de `main` (`deb6b19`). Se a `prontidao-pendencias` já tiver
      sido mesclada, partir da main nova.
- [ ] O `%` não commitado de `src/app/(app)/apito/[jogadorId]/page.tsx` é absorvido pelo v2 (D1,
      decidida): guardar o patch em `.superpowers/sdd/<plano>/percent.patch` por precaução e fazer
      `git checkout` do arquivo. A página é substituída na Tarefa 3.
- [ ] Ledger em `.superpowers/sdd/2026-09-23-front-v2-integracao/progress.md`.
- [ ] Rodar o `npm run dev` do projeto uma vez com a semente da demo, para ter a base visual.

---

### Task 1: Fundação — tokens, marca, fontes, casca e temas

**Files:**
- Copy: `referencias/nip-front-v2/src/ui/**` → `src/ui/**`
- Copy: `referencias/nip-front-v2/public/{avatares,landing,marca}` → `public/`
- Copy: `referencias/nip-front-v2/src/features/shell/**` → `src/features/shell/**`
- Modify: `src/app/layout.tsx` (fontes e tema do v2; manter `manifest`, `themeColor`, o registro do SW e os metadados de PWA atuais)
- Test: `src/features/shell/__tests__/tema.test.ts`

**Interfaces:** Produces: `temaDoCookie(valor: string | undefined): 'marinho' | 'aco' | 'claro'` (ver `src/features/shell/tema.ts` do v2; se o nome for outro, usar o do v2 e registrar no ledger).

- [ ] **Step 1:** copiar os diretórios acima com `rsync -a` e `diff -rq` contra a origem (tem que sair vazio).
- [ ] **Step 2:** teste do tema (falha antes do Step 3, porque o layout ainda não aplica o tema):

```ts
import { describe, expect, it } from 'vitest'
import { temaDoCookie } from '../tema'

describe('tema', () => {
  it('sem cookie ou com valor estranho, é o Marinho', () => {
    expect(temaDoCookie(undefined)).toBe('marinho')
    expect(temaDoCookie('xyz')).toBe('marinho')
  })
  it('os três temas do v2 passam', () => {
    for (const t of ['marinho', 'aco', 'claro'] as const) expect(temaDoCookie(t)).toBe(t)
  })
})
```

- [ ] **Step 3:** portar do `src/app/layout.tsx` do v2 as fontes (Bebas Neue, Montserrat), o
      `tokens.css` e o atributo de tema. Manter do nosso layout o manifest, os ícones, o
      `themeColor` e o `RegistrarServiceWorker`. Juntar os dois, não trocar um pelo outro.
- [ ] **Step 4:** `npx vitest run src/features/shell src/app/__tests__/pwa.test.ts src/app/__tests__/navegacao.test.ts` + `npm run typecheck`.
      Neste ponto o `navegacao.test.ts` ainda testa a casca antiga, e isso está certo: a casca
      nova só entra no layout do `(app)` na Tarefa 3.

### Task 2: Caches num lugar neutro

**Files:**
- Move: `src/app/(app)/feed-cacheado.ts` → `src/app/_cache/feed.ts`
- Move: `src/app/(app)/estatisticas/temporada-cacheada.ts` → `src/app/_cache/temporada.ts`
- Move: a parte de cache de `src/app/(app)/lateral/leitura.ts` (`TAG_LATERAL`, `lerLateralCacheada`) → `src/app/_cache/lateral.ts`
- Move: `src/app/api/chat/ranking.ts` fica onde está (já é neutro)
- Modify: todos os importadores (crons, páginas atuais e testes)
- Test: os testes existentes (`feed-cacheado.test.ts`, `temporada-cacheada.test.ts`, `cache-forma.test.ts`, `invalidacao-feed.test.ts`, `invalidacao-lateral.test.ts`) mudam só de caminho

**Interfaces:** Produces: `@/app/_cache/feed` (`lerFeedCacheado`, `TAG_FEED`, `tagDoFeed`), `@/app/_cache/lateral` (`TAG_LATERAL`, `lerLateralCacheada`), `@/app/_cache/temporada` (`temporadaParaExibirCacheada`, `taxaDaTemporadaCacheada`).

- [ ] **Step 1:** `git mv` dos arquivos e `sed` dos imports. Nenhuma linha de lógica muda.
- [ ] **Step 2:** os cinco testes acima + `src/app/api/cron` + `npm run typecheck` + `npm run boundaries` → verdes. `_cache` começa com `_`, então não vira rota (conferir na doc de *private folders* em `node_modules/next/dist/docs/`).

### Task 3: Entradas — Lista, painel e detalhe do apito, coluna lateral

**Files:**
- Copy: `features/{lista,apito,lateral}/**`, as rotas `src/app/(app)/page.tsx`, `src/app/(app)/layout.tsx` (casca), `src/app/(app)/@painel/**` (`default.tsx`, `(.)apito/[jogadorId]`), `src/app/(app)/apito/[jogadorId]/**`, `src/app/(app)/loading.tsx` se existir
- Delete: a home, o apito e a lateral antigos, com seus componentes exclusivos em `src/components`
- Modify: `features/lista/carregar.ts`, `features/apito/carregar.ts`, `features/lateral/*` → `lerFeedCacheado`, `lerLateralCacheada`, `recorteDoJogador`
- Modify: `features/lista/carregar.ts:247` e `features/resultados/carregar.ts` → tipo das faixas (`rotulo_curto` opcional)
- Test: reapontar `paywall.test.ts` (fonte: `features/lista/carregar.ts`, `features/ao-vivo/carregar.ts`); criar `src/features/lista/__tests__/fumaca.test.tsx` e `src/features/apito/__tests__/fumaca.test.tsx`

- [ ] **Step 1: fumaça da Lista (falha: a página ainda é a antiga).** Mesmo arnês de `src/app/__tests__/telas-04-lista.test.ts`, com os mocks de `auth/cookies`, `assinatura/direito`, `next/cache`, `dominio/db/cliente` e `next/navigation` e a semente `simularAte` de 21 dias. Casos:

```tsx
it('MVP vê a tabela com um apito do feed, pelo cache', async () => {
  const { default: Pagina } = await import('@/app/(app)/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  const [feed] = await banco.db.select().from(feedSnapshot).where(eq(feedSnapshot.dataReferencia, HOJE))
  const primeiro = (feed!.conteudoJson as { itens: ItemFeed[] }).itens[0]!
  expect(html).toContain(primeiro.nome)
  expect(html).not.toMatch(/probabilidade/i)
})
it('GRÁTIS não recebe nenhum jogadorId do feed no HTML', async () => {
  nivelDoTeste = 'GRATIS'
  const { default: Pagina } = await import('@/app/(app)/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  const [feed] = await banco.db.select().from(feedSnapshot).where(eq(feedSnapshot.dataReferencia, HOJE))
  for (const i of (feed!.conteudoJson as { itens: ItemFeed[] }).itens) expect(html).not.toContain(i.jogadorId)
})
it('banco sem semente: a Lista diz que não há lista, sem lançar', async () => { /* banco novo, sem simularAte */ })
```

  (`nivelDoTeste` é uma variável do módulo de teste lida pelo mock de `avaliarAcesso`, no padrão
  de `planos-home.test.ts`.)
- [ ] **Step 2: fumaça do apito:** a página e o painel `@painel/(.)apito` exigem MVP (o grátis
      recebe o redirect de `exigirNivel`); o MVP vê a linha e a confiança; `?atributo=` inválido não
      lança.
- [ ] **Step 3:** copiar os arquivos, adaptar os `carregar` para os caches da Tarefa 2 e ajustar o
      tipo das faixas.
- [ ] **Step 4:** reapontar `paywall.test.ts`: a ordem `exigirNivel('GRATIS'` → `atende(acesso.nivel, 'MVP')` → `lerFeedCacheado(` agora é conferida em `src/features/lista/carregar.ts`. Reapontar `invalidacao-feed.test.ts` para a lista nova de telas.
- [ ] **Step 5:** aposentar `telas-04-lista`, `telas-04-detalhe`, `lateral-montar`, `telas-05-classificacao` e `apito-meia-noite` **depois de ler cada um**. Invariante encontrada (ex.: "apito da meia-noite usa a rodada certa") vira caso na fumaça nova antes de o arquivo sair; registrar no ledger o que migrou.
- [ ] **Step 6:** `npx vitest run src/features/lista src/features/apito src/app/__tests__/paywall.test.ts src/app/__tests__/planos-home.test.ts src/app/api/cron` + typecheck + lint + boundaries. Abrir `/` e `/apito/<id>` no `npm run dev` e comparar com `referencias/nip-front-v2-prints/desktop/inicio.jpg` e `extras/lista-com-painel-do-apito.jpg`.

### Task 4: Ao Vivo

**Files:** Copy `features/ao-vivo/**`, `src/app/(app)/fire-live/**`, `src/app/(app)/@painel/fire-live/**`; Delete a tela antiga; Modify `features/ao-vivo/TelaAoVivo.tsx:48` (acrescentar `TEMPORADA_NAO_COMECOU` com o texto que a tela antiga usa hoje, copiado de `src/app/(app)/fire-live/page.tsx`); Test `src/features/ao-vivo/__tests__/fumaca.test.tsx`, reapontar `planos-fire-live.test.ts` e `paywall.test.ts`.

- [ ] **Step 1:** fumaça: MVP com jogo no 1º quarto vê o alvo; grátis não recebe item; com a temporada ainda sem começar aparece o texto de `TEMPORADA_NAO_COMECOU`; o componente de atualização ao vivo está montado (`data-atualiza-ao-vivo`) só quando há jogo.
- [ ] **Step 2:** o refresh do v2 precisa manter a I5: só com a aba visível e com `proximoIntervalo`. Se o v2 tiver um componente próprio, trocar pelo nosso `AtualizarAoVivo` (hoje em `src/components/AtualizarAoVivo.tsx`, que vai para `src/features/ao-vivo/AtualizarAoVivo.tsx`) com o teste de `src/components/__tests__/atualizar-ao-vivo.test.ts`.
- [ ] **Step 3:** copiar, adaptar e rodar os testes da tarefa. Aposentar `telas-04-firelive` depois de lê-lo.

### Task 5: Estatísticas

**Files:** Copy `features/estatisticas/**`, `src/app/(app)/estatisticas/**`, `@painel/estatisticas`; Modify `features/estatisticas/{jogador,jogo,time}.ts` → `exigirCookieDeSessao` antes de qualquer consulta e `temporadaParaExibirCacheada`; `src/app/(app)/estatisticas/jogador/[id]/page.tsx:11` → aceitar `ConfigTemporada | null` como a tela atual; Test fumaça + reapontar `estatisticas-url-invalida`, `planos-estatisticas`, `guarda-cookie` (fonte) e `temporada-cacheada`.

- [ ] **Step 1:** fumaça: as quatro rotas renderizam com semente; UUID inválido → 404; sem cookie → redirect antes do banco (o mock do `getDb` lança se for chamado).
- [ ] **Step 2:** copiar, adaptar, rodar. Aposentar `telas-04-estatisticas` e `telas-06-temporada-exibida` depois de lê-los; a regra "exibe a temporada retroativa quando a atual não tem jogo" vira caso na fumaça.

### Task 6: Gestão e Resultados

**Files:** Copy `features/{gestao,resultados}/**`, `src/app/(app)/{gestao,resultados}/**`, `@painel/{gestao,resultados}`, `src/app/(app)/resultados/route.ts`; Modify `features/resultados/carregar.ts:141` (faixas) e `lerFeed` → `lerFeedCacheado`, `taxaDaTemporada` → `taxaDaTemporadaCacheada`; Test fumaça + reapontar `gestao-acoes`, `gestao-acesso-real`, `gestao-ponta-a-ponta`, `gestao-cenarios-temporada`, `planos-gestao`, `resultados-url-invalida`, `telas-04-resultados` (ler e aposentar).

- [ ] **Step 1:** fumaça: Gestão MVP registra entrada (ação real), grátis vê a silhueta; "Seu mês" com 30 dias de semente renderiza em menos de 2 s no PGlite (se passar disso, registrar no ledger e propor o endpoint agregado do LEIA-ME, sem fazer); Resultados de ontem e de data inválida.
- [ ] **Step 2:** copiar, adaptar, rodar.

### Task 7: Conta, Metodologia, Como funciona, Assinar, Retorno, Abrir

**Files:** Copy `features/{conta,metodologia,assinatura,construcao}/**` e as rotas; Modify `features/conta/{acoes,carregar}.ts`, `features/metodologia/acoes.ts` → `drizzle-orm`; Test reapontar `conta-acoes`, `preferencias-acoes`, `planos-assinar`, `telas-abrir`, `telas-metodologia`, `telas-05-conta`, `telas-05-redefinir`, `paywall` (retorno sem `searchParams` como prova de pagamento).

- [ ] **Step 1:** fumaça: aceite da metodologia obrigatório (usuário sem aceite vai para `/metodologia` com o botão de aceitar; depois de aceitar, entra), e `/abrir` leva ao Ao Vivo quando há jogo e à Lista quando não há (I7).
- [ ] **Step 2:** copiar, adaptar, rodar.

### Task 8: Telas públicas

**Files:** Copy `features/publico/**` e as rotas `(publico)/{entrar,cadastrar,redefinir,redefinir/[token],oferta/[codigo],oferta-indisponivel,offline}` e `(acesso-admin)/admin/entrar`; **não** copiar `src/app/r` nem `src/app/ir` (ficam os nossos); Modify `oferta/[codigo]/page.tsx:19` → forma `{ destino, configuracao }`; Test fumaça (entrar, cadastrar e redefinir com as ações reais de sessão; oferta válida e pausada) + `ir-origem` (inalterado).

- [ ] **Step 1:** fumaça; **Step 2:** copiar, adaptar, rodar.

### Task 9: Admin e afiliados

**Files:** Copy `features/{admin,afiliados}/**`, `src/app/(app)/admin/**`, `src/app/(afiliados)/**`; Delete `src/app/(admin)/**`; Modify `src/modules/plataforma/afiliados/servico.ts` (+2 apelidos: `export type PainelDoAfiliado = Awaited<ReturnType<typeof painelDoAfiliado>>`, `export type PainelAdministrativo = Awaited<ReturnType<typeof painelAdministrativo>>`); mapeamento e mercados → `drizzle-orm`; Test reapontar `admin-trilha`, `telas-galeria` (ler e aposentar) + novo `src/features/admin/__tests__/portao.test.ts`.

- [ ] **Step 1: portão (falha se alguma página do admin não chamar a guarda):**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const paginas = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? paginas(p) : n === 'page.tsx' ? [p] : []
  })

describe('todo o admin exige ADMIN no servidor', () => {
  it('cada página do admin passa pela guarda', () => {
    for (const p of paginas('src/app/(app)/admin')) {
      const fonte = readFileSync(p, 'utf8')
      expect(fonte, p).toMatch(/exigirAdmin\(|GuardaAdmin|guarda/)
    }
  })
})
```

  Mais uma fumaça: um USUARIO em `/admin` e `/admin/usuarios` não vê a página. `/admin/afiliados/visual` continua `notFound()` em produção.
- [ ] **Step 2:** copiar, adaptar, rodar.

### Task 10: Assistente e PWA/push

**Files:** Copy `features/{assistente,pwa}/**`; Modify `features/pwa/pwa-cliente.ts` → portar de `src/components/pwa/push-cliente.ts` o `deveEnviarInscricao`, o `CHAVE_ULTIMA_INSCRICAO` e o `usuarioId` (Onda 2) e a limpeza no desativar; o botão de ativar recebe `usuarioId` da sessão; o assistente chama `/api/chat` com `content-type: application/json`, same-origin (a rota exige desde a Onda 1); Test mover `src/components/pwa/__tests__/push-cliente.test.ts` para `src/features/pwa/__tests__/` e reapontar `chat-botao` e `pwa`.

- [ ] **Step 1:** os testes movidos falham contra o `pwa-cliente.ts` do v2 (ele ainda não tem `deveEnviarInscricao`); **Step 2:** portar e rodar.

### Task 11: Telas novas — Placar e Landing (D2 e D3 decididas)

**Files:** Copy `features/landing/**`, `(publico)/{placar,conheca}`; Modify `features/landing/carregar.ts` conforme D2.

- [ ] **Placar (D3):** `conferirRodadas` de 30 dias por `unstable_cache` em `src/app/_cache/placar.ts`, com a tag `TAG_LATERAL` e `revalidate: 3600`; a rota é pública, sem `exigirNivel`.
- [ ] **Landing (D2):** hoje ela lê o feed pago de hoje e o apito ao vivo. Passa a usar a noite conferida de ontem (`conferirRodadas(1 dia)`), só com apitos que bateram e o placar, e de hoje só `totalDeApitos` (número), também por `unstable_cache` com a tag `TAG_LATERAL`. O teste garante que o HTML da landing não contém nenhum `jogadorId` do feed de hoje:

```tsx
it('a landing não entrega o feed de hoje a quem não assinou', async () => {
  const { default: Landing } = await import('@/app/(publico)/conheca/page')
  const html = renderToStaticMarkup(await Landing())
  const [feed] = await banco.db.select().from(feedSnapshot).where(eq(feedSnapshot.dataReferencia, HOJE))
  for (const i of (feed!.conteudoJson as { itens: ItemFeed[] }).itens) expect(html).not.toContain(i.jogadorId)
})
```

### Task 11b: Testes de fonte da marca e do vocabulário (I13)

**Files:** Create `src/ui/__tests__/marca-e-vocabulario.test.ts`.

- [ ] Varre `src/ui` e `src/features` (fora de `__tests__`) e falha se: (a) um `#rrggbb` aparece fora de `src/ui/tokens.css`; (b) um `font-size` menor que `12px` (ou `0.75rem`) aparece num `.module.css`; (c) a palavra "probabilidade" aparece num `.tsx`. O teste antigo de hex (`src/design-system/__tests__`) é lido e aposentado junto com a pasta na Tarefa 12.

### Task 12: Aposentar o front antigo

**Files:** Delete `src/components/**` e `src/design-system/**`, depois de `grep -rn "components/\|design-system/" src` sair vazio (fora do que as Tarefas 3–10 já moveram); Delete os testes aposentados que sobraram; Modify `.dependency-cruiser.cjs` (regras que citam essas pastas), `docs/04-design-system.md` (aponta para `src/ui/tokens.css`), `CLAUDE.md` (a seção "Onde as coisas ficam" ganha `src/ui` e `src/features`) e `src/modules/dominio/db/schema/motor.ts:49` (o comentário cita `docs/04-design-system.md`, que continua existindo).

- [ ] typecheck, lint, boundaries e a suíte em lotes.

### Task 13: E2E visual

**Files:** Create `e2e/front-v2.spec.ts` (Playwright local, fora do CI como o resto de `e2e/`).

- [ ] Para cada rota de `referencias/nip-front-v2-prints/indice.json`: abrir no `next dev` com a semente, em 1440 e 390, e salvar em `.superpowers/sdd/<plano>/prints-integrado/`. Montar um HTML lado a lado (referência × integrado) para o parceiro. A comparação é humana, porque o dado é outro. Diferença de layout que o dado não explique volta para a tarefa da área.
- [ ] Reapontar `e2e/gestao.spec.ts` e `e2e/entrar.setup.ts` para os seletores da Gestão e do login novos e rodar uma vez, local (fora do CI, como hoje).
- [ ] Testar a instalação do PWA e um push real no celular, na mesma rede (`http://<ip-do-mac>:3000`), com o runbook de push que já existe.

### Task 14: Bateria, registro e commit único

- [ ] typecheck, lint e boundaries; suíte em lotes de 12; `next build` isolado do banco.
- [ ] §9 da spec: desvios, testes aposentados e o que migrou deles, respostas de D1–D6 ou o
      que foi feito sem elas, e o que ficou para o back.
- [ ] Squash dos WIP num commit único (`git reset --soft <base>` + commit), sem `scripts/_*` e sem
      `referencias/nip-front-v2-prints` se o parceiro não quiser os 17 MB no git (perguntar no
      relatório; até lá os prints ficam fora do commit).
- [ ] Revisão final da branch (`superpowers:requesting-code-review`). Sem push e sem merge.

---

## Ordem e dependências

1 → 2 → 3 (a casca entra aqui) → 4, 5, 6, 7, 8, 9 e 10 (independentes entre si depois da 3) → 11 →
11b → 12 → 13 → 14.

## Depois deste plano

- **Spec das regras do CJ (23/09):** rebotes 8 → 7 com os parâmetros 7, 10, 3, 5, 7, 10; Lista
  Secreta só com média ≥ 4 em AST e REB fora do Fire Live; dados de matchup. Mexe no ruleset e nos
  testes-âncora, e começa por perguntar ao CJ o que cada parâmetro significa.
- **Endpoints agregados** ("Seu mês" em uma chamada; placar pronto), só se a fumaça da Tarefa 6 ou
  o cache da Tarefa 11 mostrarem que precisa.

## Desvios

Registrados na §9 da spec (desvios do v2, decisões para o parceiro, testes aposentados e o
que ficou para depois).
