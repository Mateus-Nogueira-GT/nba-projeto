import type { ReactNode } from 'react'
import { Logo } from '@/ui/Logo'
import s from './Acesso.module.css'

/**
 * As telas de acesso (entrar, cadastrar, redefinir), pelo Manual da Marca:
 * no desktop, área de marca à esquerda (~55%) sobre a foto da quadra e
 * formulário à direita (~45%). No celular, uma coluna: a quadra some e ficam
 * logo, mensagem e formulário, sem zoom nem rolagem lateral.
 */
export function LayoutAcesso({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo: ReactNode
  children: ReactNode
}) {
  return (
    <div className={s.tela}>
      <section className={s.heroi} aria-hidden>
        <div className={s.heroiTopo}>
          <Logo largura={200} prioridade />
        </div>
        <div className={s.heroiTexto}>
          <p className={s.manchete}>Leia o jogo<br />por inteiro.</p>
          <p className={s.linhaFina}>Dados, contexto e inteligência em uma só plataforma.</p>
        </div>
        <p className={s.heroiRodape}>
          <span>NIP</span>
          <span className={s.traco} />
          <span>NBA Intelligence Platform</span>
        </p>
      </section>
      <main className={s.lado}>
        <div className={s.caixa}>
          <div className={s.marcaCelular}>
            <Logo largura={132} prioridade />
            <p className={s.mancheteCelular}>Leia o jogo por inteiro.</p>
          </div>
          <h1 className={s.titulo}>{titulo}</h1>
          <p className={s.subtitulo}>{subtitulo}</p>
          {children}
        </div>
      </main>
    </div>
  )
}
