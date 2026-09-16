import { redirect } from 'next/navigation'

import { getDb } from '../../dominio/db/cliente'
import { sessaoAtual } from '../auth/cookies'
import { type AcessoComNivel, avaliarAcesso } from './direito'
import { atende, type NivelDoPlano } from './nivel-do-plano'

export type Sessao = NonNullable<Awaited<ReturnType<typeof sessaoAtual>>>

/**
 * A GUARDA DE NÍVEL — a única, para toda tela.
 *
 * Três saídas, três destinos: sem sessão vai entrar; bloqueado vai para a
 * CONTA, que mostra o status — antes ele caía em /assinar junto com quem não
 * tinha direito, e oferecer plano a quem não pode comprar era erro dos dois
 * lados; nível insuficiente vai para /assinar sabendo QUAL nível e de ONDE
 * veio, para a página destacar o plano certo e o botão voltar funcionar.
 *
 * O `destino` mandado para /entrar só é honrado se estiver na allowlist de
 * `destinoInternoSeguro` — hoje `/`, `/assinar`, `/conta` e `/admin/usuarios`.
 * Fora dela (fire-live, gestão, apito, resultados) o login termina na raiz, e
 * não de volta na tela pedida. É assim desde antes desta guarda; ampliar a
 * allowlist é decisão de outra spec, não daqui.
 *
 * `minimo: 'GRATIS'` é "só precisa estar logado": a tela renderiza para
 * qualquer nível e decide sozinha o que mostrar.
 */
export async function exigirNivel(
  minimo: NivelDoPlano,
  destino: string,
): Promise<{ sessao: Sessao; acesso: AcessoComNivel }> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect(`/entrar?destino=${encodeURIComponent(destino)}`)
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (acesso.nivel === null) {
    if (acesso.motivo === 'bloqueio-administrativo') redirect('/conta')
    redirect(`/entrar?destino=${encodeURIComponent(destino)}`)
  }
  if (!atende(acesso.nivel, minimo)) {
    redirect(`/assinar?nivel=${minimo}&voltar=${encodeURIComponent(destino)}`)
  }
  return { sessao, acesso }
}
