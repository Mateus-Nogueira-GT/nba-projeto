import type {
  EscalacaoExterna,
  FonteNBA,
  JogadorExterno,
  JogoExterno,
  LinhaBoxScore,
  LinhaBoxScoreTimeExterna,
  LinhaClassificacaoExterna,
  TimeExterno,
} from './porta'

export type EventoSaude = {
  provedor: string
  tipo: 'NBA_PRIMARIO' | 'NBA_RESERVA'
  ok: boolean
  latenciaMs: number
  erro: string | null
  em: Date
}

export type OpcoesFailover = {
  /** Acima disso o principal é considerado atrasado e o reserva assume. */
  timeoutMs: number
  /** Recebe o batimento de cada tentativa. É o que alimenta saude_provedor. */
  aoBater?: (evento: EventoSaude) => void
  /** Injetado para não depender de relógio global em teste. */
  agora?: () => number
}

/**
 * Fonte com failover automático.
 *
 * O chamador não sabe qual provedor respondeu — recebe dado canônico e pronto.
 * Falha OU atraso do principal fazem o reserva assumir; só quando os dois
 * falham é que o erro sobe.
 *
 * Cada tentativa emite batimento, inclusive as que falham: é assim que o
 * "alerta de dado parado" enxerga um provedor degradado antes do usuário.
 */
export class FonteComFailover implements FonteNBA {
  readonly nome = 'failover'

  constructor(
    private readonly principal: FonteNBA,
    private readonly reserva: FonteNBA,
    private readonly opcoes: OpcoesFailover,
  ) {}

  private get agora() {
    return this.opcoes.agora ?? (() => Date.now())
  }

  private async comTimeout<T>(promessa: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined

    try {
      return await Promise.race([
        promessa,
        new Promise<never>((_, rejeitar) => {
          timer = setTimeout(
            () => rejeitar(new Error(`tempo esgotado após ${this.opcoes.timeoutMs}ms`)),
            this.opcoes.timeoutMs,
          )
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async tentar<T>(
    fonte: FonteNBA,
    tipo: EventoSaude['tipo'],
    operacao: (f: FonteNBA) => Promise<T>,
  ): Promise<{ ok: true; valor: T } | { ok: false; erro: Error }> {
    const inicio = this.agora()

    try {
      const valor = await this.comTimeout(operacao(fonte))
      this.opcoes.aoBater?.({
        provedor: fonte.nome,
        tipo,
        ok: true,
        latenciaMs: this.agora() - inicio,
        erro: null,
        em: new Date(this.agora()),
      })
      return { ok: true, valor }
    } catch (e) {
      const erro = e instanceof Error ? e : new Error(String(e))
      this.opcoes.aoBater?.({
        provedor: fonte.nome,
        tipo,
        ok: false,
        latenciaMs: this.agora() - inicio,
        erro: erro.message,
        em: new Date(this.agora()),
      })
      return { ok: false, erro }
    }
  }

  private async executar<T>(operacao: (f: FonteNBA) => Promise<T>): Promise<T> {
    const primeira = await this.tentar(this.principal, 'NBA_PRIMARIO', operacao)
    if (primeira.ok) return primeira.valor

    const segunda = await this.tentar(this.reserva, 'NBA_RESERVA', operacao)
    if (segunda.ok) return segunda.valor

    throw new Error(
      `as duas fontes NBA falharam — ${this.principal.nome}: ${primeira.erro.message} · ` +
        `${this.reserva.nome}: ${segunda.erro.message}`,
    )
  }

  listarTimes(): Promise<TimeExterno[]> {
    return this.executar((f) => f.listarTimes())
  }
  listarJogadores(): Promise<JogadorExterno[]> {
    return this.executar((f) => f.listarJogadores())
  }
  listarJogos(dataIso: string): Promise<JogoExterno[]> {
    return this.executar((f) => f.listarJogos(dataIso))
  }
  boxScore(jogoIdExterno: string): Promise<LinhaBoxScore[]> {
    return this.executar((f) => f.boxScore(jogoIdExterno))
  }
  boxScoreDoTime(jogoIdExterno: string): Promise<LinhaBoxScoreTimeExterna[]> {
    return this.executar((f) => f.boxScoreDoTime(jogoIdExterno))
  }
  escalacao(jogoIdExterno: string): Promise<EscalacaoExterna[]> {
    return this.executar((f) => f.escalacao(jogoIdExterno))
  }
  classificacao(temporada: string): Promise<LinhaClassificacaoExterna[]> {
    return this.executar((f) => f.classificacao(temporada))
  }
}
