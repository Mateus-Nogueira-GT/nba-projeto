/**
 * O DIA DA RODADA — a fronteira entre "agora" e "que dia é hoje".
 *
 * Toda a plataforma indexa por `dataReferencia` (YYYY-MM-DD): a Lista Secreta
 * do dia, o feed, os jogos, a conferência de resultados. Quem decide onde o dia
 * começa é o FUSO, e o fuso vem do ruleset — resposta do cliente em 24/08/2026.
 *
 * Antes disto o cálculo era `new Date().toISOString().slice(0, 10)`, ou seja
 * UTC. Num servidor da Vercel isso significa que o dia virava às 21h de
 * Brasília: quem abrisse o app às 21h30 veria a lista de amanhã, vazia.
 *
 * Funções puras — a data e o fuso entram como argumento, nunca `Date.now()`.
 */

/** Partes da data local naquele fuso, já em número. */
function partes(instante: Date, fuso: string): Record<string, number> {
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return Object.fromEntries(
    formato
      .formatToParts(instante)
      .filter((p) => p.type !== 'literal')
      // hour12:false ainda devolve "24" para meia-noite em alguns ambientes.
      .map((p) => [p.type, Number(p.value) % (p.type === 'hour' ? 24 : Infinity)]),
  )
}

/**
 * Quanto o fuso está deslocado do UTC NAQUELE instante, em milissegundos.
 *
 * Precisa ser por instante, não por fuso: horário de verão muda o
 * deslocamento no meio do ano. O Brasil não usa mais, mas `America/New_York`
 * usa — e a alternativa está a uma linha de YAML de distância.
 */
function deslocamentoMs(instante: Date, fuso: string): number {
  const p = partes(instante, fuso)
  const comoSeFosseUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
  // Segundos são o menor grão que qualquer fuso real usa; o resto do instante
  // (milissegundos) não participa do deslocamento.
  return comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000
}

/** A data (YYYY-MM-DD) que aquele instante tem no fuso dado. */
export function dataDeReferencia(agora: Date, fuso: string): string {
  const p = partes(agora, fuso)
  // Quatro dígitos SEMPRE: `Intl` devolve "1" para o ano 1, e uma data "1-01-01"
  // chegava a `Date.parse` como NaN três funções depois (diagnóstico de 13/09).
  const ano = String(p.year).padStart(4, '0')
  const mes = String(p.month).padStart(2, '0')
  const dia = String(p.day).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** A data de N dias antes (ou depois, com N negativo), no mesmo fuso. */
export function somarDias(dataReferencia: string, dias: number): string {
  const base = new Date(`${dataReferencia}T12:00:00.000Z`)
  // Meio-dia como âncora: somar 24h a partir da meia-noite atravessaria a
  // borda errada em qualquer fuso com horário de verão.
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

/**
 * Os instantes UTC que delimitam aquele dia local.
 *
 * `[inicio, fim)` — o fim é a meia-noite do dia seguinte, exclusiva. É esse
 * intervalo que a consulta de jogos usa: um jogo pertence à rodada quando
 * começa dentro dele.
 */
export function intervaloDoDia(
  dataReferencia: string,
  fuso: string,
): { inicio: Date; fim: Date } {
  return { inicio: meiaNoite(dataReferencia, fuso), fim: meiaNoite(somarDias(dataReferencia, 1), fuso) }
}

function meiaNoite(dataReferencia: string, fuso: string): Date {
  const comoUtc = new Date(`${dataReferencia}T00:00:00.000Z`).getTime()

  // Duas passadas: a primeira usa o deslocamento do instante errado (o UTC),
  // a segunda corrige usando o deslocamento do instante já quase certo. Sem a
  // segunda, a meia-noite do dia em que o horário de verão entra sai 1h fora.
  const primeira = comoUtc - deslocamentoMs(new Date(comoUtc), fuso)
  return new Date(comoUtc - deslocamentoMs(new Date(primeira), fuso))
}
