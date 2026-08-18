import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  atributoEnum,
  janelaMediaEnum,
  statusEscalacaoEnum,
  statusJogoEnum,
} from './enums'

// ============================================================================
// GRUPO 1 · DOMÍNIO CANÔNICO — alimentado pela ingestão
// ============================================================================

export const times = pgTable('times', {
  id: uuid('id').primaryKey().defaultRandom(),
  sigla: text('sigla').notNull().unique(),
  nome: text('nome').notNull(),
  logoUrl: text('logo_url'),
  conferencia: text('conferencia'),
})

export const jogadores = pgTable('jogadores', {
  id: uuid('id').primaryKey().defaultRandom(),
  nomeCompleto: text('nome_completo').notNull(),
  fotoUrl: text('foto_url'),
  posicao: text('posicao'),
  alturaCm: smallint('altura_cm'),
  numeroCamisa: smallint('numero_camisa'),
  timeId: uuid('time_id').references(() => times.id),
  // Falso quando o provedor indica que o jogador saiu da liga. A tela de
  // mapeamento precisa MOSTRAR esse estado — Schröder foi dispensado durante
  // a elaboração da lista e continua aparecendo nela.
  ativo: boolean('ativo').notNull().default(true),
})

/**
 * Ponte entre a lista do CJ e o provedor. Curadoria HUMANA.
 *
 * Necessária porque os elencos da lista são PROJETADOS: não correspondem à NBA
 * real (Giannis no Miami, LeBron no Philadelphia, Harden no Cleveland).
 */
export const mapaJogadores = pgTable(
  'mapa_jogadores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nomeNaLista: text('nome_na_lista').notNull(),
    jogadorId: uuid('jogador_id').references(() => jogadores.id),
    provedor: text('provedor').notNull(),
    provedorPlayerId: text('provedor_player_id'),
    scoreSimilaridade: numeric('score_similaridade', { precision: 5, scale: 4 }),
    confirmadoPor: text('confirmado_por'),
    confirmadoEm: timestamp('confirmado_em', { withTimezone: true }),
  },
  (t) => [unique('mapa_jogadores_nome_provedor').on(t.nomeNaLista, t.provedor)],
)

export const jogos = pgTable(
  'jogos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dataHoraUtc: timestamp('data_hora_utc', { withTimezone: true }).notNull(),
    timeCasaId: uuid('time_casa_id')
      .notNull()
      .references(() => times.id),
    timeVisitanteId: uuid('time_visitante_id')
      .notNull()
      .references(() => times.id),
    status: statusJogoEnum('status').notNull().default('AGENDADO'),
    quartoAtual: smallint('quarto_atual'),
    tempoRestante: text('tempo_restante'),
    placarCasa: smallint('placar_casa'),
    placarVisitante: smallint('placar_visitante'),
  },
  (t) => [index('jogos_data_idx').on(t.dataHoraUtc, t.status)],
)

/** Box score fechado, por jogo. */
export const estatisticasJogo = pgTable(
  'estatisticas_jogo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    minutos: numeric('minutos', { precision: 5, scale: 2 }),
    pontos: smallint('pontos').notNull().default(0),
    rebotesTotal: smallint('rebotes_total').notNull().default(0),
    rebotesOf: smallint('rebotes_of').notNull().default(0),
    rebotesDef: smallint('rebotes_def').notNull().default(0),
    assistencias: smallint('assistencias').notNull().default(0),
    cestasC: smallint('cestas_c').notNull().default(0),
    cestasT: smallint('cestas_t').notNull().default(0),
    doisC: smallint('dois_c').notNull().default(0),
    doisT: smallint('dois_t').notNull().default(0),
    tresC: smallint('tres_c').notNull().default(0),
    tresT: smallint('tres_t').notNull().default(0),
    lanceC: smallint('lance_c').notNull().default(0),
    lanceT: smallint('lance_t').notNull().default(0),
    roubos: smallint('roubos').notNull().default(0),
    bloqueios: smallint('bloqueios').notNull().default(0),
    turnovers: smallint('turnovers').notNull().default(0),
    faltas: smallint('faltas').notNull().default(0),
    saldoQuadra: smallint('saldo_quadra'),
  },
  (t) => [
    unique('estatisticas_jogo_unica').on(t.jogoId, t.jogadorId),
    // A oscilação varre o histórico por jogador constantemente.
    index('estatisticas_jogo_jogador_idx').on(t.jogadorId, t.jogoId.desc()),
  ],
)

/** OBRIGATÓRIO para o Fire Live. Sem split por quarto não existe estratégia ao vivo. */
export const estatisticasQuarto = pgTable(
  'estatisticas_quarto',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    quarto: smallint('quarto').notNull(),
    pontos: smallint('pontos').notNull().default(0),
    rebotes: smallint('rebotes').notNull().default(0),
    assistencias: smallint('assistencias').notNull().default(0),
    minutos: numeric('minutos', { precision: 5, scale: 2 }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('estatisticas_quarto_unica').on(t.jogoId, t.jogadorId, t.quarto),
    // ÍNDICE PARCIAL: o Fire Live só lê o 1Q. Índice cheio desperdiçaria
    // escrita a cada quarto de cada jogo da rodada.
    index('estatisticas_quarto_1q_idx')
      .on(t.jogoId, t.quarto)
      .where(sql`${t.quarto} = 1`),
  ],
)

/** Box score do TIME — necessário para a aba de estatísticas estilo Sofascore. */
export const estatisticasTimeJogo = pgTable(
  'estatisticas_time_jogo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    timeId: uuid('time_id')
      .notNull()
      .references(() => times.id),
    pontos: smallint('pontos').notNull().default(0),
    pontosQ1: smallint('pontos_q1').notNull().default(0),
    pontosQ2: smallint('pontos_q2').notNull().default(0),
    pontosQ3: smallint('pontos_q3').notNull().default(0),
    pontosQ4: smallint('pontos_q4').notNull().default(0),
    pontosProrrogacao: smallint('pontos_prorrogacao').notNull().default(0),
    rebotesTotal: smallint('rebotes_total').notNull().default(0),
    rebotesOf: smallint('rebotes_of').notNull().default(0),
    rebotesDef: smallint('rebotes_def').notNull().default(0),
    assistencias: smallint('assistencias').notNull().default(0),
    cestasC: smallint('cestas_c').notNull().default(0),
    cestasT: smallint('cestas_t').notNull().default(0),
    tresC: smallint('tres_c').notNull().default(0),
    tresT: smallint('tres_t').notNull().default(0),
    lanceC: smallint('lance_c').notNull().default(0),
    lanceT: smallint('lance_t').notNull().default(0),
    roubos: smallint('roubos').notNull().default(0),
    bloqueios: smallint('bloqueios').notNull().default(0),
    turnovers: smallint('turnovers').notNull().default(0),
    faltas: smallint('faltas').notNull().default(0),
  },
  (t) => [unique('estatisticas_time_jogo_unica').on(t.jogoId, t.timeId)],
)

export const classificacao = pgTable(
  'classificacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    temporada: text('temporada').notNull(),
    timeId: uuid('time_id')
      .notNull()
      .references(() => times.id),
    conferencia: text('conferencia'),
    vitorias: smallint('vitorias').notNull().default(0),
    derrotas: smallint('derrotas').notNull().default(0),
    posicao: smallint('posicao'),
    aproveitamento: numeric('aproveitamento', { precision: 5, scale: 3 }),
    sequencia: text('sequencia'),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('classificacao_unica').on(t.temporada, t.timeId)],
)

export const lesoesEscalacao = pgTable(
  'lesoes_escalacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    status: statusEscalacaoEnum('status').notNull(),
    motivo: text('motivo'),
    confirmado: boolean('confirmado').notNull().default(false),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('lesoes_escalacao_unica').on(t.jogoId, t.jogadorId),
    // A OPD reprocessa a cada mudança de escalação.
    index('lesoes_escalacao_jogo_status_idx').on(t.jogoId, t.status),
  ],
)

export const mediasJogador = pgTable(
  'medias_jogador',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    temporada: text('temporada').notNull(),
    janela: janelaMediaEnum('janela').notNull(),
    jogos: integer('jogos').notNull().default(0),
    ppg: numeric('ppg', { precision: 5, scale: 2 }),
    rpg: numeric('rpg', { precision: 5, scale: 2 }),
    apg: numeric('apg', { precision: 5, scale: 2 }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('medias_jogador_unica').on(t.jogadorId, t.temporada, t.janela)],
)

export { atributoEnum }
