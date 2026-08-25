import { and, eq, gt, gte, isNotNull, lt, notInArray } from 'drizzle-orm'

import { estatisticasJogo, jogos, mediasJogador } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { temporadaDe, type ConfigTemporada } from '../../dominio/temporada'
import { excluded } from './upsert'
import type { Resumo } from './identidade'

/**
 * MÉDIAS — derivadas, não ingeridas.
 *
 * Nenhum provedor entrega isto: é agregação sobre `estatisticas_jogo`. E é o
 * número mais importante do sistema — toda a Lista Secreta compara contra a
 * média, e todo alvo do Fire Live sai dela.
 *
 * A janela vem do RULESET (`media.janela`), nunca do código. Trocar para
 * `ultimos_10` tem que ser um diff de YAML — regra 1 do CLAUDE.md.
 */

import { janelaNoBanco, type JanelaMedia } from '../../dominio/janela'

export type { JanelaMedia }

/** Quantos jogos cada janela considera. `null` = todos os da temporada. */
function tamanhoDaJanela(janela: JanelaMedia): number | null {
  switch (janela) {
    case 'temporada':
      return null
    case 'ultimos_5':
      return 5
    case 'ultimos_10':
      return 10
  }
}


function media(valores: number[]): string | null {
  if (valores.length === 0) return null
  const total = valores.reduce((a, v) => a + v, 0)
  return (total / valores.length).toFixed(2)
}

export async function recalcularMedias(
  db: Db,
  opcoes: {
    janela: JanelaMedia
    configTemporada: ConfigTemporada
    /** Data de referência: define a que temporada o recálculo pertence. */
    agora: Date
  },
): Promise<Resumo> {
  const temporada = temporadaDe(opcoes.agora, opcoes.configTemporada)

  // Recorte da temporada: do mês de início até o mesmo mês do ano seguinte.
  const anoInicial = Number(temporada.slice(0, 4))
  const inicio = new Date(Date.UTC(anoInicial, opcoes.configTemporada.mesInicio - 1, 1))
  const fim = new Date(Date.UTC(anoInicial + 1, opcoes.configTemporada.mesInicio - 1, 1))

  const linhas = await db
    .select({
      jogadorId: estatisticasJogo.jogadorId,
      pontos: estatisticasJogo.pontos,
      rebotes: estatisticasJogo.rebotesTotal,
      assistencias: estatisticasJogo.assistencias,
      data: jogos.dataHoraUtc,
    })
    .from(estatisticasJogo)
    // O JOIN liga a linha ao jogo; o WHERE recorta a temporada. Trocar um pelo
    // outro produz produto cartesiano — e médias silenciosamente erradas.
    .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
    .where(
      and(
        gte(jogos.dataHoraUtc, inicio),
        lt(jogos.dataHoraUtc, fim),
        eq(jogos.status, 'ENCERRADO'),
        // Regra conservadora de participação: sem minutos positivos a
        // linha não entra na média. Nenhum adapter transforma DNP em zero.
        isNotNull(estatisticasJogo.minutos),
        gt(estatisticasJogo.minutos, '0'),
      ),
    )

  const porJogador = new Map<string, typeof linhas>()
  for (const l of linhas) {
    const lista = porJogador.get(l.jogadorId) ?? []
    lista.push(l)
    porJogador.set(l.jogadorId, lista)
  }

  const limite = tamanhoDaJanela(opcoes.janela)
  const valores = []

  for (const [jogadorId, todos] of porJogador) {
    // Do mais recente para o mais antigo — a janela corta os últimos N.
    const ordenados = [...todos].sort((a, b) => b.data.getTime() - a.data.getTime())
    const considerados = limite === null ? ordenados : ordenados.slice(0, limite)

    valores.push({
      jogadorId,
      temporada,
      janela: janelaNoBanco(opcoes.janela),
      jogos: considerados.length,
      ppg: media(considerados.map((c) => c.pontos)),
      rpg: media(considerados.map((c) => c.rebotes)),
      apg: media(considerados.map((c) => c.assistencias)),
      atualizadoEm: opcoes.agora,
    })
  }

  const janelaBanco = janelaNoBanco(opcoes.janela)
  if (valores.length === 0) {
    await db
      .delete(mediasJogador)
      .where(
        and(eq(mediasJogador.temporada, temporada), eq(mediasJogador.janela, janelaBanco)),
      )
    return { lidos: linhas.length, gravados: 0 }
  }

  await db
    .delete(mediasJogador)
    .where(
      and(
        eq(mediasJogador.temporada, temporada),
        eq(mediasJogador.janela, janelaBanco),
        notInArray(
          mediasJogador.jogadorId,
          valores.map((valor) => valor.jogadorId),
        ),
      ),
    )

  const gravados = await db
    .insert(mediasJogador)
    .values(valores)
    .onConflictDoUpdate({
      target: [mediasJogador.jogadorId, mediasJogador.temporada, mediasJogador.janela],
      set: {
        jogos: excluded('jogos'),
        ppg: excluded('ppg'),
        rpg: excluded('rpg'),
        apg: excluded('apg'),
        atualizadoEm: opcoes.agora,
      },
    })
    .returning({ id: mediasJogador.id })

  return { lidos: linhas.length, gravados: gravados.length }
}
