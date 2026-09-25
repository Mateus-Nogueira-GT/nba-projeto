import Link from 'next/link'
import { somarDias } from '@/modules/dominio/rodada'
import type { JogoDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { comTemporada, rotaDoJogador, rotaDoJogo, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import type { TelaClassificacao } from '@/modules/entrega/estatisticas/time'
import { EstadoVazio } from '@/ui/blocos'
import { diaDaRodada, hora } from '@/ui/formato'
import { IconeAvancar, IconeBusca, IconeVoltar } from '@/ui/icones'
import { SeloAoVivo } from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { SeletorTemporada } from '@/ui/SeletorTemporada'
import { identidadeDoTime } from '@/ui/times'
import { CabecalhoStats, FormaVD, SecaoStats, TabelaDados, UltimaAtualizacao, type Coluna } from './Comum'
import type { DadosDoIndice } from './indice'
import { aproveitamento, diaDaSemana, jogosAtras, TRILHO, trilhoDa } from './regras'
import s from './Indice.module.css'

/** "Jogos do dia" só é verdade para hoje; outro dia se nomeia. */
function tituloJogosDoDia(data: string, hoje: string): string {
  return data === hoje ? 'Jogos do dia' : `Jogos de ${diaDaRodada(data)}`
}

function Busca({ termo, escolhida }: { termo: string; escolhida: string | undefined }) {
  return (
    <form action="/estatisticas" method="get" className={s.buscaForm} role="search">
      {escolhida && <input type="hidden" name="temporada" value={escolhida} />}
      <label htmlFor="busca-stats" className={s.buscaRotulo}>
        Buscar jogador ou time
      </label>
      <div className={s.buscaLinha}>
        <span className={s.busca}>
          <IconeBusca tamanho={20} />
          <input
            id="busca-stats"
            type="search"
            name="q"
            defaultValue={termo}
            placeholder="Nome, sobrenome ou sigla"
            autoComplete="off"
          />
        </span>
        <button type="submit" className={s.buscar}>
          Buscar
        </button>
      </div>
    </form>
  )
}

function ResultadosDaBusca({ dados }: { dados: DadosDoIndice }) {
  const { termo, resultados } = dados
  const { escolhida } = dados.seletor
  return (
    <SecaoStats titulo={`Resultados para “${termo}”`} aux={resultados.length > 0 ? `${resultados.length}` : undefined}>
      {resultados.length === 0 ? (
        <p className={s.nada}>Nada encontrado. A busca aceita nome parcial e grafia aproximada.</p>
      ) : (
        <ul className={s.resultados}>
          {resultados.map((r) => (
            <li key={`${r.tipo}-${r.id}`}>
              <Link
                href={
                  r.tipo === 'JOGADOR'
                    ? rotaDoJogador(r.id, {
                        periodo: '10',
                        atributo: 'PONTOS',
                        q: termo,
                        ...(escolhida ? { temporada: escolhida } : {}),
                      })
                    : rotaDoTime(r.id, escolhida)
                }
                className={s.resultado}
              >
                {r.tipo === 'JOGADOR' ? (
                  <FotoJogador nome={r.nome} fotoUrl={r.fotoUrl} tamanho={36} timeSigla={r.timeSigla ?? undefined} />
                ) : (
                  <LogoTime sigla={r.sigla} tamanho={32} />
                )}
                <span className={s.resultadoTexto}>
                  <strong>{r.nome}</strong>
                  <span>
                    {r.tipo === 'JOGADOR'
                      ? [r.timeSigla, r.posicao].filter(Boolean).join(' · ') || 'jogador'
                      : `time${r.conferencia ? ` · ${r.conferencia}` : ''}`}
                  </span>
                </span>
                {r.tipo === 'JOGADOR' && !r.ativo && <span className={s.foraDaLiga}>fora da liga</span>}
                <IconeAvancar tamanho={20} className={s.seta} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SecaoStats>
  )
}

/** Os dias ao redor da data navegada, como no StatsHub. */
function SeletorDeDias({ data, hoje, escolhida }: { data: string; hoje: string; escolhida: string | undefined }) {
  const dias = [-2, -1, 0, 1, 2].map((d) => somarDias(data, d))
  return (
    <nav className={s.dias} aria-label="Navegar por data">
      <Link href={comTemporada(`/estatisticas?data=${somarDias(data, -1)}`, escolhida)} className={s.diaSeta} aria-label="Dia anterior" scroll={false}>
        <IconeVoltar tamanho={20} />
      </Link>
      <div className={s.diasLista}>
        {dias.map((d) => {
          const { semana, dia } = diaDaSemana(d)
          return (
            <Link
              key={d}
              href={comTemporada(d === hoje ? '/estatisticas' : `/estatisticas?data=${d}`, escolhida)}
              scroll={false}
              className={s.dia}
              aria-current={d === data ? 'date' : undefined}
            >
              <span className={s.diaSemana}>{d === hoje ? 'hoje' : semana}</span>
              <span className={`${s.diaNumero} num`}>{dia}</span>
            </Link>
          )
        })}
      </div>
      <Link href={comTemporada(`/estatisticas?data=${somarDias(data, 1)}`, escolhida)} className={s.diaSeta} aria-label="Dia seguinte" scroll={false}>
        <IconeAvancar tamanho={20} />
      </Link>
    </nav>
  )
}

/**
 * Uma linha da fila de jogos: visitante @ mandante. Aqui o jogo EM ANDAMENTO
 * mostra o parcial — é o dado que o assinante veio consultar — e o parcial
 * não elege vencedor: a sentença é do fim.
 */
function LinhaDeJogo({ jogo, fuso, href }: { jogo: JogoDoDia; fuso: string; href: string }) {
  const temPlacar = jogo.casa.placar !== null && jogo.visitante.placar !== null
  const encerrado = jogo.status === 'ENCERRADO'
  const venceu = (a: number | null, b: number | null) => !encerrado || (a ?? 0) >= (b ?? 0)
  const lado = (t: JogoDoDia['casa'], outro: JogoDoDia['casa']) => (
    <span className={s.lado}>
      <LogoTime sigla={t.sigla} tamanho={28} />
      <span className={s.ladoTexto}>
        <strong>{t.sigla}</strong>
        <span className={s.ladoNome}>{identidadeDoTime(t.sigla).nome}</span>
      </span>
      {temPlacar && (
        <span className={`${s.placar} num`} data-forte={venceu(t.placar, outro.placar)}>
          {t.placar}
        </span>
      )}
    </span>
  )
  return (
    <Link href={href} className={s.jogo}>
      <span className={s.lados}>
        {lado(jogo.visitante, jogo.casa)}
        {lado(jogo.casa, jogo.visitante)}
      </span>
      <span className={s.status}>
        {jogo.status === 'AGENDADO' ? (
          <span className={`${s.hora} num`}>{hora(jogo.dataHoraUtc, fuso)}</span>
        ) : jogo.status === 'AO_VIVO' ? (
          <SeloAoVivo texto={`${jogo.quartoAtual ?? 1}º Q${jogo.tempoRestante ? ` · ${jogo.tempoRestante}` : ''}`} />
        ) : (
          <span className={s.encerrado}>Final</span>
        )}
        <IconeAvancar tamanho={20} className={s.seta} />
      </span>
    </Link>
  )
}

type LinhaDaClassificacao = TelaClassificacao['linhas'][number]

function colunasDaClassificacao(
  lider: LinhaDaClassificacao | undefined,
  escolhida: string | undefined,
): Coluna<LinhaDaClassificacao>[] {
  return [
    {
      chave: 'pos',
      rotulo: '#',
      descricao: 'posição na conferência',
      celula: (l) => <span className={s.posicao}>{l.posicao === null ? '—' : l.posicao}</span>,
    },
    {
      chave: 'time',
      rotulo: 'Time',
      descricao: 'time',
      celula: (l) => (
        <Link href={rotaDoTime(l.timeId, escolhida)} className={s.time}>
          <LogoTime sigla={l.sigla} tamanho={22} />
          <strong>{l.sigla}</strong>
          <span className={s.franquia}>{identidadeDoTime(l.sigla).nome}</span>
        </Link>
      ),
    },
    { chave: 'vd', rotulo: 'V–D', descricao: 'vitórias e derrotas', alinhamento: 'direita', destaque: true, celula: (l) => `${l.vitorias}–${l.derrotas}` },
    { chave: 'aprov', rotulo: '%', descricao: 'aproveitamento', alinhamento: 'direita', celula: (l) => aproveitamento(l.aproveitamento) },
    { chave: 'ja', rotulo: 'JA', descricao: 'jogos atrás do líder da conferência', alinhamento: 'direita', secundaria: true, celula: (l) => jogosAtras(lider, l) },
    { chave: 'seq', rotulo: 'Seq', descricao: 'sequência atual', alinhamento: 'direita', secundaria: true, celula: (l) => l.sequencia ?? '—' },
    { chave: 'ultimos', rotulo: 'Últ. 5', descricao: 'últimos cinco jogos', celula: (l) => <FormaVD forma={l.forma} /> },
    {
      chave: 'trilho',
      rotulo: 'Trilho',
      descricao: 'trilho de playoff ou play-in',
      celula: (l) => {
        const t = trilhoDa(l.posicao)
        return t === null ? <span className={s.fraco}>—</span> : <span className={s.trilho} data-t={t}>{t}</span>
      },
    },
  ]
}

function Classificacao({ dados }: { dados: DadosDoIndice }) {
  const { classificacao, temporada } = dados
  const conferencias = [...new Set(classificacao.linhas.map((l) => l.conferencia))].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b),
  )
  const grupos = conferencias.length > 0 ? conferencias : [null]
  return (
    <div id="classificacao" className={s.conferencias}>
      {grupos.map((conferencia) => {
        const linhas = classificacao.linhas.filter((l) => l.conferencia === conferencia)
        const titulo = linhas.length === 0 ? 'Classificação' : `Classificação · ${conferencia ?? 'sem conferência'}`
        return (
          <SecaoStats key={conferencia ?? 'sem'} titulo={titulo} aux={`temporada ${temporada}`}>
            <TabelaDados
              legenda={
                conferencia === null
                  ? 'Classificação da temporada, da primeira posição para a última'
                  : `Classificação da conferência ${conferencia}, da primeira posição para a última`
              }
              colunas={colunasDaClassificacao(linhas[0], dados.seletor.escolhida)}
              linhas={linhas}
              chaveDaLinha={(l) => l.timeId}
              vazio="Sem classificação registrada para esta temporada."
              separadorApos={(l) => l.posicao === TRILHO.playoff || l.posicao === TRILHO.playIn}
            />
            {linhas.length > 0 && (
              <p className={s.legenda}>
                Playoff da 1ª à {TRILHO.playoff}ª · play-in até a {TRILHO.playIn}ª · linhas tracejadas marcam os
                dois cortes.
              </p>
            )}
          </SecaoStats>
        )
      })}
    </div>
  )
}

export function TelaIndice({ dados }: { dados: DadosDoIndice }) {
  const { data, hoje, fuso, doDia, seletor, temporada } = dados
  const { escolhida } = seletor
  return (
    <div className={s.tela}>
      <CabecalhoStats
        sobretitulo="Números da NBA"
        titulo="Estatísticas"
        apoio="Jogos, classificação e o perfil de cada jogador e time — o que a liga registrou."
      />
      <SeletorTemporada
        temporadas={seletor.disponiveis}
        atual={temporada}
        hrefDe={(t) => comTemporada(data === hoje ? '/estatisticas' : `/estatisticas?data=${data}`, t)}
      />
      <Busca termo={dados.termo} escolhida={escolhida} />
      {dados.termo.length > 0 && <ResultadosDaBusca dados={dados} />}

      <SecaoStats titulo={tituloJogosDoDia(data, hoje)} aux={doDia.jogos.length > 0 ? `${doDia.jogos.length} ${doDia.jogos.length === 1 ? 'jogo' : 'jogos'}` : undefined}>
        <SeletorDeDias data={data} hoje={hoje} escolhida={escolhida} />
        {doDia.jogos.length === 0 ? (
          <EstadoVazio
            titulo={data === hoje ? 'Nenhum jogo hoje' : `Nenhum jogo em ${diaDaRodada(data)}`}
            texto="Use as setas para ver outro dia."
            acao={data === hoje ? undefined : { rotulo: 'Voltar para hoje', href: '/estatisticas' }}
          />
        ) : (
          <ul className={s.jogos}>
            {doDia.jogos.map((j) => (
              <li key={j.id}>
                <LinhaDeJogo jogo={j} fuso={fuso} href={comTemporada(`${rotaDoJogo(j.id)}?data=${data}`, escolhida)} />
              </li>
            ))}
          </ul>
        )}
      </SecaoStats>

      <Classificacao dados={dados} />

      <UltimaAtualizacao em={doDia.atualizacao.em} fonte={doDia.atualizacao.fonte} agora={dados.agora} fuso={fuso} />
    </div>
  )
}
