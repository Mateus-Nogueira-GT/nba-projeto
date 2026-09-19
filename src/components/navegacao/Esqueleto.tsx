import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

import type { Aba } from './abas'
import { Moldura, type LarguraDaMoldura } from './Moldura'

/**
 * O QUE A TELA MOSTRA ENQUANTO O SERVIDOR RESPONDE.
 *
 * Toda tela do app é `force-dynamic` e volta do servidor entre 200ms e 1s
 * (ADR-0008). Sem uma fronteira de Suspense, o roteador do Next mantém a tela
 * ANTERIOR inteira nesse intervalo — o usuário toca e absolutamente nada
 * muda. Silêncio não se lê como "carregando", se lê como "travou", e leva a
 * um segundo toque que não acelera nada.
 *
 * A MOLDURA INTEIRA FICA — não só a barra de abas. Ela veste a `Moldura` de
 * verdade (identidade 05), então o cromo, a coluna e o destino aceso continuam
 * desenhados: o que troca é só o conteúdo, e nada pisca entre uma tela e outra.
 *
 * Sem `assistente`: o esqueleto não tem o que perguntar. COM lateral nas telas
 * de aba (correções UX 19/09): a coluna de 320 é reservada por dois blocos
 * cinzas nas alturas dos blocos reais, senão a coluna do conteúdo encolhe de
 * 1120 para 1040 no instante em que a lateral chega — a tela pula a cada
 * navegação a partir de 1280.
 */
function Barra({ largura, altura = 14 }: { largura: string | number; altura?: number }) {
  return (
    <div
      className="esqueleto"
      style={{
        width: largura,
        height: altura,
        borderRadius: 6,
        background: semantico.divisor,
      }}
    />
  )
}

/** Dois blocos nas alturas aproximadas de "Última noite" e "Classificação". */
function LateralDeEsqueleto() {
  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      {[132, 300].map((altura) => (
        <div
          key={altura}
          className="esqueleto"
          style={{
            height: altura,
            borderRadius: componente.cardRaio,
            background: semantico.superficie,
            border: `1px solid ${semantico.divisor}`,
          }}
        />
      ))}
    </div>
  )
}

export function Esqueleto({
  aba,
  largura = 'leitura',
  linhas = 4,
}: {
  aba: Aba | null
  largura?: LarguraDaMoldura
  linhas?: number
}) {
  return (
    <Moldura
      aba={aba}
      largura={largura}
      lateral={aba !== null ? <LateralDeEsqueleto /> : undefined}
    >
      <div aria-busy="true" aria-label="Carregando" style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <Barra largura={140} altura={10} />
          <Barra largura={220} altura={26} />
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {Array.from({ length: linhas }, (_, i) => (
            // Altura de card, não de linha de texto: o esqueleto precisa
            // ocupar o espaço que o conteúdo vai ocupar, senão a tela pula
            // quando ele chega.
            <div
              key={i}
              className="esqueleto"
              style={{
                height: 92,
                borderRadius: componente.cardRaio,
                background: semantico.superficie,
                border: `1px solid ${semantico.divisor}`,
              }}
            />
          ))}
        </div>
      </div>
    </Moldura>
  )
}
