import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { direitosAcesso, usuarios } from '../../dominio/db/schema'
import { avaliarAcesso, concederCortesia } from '../assinatura/direito'
import { PRODUTO_PAGO } from '../assinatura/configuracao'

/**
 * O QUE `avaliarAcesso` RESPONDE — e a ordem entre as respostas.
 *
 * Não é mais um booleano: é o NÍVEL do plano, ou `nivel: null` com um dos dois
 * motivos que não são nível nenhum (sem sessão, bloqueio administrativo).
 * Quem não assinou deixou de ser uma recusa e virou GRATIS — um nível, com
 * telas próprias.
 *
 * O que não mudou é o que este teste trava: a ordem é regra de negócio
 * (bloqueio administrativo prevalece sobre direito vigente, Spec 04, princípio
 * 4), usuário inexistente continua sendo sem-sessao e não GRATIS, e a consulta
 * continua sendo uma só, com LEFT JOIN (ADR-0008).
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

describe('avaliarAcesso — o nível, não um booleano', () => {
  it('sem id de usuário: sem-sessao, sem tocar o banco', async () => {
    expect(await avaliarAcesso(banco.db, null, AGORA)).toEqual({ nivel: null, motivo: 'sem-sessao' })
  })

  it('id que não existe: sem-sessao (nunca GRATIS)', async () => {
    // Um LEFT JOIN sem linha nenhuma tem que virar sem-sessao, não GRATIS:
    // são telas diferentes (entrar × a home do grátis).
    expect(
      await avaliarAcesso(banco.db, '00000000-0000-4000-8000-00000000dead', AGORA),
    ).toEqual({ nivel: null, motivo: 'sem-sessao' })
  })

  it('usuário sem direito: GRATIS — é um nível, não uma recusa', async () => {
    const id = await criarUsuario('gratis@teste.com')
    expect(await avaliarAcesso(banco.db, id, AGORA)).toEqual({
      nivel: 'GRATIS',
      direitoId: null,
      validoAte: null,
      modalidade: null,
    })
  })

  it('usuário com direito MVP vigente: MVP, com o id e a validade do direito', async () => {
    const id = await criarUsuario('mvp@teste.com')
    const fim = new Date(AGORA.getTime() + 86_400_000)
    const [direito] = await banco.db
      .insert(direitosAcesso)
      .values({
        usuarioId: id,
        produto: PRODUTO_PAGO,
        origem: 'CORTESIA',
        referenciaOrigem: 'mvp',
        inicio: new Date(AGORA.getTime() - 1000),
        fim,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
      })
      .returning({ id: direitosAcesso.id })
    expect(await avaliarAcesso(banco.db, id, AGORA)).toEqual({
      nivel: 'MVP',
      direitoId: direito!.id,
      validoAte: fim,
      modalidade: 'MENSAL',
    })
  })

  it('dois direitos ativos ao mesmo tempo: vale o MAIOR (spec, decisão 3)', async () => {
    // É o instante do upgrade: o novo já nasceu e o antigo ainda não foi
    // revogado. O usuário não pode cair de nível no meio.
    const id = await criarUsuario('upgrade@teste.com')
    await banco.db.insert(direitosAcesso).values([
      {
        usuarioId: id,
        produto: PRODUTO_PAGO,
        origem: 'CORTESIA',
        referenciaOrigem: 'upgrade-mvp',
        inicio: new Date(AGORA.getTime() - 2000),
        fim: null,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
      },
      {
        usuarioId: id,
        produto: PRODUTO_PAGO,
        origem: 'CORTESIA',
        referenciaOrigem: 'upgrade-all-star',
        inicio: new Date(AGORA.getTime() - 1000),
        fim: null,
        nivelDoPlano: 'ALL_STAR',
        modalidade: 'TEMPORADA',
      },
    ])
    const r = await avaliarAcesso(banco.db, id, AGORA)
    expect(r.nivel).toBe('ALL_STAR')
    expect(r.nivel !== null && r.modalidade).toBe('TEMPORADA')
  })

  it('direito vencido não conta: volta a GRATIS', async () => {
    const id = await criarUsuario('vencido@teste.com')
    await banco.db.insert(direitosAcesso).values({
      usuarioId: id,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA',
      referenciaOrigem: 'vencido',
      inicio: new Date(AGORA.getTime() - 2000),
      fim: new Date(AGORA.getTime() - 1000),
      nivelDoPlano: 'ALL_STAR',
    })
    expect((await avaliarAcesso(banco.db, id, AGORA)).nivel).toBe('GRATIS')
  })

  it('BLOQUEADO prevalece sobre direito vigente', async () => {
    const id = await criarUsuario('bloqueado@teste.com')
    await banco.db.insert(direitosAcesso).values({
      usuarioId: id,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA',
      referenciaOrigem: 'bloqueado',
      inicio: new Date(AGORA.getTime() - 1000),
      fim: null,
      nivelDoPlano: 'ALL_STAR',
    })
    await banco.db.update(usuarios).set({ status: 'BLOQUEADO' }).where(eq(usuarios.id, id))
    expect(await avaliarAcesso(banco.db, id, AGORA)).toEqual({
      nivel: null,
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
      nivelDoPlano: 'ALL_STAR',
    })
    const segundoId = await concederCortesia(banco.db, {
      usuarioId: id,
      referencia,
      inicio: AGORA,
      fim: null,
      nivelDoPlano: 'ALL_STAR',
    })

    expect(segundoId).toBe(primeiroId)
    const linhas = await banco.db
      .select()
      .from(direitosAcesso)
      .where(eq(direitosAcesso.usuarioId, id))
    expect(linhas).toHaveLength(1)
  })
})
