import Link from 'next/link'
import { CartaoPublico } from '@/features/publico/CartaoPublico'
import s from '@/features/publico/CartaoPublico.module.css'

export const metadata = { title: 'Oferta indisponível' }

export default function PaginaOfertaIndisponivel() {
  return (
    <CartaoPublico etiqueta="Link comercial" titulo="Esta oferta não está disponível">
      <p className={s.texto}>O link pode ter sido pausado ou encerrado. Nenhuma ação comercial foi registrada.</p>
      <div className={s.acoes}>
        <Link href="/" className={s.primaria}>
          Voltar para a NIP
        </Link>
      </div>
    </CartaoPublico>
  )
}
