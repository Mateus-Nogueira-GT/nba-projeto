import { sql, type SQL } from 'drizzle-orm'

import { estatisticasJogo } from './db/schema'

// Todo evento individual registrado prova presença, mesmo quando o provedor
// arredonda os minutos para zero ou ainda não os informou. PTS/REB/AST são
// apenas parte do box: uma tentativa, roubo ou bloqueio também impede DNP.
const contagensDeParticipacao = {
  pontos: estatisticasJogo.pontos,
  rebotes: estatisticasJogo.rebotesTotal,
  rebotesOf: estatisticasJogo.rebotesOf,
  rebotesDef: estatisticasJogo.rebotesDef,
  assistencias: estatisticasJogo.assistencias,
  cestasC: estatisticasJogo.cestasC,
  cestasT: estatisticasJogo.cestasT,
  doisC: estatisticasJogo.doisC,
  doisT: estatisticasJogo.doisT,
  tresC: estatisticasJogo.tresC,
  tresT: estatisticasJogo.tresT,
  lanceC: estatisticasJogo.lanceC,
  lanceT: estatisticasJogo.lanceT,
  roubos: estatisticasJogo.roubos,
  bloqueios: estatisticasJogo.bloqueios,
  turnovers: estatisticasJogo.turnovers,
  faltas: estatisticasJogo.faltas,
}

export const colunasDeParticipacao = {
  minutos: estatisticasJogo.minutos,
  ...contagensDeParticipacao,
  saldoQuadra: estatisticasJogo.saldoQuadra,
}

type LinhaDeParticipacao = {
  minutos: string | null
  saldoQuadra: number | null
} & Record<keyof typeof contagensDeParticipacao, number | null>

const eventos = Object.keys(contagensDeParticipacao) as (keyof typeof contagensDeParticipacao)[]

/** Participação factual; a média tem seu próprio corte de minutos (spec 01). */
export function entrouEmQuadra(linha: LinhaDeParticipacao): boolean {
  return (
    Number(linha.minutos) > 0 ||
    eventos.some((campo) => (linha[campo] ?? 0) > 0) ||
    (linha.saldoQuadra ?? 0) !== 0
  )
}

/** Mesmo predicado para agregações; o alias é escapado como identificador SQL. */
export function entrouEmQuadraSql(alias: string): SQL {
  const coluna = (campo: (typeof colunasDeParticipacao)[keyof typeof colunasDeParticipacao]) =>
    sql`${sql.identifier(alias)}.${sql.identifier(campo.name)}`
  const positivos = [estatisticasJogo.minutos, ...Object.values(contagensDeParticipacao)]
  const condicoes = positivos.map((campo) => sql`coalesce(${coluna(campo)}, 0) > 0`)
  // O saldo pode ser negativo; ambos os sinais provam passagem pela quadra.
  condicoes.push(sql`coalesce(${coluna(estatisticasJogo.saldoQuadra)}, 0) <> 0`)
  return sql`(${sql.join(condicoes, sql` or `)})`
}
