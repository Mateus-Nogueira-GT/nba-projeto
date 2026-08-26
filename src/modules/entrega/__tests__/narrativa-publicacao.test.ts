import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { feedSnapshot } from '../../dominio/db/schema'
import { ErroLLM, LLMFake, type PortaLLM } from '../../ingestao/llm'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import type { ConteudoFeed } from '../lista-secreta'
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

// Cada teste começa sem snapshot: os testes deste bloco não podem depender da
// ordem de execução uns dos outros — um snapshot deixado por um teste anterior
// faria `mudou` sair falso quando o teste seguinte espera true.
beforeEach(async () => {
  await banco.db.delete(feedSnapshot)
})

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

    expect(a.publicou).toBe(true)
    expect(b.publicou).toBe(true)
    const hashA = a.publicou ? a.hash : undefined
    const hashB = b.publicou ? b.hash : undefined
    expect(hashB).toBe(hashA)
  })

  it('reexecutar sem mudança de fatos NÃO chama a LLM de novo', async () => {
    // Hash igual = nada mudou = não há por que pagar geração outra vez.
    await publicar(new LLMFake())
    const segunda = new LLMFake()
    const r = await publicar(segunda)
    // `r.publicou && r.mudou` sozinho passa vacuamente se `publicou` vier
    // `false` — o que este teste NÃO está verificando. Afirma cada parte.
    expect(r.publicou).toBe(true)
    expect(r.publicou && r.mudou).toBe(false)
    expect(segunda.chamadas).toHaveLength(0)
  })

  it('o snapshot gravado carrega as narrativas', async () => {
    await publicar(new LLMFake())
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed!.conteudo.itens.some((i) => typeof i.narrativa === 'string')).toBe(true)
    expect(typeof feed!.conteudo.resumoDoDia).toBe('string')
  })

  it('LLM fora do ar não impede a publicação — o snapshot existe no banco com os itens corretos', async () => {
    const r = await publicar(new LLMFake({ falhar: true }))
    expect(r.publicou).toBe(true)

    // Não basta confiar em `r.publicou`: confere o snapshot GRAVADO, direto
    // na tabela, e via `lerFeed` — os dois precisam mostrar a lista completa.
    const [linha] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(
        and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
      )
      .limit(1)
    expect(linha).toBeDefined()
    const itensGravados = (linha!.conteudoJson as ConteudoFeed).itens
    expect(itensGravados.length).toBeGreaterThan(0)
    expect(itensGravados.every((i) => i.narrativa == null)).toBe(true)

    const feed = await lerFeed(banco.db, HOJE)
    expect(feed!.conteudo.itens.length).toBe(itensGravados.length)
    expect(feed!.conteudo.itens.every((i) => i.narrativa == null)).toBe(true)
  })

  it('morrendo no meio, as narrativas JÁ GERADAS estão gravadas (regressão do tudo-ou-nada)', async () => {
    // Com um provedor degradado (15s de timeout mais uma retentativa por
    // item), o `maxDuration` do cron mata a função por volta da metade da
    // lista. Enquanto o UPDATE era único e no fim, essa morte apagava tudo:
    // nenhuma narrativa gravada, as chamadas já pagas, e — porque o hash não
    // muda — nenhuma nova tentativa no ciclo seguinte. O dia sem texto.
    //
    // Aqui a LLM responde os primeiros itens e TRAVA no item seguinte,
    // exatamente como um provedor que parou de responder. A asserção acontece
    // com a publicação ainda em andamento.
    const ATENDIDOS = 12
    let liberar: () => void = () => {}
    const travada = new Promise<void>((resolve) => {
      liberar = resolve
    })
    let chamadas = 0
    const llmQueTrava: PortaLLM = {
      nome: 'trava-no-meio',
      gerar: async (perfil, pedido) => {
        chamadas += 1
        if (chamadas > ATENDIDOS) {
          await travada
          throw new ErroLLM('timeout', 'provedor parou de responder')
        }
        return {
          texto: 'Vem de sequência abaixo da própria média e encontra um confronto favorável.',
          modelo: `fake/${perfil}`,
          tokensEntrada: pedido.usuario.length,
          tokensSaida: 20,
        }
      },
    }

    const promessa = publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: AGORA,
      ignorarAntecedencia: true,
      llm: llmQueTrava,
    })

    const buscar = async () => {
      const [linha] = await banco.db
        .select()
        .from(feedSnapshot)
        .where(
          and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
        )
        .limit(1)
      return linha
    }

    // Espera o primeiro checkpoint aparecer no banco — a LLM segue travada.
    let linha: Awaited<ReturnType<typeof buscar>> = undefined
    let comNarrativa = 0
    for (let tentativa = 0; tentativa < 500 && comNarrativa === 0; tentativa++) {
      linha = await buscar()
      comNarrativa = ((linha?.conteudoJson as ConteudoFeed | undefined)?.itens ?? []).filter(
        (i) => typeof i.narrativa === 'string',
      ).length
      if (comNarrativa === 0) await new Promise((r) => setTimeout(r, 10))
    }

    const conteudoParcial = linha!.conteudoJson as ConteudoFeed
    const hashDurante = linha!.hash
    // O que já foi gerado ESTÁ no banco, antes de a função terminar.
    expect(comNarrativa).toBeGreaterThanOrEqual(10)
    // E a lista continua INTEIRA: o checkpoint grava os itens não narrados
    // junto, senão o assinante veria entradas sumirem no meio da rodada.
    expect(conteudoParcial.itens.length).toBeGreaterThan(comNarrativa)

    liberar()
    const r = await promessa
    expect(r.publicou).toBe(true)
    // "Inteira" medida contra o total que a própria publicação apurou, não
    // contra um número copiado da demo.
    expect(conteudoParcial.itens.length).toBe(r.publicou ? r.itens : -1)

    // O HASH não mudou por causa de checkpoint: ele é a impressão digital da
    // ESTRATÉGIA. Se mudasse, o ciclo seguinte republicaria e o push repetiria.
    const depois = await buscar()
    expect(depois!.hash).toBe(hashDurante)
    expect(r.publicou && r.hash).toBe(hashDurante)
  }, 60_000)

  it('conta as narrativas REPROVADAS, não só as geradas', async () => {
    // "geradas: 0" sozinho não diz se o provedor caiu ou se o validador
    // recusou o texto — e é a segunda coisa que a spec §4.2 manda contar.
    const r = await publicar(new LLMFake({ texto: 'A probabilidade de bater é enorme.' }))
    expect(r.publicou).toBe(true)
    expect(r.publicou && r.narrativas).toBe(0)
    expect(r.publicou && (r.narrativasReprovadas ?? 0)).toBeGreaterThan(0)
  }, 60_000)

  it('a publicação NÃO espera a LLM: o snapshot já está gravado antes do enriquecimento terminar', async () => {
    // Regressão da latência (Important 2): se a publicação esperasse a LLM
    // antes de gravar, uma LLM lenta atrasaria — ou, com o `maxDuration` do
    // cron, impediria de todo — a publicação. Trava uma LLM em uma promise
    // controlada e confere que a LINHA JÁ EXISTE no banco antes de liberá-la.
    let liberar: () => void = () => {}
    const travada = new Promise<void>((resolve) => {
      liberar = resolve
    })
    const llmLenta: PortaLLM = {
      nome: 'lenta',
      gerar: async () => {
        await travada
        throw new ErroLLM('transporte', 'a LLM nunca deveria ser aguardada antes do insert do snapshot')
      },
    }

    const promessa = publicarListaSecreta(banco.db, ruleset, {
      dataReferencia: HOJE,
      agora: AGORA,
      ignorarAntecedencia: true,
      llm: llmLenta,
    })

    const buscar = () =>
      banco.db
        .select()
        .from(feedSnapshot)
        .where(
          and(eq(feedSnapshot.dataReferencia, HOJE), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
        )
        .limit(1)

    // Espera ativa curta: o insert não depende da LLM, então a linha aparece
    // rápido — a LLM segue travada até `liberar()` ser chamado, bem depois.
    let linha: Awaited<ReturnType<typeof buscar>>[number] | undefined
    for (let tentativa = 0; tentativa < 300 && !linha; tentativa++) {
      ;[linha] = await buscar()
      if (!linha) await new Promise((r) => setTimeout(r, 10))
    }

    expect(linha).toBeDefined()
    expect((linha!.conteudoJson as ConteudoFeed).itens.length).toBeGreaterThan(0)

    liberar()
    const r = await promessa
    expect(r.publicou).toBe(true)
  })
})
