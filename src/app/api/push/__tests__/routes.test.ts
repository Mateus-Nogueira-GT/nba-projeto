import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sessaoAtual: vi.fn(),
  registrar: vi.fn(),
  invalidar: vi.fn(),
  preferencias: vi.fn(),
  atualizar: vi.fn(),
  db: { teste: true },
}))

vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => mocks.db }))
vi.mock('@/modules/plataforma/auth/cookies', () => ({ sessaoAtual: mocks.sessaoAtual }))
vi.mock('@/modules/plataforma/push/inscricoes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/plataforma/push/inscricoes')>()),
  registrarInscricaoPush: mocks.registrar,
  invalidarInscricoesDoDispositivo: mocks.invalidar,
  preferenciasPushDoUsuario: mocks.preferencias,
  atualizarPreferenciaPush: mocks.atualizar,
}))

import { DELETE, POST } from '../inscricoes/route'
import { GET, PATCH } from '../preferencias/route'

const sessao = {
  usuarioId: '00000000-0000-4000-8000-000000000001',
  email: 'teste@example.com',
  papel: 'USUARIO' as const,
  sessaoId: '00000000-0000-4000-8000-000000000002',
  dispositivoId: '00000000-0000-4000-8000-000000000003',
}

const inscricao = {
  endpoint: 'https://fcm.googleapis.com/wp/token',
  expirationTime: null,
  keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(22) },
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = Buffer.alloc(65, 1).toString('base64url')
  process.env.VAPID_PRIVATE_KEY = Buffer.alloc(32, 2).toString('base64url')
  process.env.VAPID_SUBJECT = 'mailto:push@example.test'
  process.env.PUSH_INTERNAL_ALLOWLIST = sessao.email
  mocks.sessaoAtual.mockResolvedValue(sessao)
  mocks.registrar.mockResolvedValue({ id: 'id-opaco', criada: true, reassociada: false })
  mocks.invalidar.mockResolvedValue(1)
  mocks.preferencias.mockResolvedValue({
    FIRE_LIVE_APITO: true,
    GREEN: true,
    LISTA_SECRETA: true,
  })
  mocks.atualizar.mockResolvedValue({
    FIRE_LIVE_APITO: true,
    GREEN: false,
    LISTA_SECRETA: true,
  })
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
  delete process.env.VAPID_SUBJECT
  delete process.env.PUSH_INTERNAL_ALLOWLIST
})

describe('rotas autenticadas de Push', () => {
  it('rejeita todas as operações sem sessão', async () => {
    mocks.sessaoAtual.mockResolvedValue(null)

    expect(
      (
        await POST(
          new Request('https://app.test/api/push/inscricoes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(401)
    expect(
      (await DELETE(new Request('https://app.test/api/push/inscricoes', { method: 'DELETE' })))
        .status,
    ).toBe(401)
    expect((await GET()).status).toBe(401)
    expect(
      (
        await PATCH(
          new Request('https://app.test/api/push/preferencias', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(401)
  })

  it('aceita uma inscrição válida sem usar IDs do cliente', async () => {
    const resposta = await POST(
      new Request('https://app.test/api/push/inscricoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inscricao),
      }),
    )

    expect(resposta.status).toBe(201)
    expect(mocks.registrar).toHaveBeenCalledWith(mocks.db, sessao, inscricao)
  })

  it('rejeita IDs injetados e payload acima do limite antes do banco', async () => {
    const injetado = await POST(
      new Request('https://app.test/api/push/inscricoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...inscricao, usuarioId: sessao.usuarioId }),
      }),
    )
    const grande = await POST(
      new Request('https://app.test/api/push/inscricoes', {
        method: 'POST',
        headers: { 'content-length': '9000', 'content-type': 'application/json' },
        body: '{}',
      }),
    )

    expect(injetado.status).toBe(400)
    expect(grande.status).toBe(413)
    expect(mocks.registrar).not.toHaveBeenCalled()
  })

  it('retorna defaults sem cache e atualiza apenas enum fechado', async () => {
    const leitura = await GET()
    expect(leitura.headers.get('cache-control')).toContain('no-store')

    const atualizada = await PATCH(
      new Request('https://app.test/api/push/preferencias', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canal: 'GREEN', habilitado: false }),
      }),
    )
    const invalida = await PATCH(
      new Request('https://app.test/api/push/preferencias', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canal: 'TODOS', habilitado: true }),
      }),
    )

    expect(atualizada.status).toBe(200)
    expect(invalida.status).toBe(400)
    expect(mocks.atualizar).toHaveBeenCalledTimes(1)
  })
})
