import { lerFeedCacheado } from '@/app/_cache/feed'
import { estadoDaTemporadaCacheado } from '@/app/_cache/rodada'
import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import {
  agruparFireLivePorJogo,
  alvosAguardandoPorJogo,
  comAlvoDoModoFire,
  lerFeedFireLive,
  type EstadoDoJogoNoFireLive,
  type EstadoVazio,
  type FiltroFireLive,
  type GrupoFireLive,
} from '@/modules/entrega/fire-live/leitura'
import { selecionarJogoAoVivo } from '@/modules/entrega/fire-live/selecao'
import { jogosDoDiaResumo, type JogoResumo } from '@/modules/entrega/lista-por-jogo'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import type { EstadoExperiencia } from '@/modules/plataforma/experiencia/contrato'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { filtrarOcultos, jogadoresOcultosComNome } from '@/modules/plataforma/jogadores-ocultos'

/**
 * Os três estados do 1º quarto: recorte na URL, rótulo na tela e ordem das
 * seções (quem ordena é `agruparFireLivePorJogo`).
 */
export const ESTADOS: { estado: EstadoDoJogoNoFireLive; valor: string; rotulo: string }[] = [
  { estado: 'EM_1Q', valor: 'agora', rotulo: 'No 1º Q agora' },
  { estado: 'AGUARDANDO', valor: 'aguardando', rotulo: 'Aguardando' },
  { estado: 'FIM_1Q', valor: 'encerrado', rotulo: '1º Q encerrado' },
]

export type RecorteAoVivo = {
  time?: string
  jogo?: string
  estado: (typeof ESTADOS)[number] | null
}

type Params = Record<string, string | string[] | undefined>
const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

export function lerRecorte(params: Params): RecorteAoVivo {
  return {
    time: primeiro(params.time),
    jogo: primeiro(params.jogo),
    estado: ESTADOS.find((c) => c.valor === primeiro(params.estado)) ?? null,
  }
}

/** A URL da tela com as mudanças pedidas; o resto do recorte segue intacto. */
export function hrefAoVivo(recorte: RecorteAoVivo, mudancas: { estado?: string | null; jogo?: string | null }): string {
  const busca = new URLSearchParams()
  if (recorte.time) busca.set('time', recorte.time)
  const jogo = mudancas.jogo === undefined ? recorte.jogo : mudancas.jogo
  if (jogo) busca.set('jogo', jogo)
  const estado = mudancas.estado === undefined ? recorte.estado?.valor : mudancas.estado
  if (estado) busca.set('estado', estado)
  const q = busca.toString()
  return q ? `/fire-live?${q}` : '/fire-live'
}

export type DadosAoVivo =
  | { tipo: 'gratis'; fuso: string; jogos: JogoResumo[]; agora: Date }
  | {
      tipo: 'ao-vivo'
      fuso: string
      agora: Date
      quartoFireLive: number
      grupos: GrupoFireLive[]
      selecionado: GrupoFireLive | null
      jogoSolicitadoInvalido: boolean
      /** Algum jogo no quarto observado: só então a tela se atualiza sozinha. */
      atualizaSozinha: boolean
      geradoEm: Date | null
      estadoVazio: EstadoVazio | null
      /**
       * Rodada do próximo jogo agendado — só no hiato entre temporadas, e só
       * quando o banco já conhece algum (nunca inventar data).
       */
      proximoJogo: string | null
      primeiroJogoUtc: Date | null
      tudoOculto: boolean
      recorteVazio: boolean
      temRecorte: boolean
      /** Há apito deste jogo no feed, mesmo que oculto pelo usuário. */
      temApitoNoJogo: boolean
      primeiraEspera: string | null
      ocultos: { id: string; nome: string }[]
      experiencia: EstadoExperiencia
    }

/**
 * Tudo que a tela Ao Vivo precisa. O paywall vem ANTES do feed pago: o
 * grátis não toca `lerFeedFireLive` nem a Lista, vê só os jogos — não é
 * esconder o apito na tela, é não ler o feed pago (paywall.test.ts trava a
 * ordem `exigirNivel` → `atende` → leituras pagas neste arquivo).
 */
export async function carregarAoVivo(recorte: RecorteAoVivo): Promise<DadosAoVivo> {
  const { sessao, acesso } = await exigirNivel('GRATIS', '/fire-live')
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const quartoFireLive = ruleset.fire_live.quarto
  const agora = new Date()
  const hoje = dataDeReferencia(agora, fuso)

  // O GRÁTIS PARA AQUI. O Fire Live é MVP (spec, decisão 6), e o objeto do
  // grátis não tem campo para item do feed — a fumaça trava a forma.
  if (!atende(acesso.nivel, 'MVP')) {
    return { tipo: 'gratis', fuso, agora, jogos: await jogosDoDiaResumo(getDb(), hoje, fuso) }
  }

  const filtro: FiltroFireLive = { time: recorte.time }
  const [feed, listaDoDia, ocultos, experiencia] = await Promise.all([
    // `jogo` escolhe o painel, não recorta a leitura.
    lerFeedFireLive(getDb(), hoje, quartoFireLive, filtro),
    // A Lista do dia só dá a contagem de alvos que esperam o 1º quarto: é o
    // mesmo snapshot para todo assinante, então vem do cache (a tela antiga
    // já lia assim; o v2 lia cru a cada refresh de 30 s).
    lerFeedCacheado(hoje),
    jogadoresOcultosComNome(getDb(), sessao.usuarioId),
    estadoExperienciaDoUsuario(getDb(), sessao.usuarioId),
  ])

  // "Sem jogos hoje" numa terça de folga e "sem jogos por mais um mês" são
  // coisas diferentes para quem paga. Mesma regra da tela antiga: só se
  // pergunta no caso vazio, e pelo cache — o lançamento (02/10) cai DENTRO do
  // hiato, e aí toda visita passaria por aqui.
  const temporada =
    feed.estadoVazio === 'SEM_JOGO_HOJE' ? await estadoDaTemporadaCacheado(hoje, ruleset) : null
  const hiato = temporada?.emHiato === true
  const estadoVazio: EstadoVazio | null = hiato ? 'TEMPORADA_NAO_COMECOU' : feed.estadoVazio

  const idsOcultos = new Set(ocultos.map((j) => j.id))
  const itensVisiveis = filtrarOcultos(feed.itens, idsOcultos)
  const naTela = await comAlvoDoModoFire(getDb(), ruleset, itensVisiveis)
  const jogosRecortados = feed.jogos.filter(
    (j) => recorte.time === undefined || j.casaSigla === recorte.time || j.visitanteSigla === recorte.time,
  )
  const grupos = agruparFireLivePorJogo(
    naTela,
    jogosRecortados,
    quartoFireLive,
    alvosAguardandoPorJogo(filtrarOcultos(listaDoDia?.conteudo.itens ?? [], idsOcultos)),
  )
  const visiveis = recorte.estado === null ? grupos : grupos.filter((g) => g.estado === recorte.estado!.estado)
  const selecao = selecionarJogoAoVivo(visiveis, recorte.jogo, new Set(experiencia.jogadoresAcompanhados))

  const tudoOculto = feed.itens.length > 0 && itensVisiveis.length === 0
  const temRecorte = recorte.estado !== null || recorte.time !== undefined

  return {
    tipo: 'ao-vivo',
    fuso,
    agora,
    quartoFireLive,
    grupos: visiveis,
    selecionado: selecao.grupo,
    jogoSolicitadoInvalido: selecao.jogoSolicitadoInvalido,
    atualizaSozinha: feed.jogos.some((j) => j.status === 'AO_VIVO' && j.quartoAtual === quartoFireLive),
    geradoEm: feed.geradoEm,
    estadoVazio,
    proximoJogo: hiato ? temporada!.proximoJogo : null,
    primeiroJogoUtc: feed.primeiroJogoUtc,
    tudoOculto,
    recorteVazio: temRecorte && visiveis.length === 0 && !tudoOculto,
    temRecorte,
    temApitoNoJogo: selecao.grupo !== null && feed.itens.some((i) => i.jogoId === selecao.grupo!.jogoId),
    primeiraEspera: visiveis.find((g) => g.estado === 'AGUARDANDO')?.jogoId ?? null,
    ocultos,
    experiencia,
  }
}
