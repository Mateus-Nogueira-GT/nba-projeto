export type TipoComissaoImportada = 'CPA' | 'REVSHARE' | 'HIBRIDO'

export type LinhaImportada = {
  idExterno: string
  indicadoMascarado: string | null
  ocorridoEm: Date
  tipo: TipoComissaoImportada
  moeda: string
  cpaCentavos: number | null
  revshareCentavos: number | null
  totalCentavos: number | null
  baseConfirmadaCentavos: number
  codigoLink: string | null
}

export type PreviaImportacao = { linhas: LinhaImportada[]; erros: string[] }

const COLUNAS = [
  'id_externo',
  'indicado',
  'data_evento',
  'tipo',
  'moeda',
  'cpa_centavos',
  'revshare_centavos',
  'total_centavos',
  'codigo_link',
] as const

function separarCsv(linha: string): string[] {
  const campos: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i]!
    if (caractere === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"'
        i += 1
      } else {
        aspas = !aspas
      }
    } else if (caractere === ';' && !aspas) {
      campos.push(atual.trim())
      atual = ''
    } else {
      atual += caractere
    }
  }
  if (aspas) throw new Error('aspas não fechadas')
  campos.push(atual.trim())
  return campos
}

function centavos(valor: string, campo: string): number | null {
  if (valor === '') return null
  if (!/^\d+$/.test(valor)) throw new Error(`${campo} deve usar centavos inteiros`)
  const numero = Number(valor)
  if (!Number.isSafeInteger(numero)) throw new Error(`${campo} fora do limite`)
  return numero
}

function dataIso(valor: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(valor)) {
    throw new Error('data_evento deve estar em ISO UTC')
  }
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) throw new Error('data_evento inválida')
  return data
}

export function prepararImportacaoCsv(conteudo: string): PreviaImportacao {
  if (Buffer.byteLength(conteudo, 'utf8') > 1_000_000) {
    return { linhas: [], erros: ['arquivo ultrapassa 1 MB'] }
  }

  const linhasTexto = conteudo
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean)
  if (linhasTexto.length < 2) return { linhas: [], erros: ['arquivo sem dados'] }
  if (linhasTexto.length > 10_001)
    return { linhas: [], erros: ['arquivo ultrapassa 10.000 linhas'] }

  let cabecalho: string[]
  try {
    cabecalho = separarCsv(linhasTexto[0]!)
  } catch (erro) {
    return { linhas: [], erros: [erro instanceof Error ? erro.message : 'cabeçalho inválido'] }
  }
  if (cabecalho.join('|') !== COLUNAS.join('|')) {
    return { linhas: [], erros: [`cabeçalho esperado: ${COLUNAS.join(';')}`] }
  }

  const linhas: LinhaImportada[] = []
  const erros: string[] = []
  const ids = new Set<string>()
  for (let indice = 1; indice < linhasTexto.length; indice += 1) {
    try {
      const campos = separarCsv(linhasTexto[indice]!)
      if (campos.length !== COLUNAS.length) throw new Error('quantidade de colunas inválida')
      const [idExterno, indicado, dataEvento, tipoBruto, moeda, cpa, revshare, total, codigo] =
        campos as [string, string, string, string, string, string, string, string, string]
      if (!idExterno || idExterno.length > 160) throw new Error('id_externo inválido')
      if (ids.has(idExterno)) throw new Error('id_externo duplicado no arquivo')
      ids.add(idExterno)
      if (!['CPA', 'REVSHARE', 'HIBRIDO'].includes(tipoBruto)) throw new Error('tipo inválido')
      if (!/^[A-Z]{3}$/.test(moeda)) throw new Error('moeda inválida')
      const cpaCentavos = centavos(cpa, 'cpa_centavos')
      const revshareCentavos = centavos(revshare, 'revshare_centavos')
      const totalCentavos = centavos(total, 'total_centavos')
      if (cpaCentavos === null && revshareCentavos === null && totalCentavos === null) {
        throw new Error('informe ao menos um valor de comissão')
      }
      const baseConfirmadaCentavos = totalCentavos ?? (cpaCentavos ?? 0) + (revshareCentavos ?? 0)
      linhas.push({
        idExterno,
        indicadoMascarado: indicado || null,
        ocorridoEm: dataIso(dataEvento),
        tipo: tipoBruto as TipoComissaoImportada,
        moeda,
        cpaCentavos,
        revshareCentavos,
        totalCentavos,
        baseConfirmadaCentavos,
        codigoLink: codigo || null,
      })
    } catch (erro) {
      erros.push(`linha ${indice + 1}: ${erro instanceof Error ? erro.message : 'inválida'}`)
    }
  }

  return { linhas, erros }
}
