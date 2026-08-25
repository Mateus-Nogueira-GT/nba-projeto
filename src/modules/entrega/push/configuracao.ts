export type ConfiguracaoPushAtiva = {
  habilitado: true
  publicoHabilitado: boolean
  chavePublica: string
  chavePrivada: string
  subject: string
}

export type AmbientePush = Readonly<Record<string, string | undefined>>

export type EstadoConfiguracaoPush =
  | ConfiguracaoPushAtiva
  | {
      habilitado: false
      motivo: 'DESABILITADO' | 'INVALIDO'
      camposInvalidos: string[]
    }

export class ErroConfiguracaoPush extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroConfiguracaoPush'
  }
}

export function lerConfiguracaoPush(ambiente: AmbientePush = process.env): EstadoConfiguracaoPush {
  const camposVapidPresentes = [
    ambiente.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ambiente.VAPID_PRIVATE_KEY,
    ambiente.VAPID_SUBJECT,
  ].some((valor) => Boolean(valor?.trim()))
  if (
    !camposVapidPresentes &&
    (ambiente.PUSH_ENABLED === undefined || ambiente.PUSH_ENABLED === 'false')
  ) {
    return { habilitado: false, motivo: 'DESABILITADO', camposInvalidos: [] }
  }

  const camposInvalidos: string[] = []
  if (
    ambiente.PUSH_ENABLED !== undefined &&
    ambiente.PUSH_ENABLED !== 'true' &&
    ambiente.PUSH_ENABLED !== 'false'
  ) {
    camposInvalidos.push('PUSH_ENABLED')
  }

  const chavePublica = ambiente.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? ''
  const chavePrivada = ambiente.VAPID_PRIVATE_KEY?.trim() ?? ''
  const subject = ambiente.VAPID_SUBJECT?.trim() ?? ''

  if (!chaveVapidValida(chavePublica, 65)) camposInvalidos.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  if (!chaveVapidValida(chavePrivada, 32)) camposInvalidos.push('VAPID_PRIVATE_KEY')
  if (!subjectValido(subject)) camposInvalidos.push('VAPID_SUBJECT')

  if (camposInvalidos.length > 0) {
    return { habilitado: false, motivo: 'INVALIDO', camposInvalidos }
  }

  return {
    habilitado: true,
    publicoHabilitado: ambiente.PUSH_ENABLED === 'true',
    chavePublica,
    chavePrivada,
    subject,
  }
}

export function exigirConfiguracaoPush(
  ambiente: AmbientePush = process.env,
): ConfiguracaoPushAtiva {
  const configuracao = lerConfiguracaoPush(ambiente)
  if (configuracao.habilitado) return configuracao

  const detalhe =
    configuracao.motivo === 'DESABILITADO'
      ? 'PUSH_ENABLED não está ativo'
      : `configuração inválida: ${configuracao.camposInvalidos.join(', ')}`
  throw new ErroConfiguracaoPush(`Web Push indisponível: ${detalhe}`)
}

function chaveVapidValida(valor: string, tamanhoEsperado: number): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(valor)) return false
  try {
    return Buffer.from(valor, 'base64url').byteLength === tamanhoEsperado
  } catch {
    return false
  }
}

function subjectValido(valor: string): boolean {
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(valor)) return true
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' && url.hostname !== 'localhost'
  } catch {
    return false
  }
}
