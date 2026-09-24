import { carregarJogo } from '@/features/estatisticas/jogo'
import { TelaJogo } from '@/features/estatisticas/TelaJogo'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partida' }

export default async function PaginaDoJogo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams])
  const dados = await carregarJogo(id, busca)
  return <TelaJogo dados={dados} />
}
