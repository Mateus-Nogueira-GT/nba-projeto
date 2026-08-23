import {
  boolean,
  check,
  foreignKey,
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
import { sql } from 'drizzle-orm'
import {
  canalNotificacaoEnum,
  papelUsuarioEnum,
  statusUsuarioEnum,
  tipoDispositivoEnum,
  tipoEventoContaEnum,
} from './enums'

// ============================================================================
// GRUPO 5 · PLATAFORMA
// ============================================================================

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  nome: text('nome'),
  // Estado administrativo/segurança. Situação financeira vive em
  // `assinaturas` e nunca altera esta coluna pelo webhook.
  status: statusUsuarioEnum('status').notNull().default('ATIVO'),
  // O painel admin é separado do app do usuário, mas a identidade é a mesma
  // tabela — não há razão para dois cadastros com as mesmas regras de senha.
  papel: papelUsuarioEnum('papel').notNull().default('USUARIO'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  ultimoAcesso: timestamp('ultimo_acesso', { withTimezone: true }),
})

/** Limite de 2 ativos por conta. No 3º, encerra a sessão mais antiga. */
export const dispositivos = pgTable(
  'dispositivos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    tipo: tipoDispositivoEnum('tipo').notNull(),
    userAgent: text('user_agent'),
    ipUltimo: text('ip_ultimo'),
    ativoDesde: timestamp('ativo_desde', { withTimezone: true }).notNull().defaultNow(),
    ultimoUso: timestamp('ultimo_uso', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('dispositivos_unico').on(t.usuarioId, t.fingerprint),
    unique('dispositivos_id_usuario_unico').on(t.id, t.usuarioId),
  ],
)

export const sessoes = pgTable(
  'sessoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    dispositivoId: uuid('dispositivo_id').references(() => dispositivos.id, {
      onDelete: 'cascade',
    }),
    tokenHash: text('token_hash').notNull().unique(),
    // Necessário para saber qual é a "mais antiga" na regra dos 2 dispositivos.
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
    motivoEncerramento: text('motivo_encerramento'),
  },
  (t) => [
    index('sessoes_usuario_idx').on(t.usuarioId, t.encerradaEm),
    index('sessoes_antiguidade_idx').on(t.usuarioId, t.criadaEm),
  ],
)

export const assinaturas = pgTable(
  'assinaturas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    mercadopagoId: text('mercadopago_id').unique(),
    /** Referência opaca criada localmente antes da chamada externa. */
    referenciaExterna: text('referencia_externa').unique(),
    produto: text('produto').notNull().default('NBA_PRO'),
    status: text('status').notNull(),
    plano: text('plano'),
    inicio: timestamp('inicio', { withTimezone: true }),
    fim: timestamp('fim', { withTimezone: true }),
    proximaCobranca: timestamp('proxima_cobranca', { withTimezone: true }),
    ocorridoEmOrigem: timestamp('ocorrido_em_origem', { withTimezone: true }),
    cancelamentoSolicitadoEm: timestamp('cancelamento_solicitado_em', { withTimezone: true }),
    canceladaEm: timestamp('cancelada_em', { withTimezone: true }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assinaturas_usuario_produto_idx').on(t.usuarioId, t.produto, t.atualizadoEm)],
)

/** Cada parcela/fatura observada no provedor, separada do contrato recorrente. */
export const cobrancas = pgTable(
  'cobrancas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    assinaturaId: uuid('assinatura_id').references(() => assinaturas.id, {
      onDelete: 'set null',
    }),
    provedor: text('provedor').notNull(),
    cobrancaExternaId: text('cobranca_externa_id').notNull(),
    status: text('status').notNull(),
    valorCentavos: integer('valor_centavos'),
    moeda: text('moeda'),
    aprovadoEm: timestamp('aprovado_em', { withTimezone: true }),
    ocorridoEmOrigem: timestamp('ocorrido_em_origem', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('cobrancas_provedor_externo_unico').on(t.provedor, t.cobrancaExternaId),
    index('cobrancas_usuario_idx').on(t.usuarioId, t.atualizadoEm),
  ],
)

/**
 * Autorização comercial explícita. Status de usuário e status de assinatura
 * não são usados como atalho para decidir acesso.
 */
export const direitosAcesso = pgTable(
  'direitos_acesso',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    produto: text('produto').notNull(),
    origem: text('origem').notNull(),
    referenciaOrigem: text('referencia_origem').notNull(),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fim: timestamp('fim', { withTimezone: true }),
    revogadoEm: timestamp('revogado_em', { withTimezone: true }),
    motivoRevogacao: text('motivo_revogacao'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('direitos_acesso_origem_unica').on(t.origem, t.referenciaOrigem, t.produto),
    index('direitos_acesso_usuario_ativo_idx').on(
      t.usuarioId,
      t.produto,
      t.revogadoEm,
      t.inicio,
      t.fim,
    ),
    check(
      'direitos_acesso_intervalo_valido',
      sql`${t.fim} is null or ${t.fim} > ${t.inicio}`,
    ),
    check(
      'direitos_acesso_revogacao_tem_motivo',
      sql`${t.revogadoEm} is null or ${t.motivoRevogacao} is not null`,
    ),
  ],
)

/** Coordena retries do checkout e impede duas assinaturas concorrentes. */
export const tentativasCheckout = pgTable(
  'tentativas_checkout',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    produto: text('produto').notNull(),
    provedor: text('provedor').notNull(),
    referenciaExterna: text('referencia_externa').notNull().unique(),
    chaveIdempotencia: text('chave_idempotencia').notNull().unique(),
    status: text('status').notNull().default('RESERVADA'),
    assinaturaExternaId: text('assinatura_externa_id'),
    urlCheckout: text('url_checkout'),
    leaseExpiraEm: timestamp('lease_expira_em', { withTimezone: true }),
    erroCodigo: text('erro_codigo'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tentativas_checkout_aberta_unica')
      .on(t.usuarioId, t.produto)
      .where(sql`${t.status} in ('RESERVADA', 'CRIANDO', 'AMBIGUA', 'CRIADA')`),
    index('tentativas_checkout_reconciliar_idx').on(t.status, t.leaseExpiraEm, t.atualizadoEm),
    check(
      'tentativas_checkout_status_valido',
      sql`${t.status} in ('RESERVADA', 'CRIANDO', 'AMBIGUA', 'CRIADA', 'FALHA', 'ENCERRADA')`,
    ),
  ],
)

/** Rate limit genérico de operações sensíveis fora do login. */
export const tentativasOperacaoConta = pgTable(
  'tentativas_operacao_conta',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operacao: text('operacao').notNull(),
    identificadorHash: text('identificador_hash').notNull(),
    ip: text('ip'),
    sucesso: boolean('sucesso').notNull(),
    tentadoEm: timestamp('tentado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tentativas_operacao_conta_janela_idx').on(t.operacao, t.identificadorHash, t.tentadoEm)],
)

export const pushInscricoes = pgTable(
  'push_inscricoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    dispositivoId: uuid('dispositivo_id').references(() => dispositivos.id, {
      onDelete: 'cascade',
    }),
    endpoint: text('endpoint').notNull(),
    chaveP256dh: text('chave_p256dh').notNull(),
    chaveAuth: text('chave_auth').notNull(),
    expiraEm: timestamp('expira_em', { withTimezone: true }),
    invalidadaEm: timestamp('invalidada_em', { withTimezone: true }),
    motivoInvalidacao: text('motivo_invalidacao'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('push_inscricoes_endpoint').on(t.endpoint),
    index('push_inscricoes_fanout_idx').on(t.criadoEm, t.id),
    index('push_inscricoes_dispositivo_idx').on(t.dispositivoId, t.invalidadaEm),
    foreignKey({
      columns: [t.dispositivoId, t.usuarioId],
      foreignColumns: [dispositivos.id, dispositivos.usuarioId],
      name: 'push_inscricoes_dispositivo_usuario_fk',
    }).onDelete('cascade'),
    check(
      'push_inscricoes_ativa_tem_dispositivo',
      sql`${t.invalidadaEm} is not null or ${t.dispositivoId} is not null`,
    ),
    check(
      'push_inscricoes_invalidacao_tem_motivo',
      sql`${t.invalidadaEm} is null or ${t.motivoInvalidacao} is not null`,
    ),
    check(
      'push_inscricoes_expiracao_valida',
      sql`${t.expiraEm} is null or ${t.expiraEm} > ${t.criadoEm}`,
    ),
  ],
)

/** Auditoria sem material criptográfico ou endpoint do serviço de Push. */
export const pushInscricoesAuditoria = pgTable(
  'push_inscricoes_auditoria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id').references(() => pushInscricoes.id, {
      onDelete: 'set null',
    }),
    acao: text('acao').notNull(),
    usuarioAnteriorId: uuid('usuario_anterior_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    usuarioAtualId: uuid('usuario_atual_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    dispositivoAnteriorId: uuid('dispositivo_anterior_id').references(() => dispositivos.id, {
      onDelete: 'set null',
    }),
    dispositivoAtualId: uuid('dispositivo_atual_id').references(() => dispositivos.id, {
      onDelete: 'set null',
    }),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_inscricoes_auditoria_inscricao_idx').on(t.inscricaoId, t.ocorridoEm)],
)

export const preferenciasNotificacao = pgTable(
  'preferencias_notificacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    canal: canalNotificacaoEnum('canal').notNull(),
    habilitado: boolean('habilitado').notNull().default(true),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('preferencias_notificacao_unica').on(t.usuarioId, t.canal)],
)

/** Rate limit do login. Uma linha por tentativa; a janela é consultada por SQL. */
export const tentativasLogin = pgTable(
  'tentativas_login',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identificador: text('identificador').notNull(),
    ip: text('ip'),
    sucesso: boolean('sucesso').notNull(),
    tentadoEm: timestamp('tentado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tentativas_login_janela_idx').on(t.identificador, t.tentadoEm)],
)

/**
 * Eventos de pagamento recebidos do provedor.
 *
 * A UNIQUE em `evento_externo_id` é o que torna o webhook IDEMPOTENTE: o
 * Mercado Pago reenvia o mesmo evento, e reprocessar liberaria acesso duas
 * vezes ou geraria cobrança fantasma no relatório.
 */
export const eventosPagamento = pgTable(
  'eventos_pagamento',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provedor: text('provedor').notNull(),
    eventoExternoId: text('evento_externo_id').notNull(),
    tipo: text('tipo').notNull(),
    referenciaExterna: text('referencia_externa'),
    recursoTipo: text('recurso_tipo'),
    recursoExternoId: text('recurso_externo_id'),
    ocorridoEmOrigem: timestamp('ocorrido_em_origem', { withTimezone: true }),
    cargaJson: jsonb('carga_json'),
    processadoEm: timestamp('processado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('eventos_pagamento_unico').on(t.provedor, t.eventoExternoId)],
)

/** Trilha de conta — é daqui que o admin enxerga uso simultâneo e bloqueios. */
export const eventosConta = pgTable(
  'eventos_conta',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }),
    tipo: tipoEventoContaEnum('tipo').notNull(),
    detalhe: text('detalhe'),
    ip: text('ip'),
    contexto: jsonb('contexto'),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('eventos_conta_usuario_idx').on(t.usuarioId, t.ocorridoEm)],
)
