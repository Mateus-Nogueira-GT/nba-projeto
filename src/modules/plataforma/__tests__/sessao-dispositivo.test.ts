import { asc, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { dispositivos, eventosConta, pushInscricoes, sessoes, usuarios } from '../../dominio/db/schema'
import { adicionarUsuario } from '../admin/usuarios'
import { registrarInscricaoPush } from '../push/inscricoes'
import { autenticar, encerrarSessoesDoDispositivo, type DadosAcesso } from '../auth/sessao'

/**
 * "ENCERRAR SESSÃO" POR DISPOSITIVO — perfil, segurança (Task 5).
 *
 * `encerrarSessoesDoDispositivo` é chamada a partir de um formulário: o
 * `dispositivoId` vem do cliente, então o teste trava o escopo por
 * `usuarioId` explicitamente — sem ele, colar o id de outra pessoa encerraria
 * a sessão dela.
 *
 * Fix round 1: a revisão achou que a função encerrava a sessão mas deixava o
 * push do aparelho aberto — quem perde o celular e encerra a sessão dele
 * continuaria recebendo apito ali. Os testes abaixo travam os TRÊS efeitos da
 * mesma transação: sessão encerrada, push daquele dispositivo invalidado (o
 * do outro não), e evento de auditoria gravado.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

const SENHA = 'senha-de-teste-123'
const EMAIL = 'dispositivo@exemplo.com'
const T0 = new Date('2026-09-12T20:00:00.000Z')

const INSCRICAO_PUSH = {
  expirationTime: null,
  keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(22) },
}

function acesso(fingerprint: string): DadosAcesso {
  return { fingerprint, tipo: 'MOBILE', userAgent: 'teste', ip: '203.0.113.10' }
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
  await banco.db.delete(usuarios)
  await adicionarUsuario(banco.db, { email: EMAIL, senha: SENHA, nome: 'Dono' })
})

describe('encerrarSessoesDoDispositivo', () => {
  it('encerra só as sessões daquele dispositivo, e só se ele for do usuário', async () => {
    await autenticar(banco.db, { email: EMAIL, senha: SENHA }, acesso('fp-1'), T0)
    await autenticar(banco.db, { email: EMAIL, senha: SENHA }, acesso('fp-2'), T0)

    const [d1, d2] = await banco.db
      .select({ id: dispositivos.id, usuarioId: dispositivos.usuarioId })
      .from(dispositivos)
      .orderBy(asc(dispositivos.fingerprint))

    const encerradas = await encerrarSessoesDoDispositivo(banco.db, d1!.usuarioId, d1!.id, 'usuario', T0)
    expect(encerradas).toBe(1)

    const abertas = await banco.db.select().from(sessoes).where(isNull(sessoes.encerradaEm))
    expect(abertas.map((s) => s.dispositivoId)).toEqual([d2!.id])

    const [encerrada] = await banco.db
      .select()
      .from(sessoes)
      .where(eq(sessoes.dispositivoId, d1!.id))
    expect(encerrada?.motivoEncerramento).toBe('usuario')
    expect(encerrada?.encerradaEm).toEqual(T0)

    // outro usuário não encerra o que não é dele
    expect(
      await encerrarSessoesDoDispositivo(
        banco.db,
        '00000000-0000-4000-8000-000000000099',
        d2!.id,
        'usuario',
        T0,
      ),
    ).toBe(0)
    expect(
      (await banco.db.select().from(sessoes).where(isNull(sessoes.encerradaEm))).map(
        (s) => s.dispositivoId,
      ),
    ).toEqual([d2!.id])
  })

  it('invalida o push do dispositivo encerrado, mantém o do outro, e grava o evento de auditoria', async () => {
    const login1 = await autenticar(banco.db, { email: EMAIL, senha: SENHA }, acesso('fp-push-1'), T0)
    const login2 = await autenticar(banco.db, { email: EMAIL, senha: SENHA }, acesso('fp-push-2'), T0)
    if (!login1.ok || !login2.ok) throw new Error('login deveria funcionar neste teste')

    await registrarInscricaoPush(
      banco.db,
      { usuarioId: login1.usuarioId, dispositivoId: login1.dispositivoId },
      { ...INSCRICAO_PUSH, endpoint: 'https://fcm.googleapis.com/wp/dispositivo-encerrado' },
      T0,
    )
    await registrarInscricaoPush(
      banco.db,
      { usuarioId: login2.usuarioId, dispositivoId: login2.dispositivoId },
      { ...INSCRICAO_PUSH, endpoint: 'https://fcm.googleapis.com/wp/dispositivo-que-fica' },
      T0,
    )

    const agora = new Date('2026-09-12T20:05:00.000Z')
    const encerradas = await encerrarSessoesDoDispositivo(
      banco.db,
      login1.usuarioId,
      login1.dispositivoId,
      'usuario',
      agora,
    )
    expect(encerradas).toBe(1)

    // Sem isto, quem perde o celular e encerra a sessão dele continuaria
    // recebendo apito por push ali — a navegação para, o push não.
    const inscricoes = await banco.db
      .select({ dispositivoId: pushInscricoes.dispositivoId, invalidadaEm: pushInscricoes.invalidadaEm })
      .from(pushInscricoes)
    const doEncerrado = inscricoes.find((i) => i.dispositivoId === login1.dispositivoId)
    const doOutro = inscricoes.find((i) => i.dispositivoId === login2.dispositivoId)
    expect(doEncerrado?.invalidadaEm).toEqual(agora)
    expect(doOutro?.invalidadaEm).toBeNull()

    const eventos = await banco.db
      .select()
      .from(eventosConta)
      .where(eq(eventosConta.tipo, 'SESSAO_ENCERRADA'))
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.usuarioId).toBe(login1.usuarioId)
    expect(eventos[0]?.detalhe).toBe('usuario')
  })

  it('nenhuma sessão encerrada (dispositivo alheio ou já sem sessão viva) não mexe em push nem grava evento', async () => {
    const login = await autenticar(banco.db, { email: EMAIL, senha: SENHA }, acesso('fp-noop'), T0)
    if (!login.ok) throw new Error('login deveria funcionar neste teste')
    await registrarInscricaoPush(
      banco.db,
      { usuarioId: login.usuarioId, dispositivoId: login.dispositivoId },
      { ...INSCRICAO_PUSH, endpoint: 'https://fcm.googleapis.com/wp/intocado' },
      T0,
    )

    const encerradas = await encerrarSessoesDoDispositivo(
      banco.db,
      '00000000-0000-4000-8000-000000000099',
      login.dispositivoId,
      'usuario',
      T0,
    )
    expect(encerradas).toBe(0)

    const [inscricao] = await banco.db.select().from(pushInscricoes)
    expect(inscricao?.invalidadaEm).toBeNull()
    // `autenticar` já grava seu próprio evento 'LOGIN' — o que este teste
    // trava é que NENHUM 'SESSAO_ENCERRADA' nasce de uma operação que não
    // encerrou sessão nenhuma.
    expect(
      await banco.db.select().from(eventosConta).where(eq(eventosConta.tipo, 'SESSAO_ENCERRADA')),
    ).toHaveLength(0)
  })
})
