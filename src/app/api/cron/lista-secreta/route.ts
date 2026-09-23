import { revalidateTag } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { publicarListaSecreta } from '@/modules/entrega/lista-secreta'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { portaLLMDoAmbiente } from '@/modules/ingestao/llm'
import { tagDoFeed } from '@/app/(app)/feed-cacheado'
import { contextoDoJob } from '@/modules/ingestao/jobs/contexto'
import { executarJobComLease } from '@/modules/ingestao/jobs/execucao'
import { coletarOddsDoDia } from '@/modules/ingestao/odds/coleta-do-dia'
import { fontesDeOdds } from '@/modules/ingestao/odds/fontes'

export const dynamic = 'force-dynamic'
// 300s, como os outros crons pesados (demo, sincronizar-elenco,
// reconciliar-pagamentos): a publicação agora enriquece com narrativa por
// item (uma chamada de LLM por entrada da lista), e um provedor lento
// consumindo 60s derrubaria a função antes de terminar. A publicação em si
// nunca depende disso — ver o comentário em `publicarListaSecreta` — mas o
// teto precisa sobrar para a etapa de enriquecimento também completar.
export const maxDuration = 300

/**
 * Mesmo orçamento de `sincronizar-rodada` (W2-4): a coleta de odds antes da
 * primeira publicação do dia roda sob o MESMO teto de função de 300s, e
 * precisa sobrar tempo para a publicação e a narrativa depois dela.
 */
const ORCAMENTO_ODDS_MS = 100_000

/**
 * Cron da Lista Secreta.
 *
 * O Vercel Cron só aceita expressão fixa, e "1h antes do primeiro jogo" é
 * horário móvel — muda a cada dia. Por isso o cron bate de 15 em 15 minutos e
 * QUEM decide é o job: enquanto faltar mais de uma hora, ele devolve
 * "ainda-cedo" e não escreve nada.
 *
 * O mesmo caminho serve ao reprocessamento: se a escalação mudou, o hash muda
 * e o snapshot é regravado; se não mudou, nada acontece.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/lista-secreta',
    tarefa: async () => {
      const agora = new Date()
      const ruleset = await rulesetAtivo()
      const dataReferencia = dataDeReferencia(agora, ruleset.rodada.fuso)

      const resultado = await publicarListaSecreta(getDb(), ruleset, {
        dataReferencia,
        agora,
        llm: portaLLMDoAmbiente(),
        // W2-1: invalida assim que o snapshot mudado é gravado. Se a função
        // LANÇAR nas narrativas, a invalidação abaixo não roda; esta sim — o
        // `executarCronProtegido` devolve 500 e o Next executa as tags
        // enfileiradas ao responder. Morte por `maxDuration` não responde, e
        // aí vale o `revalidate: 600` do feed (feed-cacheado.ts).
        aoGravarSnapshot: () => revalidateTag(tagDoFeed(dataReferencia), 'max'),
        // W2-4: uma coleta de odds extra, só antes da PRIMEIRA publicação do
        // dia (o gancho decide isso, não aqui). O cron de odds de 11:00 UTC
        // continua — isto cobre só a janela entre ele e a Lista sair à noite.
        antesDaPrimeiraPublicacao: async () => {
          const fontes = fontesDeOdds()
          if (fontes.length === 0) return
          const db = getDb()
          // `contextoDoJob` valida a config de ingestão NBA e pode lançar
          // (kill switch, env ausente); a chamada acontece DENTRO do gancho
          // de propósito — o `.catch` em `publicarListaSecreta` cobre isso, e
          // a publicação da Lista nunca fica presa a uma falha de ingestão.
          const contexto = await contextoDoJob(agora)
          await executarJobComLease(
            db,
            {
              job: 'coletar-odds',
              janelaInicio: dataReferencia,
              janelaFim: dataReferencia,
              temporada: contexto.temporada,
              origem: 'CRON',
              leaseMs: ORCAMENTO_ODDS_MS + 20_000,
            },
            async ({ confirmarLease }) => {
              await confirmarLease()
              return (
                await coletarOddsDoDia(db, ruleset, dataReferencia, agora, fontes, {
                  prazo: new Date(Date.now() + ORCAMENTO_ODDS_MS),
                })
              ).contagens
            },
          )
        },
      })

      // O feed em cache (W2-1) só sabe da publicação por aqui. Só invalida
      // quando algo mudou: o cron bate a cada 15 min e, sem mudança, a
      // invalidação só jogaria fora um cache bom.
      if (resultado.publicou && (resultado.mudou || (resultado.narrativas ?? 0) > 0)) {
        revalidateTag(tagDoFeed(dataReferencia), 'max')
      }

      return { dataReferencia, ...resultado }
    },
    quantidade: (resultado) => (resultado.publicou ? 1 : 0),
  })
}
