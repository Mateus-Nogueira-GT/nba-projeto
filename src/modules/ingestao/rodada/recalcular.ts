import { asc, eq, sql } from 'drizzle-orm'

import { jogos } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { dataDeReferencia } from '../../dominio/rodada'

/**
 * RECALCULAR A RODADA DOS JOGOS JÁ GRAVADOS — `npm run jogos:recalcular-rodada`.
 *
 * `jogos.data_referencia` é a rodada do jogo: a data do tipoff no fuso do DIA
 * (`rodada.fuso`). Em 07/10/2026 o parceiro decidiu que "o jogo deve contar no
 * dia em que foi marcado nos EUA" e o fuso do dia passou de Brasília a Nova
 * York. O que já está no banco foi gravado com a regra antiga (ou com a data
 * que o provedor mandou); este módulo refaz a conta a partir de
 * `data_hora_utc`, a única verdade de instante que a linha tem.
 *
 * Reexecutável: com o banco já no fuso novo, não há o que mudar e nada é
 * escrito. Sem `confirmar`, só relata.
 *
 * A CHAVE ÚNICA `jogos_chave_referencia (data_referencia, casa, visitante)`
 * continua valendo. Antes de gravar, o conjunto FINAL inteiro é conferido;
 * havendo duas linhas na mesma chave, nada é escrito e a lista volta para o
 * operador decidir — um jogo duplicado é dado a curar, não a sobrescrever.
 */

export type MudancaDeRodada = {
  jogoId: string
  dataHoraUtc: Date
  de: string
  para: string
}

export type ColisaoDeRodada = {
  dataReferencia: string
  timeCasaId: string
  timeVisitanteId: string
  jogoIds: string[]
}

export type ResultadoRecalculo = {
  /** Jogos lidos. */
  total: number
  mudancas: MudancaDeRodada[]
  colisoes: ColisaoDeRodada[]
  /** true só quando `confirmar` e não houve colisão. */
  gravou: boolean
}

export async function recalcularRodadaDosJogos(
  db: Db,
  opcoes: { fuso: string; confirmar: boolean },
): Promise<ResultadoRecalculo> {
  return db.transaction(async (tx) => {
    // Trava a tabela contra a ingestão concorrente: o cron que grava um jogo
    // entre a conferência e o UPDATE furaria a conferência de colisão.
    if (opcoes.confirmar) await tx.execute(sql`LOCK TABLE ${jogos} IN SHARE ROW EXCLUSIVE MODE`)

    const linhas = await tx
      .select({
        id: jogos.id,
        dataHoraUtc: jogos.dataHoraUtc,
        dataReferencia: jogos.dataReferencia,
        timeCasaId: jogos.timeCasaId,
        timeVisitanteId: jogos.timeVisitanteId,
      })
      .from(jogos)
      .orderBy(asc(jogos.dataHoraUtc), asc(jogos.id))

    const mudancas: MudancaDeRodada[] = []
    const porChave = new Map<string, ColisaoDeRodada>()
    for (const l of linhas) {
      const para = dataDeReferencia(l.dataHoraUtc, opcoes.fuso)
      if (para !== l.dataReferencia) {
        mudancas.push({ jogoId: l.id, dataHoraUtc: l.dataHoraUtc, de: l.dataReferencia, para })
      }
      const chave = `${para}|${l.timeCasaId}|${l.timeVisitanteId}`
      const grupo = porChave.get(chave)
      if (grupo) grupo.jogoIds.push(l.id)
      else
        porChave.set(chave, {
          dataReferencia: para,
          timeCasaId: l.timeCasaId,
          timeVisitanteId: l.timeVisitanteId,
          jogoIds: [l.id],
        })
    }
    const colisoes = [...porChave.values()].filter((g) => g.jogoIds.length > 1)

    const resultado = { total: linhas.length, mudancas, colisoes }
    if (!opcoes.confirmar || colisoes.length > 0 || mudancas.length === 0) {
      return { ...resultado, gravou: false }
    }

    // DUAS PASSADAS. A chave única não é adiável, e o Postgres a confere linha
    // a linha: o mesmo confronto em noites seguidas (MIA×CHI, 31/01 e 01/02)
    // que trocassem de data colidiria no MEIO da troca, mesmo com o conjunto
    // final limpo. A primeira passada estaciona cada linha que muda numa data
    // própria, distante e distinta (ano 1000 + i dias) — nenhuma chave real
    // a alcança —; a segunda grava a data final.
    const estacionamento = new Date(Date.UTC(1000, 0, 1))
    for (const [i, m] of mudancas.entries()) {
      const dia = new Date(estacionamento.getTime() + i * 86_400_000).toISOString().slice(0, 10)
      await tx.update(jogos).set({ dataReferencia: dia }).where(eq(jogos.id, m.jogoId))
    }
    for (const m of mudancas) {
      await tx.update(jogos).set({ dataReferencia: m.para }).where(eq(jogos.id, m.jogoId))
    }
    return { ...resultado, gravou: true }
  })
}
