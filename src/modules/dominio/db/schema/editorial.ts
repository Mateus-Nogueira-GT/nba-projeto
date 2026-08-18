import { sql } from 'drizzle-orm'
import {
  boolean,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { atributoEnum, nivelJogadorEnum } from './enums'
import { jogadores, times } from './dominio'

// ============================================================================
// GRUPO 2 · EDITORIAL — vem do CJ, não do provedor
//
// É o que MAIS muda no projeto: a lista acompanha o mercado, não só a
// temporada (Schröder foi dispensado durante a elaboração). Precisa mudar
// sem migration — por isso versionado.
// ============================================================================

export const niveisVersao = pgTable(
  'niveis_versao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versao: text('versao').notNull().unique(),
    origemArquivo: text('origem_arquivo'),
    importadoPor: text('importado_por'),
    importadoEm: timestamp('importado_em', { withTimezone: true }).notNull().defaultNow(),
    ativa: boolean('ativa').notNull().default(false),
  },
  (t) => [
    // Só UMA versão ativa por vez — garantido pelo BANCO, não pela aplicação.
    // Índice único parcial: colide apenas entre linhas com ativa = true.
    uniqueIndex('niveis_versao_unica_ativa')
      .on(t.ativa)
      .where(sql`${t.ativa}`),
  ],
)

export const niveis = pgTable(
  'niveis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    niveisVersaoId: uuid('niveis_versao_id')
      .notNull()
      .references(() => niveisVersao.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    timeId: uuid('time_id')
      .notNull()
      .references(() => times.id),
    // Hoje só existe atributo = PONTOS. Rebotes e assistências virão do CJ:
    // é INSERT de uma versão nova, nada de schema muda.
    atributo: atributoEnum('atributo').notNull(),
    nivel: nivelJogadorEnum('nivel').notNull(),
    // 1..N no time — usado SOMENTE pela OPD.
    posicaoHierarquia: smallint('posicao_hierarquia').notNull(),
  },
  (t) => [unique('niveis_unico').on(t.niveisVersaoId, t.jogadorId, t.atributo)],
)
