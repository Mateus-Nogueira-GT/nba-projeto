import type { Atributo, Nivel, NivelApito } from '../../modules/motor/tipos'
import { componente } from '../tokens/componente'
import { CONFIANCA_GRAU, MODO_FIRE, NIVEL_JOGADOR, TURBO } from '../tokens/css'
import { semantico } from '../tokens/semantico'
import { Avatar } from './Avatar'
import { Pilula } from './Pilula'
import { Selo } from './Selo'

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'PONTOS',
  REBOTES: 'REBOTES',
  ASSISTENCIAS: 'ASSISTÊNCIAS',
}
const ATRIBUTO_CURTO: Record<Atributo, string> = { PONTOS: 'PTS', REBOTES: 'REB', ASSISTENCIAS: 'AST' }

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
  timeNome: string
  posicao: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: NivelApito
  /** Nota de confiança. Nunca "probabilidade". */
  confianca: number | null
  /** Grau visual (1..5) calculado por faixaDaConfianca na TELA. */
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
}

/**
 * Card de entrada — identidade 02.
 *
 * QUATRO sinais, QUATRO formas distintas, cada um com redundância escrita:
 *   faixa metálica curta no topo = nível do JOGADOR   (+ rótulo na linha de apoio)
 *   anel do avatar               = nível do APITO      (+ numeral N{n}/T)
 *   pílula de contorno           = faixa de CONFIANÇA  (+ número dentro)
 *   brilho ao redor do card      = SÓ no grau máximo de confiança (grau 5)
 *
 * Turbo e modo fire nunca comunicam só por cor ou brilho: os dois carregam
 * selo com ícone e rótulo escrito.
 */
export function CardEntrada(props: CardEntradaProps) {
  const nivel = NIVEL_JOGADOR[props.nivelJogador]
  const grau = props.grauConfianca
  const corPilula = grau === null ? semantico.divisor : CONFIANCA_GRAU[grau]
  const brilha = grau === 5 // regra DO MOCKUP: só a faixa máxima brilha
  const rotuloLinha =
    props.linha != null
      ? `${ATRIBUTO_ROTULO[props.atributo]} ${props.linha}+`
      : props.alvo1Q != null
        ? `${ATRIBUTO_ROTULO[props.atributo]} · ALVO 1Q ${props.alvo1Q}`
        : ATRIBUTO_ROTULO[props.atributo]
  const p = props.progresso1Q
  const faltam = p ? Math.max(0, p.alvo - p.observado) : 0

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
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 14,
          borderRadius: 14,
          background: componente.cardFundo,
          color: componente.cardTexto,
          border: `1px solid ${brilha ? corPilula : semantico.divisor}`,
          boxShadow: brilha ? `0 0 16px 1px ${corPilula}55` : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                  fontSize: 18,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {props.jogadorHref ? (
                  <a
                    href={props.jogadorHref}
                    style={{ color: 'inherit', textUnderlineOffset: 3 }}
                  >
                    {props.nome}
                  </a>
                ) : (
                  props.nome
                )}
              </strong>
              {props.vivo && <Pilula texto="VIVO" cor={semantico.aoVivo} />}
            </div>
            <div
              style={{
                fontFamily: semantico.fonteRotulo,
                fontSize: 12,
                letterSpacing: 1,
                color: componente.cardTextoApoio,
                textTransform: 'uppercase',
              }}
            >
              {rotuloLinha} · {nivel.rotulo} · N{props.nivelApito}
              {props.posicao ? ` · ${props.posicao}` : ''} · {props.timeSigla}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {props.turbo && <Selo icone="⚡" rotulo="TURBO" cor={TURBO.cor} />}
              {props.modoFire && <Selo icone="🔥" rotulo="MODO FIRE" cor={MODO_FIRE.cor} />}
              {props.opdOrigemNivel != null && (
                <Selo icone="↗" rotulo={`OPD nível ${props.opdOrigemNivel}`} />
              )}
            </div>
          </div>
          <Pilula
            texto={props.confianca === null ? '—' : `${Math.round(props.confianca)}%`}
            cor={corPilula}
            brilho={brilha}
          />
        </div>

        {p && (
          <div>
            <div
              aria-hidden
              style={{
                height: 5,
                borderRadius: 3,
                background: semantico.superficieElevada,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (p.observado / Math.max(1, p.alvo)) * 100)}%`,
                  height: '100%',
                  background: corPilula,
                }}
              />
            </div>
            <div
              style={{
                fontFamily: semantico.fonteRotulo,
                fontSize: 11,
                letterSpacing: 1,
                marginTop: 4,
                color: componente.cardTextoApoio,
              }}
            >
              {p.observado >= p.alvo
                ? `LINHA BATIDA · ${p.observado} ${ATRIBUTO_CURTO[props.atributo]}`
                : `FALTA ${faltam} ${ATRIBUTO_CURTO[props.atributo]}`}
            </div>
          </div>
        )}
      </article>
    </div>
  )
}
