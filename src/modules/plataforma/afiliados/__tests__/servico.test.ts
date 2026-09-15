import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  atribuicoesAfiliados,
  auditoriaAfiliados,
  eventosAfiliados,
  linksAfiliados,
  usuarios,
} from '@/modules/dominio/db/schema'
import { montarChave } from '@/modules/motor/tipos'
import {
  aceitarConvite,
  associarVisitanteAoUsuario,
  confirmarImportacao,
  criarAcordo,
  criarConvite,
  criarParceiro,
  criarPreviaImportacao,
  definirSaidaDoApito,
  definirStatusLink,
  definirStatusOferta,
  definirStatusParceiro,
  hashVisitante,
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
import { apitoDeTeste, cenarioDeAfiliados } from './cenario'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco?.fechar()
})

const contexto = () => cenarioDeAfiliados(banco.db)

describe('operação de afiliados', () => {
  it('autoriza somente admin nas configurações e mantém portal independente da assinatura', async () => {
    const c = await contexto()
    await expect(
      criarParceiro(
        banco.db,
        { usuarioId: c.usuarioA.id, papel: 'USUARIO' },
        { codigo: 'indevido', nomePublico: 'Indevido' },
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
    expect(previa.totaisPorMoeda).toEqual([
      {
        moeda: 'BRL',
        baseCentavos: 12_500,
        componentesCentavos: 12_500,
        diferencaCentavos: 0,
      },
    ])
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
    const tentativasRepasse = await Promise.allSettled(
      ['a', 'b'].map((sufixo) =>
        registrarRepasse(
          banco.db,
          c.admin,
          {
            parceiroId: c.parceiroA.id,
            moeda: 'BRL',
            valorCentavos: 2_000,
            referenciaExterna: `pix-${sufixo}-${c.linkA.codigo}`,
            pagoEm: new Date('2026-09-10T00:00:00.000Z'),
            alocacoes: [{ liberacaoId: liberacao.value.id, valorCentavos: 2_000 }],
          },
          new Date('2026-09-10T00:00:00.000Z'),
        ),
      ),
    )
    expect(tentativasRepasse.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(
      1,
    )
    expect(tentativasRepasse.filter((resultado) => resultado.status === 'rejected')).toHaveLength(1)
    await expect(
      registrarRepasse(
        banco.db,
        c.admin,
        {
          parceiroId: c.parceiroB.id,
          moeda: 'BRL',
          valorCentavos: 500,
          referenciaExterna: `pix-parceiro-incorreto-${c.linkA.codigo}`,
          pagoEm: new Date('2026-09-10T00:01:00.000Z'),
          alocacoes: [{ liberacaoId: liberacao.value.id, valorCentavos: 500 }],
        },
        new Date('2026-09-10T00:01:00.000Z'),
      ),
    ).rejects.toThrow('incompatível')
    await expect(
      registrarRepasse(
        banco.db,
        c.admin,
        {
          parceiroId: c.parceiroA.id,
          moeda: 'BRL',
          valorCentavos: 1_200,
          referenciaExterna: `pix-alocacao-duplicada-${c.linkA.codigo}`,
          pagoEm: new Date('2026-09-10T00:02:00.000Z'),
          alocacoes: [
            { liberacaoId: liberacao.value.id, valorCentavos: 600 },
            { liberacaoId: liberacao.value.id, valorCentavos: 600 },
          ],
        },
        new Date('2026-09-10T00:02:00.000Z'),
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
    await expect(
      liberarComissao(
        banco.db,
        c.admin,
        { comissaoId: confirmada.comissaoIds[0]!, valorCentavos: 3_601, motivo: 'acima do saldo' },
        agora,
      ),
    ).rejects.toThrow('supera a comissão')
    const ajustePositivo = await registrarAjusteComissao(
      banco.db,
      c.admin,
      {
        comissaoOriginalId: confirmada.comissaoIds[0]!,
        baseNipCentavos: 1_000,
        motivo: 'Complemento recebido da casa',
      },
      new Date('2026-09-16T11:00:00.000Z'),
    )
    await expect(
      liberarComissao(
        banco.db,
        c.admin,
        { comissaoId: ajustePositivo.id, valorCentavos: 1, motivo: 'ajuste isolado' },
        agora,
      ),
    ).rejects.toThrow('comissão original')
    const liberacaoAjustada = await liberarComissao(
      banco.db,
      c.admin,
      { comissaoId: confirmada.comissaoIds[0]!, valorCentavos: 4_000, motivo: 'saldo ajustado' },
      agora,
    )
    await registrarAjusteComissao(
      banco.db,
      c.admin,
      {
        comissaoOriginalId: confirmada.comissaoIds[0]!,
        baseNipCentavos: -1_000,
        motivo: 'Redução posterior à liberação',
      },
      new Date('2026-09-16T12:00:00.000Z'),
    )
    await expect(
      registrarRepasse(
        banco.db,
        c.admin,
        {
          parceiroId: c.parceiroA.id,
          moeda: 'BRL',
          valorCentavos: 4_000,
          referenciaExterna: `pix-acima-saldo-liquido-${c.linkA.codigo}`,
          pagoEm: new Date('2026-09-17T10:00:00.000Z'),
          alocacoes: [{ liberacaoId: liberacaoAjustada.id, valorCentavos: 4_000 }],
        },
        new Date('2026-09-17T10:00:00.000Z'),
      ),
    ).rejects.toThrow('saldo líquido ajustado')

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
    await expect(
      definirStatusOferta(banco.db, c.admin, c.oferta.id, 'ATIVA', agora),
    ).rejects.toThrow('homologação')
    await definirStatusOferta(
      banco.db,
      c.admin,
      c.oferta.id,
      'ATIVA',
      agora,
      'Contrato, URL e teste de destino homologados',
    )
    await definirStatusParceiro(banco.db, c.admin, c.parceiroA.id, 'SUSPENSO', agora)
    await expect(painelDoAfiliado(banco.db, c.usuarioA.id)).rejects.toThrow(
      'Acesso de afiliado exigido',
    )
  })

  // ACHADO DA REVISÃO FINAL: definirSaidaDoApito morava em `entrega/`, sem
  // `exigirAdmin` nem `auditar` — a única mutação comercial da passada sem
  // trilha. Movida para cá, ao lado de `definirStatusLink`, sua vizinha
  // imediata.
  it('definirSaidaDoApito exige admin e grava a trilha de quem escolheu o parceiro', async () => {
    const c = await contexto()
    const agora = new Date('2026-09-13T10:00:00.000Z')

    await expect(
      definirSaidaDoApito(banco.db, { usuarioId: c.usuarioA.id, papel: 'USUARIO' }, c.linkA.id, agora),
    ).rejects.toThrow('Acesso administrativo exigido')

    await definirSaidaDoApito(banco.db, c.admin, c.linkA.id, agora)
    const [trilha] = await banco.db
      .select()
      .from(auditoriaAfiliados)
      .where(eq(auditoriaAfiliados.acao, 'SAIDA_DO_APITO_DEFINIDA'))
    expect(trilha).toMatchObject({
      atorUsuarioId: c.admin.usuarioId,
      entidade: 'LINK',
      entidadeId: c.linkA.id,
    })
  })

  it('linkId inexistente recusa em vez de só desmarcar a saída atual em silêncio', async () => {
    const c = await contexto()
    const agora = new Date('2026-09-13T10:00:00.000Z')
    await definirSaidaDoApito(banco.db, c.admin, c.linkA.id, agora)

    await expect(
      definirSaidaDoApito(banco.db, c.admin, '11111111-1111-4111-8111-111111111111', agora),
    ).rejects.toThrow('Link não encontrado')

    // A chamada recusada não pode ter limpado a marca que já existia.
    const [linkA] = await banco.db
      .select({ saidaDoApito: linksAfiliados.saidaDoApito })
      .from(linksAfiliados)
      .where(eq(linksAfiliados.id, c.linkA.id))
    expect(linkA?.saidaDoApito).toBe(true)
  })

  it('dois admins marcando ao mesmo tempo não estouram o índice único — o último a commitar vence', async () => {
    const c = await contexto()
    const agora = new Date('2026-09-13T10:00:00.000Z')

    // Concorrente de propósito (Promise.all, não sequencial): antes deste
    // achado, a corrida entre "desmarcar o velho" e "marcar o novo" de duas
    // chamadas podia intercalar e estourar o erro cru do índice único
    // parcial. As duas devem RESOLVER — nenhuma é logicamente inválida.
    await expect(
      Promise.all([
        definirSaidaDoApito(banco.db, c.admin, c.linkA.id, agora),
        definirSaidaDoApito(banco.db, c.admin, c.linkB.id, agora),
      ]),
    ).resolves.toBeDefined()

    const marcados = await banco.db
      .select({ id: linksAfiliados.id })
      .from(linksAfiliados)
      .where(eq(linksAfiliados.saidaDoApito, true))
    expect(marcados).toHaveLength(1)
    expect([c.linkA.id, c.linkB.id]).toContain(marcados[0]?.id)
  })

  it('protege convite, distingue cadastro de login e preserva primeiro toque entre dispositivos', async () => {
    const c = await contexto()
    const agora = new Date('2026-09-03T10:00:00.000Z')
    const visitanteToken = 'visitante-associacao-login'
    const [usuarioLogin, usuarioCadastro] = await banco.db
      .insert(usuarios)
      .values([
        { email: `login-${c.linkA.codigo}@teste.com`, senhaHash: 'x' },
        { email: `cadastro-${c.linkA.codigo}@teste.com`, senhaHash: 'x' },
      ])
      .returning()
    const clique = await registrarClique(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken,
      agora,
      automatizado: false,
    })
    const associacao = await associarVisitanteAoUsuario(
      banco.db,
      visitanteToken,
      usuarioLogin!.id,
      new Date('2026-09-04T10:00:00.000Z'),
      'LOGIN',
    )
    expect(associacao).toEqual({ associada: true, conflito: false })
    expect(clique.atribuicaoExpiraEm).toEqual(new Date('2026-10-03T10:00:00.000Z'))
    const eventosLogin = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(
        and(
          eq(eventosAfiliados.usuarioId, usuarioLogin!.id),
          eq(eventosAfiliados.tipo, 'CADASTRO_NIP'),
        ),
      )
    expect(eventosLogin).toHaveLength(0)

    const cliqueAutenticado = await registrarClique(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: 'visitante-autenticado-segundo-dispositivo',
      usuarioId: usuarioLogin!.id,
      agora: new Date('2026-09-05T09:00:00.000Z'),
      automatizado: false,
    })
    expect(cliqueAutenticado.parceiroTitularId).toBe(c.parceiroA.id)
    await registrarVisitaNip(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: 'visitante-autenticado-segundo-dispositivo',
      usuarioId: usuarioLogin!.id,
      agora: new Date('2026-09-05T09:01:00.000Z'),
    })
    await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: 'visitante-autenticado-segundo-dispositivo',
      usuarioId: usuarioLogin!.id,
      agora: new Date('2026-09-05T09:02:00.000Z'),
    })
    const trilhaAutenticada = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.usuarioId, usuarioLogin!.id))
    const eventosDaTrilha = trilhaAutenticada.filter((evento) =>
      ['CLIQUE', 'VISITA_NIP', 'SAIDA_CASA'].includes(evento.tipo),
    )
    expect(eventosDaTrilha).toHaveLength(3)
    expect(
      eventosDaTrilha.every((evento) => evento.atribuicaoId === cliqueAutenticado.atribuicaoId),
    ).toBe(true)
    await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken,
      usuarioId: usuarioCadastro!.id,
      agora: new Date('2026-09-05T09:03:00.000Z'),
    })
    const eventosCruzados = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.usuarioId, usuarioCadastro!.id))
    expect(eventosCruzados).toHaveLength(1)
    expect(eventosCruzados[0]!.atribuicaoId).toBeNull()
    const atribuicoesAtivasDaConta = await banco.db
      .select()
      .from(atribuicoesAfiliados)
      .where(
        and(
          eq(atribuicoesAfiliados.usuarioId, usuarioLogin!.id),
          eq(atribuicoesAfiliados.estado, 'ATIVA'),
        ),
      )
    expect(atribuicoesAtivasDaConta).toHaveLength(1)

    const segundoDispositivo = await registrarClique(banco.db, {
      codigo: c.linkB.codigo,
      visitanteToken: 'visitante-segundo-dispositivo',
      agora: new Date('2026-09-05T10:00:00.000Z'),
      automatizado: false,
    })
    const acordoB = await criarAcordo(
      banco.db,
      c.admin,
      {
        parceiroId: c.parceiroB.id,
        ofertaId: c.oferta.id,
        moeda: 'BRL',
        percentualPontosBase: 4_000,
        inicio: new Date('2026-09-01T00:00:00.000Z'),
      },
      new Date('2026-09-01T00:00:00.000Z'),
    )
    const previaConflitante = await criarPreviaImportacao(
      banco.db,
      c.admin,
      {
        ofertaId: c.oferta.id,
        arquivoNome: 'atribuicao-conflitante.csv',
        conteudo: [
          'id_externo;indicado;data_evento;tipo;moeda;cpa_centavos;revshare_centavos;total_centavos;codigo_link;atribuicao_id;acordo_id',
          `conflito-${c.linkB.codigo};pessoa@teste.com;2026-09-05T10:02:00.000Z;CPA;BRL;1000;;;${c.linkB.codigo};${segundoDispositivo.atribuicaoId};${acordoB.id}`,
        ].join('\n'),
      },
      new Date('2026-09-05T10:03:00.000Z'),
    )
    expect(previaConflitante).toMatchObject({ validas: 1, pendentes: 0 })
    await expect(
      associarVisitanteAoUsuario(
        banco.db,
        'visitante-segundo-dispositivo',
        usuarioLogin!.id,
        new Date('2026-09-05T10:01:00.000Z'),
        'LOGIN',
      ),
    ).resolves.toEqual({ associada: false, conflito: true })
    const [atribuicaoConflitante] = await banco.db
      .select()
      .from(atribuicoesAfiliados)
      .where(eq(atribuicoesAfiliados.id, segundoDispositivo.atribuicaoId))
    expect(atribuicaoConflitante!.estado).toBe('CONFLITO')
    await expect(
      confirmarImportacao(
        banco.db,
        c.admin,
        previaConflitante.loteId,
        new Date('2026-09-05T11:00:00.000Z'),
      ),
    ).rejects.toThrow('inválida ou conflitante')

    await registrarClique(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-associacao-cadastro',
      agora,
      automatizado: false,
    })
    await associarVisitanteAoUsuario(
      banco.db,
      'visitante-associacao-cadastro',
      usuarioCadastro!.id,
      new Date('2026-09-04T10:00:00.000Z'),
      'CADASTRO',
    )
    const eventosCadastro = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(
        and(
          eq(eventosAfiliados.usuarioId, usuarioCadastro!.id),
          eq(eventosAfiliados.tipo, 'CADASTRO_NIP'),
        ),
      )
    expect(eventosCadastro).toHaveLength(1)

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

describe('a saída para a casa carrega de qual apito nasceu', () => {
  it('com a chave do apito, o evento grava a origem', async () => {
    const c = await contexto()
    const { apito, chave } = await apitoDeTeste(banco.db)
    await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-com-origem',
      agora: new Date('2026-09-15T20:00:00.000Z'),
      chaveDoApito: chave,
    })
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-com-origem')))
    expect(evento!.tipo).toBe('SAIDA_CASA')
    expect(evento!.apitoId).toBe(apito.id)
  })

  it('apito de Fire Live (sem linha) também resolve — chave com o último segmento vazio', async () => {
    const c = await contexto()
    // Fire Live não tem linha: `linha` fica NULL no apito, e `montarChave`
    // produz o último segmento vazio (spec §10 — a origem viaja, mas nunca
    // casa com entrada registrada, porque a gestão exige linha).
    const { apito, chave } = await apitoDeTeste(banco.db, { estrategia: 'FIRE_LIVE', linha: null })
    expect(chave.endsWith('|')).toBe(true)
    await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-fire-live',
      agora: new Date('2026-09-15T20:00:00.000Z'),
      chaveDoApito: chave,
    })
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-fire-live')))
    expect(evento!.apitoId).toBe(apito.id)
  })

  it('sem chave nenhuma, continua funcionando como antes — origem nula', async () => {
    const c = await contexto()
    await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-sem-chave',
      agora: new Date('2026-09-15T20:00:00.000Z'),
    })
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-sem-chave')))
    expect(evento!.apitoId).toBeNull()
  })

  it('chave que não resolve grava SEM origem e não lança — nunca uma origem inventada', async () => {
    const c = await contexto()
    // Forjada: uuid válido, apito que não existe. É o que um parâmetro
    // adulterado na URL produz.
    const forjada = montarChave(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      'PONTOS',
      'LISTA_SECRETA',
      99,
    )
    const destino = await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-chave-forjada',
      agora: new Date('2026-09-15T20:00:00.000Z'),
      chaveDoApito: forjada,
    })
    expect(destino).toContain('https://')
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-chave-forjada')))
    expect(evento!.apitoId).toBeNull()
  })

  it('chave malformada também degrada, sem lançar', async () => {
    const c = await contexto()
    const destino = await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-chave-lixo',
      agora: new Date('2026-09-15T20:00:00.000Z'),
      chaveDoApito: 'isto-nao-e-uma-chave',
    })
    expect(destino).toContain('https://')
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-chave-lixo')))
    expect(evento!.apitoId).toBeNull()
  })

  it('uuid malformado na chave é recusado pelo Postgres e degrada, sem lançar', async () => {
    const c = await contexto()
    const destino = await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-uuid-invalido',
      agora: new Date('2026-09-15T20:00:00.000Z'),
      // Cinco segmentos, então passa as guardas — mas "nao-e-uuid" não é uuid, e
      // é o Postgres que recusa. É o caminho do catch.
      chaveDoApito: montarChave('nao-e-uuid', 'tambem-nao', 'PONTOS', 'LISTA_SECRETA', 25),
    })
    expect(destino).toContain('https://')
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-uuid-invalido')))
    expect(evento!.apitoId).toBeNull()
  })
})
