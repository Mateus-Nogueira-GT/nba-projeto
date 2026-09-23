import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { dispositivos } from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { autenticar, validarSessao } from '../auth/sessao'

/**
 * UMA ESCRITA POR VISUALIZAÇÃO ERA DEMAIS (auditoria de 23/09).
 *
 * `validarSessao` regravava `dispositivos.ultimo_uso` a cada requisição — ~80
 * escritas por segundo com 2 mil usuários — para um dado que só alimenta a
 * detecção de uso simultâneo, com janela de 5 min.
 */

const T0 = new Date('2026-10-02T15:00:00.000Z')
const depois = (ms: number) => new Date(T0.getTime() + ms)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

describe('último uso do dispositivo', () => {
  it('só grava de novo depois de 60 s', async () => {
    await adicionarUsuario(banco.db, {
      email: 'uso@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Uso',
    })
    const login = await autenticar(
      banco.db,
      { email: 'uso@exemplo.com', senha: 'senha-segura-123' },
      { fingerprint: 'fp-1', tipo: 'DESKTOP', userAgent: null, ip: '1.1.1.1' },
      T0,
    )
    if (!login.ok) throw new Error('login deveria passar')
    const ultimo = async () =>
      (await banco.db.select().from(dispositivos).where(eq(dispositivos.id, login.dispositivoId)))[0]!
        .ultimoUso

    await validarSessao(banco.db, login.token, depois(30_000), { ip: '1.1.1.1' })
    expect((await ultimo())?.toISOString()).toBe(T0.toISOString())

    await validarSessao(banco.db, login.token, depois(61_000), { ip: '1.1.1.1' })
    expect((await ultimo())?.toISOString()).toBe(depois(61_000).toISOString())
  })

  it('sessaoAtual é memorizada por requisição', () => {
    const fonte = readFileSync('src/modules/plataforma/auth/cookies.ts', 'utf8')
    expect(fonte).toMatch(/import \{ cache \} from 'react'/)
    expect(fonte).toMatch(/export const sessaoAtual = cache\(/)
  })
})
