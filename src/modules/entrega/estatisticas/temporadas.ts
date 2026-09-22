import { sql } from 'drizzle-orm'

import { jogos } from '../../dominio/db/schema'
import { dataDeReferencia } from '../../dominio/rodada'
import type { Db } from '../../dominio/db/tipos'
import {
  calendarioDoRuleset,
  temporadaDe,
  temporadaExibida,
  type ConfigTemporada,
  type TemporadaComDados,
} from '../../dominio/temporada'

/**
 * De que temporadas o banco tem resultado, e quanto.
 *
 * Alimenta `temporadaExibida`: sem esta leitura a tela não tem como saber que a
 * temporada do calendário ainda está vazia.
 *
 * A derivação do rótulo NÃO é feita em SQL. Um `EXTRACT(YEAR ...)` paralelo
 * seria uma segunda tradução de data para temporada, e duas traduções que
 * divergem foi exatamente o defeito da errata de 25/08: o JOIN devolve zero
 * linhas sem erro nenhum. A contagem vem agregada por mês — poucas dezenas de
 * linhas — e quem monta o rótulo é a mesma `temporadaDe` que a ingestão usa.
 */
export async function temporadasComDados(
  db: Db,
  config: ConfigTemporada,
): Promise<TemporadaComDados[]> {
  const meses = await db
    .select({
      ano: sql<number>`EXTRACT(YEAR FROM ${jogos.dataReferencia})::int`,
      mes: sql<number>`EXTRACT(MONTH FROM ${jogos.dataReferencia})::int`,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(jogos)
    .where(sql`${jogos.status} = 'ENCERRADO'`)
    .groupBy(
      sql`EXTRACT(YEAR FROM ${jogos.dataReferencia})`,
      sql`EXTRACT(MONTH FROM ${jogos.dataReferencia})`,
    )

  const porTemporada = new Map<string, number>()
  for (const { ano, mes, total } of meses) {
    // Dia 15 ao meio-dia UTC: todo jogo de um mês pertence à mesma temporada
    // (a virada acontece na virada de mês), e o meio do mês não escorrega para
    // o mês vizinho em nenhum fuso — o que a meia-noite do dia 1º faria.
    const referencia = new Date(Date.UTC(ano, mes - 1, 15, 12))
    const temporada = temporadaDe(referencia, config)
    porTemporada.set(temporada, (porTemporada.get(temporada) ?? 0) + total)
  }

  return [...porTemporada]
    .map(([temporada, jogosEncerrados]) => ({ temporada, jogosEncerrados }))
    .sort((a, b) => b.temporada.localeCompare(a.temporada))
}

/**
 * A temporada que a tela deve mostrar, resolvida do banco e do ruleset.
 *
 * Existe para que as cinco telas de consulta não repitam a composição
 * `temporadasComDados` + `temporadaExibida` + piso — dez lugares repetindo o
 * calendário à mão foi o defeito que `calendarioDoRuleset` veio corrigir, e
 * este é o mesmo risco.
 */
export async function temporadaParaExibir(
  db: Db,
  ruleset: RulesetDeTemporada,
  agora: Date,
): Promise<string> {
  return temporadaParaExibirNoCalendario(
    db,
    calendarioDoRuleset(ruleset),
    ruleset.temporada.minimo_jogos_para_exibir,
    agora,
  )
}

/**
 * A mesma resolução, para quem já tem o calendário montado e o piso solto.
 *
 * Existe para a lateral, que é cacheada por argumento: passar o ruleset
 * inteiro faria dele a chave do cache.
 */
export async function temporadaParaExibirNoCalendario(
  db: Db,
  config: ConfigTemporada,
  minimoJogos: number,
  agora: Date,
): Promise<string> {
  const doCalendario = temporadaDe(agora, config)
  const comDados = await temporadasComDados(db, config)
  return temporadaExibida(doCalendario, comDados, minimoJogos)
}

/** O recorte do ruleset que esta camada precisa — nunca o ruleset inteiro. */
export type RulesetDeTemporada = {
  temporada: {
    mes_inicio: number
    formato: 'dois_anos' | 'ano_inicial'
    minimo_jogos_para_exibir: number
  }
  rodada: { fuso: string }
}

/** O que a tela precisa saber sobre em que ponto do calendário o app está. */
export type EstadoDaTemporada = {
  /** A temporada que as telas de consulta mostram. */
  exibida: string
  /** A temporada a que a data de hoje pertence. */
  doCalendario: string
  /**
   * A temporada do calendário começou no papel mas ainda não teve jogo.
   *
   * É a janela entre o lançamento (~02/10) e a primeira bola (~03/11): as
   * telas de apito não têm o que mostrar, e precisam dizer por quê em vez de
   * exibir o mesmo "sem jogos hoje" de uma terça-feira de folga.
   */
  emHiato: boolean
  /** Rodada do próximo jogo agendado, quando o banco já conhece algum. */
  proximoJogo: string | null
}

export async function estadoDaTemporada(
  db: Db,
  ruleset: RulesetDeTemporada,
  agora: Date,
): Promise<EstadoDaTemporada> {
  const config = calendarioDoRuleset(ruleset)
  const doCalendario = temporadaDe(agora, config)
  const comDados = await temporadasComDados(db, config)
  const exibida = temporadaExibida(
    doCalendario,
    comDados,
    ruleset.temporada.minimo_jogos_para_exibir,
  )

  const hoje = dataDeReferencia(agora, config.fuso)
  const [proximo] = await db
    .select({ data: jogos.dataReferencia })
    .from(jogos)
    .where(sql`${jogos.status} = 'AGENDADO' AND ${jogos.dataReferencia} >= ${hoje}`)
    .orderBy(jogos.dataReferencia)
    .limit(1)

  return {
    exibida,
    doCalendario,
    // Banco vazio não é hiato: sem dado nenhum não dá para afirmar que a
    // temporada não começou — só que não sabemos nada.
    emHiato: exibida !== doCalendario,
    proximoJogo: proximo?.data ?? null,
  }
}
