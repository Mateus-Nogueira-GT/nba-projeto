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
  /** Timestamp da origem, nunca substituído pelo horário da resposta. */
  dadoAtualizadoEm?: Date | null
}

export type OpcoesFailover = {
  /** Acima disso o principal é considerado atrasado e o reserva assume. */
  timeoutMs: number
  /** Recebe o batimento de cada tentativa. É o que alimenta saude_provedor. */
  aoBater?: (evento: EventoSaude) => unknown | Promise<unknown>
  /** Injetado para não depender de relógio global em teste. */
  agora?: () => number
}

export type ResultadoComOrigem<T> = {
  provedor: string
  capturadoEm: Date
  /** Null quando a API não fornece um timestamp de atualização da origem. */
  dadoAtualizadoEm: Date | null
  modo: 'SNAPSHOT' | 'DELTA'
  dados: T
}

export interface FonteNBAComOrigem extends FonteNBA {
  executarComOrigem<T>(
    operacao: (fonte: FonteNBA) => Promise<T>,
    provedorEsperado?: string,
  ): Promise<ResultadoComOrigem<T>>
}

function expoeOrigem(fonte: FonteNBA): fonte is FonteNBAComOrigem {
  return 'executarComOrigem' in fonte && typeof fonte.executarComOrigem === 'function'
}

/**
 * Executa uma operação sem perder o namespace do id externo retornado.
 *
 * `provedorEsperado` fixa a fonte quando o argumento da operação é um id que
 * ela mesma emitiu. Falhar alto é mais seguro que entregar um id do primário
 * ao reserva e persistir uma identidade incorreta.
 */
export async function consultarComOrigem<T>(
  fonte: FonteNBA,
  operacao: (fonteEfetiva: FonteNBA) => Promise<T>,
  provedorEsperado?: string,
): Promise<ResultadoComOrigem<T>> {
  if (expoeOrigem(fonte)) return fonte.executarComOrigem(operacao, provedorEsperado)
  if (provedorEsperado !== undefined && fonte.nome !== provedorEsperado) {
    throw new Error(
      `id externo pertence a ${provedorEsperado}, mas a fonte recebida é ${fonte.nome}`,
    )
  }
  return {
    provedor: fonte.nome,
    capturadoEm: new Date(),
    dadoAtualizadoEm: null,
    modo: 'SNAPSHOT',
    dados: await operacao(fonte),
  }
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
      await this.opcoes.aoBater?.({
        provedor: fonte.nome,
        tipo,
        ok: true,
        latenciaMs: this.agora() - inicio,
        erro: null,
        em: new Date(this.agora()),
        dadoAtualizadoEm: null,
      })
      return { ok: true, valor }
    } catch (e) {
      const erro = e instanceof Error ? e : new Error(String(e))
      await this.opcoes.aoBater?.({
        provedor: fonte.nome,
        tipo,
        ok: false,
        latenciaMs: this.agora() - inicio,
        erro: erro.message,
        em: new Date(this.agora()),
        dadoAtualizadoEm: null,
      })
      return { ok: false, erro }
    }
  }

  async executarComOrigem<T>(
    operacao: (f: FonteNBA) => Promise<T>,
    provedorEsperado?: string,
  ): Promise<ResultadoComOrigem<T>> {
    if (provedorEsperado !== undefined) {
      const candidatas = [this.principal, this.reserva].filter(
        (fonte) => fonte.nome === provedorEsperado,
      )
      if (candidatas.length !== 1) {
        throw new Error(`provedor esperado não é único no failover: ${provedorEsperado}`)
      }
      const fonte = candidatas[0]!
      const tipo = fonte === this.principal ? 'NBA_PRIMARIO' : 'NBA_RESERVA'
      const tentativa = await this.tentar(fonte, tipo, operacao)
      if (tentativa.ok) {
        return {
          provedor: fonte.nome,
          capturadoEm: new Date(this.agora()),
          dadoAtualizadoEm: null,
          modo: 'SNAPSHOT',
          dados: tentativa.valor,
        }
      }
      throw tentativa.erro
    }

    const primeira = await this.tentar(this.principal, 'NBA_PRIMARIO', operacao)
    if (primeira.ok) {
      return {
        provedor: this.principal.nome,
        capturadoEm: new Date(this.agora()),
        dadoAtualizadoEm: null,
        modo: 'SNAPSHOT',
        dados: primeira.valor,
      }
    }

    const segunda = await this.tentar(this.reserva, 'NBA_RESERVA', operacao)
    if (segunda.ok) {
      return {
        provedor: this.reserva.nome,
        capturadoEm: new Date(this.agora()),
        dadoAtualizadoEm: null,
        modo: 'SNAPSHOT',
        dados: segunda.valor,
      }
    }

    throw new Error(
      `as duas fontes NBA falharam — ${this.principal.nome}: ${primeira.erro.message} · ` +
        `${this.reserva.nome}: ${segunda.erro.message}`,
    )
  }

  private async executar<T>(operacao: (f: FonteNBA) => Promise<T>): Promise<T> {
    return (await this.executarComOrigem(operacao)).dados
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
