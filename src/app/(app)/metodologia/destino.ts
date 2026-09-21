import { destinoInternoSeguro } from '@/modules/plataforma/auth/requisicao'

/**
 * Para onde o aceite devolve a pessoa.
 *
 * A allowlist de `destinoInternoSeguro` é curta DE PROPÓSITO — ela existe para
 * que uma Server Action chamada direto não vire open redirect. O portão da
 * metodologia, por outro lado, intercepta qualquer tela, então a maior parte
 * dos destinos que ele carrega não está na lista.
 *
 * O que a lista recusa cai na ABERTURA, e não em `/`: quem acabou de aceitar
 * durante um jogo no 1º quarto merece cair no Ao Vivo, que é justamente o que
 * `/abrir` decide. `/` é só a Lista.
 */
export function paraOndeVoltar(bruto: string | null): string {
  if (bruto === null) return '/abrir'
  const seguro = destinoInternoSeguro(bruto)
  // A recusa da allowlist é indistinguível de um `/` legítimo; quando o pedido
  // era outra coisa, a recusa vira a abertura.
  return seguro === '/' && bruto !== '/' ? '/abrir' : seguro
}
