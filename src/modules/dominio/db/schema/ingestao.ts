import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { jogadores, jogos } from './dominio'

export type EstadoExecucaoIngestao =
  'RESERVADA' | 'EXECUTANDO' | 'SUCESSO' | 'PARCIAL' | 'FALHA' | 'IGNORADA'

export type OrigemExecucaoIngestao = 'CRON' | 'WORKFLOW' | 'CLI'
export type EstadoConflitoIdentidade = 'PENDENTE' | 'RESOLVIDO' | 'IGNORADO'

/** Uma invocação observável de um job, inclusive quando perde o lock. */
export const execucoesIngestao = pgTable(
  'execucoes_ingestao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job: text('job').notNull(),
    janelaInicio: date('janela_inicio').notNull(),
    janelaFim: date('janela_fim').notNull(),
    temporada: text('temporada').notNull(),
    origem: text('origem').$type<OrigemExecucaoIngestao>().notNull(),
    estado: text('estado').$type<EstadoExecucaoIngestao>().notNull().default('RESERVADA'),
    leaseToken: uuid('lease_token'),
    tentativa: integer('tentativa').notNull().default(1),
    /** Contagem de respostas efetivas por fonte; uma execução pode usar mais de uma. */
    fontesJson: jsonb('fontes_json')
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contagensJson: jsonb('contagens_json')
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    dadoOrigemMaisRecenteEm: timestamp('dado_origem_mais_recente_em', {
      withTimezone: true,
    }),
    erro: text('erro'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    iniciadoEm: timestamp('iniciado_em', { withTimezone: true }),
    finalizadoEm: timestamp('finalizado_em', { withTimezone: true }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('execucoes_ingestao_job_janela_idx').on(t.job, t.janelaInicio, t.janelaFim),
    index('execucoes_ingestao_estado_idx').on(t.estado, t.criadoEm),
    check('execucoes_ingestao_janela_valida', sql`${t.janelaFim} >= ${t.janelaInicio}`),
    check('execucoes_ingestao_tentativa_valida', sql`${t.tentativa} > 0`),
    check('execucoes_ingestao_origem_valida', sql`${t.origem} in ('CRON', 'WORKFLOW', 'CLI')`),
    check(
      'execucoes_ingestao_estado_valido',
      sql`${t.estado} in ('RESERVADA', 'EXECUTANDO', 'SUCESSO', 'PARCIAL', 'FALHA', 'IGNORADA')`,
    ),
  ],
)

/** Lease persistente. Toda renovação e liberação precisa comparar leaseToken. */
export const locksIngestao = pgTable(
  'locks_ingestao',
  {
    chave: text('chave').primaryKey(),
    execucaoId: uuid('execucao_id')
      .notNull()
      .references(() => execucoesIngestao.id),
    leaseToken: uuid('lease_token').notNull(),
    leaseExpiraEm: timestamp('lease_expira_em', { withTimezone: true }).notNull(),
    tentativas: integer('tentativas').notNull().default(1),
    adquiridoEm: timestamp('adquirido_em', { withTimezone: true }).notNull().defaultNow(),
    renovadoEm: timestamp('renovado_em', { withTimezone: true }),
    liberadoEm: timestamp('liberado_em', { withTimezone: true }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('locks_ingestao_lease_idx').on(t.leaseExpiraEm, t.liberadoEm),
    check('locks_ingestao_tentativas_validas', sql`${t.tentativas} > 0`),
  ],
)

/**
 * Cursor de retomada isolado por provedor.
 *
 * O valor CANONICO pode ser usado por etapas que não possuem cursor externo;
 * cursores reais nunca atravessam o namespace que os emitiu.
 */
export const checkpointsIngestao = pgTable(
  'checkpoints_ingestao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job: text('job').notNull(),
    janelaInicio: date('janela_inicio').notNull(),
    janelaFim: date('janela_fim').notNull(),
    temporada: text('temporada').notNull(),
    provedor: text('provedor').notNull(),
    cursorJson: jsonb('cursor_json').$type<Record<string, unknown>>(),
    ultimoIdExterno: text('ultimo_id_externo'),
    dataReferencia: date('data_referencia'),
    concluido: boolean('concluido').notNull().default(false),
    execucaoId: uuid('execucao_id')
      .notNull()
      .references(() => execucoesIngestao.id),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('checkpoints_ingestao_particao_unica').on(
      t.job,
      t.janelaInicio,
      t.janelaFim,
      t.temporada,
      t.provedor,
    ),
    check('checkpoints_ingestao_janela_valida', sql`${t.janelaFim} >= ${t.janelaInicio}`),
  ],
)

/** Evidência relacional para uma identidade de jogador que exige curadoria. */
export const conflitosIdentidadeJogador = pgTable(
  'conflitos_identidade_jogador',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provedor: text('provedor').notNull(),
    idExterno: text('id_externo').notNull(),
    nomeExterno: text('nome_externo').notNull(),
    jogadorCandidatoId: uuid('jogador_candidato_id').references(() => jogadores.id),
    jogadorResolvidoId: uuid('jogador_resolvido_id').references(() => jogadores.id),
    motivo: text('motivo').notNull(),
    estado: text('estado').$type<EstadoConflitoIdentidade>().notNull().default('PENDENTE'),
    payloadHash: text('payload_hash'),
    ocorrencias: integer('ocorrencias').notNull().default(1),
    resolvidoPor: text('resolvido_por'),
    primeiraOcorrenciaEm: timestamp('primeira_ocorrencia_em', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ultimaOcorrenciaEm: timestamp('ultima_ocorrencia_em', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvidoEm: timestamp('resolvido_em', { withTimezone: true }),
  },
  (t) => [
    unique('conflitos_jogador_identidade_unica').on(t.provedor, t.idExterno),
    index('conflitos_jogador_estado_idx').on(t.estado, t.ultimaOcorrenciaEm),
    check('conflitos_jogador_ocorrencias_validas', sql`${t.ocorrencias} > 0`),
    check(
      'conflitos_jogador_estado_valido',
      sql`${t.estado} in ('PENDENTE', 'RESOLVIDO', 'IGNORADO')`,
    ),
  ],
)

/** Evidência relacional para uma identidade de jogo que exige curadoria. */
export const conflitosIdentidadeJogo = pgTable(
  'conflitos_identidade_jogo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provedor: text('provedor').notNull(),
    idExterno: text('id_externo').notNull(),
    dataReferencia: date('data_referencia').notNull(),
    timeCasaSigla: text('time_casa_sigla').notNull(),
    timeVisitanteSigla: text('time_visitante_sigla').notNull(),
    jogoCandidatoId: uuid('jogo_candidato_id').references(() => jogos.id),
    jogoResolvidoId: uuid('jogo_resolvido_id').references(() => jogos.id),
    motivo: text('motivo').notNull(),
    estado: text('estado').$type<EstadoConflitoIdentidade>().notNull().default('PENDENTE'),
    payloadHash: text('payload_hash'),
    ocorrencias: integer('ocorrencias').notNull().default(1),
    resolvidoPor: text('resolvido_por'),
    primeiraOcorrenciaEm: timestamp('primeira_ocorrencia_em', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ultimaOcorrenciaEm: timestamp('ultima_ocorrencia_em', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvidoEm: timestamp('resolvido_em', { withTimezone: true }),
  },
  (t) => [
    unique('conflitos_jogo_identidade_unica').on(t.provedor, t.idExterno),
    index('conflitos_jogo_estado_idx').on(t.estado, t.ultimaOcorrenciaEm),
    check('conflitos_jogo_ocorrencias_validas', sql`${t.ocorrencias} > 0`),
    check(
      'conflitos_jogo_estado_valido',
      sql`${t.estado} in ('PENDENTE', 'RESOLVIDO', 'IGNORADO')`,
    ),
  ],
)
