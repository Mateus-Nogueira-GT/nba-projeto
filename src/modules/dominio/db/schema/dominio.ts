import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
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
import { atributoEnum, janelaMediaEnum, statusEscalacaoEnum, statusJogoEnum } from './enums'

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
 * IDENTIDADE DO JOGADOR NO PROVEDOR — id externo → jogador canônico.
 *
 * Não confundir com `mapa_jogadores`, que resolve outro problema: aquele liga o
 * NOME ESCRITO PELO CJ ("chmaphagnie") ao jogador, é curadoria humana e cobre
 * só os ~150 nomes da lista. Este liga o ID do provedor ao jogador, é mecânico
 * e cobre os ~500 da liga inteira — porque a busca da aba de estatísticas e o
 * box score precisam de todo mundo, não só de quem o CJ classificou.
 *
 * Uma linha por provedor: são DUAS fontes com failover, e o mesmo jogador tem
 * ids diferentes em cada uma. Uma coluna só em `jogadores` seria sobrescrita
 * toda vez que o failover trocasse de fonte.
 */
export const identidadesJogador = pgTable(
  'identidades_jogador',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    provedor: text('provedor').notNull(),
    idExterno: text('id_externo').notNull(),
  },
  (t) => [unique('identidades_jogador_unica').on(t.provedor, t.idExterno)],
)

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
    /**
     * Data do jogo em UTC, derivada pelo banco.
     *
     * Existe como COLUNA GERADA, e não como índice por expressão, para que a
     * chave natural seja alvo de `ON CONFLICT` — upsert por expressão exige SQL
     * cru e perde a checagem de tipo do drizzle.
     */
    dataJogo: date('data_jogo')
      .notNull()
      .generatedAlwaysAs(sql`((data_hora_utc AT TIME ZONE 'UTC')::date)`),
    /** Rodada oficial da NBA, independente da virada de dia em UTC. */
    dataReferencia: date('data_referencia').notNull(),
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
    /** Quando o payload validado foi capturado pela aplicação. */
    capturadoEm: timestamp('capturado_em', { withTimezone: true }),
    /** Timestamp informado pela origem; null quando a fonte não o fornece. */
    origemAtualizadaEm: timestamp('origem_atualizada_em', { withTimezone: true }),
    /**
     * Quando a ingestão tocou esta linha pela última vez.
     *
     * Requisito de produto, não conveniência: TODA tela da aba de estatísticas
     * informa o horário do dado que está mostrando (docs/00-visao.md). Sem uma
     * coluna por tabela, a tela teria que inventar um horário — e um número
     * velho apresentado como atual é pior do que número nenhum.
     */
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('jogos_data_idx').on(t.dataHoraUtc, t.status),
    index('jogos_referencia_status_idx').on(t.dataReferencia, t.status, t.dataHoraUtc),
    /**
     * CHAVE NATURAL DO JOGO — o que torna a ingestão reexecutável.
     *
     * Nenhuma tabela canônica guarda id de provedor, e são DUAS fontes com
     * failover: os ids delas são diferentes entre si, então indexar por id
     * externo criaria dois jogos para a mesma partida assim que o failover
     * trocasse de fonte.
     *
     * A data é truncada porque o horário do tipoff MUDA — remarcação é rotina,
     * e o mesmo confronto reagendado em duas horas não é um jogo novo.
     *
     * Assume um confronto por par de times por dia. Verdadeiro na NBA; se um
     * dia deixar de ser, esta constraint falha alto, que é o comportamento
     * correto.
     */
    unique('jogos_chave_natural').on(t.dataJogo, t.timeCasaId, t.timeVisitanteId),
    unique('jogos_chave_referencia').on(t.dataReferencia, t.timeCasaId, t.timeVisitanteId),
  ],
)

/**
 * IDENTIDADE DO JOGO NO PROVEDOR — id externo → jogo canônico.
 *
 * A chave natural do confronto protege a cardinalidade canônica; esta tabela
 * preserva o namespace necessário para toda chamada posterior por id. Um id
 * emitido por uma fonte nunca pode ser enviado a outra.
 */
export const identidadesJogo = pgTable(
  'identidades_jogo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    provedor: text('provedor').notNull(),
    idExterno: text('id_externo').notNull(),
    capturadoEm: timestamp('capturado_em', { withTimezone: true }),
    origemAtualizadaEm: timestamp('origem_atualizada_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('identidades_jogo_externa_unica').on(t.provedor, t.idExterno),
    unique('identidades_jogo_provedor_unico').on(t.jogoId, t.provedor),
  ],
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
    capturadoEm: timestamp('capturado_em', { withTimezone: true }),
    origemAtualizadaEm: timestamp('origem_atualizada_em', { withTimezone: true }),
    /** Ver a nota em `jogos.atualizadoEm`. */
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
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
    capturadoEm: timestamp('capturado_em', { withTimezone: true }),
    origemAtualizadaEm: timestamp('origem_atualizada_em', { withTimezone: true }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
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
    capturadoEm: timestamp('capturado_em', { withTimezone: true }),
    origemAtualizadaEm: timestamp('origem_atualizada_em', { withTimezone: true }),
    /** Ver a nota em `jogos.atualizadoEm`. */
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
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
    capturadoEm: timestamp('capturado_em', { withTimezone: true }),
    origemAtualizadaEm: timestamp('origem_atualizada_em', { withTimezone: true }),
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
    capturadoEm: timestamp('capturado_em', { withTimezone: true }),
    origemAtualizadaEm: timestamp('origem_atualizada_em', { withTimezone: true }),
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
