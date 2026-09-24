import { redirect } from 'next/navigation'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { lerMetodologia } from '@/features/metodologia/carregar'
import { LeituraDaMetodologia } from '@/features/metodologia/Leitura'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Como funciona' }

/**
 * A metodologia como LEITURA. Exige sessão, não assinatura: quem ainda não
 * assinou precisa entender o produto para decidir. O mesmo texto aparece em
 * `/metodologia`, o portão de aceite.
 */
export default async function PaginaComoFunciona() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/como-funciona')
  return (
    <LeituraDaMetodologia
      sobrancelha="Metodologia NIP"
      titulo="Como funciona"
      introducao="As duas estratégias da metodologia NIP, o que cada cor significa e como ler as notas de confiança. Leia uma vez: depois a lista se explica sozinha."
      metodologia={await lerMetodologia()}
    />
  )
}
