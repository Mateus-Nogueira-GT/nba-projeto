import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { identidadesJogador, jogadores, mapaJogadores } from './db/schema'
import type { Db } from './db/tipos'
import { identidadeNbaPorAlias, identidadeNbaPorPersonId } from './identidades-nba'
import { contemTrecho } from './texto'

export type IdentidadeApresentacao = {
  nome: string
  aliases: string[]
  personId: number | null
  pendencia: 'IDENTIDADE_AMBIGUA' | 'VINCULOS_DIVERGENTES' | null
}

/**
 * Projeção por UUID, em lote. O nome atual do provedor continua intacto e
 * pesquisável; nomes oficiais vêm apenas de identidade NBA explícita ou dos
 * aliases CURADOS e CONFIRMADOS. Nome parecido nunca liga duas pessoas.
 * Sem ids, lê o catálogo canônico inteiro para busca/relatório (não por card).
 */
export async function identidadesDeApresentacao(
  db: Db,
  ids?: readonly string[],
): Promise<Map<string, IdentidadeApresentacao>> {
  if (ids?.length === 0) return new Map()
  const [canonicos, vinculos, externos] = await Promise.all([
    db
      .select({ id: jogadores.id, nome: jogadores.nomeCompleto })
      .from(jogadores)
      .where(ids ? inArray(jogadores.id, [...ids]) : undefined),
    db
      .select({ jogadorId: mapaJogadores.jogadorId, alias: mapaJogadores.nomeNaLista })
      .from(mapaJogadores)
      .where(
        and(
          ids ? inArray(mapaJogadores.jogadorId, [...ids]) : undefined,
          isNotNull(mapaJogadores.jogadorId),
          isNotNull(mapaJogadores.confirmadoEm),
          isNotNull(mapaJogadores.confirmadoPor),
        ),
      ),
    db
      .select({ jogadorId: identidadesJogador.jogadorId, idExterno: identidadesJogador.idExterno })
      .from(identidadesJogador)
      .where(
        and(
          eq(identidadesJogador.provedor, 'nba'),
          ids ? inArray(identidadesJogador.jogadorId, [...ids]) : undefined,
        ),
      ),
  ])
  const aliasesPorId = new Map<string, string[]>()
  for (const vinculo of vinculos) {
    if (!vinculo.jogadorId) continue
    const aliases = aliasesPorId.get(vinculo.jogadorId) ?? []
    aliases.push(vinculo.alias)
    aliasesPorId.set(vinculo.jogadorId, aliases)
  }
  const idsNba = new Map<string, number[]>()
  for (const externo of externos) {
    const personId = Number(externo.idExterno)
    if (!Number.isSafeInteger(personId) || personId <= 0) continue
    const lista = idsNba.get(externo.jogadorId) ?? []
    lista.push(personId)
    idsNba.set(externo.jogadorId, lista)
  }
  return new Map(
    canonicos.map((jogador) => {
      const aliases = aliasesPorId.get(jogador.id) ?? []
      const curadas = aliases.map(identidadeNbaPorAlias).filter((i) => i !== undefined)
      const candidatos = new Set([
        ...(idsNba.get(jogador.id) ?? []),
        ...curadas.flatMap((i) => (i.personId === null ? [] : [i.personId])),
      ])
      const personId = candidatos.size === 1 ? [...candidatos][0]! : null
      const oficial = personId === null ? undefined : identidadeNbaPorPersonId(personId)
      const nome = oficial?.nomeOficial ?? jogador.nome
      return [
        jogador.id,
        {
          nome,
          personId,
          aliases: [...new Set([jogador.nome, nome, ...aliases])],
          pendencia:
            candidatos.size > 1
              ? 'VINCULOS_DIVERGENTES'
              : personId === null && curadas.some((i) => i.personId === null)
                ? 'IDENTIDADE_AMBIGUA'
                : null,
        },
      ]
    }),
  )
}

/** Busca por nome oficial, nome atual e aliases confirmados; não altera identidade. */
export async function buscarIdsPorNomeOuAlias(db: Db, consulta: string): Promise<string[]> {
  if (!consulta.trim()) return []
  const identidades = await identidadesDeApresentacao(db)
  return [...identidades]
    .filter(([, i]) => i.aliases.some((alias) => contemTrecho(consulta, alias)))
    .map(([id]) => id)
}
