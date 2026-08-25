import { z } from 'zod'

import type { Db } from '../../dominio/db/tipos'
import { registrarBatimento } from '../health/heartbeat'
import { FonteApiSports } from '../nba/adaptadores/api-sports'
import { FonteBalldontlie } from '../nba/adaptadores/balldontlie'
import { FonteComFailover } from '../nba/failover'
import type { FonteNBA } from '../nba/porta'

const schemaAmbiente = z
  .object({
    NBA_PRIMARIO_NOME: z.literal('balldontlie').default('balldontlie'),
    BALLDONTLIE_BASE_URL: z
      .string()
      .url()
      .default('https://api.balldontlie.io/nba/v1'),
    BALLDONTLIE_API_KEY: z.string().trim().min(1),
    NBA_RESERVA_NOME: z.literal('api-sports-nba').default('api-sports-nba'),
    API_SPORTS_NBA_BASE_URL: z
      .string()
      .url()
      .default('https://v2.nba.api-sports.io'),
    API_SPORTS_NBA_KEY: z.string().trim().min(1).optional(),
    NBA_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
    NBA_RESERVA_OBRIGATORIA: z.enum(['true', 'false']).default('true'),
    NBA_INGESTAO_HABILITADA: z.enum(['true', 'false']).default('false'),
    NBA_RODADA_SOBREPOSICAO_DIAS: z.coerce.number().int().min(0).max(7).default(2),
  })
  .superRefine((valor, contexto) => {
    if (valor.NBA_RESERVA_OBRIGATORIA === 'true' && !valor.API_SPORTS_NBA_KEY) {
      contexto.addIssue({
        code: 'custom',
        path: ['API_SPORTS_NBA_KEY'],
        message: 'a reserva API-SPORTS é obrigatória',
      })
    }
  })

export type ConfigFontes = {
  habilitada: boolean
  timeoutMs: number
  sobreposicaoDias: number
  primario: { nome: 'balldontlie'; baseUrl: string; chave: string }
  reserva: { nome: 'api-sports-nba'; baseUrl: string; chave: string } | null
}

/** Valida toda configuração antes de qualquer acesso ao banco. */
export function configDoAmbiente(
  ambiente: Record<string, string | undefined> = process.env,
): ConfigFontes | null {
  if (!ambiente.BALLDONTLIE_API_KEY && !ambiente.API_SPORTS_NBA_KEY) return null

  const resultado = schemaAmbiente.safeParse(ambiente)
  if (!resultado.success) {
    const campos = resultado.error.issues.map((i) => i.path.join('.') || 'ambiente').join(', ')
    throw new Error(`configuração NBA inválida: ${campos}`)
  }
  const valor = resultado.data
  return {
    habilitada: valor.NBA_INGESTAO_HABILITADA === 'true',
    timeoutMs: valor.NBA_TIMEOUT_MS,
    sobreposicaoDias: valor.NBA_RODADA_SOBREPOSICAO_DIAS,
    primario: {
      nome: valor.NBA_PRIMARIO_NOME,
      baseUrl: valor.BALLDONTLIE_BASE_URL,
      chave: valor.BALLDONTLIE_API_KEY,
    },
    reserva: valor.API_SPORTS_NBA_KEY
      ? {
          nome: valor.NBA_RESERVA_NOME,
          baseUrl: valor.API_SPORTS_NBA_BASE_URL,
          chave: valor.API_SPORTS_NBA_KEY,
        }
      : null,
  }
}

export type FontesConfiguradas = {
  primaria: FonteBalldontlie
  reserva: FonteApiSports | null
  failover: FonteNBA
}

export function montarFontes(db: Db, config: ConfigFontes): FontesConfiguradas {
  const primaria = new FonteBalldontlie({
    chave: config.primario.chave,
    baseUrl: config.primario.baseUrl,
    timeoutMs: config.timeoutMs,
  })
  const reserva = config.reserva
    ? new FonteApiSports({
        nome: config.reserva.nome,
        chave: config.reserva.chave,
        baseUrl: config.reserva.baseUrl,
        timeoutMs: config.timeoutMs,
      })
    : null

  if (!reserva) return { primaria, reserva, failover: primaria }

  const failover = new FonteComFailover(primaria, reserva, {
    timeoutMs: config.timeoutMs,
    aoBater: async (evento) => {
      await registrarBatimento(db, evento).catch(() => undefined)
    },
  })
  return { primaria, reserva, failover }
}

/** Compatibilidade dos chamadores legados; jobs novos usam a matriz acima. */
export function montarFonte(db: Db, config: ConfigFontes): FonteNBA {
  return montarFontes(db, config).failover
}
