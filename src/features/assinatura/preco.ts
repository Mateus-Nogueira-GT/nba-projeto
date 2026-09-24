/**
 * PREÇO EM REAIS, À MÃO — e não por `Intl.NumberFormat`.
 *
 * Duas razões, as duas práticas. `Intl` com `style: 'currency'` insere um
 * espaço NÃO SEPARÁVEL (U+00A0) entre o símbolo e o número; o HTML sai com
 * esse caractere literal, e qualquer asserção escrita com espaço comum falha
 * de um jeito que ninguém enxerga lendo o diff. E o resultado depende dos
 * dados de ICU do runtime — este é o número que a pessoa lê ANTES de ser
 * cobrada, e ele tem que sair igual em todo lugar.
 */
export function precoEmReais(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`
}
