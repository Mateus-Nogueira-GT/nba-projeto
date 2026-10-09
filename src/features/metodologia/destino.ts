import { destinoSeguro } from '@/features/publico/destino'

/**
 * Para onde o aceite devolve a pessoa. O que a checagem recusa cai na
 * ABERTURA (`/abrir`), não em `/`: quem aceitou durante um jogo no 1º quarto
 * merece cair no Ao Vivo, que é o que `/abrir` decide.
 *
 * O filtro é o MESMO do login (`destinoSeguro` → `destinoInternoSeguro`): as
 * telas que o portão manda — `/fire-live`, `/gestao`, `/estatisticas/…`,
 * `/resultados/<data>`, `/apito/<id>` — voltam; `..`, `?`, `#`, `//` e `\`
 * não (pente fino de 09/10, achado 6).
 */
export function paraOndeVoltar(bruto: string | null | undefined): string {
  if (!bruto) return '/abrir'
  const seguro = destinoSeguro(bruto, '/abrir')
  return seguro === '/' && bruto !== '/' ? '/abrir' : seguro
}
