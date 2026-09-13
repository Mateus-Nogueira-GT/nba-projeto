import type { ReactNode } from 'react'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

import { BarraInferior, type Aba } from './BarraInferior'

/**
 * DUAS LARGURAS, não uma (spec 12/09, §4.1). `leitura` (640) é a coluna de
 * varredura — Lista, Fire Live, detalhe: linha curta é decisão de
 * legibilidade. `dados` (1120) é para tabela, box score, perfil: ali a largura
 * vira informação, e a 640 a página ficava vazia em volta de uma tabela
 * espremida. No celular as duas caem para a largura da tela com o mesmo
 * respiro de 16px — só o desktop muda.
 */
export const LARGURA_DA_MOLDURA = { leitura: 640, dados: 1120 } as const
export type LarguraDaMoldura = keyof typeof LARGURA_DA_MOLDURA

/**
 * Moldura das telas do app: fundo, largura (leitura ou dados) e a barra de abas.
 *
 * O `paddingBottom` reserva a altura da barra fixa. Sem ele o último card da
 * lista fica embaixo da navegação — e numa lista longa ninguém percebe que
 * ainda há conteúdo escondido ali.
 */
export function Moldura({
  aba,
  largura = 'leitura',
  children,
}: {
  /** `null` nas telas que não são abas (detalhe, teoria): sem barra. */
  aba: Aba | null
  largura?: LarguraDaMoldura
  children?: ReactNode
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
        <div style={{ maxWidth: LARGURA_DA_MOLDURA[largura], margin: '0 auto' }}>{children}</div>
      </main>
      {aba !== null && <BarraInferior atual={aba} />}
    </>
  )
}
