import type { EventoPagamento, PortaPagamento } from './porta'

/** Porta falsa para teste — implementação real da interface, sem rede. */
export class PagamentoFake implements PortaPagamento {
  readonly nome = 'fake'

  constructor(private readonly assinaturaValida = true) {}

  verificarAssinatura(): boolean {
    return this.assinaturaValida
  }

  async interpretarNotificacao(corpo: unknown): Promise<EventoPagamento | null> {
    return corpo as EventoPagamento
  }
}
