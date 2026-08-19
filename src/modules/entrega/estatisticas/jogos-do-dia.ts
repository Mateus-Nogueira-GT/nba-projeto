import { and, asc, gte, lt } from 'drizzle-orm'

import { jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { daColuna } from './atualizacao'
import type { ComAtualizacao } from './atualizacao'

export type JogoDoDia = {
  id: string
  dataHoraUtc: Date
  status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'
  quartoAtual: number | null
  tempoRestante: string | null
  casa: { id: string; sigla: string; nome: string; logoUrl: string | null; placar: number | null }
  visitante: {
    id: string
    sigla: string
    nome: string
    logoUrl: string | null
    placar: number | null
  }
}

export type TelaJogosDoDia = ComAtualizacao & {
  dataReferencia: string
  jogos: JogoDoDia[]
}

/**
 * JOGOS DO DIA — a porta de entrada da aba.
 *
 * O dia é recortado em UTC, igual ao resto do sistema (`montarFatos` usa o
 * mesmo corte). Rodada da NBA cruza a meia-noite de Brasília com frequência;
 * mudar o fuso aqui e não lá faria a aba e a Lista Secreta discordarem sobre
 * quais jogos são "de hoje".
 */
export async function telaJogosDoDia(
  db: Db,
  dataReferencia: string,
): Promise<TelaJogosDoDia> {
  const inicio = new Date(`${dataReferencia}T00:00:00.000Z`)
  const fim = new Date(`${dataReferencia}T23:59:59.999Z`)

  const [partidas, listaTimes] = await Promise.all([
    db
      .select()
      .from(jogos)
      .where(and(gte(jogos.dataHoraUtc, inicio), lt(jogos.dataHoraUtc, fim)))
      .orderBy(asc(jogos.dataHoraUtc)),
    db.select().from(times),
  ])

  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  const vazio = { id: '', sigla: '—', nome: '—', logoUrl: null }

  return {
    dataReferencia,
    jogos: partidas.map((j) => {
      const casa = timePorId.get(j.timeCasaId) ?? vazio
      const visitante = timePorId.get(j.timeVisitanteId) ?? vazio
      return {
        id: j.id,
        dataHoraUtc: j.dataHoraUtc,
        status: j.status,
        quartoAtual: j.quartoAtual,
        tempoRestante: j.tempoRestante,
        casa: {
          id: casa.id,
          sigla: casa.sigla,
          nome: casa.nome,
          logoUrl: casa.logoUrl,
          placar: j.placarCasa,
        },
        visitante: {
          id: visitante.id,
          sigla: visitante.sigla,
          nome: visitante.nome,
          logoUrl: visitante.logoUrl,
          placar: j.placarVisitante,
        },
      }
    }),
    // Sem jogos, o horário não pode ser "agora": não há dado nenhum para
    // datar. A tela mostra o estado vazio, não uma marca falsa de frescor.
    atualizacao: daColuna(partidas, 'jogos do dia') ?? { em: new Date(0), fonte: 'sem jogos' },
  }
}
