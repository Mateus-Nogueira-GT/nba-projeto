import type { CSSProperties, ReactNode } from 'react'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { configuracaoChat } from '@/modules/entrega/chat-limites'

import type { Aba } from './abas'
import { BarraInferior } from './BarraInferior'
import { BarraTopo, type ContaNaBarra } from './BarraTopo'
import { BotaoChat } from '../chat/BotaoChat'
import estilos from './Moldura.module.css'

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
 *
 * O `min(420px, 100%)` é a correção da identidade 05: o `minmax(420px, 1fr)`
 * anterior EXIGIA 420 de cada coluna, e numa tela de 390 (onde sobram 358
 * úteis) isso empurrava a grade para fora e criava rolagem horizontal — o que
 * o manual proíbe em 320, 390, 768 e 1440. Com o `min`, a coluna pede 420 ou o
 * que houver, o que for menor.
 */
export const GRADE_DE_CARDS = 'repeat(auto-fill, minmax(min(420px, 100%), 1fr))'
/** O mesmo valor como o CSS que sai no HTML — é por ele que os testes afirmam. */
export const GRADE_DE_CARDS_CSS = `grid-template-columns:${GRADE_DE_CARDS}`

/**
 * Moldura das telas do app: o cromo, a coluna de conteúdo e a lateral.
 *
 * TRÊS REGIÕES, e o que muda entre larguras é só onde cada uma senta
 * (identidade 05, §5):
 *
 *   < 1024   barra inferior · coluna única · sem lateral
 *   1024+    barra do topo  · coluna até a largura pedida · sem lateral
 *   1280+    barra do topo  · conteúdo fluido até 1040 · lateral de 320 fixa
 *
 * As DUAS barras saem no HTML e o CSS esconde uma. É o que mantém esta moldura
 * como componente de servidor: sem `usePathname`, sem medir janela, sem
 * JavaScript em toda página só para escolher uma barra.
 *
 * O `paddingBottom` reserva a altura da barra fixa. Sem ele o último card da
 * lista fica embaixo da navegação — e numa lista longa ninguém percebe que
 * ainda há conteúdo escondido ali.
 */
export function Moldura({
  aba,
  largura = 'leitura',
  assistente = false,
  conta,
  lateral,
  children,
}: {
  /** `null` nas telas que não são abas (detalhe, teoria): sem barra, sem lateral. */
  aba: Aba | null
  largura?: LarguraDaMoldura
  /**
   * O nível da sessão dá direito ao assistente (MVP ou mais — spec, decisão
   * 7). A PÁGINA sabe (ela já tem `acesso` de `exigirNivel`); a Moldura não
   * consulta banco nem sessão, só recebe a resposta. Padrão `false`: uma
   * tela que esqueceu de passar a prop erra para o lado de ESCONDER o botão,
   * nunca de mostrá-lo a quem não tem direito.
   */
  assistente?: boolean
  /**
   * Quem está logado — só para o avatar da barra do topo. Ausente, a barra não
   * mostra atalho de conta (é o caso das telas sem sessão em escopo).
   */
  conta?: ContaNaBarra
  /**
   * A coluna da direita (identidade 05, §7). Só existe a partir de 1280 e só
   * quando a TELA passa uma: a moldura não monta lateral por conta própria,
   * senão o detalhe do apito e a tela teórica ganhariam uma.
   */
  lateral?: ReactNode
  children?: ReactNode
}) {
  const classes = [
    estilos.raiz,
    aba === null ? estilos.semAba : '',
    lateral ? estilos.comLateral : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={{
        // Identidade 03: fim do fundo chapado — a tela respira num gradiente.
        background: componente.fundoTela,
        color: semantico.textoPrimario,
        fontFamily: semantico.fonteCorpo,
      }}
    >
      {aba !== null && (
        <div className={estilos.topo}>
          <BarraTopo atual={aba} conta={conta} />
        </div>
      )}

      <div className={estilos.corpo}>
        <main className={estilos.conteudo}>
          <div
            className={estilos.coluna}
            style={{ '--largura-coluna': `${LARGURA_DA_MOLDURA[largura]}px` } as CSSProperties}
          >
            {children}
          </div>
        </main>
        {lateral && (
          <aside className={estilos.lateral} aria-label="Painel lateral">
            {lateral}
          </aside>
        )}
      </div>

      {aba !== null && <BarraInferior atual={aba} />}
      {/* Duas condições, duas perguntas diferentes. A flag decide se o
          assistente EXISTE em produção (sem ela, CHAT_HABILITADO desligada
          publicaria um botão que só sabe dizer "fora do ar"). `assistente`
          decide se ESTE nível tem direito (grátis não tem — spec, decisão
          7): sem ela, o botão apareceria para quem a API vai barrar com
          403 na primeira pergunta. */}
      {aba !== null && assistente && configuracaoChat().habilitado && <BotaoChat />}
    </div>
  )
}
