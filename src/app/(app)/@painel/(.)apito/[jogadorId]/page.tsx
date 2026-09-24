import { atributoDaConsulta, carregarApito } from '@/features/apito/carregar'
import { DetalheDoApito } from '@/features/apito/DetalheDoApito'
import { Painel } from '@/features/shell/Painel'

export const dynamic = 'force-dynamic'

/** O apito aberto a partir da Lista: painel ao lado, a Lista continua na tela. */
export default async function PainelDoApito({
  params,
  searchParams,
}: {
  params: Promise<{ jogadorId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ jogadorId }, consulta] = await Promise.all([params, searchParams])
  const dados = await carregarApito(jogadorId, atributoDaConsulta(consulta.atributo))
  return (
    <Painel modo="detalhe" rotulo="Detalhe do apito">
      <DetalheDoApito dados={dados} />
    </Painel>
  )
}
