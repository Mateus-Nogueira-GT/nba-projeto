import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Monta `comparacao.html`: uma tela HTML com a referência do v2 (o site do
 * cliente) lado a lado com o print do front integrado — desktop e celular.
 * A comparação é humana: o dado por trás de cada print é outro (nossa base
 * local × a base do cliente), então diferença de layout que o dado explique
 * não é bug; o que sobra volta para a tarefa da área.
 *
 * Por padrão os `<img>` apontam por caminho RELATIVO para os `.jpg` ao lado
 * do HTML — mais leve e mais rápido de abrir que embutir tudo. Só funciona
 * abrindo o arquivo localmente (não serve pra copiar pra outro lugar sem os
 * `.jpg` junto). Se precisar de um único arquivo portátil (ex.: anexar num
 * e-mail), `E2E_EMBUTIR=true` (lido pelo spec, repassado como `embutir`)
 * troca os links por `data:` URI em base64 — mais pesado, mas autocontido.
 */

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

interface IndiceIntegrado {
  base: string
  geradoEm: string
  rotas: RegistroRota[]
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await fs.access(caminho)
    return true
  } catch {
    return false
  }
}

async function paraDataUri(caminho: string): Promise<string | null> {
  try {
    const bruto = await fs.readFile(caminho)
    return `data:image/jpeg;base64,${bruto.toString('base64')}`
  } catch {
    return null
  }
}

/** Caminho relativo de `caminhoAbsoluto`, a partir de onde o `comparacao.html` fica (`baseDir`) — funciona mesmo quando a imagem de referência mora fora da árvore de `saida` (ex.: `referencias/`, ou um `E2E_SAIDA` fora do repo), porque `path.relative` sobe quantos `..` precisar. */
function paraLink(baseDir: string, caminhoAbsoluto: string): string {
  const relativo = path.relative(baseDir, caminhoAbsoluto)
  // HTML quer barra normal mesmo no Windows.
  return relativo.split(path.sep).join('/')
}

/** Resolve o `src` de uma imagem — link relativo (padrão) ou `data:` URI (opt-in via `embutir`) — só se o arquivo existir; senão `null` vira o bloco "sem print". */
async function resolverImagem(caminhoAbsoluto: string, baseDir: string, embutir: boolean): Promise<string | null> {
  if (embutir) return paraDataUri(caminhoAbsoluto)
  return (await existe(caminhoAbsoluto)) ? paraLink(baseDir, caminhoAbsoluto) : null
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function celulaImagem(rotulo: string, src: string | null): string {
  if (src === null) {
    return `<figure><figcaption>${escapar(rotulo)}</figcaption><p class="falta">sem print</p></figure>`
  }
  return `<figure><figcaption>${escapar(rotulo)}</figcaption><img src="${escapar(src)}" alt="${escapar(rotulo)}" loading="lazy"></figure>`
}

/** Gera `comparacao.html` dentro de `saida` a partir de `saida/indice.json` (produzido pelo spec) e dos prints de referência em `referenciaDir`. Retorna o caminho do arquivo escrito. */
export async function gerarComparacao(opcoes: {
  saida: string
  referenciaDir: string
  /** `true` embute cada print como `data:` URI (autocontido, pesado); padrão `false` usa link relativo (leve, mas exige os `.jpg` do lado do HTML). */
  embutir?: boolean
}): Promise<string> {
  const { saida, referenciaDir, embutir = false } = opcoes
  const indice: IndiceIntegrado = JSON.parse(await fs.readFile(path.join(saida, 'indice.json'), 'utf-8'))

  const secoes: string[] = []
  for (const rota of indice.rotas) {
    const [refDesktop, refCelular, intDesktop, intCelular] = await Promise.all([
      resolverImagem(path.join(referenciaDir, 'desktop', `${rota.nome}.jpg`), saida, embutir),
      resolverImagem(path.join(referenciaDir, 'celular', `${rota.nome}.jpg`), saida, embutir),
      resolverImagem(path.join(saida, 'desktop', `${rota.nome}.jpg`), saida, embutir),
      resolverImagem(path.join(saida, 'celular', `${rota.nome}.jpg`), saida, embutir),
    ])

    const partesStatus = [
      rota.desktop && `desktop ${rota.desktop.status ?? 'erro'} → ${rota.desktop.urlFinal}${rota.desktop.erro ? ` (${rota.desktop.erro})` : ''}`,
      rota.celular && `celular ${rota.celular.status ?? 'erro'} → ${rota.celular.urlFinal}${rota.celular.erro ? ` (${rota.celular.erro})` : ''}`,
      rota.observacao,
    ].filter((v): v is string => Boolean(v))

    secoes.push(`
      <section class="rota">
        <h2>${escapar(rota.caminho ?? rota.nome)}</h2>
        <p class="status">${escapar(partesStatus.join(' · '))}</p>
        <div class="grade">
          ${celulaImagem('Referência · desktop', refDesktop)}
          ${celulaImagem('Integrado · desktop', intDesktop)}
          ${celulaImagem('Referência · celular', refCelular)}
          ${celulaImagem('Integrado · celular', intCelular)}
        </div>
      </section>`)
  }

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Comparação visual — front v2 (referência × integrado)</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; background: #111318; color: #e8e8ec; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .apoio { font-size: 13px; color: #9a9aa4; margin: 0 0 24px; max-width: 72ch; }
  .rota { border-top: 1px solid #2a2c34; padding: 20px 0; }
  .rota h2 { font-family: ui-monospace, monospace; font-size: 14px; margin: 0 0 4px; color: #f0f0f4; }
  .status { font-size: 11px; color: #8a8a94; margin: 0 0 12px; word-break: break-all; }
  .grade { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  figure { margin: 0; }
  figcaption { font-size: 11px; color: #9a9aa4; margin-bottom: 4px; }
  img { max-width: 100%; border: 1px solid #2a2c34; display: block; border-radius: 4px; }
  .falta { font-size: 12px; color: #666; border: 1px dashed #2a2c34; border-radius: 4px; padding: 12px 8px; text-align: center; margin: 0; }
  @media (max-width: 900px) { .grade { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
</head>
<body>
<h1>Comparação visual — front v2 (referência × integrado)</h1>
<p class="apoio">
  Gerado em ${escapar(indice.geradoEm)} · base integrada testada: ${escapar(indice.base)}.
  A comparação é humana, porque o dado por trás de cada tela é outro (base local × base do cliente).
  Diferença de layout que o dado não explique volta para a tarefa da área.
  ${embutir ? 'Prints embutidos (E2E_EMBUTIR=true) — arquivo autocontido.' : 'Prints por link relativo — abra este arquivo de onde ele está, ao lado das pastas desktop/ e celular/.'}
</p>
${secoes.join('\n')}
</body>
</html>`

  const destino = path.join(saida, 'comparacao.html')
  await fs.writeFile(destino, html, 'utf-8')
  return destino
}
