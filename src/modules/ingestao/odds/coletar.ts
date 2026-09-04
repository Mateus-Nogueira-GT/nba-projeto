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
import { normalizarTexto } from '../../dominio/texto'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo } from '../../motor/tipos'
import type { CasaDeAposta, CotacaoExterna } from './porta'
import { semearVinculosDeJogador, vinculosConfirmados } from './vinculo-jogadores'

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

/**
 * O cadastro da casa, idempotente. Exportado porque quem orquestra a coleta
 * precisa do `casaId` ANTES da coleta (para ler o mapa de mercados) — e duas
 * formas de criar a mesma casa seriam duas casas.
 */
export async function garantirCasa(db: Db, nome: string, tipoApi: string): Promise<string> {
  const [row] = await db
    .insert(casas)
    .values({ nome, tipoApi })
    .onConflictDoUpdate({ target: casas.nome, set: { ativa: true } })
    .returning()
  return row!.id
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
  /** Nomes de jogador que a semeadura resolveu sozinha (match único). */
  jogadoresConfirmados: number
  /** Nomes de jogador esperando curadoria no painel. */
  jogadoresPendentes: number
}

export type OpcoesColeta = {
  /**
   * `false` quando a agregação vai acontecer DEPOIS, sobre todas as fontes do
   * dia (`agregarOddsDoDia`). Uma coleta que só vê uma casa nunca chegaria a
   * `casas_minimas` — e a última fonte sobrescreveria a anterior.
   */
  agregar?: boolean
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
  opcoes: OpcoesColeta = {},
): Promise<ResultadoColeta> {
  const resultado: ResultadoColeta = {
    cotacoes: 0,
    agregadas: 0,
    descartadas: 0,
    semVinculo: 0,
    aguardandoCuradoria: 0,
    abaixoDoMinimo: 0,
    jogosComErro: 0,
    jogadoresConfirmados: 0,
    jogadoresPendentes: 0,
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

  const contexto: ContextoColeta = {
    db,
    agora,
    ruleset,
    agregar: opcoes.agregar !== false,
    jogadorPorIdExterno,
    casaIdPorNome: new Map(),
    vinculosPorCasa: new Map(),
    resultado,
  }

  for (const jogo of jogosDoDia) {
    try {
      await coletarJogo(contexto, jogo, fabricaCasas)
    } catch {
      resultado.jogosComErro += 1
    }
  }

  return resultado
}

type ContextoColeta = {
  db: Db
  agora: Date
  ruleset: Ruleset
  agregar: boolean
  jogadorPorIdExterno: Map<string, string>
  /** O cadastro de casas é resolvido UMA vez por nome — não por (jogo × vendor). */
  casaIdPorNome: Map<string, string>
  /** O mapa de nomes confirmados, UMA leitura por casa (recarregado só após semear). */
  vinculosPorCasa: Map<string, Map<string, string>>
  resultado: ResultadoColeta
}

async function resolverCasa(ctx: ContextoColeta, nome: string, provedor: string): Promise<string> {
  const cacheada = ctx.casaIdPorNome.get(nome)
  if (cacheada) return cacheada
  const id = await garantirCasa(ctx.db, nome, provedor)
  ctx.casaIdPorNome.set(nome, id)
  return id
}

/**
 * Nomes que chegaram SEM id de provedor são semeados aqui, na hora — a casa
 * acabou de dizer quem ela cota, e é a única fonte desses nomes. Depois de
 * semear, o mapa da casa é recarregado; sem nome novo, a leitura cacheada
 * serve.
 */
async function mapaDeNomes(
  ctx: ContextoColeta,
  casaNome: string,
  cotacoes: CotacaoExterna[],
): Promise<Map<string, string>> {
  const nomesSemId = [
    ...new Set(cotacoes.filter((c) => !c.jogadorIdExternoProvedor).map((c) => c.jogadorNomeNaCasa)),
  ]
  if (nomesSemId.length > 0) {
    const s = await semearVinculosDeJogador(ctx.db, casaNome, nomesSemId, ctx.agora)
    ctx.resultado.jogadoresConfirmados += s.confirmados
    ctx.resultado.jogadoresPendentes += s.pendentes
    ctx.vinculosPorCasa.set(casaNome, await vinculosConfirmados(ctx.db, casaNome))
  }
  const cacheado = ctx.vinculosPorCasa.get(casaNome)
  if (cacheado) return cacheado
  const lido = await vinculosConfirmados(ctx.db, casaNome)
  ctx.vinculosPorCasa.set(casaNome, lido)
  return lido
}

type ChaveDeMercado = { jogoId: string; jogadorId: string; atributo: Atributo; linha: string }

/** O upsert da agregada — o MESMO para a coleta de uma fonte e para o dia. */
async function gravarAgregada(
  db: Db,
  chave: ChaveDeMercado,
  agregado: ReturnType<typeof agregarCotacoes>,
  agora: Date,
): Promise<void> {
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
    .values({ ...chave, ...campos })
    .onConflictDoUpdate({
      target: [oddsAgregada.jogoId, oddsAgregada.jogadorId, oddsAgregada.atributo, oddsAgregada.linha],
      set: campos,
    })
}

async function coletarJogo(
  ctx: ContextoColeta,
  jogo: { jogoId: string; idExterno: string },
  fabricaCasas: (jogoIdExterno: string) => Promise<CasaDeAposta[]>,
): Promise<void> {
  const { db, agora, ruleset, resultado } = ctx
  const casasDoJogo = await fabricaCasas(jogo.idExterno)

  type CotacaoVinculada = CotacaoExterna & { jogadorId: string; casaNome: string }
  const porMercado = new Map<string, { chave: ChaveDeMercado; cotacoes: CotacaoVinculada[] }>()
  const linhasSnapshot: (typeof oddsSnapshot.$inferInsert)[] = []

  for (const casa of casasDoJogo) {
    const cotacoes = await casa.cotacoes(jogo.idExterno)
    resultado.descartadas += casa.descartadas?.() ?? 0
    const casaId = await resolverCasa(ctx, casa.nome, casa.nome)
    const porNome = await mapaDeNomes(ctx, casa.nome, cotacoes)

    for (const c of cotacoes) {
      if (c.atributo === undefined) {
        // Casa por nome, sem tradução na fronteira: espera a curadoria de
        // mapa_mercados — CONTADA, nunca silenciada.
        resultado.aguardandoCuradoria += 1
        continue
      }
      // DOIS caminhos de vínculo, e só dois: id externo quando a casa é
      // servida pelo provedor NBA (balldontlie); nome quando é casa de
      // mercado (BetMGM, Altenar). No caminho por nome SÓ vínculo CONFIRMADO
      // resolve — pendente de curadoria conta em semVinculo e aparece no job.
      const jogadorId = c.jogadorIdExternoProvedor
        ? ctx.jogadorPorIdExterno.get(c.jogadorIdExternoProvedor)
        : porNome.get(normalizarTexto(c.jogadorNomeNaCasa))
      if (!jogadorId) {
        resultado.semVinculo += 1
        continue
      }

      resultado.cotacoes += 1
      const linha = c.linha.toFixed(1)
      linhasSnapshot.push({
        casaId,
        jogoId: jogo.jogoId,
        jogadorId,
        atributo: c.atributo,
        linha,
        oddOver: c.oddOver === null ? null : c.oddOver.toFixed(3),
        oddUnder: c.oddUnder === null ? null : c.oddUnder.toFixed(3),
        capturadoEm: agora,
      })

      // Chave NORMALIZADA como a do banco — floats distintos que colapsam na
      // mesma linha decimal não podem virar dois grupos.
      const id = `${jogadorId}|${c.atributo}|${linha}`
      if (!porMercado.has(id)) {
        porMercado.set(id, {
          chave: { jogoId: jogo.jogoId, jogadorId, atributo: c.atributo, linha },
          cotacoes: [],
        })
      }
      porMercado.get(id)!.cotacoes.push({ ...c, jogadorId, casaNome: casa.nome })
    }
  }

  // Snapshot em UM insert por jogo (era um round-trip por cotação). A UNIQUE
  // com capturado_em torna o retry inofensivo: a série não ganha tique fantasma.
  if (linhasSnapshot.length > 0) {
    await db.insert(oddsSnapshot).values(linhasSnapshot).onConflictDoNothing()
  }

  if (!ctx.agregar) return

  for (const mercado of porMercado.values()) {
    const agregado = agregarCotacoes(mercado.cotacoes)
    // A regra vem do RULESET: abaixo do mínimo de casas distintas, a linha não
    // existe como 'CASAS' — a ausência é o fallback da tabela estática.
    if (agregado.qtdCasas < ruleset.odds.casas_minimas) {
      if (agregado.qtd > 0) resultado.abaixoDoMinimo += 1
      continue
    }
    resultado.agregadas += 1
    await gravarAgregada(db, mercado.chave, agregado, agora)
  }
}

/**
 * A AGREGAÇÃO DO DIA, sobre TODAS as casas que cotaram nesta execução.
 *
 * As fontes de mercado (BetMGM, Altenar) são coletadas uma por vez, cada uma
 * com uma casa só. Se cada coleta agregasse por conta própria, `qtdCasas`
 * seria sempre 1 — abaixo do `casas_minimas` homologado — e a "média entre
 * casas" do card nunca existiria. Aqui a média nasce do snapshot: tudo que
 * foi capturado no MESMO instante (`agora` da execução), agrupado por
 * (jogo, jogador, atributo, linha), com casas distintas contadas de verdade.
 */
export async function agregarOddsDoDia(
  db: Db,
  dataReferencia: string,
  agora: Date,
  ruleset: Ruleset,
): Promise<{ agregadas: number; abaixoDoMinimo: number }> {
  const capturadas = await db
    .select({
      jogoId: oddsSnapshot.jogoId,
      jogadorId: oddsSnapshot.jogadorId,
      atributo: oddsSnapshot.atributo,
      linha: oddsSnapshot.linha,
      casaId: oddsSnapshot.casaId,
      oddOver: oddsSnapshot.oddOver,
    })
    .from(oddsSnapshot)
    .innerJoin(jogos, eq(jogos.id, oddsSnapshot.jogoId))
    .where(and(eq(jogos.dataReferencia, dataReferencia), eq(oddsSnapshot.capturadoEm, agora)))

  const porMercado = new Map<
    string,
    { chave: ChaveDeMercado; cotacoes: { oddOver: number | null; casaNome: string }[] }
  >()
  for (const s of capturadas) {
    const id = `${s.jogoId}|${s.jogadorId}|${s.atributo}|${s.linha}`
    if (!porMercado.has(id)) {
      porMercado.set(id, {
        chave: { jogoId: s.jogoId, jogadorId: s.jogadorId, atributo: s.atributo, linha: s.linha },
        cotacoes: [],
      })
    }
    porMercado.get(id)!.cotacoes.push({
      oddOver: s.oddOver === null ? null : Number(s.oddOver),
      casaNome: s.casaId,
    })
  }

  let agregadas = 0
  let abaixoDoMinimo = 0
  for (const mercado of porMercado.values()) {
    const agregado = agregarCotacoes(mercado.cotacoes)
    if (agregado.qtdCasas < ruleset.odds.casas_minimas) {
      if (agregado.qtd > 0) abaixoDoMinimo += 1
      continue
    }
    agregadas += 1
    await gravarAgregada(db, mercado.chave, agregado, agora)
  }
  return { agregadas, abaixoDoMinimo }
}
