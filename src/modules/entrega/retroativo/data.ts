/**
 * DATA CALENDÁRIA VÁLIDA, POR ROUND-TRIP.
 *
 * `Date.parse` e `new Date(ano, mes, dia)` não recusam dia inexistente: rolam
 * para o mês seguinte (30/02 vira 02/03, 31/04 vira 01/05, 29/02 num ano não
 * bissexto vira 01/03). Sem essa checagem o script aceitaria `--de=2025-02-30`
 * e rodaria um intervalo deslocado sem avisar ninguém — o oposto de "recusar
 * data malformada com mensagem clara", que é o requisito.
 *
 * Função pura: só string entra, só booleano sai.
 */
export function dataCalendarioValida(valor: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  if (!partes) return false

  const [, anoTexto, mesTexto, diaTexto] = partes
  const data = new Date(Date.UTC(Number(anoTexto), Number(mesTexto) - 1, Number(diaTexto)))
  return data.toISOString().slice(0, 10) === valor
}
