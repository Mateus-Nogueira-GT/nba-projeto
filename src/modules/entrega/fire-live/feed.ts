import { createHash } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'

import { apitos, estatisticasQuarto, feedSnapshot, jogadores, jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo, NivelApito } from '../../motor/tipos'
import { montarChave } from '../../motor/tipos'
import type { ItemFeed } from '../lista-secreta'

/**
 * Item do feed ao vivo. O apito é o REGISTRO do momento em que a marca foi
 * cruzada (congelado pela UNIQUE); `valorNoQuarto` é o progresso vivo contra
 * o alvo — é ele que muda a cada ciclo.
 */
export type ItemFireLive = ItemFeed & {
  adversarioSigla: string
  quartoAtual: number | null
  /** O 1Q acabou. O item permanece até o fim do jogo, marcado. (G2 — proposta enviada ao CJ) */
  encerrado: boolean
  valorNoQuarto: number
}

export type ConteudoFeedFireLive = {
  dataReferencia: string
  geradoEm: string
  rulesetVersao: string
  jogoId: string
  itens: ItemFireLive[]
}

function hashDe(conteudo: ConteudoFeedFireLive): string {
  // geradoEm fica FORA do hash, como na Lista Secreta: senão toda execução
  // pareceria mudança. valorNoQuarto e encerrado ficam DENTRO — são o que a
  // tela ao vivo existe para mostrar.
  const estavel = JSON.stringify(
    conteudo.itens.map((i) => [i.chave, i.turbo, i.modoFire, i.valorNoQuarto, i.encerrado]),
  )
  return createHash('sha256').update(estavel).digest('hex').slice(0, 16)
}

/**
 * Materializa o snapshot do Fire Live — POR JOGO (spec 05).
 *
 * Chamado pelo ciclo, na mesma passagem que gravou os apitos: a tela lê este
 * snapshot, nunca o motor (regra `tela-nao-chama-o-motor`). Snapshot vazio
 * também é informação: "observando, ninguém cruzou alvo ainda".
 *
 * A escrita é pulada quando o hash não muda — a mesma proteção da Lista
 * Secreta contra regravar o idêntico a cada 20 segundos.
 */
export async function materializarFeedFireLive(
  db: Db,
  ruleset: Ruleset,
  jogoId: string,
  agora: Date,
): Promise<{ mudou: boolean; itens: number } | null> {
  const [partida] = await db.select().from(jogos).where(eq(jogos.id, jogoId)).limit(1)
  if (!partida) return null

  const quartoFireLive = ruleset.fire_live.quarto
  const encerrado = partida.quartoAtual !== quartoFireLive

  const linhasApito = await db
    .select()
    .from(apitos)
    .where(and(eq(apitos.jogoId, jogoId), eq(apitos.estrategia, 'FIRE_LIVE')))

  const idsJogador = [...new Set(linhasApito.map((a) => a.jogadorId))]
  const [elenco, listaTimes, estatisticas] = await Promise.all([
    idsJogador.length > 0
      ? db.select().from(jogadores).where(inArray(jogadores.id, idsJogador))
      : Promise.resolve([]),
    db.select().from(times).where(inArray(times.id, [partida.timeCasaId, partida.timeVisitanteId])),
    idsJogador.length > 0
      ? db
          .select()
          .from(estatisticasQuarto)
          .where(
            and(eq(estatisticasQuarto.jogoId, jogoId), eq(estatisticasQuarto.quarto, quartoFireLive)),
          )
      : Promise.resolve([]),
  ])

  const jogadorPorId = new Map(elenco.map((j) => [j.id, j] as const))
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  const valorPorJogador = new Map(
    estatisticas.map((e) => [
      e.jogadorId,
      { PONTOS: e.pontos, REBOTES: e.rebotes, ASSISTENCIAS: e.assistencias } as Record<Atributo, number>,
    ]),
  )

  const itens: ItemFireLive[] = linhasApito.map((a) => {
    const jogador = jogadorPorId.get(a.jogadorId)
    const time = jogador?.timeId ? timePorId.get(jogador.timeId) : undefined
    const adversarioId =
      jogador?.timeId === partida.timeCasaId ? partida.timeVisitanteId : partida.timeCasaId
    return {
      chave: montarChave(a.jogoId, a.jogadorId, a.atributo, 'FIRE_LIVE', null),
      jogoId: a.jogoId,
      jogadorId: a.jogadorId,
      nome: jogador?.nomeCompleto ?? a.jogadorId,
      timeSigla: time?.sigla ?? '—',
      timeNome: time?.nome ?? '—',
      atributo: a.atributo,
      nivelJogador: a.nivelJogador,
      nivelApito: a.nivelApito as NivelApito,
      turbo: a.turbo,
      modoFire: a.modoFire,
      opdOrigemNivel: (a.opdOrigemNivel ?? null) as ItemFeed['opdOrigemNivel'],
      linha: null,
      confianca: null, // Fire Live não tem nota — e o card não inventa número
      alvo1Q: a.alvo1q,
      adversarioSigla: timePorId.get(adversarioId)?.sigla ?? '—',
      quartoAtual: partida.quartoAtual,
      encerrado,
      valorNoQuarto: valorPorJogador.get(a.jogadorId)?.[a.atributo] ?? 0,
    }
  })
  // Ordem estável pela chave: snapshot determinístico independente do banco.
  itens.sort((a, b) => a.chave.localeCompare(b.chave))

  const conteudo: ConteudoFeedFireLive = {
    dataReferencia: partida.dataReferencia,
    geradoEm: agora.toISOString(),
    rulesetVersao: `v${ruleset.version}`,
    jogoId,
    itens,
  }
  const hash = hashDe(conteudo)

  const [existente] = await db
    .select({ hash: feedSnapshot.hash })
    .from(feedSnapshot)
    .where(
      and(
        eq(feedSnapshot.dataReferencia, partida.dataReferencia),
        eq(feedSnapshot.estrategia, 'FIRE_LIVE'),
        eq(feedSnapshot.jogoId, jogoId),
      ),
    )
    .limit(1)

  const mudou = existente?.hash !== hash
  if (mudou) {
    await db
      .insert(feedSnapshot)
      .values({
        dataReferencia: partida.dataReferencia,
        estrategia: 'FIRE_LIVE',
        jogoId,
        conteudoJson: conteudo,
        geradoEm: agora,
        hash,
      })
      .onConflictDoUpdate({
        target: [feedSnapshot.dataReferencia, feedSnapshot.estrategia, feedSnapshot.jogoId],
        set: { conteudoJson: conteudo, geradoEm: agora, hash },
      })
  }

  return { mudou, itens: itens.length }
}
