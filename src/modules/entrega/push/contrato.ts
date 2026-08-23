import { z } from 'zod'

const ATRIBUTOS = ['PONTOS', 'REBOTES', 'ASSISTENCIAS'] as const
const NIVEIS = ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA'] as const

// `/fire-live` entrou com a Spec 05: rota publicada e protegida pela mesma
// guarda de sessão e direito da home.
export const URLS_PUSH_PERMITIDAS = ['/', '/fire-live'] as const

const comumSchema = z
  .object({
    versao: z.literal(1),
    chave: z.string().trim().min(1).max(200),
    titulo: z.string().trim().min(1).max(120),
    corpo: z.string().trim().min(1).max(500),
    url: z.enum(URLS_PUSH_PERMITIDAS),
    ocorridoEm: z.string().datetime({ offset: true }),
    expiraEm: z.string().datetime({ offset: true }),
  })
  .strict()

export const dadosApitoSchema = z
  .object({
    jogoId: z.string().uuid(),
    jogadorId: z.string().uuid(),
    atributo: z.enum(ATRIBUTOS),
    nivelJogador: z.enum(NIVEIS),
    alvo1Q: z.number().finite().nonnegative(),
    modoFire: z.boolean(),
    opdOrigemNivel: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  })
  .strict()

export const dadosGreenSchema = z
  .object({
    jogoId: z.string().uuid(),
    jogadorId: z.string().uuid(),
    atributo: z.literal('PONTOS'),
    nivelJogador: z.enum(NIVEIS),
    marco: z.number().finite().nonnegative(),
    valor: z.number().finite().nonnegative(),
  })
  .strict()

/**
 * A Spec 02 não define campos adicionais para Lista Secreta. Mantemos o
 * objeto deliberadamente vazio em V1; adicionar campos exige contrato, não
 * um Record arbitrário atravessando o worker.
 */
export const dadosListaSchema = z.object({}).strict()

const mensagemPushBaseSchema = z.discriminatedUnion('canal', [
  comumSchema.extend({
    canal: z.literal('FIRE_LIVE_APITO'),
    dados: dadosApitoSchema,
  }),
  comumSchema.extend({
    canal: z.literal('GREEN'),
    dados: dadosGreenSchema,
  }),
  comumSchema.extend({
    canal: z.literal('LISTA_SECRETA'),
    dados: dadosListaSchema,
  }),
])

export const mensagemPushV1Schema = mensagemPushBaseSchema.superRefine((mensagem, contexto) => {
  if (Date.parse(mensagem.expiraEm) <= Date.parse(mensagem.ocorridoEm)) {
    contexto.addIssue({
      code: 'custom',
      path: ['expiraEm'],
      message: 'expiraEm deve ser posterior a ocorridoEm',
    })
  }
})

export type DadosApito = z.infer<typeof dadosApitoSchema>
export type DadosGreen = z.infer<typeof dadosGreenSchema>
export type DadosLista = z.infer<typeof dadosListaSchema>
export type MensagemPushV1 = z.infer<typeof mensagemPushV1Schema>

export function validarMensagemPushV1(valor: unknown): MensagemPushV1 {
  return mensagemPushV1Schema.parse(valor)
}

export function mensagemPushExpirada(
  mensagem: Pick<MensagemPushV1, 'expiraEm'>,
  agora = new Date(),
): boolean {
  return Date.parse(mensagem.expiraEm) <= agora.getTime()
}
