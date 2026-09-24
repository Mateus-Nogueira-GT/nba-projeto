import Link from 'next/link'
import { atributoDaConsulta, carregarApito } from '@/features/apito/carregar'
import { DetalheDoApito } from '@/features/apito/DetalheDoApito'
import { IconeVoltar } from '@/ui/icones'
import s from '@/features/apito/Pagina.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Linhas e confiança' }

/** Link direto (push, compartilhamento, recarregar): o detalhe em página cheia. */
export default async function PaginaDoApito({
  params,
  searchParams,
}: {
  params: Promise<{ jogadorId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ jogadorId }, consulta] = await Promise.all([params, searchParams])
  const dados = await carregarApito(jogadorId, atributoDaConsulta(consulta.atributo))
  return (
    <div className={s.pagina} data-painel-nip="detalhe">
      <Link href="/" className={s.voltar}>
        <IconeVoltar tamanho={18} /> Entradas
      </Link>
      <div className={s.cartao}>
        <DetalheDoApito dados={dados} />
      </div>
    </div>
  )
}
