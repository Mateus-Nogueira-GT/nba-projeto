'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import { getDb } from '@/modules/dominio/db/cliente'
import {
  cancelarAssinaturaDoUsuario,
  LimiteOperacaoError,
  SessaoRecenteObrigatoriaError,
} from '@/modules/plataforma/assinatura/checkout'
import { PagamentoMercadoPago, configDoAmbiente } from '@/modules/plataforma/assinatura/mercadopago'
import {
  configuracaoProdutoPago,
  origemPermitida,
} from '@/modules/plataforma/assinatura/configuracao'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { ipDaRequisicao } from '@/modules/plataforma/auth/requisicao'

export async function cancelarAssinatura(): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')

  let destino = '/conta?cancelamento=confirmado'
  try {
    if (!origemPermitida((await headers()).get('origin'), configuracaoProdutoPago())) {
      throw new Error('OrigemInvalida')
    }
    const config = configDoAmbiente()
    if (!config) throw new Error('MercadoPagoNaoConfigurado')
    await cancelarAssinaturaDoUsuario(getDb(), new PagamentoMercadoPago(config), sessao, {
      ip: await ipDaRequisicao(),
      agora: new Date(),
    })
  } catch (erro) {
    destino =
      erro instanceof SessaoRecenteObrigatoriaError
        ? '/conta?cancelamento=reauth'
        : erro instanceof LimiteOperacaoError
          ? '/conta?cancelamento=limite'
          : '/conta?cancelamento=erro'
  }
  redirect(destino)
}
