export function calcularParcelaDoParceiro(
  baseCentavos: number,
  percentualPontosBase: number,
): number {
  if (!Number.isSafeInteger(baseCentavos) || baseCentavos < 0) {
    throw new Error('Base monetária inválida')
  }
  if (
    !Number.isSafeInteger(percentualPontosBase) ||
    percentualPontosBase < 0 ||
    percentualPontosBase > 10_000
  ) {
    throw new Error('Percentual inválido')
  }

  return Math.round((baseCentavos * percentualPontosBase) / 10_000)
}
