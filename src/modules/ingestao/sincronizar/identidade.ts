import { eq } from 'drizzle-orm'

import { identidadesJogador, jogadores, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * Resolvedores de identidade — id do provedor → id canônico.
 *
 * Três chaves naturais diferentes, uma por entidade, porque cada uma tem um
 * problema distinto:
 *
 *   time    -> `sigla`. LAL é LAL em qualquer provedor.
 *   jogador -> `identidades_jogador`. Ids diferem entre provedores.
 *   jogo    -> (data, casa, visitante). Ver a nota na constraint.
 */

export type Resumo = { lidos: number; gravados: number }

/** Sigla → id do time. Carregado uma vez por sincronização. */
export async function mapaDeTimes(db: Db): Promise<Map<string, string>> {
  const linhas = await db.select({ id: times.id, sigla: times.sigla }).from(times)
  return new Map(linhas.map((t) => [t.sigla.toUpperCase(), t.id] as const))
}

/** Id externo → id do jogador, para um provedor. */
export async function mapaDeJogadores(
  db: Db,
  provedor: string,
): Promise<Map<string, string>> {
  const linhas = await db
    .select({ idExterno: identidadesJogador.idExterno, jogadorId: identidadesJogador.jogadorId })
    .from(identidadesJogador)
    .where(eq(identidadesJogador.provedor, provedor))

  return new Map(linhas.map((i) => [i.idExterno, i.jogadorId] as const))
}

/**
 * Garante que os jogadores existam e devolve o mapa id externo → id canônico.
 *
 * Cria a linha em `jogadores` quando o provedor traz alguém desconhecido —
 * precisamos dos ~500 da liga, não só dos ~150 que o CJ classificou. O que
 * NUNCA acontece aqui é criar vínculo com a lista do CJ: isso é curadoria
 * humana e vive em `mapa_jogadores` (CLAUDE.md, Armadilhas).
 */
export async function garantirJogadores(
  db: Db,
  provedor: string,
  novos: {
    idExterno: string
    nomeCompleto: string
    timeId: string | null
    posicao: string | null
    alturaCm: number | null
    numeroCamisa: number | null
    fotoUrl: string | null
    ativo: boolean
  }[],
): Promise<Map<string, string>> {
  if (novos.length === 0) return new Map()

  const existentes = await mapaDeJogadores(db, provedor)
  const faltantes = novos.filter((j) => !existentes.has(j.idExterno))

  if (faltantes.length > 0) {
    const inseridos = await db
      .insert(jogadores)
      .values(
        faltantes.map((j) => ({
          nomeCompleto: j.nomeCompleto,
          timeId: j.timeId,
          posicao: j.posicao,
          alturaCm: j.alturaCm,
          numeroCamisa: j.numeroCamisa,
          fotoUrl: j.fotoUrl,
          ativo: j.ativo,
        })),
      )
      .returning({ id: jogadores.id })

    await db
      .insert(identidadesJogador)
      .values(
        faltantes.map((j, i) => ({
          jogadorId: inseridos[i]!.id,
          provedor,
          idExterno: j.idExterno,
        })),
      )
      // Duas invocações concorrentes do cron podem inserir o mesmo jogador.
      // A UNIQUE decide; a segunda simplesmente não grava a identidade.
      .onConflictDoNothing({
        target: [identidadesJogador.provedor, identidadesJogador.idExterno],
      })

    for (const [i, j] of faltantes.entries()) existentes.set(j.idExterno, inseridos[i]!.id)
  }

  // Releitura: sob concorrência, a identidade vencedora pode ser de outra
  // invocação, e é ela que vale.
  return mapaDeJogadores(db, provedor)
}

