/**
 * HELPERS NUMÉRICOS DA ABA DE ESTATÍSTICAS.
 *
 * Extraído de jogo.ts, jogador.ts e time.ts, que tinham cada um sua própria
 * cópia byte a byte das duas funções abaixo (achado da revisão da Task 3/4).
 */

/** `minutos` (e outras métricas numéricas) chegam como numeric (string) do Postgres. */
export function numero(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Percentual de acerto. Null quando não houve tentativa — nunca 0%. */
export function percentual(convertidas: number, tentadas: number): number | null {
  if (tentadas === 0) return null
  return Math.round((convertidas / tentadas) * 1000) / 10
}
