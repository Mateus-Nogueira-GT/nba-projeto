import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Db } from '../../modules/dominio/db/tipos'

const MODULOS_CSS_DA_CONFERENCIA = [
  'src/components/ao-vivo/SeletorJogosAoVivo.module.css',
  'src/components/ao-vivo/ExperienciaAoVivo.module.css',
  'src/components/preferencias/BotaoAcompanharJogador.module.css',
] as const

/** Reaplica ao HTML estático os nomes que o Vitest gerou para CSS Modules. */
function cssDoModulo(html: string, fonte: string): string {
  let resultado = fonte.replace(/:global\(([^)]+)\)/g, '$1')
  const classes = [...new Set([...fonte.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((item) => item[1]!))]
  for (const nome of classes) {
    const seguro = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const hash = html.match(new RegExp(`_${seguro}_([a-z0-9]+)`))?.[1]
    if (!hash) continue
    resultado = resultado.replace(new RegExp(`\\.${seguro}(?![\\w-])`, 'g'), `._${nome}_${hash}`)
  }
  return resultado
}

/** Enriquece só a fixture de captura com o mapa curado, sem consultar o CDN. */
export async function prepararFotosConferencia(db: Db): Promise<void> {
  if (process.env.CONFERENCIA !== '1') return
  const { aplicarFotos } = await import('../../modules/ingestao/demo/fotos')
  await aplicarFotos(db, async () => true)
}

/** O HTML dos testes, com os mesmos tokens/reset do app; nenhum banco externo. */
export async function gravarConferencia(nome: string, html: string): Promise<void> {
  if (process.env.CONFERENCIA !== '1') return
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nome)) throw new Error('Nome inválido para conferência.')

  const dir = process.env.CONFERENCIA_DIR ?? '.superpowers/conferencia'
  const [tokens, global, ...modulos] = await Promise.all([
    readFile('src/design-system/tokens/tokens.css', 'utf8'),
    readFile('src/app/globals.css', 'utf8'),
    ...MODULOS_CSS_DA_CONFERENCIA.map((arquivo) => readFile(arquivo, 'utf8')),
  ])
  // Imagens locais do PWA continuam acessíveis sob file://; o next/image
  // otimizado não tem servidor neste arnês, então a imagem usa seu src original.
  const documento = html
    .replace(/\s(?:srcSet|srcset)="[^"]*"/g, '')
    .replace(/loading="lazy"/g, 'loading="eager"')
    .replace(/src="([^"<]+)"/g, (original, src: string) => {
      let url = src.replaceAll('&amp;', '&')
      if (url.startsWith('/_next/image?')) {
        url = new URL(url, 'http://conferencia.local').searchParams.get('url') ?? url
      }
      if (url.startsWith('/') && !url.startsWith('//')) {
        url = pathToFileURL(resolve('public', `.${url}`)).href
      }
      return url === src
        ? original
        : `src="${url.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
    })
  await mkdir(dir, { recursive: true })
  const cssModular = modulos.map((fonte) => cssDoModulo(documento, fonte)).join('\n')
  await writeFile(
    resolve(dir, `${nome}.html`),
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conferência · ${nome}</title><link href="https://fonts.googleapis.com/css2?family=Anton&amp;family=Barlow:wght@400;600;700&amp;family=Barlow+Condensed:wght@500;600;700&amp;display=swap" rel="stylesheet"><style>:root{--fonte-anton:'Anton';--fonte-barlow:'Barlow';--fonte-barlow-condensed:'Barlow Condensed'}${tokens}\n${global}\n${cssModular}</style></head><body>${documento}</body></html>`,
  )
}
