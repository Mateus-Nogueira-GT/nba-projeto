import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { contextoDoJob } from '@/modules/ingestao/jobs/contexto'
import { executarJobComLease } from '@/modules/ingestao/jobs/execucao'
import {
  dataReferenciaNba,
  deslocarData,
  executarJobRodada,
} from '@/modules/ingestao/jobs/orquestradores'
import { coletarOddsDoDia } from '@/modules/ingestao/odds/coleta-do-dia'
import { fontesDeOdds, fontesIncompletas } from '@/modules/ingestao/odds/fontes'
import { montarFontes } from '@/modules/ingestao/sincronizar/fonte'
import { revalidateTag } from 'next/cache'
import { TAG_LATERAL } from '@/app/(app)/lateral/leitura'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Quanto do orçamento de 300s da função a coleta de odds pode usar. A rodada
 * já rodou e já está gravada quando isso começa; o que sobrar para as odds é
 * o que sobrar — e a próxima execução completa o resto (tudo idempotente).
 */
const ORCAMENTO_ODDS_MS = 100_000
const TETO_DA_FUNCAO_MS = 250_000

/** Só o TRABALHO conta como quantidade; diagnóstico de odds é leitura, não volume. */
const CONTA_COMO_TRABALHO = (chave: string) =>
  !chave.startsWith('odds_') || /_cotacoes$/.test(chave) || chave === 'odds_agregadas'

export async function GET(requisicao: Request): Promise<Response> {
  const inicioDaFuncao = Date.now()
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/sincronizar-rodada',
    tarefa: async () => {
      const contexto = await contextoDoJob()
      const fim = dataReferenciaNba(contexto.agora, contexto.ruleset.rodada.fuso)
      const inicio = deslocarData(fim, -contexto.config.sobreposicaoDias)
      const db = getDb()
      const fontes = montarFontes(db, contexto.config)
      const rodada = await executarJobComLease(
        db,
        {
          job: 'sincronizar-rodada',
          janelaInicio: inicio,
          janelaFim: fim,
          temporada: contexto.temporada,
          origem: 'CRON',
          leaseMs: 240_000,
        },
        async ({ confirmarLease }) => {
          await confirmarLease()
          return executarJobRodada(db, fontes, {
            dataReferencia: fim,
            sobreposicaoDias: contexto.config.sobreposicaoDias,
            temporada: contexto.temporada,
            agora: contexto.agora,
            janelaMedia: contexto.ruleset.media.janela,
            configTemporada: contexto.configTemporada,
          })
        },
      )
      if (!rodada.executado) return rodada

      // A classificação e o box score da noite acabaram de mudar: a lateral
      // direita lê os dois e é cacheada por uma hora. Sem isto ela mostraria a
      // noite de anteontem por até 60 minutos depois de a de ontem fechar.
      revalidateTag(TAG_LATERAL, 'max')

      // Odds das casas de mercado, DEPOIS da rodada e sob LEASE PRÓPRIO: o
      // vínculo evento↔jogo precisa dos jogos do dia já sincronizados, e um
      // gateway lento não pode transformar uma rodada já gravada em FALHA.
      // Sem env de casa nenhuma, `fontesDeOdds()` é vazia e nada disto roda.
      for (const f of fontesIncompletas()) {
        console.warn(`[odds] fonte ${f.nome} com config incompleta (faltam ${f.faltam.join(', ')}) — desligada`)
      }
      const fontesDeCasas = fontesDeOdds()
      if (fontesDeCasas.length === 0) return rodada

      const odds = await executarJobComLease(
        db,
        {
          job: 'coletar-odds',
          janelaInicio: fim,
          janelaFim: fim,
          temporada: contexto.temporada,
          origem: 'CRON',
          leaseMs: ORCAMENTO_ODDS_MS + 20_000,
        },
        async ({ confirmarLease }) => {
          await confirmarLease()
          const prazo = new Date(
            Math.min(Date.now() + ORCAMENTO_ODDS_MS, inicioDaFuncao + TETO_DA_FUNCAO_MS),
          )
          const resultado = await coletarOddsDoDia(db, contexto.ruleset, fim, contexto.agora, fontesDeCasas, {
            prazo,
          })
          for (const erro of resultado.erros) {
            console.error(`[odds] fonte ${erro.fonte} falhou: ${erro.mensagem}`)
          }
          return resultado.contagens
        },
      )

      return {
        ...rodada,
        resultado: {
          ...rodada.resultado,
          ...(odds.executado ? odds.resultado : { odds_lock_ocupado: 1 }),
        },
      }
    },
    quantidade: (r) =>
      r.executado
        ? Object.entries(r.resultado)
            .filter(([chave]) => CONTA_COMO_TRABALHO(chave))
            .reduce((a, [, v]) => a + v, 0)
        : 0,
  })
}
