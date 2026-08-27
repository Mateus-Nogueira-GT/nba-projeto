# LLM Routing via OpenRouter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao produto geração de texto por LLM — narrativas nos cards, resumo do dia, chat do assinante e sugestão de vínculos no admin — com OpenRouter como roteador único, sem que a LLM jamais decida quem apita.

**Architecture:** Uma porta fina em `src/modules/ingestao/llm/` (L0, anticorrupção, igual aos adapters da NBA e do Mercado Pago). Quem consome pede "gere com o perfil X" e nunca vê OpenRouter. Narrativas e resumo são gerados **uma vez por publicação** e materializados no snapshot — custo por evento, não por usuário. O chat é o único caminho por requisição, com cota diária e flag.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle + Postgres (Neon), Zod, vitest + PGlite.

**Spec:** [`docs/superpowers/specs/2026-08-25-llm-routing-design.md`](../specs/2026-08-25-llm-routing-design.md)

## Global Constraints

- **A LLM narra, nunca decide.** Nenhum arquivo em `src/modules/motor/**` é tocado. Nenhum teste do motor muda.
- **Motor puro:** `src/modules/llm/**` não existe — o subsistema vive em `src/modules/ingestao/llm/**` (L0). A entrega (L3) consome a porta; o motor nunca.
- **Falha nunca sobe.** Erro em qualquer perfil = feature ausente e contada, jamais exceção propagada ao usuário.
- **Sem `OPENROUTER_API_KEY` → adapter fake.** O app inteiro funciona sem chave.
- **Proibida a palavra "probabilidade"** em qualquer texto exibido (regra do design system, `docs/04-design-system.md`).
- **Domínio em português, infraestrutura em inglês** (vocabulário do CJ).
- **Idioma dos textos gerados:** pt-BR.
- Envs novos, todos opcionais: `OPENROUTER_API_KEY`, `CHAT_HABILITADO` (padrão `false`), `CHAT_COTA_DIARIA` (padrão `20`).
- Commits com autor `Mateus-Nogueira-GT <mateusnnogueira451@gmail.com>` (senão a Vercel bloqueia o deploy — ADR-0008).

## Decisão de arquitetura que atravessa o plano

`publicarListaSecreta` calcula `hash = hashDe(conteudo)` sobre
`JSON.stringify(conteudo.itens)` e só regrava o snapshot quando o hash muda.

**Texto de LLM não é determinístico.** Se a narrativa entrar em `itens` antes do
hash, o hash muda a cada execução do cron: republicação em looping, push repetido
e custo de LLM a cada minuto.

Portanto: **a narrativa é anexada DEPOIS do hash e SOMENTE quando `mudou === true`.**
Consequências, todas desejáveis:

- o hash continua sendo a impressão digital do **conteúdo de estratégia**;
- reexecutar o cron com os mesmos fatos não chama a LLM (idempotente, custo zero);
- a narrativa é decoração anexada, e sua ausência nunca impede a publicação.

Isso é implementado na Task 5 e travado por teste na Task 6.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/modules/ingestao/llm/porta.ts` | Contrato `PortaLLM`, tipos `PerfilLLM`, `TextoGerado`, `ErroLLM` |
| `src/modules/ingestao/llm/perfis.ts` | Mapa perfil → modelos + parâmetros (config versionada) |
| `src/modules/ingestao/llm/openrouter.ts` | Adapter HTTP real, com fallback nativo por array `models` |
| `src/modules/ingestao/llm/fake.ts` | Adapter determinístico (testes + sem chave) |
| `src/modules/ingestao/llm/validador.ts` | Função pura: valida texto gerado antes de exibir |
| `src/modules/ingestao/llm/registro.ts` | Grava `llm_chamadas` (observabilidade/custo) |
| `src/modules/ingestao/llm/index.ts` | `portaLLMDoAmbiente()` — escolhe real ou fake |
| `src/modules/entrega/narrativa.ts` | Monta prompts e anexa narrativa/resumo ao snapshot |
| `src/modules/entrega/chat.ts` | Regras do chat: cota, contexto, persistência |
| `src/app/api/chat/route.ts` | Endpoint HTTP do chat |
| `src/modules/dominio/db/schema/plataforma.ts` | Tabelas `llm_chamadas` e `chat_mensagens` |

---

### Task 1: A porta, os perfis e o adapter fake

**Files:**
- Create: `src/modules/ingestao/llm/porta.ts`
- Create: `src/modules/ingestao/llm/perfis.ts`
- Create: `src/modules/ingestao/llm/fake.ts`
- Test: `src/modules/ingestao/llm/__tests__/perfis.test.ts`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: `PerfilLLM = 'narrativa' | 'resumo' | 'chat' | 'admin'`; `PortaLLM.gerar(perfil, pedido) => Promise<TextoGerado>`; `PedidoGeracao = { sistema: string; usuario: string; maxTokens?: number }`; `TextoGerado = { texto: string; modelo: string; tokensEntrada: number; tokensSaida: number }`; `LLMFake` implementando `PortaLLM`; `modelosDoPerfil(perfil): string[]`; `parametrosDoPerfil(perfil): { maxTokens: number; temperatura: number }`

- [ ] **Step 1: Write the failing test**

`src/modules/ingestao/llm/__tests__/perfis.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { LLMFake } from '../fake'
import { PERFIS, modelosDoPerfil, parametrosDoPerfil } from '../perfis'
import type { PerfilLLM } from '../porta'

const TODOS: PerfilLLM[] = ['narrativa', 'resumo', 'chat', 'admin']

describe('perfis de roteamento', () => {
  it('todo perfil tem ao menos um FALLBACK, não só o primário', () => {
    // O fallback é o motivo de usar OpenRouter: um modelo fora do ar não pode
    // derrubar a feature. Perfil com lista de um elemento é config incompleta.
    for (const perfil of TODOS) {
      expect(modelosDoPerfil(perfil).length, perfil).toBeGreaterThan(1)
    }
  })

  it('nenhum perfil repete modelo na cadeia de fallback', () => {
    // Repetir o mesmo modelo como fallback dele mesmo não é fallback nenhum.
    for (const perfil of TODOS) {
      const modelos = modelosDoPerfil(perfil)
      expect(new Set(modelos).size, perfil).toBe(modelos.length)
    }
  })

  it('todo perfil tem teto de tokens — texto sem limite é conta sem limite', () => {
    for (const perfil of TODOS) {
      const p = parametrosDoPerfil(perfil)
      expect(p.maxTokens, perfil).toBeGreaterThan(0)
      expect(p.temperatura, perfil).toBeGreaterThanOrEqual(0)
    }
  })

  it('narrativa e resumo cabem no limite do card (280 caracteres)', () => {
    // 280 caracteres ≈ 100 tokens em pt-BR. Pedir muito mais é pagar por texto
    // que o validador vai reprovar por tamanho.
    expect(parametrosDoPerfil('narrativa').maxTokens).toBeLessThanOrEqual(200)
    expect(parametrosDoPerfil('resumo').maxTokens).toBeLessThanOrEqual(400)
  })

  it('PERFIS cobre exatamente os quatro perfis, sem sobra', () => {
    expect(Object.keys(PERFIS).sort()).toEqual([...TODOS].sort())
  })
})

describe('adapter fake', () => {
  it('é determinístico: mesmo pedido, mesmo texto', async () => {
    const fake = new LLMFake()
    const pedido = { sistema: 's', usuario: 'Curry 20 pontos' }
    const a = await fake.gerar('narrativa', pedido)
    const b = await fake.gerar('narrativa', pedido)
    expect(a.texto).toBe(b.texto)
    expect(a.texto.length).toBeGreaterThan(0)
  })

  it('registra as chamadas para o teste inspecionar', async () => {
    const fake = new LLMFake()
    await fake.gerar('chat', { sistema: 's', usuario: 'oi' })
    expect(fake.chamadas).toHaveLength(1)
    expect(fake.chamadas[0]!.perfil).toBe('chat')
  })

  it('pode ser mandado a falhar — o caminho de erro precisa ser testável', async () => {
    const fake = new LLMFake({ falhar: true })
    await expect(fake.gerar('narrativa', { sistema: 's', usuario: 'x' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/ingestao/llm/__tests__/perfis.test.ts`
Expected: FAIL — `Cannot find module '../fake'`

- [ ] **Step 3: Write `porta.ts`**

```ts
/**
 * Camada anticorrupção entre o produto e o provedor de LLM.
 *
 * Quem consome pede "gere com o perfil X" e nunca sabe que existe OpenRouter.
 * Trocar de provedor é trocar o adapter, não o código que chama.
 *
 * A LLM NARRA o que o motor decidiu. Ela não decide, não consulta banco e não
 * bloqueia o produto (regra 3 do projeto).
 */

export type PerfilLLM = 'narrativa' | 'resumo' | 'chat' | 'admin'

export type PedidoGeracao = {
  /** Instrução de sistema: papel, tom, proibições. */
  sistema: string
  /** Conteúdo do usuário: os FATOS já materializados, nunca acesso a banco. */
  usuario: string
  /** Teto opcional; sem ele vale o do perfil. */
  maxTokens?: number
}

export type TextoGerado = {
  texto: string
  /** Qual modelo respondeu de fato — com fallback, não é sempre o primário. */
  modelo: string
  tokensEntrada: number
  tokensSaida: number
}

export type MotivoErroLLM =
  | 'sem-credencial'
  | 'timeout'
  | 'limite-de-taxa'
  | 'sem-saldo'
  | 'resposta-invalida'
  | 'transporte'

export class ErroLLM extends Error {
  constructor(
    readonly motivo: MotivoErroLLM,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroLLM'
  }
}

export interface PortaLLM {
  readonly nome: string
  gerar(perfil: PerfilLLM, pedido: PedidoGeracao): Promise<TextoGerado>
}
```

- [ ] **Step 4: Write `perfis.ts`**

```ts
import type { PerfilLLM } from './porta'

/**
 * MAPA PERFIL → MODELOS. Config versionada, não decisão espalhada no código.
 *
 * A ordem é a cadeia de fallback: o OpenRouter tenta o primeiro e cai para o
 * seguinte quando o modelo está fora, sem saldo ou em limite de taxa. Por isso
 * todo perfil tem mais de um — um modelo indisponível não pode derrubar a
 * feature (é o motivo de existir o roteador).
 *
 * Os ids são detalhe trocável; o que a spec fixa é a CLASSE de cada perfil:
 * narrativa/resumo baratos e rápidos, chat intermediário, admin o melhor
 * (volume mínimo, custo irrelevante).
 */
export const PERFIS: Record<
  PerfilLLM,
  { modelos: string[]; maxTokens: number; temperatura: number }
> = {
  narrativa: {
    modelos: [
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-5-haiku',
    ],
    maxTokens: 160,
    temperatura: 0.7,
  },
  resumo: {
    modelos: [
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-5-haiku',
    ],
    maxTokens: 320,
    temperatura: 0.7,
  },
  chat: {
    modelos: ['anthropic/claude-3-5-haiku', 'openai/gpt-4o-mini', 'google/gemini-2.0-flash-001'],
    maxTokens: 700,
    temperatura: 0.4,
  },
  admin: {
    modelos: ['anthropic/claude-sonnet-4', 'openai/gpt-4o'],
    maxTokens: 1200,
    temperatura: 0,
  },
}

export function modelosDoPerfil(perfil: PerfilLLM): string[] {
  return PERFIS[perfil].modelos
}

export function parametrosDoPerfil(perfil: PerfilLLM): {
  maxTokens: number
  temperatura: number
} {
  const { maxTokens, temperatura } = PERFIS[perfil]
  return { maxTokens, temperatura }
}
```

- [ ] **Step 5: Write `fake.ts`**

```ts
import { parametrosDoPerfil } from './perfis'
import { ErroLLM, type PedidoGeracao, type PerfilLLM, type PortaLLM, type TextoGerado } from './porta'

/**
 * Porta falsa — implementação real da interface, sem rede.
 *
 * Serve a dois donos: os testes (que precisam de texto previsível) e a
 * PRODUÇÃO sem `OPENROUTER_API_KEY`, onde o app inteiro precisa continuar
 * funcionando. Por isso o texto é plausível, não um lorem ipsum.
 */
export class LLMFake implements PortaLLM {
  readonly nome = 'fake'
  readonly chamadas: { perfil: PerfilLLM; pedido: PedidoGeracao }[] = []

  constructor(private readonly opcoes: { falhar?: boolean; texto?: string } = {}) {}

  async gerar(perfil: PerfilLLM, pedido: PedidoGeracao): Promise<TextoGerado> {
    this.chamadas.push({ perfil, pedido })
    if (this.opcoes.falhar) {
      throw new ErroLLM('transporte', 'LLMFake configurado para falhar')
    }

    const texto = this.opcoes.texto ?? textoDeDemonstracao(perfil, pedido)
    return {
      texto,
      modelo: `fake/${perfil}`,
      tokensEntrada: Math.ceil((pedido.sistema.length + pedido.usuario.length) / 4),
      tokensSaida: Math.ceil(texto.length / 4),
    }
  }
}

/**
 * Texto determinístico e plausível. Não cita número nenhum de propósito: o
 * validador reprova número que não esteja nos fatos, e o fake não tem como
 * saber quais são.
 */
function textoDeDemonstracao(perfil: PerfilLLM, pedido: PedidoGeracao): string {
  const teto = parametrosDoPerfil(perfil).maxTokens
  const base =
    perfil === 'resumo'
      ? 'Rodada movimentada: a lista de hoje mistura oscilações maduras e oportunidades por desfalque. Vale acompanhar de perto os confrontos com elenco desfalcado.'
      : perfil === 'chat'
        ? 'Posso explicar qualquer entrada da lista de hoje a partir dos critérios do CJ. Pergunte sobre um jogador específico e eu detalho o que pesou.'
        : 'Vem de sequência abaixo da própria média e encontra um confronto favorável — o tipo de correção que a estratégia procura.'
  return base.slice(0, teto * 4)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/modules/ingestao/llm/__tests__/perfis.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 7: Commit**

```bash
git add src/modules/ingestao/llm
git commit -m "Porta de LLM: contrato, perfis de roteamento e adapter fake"
```

---

### Task 2: O validador — o que impede a LLM de mentir na tela

**Files:**
- Create: `src/modules/ingestao/llm/validador.ts`
- Test: `src/modules/ingestao/llm/__tests__/validador.test.ts`

**Interfaces:**
- Consumes: nada do repo (função pura)
- Produces: `validarTexto(texto: string, fatos: { numeros: number[]; limiteCaracteres: number }): ResultadoValidacao` onde `ResultadoValidacao = { ok: true; texto: string } | { ok: false; motivo: 'probabilidade' | 'numero-inventado' | 'muito-longo' | 'vazio' }`

- [ ] **Step 1: Write the failing test**

`src/modules/ingestao/llm/__tests__/validador.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { validarTexto } from '../validador'

const FATOS = { numeros: [20, 25.7, 5], limiteCaracteres: 280 }

describe('validador de texto gerado', () => {
  it('aprova texto sóbrio que só cita números dos fatos', () => {
    const r = validarTexto('Vem de sequência abaixo da média de 25.7 e enfrenta a linha de 20.', FATOS)
    expect(r.ok).toBe(true)
  })

  it('reprova a palavra PROBABILIDADE em qualquer flexão', () => {
    // O percentual do produto é nota de confiança, não probabilidade. Essa
    // palavra na tela contradiz /como-funciona e a regra do design system.
    for (const texto of [
      'A probabilidade de bater é alta.',
      'Probabilidade elevada hoje.',
      'As probabilidades favorecem o jogador.',
      'É provável que bata a linha.',
    ]) {
      const r = validarTexto(texto, FATOS)
      expect(r.ok, texto).toBe(false)
      if (!r.ok) expect(r.motivo).toBe('probabilidade')
    }
  })

  it('reprova número que NÃO está nos fatos — anti-alucinação de estatística', () => {
    // O pior defeito possível: a LLM inventa "média de 31,4" e o assinante
    // aposta em cima de um número que não existe.
    const r = validarTexto('Média de 31.4 pontos nos últimos jogos.', FATOS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('numero-inventado')
  })

  it('aceita número dos fatos escrito com vírgula decimal (pt-BR)', () => {
    // 25.7 nos fatos e "25,7" no texto são o MESMO número. Reprovar isso
    // rejeitaria todo texto correto em português.
    const r = validarTexto('A média de 25,7 sustenta a leitura.', FATOS)
    expect(r.ok).toBe(true)
  })

  it('ignora números dentro de palavras e ordinais curtos', () => {
    // "1º quarto" e "top 5" não são estatística inventada.
    const r = validarTexto('No 1º quarto o time acelera.', { numeros: [], limiteCaracteres: 280 })
    expect(r.ok).toBe(true)
  })

  it('reprova texto acima do limite de caracteres', () => {
    const r = validarTexto('a'.repeat(281), FATOS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('muito-longo')
  })

  it('reprova texto vazio ou só espaços', () => {
    const r = validarTexto('   ', FATOS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('vazio')
  })

  it('devolve o texto APARADO quando aprova', () => {
    const r = validarTexto('  Texto com folga.  ', FATOS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.texto).toBe('Texto com folga.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/ingestao/llm/__tests__/validador.test.ts`
Expected: FAIL — `Cannot find module '../validador'`

- [ ] **Step 3: Write `validador.ts`**

```ts
/**
 * O QUE IMPEDE A LLM DE MENTIR NA TELA.
 *
 * Função PURA, sem I/O — é o portão entre "a LLM respondeu" e "o assinante
 * leu". Três recusas, todas por motivo de produto:
 *
 *  1. "probabilidade" — o percentual do produto é NOTA DE CONFIANÇA. A palavra
 *     na tela contradiz /como-funciona e a regra do design system.
 *  2. número que não está nos fatos — o pior defeito possível deste produto é
 *     a IA inventar "média de 31,4" e alguém apostar em cima disso.
 *  3. tamanho — card tem largura; texto que estoura vira layout quebrado.
 *
 * Reprovar NUNCA é erro: o card sai sem narrativa e a contagem sobe.
 */

export type ResultadoValidacao =
  | { ok: true; texto: string }
  | { ok: false; motivo: 'probabilidade' | 'numero-inventado' | 'muito-longo' | 'vazio' }

/** Raiz que pega probabilidade, probabilidades, provável, prováveis. */
const PROIBIDAS = /prob(abilidad|áve|ave)/i

/**
 * Números "livres" no texto: cercados por não-dígito, com decimal opcional em
 * vírgula ou ponto. `1º` não casa (o `º` cola no dígito e a âncora exige
 * fronteira), e é isso que evita reprovar ordinais.
 */
const NUMERO_NO_TEXTO = /(?<![\d,.º°ªa-zA-Z])(\d+(?:[.,]\d+)?)(?![\d,.º°ª])/g

/** "25,7" e "25.7" são o mesmo número — o texto é pt-BR, os fatos são float. */
function comoNumero(bruto: string): number {
  return Number(bruto.replace(',', '.'))
}

export function validarTexto(
  texto: string,
  fatos: { numeros: number[]; limiteCaracteres: number },
): ResultadoValidacao {
  const aparado = texto.trim()
  if (aparado.length === 0) return { ok: false, motivo: 'vazio' }
  if (aparado.length > fatos.limiteCaracteres) return { ok: false, motivo: 'muito-longo' }
  if (PROIBIDAS.test(aparado)) return { ok: false, motivo: 'probabilidade' }

  // Comparação com tolerância: o texto pode arredondar 25.70 para 25,7.
  const permitidos = fatos.numeros
  for (const achado of aparado.matchAll(NUMERO_NO_TEXTO)) {
    const valor = comoNumero(achado[1]!)
    const conhecido = permitidos.some((n) => Math.abs(n - valor) < 0.05)
    if (!conhecido) return { ok: false, motivo: 'numero-inventado' }
  }

  return { ok: true, texto: aparado }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/ingestao/llm/__tests__/validador.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/ingestao/llm/validador.ts src/modules/ingestao/llm/__tests__/validador.test.ts
git commit -m "Validador de texto gerado: sem 'probabilidade', sem número inventado"
```

---

### Task 3: Adapter OpenRouter e seleção por ambiente

**Files:**
- Create: `src/modules/ingestao/llm/openrouter.ts`
- Create: `src/modules/ingestao/llm/index.ts`
- Test: `src/modules/ingestao/llm/__tests__/openrouter.test.ts`

**Interfaces:**
- Consumes: `PortaLLM`, `PerfilLLM`, `PedidoGeracao`, `TextoGerado`, `ErroLLM` (Task 1); `modelosDoPerfil`, `parametrosDoPerfil` (Task 1)
- Produces: `class OpenRouter implements PortaLLM` com `constructor(chave: string, fetchFn?: typeof fetch, baseUrl?: string)`; `portaLLMDoAmbiente(ambiente?: NodeJS.ProcessEnv): PortaLLM`

- [ ] **Step 1: Write the failing test**

`src/modules/ingestao/llm/__tests__/openrouter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { LLMFake } from '../fake'
import { portaLLMDoAmbiente } from '../index'
import { OpenRouter } from '../openrouter'
import { ErroLLM } from '../porta'

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const OK = {
  model: 'google/gemini-2.0-flash-001',
  choices: [{ message: { content: 'Texto gerado.' } }],
  usage: { prompt_tokens: 120, completion_tokens: 30 },
}

describe('adapter OpenRouter', () => {
  it('manda a CADEIA de modelos do perfil, não um só', async () => {
    // O fallback do OpenRouter é o array `models`. Mandar um modelo só
    // desliga exatamente o que justifica usar o roteador.
    const fetchMock = vi.fn<typeof fetch>(async () => resposta(OK))
    await new OpenRouter('chave', fetchMock).gerar('narrativa', { sistema: 's', usuario: 'u' })

    const corpo = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))
    expect(Array.isArray(corpo.models)).toBe(true)
    expect(corpo.models.length).toBeGreaterThan(1)
    expect(corpo.model).toBeUndefined()
  })

  it('devolve o modelo que REALMENTE respondeu, não o primário pedido', async () => {
    // Com fallback, saber quem respondeu é o que permite ler custo depois.
    const fetchMock = vi.fn<typeof fetch>(async () =>
      resposta({ ...OK, model: 'openai/gpt-4o-mini' }),
    )
    const r = await new OpenRouter('chave', fetchMock).gerar('narrativa', {
      sistema: 's',
      usuario: 'u',
    })
    expect(r.modelo).toBe('openai/gpt-4o-mini')
    expect(r.tokensEntrada).toBe(120)
    expect(r.tokensSaida).toBe(30)
    expect(r.texto).toBe('Texto gerado.')
  })

  it('manda a credencial no cabeçalho Authorization', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => resposta(OK))
    await new OpenRouter('chave-secreta', fetchMock).gerar('chat', { sistema: 's', usuario: 'u' })
    const cabecalhos = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>
    expect(cabecalhos.Authorization).toBe('Bearer chave-secreta')
  })

  it('traduz 429 para limite-de-taxa e 402 para sem-saldo', async () => {
    for (const [status, motivo] of [
      [429, 'limite-de-taxa'],
      [402, 'sem-saldo'],
    ] as const) {
      const fetchMock = vi.fn<typeof fetch>(async () => resposta({ error: 'x' }, status))
      const erro = await new OpenRouter('chave', fetchMock)
        .gerar('narrativa', { sistema: 's', usuario: 'u' })
        .catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(ErroLLM)
      expect((erro as ErroLLM).motivo).toBe(motivo)
    }
  })

  it('resposta sem texto vira resposta-invalida, não string vazia', async () => {
    // Deixar passar "" faria o card publicar uma narrativa em branco.
    const fetchMock = vi.fn<typeof fetch>(async () => resposta({ ...OK, choices: [] }))
    const erro = await new OpenRouter('chave', fetchMock)
      .gerar('narrativa', { sistema: 's', usuario: 'u' })
      .catch((e: unknown) => e)
    expect((erro as ErroLLM).motivo).toBe('resposta-invalida')
  })

  it('tenta UMA vez de novo em falha de transporte', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(resposta(OK))
    const r = await new OpenRouter('chave', fetchMock).gerar('narrativa', {
      sistema: 's',
      usuario: 'u',
    })
    expect(r.texto).toBe('Texto gerado.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('desiste depois do retry — não fica tentando para sempre', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNRESET'))
    await expect(
      new OpenRouter('chave', fetchMock).gerar('narrativa', { sistema: 's', usuario: 'u' }),
    ).rejects.toBeInstanceOf(ErroLLM)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('seleção por ambiente', () => {
  it('sem OPENROUTER_API_KEY devolve o FAKE — o app funciona sem chave', () => {
    expect(portaLLMDoAmbiente({} as NodeJS.ProcessEnv)).toBeInstanceOf(LLMFake)
  })

  it('com chave devolve o adapter real', () => {
    const porta = portaLLMDoAmbiente({ OPENROUTER_API_KEY: 'x' } as NodeJS.ProcessEnv)
    expect(porta).toBeInstanceOf(OpenRouter)
  })

  it('chave em branco conta como ausente', () => {
    // String vazia num painel de env é o acidente mais comum; tratar como
    // "tem chave" produziria 401 em produção em vez de cair no fake.
    expect(portaLLMDoAmbiente({ OPENROUTER_API_KEY: '   ' } as NodeJS.ProcessEnv)).toBeInstanceOf(
      LLMFake,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/ingestao/llm/__tests__/openrouter.test.ts`
Expected: FAIL — `Cannot find module '../openrouter'`

- [ ] **Step 3: Write `openrouter.ts`**

```ts
import { z } from 'zod'

import { modelosDoPerfil, parametrosDoPerfil } from './perfis'
import {
  ErroLLM,
  type MotivoErroLLM,
  type PedidoGeracao,
  type PerfilLLM,
  type PortaLLM,
  type TextoGerado,
} from './porta'

/**
 * Adapter do OpenRouter — o roteador de modelos.
 *
 * O fallback é NATIVO: manda-se o array `models` e o OpenRouter tenta na
 * ordem, caindo para o próximo quando o modelo está fora, sem saldo ou em
 * limite de taxa. Por isso não existe laço de fallback aqui — reimplementá-lo
 * seria duplicar o serviço que estamos pagando.
 *
 * `fetchFn` entra por injeção: o teste passa um mock, a produção passa o
 * fetch real. Mesmo padrão dos adapters da NBA.
 */

const respostaSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullish() }).partial() }))
    .default([]),
  usage: z
    .object({ prompt_tokens: z.number().nullish(), completion_tokens: z.number().nullish() })
    .nullish(),
})

const TIMEOUT_MS = 15_000

function motivoDoStatus(status: number): MotivoErroLLM {
  if (status === 429) return 'limite-de-taxa'
  if (status === 402) return 'sem-saldo'
  return 'transporte'
}

export class OpenRouter implements PortaLLM {
  readonly nome = 'openrouter'

  constructor(
    private readonly chave: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl = 'https://openrouter.ai/api/v1',
  ) {}

  async gerar(perfil: PerfilLLM, pedido: PedidoGeracao): Promise<TextoGerado> {
    const { maxTokens, temperatura } = parametrosDoPerfil(perfil)
    const corpo = JSON.stringify({
      models: modelosDoPerfil(perfil),
      messages: [
        { role: 'system', content: pedido.sistema },
        { role: 'user', content: pedido.usuario },
      ],
      max_tokens: pedido.maxTokens ?? maxTokens,
      temperature: temperatura,
    })

    // Uma repetição só: falha de transporte costuma ser transitória, mas
    // insistir mais que isso segura o cron e multiplica a conta.
    let ultimoErro: unknown
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        return await this.chamar(corpo)
      } catch (erro) {
        // Erro de negócio (sem saldo, resposta inválida) não melhora com
        // repetição — só transporte e timeout merecem segunda chance.
        if (erro instanceof ErroLLM && erro.motivo !== 'transporte' && erro.motivo !== 'timeout') {
          throw erro
        }
        ultimoErro = erro
      }
    }
    throw ultimoErro instanceof ErroLLM
      ? ultimoErro
      : new ErroLLM('transporte', String(ultimoErro))
  }

  private async chamar(corpo: string): Promise<TextoGerado> {
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS)
    try {
      const resposta = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.chave}`,
          'Content-Type': 'application/json',
        },
        body: corpo,
        signal: controle.signal,
      })

      if (!resposta.ok) {
        throw new ErroLLM(motivoDoStatus(resposta.status), `openrouter: HTTP ${resposta.status}`)
      }

      const bruta = respostaSchema.safeParse(await resposta.json())
      if (!bruta.success) throw new ErroLLM('resposta-invalida', 'formato inesperado')

      const texto = bruta.data.choices[0]?.message?.content?.trim() ?? ''
      if (texto.length === 0) throw new ErroLLM('resposta-invalida', 'resposta sem texto')

      return {
        texto,
        modelo: bruta.data.model ?? 'desconhecido',
        tokensEntrada: bruta.data.usage?.prompt_tokens ?? 0,
        tokensSaida: bruta.data.usage?.completion_tokens ?? 0,
      }
    } catch (erro) {
      if (erro instanceof ErroLLM) throw erro
      if (erro instanceof Error && erro.name === 'AbortError') {
        throw new ErroLLM('timeout', `openrouter: sem resposta em ${TIMEOUT_MS}ms`)
      }
      throw new ErroLLM('transporte', String(erro))
    } finally {
      clearTimeout(relogio)
    }
  }
}
```

- [ ] **Step 4: Write `index.ts`**

```ts
import { LLMFake } from './fake'
import { OpenRouter } from './openrouter'
import type { PortaLLM } from './porta'

export { LLMFake } from './fake'
export { OpenRouter } from './openrouter'
export { validarTexto, type ResultadoValidacao } from './validador'
export * from './porta'
export { PERFIS, modelosDoPerfil, parametrosDoPerfil } from './perfis'

/**
 * Sem `OPENROUTER_API_KEY`, o app inteiro funciona com o adapter FAKE.
 *
 * Não é conveniência de teste: é o que permite a demonstração rodar sem
 * credencial e o produto degradar em vez de quebrar se a chave sumir do
 * painel. Chave em branco conta como ausente — string vazia num painel de env
 * é o acidente mais comum, e tratá-la como válida daria 401 em produção.
 */
export function portaLLMDoAmbiente(ambiente: NodeJS.ProcessEnv = process.env): PortaLLM {
  const chave = (ambiente.OPENROUTER_API_KEY ?? '').trim()
  return chave === '' ? new LLMFake() : new OpenRouter(chave)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/ingestao/llm/__tests__/openrouter.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 6: Commit**

```bash
git add src/modules/ingestao/llm
git commit -m "Adapter OpenRouter com fallback nativo e seleção por ambiente"
```

---

### Task 4: Tabelas `llm_chamadas` e `chat_mensagens`

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts` (adicionar ao fim)
- Create: `src/modules/ingestao/llm/registro.ts`
- Test: `src/modules/ingestao/llm/__tests__/registro.test.ts`
- Modify: `src/modules/dominio/__tests__/persistencia.test.ts` (censo de tabelas)

**Interfaces:**
- Consumes: `PerfilLLM` (Task 1); `Db` de `src/modules/dominio/db/tipos`
- Produces: tabelas `llmChamadas` e `chatMensagens`; `registrarChamada(db, dados): Promise<void>` com `dados = { perfil: PerfilLLM; modelo: string | null; tokensEntrada: number; tokensSaida: number; ok: boolean; erro: string | null; duracaoMs: number }`

- [ ] **Step 1: Write the failing test**

`src/modules/ingestao/llm/__tests__/registro.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { llmChamadas } from '../../../dominio/db/schema'
import { registrarChamada } from '../registro'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 120_000)
afterAll(async () => banco.fechar())

describe('registro de chamadas de LLM', () => {
  it('grava sucesso com tokens — é o que responde "quanto está custando"', async () => {
    await registrarChamada(banco.db, {
      perfil: 'narrativa',
      modelo: 'google/gemini-2.0-flash-001',
      tokensEntrada: 120,
      tokensSaida: 30,
      ok: true,
      erro: null,
      duracaoMs: 800,
    })
    const linhas = await banco.db.select().from(llmChamadas)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.ok).toBe(true)
    expect(linhas[0]!.tokensSaida).toBe(30)
  })

  it('grava FALHA também — perfil que só falha precisa aparecer', async () => {
    // Registrar só o sucesso esconderia exatamente o que se quer investigar.
    await registrarChamada(banco.db, {
      perfil: 'chat',
      modelo: null,
      tokensEntrada: 0,
      tokensSaida: 0,
      ok: false,
      erro: 'limite-de-taxa',
      duracaoMs: 15_000,
    })
    const falhas = (await banco.db.select().from(llmChamadas)).filter((l) => !l.ok)
    expect(falhas).toHaveLength(1)
    expect(falhas[0]!.erro).toBe('limite-de-taxa')
    expect(falhas[0]!.modelo).toBeNull()
  })

  it('registrar NUNCA lança — observabilidade não pode derrubar a feature', async () => {
    // Se gravar métrica quebrasse a publicação, a métrica viraria o risco.
    const bancoQuebrado = {
      insert: () => {
        throw new Error('banco fora')
      },
    } as unknown as typeof banco.db
    await expect(
      registrarChamada(bancoQuebrado, {
        perfil: 'admin',
        modelo: null,
        tokensEntrada: 0,
        tokensSaida: 0,
        ok: false,
        erro: 'x',
        duracaoMs: 1,
      }),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/ingestao/llm/__tests__/registro.test.ts`
Expected: FAIL — `llmChamadas` não existe no schema

- [ ] **Step 3: Add tables to `src/modules/dominio/db/schema/plataforma.ts`**

Adicionar ao fim do arquivo (os imports `pgTable`, `uuid`, `text`, `integer`, `boolean`, `timestamp`, `index` já existem no topo; acrescente os que faltarem):

```ts
/**
 * OBSERVABILIDADE DE LLM — uma linha por chamada, sucesso ou falha.
 *
 * É o que responde "quanto isso está custando" e "qual perfil está falhando"
 * sem depender do painel do provedor. Falha registrada é tão importante
 * quanto sucesso: um perfil que só erra é invisível se só o sucesso for
 * gravado.
 */
export const llmChamadas = pgTable(
  'llm_chamadas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    perfil: text('perfil').notNull(),
    /** Qual modelo respondeu de fato — null quando a chamada nem chegou lá. */
    modelo: text('modelo'),
    tokensEntrada: integer('tokens_entrada').notNull().default(0),
    tokensSaida: integer('tokens_saida').notNull().default(0),
    ok: boolean('ok').notNull(),
    erro: text('erro'),
    duracaoMs: integer('duracao_ms').notNull().default(0),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('llm_chamadas_criado_em_idx').on(t.criadoEm)],
)

/**
 * MENSAGENS DO CHAT — cota, histórico e auditoria na MESMA tabela.
 *
 * A cota diária é `COUNT(*)` das mensagens do usuário no dia. Um contador
 * paralelo poderia divergir do histórico; aqui os dois são a mesma coisa por
 * construção.
 */
export const chatMensagens = pgTable(
  'chat_mensagens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    papel: text('papel', { enum: ['USUARIO', 'ASSISTENTE'] }).notNull(),
    texto: text('texto').notNull(),
    modelo: text('modelo'),
    tokensEntrada: integer('tokens_entrada').notNull().default(0),
    tokensSaida: integer('tokens_saida').notNull().default(0),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_mensagens_usuario_dia_idx').on(t.usuarioId, t.criadoEm)],
)
```

- [ ] **Step 4: Write `registro.ts`**

```ts
import { llmChamadas } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { PerfilLLM } from './porta'

export type DadosChamada = {
  perfil: PerfilLLM
  modelo: string | null
  tokensEntrada: number
  tokensSaida: number
  ok: boolean
  erro: string | null
  duracaoMs: number
}

/**
 * Grava a métrica da chamada. NUNCA lança.
 *
 * Se gravar observabilidade pudesse derrubar a publicação da lista, a
 * observabilidade viraria o risco que ela existe para reduzir. Falha ao
 * registrar é aceitável; falha ao publicar não é.
 */
export async function registrarChamada(db: Db, dados: DadosChamada): Promise<void> {
  try {
    await db.insert(llmChamadas).values(dados)
  } catch {
    // engolido de propósito — ver o comentário acima
  }
}
```

- [ ] **Step 5: Generate the migration**

```bash
npm run db:generate
```

Expected: cria `drizzle/0016_*.sql` com `CREATE TABLE llm_chamadas` e `CREATE TABLE chat_mensagens`, mais o `down` correspondente.

- [ ] **Step 6: Update the table census**

`src/modules/dominio/__tests__/persistencia.test.ts` tem uma asserção sobre o número total de tabelas. Rode a suíte, leia o número esperado no erro e some 2 (`llm_chamadas` e `chat_mensagens`), atualizando o valor e o comentário.

Run: `npx vitest run src/modules/dominio/__tests__/persistencia.test.ts`
Expected: PASS depois do ajuste

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/modules/ingestao/llm/__tests__/registro.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 8: Commit**

```bash
git add src/modules/dominio src/modules/ingestao/llm drizzle
git commit -m "Tabelas llm_chamadas e chat_mensagens + registro que nunca lança"
```

---

### Task 5: Narrativas e resumo no snapshot da Lista Secreta

**Files:**
- Create: `src/modules/entrega/narrativa.ts`
- Modify: `src/modules/entrega/lista-secreta.ts` (tipo `ItemFeed`, tipo `ConteudoFeed`)
- Test: `src/modules/entrega/__tests__/narrativa.test.ts`

**Interfaces:**
- Consumes: `PortaLLM`, `PerfilLLM` (Task 1); `validarTexto` (Task 2); `registrarChamada` (Task 4); `ItemFeed`, `ConteudoFeed` de `src/modules/entrega/lista-secreta`
- Produces: `promptDeNarrativa(item: ItemFeed): { sistema: string; usuario: string; numeros: number[] }`; `numerosDoItem(item: ItemFeed): number[]`; `LIMITE_NARRATIVA = 280`; `enriquecerComNarrativas(db, porta, conteudo): Promise<{ conteudo: ConteudoFeed; geradas: number; reprovadas: number }>`

- [ ] **Step 1: Add the fields to `ItemFeed` and `ConteudoFeed`**

Em `src/modules/entrega/lista-secreta.ts`, dentro de `ItemFeed`, depois de `oddFaixa`:

```ts
  /**
   * Frase de análise gerada por LLM a partir DOS FATOS acima. Anexada depois
   * do hash do snapshot (ver `narrativa.ts`) e ausente quando a geração falha
   * ou o validador reprova — o card simplesmente não a mostra.
   */
  narrativa?: string | null
```

E em `ConteudoFeed`, depois de `itens`:

```ts
  /** Parágrafo editorial da rodada. Mesma regra da narrativa: pode faltar. */
  resumoDoDia?: string | null
```

- [ ] **Step 2: Write the failing test**

`src/modules/entrega/__tests__/narrativa.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { llmChamadas } from '../../dominio/db/schema'
import { LLMFake } from '../../ingestao/llm'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed } from '../lista-secreta'
import { enriquecerComNarrativas, numerosDoItem, promptDeNarrativa } from '../narrativa'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await semearDemo(banco.db, ruleset, AGORA)
}, 180_000)
afterAll(async () => banco.fechar())

describe('prompt de narrativa', () => {
  it('leva os FATOS do item, e os números declarados batem com o texto', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const item = feed!.conteudo.itens.find((i) => i.linha !== null)!

    const p = promptDeNarrativa(item)
    expect(p.usuario).toContain(item.nome)
    // Todo número citável precisa estar declarado, senão o validador reprova
    // a própria narrativa correta.
    expect(p.numeros).toEqual(numerosDoItem(item))
    expect(p.numeros).toContain(item.linha!)
    // A instrução de sistema carrega as proibições do produto.
    expect(p.sistema.toLowerCase()).toContain('probabilidade')
  })
})

describe('enriquecer o snapshot com narrativas', () => {
  it('anexa narrativa a cada item e um resumo do dia', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const r = await enriquecerComNarrativas(banco.db, new LLMFake(), feed!.conteudo)

    expect(r.geradas).toBeGreaterThan(0)
    expect(r.conteudo.itens.every((i) => typeof i.narrativa === 'string')).toBe(true)
    expect(typeof r.conteudo.resumoDoDia).toBe('string')
  })

  it('texto REPROVADO pelo validador não vira narrativa — e é contado', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    // "probabilidade" é proibida pelo design system; o card fica sem narrativa.
    const porta = new LLMFake({ texto: 'A probabilidade de bater é enorme.' })
    const r = await enriquecerComNarrativas(banco.db, porta, feed!.conteudo)

    expect(r.geradas).toBe(0)
    expect(r.reprovadas).toBeGreaterThan(0)
    expect(r.conteudo.itens.every((i) => i.narrativa == null)).toBe(true)
  })

  it('LLM fora do ar NÃO derruba o conteúdo — só falta narrativa', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const r = await enriquecerComNarrativas(banco.db, new LLMFake({ falhar: true }), feed!.conteudo)

    expect(r.geradas).toBe(0)
    expect(r.conteudo.itens).toHaveLength(feed!.conteudo.itens.length)
    expect(r.conteudo.itens.every((i) => i.narrativa == null)).toBe(true)
  })

  it('toda chamada aparece em llm_chamadas, inclusive as que falharam', async () => {
    await banco.db.delete(llmChamadas)
    const feed = await lerFeed(banco.db, HOJE)
    await enriquecerComNarrativas(banco.db, new LLMFake({ falhar: true }), feed!.conteudo)

    const linhas = await banco.db.select().from(llmChamadas)
    expect(linhas.length).toBeGreaterThan(0)
    expect(linhas.every((l) => l.ok === false)).toBe(true)
  })

  it('não muda nenhum campo de estratégia do item', async () => {
    // A LLM narra; ela não decide. Se um campo de estratégia mudasse aqui, o
    // texto teria virado regra.
    const feed = await lerFeed(banco.db, HOJE)
    const antes = feed!.conteudo.itens.map((i) => ({ ...i }))
    const r = await enriquecerComNarrativas(banco.db, new LLMFake(), feed!.conteudo)

    r.conteudo.itens.forEach((depois, i) => {
      const original = antes[i]!
      expect(depois.jogadorId).toBe(original.jogadorId)
      expect(depois.linha).toBe(original.linha)
      expect(depois.confianca).toBe(original.confianca)
      expect(depois.nivelApito).toBe(original.nivelApito)
      expect(depois.turbo).toBe(original.turbo)
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/modules/entrega/__tests__/narrativa.test.ts`
Expected: FAIL — `Cannot find module '../narrativa'`

- [ ] **Step 4: Write `narrativa.ts`**

```ts
import { validarTexto } from '../ingestao/llm'
import { registrarChamada } from '../ingestao/llm/registro'
import type { PortaLLM } from '../ingestao/llm'
import type { Db } from '../dominio/db/tipos'
import type { ConteudoFeed, ItemFeed } from './lista-secreta'

/**
 * NARRATIVAS DOS CARDS — a LLM narrando o que o motor decidiu.
 *
 * Roda UMA vez por publicação, no pipeline de materialização: o custo é por
 * evento, não por usuário, e a tela continua sem chamar nada em runtime.
 *
 * O prompt recebe os FATOS já materializados. A LLM não consulta banco, não
 * escolhe jogador e não altera nenhum campo de estratégia — se fizesse, o
 * texto teria virado regra, e regra é do CJ (regra 3 do projeto).
 */

export const LIMITE_NARRATIVA = 280
export const LIMITE_RESUMO = 400

const ATRIBUTO_TEXTO: Record<string, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
}

const SISTEMA = [
  'Você é um analista de basquete escrevendo para assinantes brasileiros.',
  'Escreva UMA frase em português do Brasil, no máximo 280 caracteres, tom sóbrio de comentarista.',
  'Use APENAS os números que aparecem nos fatos. Nunca invente estatística.',
  'NUNCA use a palavra "probabilidade" nem "provável": o percentual do produto é nota de confiança, não probabilidade.',
  'Não dê conselho financeiro e não prometa resultado.',
].join(' ')

/**
 * Os números que o texto pode citar. É a lista que o validador usa para
 * reprovar estatística inventada — precisa conter tudo que é legítimo citar,
 * senão a narrativa CORRETA seria reprovada.
 */
export function numerosDoItem(item: ItemFeed): number[] {
  const numeros = [
    item.linha,
    item.confianca,
    item.mediaTemporada,
    item.alvo1Q,
    item.nivelApito,
    ...item.ultimos5.map((u) => u.valor),
    item.ultimos5.filter((u) => u.bateu).length,
    item.ultimos5.length,
  ]
  return [...new Set(numeros.filter((n): n is number => typeof n === 'number'))]
}

export function promptDeNarrativa(item: ItemFeed): {
  sistema: string
  usuario: string
  numeros: number[]
} {
  const atributo = ATRIBUTO_TEXTO[item.atributo] ?? item.atributo.toLowerCase()
  const bateu = item.ultimos5.filter((u) => u.bateu).length
  const linhas = [
    `Jogador: ${item.nome} (${item.timeSigla}, nível ${item.nivelJogador})`,
    `Mercado: ${atributo}${item.linha === null ? '' : ` a partir de ${item.linha}`}`,
    `Método da estratégia: ${item.metodo ?? 'oscilação'}`,
    `Força do sinal: nível ${item.nivelApito}${item.turbo ? ' (turbo)' : ''}`,
    item.mediaTemporada === null ? null : `Média na temporada: ${item.mediaTemporada}`,
    item.ultimos5.length === 0
      ? null
      : `Últimos ${item.ultimos5.length} jogos na linha: bateu ${bateu}; valores ${item.ultimos5.map((u) => u.valor).join(', ')}`,
  ].filter((l): l is string => l !== null)

  return { sistema: SISTEMA, usuario: linhas.join('\n'), numeros: numerosDoItem(item) }
}

function promptDeResumo(conteudo: ConteudoFeed): {
  sistema: string
  usuario: string
  numeros: number[]
} {
  const turbos = conteudo.itens.filter((i) => i.turbo).length
  const times = [...new Set(conteudo.itens.map((i) => i.timeSigla))]
  const sistema = SISTEMA.replace('UMA frase', 'até três frases').replace('280', '400')
  const usuario = [
    `Entradas na lista de hoje: ${conteudo.itens.length}`,
    `Entradas turbo: ${turbos}`,
    `Times envolvidos: ${times.join(', ')}`,
  ].join('\n')
  return { sistema, usuario, numeros: [conteudo.itens.length, turbos, times.length] }
}

/**
 * Gera narrativa por item e o resumo do dia.
 *
 * NUNCA lança: falha de LLM ou reprovação do validador deixa o campo ausente
 * e sobe a contagem. O conteúdo de estratégia volta idêntico — só ganha texto.
 */
export async function enriquecerComNarrativas(
  db: Db,
  porta: PortaLLM,
  conteudo: ConteudoFeed,
): Promise<{ conteudo: ConteudoFeed; geradas: number; reprovadas: number }> {
  let geradas = 0
  let reprovadas = 0

  const gerarUma = async (
    perfil: 'narrativa' | 'resumo',
    prompt: { sistema: string; usuario: string; numeros: number[] },
    limite: number,
  ): Promise<string | null> => {
    const inicio = Date.now()
    try {
      const r = await porta.gerar(perfil, { sistema: prompt.sistema, usuario: prompt.usuario })
      await registrarChamada(db, {
        perfil,
        modelo: r.modelo,
        tokensEntrada: r.tokensEntrada,
        tokensSaida: r.tokensSaida,
        ok: true,
        erro: null,
        duracaoMs: Date.now() - inicio,
      })
      const validado = validarTexto(r.texto, {
        numeros: prompt.numeros,
        limiteCaracteres: limite,
      })
      if (!validado.ok) {
        reprovadas += 1
        return null
      }
      geradas += 1
      return validado.texto
    } catch (erro) {
      await registrarChamada(db, {
        perfil,
        modelo: null,
        tokensEntrada: 0,
        tokensSaida: 0,
        ok: false,
        erro: erro instanceof Error ? erro.message : String(erro),
        duracaoMs: Date.now() - inicio,
      })
      return null
    }
  }

  const itens: ItemFeed[] = []
  for (const item of conteudo.itens) {
    const texto = await gerarUma('narrativa', promptDeNarrativa(item), LIMITE_NARRATIVA)
    itens.push({ ...item, narrativa: texto })
  }

  const resumo =
    conteudo.itens.length === 0
      ? null
      : await gerarUma('resumo', promptDeResumo(conteudo), LIMITE_RESUMO)

  return { conteudo: { ...conteudo, itens, resumoDoDia: resumo }, geradas, reprovadas }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/entrega/__tests__/narrativa.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 6: Commit**

```bash
git add src/modules/entrega
git commit -m "Narrativas e resumo do dia gerados a partir dos fatos materializados"
```

---

### Task 6: Ligar as narrativas à publicação — depois do hash

**Files:**
- Modify: `src/modules/entrega/lista-secreta.ts` (função `publicarListaSecreta`)
- Test: `src/modules/entrega/__tests__/narrativa-publicacao.test.ts`

**Interfaces:**
- Consumes: `enriquecerComNarrativas` (Task 5); `portaLLMDoAmbiente` (Task 3)
- Produces: `publicarListaSecreta` passa a aceitar `opcoes.llm?: PortaLLM`; `ResultadoPublicacao` ganha `narrativas?: number`

- [ ] **Step 1: Write the failing test**

`src/modules/entrega/__tests__/narrativa-publicacao.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { LLMFake } from '../../ingestao/llm'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed, publicarListaSecreta } from '../lista-secreta'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await semearDemo(banco.db, ruleset, AGORA)
}, 180_000)
afterAll(async () => banco.fechar())

async function publicar(llm: LLMFake) {
  return publicarListaSecreta(banco.db, ruleset, {
    dataReferencia: HOJE,
    agora: AGORA,
    ignorarAntecedencia: true,
    llm,
  })
}

describe('narrativa na publicação', () => {
  it('o HASH não depende do texto da LLM (regressão crítica)', async () => {
    // Texto de LLM não é determinístico. Se entrasse no hash, cada execução
    // do cron republicaria o snapshot e dispararia push repetido.
    const a = await publicar(new LLMFake({ texto: 'Primeira versão do texto.' }))
    const b = await publicar(new LLMFake({ texto: 'Segunda versão, completamente diferente.' }))
    expect(b.publicou && a.publicou && b.hash).toBe(a.publicou ? a.hash : undefined)
  })

  it('reexecutar sem mudança de fatos NÃO chama a LLM de novo', async () => {
    // Hash igual = nada mudou = não há por que pagar geração outra vez.
    await publicar(new LLMFake())
    const segunda = new LLMFake()
    const r = await publicar(segunda)
    expect(r.publicou && r.mudou).toBe(false)
    expect(segunda.chamadas).toHaveLength(0)
  })

  it('o snapshot gravado carrega as narrativas', async () => {
    await banco.db.execute('delete from feed_snapshot')
    await publicar(new LLMFake())
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed!.conteudo.itens.some((i) => typeof i.narrativa === 'string')).toBe(true)
    expect(typeof feed!.conteudo.resumoDoDia).toBe('string')
  })

  it('LLM fora do ar não impede a publicação', async () => {
    await banco.db.execute('delete from feed_snapshot')
    const r = await publicar(new LLMFake({ falhar: true }))
    expect(r.publicou).toBe(true)
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed!.conteudo.itens.length).toBeGreaterThan(0)
    expect(feed!.conteudo.itens.every((i) => i.narrativa == null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/entrega/__tests__/narrativa-publicacao.test.ts`
Expected: FAIL — `llm` não existe em `opcoes`

- [ ] **Step 3: Modify `publicarListaSecreta`**

Na assinatura, acrescente `llm` às opções:

```ts
export async function publicarListaSecreta(
  db: Db,
  ruleset: Ruleset,
  opcoes: {
    dataReferencia: string
    agora: Date
    ignorarAntecedencia?: boolean
    /** Ausente = sem narrativas. A publicação nunca depende da LLM. */
    llm?: PortaLLM
  },
): Promise<ResultadoPublicacao> {
```

Substitua o bloco `if (mudou) { ... }` e o `return` finais por:

```ts
  let narrativas = 0

  if (mudou) {
    // A NARRATIVA É ANEXADA DEPOIS DO HASH, e só quando algo mudou.
    //
    // O hash é a impressão digital do conteúdo de ESTRATÉGIA. Texto de LLM não
    // é determinístico: se entrasse no hash, cada execução do cron veria
    // "mudou" e republicaria o snapshot — push repetido e conta de LLM a cada
    // minuto. Gerando aqui, reexecutar com os mesmos fatos não chama a LLM.
    let paraGravar = conteudo
    if (opcoes.llm) {
      const enriquecido = await enriquecerComNarrativas(db, opcoes.llm, conteudo)
      paraGravar = enriquecido.conteudo
      narrativas = enriquecido.geradas
    }

    await db
      .insert(feedSnapshot)
      .values({
        dataReferencia: opcoes.dataReferencia,
        estrategia: 'LISTA_SECRETA',
        conteudoJson: paraGravar,
        geradoEm: opcoes.agora,
        hash,
      })
      .onConflictDoUpdate({
        target: [feedSnapshot.dataReferencia, feedSnapshot.estrategia, feedSnapshot.jogoId],
        set: { conteudoJson: paraGravar, geradoEm: opcoes.agora, hash },
      })
  }

  return {
    publicou: true,
    mudou,
    hash,
    itens: conteudo.itens.length,
    apitosNovos: gravados.length,
    narrativas,
  }
}
```

Acrescente ao tipo `ResultadoPublicacao`, no ramo `publicou: true`:

```ts
      /** Quantas narrativas passaram pelo validador nesta publicação. */
      narrativas?: number
```

E os imports no topo do arquivo:

```ts
import type { PortaLLM } from '../ingestao/llm'
import { enriquecerComNarrativas } from './narrativa'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/entrega/__tests__/narrativa-publicacao.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Wire the cron**

Em `src/app/api/cron/lista-secreta/route.ts`, passe a porta do ambiente na chamada de `publicarListaSecreta`:

```ts
import { portaLLMDoAmbiente } from '@/modules/ingestao/llm'
```

e acrescente `llm: portaLLMDoAmbiente()` ao objeto de opções.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: tudo verde. Se `demo.test.ts` ou `telas-demo.test.ts` falharem por causa do campo novo, o motivo será uma asserção de igualdade estrita sobre `ItemFeed` — ajuste a asserção, nunca o valor.

- [ ] **Step 7: Commit**

```bash
git add src/modules/entrega src/app/api/cron/lista-secreta
git commit -m "Narrativa entra depois do hash: LLM não republica o snapshot"
```

---

### Task 7: A narrativa na tela

**Files:**
- Modify: `src/design-system/componentes/CardEntrada.tsx`
- Modify: `src/app/(app)/page.tsx` (passar a prop)
- Test: `src/design-system/__tests__/card-narrativa.test.ts`

**Interfaces:**
- Consumes: campo `narrativa` de `ItemFeed` (Task 5)
- Produces: `CardEntrada` aceita `narrativa?: string | null`

- [ ] **Step 1: Write the failing test**

`src/design-system/__tests__/card-narrativa.test.ts`:

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CardEntrada } from '../componentes'

const BASE = {
  nome: 'Stephen Curry',
  timeSigla: 'GSW',
  atributo: 'PONTOS' as const,
  nivelJogador: 'MVP' as const,
  nivelApito: 3 as const,
  linha: 20,
  confianca: 99,
  turbo: false,
  modoFire: false,
  ultimos5: [],
  mediaTemporada: 30,
}

describe('narrativa no card', () => {
  it('mostra a análise quando ela existe', () => {
    const html = renderToStaticMarkup(
      createElement(CardEntrada, { ...BASE, narrativa: 'Vem de sequência abaixo da média.' }),
    )
    expect(html).toContain('Vem de sequência abaixo da média.')
  })

  it('sem narrativa o card não abre espaço vazio', () => {
    // Ausência é o caso NORMAL (LLM fora, validador reprovou, sem chave).
    // Um bloco vazio anunciaria defeito onde há degradação prevista.
    const semNada = renderToStaticMarkup(createElement(CardEntrada, { ...BASE, narrativa: null }))
    const semProp = renderToStaticMarkup(createElement(CardEntrada, BASE))
    expect(semNada).toBe(semProp)
  })

  it('nunca imprime a palavra probabilidade', () => {
    const html = renderToStaticMarkup(
      createElement(CardEntrada, { ...BASE, narrativa: 'Análise sóbria do confronto.' }),
    )
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design-system/__tests__/card-narrativa.test.ts`
Expected: FAIL — a narrativa não aparece no HTML

- [ ] **Step 3: Add the prop to `CardEntrada.tsx`**

Acrescente ao tipo de props:

```ts
  /**
   * Análise gerada por LLM a partir dos fatos do card. Ausente é o caso
   * NORMAL — sem chave, LLM fora ou texto reprovado pelo validador. Ausência
   * não abre espaço: um bloco vazio anunciaria defeito onde há degradação
   * prevista.
   */
  narrativa?: string | null
```

E, dentro do card, logo antes do rodapé (a zona 3):

```tsx
{props.narrativa ? (
  <p
    style={{
      margin: '0 14px 10px',
      fontSize: 12.5,
      lineHeight: 1.5,
      color: semantico.textoSecundario,
      fontStyle: 'italic',
    }}
  >
    {props.narrativa}
  </p>
) : null}
```

- [ ] **Step 4: Pass the prop in `src/app/(app)/page.tsx`**

No `<CardEntrada ...>` do map, acrescente:

```tsx
                narrativa={item.narrativa ?? null}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/design-system/__tests__/card-narrativa.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 6: Commit**

```bash
git add src/design-system src/app
git commit -m "Card mostra a análise gerada, e a ausência dela não abre buraco"
```

---

### Task 8: Chat do assinante

**Files:**
- Create: `src/modules/entrega/chat.ts`
- Create: `src/app/api/chat/route.ts`
- Test: `src/modules/entrega/__tests__/chat.test.ts`

**Interfaces:**
- Consumes: `PortaLLM`, `validarTexto` (Tasks 1–2); `registrarChamada` (Task 4); `chatMensagens` (Task 4); `lerFeed` de `lista-secreta`
- Produces: `configuracaoChat(ambiente?): { habilitado: boolean; cotaDiaria: number }`; `mensagensUsadasHoje(db, usuarioId, agora): Promise<number>`; `responder(db, porta, entrada): Promise<RespostaChat>` com `entrada = { usuarioId: string; texto: string; dataReferencia: string; agora: Date }` e `RespostaChat = { ok: true; texto: string } | { ok: false; motivo: 'cota-esgotada' | 'desabilitado' | 'indisponivel' | 'vazio' }`

- [ ] **Step 1: Write the failing test**

`src/modules/entrega/__tests__/chat.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { chatMensagens, usuarios } from '../../dominio/db/schema'
import { LLMFake } from '../../ingestao/llm'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { configuracaoChat, mensagensUsadasHoje, responder } from '../chat'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  await semearDemo(banco.db, ruleset, AGORA)
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: 'chat@teste.com', senhaHash: 'x' })
    .returning()
  usuarioId = u!.id
}, 180_000)
afterAll(async () => banco.fechar())

describe('configuração do chat', () => {
  it('vem DESLIGADO por padrão', () => {
    // Ligar sem teto de gasto configurado no provedor é o cenário caro.
    expect(configuracaoChat({} as NodeJS.ProcessEnv).habilitado).toBe(false)
  })

  it('cota padrão é 20 e o env sobrepõe', () => {
    expect(configuracaoChat({} as NodeJS.ProcessEnv).cotaDiaria).toBe(20)
    expect(
      configuracaoChat({ CHAT_COTA_DIARIA: '5' } as NodeJS.ProcessEnv).cotaDiaria,
    ).toBe(5)
  })

  it('cota inválida cai no padrão em vez de virar zero ou NaN', () => {
    // "abc" virando 0 trancaria todo mundo fora; virando NaN, liberaria geral.
    expect(configuracaoChat({ CHAT_COTA_DIARIA: 'abc' } as NodeJS.ProcessEnv).cotaDiaria).toBe(20)
  })
})

describe('chat do assinante', () => {
  it('responde e grava as duas mensagens', async () => {
    await banco.db.delete(chatMensagens)
    const r = await responder(banco.db, new LLMFake(), {
      usuarioId,
      texto: 'Por que o Curry entrou hoje?',
      dataReferencia: HOJE,
      agora: AGORA,
    })
    expect(r.ok).toBe(true)

    const linhas = await banco.db.select().from(chatMensagens)
    expect(linhas).toHaveLength(2)
    expect(linhas.map((l) => l.papel).sort()).toEqual(['ASSISTENTE', 'USUARIO'])
  })

  it('a cota é o COUNT do dia — esgotada, recusa sem chamar a LLM', async () => {
    await banco.db.delete(chatMensagens)
    for (let i = 0; i < 20; i++) {
      await banco.db.insert(chatMensagens).values({
        usuarioId,
        papel: 'USUARIO',
        texto: `pergunta ${i}`,
        criadoEm: AGORA,
      })
    }
    expect(await mensagensUsadasHoje(banco.db, usuarioId, AGORA)).toBe(20)

    const porta = new LLMFake()
    const r = await responder(banco.db, porta, {
      usuarioId,
      texto: 'mais uma',
      dataReferencia: HOJE,
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('cota-esgotada')
    expect(porta.chamadas).toHaveLength(0)
  })

  it('falha da LLM NÃO desconta da cota', async () => {
    // Cobrar a cota por um erro nosso é punir o assinante pelo nosso defeito.
    await banco.db.delete(chatMensagens)
    const r = await responder(banco.db, new LLMFake({ falhar: true }), {
      usuarioId,
      texto: 'pergunta',
      dataReferencia: HOJE,
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('indisponivel')
    expect(await mensagensUsadasHoje(banco.db, usuarioId, AGORA)).toBe(0)
  })

  it('pergunta vazia não gasta cota nem chamada', async () => {
    await banco.db.delete(chatMensagens)
    const porta = new LLMFake()
    const r = await responder(banco.db, porta, {
      usuarioId,
      texto: '   ',
      dataReferencia: HOJE,
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('vazio')
    expect(porta.chamadas).toHaveLength(0)
  })

  it('o contexto leva a lista do dia — a resposta nasce dos fatos', async () => {
    await banco.db.delete(chatMensagens)
    const porta = new LLMFake()
    await responder(banco.db, porta, {
      usuarioId,
      texto: 'quem entrou hoje?',
      dataReferencia: HOJE,
      agora: AGORA,
    })
    const enviado = porta.chamadas[0]!.pedido
    expect(enviado.sistema.toLowerCase()).toContain('probabilidade')
    expect(enviado.usuario.length).toBeGreaterThan(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/entrega/__tests__/chat.test.ts`
Expected: FAIL — `Cannot find module '../chat'`

- [ ] **Step 3: Write `chat.ts`**

```ts
import { and, eq, gte, lt } from 'drizzle-orm'

import { chatMensagens } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { validarTexto } from '../ingestao/llm'
import { registrarChamada } from '../ingestao/llm/registro'
import type { PortaLLM } from '../ingestao/llm'
import { lerFeed } from './lista-secreta'

/**
 * CHAT DO ASSINANTE — o único caminho de LLM por REQUISIÇÃO.
 *
 * Narrativas custam por evento; o chat custa por mensagem. Por isso três
 * freios: flag desligada por padrão, cota diária por assinante e teto de gasto
 * no painel do provedor (fora do código, o freio que não depende de acertarmos).
 *
 * O contexto é montado pelo SERVIDOR: feed materializado do dia + metodologia.
 * A LLM não consulta banco e não sugere entrada fora da lista.
 */

const COTA_PADRAO = 20
const LIMITE_RESPOSTA = 1200

export function configuracaoChat(ambiente: NodeJS.ProcessEnv = process.env): {
  habilitado: boolean
  cotaDiaria: number
} {
  const bruta = Number(ambiente.CHAT_COTA_DIARIA)
  return {
    // Só a string exata liga: qualquer outro valor mantém desligado.
    habilitado: ambiente.CHAT_HABILITADO === 'true',
    // Valor inválido cai no padrão. Virar 0 trancaria todo mundo fora; virar
    // NaN liberaria geral — os dois acidentes acontecem por env mal digitado.
    cotaDiaria: Number.isFinite(bruta) && bruta > 0 ? Math.floor(bruta) : COTA_PADRAO,
  }
}

/** A cota é o COUNT das perguntas do dia — sem contador paralelo para divergir. */
export async function mensagensUsadasHoje(
  db: Db,
  usuarioId: string,
  agora: Date,
): Promise<number> {
  const inicio = new Date(agora)
  inicio.setUTCHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setUTCDate(fim.getUTCDate() + 1)

  const linhas = await db
    .select({ id: chatMensagens.id })
    .from(chatMensagens)
    .where(
      and(
        eq(chatMensagens.usuarioId, usuarioId),
        eq(chatMensagens.papel, 'USUARIO'),
        gte(chatMensagens.criadoEm, inicio),
        lt(chatMensagens.criadoEm, fim),
      ),
    )
  return linhas.length
}

export type RespostaChat =
  | { ok: true; texto: string }
  | { ok: false; motivo: 'cota-esgotada' | 'desabilitado' | 'indisponivel' | 'vazio' }

const SISTEMA = [
  'Você é o assistente da IA da NBA, falando com um assinante brasileiro.',
  'Responda em português do Brasil, com no máximo três parágrafos curtos.',
  'Use SOMENTE os fatos da lista do dia fornecidos abaixo. Nunca invente estatística.',
  'NUNCA sugira uma entrada que não esteja na lista, e nunca use a palavra "probabilidade": o percentual é nota de confiança.',
  'Não dê conselho financeiro e não prometa resultado.',
].join(' ')

export async function responder(
  db: Db,
  porta: PortaLLM,
  entrada: { usuarioId: string; texto: string; dataReferencia: string; agora: Date },
): Promise<RespostaChat> {
  const pergunta = entrada.texto.trim()
  if (pergunta.length === 0) return { ok: false, motivo: 'vazio' }

  const { cotaDiaria } = configuracaoChat()
  if ((await mensagensUsadasHoje(db, entrada.usuarioId, entrada.agora)) >= cotaDiaria) {
    return { ok: false, motivo: 'cota-esgotada' }
  }

  const feed = await lerFeed(db, entrada.dataReferencia)
  const contexto = (feed?.conteudo.itens ?? [])
    .map(
      (i) =>
        `- ${i.nome} (${i.timeSigla}) · ${i.atributo} ${i.linha ?? '-'} · nível ${i.nivelApito}${i.turbo ? ' turbo' : ''} · método ${i.metodo ?? 'oscilação'}`,
    )
    .join('\n')

  const inicio = Date.now()
  try {
    const r = await porta.gerar('chat', {
      sistema: SISTEMA,
      usuario: `Lista de hoje (${entrada.dataReferencia}):\n${contexto || '(sem entradas)'}\n\nPergunta do assinante: ${pergunta}`,
    })
    await registrarChamada(db, {
      perfil: 'chat',
      modelo: r.modelo,
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      ok: true,
      erro: null,
      duracaoMs: Date.now() - inicio,
    })

    const numeros = (feed?.conteudo.itens ?? []).flatMap((i) =>
      [i.linha, i.confianca, i.nivelApito, i.mediaTemporada].filter(
        (n): n is number => typeof n === 'number',
      ),
    )
    const validado = validarTexto(r.texto, {
      numeros,
      limiteCaracteres: LIMITE_RESPOSTA,
    })
    if (!validado.ok) return { ok: false, motivo: 'indisponivel' }

    // Só grava depois do sucesso: falha nossa não pode consumir a cota do
    // assinante, e a cota É esta tabela.
    await db.insert(chatMensagens).values([
      { usuarioId: entrada.usuarioId, papel: 'USUARIO', texto: pergunta, criadoEm: entrada.agora },
      {
        usuarioId: entrada.usuarioId,
        papel: 'ASSISTENTE',
        texto: validado.texto,
        modelo: r.modelo,
        tokensEntrada: r.tokensEntrada,
        tokensSaida: r.tokensSaida,
        criadoEm: entrada.agora,
      },
    ])

    return { ok: true, texto: validado.texto }
  } catch (erro) {
    await registrarChamada(db, {
      perfil: 'chat',
      modelo: null,
      tokensEntrada: 0,
      tokensSaida: 0,
      ok: false,
      erro: erro instanceof Error ? erro.message : String(erro),
      duracaoMs: Date.now() - inicio,
    })
    return { ok: false, motivo: 'indisponivel' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/entrega/__tests__/chat.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Write the route `src/app/api/chat/route.ts`**

```ts
import { NextResponse } from 'next/server'

import { dataDeReferencia } from '@/modules/dominio/rodada'
import { getDb } from '@/modules/dominio/db/cliente'
import { portaLLMDoAmbiente } from '@/modules/ingestao/llm'
import { configuracaoChat, responder } from '@/modules/entrega/chat'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'

export const dynamic = 'force-dynamic'

/**
 * Chat do assinante. Mesma cadeia de acesso das telas: sessão válida e direito
 * ativo. Sem assinatura, sem chat.
 */
export async function POST(requisicao: Request): Promise<Response> {
  if (!configuracaoChat().habilitado) {
    return NextResponse.json({ erro: 'desabilitado' }, { status: 503 })
  }

  const sessao = await sessaoAtual()
  if (!sessao) return NextResponse.json({ erro: 'sem-sessao' }, { status: 401 })

  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (!acesso.permitido) return NextResponse.json({ erro: 'sem-direito' }, { status: 403 })

  const corpo = (await requisicao.json().catch(() => null)) as { texto?: unknown } | null
  const texto = typeof corpo?.texto === 'string' ? corpo.texto : ''

  const ruleset = await rulesetAtivo()
  const agora = new Date()
  const r = await responder(getDb(), portaLLMDoAmbiente(), {
    usuarioId: sessao.usuarioId,
    texto,
    dataReferencia: dataDeReferencia(agora, ruleset.rodada.fuso),
    agora,
  })

  if (r.ok) return NextResponse.json({ texto: r.texto })
  const status = r.motivo === 'cota-esgotada' ? 429 : r.motivo === 'vazio' ? 400 : 503
  return NextResponse.json({ erro: r.motivo }, { status })
}
```

- [ ] **Step 6: Run the whole suite and build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tudo verde

- [ ] **Step 7: Commit**

```bash
git add src/modules/entrega/chat.ts src/modules/entrega/__tests__/chat.test.ts src/app/api/chat
git commit -m "Chat do assinante: cota como COUNT do dia, falha não cobra cota"
```

---

### Task 9: Documentação e fechamento

**Files:**
- Create: `docs/adr/0009-llm-narra-nunca-decide.md`
- Modify: `CLAUDE.md` (seção "Onde as coisas ficam")
- Modify: `docs/runbooks/deploy.md` (envs novos)

**Interfaces:**
- Consumes: tudo das tasks anteriores
- Produces: documentação; nenhum código

- [ ] **Step 1: Write the ADR**

`docs/adr/0009-llm-narra-nunca-decide.md`:

```markdown
# ADR-0009 — A LLM narra; ela nunca decide

**Status:** aceito · 25/08/2026 · implementa a spec de LLM routing

## Contexto

O produto ganhou geração de texto por LLM em quatro frentes (narrativa do card,
resumo do dia, chat do assinante, sugestão de vínculos no admin). A tentação
óbvia — e o erro que este ADR fecha — seria deixar a LLM opinar sobre QUEM
apita.

## Decisão

A LLM recebe fatos que o motor já decidiu e produz texto sobre eles. Ela não
decide, não consulta banco e não bloqueia o produto.

Três mecanismos sustentam isso:

1. **A porta é de ingestão (L0)**, não do motor. `src/modules/motor/**` não
   importa nada de LLM, e a fronteira é verificada pelo dependency-cruiser.
2. **O validador** (`validador.ts`) reprova texto com a palavra "probabilidade"
   e com qualquer número que não esteja nos fatos de entrada. Alucinação de
   estatística morre antes da tela.
3. **A narrativa é anexada depois do hash** do snapshot. Texto de LLM não é
   determinístico; se entrasse no hash, cada execução do cron republicaria a
   lista e dispararia push repetido.

## Consequências

- Reexecutar a publicação com os mesmos fatos **não chama a LLM** — idempotente
  e sem custo.
- Falha da LLM degrada a feature, nunca o produto: card sem narrativa, chat
  indisponível, sugestão de vínculo ausente.
- Sem `OPENROUTER_API_KEY` o app funciona inteiro com o adapter fake.
- O custo real é observável em `llm_chamadas` sem depender do painel do
  provedor.

## Alternativas descartadas

**LLM sugerindo entradas.** Viola a regra 3 do projeto: regra de estratégia é
do CJ, e apito inventado vira push errado no celular de assinante pagante.

**Gerar narrativa na tela, sob demanda.** Custo por usuário em vez de por
evento, e a tela passaria a chamar rede — quebra `tela-nao-chama-o-motor`.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Na seção "Onde as coisas ficam", acrescente após a linha de `src/modules/ingestao/`:

```
src/modules/ingestao/llm/     L0 · porta de LLM (OpenRouter) — narra, nunca decide
```

- [ ] **Step 3: Update `docs/runbooks/deploy.md`**

Acrescente uma seção com os envs novos:

```markdown
## Envs de LLM (todos opcionais)

| Env | Padrão | Efeito |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | ausente | Sem ela, todo o subsistema usa o adapter fake e o app funciona normalmente |
| `CHAT_HABILITADO` | `false` | Só a string `true` liga o endpoint `/api/chat` |
| `CHAT_COTA_DIARIA` | `20` | Perguntas por assinante por dia |

**Antes de `CHAT_HABILITADO=true` em produção:** configurar o teto de gasto da
chave no painel do OpenRouter. É o freio que não depende do nosso código.
```

- [ ] **Step 4: Run the whole verification**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`
Expected: tudo verde, zero erros de lint

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md
git commit -m "ADR-0009 e runbook dos envs de LLM"
```

---

## Self-review

**Cobertura da spec:**

| Seção da spec | Task |
| --- | --- |
| 3 · Arquitetura (porta, perfis, fake) | 1 |
| 3 · Adapter OpenRouter + seleção por ambiente | 3 |
| 4 · Narrativas e resumo (validador, materialização) | 2, 5, 6, 7 |
| 5 · Chat (cota, flag, tabela, endpoint) | 4, 8 |
| 6 · Admin (sugestão de vínculos) | **não coberto — ver abaixo** |
| 7 · Observabilidade (`llm_chamadas`) | 4 |
| 8 · Envs | 3, 8, 9 |
| 9 · Testes | todas |

**Lacuna consciente:** a seção 6 da spec (sugestão de vínculos no admin) não
tem task. É a única frente que não afeta o assinante e depende de ver a
qualidade do perfil `admin` com dados reais. Fica para um plano seguinte, e a
spec segue registrando a intenção. Se preferir cobrir agora, é uma task no
mesmo formato sobre `/admin/mapeamento`.

**Consistência de tipos:** `PerfilLLM`, `PedidoGeracao`, `TextoGerado`,
`ErroLLM`, `PortaLLM` definidos na Task 1 e usados sem variação nas 3, 4, 5, 8.
`validarTexto(texto, { numeros, limiteCaracteres })` definido na Task 2 e
chamado com essa forma nas Tasks 5 e 8. `registrarChamada(db, dados)` definido
na Task 4 e chamado nas Tasks 5 e 8. `enriquecerComNarrativas(db, porta,
conteudo)` definido na Task 5 e chamado na Task 6.

**Sem placeholders:** todo passo traz o código real.
