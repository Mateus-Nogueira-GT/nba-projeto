import { notFound } from 'next/navigation'
import { z } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset } from '@/modules/dominio/temporada'
import { buscar, type ResultadoBusca } from '@/modules/entrega/estatisticas/busca'
import { confrontosEntre, type Confrontos } from '@/modules/entrega/estatisticas/confrontos'
import { telaDoJogador, type TelaJogador } from '@/modules/entrega/estatisticas/jogador'
import {
  contextoEstatisticas,
  rotaDaComparacao,
  type ContextoEstatisticas,
  type TipoDaComparacao,
} from '@/modules/entrega/estatisticas/rotas'
import { intervaloDaTemporada } from '@/modules/entrega/estatisticas/temporadas'
import { telaDoTime, type BoxScoreDoJogo, type TelaTime } from '@/modules/entrega/estatisticas/time'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirCookieDeSessao, exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { temporadaDasEstatisticas, type TemporadaDasEstatisticas } from './temporada'

type Params = Record<string, string | string[] | undefined>

export type MediasDoTime = {
  /** Quantos jogos ENCERRADOS, com box, entraram nas médias. A tela anuncia. */
  jogos: number
  pontosMarcados: number | null
  pontosCedidos: number | null
  rebotes: number | null
  assistencias: number | null
  tresTentadas: number | null
  tresConvertidas: number | null
  erros: number | null
}
export type LadoJogador = { tela: TelaJogador }
export type LadoTime = { tela: TelaTime; medias: MediasDoTime }

type Base = {
  temporada: string
  seletor: TemporadaDasEstatisticas
  fuso: string
  /** O fuso da RODADA: a DATA de um jogo é a da rodada; só a hora sai em `fuso`. */
  fusoDia: string
  agora: Date
  /**
   * O período que veio na URL (só para jogadores), para os links da tela o
   * preservarem. Sem ele na URL, nenhum link o inventa.
   */
  periodo: ContextoEstatisticas['periodo'] | undefined
}
export type DadosDaComparacao =
  | (Base & {
      modo: 'escolha'
      tipo: TipoDaComparacao
      a: LadoJogador | LadoTime
      termo: string
      resultados: ResultadoBusca[]
    })
  | (Base & {
      modo: 'comparacao'
      tipo: 'jogador'
      a: LadoJogador
      b: LadoJogador
      contexto: ContextoEstatisticas
      profundidade: boolean
    })
  | (Base & {
      modo: 'comparacao'
      tipo: 'time'
      a: LadoTime
      b: LadoTime
      confrontos: Confrontos
      profundidade: boolean
    })

/**
 * Média por jogo dos jogos ENCERRADOS com box, dentro do recorte que
 * `telaDoTime` já trouxe (sem consulta nova). Jogo ao vivo tem box parcial:
 * entrar na média puxaria pontos marcados e cedidos para baixo.
 * Pura: a tela e o teste a chamam sem banco.
 */
export function mediasDoTime(jogos: BoxScoreDoJogo[]): MediasDoTime {
  const comBox = jogos.filter((j) => j.resultado !== null && j.nosso !== null && j.deles !== null)
  const media = (f: (j: BoxScoreDoJogo) => number | null): number | null => {
    const valores = comBox.map(f).filter((v): v is number => v !== null)
    return valores.length === 0 ? null : valores.reduce((t, v) => t + v, 0) / valores.length
  }
  return {
    jogos: comBox.length,
    pontosMarcados: media((j) => j.nosso!.total),
    pontosCedidos: media((j) => j.deles!.total),
    rebotes: media((j) => j.rebotesTotal),
    assistencias: media((j) => j.assistencias),
    tresTentadas: media((j) => j.tresTentadas),
    tresConvertidas: media((j) => j.tresConvertidas),
    erros: media((j) => j.turnovers),
  }
}

const primeiro = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

/**
 * Portões na ordem das páginas: tipo e UUIDs → cookie → banco (404) → nível.
 * `a === b` é 404: comparar algo consigo mesmo não é uma tela.
 */
export async function carregarComparacao(params: Params): Promise<DadosDaComparacao> {
  const tipo = primeiro(params.tipo)
  if (tipo !== 'jogador' && tipo !== 'time') notFound()
  const a = primeiro(params.a)
  const b = primeiro(params.b)
  if (!a || !z.uuid().safeParse(a).success) notFound()
  if (b !== undefined && (!z.uuid().safeParse(b).success || b === a)) notFound()
  // A rota de volta (login) leva o período e a temporada que vieram: quem
  // entra pelo link compartilhado volta exatamente para a mesma tela.
  const periodoPedido =
    tipo === 'jogador' ? (['5', '10', 'temporada'] as const).find((p) => p === primeiro(params.periodo)) : undefined
  const temporadaPedida = primeiro(params.temporada)
  const rota = rotaDaComparacao(tipo, a, b, {
    ...(periodoPedido ? { periodo: periodoPedido } : {}),
    ...(temporadaPedida ? { temporada: temporadaPedida } : {}),
  })
  await exigirCookieDeSessao(rota)

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const db = getDb()
  const calendario = calendarioDoRuleset(ruleset)
  const seletor = await temporadaDasEstatisticas(params, ruleset, agora)
  const { temporada } = seletor
  const { temporada: _crua, ...semTemporada } = contextoEstatisticas(params)
  const contexto = seletor.escolhida ? { ...semTemporada, temporada: seletor.escolhida } : semTemporada
  const periodo = seletor.anterior ? intervaloDaTemporada(temporada, calendario) : undefined
  const base = {
    temporada,
    seletor,
    fuso: ruleset.rodada.fuso_exibicao,
    fusoDia: ruleset.rodada.fuso,
    agora,
    periodo: periodoPedido,
  }

  const lado = async (id: string): Promise<LadoJogador | LadoTime> => {
    if (tipo === 'jogador') {
      const tela = await telaDoJogador(db, id, { temporada, calendario, periodo: contexto.periodo })
      if (tela === null) notFound()
      return { tela }
    }
    const tela = await telaDoTime(db, id, periodo ? { temporada, periodo } : { temporada })
    if (tela === null) notFound()
    return { tela, medias: mediasDoTime(tela.jogosDoTime) }
  }

  if (b === undefined) {
    const ladoA = await lado(a)
    const termo = (primeiro(params.q) ?? '').trim()
    await exigirNivel('GRATIS', rota)
    const resultados =
      termo.length > 0 ? await buscar(db, termo, { apenas: tipo === 'jogador' ? 'JOGADOR' : 'TIME', limite: 8 }) : []
    return { ...base, modo: 'escolha', tipo, a: ladoA, termo, resultados: resultados.filter((r) => r.id !== a) }
  }

  const [ladoA, ladoB] = await Promise.all([lado(a), lado(b)])
  const { acesso } = await exigirNivel('GRATIS', rota)
  const profundidade = seletor.anterior || atende(acesso.nivel, 'MVP')

  if (tipo === 'jogador') {
    return { ...base, modo: 'comparacao', tipo, a: ladoA as LadoJogador, b: ladoB as LadoJogador, contexto, profundidade }
  }
  const intervalo = periodo ?? intervaloDaTemporada(temporada, calendario)
  const confrontos = profundidade
    ? await confrontosEntre(db, a, b, intervalo)
    : { jogos: [], vitoriasA: 0, vitoriasB: 0 }
  return { ...base, modo: 'comparacao', tipo, a: ladoA as LadoTime, b: ladoB as LadoTime, confrontos, profundidade }
}
