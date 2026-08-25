# Identidade 03 "Broadcast" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformar o visual inteiro do app para a linguagem "Broadcast" aprovada em mockup e fechar os gaps de UX da proposta comercial (barrinhas no card, exclusão de jogadores no Fire Live, 2P/lances livres, boxscore do time).

**Architecture:** Reforma NO LUGAR — a camada de valores dos tokens muda, os componentes são reescritos nos mesmos arquivos, telas migram uma a uma. Três campos novos materializados no feed (`ultimos5`, `mediaTemporada`, `oddFaixa`) alimentam o card sem a tela tocar o motor. Uma tabela nova (`jogadores_ocultos`) e uma migração de colunas (`ll_c`/`ll_t`).

**Tech Stack:** Next.js App Router · Drizzle/Postgres (PGlite nos testes) · vitest + renderToStaticMarkup · tokens 3 camadas com gerador CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-identidade-03-broadcast-design.md` — o plano argumenta a partir dela; o executor lê os dois. Referência visual: `.superpowers/brainstorm/11292-1787622719/content/linguagem-b.html` (aprovada) e `direcao-visual.html` (opção B).

## Global Constraints

- **Onde o mockup e a regra do CJ divergem, o CJ vence.** Forma do mockup, conteúdo do ruleset.
- **Tela não chama o motor** (`tela-nao-chama-o-motor` no dependency-cruiser) — todo dado derivado nasce na materialização.
- **Nunca** a palavra "probabilidade" na UI. O % é nota de confiança.
- Fire Live é **só 1º quarto**. Só existe classificação de PONTOS (modelo já é por atributo).
- Nenhum número mágico de estratégia no código — mas valores VISUAIS (cores, px) moram nos tokens, que são código de design, não regra.
- As 4 cores categóricas do apito (🟡🟠🟢🔵) são exclusivas do anel/badge do avatar. Confiança é mono-matiz turquesa. Brilho de confiança só no grau 5.
- Domínio em português; `nivelJogador` ≠ `nivelApito`, nunca `nivel` sozinho.
- O hash do feed cobre o item inteiro (commit `ef62423`) — campo novo em `ItemFeed` conta como mudança sozinho.
- **Aprovação visual delegada (25/08):** antes de codar cada tela, conferir o resultado contra `linguagem-b.html` — mesma anatomia, mesmos tokens, mesma temperatura. Mockups/HTML de conferência ficam em `.superpowers/brainstorm/` para auditoria do parceiro.
- Branch de trabalho: `identidade-03-broadcast`. Commits frequentes, mensagem em português contando o porquê.
- Fuso/format: manter helpers existentes (`horaCurta`, `arredondar`); nada de `new Date()` em módulo puro.

---

### Task 1: Tokens da identidade 03

**Files:**
- Modify: `src/design-system/tokens/primitivo.ts`
- Modify: `src/design-system/tokens/semantico.ts`
- Modify: `src/design-system/tokens/componente.ts`
- Modify: `src/design-system/__tests__/tokens.test.ts`
- Regenerate: `src/design-system/tokens/tokens.css` (via `npm run tokens`)

**Interfaces:**
- Consumes: paleta existente (`primitivo`, rampa `confianca100..500`, categóricas do apito).
- Produces (nomes exatos que as tasks seguintes usam):
  - `semantico.fundoTelaGradiente: string` — `linear-gradient(175deg, #0B1220 60%, #101A2E)`
  - `semantico.contextoFrio = { cardGradiente, faixaFundo }` e `semantico.contextoQuente = { cardGradiente, faixaFundo, destaque, borda }`
  - `semantico.turbo = { cor: '#4DA3FF', brilho: '0 0 22px rgba(77,163,255,.18)' }`
  - `semantico.vivoSelo = '#E03E3E'`
  - `componente.barrinhaBateu = '#3DD37E'`, `componente.barrinhaFalhou = '#E05555'`
  - `componente.cardBordaLateralPx = 3`

- [ ] **Step 1: Teste falhando — tokens novos e regras**

Acrescentar em `src/design-system/__tests__/tokens.test.ts`:

```ts
describe('identidade 03 — broadcast', () => {
  it('temperatura por contexto: frio e quente não compartilham gradiente', () => {
    expect(semantico.contextoFrio.cardGradiente).not.toBe(semantico.contextoQuente.cardGradiente)
    // O universo quente usa o laranja fire; o frio, nunca.
    expect(semantico.contextoQuente.destaque).toBe('#FF7A1A')
    expect(JSON.stringify(semantico.contextoFrio)).not.toContain('#FF7A1A')
  })

  it('turbo azul não colide com nenhuma cor categórica do apito nem com a rampa', () => {
    const categoricas = Object.values(semantico.apito)
    expect(categoricas).not.toContain(semantico.turbo.cor)
    const rampa = Object.values(semantico.confianca)
    expect(rampa).not.toContain(semantico.turbo.cor)
  })

  it('barrinhas usam o par verde/vermelho próprio, fora das categóricas', () => {
    const categoricas = Object.values(semantico.apito)
    expect(categoricas).not.toContain(componente.barrinhaBateu)
    expect(categoricas).not.toContain(componente.barrinhaFalhou)
  })
})
```

(Adapte o acesso `semantico.apito`/`semantico.confianca` ao shape real do arquivo —
o teste de colisão existente mostra como as categóricas e a rampa são lidas hoje;
reuse o mesmo acesso.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/design-system/__tests__/tokens.test.ts` → FAIL (tokens não existem).
- [ ] **Step 3: Implementar os tokens**

Em `primitivo.ts`, acrescentar os hex novos com nomes primitivos (`azulTurbo: '#4DA3FF'`, `vermelhoVivo: '#E03E3E'`, `verdeBarrinha: '#3DD37E'`, `vermelhoBarrinha: '#E05555'`, `roxo700: '#241A2E'`, `roxo800: '#161226'`, `marinho650: '#16213A'`, `marinho750: '#111A2E'`, `marinho850: '#101A2E'`). Em `semantico.ts`:

```ts
  // -- Identidade 03 · broadcast ----------------------------------------
  fundoTelaGradiente: `linear-gradient(175deg, ${p.tinta800} 60%, ${p.marinho850})`,
  contextoFrio: {
    cardGradiente: `linear-gradient(135deg, ${p.marinho650}, ${p.marinho750} 55%)`,
    faixaFundo: 'rgba(92,224,206,.07)',
  },
  contextoQuente: {
    cardGradiente: `linear-gradient(135deg, ${p.roxo700}, ${p.roxo800} 55%)`,
    faixaFundo: 'rgba(255,122,26,.08)',
    destaque: p.laranja500, // #FF7A1A já primitivo
    borda: '#3A2A52',
  },
  turbo: { cor: p.azulTurbo, brilho: '0 0 22px rgba(77,163,255,.18)' },
  vivoSelo: p.vermelhoVivo,
```

Em `componente.ts`: `barrinhaBateu`, `barrinhaFalhou`, `cardBordaLateralPx: 3`, e o
que a reforma do card pedir (ex.: `cardRaio: 14`). Rodar `npm run tokens` para
regenerar o CSS (o teste de paridade TS↔CSS existente cobre).

- [ ] **Step 4: Rodar e ver passar** — o arquivo inteiro de tokens, inclusive colisão e paridade.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Tokens da identidade 03: gradientes, turbo azul, universo quente e temperatura por contexto"`

---

### Task 2: `Barrinhas` — o histórico com valor (substitui `Historico`)

**Files:**
- Create: `src/design-system/componentes/Barrinhas.tsx`
- Delete: `src/design-system/componentes/Historico.tsx` (após migrar call sites)
- Modify: `src/design-system/componentes/index.ts`
- Test: `src/design-system/__tests__/barrinhas.test.ts`

**Interfaces:**
- Produces: `Barrinhas({ jogos, rotulo }: { jogos: { valor: number; bateu: boolean }[]; rotulo?: string })` — quadrados 18px com o VALOR dentro, verde `componente.barrinhaBateu` / vermelho `componente.barrinhaFalhou`, mais recente primeiro; `role="img"` com aria-label contando acertos. Com `rotulo`, imprime o rótulo em Barlow Condensed 10px antes dos quadrados (o card usa `rotulo="ÚLT. 5 NA LINHA"`).

- [ ] **Step 1: Teste falhando**

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Barrinhas } from '../componentes/Barrinhas'
import { componente } from '../tokens/componente'

describe('Barrinhas', () => {
  const jogos = [
    { valor: 30, bateu: true },
    { valor: 20, bateu: false },
  ]

  it('mostra o valor de cada jogo com a cor de bateu/falhou', () => {
    const html = renderToStaticMarkup(createElement(Barrinhas, { jogos }))
    expect(html).toContain('>30<')
    expect(html).toContain('>20<')
    expect(html).toContain(componente.barrinhaBateu)
    expect(html).toContain(componente.barrinhaFalhou)
  })

  it('conta os acertos no aria-label e aceita rótulo', () => {
    const html = renderToStaticMarkup(createElement(Barrinhas, { jogos, rotulo: 'ÚLT. 5 NA LINHA' }))
    expect(html).toContain('bateu a linha em 1')
    expect(html).toContain('ÚLT. 5 NA LINHA')
  })

  it('lista vazia rende vazio, não erro', () => {
    expect(renderToStaticMarkup(createElement(Barrinhas, { jogos: [] }))).not.toContain('undefined')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** — quadrado `width/height 18, borderRadius 5`, valor em Barlow Condensed 10px peso 800, texto `textoSobreCor` no verde e `#fff` no vermelho (conferir contraste AA; o teste de contraste dos tokens cobre o par). Exportar no `index.ts`.
- [ ] **Step 4: Migrar call sites de `Historico`** — `grep -rn "Historico" src/` e trocar cada uso por `Barrinhas` (quem só tem booleanos passa `{ valor: 0, bateu }`? NÃO — quem chama tem os blocos do detalhe com valor; usar o valor real. Se algum call site não tiver valor, é a tela antiga: ela será reformada nas tasks 6–12; nesse caso trocar já pelos dados reais disponíveis na tela). Apagar `Historico.tsx` quando o grep zerar.
- [ ] **Step 5: Suíte do design-system verde + commit** — `git commit -m "Barrinhas: o histórico ganha valor e cor — Historico sai"`

---

### Task 3: `PlacarMini`, `BarraAlvo` e `ChipFiltro` no design system

**Files:**
- Create: `src/design-system/componentes/PlacarMini.tsx`
- Create: `src/design-system/componentes/BarraAlvo.tsx`
- Create: `src/design-system/componentes/ChipFiltro.tsx`
- Modify: `src/design-system/componentes/index.ts`
- Modify: `src/app/(app)/fire-live/page.tsx` (remover o `PlacarMini` inline, importar o novo)
- Test: `src/design-system/__tests__/ao-vivo.test.ts`

**Interfaces:**
- Produces:
  - `PlacarMini({ casaSigla, foraSigla, casaPontos, foraPontos, relogio }: { casaSigla: string; foraSigla: string; casaPontos: number; foraPontos: number; relogio: string })` — `LAL · 23 · 19 · DEN` com `1Q · {relogio}` em `vivoSelo`. **Sempre rotula 1Q** (Fire Live é só 1º quarto — o componente nem aceita outro).
  - `BarraAlvo({ observado, alvo }: { observado: number; alvo: number })` — barra 7px, preenchimento `linear-gradient(90deg, #FF7A1A, #FFB25E)` com brilho, marca vertical no fim, contagem `observado / alvo`; `observado >= alvo` → 100% (nunca estoura).
  - `ChipFiltro({ ativo, children, href }: { ativo: boolean; children: ReactNode; href: string })` — pílula: ativo = fundo laranja/texto escuro; inativo = contorno `#2A3852`/texto `textoSecundario`.

- [ ] **Step 1: Teste falhando**

```ts
describe('PlacarMini', () => {
  it('mostra siglas, pontos e o relógio sempre no 1Q', () => {
    const html = renderToStaticMarkup(
      createElement(PlacarMini, { casaSigla: 'LAL', foraSigla: 'DEN', casaPontos: 23, foraPontos: 19, relogio: '4:12' }),
    )
    expect(html).toContain('LAL')
    expect(html).toContain('1Q · 4:12')
    expect(html).toContain(semantico.vivoSelo)
  })
})

describe('BarraAlvo', () => {
  it('proporção correta e trava em 100%', () => {
    expect(renderToStaticMarkup(createElement(BarraAlvo, { observado: 9, alvo: 10 }))).toContain('width:90%')
    expect(renderToStaticMarkup(createElement(BarraAlvo, { observado: 12, alvo: 10 }))).toContain('width:100%')
  })
  it('mostra a contagem observado / alvo', () => {
    expect(renderToStaticMarkup(createElement(BarraAlvo, { observado: 9, alvo: 10 }))).toContain('9 / 10')
  })
})

describe('ChipFiltro', () => {
  it('ativo preenche de laranja; inativo é contorno', () => {
    const ativo = renderToStaticMarkup(createElement(ChipFiltro, { ativo: true, href: '/x' }, 'TURBO'))
    const inativo = renderToStaticMarkup(createElement(ChipFiltro, { ativo: false, href: '/x' }, 'OPD'))
    expect(ativo).toContain('background')
    expect(inativo).toContain('border')
  })
})
```

- [ ] **Step 2: Ver falhar. Step 3: Implementar** (medidas e cores do mockup, tokens da Task 1; nada hardcoded que já exista como token). **Step 4: Trocar o PlacarMini inline do fire-live** pelo novo componente (a tela ainda está no visual velho — só o import muda; a reforma da tela é a Task 8). **Step 5: Suíte + commit** — `"PlacarMini, BarraAlvo e ChipFiltro entram no design system"`

---

### Task 4: Feed carrega `ultimos5`, `mediaTemporada` e `oddFaixa`

**Files:**
- Modify: `src/modules/entrega/detalhe-apito.ts` (extrair a função compartilhada)
- Create: `src/modules/entrega/historico-na-linha.ts`
- Modify: `src/modules/entrega/lista-secreta.ts` (`ItemFeed` + `enriquecer`)
- Modify: `src/modules/entrega/fire-live/feed.ts` (itens ganham os campos como `null`)
- Test: `src/modules/entrega/__tests__/lista-secreta.test.ts` (describe novo)

**Interfaces:**
- Consumes: `detalheDoApito` hoje monta `blocos: BlocoJogo[] = { adversarioSigla, valor, bateu }` e `mediaTemporada` internamente; `odds_agregada` tem `oddMin/oddMax/qtdCasas` por `(jogoId, jogadorId, atributo, linha)`.
- Produces:
  - `historicoNaLinha(db, jogadorId, atributo, linhaOuAlvo, dataCorte, limite = 5): Promise<{ valor: number; bateu: boolean }[]>` em `historico-na-linha.ts` — **a mesma função** que o detalhe passa a usar (as duas telas nunca discordam).
  - `ItemFeed` ganha: `ultimos5: { valor: number; bateu: boolean }[]` · `mediaTemporada: number | null` · `oddFaixa: { min: number; max: number; qtdCasas: number } | null`.
  - Fire Live: `ItemFireLive` herda os campos; a materialização do fire preenche com `[]`/`null` (o card quente usa BarraAlvo, não barrinhas — spec §2).

- [ ] **Step 1: Teste falhando** (no `lista-secreta.test.ts`, novo describe — o harness `semear()` já cria médias e stats):

```ts
describe('o card carrega contexto materializado', () => {
  beforeEach(async () => {
    await escalar('Luka Doncic', 'FORA')
    await publicarListaSecreta(banco.db, ruleset, { dataReferencia: HOJE, agora: UMA_HORA_ANTES })
  })

  it('ultimos5 vem do MESMO cálculo do detalhe — as telas não discordam', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const item = feed!.conteudo.itens[0]!
    expect(item.ultimos5.length).toBeGreaterThan(0)
    const detalhe = await detalheDoApito(banco.db, ruleset, item)
    expect(item.ultimos5).toEqual(
      detalhe.blocos.map((b) => ({ valor: b.valor, bateu: b.bateu })),
    )
  })

  it('mediaTemporada igual à do detalhe; oddFaixa null sem coleta', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const item = feed!.conteudo.itens[0]!
    const detalhe = await detalheDoApito(banco.db, ruleset, item)
    expect(item.mediaTemporada).toBe(detalhe.mediaTemporada)
    expect(item.oddFaixa).toBeNull() // o semear não coleta odds
  })
})
```

- [ ] **Step 2: Ver falhar (campos não existem).**
- [ ] **Step 3: Implementar.** Extrair de `detalheDoApito` o trecho que monta os blocos (consulta `estatisticas_jogo` recortada pela data do jogo, compara com `linhaOuAlvo`) para `historicoNaLinha`; `detalheDoApito` chama a nova função e acrescenta `adversarioSigla` (que é dele). Em `enriquecer`: buscar em lote `medias_jogador` e `odds_agregada` dos apitos (2 queries com `inArray`, mapas por jogador — o padrão das buscas existentes na função) e, por apito, `historicoNaLinha` com a linha principal. Atenção: `enriquecer` roda por publicação, não por request — o custo é da materialização, como manda a spec.
- [ ] **Step 4: Ver passar. Rodar a suíte inteira de entrega** (o hash muda de forma — testes de republicação continuam passando porque o hash cobre o item inteiro).
- [ ] **Step 5: Commit** — `"ultimos5, mediaTemporada e oddFaixa viajam no feed — o card não chama o motor"`

---

### Task 5: `CardEntrada` reescrito — as 3 zonas da linguagem B

**Files:**
- Modify: `src/design-system/componentes/CardEntrada.tsx`
- Modify: `src/design-system/__tests__/card.test.ts`
- Modify: `src/app/(admin)/admin/galeria/page.tsx` (demonstra os estados novos)

**Interfaces:**
- Consumes: tokens da Task 1, `Barrinhas` (T2), `BarraAlvo` (T3), `Avatar`/`Pilula` existentes.
- Produces — `CardEntradaProps` ganha (mantendo as existentes):
  - `ultimos5?: { valor: number; bateu: boolean }[]` — zona 2 fria
  - `mediaTemporada?: number | null`
  - `oddFaixa?: { min: number; max: number; qtdCasas: number; media?: number } | null` — com `media`, o rodapé escreve `ODD MÉDIA {media}`; sem, `ODD {min}–{max}`; `null` omite odd
  - `progresso1Q` (existente) — com ele presente E `modoFire`/contexto quente, a zona 2 vira `BarraAlvo`
  - `linha?: number | null` e `horario?: string | null` para o rodapé/apoio
- Anatomia: borda lateral esquerda `3px` na cor do grau (`CONFIANCA_GRAU[grau]`), gradiente do contexto (frio por padrão; quente quando `modoFire`), % em Anton 30px com brilho na cor do grau (turbo → `semantico.turbo`), rodapé com `faixaFundo` do contexto.

- [ ] **Step 1: Testes falhando** (substituem os atuais de aparência, mantêm os de contrato):

```ts
describe('CardEntrada — identidade 03', () => {
  it('zona 2 fria mostra as barrinhas com valor', () => {
    const html = render({ ...base, ultimos5: [{ valor: 30, bateu: true }, { valor: 20, bateu: false }] })
    expect(html).toContain('ÚLT. 5 NA LINHA')
    expect(html).toContain('>30<')
  })

  it('no modo fire a zona 2 é a barra rumo ao alvo, não as barrinhas', () => {
    const html = render({ ...base, modoFire: true, progresso1Q: { observado: 9, alvo: 10 },
      ultimos5: [{ valor: 30, bateu: true }] })
    expect(html).toContain('9 / 10')
    expect(html).not.toContain('ÚLT. 5 NA LINHA')
  })

  it('rodapé: faixa sem média, média quando existir, nada quando null', () => {
    expect(render({ ...base, linha: 25, oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3 } }))
      .toContain('ODD 1,47–1,62')
    expect(render({ ...base, linha: 25, oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3, media: 1.55 } }))
      .toContain('ODD MÉDIA 1,55')
    expect(render({ ...base, linha: 25, oddFaixa: null })).not.toContain('ODD')
  })

  it('borda lateral na cor do grau; brilho de card só para turbo e fire', () => {
    expect(render({ ...base, grauConfianca: 3 })).toContain('border-left:3px solid')
    expect(render({ ...base, turbo: true })).toContain('box-shadow')
    expect(render({ ...base, turbo: false, modoFire: false })).not.toContain('box-shadow')
  })
})
```

(`render` = helper do arquivo atual; `base` = props mínimas já usadas lá. Manter o
teste existente que varre props obrigatórias renderizadas — atualizado para as novas.)

- [ ] **Step 2: Ver falhar. Step 3: Reescrever o componente** seguindo o mockup zona a zona; números em `pt-BR` (vírgula) via helper existente da tela. **Step 4: Galeria** ganha os estados: frio com barrinhas, turbo, fire com barra, rodapé nas 3 variantes. **Step 5: Suíte + commit** — `"CardEntrada na linguagem broadcast: 3 zonas, borda do grau, rodapé com odd"`

---

### Task 6: Tela Lista Secreta reformada

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/__tests__/telas-demo.test.ts` (asserções da tela)
- Create (conferência visual): `.superpowers/brainstorm/11292-1787622719/content/conferencia-lista.html`

**Interfaces:**
- Consumes: `CardEntrada` novo (T5), `ChipFiltro` (T3), campos do feed (T4), `Moldura`/`CabecalhoTela` existentes.

- [ ] **Step 1 (gate visual delegado):** montar `conferencia-lista.html` com o HTML REAL da tela renderizada (renderToStaticMarkup no ambiente de demo) lado a lado com o mockup aprovado; conferir: gradiente de fundo, chips, anatomia do card, temperatura fria. Registrar 1 linha no commit sobre a conferência.
- [ ] **Step 2: Teste falhando** — a tela imprime barrinhas e rodapé:

```ts
it('a lista imprime as barrinhas e o rodapé com média', async () => {
  const { default: Lista } = await import('../(app)/page')
  const html = renderToStaticMarkup(await Lista({ searchParams: Promise.resolve({}) }))
  expect(html).toContain('ÚLT. 5 NA LINHA')
  expect(html).toContain('MÉDIA')
  expect(html).not.toContain('probabilidade')
})
```

- [ ] **Step 3: Reformar a tela** — `fundoTelaGradiente` na moldura da rota (ver task 12 para a Moldura global; aqui aplicar no container), filtros com `ChipFiltro`, cards com os campos novos (`ultimos5={item.ultimos5}` etc.), seletor de quantidade mantido (1/2/5/todas — proposta comercial ✓).
- [ ] **Step 4: Suíte + conferência final contra o mockup. Step 5: Commit** — `"Lista Secreta na linguagem broadcast"`

---

### Task 7: `jogadores_ocultos` — exclusão de jogadores por conta

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts`
- Migration: `npm run db:generate` (gera `drizzle/00NN_*.sql` + down)
- Create: `src/modules/plataforma/jogadores-ocultos.ts`
- Create: `src/app/(app)/fire-live/acoes.ts` (server actions ocultar/exibir)
- Test: `src/modules/plataforma/__tests__/jogadores-ocultos.test.ts`

**Interfaces:**
- Produces:
  - Tabela `jogadores_ocultos (id uuid pk, usuario_id uuid fk→usuarios cascade, jogador_id uuid fk→jogadores, criado_em timestamptz)`, `UNIQUE (usuario_id, jogador_id)`.
  - `ocultarJogador(db, usuarioId, jogadorId): Promise<void>` (idempotente — onConflictDoNothing)
  - `exibirJogador(db, usuarioId, jogadorId): Promise<void>`
  - `jogadoresOcultosDe(db, usuarioId): Promise<Set<string>>`
  - `filtrarOcultos<T extends { jogadorId: string }>(itens: T[], ocultos: Set<string>): T[]` — **função pura**, exportada, usada pela tela.

- [ ] **Step 1: Teste falhando** (PGlite via `bancoDeTeste`, padrão dos testes de plataforma):

```ts
it('ocultar é idempotente, exibir desfaz, e o recorte é puro', async () => {
  const usuarioId = await criarUsuarioDeTeste(banco.db) // helper existente nos testes de plataforma
  await ocultarJogador(banco.db, usuarioId, jogadorA)
  await ocultarJogador(banco.db, usuarioId, jogadorA) // não explode
  expect(await jogadoresOcultosDe(banco.db, usuarioId)).toEqual(new Set([jogadorA]))

  const itens = [{ jogadorId: jogadorA }, { jogadorId: jogadorB }]
  expect(filtrarOcultos(itens, new Set([jogadorA]))).toEqual([{ jogadorId: jogadorB }])

  await exibirJogador(banco.db, usuarioId, jogadorA)
  expect(await jogadoresOcultosDe(banco.db, usuarioId)).toEqual(new Set())
})
```

- [ ] **Step 2: Ver falhar. Step 3: Schema + migração + módulo.** Server actions em `acoes.ts`: autenticam pela sessão (helper de sessão existente das telas), chamam o módulo, `revalidatePath('/fire-live')`. Push NÃO é tocado (spec §3 — ocultar cala a tela, não o push).
- [ ] **Step 4: Ver passar (migração roda no PGlite do harness). Step 5: Commit** — `"jogadores_ocultos: a primeira preferência por conta — recorte de leitura puro"`

---

### Task 8: Tela Fire Live reformada (com exclusão)

**Files:**
- Modify: `src/app/(app)/fire-live/page.tsx`
- Modify: `src/app/__tests__/telas-demo.test.ts`
- Create (conferência): `.superpowers/brainstorm/11292-1787622719/content/conferencia-fire.html`

**Interfaces:**
- Consumes: `PlacarMini`/`BarraAlvo`/`ChipFiltro` (T3), `CardEntrada` quente (T5), `jogadoresOcultosDe` + `filtrarOcultos` + actions (T7).

- [ ] **Step 1 (gate visual delegado):** conferência contra o painel direito de `linguagem-b.html` — selo AO VIVO, placar, card quente com 🔥, barra, card "observando" apagado.
- [ ] **Step 2: Teste falhando:**

```ts
it('fire live: universo quente, barra rumo ao alvo e jogador oculto some da tela', async () => {
  // ocultar um jogador apitado para o usuário da demo, depois renderizar
  const html = renderToStaticMarkup(await FireLive({ searchParams: Promise.resolve({}) }))
  expect(html).toContain('AO VIVO')
  expect(html).toContain('/ 10') // contagem da BarraAlvo (alvo demo)
  expect(html).not.toContain(nomeDoJogadorOculto)
  expect(html).toContain('Jogadores ocultos') // seção de gestão com desfazer
})
```

(Adaptar ao harness real de `telas-demo.test.ts` — sessão do usuário demo já existe
para as telas pagas; usar o mesmo caminho.)

- [ ] **Step 3: Reformar** — cabeçalho com selo vermelho, `PlacarMini` por jogo no 1Q, cards em contexto quente com `BarraAlvo`, ícone olho (form + server action) por card, seção "Jogadores ocultos" com lista e desfazer, estados vazios mantidos (os três textos existentes continuam — só a roupa muda).
- [ ] **Step 4: Suíte + conferência. Step 5: Commit** — `"Fire Live na linguagem broadcast, com exclusão de jogadores"`

---

### Task 9: Detalhe do apito reformado

**Files:**
- Modify: `src/app/(app)/apito/[jogadorId]/page.tsx`
- Modify: `src/app/__tests__/telas-demo.test.ts`
- Create (conferência): `.superpowers/brainstorm/11292-1787622719/content/conferencia-detalhe.html`

- [ ] **Step 1 (gate visual):** hero com borda/brilho do grau, blocos MÉDIA/BATEU/MIN como stat-tiles do mockup, últimos 5 com `Barrinhas` (valor+adversário), POR QUE ENTROU, linhas de pontos — tudo na linguagem (Anton/Barlow Condensed, gradientes, temperatura fria).
- [ ] **Step 2: Teste falhando** — a tela usa `Barrinhas` e mantém o contrato de conteúdo:

```ts
it('o detalhe mostra as barrinhas com valor e nunca diz probabilidade', async () => {
  const html = renderToStaticMarkup(await Detalhe({ params: ..., searchParams: ... }))
  expect(html).toContain('ÚLTIMOS 5')
  expect(html).toMatch(/>\d+</) // valor dentro da barrinha
  expect(html).not.toContain('probabilidade')
})
```

- [ ] **Step 3: Reformar** (o conteúdo é o mesmo — `detalheDoApito` intocado; só a pele). **Step 4: Suíte + conferência. Step 5: Commit** — `"Detalhe do apito na linguagem broadcast"`

---

### Task 10: Migração de lances livres + perfil com 2P/LL

**Files:**
- Modify: `src/modules/dominio/db/schema/dominio.ts` (`estatisticasJogo`: `llC`, `llT`)
- Migration: `npm run db:generate`
- Modify: `src/modules/entrega/estatisticas/jogador.ts` (boxscore + médias com 2P e LL)
- Modify: `src/modules/ingestao/demo/semear.ts` (gerar 2P/3P/LL coerentes)
- Test: `src/modules/entrega/__tests__/estatisticas.test.ts` (ou o arquivo equivalente existente — localizar com `ls src/modules/entrega/__tests__/`)

**Interfaces:**
- Produces: linhas do perfil ganham `doisC/doisT/doisPercentual` e `llC/llT/llPercentual` (mesmo padrão de `percentual()` já usado para FG/3P).

- [ ] **Step 1: Teste falhando:**

```ts
it('2 pontos e lances livres aparecem no boxscore com percentual', async () => {
  const tela = await telaDoJogador(banco.db, ruleset, jogadorId) // assinatura real do módulo
  const jogo = tela.ultimosJogos[0]!
  expect(jogo.doisPercentual).not.toBeUndefined()
  expect(jogo.llPercentual).not.toBeUndefined()
})

it('no seed, 2P + 3P + LL somam os pontos do jogo', async () => {
  const linhas = await banco.db.select().from(estatisticasJogo).limit(20)
  for (const l of linhas) {
    expect(l.doisC * 2 + l.tresC * 3 + l.llC).toBe(l.pontos)
  }
})
```

- [ ] **Step 2: Ver falhar. Step 3: Schema (+down), consulta, seed** — o seed já gera pontos por jogo; derivar uma decomposição determinística (ex.: 3P = ~30% dos pontos arredondado a múltiplo de 3, LL = resto mod 2, 2P = o que sobra — determinístico a partir do valor, sem aleatório).
- [ ] **Step 4: Ver passar (inclui reexecutar o teste de soma sobre o seed). Step 5: Commit** — `"Lances livres ganham coluna; perfil mostra 2P e LL com percentual"`

---

### Task 11: Estatísticas reformadas + boxscore do time na partida

**Files:**
- Modify: `src/app/(app)/estatisticas/page.tsx`, `.../jogador/[id]/page.tsx`, `.../time/[id]/page.tsx`
- Modify: `src/modules/entrega/estatisticas/time.ts` (bloco "última partida" + ao vivo do time)
- Test: describe novo no teste de estatísticas + `telas-demo.test.ts`
- Create (conferência em LOTE): `.superpowers/brainstorm/11292-1787622719/content/conferencia-estatisticas.html`

**Interfaces:**
- Produces: `telaDoTime(...)` ganha `ultimaPartida: { adversarioSigla, pontosPorQuarto: number[], rebotesTotal, ... } | null` lida de `estatisticas_time_jogo` (colunas existentes), e `aoVivo` equivalente quando o time está em jogo — mesmo padrão do bloco do jogador.

- [ ] **Step 1: Teste falhando** — `ultimaPartida` presente com o jogo do seed; tela do time imprime "ÚLTIMA PARTIDA" e os pontos por quarto; perfil imprime `2P` e `LL`.
- [ ] **Step 2: Ver falhar. Step 3: Implementar consulta + reformar as 3 telas** na linguagem (temperatura fria; tabelas com o `Tabela` existente re-tokenizado; a EXCEÇÃO da aba continua: time REAL do provedor, nunca a lista do CJ).
- [ ] **Step 4: Conferência em lote (as 3 telas num HTML). Step 5: Suíte + commit** — `"Estatísticas na linguagem broadcast; o time ganha o boxscore da partida"`

---

### Task 12: Resultados, Gestão, como-funciona, auth/assinar/conta + Moldura global

**Files:**
- Modify: `src/design-system/componentes/` (`Moldura`/`CabecalhoTela` — fundo gradiente, selo de contexto)
- Modify: `src/app/(app)/resultados/page.tsx`, `gestao/page.tsx`, `como-funciona/page.tsx`, `(auth)/**` e `conta/page.tsx` (rotas reais: localizar com `ls src/app`)
- Create (conferência em LOTE): `.superpowers/brainstorm/11292-1787622719/content/conferencia-restante.html`

- [ ] **Step 1: Moldura ganha `fundoTelaGradiente`** (uma mudança, todas as telas herdam) e `CabecalhoTela` ganha o slot de selo (`PRÉ-LIVE`/`■ AO VIVO`/nenhum).
- [ ] **Step 2: Reformar as telas em lote** — aplicação da linguagem, sem conteúdo novo. A régua de confiança do como-funciona re-renderiza com os tokens novos (o teste existente da régua deve continuar verde — ele lê o ruleset, não a cor).
- [ ] **Step 3: Conferência em lote. Step 4: Suíte inteira. Step 5: Commit** — `"O restante das telas entra na linguagem broadcast"`

---

### Task 13: Transversais, docs e fumaça final

**Files:**
- Modify: `src/app/__tests__/telas-demo.test.ts`
- Modify: `docs/04-design-system.md` (seção "Identidade 03 · Broadcast" + nota de superação na 02)
- Modify: `docs/specs/README.md` (2 perguntas novas ao CJ — barrinhas/linha principal e ocultar×push)

- [ ] **Step 1: Asserções transversais novas:**

```ts
describe('regras transversais da identidade 03', () => {
  it('nenhuma tela pré-live usa o universo quente', async () => {
    for (const rota of ['../(app)/page', '../(app)/resultados/page', '../(app)/gestao/page']) {
      const { default: Pagina } = await import(rota)
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).not.toContain(semantico.contextoQuente.destaque === '#FF7A1A' ? '#241A2E' : '')
      // pré-live não usa o gradiente quente:
      expect(html).not.toContain('#241a2e')
    }
  })
  it('a palavra probabilidade não existe em tela nenhuma', /* varre as rotas todas */)
})
```

(Ajustar por rota como o describe transversal existente já faz — `/resultados` sem
searchParams etc. A asserção do quente compara com o token, não com hex solto.)

- [ ] **Step 2: Docs** — 04-design-system: a seção nova conta a anatomia de 3 zonas, temperatura por contexto, os 3 brilhos e seus donos; a seção da 02 ganha nota datada de superação (mesmo rito do ADR-0005). README das specs: as 2 perguntas ao CJ no bloco próprio.
- [ ] **Step 3: Fumaça:** `npx tsc --noEmit && npm run lint && npm run boundaries && npx vitest run && npm run build` — tudo verde.
- [ ] **Step 4: Commit final** — `"Identidade 03 fechada: transversais, docs e fumaça"`. NÃO fazer merge na main — a main deploya sozinha; o merge é decisão do parceiro depois da auditoria dos mockups de conferência.

---

## Self-review (feita na escrita)

- **Cobertura da spec:** §1 tokens→T1 · §2 componentes→T2/T3/T5 + Moldura em T12 · §3 dados→T4 (feed), T7 (ocultos), T10 (LL), T11 (boxscore time) · §4 migração→T6/T8/T9/T11/T12 na ordem da spec · §5 testes→espalhados + T13 · Registro→T13. Perguntas ao CJ→T13.
- **Placeholders:** os trechos "adaptar ao harness real" apontam para padrão EXISTENTE nomeado (não é TBD — é instrução de localizar o helper do arquivo).
- **Tipos:** `ultimos5: { valor, bateu }[]` idêntico em T2 (Barrinhas), T4 (ItemFeed) e T5 (props). `oddFaixa` com `media?` opcional em T5 casa com o produção-futura da Spec 2. `historicoNaLinha` consumida por T4 e citada em T9 (detalhe usa a mesma).
- **Gate visual delegado** presente em T6/T8/T9 (individuais) e T11/T12 (lote), como a spec manda.
