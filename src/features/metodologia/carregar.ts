import { montarTeoria } from '@/modules/entrega/teoria/conteudo'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

/**
 * Tudo o que a metodologia mostra vem do ruleset: trocar um valor lá muda a
 * página sozinha. Lido pela PÁGINA; o componente só desenha.
 */
export async function lerMetodologia() {
  const ruleset = await rulesetAtivo()
  return {
    ruleset,
    t: montarTeoria(ruleset),
    faixasConfianca: [...ruleset.confianca_exibicao.faixas].sort((a, b) => a.de - b.de),
  }
}

export type Metodologia = Awaited<ReturnType<typeof lerMetodologia>>
