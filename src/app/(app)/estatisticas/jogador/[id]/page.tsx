import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { nomesDeJogadores } from '@/modules/entrega/estatisticas/jogador'
import { exigirCookieDeSessao } from '@/modules/plataforma/assinatura/guarda'
import { carregarJogador } from '@/features/estatisticas/jogador'
import { TelaJogador } from '@/features/estatisticas/TelaJogador'

export const dynamic = 'force-dynamic'

/**
 * O título da aba é o nome do jogador. O v2 montava a tela INTEIRA aqui
 * (`telaDoJogador` com calendário nulo, ~10 consultas) antes de qualquer
 * portão, e um id que não é UUID chegava ao Postgres como erro de conversão.
 * Aqui vale a mesma ordem da página — UUID, cookie, só então o banco (I3,
 * auditoria 23/09) — e a leitura é só o nome. `generateMetadata` roda em
 * paralelo com a página: sem o próprio portão, ela seria a porta dos fundos.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  await exigirCookieDeSessao(`/estatisticas/jogador/${id}`)
  const nomes = await nomesDeJogadores(getDb(), [id])
  return { title: nomes.get(id) ?? 'Jogador' }
}

export default async function PaginaJogador({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  // Opcional como na tela antiga: quem chama sem busca (link cru) cai no recorte padrão.
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams])
  const dados = await carregarJogador(id, busca ?? {})
  return <TelaJogador dados={dados} />
}
