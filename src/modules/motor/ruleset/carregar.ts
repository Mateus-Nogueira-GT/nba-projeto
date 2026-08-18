import { parse } from 'yaml'
import { rulesetSchema, type Ruleset } from './schema'

/**
 * Recebe o CONTEÚDO do YAML como string e devolve o ruleset validado.
 *
 * Esta função NÃO lê arquivo, de propósito. Ler disco é I/O e violaria a
 * fronteira do motor (CLAUDE.md, regra 2). Quem lê o arquivo é a camada de
 * fora — `src/modules/dominio/` — e passa o conteúdo pra cá.
 */
export function carregarRuleset(conteudoYaml: string): Ruleset {
  const bruto: unknown = parse(conteudoYaml)
  const resultado = rulesetSchema.safeParse(bruto)

  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `  ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Ruleset inválido:\n${problemas}`)
  }

  return resultado.data
}
