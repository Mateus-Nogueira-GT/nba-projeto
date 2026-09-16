import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'

import { dataHora, diaDaRodada } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { Avatar, CabecalhoJogo, CardEntrada } from '@/design-system/componentes'
import { identidadeDoTime } from '@/design-system/times'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe, type ConfigTemporada } from '@/modules/dominio/temporada'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { estadoDoCiclo } from '@/modules/entrega/lista-por-jogo'
import { lerFeed, type ItemFeed } from '@/modules/entrega/lista-secreta'
import {
  conferirFireLive,
  filtrosResultadosDaUrl,
  filtrarRecapDaNoite,
  greensDoDia,
  recapDaNoite,
  rotaResultados,
  taxaDaTemporada,
} from '@/modules/entrega/resultados'
import type {
  JogadorConferido,
  JogoEncerradoResumo,
  ResultadoFireLive,
} from '@/modules/entrega/resultados'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import type { Atributo, NivelApito } from '@/modules/motor/tipos'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Resultados' }

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'Pontos',
  REBOTES: 'Rebotes',
  ASSISTENCIAS: 'Assistências',
}
/** A unidade escrita depois do número ("25 pontos") — nunca antes, que é a gramática da linha. */
const ATRIBUTO_UNIDADE: Record<Atributo, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
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
  // Defesa em profundidade: com o ano preenchido isto não dispara, mas uma
  // abertura ilegível não pode virar NaN dentro de `somarDias`.
  if (!Number.isFinite(dias)) return 1
  // NÃO HÁ ANO 0 no calendário do Postgres: a temporada de 0001-01-01 abriria
  // em 0000-10-01 e a consulta da taxa morreria convertendo o parâmetro
  // (diagnóstico de 13/09). A janela para na primeira data que existe — isto
  // não é limite de calendário da liga, é o alcance do tipo `date`.
  const ateAPrimeiraData =
    Math.round((Date.parse(meioDia) - Date.parse('0001-01-01T12:00:00.000Z')) / 86_400_000) + 1
  return Math.max(1, Math.min(dias + 1, ateAPrimeiraData))
}

/** Percentual inteiro. O da NOITE e o da TEMPORADA nunca são % de confiança. */
const inteiro = (taxa: number) => `${Math.round(taxa * 100)}%`
const decimal = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * Contra quem o apitado jogou E de que lado. O mando vai junto porque o apoio
 * do card escreve `vs ADV` para o mandante e `@ ADV` para o visitante
 * (artboards da 04) — sem ele, metade dos cards da tela diria "em casa" para
 * quem estava fora.
 *
 * O time é o da LISTA DO CJ (`JogadorConferido.timeId`), comparado por ID com
 * os dois lados do jogo — nunca `jogadores.time_id`, que é o time REAL do
 * provedor (CLAUDE.md: a única exceção é a aba de estatísticas). Com elenco
 * projetado (Giannis no Miami) o time real não casa com lado nenhum e o
 * confronto sumiria; e quando o time real é justamente o adversário daquela
 * noite, o mando inverte. Mesma leitura de `apitosDoJogador` no perfil.
 */
function adversarioDe(
  jogo: JogoEncerradoResumo,
  timeId: string | null,
): { sigla: string; emCasa: boolean } | null {
  if (timeId === null) return null
  if (timeId === jogo.casaId) return { sigla: jogo.visitanteSigla, emCasa: true }
  if (timeId === jogo.visitanteId) return { sigla: jogo.casaSigla, emCasa: false }
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

/**
 * Um número do bloco da noite: rótulo pequeno em cima, número grande embaixo.
 *
 * `nota` toma o lugar do número quando ainda não há o que contar ("aguardando
 * o fim da noite"); `base` escreve embaixo sobre quantos ele foi calculado
 * ("22 de 27") — só quando a base difere do que está em tela.
 */
function NumeroDaNoite({
  rotulo,
  valor,
  cor,
  nota,
  base,
}: {
  rotulo: string
  valor?: string
  cor?: string
  nota?: string
  base?: string
}) {
  return (
    <div>
      <p style={{ ...ROTULO, margin: 0 }}>{rotulo}</p>
      {nota ? (
        <p
          style={{
            margin: '4px 0 0',
            minHeight: 33,
            fontFamily: semantico.fonteRotulo,
            fontSize: 11,
            letterSpacing: 0.6,
            lineHeight: 1.25,
            color: semantico.texto55,
          }}
        >
          {nota}
        </p>
      ) : (
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
      )}
      {base && (
        <p
          style={{
            margin: '2px 0 0',
            fontFamily: semantico.fonteRotulo,
            fontSize: 11,
            letterSpacing: 0.8,
            color: semantico.texto55,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {base}
        </p>
      )}
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
 *
 * Enquanto a noite NÃO terminou (`recap.noiteEncerrada` falso) a tela conta os
 * apitos publicados e escreve "aguardando o fim da noite" no lugar da taxa —
 * nunca "APITOS 0 · BATERAM 0" em cima de trinta cards, nem uma taxa que muda
 * a cada jogo que acaba. O apito da noite é superlativo da noite inteira e só
 * aparece quando ela acabou. `/resultados` sem data já cai na última noite
 * que terminou; a rodada em curso se alcança pela seta.
 */
export default async function PaginaResultadosDaRodada({
  params,
  searchParams,
}: {
  params: Promise<{ data: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { data } = await params
  const filtros = filtrosResultadosDaUrl((await searchParams) ?? {})

  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba="lista" largura="dados">
        <h1>Resultados</h1>
        <p style={{ color: semantico.textoSecundario }}>Banco não configurado.</p>
      </Moldura>
    )
  }

  // Resultados é inteiro para TODO nível (spec, decisão 9) — a prova social
  // que convence quem ainda não assina. `exigirNivel` continua aqui porque a
  // tela exige sessão (é a guarda de LOGIN, não de plano). `acesso` só serve
  // ao botão do assistente (MVP+, decisão 7): o resto da tela não depende dele.
  const { acesso } = await exigirNivel('GRATIS', rotaResultados(data, filtros))

  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  // Rota inventada não vira erro nem tela vazia: volta para a rodada de hoje.
  if (!dataValida(data)) redirect(rotaResultados(hoje, filtros))

  const [rodadaInteira, temporada, greensLidos, feed, fireLido] = await Promise.all([
    recapDaNoite(getDb(), data),
    // `ate` é EXCLUSIVO na entrega: +1 dia para a rodada em tela entrar na conta.
    taxaDaTemporada(
      getDb(),
      somarDias(data, 1),
      diasDaTemporada(data, calendarioDoRuleset(ruleset)),
    ),
    greensDoDia(getDb(), data),
    lerFeed(getDb(), data),
    conferirFireLive(getDb(), data),
  ])
  const recap = filtrarRecapDaNoite(rodadaInteira, filtros)
  const mostrarLista = filtros.estrategia !== 'FIRE_LIVE'
  const mostrarFire = filtros.estrategia !== 'LISTA_SECRETA'
  const fire = fireLido.filter(
    (c) =>
      (!filtros.atributo || c.atributo === filtros.atributo) &&
      (!filtros.timeId || c.timeId === filtros.timeId),
  )
  const greens = greensLidos.filter(
    (g) =>
      mostrarFire &&
      (!filtros.atributo || g.atributo === filtros.atributo) &&
      (!filtros.timeId || g.timeId === filtros.timeId),
  )
  const timesDaRodada = new Map(
    [...rodadaInteira.porJogo.flatMap((g) => g.cards), ...fireLido]
      .filter((c) => c.timeId !== null)
      .map((c) => [c.timeId!, c.timeSigla]),
  )
  const filtrado = Boolean(filtros.atributo || filtros.timeId)
  const controles = (
    <form
      action={`/resultados/${data}`}
      aria-label="Filtros de resultados"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}
    >
      {[
        {
          nome: 'estrategia',
          rotulo: 'Estratégia',
          atual: filtros.estrategia ?? '',
          opcoes: [
            ['', 'Todas'],
            ['LISTA_SECRETA', 'Lista Secreta'],
            ['FIRE_LIVE', 'Fire Live'],
          ],
        },
        {
          nome: 'atributo',
          rotulo: 'Atributo',
          atual: filtros.atributo ?? '',
          opcoes: [['', 'Todos'], ...Object.entries(ATRIBUTO_ROTULO)],
        },
        {
          nome: 'time',
          rotulo: 'Time da curadoria NIP',
          atual: filtros.timeId ?? '',
          opcoes: [
            ['', 'Todos'],
            ...[...timesDaRodada].map(([id, sigla]) => [id, identidadeDoTime(sigla).nome]),
          ],
        },
      ].map((campo) => (
        <label
          key={campo.nome}
          style={{ display: 'grid', gap: 4, fontSize: 12, flex: '1 1 140px', minWidth: 0 }}
        >
          {campo.rotulo}
          <select
            name={campo.nome}
            defaultValue={campo.atual}
            style={{
              background: semantico.superficieElevada,
              color: semantico.textoPrimario,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${semantico.divisor}`,
              minWidth: 0,
            }}
          >
            {campo.opcoes.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        type="submit"
        style={{
          padding: '10px 12px',
          background: semantico.acento,
          color: semantico.fundo,
          border: 0,
          borderRadius: 8,
          fontWeight: 700,
        }}
      >
        Aplicar
      </button>
      <Link href={`/resultados/${data}`} style={{ padding: 10, color: semantico.acento }}>
        Limpar
      </Link>
    </form>
  )

  // O item do feed é a metade PRÉ-LIVE do card: barrinhas, grau, posição. A
  // chave é (jogo, jogador, atributo) — o mesmo card da conferência — e entre
  // as linhas do mesmo apito vale a MAIS BAIXA, que é a que o card confere.
  const itemPorCard = new Map<string, ItemFeed>()
  for (const item of feed?.conteudo.itens ?? []) {
    const chave = `${item.jogoId}|${item.jogadorId}|${item.atributo}`
    const atual = itemPorCard.get(chave)
    if (!atual || (item.linha ?? Infinity) < (atual.linha ?? Infinity)) itemPorCard.set(chave, item)
  }

  const proxima = data >= hoje ? null : rotaResultados(somarDias(data, 1), filtros)
  // A noite ainda não terminou: sem taxa, sem apito da noite (§5.1).
  const emCurso = !recap.noiteEncerrada
  const cabecalho = (
    <CabecalhoTela
      sobrancelha="RESULTADOS · RODADA"
      titulo={diaDaRodada(data)}
      selo={
        <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-end' }}>
          <Seta
            href={rotaResultados(somarDias(data, -1), filtros)}
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
          { valor: 'resultados', rotulo: 'RESULTADOS', href: rotaResultados(data, filtros) },
        ],
      }}
    />
  )

  if (rodadaInteira.porJogo.length === 0 && fireLido.length === 0) {
    return (
      <Moldura aba="lista" largura="dados" assistente={atende(acesso.nivel, 'MVP')}>
        {cabecalho}
        {controles}
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
    <Moldura aba="lista" largura="dados" assistente={atende(acesso.nivel, 'MVP')}>
      {cabecalho}
      {controles}
      <style>{`@keyframes resultados-entrada { from { opacity: 0.7; } to { opacity: 1; } } .resultados-resumo { animation: resultados-entrada 180ms ease-out; } @media (prefers-reduced-motion: reduce) { .resultados-resumo { animation: none; } }`}</style>
      {mostrarLista && (
        <>
          <p
            style={{ ...ROTULO, margin: '12px 0 0' }}
          >{`${filtrado ? 'Resumo dos filtros' : 'Resumo da rodada'} · Lista Secreta · jogo inteiro`}</p>
          {recap.publicados === 0 && <p>Nenhuma entrada da Lista Secreta nestes filtros.</p>}

          {/* A NOITE em três números. "BATERAM" e "NA NOITE" são taxas de
          conferência — nunca dividem elemento com um % de confiança de apito.
          APITOS é o que está em tela (publicados); a taxa é sobre os
          CONFERIDOS, porque DNP é neutro (§4.4) — e quando a base difere do
          que está em tela, ela vem escrita embaixo. */}
          <div
            className="resultados-resumo"
            style={{
              ...CAIXA,
              marginTop: 16,
              padding: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            <NumeroDaNoite rotulo="APITOS" valor={String(recap.publicados)} />
            <NumeroDaNoite
              rotulo="BATERAM"
              valor={recap.conferidos === 0 ? '—' : String(recap.bateram)}
              cor={componente.conferido.bateu}
            />
            {emCurso ? (
              <NumeroDaNoite
                rotulo={filtrado ? 'NOS FILTROS' : 'NA NOITE'}
                nota="aguardando o fim da noite"
              />
            ) : (
              <NumeroDaNoite
                rotulo={filtrado ? 'NOS FILTROS' : 'NA NOITE'}
                valor={recap.taxa === null ? '—' : inteiro(recap.taxa)}
                base={
                  recap.taxa !== null && (filtrado || recap.conferidos !== recap.publicados)
                    ? `${recap.bateram} de ${recap.conferidos}`
                    : undefined
                }
              />
            )}
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

          <p style={{ ...ROTULO, margin: '5px 0 0' }}>
            Temporada da Lista Secreta · todos os atributos e times
          </p>

          {/* O APITO DA NOITE — o turbo que bateu, ou quem passou mais longe da
          linha mais baixa (§4.4). Só com a noite encerrada: é superlativo da
          noite inteira, e mudaria a cada jogo que acabasse. */}
          {!emCurso && recap.apitoDaNoite && (
            <ApitoDaNoite
              card={recap.apitoDaNoite}
              jogo={
                recap.porJogo.find((g) => g.jogo.jogoId === recap.apitoDaNoite!.jogoId)?.jogo ??
                null
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
                dado parcial (§5.1). O que a tela pode afirmar é quando olhou
                ESTE jogo — o carimbo é o dele, nunca o da rodada: o jogo que
                espera o box não herda o horário do vizinho que acabou de ser
                atualizado ("um número velho apresentado como atual é pior do
                que número nenhum", estatisticas/atualizacao.ts). */}
                {estado === 'AGUARDANDO_OFICIAL' && (
                  <p
                    style={{
                      ...ROTULO,
                      margin: '0 0 10px',
                      fontSize: 11,
                      color: semantico.texto55,
                    }}
                  >
                    {`Aguardando dado oficial · última atualização ${dataHora(jogo.atualizadoEm, fuso)}`}
                  </p>
                )}

                <div style={{ display: 'grid', gap: 12 }}>
                  {ordenarCards(cards, conferido).map((card) => {
                    const item = itemPorCard.get(
                      `${jogo.jogoId}|${card.jogadorId}|${card.atributo}`,
                    )
                    const jogou = card.fez !== null
                    const adversario = adversarioDe(jogo, card.timeId)
                    // A fileira do card conferido ganha o jogo que ACABOU, e é a
                    // TELA que a monta em ordem cronológica — o mais antigo à
                    // esquerda, o desta rodada à direita, contornado (artboard).
                    // A entrega materializa `ultimos5` do mais recente ao mais
                    // antigo; o card não inverte nada (inverter lá mudaria a
                    // Lista, o /como-funciona e a galeria congelada). Quem não
                    // jogou não ganha barrinha nova, e sem jogo novo a fileira
                    // não é a desta rodada. Antes do veredito o card é o da
                    // Lista, na mesma ordem dela.
                    const ultimos5 =
                      conferido && jogou
                        ? [
                            ...[...(item?.ultimos5 ?? []).slice(0, 4)].reverse(),
                            { valor: card.fez!, bateu: card.bateuLinhaMaisBaixa === true },
                          ]
                        : conferido
                          ? []
                          : (item?.ultimos5 ?? [])

                    return (
                      <div key={card.chave}>
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
                          turbo={card.turbo}
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
                          destacarUltima={conferido && jogou}
                        />
                        <dl
                          aria-label={`Conferência de ${card.nome} · jogo inteiro`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 8,
                            margin: '0 8px',
                            padding: '10px 12px',
                            border: `1px solid ${semantico.divisor}`,
                            borderTop: 0,
                            borderRadius: '0 0 10px 10px',
                          }}
                        >
                          <div>
                            <dt style={ROTULO}>Linha prevista · jogo inteiro</dt>
                            <dd style={{ margin: '4px 0 0', fontWeight: 700 }}>
                              {card.linhaConferida === null
                                ? 'Sem linha registrada'
                                : `${card.linhaConferida}+ ${ATRIBUTO_UNIDADE[card.atributo]}`}
                            </dd>
                          </div>
                          <div>
                            <dt style={ROTULO}>Realizado · jogo inteiro</dt>
                            <dd style={{ margin: '4px 0 0', fontWeight: 700 }}>
                              {!conferido
                                ? 'Aguardando dado oficial'
                                : card.fez === null
                                  ? 'DNP · neutro'
                                  : `${card.fez} ${ATRIBUTO_UNIDADE[card.atributo]}`}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      )}
      {mostrarFire && <ResultadosDoFireLive cards={fire} filtrado={filtrado} />}

      {/* Os greens do Fire Live seguem em bloco PRÓPRIO: são marcos do 1º
          quarto, não conferência de linha, e somar os dois inventaria uma taxa
          que ninguém calculou. A escrita é "25 pontos no 1º quarto", com o
          marco nomeado — nunca "Pontos 25": nesta tela atributo + número é a
          gramática da LINHA ("PONTOS 15+"), e o marco não é uma linha. */}
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
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <strong>{green.nome}</strong>
                  <span style={{ ...ROTULO, fontSize: 11, color: semantico.texto55 }}>
                    {`marco ${green.marco}`}
                  </span>
                </span>
                <span style={{ ...ROTULO, fontSize: 11, color: semantico.texto55 }}>
                  {`${green.valor} ${ATRIBUTO_UNIDADE[green.atributo]} no 1º quarto`}
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
 * e sim UM fato — o turbo que bateu, ou quem passou mais longe da linha mais
 * baixa (§4.4; a escolha é da entrega). O número grande é o que ele fez, na
 * cor de quem bateu; o anel do avatar diz o nível do apito, turbo incluído.
 */
function ApitoDaNoite({
  card,
  jogo,
}: {
  card: JogadorConferido
  jogo: JogoEncerradoResumo | null
}) {
  const linha = card.linhaConferida
  const adversario = jogo ? adversarioDe(jogo, card.timeId) : null
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
        turbo={card.turbo}
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

function ResultadosDoFireLive({
  cards,
  filtrado,
}: {
  cards: ResultadoFireLive[]
  filtrado: boolean
}) {
  const conferidos = cards.filter((c) => c.bateu !== null)
  const bateram = conferidos.filter((c) => c.bateu).length
  return (
    <section aria-label="Resultados Fire Live · 1º quarto" style={{ marginTop: 24 }}>
      <h2 style={{ ...ROTULO, fontSize: 14 }}>Fire Live · 1º quarto</h2>
      <p className="resultados-resumo" style={{ fontSize: 13, color: semantico.textoSecundario }}>
        {`${filtrado ? 'Nos filtros' : 'Na rodada'}: ${cards.length} sinais · ${bateram} de ${conferidos.length} alvos conferidos atingidos`}
      </p>
      {cards.length === 0 ? (
        <p>Nenhum sinal do Fire Live nestes filtros.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {cards.map((card) => (
            <li key={card.id} style={{ ...CAIXA, padding: 12 }}>
              <Link
                href={rotaDoJogador(card.jogadorId)}
                style={{
                  color: semantico.textoPrimario,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <Avatar
                  nome={card.nome}
                  fotoUrl={card.fotoUrl}
                  timeSigla={card.timeSigla}
                  nivelApito={null}
                  tamanho={40}
                />
                <strong>{card.nome}</strong>
              </Link>
              <p
                style={{ ...ROTULO, margin: '8px 0' }}
              >{`${identidadeDoTime(card.timeSigla).nome} · ${ATRIBUTO_ROTULO[card.atributo]}`}</p>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: 0 }}>
                <div>
                  <dt style={ROTULO}>Alvo registrado · 1º quarto</dt>
                  <dd style={{ margin: '4px 0 0' }}>
                    {card.alvo === null
                      ? 'Sem alvo registrado'
                      : `${card.alvo}+ ${ATRIBUTO_UNIDADE[card.atributo]}`}
                  </dd>
                </div>
                <div>
                  <dt style={ROTULO}>Realizado · 1º quarto</dt>
                  <dd style={{ margin: '4px 0 0' }}>
                    {card.estado === 'DNP'
                      ? 'DNP · neutro'
                      : card.estado === 'PENDENTE'
                        ? 'Aguardando fechamento ou dado oficial'
                        : `${card.valor} ${ATRIBUTO_UNIDADE[card.atributo]}`}
                  </dd>
                </div>
              </dl>
              {card.bateu !== null && (
                <p
                  style={{
                    marginBottom: 0,
                    fontSize: 13,
                    color: card.bateu ? componente.conferido.bateu : semantico.textoSecundario,
                  }}
                >
                  {card.bateu ? 'Alvo atingido' : 'Alvo não atingido'}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
