/** Dinheiro em centavos → "R$ 1.234,56". A moeda vem do registro, nunca suposta. */
export function dinheiro(centavos: number, moeda: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(centavos / 100)
}

/** 23/08/2026 — o fuso comercial da operação. */
export function dataCurta(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(data)
}

/**
 * Data COM hora — para quando a hora é o dado. A trilha de saídas casa a
 * aposta declarada pelo DIA LOCAL: duas saídas em lados opostos da
 * meia-noite caem em dias diferentes e podem ter desfechos opostos.
 */
export function dataHoraCurta(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data)
}
