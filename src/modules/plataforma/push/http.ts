export const LIMITE_PAYLOAD_PUSH_BYTES = 8 * 1024

export class PayloadMuitoGrandeError extends Error {
  constructor() {
    super('payload excede o limite permitido')
    this.name = 'PayloadMuitoGrandeError'
  }
}

export function origemDaMutacaoValida(request: Request): boolean {
  const origem = request.headers.get('origin')
  if (!origem) return process.env.NODE_ENV === 'test'
  try {
    return new URL(origem).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function conteudoJson(request: Request): boolean {
  return request.headers.get('content-type')?.split(';', 1)[0]?.trim() === 'application/json'
}

export async function lerJsonLimitado(request: Request): Promise<unknown> {
  const declarado = Number(request.headers.get('content-length'))
  if (Number.isFinite(declarado) && declarado > LIMITE_PAYLOAD_PUSH_BYTES) {
    throw new PayloadMuitoGrandeError()
  }

  const corpo = await request.text()
  if (new TextEncoder().encode(corpo).byteLength > LIMITE_PAYLOAD_PUSH_BYTES) {
    throw new PayloadMuitoGrandeError()
  }
  return JSON.parse(corpo)
}
