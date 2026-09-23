/**
 * Camada anticorrupção entre o produto e o provedor de LLM.
 *
 * Quem consome pede "gere com o perfil X" e nunca sabe que existe OpenRouter.
 * Trocar de provedor é trocar o adapter, não o código que chama.
 *
 * A LLM NARRA o que o motor decidiu. Ela não decide, não consulta banco e não
 * bloqueia o produto (regra 3 do projeto).
 */

export type PerfilLLM = 'narrativa' | 'resumo' | 'chat' | 'admin'

export type PedidoGeracao = {
  /** Instrução de sistema: papel, tom, proibições. */
  sistema: string
  /** Conteúdo do usuário: os FATOS já materializados, nunca acesso a banco. */
  usuario: string
  /** Teto opcional; sem ele vale o do perfil. */
  maxTokens?: number
}

export type TextoGerado = {
  texto: string
  /** Qual modelo respondeu de fato — com fallback, não é sempre o primário. */
  modelo: string
  tokensEntrada: number
  tokensSaida: number
  /**
   * O modelo parou no teto de tokens (`finish_reason = 'length'`): o texto
   * termina no meio da frase. Quem mostra o texto ao assinante trata como
   * falha em vez de publicar a resposta cortada.
   */
  truncado: boolean
}

export type MotivoErroLLM =
  | 'sem-credencial'
  | 'timeout'
  | 'limite-de-taxa'
  | 'sem-saldo'
  | 'resposta-invalida'
  | 'transporte'

export class ErroLLM extends Error {
  constructor(
    readonly motivo: MotivoErroLLM,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroLLM'
  }
}

export interface PortaLLM {
  readonly nome: string
  gerar(perfil: PerfilLLM, pedido: PedidoGeracao): Promise<TextoGerado>
}
