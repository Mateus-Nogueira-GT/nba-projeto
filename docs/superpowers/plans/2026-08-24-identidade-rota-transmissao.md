# Identidade "02 Rota Transmissão" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adotar a identidade visual do mockup (Anton/Barlow, pílula de contorno + brilho, rampa turquesa de confiança, fotos de jogadores) e o conteúdo novo do detalhe/ao-vivo, mantendo TODA regra do CJ intacta.

**Architecture:** Abordagem A — os tokens de 3 camadas absorvem a identidade (hex só no primitivo; CSS gerado por `npm run tokens`); componentes `CardEntrada`/`Anel`/navegação são reescritos no lugar; conteúdo novo entra como módulos de LEITURA na camada entrega (`detalhe-apito`), nunca no motor; fotos via `next/image` + mapa curado + script que só grava URL verificada.

**Tech Stack:** Next.js 16 (App Router, `next/font/google`, `next/image`), Drizzle + PGlite (testes), Vitest, dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-08-24-identidade-rota-transmissao-design.md`

## Global Constraints

- **Onde o mockup e a regra do CJ divergem, o CJ vence** (tabela da spec — não reabrir).
- Nenhuma tela contém `+18,5`/meio ponto, `ALTÍSSIMO VALOR`, atributo três pontos, `MÉDIA 5J`.
- "probabilidade" nunca sem negação na frente (P12).
- Hex SÓ em `src/design-system/tokens/primitivo.ts`; após mexer em tokens rode `npm run tokens`.
- Tela nunca executa o motor; `src/app` não importa VALOR de `src/modules/motor` (tipo pode). Verificar com `npm run boundaries`.
- Números de regra novos vão ao `config/ruleset.v1.yaml` com `origem: demonstracao`.
- Node: use `export PATH=/opt/homebrew/opt/node@26/bin:$PATH` antes de qualquer npm/npx.
- Comandos de verificação por task: `npx tsc --noEmit && npm run lint && npm run boundaries && npx vitest run <arquivos da task>`.
- Commits em português, corpo explica o porquê, rodapé `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Fontes + tokens novos + testes de contraste e colisão

**Files:**
- Modify: `src/design-system/tokens/primitivo.ts`
- Modify: `src/design-system/tokens/semantico.ts`
- Modify: `src/design-system/tokens/componente.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/design-system/tokens/css.ts` (mapa `CONFIANCA_GRAU`)
- Test: `src/design-system/__tests__/tokens.test.ts` (estender)

**Interfaces:**
- Produces: `primitivo.turquesa{300,400,500,600,700}`, `primitivo.tinta950`, `primitivo.laranjaAcento`, `primitivo.fonteAnton/fonteBarlow/fonteBarlowCondensed`; `semantico.fonteTitulo/fonteRotulo/fonteCorpo/acento/aoVivo/confiancaGrau1..confiancaGrau5`; `componente.pilulaBordaLargura/avatarAnelEspessura/faixaNivelAltura`; `CONFIANCA_GRAU: Record<1|2|3|4|5, string>` em `css.ts`.

- [ ] **Step 1: Failing test — colisão de canais + contraste dos degraus**

Acrescente ao `src/design-system/__tests__/tokens.test.ts`:

```ts
import { primitivo } from '../tokens/primitivo'
import { semantico } from '../tokens/semantico'
import { razaoDeContraste } from '../tokens/contraste'

describe('rampa de confiança (identidade 02)', () => {
  const degraus = [
    semantico.confiancaGrau1,
    semantico.confiancaGrau2,
    semantico.confiancaGrau3,
    semantico.confiancaGrau4,
    semantico.confiancaGrau5,
  ]

  it('nenhum degrau colide com as cores do apito ou as metálicas', () => {
    const categoricas = [
      semantico.apitoNivel1, semantico.apitoNivel2, semantico.apitoNivel3, semantico.apitoTurbo,
      semantico.nivelMvp, semantico.nivelAllStar, semantico.nivelSuporte, semantico.nivelRandola,
    ]
    for (const d of degraus) expect(categoricas).not.toContain(d)
    expect(new Set(degraus).size).toBe(5)
  })

  it('todo degrau é legível como texto sobre a superfície do card (AA)', () => {
    for (const d of degraus) {
      expect(razaoDeContraste(d, semantico.superficie)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('o acento laranja é legível sobre superfície e o texto sobre o acento também', () => {
    expect(razaoDeContraste(semantico.acento, semantico.superficie)).toBeGreaterThanOrEqual(3)
    expect(razaoDeContraste(semantico.textoSobreCor, semantico.acento)).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/design-system` → FAIL (`confiancaGrau1` não existe).

- [ ] **Step 3: Tokens.** Em `primitivo.ts` acrescente (comentando que é a identidade 02):

```ts
  // Rampa de confiança — UM matiz, intensidade crescente. Identidade 02.
  turquesa700: '#2FA093',
  turquesa600: '#3AB5A6',
  turquesa500: '#47CBBA',
  turquesa400: '#5CE0CE',
  turquesa300: '#79F2E1',
  // Acento de INTERFACE (chips, aba ativa, CTA). Não é canal de estratégia —
  // papel diferente do laranja400 do apito nível 2.
  laranjaAcento: '#FF7A1A',
  tinta950: '#05080F',
  // Fontes — a família vem por variável CSS publicada no layout (next/font).
  fonteAnton: "var(--fonte-anton), 'Arial Narrow', sans-serif",
  fonteBarlow: "var(--fonte-barlow), system-ui, sans-serif",
  fonteBarlowCondensed: "var(--fonte-barlow-condensed), 'Arial Narrow', sans-serif",
```

Em `semantico.ts`:

```ts
  // -- Tipografia (identidade 02) ---------------------------------------
  fonteTitulo: p.fonteAnton,
  fonteRotulo: p.fonteBarlowCondensed,
  fonteCorpo: p.fonteBarlow,

  // -- Acento de interface ----------------------------------------------
  acento: p.laranjaAcento,
  aoVivo: p.vermelho400,

  // -- Rampa de confiança — grau 1 (menor) ao 5 (maior) ------------------
  confiancaGrau1: p.turquesa700,
  confiancaGrau2: p.turquesa600,
  confiancaGrau3: p.turquesa500,
  confiancaGrau4: p.turquesa400,
  confiancaGrau5: p.turquesa300,
```

Em `componente.ts`:

```ts
  pilulaBordaLargura: '1.5px',
  avatarAnelEspessura: '2px',
  faixaNivelAltura: '3px',
```

Em `css.ts`, ao lado de `APITO`:

```ts
export const CONFIANCA_GRAU: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: semantico.confiancaGrau1,
  2: semantico.confiancaGrau2,
  3: semantico.confiancaGrau3,
  4: semantico.confiancaGrau4,
  5: semantico.confiancaGrau5,
}
```

- [ ] **Step 4: Fontes no layout.** Em `src/app/layout.tsx`:

```tsx
import { Anton, Barlow, Barlow_Condensed } from 'next/font/google'

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--fonte-anton' })
const barlow = Barlow({ weight: ['400', '600', '700'], subsets: ['latin'], variable: '--fonte-barlow' })
const barlowCondensed = Barlow_Condensed({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  variable: '--fonte-barlow-condensed',
})
```

e `<html lang="pt-BR" className={`${anton.variable} ${barlow.variable} ${barlowCondensed.variable}`}>`.

- [ ] **Step 5: Regenerar CSS** — `npm run tokens`. Depois `npx vitest run src/design-system` → PASS (ajuste hex de degrau se contraste falhar; só no primitivo).

- [ ] **Step 6: Verificação completa + commit**

```bash
npx tsc --noEmit && npm run lint && npm run boundaries && npx vitest run src/design-system
git add -A && git commit -m "Identidade 02: fontes Anton/Barlow e rampa turquesa de confiança nos tokens"
```

---

### Task 2: `confianca_exibicao` no ruleset + `faixaDaConfianca` no motor

**Files:**
- Modify: `config/ruleset.v1.yaml`
- Modify: `src/modules/motor/ruleset/schema.ts`
- Modify: `src/modules/motor/confianca.ts`
- Test: `src/modules/motor/__tests__/confianca-exibicao.test.ts` (novo)

**Interfaces:**
- Produces: `faixaDaConfianca(valor: number | null, ruleset: Ruleset): { grau: 1|2|3|4|5; rotulo: string } | null` exportada por `src/modules/motor/confianca.ts` e reexportada em `src/modules/motor/index.ts`; tipo `FaixaConfianca`.

- [ ] **Step 1: Failing test** — `src/modules/motor/__tests__/confianca-exibicao.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'
import { carregarRuleset } from '../ruleset/carregar'
import { faixaDaConfianca } from '../confianca'

const ruleset = carregarRuleset(yamlBruto)

describe('faixa de confiança exibida', () => {
  it('mapeia as bordas exatas de cada faixa', () => {
    expect(faixaDaConfianca(80, ruleset)).toEqual({ grau: 1, rotulo: 'CONFIANÇA BOA' })
    expect(faixaDaConfianca(82.9, ruleset)?.grau).toBe(1)
    expect(faixaDaConfianca(83, ruleset)?.grau).toBe(2)
    expect(faixaDaConfianca(86, ruleset)?.grau).toBe(3)
    expect(faixaDaConfianca(89, ruleset)?.grau).toBe(4)
    expect(faixaDaConfianca(93, ruleset)).toEqual({ grau: 5, rotulo: 'CONFIANÇA MÁXIMA' })
    expect(faixaDaConfianca(95, ruleset)?.grau).toBe(5)
  })

  it('abaixo da primeira faixa cai no grau 1; null não tem faixa', () => {
    expect(faixaDaConfianca(60, ruleset)?.grau).toBe(1)
    expect(faixaDaConfianca(null, ruleset)).toBeNull()
  })

  it('trocar limiar no YAML muda a faixa sem mudar código', () => {
    const alterado = structuredClone(ruleset)
    alterado.confianca_exibicao.faixas = [
      { de: 0, grau: 1, rotulo: 'BAIXA' },
      { de: 90, grau: 5, rotulo: 'MÁXIMA' },
    ]
    expect(faixaDaConfianca(85, alterado)?.grau).toBe(1)
    expect(faixaDaConfianca(91, alterado)?.grau).toBe(5)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — export inexistente / schema rejeita bloco.

- [ ] **Step 3: YAML.** Antes do bloco `# GESTÃO DE BANCA` em `config/ruleset.v1.yaml`:

```yaml
# -----------------------------------------------------------------------------
# CONFIANÇA — EXIBIÇÃO (identidade 02)
#
# ⚠️  DEMONSTRAÇÃO. As 5 faixas traduzem o % (80–95 na prática) em intensidade
# visual (rampa de um só matiz). NÃO é a escala de 5 cores removida pelo
# ADR-0005: nenhuma faixa usa cor de apito. Calibração real: pergunta ao CJ.
# -----------------------------------------------------------------------------
confianca_exibicao:
  origem: demonstracao
  faixas:
    - { de: 80, grau: 1, rotulo: CONFIANÇA BOA }
    - { de: 83, grau: 2, rotulo: CONFIANÇA SÓLIDA }
    - { de: 86, grau: 3, rotulo: CONFIANÇA FORTE }
    - { de: 89, grau: 4, rotulo: CONFIANÇA MUITO FORTE }
    - { de: 93, grau: 5, rotulo: CONFIANÇA MÁXIMA }
```

- [ ] **Step 4: Schema.** Em `schema.ts`, após o bloco `confianca:`:

```ts
  /** Tradução do % em intensidade visual. Exibição, não estratégia. */
  confianca_exibicao: z.object({
    origem: z.enum(['homologado', 'demonstracao']),
    faixas: z
      .array(
        z.object({
          de: z.number(),
          grau: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
          rotulo: z.string().min(1),
        }),
      )
      .min(1),
  }),
```

- [ ] **Step 5: Função.** Em `confianca.ts`:

```ts
export type FaixaConfianca = { grau: 1 | 2 | 3 | 4 | 5; rotulo: string }

/** A faixa VISUAL do %. Abaixo da primeira faixa cai no grau 1 — confiança
 *  fora da amplitude esperada não pode sumir da tela. */
export function faixaDaConfianca(valor: number | null, ruleset: Ruleset): FaixaConfianca | null {
  if (valor === null) return null
  const ordenadas = [...ruleset.confianca_exibicao.faixas].sort((a, b) => a.de - b.de)
  let atual = ordenadas[0]!
  for (const faixa of ordenadas) if (valor >= faixa.de) atual = faixa
  return { grau: atual.grau, rotulo: atual.rotulo }
}
```

Reexporte em `src/modules/motor/index.ts`: `export { calcularConfianca, faixaDaConfianca } from './confianca'` e `export type { FaixaConfianca } from './confianca'`.

- [ ] **Step 6: PASS + suíte inteira + commit** (`Escala de exibição da confiança no ruleset, marcada demonstração`).

---

### Task 3: Componentes `Avatar` e `Pilula`

**Files:**
- Create: `src/design-system/componentes/Avatar.tsx`
- Create: `src/design-system/componentes/Pilula.tsx`
- Modify: `src/design-system/componentes/index.ts`
- Test: `src/design-system/__tests__/avatar.test.ts` (novo)

**Interfaces:**
- Produces:
  `Avatar({ nome, fotoUrl, timeSigla, nivelApito, turbo?, tamanho? }: { nome: string; fotoUrl: string | null; timeSigla: string; nivelApito: NivelApito | null; turbo?: boolean; tamanho?: number })` — quadrado arredondado; foto (`next/image`, `object-fit: cover`, `object-position: top`) ou monograma (iniciais em `semantico.fonteTitulo`, fundo determinístico por `timeSigla`); anel externo de `componente.avatarAnelEspessura` na cor do apito (turbo = azul) + numeral `N{n}`/`T` no canto. `nivelApito null` = sem anel.
  `Pilula({ texto, cor, brilho?, tamanho? }: { texto: string; cor: string; brilho?: boolean; tamanho?: 'padrao' | 'hero' })` — contorno `componente.pilulaBordaLargura`, texto na mesma cor, `boxShadow: 0 0 14px 1px ${cor}66` quando `brilho`.
  Helpers exportados para teste: `iniciaisDe(nome: string): string`, `fundoDoTime(sigla: string): string`.

- [ ] **Step 1: Failing test** — `src/design-system/__tests__/avatar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Avatar, iniciaisDe, fundoDoTime } from '../componentes/Avatar'

describe('Avatar', () => {
  it('iniciais: duas letras, das duas primeiras palavras', () => {
    expect(iniciaisDe('D. Malloy')).toBe('DM')
    expect(iniciaisDe('stephen Curry')).toBe('SC')
    expect(iniciaisDe('Jokic')).toBe('J')
  })

  it('fundo é determinístico por sigla', () => {
    expect(fundoDoTime('LAL')).toBe(fundoDoTime('LAL'))
    expect(fundoDoTime('LAL')).not.toBe(fundoDoTime('BOS'))
  })

  it('sem foto renderiza monograma; com foto renderiza <img>', () => {
    const sem = renderToStaticMarkup(
      createElement(Avatar, { nome: 'D. Malloy', fotoUrl: null, timeSigla: 'LAL', nivelApito: 3 }),
    )
    expect(sem).toContain('DM')
    expect(sem).not.toContain('<img')

    const com = renderToStaticMarkup(
      createElement(Avatar, {
        nome: 'D. Malloy',
        fotoUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png',
        timeSigla: 'LAL',
        nivelApito: 3,
      }),
    )
    expect(com).toContain('<img')
  })

  it('o numeral do nível acompanha o anel (redundância do canal)', () => {
    const html = renderToStaticMarkup(
      createElement(Avatar, { nome: 'X', fotoUrl: null, timeSigla: 'LAL', nivelApito: 2 }),
    )
    expect(html).toContain('N2')
  })
})
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: `Avatar.tsx`** (use `next/image` com `unoptimized` FALSE; para o teste SSR, `next/image` renderiza `<img>`):

```tsx
import Image from 'next/image'
import type { NivelApito } from '../../modules/motor/tipos'
import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'
import { APITO, TURBO } from '../tokens/css'

export function iniciaisDe(nome: string): string {
  return nome
    .split(/\s+/)
    .filter((p) => /[a-zà-ú]/i.test(p))
    .slice(0, 2)
    .map((p) => (p.replace(/[^a-zà-ú]/gi, '')[0] ?? '').toUpperCase())
    .join('')
}

const FUNDOS = [semantico.superficieElevada, '#243147', '#1E2A3E', '#2C2438', '#1F3038', '#332A22'] as const

export function fundoDoTime(sigla: string): string {
  let h = 0
  for (const c of sigla) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return FUNDOS[h % FUNDOS.length]!
}

export function Avatar({
  nome, fotoUrl, timeSigla, nivelApito, turbo = false, tamanho = 52,
}: {
  nome: string; fotoUrl: string | null; timeSigla: string
  nivelApito: NivelApito | null; turbo?: boolean; tamanho?: number
}) {
  const anel = nivelApito === null ? null : turbo ? TURBO : APITO[nivelApito]
  const selo = nivelApito === null ? null : turbo ? 'T' : `N${nivelApito}`

  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho, flexShrink: 0 }}>
      <div
        aria-hidden
        style={{
          width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden',
          background: fundoDoTime(timeSigla),
          border: anel ? `${componente.avatarAnelEspessura} solid ${anel.cor}` : `1px solid ${semantico.divisor}`,
          display: 'grid', placeItems: 'center',
        }}
      >
        {fotoUrl ? (
          <Image
            src={fotoUrl} alt="" width={tamanho} height={tamanho}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
          />
        ) : (
          <span style={{ fontFamily: semantico.fonteTitulo, fontSize: tamanho * 0.34, color: semantico.textoSecundario, letterSpacing: 1 }}>
            {iniciaisDe(nome)}
          </span>
        )}
      </div>
      {anel && (
        <span
          aria-label={turbo ? 'Turbo' : `Nível do apito ${nivelApito}`}
          style={{
            position: 'absolute', right: -4, bottom: -4, fontSize: 9, fontWeight: 700,
            fontFamily: semantico.fonteRotulo, color: semantico.textoSobreCor,
            background: anel.cor, borderRadius: 5, padding: '1px 4px', lineHeight: 1.4,
          }}
        >
          {selo}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: `Pilula.tsx`:**

```tsx
import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

/** A moldura de contorno da identidade 02. A COR vem de quem chama
 *  (CONFIANCA_GRAU, semantico.aoVivo...) — a pílula não conhece domínio. */
export function Pilula({
  texto, cor, brilho = false, tamanho = 'padrao',
}: { texto: string; cor: string; brilho?: boolean; tamanho?: 'padrao' | 'hero' }) {
  const hero = tamanho === 'hero'
  return (
    <span
      style={{
        display: 'inline-block', whiteSpace: 'nowrap',
        padding: hero ? '6px 16px' : '4px 12px', borderRadius: 10,
        border: `${componente.pilulaBordaLargura} solid ${cor}`, color: cor,
        fontFamily: semantico.fonteTitulo, fontSize: hero ? 34 : 18,
        lineHeight: 1.2, fontVariantNumeric: 'tabular-nums',
        boxShadow: brilho ? `0 0 14px 1px ${cor}66` : undefined,
      }}
    >
      {texto}
    </span>
  )
}
```

- [ ] **Step 5: Exportar** no `componentes/index.ts` (`Avatar`, `Pilula` e helpers) → testes PASS.

- [ ] **Step 6: Verificação completa + commit** (`Avatar com anel do apito e Pilula de contorno — as duas peças novas da identidade`).

---

### Task 4: `CardEntrada` reescrito (lista + fire live)

**Files:**
- Modify: `src/design-system/componentes/CardEntrada.tsx` (reescrita)
- Modify: `src/design-system/componentes/Anel.tsx` → **apagar** (o canal do apito migrou para o Avatar); remover export do `index.ts` e usos
- Modify: `src/app/(admin)/admin/galeria/page.tsx` (galeria mostra os estados novos)
- Modify: `src/modules/entrega/__tests__/estatisticas.test.ts` e
  `src/modules/entrega/__tests__/lista-secreta.test.ts` — os dois montam
  `CardEntrada` e quebram com as props novas
- Test: `src/design-system/__tests__/card.test.ts` (novo)

**Interfaces:**
- Consumes: `Avatar`, `Pilula`, `CONFIANCA_GRAU`, `NIVEL_JOGADOR`, `faixaDaConfianca` (o grau chega POR PROP — o card não lê ruleset).
- Produces: novas props do `CardEntrada`:

```ts
export type CardEntradaProps = {
  nome: string
  jogadorHref?: string | null
  fotoUrl?: string | null
  timeSigla: string
  timeNome: string
  posicao: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: NivelApito
  confianca: number | null
  /** Grau visual (1..5) calculado por faixaDaConfianca na TELA. */
  grauConfianca: 1 | 2 | 3 | 4 | 5 | null
  turbo?: boolean
  modoFire?: boolean
  opdOrigemNivel?: NivelApito | null
  linha?: number | null       // exibida como "PONTOS 20+" — NUNCA meio ponto
  alvo1Q?: number | null
  vivo?: boolean              // selo VIVO (fire live)
  progresso1Q?: { observado: number; alvo: number } | null
}
```

(props `odd` e `historico` SAEM — a odd vive só no detalhe.)

- [ ] **Step 1: Failing test** — `src/design-system/__tests__/card.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardEntrada } from '../componentes/CardEntrada'

const base = {
  nome: 'D. Malloy', timeSigla: 'LAL', timeNome: 'Lakers', posicao: 'G',
  atributo: 'PONTOS' as const, nivelJogador: 'MVP' as const, nivelApito: 3 as const,
  confianca: 92, grauConfianca: 4 as const, fotoUrl: null,
}

describe('CardEntrada (identidade 02)', () => {
  it('linha inteira com sufixo +, nunca meio ponto', () => {
    const html = renderToStaticMarkup(createElement(CardEntrada, { ...base, linha: 20 }))
    expect(html).toContain('PONTOS 20+')
    expect(html).not.toContain('20,5')
    expect(html).not.toContain('19,5')
  })

  it('brilha SOMENTE no grau máximo de confiança', () => {
    const comum = renderToStaticMarkup(createElement(CardEntrada, { ...base, linha: 20 }))
    const maximo = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, grauConfianca: 5, linha: 20 }),
    )
    expect(maximo).toContain('box-shadow')
    expect(comum).not.toContain('box-shadow')
  })

  it('turbo e modo fire têm selo escrito, não brilho', () => {
    const html = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, turbo: true, modoFire: true, linha: 20 }),
    )
    expect(html).toContain('TURBO')
    expect(html).toContain('MODO FIRE')
    expect(html).not.toContain('box-shadow')
  })

  it('fire live: selo VIVO e barra de progresso com o texto do estado', () => {
    const batida = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, vivo: true, alvo1Q: 12, progresso1Q: { observado: 14, alvo: 12 } }),
    )
    expect(batida).toContain('VIVO')
    expect(batida).toContain('LINHA BATIDA')

    const parcial = renderToStaticMarkup(
      createElement(CardEntrada, { ...base, vivo: true, alvo1Q: 12, progresso1Q: { observado: 9, alvo: 12 } }),
    )
    expect(parcial).toContain('FALTA 3 PTS')
  })

  it('nível do jogador e do apito têm redundância textual', () => {
    const html = renderToStaticMarkup(createElement(CardEntrada, { ...base, linha: 20 }))
    expect(html).toContain('MVP')
    expect(html).toContain('N3')
  })
})
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Reescrever `CardEntrada.tsx`.** Estrutura (código completo):

```tsx
import type { Atributo, Nivel, NivelApito } from '../../modules/motor/tipos'
import { componente } from '../tokens/componente'
import { CONFIANCA_GRAU, MODO_FIRE, NIVEL_JOGADOR, TURBO } from '../tokens/css'
import { semantico } from '../tokens/semantico'
import { Avatar } from './Avatar'
import { Pilula } from './Pilula'
import { Selo } from './Selo'

const ATRIBUTO_ROTULO: Record<Atributo, string> = { PONTOS: 'PONTOS', REBOTES: 'REBOTES', ASSISTENCIAS: 'ASSISTÊNCIAS' }
const ATRIBUTO_CURTO: Record<Atributo, string> = { PONTOS: 'PTS', REBOTES: 'REB', ASSISTENCIAS: 'AST' }

export type CardEntradaProps = { /* exatamente o bloco de Interfaces acima */ }

export function CardEntrada(props: CardEntradaProps) {
  const nivel = NIVEL_JOGADOR[props.nivelJogador]
  const grau = props.grauConfianca
  const corPilula = grau === null ? semantico.divisor : CONFIANCA_GRAU[grau]
  const brilha = grau === 5 // regra DO MOCKUP: só a faixa máxima brilha
  const rotuloLinha =
    props.linha != null
      ? `${ATRIBUTO_ROTULO[props.atributo]} ${props.linha}+`
      : props.alvo1Q != null
        ? `${ATRIBUTO_ROTULO[props.atributo]} · ALVO 1Q ${props.alvo1Q}`
        : ATRIBUTO_ROTULO[props.atributo]
  const p = props.progresso1Q
  const faltam = p ? Math.max(0, p.alvo - p.observado) : 0

  return (
    <div>
      {/* faixa metálica CURTA = nível do jogador */}
      <div aria-hidden style={{ width: 56, height: componente.faixaNivelAltura, borderRadius: 2, background: nivel.cor, marginBottom: 4 }} />
      <article
        style={{
          display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 14,
          background: componente.cardFundo, color: componente.cardTexto,
          border: `1px solid ${brilha ? corPilula : semantico.divisor}`,
          boxShadow: brilha ? `0 0 16px 1px ${corPilula}55` : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar nome={props.nome} fotoUrl={props.fotoUrl ?? null} timeSigla={props.timeSigla}
                  nivelApito={props.nivelApito} turbo={props.turbo} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontFamily: semantico.fonteTitulo, fontSize: 18, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {props.jogadorHref ? <a href={props.jogadorHref} style={{ color: 'inherit', textUnderlineOffset: 3 }}>{props.nome}</a> : props.nome}
              </strong>
              {props.vivo && <Pilula texto="VIVO" cor={semantico.aoVivo} />}
            </div>
            <div style={{ fontFamily: semantico.fonteRotulo, fontSize: 12, letterSpacing: 1, color: componente.cardTextoApoio, textTransform: 'uppercase' }}>
              {rotuloLinha} · {nivel.rotulo} · N{props.nivelApito}
              {props.posicao ? ` · ${props.posicao}` : ''} · {props.timeSigla}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {props.turbo && <Selo icone="⚡" rotulo="TURBO" cor={TURBO.cor} />}
              {props.modoFire && <Selo icone="🔥" rotulo="MODO FIRE" cor={MODO_FIRE.cor} />}
              {props.opdOrigemNivel != null && <Selo icone="↗" rotulo={`OPD nível ${props.opdOrigemNivel}`} />}
            </div>
          </div>
          <Pilula texto={props.confianca === null ? '—' : `${Math.round(props.confianca)}%`} cor={corPilula} brilho={brilha} />
        </div>

        {p && (
          <div>
            <div aria-hidden style={{ height: 5, borderRadius: 3, background: semantico.superficieElevada, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, (p.observado / Math.max(1, p.alvo)) * 100)}%`, height: '100%', background: corPilula }} />
            </div>
            <div style={{ fontFamily: semantico.fonteRotulo, fontSize: 11, letterSpacing: 1, marginTop: 4, color: componente.cardTextoApoio }}>
              {p.observado >= p.alvo
                ? `LINHA BATIDA · ${p.observado} ${ATRIBUTO_CURTO[props.atributo]}`
                : `FALTA ${faltam} ${ATRIBUTO_CURTO[props.atributo]}`}
            </div>
          </div>
        )}
      </article>
    </div>
  )
}
```

- [ ] **Step 4: Apagar `Anel.tsx`**, remover do `index.ts`; atualizar quem o usava (`como-funciona/page.tsx` importa `Anel` — troque a demonstração da seção "círculo colorido" por `Avatar` com `nivelApito`). `grep -rn "Anel" src` até zerar.

- [ ] **Step 5: Galeria.** Em `admin/galeria/page.tsx`, mostrar: card comum (grau 3), card grau 5 (brilha), card turbo+fire, card fire-live com `vivo` e as duas barras (batida/parcial), avatar com e sem foto, as 5 pílulas `CONFIANCA_GRAU`.

- [ ] **Step 6: Testes + verificação completa.** As fumaças existentes usam o card com props antigas — atualizar chamadas nas telas é a Task 6/7/8; nesta task o typecheck DEVE apontar todos os call sites: corrija-os passando `grauConfianca: null` provisório (as telas certas chegam nas tasks seguintes). Commit (`CardEntrada da identidade 02: faixa metálica, avatar com anel, pílula que só brilha no grau máximo`).

---

### Task 5: `CabecalhoTela`, abas SVG e chips laranja

**Files:**
- Create: `src/components/navegacao/CabecalhoTela.tsx`
- Create: `src/components/navegacao/icones.tsx`
- Modify: `src/components/navegacao/BarraInferior.tsx`
- Modify: `src/components/navegacao/index.ts`
- Test: `src/app/__tests__/navegacao.test.ts` (novo)

**Interfaces:**
- Produces:
  `type Aba = 'lista' | 'fire-live' | 'stats' | 'gestao' | 'conta'` (**'resultados' sai; 'stats' entra**);
  `CabecalhoTela({ sobrancelha, titulo, contexto?, voltarHref?, children? }: { sobrancelha: string; titulo: string; contexto?: 'padrao' | 'aoVivo'; voltarHref?: string; children?: ReactNode })`;
  `IconeAba({ forma, ativo }: { forma: 'quadrado' | 'quadradoVazado' | 'circulo' | 'losango'; ativo: boolean })` em `icones.tsx`;
  `Chip({ href, ativo, children })` exportado de `CabecalhoTela.tsx` (contorno+texto `semantico.acento` quando ativo).

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarraInferior } from '../../components/navegacao'
import { CabecalhoTela } from '../../components/navegacao'

describe('navegação (identidade 02)', () => {
  it('as cinco abas do mockup, sem emoji, com SVG', () => {
    const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'lista' }))
    for (const rotulo of ['ENTRADAS', 'AO VIVO', 'STATS', 'GESTÃO', 'PERFIL']) expect(html).toContain(rotulo)
    expect(html).not.toContain('RESULTADOS')
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/[📋🔥✅💰👤]/u)
  })

  it('cabeçalho: sobrancelha + título; contexto aoVivo muda a cor do marcador', () => {
    const padrao = renderToStaticMarkup(
      createElement(CabecalhoTela, { sobrancelha: 'LISTA SECRETA · PRÉ-LIVE', titulo: 'LISTA DO DIA' }),
    )
    expect(padrao).toContain('LISTA SECRETA · PRÉ-LIVE')
    expect(padrao).toContain('LISTA DO DIA')

    const vivo = renderToStaticMarkup(
      createElement(CabecalhoTela, { sobrancelha: 'FIRE LIVE · AO VIVO', titulo: 'ACONTECENDO', contexto: 'aoVivo' }),
    )
    expect(vivo).toContain('ACONTECENDO')
  })
})
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: `icones.tsx`** — quatro formas em SVG 20×20, `fill` quando ativo (`semantico.acento`), `stroke` `semantico.textoSecundario` quando não:

```tsx
export function IconeAba({ forma, ativo }: { forma: 'quadrado' | 'quadradoVazado' | 'circulo' | 'losango'; ativo: boolean }) {
  const cor = ativo ? semantico.acento : semantico.textoSecundario
  const comum = { width: 18, height: 18, viewBox: '0 0 20 20', 'aria-hidden': true } as const
  if (forma === 'losango')
    return <svg {...comum}><rect x={4.5} y={4.5} width={11} height={11} rx={2} transform="rotate(45 10 10)" fill={ativo ? cor : 'none'} stroke={cor} strokeWidth={1.6} /></svg>
  if (forma === 'circulo')
    return <svg {...comum}><circle cx={10} cy={10} r={6.5} fill={ativo ? cor : 'none'} stroke={cor} strokeWidth={1.6} /></svg>
  return <svg {...comum}><rect x={3.5} y={3.5} width={13} height={13} rx={4} fill={ativo && forma === 'quadrado' ? cor : 'none'} stroke={cor} strokeWidth={1.6} /></svg>
}
```

- [ ] **Step 4: `BarraInferior.tsx`** — nova lista:

```ts
const ABAS: { id: Aba; href: string; rotulo: string; forma: 'quadrado' | 'quadradoVazado' | 'circulo' | 'losango' }[] = [
  { id: 'lista', href: '/', rotulo: 'ENTRADAS', forma: 'quadrado' },
  { id: 'fire-live', href: '/fire-live', rotulo: 'AO VIVO', forma: 'quadradoVazado' },
  { id: 'stats', href: '/estatisticas', rotulo: 'STATS', forma: 'circulo' },
  { id: 'gestao', href: '/gestao', rotulo: 'GESTÃO', forma: 'losango' },
  { id: 'conta', href: '/conta', rotulo: 'PERFIL', forma: 'circulo' },
]
```

Rótulo em `semantico.fonteRotulo`, `letterSpacing: 1.5`; ativo = `semantico.acento` (troca o border-top branco por transparente — o preenchimento do ícone já marca).

- [ ] **Step 5: `CabecalhoTela.tsx`:**

```tsx
export function CabecalhoTela({ sobrancelha, titulo, contexto = 'padrao', voltarHref, children }: Props) {
  const corMarcador = contexto === 'aoVivo' ? semantico.aoVivo : semantico.acento
  return (
    <header style={{ marginBottom: 16 }}>
      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: semantico.fonteRotulo, fontSize: 12, letterSpacing: 2, color: corMarcador, textTransform: 'uppercase' }}>
        {voltarHref ? (
          <Link href={voltarHref} aria-label="Voltar" style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, border: `1.5px solid ${semantico.acento}`, color: semantico.acento, textDecoration: 'none' }}>←</Link>
        ) : (
          <span aria-hidden style={{ width: 8, height: 8, background: corMarcador, transform: contexto === 'aoVivo' ? undefined : 'rotate(45deg)' }} />
        )}
        {sobrancelha}
      </p>
      <h1 style={{ margin: '6px 0 0', fontFamily: semantico.fonteTitulo, fontSize: 30, letterSpacing: 0.5, textTransform: 'uppercase' }}>{titulo}</h1>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{children}</div>}
    </header>
  )
}

export function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={ativo ? 'page' : undefined}
      style={{ padding: '5px 14px', borderRadius: 999, fontFamily: semantico.fonteRotulo, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', textDecoration: 'none',
        color: ativo ? semantico.acento : semantico.textoSecundario,
        border: `1.5px solid ${ativo ? semantico.acento : semantico.divisor}`, background: 'transparent' }}>
      {children}
    </Link>
  )
}
```

- [ ] **Step 6: Aba type.** Trocar `'resultados'` por `'stats'` no type `Aba` quebra `/resultados/page.tsx` (usa `aba="resultados"`) → trocar para `aba="lista"`. Testes PASS + verificação completa + commit (`Navegação da identidade 02: cinco abas do mockup, cabeçalho padrão e chips laranja`).

---

### Task 6: Módulo `detalhe-apito` (entrega)

**Files:**
- Create: `src/modules/entrega/detalhe-apito.ts`
- Test: `src/modules/entrega/__tests__/detalhe-apito.test.ts` (novo, PGlite + seed real)

**Interfaces:**
- Consumes: `lerFeed`/`ItemFeed` de `./lista-secreta`; `deltaOscilacao` de `../motor/atributos`; `calendarioDoRuleset, temporadaDe` de `../dominio/temporada`; tabelas `estatisticasJogo, jogos, times, mediasJogador, lesoesEscalacao, jogadores, niveis, niveisVersao`.
- Produces:

```ts
export type BlocoJogo = { adversarioSigla: string; valor: number; bateu: boolean }
export type DetalheApito = {
  mediaTemporada: number | null
  bateu: { acertos: number; total: number }     // últimos 5 jogos vs linha do item
  minutosRecentes: number | null                // do jogo mais recente
  blocos: BlocoJogo[]                           // até 5, mais ANTIGO primeiro
  porQueEntrou: string[]                        // 1-2 frases, já prontas para a tela
}
export async function detalheDoApito(db: Db, ruleset: Ruleset, item: ItemFeed): Promise<DetalheApito>
```

- [ ] **Step 1: Failing test:**

```ts
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed } from '../lista-secreta'
import { detalheDoApito } from '../detalhe-apito'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'

describe('detalhe do apito', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
    await semearDemo(banco.db, ruleset, AGORA)
  }, 120_000)
  afterAll(async () => banco.fechar())

  async function itemDe(nome: string, metodo?: string) {
    const feed = await lerFeed(banco.db, HOJE)
    return feed!.conteudo.itens.find((i) => i.nome === nome && (!metodo || i.metodo === metodo))!
  }

  it('a média é a da TEMPORADA — a que o motor usou (regra do CJ, não MÉDIA 5J)', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('LeBron James'))
    expect(d.mediaTemporada).toBeCloseTo(25.7, 1)
  })

  it('bateu x/5 confere valor contra a linha nos últimos 5 jogos', async () => {
    const item = await itemDe('LeBron James')
    const d = await detalheDoApito(banco.db, ruleset, item)
    expect(d.bateu.total).toBe(5)
    expect(d.blocos).toHaveLength(5)
    const acertos = d.blocos.filter((b) => b.bateu).length
    expect(d.bateu.acertos).toBe(acertos)
    for (const b of d.blocos) expect(b.bateu).toBe(b.valor >= (item.linha ?? Infinity))
  })

  it('cada bloco nomeia o adversário daquele jogo', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('LeBron James'))
    // LeBron é PHI na lista do CJ; a rodada da demo repete LAL x PHI.
    for (const b of d.blocos) expect(b.adversarioSigla).toBe('LAL')
  })

  it('oscilação: o porquê nomeia o limiar média − delta do ruleset', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('LeBron James', 'OSCILACAO'))
    const texto = d.porQueEntrou.join(' ')
    expect(texto).toContain('20,7')  // 25,7 − 5
    expect(texto).toContain('25,7')
  })

  it('OPD: o porquê nomeia quem está fora', async () => {
    const d = await detalheDoApito(banco.db, ruleset, await itemDe('Austin Reaves', 'OPD'))
    expect(d.porQueEntrou.join(' ')).toContain('Luka')
  })
})
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar.** Cabeçalho do módulo:

```ts
// Leitura DERIVADA: descreve o que o motor já decidiu, não decide nada novo.
// Por isso vive na entrega e não no motor — nenhuma regra nova nasce aqui.
export async function detalheDoApito(
  db: Db,
  ruleset: Ruleset,
  item: ItemFeed,
): Promise<DetalheApito> {
  // 1º passo obrigatório: buscar o jogo do item — dele saem a data (para a
  // temporada e para recortar o histórico) e os dois times (para o adversário).
```

Passos internos (todos com Drizzle, sem SQL cru):

1. **Média:** `mediasJogador` where `jogadorId`, `janela = 'TEMPORADA'`, temporada de `temporadaDe(jogo.dataHoraUtc, calendarioDoRuleset(ruleset))` — busque o `jogos` do `item.jogoId` primeiro para ter a data. Campo por atributo (`ppg/rpg/apg`).
2. **Últimos 5:** `estatisticasJogo` join `jogos` where `jogadorId` e `jogos.dataHoraUtc < dataHoraUtc do jogo do item`, order desc, limit 5. `valor` por `item.atributo` (pontos/rebotesTotal/assistencias). `minutosRecentes = Number(minutos)` do primeiro.
3. **Adversário:** o time do jogador vem de `niveis` (versão ativa) — `timeId` da linha do jogador; adversário = o outro time do jogo; sigla via `times`. (NÃO usar `jogadores.timeId`: a regra dos elencos projetados vale aqui, é estratégia.)
4. **Blocos:** reverter para mais antigo primeiro; `bateu = valor >= item.linha` (item de Fire Live tem `linha null` → `bateu: { 0, 0 }`, blocos com `bateu: false`? Não: use `item.linha ?? item.alvo1Q ?? Infinity` — para Fire Live compara com alvo1Q).
5. **`porQueEntrou`:**
   - `metodo === 'OSCILACAO'`: `delta = deltaOscilacao(item.nivelJogador, item.atributo, item.jogadorId, ruleset)`; limiar = média − delta; conta os jogos consecutivos ≤ limiar do mais recente; frases: `◆ ${n} jogo(s) seguido(s) abaixo de ${fmt(limiar)} ${unidade}.` e `Média da temporada: ${fmt(media)}.` (fmt = vírgula decimal, 1 casa).
   - `metodo === 'OPD'`: `lesoesEscalacao` where `jogoId = item.jogoId`, `status = 'FORA'`, join `jogadores` → nomes; frase: `◆ ${nomes.join(', ')} fora da partida — oportunidade nível ${item.opdOrigemNivel} pela hierarquia do time.`
   - `metodo null` (fire live): `◆ Cruzou o alvo do 1º quarto (${item.alvo1Q}).`

- [ ] **Step 4: PASS + verificação completa + commit** (`Detalhe do apito: contexto derivado do que o motor decidiu — média da temporada, 5 jogos na linha, o porquê com a regra que disparou`).

---

### Task 7: Tela do detalhe da entrada redesenhada

**Files:**
- Modify: `src/app/(app)/apito/[jogadorId]/page.tsx`
- Test: `src/app/__tests__/telas-demo.test.ts` (estender)

**Interfaces:**
- Consumes: `detalheDoApito`, `faixaDaConfianca` (via reexport — mas `src/app` NÃO importa valor do motor! → a tela chama `faixaDaConfianca` re-exposta pela ENTREGA: adicione em `src/modules/entrega/lista-secreta.ts` o reexport `export { faixaDaConfianca } from '../motor/confianca'` e importe DELE), `CabecalhoTela`, `Pilula`, `Avatar`, `CONFIANCA_GRAU`.

- [ ] **Step 1: Failing test** (em `telas-demo.test.ts`, no describe do detalhe):

```ts
it('detalhe redesenhado: faixa, três caixas, blocos e por quê', async () => {
  const { lerFeed } = await import('../../modules/entrega/lista-secreta')
  const feed = await lerFeed(banco.db, HOJE)
  const lebron = feed!.conteudo.itens.find((i) => i.nome === 'LeBron James')!
  const { default: Pagina } = await import('../(app)/apito/[jogadorId]/page')
  const html = renderToStaticMarkup(await Pagina({
    params: Promise.resolve({ jogadorId: lebron.jogadorId }),
    searchParams: Promise.resolve({ atributo: 'PONTOS' }),
  }))
  expect(html).toMatch(/CONFIANÇA (BOA|SÓLIDA|FORTE|MUITO FORTE|MÁXIMA)/)
  expect(html).toContain('MÉDIA')
  expect(html).toContain('BATEU')
  expect(html).toContain('ÚLTIMOS 5 JOGOS NA LINHA')
  expect(html).toContain('POR QUE ENTROU')
  expect(html).toContain('VER ESTATÍSTICAS')
  expect(html).not.toContain('ALTÍSSIMO VALOR')
  expect(html).not.toContain('MÉDIA 5J')
})
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Redesenhar a página.** Ordem das seções (mantendo guards de sessão/acesso e a lista de linhas+odds que já existe no fim):

1. `CabecalhoTela` com `voltarHref="/"`, sobrancelha `LISTA SECRETA · PRÉ-LIVE`, título = nome do jogador.
2. Hero: `faixa = faixaDaConfianca(principal.confianca, ruleset)`; caixa com `border: 1.5px solid CONFIANCA_GRAU[faixa.grau]`, brilho se grau 5; dentro: rótulo `faixa.rotulo` (fonteRotulo, cor do grau), `{ATRIBUTO} {linha}+` e o `%` grande em Anton.
3. Três caixas de contorno (`MÉDIA` `fmt(d.mediaTemporada)`, `BATEU` `${d.bateu.acertos}/${d.bateu.total}`, `MIN` `${Math.round(d.minutosRecentes ?? 0)}'`).
4. `ÚLTIMOS 5 JOGOS NA LINHA`: blocos 44×44, `background: verde400` quando `bateu` senão `superficieElevada`, sigla embaixo em fonteRotulo.
5. `POR QUE ENTROU`: caixa com as frases de `d.porQueEntrou`.
6. Botão `VER ESTATÍSTICAS`: `<Link href={rotaDoJogador(id)}>` display block, `background: linear-gradient(90deg, ${semantico.acento}, #FFB25E)`, texto `semantico.textoSobreCor`, Anton.
7. Depois, a seção de linhas/odds existente (mantida).

- [ ] **Step 4: PASS + verificação completa + commit** (`Detalhe da entrada no desenho do mockup — com o conteúdo que a regra do CJ define`).

---

### Task 8: Entradas + Resultados com cabeçalho novo e seletor

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/resultados/page.tsx`
- Test: `src/app/__tests__/telas-demo.test.ts` (estender)

- [ ] **Step 1: Failing test:**

```ts
it('Entradas: cabeçalho do mockup + seletor Hoje/Resultados + grau na pílula', async () => {
  const { default: Pagina } = await import('../(app)/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  expect(html).toContain('LISTA SECRETA · PRÉ-LIVE')
  expect(html).toContain('LISTA DO DIA')
  expect(html).toContain('HOJE')
  expect(html).toContain('RESULTADOS')
  expect(html).toMatch(/PONTOS \d+\+/)
  // Nenhuma LINHA com meio ponto. Cegar em /\d,5/ seria errado: a tela de
  // Gestão exibe "0,5 unidade" legitimamente.
  expect(html).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
})

it('Resultados divide o cabeçalho com Entradas', async () => {
  const { default: Pagina } = await import('../(app)/resultados/page')
  const html = renderToStaticMarkup(await Pagina())
  expect(html).toContain('LISTA SECRETA')
  expect(html).toContain('HOJE')        // o seletor aparece nos dois lados
})
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: `page.tsx`.** Substituir o `<header>` atual por `CabecalhoTela` (sobrancelha `LISTA SECRETA · PRÉ-LIVE`, título `LISTA DO DIA`); primeiro grupo de chips = seletor `HOJE` (href `/`, ativo) e `RESULTADOS` (href `/resultados`); manter grupos de filtro trocando `Chip` local pelo `Chip` da navegação (apagar o local). Ao renderizar cards: `const faixa = faixaDaConfianca(item.confianca, ruleset)` (import da ENTREGA) e passar `grauConfianca={faixa?.grau ?? null}`, `fotoUrl={item.fotoUrl}` — **`ItemFeed` ainda não carrega fotoUrl**: acrescente `fotoUrl: string | null` ao `ItemFeed` e ao `enriquecer()` em `lista-secreta.ts` (join com `jogadores.fotoUrl` já existe? conferir função `enriquecer`; ela já consulta `jogadores` — incluir o campo). Republicar o feed é desnecessário em teste (o seed republica), mas snapshots antigos sem o campo → `fotoUrl ?? null`.
- [ ] **Step 4: `resultados/page.tsx`.** Trocar o header por `CabecalhoTela` com o MESMO seletor (RESULTADOS ativo); `aba="lista"`; cards da conferência ganham `Avatar` (foto virá do join — `JogadorConferido` ganha `fotoUrl: string | null` em `resultados.ts`, join já existente com `jogadores`).
- [ ] **Step 5: PASS + verificação completa + commit** (`Entradas e Resultados no cabeçalho do mockup, com seletor — Resultados sai da barra sem perder a rota`).

---

### Task 9: Fire Live — placar, selo VIVO, barra de progresso

**Files:**
- Modify: `src/app/(app)/fire-live/page.tsx`
- Modify: `src/modules/entrega/fire-live/feed.ts` (item ganha `fotoUrl`)
- Modify: `src/modules/ingestao/demo/semear.ts` (placar do jogo ao vivo)
- Test: `src/app/__tests__/telas-demo.test.ts` (estender)

- [ ] **Step 1: Failing test:**

```ts
it('Ao vivo: cabeçalho vermelho, placar 1Q, selo VIVO e barra de progresso', async () => {
  const { default: Pagina } = await import('../(app)/fire-live/page')
  const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
  expect(html).toContain('FIRE LIVE · AO VIVO')
  expect(html).toContain('ACONTECENDO')
  expect(html).toContain('1º Q')
  expect(html).toContain('OKC')          // placar do jogo ao vivo da demo
  expect(html).toContain('VIVO')
  expect(html).toMatch(/LINHA BATIDA|FALTA \d/)
})
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Seed.** No bloco do jogo ao vivo em `semear.ts`, gravar placar no `jogos` (update após criar): `placarCasa` = soma dos pontos 1Q dos jogadores OKC, `placarVisitante` idem DEN (derivado dos fatos já semeados — nenhum número novo).
- [ ] **Step 4: Feed.** `ItemFeedFireLive` (em `feed.ts`) ganha `fotoUrl: string | null` (join `jogadores` já disponível na materialização — conferir e incluir).
- [ ] **Step 5: Página.** `CabecalhoTela` contexto `aoVivo`, sobrancelha `FIRE LIVE · AO VIVO`, título `ACONTECENDO`. Antes dos cards, grade de placares: consulta `jogos` where `dataReferencia = hoje AND status = 'AO_VIVO' AND quartoAtual = ruleset.fire_live.quarto` join `times` (função pequena `placaresAoVivo(db, hoje, quarto)` DENTRO de `src/modules/entrega/fire-live/leitura.ts`); mini-card: `1º Q · ao vivo ●` (ponto em `semantico.aoVivo` com `animation: pulse` — definir `@keyframes` no `globals.css`), sigla + pontos em Anton. Cards: `vivo`, `progresso1Q={{ observado: item.valorNoQuarto, alvo: item.alvo1Q }}`, `grauConfianca` — item do fire live tem `confianca: null` → pílula neutra sem brilho (correto: confiança é conceito pré-live).
- [ ] **Step 6: PASS + verificação completa + commit** (`Fire Live do mockup: placar do 1º quarto, selo VIVO e a barra rumo ao alvo`).

---

### Task 10: Demais telas (Stats aba, Gestão, Perfil, teoria, auth)

**Files:**
- Modify: `src/app/(app)/estatisticas/page.tsx` (Moldura aba `stats` + CabecalhoTela)
- Modify: `src/app/(app)/estatisticas/jogador/[id]/page.tsx` (Avatar no topo)
- Modify: `src/app/(app)/gestao/page.tsx`, `src/app/(app)/conta/page.tsx`
- Modify: `src/app/(app)/como-funciona/page.tsx` (régua turquesa)
- Modify: `src/app/(app)/entrar/page.tsx`, `cadastrar/page.tsx`, `assinar/page.tsx` (CTA gradiente)
- Test: `src/app/__tests__/telas-demo.test.ts` (estender)

- [ ] **Step 1: Failing test:**

```ts
it('a aba teórica mostra a régua de 5 faixas turquesa com rótulos, não a escala antiga', async () => {
  const { default: Pagina } = await import('../(app)/como-funciona/page')
  const html = renderToStaticMarkup(await Pagina())
  for (const r of ['CONFIANÇA BOA', 'CONFIANÇA SÓLIDA', 'CONFIANÇA FORTE', 'CONFIANÇA MUITO FORTE', 'CONFIANÇA MÁXIMA'])
    expect(html).toContain(r)
})
```

- [ ] **Step 2..5:** tela a tela:
  - **Stats:** `estatisticas/page.tsx` envolve em `Moldura aba="stats"` + `CabecalhoTela` (`◆ DADO CANÔNICO · SEM ESTRATÉGIA` / `STATS`); páginas de detalhe mantêm links de volta (aba null). Jogador: `Avatar` (nome, fotoUrl de `jogadores`, `nivelApito: null` — stats não mostra estratégia).
  - **Gestão:** `CabecalhoTela` (`◆ GESTÃO DE BANCA` / `PLANO DO DIA`); linhas ganham `Avatar` pequeno (`tamanho: 36`, `nivelApito` do item).
  - **Perfil:** `CabecalhoTela` (`◆ SUA CONTA` / `PERFIL`).
  - **Teoria:** seção de confiança ganha a régua: 5 caixinhas com `border: CONFIANCA_GRAU[g]` + rótulo do ruleset (`ruleset.confianca_exibicao.faixas`), nota `origem: demonstracao` se aplicável. Trocar o uso de `Anel` já feito na Task 4.
  - **Auth/assinar:** botões submit viram gradiente laranja (mesmo estilo do VER ESTATÍSTICAS), títulos em fonteTitulo.
- [ ] **Step 6: PASS + verificação completa + commit** (`Stats promovida a aba; Gestão, Perfil, teoria e auth na identidade 02`).

---

### Task 11: Fotos — mapa curado, script `demo:fotos`, remotePatterns

**Files:**
- Create: `src/modules/ingestao/demo/fotos.ts`
- Create: `scripts/demo-fotos.ts`
- Modify: `next.config.ts`, `package.json` (script `demo:fotos`)
- Test: `src/modules/ingestao/__tests__/demo-fotos.test.ts` (novo)

**Interfaces:**
- Produces: `MAPA_FOTOS: Record<string, number>` (nome EXATO da lista do CJ → personId NBA); `aplicarFotos(db: Db, verificar: (url: string) => Promise<boolean>): Promise<{ gravadas: number; puladas: string[] }>`; `urlDaFoto(personId: number): string`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { eq, isNotNull } from 'drizzle-orm'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores } from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { semearDemo } from '../demo/semear'
import { aplicarFotos, MAPA_FOTOS, urlDaFoto } from '../demo/fotos'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

describe('fotos da demonstração', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
    await semearDemo(banco.db, ruleset, new Date('2026-08-24T18:00:00.000Z'))
  }, 120_000)
  afterAll(async () => banco.fechar())

  it('todo nome do mapa existe na lista do CJ (grafia exata)', async () => {
    const nomes = new Set((await banco.db.select().from(jogadores)).map((j) => j.nomeCompleto))
    for (const nome of Object.keys(MAPA_FOTOS)) expect(nomes.has(nome), nome).toBe(true)
  })

  it('só grava URL que o verificador aprovou', async () => {
    const aprovadas = new Set([urlDaFoto(MAPA_FOTOS['Shai']!)])
    const r = await aplicarFotos(banco.db, async (url) => aprovadas.has(url))
    expect(r.gravadas).toBe(1)
    expect(r.puladas.length).toBe(Object.keys(MAPA_FOTOS).length - 1)
    const comFoto = await banco.db.select().from(jogadores).where(isNotNull(jogadores.fotoUrl))
    expect(comFoto).toHaveLength(1)
    expect(comFoto[0]!.fotoUrl).toContain('cdn.nba.com')
  })
})
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: `fotos.ts`.** Mapa inicial (grafias EXATAS da lista; ids verificados no Step 5):

```ts
export const MAPA_FOTOS: Record<string, number> = {
  // OKC / DEN — o jogo ao vivo da demo
  Shai: 1628983, Jokic: 203999, 'Jamal Murray': 1627750, Gordon: 203932,
  // LAL / PHI
  'Luka Doncic': 1629029, 'LeBron James': 2544, 'Austin Reaves': 1630559,
  // GSW / BOS
  'stephen Curry': 201939, Tatum: 1628369,
  // MIA / NYK
  Giannis: 203507, Adebayo: 1628389, Brunson: 1628973, Towns: 1626157,
}

export function urlDaFoto(personId: number): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`
}

export async function aplicarFotos(db: Db, verificar: (url: string) => Promise<boolean>) {
  const todos = await db.select().from(jogadores)
  const porNome = new Map(todos.map((j) => [j.nomeCompleto, j.id] as const))
  let gravadas = 0
  const puladas: string[] = []
  for (const [nome, personId] of Object.entries(MAPA_FOTOS)) {
    const id = porNome.get(nome)
    const url = urlDaFoto(personId)
    if (id === undefined || !(await verificar(url))) { puladas.push(nome); continue }
    await db.update(jogadores).set({ fotoUrl: url }).where(eq(jogadores.id, id))
    gravadas += 1
  }
  return { gravadas, puladas }
}
```

- [ ] **Step 4: Script + config.** `scripts/demo-fotos.ts` (padrão dos demais scripts): `aplicarFotos(getDb(), async (url) => { const r = await fetch(url); r.body?.cancel(); return r.ok })`, imprime gravadas/puladas. `package.json`: `"demo:fotos": "vite-node scripts/demo-fotos.ts"`. `next.config.ts`:

```ts
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.nba.com', pathname: '/headshots/**' }],
  },
```

- [ ] **Step 5: Conferência dos ids (manual, obrigatória).** Rode `for id in <cada id>; do curl -s -o /dev/null -w "$id %{http_code}\n" https://cdn.nba.com/headshots/nba/latest/1040x760/$id.png; done` — todo id precisa dar 200; depois rode `npm run demo:fotos` contra o Neon e abra a lista no app para conferir A OLHO que cada foto é o jogador certo (id trocado passa no 200). Corrija ids errados no mapa.
- [ ] **Step 6: PASS + verificação completa + commit** (`Fotos dos jogadores: mapa curado, verificação antes de gravar, imagem servida do nosso domínio`).

---

### Task 12: Fumaça final, docs, reseed e deploy

**Files:**
- Modify: `src/app/__tests__/telas-demo.test.ts` (asserções transversais)
- Modify: `docs/demonstracao.md`, `docs/04-design-system.md` (rampa de confiança + identidade 02), `docs/specs/README.md` (perguntas novas ao CJ)

- [ ] **Step 1: Asserções transversais** no `telas-demo.test.ts`:

```ts
describe('regras transversais da identidade', () => {
  it('nenhuma tela contém meio ponto, ALTÍSSIMO VALOR ou três pontos', async () => {
    for (const rota of ['../(app)/page', '../(app)/fire-live/page', '../(app)/gestao/page', '../(app)/resultados/page']) {
      const { default: Pagina } = await import(rota)
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).not.toMatch(/(PONTOS|REBOTES|ASSISTÊNCIAS)\s+\d+,\d/)
      expect(html).not.toContain('ALTÍSSIMO VALOR')
      expect(html).not.toContain('3 PONTOS')
    }
  })
})
```

(Nota: `/resultados` não recebe `searchParams` — chame `Pagina()`; ajuste por rota.)

- [ ] **Step 2: Suíte inteira + build**

```bash
npx tsc --noEmit && npm run lint && npm run boundaries && npx vitest run && npm run build
```

- [ ] **Step 3: Docs.** `docs/04-design-system.md`: seção nova "Identidade 02" (tipografia, pílula, rampa turquesa, regra do brilho = grau 5, colisão de canais testada). `docs/demonstracao.md`: fotos (fonte, risco de licença, `demo:fotos`) e a rampa como demonstração. `docs/specs/README.md`: acrescentar as 6 perguntas novas da spec à lista do CJ.
- [ ] **Step 4: Reseed + fotos + deploy**

```bash
npx dotenv -e .env.local -- npm run demo:limpar -- --confirmar
npx dotenv -e .env.local -- npm run demo:seed
npx dotenv -e .env.local -- npm run demo:fotos
npm run deploy:prod
```

Smoke: `curl -s -o /dev/null -w '%{http_code}' https://nba-projeto.vercel.app/` → 307 (login) e conferência visual logado.

- [ ] **Step 5: Commit final** (`Identidade 02 no ar: docs atualizados e demo ressemeada com fotos`).

---

## Self-review (feita na escrita)

- **Cobertura da spec:** §1→T1/T2 · §2→T3/T4 · §3→T11 · §4→T5/T8/T9/T10 · §5→T6/T7 · §6→espalhado em todos + T12. Perguntas ao CJ → T12/docs.
- **Tipos:** `grauConfianca: 1|2|3|4|5|null` (T4) = retorno de `faixaDaConfianca` (T2); `Aba` sem `'resultados'` (T5) refletido em T8; `ItemFeed.fotoUrl` (T8) consumido em T4 via prop.
- **Armadilha conhecida:** `src/app` não importa valor do motor — `faixaDaConfianca` chega às telas via reexport na ENTREGA (T7, Step: reexport em `lista-secreta.ts`). Boundaries verifica.
