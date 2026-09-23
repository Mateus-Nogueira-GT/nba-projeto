export const CAMINHO_SERVICE_WORKER = '/sw.js'
export const ESCOPO_SERVICE_WORKER = '/'

export class ErroClientePush extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroClientePush'
  }
}

export type AmbientePush = {
  contextoSeguro: boolean
  suportado: boolean
  iosInstalavel: boolean
  instalado: boolean
  permissao: NotificationPermission | 'indisponivel'
}

export const CANAIS_ALERTA = ['FIRE_LIVE_APITO', 'GREEN', 'LISTA_SECRETA'] as const
export type CanalAlerta = (typeof CANAIS_ALERTA)[number]
export type PreferenciasAlerta = Record<CanalAlerta, boolean>

type NavegadorComStandalone = Navigator & { standalone?: boolean }

export function lerAmbientePush(): AmbientePush {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      contextoSeguro: false,
      suportado: false,
      iosInstalavel: false,
      instalado: false,
      permissao: 'indisponivel',
    }
  }

  const navegador = navigator as NavegadorComStandalone
  const contextoSeguro = window.isSecureContext
  const instalado =
    navegador.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  const iosInstalavel = typeof navegador.standalone === 'boolean'
  const suportado =
    contextoSeguro &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  return {
    contextoSeguro,
    suportado,
    iosInstalavel,
    instalado,
    permissao: 'Notification' in window ? Notification.permission : 'indisponivel',
  }
}

export function converterChaveVapid(chave: string): Uint8Array<ArrayBuffer> {
  const limpa = chave.trim()
  if (limpa.length === 0) throw new ErroClientePush('Chave pública de alertas não configurada.')

  const base64 = limpa.replace(/-/g, '+').replace(/_/g, '/')
  const normalizada = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')

  let binario: string
  try {
    binario = atob(normalizada)
  } catch {
    throw new ErroClientePush('Chave pública de alertas inválida.')
  }

  if (binario.length === 0) throw new ErroClientePush('Chave pública de alertas inválida.')
  return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0))
}

export async function garantirRegistroServiceWorker(): Promise<ServiceWorkerRegistration> {
  const ambiente = lerAmbientePush()
  if (!ambiente.contextoSeguro) {
    throw new ErroClientePush('Alertas exigem uma conexão segura.')
  }
  if (!ambiente.suportado) {
    throw new ErroClientePush('Este navegador não oferece suporte a alertas Web Push.')
  }

  const existente = await navigator.serviceWorker.getRegistration(ESCOPO_SERVICE_WORKER)
  if (existente !== undefined) return existente

  return navigator.serviceWorker.register(CAMINHO_SERVICE_WORKER, {
    scope: ESCOPO_SERVICE_WORKER,
    updateViaCache: 'none',
  })
}

function corpoDaInscricao(inscricao: PushSubscription) {
  const corpo = inscricao.toJSON()
  if (
    typeof corpo.endpoint !== 'string' ||
    corpo.endpoint.length === 0 ||
    typeof corpo.keys?.p256dh !== 'string' ||
    typeof corpo.keys.auth !== 'string'
  ) {
    throw new ErroClientePush('O navegador devolveu uma inscrição incompleta.')
  }

  return {
    endpoint: corpo.endpoint,
    expirationTime: corpo.expirationTime ?? null,
    keys: {
      p256dh: corpo.keys.p256dh,
      auth: corpo.keys.auth,
    },
  }
}

export const CHAVE_ULTIMA_INSCRICAO = 'nip.push.ultima-inscricao'
const REENVIO_MAXIMO_MS = 24 * 3600_000

type InscricaoEnviada = { usuarioId: string; endpoint: string; p256dh: string; auth: string }

/**
 * Reenviar a inscrição a cada montagem da home gravava uma linha de auditoria
 * por visita (W2-2). Só reenvia se algo mudou — ou uma vez por dia, que é o
 * que devolve à vida uma inscrição que o servidor invalidou (403/410) sem o
 * navegador saber.
 */
export function deveEnviarInscricao(
  guardado: string | null,
  atual: InscricaoEnviada,
  agora: number,
): boolean {
  if (!guardado) return true
  try {
    const g = JSON.parse(guardado) as Partial<InscricaoEnviada & { enviadoEm: number }>
    return !(
      g.usuarioId === atual.usuarioId &&
      g.endpoint === atual.endpoint &&
      g.p256dh === atual.p256dh &&
      g.auth === atual.auth &&
      typeof g.enviadoEm === 'number' &&
      agora - g.enviadoEm < REENVIO_MAXIMO_MS
    )
  } catch {
    return true
  }
}

function lerGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_INSCRICAO)
  } catch {
    return null
  }
}

function guardar(valor: InscricaoEnviada & { enviadoEm: number }): void {
  try {
    localStorage.setItem(CHAVE_ULTIMA_INSCRICAO, JSON.stringify(valor))
  } catch {
    // aba privada / storage bloqueado: só perde a economia, nunca o alerta
  }
}

export async function inscreverPush(
  chavePublicaVapid: string,
  usuarioId: string,
  agora = Date.now(),
): Promise<PushSubscription> {
  if (Notification.permission !== 'granted') {
    throw new ErroClientePush('A permissão de notificações ainda não foi concedida.')
  }

  const registro = await garantirRegistroServiceWorker()
  const existente = await registro.pushManager.getSubscription()
  const inscricao =
    existente ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: converterChaveVapid(chavePublicaVapid),
    }))

  const corpo = corpoDaInscricao(inscricao)
  const atual = {
    usuarioId,
    endpoint: corpo.endpoint,
    p256dh: corpo.keys.p256dh,
    auth: corpo.keys.auth,
  }
  if (!deveEnviarInscricao(lerGuardado(), atual, agora)) return inscricao

  const resposta = await fetch('/api/push/inscricoes', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })

  if (!resposta.ok) {
    throw new ErroClientePush(
      resposta.status === 401
        ? 'Entre novamente para ativar alertas neste dispositivo.'
        : 'Não foi possível vincular este dispositivo aos alertas.',
    )
  }

  guardar({ ...atual, enviadoEm: agora })
  return inscricao
}

export async function existeInscricaoPush(): Promise<boolean> {
  if (!lerAmbientePush().suportado) return false
  const registro = await navigator.serviceWorker.getRegistration(ESCOPO_SERVICE_WORKER)
  if (registro === undefined) return false
  return (await registro.pushManager.getSubscription()) !== null
}

export async function removerVinculoPush(): Promise<void> {
  // Desativar aqui e o servidor invalidar por 403/410 são o mesmo estado:
  // sem inscrição válida. Sem isto, `deveEnviarInscricao` acharia que o
  // guardado ainda vale e passaria até 24h sem reenviar após reativar.
  try {
    localStorage.removeItem(CHAVE_ULTIMA_INSCRICAO)
  } catch {
    // aba privada / storage bloqueado: nada para limpar
  }
  const resposta = await fetch('/api/push/inscricoes', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
  })
  if (!resposta.ok) {
    throw new ErroClientePush(
      resposta.status === 401
        ? 'Entre novamente para alterar os alertas deste dispositivo.'
        : 'Não foi possível desativar os alertas agora.',
    )
  }
}

export async function lerPreferenciasPush(): Promise<PreferenciasAlerta> {
  const resposta = await fetch('/api/push/preferencias', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!resposta.ok) throw new ErroClientePush('Não foi possível carregar suas preferências.')
  const corpo = (await resposta.json()) as { preferencias?: Partial<PreferenciasAlerta> }
  if (
    !corpo.preferencias ||
    CANAIS_ALERTA.some((canal) => typeof corpo.preferencias?.[canal] !== 'boolean')
  ) {
    throw new ErroClientePush('O servidor devolveu preferências inválidas.')
  }
  return corpo.preferencias as PreferenciasAlerta
}

export async function atualizarPreferenciaPush(
  canal: CanalAlerta,
  habilitado: boolean,
): Promise<PreferenciasAlerta> {
  const resposta = await fetch('/api/push/preferencias', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ canal, habilitado }),
  })
  if (!resposta.ok) throw new ErroClientePush('Não foi possível salvar sua preferência.')
  const corpo = (await resposta.json()) as { preferencias?: PreferenciasAlerta }
  if (!corpo.preferencias) throw new ErroClientePush('O servidor devolveu preferências inválidas.')
  return corpo.preferencias
}
