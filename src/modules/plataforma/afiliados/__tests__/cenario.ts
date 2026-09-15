import { eq } from 'drizzle-orm'

import {
  apitos,
  casas,
  jogadores,
  eventosAfiliados,
  jogos,
  parceirosAfiliados,
  times,
  usuarios,
} from '@/modules/dominio/db/schema'
import type { Db } from '@/modules/dominio/db/tipos'
import { montarChave } from '@/modules/motor/tipos'

import {
  criarAcordo,
  criarCampanhaComLink,
  criarOferta,
  criarParceiro,
  definirStatusOferta,
  hashVisitante,
  registrarSaidaParaCasa,
} from '../servico'

/**
 * O cenário mínimo de afiliados: admin, dois usuários, casa, dois parceiros,
 * uma oferta ATIVA e dois links — `linkA` para a CASA, `linkB` para dentro da
 * NIP. Vive fora de `servico.test.ts` porque duas suítes precisam do MESMO
 * cenário: dois encadeamentos divergentes para a mesma coisa é como um projeto
 * ganha teste que mente.
 */
export async function cenarioDeAfiliados(db: Db) {
  const sufixo = Math.random().toString(36).slice(2)
  const [admin, usuarioA, usuarioB] = await db
    .insert(usuarios)
    .values([
      { email: `admin-${sufixo}@teste.com`, senhaHash: 'x', papel: 'ADMIN' },
      { email: `a-${sufixo}@teste.com`, senhaHash: 'x' },
      { email: `b-${sufixo}@teste.com`, senhaHash: 'x' },
    ])
    .returning()
  const [casa] = await db
    .insert(casas)
    .values({ nome: `Casa ${sufixo}` })
    .returning()
  const atorAdmin = { usuarioId: admin!.id, papel: 'ADMIN' as const }
  const parceiroA = await criarParceiro(
    db,
    atorAdmin,
    { codigo: `a-${sufixo}`, nomePublico: 'Parceiro A' },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  const parceiroB = await criarParceiro(
    db,
    atorAdmin,
    { codigo: `b-${sufixo}`, nomePublico: 'Parceiro B' },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  const oferta = await criarOferta(
    db,
    atorAdmin,
    {
      casaId: casa!.id,
      nome: `Oferta ${sufixo}`,
      modalidade: 'HIBRIDO',
      moeda: 'BRL',
      urlDestino: 'https://ofertas.casa.test/nba',
      hostDestino: 'ofertas.casa.test',
      status: 'RASCUNHO',
    },
    new Date('2026-09-01T00:00:00.000Z'),
  )
  const acordoA = await criarAcordo(
    db,
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
  await db
    .update(parceirosAfiliados)
    .set({ usuarioId: usuarioA!.id })
    .where(eq(parceirosAfiliados.id, parceiroA.id))
  await db
    .update(parceirosAfiliados)
    .set({ usuarioId: usuarioB!.id })
    .where(eq(parceirosAfiliados.id, parceiroB.id))
  await definirStatusOferta(
    db,
    atorAdmin,
    oferta.id,
    'ATIVA',
    new Date('2026-09-01T00:00:00.000Z'),
    'Contrato, URL e teste de destino homologados',
  )
  const linkA = await criarCampanhaComLink(
    db,
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
    db,
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

/**
 * Um apito real, com a cadeia mínima de FKs que o banco exige.
 *
 * `estrategia`/`linha` parametrizados para reaproveitar a mesma cadeia
 * time → jogador → jogo no teste de Fire Live (linha sempre NULL — não tem
 * como duplicar a função só para trocar dois campos do apito).
 */
export async function apitoDeTeste(
  db: Db,
  opcoes: { estrategia?: 'LISTA_SECRETA' | 'FIRE_LIVE'; linha?: number | null } = {},
) {
  const estrategia = opcoes.estrategia ?? 'LISTA_SECRETA'
  const linha = opcoes.linha === undefined ? 25 : opcoes.linha
  const sufixo = Math.random().toString(36).slice(2, 8)
  const [casa, fora] = await db
    .insert(times)
    .values([
      { sigla: `C${sufixo.slice(0, 2)}`.toUpperCase(), nome: `Casa ${sufixo}` },
      { sigla: `F${sufixo.slice(0, 2)}`.toUpperCase(), nome: `Fora ${sufixo}` },
    ])
    .returning()
  const [jogador] = await db
    .insert(jogadores)
    .values({ nomeCompleto: `Jogador ${sufixo}`, timeId: casa!.id })
    .returning()
  const [jogo] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date('2026-09-15T23:00:00.000Z'),
      dataReferencia: '2026-09-15',
      timeCasaId: casa!.id,
      timeVisitanteId: fora!.id,
      status: 'AGENDADO',
    })
    .returning()
  const [apito] = await db
    .insert(apitos)
    .values({
      rulesetVersao: 'v1',
      jogoId: jogo!.id,
      jogadorId: jogador!.id,
      atributo: 'PONTOS',
      estrategia,
      nivelJogador: 'MVP',
      nivelApito: 3,
      linha,
    })
    .returning()
  return {
    apito: apito!,
    jogador: jogador!,
    chave: montarChave(jogo!.id, jogador!.id, 'PONTOS', estrategia, linha),
  }
}

/**
 * Uma saída de verdade: cenário de afiliados, apito com a cadeia de FKs, e a
 * saída gravada pelo caminho de produção — `registrarSaidaParaCasa` com a
 * chave. Plantar o evento à mão faria o teste afirmar sobre a semeadura.
 */
export async function plantarSaidaComOrigem(
  db: Db,
  opcoes: {
    ocorridoEmUtc: Date
    linha?: number | null
    estrategia?: 'LISTA_SECRETA' | 'FIRE_LIVE'
    semOrigem?: boolean
    /** Visitante anônimo: o evento fica sem `usuario_id`, como todo clique deslogado. */
    semUsuario?: boolean
  },
) {
  const c = await cenarioDeAfiliados(db)
  const { apito, chave, jogador } = await apitoDeTeste(db, {
    estrategia: opcoes.estrategia,
    linha: opcoes.linha,
  })
  const visitanteToken = `visitante-${Math.random().toString(36).slice(2)}`
  await registrarSaidaParaCasa(db, {
    codigo: c.linkA.codigo,
    visitanteToken,
    agora: opcoes.ocorridoEmUtc,
    usuarioId: opcoes.semUsuario ? null : c.usuarioA.id,
    chaveDoApito: opcoes.semOrigem ? null : chave,
  })
  const [evento] = await db
    .select()
    .from(eventosAfiliados)
    .where(eq(eventosAfiliados.visitanteHash, hashVisitante(visitanteToken)))
  return {
    eventoId: evento!.id,
    // O usuário do CENÁRIO, não o da saída: com `semUsuario` o evento fica
    // anônimo e este id continua servindo para plantar a entrada que, em
    // qualquer outro campo, casaria.
    usuarioId: c.usuarioA.id,
    jogadorId: apito.jogadorId,
    // O nome sai do banco para que a asserção da tela seja sobre o sujeito
    // plantado, e não sobre um jogador nomeado no teste.
    nomeDoJogador: jogador.nomeCompleto,
  }
}
