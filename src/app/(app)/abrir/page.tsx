import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { estadoDoCiclo, jogosDoDiaResumo } from '@/modules/entrega/lista-por-jogo'
import { estadoDaTemporada } from '@/modules/entrega/estatisticas/temporadas'
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
  const db = getDb()
  const jogos = await jogosDoDiaResumo(db, hoje, fuso)
  const temJogoNoPrimeiroQuarto = jogos.some(
    (jogo) => estadoDoCiclo(jogo, false, ruleset.fire_live.quarto) === 'Q1',
  )
  if (temJogoNoPrimeiroQuarto) redirect('/fire-live')

  // Durante o hiato entre temporadas não há apito nenhum por decisão do
  // parceiro (spec 22/09). Abrir na Lista seria abrir num vazio de ~32 dias;
  // Estatísticas é a única aba com conteúdo real nessa janela.
  if (jogos.length === 0) {
    const temporada = await estadoDaTemporada(db, ruleset, new Date())
    if (temporada.emHiato) redirect('/estatisticas')
  }

  redirect('/')
}
