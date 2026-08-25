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
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo } from '../../motor/tipos'
import type { CasaDeAposta, CotacaoExterna } from './porta'

/**
 * A COLETA de odds — o elo que nunca existiu fora do seed: casas → snapshot
 * (série temporal, por casa) → agregada (o retrato por linha, com a MÉDIA
 * que o parceiro pediu no card).
 *
 * GOVERNADA PELO RULESET (regra 1 do projeto): `odds.casas_minimas` decide o
 * mínimo de casas DISTINTAS para uma agregada existir — abaixo disso a linha
 * NÃO vira 'CASAS', e a ausência é o fallback (a tabela estática das telas).
 *
 * ADR-0004: leitura de cotação pública. Nada aqui envia, autentica usuário
 * em casa ou movimenta dinheiro.
 */

/**
 * Média simples das decimais over — nulls não contam nem afundam.
 * `qtdCasas` conta CASAS DISTINTAS: uma casa cotando duas vezes não vira
 * "mercado com duas casas" (é o que `casas_minimas` existe para vigiar).
 */
export function agregarCotacoes(cotacoes: { oddOver: number | null; casaNome?: string }[]): {
  min: number | null
  max: number | null
  media: number | null
  mediana: number | null
  qtd: number
  qtdCasas: number
} {
  const validas = cotacoes.filter((c): c is { oddOver: number; casaNome?: string } => c.oddOver !== null)
  const valores = validas.map((c) => c.oddOver).sort((a, b) => a - b)
  if (valores.length === 0) {
    return { min: null, max: null, media: null, mediana: null, qtd: 0, qtdCasas: 0 }
  }

  const soma = valores.reduce((a, v) => a + v, 0)
  const meio = Math.floor(valores.length / 2)
  const mediana =
    valores.length % 2 === 1 ? valores[meio]! : (valores[meio - 1]! + valores[meio]!) / 2
  const casasDistintas = new Set(validas.map((c) => c.casaNome ?? '')).size

  return {
    min: valores[0]!,
    max: valores[valores.length - 1]!,
    media: Math.round((soma / valores.length) * 1000) / 1000,
    mediana: Math.round(mediana * 1000) / 1000,
    qtd: valores.length,
    qtdCasas: casasDistintas,
  }
}

export type ResultadoColeta = {
  cotacoes: number
  agregadas: number
  descartadas: number
  semVinculo: number
  /** Cotações sem atributo traduzido — casas por nome, à espera da curadoria. */
  aguardandoCuradoria: number
  /** Linhas cotadas por menos casas que `odds.casas_minimas` — caem no fallback. */
  abaixoDoMinimo: number
  /** Jogos cuja coleta falhou — os demais seguem; retry pega estes. */
  jogosComErro: number
}

/**
 * Coleta as odds dos jogos do dia. `fabricaCasas` recebe o id EXTERNO do jogo
 * no provedor e devolve as casas dele (no balldontlie, os 8 vendors saem de
 * uma chamada) — fixture e HTTP passam pela mesma fábrica.
 *
 * Um jogo que falha NÃO derruba os demais: conta em `jogosComErro` e a
 * reexecução (idempotente na agregada) completa o que faltou.
 */
export async function coletarOdds(
  db: Db,
  fabricaCasas: (jogoIdExterno: string) => Promise<CasaDeAposta[]>,
  provedor: string,
  dataReferencia: string,
  agora: Date,
  ruleset: Ruleset,
): Promise<ResultadoColeta> {
  const resultado: ResultadoColeta = {
    cotacoes: 0,
    agregadas: 0,
    descartadas: 0,
    semVinculo: 0,
    aguardandoCuradoria: 0,
    abaixoDoMinimo: 0,
    jogosComErro: 0,
  }

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

  // O cadastro de casas é resolvido UMA vez por nome — não por (jogo × vendor).
  const casaIdPorNome = new Map<string, string>()
  const resolverCasa = async (nome: string): Promise<string> => {
    const cacheada = casaIdPorNome.get(nome)
    if (cacheada) return cacheada
    const [row] = await db
      .insert(casas)
      .values({ nome, tipoApi: provedor })
      .onConflictDoUpdate({ target: casas.nome, set: { ativa: true } })
      .returning()
    casaIdPorNome.set(nome, row!.id)
    return row!.id
  }

  for (const jogo of jogosDoDia) {
    try {
      await coletarJogo(db, jogo, fabricaCasas, jogadorPorIdExterno, resolverCasa, agora, ruleset, resultado)
    } catch {
      resultado.jogosComErro += 1
    }
  }

  return resultado
}

async function coletarJogo(
  db: Db,
  jogo: { jogoId: string; idExterno: string },
  fabricaCasas: (jogoIdExterno: string) => Promise<CasaDeAposta[]>,
  jogadorPorIdExterno: Map<string, string>,
  resolverCasa: (nome: string) => Promise<string>,
  agora: Date,
  ruleset: Ruleset,
  resultado: ResultadoColeta,
): Promise<void> {
  const casasDoJogo = await fabricaCasas(jogo.idExterno)

  type CotacaoVinculada = CotacaoExterna & { jogadorId: string; casaNome: string }
  const porMercado = new Map<
    string,
    { jogadorId: string; atributo: Atributo; linha: number; cotacoes: CotacaoVinculada[] }
  >()
  const linhasSnapshot: (typeof oddsSnapshot.$inferInsert)[] = []

  for (const casa of casasDoJogo) {
    const cotacoes = await casa.cotacoes(jogo.idExterno)
    resultado.descartadas += casa.descartadas?.() ?? 0
    const casaId = await resolverCasa(casa.nome)

    for (const c of cotacoes) {
      if (c.atributo === undefined) {
        // Casa por nome, sem tradução na fronteira: espera a curadoria de
        // mapa_mercados — CONTADA, nunca silenciada.
        resultado.aguardandoCuradoria += 1
        continue
      }
      const jogadorId = c.jogadorIdExternoProvedor
        ? jogadorPorIdExterno.get(c.jogadorIdExternoProvedor)
        : undefined
      if (!jogadorId) {
        resultado.semVinculo += 1
        continue
      }

      resultado.cotacoes += 1
      linhasSnapshot.push({
        casaId,
        jogoId: jogo.jogoId,
        jogadorId,
        atributo: c.atributo,
        linha: c.linha.toFixed(1),
        oddOver: c.oddOver === null ? null : c.oddOver.toFixed(3),
        oddUnder: c.oddUnder === null ? null : c.oddUnder.toFixed(3),
        capturadoEm: agora,
      })

      // Chave NORMALIZADA como a do banco — floats distintos que colapsam na
      // mesma linha decimal não podem virar dois grupos.
      const chave = `${jogadorId}|${c.atributo}|${c.linha.toFixed(1)}`
      if (!porMercado.has(chave)) {
        porMercado.set(chave, { jogadorId, atributo: c.atributo, linha: c.linha, cotacoes: [] })
      }
      porMercado.get(chave)!.cotacoes.push({ ...c, jogadorId, casaNome: casa.nome })
    }
  }

  // Snapshot em UM insert por jogo (era um round-trip por cotação). A UNIQUE
  // com capturado_em torna o retry inofensivo: a série não ganha tique fantasma.
  if (linhasSnapshot.length > 0) {
    await db.insert(oddsSnapshot).values(linhasSnapshot).onConflictDoNothing()
  }

  for (const mercado of porMercado.values()) {
    const agregado = agregarCotacoes(mercado.cotacoes)
    // A regra vem do RULESET: abaixo do mínimo de casas distintas, a linha não
    // existe como 'CASAS' — a ausência é o fallback da tabela estática.
    if (agregado.qtdCasas < ruleset.odds.casas_minimas) {
      if (agregado.qtd > 0) resultado.abaixoDoMinimo += 1
      continue
    }
    resultado.agregadas += 1
    const campos = {
      oddMin: agregado.min!.toFixed(3),
      oddMax: agregado.max!.toFixed(3),
      oddMediana: agregado.mediana!.toFixed(3),
      oddMedia: agregado.media!.toFixed(3),
      qtdCasas: agregado.qtdCasas,
      origem: 'CASAS' as const,
      calculadoEm: agora,
    }
    await db
      .insert(oddsAgregada)
      .values({
        jogoId: jogo.jogoId,
        jogadorId: mercado.jogadorId,
        atributo: mercado.atributo,
        linha: mercado.linha.toFixed(1),
        ...campos,
      })
      .onConflictDoUpdate({
        target: [oddsAgregada.jogoId, oddsAgregada.jogadorId, oddsAgregada.atributo, oddsAgregada.linha],
        set: campos,
      })
  }
}
