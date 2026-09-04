import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import { jogadores, mapaJogadores } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { normalizarTexto } from '../../dominio/texto'
import { provedorDaCasa } from './reconciliar'

/**
 * VÍNCULO jogador↔casa por nome — sobre `mapa_jogadores`, no namespace
 * `casa:<nome>` que `reconciliar.ts` já definiu e que o painel
 * `/admin/mercados` já lê e escreve. UMA tabela para o fato; a confirmação
 * humana feita no painel é exatamente a que a coleta consome.
 *
 * Quem confirma fica registrado em `confirmado_por`: a semeadura automática
 * assina `SEMEADURA`, o painel assina o e-mail do curador. Auditável e
 * reversível — dá para listar (e desfazer) tudo que a máquina decidiu sozinha.
 */
export const CONFIRMADO_POR_SEMEADURA = 'semeadura:nome-exato'

/**
 * SEMEADURA CONSERVADORA.
 *
 * Nome normalizado que casa com EXATAMENTE um jogador canônico nasce
 * confirmado (assinado pela semeadura). Zero ou dois+ candidatos → pendente,
 * `jogador_id` nulo, esperando curadoria no painel.
 *
 * Reexecutar é seguro nos dois sentidos: um pendente cuja ambiguidade sumiu
 * (o jogador entrou em `jogadores`) é PROMOVIDO; uma linha já confirmada — por
 * humano ou pela semeadura — nunca é tocada (`setWhere confirmado_em IS NULL`).
 * A curadoria humana é autoridade acima da máquina.
 */
export async function semearVinculosDeJogador(
  db: Db,
  casaNome: string,
  nomesNaCasa: string[],
  agora: Date,
): Promise<{ confirmados: number; pendentes: number }> {
  const provedor = provedorDaCasa(casaNome)

  // Um nome por chave normalizada nesta rodada: 'Stephen Curry' e
  // 'STEPHEN CURRY' são o mesmo pedido de vínculo.
  const porChave = new Map<string, string>()
  for (const nome of nomesNaCasa) {
    const chave = normalizarTexto(nome)
    if (chave !== '' && !porChave.has(chave)) porChave.set(chave, nome)
  }
  if (porChave.size === 0) return { confirmados: 0, pendentes: 0 }

  const canonicos = await db
    .select({ id: jogadores.id, nome: jogadores.nomeCompleto })
    .from(jogadores)
  const candidatosPorChave = new Map<string, string[]>()
  for (const j of canonicos) {
    const chave = normalizarTexto(j.nome)
    candidatosPorChave.set(chave, [...(candidatosPorChave.get(chave) ?? []), j.id])
  }

  const linhas = [...porChave.entries()].map(([chave, nome]) => {
    const candidatos = candidatosPorChave.get(chave) ?? []
    const unico = candidatos.length === 1 ? candidatos[0]! : null
    return {
      nomeNaLista: nome,
      provedor,
      jogadorId: unico,
      scoreSimilaridade: unico ? '1.0000' : null,
      confirmadoPor: unico ? CONFIRMADO_POR_SEMEADURA : null,
      confirmadoEm: unico ? agora : null,
    }
  })

  // Um round-trip para todos os nomes. Promove pendente → confirmado quando a
  // nova linha traz confirmação; nunca rebaixa nem sobrescreve confirmação.
  await db
    .insert(mapaJogadores)
    .values(linhas)
    .onConflictDoUpdate({
      target: [mapaJogadores.nomeNaLista, mapaJogadores.provedor],
      set: {
        jogadorId: sql`excluded.jogador_id`,
        scoreSimilaridade: sql`excluded.score_similaridade`,
        confirmadoPor: sql`excluded.confirmado_por`,
        confirmadoEm: sql`excluded.confirmado_em`,
      },
      setWhere: and(isNull(mapaJogadores.confirmadoEm), sql`excluded.confirmado_em IS NOT NULL`),
    })

  // O retrato DEPOIS da semeadura, não o que este insert tocou: pendente que
  // já existia continua pendente e precisa aparecer no número.
  const confirmadosAgora = await vinculosConfirmados(db, casaNome)
  let confirmados = 0
  let pendentes = 0
  for (const chave of porChave.keys()) {
    if (confirmadosAgora.has(chave)) confirmados += 1
    else pendentes += 1
  }
  return { confirmados, pendentes }
}

/**
 * Só o que está CONFIRMADO resolve cotação — pelo painel ou pela semeadura.
 * Chave normalizada: uma confirmação de 'Stephen Curry' vale para
 * 'STEPHEN CURRY' e 'Stephen  Curry' que a casa grafe amanhã.
 */
export async function vinculosConfirmados(db: Db, casaNome: string): Promise<Map<string, string>> {
  const linhas = await db
    .select({ nome: mapaJogadores.nomeNaLista, jogadorId: mapaJogadores.jogadorId })
    .from(mapaJogadores)
    .where(
      and(
        eq(mapaJogadores.provedor, provedorDaCasa(casaNome)),
        isNotNull(mapaJogadores.confirmadoEm),
        isNotNull(mapaJogadores.jogadorId),
      ),
    )
  return new Map(linhas.map((l) => [normalizarTexto(l.nome), l.jogadorId!]))
}
