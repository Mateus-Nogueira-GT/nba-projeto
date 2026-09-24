import Link from 'next/link'
import { BASE_ESTATISTICAS, rotaDoJogador, rotaDoJogo, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import type { BoxScoreDoJogo, LinhaHierarquia } from '@/modules/entrega/estatisticas/time'
import { NumeroGrande } from '@/ui/blocos'
import { Abas } from '@/ui/controles'
import { hora } from '@/ui/formato'
import { IconeAvancar } from '@/ui/icones'
import { SeloAoVivo, SeloNivel } from '@/ui/marcas'
import { LogoTime } from '@/ui/midia'
import { identidadeDoTime } from '@/ui/times'
import { BotaoAcompanhar } from './BotaoAcompanhar'
import { CabecalhoStats, SecaoStats, Silhueta, TabelaDados, UltimaAtualizacao, type Coluna } from './Comum'
import { aproveitamento, diaMes, pct, trilhoDa } from './regras'
import { ATRIBUTOS_DA_HIERARQUIA, type DadosDoTime } from './time'
import s from './Time.module.css'

/** Ausência é "—", nunca zero. */
const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v))

function colunas(prorrogacao: boolean, fuso: string): Coluna<BoxScoreDoJogo>[] {
  const lista: Coluna<BoxScoreDoJogo>[] = [
    {
      chave: 'jogo',
      rotulo: 'Jogo',
      fixa: true,
      celula: (l) => (
        <Link href={rotaDoJogo(l.jogoId)} className={s.jogoLink}>
          <span className={`${s.fraco} num`}>{diaMes(l.data, fuso)}</span>
          {l.emCasa ? 'vs' : '@'} {l.adversarioSigla}
        </Link>
      ),
    },
    {
      chave: 'res',
      rotulo: 'Res',
      descricao: 'resultado',
      celula: (l) =>
        l.resultado === null ? '—' : (
          <span className={s.resultado} data-r={l.resultado}>
            {l.resultado} <span>{l.placar}</span>
          </span>
        ),
    },
    { chave: 'q1', rotulo: '1º', descricao: 'pontos no 1º quarto', alinhamento: 'direita', celula: (l) => n(l.nosso?.q1) },
    { chave: 'q2', rotulo: '2º', descricao: 'pontos no 2º quarto', alinhamento: 'direita', celula: (l) => n(l.nosso?.q2) },
    { chave: 'q3', rotulo: '3º', descricao: 'pontos no 3º quarto', alinhamento: 'direita', celula: (l) => n(l.nosso?.q3) },
    { chave: 'q4', rotulo: '4º', descricao: 'pontos no 4º quarto', alinhamento: 'direita', celula: (l) => n(l.nosso?.q4) },
  ]
  // A prorrogação só ganha coluna quando existe.
  if (prorrogacao) lista.push({ chave: 'pr', rotulo: 'PR', descricao: 'prorrogação', alinhamento: 'direita', celula: (l) => n(l.nosso?.prorrogacao) })
  return [
    ...lista,
    { chave: 'tot', rotulo: 'Tot', descricao: 'total de pontos', alinhamento: 'direita', destaque: true, celula: (l) => n(l.nosso?.total) },
    { chave: 'reb', rotulo: 'Reb', descricao: 'rebotes', alinhamento: 'direita', secundaria: true, celula: (l) => n(l.rebotesTotal) },
    { chave: 'ast', rotulo: 'Ast', descricao: 'assistências', alinhamento: 'direita', secundaria: true, celula: (l) => n(l.assistencias) },
    { chave: 'to', rotulo: 'TO', descricao: 'turnovers', alinhamento: 'direita', secundaria: true, celula: (l) => n(l.turnovers) },
    { chave: 'fg', rotulo: 'FG%', descricao: 'aproveitamento de quadra', alinhamento: 'direita', secundaria: true, celula: (l) => pct(l.fgPercentual) },
    { chave: 'tres', rotulo: '3P%', descricao: 'aproveitamento de três', alinhamento: 'direita', secundaria: true, celula: (l) => pct(l.tresPercentual) },
  ]
}

/**
 * A hierarquia do CJ — a curadoria PROJETADA, não o elenco do provedor. Os
 * desfalques CONTÍNUOS a partir do topo ficam em destaque: é a abertura que a
 * OPD lê.
 */
function Hierarquia({ linhas }: { linhas: LinhaHierarquia[] }) {
  if (linhas.length === 0) {
    return <p className={s.vazio}>A curadoria NIP ainda não classifica este time neste atributo.</p>
  }
  const ordenadas = [...linhas].sort((a, b) => a.posicao - b.posicao)
  let prefixo = 0
  while (prefixo < ordenadas.length && ordenadas[prefixo]!.fora) prefixo += 1
  return (
    <>
      <ol className={s.hierarquia}>
        {ordenadas.map((l, i) => (
          <li key={l.jogadorId} className={s.degrau} data-abre={i < prefixo} data-fora={l.fora}>
            <span className={`${s.posicao} num`}>{l.posicao}</span>
            <Link href={rotaDoJogador(l.jogadorId)} className={s.degrauNome}>
              {l.nome}
            </Link>
            <SeloNivel nivel={l.nivel} />
            {l.fora && <span className={s.fora}>Fora</span>}
          </li>
        ))}
      </ol>
      <p className={s.nota}>
        O desfalque só abre oportunidade quando começa no topo: se o nº 2 falta e o nº 1 joga, não há apito.
      </p>
    </>
  )
}

export function TelaTime({ dados }: { dados: DadosDoTime }) {
  const { id, tela, temporada, fuso, atributo, hierarquia, jogoDeHoje, profundidade } = dados
  const { time, campanha } = tela
  const identidade = identidadeDoTime(time.sigla)
  const prorrogacao = tela.jogosDoTime.some((j) => (j.nosso?.prorrogacao ?? 0) > 0)
  const trilho = campanha ? trilhoDa(campanha.posicao) : null
  const porExtenso = ATRIBUTOS_DA_HIERARQUIA.find((a) => a.valor === atributo)!.porExtenso

  return (
    <div className={s.tela}>
      <CabecalhoStats
        voltar={{ href: `${BASE_ESTATISTICAS}#classificacao`, rotulo: 'Classificação' }}
        icone={<LogoTime sigla={identidade.sigla} tamanho={64} />}
        titulo={identidade.nome}
        apoio={[identidade.sigla, time.conferencia ? `Conferência ${time.conferencia}` : null, `temporada ${temporada}`].filter(Boolean).join(' · ')}
        acoes={<BotaoAcompanhar tipo="TIME" id={id} inicial={dados.acompanhado} />}
      />

      <SecaoStats titulo="Campanha" aux={`temporada ${temporada}`}>
        {campanha === null ? (
          <p className={s.vazio}>Sem classificação registrada para esta temporada.</p>
        ) : (
          <dl className={s.numeros}>
            <NumeroGrande
              rotulo="Classificação"
              valor={campanha.posicao === null ? '—' : `${campanha.posicao}º`}
              apoio={trilho ?? (time.conferencia ? `no ${time.conferencia}` : undefined)}
            />
            <NumeroGrande rotulo="V–D" valor={`${campanha.vitorias}–${campanha.derrotas}`} />
            <NumeroGrande rotulo="Aproveitamento" valor={aproveitamento(campanha.aproveitamento)} />
            <NumeroGrande rotulo="Sequência" valor={campanha.sequencia ?? '—'} />
          </dl>
        )}
      </SecaoStats>

      {jogoDeHoje && (
        <Link href={rotaDoJogo(jogoDeHoje.id)} className={s.hoje}>
          <span className={s.hojeRotulo}>Jogo de hoje</span>
          <span className={s.hojeConfronto}>
            <LogoTime sigla={jogoDeHoje.visitante.sigla} tamanho={24} />
            <strong>{jogoDeHoje.visitante.sigla}</strong>
            {jogoDeHoje.visitante.placar !== null && jogoDeHoje.casa.placar !== null ? (
              <strong className="num">
                {jogoDeHoje.visitante.placar} – {jogoDeHoje.casa.placar}
              </strong>
            ) : (
              <span className={s.fraco}>@</span>
            )}
            <strong>{jogoDeHoje.casa.sigla}</strong>
            <LogoTime sigla={jogoDeHoje.casa.sigla} tamanho={24} />
          </span>
          {jogoDeHoje.status === 'AO_VIVO' ? (
            <SeloAoVivo texto={`${jogoDeHoje.quartoAtual ?? 1}º Q`} />
          ) : jogoDeHoje.status === 'ENCERRADO' ? (
            <span className={s.fraco}>Final</span>
          ) : (
            <span className={`${s.hojeHora} num`}>{hora(jogoDeHoje.dataHoraUtc, fuso)}</span>
          )}
          <IconeAvancar tamanho={20} className={s.seta} />
        </Link>
      )}

      <div className={s.colunas}>
        <SecaoStats titulo="Box score por jogo" aux={profundidade ? 'da mais recente para a mais antiga' : undefined}>
          {profundidade ? (
            <TabelaDados
              legenda="Pontos por quarto, da partida mais recente para a mais antiga"
              colunas={colunas(prorrogacao, fuso)}
              linhas={tela.jogosDoTime}
              chaveDaLinha={(l) => l.jogoId}
              vazio="Nenhuma partida registrada para este time."
            />
          ) : (
            <Silhueta forma="tabela" recurso="O box score por jogo" voltar={rotaDoTime(id)} />
          )}
        </SecaoStats>

        <div className={s.lateral}>
          <SecaoStats titulo={`Hierarquia NIP · ${porExtenso}`} aux="curadoria NIP">
            <Abas
              rotulo="Atributo da hierarquia"
              abas={ATRIBUTOS_DA_HIERARQUIA.map((a) => ({
                chave: a.valor,
                rotulo: a.porExtenso,
                href: `${rotaDoTime(id)}?atributo=${a.valor}`,
                ativo: a.valor === atributo,
              }))}
            />
            {jogoDeHoje === null && hierarquia.length > 0 && (
              <p className={s.nota}>Sem jogo hoje: nenhum desfalque a marcar.</p>
            )}
            <Hierarquia linhas={hierarquia} />
          </SecaoStats>

          <SecaoStats titulo="Elenco" aux="time atual">
            {tela.elenco.length === 0 ? (
              <p className={s.vazio}>Nenhum jogador vinculado a este time.</p>
            ) : (
              <ul className={s.elenco}>
                {tela.elenco.map((j) => (
                  <li key={j.id}>
                    <Link href={rotaDoJogador(j.id)} className={s.elencoLinha}>
                      <span className={s.elencoNome}>{j.nome}</span>
                      <span className={`${s.fraco} num`}>
                        {[j.posicao, j.numeroCamisa !== null ? `nº ${j.numeroCamisa}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SecaoStats>
        </div>
      </div>

      <UltimaAtualizacao em={tela.atualizacao.em} fonte={tela.atualizacao.fonte} agora={dados.agora} fuso={fuso} />
    </div>
  )
}
