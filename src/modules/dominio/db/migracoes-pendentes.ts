/**
 * O guard que faltou em 25/08/2026.
 *
 * O deploy pela Vercel roda `next build` — e `next build` NÃO roda migração.
 * Enquanto os deploys saíam da CLI, alguém rodava `db:migrate` na mão; quando
 * o repositório foi conectado ao Git, ninguém mais rodou. O código novo subiu
 * pedindo `jogadores_ocultos` a um banco que ainda estava no schema de 23/08,
 * e `/fire-live` respondeu 500 para o assinante.
 *
 * Puro de propósito: a comparação é testável sem banco, e o script
 * `db:status` (e qualquer health check futuro) só traz os dois números.
 */

export type EstadoDasMigracoes = {
  /** Tags do diretório `drizzle/` que o banco ainda não tem. */
  pendentes: string[]
  /** true quando o banco está à frente do código — deploy revertido, por exemplo. */
  bancoAdiantado: boolean
}

/**
 * Drizzle aplica migrações em ordem e grava uma linha por migração aplicada.
 * Logo, as pendentes são sempre o SUFIXO da lista do disco.
 *
 * @param tagsNoDisco tags do `_journal.json`, na ordem em que serão aplicadas
 * @param quantidadeAplicada linhas em `drizzle.__drizzle_migrations`
 */
export function migracoesPendentes(
  tagsNoDisco: string[],
  quantidadeAplicada: number,
): EstadoDasMigracoes {
  if (quantidadeAplicada > tagsNoDisco.length) {
    return { pendentes: [], bancoAdiantado: true }
  }
  return { pendentes: tagsNoDisco.slice(quantidadeAplicada), bancoAdiantado: false }
}
