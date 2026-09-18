import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { assinaturas, direitosAcesso, sessoes, usuarios } from '../../dominio/db/schema'
import { adicionarUsuario, listarUsuarios } from '../admin/usuarios'

/**
 * O PAINEL DE USUÁRIOS PRECISA DIZER A VERDADE SOBRE A ASSINATURA.
 *
 * Cinco colunas do painel — situação da assinatura, plano, próxima cobrança,
 * direito ativo e dispositivos ativos — devolviam sempre nulo ou zero, desde
 * que as subconsultas correlacionadas entraram no lugar dos joins. A causa:
 * dentro de um `sql` usado como CAMPO do select, o drizzle renderiza a coluna
 * do usuário sem o prefixo da tabela, e o Postgres resolve esse nome no escopo
 * mais interno — a subconsulta passava a comparar a linha com ela mesma.
 *
 * O defeito é silencioso por natureza: não há erro, só ausência. Um teste que
 * só afirmasse "não quebrou" continuaria verde com ele presente — e continuou,
 * por meses. Por isso cada teste aqui semeia um dado que EXISTE no banco e
 * exige que o painel o devolva. É o suporte que lê esta tela para decidir se
 * alguém está pagando.
 */

const AGORA = new Date('2026-10-01T12:00:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

beforeEach(async () => {
  await banco.db.delete(direitosAcesso)
  await banco.db.delete(assinaturas)
  await banco.db.delete(sessoes)
  await banco.db.delete(usuarios)
  usuarioId = (
    await adicionarUsuario(banco.db, {
      email: 'assinante@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Assinante',
    })
  ).id
})

async function contratar(valores: Partial<typeof assinaturas.$inferInsert> = {}) {
  await banco.db.insert(assinaturas).values({
    usuarioId,
    mercadopagoId: `sub-${Math.random().toString(36).slice(2)}`,
    referenciaExterna: `ref-${Math.random().toString(36).slice(2)}`,
    status: 'ATIVA',
    plano: 'NIP MVP mensal',
    nivelDoPlano: 'MVP',
    modalidade: 'MENSAL',
    proximaCobranca: new Date('2026-11-01T12:00:00.000Z'),
    atualizadoEm: AGORA,
    ...valores,
  })
}

async function linhaDoAssinante() {
  const linhas = await listarUsuarios(banco.db, {}, AGORA)
  return linhas.find((linha) => linha.id === usuarioId)
}

describe('a assinatura que o painel mostra', () => {
  it('devolve situação, plano e próxima cobrança do contrato que existe', async () => {
    await contratar()

    const linha = await linhaDoAssinante()

    expect(linha?.assinaturaStatus).toBe('ATIVA')
    expect(linha?.assinaturaPlano).toBe('NIP MVP mensal')
    // Tipo E valor: um campo `sql` cru volta como string do driver, e a tela
    // chama `.toLocaleDateString()` nele. Afirmar só o valor deixaria passar
    // uma string que o painel não consegue formatar.
    expect(linha?.proximaCobranca).toBeInstanceOf(Date)
    expect(linha?.proximaCobranca?.toISOString()).toBe('2026-11-01T12:00:00.000Z')
  })

  it('não empresta o contrato de um usuário para outro', async () => {
    // A correlação quebrada devolvia nulo; uma correlação frouxa devolveria
    // o contrato de outra pessoa. Os dois erros mostram a mesma tela errada
    // para o suporte, e só este teste separa um do outro.
    await contratar()
    const outro = await adicionarUsuario(banco.db, {
      email: 'sem-plano@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'Sem plano',
    })

    const linhas = await listarUsuarios(banco.db, {}, AGORA)
    const semPlano = linhas.find((linha) => linha.id === outro.id)

    expect(semPlano?.assinaturaStatus).toBeNull()
    expect(semPlano?.assinaturaPlano).toBeNull()
    expect(semPlano?.proximaCobranca).toBeNull()
  })

  it('dois assinantes, cada um com o SEU plano', async () => {
    // O caso de produção. O teste acima prova que quem não tem plano recebe
    // nulo, mas nulo também era o que a correlação quebrada devolvia para
    // todo mundo — é aqui que se separa "cada um com o seu" de "todos com o
    // mesmo", que é o erro oposto e igualmente invisível numa tela só.
    await contratar({ plano: 'NIP MVP mensal', nivelDoPlano: 'MVP' })
    const outro = await adicionarUsuario(banco.db, {
      email: 'all-star@exemplo.com',
      senha: 'senha-segura-123',
      nome: 'All Star',
    })
    await banco.db.insert(assinaturas).values({
      usuarioId: outro.id,
      mercadopagoId: 'sub-do-outro',
      referenciaExterna: 'ref-do-outro',
      status: 'ATIVA',
      plano: 'NIP All Star temporada',
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
      proximaCobranca: null,
      atualizadoEm: AGORA,
    })

    const linhas = await listarUsuarios(banco.db, {}, AGORA)

    expect(linhas.find((linha) => linha.id === usuarioId)?.assinaturaPlano).toBe('NIP MVP mensal')
    expect(linhas.find((linha) => linha.id === outro.id)?.assinaturaPlano).toBe(
      'NIP All Star temporada',
    )
  })

  it('com dois contratos, mostra o que NÃO foi cancelado', async () => {
    // Depois de um upgrade a última escrita é a do contrato que morreu: o
    // webhook grava os dois no mesmo instante e a varredura de cancelamento
    // volta a tocar só o antigo. Por `atualizado_em desc` sozinho, o painel
    // diria ao suporte que o assinante está cancelado no plano velho.
    await contratar({
      status: 'ATIVA',
      plano: 'NIP All Star mensal',
      nivelDoPlano: 'ALL_STAR',
      atualizadoEm: new Date('2026-10-01T12:00:00.000Z'),
    })
    await contratar({
      status: 'CANCELADA',
      plano: 'NIP MVP mensal',
      canceladaEm: new Date('2026-10-01T12:05:00.000Z'),
      atualizadoEm: new Date('2026-10-01T12:05:00.000Z'),
    })

    const linha = await linhaDoAssinante()

    expect(linha?.assinaturaStatus).toBe('ATIVA')
    expect(linha?.assinaturaPlano).toBe('NIP All Star mensal')
  })

  it('o filtro por situação continua achando quem tem aquele status', async () => {
    await contratar({ status: 'ATIVA' })

    const ativos = await listarUsuarios(banco.db, { situacaoAssinatura: 'ATIVA' }, AGORA)
    const cancelados = await listarUsuarios(banco.db, { situacaoAssinatura: 'CANCELADA' }, AGORA)

    expect(ativos.map((linha) => linha.id)).toContain(usuarioId)
    expect(cancelados).toHaveLength(0)
  })
})

describe('o direito de acesso que o painel mostra', () => {
  async function conceder(inicio: Date, fim: Date | null, revogadoEm: Date | null = null) {
    await banco.db.insert(direitosAcesso).values({
      usuarioId,
      produto: 'NBA_PRO',
      origem: 'CORTESIA_ADMIN',
      referenciaOrigem: `cortesia-${Math.random().toString(36).slice(2)}`,
      nivelDoPlano: 'MVP',
      modalidade: null,
      inicio,
      fim,
      revogadoEm,
      motivoRevogacao: revogadoEm ? 'TESTE' : null,
      atualizadoEm: inicio,
    })
  }

  it('acusa direito vigente', async () => {
    await conceder(new Date('2026-09-01T12:00:00.000Z'), new Date('2026-12-01T12:00:00.000Z'))
    expect((await linhaDoAssinante())?.direitoAtivo).toBe(true)
  })

  it('não acusa direito de outro produto, revogado, futuro ou vencido', async () => {
    expect((await linhaDoAssinante())?.direitoAtivo).toBe(false)

    await conceder(new Date('2026-09-01T12:00:00.000Z'), new Date('2026-09-15T12:00:00.000Z'))
    expect((await linhaDoAssinante())?.direitoAtivo).toBe(false)

    await banco.db.delete(direitosAcesso)
    await conceder(new Date('2026-11-01T12:00:00.000Z'), null)
    expect((await linhaDoAssinante())?.direitoAtivo).toBe(false)

    await banco.db.delete(direitosAcesso)
    await conceder(
      new Date('2026-09-01T12:00:00.000Z'),
      null,
      new Date('2026-09-20T12:00:00.000Z'),
    )
    expect((await linhaDoAssinante())?.direitoAtivo).toBe(false)
  })
})

describe('os dispositivos ativos que o painel conta', () => {
  async function abrirSessao(dispositivoId: string | null, expiraEm: Date, encerradaEm?: Date) {
    await banco.db.insert(sessoes).values({
      usuarioId,
      dispositivoId,
      tokenHash: `hash-${Math.random().toString(36).slice(2)}`,
      criadaEm: new Date('2026-09-30T12:00:00.000Z'),
      expiraEm,
      encerradaEm: encerradaEm ?? null,
      motivoEncerramento: encerradaEm ? 'teste' : null,
    })
  }

  it('conta a sessão viva, e não conta a expirada nem a encerrada', async () => {
    const { dispositivos } = await import('../../dominio/db/schema')
    const [aparelho] = await banco.db
      .insert(dispositivos)
      .values({ usuarioId, fingerprint: 'impressao-1', tipo: 'MOBILE' })
      .returning({ id: dispositivos.id })

    await abrirSessao(aparelho!.id, new Date('2026-12-01T12:00:00.000Z'))
    expect((await linhaDoAssinante())?.dispositivosAtivos).toBe(1)

    // Duas sessões do MESMO aparelho continuam sendo um aparelho — é a
    // contagem que a regra dos dois dispositivos usa.
    await abrirSessao(aparelho!.id, new Date('2026-12-02T12:00:00.000Z'))
    expect((await linhaDoAssinante())?.dispositivosAtivos).toBe(1)

    await banco.db.delete(sessoes).where(eq(sessoes.usuarioId, usuarioId))
    await abrirSessao(aparelho!.id, new Date('2026-09-15T12:00:00.000Z'))
    expect((await linhaDoAssinante())?.dispositivosAtivos).toBe(0)

    await banco.db.delete(sessoes).where(eq(sessoes.usuarioId, usuarioId))
    await abrirSessao(
      aparelho!.id,
      new Date('2026-12-01T12:00:00.000Z'),
      new Date('2026-09-29T12:00:00.000Z'),
    )
    expect((await linhaDoAssinante())?.dispositivosAtivos).toBe(0)
  })
})
