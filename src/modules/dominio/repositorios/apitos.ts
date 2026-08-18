import type { Apito } from '../../motor/tipos'
import { apitos } from '../db/schema'
import type { Db } from '../db/tipos'

/**
 * Grava apitos de forma IDEMPOTENTE.
 *
 * `onConflictDoNothing` sobre a constraint apitos_dedup: retry de workflow
 * reexecuta passos, e o mesmo apito chega mais de uma vez por desenho.
 * Conflito aqui é caminho esperado, não erro (CLAUDE.md, regra 5).
 *
 * Devolve apenas os apitos EFETIVAMENTE inseridos — é essa lista que vira push.
 */
export async function gravarApitos(
  db: Db,
  rulesetVersao: string,
  lista: Apito[],
): Promise<{ id: string }[]> {
  if (lista.length === 0) return []

  return db
    .insert(apitos)
    .values(
      lista.map((a) => ({
        rulesetVersao,
        jogoId: a.jogoId,
        jogadorId: a.jogadorId,
        atributo: a.atributo,
        estrategia: a.estrategia,
        metodo: a.metodo,
        nivelJogador: a.nivelJogador,
        nivelApito: a.nivelApito,
        turbo: a.turbo,
        modoFire: a.modoFire,
        opdOrigemNivel: a.opdOrigemNivel,
        linha: a.linha,
        confianca: a.confianca === null ? null : String(a.confianca),
        alvo1q: a.alvo1Q,
      })),
    )
    .onConflictDoNothing({
      // Alvo explícito em vez de "qualquer conflito": estas são exatamente as
      // colunas da constraint apitos_dedup. Assim um conflito inesperado em
      // outra constraint estoura em vez de ser engolido em silêncio.
      target: [apitos.jogoId, apitos.jogadorId, apitos.atributo, apitos.estrategia, apitos.linha],
    })
    .returning({ id: apitos.id })
}
