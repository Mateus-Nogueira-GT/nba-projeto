import { notFound } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { telaDoJogador } from '@/modules/entrega/estatisticas/jogador'
import type { LinhaHistorico, Numeros } from '@/modules/entrega/estatisticas/jogador'
import { rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { Tabela, UltimaAtualizacao } from '@/design-system/componentes'
import type { Coluna } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'
import { Moldura, Secao, SemBanco } from '../../moldura'

export const dynamic = 'force-dynamic'

function num(v: number | null, casas = 1): string {
  if (v === null) return '—'
  return v.toFixed(casas).replace('.', ',')
}

function pct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`
}

function dataCurta(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const COLUNAS: Coluna<LinhaHistorico>[] = [
  {
    chave: 'jogo',
    rotulo: 'Jogo',
    fixa: true,
    celula: (l) => (
      <span>
        {dataCurta(l.data)}{' '}
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
  { chave: 'min', rotulo: 'MIN', descricao: 'Minutos', alinhamento: 'direita', celula: (l) => num(l.minutos, 0) },
  { chave: 'pts', rotulo: 'PTS', descricao: 'Pontos', alinhamento: 'direita', celula: (l) => l.pontos },
  { chave: 'reb', rotulo: 'REB', descricao: 'Rebotes', alinhamento: 'direita', celula: (l) => l.rebotes },
  { chave: 'ast', rotulo: 'AST', descricao: 'Assistências', alinhamento: 'direita', celula: (l) => l.assistencias },
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
    descricao: 'Aproveitamento de três pontos',
    alinhamento: 'direita',
    celula: (l) => pct(l.tresPercentual),
  },
]

function Grupo({ titulo, itens }: { titulo: string; itens: [string, string][] }) {
  return (
    <div
      style={{
        border: `1px solid ${semantico.divisor}`,
        borderRadius: 10,
        padding: 12,
        background: semantico.superficie,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 13, color: semantico.textoSecundario }}>
        {titulo}
      </h3>
      <dl style={{ margin: 0, display: 'grid', gap: 4 }}>
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <dt style={{ color: semantico.textoSecundario }}>{rotulo}</dt>
            <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function NumerosCompletos({ n }: { n: Numeros }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 10,
      }}
    >
      <Grupo
        titulo="Ataque"
        itens={[
          ['Pontos', num(n.ataque.pontos)],
          ['Assistências', num(n.ataque.assistencias)],
          ['FG%', pct(n.ataque.fgPercentual)],
          ['3P%', pct(n.ataque.tresPercentual)],
          ['LL%', pct(n.ataque.lancePercentual)],
        ]}
      />
      <Grupo
        titulo="Defesa"
        itens={[
          ['Rebotes', num(n.defesa.rebotesTotal)],
          ['Ofensivos', num(n.defesa.rebotesOf)],
          ['Defensivos', num(n.defesa.rebotesDef)],
          ['Roubos', num(n.defesa.roubos)],
          ['Bloqueios', num(n.defesa.bloqueios)],
        ]}
      />
      <Grupo
        titulo="Posse"
        itens={[
          ['Minutos', num(n.posse.minutos)],
          ['Turnovers', num(n.posse.turnovers)],
          ['Faltas', num(n.posse.faltas)],
          ['Saldo em quadra', num(n.posse.saldoQuadra)],
        ]}
      />
    </div>
  )
}

export default async function PaginaJogador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!process.env.DATABASE_URL) return <SemBanco />

  const agora = new Date()
  const tela = await telaDoJogador(getDb(), id, {
    temporada: String(agora.getUTCFullYear()),
  })
  if (tela === null) notFound()

  const { perfil, aoVivo } = tela

  return (
    <Moldura
      titulo={perfil.nome}
      subtitulo={[
        perfil.timeSigla && perfil.timeNome ? `${perfil.timeSigla} · ${perfil.timeNome}` : null,
        perfil.posicao,
        perfil.numeroCamisa !== null ? `nº ${perfil.numeroCamisa}` : null,
        perfil.alturaCm !== null ? `${perfil.alturaCm} cm` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {!perfil.ativo && (
        <p
          style={{
            margin: '0 0 12px',
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 13,
            color: semantico.alerta,
            border: `1px solid ${semantico.alerta}`,
          }}
        >
          Jogador fora da liga segundo o provedor.
        </p>
      )}

      {perfil.timeId && (
        <p style={{ margin: '0 0 8px', fontSize: 13 }}>
          <a href={rotaDoTime(perfil.timeId)} style={{ color: semantico.textoSecundario }}>
            Ver time →
          </a>
        </p>
      )}

      {aoVivo && (
        <section
          aria-label="Em jogo agora"
          style={{
            border: `1px solid ${semantico.apitoModoFire}`,
            borderRadius: 10,
            padding: 12,
            background: semantico.superficieElevada,
            marginTop: 8,
          }}
        >
          <h2 style={{ margin: '0 0 6px', fontSize: 14, color: semantico.apitoModoFire }}>
            Em jogo · {aoVivo.adversarioSigla}
            {aoVivo.quartoAtual !== null && ` · ${aoVivo.quartoAtual}º quarto`}
            {aoVivo.tempoRestante && ` · ${aoVivo.tempoRestante}`}
          </h2>
          <p style={{ margin: 0, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
            {aoVivo.pontos} PTS · {aoVivo.rebotes} REB · {aoVivo.assistencias} AST
            {aoVivo.placar && (
              <span style={{ fontSize: 13, color: semantico.textoSecundario }}>
                {' '}
                · placar {aoVivo.placar}
              </span>
            )}
          </p>
          {aoVivo.porQuarto.length > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: semantico.textoSecundario }}>
              {aoVivo.porQuarto.map((q) => `${q.quarto}º: ${q.pontos}`).join(' · ')}
            </p>
          )}
        </section>
      )}

      <Secao titulo={`Perfil da temporada · ${tela.jogosDisputados} jogo${tela.jogosDisputados === 1 ? '' : 's'}`}>
        <NumerosCompletos n={tela.perfilNumeros} />
      </Secao>

      <Secao titulo="Histórico">
        <Tabela
          legenda="Uma linha por partida, da mais recente para a mais antiga"
          colunas={COLUNAS}
          linhas={tela.historico}
          chaveDaLinha={(l) => l.jogoId}
          vazio="Nenhuma partida registrada para este jogador."
        />
      </Secao>

      <UltimaAtualizacao em={tela.atualizacao.em} fonte={tela.atualizacao.fonte} agora={agora} />
    </Moldura>
  )
}
