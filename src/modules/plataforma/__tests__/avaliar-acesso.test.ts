import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { direitosAcesso, usuarios } from '../../dominio/db/schema'
import { avaliarAcesso, concederCortesia } from '../assinatura/direito'
import { PRODUTO_PAGO } from '../assinatura/configuracao'

/**
 * REDE DE PROTEÇÃO DA CONSOLIDAÇÃO DE CONSULTAS.
 *
 * `avaliarAcesso` fazia dois SELECTs em sequência (usuário, depois direito) e
 * passou a fazer um só, com LEFT JOIN. Numa cadeia que atravessa continente,
 * cada ida e volta custa ~150ms (ADR-0008) — mas o motivo de existir deste
 * teste é que o comportamento NÃO pode mudar junto: são quatro respostas
 * distintas, e a ordem entre elas é regra de negócio (bloqueio administrativo
 * prevalece sobre direito ativo, Spec 04, princípio 4).
 */
const AGORA = new Date('2026-08-25T12:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 120_000)
afterAll(async () => banco.fechar())

async function criarUsuario(email: string): Promise<string> {
  const [u] = await banco.db.insert(usuarios).values({ email, senhaHash: 'x' }).returning()
  return u!.id
}

describe('avaliarAcesso — as quatro respostas', () => {
  it('sem id de usuário: sem-sessao, sem tocar o banco', async () => {
    expect(await avaliarAcesso(banco.db, null, AGORA)).toEqual({
      permitido: false,
      motivo: 'sem-sessao',
    })
  })

  it('id que não existe: sem-sessao (nunca "sem direito")', async () => {
    // Um LEFT JOIN sem linha nenhuma tem que virar sem-sessao, não
    // sem-direito-ativo: são telas diferentes (entrar × assinar).
    expect(
      await avaliarAcesso(banco.db, '00000000-0000-4000-8000-00000000dead', AGORA),
    ).toEqual({ permitido: false, motivo: 'sem-sessao' })
  })

  it('usuário sem direito: sem-direito-ativo', async () => {
    const id = await criarUsuario('sem-direito@teste.com')
    expect(await avaliarAcesso(banco.db, id, AGORA)).toEqual({
      permitido: false,
      motivo: 'sem-direito-ativo',
    })
  })

  it('usuário com direito vigente: permitido', async () => {
    const id = await criarUsuario('com-direito@teste.com')
    await banco.db.insert(direitosAcesso).values({
      usuarioId: id,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA',
      referenciaOrigem: 'com-direito',
      inicio: new Date(AGORA.getTime() - 1000),
      fim: null,
    })
    const r = await avaliarAcesso(banco.db, id, AGORA)
    expect(r.permitido).toBe(true)
  })

  it('BLOQUEADO prevalece sobre direito vigente', async () => {
    // A ordem importa: com o LEFT JOIN as duas informações chegam juntas, e
    // quem responde primeiro passa a ser escolha do código, não do número de
    // consultas. Bloqueio administrativo sempre ganha.
    const id = await criarUsuario('bloqueado@teste.com')
    await banco.db.insert(direitosAcesso).values({
      usuarioId: id,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA',
      referenciaOrigem: 'bloqueado',
      inicio: new Date(AGORA.getTime() - 1000),
      fim: null,
    })
    await banco.db.update(usuarios).set({ status: 'BLOQUEADO' }).where(eq(usuarios.id, id))

    expect(await avaliarAcesso(banco.db, id, AGORA)).toEqual({
      permitido: false,
      motivo: 'bloqueio-administrativo',
    })
  })
})

describe('concederCortesia — reexecutar não duplica', () => {
  // A conta de teste da equipe (Task 8, call de 08/09) roda este script
  // repetidas vezes. A garantia de não empilhar cortesia não é código novo
  // do script — é esta constraint única (origem, referencia_origem, produto)
  // em `direitos_acesso`, que faz `concederCortesia` ser um upsert. Este
  // teste prova o upsert diretamente, sem depender do script.
  it('mesma referência duas vezes: atualiza a mesma linha, não cria outra', async () => {
    const id = await criarUsuario('cortesia-idempotente@teste.com')
    const referencia = 'cortesia:teste:cortesia-idempotente@teste.com'

    const primeiroId = await concederCortesia(banco.db, {
      usuarioId: id,
      referencia,
      inicio: AGORA,
      fim: null,
    })
    const segundoId = await concederCortesia(banco.db, {
      usuarioId: id,
      referencia,
      inicio: AGORA,
      fim: null,
    })

    expect(segundoId).toBe(primeiroId)
    const linhas = await banco.db
      .select()
      .from(direitosAcesso)
      .where(eq(direitosAcesso.usuarioId, id))
    expect(linhas).toHaveLength(1)
  })
})
