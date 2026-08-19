/**
 * PORTA DA FILA DE PUSH.
 *
 * Mesma razão da porta de pagamento: o Vercel Queues é beta, e o teste de
 * aceitação precisa CONTAR pushes ("replay produz exatamente N"). Contra a
 * fila real isso seria impossível de verificar.
 */

/**
 * Canal de notificação. Espelha `canal_notificacao` no banco e
 * `push.canais_independentes` no ruleset — o usuário liga e desliga cada um
 * separadamente.
 */
export type CanalPush = 'FIRE_LIVE_APITO' | 'GREEN' | 'LISTA_SECRETA'

/**
 * Formato do card. Apito e green NÃO compartilham formato: um é entrada
 * sugerida com alvo e chamas, o outro é confirmação de marca batida.
 */
export type FormatoPush = 'CARD_APITO' | 'FAIXA_GREEN'

/**
 * Posição na tela. Também distinta por tipo.
 *
 * O apito fica no topo porque é acionável e a janela de aposta é curta; o
 * green é resultado, não ação, e não pode roubar o lugar de um apito vivo.
 */
export type PosicaoTela = 'TOPO' | 'RODAPE'

/**
 * UM evento na fila, não uma mensagem por usuário.
 *
 * O fan-out para os 10k assinantes acontece do outro lado, no consumidor.
 * Enfileirar por usuário seria 10.000 mensagens por apito e mataria a conta —
 * "a avaliação acontece uma vez por evento, não uma vez por usuário"
 * (docs/01-arquitetura.md).
 */
export type MensagemPush = {
  /**
   * Chave de deduplicação ponta a ponta.
   *
   * Vale como SEGUNDA barreira, não como a primeira: quem de fato garante um
   * push só é a UNIQUE em `apitos`/`greens`, que decide antes de a mensagem
   * chegar aqui. Esta chave cobre o caso em que o envio à fila falha depois
   * do commit e é reexecutado.
   */
  chave: string
  canal: CanalPush
  formato: FormatoPush
  posicao: PosicaoTela
  titulo: string
  corpo: string
  /** Carga que o service worker usa para montar o card. */
  dados: Record<string, unknown>
}

export interface PortaFila {
  enfileirar(mensagens: MensagemPush[]): Promise<void>
}
