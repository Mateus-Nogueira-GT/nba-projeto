import type { EstadoDoApito } from '@/modules/entrega/estatisticas/jogador'
import type { TelaClassificacao } from '@/modules/entrega/estatisticas/time'

/**
 * A fronteira que mais importa nesta aba: dado que a liga registrou, nunca a
 * estratégia do CJ. Vai escrita no topo de toda tela de estatísticas.
 */
export const SOBRANCELHA_STATS = 'Dado canônico · sem estratégia'

/** Quantos apitos o perfil do jogador mostra — o mesmo número conta o "X de Y bateu". */
export const LIMITE_DE_APITOS_DO_JOGADOR = 20

/**
 * O auxiliar da seção "Apitos da estratégia" — "1 de 3 bateu". Diz o recorte
 * quando a lista foi cortada, e nunca anuncia "aguardando dado oficial" por
 * cima de linhas que já dizem "não jogou".
 */
export function resumoDosApitos(
  apitos: readonly { estado: EstadoDoApito; bateu: boolean | null }[],
  truncado: boolean,
): string | undefined {
  if (apitos.length === 0) return undefined
  const recorte = truncado ? ` · últimos ${LIMITE_DE_APITOS_DO_JOGADOR}` : ''
  const conferidos = apitos.filter((a) => a.estado === 'CONFERIDO')
  if (conferidos.length > 0) {
    const bateram = conferidos.filter((a) => a.bateu === true).length
    return `${bateram} de ${conferidos.length} bateu${recorte}`
  }
  if (apitos.some((a) => a.estado === 'AGUARDANDO_OFICIAL')) return `aguardando dado oficial${recorte}`
  return `sem apito conferido${recorte}`
}

/**
 * O trilho da pós-temporada: 1 a 6 playoff, 7 a 10 play-in, por conferência.
 * Estrutura da LIGA, não estratégia — por isso não vive no ruleset.
 */
export const TRILHO = { playoff: 6, playIn: 10 } as const

export function trilhoDa(posicao: number | null): 'playoff' | 'play-in' | null {
  if (posicao === null) return null
  if (posicao <= TRILHO.playoff) return 'playoff'
  if (posicao <= TRILHO.playIn) return 'play-in'
  return null
}

type LinhaDaClassificacao = TelaClassificacao['linhas'][number]

/** Jogos atrás do líder — ((Vl − V) + (D − Dl)) / 2. O líder recebe "—", não zero. */
export function jogosAtras(lider: LinhaDaClassificacao | undefined, linha: LinhaDaClassificacao): string {
  if (lider === undefined || lider.timeId === linha.timeId) return '—'
  const atraso = (lider.vitorias - linha.vitorias + (linha.derrotas - lider.derrotas)) / 2
  return atraso === 0 ? '—' : atraso.toFixed(1).replace('.0', '').replace('.', ',')
}

/** Ausência é "—", nunca zero. */
export function num(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(casas).replace('.', ',')
}

export function pct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`
}

/** ".633" → "63,3%" — o aproveitamento vem entre 0 e 1. */
export function aproveitamento(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`
}

/** "5/9" — dia e mês sem zero à esquerda, no fuso do ruleset. */
export function diaMes(quando: Date, fuso: string): string {
  const [dia, mes] = quando
    .toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
    .split('/')
  return `${Number(dia)}/${Number(mes)}`
}

/** "24/08/2026, 20:00" */
export function dataHora(quando: Date, fuso: string): string {
  return quando.toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' })
}

/** "sáb" / "23/08" a partir de YYYY-MM-DD, lido como UTC (rótulo de calendário, não instante). */
export function diaDaSemana(data: string): { semana: string; dia: string } {
  const [ano, mes, dia] = data.split('-').map(Number)
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!))
  const semana = d.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '')
  return { semana, dia: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}` }
}

/** "vs SAS" / "@ SAS" do ponto de vista do jogador. Sem mando, "—". */
export function confronto(l: { emCasa: boolean | null; adversarioSigla: string | null }): string {
  if (l.emCasa === null || l.adversarioSigla === null) return '—'
  return `${l.emCasa ? 'vs' : '@'} ${l.adversarioSigla}`
}
