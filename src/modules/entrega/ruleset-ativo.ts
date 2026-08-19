import { readFile } from 'node:fs/promises'
import { carregarRuleset } from '../motor/ruleset/carregar'
import type { Ruleset } from '../motor/ruleset/schema'

/**
 * Lê o ruleset do disco e entrega validado.
 *
 * O I/O vive AQUI, fora do motor: `carregarRuleset` recebe string por desenho,
 * porque ler arquivo violaria a fronteira (CLAUDE.md, regra 2).
 */
let cache: Ruleset | null = null

export async function rulesetAtivo(caminho = 'config/ruleset.v1.yaml'): Promise<Ruleset> {
  if (cache) return cache
  cache = carregarRuleset(await readFile(caminho, 'utf8'))
  return cache
}
