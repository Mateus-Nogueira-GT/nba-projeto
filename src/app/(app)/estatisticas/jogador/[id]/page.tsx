import { notFound } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { exigirAcessoEstatisticasSeConfigurado } from '@/modules/plataforma/assinatura/guarda'
import { telaDoJogador } from '@/modules/entrega/estatisticas/jogador'
import type { LinhaHistorico, Numeros } from '@/modules/entrega/estatisticas/jogador'
import { BASE_ESTATISTICAS, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { diaCurto } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { Avatar, Tabela, UltimaAtualizacao } from '@/design-system/componentes'
import type { Coluna } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'
import { Secao, SemBanco, SOBRANCELHA_STATS } from '../../moldura'

export const dynamic = 'force-dynamic'

function num(v: number | null, casas = 1): string {
  if (v === null) return '—'
  return v.toFixed(casas).replace('.', ',')
}

function pct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`
}

/**
 * As colunas viraram função do FUSO. A data de cada jogo é a única célula que
 * depende dele, e uma constante de módulo não tem como recebê-lo — era por
 * isso que a tabela do histórico mostrava a data em UTC.
 */
function colunas(fuso: string): Coluna<LinhaHistorico>[] {
  return [
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
    chave: 'min',
    rotulo: 'MIN',
    descricao: 'Minutos',
    alinhamento: 'direita',
    celula: (l) => num(l.minutos, 0),
  },
  {
    chave: 'pts',
    rotulo: 'PTS',
    descricao: 'Pontos',
    alinhamento: 'direita',
    celula: (l) => l.pontos,
  },
  {
    chave: 'reb',
    rotulo: 'REB',
    descricao: 'Rebotes',
    alinhamento: 'direita',
    celula: (l) => l.rebotes,
  },
  {
    chave: 'ast',
    rotulo: 'AST',
    descricao: 'Assistências',
    alinhamento: 'direita',
    celula: (l) => l.assistencias,
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
    descricao: 'Aproveitamento de três pontos',
    alinhamento: 'direita',
    celula: (l) => pct(l.tresPercentual),
  },
  ]
}

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
          <div
            key={rotulo}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
          >
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
          ['2P%', pct(n.ataque.doisPercentual)],
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
  await exigirAcessoEstatisticasSeConfigurado()
  const { id } = await params
  if (!process.env.DATABASE_URL) return <SemBanco />

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const tela = await telaDoJogador(getDb(), id, {
    temporada: temporadaDe(agora, calendarioDoRuleset(ruleset)),
  })
  if (tela === null) notFound()

  const { perfil, aoVivo } = tela

  const subtitulo = [
    perfil.timeSigla && perfil.timeNome ? `${perfil.timeSigla} · ${perfil.timeNome}` : null,
    perfil.posicao,
    perfil.numeroCamisa !== null ? `nº ${perfil.numeroCamisa}` : null,
    perfil.alturaCm !== null ? `${perfil.alturaCm} cm` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Moldura aba={null}>
      <CabecalhoTela
        sobrancelha={SOBRANCELHA_STATS}
        titulo={perfil.nome}
        voltarHref={BASE_ESTATISTICAS}
      />

      {/* Dado canônico: sem anel de apito — a aba de estatísticas não calcula
          estratégia (nivelApito: null é a marca disso, não um esquecimento). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Avatar
          nome={perfil.nome}
          fotoUrl={perfil.fotoUrl}
          timeSigla={perfil.timeSigla ?? ''}
          nivelApito={null}
          tamanho={64}
        />
        {subtitulo && (
          <p style={{ margin: 0, fontSize: 13, color: semantico.textoSecundario }}>{subtitulo}</p>
        )}
      </div>

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

      <Secao
        titulo={`Perfil da temporada · ${tela.jogosDisputados} jogo${tela.jogosDisputados === 1 ? '' : 's'}`}
      >
        <NumerosCompletos n={tela.perfilNumeros} />
      </Secao>

      <Secao titulo="Histórico">
        <Tabela
          legenda="Uma linha por partida, da mais recente para a mais antiga"
          colunas={colunas(ruleset.rodada.fuso)}
          linhas={tela.historico}
          chaveDaLinha={(l) => l.jogoId}
          vazio="Nenhuma partida registrada para este jogador."
        />
      </Secao>

      <UltimaAtualizacao em={tela.atualizacao.em} fonte={tela.atualizacao.fonte} agora={agora} fuso={ruleset.rodada.fuso} />
    </Moldura>
  )
}
