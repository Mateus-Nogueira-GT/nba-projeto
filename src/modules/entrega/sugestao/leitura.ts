import { and, desc, eq, inArray } from 'drizzle-orm'

import {
  estatisticasJogo,
  jogadores,
  jogos,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { colunasDeParticipacao, entrouEmQuadra } from '../../dominio/participacao'
import {
  ranquearPorTaxaNaLinha,
  type JogadorParaRanquear,
} from '../../motor/sugestao/taxa-na-linha'
import type { Ruleset } from '../../motor/ruleset/schema'
import { ATRIBUTOS, type Atributo, type Nivel } from '../../motor/tipos'
import { lerFeed } from '../lista-secreta'
import type { JogoRanqueado, RankingDoDia } from './tipos'

/**
 * O RANKING DO DIA — busca os fatos e entrega ao motor, que ordena.
 *
 * Esta camada NÃO decide nada: só lê e chama `ranquearPorTaxaNaLinha`. Ela
 * também não conhece `next/cache` — nenhum módulo do projeto importa Next, e
 * o dependency-cruiser cobra. Quem cacheia é a rota (`api/chat/ranking.ts`).
 *
 * O ELENCO VEM DA CURADORIA DO CJ (`niveis.timeId`), nunca do provedor: é a
 * armadilha que o CLAUDE.md documenta, e a mesma fonte que o motor usa para
 * apitar. A exceção da aba de estatísticas não vale aqui, porque isto alimenta
 * sugestão, não consulta.
 */

/** O valor do atributo numa linha de box score. */
function valorDoAtributo(
  linha: { pontos: number | null; rebotes: number | null; assistencias: number | null },
  atributo: Atributo,
): number {
  if (atributo === 'PONTOS') return linha.pontos ?? 0
  if (atributo === 'REBOTES') return linha.rebotes ?? 0
  return linha.assistencias ?? 0
}

export async function lerRankingDoDia(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
): Promise<RankingDoDia> {
  const vazio: RankingDoDia = { dataReferencia, jogos: [] }

  // 1 · A versão ATIVA da lista do CJ. Sem ela não há elenco nem nível.
  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  if (!versao) return vazio

  // 2 · Os jogos de hoje, com os dois times.
  const partidas = await db
    .select({
      id: jogos.id,
      timeCasaId: jogos.timeCasaId,
      timeVisitanteId: jogos.timeVisitanteId,
    })
    .from(jogos)
    .where(eq(jogos.dataReferencia, dataReferencia))
  if (partidas.length === 0) return vazio

  const idsDeTime = [
    ...new Set(partidas.flatMap((p) => [p.timeCasaId, p.timeVisitanteId])),
  ].filter((id): id is string => id !== null)
  if (idsDeTime.length === 0) return vazio

  const [classificacoes, elencoDosTimes, apitadosHoje] = await Promise.all([
    db
      .select()
      .from(niveis)
      .where(and(eq(niveis.niveisVersaoId, versao.id), inArray(niveis.timeId, idsDeTime))),
    db.select({ id: times.id, sigla: times.sigla, nome: times.nome }).from(times).where(inArray(times.id, idsDeTime)),
    lerFeed(db, dataReferencia),
  ])
  if (classificacoes.length === 0) return vazio

  // 3 · Quem o motor apitou hoje, por (jogador, atributo) — nunca por jogador:
  // quem apita em pontos pode não apitar em rebotes.
  const apitados = new Set(
    (apitadosHoje?.conteudo.itens ?? []).map((i) => `${i.jogadorId}|${i.atributo}`),
  )

  // 4 · Os box scores ENCERRADOS dos jogadores desses times. O jogo em
  // andamento fica de fora: box parcial faria o ranking dizer que o jogador
  // está fraco porque ainda está no primeiro quarto.
  const idsDeJogador = [...new Set(classificacoes.map((c) => c.jogadorId))]
  const linhas = await db
    // `colunasDeParticipacao` já traz pontos, rebotes e assistências — é o
    // mesmo conjunto que `entrouEmQuadra` examina. Repetir as três aqui as
    // sobrescreveria.
    .select({
      jogadorId: estatisticasJogo.jogadorId,
      dataReferencia: jogos.dataReferencia,
      ...colunasDeParticipacao,
    })
    .from(estatisticasJogo)
    .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
    .where(
      and(
        inArray(estatisticasJogo.jogadorId, idsDeJogador),
        eq(jogos.status, 'ENCERRADO'),
      ),
    )
    .orderBy(desc(jogos.dataReferencia))

  // Do mais recente para o mais antigo, e SÓ os jogos em que ele entrou em
  // quadra: contar um DNP como "não bateu a linha" diria que o jogador falhou
  // numa noite em que nem jogou.
  const jogosPorJogador = new Map<string, typeof linhas>()
  for (const linha of linhas) {
    if (!entrouEmQuadra(linha)) continue
    const atuais = jogosPorJogador.get(linha.jogadorId) ?? []
    atuais.push(linha)
    jogosPorJogador.set(linha.jogadorId, atuais)
  }

  const nomePorJogador = new Map(
    (
      await db
        .select({ id: jogadores.id, nome: jogadores.nomeCompleto })
        .from(jogadores)
        .where(inArray(jogadores.id, idsDeJogador))
    ).map((j) => [j.id, j.nome] as const),
  )
  const timePorId = new Map(elencoDosTimes.map((t) => [t.id, t] as const))

  // 5 · Um ranking por (jogo, atributo).
  const porTime = new Map<string, typeof classificacoes>()
  for (const c of classificacoes) {
    if (c.timeId === null) continue
    const atuais = porTime.get(c.timeId) ?? []
    atuais.push(c)
    porTime.set(c.timeId, atuais)
  }

  const { maximo_por_time } = ruleset.sugestao_estatistica
  const saida: JogoRanqueado[] = []

  for (const partida of partidas) {
    const casa = partida.timeCasaId === null ? undefined : timePorId.get(partida.timeCasaId)
    const fora =
      partida.timeVisitanteId === null ? undefined : timePorId.get(partida.timeVisitanteId)
    if (casa === undefined || fora === undefined) continue

    const porAtributo = ATRIBUTOS.map((atributo) => {
      const candidatos: JogadorParaRanquear[] = []
      for (const time of [casa, fora]) {
        const doTime = (porTime.get(time.id) ?? []).filter((c) => c.atributo === atributo)
        for (const classificacao of doTime) {
          candidatos.push({
            jogadorId: classificacao.jogadorId,
            nome: nomePorJogador.get(classificacao.jogadorId) ?? classificacao.jogadorId,
            timeSigla: time.sigla,
            nivel: classificacao.nivel as Nivel,
            jogos: (jogosPorJogador.get(classificacao.jogadorId) ?? []).map((l) =>
              valorDoAtributo(l, atributo),
            ),
            apitadoHoje: apitados.has(`${classificacao.jogadorId}|${atributo}`),
          })
        }
      }
      // O motor ordena; aqui só se corta o topo de cada time, para o contexto
      // do chat não crescer sem freio (spec §6.1).
      const ranqueados = ranquearPorTaxaNaLinha(candidatos, atributo, ruleset)
      const porSigla = new Map<string, number>()
      const cortados = ranqueados.filter((item) => {
        const quantos = porSigla.get(item.timeSigla) ?? 0
        if (quantos >= maximo_por_time) return false
        porSigla.set(item.timeSigla, quantos + 1)
        return true
      })
      return { atributo, itens: cortados }
    }).filter((p) => p.itens.length > 0)

    if (porAtributo.length === 0) continue
    saida.push({
      jogoId: partida.id,
      times: [
        { sigla: casa.sigla, nome: casa.nome },
        { sigla: fora.sigla, nome: fora.nome },
      ],
      porAtributo,
    })
  }

  return { dataReferencia, jogos: saida }
}
