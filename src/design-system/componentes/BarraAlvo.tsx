import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

export type BarraAlvoProps = {
  /** Valor já feito no 1º quarto. */
  observado: number
  /** Alvo do apito no 1º quarto. */
  alvo: number
}

/**
 * A barra "rumo ao alvo" do Fire Live — identidade 03. Preenchimento quente
 * com brilho, marca vertical no fim (o alvo), contagem escrita ao lado: a cor
 * nunca é o único sinal.
 */
export function BarraAlvo({ observado, alvo }: BarraAlvoProps) {
  const proporcao = alvo <= 0 ? 1 : Math.min(1, observado / alvo)
  const largura = `${Math.round(proporcao * 100)}%`

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: semantico.fonteRotulo,
            fontSize: 10,
            letterSpacing: 1,
            color: semantico.textoSecundario,
            textTransform: 'uppercase',
          }}
        >
          Rumo ao alvo
        </span>
        <span
          style={{
            fontFamily: semantico.fonteRotulo,
            fontSize: 11,
            fontWeight: 700,
            color: semantico.textoPrimario,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {observado} / {alvo}
        </span>
      </div>
      <div
        style={{
          height: 7,
          borderRadius: 4,
          background: componente.barraAlvoFundo,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: largura,
            height: '100%',
            borderRadius: 4,
            background: componente.barraAlvoPreenchido,
            boxShadow: componente.contextoQuente.brilho,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: 0,
            top: -2,
            bottom: -2,
            width: 2,
            background: semantico.textoPrimario,
          }}
        />
      </div>
    </div>
  )
}
