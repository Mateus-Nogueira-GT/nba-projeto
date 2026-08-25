# Odds reais pluggáveis + média entre casas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Casas de aposta reais pluggáveis (balldontlie player props, 8 vendors) alimentando `odds_agregada` com a MÉDIA entre casas, que desagua no slot `ODD MÉDIA` do card da identidade 03.

**Architecture:** Adapter na porta `CasaDeAposta` existente (um por vendor), com todas as traduções na fronteira (americana→decimal, meio-ponto→linha do CJ, prop_type→atributo). Job de coleta+agregação novo — hoje NADA escreve odds fora do seed. Vínculo por id externo do provedor (mesma ingestão NBA), com curadoria por nome como fallback.

**Tech Stack:** fixtures com o shape literal do OpenAPI oficial · PGlite nos testes · migração drizzle com down.

**Spec:** `docs/superpowers/specs/2026-08-25-odds-reais-e-media-design.md`

## Global Constraints

- **ADR-0004 intacto:** leitura de cotação pública, e só. Nenhuma credencial de usuário, nenhum envio.
- Nenhum campo com nome de provedor atravessa a porta (anticorrupção L0).
- Motor puro intocado — média é agregação de INGESTÃO, exibição é ENTREGA.
- Branch `odds-reais-media` (empilhada na identidade 03). TDD, commits frequentes.
- Odds do provedor são AMERICANAS (inteiro); depois da porta, SEMPRE decimais com 2 casas.
- Descarte nunca é silencioso: milestone/compostos/não-mapeados viram contagem no retorno do job.

---

### Task 1: Conversões puras da fronteira

**Files:**
- Create: `src/modules/ingestao/odds/conversao.ts`
- Test: `src/modules/ingestao/__tests__/odds-conversao.test.ts`

**Interfaces (Produces):**
- `americanaParaDecimal(americana: number): number` — 2 casas; lança em 0/NaN.
- `linhaDoLadoOver(lineValue: string): number | null` — `"24.5"→25`, `"25.5"→26`, `"25"→null` (linha inteira em over é mercado exato do provedor, não equivale a "N+"; não atravessa — registrado na spec §3).
- `atributoDoPropType(propType: string): Atributo | null` — points/rebounds/assists; resto null.

- [ ] **Step 1: teste falhando** — quadrantes `−110→1.91`, `+150→2.5`, `−200→1.5`, `+100→2`; meio-ponto `24.5→25`; inteira `25→null`; `points→PONTOS`, `points_1q→null` (1Q não é mercado da Lista Secreta), `double_double→null`.
- [ ] **Step 2/3: red → implementar** (funções puras, sem I/O).
- [ ] **Step 4/5: verde → commit** `"Conversões da fronteira de odds: americana→decimal, over meio-ponto→linha, prop→atributo"`.

### Task 2: Adapter balldontlie player props (fake com forma exata)

**Files:**
- Create: `src/modules/ingestao/odds/balldontlie-props.ts`
- Create: `src/modules/ingestao/odds/__fixtures__/balldontlie-player-props.json` (shape LITERAL do OpenAPI: 3 vendors × points/rebounds + 1 milestone + 1 composto + 1 player sem mapa)
- Modify: `src/modules/ingestao/odds/porta.ts` (`CotacaoExterna` ganha `jogadorIdExternoProvedor?: string` e `atributo?: Atributo`)
- Test: `src/modules/ingestao/__tests__/odds-balldontlie.test.ts`

**Interfaces (Produces):**
- `casasBalldontlie(buscarProps: (gameIdExterno: string) => Promise<unknown>): CasaDeAposta[]` — fatia a resposta por vendor; cada casa se chama `balldontlie:{vendor}`; `cotacoes()` traduz para `CotacaoExterna` já em decimal/linha-inteira/atributo, descartando milestone, compostos e linhas inteiras (contagem exposta em `descartadas()` por casa para o job logar).
- `buscarPropsHttp(chave: string): (gameIdExterno) => Promise<unknown>` — GET `/v2/odds/player_props?game_id=`, header `Authorization` (o mesmo `http.ts` de retry/timeout da NBA se aplicável) — **não exercitado em teste de rede**; o fake é a fixture.

- [ ] **Step 1: teste falhando** — da fixture: N casas = N vendors; cotação com `linha=25, oddOver=1.91` a partir de `"24.5"/−110`; `jogadorIdExternoProvedor` preenchido; milestone+composto+inteira descartados e contados.
- [ ] **Step 2/3: red → implementar. Step 4/5: verde → commit** `"Casas do balldontlie: 8 vendors por uma chamada, tradução inteira na fronteira"`.

### Task 3: `odd_media` + job de coleta e agregação (o que nunca existiu)

**Files:**
- Modify: `src/modules/dominio/db/schema/odds.ts` (`oddMedia: numeric('odd_media', {precision: 7, scale: 3})`)
- Migration: `npm run db:generate`
- Create: `src/modules/ingestao/odds/coletar.ts`
- Test: `src/modules/ingestao/__tests__/odds-coletar.test.ts`

**Interfaces (Produces):**
- `agregarCotacoes(cotacoes: {oddOver: number|null}[]): {min,max,media,mediana,qtd}` — pura; média simples 3 casas decimais.
- `coletarOdds(db, casas: CasaDeAposta[], dataReferencia: string, agora: Date): Promise<{cotacoes: number, agregadas: number, descartadas: number, semVinculo: number}>` — para cada jogo do dia com identidade externa do provedor: consulta casas, grava `odds_snapshot` (por casa) e `odds_agregada` (upsert na UNIQUE existente) com min/max/mediana/**media**; vínculo de jogador por `identidades_jogador` (provedor+idExterno) quando `jogadorIdExternoProvedor` vier, senão pelo mapa por nome já existente; sem vínculo → conta e pula.

- [ ] **Step 1: teste falhando (PGlite)** — semeia jogo+identidade externa+2 jogadores mapeados; fixture com 3 casas; após `coletarOdds`: `odds_agregada` tem `odd_media` = média das decimais, `qtd_casas=3`; jogador sem mapa contado em `semVinculo`; reexecutar não duplica (upsert).
- [ ] **Step 2/3: red → migração + implementar. Step 4/5: verde (censo de tabelas não muda — é coluna) → commit** `"coletarOdds: a coleta e a média que nunca existiram fora do seed"`.

### Task 4: A média chega ao card e ao detalhe

**Files:**
- Modify: `src/modules/entrega/lista-secreta.ts` (enriquecer lê `oddMedia` → `oddFaixa.media`)
- Modify: `src/app/(app)/apito/[jogadorId]/page.tsx` (linhas mostram "odd média X · entre A e B")
- Modify: `src/modules/entrega/__tests__/lista-secreta.test.ts` + `telas-demo` (demo seed ganha `oddMedia` nas agregadas)
- Modify: `src/modules/ingestao/demo/semear.ts` (agregadas da demo ganham média coerente)

- [ ] **Step 1: teste falhando** — no describe do contexto materializado: semear agregada com `oddMedia` para a linha do item → `item.oddFaixa.media` presente; render da lista contém `ODD MÉDIA`.
- [ ] **Step 2/3: red → implementar (enriquecer + demo + detalhe). Step 4/5: verde → commit** `"ODD MÉDIA no ar: o slot da identidade 03 recebe o número"`.

### Task 5: Registro e fumaça

**Files:**
- Modify: `docs/demonstracao.md` (odds da demo agora têm média; de onde viria a real)
- Modify: `docs/specs/README.md` se surgir pergunta nova (não deve)
- [ ] Fumaça completa (tsc · lint · boundaries · suíte · build) → commit final → push + PR empilhado.

## Self-review (na escrita)

- Spec §traduções→T1/T2 · §média→T3/T4 · §fake-forma-exata→T2 · §pré-voo→spec/docs (sem código) · fora-de-escopo respeitado (nenhum adapter API-Sports, nenhum push/fire-live).
- Tipos: `CotacaoExterna.jogadorIdExternoProvedor?` consumido em T3; `oddFaixa.media` já existe na identidade 03; `agregarCotacoes` alimenta o upsert de T3.
- Sem placeholder: cada task tem o dado da fixture e a asserção nomeada.
