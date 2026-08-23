import { eq } from 'drizzle-orm'

import { rulesets } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { carregarRuleset } from '../../motor'
import type { Ruleset } from '../../motor'

/**
 * Rulesets CANDIDATOS — o que o CJ quer testar antes de valer.
 *
 * O disco continua sendo a fonte do ruleset ATIVO (ADR-0002: a estratégia em
 * produção é versionada em git). A tabela guarda só candidatos, com
 * `status: provisorio`; promover é um commit do YAML, não um UPDATE.
 */
export async function gravarCandidato(
  db: Db,
  candidato: { versao: string; conteudoYaml: string; criadoPor?: string },
): Promise<void> {
  // A MESMA validação do ruleset ativo: candidato quebrado não entra.
  carregarRuleset(candidato.conteudoYaml)

  await db
    .insert(rulesets)
    .values({
      versao: candidato.versao,
      conteudoYaml: candidato.conteudoYaml,
      status: 'provisorio',
      criadoPor: candidato.criadoPor ?? null,
    })
    .onConflictDoUpdate({
      target: [rulesets.versao],
      set: { conteudoYaml: candidato.conteudoYaml, criadoPor: candidato.criadoPor ?? null },
    })
}

export async function listarCandidatos(
  db: Db,
): Promise<{ versao: string; status: string }[]> {
  return db
    .select({ versao: rulesets.versao, status: rulesets.status })
    .from(rulesets)
    .where(eq(rulesets.status, 'provisorio'))
}

/** Conteúdo validado de um candidato, para rodar o backtest. */
export async function carregarCandidato(db: Db, versao: string): Promise<Ruleset | null> {
  const [linha] = await db
    .select({ conteudoYaml: rulesets.conteudoYaml })
    .from(rulesets)
    .where(eq(rulesets.versao, versao))
    .limit(1)
  if (!linha) return null
  return carregarRuleset(linha.conteudoYaml)
}
