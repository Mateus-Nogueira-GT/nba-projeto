import type { Atributo, Nivel, NivelApito } from '../../modules/motor/tipos'
import { componente } from '../tokens/componente'
import { CONFIANCA_GRAU, MODO_FIRE, NIVEL_JOGADOR, TURBO } from '../tokens/css'
import { semantico } from '../tokens/semantico'
import { Avatar } from './Avatar'
import { BarraAlvo } from './BarraAlvo'
import { Barrinhas } from './Barrinhas'
import { Pilula } from './Pilula'
import { Selo } from './Selo'

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'PONTOS',
  REBOTES: 'REBOTES',
  ASSISTENCIAS: 'ASSISTÊNCIAS',
}
const ATRIBUTO_CURTO: Record<Atributo, string> = { PONTOS: 'PTS', REBOTES: 'REB', ASSISTENCIAS: 'AST' }

const decimalPtBr = (n: number, casas: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

export type CardEntradaProps = {
  nome: string
  /**
   * Destino da tela de estatísticas do jogador.
   *
   * É o SEGUNDO caminho de entrada da aba (docs/00-visao.md): pelo menu, ou
   * pelo nome do jogador dentro de qualquer card. Opcional porque o card é
   * usado também na galeria do design system, onde não há rota para navegar.
   */
  jogadorHref?: string | null
  fotoUrl?: string | null
  timeSigla: string
  /**
   * Sigla do time ADVERSÁRIO, quando a tela sabe contra quem é o jogo.
   *
   * Opcional de propósito: a Lista Secreta agrupa por jogador e não carrega o
   * confronto; o Fire Live carrega. Ausente, a linha de apoio simplesmente
   * não fala em confronto — melhor que um "vs —" que não informa nada.
   */
  adversarioSigla?: string | null
  posicao: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: NivelApito
  /** Nota de confiança. Nunca "probabilidade". */
  confianca: number | null
  /** Grau visual (1..5), materializado no item do feed. */
  grauConfianca: 1 | 2 | 3 | 4 | 5 | null
  turbo?: boolean
  modoFire?: boolean
  /** Nível de origem quando o jogador já vinha apitado em OPD pré-live. */
  opdOrigemNivel?: NivelApito | null
  /** Linha do apito. Exibida SEMPRE inteira, com sufixo "+" — nunca meio ponto. */
  linha?: number | null
  /** Alvo do 1º quarto, no Fire Live. */
  alvo1Q?: number | null
  /** Selo VIVO — fire live em andamento. */
  vivo?: boolean
  /** Progresso observado no 1º quarto, contra o alvo. */
  progresso1Q?: { observado: number; alvo: number } | null
  /** Últimos 5 conferidos contra a linha — as barrinhas da zona 2 (pré-live). */
  ultimos5?: { valor: number; bateu: boolean }[]
  /** Média da temporada, do item do feed — o rodapé mostra sem chamar o motor. */
  mediaTemporada?: number | null
  /** Faixa de odds entre casas; com `media`, o rodapé escreve ODD MÉDIA. */
  oddFaixa?: { min: number; max: number; qtdCasas: number; media?: number } | null
  /**
   * Temperatura do contexto. O Fire Live INTEIRO é quente — não só o modo
   * fire: urgência é da tela ao vivo, não do estado do jogador. Pré-live
   * nunca passa 'quente'; o teste transversal vigia.
   */
  temperatura?: 'frio' | 'quente'
  /**
   * Análise gerada por LLM a partir dos fatos do card. Ausente é o caso
   * NORMAL — sem chave, LLM fora ou texto reprovado pelo validador. Ausência
   * não abre espaço: um bloco vazio anunciaria defeito onde há degradação
   * prevista.
   */
  narrativa?: string | null
}

/**
 * Card de entrada — identidade 03 "broadcast", em TRÊS zonas:
 *   1 · cabeçalho — avatar (anel = nível do APITO), nome, apoio, % grande
 *   2 · contexto  — barrinhas (pré-live) OU barra rumo ao alvo (fire live)
 *   3 · rodapé    — faixa translúcida com linha · média · odd
 *
 * Os canais da identidade continuam os de sempre:
 *   faixa metálica curta = nível do JOGADOR (+ rótulo escrito)
 *   anel do avatar       = nível do APITO   (+ numeral N{n}/T)
 *   borda lateral 3px    = grau de CONFIANÇA (+ % escrito na mesma cor)
 *
 * Três brilhos, três donos, nunca o único sinal:
 *   grau 5 de confiança → brilho do card na cor do grau
 *   turbo               → turboBrilho (+ selo ⚡ TURBO escrito)
 *   modo fire           → brilho do universo quente (+ selo 🔥 MODO FIRE)
 *
 * Temperatura por contexto: pré-live veste contextoFrio; modo fire, o quente.
 */
export function CardEntrada(props: CardEntradaProps) {
  const nivel = NIVEL_JOGADOR[props.nivelJogador]
  const grau = props.grauConfianca
  const corGrau = grau === null ? semantico.divisor : CONFIANCA_GRAU[grau]
  const brilhaConfianca = grau === 5 // regra da identidade: só o máximo brilha
  // A pele vem SÓ da temperatura (da TELA). modoFire é estado do jogador:
  // rende selo e brilho, nunca troca a pele — um item pré-live em modo fire
  // continua mostrando barrinhas, média e odd (errata 25/08).
  const quente = props.temperatura === 'quente'
  const contexto = quente ? componente.contextoQuente : componente.contextoFrio
  const brilhoDoCard = brilhaConfianca
    ? `0 0 16px 1px ${corGrau}55`
    : props.turbo
      ? componente.turboBrilho
      : quente || props.modoFire
        ? componente.contextoQuente.brilho
        : undefined
  const corPercentual = props.turbo ? TURBO.cor : corGrau

  const rotuloLinha =
    props.linha != null
      ? `${ATRIBUTO_ROTULO[props.atributo]} ${props.linha}+`
      : props.alvo1Q != null
        ? `ALVO 1Q · ${props.alvo1Q} ${ATRIBUTO_CURTO[props.atributo]}`
        : ATRIBUTO_ROTULO[props.atributo]
  const p = props.progresso1Q
  const faltam = p ? Math.max(0, p.alvo - p.observado) : 0

  const rodapeDireita = quente
    ? p
      ? p.observado >= p.alvo
        ? `LINHA BATIDA · ${p.observado} ${ATRIBUTO_CURTO[props.atributo]}`
        : `FALTA ${faltam} ${ATRIBUTO_CURTO[props.atributo]}`
      : null
    : [
        props.mediaTemporada != null ? `MÉDIA ${decimalPtBr(props.mediaTemporada, 1)}` : null,
        props.oddFaixa != null
          ? props.oddFaixa.media != null
            ? `ODD MÉDIA ${decimalPtBr(props.oddFaixa.media, 2)}`
            : `ODD ${decimalPtBr(props.oddFaixa.min, 2)}–${decimalPtBr(props.oddFaixa.max, 2)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || null

  const barrinhas = !quente && (props.ultimos5?.length ?? 0) > 0

  return (
    <div>
      {/* faixa metálica CURTA = nível do jogador */}
      <div
        aria-hidden
        style={{
          width: 56,
          height: componente.faixaNivelAltura,
          borderRadius: 2,
          background: nivel.cor,
          marginBottom: 4,
        }}
      />
      <article
        style={{
          borderRadius: componente.cardRaio,
          background: contexto.cardGradiente,
          color: componente.cardTexto,
          border: `1px solid ${contexto.borda}`,
          borderLeft: `${componente.cardBordaLateral} solid ${corGrau}`,
          boxShadow: brilhoDoCard,
          overflow: 'hidden',
        }}
      >
        {/* zona 1 · cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px 8px' }}>
          <Avatar
            nome={props.nome}
            fotoUrl={props.fotoUrl ?? null}
            timeSigla={props.timeSigla}
            nivelApito={props.nivelApito}
            turbo={props.turbo}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong
                style={{
                  fontFamily: semantico.fonteTitulo,
                  fontSize: 17,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                {props.jogadorHref ? (
                  <a href={props.jogadorHref} style={{ color: 'inherit', textUnderlineOffset: 3 }}>
                    {props.nome}
                  </a>
                ) : (
                  props.nome
                )}
              </strong>
              {props.vivo && <Pilula texto="VIVO" cor={semantico.vivoSelo} />}
            </div>
            <div
              style={{
                fontFamily: semantico.fonteRotulo,
                fontSize: 12,
                letterSpacing: 1.2,
                color: componente.cardTextoApoio,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {nivel.rotulo} · N{props.nivelApito}
              {props.posicao ? ` · ${props.posicao}` : ''} · {props.timeSigla}
              {props.adversarioSigla ? ` · vs ${props.adversarioSigla}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {props.turbo && <Selo icone="⚡" rotulo="TURBO" cor={TURBO.cor} />}
              {props.modoFire && <Selo icone="🔥" rotulo="MODO FIRE" cor={MODO_FIRE.cor} />}
              {props.opdOrigemNivel != null && (
                <Selo icone="↗" rotulo={`OPD nível ${props.opdOrigemNivel}`} />
              )}
            </div>
          </div>
          <span
            style={{
              fontFamily: semantico.fonteTitulo,
              fontSize: 30,
              letterSpacing: 0.5,
              color: corPercentual,
              fontVariantNumeric: 'tabular-nums',
              textShadow: brilhaConfianca ? `0 0 18px ${corGrau}73` : undefined,
            }}
          >
            {props.confianca === null ? '—' : `${Math.round(props.confianca)}%`}
          </span>
        </div>

        {/* zona 2 · contexto — barrinhas no pré-live, barra rumo ao alvo no fire */}
        {quente && p && (
          <div style={{ padding: '0 14px 12px' }}>
            <BarraAlvo observado={p.observado} alvo={p.alvo} />
          </div>
        )}
        {barrinhas && (
          <div style={{ padding: '0 14px 10px' }}>
            <Barrinhas jogos={props.ultimos5!} rotulo="ÚLT. 5 NA LINHA" />
          </div>
        )}

        {props.narrativa ? (
          <p
            style={{
              margin: '0 14px 10px',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: semantico.textoSecundario,
              fontStyle: 'italic',
            }}
          >
            {props.narrativa}
          </p>
        ) : null}

        {/* zona 3 · rodapé — faixa translúcida na temperatura do contexto */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '8px 14px',
            background: contexto.faixaFundo,
            borderTop: `1px solid ${contexto.borda}`,
            fontFamily: semantico.fonteRotulo,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: componente.cardTexto }}>
            {rotuloLinha}
          </span>
          {rodapeDireita && (
            <span style={{ fontSize: 12, color: componente.cardTextoApoio }}>{rodapeDireita}</span>
          )}
        </div>
      </article>
    </div>
  )
}
