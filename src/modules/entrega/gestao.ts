import type { Db } from '../dominio/db/tipos'
import { limitesDoDia, sugerirEntrada, valorDaUnidade } from '../motor/gestao/banca'
import type { Entrada, LimitesDoDia } from '../motor/gestao/banca'
import type { Ruleset } from '../motor/ruleset/schema'
import { agruparPorJogador, lerFeed, ordenarPorConfianca } from './lista-secreta'
import type { ItemFeed } from './lista-secreta'

/**
 * PLANO DO DIA — a Lista Secreta traduzida em tamanho de entrada.
 *
 * Vive na entrega, não na tela: a fronteira do projeto proíbe `src/app` de
 * executar o motor. A diferença em relação ao feed é que o resultado depende
 * da banca de CADA usuário e por isso não pode ser materializado — mas o
 * cálculo continua sendo uma função pura recebendo um snapshot já pronto.
 */

export type EntradaDoPlano = {
  item: ItemFeed
  entrada: Entrada | null
}

export type PlanoDoDia = {
  /** false = o ruleset não traz modelo de gestão. A tela avisa, não inventa. */
  temModelo: boolean
  origem: 'homologado' | 'demonstracao' | null
  banca: number
  unidade: number | null
  limites: LimitesDoDia | null
  entradas: EntradaDoPlano[]
  /** Soma das entradas sugeridas — o que o dia inteiro exporia da banca. */
  totalExposto: number
}

export const BANCA_PADRAO = 1000

export async function planoDoDia(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
  banca: number,
  /**
   * O feed do dia JÁ LIDO — a tela passa o do cache (`lerFeedCacheado`), e o
   * plano não repete a leitura por visita. Omitido, lê do banco como sempre
   * (a landing e os testes).
   */
  feedLido?: { conteudo: { itens: ItemFeed[] } } | null,
): Promise<PlanoDoDia> {
  const modelo = ruleset.gestao_banca
  const feed = feedLido === undefined ? await lerFeed(db, dataReferencia) : feedLido

  // Um card por jogador e atributo, na mesma ordem da Lista Secreta: o plano
  // de banca precisa espelhar a tela que o usuário acabou de ver.
  const itens = feed === null ? [] : ordenarPorConfianca(agruparPorJogador(feed.conteudo.itens))

  const entradas = itens.map((item) => ({
    item,
    entrada: sugerirEntrada(banca, item.nivelApito, item.turbo, ruleset),
  }))

  return {
    temModelo: modelo !== undefined,
    origem: modelo?.origem ?? null,
    banca,
    unidade: valorDaUnidade(banca, ruleset),
    limites: limitesDoDia(banca, ruleset),
    entradas,
    totalExposto: entradas.reduce((soma, e) => soma + (e.entrada?.valor ?? 0), 0),
  }
}
