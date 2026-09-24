/**
 * Formatação para a tela. Todo formatador de hora recebe o fuso EXPLICITAMENTE:
 * são componentes de servidor, e sem `timeZone` a hora sai no fuso do servidor
 * (UTC na Vercel). O fuso vem do ruleset (`rodada.fuso`).
 */

/** 1,72 · 24,3 — sempre com vírgula, casas fixas. */
export function decimal(valor: number, casas = 1): string {
  return valor.toFixed(casas).replace('.', ',')
}

/** 20,5 · 18 — linha de aposta: casa decimal só quando existe. */
export function linha(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : decimal(valor, 1)
}

/** +3,8 · −1,2 — diferença com sinal tipográfico. */
export function delta(valor: number): string {
  const s = decimal(Math.abs(valor), 1)
  if (valor > 0) return `+${s}`
  if (valor < 0) return `−${s}`
  return s
}

/** 20:30 */
export function hora(quando: Date, fuso: string): string {
  return quando.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
}

/** 20h · 20h30 — hora escrita numa frase. */
export function horaEmTexto(quando: Date, fuso: string): string {
  const [h, m] = hora(quando, fuso).split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

/** "sábado, 23 de ago." a partir do dia de referência YYYY-MM-DD (lido como UTC). */
export function diaDaRodada(dataReferencia: string): string {
  const [ano, mes, dia] = dataReferencia.split('-').map(Number)
  return new Date(Date.UTC(ano!, mes! - 1, dia!)).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

/** "23/08" a partir de YYYY-MM-DD. */
export function diaCurto(dataReferencia: string): string {
  const [, mes, dia] = dataReferencia.split('-')
  return `${dia}/${mes}`
}

/** Plural simples: "1 entrada" · "39 entradas". */
export function contar(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/** 22/09/2026 18:30 — o carimbo completo dos rodapés de atualização. */
export function dataHora(quando: Date, fuso: string): string {
  return quando.toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' })
}
