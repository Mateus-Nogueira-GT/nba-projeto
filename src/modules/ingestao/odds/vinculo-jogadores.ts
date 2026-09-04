import { and, eq } from 'drizzle-orm'

import { jogadores, mapaJogadoresCasa } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { normalizarTexto } from '../../dominio/texto'

/**
 * SEMEADURA CONSERVADORA do vínculo jogador↔casa.
 *
 * Match exato do nome normalizado com EXATAMENTE um jogador canônico →
 * confirmado. Zero ou dois+ candidatos → pendente, esperando curadoria.
 * O mesmo princípio do `identidade.ts` da ingestão NBA: a máquina só decide o
 * caso sem ambiguidade; o resto é humano.
 *
 * Idempotente: reexecutar não duplica (UNIQUE casa+nome) e NUNCA rebaixa uma
 * confirmação já feita — `onConflictDoNothing`, porque a curadoria humana é
 * autoridade acima da semeadura.
 */
export async function semearVinculosDeJogador(
  db: Db,
  casaId: string,
  nomesNaCasa: string[],
): Promise<{ confirmados: number; pendentes: number }> {
  const canonicos = await db
    .select({ id: jogadores.id, nome: jogadores.nomeCompleto })
    .from(jogadores)
  const porNomeNormalizado = new Map<string, string[]>()
  for (const j of canonicos) {
    const chave = normalizarTexto(j.nome)
    porNomeNormalizado.set(chave, [...(porNomeNormalizado.get(chave) ?? []), j.id])
  }

  let confirmados = 0
  let pendentes = 0
  for (const nome of new Set(nomesNaCasa)) {
    const candidatos = porNomeNormalizado.get(normalizarTexto(nome)) ?? []
    const unico = candidatos.length === 1 ? candidatos[0]! : null
    const [inserida] = await db
      .insert(mapaJogadoresCasa)
      .values({ casaId, nomeNaCasa: nome, jogadorId: unico, confirmado: unico !== null })
      .onConflictDoNothing({ target: [mapaJogadoresCasa.casaId, mapaJogadoresCasa.nomeNaCasa] })
      .returning()
    if (!inserida) continue // já existia — a linha antiga manda
    if (inserida.confirmado) confirmados += 1
    else pendentes += 1
  }
  return { confirmados, pendentes }
}

/** Só o que a curadoria (ou a semeadura sem ambiguidade) confirmou resolve cotação. */
export async function vinculosConfirmados(db: Db, casaId: string): Promise<Map<string, string>> {
  const linhas = await db
    .select({ nome: mapaJogadoresCasa.nomeNaCasa, jogadorId: mapaJogadoresCasa.jogadorId })
    .from(mapaJogadoresCasa)
    .where(and(eq(mapaJogadoresCasa.casaId, casaId), eq(mapaJogadoresCasa.confirmado, true)))
  return new Map(linhas.filter((l) => l.jogadorId !== null).map((l) => [l.nome, l.jogadorId!]))
}
