import Link from 'next/link'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { parametro } from '@/features/publico/destino'
import s from '@/features/assinatura/Planos.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirmação de pagamento' }

/**
 * O retorno do checkout NÃO comprova pagamento. Só diz "confirmado" quando o
 * servidor já deu direito pago E o checkout não avisou que ainda está
 * processando — antes, quem já era MVP e fazia upgrade via "confirmado" com o
 * pagamento pendente.
 */
export default async function PaginaRetornoMercadoPago({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ acesso }, p] = await Promise.all([exigirNivel('GRATIS', '/conta'), searchParams])
  // A query é do NAVEGADOR — qualquer um a forja. Ela só pode SEGURAR o
  // "confirmado" (a nossa ação de checkout manda `estado=processando` quando o
  // provedor ainda não fechou), nunca concedê-lo: `status`, `payment_id` e
  // afins que o Mercado Pago põe na volta não são lidos aqui. A prova é o
  // direito que o webhook assinado gravou, e ele chega por `acesso`
  // (paywall.test.ts trava isto pela fonte).
  const processando = parametro(p.estado) === 'processando'
  const confirmado = acesso.nivel !== 'GRATIS' && !processando
  return (
    <div className={s.tela}>
      <section className={s.retorno} aria-labelledby="titulo-retorno">
        <h1 id="titulo-retorno" className={s.titulo}>
          {confirmado ? 'Pagamento confirmado' : 'Confirmação em andamento'}
        </h1>
        {confirmado ? (
          <>
            <p className={s.retornoTexto}>Seu direito de acesso já foi confirmado pelo servidor.</p>
            <Link href="/" className={s.retornoAcao}>
              Abrir a Lista Secreta
            </Link>
          </>
        ) : (
          <>
            <p className={s.retornoTexto}>
              O retorno do checkout não comprova o pagamento. Estamos aguardando a confirmação
              assinada do Mercado Pago. Isso normalmente leva poucos instantes — você pode
              acompanhar o estado sem refazer a cobrança.
            </p>
            <Link href="/conta" className={s.retornoAcao}>
              Ver estado da conta
            </Link>
          </>
        )}
      </section>
    </div>
  )
}
