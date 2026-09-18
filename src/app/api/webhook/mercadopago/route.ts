import { getDb } from '@/modules/dominio/db/cliente'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { PagamentoMercadoPago, configDoAmbiente } from '@/modules/plataforma/assinatura/mercadopago'
import { precosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { cancelarContratosSubstituidos } from '@/modules/plataforma/assinatura/substituicao'
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

  // O fuso da rodada mora no ruleset (camada de entrega); `plataforma/` não a
  // importa, então quem já lê o ruleset é que traz o fuso para cá.
  const { fuso } = (await rulesetAtivo()).rodada
  const precos = precosDosPlanos(fuso)

  const resultado = await processarNotificacao(getDb(), new PagamentoMercadoPago(config), {
    corpoBruto,
    cabecalhos,
    parametros,
    agora: new Date(),
    fimDaTemporada: precos?.fimDaTemporada ?? null,
  })

  if (!resultado.aceito) {
    const status = resultado.motivo === 'assinatura-invalida' ? 401 : 400
    return Response.json(
      { erro: resultado.motivo },
      { status, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (!resultado.duplicado && resultado.liberou) {
    // Fora da transação, e nunca derrubando o webhook: se falhar, a marca
    // continua no banco e o cron de reconciliação tenta de novo. Devolver
    // erro aqui faria o Mercado Pago reenviar um evento JÁ APLICADO, sem
    // adiantar nada.
    //
    // Só o usuário DESTE evento: a varredura larga é do cron, que tem
    // `maxDuration`. Aqui cada cancelamento é um PUT ao provedor com 8s de
    // timeout, e um lote de 20 seguraria a resposta que o Mercado Pago está
    // esperando — o bastante para ele desistir e reenviar o mesmo evento.
    try {
      await cancelarContratosSubstituidos(getDb(), new PagamentoMercadoPago(config), new Date(), {
        usuarioId: resultado.usuarioId,
      })
    } catch (erro) {
      console.warn(
        JSON.stringify({
          evento: 'cancelamento_substituido_falhou',
          erro: erro instanceof Error ? erro.name : 'ErroDesconhecido',
        }),
      )
    }
  }

  return Response.json(resultado, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
