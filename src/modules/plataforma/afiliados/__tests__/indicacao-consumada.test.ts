import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { atribuicoesAfiliados, usuarios } from '@/modules/dominio/db/schema'

import { linkPessoalDoUsuario, listarIndicacoes, registrarAssinaturaIndicada } from '../indicacoes'
import { associarVisitanteAoUsuario, hashVisitante, registrarClique } from '../servico'
import { cenarioDeAfiliados } from './cenario'

/**
 * Pente fino de 09/10, achado 1 (spec §2.1): a indicação CONSUMADA — atribuição
 * com `usuario_id` e com `CADASTRO_NIP` — está FECHADA. Outra conta no mesmo
 * navegador (um terceiro que faz login, um segundo amigo que se cadastra no
 * celular do indicador) não a rebaixa para CONFLITO nem se liga a ela: o
 * ocorrido vira uma linha NOVA em CONFLITO, no mesmo link, para o admin ver o
 * aparelho compartilhado sem perder o dado original.
 */
let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco?.fechar()
})

const AGORA = new Date('2026-09-26T12:00:00.000Z')
const DEPOIS = new Date('2026-09-28T12:00:00.000Z')

async function contaNova(rotulo: string) {
  const sufixo = Math.random().toString(36).slice(2)
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: `${rotulo}-${sufixo}@teste.com`, senhaHash: 'x' })
    .returning()
  return usuario!
}

/** O indicador manda o link; o indicado clica e se cadastra por ele. */
async function indicacaoConsumada() {
  const indicador = await contaNova('indicador')
  const link = await linkPessoalDoUsuario(banco.db, indicador.id, AGORA)
  const token = `visitante-${Math.random().toString(36).slice(2)}`
  const clique = await registrarClique(banco.db, {
    codigo: link.codigo,
    visitanteToken: token,
    agora: AGORA,
    automatizado: false,
  })
  const indicado = await contaNova('indicado')
  await expect(
    associarVisitanteAoUsuario(banco.db, token, indicado.id, AGORA, 'CADASTRO'),
  ).resolves.toEqual({ associada: true, conflito: false })
  return { indicador, indicado, token, atribuicaoId: clique.atribuicaoId!, codigo: link.codigo }
}

async function atribuicoesDoNavegador(token: string) {
  return banco.db
    .select()
    .from(atribuicoesAfiliados)
    .where(eq(atribuicoesAfiliados.visitanteHash, hashVisitante(token)))
}

async function atribuicaoPorId(id: string) {
  const [linha] = await banco.db
    .select()
    .from(atribuicoesAfiliados)
    .where(eq(atribuicoesAfiliados.id, id))
  return linha!
}

describe('indicação consumada (pente fino 09/10, achado 1)', () => {
  it('sobrevive ao login de um terceiro e ao segundo cadastro no mesmo navegador, e a assinatura continua do indicado', async () => {
    const { indicado, token, atribuicaoId } = await indicacaoConsumada()
    const original = await atribuicaoPorId(atribuicaoId)

    // Um terceiro, que já tinha conta, entra no mesmo navegador.
    const terceiro = await contaNova('terceiro')
    await expect(
      associarVisitanteAoUsuario(banco.db, token, terceiro.id, DEPOIS, 'LOGIN'),
    ).resolves.toEqual({ associada: false, conflito: true })
    // Um segundo amigo se cadastra no mesmo celular.
    const segundo = await contaNova('segundo')
    await expect(
      associarVisitanteAoUsuario(banco.db, token, segundo.id, DEPOIS, 'CADASTRO'),
    ).resolves.toEqual({ associada: false, conflito: true })

    // A original fica intacta.
    expect(await atribuicaoPorId(atribuicaoId)).toMatchObject({
      estado: 'ATIVA',
      usuarioId: indicado.id,
    })
    // Cada conta nova virou uma linha NOVA em CONFLITO, no mesmo link.
    const linhas = await atribuicoesDoNavegador(token)
    const conflitos = linhas.filter((l) => l.estado === 'CONFLITO')
    expect(conflitos.map((l) => l.usuarioId).sort()).toEqual([terceiro.id, segundo.id].sort())
    for (const conflito of conflitos) {
      expect(conflito.id).not.toBe(atribuicaoId)
      expect(conflito.linkOrigemId).toBe(original.linkOrigemId)
      expect(conflito.parceiroId).toBe(original.parceiroId)
    }
    // Nenhuma das contas novas ganhou indicador.
    for (const conta of [terceiro, segundo]) {
      const ativas = await banco.db
        .select()
        .from(atribuicoesAfiliados)
        .where(
          and(eq(atribuicoesAfiliados.usuarioId, conta.id), eq(atribuicoesAfiliados.estado, 'ATIVA')),
        )
      expect(ativas).toHaveLength(0)
    }

    // A lista do admin ainda tem o indicado, e só ele por esse link.
    const lista = await listarIndicacoes(banco.db, {}, DEPOIS)
    const desteLink = lista.linhas.filter((l) =>
      [indicado.id, terceiro.id, segundo.id].includes(l.indicado.usuarioId ?? ''),
    )
    expect(desteLink.map((l) => l.indicado.usuarioId)).toEqual([indicado.id])

    // E a assinatura do indicado continua registrando.
    await expect(
      registrarAssinaturaIndicada(banco.db, {
        usuarioId: indicado.id,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
        aprovadoEm: DEPOIS,
      }),
    ).resolves.toEqual({ registrada: true })
  })

  it('o mesmo terceiro entrando de novo não empilha linhas de CONFLITO', async () => {
    const { token } = await indicacaoConsumada()
    const terceiro = await contaNova('terceiro')
    await associarVisitanteAoUsuario(banco.db, token, terceiro.id, DEPOIS, 'LOGIN')
    await associarVisitanteAoUsuario(banco.db, token, terceiro.id, DEPOIS, 'LOGIN')
    const conflitos = (await atribuicoesDoNavegador(token)).filter((l) => l.estado === 'CONFLITO')
    expect(conflitos).toHaveLength(1)
  })

  it('o terceiro clicando LOGADO em outro link com o mesmo cookie não rebaixa a indicação', async () => {
    const { indicado, token, atribuicaoId } = await indicacaoConsumada()
    const c = await cenarioDeAfiliados(banco.db)
    const terceiro = await contaNova('terceiro')

    await registrarClique(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: token,
      usuarioId: terceiro.id,
      agora: DEPOIS,
      automatizado: false,
    })

    expect(await atribuicaoPorId(atribuicaoId)).toMatchObject({
      estado: 'ATIVA',
      usuarioId: indicado.id,
    })
    await expect(
      registrarAssinaturaIndicada(banco.db, {
        usuarioId: indicado.id,
        nivelDoPlano: 'ALL_STAR',
        modalidade: 'TEMPORADA',
        aprovadoEm: DEPOIS,
      }),
    ).resolves.toEqual({ registrada: true })
  })

  it('nem quando o terceiro já tem a própria atribuição canônica', async () => {
    const { indicado, token, atribuicaoId } = await indicacaoConsumada()
    const c = await cenarioDeAfiliados(banco.db)
    const terceiro = await contaNova('terceiro')
    // O terceiro tem atribuição própria, de outro navegador.
    await registrarClique(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: `visitante-proprio-${Math.random().toString(36).slice(2)}`,
      usuarioId: terceiro.id,
      agora: AGORA,
      automatizado: false,
    })

    await registrarClique(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: token,
      usuarioId: terceiro.id,
      agora: DEPOIS,
      automatizado: false,
    })

    expect(await atribuicaoPorId(atribuicaoId)).toMatchObject({
      estado: 'ATIVA',
      usuarioId: indicado.id,
    })
  })

  it('atribuição anônima que recebe duas contas antes de qualquer cadastro continua virando CONFLITO', async () => {
    const indicador = await contaNova('indicador')
    const link = await linkPessoalDoUsuario(banco.db, indicador.id, AGORA)
    const token = `visitante-${Math.random().toString(36).slice(2)}`
    const clique = await registrarClique(banco.db, {
      codigo: link.codigo,
      visitanteToken: token,
      agora: AGORA,
      automatizado: false,
    })
    const primeira = await contaNova('primeira')
    const segunda = await contaNova('segunda')
    await expect(
      associarVisitanteAoUsuario(banco.db, token, primeira.id, AGORA, 'LOGIN'),
    ).resolves.toEqual({ associada: true, conflito: false })
    await expect(
      associarVisitanteAoUsuario(banco.db, token, segunda.id, DEPOIS, 'LOGIN'),
    ).resolves.toEqual({ associada: false, conflito: true })

    expect((await atribuicaoPorId(clique.atribuicaoId!)).estado).toBe('CONFLITO')
  })
})
