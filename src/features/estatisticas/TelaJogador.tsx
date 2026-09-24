import Link from 'next/link'
import type { ApitoDoJogador, LinhaHistorico, Numeros } from '@/modules/entrega/estatisticas/jogador'
import {
  BASE_ESTATISTICAS,
  parametrosEstatisticas,
  rotaDoJogador,
  rotaDoJogo,
  rotaDoTime,
} from '@/modules/entrega/estatisticas/rotas'
import { NumeroGrande } from '@/ui/blocos'
import { Abas, Segmentado } from '@/ui/controles'
import { ROTULO_ATRIBUTO, SeloAoVivo, SeloNivel } from '@/ui/marcas'
import { FotoJogador } from '@/ui/midia'
import { BotaoAcompanhar } from './BotaoAcompanhar'
import { CabecalhoStats, NotaPartida, SecaoStats, Silhueta, TabelaDados, UltimaAtualizacao, type Coluna } from './Comum'
import { GraficoDesempenho } from './GraficoDesempenho'
import type { DadosDoJogador } from './jogador'
import { confronto, diaMes, num, pct, resumoDosApitos } from './regras'
import s from './Jogador.module.css'

/** O veredito de um apito: ✓/✗ com texto; sem veredito, o estado por extenso. */
function Veredito({ apito }: { apito: ApitoDoJogador }) {
  if (apito.estado !== 'CONFERIDO') {
    return <span className={s.pendente}>{apito.estado === 'NAO_JOGOU' ? 'não jogou' : 'aguardando dado oficial'}</span>
  }
  return (
    <span className={s.veredito} data-bateu={apito.bateu === true}>
      fez {apito.fez}
      <span role="img" aria-label={apito.bateu ? 'bateu' : 'não bateu'} className={s.vereditoIcone}>
        {apito.bateu ? '✓' : '✗'}
      </span>
    </span>
  )
}

function Apitos({ dados }: { dados: DadosDoJogador }) {
  const { apitos, fuso } = dados
  if (apitos.length === 0) return <p className={s.nada}>A Lista Secreta ainda não apitou este jogador.</p>
  return (
    <ul className={s.apitos}>
      {apitos.map((a) => (
        <li key={`${a.jogoId}-${a.atributo}`} className={s.apito}>
          <span className={`${s.apitoData} num`}>{diaMes(a.data, fuso)}</span>
          <span className={s.apitoMercado}>
            <strong>
              {ROTULO_ATRIBUTO[a.atributo]} {a.linhaMaisBaixa}+
            </strong>
            <span>{confronto(a)}</span>
          </span>
          <Veredito apito={a} />
        </li>
      ))}
    </ul>
  )
}

function colunasDoHistorico(fuso: string, hrefDoJogo: (id: string) => string): Coluna<LinhaHistorico>[] {
  const oficial = (l: LinhaHistorico, v: number) => (l.estado === 'CONFERIDO' ? v : '—')
  return [
    {
      chave: 'jogo',
      rotulo: 'Jogo',
      fixa: true,
      celula: (l) => (
        <Link href={hrefDoJogo(l.jogoId)} className={s.jogoLink}>
          <span className={`${s.jogoData} num`}>{diaMes(l.data, fuso)}</span>
          {confronto(l)}
        </Link>
      ),
    },
    {
      chave: 'res',
      rotulo: 'Res',
      descricao: 'resultado',
      secundaria: true,
      celula: (l) =>
        l.resultado === null ? '—' : (
          <span className={s.resultado} data-r={l.resultado}>
            {l.resultado} <span>{l.placar}</span>
          </span>
        ),
    },
    {
      chave: 'estado',
      rotulo: 'Dado',
      descricao: 'estado do dado',
      celula: (l) => (l.estado === 'DNP' ? 'DNP' : l.estado === 'PENDENTE' ? 'Pendente' : 'Oficial'),
    },
    { chave: 'min', rotulo: 'Min', descricao: 'minutos', alinhamento: 'direita', celula: (l) => num(l.minutos, 0) },
    { chave: 'pts', rotulo: 'Pts', descricao: 'pontos', alinhamento: 'direita', destaque: true, celula: (l) => oficial(l, l.pontos) },
    { chave: 'reb', rotulo: 'Reb', descricao: 'rebotes', alinhamento: 'direita', celula: (l) => oficial(l, l.rebotes) },
    { chave: 'ast', rotulo: 'Ast', descricao: 'assistências', alinhamento: 'direita', celula: (l) => oficial(l, l.assistencias) },
    { chave: 'fg', rotulo: 'FG%', descricao: 'aproveitamento de quadra', alinhamento: 'direita', secundaria: true, celula: (l) => pct(l.fgPercentual) },
    { chave: 'tres', rotulo: '3P%', descricao: 'aproveitamento de três', alinhamento: 'direita', secundaria: true, celula: (l) => pct(l.tresPercentual) },
    { chave: 'nota', rotulo: 'Nota', descricao: 'nota da partida', alinhamento: 'direita', celula: (l) => <NotaPartida nota={l.nota} /> },
  ]
}

function Grupo({ titulo, itens }: { titulo: string; itens: [string, string][] }) {
  return (
    <div className={s.grupo}>
      <h3 className={s.grupoTitulo}>{titulo}</h3>
      <dl className={s.grupoLista}>
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd className="num">{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** PTS, REB e AST já estão nos números do topo — aqui fica o resto. */
function NumerosCompletos({ n }: { n: Numeros }) {
  return (
    <div className={s.grupos}>
      <Grupo
        titulo="Ataque"
        itens={[
          ['FG%', pct(n.ataque.fgPercentual)],
          ['2P%', pct(n.ataque.doisPercentual)],
          ['3P%', pct(n.ataque.tresPercentual)],
          ['LL%', pct(n.ataque.lancePercentual)],
        ]}
      />
      <Grupo
        titulo="Defesa"
        itens={[
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

export function TelaJogador({ dados }: { dados: DadosDoJogador }) {
  const { id, tela, contexto, temporada, fuso, profundidade } = dados
  const { perfil, aoVivo, timeNaListaDoCj } = tela
  const mesmoTime = timeNaListaDoCj !== null && timeNaListaDoCj.id === perfil.timeId
  const rotuloPeriodo = contexto.periodo === 'temporada' ? `Temporada ${temporada}` : `Últimos ${contexto.periodo}`
  const amostra = tela.recorte
  const recorte = amostra
    ? `${rotuloPeriodo} · ${amostra.disponiveis} ${amostra.disponiveis === 1 ? 'partida disponível' : 'partidas disponíveis'}`
    : rotuloPeriodo
  const hrefDoJogo = (jogoId: string) => `${rotaDoJogo(jogoId)}?jogador=${id}&${parametrosEstatisticas(contexto)}`
  const voltarPara = `/estatisticas/jogador/${id}`

  return (
    <div className={s.tela}>
      <CabecalhoStats
        voltar={
          contexto.q
            ? { href: `${BASE_ESTATISTICAS}?q=${encodeURIComponent(contexto.q)}`, rotulo: 'Busca' }
            : { href: BASE_ESTATISTICAS, rotulo: 'Estatísticas' }
        }
        icone={<FotoJogador nome={perfil.nome} fotoUrl={perfil.fotoUrl} tamanho={72} timeSigla={perfil.timeSigla ?? undefined} />}
        titulo={perfil.nome}
        apoio={
          <div className={s.identidade}>
            <p>{[perfil.posicao, perfil.numeroCamisa !== null ? `nº ${perfil.numeroCamisa}` : null, recorte].filter(Boolean).join(' · ')}</p>
            <p className={s.times}>
              <span className={s.rotuloTime}>Time atual</span>
              {perfil.timeId ? (
                <Link href={rotaDoTime(perfil.timeId)} className={s.linkTime}>
                  {perfil.timeSigla ?? '—'}
                </Link>
              ) : (
                '—'
              )}
              <span aria-hidden className={s.ponto}>·</span>
              <span className={s.rotuloTime}>Na curadoria NIP</span>
              {timeNaListaDoCj === null ? (
                '—'
              ) : mesmoTime ? (
                <strong>{timeNaListaDoCj.sigla}</strong>
              ) : (
                <Link href={rotaDoTime(timeNaListaDoCj.id)} className={s.linkTime}>
                  {timeNaListaDoCj.sigla}
                </Link>
              )}
              {timeNaListaDoCj && (
                <span className={s.nivel}>
                  <SeloNivel nivel={timeNaListaDoCj.nivel} /> em pontos
                </span>
              )}
            </p>
          </div>
        }
        acoes={<BotaoAcompanhar tipo="JOGADOR" id={id} inicial={dados.acompanhado} />}
      />

      {!perfil.ativo && <p className={s.alerta}>Jogador fora da liga segundo o provedor.</p>}

      <div className={s.recorte}>
        <Segmentado
          rotulo="Período das estatísticas"
          opcoes={(['5', '10', 'temporada'] as const).map((periodo) => ({
            valor: periodo,
            rotulo: periodo === 'temporada' ? 'Temporada' : `Últimos ${periodo}`,
            href: rotaDoJogador(id, { ...contexto, periodo }),
            ativo: contexto.periodo === periodo,
          }))}
        />
        {amostra && (
          <p className={s.amostra}>
            {amostra.conferidos} com dado oficial · {amostra.dnp} DNP · {amostra.pendentes}{' '}
            {amostra.pendentes === 1 ? 'pendente' : 'pendentes'}. Médias apenas das partidas com participação confirmada.
          </p>
        )}
      </div>

      <dl className={s.numeros}>
        <NumeroGrande rotulo="Pontos" valor={num(tela.perfilNumeros.ataque.pontos)} apoio="por jogo" />
        <NumeroGrande rotulo="Rebotes" valor={num(tela.perfilNumeros.defesa.rebotesTotal)} apoio="por jogo" />
        <NumeroGrande rotulo="Assistências" valor={num(tela.perfilNumeros.ataque.assistencias)} apoio="por jogo" />
        <NumeroGrande rotulo="Nota" valor={<NotaPartida nota={tela.notaMediaRecente} destaque />} apoio="média do recorte" />
      </dl>

      {aoVivo && (
        <section className={s.aoVivo} aria-label="Em jogo agora">
          <div className={s.aoVivoTopo}>
            <SeloAoVivo texto="Em jogo" />
            <span>
              vs {aoVivo.adversarioSigla}
              {aoVivo.quartoAtual !== null && ` · ${aoVivo.quartoAtual}º quarto`}
              {aoVivo.tempoRestante && ` · ${aoVivo.tempoRestante}`}
              {aoVivo.placar && ` · placar ${aoVivo.placar}`}
            </span>
          </div>
          <p className={`${s.aoVivoNumeros} num`}>
            <span>
              <strong>{aoVivo.pontos}</strong> PTS
            </span>
            <span>
              <strong>{aoVivo.rebotes}</strong> REB
            </span>
            <span>
              <strong>{aoVivo.assistencias}</strong> AST
            </span>
          </p>
          {aoVivo.porQuarto.length > 0 && (
            <p className={s.porQuarto}>{aoVivo.porQuarto.map((q) => `${q.quarto}º: ${q.pontos} pts`).join(' · ')}</p>
          )}
        </section>
      )}

      <SecaoStats titulo={`Desempenho · ${ROTULO_ATRIBUTO[contexto.atributo]}`} aux={`${recorte} · jogo inteiro`}>
        <Abas
          rotulo="Atributo das estatísticas"
          abas={(['PONTOS', 'REBOTES', 'ASSISTENCIAS'] as const).map((atributo) => ({
            chave: atributo,
            rotulo: ROTULO_ATRIBUTO[atributo],
            href: rotaDoJogador(id, { ...contexto, atributo }),
            ativo: contexto.atributo === atributo,
          }))}
        />
        <GraficoDesempenho historico={tela.historico} atributo={contexto.atributo} fuso={fuso} hrefDoJogo={hrefDoJogo} />
      </SecaoStats>

      <div className={s.colunas}>
        <SecaoStats titulo="Jogo a jogo" aux={profundidade ? recorte : undefined}>
          {profundidade ? (
            <TabelaDados
              legenda="Uma linha por partida, da mais recente para a mais antiga"
              colunas={colunasDoHistorico(fuso, hrefDoJogo)}
              linhas={tela.historico}
              chaveDaLinha={(l) => l.jogoId}
              vazio="Nenhuma partida registrada para este jogador."
            />
          ) : (
            <Silhueta forma="tabela" recurso="O jogo a jogo" voltar={voltarPara} />
          )}
        </SecaoStats>

        <div className={s.lateral}>
          <SecaoStats titulo="Apitos da estratégia" aux={profundidade ? resumoDosApitos(dados.apitos, dados.truncado) : undefined}>
            {profundidade ? <Apitos dados={dados} /> : <Silhueta forma="cards" recurso="O histórico de apitos" voltar={voltarPara} />}
          </SecaoStats>

          <SecaoStats titulo="Números completos" aux={profundidade ? 'médias de jogo inteiro' : undefined}>
            {profundidade ? (
              <NumerosCompletos n={tela.perfilNumeros} />
            ) : (
              <Silhueta forma="numeros" recurso="Os números completos" voltar={voltarPara} />
            )}
          </SecaoStats>
        </div>
      </div>

      <UltimaAtualizacao em={tela.atualizacao.em} fonte={tela.atualizacao.fonte} agora={dados.agora} fuso={fuso} />
    </div>
  )
}
