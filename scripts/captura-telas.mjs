import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { setTimeout as esperar } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import WebSocket from 'ws'

// A emulação via CDP fixa o viewport REAL. A largura mínima da janela desktop
// do Chrome não transforma silenciosamente o teste de 390 px em um de 500 px.
const altura = Number(process.argv[2] ?? 1800)
// As QUATRO larguras que o manual manda validar (p.6, "verificação antes de
// publicar"): 320, 390, 768 e 1440, sem rolagem horizontal em nenhuma.
// `CAPTURA_LARGURAS=1440` recorta para uma só quando se está conferindo uma
// tela de cada vez.
const LARGURAS = (process.env.CAPTURA_LARGURAS ?? '320,390,768,1440')
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isInteger(n) && n >= 320 && n <= 4000)
if (LARGURAS.length === 0) throw new Error('CAPTURA_LARGURAS não tem nenhuma largura válida.')
/** Telas que vazaram para os lados — o manual proíbe, e a captura reprova. */
const vazamentos = []
const entrada = resolve(process.env.CONFERENCIA_DIR ?? '.superpowers/conferencia')
const saida = resolve(process.env.CAPTURA_DIR ?? '.superpowers/capturas')
const arquivos = (await readdir(entrada)).filter((nome) => nome.endsWith('.html')).sort()
if (arquivos.length === 0) throw new Error(`Nenhum HTML de conferência em ${entrada}.`)
const perfil = await mkdtemp(join(tmpdir(), 'nba-conferencia-'))
const chrome = spawn(
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${perfil}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
let erroChrome
chrome.once('error', (erro) => {
  erroChrome = erro
})
let socket
const pendentes = new Map()
let proximoId = 0
function enviar(method, params = {}, sessionId) {
  return new Promise((resolvePedido, rejeitar) => {
    const id = ++proximoId
    const timer = setTimeout(() => {
      pendentes.delete(id)
      rejeitar(new Error(`Chrome excedeu o prazo: ${method}`))
    }, 30000)
    pendentes.set(id, { resolvePedido, rejeitar, timer })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}

try {
  let endereco
  for (let tentativa = 0; tentativa < 150; tentativa += 1) {
    if (erroChrome) throw erroChrome
    if (chrome.exitCode !== null) throw new Error(`Chrome encerrou com código ${chrome.exitCode}.`)
    try {
      const [porta, caminho] = (await readFile(join(perfil, 'DevToolsActivePort'), 'utf8'))
        .trim()
        .split('\n')
      endereco = `ws://127.0.0.1:${porta}${caminho}`
      break
    } catch (erro) {
      if (erro.code !== 'ENOENT') throw erro
      await esperar(100)
    }
  }
  if (!endereco) throw new Error('Chrome não abriu a porta de captura em 15 segundos.')
  socket = new WebSocket(endereco)
  await new Promise((resolver, rejeitar) => {
    socket.once('open', resolver)
    socket.once('error', rejeitar)
  })
  socket.on('message', (dados) => {
    const mensagem = JSON.parse(dados.toString())
    const pedido = pendentes.get(mensagem.id)
    if (!pedido) return
    clearTimeout(pedido.timer)
    pendentes.delete(mensagem.id)
    if (mensagem.error) pedido.rejeitar(new Error(mensagem.error.message))
    else pedido.resolvePedido(mensagem.result)
  })
  const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true })
  const pagina = (method, params) => enviar(method, params, sessionId)
  await pagina('Page.enable')
  const relatorio = []
  for (const arquivo of arquivos) {
    for (const largura of LARGURAS) {
      await pagina('Emulation.setDeviceMetricsOverride', {
        width: largura,
        height: altura,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await pagina('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      const url = pathToFileURL(join(entrada, arquivo)).href
      const navegacao = await pagina('Page.navigate', { url })
      if (navegacao.errorText) throw new Error(`${arquivo}: ${navegacao.errorText}`)
      let carregou = false
      for (let tentativa = 0; tentativa < 100; tentativa += 1) {
        const estado = await pagina('Runtime.evaluate', {
          expression: `location.href === ${JSON.stringify(url)} && document.readyState !== 'loading'`,
          returnByValue: true,
        })
        if (estado.result.value) {
          carregou = true
          break
        }
        await esperar(100)
      }
      if (!carregou) throw new Error(`${arquivo}: HTML não carregou em 10 segundos.`)
      const inspeccao = await pagina('Runtime.evaluate', {
        expression: `(async () => {
          await Promise.race([
            Promise.allSettled([document.fonts.ready, ...Array.from(document.images, imagem => imagem.decode())]),
            new Promise(resolver => setTimeout(resolver, 8000)),
          ]);
          return {
            largura: innerWidth, altura: innerHeight,
            larguraConteudo: document.documentElement.scrollWidth,
            alturaConteudo: document.documentElement.scrollHeight,
            texto: document.body.innerText.length,
            fontes: document.fonts.status,
            imagensAusentes: Array.from(document.images).filter(i => !i.complete || !i.naturalWidth).map(i => i.currentSrc || i.src),
          };
        })()`,
        awaitPromise: true,
        returnByValue: true,
      })
      if (inspeccao.exceptionDetails) throw new Error(`${arquivo}: falha ao inspecionar o HTML.`)
      const metricas = inspeccao.result.value
      if (metricas.largura !== largura || metricas.texto === 0)
        throw new Error(`${arquivo}: viewport incorreto ou tela vazia.`)
      if (metricas.larguraConteudo > largura) {
        vazamentos.push(
          `${arquivo} @ ${largura}px: conteúdo com ${metricas.larguraConteudo}px`,
        )
      }
      const nome = `${arquivo.replace(/\.html$/, '')}-${largura}`
      const foto = await pagina('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      })
      await writeFile(join(saida, `${nome}.png`), Buffer.from(foto.data, 'base64'))
      let completa
      if (metricas.alturaConteudo > altura) {
        completa = `${nome}-completa.png`
        const paginaInteira = await pagina('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: largura, height: metricas.alturaConteudo, scale: 1 },
        })
        await writeFile(join(saida, completa), Buffer.from(paginaInteira.data, 'base64'))
      }
      relatorio.push({ tela: arquivo, foto: `${nome}.png`, completa, ...metricas })
      console.log(
        `  ✓ ${nome}.png · ${largura}×${altura}${metricas.larguraConteudo > largura ? ' · conteúdo excede viewport (ver relatório)' : ''}${metricas.imagensAusentes.length > 0 ? ' · imagem externa indisponível' : ''}`,
      )
    }
  }
  await writeFile(join(saida, 'conferencia.json'), `${JSON.stringify(relatorio, null, 2)}\n`)
  console.log(
    `Capturas: ${relatorio.length}. Métricas e recursos ausentes: ${join(saida, 'conferencia.json')}`,
  )
  if (vazamentos.length > 0) {
    // Não é aviso: o manual pede as quatro larguras SEM rolagem horizontal, e
    // uma tela que vaza é defeito, não gosto.
    console.error(`\nROLAGEM HORIZONTAL (o manual proíbe):\n  ${vazamentos.join('\n  ')}`)
    process.exitCode = 1
  }
} finally {
  for (const pedido of pendentes.values()) clearTimeout(pedido.timer)
  socket?.close()
  chrome.kill('SIGTERM')
  if (chrome.exitCode === null && chrome.signalCode === null) {
    await Promise.race([
      new Promise((resolver) => chrome.once('exit', resolver)),
      esperar(3000).then(() => chrome.kill('SIGKILL')),
    ])
  }
  await rm(perfil, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
