/**
 * Namespaces das travas de advisory de negócio.
 *
 * Toda trava usa a forma de duas chaves — o namespace daqui e o
 * `hashtext(chave)` — para que famílias diferentes não colidam: com uma chave
 * só, o hash de um endpoint de push podia coincidir com o de um visitante de
 * afiliado e uma operação esperava a outra sem motivo (minor da revisão final,
 * §8). Valores fixos e únicos: trocar um número muda a trava em produção.
 *
 * As travas de `locks_ingestao` são linhas de tabela, não advisory, e não
 * entram aqui.
 */
export const TRAVA = {
  PAGAMENTO: 1,
  AFILIADO_VISITANTE: 2,
  AFILIADO_USUARIO: 3,
  SAIDA_DO_APITO: 4,
  PUSH_ENDPOINT: 5,
} as const
