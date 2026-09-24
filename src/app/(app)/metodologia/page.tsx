import { redirect } from 'next/navigation'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { aceitarMetodologia } from '@/features/metodologia/acoes'
import { lerMetodologia } from '@/features/metodologia/carregar'
import { paraOndeVoltar } from '@/features/metodologia/destino'
import { LeituraDaMetodologia } from '@/features/metodologia/Leitura'
import { parametro } from '@/features/publico/destino'
import s from '@/features/metodologia/Metodologia.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'A metodologia NIP' }

/**
 * O PORTÃO DA METODOLOGIA — toda conta passa por aqui uma vez. Não passa pelo
 * guarda de nível (ele a mandaria para ela mesma, em laço): checa só a sessão.
 */
export default async function PaginaMetodologia({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/metodologia')
  const destino = paraOndeVoltar(parametro((await searchParams).destino))
  return (
    <LeituraDaMetodologia
      sobrancelha="Antes de começar"
      titulo="A metodologia NIP"
      introducao="Leia uma vez e confirme embaixo. Depois disso a lista se explica sozinha, e esta tela não aparece mais — ela continua disponível em Como funciona."
      metodologia={await lerMetodologia()}
      depois={
        <form action={aceitarMetodologia} className={s.aceite}>
          <input type="hidden" name="destino" value={destino} />
          <p className={s.aceiteTexto}>
            Ao confirmar, você declara que leu como a NIP escolhe e gradua cada apito — e que a nota
            de confiança não é probabilidade de acerto.
          </p>
          <button type="submit" className={s.botaoAceite}>
            OK, concordo
          </button>
        </form>
      }
    />
  )
}
