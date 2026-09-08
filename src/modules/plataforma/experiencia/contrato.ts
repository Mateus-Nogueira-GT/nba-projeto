import { z } from 'zod'
import type { CanalPush, PreferenciasPush } from '../push/inscricoes'

export const INTENSIDADES = ['REDUZIDAS', 'PADRAO', 'INTENSAS'] as const
export const ATRIBUTOS_ALERTA = ['PONTOS', 'REBOTES', 'ASSISTENCIAS'] as const
export type Intensidade = (typeof INTENSIDADES)[number]
export type AtributoAlerta = (typeof ATRIBUTOS_ALERTA)[number]

export type PreferenciasExperiencia = {
  intensidade: Intensidade
  somHabilitado: boolean
  volume: number
  apenasAcompanhados: boolean
}

export type EstadoExperiencia = {
  preferencias: PreferenciasExperiencia
  jogadoresAcompanhados: string[]
  timesAcompanhados: string[]
  jogadoresSilenciados: string[]
  atributosSilenciados: AtributoAlerta[]
  canais: PreferenciasPush
}

export const PREFERENCIAS_EXPERIENCIA_PADRAO: Readonly<PreferenciasExperiencia> = {
  intensidade: 'PADRAO',
  somHabilitado: true,
  volume: 50,
  apenasAcompanhados: false,
}

export function estadoExperienciaPadrao(): EstadoExperiencia {
  return {
    preferencias: { ...PREFERENCIAS_EXPERIENCIA_PADRAO },
    jogadoresAcompanhados: [],
    timesAcompanhados: [],
    jogadoresSilenciados: [],
    atributosSilenciados: [],
    canais: { FIRE_LIVE_APITO: true, GREEN: true, LISTA_SECRETA: true },
  }
}

export const schemaPreferenciasExperiencia = z
  .object({
    intensidade: z.enum(INTENSIDADES).optional(),
    somHabilitado: z.boolean().optional(),
    volume: z.number().finite().int().min(0).max(100).optional(),
    apenasAcompanhados: z.boolean().optional(),
  })
  .strict()
  .refine((valor) => Object.keys(valor).length > 0, 'informe uma preferência')

export const schemaAcompanhamento = z
  .object({
    tipo: z.enum(['JOGADOR', 'TIME']),
    id: z.string().uuid(),
    acompanhar: z.boolean(),
  })
  .strict()

export const schemaExclusaoAlerta = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('JOGADOR'), id: z.string().uuid(), silenciado: z.boolean() }).strict(),
  z
    .object({ tipo: z.literal('ATRIBUTO'), id: z.enum(ATRIBUTOS_ALERTA), silenciado: z.boolean() })
    .strict(),
])

export type AlvoAlerta = {
  canal: CanalPush
  jogadorId?: string
  atributo?: AtributoAlerta
}

/** Filtra alertas identificáveis, nunca a visibilidade dos cartões. */
export function alertaPermitido(estado: EstadoExperiencia, alvo: AlvoAlerta): boolean {
  if (!estado.canais[alvo.canal]) return false
  // O aviso geral não carrega jogador/atributo no contrato Push V1.
  if (alvo.canal === 'LISTA_SECRETA') return true
  if (alvo.jogadorId && estado.jogadoresSilenciados.includes(alvo.jogadorId)) return false
  if (alvo.atributo && estado.atributosSilenciados.includes(alvo.atributo)) return false
  return (
    !estado.preferencias.apenasAcompanhados ||
    (!!alvo.jogadorId && estado.jogadoresAcompanhados.includes(alvo.jogadorId))
  )
}

/** O chamador ainda deve verificar gesto, visibilidade e deduplicação do evento. */
export function somLocalPermitido(estado: EstadoExperiencia, alvo: AlvoAlerta): boolean {
  return (
    estado.preferencias.somHabilitado &&
    estado.preferencias.volume > 0 &&
    alertaPermitido(estado, alvo)
  )
}

export function intensidadeEfetiva(
  preferencia: Intensidade,
  sistemaReduzMovimento: boolean,
): Intensidade {
  return sistemaReduzMovimento ? 'REDUZIDAS' : preferencia
}
