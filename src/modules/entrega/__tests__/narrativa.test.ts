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

// Mesmo padrão do validador (`validador.ts`, NUMERO_NO_TEXTO): número "livre"
// no texto, cercado por não-dígito, com decimal opcional em vírgula ou ponto.
// Serve só para o teste extrair o que o prompt CITA — a fonte da verdade da
// validação continua sendo `validarTexto`.
const NUMERO_NO_TEXTO = /(?<![\d.,º°ªa-zA-Z])(\d+(?:[.,]\d+)?)(?!\d|[.,]\d|[º°ª])/g
function numerosNoTexto(texto: string): number[] {
  return [...texto.matchAll(NUMERO_NO_TEXTO)].map((m) => Number(m[1]!.replace(',', '.')))
}

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
    expect(p.numeros).toContain(item.linha!)
    // A instrução de sistema carrega as proibições do produto — as DUAS que o
    // validador reprova, não só a primeira. Quando cada prompt mantinha a
    // própria lista, "provável" ficou de fora de um deles e toda reprovação
    // virava retentativa paga.
    expect(p.sistema.toLowerCase()).toContain('probabilidade')
    expect(p.sistema.toLowerCase()).toContain('provável')
    // E carrega a metodologia do CJ: sem ela o modelo narra "OPD" sem saber
    // o que a sigla significa.
    expect(p.sistema).toContain('OPD')

    // O teste que importa: todo número que o TEXTO do prompt efetivamente
    // cita precisa estar na lista declarada — é essa lista que o validador
    // usa para não reprovar uma narrativa correta. `toEqual(numerosDoItem(item))`
    // não provava isso: `promptDeNarrativa` devolve literalmente esse valor,
    // então a asserção nunca poderia falhar.
    const citados = numerosNoTexto(p.usuario)
    expect(citados.length).toBeGreaterThan(0)
    for (const numero of citados) {
      expect(p.numeros.some((permitido) => Math.abs(permitido - numero) < 0.05)).toBe(true)
    }
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

  it('a tabela SEPARA "provedor caiu" de "texto reprovado"', async () => {
    // Gravar `ok: true` antes do validador rodar era perder justamente a
    // pergunta que se faz quando as narrativas somem da tela: o provedor
    // falhou ou nós recusamos o texto? Reprovação fica com `modelo`
    // preenchido; falha de provedor, com `modelo` nulo.
    await banco.db.delete(llmChamadas)
    const feed = await lerFeed(banco.db, HOJE)
    await enriquecerComNarrativas(
      banco.db,
      new LLMFake({ texto: 'A probabilidade de bater é enorme.' }),
      feed!.conteudo,
    )

    const linhas = await banco.db.select().from(llmChamadas)
    expect(linhas.length).toBeGreaterThan(0)
    expect(linhas.every((l) => l.ok === false)).toBe(true)
    expect(linhas.every((l) => l.modelo !== null)).toBe(true)
    expect(linhas.every((l) => (l.erro ?? '').startsWith('reprovado:'))).toBe(true)
  })

  it('grava progresso em lotes — o que já foi gerado não depende do fim', async () => {
    // Contrato do checkpoint: o parcial carrega a LISTA INTEIRA (narrados na
    // frente, originais atrás). Gravar só o prefixo encurtaria a lista
    // publicada no meio da rodada e o assinante veria entradas sumirem.
    const feed = await lerFeed(banco.db, HOJE)
    const total = feed!.conteudo.itens.length
    const parciais: number[] = []

    await enriquecerComNarrativas(banco.db, new LLMFake(), feed!.conteudo, {
      lote: 5,
      gravarParcial: async (parcial) => {
        expect(parcial.itens).toHaveLength(total)
        parciais.push(parcial.itens.filter((i) => typeof i.narrativa === 'string').length)
      },
    })

    expect(parciais.length).toBeGreaterThan(1)
    expect(parciais[0]).toBe(5)
    // Monotônico: cada checkpoint sabe tudo que o anterior sabia.
    parciais.forEach((n, i) => i > 0 && expect(n).toBeGreaterThan(parciais[i - 1]!))
  })

  it('gravação de progresso que falha NÃO derruba o enriquecimento', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const r = await enriquecerComNarrativas(banco.db, new LLMFake(), feed!.conteudo, {
      lote: 3,
      gravarParcial: async () => {
        throw new Error('banco fora do ar no checkpoint')
      },
    })
    expect(r.geradas).toBeGreaterThan(0)
  })

  it('não muda nenhum campo de estratégia do item', async () => {
    // A LLM narra; ela não decide. Se um campo de estratégia mudasse aqui, o
    // texto teria virado regra.
    //
    // Compara o item INTEIRO (ignorando só `narrativa`), não uma amostra de
    // cinco campos — conferir só jogadorId/linha/confianca/nivelApito/turbo
    // deixaria passar uma regressão em `alvo1Q`, `metodo`, `oddFaixa` ou
    // `ultimos5` sem que teste nenhum acusasse.
    const feed = await lerFeed(banco.db, HOJE)
    const antes = feed!.conteudo.itens.map((i) => ({ ...i }))
    const r = await enriquecerComNarrativas(banco.db, new LLMFake(), feed!.conteudo)

    r.conteudo.itens.forEach((depois, i) => {
      const original = antes[i]!
      expect({ ...depois, narrativa: undefined }).toEqual({ ...original, narrativa: undefined })
    })
  })

  it('resolve sem lançar mesmo com um item de snapshot antigo, sem `ultimos5`', async () => {
    // `ultimos5` é opcional na leitura (`ItemFeed`: "vazio em snapshot
    // antigo"). Um registro gravado antes deste campo existir chega aqui como
    // `undefined`, não `[]` — e `lerFeed` faz cast cego do JSON armazenado,
    // então nada barra esse formato antes de ele alcançar a narrativa.
    const feed = await lerFeed(banco.db, HOJE)
    const base = feed!.conteudo.itens.find((i) => i.linha !== null)!
    const semUltimos5 = { ...base } as Partial<typeof base>
    delete semUltimos5.ultimos5

    expect(() => promptDeNarrativa(semUltimos5 as typeof base)).not.toThrow()
    expect(() => numerosDoItem(semUltimos5 as typeof base)).not.toThrow()

    const conteudoAntigo = { ...feed!.conteudo, itens: [semUltimos5 as typeof base] }
    await expect(
      enriquecerComNarrativas(banco.db, new LLMFake(), conteudoAntigo),
    ).resolves.toBeDefined()
  })
})
