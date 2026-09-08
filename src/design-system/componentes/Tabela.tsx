import type { ReactNode } from 'react'
import { semantico } from '../tokens/semantico'

export type Coluna<T> = {
  chave: string
  /** Cabeçalho curto: MIN, PTS, REB, AST, FG%, 3P%. */
  rotulo: string
  /** Nome por extenso para leitor de tela — "MIN" não se lê sozinho. */
  descricao?: string
  alinhamento?: 'esquerda' | 'direita'
  /** Colunas de identificação ficam presas na rolagem horizontal. */
  fixa?: boolean
  celula: (linha: T) => ReactNode
}

export type TabelaProps<T> = {
  legenda: string
  colunas: Coluna<T>[]
  linhas: T[]
  chaveDaLinha: (linha: T) => string
  vazio?: string
}

/**
 * Tabela de estatísticas.
 *
 * Rola HORIZONTALMENTE dentro do próprio contêiner. Um histórico com
 * MIN/PTS/REB/AST/FG%/3P% não cabe em tela de celular, e deixar a página
 * inteira rolar de lado quebra a leitura de todo o resto — é o defeito mais
 * comum em tabela densa no mobile.
 *
 * A primeira coluna fica presa: perder de vista contra quem foi o jogo torna
 * as outras colunas ilegíveis.
 */
export function Tabela<T>({ legenda, colunas, linhas, chaveDaLinha, vazio }: TabelaProps<T>) {
  if (linhas.length === 0) {
    return (
      <p style={{ fontSize: 13, color: semantico.textoSecundario, margin: '8px 0' }}>
        {vazio ?? 'Sem dados para exibir.'}
      </p>
    )
  }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: semantico.fonteRotulo,
          fontSize: 13,
          letterSpacing: 0.5,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {/* A legenda NOMEIA a tabela para quem não vê, e some para quem vê: o
            cabeçalho da seção logo acima já diz a mesma coisa, e dois títulos
            empilhados são ruído. Tirá-la do DOM tiraria o nome da tabela. */}
        <caption style={SO_LEITOR_DE_TELA}>{legenda}</caption>
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th
                key={c.chave}
                scope="col"
                title={c.descricao}
                style={{
                  textAlign: c.alinhamento === 'direita' ? 'right' : 'left',
                  // A primeira coluna nasce colada à margem esquerda.
                  padding: i === 0 ? '6px 6px 6px 0' : '6px 6px',
                  borderBottom: `1px solid ${semantico.divisor}`,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: semantico.texto40,
                  fontWeight: 700,
                  position: c.fixa ? 'sticky' : undefined,
                  left: c.fixa ? 0 : undefined,
                  background: c.fixa ? semantico.fundo : undefined,
                }}
              >
                {/* Abreviação com forma por extenso disponível ao leitor de tela. */}
                {c.descricao ? <abbr title={c.descricao}>{c.rotulo}</abbr> : c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={chaveDaLinha(linha)}>
              {colunas.map((c, i) => (
                <td
                  key={c.chave}
                  style={{
                    textAlign: c.alinhamento === 'direita' ? 'right' : 'left',
                    padding: i === 0 ? '8px 6px 8px 0' : '8px 6px',
                    // Régua a meia força ENTRE registros: a linha cheia por
                    // linha vira grade e a densidade some.
                    borderBottom: `1px solid ${semantico.divisorSuave}`,
                    position: c.fixa ? 'sticky' : undefined,
                    left: c.fixa ? 0 : undefined,
                    background: c.fixa ? semantico.fundo : undefined,
                  }}
                >
                  {c.celula(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Fora da tela, dentro da árvore de acessibilidade. */
const SO_LEITOR_DE_TELA = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const
