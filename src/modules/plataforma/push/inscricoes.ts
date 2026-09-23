import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import {
  preferenciasNotificacao,
  pushInscricoes,
  pushInscricoesAuditoria,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { TRAVA } from '../../dominio/db/travas'
import { endpointPushPermitido } from './endpoint'

export const CANAIS_PUSH = ['FIRE_LIVE_APITO', 'GREEN', 'LISTA_SECRETA'] as const
export type CanalPush = (typeof CANAIS_PUSH)[number]

const chaveCriptografica = z
  .string()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'chave inválida')

export const schemaInscricaoPush = z
  .object({
    endpoint: z.url().max(2048).refine(endpointPushPermitido, 'endpoint de Push não permitido'),
    expirationTime: z.number().int().positive().nullable(),
    keys: z
      .object({
        p256dh: chaveCriptografica,
        auth: chaveCriptografica,
      })
      .strict(),
  })
  .strict()

export const schemaPreferenciaPush = z
  .object({
    canal: z.enum(CANAIS_PUSH),
    habilitado: z.boolean(),
  })
  .strict()

export type EntradaInscricaoPush = z.infer<typeof schemaInscricaoPush>
export type VinculoPushDaSessao = { usuarioId: string; dispositivoId: string | null }

export type PreferenciasPush = Record<CanalPush, boolean>

export const PREFERENCIAS_PADRAO: PreferenciasPush = {
  FIRE_LIVE_APITO: true,
  GREEN: true,
  LISTA_SECRETA: true,
}

export class DispositivoDaSessaoAusenteError extends Error {
  constructor() {
    super('a sessão atual não possui dispositivo associado')
    this.name = 'DispositivoDaSessaoAusenteError'
  }
}

export class InscricaoJaExpiradaError extends Error {
  constructor() {
    super('a inscrição Push já expirou')
    this.name = 'InscricaoJaExpiradaError'
  }
}

export async function registrarInscricaoPush(
  db: Db,
  sessao: VinculoPushDaSessao,
  entrada: EntradaInscricaoPush,
  agora = new Date(),
): Promise<{ id: string; criada: boolean; reassociada: boolean }> {
  if (!sessao.dispositivoId) throw new DispositivoDaSessaoAusenteError()
  if (entrada.expirationTime !== null && entrada.expirationTime <= agora.getTime()) {
    throw new InscricaoJaExpiradaError()
  }

  return db.transaction(async (tx) => {
    // Serializa o mesmo endpoint inclusive antes de a primeira linha existir.
    // Assim, duas sessões concorrentes não perdem a trilha de reassociação.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${TRAVA.PUSH_ENDPOINT}, hashtext(${entrada.endpoint}))`,
    )

    const [anterior] = await tx
      .select({
        id: pushInscricoes.id,
        usuarioId: pushInscricoes.usuarioId,
        dispositivoId: pushInscricoes.dispositivoId,
        invalidadaEm: pushInscricoes.invalidadaEm,
        expiraEm: pushInscricoes.expiraEm,
        criadoEm: pushInscricoes.criadoEm,
        chaveP256dh: pushInscricoes.chaveP256dh,
        chaveAuth: pushInscricoes.chaveAuth,
      })
      .from(pushInscricoes)
      .where(eq(pushInscricoes.endpoint, entrada.endpoint))
      .limit(1)

    const reassociada = Boolean(
      anterior &&
      (anterior.usuarioId !== sessao.usuarioId || anterior.dispositivoId !== sessao.dispositivoId),
    )
    const reativada = Boolean(
      anterior?.invalidadaEm || (anterior?.expiraEm && anterior.expiraEm <= agora),
    )
    const criadoEm = reassociada || reativada ? agora : (anterior?.criadoEm ?? agora)

    // Nada mudou: o cliente só reenviou o que já temos (toda montagem da home
    // fazia isso — W2-2). Sem UPDATE e sem auditoria; `criadoEm` intocado,
    // porque é o cursor do fan-out.
    const expiraEmEntrada =
      entrada.expirationTime === null ? null : new Date(entrada.expirationTime)
    if (
      anterior &&
      !reassociada &&
      !reativada &&
      anterior.chaveP256dh === entrada.keys.p256dh &&
      anterior.chaveAuth === entrada.keys.auth &&
      (anterior.expiraEm?.getTime() ?? null) === (expiraEmEntrada?.getTime() ?? null)
    ) {
      return { id: anterior.id, criada: false, reassociada: false }
    }

    const [inscricao] = await tx
      .insert(pushInscricoes)
      .values({
        usuarioId: sessao.usuarioId,
        dispositivoId: sessao.dispositivoId,
        endpoint: entrada.endpoint,
        chaveP256dh: entrada.keys.p256dh,
        chaveAuth: entrada.keys.auth,
        expiraEm: expiraEmEntrada,
        invalidadaEm: null,
        motivoInvalidacao: null,
        criadoEm,
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: pushInscricoes.endpoint,
        set: {
          usuarioId: sessao.usuarioId,
          dispositivoId: sessao.dispositivoId,
          chaveP256dh: entrada.keys.p256dh,
          chaveAuth: entrada.keys.auth,
          expiraEm: expiraEmEntrada,
          invalidadaEm: null,
          motivoInvalidacao: null,
          criadoEm,
          atualizadoEm: agora,
        },
      })
      .returning({ id: pushInscricoes.id })

    if (!inscricao) throw new Error('não foi possível registrar a inscrição Push')

    const acao = !anterior
      ? 'CRIADA'
      : reassociada
        ? 'REASSOCIADA'
        : reativada
          ? 'REATIVADA'
          : 'ATUALIZADA'

    await tx.insert(pushInscricoesAuditoria).values({
      inscricaoId: inscricao.id,
      acao,
      usuarioAnteriorId: anterior?.usuarioId ?? null,
      usuarioAtualId: sessao.usuarioId,
      dispositivoAnteriorId: anterior?.dispositivoId ?? null,
      dispositivoAtualId: sessao.dispositivoId,
      ocorridoEm: agora,
    })

    return { id: inscricao.id, criada: !anterior, reassociada }
  })
}

export async function invalidarInscricoesDoDispositivo(
  db: Db,
  usuarioId: string,
  dispositivoId: string,
  motivo: string,
  agora = new Date(),
): Promise<number> {
  return db.transaction((tx) =>
    invalidarInscricoesDoDispositivoNaTransacao(tx, usuarioId, dispositivoId, motivo, agora),
  )
}

export async function invalidarInscricoesDoDispositivoNaTransacao(
  db: Db,
  usuarioId: string,
  dispositivoId: string,
  motivo: string,
  agora = new Date(),
): Promise<number> {
  const invalidadas = await db
    .update(pushInscricoes)
    .set({ invalidadaEm: agora, motivoInvalidacao: motivo, atualizadoEm: agora })
    .where(
      and(
        eq(pushInscricoes.usuarioId, usuarioId),
        eq(pushInscricoes.dispositivoId, dispositivoId),
        isNull(pushInscricoes.invalidadaEm),
      ),
    )
    .returning({ id: pushInscricoes.id, dispositivoId: pushInscricoes.dispositivoId })

  if (invalidadas.length > 0) {
    await db.insert(pushInscricoesAuditoria).values(
      invalidadas.map((inscricao) => ({
        inscricaoId: inscricao.id,
        acao: 'INVALIDADA',
        usuarioAnteriorId: usuarioId,
        usuarioAtualId: usuarioId,
        dispositivoAnteriorId: inscricao.dispositivoId,
        dispositivoAtualId: inscricao.dispositivoId,
        ocorridoEm: agora,
      })),
    )
  }

  return invalidadas.length
}

export async function invalidarInscricoes(
  db: Db,
  ids: string[],
  motivo: string,
  agora = new Date(),
): Promise<number> {
  if (ids.length === 0) return 0
  return db.transaction(async (tx) => {
    const atualizadas = await tx
      .update(pushInscricoes)
      .set({ invalidadaEm: agora, motivoInvalidacao: motivo, atualizadoEm: agora })
      .where(and(inArray(pushInscricoes.id, ids), isNull(pushInscricoes.invalidadaEm)))
      .returning({
        id: pushInscricoes.id,
        usuarioId: pushInscricoes.usuarioId,
        dispositivoId: pushInscricoes.dispositivoId,
      })
    if (atualizadas.length > 0) {
      await tx.insert(pushInscricoesAuditoria).values(
        atualizadas.map((inscricao) => ({
          inscricaoId: inscricao.id,
          acao: 'INVALIDADA',
          usuarioAnteriorId: inscricao.usuarioId,
          usuarioAtualId: inscricao.usuarioId,
          dispositivoAnteriorId: inscricao.dispositivoId,
          dispositivoAtualId: inscricao.dispositivoId,
          ocorridoEm: agora,
        })),
      )
    }
    return atualizadas.length
  })
}

export async function preferenciasPushDoUsuario(
  db: Db,
  usuarioId: string,
): Promise<PreferenciasPush> {
  const linhas = await db
    .select({
      canal: preferenciasNotificacao.canal,
      habilitado: preferenciasNotificacao.habilitado,
    })
    .from(preferenciasNotificacao)
    .where(eq(preferenciasNotificacao.usuarioId, usuarioId))

  const resultado = { ...PREFERENCIAS_PADRAO }
  for (const linha of linhas) resultado[linha.canal] = linha.habilitado
  return resultado
}

export async function atualizarPreferenciaPush(
  db: Db,
  usuarioId: string,
  entrada: z.infer<typeof schemaPreferenciaPush>,
  agora = new Date(),
): Promise<PreferenciasPush> {
  await db
    .insert(preferenciasNotificacao)
    .values({
      usuarioId,
      canal: entrada.canal,
      habilitado: entrada.habilitado,
      criadoEm: agora,
      atualizadoEm: agora,
    })
    .onConflictDoUpdate({
      target: [preferenciasNotificacao.usuarioId, preferenciasNotificacao.canal],
      set: { habilitado: entrada.habilitado, atualizadoEm: agora },
    })
  return preferenciasPushDoUsuario(db, usuarioId)
}
