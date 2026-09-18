'use client'

import Link from 'next/link'
import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import { semantico } from '@/design-system/tokens/semantico'

import estilos from './FolhaDeFiltros.module.css'

export type RecorteAtivo = {
  /** O que está filtrando ("PONTOS", "MVP", "5 ENTRADAS"). */
  rotulo: string
  /** A URL sem esse recorte — o × do chip. */
  limparHref: string
}

export type GrupoDeFiltro = {
  /** O nome do recorte ("Método", "Nível do jogador"). */
  titulo: string
  /** O que está escolhido, quando há escolha — vira o rótulo do chip no desktop. */
  ativo?: string
  /** Os `Chip` daquele grupo, montados pela tela com os href da URL. */
  chips: ReactNode
}

/**
 * OS FILTROS — duas formas, uma por largura (identidade 05).
 *
 * No celular segue a folha da identidade 04: a parede de seis fileiras sai da
 * tela e vira um botão FILTRAR que abre uma folha inferior, com o recorte ativo
 * como um chip só, ao lado, com o × para limpar.
 *
 * A partir de `larguraTopo` os mesmos grupos viram uma FILEIRA DE CHIPS COM
 * MENU — a moldura do StatsHub. Cada grupo é um `<details>` que abre o seu
 * bloco de chips, e o rótulo do chip mostra o que está filtrando ("MÉTODO" vira
 * "OPD"). Num monitor não há polegar a proteger, e esconder cinco recortes
 * atrás de um botão custa um clique a mais para ver o que já está escolhido.
 *
 * `<details>` nativo nos dois casos, sem lib: abre e fecha sem JavaScript, e
 * tudo já está no HTML do servidor — os filtros continuam na URL, montados pela
 * tela; aqui só mora a apresentação. O pouco de cliente que existe é conforto:
 * fechar ao escolher um recorte (a navegação é suave e o `<details>` ficaria
 * aberto), no × e no Escape, e fechar um menu quando outro abre.
 */
export function FolhaDeFiltros({
  rotulo = 'FILTRAR',
  titulo = 'Filtrar a lista',
  ativos = [],
  grupos = [],
}: {
  rotulo?: string
  titulo?: string
  ativos?: RecorteAtivo[]
  /**
   * Os recortes montados pela tela. OPCIONAL no tipo, como em `CabecalhoTela`:
   * `createElement(Folha, props, filhos)` só satisfaz um obrigatório se ele for
   * repetido dentro da props — e passar filho por props é justamente o que o
   * lint proíbe. Na prática a folha sempre recebe algo.
   */
  grupos?: GrupoDeFiltro[]
}) {
  const folha = useRef<HTMLDetailsElement>(null)
  const fileira = useRef<HTMLDivElement>(null)

  const fecharFolha = () => {
    if (folha.current) folha.current.open = false
  }
  /** Um menu aberto por vez: dois abertos se sobrepõem na mesma linha. */
  const fecharMenus = (exceto?: HTMLDetailsElement) => {
    for (const menu of fileira.current?.querySelectorAll('details') ?? []) {
      if (menu !== exceto) menu.open = false
    }
  }
  const aoEscolher = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('a')) {
      fecharFolha()
      fecharMenus()
    }
  }
  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      fecharFolha()
      fecharMenus()
    }
  }

  return (
    <div className={estilos.raiz} onKeyDown={aoTeclar}>
      {/* ≥ larguraTopo: um chip com menu por grupo. */}
      <div ref={fileira} className={estilos.chips} onClick={aoEscolher}>
        {grupos.map((grupo) => (
          <details
            key={grupo.titulo}
            className={estilos.chipMenu}
            onToggle={(e) => {
              if (e.currentTarget.open) fecharMenus(e.currentTarget)
            }}
          >
            <summary aria-label={grupo.ativo ? `${grupo.titulo}: ${grupo.ativo}` : grupo.titulo}>
              {grupo.ativo ?? grupo.titulo}
              <svg
                aria-hidden
                className={estilos.seta}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2.5 4.5 6 8l3.5-3.5" />
              </svg>
            </summary>
            <div className={estilos.menu} role="group" aria-label={grupo.titulo}>
              {grupo.chips}
            </div>
          </details>
        ))}
      </div>

      {/* < larguraTopo: o recorte ativo, o botão FILTRAR e a folha inferior. */}
      <div className={estilos.folha}>
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
              // O recorte ativo é PREENCHIDO no acento, com texto branco: o azul
              // do manual nunca é contorno nem tinta (identidade 05). A borda
              // transparente segura a altura da pílula ao lado das inativas.
              border: '1.5px solid transparent',
              background: semantico.acento,
              color: semantico.textoSobreAcento,
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {ativo.rotulo} <span aria-hidden>×</span>
          </Link>
        ))}

        <details ref={folha}>
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
              letterSpacing: '0.06em',
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
              // Cinza do artboard, não a cor do texto do botão: o ícone é apoio.
              stroke={semantico.textoSecundario}
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
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: semantico.textoPrimario,
                }}
              >
                {titulo}
              </strong>
              <button
                type="button"
                onClick={fecharFolha}
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
            <div style={{ display: 'grid', gap: 14 }}>
              {grupos.map((grupo) => (
                <fieldset key={grupo.titulo} style={{ margin: 0, padding: 0, border: 'none' }}>
                  {/* `<legend>` e não um `<p>`: é o que ele é — um grupo de
                      opções nomeado — e é por ele que o teste prova que a
                      parede de seis fileiras não abre mais a tela. */}
                  <legend
                    style={{
                      padding: 0,
                      marginBottom: 6,
                      fontFamily: semantico.fonteRotulo,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: semantico.textoSecundario,
                    }}
                  >
                    {grupo.titulo}
                  </legend>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{grupo.chips}</div>
                </fieldset>
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}
