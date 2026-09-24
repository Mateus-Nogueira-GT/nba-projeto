import { autossemeaduraHabilitada } from '@/modules/ingestao/demo/autossemeadura'
import s from './FaixaDemonstracao.module.css'

/**
 * O SELO QUE RESPONDE ANTES DE ALGUÉM PERGUNTAR.
 *
 * A temporada simulada dá ao app um rótulo "2025-26" e uma taxa de acerto que
 * são consequência das regras do CJ, mas continuam saindo de jogos sorteados —
 * e o número da taxa é exatamente o que um cliente leva a sério. Por isso a
 * faixa mora no layout RAIZ e aparece em TODA tela, logada ou não: entrar,
 * cadastrar, redefinir e oferta também mostram números.
 *
 * A guarda é a MESMA do cron de autossemeadura, de propósito: a faixa e o dado
 * fictício ligam e desligam num interruptor só. Nunca sobra avisando
 * "simulado" sobre dado de verdade, nem some deixando o fictício sem aviso.
 *
 * `env` é parâmetro (com `process.env` de padrão) para o teste exercitar as
 * duas pontas da guarda sem mexer no ambiente do processo.
 */
export function FaixaDemonstracao({
  env = process.env,
}: {
  env?: Record<string, string | undefined>
}) {
  if (!autossemeaduraHabilitada(env)) return null

  return (
    <div role="note" className={s.faixa}>
      Temporada demonstrativa · dados simulados
    </div>
  )
}
