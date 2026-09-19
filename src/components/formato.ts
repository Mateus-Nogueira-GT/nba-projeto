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

/**
 * "Quarta-feira, 14/1" — o rótulo da RODADA, para o título da tela.
 *
 * Mesma leitura de `diaLongo`: a data de referência é um rótulo de calendário,
 * lido e formatado em UTC, porque interpretá-la no fuso local recuaria um dia
 * no Brasil inteiro. O dia e o mês saem sem zero à esquerda — é um título em
 * um título na fonte de display, não uma coluna de tabela.
 */
export function diaDaRodada(dataReferencia: string): string {
  const [ano, mes, dia] = dataReferencia.split('-').map(Number)
  const semana = new Date(Date.UTC(ano!, mes! - 1, dia!)).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
  })
  // Sem o "-feira": ele só rouba espaço num título, e é o que a Lista Secreta
  // já fazia na cópia local desta função.
  const nome = semana.replace('-feira', '')
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${dia}/${mes}`
}

/**
 * "há 12 s" · "há 3 min" · "há 2 h" — o carimbo do AO VIVO, com precisão de
 * SEGUNDOS.
 *
 * Distinto do `há N min` de `UltimaAtualizacao` (aba de estatísticas) porque a
 * pergunta é outra: o Fire Live se recarrega a cada 30 s, e "agora mesmo" para
 * qualquer coisa abaixo de um minuto apagaria justamente a defasagem que a
 * tela promete nunca esconder (spec 04, §4.2).
 *
 * `agora` entra por parâmetro: chamar o relógio aqui dentro tornaria a função
 * dependente do segundo em que roda.
 */
export function decorridoCurto(de: Date, agora: Date): string {
  const segundos = Math.max(0, Math.round((agora.getTime() - de.getTime()) / 1000))
  if (segundos < 60) return `há ${segundos} s`

  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `há ${minutos} min`

  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas} h`

  return `há ${Math.round(horas / 24)} d`
}

/**
 * "88,9" — o aproveitamento de um time, com UMA casa e vírgula.
 *
 * Único lugar que escreve aproveitamento (correções de lógica 19/09): a
 * lateral arredondava para inteiro e a tabela cheia de Estatísticas escrevia
 * uma casa — o mesmo time, dois números, a 300 px de distância. A casa fica
 * porque distingue 66,7 de 66,3 na briga por play-in; a unidade NÃO fica,
 * porque mora no cabeçalho da coluna, não repetida 30 vezes.
 *
 * `null` é travessão: temporada sem jogo não é zero por cento.
 */
export function formatarAproveitamento(v: number | null): string {
  return v === null ? '—' : (v * 100).toFixed(1).replace('.', ',')
}
