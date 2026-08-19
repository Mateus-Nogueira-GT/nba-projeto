import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
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
  (t) => [unique('dispositivos_unico').on(t.usuarioId, t.fingerprint)],
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

export const assinaturas = pgTable('assinaturas', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  mercadopagoId: text('mercadopago_id').unique(),
  status: text('status').notNull(),
  plano: text('plano'),
  inicio: timestamp('inicio', { withTimezone: true }),
  fim: timestamp('fim', { withTimezone: true }),
  proximaCobranca: timestamp('proxima_cobranca', { withTimezone: true }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

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
  },
  (t) => [unique('push_inscricoes_endpoint').on(t.endpoint)],
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
