import { redirect } from 'next/navigation'

import { getDb } from '../../dominio/db/cliente'
import { sessaoAtual } from '../auth/cookies'
import { configuracaoProdutoPago } from './configuracao'
import { avaliarAcesso } from './direito'

export async function exigirAcessoEstatisticasSeConfigurado(): Promise<void> {
  if (!configuracaoProdutoPago().estatisticasExigemDireito) return
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/')
  if (!(await avaliarAcesso(getDb(), sessao.usuarioId)).permitido) redirect('/assinar')
}
