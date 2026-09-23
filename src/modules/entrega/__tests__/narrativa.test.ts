import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { llmChamadas } from '../../dominio/db/schema'
import { LLMFake } from '../../ingestao/llm'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed } from '../lista-secreta'
import {
  LIMITE_NARRATIVA,
  enriquecerComNarrativas,
  numerosDoItem,
  promptDeNarrativa,
  semTravessao,
} from '../narrativa'

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

  it('manda NÃO citar o percentual de confiança e pede menos do que o validador aceita (identidade 04)', async () => {
    // Medido na carga real de 07/09: 219 de 276 chamadas reprovadas por
    // "número inventado". O sistema dizia "o percentual é nota de confiança"
    // e os fatos não traziam o percentual — o modelo então INVENTAVA um
    // ("nota de confiança: 66%"). Mais 34 reprovações por estourar 280.
    const feed = await lerFeed(banco.db, HOJE)
    const p = promptDeNarrativa(feed!.conteudo.itens[0]!)
    const sistema = p.sistema.toLowerCase()
    expect(sistema).toContain('não cite o percentual')
    // O modelo estoura o limite que lhe é dado; pede-se menos para caber.
    expect(p.sistema).toContain('260 caracteres')
    expect(p.sistema).not.toContain('300 caracteres')
    // Teto do parceiro (19/09) — a folga é do pedido, não da regra.
    expect(LIMITE_NARRATIVA).toBe(300)
  })

  it('pede tom DIDÁTICO e proíbe travessão (decisões do parceiro, 19/09)', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const sistema = promptDeNarrativa(feed!.conteudo.itens[0]!).sistema.toLowerCase()
    // Didático: o assinante não acompanha estatística.
    expect(sistema).toContain('não acompanha estatística')
    expect(sistema).toContain('português simples')
    // Travessão: pedido no prompt E saneado depois, para não custar recusa.
    expect(sistema).toContain('não use travessão')
  })
})

describe('travessão: a assinatura de texto de máquina não chega ao card', () => {
  it('vira vírgula, sem deixar pontuação dobrada', () => {
    expect(semTravessao('Volta à média — ele vem de duas atuações fracas.')).toBe(
      'Volta à média, ele vem de duas atuações fracas.',
    )
    // Travessão colado, sem espaços em volta
    expect(semTravessao('Alvo 25—linha baixa para o nível dele.')).toBe(
      'Alvo 25, linha baixa para o nível dele.',
    )
    // Meia-risca também sai
    expect(semTravessao('Sai o titular – ele assume a bola.')).toBe(
      'Sai o titular, ele assume a bola.',
    )
  })

  it('não cria ", ," nem " ," quando o modelo já pontuou em volta', () => {
    expect(semTravessao('Ele joga bem, — e hoje pega defesa fraca.')).toBe(
      'Ele joga bem, e hoje pega defesa fraca.',
    )
    expect(semTravessao('Desfalque no topo —.')).toBe('Desfalque no topo.')
  })

  it('texto sem travessão passa intacto', () => {
    const frase = 'Ele vem de 3 jogos acima da linha e o time joga em casa.'
    expect(semTravessao(frase)).toBe(frase)
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

  it('reaproveita a narrativa do snapshot anterior para item idêntico — zero chamadas (identidade 04)', async () => {
    // A republicação depois das odds gerava TODAS as narrativas de novo: o
    // hash mudou (as odds entraram no item), mas jogador, atributo e linha
    // eram os mesmos. Todo dia o cron pagava a lista duas vezes.
    // Texto FIXO nos dois lados: o banco rotativo do fake pode, conforme a
    // posição, devolver um texto que o validador reprova — e um item sem
    // narrativa na primeira passada seria gerado de novo, legitimamente. O
    // que se testa aqui é o reaproveitamento, não a sorte do fake.
    const feed = await lerFeed(banco.db, HOJE)
    const primeira = await enriquecerComNarrativas(
      banco.db,
      new LLMFake({ texto: 'Primeira passada, sem número nenhum.' }),
      feed!.conteudo,
    )
    expect(primeira.conteudo.itens.every((i) => typeof i.narrativa === 'string')).toBe(true)

    const porta = new LLMFake({ texto: 'Segunda passada, que não deve rodar.' })
    const segunda = await enriquecerComNarrativas(banco.db, porta, feed!.conteudo, {
      anterior: primeira.conteudo,
    })

    expect(porta.chamadas).toHaveLength(0)
    expect(segunda.geradas).toBe(0)
    expect(segunda.reaproveitadas).toBe(feed!.conteudo.itens.length)
    expect(segunda.conteudo.itens.map((i) => i.narrativa)).toEqual(primeira.conteudo.itens.map((i) => i.narrativa))
    expect(segunda.conteudo.resumoDoDia).toBe(primeira.conteudo.resumoDoDia)
  })

  it('gera só para o item NOVO, e refaz o resumo porque a lista mudou', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const primeira = await enriquecerComNarrativas(
      banco.db,
      new LLMFake({ texto: 'Primeira passada, sem número nenhum.' }),
      feed!.conteudo,
    )
    expect(primeira.conteudo.itens.every((i) => typeof i.narrativa === 'string')).toBe(true)
    // O anterior não conhece o primeiro item: é como se ele tivesse entrado agora.
    const anterior = { ...primeira.conteudo, itens: primeira.conteudo.itens.slice(1) }

    const porta = new LLMFake({ texto: 'Só o item novo passa por aqui.' })
    const r = await enriquecerComNarrativas(banco.db, porta, feed!.conteudo, { anterior })

    expect(porta.chamadas.filter((c) => c.perfil === 'narrativa')).toHaveLength(1)
    expect(porta.chamadas.filter((c) => c.perfil === 'resumo')).toHaveLength(1)
    expect(r.geradas).toBe(2) // o item novo e o resumo
    expect(r.reaproveitadas).toBe(feed!.conteudo.itens.length - 1)
    expect(r.conteudo.itens[0]!.narrativa).toBe('Só o item novo passa por aqui.')
    expect(r.conteudo.itens[1]!.narrativa).toBe('Primeira passada, sem número nenhum.')
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

  it('resposta TRUNCADA (finish_reason length) é reprovada — o card não mostra frase cortada', async () => {
    // O texto padrão do LLMFake passa no validador; só o `truncado` o reprova.
    await banco.db.delete(llmChamadas)
    const feed = await lerFeed(banco.db, HOJE)
    const r = await enriquecerComNarrativas(
      banco.db,
      new LLMFake({ truncado: true }),
      feed!.conteudo,
    )

    expect(r.geradas).toBe(0)
    expect(r.reprovadas).toBeGreaterThan(0)
    expect(r.conteudo.itens.every((i) => i.narrativa == null)).toBe(true)
    expect(r.conteudo.resumoDoDia ?? null).toBeNull()
    const linhas = await banco.db.select().from(llmChamadas)
    expect(linhas.every((l) => l.ok === false && l.erro === 'reprovado: truncada')).toBe(true)
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
