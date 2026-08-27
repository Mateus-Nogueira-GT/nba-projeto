import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { exigirAcessoEstatisticasSeConfigurado } from '@/modules/plataforma/assinatura/guarda'
import { buscar } from '@/modules/entrega/estatisticas/busca'
import { dataValidaOuHoje, navegacaoDeDatas } from '@/modules/entrega/estatisticas/calendario'
import { telaJogosDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { telaDaClassificacao } from '@/modules/entrega/estatisticas/time'
import { rotaDoJogador, rotaDoJogo, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { horaCurta as horaDoJogo } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { UltimaAtualizacao } from '@/design-system/componentes'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'
import { Secao, SemBanco, SOBRANCELHA_STATS } from './moldura'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Estatísticas · IA da NBA' }

function Campo({ valor }: { valor: string }) {
  return (
    <form action="/estatisticas" method="get" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
      <input
        type="search"
        name="q"
        defaultValue={valor}
        placeholder="Buscar jogador ou time"
        aria-label="Buscar jogador ou time"
        style={{
          flex: 1,
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${semantico.divisor}`,
          background: semantico.superficie,
          color: semantico.textoPrimario,
          fontSize: 14,
        }}
      />
      <button
        type="submit"
        style={{
          padding: '10px 16px',
          borderRadius: 8,
          border: 'none',
          background: semantico.textoPrimario,
          color: semantico.textoSobreCor,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Buscar
      </button>
    </form>
  )
}

const ESTADO_ROTULO: Record<string, string> = {
  AGENDADO: '',
  AO_VIVO: 'AO VIVO',
  ENCERRADO: 'encerrado',
}

export default async function PaginaEstatisticas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcessoEstatisticasSeConfigurado()
  const params = await searchParams
  const bruto = Array.isArray(params.q) ? params.q[0] : params.q
  const termo = (bruto ?? '').trim()

  if (!process.env.DATABASE_URL) return <SemBanco />

  const db = getDb()
  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(agora, fuso)
  const bruta = Array.isArray(params.data) ? params.data[0] : params.data
  const data = dataValidaOuHoje(bruta, hoje)
  const temporada = temporadaDe(agora, calendarioDoRuleset(ruleset))

  const [doDia, classificacao, resultados] = await Promise.all([
    telaJogosDoDia(db, data, fuso),
    telaDaClassificacao(db, temporada),
    termo.length > 0 ? buscar(db, termo) : Promise.resolve([]),
  ])

  return (
    <Moldura aba="stats">
      <CabecalhoTela sobrancelha={SOBRANCELHA_STATS} titulo="STATS" />

      <Campo valor={termo} />

      {termo.length > 0 && (
        <Secao titulo={`Resultados para "${termo}"`}>
          {resultados.length === 0 ? (
            <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
              Nada encontrado. A busca aceita nome parcial e grafia aproximada.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {resultados.map((r) => (
                <li key={`${r.tipo}-${r.id}`}>
                  <a
                    href={r.tipo === 'JOGADOR' ? rotaDoJogador(r.id) : rotaDoTime(r.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${semantico.divisor}`,
                      background: semantico.superficie,
                      color: semantico.textoPrimario,
                      textDecoration: 'none',
                      fontSize: 14,
                    }}
                  >
                    <span>
                      {r.nome}
                      {r.tipo === 'JOGADOR' && !r.ativo && (
                        <em
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: semantico.alerta,
                            fontStyle: 'normal',
                          }}
                        >
                          fora da liga
                        </em>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: semantico.textoSecundario }}>
                      {r.tipo === 'JOGADOR'
                        ? [r.timeSigla, r.posicao].filter(Boolean).join(' · ') || 'jogador'
                        : `time${r.conferencia ? ` · ${r.conferencia}` : ''}`}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      <Secao titulo="Jogos do dia">
        {(() => {
          const nav = navegacaoDeDatas(data)
          const estilo = { color: semantico.textoSecundario, fontSize: 13 } as const
          return (
            <nav
              aria-label="Navegar por data"
              style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 8 }}
            >
              <a href={`/estatisticas?data=${nav.anterior}`} style={estilo}>
                ← dia anterior
              </a>
              {data !== hoje && (
                <a href="/estatisticas" style={estilo}>
                  hoje
                </a>
              )}
              <a href={`/estatisticas?data=${nav.seguinte}`} style={estilo}>
                dia seguinte →
              </a>
            </nav>
          )
        })()}
        {doDia.jogos.length === 0 ? (
          <p style={{ fontSize: 13, color: semantico.textoSecundario }}>Nenhum jogo hoje.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {doDia.jogos.map((j) => (
              <li key={j.id}>
                {/* O card inteiro linka para a partida — as siglas dos times não
                    são mais links próprios (aninhar <a> dentro de <a> é HTML
                    inválido). O time continua acessível a partir da tela da
                    partida. */}
                <a
                  href={rotaDoJogo(j.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${semantico.divisor}`,
                    background: semantico.superficie,
                    color: semantico.textoPrimario,
                    textDecoration: 'none',
                    fontSize: 14,
                  }}
                >
                  <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span>{j.casa.sigla}</span>
                    <span style={{ color: semantico.textoSecundario }}>×</span>
                    <span>{j.visitante.sigla}</span>
                  </span>
                  <span style={{ fontSize: 12, color: semantico.textoSecundario }}>
                    {j.status === 'AGENDADO'
                      ? horaDoJogo(j.dataHoraUtc, fuso)
                      : `${j.casa.placar ?? 0}–${j.visitante.placar ?? 0}`}
                    {j.status !== 'AGENDADO' && ` · ${ESTADO_ROTULO[j.status]}`}
                    {j.status === 'AO_VIVO' && j.quartoAtual !== null && ` · ${j.quartoAtual}º Q`}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Times">
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 6,
          }}
        >
          {classificacao.linhas.map((t) => (
            <li key={t.timeId}>
              <a
                href={rotaDoTime(t.timeId)}
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
                <span>
                  {t.posicao !== null && (
                    <span style={{ color: semantico.textoSecundario }}>{t.posicao}º </span>
                  )}
                  {t.sigla}
                </span>
                <span style={{ color: semantico.textoSecundario }}>
                  {t.vitorias}–{t.derrotas}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Secao>

      {/* Requisito: TODA tela da aba informa o horário do dado. */}
      <UltimaAtualizacao em={doDia.atualizacao.em} fonte={doDia.atualizacao.fonte} agora={agora} fuso={fuso} />
    </Moldura>
  )
}
