import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { mapaJogadores, mapaMercados } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Atributo } from '../../motor/tipos'
import { sugerir } from '../niveis/similaridade'
import type { Sugestao } from '../niveis/similaridade'

/**
 * Dois problemas de reconciliação, não um (spec 06): o NOME DO MERCADO
 * ("Player Points" vs "Pontos do Jogador") e o NOME DO JOGADOR na casa.
 *
 * Regra 3: vínculo errado aqui mostra a odd de um jogador no card de outro.
 * NUNCA automático — este módulo sugere e persiste confirmações humanas.
 *
 * O vínculo de jogador reaproveita `mapa_jogadores` com namespace próprio
 * (`casa:<nome>`): mesma tabela, mesma trilha de auditoria, sem migration.
 */
const NAMESPACE_CASA = 'casa:'

export function provedorDaCasa(casaNome: string): string {
  return `${NAMESPACE_CASA}${casaNome}`
}

/** Nomes de mercado ainda sem vínculo confirmado — a fila de curadoria. */
export async function mercadosPendentes(
  db: Db,
  casaId: string,
  nomesVistos: string[],
): Promise<string[]> {
  if (nomesVistos.length === 0) return []
  const confirmados = await db
    .select({ nome: mapaMercados.nomeMercadoNaCasa })
    .from(mapaMercados)
    .where(
      and(
        eq(mapaMercados.casaId, casaId),
        eq(mapaMercados.confirmado, true),
        inArray(mapaMercados.nomeMercadoNaCasa, nomesVistos),
      ),
    )
  const conhecidos = new Set(confirmados.map((c) => c.nome))
  return [...new Set(nomesVistos)].filter((n) => !conhecidos.has(n))
}

export async function confirmarMercado(
  db: Db,
  vinculo: { casaId: string; nomeMercadoNaCasa: string; atributo: Atributo },
): Promise<void> {
  await db
    .insert(mapaMercados)
    .values({ ...vinculo, confirmado: true })
    .onConflictDoUpdate({
      target: [mapaMercados.casaId, mapaMercados.nomeMercadoNaCasa],
      set: { atributo: vinculo.atributo, confirmado: true },
    })
}

/**
 * Sugestões de vínculo jogador-da-casa → jogador canônico, pela MESMA régua
 * (`pontuar`) da lista do CJ e da busca. Score 1 continua sendo sugestão:
 * quem vincula é um humano no painel.
 */
export function sugerirJogadoresDaCasa(
  nomesNaCasa: string[],
  jogadoresCanonicos: { id: string; nomeCompleto: string; timeSigla: string | null }[],
): Sugestao[] {
  const candidatos = jogadoresCanonicos.map((j) => ({
    idExterno: j.id,
    nomeCompleto: j.nomeCompleto,
    timeSiglaProvedor: j.timeSigla,
    ativo: true,
  }))
  return [...new Set(nomesNaCasa)].map((nome) => sugerir(nome, candidatos))
}

export async function vincularJogadorDaCasa(
  db: Db,
  vinculo: {
    casaNome: string
    nomeNaCasa: string
    jogadorId: string
    score: number
    confirmadoPor: string
    agora: Date
  },
): Promise<void> {
  await db
    .insert(mapaJogadores)
    .values({
      nomeNaLista: vinculo.nomeNaCasa,
      provedor: provedorDaCasa(vinculo.casaNome),
      jogadorId: vinculo.jogadorId,
      scoreSimilaridade: vinculo.score.toFixed(4),
      confirmadoPor: vinculo.confirmadoPor,
      confirmadoEm: vinculo.agora,
    })
    .onConflictDoUpdate({
      target: [mapaJogadores.nomeNaLista, mapaJogadores.provedor],
      set: {
        jogadorId: vinculo.jogadorId,
        scoreSimilaridade: vinculo.score.toFixed(4),
        confirmadoPor: vinculo.confirmadoPor,
        confirmadoEm: vinculo.agora,
      },
    })
}

/** Vínculo confirmado da casa, se existir. */
export async function vinculoJogadorDaCasa(
  db: Db,
  casaNome: string,
  nomeNaCasa: string,
): Promise<string | null> {
  const [linha] = await db
    .select({ jogadorId: mapaJogadores.jogadorId })
    .from(mapaJogadores)
    .where(
      and(
        eq(mapaJogadores.nomeNaLista, nomeNaCasa),
        eq(mapaJogadores.provedor, provedorDaCasa(casaNome)),
        isNotNull(mapaJogadores.confirmadoEm),
      ),
    )
    .limit(1)
  return linha?.jogadorId ?? null
}
