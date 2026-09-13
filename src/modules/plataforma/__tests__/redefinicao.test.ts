import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { dispositivos, eventosConta, pushInscricoes, redefinicoesSenha, sessoes, usuarios } from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { conferirSenha } from '../auth/senha'
import { autenticar, type DadosAcesso } from '../auth/sessao'
import { concluirRedefinicao, emitirRedefinicao, VALIDADE_DA_REDEFINICAO_MS } from '../auth/redefinicao'

/**
 * REDEFINIÇÃO DE SENHA POR LINK DO ADMIN (Task 7).
 *
 * Sem provedor de e-mail, quem esquece a senha depende de um link que o
 * admin emite por fora. O token em claro só existe no link devolvido por
 * `emitirRedefinicao` — no banco fica só o hash, e o teste confere isso
 * diretamente na linha gravada. `concluirRedefinicao` é uso único e validade
 * curta: segundo uso, token desconhecido e expiração têm cada um seu motivo,
 * e nenhum deles troca coisa alguma.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

const EMAIL = 'esqueceu@exemplo.com'
const SENHA_ANTIGA = 'senha-antiga-12'
let usuarioId: string

function acesso(fingerprint: string): DadosAcesso {
  return { fingerprint, tipo: 'DESKTOP', userAgent: 'teste', ip: '203.0.113.20' }
}

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())

beforeEach(async () => {
  await banco.db.delete(pushInscricoes)
  await banco.db.delete(eventosConta)
  await banco.db.delete(sessoes)
  await banco.db.delete(dispositivos)
  await banco.db.delete(redefinicoesSenha)
  await banco.db.delete(usuarios)
  const criado = await adicionarUsuario(banco.db, { email: EMAIL, senha: SENHA_ANTIGA, nome: 'Dono' })
  usuarioId = criado.id
})

describe('redefinição de senha por token', () => {
  it('emite um token que não fica em claro no banco, e concluir troca a senha e queima o token', async () => {
    const agora = new Date('2026-09-12T12:00:00Z')
    const { token, expiraEm } = await emitirRedefinicao(banco.db, {
      usuarioId,
      criadaPorId: null,
      agora,
    })
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(expiraEm.getTime() - agora.getTime()).toBe(VALIDADE_DA_REDEFINICAO_MS)
    const [linha] = await banco.db.select().from(redefinicoesSenha)
    expect(linha!.tokenHash).not.toContain(token)

    expect(
      await concluirRedefinicao(banco.db, { token, novaSenha: 'nova-senha-forte-12', agora }),
    ).toEqual({ ok: true })
    const [u] = await banco.db
      .select({ senhaHash: usuarios.senhaHash })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
    expect(await conferirSenha('nova-senha-forte-12', u!.senhaHash)).toBe(true)

    expect(
      await concluirRedefinicao(banco.db, { token, novaSenha: 'outra-senha-forte-12', agora }),
    ).toEqual({ ok: false, motivo: 'usada' })
  })

  it('duas conclusões concorrentes com o MESMO token: só uma vence, e a senha final é a dela', async () => {
    // Fix round 1: a corrida era real — o SELECT que conferia `usadaEm` rodava
    // fora da transação, então dois `POST`s simultâneos passavam os dois pela
    // checagem, os dois entravam na transação, e o Postgres só serializava no
    // lock da linha (não recusava o segundo). `Promise.all` dispara os dois de
    // propósito, para que a corrida de verdade aconteça — não uma chamada
    // depois da outra.
    const agora = new Date('2026-09-12T12:00:00Z')
    const { token } = await emitirRedefinicao(banco.db, { usuarioId, criadaPorId: null, agora })

    const senhaA = 'senha-concorrente-a1'
    const senhaB = 'senha-concorrente-b1'
    const [resultadoA, resultadoB] = await Promise.all([
      concluirRedefinicao(banco.db, { token, novaSenha: senhaA, agora }),
      concluirRedefinicao(banco.db, { token, novaSenha: senhaB, agora }),
    ])
    const resultados = [resultadoA, resultadoB]

    expect(resultados.filter((r) => r.ok)).toHaveLength(1)
    expect(resultados).toContainEqual({ ok: false, motivo: 'usada' })

    const senhaVencedora = resultadoA.ok ? senhaA : senhaB
    const [u] = await banco.db
      .select({ senhaHash: usuarios.senhaHash })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
    expect(await conferirSenha(senhaVencedora, u!.senhaHash)).toBe(true)
  })

  it('grava quem emitiu quando é um admin de verdade, não só null', async () => {
    const agora = new Date('2026-09-12T12:00:00Z')
    const admin = await adicionarUsuario(banco.db, {
      email: 'admin@exemplo.com',
      senha: 'senha-admin-123',
      papel: 'ADMIN',
    })
    await emitirRedefinicao(banco.db, { usuarioId, criadaPorId: admin.id, agora })
    const [linha] = await banco.db.select().from(redefinicoesSenha)
    expect(linha!.criadaPorId).toBe(admin.id)
  })

  it('token desconhecido, expirado ou senha fora da política não trocam nada', async () => {
    const agora = new Date('2026-09-12T12:00:00Z')
    expect(
      await concluirRedefinicao(banco.db, { token: 'x', novaSenha: 'nova-senha-forte-12', agora }),
    ).toEqual({ ok: false, motivo: 'token' })

    const { token } = await emitirRedefinicao(banco.db, { usuarioId, criadaPorId: null, agora })
    expect(await concluirRedefinicao(banco.db, { token, novaSenha: 'curta', agora })).toEqual({
      ok: false,
      motivo: 'senha',
    })

    const depois = new Date(agora.getTime() + VALIDADE_DA_REDEFINICAO_MS + 1)
    expect(
      await concluirRedefinicao(banco.db, { token, novaSenha: 'nova-senha-forte-12', agora: depois }),
    ).toEqual({ ok: false, motivo: 'expirada' })
  })

  it('concluir encerra todas as sessões abertas do usuário — senha nova, sessões antigas fora', async () => {
    const agora = new Date('2026-09-12T12:00:00Z')
    await autenticar(banco.db, { email: EMAIL, senha: SENHA_ANTIGA }, acesso('fp-1'), agora)

    const { token } = await emitirRedefinicao(banco.db, { usuarioId, criadaPorId: null, agora })
    expect(
      await concluirRedefinicao(banco.db, { token, novaSenha: 'nova-senha-forte-12', agora }),
    ).toEqual({ ok: true })

    const abertas = await banco.db
      .select()
      .from(sessoes)
      .where(and(eq(sessoes.usuarioId, usuarioId), isNull(sessoes.encerradaEm)))
    expect(abertas).toHaveLength(0)
  })
})
