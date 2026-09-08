import { createHash, randomBytes } from 'node:crypto'

import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm'

import {
  acordosAfiliados,
  alocacoesRepasses,
  atribuicoesAfiliados,
  auditoriaAfiliados,
  campanhasAfiliados,
  casas,
  comissoesAfiliados,
  convitesAfiliados,
  eventosAfiliados,
  itensImportacaoAfiliados,
  liberacoesRepasses,
  linksAfiliados,
  lotesImportacaoAfiliados,
  ofertasAfiliados,
  parceirosAfiliados,
  recebimentosCasas,
  repassesAfiliados,
  usuarios,
} from '@/modules/dominio/db/schema'
import type { Db } from '@/modules/dominio/db/tipos'

import { decidirAtribuicao } from './atribuicao'
import { calcularParcelaDoParceiro } from './financeiro'
import { prepararImportacaoCsv } from './importacao-csv'
import { acrescentarParametrosComerciais, validarDestinoComercial } from './links'

export type AtorAfiliados = { usuarioId: string; papel: 'USUARIO' | 'ADMIN' }

function exigirAdmin(ator: AtorAfiliados): void {
  if (ator.papel !== 'ADMIN') throw new Error('Acesso administrativo exigido')
}

async function auditar(
  db: Db,
  atorUsuarioId: string | null,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  ocorridoEm: Date,
  contexto?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditoriaAfiliados).values({
    atorUsuarioId,
    acao,
    entidade,
    entidadeId,
    contexto,
    ocorridoEm,
  })
}

export async function criarParceiro(
  db: Db,
  ator: AtorAfiliados,
  entrada: { usuarioId?: string | null; codigo: string; nomePublico: string },
  agora: Date,
) {
  exigirAdmin(ator)
  const codigo = entrada.codigo.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(codigo)) throw new Error('Código de parceiro inválido')
  const nomePublico = entrada.nomePublico.trim()
  if (nomePublico.length < 2 || nomePublico.length > 120)
    throw new Error('Nome de parceiro inválido')
  if (entrada.usuarioId) {
    const [usuario] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, entrada.usuarioId))
      .limit(1)
    if (!usuario) throw new Error('Usuário não encontrado')
  }
  const [parceiro] = await db
    .insert(parceirosAfiliados)
    .values({
      usuarioId: entrada.usuarioId ?? null,
      codigo,
      nomePublico,
      criadoEm: agora,
      atualizadoEm: agora,
    })
    .returning()
  await auditar(db, ator.usuarioId, 'PARCEIRO_CRIADO', 'PARCEIRO', parceiro!.id, agora)
  return parceiro!
}

export async function criarCasaComercial(db: Db, ator: AtorAfiliados, nome: string, agora: Date) {
  exigirAdmin(ator)
  const nomeSeguro = nome.trim()
  if (nomeSeguro.length < 2 || nomeSeguro.length > 120) throw new Error('Nome de casa inválido')
  const [casa] = await db.insert(casas).values({ nome: nomeSeguro, ativa: true }).returning()
  await auditar(db, ator.usuarioId, 'CASA_COMERCIAL_CRIADA', 'CASA', casa!.id, agora)
  return casa!
}

export async function criarConvite(
  db: Db,
  ator: AtorAfiliados,
  entrada: { email: string; nomePublico: string; expiraEm: Date },
  agora: Date,
) {
  exigirAdmin(ator)
  const email = entrada.email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('E-mail inválido')
  if (entrada.expiraEm.getTime() <= agora.getTime()) throw new Error('Expiração inválida')
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const [convite] = await db
    .insert(convitesAfiliados)
    .values({
      email,
      nomePublico: entrada.nomePublico.trim(),
      tokenHash,
      criadoPorId: ator.usuarioId,
      expiraEm: entrada.expiraEm,
      criadoEm: agora,
    })
    .returning()
  await auditar(db, ator.usuarioId, 'CONVITE_CRIADO', 'CONVITE', convite!.id, agora)
  return { convite: convite!, token }
}

export async function aceitarConvite(db: Db, usuarioId: string, token: string, agora: Date) {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return db.transaction(async (tx) => {
    const [convite] = await tx
      .select()
      .from(convitesAfiliados)
      .where(eq(convitesAfiliados.tokenHash, tokenHash))
      .limit(1)
    if (!convite || convite.consumidoEm || convite.expiraEm.getTime() <= agora.getTime()) {
      throw new Error('Convite inválido ou expirado')
    }
    const [usuario] = await tx.select().from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1)
    if (!usuario || usuario.email.toLowerCase() !== convite.email)
      throw new Error('Convite pertence a outro e-mail')
    const codigoBase = convite.nomePublico
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)
    const codigo = `${codigoBase || 'parceiro'}-${convite.id.slice(0, 8)}`
    const [parceiro] = await tx
      .insert(parceirosAfiliados)
      .values({
        usuarioId,
        codigo,
        nomePublico: convite.nomePublico,
        criadoEm: agora,
        atualizadoEm: agora,
      })
      .returning()
    await tx
      .update(convitesAfiliados)
      .set({ consumidoEm: agora, parceiroId: parceiro!.id })
      .where(eq(convitesAfiliados.id, convite.id))
    await auditar(tx, usuarioId, 'CONVITE_ACEITO', 'PARCEIRO', parceiro!.id, agora)
    return parceiro!
  })
}

export async function criarOferta(
  db: Db,
  ator: AtorAfiliados,
  entrada: {
    casaId: string
    nome: string
    modalidade: 'CPA' | 'REVSHARE' | 'HIBRIDO'
    moeda: string
    urlDestino: string
    hostDestino: string
    status?: 'RASCUNHO' | 'ATIVA' | 'PAUSADA' | 'ENCERRADA'
  },
  agora: Date,
) {
  exigirAdmin(ator)
  const hostDestino = entrada.hostDestino.trim().toLowerCase()
  const urlDestino = validarDestinoComercial(entrada.urlDestino, [hostDestino])
  if (!/^[A-Z]{3}$/.test(entrada.moeda)) throw new Error('Moeda inválida')
  const [oferta] = await db
    .insert(ofertasAfiliados)
    .values({
      ...entrada,
      nome: entrada.nome.trim(),
      hostDestino,
      urlDestino,
      criadoEm: agora,
      atualizadoEm: agora,
    })
    .returning()
  await auditar(db, ator.usuarioId, 'OFERTA_CRIADA', 'OFERTA', oferta!.id, agora)
  return oferta!
}

export async function criarAcordo(
  db: Db,
  ator: AtorAfiliados,
  entrada: {
    parceiroId: string
    ofertaId: string
    percentualPontosBase: number
    inicio: Date
    fim?: Date | null
  },
  agora: Date,
) {
  exigirAdmin(ator)
  calcularParcelaDoParceiro(0, entrada.percentualPontosBase)
  const [acordo] = await db
    .insert(acordosAfiliados)
    .values({ ...entrada, fim: entrada.fim ?? null, criadoPorId: ator.usuarioId, criadoEm: agora })
    .returning()
  await auditar(db, ator.usuarioId, 'ACORDO_CRIADO', 'ACORDO', acordo!.id, agora)
  return acordo!
}

function caminhoNipSeguro(valor: string | null | undefined): string {
  const caminho = valor?.trim() ?? ''
  if (!caminho.startsWith('/') || caminho.startsWith('//') || caminho.includes('\\')) {
    throw new Error('Caminho NIP inválido')
  }
  return caminho
}

export async function criarCampanhaComLink(
  db: Db,
  ator: AtorAfiliados,
  entrada: {
    parceiroId: string
    ofertaId: string
    nome: string
    canal: string
    codigo: string
    tipoDestino: 'NIP' | 'CASA'
    caminhoNip?: string | null
    utms?: Record<string, string>
    parametrosCasa?: Record<string, string>
  },
  agora: Date,
) {
  exigirAdmin(ator)
  const codigo = entrada.codigo.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{2,95}$/.test(codigo)) throw new Error('Código de link inválido')
  const caminhoNip = entrada.tipoDestino === 'NIP' ? caminhoNipSeguro(entrada.caminhoNip) : null
  for (const chave of Object.keys(entrada.utms ?? {})) {
    if (!/^utm_(source|medium|campaign|id|content|term)$/.test(chave))
      throw new Error('UTM inválida')
  }
  return db.transaction(async (tx) => {
    const [campanha] = await tx
      .insert(campanhasAfiliados)
      .values({
        parceiroId: entrada.parceiroId,
        ofertaId: entrada.ofertaId,
        nome: entrada.nome.trim(),
        canal: entrada.canal.trim(),
        criadoPorId: ator.usuarioId,
        criadoEm: agora,
        atualizadoEm: agora,
      })
      .returning()
    const [link] = await tx
      .insert(linksAfiliados)
      .values({
        campanhaId: campanha!.id,
        codigo,
        tipoDestino: entrada.tipoDestino,
        caminhoNip,
        utms: entrada.utms,
        parametrosCasa: entrada.parametrosCasa,
        criadoEm: agora,
        atualizadoEm: agora,
      })
      .returning()
    await auditar(tx, ator.usuarioId, 'LINK_CRIADO', 'LINK', link!.id, agora, {
      campanhaId: campanha!.id,
    })
    return { ...link!, campanha: campanha! }
  })
}

function hashVisitante(token: string): string {
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(token)) throw new Error('Identificador de visitante inválido')
  return createHash('sha256').update(token).digest('hex')
}

export async function associarVisitanteAoUsuario(
  db: Db,
  visitanteToken: string,
  usuarioId: string,
  agora: Date,
) {
  const visitanteHash = hashVisitante(visitanteToken)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${visitanteHash}))`)
    const [atribuicao] = await tx
      .select()
      .from(atribuicoesAfiliados)
      .where(
        and(
          eq(atribuicoesAfiliados.visitanteHash, visitanteHash),
          eq(atribuicoesAfiliados.estado, 'ATIVA'),
          gt(atribuicoesAfiliados.expiraEm, agora),
        ),
      )
      .orderBy(desc(atribuicoesAfiliados.inicio))
      .limit(1)
    if (!atribuicao) return { associada: false, conflito: false }
    if (atribuicao.usuarioId && atribuicao.usuarioId !== usuarioId) {
      await tx
        .update(atribuicoesAfiliados)
        .set({ estado: 'CONFLITO' })
        .where(eq(atribuicoesAfiliados.id, atribuicao.id))
      await auditar(tx, usuarioId, 'ATRIBUICAO_CONFLITO', 'ATRIBUICAO', atribuicao.id, agora)
      return { associada: false, conflito: true }
    }
    if (!atribuicao.usuarioId) {
      await tx
        .update(atribuicoesAfiliados)
        .set({ usuarioId })
        .where(eq(atribuicoesAfiliados.id, atribuicao.id))
      await tx.insert(eventosAfiliados).values({
        visitanteHash,
        usuarioId,
        linkId: atribuicao.linkOrigemId,
        atribuicaoId: atribuicao.id,
        tipo: 'CADASTRO_NIP',
        ocorridoEm: agora,
      })
    }
    return { associada: true, conflito: false }
  })
}

async function configuracaoDoLink(db: Db, codigo: string) {
  const [link] = await db
    .select()
    .from(linksAfiliados)
    .where(eq(linksAfiliados.codigo, codigo))
    .limit(1)
  if (!link || !link.ativo) throw new Error('Link indisponível')
  const [campanha] = await db
    .select()
    .from(campanhasAfiliados)
    .where(eq(campanhasAfiliados.id, link.campanhaId))
    .limit(1)
  if (!campanha || campanha.status !== 'ATIVA') throw new Error('Link indisponível')
  const [parceiro] = await db
    .select()
    .from(parceirosAfiliados)
    .where(eq(parceirosAfiliados.id, campanha.parceiroId))
    .limit(1)
  if (!parceiro || parceiro.status !== 'ATIVO') throw new Error('Link indisponível')
  const [oferta] = await db
    .select()
    .from(ofertasAfiliados)
    .where(eq(ofertasAfiliados.id, campanha.ofertaId))
    .limit(1)
  if (!oferta || oferta.status !== 'ATIVA') throw new Error('Oferta indisponível')
  return { link, campanha, parceiro, oferta }
}

export async function resolverLinkSemRegistrar(db: Db, codigo: string): Promise<string> {
  const { link, oferta } = await configuracaoDoLink(db, codigo)
  if (link.tipoDestino === 'NIP') return caminhoNipSeguro(link.caminhoNip)
  return destinoDaCasa(link, oferta)
}

function destinoDaCasa(
  link: Awaited<ReturnType<typeof configuracaoDoLink>>['link'],
  oferta: Awaited<ReturnType<typeof configuracaoDoLink>>['oferta'],
): string {
  return acrescentarParametrosComerciais(
    validarDestinoComercial(oferta.urlDestino, [oferta.hostDestino]),
    { ...(link.utms ?? {}), ...(link.parametrosCasa ?? {}) },
  )
}

export async function resolverDestinoDaCasaSemRegistrar(db: Db, codigo: string): Promise<string> {
  const { link, oferta } = await configuracaoDoLink(db, codigo)
  return destinoDaCasa(link, oferta)
}

export async function registrarClique(
  db: Db,
  entrada: {
    codigo: string
    visitanteToken: string
    agora: Date
    automatizado: boolean
    usuarioId?: string | null
  },
) {
  const configuracao = await configuracaoDoLink(db, entrada.codigo)
  const visitanteHash = hashVisitante(entrada.visitanteToken)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${visitanteHash}))`)
    const [atual] = await tx
      .select()
      .from(atribuicoesAfiliados)
      .where(
        and(
          eq(atribuicoesAfiliados.visitanteHash, visitanteHash),
          eq(atribuicoesAfiliados.estado, 'ATIVA'),
          gt(atribuicoesAfiliados.expiraEm, entrada.agora),
        ),
      )
      .orderBy(desc(atribuicoesAfiliados.inicio))
      .limit(1)
    const decisao = decidirAtribuicao(
      atual
        ? {
            parceiroId: atual.parceiroId,
            linkOrigemId: atual.linkOrigemId,
            inicio: atual.inicio,
            expiraEm: atual.expiraEm,
          }
        : null,
      {
        parceiroId: configuracao.parceiro.id,
        linkOrigemId: configuracao.link.id,
        agora: entrada.agora,
      },
    )
    const atribuicao = decisao.criarNova
      ? (
          await tx
            .insert(atribuicoesAfiliados)
            .values({
              visitanteHash,
              usuarioId: entrada.usuarioId ?? null,
              parceiroId: decisao.atribuicao.parceiroId,
              linkOrigemId: decisao.atribuicao.linkOrigemId,
              inicio: decisao.atribuicao.inicio,
              expiraEm: decisao.atribuicao.expiraEm,
              criadoEm: entrada.agora,
            })
            .returning()
        )[0]!
      : atual!
    await tx.insert(eventosAfiliados).values({
      visitanteHash,
      usuarioId: entrada.usuarioId ?? null,
      linkId: configuracao.link.id,
      atribuicaoId: atribuicao.id,
      tipo: 'CLIQUE',
      automatizado: entrada.automatizado,
      ocorridoEm: entrada.agora,
    })
    if (configuracao.link.tipoDestino === 'CASA') {
      await tx.insert(eventosAfiliados).values({
        visitanteHash,
        usuarioId: entrada.usuarioId ?? null,
        linkId: configuracao.link.id,
        atribuicaoId: atribuicao.id,
        tipo: 'SAIDA_CASA',
        automatizado: entrada.automatizado,
        ocorridoEm: entrada.agora,
      })
    }
    return {
      destino: await resolverLinkSemRegistrar(tx, entrada.codigo),
      parceiroTitularId: atribuicao.parceiroId,
      atribuicaoExpiraEm: atribuicao.expiraEm,
    }
  })
}

export async function registrarSaidaParaCasa(
  db: Db,
  entrada: { codigo: string; visitanteToken: string; agora: Date; usuarioId?: string | null },
) {
  const configuracao = await configuracaoDoLink(db, entrada.codigo)
  const visitanteHash = hashVisitante(entrada.visitanteToken)
  const [atribuicao] = await db
    .select()
    .from(atribuicoesAfiliados)
    .where(
      and(
        eq(atribuicoesAfiliados.visitanteHash, visitanteHash),
        gt(atribuicoesAfiliados.expiraEm, entrada.agora),
      ),
    )
    .orderBy(desc(atribuicoesAfiliados.inicio))
    .limit(1)
  await db.insert(eventosAfiliados).values({
    visitanteHash,
    usuarioId: entrada.usuarioId ?? null,
    linkId: configuracao.link.id,
    atribuicaoId: atribuicao?.id ?? null,
    tipo: 'SAIDA_CASA',
    ocorridoEm: entrada.agora,
  })
  return destinoDaCasa(configuracao.link, configuracao.oferta)
}

export async function registrarVisitaNip(
  db: Db,
  entrada: { codigo: string; visitanteToken: string; agora: Date; usuarioId?: string | null },
): Promise<void> {
  const configuracao = await configuracaoDoLink(db, entrada.codigo)
  if (configuracao.link.tipoDestino !== 'NIP') throw new Error('Link não aponta para a NIP')
  const visitanteHash = hashVisitante(entrada.visitanteToken)
  const [atribuicao] = await db
    .select()
    .from(atribuicoesAfiliados)
    .where(
      and(
        eq(atribuicoesAfiliados.visitanteHash, visitanteHash),
        eq(atribuicoesAfiliados.estado, 'ATIVA'),
        gt(atribuicoesAfiliados.expiraEm, entrada.agora),
      ),
    )
    .orderBy(desc(atribuicoesAfiliados.inicio))
    .limit(1)
  await db.insert(eventosAfiliados).values({
    visitanteHash,
    usuarioId: entrada.usuarioId ?? null,
    linkId: configuracao.link.id,
    atribuicaoId: atribuicao?.id ?? null,
    tipo: 'VISITA_NIP',
    ocorridoEm: entrada.agora,
  })
}

export async function criarPreviaImportacao(
  db: Db,
  ator: AtorAfiliados,
  entrada: { ofertaId: string; arquivoNome: string; conteudo: string },
  agora: Date,
) {
  exigirAdmin(ator)
  const previa = prepararImportacaoCsv(entrada.conteudo)
  if (previa.erros.length > 0) throw new Error(previa.erros.join('; '))
  const checksum = createHash('sha256').update(entrada.conteudo).digest('hex')
  const [oferta] = await db
    .select()
    .from(ofertasAfiliados)
    .where(eq(ofertasAfiliados.id, entrada.ofertaId))
    .limit(1)
  if (!oferta) throw new Error('Oferta não encontrada')
  const [existente] = await db
    .select()
    .from(lotesImportacaoAfiliados)
    .where(
      and(
        eq(lotesImportacaoAfiliados.casaId, oferta.casaId),
        eq(lotesImportacaoAfiliados.checksum, checksum),
      ),
    )
    .limit(1)
  if (existente)
    return { loteId: existente.id, reutilizada: true, validas: 0, pendentes: 0, duplicadas: 0 }

  return db.transaction(async (tx) => {
    const [lote] = await tx
      .insert(lotesImportacaoAfiliados)
      .values({
        casaId: oferta.casaId,
        ofertaId: oferta.id,
        arquivoNome: entrada.arquivoNome.slice(0, 180),
        checksum,
        importadoPorId: ator.usuarioId,
        criadoEm: agora,
      })
      .returning()
    let validas = 0
    let pendentes = 0
    let duplicadas = 0
    for (const linha of previa.linhas) {
      const [jaExiste] = await tx
        .select({ id: itensImportacaoAfiliados.id })
        .from(itensImportacaoAfiliados)
        .where(
          and(
            eq(itensImportacaoAfiliados.casaId, oferta.casaId),
            eq(itensImportacaoAfiliados.idExterno, linha.idExterno),
          ),
        )
        .limit(1)
      if (jaExiste) {
        duplicadas += 1
        continue
      }
      const [link] = linha.codigoLink
        ? await tx
            .select()
            .from(linksAfiliados)
            .where(eq(linksAfiliados.codigo, linha.codigoLink))
            .limit(1)
        : []
      const [campanha] = link
        ? await tx
            .select()
            .from(campanhasAfiliados)
            .where(eq(campanhasAfiliados.id, link.campanhaId))
            .limit(1)
        : []
      const conciliado = Boolean(campanha && campanha.ofertaId === oferta.id)
      if (conciliado) validas += 1
      else pendentes += 1
      await tx.insert(itensImportacaoAfiliados).values({
        loteId: lote!.id,
        casaId: oferta.casaId,
        ofertaId: oferta.id,
        parceiroId: conciliado ? campanha!.parceiroId : null,
        campanhaId: conciliado ? campanha!.id : null,
        linkId: conciliado ? link!.id : null,
        idExterno: linha.idExterno,
        indicadoMascarado: linha.indicadoMascarado,
        ocorridoEm: linha.ocorridoEm,
        tipo: linha.tipo,
        moeda: linha.moeda,
        cpaCentavos: linha.cpaCentavos,
        revshareCentavos: linha.revshareCentavos,
        totalCentavos: linha.totalCentavos,
        baseConfirmadaCentavos: linha.baseConfirmadaCentavos,
        estado: conciliado ? 'VALIDO' : 'PENDENTE',
        motivoPendencia: conciliado ? null : 'link ausente ou incompatível com a oferta',
      })
    }
    await auditar(tx, ator.usuarioId, 'IMPORTACAO_PREPARADA', 'LOTE_IMPORTACAO', lote!.id, agora, {
      validas,
      pendentes,
      duplicadas,
    })
    return { loteId: lote!.id, reutilizada: false, validas, pendentes, duplicadas }
  })
}

export async function definirStatusParceiro(
  db: Db,
  ator: AtorAfiliados,
  parceiroId: string,
  status: 'ATIVO' | 'SUSPENSO',
  agora: Date,
) {
  exigirAdmin(ator)
  const [parceiro] = await db
    .update(parceirosAfiliados)
    .set({ status, atualizadoEm: agora })
    .where(eq(parceirosAfiliados.id, parceiroId))
    .returning()
  if (!parceiro) throw new Error('Parceiro não encontrado')
  await auditar(db, ator.usuarioId, 'PARCEIRO_STATUS_ALTERADO', 'PARCEIRO', parceiroId, agora, {
    status,
  })
  return parceiro
}

export async function definirStatusLink(
  db: Db,
  ator: AtorAfiliados,
  linkId: string,
  ativo: boolean,
  agora: Date,
) {
  exigirAdmin(ator)
  const [link] = await db
    .update(linksAfiliados)
    .set({ ativo, atualizadoEm: agora })
    .where(eq(linksAfiliados.id, linkId))
    .returning()
  if (!link) throw new Error('Link não encontrado')
  await auditar(db, ator.usuarioId, ativo ? 'LINK_ATIVADO' : 'LINK_PAUSADO', 'LINK', linkId, agora)
  return link
}

export async function registrarRecebimentoCasa(
  db: Db,
  ator: AtorAfiliados,
  entrada: {
    casaId: string
    moeda: string
    valorCentavos: number
    recebidoEm: Date
    referenciaExterna: string
  },
  agora: Date,
) {
  exigirAdmin(ator)
  if (!/^[A-Z]{3}$/.test(entrada.moeda)) throw new Error('Moeda inválida')
  if (!Number.isSafeInteger(entrada.valorCentavos) || entrada.valorCentavos <= 0)
    throw new Error('Valor inválido')
  const referenciaExterna = entrada.referenciaExterna.trim()
  if (!referenciaExterna) throw new Error('Referência externa obrigatória')
  const [recebimento] = await db
    .insert(recebimentosCasas)
    .values({ ...entrada, referenciaExterna, registradoPorId: ator.usuarioId, criadoEm: agora })
    .returning()
  await auditar(
    db,
    ator.usuarioId,
    'RECEBIMENTO_CASA_REGISTRADO',
    'RECEBIMENTO_CASA',
    recebimento!.id,
    agora,
  )
  return recebimento!
}

export async function registrarAjusteComissao(
  db: Db,
  ator: AtorAfiliados,
  entrada: { comissaoOriginalId: string; baseNipCentavos: number; motivo: string },
  agora: Date,
) {
  exigirAdmin(ator)
  if (!Number.isSafeInteger(entrada.baseNipCentavos) || entrada.baseNipCentavos === 0)
    throw new Error('Valor de ajuste inválido')
  const motivo = entrada.motivo.trim()
  if (motivo.length < 3) throw new Error('Motivo do ajuste obrigatório')
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(comissoesAfiliados)
      .where(eq(comissoesAfiliados.id, entrada.comissaoOriginalId))
      .limit(1)
    if (!original || original.ajusteDeId) throw new Error('Comissão original não encontrada')
    const sinal = entrada.baseNipCentavos < 0 ? -1 : 1
    const parcela =
      sinal *
      calcularParcelaDoParceiro(Math.abs(entrada.baseNipCentavos), original.percentualPontosBase)
    const [ajuste] = await tx
      .insert(comissoesAfiliados)
      .values({
        parceiroId: original.parceiroId,
        acordoId: original.acordoId,
        moeda: original.moeda,
        baseNipCentavos: entrada.baseNipCentavos,
        percentualPontosBase: original.percentualPontosBase,
        parcelaParceiroCentavos: parcela,
        ajusteDeId: original.id,
        motivoAjuste: motivo,
        criadoEm: agora,
      })
      .returning()
    await auditar(tx, ator.usuarioId, 'COMISSAO_AJUSTADA', 'COMISSAO', ajuste!.id, agora, {
      originalId: original.id,
    })
    return ajuste!
  })
}

export async function confirmarImportacao(
  db: Db,
  ator: AtorAfiliados,
  loteId: string,
  agora: Date,
) {
  exigirAdmin(ator)
  return db.transaction(async (tx) => {
    const [lote] = await tx
      .select()
      .from(lotesImportacaoAfiliados)
      .where(eq(lotesImportacaoAfiliados.id, loteId))
      .limit(1)
    if (!lote) throw new Error('Lote não encontrado')
    if (lote.estado === 'CONFIRMADO') {
      return {
        comissoesCriadas: 0,
        comissaoIds: [] as string[],
        baseNipCentavos: 0,
        parcelaParceirosCentavos: 0,
      }
    }
    const itens = await tx
      .select()
      .from(itensImportacaoAfiliados)
      .where(
        and(
          eq(itensImportacaoAfiliados.loteId, loteId),
          eq(itensImportacaoAfiliados.estado, 'VALIDO'),
        ),
      )
    let baseNipCentavos = 0
    let parcelaParceirosCentavos = 0
    const comissaoIds: string[] = []
    for (const item of itens) {
      if (!item.parceiroId) continue
      const [acordo] = await tx
        .select()
        .from(acordosAfiliados)
        .where(
          and(
            eq(acordosAfiliados.parceiroId, item.parceiroId),
            eq(acordosAfiliados.ofertaId, item.ofertaId),
            lte(acordosAfiliados.inicio, item.ocorridoEm),
            or(isNull(acordosAfiliados.fim), gt(acordosAfiliados.fim, item.ocorridoEm)),
          ),
        )
        .orderBy(desc(acordosAfiliados.inicio))
        .limit(1)
      if (!acordo) {
        await tx
          .update(itensImportacaoAfiliados)
          .set({ estado: 'PENDENTE', motivoPendencia: 'acordo aplicável não encontrado' })
          .where(eq(itensImportacaoAfiliados.id, item.id))
        continue
      }
      const parcela = calcularParcelaDoParceiro(
        item.baseConfirmadaCentavos,
        acordo.percentualPontosBase,
      )
      const [comissao] = await tx
        .insert(comissoesAfiliados)
        .values({
          itemImportacaoId: item.id,
          parceiroId: item.parceiroId,
          acordoId: acordo.id,
          moeda: item.moeda,
          baseNipCentavos: item.baseConfirmadaCentavos,
          percentualPontosBase: acordo.percentualPontosBase,
          parcelaParceiroCentavos: parcela,
          criadoEm: agora,
        })
        .onConflictDoNothing()
        .returning()
      if (comissao) {
        comissaoIds.push(comissao.id)
        baseNipCentavos += item.baseConfirmadaCentavos
        parcelaParceirosCentavos += parcela
      }
    }
    await tx
      .update(lotesImportacaoAfiliados)
      .set({ estado: 'CONFIRMADO', confirmadoPorId: ator.usuarioId, confirmadoEm: agora })
      .where(eq(lotesImportacaoAfiliados.id, loteId))
    await auditar(tx, ator.usuarioId, 'IMPORTACAO_CONFIRMADA', 'LOTE_IMPORTACAO', loteId, agora, {
      comissoesCriadas: comissaoIds.length,
    })
    return {
      comissoesCriadas: comissaoIds.length,
      comissaoIds,
      baseNipCentavos,
      parcelaParceirosCentavos,
    }
  })
}

export async function liberarComissao(
  db: Db,
  ator: AtorAfiliados,
  entrada: { comissaoId: string; valorCentavos: number; motivo: string },
  agora: Date,
) {
  exigirAdmin(ator)
  if (!Number.isSafeInteger(entrada.valorCentavos) || entrada.valorCentavos <= 0)
    throw new Error('Valor inválido')
  return db.transaction(async (tx) => {
    const [comissao] = await tx
      .select()
      .from(comissoesAfiliados)
      .where(eq(comissoesAfiliados.id, entrada.comissaoId))
      .limit(1)
    if (!comissao) throw new Error('Comissão não encontrada')
    const anteriores = await tx
      .select()
      .from(liberacoesRepasses)
      .where(
        and(
          eq(liberacoesRepasses.comissaoId, comissao.id),
          ne(liberacoesRepasses.estado, 'CANCELADA'),
        ),
      )
    const total = anteriores.reduce((soma, atual) => soma + atual.valorCentavos, 0)
    if (total + entrada.valorCentavos > comissao.parcelaParceiroCentavos)
      throw new Error('Liberação supera a comissão')
    const [liberacao] = await tx
      .insert(liberacoesRepasses)
      .values({ ...entrada, liberadoPorId: ator.usuarioId, criadoEm: agora })
      .returning()
    await auditar(
      tx,
      ator.usuarioId,
      'COMISSAO_LIBERADA',
      'LIBERACAO_REPASSE',
      liberacao!.id,
      agora,
    )
    return liberacao!
  })
}

export async function registrarRepasse(
  db: Db,
  ator: AtorAfiliados,
  entrada: {
    parceiroId: string
    moeda: string
    valorCentavos: number
    referenciaExterna: string
    pagoEm: Date
    comprovanteChave?: string | null
    alocacoes: { liberacaoId: string; valorCentavos: number }[]
  },
  agora: Date,
) {
  exigirAdmin(ator)
  const totalAlocado = entrada.alocacoes.reduce((soma, atual) => soma + atual.valorCentavos, 0)
  if (
    !Number.isSafeInteger(entrada.valorCentavos) ||
    entrada.valorCentavos <= 0 ||
    totalAlocado !== entrada.valorCentavos
  ) {
    throw new Error('Valor do repasse não fecha com as alocações')
  }
  return db.transaction(async (tx) => {
    for (const alocacao of entrada.alocacoes) {
      await tx.execute(
        sql`select id from ${liberacoesRepasses} where id = ${alocacao.liberacaoId} for update`,
      )
      const [liberacao] = await tx
        .select()
        .from(liberacoesRepasses)
        .where(eq(liberacoesRepasses.id, alocacao.liberacaoId))
        .limit(1)
      if (!liberacao || liberacao.estado === 'CANCELADA') throw new Error('Liberação indisponível')
      const [comissao] = await tx
        .select()
        .from(comissoesAfiliados)
        .where(eq(comissoesAfiliados.id, liberacao.comissaoId))
        .limit(1)
      if (
        !comissao ||
        comissao.parceiroId !== entrada.parceiroId ||
        comissao.moeda !== entrada.moeda
      )
        throw new Error('Liberação incompatível com o repasse')
      const anteriores = await tx
        .select()
        .from(alocacoesRepasses)
        .where(eq(alocacoesRepasses.liberacaoId, liberacao.id))
      const jaAlocado = anteriores.reduce((soma, atual) => soma + atual.valorCentavos, 0)
      if (jaAlocado + alocacao.valorCentavos > liberacao.valorCentavos)
        throw new Error('Repasse supera o saldo liberado')
    }
    const [repasse] = await tx
      .insert(repassesAfiliados)
      .values({
        parceiroId: entrada.parceiroId,
        moeda: entrada.moeda,
        valorCentavos: entrada.valorCentavos,
        pagoEm: entrada.pagoEm,
        referenciaExterna: entrada.referenciaExterna,
        comprovanteChave: entrada.comprovanteChave ?? null,
        registradoPorId: ator.usuarioId,
        criadoEm: agora,
      })
      .returning()
    for (const alocacao of entrada.alocacoes) {
      await tx
        .insert(alocacoesRepasses)
        .values({ repasseId: repasse!.id, ...alocacao, criadoEm: agora })
      const [liberacao] = await tx
        .select()
        .from(liberacoesRepasses)
        .where(eq(liberacoesRepasses.id, alocacao.liberacaoId))
        .limit(1)
      const alocacoes = await tx
        .select()
        .from(alocacoesRepasses)
        .where(eq(alocacoesRepasses.liberacaoId, alocacao.liberacaoId))
      if (
        alocacoes.reduce((soma, atual) => soma + atual.valorCentavos, 0) ===
        liberacao!.valorCentavos
      ) {
        await tx
          .update(liberacoesRepasses)
          .set({ estado: 'CONSUMIDA' })
          .where(eq(liberacoesRepasses.id, alocacao.liberacaoId))
      }
    }
    await auditar(tx, ator.usuarioId, 'REPASSE_REGISTRADO', 'REPASSE', repasse!.id, agora)
    return repasse!
  })
}

export type FiltroPeriodoAfiliados = { inicio?: Date; fim?: Date }

export async function painelDoAfiliado(
  db: Db,
  usuarioId: string,
  filtro: FiltroPeriodoAfiliados = {},
) {
  const [parceiro] = await db
    .select()
    .from(parceirosAfiliados)
    .where(and(eq(parceirosAfiliados.usuarioId, usuarioId), eq(parceirosAfiliados.status, 'ATIVO')))
    .limit(1)
  if (!parceiro) throw new Error('Acesso de afiliado exigido')
  const campanhas = await db
    .select()
    .from(campanhasAfiliados)
    .where(eq(campanhasAfiliados.parceiroId, parceiro.id))
  const links = campanhas.length
    ? await db
        .select()
        .from(linksAfiliados)
        .where(
          inArray(
            linksAfiliados.campanhaId,
            campanhas.map((c) => c.id),
          ),
        )
    : []
  const eventos = links.length
    ? await db
        .select()
        .from(eventosAfiliados)
        .where(
          and(
            inArray(
              eventosAfiliados.linkId,
              links.map((link) => link.id),
            ),
            filtro.inicio ? gte(eventosAfiliados.ocorridoEm, filtro.inicio) : undefined,
            filtro.fim ? lt(eventosAfiliados.ocorridoEm, filtro.fim) : undefined,
          ),
        )
    : []
  const comissoes = await db
    .select()
    .from(comissoesAfiliados)
    .where(
      and(
        eq(comissoesAfiliados.parceiroId, parceiro.id),
        filtro.inicio ? gte(comissoesAfiliados.criadoEm, filtro.inicio) : undefined,
        filtro.fim ? lt(comissoesAfiliados.criadoEm, filtro.fim) : undefined,
      ),
    )
  const repasses = await db
    .select()
    .from(repassesAfiliados)
    .where(
      and(
        eq(repassesAfiliados.parceiroId, parceiro.id),
        filtro.inicio ? gte(repassesAfiliados.pagoEm, filtro.inicio) : undefined,
        filtro.fim ? lt(repassesAfiliados.pagoEm, filtro.fim) : undefined,
      ),
    )
  const indicados = await db
    .select({
      identificador: itensImportacaoAfiliados.indicadoMascarado,
      ocorridoEm: itensImportacaoAfiliados.ocorridoEm,
      tipo: itensImportacaoAfiliados.tipo,
      moeda: itensImportacaoAfiliados.moeda,
      baseCentavos: itensImportacaoAfiliados.baseConfirmadaCentavos,
    })
    .from(itensImportacaoAfiliados)
    .where(
      and(
        eq(itensImportacaoAfiliados.parceiroId, parceiro.id),
        filtro.inicio ? gte(itensImportacaoAfiliados.ocorridoEm, filtro.inicio) : undefined,
        filtro.fim ? lt(itensImportacaoAfiliados.ocorridoEm, filtro.fim) : undefined,
      ),
    )
    .orderBy(desc(itensImportacaoAfiliados.ocorridoEm))
    .limit(100)
  const moedas = [
    ...new Set([...comissoes.map((item) => item.moeda), ...repasses.map((item) => item.moeda)]),
  ].sort()
  return {
    parceiro,
    links: links.map((link) => ({
      ...link,
      campanha: campanhas.find((campanha) => campanha.id === link.campanhaId)!,
    })),
    indicados,
    comissoes,
    repasses,
    totais: {
      cliquesObservados: eventos.filter(
        (evento) => evento.tipo === 'CLIQUE' && !evento.automatizado,
      ).length,
      saidasParaCasa: eventos.filter((evento) => evento.tipo === 'SAIDA_CASA').length,
      comissaoConfirmadaCentavos: comissoes
        .filter((c) => c.estado === 'CONFIRMADA')
        .reduce((soma, c) => soma + c.parcelaParceiroCentavos, 0),
      repassadoCentavos: repasses.reduce((soma, repasse) => soma + repasse.valorCentavos, 0),
    },
    totaisPorMoeda: moedas.map((moeda) => ({
      moeda,
      comissaoConfirmadaCentavos: comissoes
        .filter((item) => item.estado === 'CONFIRMADA' && item.moeda === moeda)
        .reduce((soma, item) => soma + item.parcelaParceiroCentavos, 0),
      repassadoCentavos: repasses
        .filter((item) => item.moeda === moeda)
        .reduce((soma, item) => soma + item.valorCentavos, 0),
    })),
  }
}

export async function painelAdministrativo(db: Db, filtro: FiltroPeriodoAfiliados = {}) {
  const [
    parceiros,
    casasCadastradas,
    ofertas,
    campanhas,
    links,
    eventos,
    comissoes,
    liberacoes,
    repasses,
    recebimentos,
    lotes,
  ] = await Promise.all([
    db.select().from(parceirosAfiliados).orderBy(desc(parceirosAfiliados.criadoEm)),
    db.select().from(casas).orderBy(casas.nome),
    db.select().from(ofertasAfiliados).orderBy(desc(ofertasAfiliados.criadoEm)),
    db.select().from(campanhasAfiliados).orderBy(desc(campanhasAfiliados.criadoEm)),
    db.select().from(linksAfiliados).orderBy(desc(linksAfiliados.criadoEm)),
    db
      .select()
      .from(eventosAfiliados)
      .where(
        and(
          filtro.inicio ? gte(eventosAfiliados.ocorridoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(eventosAfiliados.ocorridoEm, filtro.fim) : undefined,
        ),
      ),
    db
      .select()
      .from(comissoesAfiliados)
      .where(
        and(
          filtro.inicio ? gte(comissoesAfiliados.criadoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(comissoesAfiliados.criadoEm, filtro.fim) : undefined,
        ),
      ),
    db.select().from(liberacoesRepasses).orderBy(desc(liberacoesRepasses.criadoEm)),
    db
      .select()
      .from(repassesAfiliados)
      .where(
        and(
          filtro.inicio ? gte(repassesAfiliados.pagoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(repassesAfiliados.pagoEm, filtro.fim) : undefined,
        ),
      ),
    db
      .select()
      .from(recebimentosCasas)
      .where(
        and(
          filtro.inicio ? gte(recebimentosCasas.recebidoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(recebimentosCasas.recebidoEm, filtro.fim) : undefined,
        ),
      ),
    db.select().from(lotesImportacaoAfiliados).orderBy(desc(lotesImportacaoAfiliados.criadoEm)),
  ])
  return {
    parceiros,
    casas: casasCadastradas,
    ofertas,
    campanhas,
    links,
    comissoes,
    liberacoes,
    repasses,
    lotes,
    totais: {
      cliquesObservados: eventos.filter(
        (evento) => evento.tipo === 'CLIQUE' && !evento.automatizado,
      ).length,
      saidasParaCasa: eventos.filter((evento) => evento.tipo === 'SAIDA_CASA').length,
      receitaNipCentavos: comissoes
        .filter((c) => c.estado === 'CONFIRMADA')
        .reduce((soma, c) => soma + c.baseNipCentavos, 0),
      parcelaParceirosCentavos: comissoes
        .filter((c) => c.estado === 'CONFIRMADA')
        .reduce((soma, c) => soma + c.parcelaParceiroCentavos, 0),
      repassadoCentavos: repasses.reduce((soma, repasse) => soma + repasse.valorCentavos, 0),
      recebidoCentavos: recebimentos.reduce(
        (soma, recebimento) => soma + recebimento.valorCentavos,
        0,
      ),
    },
    totaisPorMoeda: [
      ...new Set([
        ...comissoes.map((item) => item.moeda),
        ...repasses.map((item) => item.moeda),
        ...recebimentos.map((item) => item.moeda),
      ]),
    ]
      .sort()
      .map((moeda) => ({
        moeda,
        receitaNipCentavos: comissoes
          .filter((item) => item.estado === 'CONFIRMADA' && item.moeda === moeda)
          .reduce((soma, item) => soma + item.baseNipCentavos, 0),
        parcelaParceirosCentavos: comissoes
          .filter((item) => item.estado === 'CONFIRMADA' && item.moeda === moeda)
          .reduce((soma, item) => soma + item.parcelaParceiroCentavos, 0),
        recebidoCentavos: recebimentos
          .filter((item) => item.moeda === moeda)
          .reduce((soma, item) => soma + item.valorCentavos, 0),
        repassadoCentavos: repasses
          .filter((item) => item.moeda === moeda)
          .reduce((soma, item) => soma + item.valorCentavos, 0),
      })),
  }
}
