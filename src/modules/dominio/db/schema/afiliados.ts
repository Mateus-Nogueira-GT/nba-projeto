import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { apitos } from './motor'
import { casas } from './odds'
import { usuarios } from './plataforma'

export const parceirosAfiliados = pgTable(
  'parceiros_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .unique()
      .references(() => usuarios.id, { onDelete: 'set null' }),
    codigo: text('codigo').notNull().unique(),
    nomePublico: text('nome_publico').notNull(),
    status: text('status').notNull().default('ATIVO'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('parceiros_afiliados_status_valido', sql`${t.status} in ('ATIVO', 'SUSPENSO')`)],
)

export const convitesAfiliados = pgTable(
  'convites_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    nomePublico: text('nome_publico').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    criadoPorId: uuid('criado_por_id')
      .notNull()
      .references(() => usuarios.id),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    consumidoEm: timestamp('consumido_em', { withTimezone: true }),
    parceiroId: uuid('parceiro_id').references(() => parceirosAfiliados.id, {
      onDelete: 'set null',
    }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('convites_afiliados_email_idx').on(t.email, t.expiraEm),
    check('convites_afiliados_expiracao_valida', sql`${t.expiraEm} > ${t.criadoEm}`),
  ],
)

export const ofertasAfiliados = pgTable(
  'ofertas_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id),
    nome: text('nome').notNull(),
    modalidade: text('modalidade').notNull(),
    moeda: text('moeda').notNull(),
    urlDestino: text('url_destino').notNull(),
    hostDestino: text('host_destino').notNull(),
    status: text('status').notNull().default('RASCUNHO'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('ofertas_afiliados_casa_nome_unico').on(t.casaId, t.nome),
    check(
      'ofertas_afiliados_modalidade_valida',
      sql`${t.modalidade} in ('CPA', 'REVSHARE', 'HIBRIDO')`,
    ),
    check('ofertas_afiliados_moeda_valida', sql`${t.moeda} ~ '^[A-Z]{3}$'`),
    check(
      'ofertas_afiliados_status_valido',
      sql`${t.status} in ('RASCUNHO', 'ATIVA', 'PAUSADA', 'ENCERRADA')`,
    ),
  ],
)

export const acordosAfiliados = pgTable(
  'acordos_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceirosAfiliados.id),
    ofertaId: uuid('oferta_id')
      .notNull()
      .references(() => ofertasAfiliados.id),
    moeda: text('moeda').notNull(),
    percentualPontosBase: integer('percentual_pontos_base').notNull(),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fim: timestamp('fim', { withTimezone: true }),
    criadoPorId: uuid('criado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('acordos_afiliados_versao_unica').on(t.parceiroId, t.ofertaId, t.inicio),
    index('acordos_afiliados_vigencia_idx').on(t.parceiroId, t.ofertaId, t.inicio, t.fim),
    check(
      'acordos_afiliados_percentual_valido',
      sql`${t.percentualPontosBase} between 0 and 10000`,
    ),
    check('acordos_afiliados_moeda_valida', sql`${t.moeda} ~ '^[A-Z]{3}$'`),
    check('acordos_afiliados_intervalo_valido', sql`${t.fim} is null or ${t.fim} > ${t.inicio}`),
  ],
)

export const campanhasAfiliados = pgTable(
  'campanhas_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceirosAfiliados.id),
    ofertaId: uuid('oferta_id')
      .notNull()
      .references(() => ofertasAfiliados.id),
    nome: text('nome').notNull(),
    canal: text('canal').notNull(),
    status: text('status').notNull().default('ATIVA'),
    criadoPorId: uuid('criado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('campanhas_afiliados_nome_unico').on(t.parceiroId, t.nome),
    check(
      'campanhas_afiliados_status_valido',
      sql`${t.status} in ('ATIVA', 'PAUSADA', 'ENCERRADA')`,
    ),
  ],
)

export const linksAfiliados = pgTable(
  'links_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campanhaId: uuid('campanha_id')
      .notNull()
      .references(() => campanhasAfiliados.id),
    codigo: text('codigo').notNull().unique(),
    tipoDestino: text('tipo_destino').notNull(),
    caminhoNip: text('caminho_nip'),
    utms: jsonb('utms').$type<Record<string, string>>(),
    parametrosCasa: jsonb('parametros_casa').$type<Record<string, string>>(),
    ativo: boolean('ativo').notNull().default(true),
    /**
     * O link que a tela do apito usa como saída para a casa (spec 12/09,
     * §5.4). No máximo UM (índice único parcial); o admin escolhe. Sem nenhum
     * marcado, a tela não mostra saída — nunca inventa destino.
     */
    saidaDoApito: boolean('saida_do_apito').notNull().default(false),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('links_afiliados_tipo_destino_valido', sql`${t.tipoDestino} in ('NIP', 'CASA')`),
    check(
      'links_afiliados_caminho_nip_valido',
      sql`${t.tipoDestino} <> 'NIP' or ${t.caminhoNip} is not null`,
    ),
    uniqueIndex('links_afiliados_saida_do_apito_unica')
      .on(t.saidaDoApito)
      .where(sql`${t.saidaDoApito}`),
  ],
)

export const atribuicoesAfiliados = pgTable(
  'atribuicoes_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitanteHash: text('visitante_hash').notNull(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceirosAfiliados.id),
    linkOrigemId: uuid('link_origem_id')
      .notNull()
      .references(() => linksAfiliados.id),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    estado: text('estado').notNull().default('ATIVA'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('atribuicoes_afiliados_visitante_idx').on(t.visitanteHash, t.inicio),
    index('atribuicoes_afiliados_usuario_idx').on(t.usuarioId, t.inicio),
    check('atribuicoes_afiliados_intervalo_valido', sql`${t.expiraEm} > ${t.inicio}`),
    check(
      'atribuicoes_afiliados_estado_valido',
      sql`${t.estado} in ('ATIVA', 'EXPIRADA', 'CONFLITO')`,
    ),
  ],
)

export const eventosAfiliados = pgTable(
  'eventos_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitanteHash: text('visitante_hash').notNull(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    linkId: uuid('link_id')
      .notNull()
      .references(() => linksAfiliados.id),
    atribuicaoId: uuid('atribuicao_id').references(() => atribuicoesAfiliados.id),
    /**
     * De qual apito a saída nasceu. Anulável porque só a SAIDA_CASA tem
     * origem — clique e visita não vêm de um apito — e porque uma chave que
     * não resolve grava a saída SEM origem, o que é honesto; inventar origem
     * contaminaria uma trilha que vai embasar conversa comercial.
     */
    apitoId: uuid('apito_id').references(() => apitos.id, { onDelete: 'set null' }),
    tipo: text('tipo').notNull(),
    automatizado: boolean('automatizado').notNull().default(false),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('eventos_afiliados_link_data_idx').on(t.linkId, t.ocorridoEm),
    index('eventos_afiliados_atribuicao_idx').on(t.atribuicaoId, t.ocorridoEm),
    check(
      'eventos_afiliados_tipo_valido',
      sql`${t.tipo} in ('CLIQUE', 'VISITA_NIP', 'SAIDA_CASA', 'CADASTRO_NIP')`,
    ),
    check(
      'eventos_afiliados_apito_so_em_saida',
      sql`${t.apitoId} is null or ${t.tipo} = 'SAIDA_CASA'`,
    ),
  ],
)

export const lotesImportacaoAfiliados = pgTable(
  'lotes_importacao_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id),
    ofertaId: uuid('oferta_id')
      .notNull()
      .references(() => ofertasAfiliados.id),
    arquivoNome: text('arquivo_nome').notNull(),
    checksum: text('checksum').notNull(),
    resumoPrevia: jsonb('resumo_previa')
      .$type<{
        erros: string[]
        validas: number
        pendentes: number
        duplicadas: number
        totaisPorMoeda?: {
          moeda: string
          baseCentavos: number
          componentesCentavos: number
          diferencaCentavos: number
        }[]
      }>()
      .notNull(),
    estado: text('estado').notNull().default('PREVIA'),
    importadoPorId: uuid('importado_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    confirmadoPorId: uuid('confirmado_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    confirmadoEm: timestamp('confirmado_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('lotes_importacao_checksum_unico').on(t.casaId, t.checksum),
    check(
      'lotes_importacao_estado_valido',
      sql`${t.estado} in ('PREVIA', 'CONFIRMADO', 'REJEITADO')`,
    ),
  ],
)

export const itensImportacaoAfiliados = pgTable(
  'itens_importacao_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loteId: uuid('lote_id')
      .notNull()
      .references(() => lotesImportacaoAfiliados.id),
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id),
    ofertaId: uuid('oferta_id')
      .notNull()
      .references(() => ofertasAfiliados.id),
    atribuicaoId: uuid('atribuicao_id').references(() => atribuicoesAfiliados.id),
    acordoId: uuid('acordo_id').references(() => acordosAfiliados.id),
    parceiroId: uuid('parceiro_id').references(() => parceirosAfiliados.id),
    campanhaId: uuid('campanha_id').references(() => campanhasAfiliados.id),
    linkId: uuid('link_id').references(() => linksAfiliados.id),
    idExterno: text('id_externo').notNull(),
    indicadoMascarado: text('indicado_mascarado'),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull(),
    tipo: text('tipo').notNull(),
    moeda: text('moeda').notNull(),
    cpaCentavos: integer('cpa_centavos'),
    revshareCentavos: integer('revshare_centavos'),
    totalCentavos: integer('total_centavos'),
    baseConfirmadaCentavos: integer('base_confirmada_centavos').notNull(),
    estado: text('estado').notNull().default('PENDENTE'),
    motivoPendencia: text('motivo_pendencia'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('itens_importacao_evento_unico').on(t.casaId, t.idExterno),
    index('itens_importacao_parceiro_idx').on(t.parceiroId, t.ocorridoEm),
    check('itens_importacao_tipo_valido', sql`${t.tipo} in ('CPA', 'REVSHARE', 'HIBRIDO')`),
    check('itens_importacao_moeda_valida', sql`${t.moeda} ~ '^[A-Z]{3}$'`),
    check('itens_importacao_base_valida', sql`${t.baseConfirmadaCentavos} >= 0`),
    check(
      'itens_importacao_estado_valido',
      sql`${t.estado} in ('PENDENTE', 'VALIDO', 'REJEITADO', 'DUPLICADO')`,
    ),
  ],
)

export const comissoesAfiliados = pgTable(
  'comissoes_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemImportacaoId: uuid('item_importacao_id')
      .unique()
      .references(() => itensImportacaoAfiliados.id),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceirosAfiliados.id),
    acordoId: uuid('acordo_id')
      .notNull()
      .references(() => acordosAfiliados.id),
    moeda: text('moeda').notNull(),
    baseNipCentavos: integer('base_nip_centavos').notNull(),
    percentualPontosBase: integer('percentual_pontos_base').notNull(),
    parcelaParceiroCentavos: integer('parcela_parceiro_centavos').notNull(),
    estado: text('estado').notNull().default('CONFIRMADA'),
    ajusteDeId: uuid('ajuste_de_id').references((): AnyPgColumn => comissoesAfiliados.id, {
      onDelete: 'restrict',
    }),
    motivoAjuste: text('motivo_ajuste'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comissoes_afiliados_parceiro_idx').on(t.parceiroId, t.moeda, t.criadoEm),
    check(
      'comissoes_afiliados_valores_validos',
      sql`${t.percentualPontosBase} between 0 and 10000`,
    ),
    check(
      'comissoes_afiliados_origem_valida',
      sql`(${t.itemImportacaoId} is not null and ${t.ajusteDeId} is null) or (${t.itemImportacaoId} is null and ${t.ajusteDeId} is not null)`,
    ),
    check(
      'comissoes_afiliados_estado_valido',
      sql`${t.estado} in ('PENDENTE', 'CONFIRMADA', 'AJUSTADA', 'CANCELADA')`,
    ),
  ],
)

export const recebimentosCasas = pgTable(
  'recebimentos_casas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id),
    moeda: text('moeda').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    recebidoEm: timestamp('recebido_em', { withTimezone: true }).notNull(),
    referenciaExterna: text('referencia_externa').notNull(),
    registradoPorId: uuid('registrado_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('recebimentos_casas_referencia_unica').on(t.casaId, t.referenciaExterna),
    check('recebimentos_casas_valor_valido', sql`${t.valorCentavos} > 0`),
  ],
)

export const liberacoesRepasses = pgTable(
  'liberacoes_repasses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    comissaoId: uuid('comissao_id')
      .notNull()
      .references(() => comissoesAfiliados.id),
    valorCentavos: integer('valor_centavos').notNull(),
    estado: text('estado').notNull().default('ABERTA'),
    liberadoPorId: uuid('liberado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    motivo: text('motivo').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('liberacoes_repasses_comissao_idx').on(t.comissaoId, t.estado),
    check('liberacoes_repasses_valor_valido', sql`${t.valorCentavos} > 0`),
    check(
      'liberacoes_repasses_estado_valido',
      sql`${t.estado} in ('ABERTA', 'CONSUMIDA', 'CANCELADA')`,
    ),
  ],
)

export const repassesAfiliados = pgTable(
  'repasses_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceirosAfiliados.id),
    moeda: text('moeda').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    pagoEm: timestamp('pago_em', { withTimezone: true }).notNull(),
    referenciaExterna: text('referencia_externa').notNull(),
    comprovanteChave: text('comprovante_chave'),
    registradoPorId: uuid('registrado_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('repasses_afiliados_referencia_unica').on(t.parceiroId, t.referenciaExterna),
    check('repasses_afiliados_valor_valido', sql`${t.valorCentavos} > 0`),
  ],
)

export const alocacoesRepasses = pgTable(
  'alocacoes_repasses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repasseId: uuid('repasse_id')
      .notNull()
      .references(() => repassesAfiliados.id),
    liberacaoId: uuid('liberacao_id')
      .notNull()
      .references(() => liberacoesRepasses.id),
    valorCentavos: integer('valor_centavos').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('alocacoes_repasses_unica').on(t.repasseId, t.liberacaoId),
    index('alocacoes_repasses_liberacao_idx').on(t.liberacaoId),
    check('alocacoes_repasses_valor_valido', sql`${t.valorCentavos} > 0`),
  ],
)

export const auditoriaAfiliados = pgTable(
  'auditoria_afiliados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atorUsuarioId: uuid('ator_usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    acao: text('acao').notNull(),
    entidade: text('entidade').notNull(),
    entidadeId: uuid('entidade_id'),
    motivo: text('motivo'),
    contexto: jsonb('contexto').$type<Record<string, unknown>>(),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auditoria_afiliados_entidade_idx').on(t.entidade, t.entidadeId, t.ocorridoEm)],
)
