import { semantico } from '../tokens/semantico'

/**
 * BADGE DA NOTA DA PARTIDA.
 *
 * Paleta PRÓPRIA, deliberadamente distinta do grau de confiança do apito: as
 * duas escalas convivem no mesmo app e significam coisas diferentes —
 * desempenho já acontecido de um lado, força de um sinal de estratégia do
 * outro. Cor compartilhada faria o assinante ler as duas como a mesma coisa.
 */
export type NotaPartidaProps = { nota: number | null }

/** Faixas da spec: <6 fraca · 6–6.9 mediana · 7–7.9 boa · 8–8.9 ótima · 9+ excepcional. */
const FAIXAS: { minimo: number; fundo: string; texto: string }[] = [
  { minimo: 9, fundo: '#1F6F4A', texto: '#EAFBF2' },
  { minimo: 8, fundo: '#2E7D62', texto: '#EAFBF2' },
  { minimo: 7, fundo: '#3D5A80', texto: '#E8EFF7' },
  { minimo: 6, fundo: '#4A4E69', texto: '#E9E9F0' },
  { minimo: 0, fundo: '#5C3A3A', texto: '#F7E9E9' },
]

function faixaDe(nota: number) {
  return FAIXAS.find((f) => nota >= f.minimo) ?? FAIXAS[FAIXAS.length - 1]!
}

export function NotaPartida({ nota }: NotaPartidaProps) {
  if (nota === null) {
    return <span>—</span>
  }

  const faixa = faixaDe(nota)
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 34,
        textAlign: 'center',
        padding: '2px 6px',
        borderRadius: 6,
        background: faixa.fundo,
        color: faixa.texto,
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.3,
      }}
    >
      {nota.toFixed(1).replace('.', ',')}
    </span>
  )
}
