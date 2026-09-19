# UX para web — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: `superpowers:executing-plans`.

**Goal:** fazer o app responder ao mouse e ao teclado (520 de 794 elementos não respondem
hoje), devolver a largura do monitor às duas telas de dado que rodam em 640 px, e fechar
cinco defeitos pontuais que a captura de desktop revelou.

**Architecture:** quatro classes globais novas em `globals.css` que acrescentam SÓ estado
(hover e foco) — diferente das quatro de 19/09, que assumiram a cor dos controles neutros.
Aqui os elementos carregam cor que é DADO (o metálico do nível, o cromático do apito) e a
classe não pode tocá-la. Depois, aplicação nas telas, duas trocas de largura e quatro
correções pontuais.

**Tech Stack:** Next.js App Router, React 19, CSS Modules + `globals.css` lendo `tokens.css`,
Vitest com `renderToStaticMarkup` (sem hidratação — estado se prova por classe presente e
regra no CSS), Chrome headless por CDP para captura.

**Spec:** [`2026-09-19-ux-para-web-design.md`](../specs/2026-09-19-ux-para-web-design.md)

## Global Constraints

- **A classe nova acrescenta ESTADO, nunca cor de base.** Nenhuma das quatro escreve
  `background`, `color` ou `border` fora de `:hover`/`:focus-visible`. O card e a aba de
  atributo carregam a cor do nível, e sobrescrevê-la apagaria o sinal.
- **Hover atrás de `@media (hover: hover)`**, como as quatro de 19/09.
- **Nada de hex fora de `primitivo.ts`.** As classes leem `var(--…)` de `tokens.css`.
- **O motor e o ruleset não mudam.** `npm run boundaries` continua verde.
- **Nenhuma decisão de identidade reabre.** Paleta da 06, dois canais, piso de 12 px.
- **UM commit, no fim de tudo** — inclusive a spec e este plano, que NÃO são commitados
  antes (pedido do parceiro). Branch `ux-para-web`, a partir da `main`.
- **Disco:** `df -h /` antes de suíte, build ou captura; abaixo de 3 GB, limpar a lista
  aprovada em MEMORY.md (`disco-cheio-mac`).

---

# Fase 0 · Branch

### Task 0.1

- [ ] `git fetch origin && git status` — a `main` está em `9f29129`? Se andou, rebasear
      antes de começar (lição de 19/09: há mais de uma mão no repositório).
- [ ] `git switch -c ux-para-web`

---

# Fase 1 · As quatro classes de estado

### Task 1.1: `globals.css`

**Files:** `src/app/globals.css` · Test: `src/app/__tests__/controles-com-estado.test.ts`

- [ ] **Step 1: o teste**, acrescentado ao arquivo que já existe:

```ts
const CLASSES_DE_ESTADO = ['card-alvo', 'link-texto', 'aba-atributo', 'opcao-segmentada'] as const

describe('estado no desktop (auditoria de UX para web, 19/09)', () => {
  it.each(CLASSES_DE_ESTADO)('.%s tem hover atrás de (hover: hover)', (classe) => {
    const blocos = css.match(/@media \(hover: hover\)\s*\{[\s\S]*?\n\}/g) ?? []
    expect(blocos.some((b) => b.includes(`.${classe}`)), classe).toBe(true)
  })

  it('as quatro NÃO escrevem cor de base — só estado', () => {
    // O card e a aba carregam a cor do NÍVEL embutida; uma classe que
    // escrevesse background/color/border fora de :hover apagaria o sinal.
    const inicio = css.indexOf('/* ===== ESTADO NO DESKTOP')
    expect(inicio).toBeGreaterThan(-1)
    const trecho = css.slice(inicio, css.indexOf('/* ===== FIM ESTADO NO DESKTOP'))
    for (const regra of trecho.matchAll(/\.(card-alvo|link-texto|aba-atributo|opcao-segmentada)([^{]*)\{([^}]*)\}/g)) {
      const seletor = regra[2] ?? ''
      const corpo = regra[3] ?? ''
      const eEstado = /:hover|:focus-visible|:focus-within/.test(seletor)
      if (!eEstado) expect(corpo, `${regra[1]}${seletor}`).not.toMatch(/background:|color:|border:/)
    }
  })

  it('o card e as abas ganham foco visível pelo anel do app', () => {
    expect(css).toMatch(/\.card-alvo:focus-within > article\s*\{[^}]*outline:\s*var\(--foco\)/)
    expect(css).toMatch(/\.link-texto:focus-visible[\s\S]{0,120}outline:\s*var\(--foco\)/)
  })
})
```

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: o bloco**, ao fim de `globals.css`:

```css
/* ===== ESTADO NO DESKTOP (auditoria de UX para web, 19/09) =====

   A auditoria mediu 520 de 794 elementos interativos sem :hover e sem foco do
   app — estilo embutido não tem estado, e é assim que quase toda a UI foi
   escrita. No celular não faz falta; no desktop é a diferença entre uma tela
   viva e uma imagem.

   DIFERENÇA para o bloco de cima: aquelas quatro classes assumiram a COR dos
   controles neutros. Estas quatro não podem — o card carrega o metálico do
   nível do jogador e a aba carrega o cromático do apito, e as duas cores são
   DADO. Aqui só existe estado.

   Por isso o realce do card é `outline`, e não `border` nem `box-shadow`: a
   borda é o nível e o box-shadow é o brilho do turbo e do modo fire. */

.card-alvo:focus-within > article {
  outline: var(--foco);
  outline-offset: -2px;
}
.link-texto:focus-visible,
.aba-atributo:focus-visible,
.opcao-segmentada:focus-visible {
  outline: var(--foco);
  outline-offset: 2px;
}

@media (hover: hover) {
  .card-alvo:hover > article {
    outline: 1px solid var(--texto55);
    outline-offset: -1px;
  }
  .link-texto:hover {
    color: var(--texto100);
    text-decoration: underline;
  }
  .aba-atributo:hover {
    background: var(--superficie-elevada);
  }
  .opcao-segmentada:not([aria-current]):hover {
    background: var(--superficie-elevada);
    color: var(--texto100);
  }
}
/* ===== FIM ESTADO NO DESKTOP ===== */
```

- [ ] **Step 4: verificar** — `npx vitest run src/app/__tests__/controles-com-estado.test.ts`.

### Task 1.2: O card responde

**Files:** `src/design-system/componentes/CardEntrada.tsx` · Test: `card.test.ts`

- [ ] **Step 1: teste**

```ts
  it('o card com destino responde ao mouse e ao teclado (auditoria de UX para web)', () => {
    // O maior alvo de clique do produto não tinha estado nenhum: só o card em
    // MODO FIRE reagia, porque `.card-modo-fire` existe desde a identidade 03.
    const com = render({ ...base, linha: 20, detalheHref: '/apito/x' })
    expect(com).toMatch(/<div class="[^"]*card-alvo/)
    const sem = render({ ...base, linha: 20 })
    expect(sem).not.toContain('card-alvo')
    // o nome e as abas também
    expect(render({ ...base, linha: 20, jogadorHref: '/j/1' })).toContain('link-texto')
    const comAbas = render({
      ...base,
      linha: 20,
      atributos: [{ atributo: 'PONTOS', linha: 20, ativo: true, href: '/a' }],
    })
    expect(comAbas).toContain('aba-atributo')
  })
```

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: o componente.** O `<div>` externo já recebe `className` do modo fire;
      passa a compor as duas:

```tsx
  const classesDoCard = [props.modoFire ? 'card-modo-fire' : '', props.detalheHref ? 'card-alvo' : '']
    .filter(Boolean)
    .join(' ')
```
      e `className={classesDoCard || undefined}`.
      O `<Link>` do nome ganha `className="link-texto"`; cada `<Link>` de aba ganha
      `className="aba-atributo"`.

- [ ] **Step 4: verificar** — `npx vitest run src/design-system/__tests__/card.test.ts`.

### Task 1.3: Seletor segmentado, lentes e abas de conferência

**Files:** `src/components/navegacao/CabecalhoTela.tsx` (`Opcao`, ~249),
`src/components/lateral/ClassificacaoCompacta.tsx`

- [ ] `Opcao` — o `<button>`/`<a>` ganha `className="opcao-segmentada"`. O `aria-current`
      que já existe é o que o `:not([aria-current])` do CSS lê.
- [ ] `ClassificacaoCompacta` — cada aba de conferência acrescenta `opcao-segmentada` às
      classes do módulo que já tem: `` className={`${estilos.aba} ${i === ativa ? estilos.abaAtiva : ''} opcao-segmentada`} ``.
- [ ] **Verificar** — `npx vitest run src/app/__tests__/navegacao.test.ts src/components/lateral`.

### Task 1.4: Os links de texto das telas

**Files:** `src/app/(app)/estatisticas/page.tsx`, `.../estatisticas/time/[id]/page.tsx`,
`.../estatisticas/jogador/[id]/page.tsx`, `.../gestao/page.tsx`,
`src/components/lateral/ClassificacaoCompacta.tsx` (o "Ver completa" já tem `estilos.link`),
`src/components/lateral/UltimaNoite.tsx` ("Ver a noite")

- [ ] Em cada `<Link>` de navegação textual (time, dia anterior/seguinte, análise do apito
      na Gestão, nome de jogador em tabela), acrescentar `className="link-texto"`. Onde já
      houver `className` de módulo, compor: `` className={`${estilos.link} link-texto`} ``.
- [ ] **Teste de teto**, em `telas-04-lista.test.ts`, `telas-04-estatisticas.test.ts` e
      `telas-05-gestao.test.ts` — cada um já renderiza a tela:

```ts
  it('a maior parte do que se clica responde ao mouse (auditoria de UX para web)', async () => {
    const html = await renderizar()
    const corpo = html.replace(/<nav aria-label="Seções do app[\s\S]*?<\/nav>/g, '')
    const tags = corpo.match(/<(?:a|button|summary)\b[^>]*>/g) ?? []
    const sem = tags.filter((t) => !t.includes('class='))
    // `<summary>` de <details> nativo é a exceção aceita: ele é o próprio
    // controle do disclosure e o browser já o marca.
    const semSummary = sem.filter((t) => !t.startsWith('<summary'))
    expect(
      semSummary.length / tags.length,
      `${semSummary.length} de ${tags.length} sem estado:\n${semSummary.slice(0, 8).join('\n')}`,
    ).toBeLessThan(0.12)
  }, 60_000)
```

- [ ] **Verificar** — as três suítes verdes.

### Fase 1 · verificação

`npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 2 · Largura e o título do gráfico

### Task 2.1: A análise do apito e os planos ganham a coluna larga

**Files:** `src/app/(app)/apito/[jogadorId]/page.tsx`, `src/app/(app)/assinar/page.tsx`

- [ ] **Step 1: testes**

```ts
// telas-04-detalhe.test.ts
  it('a análise usa a coluna de DADO, não a de leitura (auditoria de UX para web)', async () => {
    // 640 num monitor de 1440 é 37% da largura, e o que está espremido é
    // tabela: dez jogos em barras, três linhas com odd, três casas.
    expect(await renderizar()).toContain('--largura-coluna:1120px')
  }, 60_000)
```
```ts
// planos-assinar.test.tsx
  it('os planos saem lado a lado no desktop', async () => {
    const html = await renderizar()
    expect(html).toContain('--largura-coluna:1120px')
    expect(html).toContain('grade-planos')
  })
```

- [ ] **Step 2:** `apito/[jogadorId]/page.tsx` — `<Moldura aba={null} largura="dados">`.
- [ ] **Step 3:** `assinar/page.tsx` — `largura="dados"`; o `<div style={{display:'grid', gap:14}}>`
      dos planos (~76) ganha `className="grade-planos"`, e `globals.css`:

```css
/* Os três planos lado a lado quando há largura; empilhados abaixo de 900. */
@media (min-width: 900px) {
  .grade-planos {
    grid-template-columns: repeat(3, 1fr);
    align-items: start;
  }
}
```

- [ ] **Step 4:** conferir que `como-funciona`, `entrar`, `cadastrar` e
      `retorno/mercadopago` **continuam** sem `largura` (640): prosa e formulário.
- [ ] **Verificar** — `npx vitest run src/app/__tests__/telas-04-detalhe.test.ts src/app/__tests__/planos-assinar.test.tsx`.

### Task 2.2: "ÚLTIMOS {n}"

**Files:** `src/app/(app)/apito/[jogadorId]/page.tsx` (~519)

- [ ] **Step 1: teste** — com uma série de 8, o título diz `ÚLTIMOS 8`.
- [ ] **Step 2:** o título passa a ser calculado do mesmo array que vai para
      `FormaNoAtributo` (que já faz `jogos.slice(-COLUNAS)`), com `COLUNAS = 10`:

```tsx
  const forma = /* o array que hoje é passado ao FormaNoAtributo */
  const exibidos = Math.min(forma.length, 10)
  // O título dizia sempre "ÚLTIMOS 10". Quem tem menos de dez jogos conferidos
  // lia um título que mente — e o gráfico ao lado já contava a verdade
  // ("bateu 3 de 8").
  const tituloDaForma = `FORMA NO ATRIBUTO · ${exibidos === 1 ? 'ÚLTIMO 1' : `ÚLTIMOS ${exibidos}`}`
```

- [ ] **Verificar** — `npx vitest run src/app/__tests__/telas-04-detalhe.test.ts`.

### Fase 2 · verificação

`npm run typecheck && npm run lint && npm test`

---

# Fase 3 · Gestão

### Task 3.1: "Registrei" secundário

**Files:** `src/app/(app)/gestao/page.tsx` · Test: `telas-05-gestao.test.ts`

- [ ] **Step 1: teste** — nenhum `Registrei` com `botao-primario`; "Aplicar" com ele.
- [ ] **Step 2:** o `<button>` do Registrei troca `className="botao-primario"` por
      `className="botao-secundario"`. Comentário: "37 primários não são primário nenhum;
      o primário da Gestão é Aplicar, que se faz uma vez."
- [ ] **Verificar.**

### Task 3.2: As entradas sugeridas agrupam por jogo

**Files:** `src/app/(app)/gestao/page.tsx`, `src/modules/entrega/gestao.ts` (só se o item
não carregar `jogoId`) · Test: `telas-05-gestao.test.ts`

- [ ] **Step 1: teste**

```ts
  it('as entradas sugeridas agrupam por jogo, como a Lista (auditoria de UX para web)', async () => {
    const html = await renderizar()
    const cabecalhos = (html.match(/jogo-times-frio/g) ?? []).length
    expect(cabecalhos).toBeGreaterThan(1)
    // e nenhuma linha se perdeu no caminho
    const linhas = (html.match(/Registrei/g) ?? []).length
    expect(linhas).toBe(plano.sugeridas.length)
  }, 60_000)
```

- [ ] **Step 2:** conferir se `EntradaDoPlano` já traz `jogoId` e o confronto. Se não
      trouxer, **parar e reavaliar**: enriquecer a leitura da Gestão é mudança de entrega,
      não de tela, e a spec disse que nada de dado muda. Alternativa sem tocar na entrega:
      agrupar por TIME do jogador, que o item já carrega.
- [ ] **Step 3:** agrupar e renderizar com o `CabecalhoJogo` da Lista, mantendo a ordem
      interna (maior aporte primeiro).
- [ ] **Verificar.**

### Task 3.3: O nível do jogador escrito na linha

**Files:** `src/app/(app)/gestao/page.tsx` · Test: `telas-05-gestao.test.ts` e um
transversal novo

- [ ] **Step 1: teste**

```ts
  it('a linha escreve o nível do jogador — a faixa colorida não pode ser o único sinal', async () => {
    const html = await renderizar()
    const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(texto).toMatch(/(MVP|All Star|Suporte|Randola) · [A-Z]{3} ·/)
  }, 60_000)
```
      e o transversal, em `src/design-system/__tests__/tokens.test.ts`:

```ts
  it('onde uma TELA pinta com o metálico do nível, ela também escreve o nível', () => {
    // A redundância textual é cobrada no design system desde a identidade 02;
    // a Gestão mostrava o nível só em cor. Quem não distingue as cores não lia.
    for (const { arquivo, conteudo } of arquivosDeUi(['src/app'])) {
      if (!/NIVEL_JOGADOR\[[^\]]+\]\.cor/.test(semComentarios(conteudo))) continue
      expect(conteudo, `${arquivo} pinta com o metálico e não escreve o rótulo`).toMatch(
        /\.rotulo\b/,
      )
    }
  })
```

- [ ] **Step 2:** a linha de apoio passa a `` `${nivel.rotulo} · ${item.timeSigla} · …` ``.
- [ ] **Verificar.**

### Fase 3 · verificação

`npm run typecheck && npm run lint && npm test`

---

# Fase 4 · Randola e o grátis

### Task 4.1: O rótulo do Randola a 70%

**Files:** `src/design-system/tokens/semantico.ts`, `.../css.ts` · Test: `tokens.test.ts`

- [ ] **Step 1: teste**

```ts
  it('o rótulo do Randola não é o mais berrante da tela', () => {
    // Branco cheio dá 14,56 no pior caso; ouro 7,52, prata 7,09, bronze 5,45.
    // O nível MENOS importante renderizava com o dobro do peso do segundo mais
    // importante. A 70% ele dá 7,86: continua o mais claro, sai de outlier.
    const r = pior(NIVEL_JOGADOR.RANDOLA.cor)
    expect(r).toBeGreaterThanOrEqual(AA.texto)
    expect(r).toBeLessThan(pior(NIVEL_JOGADOR.MVP.cor) * 1.5)
  })
```
      (`pior` já existe no describe da identidade 06; mover para o escopo do arquivo se
      preciso. Atenção: a cor passa a ser `rgba`, então `pior` precisa compor sobre a
      superfície antes de medir — acrescentar essa composição ao helper.)

- [ ] **Step 2:** `semantico.nivelRandolaTexto = p.brancoVeu70`; `NIVEL_JOGADOR.RANDOLA.cor`
      passa a ler dele. A MOLDURA do Randola continua em `brancoVeu55`.
- [ ] **Step 3:** `npm run tokens`.
- [ ] **Verificar** — `npx vitest run src/design-system`.

### Task 4.2: A faixa de plano repetida no grátis

**Files:** `src/app/(app)/page.tsx` · Test: `telas-05-gratis.test.ts`

- [ ] **Step 1: teste** — na Lista do grátis a faixa aparece duas vezes, e a segunda depois
      do terceiro `CabecalhoJogo`.
- [ ] **Step 2:** no `map` dos jogos do grátis, depois do índice 2, inserir um
      `<ConviteDoPlano variante="faixa" …>` com o mesmo `titulo` da lateral. UMA vez: o
      convite a cada bloco vira anúncio.
- [ ] **Verificar.**

### Fase 4 · verificação

`npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 5 · Fechamento

### Task 5.1: Bateria e captura

- [ ] `df -h /`; `npm run typecheck && npm run lint && npm run boundaries && npm test`.
- [ ] `CAPTURA_LARGURAS=1024,1280,1440,1600 CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2400 telas-` → sem rolagem horizontal.
- [ ] `CAPTURA_LARGURAS=320,390,768 …` → **igual ao de antes**: nada abaixo de 1024 muda.
- [ ] Olhar a 1440: a análise do apito com a coluna larga, `/assinar` com os três planos
      lado a lado, a Gestão agrupada, a Lista com os rótulos de nível equilibrados.

### Task 5.2: Doc

- [ ] `docs/04-design-system.md` — seção "Estado no desktop" (as quatro classes novas e a
      regra "estado sim, cor de base não") e a nota do Randola a 70% na seção da 06.

### Task 5.3: Passo manual na preview (o que o arnês não hidrata)

- [ ] Hover no card, no nome, na aba, no seletor de lente, num link de time.
- [ ] Tab pela Lista: o card inteiro recebe o anel do app ao focar a cobertura.
- [ ] Anotar o resultado na mensagem do commit; se não for executado, dizer isso.

### Task 5.4: Commit único

- [ ] `git status` — os arquivos das tarefas acima MAIS a spec e este plano (não foram
      commitados antes, por pedido do parceiro).
- [ ] Um commit só, sem push, sem PR.

---

## Auto-revisão do plano

**Cobertura da spec:** §4.1 → Tasks 1.1–1.4. §4.2 → 2.1. §4.3 → 2.2. §4.4 → 3.1. §4.5 →
3.2. §4.6 → 3.3. §4.7 → 4.1. §4.8 → 4.2. §6 → 5.1 e 5.3. §5 (doc) → 5.2.

**Placeholders:** nenhum "TBD". A Task 3.2 tem um ponto de decisão explícito (se
`EntradaDoPlano` não trouxer `jogoId`), com a alternativa escrita — isso é uma bifurcação
conhecida, não um buraco.

**Consistência:** as quatro classes nascem na 1.1 e são consumidas em 1.2, 1.3, 1.4 e 2.1
com os mesmos nomes. `nivelRandolaTexto` nasce na 4.1 e só é lido em `css.ts`. O helper
`pior` da 4.1 é o do describe da identidade 06, e o plano avisa que ele precisa compor o
rgba sobre a superfície.
