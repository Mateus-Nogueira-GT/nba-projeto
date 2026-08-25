import type { Diferenca, ResultadoBacktest } from './executar'

/**
 * CSV do comparativo — o CJ vai olhar na planilha dele.
 *
 * Separador `;`: é o que o Excel em português abre sem assistente. O rodapé
 * P12 viaja DENTRO do arquivo: o número desacompanhado da ressalva viraria
 * "probabilidade" na primeira cópia para outra aba.
 */
const SEPARADOR = ';'

function campo(valor: string | number): string {
  const texto = String(valor)
  if (texto.includes(SEPARADOR) || texto.includes('"') || texto.includes('\n')) {
    return `"${texto.replaceAll('"', '""')}"`
  }
  return texto
}

function linha(...valores: (string | number)[]): string {
  return valores.map(campo).join(SEPARADOR)
}

export function gerarCsv(a: ResultadoBacktest, b: ResultadoBacktest, d: Diferenca): string {
  const linhas = [
    linha('metrica', 'ruleset_a', 'ruleset_b', 'delta'),
    linha('ruleset', a.ruleset, b.ruleset, ''),
    linha('periodo', `${a.periodo.de} a ${a.periodo.ate}`, `${b.periodo.de} a ${b.periodo.ate}`, ''),
    linha('apitos', a.apitos, b.apitos, d.apitosDelta),
    linha('acertos', a.acertos, b.acertos, d.acertosDelta),
    linha('amostra classificavel', a.classificaveis, b.classificaveis, ''),
    linha('indeterminados', a.indeterminados, b.indeterminados, ''),
  ]
  for (const nivel of ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA'] as const) {
    linhas.push(linha(`apitos ${nivel}`, a.porNivel[nivel], b.porNivel[nivel], ''))
  }
  for (const metodo of ['OSCILACAO', 'OPD'] as const) {
    linhas.push(linha(`apitos ${metodo}`, a.porMetodo[metodo], b.porMetodo[metodo], ''))
  }
  linhas.push(linha('jogadores que entraram', '', d.entraram.join(' | '), d.entraram.length))
  linhas.push(linha('jogadores que sairam', d.sairam.join(' | '), '', d.sairam.length))
  linhas.push('')
  linhas.push(
    campo(
      'Medição do comportamento de regra sobre dado histórico — não é sugestão de aposta nem promessa de retorno.',
    ),
  )
  return linhas.join('\n')
}
