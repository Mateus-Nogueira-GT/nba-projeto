import { notFound } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { exigirAcessoEstatisticasSeConfigurado } from '@/modules/plataforma/assinatura/guarda'
import { telaDoTime } from '@/modules/entrega/estatisticas/time'
import type { BoxScoreDoJogo } from '@/modules/entrega/estatisticas/time'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { diaCurto } from '@/components/formato'
import { Tabela, UltimaAtualizacao } from '@/design-system/componentes'
import type { Coluna } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'
import { Moldura, Secao, SemBanco } from '../../moldura'

export const dynamic = 'force-dynamic'

function pct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`
}

/** Ausência é '—', nunca zero: zero é um número, ausência não é. */
function n(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v)
}

/**
 * Box score por jogo COM QUEBRA POR QUARTO.
 *
 * A prorrogação só ganha coluna quando existe: uma coluna "PR" zerada em todas
 * as linhas rouba largura numa tabela que já rola de lado no celular.
 */
function colunas(temProrrogacao: boolean, fuso: string): Coluna<BoxScoreDoJogo>[] {
  const base: Coluna<BoxScoreDoJogo>[] = [
    {
      chave: 'jogo',
      rotulo: 'Jogo',
      fixa: true,
      celula: (l) => (
        <span>
          {diaCurto(l.data, fuso)}{' '}
          <span style={{ color: semantico.textoSecundario }}>
            {l.emCasa ? 'vs' : '@'} {l.adversarioSigla}
          </span>
        </span>
      ),
    },
    {
      chave: 'res',
      rotulo: 'Res',
      descricao: 'Resultado',
      celula: (l) =>
        l.resultado === null ? (
          '—'
        ) : (
          <span style={{ fontWeight: 700 }}>
            {l.resultado}
            {l.placar && (
              <span style={{ fontWeight: 400, color: semantico.textoSecundario }}> {l.placar}</span>
            )}
          </span>
        ),
    },
    {
      chave: 'q1',
      rotulo: '1º',
      descricao: 'Pontos no 1º quarto',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.q1),
    },
    {
      chave: 'q2',
      rotulo: '2º',
      descricao: 'Pontos no 2º quarto',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.q2),
    },
    {
      chave: 'q3',
      rotulo: '3º',
      descricao: 'Pontos no 3º quarto',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.q3),
    },
    {
      chave: 'q4',
      rotulo: '4º',
      descricao: 'Pontos no 4º quarto',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.q4),
    },
  ]

  if (temProrrogacao) {
    base.push({
      chave: 'pr',
      rotulo: 'PR',
      descricao: 'Prorrogação',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.prorrogacao),
    })
  }

  return [
    ...base,
    {
      chave: 'tot',
      rotulo: 'TOT',
      descricao: 'Total de pontos',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.total),
    },
    {
      chave: 'reb',
      rotulo: 'REB',
      descricao: 'Rebotes',
      alinhamento: 'direita',
      celula: (l) => n(l.rebotesTotal),
    },
    {
      chave: 'ast',
      rotulo: 'AST',
      descricao: 'Assistências',
      alinhamento: 'direita',
      celula: (l) => n(l.assistencias),
    },
    {
      chave: 'to',
      rotulo: 'TO',
      descricao: 'Turnovers',
      alinhamento: 'direita',
      celula: (l) => n(l.turnovers),
    },
    {
      chave: 'fg',
      rotulo: 'FG%',
      descricao: 'Aproveitamento de quadra',
      alinhamento: 'direita',
      celula: (l) => pct(l.fgPercentual),
    },
    {
      chave: 'tres',
      rotulo: '3P%',
      descricao: 'Aproveitamento de três',
      alinhamento: 'direita',
      celula: (l) => pct(l.tresPercentual),
    },
  ]
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div
      style={{
        border: `1px solid ${semantico.divisor}`,
        borderRadius: 10,
        padding: '10px 12px',
        background: semantico.superficie,
        minWidth: 96,
      }}
    >
      <div style={{ fontSize: 11, color: semantico.textoSecundario }}>{rotulo}</div>
      <div style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
    </div>
  )
}

export default async function PaginaTime({ params }: { params: Promise<{ id: string }> }) {
  await exigirAcessoEstatisticasSeConfigurado()
  const { id } = await params
  if (!process.env.DATABASE_URL) return <SemBanco />

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const tela = await telaDoTime(getDb(), id, {
    temporada: temporadaDe(agora, calendarioDoRuleset(ruleset)),
  })
  if (tela === null) notFound()

  const { time, campanha } = tela
  const temProrrogacao = tela.jogosDoTime.some((j) => (j.nosso?.prorrogacao ?? 0) > 0)

  return (
    <Moldura titulo={`${time.sigla} · ${time.nome}`} subtitulo={time.conferencia}>
      <Secao titulo="Campanha">
        {campanha === null ? (
          <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
            Sem classificação registrada para esta temporada.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Numero
              rotulo="Classificação"
              valor={campanha.posicao === null ? '—' : `${campanha.posicao}º`}
            />
            <Numero rotulo="Vitórias" valor={String(campanha.vitorias)} />
            <Numero rotulo="Derrotas" valor={String(campanha.derrotas)} />
            <Numero
              rotulo="Aproveitamento"
              valor={
                campanha.aproveitamento === null
                  ? '—'
                  : `${(campanha.aproveitamento * 100).toFixed(1).replace('.', ',')}%`
              }
            />
            <Numero rotulo="Sequência" valor={campanha.sequencia ?? '—'} />
          </div>
        )}
      </Secao>

      <Secao titulo="Box score por jogo">
        <Tabela
          legenda="Pontos por quarto, da partida mais recente para a mais antiga"
          colunas={colunas(temProrrogacao, ruleset.rodada.fuso)}
          linhas={tela.jogosDoTime}
          chaveDaLinha={(l) => l.jogoId}
          vazio="Nenhuma partida registrada para este time."
        />
      </Secao>

      <Secao titulo="Elenco">
        {tela.elenco.length === 0 ? (
          <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
            Nenhum jogador vinculado a este time.
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 6,
            }}
          >
            {tela.elenco.map((j) => (
              <li key={j.id}>
                <a
                  href={rotaDoJogador(j.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${semantico.divisor}`,
                    color: semantico.textoPrimario,
                    textDecoration: 'none',
                    fontSize: 13,
                  }}
                >
                  <span>{j.nome}</span>
                  <span style={{ color: semantico.textoSecundario }}>
                    {j.posicao ?? (j.numeroCamisa !== null ? `nº ${j.numeroCamisa}` : '')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <UltimaAtualizacao em={tela.atualizacao.em} fonte={tela.atualizacao.fonte} agora={agora} fuso={ruleset.rodada.fuso} />
    </Moldura>
  )
}
