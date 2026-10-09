const ROBO = /bot|crawler|spider|preview|slackbot|whatsapp|facebookexternalhit|twitterbot/i

export const COOKIE_VISITANTE_AFILIADO = 'nip_afiliado_visitante'

export function requisicaoAutomatizada(request: Request): boolean {
  return request.method === 'HEAD' || ROBO.test(request.headers.get('user-agent') ?? '')
}

export function novoTokenVisitante(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

/** A forma que `hashVisitante` aceita — a única regra, para a rota e o serviço. */
export function tokenVisitanteValido(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,160}$/.test(token)
}

/**
 * O token lido do cookie, ou um novo se faltar ou estiver fora da forma
 * (pente fino de 09/10, achado 7). Sem isto, um cookie adulterado fazia
 * `hashVisitante` lançar e a rota regravava o MESMO valor por 30 dias:
 * aquele navegador nunca mais gerava atribuição.
 */
export function tokenDoVisitante(lido: string | undefined): string {
  return lido !== undefined && tokenVisitanteValido(lido) ? lido : novoTokenVisitante()
}
