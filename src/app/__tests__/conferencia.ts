import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Db } from '../../modules/dominio/db/tipos'

const MODULOS_CSS_DA_CONFERENCIA = [
  'src/components/ao-vivo/SeletorJogosAoVivo.module.css',
  'src/components/ao-vivo/ExperienciaAoVivo.module.css',
  'src/components/preferencias/BotaoAcompanharJogador.module.css',
  'src/components/navegacao/Moldura.module.css',
  'src/components/navegacao/FolhaDeFiltros.module.css',
  'src/components/lateral/Lateral.module.css',
  'src/components/planos/SilhuetaPaga.module.css',
] as const

/** Os nomes dentro de `:global(...)`: são do documento, não do módulo. */
function globaisDe(fonte: string): Set<string> {
  const nomes = new Set<string>()
  for (const achado of fonte.matchAll(/:global\(([^)]+)\)/g)) {
    for (const classe of achado[1]!.matchAll(/\.([A-Za-z_][\w-]*)/g)) nomes.add(classe[1]!)
  }
  return nomes
}

/**
 * Os nomes de classe que o .module.css DECLARA — os globais ficam de fora.
 *
 * `:global(.barra-inferior)` não ganha hash na compilação: ele aponta para uma
 * classe escrita à mão no componente. Reescrevê-lo produzia um seletor que não
 * casa com nada, e a regra que esconde a barra inferior no desktop simplesmente
 * não saía na conferência — as duas barras apareciam juntas a 1440.
 */
function classesDe(fonte: string): string[] {
  const globais = globaisDe(fonte)
  return [
    ...new Set(
      [...fonte.matchAll(/\.([A-Za-z_][\w-]*)/g)]
        .map((item) => item[1]!)
        .filter((nome) => !globais.has(nome)),
    ),
  ]
}

/**
 * Reaplica ao HTML estático os nomes que o Vitest gerou para CSS Modules.
 *
 * O hash é POR ARQUIVO, e é preciso descobrir qual é o deste antes de reescrever
 * qualquer classe. Procurar cada classe isoladamente no HTML não serve: dois
 * módulos podem declarar uma classe de mesmo nome (`Moldura` e `FolhaDeFiltros`
 * têm as duas uma `.raiz`), e aí o primeiro `_raiz_…` do documento pode ser o do
 * outro arquivo — as regras de um módulo passam a vestir os elementos do outro.
 * Foi o que aconteceu na primeira captura da identidade 05: o `justify-content:
 * flex-end` dos filtros caiu na raiz da moldura e empurrou a página inteira para
 * a direita, numa conferência boa o bastante para não levantar suspeita.
 *
 * A identificação usa só os nomes EXCLUSIVOS do módulo (`coluna`, `chipMenu`),
 * que não podem ser confundidos com os de outro arquivo. Nenhum exclusivo no
 * HTML significa que este módulo não foi renderizado nesta tela, e aí não há
 * seletor a acertar.
 */
function cssDoModulo(html: string, fonte: string, exclusivas: Set<string>): string {
  const resultado = fonte.replace(/:global\(([^)]+)\)/g, '$1')
  const classes = classesDe(fonte)

  let hash: string | undefined
  for (const nome of classes) {
    if (!exclusivas.has(nome)) continue
    const seguro = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    hash = html.match(new RegExp(`_${seguro}_([a-z0-9]+)`))?.[1]
    if (hash) break
  }
  if (!hash) return ''

  let saida = resultado
  for (const nome of classes) {
    const seguro = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    saida = saida.replace(new RegExp(`\\.${seguro}(?![\\w-])`, 'g'), `._${nome}_${hash}`)
  }
  return saida
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
  // Um nome de classe pertence a este módulo só se nenhum outro o declara —
  // são esses que identificam o hash sem risco de trocar um módulo pelo outro.
  const contagem = new Map<string, number>()
  for (const fonte of modulos) {
    for (const nome of classesDe(fonte)) contagem.set(nome, (contagem.get(nome) ?? 0) + 1)
  }
  const cssModular = modulos
    .map((fonte) => {
      const exclusivas = new Set(classesDe(fonte).filter((nome) => contagem.get(nome) === 1))
      return cssDoModulo(documento, fonte, exclusivas)
    })
    .filter(Boolean)
    .join('\n')
  await writeFile(
    resolve(dir, `${nome}.html`),
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conferência · ${nome}</title><link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&amp;family=Montserrat:wght@400;500;600;700&amp;display=swap" rel="stylesheet"><style>:root{--fonte-bebas:'Bebas Neue';--fonte-montserrat:'Montserrat'}${tokens}\n${global}\n${cssModular}</style></head><body>${documento}</body></html>`,
  )
}
