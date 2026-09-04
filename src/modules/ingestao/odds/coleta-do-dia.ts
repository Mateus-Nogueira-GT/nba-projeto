import { and, eq } from 'drizzle-orm'

import { mapaMercados } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo } from '../../motor/tipos'
import { autenticarAltenar, casasAltenar, censoAltenar, eventosDoDiaAltenar } from './altenar'
import { casasBetmgm, censoBetmgm, eventosDoDiaBetmgm } from './betmgm'
import { coletarOdds, garantirCasa } from './coletar'
import type { FonteOdds } from './fontes'
import type { CasaDeAposta, CensoDaCasa } from './porta'
import { vincularEventosDoDia, type EventoDaCasa } from './vinculo-eventos'
import { semearVinculosDeJogador } from './vinculo-jogadores'

/**
 * A COLETA DO DIA — orquestração fina: nenhuma regra nova, só a ordem em que
 * as peças se ligam, por fonte ativa.
 *
 *   eventos do dia → vínculo evento↔jogo → censo de nomes → semeadura do
 *   vínculo jogador↔casa → coletarOdds (snapshot + agregada)
 *
 * O censo entra ANTES da coleta de propósito: sem os nomes semeados, a
 * primeira noite de uma casa nova resolveria zero cotação e a média do card
 * ficaria vazia sem ninguém saber por quê.
 *
 * UMA FONTE COM ERRO NÃO DERRUBA AS OUTRAS nem o resto do cron: o erro vira
 * uma linha em `erros` e um contador, e a execução seguinte tenta de novo.
 */

export type TransportesDeOdds = Partial<Record<FonteOdds['nome'], typeof fetch>>

export type ResultadoColetaDoDia = {
  /** Achatado em números para caber nas contagens do job. */
  contagens: Record<string, number>
  erros: { fonte: string; mensagem: string }[]
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

type PecasDaFonte = {
  eventos: EventoDaCasa[]
  censo: (eventoIdExterno: string) => Promise<CensoDaCasa>
  fabricaCasas: (eventoIdExterno: string) => Promise<CasaDeAposta[]>
}

/** Autentica (quando a casa exige) e devolve as três operações da fonte. */
async function prepararFonte(
  fonte: FonteOdds,
  dia: string,
  buscar: typeof fetch,
  atributoDoMercado: (nomeMercado: string) => Atributo | undefined,
): Promise<PecasDaFonte> {
  if (fonte.nome === 'altenar') {
    const token = await autenticarAltenar(fonte.config, buscar)
    return {
      eventos: await eventosDoDiaAltenar(fonte.config, token, dia, buscar),
      censo: (id) => censoAltenar(fonte.config, token, id, buscar),
      fabricaCasas: (id) => casasAltenar(fonte.config, token, atributoDoMercado, buscar, id),
    }
  }
  return {
    eventos: await eventosDoDiaBetmgm(fonte.config, dia, buscar),
    censo: (id) => censoBetmgm(fonte.config, id, buscar),
    fabricaCasas: (id) => casasBetmgm(fonte.config, atributoDoMercado, buscar, id),
  }
}

export async function coletarOddsDoDia(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
  agora: Date,
  fontes: FonteOdds[],
  transportes: TransportesDeOdds = {},
): Promise<ResultadoColetaDoDia> {
  const contagens: Record<string, number> = {}
  const erros: { fonte: string; mensagem: string }[] = []

  for (const fonte of fontes) {
    const prefixo = `odds_${fonte.nome}`
    try {
      const buscar = transportes[fonte.nome] ?? fetch
      const casaId = await garantirCasa(db, fonte.nome, fonte.nome)
      const atributoDoMercado = await atributoPorMercado(db, casaId)
      const pecas = await prepararFonte(fonte, dataReferencia, buscar, atributoDoMercado)

      const vinculo = await vincularEventosDoDia(db, fonte.nome, dataReferencia, pecas.eventos)
      contagens[`${prefixo}_vinculados`] = vinculo.vinculados
      contagens[`${prefixo}_sem_par`] = vinculo.semPar
      contagens[`${prefixo}_ambiguos`] = vinculo.ambiguos

      const nomes = new Set<string>()
      for (const par of vinculo.pares) {
        const censo = await pecas.censo(par.idExterno)
        for (const nome of censo.jogadores) nomes.add(nome)
      }
      const semeadura = await semearVinculosDeJogador(db, casaId, [...nomes])
      contagens[`${prefixo}_jogadores_confirmados`] = semeadura.confirmados
      contagens[`${prefixo}_jogadores_pendentes`] = semeadura.pendentes

      const coleta = await coletarOdds(
        db,
        pecas.fabricaCasas,
        fonte.nome,
        dataReferencia,
        agora,
        ruleset,
      )
      for (const [chave, valor] of Object.entries(coleta)) {
        contagens[`${prefixo}_${chave}`] = valor
      }
    } catch (erro) {
      // A fonte caiu. O cron segue: as outras fontes e a sincronização da
      // rodada não têm nada a ver com o gateway desta casa.
      contagens[`${prefixo}_erro`] = 1
      erros.push({ fonte: fonte.nome, mensagem: erro instanceof Error ? erro.message : String(erro) })
    }
  }

  return { contagens, erros }
}
