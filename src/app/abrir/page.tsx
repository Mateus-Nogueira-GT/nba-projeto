import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { estadoDoCiclo, jogosDoDiaResumo } from '@/modules/entrega/lista-por-jogo'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { estadoDaTemporadaCacheado } from '@/app/_cache/rodada'

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
 *
 * FORA DA CASCA `(app)` (front v2): ela não desenha nada, e a casca consulta
 * sessão, acesso e identidade para montar o menu — trabalho jogado fora numa
 * rota que só redireciona. Grupo não muda a URL, então existe UMA `/abrir`.
 * A regra do hiato abaixo é nossa; o v2 a tinha perdido.
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
  // Pelo cache, como a Lista e o Ao Vivo: esta é a primeira visita de TODA
  // abertura do PWA, e no hiato (o lançamento cai dentro dele) cada uma
  // perguntava a temporada ao banco.
  if (jogos.length === 0) {
    const temporada = await estadoDaTemporadaCacheado(hoje, ruleset)
    if (temporada.emHiato) redirect('/estatisticas')
  }

  redirect('/')
}
