import { lerLateralCacheada } from '@/app/_cache/lateral'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset } from '@/modules/dominio/temporada'
import type { DadosDaLateral } from '@/modules/entrega/lateral'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

/**
 * Lê o ruleset, acha o "hoje" no fuso da rodada e devolve a lateral do dia.
 *
 * O cache é o de `src/app/_cache/lateral.ts`, e não um próprio: é a tag dele
 * (`TAG_LATERAL`) que os crons da rodada invalidam. Um segundo cache com outra
 * instância da mesma tag ficaria de fora da invalidação e serviria a noite
 * velha por até uma hora. Lá dentro também se resolve a temporada EXIBIDA (a
 * que tem dado), não a do calendário — no hiato elas diferem.
 *
 * Só dado grátis: nada aqui lê o feed pago (`paywall.test.ts`).
 */
export async function carregarLateral(): Promise<DadosDaLateral> {
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  return lerLateralCacheada(hoje, calendarioDoRuleset(ruleset), ruleset.temporada.minimo_jogos_para_exibir)
}
