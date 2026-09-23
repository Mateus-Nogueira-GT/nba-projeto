import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { MarcaNip } from '@/design-system/componentes/MarcaNip'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { COOKIE_VISITANTE_AFILIADO } from '@/modules/plataforma/afiliados/http'
import {
  registrarVisitaNip,
  resolverLinkSemRegistrar,
} from '@/modules/plataforma/afiliados/servico'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Oferta selecionada' }

export default async function PaginaOferta({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  if (!process.env.DATABASE_URL) notFound()
  try {
    const { destino } = await resolverLinkSemRegistrar(getDb(), codigo)
    if (destino !== `/oferta/${codigo}`) notFound()
    const visitanteToken = (await cookies()).get(COOKIE_VISITANTE_AFILIADO)?.value
    if (visitanteToken) {
      const sessao = await sessaoAtual()
      await registrarVisitaNip(getDb(), {
        codigo,
        visitanteToken,
        usuarioId: sessao?.usuarioId,
        agora: new Date(),
      })
    }
  } catch {
    notFound()
  }
  return (
    <main className="oferta-publica">
      <section>
        <MarcaNip />
        <p className="etiqueta">PARCERIA COMERCIAL</p>
        <h1>Você está saindo da NIP</h1>
        <p>
          O próximo botão abre o site da casa parceira. A NIP registra esta saída para atribuir a
          campanha; cadastro, depósito e demais ações acontecem fora da plataforma.
        </p>
        <Link href={`/ir/${codigo}`} prefetch={false} className="acao-primaria">
          Continuar para a oferta
        </Link>
        <Link href="/" className="acao-secundaria">
          Voltar para a NIP
        </Link>
      </section>
    </main>
  )
}
