import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { jogadores, times } from './dominio'
import {
  atributoEnum,
  canalNotificacaoEnum,
  papelUsuarioEnum,
  statusUsuarioEnum,
  tipoDispositivoEnum,
  tipoEventoContaEnum,
} from './enums'

// ============================================================================
// GRUPO 5 · PLATAFORMA
// ============================================================================

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  nome: text('nome'),
  /** Avatar escolhido (caminho em public/avatares) — ou, no futuro, upload. */
  fotoUrl: text('foto_url'),
  // Estado administrativo/segurança. Situação financeira vive em
  // `assinaturas` e nunca altera esta coluna pelo webhook.
  status: statusUsuarioEnum('status').notNull().default('ATIVO'),
  // O painel admin é separado do app do usuário, mas a identidade é a mesma
  // tabela — não há razão para dois cadastros com as mesmas regras de senha.
  papel: papelUsuarioEnum('papel').notNull().default('USUARIO'),
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
  (t) => [
    unique('dispositivos_unico').on(t.usuarioId, t.fingerprint),
    unique('dispositivos_id_usuario_unico').on(t.id, t.usuarioId),
  ],
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
    // Necessário para saber qual é a "mais antiga" na regra dos 2 dispositivos.
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
    motivoEncerramento: text('motivo_encerramento'),
  },
  (t) => [
    index('sessoes_usuario_idx').on(t.usuarioId, t.encerradaEm),
    index('sessoes_antiguidade_idx').on(t.usuarioId, t.criadaEm),
  ],
)

/**
 * REDEFINIÇÃO DE SENHA — token de uso único, com validade curta, guardado
 * como hash (o token em claro só existe no link). Hoje quem emite é o admin,
 * que entrega o link por fora; quando houver provedor de e-mail, ele entrega
 * o mesmo link — nada aqui muda.
 */
export const redefinicoesSenha = pgTable(
  'redefinicoes_senha',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    usadaEm: timestamp('usada_em', { withTimezone: true }),
    criadaPorId: uuid('criada_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('redefinicoes_senha_usuario_idx').on(t.usuarioId)],
)

export const assinaturas = pgTable(
  'assinaturas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    mercadopagoId: text('mercadopago_id').unique(),
    /** Referência opaca criada localmente antes da chamada externa. */
    referenciaExterna: text('referencia_externa').unique(),
    produto: text('produto').notNull().default('NBA_PRO'),
    status: text('status').notNull(),
    plano: text('plano'),
    /**
     * O que foi COMPRADO. `plano` (acima) é a descrição que o provedor
     * devolve — texto livre; estas duas são o contrato na linguagem da NIP.
     * A conta e a reconciliação leem daqui.
     */
    nivelDoPlano: text('nivel_do_plano').notNull(),
    modalidade: text('modalidade').notNull(),
    inicio: timestamp('inicio', { withTimezone: true }),
    fim: timestamp('fim', { withTimezone: true }),
    proximaCobranca: timestamp('proxima_cobranca', { withTimezone: true }),
    ocorridoEmOrigem: timestamp('ocorrido_em_origem', { withTimezone: true }),
    cancelamentoSolicitadoEm: timestamp('cancelamento_solicitado_em', { withTimezone: true }),
    canceladaEm: timestamp('cancelada_em', { withTimezone: true }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assinaturas_usuario_produto_idx').on(t.usuarioId, t.produto, t.atualizadoEm),
    check('assinaturas_nivel_do_plano_valido', sql`${t.nivelDoPlano} in ('MVP', 'ALL_STAR')`),
    check('assinaturas_modalidade_valida', sql`${t.modalidade} in ('MENSAL', 'TEMPORADA')`),
  ],
)

/** Cada parcela/fatura observada no provedor, separada do contrato recorrente. */
export const cobrancas = pgTable(
  'cobrancas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    assinaturaId: uuid('assinatura_id').references(() => assinaturas.id, {
      onDelete: 'set null',
    }),
    provedor: text('provedor').notNull(),
    cobrancaExternaId: text('cobranca_externa_id').notNull(),
    status: text('status').notNull(),
    valorCentavos: integer('valor_centavos'),
    moeda: text('moeda'),
    aprovadoEm: timestamp('aprovado_em', { withTimezone: true }),
    ocorridoEmOrigem: timestamp('ocorrido_em_origem', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('cobrancas_provedor_externo_unico').on(t.provedor, t.cobrancaExternaId),
    index('cobrancas_usuario_idx').on(t.usuarioId, t.atualizadoEm),
  ],
)

/**
 * Autorização comercial explícita. Status de usuário e status de assinatura
 * não são usados como atalho para decidir acesso.
 */
export const direitosAcesso = pgTable(
  'direitos_acesso',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    produto: text('produto').notNull(),
    origem: text('origem').notNull(),
    referenciaOrigem: text('referencia_origem').notNull(),
    /**
     * Qual plano este direito representa. NOT NULL e sem GRATIS no check: o
     * grátis nunca tem linha — ele É a ausência de direito ativo. Guardar
     * "GRATIS" aqui seria criar um segundo jeito de dizer a mesma coisa.
     */
    nivelDoPlano: text('nivel_do_plano').notNull(),
    /**
     * Anulável: cortesia não tem modalidade. Vive aqui, e não só no
     * contrato, para `avaliarAcesso` responder com UMA consulta — a mesma
     * razão do LEFT JOIN que já existe nela.
     */
    modalidade: text('modalidade'),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fim: timestamp('fim', { withTimezone: true }),
    revogadoEm: timestamp('revogado_em', { withTimezone: true }),
    motivoRevogacao: text('motivo_revogacao'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('direitos_acesso_origem_unica').on(t.origem, t.referenciaOrigem, t.produto),
    index('direitos_acesso_usuario_ativo_idx').on(
      t.usuarioId,
      t.produto,
      t.revogadoEm,
      t.inicio,
      t.fim,
    ),
    check('direitos_acesso_intervalo_valido', sql`${t.fim} is null or ${t.fim} > ${t.inicio}`),
    check(
      'direitos_acesso_revogacao_tem_motivo',
      sql`${t.revogadoEm} is null or ${t.motivoRevogacao} is not null`,
    ),
    check('direitos_acesso_nivel_do_plano_valido', sql`${t.nivelDoPlano} in ('MVP', 'ALL_STAR')`),
    check(
      'direitos_acesso_modalidade_valida',
      sql`${t.modalidade} is null or ${t.modalidade} in ('MENSAL', 'TEMPORADA')`,
    ),
  ],
)

/** Coordena retries do checkout e impede duas assinaturas concorrentes. */
export const tentativasCheckout = pgTable(
  'tentativas_checkout',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    produto: text('produto').notNull(),
    provedor: text('provedor').notNull(),
    referenciaExterna: text('referencia_externa').notNull().unique(),
    chaveIdempotencia: text('chave_idempotencia').notNull().unique(),
    status: text('status').notNull().default('RESERVADA'),
    assinaturaExternaId: text('assinatura_externa_id'),
    urlCheckout: text('url_checkout'),
    leaseExpiraEm: timestamp('lease_expira_em', { withTimezone: true }),
    erroCodigo: text('erro_codigo'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tentativas_checkout_aberta_unica')
      .on(t.usuarioId, t.produto)
      .where(sql`${t.status} in ('RESERVADA', 'CRIANDO', 'AMBIGUA', 'CRIADA')`),
    index('tentativas_checkout_reconciliar_idx').on(t.status, t.leaseExpiraEm, t.atualizadoEm),
    check(
      'tentativas_checkout_status_valido',
      sql`${t.status} in ('RESERVADA', 'CRIANDO', 'AMBIGUA', 'CRIADA', 'FALHA', 'ENCERRADA')`,
    ),
  ],
)

/** Rate limit genérico de operações sensíveis fora do login. */
export const tentativasOperacaoConta = pgTable(
  'tentativas_operacao_conta',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operacao: text('operacao').notNull(),
    identificadorHash: text('identificador_hash').notNull(),
    ip: text('ip'),
    sucesso: boolean('sucesso').notNull(),
    tentadoEm: timestamp('tentado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tentativas_operacao_conta_janela_idx').on(t.operacao, t.identificadorHash, t.tentadoEm),
  ],
)

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
    expiraEm: timestamp('expira_em', { withTimezone: true }),
    invalidadaEm: timestamp('invalidada_em', { withTimezone: true }),
    motivoInvalidacao: text('motivo_invalidacao'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('push_inscricoes_endpoint').on(t.endpoint),
    index('push_inscricoes_fanout_idx').on(t.criadoEm, t.id),
    index('push_inscricoes_dispositivo_idx').on(t.dispositivoId, t.invalidadaEm),
    foreignKey({
      columns: [t.dispositivoId, t.usuarioId],
      foreignColumns: [dispositivos.id, dispositivos.usuarioId],
      name: 'push_inscricoes_dispositivo_usuario_fk',
    }).onDelete('cascade'),
    check(
      'push_inscricoes_ativa_tem_dispositivo',
      sql`${t.invalidadaEm} is not null or ${t.dispositivoId} is not null`,
    ),
    check(
      'push_inscricoes_invalidacao_tem_motivo',
      sql`${t.invalidadaEm} is null or ${t.motivoInvalidacao} is not null`,
    ),
    check(
      'push_inscricoes_expiracao_valida',
      sql`${t.expiraEm} is null or ${t.expiraEm} > ${t.criadoEm}`,
    ),
  ],
)

/** Auditoria sem material criptográfico ou endpoint do serviço de Push. */
export const pushInscricoesAuditoria = pgTable(
  'push_inscricoes_auditoria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id').references(() => pushInscricoes.id, {
      onDelete: 'set null',
    }),
    acao: text('acao').notNull(),
    usuarioAnteriorId: uuid('usuario_anterior_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    usuarioAtualId: uuid('usuario_atual_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    dispositivoAnteriorId: uuid('dispositivo_anterior_id').references(() => dispositivos.id, {
      onDelete: 'set null',
    }),
    dispositivoAtualId: uuid('dispositivo_atual_id').references(() => dispositivos.id, {
      onDelete: 'set null',
    }),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_inscricoes_auditoria_inscricao_idx').on(t.inscricaoId, t.ocorridoEm)],
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
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('preferencias_notificacao_unica').on(t.usuarioId, t.canal)],
)

/** Rate limit do login. Uma linha por tentativa; a janela é consultada por SQL. */
export const tentativasLogin = pgTable(
  'tentativas_login',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identificador: text('identificador').notNull(),
    ip: text('ip'),
    sucesso: boolean('sucesso').notNull(),
    tentadoEm: timestamp('tentado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tentativas_login_janela_idx').on(t.identificador, t.tentadoEm)],
)

/**
 * Eventos de pagamento recebidos do provedor.
 *
 * A UNIQUE em `evento_externo_id` é o que torna o webhook IDEMPOTENTE: o
 * Mercado Pago reenvia o mesmo evento, e reprocessar liberaria acesso duas
 * vezes ou geraria cobrança fantasma no relatório.
 */
export const eventosPagamento = pgTable(
  'eventos_pagamento',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provedor: text('provedor').notNull(),
    eventoExternoId: text('evento_externo_id').notNull(),
    tipo: text('tipo').notNull(),
    referenciaExterna: text('referencia_externa'),
    recursoTipo: text('recurso_tipo'),
    recursoExternoId: text('recurso_externo_id'),
    ocorridoEmOrigem: timestamp('ocorrido_em_origem', { withTimezone: true }),
    cargaJson: jsonb('carga_json'),
    processadoEm: timestamp('processado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('eventos_pagamento_unico').on(t.provedor, t.eventoExternoId)],
)

/** Trilha de conta — é daqui que o admin enxerga uso simultâneo e bloqueios. */
export const eventosConta = pgTable(
  'eventos_conta',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }),
    tipo: tipoEventoContaEnum('tipo').notNull(),
    detalhe: text('detalhe'),
    ip: text('ip'),
    contexto: jsonb('contexto'),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('eventos_conta_usuario_idx').on(t.usuarioId, t.ocorridoEm)],
)

/**
 * Jogadores que o usuário escolheu ocultar visualmente no Fire Live — a primeira
 * preferência por CONTA do produto (sincroniza entre dispositivos, ao
 * contrário de tudo que vive na URL).
 *
 * Aplicada como recorte de LEITURA na tela: o snapshot do feed é por evento,
 * nunca por usuário, e a materialização não sabe que isto existe. O push
 * TAMBÉM não filtra por aqui — ocultar cala a tela, não a notificação
 * (pergunta aberta ao CJ; mexer no fan-out é outra obra).
 */
export const jogadoresOcultos = pgTable(
  'jogadores_ocultos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('jogadores_ocultos_unico').on(t.usuarioId, t.jogadorId)],
)

/**
 * Preferências ESCALARES por conta (identidade 04): como o assinante quer ver
 * a Lista Secreta — a ordem (por jogo, para montar a noite; por nível, para
 * pegar os melhores) e a lente da zona 2 do card (últimos 5, média × linha,
 * odds, hierarquia). Uma linha por usuário; ausência é o padrão.
 *
 * Ordem/lente são recortes de leitura; motion e áudio controlam a experiência.
 * Apenas acompanhados é opt-in de alertas, não filtro do feed. Guardadas como
 * texto (não enum do banco) de propósito — os valores válidos são do tipo em
 * `plataforma/preferencias.ts`; acrescentar uma lente não pede migração.
 */
export const preferenciasUsuario = pgTable(
  'preferencias_usuario',
  {
    usuarioId: uuid('usuario_id')
      .primaryKey()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    ordemLista: text('ordem_lista'),
    lente: text('lente'),
    intensidade: text('intensidade').notNull().default('PADRAO'),
    somHabilitado: boolean('som_habilitado').notNull().default(true),
    volume: integer('volume').notNull().default(50),
    apenasAcompanhados: boolean('apenas_acompanhados').notNull().default(false),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('preferencias_volume_valido', sql`${t.volume} BETWEEN 0 AND 100`),
    check(
      'preferencias_intensidade_valida',
      sql`${t.intensidade} IN ('REDUZIDAS', 'PADRAO', 'INTENSAS')`,
    ),
  ],
)

/** Acompanhamento positivo. Não altera política de alertas por si só. */
export const jogadoresAcompanhados = pgTable(
  'jogadores_acompanhados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('jogadores_acompanhados_unico').on(t.usuarioId, t.jogadorId)],
)

/** Atalho de consulta; não implica acompanhar os jogadores do elenco. */
export const timesAcompanhados = pgTable(
  'times_acompanhados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    timeId: uuid('time_id')
      .notNull()
      .references(() => times.id, { onDelete: 'cascade' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('times_acompanhados_unico').on(t.usuarioId, t.timeId)],
)

/** Exclusões de alerta não removem cartões nem acompanhamento. */
export const jogadoresSilenciados = pgTable(
  'jogadores_silenciados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    jogadorId: uuid('jogador_id')
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('jogadores_silenciados_unico').on(t.usuarioId, t.jogadorId)],
)

export const atributosSilenciados = pgTable(
  'atributos_silenciados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    atributo: atributoEnum('atributo').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('atributos_silenciados_unico').on(t.usuarioId, t.atributo)],
)

/**
 * OBSERVABILIDADE DE LLM — uma linha por chamada, sucesso ou falha.
 *
 * É o que responde "quanto isso está custando" e "qual perfil está falhando"
 * sem depender do painel do provedor. Falha registrada é tão importante
 * quanto sucesso: um perfil que só erra é invisível se só o sucesso for
 * gravado.
 */
export const llmChamadas = pgTable(
  'llm_chamadas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    perfil: text('perfil').notNull(),
    /** Qual modelo respondeu de fato — null quando a chamada nem chegou lá. */
    modelo: text('modelo'),
    tokensEntrada: integer('tokens_entrada').notNull().default(0),
    tokensSaida: integer('tokens_saida').notNull().default(0),
    ok: boolean('ok').notNull(),
    erro: text('erro'),
    duracaoMs: integer('duracao_ms').notNull().default(0),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('llm_chamadas_criado_em_idx').on(t.criadoEm)],
)

/**
 * MENSAGENS DO CHAT — cota, histórico e auditoria na MESMA tabela.
 *
 * A cota diária é `COUNT(*)` das mensagens do usuário no dia. Um contador
 * paralelo poderia divergir do histórico; aqui os dois são a mesma coisa por
 * construção.
 */
export const chatMensagens = pgTable(
  'chat_mensagens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    papel: text('papel', { enum: ['USUARIO', 'ASSISTENTE'] }).notNull(),
    texto: text('texto').notNull(),
    modelo: text('modelo'),
    tokensEntrada: integer('tokens_entrada').notNull().default(0),
    tokensSaida: integer('tokens_saida').notNull().default(0),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_mensagens_usuario_dia_idx').on(t.usuarioId, t.criadoEm)],
)

/**
 * ENTRADAS REALIZADAS — o que o usuário registra ter feito em outro lugar,
 * separado do que a NIP sugeriu (spec 12/09, §5.5). A plataforma continua
 * somente leitura: nada aqui envia aposta. Chave natural evita duplicar no
 * segundo toque.
 */
export const entradasRealizadas = pgTable(
  'entradas_realizadas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    dataReferencia: text('data_referencia').notNull(),
    jogadorId: uuid('jogador_id').notNull().references(() => jogadores.id),
    atributo: atributoEnum('atributo').notNull(),
    linha: smallint('linha').notNull(),
    unidades: numeric('unidades', { precision: 6, scale: 2 }).notNull(),
    odd: numeric('odd', { precision: 6, scale: 2 }),
    registradaEm: timestamp('registrada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('entradas_realizadas_unica').on(t.usuarioId, t.dataReferencia, t.jogadorId, t.atributo, t.linha)],
)
