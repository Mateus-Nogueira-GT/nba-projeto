'use client'

import Link from 'next/link'
import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import { semantico } from '@/design-system/tokens/semantico'

export type RecorteAtivo = {
  /** O que está filtrando ("PONTOS", "MVP", "5 ENTRADAS"). */
  rotulo: string
  /** A URL sem esse recorte — o × do chip. */
  limparHref: string
}

/**
 * FOLHA DE FILTROS — a parede de seis fileiras sai da tela e vira um botão
 * FILTRAR que abre uma folha inferior (spec 04, §4.1). O recorte ativo aparece
 * como um chip só, ao lado do botão, com o × para limpar.
 *
 * `<details>` nativo, sem lib: abre e fecha sem JavaScript, e a folha inteira
 * já está no HTML do servidor — os filtros continuam na URL, montados pela
 * tela; aqui só mora a apresentação. O pouco de cliente que existe é
 * conforto: fechar ao escolher um recorte (a navegação é suave e o `<details>`
 * ficaria aberto), no × e no Escape.
 */
export function FolhaDeFiltros({
  rotulo = 'FILTRAR',
  titulo = 'Filtrar a lista',
  ativos = [],
  children,
}: {
  rotulo?: string
  titulo?: string
  ativos?: RecorteAtivo[]
  /**
   * Os recortes montados pela tela. OPCIONAL no tipo, como em `CabecalhoTela`:
   * `createElement(Folha, props, filhos)` só satisfaz um `children`
   * obrigatório se ele for repetido dentro da props — e passar filho por props
   * é justamente o que o lint proíbe. Na prática a folha sempre recebe algo.
   */
  children?: ReactNode
}) {
  const folha = useRef<HTMLDetailsElement>(null)
  const fechar = () => {
    if (folha.current) folha.current.open = false
  }
  const aoEscolher = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a')) fechar()
  }
  const aoTeclar = (e: KeyboardEvent<HTMLDetailsElement>) => {
    if (e.key === 'Escape') fechar()
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      {ativos.map((ativo) => (
        <Link
          key={ativo.rotulo}
          href={ativo.limparHref}
          aria-label={`Limpar filtro ${ativo.rotulo}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 999,
            border: `1.5px solid ${semantico.acento}`,
            color: semantico.acento,
            fontFamily: semantico.fonteRotulo,
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {ativo.rotulo} <span aria-hidden>×</span>
        </Link>
      ))}

      <details ref={folha} onKeyDown={aoTeclar}>
        <summary
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            border: `1.5px solid ${semantico.divisor}`,
            fontFamily: semantico.fonteRotulo,
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            fontWeight: 600,
            color: semantico.texto70,
            cursor: 'pointer',
            listStyle: 'none',
            userSelect: 'none',
          }}
        >
          <svg
            aria-hidden
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M1 3h12M3 7h8M5 11h4" />
          </svg>
          {rotulo}
        </summary>

        <div
          role="dialog"
          aria-label={titulo}
          onClick={aoEscolher}
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: '14px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
            background: semantico.superficie,
            borderTop: `1px solid ${semantico.divisor}`,
            borderRadius: '16px 16px 0 0',
            color: semantico.textoPrimario,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <strong
              style={{
                fontFamily: semantico.fonteRotulo,
                fontSize: 13,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: semantico.textoPrimario,
              }}
            >
              {titulo}
            </strong>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar filtros"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: `1.5px solid ${semantico.divisor}`,
                background: 'transparent',
                color: semantico.textoPrimario,
                fontSize: 18,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>{children}</div>
        </div>
      </details>
    </div>
  )
}
