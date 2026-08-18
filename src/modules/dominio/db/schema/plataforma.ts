import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { canalNotificacaoEnum, statusUsuarioEnum, tipoDispositivoEnum } from './enums'

// ============================================================================
// GRUPO 5 · PLATAFORMA
// ============================================================================

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  nome: text('nome'),
  status: statusUsuarioEnum('status').notNull().default('ATIVO'),
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
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
    motivoEncerramento: text('motivo_encerramento'),
  },
  (t) => [index('sessoes_usuario_idx').on(t.usuarioId, t.encerradaEm)],
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
