import { carregarResultados } from '@/features/resultados/carregar'
import { TelaResultados } from '@/features/resultados/TelaResultados'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Resultados' }

export default async function PaginaResultadosDaRodada({
  params,
  searchParams,
}: {
  params: Promise<{ data: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  // `searchParams` opcional, como na tela antiga: chamadas diretas (testes de
  // tela) passam só a rodada.
  const [{ data }, consulta] = await Promise.all([params, searchParams])
  const dados = await carregarResultados(data, consulta ?? {})
  return <TelaResultados dados={dados} />
}
