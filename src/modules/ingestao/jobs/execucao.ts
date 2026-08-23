import { randomUUID } from 'node:crypto'

import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import { execucoesIngestao, locksIngestao } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { OrigemExecucaoIngestao } from '../../dominio/db/schema/ingestao'

export type ContextoJob = {
  execucaoId: string
  leaseToken: string
  confirmarLease(): Promise<void>
}

export type OpcoesJob = {
  job: string
  janelaInicio: string
  janelaFim: string
  temporada: string
  origem: OrigemExecucaoIngestao
  agora?: () => Date
  leaseMs?: number
}

export type ResultadoJob<T> =
  | { executado: true; execucaoId: string; resultado: T }
  | { executado: false; execucaoId: string; motivo: 'LOCK_OCUPADO' }

function erroSanitizado(erro: unknown): string {
  const mensagem = erro instanceof Error ? erro.message : String(erro)
  return mensagem
    .replace(/(authorization|x-apisports-key|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 500)
}

function contagensDoResultado(resultado: unknown): Record<string, number> {
  if (typeof resultado !== 'object' || resultado === null || Array.isArray(resultado)) return {}
  return Object.fromEntries(
    Object.entries(resultado).filter(
      (entrada): entrada is [string, number] =>
        typeof entrada[1] === 'number' && Number.isFinite(entrada[1]),
    ),
  )
}

/**
 * Executa um job curto sob lease persistente e fencing token.
 *
 * O lock não depende do processo: outra invocação só assume apó expiração.
 * Cada escrita longa deve chamar `confirmarLease` antes do commit.
 */
export async function executarJobComLease<T>(
  db: Db,
  opcoes: OpcoesJob,
  tarefa: (contexto: ContextoJob) => Promise<T>,
): Promise<ResultadoJob<T>> {
  const agora = opcoes.agora ?? (() => new Date())
  const leaseMs = opcoes.leaseMs ?? 55_000
  const inicio = agora()
  const leaseToken = randomUUID()
  const chave = `${opcoes.job}:${opcoes.janelaInicio}:${opcoes.janelaFim}:${opcoes.temporada}`

  const reserva = await db.transaction(async (tx) => {
    const [execucao] = await tx
      .insert(execucoesIngestao)
      .values({
        job: opcoes.job,
        janelaInicio: opcoes.janelaInicio,
        janelaFim: opcoes.janelaFim,
        temporada: opcoes.temporada,
        origem: opcoes.origem,
        estado: 'RESERVADA',
        leaseToken,
      })
      .returning({ id: execucoesIngestao.id })
    if (!execucao) throw new Error('não foi possível reservar execução de ingestão')

    const leaseExpiraEm = new Date(inicio.getTime() + leaseMs)
    const [lock] = await tx
      .insert(locksIngestao)
      .values({ chave, execucaoId: execucao.id, leaseToken, leaseExpiraEm })
      .onConflictDoUpdate({
        target: locksIngestao.chave,
        set: {
          execucaoId: execucao.id,
          leaseToken,
          leaseExpiraEm,
          liberadoEm: null,
          adquiridoEm: inicio,
          atualizadoEm: inicio,
          tentativas: sql`${locksIngestao.tentativas} + 1`,
        },
        setWhere: sql`${locksIngestao.liberadoEm} is not null or ${locksIngestao.leaseExpiraEm} <= ${inicio}`,
      })
      .returning({ leaseToken: locksIngestao.leaseToken })

    const adquiriu = lock?.leaseToken === leaseToken
    await tx
      .update(execucoesIngestao)
      .set({
        estado: adquiriu ? 'EXECUTANDO' : 'IGNORADA',
        iniciadoEm: adquiriu ? inicio : null,
        finalizadoEm: adquiriu ? null : inicio,
        atualizadoEm: inicio,
      })
      .where(eq(execucoesIngestao.id, execucao.id))

    return { execucaoId: execucao.id, adquiriu }
  })

  if (!reserva.adquiriu) {
    return { executado: false, execucaoId: reserva.execucaoId, motivo: 'LOCK_OCUPADO' }
  }

  const confirmarLease = async () => {
    const [lock] = await db
      .select({ token: locksIngestao.leaseToken, expiraEm: locksIngestao.leaseExpiraEm })
      .from(locksIngestao)
      .where(and(eq(locksIngestao.chave, chave), eq(locksIngestao.leaseToken, leaseToken)))
      .limit(1)
    if (!lock || lock.expiraEm <= agora()) throw new Error('lease de ingestão perdido')
  }

  try {
    const resultado = await tarefa({
      execucaoId: reserva.execucaoId,
      leaseToken,
      confirmarLease,
    })
    await confirmarLease()
    const fim = agora()
    const contagens = contagensDoResultado(resultado)
    const estadoFinal =
      (contagens.falhas_fontes ?? 0) > 0 || (contagens.capacidades_indisponiveis ?? 0) > 0
        ? 'PARCIAL'
        : 'SUCESSO'
    await db.transaction(async (tx) => {
      const [liberado] = await tx
        .update(locksIngestao)
        .set({ liberadoEm: fim, atualizadoEm: fim })
        .where(
          and(
            eq(locksIngestao.chave, chave),
            eq(locksIngestao.leaseToken, leaseToken),
            isNull(locksIngestao.liberadoEm),
            gt(locksIngestao.leaseExpiraEm, fim),
          ),
        )
        .returning({ token: locksIngestao.leaseToken })
      if (!liberado) throw new Error('lease de ingestão perdido antes do commit final')

      await tx
        .update(execucoesIngestao)
        .set({
          estado: estadoFinal,
          contagensJson: contagens,
          finalizadoEm: fim,
          atualizadoEm: fim,
        })
        .where(eq(execucoesIngestao.id, reserva.execucaoId))
    })
    return { executado: true, execucaoId: reserva.execucaoId, resultado }
  } catch (erro) {
    const fim = agora()
    await db.transaction(async (tx) => {
      await tx
        .update(execucoesIngestao)
        .set({
          estado: 'FALHA',
          erro: erroSanitizado(erro),
          finalizadoEm: fim,
          atualizadoEm: fim,
        })
        .where(eq(execucoesIngestao.id, reserva.execucaoId))
      await tx
        .update(locksIngestao)
        .set({ liberadoEm: fim, atualizadoEm: fim })
        .where(and(eq(locksIngestao.chave, chave), eq(locksIngestao.leaseToken, leaseToken)))
    })
    throw erro
  }
}
