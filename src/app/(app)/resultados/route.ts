import { NextResponse, type NextRequest } from 'next/server'
import { destinoDosResultados } from '@/features/resultados/carregar'

export const dynamic = 'force-dynamic'

/**
 * `/resultados` é um ATALHO para a última rodada conferida — a tela mora em
 * `/resultados/[data]`. Route handler, e não página: sob o `loading.tsx` do
 * grupo a página já começaria a transmitir, e o redirect viraria navegação de
 * cliente em vez de um 307 que o navegador e os links antigos entendem.
 */
export async function GET(requisicao: NextRequest) {
  const destino = await destinoDosResultados(Object.fromEntries(requisicao.nextUrl.searchParams))
  return NextResponse.redirect(new URL(destino, requisicao.url), 307)
}
