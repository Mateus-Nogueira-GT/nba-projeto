import { createHash } from 'node:crypto'
import { send } from '@vercel/queue'
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
  })
  .strict()

export const mensagemLotePushSchema = z
  .object({
    versao: z.literal(1),
    evento: mensagemPushV1Schema,
    inscricaoIds: z.array(z.string().uuid()).min(1).max(500),
    pagina: z.number().int().nonnegative(),
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
  publicarLote(mensagem: MensagemLotePush, idempotencyKey: string): Promise<void>
}

export class PublicadorFanoutVercel implements PublicadorFanoutPush {
  async publicarExpansao(mensagem: MensagemExpansaoPush, idempotencyKey: string): Promise<void> {
    await send(TOPICO_PUSH_EVENTOS, mensagem, { idempotencyKey })
  }

  async publicarLote(mensagem: MensagemLotePush, idempotencyKey: string): Promise<void> {
    await send(TOPICO_PUSH_ENTREGAS, mensagem, { idempotencyKey })
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
      chaveFanout('lote', mensagem.evento.chave, cursorFinal.criadoEm, cursorFinal.id),
    )
  }

  const cursorFinalMs = Date.parse(cursorFinal.criadoEm)
  const limiteMs = Date.parse(limite.criadoEm)
  const continuou =
    cursorFinalMs < limiteMs || (cursorFinalMs === limiteMs && cursorFinal.id < limite.id)
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
): Promise<Record<string, number>> {
  const lote = mensagemLotePushSchema.parse(entrada)
  const contagens = {
    elegiveis: 0,
    enviados: 0,
    expirados: 0,
    invalidados: 0,
    permanentes: 0,
  }
  if (mensagemPushExpirada(lote.evento, agora)) {
    contagens.expirados = lote.inscricaoIds.length
    return contagens
  }

  const elegiveis = await inscricoesElegiveis(db, lote.inscricaoIds, lote.evento, politica, agora)
  contagens.elegiveis = elegiveis.length
  const invalidar: string[] = []
  const retries: ResultadoEnvioPush[] = []
  let erroVapid = false

  await mapearComConcorrencia(elegiveis, configuracao.paralelismo, async (linha) => {
    // 401/403 indica problema global das credenciais VAPID. Depois do primeiro
    // diagnóstico, não iniciamos novos envios do mesmo lote.
    if (erroVapid) return
    const inscricao: InscricaoPush = {
      endpoint: linha.endpoint,
      expirationTime: linha.expiraEm?.getTime() ?? null,
      chaves: { p256dh: linha.chaveP256dh, auth: linha.chaveAuth },
    }
    const resultado = await porta.enviar(inscricao, lote.evento)
    if (resultado.tipo === 'ENVIADO') contagens.enviados += 1
    else if (resultado.tipo === 'EXPIRADO') contagens.expirados += 1
    else if (resultado.tipo === 'INSCRICAO_INVALIDA') invalidar.push(linha.id)
    else if (resultado.tipo === 'RETRY') retries.push(resultado)
    else if (resultado.tipo === 'ERRO_VAPID') erroVapid = true
    else contagens.permanentes += 1
  })

  contagens.invalidados = await invalidarInscricoes(
    db,
    invalidar,
    'serviço de Push respondeu 404/410',
    agora,
  )
  if (erroVapid) throw new ErroVapidPush()
  if (retries.length > 0) {
    const atrasos = retries
      .map((item) => (item.tipo === 'RETRY' ? item.retryAfterMs : null))
      .filter((valor): valor is number => valor !== null)
    const motivos = retries.reduce<Record<string, number>>((acumulado, item) => {
      if (item.tipo === 'RETRY') acumulado[item.motivo] = (acumulado[item.motivo] ?? 0) + 1
      return acumulado
    }, {})
    throw new ErroRetryPush(atrasos.length > 0 ? Math.max(...atrasos) : null, motivos)
  }

  return contagens
}
