import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { severidadeEnum, tipoProvedorEnum } from './enums'

// ============================================================================
// GRUPO 6 · OBSERVABILIDADE
// ============================================================================

/**
 * Base do "alerta de dado parado": dispara quando dadoMaisRecenteEm fica além
 * do limite esperado — limite mais rígido durante a janela dos jogos.
 */
export const saudeProvedor = pgTable(
  'saude_provedor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provedor: text('provedor').notNull(),
    tipo: tipoProvedorEnum('tipo').notNull(),
    ultimaRespostaOk: timestamp('ultima_resposta_ok', { withTimezone: true }),
    latenciaMs: integer('latencia_ms'),
    status: text('status').notNull(),
    dadoMaisRecenteEm: timestamp('dado_mais_recente_em', { withTimezone: true }),
  },
  (t) => [unique('saude_provedor_unico').on(t.provedor)],
)

export const logFalhas = pgTable('log_falhas', {
  id: uuid('id').primaryKey().defaultRandom(),
  origem: text('origem').notNull(),
  severidade: severidadeEnum('severidade').notNull(),
  mensagem: text('mensagem').notNull(),
  contextoJson: jsonb('contexto_json'),
  ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
})
