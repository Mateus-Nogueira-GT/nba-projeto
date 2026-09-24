import { carregarTime } from '@/features/estatisticas/time'
import { TelaTime } from '@/features/estatisticas/TelaTime'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Time' }

export default async function PaginaTime({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams])
  const dados = await carregarTime(id, busca)
  return <TelaTime dados={dados} />
}
