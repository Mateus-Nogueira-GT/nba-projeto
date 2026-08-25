import { and, eq, inArray } from 'drizzle-orm'

import { oddsAgregada } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Atributo } from '../../motor/tipos'

/**
 * FAIXAS DE ODD JÁ AGREGADAS — leitura pura da materialização.
 *
 * A agregação (mediana entre casas, mínimo de casas, fallback) acontece uma vez
 * por coleta, no motor. A tela só lê o resultado: com 10k usuários, recalcular
 * a mediana por request seria pagar o mesmo custo dez mil vezes pelo mesmo
 * número.
 */
export type FaixaDeLinha = {
  min: number
  max: number
  mediana: number
  /** Média simples entre casas — null em agregada anterior à coleta real. */
  media: number | null
  qtdCasas: number
  origem: string
}

/** Indexado pela linha: `faixas.get(25)`. */
export type FaixasPorLinha = Map<number, FaixaDeLinha>

export async function faixasDoJogador(
  db: Db,
  jogoIds: string[],
  jogadorId: string,
  atributo: Atributo,
): Promise<FaixasPorLinha> {
  if (jogoIds.length === 0) return new Map()

  const linhas = await db
    .select()
    .from(oddsAgregada)
    .where(
      and(
        inArray(oddsAgregada.jogoId, jogoIds),
        eq(oddsAgregada.jogadorId, jogadorId),
        eq(oddsAgregada.atributo, atributo),
      ),
    )

  return new Map(
    // Agregada sem faixa gravada não vira 0,00–0,00 na tela: some.
    linhas
      .filter((l) => l.oddMin !== null && l.oddMax !== null)
      .map((l) => [
      Number(l.linha),
      {
        min: Number(l.oddMin),
        max: Number(l.oddMax),
        mediana: Number(l.oddMediana),
        media: l.oddMedia === null ? null : Number(l.oddMedia),
        qtdCasas: l.qtdCasas,
        origem: l.origem,
      },
    ]),
  )
}
