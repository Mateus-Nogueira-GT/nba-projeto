import { and, eq, inArray } from 'drizzle-orm'

import type { Atributo, JogadorFato, JogoFato, Nivel, StatusEscalacao, TimeFato } from '../motor/tipos'
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

export async function montarFatosDoJogo(db: Db, jogoId: string): Promise<FatosDoJogo | null> {
  const [partida] = await db.select().from(jogos).where(eq(jogos.id, jogoId)).limit(1)
  if (!partida) return null

  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  if (!versao) return null

  const idsTime = [partida.timeCasaId, partida.timeVisitanteId]

  // O vínculo jogador↔time vem da LISTA do CJ (niveis.time_id), nunca de
  // jogadores.time_id — os elencos da lista são projetados.
  const classificacoes = await db
    .select()
    .from(niveis)
    .where(and(eq(niveis.niveisVersaoId, versao.id), inArray(niveis.timeId, idsTime)))

  if (classificacoes.length === 0) return null

  const idsJogador = [...new Set(classificacoes.map((c) => c.jogadorId))]

  const [elenco, listaTimes, medias, escalacoes, quartos, opdPublicada] = await Promise.all([
    db.select().from(jogadores).where(inArray(jogadores.id, idsJogador)),
    db.select().from(times).where(inArray(times.id, idsTime)),
    db
      .select()
      .from(mediasJogador)
      .where(
        and(inArray(mediasJogador.jogadorId, idsJogador), eq(mediasJogador.janela, 'TEMPORADA')),
      ),
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
  for (const [jogadorId, dados] of classesPorJogador) {
    const lista = jogadoresPorTime.get(dados.timeId) ?? []
    lista.push({
      id: jogadorId,
      nome: dadosJogador.get(jogadorId)?.nomeCompleto ?? jogadorId,
      timeId: dados.timeId,
      posicaoHierarquia: dados.posicao,
      classificacoes: dados.classificacoes,
      medias: mediasPorJogador.get(jogadorId) ?? {},
      // Vazio de propósito: nenhuma regra do Fire Live lê histórico.
      historico: [],
    })
    jogadoresPorTime.set(dados.timeId, lista)
  }

  const timesFato: TimeFato[] = listaTimes
    .filter((t) => jogadoresPorTime.has(t.id))
    .map((t) => ({
      id: t.id,
      sigla: t.sigla,
      jogadores: (jogadoresPorTime.get(t.id) ?? []).sort(
        (a, b) => a.posicaoHierarquia - b.posicaoHierarquia,
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
  return db
    .select({ id: jogos.id })
    .from(jogos)
    .where(eq(jogos.quartoAtual, quarto))
}
