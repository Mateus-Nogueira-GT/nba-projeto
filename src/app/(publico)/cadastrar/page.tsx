import Link from 'next/link'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { LayoutAcesso } from '@/features/publico/LayoutAcesso'
import { FormularioCadastro } from '@/features/publico/FormularioCadastro'
import { destinoSeguro, parametro } from '@/features/publico/destino'
import f from '@/features/publico/Formulario.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Criar conta' }

export default async function PaginaCadastro({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const config = configuracaoProdutoPago()
  // O convite de parceiro manda `?destino=` para a pessoa voltar a ele depois
  // de criar a conta. Sanitizado AQUI também (não só na ação), para o HTML
  // nunca carregar um destino hostil; `/` é o "não reconhecido" da allowlist.
  const bruto = destinoSeguro(parametro((await searchParams).destino), '/')
  const destino = bruto === '/' ? undefined : bruto
  return (
    <LayoutAcesso
      titulo="Crie sua conta"
      subtitulo="A contratação acontece no ambiente seguro do Mercado Pago. O acesso é liberado depois da confirmação do pagamento."
    >
      {config.cadastroPublicoHabilitado ? (
        <FormularioCadastro destino={destino} />
      ) : (
        <p className={f.aviso} role="status" style={{ color: 'var(--texto-2)', background: 'var(--campo)', borderColor: 'var(--borda-forte)' }}>
          Novos cadastros ainda não estão abertos.
        </p>
      )}
      <p className={f.rodape}>
        Já tem conta?{' '}
        <Link href={destino ? `/entrar?destino=${encodeURIComponent(destino)}` : '/entrar'}>Entrar</Link>
      </p>
    </LayoutAcesso>
  )
}
