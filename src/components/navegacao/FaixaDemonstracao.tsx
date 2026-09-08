import type { ReactElement } from 'react'

import { semantico } from '@/design-system/tokens/semantico'
import { autossemeaduraHabilitada } from '@/modules/ingestao/demo/autossemeadura'

/**
 * FAIXA DE DEMONSTRAÇÃO — o selo que responde antes de alguém perguntar.
 *
 * A temporada simulada dá ao app um rótulo "2025-26" e uma taxa de acerto em
 * Resultados que são consequência das regras do CJ, não roteiro — mas continuam
 * saindo de jogos sorteados. Quem abre a tela não tem como saber disso, e o
 * número da taxa de acerto é exatamente o que um cliente leva a sério. Por isso
 * a faixa aparece em TODA tela (ela mora no layout raiz), Resultados incluída.
 *
 * A guarda é a MESMA do cron de autossemeadura, e de propósito: a faixa e o
 * dado fictício ligam e desligam juntos, num interruptor só. O dia em que a
 * ingestão real assumir, o runbook desliga `DEMO_AUTOSSEMEADURA` e a faixa some
 * junto com a demo — nunca sobra avisando "simulado" sobre dado de verdade,
 * nem some deixando o dado fictício sem aviso.
 *
 * Componente de servidor: sem estado, sem hook. `env` é parâmetro (com
 * `process.env` como padrão) para o teste poder exercitar as duas pontas da
 * guarda sem mexer no ambiente do processo.
 *
 * O visual definitivo é assunto da fase de UX (ver a spec da temporada
 * simulada, §5). Aqui entra a informação e a regra de quando ela aparece: uma
 * linha fina no fluxo normal, acima de tudo, sem `position: fixed` — ela não
 * pode cobrir conteúdo nem competir com a barra de abas.
 */
export function FaixaDemonstracao({
  env = process.env,
}: {
  env?: Record<string, string | undefined>
}): ReactElement | null {
  if (!autossemeaduraHabilitada(env)) return null

  return (
    <div
      role="note"
      style={{
        background: semantico.superficieElevada,
        color: semantico.textoSecundario,
        borderBottom: `1px solid ${semantico.divisor}`,
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        lineHeight: 1.5,
        letterSpacing: 1,
        textTransform: 'uppercase',
        textAlign: 'center',
        // O topo recua a área segura porque o PWA é `standalone` com a barra
        // de status translúcida e `viewportFit: 'cover'` (layout raiz): o body
        // começa em y=0, por baixo do relógio. A faixa é o primeiro elemento
        // pintado e mede ~27px — menos que a barra de status de um iPhone com
        // notch, ou seja, sem o recuo o aviso some INTEIRO justamente no
        // aparelho-alvo. É o remédio que a BarraInferior já usa no outro
        // extremo; o `0px` de padrão zera o recuo onde não há área segura.
        padding: 'calc(4px + env(safe-area-inset-top, 0px)) 12px 4px',
      }}
    >
      Temporada demonstrativa · dados simulados
    </div>
  )
}
