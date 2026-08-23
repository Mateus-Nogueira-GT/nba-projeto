import { and, eq, inArray } from 'drizzle-orm'

import type {
  Atributo,
  JogadorFato,
  JogoFato,
  Nivel,
  StatusEscalacao,
  TimeFato,
} from '../motor/tipos'
import {
  apitos,
  estatisticasQuarto,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from './db/schema'
import type { Db } from './db/tipos'
import type { NivelApito } from '../motor/tipos'
import { temporadaDe, type ConfigTemporada } from './temporada'

/**
 * Fatos de UM jogo ao vivo — a entrada do ciclo do Fire Live.
 *
 * Existe separado de `montarFatos` (o do dia inteiro) por uma razão de custo,
 * não de estilo: `montarFatos` carrega o histórico de partidas de todos os
 * jogadores classificados, porque a oscilação precisa dele. O Fire Live não
 * lê histórico nenhum — ele compara o 1º quarto contra a média. Rodando de 20
 * em 20 segundos por jogo, arrastar o histórico junto seria pagar a conta mais
 * cara do sistema pelo dado que ninguém vai ler.
 *
 * `historico` vem vazio de propósito. Nenhuma regra do Fire Live o consulta.
 */
export type FatosDoJogo = {
  jogo: JogoFato
  times: TimeFato[]
  /** OPD como foi PUBLICADA na Lista Secreta pré-live, por jogador. */
  opdPreLive: Map<string, NivelApito>
}

function numero(v: string | null): number | undefined {
  if (v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export async function montarFatosDoJogo(
  db: Db,
  jogoId: string,
  configTemporada: ConfigTemporada,
): Promise<FatosDoJogo | null> {
  const [partida] = await db.select().from(jogos).where(eq(jogos.id, jogoId)).limit(1)
  if (!partida) return null
  const temporada = temporadaDe(partida.dataHoraUtc, configTemporada)

  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  if (!versao) return null

  const idsTime = [partida.timeCasaId, partida.timeVisitanteId]

  // São dois vínculos diferentes e ambos precisam sobreviver até o motor:
  // `jogadores.time_id` diz quem pertence ao elenco canônico observado;
  // `niveis.time_id` preserva a hierarquia editorial usada pela OPD/topo.
  const [elencoCanonico, classificacoesEditoriais] = await Promise.all([
    db
      .select()
      .from(jogadores)
      .where(and(inArray(jogadores.timeId, idsTime), eq(jogadores.ativo, true))),
    db
      .select()
      .from(niveis)
      .where(and(eq(niveis.niveisVersaoId, versao.id), inArray(niveis.timeId, idsTime))),
  ])

  const idsCanonicos = elencoCanonico.map((j) => j.id)
  const classificacoesCanonicas =
    idsCanonicos.length > 0
      ? await db
          .select()
          .from(niveis)
          .where(and(eq(niveis.niveisVersaoId, versao.id), inArray(niveis.jogadorId, idsCanonicos)))
      : []
  const classificacoes = [
    ...new Map(
      [...classificacoesEditoriais, ...classificacoesCanonicas].map((c) => [c.id, c] as const),
    ).values(),
  ]
  const idsJogador = [...new Set([...idsCanonicos, ...classificacoes.map((c) => c.jogadorId)])]

  const [elenco, listaTimes, medias, escalacoes, quartos, opdPublicada] = await Promise.all([
    idsJogador.length > 0
      ? db.select().from(jogadores).where(inArray(jogadores.id, idsJogador))
      : Promise.resolve([]),
    db.select().from(times).where(inArray(times.id, idsTime)),
    idsJogador.length > 0
      ? db
          .select()
          .from(mediasJogador)
          .where(
            and(
              inArray(mediasJogador.jogadorId, idsJogador),
              eq(mediasJogador.janela, 'TEMPORADA'),
              eq(mediasJogador.temporada, temporada),
            ),
          )
      : Promise.resolve([]),
    db.select().from(lesoesEscalacao).where(eq(lesoesEscalacao.jogoId, jogoId)),
    db.select().from(estatisticasQuarto).where(eq(estatisticasQuarto.jogoId, jogoId)),
    // Cruzamento (requisito 6): o card exibe a OPD QUE FOI PUBLICADA, lida da
    // tabela de apitos — não uma OPD recalculada agora, que poderia divergir
    // do que o usuário viu no feed antes do jogo.
    db
      .select({ jogadorId: apitos.jogadorId, nivelApito: apitos.nivelApito })
      .from(apitos)
      .where(
        and(
          eq(apitos.jogoId, jogoId),
          eq(apitos.estrategia, 'LISTA_SECRETA'),
          eq(apitos.metodo, 'OPD'),
        ),
      ),
  ])

  const mediasPorJogador = new Map<string, Partial<Record<Atributo, number>>>()
  for (const m of medias) {
    mediasPorJogador.set(m.jogadorId, {
      PONTOS: numero(m.ppg),
      REBOTES: numero(m.rpg),
      ASSISTENCIAS: numero(m.apg),
    })
  }

  const classesPorJogador = new Map<
    string,
    { classificacoes: Partial<Record<Atributo, Nivel>>; posicao: number; timeId: string }
  >()
  for (const c of classificacoes) {
    const atual = classesPorJogador.get(c.jogadorId) ?? {
      classificacoes: {},
      posicao: c.posicaoHierarquia,
      timeId: c.timeId,
    }
    atual.classificacoes[c.atributo] = c.nivel
    classesPorJogador.set(c.jogadorId, atual)
  }

  const dadosJogador = new Map(elenco.map((j) => [j.id, j] as const))

  const jogadoresPorTime = new Map<string, JogadorFato[]>()
  for (const c of classificacoesEditoriais) {
    const jogadorId = c.jogadorId
    const dados = classesPorJogador.get(jogadorId)!
    if ((jogadoresPorTime.get(c.timeId) ?? []).some((j) => j.id === jogadorId)) continue
    const lista = jogadoresPorTime.get(c.timeId) ?? []
    lista.push({
      id: jogadorId,
      nome: dadosJogador.get(jogadorId)?.nomeCompleto ?? jogadorId,
      timeId: c.timeId,
      posicaoHierarquia: dados.posicao,
      classificacoes: dados.classificacoes,
      medias: mediasPorJogador.get(jogadorId) ?? {},
      // Vazio de propósito: nenhuma regra do Fire Live lê histórico.
      historico: [],
    })
    jogadoresPorTime.set(c.timeId, lista)
  }

  const canonicosPorTime = new Map<string, JogadorFato[]>()
  for (const jogador of elencoCanonico) {
    if (jogador.timeId === null) continue
    const editorial = classesPorJogador.get(jogador.id)
    const lista = canonicosPorTime.get(jogador.timeId) ?? []
    lista.push({
      id: jogador.id,
      nome: jogador.nomeCompleto,
      timeId: jogador.timeId,
      // Não classificados não ganham uma posição editorial inventada.
      // Este campo não participa da avaliação do elenco canônico.
      posicaoHierarquia: editorial?.posicao ?? Number.MAX_SAFE_INTEGER,
      classificacoes: editorial?.classificacoes ?? {},
      medias: mediasPorJogador.get(jogador.id) ?? {},
      historico: [],
    })
    canonicosPorTime.set(jogador.timeId, lista)
  }

  const timesFato: TimeFato[] = listaTimes.map((t) => ({
    id: t.id,
    sigla: t.sigla,
    jogadores: (jogadoresPorTime.get(t.id) ?? []).sort(
      (a, b) => a.posicaoHierarquia - b.posicaoHierarquia,
    ),
    elencoCanonico: (canonicosPorTime.get(t.id) ?? []).sort(
      (a, b) => a.posicaoHierarquia - b.posicaoHierarquia || a.nome.localeCompare(b.nome),
    ),
  }))

  const escalacao: Record<string, StatusEscalacao> = {}
  for (const e of escalacoes) escalacao[e.jogadorId] = e.status

  const jogo: JogoFato = {
    id: partida.id,
    timeCasaId: partida.timeCasaId,
    timeVisitanteId: partida.timeVisitanteId,
    quartoAtual: partida.quartoAtual,
    escalacao,
    estatisticasQuarto: quartos.map((q) => ({
      jogadorId: q.jogadorId,
      quarto: q.quarto,
      pontos: q.pontos,
      rebotes: q.rebotes,
      assistencias: q.assistencias,
    })),
  }

  const opdPreLive = new Map<string, NivelApito>()
  for (const o of opdPublicada) {
    // A Lista Secreta grava uma linha por linha de aposta; o nível da OPD é o
    // mesmo em todas elas. Fica o maior, para não depender da ordem do SELECT.
    const atual = opdPreLive.get(o.jogadorId) ?? 0
    if (o.nivelApito > atual) opdPreLive.set(o.jogadorId, o.nivelApito as NivelApito)
  }

  return { jogo, times: timesFato, opdPreLive }
}

/**
 * Jogos que acabaram de entrar no quarto observado pelo Fire Live.
 *
 * É o gatilho do tipoff: o cron pergunta "quem começou?" e o próprio banco
 * responde. Não há relógio envolvido — quem define que o jogo começou é o
 * `quarto_atual` que a ingestão escreveu.
 */
export async function jogosNoQuarto(db: Db, quarto: number): Promise<{ id: string }[]> {
  return db.select({ id: jogos.id }).from(jogos).where(eq(jogos.quartoAtual, quarto))
}
