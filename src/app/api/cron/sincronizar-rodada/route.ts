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
import { fontesDeOdds } from '@/modules/ingestao/odds/fontes'
import { montarFontes } from '@/modules/ingestao/sincronizar/fonte'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/sincronizar-rodada',
    tarefa: async () => {
      const contexto = await contextoDoJob()
      const fim = dataReferenciaNba(contexto.agora, contexto.ruleset.rodada.fuso)
      const inicio = deslocarData(fim, -contexto.config.sobreposicaoDias)
      const db = getDb()
      const fontes = montarFontes(db, contexto.config)
      return executarJobComLease(
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
          const contagens = await executarJobRodada(db, fontes, {
            dataReferencia: fim,
            sobreposicaoDias: contexto.config.sobreposicaoDias,
            temporada: contexto.temporada,
            agora: contexto.agora,
            janelaMedia: contexto.ruleset.media.janela,
            configTemporada: contexto.configTemporada,
          })

          // Odds das casas de mercado, DEPOIS da rodada — o vínculo evento↔jogo
          // precisa dos jogos do dia já sincronizados. Sem env de casa nenhuma,
          // `fontesDeOdds()` devolve lista vazia e este bloco é um no-op.
          const odds = await coletarOddsDoDia(
            db,
            contexto.ruleset,
            fim,
            contexto.agora,
            fontesDeOdds(),
          )
          for (const erro of odds.erros) {
            console.error(`[odds] fonte ${erro.fonte} falhou: ${erro.mensagem}`)
          }
          return { ...contagens, ...odds.contagens }
        },
      )
    },
    quantidade: (r) => (r.executado ? Object.values(r.resultado).reduce((a, b) => a + b, 0) : 0),
  })
}
