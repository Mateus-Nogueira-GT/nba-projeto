/**
 * NÚMEROS COMO O ASSINANTE LÊ — em pt-BR, com vírgula decimal.
 *
 * Todo número que um componente do design system escreve passa por aqui.
 * Interpolação crua imprime o ponto do JavaScript ("19.275"), e nenhum guard
 * de escrita das telas casa com ele — os testes procuram decimal com VÍRGULA.
 * O erro não aparece: ele passa.
 */

/** Sempre com `casas` decimais: `decimalPtBr(25.7, 1)` → "25,7"; `(1.5, 2)` → "1,50". */
export const decimalPtBr = (n: number, casas: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

/**
 * Inteiro fica inteiro, fração fica com UMA casa: `numeroPtBr(8)` → "8",
 * `numeroPtBr(19.275)` → "19,3". É a precisão com que o card escreve a média
 * ("MÉDIA 25,7") — e o marco do modo fire é uma fração dela. Quem quer inteiro
 * arredonda antes de chamar (o motor já faz isso com o alvo do 1º Q).
 */
export const numeroPtBr = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
