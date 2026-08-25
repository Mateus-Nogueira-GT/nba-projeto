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
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        <caption
          style={{
            textAlign: 'left',
            fontSize: 12,
            color: semantico.textoSecundario,
            paddingBottom: 6,
          }}
        >
          {legenda}
        </caption>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th
                key={c.chave}
                scope="col"
                title={c.descricao}
                style={{
                  textAlign: c.alinhamento === 'direita' ? 'right' : 'left',
                  padding: '8px 10px',
                  borderBottom: `1px solid ${semantico.divisor}`,
                  color: semantico.textoSecundario,
                  fontWeight: 600,
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
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  style={{
                    textAlign: c.alinhamento === 'direita' ? 'right' : 'left',
                    padding: '8px 10px',
                    borderBottom: `1px solid ${semantico.divisor}`,
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
