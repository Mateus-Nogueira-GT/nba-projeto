import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  atribuicoesAfiliados,
  auditoriaAfiliados,
  campanhasAfiliados,
  eventosAfiliados,
  linksAfiliados,
  ofertasAfiliados,
  parceirosAfiliados,
  usuarios,
} from '@/modules/dominio/db/schema'

import { criarLinkDeIndicacao, linkPessoalDoUsuario } from '../indicacoes'
import {
  associarVisitanteAoUsuario,
  definirStatusLink,
  definirStatusParceiro,
  hashVisitante,
  registrarClique,
  resolverDestinoDaCasaSemRegistrar,
  resolverLinkSemRegistrar,
} from '../servico'
import { cenarioDeAfiliados } from './cenario'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco?.fechar()
})

const AGORA = new Date('2026-09-26T12:00:00.000Z')

/** Conta nova, sem parceiro nenhum — o caso comum de "todo usuário tem link". */
async function contaNova(rotulo: string) {
  const sufixo = Math.random().toString(36).slice(2)
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: `${rotulo}-${sufixo}@teste.com`, senhaHash: 'x' })
    .returning()
  return usuario!
}

async function parceiroDaConta(usuarioId: string) {
  const [parceiro] = await banco.db
    .select()
    .from(parceirosAfiliados)
    .where(eq(parceirosAfiliados.usuarioId, usuarioId))
  return parceiro!
}

describe('links de indicação', () => {
  it('link pessoal é idempotente: 1 parceiro USUARIO, 1 campanha INDICACAO sem oferta, 1 link CADASTRO', async () => {
    const conta = await contaNova('pessoal')
    const primeiro = await linkPessoalDoUsuario(banco.db, conta.id, AGORA)
    const segundo = await linkPessoalDoUsuario(banco.db, conta.id, AGORA)

    expect(segundo.codigo).toBe(primeiro.codigo)
    // `u-` + 10 base36 aleatórios: não dá para adivinhar a partir do id da conta.
    expect(primeiro.codigo).toMatch(/^u-[a-z0-9]{10}$/)

    const parceiros = await banco.db
      .select()
      .from(parceirosAfiliados)
      .where(eq(parceirosAfiliados.usuarioId, conta.id))
    expect(parceiros).toHaveLength(1)
    expect(parceiros[0]!.tipo).toBe('USUARIO')
    // Nome público é o e-mail mascarado — o e-mail inteiro nunca vai para o parceiro.
    expect(parceiros[0]!.nomePublico).not.toContain(conta.email)
    expect(parceiros[0]!.nomePublico).toMatch(/^pe\*\*\*@teste\.com$/)

    const campanhas = await banco.db
      .select()
      .from(campanhasAfiliados)
      .where(eq(campanhasAfiliados.parceiroId, parceiros[0]!.id))
    expect(campanhas).toHaveLength(1)
    expect(campanhas[0]!.finalidade).toBe('INDICACAO')
    expect(campanhas[0]!.ofertaId).toBeNull()
    expect(campanhas[0]!.canal).toBe('usuario')

    const links = await banco.db
      .select()
      .from(linksAfiliados)
      .where(eq(linksAfiliados.campanhaId, campanhas[0]!.id))
    expect(links).toHaveLength(1)
    expect(links[0]!.tipoDestino).toBe('CADASTRO')
    expect(links[0]!.codigo).toBe(primeiro.codigo)
  })

  it('estado estável (link já existe) não abre transação nem toma a trava — só a primeira visita paga isso (fix round 1)', async () => {
    // `/conta` é force-dynamic e chama `linkPessoalDoUsuario` em TODA
    // visita: com o link já criado, abrir `db.transaction` (e dentro dela
    // `pg_advisory_xact_lock`) em toda visita não escala para 10 mil
    // usuários simultâneos. A primeira chamada cria de verdade; a segunda
    // — o estado estável — tem que ser a leitura simples, sem transação.
    const conta = await contaNova('estavel')
    const primeiro = await linkPessoalDoUsuario(banco.db, conta.id, AGORA)

    const transacao = vi.spyOn(banco.db, 'transaction')
    try {
      const segundo = await linkPessoalDoUsuario(banco.db, conta.id, AGORA)
      expect(segundo.codigo).toBe(primeiro.codigo)
      expect(transacao).not.toHaveBeenCalled()
    } finally {
      transacao.mockRestore()
    }
  })

  it('chamadas concorrentes do link pessoal não duplicam nem estouram o único', async () => {
    const conta = await contaNova('concorrente')
    const [a, b] = await Promise.all([
      linkPessoalDoUsuario(banco.db, conta.id, AGORA),
      linkPessoalDoUsuario(banco.db, conta.id, AGORA),
    ])
    expect(a.codigo).toBe(b.codigo)
  })

  it('código sorteado que colide com um existente: tenta outro em vez de falhar', async () => {
    const primeira = await contaNova('colisao-a')
    const { codigo: ocupado } = await linkPessoalDoUsuario(banco.db, primeira.id, AGORA)
    const segunda = await contaNova('colisao-b')
    const livre = `u-${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}`
    const sorteios = [ocupado, livre]
    const { codigo } = await linkPessoalDoUsuario(banco.db, segunda.id, AGORA, () =>
      sorteios.shift()!,
    )
    expect(codigo).toBe(livre)
    expect((await parceiroDaConta(segunda.id)).codigo).toBe(livre)
  })

  it('conta que já é parceiro convidado ganha o link CADASTRO sob o MESMO parceiro', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const { codigo } = await linkPessoalDoUsuario(banco.db, c.usuarioA.id, AGORA)
    const parceiros = await banco.db
      .select()
      .from(parceirosAfiliados)
      .where(eq(parceirosAfiliados.usuarioId, c.usuarioA.id))
    expect(parceiros).toHaveLength(1)
    expect(parceiros[0]!.id).toBe(c.parceiroA.id)
    expect(parceiros[0]!.tipo).toBe('PARCEIRO')
    const { destino } = await resolverLinkSemRegistrar(banco.db, codigo)
    expect(destino).toBe('/cadastrar')
  })

  it('link pessoal resolve para /cadastrar sem NENHUMA oferta ativa no banco', async () => {
    await cenarioDeAfiliados(banco.db)
    const conta = await contaNova('sem-oferta')
    const { codigo } = await linkPessoalDoUsuario(banco.db, conta.id, AGORA)
    await banco.db.update(ofertasAfiliados).set({ status: 'PAUSADA' })

    const { destino } = await resolverLinkSemRegistrar(banco.db, codigo)
    expect(destino).toBe('/cadastrar')

    // O clique também grava sem oferta, e o destino é o mesmo.
    const clique = await registrarClique(banco.db, {
      codigo,
      visitanteToken: `sem-oferta-${codigo}`,
      agora: AGORA,
      automatizado: false,
    })
    expect(clique.destino).toBe('/cadastrar')

    // A saída para a casa continua exigindo oferta: link de cadastro não tem casa.
    await expect(resolverDestinoDaCasaSemRegistrar(banco.db, codigo)).rejects.toThrow()
    await banco.db.update(ofertasAfiliados).set({ status: 'ATIVA' })
  })

  it('admin cria link de indicação para um parceiro, auditado, e ele resolve para /cadastrar', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const codigoPedido = `ind-${c.linkA.codigo}`
    const { codigo } = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação A', canal: 'SOCIAL', codigo: codigoPedido },
      AGORA,
    )
    expect(codigo).toBe(codigoPedido)
    const { destino } = await resolverLinkSemRegistrar(banco.db, codigo)
    expect(destino).toBe('/cadastrar')

    const [link] = await banco.db
      .select()
      .from(linksAfiliados)
      .where(eq(linksAfiliados.codigo, codigo))
    const [campanha] = await banco.db
      .select()
      .from(campanhasAfiliados)
      .where(eq(campanhasAfiliados.id, link!.campanhaId))
    expect(link!.tipoDestino).toBe('CADASTRO')
    expect(campanha!.finalidade).toBe('INDICACAO')
    expect(campanha!.ofertaId).toBeNull()
    const auditoria = await banco.db
      .select()
      .from(auditoriaAfiliados)
      .where(
        and(
          eq(auditoriaAfiliados.entidadeId, link!.id),
          eq(auditoriaAfiliados.acao, 'LINK_CRIADO'),
        ),
      )
    expect(auditoria).toHaveLength(1)
    expect(auditoria[0]!.atorUsuarioId).toBe(c.admin.usuarioId)
  })

  it('só admin cria link de indicação', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    await expect(
      criarLinkDeIndicacao(
        banco.db,
        { usuarioId: c.usuarioA.id, papel: 'USUARIO' },
        {
          parceiroId: c.parceiroA.id,
          nome: 'Indevida',
          canal: 'SOCIAL',
          codigo: `x-${c.linkA.codigo}`,
        },
        AGORA,
      ),
    ).rejects.toThrow('Acesso administrativo exigido')
  })

  // Controller ruling (Tarefa 2): `canal = 'usuario'` é reservado ao link
  // pessoal (`linkPessoalDoUsuario`/`CANAL_DO_LINK_PESSOAL`) — um link de
  // indicação do admin com esse canal se confundiria com o link pessoal na
  // busca de `codigoDoLinkPessoal`. A checagem é no SERVIÇO, não só no
  // formulário: case-insensitive e com espaço nas pontas, porque é assim que
  // um campo de texto chega.
  it('recusa canal "usuario" (reservado ao link pessoal do usuário comum)', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    await expect(
      criarLinkDeIndicacao(
        banco.db,
        c.admin,
        { parceiroId: c.parceiroA.id, nome: 'Indevida', canal: 'usuario', codigo: `us-${c.linkA.codigo}` },
        AGORA,
      ),
    ).rejects.toThrow('Canal reservado')
    await expect(
      criarLinkDeIndicacao(
        banco.db,
        c.admin,
        { parceiroId: c.parceiroA.id, nome: 'Indevida', canal: '  Usuario  ', codigo: `us2-${c.linkA.codigo}` },
        AGORA,
      ),
    ).rejects.toThrow('Canal reservado')
  })

  it('parceiro SUSPENSO, link pausado ou campanha não ATIVA: o resolvedor recusa', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const { codigo } = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      {
        parceiroId: c.parceiroA.id,
        nome: 'Indicação S',
        canal: 'SOCIAL',
        codigo: `s-${c.linkA.codigo}`,
      },
      AGORA,
    )
    await definirStatusParceiro(banco.db, c.admin, c.parceiroA.id, 'SUSPENSO', AGORA)
    await expect(resolverLinkSemRegistrar(banco.db, codigo)).rejects.toThrow('Link indisponível')
    await definirStatusParceiro(banco.db, c.admin, c.parceiroA.id, 'ATIVO', AGORA)

    const [link] = await banco.db
      .select()
      .from(linksAfiliados)
      .where(eq(linksAfiliados.codigo, codigo))
    await definirStatusLink(banco.db, c.admin, link!.id, false, AGORA)
    await expect(resolverLinkSemRegistrar(banco.db, codigo)).rejects.toThrow('Link indisponível')
    await definirStatusLink(banco.db, c.admin, link!.id, true, AGORA)

    await banco.db
      .update(campanhasAfiliados)
      .set({ status: 'PAUSADA' })
      .where(eq(campanhasAfiliados.id, link!.campanhaId))
    await expect(resolverLinkSemRegistrar(banco.db, codigo)).rejects.toThrow('Link indisponível')
  })

  it('o dono clicando no próprio link grava o CLIQUE e não cria atribuição', async () => {
    const dono = await contaNova('dono')
    const { codigo } = await linkPessoalDoUsuario(banco.db, dono.id, AGORA)
    const visitanteToken = `dono-${codigo}`
    const clique = await registrarClique(banco.db, {
      codigo,
      visitanteToken,
      usuarioId: dono.id,
      agora: AGORA,
      automatizado: false,
    })
    expect(clique.destino).toBe('/cadastrar')
    expect(clique.atribuicaoId).toBeNull()

    const visitanteHash = hashVisitante(visitanteToken)
    const eventos = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, visitanteHash))
    expect(eventos.map((e) => e.tipo)).toEqual(['CLIQUE'])
    const atribuicoes = await banco.db
      .select()
      .from(atribuicoesAfiliados)
      .where(eq(atribuicoesAfiliados.visitanteHash, visitanteHash))
    expect(atribuicoes).toHaveLength(0)
    const doDono = await banco.db
      .select()
      .from(atribuicoesAfiliados)
      .where(eq(atribuicoesAfiliados.usuarioId, dono.id))
    expect(doDono).toHaveLength(0)
  })

  it('parceiro clicando logado no próprio link de CASA segue com atribuição (regra de hoje)', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const visitanteToken = `dono-casa-${c.linkA.codigo}`
    const clique = await registrarClique(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken,
      usuarioId: c.usuarioA.id,
      agora: AGORA,
      automatizado: false,
    })
    expect(clique.parceiroTitularId).toBe(c.parceiroA.id)
    expect(clique.atribuicaoId).not.toBeNull()
    const eventos = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante(visitanteToken)))
    expect(eventos.map((e) => e.tipo).sort()).toEqual(['CLIQUE', 'SAIDA_CASA'])
    expect(eventos.every((e) => e.atribuicaoId === clique.atribuicaoId)).toBe(true)

    // Deslogado no próprio link de CASA e depois entrando: a associação é a de hoje.
    const tokenAnonimo = `dono-casa-anonimo-${c.linkA.codigo}`
    await registrarClique(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: tokenAnonimo,
      agora: AGORA,
      automatizado: false,
    })
    const dono = await contaNova('dono-casa')
    await banco.db
      .update(parceirosAfiliados)
      .set({ usuarioId: dono.id })
      .where(eq(parceirosAfiliados.id, c.parceiroA.id))
    await expect(
      associarVisitanteAoUsuario(banco.db, tokenAnonimo, dono.id, AGORA, 'LOGIN'),
    ).resolves.toEqual({ associada: true, conflito: false })
  })

  it('visitante indicado por B vira CADASTRO_NIP; B pelo próprio cookie não se indica', async () => {
    const b = await contaNova('indicador')
    const { codigo } = await linkPessoalDoUsuario(banco.db, b.id, AGORA)
    const parceiroB = await parceiroDaConta(b.id)

    // Um visitante anônimo clica e se cadastra como C.
    const tokenC = `visitante-c-${codigo}`
    await registrarClique(banco.db, {
      codigo,
      visitanteToken: tokenC,
      agora: AGORA,
      automatizado: false,
    })
    const c = await contaNova('indicado')
    const associacaoC = await associarVisitanteAoUsuario(
      banco.db,
      tokenC,
      c.id,
      new Date('2026-09-26T12:05:00.000Z'),
      'CADASTRO',
    )
    expect(associacaoC).toEqual({ associada: true, conflito: false })
    const cadastrosC = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(and(eq(eventosAfiliados.usuarioId, c.id), eq(eventosAfiliados.tipo, 'CADASTRO_NIP')))
    expect(cadastrosC).toHaveLength(1)
    const [atribuicaoC] = await banco.db
      .select()
      .from(atribuicoesAfiliados)
      .where(eq(atribuicoesAfiliados.usuarioId, c.id))
    expect(atribuicaoC!.parceiroId).toBe(parceiroB.id)

    // B clica deslogado no próprio link (não dá para saber que é ele) e depois
    // "se cadastra" com esse cookie: a associação é ignorada, nada é gravado.
    const tokenB = `visitante-b-${codigo}`
    await registrarClique(banco.db, {
      codigo,
      visitanteToken: tokenB,
      agora: AGORA,
      automatizado: false,
    })
    const associacaoB = await associarVisitanteAoUsuario(
      banco.db,
      tokenB,
      b.id,
      new Date('2026-09-26T12:06:00.000Z'),
      'CADASTRO',
    )
    expect(associacaoB).toEqual({ associada: false, conflito: false })
    const cadastrosB = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(and(eq(eventosAfiliados.usuarioId, b.id), eq(eventosAfiliados.tipo, 'CADASTRO_NIP')))
    expect(cadastrosB).toHaveLength(0)
    const [atribuicaoB] = await banco.db
      .select()
      .from(atribuicoesAfiliados)
      .where(eq(atribuicoesAfiliados.visitanteHash, hashVisitante(tokenB)))
    expect(atribuicaoB!.usuarioId).toBeNull()
    expect(atribuicaoB!.estado).toBe('ATIVA')
  })
})
