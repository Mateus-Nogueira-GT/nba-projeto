import { and, asc, eq, isNotNull, or, sql } from 'drizzle-orm'

import { classificacao, jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { intervaloDoDia } from '../../dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import type { Ruleset } from '../../motor/ruleset/schema'

type StatusJogo = 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'

/**
 * UPSERT DE JOGO DA DEMONSTRAÇÃO — pelas DUAS chaves naturais, não uma.
 *
 * `jogos` tem unique sobre (data_referencia, casa, visitante) E sobre
 * (data_jogo, casa, visitante), onde `data_jogo` é GERADA de `data_hora_utc`.
 * Um jogo às 20h em Brasília acontece no dia UTC seguinte — é exatamente por
 * isso que a rodada (`data_referencia`) existe separada do dia do calendário
 * (`data_jogo`).
 *
 * O upsert daqui mirava só a primeira. Quando a linha existente tinha outra
 * `data_referencia` mas a MESMA `data_jogo`, o ON CONFLICT não casava, o
 * insert prosseguia e estourava na segunda (23505) — e o seed inteiro morria.
 * Acontecia entre execuções de dias diferentes, que é justamente o que o cron
 * diário faz.
 *
 * Procurar antes por QUALQUER uma das duas custa uma consulta por jogo (28 num
 * seed) e devolve a idempotência que o script promete.
 */
export async function upsertJogoDemo(
  db: Db,
  opcoes: {
    timeCasaId: string
    timeVisitanteId: string
    quandoUtc: Date
    dataReferencia: string
    status?: StatusJogo
    quartoAtual?: number | null
  },
): Promise<string> {
  const situacao = {
    status: opcoes.status ?? ('AGENDADO' as const),
    quartoAtual: opcoes.quartoAtual ?? null,
  }

  const dataJogoUtc = opcoes.quandoUtc.toISOString().slice(0, 10)
  const [existente] = await db
    .select({ id: jogos.id })
    .from(jogos)
    .where(
      and(
        eq(jogos.timeCasaId, opcoes.timeCasaId),
        eq(jogos.timeVisitanteId, opcoes.timeVisitanteId),
        or(eq(jogos.dataReferencia, opcoes.dataReferencia), eq(jogos.dataJogo, dataJogoUtc)),
      ),
    )
    .limit(1)

  if (existente) {
    // A rodada e o horário do jogo NÃO são reescritos: quem manda sobre eles
    // é a linha que já existe. Só o que muda com o tempo é atualizado.
    await db.update(jogos).set(situacao).where(eq(jogos.id, existente.id))
    return existente.id
  }

  const [linha] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: opcoes.quandoUtc,
      dataReferencia: opcoes.dataReferencia,
      timeCasaId: opcoes.timeCasaId,
      timeVisitanteId: opcoes.timeVisitanteId,
      ...situacao,
    })
    .returning({ id: jogos.id })
  if (!linha) throw new Error('upsertJogoDemo: insert sem retorno')
  return linha.id
}

/**
 * Fragmento `and j.id in (...)` quando há filtro; VAZIO quando não há.
 *
 * O caminho sem filtro (`jogoIds === undefined`) tem de produzir exatamente o
 * SQL de sempre — é o que a fixture executa. Lista vazia é o outro extremo:
 * "nenhum jogo" não é "todos os jogos", então vira `and false`.
 */
function filtroDeJogos(jogoIds: readonly string[] | undefined) {
  if (jogoIds === undefined) return sql``
  if (jogoIds.length === 0) return sql`and false`
  return sql`and j.id in (${sql.join(
    jogoIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`
}

function contarLinhas(resultado: unknown): number {
  const linhas = Array.isArray(resultado)
    ? (resultado as unknown[])
    : ((resultado as { rows?: unknown[] }).rows ?? [])
  return linhas.length
}

/**
 * PLACAR DOS JOGOS ENCERRADOS — derivado, nunca digitado.
 *
 * Soma os pontos que cada elenco fez no jogo (o vínculo jogador↔time é o da
 * LISTA do CJ, versão ativa — nunca `jogadores.time_id`, que é o time real do
 * provedor). Placar baixo é esperado: a lista do CJ tem ~8 jogadores por time,
 * não os 15 do elenco inteiro.
 *
 * `jogoIds` restringe ao dia que se está produzindo; sem ele, varre tudo.
 */
export async function semearPlacares(db: Db, jogoIds?: readonly string[]): Promise<number> {
  const resultado = await db.execute(sql`
    with pontos_por_time as (
      select ej.jogo_id, n.time_id, sum(ej.pontos)::int as pontos
      from estatisticas_jogo ej
      join niveis n on n.jogador_id = ej.jogador_id and n.atributo = 'PONTOS'
      join niveis_versao nv on nv.id = n.niveis_versao_id and nv.ativa = true
      group by 1, 2
    )
    update jogos j
       set placar_casa = casa.pontos,
           placar_visitante = fora.pontos
      from pontos_por_time casa, pontos_por_time fora
     where j.status = 'ENCERRADO'
       ${filtroDeJogos(jogoIds)}
       and casa.jogo_id = j.id and casa.time_id = j.time_casa_id
       and fora.jogo_id = j.id and fora.time_id = j.time_visitante_id
    returning j.id
  `)
  return contarLinhas(resultado)
}

/**
 * BOX SCORE DO TIME — derivado do box score dos JOGADORES, nunca digitado.
 *
 * A tela do time (`estatisticas/time/[id]`) lê `estatisticas_time_jogo`, uma
 * tabela que a demo nunca escrevia: cada partida encerrada aparecia com
 * quartos, REB, AST, TO e percentuais todos em "—". Tudo funcionava; só
 * faltava o dado.
 *
 * Soma o que cada elenco (a LISTA do CJ, versão ativa — nunca
 * `jogadores.time_id`) produziu no jogo. Só jogos ENCERRADOS: partida ao vivo
 * ou agendada segue sem box score, e a tela mostra a ausência como ausência.
 *
 * A QUEBRA POR QUARTO é distribuição de apresentação, não estatística: a demo
 * não tem parciais por quarto de jogo inteiro (só do 1º, do Fire Live).
 * Os três primeiros quartos saem de proporções fixas e o QUARTO recebe o
 * RESTO — é isso que garante `q1+q2+q3+q4 == total` para qualquer número.
 * Box score que não fecha é pior que box score ausente: parece dado.
 */
export async function semearBoxScoreDoTime(
  db: Db,
  agora: Date,
  jogoIds?: readonly string[],
): Promise<number> {
  const resultado = await db.execute(sql`
    with por_time as (
      select ej.jogo_id,
             n.time_id,
             sum(ej.pontos)::int        as pontos,
             sum(ej.rebotes_total)::int as rebotes_total,
             sum(ej.rebotes_of)::int    as rebotes_of,
             sum(ej.rebotes_def)::int   as rebotes_def,
             sum(ej.assistencias)::int  as assistencias,
             sum(ej.cestas_c)::int      as cestas_c,
             sum(ej.cestas_t)::int      as cestas_t,
             sum(ej.tres_c)::int        as tres_c,
             sum(ej.tres_t)::int        as tres_t,
             sum(ej.lance_c)::int       as lance_c,
             sum(ej.lance_t)::int       as lance_t,
             sum(ej.roubos)::int        as roubos,
             sum(ej.bloqueios)::int     as bloqueios,
             sum(ej.turnovers)::int     as turnovers,
             sum(ej.faltas)::int        as faltas
        from estatisticas_jogo ej
        join jogos j on j.id = ej.jogo_id and j.status = 'ENCERRADO' ${filtroDeJogos(jogoIds)}
        join niveis n on n.jogador_id = ej.jogador_id and n.atributo = 'PONTOS'
        join niveis_versao nv on nv.id = n.niveis_versao_id and nv.ativa = true
       group by 1, 2
    ),
    com_quartos as (
      select *,
             floor(pontos * 0.26)::int as q1,
             floor(pontos * 0.24)::int as q2,
             floor(pontos * 0.25)::int as q3
        from por_time
    )
    insert into estatisticas_time_jogo (
      jogo_id, time_id, pontos, pontos_q1, pontos_q2, pontos_q3, pontos_q4,
      pontos_prorrogacao, rebotes_total, rebotes_of, rebotes_def, assistencias,
      cestas_c, cestas_t, tres_c, tres_t, lance_c, lance_t,
      roubos, bloqueios, turnovers, faltas, capturado_em, atualizado_em
    )
    select jogo_id, time_id, pontos, q1, q2, q3,
           pontos - q1 - q2 - q3,  -- o resto fecha a conta, sempre
           0, rebotes_total, rebotes_of, rebotes_def, assistencias,
           cestas_c, cestas_t, tres_c, tres_t, lance_c, lance_t,
           roubos, bloqueios, turnovers, faltas, ${agora}, ${agora}
      from com_quartos
    on conflict on constraint estatisticas_time_jogo_unica do update set
      pontos = excluded.pontos,
      pontos_q1 = excluded.pontos_q1,
      pontos_q2 = excluded.pontos_q2,
      pontos_q3 = excluded.pontos_q3,
      pontos_q4 = excluded.pontos_q4,
      rebotes_total = excluded.rebotes_total,
      rebotes_of = excluded.rebotes_of,
      rebotes_def = excluded.rebotes_def,
      assistencias = excluded.assistencias,
      cestas_c = excluded.cestas_c,
      cestas_t = excluded.cestas_t,
      tres_c = excluded.tres_c,
      tres_t = excluded.tres_t,
      lance_c = excluded.lance_c,
      lance_t = excluded.lance_t,
      roubos = excluded.roubos,
      bloqueios = excluded.bloqueios,
      turnovers = excluded.turnovers,
      faltas = excluded.faltas,
      atualizado_em = excluded.atualizado_em
    returning id
  `)
  return contarLinhas(resultado)
}

/**
 * CLASSIFICAÇÃO DA DEMONSTRAÇÃO — derivada, nunca digitada.
 *
 * Conta vitórias e derrotas a partir dos jogos ENCERRADOS que a própria demo
 * semeou (placar de casa × visitante) e ordena por aproveitamento dentro de
 * cada conferência. Reexecutável: o upsert recalcula.
 */
export async function semearClassificacao(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
): Promise<{ linhas: number; empates: number }> {
  const temporada = temporadaDe(
    intervaloDoDia(dataReferencia, ruleset.rodada.fuso).inicio,
    calendarioDoRuleset(ruleset),
  )

  // EM ORDEM CRONOLÓGICA, e isso não é capricho: a `sequencia` ("V3" = três
  // vitórias seguidas) é construída empilhando os resultados na ordem em que
  // chegam. Sem `order by`, o Postgres devolve as linhas na ordem que lhe
  // convém — e ela MUDA quando um dia é refeito, porque as linhas reescritas
  // vão para o fim da heap. O rabo da campanha passava a ser um rabo de
  // ordem de armazenamento, não de calendário. `id` desempata jogos do mesmo
  // instante, para a leitura ser estável entre execuções.
  const encerrados = await db
    .select()
    .from(jogos)
    .where(and(eq(jogos.status, 'ENCERRADO'), isNotNull(jogos.placarCasa)))
    .orderBy(asc(jogos.dataHoraUtc), asc(jogos.id))

  const campanha = new Map<string, { v: number; d: number; sequencia: string[] }>()
  const anotar = (timeId: string, venceu: boolean) => {
    const atual = campanha.get(timeId) ?? { v: 0, d: 0, sequencia: [] }
    if (venceu) atual.v += 1
    else atual.d += 1
    atual.sequencia.push(venceu ? 'V' : 'D')
    campanha.set(timeId, atual)
  }
  let empates = 0
  for (const j of encerrados) {
    if (j.placarCasa === null || j.placarVisitante === null) continue
    // EMPATE É ESTADO INVÁLIDO, não derrota. A NBA não empata; um empate aqui é
    // dado errado (a demo antiga produzia — diagnóstico de 13/09). Decidir com
    // `>` dava a vitória ao visitante e mentia na tabela; lançar derrubaria o
    // cron das 6h por um dado velho. Fica fora da conta e vai para o retorno,
    // e o `demo:conferir` reprova enquanto houver um.
    if (j.placarCasa === j.placarVisitante) {
      empates += 1
      continue
    }
    const casaVenceu = j.placarCasa > j.placarVisitante
    anotar(j.timeCasaId, casaVenceu)
    anotar(j.timeVisitanteId, !casaVenceu)
  }
  if (campanha.size === 0) return { linhas: 0, empates }

  const listaTimes = await db.select().from(times)
  const conferenciaPorTime = new Map(listaTimes.map((t) => [t.id, t.conferencia] as const))

  const ordenados = [...campanha.entries()]
    .map(([timeId, c]) => ({
      timeId,
      ...c,
      aproveitamento: c.v + c.d === 0 ? 0 : c.v / (c.v + c.d),
      conferencia: conferenciaPorTime.get(timeId) ?? null,
    }))
    // Desempate DECLARADO. Ordenar só por aproveitamento deixa os empatados na
    // ordem em que entraram no Map — que é a ordem de leitura dos jogos, e
    // portanto muda quando um dia é refeito. Times com a mesma campanha
    // trocavam de posição sem que nada tivesse acontecido em quadra.
    .sort(
      (a, b) =>
        b.aproveitamento - a.aproveitamento || b.v - a.v || a.timeId.localeCompare(b.timeId),
    )

  // Posição é POR CONFERÊNCIA, como a NBA classifica.
  const proximaPosicao = new Map<string, number>()
  for (const time of ordenados) {
    const chave = time.conferencia ?? 'LIGA'
    const posicao = (proximaPosicao.get(chave) ?? 0) + 1
    proximaPosicao.set(chave, posicao)

    // A sequência é o rabo da campanha: "V3" = três vitórias seguidas.
    const ultimos = [...time.sequencia].reverse()
    const marca = ultimos[0] ?? 'V'
    let seguidas = 0
    for (const r of ultimos) {
      if (r !== marca) break
      seguidas += 1
    }

    await db
      .insert(classificacao)
      .values({
        temporada,
        timeId: time.timeId,
        conferencia: time.conferencia,
        vitorias: time.v,
        derrotas: time.d,
        posicao,
        aproveitamento: time.aproveitamento.toFixed(3),
        sequencia: `${marca}${seguidas}`,
        capturadoEm: new Date(0),
      })
      .onConflictDoUpdate({
        target: [classificacao.temporada, classificacao.timeId],
        set: {
          // A conferência entra no recálculo como qualquer outro derivado: a
          // linha de classificação guarda a sua cópia, e ela GANHA da coluna
          // do cadastro na hora de agrupar a tela. Sem isto, corrigir a
          // conferência de uma franquia e reexecutar o seed deixava a
          // classificação repetindo a divisão antiga, calada.
          conferencia: time.conferencia,
          vitorias: time.v,
          derrotas: time.d,
          posicao,
          aproveitamento: time.aproveitamento.toFixed(3),
          sequencia: `${marca}${seguidas}`,
        },
      })
  }
  return { linhas: ordenados.length, empates }
}
