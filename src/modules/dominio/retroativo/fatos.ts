import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'

import {
  ATRIBUTOS,
  type Atributo,
  type Fatos,
  type JogadorFato,
  type JogoFato,
  type JogoHistorico,
  type Nivel,
  type StatusEscalacao,
  type TimeFato,
} from '../../motor/tipos'
import {
  estatisticasJogo,
  estatisticasQuarto,
  jogadores,
  jogos,
  niveis,
  niveisVersao,
  times,
} from '../db/schema'
import type { Db } from '../db/tipos'
import { chavesEstrategiaConfirmadas } from '../fatos-editoriais'
import { tamanhoDaJanela, type JanelaMedia } from '../janela'
import { colunasDeParticipacao, entrouEmQuadra } from '../participacao'
import { intervaloDoDia } from '../rodada'
import { temporadaDe, type ConfigTemporada } from '../temporada'
import { mediasAte, ordenarHierarquia, timeNaData } from './regras'

/**
 * MONTAGEM DE FATOS DA TEMPORADA ANTERIOR (spec 25/09) — irmã de `montarFatos`.
 *
 * É a ÚNICA peça que sabe de temporada anterior. O motor recebe o mesmo
 * `Fatos` de sempre; o que muda é de onde cada fato vem:
 *
 * - o time do jogador é o que ele JOGOU até o dia (box score), não o da
 *   lista do CJ — decisão 2;
 * - a hierarquia do time é remontada pelo nível do jogador que o CJ deu, e
 *   no mesmo nível pela posição dele na lista — decisão 3;
 * - a média é só até a véspera: olhar o futuro inflaria a taxa de acerto;
 * - só conta o box da MESMA temporada do dia: a média é "de 2025-26 até
 *   D−1" e o time do dia é o daquela temporada, nunca o da anterior;
 * - desfalque é quem não jogou — decisão 4. Não há relatório de lesões.
 *
 * Só jogos ENCERRADOS entram: é o replay de uma rodada que já aconteceu.
 */

export type ConfigRetroativa = {
  /** Do ruleset (`calendarioDoRuleset`): virada de temporada e fuso do dia. */
  calendario: ConfigTemporada
  /** Do ruleset: `media.janela`. */
  janela: JanelaMedia
  /** Do ruleset: o único quarto em que o Fire Live age. */
  quartoFireLive: number
}

type Classe = { nivel: Nivel; posicaoCj: number }

export async function montarFatosRetroativos(
  db: Db,
  dataReferencia: string,
  config: ConfigRetroativa,
): Promise<Fatos & { niveisVersaoId: string | null }> {
  const vazio = { dataReferencia, times: [], jogos: [], niveisVersaoId: null }
  const { inicio, fim } = intervaloDoDia(dataReferencia, config.calendario.fuso)
  const temporada = temporadaDe(inicio, config.calendario)
  // O primeiro instante da temporada (dia 1º do mês de início, no fuso do
  // calendário): o box de temporadas passadas nem sai do banco. A fronteira
  // exata continua sendo `temporadaDe` em cada linha, abaixo.
  const mesInicio = String(config.calendario.mesInicio).padStart(2, '0')
  const inicioDaTemporada = intervaloDoDia(
    `${temporada.slice(0, 4)}-${mesInicio}-01`,
    config.calendario.fuso,
  ).inicio

  // 1 · Versão ATIVA da lista do CJ: é ela que dá o nível do jogador.
  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  if (!versao) return vazio

  const classificacoes = await db.select().from(niveis).where(eq(niveis.niveisVersaoId, versao.id))
  if (classificacoes.length === 0) return { ...vazio, niveisVersaoId: versao.id }

  // 2 · Jogos do dia, só os que já acabaram.
  const partidas = await db
    .select()
    .from(jogos)
    .where(
      and(gte(jogos.dataHoraUtc, inicio), lt(jogos.dataHoraUtc, fim), eq(jogos.status, 'ENCERRADO')),
    )
    .orderBy(asc(jogos.dataHoraUtc))
  const idsJogo = partidas.map((p) => p.id)

  // 3 · Carga em lote. O box vem até o FIM do dia: o que é anterior ao início
  //     vira histórico (média), o do próprio dia só diz time e presença.
  const idsJogador = [...new Set(classificacoes.map((c) => c.jogadorId))]

  const [elenco, listaTimes, linhas, quartos, chavesEstrategia] = await Promise.all([
    db.select().from(jogadores).where(inArray(jogadores.id, idsJogador)),
    db.select().from(times),
    db
      .select({
        jogadorId: estatisticasJogo.jogadorId,
        jogoId: estatisticasJogo.jogoId,
        timeId: estatisticasJogo.timeId,
        ...colunasDeParticipacao,
        dataHoraUtc: jogos.dataHoraUtc,
        dataReferencia: jogos.dataReferencia,
      })
      .from(estatisticasJogo)
      .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
      .where(
        and(
          inArray(estatisticasJogo.jogadorId, idsJogador),
          gte(jogos.dataHoraUtc, inicioDaTemporada),
          lt(jogos.dataHoraUtc, fim),
        ),
      ),
    idsJogo.length > 0
      ? db
          .select()
          .from(estatisticasQuarto)
          .where(
            and(
              inArray(estatisticasQuarto.jogoId, idsJogo),
              eq(estatisticasQuarto.quarto, config.quartoFireLive),
            ),
          )
      : Promise.resolve([]),
    chavesEstrategiaConfirmadas(db, idsJogador),
  ])

  // 4 · Índices em memória.
  const historicoPorJogador = new Map<string, JogoHistorico[]>()
  const timesPorJogador = new Map<string, { data: string; timeId: string | null }[]>()
  // jogoId → jogadorId → linha do box daquele jogo do dia.
  const boxDoDia = new Map<string, Map<string, (typeof linhas)[number]>>()
  const doDia = new Set(idsJogo)

  for (const l of linhas) {
    // Fronteira da temporada — regra única para histórico, média E time do
    // dia: linha de outra temporada não existe para este replay.
    if (temporadaDe(l.dataHoraUtc, config.calendario) !== temporada) continue
    // Do próprio dia, só o box dos jogos ENCERRADOS do replay: a linha de um
    // jogo em andamento (ou agendado com box parcial) não entra na rodada e
    // não pode trocar o time de ninguém.
    if (l.dataHoraUtc >= inicio && !doDia.has(l.jogoId)) continue

    // O dia da rodada (no fuso do ruleset), não a data UTC: é o que o
    // `dataReferencia` do jogo já guarda.
    const vinculos = timesPorJogador.get(l.jogadorId) ?? []
    vinculos.push({ data: l.dataReferencia, timeId: l.timeId })
    timesPorJogador.set(l.jogadorId, vinculos)

    if (l.dataHoraUtc < inicio) {
      const lista = historicoPorJogador.get(l.jogadorId) ?? []
      lista.push({
        jogoId: l.jogoId,
        data: l.dataHoraUtc.toISOString(),
        jogou: entrouEmQuadra(l),
        pontos: l.pontos,
        rebotes: l.rebotes,
        assistencias: l.assistencias,
      })
      historicoPorJogador.set(l.jogadorId, lista)
    } else if (doDia.has(l.jogoId)) {
      const doJogo = boxDoDia.get(l.jogoId) ?? new Map()
      doJogo.set(l.jogadorId, l)
      boxDoDia.set(l.jogoId, doJogo)
    }
  }
  for (const lista of historicoPorJogador.values()) {
    // O motor conta do mais recente para o mais antigo.
    lista.sort((a, b) => b.data.localeCompare(a.data))
  }

  const classesPorJogador = new Map<string, Partial<Record<Atributo, Classe>>>()
  for (const c of classificacoes) {
    const atual = classesPorJogador.get(c.jogadorId) ?? {}
    atual[c.atributo] = { nivel: c.nivel, posicaoCj: c.posicaoHierarquia }
    classesPorJogador.set(c.jogadorId, atual)
  }

  // 5 · Time de cada jogador NO DIA: o do último jogo dele até ali, inclusive
  //     o do próprio dia — por qual time ele jogou é fato do jogo.
  //     Quem ainda não jogou na temporada não tem time e não entra.
  const membrosPorTime = new Map<string, string[]>()
  for (const jogadorId of idsJogador) {
    const timeId = timeNaData(timesPorJogador.get(jogadorId) ?? [], dataReferencia)
    if (timeId === null) continue
    const membros = membrosPorTime.get(timeId) ?? []
    membros.push(jogadorId)
    membrosPorTime.set(timeId, membros)
  }

  const nomes = new Map(elenco.map((j) => [j.id, j.nomeCompleto] as const))
  const tamanho = tamanhoDaJanela(config.janela)

  // 6 · Hierarquia remontada POR ATRIBUTO: a ordem de pontos pode não ser a
  //     de rebotes, como na lista do CJ.
  const fatoPorJogador = new Map<string, JogadorFato>()
  const jogadoresPorTime = new Map<string, JogadorFato[]>()
  for (const [timeId, membros] of membrosPorTime) {
    const posicoes = new Map<string, Partial<Record<Atributo, number>>>()
    for (const atributo of ATRIBUTOS) {
      const entradas = membros.flatMap((jogadorId) => {
        const classe = classesPorJogador.get(jogadorId)?.[atributo]
        return classe ? [{ jogadorId, ...classe }] : []
      })
      for (const [jogadorId, posicao] of ordenarHierarquia(entradas)) {
        const atual = posicoes.get(jogadorId) ?? {}
        atual[atributo] = posicao
        posicoes.set(jogadorId, atual)
      }
    }

    const fatos = membros.map((jogadorId): JogadorFato => {
      const porAtributo = posicoes.get(jogadorId) ?? {}
      const classes = classesPorJogador.get(jogadorId) ?? {}
      const historico = historicoPorJogador.get(jogadorId) ?? []
      const fato: JogadorFato = {
        id: jogadorId,
        nome: nomes.get(jogadorId) ?? jogadorId,
        timeId,
        // Mesma regra de `indexarClassificacoes`: pontos ordena a
        // apresentação; sem pontos, a melhor posição que ele tiver.
        posicaoHierarquia: porAtributo.PONTOS ?? Math.min(...Object.values(porAtributo)),
        posicaoHierarquiaPorAtributo: porAtributo,
        classificacoes: Object.fromEntries(
          Object.entries(classes).map(([atributo, c]) => [atributo, c.nivel]),
        ),
        chavesEstrategia: chavesEstrategia.get(jogadorId),
        medias: mediasAte(historico, tamanho),
        historico,
      }
      fatoPorJogador.set(jogadorId, fato)
      return fato
    })
    jogadoresPorTime.set(
      timeId,
      fatos.sort((a, b) => a.posicaoHierarquia - b.posicaoHierarquia || a.id.localeCompare(b.id)),
    )
  }

  // O Fire Live observa quem jogou: os da lista com linha no jogo por aquele time.
  const elencoPorTime = new Map<string, JogadorFato[]>()
  for (const doJogo of boxDoDia.values()) {
    for (const [jogadorId, l] of doJogo) {
      const fato = fatoPorJogador.get(jogadorId)
      if (!fato || l.timeId === null) continue
      const lista = elencoPorTime.get(l.timeId) ?? []
      lista.push(fato)
      elencoPorTime.set(l.timeId, lista)
    }
  }

  const timesFato: TimeFato[] = listaTimes
    .filter((t) => jogadoresPorTime.has(t.id))
    .map((t) => ({
      id: t.id,
      sigla: t.sigla,
      jogadores: jogadoresPorTime.get(t.id) ?? [],
      elencoCanonico: (elencoPorTime.get(t.id) ?? []).sort(
        (a, b) => a.posicaoHierarquia - b.posicaoHierarquia || a.id.localeCompare(b.id),
      ),
    }))

  // 7 · Jogos: desfalque é quem da hierarquia não entrou em quadra.
  const jogosFato: JogoFato[] = partidas.map((p) => {
    const doJogo = boxDoDia.get(p.id)
    const escalacao: Record<string, StatusEscalacao> = {}
    for (const timeId of [p.timeCasaId, p.timeVisitanteId]) {
      for (const j of jogadoresPorTime.get(timeId) ?? []) {
        const l = doJogo?.get(j.id)
        escalacao[j.id] = l && entrouEmQuadra(l) ? 'ATIVO' : 'FORA'
      }
    }
    return {
      id: p.id,
      timeCasaId: p.timeCasaId,
      timeVisitanteId: p.timeVisitanteId,
      // O jogo acabou; o Fire Live é avaliado como se estivesse no quarto dele.
      // A Lista Secreta não olha este campo.
      quartoAtual: config.quartoFireLive,
      escalacao,
      estatisticasQuarto: quartos
        .filter((q) => q.jogoId === p.id)
        .map((q) => ({
          jogadorId: q.jogadorId,
          quarto: q.quarto,
          pontos: q.pontos,
          rebotes: q.rebotes,
          assistencias: q.assistencias,
        })),
    }
  })

  return { dataReferencia, times: timesFato, jogos: jogosFato, niveisVersaoId: versao.id }
}
