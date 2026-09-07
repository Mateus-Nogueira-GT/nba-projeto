import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

/**
 * BADGE DA NOTA DA PARTIDA.
 *
 * Paleta PRÓPRIA, deliberadamente distinta do grau de confiança do apito: as
 * duas escalas convivem no mesmo app e significam coisas diferentes —
 * desempenho já acontecido de um lado, força de um sinal de estratégia do
 * outro. Cor compartilhada faria o assinante ler as duas como a mesma coisa.
 *
 * "Própria" é sobre O SIGNIFICADO, não sobre onde o hex mora: as cores vêm de
 * `componente.notaFaixa*` (camada 3), que referencia `semantico` (camada 2),
 * que referencia `primitivo` (camada 1) — as mesmas três camadas de todo o
 * resto do design system. Rotear por elas não junta a nota com o grau de
 * confiança; só tira o hex daqui, que é o que o teste "hex direto" cobra de
 * QUALQUER componente, sem exceção por nome de arquivo.
 */
export type NotaPartidaProps = {
  nota: number | null
  /**
   * O badge no DESTAQUE dos quatro números do perfil, onde a nota é "o
   * número" do jogador: maior e sem largura mínima. Sem isso ele saía do
   * mesmo tamanho da célula de tabela e perdia a hierarquia ao lado dos três
   * números em Anton (duas medidas no artboard, `.nota` e `.n`).
   */
  destaque?: boolean
}

/** Faixas da spec: <6 fraca · 6–6.9 mediana · 7–7.9 boa · 8–8.9 ótima · 9+ excepcional. */
const FAIXAS: { minimo: number; fundo: string; texto: string }[] = [
  { minimo: 9, ...componente.notaFaixaExcepcional },
  { minimo: 8, ...componente.notaFaixaOtima },
  { minimo: 7, ...componente.notaFaixaBoa },
  { minimo: 6, ...componente.notaFaixaMediana },
  { minimo: 0, ...componente.notaFaixaFraca },
]

function faixaDe(nota: number) {
  return FAIXAS.find((f) => nota >= f.minimo) ?? FAIXAS[FAIXAS.length - 1]!
}

export function NotaPartida({ nota, destaque = false }: NotaPartidaProps) {
  if (nota === null) {
    return <span>—</span>
  }

  const faixa = faixaDe(nota)
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: destaque ? undefined : 34,
        textAlign: 'center',
        padding: destaque ? '2px 8px' : '2px 6px',
        borderRadius: 6,
        background: faixa.fundo,
        color: faixa.texto,
        fontFamily: semantico.fonteRotulo,
        fontSize: destaque ? 14 : 12,
        fontWeight: 700,
        letterSpacing: 0.3,
      }}
    >
      {nota.toFixed(1).replace('.', ',')}
    </span>
  )
}
