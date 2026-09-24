import Link from 'next/link'
import { LayoutAcesso } from '@/features/publico/LayoutAcesso'
import f from '@/features/publico/Formulario.module.css'

export const metadata = { title: 'Esqueci minha senha' }

/**
 * "Esqueci minha senha" SEM provedor de e-mail: quem perdeu a senha pede o
 * link a quem administra a conta. O mesmo link servirá para o e-mail depois —
 * muda só quem entrega.
 */
export default function PaginaRedefinir() {
  return (
    <LayoutAcesso
      titulo="Esqueci minha senha"
      subtitulo="Ainda não enviamos e-mail. Peça o link de redefinição a quem administra a sua conta; ele vale por uma hora e só funciona uma vez."
    >
      <Link href="/entrar" className={f.primario}>
        Voltar para entrar
      </Link>
    </LayoutAcesso>
  )
}
