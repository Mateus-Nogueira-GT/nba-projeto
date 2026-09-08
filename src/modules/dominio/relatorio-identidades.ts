import { count, getTableName, inArray, sql } from 'drizzle-orm'

import {
  apitos,
  estatisticasJogo,
  estatisticasQuarto,
  feedSnapshot,
  greens,
  identidadesJogador,
  jogadoresAcompanhados,
  jogadoresOcultos,
  jogadoresSilenciados,
  lesoesEscalacao,
  mapaJogadores,
  mediasJogador,
  niveis,
  oddsAgregada,
  oddsSnapshot,
} from './db/schema'
import type { Db } from './db/tipos'
import { identidadesDeApresentacao } from './identidade-apresentacao'

/**
 * Inventário SOMENTE LEITURA para a curadoria. Não propõe split nem transfere
 * vínculos: nome/provedor é UNIQUE e os fatos não podem ser copiados para duas
 * pessoas. Sem ids, mostra só ambiguidades/conflitos/duplicação de personId.
 */
export async function relatarIdentidades(db: Db, ids?: readonly string[]) {
  const identidades = await identidadesDeApresentacao(db)
  const uuidsPorPersonId = new Map<number, string[]>()
  for (const [id, identidade] of identidades) {
    if (identidade.personId === null) continue
    const uuids = uuidsPorPersonId.get(identidade.personId) ?? []
    uuids.push(id)
    uuidsPorPersonId.set(identidade.personId, uuids)
  }
  const alvos = [...identidades].filter(([id, i]) =>
    ids
      ? ids.includes(id)
      : i.pendencia !== null ||
        (i.personId !== null && uuidsPorPersonId.get(i.personId)!.length > 1),
  )
  if (alvos.length === 0) return []
  const idsAlvo = alvos.map(([id]) => id)
  const vinculos = await db
    .select()
    .from(mapaJogadores)
    .where(inArray(mapaJogadores.jogadorId, idsAlvo))
  const referencias = new Map<string, Record<string, number>>(idsAlvo.map((id) => [id, {}]))
  const tabelas = [
    mapaJogadores,
    identidadesJogador,
    niveis,
    estatisticasJogo,
    estatisticasQuarto,
    apitos,
    greens,
    mediasJogador,
    lesoesEscalacao,
    oddsSnapshot,
    oddsAgregada,
    jogadoresOcultos,
    jogadoresAcompanhados,
    jogadoresSilenciados,
  ] as const
  // Uma consulta agrupada por tabela. O relatório não revela contas/valores;
  // somente contagens de referências que impedem uma reconciliação destrutiva.
  for (const tabela of tabelas) {
    const contagens = await db
      .select({ jogadorId: tabela.jogadorId, total: count() })
      .from(tabela)
      .where(inArray(tabela.jogadorId, idsAlvo))
      .groupBy(tabela.jogadorId)
    for (const c of contagens) {
      if (c.jogadorId !== null) referencias.get(c.jogadorId)![getTableName(tabela)] = c.total
    }
  }
  const snapshots = await db.select({ conteudo: feedSnapshot.conteudoJson }).from(feedSnapshot)
    .where(sql`exists (
      select 1 from jsonb_array_elements(coalesce(${feedSnapshot.conteudoJson}->'itens', '[]'::jsonb)) as item
      where item->>'jogadorId' in (${sql.join(
        idsAlvo.map((id) => sql`${id}`),
        sql`, `,
      )})
    )`)
  for (const snapshot of snapshots) {
    const conteudo = snapshot.conteudo as { itens?: { jogadorId?: string }[] }
    for (const id of new Set(conteudo.itens?.map((item) => item.jogadorId))) {
      if (!id || !referencias.has(id)) continue
      const contagens = referencias.get(id)!
      contagens.feed_snapshot = (contagens.feed_snapshot ?? 0) + 1
    }
  }
  return alvos.map(([jogadorId, identidade]) => ({
    jogadorId,
    ...identidade,
    outrosUuidsDaPessoa:
      identidade.personId === null
        ? []
        : uuidsPorPersonId.get(identidade.personId)!.filter((id) => id !== jogadorId),
    vinculos: vinculos
      .filter((v) => v.jogadorId === jogadorId)
      .map((v) => ({
        id: v.id,
        alias: v.nomeNaLista,
        provedor: v.provedor,
        confirmadoPor: v.confirmadoPor,
        confirmadoEm: v.confirmadoEm,
      })),
    referencias: referencias.get(jogadorId)!,
  }))
}
