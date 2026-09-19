import type { ConfigTemporada } from '../dominio/temporada'
import { somarDias } from '../dominio/rodada'
import type { Db } from '../dominio/db/tipos'
import { telaDaClassificacao } from './estatisticas/time'
import {
  diasDaTemporada,
  recapDaNoite,
  taxaDaTemporada,
  ultimaRodadaConferida,
  type TaxaDaTemporada,
} from './resultados'

/** Quantos times a lateral mostra por conferência. Não é regra — é o que cabe. */
const LINHAS_POR_CONFERENCIA = 8

/** Uma linha da classificação, enxuta para os 320 px da lateral. */
export type LinhaCompacta = {
  timeId: string
  sigla: string
  nome: string
  posicao: number | null
  vitorias: number
  derrotas: number
  aproveitamento: number | null
}

export type DadosDaLateral = {
  /**
   * A ÚLTIMA NOITE CONFERIDA — não "ontem". Uma rodada pode não ter tido jogo,
   * e "ontem" mostraria a lateral vazia num dia em que há resultado a contar.
   * `null` quando a temporada ainda não conferiu nenhuma noite.
   */
  noite: {
    data: string
    publicados: number
    conferidos: number
    bateram: number
    /** `null` enquanto a noite não terminou — nunca uma taxa parcial. */
    taxa: number | null
    noiteEncerrada: boolean
  } | null
  temporada: TaxaDaTemporada | null
  classificacao: {
    temporada: string
    /** O rótulo vem do provedor (o app nunca carimba "Leste" por conta própria). */
    conferencias: { conferencia: string; linhas: LinhaCompacta[] }[]
  }
}

/**
 * O QUE A LATERAL DIREITA MOSTRA (identidade 05, §7).
 *
 * Duas leituras: o recap da última noite conferida (com a taxa da temporada) e
 * a classificação por conferência. Só DADO GRÁTIS — Resultados e classificação
 * são abertos a todos os níveis (spec de planos, §5), e é por isso que esta
 * leitura pode ser cacheada por dia em vez de repetida por usuário. Nada de
 * feed, apito, nível ou confiança passa por aqui.
 *
 * Função pura de I/O de leitura: recebe o banco e as datas, não consulta
 * relógio nem sessão. Quem decide o "hoje" é a tela.
 */
export async function lerLateral(
  db: Db,
  opcoes: { hoje: string; temporada: string; config: ConfigTemporada; linhas?: number },
): Promise<DadosDaLateral> {
  const corte = opcoes.linhas ?? LINHAS_POR_CONFERENCIA
  const data = await ultimaRodadaConferida(db, opcoes.hoje)

  const [recap, taxa, classificacao] = await Promise.all([
    data ? recapDaNoite(db, data) : Promise.resolve(null),
    // `ate` é EXCLUSIVO na entrega: +1 dia para a noite em tela entrar na conta.
    data
      ? taxaDaTemporada(db, somarDias(data, 1), diasDaTemporada(data, opcoes.config))
      : Promise.resolve(null),
    telaDaClassificacao(db, opcoes.temporada),
  ])

  // Time sem conferência no cadastro fica FORA da lateral, não num grupo
  // "sem conferência": a coluna tem 320 px e duas abas, e um terceiro grupo
  // com rótulo de exceção pertence à tela cheia de Estatísticas, que já o tem.
  const conferencias = [...new Set(classificacao.linhas.map((l) => l.conferencia))]
    .filter((c): c is string => c !== null)
    .sort((a, b) => a.localeCompare(b))
    .map((conferencia) => ({
      conferencia,
      linhas: classificacao.linhas
        .filter((l) => l.conferencia === conferencia)
        .sort((a, b) => (a.posicao ?? Infinity) - (b.posicao ?? Infinity))
        .slice(0, corte)
        .map(
          ({ timeId, sigla, nome, posicao, vitorias, derrotas, aproveitamento }): LinhaCompacta => ({
            timeId,
            sigla,
            nome,
            posicao,
            vitorias,
            derrotas,
            aproveitamento,
          }),
        ),
    }))

  return {
    noite:
      recap && data
        ? {
            data,
            publicados: recap.publicados,
            conferidos: recap.conferidos,
            bateram: recap.bateram,
            // A tela de Resultados já faz isso; a lateral não pode fazer
            // diferente e vender uma parcial como resultado da noite.
            taxa: recap.noiteEncerrada ? recap.taxa : null,
            noiteEncerrada: recap.noiteEncerrada,
          }
        : null,
    temporada: taxa,
    classificacao: { temporada: opcoes.temporada, conferencias },
  }
}
