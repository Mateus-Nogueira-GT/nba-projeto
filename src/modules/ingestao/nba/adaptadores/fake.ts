import type {
  EscalacaoExterna,
  FonteNBA,
  JogadorExterno,
  JogoExterno,
  LinhaBoxScore,
  TimeExterno,
} from '../porta'

export type Fixture = {
  times?: TimeExterno[]
  jogadores?: JogadorExterno[]
  jogos?: JogoExterno[]
  boxScore?: LinhaBoxScore[]
  escalacao?: EscalacaoExterna[]
}

/**
 * Fonte falsa baseada em fixture — para teste e desenvolvimento local.
 *
 * Não é mock de biblioteca: é uma implementação de verdade da porta, com dados
 * fixos. Pode ser configurada para falhar ou demorar, que é como o failover
 * é exercitado sem depender de rede.
 */
export class FonteFake implements FonteNBA {
  readonly nome: string
  chamadas = 0

  constructor(
    nome: string,
    private readonly fixture: Fixture = {},
    private readonly comportamento: {
      falhaCom?: Error
      atrasoMs?: number
    } = {},
  ) {
    this.nome = nome
  }

  private async responder<T>(valor: T): Promise<T> {
    this.chamadas += 1
    if (this.comportamento.atrasoMs) {
      await new Promise((r) => setTimeout(r, this.comportamento.atrasoMs))
    }
    if (this.comportamento.falhaCom) throw this.comportamento.falhaCom
    return valor
  }

  listarTimes() {
    return this.responder(this.fixture.times ?? [])
  }
  listarJogadores() {
    return this.responder(this.fixture.jogadores ?? [])
  }
  listarJogos(_dataIso: string) {
    return this.responder(this.fixture.jogos ?? [])
  }
  boxScore(_jogoIdExterno: string) {
    return this.responder(this.fixture.boxScore ?? [])
  }
  escalacao(_jogoIdExterno: string) {
    return this.responder(this.fixture.escalacao ?? [])
  }
}
