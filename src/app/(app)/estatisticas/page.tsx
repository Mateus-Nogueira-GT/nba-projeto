import { carregarIndice } from '@/features/estatisticas/indice'
import { TelaIndice } from '@/features/estatisticas/TelaIndice'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Estatísticas' }

export default async function PaginaEstatisticas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const dados = await carregarIndice(await searchParams)
  return <TelaIndice dados={dados} />
}
