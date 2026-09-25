import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'

import * as schema from '../../../dominio/db/schema'
import type { Db } from '../../../dominio/db/tipos'
import { calendarioDoRuleset, temporadaDe } from '../../../dominio/temporada'
import type { Ruleset } from '../../../motor/ruleset/schema'
import type { ConteudoFeed } from '../../tipos-feed'
import { executarDiaRetroativo } from '../executar'

/**
 * UM DIA DE TEMPORADA ANTERIOR sobre um banco já semeado (as fumaças de tela
 * semeiam a temporada simulada primeiro). Mesmos números de `executar.test.ts`
 * — oscilação do MVP (30, 30, 12) e do All Star (25, 25, 15) — mas com os
 * jogadores que a lista ATIVA do banco já tem: a tela não sabe nomes, lê.
 *
 * O ano é o anterior ao da temporada simulada, para a data cair numa
 * temporada que NÃO é a do calendário do teste.
 */
export async function semearDiaAnterior(
  db: Db,
  ruleset: Ruleset,
  dia: string,
): Promise<{ temporada: string; apitados: { jogadorId: string; nome: string }[] }> {
  const [versao] = await db
    .select({ id: schema.niveisVersao.id })
    .from(schema.niveisVersao)
    .where(eq(schema.niveisVersao.ativa, true))
    .limit(1)
  if (!versao) throw new Error('semente: sem versão ativa da lista do CJ')
  const doNivel = async (nivel: 'MVP' | 'ALL_STAR') => {
    const [n] = await db
      .select({ jogadorId: schema.niveis.jogadorId })
      .from(schema.niveis)
      .where(
        and(
          eq(schema.niveis.niveisVersaoId, versao.id),
          eq(schema.niveis.atributo, 'PONTOS'),
          eq(schema.niveis.nivel, nivel),
        ),
      )
      .limit(1)
    if (!n) throw new Error(`semente: sem jogador ${nivel} na lista ativa`)
    return n.jogadorId
  }
  const mvp = await doNivel('MVP')
  const allStar = await doNivel('ALL_STAR')
  const [casa, visitante] = await db.select({ id: schema.times.id }).from(schema.times).limit(2)
  if (!casa || !visitante) throw new Error('semente: menos de dois times')

  const anteriores = [3, 2, 1].map((n) => {
    const d = new Date(`${dia}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  })
  const jogos = [...anteriores, dia].map((data) => ({
    id: randomUUID(),
    timeCasaId: casa.id,
    timeVisitanteId: visitante.id,
    status: 'ENCERRADO' as const,
    dataReferencia: data,
    // 23h30 UTC = 20h30 em São Paulo: o jogo cai no mesmo dia da rodada.
    dataHoraUtc: new Date(`${data}T23:30:00Z`),
    placarCasa: 110,
    placarVisitante: 100,
  }))
  await db.insert(schema.jogos).values(jogos)
  const pontos: Record<string, number[]> = { [mvp]: [30, 30, 12, 28], [allStar]: [25, 25, 15, 22] }
  await db.insert(schema.estatisticasJogo).values(
    jogos.flatMap((j, i) =>
      [mvp, allStar].map((jogadorId) => ({
        jogoId: j.id,
        jogadorId,
        timeId: casa.id,
        pontos: pontos[jogadorId]![i]!,
        minutos: '30',
        rebotesTotal: 5,
        assistencias: 3,
      })),
    ),
  )

  // As fumaças semeiam com o relógio falso ainda no calendário do teste; o
  // operador roda o script DEPOIS que a temporada acabou — dois anos depois
  // do dia é sempre depois.
  const depois = new Date(`${Number(dia.slice(0, 4)) + 2}-01-15T12:00:00Z`)
  const r = await executarDiaRetroativo(db, ruleset, dia, { agora: depois })
  if (r.apitos === 0) throw new Error('semente: o dia anterior não apitou')
  const [feed] = await db
    .select()
    .from(schema.feedRetroativo)
    .where(eq(schema.feedRetroativo.dataReferencia, dia))
  const itens = (feed!.conteudoJson as ConteudoFeed).itens
  const apitados = [...new Map(itens.map((i) => [i.jogadorId, { jogadorId: i.jogadorId, nome: i.nome }])).values()]
  return {
    temporada: temporadaDe(new Date(`${dia}T12:00:00Z`), calendarioDoRuleset(ruleset)),
    apitados,
  }
}
