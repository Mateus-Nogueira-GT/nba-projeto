import { Fragment, type ReactNode } from 'react'
import { CabecalhoJogo } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import type { JogoResumo } from '@/modules/entrega/lista-por-jogo'

import { SilhuetaPaga } from './SilhuetaPaga'

/**
 * OS JOGOS DO DIA, SEM O SINAL — a Lista e o Fire Live do grátis.
 *
 * Mostra que há rodada e quais confrontos; quem apitou, o nível e a confiança
 * são 100% pagos (spec de planos, decisão 5). Recebe o mesmo `JogoResumo` que a
 * tela paga usa nos cabeçalhos de seção — nada é lido a mais.
 *
 * Identidade 05: o confronto deixou de ser uma linha de siglas e passou a ser o
 * MESMO `CabecalhoJogo` da tela paga, com as silhuetas abaixo. A moldura do
 * grátis vira a do assinante com o conteúdo coberto, que é o que o convite
 * precisa mostrar — uma lista de siglas não diz o que ele está perdendo.
 */
export function JogosDoDia({
  jogos,
  fuso,
  temperatura = 'frio',
  convite,
}: {
  jogos: JogoResumo[]
  fuso: string
  /**
   * A chamada para assinar, repetida UMA vez no meio da página.
   *
   * Sem ela o visitante de desktop rolava dois mil pixels de silhueta idêntica
   * sem nenhuma chamada à vista: a faixa do topo sai da tela e a da lateral vai
   * junto, porque a coluna inteira é mais alta que a viewport (auditoria de UX
   * para web, §4.8). UMA repetição, depois do terceiro jogo — o convite a cada
   * bloco vira anúncio.
   */
  convite?: ReactNode
  /**
   * O universo do CABEÇALHO. A silhueta é neutra nos dois: o Fire Live do
   * grátis nunca veste o quente, porque o quente é o modo fire e o modo fire é
   * o sinal (identidade 05, §8).
   */
  temperatura?: 'frio' | 'quente'
}) {
  if (jogos.length === 0) {
    return <p style={{ color: semantico.textoSecundario }}>Sem jogos hoje.</p>
  }

  return (
    <div style={{ display: 'grid', gap: 18, marginTop: 16 }}>
      {jogos.map((jogo, i) => (
        <Fragment key={jogo.id}>
          {convite && i === 3 && convite}
          <section>
            <CabecalhoJogo
              casaSigla={jogo.casaSigla}
              visitanteSigla={jogo.visitanteSigla}
              horarioUtc={jogo.dataHoraUtc}
              fuso={fuso}
              status={jogo.status}
              quartoAtual={jogo.quartoAtual}
              placarCasa={jogo.placarCasa}
              placarVisitante={jogo.placarVisitante}
              temperatura={temperatura}
            />
            <SilhuetaPaga forma="cards" />
          </section>
        </Fragment>
      ))}
    </div>
  )
}
