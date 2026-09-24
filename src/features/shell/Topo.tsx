import Link from 'next/link'
import { IconeBusca, IconeSino } from '@/ui/icones'
import { Logo } from '@/ui/Logo'
import { AvatarDaConta } from '@/features/conta/Blocos'
import { BotaoRecolher } from './Navegacao'
import { BotaoTema } from './BotaoTema'
import type { Tema } from './tema'
import s from './Shell.module.css'

/**
 * Barra superior. No desktop: recolher menu, busca e conta. No celular: marca,
 * alertas e conta — a busca desce para dentro de cada tela.
 */
export function Topo({
  email,
  nome = null,
  fotoUrl = null,
  busca,
  tema,
}: {
  tema: Tema
  email: string
  nome?: string | null
  fotoUrl?: string | null
  busca?: string
}) {
  return (
    <header className={s.topo}>
      <div className={s.topoEsquerda}>
        <span className={s.soDesktop}>
          <BotaoRecolher />
        </span>
        <Link href="/" className={`${s.marcaTopo} ${s.soCelular}`}>
          <Logo largura={72} prioridade />
        </Link>
        <form action="/estatisticas" className={`${s.busca} ${s.soDesktop}`} role="search">
          <IconeBusca tamanho={18} />
          <label htmlFor="busca-topo" className="so-leitor">
            Buscar jogador ou time
          </label>
          <input
            id="busca-topo"
            name="q"
            type="search"
            placeholder="Buscar jogador ou time"
            defaultValue={busca}
            autoComplete="off"
          />
        </form>
      </div>
      <div className={s.topoDireita}>
        <BotaoTema inicial={tema} />
        <Link href="/conta" className={s.botaoIcone} aria-label="Alertas">
          <IconeSino />
        </Link>
        <Link href="/conta" className={s.avatarLink} aria-label={`Conta de ${nome ?? email}`}>
          <AvatarDaConta nome={nome} email={email} fotoUrl={fotoUrl} tamanho={34} />
        </Link>
      </div>
    </header>
  )
}
