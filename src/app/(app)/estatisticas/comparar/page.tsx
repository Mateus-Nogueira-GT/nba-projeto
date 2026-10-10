import type { Metadata } from 'next'

import { carregarComparacao } from '@/features/estatisticas/comparar'
import { TelaComparar } from '@/features/estatisticas/TelaComparar'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Comparar' }

export default async function PaginaComparar({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const dados = await carregarComparacao((await searchParams) ?? {})
  return <TelaComparar dados={dados} />
}
