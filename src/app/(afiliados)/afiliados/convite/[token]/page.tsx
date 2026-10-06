import Link from 'next/link'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { Logo } from '@/ui/Logo'
import { FormAcao } from '@/features/admin/FormAcao'
import { aceitar } from '@/features/afiliados/acoes'
import s from '@/features/afiliados/Comercial.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Convite de parceiro' }

export default async function PaginaConvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sessao = await sessaoAtual()
  const destino = `/afiliados/convite/${encodeURIComponent(token)}`
  // Mesma fonte de `/entrar`: com o cadastro público fechado, "Criar conta"
  // levaria a uma tela que recusa — fechado vale para todos (spec, decisão 5).
  const cadastroAberto = configuracaoProdutoPago().cadastroPublicoHabilitado
  return (
    <main className={s.publica}>
      <section className={s.cartao} aria-labelledby="titulo-convite">
        <Logo largura={120} prioridade />
        <div>
          <p className={s.etiqueta}>Programa de parceiros</p>
          <h1 id="titulo-convite" className={s.tituloPublico}>
            Convite para a área de afiliados
          </h1>
        </div>
        <p className={s.textoPublico}>
          O convite é de uso único e só pode ser aceito pela conta com o mesmo e-mail informado pela equipe NIP.
        </p>
        {sessao ? (
          <FormAcao acao={aceitar} rotulo="Aceitar convite">
            <input type="hidden" name="token" value={token} />
            <button className={s.acaoPrimaria}>Aceitar convite</button>
          </FormAcao>
        ) : (
          <>
            <Link className={s.acaoPrimaria} href={`/entrar?destino=${encodeURIComponent(destino)}`}>
              Entrar para continuar
            </Link>
            {/* Quem ainda não tem conta cria uma e volta aqui (auditoria 26/09). */}
            {cadastroAberto && (
              <Link className={s.acaoSecundaria} href={`/cadastrar?destino=${encodeURIComponent(destino)}`}>
                Criar conta
              </Link>
            )}
          </>
        )}
      </section>
    </main>
  )
}
