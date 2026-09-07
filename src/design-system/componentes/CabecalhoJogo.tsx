import type { CSSProperties } from 'react'

import type { StatusJogo } from '../../modules/entrega/lista-por-jogo'
import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

export type CabecalhoJogoProps = {
  casaSigla: string
  visitanteSigla: string
  /** Instante do jogo em UTC; a tela diz em que fuso quer ler. */
  horarioUtc: Date
  fuso: string
  status: StatusJogo
  /** Quarto em andamento quando AO_VIVO. Ausente, assume-se o 1º. */
  quartoAtual?: number | null
  placarCasa?: number | null
  placarVisitante?: number | null
  /**
   * Frio (Lista Secreta, Resultados): uma linha, siglas à esquerda e o
   * horário/status à direita. Quente (Fire Live): bloco no gradiente quente
   * com o placar entre as siglas — e MUDO, mais apagado, enquanto o jogo não
   * começou.
   */
  temperatura?: 'frio' | 'quente'
}

/** 19:30 — sempre no fuso pedido; o servidor da Vercel roda em UTC. */
const horaCurta = (quando: Date, fuso: string) =>
  quando.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })

const ROTULO: CSSProperties = {
  fontFamily: semantico.fonteRotulo,
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  fontWeight: 700,
}

/**
 * CABEÇALHO DE JOGO — a ÚNICA fronteira de seção da varredura (spec 04, §4.1).
 *
 * "MIA @ IND": visitante @ mandante, como a transmissão anuncia. Sigla em
 * Anton no lugar do escudo (marca registrada, produto pago — spec §5.3). O
 * status ao vivo é ponto + texto, e o ponto NÃO pulsa: na 04 nada se anima
 * continuamente (§4.2) — só a chegada de apito novo.
 */
export function CabecalhoJogo(props: CabecalhoJogoProps) {
  const quente = props.temperatura === 'quente'
  const hora = horaCurta(props.horarioUtc, props.fuso)
  const quarto = props.quartoAtual ?? 1
  const temPlacar = props.placarCasa != null && props.placarVisitante != null

  const sigla = (texto: string) => (
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
  )

  const statusAoVivo = (
    <span
      style={{
        ...ROTULO,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: semantico.aoVivo,
      }}
    >
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
      {quarto}º Q · AO VIVO
    </span>
  )
  const statusEncerrado = <span style={{ ...ROTULO, color: semantico.texto55 }}>ENCERRADO</span>

  if (!quente) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          margin: '22px 0 10px',
          padding: '0 2px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {sigla(props.visitanteSigla)}
          <span
            style={{
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              letterSpacing: 1,
              color: semantico.texto40,
            }}
          >
            @
          </span>
          {sigla(props.casaSigla)}
        </div>
        {props.status === 'AGENDADO' ? (
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
            {hora}
          </span>
        ) : props.status === 'AO_VIVO' ? (
          statusAoVivo
        ) : (
          statusEncerrado
        )}
      </div>
    )
  }

  // Quente: o jogo que ainda não começou é MUDO — sem gradiente, mais apagado,
  // com o horário onde o placar vai entrar. O Fire Live mostra que há alvos
  // esperando sem competir com o jogo que está rolando.
  const mudo = props.status === 'AGENDADO'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        margin: '22px 0 10px',
        padding: '10px 14px',
        borderRadius: 12,
        border: `1px solid ${mudo ? componente.cabecalhoJogo.bordaFria : componente.cabecalhoJogo.bordaQuente}`,
        background: mudo ? 'transparent' : componente.cabecalhoJogo.fundoQuente,
        opacity: mudo ? 0.7 : undefined,
      }}
    >
      {sigla(props.visitanteSigla)}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        {mudo ? (
          <>
            <span
              style={{
                fontFamily: semantico.fonteTitulo,
                fontSize: 16,
                letterSpacing: 0.5,
                color: semantico.texto70,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {hora}
            </span>
            <span style={{ ...ROTULO, color: semantico.textoSecundario }}>AGUARDANDO O 1º Q</span>
          </>
        ) : (
          <>
            <span
              style={{
                fontFamily: semantico.fonteTitulo,
                fontSize: 24,
                letterSpacing: 2,
                color: semantico.texto100,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {temPlacar ? `${props.placarVisitante} · ${props.placarCasa}` : '—'}
            </span>
            {props.status === 'AO_VIVO' ? statusAoVivo : statusEncerrado}
          </>
        )}
      </div>
      {sigla(props.casaSigla)}
    </div>
  )
}
