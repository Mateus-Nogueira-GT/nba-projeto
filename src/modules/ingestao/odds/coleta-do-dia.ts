import { and, eq } from 'drizzle-orm'

import { mapaMercados } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo } from '../../motor/tipos'
import { autenticarAltenar, casasAltenar, censoAltenar, eventosDoDiaAltenar } from './altenar'
import { casasBetmgm, censoBetmgm, eventosDoDiaBetmgm } from './betmgm'
import { agregarOddsDoDia, coletarOdds, garantirCasa } from './coletar'
import type { FonteOdds, NomeDeFonte } from './fontes'
import type { CasaDeAposta, CensoDaCasa, EventoDaCasa } from './porta'
import { casasSuperbet, censoSuperbet, eventosDoDiaSuperbet } from './superbet'
import { comTimeout } from './transporte'
import { vincularEventosDoDia } from './vinculo-eventos'

/**
 * A COLETA DO DIA — orquestração fina: nenhuma regra nova, só a ordem em que
 * as peças se ligam, por fonte ativa.
 *
 *   eventos do dia → vínculo evento↔jogo → coletarOdds (snapshot; a
 *   semeadura dos nomes acontece dentro dela, a partir das próprias cotações)
 *   → depois de TODAS as fontes, a agregação do dia sobre o snapshot
 *
 * A agregação fica por último de propósito: cada fonte é UMA casa, e a média
 * entre casas só existe olhando todas juntas (`agregarOddsDoDia`).
 *
 * UMA FONTE COM ERRO NÃO DERRUBA AS OUTRAS nem o resto do cron: o erro vira
 * uma linha em `erros`, um contador e `falhas_fontes` — a chave que o job já
 * usa para marcar a execução como PARCIAL. E a próxima execução tenta de novo.
 */

export type TransportesDeOdds = Partial<Record<NomeDeFonte, typeof fetch>>

export type ResultadoColetaDoDia = {
  /** Achatado em números, snake_case, para caber nas contagens do job. */
  contagens: Record<string, number>
  erros: { fonte: string; mensagem: string }[]
}

export type OpcoesColetaDoDia = {
  transportes?: TransportesDeOdds
  /** Fonte que começaria depois deste instante é pulada e contada — o cron tem teto. */
  prazo?: Date
  relogio?: () => Date
  timeoutMs?: number
}

/** O mapa de mercados CONFIRMADO da casa — nada fora dele vira cotação. */
async function atributoPorMercado(
  db: Db,
  casaId: string,
): Promise<(nomeMercado: string) => Atributo | undefined> {
  const linhas = await db
    .select({ nome: mapaMercados.nomeMercadoNaCasa, atributo: mapaMercados.atributo })
    .from(mapaMercados)
    .where(and(eq(mapaMercados.casaId, casaId), eq(mapaMercados.confirmado, true)))
  const mapa = new Map(linhas.map((l) => [l.nome, l.atributo]))
  return (nomeMercado: string) => mapa.get(nomeMercado)
}

export type PecasDaFonte = {
  eventos: EventoDaCasa[]
  censo: (eventoIdExterno: string) => Promise<CensoDaCasa>
  fabricaCasas: (
    eventoIdExterno: string,
    atributoDoMercado: (nomeMercado: string) => Atributo | undefined,
  ) => Promise<CasaDeAposta[]>
}

/**
 * Autentica (quando a casa exige), busca os eventos do dia e devolve as
 * operações da fonte. É o ÚNICO lugar que sabe "como falar com cada casa" —
 * o censo da linha de comando usa o mesmo. Fonte nova sem braço aqui é erro
 * de compilação, não fall-through silencioso para a BetMGM.
 */
export async function prepararFonte(
  fonte: FonteOdds,
  dia: string,
  buscar: typeof fetch = fetch,
): Promise<PecasDaFonte> {
  switch (fonte.nome) {
    case 'altenar': {
      const token = await autenticarAltenar(fonte.config, buscar)
      return {
        eventos: await eventosDoDiaAltenar(fonte.config, token, dia, buscar),
        censo: (id) => censoAltenar(fonte.config, token, id, buscar),
        fabricaCasas: (id, atributoDoMercado) =>
          casasAltenar(fonte.config, token, id, atributoDoMercado, buscar),
      }
    }
    case 'betmgm':
      return {
        eventos: await eventosDoDiaBetmgm(fonte.config, buscar),
        censo: (id) => censoBetmgm(fonte.config, id, buscar),
        fabricaCasas: (id, atributoDoMercado) =>
          casasBetmgm(fonte.config, id, atributoDoMercado, buscar),
      }
    case 'superbet':
      return {
        eventos: await eventosDoDiaSuperbet(fonte.config, dia, buscar),
        censo: (id) => censoSuperbet(fonte.config, id, buscar),
        fabricaCasas: (id, atributoDoMercado) =>
          casasSuperbet(fonte.config, id, atributoDoMercado, buscar),
      }
    default: {
      const nunca: never = fonte
      throw new Error(`fonte de odds desconhecida: ${JSON.stringify(nunca)}`)
    }
  }
}

const snake = (chave: string) => chave.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)

export async function coletarOddsDoDia(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
  agora: Date,
  fontes: FonteOdds[],
  opcoes: OpcoesColetaDoDia = {},
): Promise<ResultadoColetaDoDia> {
  const contagens: Record<string, number> = {}
  const erros: { fonte: string; mensagem: string }[] = []
  const relogio = opcoes.relogio ?? (() => new Date())
  let falhas = 0

  const registrar = (prefixo: string, valores: Record<string, number>) => {
    for (const [chave, valor] of Object.entries(valores)) contagens[`${prefixo}_${snake(chave)}`] = valor
  }

  for (const fonte of fontes) {
    const prefixo = `odds_${fonte.nome}`
    if (opcoes.prazo && relogio() > opcoes.prazo) {
      contagens[`${prefixo}_prazo_esgotado`] = 1
      continue
    }
    try {
      const buscar = comTimeout(opcoes.transportes?.[fonte.nome] ?? fetch, opcoes.timeoutMs)
      // A casa responde ANTES de ganhar linha em `casas`: fonte que falha todo
      // dia na autenticação não vira casa "ativa" sem nunca ter cotado nada.
      const pecas = await prepararFonte(fonte, dataReferencia, buscar)
      const casaId = await garantirCasa(db, fonte.nome, fonte.nome)
      const atributoDoMercado = await atributoPorMercado(db, casaId)

      const vinculo = await vincularEventosDoDia(
        db,
        fonte.nome,
        dataReferencia,
        pecas.eventos,
        ruleset.rodada.fuso,
      )
      registrar(prefixo, {
        vinculados: vinculo.vinculados,
        semPar: vinculo.semPar,
        ambiguos: vinculo.ambiguos,
        foraDoDia: vinculo.foraDoDia,
      })

      const coleta = await coletarOdds(
        db,
        (id) => pecas.fabricaCasas(id, atributoDoMercado),
        fonte.nome,
        dataReferencia,
        agora,
        ruleset,
        { agregar: false },
      )
      // agregadas/abaixoDoMinimo são do DIA, não da fonte — ficam de fora aqui.
      const { agregadas: _a, abaixoDoMinimo: _b, ...daFonte } = coleta
      registrar(prefixo, daFonte)
    } catch (erro) {
      // A fonte caiu. O cron segue: as outras fontes e a sincronização da
      // rodada não têm nada a ver com o gateway desta casa.
      contagens[`${prefixo}_erro`] = 1
      falhas += 1
      erros.push({ fonte: fonte.nome, mensagem: erro instanceof Error ? erro.message : String(erro) })
    }
  }

  if (fontes.length > 0) {
    const dia = await agregarOddsDoDia(db, dataReferencia, agora, ruleset)
    contagens.odds_agregadas = dia.agregadas
    contagens.odds_abaixo_do_minimo = dia.abaixoDoMinimo
  }
  if (falhas > 0) contagens.falhas_fontes = falhas

  return { contagens, erros }
}
