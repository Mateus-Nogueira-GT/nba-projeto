import Link from 'next/link'

import estilos from '@/components/afiliados/PainelComercial.module.css'
import { MarcaNip } from '@/design-system/componentes/MarcaNip'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { aceitar } from './acoes'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Convite de parceiro' }

export default async function PaginaConvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sessao = await sessaoAtual()
  const destino = `/afiliados/convite/${encodeURIComponent(token)}`
  return (
    <main className="oferta-publica">
      <section>
        <MarcaNip />
        <p className="etiqueta">PROGRAMA DE PARCEIROS</p>
        <h1>Convite para a área de afiliados</h1>
        <p>
          O convite é de uso único e só pode ser aceito pela conta com o mesmo e-mail informado pela
          equipe NIP.
        </p>
        {sessao ? (
          <form action={aceitar}>
            <input type="hidden" name="token" value={token} />
            <button className={`${estilos.botao} acao-primaria`}>Aceitar convite</button>
          </form>
        ) : (
          <Link className="acao-primaria" href={`/entrar?destino=${encodeURIComponent(destino)}`}>
            Entrar para continuar
          </Link>
        )}
      </section>
    </main>
  )
}
