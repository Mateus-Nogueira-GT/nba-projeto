import Link from 'next/link'

import { MarcaNip } from '@/design-system/componentes/MarcaNip'

export const metadata = { title: 'Oferta indisponível' }

export default function PaginaOfertaIndisponivel() {
  return (
    <main className="oferta-publica">
      <section>
        <MarcaNip />
        <p className="etiqueta">LINK COMERCIAL</p>
        <h1>Esta oferta não está disponível</h1>
        <p>O link pode ter sido pausado ou encerrado. Nenhuma ação comercial foi registrada.</p>
        <Link href="/" className="acao-primaria">
          Voltar para a NIP
        </Link>
      </section>
    </main>
  )
}
