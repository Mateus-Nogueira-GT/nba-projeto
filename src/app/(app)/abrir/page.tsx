import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { estadoDoCiclo, jogosDoDiaResumo } from '@/modules/entrega/lista-por-jogo'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

export const dynamic = 'force-dynamic'

/**
 * ONDE O APP ABRE.
 *
 * Ao Vivo quando há jogo no 1º quarto — a janela em que o Fire Live existe e a
 * única em que o produto tem urgência —, a Lista no resto do dia. Sem esta
 * decisão, ou a pessoa precisa de um toque para achar o jogo que está rolando,
 * ou abre no vazio na maior parte do dia.
 *
 * ROTA SEPARADA, e não a decisão dentro de `/`: se `/` redirecionasse, clicar
 * em ENTRADAS durante um jogo jogaria a pessoa de volta no Ao Vivo, e a Lista
 * ficaria inalcançável enquanto houvesse bola rolando. A decisão precisa de um
 * endereço que só é visitado na ABERTURA — por isso o `start_url` do PWA e o
 * destino padrão do login apontam para cá, e nada mais.
 *
 * Não checa sessão: ela redireciona para telas que já têm portão, e duplicar a
 * checagem só criaria um segundo lugar para errar.
 */
export default async function PaginaAbrir(): Promise<never> {
  const ruleset = await rulesetAtivo()
  const fuso = ruleset.rodada.fuso
  const hoje = dataDeReferencia(new Date(), fuso)
  const jogos = await jogosDoDiaResumo(getDb(), hoje, fuso)
  const temJogoNoPrimeiroQuarto = jogos.some(
    (jogo) => estadoDoCiclo(jogo, false, ruleset.fire_live.quarto) === 'Q1',
  )
  redirect(temJogoNoPrimeiroQuarto ? '/fire-live' : '/')
}
