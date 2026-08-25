import { getDb } from '@/modules/dominio/db/cliente'
import { PagamentoMercadoPago, configDoAmbiente } from '@/modules/plataforma/assinatura/mercadopago'
import { processarNotificacao } from '@/modules/plataforma/assinatura/webhook'

export const dynamic = 'force-dynamic'
const MAX_CORPO_BYTES = 64 * 1024

/**
 * Webhook do Mercado Pago.
 *
 * A conta é do CLIENTE: as credenciais vêm de `vercel env`, e sem elas o
 * endpoint responde 503 em vez de fingir que funcionou.
 *
 * Responde 200 mesmo em duplicata — do contrário o Mercado Pago segue
 * reenviando o mesmo evento indefinidamente.
 */
export async function POST(requisicao: Request): Promise<Response> {
  const config = configDoAmbiente()
  if (!config) {
    return Response.json(
      { erro: 'integração de pagamento não configurada' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const tamanhoDeclarado = Number(requisicao.headers.get('content-length') ?? '0')
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > MAX_CORPO_BYTES) {
    return Response.json(
      { erro: 'payload muito grande' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const corpoBruto = await requisicao.text()
  if (Buffer.byteLength(corpoBruto, 'utf8') > MAX_CORPO_BYTES) {
    return Response.json(
      { erro: 'payload muito grande' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const cabecalhos = Object.fromEntries(
    [...requisicao.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]),
  )
  const parametros = Object.fromEntries(new URL(requisicao.url).searchParams.entries())

  const resultado = await processarNotificacao(getDb(), new PagamentoMercadoPago(config), {
    corpoBruto,
    cabecalhos,
    parametros,
    agora: new Date(),
  })

  if (!resultado.aceito) {
    const status = resultado.motivo === 'assinatura-invalida' ? 401 : 400
    return Response.json(
      { erro: resultado.motivo },
      { status, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return Response.json(resultado, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
