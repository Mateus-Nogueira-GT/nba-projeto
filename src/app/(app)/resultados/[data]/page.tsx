import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'

import { dataHora, diaDaRodada } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { Avatar, CabecalhoJogo, CardEntrada } from '@/design-system/componentes'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe, type ConfigTemporada } from '@/modules/dominio/temporada'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { estadoDoCiclo } from '@/modules/entrega/lista-por-jogo'
import { lerFeed, type ItemFeed } from '@/modules/entrega/lista-secreta'
import { greensDoDia, recapDaNoite, taxaDaTemporada } from '@/modules/entrega/resultados'
import type { JogadorConferido, JogoEncerradoResumo } from '@/modules/entrega/resultados'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import type { Atributo, NivelApito } from '@/modules/motor/tipos'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Resultados · IA da NBA' }

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'Pontos',
  REBOTES: 'Rebotes',
  ASSISTENCIAS: 'Assistências',
}

const ROTULO: CSSProperties = {
  fontFamily: semantico.fonteRotulo,
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  fontWeight: 600,
  color: semantico.textoSecundario,
}

const CAIXA: CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${semantico.divisor}`,
  background: componente.contextoFrio.cardGradiente,
}

/** Rótulo de calendário que existe de verdade: 2026-02-31 não é uma rodada. */
function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const instante = new Date(`${data}T12:00:00.000Z`)
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === data
}

/**
 * A JANELA DA TEMPORADA — da abertura até a rodada em tela.
 *
 * O contador não é "os últimos N dias": é a temporada corrente, que começa no
 * mês declarado no ruleset (`temporada.mes_inicio`). Somar dias fixos faria a
 * taxa arrastar jogos da temporada passada em outubro, e é ela que o produto
 * usa como argumento de venda. `taxaDaTemporada` recebe a janela em dias
 * porque a consulta é uma só; a regra de onde ela começa é daqui.
 */
function diasDaTemporada(data: string, config: ConfigTemporada): number {
  const meioDia = `${data}T12:00:00.000Z`
  const anoBase = temporadaDe(new Date(meioDia), config).slice(0, 4)
  const abertura = `${anoBase}-${String(config.mesInicio).padStart(2, '0')}-01T12:00:00.000Z`
  const dias = Math.round((Date.parse(meioDia) - Date.parse(abertura)) / 86_400_000)
  return Math.max(1, dias + 1)
}

/** Percentual inteiro. O da NOITE e o da TEMPORADA nunca são % de confiança. */
const inteiro = (taxa: number) => `${Math.round(taxa * 100)}%`
const decimal = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * Contra quem o apitado jogou E de que lado, quando as siglas permitem
 * afirmar. O mando vai junto porque o apoio do card escreve `vs ADV` para o
 * mandante e `@ ADV` para o visitante (artboards da 04) — sem ele, metade dos
 * cards da tela diria "em casa" para quem estava fora.
 */
function adversarioDe(
  jogo: JogoEncerradoResumo,
  timeSigla: string,
): { sigla: string; emCasa: boolean } | null {
  if (timeSigla === jogo.casaSigla) return { sigla: jogo.visitanteSigla, emCasa: true }
  if (timeSigla === jogo.visitanteSigla) return { sigla: jogo.casaSigla, emCasa: false }
  return null
}

/**
 * Dentro do jogo: quem bateu primeiro, quem não bateu depois, quem não jogou
 * por último — a ordem em que o assinante lê o resultado. Antes de o jogo
 * acabar não há veredito, e a ordem volta a ser a do sinal (nível do apito).
 */
function ordenarCards(cards: JogadorConferido[], conferido: boolean): JogadorConferido[] {
  const veredito = (c: JogadorConferido) =>
    !conferido ? 0 : c.bateuLinhaMaisBaixa === true ? 0 : c.bateuLinhaMaisBaixa === false ? 1 : 2
  return [...cards].sort(
    (a, b) =>
      veredito(a) - veredito(b) || b.nivelApito - a.nivelApito || a.nome.localeCompare(b.nome),
  )
}

/** Uma seta da navegação de rodada. Desabilitada é SPAN: sem href, sem toque. */
function Seta({
  href,
  rotulo,
  sentido,
}: {
  href: string | null
  rotulo: string
  sentido: 'anterior' | 'proxima'
}) {
  const caixa: CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: `1.5px solid ${semantico.divisor}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    opacity: href === null ? 0.4 : undefined,
  }
  const desenho = (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke={semantico.textoSecundario}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={sentido === 'anterior' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'} />
    </svg>
  )
  return href === null ? (
    <span style={caixa} aria-disabled="true" aria-label={rotulo}>
      {desenho}
    </span>
  ) : (
    <Link href={href} style={caixa} aria-label={rotulo}>
      {desenho}
    </Link>
  )
}

/** Um número do bloco da noite: rótulo pequeno em cima, número grande embaixo. */
function NumeroDaNoite({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <p style={{ ...ROTULO, margin: 0 }}>{rotulo}</p>
      <p
        style={{
          margin: '2px 0 0',
          fontFamily: semantico.fonteTitulo,
          fontSize: 30,
          letterSpacing: 0.5,
          lineHeight: 1.1,
          color: cor ?? semantico.texto100,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </p>
    </div>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '32px 16px',
        textAlign: 'center',
        border: `1px dashed ${semantico.divisor}`,
        borderRadius: 12,
      }}
    >
      {children}
    </div>
  )
}

/**
 * RESULTADOS DA RODADA — a tela de ANÁLISE da noite (spec 04, §4.4).
 *
 * A rodada está na ROTA (`/resultados/2026-01-14`), e o rótulo é o da RODADA,
 * não o da data local de quem lê. De cima para baixo: os três números da
 * noite, o contador da temporada, o apito da noite, e então um cabeçalho de
 * jogo por partida com os cards conferidos dentro — a mesma gramática por jogo
 * da Lista Secreta e do Fire Live.
 *
 * O card é o MESMO `CardEntrada` das outras duas telas, agora no fim do ciclo:
 * o estado vem do jogo e do box score (`estadoDoCiclo`), nunca do fato de o
 * jogador ter ou não estatística — o box PARCIAL do 1º quarto faria a tela
 * dizer "não jogou" para quem entra em quadra às 22h (§5.1).
 */
export default async function PaginaResultadosDaRodada({
  params,
}: {
  params: Promise<{ data: string }>
}) {
  const { data } = await params

  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba="lista">
        <h1>Resultados</h1>
        <p style={{ color: semantico.textoSecundario }}>Banco não configurado.</p>
      </Moldura>
    )
  }

  const sessao = await sessaoAtual()
  if (!sessao) redirect(`/entrar?destino=/resultados/${data}`)
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (!acesso.permitido) redirect('/assinar')

  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  // Rota inventada não vira erro nem tela vazia: volta para a rodada de hoje.
  if (!dataValida(data)) redirect(`/resultados/${hoje}`)

  const [recap, temporada, greens, feed] = await Promise.all([
    recapDaNoite(getDb(), data),
    // `ate` é EXCLUSIVO na entrega: +1 dia para a rodada em tela entrar na conta.
    taxaDaTemporada(
      getDb(),
      somarDias(data, 1),
      diasDaTemporada(data, calendarioDoRuleset(ruleset)),
    ),
    greensDoDia(getDb(), data),
    lerFeed(getDb(), data),
  ])

  // O item do feed é a metade PRÉ-LIVE do card: barrinhas, grau, posição. A
  // chave é (jogo, jogador, atributo) — o mesmo card da conferência — e entre
  // as linhas do mesmo apito vale a MAIS BAIXA, que é a que o card confere.
  const itemPorCard = new Map<string, ItemFeed>()
  for (const item of feed?.conteudo.itens ?? []) {
    const chave = `${item.jogoId}|${item.jogadorId}|${item.atributo}`
    const atual = itemPorCard.get(chave)
    if (!atual || (item.linha ?? Infinity) < (atual.linha ?? Infinity)) itemPorCard.set(chave, item)
  }

  const proxima = data >= hoje ? null : `/resultados/${somarDias(data, 1)}`
  const cabecalho = (
    <CabecalhoTela
      sobrancelha="RESULTADOS · RODADA"
      titulo={diaDaRodada(data)}
      selo={
        <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-end' }}>
          <Seta
            href={`/resultados/${somarDias(data, -1)}`}
            rotulo="Rodada anterior"
            sentido="anterior"
          />
          <Seta href={proxima} rotulo="Próxima rodada" sentido="proxima" />
        </div>
      }
      seletor={{
        rotulo: 'Rodada',
        ativa: 'resultados',
        opcoes: [
          { valor: 'hoje', rotulo: 'HOJE', href: '/' },
          { valor: 'resultados', rotulo: 'RESULTADOS', href: `/resultados/${data}` },
        ],
      }}
    />
  )

  if (recap.porJogo.length === 0) {
    return (
      <Moldura aba="lista">
        {cabecalho}
        <Vazio>
          <p style={{ margin: 0, fontWeight: 700 }}>Sem lista publicada neste dia</p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: semantico.textoSecundario }}>
            Use as setas para navegar até uma rodada com lista.
          </p>
        </Vazio>
      </Moldura>
    )
  }

  return (
    <Moldura aba="lista">
      {cabecalho}

      {/* A NOITE em três números. "BATERAM" e "NA NOITE" são taxas de
          conferência — nunca dividem elemento com um % de confiança de apito. */}
      <div
        style={{
          ...CAIXA,
          marginTop: 16,
          padding: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        <NumeroDaNoite rotulo="APITOS" valor={String(recap.apitos)} />
        <NumeroDaNoite
          rotulo="BATERAM"
          valor={String(recap.bateram)}
          cor={componente.conferido.bateu}
        />
        <NumeroDaNoite rotulo="NA NOITE" valor={recap.taxa === null ? '—' : inteiro(recap.taxa)} />
      </div>

      {/* A TEMPORADA acumulada — o argumento do produto, e o número que só faz
          sentido longe do card. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
          marginTop: 8,
          padding: '10px 14px',
          borderRadius: 12,
          border: `1px solid ${semantico.divisor}`,
          background: componente.contextoFrio.faixaFundo,
        }}
      >
        <span style={{ ...ROTULO, fontSize: 11 }}>
          {`TEMPORADA · ${temporada.rodadas} ${temporada.rodadas === 1 ? 'RODADA' : 'RODADAS'}`}
        </span>
        <span
          style={{
            fontFamily: semantico.fonteTitulo,
            fontSize: 20,
            letterSpacing: 0.5,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {temporada.conferidos === 0
            ? '—'
            : `${decimal((temporada.acertos / temporada.conferidos) * 100)}%`}
          <small
            style={{
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              letterSpacing: 0.8,
              color: semantico.texto55,
              marginLeft: 6,
            }}
          >
            {`${temporada.acertos.toLocaleString('pt-BR')} de ${temporada.conferidos.toLocaleString('pt-BR')}`}
          </small>
        </span>
      </div>

      {/* O APITO DA NOITE — quem passou mais longe da linha mais baixa. */}
      {recap.apitoDaNoite && (
        <ApitoDaNoite
          card={recap.apitoDaNoite}
          jogo={
            recap.porJogo.find((g) => g.jogo.jogoId === recap.apitoDaNoite!.jogoId)?.jogo ?? null
          }
        />
      )}

      {recap.porJogo.map(({ jogo, cards }) => {
        // O estado vem do JOGO — status, quarto e a chegada do box oficial
        // saem da mesma leitura que trouxe os cards. Cruzar o recap com uma
        // consulta recortada por horário local perdia o jogo tardio da costa
        // oeste, e assumir ENCERRADO para o que faltasse dava "FT · aguardando
        // dado oficial" a um jogo que nem começou (§5.1).
        const estado = estadoDoCiclo(jogo, jogo.temBoxOficial, ruleset.fire_live.quarto)
        const conferido = estado === 'CONFERIDO'

        return (
          <section key={jogo.jogoId}>
            <CabecalhoJogo
              casaSigla={jogo.casaSigla}
              visitanteSigla={jogo.visitanteSigla}
              horarioUtc={jogo.dataHoraUtc}
              fuso={fuso}
              status={jogo.status}
              quartoAtual={jogo.quartoAtual}
              placarCasa={jogo.placarCasa}
              placarVisitante={jogo.placarVisitante}
              quartosCasa={jogo.quartosCasa}
              quartosVisitante={jogo.quartosVisitante}
            />

            {/* O jogo acabou e o box ainda não chegou: NUNCA inferir ✓/✗ de
                dado parcial (§5.1). O que a tela pode afirmar é quando olhou. */}
            {estado === 'AGUARDANDO_OFICIAL' && (
              <p style={{ ...ROTULO, margin: '0 0 10px', fontSize: 11, color: semantico.texto55 }}>
                {`Aguardando dado oficial · última atualização ${dataHora(recap.atualizacao.em, fuso)}`}
              </p>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              {ordenarCards(cards, conferido).map((card) => {
                const item = itemPorCard.get(`${jogo.jogoId}|${card.jogadorId}|${card.atributo}`)
                const jogou = card.fez !== null
                const adversario = adversarioDe(jogo, card.timeSigla)
                // A fileira do card conferido ganha o jogo que ACABOU. Ela
                // segue na ordem canônica do app — mais recente primeiro —, e
                // é o card que a lê cronologicamente: uma direção só, aqui e
                // na Lista Secreta. Quem não jogou não ganha barrinha nova, e
                // sem jogo novo a fileira não é a desta rodada.
                const ultimos5 =
                  conferido && jogou
                    ? [
                        { valor: card.fez!, bateu: card.bateuLinhaMaisBaixa === true },
                        ...(item?.ultimos5 ?? []).slice(0, 4),
                      ]
                    : conferido
                      ? []
                      : (item?.ultimos5 ?? [])

                return (
                  <CardEntrada
                    key={card.chave}
                    nome={card.nome}
                    jogadorHref={rotaDoJogador(card.jogadorId)}
                    fotoUrl={card.fotoUrl}
                    timeSigla={card.timeSigla}
                    adversarioSigla={adversario?.sigla ?? null}
                    emCasa={adversario?.emCasa}
                    posicao={item?.posicao ?? null}
                    atributo={card.atributo}
                    nivelJogador={card.nivelJogador}
                    nivelApito={card.nivelApito as NivelApito}
                    turbo={item?.turbo ?? false}
                    // O veredito ocupa o lugar do %: o card conferido fala de
                    // ACERTO, e nota de confiança ao lado de "fez 27" leria
                    // como se as duas medissem a mesma coisa (§4.4).
                    confianca={conferido ? null : (item?.confianca ?? null)}
                    grauConfianca={item?.grauConfianca ?? null}
                    // A linha conferida é decisão da ENTREGA (a mais baixa que
                    // a lista ofereceu); a tela só a escreve.
                    linha={card.linhaConferida}
                    // Antes do veredito o rodapé é o da Lista: média e odd em
                    // faixa. Conferido, o "fez N ✓" toma o lugar (artboard).
                    mediaTemporada={item?.mediaTemporada ?? null}
                    oddFaixa={item?.oddFaixa ?? null}
                    estado={estado}
                    fez={card.fez}
                    bateu={card.bateuLinhaMaisBaixa}
                    ultimos5={ultimos5}
                    destacarMaisRecente={conferido && jogou}
                  />
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Os greens do Fire Live seguem em bloco PRÓPRIO: são marcos do 1º
          quarto, não conferência de linha, e somar os dois inventaria uma taxa
          que ninguém calculou. */}
      {greens.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ ...ROTULO, margin: '0 0 8px', fontSize: 11 }}>GREENS DO FIRE LIVE</h2>
          <div style={{ display: 'grid', gap: 6 }}>
            {greens.map((green) => (
              <div
                key={green.id}
                style={{
                  ...CAIXA,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '10px 14px',
                  borderColor: semantico.apitoNivel3,
                  fontSize: 14,
                }}
              >
                <strong>
                  {`${green.nome} · ${ATRIBUTO_ROTULO[green.atributo]} ${green.marco}`}
                </strong>
                <span style={{ ...ROTULO, fontSize: 11, color: semantico.texto55 }}>
                  {`${green.valor} no 1º quarto`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </Moldura>
  )
}

/**
 * O APITO DA NOITE — o card em destaque, na borda do nível 3.
 *
 * Não é um `CardEntrada`: aqui não há ciclo, barrinha nem linha para conferir,
 * e sim UM fato — quem passou mais longe da linha mais baixa. O número grande
 * é o que ele fez, na cor de quem bateu.
 */
function ApitoDaNoite({
  card,
  jogo,
}: {
  card: JogadorConferido
  jogo: JogoEncerradoResumo | null
}) {
  const linha = card.linhaConferida
  const adversario = jogo ? adversarioDe(jogo, card.timeSigla) : null
  const apoio = [
    linha === null ? ATRIBUTO_ROTULO[card.atributo] : `${ATRIBUTO_ROTULO[card.atributo]} ${linha}+`,
    card.timeSigla,
    adversario ? `${adversario.emCasa ? 'vs' : '@'} ${adversario.sigla}` : null,
  ]
    .filter((p): p is string => p !== null)
    .join(' · ')

  return (
    <div
      style={{
        ...CAIXA,
        marginTop: 16,
        padding: '12px 14px',
        borderColor: semantico.apitoNivel3,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Avatar
        nome={card.nome}
        fotoUrl={card.fotoUrl}
        timeSigla={card.timeSigla}
        nivelApito={card.nivelApito as NivelApito}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            ...ROTULO,
            margin: 0,
            fontSize: 10,
            letterSpacing: 1.5,
            fontWeight: 700,
            color: semantico.apitoNivel3,
          }}
        >
          APITO DA NOITE
        </p>
        <p
          style={{
            margin: '2px 0 0',
            fontFamily: semantico.fonteTitulo,
            fontSize: 18,
            letterSpacing: 0.5,
            lineHeight: 1.1,
            textTransform: 'uppercase',
          }}
        >
          {card.nome}
        </p>
        <p style={{ ...ROTULO, margin: '2px 0 0', fontSize: 12, letterSpacing: 1 }}>{apoio}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: semantico.fonteTitulo,
            fontSize: 30,
            lineHeight: 1,
            color: componente.conferido.bateu,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {card.fez}
        </p>
        <p style={{ ...ROTULO, margin: '2px 0 0' }}>{ATRIBUTO_ROTULO[card.atributo]}</p>
      </div>
    </div>
  )
}
