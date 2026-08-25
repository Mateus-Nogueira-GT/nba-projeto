'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import { getDb } from '@/modules/dominio/db/cliente'
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
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { ipDaRequisicao } from '@/modules/plataforma/auth/requisicao'

export async function contratar(): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/assinar')

  let destino: string
  try {
    const produto = configuracaoProdutoPago()
    if (!origemPermitida((await headers()).get('origin'), produto)) {
      throw new CheckoutIndisponivelError('origem inválida')
    }
    const mercadoPago = configDoAmbiente()
    if (!mercadoPago) throw new CheckoutIndisponivelError()
    const resultado = await iniciarCheckout(
      getDb(),
      new PagamentoMercadoPago(mercadoPago),
      produto,
      { usuarioId: sessao.usuarioId, ip: await ipDaRequisicao(), agora: new Date() },
    )
    destino =
      resultado.status === 'PRONTO'
        ? resultado.url
        : '/retorno/mercadopago?estado=processando'
  } catch (erro) {
    destino =
      erro instanceof LimiteOperacaoError
        ? '/assinar?erro=limite'
        : '/assinar?erro=indisponivel'
  }
  redirect(destino)
}
