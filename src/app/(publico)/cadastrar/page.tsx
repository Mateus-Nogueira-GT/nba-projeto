import Link from 'next/link'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { LayoutAcesso } from '@/features/publico/LayoutAcesso'
import { FormularioCadastro } from '@/features/publico/FormularioCadastro'
import f from '@/features/publico/Formulario.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Criar conta' }

export default function PaginaCadastro() {
  const config = configuracaoProdutoPago()
  return (
    <LayoutAcesso
      titulo="Crie sua conta"
      subtitulo="A contratação acontece no ambiente seguro do Mercado Pago. O acesso é liberado depois da confirmação do pagamento."
    >
      {config.cadastroPublicoHabilitado ? (
        <FormularioCadastro />
      ) : (
        <p className={f.aviso} role="status" style={{ color: 'var(--texto-2)', background: 'var(--campo)', borderColor: 'var(--borda-forte)' }}>
          Novos cadastros ainda não estão abertos.
        </p>
      )}
      <p className={f.rodape}>
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </p>
    </LayoutAcesso>
  )
}
