'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import { IconeFechar } from '@/ui/icones'
import s from './Painel.module.css'

/**
 * Coluna de detalhe à direita da lista (desktop) ou tela cheia vinda de baixo
 * (celular). `modo="detalhe"` é o apito aberto; `modo="resumo"` é o que ocupa
 * a coluna quando nada está aberto — e some no celular.
 */
export function Painel({
  modo,
  rotulo,
  rota = '/',
  children,
}: {
  modo: 'detalhe' | 'resumo'
  rotulo: string
  /**
   * A rota a que ESTE painel pertence — `/` para o resumo da Lista, `/gestao`,
   * `/fire-live`… para a coluna da rodada nas demais seções.
   */
  rota?: string
  children: ReactNode
}) {
  const router = useRouter()
  const caminho = usePathname()
  const ref = useRef<HTMLElement>(null)
  // Na navegação sem recarregar, o Next mantém o último conteúdo de um slot
  // paralelo quando a nova rota não tem um para ele. O painel só vale onde
  // nasceu: o detalhe em `/apito/...`, o resumo/lateral na rota que o montou.
  const pertence =
    modo === 'detalhe'
      ? caminho.startsWith('/apito/')
      : rota === '/'
        ? caminho === '/'
        : caminho.startsWith(rota)

  useEffect(() => {
    if (modo !== 'detalhe' || !pertence) return
    ref.current?.focus({ preventScroll: true })
    ref.current?.scrollTo({ top: 0 })
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.back()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [modo, pertence, router, children])

  if (!pertence) return null

  return (
    <aside ref={ref} className={s.painel} data-modo={modo} data-painel-nip={modo} aria-label={rotulo} tabIndex={-1}>
      {modo === 'detalhe' && (
        <div className={s.barra}>
          <span className={s.alca} aria-hidden />
          <button type="button" className={s.fechar} onClick={() => router.back()} aria-label="Fechar detalhe">
            <IconeFechar />
          </button>
        </div>
      )}
      {children}
    </aside>
  )
}
