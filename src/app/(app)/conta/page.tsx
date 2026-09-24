import Link from 'next/link'
import { atende, ROTULO_DO_NIVEL } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { MENSAGEM_REGRA_SENHA } from '@/modules/plataforma/auth/senha'
import { sair } from '@/features/publico/acoes'
import { parametro } from '@/features/publico/destino'
import { carregarConta } from '@/features/conta/carregar'
import { AvatarDaConta, BlocoAlertas, BlocoAssinatura, BlocoConta, BlocoDispositivos } from '@/features/conta/Blocos'
import s from '@/features/conta/Conta.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Minha conta' }

/** `?aviso=` e `?erro=` chegam como CÓDIGOS: chave fora daqui some — nunca texto cru da URL. */
const TEXTO_DO_AVISO: Record<string, string> = {
  'nome-ok': 'Nome atualizado.',
  'avatar-ok': 'Avatar atualizado.',
  'senha-ok': 'Senha alterada.',
  'email-ok': 'E-mail alterado.',
  'sessao-ok': 'Sessão encerrada.',
}
const TEXTO_DO_ERRO: Record<string, string> = {
  'nome-curto': 'Nome muito curto.',
  'nome-longo': 'Nome muito longo.',
  'avatar-invalido': 'Avatar inválido.',
  'senha-fraca': MENSAGEM_REGRA_SENHA,
  'senha-atual-incorreta': 'Senha atual incorreta.',
  'email-invalido': 'E-mail inválido.',
  'email-em-uso': 'Este e-mail já está em uso.',
  'dispositivo-invalido': 'Dispositivo inválido.',
}

export default async function PaginaConta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [d, p] = await Promise.all([carregarConta(), searchParams])
  const aviso = parametro(p.aviso)
  const erro = parametro(p.erro)
  const mensagemDoAviso = aviso ? TEXTO_DO_AVISO[aviso] : undefined
  const mensagemDeErro = erro ? TEXTO_DO_ERRO[erro] : undefined
  const pago = d.acesso.nivel !== 'GRATIS'

  return (
    <div className={s.tela}>
      <header className={s.cabecalho}>
        <AvatarDaConta nome={d.usuario.nome} email={d.usuario.email} fotoUrl={d.usuario.fotoUrl} tamanho={64} />
        <div className={s.identidade}>
          <h1 className={s.nome}>{d.usuario.nome ?? 'Sem nome'}</h1>
          <p className={s.email}>{d.usuario.email}</p>
        </div>
        <span className={s.plano} data-pago={pago}>
          {d.assinatura?.plano ?? ROTULO_DO_NIVEL[d.acesso.nivel]}
        </span>
      </header>

      {mensagemDoAviso && (
        <p role="status" className={s.aviso}>
          {mensagemDoAviso}
        </p>
      )}
      {mensagemDeErro && (
        <p role="alert" className={s.erro}>
          {mensagemDeErro}
        </p>
      )}

      {/* A ordem é a leitura do celular: Conta, Assinatura, Alertas, Dispositivos. */}
      <div className={s.grade}>
        <BlocoConta usuario={d.usuario} />
        <BlocoAssinatura
          assinatura={d.assinatura}
          acesso={d.acesso}
          podeCancelar={d.podeCancelar}
          estadoCancelamento={parametro(p.cancelamento)}
          agora={new Date()}
          fuso={d.fuso}
        />
        <BlocoAlertas recebeAlertas={atende(d.acesso.nivel, 'MVP')} usuarioId={d.sessao.usuarioId} experiencia={d.experiencia} jogadores={d.jogadores} times={d.times} />
        <BlocoDispositivos dispositivos={d.dispositivos} esteAparelho={d.sessao.dispositivoId} fuso={d.fuso} />
      </div>

      <footer className={s.rodape}>
        <form action={sair}>
          <button type="submit" className={s.botaoSecundario}>
            Sair da conta
          </button>
        </form>
        <nav className={s.links} aria-label="Mais">
          <Link href="/estatisticas">Estatísticas</Link>
          <span aria-hidden>·</span>
          <Link href="/como-funciona">Como funciona</Link>
        </nav>
      </footer>
    </div>
  )
}
