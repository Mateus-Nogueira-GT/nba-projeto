/**
 * Impressão do dispositivo — só no cliente.
 *
 * Não é anti-fraude: é o que permite reconhecer "o mesmo celular" entre
 * sessões, para que reentrar não consuma uma das 2 vagas. A chave é a MESMA
 * do front anterior (`ia_nba_dispositivo`): trocar o nome faria todo aparelho
 * já conhecido virar um aparelho novo.
 */
export function impressaoDoDispositivo(): string {
  const CHAVE = 'ia_nba_dispositivo'
  try {
    const guardado = localStorage.getItem(CHAVE)
    if (guardado) return guardado
    const nova = crypto.randomUUID()
    localStorage.setItem(CHAVE, nova)
    return nova
  } catch {
    return 'desconhecido'
  }
}
