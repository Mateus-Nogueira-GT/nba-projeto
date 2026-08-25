import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { atributoEnum, estrategiaEnum, metodoEnum, nivelJogadorEnum, statusRulesetEnum } from './enums'
import { jogadores, jogos } from './dominio'

// ============================================================================
// GRUPO 4 · MOTOR
// ============================================================================

export const rulesets = pgTable('rulesets', {
  id: uuid('id').primaryKey().defaultRandom(),
  versao: text('versao').notNull().unique(),
  conteudoYaml: text('conteudo_yaml').notNull(),
  status: statusRulesetEnum('status').notNull().default('provisorio'),
  ativoDesde: timestamp('ativo_desde', { withTimezone: true }),
  criadoPor: text('criado_por'),
})

export const apitos = pgTable(
  'apitos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rulesetVersao: text('ruleset_versao').notNull(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    estrategia: estrategiaEnum('estrategia').notNull(),
    metodo: metodoEnum('metodo'),
    nivelJogador: nivelJogadorEnum('nivel_jogador').notNull(),
    nivelApito: smallint('nivel_apito').notNull(),
    turbo: boolean('turbo').notNull().default(false),
    modoFire: boolean('modo_fire').notNull().default(false),
    opdOrigemNivel: smallint('opd_origem_nivel'),
    linha: smallint('linha'),
    // "confianca", NUNCA "probabilidade" (P12). Ver docs/04-design-system.md.
    confianca: numeric('confianca', { precision: 5, scale: 2 }),
    oddMin: numeric('odd_min', { precision: 7, scale: 3 }),
    oddMax: numeric('odd_max', { precision: 7, scale: 3 }),
    alvo1q: smallint('alvo_1q'),
    geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(),
    /**
     * OUTBOX. Null = gravado mas ainda não enfileirado para push.
     *
     * Sem esta coluna existe uma perda silenciosa: se o INSERT commita e o
     * envio à fila falha logo depois, o retry reencontra o apito já gravado,
     * conclui que "não é novo" e o push nunca sai. Com ela, o ciclo seguinte
     * varre os pendentes e reenvia — a UNIQUE segue impedindo duplicata na
     * gravação, e a idempotencyKey da fila cobre o reenvio.
     */
    pushEnfileiradoEm: timestamp('push_enfileirado_em', { withTimezone: true }),
  },
  (t) => [
    /**
     * IDEMPOTÊNCIA — requisito funcional, não otimização (CLAUDE.md, regra 5).
     *
     * nullsNotDistinct é ESSENCIAL aqui: `linha` é NULL em todo apito de Fire
     * Live, e o Postgres, por padrão, considera NULLs DISTINTOS num UNIQUE.
     * Sem isso, dois apitos de Fire Live do mesmo jogador passariam os dois —
     * exatamente na estratégia em que push duplicado mais queima confiança.
     */
    unique('apitos_dedup')
      .on(t.jogoId, t.jogadorId, t.atributo, t.estrategia, t.linha)
      .nullsNotDistinct(),
    index('apitos_feed_idx').on(t.geradoEm.desc(), t.estrategia),
  ],
)

/**
 * Feed materializado. É o que os 10k usuários leem — nunca o motor direto.
 *
 * A Lista Secreta é publicada uma vez por dia: `jogoId` NULL, uma linha por
 * dia. O Fire Live muda a cada ciclo e por jogo: uma linha por `jogoId`, para
 * que dois workflows simultâneos nunca disputem a mesma escrita (spec 05).
 * `nullsNotDistinct` faz o NULL da Lista Secreta colidir consigo mesmo — o
 * mesmo mecanismo, pela mesma razão, de `apitos_dedup`.
 */
export const feedSnapshot = pgTable(
  'feed_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dataReferencia: text('data_referencia').notNull(),
    estrategia: estrategiaEnum('estrategia').notNull(),
    jogoId: uuid('jogo_id').references(() => jogos.id, { onDelete: 'cascade' }),
    conteudoJson: jsonb('conteudo_json').notNull(),
    geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(),
    hash: text('hash').notNull(),
  },
  (t) => [
    unique('feed_snapshot_unico').on(t.dataReferencia, t.estrategia, t.jogoId).nullsNotDistinct(),
  ],
)
