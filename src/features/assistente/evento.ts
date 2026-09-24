/**
 * Um evento de janela abre o assistente de qualquer lugar — sidebar, barra do
 * celular, campo do resumo — sem que cada um precise segurar o estado do painel.
 */
export const EVENTO_ABRIR_ASSISTENTE = 'nip:abrir-assistente'

export function abrirAssistente(pergunta?: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_ASSISTENTE, { detail: { pergunta } }))
}
