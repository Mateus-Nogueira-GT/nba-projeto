export function dinheiro(centavos: number, moeda: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(
    centavos / 100,
  )
}

export function dataCurta(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(data)
}

/**
 * Data COM hora — para quando a hora é o dado, não enfeite.
 *
 * A trilha de saídas casa a aposta declarada pelo DIA LOCAL: duas saídas em
 * lados opostos da meia-noite caem em dias diferentes e podem ter desfechos
 * opostos. Impressas só com `dataCurta` elas ficariam idênticas na tela, e o
 * admin que discordasse de um "Sim"/"Não" não teria como entender por quê.
 */
export function dataHoraCurta(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data)
}
