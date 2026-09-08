import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { jogadores, usuarios } from '@/modules/dominio/db/schema'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { GET, PATCH } from '../experiencia/route'
import { PUT as acompanhar } from '../acompanhamento/route'
import { PUT as silenciar } from '../alertas/route'

const mocks = vi.hoisted(() => ({ db: vi.fn(), sessao: vi.fn() }))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: mocks.db }))
vi.mock('@/modules/plataforma/auth/cookies', () => ({ sessaoAtual: mocks.sessao }))
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioA: string
let usuarioB: string
let jogadorId: string
function req(corpo: unknown, metodo = 'PUT', headers: Record<string, string> = {}) {
  return new Request('https://app.test/api/preferencias/experiencia', {
    method: metodo,
    headers: { origin: 'https://app.test', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(corpo),
  })
}
beforeAll(async () => {
  banco = await bancoDeTeste()
  const us = await banco.db
    .insert(usuarios)
    .values([
      { email: 'api-a@teste.com', senhaHash: 'x' },
      { email: 'api-b@teste.com', senhaHash: 'x' },
    ])
    .returning()
  usuarioA = us[0]!.id
  usuarioB = us[1]!.id
  jogadorId = (await banco.db.insert(jogadores).values({ nomeCompleto: 'Alvo' }).returning())[0]!.id
})
beforeEach(() => {
  mocks.db.mockReturnValue(banco.db)
  mocks.sessao.mockResolvedValue({ usuarioId: usuarioA })
})
afterAll(async () => {
  await banco?.fechar()
})

describe('preferências autenticadas', () => {
  it('todas as rotas exigem sessão', async () => {
    mocks.sessao.mockResolvedValue(null)
    for (const resposta of [
      await GET(),
      await PATCH(req({ volume: 10 }, 'PATCH')),
      await acompanhar(req({})),
      await silenciar(req({})),
    ])
      expect(resposta.status).toBe(401)
  })
  it('GET privado devolve defaults e PATCH persiste só a conta da sessão', async () => {
    const resposta = await GET()
    expect(resposta.headers.get('cache-control')).toContain('no-store')
    expect((await resposta.json()).estado.preferencias.volume).toBe(50)
    expect((await PATCH(req({ volume: 20, somHabilitado: false }, 'PATCH'))).status).toBe(200)
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioA)).preferencias.volume).toBe(20)
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioB)).preferencias.volume).toBe(50)
  })
  it('não aceita usuário injetado, identificador inválido ou volume fora do limite', async () => {
    expect((await PATCH(req({ usuarioId: usuarioB, volume: 80 }, 'PATCH'))).status).toBe(400)
    expect((await PATCH(req({ volume: 101 }, 'PATCH'))).status).toBe(400)
    expect(
      (await acompanhar(req({ tipo: 'JOGADOR', id: 'invalido', acompanhar: true }))).status,
    ).toBe(400)
    expect(
      (
        await silenciar(
          req({ tipo: 'ATRIBUTO', id: 'PONTOS', silenciado: true, usuarioId: usuarioB }),
        )
      ).status,
    ).toBe(400)
  })
  it('acompanhamento e exclusão retornam o estado confirmado, aceitam retry e isolam B', async () => {
    const entrada = { tipo: 'JOGADOR', id: jogadorId, acompanhar: true }
    expect((await acompanhar(req(entrada))).status).toBe(200)
    const repetida = await acompanhar(req(entrada))
    expect((await repetida.json()).estado.jogadoresAcompanhados).toEqual([jogadorId])
    const excluida = await silenciar(req({ tipo: 'JOGADOR', id: jogadorId, silenciado: true }))
    expect((await excluida.json()).estado.jogadoresSilenciados).toEqual([jogadorId])
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioB)).jogadoresAcompanhados).toEqual([])
    expect((await estadoExperienciaDoUsuario(banco.db, usuarioB)).jogadoresSilenciados).toEqual([])
  })
  it('alvo válido porém inexistente retorna404', async () => {
    expect(
      (
        await acompanhar(
          req({ tipo: 'TIME', id: '11111111-1111-4111-8111-111111111111', acompanhar: true }),
        )
      ).status,
    ).toBe(404)
  })
  it('protege origem, formato e tamanho em cada mutação', async () => {
    for (const rota of [PATCH, acompanhar, silenciar]) {
      expect((await rota(req({}, 'PUT', { origin: 'https://evil.test' }))).status).toBe(403)
      expect((await rota(req({}, 'PUT', { 'content-type': 'text/plain' }))).status).toBe(415)
      expect((await rota(req({}, 'PUT', { 'content-length': '9000' }))).status).toBe(413)
    }
  })
})
