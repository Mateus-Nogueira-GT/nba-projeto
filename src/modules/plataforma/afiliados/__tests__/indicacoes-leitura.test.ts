import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  atribuicoesAfiliados,
  direitosAcesso,
  parceirosAfiliados,
  usuarios,
} from '@/modules/dominio/db/schema'

import { excluirUsuario } from '../../admin/usuarios'
import { concederCortesia } from '../../assinatura/direito'
import { criarLinkDeIndicacao, linkPessoalDoUsuario, registrarAssinaturaIndicada } from '../indicacoes'
import { listarIndicacoes } from '../indicacoes'
import { associarVisitanteAoUsuario, painelAdministrativo, painelDoAfiliado, registrarClique } from '../servico'
import { cenarioDeAfiliados } from './cenario'

/**
 * Task 4: as duas LEITURAS que nascem do rastreamento de indicações — a lista
 * completa (só o admin, com nome/e-mail) e os totais que alimentam o painel do
 * parceiro (sem nome/e-mail nenhum) e o painel administrativo.
 */
let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco?.fechar()
})

async function contaNova(rotulo: string) {
  const sufixo = Math.random().toString(36).slice(2)
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: `${rotulo}-${sufixo}@teste.com`, senhaHash: 'x' })
    .returning()
  return usuario!
}

/** Clica no `codigo` e se cadastra por ele, no instante `quando`. */
async function cadastrarViaLink(codigo: string, rotulo: string, quando: Date) {
  const token = `visitante-${rotulo}-${Math.random().toString(36).slice(2)}`
  await registrarClique(banco.db, { codigo, visitanteToken: token, agora: quando, automatizado: false })
  const conta = await contaNova(rotulo)
  await associarVisitanteAoUsuario(banco.db, token, conta.id, quando, 'CADASTRO')
  return conta
}

describe('listarIndicacoes', () => {
  it('uma linha por CADASTRO_NIP não-CONFLITO; filtros de tipo, parceiro e período; mais recente primeiro', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    // parceiroA (tipo PARCEIRO) ganha um link de indicação criado pelo admin.
    const linkDeA = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação A', canal: 'SOCIAL', codigo: `ind-a-${c.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    // B é conta comum com link pessoal (tipo USUARIO).
    const b = await contaNova('indicador-b')
    const linkDeB = await linkPessoalDoUsuario(banco.db, b.id, new Date('2026-09-01T00:00:00.000Z'))

    const dia1 = new Date('2026-09-10T12:00:00.000Z')
    const dia2 = new Date('2026-09-15T12:00:00.000Z')
    const dia3 = new Date('2026-09-20T12:00:00.000Z')
    const indicadoA1 = await cadastrarViaLink(linkDeA.codigo, 'de-a-1', dia1)
    const indicadoA2 = await cadastrarViaLink(linkDeA.codigo, 'de-a-2', dia2)
    const indicadoB1 = await cadastrarViaLink(linkDeB.codigo, 'de-b-1', dia3)

    // Uma atribuição em CONFLITO (outra conta usando o mesmo cookie): nunca aparece.
    const conflitante = await cadastrarViaLink(linkDeA.codigo, 'conflito', dia2)
    await banco.db
      .update(atribuicoesAfiliados)
      .set({ estado: 'CONFLITO' })
      .where(eq(atribuicoesAfiliados.usuarioId, conflitante.id))

    // Uma assinatura para um indicado de A.
    const aprovadoEm = new Date('2026-09-21T00:00:00.000Z')
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: indicadoA1.id,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm,
    })

    const agora = new Date('2026-09-26T00:00:00.000Z')

    // Sem filtro: as 3 linhas válidas, mais recente primeiro.
    const tudo = await listarIndicacoes(banco.db, {}, agora)
    expect(tudo.totais).toEqual({ cadastros: 3, assinaturas: 1 })
    expect(tudo.linhas.map((l) => l.indicado.usuarioId)).toEqual([
      indicadoB1.id,
      indicadoA2.id,
      indicadoA1.id,
    ])
    expect(tudo.linhas.some((l) => l.indicado.usuarioId === conflitante.id)).toBe(false)

    const linhaA1 = tudo.linhas.find((l) => l.indicado.usuarioId === indicadoA1.id)!
    expect(linhaA1.indicador).toEqual({ parceiroId: c.parceiroA.id, tipo: 'PARCEIRO', nome: 'Parceiro A' })
    expect(linhaA1.linkCodigo).toBe(linkDeA.codigo)
    expect(linhaA1.indicado.email).toBe(indicadoA1.email)
    expect(linhaA1.assinatura).toEqual({
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm,
    })
    expect(linhaA1.situacao).toBe('SEM_ASSINATURA') // registrou o evento, mas não há assinaturas/direitos_acesso ainda

    const linhaB1 = tudo.linhas.find((l) => l.indicado.usuarioId === indicadoB1.id)!
    expect(linhaB1.indicador.tipo).toBe('USUARIO')
    expect(linhaB1.indicador.parceiroId).not.toBe(c.parceiroA.id)
    expect(linhaB1.indicador.nome).toBe(b.email) // sem nome cadastrado: cai no e-mail
    expect(linhaB1.assinatura).toBeNull()

    // Filtro por tipo.
    const soParceiro = await listarIndicacoes(banco.db, { tipoIndicador: 'PARCEIRO' }, agora)
    expect(soParceiro.linhas.map((l) => l.indicado.usuarioId).sort()).toEqual(
      [indicadoA1.id, indicadoA2.id].sort(),
    )
    const soUsuario = await listarIndicacoes(banco.db, { tipoIndicador: 'USUARIO' }, agora)
    expect(soUsuario.linhas.map((l) => l.indicado.usuarioId)).toEqual([indicadoB1.id])

    // Filtro por parceiro.
    const deA = await listarIndicacoes(banco.db, { parceiroId: c.parceiroA.id }, agora)
    expect(deA.totais).toEqual({ cadastros: 2, assinaturas: 1 })

    // Filtro por período: início inclusivo, fim exclusivo, pela data do CADASTRO.
    const noPeriodo = await listarIndicacoes(
      banco.db,
      { inicio: dia1, fim: dia2 },
      agora,
    )
    expect(noPeriodo.linhas.map((l) => l.indicado.usuarioId)).toEqual([indicadoA1.id])
  })

  it('conta ligada só por LOGIN (sem CADASTRO_NIP) não aparece nem conta', async () => {
    const b = await contaNova('indicador-login')
    const { codigo } = await linkPessoalDoUsuario(banco.db, b.id, new Date('2026-09-01T00:00:00.000Z'))
    const token = `visitante-login-${Math.random().toString(36).slice(2)}`
    const quando = new Date('2026-09-10T12:00:00.000Z')
    await registrarClique(banco.db, { codigo, visitanteToken: token, agora: quando, automatizado: false })
    const jaTinhaConta = await contaNova('ja-tinha-conta')
    await associarVisitanteAoUsuario(banco.db, token, jaTinhaConta.id, quando, 'LOGIN')

    // Isolado pelo PRÓPRIO parceiro de B: o banco de teste é compartilhado
    // entre os `it`s deste arquivo, então um total SEM filtro somaria as
    // indicações plantadas pelos outros testes.
    const [parceiroB] = await banco.db
      .select({ id: parceirosAfiliados.id })
      .from(parceirosAfiliados)
      .where(eq(parceirosAfiliados.usuarioId, b.id))
    const resultado = await listarIndicacoes(
      banco.db,
      { parceiroId: parceiroB!.id },
      new Date('2026-09-26T00:00:00.000Z'),
    )
    expect(resultado.linhas.some((l) => l.indicado.usuarioId === jaTinhaConta.id)).toBe(false)
    expect(resultado.totais).toEqual({ cadastros: 0, assinaturas: 0 })
  })

  it('situação segue a assinatura: cancelamento mostra CANCELADA; nova TEMPORADA depois mostra ATIVA', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const linkDeA = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação Situação', canal: 'SOCIAL', codigo: `ind-sit-${c.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    const quando = new Date('2026-09-10T12:00:00.000Z')
    const indicado = await cadastrarViaLink(linkDeA.codigo, 'situacao', quando)
    // A situação só é lida de quem ASSINOU por pagamento (revisão final, item
    // 6): sem o ASSINATURA_NIP a linha seria SEM_ASSINATURA de todo jeito.
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: indicado.id,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm: new Date('2026-09-10T00:00:00.000Z'),
    })

    // Assinatura MENSAL cancelada: direito ainda vigente (o webhook preserva o
    // período já pago), mas o status do CONTRATO é CANCELADA.
    await banco.db.insert(assinaturas).values({
      usuarioId: indicado.id,
      status: 'CANCELADA',
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      atualizadoEm: new Date('2026-09-15T00:00:00.000Z'),
    })
    await banco.db.insert(direitosAcesso).values({
      usuarioId: indicado.id,
      produto: 'NBA_PRO',
      origem: 'fake',
      referenciaOrigem: `mensal-${indicado.id}`,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      inicio: new Date('2026-09-10T00:00:00.000Z'),
      fim: new Date('2026-10-10T00:00:00.000Z'),
    })

    const agora = new Date('2026-09-16T00:00:00.000Z')
    const comCancelamento = await listarIndicacoes(banco.db, {}, agora)
    expect(comCancelamento.linhas.find((l) => l.indicado.usuarioId === indicado.id)!.situacao).toBe(
      'CANCELADA',
    )

    // Depois do cancelamento, compra uma TEMPORADA nova — contrato mais
    // recente (por atualizado_em) e direito mais recente (por início) mudam.
    await banco.db.insert(assinaturas).values({
      usuarioId: indicado.id,
      status: 'ATIVA',
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
      atualizadoEm: new Date('2026-09-20T00:00:00.000Z'),
    })
    await banco.db.insert(direitosAcesso).values({
      usuarioId: indicado.id,
      produto: 'NBA_PRO',
      origem: 'fake',
      referenciaOrigem: `temporada-${indicado.id}`,
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
      inicio: new Date('2026-09-20T00:00:00.000Z'),
      fim: new Date('2027-07-01T00:00:00.000Z'),
    })

    const depoisDaTemporada = await listarIndicacoes(banco.db, {}, new Date('2026-09-21T00:00:00.000Z'))
    expect(
      depoisDaTemporada.linhas.find((l) => l.indicado.usuarioId === indicado.id)!.situacao,
    ).toBe('ATIVA')
  })

  it('direito FUTURO nunca decide a situação — Fix round 1', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const linkDeA = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação Futuro', canal: 'SOCIAL', codigo: `ind-fut-${c.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    const agora = new Date('2026-09-16T00:00:00.000Z')

    // (a) direito vigente + direito FUTURO (início mais tarde que o vigente,
    // por isso `order by inicio desc` sozinho o escolheria errado): a
    // situação usa o VIGENTE.
    const comVigenteEFuturo = await cadastrarViaLink(
      linkDeA.codigo,
      'vigente-e-futuro',
      new Date('2026-09-10T12:00:00.000Z'),
    )
    // Assinou por pagamento — ver o item 6 da revisão final.
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: comVigenteEFuturo.id,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm: new Date('2026-09-01T00:00:00.000Z'),
    })
    await banco.db.insert(direitosAcesso).values([
      {
        usuarioId: comVigenteEFuturo.id,
        produto: 'NBA_PRO',
        origem: 'fake',
        referenciaOrigem: `vigente-${comVigenteEFuturo.id}`,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
        inicio: new Date('2026-09-01T00:00:00.000Z'),
        fim: new Date('2026-10-01T00:00:00.000Z'),
      },
      {
        usuarioId: comVigenteEFuturo.id,
        produto: 'NBA_PRO',
        origem: 'fake',
        referenciaOrigem: `futuro-${comVigenteEFuturo.id}`,
        nivelDoPlano: 'ALL_STAR',
        modalidade: 'TEMPORADA',
        inicio: new Date('2026-11-01T00:00:00.000Z'),
        fim: new Date('2027-07-01T00:00:00.000Z'),
      },
    ])

    // (b) só direito FUTURO, nenhum vigente: NÃO é ATIVA (não começou ainda).
    const soFuturo = await cadastrarViaLink(
      linkDeA.codigo,
      'so-futuro',
      new Date('2026-09-11T12:00:00.000Z'),
    )
    await banco.db.insert(direitosAcesso).values({
      usuarioId: soFuturo.id,
      produto: 'NBA_PRO',
      origem: 'fake',
      referenciaOrigem: `so-futuro-${soFuturo.id}`,
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
      inicio: new Date('2026-11-01T00:00:00.000Z'),
      fim: new Date('2027-07-01T00:00:00.000Z'),
    })

    const resultado = await listarIndicacoes(banco.db, { parceiroId: c.parceiroA.id }, agora)
    expect(
      resultado.linhas.find((l) => l.indicado.usuarioId === comVigenteEFuturo.id)!.situacao,
    ).toBe('ATIVA')
    expect(resultado.linhas.find((l) => l.indicado.usuarioId === soFuturo.id)!.situacao).not.toBe(
      'ATIVA',
    )
  })
})

describe('revisão final — situação da indicação', () => {
  it('upgrade: o contrato antigo cancelado pela troca, escrito DEPOIS do novo, não vence o novo ATIVO (item 2)', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const linkDeA = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação Upgrade', canal: 'SOCIAL', codigo: `ind-upg-${c.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    const indicado = await cadastrarViaLink(linkDeA.codigo, 'upgrade', new Date('2026-09-10T12:00:00.000Z'))
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: indicado.id,
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'MENSAL',
      aprovadoEm: new Date('2026-09-10T13:00:00.000Z'),
    })
    // O contrato NOVO (upgrade para MVP) nasce ativo às 10:00 do dia 20…
    await banco.db.insert(assinaturas).values({
      usuarioId: indicado.id,
      status: 'ATIVA',
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      atualizadoEm: new Date('2026-09-20T10:00:00.000Z'),
    })
    // …e o ANTIGO é marcado CANCELADA pela substituição logo depois — a
    // última escrita é a do contrato que morreu.
    await banco.db.insert(assinaturas).values({
      usuarioId: indicado.id,
      status: 'CANCELADA',
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'MENSAL',
      canceladaEm: new Date('2026-09-20T10:00:01.000Z'),
      atualizadoEm: new Date('2026-09-20T10:00:01.000Z'),
    })
    await banco.db.insert(direitosAcesso).values({
      usuarioId: indicado.id,
      produto: 'NBA_PRO',
      origem: 'fake',
      referenciaOrigem: `upgrade-${indicado.id}`,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      inicio: new Date('2026-09-20T10:00:00.000Z'),
      fim: new Date('2026-10-20T10:00:00.000Z'),
    })

    const r = await listarIndicacoes(banco.db, { parceiroId: c.parceiroA.id }, new Date('2026-09-21T00:00:00.000Z'))
    expect(r.linhas.find((l) => l.indicado.usuarioId === indicado.id)!.situacao).toBe('ATIVA')
  })

  it('conta indicada só com CORTESIA_ADMIN (nunca pagou) é SEM_ASSINATURA, coerente com "não assinou" (item 6)', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const linkDeA = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação Cortesia', canal: 'SOCIAL', codigo: `ind-cort-${c.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    const indicado = await cadastrarViaLink(linkDeA.codigo, 'cortesia', new Date('2026-09-10T12:00:00.000Z'))
    await concederCortesia(banco.db, {
      usuarioId: indicado.id,
      referencia: `cortesia-${indicado.id}`,
      inicio: new Date('2026-09-11T00:00:00.000Z'),
      fim: null,
      nivelDoPlano: 'MVP',
    })

    const r = await listarIndicacoes(banco.db, { parceiroId: c.parceiroA.id }, new Date('2026-09-21T00:00:00.000Z'))
    const linha = r.linhas.find((l) => l.indicado.usuarioId === indicado.id)!
    expect(linha.assinatura).toBeNull()
    expect(linha.situacao).toBe('SEM_ASSINATURA')
  })
})

describe('revisão final — o parceiro USUARIO não vira parceiro de verdade', () => {
  it('conta comum que abriu /conta (link pessoal) não tem painel de afiliado (item 3)', async () => {
    const comum = await contaNova('comum-abriu-conta')
    await linkPessoalDoUsuario(banco.db, comum.id, new Date('2026-09-01T00:00:00.000Z'))
    await expect(painelDoAfiliado(banco.db, comum.id)).rejects.toThrow(/Acesso de afiliado exigido/)
  })

  it('painelAdministrativo não lista parceiros USUARIO, nem as campanhas e links deles (item 4)', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const comum = await contaNova('usuario-fora-do-admin')
    const { codigo } = await linkPessoalDoUsuario(banco.db, comum.id, new Date('2026-09-01T00:00:00.000Z'))
    const [doUsuario] = await banco.db
      .select({ id: parceirosAfiliados.id })
      .from(parceirosAfiliados)
      .where(eq(parceirosAfiliados.usuarioId, comum.id))

    const painel = await painelAdministrativo(banco.db, {}, { fuso: 'America/Sao_Paulo' })
    expect(painel.parceiros.some((p) => p.id === doUsuario!.id)).toBe(false)
    expect(painel.parceiros.every((p) => p.tipo === 'PARCEIRO')).toBe(true)
    expect(painel.campanhas.some((camp) => camp.parceiroId === doUsuario!.id)).toBe(false)
    expect(painel.links.some((l) => l.codigo === codigo)).toBe(false)
    // Os parceiros convidados continuam lá, com os links deles.
    expect(painel.parceiros.some((p) => p.id === c.parceiroA.id)).toBe(true)
    expect(painel.links.some((l) => l.codigo === c.linkA.codigo)).toBe(true)
  })
})

describe('totais de indicação nos painéis', () => {
  it('conta indicada apagada sai dos totais, como já sai da lista (item 8)', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const linkDeA = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação Apagada', canal: 'SOCIAL', codigo: `ind-apag-${c.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    const fica = await cadastrarViaLink(linkDeA.codigo, 'fica', new Date('2026-09-10T12:00:00.000Z'))
    const sai = await cadastrarViaLink(linkDeA.codigo, 'sai', new Date('2026-09-11T12:00:00.000Z'))
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: sai.id,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm: new Date('2026-09-12T00:00:00.000Z'),
    })
    await excluirUsuario(banco.db, sai.id)

    const painel = await painelDoAfiliado(banco.db, c.usuarioA.id)
    const lista = await listarIndicacoes(banco.db, { parceiroId: c.parceiroA.id }, new Date('2026-09-26T00:00:00.000Z'))
    expect(lista.linhas.map((l) => l.indicado.usuarioId)).toEqual([fica.id])
    expect(painel.totais.cadastros).toBe(lista.totais.cadastros)
    expect(painel.totais.assinaturas).toBe(lista.totais.assinaturas)
    expect(painel.totais).toMatchObject({ cadastros: 1, assinaturas: 0 })
  })

  it('painelDoAfiliado ganha cadastros/assinaturas do parceiro, sem nenhum e-mail no JSON', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const linkDeA = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação Painel', canal: 'SOCIAL', codigo: `ind-painel-${c.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    const dia1 = new Date('2026-09-10T12:00:00.000Z')
    const dia2 = new Date('2026-09-15T12:00:00.000Z')
    const indicado1 = await cadastrarViaLink(linkDeA.codigo, 'painel-1', dia1)
    await cadastrarViaLink(linkDeA.codigo, 'painel-2', dia2)
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: indicado1.id,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm: new Date('2026-09-16T00:00:00.000Z'),
    })

    const painel = await painelDoAfiliado(banco.db, c.usuarioA.id)
    expect(painel.totais.cadastros).toBe(2)
    expect(painel.totais.assinaturas).toBe(1)

    const serializado = JSON.stringify(painel)
    expect(serializado).not.toContain(indicado1.email)
    expect(serializado).not.toContain('painel-1')
    expect(serializado).not.toContain('painel-2')
    expect(serializado).not.toMatch(/@teste\.com/)
  })

  it('painelAdministrativo ganha os totais globais de cadastros/assinaturas', async () => {
    const c = await cenarioDeAfiliados(banco.db)
    const linkDeA = await criarLinkDeIndicacao(
      banco.db,
      c.admin,
      { parceiroId: c.parceiroA.id, nome: 'Indicação Admin', canal: 'SOCIAL', codigo: `ind-admin-${c.linkA.codigo}` },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    const dia1 = new Date('2026-09-10T12:00:00.000Z')
    const indicado1 = await cadastrarViaLink(linkDeA.codigo, 'admin-1', dia1)
    await registrarAssinaturaIndicada(banco.db, {
      usuarioId: indicado1.id,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      aprovadoEm: new Date('2026-09-16T00:00:00.000Z'),
    })

    const painel = await painelAdministrativo(banco.db, {}, { fuso: 'America/Sao_Paulo' })
    expect(painel.totais.cadastros).toBeGreaterThanOrEqual(1)
    expect(painel.totais.assinaturas).toBeGreaterThanOrEqual(1)
  })
})
