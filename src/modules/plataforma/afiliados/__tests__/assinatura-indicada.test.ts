import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  atribuicoesAfiliados,
  direitosAcesso,
  eventosAfiliados,
  tentativasCheckout,
  usuarios,
} from '@/modules/dominio/db/schema'

import { excluirUsuario } from '../../admin/usuarios'
import { PagamentoFake } from '../../assinatura/fake'
import { processarNotificacao } from '../../assinatura/webhook'
import * as indicacoes from '../indicacoes'
import {
  linkPessoalDoUsuario,
  registrarAssinaturaIndicada,
  registrarAssinaturasPendentes,
} from '../indicacoes'
import { associarVisitanteAoUsuario, registrarClique } from '../servico'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco?.fechar()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const AGORA = new Date('2026-09-26T12:00:00.000Z')
const PROVEDOR = 'fake'

async function contaNova(rotulo: string) {
  const sufixo = Math.random().toString(36).slice(2)
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: `${rotulo}-${sufixo}@teste.com`, senhaHash: 'x' })
    .returning()
  return usuario!
}

/**
 * B indica C: C clica no link pessoal de B e depois entra por `origem`.
 * CADASTRO é a conta nascendo pelo link; LOGIN é a conta que já existia.
 */
async function indicada(origem: 'CADASTRO' | 'LOGIN' = 'CADASTRO') {
  const indicador = await contaNova('indicador')
  const { codigo } = await linkPessoalDoUsuario(banco.db, indicador.id, AGORA)
  const token = `visitante-${Math.random().toString(36).slice(2)}`
  const clique = await registrarClique(banco.db, {
    codigo,
    visitanteToken: token,
    agora: AGORA,
    automatizado: false,
  })
  const conta = await contaNova('indicada')
  await expect(
    associarVisitanteAoUsuario(banco.db, token, conta.id, AGORA, origem),
  ).resolves.toEqual({ associada: true, conflito: false })
  return { conta, atribuicaoId: clique.atribuicaoId! }
}

async function assinaturasDaConta(usuarioId: string) {
  return banco.db
    .select()
    .from(eventosAfiliados)
    .where(
      and(eq(eventosAfiliados.usuarioId, usuarioId), eq(eventosAfiliados.tipo, 'ASSINATURA_NIP')),
    )
}

describe('registrarAssinaturaIndicada', () => {
  it('(a) conta indicada no cadastro: o 1º pagamento grava ASSINATURA_NIP com plano e data', async () => {
    const { conta, atribuicaoId } = await indicada()
    const aprovadoEm = new Date('2026-09-27T10:00:00.000Z')

    await expect(
      registrarAssinaturaIndicada(banco.db, {
        usuarioId: conta.id,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
        aprovadoEm,
      }),
    ).resolves.toEqual({ registrada: true })

    const [evento, ...resto] = await assinaturasDaConta(conta.id)
    expect(resto).toHaveLength(0)
    const [atribuicao] = await banco.db
      .select()
      .from(atribuicoesAfiliados)
      .where(eq(atribuicoesAfiliados.id, atribuicaoId))
    expect(evento).toMatchObject({
      atribuicaoId,
      linkId: atribuicao!.linkOrigemId,
      visitanteHash: atribuicao!.visitanteHash,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
    })
    expect(evento!.ocorridoEm.toISOString()).toBe(aprovadoEm.toISOString())
  })

  it('(b) o 2º pagamento, com outra data e outro plano, não muda nada', async () => {
    const { conta } = await indicada()
    const primeiro = new Date('2026-09-27T10:00:00.000Z')
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: conta.id,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm: primeiro,
    })

    await expect(
      registrarAssinaturaIndicada(banco.db, {
        usuarioId: conta.id,
        nivelDoPlano: 'ALL_STAR',
        modalidade: 'TEMPORADA',
        aprovadoEm: new Date('2026-10-27T10:00:00.000Z'),
      }),
    ).resolves.toEqual({ registrada: false })

    const eventos = await assinaturasDaConta(conta.id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.ocorridoEm.toISOString()).toBe(primeiro.toISOString())
    expect(eventos[0]).toMatchObject({ nivelDoPlano: 'MVP', modalidade: 'MENSAL' })
  })

  it('(c) atribuição com expira_em no passado ainda conta', async () => {
    const { conta, atribuicaoId } = await indicada()
    await banco.db
      .update(atribuicoesAfiliados)
      .set({
        inicio: new Date('2026-06-01T00:00:00.000Z'),
        expiraEm: new Date('2026-07-01T00:00:00.000Z'),
        estado: 'EXPIRADA',
      })
      .where(eq(atribuicoesAfiliados.id, atribuicaoId))

    await expect(
      registrarAssinaturaIndicada(banco.db, {
        usuarioId: conta.id,
        nivelDoPlano: 'ALL_STAR',
        modalidade: 'TEMPORADA',
        aprovadoEm: AGORA,
      }),
    ).resolves.toEqual({ registrada: true })
    expect(await assinaturasDaConta(conta.id)).toHaveLength(1)
  })

  it('(d) atribuição em CONFLITO não grava', async () => {
    const { conta, atribuicaoId } = await indicada()
    await banco.db
      .update(atribuicoesAfiliados)
      .set({ estado: 'CONFLITO' })
      .where(eq(atribuicoesAfiliados.id, atribuicaoId))

    await expect(
      registrarAssinaturaIndicada(banco.db, {
        usuarioId: conta.id,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
        aprovadoEm: AGORA,
      }),
    ).resolves.toEqual({ registrada: false })
    expect(await assinaturasDaConta(conta.id)).toHaveLength(0)
  })

  it('(e) conta sem atribuição → registrada:false', async () => {
    const conta = await contaNova('sem-indicacao')
    await expect(
      registrarAssinaturaIndicada(banco.db, {
        usuarioId: conta.id,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
        aprovadoEm: AGORA,
      }),
    ).resolves.toEqual({ registrada: false })
    expect(await assinaturasDaConta(conta.id)).toHaveLength(0)
  })

  it('(e2) conta que já existia e só entrou depois do clique (LOGIN, sem CADASTRO_NIP) não conta', async () => {
    const { conta } = await indicada('LOGIN')
    await expect(
      registrarAssinaturaIndicada(banco.db, {
        usuarioId: conta.id,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
        aprovadoEm: AGORA,
      }),
    ).resolves.toEqual({ registrada: false })
    expect(await assinaturasDaConta(conta.id)).toHaveLength(0)
  })
})

describe('conta indicada que assinou pode ser apagada (revisão final, item 1)', () => {
  it('excluirUsuario apaga a conta; a ASSINATURA_NIP fica, sem usuario_id, presa à atribuição', async () => {
    const { conta, atribuicaoId } = await indicada()
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: conta.id,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm: new Date('2026-09-27T10:00:00.000Z'),
    })

    await expect(excluirUsuario(banco.db, conta.id)).resolves.toBeUndefined()

    expect(await banco.db.select().from(usuarios).where(eq(usuarios.id, conta.id))).toHaveLength(0)
    const eventos = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(
        and(
          eq(eventosAfiliados.atribuicaoId, atribuicaoId),
          eq(eventosAfiliados.tipo, 'ASSINATURA_NIP'),
        ),
      )
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.usuarioId).toBeNull()
  })
})

describe('registrarAssinaturasPendentes (varredura da reconciliação)', () => {
  it('(f) grava o que o webhook deixou de gravar, pelo direito mais antigo, e rodada de novo devolve 0', async () => {
    const { conta } = await indicada()
    const { conta: porLogin } = await indicada('LOGIN')
    const antigo = new Date('2026-09-27T10:00:00.000Z')
    await banco.db.insert(direitosAcesso).values([
      {
        usuarioId: conta.id,
        produto: 'NBA_PRO',
        origem: PROVEDOR,
        referenciaOrigem: `pay-antigo-${conta.id}`,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
        inicio: antigo,
        fim: new Date('2026-10-27T10:00:00.000Z'),
      },
      {
        usuarioId: conta.id,
        produto: 'NBA_PRO',
        origem: PROVEDOR,
        referenciaOrigem: `pay-novo-${conta.id}`,
        nivelDoPlano: 'ALL_STAR',
        modalidade: 'TEMPORADA',
        inicio: new Date('2026-10-27T10:00:00.000Z'),
        fim: new Date('2027-07-01T03:00:00.000Z'),
      },
      // Pagou, mas foi ligada por LOGIN: não é indicação de cadastro.
      {
        usuarioId: porLogin.id,
        produto: 'NBA_PRO',
        origem: PROVEDOR,
        referenciaOrigem: `pay-${porLogin.id}`,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
        inicio: antigo,
        fim: new Date('2026-10-27T10:00:00.000Z'),
      },
    ])
    // Cortesia não é assinatura: não vem do provedor de pagamento.
    const { conta: cortesia } = await indicada()
    await banco.db.insert(direitosAcesso).values({
      usuarioId: cortesia.id,
      produto: 'NBA_PRO',
      origem: 'CORTESIA_ADMIN',
      referenciaOrigem: `cortesia-${cortesia.id}`,
      nivelDoPlano: 'MVP',
      inicio: antigo,
      fim: new Date('2026-10-27T10:00:00.000Z'),
    })

    const agora = new Date('2026-11-01T00:00:00.000Z')
    expect(await registrarAssinaturasPendentes(banco.db, agora, PROVEDOR)).toBe(1)

    const [evento, ...resto] = await assinaturasDaConta(conta.id)
    expect(resto).toHaveLength(0)
    expect(evento).toMatchObject({ nivelDoPlano: 'MVP', modalidade: 'MENSAL' })
    expect(evento!.ocorridoEm.toISOString()).toBe(antigo.toISOString())
    expect(await assinaturasDaConta(porLogin.id)).toHaveLength(0)
    expect(await assinaturasDaConta(cortesia.id)).toHaveLength(0)

    expect(await registrarAssinaturasPendentes(banco.db, agora, PROVEDOR)).toBe(0)
  })
})

describe('webhook de pagamento com conta indicada', () => {
  const porta = new PagamentoFake()

  async function semearCompra(usuarioId: string, referencia: string) {
    await banco.db.insert(tentativasCheckout).values({
      usuarioId,
      produto: 'NBA_PRO',
      provedor: PROVEDOR,
      referenciaExterna: referencia,
      chaveIdempotencia: `chave-${referencia}`,
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'MENSAL',
      status: 'CRIADA',
      atualizadoEm: AGORA,
    })
  }

  function aprovado(referencia: string) {
    return JSON.stringify({
      eventoExternoId: `evt-${referencia}`,
      tipo: 'PAGAMENTO_APROVADO',
      referenciaExterna: referencia,
      assinaturaExternaId: `pre-${referencia}`,
      cobrancaExternaId: `pay-${referencia}`,
      recursoTipo: 'COBRANCA',
      plano: 'mensal',
      proximaCobranca: '2026-10-26T12:00:00.000Z',
      ocorridoEm: AGORA.toISOString(),
      statusExterno: 'approved',
      bruto: {},
    })
  }

  it('pagamento aprovado de conta indicada grava a assinatura, depois do pagamento', async () => {
    const { conta } = await indicada()
    const referencia = `ref-${conta.id}`
    await semearCompra(conta.id, referencia)

    const resultado = await processarNotificacao(banco.db, porta, {
      corpoBruto: aprovado(referencia),
      cabecalhos: {},
      agora: AGORA,
      fimDaTemporada: null,
    })

    // O resultado do webhook não ganha campo novo: a indicação não é do pagamento.
    expect(resultado).toEqual({
      aceito: true,
      duplicado: false,
      liberou: true,
      usuarioId: conta.id,
    })
    const [evento] = await assinaturasDaConta(conta.id)
    expect(evento).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'MENSAL' })
    expect(evento!.ocorridoEm.toISOString()).toBe(AGORA.toISOString())
  })

  it('(g) falha ao registrar a indicação não derruba o pagamento', async () => {
    const { conta } = await indicada()
    const referencia = `ref-${conta.id}`
    await semearCompra(conta.id, referencia)
    const falha = vi
      .spyOn(indicacoes, 'registrarAssinaturaIndicada')
      .mockRejectedValue(new Error('banco de indicação fora'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      processarNotificacao(banco.db, porta, {
        corpoBruto: aprovado(referencia),
        cabecalhos: {},
        agora: AGORA,
        fimDaTemporada: null,
      }),
    ).resolves.toEqual({ aceito: true, duplicado: false, liberou: true, usuarioId: conta.id })

    expect(falha).toHaveBeenCalledTimes(1)
    const direitos = await banco.db
      .select()
      .from(direitosAcesso)
      .where(eq(direitosAcesso.usuarioId, conta.id))
    expect(direitos).toHaveLength(1)
    expect(direitos[0]).toMatchObject({ nivelDoPlano: 'ALL_STAR', origem: PROVEDOR })
    expect(await assinaturasDaConta(conta.id)).toHaveLength(0)
    const log = erro.mock.calls.map(
      ([linha]) => JSON.parse(String(linha)) as Record<string, unknown>,
    )
    expect(log).toContainEqual(
      expect.objectContaining({ evento: 'indicacao_assinatura_falhou', usuarioId: conta.id }),
    )

    // A varredura da reconciliação refaz o que o webhook não gravou.
    vi.restoreAllMocks()
    expect(await registrarAssinaturasPendentes(banco.db, AGORA, PROVEDOR)).toBe(1)
    expect(await assinaturasDaConta(conta.id)).toHaveLength(1)
  })
})
