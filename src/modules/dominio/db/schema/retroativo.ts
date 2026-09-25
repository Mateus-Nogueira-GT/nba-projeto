import {
  boolean, date, index, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core'

import { jogadores, jogos } from './dominio'
import { niveisVersao } from './editorial'
import { atributoEnum, estrategiaEnum, metodoEnum, nivelJogadorEnum } from './enums'

/**
 * TEMPORADA ANTERIOR — o motor NIP aplicado a uma temporada que já terminou.
 *
 * Tabelas SEPARADAS de `apitos`/`greens`/`feed_snapshot` por decisão do parceiro
 * (spec 25/09, decisão 5): nada daqui foi publicado na época, nada daqui gera
 * push, nada daqui entra no Placar público. Só Resultados, Lista Secreta e
 * Estatísticas leem, e só quando a URL pede uma temporada anterior.
 */
export const apitosRetroativos = pgTable(
  'apitos_retroativos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    temporada: text('temporada').notNull(),
    dataReferencia: date('data_referencia').notNull(),
    niveisVersaoId: uuid('niveis_versao_id').notNull().references(() => niveisVersao.id),
    rulesetVersao: text('ruleset_versao').notNull(),
    jogoId: uuid('jogo_id').notNull().references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id').notNull().references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    estrategia: estrategiaEnum('estrategia').notNull(),
    metodo: metodoEnum('metodo'),
    nivelJogador: nivelJogadorEnum('nivel_jogador').notNull(),
    nivelApito: smallint('nivel_apito').notNull(),
    turbo: boolean('turbo').notNull().default(false),
    modoFire: boolean('modo_fire').notNull().default(false),
    opdOrigemNivel: smallint('opd_origem_nivel'),
    linha: smallint('linha'),
    // "confianca", NUNCA "probabilidade" (P12).
    confianca: numeric('confianca', { precision: 5, scale: 2 }),
    alvo1q: smallint('alvo_1q'),
    geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Mesma chave de `apitos` (regra 5): rodar de novo nunca duplica.
    unique('apitos_retroativos_dedup')
      .on(t.jogoId, t.jogadorId, t.atributo, t.estrategia, t.linha)
      .nullsNotDistinct(),
    index('apitos_retroativos_temporada_data_idx').on(t.temporada, t.dataReferencia),
    index('apitos_retroativos_jogador_idx').on(t.jogadorId),
  ],
)

export const greensRetroativos = pgTable(
  'greens_retroativos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    temporada: text('temporada').notNull(),
    dataReferencia: date('data_referencia').notNull(),
    jogoId: uuid('jogo_id').notNull().references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id').notNull().references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    nivelJogador: nivelJogadorEnum('nivel_jogador').notNull(),
    marco: smallint('marco').notNull(),
    valor: smallint('valor').notNull(),
  },
  (t) => [
    unique('greens_retroativos_unico').on(t.jogoId, t.jogadorId, t.atributo, t.marco),
    index('greens_retroativos_temporada_data_idx').on(t.temporada, t.dataReferencia),
  ],
)

export const feedRetroativo = pgTable(
  'feed_retroativo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    temporada: text('temporada').notNull(),
    dataReferencia: date('data_referencia').notNull(),
    niveisVersaoId: uuid('niveis_versao_id').notNull().references(() => niveisVersao.id),
    conteudoJson: jsonb('conteudo_json').notNull(),
    hash: text('hash').notNull(),
    geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('feed_retroativo_unico').on(t.temporada, t.dataReferencia)],
)
