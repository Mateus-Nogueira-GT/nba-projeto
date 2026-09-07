import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { usuarios } from '../../modules/dominio/db/schema'
import { PREFERENCIAS_PADRAO, preferenciasDoUsuario } from '../../modules/plataforma/preferencias'

/**
 * AS SERVER ACTIONS DO SELETOR E DAS LENTES (identidade 04).
 *
 * O caminho inteiro sob teste: `<button name="destino">` → FormData →
 * `estadoDaUrl` (validação campo a campo) → `gravarPreferencias` (conta) →
 * `redirect` para a rota REMONTADA. É a fronteira em que um `destino` forjado
 * poderia virar redirecionamento para fora do app ou gravar valor fora do
 * vocabulário — aqui ela é exercitada de ponta a ponta, com banco de verdade.
 *
 * `next/navigation` e `next/cache` são mocados porque fora de uma requisição
 * do Next eles não existem; o que interessa é PARA ONDE a ação manda e O QUE
 * ela grava.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string
let sessao: { usuarioId: string; email: string } | null = null
const destinos: string[] = []
const revalidados: string[] = []

vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => sessao,
}))
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    destinos.push(destino)
  },
}))
vi.mock('next/cache', () => ({
  revalidatePath: (rota: string) => {
    revalidados.push(rota)
  },
}))

beforeAll(async () => {
  banco = await bancoDeTeste()
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: 'preferencias@teste.com', senhaHash: 'x' })
    .returning({ id: usuarios.id })
  usuarioId = u!.id
  sessao = { usuarioId, email: 'preferencias@teste.com' }
}, 60_000)

afterAll(async () => banco.fechar())

beforeEach(() => {
  destinos.length = 0
  revalidados.length = 0
})

const formulario = (destino: string) => {
  const f = new FormData()
  f.set('destino', destino)
  return f
}

describe('definirOrdem / definirLente — a escolha vira preferência da conta', () => {
  it('grava a ordem escolhida e redireciona para a rota do destino', async () => {
    const { definirOrdem } = await import('../(app)/preferencias/acoes')
    await definirOrdem(formulario('/?ordem=POR_NIVEL'))

    expect((await preferenciasDoUsuario(banco.db, usuarioId)).ordemLista).toBe('POR_NIVEL')
    expect(destinos).toEqual(['/?ordem=POR_NIVEL'])
    expect(revalidados).toEqual(['/'])
  }, 60_000)

  it('grava a lente sem varrer a ordem já gravada — nem o recorte da URL', async () => {
    const { definirLente } = await import('../(app)/preferencias/acoes')
    await definirLente(formulario('/?quantidade=2&metodo=OPD&lente=ODDS'))

    expect(await preferenciasDoUsuario(banco.db, usuarioId)).toEqual({
      ordemLista: 'POR_NIVEL',
      lente: 'ODDS',
    })
    expect(destinos[0]).toContain('quantidade=2')
    expect(destinos[0]).toContain('metodo=OPD')
    expect(destinos[0]).toContain('lente=ODDS')
  }, 60_000)

  it('destino forjado não vira redirect para fora do app nem grava valor inventado', async () => {
    const { definirOrdem, definirLente } = await import('../(app)/preferencias/acoes')
    const antes = await preferenciasDoUsuario(banco.db, usuarioId)

    await definirOrdem(formulario('https://evil.com/?ordem=POR_SORTE'))
    await definirLente(formulario('//evil.com/?lente=RAIO_X'))
    await definirOrdem(formulario('javascript:alert(1)'))

    for (const destino of destinos) {
      expect(destino.startsWith('/'), destino).toBe(true)
      expect(destino).not.toContain('evil.com')
      expect(destino).not.toContain('javascript')
    }
    // valor fora do vocabulário não grava nada: a conta fica como estava
    expect(await preferenciasDoUsuario(banco.db, usuarioId)).toEqual(antes)
  }, 60_000)

  it('sem sessão a ação só navega — nunca grava na conta de ninguém', async () => {
    const { definirLente } = await import('../(app)/preferencias/acoes')
    const antes = await preferenciasDoUsuario(banco.db, usuarioId)
    sessao = null
    try {
      await definirLente(formulario('/?lente=MEDIA_LINHA'))
    } finally {
      sessao = { usuarioId, email: 'preferencias@teste.com' }
    }
    expect(destinos).toEqual(['/?lente=MEDIA_LINHA'])
    expect(await preferenciasDoUsuario(banco.db, usuarioId)).toEqual(antes)
    expect(antes).not.toEqual(PREFERENCIAS_PADRAO)
  }, 60_000)
})
