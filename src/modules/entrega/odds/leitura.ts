import { and, eq, inArray } from 'drizzle-orm'

import { casas, oddsAgregada, oddsSnapshot } from '../../dominio/db/schema'
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

/** Uma casa e o que ela cotou, linha a linha, na coleta mais recente. */
export type CotacaoDeCasa = {
  casa: string
  /** Odd do OVER por linha: `porLinha[25]`. Linha sem cotação simplesmente falta. */
  porLinha: Record<number, number>
}

/**
 * A GRADE DE CASAS DO DETALHE — a lista completa que o card resume (spec 04,
 * §4.3), em TEXTO: sem logo, sem link, sem CTA. Continua sendo ADR-0004,
 * somente leitura.
 *
 * `odds_snapshot` é série temporal: a mesma casa cota a mesma linha várias
 * vezes por dia. A tela mostra a ÚLTIMA coleta de cada par (casa, linha) —
 * escolher isso aqui, e não na página, é o que impede duas telas de
 * discordarem sobre "a odd de agora".
 *
 * O EMPATE de `capturadoEm` é desempatado pelo `id`, não pela ordem em que o
 * banco devolveu as linhas: a UNIQUE da série impede duas coletas no mesmo
 * instante para o mesmo par (casa, linha) DENTRO de um jogo, mas a consulta
 * lê vários jogos de uma vez. Sem regra explícita, dois renders da mesma tela
 * poderiam mostrar odds diferentes sem que nada tivesse mudado.
 */
export async function cotacoesPorCasa(
  db: Db,
  jogoIds: string[],
  jogadorId: string,
  atributo: Atributo,
): Promise<CotacaoDeCasa[]> {
  if (jogoIds.length === 0) return []

  const linhas = await db
    .select({
      id: oddsSnapshot.id,
      casa: casas.nome,
      linha: oddsSnapshot.linha,
      oddOver: oddsSnapshot.oddOver,
      capturadoEm: oddsSnapshot.capturadoEm,
    })
    .from(oddsSnapshot)
    .innerJoin(casas, eq(casas.id, oddsSnapshot.casaId))
    .where(
      and(
        inArray(oddsSnapshot.jogoId, jogoIds),
        eq(oddsSnapshot.jogadorId, jogadorId),
        eq(oddsSnapshot.atributo, atributo),
      ),
    )

  type Coleta = { odd: number; quando: Date; id: string }
  /** Mais recente; empatou no carimbo, o `id` maior — sempre a mesma escolha. */
  const maisNova = (nova: Coleta, atual: Coleta) =>
    nova.quando.getTime() === atual.quando.getTime()
      ? nova.id > atual.id
      : nova.quando > atual.quando

  const porCasa = new Map<string, Map<number, Coleta>>()
  for (const l of linhas) {
    // Cotação sem odd de OVER não vira 0,00 na tela: some.
    if (l.oddOver === null) continue
    const linha = Number(l.linha)
    const atual = porCasa.get(l.casa) ?? new Map<number, Coleta>()
    const anterior = atual.get(linha)
    const coleta: Coleta = { odd: Number(l.oddOver), quando: l.capturadoEm, id: l.id }
    if (anterior === undefined || maisNova(coleta, anterior)) atual.set(linha, coleta)
    porCasa.set(l.casa, atual)
  }

  return (
    [...porCasa.entries()]
      .map(([casa, linhasDaCasa]) => ({
        casa,
        porLinha: Object.fromEntries(
          [...linhasDaCasa].map(([linha, v]) => [linha, v.odd]),
        ) as Record<number, number>,
      }))
      // Ordem por nome: a grade não troca de linha entre dois renders.
      .sort((a, b) => a.casa.localeCompare(b.casa))
  )
}
