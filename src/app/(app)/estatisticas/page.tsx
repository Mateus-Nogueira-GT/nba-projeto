import { getDb } from '@/modules/dominio/db/cliente'
import { buscar } from '@/modules/entrega/estatisticas/busca'
import { telaJogosDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { telaDaClassificacao } from '@/modules/entrega/estatisticas/time'
import { rotaDoJogador, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { UltimaAtualizacao } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'
import { Moldura, Secao, SemBanco } from './moldura'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Estatísticas · IA da NBA' }

/**
 * Temporada corrente.
 *
 * TODO(ingestão): hoje é derivada do ano corrente. Quando a ingestão passar a
 * gravar a temporada oficial, ler dela — a NBA atravessa o ano civil e o
 * rótulo "2025-26" não sai de um `getFullYear()`.
 */
function temporadaCorrente(agora: Date): string {
  return String(agora.getUTCFullYear())
}

function horaDoJogo(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

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
  const params = await searchParams
  const bruto = Array.isArray(params.q) ? params.q[0] : params.q
  const termo = (bruto ?? '').trim()

  if (!process.env.DATABASE_URL) return <SemBanco />

  const db = getDb()
  const agora = new Date()
  const hoje = agora.toISOString().slice(0, 10)
  const temporada = temporadaCorrente(agora)

  const [doDia, classificacao, resultados] = await Promise.all([
    telaJogosDoDia(db, hoje),
    telaDaClassificacao(db, temporada),
    termo.length > 0 ? buscar(db, termo) : Promise.resolve([]),
  ])

  return (
    <Moldura
      titulo="Estatísticas"
      subtitulo="Jogos do dia, jogadores e times — dado canônico, sem estratégia"
      voltarPara="/"
    >
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
        {doDia.jogos.length === 0 ? (
          <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
            Nenhum jogo hoje.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {doDia.jogos.map((j) => (
              <li
                key={j.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${semantico.divisor}`,
                  background: semantico.superficie,
                  fontSize: 14,
                }}
              >
                <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <a href={rotaDoTime(j.casa.id)} style={{ color: semantico.textoPrimario }}>
                    {j.casa.sigla}
                  </a>
                  <span style={{ color: semantico.textoSecundario }}>×</span>
                  <a href={rotaDoTime(j.visitante.id)} style={{ color: semantico.textoPrimario }}>
                    {j.visitante.sigla}
                  </a>
                </span>
                <span style={{ fontSize: 12, color: semantico.textoSecundario }}>
                  {j.status === 'AGENDADO'
                    ? horaDoJogo(j.dataHoraUtc)
                    : `${j.casa.placar ?? 0}–${j.visitante.placar ?? 0}`}
                  {j.status !== 'AGENDADO' && ` · ${ESTADO_ROTULO[j.status]}`}
                  {j.status === 'AO_VIVO' && j.quartoAtual !== null && ` · ${j.quartoAtual}º Q`}
                </span>
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
      <UltimaAtualizacao em={doDia.atualizacao.em} fonte={doDia.atualizacao.fonte} agora={agora} />
    </Moldura>
  )
}
