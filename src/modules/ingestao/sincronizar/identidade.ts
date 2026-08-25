import { and, eq, sql } from 'drizzle-orm'

import {
  conflitosIdentidadeJogador,
  identidadesJogador,
  jogadores,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { normalizarTexto } from '../../dominio/texto'

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
export async function mapaDeJogadores(db: Db, provedor: string): Promise<Map<string, string>> {
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
    await db.transaction(async (tx) => {
      // A identidade natural atravessa provedores, mas o banco só conhece a
      // unicidade de cada namespace externo. Serializar este trecho evita que
      // duas fontes criem, ao mesmo tempo, dois canônicos para a mesma pessoa.
      await tx.execute(sql`LOCK TABLE ${jogadores} IN SHARE ROW EXCLUSIVE MODE`)

      for (const j of faltantes) {
        const [jaCriada] = await tx
          .select({ jogadorId: identidadesJogador.jogadorId })
          .from(identidadesJogador)
          .where(
            and(
              eq(identidadesJogador.provedor, provedor),
              eq(identidadesJogador.idExterno, j.idExterno),
            ),
          )
          .limit(1)
        if (jaCriada) continue

        // Nome nunca autoriza unir namespaces. Ele serve somente para sugerir
        // um candidato ao humano; o vínculo nasce de curadoria explícita.
        const canonicos = await tx
          .select({ id: jogadores.id, nomeCompleto: jogadores.nomeCompleto })
          .from(jogadores)
        const nomeNormalizado = normalizarTexto(j.nomeCompleto)
        const candidatos = canonicos.filter(
          (c) => normalizarTexto(c.nomeCompleto) === nomeNormalizado,
        )
        if (candidatos.length > 0) {
          await tx
            .insert(conflitosIdentidadeJogador)
            .values({
              provedor,
              idExterno: j.idExterno,
              nomeExterno: j.nomeCompleto,
              jogadorCandidatoId: candidatos.length === 1 ? candidatos[0]!.id : null,
              motivo:
                candidatos.length === 1
                  ? 'NOME_COINCIDENTE_REQUER_CURADORIA'
                  : 'NOME_AMBIGUO_REQUER_CURADORIA',
            })
            .onConflictDoUpdate({
              target: [
                conflitosIdentidadeJogador.provedor,
                conflitosIdentidadeJogador.idExterno,
              ],
              set: {
                nomeExterno: j.nomeCompleto,
                jogadorCandidatoId: candidatos.length === 1 ? candidatos[0]!.id : null,
                motivo:
                  candidatos.length === 1
                    ? 'NOME_COINCIDENTE_REQUER_CURADORIA'
                    : 'NOME_AMBIGUO_REQUER_CURADORIA',
                ocorrencias: sql`${conflitosIdentidadeJogador.ocorrencias} + 1`,
                ultimaOcorrenciaEm: new Date(),
              },
            })
          continue
        }

        const [inserido] = await tx
          .insert(jogadores)
          .values({
            nomeCompleto: j.nomeCompleto,
            timeId: j.timeId,
            posicao: j.posicao,
            alturaCm: j.alturaCm,
            numeroCamisa: j.numeroCamisa,
            fotoUrl: j.fotoUrl,
            ativo: j.ativo,
          })
          .returning({ id: jogadores.id })
        if (!inserido) throw new Error('não foi possível criar jogador canônico')

        const vinculada = await tx
          .insert(identidadesJogador)
          .values({ jogadorId: inserido.id, provedor, idExterno: j.idExterno })
          .onConflictDoNothing({
            target: [identidadesJogador.provedor, identidadesJogador.idExterno],
          })
          .returning({ id: identidadesJogador.id })

        // A transação que perde a corrida da identidade remove o canônico que
        // acabou de criar; nenhuma linha órfã sobrevive ao retry concorrente.
        if (vinculada.length === 0) {
          await tx.delete(jogadores).where(eq(jogadores.id, inserido.id))
        }
      }
    })
  }

  // Releitura: sob concorrência, a identidade vencedora pode ser de outra
  // invocação, e é ela que vale.
  return mapaDeJogadores(db, provedor)
}
