import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas, jogadores, usuarios } from '../../modules/dominio/db/schema'
import type { NivelDoPlano } from '../../modules/plataforma/assinatura/nivel-do-plano'

/**
 * A AÇÃO registrarEntrada (Task 10, fix round 1; Task 8 do plano de níveis).
 *
 * Achado da revisão: nada no diff original chamava a ação pelo caminho de
 * verdade — os dois testes de serviço iam direto a `registrarEntradaRealizada`
 * e pulavam o Zod inteiro. Sem esta suíte, os limites de unidades/odd/linha e
 * o portão de sessão não tinham trava nenhuma: um input sem `min` (o de odd,
 * antes deste fix) só seria pego DEPOIS do redirect, e nada provava que era
 * pego ali.
 *
 * Task 8: a tela de gestão passou a exigir só GRATIS (`exigirNivel('GRATIS',
 * ...)`) — quem esconde o formulário é o nível, mas um POST direto no
 * endpoint NUNCA passa pela tela. Por isso a AÇÃO também checa nível, e este
 * arquivo precisa do mesmo mock de acesso mutável que as suítes de tela usam
 * (`nivelNoTeste`), para provar que GRATIS é recusado aqui — no servidor, não
 * só escondido no HTML.
 *
 * Mesmo padrão de `conta-acoes.test.ts`: `redirect()` do Next NUNCA retorna —
 * lança um erro cujo `digest` carrega o destino — então o teste usa o
 * `redirect` de verdade e afirma pelo `.rejects`, e confere o BANCO em
 * seguida, nunca só o redirect.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string
let jogadorId: string
let sessao: { usuarioId: string; email: string; dispositivoId: string | null } | null = null
let nivelNoTeste: NivelDoPlano = 'MVP'

vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => sessao,
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelNoTeste) }
})

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 60_000)

afterAll(async () => banco.fechar())

// Um usuário e um jogador NOVOS por teste: `entradasRealizadas` tem FK para
// os dois, e o teste da entrada válida precisa gravar de verdade.
beforeEach(async () => {
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: `gestao-acoes-${crypto.randomUUID()}@teste.com`, senhaHash: 'x' })
    .returning({ id: usuarios.id })
  usuarioId = u!.id
  const [j] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Jogador de teste da ação' })
    .returning({ id: jogadores.id })
  jogadorId = j!.id
  sessao = { usuarioId, email: 'gestao-acoes@teste.com', dispositivoId: null }
  // Todo teste PRÉ-EXISTENTE presume acesso suficiente — só o caso novo de
  // GRATIS muda isto, e só para si mesmo.
  nivelNoTeste = 'MVP'
})

function formularioValido(sobre: Record<string, string> = {}): FormData {
  const f = new FormData()
  f.set('dataReferencia', '2026-09-05')
  f.set('jogadorId', jogadorId)
  f.set('atributo', 'PONTOS')
  f.set('linha', '20')
  f.set('unidades', '1.5')
  f.set('odd', '1.62')
  for (const [chave, valor] of Object.entries(sobre)) f.set(chave, valor)
  return f
}

async function linhasGravadas() {
  return banco.db.select().from(entradasRealizadas).where(eq(entradasRealizadas.usuarioId, usuarioId))
}

describe('registrarEntrada — a ação por trás do botão "Registrei"', () => {
  it('GRATIS não registra: a ação redireciona para os planos e não grava nada', async () => {
    nivelNoTeste = 'GRATIS'
    const { registrarEntrada } = await import('../../features/gestao/acoes')

    // FormData VÁLIDO — o mesmo que a tela enviaria — exatamente o caminho de
    // um POST direto no endpoint, sem passar pelo formulário escondido.
    await expect(registrarEntrada(formularioValido())).rejects.toMatchObject({
      digest: expect.stringContaining('/assinar?nivel=MVP'),
    })
    expect(await linhasGravadas()).toHaveLength(0)
  })

  it('sem sessão: manda para /entrar e não grava nada', async () => {
    sessao = null
    const { registrarEntrada } = await import('../../features/gestao/acoes')

    await expect(registrarEntrada(formularioValido())).rejects.toMatchObject({
      digest: expect.stringContaining('/entrar?destino=/gestao'),
    })
    expect(await linhasGravadas()).toHaveLength(0)
  })

  it.each([
    ['zero', '0'],
    ['negativa', '-1'],
  ])('unidades %s: recusa com erro e não grava', async (_caso, unidades) => {
    const { registrarEntrada } = await import('../../features/gestao/acoes')

    await expect(registrarEntrada(formularioValido({ unidades }))).rejects.toMatchObject({
      digest: expect.stringContaining('/gestao?erro='),
    })
    expect(await linhasGravadas()).toHaveLength(0)
  })

  it('odd abaixo de 1,01: recusa com erro e não grava', async () => {
    const { registrarEntrada } = await import('../../features/gestao/acoes')

    await expect(registrarEntrada(formularioValido({ odd: '0.5' }))).rejects.toMatchObject({
      digest: expect.stringContaining('/gestao?erro='),
    })
    expect(await linhasGravadas()).toHaveLength(0)
  })

  it('linha fora do intervalo (zero): recusa com erro e não grava', async () => {
    const { registrarEntrada } = await import('../../features/gestao/acoes')

    await expect(registrarEntrada(formularioValido({ linha: '0' }))).rejects.toMatchObject({
      digest: expect.stringContaining('/gestao?erro='),
    })
    expect(await linhasGravadas()).toHaveLength(0)
  })

  it('entrada válida grava com os valores digitados e manda para a visão Realizadas', async () => {
    const { registrarEntrada } = await import('../../features/gestao/acoes')

    await expect(registrarEntrada(formularioValido())).rejects.toMatchObject({
      digest: expect.stringContaining('/gestao?ver=realizadas'),
    })

    const linhas = await linhasGravadas()
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      usuarioId,
      dataReferencia: '2026-09-05',
      jogadorId,
      atributo: 'PONTOS',
      linha: 20,
      unidades: '1.50',
      odd: '1.62',
    })
  })

  it('odd em branco é aceita como ausente (odd não é obrigatória)', async () => {
    const { registrarEntrada } = await import('../../features/gestao/acoes')

    await expect(registrarEntrada(formularioValido({ odd: '' }))).rejects.toMatchObject({
      digest: expect.stringContaining('/gestao?ver=realizadas'),
    })

    const linhas = await linhasGravadas()
    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.odd).toBeNull()
  })
})
