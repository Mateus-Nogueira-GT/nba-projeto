import type { ReactNode } from 'react'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { configuracaoChat } from '@/modules/entrega/chat-limites'

import { BarraInferior, type Aba } from './BarraInferior'
import { BotaoChat } from '../chat/BotaoChat'

/**
 * DUAS LARGURAS, não uma (spec 12/09, §4.1). `leitura` (640) é a coluna de
 * leitura corrida — detalhe do apito, tela teórica: linha curta é decisão de
 * legibilidade e não há grade para preencher. `dados` (1120) é para tabela,
 * box score, perfil e para as telas de CARD: ali a largura vira informação, e
 * a 640 a página ficava vazia em volta de uma tabela espremida ou de uma
 * coluna única de cards. No celular as duas caem para a largura da tela com o
 * mesmo respiro de 16px — só o desktop muda.
 *
 * Lista e Fire Live migraram de `leitura` para `dados` em 15/09: em 640 elas
 * deixavam cerca de 400px vazios de cada lado num monitor comum. Quem usa a
 * largura maior para cards usa `GRADE_DE_CARDS` junto, senão o card estica.
 */
export const LARGURA_DA_MOLDURA = { leitura: 640, dados: 1120 } as const
export type LarguraDaMoldura = keyof typeof LARGURA_DA_MOLDURA

/**
 * A GRADE DOS CARDS — largura de leitura preservada, colunas conforme cabem.
 *
 * O card de entrada não tem largura própria: ele ocupa o que o pai der. Numa
 * coluna só de 1120 ele viraria uma faixa, e o olho teria que atravessar a
 * tela inteira para ler uma linha — pior que o espaço vazio que havia antes.
 * Com `minmax`, cada card fica em torno de 550px (a mesma largura confortável
 * de sempre) e o navegador decide quantos cabem: dois no desktop, um no
 * celular. Sem media query, porque não há um "tamanho de celular" a adivinhar
 * — há o espaço que sobra.
 */
export const GRADE_DE_CARDS = 'repeat(auto-fill, minmax(420px, 1fr))'
/** O mesmo valor como o CSS que sai no HTML — é por ele que os testes afirmam. */
export const GRADE_DE_CARDS_CSS = `grid-template-columns:${GRADE_DE_CARDS}`

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
      {/* A flag decide se o assistente EXISTE na tela. Sem esta condição, o
          trabalho entregue com CHAT_HABILITADO desligada põe em produção um
          botão que só sabe dizer "fora do ar" — pior que não ter botão. */}
      {aba !== null && configuracaoChat().habilitado && <BotaoChat />}
    </>
  )
}
