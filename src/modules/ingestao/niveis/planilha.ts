/**
 * Leitor da planilha REVISADA por humano (`lista-cj:sugestoes` → revisor →
 * `lista-cj:confirmar`).
 *
 * O arquivo volta do Excel/Sheets em dois sotaques: `,` (o que o script
 * escreve) ou `;` (Excel em pt-BR salva assim). O separador é decidido UMA vez,
 * pelo cabeçalho — contando `,` e `;` fora de aspas —, e só ele separa campo.
 * Aceitar os dois ao mesmo tempo partia "ok, conferido" em duas colunas num
 * arquivo com `;` e deslocava o `confirmar` para a coluna errada.
 *
 * Linha com número de colunas diferente do cabeçalho não é adivinhada: vira
 * problema, com o número da linha, para o revisor corrigir.
 */

export type Separador = ',' | ';'

export type LinhaDaPlanilha = {
  /** Linha física onde o registro começa (1 = cabeçalho). */
  linhaNoArquivo: number
  campos: Record<string, string>
}

export type ProblemaDaPlanilha = { linhaNoArquivo: number; motivo: string }

export type ResultadoPlanilha = {
  separador: Separador
  linhas: LinhaDaPlanilha[]
  problemas: ProblemaDaPlanilha[]
}

/** Conta `,` e `;` fora de aspas na primeira linha lógica. Empate fica com `,`. */
export function detectarSeparador(texto: string): Separador {
  let virgulas = 0
  let pontoEVirgulas = 0
  let aspas = false
  for (const c of texto) {
    if (c === '"') aspas = !aspas
    else if (!aspas && (c === '\n' || c === '\r')) break
    else if (!aspas && c === ',') virgulas += 1
    else if (!aspas && c === ';') pontoEVirgulas += 1
  }
  return pontoEVirgulas > virgulas ? ';' : ','
}

type Registro = { linhaNoArquivo: number; valores: string[] }

function registros(texto: string, separador: Separador): Registro[] {
  const saida: Registro[] = []
  let campo = ''
  let valores: string[] = []
  let aspas = false
  let linhaAtual = 1
  let inicio = 1
  const fechar = () => {
    valores.push(campo)
    saida.push({ linhaNoArquivo: inicio, valores })
    valores = []
    campo = ''
  }

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else {
        if (c === '\n') linhaAtual += 1
        campo += c
      }
    } else if (c === '"') aspas = true
    else if (c === separador) {
      valores.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fechar()
      linhaAtual += 1
      inicio = linhaAtual
    } else campo += c
  }
  if (campo !== '' || valores.length > 0) fechar()
  return saida
}

export function lerPlanilha(conteudo: string): ResultadoPlanilha {
  const texto = conteudo.replace(/^﻿/, '')
  const separador = detectarSeparador(texto)
  const todos = registros(texto, separador).filter((r) => r.valores.some((v) => v.trim() !== ''))
  const [cabecalho, ...corpo] = todos
  if (!cabecalho) return { separador, linhas: [], problemas: [] }

  const nomes = cabecalho.valores.map((n) => n.trim())
  const linhas: LinhaDaPlanilha[] = []
  const problemas: ProblemaDaPlanilha[] = []
  for (const r of corpo) {
    if (r.valores.length !== nomes.length) {
      problemas.push({
        linhaNoArquivo: r.linhaNoArquivo,
        motivo: `tem ${r.valores.length} colunas, o cabeçalho tem ${nomes.length}`,
      })
      continue
    }
    linhas.push({
      linhaNoArquivo: r.linhaNoArquivo,
      campos: Object.fromEntries(nomes.map((nome, k) => [nome, r.valores[k]!.trim()])),
    })
  }
  return { separador, linhas, problemas }
}
