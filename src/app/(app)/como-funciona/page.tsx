import { redirect } from 'next/navigation'

import { ConteudoDaMetodologia, lerMetodologia } from '@/components/metodologia/Conteudo'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Como funciona' }

/**
 * A metodologia como LEITURA — o botão do cabeçalho da Lista e o Perfil trazem
 * para cá. O mesmo texto aparece em `/metodologia`, que é o portão de aceite;
 * o conteúdo mora num componente só, por isso.
 */
export default async function PaginaComoFunciona() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/como-funciona')

  const metodologia = await lerMetodologia()

  return (
    <Moldura aba={null}>
      <CabecalhoTela sobrancelha="METODOLOGIA NIP" titulo="COMO FUNCIONA" voltarHref="/" />
      <ConteudoDaMetodologia {...metodologia} />
    </Moldura>
  )
}
