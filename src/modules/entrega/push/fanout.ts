import { createHash } from 'node:crypto'
import { DuplicateMessageError, send } from '@vercel/queue'
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import {
  atributosSilenciados,
  dispositivos,
  jogadoresAcompanhados,
  jogadoresSilenciados,
  preferenciasUsuario,
  direitosAcesso,
  preferenciasNotificacao,
  pushInscricoes,
  sessoes,
  usuarios,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import {
  alertaPermitido,
  estadoExperienciaPadrao,
  type AlvoAlerta,
} from '../../plataforma/experiencia/contrato'
import { invalidarInscricoes } from '../../plataforma/push/inscricoes'
import { mensagemPushExpirada, mensagemPushV1Schema, type MensagemPushV1 } from './contrato'
import type { InscricaoPush, PortaEnvioPush, ResultadoEnvioPush } from './porta'

export const TOPICO_PUSH_EVENTOS = 'push-eventos'
export const TOPICO_PUSH_ENTREGAS = 'push-entregas'

// Teto de reenvios parciais de um mesmo lote (W2-2). Na prática a validade do
// apito corta antes; o teto só impede um ciclo sem fim num evento de validade longa.
const TENTATIVAS_MAXIMAS_DO_LOTE = 5

// Espera antes de tentar de novo quando a VAPID é recusada no lote todo (W2-2).
// Os 300 s de antes eram a validade inteira de um apito de Fire Live.
const ATRASO_VAPID_GLOBAL_SEGUNDOS = 60

const cursorSchema = z
  .object({ criadoEm: z.string().datetime({ offset: true }), id: z.string().uuid() })
  .strict()

export const mensagemExpansaoPushSchema = z
  .object({
    versao: z.literal(1),
    evento: mensagemPushV1Schema,
    cursor: cursorSchema.nullable(),
    limiteSuperior: cursorSchema.nullable(),
    pagina: z.number().int().nonnegative(),
    // Faixa (W2-2): cobre só (cursor, limiteSuperior] em uma página e não
    // continua. Ausente nas mensagens da cadeia antiga, que seguem valendo
    // para o que estiver na fila durante o deploy.
    faixa: z.boolean().optional(),
    // Plano congelado (W2-2): os fins de cada faixa, calculados UMA vez na
    // expansão inicial. Quem processa o plano só republica o que está aqui, e
    // por isso a reentrega dá as mesmas faixas com as mesmas chaves. O teto
    // cobre 50 mil inscrições no lote mínimo (10); cada fim tem ~80 bytes, bem
    // abaixo do limite de payload da fila.
    fins: z.array(cursorSchema).min(1).max(5000).optional(),
  })
  .strict()

export const mensagemLotePushSchema = z
  .object({
    versao: z.literal(1),
    evento: mensagemPushV1Schema,
    inscricaoIds: z.array(z.string().uuid()).min(1).max(500),
    pagina: z.number().int().nonnegative(),
    // Reenvio parcial (W2-2): ausente no lote original, 1..N nos lotes que
    // carregam só as inscrições que pediram retry.
    tentativa: z.number().int().nonnegative().optional(),
  })
  .strict()

export type CursorPush = z.infer<typeof cursorSchema>
export type MensagemExpansaoPush = z.infer<typeof mensagemExpansaoPushSchema>
export type MensagemLotePush = z.infer<typeof mensagemLotePushSchema>

export type ConfiguracaoOperacionalPush = {
  tamanhoLote: number
  paralelismo: number
  visibilidadeSegundos: number
  retryBaseSegundos: number
}

function inteiroDoAmbiente(
  nome: string,
  padrao: number,
  minimo: number,
  maximo: number,
  ambiente: Readonly<Record<string, string | undefined>>,
): number {
  const bruto = ambiente[nome]
  if (bruto === undefined || bruto === '') return padrao
  const valor = Number(bruto)
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${nome} deve ser inteiro entre ${minimo} e ${maximo}`)
  }
  return valor
}

export function configuracaoOperacionalPush(
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): ConfiguracaoOperacionalPush {
  return {
    tamanhoLote: inteiroDoAmbiente('PUSH_BATCH_SIZE', 100, 10, 500, ambiente),
    paralelismo: inteiroDoAmbiente('PUSH_SEND_CONCURRENCY', 10, 1, 50, ambiente),
    visibilidadeSegundos: inteiroDoAmbiente(
      'PUSH_VISIBILITY_TIMEOUT_SECONDS',
      120,
      30,
      3600,
      ambiente,
    ),
    retryBaseSegundos: inteiroDoAmbiente('PUSH_RETRY_BASE_SECONDS', 30, 1, 900, ambiente),
  }
}

export interface PoliticaComercialPush {
  permitido(usuario: { id: string; email: string; direitoAtivo?: boolean }): boolean
}

/** Até a Spec 04, somente a allowlist interna pode receber conteúdo pago. */
export class PoliticaHomologacaoPush implements PoliticaComercialPush {
  private readonly permitidos: Set<string>

  constructor(
    lista: string,
    private readonly publicoHabilitado = false,
  ) {
    this.permitidos = new Set(
      lista
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    )
  }

  permitido(usuario: { id: string; email: string; direitoAtivo?: boolean }): boolean {
    return (
      this.permitidos.has(usuario.id.toLowerCase()) ||
      this.permitidos.has(usuario.email.toLowerCase()) ||
      (this.publicoHabilitado && usuario.direitoAtivo === true)
    )
  }
}

export function politicaHomologacaoDoAmbiente(
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): PoliticaHomologacaoPush {
  return new PoliticaHomologacaoPush(
    ambiente.PUSH_INTERNAL_ALLOWLIST ?? '',
    ambiente.PUSH_ENABLED === 'true',
  )
}

export interface PublicadorFanoutPush {
  publicarExpansao(mensagem: MensagemExpansaoPush, idempotencyKey: string): Promise<void>
  publicarLote(
    mensagem: MensagemLotePush,
    idempotencyKey: string,
    atrasoSegundos?: number,
  ): Promise<void>
}

/** O `send` da fila, injetável para teste sem rede. */
export type EnvioFila = (
  topico: string,
  mensagem: unknown,
  opcoes: { idempotencyKey: string; delaySeconds?: number },
) => Promise<unknown>

const envioReal: EnvioFila = (topico, mensagem, opcoes) => send(topico, mensagem, opcoes)

/**
 * Publica com chave de idempotência e trata a chave JÁ USADA como sucesso (W2-2).
 *
 * A fila responde 409 (`DuplicateMessageError`) quando a chave já foi aceita,
 * e numa reentrega é exatamente isso que se espera: a mensagem já está lá. Se o
 * erro subisse, um plano reentregue parava na 1ª faixa já publicada e as
 * seguintes nunca saíam; a inicial reentregue ficaria em loop até
 * `maxDeliveries`. Qualquer outro erro sobe, para a fila tentar de novo.
 */
export async function enviarIdempotente(
  topico: string,
  mensagem: unknown,
  opcoes: { idempotencyKey: string; delaySeconds?: number },
  enviar: EnvioFila = envioReal,
): Promise<void> {
  try {
    await enviar(topico, mensagem, opcoes)
  } catch (erro) {
    if (erro instanceof DuplicateMessageError) return
    throw erro
  }
}

export class PublicadorFanoutVercel implements PublicadorFanoutPush {
  constructor(private readonly enviar: EnvioFila = envioReal) {}

  async publicarExpansao(mensagem: MensagemExpansaoPush, idempotencyKey: string): Promise<void> {
    await enviarIdempotente(TOPICO_PUSH_EVENTOS, mensagem, { idempotencyKey }, this.enviar)
  }

  async publicarLote(
    mensagem: MensagemLotePush,
    idempotencyKey: string,
    atrasoSegundos?: number,
  ): Promise<void> {
    // O atraso é o backoff do reenvio parcial (W2-2); o lote original sai sem ele.
    await enviarIdempotente(
      TOPICO_PUSH_ENTREGAS,
      mensagem,
      { idempotencyKey, ...(atrasoSegundos ? { delaySeconds: atrasoSegundos } : {}) },
      this.enviar,
    )
  }
}

export function expansaoInicial(evento: MensagemPushV1): MensagemExpansaoPush {
  return { versao: 1, evento, cursor: null, limiteSuperior: null, pagina: 0 }
}

export function chaveFanout(...partes: string[]): string {
  return createHash('sha256').update(partes.join('|')).digest('base64url')
}

async function capturarLimiteSuperior(db: Db, agora: Date): Promise<CursorPush | null> {
  const [linha] = await db
    .select({ id: pushInscricoes.id, criadoEm: pushInscricoes.criadoEm })
    .from(pushInscricoes)
    .where(
      and(
        isNull(pushInscricoes.invalidadaEm),
        or(isNull(pushInscricoes.expiraEm), gt(pushInscricoes.expiraEm, agora)),
      ),
    )
    .orderBy(desc(pushInscricoes.criadoEm), desc(pushInscricoes.id))
    .limit(1)

  return linha ? { id: linha.id, criadoEm: linha.criadoEm.toISOString() } : null
}

async function paginaDeInscricoes(
  db: Db,
  cursor: CursorPush | null,
  limite: CursorPush,
  tamanho: number,
  agora: Date,
) {
  const depoisDoCursor = cursor
    ? or(
        gt(pushInscricoes.criadoEm, new Date(cursor.criadoEm)),
        and(
          eq(pushInscricoes.criadoEm, new Date(cursor.criadoEm)),
          gt(pushInscricoes.id, cursor.id),
        ),
      )
    : undefined
  const antesDoLimite = or(
    lt(pushInscricoes.criadoEm, new Date(limite.criadoEm)),
    and(eq(pushInscricoes.criadoEm, new Date(limite.criadoEm)), lte(pushInscricoes.id, limite.id)),
  )

  return db
    .select({ id: pushInscricoes.id, criadoEm: pushInscricoes.criadoEm })
    .from(pushInscricoes)
    .where(
      and(
        depoisDoCursor,
        antesDoLimite,
        isNull(pushInscricoes.invalidadaEm),
        or(isNull(pushInscricoes.expiraEm), gt(pushInscricoes.expiraEm, agora)),
      ),
    )
    .orderBy(asc(pushInscricoes.criadoEm), asc(pushInscricoes.id))
    .limit(tamanho)
}

/**
 * Fronteiras das faixas em UMA consulta: o (criadoEm, id) de cada
 * `tamanho`-ésima inscrição ativa até o limite. Cada faixa vira uma
 * mensagem independente — a fila as consome em paralelo, em vez de 20
 * saltos em sequência para 2 mil inscrições (W2-2).
 */
async function fronteirasDasFaixas(
  db: Db,
  limite: CursorPush,
  tamanho: number,
  agora: Date,
): Promise<CursorPush[]> {
  const resultado = await db.execute(sql`
    select criado_em, id from (
      select criado_em, id, row_number() over (order by criado_em, id) as n
      from ${pushInscricoes}
      where invalidada_em is null
        and (expira_em is null or expira_em > ${agora})
        and (criado_em, id) <= (${new Date(limite.criadoEm)}, ${limite.id}::uuid)
    ) t
    where n % ${tamanho} = 0
    order by criado_em, id
  `)
  // PGlite e o Pool do Neon (compatível com node-postgres) devolvem `.rows`;
  // o tipo base do Drizzle não sabe qual driver é, daí a leitura defensiva.
  const linhas = Array.isArray(resultado)
    ? (resultado as unknown[])
    : ((resultado as { rows?: unknown[] }).rows ?? [])
  return (linhas as { criado_em: Date | string; id: string }[]).map((linha) => ({
    criadoEm: new Date(linha.criado_em).toISOString(),
    id: linha.id,
  }))
}

type InscricaoElegivel = {
  id: string
  usuarioId: string
  email: string
  endpoint: string
  expiraEm: Date | null
  chaveP256dh: string
  chaveAuth: string
}

async function inscricoesElegiveis(
  db: Db,
  ids: string[],
  evento: MensagemPushV1,
  politica: PoliticaComercialPush,
  agora: Date,
): Promise<InscricaoElegivel[]> {
  if (ids.length === 0 || mensagemPushExpirada(evento, agora)) return []

  const alvo: AlvoAlerta =
    evento.canal === 'LISTA_SECRETA'
      ? { canal: evento.canal }
      : { canal: evento.canal, jogadorId: evento.dados.jogadorId, atributo: evento.dados.atributo }

  const linhas = await db
    .selectDistinct({
      id: pushInscricoes.id,
      usuarioId: usuarios.id,
      email: usuarios.email,
      endpoint: pushInscricoes.endpoint,
      expiraEm: pushInscricoes.expiraEm,
      chaveP256dh: pushInscricoes.chaveP256dh,
      chaveAuth: pushInscricoes.chaveAuth,
      direitoId: direitosAcesso.id,
      apenasAcompanhados: preferenciasUsuario.apenasAcompanhados,
      jogadorAcompanhado: jogadoresAcompanhados.jogadorId,
      jogadorSilenciado: jogadoresSilenciados.jogadorId,
      atributoSilenciado: atributosSilenciados.atributo,
    })
    .from(pushInscricoes)
    .innerJoin(
      dispositivos,
      and(
        eq(dispositivos.id, pushInscricoes.dispositivoId),
        eq(dispositivos.usuarioId, pushInscricoes.usuarioId),
      ),
    )
    .innerJoin(usuarios, eq(usuarios.id, pushInscricoes.usuarioId))
    .innerJoin(
      sessoes,
      and(
        eq(sessoes.dispositivoId, dispositivos.id),
        eq(sessoes.usuarioId, usuarios.id),
        isNull(sessoes.encerradaEm),
        gt(sessoes.expiraEm, agora),
      ),
    )
    .leftJoin(
      preferenciasNotificacao,
      and(
        eq(preferenciasNotificacao.usuarioId, usuarios.id),
        eq(preferenciasNotificacao.canal, evento.canal),
      ),
    )
    // Relações únicas por conta/alvo: uma consulta por lote, sem buscar elencos
    // ou todas as preferências de cada assinante. Lista geral não tem alvo.
    .leftJoin(preferenciasUsuario, eq(preferenciasUsuario.usuarioId, usuarios.id))
    .leftJoin(
      jogadoresAcompanhados,
      alvo.jogadorId
        ? and(
            eq(jogadoresAcompanhados.usuarioId, usuarios.id),
            eq(jogadoresAcompanhados.jogadorId, alvo.jogadorId),
          )
        : sql`false`,
    )
    .leftJoin(
      jogadoresSilenciados,
      alvo.jogadorId
        ? and(
            eq(jogadoresSilenciados.usuarioId, usuarios.id),
            eq(jogadoresSilenciados.jogadorId, alvo.jogadorId),
          )
        : sql`false`,
    )
    .leftJoin(
      atributosSilenciados,
      alvo.atributo
        ? and(
            eq(atributosSilenciados.usuarioId, usuarios.id),
            eq(atributosSilenciados.atributo, alvo.atributo),
          )
        : sql`false`,
    )
    .leftJoin(
      direitosAcesso,
      and(
        eq(direitosAcesso.usuarioId, usuarios.id),
        eq(direitosAcesso.produto, 'NBA_PRO'),
        isNull(direitosAcesso.revogadoEm),
        lte(direitosAcesso.inicio, agora),
        or(isNull(direitosAcesso.fim), gt(direitosAcesso.fim, agora)),
      ),
    )
    .where(
      and(
        inArray(pushInscricoes.id, ids),
        isNull(pushInscricoes.invalidadaEm),
        or(isNull(pushInscricoes.expiraEm), gt(pushInscricoes.expiraEm, agora)),
        eq(usuarios.status, 'ATIVO'),
        or(isNull(preferenciasNotificacao.id), eq(preferenciasNotificacao.habilitado, true)),
      ),
    )

  return linhas.filter((linha) => {
    if (
      !politica.permitido({
        id: linha.usuarioId,
        email: linha.email,
        direitoAtivo: linha.direitoId !== null,
      })
    )
      return false
    // Mesmo predicado do som local; mute/volume nunca participam do push.
    const estado = estadoExperienciaPadrao()
    estado.preferencias.apenasAcompanhados = linha.apenasAcompanhados ?? false
    estado.jogadoresAcompanhados = linha.jogadorAcompanhado ? [linha.jogadorAcompanhado] : []
    estado.jogadoresSilenciados = linha.jogadorSilenciado ? [linha.jogadorSilenciado] : []
    estado.atributosSilenciados = linha.atributoSilenciado ? [linha.atributoSilenciado] : []
    return alertaPermitido(estado, alvo)
  })
}

export async function expandirEventoPush(
  db: Db,
  publicador: PublicadorFanoutPush,
  entrada: unknown,
  politica: PoliticaComercialPush,
  configuracao = configuracaoOperacionalPush(),
  agora = new Date(),
): Promise<{ expirado: boolean; varridas: number; elegiveis: number; continuou: boolean }> {
  const mensagem = mensagemExpansaoPushSchema.parse(entrada)
  if (mensagemPushExpirada(mensagem.evento, agora)) {
    return { expirado: true, varridas: 0, elegiveis: 0, continuou: false }
  }

  const limite = mensagem.limiteSuperior ?? (await capturarLimiteSuperior(db, agora))
  if (!limite) return { expirado: false, varridas: 0, elegiveis: 0, continuou: false }

  // Plano (W2-2): publica TODAS as faixas de uma vez, a partir do CONTEÚDO da
  // mensagem, sem recalcular nada. Recalcular a cada tentativa deslocava as
  // fronteiras quando uma inscrição era invalidada entre elas, e a faixa de
  // mesmo índice ganhava outra chave: a fila não deduplicava e o push saía
  // duas vezes (regra 5 do CLAUDE.md).
  if (mensagem.fins) {
    let inicio: CursorPush | null = null
    for (const [pagina, fim] of mensagem.fins.entries()) {
      await publicador.publicarExpansao(
        {
          versao: 1,
          evento: mensagem.evento,
          cursor: inicio,
          limiteSuperior: fim,
          pagina,
          faixa: true,
        },
        chaveFanout('faixa', mensagem.evento.chave, fim.criadoEm, fim.id),
      )
      inicio = fim
    }
    return { expirado: false, varridas: 0, elegiveis: 0, continuou: false }
  }

  // Expansão inicial (W2-2): captura o limite e as fronteiras UMA vez e as
  // congela num plano com chave estável por evento. Se esta mensagem for
  // reentregue, o plano novo (talvez diferente) tem a mesma chave e a fila o
  // descarta — vale o primeiro. A primeira faixa também tem cursor nulo, mas
  // chega com `faixa: true` e não entra aqui.
  if (mensagem.cursor === null && !mensagem.faixa) {
    const fronteiras = await fronteirasDasFaixas(db, limite, configuracao.tamanhoLote, agora)
    // Quando o total é múltiplo do lote, a última fronteira É o limite.
    const fins = [
      ...fronteiras.filter((f) => f.id !== limite.id || f.criadoEm !== limite.criadoEm),
      limite,
    ]
    await publicador.publicarExpansao(
      {
        versao: 1,
        evento: mensagem.evento,
        cursor: null,
        limiteSuperior: limite,
        pagina: 0,
        fins,
      },
      chaveFanout('plano', mensagem.evento.chave),
    )
    return { expirado: false, varridas: 0, elegiveis: 0, continuou: false }
  }

  const pagina = await paginaDeInscricoes(
    db,
    mensagem.cursor,
    limite,
    configuracao.tamanhoLote,
    agora,
  )
  if (pagina.length === 0) {
    return { expirado: false, varridas: 0, elegiveis: 0, continuou: false }
  }

  const elegiveis = await inscricoesElegiveis(
    db,
    pagina.map((item) => item.id),
    mensagem.evento,
    politica,
    agora,
  )
  const ultimo = pagina.at(-1)!
  const cursorFinal = { id: ultimo.id, criadoEm: ultimo.criadoEm.toISOString() }

  if (elegiveis.length > 0) {
    await publicador.publicarLote(
      {
        versao: 1,
        evento: mensagem.evento,
        inscricaoIds: elegiveis.map((item) => item.id),
        pagina: mensagem.pagina,
      },
      // Na faixa, a chave vem das fronteiras fixas dela, não da última linha
      // da página: uma invalidação dentro da faixa entre duas entregas mudaria
      // a última linha e, com ela, a chave (W2-2). A cadeia antiga mantém a sua.
      mensagem.faixa
        ? chaveFanout('lote', mensagem.evento.chave, 'faixa', limite.criadoEm, limite.id)
        : chaveFanout('lote', mensagem.evento.chave, cursorFinal.criadoEm, cursorFinal.id),
    )
  }

  const cursorFinalMs = Date.parse(cursorFinal.criadoEm)
  const limiteMs = Date.parse(limite.criadoEm)
  // Faixa não continua (W2-2): ela tem no máximo `tamanhoLote` inscrições, e
  // uma inscrição só entra num intervalo passado com `criadoEm` novo (a
  // reativação o renova), ou seja, depois do limite.
  const antesDoLimite =
    cursorFinalMs < limiteMs || (cursorFinalMs === limiteMs && cursorFinal.id < limite.id)
  // Se acontecer mesmo assim, o que passou do lote fica sem push: registra
  // para a operação ver, sem mudar o comportamento.
  if (mensagem.faixa && antesDoLimite && pagina.length === configuracao.tamanhoLote) {
    console.warn(
      JSON.stringify({
        evento: 'push_faixa_truncada',
        chave: mensagem.evento.chave,
        pagina: mensagem.pagina,
      }),
    )
  }
  const continuou = !mensagem.faixa && antesDoLimite
  if (continuou) {
    await publicador.publicarExpansao(
      {
        versao: 1,
        evento: mensagem.evento,
        cursor: cursorFinal,
        limiteSuperior: limite,
        pagina: mensagem.pagina + 1,
      },
      chaveFanout('continuacao', mensagem.evento.chave, cursorFinal.criadoEm, cursorFinal.id),
    )
  }

  return {
    expirado: false,
    varridas: pagina.length,
    elegiveis: elegiveis.length,
    continuou,
  }
}

export class ErroRetryPush extends Error {
  constructor(
    readonly retryAfterMs: number | null,
    readonly motivos: Record<string, number>,
  ) {
    super('envio Push deve ser repetido')
    this.name = 'ErroRetryPush'
  }
}

export class ErroVapidPush extends Error {
  constructor() {
    super('configuração VAPID recusada pelo serviço de Push')
    this.name = 'ErroVapidPush'
  }
}

/** Origem do serviço de Push; URL inválida vira a própria string (origem própria). */
function origemDoEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).origin
  } catch {
    return endpoint
  }
}

function contarPorOrigem(endpoints: string[]): Map<string, number> {
  const contagem = new Map<string, number>()
  for (const endpoint of endpoints) {
    const origem = origemDoEndpoint(endpoint)
    contagem.set(origem, (contagem.get(origem) ?? 0) + 1)
  }
  return contagem
}

async function mapearComConcorrencia<T>(
  itens: T[],
  concorrencia: number,
  tarefa: (item: T) => Promise<void>,
): Promise<void> {
  let proximo = 0
  const trabalhadores = Array.from({ length: Math.min(concorrencia, itens.length) }, async () => {
    while (proximo < itens.length) {
      const indice = proximo
      proximo += 1
      await tarefa(itens[indice]!)
    }
  })
  await Promise.all(trabalhadores)
}

export async function enviarLotePush(
  db: Db,
  porta: PortaEnvioPush,
  entrada: unknown,
  politica: PoliticaComercialPush,
  configuracao = configuracaoOperacionalPush(),
  agora = new Date(),
  publicador?: PublicadorFanoutPush,
): Promise<Record<string, number>> {
  const lote = mensagemLotePushSchema.parse(entrada)
  const contagens = {
    elegiveis: 0,
    enviados: 0,
    expirados: 0,
    invalidados: 0,
    permanentes: 0,
    recusadas: 0,
    reagendadas: 0,
    vapidGlobal: 0,
  }
  if (mensagemPushExpirada(lote.evento, agora)) {
    contagens.expirados = lote.inscricaoIds.length
    return contagens
  }

  const elegiveis = await inscricoesElegiveis(db, lote.inscricaoIds, lote.evento, politica, agora)
  contagens.elegiveis = elegiveis.length
  const invalidar: string[] = []
  const retries: { id: string; resultado: ResultadoEnvioPush }[] = []
  const recusadas: { id: string; endpoint: string }[] = []
  // 401/403 sem status é erro da própria biblioteca ao montar a VAPID (chave
  // ausente ou malformada): é local e global por definição, nunca da inscrição.
  let vapidLocal = false

  await mapearComConcorrencia(elegiveis, configuracao.paralelismo, async (linha) => {
    const inscricao: InscricaoPush = {
      endpoint: linha.endpoint,
      expirationTime: linha.expiraEm?.getTime() ?? null,
      chaves: { p256dh: linha.chaveP256dh, auth: linha.chaveAuth },
    }
    const resultado = await porta.enviar(inscricao, lote.evento)
    if (resultado.tipo === 'ENVIADO') contagens.enviados += 1
    else if (resultado.tipo === 'EXPIRADO') contagens.expirados += 1
    else if (resultado.tipo === 'INSCRICAO_INVALIDA') invalidar.push(linha.id)
    else if (resultado.tipo === 'RETRY') retries.push({ id: linha.id, resultado })
    else if (resultado.tipo === 'ERRO_VAPID') {
      recusadas.push({ id: linha.id, endpoint: linha.endpoint })
      if (resultado.statusCode === null) vapidLocal = true
    } else contagens.permanentes += 1
  })

  // 404/410 é da inscrição, qualquer que seja o estado da VAPID: invalida antes
  // de decidir se o lote volta.
  contagens.invalidados = await invalidarInscricoes(
    db,
    invalidar,
    'serviço de Push respondeu 404/410',
    agora,
  )

  // Reenvio parcial (W2-2): só os ids passados viram um lote novo, atrasado, e
  // o lote atual retorna normalmente (é confirmado na fila). Reentregar o lote
  // inteiro duplicava o push para quem já tinha recebido. Fora do teto de
  // tentativas contam como permanentes; se o atraso alcança a validade, como
  // expirados — reenviar depois dela é entregar um apito que já não vale.
  async function reagendar(
    publicadorDoLote: PublicadorFanoutPush,
    idsFalhos: string[],
    atrasoMs: number,
    prefixoChave: 'retry' | 'vapid',
  ): Promise<void> {
    const tentativa = (lote.tentativa ?? 0) + 1
    if (tentativa > TENTATIVAS_MAXIMAS_DO_LOTE) {
      contagens.permanentes += idsFalhos.length
      return
    }
    if (mensagemPushExpirada(lote.evento, new Date(agora.getTime() + atrasoMs))) {
      contagens.expirados += idsFalhos.length
      return
    }
    const ids = [...idsFalhos].sort()
    await publicadorDoLote.publicarLote(
      { versao: 1, evento: lote.evento, inscricaoIds: ids, pagina: lote.pagina, tentativa },
      chaveFanout(prefixoChave, lote.evento.chave, String(tentativa), ...ids),
      Math.max(1, Math.ceil(atrasoMs / 1000)),
    )
    contagens.reagendadas = ids.length
  }

  // 401/403 em MAIS DA METADE das elegíveis de um SERVIÇO DE PUSH é a
  // credencial VAPID (global para aquele provedor): ninguém dele é invalidado.
  // Isolado, é a inscrição que o serviço recusa — invalida só ela (W2-2).
  // Antes, um único 403 derrubava o lote inteiro por 5 min, a validade
  // inteira de um apito.
  //
  // A maioria é contada POR ORIGEM do endpoint, não pelo lote: um lote mistura
  // FCM, Mozilla e Apple, e a credencial pode ser recusada só por um deles
  // (ex.: Apple 403 BadJwtToken por um VAPID_SUBJECT que ela não aceita).
  // Contada no lote, a Apple é minoria e seus assinantes seriam INVALIDADOS em
  // todo evento — o cliente só reenvia a inscrição depois de 24 h, e a base
  // iOS ficaria sem push e sem alarme. `vapidLocal` (statusCode null) é da
  // própria biblioteca, então vale para o lote todo.
  contagens.recusadas = recusadas.length
  const elegiveisPorOrigem = contarPorOrigem(elegiveis.map((linha) => linha.endpoint))
  const recusadasPorOrigem = contarPorOrigem(recusadas.map((item) => item.endpoint))
  const origemGlobal = (endpoint: string) => {
    const origem = origemDoEndpoint(endpoint)
    const doServico = elegiveisPorOrigem.get(origem) ?? 0
    return (recusadasPorOrigem.get(origem) ?? 0) * 2 > doServico && doServico > 1
  }
  const recusadasGlobais = vapidLocal
    ? recusadas
    : recusadas.filter((item) => origemGlobal(item.endpoint))
  const recusadasIsoladas = vapidLocal
    ? []
    : recusadas.filter((item) => !origemGlobal(item.endpoint))

  if (recusadasIsoladas.length > 0) {
    contagens.invalidados += await invalidarInscricoes(
      db,
      recusadasIsoladas.map((item) => item.id),
      'serviço de Push respondeu 401/403',
      agora,
    )
  }
  if (recusadasGlobais.length > 0) {
    // Sem publicador, o comportamento antigo: o lote inteiro volta pela fila.
    if (!publicador) throw new ErroVapidPush()
    // Com publicador, lançar reentregaria o lote inteiro a cada 60 s e a minoria
    // que JÁ recebeu (ex.: rotação de chave pela metade) levaria uma cópia por
    // reentrega até a validade — centenas numa Lista Secreta de 6 h. Então só
    // as recusadas e as que pediram retry voltam, e o lote é confirmado.
    contagens.vapidGlobal = 1
    await reagendar(
      publicador,
      [...recusadasGlobais.map((item) => item.id), ...retries.map((item) => item.id)],
      ATRASO_VAPID_GLOBAL_SEGUNDOS * 1000,
      'vapid',
    )
    return contagens
  }

  if (retries.length > 0) {
    const atrasos = retries
      .map(({ resultado }) => (resultado.tipo === 'RETRY' ? resultado.retryAfterMs : null))
      .filter((valor): valor is number => valor !== null)
    const motivos = retries.reduce<Record<string, number>>((acumulado, { resultado }) => {
      if (resultado.tipo === 'RETRY')
        acumulado[resultado.motivo] = (acumulado[resultado.motivo] ?? 0) + 1
      return acumulado
    }, {})
    // Sem publicador, o comportamento antigo: o lote inteiro volta pela fila.
    if (!publicador)
      throw new ErroRetryPush(atrasos.length > 0 ? Math.max(...atrasos) : null, motivos)

    const tentativa = (lote.tentativa ?? 0) + 1
    const atrasoMs =
      atrasos.length > 0
        ? Math.max(...atrasos)
        : configuracao.retryBaseSegundos * 1000 * 2 ** Math.min(tentativa - 1, 5)
    await reagendar(
      publicador,
      retries.map((item) => item.id),
      atrasoMs,
      'retry',
    )
  }

  return contagens
}
