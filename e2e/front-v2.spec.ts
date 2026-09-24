import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { gerarComparacao } from './montar-comparacao'
import { SESSAO_SALVA } from './sessao'

/**
 * E2E visual — fora do CI, como o resto de `e2e/`. Não compara pixel a
 * pixel: sem Postgres local, o app integrado nunca mostra o MESMO dado da
 * referência (o site do cliente, `referencias/nip-front-v2-prints/`). O que
 * este spec garante é que cada rota do índice de referência abre no front
 * integrado, em duas telas, e deixa um HTML lado a lado para o parceiro
 * decidir visualmente o que é diferença de dado e o que é diferença de
 * layout de verdade.
 *
 * `E2E_BASE_URL` aponta para onde rodar (por padrão localhost:3000, do
 * `next dev`; para validar o script em si, aponte para a própria referência,
 * `https://nip-front.vercel.app` — ver `e2e/LEIA-ME-front-v2.md`).
 * `E2E_EMBUTIR=true` troca os links relativos do `comparacao.html` por
 * `data:` URI (autocontido, mais pesado) — ver `montar-comparacao.ts`.
 */

const EMAIL = process.env.E2E_EMAIL ?? ''
const SENHA = process.env.E2E_SENHA ?? ''

const SAIDA = path.resolve(
  process.cwd(),
  process.env.E2E_SAIDA ?? '.superpowers/sdd/2026-09-23-front-v2-integracao/prints-integrado',
)
const REFERENCIA_DIR = path.resolve(process.cwd(), 'referencias/nip-front-v2-prints')
const REFERENCIA_INDICE = path.join(REFERENCIA_DIR, 'indice.json')

interface RotaReferencia {
  caminho: string
  arquivo: string
}

interface RegistroViewport {
  status: number | null
  urlFinal: string
  titulo: string | null
  erro?: string
}

interface RegistroRota {
  caminho: string | null
  nome: string
  desktop?: RegistroViewport
  celular?: RegistroViewport
  observacao?: string
}

/** Garante uma sessão logada, se `E2E_EMAIL`/`E2E_SENHA` existirem; senão a varredura roda anônima (e cada redirecionamento fica registrado). Reaproveita a sessão salva por `entrar.setup.ts` quando ela já existe — não faz um segundo login pela mesma conta (limite de 2 aparelhos). */
async function garantirSessao(browser: Browser): Promise<string | undefined> {
  if (!EMAIL || !SENHA) return undefined
  if (existsSync(SESSAO_SALVA)) return SESSAO_SALVA

  const contexto = await browser.newContext()
  const pagina = await contexto.newPage()
  await pagina.goto('/entrar?destino=/')
  await pagina.fill('input[name="email"]', EMAIL)
  await pagina.fill('input[name="senha"]', SENHA)
  await pagina.locator('form button[type="submit"]').first().click()
  await pagina
    .waitForURL((url) => !url.pathname.startsWith('/entrar'), { timeout: 15_000 })
    .catch(() => {
      // Login falhou (senha errada, conta sem cortesia…): segue anônimo em
      // vez de derrubar a varredura inteira por causa da sessão.
    })
  await fs.mkdir(path.dirname(SESSAO_SALVA), { recursive: true })
  await contexto.storageState({ path: SESSAO_SALVA })
  await contexto.close()
  return SESSAO_SALVA
}

/** Abre a rota, tira o print cheio da página e registra status/URL final/título — nunca lança: uma rota que falha vira uma linha de erro no índice, não interrompe as outras. */
async function capturar(
  pagina: Page,
  rota: { caminho: string; nome: string },
  destinoDir: string,
): Promise<RegistroViewport> {
  const arquivo = path.join(destinoDir, `${rota.nome}.jpg`)
  try {
    const resposta = await pagina.goto(rota.caminho, { waitUntil: 'load', timeout: 30_000 })
    // Dá tempo de widgets do cliente (assistente, refresh do Ao Vivo) assentarem
    // antes do print — evita capturar um esqueleto de carregando.
    await pagina.waitForTimeout(300)
    await pagina.screenshot({ path: arquivo, fullPage: true, type: 'jpeg', quality: 70 })
    return {
      status: resposta?.status() ?? null,
      urlFinal: pagina.url(),
      titulo: await pagina.title(),
    }
  } catch (e) {
    return {
      status: null,
      urlFinal: pagina.url(),
      titulo: null,
      erro: e instanceof Error ? e.message : String(e),
    }
  }
}

test('varredura visual do front v2 integrado, rota por rota', async ({ browser }, testInfo) => {
  // Ler o índice, logar (se der) e varrer ~30 rotas em duas telas passa
  // fácil do 1 min padrão de um teste.
  test.setTimeout(10 * 60 * 1000)

  const { rotas: rotasRef, base } = JSON.parse(await fs.readFile(REFERENCIA_INDICE, 'utf-8')) as {
    base: string
    rotas: RotaReferencia[]
  }
  const rotas = rotasRef.map((r) => ({ caminho: r.caminho, nome: path.parse(r.arquivo).name }))

  const storageState = await garantirSessao(browser)
  // Fica visível no relatório do Playwright (não só enterrado no indice.json
  // de saída) se a varredura rodou logada ou anônima — a leitura das telas
  // pagas muda inteira de figura dependendo disso.
  testInfo.annotations.push({ type: 'logado', description: String(Boolean(storageState)) })

  const dirDesktop = path.join(SAIDA, 'desktop')
  const dirCelular = path.join(SAIDA, 'celular')
  await fs.mkdir(dirDesktop, { recursive: true })
  await fs.mkdir(dirCelular, { recursive: true })

  const contextoDesktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState,
  })
  const contextoCelular = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    storageState,
  })
  const paginaDesktop = await contextoDesktop.newPage()
  const paginaCelular = await contextoCelular.newPage()

  const registros: RegistroRota[] = []
  let hrefApito: string | null = null

  try {
    for (const rota of rotas) {
      const [desktop, celular] = await Promise.all([
        capturar(paginaDesktop, rota, dirDesktop),
        capturar(paginaCelular, rota, dirCelular),
      ])
      registros.push({ caminho: rota.caminho, nome: rota.nome, desktop, celular })

      // A Lista ("/") é onde o apito aparece linkado — captura o id de VERDADE
      // que a própria página está mostrando, em vez de fixar um uuid no spec.
      if (rota.caminho === '/') {
        hrefApito = await paginaDesktop
          .locator('a[href^="/apito/"]')
          .first()
          .getAttribute('href')
          .catch(() => null)
      }
    }

    if (hrefApito) {
      const rotaApito = { caminho: hrefApito, nome: 'apito_jogador' }
      const [desktop, celular] = await Promise.all([
        capturar(paginaDesktop, rotaApito, dirDesktop),
        capturar(paginaCelular, rotaApito, dirCelular),
      ])
      registros.push({ caminho: hrefApito, nome: 'apito_jogador', desktop, celular })
    } else {
      registros.push({
        caminho: null,
        nome: 'apito_jogador',
        observacao: 'nenhum link /apito/ encontrado na Lista — grátis, anônimo ou sem apito publicado hoje',
      })
    }
  } finally {
    await contextoDesktop.close()
    await contextoCelular.close()
  }

  const indiceIntegrado = {
    base: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    geradoEm: new Date().toISOString(),
    referenciaBase: base,
    logado: Boolean(storageState),
    rotas: registros,
  }
  await fs.writeFile(path.join(SAIDA, 'indice.json'), JSON.stringify(indiceIntegrado, null, 2), 'utf-8')

  const comparacao = await gerarComparacao({
    saida: SAIDA,
    referenciaDir: REFERENCIA_DIR,
    embutir: process.env.E2E_EMBUTIR === 'true',
  })

  console.log(`[front-v2] ${registros.length} rotas varridas · comparação em ${comparacao}`)
  expect(registros.length).toBeGreaterThan(0)
})
