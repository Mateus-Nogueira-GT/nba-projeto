import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { atributoEnum, nivelJogadorEnum } from './enums'
import { jogadores, jogos } from './dominio'

// ============================================================================
// GRUPO 7 · FIRE LIVE — estado do loop do 1º quarto
// ============================================================================

export type EstadoExecucaoFireLive = 'RESERVADA' | 'INICIADA' | 'ENCERRADA' | 'FALHOU_AO_INICIAR'

/**
 * GREENS — "o jogador bateu a marca".
 *
 * Tabela separada de `apitos` de propósito. Um green não é um apito: não tem
 * alvo, não tem confiança, sai por outro canal de push e ocupa outra posição
 * na tela. Enfiá-lo em `apitos` com `linha = marco` até funcionaria para a
 * deduplicação, mas poluiria o feed — que filtra por estratégia — com linhas
 * que não são entradas sugeridas.
 *
 * A UNIQUE aqui tem exatamente o mesmo peso da de `apitos`: é o que impede
 * três pushes iguais no celular do assinante quando um passo do workflow é
 * reexecutado. Requisito funcional (CLAUDE.md, regra 5).
 */
export const greens = pgTable(
  'greens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    nivelJogador: nivelJogadorEnum('nivel_jogador').notNull(),
    /** Marco de `push.marcos_green` que foi cruzado. */
    marco: smallint('marco').notNull(),
    /** Valor observado quando o marco caiu — para auditoria do push. */
    valor: smallint('valor').notNull(),
    detectadoEm: timestamp('detectado_em', { withTimezone: true }).notNull().defaultNow(),
    /** OUTBOX — mesma razão da coluna homônima em `apitos`. */
    pushEnfileiradoEm: timestamp('push_enfileirado_em', { withTimezone: true }),
  },
  (t) => [unique('greens_dedup').on(t.jogoId, t.jogadorId, t.atributo, t.marco)],
)

/**
 * Uma execução do workflow do 1º quarto, por jogo.
 *
 * A UNIQUE em `jogo_id` é o que impede DOIS workflows observando o mesmo jogo.
 * O cron do tipoff roda a cada minuto e é, por desenho, reexecutável: ele tenta
 * inserir aqui primeiro e só dispara o workflow se a inserção passou.
 */
export const fireLiveExecucoes = pgTable(
  'fire_live_execucoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jogoId: uuid('jogo_id')
      .notNull()
      .references(() => jogos.id, { onDelete: 'cascade' }),
    /** Id do run no Vercel Workflow — ponte para `npx workflow inspect`. */
    runId: text('run_id'),
    /**
     * Estado explícito do handshake banco ↔ Workflow.
     *
     * `RESERVADA` é um lease temporário, não uma confirmação de que o
     * workflow iniciou. A execução só vira `INICIADA` quando um `runId` vence
     * o fencing token da tentativa atual.
     */
    estado: text('estado').$type<EstadoExecucaoFireLive>().notNull().default('RESERVADA'),
    /** Token de fencing trocado a cada nova tentativa de início. */
    leaseToken: uuid('lease_token'),
    /** Enquanto este instante não passa, outro cron não pode retomar a reserva. */
    leaseExpiraEm: timestamp('lease_expira_em', { withTimezone: true }),
    tentativasInicio: integer('tentativas_inicio').notNull().default(0),
    ultimaTentativaEm: timestamp('ultima_tentativa_em', { withTimezone: true }),
    /** Instante em que o run vencedor confirmou o início. */
    workflowIniciadoEm: timestamp('workflow_iniciado_em', { withTimezone: true }),
    /** Erro sanitizado; nunca contém token, header ou URL do provedor. */
    erroInicio: text('erro_inicio'),
    iniciadoEm: timestamp('iniciado_em', { withTimezone: true }).notNull().defaultNow(),
    encerradoEm: timestamp('encerrado_em', { withTimezone: true }),
    /** Por que o loop parou. Sempre preenchido no encerramento. */
    motivoEncerramento: text('motivo_encerramento'),
    ciclos: integer('ciclos').notNull().default(0),
    /**
     * Último estado observado, para detecção de mudança.
     *
     * Serve à EFICIÊNCIA (avaliar só quem mudou), nunca à deduplicação — quem
     * garante push único é a UNIQUE de `apitos`/`greens`. Se este campo se
     * perder, o ciclo reavalia todo mundo e continua correto; se a UNIQUE
     * cair, o assinante recebe push repetido.
     */
    ultimoEstado: jsonb('ultimo_estado'),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('fire_live_execucoes_jogo').on(t.jogoId),
    index('fire_live_execucoes_abertas_idx').on(t.encerradoEm),
    index('fire_live_execucoes_lease_idx').on(t.estado, t.leaseExpiraEm),
    check(
      'fire_live_execucoes_estado_valido',
      sql`${t.estado} in ('RESERVADA', 'INICIADA', 'ENCERRADA', 'FALHOU_AO_INICIAR')`,
    ),
  ],
)
