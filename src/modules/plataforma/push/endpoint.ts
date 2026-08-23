const HOSTS_EXATOS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com'])
const SUFIXOS_PERMITIDOS = ['.push.apple.com', '.notify.windows.com']

/**
 * O endpoint vira destino de uma chamada server-side. Restringir aos serviços
 * usados pelos navegadores suportados impede que a API de inscrição vire SSRF.
 */
export function endpointPushPermitido(valor: string): boolean {
  let url: URL
  try {
    url = new URL(valor)
  } catch {
    return false
  }

  if (url.protocol !== 'https:' || url.username || url.password) return false
  if (url.port && url.port !== '443') return false

  const host = url.hostname.toLowerCase()
  return HOSTS_EXATOS.has(host) || SUFIXOS_PERMITIDOS.some((sufixo) => host.endsWith(sufixo))
}
