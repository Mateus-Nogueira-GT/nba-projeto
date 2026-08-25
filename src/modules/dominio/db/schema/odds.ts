import { boolean, numeric, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { atributoEnum, origemOddsEnum } from './enums'
import { jogadores, jogos } from './dominio'

// ============================================================================
// GRUPO 3 · ODDS — somente leitura, agregadas em faixa. ADR-0004.
//
// NÃO EXISTE, por decisão de escopo: tabela de credencial de casa, conta de
// usuário vinculada a casa ou aposta enviada. Esses dados não são coletados.
// ============================================================================

export const casas = pgTable('casas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull().unique(),
  tipoApi: text('tipo_api'),
  ativa: boolean('ativa').notNull().default(true),
})

export const oddsSnapshot = pgTable(
  'odds_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    linha: numeric('linha', { precision: 6, scale: 1 }).notNull(),
    oddOver: numeric('odd_over', { precision: 7, scale: 3 }),
    oddUnder: numeric('odd_under', { precision: 7, scale: 3 }),
    capturadoEm: timestamp('capturado_em', { withTimezone: true }).notNull().defaultNow(),
  },
)

/** Materializada: a "média entre casas" que o cliente pediu. */
export const oddsAgregada = pgTable(
  'odds_agregada',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    linha: numeric('linha', { precision: 6, scale: 1 }).notNull(),
    oddMin: numeric('odd_min', { precision: 7, scale: 3 }),
    oddMax: numeric('odd_max', { precision: 7, scale: 3 }),
    oddMediana: numeric('odd_mediana', { precision: 7, scale: 3 }),
    // A média simples entre casas — o número que o parceiro pediu no card.
    // A mediana fica: é mais robusta a outlier e pode voltar à tela um dia.
    oddMedia: numeric('odd_media', { precision: 7, scale: 3 }),
    qtdCasas: smallint('qtd_casas').notNull().default(0),
    origem: origemOddsEnum('origem').notNull(),
    calculadoEm: timestamp('calculado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('odds_agregada_unica').on(t.jogoId, t.jogadorId, t.atributo, t.linha)],
)

/** Mesmo problema do mapa_jogadores, aplicado a nomes de mercado. */
export const mapaMercados = pgTable(
  'mapa_mercados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id),
    nomeMercadoNaCasa: text('nome_mercado_na_casa').notNull(),
    atributo: atributoEnum('atributo').notNull(),
    confirmado: boolean('confirmado').notNull().default(false),
  },
  (t) => [unique('mapa_mercados_unico').on(t.casaId, t.nomeMercadoNaCasa)],
)
