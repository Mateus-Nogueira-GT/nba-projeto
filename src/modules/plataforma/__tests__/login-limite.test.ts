import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { tentativasLogin, usuarios } from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { autenticar } from '../auth/sessao'

/**
 * O LIMITE DE LOGIN SOB PARALELISMO E POR IP (auditoria de 23/09).
 *
 * O contador era lido ANTES de gravar a tentativa: N logins em paralelo liam
 * a mesma contagem zerada e passavam todos. E não havia teto por IP — uma
 * lista de e-mails testada de um lugar só não tinha freio nenhum.
 */

const AGORA = new Date('2026-10-02T15:00:00.000Z')
const acesso = (ip: string) => ({
  fingerprint: `fp-${ip}`,
  tipo: 'DESKTOP' as const,
  userAgent: null,
  ip,
})

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())
beforeEach(async () => {
  await banco.db.delete(tentativasLogin)
  await banco.db.delete(usuarios)
  await adicionarUsuario(banco.db, {
    email: 'alvo@exemplo.com',
    senha: 'senha-segura-123',
    nome: 'Alvo',
  })
})

describe('limite de login', () => {
  it('20 tentativas erradas em paralelo: no máximo 5 chegam a conferir a senha', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () =>
        autenticar(
          banco.db,
          { email: 'alvo@exemplo.com', senha: 'errada' },
          acesso('9.9.9.9'),
          AGORA,
        ),
      ),
    )
    const conferidas = resultados.filter((r) => !r.ok && r.motivo === 'credenciais').length
    expect(conferidas).toBeLessThanOrEqual(5)
  }, 60_000)

  it('a 51ª falha do mesmo IP é barrada, mesmo em e-mails diferentes', async () => {
    for (let n = 0; n < 50; n++) {
      await autenticar(
        banco.db,
        { email: `x${n}@exemplo.com`, senha: 'errada' },
        acesso('7.7.7.7'),
        AGORA,
      )
    }
    const r = await autenticar(
      banco.db,
      { email: 'y@exemplo.com', senha: 'errada' },
      acesso('7.7.7.7'),
      AGORA,
    )
    expect(r).toEqual({ ok: false, motivo: 'excesso-de-tentativas' })
  }, 60_000)

  it('atrás do CGNAT, quem erra uma vez e acerta depois entra', async () => {
    // Outras 20 pessoas do mesmo IP erraram a senha na janela: bem abaixo do
    // teto de 50, e o acerto desta pessoa não pode ser barrado por elas.
    for (let n = 0; n < 20; n++) {
      await autenticar(
        banco.db,
        { email: `x${n}@exemplo.com`, senha: 'errada' },
        acesso('7.7.7.7'),
        AGORA,
      )
    }
    await autenticar(
      banco.db,
      { email: 'alvo@exemplo.com', senha: 'errada' },
      acesso('7.7.7.7'),
      AGORA,
    )
    const r = await autenticar(
      banco.db,
      { email: 'alvo@exemplo.com', senha: 'senha-segura-123' },
      acesso('7.7.7.7'),
      AGORA,
    )
    expect(r.ok).toBe(true)
  }, 60_000)

  it('insistir durante o bloqueio do IP não o prolonga: vencida a janela, o acerto entra', async () => {
    // Um CGNAT que passou do teto continua recebendo logins durante o bloqueio.
    // Se a tentativa barrada contasse como falha, o IP nunca destravaria.
    for (let n = 0; n < 51; n++) {
      await autenticar(
        banco.db,
        { email: `x${n}@exemplo.com`, senha: 'errada' },
        acesso('7.7.7.7'),
        AGORA,
      )
    }
    const durante = new Date(AGORA.getTime() + 10 * 60_000)
    for (let n = 0; n < 60; n++) {
      await autenticar(
        banco.db,
        { email: `z${n}@exemplo.com`, senha: 'errada' },
        acesso('7.7.7.7'),
        durante,
      )
    }
    const depois = new Date(AGORA.getTime() + 15 * 60_000 + 1_000)
    const r = await autenticar(
      banco.db,
      { email: 'alvo@exemplo.com', senha: 'senha-segura-123' },
      acesso('7.7.7.7'),
      depois,
    )
    expect(r.ok).toBe(true)
  }, 60_000)

  it('insistir durante o bloqueio do e-mail não o prolonga', async () => {
    for (let n = 0; n < 6; n++) {
      await autenticar(
        banco.db,
        { email: 'alvo@exemplo.com', senha: 'errada' },
        acesso('8.8.8.8'),
        AGORA,
      )
    }
    const durante = new Date(AGORA.getTime() + 10 * 60_000)
    for (let n = 0; n < 6; n++) {
      await autenticar(
        banco.db,
        { email: 'alvo@exemplo.com', senha: 'errada' },
        acesso('8.8.8.8'),
        durante,
      )
    }
    const depois = new Date(AGORA.getTime() + 15 * 60_000 + 1_000)
    const r = await autenticar(
      banco.db,
      { email: 'alvo@exemplo.com', senha: 'senha-segura-123' },
      acesso('8.8.8.8'),
      depois,
    )
    expect(r.ok).toBe(true)
  }, 60_000)
})
