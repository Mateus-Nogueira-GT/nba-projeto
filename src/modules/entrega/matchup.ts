import { and, countDistinct, eq, gte, lt } from 'drizzle-orm'

import { estatisticasTimeJogo, jogos, times } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { calendarioDoRuleset, temporadaDe } from '../dominio/temporada'
import {
  estrelasDoMatchup,
  type EstrelasMatchup,
  type PosicoesMatchup,
} from '../motor/matchup/estrelas'
import type { Ruleset } from '../motor/ruleset/schema'
import type { Atributo } from '../motor/tipos'

/**
 * MATCHUP — o DADO (reunião de 23/09) e, desde as respostas do CJ de 09/10,
 * o FATO das estrelas: as posições do adversário que o motor lê em
 * `estrelasDoMatchup`. A regra (corte, critérios, 20 dias) mora no ruleset e
 * no motor; aqui só se mede — nada aqui apita nem mexe em apito.
 *
 * Dado canônico (`estatisticas_time_jogo`, o time REAL do provedor), como a
 * aba de estatísticas. Só jogos ENCERRADOS da temporada e ANTERIORES à data
 * do apito — o jogo do próprio dia ainda não aconteceu.
 */
export type Marca = { valor: number; posicao: number }

export type PerfilAdversario = {
  sigla: string
  jogos: number
  /** Times com ao menos um jogo no período — o "de N" da posição. */
  totalTimes: number
  pontosCedidos: Marca
  /** As bolas de 3 que o PRÓPRIO adversário erra: viram rebote. */
  tresErradas: Marca
  rebotesCedidos: Marca
  /** Pontos que o PRÓPRIO adversário marca — "os melhores ataques" (CJ, 09/10). */
  pontosMarcados: Marca
  /** Bolas que o PRÓPRIO adversário perde (turnovers) — "perdem muita bola". */
  bolasPerdidas: Marca
}

type Campo = 'pontosCedidos' | 'tresErradas' | 'rebotesCedidos' | 'pontosMarcados' | 'bolasPerdidas'
type Soma = { jogos: number } & Record<Campo, number>
const CAMPOS: Campo[] = [
  'pontosCedidos',
  'tresErradas',
  'rebotesCedidos',
  'pontosMarcados',
  'bolasPerdidas',
]

/**
 * O perfil de TODOS os times com jogo no período, numa varredura só. É isto
 * que o painel do apito guarda em cache (`app/_cache/matchup.ts`): a posição
 * de um time depende das médias de todos, então a conta é a mesma para os 30
 * — calcular uma vez por (data, temporada) e escolher a sigla depois.
 *
 * Objeto simples, e não `Map`: atravessa o `unstable_cache` como JSON.
 */
export async function perfisDoDia(
  db: Db,
  dataReferencia: string,
  inicioTemporada: string,
): Promise<Record<string, PerfilAdversario>> {
  const linhas = await db
    .select({
      jogoId: estatisticasTimeJogo.jogoId,
      sigla: times.sigla,
      pontos: estatisticasTimeJogo.pontos,
      rebotes: estatisticasTimeJogo.rebotesTotal,
      tresC: estatisticasTimeJogo.tresC,
      tresT: estatisticasTimeJogo.tresT,
      turnovers: estatisticasTimeJogo.turnovers,
    })
    .from(estatisticasTimeJogo)
    .innerJoin(jogos, eq(jogos.id, estatisticasTimeJogo.jogoId))
    .innerJoin(times, eq(times.id, estatisticasTimeJogo.timeId))
    .where(
      and(
        eq(jogos.status, 'ENCERRADO'),
        gte(jogos.dataReferencia, inicioTemporada),
        lt(jogos.dataReferencia, dataReferencia),
      ),
    )

  const porJogo = new Map<string, typeof linhas>()
  for (const l of linhas) porJogo.set(l.jogoId, [...(porJogo.get(l.jogoId) ?? []), l])

  const somas = new Map<string, Soma>()
  for (const lados of porJogo.values()) {
    if (lados.length !== 2) continue // box incompleto não entra na média
    const [a, b] = lados as [(typeof linhas)[number], (typeof linhas)[number]]
    for (const [time, outro] of [
      [a, b],
      [b, a],
    ] as const) {
      const s = somas.get(time.sigla) ?? {
        jogos: 0,
        pontosCedidos: 0,
        tresErradas: 0,
        rebotesCedidos: 0,
        pontosMarcados: 0,
        bolasPerdidas: 0,
      }
      s.jogos += 1
      s.pontosCedidos += outro.pontos
      s.tresErradas += time.tresT - time.tresC
      s.rebotesCedidos += outro.rebotes
      s.pontosMarcados += time.pontos
      s.bolasPerdidas += time.turnovers
      somas.set(time.sigla, s)
    }
  }

  const medias = [...somas.entries()].map(([sigla, s]) => ({
    sigla,
    ...(Object.fromEntries(CAMPOS.map((c) => [c, s[c] / s.jogos])) as Record<Campo, number>),
  }))

  const perfis: Record<string, PerfilAdversario> = {}
  for (const proprio of medias) {
    const marca = (campo: Campo): Marca => {
      const valor = proprio[campo]
      // Posição 1 = quem MAIS cede/erra/marca/perde; empate divide a mesma posição.
      return { valor, posicao: 1 + medias.filter((m) => m[campo] > valor).length }
    }
    perfis[proprio.sigla] = {
      sigla: proprio.sigla,
      jogos: somas.get(proprio.sigla)!.jogos,
      totalTimes: somas.size,
      pontosCedidos: marca('pontosCedidos'),
      tresErradas: marca('tresErradas'),
      rebotesCedidos: marca('rebotesCedidos'),
      pontosMarcados: marca('pontosMarcados'),
      bolasPerdidas: marca('bolasPerdidas'),
    }
  }
  return perfis
}

/**
 * DIAS DE COMPETIÇÃO (CJ, 09/10: "liga após 20 dias"): datas com ao menos um
 * jogo ENCERRADO na temporada, antes do dia. O motor compara com
 * `matchup.liberar_apos_dias_de_competicao`.
 */
export async function diasDeCompeticao(
  db: Db,
  dataReferencia: string,
  inicioTemporada: string,
): Promise<number> {
  const [linha] = await db
    .select({ n: countDistinct(jogos.dataReferencia) })
    .from(jogos)
    .where(
      and(
        eq(jogos.status, 'ENCERRADO'),
        gte(jogos.dataReferencia, inicioTemporada),
        lt(jogos.dataReferencia, dataReferencia),
      ),
    )
  return Number(linha?.n ?? 0)
}

export type MatchupDoDia = {
  perfis: Record<string, PerfilAdversario>
  diasDeCompeticao: number
}

/** Perfis e dias de competição de uma data — o fato inteiro das estrelas. */
export async function matchupDoDia(
  db: Db,
  dataReferencia: string,
  inicioTemporada: string,
): Promise<MatchupDoDia> {
  const [perfis, dias] = await Promise.all([
    perfisDoDia(db, dataReferencia, inicioTemporada),
    diasDeCompeticao(db, dataReferencia, inicioTemporada),
  ])
  return { perfis, diasDeCompeticao: dias }
}

/** O perfil na língua do motor: a posição de cada métrica do matchup. */
export function posicoesDoPerfil(
  perfil: PerfilAdversario | null | undefined,
): PosicoesMatchup | null {
  if (!perfil) return null
  return {
    PONTOS_CEDIDOS: perfil.pontosCedidos.posicao,
    TRES_ERRADAS: perfil.tresErradas.posicao,
    PONTOS_MARCADOS: perfil.pontosMarcados.posicao,
    BOLAS_PERDIDAS: perfil.bolasPerdidas.posicao,
  }
}

export type CalcularMatchup = (
  jogo: { dataReferencia: string; dataHoraUtc: Date },
  adversarioSigla: string,
  atributo: Atributo,
) => Promise<EstrelasMatchup | null>

/**
 * As estrelas de cada item, na MATERIALIZAÇÃO (Lista, Fire Live, retroativo).
 *
 * Os perfis saem de uma varredura da temporada: a calculadora guarda UMA
 * leitura por (data, temporada) e todos os itens do dia a reaproveitam — sem
 * N+1. Sem estrela nem aviso, o item leva `null`, e com o matchup desligado
 * no ruleset o banco nem é lido.
 */
export function calculadoraDeMatchup(
  db: Db,
  ruleset: Ruleset,
  memo: Map<string, Promise<MatchupDoDia>> = new Map(),
): CalcularMatchup {
  const calendario = calendarioDoRuleset(ruleset)
  return async (jogo, adversarioSigla, atributo) => {
    if (!ruleset.matchup.habilitado) return null
    const inicio = inicioDaTemporada(
      temporadaDe(jogo.dataHoraUtc, calendario),
      calendario.mesInicio,
    )
    const chave = `${jogo.dataReferencia}|${inicio}`
    let dia = memo.get(chave)
    if (!dia) {
      // A falha NÃO fica no memo (pente fino de 09/10, achado 3): sem isto,
      // um soluço do banco na 1ª leitura rejeitaria todo ciclo seguinte que
      // usa o mesmo memo, até ele expirar.
      const leitura: Promise<MatchupDoDia> = matchupDoDia(db, jogo.dataReferencia, inicio).catch(
        (erro: unknown) => {
          if (memo.get(chave) === leitura) memo.delete(chave)
          throw erro
        },
      )
      memo.set(chave, leitura)
      dia = leitura
    }
    const { perfis, diasDeCompeticao: dias } = await dia
    const r = estrelasDoMatchup(
      { posicoes: posicoesDoPerfil(perfis[adversarioSigla]), diasDeCompeticao: dias },
      atributo,
      ruleset,
    )
    return r.estrelas === 0 && r.aviso.length === 0 ? null : r
  }
}

/** O perfil de UM adversário — o recorte de `perfisDoDia`. */
export async function perfilDoAdversario(
  db: Db,
  adversarioSigla: string,
  dataReferencia: string,
  inicioTemporada: string,
): Promise<PerfilAdversario | null> {
  return (await perfisDoDia(db, dataReferencia, inicioTemporada))[adversarioSigla] ?? null
}

/** A data e hora do jogo — o matchup só precisa disto, e não do detalhe inteiro. */
export async function dataHoraDoJogo(db: Db, jogoId: string): Promise<Date | null> {
  const [linha] = await db.select({ dataHoraUtc: jogos.dataHoraUtc }).from(jogos).where(eq(jogos.id, jogoId))
  return linha?.dataHoraUtc ?? null
}

/** Primeiro dia da temporada pelo rótulo ("2025-26" → "2025-10-01"). */
export function inicioDaTemporada(rotulo: string, mesInicio: number): string {
  return `${rotulo.slice(0, 4)}-${String(mesInicio).padStart(2, '0')}-01`
}
