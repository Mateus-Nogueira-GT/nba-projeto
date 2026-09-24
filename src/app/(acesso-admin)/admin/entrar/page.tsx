import Link from 'next/link'
import { Logo } from '@/ui/Logo'
import { FormularioEntrarAdmin } from '@/features/admin/entrar/FormularioEntrarAdmin'
import s from '@/features/admin/entrar/Entrar.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Painel · Entrar' }

/** Login do painel — separado do app do assinante, fora da navegação dele. */
export default function PaginaEntrarAdmin() {
  return (
    <main className={s.pagina}>
      <section className={s.cartao} aria-labelledby="titulo-entrar-admin">
        <Logo largura={120} prioridade />
        <div>
          <p className={s.sobrancelha}>Acesso restrito</p>
          <h1 id="titulo-entrar-admin" className={s.titulo}>
            Painel administrativo
          </h1>
          <p className={s.apoio}>Somente contas com papel de administrador.</p>
        </div>
        {/* O índice do painel. `/admin` está na allowlist de
            `destinoInternoSeguro` — fora dela o login cairia em `/` sem aviso
            (teste: features/admin/__tests__/portao.test.ts). */}
        <FormularioEntrarAdmin destino="/admin" />
        <Link href="/" className={s.voltar}>
          Voltar para o app
        </Link>
      </section>
    </main>
  )
}
