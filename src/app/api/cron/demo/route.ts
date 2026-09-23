import { getDb } from '@/modules/dominio/db/cliente'
import { executarCronProtegido } from '@/modules/entrega/cron/guarda'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import {
  autossemeaduraHabilitada,
  motivoParaNaoSemear,
} from '@/modules/ingestao/demo/autossemeadura'
import { simularAte } from '@/modules/ingestao/demo/temporada'
import { portaLLMDoAmbiente } from '@/modules/ingestao/llm'
import { revalidateTag } from 'next/cache'
import { TAG_LATERAL } from '@/app/(app)/lateral/leitura'
import { TAG_FEED } from '@/app/(app)/feed-cacheado'
import { TAG_RANKING } from '@/app/api/chat/ranking'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Folga de 60 s sobre o `maxDuration` para o resumo sair antes de a Vercel
 * cortar a função: `simularAte` só checa o orçamento ENTRE dias, então o
 * último dia começado ainda roda inteiro depois de o relógio estourar.
 */
const ORCAMENTO_MS = 240_000

/**
 * A TEMPORADA SIMULADA AVANÇA UM DIA.
 *
 * `simularAte` produz os dias que faltam entre o início da janela e hoje —
 * em regime normal só ontem — e depois monta a rodada de hoje. Se o cron
 * perdeu dias, produz o que couber no orçamento e continua na execução
 * seguinte (`diasRestantes` no resumo).
 *
 * A CARGA INICIAL DAS 7 SEMANAS NÃO É DAQUI. O bloco de hoje só nasce quando
 * o passado inteiro está no lugar (média com buraco não é a média que o motor
 * leria na véspera), então num banco vazio o cron levaria DIAS até abrir a
 * primeira rodada — um dia de janela por execução diária. A carga roda uma
 * vez, à mão, por `npm run demo:temporada`, sem orçamento. Ver o runbook de
 * deploy.
 *
 * Ocupa um dos DOIS crons diários que o plano Hobby permite (ADR-0003, nota de
 * 25/08). Só roda com `DEMO_AUTOSSEMEADURA=true`; sem a variável responde 200
 * com `executado: false` — pular não é falha, e um cron que grita todo dia
 * vira ruído que ninguém lê.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return executarCronProtegido(requisicao, {
    rota: '/api/cron/demo',
    tarefa: async () => {
      if (!autossemeaduraHabilitada(process.env)) {
        return { executado: false, motivo: 'DEMO_AUTOSSEMEADURA_DESLIGADA' as const }
      }
      // A variável sozinha não basta: com dado real no banco (ou a ingestão
      // real ligada), semear ficção por cima é o pior acidente possível aqui.
      const bloqueio = await motivoParaNaoSemear(getDb(), process.env)
      if (bloqueio) {
        console.warn(JSON.stringify({ evento: 'demo_recusada', motivo: bloqueio }))
        return { executado: false, motivo: bloqueio }
      }
      const ruleset = await rulesetAtivo()
      const resumo = await simularAte(getDb(), ruleset, new Date(), {
        // Só o dia de HOJE recebe a porta, e as duas publicações dele: a
        // narrativa nasce na transição de hash, e quem grava primeiro sem
        // porta fixa o hash sem texto.
        llm: portaLLMDoAmbiente(),
        orcamentoMs: ORCAMENTO_MS,
      })
      // A rodada simulada acabou de mudar jogos, box scores e classificação
      // — exatamente o que a lateral lê, cacheado por uma hora. Sem isto a
      // Lista mostrava a rodada nova e a lateral, a anterior.
      revalidateTag(TAG_LATERAL, 'max')
      // O ranking estatístico do assistente lê os mesmos box scores (ADR-0012):
      // a rodada que fecha muda a janela dos últimos dez de cada jogador.
      revalidateTag(TAG_RANKING, 'max')
      // A demo publica vários dias: a tag geral, e não uma por data.
      revalidateTag(TAG_FEED, 'max')
      return { executado: true, resumo }
    },
    /*
     * DIAS PRODUZIDOS, e não itens da lista.
     *
     * O resumo mistura duas contagens: `jogosCriados`, `boxScores` e
     * `publicacoes` são desta execução; `jogosHoje`, `itensListaSecreta`,
     * `apitosFireLive` e `linhasComOdd` são ESTADO da rodada de hoje e
     * repetem o mesmo número na segunda execução do dia. Num log de cron,
     * `quantidade` se lê como trabalho feito — só o que a execução produziu
     * pode ir aqui. Zero é a resposta certa para "não havia o que fazer".
     */
    quantidade: (resultado) =>
      'resumo' in resultado && resultado.resumo ? resultado.resumo.diasProduzidos : 0,
  })
}
