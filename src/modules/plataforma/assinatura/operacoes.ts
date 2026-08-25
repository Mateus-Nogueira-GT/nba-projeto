import { createHash } from 'node:crypto'
import { and, eq, gte, or, sql } from 'drizzle-orm'

import { tentativasOperacaoConta } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

export type PoliticaOperacao = { maxTentativas: number; janelaMs: number }

export const POLITICAS_OPERACAO = {
  CADASTRO: { maxTentativas: 5, janelaMs: 60 * 60_000 },
  CHECKOUT: { maxTentativas: 5, janelaMs: 15 * 60_000 },
  CANCELAMENTO: { maxTentativas: 3, janelaMs: 15 * 60_000 },
} as const satisfies Record<string, PoliticaOperacao>

function hashIdentificador(identificador: string): string {
  return createHash('sha256').update(identificador.trim().toLowerCase()).digest('hex')
}

export async function excedeuOperacoes(
  db: Db,
  operacao: keyof typeof POLITICAS_OPERACAO,
  identificador: string,
  agora: Date,
  politica: PoliticaOperacao = POLITICAS_OPERACAO[operacao],
  ip: string | null = null,
): Promise<boolean> {
  const desde = new Date(agora.getTime() - politica.janelaMs)
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tentativasOperacaoConta)
    .where(
      and(
        eq(tentativasOperacaoConta.operacao, operacao),
        or(
          eq(tentativasOperacaoConta.identificadorHash, hashIdentificador(identificador)),
          ip ? eq(tentativasOperacaoConta.ip, ip) : undefined,
        ),
        gte(tentativasOperacaoConta.tentadoEm, desde),
      ),
    )
  return (linha?.total ?? 0) >= politica.maxTentativas
}

export async function registrarOperacao(
  db: Db,
  entrada: {
    operacao: keyof typeof POLITICAS_OPERACAO
    identificador: string
    ip: string | null
    sucesso: boolean
    agora: Date
  },
): Promise<string> {
  const [registrada] = await db
    .insert(tentativasOperacaoConta)
    .values({
      operacao: entrada.operacao,
      identificadorHash: hashIdentificador(entrada.identificador),
      ip: entrada.ip,
      sucesso: entrada.sucesso,
      tentadoEm: entrada.agora,
    })
    .returning({ id: tentativasOperacaoConta.id })
  if (!registrada) throw new Error('não foi possível registrar a operação sensível')
  return registrada.id
}
