/**
 * CONFERÊNCIA POR FRANQUIA — fato da liga, não da curadoria.
 *
 * Mora no domínio (não no design system, que é apresentação; não na
 * ingestão, que é provedor) porque a classificação é dado canônico e a
 * entrega precisa dele para numerar posição por conferência. Os elencos da
 * lista do CJ são projetados; a conferência de uma franquia, não.
 */
export type Conferencia = 'Leste' | 'Oeste'

export const CONFERENCIA_POR_SIGLA: Readonly<Record<string, Conferencia>> = {
  ATL: 'Leste', BOS: 'Leste', BKN: 'Leste', CHA: 'Leste', CHI: 'Leste',
  CLE: 'Leste', DET: 'Leste', IND: 'Leste', MIA: 'Leste', MIL: 'Leste',
  NYK: 'Leste', ORL: 'Leste', PHI: 'Leste', TOR: 'Leste', WAS: 'Leste',
  DAL: 'Oeste', DEN: 'Oeste', GSW: 'Oeste', HOU: 'Oeste', LAC: 'Oeste',
  LAL: 'Oeste', MEM: 'Oeste', MIN: 'Oeste', NOP: 'Oeste', OKC: 'Oeste',
  PHX: 'Oeste', POR: 'Oeste', SAC: 'Oeste', SAS: 'Oeste', UTA: 'Oeste',
}

/** `null` para sigla desconhecida: a tela mostra a falta em vez de mentir. */
export function conferenciaDe(sigla: string): Conferencia | null {
  return CONFERENCIA_POR_SIGLA[sigla.trim().toUpperCase()] ?? null
}
