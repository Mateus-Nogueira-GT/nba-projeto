import type { CSSProperties } from 'react'

import type { StatusJogo } from '../../modules/entrega/lista-por-jogo'
import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'
import { IdentidadeTime } from './IdentidadeTime'
import { QuadraAoVivo } from './QuadraAoVivo'

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
  /** Fire Live congelado: os placares recebidos são do Q1, não do jogo inteiro. */
  primeiroQuartoEncerrado?: boolean
  /**
   * Pontos por quarto de cada lado — a quebra do jogo ENCERRADO (identidade
   * 04, §4.4). Opcionais: sem elas o cabeçalho é exatamente o de antes, e a
   * Lista Secreta e o Fire Live não passam nenhuma. Só saem com o jogo
   * encerrado: no jogo em andamento a linha `49 · 0 · 0 · 0` afirmaria que os
   * três quartos que ainda não foram jogados terminaram em zero.
   */
  quartosCasa?: number[]
  quartosVisitante?: number[]
  /**
   * Frio (Lista Secreta, Resultados): nomes e logos à esquerda e o
   * horário/status à direita. Quente (Fire Live): bloco no gradiente quente
   * com o placar entre os times — e MUDO, mais apagado, enquanto o jogo não
   * começou.
   */
  temperatura?: 'frio' | 'quente'
  /** Visão ilustrativa do confronto; não representa posse ou posições ao vivo. */
  mostrarQuadra?: boolean
  /**
   * `summary` transforma o cabeçalho no GATILHO de um `<details>` — é assim que
   * a Lista Secreta colapsa a seção de cada jogo (identidade 05). Ele ganha o
   * chevron e some o marcador nativo do navegador; o padrão `div` é o de
   * sempre, para as telas que não colapsam nada.
   *
   * Só o universo FRIO aceita: o Fire Live mostra um jogo por vez, não há
   * seção a fechar.
   */
  raiz?: 'div' | 'summary'
}

/** 19:30 — sempre no fuso pedido; o servidor da Vercel roda em UTC. */
const horaCurta = (quando: Date, fuso: string) =>
  quando.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })

const ROTULO: CSSProperties = {
  fontFamily: semantico.fonteRotulo,
  // 12 é o piso do manual; abaixo dele o rótulo some no celular.
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontWeight: 700,
}

/** Visitante à esquerda e mandante à direita, com identidade e status por escrito. */
export function CabecalhoJogo(props: CabecalhoJogoProps) {
  const quente = props.temperatura === 'quente'
  const hora = horaCurta(props.horarioUtc, props.fuso)
  const quarto = props.quartoAtual ?? 1
  const temPlacar = props.placarCasa != null && props.placarVisitante != null

  const time = (sigla: string, destaque = false) => (
    <IdentidadeTime
      sigla={sigla}
      tamanhoLogo={destaque ? 44 : 28}
      disposicao={destaque ? 'coluna' : 'linha'}
      alinhamento={destaque ? 'centro' : 'inicio'}
      style={{
        fontSize: destaque ? 16 : 14,
        color: semantico.texto100,
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    />
  )

  /** Um lado do placar final. `color` fecha o estilo: é o canal do vencedor. */
  const pontos = (feitos: number, vencedor: boolean) => (
    <span
      style={{
        fontFamily: semantico.fonteTitulo,
        fontSize: 22,
        letterSpacing: 1,
        fontVariantNumeric: 'tabular-nums',
        color: vencedor ? semantico.texto100 : semantico.texto55,
      }}
    >
      {feitos}
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
    // O jogo encerrado COM placar destaca o resultado entre os times: o
    // vencedor em texto100, o perdedor em texto55 — a hierarquia é a mesma
    // que a transmissão dá, e o número escrito continua sendo a redundância
    // da cor. Sem placar, o cabeçalho é o de sempre (spec 04, §4.4).
    const encerradoComPlacar = props.status === 'ENCERRADO' && temPlacar
    const quartosVisitante = props.quartosVisitante ?? []
    const quartosCasa = props.quartosCasa ?? []
    const mostraQuartos =
      props.status === 'ENCERRADO' && quartosVisitante.length > 0 && quartosCasa.length > 0

    const Raiz = props.raiz ?? 'div'

    return (
      <Raiz
        className="jogo-frio"
        style={{
          display: 'flex',
          // `summary` traz o triângulo nativo do navegador e o cursor de texto;
          // o chevron desenhado abaixo é o indicador, igual nos dois sistemas.
          listStyle: Raiz === 'summary' ? 'none' : undefined,
          cursor: Raiz === 'summary' ? 'pointer' : undefined,
          // Com a quebra por quarto o lado direito tem DUAS linhas: alinhar
          // pela primeira deixaria o bloco pendurado abaixo do placar. É a
          // diferença entre o artboard de Resultados (center, 24px) e o da
          // Lista Secreta (baseline, 22px) — a mesma peça nas duas telas.
          alignItems: mostraQuartos ? 'center' : 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          margin: mostraQuartos ? '24px 0 10px' : '22px 0 10px',
          padding: '0 2px',
        }}
      >
        <div
          className="jogo-times-frio"
          style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
        >
          {time(props.visitanteSigla)}
          {encerradoComPlacar ? (
            <>
              {pontos(props.placarVisitante!, props.placarVisitante! >= props.placarCasa!)}
              <span
                style={{
                  fontFamily: semantico.fonteRotulo,
                  fontSize: 12,
                  letterSpacing: 1,
                  color: semantico.texto40,
                }}
              >
                ·
              </span>
              {pontos(props.placarCasa!, props.placarCasa! >= props.placarVisitante!)}
            </>
          ) : (
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
          )}
          {time(props.casaSigla)}
        </div>
        {mostraQuartos ? (
          <div
            role="img"
            aria-label={`Pontos por quarto: ${props.visitanteSigla} ${quartosVisitante.join(', ')}; ${props.casaSigla} ${quartosCasa.join(', ')}`}
            style={{
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              letterSpacing: 1,
              textTransform: 'uppercase',
              textAlign: 'right',
              lineHeight: 1.35,
              color: semantico.texto40,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <div>{quartosVisitante.join(' · ')}</div>
            <div>{quartosCasa.join(' · ')}</div>
          </div>
        ) : props.status === 'AGENDADO' ? (
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
        {Raiz === 'summary' && (
          <svg
            aria-hidden
            className="jogo-chevron"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke={semantico.textoSecundario}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        )}
      </Raiz>
    )
  }

  // Quente: o jogo que ainda não começou é MUDO — sem gradiente, mais apagado,
  // com o horário onde o placar vai entrar. O Fire Live mostra que há alvos
  // esperando sem competir com o jogo que está rolando.
  const mudo = props.status === 'AGENDADO'
  return (
    <div
      style={{
        margin: '22px 0 14px',
        padding: '16px 14px 12px',
        overflow: 'hidden',
        borderRadius: 12,
        border: `1px solid ${mudo ? componente.cabecalhoJogo.bordaFria : componente.cabecalhoJogo.bordaQuente}`,
        background: mudo ? 'transparent' : componente.cabecalhoJogo.fundoQuente,
        opacity: mudo ? 0.7 : undefined,
      }}
    >
      <div className="jogo-placar-quente">
        {time(props.visitanteSigla, true)}
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
                  fontSize: 30,
                  letterSpacing: 2,
                  color: semantico.texto100,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {temPlacar ? `${props.placarVisitante} · ${props.placarCasa}` : '—'}
              </span>
              {props.primeiroQuartoEncerrado ? (
                <span style={{ ...ROTULO, color: semantico.texto55 }}>FIM 1º Q</span>
              ) : props.status === 'AO_VIVO' ? (
                statusAoVivo
              ) : (
                statusEncerrado
              )}
            </>
          )}
        </div>
        {time(props.casaSigla, true)}
      </div>
      {props.mostrarQuadra && <QuadraAoVivo />}
    </div>
  )
}
