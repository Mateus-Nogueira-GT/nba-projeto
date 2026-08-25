import { and, eq } from 'drizzle-orm'

import {
  casas,
  identidadesJogador,
  identidadesJogo,
  jogos,
  oddsAgregada,
  oddsSnapshot,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Atributo } from '../../motor/tipos'
import type { CasaDeAposta, CotacaoExterna } from './porta'

/**
 * A COLETA de odds — o elo que nunca existiu fora do seed: casas → snapshot
 * (série temporal, por casa) → agregada (o retrato por linha, com a MÉDIA
 * que o parceiro pediu no card).
 *
 * ADR-0004: leitura de cotação pública. Nada aqui envia, autentica usuário
 * em casa ou movimenta dinheiro.
 */

/** Média simples das decimais over — nulls não contam nem afundam. */
export function agregarCotacoes(cotacoes: { oddOver: number | null }[]): {
  min: number | null
  max: number | null
  media: number | null
  mediana: number | null
  qtd: number
} {
  const valores = cotacoes
    .map((c) => c.oddOver)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  if (valores.length === 0) return { min: null, max: null, media: null, mediana: null, qtd: 0 }

  const soma = valores.reduce((a, v) => a + v, 0)
  const meio = Math.floor(valores.length / 2)
  const mediana =
    valores.length % 2 === 1 ? valores[meio]! : (valores[meio - 1]! + valores[meio]!) / 2

  return {
    min: valores[0]!,
    max: valores[valores.length - 1]!,
    media: Math.round((soma / valores.length) * 1000) / 1000,
    mediana: Math.round(mediana * 1000) / 1000,
    qtd: valores.length,
  }
}

export type ResultadoColeta = {
  cotacoes: number
  agregadas: number
  descartadas: number
  semVinculo: number
}

/**
 * Coleta as odds dos jogos do dia. `fabricaCasas` recebe o id EXTERNO do jogo
 * no provedor e devolve as casas dele (no balldontlie, os 8 vendors saem de
 * uma chamada) — fixture e HTTP passam pela mesma fábrica.
 */
export async function coletarOdds(
  db: Db,
  fabricaCasas: (jogoIdExterno: string) => Promise<CasaDeAposta[]>,
  provedor: string,
  dataReferencia: string,
  agora: Date,
): Promise<ResultadoColeta> {
  const resultado: ResultadoColeta = { cotacoes: 0, agregadas: 0, descartadas: 0, semVinculo: 0 }

  // Jogos do dia COM identidade externa no provedor — sem identidade não há
  // o que perguntar à casa.
  const jogosDoDia = await db
    .select({ jogoId: jogos.id, idExterno: identidadesJogo.idExterno })
    .from(jogos)
    .innerJoin(
      identidadesJogo,
      and(eq(identidadesJogo.jogoId, jogos.id), eq(identidadesJogo.provedor, provedor)),
    )
    .where(eq(jogos.dataReferencia, dataReferencia))

  // Vínculo por id externo: o MESMO provedor da ingestão NBA, os mesmos ids.
  const vinculos = await db
    .select()
    .from(identidadesJogador)
    .where(eq(identidadesJogador.provedor, provedor))
  const jogadorPorIdExterno = new Map(vinculos.map((v) => [v.idExterno, v.jogadorId] as const))

  for (const jogo of jogosDoDia) {
    const casasDoJogo = await fabricaCasas(jogo.idExterno)

    // Agrupamento por (jogador, atributo, linha) atravessando as casas.
    const porMercado = new Map<
      string,
      { jogadorId: string; atributo: Atributo; linha: number; cotacoes: CotacaoExterna[] }
    >()

    for (const casa of casasDoJogo) {
      resultado.descartadas += casa.descartadas?.() ?? 0
      const cotacoes = await casa.cotacoes(jogo.idExterno)

      // A casa existe no cadastro (upsert por nome) — o snapshot referencia.
      const [casaRow] = await db
        .insert(casas)
        .values({ nome: casa.nome, tipoApi: provedor })
        .onConflictDoUpdate({ target: casas.nome, set: { ativa: true } })
        .returning()

      for (const c of cotacoes) {
        if (c.atributo === undefined) continue // casas por nome passam pela curadoria, não por aqui
        const jogadorId = c.jogadorIdExternoProvedor
          ? jogadorPorIdExterno.get(c.jogadorIdExternoProvedor)
          : undefined
        if (!jogadorId) {
          resultado.semVinculo += 1
          continue
        }

        resultado.cotacoes += 1
        await db.insert(oddsSnapshot).values({
          casaId: casaRow!.id,
          jogoId: jogo.jogoId,
          jogadorId,
          atributo: c.atributo,
          linha: c.linha.toFixed(1),
          oddOver: c.oddOver === null ? null : c.oddOver.toFixed(3),
          oddUnder: c.oddUnder === null ? null : c.oddUnder.toFixed(3),
          capturadoEm: agora,
        })

        const chave = `${jogadorId}|${c.atributo}|${c.linha}`
        if (!porMercado.has(chave)) {
          porMercado.set(chave, { jogadorId, atributo: c.atributo, linha: c.linha, cotacoes: [] })
        }
        porMercado.get(chave)!.cotacoes.push(c)
      }
    }

    for (const mercado of porMercado.values()) {
      const agregado = agregarCotacoes(mercado.cotacoes)
      if (agregado.qtd === 0) continue
      resultado.agregadas += 1
      await db
        .insert(oddsAgregada)
        .values({
          jogoId: jogo.jogoId,
          jogadorId: mercado.jogadorId,
          atributo: mercado.atributo,
          linha: mercado.linha.toFixed(1),
          oddMin: agregado.min!.toFixed(3),
          oddMax: agregado.max!.toFixed(3),
          oddMediana: agregado.mediana!.toFixed(3),
          oddMedia: agregado.media!.toFixed(3),
          qtdCasas: agregado.qtd,
          origem: 'CASAS',
          calculadoEm: agora,
        })
        .onConflictDoUpdate({
          target: [oddsAgregada.jogoId, oddsAgregada.jogadorId, oddsAgregada.atributo, oddsAgregada.linha],
          set: {
            oddMin: agregado.min!.toFixed(3),
            oddMax: agregado.max!.toFixed(3),
            oddMediana: agregado.mediana!.toFixed(3),
            oddMedia: agregado.media!.toFixed(3),
            qtdCasas: agregado.qtd,
            calculadoEm: agora,
          },
        })
    }
  }

  return resultado
}
