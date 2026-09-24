import { Painel } from '@/features/shell/Painel'
import { ResumoDaRodada } from '@/features/lista/ResumoDaRodada'

export const dynamic = 'force-dynamic'

/** Em `/`, com nada aberto, a coluna da direita é o resumo da rodada. */
export default function PainelDaLista() {
  return (
    <Painel modo="resumo" rota="/" rotulo="Resumo da rodada">
      <ResumoDaRodada />
    </Painel>
  )
}
