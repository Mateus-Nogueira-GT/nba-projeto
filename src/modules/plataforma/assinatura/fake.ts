import type {
  AssinaturaExterna,
  AvisoPagamento,
  CobrancaExterna,
  EventoPagamento,
  PagamentoExterno,
  PedidoCriacaoAssinatura,
  PedidoPagamentoUnico,
  PortaCobranca,
} from './porta'

/** Porta falsa para teste — implementação real da interface, sem rede. */
export class PagamentoFake implements PortaCobranca {
  readonly nome = 'fake'
  readonly criacoes: PedidoCriacaoAssinatura[] = []
  readonly assinaturas = new Map<string, AssinaturaExterna>()
  readonly cobrancas = new Map<string, CobrancaExterna[]>()
  readonly preferencias: PedidoPagamentoUnico[] = []
  readonly cancelamentos: string[] = []
  /** A chave de idempotência que cada tentativa de cancelamento recebeu, na ordem em que chegou. */
  readonly chavesDeCancelamento: string[] = []
  private readonly pagamentos = new Map<string, CobrancaExterna>()
  private readonly preferenciasPorChave = new Map<string, PagamentoExterno>()

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

  async cancelarAssinatura(id: string, chaveIdempotencia: string): Promise<AssinaturaExterna> {
    this.cancelamentos.push(id)
    this.chavesDeCancelamento.push(chaveIdempotencia)
    const atual = await this.consultarAssinatura(id)
    const cancelada = { ...atual, status: 'canceled', ocorridoEm: new Date().toISOString() }
    this.assinaturas.set(id, cancelada)
    return cancelada
  }

  async listarCobrancasDaAssinatura(id: string): Promise<CobrancaExterna[]> {
    return this.cobrancas.get(id) ?? []
  }

  async criarPagamentoUnico(pedido: PedidoPagamentoUnico): Promise<PagamentoExterno> {
    // A chave de idempotência é o contrato do provedor: repetir o POST com a
    // mesma chave devolve a MESMA preferência. O fake honra isso porque o
    // checkout conta com ele — é assim que uma tentativa retomada não abre
    // uma segunda cobrança.
    const jaCriada = this.preferenciasPorChave.get(pedido.chaveIdempotencia)
    if (jaCriada) return jaCriada
    this.preferencias.push(pedido)
    const preferencia: PagamentoExterno = {
      id: `fake-pref-${pedido.referenciaExterna}`,
      referenciaExterna: pedido.referenciaExterna,
      urlCheckout: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fake-pref-${pedido.referenciaExterna}`,
      ocorridoEm: null,
    }
    this.preferenciasPorChave.set(pedido.chaveIdempotencia, preferencia)
    return preferencia
  }

  async buscarPagamentoPorReferencia(referenciaExterna: string): Promise<CobrancaExterna | null> {
    return this.pagamentos.get(referenciaExterna) ?? null
  }

  /** Só para teste: diz que ALGUÉM pagou esta referência lá no provedor. */
  registrarPagamento(cobranca: CobrancaExterna): void {
    if (cobranca.referenciaExterna) this.pagamentos.set(cobranca.referenciaExterna, cobranca)
  }
}
