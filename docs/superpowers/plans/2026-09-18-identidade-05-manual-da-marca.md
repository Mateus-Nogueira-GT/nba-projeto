# Identidade 05 · Manual da Marca — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vestir a NIP com a identidade do Manual da Marca (azul, vermelho, navy, Bebas Neue, Montserrat) e dar às telas a moldura do StatsHub (barra do topo no desktop, chips com menu, seções colapsáveis, lateral direita, paywall com silhuetas), sem tocar em dado de estratégia.

**Architecture:** Cinco fatias em ordem, cada uma útil sozinha: (1) tokens — a paleta e as fontes trocam em `primitivo.ts`/`semantico.ts`, o app inteiro muda de cor num diff e os usos do acento como tinta são convertidos em preenchimento ou branco; (2) moldura — uma `Moldura` de três regiões (cromo, conteúdo, lateral) decidida por CSS em 1024 e 1280 px, componente de servidor; (3) Lista Secreta na anatomia do Player Trends; (4) lateral com um leitor cacheado por dia; (5) paywall com silhuetas sem dado. O motor não muda; nenhuma leitura nova de dado pago.

**Tech Stack:** Next.js 16.3 App Router (server components, CSS Modules, `next/font/google`, `unstable_cache` + `revalidateTag` — o projeto NÃO liga `cacheComponents`), React 19, Drizzle + Postgres (PGlite nos testes), Vitest com `renderToStaticMarkup`, Chrome headless via CDP para captura.

**Spec:** [`docs/superpowers/specs/2026-09-18-identidade-05-manual-da-marca-design.md`](../specs/2026-09-18-identidade-05-manual-da-marca-design.md) · **Mockups:** canvas "Identidade 05 · Manual da Marca", um artboard por fase (spec §10), produzido com o parceiro antes da fase.

## Global Constraints

- **Domínio em português, infraestrutura em inglês.** Nomes de token, componente, prop e teste em português.
- **O motor não muda.** Nada em `src/modules/motor/**`. `npm run boundaries` continua verde; componente nunca importa `tokens/primitivo`.
- **Dado não é marca** (spec §3.1). Não mudam: `apitoNivel1/2/3`, `apitoTurbo`, `apitoModoFire` e as tintas `*Tinta`; `nivelMvp/AllStar/Suporte/Randola`; `confiancaGrau1..5`; `nota*`; `barrinhaBateu/Falhou`; `turboClaro/Escuro`; `avatarFundo2..6`; as durações; `textoSobreCor` (escuro) para o número no anel. `laranja400` e `laranjaVeu12` FICAM (nível 2).
- **Azul é preenchimento, nunca tinta** (spec §3.2). `acento`/`acentoClaro` só em `background`. Texto sobre azul ou vermelho é `textoSobreAcento` (branco). Anel de foco é branco. Um teste varre o código por acento em `color`, `border`, `outline`, `stroke`.
- **Vermelho: cheio no selo (`vivoSelo`), claro na tinta (`aoVivo`, `alerta`)** (spec §3.3).
- **Regra 3 vale para redação.** "MÉDIA · ODD MÉDIA" não muda. Nenhum rótulo, limiar ou regra de estratégia muda. Nunca "probabilidade" na UI.
- **Piso de 12 px é por tela**, dentro da fatia dela; nesta passada só a Lista e a moldura sobem (spec §3.8).
- **Manual, valores literais:** azul `#0057B8`, hover `#1F6BC1`, vermelho `#C8102E`, tinta clara `#FF5C70`, navy `#001D3D`, cinza `#A6ABB4`, fundo `#071426`, cartão `#101C30`, campo `#18243A`, divisória `#2A3852`; raio 8 (controle) e 12 (card); botão primário 48 px; espaçamento em base 8; ícones de traço 20 px; validação em 320, 390, 768 e 1440 sem rolagem horizontal.
- **Hex só em `primitivo.ts`.** `tokens.css` é gerado (`npm run tokens`); o teste de sincronia cobra.
- **Tela crua não entra.** Fases 1–5 têm gate: a tarefa só começa depois de o parceiro aprovar o artboard da fase no canvas. Aprovação parcial libera tarefa parcial. A fase 0 e a 6 não têm gate.
- **O paywall não vaza** (spec §8): nada do feed pago entra no HTML do grátis; `paywall.test.ts` continua e ganha asserções.
- **Verificação de cada tarefa:** `npx vitest run <alvos>`; **ao fim de cada fase:** `npm run tokens && npm run typecheck && npm run lint && npm run boundaries && npm test`, mais a captura (`scripts/captura-telas.sh`) comparada ao artboard.
- **Um commit só, no final** (preferência do parceiro, em MEMORY.md). As tarefas terminam em verificação; a Task 6.2 commita. Sem push, sem PR. Nunca commitar em `main`; a branch é `identidade-05-manual-da-marca` no worktree `nba-projeto-marca` (Task 0.1).
- **Disco:** antes de suíte, build ou captura, `df -h /`; abaixo de 3 GB livres, limpar `.next/` e os caches listados em MEMORY.md (`disco-cheio-mac`).

## Captura de tela para conferir com o artboard

```bash
# HTML real dos testes → Chrome headless nas larguras da spec, sem Next/Neon/.env
CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-
# uma tela só, uma largura só (depois da Task 2.4):
CAPTURA_LARGURAS=1440 CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-04-lista
```

O baseline das telas ANTES desta passada está em `.superpowers/capturas-baseline/` (390 e 1280). A captura é o que se compara com o artboard; não é teste automatizado.

---

# Fase 0 · Preparação — sem gate

### Task 0.1: Worktree, dependências e os dois documentos

**Files:**
- Create: worktree `../nba-projeto-marca` na branch `identidade-05-manual-da-marca`
- Copy: `docs/superpowers/specs/2026-09-18-identidade-05-manual-da-marca-design.md`, `docs/superpowers/plans/2026-09-18-identidade-05-manual-da-marca.md` (os dois estão sem commit no tree principal)

- [ ] **Step 1: Criar o worktree a partir de `main`**

```bash
cd /Users/mateusnascimentonogueiradasilva/nba-projeto
git worktree add ../nba-projeto-marca -b identidade-05-manual-da-marca main
cp docs/superpowers/specs/2026-09-18-identidade-05-manual-da-marca-design.md ../nba-projeto-marca/docs/superpowers/specs/
cp docs/superpowers/plans/2026-09-18-identidade-05-manual-da-marca.md ../nba-projeto-marca/docs/superpowers/plans/
cd ../nba-projeto-marca
ln -s ../nba-projeto/node_modules node_modules
```

- [ ] **Step 2: Provar que a suíte roda no worktree**

Run: `df -h / && npx vitest run src/design-system --reporter=dot`
Expected: todos verdes; se `ENOSPC`, limpar conforme MEMORY.md antes de seguir.

### Task 0.2: Medir o dígito tabular da Bebas Neue — decide `fonteNumero`

A spec (§4.4) só deixa a Bebas entrar em número que muda ao vivo se "88" e "11" tiverem a mesma largura. A medição é feita no Chrome com a fonte real, e o resultado vira UM token (`semantico.fonteNumero`, Task 1.1).

**Files:**
- Create: `scripts/medir-digitos.mjs`

- [ ] **Step 1: Escrever o script**

```js
// scripts/medir-digitos.mjs — mede, no Chrome headless, a largura de "88" e "11"
// numa família do Google Fonts. Uso: node scripts/medir-digitos.mjs "Bebas Neue"
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const familia = process.argv[2] ?? 'Bebas Neue'
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const dir = mkdtempSync(join(tmpdir(), 'digitos-'))
const html = join(dir, 'medir.html')
writeFileSync(
  html,
  `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia)}&display=block" rel="stylesheet">
</head><body><script>
(async () => {
  await document.fonts.load('34px "${familia}"');
  const c = document.createElement('canvas').getContext('2d');
  c.font = '34px "${familia}"';
  const largos = ['00','11','22','33','44','55','66','77','88','99'].map(d => c.measureText(d).width);
  const carregou = document.fonts.check('34px "${familia}"');
  document.title = JSON.stringify({ carregou, min: Math.min(...largos), max: Math.max(...largos) });
})();
</script></body></html>`,
)
const saida = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom', `file://${html}`], { encoding: 'utf8' })
const titulo = saida.stdout.match(/<title>(.*?)<\/title>/)?.[1]
if (!titulo) throw new Error('O Chrome não devolveu a medição.')
const { carregou, min, max } = JSON.parse(titulo.replace(/&quot;/g, '"'))
if (!carregou) throw new Error(`A fonte "${familia}" não carregou (sem rede?).`)
const tabular = max - min < 0.5
console.log(`${familia}: dígitos duplos entre ${min.toFixed(2)} e ${max.toFixed(2)} px → ${tabular ? 'TABULAR' : 'PROPORCIONAL'}`)
process.exit(0)
```

- [ ] **Step 2: Rodar e registrar o resultado**

Run: `node scripts/medir-digitos.mjs "Bebas Neue"`
Expected: uma linha `Bebas Neue: … → TABULAR` ou `→ PROPORCIONAL`. Anotar o resultado no topo da Task 1.1 (comentário do token `fonteNumero`). TABULAR → `fonteNumero: p.fonteBebas`; PROPORCIONAL → `fonteNumero: p.fonteMontserrat` e os números vivos ganham `fontVariantNumeric: 'tabular-nums'` (já têm).

---

# Fase 1 · Tokens — **gate: artboard "Tokens · galeria" aprovado**

### Task 1.1: A paleta e as fontes do manual entram no primitivo; o semântico remapeia; o CSS regenera

**Files:**
- Modify: `src/design-system/tokens/primitivo.ts`, `semantico.ts`, `componente.ts`
- Regenerate: `src/design-system/tokens/tokens.css` (`npm run tokens`)
- Test: `src/design-system/__tests__/tokens.test.ts`

**Interfaces (o que o resto do plano usa):**
```ts
semantico.textoSobreAcento   // '#FFFFFF' — texto sobre acento, acentoClaro, vivoSelo
semantico.cromo              // '#001D3D' — barra do topo, barra inferior, painel da marca
semantico.focoAnel           // '#FFFFFF' — outline de foco
semantico.fonteNumero        // Bebas ou Montserrat, conforme a Task 0.2
semantico.larguraTopo        // 1024 (número)
semantico.larguraLateral     // 1280 (número)
componente.ctaFundo / ctaFundoHover / ctaTexto / ctaAltura / raioControle / cardRaio
componente.foco              // `2px solid ${focoAnel}`
```

- [ ] **Step 1: Reescrever os testes que mudam (falham agora)**

Em `tokens.test.ts`:

```ts
// substitui 'o acento laranja é legível sobre superfície e o texto sobre o acento também'
it('o acento é PREENCHIMENTO: branco em cima passa em AA; o azul de interface é escuro o bastante para isso', () => {
  for (const fundo of [semantico.acento, semantico.acentoClaro, semantico.vivoSelo]) {
    expect(razaoDeContraste(semantico.textoSobreAcento, fundo)).toBeGreaterThanOrEqual(AA.texto)
  }
})

it('azul nunca é tinta: nenhum componente, tela ou CSS usa o acento em color, border, outline ou stroke', () => {
  const fontes = [
    ...['src/design-system/componentes', 'src/components', 'src/app'].flatMap((raiz) => arquivosSob(raiz)),
  ]
  const tinta = /(?:^|[\s{;,(])(?:color|stroke|border(?:Top|Right|Bottom|Left|Color)?|outline(?:Color)?)\s*[:=]\s*[^;\n]*(?:semantico\.acento(?:Claro)?\b|var\(--acento(?:-claro)?\))/
  const infratores = fontes.filter(({ conteudo }) => tinta.test(conteudo)).map((f) => f.arquivo)
  expect(infratores).toEqual([])
})

it('o único azul claro do sistema é o turbo', () => {
  // Se um dia alguém "clarear" o acento para usá-lo como texto, ele vira o 🔵 do CJ.
  expect(razaoDeContraste(semantico.acento, primitivo.branco)).toBeGreaterThanOrEqual(AA.texto)
  expect(razaoDeContraste(semantico.acentoClaro, primitivo.branco)).toBeGreaterThanOrEqual(AA.texto)
})
```

Com o auxiliar, no topo do arquivo (ao lado de `fontesDeComponente`):

```ts
function arquivosSob(raiz: string): { arquivo: string; conteudo: string }[] {
  const saida: { arquivo: string; conteudo: string }[] = []
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, nome.name)
      if (nome.isDirectory()) visitar(caminho)
      else if (/\.(tsx?|css)$/.test(nome.name) && !/__tests__/.test(caminho)) saida.push({ arquivo: caminho, conteudo: readFileSync(caminho, 'utf8') })
    }
  }
  visitar(raiz)
  return saida
}
```

E as trocas pontuais:

```ts
// 'temperatura por contexto: … o quente é o único com o veu laranja' → renomear para 'com o véu vermelho'; o corpo fica.
// 'texto em cinco opacidades…':
expect(semantico.texto100).toBe(primitivo.branco)
expect(valor, nome).toMatch(/^rgba\(255,255,255,\.\d+\)$/)
// 'ao vivo tem forma sólida e tinta próprias…':
expect(semantico.aoVivoTinta).toMatch(/^rgba\(255,92,112,\.\d+\)$/)
expect(semantico.aoVivoBorda).toMatch(/^rgba\(255,92,112,\.\d+\)$/)
```

Acrescentar, em `describe('camadas de token')`:

```ts
it('identidade 05: as cores do manual estão no primitivo, literalmente', () => {
  expect(primitivo.azulNip).toBe('#0057B8')
  expect(primitivo.vermelhoNip).toBe('#C8102E')
  expect(primitivo.navy).toBe('#001D3D')
  expect(primitivo.cinzaNip).toBe('#A6ABB4')
  expect([primitivo.fundoNip, primitivo.cartaoNip, primitivo.campoNip, primitivo.tinta500]).toEqual(['#071426', '#101C30', '#18243A', '#2A3852'])
  expect(semantico.divisor).toBe('#2A3852')
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/design-system/__tests__/tokens.test.ts`
Expected: FAIL — `primitivo.azulNip` indefinido; o teste "azul nunca é tinta" lista os arquivos infratores (é a lista da Task 1.4).

- [ ] **Step 3: `primitivo.ts` — entra o manual, sai o que ele proíbe**

Acrescentar:

```ts
  // -- Identidade 05 · Manual da Marca (v1.0, 16/09/2026) ---------------------
  // Cinco cores de marca + quatro superfícies, literais do PDF (p.2, p.5, p.6).
  azulNip: '#0057B8',
  // Hover do botão primário: azul + 12 % de branco; branco em cima dá 5,34.
  azulNipHover: '#1F6BC1',
  vermelhoNip: '#C8102E',
  // Tinta CLARA do vermelho para texto e ponto: o cheio dá 2,90 no cartão.
  vermelhoNipClaro: '#FF5C70',
  navy: '#001D3D',
  cinzaNip: '#A6ABB4',
  fundoNip: '#071426',
  cartaoNip: '#101C30',
  campoNip: '#18243A',
  // divisória do manual = #2A3852 = tinta500 (já existia)
  fundoTelaFimNip: '#0B1830',
  // Universos re-derivados do manual: frio = cartão/campo + 10 % de azul;
  // quente = cartão + 12 % / campo + 15 % de vermelho (≈ o roxo da 03).
  cartaoFrio: '#0E223E',
  campoFrio: '#162947',
  cartaoQuente: '#221B30',
  campoQuente: '#2C1A30',
  bordaQuenteNip: '#3D334E',
  azulNipVeu7: 'rgba(0,87,184,.07)',
  azulNipVeu8: 'rgba(0,87,184,.08)',
  vermelhoNipVeu8: 'rgba(200,16,46,.08)',
  vermelhoNipVeu22: 'rgba(200,16,46,.22)',
  vermelhoClaroVeu14: 'rgba(255,92,112,.14)',
  vermelhoClaroVeu45: 'rgba(255,92,112,.45)',
  brancoVeu70: 'rgba(255,255,255,.7)',
  brancoVeu55: 'rgba(255,255,255,.55)',
  // Pontos de quebra da moldura (spec §5). Media query não lê variável CSS:
  // o CSS da moldura repete o número e um teste compara os dois.
  pontoDeQuebraTopo: 1024,
  pontoDeQuebraLateral: 1280,
  // Fontes — variáveis publicadas no layout por next/font (Task 1.2).
  fonteBebas: "var(--fonte-bebas), 'Arial Narrow', sans-serif",
  fonteMontserrat: 'var(--fonte-montserrat), system-ui, sans-serif',
```

Remover (o `typecheck` aponta cada uso que sobrou; todos são tratados nas Tasks 1.1–1.4): `laranjaAcento`, `laranjaAcentoClaro`, `laranjaVeu`, `laranjaVeuFire`, `turquesaVeu`, `marinho650`, `marinho750`, `marinho850`, `roxo700`, `roxo800`, `roxoBorda`, `vermelhoVivo`, `tinta50Veu70`, `tinta50Veu55`, `tinta50Veu40`, `vermelhoVeu14`, `vermelhoVeu45`, `fonteAnton`, `fonteBarlow`, `fonteBarlowCondensed`. Ficam: toda a escala `tinta*`, `laranja400`, `laranjaVeu12`, `vermelho400` (sem uso semântico, pode sair se o grep não achar nada).

- [ ] **Step 4: `semantico.ts` — a tabela da spec §4.3**

```ts
  fundo: p.fundoNip,
  superficie: p.cartaoNip,
  superficieElevada: p.campoNip,
  divisor: p.tinta500,

  textoPrimario: p.branco,
  textoSecundario: p.cinzaNip,
  textoSobreCor: p.tinta900,
  /** Branco sobre azul ou vermelho: CTAs, pílulas ativas, selos, chips ativos. */
  textoSobreAcento: p.branco,

  alerta: p.vermelhoNipClaro,

  fonteTitulo: p.fonteBebas,
  fonteRotulo: p.fonteMontserrat,
  fonteCorpo: p.fonteMontserrat,
  /**
   * Número de impacto (confiança, placar, contador). A Task 0.2 mediu a Bebas:
   * TABULAR → `p.fonteBebas`; PROPORCIONAL → `p.fonteMontserrat` (os números
   * vivos já levam `tabular-nums`). Escrever aqui a palavra que o script imprimiu.
   */
  fonteNumero: p.fonteBebas,

  acento: p.azulNip,
  acentoClaro: p.azulNipHover,
  aoVivo: p.vermelhoNipClaro,

  superficieFria1: p.campoFrio,
  superficieFria2: p.cartaoFrio,
  fundoTelaFim: p.fundoTelaFimNip,
  superficieQuente1: p.campoQuente,
  superficieQuente2: p.cartaoQuente,
  bordaQuente: p.bordaQuenteNip,
  vivoSelo: p.vermelhoNip,
  veuFrio: p.azulNipVeu7,
  veuQuente: p.vermelhoNipVeu8,
  veuFire: p.vermelhoNipVeu22,

  texto100: p.branco,
  texto70: p.brancoVeu70,
  texto55: p.brancoVeu55,
  texto40: p.brancoVeu55,
  aoVivoSolido: p.vermelhoNipClaro,
  aoVivoTinta: p.vermelhoClaroVeu14,
  aoVivoBorda: p.vermelhoClaroVeu45,
  acentoVeu: p.azulNipVeu8,

  // -- Identidade 05 · moldura ----------------------------------------------
  cromo: p.navy,
  focoAnel: p.branco,
  larguraTopo: p.pontoDeQuebraTopo,
  larguraLateral: p.pontoDeQuebraLateral,
```

Comentário de cabeçalho do arquivo: acrescentar "Identidade 05: azul só preenchimento (matiz do turbo), ver spec §3.2".

- [ ] **Step 5: `componente.ts` — CTA chapado, selo, foco, raios**

```ts
  // CTA do manual: chapado, 48 px, texto branco; hover mais claro (Identidade 05).
  ctaFundo: s.acento,
  ctaFundoHover: s.acentoClaro,
  ctaTexto: s.textoSobreAcento,
  ctaAltura: '48px',
  raioControle: '8px',
  cardRaio: '12px',
  foco: `2px solid ${s.focoAnel}`,
  seloContexto: {
    preLive: { fundo: s.acento, texto: s.textoSobreAcento },
    aoVivo: { fundo: s.vivoSelo, texto: s.textoSobreAcento },
  },
  // aba neutra (seletor de atributo da tela do time): preenchida, texto branco
  abaAtributo: { …, ativaNeutra: { borda: s.acento, fundo: s.acento }, … },
```

`contextoQuente.destaque` continua `s.acento` (é preenchimento da barra). `barraAlvoPreenchido` continua o degradê `acento → acentoClaro` (preenchimento).

- [ ] **Step 6: Regenerar o CSS e rodar**

Run: `npm run tokens && npx vitest run src/design-system/__tests__/tokens.test.ts`
Expected: tudo verde EXCETO "azul nunca é tinta" e "nenhum componente escreve hex direto" se algum arquivo ainda usar as chaves removidas — esses são os alvos das Tasks 1.3 e 1.4. `npm run typecheck` lista os usos das chaves removidas: é a lista de trabalho.

### Task 1.2: Bebas Neue e Montserrat pelo `next/font`; a assinatura da marca

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/design-system/marca.ts`
- Test: `src/design-system/__tests__/tabela.test.ts:49`, `hierarquia-do-time.test.ts:56`, e qualquer teste que cite `Leitura inteligente` (`grep -rn "Leitura inteligente" src`)

- [ ] **Step 1: Ajustar as asserções de fonte**

```ts
// tabela.test.ts:49
expect(html).toContain('var(--fonte-montserrat)')
// hierarquia-do-time.test.ts:56 — o número da posição é "número de impacto"
expect(html).toContain(semantico.fonteNumero)
```

- [ ] **Step 2: `layout.tsx`**

```ts
import { Bebas_Neue, Montserrat } from 'next/font/google'
// Fontes da Identidade 05 (Manual da Marca) — self-hosted em build pelo
// next/font/google (zero request ao Google em runtime). Bebas só tem 400.
const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--fonte-bebas' })
const montserrat = Montserrat({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--fonte-montserrat',
})
// …
export const viewport: Viewport = { …, themeColor: semantico.fundo }
// …
<html lang="pt-BR" className={`${bebas.variable} ${montserrat.variable}`}>
```

- [ ] **Step 3: `globals.css` e `marca.ts`**

```css
.marca-nip strong { font-family: var(--fonte-bebas), sans-serif; font-size: 28px; letter-spacing: 0.08em; }
.marca-nip small  { font-family: var(--fonte-montserrat), sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.13em; opacity: 0.7; text-transform: uppercase; }
/* linha 170: */ font-family: var(--fonte-montserrat), sans-serif;
```

```ts
export const marcaNip = {
  nome: 'NIP',
  // A assinatura é a da logo do manual (p.3). "Leia o jogo por inteiro." é a
  // chamada do login, não a assinatura.
  assinatura: 'NBA Intelligence Platform',
  descricao: 'Análise de entradas e estatísticas da NBA com metodologia NIP.',
} as const
```

- [ ] **Step 4: Rodar**

Run: `grep -rn "fonte-anton\|fonte-barlow\|Anton\b\|Barlow" src --include='*.ts' --include='*.tsx' --include='*.css' | grep -v "__tests__/.*it('" ; npx vitest run src/design-system src/app/__tests__/navegacao.test.ts`
Expected: o grep só devolve nomes de teste/comentário histórico (ou nada); testes verdes. `src/app/manifest.ts:16-17`: `background_color`/`theme_color` passam a `semantico.fundo`.

### Task 1.3: Texto sobre cor vira dois tokens — os 23 usos

**Files:** os listados abaixo. **Test:** as suítes de tela já existentes (`telas-*`) + `navegacao.test.ts`.

Regra: quem senta sobre `acento`, `acentoClaro`, `ctaFundo` ou `vivoSelo` → `semantico.textoSobreAcento` (ou `var(--texto-sobre-acento)` em CSS); quem senta sobre cor de apito/barrinha fica em `textoSobreCor`; quem usava `textoSobreCor` como COR DE FUNDO → `semantico.fundo`.

| Arquivo:linha | Hoje | Novo |
| --- | --- | --- |
| `src/app/layout.tsx:51` | `themeColor: textoSobreCor` | `semantico.fundo` (feito na 1.2) |
| `src/app/manifest.ts:16-17` | `background_color`/`theme_color` | `semantico.fundo` |
| `src/app/(app)/cadastrar/formulario.tsx:75` | color sobre CTA | `textoSobreAcento` |
| `src/app/(app)/entrar/formulario.tsx:75` | idem | `textoSobreAcento` |
| `src/app/(app)/assinar/page.tsx:136` | idem | `textoSobreAcento` |
| `src/app/(app)/apito/[jogadorId]/page.tsx:752` | idem | `textoSobreAcento` |
| `src/app/(app)/gestao/page.tsx:195, 374, 413` | CTA / pílula ativa | `textoSobreAcento` |
| `src/app/(app)/estatisticas/page.tsx:52` | CTA da busca | `textoSobreAcento` |
| `src/app/(app)/conta/blocos.tsx:53, 403` | CTA | `textoSobreAcento` |
| `src/app/offline/page.tsx:62` | CTA | `textoSobreAcento` |
| `src/components/planos/ConviteDoPlano.tsx:50` | CTA | `textoSobreAcento` |
| `src/components/navegacao/CabecalhoTela.tsx:175, 330` | seletor / chip ativo | `textoSobreAcento` |
| `src/components/pwa/AtivarAlertas.module.css:46`, `PainelPwa.module.css:23, 57` | `var(--texto-sobre-cor)` | `var(--texto-sobre-acento)` |
| `src/app/(admin)/admin/galeria/page.tsx:734` | tabela de contraste | fica (mede o anel) + nova coluna na Task 1.5 |
| `src/design-system/componentes/Avatar.tsx:92` | número no anel | **fica** `textoSobreCor` |
| `src/design-system/componentes/Barrinhas.tsx:71` | número no verde | **fica** `textoSobreCor` |

- [ ] **Step 1: Aplicar a tabela** (um `Edit` por linha; nos CSS o token novo já existe em `tokens.css` como `--texto-sobre-acento`).
- [ ] **Step 2: Rodar** `npm run typecheck && npx vitest run src/app/__tests__ src/components` → verde.

### Task 1.4: O acento deixa de ser tinta — os ~20 usos

**Files:** os listados. **Test:** `tokens.test.ts` ("azul nunca é tinta") passa a verde; `navegacao.test.ts` ajustado.

Regra por tipo de uso: **link** → `color: semantico.textoPrimario` + `textDecoration: 'underline'` + `textUnderlineOffset: 3`; **contorno ativo** (chip, seletor, botão fantasma) → preenchido `background: acento` + `color: textoSobreAcento` + `border: 1.5px solid transparent` (a borda some dentro do preenchimento, e o teste "azul nunca é tinta" não vê acento em `border`); em CSS, `border-color: transparent; background: var(--acento); color: var(--texto-sobre-acento)`; **ícone/traço** → `semantico.textoPrimario`; **foco** → `outline: componente.foco` (`2px solid var(--foco-anel)` em CSS); **decorativo em SVG** → `semantico.texto40`.

| Arquivo:linha | Uso | Novo |
| --- | --- | --- |
| `src/app/(app)/page.tsx:361` | link Resultados | link branco sublinhado |
| `src/app/(app)/resultados/[data]/page.tsx:429` | link | link branco sublinhado (`:420` é `background`: fica) |
| `src/app/(app)/apito/[jogadorId]/page.tsx:778-779` | contorno + cor | preenchido |
| `src/app/(app)/estatisticas/jogador/[id]/page.tsx:433` | link/cor | link branco sublinhado |
| `…jogador/[id]/page.tsx:614-615, 711-712` | chips período/atributo ativos | preenchido (`:861` é `background`: fica) |
| `src/app/(app)/conta/blocos.tsx:67-69, 187` | contorno + cor | preenchido |
| `src/app/(app)/conta/page.tsx:214-216` | contorno + cor | preenchido |
| `src/components/navegacao/BotaoVoltar.tsx:28-29` | contorno + cor | contorno `divisor`, cor `textoPrimario` |
| `src/components/navegacao/FolhaDeFiltros.tsx:75-76` | chip do recorte ativo | preenchido |
| `src/components/navegacao/CabecalhoTela.tsx:74` | marcador da sobrancelha | some na Task 2.3; até lá `corMarcador = textoSecundario` |
| `src/components/navegacao/icones.tsx:22` | ícone ativo | `ativo ? semantico.textoPrimario : semantico.textoSecundario` (refeito na 2.1) |
| `src/components/navegacao/BarraInferior.tsx:75` | rótulo ativo | `textoPrimario` (refeito na 2.1) |
| `src/components/chat/BotaoChat.module.css:15, 20` | cor do ícone, foco | `var(--texto-primario)`; `outline: 2px solid var(--foco-anel)` |
| `src/components/chat/PainelChat.module.css:54` | foco | `var(--foco-anel)` (`:87` é `background`: fica) |
| `src/components/ao-vivo/ExperienciaAoVivo.module.css:24`, `SeletorJogosAoVivo.module.css:27, 66` | foco / borda ativa | foco `--foco-anel`; ativa `border-color: transparent; background: var(--acento); color: var(--texto-sobre-acento)` (`:28` some) |
| `src/components/preferencias/BotaoAcompanharJogador.module.css:25-26, 36` | borda ativa, foco | `.ativo { background: var(--acento); border-color: transparent; color: var(--texto-sobre-acento) }`; foco `--foco-anel` |
| `src/design-system/componentes/QuadraAoVivo.tsx:34, 48-49` | fill decorativo, stroke | fill fica (`fillOpacity` 0.1 é preenchimento); stroke → `semantico.texto40` |

- [ ] **Step 1: Aplicar a tabela.**
- [ ] **Step 2: `navegacao.test.ts` — a regressão do ícone preenchido** troca `fill="${semantico.acento}"` por `fill="${semantico.textoPrimario}"` (a Task 2.1 troca de novo pela pílula).
- [ ] **Step 3: Rodar** `npx vitest run src/design-system/__tests__/tokens.test.ts src/app/__tests__/navegacao.test.ts` → verde, inclusive "azul nunca é tinta".

### Task 1.5: Galeria, `docs/04`, bateria da fase e captura

**Files:**
- Modify: `src/app/(admin)/admin/galeria/page.tsx` (nova `Secao` + colunas na tabela de contraste), `docs/04-design-system.md` (nova seção ao fim), `src/app/__tests__/telas-galeria.test.ts`

- [ ] **Step 1: Teste** — em `telas-galeria.test.ts`:

```ts
expect(html).toContain('Identidade 05 · marca')
expect(html).toContain(semantico.textoSobreAcento)
```

- [ ] **Step 2: Galeria** — antes de "Contraste verificado", uma `<Secao titulo="Identidade 05 · marca">` com: o CTA (`background: componente.ctaFundo, color: componente.ctaTexto, minHeight: componente.ctaAltura, borderRadius: componente.raioControle`), `<SeloContexto contexto="preLive"/>` e `"aoVivo"`, um `<Chip ativo>` e um inativo, um card frio e um quente. Na tabela "Contraste verificado", acrescentar linhas `['acento × textoSobreAcento', razaoDeContraste(semantico.acento, semantico.textoSobreAcento)]`, idem `acentoClaro` e `vivoSelo`.

- [ ] **Step 3: `docs/04-design-system.md`** — ao fim:

```markdown
## Identidade 05 — Manual da Marca (referência vigente)

Spec: `docs/superpowers/specs/2026-09-18-identidade-05-manual-da-marca-design.md`. A paleta e as
fontes são as do Manual da Marca (v1.0, 16/09/2026): azul `#0057B8` para ação e estado ativo,
vermelho `#C8102E` para atenção, navy `#001D3D` no cromo, cinza `#A6ABB4` no texto secundário,
Bebas Neue em títulos e números de impacto, Montserrat no resto. O laranja saiu da interface;
o 🟠 do nível 2 do apito ficou, porque é sinal, não decoração.

**Azul é preenchimento, nunca tinta.** O azul do manual tem o matiz do azul do turbo; como
texto sobre o cartão reprova (2,48), e qualquer tinta clara que passe é o 🔵 do CJ. Estado
ativo é pílula preenchida com `textoSobreAcento`; links são brancos sublinhados; o foco é
branco. Um teste (`tokens.test.ts`, "azul nunca é tinta") varre o código.

**Vermelho: cheio no selo, claro na tinta.** `vivoSelo` é o vermelho do manual com branco em
cima; `aoVivo`/`alerta` são a tinta clara `#FF5C70`.

Os canais de estratégia (anel do apito, metálicos, rampa turquesa, nota, barrinhas) não
mudaram. `textoSobreCor` (escuro) continua sendo o número no anel.
```

- [ ] **Step 4: Bateria da fase e captura**

Run: `npm run tokens && npm run typecheck && npm run lint && npm run boundaries && npm test`
Expected: tudo verde. Depois `CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-` e comparar a galeria e a Lista com o artboard "Tokens · galeria". Anotar divergências para o parceiro.

---

# Fase 2 · Moldura e navegação — **gate: artboard "Moldura" aprovado**

### Task 2.1: As abas num só lugar, ícones de traço, barra inferior em pílulas

**Files:**
- Create: `src/components/navegacao/abas.ts`
- Modify: `src/components/navegacao/icones.tsx`, `BarraInferior.tsx`, `index.ts`, `src/design-system/tokens/componente.ts`
- Test: `src/app/__tests__/navegacao.test.ts`

**Interfaces:**
```ts
// abas.ts
export type Aba = 'lista' | 'fire-live' | 'stats' | 'gestao' | 'conta'
export const ABAS: readonly { id: Aba; href: string; rotulo: string }[]
// icones.tsx
export function IconeAba({ aba, ativo }: { aba: Aba; ativo: boolean }): JSX.Element  // 20 px, traço 1.5
// componente.ts
componente.pilulaNav = { fundoAtiva, textoAtiva, textoInativa, fundoHover, raio: '999px' }
```

- [ ] **Step 1: Testes** — em `navegacao.test.ts`, substituir "a aba ativa preenche o ícone…" por:

```ts
it('a aba ativa é uma pílula preenchida no acento, com texto branco e aria-current', () => {
  const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'fire-live' }))
  expect(html).toContain('aria-current="page"')
  expect(html).toContain(`background:${componente.pilulaNav.fundoAtiva}`)
  expect(html).toContain(`color:${componente.pilulaNav.textoAtiva}`)
})

it('os ícones são de traço (stroke), 20 px, um por aba, sem preenchimento no inativo', () => {
  const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'lista' }))
  expect(html.match(/<svg[^>]*width="20"/g)).toHaveLength(5)
  expect(html).toContain('stroke-width="1.5"')
})

it('nenhum rótulo da navegação fica abaixo de 12 px', () => {
  const html = renderToStaticMarkup(createElement(BarraInferior, { atual: 'lista' }))
  expect(html).not.toMatch(/font-size:1[01]px/)
})
```

- [ ] **Step 2: `abas.ts`**

```ts
/** As cinco seções do produto — a MESMA lista para a barra inferior e a do topo. */
export type Aba = 'lista' | 'fire-live' | 'stats' | 'gestao' | 'conta'
export const ABAS = [
  { id: 'lista', href: '/', rotulo: 'ENTRADAS' },
  { id: 'fire-live', href: '/fire-live', rotulo: 'AO VIVO' },
  { id: 'stats', href: '/estatisticas', rotulo: 'STATS' },
  { id: 'gestao', href: '/gestao', rotulo: 'GESTÃO' },
  { id: 'conta', href: '/conta', rotulo: 'PERFIL' },
] as const satisfies readonly { id: Aba; href: string; rotulo: string }[]
```

- [ ] **Step 3: `icones.tsx` — cinco ícones de traço**

```tsx
import { semantico } from '@/design-system/tokens/semantico'
import type { Aba } from './abas'

/**
 * ÍCONES DA NAVEGAÇÃO — traço de 1,5 px a 20 px (manual, p.5). Informam ao
 * lado do rótulo, nunca no lugar dele. Ativo e inativo mudam só a COR do
 * traço; o estado é dito pela pílula preenchida e pelo aria-current.
 */
const CAMINHOS: Record<Aba, string> = {
  lista: 'M4 6h12M4 10h12M4 14h8',                                   // lista
  'fire-live': 'M10 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7z', // chama
  stats: 'M4 16V9M10 16V4M16 16v-5',                                  // barras
  gestao: 'M3 6h14v9H3zM3 9h14M13 12h2',                              // carteira
  conta: 'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 17c0-3 3-4 6-4s6 1 6 4', // pessoa
}

export function IconeAba({ aba, ativo }: { aba: Aba; ativo: boolean }) {
  const cor = ativo ? semantico.textoSobreAcento : semantico.textoSecundario
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden fill="none" stroke={cor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={CAMINHOS[aba]} />
    </svg>
  )
}
```

- [ ] **Step 4: `componente.ts`** — acrescentar:

```ts
  // Pílula da navegação (topo e inferior): ativa preenchida no acento.
  pilulaNav: {
    fundoAtiva: s.acento,
    textoAtiva: s.textoSobreAcento,
    textoInativa: s.textoSecundario,
    fundoHover: s.superficieElevada,
    raio: '999px',
  },
```

- [ ] **Step 5: `BarraInferior.tsx`** — importa `ABAS`/`Aba` de `./abas` (o tipo `Aba` continua reexportado por `index.ts`), remove o campo `forma`, e cada `Link` vira:

```tsx
<Link key={aba.id} href={aba.href} aria-current={ativo ? 'page' : undefined}
  style={{
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    margin: '6px 4px', padding: '6px 8px', borderRadius: componente.pilulaNav.raio,
    textDecoration: 'none', fontFamily: semantico.fonteRotulo, fontSize: 12,
    letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
    background: ativo ? componente.pilulaNav.fundoAtiva : 'transparent',
    color: ativo ? componente.pilulaNav.textoAtiva : componente.pilulaNav.textoInativa,
  }}>
  <IconeAba aba={aba.id} ativo={ativo} />
  {aba.rotulo}
</Link>
```

O `<nav>` passa a `background: semantico.cromo` (navy) com `borderTop: 1px solid divisor`. Ganha `className="barra-inferior"` (a Task 2.2 esconde por CSS a partir de 1024).

- [ ] **Step 6: Rodar** `npx vitest run src/app/__tests__/navegacao.test.ts` → verde.

### Task 2.2: A `Moldura` de três regiões, a `BarraTopo`, o esqueleto e a grade corrigida

**Files:**
- Create: `src/components/navegacao/Moldura.module.css`, `src/components/navegacao/BarraTopo.tsx`
- Modify: `src/components/navegacao/Moldura.tsx`, `Esqueleto.tsx`, `index.ts`, `src/design-system/tokens/componente.ts`, `src/app/__tests__/conferencia.ts` (lista de CSS Modules)
- Test: `src/app/__tests__/navegacao.test.ts`, `src/app/__tests__/telas-04-lista.test.ts:442-460` (grade)

**Interfaces:**
```tsx
export type ContaNaBarra = { email: string; nome?: string | null; fotoUrl?: string | null }
<Moldura aba largura? assistente? conta? lateral? >   // lateral: ReactNode — a coluna só existe quando passada
<BarraTopo atual={Aba} conta?={ContaNaBarra} />        // ≥ 1024 (CSS); logo, 5 pílulas, avatar
export const GRADE_DE_CARDS = 'repeat(auto-fill, minmax(min(420px, 100%), 1fr))'
componente.moldura = { alturaTopo: '64px', larguraLateral: '320px', larguraComLateral: '1392px', respiroCelular: '16px', respiroDesktop: '24px' }
```

- [ ] **Step 1: Testes que falham**

```ts
// navegacao.test.ts
it('a moldura desenha as DUAS barras (o CSS escolhe uma) e o cromo é navy', () => {
  const html = renderToStaticMarkup(createElement(Moldura, { aba: 'lista', children: 'x' }))
  expect(html).toContain('barra-inferior')
  expect(html).toContain('aria-label="Seções do app (topo)"')
  expect(html.match(/aria-current="page"/g)).toHaveLength(2)
  expect(html).toContain(`background:${semantico.cromo}`)
})

it('a grade de cards nunca força mais largura do que a tela tem', () => {
  expect(GRADE_DE_CARDS).toBe('repeat(auto-fill, minmax(min(420px, 100%), 1fr))')
})

it('os pontos de quebra do CSS da moldura são os dos tokens', () => {
  const css = readFileSync('src/components/navegacao/Moldura.module.css', 'utf8')
  expect(css).toContain(`(min-width: ${semantico.larguraTopo}px)`)
  expect(css).toContain(`(min-width: ${semantico.larguraLateral}px)`)
})

it('a lateral só existe quando a tela passa uma', () => {
  const sem = renderToStaticMarkup(createElement(Moldura, { aba: 'lista', children: 'x' }))
  const com = renderToStaticMarkup(createElement(Moldura, { aba: 'lista', lateral: 'L', children: 'x' }))
  expect(sem).not.toContain('aria-label="Painel lateral"')
  expect(com).toContain('aria-label="Painel lateral"')
})

it('o esqueleto veste a mesma moldura, com as barras', () => {
  const html = renderToStaticMarkup(createElement(Esqueleto, { aba: 'stats' }))
  expect(html).toContain('aria-busy="true"')
  expect(html).toContain('aria-label="Seções do app (topo)"')
})
```

Em `telas-04-lista.test.ts` a asserção da grade (`GRADE_DE_CARDS_CSS`) continua valendo por importar a constante.

- [ ] **Step 2: `componente.ts`** — acrescentar `moldura` (valores acima) e, no `semantico`, nada (já feito).

- [ ] **Step 3: `Moldura.module.css`**

```css
/* Moldura da Identidade 05 — três regiões. Os números 1024 e 1280 repetem
   semantico.larguraTopo/larguraLateral: media query não lê variável CSS, e o
   teste "os pontos de quebra do CSS…" compara os dois. */
.raiz { min-height: 100vh; }
.topo { display: none; }
.corpo { }
.conteudo { padding: 24px 16px 96px; }
.semAba .conteudo { padding-bottom: 64px; }
.coluna { max-width: var(--largura-coluna); margin: 0 auto; }
.lateral { display: none; }

@media (min-width: 1024px) {
  .topo { display: flex; position: sticky; top: 0; z-index: 30; height: 64px; }
  .raiz :global(.barra-inferior) { display: none; }
  .conteudo { padding: 24px 24px 48px; }
}

@media (min-width: 1280px) {
  .comLateral .corpo { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 32px; max-width: 1392px; margin: 0 auto; padding: 0 24px; }
  .comLateral .conteudo { padding-left: 0; padding-right: 0; }
  .comLateral .coluna { max-width: 1040px; margin: 0; }
  .lateral { display: block; position: sticky; top: 64px; height: calc(100vh - 64px); overflow-y: auto; padding: 24px 0 24px; }
}
```

- [ ] **Step 4: `BarraTopo.tsx`**

```tsx
import Link from 'next/link'
import { MarcaNip, AvatarUsuario } from '@/design-system/componentes'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { ABAS, type Aba } from './abas'
import { IconeAba } from './icones'

export type ContaNaBarra = { email: string; nome?: string | null; fotoUrl?: string | null }

/**
 * BARRA DO TOPO — só a partir de `larguraTopo` (o CSS da Moldura decide). Da
 * esquerda para a direita: a marca (texto até a logo chegar), as cinco pílulas
 * e o atalho para a conta. Mesma lista de abas da barra inferior.
 */
export function BarraTopo({ atual, conta }: { atual: Aba; conta?: ContaNaBarra }) {
  return (
    <nav aria-label="Seções do app (topo)"
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 24, padding: '0 24px',
        background: semantico.cromo, borderBottom: `1px solid ${semantico.divisor}` }}>
      <Link href="/" style={{ color: semantico.textoPrimario, textDecoration: 'none' }} aria-label="Início">
        <MarcaNip compacta />
      </Link>
      <div style={{ display: 'flex', gap: 4 }}>
        {ABAS.map((aba) => {
          const ativo = aba.id === atual
          return (
            <Link key={aba.id} href={aba.href} aria-current={ativo ? 'page' : undefined}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                borderRadius: componente.pilulaNav.raio, textDecoration: 'none',
                fontFamily: semantico.fonteRotulo, fontSize: 12, letterSpacing: '0.06em',
                textTransform: 'uppercase', fontWeight: 600,
                background: ativo ? componente.pilulaNav.fundoAtiva : 'transparent',
                color: ativo ? componente.pilulaNav.textoAtiva : componente.pilulaNav.textoInativa }}>
              <IconeAba aba={aba.id} ativo={ativo} />
              {aba.rotulo}
            </Link>
          )
        })}
      </div>
      {conta && (
        <Link href="/conta" aria-label="Sua conta" style={{ marginLeft: 'auto' }}>
          <AvatarUsuario nome={conta.nome ?? null} email={conta.email} fotoUrl={conta.fotoUrl ?? null} tamanho={36} />
        </Link>
      )}
    </nav>
  )
}
```

- [ ] **Step 5: `Moldura.tsx`**

```tsx
import estilos from './Moldura.module.css'
import { BarraTopo, type ContaNaBarra } from './BarraTopo'
// …
export const GRADE_DE_CARDS = 'repeat(auto-fill, minmax(min(420px, 100%), 1fr))'

export function Moldura({ aba, largura = 'leitura', assistente = false, conta, lateral, children }: {
  aba: Aba | null
  largura?: LarguraDaMoldura
  assistente?: boolean
  /** Quem está logado — só para o avatar da barra do topo. Sem ela, a barra não mostra conta. */
  conta?: ContaNaBarra
  /** A coluna da direita (spec §7). Só existe a partir de 1280 e só quando a tela passa uma. */
  lateral?: ReactNode
  children?: ReactNode
}) {
  const classes = [estilos.raiz, aba === null ? estilos.semAba : '', lateral ? estilos.comLateral : ''].join(' ')
  return (
    <div className={classes} style={{ background: componente.fundoTela, color: semantico.textoPrimario, fontFamily: semantico.fonteCorpo }}>
      {aba !== null && <div className={estilos.topo}><BarraTopo atual={aba} conta={conta} /></div>}
      <div className={estilos.corpo}>
        <main className={estilos.conteudo}>
          <div className={estilos.coluna} style={{ ['--largura-coluna' as string]: `${LARGURA_DA_MOLDURA[largura]}px` }}>{children}</div>
        </main>
        {lateral && <aside className={estilos.lateral} aria-label="Painel lateral">{lateral}</aside>}
      </div>
      {aba !== null && <BarraInferior atual={aba} />}
      {aba !== null && assistente && configuracaoChat().habilitado && <BotaoChat />}
    </div>
  )
}
```

`index.ts` exporta `BarraTopo`, `type ContaNaBarra` e `ABAS`.

- [ ] **Step 6: `Esqueleto.tsx`** passa a renderizar `<Moldura aba={aba} largura={largura}>` com o conteúdo do esqueleto dentro (`<div aria-busy="true" aria-label="Carregando" style={{display:'grid',gap:18}}>…</div>`); remove o `<main>` e a `BarraInferior` próprios.

- [ ] **Step 7: `conferencia.ts`** — acrescentar `'src/components/navegacao/Moldura.module.css'` a `MODULOS_CSS_DA_CONFERENCIA`, senão a captura não vê a moldura.

- [ ] **Step 8: Rodar** `npx vitest run src/app/__tests__/navegacao.test.ts src/app/__tests__/telas-04-lista.test.ts` → verde.

### Task 2.3: Cabeçalho de tela na tipografia nova; `Chip` próprio; folha de filtros com grupos

**Files:**
- Create: `src/components/navegacao/Chip.tsx`, `src/components/navegacao/FolhaDeFiltros.module.css`
- Modify: `src/components/navegacao/CabecalhoTela.tsx`, `FolhaDeFiltros.tsx`, `index.ts`, `src/app/(app)/page.tsx` (adapta à API de grupos), `src/app/(app)/fire-live/page.tsx` (remove `contexto="aoVivo"`), `src/app/__tests__/conferencia.ts`
- Test: `src/app/__tests__/navegacao.test.ts`, `src/app/__tests__/telas-04-lista.test.ts:179-204`

**Interfaces:**
```tsx
<CabecalhoTela sobrancelha titulo? voltarHref? selo? seletor? acoes? lentes? contador? children? />
// `contexto` some (o selo diz o contexto). contador?: { numero: number; rotulo: string }
export function Chip({ href, ativo, children })                     // preenchido quando ativo
export type GrupoDeFiltro = { titulo: string; ativo?: string; chips: ReactNode }
<FolhaDeFiltros rotulo? titulo? ativos? grupos={GrupoDeFiltro[]} />  // celular: botão + folha; ≥1024: um chip com menu por grupo
```

- [ ] **Step 1: Testes que falham**

```ts
// navegacao.test.ts — substitui 'cabeçalho: sobrancelha + título; contexto aoVivo muda a cor do marcador'
it('cabeçalho: H1 em Bebas 32, sobrancelha em rótulo, sem marcador colorido (o selo diz o contexto)', () => {
  const html = renderToStaticMarkup(createElement(CabecalhoTela, { sobrancelha: 'LISTA SECRETA', titulo: 'LISTA DO DIA' }))
  expect(html).toContain('font-size:32px')
  expect(html).toContain(semantico.fonteTitulo)
  expect(html).not.toContain('transform:rotate(45deg)')
})

it('o contador é número em fonteNumero 24 com o rótulo ao lado', () => {
  const html = renderToStaticMarkup(createElement(CabecalhoTela, { sobrancelha: 'X', contador: { numero: 37, rotulo: 'entradas em 7 jogos' } }))
  expect(html).toContain('>37<')
  expect(html).toContain(semantico.fonteNumero)
  expect(html).toContain('entradas em 7 jogos')
})

it('as lentes são abas com sublinhado, não pílulas', () => {
  const html = renderToStaticMarkup(createElement(CabecalhoTela, { sobrancelha: 'X',
    lentes: { ativa: 'A', opcoes: [{ valor: 'A', rotulo: 'ÚLT. 5', href: '/?l=A' }, { valor: 'B', rotulo: 'ODDS', href: '/?l=B' }] } }))
  expect(html).toContain(`border-bottom:2px solid ${semantico.texto100}`)
  expect(html).not.toContain('border-radius:999px;font-family')
})

it('a folha de filtros rende os grupos duas vezes: na folha (fieldset) e como chips com menu (details)', () => {
  const html = renderToStaticMarkup(createElement(FolhaDeFiltros, { grupos: [
    { titulo: 'Quantidade', chips: 'q' }, { titulo: 'Método', ativo: 'OPD', chips: 'm' },
  ] }))
  expect(html.match(/<legend/g)).toHaveLength(2)
  expect(html.match(/class="[^"]*chipMenu/g)).toHaveLength(2)
  expect(html).toContain('OPD')          // o chip do grupo mostra o recorte ativo
})
```

- [ ] **Step 2: `Chip.tsx`** (extraído de `CabecalhoTela.tsx`, que passa a importá-lo)

```tsx
export function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={ativo ? 'page' : undefined}
      style={{ padding: '6px 14px', borderRadius: 999, fontFamily: semantico.fonteRotulo, fontSize: 12,
        letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none', fontWeight: 600,
        color: ativo ? semantico.textoSobreAcento : semantico.textoSecundario,
        // Ativo: a borda some no preenchimento (nunca acento em `border` — teste "azul nunca é tinta").
        border: `1.5px solid ${ativo ? 'transparent' : semantico.divisor}`,
        background: ativo ? semantico.acento : 'transparent' }}>
      {children}
    </Link>
  )
}
```

- [ ] **Step 3: `CabecalhoTela.tsx`** — H1: `fontSize: 32`; sobrancelha: `fontFamily: fonteRotulo, fontSize: 12, letterSpacing: '0.06em', color: textoSecundario`, sem o `<span aria-hidden>` do marcador e sem a prop `contexto`; `Seletor`: ativo `color: textoSobreAcento, background: acento`; `Lentes`: 

```ts
const estilo = (ativo: boolean): CSSProperties => ({
  padding: '8px 2px', fontFamily: semantico.fonteRotulo, fontSize: 12, letterSpacing: '0.06em',
  textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none',
  color: ativo ? semantico.texto100 : semantico.textoSecundario,
  borderBottom: `2px solid ${ativo ? semantico.texto100 : 'transparent'}`,
})
// grupo: { display: 'flex', gap: 18, marginTop: 12, overflowX: 'auto', borderBottom: `1px solid ${semantico.divisor}` }
```

e o slot `contador`, depois das lentes:

```tsx
{contador && (
  <p style={{ margin: '14px 0 0', display: 'flex', alignItems: 'baseline', gap: 8 }}>
    <strong style={{ fontFamily: semantico.fonteNumero, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{contador.numero}</strong>
    <span style={{ fontFamily: semantico.fonteRotulo, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: semantico.textoSecundario }}>{contador.rotulo}</span>
  </p>
)}
```

- [ ] **Step 4: `FolhaDeFiltros.tsx` com `grupos`** — mantém o `<details>` da folha (celular) e acrescenta a fileira de chips com menu (desktop); o `GrupoFiltro` de `page.tsx` migra para cá como `<fieldset><legend>`:

```tsx
export type GrupoDeFiltro = { titulo: string; ativo?: string; chips: ReactNode }

export function FolhaDeFiltros({ rotulo = 'FILTRAR', titulo = 'Filtrar a lista', ativos = [], grupos }: {
  rotulo?: string; titulo?: string; ativos?: RecorteAtivo[]; grupos: GrupoDeFiltro[]
}) {
  const folha = useRef<HTMLDetailsElement>(null)
  const fileira = useRef<HTMLDivElement>(null)
  const fecharFolha = () => { if (folha.current) folha.current.open = false }
  const fecharMenus = (exceto?: HTMLDetailsElement) => {
    fileira.current?.querySelectorAll('details').forEach((d) => { if (d !== exceto) d.open = false })
  }
  const aoEscolher = (e: MouseEvent<HTMLElement>) => { if ((e.target as HTMLElement).closest('a')) { fecharFolha(); fecharMenus() } }
  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Escape') { fecharFolha(); fecharMenus() } }

  return (
    <div className={estilos.raiz} onKeyDown={aoTeclar}>
      {/* ≥ larguraTopo: um chip com menu por grupo — o StatsHub; mesmo HTML dos chips, mesma URL */}
      <div ref={fileira} className={estilos.chips} onClick={aoEscolher}>
        {grupos.map((g) => (
          <details key={g.titulo} className={estilos.chipMenu} onToggle={(e) => { if (e.currentTarget.open) fecharMenus(e.currentTarget) }}>
            <summary className={estilos.chipResumo} aria-label={`${g.titulo}${g.ativo ? `: ${g.ativo}` : ''}`}>
              {g.ativo ?? g.titulo}
              <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
            </summary>
            <div className={estilos.menu} role="group" aria-label={g.titulo}>{g.chips}</div>
          </details>
        ))}
      </div>
      {/* < larguraTopo: o recorte ativo + FILTRAR + a folha (Identidade 04) */}
      <div className={estilos.folha}>
        {ativos.map(/* como hoje, com o chip preenchido da Task 1.4 */)}
        <details ref={folha}>
          <summary /* como hoje */>{rotulo}</summary>
          <div role="dialog" aria-label={titulo} onClick={aoEscolher} /* como hoje */>
            {grupos.map((g) => (
              <fieldset key={g.titulo} style={{ margin: 0, padding: 0, border: 'none' }}>
                <legend style={{ padding: 0, marginBottom: 6, fontFamily: semantico.fonteRotulo, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: semantico.textoSecundario }}>{g.titulo}</legend>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{g.chips}</div>
              </fieldset>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}
```

`FolhaDeFiltros.module.css`:

```css
.raiz { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chips { display: none; }
.folha { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chipMenu { position: relative; }
.chipMenu > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--divisor); background: var(--superficie); color: var(--texto70); font-family: var(--fonte-rotulo); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.chipMenu > summary::-webkit-details-marker { display: none; }
.chipMenu[open] > summary { border-color: var(--texto-secundario); color: var(--texto100); }
.chipMenu > summary:focus-visible { outline: 2px solid var(--foco-anel); outline-offset: 2px; }
.menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 25; min-width: 220px; display: flex; gap: 6px; flex-wrap: wrap; padding: 12px; border-radius: 12px; border: 1px solid var(--divisor); background: var(--superficie); }
@media (min-width: 1024px) {
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .folha { display: none; }
}
```

Acrescentar o módulo a `MODULOS_CSS_DA_CONFERENCIA`.

- [ ] **Step 5: `page.tsx` adapta** — o `<FolhaDeFiltros ativos={…}>` com `<GrupoFiltro>` filhos vira `grupos={[ { titulo: 'Quantidade', ativo: estado.quantidade !== 0 ? rotuloQuantidade(estado.quantidade) : undefined, chips: (<>{QUANTIDADES.map(…Chip…)}</>) }, …atributo, método, nível, time, posição ]}` — mesmos chips, mesmos `href`. `GrupoFiltro` é apagado de `page.tsx`. `fire-live/page.tsx:275` perde `contexto="aoVivo"`.

- [ ] **Step 6: Rodar** `npm run typecheck && npx vitest run src/app/__tests__/navegacao.test.ts src/app/__tests__/telas-04-lista.test.ts` → verde (os testes 179–204 continuam achando `<legend>` e FILTRAR).

### Task 2.4: As telas passam a conta; captura nas quatro larguras com detector de vazamento; bateria da fase

**Files:**
- Modify: as 12 telas que montam `<Moldura` (`src/app/(app)/apito/[jogadorId]/page.tsx`, `como-funciona/page.tsx`, `conta/page.tsx`, `estatisticas/{page,moldura}.tsx`, `estatisticas/{jogador,jogo,time}/[id]/page.tsx`, `fire-live/page.tsx`, `gestao/page.tsx`, `page.tsx`, `resultados/[data]/page.tsx`), `scripts/captura-telas.mjs`, `scripts/captura-telas.sh`

- [ ] **Step 1: `conta` na moldura** — em cada tela de aba: `conta={{ email: sessao.email }}` (o avatar sai com a inicial; `conta/page.tsx` passa `nome` e `fotoUrl` porque já os tem). `estatisticas/page.tsx:456`, `estatisticas/jogo/[id]/page.tsx:274` e `resultados/[data]/page.tsx:318` destructuram só `{ acesso }`: passam a `{ sessao, acesso }`. Telas com `aba={null}` não passam nada.

- [ ] **Step 1b: `MolduraConta`** (usada por `assinar`, `cadastrar` e `retorno/mercadopago`) — se alguma dessas telas passar `aba`, ela renderiza `<Moldura aba largura="leitura">` por dentro e some a `BarraInferior` própria; com `aba` nulo (o caso de todas hoje) só recebe os tokens. O `← NIP` do topo vira `<MarcaNip compacta />` num link para `/`.

- [ ] **Step 2: `captura-telas.mjs` — larguras da spec e vazamento**

```js
// no topo:
const LARGURAS = (process.env.CAPTURA_LARGURAS ?? '320,390,768,1440').split(',').map(Number)
const vazamentos = []
// no loop: `for (const largura of LARGURAS)`; depois de `metricas`:
if (metricas.larguraConteudo > largura) vazamentos.push(`${arquivo} @ ${largura}px: conteúdo com ${metricas.larguraConteudo}px`)
// ao fim, antes de fechar o Chrome:
if (vazamentos.length > 0) {
  console.error('ROLAGEM HORIZONTAL (o manual proíbe):\n  ' + vazamentos.join('\n  '))
  process.exitCode = 1
}
```

O nome do arquivo de saída passa a incluir a largura (`lista-secreta-390.png`, `-768`, `-1440`); ajustar `captura-telas.sh` (comentário de uso) e o relatório `conferencia.json`.

- [ ] **Step 3: Bateria da fase e captura**

Run: `npm run tokens && npm run typecheck && npm run lint && npm run boundaries && npm test && CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-`
Expected: tudo verde; **zero vazamentos** nas quatro larguras (o defeito do baseline a 390 some com a grade nova). Comparar com o artboard "Moldura".

---

# Fase 3 · Lista Secreta — **gate: artboard "Lista Secreta" aprovado**

### Task 3.1: O card na tipografia nova, piso de 12, estrela no canto; cabeçalho de jogo como `<summary>`

**Files:**
- Modify: `src/design-system/componentes/CardEntrada.tsx`, `Barrinhas.tsx`, `CabecalhoJogo.tsx`, `src/design-system/tokens/componente.ts` (`statusCiclo.largura`), `src/components/preferencias/BotaoAcompanharJogador.tsx` + `.module.css`
- Test: `src/design-system/__tests__/card.test.ts`, `barrinhas.test.ts`, `cabecalho-jogo.test.ts`, novo `src/components/preferencias/__tests__/botao-acompanhar.test.tsx`

**Interfaces:**
```tsx
CardEntradaProps.acaoCanto?: ReactNode        // renderizado no canto superior direito, acima da cobertura do link
<CabecalhoJogo raiz="div" | "summary" … />     // 'summary' torna o cabeçalho o gatilho de um <details>
<BotaoAcompanharJogador jogadorId inicial variante="texto" | "estrela" />
componente.statusCiclo.largura = '60px'
```

- [ ] **Step 1: Testes que falham**

```ts
// card.test.ts
it('identidade 05: nome em fonteTitulo 20, confiança em fonteNumero 34, nada abaixo de 12 px', () => {
  const html = render({ ...base, confianca: 90 })
  expect(html).toContain('font-size:20px')
  expect(html).toContain('font-size:34px')
  expect(html).toContain(semantico.fonteNumero)
  expect(html).not.toMatch(/font-size:1[01](?:\.\d+)?px/)
})
it('acaoCanto rende no canto, acima da cobertura do link do card', () => {
  const html = render({ ...base, detalheHref: '/apito/x', acaoCanto: createElement('button', { 'data-canto': 1 }, '★') })
  expect(html).toContain('data-canto')
  expect(html.indexOf('data-canto')).toBeLessThan(html.indexOf('aria-label="Análise do apito'))
})
// barrinhas.test.ts
it('caixas de 24 px e número de 12 px (piso do manual)', () => {
  const html = renderToStaticMarkup(createElement(Barrinhas, { jogos: [{ valor: 7, bateu: true }], rotulo: 'ÚLT. 5 NA LINHA' }))
  expect(html).toContain('width:24px')
  expect(html).not.toMatch(/font-size:1[01]px/)
})
// cabecalho-jogo.test.ts
it('raiz="summary" torna o cabeçalho o gatilho de um <details>, com o chevron', () => {
  const html = render({ ...base, raiz: 'summary' })
  expect(html.startsWith('<summary')).toBe(true)
  expect(html).toContain('aria-hidden="true"') // o chevron é decorativo
})
// botao-acompanhar.test.tsx (renderToStaticMarkup do componente cliente)
it('variante estrela: botão de 24 px com nome acessível e aria-pressed', () => {
  const html = renderToStaticMarkup(createElement(BotaoAcompanharJogador, { jogadorId: 'j1', inicial: true, variante: 'estrela' }))
  expect(html).toContain('aria-label="Acompanhar jogador"')
  expect(html).toContain('aria-pressed="true"')
  expect(html).not.toContain('+ Acompanhar')
})
```

- [ ] **Step 2: `CardEntrada.tsx`** — nome `fontSize: 20`; confiança `fontFamily: semantico.fonteNumero, fontSize: 34`; badge `fontSize: 12`; rótulo da zona 2 (`:523`) `fontSize: 12`; a coluna da direita vira:

```tsx
<div style={{ alignSelf: rotuloEstado || props.acaoCanto ? 'flex-start' : 'center', display: 'grid', justifyItems: 'end', gap: 6, position: 'relative', zIndex: 1 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    {props.acaoCanto}
    {rotuloEstado && (<span /* badge como hoje, fontSize 12 */>{rotuloEstado}</span>)}
  </div>
  {mostraPercentual && (<span /* confiança */ />)}
</div>
```

`componente.statusCiclo.largura: '60px'`; `cardRaio` já é 12.

- [ ] **Step 3: `Barrinhas.tsx`** — rótulo `fontSize: 12`; caixa `width: 24, height: 24, borderRadius: 6, fontSize: 12`.

- [ ] **Step 4: `CabecalhoJogo.tsx`** — prop `raiz?: 'div' | 'summary'` (padrão `'div'`); `ROTULO.fontSize: 12`; `:183` → 12; no ramo frio, `const Raiz = props.raiz ?? 'div'` e `<Raiz className="jogo-frio" style={{ …, listStyle: 'none', cursor: raiz === 'summary' ? 'pointer' : undefined }}>`; quando `summary`, ao fim do cabeçalho:

```tsx
<svg aria-hidden="true" className="jogo-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={semantico.textoSecundario} strokeWidth="1.5"><path d="M4 6l4 4 4-4" /></svg>
```

com, em `globals.css`: `summary.jogo-frio::-webkit-details-marker { display: none } details:not([open]) .jogo-chevron { transform: rotate(-90deg) }`.

- [ ] **Step 5: `BotaoAcompanharJogador`** — `variante?: 'texto' | 'estrela'` (padrão `'texto'`); a estrela:

```tsx
<button type="button" className={`${estilos.estrela} ${acompanhado ? estilos.estrelaAtiva : ''}`}
  aria-label={tipo === 'JOGADOR' ? 'Acompanhar jogador' : 'Acompanhar time'} aria-pressed={acompanhado} disabled={salvando} onClick={() => void alternar()}>
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill={acompanhado ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M8 1.5l2 4.2 4.5.6-3.3 3.2.8 4.5L8 11.8 4 14l.8-4.5L1.5 6.3 6 5.7z" /></svg>
</button>
```

```css
.estrela { width: 24px; height: 24px; display: inline-grid; place-items: center; border: 1px solid var(--divisor); border-radius: 999px; background: var(--superficie-elevada); color: var(--texto-secundario); cursor: pointer; padding: 0; }
.estrelaAtiva { color: var(--texto100); border-color: var(--texto-secundario); }
.estrela:focus-visible { outline: 2px solid var(--foco-anel); outline-offset: 2px; }
.botao { font-size: 12px; }  /* piso */
.erro { font-size: 12px; }
```

O erro ("Não foi possível salvar") na variante estrela sai em `title` do botão e `role="status"` visualmente oculto.

- [ ] **Step 6: Rodar** `npx vitest run src/design-system src/components` → verde.

### Task 3.2: A página — chips com menu já vêm da 2.3; entram o contador, as seções colapsáveis e a estrela

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Test: `src/app/__tests__/telas-04-lista.test.ts`

- [ ] **Step 1: Testes que falham** (no arnês existente, sem nomear jogador/time):

```ts
it('cada jogo com apito é um <details open> cujo summary é o cabeçalho do jogo', async () => {
  const html = await renderizar({})
  const jogos = (html.match(/<summary class="jogo-frio"/g) ?? []).length
  expect(jogos).toBeGreaterThan(0)
  expect((html.match(/<details open/g) ?? []).length).toBe(jogos)
})
it('o contador escreve o total de entradas em fonteNumero, e a descrição não repete o número', async () => {
  const html = await renderizar({})
  const feed = await lerFeed(banco.db, HOJE)
  const total = feed!.conteudo.itens.length
  expect(html).toContain(`>${total}</strong>`)
  expect(html).not.toContain(`${total} entradas em`)
})
it('acompanhar é a estrela no canto do card; o botão solto sob o card sumiu', async () => {
  const html = await renderizar({})
  expect(html).toContain('aria-label="Acompanhar jogador"')
  expect(html).not.toContain('+ Acompanhar jogador')
})
```

(`renderizar(busca)` é o auxiliar que `telas-04-lista.test.ts:78` já tem.)

- [ ] **Step 2: `page.tsx`**

- Descrição: `fontSize: 14`, sem o `<span>` da contagem; `contador={{ numero: entradasPublicadas.length, rotulo: \`entrada${entradasPublicadas.length === 1 ? '' : 's'} em ${jogosComApito} jogo${jogosComApito === 1 ? '' : 's'}\` }}` no `CabecalhoTela`.
- Seções: `<section key={grupo.jogoId}>` vira `<details key={grupo.jogoId} open>` com `<CabecalhoJogo raiz="summary" …/>` e a grade dentro. Comentário: "Colapsável por sessão: `<details>` nativo, aberto por padrão, sem persistir (spec §6.4)."
- `CartaoDaLista`: passa `acaoCanto={<BotaoAcompanharJogador variante="estrela" jogadorId={item.jogadorId} inicial={acompanhado} />}` ao `CardEntrada` e remove o `<BotaoAcompanharJogador>` solto e o `<div>` que o envolvia (o card é a raiz).
- A narrativa do dia mantém 13 px e a régua em `divisor` (já é).

- [ ] **Step 3: Rodar** `npx vitest run src/app/__tests__/telas-04-lista.test.ts src/app/__tests__/paywall.test.ts` → verde (a ordem `exigirNivel → atende → lerFeed` não muda).

### Task 3.3: Bateria da fase, captura e conferência da demo

- [ ] **Step 1:** `npm run tokens && npm run typecheck && npm run lint && npm run boundaries && npm test`
- [ ] **Step 2:** `CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-04-lista` → comparar `lista-secreta-1440.png` e `-390.png` com o artboard "Lista Secreta"; zero vazamentos.
- [ ] **Step 3:** `npm run demo:conferir` → verde.

---

# Fase 4 · Lateral direita — **gate: artboard "Lateral" aprovado**

### Task 4.1: O leitor da lateral (puro) e o leitor cacheado (app)

**Files:**
- Modify: `src/modules/entrega/resultados.ts` (exporta `diasDaTemporada`, movida de `resultados/[data]/page.tsx:83-100`), `src/app/(app)/resultados/[data]/page.tsx` (importa)
- Create: `src/modules/entrega/lateral.ts`, `src/modules/entrega/__tests__/lateral.test.ts`, `src/app/(app)/lateral/leitura.ts`

**Interfaces:**
```ts
// modules/entrega/lateral.ts — puro, recebe db e datas
export type LinhaCompacta = { timeId: string; sigla: string; nome: string; posicao: number | null; vitorias: number; derrotas: number; aproveitamento: number | null }
export type DadosDaLateral = {
  noite: { data: string; publicados: number; conferidos: number; bateram: number; taxa: number | null; noiteEncerrada: boolean } | null
  temporada: TaxaDaTemporada | null
  classificacao: { temporada: string; conferencias: { conferencia: string; linhas: LinhaCompacta[] }[] }
}
export async function lerLateral(db: Db, opcoes: { hoje: string; temporada: string; config: ConfigTemporada; linhas?: number }): Promise<DadosDaLateral>
// app/(app)/lateral/leitura.ts
export const TAG_LATERAL = 'lateral'
export function lerLateralCacheada(hoje: string, temporada: string, config: ConfigTemporada): Promise<DadosDaLateral>
```

- [ ] **Step 1: Teste que falha** (`lateral.test.ts`, PGlite semeado como `telas-demo`):

```ts
describe('leitor da lateral', () => {
  it('a noite é a ÚLTIMA CONFERIDA, e sem noite conferida vem null — nunca taxa parcial', async () => {
    const dados = await lerLateral(banco.db, { hoje: HOJE, temporada, config })
    if (dados.noite) {
      expect(dados.noite.data).toBe(await ultimaRodadaConferida(banco.db, HOJE))
      if (!dados.noite.noiteEncerrada) expect(dados.noite.taxa).toBeNull()
    } else {
      expect(dados.temporada).toBeNull()
    }
  })
  it('a classificação vem por conferência, ordenada por posição, cortada em 8 linhas', async () => {
    const dados = await lerLateral(banco.db, { hoje: HOJE, temporada, config })
    for (const conf of dados.classificacao.conferencias) {
      expect(conf.linhas.length).toBeLessThanOrEqual(8)
      const posicoes = conf.linhas.map((l) => l.posicao ?? Infinity)
      expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes)
    }
  })
  it('só lê dado grátis: nenhum campo de apito, nível ou confiança', async () => {
    const dados = await lerLateral(banco.db, { hoje: HOJE, temporada, config })
    expect(JSON.stringify(dados)).not.toMatch(/confianca|nivelApito|apitos|jogadorId/)
  })
})
```

- [ ] **Step 2: `lerLateral`**

```ts
export async function lerLateral(db: Db, opcoes: { hoje: string; temporada: string; config: ConfigTemporada; linhas?: number }): Promise<DadosDaLateral> {
  const corte = opcoes.linhas ?? 8
  const data = await ultimaRodadaConferida(db, opcoes.hoje)
  const [recap, taxa, classificacao] = await Promise.all([
    data ? recapDaNoite(db, data) : Promise.resolve(null),
    data ? taxaDaTemporada(db, somarDias(data, 1), diasDaTemporada(data, opcoes.config)) : Promise.resolve(null),
    telaDaClassificacao(db, opcoes.temporada),
  ])
  const conferencias = [...new Set(classificacao.linhas.map((l) => l.conferencia))]
    .filter((c): c is string => c !== null)
    .sort((a, b) => a.localeCompare(b))
    .map((conferencia) => ({
      conferencia,
      linhas: classificacao.linhas
        .filter((l) => l.conferencia === conferencia)
        .sort((a, b) => (a.posicao ?? Infinity) - (b.posicao ?? Infinity))
        .slice(0, corte)
        .map(({ timeId, sigla, nome, posicao, vitorias, derrotas, aproveitamento }) => ({ timeId, sigla, nome, posicao, vitorias, derrotas, aproveitamento })),
    }))
  return {
    noite: recap && data ? { data, publicados: recap.publicados, conferidos: recap.conferidos, bateram: recap.bateram, taxa: recap.noiteEncerrada ? recap.taxa : null, noiteEncerrada: recap.noiteEncerrada } : null,
    temporada: taxa,
    classificacao: { temporada: opcoes.temporada, conferencias },
  }
}
```

Conferir com `grep -n "conferencia" src/modules/ingestao/demo/jogos.ts` que o valor gravado é `Leste`/`Oeste` (é o rótulo das abas da lateral). Se for outro, mapear aqui com um `Record` pequeno e comentado.

- [ ] **Step 3: `app/(app)/lateral/leitura.ts`**

```ts
import { unstable_cache } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import { lerLateral, type DadosDaLateral } from '@/modules/entrega/lateral'
import type { ConfigTemporada } from '@/modules/dominio/temporada'

/** Tag do cache da lateral: quem muda o dado (Task 4.4) revalida por ela. */
export const TAG_LATERAL = 'lateral'

/**
 * A lateral é lida UMA vez por dia por processo, não uma vez por usuário: recap
 * da última noite e classificação mudam poucas vezes por dia. Só dado grátis
 * entra aqui (spec §7) — `paywall.test.ts` continua proibindo cache nas páginas
 * pagas, e esta função não é página.
 */
export const lerLateralCacheada = unstable_cache(
  async (hoje: string, temporada: string, config: ConfigTemporada): Promise<DadosDaLateral> =>
    lerLateral(getDb(), { hoje, temporada, config }),
  ['lateral'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)
```

- [ ] **Step 4: Rodar** `npx vitest run src/modules/entrega/__tests__/lateral.test.ts src/app/__tests__/telas-04-resultados.test.ts` → verde.

### Task 4.2: Os componentes da lateral e a montagem

**Files:**
- Create: `src/components/lateral/Lateral.tsx`, `UltimaNoite.tsx`, `ClassificacaoCompacta.tsx` (`'use client'`), `Lateral.module.css`, `index.ts`; `src/app/(app)/lateral/montar.tsx`
- Modify: `src/app/__tests__/conferencia.ts` (módulo CSS)
- Test: `src/components/lateral/__tests__/lateral.test.tsx`

**Interfaces:**
```tsx
<Lateral dados={DadosDaLateral} fuso={string} assistente={boolean} gratis={boolean} />
<UltimaNoite noite={DadosDaLateral['noite']} temporada={DadosDaLateral['temporada']} />
<ClassificacaoCompacta conferencias={DadosDaLateral['classificacao']['conferencias']} temporada={string} />
// montar.tsx
export async function lateralPadrao(opcoes: { assistente: boolean; gratis: boolean }): Promise<ReactNode>
```

- [ ] **Step 1: Testes que falham**

```ts
it('última noite: três números em fonteNumero, a data da noite e o link para a tela', () => {
  const html = renderToStaticMarkup(createElement(UltimaNoite, { noite: { data: '2026-01-14', publicados: 27, conferidos: 22, bateram: 15, taxa: 15 / 22, noiteEncerrada: true }, temporada: { conferidos: 412, acertos: 280, rodadas: 60 } }))
  expect(html).toContain('APITOS'); expect(html).toContain('BATERAM'); expect(html).toContain('NA NOITE')
  expect(html).toContain('>27<'); expect(html).toContain('>15<'); expect(html).toContain('68%')
  expect(html).toContain('68% em 412 apitos')
  expect(html).toContain('href="/resultados/2026-01-14"')
  expect(html).not.toMatch(/probabilidade/i)
})
it('noite em curso: escreve "aguardando o fim da noite", nunca uma taxa', () => {
  const html = renderToStaticMarkup(createElement(UltimaNoite, { noite: { data: '2026-01-15', publicados: 30, conferidos: 4, bateram: 3, taxa: null, noiteEncerrada: false }, temporada: null }))
  expect(html).toContain('aguardando o fim da noite')
  expect(html).not.toContain('%')
})
it('classificação compacta: abas por conferência, a primeira aberta, 8 linhas com V–D e %', () => {
  const linhas = Array.from({ length: 8 }, (_, i) => ({ timeId: `t${i}`, sigla: 'BOS', nome: 'Boston Celtics', posicao: i + 1, vitorias: 30 - i, derrotas: 10 + i, aproveitamento: (30 - i) / 40 }))
  const html = renderToStaticMarkup(createElement(ClassificacaoCompacta, { temporada: '2025-26', conferencias: [{ conferencia: 'Leste', linhas }, { conferencia: 'Oeste', linhas }] }))
  expect(html).toContain('aria-selected="true"')
  expect(html.match(/<tr/g)!.length).toBe(9)      // cabeçalho + 8
  expect(html).toContain('30–10')
  expect(html).toContain('href="/estatisticas"')
})
it('a lateral do grátis abre com o banner e não tem doca', () => {
  const html = renderToStaticMarkup(createElement(Lateral, { dados: vazio, fuso: 'America/Sao_Paulo', assistente: false, gratis: true }))
  expect(html).toContain('começa no')
  expect(html).not.toContain('Pergunte sobre a lista de hoje')
})
```

(`vazio` = `{ noite: null, temporada: null, classificacao: { temporada: '2025-26', conferencias: [] } }`.)

- [ ] **Step 2: `UltimaNoite.tsx`** (servidor)

```tsx
export function UltimaNoite({ noite, temporada }: { noite: DadosDaLateral['noite']; temporada: DadosDaLateral['temporada'] }) {
  if (!noite) return <Bloco titulo="ÚLTIMA NOITE"><p className={estilos.apoio}>Ainda sem noite conferida nesta temporada.</p></Bloco>
  const inteiro = (t: number) => `${Math.round(t * 100)}%`
  return (
    <Bloco titulo={`NOITE DE ${diaDaRodada(noite.data).toUpperCase()}`}>
      <div className={estilos.numeros}>
        <Numero rotulo="APITOS" valor={String(noite.publicados)} />
        <Numero rotulo="BATERAM" valor={noite.noiteEncerrada ? String(noite.bateram) : '—'} />
        <Numero rotulo="NA NOITE" valor={noite.noiteEncerrada && noite.taxa !== null ? inteiro(noite.taxa) : '—'} />
      </div>
      {!noite.noiteEncerrada && <p className={estilos.apoio}>aguardando o fim da noite</p>}
      {temporada && temporada.conferidos > 0 && (
        <p className={estilos.apoio}>Temporada: {inteiro(temporada.acertos / temporada.conferidos)} em {temporada.conferidos} apitos</p>
      )}
      <Link href={`/resultados/${noite.data}`} className={estilos.link}>Ver a noite</Link>
    </Bloco>
  )
}
function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (<p className={estilos.numero}><strong style={{ fontFamily: semantico.fonteNumero, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{valor}</strong><span>{rotulo}</span></p>)
}
```

`Bloco` (em `Lateral.tsx`, exportado para os irmãos): `<section className={estilos.bloco}><h2 className={estilos.titulo}>{titulo}</h2>{children}</section>` — título em `fonteRotulo` 12 caixa-alta.

- [ ] **Step 3: `ClassificacaoCompacta.tsx`** (`'use client'`, `useState(0)` para a aba)

```tsx
export function ClassificacaoCompacta({ conferencias, temporada }: { conferencias: DadosDaLateral['classificacao']['conferencias']; temporada: string }) {
  const [ativa, setAtiva] = useState(0)
  const atual = conferencias[ativa]
  return (
    <Bloco titulo="CLASSIFICAÇÃO">
      <div role="tablist" aria-label="Conferência" className={estilos.abas}>
        {conferencias.map((c, i) => (
          <button key={c.conferencia} role="tab" type="button" aria-selected={i === ativa} className={`${estilos.aba} ${i === ativa ? estilos.abaAtiva : ''}`} onClick={() => setAtiva(i)}>{c.conferencia.toUpperCase()}</button>
        ))}
      </div>
      {atual ? (
        <table className={estilos.tabela} role="tabpanel">
          <thead><tr><th scope="col">POS</th><th scope="col">TIME</th><th scope="col">V–D</th><th scope="col">%</th></tr></thead>
          <tbody>
            {atual.linhas.map((l) => (
              <tr key={l.timeId}>
                <td>{l.posicao ?? '—'}</td>
                <td><IdentidadeTime sigla={l.sigla} tamanhoLogo={18} /></td>
                <td>{l.vitorias}–{l.derrotas}</td>
                <td>{l.aproveitamento === null ? '—' : (l.aproveitamento * 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (<p className={estilos.apoio}>Sem classificação registrada para {temporada}.</p>)}
      <Link href="/estatisticas" className={estilos.link}>Ver completa</Link>
    </Bloco>
  )
}
```

- [ ] **Step 4: `Lateral.tsx`** (servidor)

```tsx
export function Lateral({ dados, fuso, assistente, gratis }: { dados: DadosDaLateral; fuso: string; assistente: boolean; gratis: boolean }) {
  return (
    <div className={estilos.lateral}>
      {gratis && <ConviteDoPlano variante="faixa" minimo="MVP" recurso="Lista, Fire Live e assistente" voltar="/" />}
      <UltimaNoite noite={dados.noite} temporada={dados.temporada} />
      <ClassificacaoCompacta conferencias={dados.classificacao.conferencias} temporada={dados.classificacao.temporada} />
      {!gratis && assistente && <DocaDoAssistente />}
    </div>
  )
}
```

(`ConviteDoPlano` com `variante` nasce na Task 5.1; até lá a fase 4 usa `<ConviteDoPlano minimo="MVP" recurso="Lista, Fire Live e assistente" voltar="/" />` e a 5.1 troca. `DocaDoAssistente` nasce na 4.3; a 4.2 deixa o slot com um comentário e o teste da doca entra na 4.3.)

`Lateral.module.css`: `.lateral { display: grid; gap: 16px; }` `.bloco { padding: 16px; border-radius: 12px; background: var(--superficie); border: 1px solid var(--divisor); }` `.titulo { margin: 0 0 10px; font: 600 12px var(--fonte-rotulo); letter-spacing: .06em; text-transform: uppercase; color: var(--texto-secundario); }` `.numeros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }` `.numero { margin: 0; display: grid; }` `.numero span { font: 600 12px var(--fonte-rotulo); letter-spacing: .06em; color: var(--texto-secundario); }` `.apoio { margin: 8px 0 0; font-size: 12px; color: var(--texto-secundario); }` `.link { display: inline-block; margin-top: 10px; color: var(--texto-primario); text-decoration: underline; text-underline-offset: 3px; font-size: 13px; }` `.abas { display: flex; gap: 16px; border-bottom: 1px solid var(--divisor); margin-bottom: 8px; }` `.aba { background: none; border: none; border-bottom: 2px solid transparent; padding: 6px 2px; color: var(--texto-secundario); font: 600 12px var(--fonte-rotulo); letter-spacing: .06em; cursor: pointer; }` `.abaAtiva { color: var(--texto100); border-bottom-color: var(--texto100); }` `.aba:focus-visible { outline: 2px solid var(--foco-anel); outline-offset: 2px; }` `.tabela { width: 100%; border-collapse: collapse; font-size: 13px; }` `.tabela th { text-align: left; font: 600 12px var(--fonte-rotulo); color: var(--texto-secundario); padding: 4px 0; }` `.tabela td { padding: 6px 0; border-top: 1px solid var(--divisor-suave); font-variant-numeric: tabular-nums; }` `.doca { position: sticky; bottom: 0; margin-top: auto; }`. Acrescentar a `MODULOS_CSS_DA_CONFERENCIA`.

- [ ] **Step 5: `montar.tsx`**

```tsx
export async function lateralPadrao({ assistente, gratis }: { assistente: boolean; gratis: boolean }): Promise<ReactNode> {
  const ruleset = await rulesetAtivo()
  const config = calendarioDoRuleset(ruleset)
  const agora = new Date()
  const hoje = dataDeReferencia(agora, ruleset.rodada.fuso)
  const dados = await lerLateralCacheada(hoje, temporadaDe(agora, config), config)
  return <Lateral dados={dados} fuso={ruleset.rodada.fuso} assistente={assistente} gratis={gratis} />
}
```

- [ ] **Step 6: Rodar** `npx vitest run src/components/lateral` → verde.

### Task 4.3: A doca do assistente; o painel em modo doca; o botão flutuante some a partir de 1280

**Files:**
- Create: `src/components/lateral/DocaDoAssistente.tsx` (`'use client'`)
- Modify: `src/components/chat/PainelChat.tsx` (+ `modo`), `PainelChat.module.css`, `BotaoChat.module.css`
- Test: `src/components/lateral/__tests__/lateral.test.tsx`, `src/components/chat/__tests__/*` (o que existir para o painel)

**Interfaces:**
```tsx
<PainelChat aoFechar modo?="gaveta" | "doca" />   // 'doca': sem véu, static, 60vh, dentro da lateral
<DocaDoAssistente />                              // recolhida: campo + última resposta; foco abre o painel em modo doca
```

- [ ] **Step 1: Testes que falham**

```ts
it('a doca recolhida é um campo estático com o convite a perguntar', () => {
  const html = renderToStaticMarkup(createElement(DocaDoAssistente))
  expect(html).toContain('placeholder="Pergunte sobre a lista de hoje"')
  expect(html).not.toContain('role="dialog"')
})
// no teste do painel (se existir; senão criar `painel-chat.test.tsx`):
it('modo doca: sem véu e sem posição fixa', () => {
  const html = renderToStaticMarkup(createElement(PainelChat, { aoFechar: () => {}, modo: 'doca' }))
  expect(html).not.toContain('_veu_')
  expect(html).toContain('_doca_')
})
```

- [ ] **Step 2: `PainelChat.tsx`** — prop `modo: 'gaveta' | 'doca' = 'gaveta'`; o `<div className={estilos.veu}>` só em `gaveta`; `<aside className={`${estilos.painel} ${modo === 'doca' ? estilos.doca : ''}`} role={modo === 'gaveta' ? 'dialog' : 'region'} …>`; o botão ✕ vira "Recolher" em `doca`. CSS: `.doca { position: static; width: 100%; height: 60vh; border-left: none; border-top: 1px solid var(--divisor); border-radius: 12px 12px 0 0; }`.

- [ ] **Step 3: `DocaDoAssistente.tsx`**

```tsx
'use client'
const PainelChat = dynamic(() => import('../chat/PainelChat').then((m) => m.PainelChat), { ssr: false })

/**
 * A DOCA — o assistente fixo no rodapé da lateral (spec §7.3). Recolhida é um
 * formulário estático; o painel só baixa no primeiro foco, como o botão
 * flutuante só baixa no primeiro clique. A primeira linha da última resposta do
 * dia entra quando existe, e só se a lateral está visível (≥ larguraLateral):
 * abaixo disso a doca está oculta e não vale uma requisição.
 */
export function DocaDoAssistente() {
  const [aberta, setAberta] = useState(false)
  const [ultima, setUltima] = useState<string | null>(null)
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1280px)').matches) return
    let ativo = true
    fetch('/api/chat')
      .then((r) => (r.ok ? (r.json() as Promise<{ mensagens?: { papel: string; texto: string }[] }>) : null))
      .then((corpo) => {
        const resposta = corpo?.mensagens?.filter((m) => m.papel !== 'USUARIO').at(-1)?.texto
        if (ativo && resposta) setUltima(resposta.split('\n')[0]!.slice(0, 120))
      })
      .catch(() => undefined)
    return () => { ativo = false }
  }, [])
  return (
    <div className={estilos.doca}>
      {aberta ? (
        <PainelChat modo="doca" aoFechar={() => setAberta(false)} />
      ) : (
        <form className={estilos.docaRecolhida} onSubmit={(e) => { e.preventDefault(); setAberta(true) }}>
          {ultima && <p className={estilos.apoio}>{ultima}</p>}
          <input type="text" className={estilos.campo} placeholder="Pergunte sobre a lista de hoje" aria-label="Pergunte ao assistente" onFocus={() => setAberta(true)} />
        </form>
      )}
    </div>
  )
}
```

CSS em `Lateral.module.css`: `.docaRecolhida { display: grid; gap: 6px; }` `.campo { width: 100%; min-height: 48px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--divisor); background: var(--superficie-elevada); color: var(--texto-primario); font: 400 14px var(--fonte-corpo); }` `.campo::placeholder { color: var(--texto-secundario); }` `.campo:focus-visible { outline: 2px solid var(--foco-anel); outline-offset: 2px; }`.

- [ ] **Step 4: `BotaoChat.module.css`** — acrescentar `@media (min-width: 1280px) { .botao { display: none; } }` com o comentário "a partir daqui o assistente é a doca da lateral (spec §7.3)".

- [ ] **Step 5:** `Lateral.tsx` passa a renderizar `<DocaDoAssistente />` no slot. Rodar `npx vitest run src/components/lateral src/components/chat` → verde.

### Task 4.4: As telas de aba passam a lateral; a invalidação no cron; os testes de tela mocam `next/cache`

**Files:**
- Modify: `src/app/(app)/page.tsx`, `fire-live/page.tsx`, `estatisticas/page.tsx`, `estatisticas/moldura.tsx`, `estatisticas/{jogador,jogo,time}/[id]/page.tsx`, `gestao/page.tsx`, `conta/page.tsx`, `resultados/[data]/page.tsx`; `src/app/api/cron/sincronizar-rodada/route.ts`; `src/app/__tests__/telas-*.test.ts` (mock); `src/app/__tests__/paywall.test.ts`
- Test: `src/app/__tests__/telas-04-lista.test.ts`, `paywall.test.ts`

- [ ] **Step 1: Mock de `next/cache` nos testes de tela** — em cada `telas-*.test.ts` que renderiza tela de aba, junto dos outros `vi.mock`:

```ts
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
```

- [ ] **Step 2: Testes que falham**

```ts
// telas-04-lista.test.ts
it('a 1280+ a Lista tem a lateral: última noite, classificação e a doca do assistente', async () => {
  const html = await renderizar({})
  expect(html).toContain('aria-label="Painel lateral"')
  expect(html).toContain('CLASSIFICAÇÃO')
  expect(html).toContain('placeholder="Pergunte sobre a lista de hoje"')   // acesso ALL_STAR no arnês
})
// paywall.test.ts
it('a lateral só lê dado grátis e o cron da rodada revalida a tag dela', () => {
  expect(ler('src/app/(app)/lateral/leitura.ts')).toContain("tags: [TAG_LATERAL]")
  expect(ler('src/modules/entrega/lateral.ts')).not.toMatch(/lerFeed|lerFeedFireLive|apitos/)
  expect(ler('src/app/api/cron/sincronizar-rodada/route.ts')).toContain("revalidateTag(TAG_LATERAL, 'max')")
})
```

- [ ] **Step 3: As telas** — em cada `<Moldura aba="…" …>` de tela de aba: `lateral={await lateralPadrao({ assistente: atende(acesso.nivel, 'MVP'), gratis: !atende(acesso.nivel, 'MVP') })}`. Na Lista, tanto o ramo do grátis quanto o pago e o "antes da publicação" passam a lateral (a leitura é grátis e cacheada; não muda a ordem `exigirNivel → atende → lerFeed` que `paywall.test` vigia: chamar `lateralPadrao` DEPOIS do `atende`). O `page.tsx` sem `DATABASE_URL` não passa nada.

- [ ] **Step 4: O cron** — em `sincronizar-rodada/route.ts`, após `executarJobComLease` devolver: `revalidateTag(TAG_LATERAL, 'max')` (import de `next/cache` e de `@/app/(app)/lateral/leitura`). Comentário: "A classificação e o box score da noite mudaram: a lateral lê de novo na próxima requisição."

- [ ] **Step 5: Bateria da fase e captura**

Run: `npm run tokens && npm run typecheck && npm run lint && npm run boundaries && npm test && CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-`
Expected: verde; a 1440 a lateral aparece nas telas de aba e some no detalhe; zero vazamentos. Comparar com o artboard "Lateral".

---

# Fase 5 · Paywall — **gate: artboard "Paywall" aprovado**

### Task 5.1: `ConviteDoPlano` em duas variantes; `SilhuetaPaga`

**Files:**
- Modify: `src/components/planos/ConviteDoPlano.tsx`
- Create: `src/components/planos/SilhuetaPaga.tsx`, `SilhuetaPaga.module.css`, `src/components/planos/__tests__/silhueta.test.tsx`
- Modify: `src/app/__tests__/conferencia.ts` (módulo CSS), `src/app/__tests__/planos-assinar.test.tsx` (se afirmar o texto do botão)

**Interfaces:**
```tsx
<ConviteDoPlano minimo recurso voltar variante?="compacto" | "faixa" />   // padrão 'compacto' (o de hoje, revestido); 'faixa' = banner azul
export type FormaDaSilhueta = 'cards' | 'tabela' | 'numeros' | 'formulario'
<SilhuetaPaga forma={FormaDaSilhueta}>{convite}</SilhuetaPaga>          // o convite fica POR CIMA da silhueta borrada
```

- [ ] **Step 1: Testes que falham**

```ts
it('a silhueta não recebe dado: só a forma, e é aria-hidden por inteiro', () => {
  const html = renderToStaticMarkup(createElement(SilhuetaPaga, { forma: 'cards' }, 'CONVITE'))
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('CONVITE')
  expect(html).not.toMatch(/\d/)          // nenhum número desenhado
  expect((SilhuetaPaga as unknown as { length: number }).length).toBe(1)
})
it('cada forma desenha blocos diferentes', () => {
  const formas = ['cards', 'tabela', 'numeros', 'formulario'] as const
  const htmls = formas.map((forma) => renderToStaticMarkup(createElement(SilhuetaPaga, { forma })))
  expect(new Set(htmls).size).toBe(4)
})
it('variante faixa: banner com título em fonteTitulo, botão branco sobre azul', () => {
  const html = renderToStaticMarkup(createElement(ConviteDoPlano, { minimo: 'MVP', recurso: 'A Lista Secreta', voltar: '/', variante: 'faixa' }))
  expect(html).toContain(`background:${semantico.acento}`)
  expect(html).toContain(`background:${semantico.textoSobreAcento}`)   // o botão
  expect(html).toContain(`color:${semantico.cromo}`)                   // texto do botão em navy (16,9)
  expect(html).toContain('COMEÇA NO')
})
```

- [ ] **Step 2: `SilhuetaPaga.tsx`**

```tsx
export type FormaDaSilhueta = 'cards' | 'tabela' | 'numeros' | 'formulario'
const BLOCOS: Record<FormaDaSilhueta, number> = { cards: 2, tabela: 6, numeros: 6, formulario: 4 }

/**
 * O EFEITO STATSHUB, sem o dado (spec §8): formas fixas atrás de um véu, com o
 * convite por cima. Nunca recebe prop de dado — a única prop é a forma — e a
 * quantidade de blocos é a mesma para todo jogo, seção e usuário: quantos
 * apitos há hoje também é sinal.
 */
export function SilhuetaPaga({ forma, children }: { forma: FormaDaSilhueta; children?: ReactNode }) {
  return (
    <div className={estilos.moldura}>
      <div className={`${estilos.silhueta} ${estilos[forma]}`} aria-hidden="true">
        {Array.from({ length: BLOCOS[forma] }, (_, i) => <div key={i} className={estilos.bloco} />)}
      </div>
      <div className={estilos.veu} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6a3 3 0 0 1 6 0v3" /></svg>
      </div>
      {children && <div className={estilos.convite}>{children}</div>}
    </div>
  )
}
```

```css
.moldura { position: relative; }
.silhueta { display: grid; gap: 12px; filter: blur(6px); pointer-events: none; user-select: none; }
.cards { grid-template-columns: repeat(auto-fill, minmax(min(420px, 100%), 1fr)); }
.cards .bloco { height: 168px; border-radius: 12px; background: var(--superficie); border: 1px solid var(--divisor); }
.tabela .bloco { height: 36px; border-radius: 6px; background: var(--superficie); }
.numeros { grid-template-columns: repeat(3, 1fr); }
.numeros .bloco { height: 64px; border-radius: 8px; background: var(--superficie); }
.formulario .bloco { height: 52px; border-radius: 8px; background: var(--superficie-elevada); }
.formulario .bloco:last-child { height: 48px; background: var(--divisor); }
.veu { position: absolute; inset: 0; display: grid; place-items: center; color: var(--texto-secundario); background: linear-gradient(180deg, var(--veu-paywall-inicio), var(--veu-paywall-fim)); border-radius: 12px; }
.convite { position: absolute; left: 0; right: 0; bottom: 16px; display: flex; justify-content: center; padding: 0 16px; }
@media (prefers-reduced-motion: no-preference) { .silhueta { transition: none; } }
```

O véu NÃO escreve cor no CSS: entram dois tokens — `primitivo.fundoNipVeu35: 'rgba(7,20,38,.35)'`, `primitivo.fundoNipVeu85: 'rgba(7,20,38,.85)'`, `semantico.veuPaywallInicio: p.fundoNipVeu35`, `semantico.veuPaywallFim: p.fundoNipVeu85` — e o CSS usa `background: linear-gradient(180deg, var(--veu-paywall-inicio), var(--veu-paywall-fim))`. `npm run tokens` regenera; o teste de paridade cobra.

- [ ] **Step 3: `ConviteDoPlano.tsx`** — `variante = 'compacto'`; o compacto é o `<section>` de hoje com o botão em `componente.ctaFundo`/`ctaTexto`, `minHeight: 40`, raio 8; a faixa:

```tsx
if (variante === 'faixa') return (
  <section aria-label={`${recurso} começa no plano ${ROTULO_DO_NIVEL[minimo]}`}
    style={{ padding: '20px 20px 18px', borderRadius: 12, background: semantico.acento, color: semantico.textoSobreAcento }}>
    {/* Em caixa-alta no TEXTO, não só no CSS: é o que o leitor de tela e o teste recebem. */}
    <p style={{ margin: 0, fontFamily: semantico.fonteTitulo, fontSize: 24, letterSpacing: '0.02em' }}>
      {`${recurso} COMEÇA NO ${ROTULO_DO_NIVEL[minimo]}`.toUpperCase()}
    </p>
    <p style={{ margin: '6px 0 14px', fontSize: 14, opacity: 0.9 }}>Os apitos do dia, o Fire Live e o assistente, com a metodologia NIP.</p>
    <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', minHeight: componente.ctaAltura, padding: '0 18px', borderRadius: componente.raioControle, background: semantico.textoSobreAcento, color: semantico.cromo, fontWeight: 700, textDecoration: 'none' }}>
      Ver planos
    </Link>
  </section>
)
```

- [ ] **Step 4: Rodar** `npx vitest run src/components/planos src/app/__tests__/planos-assinar.test.tsx` → verde.

### Task 5.2: A Lista e o Fire Live do grátis: faixa, cabeçalhos reais, silhuetas; a lateral do grátis

**Files:**
- Modify: `src/components/planos/JogosDoDia.tsx`, `src/app/(app)/page.tsx` (ramo grátis), `fire-live/page.tsx` (ramo grátis), `src/app/globals.css` (`.so-ate-lateral`)
- Create: `src/app/__tests__/telas-05-gratis.test.ts`
- Test: `paywall.test.ts`

**Interfaces:**
```tsx
<JogosDoDia jogos fuso temperatura?="frio" | "quente" />   // um CabecalhoJogo real por jogo + SilhuetaPaga forma="cards"
```

- [ ] **Step 1: Teste que falha** — `telas-05-gratis.test.ts`, o mesmo arnês de `telas-04-lista.test.ts` (copiar o `beforeAll`, os mocks e o `renderizar` dela como `renderizarLista`; o de `telas-04-firelive.test.ts:88` como `renderizarFireLive`), com `acessoDeTeste('GRATIS')` no mock de `avaliarAcesso` e o mock de `next/cache`:

```ts
it('a Lista do grátis: moldura inteira, faixa, um cabeçalho real por jogo, uma silhueta por jogo, nenhum card e nenhum nome do feed', async () => {
  const html = await renderizarLista({})
  expect(html).toContain('LISTA DO DIA')
  expect(html).toContain('COMEÇA NO')
  const jogos = (await jogosDoDiaResumo(banco.db, HOJE, FUSO)).length
  expect((html.match(/class="jogo-frio"/g) ?? []).length).toBe(jogos)
  expect((html.match(/_silhueta_/g) ?? []).length).toBe(jogos)
  expect(html).not.toContain('<article')
  const feed = await lerFeed(banco.db, HOJE)
  for (const item of feed!.conteudo.itens) expect(html).not.toContain(item.nome)
  expect(html).not.toContain('placeholder="Pergunte sobre a lista de hoje"')
})
it('o Fire Live do grátis nunca veste o universo quente nas silhuetas', async () => {
  const html = await renderizarFireLive({})
  expect(html).toContain('COMEÇA NO')
  expect(html).not.toContain(componente.contextoQuente.cardGradiente)
})
```

- [ ] **Step 2: `JogosDoDia.tsx`**

```tsx
export function JogosDoDia({ jogos, fuso, temperatura = 'frio' }: { jogos: JogoResumo[]; fuso: string; temperatura?: 'frio' | 'quente' }) {
  if (jogos.length === 0) return <p style={{ color: semantico.textoSecundario }}>Sem jogos hoje.</p>
  return (
    <div style={{ display: 'grid', gap: 18, marginTop: 16 }}>
      {jogos.map((j) => (
        <section key={j.id}>
          <CabecalhoJogo casaSigla={j.casaSigla} visitanteSigla={j.visitanteSigla} horarioUtc={j.dataHoraUtc} fuso={fuso} status={j.status} quartoAtual={j.quartoAtual} placarCasa={j.placarCasa} placarVisitante={j.placarVisitante} temperatura={temperatura} />
          {/* Silhuetas NEUTRAS mesmo no Fire Live: nunca o modo fire (spec §8). */}
          <SilhuetaPaga forma="cards" />
        </section>
      ))}
    </div>
  )
}
```

(No Fire Live, `temperatura="quente"` só no cabeçalho; a silhueta é a mesma.)

- [ ] **Step 3: As telas** — ramo grátis da Lista:

```tsx
<Moldura aba="lista" largura="dados" conta={{ email: sessao.email }} lateral={await lateralPadrao({ assistente: false, gratis: true })}>
  <CabecalhoTela sobrancelha="LISTA SECRETA" titulo="LISTA DO DIA" selo={<SeloContexto contexto="preLive" />}>
    <p style={{ margin: 0, fontSize: 14, color: semantico.textoSecundario }}>Rodada de {diaDaRodada(hoje)}</p>
  </CabecalhoTela>
  <div className="so-ate-lateral"><ConviteDoPlano variante="faixa" minimo="MVP" recurso="A Lista Secreta" voltar="/" /></div>
  <JogosDoDia jogos={jogosDoDia} fuso={fuso} />
</Moldura>
```

Fire Live idem com `temperatura="quente"`, selo `aoVivo`, `recurso="O Fire Live"`. `globals.css`: `@media (min-width: 1280px) { .so-ate-lateral { display: none; } }` com o comentário "a partir daqui o banner mora na lateral (spec §8)".

- [ ] **Step 4: Rodar** `npx vitest run src/app/__tests__/telas-05-gratis.test.ts src/app/__tests__/paywall.test.ts src/app/__tests__/telas-04-firelive.test.ts` → verde.

### Task 5.3: Estatísticas, Gestão e Conta: silhueta da própria forma sob o convite compacto

**Files:**
- Modify: `src/app/(app)/estatisticas/jogador/[id]/page.tsx:738, 774, 791`, `estatisticas/jogo/[id]/page.tsx:330, 363`, `estatisticas/time/[id]/page.tsx:407`, `gestao/page.tsx:330`, `conta/blocos.tsx:458`, `conta/page.tsx` (bloco "Grátis")
- Test: `src/app/__tests__/telas-04-estatisticas.test.ts`, `telas-05-gestao.test.ts`, `telas-05-conta.test.ts` (no arnês, com `acessoDeTeste('GRATIS')` num `describe` próprio)

Mapa forma → seção: jogador "Apitos da estratégia" `cards`, "Jogo a jogo" `tabela`, "Números completos" `numeros`; jogo "Box score" `tabela`, "Confrontos anteriores" `tabela`; time "Box score por jogo" `tabela`; gestão "Registrar entradas" `formulario`; conta "Os alertas de apito" `formulario`.

- [ ] **Step 1: Testes que falham** (um por tela, no `describe('grátis')`):

```ts
it('as seções pagas do jogador mostram título, silhueta da forma e o convite compacto — e nada do dado', async () => {
  const html = await renderizarJogador(id)
  expect((html.match(/_silhueta_/g) ?? []).length).toBe(3)
  expect(html).toContain('O jogo a jogo começa no')
  expect(html).not.toContain('<table')     // a tabela real não entra
})
```

- [ ] **Step 2: Aplicar** — em cada ponto, `<ConviteDoPlano …/>` vira `<SilhuetaPaga forma="…"><ConviteDoPlano …/></SilhuetaPaga>`. Em `conta/page.tsx`, o botão do bloco "Grátis" passa a `background: componente.ctaFundo, color: componente.ctaTexto, minHeight: componente.ctaAltura`.

- [ ] **Step 3: Bateria da fase e captura**

Run: `npm run tokens && npm run typecheck && npm run lint && npm run boundaries && npm test && CAPTURA_DIR=.superpowers/capturas scripts/captura-telas.sh 2200 telas-`
Expected: verde; comparar com o artboard "Paywall".

---

# Fase 6 · Fechamento — sem gate

### Task 6.1: Grep de fechamento, spec, docs, capturas finais

- [ ] **Step 1: Grep de fechamento** (spec §11)

```bash
grep -rnE "#FF7A1A|#FFB25E|fonte-anton|fonte-barlow|Barlow|Anton\b" src --include='*.ts' --include='*.tsx' --include='*.css' | grep -vE "__tests__|^\s*//|^\s*\*"
grep -rnE "fontSize: ?'?(9|10|11)(px)?'?[,}]|font-size: ?(9|10|11)px" src/design-system/componentes/{CardEntrada,Barrinhas,CabecalhoJogo}.tsx src/components/navegacao src/components/preferencias src/components/lateral
```

Expected: vazio nos dois.

- [ ] **Step 2: Bateria completa** — `npm run tokens && npm run typecheck && npm run lint && npm run boundaries && npm test && npm run demo:conferir && npm run build`. Expected: tudo verde.

- [ ] **Step 3: Capturas finais** — `CAPTURA_DIR=.superpowers/capturas-05 scripts/captura-telas.sh 2200 telas-` nas quatro larguras, zero vazamentos. Guardar ao lado do baseline para a conversa com o parceiro.

- [ ] **Step 4: Documentos** — na spec, trocar o `Status` por "implementada em <data>; login e logo aguardando o cliente"; em `docs/04-design-system.md`, à seção "Identidade 05", acrescentar três parágrafos: moldura (três regiões, 1024/1280, lateral só nas telas de aba), Lista (chips com menu, seções colapsáveis, estrela) e paywall (silhuetas sem dado, faixa e compacto).

### Task 6.2: O commit único

- [ ] **Step 1:** `git status` — conferir que `.superpowers/` está fora e que só o esperado entra.
- [ ] **Step 2:** commit, sem push:

```bash
git add -A
git commit -m "Identidade 05: a NIP na identidade do Manual da Marca, com a moldura do StatsHub

Tokens do manual (azul só preenchimento, vermelho cheio no selo e claro na tinta,
Bebas Neue + Montserrat), moldura de três regiões (barra do topo a 1024, lateral a
1280), Lista Secreta na anatomia do Player Trends, lateral com última noite,
classificação e a doca do assistente, paywall com silhuetas sem dado.

Spec: docs/superpowers/specs/2026-09-18-identidade-05-manual-da-marca-design.md
Fora: login e logo (aguardam o cliente), /assinar e as demais telas (fatias próprias).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Riscos e o que fazer se acontecerem

- **R1 — `Bebas_Neue` não existe em `next/font/google` com esse nome.** `grep -o '"Bebas Neue"' node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`; o export é `Bebas_Neue`. Se faltar, `next/font/local` com o TTF em `public/fontes/` (licença OFL) e a mesma variável.
- **R2 — `unstable_cache` fora do runtime do Next (vitest).** Os testes mocam `next/cache` (Task 4.4). Se alguma tela não mocada quebrar com "workStore", acrescentar o mock.
- **R3 — `<summary>` com `display: flex` esconde o marcador nativo no Safari.** O `::-webkit-details-marker { display: none }` da Task 3.1 cobre; o chevron próprio é o indicador.
- **R4 — O teste "azul nunca é tinta" acusa um `border` que é fundo.** A regra da Task 1.4: borda da MESMA cor do fundo preenchido é permitida; escrever `border: 1.5px solid ${semantico.acento}` só junto de `background: semantico.acento` e, se o regex acusar, trocar por `boxShadow: 0 0 0 1.5px …` ou usar `outline` transparente. Não afrouxar o teste.
- **R5 — Duas barras no HTML dobram `aria-current`.** Esperado (Task 2.2); leitores de tela recebem só a visível porque a outra está `display: none`.
- **R6 — A lateral custa duas leituras no primeiro acesso de cada hora por processo.** Aceito pela spec (§7); `revalidate: 3600` + a tag no cron.
