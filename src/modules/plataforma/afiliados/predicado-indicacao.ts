import { and, exists, ne, sql } from 'drizzle-orm'

import { atribuicoesAfiliados, eventosAfiliados } from '@/modules/dominio/db/schema'

/**
 * A atribuição conta como indicação só se a conta NASCEU por ela: tem de ter
 * o `CADASTRO_NIP`. Quem já tinha conta e entrou depois de um clique fica
 * ligado pelo LOGIN — "quem já tem conta não troca de indicador" — e a
 * assinatura dele não é de ninguém. CONFLITO nunca conta: não há dono.
 *
 * `expira_em` NÃO entra aqui de propósito: a janela de 30 dias decide QUEM é o
 * dono no clique e no cadastro; depois disso, assinar no 2º mês continua sendo
 * assinatura da mesma indicação.
 *
 * Vive num arquivo À PARTE de `indicacoes.ts` e de `servico.ts` — sem importar
 * nada de nenhum dos dois — para que os DOIS o reaproveitem (o registro em
 * `indicacoes.ts`, os totais dos painéis em `servico.ts`) sem criar um ciclo
 * de import entre eles. `indicacoes.ts` já importa `auditar`/`exigirAdmin` de
 * `servico.ts`; se `servico.ts` importasse este predicado de volta de
 * `indicacoes.ts`, a guarda `sem-dependencia-circular` do dependency-cruiser
 * recusaria a build.
 */
export function atribuicaoIndicadaNoCadastro() {
  return and(
    ne(atribuicoesAfiliados.estado, 'CONFLITO'),
    exists(
      sql`(select 1 from ${eventosAfiliados} where ${eventosAfiliados.atribuicaoId} = ${atribuicoesAfiliados.id} and ${eventosAfiliados.tipo} = 'CADASTRO_NIP')`,
    ),
  )
}
