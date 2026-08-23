/* IA da NBA — worker único compartilhado pelas Specs 02 e 03. */

const PREFIXO_CACHE = 'ia-da-nba-pwa-'
const VERSAO_CACHE = 'v1'
const CACHE_PUBLICO = `${PREFIXO_CACHE}${VERSAO_CACHE}`
const PAGINA_OFFLINE = '/offline'
const ASSETS_PUBLICOS = new Set([
  PAGINA_OFFLINE,
  '/icons/app-192.png',
  '/icons/app-512.png',
  '/icons/app-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/notification.png',
  '/icons/badge.png',
])

const VERSAO_PUSH = 1
const CANAIS_PUSH = new Set(['FIRE_LIVE_APITO', 'GREEN', 'LISTA_SECRETA'])
const CAMINHOS_PERMITIDOS = new Set(['/'])
const ATRIBUTOS = new Set(['PONTOS', 'REBOTES', 'ASSISTENCIAS'])
const NIVEIS = new Set(['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA'])
// Assets neutros de homologação. A identidade PNG/maskable final pertence à Spec 03.
const ICONE_NOTIFICACAO = '/icons/notification.png'
const BADGE_NOTIFICACAO = '/icons/badge.png'

function assetPublicoPermitido(url) {
  return (
    url.origin === self.location.origin &&
    (ASSETS_PUBLICOS.has(url.pathname) || url.pathname.startsWith('/_next/static/'))
  )
}

function navegacaoComFallback(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname === '/' ||
      url.pathname.startsWith('/estatisticas') ||
      url.pathname.startsWith('/fire-live'))
  )
}

async function responderAssetPublico(requisicao) {
  const cache = await caches.open(CACHE_PUBLICO)
  const armazenado = await cache.match(requisicao)
  if (armazenado) return armazenado

  const resposta = await fetch(requisicao)
  if (resposta.ok && resposta.type !== 'opaque') {
    await cache.put(requisicao, resposta.clone())
  }
  return resposta
}

async function responderNavegacao(requisicao) {
  try {
    // A resposta de navegação nunca é escrita no Cache Storage. Isso inclui
    // Lista Secreta, Fire Live, estatísticas e qualquer HTML autenticado.
    return await fetch(requisicao)
  } catch {
    const offline = await caches.match(PAGINA_OFFLINE, { cacheName: CACHE_PUBLICO })
    return offline ?? Response.error()
  }
}

function objetoSimples(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
}

function textoValido(valor, maximo) {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= maximo
}

function instanteValido(valor) {
  return (
    typeof valor === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(valor) &&
    Number.isFinite(Date.parse(valor))
  )
}

function numeroNaoNegativo(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
}

function uuidValido(valor) {
  return (
    typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
  )
}

function possuiSomenteChaves(valor, esperadas) {
  if (!objetoSimples(valor)) return false
  const chaves = Object.keys(valor)
  return chaves.length === esperadas.length && esperadas.every((chave) => chaves.includes(chave))
}

function dadosValidos(canal, dados) {
  if (canal === 'FIRE_LIVE_APITO') {
    if (
      !possuiSomenteChaves(dados, [
        'jogoId',
        'jogadorId',
        'atributo',
        'nivelJogador',
        'alvo1Q',
        'modoFire',
        'opdOrigemNivel',
      ])
    ) {
      return false
    }
    return (
      uuidValido(dados.jogoId) &&
      uuidValido(dados.jogadorId) &&
      ATRIBUTOS.has(dados.atributo) &&
      NIVEIS.has(dados.nivelJogador) &&
      numeroNaoNegativo(dados.alvo1Q) &&
      typeof dados.modoFire === 'boolean' &&
      (dados.opdOrigemNivel === null || [1, 2, 3].includes(dados.opdOrigemNivel))
    )
  }

  if (canal === 'GREEN') {
    if (
      !possuiSomenteChaves(dados, [
        'jogoId',
        'jogadorId',
        'atributo',
        'nivelJogador',
        'marco',
        'valor',
      ])
    ) {
      return false
    }
    return (
      uuidValido(dados.jogoId) &&
      uuidValido(dados.jogadorId) &&
      dados.atributo === 'PONTOS' &&
      NIVEIS.has(dados.nivelJogador) &&
      numeroNaoNegativo(dados.marco) &&
      numeroNaoNegativo(dados.valor)
    )
  }

  return canal === 'LISTA_SECRETA' && possuiSomenteChaves(dados, [])
}

function deepLinkSeguro(valor) {
  if (typeof valor !== 'string' || !valor.startsWith('/') || valor.startsWith('//')) return null
  if (!CAMINHOS_PERMITIDOS.has(valor)) return null

  let destino
  try {
    destino = new URL(valor, self.location.origin)
  } catch {
    return null
  }

  if (destino.origin !== self.location.origin) return null
  return destino
}

function mensagemValida(valor) {
  if (
    !possuiSomenteChaves(valor, [
      'versao',
      'chave',
      'canal',
      'titulo',
      'corpo',
      'url',
      'ocorridoEm',
      'expiraEm',
      'dados',
    ])
  ) {
    return false
  }
  if (valor.versao !== VERSAO_PUSH) return false
  if (!textoValido(valor.chave, 200) || !CANAIS_PUSH.has(valor.canal)) return false
  if (!textoValido(valor.titulo, 120) || !textoValido(valor.corpo, 500)) return false
  if (deepLinkSeguro(valor.url) === null) return false
  if (!instanteValido(valor.ocorridoEm) || !instanteValido(valor.expiraEm)) return false
  if (Date.parse(valor.expiraEm) <= Date.parse(valor.ocorridoEm)) return false
  return dadosValidos(valor.canal, valor.dados)
}

function expirada(expiraEm) {
  return !instanteValido(expiraEm) || Date.now() >= Date.parse(expiraEm)
}

async function receberPush(evento) {
  let mensagem
  try {
    mensagem = evento.data?.json()
  } catch {
    console.error('Push descartado: JSON inválido.')
    return
  }

  if (!mensagemValida(mensagem)) {
    console.error('Push descartado: contrato inválido.')
    return
  }
  if (expirada(mensagem.expiraEm)) return

  await self.registration.showNotification(mensagem.titulo, {
    body: mensagem.corpo,
    tag: mensagem.chave,
    lang: 'pt-BR',
    icon: ICONE_NOTIFICACAO,
    badge: BADGE_NOTIFICACAO,
    timestamp: Date.parse(mensagem.ocorridoEm),
    data: {
      chave: mensagem.chave,
      url: mensagem.url,
      expiraEm: mensagem.expiraEm,
    },
  })
}

async function abrirNotificacao(evento) {
  evento.notification.close()

  const dados = evento.notification.data
  if (!objetoSimples(dados) || expirada(dados.expiraEm)) return

  const destino = deepLinkSeguro(dados.url)
  if (destino === null) {
    console.error('Clique de Push descartado: deep link inválido.')
    return
  }

  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const existente = janelas.find((janela) => {
    try {
      return new URL(janela.url).origin === self.location.origin
    } catch {
      return false
    }
  })

  if (existente !== undefined) {
    if (typeof existente.navigate === 'function' && existente.url !== destino.href) {
      const navegada = await existente.navigate(destino.href)
      if (navegada !== null && typeof navegada.focus === 'function') {
        await navegada.focus()
        return
      }
    }
    await existente.focus()
    return
  }

  await self.clients.openWindow(destino.href)
}

self.addEventListener('push', (evento) => {
  evento.waitUntil(receberPush(evento))
})

self.addEventListener('notificationclick', (evento) => {
  evento.waitUntil(abrirNotificacao(evento))
})

self.addEventListener('install', (evento) => {
  // Sem skipWaiting automático: uma versão nova aguarda confirmação na UI.
  evento.waitUntil(caches.open(CACHE_PUBLICO).then((cache) => cache.addAll([...ASSETS_PUBLICOS])))
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome.startsWith(PREFIXO_CACHE) && nome !== CACHE_PUBLICO)
            .map((nome) => caches.delete(nome)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (evento) => {
  if (
    objetoSimples(evento.data) &&
    possuiSomenteChaves(evento.data, ['tipo']) &&
    evento.data.tipo === 'PWA_APLICAR_ATUALIZACAO'
  ) {
    evento.waitUntil(self.skipWaiting())
  }
})

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request
  if (requisicao.method !== 'GET') return

  const url = new URL(requisicao.url)
  if (assetPublicoPermitido(url)) {
    evento.respondWith(responderAssetPublico(requisicao))
    return
  }
  if (requisicao.mode === 'navigate' && navegacaoComFallback(url)) {
    evento.respondWith(responderNavegacao(requisicao))
  }
})
