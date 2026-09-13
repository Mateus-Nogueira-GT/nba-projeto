import { eq, sql } from 'drizzle-orm'

import { estatisticasJogo } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Ruleset } from '../../motor/ruleset/schema'
import { decomporPontos } from './dados'
import { semearClassificacao, semearPlacares } from './jogos'
import { criarSorteio, desempatar, SEMENTE_TEMPORADA } from './simulacao'

type Empatado = {
  id: string
  data_referencia: string
  time_casa_id: string
  casa: string
  visitante: string
}
type Linha = { id: string; pontos: number; time_id: string }

/** As linhas de um `db.execute`, seja qual for a forma que o driver devolve. */
function linhasDe(resultado: unknown): Record<string, unknown>[] {
  return Array.isArray(resultado)
    ? (resultado as Record<string, unknown>[])
    : ((resultado as { rows?: Record<string, unknown>[] }).rows ?? [])
}

/**
 * REPARO DO PASSADO EMPATADO — a mesma decisão que o gerador teria tomado.
 *
 * O gerador antigo produzia empates (diagnóstico de 13/09); o novo não. Este
 * reparo aplica `desempatar` às linhas já gravadas, com a MESMA chave que o
 * gerador usa: mesma escolha de lado, em qualquer banco. O time de cada linha
 * é o do vínculo da LISTA do CJ (versão ativa), o mesmo join de
 * `semearPlacares` — nunca `jogadores.time_id`, que é o time real do provedor.
 *
 * Idempotente: sem empate, não encontra nem escreve nada.
 */
export async function repararEmpates(
  db: Db,
  ruleset: Ruleset,
  opcoes: { hoje: string; semente?: string },
): Promise<{
  encontrados: number
  reparados: number
  classificacao: { linhas: number; empates: number }
}> {
  const semente = opcoes.semente ?? SEMENTE_TEMPORADA
  const empatados = linhasDe(
    await db.execute(sql`
      select j.id, j.data_referencia::text as data_referencia, j.time_casa_id,
             c.sigla as casa, v.sigla as visitante
        from jogos j
        join times c on c.id = j.time_casa_id
        join times v on v.id = j.time_visitante_id
       where j.status = 'ENCERRADO' and j.placar_casa = j.placar_visitante
       order by j.data_referencia, j.id
    `),
  ) as unknown as Empatado[]

  const reparados: string[] = []
  for (const jogo of empatados) {
    const linhas = linhasDe(
      await db.execute(sql`
        select ej.id, ej.pontos::int as pontos, n.time_id
          from estatisticas_jogo ej
          join niveis n on n.jogador_id = ej.jogador_id and n.atributo = 'PONTOS'
          join niveis_versao nv on nv.id = n.niveis_versao_id and nv.ativa = true
         where ej.jogo_id = ${jogo.id}
      `),
    ) as unknown as Linha[]
    const casa = linhas.filter((l) => l.time_id === jogo.time_casa_id)
    const visitante = linhas.filter((l) => l.time_id !== jogo.time_casa_id)
    const decidido = desempatar(
      casa,
      visitante,
      criarSorteio(`${semente}|${jogo.data_referencia}|${jogo.casa}x${jogo.visitante}|desempate`),
    )
    if (decidido.desempatou === null) continue
    const antes = new Map(linhas.map((l) => [l.id, l.pontos] as const))
    const mudada = [...decidido.casa, ...decidido.visitante].find(
      (l) => l.pontos !== antes.get(l.id),
    )
    if (!mudada) continue
    // O desdobramento sai do valor FINAL: `2·doisC + 3·tresC + lanceC = pontos`
    // continua valendo na linha reparada.
    await db
      .update(estatisticasJogo)
      .set({ pontos: mudada.pontos, ...decomporPontos(mudada.pontos) })
      .where(eq(estatisticasJogo.id, mudada.id))
    reparados.push(jogo.id)
  }

  if (reparados.length > 0) await semearPlacares(db, reparados)
  const classificacao = await semearClassificacao(db, ruleset, opcoes.hoje)
  return { encontrados: empatados.length, reparados: reparados.length, classificacao }
}
