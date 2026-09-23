import { redirect } from 'next/navigation'

import { getDb } from '../../dominio/db/cliente'
import { sessaoAtual, tokenDaSessaoAtual } from '../auth/cookies'
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
  // O ACEITE DA METODOLOGIA vem ANTES do nível: é o que faz a conta nova ler o
  // método antes de ver preço (decisão do parceiro, 20/09).
  //
  // Mora aqui, e não numa chamada própria em cada tela, porque este é o ponto
  // por onde as doze telas já passam — repetir a checagem em cada uma seria
  // esquecê-la na décima terceira. O custo é misturar dois assuntos no mesmo
  // guarda: nível de assinatura e consentimento. O teste de fonte
  // "toda tela de (app) passa pelo portão" é o que mantém a conta fechada.
  //
  // O dado vem no `acesso` que já foi lido, e NÃO de uma consulta própria:
  // `avaliarAcesso` faz uma consulta só de propósito (ADR-0008), e uma
  // terceira ida ao banco por navegação para ler uma coluna desfaria isso.
  if (acesso.metodologiaAceitaEm === null) {
    redirect(`/metodologia?destino=${encodeURIComponent(destino)}`)
  }

  if (!atende(acesso.nivel, minimo)) {
    redirect(`/assinar?nivel=${minimo}&voltar=${encodeURIComponent(destino)}`)
  }
  return { sessao, acesso }
}

/**
 * PORTÃO BARATO, ANTES DO BANCO.
 *
 * As telas de estatística resolvem a tela (≈10 consultas) antes de pedir
 * login, para um id inexistente responder 404. Sem cookie nenhum, esse
 * trabalho era desperdício — e um robô ou link compartilhado virava carga
 * de graça no banco (auditoria 23/09). Aqui só o cookie é lido; quem tem
 * cookie segue o caminho de sempre, e `exigirNivel` valida de verdade.
 *
 * Consequência aceita: sem cookie, um id válido que não existe manda para
 * /entrar em vez de 404.
 */
export async function exigirCookieDeSessao(destino: string): Promise<void> {
  if (!(await tokenDaSessaoAtual())) redirect(`/entrar?destino=${encodeURIComponent(destino)}`)
}
