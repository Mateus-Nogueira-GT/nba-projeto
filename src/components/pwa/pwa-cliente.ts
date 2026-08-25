export const EVENTO_ATUALIZACAO_PWA = 'ia-da-nba:pwa-atualizacao'
export const CHAVE_ATUALIZACAO_SOLICITADA = 'ia-da-nba:pwa-atualizacao-solicitada'

export type EventoInstalacaoPwa = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type NavegadorStandalone = Navigator & { standalone?: boolean }

export type AmbienteInstalacaoPwa = {
  contextoSeguro: boolean
  serviceWorker: boolean
  instalado: boolean
  iosComInstalacaoManual: boolean
}

export function lerAmbienteInstalacaoPwa(): AmbienteInstalacaoPwa {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      contextoSeguro: false,
      serviceWorker: false,
      instalado: false,
      iosComInstalacaoManual: false,
    }
  }

  const navegador = navigator as NavegadorStandalone
  return {
    contextoSeguro: window.isSecureContext,
    serviceWorker: 'serviceWorker' in navigator,
    instalado:
      navegador.standalone === true ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches),
    // `standalone` é uma capacidade exposta pelo WebKit no iOS/iPadOS. Não
    // dependemos de user-agent nem presumimos que todo Safari seja instalável.
    iosComInstalacaoManual: typeof navegador.standalone === 'boolean',
  }
}

export async function existeAtualizacaoPwa(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const registro = await navigator.serviceWorker.getRegistration('/')
    return Boolean(navigator.serviceWorker.controller && registro?.waiting)
  } catch {
    return false
  }
}

export async function aplicarAtualizacaoPwa(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('service worker indisponível')
  }
  const registro = await navigator.serviceWorker.getRegistration('/')
  if (!registro?.waiting) throw new Error('nenhuma atualização aguardando')

  sessionStorage.setItem(CHAVE_ATUALIZACAO_SOLICITADA, '1')
  registro.waiting.postMessage({ tipo: 'PWA_APLICAR_ATUALIZACAO' })
}

export function registrarEventoPwa(
  evento:
    | 'CONVITE_EXIBIDO'
    | 'PROMPT_ACEITO'
    | 'PROMPT_RECUSADO'
    | 'INSTALADO'
    | 'ATUALIZACAO_DISPONIVEL'
    | 'ATUALIZACAO_APLICADA',
): void {
  // Telemetria mínima, sem usuário, endpoint, URL visitada ou fingerprint.
  console.info(JSON.stringify({ evento: `pwa_${evento.toLowerCase()}` }))
}
