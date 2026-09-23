import { createHash } from 'node:crypto'
import { and, eq, gte, sql, type SQL } from 'drizzle-orm'

import { tentativasOperacaoConta } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * DOIS TETOS, NÃO UM (auditoria de 23/09, decisão D2 da spec).
 *
 * O teto por IDENTIFICADOR (e-mail, usuário) é estrito: é ele que freia quem
 * insiste na mesma conta. O teto por IP é folgado de propósito: no Brasil o
 * celular sai por CGNAT, milhares de pessoas atrás do mesmo IPv4. Com um teto
 * único de 5 somando os dois, a sexta pessoa de uma operadora na mesma hora
 * via "Muitas tentativas" e não comprava. Abuso volumétrico é trabalho do
 * firewall da Vercel, não desta tabela.
 */
export type PoliticaOperacao = { maxTentativas: number; maxPorIp: number; janelaMs: number }

export const POLITICAS_OPERACAO = {
  CADASTRO: { maxTentativas: 5, maxPorIp: 30, janelaMs: 60 * 60_000 },
  CHECKOUT: { maxTentativas: 5, maxPorIp: 30, janelaMs: 15 * 60_000 },
  CANCELAMENTO: { maxTentativas: 3, maxPorIp: 3, janelaMs: 15 * 60_000 },
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
  const contar = async (filtro: SQL) => {
    const [linha] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(tentativasOperacaoConta)
      .where(
        and(
          eq(tentativasOperacaoConta.operacao, operacao),
          filtro,
          gte(tentativasOperacaoConta.tentadoEm, desde),
        ),
      )
    return linha?.total ?? 0
  }
  const porIdentificador = await contar(
    eq(tentativasOperacaoConta.identificadorHash, hashIdentificador(identificador)),
  )
  if (porIdentificador >= politica.maxTentativas) return true
  if (!ip) return false
  return (await contar(eq(tentativasOperacaoConta.ip, ip))) >= politica.maxPorIp
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
