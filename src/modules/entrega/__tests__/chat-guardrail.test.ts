import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { usuarios } from '../../dominio/db/schema'
import { LLMFake, validarTexto } from '../../ingestao/llm'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { intervaloDoDia } from '../../dominio/rodada'
import { RECUSA_FORA_DE_ESCOPO } from '../chat-prompt'
import { responder } from '../chat'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'
const FUSO = ruleset.rodada.fuso
const TEMPORADA = temporadaDe(intervaloDoDia(HOJE, FUSO).inicio, calendarioDoRuleset(ruleset))

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  await semearDemo(banco.db, ruleset, AGORA)
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: 'guardrail@teste.com', senhaHash: 'x' })
    .returning()
  usuarioId = u!.id
}, 180_000)
afterAll(async () => {
  await banco.fechar()
})

let chamada = 0
// Espaçado em minutos: o `responder` tem limite de 5 perguntas por minuto por
// usuário, e um arquivo de teste que o esbarrasse falharia por um freio que não
// é o assunto daqui.
const proximoInstante = () => new Date(AGORA.getTime() + chamada++ * 60_000)

const perguntar = async () => {
  const porta = new LLMFake()
  const r = await responder(banco.db, porta, {
    usuarioId,
    texto: 'como funciona o Fire Live?',
    dataReferencia: HOJE,
    fuso: FUSO,
    temporada: TEMPORADA,
    agora: proximoInstante(),
    cotaDiaria: 20,
  })
  return { r, pedido: porta.chamadas[0]!.pedido }
}

describe('o guardrail de assunto', () => {
  it('a frase de recusa atravessa o validador — ela não tem número nenhum', () => {
    // Se tivesse, o validador a recusaria e o usuário veria "indisponível" no
    // lugar da recusa educada: o guardrail falharia justamente ao recusar.
    expect(validarTexto(RECUSA_FORA_DE_ESCOPO, { numeros: [], limiteCaracteres: 1200 }).ok).toBe(
      true,
    )
  })

  it('o prompt de sistema nomeia os dois assuntos permitidos e a frase exata da recusa', async () => {
    const { pedido } = await perguntar()
    expect(pedido.sistema).toContain('temporada da NBA')
    expect(pedido.sistema).toContain('funcionamento da plataforma')
    expect(pedido.sistema).toContain(RECUSA_FORA_DE_ESCOPO)
  })

  it('o prompt proíbe VALOR de aposta e promessa de resultado (ADR-0012)', async () => {
    // A proibição em bloco ("NÃO SUGIRA APOSTA") saiu: o produto passou a
    // exibir um ranking estatístico calculado pelo MOTOR quando pedem dica.
    // O que ficou proibido é mais fino, e cada regra tem guardrail em código:
    // o valor continua fora, a promessa continua fora, e citar quem a
    // metodologia não apitou exige a marca — verificada em `chat.ts`.
    //
    // A ADR-0004 (odds somente leitura) não mudou: nada aqui envia aposta.
    const { pedido } = await perguntar()
    const sistema = pedido.sistema.toLowerCase()
    expect(sistema).toContain('não diga quanto apostar')
    expect(sistema).toContain('não prometa resultado')
    expect(sistema).toContain('fora da lista de hoje')
    // Taxa é passado, não previsão: a fração nunca vira porcentagem.
    expect(sistema).toContain('nunca convertidas em porcentagem')
  })

  it('a lista do dia chega ao modelo — quem chega aqui já passou pelo portão de nível', async () => {
    const { pedido } = await perguntar()
    expect(pedido.usuario).toContain('ENTRADAS DE HOJE')
  })
})
