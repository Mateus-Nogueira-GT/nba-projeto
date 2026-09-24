import Link from 'next/link'
import type { LadoDaPartida, LinhaDoBoxScore } from '@/modules/entrega/estatisticas/jogo'
import { rotaDoJogador, rotaDoJogo, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { EstadoVazio } from '@/ui/blocos'
import { Abas } from '@/ui/controles'
import { hora } from '@/ui/formato'
import { ROTULO_NIVEL, SeloAoVivo } from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { identidadeDoTime } from '@/ui/times'
// O refresh do Ao Vivo (aba visível, ±10 s de jitter), não o do v2, de período fixo.
import { AtualizarAoVivo } from '@/features/ao-vivo/AtualizarAoVivo'
import { CabecalhoStats, FormaVD, NotaPartida, SecaoStats, Silhueta, TabelaDados, UltimaAtualizacao, type Coluna } from './Comum'
import type { AbaDoJogo, DadosDoJogo } from './jogo'
import { dataHora, diaMes, pct } from './regras'
import s from './Jogo.module.css'

function colunasDoBoxScore(): Coluna<LinhaDoBoxScore>[] {
  return [
    {
      chave: 'jogador',
      rotulo: 'Jogador',
      fixa: true,
      celula: (l) => (
        <Link href={rotaDoJogador(l.jogadorId)} className={s.jogador}>
          <FotoJogador nome={l.nome} fotoUrl={l.fotoUrl} tamanho={28} />
          <span className={s.jogadorNome}>{l.nome}</span>
          {l.posicao && <span className={s.fraco}>{l.posicao}</span>}
        </Link>
      ),
    },
    { chave: 'nota', rotulo: 'Nota', descricao: 'nota da partida', celula: (l) => <NotaPartida nota={l.nota} /> },
    { chave: 'min', rotulo: 'Min', descricao: 'minutos', alinhamento: 'direita', celula: (l) => (l.minutos === null ? '—' : Math.round(l.minutos)) },
    { chave: 'pts', rotulo: 'Pts', descricao: 'pontos', alinhamento: 'direita', destaque: true, celula: (l) => l.pontos },
    { chave: 'reb', rotulo: 'Reb', descricao: 'rebotes', alinhamento: 'direita', celula: (l) => l.rebotes },
    { chave: 'ast', rotulo: 'Ast', descricao: 'assistências', alinhamento: 'direita', celula: (l) => l.assistencias },
    { chave: 'rou', rotulo: 'Rou', descricao: 'roubos', alinhamento: 'direita', celula: (l) => l.roubos },
    { chave: 'toc', rotulo: 'Toc', descricao: 'tocos', alinhamento: 'direita', celula: (l) => l.bloqueios },
    { chave: 'to', rotulo: 'TO', descricao: 'turnovers', alinhamento: 'direita', celula: (l) => l.turnovers },
    { chave: 'fg', rotulo: 'FG%', descricao: 'aproveitamento de quadra', alinhamento: 'direita', celula: (l) => pct(l.fgPercentual) },
    { chave: 'tres', rotulo: '3P%', descricao: 'aproveitamento de três', alinhamento: 'direita', celula: (l) => pct(l.tresPercentual) },
    { chave: 'll', rotulo: 'LL%', descricao: 'aproveitamento de lance livre', alinhamento: 'direita', celula: (l) => pct(l.lancePercentual) },
  ]
}

/** O placar como o StatsHub desenha: visitante · placar/hora · mandante. */
function Placar({ dados }: { dados: DadosDoJogo }) {
  const { tela, fuso } = dados
  const aoVivo = tela.status === 'AO_VIVO'
  const encerrado = tela.status === 'ENCERRADO'
  const temPlacar = tela.casa.placar !== null && tela.visitante.placar !== null
  const lado = (l: LadoDaPartida, outro: LadoDaPartida) => (
    <Link href={rotaDoTime(l.timeId)} className={s.lado}>
      <span className={s.logo}>
        <LogoTime sigla={l.sigla} tamanho={56} />
      </span>
      <strong className={s.sigla}>{l.sigla}</strong>
      <span className={s.nome}>{identidadeDoTime(l.sigla).nome}</span>
      {l.forma.length > 0 && (
        <span className={s.formaLado}>
          <FormaVD forma={l.forma} />
        </span>
      )}
      {temPlacar && (
        <span
          className={`${s.pontos} num`}
          data-perdeu={encerrado && (l.placar ?? 0) < (outro.placar ?? 0)}
        >
          {l.placar}
        </span>
      )}
    </Link>
  )
  return (
    <section className={s.placar} aria-label="Placar">
      {lado(tela.visitante, tela.casa)}
      <div className={s.centro}>
        {aoVivo ? (
          <SeloAoVivo texto={tela.quartoAtual !== null ? `${tela.quartoAtual}º quarto` : 'Ao vivo'} />
        ) : encerrado ? (
          <span className={s.final}>Final</span>
        ) : (
          <span className={`${s.hora} num`}>{hora(tela.dataHoraUtc, fuso)}</span>
        )}
        <span className={s.arroba}>@</span>
        <span className={s.data}>{dataHora(tela.dataHoraUtc, fuso)}</span>
      </div>
      {lado(tela.casa, tela.visitante)}
    </section>
  )
}

function Quartos({ casa, visitante }: { casa: LadoDaPartida; visitante: LadoDaPartida }) {
  if (casa.quartos === null || visitante.quartos === null) return null
  const prorrogacao = casa.quartos.prorrogacao > 0 || visitante.quartos.prorrogacao > 0
  const colunas: Coluna<LadoDaPartida>[] = [
    { chave: 'time', rotulo: 'Time', fixa: true, celula: (l) => l.sigla },
    { chave: 'q1', rotulo: '1º', descricao: '1º quarto — o que o Fire Live observa', alinhamento: 'direita', destaque: true, celula: (l) => l.quartos!.q1 },
    { chave: 'q2', rotulo: '2º', alinhamento: 'direita', celula: (l) => l.quartos!.q2 },
    { chave: 'q3', rotulo: '3º', alinhamento: 'direita', celula: (l) => l.quartos!.q3 },
    { chave: 'q4', rotulo: '4º', alinhamento: 'direita', celula: (l) => l.quartos!.q4 },
  ]
  if (prorrogacao) colunas.push({ chave: 'pr', rotulo: 'PR', descricao: 'prorrogação', alinhamento: 'direita', celula: (l) => l.quartos!.prorrogacao })
  colunas.push({ chave: 'tot', rotulo: 'Tot', descricao: 'total de pontos', alinhamento: 'direita', destaque: true, celula: (l) => l.placar ?? '—' })
  return (
    <SecaoStats titulo="Pontos por quarto" aux="1º Q · o que o Fire Live observa">
      <TabelaDados
        legenda={`Pontos por quarto — ${visitante.sigla} @ ${casa.sigla}`}
        colunas={colunas}
        linhas={[visitante, casa]}
        chaveDaLinha={(l) => l.timeId}
      />
    </SecaoStats>
  )
}

function Desfalques({ lado }: { lado: LadoDaPartida }) {
  return (
    <div className={s.desfalqueLado}>
      <p className={s.desfalqueTime}>
        <LogoTime sigla={lado.sigla} tamanho={20} /> {lado.sigla}
      </p>
      {lado.desfalques.length === 0 ? (
        <p className={s.fraco}>Nenhum informado.</p>
      ) : (
        <ul className={s.desfalques}>
          {lado.desfalques.map((d) => (
            <li key={d.jogadorId} className={s.desfalque}>
              <span className={s.desfalqueStatus} data-status={d.status}>
                {d.status === 'FORA' ? 'Fora' : 'Dúvida'}
              </span>
              <span className={s.desfalqueTexto}>
                <Link href={rotaDoJogador(d.jogadorId)}>
                  <strong>{d.nome}</strong>
                </Link>
                <span>
                  {[d.motivo, d.confirmado ? null : 'não confirmado'].filter(Boolean).join(' · ') || ' '}
                </span>
                {d.hierarquiaPontos && (
                  <span className={s.curadoria}>
                    Curadoria NIP · {d.hierarquiaPontos.timeSigla} · pontos · nº {d.hierarquiaPontos.posicao} ·{' '}
                    {ROTULO_NIVEL[d.hierarquiaPontos.nivel]}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VisaoGeral({ dados }: { dados: DadosDoJogo }) {
  const { tela } = dados
  const aoVivo = tela.status === 'AO_VIVO'
  const encerrado = tela.status === 'ENCERRADO'
  const temDesfalque = tela.casa.desfalques.length > 0 || tela.visitante.desfalques.length > 0
  const nada = !(aoVivo || encerrado) && !temDesfalque
  return (
    <div className={s.geral}>
      {(aoVivo || encerrado) && <Quartos casa={tela.casa} visitante={tela.visitante} />}

      {encerrado && tela.lideres.length > 0 && (
        <SecaoStats titulo="Líderes da partida">
          <ul className={s.lideres}>
            {tela.lideres.map((l) => (
              <li key={l.rotulo}>
                <Link href={rotaDoJogador(l.jogadorId)} className={s.lider}>
                  <span className={s.liderRotulo}>{l.rotulo}</span>
                  <span className={`${s.liderValor} num`}>{l.valor}</span>
                  <span className={s.liderNome}>
                    {l.nome} <span className={s.fraco}>{l.sigla}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </SecaoStats>
      )}

      {!encerrado && temDesfalque && (
        <SecaoStats titulo="Desfalques">
          <div className={s.desfalquesGrade}>
            <Desfalques lado={tela.visitante} />
            <Desfalques lado={tela.casa} />
          </div>
        </SecaoStats>
      )}

      {nada && (
        <EstadoVazio
          titulo="O jogo ainda não começou"
          texto="Pontos por quarto e box score aparecem quando a bola subir. Nenhum desfalque informado até agora."
        />
      )}
    </div>
  )
}

function BoxScore({ dados }: { dados: DadosDoJogo }) {
  const { tela, profundidade, id } = dados
  if (tela.status === 'AGENDADO') {
    return <EstadoVazio titulo="Box score disponível quando o jogo começar" texto={`Início às ${hora(tela.dataHoraUtc, dados.fuso)}.`} />
  }
  if (!profundidade) return <Silhueta forma="tabela" recurso="O box score" voltar={rotaDoJogo(id)} />
  const temBox = tela.casa.boxScore.length > 0 || tela.visitante.boxScore.length > 0
  if (!temBox) return <EstadoVazio titulo="Box score em atualização" />
  return (
    <div className={s.boxes}>
      {[tela.visitante, tela.casa].map((lado) => (
        <SecaoStats key={lado.timeId} titulo={`${lado.sigla} · ${identidadeDoTime(lado.sigla).nome}`}>
          <TabelaDados
            legenda={`Box score de ${identidadeDoTime(lado.sigla).nome}`}
            colunas={colunasDoBoxScore()}
            linhas={lado.boxScore}
            chaveDaLinha={(l) => l.jogadorId}
            vazio="Box score em atualização."
          />
        </SecaoStats>
      ))}
    </div>
  )
}

/** h2h vazio é um FATO ("primeiro confronto"), não ausência de seção. */
function Confrontos({ dados }: { dados: DadosDoJogo }) {
  const { tela, profundidade, id, fuso } = dados
  if (!profundidade) return <Silhueta forma="tabela" recurso="Os confrontos anteriores" voltar={rotaDoJogo(id)} />
  if (tela.h2h.length === 0) return <EstadoVazio titulo="Primeiro confronto da temporada" />
  return (
    <ul className={s.h2h}>
      {tela.h2h.map((c) => {
        const casaVenceu = c.placarCasa > c.placarVisitante
        return (
          <li key={c.jogoId}>
            <Link href={rotaDoJogo(c.jogoId)} className={s.confronto}>
              <span className={`${s.fraco} num`}>{diaMes(c.data, fuso)}</span>
              <span className={s.confrontoLado} data-venceu={!casaVenceu}>
                <LogoTime sigla={c.siglaVisitante} tamanho={20} /> {c.siglaVisitante}
                <strong className="num">{c.placarVisitante}</strong>
              </span>
              <span className={s.fraco}>@</span>
              <span className={s.confrontoLado} data-venceu={casaVenceu}>
                <strong className="num">{c.placarCasa}</strong>
                {c.siglaCasa} <LogoTime sigla={c.siglaCasa} tamanho={20} />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

const ROTULO_ABA: Record<AbaDoJogo, string> = {
  geral: 'Visão geral',
  box: 'Box score',
  confrontos: 'Confrontos',
}

export function TelaJogo({ dados }: { dados: DadosDoJogo }) {
  const { tela, id, aba, consultaBase } = dados
  const href = (a: AbaDoJogo) => {
    const p = new URLSearchParams(consultaBase)
    if (a !== 'geral') p.set('aba', a)
    const q = p.toString()
    return q ? `${rotaDoJogo(id)}?${q}` : rotaDoJogo(id)
  }
  return (
    <div className={s.tela}>
      {tela.status === 'AO_VIVO' && <AtualizarAoVivo />}
      <CabecalhoStats voltar={dados.voltar} titulo={`${tela.visitante.sigla} @ ${tela.casa.sigla}`} />
      <Placar dados={dados} />
      <Abas
        rotulo="Seções da partida"
        abas={(['geral', 'box', 'confrontos'] as const).map((a) => ({ chave: a, rotulo: ROTULO_ABA[a], href: href(a), ativo: aba === a }))}
      />
      {aba === 'geral' && <VisaoGeral dados={dados} />}
      {aba === 'box' && <BoxScore dados={dados} />}
      {aba === 'confrontos' && <Confrontos dados={dados} />}
      <UltimaAtualizacao em={tela.atualizacao.em} fonte={tela.atualizacao.fonte} agora={dados.agora} fuso={dados.fuso} />
    </div>
  )
}

