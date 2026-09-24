import type { Metadata } from 'next'
import Link from 'next/link'
import { CartaoPublico } from '@/features/publico/CartaoPublico'
import s from '@/features/publico/CartaoPublico.module.css'

export const metadata: Metadata = { title: 'Sem conexão', robots: { index: false, follow: false } }

/** O fallback do service worker (`public/sw.js`) para navegação sem rede. */
export default function PaginaOffline() {
  return (
    <CartaoPublico titulo="Sem conexão">
      <p className={s.texto}>
        Reconecte-se para consultar a Lista Secreta, o Fire Live e as estatísticas. Nenhum dado da
        sua conta foi armazenado neste dispositivo.
      </p>
      <div className={s.acoes}>
        <Link href="/" className={s.primaria}>
          Tentar novamente
        </Link>
      </div>
    </CartaoPublico>
  )
}
