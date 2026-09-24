'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { IconeFechar } from './icones'
import s from './Folha.module.css'

/**
 * Folha que sobe de baixo (celular) ou abre ancorada (desktop). É um
 * `<dialog>` modal de verdade: foco preso, Esc fecha, o foco volta ao botão.
 *
 * Fecha sozinha em DUAS situações: quando a URL muda (um filtro escolhido já
 * navegou) e quando a pessoa aciona qualquer item de dentro. A segunda existe
 * porque nem toda escolha navega: "Sixth Man AI" abre uma gaveta sem mudar de
 * rota, e a folha ficava aberta por cima do que ela acabara de abrir.
 */
export function Folha({
  titulo,
  gatilho,
  gatilhoClasse,
  gatilhoRotulo,
  children,
}: {
  titulo: string
  gatilho: ReactNode
  gatilhoClasse?: string
  gatilhoRotulo?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [aberta, setAberta] = useState(false)
  // Só o CAMINHO: ler os parâmetros da URL aqui obrigaria o Next a abandonar
  // o HTML do servidor em toda tela que mostra a barra inferior — a página
  // ficava presa no esqueleto de carregamento. Filtro escolhido já fecha a
  // folha pelo clique (abaixo).
  const caminho = usePathname()

  useEffect(() => {
    ref.current?.close()
  }, [caminho])

  return (
    <>
      <button
        type="button"
        className={gatilhoClasse}
        aria-label={gatilhoRotulo}
        aria-haspopup="dialog"
        aria-expanded={aberta}
        onClick={() => ref.current?.showModal()}
      >
        {gatilho}
      </button>
      <dialog
        ref={ref}
        className={s.folha}
        aria-label={titulo}
        onClose={() => setAberta(false)}
        onToggle={(e) => setAberta((e.target as HTMLDialogElement).open)}
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close()
        }}
      >
        <div className={s.conteudo}>
          <header className={s.cabecalho}>
            <span className={s.alca} aria-hidden />
            <h2 className={s.titulo}>{titulo}</h2>
            <button type="button" className={s.fechar} aria-label="Fechar" onClick={() => ref.current?.close()}>
              <IconeFechar />
            </button>
          </header>
          <div
            className={s.corpo}
            onClick={(e) => {
              const alvo = (e.target as HTMLElement).closest('a, button')
              if (alvo) ref.current?.close()
            }}
          >
            {children}
          </div>
        </div>
      </dialog>
    </>
  )
}
