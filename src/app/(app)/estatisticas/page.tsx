import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { buscar } from '@/modules/entrega/estatisticas/busca'
import { dataValidaOuHoje, navegacaoDeDatas } from '@/modules/entrega/estatisticas/calendario'
import { telaJogosDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import type { JogoDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { telaDaClassificacao } from '@/modules/entrega/estatisticas/time'
import type { TelaClassificacao } from '@/modules/entrega/estatisticas/time'
import { rotaDoJogador, rotaDoJogo, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { diaLongo, formatarAproveitamento, horaCurta } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { LogoTime, Tabela, UltimaAtualizacao } from '@/design-system/componentes'
import type { Coluna } from '@/design-system/componentes'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { identidadeDoTime } from '@/design-system/times'
import { semantico } from '@/design-system/tokens/semantico'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { lateralPadrao } from '@/app/(app)/lateral/montar'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import '@/design-system/tokens/tokens.css'
import { Secao, SemBanco, SOBRANCELHA_STATS } from './moldura'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Estatísticas' }

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
          color: semantico.textoSobreAcento,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        Buscar
      </button>
    </form>
  )
}

/**
 * TÍTULO DA SEÇÃO — precisa dizer que dia é esse.
 *
 * "Jogos do dia" sozinho é verdade só para hoje. Antes desta função o rótulo
 * nunca mudava com a navegação por data, e o vazio dizia "Nenhum jogo hoje."
 * para um dia que não era hoje — uma afirmação falsa sobre o calendário
 * (achado da revisão). Mesmo precedente de `diaLongo` que `/resultados` já
 * usa para rotular rodada por rodada.
 */
function tituloJogosDoDia(data: string, hoje: string): string {
  return data === hoje ? 'Jogos do dia' : `Jogos de ${diaLongo(data)}`
}

/** Rótulo condensado em maiúsculas — a tipografia de apoio da identidade. */
const ROTULO = {
  fontFamily: semantico.fonteRotulo,
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  fontWeight: 700,
} as const

/**
 * UMA LINHA DA FILA DE JOGOS — a mesma fila do Fire Live, vista pelo lado do
 * DADO (spec 04, §4.5).
 *
 * A gramática é a do `CabecalhoJogo`: visitante @ mandante, sigla na fonte de título no
 * lugar do escudo, status com ponto + texto, nada pulsando. O que muda — e é
 * por isso que a linha mora nesta tela e não naquele componente — são duas
 * coisas:
 *
 * - aqui a linha é um LINK para a partida; um cabeçalho de seção não é;
 * - aqui o jogo EM ANDAMENTO mostra o parcial. Na Lista Secreta e nos
 *   Resultados o placar só aparece com o jogo encerrado, e de propósito: lá o
 *   número é o desfecho do apito. Aqui ele é o dado que o assinante veio
 *   consultar.
 *
 * O parcial não elege vencedor: os dois números têm o mesmo peso até o jogo
 * acabar. A sentença é do fim — a mesma regra que tirou o "V" da coluna de
 * resultado do time.
 */
function LinhaDeJogo({ jogo, fuso, href }: { jogo: JogoDoDia; fuso: string; href: string }) {
  const temPlacar = jogo.casa.placar !== null && jogo.visitante.placar !== null
  const encerrado = jogo.status === 'ENCERRADO'

  const sigla = (texto: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <LogoTime sigla={texto} tamanho={20} />
      <span
        style={{
          fontFamily: semantico.fonteTitulo,
          fontSize: 18,
          letterSpacing: 0.5,
          color: semantico.texto100,
        }}
      >
        {texto}
      </span>
    </span>
  )

  const pontos = (feitos: number, forte: boolean) => (
    <span
      style={{
        fontFamily: semantico.fonteTitulo,
        fontSize: 18,
        letterSpacing: 1,
        fontVariantNumeric: 'tabular-nums',
        color: forte ? semantico.texto100 : semantico.texto55,
      }}
    >
      {feitos}
    </span>
  )

  const separador = (texto: string) => (
    <span
      style={{
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        letterSpacing: 1,
        color: semantico.texto40,
      }}
    >
      {texto}
    </span>
  )

  return (
    <a
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 2px',
        borderBottom: `1px solid ${semantico.divisorSuave}`,
        color: semantico.texto100,
        textDecoration: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {sigla(jogo.visitante.sigla)}
        {temPlacar ? (
          <>
            {pontos(
              jogo.visitante.placar!,
              !encerrado || jogo.visitante.placar! >= jogo.casa.placar!,
            )}
            {separador('·')}
            {pontos(jogo.casa.placar!, !encerrado || jogo.casa.placar! >= jogo.visitante.placar!)}
          </>
        ) : (
          separador('@')
        )}
        {sigla(jogo.casa.sigla)}
      </span>

      {jogo.status === 'AGENDADO' ? (
        <span
          style={{
            fontFamily: semantico.fonteRotulo,
            fontSize: 12,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            fontWeight: 600,
            color: semantico.textoSecundario,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {horaCurta(jogo.dataHoraUtc, fuso)}
        </span>
      ) : jogo.status === 'AO_VIVO' ? (
        <span
          style={{
            ...ROTULO,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: semantico.aoVivo,
          }}
        >
          {/* Ponto + texto: a cor sozinha nunca diz "ao vivo". E o ponto não
              pulsa — na identidade 04 nada se anima continuamente. */}
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: semantico.vivoSelo,
            }}
          />
          {jogo.quartoAtual ?? 1}º Q · AO VIVO
        </span>
      ) : (
        <span style={{ ...ROTULO, color: semantico.texto55 }}>ENCERRADO</span>
      )}
    </a>
  )
}

type LinhaDaClassificacao = TelaClassificacao['linhas'][number]

/**
 * O TRILHO DA PÓS-TEMPORADA — 1 a 6 vão ao playoff, 7 a 10 disputam o
 * play-in, por conferência.
 *
 * É estrutura da LIGA, não estratégia do CJ: nenhum apito muda com ela, e por
 * isso ela não vive no ruleset. Vem ESCRITA em cada linha, e não como uma
 * régua colorida entre a 6ª e a 7ª posição, porque a régua obriga a contar
 * linhas para saber onde o seu time caiu.
 */
const TRILHO = { playoff: 6, playIn: 10 } as const

function trilhoDa(posicao: number | null): string {
  if (posicao === null) return '—'
  if (posicao <= TRILHO.playoff) return 'playoff'
  if (posicao <= TRILHO.playIn) return 'play-in'
  return '—'
}

/**
 * OS ÚLTIMOS RESULTADOS COMO PONTINHOS.
 *
 * Cada ponto é NOMEADO ("vitória"/"derrota"): verde e vermelho não chegam a
 * quem lê por leitor de tela nem a quem não separa as duas cores. Sem partida
 * encerrada, "—" — a ausência é dita, nunca desenhada como derrota.
 */
function Ultimos({ forma }: { forma: readonly ('V' | 'D')[] }) {
  if (forma.length === 0) return <span style={{ color: semantico.texto40 }}>—</span>
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {forma.map((resultado, indice) => (
        <span
          key={indice}
          role="img"
          aria-label={resultado === 'V' ? 'vitória' : 'derrota'}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: resultado === 'V' ? semantico.barrinhaBateu : semantico.barrinhaFalhou,
          }}
        />
      ))}
    </span>
  )
}

/**
 * JOGOS ATRÁS DO LÍDER DA CONFERÊNCIA — ((Vl − V) + (D − Dl)) / 2.
 *
 * É a conta da liga, e ela responde o que o aproveitamento não responde: dois
 * times com campanhas diferentes podem ter o mesmo percentual, e é a distância
 * em jogos que diz quem ainda alcança quem.
 *
 * O líder recebe "—", não zero: ele não está atrás de ninguém, e um "0" na
 * primeira linha se lê como distância medida.
 */
function jogosAtras(lider: LinhaDaClassificacao | undefined, linha: LinhaDaClassificacao): string {
  if (lider === undefined || lider.timeId === linha.timeId) return '—'
  const atraso = (lider.vitorias - linha.vitorias + (linha.derrotas - lider.derrotas)) / 2
  return atraso === 0 ? '—' : atraso.toFixed(1).replace('.0', '').replace('.', ',')
}

/**
 * COMO O GRUPO SE ANUNCIA.
 *
 * Sem linha nenhuma não existe grupo a rotular: a tela ainda precisa dizer que
 * não há classificação, mas "sem conferência" ali anunciaria um conjunto de
 * times que não existe — e a temporada vazia é exatamente o estado de um banco
 * recém-migrado.
 */
function rotuloDoGrupo(
  conferencia: string | null,
  quantasLinhas: number,
): { titulo: string; legenda: string } {
  if (quantasLinhas === 0) {
    return {
      titulo: 'Classificação',
      legenda: 'Classificação da temporada, da primeira posição para a última',
    }
  }
  return {
    titulo: `Classificação · ${conferencia ?? 'sem conferência'}`,
    legenda:
      conferencia === null
        ? 'Classificação dos times sem conferência registrada, da primeira posição para a última'
        : `Classificação da conferência ${conferencia}, da primeira posição para a última`,
  }
}

/**
 * A CLASSIFICAÇÃO COMO TABELA (spec 04, §4.5), no lugar da grade de
 * caixinhas — que gastava a tela inteira para dizer sigla e campanha, e não
 * dizia posição, aproveitamento, sequência nem forma.
 *
 * A sigla continua sendo a porta do time: era o único serviço que a grade
 * prestava, e ele não podia se perder na troca.
 *
 * As colunas dependem do LÍDER da conferência — "jogos atrás" só existe em
 * relação a alguém —, e é por isso que isto é função e não constante. Sem
 * linha nenhuma não há líder, e a tabela nem chega a desenhar célula: escreve
 * a frase de vazio.
 */
function colunasDaClassificacao(
  lider: LinhaDaClassificacao | undefined,
): Coluna<LinhaDaClassificacao>[] {
  return [
    {
      chave: 'pos',
      rotulo: 'POS',
      descricao: 'posição na conferência',
      celula: (l) => (
        <span style={{ color: semantico.texto55 }}>
          {l.posicao === null ? '—' : `${l.posicao}º`}
        </span>
      ),
    },
    {
      chave: 'time',
      rotulo: 'TIME',
      descricao: 'sigla do time',
      celula: (l) => (
        <a
          href={rotaDoTime(l.timeId)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            color: semantico.texto100,
          }}
        >
          {/* A logo NOMEIA o time (`role="img"` + `aria-label`): quem ouve a
              linha no celular ouve a franquia inteira, e ali o nome por
              extenso não existe — a coluna FRANQUIA some abaixo de 900 px. E
              ela nunca é o único canal: a sigla vem escrita ao lado. */}
          <LogoTime sigla={l.sigla} tamanho={22} />
          <span style={{ fontFamily: semantico.fonteTitulo, fontSize: 16, letterSpacing: 0.5 }}>
            {l.sigla}
          </span>
        </a>
      ),
    },
    {
      chave: 'franquia',
      rotulo: 'FRANQUIA',
      descricao: 'nome do time',
      soDesktop: true,
      celula: (l) => identidadeDoTime(l.sigla).nome,
    },
    {
      chave: 'vd',
      rotulo: 'V–D',
      descricao: 'vitórias e derrotas',
      alinhamento: 'direita',
      celula: (l) => `${l.vitorias}–${l.derrotas}`,
    },
    {
      chave: 'aprov',
      rotulo: '%',
      descricao: 'aproveitamento',
      alinhamento: 'direita',
      celula: (l) => formatarAproveitamento(l.aproveitamento),
    },
    {
      chave: 'seq',
      rotulo: 'SEQ',
      descricao: 'sequência atual',
      alinhamento: 'direita',
      // Fora do celular: "V3" repete o que os pontinhos de ÚLT. 5 já mostram,
      // e o que cabe em 390 px é a lista da spec §4.2.
      soDesktop: true,
      celula: (l) => l.sequencia ?? '—',
    },
    {
      chave: 'ultimos',
      rotulo: 'ÚLT. 5',
      descricao: 'últimos cinco jogos',
      celula: (l) => <Ultimos forma={l.forma} />,
    },
    {
      chave: 'ja',
      rotulo: 'JA',
      descricao: 'jogos atrás do líder da conferência',
      alinhamento: 'direita',
      soDesktop: true,
      celula: (l) => jogosAtras(lider, l),
    },
    {
      chave: 'trilho',
      rotulo: 'TRILHO',
      descricao: 'trilho de playoff ou play-in',
      celula: (l) => (
        <span
          style={{
            color:
              l.posicao !== null && l.posicao <= TRILHO.playIn
                ? semantico.texto70
                : semantico.texto40,
          }}
        >
          {trilhoDa(l.posicao)}
        </span>
      ),
    },
  ]
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

  // A classificação é 100% grátis (spec §5, régua da linha 5): a guarda pede
  // login (R-A3) e nada mais. `acesso` só é desestruturado para o botão do
  // assistente (MVP+, decisão 7) — nenhum outro trecho da tela depende dele.
  const { sessao, acesso } = await exigirNivel('GRATIS', '/estatisticas')

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

  // A classificação é POR CONFERÊNCIA: é assim que a liga a publica e é o
  // único recorte em que o trilho de playoff/play-in significa alguma coisa.
  // Time sem conferência no cadastro cai num grupo ROTULADO como tal: a falta
  // de dado aparece na tela em vez de virar "Leste" por padrão — carimbar uma
  // divisão que ninguém verificou é o erro que esta tela existe para não
  // repetir.
  const conferencias = [...new Set(classificacao.linhas.map((l) => l.conferencia))].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b),
  )
  // Sem NENHUMA linha, a seção continua existindo para dizer que não há
  // classificação — some-la faria a tela esconder a pergunta em vez de
  // responder que ainda não há resposta.
  const grupos = conferencias.length > 0 ? conferencias : [null]

  return (
    <Moldura aba="stats" conta={{ email: sessao.email }}
      lateral={await lateralPadrao({
        assistente: atende(acesso.nivel, 'MVP'),
        gratis: !atende(acesso.nivel, 'MVP'),
      })} largura="dados" assistente={atende(acesso.nivel, 'MVP')}>
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
                    href={
                      r.tipo === 'JOGADOR'
                        ? rotaDoJogador(r.id, { periodo: '10', atributo: 'PONTOS', q: termo })
                        : rotaDoTime(r.id)
                    }
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

      <Secao titulo={tituloJogosDoDia(data, hoje)}>
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
          <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
            {data === hoje ? 'Nenhum jogo hoje.' : `Nenhum jogo em ${diaLongo(data)}.`}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {doDia.jogos.map((j) => (
              <li key={j.id}>
                {/* A linha inteira leva à partida — as siglas não são links
                    próprios (aninhar <a> dentro de <a> é HTML inválido). O
                    time continua a um toque pela partida e pela classificação
                    logo abaixo. */}
                <LinhaDeJogo jogo={j} fuso={fuso} href={`${rotaDoJogo(j.id)}?data=${data}`} />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Lado a lado no desktop, empilhadas no celular: a classificação se lê
          por varredura, e duas conferências em sequência obrigam a rolar para
          comparar o que a liga publica em paralelo. A classe leva SÓ a media
          query — é o que o estilo inline não faz. */}
      <div className="grade-conferencias" style={{ display: 'grid', gap: 24 }}>
        {grupos.map((conferencia) => {
          const linhas = classificacao.linhas.filter((l) => l.conferencia === conferencia)
          const grupo = rotuloDoGrupo(conferencia, linhas.length)
          return (
            <Secao
              key={conferencia ?? 'sem-conferencia'}
              titulo={grupo.titulo}
              aux={`temporada ${temporada}`}
            >
              <Tabela
                legenda={grupo.legenda}
                colunas={colunasDaClassificacao(linhas[0])}
                linhas={linhas}
                chaveDaLinha={(l) => l.timeId}
                vazio="Sem classificação registrada para esta temporada."
                separadorApos={(l) => l.posicao === TRILHO.playIn}
              />
              {/* O corte é desenhado NA tabela e dito EMBAIXO dela: uma régua
                  sozinha obriga a contar linhas para saber de que lado o seu
                  time caiu, e some para quem não a enxerga. Sem linha nenhuma
                  não há corte a explicar. */}
              {linhas.length > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: semantico.texto40 }}>
                  playoff da 1ª à {TRILHO.playoff}ª · play-in até a {TRILHO.playIn}ª · corte do
                  play-in entre a {TRILHO.playIn}ª e a {TRILHO.playIn + 1}ª
                </p>
              )}
            </Secao>
          )
        })}
      </div>

      {/* Requisito: TODA tela da aba informa o horário do dado. */}
      <UltimaAtualizacao
        em={doDia.atualizacao.em}
        fonte={doDia.atualizacao.fonte}
        agora={agora}
        fuso={fuso}
      />
    </Moldura>
  )
}
