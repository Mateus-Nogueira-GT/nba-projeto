'use client'

import { useEffect, useRef, useState } from 'react'
import { COOKIE_TEMA, ROTULO_DO_TEMA, TEMAS, type Tema } from './tema'
import s from './Shell.module.css'

/**
 * A amostra de cada tema no menu: fundo, cartão e destaque. Os três temas
 * aparecem juntos, então não dá para ler `--fundo` do tema atual: as cores
 * moram em `src/ui/tokens.css` como `--amostra-<tema>-*`, e o teste de marca
 * trava fundo e destaque iguais aos do bloco de cada tema.
 */
const AMOSTRA = (t: Tema, parte: 'fundo' | 'campo' | 'acento') => `var(--amostra-${t}-${parte})`

/**
 * Troca na hora (atributo no <html>) e grava no cookie para o servidor desenhar
 * o próximo carregamento já no tema certo. Fora do componente porque a regra
 * `react-hooks/immutability` do nosso lint não aceita escrever em `document`
 * de dentro do corpo de um componente — o efeito é o mesmo do v2.
 */
function aplicarTema(novo: Tema) {
  document.documentElement.dataset.tema = novo
  document.cookie = `${COOKIE_TEMA}=${novo}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Escolha de tema no topo, no formato do GPM: um botão que abre um menu com
 * as opções. Troca na hora (atributo no <html>) e grava no cookie para o
 * servidor desenhar o próximo carregamento já no tema certo.
 */
export function BotaoTema({ inicial }: { inicial: Tema }) {
  const [tema, setTema] = useState<Tema>(inicial)
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  function escolher(novo: Tema) {
    aplicarTema(novo)
    setTema(novo)
    setAberto(false)
  }

  return (
    <div className={s.tema} ref={raiz}>
      <button
        type="button"
        className={s.botaoIcone}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Tema: ${ROTULO_DO_TEMA[tema]}. Trocar tema`}
        title="Trocar tema"
        onClick={() => setAberto((a) => !a)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22Z" />
          <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" />
          <circle cx="12" cy="7" r="1.2" fill="currentColor" />
          <circle cx="16.5" cy="10.5" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {aberto && (
        <div className={s.temaMenu} role="menu" aria-label="Tema">
          <p className={s.temaTitulo}>Tema</p>
          {TEMAS.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitemradio"
              aria-checked={tema === t}
              className={s.temaOpcao}
              onClick={() => escolher(t)}
            >
              <span
                className={s.temaAmostra}
                aria-hidden
                style={{ background: AMOSTRA(t, 'fundo'), borderColor: AMOSTRA(t, 'campo') }}
              >
                <i style={{ background: AMOSTRA(t, 'campo') }} />
                <i style={{ background: AMOSTRA(t, 'acento') }} />
              </span>
              <span>{ROTULO_DO_TEMA[t]}</span>
              {tema === t && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={s.temaMarca}>
                  <path d="M5 12.5 10 17 19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
