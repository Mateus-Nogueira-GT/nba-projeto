import { destinoSeguro } from '@/features/publico/destino'

/**
 * Para onde o aceite devolve a pessoa. O que a checagem recusa cai na
 * ABERTURA (`/abrir`), não em `/`: quem aceitou durante um jogo no 1º quarto
 * merece cair no Ao Vivo, que é o que `/abrir` decide.
 */
export function paraOndeVoltar(bruto: string | null | undefined): string {
  if (!bruto) return '/abrir'
  const seguro = destinoSeguro(bruto, '/abrir')
  return seguro === '/' && bruto !== '/' ? '/abrir' : seguro
}
