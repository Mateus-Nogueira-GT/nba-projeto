import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

import { BarraInferior, type Aba } from './BarraInferior'

/**
 * O QUE A TELA MOSTRA ENQUANTO O SERVIDOR RESPONDE.
 *
 * Toda tela do app é `force-dynamic` e volta do servidor entre 200ms e 1s
 * (ADR-0008). Sem uma fronteira de Suspense, o roteador do Next mantém a tela
 * ANTERIOR inteira nesse intervalo — o usuário toca e absolutamente nada
 * muda. Silêncio não se lê como "carregando", se lê como "travou", e leva a
 * um segundo toque que não acelera nada.
 *
 * A BARRA DE ABAS FICA. Ela já sabe para onde o usuário vai, então continua
 * desenhada e com o destino aceso: o que troca é só o conteúdo, e a moldura
 * não pisca entre uma tela e outra.
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

export function Esqueleto({ aba, linhas = 4 }: { aba: Aba | null; linhas?: number }) {
  return (
    <>
      <main
        aria-busy="true"
        aria-label="Carregando"
        style={{
          background: componente.fundoTela,
          color: semantico.textoPrimario,
          minHeight: '100vh',
          padding: aba === null ? '24px 16px 64px' : '24px 16px 96px',
          fontFamily: semantico.fonteCorpo,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 18 }}>
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
                  borderRadius: 14,
                  background: semantico.superficie,
                  border: `1px solid ${semantico.divisor}`,
                }}
              />
            ))}
          </div>
        </div>
      </main>
      {aba !== null && <BarraInferior atual={aba} />}
    </>
  )
}
