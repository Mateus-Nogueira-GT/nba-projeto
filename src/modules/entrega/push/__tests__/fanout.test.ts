import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import {
  dispositivos,
  preferenciasNotificacao,
  pushInscricoes,
  sessoes,
  usuarios,
} from '../../../dominio/db/schema'
import { EnvioPushFake } from '../fake'
import {
  configuracaoOperacionalPush,
  enviarLotePush,
  expandirEventoPush,
  expansaoInicial,
  PoliticaHomologacaoPush,
  type MensagemExpansaoPush,
  type MensagemLotePush,
  type PublicadorFanoutPush,
} from '../fanout'
import type { MensagemPushV1 } from '../contrato'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

const AGORA = new Date('2026-08-21T12:00:00Z')
const EVENTO: MensagemPushV1 = {
  versao: 1,
  chave: 'evento-de-teste',
  canal: 'FIRE_LIVE_APITO',
  titulo: 'Alerta de teste',
  corpo: 'Corpo seguro',
  url: '/',
  ocorridoEm: '2026-08-21T11:59:00.000Z',
  expiraEm: '2026-08-21T13:00:00.000Z',
  dados: {
    jogoId: '11111111-1111-4111-8111-111111111111',
    jogadorId: '22222222-2222-4222-8222-222222222222',
    atributo: 'PONTOS',
    nivelJogador: 'MVP',
    alvo1Q: 5,
    modoFire: false,
    opdOrigemNivel: null,
  },
}

const CONFIG = configuracaoOperacionalPush({
  PUSH_BATCH_SIZE: '250',
  PUSH_SEND_CONCURRENCY: '8',
  PUSH_VISIBILITY_TIMEOUT_SECONDS: '120',
  PUSH_RETRY_BASE_SECONDS: '30',
})

class PublicadorFake implements PublicadorFanoutPush {
  expansoes: { mensagem: MensagemExpansaoPush; chave: string }[] = []
  lotes: { mensagem: MensagemLotePush; chave: string }[] = []
  falharContinuacao = false

  async publicarExpansao(mensagem: MensagemExpansaoPush, chave: string) {
    if (this.falharContinuacao) {
      this.falharContinuacao = false
      throw new Error('continuação indisponível')
    }
    this.expansoes.push({ mensagem, chave })
  }

  async publicarLote(mensagem: MensagemLotePush, chave: string) {
    this.lotes.push({ mensagem, chave })
  }
}

async function prepararConta() {
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: 'interno@example.com', senhaHash: 'hash' })
    .returning()
  const [dispositivo] = await banco.db
    .insert(dispositivos)
    .values({ usuarioId: usuario!.id, fingerprint: 'dispositivo', tipo: 'DESKTOP' })
    .returning()
  await banco.db.insert(sessoes).values({
    usuarioId: usuario!.id,
    dispositivoId: dispositivo!.id,
    tokenHash: 'token-hash',
    criadaEm: AGORA,
    expiraEm: new Date('2026-08-22T12:00:00Z'),
  })
  return { usuario: usuario!, dispositivo: dispositivo! }
}

async function criarInscricoes(
  quantidade: number,
  conta: Awaited<ReturnType<typeof prepararConta>>,
) {
  const ids: string[] = []
  for (let inicio = 0; inicio < quantidade; inicio += 500) {
    const lote = Array.from({ length: Math.min(500, quantidade - inicio) }, (_, indice) => ({
      usuarioId: conta.usuario.id,
      dispositivoId: conta.dispositivo.id,
      endpoint: `https://fcm.googleapis.com/wp/${inicio + indice}`,
      chaveP256dh: 'A'.repeat(65),
      chaveAuth: 'B'.repeat(22),
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    }))
    const criadas = await banco.db
      .insert(pushInscricoes)
      .values(lote)
      .returning({ id: pushInscricoes.id })
    ids.push(...criadas.map((item) => item.id))
  }
  return ids
}

beforeEach(async () => {
  banco = await bancoDeTeste()
})

afterEach(async () => {
  await banco.fechar()
})

describe('fan-out durável', () => {
  it('pagina 10 mil inscrições por (criadoEm,id), sem omissão nem inclusão tardia', async () => {
    const conta = await prepararConta()
    const esperadas = await criarInscricoes(10_000, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    const pendentes: MensagemExpansaoPush[] = [expansaoInicial(EVENTO)]
    let inseriuTardia = false

    while (pendentes.length > 0) {
      const atual = pendentes.shift()!
      const antes = publicador.expansoes.length
      await expandirEventoPush(banco.db, publicador, atual, politica, CONFIG, AGORA)
      if (!inseriuTardia) {
        inseriuTardia = true
        await banco.db.insert(pushInscricoes).values({
          usuarioId: conta.usuario.id,
          dispositivoId: conta.dispositivo.id,
          endpoint: 'https://fcm.googleapis.com/wp/tardia',
          chaveP256dh: 'A'.repeat(65),
          chaveAuth: 'B'.repeat(22),
          criadoEm: new Date(AGORA.getTime() + 1),
          atualizadoEm: new Date(AGORA.getTime() + 1),
        })
      }
      pendentes.push(...publicador.expansoes.slice(antes).map((item) => item.mensagem))
    }

    const recebidas = publicador.lotes.flatMap((lote) => lote.mensagem.inscricaoIds)
    expect(recebidas).toHaveLength(10_000)
    expect(new Set(recebidas)).toEqual(new Set(esperadas))
    expect(publicador.lotes).toHaveLength(40)
  }, 30_000)

  it('retry depois do lote e antes da continuação repete sem perder', async () => {
    const conta = await prepararConta()
    await criarInscricoes(300, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.id)
    const publicador = new PublicadorFake()
    publicador.falharContinuacao = true
    const inicial = expansaoInicial(EVENTO)

    await expect(
      expandirEventoPush(banco.db, publicador, inicial, politica, CONFIG, AGORA),
    ).rejects.toThrow('continuação indisponível')
    expect(publicador.lotes).toHaveLength(1)

    await expandirEventoPush(banco.db, publicador, inicial, politica, CONFIG, AGORA)
    expect(publicador.lotes).toHaveLength(2)
    expect(publicador.lotes[0]!.chave).toBe(publicador.lotes[1]!.chave)
    expect(publicador.expansoes).toHaveLength(1)
  })

  it('revalida preferência entre os tópicos antes de tocar no endpoint', async () => {
    const conta = await prepararConta()
    await criarInscricoes(1, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    await expandirEventoPush(banco.db, publicador, expansaoInicial(EVENTO), politica, CONFIG, AGORA)

    await banco.db.insert(preferenciasNotificacao).values({
      usuarioId: conta.usuario.id,
      canal: 'FIRE_LIVE_APITO',
      habilitado: false,
    })
    const porta = new EnvioPushFake()
    const resultado = await enviarLotePush(
      banco.db,
      porta,
      publicador.lotes[0]!.mensagem,
      politica,
      CONFIG,
      AGORA,
    )

    expect(resultado.elegiveis).toBe(0)
    expect(porta.envios).toHaveLength(0)
  })

  it('invalida 404/410 e deixa a inscrição fora dos próximos fan-outs', async () => {
    const conta = await prepararConta()
    await criarInscricoes(1, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    await expandirEventoPush(banco.db, publicador, expansaoInicial(EVENTO), politica, CONFIG, AGORA)

    const resultado = await enviarLotePush(
      banco.db,
      new EnvioPushFake([{ tipo: 'INSCRICAO_INVALIDA', statusCode: 410 }]),
      publicador.lotes[0]!.mensagem,
      politica,
      CONFIG,
      AGORA,
    )
    expect(resultado.invalidados).toBe(1)

    const [inscricao] = await banco.db
      .select()
      .from(pushInscricoes)
      .where(eq(pushInscricoes.id, publicador.lotes[0]!.mensagem.inscricaoIds[0]!))
    expect(inscricao?.invalidadaEm).not.toBeNull()
  })

  it('mantém os dois consumers registrados no config de deploy', async () => {
    // vercel.ts é a FONTE ÚNICA; vercel.json é artefato gerado no build.
    const { config } = await import('../../../../../vercel')
    const topicos = Object.values(config.functions ?? {})
      .flatMap((funcao) => (funcao as { experimentalTriggers?: { topic: string }[] }).experimentalTriggers ?? [])
      .map((trigger) => trigger.topic)
      .sort()
    expect(topicos).toEqual(['push-entregas', 'push-eventos'])
  })
})
