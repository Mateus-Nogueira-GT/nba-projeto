import { carregarGestao } from '@/features/gestao/carregar'
import { TelaGestao } from '@/features/gestao/TelaGestao'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gestão de banca' }

export default async function PaginaGestao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const dados = await carregarGestao(await searchParams)
  return <TelaGestao dados={dados} />
}
