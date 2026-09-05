/**
 * Transporte com TIMEOUT por requisição — o mesmo cuidado do http.ts da NBA.
 *
 * Um gateway que aceita a conexão e nunca responde travaria o cron até a
 * Vercel matá-lo aos 300s, sem catch, sem lease liberado, sem contagem. Com
 * o abort, vira um erro comum que a fonte reporta e a próxima execução tenta
 * de novo. Infraestrutura, não regra: o valor não é do ruleset.
 */
export const TIMEOUT_PADRAO_MS = 10_000

export function comTimeout(buscar: typeof fetch, timeoutMs = TIMEOUT_PADRAO_MS): typeof fetch {
  return async (entrada, init) => {
    const controlador = new AbortController()
    const timer = setTimeout(() => controlador.abort(), timeoutMs)
    try {
      return await buscar(entrada, { ...init, signal: controlador.signal })
    } catch (erro) {
      if (controlador.signal.aborted) {
        throw new Error(`timeout de ${timeoutMs}ms em ${String(entrada).split('?')[0]}`)
      }
      throw erro
    } finally {
      clearTimeout(timer)
    }
  }
}
