import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { DuplicateMessageError } from '@vercel/queue'

import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import {
  dispositivos,
  jogadores,
  preferenciasNotificacao,
  pushInscricoes,
  sessoes,
  usuarios,
} from '../../../dominio/db/schema'
import { EnvioPushFake } from '../fake'
import {
  definirAcompanhamento,
  definirExclusaoAlerta,
  gravarPreferenciasExperiencia,
} from '../../../plataforma/experiencia/servico'
import {
  configuracaoOperacionalPush,
  enviarIdempotente,
  enviarLotePush,
  ErroVapidPush,
  expandirEventoPush,
  expansaoInicial,
  PoliticaHomologacaoPush,
  PublicadorFanoutVercel,
  type EnvioFila,
  type MensagemExpansaoPush,
  type MensagemLotePush,
  type PublicadorFanoutPush,
} from '../fanout'
import type { MensagemPushV1 } from '../contrato'
import type { PortaEnvioPush } from '../porta'
import { FilaVercel } from '../../fila/vercel-queues'

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
  lotes: { mensagem: MensagemLotePush; chave: string; atraso?: number }[] = []
  private falharNaExpansao = 0
  private publicacoesDeExpansao = 0

  /** Falha a N-ésima publicação de expansão a partir de agora (1 = a próxima), uma vez só. */
  falharNaPublicacao(n: number) {
    this.falharNaExpansao = n
    this.publicacoesDeExpansao = 0
  }

  async publicarExpansao(mensagem: MensagemExpansaoPush, chave: string) {
    this.publicacoesDeExpansao += 1
    if (this.falharNaExpansao === this.publicacoesDeExpansao) {
      this.falharNaExpansao = 0
      throw new Error('expansão indisponível')
    }
    this.expansoes.push({ mensagem, chave })
  }

  async publicarLote(mensagem: MensagemLotePush, chave: string, atraso?: number) {
    this.lotes.push({ mensagem, chave, atraso })
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

/**
 * Processa a expansão e tudo o que ela publicar (faixas ou continuações) até
 * restarem só lotes — o que a fila faria. Os testes que olham o lote depois
 * da expansão passam por aqui desde que a inicial publica faixas (W2-2).
 */
async function expandirAteLotes(
  publicador: PublicadorFake,
  politica: PoliticaHomologacaoPush,
  inicial: MensagemExpansaoPush = expansaoInicial(EVENTO),
) {
  const pendentes = [inicial]
  while (pendentes.length > 0) {
    const antes = publicador.expansoes.length
    await expandirEventoPush(banco.db, publicador, pendentes.shift()!, politica, CONFIG, AGORA)
    pendentes.push(...publicador.expansoes.slice(antes).map((item) => item.mensagem))
  }
}

/**
 * Inicial → plano → faixas (W2-2). A inicial publica UM plano congelado; o
 * plano publica as faixas. Devolve o plano (mensagem e chave) e as faixas.
 */
async function planejarFaixas(
  publicador: PublicadorFake,
  politica: PoliticaHomologacaoPush,
  inicial: MensagemExpansaoPush = expansaoInicial(EVENTO),
) {
  const antes = publicador.expansoes.length
  await expandirEventoPush(banco.db, publicador, inicial, politica, CONFIG, AGORA)
  const planos = publicador.expansoes.slice(antes)
  expect(planos).toHaveLength(1)
  const plano = planos[0]!
  const r = await expandirEventoPush(banco.db, publicador, plano.mensagem, politica, CONFIG, AGORA)
  expect(r.continuou).toBe(false)
  const faixas = publicador.expansoes.slice(antes + 1).map((item) => item.mensagem)
  return { plano, faixas }
}

/** Inscrições ativas na ordem do fan-out (criadoEm, id). */
async function inscricoesOrdenadas() {
  const linhas = await banco.db.select().from(pushInscricoes)
  return linhas
    .filter((linha) => linha.invalidadaEm === null)
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime() || (a.id < b.id ? -1 : 1))
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

    const { faixas } = await planejarFaixas(publicador, politica)
    // Lote 250: 10 mil = 40 faixas, todas publicadas já pelo plano.
    expect(faixas).toHaveLength(40)
    expect(publicador.lotes).toHaveLength(0)

    // Chega depois da captura do limite: nenhuma faixa pode alcançá-la.
    await banco.db.insert(pushInscricoes).values({
      usuarioId: conta.usuario.id,
      dispositivoId: conta.dispositivo.id,
      endpoint: 'https://fcm.googleapis.com/wp/tardia',
      chaveP256dh: 'A'.repeat(65),
      chaveAuth: 'B'.repeat(22),
      criadoEm: new Date(AGORA.getTime() + 1),
      atualizadoEm: new Date(AGORA.getTime() + 1),
    })

    for (const mensagem of faixas) {
      const r = await expandirEventoPush(banco.db, publicador, mensagem, politica, CONFIG, AGORA)
      expect(r.continuou).toBe(false)
    }
    expect(publicador.expansoes).toHaveLength(41)

    const recebidas = publicador.lotes.flatMap((lote) => lote.mensagem.inscricaoIds)
    expect(recebidas).toHaveLength(10_000)
    expect(new Set(recebidas)).toEqual(new Set(esperadas))
    expect(publicador.lotes).toHaveLength(40)
  }, 30_000)

  it('falha no meio da publicação das faixas: a reentrega do plano republica as mesmas faixas com as mesmas chaves', async () => {
    const conta = await prepararConta()
    await criarInscricoes(750, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.id)
    const publicador = new PublicadorFake()
    await expandirEventoPush(banco.db, publicador, expansaoInicial(EVENTO), politica, CONFIG, AGORA)
    const plano = publicador.expansoes.splice(0)[0]!.mensagem
    publicador.falharNaPublicacao(2)

    await expect(
      expandirEventoPush(banco.db, publicador, plano, politica, CONFIG, AGORA),
    ).rejects.toThrow('expansão indisponível')
    const primeira = publicador.expansoes.splice(0)
    expect(primeira).toHaveLength(1)

    await expandirEventoPush(banco.db, publicador, plano, politica, CONFIG, AGORA)
    const segunda = publicador.expansoes
    expect(segunda).toHaveLength(3)
    expect(new Set(segunda.map((e) => e.chave)).size).toBe(3)
    // A fila descarta pela chave o que a 1ª tentativa já publicou.
    expect(segunda[0]).toEqual(primeira[0])
    expect(publicador.lotes).toHaveLength(0)
  })

  it('revalida preferência entre os tópicos antes de tocar no endpoint', async () => {
    const conta = await prepararConta()
    await criarInscricoes(1, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    await expandirAteLotes(publicador, politica)

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
    await expandirAteLotes(publicador, politica)

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
      .flatMap(
        (funcao) =>
          (funcao as { experimentalTriggers?: { topic: string }[] }).experimentalTriggers ?? [],
      )
      .map((trigger) => trigger.topic)
      .sort()
    expect(topicos).toEqual(['push-entregas', 'push-eventos'])
  })
})

describe('filtros explícitos de alerta por conta', () => {
  async function prepararAlvo() {
    const conta = await prepararConta()
    await criarInscricoes(1, conta)
    const jogadorId = '22222222-2222-4222-8222-222222222222'
    await banco.db.insert(jogadores).values({ id: jogadorId, nomeCompleto: 'Alvo do push' })
    return {
      conta,
      jogadorId,
      politica: new PoliticaHomologacaoPush(conta.usuario.email),
      publicador: new PublicadorFake(),
    }
  }

  it.each(['JOGADOR', 'ATRIBUTO', 'APENAS_ACOMPANHADOS'] as const)(
    'exclusão %s já impede o enfileiramento',
    async (tipo) => {
      const { conta, jogadorId, politica, publicador } = await prepararAlvo()
      if (tipo === 'APENAS_ACOMPANHADOS')
        await gravarPreferenciasExperiencia(banco.db, conta.usuario.id, {
          apenasAcompanhados: true,
        })
      else if (tipo === 'JOGADOR')
        await definirExclusaoAlerta(banco.db, conta.usuario.id, {
          tipo,
          id: jogadorId,
          silenciado: true,
        })
      else
        await definirExclusaoAlerta(banco.db, conta.usuario.id, {
          tipo,
          id: 'PONTOS',
          silenciado: true,
        })
      await expandirAteLotes(publicador, politica)
      expect(publicador.lotes).toHaveLength(0)
    },
  )

  it.each(['JOGADOR', 'ATRIBUTO', 'APENAS_ACOMPANHADOS'] as const)(
    'revalida %s entre enfileirar e enviar',
    async (tipo) => {
      const { conta, jogadorId, politica, publicador } = await prepararAlvo()
      await expandirAteLotes(publicador, politica)
      expect(publicador.lotes).toHaveLength(1)
      if (tipo === 'APENAS_ACOMPANHADOS')
        await gravarPreferenciasExperiencia(banco.db, conta.usuario.id, {
          apenasAcompanhados: true,
        })
      else if (tipo === 'JOGADOR')
        await definirExclusaoAlerta(banco.db, conta.usuario.id, {
          tipo,
          id: jogadorId,
          silenciado: true,
        })
      else
        await definirExclusaoAlerta(banco.db, conta.usuario.id, {
          tipo,
          id: 'PONTOS',
          silenciado: true,
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
    },
  )

  it('mute, volume zero e seguir sozinho preservam o push atual', async () => {
    const { conta, politica, publicador } = await prepararAlvo()
    await gravarPreferenciasExperiencia(banco.db, conta.usuario.id, {
      somHabilitado: false,
      volume: 0,
    })
    const [outro] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Outro jogador' })
      .returning()
    await definirAcompanhamento(banco.db, conta.usuario.id, {
      tipo: 'JOGADOR',
      id: outro!.id,
      acompanhar: true,
    })
    await expandirAteLotes(publicador, politica)
    const porta = new EnvioPushFake()
    await enviarLotePush(banco.db, porta, publicador.lotes[0]!.mensagem, politica, CONFIG, AGORA)
    expect(porta.envios).toHaveLength(1)
  })

  it('apenas acompanhados permite todos os atributos do jogador seguido', async () => {
    const { conta, jogadorId, politica, publicador } = await prepararAlvo()
    await gravarPreferenciasExperiencia(banco.db, conta.usuario.id, { apenasAcompanhados: true })
    await definirAcompanhamento(banco.db, conta.usuario.id, {
      tipo: 'JOGADOR',
      id: jogadorId,
      acompanhar: true,
    })
    for (const atributo of ['PONTOS', 'REBOTES', 'ASSISTENCIAS'] as const) {
      if (EVENTO.canal !== 'FIRE_LIVE_APITO') throw new Error('fixture inválida')
      await expandirAteLotes(
        publicador,
        politica,
        expansaoInicial({ ...EVENTO, dados: { ...EVENTO.dados, atributo } }),
      )
    }
    expect(publicador.lotes).toHaveLength(3)
  })

  it('aviso geral da Lista mantém somente o opt-out do canal', async () => {
    const { conta, politica, publicador } = await prepararAlvo()
    await gravarPreferenciasExperiencia(banco.db, conta.usuario.id, { apenasAcompanhados: true })
    await definirExclusaoAlerta(banco.db, conta.usuario.id, {
      tipo: 'ATRIBUTO',
      id: 'PONTOS',
      silenciado: true,
    })
    const lista: MensagemPushV1 = { ...EVENTO, canal: 'LISTA_SECRETA', dados: {} }
    await expandirAteLotes(publicador, politica, expansaoInicial(lista))
    expect(publicador.lotes).toHaveLength(1)
    await banco.db
      .insert(preferenciasNotificacao)
      .values({ usuarioId: conta.usuario.id, canal: 'LISTA_SECRETA', habilitado: false })
    const porta = new EnvioPushFake()
    await enviarLotePush(banco.db, porta, publicador.lotes[0]!.mensagem, politica, CONFIG, AGORA)
    expect(porta.envios).toHaveLength(0)
  })
})

describe('entrega parcial (W2-2)', () => {
  async function loteCom(quantidade: number) {
    const conta = await prepararConta()
    await criarInscricoes(quantidade, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    await expandirAteLotes(publicador, politica)
    return { politica, publicador, lote: publicador.lotes[0]!.mensagem }
  }

  it('retry republica SÓ as que falharam, e confirma o lote', async () => {
    const { politica, publicador, lote } = await loteCom(4)
    const porta = new EnvioPushFake((i) =>
      i === 1
        ? { tipo: 'RETRY', motivo: 'SERVIDOR', statusCode: 503, retryAfterMs: null }
        : { tipo: 'ENVIADO', statusCode: 201 },
    )
    publicador.lotes.length = 0

    const r = await enviarLotePush(banco.db, porta, lote, politica, CONFIG, AGORA, publicador)

    expect(r.enviados).toBe(3)
    expect(r.reagendadas).toBe(1)
    expect(publicador.lotes).toHaveLength(1)
    expect(publicador.lotes[0]!.mensagem.inscricaoIds).toHaveLength(1)
    expect(publicador.lotes[0]!.mensagem.tentativa).toBe(1)
    // Sem Retry-After, o backoff da 1ª tentativa é o retryBaseSegundos (30 s).
    expect(publicador.lotes[0]!.atraso).toBe(30)
  })

  it('retry além do teto de tentativas conta como permanente e não republica', async () => {
    const { politica, publicador, lote } = await loteCom(1)
    publicador.lotes.length = 0
    const r = await enviarLotePush(
      banco.db,
      new EnvioPushFake([
        { tipo: 'RETRY', motivo: 'SERVIDOR', statusCode: 503, retryAfterMs: null },
      ]),
      { ...lote, tentativa: 5 },
      politica,
      CONFIG,
      AGORA,
      publicador,
    )
    expect(r.permanentes).toBe(1)
    expect(r.reagendadas).toBe(0)
    expect(publicador.lotes).toHaveLength(0)
  })

  it('retry que passaria da validade conta como expirado e não republica', async () => {
    const { politica, publicador, lote } = await loteCom(1)
    const quaseVencido = {
      ...lote,
      evento: { ...lote.evento, expiraEm: new Date(AGORA.getTime() + 10_000).toISOString() },
    }
    publicador.lotes.length = 0
    const r = await enviarLotePush(
      banco.db,
      new EnvioPushFake([
        { tipo: 'RETRY', motivo: 'SERVIDOR', statusCode: 503, retryAfterMs: 60_000 },
      ]),
      quaseVencido,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )
    expect(r.expirados).toBe(1)
    expect(publicador.lotes).toHaveLength(0)
  })

  it('403 isolado num lote de 1 invalida só ela, sem erro global', async () => {
    const { politica, publicador, lote } = await loteCom(1)
    const r = await enviarLotePush(
      banco.db,
      new EnvioPushFake([{ tipo: 'ERRO_VAPID', statusCode: 403 }]),
      lote,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )
    expect(r.invalidados).toBe(1)
    const [linha] = await banco.db.select().from(pushInscricoes)
    expect(linha?.motivoInvalidacao).toMatch(/403/)
  })

  it('403 em uma de quatro: invalida uma, entrega três', async () => {
    const { politica, publicador, lote } = await loteCom(4)
    const r = await enviarLotePush(
      banco.db,
      new EnvioPushFake((i) =>
        i === 2 ? { tipo: 'ERRO_VAPID', statusCode: 403 } : { tipo: 'ENVIADO', statusCode: 201 },
      ),
      lote,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )
    expect(r.enviados).toBe(3)
    expect(r.invalidados).toBe(1)
  })

  it('sem publicador, recusa em mais da metade de um lote é global: lança e não invalida ninguém', async () => {
    const { politica, lote } = await loteCom(4)
    await expect(
      enviarLotePush(
        banco.db,
        new EnvioPushFake((i) =>
          i < 3 ? { tipo: 'ERRO_VAPID', statusCode: 403 } : { tipo: 'ENVIADO', statusCode: 201 },
        ),
        lote,
        politica,
        CONFIG,
        AGORA,
      ),
    ).rejects.toThrow(ErroVapidPush)
    const invalidadas = (await banco.db.select().from(pushInscricoes)).filter((l) => l.invalidadaEm)
    expect(invalidadas).toHaveLength(0)
  })

  it('com publicador, VAPID global republica só as recusadas em 60 s, sem duplicar quem recebeu', async () => {
    const { politica, publicador, lote } = await loteCom(4)
    publicador.lotes.length = 0
    const porta = new EnvioPushFake((i) =>
      i < 3 ? { tipo: 'ERRO_VAPID', statusCode: 403 } : { tipo: 'ENVIADO', statusCode: 201 },
    )
    const r = await enviarLotePush(banco.db, porta, lote, politica, CONFIG, AGORA, publicador)

    expect(r.vapidGlobal).toBe(1)
    expect(r.enviados).toBe(1)
    expect(r.invalidados).toBe(0)
    expect(publicador.lotes).toHaveLength(1)
    const entregue = porta.envios[3]!.inscricao.endpoint
    const linhas = await banco.db.select().from(pushInscricoes)
    const idEntregue = linhas.find((l) => l.endpoint === entregue)!.id
    const republicados = publicador.lotes[0]!.mensagem.inscricaoIds
    expect(republicados).toHaveLength(3)
    expect(republicados).not.toContain(idEntregue)
    expect(publicador.lotes[0]!.atraso).toBe(60)
    expect(publicador.lotes[0]!.mensagem.tentativa).toBe(1)
    expect(linhas.filter((l) => l.invalidadaEm)).toHaveLength(0)
  })

  /**
   * Um lote mistura serviços de Push (FCM, Mozilla, Apple). A maioria que
   * denuncia VAPID global é contada por origem do endpoint: a credencial pode
   * ser recusada só por um provedor (ex.: Apple 403 BadJwtToken).
   */
  async function loteMisto(fcm: number, apple: number) {
    const base = await loteCom(fcm + apple)
    const ordenadas = await inscricoesOrdenadas()
    for (const linha of ordenadas.slice(fcm)) {
      await banco.db
        .update(pushInscricoes)
        .set({
          endpoint: linha.endpoint.replace(
            'https://fcm.googleapis.com',
            'https://web.push.apple.com',
          ),
        })
        .where(eq(pushInscricoes.id, linha.id))
    }
    base.publicador.lotes.length = 0
    return base
  }
  const appleRecusa = (
    enviadoApple: boolean,
    recusadasApple: number,
  ): PortaEnvioPush & { envios: string[] } => {
    let recusadas = 0
    const envios: string[] = []
    return {
      envios,
      async enviar(inscricao) {
        envios.push(inscricao.endpoint)
        if (!inscricao.endpoint.startsWith('https://web.push.apple.com'))
          return { tipo: 'ENVIADO', statusCode: 201 }
        if (recusadas < recusadasApple) {
          recusadas += 1
          return { tipo: 'ERRO_VAPID', statusCode: 403 }
        }
        return enviadoApple
          ? { tipo: 'ENVIADO', statusCode: 201 }
          : { tipo: 'ERRO_VAPID', statusCode: 403 }
      },
    }
  }

  it('lote misto: 3 FCM entregues + 2 Apple 403 → Apple é VAPID global do provedor, republicada em 60 s', async () => {
    const { politica, publicador, lote } = await loteMisto(3, 2)
    const r = await enviarLotePush(
      banco.db,
      appleRecusa(false, 2),
      lote,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )

    expect(r.enviados).toBe(3)
    expect(r.vapidGlobal).toBe(1)
    expect(r.invalidados).toBe(0)
    const linhas = await banco.db.select().from(pushInscricoes)
    expect(linhas.filter((l) => l.invalidadaEm)).toHaveLength(0)
    const idsApple = linhas
      .filter((l) => l.endpoint.startsWith('https://web.push.apple.com'))
      .map((l) => l.id)
    expect(publicador.lotes).toHaveLength(1)
    expect([...publicador.lotes[0]!.mensagem.inscricaoIds].sort()).toEqual([...idsApple].sort())
    expect(publicador.lotes[0]!.atraso).toBe(60)
  })

  it('1 Apple 403 isolada entre 3 Apple entregues é a inscrição: invalida só ela', async () => {
    const { politica, publicador, lote } = await loteMisto(0, 4)
    const r = await enviarLotePush(
      banco.db,
      appleRecusa(true, 1),
      lote,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )

    expect(r.enviados).toBe(3)
    expect(r.vapidGlobal).toBe(0)
    expect(r.invalidados).toBe(1)
    expect(publicador.lotes).toHaveLength(0)
  })

  it('VAPID local (statusCode null) num lote de 1 é global: não invalida a inscrição', async () => {
    const { politica, publicador, lote } = await loteCom(1)
    publicador.lotes.length = 0
    const r = await enviarLotePush(
      banco.db,
      new EnvioPushFake([{ tipo: 'ERRO_VAPID', statusCode: null }]),
      lote,
      politica,
      CONFIG,
      AGORA,
      publicador,
    )
    expect(r.vapidGlobal).toBe(1)
    expect(r.invalidados).toBe(0)
    expect(publicador.lotes).toHaveLength(1)
    const [linha] = await banco.db.select().from(pushInscricoes)
    expect(linha?.invalidadaEm).toBeNull()
  })
})

describe('expansão em faixas (W2-2)', () => {
  it('a expansão inicial publica todas as faixas de uma vez, e elas cobrem tudo sem repetir', async () => {
    const conta = await prepararConta()
    const ids = await criarInscricoes(1000, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()

    await expandirEventoPush(banco.db, publicador, expansaoInicial(EVENTO), politica, CONFIG, AGORA)
    // A inicial só congela o plano: uma mensagem, nenhum lote.
    expect(publicador.expansoes).toHaveLength(1)
    expect(publicador.expansoes[0]!.mensagem.fins).toHaveLength(4)
    const plano = publicador.expansoes.splice(0)[0]!.mensagem

    await expandirEventoPush(banco.db, publicador, plano, politica, CONFIG, AGORA)
    // CONFIG usa lote 250: 1000 inscrições = 4 faixas, publicadas todas de uma vez.
    expect(publicador.expansoes.map((e) => e.mensagem.faixa)).toEqual([true, true, true, true])
    expect(publicador.lotes).toHaveLength(0)

    for (const { mensagem } of [...publicador.expansoes]) {
      const r = await expandirEventoPush(banco.db, publicador, mensagem, politica, CONFIG, AGORA)
      expect(r.continuou).toBe(false)
    }
    const entregues = publicador.lotes.flatMap((l) => l.mensagem.inscricaoIds)
    expect(new Set(entregues).size).toBe(1000)
    expect([...entregues].sort()).toEqual([...ids].sort())
  })

  it('total que não é múltiplo do lote: a última faixa termina no limite, sem faixa vazia', async () => {
    const conta = await prepararConta()
    const ids = await criarInscricoes(620, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()

    const { faixas } = await planejarFaixas(publicador, politica)
    expect(faixas).toHaveLength(3)
    expect(faixas[0]!.cursor).toBeNull()
    expect(faixas[1]!.cursor).toEqual(faixas[0]!.limiteSuperior)
    expect(faixas[2]!.cursor).toEqual(faixas[1]!.limiteSuperior)

    for (const mensagem of faixas)
      await expandirEventoPush(banco.db, publicador, mensagem, politica, CONFIG, AGORA)
    expect(publicador.lotes.map((l) => l.mensagem.inscricaoIds.length)).toEqual([250, 250, 120])
    expect(new Set(publicador.lotes.flatMap((l) => l.mensagem.inscricaoIds))).toEqual(new Set(ids))
  })

  it('reentrega de uma faixa publica o lote com a mesma chave e não continua', async () => {
    const conta = await prepararConta()
    await criarInscricoes(500, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    const { faixas } = await planejarFaixas(publicador, politica)
    const faixa = faixas[1]!
    const expansoesAntes = publicador.expansoes.length

    await expandirEventoPush(banco.db, publicador, faixa, politica, CONFIG, AGORA)
    await expandirEventoPush(banco.db, publicador, faixa, politica, CONFIG, AGORA)
    expect(publicador.lotes).toHaveLength(2)
    expect(publicador.lotes[0]!.chave).toBe(publicador.lotes[1]!.chave)
    expect(publicador.expansoes).toHaveLength(expansoesAntes)
  })

  it('mensagem antiga em voo (sem faixa, com cursor) segue a cadeia de continuação', async () => {
    const conta = await prepararConta()
    const ids = await criarInscricoes(750, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    const { faixas } = await planejarFaixas(publicador, politica)
    const [primeira, segunda, terceira] = faixas
    publicador.expansoes.length = 0

    // Forma de antes do deploy: cursor da 1ª página, limite do fan-out inteiro.
    const antiga: MensagemExpansaoPush = {
      versao: 1,
      evento: EVENTO,
      cursor: segunda!.cursor,
      limiteSuperior: terceira!.limiteSuperior,
      pagina: 1,
    }
    const r = await expandirEventoPush(banco.db, publicador, antiga, politica, CONFIG, AGORA)
    expect(r.continuou).toBe(true)
    expect(publicador.expansoes).toHaveLength(1)
    const continuacao = publicador.expansoes[0]!.mensagem
    expect(continuacao.faixa).toBeUndefined()
    expect(continuacao.cursor).toEqual(segunda!.limiteSuperior)
    expect(continuacao.pagina).toBe(2)

    await expandirEventoPush(banco.db, publicador, continuacao, politica, CONFIG, AGORA)
    await expandirEventoPush(banco.db, publicador, primeira!, politica, CONFIG, AGORA)
    const entregues = publicador.lotes.flatMap((l) => l.mensagem.inscricaoIds)
    expect(entregues).toHaveLength(750)
    expect(new Set(entregues)).toEqual(new Set(ids))
  })

  it('invalidar uma inscrição entre duas tentativas da expansão inicial não muda as chaves das faixas nem a cobertura', async () => {
    const conta = await prepararConta()
    await criarInscricoes(1000, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    const inicial = expansaoInicial(EVENTO)

    await expandirEventoPush(banco.db, publicador, inicial, politica, CONFIG, AGORA)
    const primeiroPlano = publicador.expansoes.splice(0)[0]!

    // Entre as tentativas, uma inscrição do começo da fila é invalidada (um 410
    // de outro evento): antes, todas as fronteiras dali em diante andavam uma casa.
    const [primeiraAtiva] = await inscricoesOrdenadas()
    await banco.db
      .update(pushInscricoes)
      .set({ invalidadaEm: AGORA, motivoInvalidacao: 'serviço de Push respondeu 410' })
      .where(eq(pushInscricoes.id, primeiraAtiva!.id))

    await expandirEventoPush(banco.db, publicador, inicial, politica, CONFIG, AGORA)
    const segundoPlano = publicador.expansoes.splice(0)[0]!
    // Mesma chave: a fila descarta o segundo plano; vale o congelado.
    expect(segundoPlano.chave).toBe(primeiroPlano.chave)

    await expandirEventoPush(banco.db, publicador, primeiroPlano.mensagem, politica, CONFIG, AGORA)
    const faixasA = publicador.expansoes.splice(0)
    await expandirEventoPush(banco.db, publicador, primeiroPlano.mensagem, politica, CONFIG, AGORA)
    const faixasB = publicador.expansoes.splice(0)
    expect(faixasB).toEqual(faixasA)

    for (const { mensagem } of faixasA)
      await expandirEventoPush(banco.db, publicador, mensagem, politica, CONFIG, AGORA)
    const entregues = publicador.lotes.flatMap((l) => l.mensagem.inscricaoIds)
    const ativas = (await inscricoesOrdenadas()).map((linha) => linha.id)
    expect(entregues).toHaveLength(999)
    expect(new Set(entregues)).toEqual(new Set(ativas))
  })

  it('faixa reentregue depois de uma invalidação dentro dela publica o lote com a mesma chave', async () => {
    const conta = await prepararConta()
    await criarInscricoes(500, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    const { faixas } = await planejarFaixas(publicador, politica)
    const faixa = faixas[1]!

    await expandirEventoPush(banco.db, publicador, faixa, politica, CONFIG, AGORA)
    const primeiro = publicador.lotes[0]!
    const invalidada = primeiro.mensagem.inscricaoIds.at(-1)!
    await banco.db
      .update(pushInscricoes)
      .set({ invalidadaEm: AGORA, motivoInvalidacao: 'serviço de Push respondeu 410' })
      .where(eq(pushInscricoes.id, invalidada))

    await expandirEventoPush(banco.db, publicador, faixa, politica, CONFIG, AGORA)
    const segundo = publicador.lotes[1]!
    expect(segundo.chave).toBe(primeiro.chave)
    expect(segundo.mensagem.inscricaoIds).toHaveLength(249)
    expect(segundo.mensagem.inscricaoIds).not.toContain(invalidada)
  })

  it('faixa que passa do lote registra push_faixa_truncada, sem continuar', async () => {
    const conta = await prepararConta()
    await criarInscricoes(500, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const publicador = new PublicadorFake()
    const { faixas } = await planejarFaixas(publicador, politica)
    // Linha que cai num intervalo já planejado (criadoEm no passado).
    await banco.db.insert(pushInscricoes).values({
      usuarioId: conta.usuario.id,
      dispositivoId: conta.dispositivo.id,
      endpoint: 'https://fcm.googleapis.com/wp/no-passado',
      chaveP256dh: 'A'.repeat(65),
      chaveAuth: 'B'.repeat(22),
      criadoEm: new Date(AGORA.getTime() - 1),
      atualizadoEm: AGORA,
    })
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const r = await expandirEventoPush(banco.db, publicador, faixas[0]!, politica, CONFIG, AGORA)
      expect(r.continuou).toBe(false)
      expect(aviso).toHaveBeenCalledWith(expect.stringContaining('push_faixa_truncada'))
    } finally {
      aviso.mockRestore()
    }
  })
})

describe('envio idempotente na fila (W2-2)', () => {
  function envioQue(falhar: (indice: number) => Error | null) {
    const chamadas: { topico: string; mensagem: unknown; chave: string }[] = []
    const enviar: EnvioFila = async (topico, mensagem, opcoes) => {
      const erro = falhar(chamadas.length)
      chamadas.push({ topico, mensagem, chave: opcoes.idempotencyKey })
      if (erro) throw erro
    }
    return { chamadas, enviar }
  }

  it('chave já usada (DuplicateMessageError) é sucesso: a mensagem já está na fila', async () => {
    const { enviar } = envioQue(() => new DuplicateMessageError('já usada', 'k'))
    await expect(
      enviarIdempotente('push-eventos', {}, { idempotencyKey: 'k' }, enviar),
    ).resolves.toBeUndefined()
  })

  it('qualquer outro erro continua subindo', async () => {
    const { enviar } = envioQue(() => new Error('fila fora do ar'))
    await expect(
      enviarIdempotente('push-eventos', {}, { idempotencyKey: 'k' }, enviar),
    ).rejects.toThrow('fila fora do ar')
  })

  it('plano reentregue: a 1ª faixa já publicada não impede as seguintes', async () => {
    const conta = await prepararConta()
    await criarInscricoes(750, conta)
    const politica = new PoliticaHomologacaoPush(conta.usuario.email)
    const fake = new PublicadorFake()
    await expandirEventoPush(banco.db, fake, expansaoInicial(EVENTO), politica, CONFIG, AGORA)
    const plano = fake.expansoes[0]!.mensagem

    // A 1ª tentativa publicou a faixa 1 e caiu; na reentrega a fila responde
    // 409 para ela. Antes, o erro subia e as faixas 2 e 3 nunca saíam.
    const { chamadas, enviar } = envioQue((i) =>
      i === 0 ? new DuplicateMessageError('já usada') : null,
    )
    await expandirEventoPush(
      banco.db,
      new PublicadorFanoutVercel(enviar),
      plano,
      politica,
      CONFIG,
      AGORA,
    )
    expect(chamadas).toHaveLength(3)
    expect(chamadas.every((c) => c.topico === 'push-eventos')).toBe(true)
  })

  it('lote reenviado com chave já usada não lança', async () => {
    const { chamadas, enviar } = envioQue(() => new DuplicateMessageError('já usada'))
    await new PublicadorFanoutVercel(enviar).publicarLote(
      { versao: 1, evento: EVENTO, inscricaoIds: [EVENTO.dados.jogadorId], pagina: 0 },
      'k',
      30,
    )
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]!.topico).toBe('push-entregas')
  })

  it('o produtor do ciclo trata a chave já usada como enfileirada', async () => {
    const { chamadas, enviar } = envioQue(() => new DuplicateMessageError('já usada'))
    await expect(new FilaVercel(enviar).enfileirar([EVENTO])).resolves.toBeUndefined()
    expect(chamadas).toHaveLength(1)
  })
})
