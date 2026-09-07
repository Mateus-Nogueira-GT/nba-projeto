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
 * "5/9" — dia e mês SEM zero à esquerda, a forma curta da identidade 04.
 *
 * Distinta de `diaCurto` ("05/09") de propósito: onde a data é apoio de uma
 * linha densa (o apito, a linha da tabela jogo a jogo), o zero à esquerda só
 * ocupa espaço. Uma tela usa UMA forma — foi ver "8/1" e "08/01" a quinze
 * linhas de distância, sobre os mesmos jogos, que criou esta função.
 */
export function diaMes(quando: Date, fuso: string): string {
  const [dia, mes] = quando
    .toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
    .split('/')
  return `${Number(dia)}/${Number(mes)}`
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
