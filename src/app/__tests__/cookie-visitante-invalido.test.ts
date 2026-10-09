import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { eventosAfiliados } from '../../modules/dominio/db/schema'
import { cenarioDeAfiliados } from '../../modules/plataforma/afiliados/__tests__/cenario'
import { COOKIE_VISITANTE_AFILIADO } from '../../modules/plataforma/afiliados/http'
import { hashVisitante } from '../../modules/plataforma/afiliados/servico'

/**
 * Pente fino de 09/10, achado 7 (spec §2.10): um cookie de visitante fora da
 * forma de `hashVisitante` fazia o registro lançar, e a rota regravava o MESMO
 * valor por mais 30 dias — aquele navegador nunca mais gerava atribuição. Agora
 * o valor inválido vira `novoTokenVisitante()` antes de registrar.
 *
 * Rota de verdade contra o banco de verdade, como `ir-origem.test.ts`.
 */
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
const armario = vi.hoisted(() => ({ valor: undefined as string | undefined }))

vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => null,
}))
vi.mock('next/headers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/headers')>()),
  cookies: async () => ({
    get: (nome: string) =>
      nome === 'nip_afiliado_visitante' && armario.valor !== undefined
        ? { name: nome, value: armario.valor }
        : undefined,
  }),
}))

import { GET as GET_IR } from '../ir/[codigo]/route'
import { GET as GET_R } from '../r/[codigo]/route'

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

beforeEach(() => {
  armario.valor = undefined
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const NAVEGADOR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15'

function pedido(caminho: string) {
  return new Request(`http://local${caminho}`, { headers: { 'user-agent': NAVEGADOR } })
}

/** O valor do cookie de visitante que a resposta grava, ou null. */
function cookieGravado(resposta: Response): string | null {
  const linha = resposta.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${COOKIE_VISITANTE_AFILIADO}=`))
  return linha ? linha.split(';')[0]!.slice(COOKIE_VISITANTE_AFILIADO.length + 1) : null
}

async function eventosDoToken(token: string) {
  return banco.db
    .select()
    .from(eventosAfiliados)
    .where(eq(eventosAfiliados.visitanteHash, hashVisitante(token)))
}

describe('cookie de visitante inválido (pente fino 09/10, achado 7)', () => {
  it('/r com cookie "xx": grava um token novo e registra o CLIQUE nele', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    armario.valor = 'xx'

    const resposta = await GET_R(pedido(`/r/${c.linkB.codigo}`), {
      params: Promise.resolve({ codigo: c.linkB.codigo }),
    })

    const novo = cookieGravado(resposta)
    expect(novo).not.toBeNull()
    expect(novo).not.toBe('xx')
    const eventos = await eventosDoToken(novo!)
    expect(eventos.map((e) => e.tipo)).toContain('CLIQUE')
  })

  it('/ir com cookie "xx": grava um token novo e registra a saída nele', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    armario.valor = 'xx'

    const resposta = await GET_IR(pedido(`/ir/${c.linkA.codigo}`), {
      params: Promise.resolve({ codigo: c.linkA.codigo }),
    })

    const novo = cookieGravado(resposta)
    expect(novo).not.toBeNull()
    expect(novo).not.toBe('xx')
    expect(await eventosDoToken(novo!)).not.toHaveLength(0)
  })

  it('cookie válido continua o mesmo nas duas rotas', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const valido = 'visitante-valido-0123456789'
    armario.valor = valido

    const r = await GET_R(pedido(`/r/${c.linkB.codigo}`), {
      params: Promise.resolve({ codigo: c.linkB.codigo }),
    })
    expect(cookieGravado(r)).toBe(valido)
    await GET_IR(pedido(`/ir/${c.linkA.codigo}`), {
      params: Promise.resolve({ codigo: c.linkA.codigo }),
    })
    expect((await eventosDoToken(valido)).length).toBeGreaterThanOrEqual(2)
  })
})
