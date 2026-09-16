import { z } from 'zod'

import type { Modalidade, NivelPago } from './nivel-do-plano'

export const PRODUTO_PAGO = 'NBA_PRO'

/**
 * O QUE O CHECKOUT DE UM SKU SÓ GRAVA — provisório, até o Plano B.
 *
 * Hoje existe um plano, com nome e valor em `MERCADOPAGO_PLANO_*`. Ele
 * continua funcionando atrás da flag enquanto os níveis chegam às telas; e
 * como a coluna do nível é NOT NULL, ele precisa gravar ALGUM. É o plano pago
 * de entrada. Quando o Plano B trouxer os quatro SKUs, estas duas constantes
 * somem junto com o checkout de um SKU só.
 */
export const NIVEL_DO_CHECKOUT_LEGADO: NivelPago = 'MVP'
export const MODALIDADE_DO_CHECKOUT_LEGADO: Modalidade = 'MENSAL'

export type ConfiguracaoProdutoPago = {
  checkoutHabilitado: boolean
  cadastroPublicoHabilitado: boolean
  nomePlano: string
  valorCentavos: number
  frequencia: 1
  tipoFrequencia: 'months'
  moeda: 'BRL'
  urlPublica: string
  hostsPermitidos: ReadonlySet<string>
}

const urlPublicaSchema = z.url().transform((valor, contexto) => {
  const url = new URL(valor)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && local)) {
    contexto.addIssue({ code: 'custom', message: 'APP_PUBLIC_URL deve usar HTTPS' })
    return z.NEVER
  }
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
})

function booleanoExplicito(nome: string, valor: string | undefined, padrao: boolean): boolean {
  if (valor === undefined || valor === '') return padrao
  if (valor === 'true') return true
  if (valor === 'false') return false
  throw new Error(`${nome} deve ser true ou false`)
}

export function configuracaoProdutoPago(
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): ConfiguracaoProdutoPago {
  const checkoutHabilitado = booleanoExplicito(
    'MERCADOPAGO_CHECKOUT_ENABLED',
    ambiente.MERCADOPAGO_CHECKOUT_ENABLED,
    false,
  )
  // Plano grátis é conta (spec de planos, §7). A flag continua existindo
  // para fechar a porta numa emergência.
  const cadastroPublicoHabilitado = booleanoExplicito(
    'CADASTRO_PUBLICO_HABILITADO',
    ambiente.CADASTRO_PUBLICO_HABILITADO,
    true,
  )
  const nomePlano = (ambiente.MERCADOPAGO_PLANO_NOME ?? '').trim()
  const valorCentavos = Number(ambiente.MERCADOPAGO_PLANO_VALOR_CENTAVOS)
  const urlPublicaBruta = (ambiente.APP_PUBLIC_URL ?? '').trim()
  const hosts = (ambiente.APP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)

  // A integração V1 implementa deliberadamente uma assinatura mensal sem
  // plano associado e sem trial. Outros modelos exigem nova decisão de produto.
  if (
    ambiente.MERCADOPAGO_PREAPPROVAL_TYPE !== undefined &&
    ambiente.MERCADOPAGO_PREAPPROVAL_TYPE !== 'pending'
  ) {
    throw new Error('MERCADOPAGO_PREAPPROVAL_TYPE deve ser pending')
  }

  const faltantes: string[] = []
  if (!nomePlano) faltantes.push('MERCADOPAGO_PLANO_NOME')
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos < 100 || valorCentavos > 10_000_000) {
    faltantes.push('MERCADOPAGO_PLANO_VALOR_CENTAVOS')
  }
  if (!urlPublicaBruta) faltantes.push('APP_PUBLIC_URL')

  if (checkoutHabilitado && faltantes.length > 0) {
    throw new Error(`checkout habilitado com configuração incompleta: ${faltantes.join(', ')}`)
  }
  if (cadastroPublicoHabilitado && !urlPublicaBruta) {
    throw new Error('cadastro habilitado sem APP_PUBLIC_URL')
  }

  const urlPublica = urlPublicaBruta ? urlPublicaSchema.parse(urlPublicaBruta) : ''
  if (urlPublica) hosts.push(new URL(urlPublica).hostname.toLowerCase())

  return {
    checkoutHabilitado,
    cadastroPublicoHabilitado,
    nomePlano: nomePlano || 'Plano não configurado',
    valorCentavos: Number.isSafeInteger(valorCentavos) ? valorCentavos : 0,
    frequencia: 1,
    tipoFrequencia: 'months',
    moeda: 'BRL',
    urlPublica,
    hostsPermitidos: new Set(hosts),
  }
}

export function urlDeRetorno(config: ConfiguracaoProdutoPago): string {
  if (!config.urlPublica) throw new Error('APP_PUBLIC_URL ausente')
  return `${config.urlPublica}/retorno/mercadopago`
}

export function origemPermitida(
  origem: string | null,
  config: ConfiguracaoProdutoPago,
): boolean {
  if (!origem) return false
  try {
    const url = new URL(origem)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const protocoloSeguro =
      url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && local)
    return protocoloSeguro && config.hostsPermitidos.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}
