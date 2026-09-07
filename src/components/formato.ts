/**
 * FORMATAÇÃO DE DATA E HORA PARA A TELA.
 *
 * Todo formatador recebe o fuso EXPLICITAMENTE. Isto não é preciosismo: estas
 * telas são componentes de servidor, e `toLocaleString('pt-BR')` sem `timeZone`
 * usa o fuso do SERVIDOR — que na Vercel é UTC. O horário de todo jogo saía
 * três horas adiantado para o assinante, e nenhum teste pegava porque a
 * máquina de desenvolvimento roda em horário de Brasília.
 *
 * O fuso vem do ruleset (`rodada.fuso`), resposta do cliente em 24/08/2026.
 */

/** 20:30 */
export function horaCurta(quando: Date, fuso: string): string {
  return quando.toLocaleTimeString('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 18h30 — a hora como se ESCREVE numa frase ("publicada às 18h30", "próxima
 * lista às 20h30", spec 04 §4.1). Hora redonda perde os minutos: "20h", não
 * "20h00". O formato de relógio (`horaCurta`) fica onde a hora é dado —
 * o cabeçalho do jogo.
 */
export function horaEmTexto(quando: Date, fuso: string): string {
  const [hora, minuto] = horaCurta(quando, fuso).split(':')
  return minuto === '00' ? `${hora}h` : `${hora}h${minuto}`
}

/** 24/08/2026 20:30 */
export function dataHora(quando: Date, fuso: string): string {
  return quando.toLocaleString('pt-BR', {
    timeZone: fuso,
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** 24/08 */
export function diaCurto(quando: Date, fuso: string): string {
  return quando.toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
}

/** 24/08/2026 */
export function diaCompleto(quando: Date, fuso: string): string {
  return quando.toLocaleDateString('pt-BR', { timeZone: fuso })
}

/**
 * "segunda-feira, 24 de ago" a partir de um dia de referência (YYYY-MM-DD).
 *
 * A data de referência não tem hora: é um rótulo de calendário, não um
 * instante. Interpretá-la em qualquer fuso local recuaria um dia no Brasil
 * inteiro, então ela é lida como UTC de propósito e formatada como UTC.
 */
export function diaLongo(dataReferencia: string): string {
  const [ano, mes, dia] = dataReferencia.split('-').map(Number)
  return new Date(Date.UTC(ano!, mes! - 1, dia!)).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  })
}
