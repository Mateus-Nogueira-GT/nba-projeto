# Correções de UX no desktop — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os dezoito defeitos de desktop que a auditoria de 19/09 encontrou na Identidade 05 — três regressões da própria passada e quinze comportamentos que só a tela a 1024+ revelou — sem reabrir nenhuma decisão de identidade.

**Architecture:** Sete fatias em ordem de dependência: (1) quatro classes globais com `:hover`/`:focus-visible` que passam a ser donas das CORES dos controles (a geometria continua embutida) — é o alfabeto que as regressões usam; (2) as três regressões (texto branco em fundo branco, clique morto no número de confiança, "Sair" como primário); (3) filtros do desktop (fechar ao clicar fora, menu da direita, limpar, rótulo composto); (4) moldura e esqueleto (barra do topo em toda tela, lateral no esqueleto, botão flutuante); (5) lateral (doca por clique, Estatísticas com lateral, âncora, concordância, tabela acessível); (6) Fire Live e jogador; (7) bateria, captura, passo manual, commit único. Nenhum token novo, nenhuma leitura nova, motor intocado.

**Tech Stack:** Next.js 16.3 App Router (server components + `'use client'` pontuais, CSS Modules, `globals.css` lendo `tokens.css`), React 19, Vitest com `renderToStaticMarkup` (sem jsdom: comportamento de clique é provado por asserção de fonte + passo manual na preview), Chrome headless via CDP para captura.

**Spec:** [`docs/superpowers/specs/2026-09-19-correcoes-ux-desktop-identidade-05-design.md`](../specs/2026-09-19-correcoes-ux-desktop-identidade-05-design.md) · **Irmã:** [`plano de lógica`](2026-09-19-correcoes-logica-identidade-05.md) — os dois podem rodar na mesma branch; este vai primeiro porque muda mais arquivos.

## Global Constraints

- **Domínio em português, infraestrutura em inglês.** Classes CSS, props e testes em português.
- **O motor não muda.** Nada em `src/modules/motor/**`. `npm run boundaries` continua verde.
- **Nenhuma decisão de identidade reabre** (spec §3.1). Azul só preenchimento; vermelho cheio no selo; Bebas nos números; três regiões; silhuetas. O teste "azul nunca é tinta" (`src/design-system/__tests__/tokens.test.ts`) continua verde em toda tarefa.
- **A classe é dona da cor; o embutido é dono da geometria** (spec §4.15). Um controle que ganha `.botao-primario`, `.botao-secundario`, `.pilula-nav` ou `.chip-filtro` PERDE `background`, `color` e `border` embutidos — estilo embutido vence classe, e o hover nunca apareceria. Padding, fonte, raio e largura continuam onde estão.
- **Nada de hex fora de `primitivo.ts`.** As classes novas leem `var(--…)` de `tokens.css`. Não há token novo: `--cta-fundo`, `--cta-fundo-hover`, `--cta-texto`, `--foco`, `--acento`, `--texto-sobre-acento`, `--texto-secundario`, `--texto100`, `--texto-primario`, `--superficie-elevada`, `--divisor` já existem.
- **Primário é UMA ação por tela** (spec §3.2). "Sair" é secundário. "Ver na casa parceira" segue azul cheio — decisão do parceiro, fora deste plano.
- **Só desktop (≥ 1024).** Nenhuma regra abaixo de 1024 muda; a captura em 320 e 390 tem que sair igual à de antes.
- **Nomes das classes:** `botao-primario` e `botao-secundario` — NÃO `acao-primaria`/`acao-secundaria`: esses nomes já existem em `globals.css` sob `.oferta-publica`, com outra paleta, e uma classe global com o mesmo nome herdaria a regra escopada.
- **Verificação de cada tarefa:** `npx vitest run <alvos>`; **ao fim de cada fase:** `npm run typecheck && npm run lint && npm run boundaries && npm test`; ao fim da fase 6, captura em 1024, 1280 e 1440.
- **Um commit só, no final** (preferência do parceiro, MEMORY.md). A Task 7.3 commita. Sem push, sem PR. Nunca commitar em `main`; a branch é `correcoes-ux-desktop-05` no worktree `nba-projeto-ux` (Task 0.1).
- **Disco:** antes de suíte, build ou captura, `df -h /`; abaixo de 3 GB, limpar `.next/` e os caches listados em MEMORY.md (`disco-cheio-mac`).

## Captura

```bash
CAPTURA_LARGURAS=1024,1280,1440 CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-
```

O arnês sai com 1 se houver rolagem horizontal. As capturas de 19/09 que a auditoria produziu (menu aberto, grátis nas Estatísticas, detalhe a 1440) não estão no arnês — o passo manual da Task 7.2 cobre.

---

# Fase 0 · Preparação

### Task 0.1: Worktree e os documentos

**Files:**
- Create: worktree `../nba-projeto-ux` na branch `correcoes-ux-desktop-05`
- Copy: as duas specs e os dois planos de 19/09 (estão sem commit no tree principal)

- [ ] **Step 1: Criar o worktree a partir de `main`**

```bash
cd /Users/mateusnascimentonogueiradasilva/nba-projeto
git worktree add ../nba-projeto-ux -b correcoes-ux-desktop-05 main
cp docs/superpowers/specs/2026-09-19-*.md ../nba-projeto-ux/docs/superpowers/specs/
cp docs/superpowers/plans/2026-09-19-*.md ../nba-projeto-ux/docs/superpowers/plans/
cd ../nba-projeto-ux
# Cópia por hard link, NÃO symlink: o Turbopack do `next build` não resolve
# `node_modules` simbólico (lição da Identidade 05).
cp -al ../nba-projeto/node_modules node_modules
```

- [ ] **Step 2: Provar que a suíte roda no worktree**

Run: `df -h / && npx vitest run src/app/__tests__/navegacao.test.ts --reporter=dot`
Expected: verde.

---

# Fase 1 · O alfabeto: classes com estado

### Task 1.1: As quatro classes em `globals.css`

**Files:**
- Modify: `src/app/globals.css`
- Test: `src/app/__tests__/controles-com-estado.test.ts` (novo)

- [ ] **Step 1: Escrever o teste de fonte**

```ts
// src/app/__tests__/controles-com-estado.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * CORREÇÕES UX 19/09, §4.15 — estilo embutido não tem :hover. As cores dos
 * controles com estado moram em quatro classes globais; este teste garante
 * que elas existem, têm hover e foco, e leem só tokens.
 */
const css = readFileSync('src/app/globals.css', 'utf8')

const CLASSES = ['botao-primario', 'botao-secundario', 'pilula-nav', 'chip-filtro'] as const

describe('controles com estado (correções UX 19/09)', () => {
  it.each(CLASSES)('.%s tem hover e foco visível', (classe) => {
    expect(css).toMatch(new RegExp(`\\.${classe}(?:[^{]*)?:hover\\s*\\{`))
    expect(css).toMatch(new RegExp(`\\.${classe}:focus-visible\\s*\\{[^}]*outline:\\s*var\\(--foco\\)`))
  })

  it('o hover vive atrás de (hover: hover): tela de toque não fica com o estado preso', () => {
    const blocosHover = css.match(/@media \(hover: hover\)\s*\{[\s\S]*?\n\}/g) ?? []
    for (const classe of CLASSES) {
      expect(blocosHover.some((b) => b.includes(`.${classe}`)), classe).toBe(true)
    }
  })

  it('as classes só leem tokens — nenhum hex', () => {
    const inicio = css.indexOf('/* ===== CONTROLES COM ESTADO')
    expect(inicio).toBeGreaterThan(-1)
    const trecho = css.slice(inicio, css.indexOf('/* ===== FIM CONTROLES COM ESTADO'))
    expect(trecho).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('o primário é o botão do manual: fundo do CTA, hover mais claro, texto branco', () => {
    expect(css).toMatch(/\.botao-primario\s*\{[^}]*background:\s*var\(--cta-fundo\)/)
    expect(css).toMatch(/\.botao-primario:hover\s*\{[^}]*background:\s*var\(--cta-fundo-hover\)/)
    expect(css).toMatch(/\.botao-primario\s*\{[^}]*color:\s*var\(--cta-texto\)/)
  })

  it('pílula e chip ativos são PREENCHIDOS no acento; inativos, transparentes', () => {
    expect(css).toMatch(/\.pilula-nav-ativa\s*\{[^}]*background:\s*var\(--acento\)/)
    expect(css).toMatch(/\.chip-filtro-ativo\s*\{[^}]*background:\s*var\(--acento\)/)
    expect(css).toMatch(/\.pilula-nav\s*\{[^}]*background:\s*transparent/)
    expect(css).toMatch(/\.chip-filtro\s*\{[^}]*background:\s*transparent/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/__tests__/controles-com-estado.test.ts`
Expected: vermelho — nenhuma das classes existe.

- [ ] **Step 3: Acrescentar o bloco ao fim de `globals.css`**

```css
/* ===== CONTROLES COM ESTADO (correções UX 19/09, §4.15) =====

   Estilo embutido não tem :hover nem :focus-visible. As CORES dos controles
   que mudam de estado moram aqui; a geometria (padding, fonte, raio, largura)
   continua embutida em cada um. Quem usa uma destas classes NÃO escreve
   background, color nem border embutidos — o embutido venceria a classe e o
   hover nunca apareceria.

   Só tokens: nenhum hex aqui. O hover fica atrás de (hover: hover) para a
   tela de toque não ficar com o estado preso depois do toque. */

/* O botão primário do manual: azul chapado, hover mais claro, texto branco. */
.botao-primario {
  background: var(--cta-fundo);
  color: var(--cta-texto);
  border: 1px solid transparent;
}
.botao-primario:focus-visible {
  outline: var(--foco);
  outline-offset: 2px;
}

/* Sair, cancelar, voltar: contorno na divisória, texto branco. */
.botao-secundario {
  background: transparent;
  color: var(--texto-primario);
  border: 1px solid var(--divisor);
}
.botao-secundario:focus-visible {
  outline: var(--foco);
  outline-offset: 2px;
}

/* As pílulas das duas barras. A ativa é preenchida no acento (identidade 05);
   o `aria-current` acompanha, e a classe modificadora é o que o CSS lê. */
.pilula-nav {
  background: transparent;
  color: var(--texto-secundario);
}
.pilula-nav-ativa {
  background: var(--acento);
  color: var(--texto-sobre-acento);
}
.pilula-nav:focus-visible {
  outline: var(--foco);
  outline-offset: 2px;
}

/* O chip de filtro, nos menus do desktop e na folha do celular. */
.chip-filtro {
  background: transparent;
  color: var(--texto-secundario);
  border: 1.5px solid var(--divisor);
}
.chip-filtro-ativo {
  background: var(--acento);
  color: var(--texto-sobre-acento);
  border-color: transparent;
}
.chip-filtro:focus-visible {
  outline: var(--foco);
  outline-offset: 2px;
}

@media (hover: hover) {
  .botao-primario:hover {
    background: var(--cta-fundo-hover);
  }
  .botao-secundario:hover {
    background: var(--superficie-elevada);
  }
  .pilula-nav:not(.pilula-nav-ativa):hover {
    background: var(--superficie-elevada);
    color: var(--texto100);
  }
  .chip-filtro:not(.chip-filtro-ativo):hover {
    background: var(--superficie-elevada);
    color: var(--texto100);
  }
}
/* ===== FIM CONTROLES COM ESTADO ===== */
```

- [ ] **Step 4: Rodar o teste novo e o de tinta**

Run: `npx vitest run src/app/__tests__/controles-com-estado.test.ts src/design-system/__tests__/tokens.test.ts`
Expected: verde nos dois — `background: var(--acento)` é preenchimento, o teste de tinta aceita.

### Task 1.2: As pílulas das duas barras vestem `.pilula-nav`

**Files:**
- Modify: `src/components/navegacao/BarraTopo.tsx`
- Modify: `src/components/navegacao/BarraInferior.tsx`
- Modify: `src/app/__tests__/navegacao.test.ts` (o teste "a aba ativa é uma pílula PREENCHIDA…")

- [ ] **Step 1: Atualizar o teste da pílula ativa**

Em `navegacao.test.ts`, o teste `'a aba ativa é uma pílula PREENCHIDA no acento, com texto branco e aria-current'` troca as duas asserções de estilo embutido:

```ts
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'fire-live' }))
    expect(html).toContain('aria-current="page"')
    // A cor saiu do embutido e mora na classe (correções UX 19/09): é o que
    // dá hover à pílula. A ativa leva a modificadora; o CSS global preenche.
    expect(html).toMatch(/class="pilula-nav pilula-nav-ativa"[^>]*aria-current="page"/)
    expect(html).not.toContain(`background:${componente.pilulaNav.fundoAtiva}`)
    // uma pílula acesa, e uma só
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html.match(/pilula-nav-ativa/g)).toHaveLength(1)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/__tests__/navegacao.test.ts -t "pílula PREENCHIDA"`
Expected: vermelho.

- [ ] **Step 3: `BarraTopo.tsx` — classe no lugar das duas cores**

No `<Link>` de cada aba, ANTES de `aria-current`, acrescentar `className`; e no `style`, remover as duas últimas linhas (`background` e `color`):

```tsx
            <Link
              key={aba.id}
              href={aba.href}
              className={`pilula-nav${ativo ? ' pilula-nav-ativa' : ''}`}
              aria-current={ativo ? 'page' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: componente.pilulaNav.raio,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                fontFamily: semantico.fonteRotulo,
                fontSize: 12,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 600,
                // A cor mora na classe `.pilula-nav` (globals.css): é o que dá
                // hover e foco à pílula. Aqui fica só a geometria.
              }}
            >
```

- [ ] **Step 4: `BarraInferior.tsx` — o mesmo**

No `<Link>` da aba, acrescentar `className={`pilula-nav${ativo ? ' pilula-nav-ativa' : ''}`}` antes de `aria-current`; no `style`, remover `background: ativo ? … : 'transparent'` e `color: ativo ? … : …` (e o comentário "Redundância…" fica).

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/app/__tests__/navegacao.test.ts src/app/__tests__/carregamento.test.ts src/app/__tests__/chat-botao.test.ts && npm run typecheck`
Expected: verde. `componente.pilulaNav.fundoAtiva/textoAtiva/textoInativa` deixam de ser importados nas barras — se o lint acusar import sem uso de `componente` em `BarraInferior`, `componente.pilulaNav.raio` ainda o usa; confirmar.

### Task 1.3: `Chip` veste `.chip-filtro`

**Files:**
- Modify: `src/components/navegacao/Chip.tsx`

- [ ] **Step 1: Trocar as cores por classe**

```tsx
export function Chip({
  href,
  ativo,
  children,
}: {
  href: string
  ativo: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className={`chip-filtro${ativo ? ' chip-filtro-ativo' : ''}`}
      aria-current={ativo ? 'page' : undefined}
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        fontWeight: ativo ? 700 : 600,
        // Cor, borda e preenchimento moram em `.chip-filtro` (globals.css):
        // é o que dá hover ao chip. Aqui fica só a geometria.
      }}
    >
      {children}
    </Link>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `npx vitest run src/app/__tests__/navegacao.test.ts src/app/__tests__/telas-04-lista.test.ts src/app/__tests__/telas-galeria.test.ts && npm run lint`
Expected: verde. Se algum teste afirmava `background:${semantico.acento}` num chip, a asserção passa a ser `class="chip-filtro chip-filtro-ativo"`.

### Task 1.4: Os CTAs vestem `.botao-primario`

**Files:**
- Modify: `src/app/(app)/entrar/formulario.tsx` (~74), `src/app/(app)/cadastrar/formulario.tsx` (~74), `src/app/(app)/assinar/page.tsx` (~135), `src/app/(app)/apito/[jogadorId]/page.tsx` (~751), `src/app/(app)/conta/blocos.tsx` (`ESTILO_BOTAO_PRINCIPAL` ~51, `ESTILO_BOTAO_SECUNDARIO_ACENTO` ~66, link "Assinar" ~408), `src/components/planos/ConviteDoPlano.tsx` (~111)
- Modify: `src/app/__tests__/controles-com-estado.test.ts`

- [ ] **Step 1: Estender o teste de fonte**

```ts
import { readFileSync } from 'node:fs'
// …

const CTAS = [
  'src/app/(app)/entrar/formulario.tsx',
  'src/app/(app)/cadastrar/formulario.tsx',
  'src/app/(app)/assinar/page.tsx',
  'src/app/(app)/apito/[jogadorId]/page.tsx',
  'src/app/(app)/conta/blocos.tsx',
  'src/components/planos/ConviteDoPlano.tsx',
]

describe('os CTAs usam a classe, não o token embutido', () => {
  it.each(CTAS)('%s não escreve background: componente.ctaFundo', (arquivo) => {
    const fonte = readFileSync(arquivo, 'utf8')
    expect(fonte).not.toContain('background: componente.ctaFundo')
    expect(fonte).toContain('botao-primario')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/controles-com-estado.test.ts` → seis vermelhos.

- [ ] **Step 3: `entrar/formulario.tsx` e `cadastrar/formulario.tsx`** (idênticos nesse trecho)

```tsx
      <button
        type="submit"
        disabled={enviando}
        className="botao-primario"
        style={{
          ...campo,
          fontFamily: semantico.fonteTitulo,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
```

Atenção: `campo` traz `border` e `background` (é o estilo do input). Como o spread vem antes e a classe não vence embutido, remover ANTES do spread: `const { border: _b, background: _f, color: _c, ...geometria } = campo` no topo do componente e usar `...geometria` no botão. Se `campo` for `as const` sem `border`, ignorar a desestruturação.

- [ ] **Step 4: `assinar/page.tsx` (~126)**

```tsx
                  <button
                    type="submit"
                    className="botao-primario"
                    style={{
                      width: '100%',
                      display: 'grid',
                      gap: 4,
                      borderRadius: 10,
                      padding: 13,
                      fontFamily: semantico.fonteTitulo,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
```

(`border: 0` sai — a classe põe `1px solid transparent`; o `background` e o `color` saem.)

- [ ] **Step 5: `apito/[jogadorId]/page.tsx` (~743)**

```tsx
      <Link
        href={rotaDoJogador(principal.jogadorId)}
        className="botao-primario"
        style={{
          display: 'block',
          marginTop: 24,
          padding: 14,
          borderRadius: 12,
          textAlign: 'center',
          fontFamily: semantico.fonteTitulo,
          fontSize: 16,
          letterSpacing: 1,
          textTransform: 'uppercase',
          textDecoration: 'none',
        }}
      >
        VER ESTATÍSTICAS
```

- [ ] **Step 6: `conta/blocos.tsx`**

`ESTILO_BOTAO_PRINCIPAL` perde `border`, `background` e `color`; `ESTILO_BOTAO_SECUNDARIO_ACENTO` idem (o nome fica, o comentário passa a dizer "Trocar senha / trocar e-mail: a ação primária do próprio formulário — cor pela classe"). Todo `<button style={ESTILO_BOTAO_PRINCIPAL}>` e `<button style={ESTILO_BOTAO_SECUNDARIO_ACENTO}>` ganha `className="botao-primario"`. O `<Link href="/assinar">` (~400) perde `background` e `color` e ganha `className="botao-primario"`.

- [ ] **Step 7: `ConviteDoPlano.tsx`** — o `<Link>` "Ver os planos" do compacto perde `background: componente.ctaFundo` e `color: componente.ctaTexto` e ganha `className="botao-primario"`. O botão BRANCO da faixa NÃO muda (é branco sobre azul, decisão de §5 da Identidade 05).

- [ ] **Step 8: Verificar**

Run: `npx vitest run src/app/__tests__/controles-com-estado.test.ts src/app/__tests__/telas-05-conta.test.ts src/app/__tests__/telas-04-detalhe.test.ts src/app/__tests__/planos-assinar.test.tsx src/app/__tests__/telas-05-gratis.test.ts src/app/(app)/entrar && npm run typecheck && npm run lint`
Expected: verde. Se `componente` ficar sem uso em `entrar/formulario.tsx` ou `cadastrar/formulario.tsx`, remover o import.

### Task 1.5: Hover no chip-menu e na estrela (CSS Modules)

**Files:**
- Modify: `src/components/navegacao/FolhaDeFiltros.module.css`
- Modify: `src/components/preferencias/BotaoAcompanharJogador.module.css`

- [ ] **Step 1: `FolhaDeFiltros.module.css`** — depois do bloco `.chipMenu > summary:focus-visible`:

```css
@media (hover: hover) {
  .chipMenu > summary:hover {
    background: var(--superficie-elevada);
    color: var(--texto100);
  }
}
```

- [ ] **Step 2: `BotaoAcompanharJogador.module.css`** — depois de `.estrela:focus-visible`:

```css
@media (hover: hover) {
  .estrela:not(:disabled):hover {
    border-color: var(--texto-secundario);
    color: var(--texto100);
  }
}
```

- [ ] **Step 3: Acrescentar ao teste de fonte** (`controles-com-estado.test.ts`):

```ts
describe('hover nos módulos', () => {
  it('chip-menu e estrela têm :hover atrás de (hover: hover)', () => {
    const folha = readFileSync('src/components/navegacao/FolhaDeFiltros.module.css', 'utf8')
    const estrela = readFileSync('src/components/preferencias/BotaoAcompanharJogador.module.css', 'utf8')
    expect(folha).toMatch(/\.chipMenu > summary:hover/)
    expect(estrela).toMatch(/\.estrela:not\(:disabled\):hover/)
  })
})
```

Run: `npx vitest run src/app/__tests__/controles-com-estado.test.ts` → verde.

### Fase 1 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`
Expected: tudo verde.

---

# Fase 2 · As três regressões

### Task 2.1: Texto branco sobre fundo branco — o teste-par de "azul nunca é tinta"

**Files:**
- Modify: `src/design-system/__tests__/tokens.test.ts` (novo `it` no `describe('identidade 05 — manual da marca')`)

- [ ] **Step 1: Escrever o teste**

Abaixo de `'azul nunca é tinta…'`:

```ts
  it('texto branco só senta em fundo que o justifica: acento, selo vivo ou CTA (correções UX 19/09)', () => {
    // A Identidade 05 trocou `textoSobreCor` por `textoSobreAcento` em lote
    // assumindo fundo azul. Cinco botões tinham fundo BRANCO (`textoPrimario`)
    // ou verde — texto invisível. Este é o par do teste acima: lá, o azul não
    // pode ser tinta; aqui, a tinta branca não pode sentar num fundo claro.
    const TINTA_BRANCA = /color:\s*(semantico\.textoSobreAcento|componente\.ctaTexto)\b/g
    const FUNDO_QUE_JUSTIFICA =
      /background:[^,\n]*(semantico\.acento(?:Claro)?|semantico\.vivoSelo|componente\.ctaFundo|componente\.pilulaNav\.fundoAtiva|componente\.contextoQuente|componente\.statusCiclo)/

    /** O objeto de estilo em volta de um índice: do `{` aberto mais próximo ao `}` que o fecha. */
    const blocoEmVolta = (fonte: string, indice: number): string => {
      let profundidade = 0
      let inicio = indice
      for (; inicio >= 0; inicio--) {
        const c = fonte[inicio]
        if (c === '}') profundidade++
        else if (c === '{') {
          if (profundidade === 0) break
          profundidade--
        }
      }
      profundidade = 0
      let fim = indice
      for (; fim < fonte.length; fim++) {
        const c = fonte[fim]
        if (c === '{') profundidade++
        else if (c === '}') {
          if (profundidade === 0) break
          profundidade--
        }
      }
      return fonte.slice(Math.max(0, inicio), fim + 1)
    }

    const infratores: string[] = []
    for (const { arquivo, conteudo } of arquivosDeUi([
      'src/design-system/componentes',
      'src/components',
      'src/app',
    ])) {
      const fonte = semComentarios(conteudo)
      for (const achado of fonte.matchAll(TINTA_BRANCA)) {
        const bloco = blocoEmVolta(fonte, achado.index)
        if (!FUNDO_QUE_JUSTIFICA.test(bloco)) infratores.push(`${arquivo}: ${achado[0]}`)
      }
    }
    expect(infratores).toEqual([])
  })
```

- [ ] **Step 2: Rodar e LER a lista de infratores**

Run: `npx vitest run src/design-system/__tests__/tokens.test.ts -t "texto branco só senta"`
Expected: vermelho, com exatamente estes cinco (o Step 3 corrige cada um):

```
src/app/(app)/estatisticas/page.tsx: color: semantico.textoSobreAcento        ← Buscar
src/app/(app)/gestao/page.tsx: color: semantico.textoSobreAcento              ← Registrei
src/app/(app)/gestao/page.tsx: color: ativo ? semantico.textoSobreAcento…    ← seletor de banca
src/app/(app)/gestao/page.tsx: color: semantico.textoSobreAcento              ← Aplicar
src/app/offline/page.tsx: color: semantico.textoSobreAcento                   ← Tentar novamente
```

Se aparecer OUTRO arquivo: é o mesmo defeito (fundo que não é acento com tinta branca) e leva a mesma correção — botão de ação vira `.botao-primario`; texto sobre fundo escuro vira `textoPrimario`; texto sobre cor de dado (verde, laranja) vira `textoSobreCor`. Nunca acrescentar o fundo à lista `FUNDO_QUE_JUSTIFICA` só para o teste passar: a lista é o que o manual autoriza.

### Task 2.2: Buscar, Registrei, Aplicar → `.botao-primario`; banca → `Chip`; offline → `textoSobreCor`

**Files:**
- Modify: `src/app/(app)/estatisticas/page.tsx` (~46), `src/app/(app)/gestao/page.tsx` (~189, ~383–404, ~428), `src/app/offline/page.tsx` (~62)

- [ ] **Step 1: Estatísticas, o botão Buscar (~46)**

```tsx
      <button
        type="submit"
        className="botao-primario"
        style={{
          padding: '10px 16px',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        Buscar
      </button>
```

- [ ] **Step 2: Gestão, o botão Registrei (~189)**

```tsx
          <button
            type="submit"
            className="botao-primario"
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Registrei
          </button>
```

- [ ] **Step 3: Gestão, o seletor de banca (~383) vira `Chip`**

```tsx
            <nav aria-label="Valor da banca" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ATALHOS.map((v) => (
                <Chip key={v} href={`/gestao?banca=${v}`} ativo={v === banca}>
                  {dinheiro(v)}
                </Chip>
              ))}
            </nav>
```

Import: `import { Chip } from '@/components/navegacao'` (se a página já importa de `@/components/navegacao`, acrescentar `Chip` à lista).

- [ ] **Step 4: Gestão, o botão Aplicar (~428)**

```tsx
              <button
                type="submit"
                className="botao-primario"
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Aplicar
              </button>
```

- [ ] **Step 5: Offline (~62)** — só a tinta: `color: semantico.textoSobreCor,` no lugar de `textoSobreAcento`. O fundo verde é COR DE DADO (nível 3) e o texto sobre ele é escuro, como no anel.

- [ ] **Step 6: Verificar**

Run: `npx vitest run src/design-system/__tests__/tokens.test.ts src/app/__tests__/telas-05-gestao.test.ts src/app/__tests__/planos-gestao.test.ts src/app/__tests__/telas-04-estatisticas.test.ts src/app/__tests__/pwa.test.ts && npm run typecheck && npm run lint`
Expected: verde. Se `telas-05-gestao` afirmava `background:${semantico.textoPrimario}` no seletor, a asserção passa a ser `class="chip-filtro chip-filtro-ativo"` na âncora com `aria-current="page"`.

### Task 2.3: O número de confiança volta a abrir a análise

**Files:**
- Modify: `src/design-system/componentes/CardEntrada.tsx` (~434–452)
- Modify: `src/design-system/__tests__/card.test.ts`

- [ ] **Step 1: Escrever o teste**

```ts
  it('só a AÇÃO do canto sobe acima da cobertura — o número de confiança segue abrindo a análise (correções UX 19/09)', () => {
    const html = render({
      ...base,
      detalheHref: '/apito/x',
      acaoCanto: createElement('button', { type: 'button' }, 'estrela'),
    })
    // A coluna do canto NÃO tem z-index: ela cobre o número, e o número é o
    // clique mais natural do card.
    expect(html).toMatch(/align-items:flex-end;gap:6px;flex-shrink:0;align-self:flex-start/)
    expect(html).not.toMatch(/flex-shrink:0;position:relative;z-index:1/)
    // A ação, sim — é o único elemento do canto que não deve abrir a análise.
    expect(html).toMatch(/<span style="position:relative;z-index:1;display:inline-flex"><button type="button">estrela<\/button><\/span>/)
  })
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/design-system/__tests__/card.test.ts -t "só a AÇÃO do canto"`.

- [ ] **Step 3: Mover o `zIndex` para um `<span>` em volta da ação**

Na coluna do canto (~434), remover `position: 'relative'` e `zIndex: 1` e o comentário "Acima da cobertura…"; na linha `{props.acaoCanto}` (~452):

```tsx
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 6,
              flexShrink: 0,
              // Com badge ou ação, a coluna gruda no canto superior (o status
              // fica sempre no mesmo lugar); sem eles, o % centra com o avatar.
              alignSelf: rotuloEstado || props.acaoCanto ? 'flex-start' : 'center',
            }}
          >
            {(rotuloEstado || props.acaoCanto) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {props.acaoCanto && (
                  // SÓ a ação sobe acima da cobertura do card: a estrela
                  // ACOMPANHA o jogador, não abre a análise. O número de
                  // confiança, logo abaixo, continua sob a cobertura — e
                  // clicar nele abre o detalhe, como sempre abriu.
                  <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>
                    {props.acaoCanto}
                  </span>
                )}
```

Atualizar também o comentário da prop `acaoCanto` (~190): "Sobe uma camada (`zIndex: 1`) SOZINHA, num `<span>` só dela".

- [ ] **Step 4: Verificar** — `npx vitest run src/design-system/__tests__/card.test.ts src/app/__tests__/telas-04-lista.test.ts` → verde.

### Task 2.4: "Sair" vira secundário

**Files:**
- Modify: `src/app/(app)/conta/page.tsx` (~219)
- Modify: `src/app/__tests__/telas-05-conta.test.ts`

- [ ] **Step 1: Escrever o teste**

```ts
  it('"Sair" é secundário: contorno, não o azul do CTA (correções UX 19/09)', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    const sair = /<button[^>]*>Sair<\/button>/.exec(html)?.[0] ?? ''
    expect(sair).toContain('class="botao-secundario"')
    expect(sair).not.toContain('#0057B8')
    expect(sair).not.toContain('botao-primario')
  })
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: O botão**

```tsx
      <form action={sair} style={{ marginTop: 20 }}>
        <button
          type="submit"
          className="botao-secundario"
          style={{
            padding: '11px 12px',
            borderRadius: 8,
            fontFamily: semantico.fonteTitulo,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Sair
        </button>
      </form>
```

- [ ] **Step 4: Verificar** — `npx vitest run src/app/__tests__/telas-05-conta.test.ts` → verde.

### Fase 2 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 3 · Filtros do desktop

### Task 3.1: Rótulo composto e chip de recorte nos dois lugares

**Files:**
- Modify: `src/components/navegacao/FolhaDeFiltros.tsx`
- Modify: `src/app/__tests__/navegacao.test.ts` (`describe('filtros (identidade 05)')`)

- [ ] **Step 1: Atualizar e ampliar os testes**

```ts
  it('o chip do grupo mostra o grupo E o que está filtrando: "Método: OPD"', () => {
    const html = renderToStaticMarkup(createElement(FolhaDeFiltros, { grupos }))
    expect(html).toContain('aria-label="Método: OPD"')
    // Correções UX 19/09: só o valor ("G", "BOS") não dizia de que grupo era.
    expect(html).toContain('>Método: OPD<')
    expect(html).not.toContain('>OPD<')
  })

  it('o recorte ativo com o × sai DUAS vezes: na folha do celular e na fileira do desktop', () => {
    const html = renderToStaticMarkup(
      createElement(FolhaDeFiltros, { grupos, ativos: [{ rotulo: '3 filtros', limparHref: '/' }] }),
    )
    expect(html.match(/aria-label="Limpar filtro 3 filtros"/g)).toHaveLength(2)
    // e na fileira ele vem ANTES dos menus
    const fileira = html.slice(0, html.indexOf('<details'))
    expect(fileira).toContain('Limpar filtro 3 filtros')
  })

  it('os dois últimos menus ancoram à direita — não avançam sobre a lateral', () => {
    const css = readFileSync('src/components/navegacao/FolhaDeFiltros.module.css', 'utf8')
    expect(css).toMatch(/\.chipMenu:nth-last-child\(-n \+ 2\) > \.menu\s*\{[^}]*right:\s*0/)
  })
```

(`readFileSync` já é importado no arquivo — confirmar; senão `import { readFileSync } from 'node:fs'`.)

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: `ChipDeRecorte` local e o rótulo composto**

Em `FolhaDeFiltros.tsx`, acima de `export function FolhaDeFiltros`:

```tsx
/**
 * O recorte ativo, com o × para limpar. Sai nos DOIS invólucros — na folha do
 * celular ao lado do FILTRAR, e na fileira do desktop antes dos menus — porque
 * é o único jeito de tirar três filtros de uma vez sem abrir três menus.
 */
function ChipDeRecorte({ ativo }: { ativo: RecorteAtivo }) {
  return (
    <Link
      href={ativo.limparHref}
      aria-label={`Limpar filtro ${ativo.rotulo}`}
      className="chip-filtro chip-filtro-ativo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 999,
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 700,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {ativo.rotulo} <span aria-hidden>×</span>
    </Link>
  )
}
```

Na fileira do desktop, antes do `grupos.map`:

```tsx
      <div ref={fileira} className={estilos.chips} onClick={aoEscolher}>
        {ativos.map((ativo) => (
          <ChipDeRecorte key={ativo.rotulo} ativo={ativo} />
        ))}
        {grupos.map((grupo) => (
```

No `<summary>`:

```tsx
            <summary aria-label={grupo.ativo ? `${grupo.titulo}: ${grupo.ativo}` : grupo.titulo}>
              {grupo.ativo ? `${grupo.titulo}: ${grupo.ativo}` : grupo.titulo}
```

Na folha do celular, o bloco `{ativos.map((ativo) => (<Link … >…</Link>))}` inteiro vira `{ativos.map((ativo) => (<ChipDeRecorte key={ativo.rotulo} ativo={ativo} />))}`.

- [ ] **Step 4: `FolhaDeFiltros.module.css` — menus da direita**

Depois do bloco `.menu { … }`:

```css
/* Os dois últimos chips da fileira encostam na borda direita da coluna; um
   menu de 220 px ancorado à esquerda deles avançava sobre a lateral. */
.chipMenu:nth-last-child(-n + 2) > .menu {
  left: auto;
  right: 0;
}
```

- [ ] **Step 5: Verificar** — `npx vitest run src/app/__tests__/navegacao.test.ts src/app/__tests__/telas-04-lista.test.ts src/app/__tests__/telas-04-firelive.test.ts` → verde.

### Task 3.2: Fechar o menu ao clicar fora

**Files:**
- Modify: `src/components/navegacao/FolhaDeFiltros.tsx`
- Modify: `src/app/__tests__/navegacao.test.ts`

- [ ] **Step 1: Teste de fonte**

```ts
  it('os menus fecham ao apontar fora da fileira (asserção de fonte — o arnês não hidrata)', () => {
    const fonte = readFileSync('src/components/navegacao/FolhaDeFiltros.tsx', 'utf8')
    expect(fonte).toContain("document.addEventListener('pointerdown'")
    expect(fonte).toContain("document.removeEventListener('pointerdown'")
  })
```

- [ ] **Step 2: O efeito**

Import: `import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'`. Depois de `aoTeclar`:

```tsx
  // Clicar em qualquer lugar fora da fileira fecha o menu aberto. `<details>`
  // nativo não faz isso sozinho, e um menu que fica aberto sobre os cards
  // depois de a pessoa clicar num deles é o que a auditoria de 19/09 viu.
  // `pointerdown`, não `click`: fecha antes de o clique de destino disparar,
  // e cobre mouse, caneta e toque de uma vez.
  useEffect(() => {
    const aoApontarFora = (e: PointerEvent) => {
      if (!fileira.current?.contains(e.target as Node)) fecharMenus()
    }
    document.addEventListener('pointerdown', aoApontarFora)
    return () => document.removeEventListener('pointerdown', aoApontarFora)
    // `fecharMenus` só lê o ref, que é estável — não precisa entrar nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

Se o lint do projeto não usa `react-hooks/exhaustive-deps`, apagar a linha do `eslint-disable`.

- [ ] **Step 3: Verificar** — `npx vitest run src/app/__tests__/navegacao.test.ts && npm run lint` → verde.

### Fase 3 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 4 · Moldura e esqueleto

### Task 4.1: A barra do topo em toda tela do desktop

**Files:**
- Modify: `src/components/navegacao/BarraTopo.tsx`
- Modify: `src/components/navegacao/Moldura.tsx`
- Modify: `src/app/__tests__/navegacao.test.ts` (teste "tela sem aba não ganha barra nenhuma nem lateral")
- Modify: `src/app/__tests__/carregamento.test.ts` (teste "telas de detalhe não ganham barra de abas")

- [ ] **Step 1: Reescrever os dois testes**

`navegacao.test.ts`:

```ts
  it('tela sem aba: barra do TOPO sim (o desktop tem navegação sempre), barra inferior e lateral não', () => {
    // Correções UX 19/09, §4.8: detalhe do apito, time e teoria ficavam sem
    // marca nem navegação a partir de 1024. A barra inferior segue só nas
    // abas — no celular a tela de leitura sem barra foi decisão da 04.
    const html = renderToStaticMarkup(createElement(Moldura, { aba: null }, 'x'))
    expect(html).not.toContain('barra-inferior')
    expect(html).toContain('aria-label="Seções do app (topo)"')
    expect(html).not.toContain('aria-current="page"')
    expect(html).not.toContain('Painel lateral')
  })
```

`carregamento.test.ts`:

```ts
  it('telas de detalhe: só a barra do topo, nenhuma pílula acesa', () => {
    const html = renderToStaticMarkup(createElement(Esqueleto, { aba: null, linhas: 1 }))
    expect(html).not.toContain('barra-inferior')
    expect(html).toContain('aria-label="Seções do app (topo)"')
    expect(html).not.toContain('aria-current="page"')
  })
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: `BarraTopo.tsx`** — assinatura `{ atual: Aba | null; conta?: ContaNaBarra }`; `const ativo = aba.id === atual` já dá `false` para `null`, nada mais muda. Comentário na prop: "`null` nas telas que não são abas: a barra existe, nenhuma pílula acende."

- [ ] **Step 4: `Moldura.tsx`** — o bloco do topo deixa de depender da aba:

```tsx
      {/* A barra do topo existe em TODA tela a partir de 1024 (correções UX
          19/09): sem ela, o detalhe do apito ficava sem marca nem navegação.
          A barra inferior segue só nas abas, como a identidade 04 decidiu
          para o celular. */}
      <div className={estilos.topo}>
        <BarraTopo atual={aba} conta={conta} />
      </div>
```

O comentário da prop `aba` passa a: "`null` nas telas que não são abas (detalhe, teoria): sem barra inferior, sem lateral, sem pílula acesa no topo."

- [ ] **Step 5: Verificar** — `npx vitest run src/app/__tests__/navegacao.test.ts src/app/__tests__/carregamento.test.ts src/app/__tests__/chat-botao.test.ts src/app/__tests__/telas-04-detalhe.test.ts && npm run typecheck` → verde. O `BotaoChat` continua `aba !== null && …` — não muda.

### Task 4.2: O esqueleto reserva a lateral

**Files:**
- Modify: `src/components/navegacao/Esqueleto.tsx`
- Modify: `src/app/__tests__/carregamento.test.ts`

- [ ] **Step 1: Teste**

```ts
  it('nas telas de aba o esqueleto reserva a lateral — senão a coluna encolhe quando o conteúdo chega', () => {
    const comAba = renderToStaticMarkup(createElement(Esqueleto, { aba: 'lista' }))
    expect(comAba).toContain('aria-label="Painel lateral"')
    const semAba = renderToStaticMarkup(createElement(Esqueleto, { aba: null }))
    expect(semAba).not.toContain('aria-label="Painel lateral"')
  })
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: `Esqueleto.tsx`**

Trocar o parágrafo do comentário "Sem `assistente` e sem `lateral` de propósito…" por:

```
 * Sem `assistente`: o esqueleto não tem o que perguntar. COM lateral nas telas
 * de aba (correções UX 19/09): a coluna de 320 é reservada por dois blocos
 * cinzas nas alturas dos blocos reais, senão a coluna do conteúdo encolhe de
 * 1120 para 1040 no instante em que a lateral chega — a tela pula a cada
 * navegação a partir de 1280.
```

Acrescentar, acima de `export function Esqueleto`:

```tsx
/** Dois blocos nas alturas aproximadas de "Última noite" e "Classificação". */
function LateralDeEsqueleto() {
  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      {[132, 300].map((altura) => (
        <div
          key={altura}
          className="esqueleto"
          style={{
            height: altura,
            borderRadius: componente.cardRaio,
            background: semantico.superficie,
            border: `1px solid ${semantico.divisor}`,
          }}
        />
      ))}
    </div>
  )
}
```

E na `Moldura` do esqueleto: `<Moldura aba={aba} largura={largura} lateral={aba !== null ? <LateralDeEsqueleto /> : undefined}>`.

- [ ] **Step 4: Verificar** — `npx vitest run src/app/__tests__/carregamento.test.ts src/app/__tests__/navegacao.test.ts` → verde.

### Task 4.3: Botão flutuante a 1024–1279

**Files:**
- Modify: `src/components/chat/BotaoChat.module.css`
- Modify: `src/app/__tests__/chat-botao.test.ts`

- [ ] **Step 1: Teste de fonte**

```ts
import { readFileSync } from 'node:fs'
// …
  it('a partir de 1024 o botão desce para 24 px: não há barra inferior a reservar (correções UX 19/09)', () => {
    const css = readFileSync('src/components/chat/BotaoChat.module.css', 'utf8')
    expect(css).toMatch(/@media \(min-width: 1024px\)\s*\{\s*\.botao\s*\{[^}]*bottom:\s*24px/)
  })
```

- [ ] **Step 2: CSS** — depois do bloco `.botao:focus-visible`:

```css
/* A partir de 1024 a barra inferior some (Moldura.module.css) e os 96 px
   reservados viravam um botão flutuando no meio do nada. O 1024 repete
   `semantico.larguraTopo`. */
@media (min-width: 1024px) {
  .botao {
    bottom: 24px;
  }
}
```

- [ ] **Step 3: Verificar** — `npx vitest run src/app/__tests__/chat-botao.test.ts` → verde.

### Fase 4 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 5 · Lateral

### Task 5.1: A doca abre por clique ou tecla, e devolve o foco

**Files:**
- Modify: `src/components/lateral/DocaDoAssistente.tsx`
- Test: `src/components/lateral/__tests__/doca.test.ts` (novo)

- [ ] **Step 1: Teste de fonte**

```ts
// src/components/lateral/__tests__/doca.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A doca abre por INTENÇÃO, não por foco (correções UX 19/09, §4.10): quem
 * navega por Tab passa pela lateral sem abrir o painel, e ao recolher o foco
 * volta ao campo. O arnês não hidrata — a prova é de fonte, e o passo manual
 * do plano confirma na preview.
 */
describe('doca do assistente', () => {
  const fonte = readFileSync('src/components/lateral/DocaDoAssistente.tsx', 'utf8')

  it('não abre no foco', () => {
    expect(fonte).not.toContain('onFocus')
  })

  it('abre no clique, no Enter e na primeira tecla digitada', () => {
    expect(fonte).toContain('onClick={() => setAberta(true)}')
    expect(fonte).toContain('onKeyDown={aoTeclar}')
    expect(fonte).toContain("e.key === 'Enter' || e.key.length === 1")
  })

  it('ao recolher, o foco volta ao campo', () => {
    expect(fonte).toContain('campo.current?.focus()')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: O componente**

```tsx
'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import estilos from './Lateral.module.css'

const PainelChat = dynamic(() => import('../chat/PainelChat').then((m) => m.PainelChat), {
  ssr: false,
})

/**
 * A DOCA DO ASSISTENTE — o rodapé fixo da lateral (identidade 05, §7.3).
 *
 * Recolhida, é um campo estático com a primeira linha da última resposta do dia
 * acima dele, quando houver. Abre por INTENÇÃO — clique, Enter ou a primeira
 * tecla digitada —, nunca por foco (correções UX 19/09): quem navega por Tab
 * atravessa a lateral sem abrir o painel. Ao recolher, o foco volta ao campo,
 * senão ele cai no topo do documento e a pessoa perde o lugar.
 *
 * A leitura do histórico só acontece se a lateral estiver VISÍVEL: abaixo de
 * 1280 px a doca está escondida por CSS, e uma requisição para preencher um
 * elemento que ninguém vê seria puro custo.
 */
export function DocaDoAssistente() {
  const [aberta, setAberta] = useState(false)
  const [ultima, setUltima] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const estavaAberta = useRef(false)

  useEffect(() => {
    if (!window.matchMedia('(min-width: 1280px)').matches) return
    let ativo = true
    fetch('/api/chat')
      .then((r) =>
        r.ok ? (r.json() as Promise<{ mensagens?: { papel: string; texto: string }[] }>) : null,
      )
      .then((corpo) => {
        const resposta = corpo?.mensagens?.filter((m) => m.papel !== 'USUARIO').at(-1)?.texto
        if (ativo && resposta) setUltima(resposta.split('\n')[0]!.slice(0, 120))
      })
      // Falhar aqui é silencioso de propósito: a última resposta é conforto, e
      // interromper alguém por um histórico que ele não pediu seria pior.
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [])

  // O campo é REMONTADO quando o painel recolhe; devolver o foco a ele é o que
  // mantém quem fechou com Esc no mesmo lugar da página.
  useEffect(() => {
    if (!aberta && estavaAberta.current) campo.current?.focus()
    estavaAberta.current = aberta
  }, [aberta])

  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter ou um caractere imprimível abre; Tab, Shift, setas passam.
    if (e.key === 'Enter' || e.key.length === 1) {
      e.preventDefault()
      setAberta(true)
    }
  }

  return (
    <div className={estilos.doca}>
      {aberta ? (
        <PainelChat modo="doca" aoFechar={() => setAberta(false)} />
      ) : (
        <form
          className={estilos.docaRecolhida}
          onSubmit={(e) => {
            e.preventDefault()
            setAberta(true)
          }}
        >
          {ultima && <p className={estilos.apoio}>{ultima}</p>}
          <input
            ref={campo}
            type="text"
            className={estilos.campo}
            placeholder="Pergunte sobre a lista de hoje"
            aria-label="Pergunte ao assistente"
            onClick={() => setAberta(true)}
            onKeyDown={aoTeclar}
          />
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verificar** — `npx vitest run src/components/lateral && npm run typecheck && npm run lint` → verde.

### Task 5.2: Estatísticas com lateral: conferências empilhadas, lateral sem classificação, âncora

**Files:**
- Modify: `src/components/navegacao/Moldura.tsx` (classe global `moldura-com-lateral`)
- Modify: `src/app/globals.css`
- Modify: `src/components/lateral/Lateral.tsx` (`mostrarClassificacao`)
- Modify: `src/app/(app)/lateral/montar.tsx` (`semClassificacao`)
- Modify: `src/app/(app)/estatisticas/page.tsx` (~490 e ~601)
- Modify: `src/components/lateral/ClassificacaoCompacta.tsx` (`href`)
- Modify: `src/app/__tests__/telas-05-classificacao.test.ts`, `src/app/__tests__/navegacao.test.ts`

- [ ] **Step 1: Testes**

`telas-05-classificacao.test.ts`, novo `describe`:

```ts
describe('o índice de Estatísticas com a lateral (correções UX 19/09)', () => {
  it('a lateral do índice NÃO repete a classificação — a página já a mostra inteira', async () => {
    const html = await renderizarIndice()
    const aside = /<aside[\s\S]*?<\/aside>/.exec(html)?.[0] ?? ''
    expect(aside).toContain('Painel lateral')
    expect(aside).not.toContain('Ver completa')
    expect(aside).not.toContain('>Classificação<')
  }, 60_000)

  it('a grade das conferências tem a âncora que "Ver completa" aponta', async () => {
    const html = await renderizarIndice()
    expect(html).toContain('id="classificacao"')
  }, 60_000)

  it('com lateral, as conferências empilham até 1600 — a tabela do Oeste não cabe em 508 px', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    expect(css).toMatch(
      /@media \(min-width: 1280px\) and \(max-width: 1599px\)\s*\{\s*\.moldura-com-lateral \.grade-conferencias\s*\{\s*grid-template-columns:\s*1fr;/,
    )
  })
})
```

`navegacao.test.ts`, no `describe('moldura (identidade 05)')`:

```ts
  it('a moldura com lateral expõe a classe global que o CSS de tela lê', () => {
    const com = renderToStaticMarkup(createElement(Moldura, { aba: 'stats', lateral: 'x' }, 'y'))
    const sem = renderToStaticMarkup(createElement(Moldura, { aba: 'stats' }, 'y'))
    expect(com).toContain('moldura-com-lateral')
    expect(sem).not.toContain('moldura-com-lateral')
  })
```

E onde a lateral é renderizada em algum teste que espere "Ver completa" apontando para `/estatisticas` exato — procurar `href="/estatisticas"` nos testes de lateral e trocar por `href="/estatisticas#classificacao"`.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: `Moldura.tsx`**

```tsx
  const classes = [
    estilos.raiz,
    aba === null ? estilos.semAba : '',
    // A classe GLOBAL existe para o CSS de tela (globals.css) saber que há
    // lateral: o módulo é privado, e as conferências de Estatísticas precisam
    // empilhar quando sobram só 1040 px.
    lateral ? `${estilos.comLateral} moldura-com-lateral` : '',
  ]
```

- [ ] **Step 4: `globals.css`** — logo depois do bloco `@media (min-width: 900px) { … .grade-conferencias … }`:

```css
/*
 * Com a lateral (a partir de 1280) sobram 1040 px para o conteúdo: duas
 * conferências lado a lado dão 508 cada, e a tabela do Oeste — nomes longos —
 * rola por dentro e corta o TRILHO. Empilha até 1600; dali em diante cabe.
 */
@media (min-width: 1280px) and (max-width: 1599px) {
  .moldura-com-lateral .grade-conferencias {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: `Lateral.tsx`**

```tsx
export function Lateral({
  dados,
  assistente,
  gratis,
  mostrarClassificacao = true,
}: {
  dados: DadosDaLateral
  /** O nível tem direito ao assistente. A tela sabe; a lateral só recebe. */
  assistente: boolean
  gratis: boolean
  /**
   * `false` no índice de Estatísticas (correções UX 19/09): a página já mostra
   * a classificação inteira ao lado, e a compacta seria o mesmo dado duas
   * vezes na mesma dobra.
   */
  mostrarClassificacao?: boolean
}) {
  return (
    <div className={estilos.lateral}>
      {gratis && (
        <ConviteDoPlano
          variante="faixa"
          minimo="MVP"
          recurso="Lista, Fire Live e assistente"
          voltar="/"
        />
      )}
      <UltimaNoite noite={dados.noite} temporada={dados.temporada} />
      {mostrarClassificacao && (
        <ClassificacaoCompacta
          conferencias={dados.classificacao.conferencias}
          temporada={dados.classificacao.temporada}
        />
      )}
      {!gratis && assistente && <DocaDoAssistente />}
    </div>
  )
}
```

- [ ] **Step 6: `montar.tsx`**

```tsx
export async function lateralPadrao({
  assistente,
  gratis,
  semClassificacao = false,
}: {
  assistente: boolean
  gratis: boolean
  /** O índice de Estatísticas passa `true`: a classificação já está na página. */
  semClassificacao?: boolean
}): Promise<ReactNode> {
  // …
  return (
    <Lateral
      dados={dados}
      assistente={assistente}
      gratis={gratis}
      mostrarClassificacao={!semClassificacao}
    />
  )
}
```

- [ ] **Step 7: `estatisticas/page.tsx`** — na chamada (~490) acrescentar `semClassificacao: true,`; na grade (~601): `<div id="classificacao" className="grade-conferencias" style={{ display: 'grid', gap: 24 }}>`.

- [ ] **Step 8: `ClassificacaoCompacta.tsx`** — `<Link className={estilos.link} href="/estatisticas#classificacao">`.

- [ ] **Step 9: Verificar** — `npx vitest run src/app/__tests__/telas-05-classificacao.test.ts src/app/__tests__/navegacao.test.ts src/app/__tests__/telas-04-estatisticas.test.ts src/app/__tests__/paywall.test.ts && npm run typecheck` → verde.

### Task 5.3: Concordância na faixa do grátis

**Files:**
- Modify: `src/components/planos/ConviteDoPlano.tsx`
- Modify: `src/components/lateral/Lateral.tsx`
- Modify: `src/app/__tests__/telas-05-gratis.test.ts`

- [ ] **Step 1: Teste**

```ts
  it('a faixa da lateral concorda: "começam", porque são três recursos (correções UX 19/09)', async () => {
    const html = await renderizarLista()
    const aside = /<aside[\s\S]*?<\/aside>/.exec(html)?.[0] ?? ''
    expect(aside).toContain('LISTA, FIRE LIVE E ASSISTENTE COMEÇAM NO MVP')
    expect(aside).not.toContain('ASSISTENTE COMEÇA NO')
  }, 60_000)
```

- [ ] **Step 2: `ConviteDoPlano.tsx`** — prop `titulo?: string`, só na faixa:

```tsx
export function ConviteDoPlano({
  minimo,
  recurso,
  voltar,
  variante = 'compacto',
  titulo,
}: {
  minimo: NivelPago
  recurso: string
  voltar: string
  variante?: 'compacto' | 'faixa'
  /**
   * A frase inteira da faixa, quando a montada não concorda ("Lista, Fire
   * Live e assistente começa"). Ausente, a faixa monta `${recurso} começa no
   * ${nível}`. O nome acessível segue o mesmo texto.
   */
  titulo?: string
}) {
  const href = `/assinar?nivel=${minimo}&voltar=${encodeURIComponent(voltar)}`
  const frase = titulo ?? `${recurso} começa no ${ROTULO_DO_NIVEL[minimo]}`
  const rotulo = titulo ?? `${recurso} começa no plano ${ROTULO_DO_NIVEL[minimo]}`

  if (variante === 'faixa') {
    return (
      <section aria-label={rotulo} …>
        <p …>{frase.toUpperCase()}</p>
```

(O `<p>` da faixa troca o template literal por `{frase.toUpperCase()}`; o compacto não muda.)

- [ ] **Step 3: `Lateral.tsx`** — na faixa, acrescentar `titulo="Lista, Fire Live e assistente começam no MVP"`.

- [ ] **Step 4: Verificar** — `npx vitest run src/app/__tests__/telas-05-gratis.test.ts src/app/__tests__/planos-home.test.ts src/app/__tests__/planos-fire-live.test.ts` → verde. O teste "a Lista tem a moldura do assinante, a faixa…" espera `COMEÇA NO` — a faixa INLINE da Lista ("Lista Secreta começa no MVP") continua; passa.

### Task 5.4: A tabela da lateral com semântica de tabela

**Files:**
- Modify: `src/components/lateral/ClassificacaoCompacta.tsx`
- Test: `src/components/lateral/__tests__/classificacao-compacta.test.ts` (novo)

- [ ] **Step 1: Teste**

```ts
// src/components/lateral/__tests__/classificacao-compacta.test.ts
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ClassificacaoCompacta } from '../ClassificacaoCompacta'

const linha = (timeId: string, sigla: string, posicao: number) => ({
  timeId,
  sigla,
  posicao,
  vitorias: 10,
  derrotas: 2,
  aproveitamento: 0.8333,
})

const conferencias = [
  { conferencia: 'Leste', linhas: [linha('bos', 'BOS', 1)] },
  { conferencia: 'Oeste', linhas: [linha('lal', 'LAL', 1)] },
]

describe('classificação compacta (correções UX 19/09, §4.17)', () => {
  it('o tabpanel é um <div> em volta da tabela — a tabela continua tabela', () => {
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    expect(html).toMatch(/<div[^>]*role="tabpanel"[^>]*><table/)
    expect(html).not.toMatch(/<table[^>]*role=/)
  })

  it('cada aba controla o painel, e o painel diz qual aba o nomeia', () => {
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    expect(html).toContain('id="conferencia-0"')
    expect(html).toContain('id="conferencia-1"')
    expect(html.match(/aria-controls="painel-conferencia"/g)).toHaveLength(2)
    expect(html).toMatch(/id="painel-conferencia"[^>]*aria-labelledby="conferencia-0"/)
  })

  it('"Ver completa" cai na classificação, não no topo de Estatísticas', () => {
    const html = renderToStaticMarkup(
      createElement(ClassificacaoCompacta, { conferencias, temporada: '2026-27' }),
    )
    expect(html).toContain('href="/estatisticas#classificacao"')
  })
})
```

Se `LinhaCompacta` tiver campos além destes, completar o `linha()` com eles (ver `src/modules/entrega/lateral.ts`).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: O componente**

```tsx
      {conferencias.length > 1 && (
        <div role="tablist" aria-label="Conferência" className={estilos.abas}>
          {conferencias.map((grupo, i) => (
            <button
              key={grupo.conferencia}
              id={`conferencia-${i}`}
              type="button"
              role="tab"
              aria-selected={i === ativa}
              aria-controls="painel-conferencia"
              className={`${estilos.aba} ${i === ativa ? estilos.abaAtiva : ''}`}
              onClick={() => setAtiva(i)}
            >
              {grupo.conferencia}
            </button>
          ))}
        </div>
      )}

      {atual ? (
        // O painel é um <div> EM VOLTA da tabela: `role="tabpanel"` na própria
        // <table> apagava o papel de tabela para o leitor de tela.
        <div
          id="painel-conferencia"
          role="tabpanel"
          aria-labelledby={conferencias.length > 1 ? `conferencia-${ativa}` : undefined}
        >
          <table className={estilos.tabela}>
            {/* … tudo igual … */}
          </table>
        </div>
      ) : (
```

- [ ] **Step 4: Verificar** — `npx vitest run src/components/lateral src/app/__tests__/telas-05-classificacao.test.ts` → verde.

### Fase 5 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 6 · Fire Live e jogador

### Task 6.1: A estrela no canto do card do Fire Live

**Files:**
- Modify: `src/app/(app)/fire-live/page.tsx` (`CartaoAoVivo` ~147 e o `map` ~497)
- Modify: `src/app/__tests__/telas-04-firelive.test.ts`

- [ ] **Step 1: Teste** (mesmo contrato da Lista, `telas-04-lista.test.ts:510`)

```ts
  it('acompanhar é a estrela no canto do card, como na Lista; o botão solto sumiu (correções UX 19/09)', async () => {
    const html = await renderizar()
    expect(html).toContain('aria-label="Acompanhar jogador"')
    expect(html).not.toContain('+ Acompanhar jogador')
  }, 60_000)
```

(Usar o helper de renderização que a suíte já tem — o nome está no topo do arquivo.)

- [ ] **Step 2: `CartaoAoVivo`** ganha `acaoCanto` e repassa:

```tsx
function CartaoAoVivo({
  item,
  grupo,
  quartoFireLive,
  acaoCanto,
}: {
  item: ItemFireLiveNaTela
  grupo: GrupoFireLive
  quartoFireLive: number
  acaoCanto?: ReactNode
}) {
  // …
  return (
    <CardEntrada
      acaoCanto={acaoCanto}
      nome={item.nome}
```

(Import `type ReactNode` de `react` se ainda não houver.)

- [ ] **Step 3: O `map`**

```tsx
              {grupoSelecionado.itens.map((item) => (
                <div key={item.chave} data-live-key={item.chave}>
                  <CartaoAoVivo
                    item={item}
                    grupo={grupoSelecionado}
                    quartoFireLive={quartoFireLive}
                    acaoCanto={
                      <BotaoAcompanharJogador
                        variante="estrela"
                        jogadorId={item.jogadorId}
                        inicial={experiencia.jogadoresAcompanhados.includes(item.jogadorId)}
                      />
                    }
                  />
                </div>
              ))}
```

- [ ] **Step 4: Verificar** — `npx vitest run src/app/__tests__/telas-04-firelive.test.ts src/app/__tests__/planos-fire-live.test.ts && npm run typecheck` → verde.

### Task 6.2: Pílulas do jogador sem sublinhado

**Files:**
- Modify: `src/app/(app)/estatisticas/jogador/[id]/page.tsx` (~617 e ~718)

- [ ] **Step 1:** Nos dois `<Link>` (período e atributo), acrescentar `textDecoration: 'none',` logo depois de `borderRadius`.

- [ ] **Step 2: Teste** em `src/app/__tests__/telas-04-estatisticas.test.ts` (ou a suíte que renderiza a tela do jogador — procurar `jogador/[id]/page`):

```ts
  it('as pílulas de período e atributo não são sublinhadas (correções UX 19/09)', async () => {
    const html = await renderizarJogador()
    const periodo = /<nav aria-label="Período das estatísticas">[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''
    expect(periodo.match(/text-decoration:none/g)?.length).toBe(3)
  }, 60_000)
```

(`renderizarJogador` é o helper que a suíte já usa para a tela do jogador — se o nome for outro, usar o da suíte.)

- [ ] **Step 3: Verificar** — `npx vitest run src/app/__tests__/telas-04-estatisticas.test.ts` → verde.

### Fase 6 · verificação

Run: `npm run typecheck && npm run lint && npm run boundaries && npm test`

---

# Fase 7 · Bateria, captura, passo manual, commit

### Task 7.1: Bateria e captura

- [ ] **Step 1:** `df -h /` (limpar se < 3 GB).
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm run boundaries && npm test` → tudo verde.
- [ ] **Step 3:** `CAPTURA_LARGURAS=320,390,1024,1280,1440 CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-` → sai com 0 (sem rolagem horizontal). Conferir a olho, a 1440: Lista com a fileira de chips e o chip de recorte à esquerda; Estatísticas com as conferências empilhadas e a lateral sem classificação; detalhe do apito com a barra do topo; Gestão com Registrei/Aplicar azuis e o seletor de banca em chips; Perfil com Sair em contorno.
- [ ] **Step 4:** A 320 e 390, comparar com `.superpowers/capturas` de 19/09 (antes desta passada): nada muda.

### Task 7.2: Passo manual na preview — o que o arnês não hidrata

`npm run build && npm run start` (ou a preview da Vercel do branch), Chrome a 1440, sessão MVP:

- [ ] **Menu fecha ao clicar fora (3.2):** Lista → abrir MÉTODO → clicar num card. Esperado: o menu fecha e o detalhe abre. Voltar → abrir POSIÇÃO. Esperado: o menu abre PARA A ESQUERDA, sem cobrir a lateral.
- [ ] **Limpar (3.1):** aplicar Método + Nível + Posição. Esperado: chip "3 FILTROS ×" à esquerda da fileira; clicar nele limpa os três.
- [ ] **Doca por Tab (5.1):** com a Lista aberta, Tab até o campo "Pergunte sobre a lista de hoje". Esperado: o painel NÃO abre. Apertar Enter: abre. Esc: recolhe, e o foco está de volta no campo (Tab seguinte vai para o próximo elemento da lateral, não para o topo).
- [ ] **Hover (1.x):** passar o mouse nas pílulas do topo, num chip inativo, num chip-menu, na estrela, em "Registrei" e em "Sair". Esperado: cada um muda (fundo elevado; CTA mais claro).
- [ ] **Número de confiança (2.3):** Lista → clicar no número grande do canto. Esperado: abre a análise.
- [ ] **Esqueleto (4.2):** Lista → clicar em STATS. Esperado: a coluna de conteúdo não muda de largura durante o carregamento.
- [ ] **Sem aba (4.1):** detalhe do apito. Esperado: barra do topo com marca e pílulas, nenhuma acesa.

Anotar o resultado de cada item na mensagem do commit (Task 7.3). Se algum falhar, corrigir ANTES do commit — a tarefa dele é a referência.

### Task 7.3: Commit único

- [ ] **Step 1:** `git status` — só os arquivos das tarefas acima mais as duas specs e os dois planos.
- [ ] **Step 2:**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Correções de UX no desktop: o que a auditoria da Identidade 05 viu na tela

Três regressões da passada e quinze comportamentos que só a 1024+ mostrou.

- Quatro classes globais com :hover e :focus-visible (botao-primario,
  botao-secundario, pilula-nav, chip-filtro) passam a ser donas das cores
  dos controles; a geometria segue embutida. Chip-menu e estrela ganham
  hover no módulo.
- Regressões: texto branco sobre fundo branco em Buscar/Registrei/Aplicar
  e no seletor de banca (teste-par de "azul nunca é tinta"); o z-index da
  coluna do canto cobria o número de confiança; "Sair" era primário.
- Filtros: fecham ao apontar fora; os dois últimos menus ancoram à direita;
  chip de recorte com × também no desktop; rótulo "Grupo: valor".
- Moldura: barra do topo em toda tela; esqueleto reserva a lateral; botão
  flutuante a 24 px a partir de 1024.
- Lateral: doca abre por clique/tecla e devolve o foco; Estatísticas
  empilha as conferências com lateral e a lateral do índice não repete a
  classificação; âncora #classificacao; "começam"; tabpanel em div.
- Fire Live: estrela no canto do card, como na Lista. Jogador: pílulas sem
  sublinhado.

Passo manual na preview (Task 7.2): <resultado de cada item>

Spec: docs/superpowers/specs/2026-09-19-correcoes-ux-desktop-identidade-05-design.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

Sem push, sem PR: o parceiro decide.
