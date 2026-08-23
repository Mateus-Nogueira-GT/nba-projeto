import { eq } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  dispositivos,
  preferenciasNotificacao,
  pushInscricoes,
  pushInscricoesAuditoria,
  sessoes,
  usuarios,
} from '../../dominio/db/schema'
import type { Sessao } from '../auth/sessao'
import { encerrarSessaoPorToken } from '../auth/sessao'
import {
  atualizarPreferenciaPush,
  invalidarInscricoesDoDispositivo,
  preferenciasPushDoUsuario,
  registrarInscricaoPush,
  schemaInscricaoPush,
} from '../push/inscricoes'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

async function criarSessao(email: string, fingerprint: string): Promise<Sessao> {
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email, senhaHash: 'hash-de-teste' })
    .returning()
  const [dispositivo] = await banco.db
    .insert(dispositivos)
    .values({
      usuarioId: usuario!.id,
      fingerprint,
      tipo: 'DESKTOP',
      userAgent: null,
      ipUltimo: null,
    })
    .returning()

  return {
    usuarioId: usuario!.id,
    email,
    papel: 'USUARIO',
    sessaoId: crypto.randomUUID(),
    dispositivoId: dispositivo!.id,
    criadaEm: new Date('2026-08-21T12:00:00.000Z'),
  }
}

const entrada = {
  endpoint: 'https://fcm.googleapis.com/wp/opaque-token',
  expirationTime: null,
  keys: {
    p256dh: 'A'.repeat(65),
    auth: 'B'.repeat(22),
  },
}

beforeEach(async () => {
  banco = await bancoDeTeste()
})

afterEach(async () => {
  await banco.fechar()
})

describe('inscrições Web Push', () => {
  it('valida um contrato fechado e não aceita IDs definidos pelo cliente', () => {
    expect(schemaInscricaoPush.safeParse(entrada).success).toBe(true)
    expect(
      schemaInscricaoPush.safeParse({ ...entrada, usuarioId: crypto.randomUUID() }).success,
    ).toBe(false)
    expect(
      schemaInscricaoPush.safeParse({ ...entrada, endpoint: 'http://push.test/x' }).success,
    ).toBe(false)
    expect(
      schemaInscricaoPush.safeParse({ ...entrada, endpoint: 'https://127.0.0.1/admin' }).success,
    ).toBe(false)
  })

  it('faz upsert idempotente e audita a reassociação sem duplicar endpoint', async () => {
    const primeira = await criarSessao('um@example.com', 'um')
    const segunda = await criarSessao('dois@example.com', 'dois')
    const agora = new Date('2026-08-21T15:00:00Z')

    expect(await registrarInscricaoPush(banco.db, primeira, entrada, agora)).toMatchObject({
      criada: true,
      reassociada: false,
    })
    expect(await registrarInscricaoPush(banco.db, primeira, entrada, agora)).toMatchObject({
      criada: false,
      reassociada: false,
    })
    expect(await registrarInscricaoPush(banco.db, segunda, entrada, agora)).toMatchObject({
      criada: false,
      reassociada: true,
    })

    const linhas = await banco.db.select().from(pushInscricoes)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      usuarioId: segunda.usuarioId,
      dispositivoId: segunda.dispositivoId,
      invalidadaEm: null,
    })

    const auditoria = await banco.db.select().from(pushInscricoesAuditoria)
    expect(auditoria.map((item) => item.acao)).toEqual(['CRIADA', 'ATUALIZADA', 'REASSOCIADA'])
  })

  it('serializa cadastros concorrentes do mesmo endpoint e preserva a auditoria', async () => {
    const primeira = await criarSessao('concorrente-um@example.com', 'concorrente-um')
    const segunda = await criarSessao('concorrente-dois@example.com', 'concorrente-dois')

    await Promise.all([
      registrarInscricaoPush(banco.db, primeira, entrada),
      registrarInscricaoPush(banco.db, segunda, entrada),
    ])

    const linhas = await banco.db.select().from(pushInscricoes)
    const auditoria = await banco.db.select().from(pushInscricoesAuditoria)
    expect(linhas).toHaveLength(1)
    expect(auditoria.map((item) => item.acao).sort()).toEqual(['CRIADA', 'REASSOCIADA'])
  })

  it('invalida todas as inscrições do dispositivo sem apagar a auditoria', async () => {
    const sessao = await criarSessao('um@example.com', 'um')
    await registrarInscricaoPush(banco.db, sessao, entrada)
    await registrarInscricaoPush(banco.db, sessao, {
      ...entrada,
      endpoint: 'https://fcm.googleapis.com/wp/segundo-token',
    })

    expect(
      await invalidarInscricoesDoDispositivo(
        banco.db,
        sessao.usuarioId,
        sessao.dispositivoId!,
        'logout',
        new Date('2026-08-21T16:00:00Z'),
      ),
    ).toBe(2)
    expect(
      await invalidarInscricoesDoDispositivo(
        banco.db,
        sessao.usuarioId,
        sessao.dispositivoId!,
        'retry',
      ),
    ).toBe(0)

    const linhas = await banco.db.select().from(pushInscricoes)
    expect(linhas.every((item) => item.invalidadaEm !== null)).toBe(true)
  })

  it('logout revoga sessão e inscrições do dispositivo na mesma transação', async () => {
    const sessao = await criarSessao('um@example.com', 'um')
    const token = 'token-secreto-do-teste'
    await banco.db.insert(sessoes).values({
      usuarioId: sessao.usuarioId,
      dispositivoId: sessao.dispositivoId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      criadaEm: new Date('2026-08-21T12:00:00Z'),
      expiraEm: new Date('2026-09-21T12:00:00Z'),
    })
    await registrarInscricaoPush(banco.db, sessao, entrada)

    await expect(
      encerrarSessaoPorToken(
        banco.db,
        token,
        'logout solicitado pelo usuário',
        new Date('2026-08-21T13:00:00Z'),
      ),
    ).resolves.toBe(true)

    const [inscricao] = await banco.db.select().from(pushInscricoes)
    expect(inscricao?.invalidadaEm).not.toBeNull()
    expect(inscricao?.motivoInvalidacao).toBe('logout solicitado pelo usuário')
  })
})

describe('preferências Web Push', () => {
  it('retorna defaults explícitos e persiste canais independentemente', async () => {
    const sessao = await criarSessao('um@example.com', 'um')
    expect(await preferenciasPushDoUsuario(banco.db, sessao.usuarioId)).toEqual({
      FIRE_LIVE_APITO: true,
      GREEN: true,
      LISTA_SECRETA: true,
    })

    expect(
      await atualizarPreferenciaPush(banco.db, sessao.usuarioId, {
        canal: 'GREEN',
        habilitado: false,
      }),
    ).toEqual({ FIRE_LIVE_APITO: true, GREEN: false, LISTA_SECRETA: true })

    const [green] = await banco.db
      .select()
      .from(preferenciasNotificacao)
      .where(eq(preferenciasNotificacao.canal, 'GREEN'))
    expect(green?.habilitado).toBe(false)
  })
})
