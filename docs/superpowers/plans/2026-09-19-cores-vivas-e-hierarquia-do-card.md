# Identidade 06 — cores vivas e a odd no lugar da confiança · plano

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: `superpowers:executing-plans`. Os passos
> usam caixinha (`- [ ]`) para acompanhamento.

**Goal:** vestir a moldura do card no metálico do nível do jogador, subir a odd média para
o lugar de destaque que era da nota de confiança, aumentar a meta ("4+") e trocar sete
hexes por versões medidamente mais vivas.

**Architecture:** tudo acontece em duas camadas — os tokens (`src/design-system/tokens/`)
e um componente (`CardEntrada.tsx`). O motor, o feed, o ruleset e o banco não são tocados:
o item do feed continua carregando a confiança, e a Lista continua ordenando por ela; o que
muda é o que o card desenha. Os quatro chamadores do card só perdem duas props.

**Tech Stack:** Next.js App Router, React 19 (render estático nos testes via
`renderToStaticMarkup`), Vitest, tokens em três camadas com `tokens.css` gerado.

**Spec:** [`2026-09-19-cores-vivas-e-hierarquia-do-card-design.md`](../specs/2026-09-19-cores-vivas-e-hierarquia-do-card-design.md)

## Global Constraints

- **Hex só em `primitivo.ts`.** Nenhum outro arquivo ganha um `#`. O teste "hex direto"
  varre `src/design-system/componentes`.
- **Semântico só referencia primitivo; componente só referencia semântico.** Teste de
  paridade vigia.
- **`config/ruleset.v1.yaml` não muda.** Nada aqui é estratégia.
- **Nenhum componente escreve "probabilidade".** Teste varre a UI.
- **Redundância textual obrigatória:** toda cor acompanhada da palavra.
- **UM commit, no fim de tudo.** Preferência registrada do parceiro: nada de commit por
  tarefa. `git add -A && git commit` só no passo final, em branch própria.
- **Branch:** `identidade-06-cores-vivas`, criada a partir da `main` antes da tarefa 1.
- **Depois de mexer em token:** `npm run tokens` regenera `tokens.css`, senão o teste de
  sincronia quebra.

---

### Task 0: Branch

- [ ] **Passo 1:** `git switch -c identidade-06-cores-vivas`

---

### Task 1: A paleta e os véus

**Files:**
- Modify: `src/design-system/tokens/primitivo.ts`
- Modify: `src/design-system/tokens/semantico.ts`
- Modify: `src/design-system/tokens/componente.ts`
- Modify: `src/design-system/tokens/css.ts`
- Modify: `src/design-system/tokens/tokens.css` (gerado)
- Test: `src/design-system/__tests__/tokens.test.ts`

**Interfaces:**
- Produces: `semantico.nivelMvpVeu | nivelAllStarVeu | nivelSuporteVeu | nivelRandolaVeu`,
  `semantico.nivelRandolaBorda`; `componente.molduraNivel[Nivel] = { borda, veu }`;
  `componente.odd = { rotulo, valorMedia, valorFaixa }`;
  `componente.meta = { rotulo, valor, abaRotulo, abaValor }`;
  `componente.nivelRotuloTamanho`; `NIVEL_JOGADOR[n] = { cor, rotulo, borda, veu }`.

- [ ] **Passo 1: escrever os testes vermelhos** em `tokens.test.ts`, num
      `describe('identidade 06 — cores vivas')` novo:

```ts
const SUPERFICIES = [
  semantico.superficie,        // #101C30
  semantico.superficieFria2,   // cartaoFrio
  semantico.superficieFria1,   // campoFrio
  semantico.superficieQuente1, // campoQuente
  semantico.superficieQuente2, // cartaoQuente
]
const pior = (cor: string) => Math.min(...SUPERFICIES.map((s) => razaoDeContraste(cor, s)))
const sat = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1))
}

it('os sete hexes novos estão no primitivo, literalmente', () => {
  expect(primitivo.ouro).toBe('#F2AE1C')
  expect(primitivo.prata).toBe('#A9B6C9')
  expect(primitivo.bronze).toBe('#F08040')
  expect(primitivo.ambar400).toBe('#FFDD00')
  expect(primitivo.laranja400).toBe('#FFA31F')
  expect(primitivo.verde400).toBe('#2BE884')
  expect(semantico.nivelRandola).toBe(primitivo.branco)
})

it('grafite não existe mais', () => {
  expect('grafite' in primitivo).toBe(false)
})

it('as cinco cores que sobem ganham saturação E contraste', () => {
  // Prata e Randola são as DUAS exceções declaradas na spec §4: a prata desce
  // nos dois para abrir distância do branco, e o branco não tem saturação.
  const antes = { ouro: '#E0B24A', bronze: '#C8823C', ambar400: '#FFC93D',
                  laranja400: '#FF9838', verde400: '#3DD37E' }
  for (const [chave, velho] of Object.entries(antes)) {
    const novo = primitivo[chave as keyof typeof antes]
    expect(sat(novo), `${chave} saturação`).toBeGreaterThanOrEqual(sat(velho))
    expect(pior(novo), `${chave} contraste`).toBeGreaterThanOrEqual(pior(velho))
  }
})

it('o rótulo do nível passa em AA para texto nas CINCO superfícies', () => {
  for (const [nivel, { cor }] of Object.entries(NIVEL_JOGADOR))
    expect(pior(cor), `${nivel}: ${pior(cor).toFixed(2)}`).toBeGreaterThanOrEqual(AA.texto)
})

it('a moldura do Randola é o branco a 55%, não o branco cheio', () => {
  expect(NIVEL_JOGADOR.RANDOLA.cor).toBe('#FFFFFF')
  expect(NIVEL_JOGADOR.RANDOLA.borda).toBe(primitivo.brancoVeu55)
  expect(NIVEL_JOGADOR.MVP.borda).toBe(semantico.nivelMvp)
})

it('cada véu é o decimal exato do seu metálico', () => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',')
  for (const [nivel, { cor, veu }] of Object.entries(NIVEL_JOGADOR)) {
    const base = nivel === 'RANDOLA' ? '#FFFFFF' : cor
    expect(veu, nivel).toBe(`rgba(${rgb(base)},.12)`)
  }
})

it('a moldura ficou mais larga e o anel do avatar mais grosso', () => {
  expect(componente.cardBordaLateral).toBe('6px')
  expect(componente.avatarAnelEspessura).toBe('3px')
})
```

- [ ] **Passo 2: rodar e ver falhar** — `npx vitest run src/design-system/__tests__/tokens.test.ts`
      Esperado: FAIL nos sete.

- [ ] **Passo 3: `primitivo.ts`** — trocar os seis hexes, remover `grafite`, acrescentar os
      quatro véus metálicos e recalcular os três véus cromáticos:

```ts
  // Metálicos — nível do jogador. Identidade 06: o metálico saiu do tracinho de
  // 56×3 e passou a vestir a MOLDURA inteira do card, então ele precisa de cor
  // viva, não de discrição. `grafite` saiu junto com o Randola cinza.
  ouro: '#F2AE1C',
  prata: '#A9B6C9',
  bronze: '#F08040',
  // Véus da moldura — o decimal de cada metálico a 12%, para o fundo do
  // cabeçalho e do rodapé do card. O do Randola é o branco.
  ouroVeu12: 'rgba(242,174,28,.12)',
  prataVeu12: 'rgba(169,182,201,.12)',
  bronzeVeu12: 'rgba(240,128,64,.12)',
  brancoVeu12: 'rgba(255,255,255,.12)',
```
      e, nos cromáticos, `ambar400: '#FFDD00'`, `laranja400: '#FFA31F'`,
      `verde400: '#2BE884'`, com `ambarVeu12: 'rgba(255,221,0,.12)'`,
      `laranjaVeu12: 'rgba(255,163,31,.12)'`, `verdeVeu12: 'rgba(43,232,132,.12)'`.

- [ ] **Passo 4: `semantico.ts`** — `nivelRandola: p.branco` e o bloco novo:

```ts
  // -- Identidade 06 · a moldura veste o nível do JOGADOR -------------------
  // O véu a 12% de cada metálico, para o cabeçalho e o rodapé do card.
  nivelMvpVeu: p.ouroVeu12,
  nivelAllStarVeu: p.prataVeu12,
  nivelSuporteVeu: p.bronzeVeu12,
  nivelRandolaVeu: p.brancoVeu12,
  /**
   * A borda da moldura do Randola é o branco a 55%, não o cheio. Branco puro é
   * a maior luminância do sistema: uma moldura branca faria o card do jogador
   * MENOS importante gritar mais que o do MVP. O TEXTO do nível continua
   * branco cheio — é o que o feedback pediu.
   */
  nivelRandolaBorda: p.brancoVeu55,
```

- [ ] **Passo 5: `componente.ts`** — `cardBordaLateral: '6px'`,
      `avatarAnelEspessura: '3px'` e os blocos novos:

```ts
  /**
   * A MOLDURA do card, por nível do jogador (identidade 06). Mesmo molde de
   * `abaAtributo.ativaPorNivel`: o componente consulta o mapa, nunca decide a
   * cor. O Randola tem borda própria (branco a 55%) pela razão em `semantico`.
   */
  molduraNivel: {
    MVP: { borda: s.nivelMvp, veu: s.nivelMvpVeu },
    ALL_STAR: { borda: s.nivelAllStar, veu: s.nivelAllStarVeu },
    SUPORTE: { borda: s.nivelSuporte, veu: s.nivelSuporteVeu },
    RANDOLA: { borda: s.nivelRandolaBorda, veu: s.nivelRandolaVeu },
  },
  /** O rótulo do nível em Bebas, o tamanho que o feedback 02 pediu. */
  nivelRotuloTamanho: '20px',
  /** A odd no canto: o elemento de maior destaque do card. */
  odd: { rotulo: '10px', valorMedia: '38px', valorFaixa: '26px' },
  /** A meta: o número maior que o rótulo que o nomeia. */
  meta: { rotulo: '11px', valor: '24px', abaRotulo: '11px', abaValor: '15px' },
```

- [ ] **Passo 6: `css.ts`** — `NIVEL_JOGADOR` passa a carregar a moldura:

```ts
export const NIVEL_JOGADOR: Record<
  Nivel,
  { cor: string; rotulo: string; borda: string; veu: string }
> = {
  MVP: { cor: semantico.nivelMvp, rotulo: 'MVP', ...componente.molduraNivel.MVP },
  ALL_STAR: { cor: semantico.nivelAllStar, rotulo: 'All Star', ...componente.molduraNivel.ALL_STAR },
  SUPORTE: { cor: semantico.nivelSuporte, rotulo: 'Suporte', ...componente.molduraNivel.SUPORTE },
  RANDOLA: { cor: semantico.nivelRandola, rotulo: 'Randola', ...componente.molduraNivel.RANDOLA },
}
```

- [ ] **Passo 7:** `npm run tokens` e rodar `npx vitest run src/design-system/__tests__/tokens.test.ts`
      Esperado: PASS, inclusive o teste de sincronia do CSS e o de colisão de canais.

---

### Task 2: A moldura metálica e a saída da confiança

**Files:**
- Modify: `src/design-system/componentes/CardEntrada.tsx`
- Test: `src/design-system/__tests__/card.test.ts`

**Interfaces:**
- Consumes: `NIVEL_JOGADOR[n].borda|.veu`, `componente.cardBordaLateral`,
  `componente.molduraNivel`, `APITO[n].cor`, `TURBO.cor`.
- Produces: `CardEntradaProps` **sem** `confianca` e **sem** `grauConfianca`.

- [ ] **Passo 1: ajustar o `base` do teste** — tirar `confianca: 92` e
      `grauConfianca: 4 as const`.

- [ ] **Passo 2: trocar os testes que morrem e escrever os novos:**

```ts
// SUBSTITUI 'a nota de confiança é número puro'
it('o card não escreve a nota de confiança em estado nenhum', () => {
  // Identidade 06: a confiança saiu do card e ficou na análise do apito.
  // Par do teste "nunca escreve probabilidade".
  const estados: CardEntradaProps[] = [
    { ...base, linha: 20 },
    { ...base, linha: 20, turbo: true },
    { ...base, temperatura: 'quente', alvo1Q: 10, progresso1Q: { observado: 4, alvo: 10 } },
    { ...base, linha: 20, estado: 'CONFERIDO', fez: 27, bateu: true },
    { ...base, linha: 20, lente: 'ODDS', oddFaixa: { min: 1.4, max: 1.6, qtdCasas: 3 } },
  ]
  for (const props of estados) {
    const html = render(props)
    expect(html.toLowerCase()).not.toContain('confian')
    expect(html).not.toContain(componente.cardBordaLateral + ' solid ' + '#47CBBA')
  }
  const fonte = readFileSync('src/design-system/componentes/CardEntrada.tsx', 'utf8')
  expect(fonte).not.toContain('CONFIANCA_GRAU')
  expect(fonte).not.toContain('grauConfianca')
})

// SUBSTITUI 'a faixa metálica do nível fica recuada, alinhada com o avatar'
it('a moldura veste o metálico do nível — e o tracinho de 56×3 morreu', () => {
  for (const nivel of ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA'] as const) {
    const html = render({ ...base, nivelJogador: nivel, linha: 20 })
    const { borda, veu } = NIVEL_JOGADOR[nivel]
    expect(estiloDoCard(html), nivel).toContain(`border-left:6px solid ${borda}`)
    expect(estiloDoCard(html), nivel).toContain(`border:1px solid ${borda}`)
    expect(html, `${nivel} sem véu`).toContain(veu)
  }
  expect(render({ ...base, linha: 20 })).not.toContain('margin-left:14px')
})

it('o rótulo do nível sai grande na cor metálica, e o numeral na cor do apito', () => {
  const html = render({ ...base, nivelJogador: 'SUPORTE', nivelApito: 2, linha: 20 })
  expect(html).toContain(`font-size:${componente.nivelRotuloTamanho}`)
  expect(html).toContain(NIVEL_JOGADOR.SUPORTE.cor)
  expect(html).toContain(APITO[2].cor)
  expect(texto(html)).toContain('Suporte')
  expect(texto(html)).toContain('N2')
  // turbo: o numeral veste o azul do turbo, como o anel
  expect(render({ ...base, turbo: true, linha: 20 })).toContain(TURBO.cor)
})

// SUBSTITUI 'borda lateral na cor do grau; os três brilhos têm cada um seu dono'
it('os três brilhos viraram dois: turbo e modo fire, cada um com seu dono', () => {
  expect(render({ ...base, linha: 20 })).not.toContain('box-shadow')
  expect(render({ ...base, turbo: true, linha: 20 })).toContain(componente.turboBrilho)
  expect(render({ ...base, temperatura: 'quente', modoFire: true, alvo1Q: 10 })).toContain(
    componente.contextoQuente.brilho,
  )
})

it('a coluna do canto não tem z-index; só o invólucro da ação tem', () => {
  // Regressão da Identidade 05 (spec irmã, §4.2): a coluna inteira subia de
  // camada e cobria a cobertura do card — antes sobre a confiança, agora sobre
  // a odd. O z-index vai para um span em volta da ação, e só nele.
  const fonte = readFileSync('src/design-system/componentes/CardEntrada.tsx', 'utf8')
  const colunaDoCanto = fonte.slice(fonte.indexOf("alignItems: 'flex-end'"))
  expect(colunaDoCanto.slice(0, 400)).not.toContain('zIndex')
})
```
      e, em `'toda prop obrigatória do card aparece na saída renderizada'`, tirar `'92'`
      da lista de valores esperados.

- [ ] **Passo 3: rodar e ver falhar** — `npx vitest run src/design-system/__tests__/card.test.ts`

- [ ] **Passo 4: `CardEntrada.tsx`** — o import vira
      `import { APITO, MODO_FIRE, NIVEL_JOGADOR, TURBO } from '../tokens/css'`; saem as
      props `confianca` e `grauConfianca` do tipo; saem `grau`, `corGrau`,
      `brilhaConfianca`, `corPercentual`, `mostraPercentual` e o `<span>` do número.
      O topo do componente fica:

```tsx
  const nivel = NIVEL_JOGADOR[props.nivelJogador]
  const corDoApito = props.turbo ? TURBO.cor : APITO[props.nivelApito].cor
  const quente = props.temperatura === 'quente'
  const contexto = quente ? componente.contextoQuente : componente.contextoFrio
  // Dos três brilhos da identidade 03 sobram dois: a confiança saiu do card
  // (identidade 06) e levou o dela junto.
  const brilhoDoCard = props.turbo
    ? componente.turboBrilho
    : props.modoFire
      ? componente.contextoQuente.brilho
      : undefined
```
      O `<div>` do tracinho metálico é apagado inteiro. O `<article>` passa a usar
      `border: `1px solid ${nivel.borda}`` e
      `borderLeft: `${componente.cardBordaLateral} solid ${nivel.borda}``.
      A zona 1 ganha `background: nivel.veu` no `style`; a zona 3 troca
      `background: contexto.faixaFundo` por `background: nivel.veu` (o `borderTop`
      continua em `contexto.borda`: a moldura é metálica, a régua interna é neutra).
      A linha de apoio vira:

```tsx
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: semantico.fonteTitulo,
                  fontSize: componente.nivelRotuloTamanho,
                  lineHeight: 1,
                  letterSpacing: 1,
                  color: nivel.cor,
                  textTransform: 'uppercase',
                }}
              >
                {nivel.rotulo}
              </span>
              <span
                style={{
                  fontFamily: semantico.fonteRotulo,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  color: corDoApito,
                }}
              >
                N{props.nivelApito}
              </span>
              {props.posicao && (
                <span
                  style={{
                    fontFamily: semantico.fonteRotulo,
                    fontSize: 12,
                    letterSpacing: 1.2,
                    color: semantico.texto55,
                  }}
                >
                  {props.posicao}
                </span>
              )}
            </div>
```
      e o `zIndex: 1` sai do `style` da coluna do canto e vai para um
      `<span style={{ position: 'relative', zIndex: 1 }}>{props.acaoCanto}</span>`.

- [ ] **Passo 5: rodar** — `npx vitest run src/design-system/__tests__/card.test.ts`
      Esperado: PASS. Os testes de conteúdo do Fire Live, do conferido e das lentes
      seguem verdes sem edição.

---

### Task 3: A odd no lugar de destaque e a meta grande

**Files:**
- Modify: `src/design-system/componentes/CardEntrada.tsx`
- Test: `src/design-system/__tests__/card.test.ts`

**Interfaces:**
- Consumes: `componente.odd`, `componente.meta`, `props.oddFaixa`.

- [ ] **Passo 1: trocar `'rodapé: quem decide média ou faixa é o RULESET'` e escrever
      os novos:**

```ts
it('a odd ocupa o canto de destaque, e quem decide média ou faixa é o RULESET', () => {
  // `odds.exibicao` (ruleset) é aplicada na MATERIALIZAÇÃO, que suprime `media`
  // quando a chave é 'faixa'. O card só desenha o que recebe.
  const comMedia = render({
    ...base, linha: 25, mediaTemporada: 25.7,
    oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3, media: 1.55 },
  })
  expect(texto(comMedia)).toContain('ODD MÉDIA 1,55')
  expect(comMedia).toContain(`font-size:${componente.odd.valorMedia}`)
  expect(comMedia).not.toContain('1,47–1,62')
  // e saiu do rodapé: lá ficou só a média da temporada
  expect(texto(comMedia)).toContain('MÉDIA 25,7')

  const faixa = render({
    ...base, linha: 25, mediaTemporada: 25.7,
    oddFaixa: { min: 1.47, max: 1.62, qtdCasas: 3 },
  })
  expect(texto(faixa)).toContain('ODD 1,47–1,62')
  expect(faixa).toContain(`font-size:${componente.odd.valorFaixa}`)
})

it('sem odd o canto não desenha nada — nem "—", nem zero', () => {
  const semOdd = render({ ...base, linha: 25, mediaTemporada: 25.7, oddFaixa: null })
  expect(semOdd).not.toContain('ODD')
  expect(semOdd).not.toContain(`font-size:${componente.odd.valorMedia}`)
  expect(texto(semOdd)).toContain('MÉDIA 25,7')
  // o card do Fire Live grava oddFaixa: null por decisão de produto
  const quente = render({ ...base, temperatura: 'quente', alvo1Q: 11, oddFaixa: null })
  expect(quente).not.toContain('ODD')
})

it('a meta sai com o número maior que o rótulo que o nomeia', () => {
  const html = render({ ...base, atributo: 'REBOTES', linha: 4 })
  expect(texto(html)).toContain('REBOTES 4+')
  expect(html).toContain(`font-size:${componente.meta.valor}`)
  expect(html).toContain(`font-size:${componente.meta.rotulo}`)
  // a aba de atributo mantém a mesma proporção
  const comAbas = render({
    ...base, linha: 20,
    atributos: [
      { atributo: 'PONTOS', linha: 20, ativo: true, href: '/a' },
      { atributo: 'REBOTES', linha: 6, ativo: false, href: '/b' },
    ],
  })
  expect(comAbas).toContain(`font-size:${componente.meta.abaValor}`)
  expect(texto(comAbas)).toContain('PTS 20+')
})
```

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: `CardEntrada.tsx`** — `rodapeDireita` perde a odd (fica só `MÉDIA`), e
      entram a odd do canto e a meta partida:

```tsx
  // A ODD é o elemento de maior destaque do card (feedback 02): ela ocupa o
  // canto que era da nota de confiança. Três estados, nenhum deles inventado —
  // média quando o ruleset manda exibi-la, faixa quando não, e NADA quando não
  // há odd (todo card do Fire Live cai aqui).
  const odd = props.oddFaixa
  const oddDestaque =
    odd == null
      ? null
      : odd.media != null
        ? {
            rotulo: 'ODD MÉDIA',
            valor: decimalPtBr(odd.media, 2),
            tamanho: componente.odd.valorMedia,
          }
        : {
            rotulo: 'ODD',
            valor: `${decimalPtBr(odd.min, 2)}–${decimalPtBr(odd.max, 2)}`,
            tamanho: componente.odd.valorFaixa,
          }

  // A META em duas peças: o rótulo pequeno e o número grande. SÓ no pré-live —
  // o rodapé quente ("ALVO 1º Q · 11 PTS") é uma frase só e não se parte.
  const usaAlvo = quente && rotuloAlvo1Q != null
  const meta =
    usaAlvo || props.linha == null
      ? { rotulo: rotuloLinha, valor: null }
      : { rotulo: ATRIBUTO_ROTULO[props.atributo], valor: `${props.linha}+` }
```
      No canto, no lugar do `<span>` do percentual:

```tsx
            {oddDestaque && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span
                  style={{
                    fontFamily: semantico.fonteRotulo,
                    fontSize: componente.odd.rotulo,
                    letterSpacing: 1.2,
                    color: semantico.texto55,
                    textTransform: 'uppercase',
                  }}
                >
                  {oddDestaque.rotulo}
                </span>
                <span
                  style={{
                    fontFamily: semantico.fonteNumero,
                    fontSize: oddDestaque.tamanho,
                    lineHeight: 1,
                    color: semantico.texto100,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {oddDestaque.valor}
                </span>
              </div>
            )}
```
      e no rodapé, no lugar do `<span>` de `rotuloLinha`:

```tsx
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
              <span
                style={{
                  fontSize: componente.meta.rotulo,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  color: semantico.texto55,
                }}
              >
                {meta.rotulo}
              </span>
              {meta.valor && (
                <span
                  style={{
                    fontFamily: semantico.fonteNumero,
                    fontSize: componente.meta.valor,
                    lineHeight: 1,
                    color: componente.cardTexto,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {meta.valor}
                </span>
              )}
            </span>
```
      As abas ganham a mesma proporção: `ATRIBUTO_CURTO` em `componente.meta.abaRotulo`
      e `{linha}+` em `componente.meta.abaValor` com `fontWeight: 700`, num
      `<span style={{ display:'inline-flex', alignItems:'baseline', gap:4 }}>`.
      O `alignSelf` da coluna do canto passa a considerar a odd:
      `rotuloEstado || props.acaoCanto || oddDestaque ? 'flex-start' : 'center'`.

- [ ] **Passo 4: rodar** — `npx vitest run src/design-system/__tests__/card.test.ts`
      Esperado: PASS, inclusive `'odd sempre em FAIXA, com travessão'` e
      `'rodapé quente: "ALVO 1º Q · 11 PTS"'`, que não mudam de comportamento.

---

### Task 4: Os quatro chamadores

**Files:**
- Modify: `src/app/(app)/page.tsx:185,188`
- Modify: `src/app/(app)/resultados/[data]/page.tsx:681-682`
- Modify: `src/app/(app)/como-funciona/page.tsx:424-425`
- Modify: `src/app/(admin)/admin/galeria/page.tsx` (22 pares)

- [ ] **Passo 1:** apagar toda linha que case com `^\s*(confianca|grauConfianca)=` nos
      quatro arquivos:

```bash
for f in "src/app/(app)/page.tsx" "src/app/(app)/resultados/[data]/page.tsx" \
         "src/app/(app)/como-funciona/page.tsx" "src/app/(admin)/admin/galeria/page.tsx"; do
  perl -ni -e 'print unless /^\s*(confianca|grauConfianca)=/' "$f"
done
```

- [ ] **Passo 2:** `npm run typecheck` — ele aponta as variáveis que ficaram órfãs
      (`notaDoExemplo`, `grauDoExemplo` em `como-funciona`, `CONFIANCA` na galeria,
      `conferido` em `resultados` se só a confiança o usava). Apagar as que o
      compilador acusar; manter as que ainda têm outro uso.

- [ ] **Passo 3:** `npm run lint` e `npm test`
      Esperado: tudo verde. Se um teste de tela (`telas-*`) afirmar o número de
      confiança dentro de um card, ele descreve comportamento que esta spec removeu:
      trocar a asserção pela odd, no mesmo espírito do teste 11.

---

### Task 5: A suíte inteira e o olho

- [ ] **Passo 1:** `npm test && npm run typecheck && npm run lint && npm run boundaries`
      Esperado: quatro verdes.
- [ ] **Passo 2:** `scripts/captura-telas.sh` — gera as quatro larguras a partir do HTML
      dos testes, sem Next nem banco. Sai com código 1 se alguma tela vazar para os lados.
- [ ] **Passo 3:** olhar, lado a lado com `.superpowers/capturas-baseline/`:
      `lista-secreta`, `fire-live`, `identidade-04-resultados`, `detalhe-apito` e
      `galeria` — esta última é a que mostra os quatro níveis juntos e é a prova de
      que a moldura metálica se distingue.

---

### Task 6: Documentação

**Files:**
- Modify: `docs/04-design-system.md`
- Create: `docs/adr/0011-moldura-do-nivel-e-saida-da-confianca.md`

- [ ] **Passo 1:** em `04-design-system.md`: atualizar a tabela "Regra estrutural" (o
      canal do nível do jogador vira "moldura do card"; a linha do anel perde o "+
      confiança"), o desenho de "Anatomia do card" (a odd no canto, o nível grande, a
      meta grande) e o parágrafo do grafite na seção de acessibilidade (linhas 128-129),
      que passa a explicar o branco a 55% da moldura do Randola. Acrescentar uma seção
      "Identidade 06" com a tabela de paleta da spec §4.
- [ ] **Passo 2:** escrever o ADR-0011 no molde dos outros: contexto (os três feedbacks),
      decisão (moldura = nível do jogador; confiança sai do card), consequências
      (ADR-0005 fica parcialmente superado; a p.4 da proposta vende a confiança no card e
      o CJ precisa ser avisado; a rampa turquesa sobrevive na análise do apito), e o
      custo (dois canais continuam dois, mas trocaram de superfície).
- [ ] **Passo 3:** `npm test` de novo — há teste que lê o diretório de ADRs e teste que
      varre a escrita da interface.

---

### Task 7: O commit único

- [ ] **Passo 1:** `git status` e conferir que nada de `.env`, `.superpowers/capturas*`
      ou arquivo temporário entrou.
- [ ] **Passo 2:**

```bash
git add -A
git commit -m "$(cat <<'MSG'
Identidade 06: a moldura veste o nível do jogador e a odd toma o lugar da confiança

Os três feedbacks do parceiro sobre a tela da Identidade 05 pediam a mesma
coisa por três caminhos: a cor está apagada e a hierarquia está invertida.

A cor estava apagada por área, não só por matiz — o metálico do nível vivia
num tracinho de 56×3 px. Ele passa a vestir a moldura inteira do card: borda,
lateral de 6 px, véu a 12% no cabeçalho e no rodapé, e o rótulo do nível em
Bebas 20 px na cor. Sete hexes ficaram mais vivos, cada um com saturação e
contraste medidos contra as cinco superfícies de card do app; prata e Randola
são as duas exceções declaradas, e o bronze do Suporte — o card do Josh Hart —
saiu de #C8823C para #F08040.

A hierarquia estava invertida porque o número grande do canto era a nota de
confiança e a odd era texto cinza de 12 px no rodapé. A odd sobe para o canto
em Bebas 38; a meta ganha o número maior que o rótulo; a confiança sai do card
e fica na análise do apito, onde já morava em pílula e por linha. Nenhum dado
muda: o item segue carregando a nota e a Lista segue ordenando por ela.

Dois canais continuam dois — só trocaram de superfície: metálico na moldura,
cromático no anel, no numeral e na aba. Ver ADR-0011.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Auto-revisão do plano

**Cobertura da spec:** §4 paleta → Task 1. §5.1 moldura → Task 2. §5.2 anel/numeral →
Tasks 1 (anel) e 2 (numeral). §5.3 Randola → Tasks 1 e 2. §6.1 odd → Task 3. §6.2 meta →
Task 3. §7 saída da confiança → Tasks 2 e 4. §7.1 zIndex → Task 2. §8 arquitetura → Tasks
1-4 e 6. §9 verificação → os 18 testes distribuídos em 1, 2 e 3, mais a Task 5. §11 ordem
→ a numeração das tasks.

**Placeholders:** nenhum "TBD"; todo passo de código traz o código.

**Consistência de tipos:** `molduraNivel` é `Record<Nivel, {borda, veu}>` na Task 1 e é
consumido como `NIVEL_JOGADOR[n].borda|.veu` nas Tasks 2 e 3 — o espalhamento em `css.ts`
(Task 1, passo 6) é o que liga os dois. `componente.odd`/`componente.meta` são criados na
Task 1 e lidos na Task 3. `corDoApito` nasce na Task 2 e não é usado na Task 3.
