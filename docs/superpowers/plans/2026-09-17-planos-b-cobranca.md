# Planos de assinatura — Plano B: cobrança dos quatro SKUs — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vender os quatro SKUs — `MVP_MENSAL`, `MVP_TEMPORADA`, `ALL_STAR_MENSAL`, `ALL_STAR_TEMPORADA` — com mensal recorrente, temporada por pagamento único e upgrade que troca o plano na aprovação, sem devolução.

**Architecture:** O SKU escolhido é gravado na `tentativas_checkout` ANTES da rede — é ela que o webhook lê para saber o que foi comprado, do mesmo jeito que já lê para saber de QUEM é a compra. Mensal continua sendo o `preapproval` de hoje, um por nível; temporada é uma preferência de Checkout Pro (`/checkout/preferences`) cujo `payment` aprovado vira contrato com `fim = TEMPORADA_FIM` e sem recorrência. O upgrade acontece na ordem que a decisão 3 da spec exige: o direito novo nasce, o antigo é revogado depois — nunca o contrário — e o cancelamento do contrato antigo no provedor sai da transação, para rede não segurar conexão de banco.

**Tech Stack:** Next.js App Router (componentes de servidor e server actions), Drizzle + Postgres (Neon em produção, PGlite nos testes), Zod nos contratos do provedor, Vitest, `renderToStaticMarkup` para testes de tela.

**Spec:** [`docs/superpowers/specs/2026-09-15-planos-de-assinatura-design.md`](../specs/2026-09-15-planos-de-assinatura-design.md) — este plano cobre §9 (Cobrança) e §10 (Preços e configuração), a linha "Conta" de §5 e o aviso de `TEMPORADA_FIM` de §14. O Plano A (§4–§8) está em produção desde 16/09 (commit `a0e0dec`).

## Global Constraints

- **Regra 4 do `CLAUDE.md` — odds somente leitura.** Nada aqui envia aposta, guarda credencial de casa ou movimenta dinheiro fora do Mercado Pago.
- **Nunca escreva "probabilidade" na UI.** O % é nota de confiança. Toda tela nova desta entrega tem uma asserção `expect(html.toLowerCase()).not.toContain('probabilidade')`.
- **`nivel` sozinho é proibido** (CLAUDE.md, vocabulário). O tipo é `NivelDoPlano`, a coluna é `nivel_do_plano`, a variável é `nivelDoPlano` ou `acesso.nivel` dentro do resultado de acesso.
- **Preço nunca em código** (decisão 13). Todo valor vem de env, lido por `precosDosPlanos`. Um número monetário escrito num componente é defeito de revisão.
- **Retorno do navegador nunca concede acesso** (princípio da Spec 04). Quem volta do Checkout Pro vê "aguardando confirmação" até o webhook chegar. Nenhuma task altera `/retorno/mercadopago` para olhar parâmetro de URL.
- **Nenhum teste chama o Mercado Pago de verdade.** Ou `PagamentoFake`, ou `PagamentoMercadoPago` com `fetch` mockado. Um teste que faça rede de verdade é reprovado.
- **Nenhum teste nomeia jogador ou time.** Asserção por estrutura.
- **O motor não muda.** Cobrança não entra em `src/modules/motor/**` nem no ruleset.
- **`src/modules/plataforma/**` não importa de `src/modules/entrega/**`.** Hoje não importa em nenhum arquivo, e não é este plano que vai abrir a exceção: o fuso da rodada entra por ARGUMENTO, vindo de quem já lê o ruleset (as rotas e as páginas em `src/app/`).
- **Um commit só, no final** (preferência do parceiro, também em MEMORY.md). As tasks terminam em verificação; a Task 11 commita. Sem push, sem PR.
- **Verificação de cada task:** `npm run typecheck && npm run lint && npm run boundaries` e a suíte do que foi tocado. Uma execução de vitest por vez.

### Rulings deste plano

Decisões que a spec não fecha, ou em que o código contradiz o texto da spec. A spec vence se contradisser; onde ela é omissa, vale o que está aqui.

- **R-B1 — O SKU mora na `tentativas_checkout`, não no pedido da porta.** A spec §9 diz "`PedidoCriacaoAssinatura` ganha `nivelDoPlano`". O pedido da porta é a camada anticorrupção: o Mercado Pago não tem conceito de nível da NIP e não faria nada com o campo. O nível viaja para o provedor dentro de `nomePlano` (o nome do SKU, que é o que aparece na fatura do comprador) e, canonicamente, nas colunas novas `tentativas_checkout.nivel_do_plano` e `modalidade` — que é de onde o webhook lê. **Custo se errado:** se algum dia o provedor precisar do nível estruturado, o campo entra no pedido; nada do que este plano grava se perde.
- **R-B2 — `consultarPagamento(id)` não é implementado; `buscarPagamentoPorReferencia` é.** A spec §9 pede os dois. O id que a NIP guarda de uma temporada é o da PREFERÊNCIA, não o do pagamento — o pagamento só existe depois que alguém paga, e o seu id chega pelo webhook. Um `consultarPagamento(id)` não teria chamador: toda leitura parte da referência. A reconciliação usa `buscarPagamentoPorReferencia`. **Custo se errado:** um método a mais na porta e no fake, dez linhas.
- **R-B3 — Evento sem tentativa não concede nada.** Hoje `usuarioDoEvento` tem um caminho de compatibilidade: se a `referencia_externa` for um UUID de usuário, ele resolve o usuário por ali. Esse caminho não sabe qual SKU foi comprado, e as colunas de nível são NOT NULL. Ele sai. Um evento cuja referência não tem `tentativas_checkout` é gravado em `eventos_pagamento` (para auditoria) e não cria contrato nem direito. Em produção o checkout nunca esteve ligado, então nenhuma referência desse formato existe. **Custo se errado:** um evento legado deixa de conceder acesso e o admin concede cortesia à mão, com registro.
- **R-B4 — Temporada não cria linha em `assinaturas` no checkout.** Mensal cria (é um contrato de verdade no provedor, com id de `preapproval`). Preferência não é contrato: ninguém pagou. A linha de `assinaturas` da temporada nasce no webhook, na aprovação, com `mercadopago_id` NULO — nada no espaço de `preapproval` corresponde a ela, e é exatamente isso que faz `podeCancelar` na conta ser `false` sozinho, sem um `if` novo. O id da preferência fica em `tentativas_checkout.assinatura_externa_id`, que já é uma coluna de "id do recurso externo".
- **R-B5 — Downgrade some do seletor por nível, não só por modalidade.** A spec §9 diz "o seletor não oferece nível igual ou menor que o ativo **na mesma modalidade**". Lido ao pé da letra, um All Star mensal veria MVP temporada. A decisão 12 diz "downgrade não existe". Vale a decisão 12: nenhuma oferta abaixo do nível ativo, em nenhuma modalidade.
- **R-B6 — A revogação de upgrade só alcança o que o novo direito cobre.** Ao aprovar um direito de nível N, são revogados os outros direitos ativos cujo nível N atende (`atende(N, anterior)`). Um direito de nível MAIOR — uma cortesia All Star, por exemplo — sobrevive à compra de um MVP. Sem essa condição, comprar o plano de baixo apagaria uma cortesia de cima, o que é o downgrade que a decisão 12 proíbe. **Custo se errado:** um assinante fica com dois direitos ativos e `avaliarAcesso` devolve o maior (decisão 3) — ele vê mais, nunca menos.
- **R-B7 — Entre a Task 5 e a Task 9 a página `/assinar` fica sem botão de compra.** A Task 5 apaga o bloco do checkout de um SKU só (ele lê `config.valorCentavos`, que deixa de existir) e a Task 9 põe o seletor no lugar. No intervalo a página cai na mensagem "A contratação pelo app chega em breve", que é exatamente o que produção mostra hoje (a flag está desligada) — e o commit é um só, no fim. Nenhum usuário atravessa esse intervalo.

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
| --- | --- | --- |
| `src/modules/plataforma/assinatura/sku.ts` (novo) | os quatro SKUs, sua composição, o nome comercial e a regra de oferta — puro | 1 |
| `src/modules/plataforma/assinatura/__tests__/sku.test.ts` (novo) | a regra de oferta, caso a caso | 1 |
| `src/modules/plataforma/assinatura/precos.ts` (novo) | lê as sete variáveis de §10; `fimDaTemporada`; `avisoDaTemporada` | 2 |
| `src/modules/plataforma/assinatura/__tests__/precos.test.ts` (novo) | leitura de env, "de/por", falha alta com checkout ligado | 2 |
| `.env.example` | as sete variáveis novas | 2, 11 |
| `src/modules/plataforma/assinatura/porta.ts` | `PedidoPagamentoUnico`, `PagamentoExterno`, `criarPagamentoUnico`, `buscarPagamentoPorReferencia` | 3 |
| `src/modules/plataforma/assinatura/fake.ts` | o fake implementa os dois métodos novos e registra cancelamentos | 3 |
| `src/modules/plataforma/assinatura/mercadopago.ts` | `/checkout/preferences` e `/v1/payments/search` | 3 |
| `src/modules/plataforma/assinatura/__tests__/pagamento-unico.test.ts` (novo) | o adapter real, com `fetch` mockado | 3 |
| `src/modules/dominio/db/schema/plataforma.ts` | `tentativas_checkout.nivel_do_plano` e `.modalidade` + checks | 4 |
| `drizzle/0028_<gerado>.sql` + `drizzle/down/` (via `npm run db:generate`) | a migration | 4 |
| `src/modules/plataforma/assinatura/checkout.ts` | `iniciarCheckout` por SKU; ramo temporada; troca de SKU encerra a tentativa velha | 5 |
| `src/modules/plataforma/assinatura/configuracao.ts` | apaga `MERCADOPAGO_PLANO_*`, `NIVEL_DO_CHECKOUT_LEGADO`, `MODALIDADE_DO_CHECKOUT_LEGADO` | 5 |
| `src/app/(app)/assinar/acoes.ts` | `contratar(formData)` lê e valida o SKU | 5 |
| `src/modules/plataforma/assinatura/webhook.ts` | grava o SKU da tentativa; `fim` da temporada; `modalidade` no conflito | 6 |
| `src/app/api/webhook/mercadopago/route.ts` | passa `fimDaTemporada`; dispara o cancelamento do contrato substituído | 6, 7 |
| `src/modules/plataforma/assinatura/substituicao.ts` (novo) | `cancelarContratosSubstituidos` — a chamada de rede, fora da transação | 7 |
| `src/modules/plataforma/assinatura/reconciliacao.ts` | ramo temporada; a rede de retentativa do cancelamento | 8 |
| `src/app/api/cron/reconciliar-pagamentos/route.ts` | passa `fimDaTemporada`; chama a varredura | 8 |
| `src/app/(app)/assinar/page.tsx` | o seletor dos quatro SKUs, preços, "de/por", aviso de substituição | 9 |
| `src/app/(app)/conta/blocos.tsx`, `conta/page.tsx` | nível e modalidade em linguagem da NIP; temporada sem "próxima cobrança" | 10 |
| `src/app/(admin)/admin/usuarios/page.tsx` | o aviso de 30 dias de `TEMPORADA_FIM` | 10 |
| `scripts/mp-conferir.ts`, `docs/runbooks/cobranca-e-acesso.md` | acompanham as variáveis novas | 11 |
| tudo | bateria completa, `.env.example`, um commit | 11 |

---

### Task 1: O SKU e a regra de oferta

O que está à venda, e para quem. Puro: sem banco, sem rede, sem relógio interno — `agora` entra por argumento.

**Files:**
- Create: `src/modules/plataforma/assinatura/sku.ts`
- Test: `src/modules/plataforma/assinatura/__tests__/sku.test.ts`

**Interfaces:**
- Consumes (já existe, não mexer): de `./nivel-do-plano` — `type NivelDoPlano = 'GRATIS' | 'MVP' | 'ALL_STAR'`, `type NivelPago = 'MVP' | 'ALL_STAR'`, `type Modalidade = 'MENSAL' | 'TEMPORADA'`, `function atende(nivelDoPlano: NivelDoPlano, minimo: NivelDoPlano): boolean`.
- Produces:
  ```ts
  export type Sku = 'MVP_MENSAL' | 'MVP_TEMPORADA' | 'ALL_STAR_MENSAL' | 'ALL_STAR_TEMPORADA'
  export const SKUS: readonly Sku[]
  export const NOME_DO_SKU: Record<Sku, string>
  export function composicaoDoSku(sku: Sku): { nivelDoPlano: NivelPago; modalidade: Modalidade }
  export function skuDe(nivelDoPlano: NivelPago, modalidade: Modalidade): Sku
  export function ehSku(valor: string): valor is Sku
  export type Oferta = {
    sku: Sku
    nivelDoPlano: NivelPago
    modalidade: Modalidade
    substituiPlanoAtual: boolean
  }
  export function ofertasDisponiveis(
    acesso: { nivel: NivelDoPlano; modalidade: Modalidade | null },
    agora: Date,
    fimDaTemporada: Date,
  ): Oferta[]
  ```
  As Tasks 2, 5, 6 e 9 importam daqui.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/modules/plataforma/assinatura/__tests__/sku.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { composicaoDoSku, ehSku, NOME_DO_SKU, ofertasDisponiveis, skuDe, SKUS } from '../sku'

// Dentro da janela da temporada em todos os casos, menos onde o nome diz o
// contrário.
const AGORA = new Date('2026-10-01T12:00:00.000Z')
const FIM_DA_TEMPORADA = new Date('2027-07-01T03:00:00.000Z')

/**
 * As listas esperadas são escritas À MÃO, nunca derivadas de `SKUS` nem de
 * `composicaoDoSku`. Derivar faria o teste comparar o módulo consigo mesmo —
 * foi assim que uma matriz de planos passou verde com o conteúdo errado
 * (revisão de 16/09).
 */
function skusDe(acesso: Parameters<typeof ofertasDisponiveis>[0], agora = AGORA): string[] {
  return ofertasDisponiveis(acesso, agora, FIM_DA_TEMPORADA).map((oferta) => oferta.sku)
}

describe('composição do SKU', () => {
  it('cada SKU é um nível e uma modalidade', () => {
    expect(composicaoDoSku('MVP_MENSAL')).toEqual({ nivelDoPlano: 'MVP', modalidade: 'MENSAL' })
    expect(composicaoDoSku('MVP_TEMPORADA')).toEqual({
      nivelDoPlano: 'MVP',
      modalidade: 'TEMPORADA',
    })
    expect(composicaoDoSku('ALL_STAR_MENSAL')).toEqual({
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'MENSAL',
    })
    expect(composicaoDoSku('ALL_STAR_TEMPORADA')).toEqual({
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
    })
  })

  it('skuDe é o caminho de volta, para os quatro', () => {
    expect(skuDe('MVP', 'MENSAL')).toBe('MVP_MENSAL')
    expect(skuDe('MVP', 'TEMPORADA')).toBe('MVP_TEMPORADA')
    expect(skuDe('ALL_STAR', 'MENSAL')).toBe('ALL_STAR_MENSAL')
    expect(skuDe('ALL_STAR', 'TEMPORADA')).toBe('ALL_STAR_TEMPORADA')
  })

  it('ehSku recusa o que não é SKU — o valor chega de formulário', () => {
    expect(ehSku('MVP_MENSAL')).toBe(true)
    expect(ehSku('GRATIS_MENSAL')).toBe(false)
    expect(ehSku('MVP')).toBe(false)
    expect(ehSku('')).toBe(false)
    expect(ehSku('__proto__')).toBe(false)
  })

  it('SKUS tem os quatro e NOME_DO_SKU nomeia todos eles', () => {
    expect([...SKUS].sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_MENSAL', 'MVP_TEMPORADA'].sort(),
    )
    for (const sku of SKUS) expect(NOME_DO_SKU[sku].length).toBeGreaterThan(0)
    // O nome vai para a fatura do comprador: quatro nomes, quatro textos.
    expect(new Set(Object.values(NOME_DO_SKU)).size).toBe(4)
  })
})

describe('ofertasDisponiveis', () => {
  it('o grátis vê os quatro enquanto a temporada está aberta', () => {
    expect(skusDe({ nivel: 'GRATIS', modalidade: null }).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_MENSAL', 'MVP_TEMPORADA'].sort(),
    )
  })

  it('passada a data da temporada, sobram só os mensais', () => {
    const depois = new Date('2027-07-02T12:00:00.000Z')
    expect(skusDe({ nivel: 'GRATIS', modalidade: null }, depois).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'MVP_MENSAL'].sort(),
    )
  })

  it('o instante exato do fim já fecha a temporada', () => {
    expect(skusDe({ nivel: 'GRATIS', modalidade: null }, FIM_DA_TEMPORADA).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'MVP_MENSAL'].sort(),
    )
  })

  it('MVP mensal não compra MVP mensal de novo, mas troca de modalidade e sobe', () => {
    expect(skusDe({ nivel: 'MVP', modalidade: 'MENSAL' }).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_TEMPORADA'].sort(),
    )
  })

  it('quem tem temporada nunca volta para mensal', () => {
    expect(skusDe({ nivel: 'MVP', modalidade: 'TEMPORADA' })).toEqual(['ALL_STAR_TEMPORADA'])
  })

  it('All Star mensal só pode trocar para a temporada — downgrade não existe', () => {
    expect(skusDe({ nivel: 'ALL_STAR', modalidade: 'MENSAL' })).toEqual(['ALL_STAR_TEMPORADA'])
  })

  it('All Star temporada não tem o que comprar', () => {
    expect(skusDe({ nivel: 'ALL_STAR', modalidade: 'TEMPORADA' })).toEqual([])
  })

  it('cortesia MVP (sem modalidade) pode comprar o próprio nível e o de cima', () => {
    expect(skusDe({ nivel: 'MVP', modalidade: null }).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_MENSAL', 'MVP_TEMPORADA'].sort(),
    )
  })

  it('substituiPlanoAtual só é verdadeiro para quem já tem plano — é o que aciona o aviso', () => {
    for (const oferta of ofertasDisponiveis(
      { nivel: 'GRATIS', modalidade: null },
      AGORA,
      FIM_DA_TEMPORADA,
    )) {
      expect(oferta.substituiPlanoAtual).toBe(false)
    }
    for (const oferta of ofertasDisponiveis(
      { nivel: 'MVP', modalidade: 'MENSAL' },
      AGORA,
      FIM_DA_TEMPORADA,
    )) {
      expect(oferta.substituiPlanoAtual).toBe(true)
    }
  })

  it('cada oferta carrega a composição do próprio SKU', () => {
    const ofertas = ofertasDisponiveis({ nivel: 'GRATIS', modalidade: null }, AGORA, FIM_DA_TEMPORADA)
    const temporadaAllStar = ofertas.find((oferta) => oferta.sku === 'ALL_STAR_TEMPORADA')
    expect(temporadaAllStar).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/modules/plataforma/assinatura/__tests__/sku.test.ts
```

Esperado: FAIL — `Failed to resolve import "../sku"`.

- [ ] **Step 3: Escreva `sku.ts`**

Crie `src/modules/plataforma/assinatura/sku.ts`:

```ts
import type { Modalidade, NivelDoPlano, NivelPago } from './nivel-do-plano'
import { atende } from './nivel-do-plano'

/**
 * OS QUATRO SKUs — o que está à venda.
 *
 * Um SKU é um par (nível, modalidade); ele não é um conceito novo, é o nome
 * curto do par, porque é isso que um formulário consegue mandar num campo só
 * e o que o provedor mostra na fatura do comprador. Quem decide o que o SKU
 * LIBERA continua sendo `nivel-do-plano.ts`; aqui só se diz o que se vende.
 */
export type Sku = 'MVP_MENSAL' | 'MVP_TEMPORADA' | 'ALL_STAR_MENSAL' | 'ALL_STAR_TEMPORADA'

const COMPOSICAO: Record<Sku, { nivelDoPlano: NivelPago; modalidade: Modalidade }> = {
  MVP_MENSAL: { nivelDoPlano: 'MVP', modalidade: 'MENSAL' },
  MVP_TEMPORADA: { nivelDoPlano: 'MVP', modalidade: 'TEMPORADA' },
  ALL_STAR_MENSAL: { nivelDoPlano: 'ALL_STAR', modalidade: 'MENSAL' },
  ALL_STAR_TEMPORADA: { nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' },
}

export const SKUS: readonly Sku[] = Object.keys(COMPOSICAO) as Sku[]

/**
 * O nome que o comprador vê na fatura do cartão e no e-mail do Mercado Pago.
 * Sem acento e sem símbolo: é texto que atravessa a API de um terceiro, e
 * uma fatura ilegível vira contestação.
 */
export const NOME_DO_SKU: Record<Sku, string> = {
  MVP_MENSAL: 'NIP MVP mensal',
  MVP_TEMPORADA: 'NIP MVP temporada',
  ALL_STAR_MENSAL: 'NIP All Star mensal',
  ALL_STAR_TEMPORADA: 'NIP All Star temporada',
}

export function composicaoDoSku(sku: Sku): { nivelDoPlano: NivelPago; modalidade: Modalidade } {
  return COMPOSICAO[sku]
}

export function skuDe(nivelDoPlano: NivelPago, modalidade: Modalidade): Sku {
  return `${nivelDoPlano}_${modalidade}` as Sku
}

/**
 * O SKU chega de formulário, então chega como string de fora. `in` sozinho
 * aceitaria `__proto__` e `toString`, que existem na cadeia de protótipo de
 * qualquer objeto — a checagem é contra a lista, não contra o objeto.
 */
export function ehSku(valor: string): valor is Sku {
  return (SKUS as readonly string[]).includes(valor)
}

export type Oferta = {
  sku: Sku
  nivelDoPlano: NivelPago
  modalidade: Modalidade
  /** Comprar isto encerra o plano de hoje, sem devolução. A tela avisa antes. */
  substituiPlanoAtual: boolean
}

/**
 * O QUE ESTA PESSOA PODE COMPRAR AGORA (spec §9).
 *
 * Quatro recusas, cada uma por um motivo diferente:
 *
 * 1. Temporada fora da janela. A data vendida é fixa (decisão 4) e, passada
 *    ela, não há o que vender — o seletor esconde sozinho, sem ninguém
 *    lembrar de desligar nada.
 * 2. Temporada → mensal. Quem já pagou a temporada inteira não tem por que
 *    voltar a uma cobrança recorrente; a spec chama essa compra de
 *    inexistente.
 * 3. Nível abaixo do ativo. Downgrade não existe (decisão 12): quem quer
 *    descer cancela e deixa vencer. Vale em QUALQUER modalidade — o texto da
 *    spec §9 fala em "mesma modalidade", mas a decisão 12 é mais ampla e é
 *    ela que manda (ruling R-B5).
 * 4. O mesmo par que já se tem. Comprar de novo o que já se tem só gastaria
 *    dinheiro.
 */
export function ofertasDisponiveis(
  acesso: { nivel: NivelDoPlano; modalidade: Modalidade | null },
  agora: Date,
  fimDaTemporada: Date,
): Oferta[] {
  const temporadaAberta = agora.getTime() < fimDaTemporada.getTime()
  const ofertas: Oferta[] = []
  for (const sku of SKUS) {
    const { nivelDoPlano, modalidade } = COMPOSICAO[sku]
    if (modalidade === 'TEMPORADA' && !temporadaAberta) continue
    if (acesso.modalidade === 'TEMPORADA' && modalidade === 'MENSAL') continue
    if (!atende(nivelDoPlano, acesso.nivel)) continue
    if (nivelDoPlano === acesso.nivel && modalidade === acesso.modalidade) continue
    ofertas.push({
      sku,
      nivelDoPlano,
      modalidade,
      substituiPlanoAtual: acesso.nivel !== 'GRATIS',
    })
  }
  return ofertas
}
```

- [ ] **Step 4: Rode o teste e veja passar**

```
npx vitest run src/modules/plataforma/assinatura/__tests__/sku.test.ts
```

Esperado: PASS, 14 testes.

- [ ] **Step 5: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
```

Esperado: tudo limpo. **Não commite** — o commit é um só, na Task 11.

---

### Task 2: Os preços em config

As sete variáveis de §10, lidas num lugar só, com a mesma disciplina de `configuracaoChat`: falta de valor não vira número inventado.

**Files:**
- Create: `src/modules/plataforma/assinatura/precos.ts`
- Test: `src/modules/plataforma/assinatura/__tests__/precos.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: de `./sku` — `type Sku`, `const SKUS: readonly Sku[]`. De `../../dominio/rodada` — `function intervaloDoDia(dataReferencia: string, fuso: string): { inicio: Date; fim: Date }`.
- Produces:
  ```ts
  export type PrecoDoSku = { centavos: number; deCentavos: number | null }
  export type PrecosDosPlanos = { porSku: Record<Sku, PrecoDoSku>; fimDaTemporada: Date }
  export function precosDosPlanos(
    fuso: string,
    ambiente?: Readonly<Record<string, string | undefined>>,
  ): PrecosDosPlanos | null
  export function avisoDaTemporada(fimDaTemporada: Date | null, agora: Date): string | null
  ```
  As Tasks 5, 6, 8, 9 e 10 importam daqui.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/modules/plataforma/assinatura/__tests__/precos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { avisoDaTemporada, precosDosPlanos } from '../precos'

const FUSO = 'America/Sao_Paulo'

/** Os valores de lançamento da spec §10. */
const ENV_COMPLETO = {
  PLANO_MVP_MENSAL_CENTAVOS: '5990',
  PLANO_MVP_MENSAL_DE_CENTAVOS: '7990',
  PLANO_MVP_TEMPORADA_CENTAVOS: '39700',
  PLANO_ALL_STAR_MENSAL_CENTAVOS: '9990',
  PLANO_ALL_STAR_MENSAL_DE_CENTAVOS: '14900',
  PLANO_ALL_STAR_TEMPORADA_CENTAVOS: '59700',
  TEMPORADA_FIM: '2027-06-30',
}

describe('precosDosPlanos', () => {
  it('lê os quatro preços e o "de" de quem tem', () => {
    const precos = precosDosPlanos(FUSO, ENV_COMPLETO)
    expect(precos?.porSku.MVP_MENSAL).toEqual({ centavos: 5990, deCentavos: 7990 })
    expect(precos?.porSku.MVP_TEMPORADA).toEqual({ centavos: 39700, deCentavos: null })
    expect(precos?.porSku.ALL_STAR_MENSAL).toEqual({ centavos: 9990, deCentavos: 14900 })
    expect(precos?.porSku.ALL_STAR_TEMPORADA).toEqual({ centavos: 59700, deCentavos: null })
  })

  it('TEMPORADA_FIM é o último dia INCLUSIVE: o fim é a meia-noite SEGUINTE, no fuso', () => {
    const precos = precosDosPlanos(FUSO, ENV_COMPLETO)
    // 30/06/2027 é o último dia vendido; o direito vale até a virada para
    // 01/07, que em Brasília (UTC-3) é 03:00 UTC.
    expect(precos?.fimDaTemporada.toISOString()).toBe('2027-07-01T03:00:00.000Z')
  })

  it('o "de" menor ou igual ao preço cobrado não aparece — não é promoção', () => {
    const menor = precosDosPlanos(FUSO, { ...ENV_COMPLETO, PLANO_MVP_MENSAL_DE_CENTAVOS: '4990' })
    expect(menor?.porSku.MVP_MENSAL.deCentavos).toBeNull()
    const igual = precosDosPlanos(FUSO, { ...ENV_COMPLETO, PLANO_MVP_MENSAL_DE_CENTAVOS: '5990' })
    expect(igual?.porSku.MVP_MENSAL.deCentavos).toBeNull()
  })

  it('com o checkout desligado, configuração incompleta devolve null em vez de quebrar o boot', () => {
    expect(precosDosPlanos(FUSO, {})).toBeNull()
    const semTemporada = { ...ENV_COMPLETO, TEMPORADA_FIM: '' }
    expect(precosDosPlanos(FUSO, semTemporada)).toBeNull()
  })

  it('com o checkout LIGADO, configuração incompleta falha alto e diz qual variável falta', () => {
    expect(() =>
      precosDosPlanos(FUSO, {
        ...ENV_COMPLETO,
        MERCADOPAGO_CHECKOUT_ENABLED: 'true',
        PLANO_ALL_STAR_TEMPORADA_CENTAVOS: '',
      }),
    ).toThrow('PLANO_ALL_STAR_TEMPORADA_CENTAVOS')
    expect(() =>
      precosDosPlanos(FUSO, {
        ...ENV_COMPLETO,
        MERCADOPAGO_CHECKOUT_ENABLED: 'true',
        TEMPORADA_FIM: '30/06/2027',
      }),
    ).toThrow('TEMPORADA_FIM')
  })

  it('preço fora de faixa é o mesmo que preço ausente', () => {
    // Um dígito a menos vira R$ 0,59; um a mais vira R$ 5.990,00. Os dois
    // acidentes acontecem digitando env, e nenhum dos dois pode virar
    // cobrança.
    for (const absurdo of ['0', '99', '-5990', '10000001', 'cinquenta', '59,90', '59.90']) {
      expect(
        precosDosPlanos(FUSO, { ...ENV_COMPLETO, PLANO_MVP_MENSAL_CENTAVOS: absurdo }),
      ).toBeNull()
    }
  })

  it('data impossível não vira data rolada para o mês seguinte', () => {
    expect(precosDosPlanos(FUSO, { ...ENV_COMPLETO, TEMPORADA_FIM: '2027-02-31' })).toBeNull()
  })
})

describe('avisoDaTemporada', () => {
  const FIM = new Date('2027-07-01T03:00:00.000Z')

  it('cala enquanto falta mais de trinta dias', () => {
    expect(avisoDaTemporada(FIM, new Date('2027-05-01T12:00:00.000Z'))).toBeNull()
  })

  it('avisa dentro dos trinta dias, com a contagem e o que fazer', () => {
    // De 10/06 12:00Z até 01/07 03:00Z são 20 dias e 15 horas — 21 dias
    // arredondando para cima, que é o que um aviso de prazo deve dizer.
    const aviso = avisoDaTemporada(FIM, new Date('2027-06-10T12:00:00.000Z'))
    expect(aviso).toContain('21 dias')
    expect(aviso).toContain('TEMPORADA_FIM')
  })

  it('no limite de um dia, fala no singular', () => {
    expect(avisoDaTemporada(FIM, new Date('2027-06-30T12:00:00.000Z'))).toContain('1 dia')
  })

  it('depois da data, diz que a temporada já não é oferecida', () => {
    const aviso = avisoDaTemporada(FIM, new Date('2027-07-05T12:00:00.000Z'))
    expect(aviso).toContain('TEMPORADA_FIM')
    expect(aviso).toMatch(/n[ãa]o est[áa] mais/i)
  })

  it('sem configuração de temporada não há o que avisar', () => {
    expect(avisoDaTemporada(null, new Date('2027-06-10T12:00:00.000Z'))).toBeNull()
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/modules/plataforma/assinatura/__tests__/precos.test.ts
```

Esperado: FAIL — `Failed to resolve import "../precos"`.

- [ ] **Step 3: Escreva `precos.ts`**

Crie `src/modules/plataforma/assinatura/precos.ts`:

```ts
import { intervaloDoDia } from '../../dominio/rodada'
import type { Sku } from './sku'
import { SKUS } from './sku'

/**
 * OS PREÇOS — decisão comercial, nunca código (decisão 13 da spec).
 *
 * Mudar preço aqui é mudar env. Um número monetário escrito num componente é
 * defeito: no dia da promoção alguém teria que abrir um `.tsx` e fazer
 * deploy.
 *
 * O fuso entra por ARGUMENTO, e não é detalhe de estilo: `TEMPORADA_FIM` é um
 * DIA ("último dia inclusive"), e um dia só vira instante dentro de um fuso.
 * Quem sabe o fuso é o ruleset, que vive em `entrega/` — camada que
 * `plataforma/` não importa. Então quem lê o ruleset (as rotas e as páginas)
 * passa o fuso para cá.
 */
export type PrecoDoSku = {
  centavos: number
  /** O preço "de", só exibição. Nulo quando não há promoção a mostrar. */
  deCentavos: number | null
}

export type PrecosDosPlanos = {
  porSku: Record<Sku, PrecoDoSku>
  /**
   * O INSTANTE em que a temporada vendida acaba: a meia-noite SEGUINTE ao dia
   * de `TEMPORADA_FIM`, no fuso da rodada. `TEMPORADA_FIM=2027-06-30` quer
   * dizer "o dia 30 inteiro está incluído", e um direito que terminasse
   * 00:00 do dia 30 tiraria o último dia de quem pagou por ele.
   */
  fimDaTemporada: Date
}

const ENV_DO_SKU: Record<Sku, { valor: string; de?: string }> = {
  MVP_MENSAL: { valor: 'PLANO_MVP_MENSAL_CENTAVOS', de: 'PLANO_MVP_MENSAL_DE_CENTAVOS' },
  MVP_TEMPORADA: { valor: 'PLANO_MVP_TEMPORADA_CENTAVOS' },
  ALL_STAR_MENSAL: {
    valor: 'PLANO_ALL_STAR_MENSAL_CENTAVOS',
    de: 'PLANO_ALL_STAR_MENSAL_DE_CENTAVOS',
  },
  ALL_STAR_TEMPORADA: { valor: 'PLANO_ALL_STAR_TEMPORADA_CENTAVOS' },
}

const MINIMO_CENTAVOS = 100
const MAXIMO_CENTAVOS = 10_000_000

/**
 * Só inteiro dentro da faixa. A faixa é a mesma que `configuracaoProdutoPago`
 * já usava: abaixo de R$ 1,00 e acima de R$ 100.000,00 é dedo no teclado, não
 * decisão comercial. `Number('59,90')` e `Number('')` não são inteiros
 * seguros e caem aqui junto.
 */
function centavosLidos(bruto: string | undefined): number | null {
  const numero = Number((bruto ?? '').trim())
  if (!Number.isSafeInteger(numero)) return null
  return numero >= MINIMO_CENTAVOS && numero <= MAXIMO_CENTAVOS ? numero : null
}

function diaLido(bruto: string | undefined, fuso: string): Date | null {
  const dia = (bruto ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const comoUtc = new Date(`${dia}T00:00:00.000Z`)
  // `2027-06-31` casa com a regex e é um dia que não existe. O parser ISO do
  // JS NÃO devolve Invalid Date para essa forma — ele rola em silêncio para o
  // dia seguinte válido (medido: `2027-06-31` vira `2027-07-01`, e
  // `2027-02-31` vira `2027-03-03`). Só mês fora de 01–12 dá Invalid Date.
  // Comparar de volta com o texto original é o que pega o rolamento; sem
  // isso a temporada acabaria num dia que ninguém escolheu — um dia a mais
  // de acesso vendido, e a data escrita na tela divergindo da cobrada.
  if (comoUtc.toISOString().slice(0, 10) !== dia) return null
  return intervaloDoDia(dia, fuso).fim
}

export function precosDosPlanos(
  fuso: string,
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): PrecosDosPlanos | null {
  const faltantes: string[] = []
  const porSku = {} as Record<Sku, PrecoDoSku>

  for (const sku of SKUS) {
    const nomes = ENV_DO_SKU[sku]
    const centavos = centavosLidos(ambiente[nomes.valor])
    if (centavos === null) {
      faltantes.push(nomes.valor)
      continue
    }
    const de = nomes.de ? centavosLidos(ambiente[nomes.de]) : null
    // "De R$ 50,00 por R$ 60,00" é o contrário de uma promoção: o "de" só
    // aparece quando é MAIOR que o preço cobrado.
    porSku[sku] = { centavos, deCentavos: de !== null && de > centavos ? de : null }
  }

  const fimDaTemporada = diaLido(ambiente.TEMPORADA_FIM, fuso)
  if (!fimDaTemporada) faltantes.push('TEMPORADA_FIM')

  if (faltantes.length > 0) {
    // Com o checkout LIGADO, faltar preço é quebrar a venda em silêncio: a
    // tela mostraria plano sem valor, ou pior, cobraria o que não foi
    // decidido. Falha alta. Com o checkout desligado (preview, teste,
    // produção de hoje), não há venda para quebrar — devolver null deixa a
    // página de comparação funcionar sem os preços.
    if (ambiente.MERCADOPAGO_CHECKOUT_ENABLED === 'true') {
      throw new Error(`checkout habilitado com preços incompletos: ${faltantes.join(', ')}`)
    }
    return null
  }

  return { porSku, fimDaTemporada }
}

const TRINTA_DIAS_MS = 30 * 86_400_000

/**
 * O AVISO DE `TEMPORADA_FIM` (spec §14).
 *
 * "Ninguém vai lembrar de mudar em junho" — então o painel lembra. Puro, e
 * `agora` entra por argumento: um texto que dependesse do relógio interno não
 * teria como ser testado nas três fases.
 */
export function avisoDaTemporada(fimDaTemporada: Date | null, agora: Date): string | null {
  if (!fimDaTemporada) return null
  const restanteMs = fimDaTemporada.getTime() - agora.getTime()
  if (restanteMs > TRINTA_DIAS_MS) return null
  if (restanteMs <= 0) {
    return 'A temporada vendida terminou: o pacote de temporada não está mais sendo oferecido no seletor de planos. Atualize TEMPORADA_FIM para vender a próxima.'
  }
  const dias = Math.ceil(restanteMs / 86_400_000)
  return `A temporada vendida termina em ${dias} ${dias === 1 ? 'dia' : 'dias'}. Depois disso o seletor deixa de oferecer o pacote de temporada — atualize TEMPORADA_FIM antes.`
}
```

- [ ] **Step 4: Rode o teste e veja passar**

```
npx vitest run src/modules/plataforma/assinatura/__tests__/precos.test.ts
```

Esperado: PASS, 12 testes.

- [ ] **Step 5: Documente as variáveis em `.env.example`**

Abra `.env.example`. Logo depois da linha `MERCADOPAGO_PLANO_VALOR_CENTAVOS=` (é a **Task 11** que apaga as duas legadas, no fechamento — deixe-as onde estão), acrescente:

```
# Preços dos quatro SKUs, em centavos (spec de planos §10). Obrigatórios quando
# MERCADOPAGO_CHECKOUT_ENABLED=true; sem eles o seletor não mostra preço.
PLANO_MVP_MENSAL_CENTAVOS=5990
PLANO_MVP_MENSAL_DE_CENTAVOS=7990
PLANO_MVP_TEMPORADA_CENTAVOS=39700
PLANO_ALL_STAR_MENSAL_CENTAVOS=9990
PLANO_ALL_STAR_MENSAL_DE_CENTAVOS=14900
PLANO_ALL_STAR_TEMPORADA_CENTAVOS=59700
# Último dia INCLUSIVE da temporada vendida, no fuso da rodada. Passada a
# data, o seletor esconde a modalidade temporada sozinho.
TEMPORADA_FIM=2027-06-30
```

Os `_DE_CENTAVOS` são só exibição ("de R$ 79,90 por R$ 59,90") e podem ficar vazios.

- [ ] **Step 6: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
```

Esperado: tudo limpo. **Não commite.**

---

### Task 3: A porta aprende pagamento único

A temporada não é uma mensalidade com outro número: é uma compra que acontece uma vez. Isso é um segundo caminho na camada anticorrupção — preferência de Checkout Pro na ida, busca de pagamento por referência na volta.

**Files:**
- Modify: `src/modules/plataforma/assinatura/porta.ts`
- Modify: `src/modules/plataforma/assinatura/fake.ts`
- Modify: `src/modules/plataforma/assinatura/mercadopago.ts`
- Test: `src/modules/plataforma/assinatura/__tests__/pagamento-unico.test.ts` (novo)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  ```ts
  // porta.ts
  export type PedidoPagamentoUnico = {
    referenciaExterna: string
    chaveIdempotencia: string
    emailPagador: string
    nomePlano: string
    valorCentavos: number
    moeda: 'BRL'
    urlRetorno: string
  }
  export type PagamentoExterno = {
    id: string
    referenciaExterna: string | null
    urlCheckout: string | null
    ocorridoEm: string | null
  }
  // dentro de PortaCobranca:
  criarPagamentoUnico(pedido: PedidoPagamentoUnico): Promise<PagamentoExterno>
  buscarPagamentoPorReferencia(referenciaExterna: string): Promise<CobrancaExterna | null>

  // fake.ts — a instrumentação que os testes das Tasks 5, 7 e 8 usam:
  readonly preferencias: PedidoPagamentoUnico[]
  readonly cancelamentos: string[]
  registrarPagamento(cobranca: CobrancaExterna): void
  ```
  As Tasks 5, 7 e 8 dependem destes nomes.

**Contexto para quem implementa:**
- `PortaCobranca` já tem `criarAssinatura`, `consultarAssinatura`, `buscarPorReferencia`, `cancelarAssinatura`, `listarCobrancasDaAssinatura`. Os dois métodos novos entram na mesma interface; o fake e o adapter real implementam os dois.
- `CobrancaExterna` já existe em `porta.ts` e é o tipo canônico de "uma cobrança observada no provedor". O pagamento único cabe nele sem campo novo: `assinaturaExternaId` e `proximaCobranca` ficam nulos, e é justamente isso que diz "não tem recorrência".
- O endpoint de criação é `POST https://api.mercadopago.com/checkout/preferences`, com `items`, `external_reference`, `payer.email`, `back_urls` e `auto_return`. A resposta traz `init_point` (produção) e `sandbox_init_point` (teste). O método privado `requisitar` já põe o `Authorization`, o timeout e o `cache: 'no-store'`.
- **Em sandbox, `init_point` aponta para o ambiente de PRODUÇÃO e cobra de verdade.** É o `sandbox_init_point` que abre o ambiente de teste. O adapter já recebe `config.sandbox`.
- A busca é `GET /v1/payments/search?external_reference=<ref>`. O `pagamentoSchema` que ela precisa já existe no arquivo (linha ~61) e já tem `external_reference`, `status`, `transaction_amount`, `currency_id` e as três datas.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/modules/plataforma/assinatura/__tests__/pagamento-unico.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { PagamentoFake } from '../fake'
import { PagamentoMercadoPago } from '../mercadopago'
import type { PedidoPagamentoUnico } from '../porta'

const PEDIDO: PedidoPagamentoUnico = {
  referenciaExterna: 'ref-temporada-1',
  chaveIdempotencia: 'chave-1',
  emailPagador: 'assinante@exemplo.com',
  nomePlano: 'NIP All Star temporada',
  valorCentavos: 59700,
  moeda: 'BRL',
  urlRetorno: 'https://app.example.com/retorno/mercadopago',
}

function adapter(fetchImpl: typeof fetch, sandbox = false) {
  return new PagamentoMercadoPago(
    { accessToken: 'token-de-teste', segredoWebhook: 'segredo', sandbox },
    fetchImpl,
  )
}

describe('criarPagamentoUnico no adapter real', () => {
  it('cria preferência com item, referência, retorno e chave de idempotência', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'pref-1',
        external_reference: 'ref-temporada-1',
        init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1',
        date_created: '2026-10-01T12:00:00.000-03:00',
      }),
    )

    const pagamento = await adapter(fetchMock).criarPagamentoUnico(PEDIDO)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['X-Idempotency-Key']).toBe('chave-1')
    const corpo = JSON.parse(String(init?.body))
    expect(corpo.external_reference).toBe('ref-temporada-1')
    expect(corpo.payer.email).toBe('assinante@exemplo.com')
    expect(corpo.items).toHaveLength(1)
    expect(corpo.items[0].title).toBe('NIP All Star temporada')
    expect(corpo.items[0].quantity).toBe(1)
    expect(corpo.items[0].currency_id).toBe('BRL')
    // Centavos aqui, reais lá: 59700 centavos são R$ 597,00.
    expect(corpo.items[0].unit_price).toBe(597)
    expect(corpo.back_urls.success).toBe('https://app.example.com/retorno/mercadopago')

    expect(pagamento).toEqual({
      id: 'pref-1',
      referenciaExterna: 'ref-temporada-1',
      urlCheckout: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1',
      ocorridoEm: '2026-10-01T12:00:00.000-03:00',
    })
  })

  it('em sandbox usa o init_point de sandbox — o outro cobra de verdade', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'pref-2',
        external_reference: 'ref-temporada-1',
        init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-2',
        sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-2',
        date_created: null,
      }),
    )

    const pagamento = await adapter(fetchMock, true).criarPagamentoUnico(PEDIDO)

    expect(pagamento.urlCheckout).toBe(
      'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-2',
    )
  })
})

describe('buscarPagamentoPorReferencia no adapter real', () => {
  function resposta(resultados: unknown[]) {
    return vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: resultados }))
  }

  const RECUSADO = {
    id: 901,
    status: 'rejected',
    external_reference: 'ref-temporada-1',
    transaction_amount: 597,
    currency_id: 'BRL',
    date_created: '2026-10-01T12:00:00.000-03:00',
    date_last_updated: '2026-10-01T12:00:05.000-03:00',
  }
  const APROVADO = {
    id: 902,
    status: 'approved',
    external_reference: 'ref-temporada-1',
    transaction_amount: 597,
    currency_id: 'BRL',
    date_approved: '2026-10-01T12:10:00.000-03:00',
    date_created: '2026-10-01T12:09:00.000-03:00',
    date_last_updated: '2026-10-01T12:10:00.000-03:00',
  }

  it('busca pela referência e devolve a cobrança canônica, sem recorrência', async () => {
    const fetchMock = resposta([APROVADO])

    const cobranca = await adapter(fetchMock).buscarPagamentoPorReferencia('ref-temporada-1')

    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      '/v1/payments/search?external_reference=ref-temporada-1',
    )
    expect(cobranca).toMatchObject({
      id: '902',
      referenciaExterna: 'ref-temporada-1',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      assinaturaExternaId: null,
      proximaCobranca: null,
    })
  })

  it('com tentativa recusada antes da aprovada, vale a APROVADA', async () => {
    // Cartão recusado e nova tentativa é rotina. Devolver a primeira da lista
    // faria a reconciliação concluir "não pagou" para quem pagou.
    const cobranca = await adapter(resposta([RECUSADO, APROVADO])).buscarPagamentoPorReferencia(
      'ref-temporada-1',
    )
    expect(cobranca?.status).toBe('approved')
  })

  it('sem nenhuma aprovada, devolve a primeira — a tela precisa explicar a recusa', async () => {
    const cobranca = await adapter(resposta([RECUSADO])).buscarPagamentoPorReferencia(
      'ref-temporada-1',
    )
    expect(cobranca?.status).toBe('rejected')
  })

  it('ignora pagamento de outra referência que a busca devolva junto', async () => {
    const outro = { ...APROVADO, id: 903, external_reference: 'ref-de-outra-pessoa' }
    const cobranca = await adapter(resposta([outro])).buscarPagamentoPorReferencia('ref-temporada-1')
    expect(cobranca).toBeNull()
  })

  it('sem resultado, devolve null', async () => {
    expect(await adapter(resposta([])).buscarPagamentoPorReferencia('ref-temporada-1')).toBeNull()
  })
})

describe('PagamentoFake cobre os dois caminhos novos', () => {
  it('registra a preferência criada e devolve URL de checkout', async () => {
    const fake = new PagamentoFake()
    const pagamento = await fake.criarPagamentoUnico(PEDIDO)

    expect(fake.preferencias).toHaveLength(1)
    expect(fake.preferencias[0]?.nomePlano).toBe('NIP All Star temporada')
    expect(pagamento.referenciaExterna).toBe('ref-temporada-1')
    expect(pagamento.urlCheckout).toContain('mercadopago.com.br')
  })

  it('a mesma chave de idempotência devolve a MESMA preferência', async () => {
    const fake = new PagamentoFake()
    const primeira = await fake.criarPagamentoUnico(PEDIDO)
    const segunda = await fake.criarPagamentoUnico(PEDIDO)
    expect(segunda.id).toBe(primeira.id)
  })

  it('só encontra pagamento que o teste tenha registrado', async () => {
    const fake = new PagamentoFake()
    expect(await fake.buscarPagamentoPorReferencia('ref-temporada-1')).toBeNull()

    fake.registrarPagamento({
      id: 'pay-temporada-1',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-temporada-1',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: '2026-10-01T15:10:00.000Z',
      proximaCobranca: null,
    })

    expect(await fake.buscarPagamentoPorReferencia('ref-temporada-1')).toMatchObject({
      id: 'pay-temporada-1',
      status: 'approved',
    })
  })

  it('cancelarAssinatura fica registrado — é o que prova o cancelamento do upgrade', async () => {
    const fake = new PagamentoFake()
    await fake.criarAssinatura({
      referenciaExterna: 'ref-mensal-1',
      chaveIdempotencia: 'chave-mensal',
      emailPagador: 'assinante@exemplo.com',
      nomePlano: 'NIP MVP mensal',
      valorCentavos: 5990,
      moeda: 'BRL',
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })

    await fake.cancelarAssinatura('fake-ref-mensal-1', 'chave-cancelar')

    expect(fake.cancelamentos).toEqual(['fake-ref-mensal-1'])
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/modules/plataforma/assinatura/__tests__/pagamento-unico.test.ts
```

Esperado: FAIL — `criarPagamentoUnico is not a function` / erro de tipo em `PedidoPagamentoUnico`.

- [ ] **Step 3: Acrescente os tipos e a interface em `porta.ts`**

Depois de `PedidoCriacaoAssinatura` (por volta da linha 50), acrescente:

```ts
/**
 * A COMPRA QUE ACONTECE UMA VEZ — a temporada (spec §9).
 *
 * Quase igual ao pedido de assinatura, menos os dois campos que só existem
 * em recorrência (`frequencia`, `tipoFrequencia`). Separar os tipos em vez de
 * tornar os dois campos opcionais é o que faz o compilador cobrar a
 * frequência de quem cria `preapproval` e nunca cobrá-la de quem não tem
 * recorrência nenhuma.
 *
 * Sem `nivelDoPlano` de propósito (ruling R-B1): o provedor não tem conceito
 * de nível da NIP. O nível viaja em `nomePlano`, que é o que o comprador vê
 * na fatura, e canonicamente na `tentativas_checkout`, que é de onde o
 * webhook lê.
 */
export type PedidoPagamentoUnico = {
  referenciaExterna: string
  chaveIdempotencia: string
  emailPagador: string
  nomePlano: string
  valorCentavos: number
  moeda: 'BRL'
  urlRetorno: string
}

/**
 * O que volta de criar uma intenção de pagamento único.
 *
 * `id` é o da PREFERÊNCIA, não o do pagamento: o pagamento só nasce quando
 * alguém paga, e o id dele chega pelo webhook. Por isso não há `status` aqui
 * — preferência não tem estado de cobrança, e um campo `status` convidaria
 * alguém a liberar acesso pela ida em vez de pela confirmação.
 */
export type PagamentoExterno = {
  id: string
  referenciaExterna: string | null
  urlCheckout: string | null
  ocorridoEm: string | null
}
```

E dentro de `PortaCobranca`, depois de `listarCobrancasDaAssinatura`:

```ts
  criarPagamentoUnico(pedido: PedidoPagamentoUnico): Promise<PagamentoExterno>
  /**
   * A volta do pagamento único. A busca é POR REFERÊNCIA e não por id porque
   * o id que a NIP guardou é o da preferência — o do pagamento ela só vai
   * conhecer pelo webhook, e a reconciliação existe justamente para o caso em
   * que o webhook não chegou.
   */
  buscarPagamentoPorReferencia(referenciaExterna: string): Promise<CobrancaExterna | null>
```

- [ ] **Step 4: Implemente no adapter real**

Em `mercadopago.ts`, junto dos outros schemas (depois de `faturaSchema`, por volta da linha 94):

```ts
const preferenciaSchema = z
  .object({
    id: idSchema,
    external_reference: idSchema.nullish(),
    init_point: z.string().url().nullish(),
    sandbox_init_point: z.string().url().nullish(),
    date_created: dataIso,
  })
  .passthrough()

const buscaPagamentosSchema = z.object({ results: z.array(pagamentoSchema) }).passthrough()
```

Junto de `faturaCanonica` (por volta da linha 129):

```ts
function preferenciaCanonica(bruto: unknown, sandbox: boolean): PagamentoExterno {
  const recurso = preferenciaSchema.parse(bruto)
  return {
    id: recurso.id,
    referenciaExterna: textoOuNulo(recurso.external_reference),
    // Em sandbox, `init_point` aponta para a PRODUÇÃO e cobra de verdade —
    // mandar o testador para lá é cobrar cartão real num teste.
    urlCheckout: (sandbox ? recurso.sandbox_init_point : recurso.init_point) ?? null,
    ocorridoEm: recurso.date_created ?? null,
  }
}

// Recebe o item JÁ PARSEADO, não `unknown`: `buscaPagamentosSchema` roda
// `pagamentoSchema` sobre cada item de `results`, e `dinheiroSchema` já
// multiplicou o valor por 100 ali. Re-parsear aqui multiplicaria de novo —
// R$ 597,00 viraria R$ 59.700,00 na tabela de cobranças.
function pagamentoCanonico(recurso: z.infer<typeof pagamentoSchema>): CobrancaExterna {
  return {
    id: recurso.id,
    assinaturaExternaId: textoOuNulo(recurso.preapproval_id),
    referenciaExterna: textoOuNulo(recurso.external_reference),
    status: recurso.status,
    valorCentavos: recurso.transaction_amount ?? null,
    moeda: recurso.currency_id ?? null,
    ocorridoEm: recurso.date_last_updated ?? recurso.date_approved ?? recurso.date_created ?? null,
    // Pagamento único não tem próxima: é o que diz ao webhook que a validade
    // vem de TEMPORADA_FIM, e não do provedor.
    proximaCobranca: null,
  }
}
```

Acrescente `PagamentoExterno` e `PedidoPagamentoUnico` ao `import type { ... } from './porta'` no topo do arquivo.

Dentro da classe `PagamentoMercadoPago`, depois de `listarCobrancasDaAssinatura` (por volta da linha 246):

```ts
  async criarPagamentoUnico(pedido: PedidoPagamentoUnico): Promise<PagamentoExterno> {
    const bruto = await this.requisitar('/checkout/preferences', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': pedido.chaveIdempotencia },
      body: JSON.stringify({
        external_reference: pedido.referenciaExterna,
        payer: { email: pedido.emailPagador },
        items: [
          {
            id: pedido.referenciaExterna,
            title: pedido.nomePlano,
            quantity: 1,
            currency_id: pedido.moeda,
            unit_price: pedido.valorCentavos / 100,
          },
        ],
        // Os três destinos são a MESMA tela: ela não concede nada, só explica
        // que a confirmação vem do servidor (princípio da Spec 04). Mandar
        // sucesso e falha para telas diferentes seria decidir pelo navegador
        // o que só o webhook decide.
        back_urls: {
          success: pedido.urlRetorno,
          pending: pedido.urlRetorno,
          failure: pedido.urlRetorno,
        },
        auto_return: 'approved',
      }),
    })
    return preferenciaCanonica(bruto, this.config.sandbox)
  }

  async buscarPagamentoPorReferencia(referenciaExterna: string): Promise<CobrancaExterna | null> {
    const bruto = await this.requisitar(
      `/v1/payments/search?external_reference=${encodeURIComponent(referenciaExterna)}&limit=50`,
    )
    const resultados = buscaPagamentosSchema
      .parse(bruto)
      .results.filter((item) => textoOuNulo(item.external_reference) === referenciaExterna)
    // Uma referência pode ter VÁRIOS pagamentos: o cartão recusa, a pessoa
    // tenta de novo. Vale o aprovado; sem nenhum aprovado, o primeiro, que é
    // o que a tela precisa para explicar a recusa.
    const aprovado = resultados.find((item) => item.status === 'approved')
    const escolhido = aprovado ?? resultados[0]
    return escolhido ? pagamentoCanonico(escolhido) : null
  }
```

- [ ] **Step 5: Implemente no fake**

Em `fake.ts`, acrescente ao import de tipos `PagamentoExterno` e `PedidoPagamentoUnico`, e à classe:

```ts
  readonly preferencias: PedidoPagamentoUnico[] = []
  readonly cancelamentos: string[] = []
  private readonly pagamentos = new Map<string, CobrancaExterna>()
  private readonly preferenciasPorChave = new Map<string, PagamentoExterno>()

  async criarPagamentoUnico(pedido: PedidoPagamentoUnico): Promise<PagamentoExterno> {
    // A chave de idempotência é o contrato do provedor: repetir o POST com a
    // mesma chave devolve a MESMA preferência. O fake honra isso porque o
    // checkout conta com ele — é assim que uma tentativa retomada não abre
    // uma segunda cobrança.
    const jaCriada = this.preferenciasPorChave.get(pedido.chaveIdempotencia)
    if (jaCriada) return jaCriada
    this.preferencias.push(pedido)
    const preferencia: PagamentoExterno = {
      id: `fake-pref-${pedido.referenciaExterna}`,
      referenciaExterna: pedido.referenciaExterna,
      urlCheckout: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fake-pref-${pedido.referenciaExterna}`,
      ocorridoEm: null,
    }
    this.preferenciasPorChave.set(pedido.chaveIdempotencia, preferencia)
    return preferencia
  }

  async buscarPagamentoPorReferencia(referenciaExterna: string): Promise<CobrancaExterna | null> {
    return this.pagamentos.get(referenciaExterna) ?? null
  }

  /** Só para teste: diz que ALGUÉM pagou esta referência lá no provedor. */
  registrarPagamento(cobranca: CobrancaExterna): void {
    if (cobranca.referenciaExterna) this.pagamentos.set(cobranca.referenciaExterna, cobranca)
  }
```

E dentro de `cancelarAssinatura`, como primeira linha do corpo, `this.cancelamentos.push(id)`.

- [ ] **Step 6: Rode o teste e veja passar**

```
npx vitest run src/modules/plataforma/assinatura/__tests__/pagamento-unico.test.ts
```

Esperado: PASS, 12 testes.

- [ ] **Step 7: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
npx vitest run src/modules/plataforma/__tests__/pagamento-estabilizacao.test.ts src/modules/plataforma/__tests__/spec04.test.ts
```

Esperado: tudo verde. As suítes antigas usam `PagamentoFake` e `PagamentoMercadoPago` e não podem ter quebrado — métodos novos numa interface não mudam quem já a usava. **Não commite.**

---

### Task 4: A tentativa guarda o SKU

Quando o webhook chega, o único elo entre o dinheiro e a NIP é a `referencia_externa`. Hoje ela diz de QUEM é a compra; a partir daqui ela diz também O QUE foi comprado.

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts` (tabela `tentativasCheckout`, por volta da linha 234)
- Create (gerados): `drizzle/0028_<nome-gerado>.sql`, `drizzle/down/0028_<nome-gerado>.sql`, entrada em `drizzle/meta/_journal.json`
- Test: `src/modules/dominio/__tests__/persistencia.test.ts` (acrescentar um `it`)

**Interfaces:**
- Produces: as colunas `tentativasCheckout.nivelDoPlano` (`text('nivel_do_plano').notNull()`) e `tentativasCheckout.modalidade` (`text('modalidade').notNull()`). As Tasks 5, 6 e 8 leem e escrevem nelas.

**Contexto — a armadilha do journal (leia antes de gerar):**
`drizzle-kit migrate` (produção) lê `drizzle/meta/_journal.json`; o arnês de teste `ajuda-banco.ts` lê a PASTA com `readdirSync`. Uma migration escrita à mão passa nos testes e é invisível em produção. Esse defeito já aconteceu neste repositório (migration `0026`, corrigida em 16/09). **Não escreva SQL à mão. Use `npm run db:generate`.**

**Contexto — o prompt do drizzle-kit:**
**Medido em 18/09, corrigindo o que este plano dizia antes:** o `drizzle-kit generate` desta instalação (0.31.10) **não pergunta nada** ao acrescentar coluna `NOT NULL` — ele emite direto `ADD COLUMN ... NOT NULL`, achatado, sem default. O prompt de preenchimento só existe no caminho do `push`, que conecta no banco. O aviso do `generate` sobre rename é outro assunto.

Isso importa porque `ADD COLUMN ... NOT NULL` sem default **é recusado pelo Postgres numa tabela com linhas**. A `0027` não tem esse problema porque saiu no padrão `ADD COLUMN ... DEFAULT '<valor>' NOT NULL` seguido de `ALTER COLUMN ... DROP DEFAULT`, que funciona com a tabela vazia ou cheia.

Para chegar nesse padrão sem escrever SQL à mão — que é o que reabriria a armadilha do journal — gere DUAS vezes e junte o resultado:

1. Ponha `.default('MVP')` e `.default('MENSAL')` temporariamente nas colunas do schema e rode `npm run db:generate`. Sai o `ADD COLUMN ... DEFAULT ... NOT NULL`.
2. Tire os dois `.default(...)` do schema e rode `npm run db:generate` de novo. Sai o `ALTER COLUMN ... DROP DEFAULT`.
3. Junte os dois arquivos `.sql` num só (a ordem é a da `0027`: cada `ADD COLUMN` seguido do seu `DROP DEFAULT`, e os `CHECK` no fim), deixe só a entrada mais recente no journal e só o snapshot final em `drizzle/meta/`.

Depois valide que o metadado ficou coerente — e **isto não é opcional**, é o que substitui a leitura à mão:

```
npx drizzle-kit check
npx drizzle-kit generate
```

O primeiro tem que dizer "Everything's fine"; o segundo, "No schema changes, nothing to migrate" **sem criar arquivo novo**. Se o segundo gerar uma `0029`, o snapshot não reflete o schema: apague o que ele criou e refaça.

Em produção a tabela está vazia (o checkout nunca esteve ligado), então o valor de preenchimento não alcança nenhuma compra real — ele existe para o `NOT NULL` poder entrar em qualquer banco, inclusive num preview com linhas.

- [ ] **Step 1: Escreva o teste que falha**

Em `src/modules/dominio/__tests__/persistencia.test.ts`, acrescente ao final do arquivo (ajuste o nome do helper de banco ao que o arquivo já usa — ele já tem um `bancoDeTeste` no escopo):

```ts
describe('tentativas_checkout guarda o SKU comprado', () => {
  it('aceita os quatro pares e recusa nível ou modalidade fora da lista', async () => {
    // Insert direto, sem `adicionarUsuario`: esta suíte é de `dominio/`, e
    // nenhum teste desta camada importa de `plataforma/` hoje. O que está
    // sob prova é o CHECK da coluna, não o cadastro.
    const [usuario] = await banco.db
      .insert(usuarios)
      .values({ email: 'sku@exemplo.com', senhaHash: 'x', nome: 'SKU' })
      .returning({ id: usuarios.id })
    const usuarioId = usuario!.id

    const base = {
      usuarioId,
      produto: 'NBA_PRO',
      provedor: 'fake',
      status: 'CRIANDO' as const,
      atualizadoEm: new Date('2026-10-01T12:00:00.000Z'),
    }

    // As colunas são `text` — o que impede lixo é o CHECK, não o TypeScript,
    // porque o valor chega de formulário e atravessa uma conversão de tipo.
    await expect(
      banco.db.insert(tentativasCheckout).values({
        ...base,
        referenciaExterna: 'ref-invalida',
        chaveIdempotencia: 'chave-invalida',
        nivelDoPlano: 'GRATIS',
        modalidade: 'MENSAL',
      }),
    ).rejects.toThrow()

    await expect(
      banco.db.insert(tentativasCheckout).values({
        ...base,
        referenciaExterna: 'ref-invalida-2',
        chaveIdempotencia: 'chave-invalida-2',
        nivelDoPlano: 'MVP',
        modalidade: 'ANUAL',
      }),
    ).rejects.toThrow()

    // Um par válido por vez: o índice único parcial só deixa UMA tentativa
    // aberta por usuário e produto, então cada inserção encerra a anterior.
    for (const [indice, par] of (
      [
        ['MVP', 'MENSAL'],
        ['MVP', 'TEMPORADA'],
        ['ALL_STAR', 'MENSAL'],
        ['ALL_STAR', 'TEMPORADA'],
      ] as const
    ).entries()) {
      await banco.db
        .update(tentativasCheckout)
        .set({ status: 'ENCERRADA' })
        .where(eq(tentativasCheckout.usuarioId, usuarioId))
      await banco.db.insert(tentativasCheckout).values({
        ...base,
        referenciaExterna: `ref-valida-${indice}`,
        chaveIdempotencia: `chave-valida-${indice}`,
        nivelDoPlano: par[0],
        modalidade: par[1],
      })
    }

    const linhas = await banco.db
      .select()
      .from(tentativasCheckout)
      .where(eq(tentativasCheckout.usuarioId, usuarioId))
    expect(linhas).toHaveLength(4)
  })
})
```

Importe `tentativasCheckout` e `usuarios` do schema se o arquivo ainda não os importar. **Não** importe de `src/modules/plataforma/` — seria a primeira dependência de `dominio/` para `plataforma/` no repositório.

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/modules/dominio/__tests__/persistencia.test.ts
```

Esperado: FAIL — o objeto passado a `.values()` tem propriedades que não existem no tipo, e em tempo de execução a coluna `nivel_do_plano` não existe na tabela.

- [ ] **Step 3: Acrescente as colunas ao schema**

Em `src/modules/dominio/db/schema/plataforma.ts`, na tabela `tentativasCheckout`, depois de `provedor`:

```ts
    /**
     * O QUE ESTA TENTATIVA ESTÁ COMPRANDO.
     *
     * Gravado ANTES da rede, junto da referência opaca, e é daqui que o
     * webhook lê o nível e a modalidade a conceder — o provedor não tem
     * conceito de plano da NIP e devolve só a referência. Sem estas duas
     * colunas, um pagamento aprovado não teria como dizer QUAL plano foi
     * pago, e o nível viria de uma constante, que é o que o Plano A fazia
     * enquanto só existia um SKU.
     */
    nivelDoPlano: text('nivel_do_plano').notNull(),
    modalidade: text('modalidade').notNull(),
```

E na lista de constraints (o array `(t) => [...]`), depois do `check` de status:

```ts
    check(
      'tentativas_checkout_nivel_do_plano_valido',
      sql`${t.nivelDoPlano} in ('MVP', 'ALL_STAR')`,
    ),
    check('tentativas_checkout_modalidade_valida', sql`${t.modalidade} in ('MENSAL', 'TEMPORADA')`),
```

`check`, `sql` e `text` já estão importados no arquivo.

- [ ] **Step 4: Gere a migration**

Siga o procedimento de duas gerações descrito no bloco de contexto acima (com `.default(...)` temporário, depois sem), junte os dois `.sql` num só e deixe journal e snapshot com a entrada final. Nunca escreva o `.sql` à mão.

- [ ] **Step 5: Confira que a migration está de verdade no journal**

```
ls drizzle/0028_*.sql drizzle/down/0028_*.sql
grep -c "DROP DEFAULT" drizzle/0028_*.sql
grep 0028 drizzle/meta/_journal.json
npx drizzle-kit check
npx drizzle-kit generate
```

Esperado: os dois arquivos existem, `2` ocorrências de `DROP DEFAULT`, e uma entrada `"tag": "0028_..."` no journal. **Se o journal não tiver a entrada, a migration não vai para produção** — apague os arquivos e gere de novo pelo comando, nunca à mão.

- [ ] **Step 6: Rode o teste e veja passar**

```
npx vitest run src/modules/dominio/__tests__/persistencia.test.ts
```

Esperado: PASS.

- [ ] **Step 7: Prove que sobe, desce e sobe**

O arnês `bancoDeTeste` expõe `subir`, `descer` e `contarTabelas`. A suíte de persistência já tem um teste de ida e volta de migrations; rode a suíte inteira:

```
npx vitest run src/modules/dominio/__tests__
```

Esperado: PASS. Se o teste de ida e volta não existir nesse arquivo, procure-o com `grep -rln "descer()" src` e rode a suíte que o contém.

- [ ] **Step 8: Faça o único insert existente compilar**

Colunas `NOT NULL` novas quebram quem insere. Há exatamente um insert em `tentativas_checkout`, em `src/modules/plataforma/assinatura/checkout.ts:194`. Acrescente as duas chaves usando as constantes do checkout legado, que ainda existem em `configuracao.ts` e já estão importadas nesse arquivo:

```ts
      .values({
        usuarioId: usuario.id,
        produto: PRODUTO_PAGO,
        provedor: porta.nome,
        referenciaExterna: referencia,
        chaveIdempotencia: randomUUID(),
        nivelDoPlano: NIVEL_DO_CHECKOUT_LEGADO,
        modalidade: MODALIDADE_DO_CHECKOUT_LEGADO,
        status: 'CRIANDO',
        leaseExpiraEm: new Date(entrada.agora.getTime() + LEASE_CHECKOUT_MS),
        atualizadoEm: entrada.agora,
      })
```

É a mesma ponte provisória que o Plano A usou para `assinaturas` e `direitos_acesso`: enquanto só existe um SKU, ele é o de entrada. A Task 5 troca as duas constantes pelo SKU escolhido e as apaga.

- [ ] **Step 9: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
npx vitest run src/modules/plataforma/__tests__/spec04.test.ts src/modules/dominio/__tests__
```

Esperado: tudo verde. **Não commite.**

---

### Task 5: O checkout dos quatro SKUs

Dois caminhos de ida: mensal continua sendo `preapproval`, temporada vira preferência. E uma regra que só existe porque agora há mais de um produto: trocar de SKU encerra a tentativa anterior, em vez de reaproveitar a URL do plano errado.

**Files:**
- Modify: `src/modules/plataforma/assinatura/checkout.ts`
- Modify: `src/modules/plataforma/assinatura/configuracao.ts`
- Modify: `src/app/(app)/assinar/acoes.ts`
- Modify: `src/app/(app)/assinar/page.tsx` (só apaga o bloco do checkout de um SKU só — ver ruling R-B7)
- Modify: `scripts/mp-conferir.ts`
- Test: `src/modules/plataforma/__tests__/spec04.test.ts` (adaptar) e `src/modules/plataforma/__tests__/checkout-sku.test.ts` (novo)

**Interfaces:**
- Consumes: de `./sku` — `type Sku`, `composicaoDoSku`, `NOME_DO_SKU`, `ehSku`. De `./precos` — `type PrecosDosPlanos`, `precosDosPlanos`.
- Produces:
  ```ts
  export async function iniciarCheckout(
    db: Db,
    porta: PortaCobranca,
    config: ConfiguracaoProdutoPago,
    precos: PrecosDosPlanos,
    entrada: { usuarioId: string; sku: Sku; ip: string | null; agora: Date },
  ): Promise<ResultadoCheckout>
  // `ConfiguracaoProdutoPago` perde `nomePlano` e `valorCentavos`.
  // `contratar(formulario: FormData): Promise<void>` — a server action lê o campo `sku`.
  ```
  A Task 9 chama `contratar` a partir do formulário do seletor.

**O que NÃO muda, e é de propósito:** a referência opaca continua nascendo antes da rede; o lease de 30s, o rate limit de `CHECKOUT` e a checagem de origem continuam iguais; `urlCheckoutSegura` continua sendo a allowlist de host — a URL da preferência passa por ela como a do `preapproval` passa.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/modules/plataforma/__tests__/checkout-sku.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  tentativasCheckout,
  tentativasOperacaoConta,
  usuarios,
} from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { iniciarCheckout } from '../assinatura/checkout'
import type { ConfiguracaoProdutoPago } from '../assinatura/configuracao'
import { PagamentoFake } from '../assinatura/fake'
import type { PrecosDosPlanos } from '../assinatura/precos'

const AGORA = new Date('2026-10-01T12:00:00.000Z')

const config: ConfiguracaoProdutoPago = {
  checkoutHabilitado: true,
  cadastroPublicoHabilitado: true,
  frequencia: 1,
  tipoFrequencia: 'months',
  moeda: 'BRL',
  urlPublica: 'https://app.example.com',
  hostsPermitidos: new Set(['app.example.com']),
}

const precos: PrecosDosPlanos = {
  porSku: {
    MVP_MENSAL: { centavos: 5990, deCentavos: 7990 },
    MVP_TEMPORADA: { centavos: 39700, deCentavos: null },
    ALL_STAR_MENSAL: { centavos: 9990, deCentavos: 14900 },
    ALL_STAR_TEMPORADA: { centavos: 59700, deCentavos: null },
  },
  fimDaTemporada: new Date('2027-07-01T03:00:00.000Z'),
}

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})
beforeEach(async () => {
  await banco.db.delete(tentativasOperacaoConta)
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(assinaturas)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'comprador@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Comprador',
    })
  ).id
})

async function comprar(sku: Parameters<typeof iniciarCheckout>[4]['sku'], porta = new PagamentoFake()) {
  const resultado = await iniciarCheckout(banco.db, porta, config, precos, {
    usuarioId,
    sku,
    ip: '203.0.113.10',
    agora: AGORA,
  })
  return { porta, resultado }
}

async function tentativaAberta() {
  const linhas = await banco.db
    .select()
    .from(tentativasCheckout)
    .where(eq(tentativasCheckout.usuarioId, usuarioId))
  return linhas.filter((linha) => linha.status !== 'ENCERRADA')
}

describe('mensal, um preapproval por nível', () => {
  it('manda o nome e o preço do SKU escolhido, e grava o SKU na tentativa', async () => {
    const { porta } = await comprar('ALL_STAR_MENSAL')

    expect(porta.criacoes).toHaveLength(1)
    expect(porta.criacoes[0]).toMatchObject({
      nomePlano: 'NIP All Star mensal',
      valorCentavos: 9990,
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })
    const [tentativa] = await tentativaAberta()
    expect(tentativa).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'MENSAL' })
  })

  it('o contrato espelhado nasce com o mesmo SKU da tentativa', async () => {
    await comprar('MVP_MENSAL')
    const [assinatura] = await banco.db.select().from(assinaturas)
    expect(assinatura).toMatchObject({ nivelDoPlano: 'MVP', modalidade: 'MENSAL' })
  })

  it('o preço vem de `precos`, nunca de um número no código', async () => {
    const outros: PrecosDosPlanos = {
      ...precos,
      porSku: { ...precos.porSku, MVP_MENSAL: { centavos: 100, deCentavos: null } },
    }
    const porta = new PagamentoFake()
    await iniciarCheckout(banco.db, porta, config, outros, {
      usuarioId,
      sku: 'MVP_MENSAL',
      ip: null,
      agora: AGORA,
    })
    expect(porta.criacoes[0]?.valorCentavos).toBe(100)
  })
})

describe('temporada, pagamento único', () => {
  it('cria preferência com o preço da temporada e NÃO cria contrato', async () => {
    const { porta, resultado } = await comprar('MVP_TEMPORADA')

    expect(porta.preferencias).toHaveLength(1)
    expect(porta.preferencias[0]).toMatchObject({
      nomePlano: 'NIP MVP temporada',
      valorCentavos: 39700,
    })
    expect(porta.criacoes).toHaveLength(0)
    // Preferência não é contrato: ninguém pagou. A linha de `assinaturas`
    // nasce no webhook, na aprovação.
    expect(await banco.db.select().from(assinaturas)).toHaveLength(0)
    expect(resultado.status).toBe('PRONTO')
  })

  it('guarda o id da preferência e a URL na tentativa', async () => {
    await comprar('ALL_STAR_TEMPORADA')
    const [tentativa] = await tentativaAberta()
    expect(tentativa).toMatchObject({
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
      status: 'CRIADA',
    })
    expect(tentativa?.assinaturaExternaId).toContain('fake-pref-')
    expect(tentativa?.urlCheckout).toContain('mercadopago.com.br')
  })

  it('retomar a mesma tentativa não abre uma segunda cobrança', async () => {
    const porta = new PagamentoFake()
    await comprar('MVP_TEMPORADA', porta)
    // Força a retomada: a tentativa volta a AMBIGUA, como depois de um
    // timeout de rede.
    await banco.db
      .update(tentativasCheckout)
      .set({ status: 'AMBIGUA', urlCheckout: null, leaseExpiraEm: null })
      .where(eq(tentativasCheckout.usuarioId, usuarioId))

    await iniciarCheckout(banco.db, porta, config, precos, {
      usuarioId,
      sku: 'MVP_TEMPORADA',
      ip: null,
      agora: new Date(AGORA.getTime() + 120_000),
    })

    // O fake honra a chave de idempotência, como o provedor: a segunda
    // chamada devolve a MESMA preferência.
    expect(porta.preferencias).toHaveLength(1)
    expect(await tentativaAberta()).toHaveLength(1)
  })
})

describe('trocar de SKU', () => {
  it('encerra a tentativa do SKU antigo e abre uma nova, com outra referência', async () => {
    const porta = new PagamentoFake()
    await comprar('MVP_MENSAL', porta)
    const [antes] = await tentativaAberta()

    await iniciarCheckout(banco.db, porta, config, precos, {
      usuarioId,
      sku: 'ALL_STAR_TEMPORADA',
      ip: null,
      agora: new Date(AGORA.getTime() + 60_000),
    })

    const abertas = await tentativaAberta()
    expect(abertas).toHaveLength(1)
    expect(abertas[0]?.modalidade).toBe('TEMPORADA')
    expect(abertas[0]?.nivelDoPlano).toBe('ALL_STAR')
    // Referência nova: a antiga já está no provedor amarrada ao plano antigo.
    expect(abertas[0]?.referenciaExterna).not.toBe(antes?.referenciaExterna)

    const todas = await banco.db
      .select()
      .from(tentativasCheckout)
      .where(eq(tentativasCheckout.usuarioId, usuarioId))
    expect(todas.filter((linha) => linha.status === 'ENCERRADA')).toHaveLength(1)
  })

  it('o MESMO SKU reaproveita a URL já criada, como antes', async () => {
    const porta = new PagamentoFake()
    const primeira = await comprar('MVP_MENSAL', porta)
    const segunda = await iniciarCheckout(banco.db, porta, config, precos, {
      usuarioId,
      sku: 'MVP_MENSAL',
      ip: null,
      agora: new Date(AGORA.getTime() + 60_000),
    })

    expect(porta.criacoes).toHaveLength(1)
    expect(segunda).toMatchObject({ status: 'PRONTO', reutilizada: true })
    if (primeira.resultado.status === 'PRONTO' && segunda.status === 'PRONTO') {
      expect(segunda.url).toBe(primeira.resultado.url)
    }
  })

  it('com criação em voo, trocar de SKU espera — não encerra o que está na rede', async () => {
    const porta = new PagamentoFake()
    await comprar('MVP_MENSAL', porta)
    // Simula o instante em que o POST ao provedor ainda não voltou.
    await banco.db
      .update(tentativasCheckout)
      .set({
        status: 'CRIANDO',
        urlCheckout: null,
        leaseExpiraEm: new Date(AGORA.getTime() + 30_000),
      })
      .where(eq(tentativasCheckout.usuarioId, usuarioId))

    const resultado = await iniciarCheckout(banco.db, porta, config, precos, {
      usuarioId,
      sku: 'ALL_STAR_MENSAL',
      ip: null,
      agora: new Date(AGORA.getTime() + 1_000),
    })

    expect(resultado.status).toBe('PROCESSANDO')
    const abertas = await tentativaAberta()
    expect(abertas).toHaveLength(1)
    expect(abertas[0]?.nivelDoPlano).toBe('MVP')
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/modules/plataforma/__tests__/checkout-sku.test.ts
```

Esperado: FAIL — `iniciarCheckout` recebe quatro argumentos, não cinco; `ConfiguracaoProdutoPago` ainda exige `nomePlano` e `valorCentavos`.

- [ ] **Step 3: Enxugue `configuracao.ts`**

Apague de `ConfiguracaoProdutoPago` os campos `nomePlano: string` e `valorCentavos: number`. Em `configuracaoProdutoPago`, apague as linhas que leem `MERCADOPAGO_PLANO_NOME` e `MERCADOPAGO_PLANO_VALOR_CENTAVOS`, as duas entradas correspondentes em `faltantes`, e as duas chaves no objeto devolvido. `APP_PUBLIC_URL` continua obrigatório com o checkout ligado.

O bloco de `faltantes` fica assim:

```ts
  const faltantes: string[] = []
  if (!urlPublicaBruta) faltantes.push('APP_PUBLIC_URL')

  // Os PREÇOS saíram daqui: `precosDosPlanos` (precos.ts) valida os quatro
  // SKUs e a data da temporada, com a mesma regra de falhar alto quando o
  // checkout está ligado. Um preço só vivia aqui quando havia um plano só.
  if (checkoutHabilitado && faltantes.length > 0) {
    throw new Error(`checkout habilitado com configuração incompleta: ${faltantes.join(', ')}`)
  }
```

**Mantenha** `NIVEL_DO_CHECKOUT_LEGADO` e `MODALIDADE_DO_CHECKOUT_LEGADO` por enquanto: `webhook.ts` ainda as usa e é a Task 6 que as apaga. Troque o comentário delas para dizer que agora só o webhook as usa, até a Task 6.

- [ ] **Step 4: Reescreva `iniciarCheckout`**

Em `checkout.ts`, acrescente aos imports:

```ts
import type { PrecosDosPlanos } from './precos'
import { composicaoDoSku, NOME_DO_SKU, type Sku } from './sku'
```

`persistirAssinaturaCriada` passa a gravar o SKU — no insert e **também no conflito**, que é o defeito documentado no Plano A ("o `onConflictDoUpdate` atualiza o nível mas não a modalidade"). Nas `values`, depois de `plano:`:

```ts
        nivelDoPlano: tentativa.nivelDoPlano,
        modalidade: tentativa.modalidade,
```

E dentro do `set` do `onConflictDoUpdate`, as mesmas duas linhas. A tentativa é a fonte: é ela que sabe o que foi escolhido.

Acrescente, logo depois de `persistirAssinaturaCriada`:

```ts
/**
 * A TEMPORADA NÃO ESPELHA CONTRATO AQUI.
 *
 * Preferência não é contrato: ninguém pagou. Uma linha em `assinaturas` neste
 * ponto faria a tela da conta anunciar assinatura para quem só abriu a página
 * do Mercado Pago e fechou. O contrato da temporada nasce no webhook, na
 * aprovação — e nasce com `mercadopago_id` nulo, porque não existe
 * `preapproval` correspondente (ruling R-B4).
 */
async function persistirPreferenciaCriada(
  db: Db,
  tentativa: typeof tentativasCheckout.$inferSelect,
  preferencia: PagamentoExterno,
  agora: Date,
): Promise<string> {
  if (preferencia.referenciaExterna !== tentativa.referenciaExterna) {
    throw new Error('preferência retornou referência divergente')
  }
  const url = urlCheckoutSegura(preferencia.urlCheckout)
  await db
    .update(tentativasCheckout)
    .set({
      status: 'CRIADA',
      assinaturaExternaId: preferencia.id,
      urlCheckout: url,
      leaseExpiraEm: null,
      erroCodigo: null,
      atualizadoEm: agora,
    })
    .where(eq(tentativasCheckout.id, tentativa.id))
  return url
}
```

Acrescente `PagamentoExterno` ao `import type { ... } from './porta'`.

Na assinatura de `iniciarCheckout`, entre `config` e `entrada`, entra `precos: PrecosDosPlanos`, e `entrada` ganha `sku: Sku`.

Dentro da transação de reserva, substitua o trecho que decide o que fazer com `existente` por:

```ts
    const { nivelDoPlano, modalidade } = composicaoDoSku(entrada.sku)

    // Uma criação EM VOO não é interrompida nem quando a pessoa muda de
    // ideia: o POST que está na rede vai voltar e gravar a URL. Encerrar a
    // tentativa agora deixaria duas abertas quando ele voltasse, e o índice
    // único parcial (uma tentativa aberta por usuário e produto) recusaria a
    // segunda. Trinta segundos e ela tenta de novo.
    if (
      existente?.status === 'CRIANDO' &&
      existente.leaseExpiraEm &&
      existente.leaseExpiraEm > entrada.agora
    ) {
      return { tentativa: existente, email: usuario.email, processando: true as const }
    }

    const mesmoSku =
      existente !== undefined &&
      existente.nivelDoPlano === nivelDoPlano &&
      existente.modalidade === modalidade

    // Trocar de SKU não reaproveita nada: a referência antiga já está no
    // provedor amarrada ao plano antigo, e devolver aquela URL cobraria o
    // plano que a pessoa acabou de descartar.
    if (existente && !mesmoSku) {
      await tx
        .update(tentativasCheckout)
        .set({ status: 'ENCERRADA', leaseExpiraEm: null, atualizadoEm: entrada.agora })
        .where(eq(tentativasCheckout.id, existente.id))
    }

    if (mesmoSku && existente!.status === 'CRIADA' && existente!.urlCheckout) {
      return { tentativa: existente!, email: usuario.email, pronta: true as const }
    }

    if (mesmoSku) {
      const [reservada] = await tx
        .update(tentativasCheckout)
        .set({
          status: 'CRIANDO',
          leaseExpiraEm: new Date(entrada.agora.getTime() + LEASE_CHECKOUT_MS),
          erroCodigo: null,
          atualizadoEm: entrada.agora,
        })
        .where(eq(tentativasCheckout.id, existente!.id))
        .returning()
      return { tentativa: reservada!, email: usuario.email, reconciliar: true as const }
    }

    const referencia = randomUUID()
    const [criada] = await tx
      .insert(tentativasCheckout)
      .values({
        usuarioId: usuario.id,
        produto: PRODUTO_PAGO,
        provedor: porta.nome,
        referenciaExterna: referencia,
        chaveIdempotencia: randomUUID(),
        nivelDoPlano,
        modalidade,
        status: 'CRIANDO',
        leaseExpiraEm: new Date(entrada.agora.getTime() + LEASE_CHECKOUT_MS),
        atualizadoEm: entrada.agora,
      })
      .returning()
    if (!criada) throw new Error('não foi possível reservar o checkout')
    return { tentativa: criada, email: usuario.email, reconciliar: false as const }
```

No bloco `try` que chama o provedor, o corpo vira:

```ts
  try {
    const preco = precos.porSku[entrada.sku]
    let url: string
    if (reserva.tentativa.modalidade === 'TEMPORADA') {
      // A chave de idempotência da tentativa É a retomada: repetir o POST com
      // ela devolve a preferência que já existe, em vez de abrir uma segunda
      // cobrança. Por isso a temporada não precisa de um `buscarPorReferencia`
      // como o `preapproval` precisa.
      const preferencia = await porta.criarPagamentoUnico({
        referenciaExterna: reserva.tentativa.referenciaExterna,
        chaveIdempotencia: reserva.tentativa.chaveIdempotencia,
        emailPagador: reserva.email,
        nomePlano: NOME_DO_SKU[entrada.sku],
        valorCentavos: preco.centavos,
        moeda: config.moeda,
        urlRetorno: urlDeRetorno(config),
      })
      url = await persistirPreferenciaCriada(db, reserva.tentativa, preferencia, entrada.agora)
    } else {
      let assinatura = reserva.reconciliar
        ? await porta.buscarPorReferencia(reserva.tentativa.referenciaExterna)
        : null
      if (!assinatura) {
        assinatura = await porta.criarAssinatura({
          referenciaExterna: reserva.tentativa.referenciaExterna,
          chaveIdempotencia: reserva.tentativa.chaveIdempotencia,
          emailPagador: reserva.email,
          nomePlano: NOME_DO_SKU[entrada.sku],
          valorCentavos: preco.centavos,
          moeda: config.moeda,
          frequencia: config.frequencia,
          tipoFrequencia: config.tipoFrequencia,
          urlRetorno: urlDeRetorno(config),
        })
      }
      url = await persistirAssinaturaCriada(db, reserva.tentativa, assinatura, entrada.agora)
    }
    await registrarOperacao(db, { /* igual ao de hoje */ })
    return { status: 'PRONTO', url, tentativaId: reserva.tentativa.id, reutilizada: reserva.reconciliar }
  } catch (erro) {
    // igual ao de hoje
  }
```

- [ ] **Step 5: Rode o teste novo e veja passar**

```
npx vitest run src/modules/plataforma/__tests__/checkout-sku.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 6: Adapte `spec04.test.ts`**

Essa suíte constrói um `ConfiguracaoProdutoPago` literal e chama `iniciarCheckout` em sete lugares (`grep -c "iniciarCheckout(banco.db"`). Ajuste:

1. No literal `config` (por volta da linha 35), apague `nomePlano` e `valorCentavos`.
2. Acrescente, ao lado dele, o `precos` (copie o literal `precos` do teste do Step 1).
3. Em cada chamada de `iniciarCheckout`, entre `config` e o objeto de entrada, passe `precos`, e acrescente `sku: 'MVP_MENSAL'` ao objeto de entrada — é o SKU que preserva o comportamento que essas asserções descrevem (mensal, nível de entrada).
4. O teste `'recusa habilitar checkout sem preço, nome e URL'` (linha ~122) muda de assunto: `configuracaoProdutoPago` já não valida preço. Renomeie-o para `'recusa habilitar checkout sem URL pública'` e deixe só a asserção de `APP_PUBLIC_URL`. A validação de preço já tem dono: `precos.test.ts`, Task 2.
5. O teste `'cria preapproval pending com idempotência e campos derivados'` (linha ~466) afirma `reason: 'IA da NBA Mensal'` e `transaction_amount: 49.9`. Troque pelo que o SKU manda: `reason: 'NIP MVP mensal'` e `transaction_amount: 59.9`, e passe `precos` na chamada.

- [ ] **Step 7: Ajuste a server action e apague o bloco legado da página**

Em `src/app/(app)/assinar/acoes.ts`, `contratar` passa a receber o formulário e a ler o SKU:

```ts
export async function contratar(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/assinar')

  let destino: string
  try {
    const pedido = formulario.get('sku')
    // O SKU vem de fora. Um valor fora da lista não pode virar chave de
    // índice em `precos.porSku` — seria `undefined.centavos` na hora de
    // cobrar.
    if (typeof pedido !== 'string' || !ehSku(pedido)) throw new CheckoutIndisponivelError()

    const produto = configuracaoProdutoPago()
    if (!origemPermitida((await headers()).get('origin'), produto)) {
      throw new CheckoutIndisponivelError('origem inválida')
    }
    const { fuso } = (await rulesetAtivo()).rodada
    const precos = precosDosPlanos(fuso)
    if (!precos) throw new CheckoutIndisponivelError('preços não configurados')

    const mercadoPago = configDoAmbiente()
    if (!mercadoPago) throw new CheckoutIndisponivelError()
    const resultado = await iniciarCheckout(
      getDb(),
      new PagamentoMercadoPago(mercadoPago),
      produto,
      precos,
      { usuarioId: sessao.usuarioId, sku: pedido, ip: await ipDaRequisicao(), agora: new Date() },
    )
    destino =
      resultado.status === 'PRONTO' ? resultado.url : '/retorno/mercadopago?estado=processando'
  } catch (erro) {
    destino =
      erro instanceof LimiteOperacaoError ? '/assinar?erro=limite' : '/assinar?erro=indisponivel'
  }
  redirect(destino)
}
```

Imports novos: `ehSku` de `@/modules/plataforma/assinatura/sku`, `precosDosPlanos` de `@/modules/plataforma/assinatura/precos`, `rulesetAtivo` de `@/modules/entrega/ruleset-ativo`.

Em `src/app/(app)/assinar/page.tsx`, apague o bloco do `<form action={contratar}>` e o `import { contratar } from './acoes'` — ele lê `config.valorCentavos`, que deixou de existir. O `else` com "A contratação pelo app chega em breve" passa a ser o único caminho até a Task 9. Em produção a flag do checkout está desligada, então é exatamente o que a página já mostra hoje (ruling R-B7).

- [ ] **Step 8: Ajuste `scripts/mp-conferir.ts`**

A linha que imprime `produto.nomePlano` e `produto.valorCentavos` (por volta da linha 54) vira a lista dos quatro SKUs:

```ts
    const produto = configuracaoProdutoPago()
    const { fuso } = (await rulesetAtivo()).rodada
    const precos = precosDosPlanos(fuso)
    if (precos) {
      for (const sku of SKUS) {
        const preco = precos.porSku[sku]
        const de = preco.deCentavos ? ` (de R$ ${(preco.deCentavos / 100).toFixed(2)})` : ''
        console.log(`plano ${NOME_DO_SKU[sku]}: R$ ${(preco.centavos / 100).toFixed(2)}${de}`)
      }
      console.log(`temporada vendida até: ${precos.fimDaTemporada.toISOString()}`)
    } else {
      console.log('! preços dos planos não configurados — o seletor não mostra valor')
    }
    console.log(`checkout habilitado: ${produto.checkoutHabilitado}`)
```

- [ ] **Step 9: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
npx vitest run src/modules/plataforma/__tests__/checkout-sku.test.ts src/modules/plataforma/__tests__/spec04.test.ts src/app/__tests__/planos-assinar.test.tsx
```

Esperado: tudo verde. **Não commite.**

---

### Task 6: O webhook grava o que foi comprado

Até aqui o dinheiro chegava e o código sabia de quem era. Agora ele sabe também o quê — e a temporada ganha a validade que o provedor não tem como informar.

**Files:**
- Modify: `src/modules/plataforma/assinatura/webhook.ts`
- Modify: `src/modules/plataforma/assinatura/configuracao.ts` (apaga as duas constantes do checkout legado)
- Modify: `src/modules/plataforma/assinatura/reconciliacao.ts` (só a assinatura da função, para repassar `fimDaTemporada`)
- Modify: `src/app/api/webhook/mercadopago/route.ts`
- Modify: `src/app/api/cron/reconciliar-pagamentos/route.ts`
- Test: `src/modules/plataforma/__tests__/pagamento-estabilizacao.test.ts` (adaptar) e `src/modules/plataforma/__tests__/webhook-temporada.test.ts` (novo)

**Interfaces:**
- Consumes: `tentativasCheckout.nivelDoPlano` e `.modalidade` (Task 4); `precosDosPlanos` (Task 2).
- Produces:
  ```ts
  export async function aplicarEventoPagamento(
    db: Db, provedor: string, evento: EventoPagamento, agora: Date, fimDaTemporada: Date | null,
  ): Promise<ResultadoWebhook>
  export async function processarNotificacao(
    db: Db,
    porta: PortaPagamento,
    entrada: {
      corpoBruto: string
      cabecalhos: Record<string, string>
      parametros?: Record<string, string>
      agora: Date
      fimDaTemporada: Date | null
    },
  ): Promise<ResultadoWebhook>
  export async function reconciliarPagamentos(
    db: Db, porta: PortaCobranca, agora: Date, fimDaTemporada: Date | null, limite?: number,
  ): Promise<{ examinadas: number; encontradas: number; eventos: number; falhas: number }>
  ```
  A Task 8 usa `fimDaTemporada` dentro de `reconciliarPagamentos`; aqui ele só é repassado.

**Contexto que evita retrabalho:**
- `interpretarNotificacao` **já trata o tópico `payment`** (`mercadopago.ts:307`). Ele consulta `/v1/payments/{id}`, lê `external_reference` e devolve um evento `recursoTipo: 'COBRANCA'` com `proximaCobranca: null` quando não há `preapproval_id`. Nada a fazer no adapter.
- O que falta é o OUTRO lado: `aplicarEfeito` só concede direito quando há `evento.proximaCobranca` — e um pagamento único nunca tem. É daí que vem a `fimDaTemporada`.
- A idempotência do direito continua sendo a de hoje: `eventos_pagamento` recusa o mesmo `eventoExternoId`, e o `onConflictDoUpdate` de `(origem, referencia_origem, produto)` faz o mesmo pagamento cair sempre na mesma linha. Não invente chave nova.
- `precosDosPlanos` LANÇA quando o checkout está ligado e falta preço. Nas rotas, deixe lançar: com preço incompleto ninguém consegue comprar nada de qualquer jeito (o `iniciarCheckout` também recusa), e um 500 no webhook faz o Mercado Pago reenviar — o evento não se perde, e o erro aparece em vez de sumir.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/modules/plataforma/__tests__/webhook-temporada.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  cobrancas,
  direitosAcesso,
  eventosPagamento,
  tentativasCheckout,
  usuarios,
} from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { avaliarAcesso } from '../assinatura/direito'
import type { EventoPagamento } from '../assinatura/porta'
import { aplicarEventoPagamento } from '../assinatura/webhook'

const AGORA = new Date('2026-10-01T12:00:00.000Z')
const FIM_DA_TEMPORADA = new Date('2027-07-01T03:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})
beforeEach(async () => {
  await banco.db.delete(eventosPagamento)
  await banco.db.delete(direitosAcesso)
  await banco.db.delete(cobrancas)
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(assinaturas)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'temporada@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Temporada',
    })
  ).id
})

async function semear(
  referencia: string,
  nivelDoPlano: 'MVP' | 'ALL_STAR',
  modalidade: 'MENSAL' | 'TEMPORADA',
) {
  // Só UMA tentativa aberta por usuário e produto: as anteriores saem de cena.
  await banco.db
    .update(tentativasCheckout)
    .set({ status: 'ENCERRADA' })
    .where(eq(tentativasCheckout.usuarioId, usuarioId))
  await banco.db.insert(tentativasCheckout).values({
    usuarioId,
    produto: 'NBA_PRO',
    provedor: 'fake',
    referenciaExterna: referencia,
    chaveIdempotencia: `chave-${referencia}`,
    nivelDoPlano,
    modalidade,
    status: 'CRIADA',
    atualizadoEm: AGORA,
  })
}

function pagamentoAprovado(referencia: string, parcial: Partial<EventoPagamento> = {}): EventoPagamento {
  return {
    eventoExternoId: 'evt-temporada-1',
    tipo: 'PAGAMENTO_APROVADO',
    referenciaExterna: referencia,
    // Pagamento único não tem contrato recorrente no provedor.
    assinaturaExternaId: null,
    cobrancaExternaId: 'pay-1',
    recursoTipo: 'COBRANCA',
    plano: 'NIP All Star temporada',
    proximaCobranca: null,
    ocorridoEm: AGORA.toISOString(),
    valorCentavos: 59700,
    moeda: 'BRL',
    statusExterno: 'approved',
    bruto: {},
    ...parcial,
  }
}

describe('temporada: um pagamento, um direito com fim cravado', () => {
  it('concede até o fim da temporada e sem próxima cobrança', async () => {
    await semear('ref-temporada', 'ALL_STAR', 'TEMPORADA')

    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-temporada'),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    expect(resultado).toMatchObject({ aceito: true, duplicado: false, liberou: true })
    const [direito] = await banco.db.select().from(direitosAcesso)
    expect(direito).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
    expect(direito?.fim?.toISOString()).toBe(FIM_DA_TEMPORADA.toISOString())

    const [contrato] = await banco.db.select().from(assinaturas)
    expect(contrato).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
    expect(contrato?.proximaCobranca).toBeNull()
    expect(contrato?.fim?.toISOString()).toBe(FIM_DA_TEMPORADA.toISOString())
    // Sem `preapproval` correspondente: é o que faz a conta não oferecer
    // "cancelar assinatura" para quem comprou temporada (ruling R-B4).
    expect(contrato?.mercadopagoId).toBeNull()

    const acesso = await avaliarAcesso(banco.db, usuarioId, AGORA)
    expect(acesso).toMatchObject({ nivel: 'ALL_STAR', modalidade: 'TEMPORADA' })
  })

  it('o MESMO evento entregue duas vezes não cria dois direitos', async () => {
    await semear('ref-temporada', 'MVP', 'TEMPORADA')
    const evento = pagamentoAprovado('ref-temporada')

    const primeira = await aplicarEventoPagamento(banco.db, 'fake', evento, AGORA, FIM_DA_TEMPORADA)
    const segunda = await aplicarEventoPagamento(banco.db, 'fake', evento, AGORA, FIM_DA_TEMPORADA)

    expect(primeira).toMatchObject({ duplicado: false })
    expect(segunda).toMatchObject({ duplicado: true })
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(1)
  })

  it('o MESMO pagamento por outro evento (webhook + reconciliação) também não duplica', async () => {
    await semear('ref-temporada', 'MVP', 'TEMPORADA')

    await aplicarEventoPagamento(banco.db, 'fake', pagamentoAprovado('ref-temporada'), AGORA, FIM_DA_TEMPORADA)
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-temporada', {
        eventoExternoId: 'reconciliacao:abc',
        ocorridoEm: new Date(AGORA.getTime() + 60_000).toISOString(),
      }),
      new Date(AGORA.getTime() + 60_000),
      FIM_DA_TEMPORADA,
    )

    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(1)
  })

  it('pagamento aprovado depois da temporada não cria direito vencido', async () => {
    await semear('ref-atrasada', 'MVP', 'TEMPORADA')
    const depois = new Date('2027-08-01T12:00:00.000Z')

    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-atrasada', { ocorridoEm: depois.toISOString() }),
      depois,
      FIM_DA_TEMPORADA,
    )

    // `fim <= inicio` já era recusado: um direito que nasce vencido é pior
    // que nenhum, porque a conta anunciaria acesso que não existe. O estorno
    // é manual (spec §9), com registro.
    expect(resultado).toMatchObject({ liberou: false })
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
  })

  it('sem fim de temporada configurado, a temporada não concede nada', async () => {
    await semear('ref-sem-config', 'MVP', 'TEMPORADA')

    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-sem-config'),
      AGORA,
      null,
    )

    expect(resultado).toMatchObject({ liberou: false })
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
  })
})

describe('mensal: o nível vem da tentativa, não de uma constante', () => {
  it('um pagamento de ALL_STAR mensal concede ALL_STAR', async () => {
    await semear('ref-mensal', 'ALL_STAR', 'MENSAL')

    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-mensal', {
        eventoExternoId: 'evt-mensal',
        assinaturaExternaId: 'sub-1',
        proximaCobranca: '2026-11-01T12:00:00.000Z',
        plano: 'NIP All Star mensal',
      }),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    const [direito] = await banco.db.select().from(direitosAcesso)
    expect(direito).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'MENSAL' })
    // Mensal continua valendo até a próxima cobrança, nunca até a temporada.
    expect(direito?.fim?.toISOString()).toBe('2026-11-01T12:00:00.000Z')
  })
})

describe('evento sem tentativa', () => {
  it('é registrado para auditoria e não concede nada', async () => {
    // Nada semeado: a referência não corresponde a nenhuma compra desta
    // instalação. Sem tentativa não há SKU, e conceder exigiria inventar um
    // nível (ruling R-B3).
    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado('ref-desconhecida'),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    expect(resultado).toMatchObject({ aceito: true, duplicado: false, liberou: false })
    expect(await banco.db.select().from(eventosPagamento)).toHaveLength(1)
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
    expect(await banco.db.select().from(assinaturas)).toHaveLength(0)
  })

  it('o UUID do usuário como referência já não é atalho para conceder', async () => {
    // Caminho de compatibilidade que existia em `usuarioDoEvento`: ele
    // resolvia o usuário quando a referência era o UUID dele. Não sabe o SKU,
    // e em produção nunca chegou a existir — o checkout nunca esteve ligado.
    const resultado = await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagamentoAprovado(usuarioId),
      AGORA,
      FIM_DA_TEMPORADA,
    )

    expect(resultado).toMatchObject({ liberou: false })
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/modules/plataforma/__tests__/webhook-temporada.test.ts
```

Esperado: FAIL — `aplicarEventoPagamento` recebe quatro argumentos, não cinco.

- [ ] **Step 3: Troque `usuarioDoEvento` por `compraDoEvento`**

Em `webhook.ts`, substitua a função `usuarioDoEvento` (linhas 47–68) inteira por:

```ts
/**
 * DE QUEM É A COMPRA E O QUE FOI COMPRADO — a mesma consulta.
 *
 * A `tentativas_checkout` é o único elo entre o dinheiro e a NIP: o provedor
 * devolve a referência opaca, e é ela que diz o usuário, o nível e a
 * modalidade. Sem tentativa não há compra desta instalação — o evento fica
 * registrado em `eventos_pagamento` para auditoria e não concede nada.
 *
 * O caminho de compatibilidade que resolvia o usuário quando a referência era
 * o UUID dele saiu daqui: ele não sabe QUAL plano foi pago, e as colunas de
 * nível são NOT NULL. Conceder por ali exigiria inventar um nível, que é
 * exatamente o que a regra 3 do CLAUDE.md proíbe. Em produção o checkout
 * nunca esteve ligado, então nenhuma referência desse formato existe.
 */
async function compraDoEvento(
  db: Db,
  referencia: string | null,
): Promise<{ usuarioId: string; nivelDoPlano: NivelPago; modalidade: Modalidade } | null> {
  if (!referencia) return null
  const [tentativa] = await db
    .select({
      usuarioId: tentativasCheckout.usuarioId,
      nivelDoPlano: tentativasCheckout.nivelDoPlano,
      modalidade: tentativasCheckout.modalidade,
    })
    .from(tentativasCheckout)
    .where(eq(tentativasCheckout.referenciaExterna, referencia))
    .limit(1)
  if (!tentativa) return null
  // `as` é a fronteira entre `text` no banco e o tipo do domínio; os checks
  // da migration 0028 garantem que só estes valores existem nas colunas.
  return {
    usuarioId: tentativa.usuarioId,
    nivelDoPlano: tentativa.nivelDoPlano as NivelPago,
    modalidade: tentativa.modalidade as Modalidade,
  }
}
```

Acrescente ao topo `import type { Modalidade, NivelPago } from './nivel-do-plano'` e **remova** `usuarios` do import de schema (ele só existia para o caminho legado) e o import de `MODALIDADE_DO_CHECKOUT_LEGADO, NIVEL_DO_CHECKOUT_LEGADO` (o `PRODUTO_PAGO` continua).

- [ ] **Step 4: Faça o contrato espelhar o SKU e a validade da temporada**

`assinaturaDoEvento` ganha dois argumentos e passa a escrever o SKU nos DOIS ramos. Troque a assinatura para:

```ts
async function assinaturaDoEvento(
  db: Db,
  evento: EventoPagamento,
  compra: { usuarioId: string; nivelDoPlano: NivelPago; modalidade: Modalidade },
  agora: Date,
  fimDaTemporada: Date | null,
): Promise<{ id: string; aplicou: boolean }> {
```

Logo depois de calcular `status`, acrescente:

```ts
  const ehTemporada = compra.modalidade === 'TEMPORADA'
  // Temporada não tem próxima cobrança — é o que a conta lê para mostrar
  // "acesso até" em vez de uma contagem regressiva que nunca chegaria.
  const proximaCobranca = ehTemporada ? null : dataDoProvedor(evento.proximaCobranca)
```

No ramo do `update`, troque as linhas de contrato por:

```ts
        usuarioId: compra.usuarioId,
        mercadopagoId: evento.assinaturaExternaId ?? existente.mercadopagoId,
        referenciaExterna: evento.referenciaExterna ?? existente.referenciaExterna,
        produto: existente.produto || PRODUTO_PAGO,
        status,
        plano: evento.plano ?? existente.plano,
        // O SKU também no conflito: era o defeito registrado no Plano A — o
        // nível era atualizado e a modalidade não, o que com dois SKUs
        // deixaria um contrato de temporada se dizendo mensal.
        nivelDoPlano: compra.nivelDoPlano,
        modalidade: compra.modalidade,
        inicio,
        fim: ehTemporada ? fimDaTemporada : existente.fim,
        proximaCobranca: ehTemporada ? null : (proximaCobranca ?? existente.proximaCobranca),
```

No ramo do `insert`, troque `NIVEL_DO_CHECKOUT_LEGADO`/`MODALIDADE_DO_CHECKOUT_LEGADO` por `compra.nivelDoPlano`/`compra.modalidade`, use `usuarioId: compra.usuarioId` e acrescente `fim: ehTemporada ? fimDaTemporada : null`.

- [ ] **Step 5: Faça o direito nascer com a validade certa**

Em `aplicarEfeito`, a assinatura vira:

```ts
async function aplicarEfeito(
  db: Db,
  provedor: string,
  evento: EventoPagamento,
  agora: Date,
  fimDaTemporada: Date | null,
): Promise<{ liberou: boolean; usuarioId: string | null }> {
  const compra = await compraDoEvento(db, evento.referenciaExterna)
  if (!compra) return { liberou: false, usuarioId: null }
  const usuarioId = compra.usuarioId

  const assinatura = await assinaturaDoEvento(db, evento, compra, agora, fimDaTemporada)
```

No bloco do `PAGAMENTO_APROVADO`, troque o cálculo de `fim` e as duas constantes:

```ts
  if (evento.tipo === 'PAGAMENTO_APROVADO' && cobrancaId && cobrancaAplicada) {
    const inicio = dataDoProvedor(evento.ocorridoEm) ?? agora
    // Mensal vale até a próxima cobrança, que o provedor informa. Temporada
    // vale até a data vendida, que o provedor NÃO tem como saber: é contrato
    // da NIP, não do Mercado Pago.
    const fim =
      compra.modalidade === 'TEMPORADA' ? fimDaTemporada : dataDoProvedor(evento.proximaCobranca)
    // Sem limite futuro demonstrável, a confirmação financeira fica registrada,
    // mas não autoriza conteúdo indefinidamente.
    if (!fim || fim <= inicio) return { liberou: false, usuarioId }

    await db
      .insert(direitosAcesso)
      .values({
        usuarioId,
        produto: PRODUTO_PAGO,
        origem: provedor,
        referenciaOrigem: cobrancaId,
        nivelDoPlano: compra.nivelDoPlano,
        modalidade: compra.modalidade,
        inicio,
        fim,
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [direitosAcesso.origem, direitosAcesso.referenciaOrigem, direitosAcesso.produto],
        set: {
          usuarioId,
          inicio,
          fim,
          nivelDoPlano: compra.nivelDoPlano,
          modalidade: compra.modalidade,
          revogadoEm: null,
          motivoRevogacao: null,
          atualizadoEm: agora,
        },
      })
    return { liberou: true, usuarioId }
  }
```

- [ ] **Step 6: Repasse `fimDaTemporada` pelos chamadores**

`aplicarEventoPagamento` e `processarNotificacao` ganham o parâmetro (ver o bloco **Interfaces**) e o repassam a `aplicarEfeito`. Em `reconciliacao.ts`, `reconciliarPagamentos` ganha `fimDaTemporada: Date | null` entre `agora` e `limite` e o repassa às duas chamadas de `aplicarEventoPagamento` (a Task 8 é quem vai usá-lo de verdade).

Em `src/app/api/webhook/mercadopago/route.ts`, antes da chamada:

```ts
  // O fuso da rodada mora no ruleset (camada de entrega); `plataforma/` não a
  // importa, então quem já lê o ruleset é que traz o fuso para cá.
  const { fuso } = (await rulesetAtivo()).rodada
  const precos = precosDosPlanos(fuso)

  const resultado = await processarNotificacao(getDb(), new PagamentoMercadoPago(config), {
    corpoBruto,
    cabecalhos,
    parametros,
    agora: new Date(),
    fimDaTemporada: precos?.fimDaTemporada ?? null,
  })
```

Mesma leitura em `src/app/api/cron/reconciliar-pagamentos/route.ts`, passando `precos?.fimDaTemporada ?? null` na posição nova.

- [ ] **Step 7: Apague as constantes do checkout legado**

Em `configuracao.ts`, apague `NIVEL_DO_CHECKOUT_LEGADO` e `MODALIDADE_DO_CHECKOUT_LEGADO` e o comentário que as explicava — e com eles o import de `Modalidade`/`NivelPago` naquele arquivo, se ficar sem uso. `npm run typecheck` acusa quem tiver ficado para trás.

- [ ] **Step 8: Adapte `pagamento-estabilizacao.test.ts`**

Os três testes de `describe('atomicidade do webhook')` usam `referenciaExterna: usuarioId` — a forma legada, que já não concede. Acrescente ao arquivo o helper de semeadura (copie `semear` do teste do Step 1, apontando a mesma referência que `notificacao` usa), troque `referenciaExterna: usuarioId` por uma referência opaca (`'ref-estabilizacao'`), chame `semear` no `beforeEach` e acrescente `fimDaTemporada: null` ao objeto de entrada de cada `processarNotificacao`. Acrescente `tentativasCheckout` ao `beforeEach` que limpa tabelas. As asserções não mudam: o que esses testes provam — rollback, bloqueio administrativo e cancelamento sem duplicar — continua igual.

No `describe('adapter real do Mercado Pago')`, o teste `'assinatura inválida não consulta o provedor nem escreve no banco'` também chama `processarNotificacao`: acrescente `fimDaTemporada: null`.

- [ ] **Step 9: Rode as suítes e veja passar**

```
npx vitest run src/modules/plataforma/__tests__/webhook-temporada.test.ts
npx vitest run src/modules/plataforma/__tests__/pagamento-estabilizacao.test.ts src/modules/plataforma/__tests__/spec04.test.ts
```

Esperado: PASS nas três. Se `spec04.test.ts` reclamar do número de argumentos em `aplicarEventoPagamento` ou `reconciliarPagamentos`, acrescente `null` na posição de `fimDaTemporada` nessas chamadas — elas testam mensal.

- [ ] **Step 10: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
```

Esperado: tudo limpo. **Não commite.**

---

### Task 7: O upgrade

Comprar o plano de cima com um direito ativo. A ordem importa mais que o resto: o novo nasce, o antigo morre — e quem acabou de pagar mais nunca vê menos no meio do caminho.

**Files:**
- Modify: `src/modules/plataforma/assinatura/webhook.ts`
- Create: `src/modules/plataforma/assinatura/substituicao.ts`
- Modify: `src/app/api/webhook/mercadopago/route.ts`
- Test: `src/modules/plataforma/__tests__/upgrade.test.ts` (novo)

**Interfaces:**
- Consumes: `compraDoEvento`, `aplicarEfeito` (Task 6); `PagamentoFake.cancelamentos` (Task 3).
- Produces:
  ```ts
  export async function cancelarContratosSubstituidos(
    db: Db, porta: PortaCobranca, agora: Date, limite?: number,
  ): Promise<{ cancelados: number; falhas: number }>
  ```
  A Task 8 chama essa função no cron de reconciliação.

**A regra, em três frases:** o direito novo já existe quando a revogação roda (decisão 3 da spec — dois direitos ativos, vale o maior). A revogação só alcança direitos que o novo nível COBRE (ruling R-B6). O cancelamento do contrato antigo no provedor é marcado dentro da transação e executado fora dela.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/modules/plataforma/__tests__/upgrade.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  cobrancas,
  direitosAcesso,
  eventosPagamento,
  tentativasCheckout,
  usuarios,
} from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { avaliarAcesso, concederCortesia } from '../assinatura/direito'
import { PagamentoFake } from '../assinatura/fake'
import type { EventoPagamento } from '../assinatura/porta'
import { cancelarContratosSubstituidos } from '../assinatura/substituicao'
import { aplicarEventoPagamento } from '../assinatura/webhook'

const AGORA = new Date('2026-10-01T12:00:00.000Z')
const DEPOIS = new Date('2026-10-05T12:00:00.000Z')
const FIM_DA_TEMPORADA = new Date('2027-07-01T03:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})
beforeEach(async () => {
  await banco.db.delete(eventosPagamento)
  await banco.db.delete(direitosAcesso)
  await banco.db.delete(cobrancas)
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(assinaturas)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'upgrade@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Upgrade',
    })
  ).id
})

async function semear(
  referencia: string,
  nivelDoPlano: 'MVP' | 'ALL_STAR',
  modalidade: 'MENSAL' | 'TEMPORADA',
) {
  // Só UMA tentativa aberta por usuário e produto: a anterior sai de cena.
  await banco.db
    .update(tentativasCheckout)
    .set({ status: 'ENCERRADA' })
    .where(eq(tentativasCheckout.usuarioId, usuarioId))
  await banco.db.insert(tentativasCheckout).values({
    usuarioId,
    produto: 'NBA_PRO',
    provedor: 'fake',
    referenciaExterna: referencia,
    chaveIdempotencia: `chave-${referencia}`,
    nivelDoPlano,
    modalidade,
    status: 'CRIADA',
    atualizadoEm: AGORA,
  })
}

function pagou(
  referencia: string,
  parcial: Partial<EventoPagamento> & { eventoExternoId: string; cobrancaExternaId: string },
): EventoPagamento {
  return {
    tipo: 'PAGAMENTO_APROVADO',
    referenciaExterna: referencia,
    assinaturaExternaId: null,
    recursoTipo: 'COBRANCA',
    plano: null,
    proximaCobranca: null,
    ocorridoEm: AGORA.toISOString(),
    valorCentavos: 5990,
    moeda: 'BRL',
    statusExterno: 'approved',
    bruto: {},
    ...parcial,
  }
}

/** Compra mensal aprovada: contrato no provedor, direito até a próxima cobrança. */
async function comprouMensal(
  referencia: string,
  nivelDoPlano: 'MVP' | 'ALL_STAR',
  idExterno: string,
  quando: Date,
) {
  await semear(referencia, nivelDoPlano, 'MENSAL')
  await aplicarEventoPagamento(
    banco.db,
    'fake',
    pagou(referencia, {
      eventoExternoId: `evt-${referencia}`,
      cobrancaExternaId: `pay-${referencia}`,
      assinaturaExternaId: idExterno,
      proximaCobranca: new Date(quando.getTime() + 30 * 86_400_000).toISOString(),
      ocorridoEm: quando.toISOString(),
    }),
    quando,
    FIM_DA_TEMPORADA,
  )
}

describe('upgrade de nível', () => {
  it('revoga o direito anterior com motivo UPGRADE e entrega o nível novo', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const direitos = await banco.db.select().from(direitosAcesso)
    expect(direitos).toHaveLength(2)
    const antigo = direitos.find((direito) => direito.nivelDoPlano === 'MVP')
    const novo = direitos.find((direito) => direito.nivelDoPlano === 'ALL_STAR')
    expect(antigo?.revogadoEm?.toISOString()).toBe(DEPOIS.toISOString())
    expect(antigo?.motivoRevogacao).toBe('UPGRADE')
    expect(novo?.revogadoEm).toBeNull()

    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'ALL_STAR' })
  })

  it('o novo direito já vale quando o antigo é revogado — nunca há buraco', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const direitos = await banco.db.select().from(direitosAcesso)
    const antigo = direitos.find((direito) => direito.nivelDoPlano === 'MVP')!
    const novo = direitos.find((direito) => direito.nivelDoPlano === 'ALL_STAR')!
    // A revogação do antigo não pode acontecer ANTES do início do novo; se
    // acontecesse, existiria um instante em que quem pagou mais teria menos
    // (decisão 3 da spec).
    expect(novo.inicio.getTime()).toBeLessThanOrEqual(antigo.revogadoEm!.getTime())
  })

  it('marca o contrato mensal anterior para cancelamento, e só ele', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const contratos = await banco.db.select().from(assinaturas)
    const antigo = contratos.find((contrato) => contrato.mercadopagoId === 'sub-mvp')
    const novo = contratos.find((contrato) => contrato.mercadopagoId === 'sub-all-star')
    expect(antigo?.cancelamentoSolicitadoEm?.toISOString()).toBe(DEPOIS.toISOString())
    expect(novo?.cancelamentoSolicitadoEm).toBeNull()
  })

  it('trocar mensal por temporada também substitui — mesma regra do upgrade', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)

    await semear('ref-temporada', 'MVP', 'TEMPORADA')
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagou('ref-temporada', {
        eventoExternoId: 'evt-temporada',
        cobrancaExternaId: 'pay-temporada',
        ocorridoEm: DEPOIS.toISOString(),
      }),
      DEPOIS,
      FIM_DA_TEMPORADA,
    )

    const direitos = await banco.db.select().from(direitosAcesso)
    const mensal = direitos.find((direito) => direito.modalidade === 'MENSAL')
    const temporada = direitos.find((direito) => direito.modalidade === 'TEMPORADA')
    expect(mensal?.motivoRevogacao).toBe('UPGRADE')
    expect(temporada?.revogadoEm).toBeNull()
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({
      nivel: 'MVP',
      modalidade: 'TEMPORADA',
    })
  })

  it('uma cortesia de nível MAIOR sobrevive à compra do nível menor', async () => {
    await concederCortesia(banco.db, {
      usuarioId,
      referencia: 'cortesia-1',
      inicio: AGORA,
      fim: null,
      nivelDoPlano: 'ALL_STAR',
    })

    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', DEPOIS)

    const cortesia = (await banco.db.select().from(direitosAcesso)).find(
      (direito) => direito.origem === 'CORTESIA_ADMIN',
    )
    // Downgrade não existe: comprar o plano de baixo não pode apagar o de
    // cima que a pessoa já tinha (ruling R-B6).
    expect(cortesia?.revogadoEm).toBeNull()
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'ALL_STAR' })
  })

  it('renovação mensal não cancela o próprio contrato', async () => {
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    // Segundo mês: MESMA referência, MESMO contrato, cobrança nova.
    await aplicarEventoPagamento(
      banco.db,
      'fake',
      pagou('ref-mvp', {
        eventoExternoId: 'evt-mes-2',
        cobrancaExternaId: 'pay-mes-2',
        assinaturaExternaId: 'sub-mvp',
        ocorridoEm: DEPOIS.toISOString(),
        proximaCobranca: new Date(DEPOIS.getTime() + 30 * 86_400_000).toISOString(),
      }),
      DEPOIS,
      FIM_DA_TEMPORADA,
    )

    const contratos = await banco.db.select().from(assinaturas)
    expect(contratos).toHaveLength(1)
    expect(contratos[0]?.cancelamentoSolicitadoEm).toBeNull()
    expect(await avaliarAcesso(banco.db, usuarioId, DEPOIS)).toMatchObject({ nivel: 'MVP' })
  })
})

describe('cancelarContratosSubstituidos', () => {
  it('cancela no provedor o que ficou marcado, e registra a data', async () => {
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)
    // O fake só cancela contrato que ele conhece — crie-o e aponte a linha
    // marcada para o id que ele devolveu.
    await porta.criarAssinatura({
      referenciaExterna: 'ref-mvp',
      chaveIdempotencia: 'chave-ref-mvp',
      emailPagador: 'upgrade@exemplo.com',
      nomePlano: 'NIP MVP mensal',
      valorCentavos: 5990,
      moeda: 'BRL',
      frequencia: 1,
      tipoFrequencia: 'months',
      urlRetorno: 'https://app.example.com/retorno/mercadopago',
    })
    await banco.db
      .update(assinaturas)
      .set({ mercadopagoId: 'fake-ref-mvp' })
      .where(eq(assinaturas.mercadopagoId, 'sub-mvp'))

    const resultado = await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)

    expect(resultado).toEqual({ cancelados: 1, falhas: 0 })
    expect(porta.cancelamentos).toEqual(['fake-ref-mvp'])
    const [cancelado] = await banco.db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.mercadopagoId, 'fake-ref-mvp'))
    expect(cancelado?.canceladaEm).not.toBeNull()
  })

  it('falha no provedor não perde a marca — a próxima varredura tenta de novo', async () => {
    // O fake não conhece 'sub-mvp': `cancelarAssinatura` lança, como o
    // provedor lançaria num 5xx.
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)
    await comprouMensal('ref-all-star', 'ALL_STAR', 'sub-all-star', DEPOIS)

    const primeira = await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)
    expect(primeira).toEqual({ cancelados: 0, falhas: 1 })

    const [aindaPendente] = await banco.db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.mercadopagoId, 'sub-mvp'))
    // Desistir aqui é continuar cobrando quem já trocou de plano.
    expect(aindaPendente?.cancelamentoSolicitadoEm).not.toBeNull()
    expect(aindaPendente?.canceladaEm).toBeNull()
  })

  it('não mexe em contrato que ninguém marcou', async () => {
    const porta = new PagamentoFake()
    await comprouMensal('ref-mvp', 'MVP', 'sub-mvp', AGORA)

    expect(await cancelarContratosSubstituidos(banco.db, porta, DEPOIS)).toEqual({
      cancelados: 0,
      falhas: 0,
    })
    expect(porta.cancelamentos).toEqual([])
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/modules/plataforma/__tests__/upgrade.test.ts
```

Esperado: FAIL — `Failed to resolve import "../assinatura/substituicao"`.

- [ ] **Step 3: Escreva `substituicao.ts`**

Crie `src/modules/plataforma/assinatura/substituicao.ts`:

```ts
import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import { assinaturas } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { PortaCobranca } from './porta'

/**
 * OS CONTRATOS QUE O UPGRADE SUBSTITUIU — a parte que fala com a rede.
 *
 * O webhook MARCA (`cancelamento_solicitado_em`) dentro da transação e sai. A
 * chamada ao provedor vem aqui, depois do commit: uma requisição HTTP dentro
 * da transação seguraria a conexão do banco pelo tempo do terceiro, e num
 * timeout dele a transação inteira cairia — inclusive o direito que a pessoa
 * acabou de pagar.
 *
 * Falhar aqui é seguro e retentável: a marca permanece, e o cron de
 * reconciliação chama esta mesma função de novo. Desistir é que não é — o
 * contrato antigo continuaria cobrando quem já trocou de plano.
 */
export async function cancelarContratosSubstituidos(
  db: Db,
  porta: PortaCobranca,
  agora: Date,
  limite = 20,
): Promise<{ cancelados: number; falhas: number }> {
  const pendentes = await db
    .select({ id: assinaturas.id, mercadopagoId: assinaturas.mercadopagoId })
    .from(assinaturas)
    .where(
      and(
        isNotNull(assinaturas.cancelamentoSolicitadoEm),
        isNull(assinaturas.canceladaEm),
        isNotNull(assinaturas.mercadopagoId),
      ),
    )
    .limit(Math.min(Math.max(limite, 1), 100))

  const resultado = { cancelados: 0, falhas: 0 }
  for (const pendente of pendentes) {
    if (!pendente.mercadopagoId) continue
    try {
      // A chave de idempotência é DERIVADA do id do contrato, não aleatória:
      // esta varredura repete até conseguir, e uma chave nova a cada volta
      // faria o provedor tratar cada retentativa como operação diferente.
      const externa = await porta.cancelarAssinatura(
        pendente.mercadopagoId,
        `cancelar-${pendente.id}`,
      )
      const doProvedor = externa.ocorridoEm ? new Date(externa.ocorridoEm) : null
      const quando = doProvedor && Number.isFinite(doProvedor.getTime()) ? doProvedor : agora
      await db
        .update(assinaturas)
        .set({
          status: externa.status.toUpperCase(),
          canceladaEm: quando,
          ocorridoEmOrigem: quando,
          atualizadoEm: agora,
        })
        .where(eq(assinaturas.id, pendente.id))
      resultado.cancelados += 1
    } catch {
      resultado.falhas += 1
    }
  }
  return resultado
}
```

- [ ] **Step 4: Faça o webhook substituir o direito anterior**

Em `webhook.ts`, acrescente `isNotNull` e `ne` ao import de `drizzle-orm`, e `atende` + `type NivelDoPlano` ao import de `./nivel-do-plano`.

O insert do direito, no ramo `PAGAMENTO_APROVADO`, passa a devolver o id. Troque

```ts
    await db
      .insert(direitosAcesso)
```

por

```ts
    const [novo] = await db
      .insert(direitosAcesso)
```

e, ao final da cadeia (depois do `onConflictDoUpdate`), acrescente `.returning({ id: direitosAcesso.id })`. Logo abaixo, antes do `return { liberou: true, usuarioId }`:

```ts
    if (!novo) throw new Error('não foi possível registrar o direito')
    await substituirDireitosAnteriores(db, {
      usuarioId,
      novoDireitoId: novo.id,
      nivelDoPlano: compra.nivelDoPlano,
      assinaturaId: assinatura.id,
      agora,
    })
```

E acrescente a função, logo antes de `aplicarEfeito`:

```ts
/**
 * O UPGRADE (spec §9, decisão 12) — NESTA ORDEM, nunca na outra.
 *
 * O direito novo já existe quando esta função roda. Só então o anterior é
 * revogado: entre os dois instantes valem os dois, e `avaliarAcesso` devolve
 * o MAIOR (decisão 3). Revogar primeiro abriria uma janela — curta, mas real
 * — em que quem acabou de pagar mais veria menos.
 *
 * Sem devolução do período restante: é o que a tela de compra avisa antes de
 * cobrar (spec §9, confirmado pelo parceiro em 16/09).
 */
async function substituirDireitosAnteriores(
  db: Db,
  entrada: {
    usuarioId: string
    novoDireitoId: string
    nivelDoPlano: NivelPago
    assinaturaId: string
    agora: Date
  },
): Promise<void> {
  const anteriores = await db
    .select({ id: direitosAcesso.id, nivelDoPlano: direitosAcesso.nivelDoPlano })
    .from(direitosAcesso)
    .where(
      and(
        eq(direitosAcesso.usuarioId, entrada.usuarioId),
        eq(direitosAcesso.produto, PRODUTO_PAGO),
        isNull(direitosAcesso.revogadoEm),
        ne(direitosAcesso.id, entrada.novoDireitoId),
      ),
    )

  for (const anterior of anteriores) {
    // Só o que o novo COBRE. Uma cortesia All Star não morre porque a pessoa
    // comprou MVP: ela ficaria com MENOS do que tinha, e downgrade não existe.
    if (!atende(entrada.nivelDoPlano, anterior.nivelDoPlano as NivelDoPlano)) continue
    await db
      .update(direitosAcesso)
      .set({ revogadoEm: entrada.agora, motivoRevogacao: 'UPGRADE', atualizadoEm: entrada.agora })
      .where(eq(direitosAcesso.id, anterior.id))
  }

  // O contrato MENSAL substituído para de cobrar. Aqui só a MARCA: a chamada
  // ao provedor é rede e sai da transação (`cancelarContratosSubstituidos`).
  // A renovação do PRÓPRIO contrato não se marca — é o `ne(id, assinaturaId)`.
  await db
    .update(assinaturas)
    .set({ cancelamentoSolicitadoEm: entrada.agora, atualizadoEm: entrada.agora })
    .where(
      and(
        eq(assinaturas.usuarioId, entrada.usuarioId),
        ne(assinaturas.id, entrada.assinaturaId),
        eq(assinaturas.modalidade, 'MENSAL'),
        isNotNull(assinaturas.mercadopagoId),
        isNull(assinaturas.canceladaEm),
        isNull(assinaturas.cancelamentoSolicitadoEm),
      ),
    )
}
```

- [ ] **Step 5: Dispare o cancelamento na rota do webhook**

Em `src/app/api/webhook/mercadopago/route.ts`, depois de `processarNotificacao` e antes de montar a resposta:

```ts
  if (resultado.aceito && !resultado.duplicado && resultado.liberou) {
    // Fora da transação, e nunca derrubando o webhook: se falhar, a marca
    // continua no banco e o cron de reconciliação tenta de novo. Devolver
    // erro aqui faria o Mercado Pago reenviar um evento JÁ APLICADO, sem
    // adiantar nada.
    try {
      await cancelarContratosSubstituidos(getDb(), new PagamentoMercadoPago(config), new Date())
    } catch (erro) {
      console.warn(
        JSON.stringify({
          evento: 'cancelamento_substituido_falhou',
          erro: erro instanceof Error ? erro.name : 'ErroDesconhecido',
        }),
      )
    }
  }
```

- [ ] **Step 6: Rode o teste e veja passar**

```
npx vitest run src/modules/plataforma/__tests__/upgrade.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 7: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
npx vitest run src/modules/plataforma/__tests__
```

Esperado: tudo verde — inclusive `spec04.test.ts`, `webhook-temporada.test.ts` e `avaliar-acesso.test.ts`. **Não commite.**

---

### Task 8: A reconciliação entende temporada

O webhook pode não chegar. Para o mensal já existe rede de segurança; para a temporada, a rede de hoje chamaria `/preapproval/<id-de-preferência>` e falharia em laço.

**Files:**
- Modify: `src/modules/plataforma/assinatura/reconciliacao.ts`
- Modify: `src/app/api/cron/reconciliar-pagamentos/route.ts`
- Test: `src/modules/plataforma/__tests__/reconciliacao-temporada.test.ts` (novo)

**Interfaces:**
- Consumes: `buscarPagamentoPorReferencia` (Task 3), `cancelarContratosSubstituidos` (Task 7), `fimDaTemporada` em `reconciliarPagamentos` (Task 6).
- Produces: nenhum símbolo novo — `reconciliarPagamentos` mantém a forma de retorno `{ examinadas, encontradas, eventos, falhas }`.

**Por que isto não é opcional:** `reconciliarPagamentos` varre toda tentativa em `CRIANDO | AMBIGUA | CRIADA` e chama `consultarAssinatura(tentativa.assinaturaExternaId)`. Numa tentativa de temporada, esse id é o de uma PREFERÊNCIA — o endpoint de `preapproval` devolve 404, o `catch` marca `AMBIGUA`, e a tentativa volta na varredura seguinte. Uma compra de temporada sem webhook ficaria para sempre sem direito, queimando uma chamada ao provedor a cada rodada do cron.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/modules/plataforma/__tests__/reconciliacao-temporada.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  cobrancas,
  direitosAcesso,
  eventosPagamento,
  tentativasCheckout,
  usuarios,
} from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { avaliarAcesso } from '../assinatura/direito'
import { PagamentoFake } from '../assinatura/fake'
import { reconciliarPagamentos } from '../assinatura/reconciliacao'

const AGORA = new Date('2026-10-01T12:00:00.000Z')
const FIM_DA_TEMPORADA = new Date('2027-07-01T03:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})
beforeEach(async () => {
  await banco.db.delete(eventosPagamento)
  await banco.db.delete(direitosAcesso)
  await banco.db.delete(cobrancas)
  await banco.db.delete(tentativasCheckout)
  await banco.db.delete(assinaturas)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'reconciliar@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Reconciliar',
    })
  ).id
})

async function tentativaDeTemporada(referencia: string) {
  await banco.db.insert(tentativasCheckout).values({
    usuarioId,
    produto: 'NBA_PRO',
    provedor: 'fake',
    referenciaExterna: referencia,
    chaveIdempotencia: `chave-${referencia}`,
    nivelDoPlano: 'ALL_STAR',
    modalidade: 'TEMPORADA',
    status: 'CRIADA',
    assinaturaExternaId: `fake-pref-${referencia}`,
    urlCheckout: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=x',
    atualizadoEm: AGORA,
  })
}

describe('reconciliação de temporada', () => {
  it('concede o direito quando o webhook não chegou', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-temporada')
    porta.registrarPagamento({
      id: 'pay-temporada',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-temporada',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })

    const resultado = await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)

    expect(resultado).toMatchObject({ examinadas: 1, encontradas: 1, falhas: 0 })
    expect(resultado.eventos).toBeGreaterThan(0)
    const [direito] = await banco.db.select().from(direitosAcesso)
    expect(direito).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
    expect(direito?.fim?.toISOString()).toBe(FIM_DA_TEMPORADA.toISOString())
    expect(await avaliarAcesso(banco.db, usuarioId, AGORA)).toMatchObject({ nivel: 'ALL_STAR' })
  })

  it('NÃO consulta o endpoint de assinatura recorrente para temporada', async () => {
    // O id guardado é de uma PREFERÊNCIA. Perguntar por ele em
    // `/preapproval/{id}` devolve 404 e a tentativa ficaria AMBIGUA para
    // sempre, queimando uma chamada ao provedor a cada rodada do cron.
    const porta = new PagamentoFake()
    let consultouAssinatura = false
    porta.consultarAssinatura = async () => {
      consultouAssinatura = true
      throw new Error('não deveria ter sido chamado')
    }
    await tentativaDeTemporada('ref-temporada')
    porta.registrarPagamento({
      id: 'pay-temporada',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-temporada',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })

    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)

    expect(consultouAssinatura).toBe(false)
  })

  it('rodar duas vezes não cria dois direitos', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-temporada')
    porta.registrarPagamento({
      id: 'pay-temporada',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-temporada',
      status: 'approved',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })

    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)
    await reconciliarPagamentos(
      banco.db,
      porta,
      new Date(AGORA.getTime() + 600_000),
      FIM_DA_TEMPORADA,
    )

    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(1)
  })

  it('sem pagamento no provedor, a tentativa fica AMBIGUA e nada é concedido', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-abandonada')

    const resultado = await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)

    expect(resultado).toMatchObject({ examinadas: 1, encontradas: 0 })
    const [tentativa] = await banco.db
      .select()
      .from(tentativasCheckout)
      .where(eq(tentativasCheckout.referenciaExterna, 'ref-abandonada'))
    expect(tentativa?.status).toBe('AMBIGUA')
    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
  })

  it('pagamento recusado é registrado e não concede', async () => {
    const porta = new PagamentoFake()
    await tentativaDeTemporada('ref-recusada')
    porta.registrarPagamento({
      id: 'pay-recusado',
      assinaturaExternaId: null,
      referenciaExterna: 'ref-recusada',
      status: 'rejected',
      valorCentavos: 59700,
      moeda: 'BRL',
      ocorridoEm: AGORA.toISOString(),
      proximaCobranca: null,
    })

    await reconciliarPagamentos(banco.db, porta, AGORA, FIM_DA_TEMPORADA)

    expect(await banco.db.select().from(direitosAcesso)).toHaveLength(0)
    expect(await banco.db.select().from(cobrancas)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/modules/plataforma/__tests__/reconciliacao-temporada.test.ts
```

Esperado: FAIL — a tentativa de temporada cai no caminho de `preapproval` e termina `AMBIGUA`, sem direito.

- [ ] **Step 3: Acrescente o ramo de temporada**

Em `reconciliacao.ts`, junto de `eventoDaCobranca`:

```ts
/**
 * O evento que a temporada produz na reconciliação.
 *
 * Sem `assinaturaExternaId` e sem `proximaCobranca`: não há contrato
 * recorrente e não há próxima cobrança. É o webhook dizendo a mesma coisa que
 * o tópico `payment` diria, só que descoberto por varredura em vez de aviso.
 */
function eventoDoPagamentoUnico(
  tentativa: typeof tentativasCheckout.$inferSelect,
  cobranca: CobrancaExterna,
): EventoPagamento {
  const tipo =
    cobranca.status === 'approved'
      ? 'PAGAMENTO_APROVADO'
      : cobranca.status === 'refunded'
        ? 'PAGAMENTO_ESTORNADO'
        : cobranca.status === 'charged_back'
          ? 'PAGAMENTO_CONTESTADO'
          : cobranca.status === 'rejected' ||
              cobranca.status === 'cancelled' ||
              cobranca.status === 'canceled'
            ? 'PAGAMENTO_RECUSADO'
            : 'OUTRO'
  return {
    eventoExternoId: chaveEvento(['pagamento-unico', cobranca.id, cobranca.status, cobranca.ocorridoEm]),
    tipo,
    referenciaExterna: tentativa.referenciaExterna,
    assinaturaExternaId: null,
    cobrancaExternaId: cobranca.id,
    recursoTipo: 'COBRANCA',
    plano: null,
    proximaCobranca: null,
    ocorridoEm: cobranca.ocorridoEm,
    valorCentavos: cobranca.valorCentavos,
    moeda: cobranca.moeda,
    statusExterno: cobranca.status,
    bruto: { origem: 'RECONCILIACAO' },
  }
}
```

Dentro do `try` do laço, como PRIMEIRA coisa depois de `resultado.examinadas += 1`:

```ts
      if (tentativa.modalidade === 'TEMPORADA') {
        // Pagamento único não tem `preapproval`: perguntar por ele em
        // `/preapproval/{id}` com o id da PREFERÊNCIA daria 404 a cada
        // rodada do cron. A busca é pela referência.
        const cobranca = await porta.buscarPagamentoPorReferencia(tentativa.referenciaExterna)
        if (!cobranca) {
          await db
            .update(tentativasCheckout)
            .set({ status: 'AMBIGUA', leaseExpiraEm: null, atualizadoEm: agora })
            .where(eq(tentativasCheckout.id, tentativa.id))
          continue
        }
        resultado.encontradas += 1
        const efeito = await aplicarEventoPagamento(
          db,
          porta.nome,
          eventoDoPagamentoUnico(tentativa, cobranca),
          agora,
          fimDaTemporada,
        )
        if (efeito.aceito && !efeito.duplicado) resultado.eventos += 1
        await db
          .update(tentativasCheckout)
          .set({ status: 'CRIADA', leaseExpiraEm: null, erroCodigo: null, atualizadoEm: agora })
          .where(eq(tentativasCheckout.id, tentativa.id))
        continue
      }
```

O `continue` dentro do `try` pula para a próxima candidata sem passar pelo `catch` — é laço, não bloco de recurso.

- [ ] **Step 4: Ligue a varredura de cancelamentos ao cron**

Em `src/app/api/cron/reconciliar-pagamentos/route.ts`, a tarefa passa a fazer as duas coisas:

```ts
    tarefa: async () => {
      const config = configDoAmbiente()
      if (!config) throw new Error('MercadoPagoNaoConfigurado')
      const porta = new PagamentoMercadoPago(config)
      const { fuso } = (await rulesetAtivo()).rodada
      const precos = precosDosPlanos(fuso)
      const db = getDb()
      const conciliacao = await reconciliarPagamentos(
        db,
        porta,
        new Date(),
        precos?.fimDaTemporada ?? null,
      )
      // A rede de segurança do upgrade: o webhook marcou o contrato antigo
      // para cancelar e a chamada ao provedor pode ter falhado. Aqui ela
      // tenta de novo, com a mesma chave de idempotência.
      const substituicoes = await cancelarContratosSubstituidos(db, porta, new Date())
      return { ...conciliacao, substituicoesCanceladas: substituicoes.cancelados }
    },
```

O `quantidade: (resultado) => resultado.eventos` continua valendo.

- [ ] **Step 5: Rode o teste e veja passar**

```
npx vitest run src/modules/plataforma/__tests__/reconciliacao-temporada.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 6: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
npx vitest run src/modules/plataforma/__tests__ src/modules/entrega/__tests__/cron.test.ts
```

Esperado: tudo verde. `cron.test.ts` entra porque a rota mudou de forma de retorno. **Não commite.**

---

### Task 9: O seletor de planos

`/assinar` deixa de ser só comparação e passa a vender: quatro SKUs, os preços de §10, "de/por" onde houver, e — para quem já paga — o aviso de que a compra encerra o plano atual **antes** de cobrar.

**Files:**
- Create: `src/components/planos/preco.ts`
- Modify: `src/modules/plataforma/assinatura/nivel-do-plano.ts` (só o rótulo da modalidade)
- Modify: `src/app/(app)/assinar/page.tsx`
- Test: `src/app/__tests__/planos-assinar.test.tsx` (acrescentar describes)

**Interfaces:**
- Consumes: `ofertasDisponiveis`, `NOME_DO_SKU` (Task 1); `precosDosPlanos` (Task 2); `contratar(formulario: FormData)` (Task 5).
- Produces:
  ```ts
  // src/components/planos/preco.ts
  export function precoEmReais(centavos: number): string
  // src/modules/plataforma/assinatura/nivel-do-plano.ts
  export const ROTULO_DA_MODALIDADE: Record<Modalidade, string>
  ```
  A Task 10 usa `ROTULO_DA_MODALIDADE` na conta.

**Duas armadilhas concretas:**

1. **`Intl.NumberFormat('pt-BR', { style: 'currency' })` emite espaço NÃO SEPARÁVEL (U+00A0) entre `R$` e o número.** `renderToStaticMarkup` escreve esse caractere literal no HTML, então `expect(html).toContain('R$ 59,90')` digitado com espaço comum **falha**, e a falha parece inexplicável. Por isso o preço passa por `precoEmReais`, que formata à mão: além de testável, ele rende igual em qualquer runtime, e este é um número que a pessoa lê antes de ser cobrada.
2. **O formulário usa uma server action.** Sob `renderToStaticMarkup`, sem o transform do Next, `contratar` é uma função comum e o React **não** emite atributo `action`. Não asserte sobre `action="..."`; asserte sobre o `<input type="hidden" name="sku" value="...">`, que é o que realmente carrega a escolha.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente ao final de `src/app/__tests__/planos-assinar.test.tsx`:

```ts
/**
 * O SELETOR (spec §9).
 *
 * `nivelNoTeste` e o mock de `avaliarAcesso` já existem no topo deste
 * arquivo; aqui o acesso também precisa de MODALIDADE, porque é ela que
 * decide se a oferta de temporada aparece. O mock do topo passa a devolver
 * `acessoDeTeste(nivelNoTeste)` com a modalidade sobrescrita por
 * `modalidadeNoTeste`.
 */
describe('o seletor dos quatro SKUs', () => {
  const ENV_DE_VENDA = {
    MERCADOPAGO_CHECKOUT_ENABLED: 'true',
    PLANO_MVP_MENSAL_CENTAVOS: '5990',
    PLANO_MVP_MENSAL_DE_CENTAVOS: '7990',
    PLANO_MVP_TEMPORADA_CENTAVOS: '39700',
    PLANO_ALL_STAR_MENSAL_CENTAVOS: '9990',
    PLANO_ALL_STAR_MENSAL_DE_CENTAVOS: '14900',
    PLANO_ALL_STAR_TEMPORADA_CENTAVOS: '59700',
    TEMPORADA_FIM: '2099-06-30',
  }

  beforeEach(() => {
    for (const [chave, valor] of Object.entries(ENV_DE_VENDA)) vi.stubEnv(chave, valor)
    nivelNoTeste = 'GRATIS'
    modalidadeNoTeste = null
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.com')
  })

  async function renderizar(parametros: Record<string, string> = {}) {
    const { default: Pagina } = await import('../(app)/assinar/page')
    return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(parametros) }))
  }

  /** Os SKUs que a página oferece, lidos do campo escondido de cada formulário. */
  function skusOferecidos(html: string): string[] {
    return [...html.matchAll(/name="sku" value="([A-Z_]+)"/g)].map((casamento) => casamento[1]!)
  }

  it('o grátis vê os quatro, com preço, e cada botão carrega o seu SKU', async () => {
    const html = await renderizar()

    expect(skusOferecidos(html).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_MENSAL', 'MVP_TEMPORADA'].sort(),
    )
    // Os valores são escritos À MÃO aqui: derivá-los do env faria o teste
    // repetir a mesma conta que a página faz, e uma divisão trocada por
    // multiplicação passaria batida.
    expect(html).toContain('R$ 59,90')
    expect(html).toContain('R$ 397,00')
    expect(html).toContain('R$ 99,90')
    expect(html).toContain('R$ 597,00')
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('o preço "de" aparece só onde foi configurado', async () => {
    const html = await renderizar()
    expect(html).toContain('R$ 79,90')
    expect(html).toContain('R$ 149,00')
    // Temporada não tem "de": nada de riscar um preço que ninguém definiu.
    expect(html).not.toContain('R$ 497,00')
  })

  it('passada a data da temporada, só os mensais são oferecidos', async () => {
    vi.stubEnv('TEMPORADA_FIM', '2020-06-30')
    const html = await renderizar()
    expect(skusOferecidos(html).sort()).toEqual(['ALL_STAR_MENSAL', 'MVP_MENSAL'].sort())
  })

  it('quem é MVP mensal não vê o próprio plano à venda', async () => {
    nivelNoTeste = 'MVP'
    modalidadeNoTeste = 'MENSAL'
    const html = await renderizar()
    expect(skusOferecidos(html)).not.toContain('MVP_MENSAL')
    expect(skusOferecidos(html).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_TEMPORADA'].sort(),
    )
  })

  it('para quem já paga, a tela avisa ANTES de cobrar que o plano atual acaba sem devolução', async () => {
    nivelNoTeste = 'MVP'
    modalidadeNoTeste = 'MENSAL'
    const html = await renderizar()
    expect(html).toMatch(/encerrad|substitu/i)
    expect(html).toMatch(/sem devolu/i)
  })

  it('para o grátis não há aviso de substituição — não há o que substituir', async () => {
    const html = await renderizar()
    expect(html).not.toMatch(/sem devolu/i)
  })

  it('quem já está no topo não vê botão nenhum, e a tela explica', async () => {
    nivelNoTeste = 'ALL_STAR'
    modalidadeNoTeste = 'TEMPORADA'
    const html = await renderizar()
    expect(skusOferecidos(html)).toEqual([])
    expect(html).toMatch(/plano mais completo|n[ãa]o h[áa] plano acima/i)
  })

  it('com o checkout desligado, a comparação continua e ninguém compra', async () => {
    vi.stubEnv('MERCADOPAGO_CHECKOUT_ENABLED', 'false')
    const html = await renderizar()
    expect(skusOferecidos(html)).toEqual([])
    expect(html).toContain('em breve')
    // A comparação é o valor da página mesmo sem venda.
    expect(html).toContain('All Star')
  })

  it('o erro devolvido pela ação vira mensagem, e só os códigos conhecidos', async () => {
    expect(await renderizar({ erro: 'limite' })).toContain('Muitas tentativas')
    // A carga forjada precisa ser uma string que NÃO exista em copy nenhuma
    // do repositório. Uma versão anterior deste teste usava a palavra
    // "alerta" e colidia com o benefício legítimo "Dois filtros de alerta no
    // Telegram" — o teste falhava sem que nada estivesse errado na página.
    // O que está sob prova: `?erro=<qualquer coisa>` não vira texto dentro da
    // página, porque só código conhecido vira mensagem. Num app que leva a
    // uma casa de apostas, texto de atacante dentro de um alerta da própria
    // NIP é o vetor.
    const forjado = await renderizar({ erro: '<script>xyzzy-forjado</script>' })
    expect(forjado).not.toContain('xyzzy-forjado')
  })
})
```

E no topo do arquivo, troque o mock de `avaliarAcesso` para carregar a modalidade junto:

```ts
let nivelNoTeste: 'GRATIS' | 'MVP' | 'ALL_STAR' = 'GRATIS'
let modalidadeNoTeste: 'MENSAL' | 'TEMPORADA' | null = null
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return {
    avaliarAcesso: async () => ({ ...acessoDeTeste(nivelNoTeste), modalidade: modalidadeNoTeste }),
  }
})
```

Acrescente `afterEach` e `beforeEach` ao import de `vitest`.

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/app/__tests__/planos-assinar.test.tsx
```

Esperado: FAIL nos describes novos — nenhum `name="sku"` no HTML. Os describes antigos continuam passando.

- [ ] **Step 3: Escreva `precoEmReais`**

Crie `src/components/planos/preco.ts`:

```ts
/**
 * PREÇO EM REAIS, À MÃO — e não por `Intl.NumberFormat`.
 *
 * Duas razões, as duas práticas. `Intl` com `style: 'currency'` insere um
 * espaço NÃO SEPARÁVEL (U+00A0) entre o símbolo e o número; o HTML sai com
 * esse caractere literal, e qualquer asserção escrita com espaço comum falha
 * de um jeito que ninguém enxerga lendo o diff. E o resultado depende dos
 * dados de ICU do runtime — este é o número que a pessoa lê ANTES de ser
 * cobrada, e ele tem que sair igual em todo lugar.
 */
export function precoEmReais(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`
}
```

E acrescente a `nivel-do-plano.ts`, ao lado de `ROTULO_DO_NIVEL`:

```ts
/** Nomes comerciais da modalidade, para a tela. */
export const ROTULO_DA_MODALIDADE: Record<Modalidade, string> = {
  MENSAL: 'Mensal',
  TEMPORADA: 'Temporada',
}
```

- [ ] **Step 4: Ponha o seletor na página**

Em `src/app/(app)/assinar/page.tsx`, acrescente aos imports:

```ts
import { precoEmReais } from '@/components/planos/preco'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { precosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { ofertasDisponiveis } from '@/modules/plataforma/assinatura/sku'
import { ROTULO_DA_MODALIDADE } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { contratar } from './acoes'
```

No corpo, depois de `const config = configuracaoProdutoPago()`:

```ts
  const { fuso } = (await rulesetAtivo()).rodada
  const precos = precosDosPlanos(fuso)
  const agora = new Date()
  // Sem preço configurado não há o que vender, e a página continua valendo
  // como comparação — que é o que ela é hoje em produção.
  const ofertas =
    config.checkoutHabilitado && precos ? ofertasDisponiveis(acesso, agora, precos.fimDaTemporada) : []
  const substitui = ofertas.some((oferta) => oferta.substituiPlanoAtual)
```

E troque o bloco que hoje contém o `else` de "em breve" por:

```tsx
        {ofertas.length > 0 && precos ? (
          <section style={{ display: 'grid', gap: 12 }}>
            {/* O AVISO VEM ANTES DOS BOTÕES, não depois (spec §9). Depois de
                cobrar, avisar já não é avisar. */}
            {substitui && (
              <p role="note" style={{ margin: 0, fontSize: 14, color: semantico.textoSecundario }}>
                Ao contratar, o seu plano atual é encerrado assim que o pagamento for confirmado,
                sem devolução do período restante.
              </p>
            )}
            {ofertas.map((oferta) => {
              const preco = precos.porSku[oferta.sku]
              return (
                <form key={oferta.sku} action={contratar}>
                  <input type="hidden" name="sku" value={oferta.sku} />
                  <button
                    type="submit"
                    style={{
                      width: '100%',
                      display: 'grid',
                      gap: 4,
                      border: 0,
                      borderRadius: 10,
                      padding: 13,
                      background: componente.ctaFundo,
                      color: semantico.textoSobreCor,
                      fontFamily: semantico.fonteTitulo,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>
                      {ROTULO_DO_NIVEL[oferta.nivelDoPlano]} ·{' '}
                      {ROTULO_DA_MODALIDADE[oferta.modalidade]}
                    </span>
                    <span style={{ fontSize: 20 }}>
                      {preco.deCentavos && (
                        <s style={{ opacity: 0.7, fontSize: 15, marginRight: 8 }}>
                          {precoEmReais(preco.deCentavos)}
                        </s>
                      )}
                      {precoEmReais(preco.centavos)}
                      <span style={{ fontSize: 13, opacity: 0.85 }}>
                        {oferta.modalidade === 'MENSAL'
                          ? ' / mês'
                          : ' · até o fim da temporada'}
                      </span>
                    </span>
                  </button>
                </form>
              )
            })}
          </section>
        ) : (
          <p style={{ margin: 0, color: semantico.textoSecundario }}>
            {config.checkoutHabilitado && precos && acesso.nivel !== 'GRATIS'
              ? 'Você já está no plano mais completo disponível hoje.'
              : 'A contratação pelo app chega em breve. Enquanto isso, fale com quem administra a sua conta.'}
          </p>
        )}
```

- [ ] **Step 5: Rode o teste e veja passar**

```
npx vitest run src/app/__tests__/planos-assinar.test.tsx
```

Esperado: PASS — os describes antigos e os novos. Se `'R$ 59,90'` falhar mesmo com o valor certo na tela, é a armadilha do U+00A0: confirme que a página usa `precoEmReais` e não `toLocaleString`.

- [ ] **Step 6: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
npx vitest run src/app/__tests__
```

Esperado: tudo verde. **Não commite.**

---

### Task 10: A conta e o aviso da temporada

A linha "Conta" da matriz (§5) pede nível, modalidade e próxima cobrança. E o §14 pede que alguém lembre de `TEMPORADA_FIM` antes de junho, porque ninguém vai lembrar sozinho.

**Files:**
- Modify: `src/app/(app)/conta/blocos.tsx` (`BlocoAssinatura`)
- Modify: `src/app/(admin)/admin/usuarios/page.tsx`
- Test: `src/app/__tests__/telas-05-conta.test.ts` (acrescentar describe)

**Interfaces:**
- Consumes: `ROTULO_DA_MODALIDADE` (Task 9), `ROTULO_DO_NIVEL` e `acesso.modalidade` (Plano A), `avisoDaTemporada` (Task 2).
- Produces: nenhum símbolo novo.

**O que já funciona e não deve ser reescrito:** `podeCancelar` em `conta/page.tsx:113` exige `assinatura.mercadopagoId`, e o contrato de temporada nasce com esse campo NULO (ruling R-B4). O botão "Cancelar assinatura" já não aparece para temporada, sem `if` novo — o teste abaixo trava esse comportamento para que ninguém o desfaça sem perceber. `proximaCobrancaEmTexto` já devolve `null` quando não há data, e o webhook grava `proximaCobranca: null` na temporada (Task 6): a contagem regressiva também já some sozinha.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente ao final de `src/app/__tests__/telas-05-conta.test.ts`:

```ts
describe('a conta diz o plano na linguagem da NIP (spec de planos, §5)', () => {
  it('mensal: nível, modalidade e a próxima cobrança', async () => {
    acessoNoTeste = {
      nivel: 'MVP',
      direitoId: 'direito-1',
      validoAte: new Date('2026-11-01T12:00:00.000Z'),
      modalidade: 'MENSAL',
    }
    const { assinaturas } = await import('../../modules/dominio/db/schema')
    await banco.db.delete(assinaturas)
    await banco.db.insert(assinaturas).values({
      usuarioId: USUARIO_DEMO,
      mercadopagoId: 'sub-mvp',
      referenciaExterna: 'ref-mvp',
      status: 'ATIVA',
      plano: 'NIP MVP mensal',
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      proximaCobranca: new Date('2026-11-01T12:00:00.000Z'),
      atualizadoEm: new Date('2026-10-01T12:00:00.000Z'),
    })

    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('MVP')
    expect(html).toContain('Mensal')
    expect(html).toContain('Próxima cobrança')
    expect(html).toContain('Cancelar assinatura')
  })

  it('temporada: acesso até a data, sem próxima cobrança e sem botão de cancelar', async () => {
    acessoNoTeste = {
      nivel: 'ALL_STAR',
      direitoId: 'direito-2',
      validoAte: new Date('2027-07-01T03:00:00.000Z'),
      modalidade: 'TEMPORADA',
    }
    const { assinaturas } = await import('../../modules/dominio/db/schema')
    await banco.db.delete(assinaturas)
    await banco.db.insert(assinaturas).values({
      usuarioId: USUARIO_DEMO,
      // Temporada não tem `preapproval`: não há o que cancelar no provedor,
      // e é esse NULO que faz o botão sumir sem nenhum `if` novo na tela.
      mercadopagoId: null,
      referenciaExterna: 'ref-temporada',
      status: 'ATIVA',
      plano: 'NIP All Star temporada',
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
      proximaCobranca: null,
      atualizadoEm: new Date('2026-10-01T12:00:00.000Z'),
    })

    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('All Star')
    expect(html).toContain('Temporada')
    expect(html).toContain('Válido até')
    expect(html).not.toContain('Próxima cobrança')
    expect(html).not.toContain('Cancelar assinatura')
  })

  it('o grátis continua vendo o convite, não um relatório', async () => {
    acessoNoTeste = acessoDeTeste('GRATIS')
    const { assinaturas } = await import('../../modules/dominio/db/schema')
    await banco.db.delete(assinaturas)

    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('Sem plano ativo')
    expect(html).not.toContain('Próxima cobrança')
  })
})
```

- [ ] **Step 2: Rode o teste e veja falhar**

```
npx vitest run src/app/__tests__/telas-05-conta.test.ts
```

Esperado: FAIL — `'Mensal'` e `'Temporada'` não aparecem; a tela ainda mostra só o texto livre do provedor em "Plano".

- [ ] **Step 3: Faça o bloco falar a linguagem da NIP**

Em `src/app/(app)/conta/blocos.tsx`, dentro de `BlocoAssinatura`, troque o par `<dt>Plano</dt>` condicionado a `assinatura.plano` por:

```tsx
            {/* O PLANO na linguagem da NIP, não a descrição do provedor.
                `assinatura.plano` é texto livre que o Mercado Pago devolve e
                às vezes vem vazio; nível e modalidade são o contrato, e é o
                que a pessoa reconhece da tela onde comprou. */}
            {acesso.nivel !== 'GRATIS' && (
              <>
                <dt style={{ color: semantico.textoSecundario }}>Plano</dt>
                <dd style={{ margin: 0 }}>
                  {ROTULO_DO_NIVEL[acesso.nivel]}
                  {acesso.modalidade && ` · ${ROTULO_DA_MODALIDADE[acesso.modalidade]}`}
                </dd>
              </>
            )}
```

Acrescente ao topo do arquivo:

```ts
import {
  ROTULO_DA_MODALIDADE,
  ROTULO_DO_NIVEL,
} from '@/modules/plataforma/assinatura/nivel-do-plano'
```

O resto do bloco — "Situação", "Válido até", a contagem regressiva e o botão de cancelar — fica como está: cada um deles já responde certo à temporada pelos dados, não por um caso especial.

- [ ] **Step 4: Ponha o aviso de `TEMPORADA_FIM` no painel**

Em `src/app/(admin)/admin/usuarios/page.tsx`, depois de `const linkRedefinicao = ...`:

```ts
  // Spec §14: "Ninguém vai lembrar de mudar em junho." Então o painel lembra.
  // A leitura não pode derrubar a tela de usuários se o env estiver
  // incompleto — quem falha alto por preço é o seletor de planos, que é onde
  // a falha importa.
  let avisoTemporada: string | null = null
  try {
    const { fuso } = (await rulesetAtivo()).rodada
    avisoTemporada = avisoDaTemporada(precosDosPlanos(fuso)?.fimDaTemporada ?? null, new Date())
  } catch {
    avisoTemporada = null
  }
```

E logo depois do `<h1>`:

```tsx
      {avisoTemporada && (
        <p role="status" style={{ fontSize: 13, padding: 8, background: '#fff0cc' }}>
          {avisoTemporada}
        </p>
      )}
```

Imports novos: `rulesetAtivo` de `@/modules/entrega/ruleset-ativo`, `avisoDaTemporada` e `precosDosPlanos` de `@/modules/plataforma/assinatura/precos`.

- [ ] **Step 5: Rode os testes e veja passar**

```
npx vitest run src/app/__tests__/telas-05-conta.test.ts
```

Esperado: PASS. O `avisoDaTemporada` já tem os seus quatro testes na Task 2; o painel admin não ganha suíte de render nova — a lógica inteira está na função pura, e o que sobra na página é um `<p>` condicional.

- [ ] **Step 6: Verificação**

```
npm run typecheck && npm run lint && npm run boundaries
npx vitest run src/app/__tests__
```

Esperado: tudo verde. **Não commite.**

---

### Task 11: Fechamento

A bateria inteira, a documentação operacional e **o commit** — o único de toda a entrega.

**Files:**
- Modify: `.env.example`
- Modify: `docs/runbooks/cobranca-e-acesso.md`
- Verify: tudo

**Interfaces:** nenhuma. Esta task não escreve código de produto.

- [ ] **Step 1: Tire do `.env.example` o que já não existe**

Apague as linhas `MERCADOPAGO_PLANO_NOME=` e `MERCADOPAGO_PLANO_VALOR_CENTAVOS=`. Elas foram substituídas pelos quatro `PLANO_*_CENTAVOS` da Task 2. Confirme que nada mais no repositório as cita:

```
grep -rn "MERCADOPAGO_PLANO_" --include='*.ts' --include='*.tsx' --include='*.md' --include='*.mjs' . | grep -v node_modules | grep -v docs/superpowers
```

Esperado: nenhuma linha fora de `docs/superpowers/` (spec e planos registram a decisão e devem continuar dizendo o que diziam).

- [ ] **Step 2: Atualize o runbook de cobrança**

Em `docs/runbooks/cobranca-e-acesso.md`, o bloco de env (por volta da linha 57) ainda mostra `MERCADOPAGO_PLANO_NOME=IA da NBA Mensal` e `MERCADOPAGO_PLANO_VALOR_CENTAVOS=4990`. Troque pelos sete valores de §10 (copie o bloco da Task 2, Step 5) e acrescente, logo abaixo:

```markdown
Os quatro preços e `TEMPORADA_FIM` são obrigatórios quando
`MERCADOPAGO_CHECKOUT_ENABLED=true` — sem qualquer um deles a aplicação recusa o
checkout na hora de ler a configuração, em vez de vender por um valor que
ninguém decidiu.

`TEMPORADA_FIM` é o último dia INCLUSIVE da temporada vendida, no fuso da
rodada. Passada a data, o seletor esconde a modalidade de temporada sozinho e o
painel de usuários avisa 30 dias antes. **É anual: alguém precisa atualizá-lo
antes de cada temporada nova** — renovação automática foi descartada na decisão
4 da spec de planos.

O estorno de temporada é MANUAL: painel do Mercado Pago mais revogação do
direito pelo admin, com motivo. O upgrade não devolve o período restante, e a
tela de compra avisa isso antes de cobrar.
```

O runbook também lista os endpoints do provedor que a aplicação usa (por volta
da linha 48). Acrescente os dois novos: `POST /checkout/preferences` (criação da
compra de temporada) e `GET /v1/payments/search` (a volta dela, por
`external_reference`). Os três tópicos de webhook já documentados —
`subscription_preapproval`, `subscription_authorized_payment` e `payment` — não
mudam: o `payment` já estava lá e é ele que a temporada usa.

- [ ] **Step 3: Rode a bateria completa**

Uma de cada vez, nesta ordem:

```
npm run typecheck
npm run lint
npm run boundaries
npm run test
npm run build
```

Esperado: cinco verdes. Se `npm run test` falhar em alguma suíte que este plano não tocou, **pare e reporte** — é regressão, não ajuste de teste.

- [ ] **Step 4: Confira a migration contra o journal**

```
npm run db:status
```

Esperado: a saída acusa **uma** migration pendente (`0028_...`). Ela é aplicada em produção depois do merge, com `npm run db:migrate`, nunca por esta task.

- [ ] **Step 5: Percorra o "Pronto quando" da spec, item a item**

A spec §13, bloco "Plano B — cobrança", tem seis itens. Para cada um, aponte o teste que o prova e **rode-o**, anotando o nome do arquivo no relatório:

| Item da spec | Onde está provado |
| --- | --- |
| `/assinar` mostra quatro SKUs com os preços de §10, "de/por", e esconde a temporada passada a data | `src/app/__tests__/planos-assinar.test.tsx` — describe "o seletor dos quatro SKUs" |
| Mensal por nível: o webhook grava `nivel_do_plano` e `modalidade` no contrato e no direito | `webhook-temporada.test.ts` — describe "mensal: o nível vem da tentativa" |
| Temporada: `payment` aprovado cria contrato e direito com `fim = TEMPORADA_FIM` e sem `proximaCobranca`; entrega dupla não duplica | `webhook-temporada.test.ts` — describe "temporada: um pagamento, um direito com fim cravado" |
| Upgrade: direito antigo com `revogado_em` e motivo `UPGRADE`; a porta fake registra o cancelamento; em nenhum instante `avaliarAcesso` devolveu menos | `upgrade.test.ts` |
| Retorno do navegador sem webhook não concede acesso | `src/app/__tests__/paywall.test.ts` e `retorno/mercadopago/page.tsx` (inalterado por este plano) |
| Porta fake cobre os métodos novos; nenhum teste chama o Mercado Pago de verdade | `pagamento-unico.test.ts` |

Para o penúltimo, confirme que `retorno/mercadopago/page.tsx` continua decidindo por `acesso.nivel` e **não** lê nenhum `searchParams`:

```
grep -n "searchParams\|acesso.nivel" "src/app/(app)/retorno/mercadopago/page.tsx"
```

Esperado: nenhuma ocorrência de `searchParams`.

- [ ] **Step 6: Prove que nada chama o provedor de verdade**

```
grep -rn "api.mercadopago.com" src --include='*.test.ts' --include='*.test.tsx'
```

Esperado: nenhuma linha. As referências a esse host só podem estar em `mercadopago.ts` e em asserções sobre a URL passada a um `fetch` mockado (arquivo `pagamento-unico.test.ts`) — se aparecer em algum teste, confirme que é asserção sobre mock, nunca chamada.

- [ ] **Step 7: Confira o índice antes de commitar**

```
git status --short
```

Nada de `node_modules/`, `.superpowers/`, `.env.local` ou arquivo de rascunho. Só os arquivos deste plano, mais `drizzle/0028_*.sql`, `drizzle/down/0028_*.sql` e `drizzle/meta/_journal.json`.

- [ ] **Step 8: Commite — um só**

```bash
git add -A
git commit -m "$(cat <<'MSGEOF'
Planos de assinatura, parte B: os quatro SKUs passam a ser vendidos

O SKU escolhido é gravado na tentativa de checkout antes da rede, e é de lá
que o webhook lê o que conceder — o provedor só devolve a referência opaca.
Mensal continua sendo o preapproval de sempre, um por nível; temporada é uma
preferência de Checkout Pro cujo pagamento aprovado vira um direito com fim
cravado em TEMPORADA_FIM, sem recorrência.

O upgrade acontece na ordem que importa: o direito novo nasce, o antigo é
revogado depois. Entre os dois instantes valem os dois, e quem acabou de pagar
mais nunca vê menos. O cancelamento do contrato substituído é marcado dentro
da transação e executado fora dela, com retentativa no cron de reconciliação —
desistir dele seria continuar cobrando quem já trocou de plano.

Preços e a data da temporada saem de env: mudar preço não é mudar código.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSGEOF
)"
```

**Sem push e sem PR.** Publicar é decisão do parceiro, e a migration `0028` só é aplicada em produção quando ele disser.

- [ ] **Step 9: Reporte o que ficou de fora**

No relatório final, registre explicitamente, para o parceiro decidir depois:

- **`consultarPagamento(id)` não foi implementado** (ruling R-B2) — não havia chamador.
- **O estorno de temporada continua manual** (spec §9) — painel do Mercado Pago mais revogação pelo admin.
- **`MVP abaixo de All Star` inverte o vocabulário do produto** (spec §12) — é a segunda vez que o conflito aparece, e a spec pede que o parceiro decida com o cliente **antes do Plano B ir ao ar**. Esta entrega usa os nomes enviados.
- **A sonda do chat (`npm run chat:sondar`) é não determinística** — três execuções em 16/09 deram três conjuntos de falhas diferentes com o mesmo prompt. Não use uma execução isolada para validar mudança de prompt.

---

## Auto-revisão (feita ao escrever o plano, 17/09)

**1. Cobertura da spec.** §9 e §10 inteiros têm task:

| Requisito de §9/§10 | Task |
| --- | --- |
| Quatro SKUs; `/assinar` vira seletor com benefícios | 1, 9 |
| Mensal: preapproval por nível, `nomePlano` do SKU, valor de §10 | 1, 5 |
| Mensal: webhook grava `nivel_do_plano` e `modalidade` | 6 |
| `proximaCobranca` e contagem regressiva continuam iguais | 6, 10 |
| Temporada: porta ganha criação de pagamento único | 3 |
| Temporada: webhook interpreta `payment`, cria contrato com `fim` em `TEMPORADA_FIM` e `proximaCobranca = null` | 6 (o adapter já interpretava `payment`) |
| `fim` = meia-noite SEGUINTE a `TEMPORADA_FIM`, via `intervaloDoDia(...).fim` | 2 |
| Temporada só é oferecida enquanto `agora < TEMPORADA_FIM` | 1, 9 |
| Upgrade: novo contrato nasce, direito antigo revogado com `UPGRADE`, porta cancela o mensal | 7 |
| A tela avisa antes de cobrar, sem devolução | 9 |
| Mensal → temporada segue a regra do upgrade | 1, 7 |
| Seletor não oferece nível igual/menor na mesma modalidade, nem temporada → mensal | 1 |
| Downgrade não existe | 1 (ruling R-B5) |
| Retorno do navegador nunca concede | 11 (verificação; nada muda) |
| As sete variáveis de env, "de" só quando maior | 2 |
| `MERCADOPAGO_PLANO_*` apagados no Plano B | 5, 11 |
| Aviso de 30 dias de `TEMPORADA_FIM` no painel (§14) | 2, 10 |
| Linha "Conta" da matriz (§5): nível, modalidade, próxima cobrança | 10 |

Um item de §9 ficou **deliberadamente de fora**, com ruling: `consultarPagamento(id)` (R-B2). Um item de §14 fica fora por ser manual e a própria spec dizer isso: estorno de temporada.

**2. Marcadores.** Nenhum "TBD", "TODO", "implementar depois" ou "igual à Task N" sem o código repetido. Todo passo de código traz o código.

**3. Consistência de tipos.** Conferido entre as tasks:

- `Sku`, `composicaoDoSku`, `NOME_DO_SKU`, `ehSku`, `ofertasDisponiveis` (Task 1) — o mesmo nome em 5, 9.
- `PrecosDosPlanos.porSku` / `.fimDaTemporada`, `precosDosPlanos(fuso, ambiente?)`, `avisoDaTemporada` (Task 2) — o mesmo em 5, 6, 8, 9, 10.
- `PedidoPagamentoUnico`, `PagamentoExterno`, `criarPagamentoUnico`, `buscarPagamentoPorReferencia` (Task 3) — o mesmo em 5, 8.
- `tentativasCheckout.nivelDoPlano` / `.modalidade` (Task 4) — lidos em 5, 6, 8.
- `iniciarCheckout(db, porta, config, precos, entrada)` com `entrada.sku` (Task 5) — a ordem dos argumentos é a mesma na action e em `spec04.test.ts`.
- `aplicarEventoPagamento(db, provedor, evento, agora, fimDaTemporada)` e `processarNotificacao(..., entrada.fimDaTemporada)` (Task 6) — a mesma aridade em 7, 8 e nos testes.
- `reconciliarPagamentos(db, porta, agora, fimDaTemporada, limite?)` (Task 6) — a mesma em 8.
- `cancelarContratosSubstituidos(db, porta, agora, limite?)` (Task 7) — a mesma em 8.
- `ROTULO_DA_MODALIDADE` (Task 9) — consumido em 10.
- `precoEmReais` (Task 9) — só a Task 9 usa.
