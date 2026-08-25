import type { ReactNode } from 'react'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

import { BarraInferior, type Aba } from './BarraInferior'

/**
 * Moldura das telas do app: fundo, largura de leitura e a barra de abas.
 *
 * O `paddingBottom` reserva a altura da barra fixa. Sem ele o último card da
 * lista fica embaixo da navegação — e numa lista longa ninguém percebe que
 * ainda há conteúdo escondido ali.
 */
export function Moldura({
  aba,
  children,
}: {
  /** `null` nas telas que não são abas (detalhe, teoria): sem barra. */
  aba: Aba | null
  children: ReactNode
}) {
  return (
    <>
      <main
        style={{
          // Identidade 03: fim do fundo chapado — a tela respira num gradiente.
          background: componente.fundoTela,
          color: semantico.textoPrimario,
          minHeight: '100vh',
          padding: aba === null ? '24px 16px 64px' : '24px 16px 96px',
          fontFamily: semantico.fonteCorpo,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>{children}</div>
      </main>
      {aba !== null && <BarraInferior atual={aba} />}
    </>
  )
}
