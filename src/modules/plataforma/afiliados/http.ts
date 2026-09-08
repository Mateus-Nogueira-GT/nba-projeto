const ROBO = /bot|crawler|spider|preview|slackbot|whatsapp|facebookexternalhit|twitterbot/i

export const COOKIE_VISITANTE_AFILIADO = 'nip_afiliado_visitante'

export function requisicaoAutomatizada(request: Request): boolean {
  return request.method === 'HEAD' || ROBO.test(request.headers.get('user-agent') ?? '')
}

export function novoTokenVisitante(): string {
  return crypto.randomUUID().replaceAll('-', '')
}
