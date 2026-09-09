import Link from 'next/link'

import { MolduraConta } from '@/components/conta/MolduraConta'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { FormularioCadastro } from './formulario'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Criar conta' }

export default function PaginaCadastro() {
  const config = configuracaoProdutoPago()
  return (
    <MolduraConta
      titulo="Crie sua conta"
      descricao="A contratação acontece no ambiente seguro do Mercado Pago. O acesso só é liberado depois da confirmação do pagamento."
    >
      {config.cadastroPublicoHabilitado ? (
        <FormularioCadastro />
      ) : (
        <p style={{ margin: 0 }}>
          Novos cadastros ainda não estão abertos. Se você já tem conta,{' '}
          <Link href="/entrar">entre aqui</Link>.
        </p>
      )}
    </MolduraConta>
  )
}
