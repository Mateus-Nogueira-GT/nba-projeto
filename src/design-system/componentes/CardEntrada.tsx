import type { Atributo, Nivel, NivelApito } from '../../modules/motor/tipos'
import { componente } from '../tokens/componente'
import { MODO_FIRE, NIVEL_JOGADOR, TURBO } from '../tokens/css'
import { Anel } from './Anel'
import { Historico } from './Historico'
import { Selo } from './Selo'

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'PTS',
  REBOTES: 'REB',
  ASSISTENCIAS: 'AST',
}

export type CardEntradaProps = {
  nome: string
  fotoUrl?: string | null
  timeSigla: string
  timeNome: string
  posicao: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: NivelApito
  /** Nota de confiança. Nunca "probabilidade". */
  confianca: number | null
  turbo?: boolean
  modoFire?: boolean
  /** Últimas partidas: true = bateu a linha. Mais recente primeiro. */
  historico?: boolean[]
  /** Faixa de odd entre casas. Nunca valor único. */
  odd?: { min: number; max: number; casas: number } | null
  /** Nível de origem quando o jogador já vinha apitado em OPD pré-live. */
  opdOrigemNivel?: NivelApito | null
  /** Alvo do 1º quarto, no Fire Live. */
  alvo1Q?: number | null
}

function formatarOdd(v: number): string {
  return v.toFixed(2).replace('.', ',')
}

/**
 * Card de entrada.
 *
 * DOIS canais visuais, e só dois:
 *   borda metálica = nível do jogador  (+ rótulo textual, redundância obrigatória)
 *   anel colorido  = nível do apito    (+ número do nível, redundância obrigatória)
 *
 * Turbo e modo fire nunca comunicam só por cor ou movimento: os dois carregam
 * ícone e rótulo escrito.
 */
export function CardEntrada(props: CardEntradaProps) {
  const nivel = NIVEL_JOGADOR[props.nivelJogador]
  const turbo = props.turbo ?? false
  const modoFire = props.modoFire ?? false

  return (
    <article
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        background: componente.cardFundo,
        color: componente.cardTexto,
        // Canal 1 — a borda metálica é o nível do jogador.
        border: `${componente.cardBordaLargura} solid ${nivel.cor}`,
        // Modo fire arde ao redor do card; o rótulo abaixo é que informa.
        boxShadow: modoFire ? `0 0 16px 2px ${MODO_FIRE.cor}66` : undefined,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          flexShrink: 0,
          background: componente.marcadorOpdFundo,
          backgroundImage: props.fotoUrl ? `url(${props.fotoUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 16, lineHeight: 1.2 }}>{props.nome}</strong>
          {/* Redundância do canal 1: o nível também vem escrito. */}
          <span style={{ fontSize: 11, fontWeight: 600, color: nivel.cor, letterSpacing: 0.4 }}>
            {nivel.rotulo}
          </span>
        </div>

        <div style={{ fontSize: 12, color: componente.cardTextoApoio }}>
          {props.timeSigla} · {props.timeNome}
          {props.posicao ? ` · ${props.posicao}` : ''} · {ATRIBUTO_ROTULO[props.atributo]}
          {props.alvo1Q !== null && props.alvo1Q !== undefined
            ? ` · alvo 1º quarto: ${props.alvo1Q}`
            : ''}
        </div>

        {props.historico && props.historico.length > 0 && (
          <Historico jogos={props.historico} />
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {turbo && <Selo icone="⚡" rotulo="TURBO" cor={TURBO.cor} />}
          {modoFire && <Selo icone="🔥" rotulo="MODO FIRE" cor={MODO_FIRE.cor} />}
          {props.opdOrigemNivel != null && (
            <Selo icone="↗" rotulo={`OPD nível ${props.opdOrigemNivel}`} />
          )}
        </div>

        {props.odd && (
          // Odd é SEMPRE faixa, nunca valor único: varia por casa e por minuto.
          <div style={{ fontSize: 12, color: componente.oddTexto }}>
            Odd entre casas: {formatarOdd(props.odd.min)} – {formatarOdd(props.odd.max)}{' '}
            <span style={{ opacity: 0.7 }}>
              · média de {props.odd.casas} casa{props.odd.casas === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      <Anel nivelApito={props.nivelApito} confianca={props.confianca} turbo={turbo} />
    </article>
  )
}
