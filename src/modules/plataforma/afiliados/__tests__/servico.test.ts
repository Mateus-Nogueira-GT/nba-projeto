import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { casas, usuarios } from '@/modules/dominio/db/schema'
import {
  aceitarConvite,
  associarVisitanteAoUsuario,
  confirmarImportacao,
  criarAcordo,
  criarCampanhaComLink,
  criarConvite,
  criarOferta,
  criarParceiro,
  criarPreviaImportacao,
  definirStatusLink,
  definirStatusOferta,
  definirStatusParceiro,
  liberarComissao,
  painelDoAfiliado,
  registrarAjusteComissao,
  registrarClique,
  registrarRecebimentoCasa,
  registrarRepasse,
  registrarSaidaParaCasa,
  registrarVisitaNip,
  resolverDestinoDaCasaSemRegistrar,
} from '../servico'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco?.fechar()
})

async function contexto() {
  const sufixo = Math.random().toString(36).slice(2)
  const [admin, usuarioA, usuarioB] = await banco.db
    .insert(usuarios)
    .values([
      { email: `admin-${sufixo}@teste.com`, senhaHash: 'x', papel: 'ADMIN' },
      { email: `a-${sufixo}@teste.com`, senhaHash: 'x' },
      { email: `b-${sufixo}@teste.com`, senhaHash: 'x' },
    ])
    .returning()
  const [casa] = await banco.db
    .insert(casas)
    .values({ nome: `Casa ${sufixo}` })
    .returning()
  const atorAdmin = { usuarioId: admin!.id, papel: 'ADMIN' as const }
  const parceiroA = await criarParceiro(
    banco.db,
    atorAdmin,
    { usuarioId: usuarioA!.id, codigo: `a-${sufixo}`, nomePublico: 'Parceiro A' },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  const parceiroB = await criarParceiro(
    banco.db,
    atorAdmin,
    { usuarioId: usuarioB!.id, codigo: `b-${sufixo}`, nomePublico: 'Parceiro B' },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  const oferta = await criarOferta(
    banco.db,
    atorAdmin,
    {
      casaId: casa!.id,
      nome: `Oferta ${sufixo}`,
      modalidade: 'HIBRIDO',
      moeda: 'BRL',
      urlDestino: 'https://ofertas.casa.test/nba',
      hostDestino: 'ofertas.casa.test',
      status: 'ATIVA',
    },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  const acordoA = await criarAcordo(
    banco.db,
    atorAdmin,
    {
      parceiroId: parceiroA.id,
      ofertaId: oferta.id,
      moeda: 'BRL',
      percentualPontosBase: 4_000,
      inicio: new Date('2026-09-01T00:00:00.000Z'),
    },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  const linkA = await criarCampanhaComLink(
    banco.db,
    atorAdmin,
    {
      parceiroId: parceiroA.id,
      ofertaId: oferta.id,
      nome: `Campanha A ${sufixo}`,
      canal: 'SOCIAL',
      codigo: `nip-a-${sufixo}`,
      tipoDestino: 'CASA',
      utms: { utm_source: 'parceiro-a', utm_medium: 'affiliate' },
    },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  const linkB = await criarCampanhaComLink(
    banco.db,
    atorAdmin,
    {
      parceiroId: parceiroB.id,
      ofertaId: oferta.id,
      nome: `Campanha B ${sufixo}`,
      canal: 'SOCIAL',
      codigo: `nip-b-${sufixo}`,
      tipoDestino: 'NIP',
      caminhoNip: `/oferta/nip-b-${sufixo}`,
    },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  return {
    admin: atorAdmin,
    usuarioA: usuarioA!,
    usuarioB: usuarioB!,
    parceiroA,
    parceiroB,
    oferta,
    acordoA,
    linkA,
    linkB,
  }
}

describe('operação de afiliados', () => {
  it('autoriza somente admin nas configurações e mantém portal independente da assinatura', async () => {
    const c = await contexto()
    await expect(
      criarParceiro(
        banco.db,
        { usuarioId: c.usuarioA.id, papel: 'USUARIO' },
        { usuarioId: c.usuarioA.id, codigo: 'indevido', nomePublico: 'Indevido' },
        new Date(),
      ),
    ).rejects.toThrow('Acesso administrativo exigido')

    const painelA = await painelDoAfiliado(banco.db, c.usuarioA.id)
    expect(painelA.parceiro.id).toBe(c.parceiroA.id)
    await expect(
      painelDoAfiliado(banco.db, '11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('Acesso de afiliado exigido')
  })

  it('preserva o primeiro afiliado por 30 dias e registra cada link clicado', async () => {
    const c = await contexto()
    const primeiro = await registrarClique(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-primeiro-toque',
      agora: new Date('2026-09-02T00:00:00.000Z'),
      automatizado: false,
    })
    const segundo = await registrarClique(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: 'visitante-primeiro-toque',
      agora: new Date('2026-09-12T00:00:00.000Z'),
      automatizado: false,
    })

    expect(primeiro.parceiroTitularId).toBe(c.parceiroA.id)
    expect(segundo.parceiroTitularId).toBe(c.parceiroA.id)
    expect(segundo.destino).toBe(`/oferta/${c.linkB.codigo}`)
    await registrarVisitaNip(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: 'visitante-primeiro-toque',
      agora: new Date('2026-09-12T00:01:00.000Z'),
    })
    expect(await resolverDestinoDaCasaSemRegistrar(banco.db, c.linkB.codigo)).toContain(
      'https://ofertas.casa.test/nba',
    )
    expect(
      await registrarSaidaParaCasa(banco.db, {
        codigo: c.linkB.codigo,
        visitanteToken: 'visitante-primeiro-toque',
        agora: new Date('2026-09-12T00:02:00.000Z'),
      }),
    ).toContain('https://ofertas.casa.test/nba')
    const previaDivergente = await criarPreviaImportacao(
      banco.db,
      c.admin,
      {
        ofertaId: c.oferta.id,
        arquivoNome: 'divergencia.csv',
        conteudo: [
          'id_externo;indicado;data_evento;tipo;moeda;cpa_centavos;revshare_centavos;total_centavos;codigo_link;atribuicao_id;acordo_id',
          `div-${c.linkB.codigo};pessoa@teste.com;2026-09-12T00:03:00.000Z;CPA;BRL;1000;;;${c.linkB.codigo};${segundo.atribuicaoId};${c.acordoA.id}`,
        ].join('\n'),
      },
      new Date('2026-09-12T01:00:00.000Z'),
    )
    expect(previaDivergente).toMatchObject({ validas: 0, pendentes: 1 })
    await expect(
      confirmarImportacao(
        banco.db,
        c.admin,
        previaDivergente.loteId,
        new Date('2026-09-12T02:00:00.000Z'),
      ),
    ).rejects.toThrow('pendências')
    expect((await painelDoAfiliado(banco.db, c.usuarioA.id)).totais.cliquesObservados).toBe(1)
    expect((await painelDoAfiliado(banco.db, c.usuarioB.id)).totais.cliquesObservados).toBe(1)
  })

  it('confirma CSV uma vez, calcula a parcela e controla repasse manual parcial', async () => {
    const c = await contexto()
    const clique = await registrarClique(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: `conversao-${c.linkA.codigo}`,
      agora: new Date('2026-09-02T10:00:00.000Z'),
      automatizado: false,
    })
    const csv = [
      'id_externo;indicado;data_evento;tipo;moeda;cpa_centavos;revshare_centavos;total_centavos;codigo_link;atribuicao_id;acordo_id',
      `evt-${c.linkA.codigo};mateus@teste.com;2026-09-08T10:00:00.000Z;HIBRIDO;BRL;10000;2500;12500;${c.linkA.codigo};${clique.atribuicaoId};${c.acordoA.id}`,
    ].join('\n')
    const importadoEm = new Date('2026-09-08T11:00:00.000Z')
    const previa = await criarPreviaImportacao(
      banco.db,
      c.admin,
      { ofertaId: c.oferta.id, arquivoNome: 'relatorio.csv', conteudo: csv },
      importadoEm,
    )
    const repetida = await criarPreviaImportacao(
      banco.db,
      c.admin,
      { ofertaId: c.oferta.id, arquivoNome: 'relatorio-copia.csv', conteudo: csv },
      importadoEm,
    )
    expect(repetida).toMatchObject({ loteId: previa.loteId, reutilizada: true })

    const confirmada = await confirmarImportacao(
      banco.db,
      c.admin,
      previa.loteId,
      new Date('2026-09-08T12:00:00.000Z'),
    )
    expect(confirmada).toMatchObject({
      comissoesCriadas: 1,
      baseNipCentavos: 12_500,
      parcelaParceirosCentavos: 5_000,
    })
    const confirmadaNovamente = await confirmarImportacao(
      banco.db,
      c.admin,
      previa.loteId,
      new Date('2026-09-08T12:01:00.000Z'),
    )
    expect(confirmadaNovamente.comissoesCriadas).toBe(0)

    const tentativasLiberacao = await Promise.allSettled([
      liberarComissao(
        banco.db,
        c.admin,
        { comissaoId: confirmada.comissaoIds[0]!, valorCentavos: 3_000, motivo: 'lote A' },
        new Date('2026-09-09T00:00:00.000Z'),
      ),
      liberarComissao(
        banco.db,
        c.admin,
        { comissaoId: confirmada.comissaoIds[0]!, valorCentavos: 3_000, motivo: 'lote B' },
        new Date('2026-09-09T00:00:00.000Z'),
      ),
    ])
    expect(
      tentativasLiberacao.filter((resultado) => resultado.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(tentativasLiberacao.filter((resultado) => resultado.status === 'rejected')).toHaveLength(
      1,
    )
    const liberacao = tentativasLiberacao.find((resultado) => resultado.status === 'fulfilled')
    if (!liberacao || liberacao.status !== 'fulfilled')
      throw new Error('Liberação esperada ausente')
    const repasse = await registrarRepasse(
      banco.db,
      c.admin,
      {
        parceiroId: c.parceiroA.id,
        moeda: 'BRL',
        valorCentavos: 2_000,
        referenciaExterna: `pix-${c.linkA.codigo}`,
        pagoEm: new Date('2026-09-10T00:00:00.000Z'),
        alocacoes: [{ liberacaoId: liberacao.value.id, valorCentavos: 2_000 }],
      },
      new Date('2026-09-10T00:00:00.000Z'),
    )
    expect(repasse.valorCentavos).toBe(2_000)
    await expect(
      registrarRepasse(
        banco.db,
        c.admin,
        {
          parceiroId: c.parceiroA.id,
          moeda: 'BRL',
          valorCentavos: 2_000,
          referenciaExterna: `pix-excesso-${c.linkA.codigo}`,
          pagoEm: new Date('2026-09-10T00:01:00.000Z'),
          alocacoes: [{ liberacaoId: liberacao.value.id, valorCentavos: 2_000 }],
        },
        new Date('2026-09-10T00:01:00.000Z'),
      ),
    ).rejects.toThrow('supera o saldo liberado')
  })

  it('mantém recebimento, ajuste e pausas como decisões administrativas auditáveis', async () => {
    const c = await contexto()
    const agora = new Date('2026-09-15T10:00:00.000Z')
    const recebimento = await registrarRecebimentoCasa(
      banco.db,
      c.admin,
      {
        casaId: c.oferta.casaId,
        moeda: 'BRL',
        valorCentavos: 8_000,
        recebidoEm: agora,
        referenciaExterna: `ted-${c.linkA.codigo}`,
      },
      agora,
    )
    expect(recebimento.valorCentavos).toBe(8_000)

    const clique = await registrarClique(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: `ajuste-${c.linkA.codigo}`,
      agora: new Date('2026-09-02T10:00:00.000Z'),
      automatizado: false,
    })

    const csv = [
      'id_externo;indicado;data_evento;tipo;moeda;cpa_centavos;revshare_centavos;total_centavos;codigo_link;atribuicao_id;acordo_id',
      `ajuste-${c.linkA.codigo};ma***@teste.com;2026-09-08T10:00:00.000Z;CPA;BRL;10000;;;${c.linkA.codigo};${clique.atribuicaoId};${c.acordoA.id}`,
    ].join('\n')
    const previa = await criarPreviaImportacao(
      banco.db,
      c.admin,
      { ofertaId: c.oferta.id, arquivoNome: 'ajuste.csv', conteudo: csv },
      agora,
    )
    const confirmada = await confirmarImportacao(banco.db, c.admin, previa.loteId, agora)
    const ajuste = await registrarAjusteComissao(
      banco.db,
      c.admin,
      {
        comissaoOriginalId: confirmada.comissaoIds[0]!,
        baseNipCentavos: -1_000,
        motivo: 'Correção recebida da casa',
      },
      new Date('2026-09-16T10:00:00.000Z'),
    )
    expect(ajuste).toMatchObject({ baseNipCentavos: -1_000, parcelaParceiroCentavos: -400 })

    await definirStatusLink(banco.db, c.admin, c.linkA.id, false, agora)
    await expect(
      registrarClique(banco.db, {
        codigo: c.linkA.codigo,
        visitanteToken: 'visitante-link-pausado',
        agora,
        automatizado: false,
      }),
    ).rejects.toThrow('Link indisponível')

    await definirStatusLink(banco.db, c.admin, c.linkA.id, true, agora)
    await definirStatusOferta(banco.db, c.admin, c.oferta.id, 'PAUSADA', agora)
    await expect(
      registrarClique(banco.db, {
        codigo: c.linkA.codigo,
        visitanteToken: 'visitante-oferta-pausada',
        agora,
        automatizado: false,
      }),
    ).rejects.toThrow('Oferta indisponível')
    await definirStatusOferta(banco.db, c.admin, c.oferta.id, 'ATIVA', agora)
    await definirStatusParceiro(banco.db, c.admin, c.parceiroA.id, 'SUSPENSO', agora)
    await expect(painelDoAfiliado(banco.db, c.usuarioA.id)).rejects.toThrow(
      'Acesso de afiliado exigido',
    )
  })

  it('protege convite por e-mail e associa a atribuição à conta sem renovar a janela', async () => {
    const c = await contexto()
    const agora = new Date('2026-09-03T10:00:00.000Z')
    const visitanteToken = 'visitante-associacao-login'
    const clique = await registrarClique(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken,
      agora,
      automatizado: false,
    })
    const associacao = await associarVisitanteAoUsuario(
      banco.db,
      visitanteToken,
      c.usuarioB.id,
      new Date('2026-09-04T10:00:00.000Z'),
    )
    expect(associacao).toEqual({ associada: true, conflito: false })
    expect(clique.atribuicaoExpiraEm).toEqual(new Date('2026-10-03T10:00:00.000Z'))

    const [usuarioConvidado] = await banco.db
      .insert(usuarios)
      .values({ email: `convite-${c.linkA.codigo}@teste.com`, senhaHash: 'x' })
      .returning()
    const convite = await criarConvite(
      banco.db,
      c.admin,
      {
        email: usuarioConvidado!.email,
        nomePublico: 'Conta convidada',
        expiraEm: new Date('2026-09-10T10:00:00.000Z'),
      },
      agora,
    )
    await expect(aceitarConvite(banco.db, c.usuarioA.id, convite.token, agora)).rejects.toThrow(
      'outro e-mail',
    )
    const parceiro = await aceitarConvite(banco.db, usuarioConvidado!.id, convite.token, agora)
    expect(parceiro.usuarioId).toBe(usuarioConvidado!.id)
    await expect(
      aceitarConvite(banco.db, usuarioConvidado!.id, convite.token, agora),
    ).rejects.toThrow('inválido ou expirado')
  })
})
