'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import { getDb } from '@/modules/dominio/db/cliente'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import {
  CheckoutIndisponivelError,
  iniciarCheckout,
  LimiteOperacaoError,
} from '@/modules/plataforma/assinatura/checkout'
import {
  configuracaoProdutoPago,
  origemPermitida,
} from '@/modules/plataforma/assinatura/configuracao'
import { PagamentoMercadoPago, configDoAmbiente } from '@/modules/plataforma/assinatura/mercadopago'
import { precosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { ehSku } from '@/modules/plataforma/assinatura/sku'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { ipDaRequisicao } from '@/modules/plataforma/auth/requisicao'

export async function contratar(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/assinar')

  let destino: string
  try {
    const pedido = formulario.get('sku')
    // O SKU vem de fora. Um valor fora da lista não pode virar chave de
    // índice em `precos.porSku` — seria `undefined.centavos` na hora de
    // cobrar.
    if (typeof pedido !== 'string' || !ehSku(pedido)) throw new CheckoutIndisponivelError()

    const produto = configuracaoProdutoPago()
    if (!origemPermitida((await headers()).get('origin'), produto)) {
      throw new CheckoutIndisponivelError('origem inválida')
    }
    const { fuso } = (await rulesetAtivo()).rodada
    const precos = precosDosPlanos(fuso)
    if (!precos) throw new CheckoutIndisponivelError('preços não configurados')

    const mercadoPago = configDoAmbiente()
    if (!mercadoPago) throw new CheckoutIndisponivelError()
    const resultado = await iniciarCheckout(
      getDb(),
      new PagamentoMercadoPago(mercadoPago),
      produto,
      precos,
      { usuarioId: sessao.usuarioId, sku: pedido, ip: await ipDaRequisicao(), agora: new Date() },
    )
    destino =
      resultado.status === 'PRONTO' ? resultado.url : '/retorno/mercadopago?estado=processando'
  } catch (erro) {
    destino =
      erro instanceof LimiteOperacaoError ? '/assinar?erro=limite' : '/assinar?erro=indisponivel'
  }
  redirect(destino)
}
