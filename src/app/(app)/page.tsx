import { carregarLista } from '@/features/lista/carregar'
import { lerEstadoDaTabela } from '@/features/lista/estado'
import { TelaLista } from '@/features/lista/TelaLista'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Entradas' }

export default async function PaginaEntradas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const estado = lerEstadoDaTabela(await searchParams)
  const dados = await carregarLista(estado)
  return <TelaLista dados={dados} estado={estado} />
}
