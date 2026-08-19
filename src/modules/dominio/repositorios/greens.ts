import type { Green } from '../../motor/fire-live/avaliar'
import { greens } from '../db/schema'
import type { Db } from '../db/tipos'

/**
 * Grava greens de forma IDEMPOTENTE.
 *
 * Mesma mecânica de `gravarApitos`: o conflito na UNIQUE `greens_dedup` é
 * caminho ESPERADO, não erro. O motor devolve todos os marcos já atingidos a
 * cada ciclo — dos 20 em 20 segundos, o mesmo marco de 25 pontos volta
 * dezenas de vezes. O banco aceita o primeiro e rejeita o resto.
 *
 * Devolve apenas o que foi EFETIVAMENTE inserido — é essa lista que vira push.
 */
export async function gravarGreens(
  db: Db,
  lista: Green[],
): Promise<{ id: string; jogadorId: string; marco: number }[]> {
  if (lista.length === 0) return []

  return db
    .insert(greens)
    .values(
      lista.map((g) => ({
        jogoId: g.jogoId,
        jogadorId: g.jogadorId,
        atributo: g.atributo,
        nivelJogador: g.nivelJogador,
        marco: g.marco,
        valor: g.valor,
      })),
    )
    .onConflictDoNothing({
      // Alvo explícito: são exatamente as colunas de `greens_dedup`. Conflito
      // em qualquer outra constraint deve estourar, não ser engolido.
      target: [greens.jogoId, greens.jogadorId, greens.atributo, greens.marco],
    })
    .returning({ id: greens.id, jogadorId: greens.jogadorId, marco: greens.marco })
}
