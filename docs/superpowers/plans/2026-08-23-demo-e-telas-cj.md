# Demo viva + telas do documento do CJ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar vida ao app — semear demonstração a partir do documento do CJ e construir
as três telas que ele define (detalhe de linhas, aba teórica, filtros completos).

**Architecture:** o seed escreve FATOS nas tabelas de domínio e o pipeline real
(`publicarListaSecreta`, `executarCiclo`) calcula os apitos. Telas leem snapshot
materializado, nunca o motor. Todo número exibido vem do ruleset.

**Tech Stack:** Next.js 16 App Router · Drizzle/Neon · Vitest + PGlite · vite-node.

**Spec:** [`docs/superpowers/specs/2026-08-23-demo-e-telas-cj-design.md`](../specs/2026-08-23-demo-e-telas-cj-design.md)

## Global Constraints

1. **Nenhuma regra de estratégia no código** — todo número vem de `config/ruleset.v1.yaml`.
2. **Motor puro** — `src/modules/motor/**` não ganha I/O nesta rodada.
3. **Nunca inventar regra** — fora do doc do CJ + ruleset, parar e perguntar.
4. **Odds somente leitura** (ADR-0004) — a tabela estática é exibição, nada de aposta.
5. **`%` é nota de confiança, NUNCA "probabilidade"** — em código, teste e UI.
6. **Elencos do CJ** (`niveis.time_id`) para estratégia; `jogadores.time_id` só na
   aba de estatísticas.
7. Verificação de toda tarefa: `npm run typecheck && npm run lint && npm run boundaries && npm test`
   limpos em Node 24+ (`export PATH=/opt/homebrew/opt/node@26/bin:$PATH`).

---

# Etapa D · Dados do feed e filtros

### T1: `metodo` e `posicao` no ItemFeed

**Files:** Modify `src/modules/entrega/lista-secreta.ts` · Test: `src/modules/entrega/__tests__/lista-secreta.test.ts`

**Interfaces produzidas:** `ItemFeed` ganha `metodo: Metodo | null` e `posicao: string | null`.

- [ ] **Step 1 — teste que falha:** semear jogador com `posicao: 'G'`, publicar lista,
  afirmar que o item do feed traz `metodo: 'OPD'` (Luka fora) e `posicao: 'G'`;
  e que snapshot legado (JSON sem os campos) desserializa com `null` sem lançar.
- [ ] **Step 2:** rodar → FAIL (propriedades não existem).
- [ ] **Step 3:** acrescentar os dois campos ao tipo e ao `enriquecer()` — `metodo`
  vem de `a.metodo`; `posicao` do `elenco` já carregado (`j.posicao`).
- [ ] **Step 4:** testes passam · typecheck limpo.
- [ ] **Step 5:** commit `"ItemFeed carrega método e posição para os filtros da Lista Secreta"`.

### T2: `filtrarItens` e `agruparPorJogador` (puros)

**Files:** Modify `src/modules/entrega/lista-secreta.ts` · Test: idem

**Interfaces produzidas:**
```ts
export type FiltroLista = { metodo?: 'OSCILACAO'|'OPD'|'TURBO'; nivel?: Nivel; time?: string; posicao?: string }
export function filtrarItens(itens: ItemFeed[], filtro: FiltroLista): ItemFeed[]
export function agruparPorJogador(itens: ItemFeed[]): ItemFeed[]  // 1 por jogador, maior confiança
```

- [ ] **Step 1 — testes que falham:** filtro por método (turbo = `item.turbo === true`),
  por nível, por time, por posição; combinação time+nível; valor desconhecido → `[]`;
  `agruparPorJogador` devolve 1 item por jogador escolhendo a MAIOR confiança
  (empate → menor linha, para ser determinístico); item com `confianca: null` não
  quebra a ordenação.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar as duas funções puras (sem I/O, sem banco).
- [ ] **Step 4:** testes passam.
- [ ] **Step 5:** commit `"Filtros e agrupamento por jogador da Lista Secreta (funções puras)"`.

### T3: Home com chips de filtro e um card por jogador

**Files:** Modify `src/app/(app)/page.tsx`

- [ ] **Step 1:** ler filtros de `searchParams` (`metodo`,`nivel`,`time`,`posicao`,
  `quantidade`), aplicar `filtrarItens` → `agruparPorJogador` → `ordenarPorConfianca`
  → corte por quantidade.
- [ ] **Step 2:** chips construídos a partir dos itens do dia (só times/níveis que
  existem hoje), nas cores dos selos via `semantico`; chip "Todos" limpa o recorte.
- [ ] **Step 3:** card ganha link `linhas e confiança →` para `/apito/<jogadorId>`;
  o nome do jogador CONTINUA indo para as estatísticas.
- [ ] **Step 4:** estado "nada com esse filtro" (havia apitos hoje, o recorte zerou)
  distinto de "lista não publicada".
- [ ] **Step 5:** typecheck + lint + boundaries limpos · commit
  `"Home: filtros completos e um card por jogador (spec 08 / doc do CJ)"`.

---

# Etapa A · Seed de demonstração

### T4: Helpers determinísticos do seed

**Files:** Create `src/modules/ingestao/demo/dados.ts` · Test: `src/modules/ingestao/__tests__/demo.test.ts`

**Interfaces produzidas:**
```ts
export function posicaoDe(nome: string): 'G' | 'F' | 'C'
export function mediaDe(nome: string, nivel: Nivel): { ppg: number; rpg: number; apg: number }
export function historicoOscilacao(media: number, delta: number, jogosAbaixo: number): number[]
```

- [ ] **Step 1 — testes que falham:** `posicaoDe` é determinística e cobre G/F/C;
  `mediaDe('Shai Gilgeous-Alexander','MVP').ppg === 31` (número do doc) e
  `mediaDe('Jokic','MVP').rpg === 12.9`; nome desconhecido cai na faixa do nível
  (MVP 27–31, ALL_STAR 18–23, SUPORTE 11–16, RANDOLA 5–9) e é estável entre chamadas;
  `historicoOscilacao(25.7, 6, 1)` devolve o jogo mais recente ≤ 19.7 e os demais acima.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar com hash simples do nome (sem `Math.random`, senão o
  seed não é reexecutável); números nominais do doc numa tabela explícita comentada
  com a citação.
- [ ] **Step 4:** testes passam.
- [ ] **Step 5:** commit `"Helpers determinísticos da demo: posição, médias e histórico de oscilação"`.

### T5: Script `demo:seed`

**Files:** Create `scripts/demo-seed.ts`, `src/modules/ingestao/demo/semear.ts` ·
Modify `package.json` · Test: ampliar `demo.test.ts` (PGlite)

**Interfaces produzidas:** `export async function semearDemo(db: Db, ruleset: Ruleset, agora: Date): Promise<ResumoDemo>`

- [ ] **Step 1 — teste que falha (PGlite, banco vazio):** após `semearDemo`,
  afirmar: 30 times; jogadores > 200; versão de níveis `demo` ativa;
  Reaves com item de feed `opdOrigemNivel === 3` e Grimes 2 e Kessler 1;
  LeBron com apito de oscilação nível 1; Curry com `turbo === true`;
  snapshot FIRE_LIVE do jogo ao vivo contendo Shai com `modoFire === true`;
  um green de marco 20 gravado; e **reexecutar `semearDemo` não duplica nada**
  (contagens idênticas).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3 — implementar em cinco atos:**
  1. elencos: `lerListaDeNiveis(readFile('data/fontes/introducao-ia-nba.md'))` →
     upsert `times` (sigla via `siglaDoTime`), `jogadores` (com `posicaoDe`),
     `niveis_versao` 'demo' ativa + `niveis`;
  2. médias: `temporadaDe(agora, ruleset.temporada)` + `mediaDe` → upsert `medias_jogador`;
  3. histórico: 6 jogos passados por time da rodada + `estatisticas_jogo` moldados
     por `historicoOscilacao` (LeBron nível 1, um All-Star nível 2, Curry nível 3);
  4. rodada de hoje: LAL×PHI (Luka `FORA` em `lesoes_escalacao`), OKC×DEN `AO_VIVO`
     `quartoAtual = ruleset.fire_live.quarto` com `estatisticas_quarto` do Shai,
     GSW×BOS e MIA×NYK `AGENDADO`;
  5. motor: `publicarListaSecreta(db, ruleset, {dataReferencia, agora, ignorarAntecedencia:true})`
     e `executarCiclo(db, ruleset, new FilaEmMemoria(), {...})` para o jogo ao vivo.
- [ ] **Step 4:** teste passa · `npm run boundaries` limpo (demo vive em ingestão, não no motor).
- [ ] **Step 5:** `scripts/demo-seed.ts` no padrão do bootstrap (`getDb`, `fecharDb`,
  imprime o resumo) + script npm `"demo:seed"` · commit
  `"Seed de demonstração: fatos do documento do CJ, apitos calculados pelo motor real"`.

### T6: Script `demo:limpar`

**Files:** Create `scripts/demo-limpar.ts` · Modify `package.json` · Test: ampliar `demo.test.ts`

- [ ] **Step 1 — teste que falha:** após semear e limpar, tabelas de domínio vazias
  E `usuarios`/`direitos_acesso` intactos (semear um usuário antes e conferir depois).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** `limparDemo(db)` apagando na ordem inversa das FKs; script exige
  `--confirmar` (sem a flag, imprime o que APAGARIA e sai com código 1).
- [ ] **Step 4:** teste passa.
- [ ] **Step 5:** commit `"demo:limpar — desfaz a demonstração sem tocar em contas ou assinaturas"`.

---

# Etapa B · Detalhe do apito

### T7: `linhasDoJogador` + rota `/apito/[jogadorId]`

**Files:** Modify `src/modules/entrega/lista-secreta.ts` · Create `src/app/(app)/apito/[jogadorId]/page.tsx` · Test: `lista-secreta.test.ts`

**Interfaces produzidas:**
```ts
export type LinhasDoJogador = { itens: ItemFeed[]; geradoEm: Date | null }
export async function linhasDoJogador(db: Db, dataReferencia: string, jogadorId: string): Promise<LinhasDoJogador>
```

- [ ] **Step 1 — testes que falham:** jogador com 4 linhas devolve 4 itens ordenados
  por linha crescente; jogador sem apito devolve `itens: []`; dia sem feed devolve
  `geradoEm: null`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar leitura do snapshot LISTA_SECRETA + filtro por jogador.
- [ ] **Step 4:** página: guarda igual à home (sessão + `avaliarAcesso`); `CardEntrada`
  no topo; grade de chips `"<linha> PTS · <confianca>%"` com faixa
  `ruleset.odds.tabela_estatica[nivel][linha]` rotulada "tabela de referência";
  rodapé P12 literal + `UltimaAtualizacao`; estado vazio explicado.
- [ ] **Step 5:** typecheck + lint + boundaries · commit
  `"Detalhe do apito: as linhas e percentuais que o documento do CJ especifica"`.

---

# Etapa C · Aba teórica

### T8: View-model da teoria (derivado do ruleset)

**Files:** Create `src/modules/entrega/teoria/conteudo.ts` · Test: `src/modules/entrega/__tests__/teoria.test.ts`

**Interfaces produzidas:** `export function montarTeoria(ruleset: Ruleset): Teoria`

- [ ] **Step 1 — teste que falha:** cada campo de `Teoria` bate com o ruleset REAL
  (deltas por nível, exceção `luka-doncic: 7`, `nivel_minimo_apito`, mapa OPD,
  turbos, confiança base+bônus, tabela estática de odds, multiplicadores/travas
  do Fire Live, `percentual_media` 0.75, `times_isentos`, `marcos_green`, blowout
  4Q/25/TITULARES, matchup 20 dias); e **trocar `delta.MVP` para 8 no ruleset
  muda a saída** (prova a regra 1); nenhum campo contém a palavra "probabilidade".
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar a montagem — puro mapeamento, zero literal numérico.
- [ ] **Step 4:** testes passam.
- [ ] **Step 5:** commit `"View-model da aba teórica: todo número sai do ruleset"`.

### T9: Página `/como-funciona`

**Files:** Create `src/app/(app)/como-funciona/page.tsx` · Modify home e `/fire-live` (link) · Test: ampliar `teoria.test.ts`

- [ ] **Step 1 — teste que falha:** a fonte da página contém `sessaoAtual` e NÃO
  contém `avaliarAcesso` (vitrine para logado sem assinatura); contém `montarTeoria`;
  não contém a string "probabilidade"; contém o box do blowout.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** escrever a página nas seções da spec, ilustrada com `Selo`, `Anel`
  e `CardEntrada` reais; prosa adaptada do doc (sem instruções internas); box do
  aviso de blowout com os números do ruleset; nota do matchup.
- [ ] **Step 4:** links "Como funciona →" na home e no Fire Live.
- [ ] **Step 5:** typecheck + lint + boundaries + suíte completa · commit
  `"Aba teórica: a metodologia do CJ explicada, com o aviso de blowout no lugar que o doc define (G7)"`.

---

# Etapa final · Publicar a demo

### T10: Semear produção e verificar

- [ ] `npx dotenv -e .env.local -- npm run demo:seed` (Neon) — conferir o resumo impresso.
- [ ] `npm run deploy:prod`; aguardar `READY` pela API.
- [ ] Smoke: `/` com cards e chips · `/apito/<id>` com as linhas · `/como-funciona`
  com as cores e o box do blowout · `/fire-live` com o jogo ao vivo · `/estatisticas`
  com médias e histórico.
- [ ] Atualizar `docs/specs/README.md` (situação) e commitar.

## Riscos vigiados

- **Seed não reexecutável** → tudo por upsert; T5 afirma contagens idênticas na 2ª execução.
- **Média de temporada errada** → `temporadaDe(agora)`, a mesma que `montarFatos` consulta.
- **Demo confundida com dado real** → a versão de níveis chama-se `demo`; `demo:limpar` desfaz.
- **Número mágico na teórica** → T8 compara campo a campo com o ruleset.
