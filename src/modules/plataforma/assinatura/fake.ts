import type {
  AssinaturaExterna,
  AvisoPagamento,
  CobrancaExterna,
  EventoPagamento,
  PedidoCriacaoAssinatura,
  PortaCobranca,
} from './porta'

/** Porta falsa para teste — implementação real da interface, sem rede. */
export class PagamentoFake implements PortaCobranca {
  readonly nome = 'fake'
  readonly criacoes: PedidoCriacaoAssinatura[] = []
  readonly assinaturas = new Map<string, AssinaturaExterna>()
  readonly cobrancas = new Map<string, CobrancaExterna[]>()

  constructor(
    private readonly assinaturaValida = true,
    private readonly aoCriar?: (pedido: PedidoCriacaoAssinatura) => Promise<AssinaturaExterna>,
  ) {}

  verificarAssinatura(_aviso: AvisoPagamento): boolean {
    return this.assinaturaValida
  }

  async interpretarNotificacao(
    corpo: unknown,
    _aviso: AvisoPagamento,
  ): Promise<EventoPagamento | null> {
    return corpo as EventoPagamento
  }

  async criarAssinatura(pedido: PedidoCriacaoAssinatura): Promise<AssinaturaExterna> {
    this.criacoes.push(pedido)
    const assinatura = this.aoCriar
      ? await this.aoCriar(pedido)
      : {
          id: `fake-${pedido.referenciaExterna}`,
          referenciaExterna: pedido.referenciaExterna,
          status: 'pending',
          nomePlano: pedido.nomePlano,
          urlCheckout: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=fake-${pedido.referenciaExterna}`,
          proximaCobranca: null,
          ocorridoEm: null,
        }
    this.assinaturas.set(assinatura.id, assinatura)
    return assinatura
  }

  async consultarAssinatura(id: string): Promise<AssinaturaExterna> {
    const assinatura = this.assinaturas.get(id)
    if (!assinatura) throw new Error('assinatura fake não encontrada')
    return assinatura
  }

  async buscarPorReferencia(referenciaExterna: string): Promise<AssinaturaExterna | null> {
    return (
      [...this.assinaturas.values()].find(
        (assinatura) => assinatura.referenciaExterna === referenciaExterna,
      ) ?? null
    )
  }

  async cancelarAssinatura(id: string, _chaveIdempotencia: string): Promise<AssinaturaExterna> {
    const atual = await this.consultarAssinatura(id)
    const cancelada = { ...atual, status: 'canceled', ocorridoEm: new Date().toISOString() }
    this.assinaturas.set(id, cancelada)
    return cancelada
  }

  async listarCobrancasDaAssinatura(id: string): Promise<CobrancaExterna[]> {
    return this.cobrancas.get(id) ?? []
  }
}
