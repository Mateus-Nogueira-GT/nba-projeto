import { carregarAoVivo, lerRecorte } from '@/features/ao-vivo/carregar'
import { TelaAoVivo } from '@/features/ao-vivo/TelaAoVivo'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ao Vivo' }

export default async function PaginaAoVivo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const recorte = lerRecorte(await searchParams)
  const dados = await carregarAoVivo(recorte)
  return <TelaAoVivo dados={dados} recorte={recorte} />
}
