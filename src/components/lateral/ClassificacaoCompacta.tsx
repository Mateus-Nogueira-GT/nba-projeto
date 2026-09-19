'use client'

import Link from 'next/link'
import { useState } from 'react'

import { formatarAproveitamento } from '@/components/formato'
import { IdentidadeTime } from '@/design-system/componentes'
import type { DadosDaLateral } from '@/modules/entrega/lateral'

import { Bloco } from './Bloco'
import estilos from './Lateral.module.css'

/**
 * A CLASSIFICAÇÃO EM 320 px — uma conferência por vez, em abas.
 *
 * Aberta na primeira conferência e SEM persistir a escolha: trocar de aba aqui
 * é um olhar, não uma preferência da conta como a ordem da Lista ou a lente do
 * card. Por isso o único estado de cliente da lateral mora aqui, e é um índice.
 *
 * O rótulo da aba vem do provedor. O app nunca carimba "Leste" por conta
 * própria — quem não tem conferência no cadastro fica fora da lateral e aparece
 * na tabela cheia de Estatísticas, que tem largura para o grupo de exceção.
 */
export function ClassificacaoCompacta({
  conferencias,
  temporada,
}: {
  conferencias: DadosDaLateral['classificacao']['conferencias']
  temporada: string
}) {
  const [ativa, setAtiva] = useState(0)
  const atual = conferencias[ativa]

  return (
    <Bloco titulo="Classificação">
      {conferencias.length > 1 && (
        <div role="tablist" aria-label="Conferência" className={estilos.abas}>
          {conferencias.map((grupo, i) => (
            <button
              key={grupo.conferencia}
              type="button"
              role="tab"
              aria-selected={i === ativa}
              className={`${estilos.aba} ${i === ativa ? estilos.abaAtiva : ''}`}
              onClick={() => setAtiva(i)}
            >
              {grupo.conferencia}
            </button>
          ))}
        </div>
      )}

      {atual ? (
        <table className={estilos.tabela} role="tabpanel">
          {/* Legenda clipada, como em toda tabela do app: nome acessível sem
              repetir na tela o que o título do bloco já diz. */}
          <caption className={estilos.soLeitor}>
            Classificação da {atual.conferencia}, da primeira posição para a última
          </caption>
          <thead>
            <tr>
              <th scope="col">Pos</th>
              <th scope="col">Time</th>
              <th scope="col">V–D</th>
              <th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            {atual.linhas.map((linha) => (
              <tr key={linha.timeId}>
                <td>{linha.posicao ?? '—'}</td>
                <td>
                  <IdentidadeTime sigla={linha.sigla} tamanhoLogo={18} />
                </td>
                <td>
                  {linha.vitorias}–{linha.derrotas}
                </td>
                <td>{formatarAproveitamento(linha.aproveitamento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={estilos.apoio}>Sem classificação registrada para {temporada}.</p>
      )}

      <Link className={estilos.link} href="/estatisticas">
        Ver completa
      </Link>
    </Bloco>
  )
}
