import { createHash, randomBytes } from 'node:crypto'

import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql } from 'drizzle-orm'

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
import { mascararIdentificador, prepararImportacaoCsv } from './importacao-csv'
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
  entrada: { codigo: string; nomePublico: string },
  agora: Date,
) {
  exigirAdmin(ator)
  const codigo = entrada.codigo.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(codigo)) throw new Error('Código de parceiro inválido')
  const nomePublico = entrada.nomePublico.trim()
  if (nomePublico.length < 2 || nomePublico.length > 120)
    throw new Error('Nome de parceiro inválido')
  const [parceiro] = await db
    .insert(parceirosAfiliados)
    .values({
      usuarioId: null,
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
    status?: 'RASCUNHO'
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
      status: 'RASCUNHO',
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
    moeda: string
    percentualPontosBase: number
    inicio: Date
    fim?: Date | null
  },
  agora: Date,
) {
  exigirAdmin(ator)
  calcularParcelaDoParceiro(0, entrada.percentualPontosBase)
  if (!/^[A-Z]{3}$/.test(entrada.moeda)) throw new Error('Moeda inválida')
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
  origem: 'LOGIN' | 'CADASTRO',
) {
  const visitanteHash = hashVisitante(visitanteToken)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${visitanteHash}))`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${usuarioId}))`)
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
    const [atribuicaoCanonica] = await tx
      .select()
      .from(atribuicoesAfiliados)
      .where(
        and(
          eq(atribuicoesAfiliados.usuarioId, usuarioId),
          eq(atribuicoesAfiliados.estado, 'ATIVA'),
          gt(atribuicoesAfiliados.expiraEm, agora),
        ),
      )
      .orderBy(asc(atribuicoesAfiliados.inicio))
      .limit(1)
    if (atribuicaoCanonica && atribuicaoCanonica.id !== atribuicao.id) {
      await tx
        .update(atribuicoesAfiliados)
        .set({ estado: 'CONFLITO' })
        .where(eq(atribuicoesAfiliados.id, atribuicao.id))
      await auditar(tx, usuarioId, 'ATRIBUICAO_CONFLITO', 'ATRIBUICAO', atribuicao.id, agora, {
        atribuicaoCanonicaId: atribuicaoCanonica.id,
      })
      return { associada: false, conflito: true }
    }
    if (!atribuicao.usuarioId) {
      await tx
        .update(atribuicoesAfiliados)
        .set({ usuarioId })
        .where(eq(atribuicoesAfiliados.id, atribuicao.id))
      if (origem === 'CADASTRO') {
        await tx.insert(eventosAfiliados).values({
          visitanteHash,
          usuarioId,
          linkId: atribuicao.linkOrigemId,
          atribuicaoId: atribuicao.id,
          tipo: 'CADASTRO_NIP',
          ocorridoEm: agora,
        })
      }
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
    if (entrada.usuarioId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${entrada.usuarioId}))`)
    }
    let [atual] = await tx
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
    if (entrada.usuarioId) {
      const [canonicaDoUsuario] = await tx
        .select()
        .from(atribuicoesAfiliados)
        .where(
          and(
            eq(atribuicoesAfiliados.usuarioId, entrada.usuarioId),
            eq(atribuicoesAfiliados.estado, 'ATIVA'),
            gt(atribuicoesAfiliados.expiraEm, entrada.agora),
          ),
        )
        .orderBy(asc(atribuicoesAfiliados.inicio))
        .limit(1)
      if (canonicaDoUsuario) {
        if (atual && atual.id !== canonicaDoUsuario.id) {
          await tx
            .update(atribuicoesAfiliados)
            .set({ estado: 'CONFLITO' })
            .where(eq(atribuicoesAfiliados.id, atual.id))
          await auditar(
            tx,
            entrada.usuarioId,
            'ATRIBUICAO_CONFLITO',
            'ATRIBUICAO',
            atual.id,
            entrada.agora,
            { atribuicaoCanonicaId: canonicaDoUsuario.id },
          )
        }
        atual = canonicaDoUsuario
      } else if (atual?.usuarioId && atual.usuarioId !== entrada.usuarioId) {
        await tx
          .update(atribuicoesAfiliados)
          .set({ estado: 'CONFLITO' })
          .where(eq(atribuicoesAfiliados.id, atual.id))
        await auditar(
          tx,
          entrada.usuarioId,
          'ATRIBUICAO_CONFLITO',
          'ATRIBUICAO',
          atual.id,
          entrada.agora,
        )
        atual = undefined
      } else if (atual && !atual.usuarioId) {
        const [associada] = await tx
          .update(atribuicoesAfiliados)
          .set({ usuarioId: entrada.usuarioId })
          .where(eq(atribuicoesAfiliados.id, atual.id))
          .returning()
        atual = associada
      }
    }
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
      destino:
        configuracao.link.tipoDestino === 'NIP'
          ? caminhoNipSeguro(configuracao.link.caminhoNip)
          : destinoDaCasa(configuracao.link, configuracao.oferta),
      atribuicaoId: atribuicao.id,
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
  const atribuicao = await atribuicaoAtivaParaEvento(
    db,
    visitanteHash,
    entrada.usuarioId,
    entrada.agora,
  )
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

async function atribuicaoAtivaParaEvento(
  db: Db,
  visitanteHash: string,
  usuarioId: string | null | undefined,
  agora: Date,
) {
  if (usuarioId) {
    const [canonica] = await db
      .select()
      .from(atribuicoesAfiliados)
      .where(
        and(
          eq(atribuicoesAfiliados.usuarioId, usuarioId),
          eq(atribuicoesAfiliados.estado, 'ATIVA'),
          gt(atribuicoesAfiliados.expiraEm, agora),
        ),
      )
      .orderBy(asc(atribuicoesAfiliados.inicio))
      .limit(1)
    if (canonica) return canonica
  }
  const [doVisitante] = await db
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
  if (usuarioId && doVisitante?.usuarioId && doVisitante.usuarioId !== usuarioId) return undefined
  return doVisitante
}

export async function registrarVisitaNip(
  db: Db,
  entrada: { codigo: string; visitanteToken: string; agora: Date; usuarioId?: string | null },
): Promise<void> {
  const configuracao = await configuracaoDoLink(db, entrada.codigo)
  if (configuracao.link.tipoDestino !== 'NIP') throw new Error('Link não aponta para a NIP')
  const visitanteHash = hashVisitante(entrada.visitanteToken)
  const atribuicao = await atribuicaoAtivaParaEvento(
    db,
    visitanteHash,
    entrada.usuarioId,
    entrada.agora,
  )
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
  if (existente) return { loteId: existente.id, reutilizada: true, ...existente.resumoPrevia }

  return db.transaction(async (tx) => {
    const [lote] = await tx
      .insert(lotesImportacaoAfiliados)
      .values({
        casaId: oferta.casaId,
        ofertaId: oferta.id,
        arquivoNome: entrada.arquivoNome.slice(0, 180),
        checksum,
        resumoPrevia: {
          erros: previa.erros,
          validas: 0,
          pendentes: 0,
          duplicadas: 0,
          totaisPorMoeda: [],
        },
        importadoPorId: ator.usuarioId,
        criadoEm: agora,
      })
      .returning()

    const codigos = [
      ...new Set(previa.linhas.map((linha) => linha.codigoLink).filter(Boolean)),
    ] as string[]
    const atribuicoesIds = [
      ...new Set(previa.linhas.map((linha) => linha.atribuicaoId).filter(Boolean)),
    ] as string[]
    const acordosIds = [
      ...new Set(previa.linhas.map((linha) => linha.acordoId).filter(Boolean)),
    ] as string[]
    const idsExternos = previa.linhas.map((linha) => linha.idExterno)
    const [linksEncontrados, atribuicoes, acordos, existentes] = await Promise.all([
      codigos.length
        ? tx.select().from(linksAfiliados).where(inArray(linksAfiliados.codigo, codigos))
        : Promise.resolve([]),
      atribuicoesIds.length
        ? tx
            .select()
            .from(atribuicoesAfiliados)
            .where(inArray(atribuicoesAfiliados.id, atribuicoesIds))
        : Promise.resolve([]),
      acordosIds.length
        ? tx.select().from(acordosAfiliados).where(inArray(acordosAfiliados.id, acordosIds))
        : Promise.resolve([]),
      idsExternos.length
        ? tx
            .select({ idExterno: itensImportacaoAfiliados.idExterno })
            .from(itensImportacaoAfiliados)
            .where(
              and(
                eq(itensImportacaoAfiliados.casaId, oferta.casaId),
                inArray(itensImportacaoAfiliados.idExterno, idsExternos),
              ),
            )
        : Promise.resolve([]),
    ])
    const campanhasIds = [...new Set(linksEncontrados.map((link) => link.campanhaId))]
    const campanhas = campanhasIds.length
      ? await tx
          .select()
          .from(campanhasAfiliados)
          .where(inArray(campanhasAfiliados.id, campanhasIds))
      : []
    const linksPorCodigo = new Map(linksEncontrados.map((link) => [link.codigo, link]))
    const campanhasPorId = new Map(campanhas.map((campanha) => [campanha.id, campanha]))
    const atribuicoesPorId = new Map(atribuicoes.map((atribuicao) => [atribuicao.id, atribuicao]))
    const acordosPorId = new Map(acordos.map((acordo) => [acordo.id, acordo]))
    const idsExistentes = new Set(existentes.map((item) => item.idExterno))

    let validas = 0
    let pendentes = 0
    let duplicadas = 0
    const totaisPorMoeda = new Map<
      string,
      {
        moeda: string
        baseCentavos: number
        componentesCentavos: number
        diferencaCentavos: number
      }
    >()
    const itens: (typeof itensImportacaoAfiliados.$inferInsert)[] = []
    for (const linha of previa.linhas) {
      if (idsExistentes.has(linha.idExterno)) {
        duplicadas += 1
        continue
      }
      const link = linha.codigoLink ? linksPorCodigo.get(linha.codigoLink) : undefined
      const campanha = link ? campanhasPorId.get(link.campanhaId) : undefined
      const atribuicao = linha.atribuicaoId ? atribuicoesPorId.get(linha.atribuicaoId) : undefined
      const acordo = linha.acordoId ? acordosPorId.get(linha.acordoId) : undefined
      const motivos: string[] = []
      if (!link || !campanha || campanha.ofertaId !== oferta.id)
        motivos.push('link ausente ou incompatível com a oferta')
      if (!atribuicao) motivos.push('atribuição explícita ausente ou inválida')
      if (atribuicao?.estado === 'CONFLITO') motivos.push('atribuição em conflito')
      if (
        atribuicao &&
        link &&
        (atribuicao.linkOrigemId !== link.id || atribuicao.parceiroId !== campanha?.parceiroId)
      )
        motivos.push('link diverge do titular do primeiro toque')
      if (
        atribuicao &&
        (linha.ocorridoEm < atribuicao.inicio || linha.ocorridoEm >= atribuicao.expiraEm)
      )
        motivos.push('evento fora da janela de atribuição')
      if (!acordo) motivos.push('versão de acordo explícita ausente ou inválida')
      if (
        acordo &&
        (!atribuicao ||
          acordo.parceiroId !== atribuicao.parceiroId ||
          acordo.ofertaId !== oferta.id ||
          acordo.moeda !== linha.moeda)
      )
        motivos.push('acordo incompatível com parceiro, oferta ou moeda')
      const conciliado = motivos.length === 0
      if (conciliado) {
        validas += 1
        const total = totaisPorMoeda.get(linha.moeda) ?? {
          moeda: linha.moeda,
          baseCentavos: 0,
          componentesCentavos: 0,
          diferencaCentavos: 0,
        }
        const componentesCentavos = (linha.cpaCentavos ?? 0) + (linha.revshareCentavos ?? 0)
        total.baseCentavos += linha.baseConfirmadaCentavos
        total.componentesCentavos += componentesCentavos
        total.diferencaCentavos +=
          linha.totalCentavos === null ? 0 : linha.totalCentavos - componentesCentavos
        totaisPorMoeda.set(linha.moeda, total)
      } else pendentes += 1
      itens.push({
        loteId: lote!.id,
        casaId: oferta.casaId,
        ofertaId: oferta.id,
        atribuicaoId: atribuicao?.id ?? null,
        acordoId: acordo?.id ?? null,
        parceiroId: conciliado ? atribuicao!.parceiroId : null,
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
        motivoPendencia: conciliado ? null : motivos.join('; '),
      })
    }
    for (let inicio = 0; inicio < itens.length; inicio += 500) {
      await tx.insert(itensImportacaoAfiliados).values(itens.slice(inicio, inicio + 500))
    }
    const resumoPrevia = {
      erros: previa.erros,
      validas,
      pendentes,
      duplicadas,
      totaisPorMoeda: [...totaisPorMoeda.values()].sort((a, b) => a.moeda.localeCompare(b.moeda)),
    }
    await tx
      .update(lotesImportacaoAfiliados)
      .set({ resumoPrevia })
      .where(eq(lotesImportacaoAfiliados.id, lote!.id))
    await auditar(tx, ator.usuarioId, 'IMPORTACAO_PREPARADA', 'LOTE_IMPORTACAO', lote!.id, agora, {
      ...resumoPrevia,
    })
    return { loteId: lote!.id, reutilizada: false, ...resumoPrevia }
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

/**
 * Marca `linkId` como a saída do apito — o link que o detalhe de todo apito
 * oferece como porta para a casa parceira (spec 12/09, §5.4). Movida de
 * `entrega/saida-para-casa.ts` (achado da revisão final): morava fora do
 * módulo de afiliados, escrevia em `links_afiliados` sem `exigirAdmin` nem
 * `auditar`, ao contrário das vinte outras mutações comerciais deste arquivo
 * — inclusive `definirStatusLink`, sua vizinha imediata. Escolher qual
 * parceiro recebe o clique de todo assinante é exatamente o que a trilha de
 * auditoria existe para registrar. `saidaDoApito`, a LEITURA que a tela usa,
 * fica em `entrega/` — não é mutação e é ela que a tela de fato chama.
 *
 * `linkId` nulo apenas desmarca: "nenhuma saída" é uma escolha válida do
 * admin, não um estado inválido — mas um `linkId` que não existe é erro, não
 * silêncio: sem o SELECT abaixo, um id inexistente desmarcava a saída atual
 * e não marcava nada, sem avisar o admin que a marca some.
 *
 * O índice único parcial garante no máximo um link marcado, mas a troca em
 * si (desmarcar o velho, marcar o novo) são DUAS instruções — dois admins
 * marcando ao mesmo tempo intercalariam as suas e um dos dois estouraria o
 * erro cru do índice único. O lock de advisory serializa a seção crítica
 * inteira (mesmo padrão de `registrarClique`/`associarVisitanteAoUsuario`
 * acima): a segunda chamada espera a primeira commitar em vez de colidir —
 * "só existe um" continua valendo, e quem marcar por último vence, como já
 * acontece com duas chamadas em sequência.
 */
export async function definirSaidaDoApito(
  db: Db,
  ator: AtorAfiliados,
  linkId: string | null,
  agora: Date,
): Promise<void> {
  exigirAdmin(ator)
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('saida_do_apito'))`)
    if (linkId) {
      const [link] = await tx
        .select({ id: linksAfiliados.id })
        .from(linksAfiliados)
        .where(eq(linksAfiliados.id, linkId))
        .limit(1)
      if (!link) throw new Error('Link não encontrado')
    }
    await tx
      .update(linksAfiliados)
      .set({ saidaDoApito: false, atualizadoEm: agora })
      .where(eq(linksAfiliados.saidaDoApito, true))
    if (linkId) {
      await tx
        .update(linksAfiliados)
        .set({ saidaDoApito: true, atualizadoEm: agora })
        .where(eq(linksAfiliados.id, linkId))
    }
    await auditar(tx, ator.usuarioId, 'SAIDA_DO_APITO_DEFINIDA', 'LINK', linkId, agora)
  })
}

export async function definirStatusOferta(
  db: Db,
  ator: AtorAfiliados,
  ofertaId: string,
  status: 'RASCUNHO' | 'ATIVA' | 'PAUSADA' | 'ENCERRADA',
  agora: Date,
  motivoHomologacao?: string,
) {
  exigirAdmin(ator)
  const [atual] = await db
    .select()
    .from(ofertasAfiliados)
    .where(eq(ofertasAfiliados.id, ofertaId))
    .limit(1)
  if (!atual) throw new Error('Oferta não encontrada')
  const homologacao = motivoHomologacao?.trim()
  if (status === 'ATIVA') {
    if (!homologacao || homologacao.length < 10)
      throw new Error('Registro da homologação é obrigatório para ativar')
    validarDestinoComercial(atual.urlDestino, [atual.hostDestino])
    const [acordo] = await db
      .select({ id: acordosAfiliados.id })
      .from(acordosAfiliados)
      .where(and(eq(acordosAfiliados.ofertaId, ofertaId), eq(acordosAfiliados.moeda, atual.moeda)))
      .limit(1)
    if (!acordo) throw new Error('Oferta exige acordo compatível antes da ativação')
  }
  const [oferta] = await db
    .update(ofertasAfiliados)
    .set({ status, atualizadoEm: agora })
    .where(eq(ofertasAfiliados.id, ofertaId))
    .returning()
  if (!oferta) throw new Error('Oferta não encontrada')
  await auditar(db, ator.usuarioId, 'OFERTA_STATUS_ALTERADO', 'OFERTA', ofertaId, agora, {
    status,
    motivoHomologacao: status === 'ATIVA' ? homologacao : undefined,
  })
  return oferta
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
    await tx.execute(
      sql`select id from ${comissoesAfiliados} where id = ${entrada.comissaoOriginalId} for update`,
    )
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
    if (lote.resumoPrevia.erros.length > 0 || lote.resumoPrevia.pendentes > 0) {
      throw new Error('A prévia possui erros ou pendências de conciliação')
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
    if (itens.length === 0) throw new Error('A prévia não possui linhas válidas')
    const acordosIds = [...new Set(itens.map((item) => item.acordoId).filter(Boolean))] as string[]
    const atribuicoesIds = [
      ...new Set(itens.map((item) => item.atribuicaoId).filter(Boolean)),
    ] as string[]
    const [acordos, atribuicoes] = await Promise.all([
      acordosIds.length
        ? tx.select().from(acordosAfiliados).where(inArray(acordosAfiliados.id, acordosIds))
        : Promise.resolve([]),
      atribuicoesIds.length
        ? tx
            .select()
            .from(atribuicoesAfiliados)
            .where(inArray(atribuicoesAfiliados.id, atribuicoesIds))
            .for('update')
        : Promise.resolve([]),
    ])
    const acordosPorId = new Map(acordos.map((acordo) => [acordo.id, acordo]))
    const atribuicoesPorId = new Map(atribuicoes.map((atribuicao) => [atribuicao.id, atribuicao]))
    let baseNipCentavos = 0
    let parcelaParceirosCentavos = 0
    const comissaoIds: string[] = []
    for (const item of itens) {
      if (!item.parceiroId || !item.acordoId || !item.atribuicaoId || !item.linkId)
        throw new Error('Linha sem conciliação explícita')
      const atribuicao = atribuicoesPorId.get(item.atribuicaoId)
      if (
        !atribuicao ||
        atribuicao.estado === 'CONFLITO' ||
        atribuicao.parceiroId !== item.parceiroId ||
        atribuicao.linkOrigemId !== item.linkId ||
        item.ocorridoEm < atribuicao.inicio ||
        item.ocorridoEm >= atribuicao.expiraEm
      )
        throw new Error('Atribuição ficou inválida ou conflitante após a prévia')
      const acordo = acordosPorId.get(item.acordoId)
      if (
        !acordo ||
        acordo.parceiroId !== item.parceiroId ||
        acordo.ofertaId !== item.ofertaId ||
        acordo.moeda !== item.moeda
      )
        throw new Error('Versão de acordo incompatível com a linha')
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
    await tx.execute(
      sql`select id from ${comissoesAfiliados} where id = ${entrada.comissaoId} for update`,
    )
    const [comissao] = await tx
      .select()
      .from(comissoesAfiliados)
      .where(eq(comissoesAfiliados.id, entrada.comissaoId))
      .limit(1)
    if (!comissao) throw new Error('Comissão não encontrada')
    if (comissao.ajusteDeId) throw new Error('Liberação deve referenciar a comissão original')
    const anteriores = await tx
      .select()
      .from(liberacoesRepasses)
      .where(
        and(
          eq(liberacoesRepasses.comissaoId, comissao.id),
          ne(liberacoesRepasses.estado, 'CANCELADA'),
        ),
      )
    const ajustes = await tx
      .select({ parcelaParceiroCentavos: comissoesAfiliados.parcelaParceiroCentavos })
      .from(comissoesAfiliados)
      .where(eq(comissoesAfiliados.ajusteDeId, comissao.id))
    const tetoAjustado = ajustes.reduce(
      (total, ajuste) => total + ajuste.parcelaParceiroCentavos,
      comissao.parcelaParceiroCentavos,
    )
    const total = anteriores.reduce((soma, atual) => soma + atual.valorCentavos, 0)
    if (total + entrada.valorCentavos > tetoAjustado) throw new Error('Liberação supera a comissão')
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
    entrada.alocacoes.length === 0 ||
    entrada.alocacoes.some(
      (alocacao) => !Number.isSafeInteger(alocacao.valorCentavos) || alocacao.valorCentavos <= 0,
    ) ||
    totalAlocado !== entrada.valorCentavos
  ) {
    throw new Error('Valor do repasse não fecha com as alocações')
  }
  const valoresPorLiberacao = new Map<string, number>()
  for (const alocacao of entrada.alocacoes) {
    valoresPorLiberacao.set(
      alocacao.liberacaoId,
      (valoresPorLiberacao.get(alocacao.liberacaoId) ?? 0) + alocacao.valorCentavos,
    )
  }
  const alocacoesConsolidadas = [...valoresPorLiberacao.entries()]
    .map(([liberacaoId, valorCentavos]) => ({ liberacaoId, valorCentavos }))
    .sort((a, b) => a.liberacaoId.localeCompare(b.liberacaoId))
  return db.transaction(async (tx) => {
    const comissoesPorId = new Map<string, typeof comissoesAfiliados.$inferSelect>()
    const valorNovoPorComissao = new Map<string, number>()
    for (const alocacao of alocacoesConsolidadas) {
      await tx.execute(
        sql`select id from ${liberacoesRepasses} where id = ${alocacao.liberacaoId} for update`,
      )
      const [liberacao] = await tx
        .select()
        .from(liberacoesRepasses)
        .where(eq(liberacoesRepasses.id, alocacao.liberacaoId))
        .limit(1)
      if (!liberacao || liberacao.estado === 'CANCELADA') throw new Error('Liberação indisponível')
      await tx.execute(
        sql`select id from ${comissoesAfiliados} where id = ${liberacao.comissaoId} for update`,
      )
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
      comissoesPorId.set(comissao.id, comissao)
      valorNovoPorComissao.set(
        comissao.id,
        (valorNovoPorComissao.get(comissao.id) ?? 0) + alocacao.valorCentavos,
      )
      const anteriores = await tx
        .select()
        .from(alocacoesRepasses)
        .where(eq(alocacoesRepasses.liberacaoId, liberacao.id))
      const jaAlocado = anteriores.reduce((soma, atual) => soma + atual.valorCentavos, 0)
      if (jaAlocado + alocacao.valorCentavos > liberacao.valorCentavos)
        throw new Error('Repasse supera o saldo liberado')
    }
    for (const [comissaoId, comissao] of comissoesPorId) {
      const [ajustes, liberacoesDaComissao] = await Promise.all([
        tx
          .select({ parcelaParceiroCentavos: comissoesAfiliados.parcelaParceiroCentavos })
          .from(comissoesAfiliados)
          .where(eq(comissoesAfiliados.ajusteDeId, comissaoId)),
        tx
          .select({ id: liberacoesRepasses.id })
          .from(liberacoesRepasses)
          .where(eq(liberacoesRepasses.comissaoId, comissaoId)),
      ])
      const alocacoesExistentes = liberacoesDaComissao.length
        ? await tx
            .select({ valorCentavos: alocacoesRepasses.valorCentavos })
            .from(alocacoesRepasses)
            .where(
              inArray(
                alocacoesRepasses.liberacaoId,
                liberacoesDaComissao.map((liberacao) => liberacao.id),
              ),
            )
        : []
      const tetoAjustado = ajustes.reduce(
        (total, ajuste) => total + ajuste.parcelaParceiroCentavos,
        comissao.parcelaParceiroCentavos,
      )
      const totalPago = alocacoesExistentes.reduce(
        (total, alocacao) => total + alocacao.valorCentavos,
        0,
      )
      if (totalPago + (valorNovoPorComissao.get(comissaoId) ?? 0) > tetoAjustado) {
        throw new Error('Repasse supera o saldo líquido ajustado da comissão')
      }
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
    for (const alocacao of alocacoesConsolidadas) {
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
  const [totaisEventos] = links.length
    ? await db
        .select({
          cliquesObservados:
            sql<number>`coalesce(sum(case when ${eventosAfiliados.tipo} = 'CLIQUE' and not ${eventosAfiliados.automatizado} then 1 else 0 end), 0)`.mapWith(
              Number,
            ),
          saidasParaCasa:
            sql<number>`coalesce(sum(case when ${eventosAfiliados.tipo} = 'SAIDA_CASA' then 1 else 0 end), 0)`.mapWith(
              Number,
            ),
        })
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
    : [{ cliquesObservados: 0, saidasParaCasa: 0 }]
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
    .orderBy(desc(comissoesAfiliados.criadoEm))
    .limit(500)
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
    .orderBy(desc(repassesAfiliados.pagoEm))
    .limit(500)
  const [totaisComissoes, totaisRepasses] = await Promise.all([
    db
      .select({
        moeda: comissoesAfiliados.moeda,
        comissaoConfirmadaCentavos:
          sql<number>`coalesce(sum(case when ${comissoesAfiliados.estado} = 'CONFIRMADA' then ${comissoesAfiliados.parcelaParceiroCentavos} else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(comissoesAfiliados)
      .where(
        and(
          eq(comissoesAfiliados.parceiroId, parceiro.id),
          filtro.inicio ? gte(comissoesAfiliados.criadoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(comissoesAfiliados.criadoEm, filtro.fim) : undefined,
        ),
      )
      .groupBy(comissoesAfiliados.moeda),
    db
      .select({
        moeda: repassesAfiliados.moeda,
        repassadoCentavos:
          sql<number>`coalesce(sum(${repassesAfiliados.valorCentavos}), 0)`.mapWith(Number),
      })
      .from(repassesAfiliados)
      .where(
        and(
          eq(repassesAfiliados.parceiroId, parceiro.id),
          filtro.inicio ? gte(repassesAfiliados.pagoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(repassesAfiliados.pagoEm, filtro.fim) : undefined,
        ),
      )
      .groupBy(repassesAfiliados.moeda),
  ])
  const indicadosBrutos = await db
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
  const indicados = indicadosBrutos.map((item) => ({
    ...item,
    identificador: mascararIdentificador(item.identificador),
  }))
  const moedas = [
    ...new Set([...totaisComissoes, ...totaisRepasses].map((item) => item.moeda)),
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
      cliquesObservados: totaisEventos?.cliquesObservados ?? 0,
      saidasParaCasa: totaisEventos?.saidasParaCasa ?? 0,
    },
    totaisPorMoeda: moedas.map((moeda) => ({
      moeda,
      comissaoConfirmadaCentavos:
        totaisComissoes.find((item) => item.moeda === moeda)?.comissaoConfirmadaCentavos ?? 0,
      repassadoCentavos:
        totaisRepasses.find((item) => item.moeda === moeda)?.repassadoCentavos ?? 0,
    })),
  }
}

export async function painelAdministrativo(db: Db, filtro: FiltroPeriodoAfiliados = {}) {
  const [
    parceiros,
    casasCadastradas,
    ofertas,
    acordos,
    campanhas,
    links,
    atribuicoes,
    totaisEventos,
    comissoes,
    liberacoes,
    repasses,
    lotes,
    itens,
  ] = await Promise.all([
    db.select().from(parceirosAfiliados).orderBy(desc(parceirosAfiliados.criadoEm)),
    db.select().from(casas).orderBy(casas.nome),
    db.select().from(ofertasAfiliados).orderBy(desc(ofertasAfiliados.criadoEm)),
    db.select().from(acordosAfiliados).orderBy(desc(acordosAfiliados.inicio)),
    db.select().from(campanhasAfiliados).orderBy(desc(campanhasAfiliados.criadoEm)),
    db.select().from(linksAfiliados).orderBy(desc(linksAfiliados.criadoEm)),
    db.select().from(atribuicoesAfiliados).orderBy(desc(atribuicoesAfiliados.inicio)).limit(200),
    db
      .select({
        cliquesObservados:
          sql<number>`coalesce(sum(case when ${eventosAfiliados.tipo} = 'CLIQUE' and not ${eventosAfiliados.automatizado} then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        saidasParaCasa:
          sql<number>`coalesce(sum(case when ${eventosAfiliados.tipo} = 'SAIDA_CASA' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(eventosAfiliados)
      .where(
        and(
          filtro.inicio ? gte(eventosAfiliados.ocorridoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(eventosAfiliados.ocorridoEm, filtro.fim) : undefined,
        ),
      )
      .then((linhas) => linhas[0] ?? { cliquesObservados: 0, saidasParaCasa: 0 }),
    db
      .select()
      .from(comissoesAfiliados)
      .where(
        and(
          filtro.inicio ? gte(comissoesAfiliados.criadoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(comissoesAfiliados.criadoEm, filtro.fim) : undefined,
        ),
      )
      .orderBy(desc(comissoesAfiliados.criadoEm))
      .limit(500),
    db.select().from(liberacoesRepasses).orderBy(desc(liberacoesRepasses.criadoEm)).limit(500),
    db
      .select()
      .from(repassesAfiliados)
      .where(
        and(
          filtro.inicio ? gte(repassesAfiliados.pagoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(repassesAfiliados.pagoEm, filtro.fim) : undefined,
        ),
      )
      .orderBy(desc(repassesAfiliados.pagoEm))
      .limit(500),
    db
      .select()
      .from(lotesImportacaoAfiliados)
      .orderBy(desc(lotesImportacaoAfiliados.criadoEm))
      .limit(100),
    db
      .select()
      .from(itensImportacaoAfiliados)
      .orderBy(desc(itensImportacaoAfiliados.criadoEm))
      .limit(200),
  ])
  const [totaisComissoes, totaisRepasses, totaisRecebimentos] = await Promise.all([
    db
      .select({
        moeda: comissoesAfiliados.moeda,
        receitaNipCentavos:
          sql<number>`coalesce(sum(case when ${comissoesAfiliados.estado} = 'CONFIRMADA' then ${comissoesAfiliados.baseNipCentavos} else 0 end), 0)`.mapWith(
            Number,
          ),
        parcelaParceirosCentavos:
          sql<number>`coalesce(sum(case when ${comissoesAfiliados.estado} = 'CONFIRMADA' then ${comissoesAfiliados.parcelaParceiroCentavos} else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(comissoesAfiliados)
      .where(
        and(
          filtro.inicio ? gte(comissoesAfiliados.criadoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(comissoesAfiliados.criadoEm, filtro.fim) : undefined,
        ),
      )
      .groupBy(comissoesAfiliados.moeda),
    db
      .select({
        moeda: repassesAfiliados.moeda,
        repassadoCentavos:
          sql<number>`coalesce(sum(${repassesAfiliados.valorCentavos}), 0)`.mapWith(Number),
      })
      .from(repassesAfiliados)
      .where(
        and(
          filtro.inicio ? gte(repassesAfiliados.pagoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(repassesAfiliados.pagoEm, filtro.fim) : undefined,
        ),
      )
      .groupBy(repassesAfiliados.moeda),
    db
      .select({
        moeda: recebimentosCasas.moeda,
        recebidoCentavos: sql<number>`coalesce(sum(${recebimentosCasas.valorCentavos}), 0)`.mapWith(
          Number,
        ),
      })
      .from(recebimentosCasas)
      .where(
        and(
          filtro.inicio ? gte(recebimentosCasas.recebidoEm, filtro.inicio) : undefined,
          filtro.fim ? lt(recebimentosCasas.recebidoEm, filtro.fim) : undefined,
        ),
      )
      .groupBy(recebimentosCasas.moeda),
  ])
  return {
    parceiros,
    casas: casasCadastradas,
    ofertas,
    acordos,
    campanhas,
    links,
    atribuicoes,
    comissoes,
    liberacoes,
    repasses,
    lotes,
    itens,
    totais: {
      cliquesObservados: totaisEventos.cliquesObservados,
      saidasParaCasa: totaisEventos.saidasParaCasa,
    },
    totaisPorMoeda: [
      ...new Set([
        ...totaisComissoes.map((item) => item.moeda),
        ...totaisRepasses.map((item) => item.moeda),
        ...totaisRecebimentos.map((item) => item.moeda),
      ]),
    ]
      .sort()
      .map((moeda) => ({
        moeda,
        receitaNipCentavos:
          totaisComissoes.find((item) => item.moeda === moeda)?.receitaNipCentavos ?? 0,
        parcelaParceirosCentavos:
          totaisComissoes.find((item) => item.moeda === moeda)?.parcelaParceirosCentavos ?? 0,
        recebidoCentavos:
          totaisRecebimentos.find((item) => item.moeda === moeda)?.recebidoCentavos ?? 0,
        repassadoCentavos:
          totaisRepasses.find((item) => item.moeda === moeda)?.repassadoCentavos ?? 0,
      })),
  }
}
