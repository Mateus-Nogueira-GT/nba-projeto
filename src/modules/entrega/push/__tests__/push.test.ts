import { describe, expect, it, vi } from 'vitest'
import type { RequestOptions, SendResult } from 'web-push'

import {
  exigirConfiguracaoPush,
  lerConfiguracaoPush,
  type AmbientePush,
  type ConfiguracaoPushAtiva,
} from '../configuracao'
import { mensagemPushExpirada, validarMensagemPushV1, type MensagemPushV1 } from '../contrato'
import { EnvioPushFake } from '../fake'
import type { InscricaoPush, ResultadoEnvioPush } from '../porta'
import { criarEnvioWebPush, EnvioWebPush, type ClienteWebPush } from '../web-push'

const JOGO_ID = '11111111-1111-4111-8111-111111111111'
const JOGADOR_ID = '22222222-2222-4222-8222-222222222222'
const AGORA = new Date('2026-08-21T12:00:00.000Z')

const MENSAGEM: MensagemPushV1 = {
  versao: 1,
  chave: `apito|${JOGO_ID}|${JOGADOR_ID}|PONTOS`,
  canal: 'FIRE_LIVE_APITO',
  titulo: 'Jogador apitou no 1Q',
  corpo: 'LAL · alvo 6 pontos',
  url: '/',
  ocorridoEm: '2026-08-21T11:59:00.000Z',
  expiraEm: '2026-08-21T12:05:00.000Z',
  dados: {
    jogoId: JOGO_ID,
    jogadorId: JOGADOR_ID,
    atributo: 'PONTOS',
    nivelJogador: 'MVP',
    alvo1Q: 6,
    modoFire: true,
    opdOrigemNivel: 2,
  },
}

const INSCRICAO: InscricaoPush = {
  endpoint: 'https://fcm.googleapis.com/wp/opaco',
  expirationTime: null,
  chaves: {
    p256dh: 'chave-publica-do-dispositivo',
    auth: 'segredo-auth-do-dispositivo',
  },
}

const CONFIGURACAO: ConfiguracaoPushAtiva = {
  habilitado: true,
  publicoHabilitado: true,
  chavePublica: Buffer.alloc(65, 1).toString('base64url'),
  chavePrivada: Buffer.alloc(32, 2).toString('base64url'),
  subject: 'mailto:push@example.test',
}

function ambienteAtivo(): AmbientePush {
  return {
    PUSH_ENABLED: 'true',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: CONFIGURACAO.chavePublica,
    VAPID_PRIVATE_KEY: CONFIGURACAO.chavePrivada,
    VAPID_SUBJECT: CONFIGURACAO.subject,
  }
}

function erroHttp(statusCode: number, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error('erro sanitizado do push service'), { statusCode, headers })
}

describe('contrato MensagemPushV1', () => {
  it('aceita o payload fechado e preserva a chave usada como tag', () => {
    expect(validarMensagemPushV1(MENSAGEM)).toEqual(MENSAGEM)
  })

  it.each(['https://externo.test/fire-live', 'javascript:alert(1)', '/rota-nao-liberada'])(
    'rejeita deep link fora da allowlist: %s',
    (url) => {
      expect(() => validarMensagemPushV1({ ...MENSAGEM, url })).toThrow()
    },
  )

  it('rejeita versão, canal, dados extras e janela temporal inválidos', () => {
    expect(() => validarMensagemPushV1({ ...MENSAGEM, versao: 2 })).toThrow()
    expect(() => validarMensagemPushV1({ ...MENSAGEM, canal: 'OUTRO' })).toThrow()
    expect(() =>
      validarMensagemPushV1({
        ...MENSAGEM,
        dados: { ...MENSAGEM.dados, destino: 'https://externo.test' },
      }),
    ).toThrow()
    expect(() => validarMensagemPushV1({ ...MENSAGEM, expiraEm: MENSAGEM.ocorridoEm })).toThrow()
  })

  it('considera vencida no instante exato de expiração', () => {
    expect(mensagemPushExpirada(MENSAGEM, new Date(MENSAGEM.expiraEm))).toBe(true)
    expect(mensagemPushExpirada(MENSAGEM, new Date('2026-08-21T12:04:59.999Z'))).toBe(false)
  })
})

describe('configuração Web Push', () => {
  it('fica desligada por padrão e só habilita com quatro variáveis válidas', () => {
    expect(lerConfiguracaoPush({})).toEqual({
      habilitado: false,
      motivo: 'DESABILITADO',
      camposInvalidos: [],
    })
    expect(lerConfiguracaoPush(ambienteAtivo())).toEqual(CONFIGURACAO)
  })

  it('falha fechado sem revelar valores sensíveis', () => {
    const ambiente = {
      PUSH_ENABLED: 'true',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'publica-invalida',
      VAPID_PRIVATE_KEY: 'privada-super-secreta',
      VAPID_SUBJECT: 'http://localhost:3000',
    }

    expect(() => exigirConfiguracaoPush(ambiente)).toThrow(
      /NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT/,
    )
    try {
      exigirConfiguracaoPush(ambiente)
    } catch (erro) {
      expect(String(erro)).not.toContain('privada-super-secreta')
    }
  })

  it('factory real não existe quando PUSH_ENABLED está desligado', () => {
    expect(() => criarEnvioWebPush({ PUSH_ENABLED: 'false' })).toThrow(/indisponível/)
  })
})

describe('fake de envio', () => {
  it('cobre a sequência de resultados sem esconder duplicatas at-least-once', async () => {
    const resultados: ResultadoEnvioPush[] = [
      { tipo: 'ENVIADO', statusCode: 201 },
      { tipo: 'INSCRICAO_INVALIDA', statusCode: 404 },
      { tipo: 'INSCRICAO_INVALIDA', statusCode: 410 },
      { tipo: 'RETRY', motivo: 'RATE_LIMIT', statusCode: 429, retryAfterMs: 1000 },
      { tipo: 'RETRY', motivo: 'SERVIDOR', statusCode: 503, retryAfterMs: null },
      { tipo: 'RETRY', motivo: 'TIMEOUT', statusCode: null, retryAfterMs: null },
      { tipo: 'ERRO_VAPID', statusCode: 403 },
    ]
    const fake = new EnvioPushFake(resultados)

    const recebidos: ResultadoEnvioPush[] = []
    for (let i = 0; i < resultados.length; i += 1) {
      recebidos.push(await fake.enviar(INSCRICAO, MENSAGEM))
    }

    expect(recebidos).toEqual(resultados)
    expect(fake.envios).toHaveLength(resultados.length)
    expect(new Set(fake.envios.map((envio) => envio.mensagem.chave))).toEqual(
      new Set([MENSAGEM.chave]),
    )
  })
})

describe('adapter web-push real', () => {
  it('envia payload V1 criptografável com VAPID, TTL, timeout e urgência', async () => {
    const enviar = vi.fn<ClienteWebPush['sendNotification']>(async () => ({
      statusCode: 201,
      headers: {},
      body: '',
    }))
    const adapter = new EnvioWebPush(CONFIGURACAO, {
      cliente: { sendNotification: enviar },
      agora: () => AGORA,
      timeoutMs: 4321,
    })

    await expect(adapter.enviar(INSCRICAO, MENSAGEM)).resolves.toEqual({
      tipo: 'ENVIADO',
      statusCode: 201,
    })

    const [subscription, payload, options] = enviar.mock.calls[0]!
    expect(subscription).toEqual({
      endpoint: INSCRICAO.endpoint,
      expirationTime: null,
      keys: INSCRICAO.chaves,
    })
    expect(JSON.parse(payload)).toEqual(MENSAGEM)
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(4096)
    expect(options).toMatchObject<RequestOptions>({
      TTL: 300,
      timeout: 4321,
      urgency: 'high',
      contentEncoding: 'aes128gcm',
      vapidDetails: {
        subject: CONFIGURACAO.subject,
        publicKey: CONFIGURACAO.chavePublica,
        privateKey: CONFIGURACAO.chavePrivada,
      },
    })
  })

  it('descarta mensagem vencida antes de tocar endpoint ou chaves', async () => {
    const enviar = vi.fn<ClienteWebPush['sendNotification']>()
    const adapter = new EnvioWebPush(CONFIGURACAO, {
      cliente: { sendNotification: enviar },
      agora: () => new Date(MENSAGEM.expiraEm),
    })

    await expect(adapter.enviar(INSCRICAO, MENSAGEM)).resolves.toEqual({ tipo: 'EXPIRADO' })
    expect(enviar).not.toHaveBeenCalled()
  })

  it('não transforma endpoint arbitrário persistido em chamada server-side', async () => {
    const enviar = vi.fn<ClienteWebPush['sendNotification']>()
    const adapter = new EnvioWebPush(CONFIGURACAO, {
      cliente: { sendNotification: enviar },
      agora: () => AGORA,
    })

    await expect(
      adapter.enviar({ ...INSCRICAO, endpoint: 'https://127.0.0.1/admin' }, MENSAGEM),
    ).resolves.toEqual({ tipo: 'ERRO_PERMANENTE', statusCode: null })
    expect(enviar).not.toHaveBeenCalled()
  })

  it.each([
    [404, {}, { tipo: 'INSCRICAO_INVALIDA', statusCode: 404 }],
    [410, {}, { tipo: 'INSCRICAO_INVALIDA', statusCode: 410 }],
    [401, {}, { tipo: 'ERRO_VAPID', statusCode: 401 }],
    [403, {}, { tipo: 'ERRO_VAPID', statusCode: 403 }],
    [400, {}, { tipo: 'ERRO_PERMANENTE', statusCode: 400 }],
    [
      429,
      { 'retry-after': '3' },
      { tipo: 'RETRY', motivo: 'RATE_LIMIT', statusCode: 429, retryAfterMs: 3000 },
    ],
    [503, {}, { tipo: 'RETRY', motivo: 'SERVIDOR', statusCode: 503, retryAfterMs: null }],
  ] as const)(
    'classifica HTTP %i sem devolver endpoint ou secrets',
    async (status, headers, esperado) => {
      const cliente: ClienteWebPush = {
        sendNotification: async (): Promise<SendResult> => {
          throw erroHttp(status, headers)
        },
      }
      const adapter = new EnvioWebPush(CONFIGURACAO, { cliente, agora: () => AGORA })

      const resultado = await adapter.enviar(INSCRICAO, MENSAGEM)
      expect(resultado).toEqual(esperado)
      expect(JSON.stringify(resultado)).not.toContain(INSCRICAO.endpoint)
      expect(JSON.stringify(resultado)).not.toContain(INSCRICAO.chaves.auth)
    },
  )

  it('classifica timeout, rede e erro local de VAPID', async () => {
    const enviar = vi
      .fn<ClienteWebPush['sendNotification']>()
      .mockRejectedValueOnce(Object.assign(new Error('Socket timeout'), { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      .mockRejectedValueOnce(new Error('VAPID private key inválida'))
    const adapter = new EnvioWebPush(CONFIGURACAO, {
      cliente: { sendNotification: enviar },
      agora: () => AGORA,
    })

    await expect(adapter.enviar(INSCRICAO, MENSAGEM)).resolves.toMatchObject({
      tipo: 'RETRY',
      motivo: 'TIMEOUT',
    })
    await expect(adapter.enviar(INSCRICAO, MENSAGEM)).resolves.toMatchObject({
      tipo: 'RETRY',
      motivo: 'REDE',
    })
    await expect(adapter.enviar(INSCRICAO, MENSAGEM)).resolves.toEqual({
      tipo: 'ERRO_VAPID',
      statusCode: null,
    })
  })
})
