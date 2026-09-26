import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { lerFeedCacheado } from '@/app/_cache/feed'
import { estadoDaTemporadaCacheado } from '@/app/_cache/rodada'
import { temporadasDaTelaCacheadas } from '@/app/_cache/temporada'
import { feedRetroativoCacheado, temporadaAnteriorComDados } from '@/app/_cache/retroativo'
import { temporadaDaTela } from '@/modules/entrega/retroativo/temporada'
import type { Ruleset } from '@/modules/motor/ruleset/schema'
import { agruparPorJogador, filtrarItens } from '@/modules/entrega/lista-secreta'
import {
  agruparPorJogo,
  chaveDaHierarquia,
  confrontoDoItem,
  hierarquiaDosApitados,
  jogosDoDiaResumo,
  ordenarPorSinal,
  type JogoResumo,
  type PosicaoNaHierarquia,
} from '@/modules/entrega/lista-por-jogo'
import { ATRIBUTOS, METODOS, POSICOES } from '@/modules/entrega/lista-secreta-rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import type { ItemFeed } from '@/modules/entrega/tipos-feed'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { preferenciasDoUsuario, type Lente, type OrdemLista } from '@/modules/plataforma/preferencias'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { NIVEIS, type Atributo, type Nivel } from '@/modules/motor/tipos'
import type { ColunaOrdenavel, EstadoDaTabela } from './estado'

/** Uma linha da tabela: um apito (jogador × atributo, a melhor linha). */
export type LinhaDaLista = {
  item: ItemFeed
  jogo: JogoResumo | null
  adversarioSigla: string | null
  emCasa: boolean | null
  hierarquia: PosicaoNaHierarquia | null
  /** A pessoa segue este jogador — a estrela da linha nasce acesa. */
  seguido: boolean
}

export type GrupoDaLista = {
  chave: string
  /** Cabeçalho do grupo: o jogo (Por jogo) ou o nível do jogador (Por nível). */
  jogo: JogoResumo | null
  nivel: Nivel | null
  linhas: LinhaDaLista[]
}

export type MetodoDaLista = (typeof METODOS)[number]

/** O seletor "2025-26 | 2026-27": só rótulos de temporada, nenhum dado da Lista. */
export type SeletorDaLista = { temporada: string; temporadas: string[] }

/**
 * A Lista de um dia da TEMPORADA ANTERIOR (spec 25/09): a metodologia
 * aplicada a posteriori, aberta a todo plano. Sem odd, e cada linha leva ao
 * resultado daquele dia.
 */
export type ListaRetroativa = {
  temporada: string
  data: string
  /** O dia anterior e o seguinte DENTRO da temporada; null nas pontas. */
  anterior: string | null
  proxima: string | null
}

export type DadosDaLista = (
  | {
      tipo: 'gratis'
      hoje: string
      fuso: string
      jogos: JogoResumo[]
      /**
       * Só CONTAGENS — quantos apitos cada jogo tem, sem nome, linha ou nota.
       * É a amostra do FootyStats ("+14 bloqueados"): o grátis vê o tamanho
       * do que está perdendo, nunca o dado pago.
       */
      bloqueados: { total: number; porJogo: Record<string, number> }
    }
  | {
      tipo: 'aguardando'
      hoje: string
      fuso: string
      saida: Date | null
      /**
       * Só quando não há jogo hoje E o banco diz que é o hiato entre temporadas:
       * por ~32 dias "Sem jogos hoje" leria como app quebrado. `proximoJogo`
       * só vem se houver jogo AGENDADO no banco — data inventada é fato
       * inventado (regra 3).
       */
      hiato: { exibida: string; proximoJogo: string | null } | null
    }
  | {
      tipo: 'lista'
      hoje: string
      fuso: string
      ordem: OrdemLista
      lente: Lente
      grupos: GrupoDaLista[]
      /** Jogadores seguidos pela pessoa que têm apito na rodada. */
      seguidosNaRodada: number
      /** As faixas da nota de confiança, para a legenda da coluna. */
      faixasConfianca: { de: number; grau: number; rotulo_curto: string }[]
      totalVisivel: number
      totalPublicado: number
      jogosComApito: number
      /** Recortes que existem HOJE — nenhum chip oferece recorte vazio. */
      opcoes: {
        atributos: Atributo[]
        times: string[]
        posicoes: string[]
        niveis: Nivel[]
        metodos: MetodoDaLista[]
      }
      contagemPorAtributo: Record<Atributo, number>
      /** A rodada que o snapshot descreve — pode não ser "hoje" no limite do dia. */
      dataReferencia: string
      /** Quando a lista foi publicada: "publicada às 18h30" e a última atualização. */
      geradoEm: Date
      /** A versão da regra que produziu estes apitos — rastreabilidade. */
      rulesetVersao: string
      /** Parágrafo editorial da rodada. Ausência é caso normal. */
      resumoDoDia: string | null
      /** Preenchido só na temporada anterior — e aí não há portão de plano. */
      retroativa: ListaRetroativa | null
    }
) & { seletor: SeletorDaLista }

const NORMALIZAR = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

function comparador(coluna: ColunaOrdenavel): ((a: LinhaDaLista, b: LinhaDaLista) => number) | null {
  switch (coluna) {
    case 'sinal':
      return null
    case 'confianca':
      return (a, b) => (b.item.confianca ?? -1) - (a.item.confianca ?? -1)
    case 'odd':
      return (a, b) => (b.item.oddFaixa?.max ?? -1) - (a.item.oddFaixa?.max ?? -1)
    case 'media':
      return (a, b) => margem(b.item) - margem(a.item)
    case 'ultimos':
      return (a, b) => acertos(b.item) - acertos(a.item)
    case 'jogo':
      return (a, b) =>
        (a.jogo?.dataHoraUtc.getTime() ?? Infinity) - (b.jogo?.dataHoraUtc.getTime() ?? Infinity)
  }
}

/** Média da temporada menos a linha — quanto o jogador costuma passar dela. */
export function margem(item: ItemFeed): number {
  if (item.mediaTemporada === null || item.linha === null) return -Infinity
  return item.mediaTemporada - item.linha
}

function acertos(item: ItemFeed): number {
  return item.ultimos5.filter((j) => j.bateu).length
}

/**
 * Tudo o que a tela da Lista precisa, na ordem que o produto exige: o paywall
 * vem ANTES de qualquer leitura do snapshot pago.
 */
export async function carregarLista(estado: EstadoDaTabela): Promise<DadosDaLista> {
  const { sessao, acesso } = await exigirNivel('GRATIS', '/')
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const agora = new Date()
  const hoje = dataDeReferencia(agora, fuso)

  // A TEMPORADA ANTERIOR (spec 25/09, decisão 6): aberta a todo plano, lida
  // só de `feed_retroativo`. Abre quando ESCOLHIDA no seletor, ou por padrão
  // só no hiato (`temporadaDaTela`). Tudo o mais — a atual na URL, lixo,
  // nada fora do hiato, a noite de estreia — segue o caminho de hoje, com o portão.
  const temporadas = await temporadasDaTelaCacheadas(ruleset, agora)
  const { temporada: pedida } = temporadaDaTela(estado.temporada, temporadas)
  const anterior = await temporadaAnteriorComDados(pedida, temporadas.doCalendario)
  if (anterior) {
    return carregarListaRetroativa({ estado, usuarioId: sessao.usuarioId, ruleset, hoje, anterior, temporadas: temporadas.disponiveis })
  }
  const seletor: SeletorDaLista = { temporada: temporadas.doCalendario, temporadas: temporadas.disponiveis }

  const [preferencias, jogosDoDia, experiencia] = await Promise.all([
    preferenciasDoUsuario(getDb(), sessao.usuarioId),
    jogosDoDiaResumo(getDb(), hoje, fuso),
    estadoExperienciaDoUsuario(getDb(), sessao.usuarioId),
  ])
  const seguidos = new Set(experiencia.jogadoresAcompanhados)

  // O GRÁTIS PARA AQUI — nada do feed entra nesta renderização.
  if (!atende(acesso.nivel, 'MVP')) {
    // Lido no servidor e reduzido a números aqui mesmo: nenhum item do feed
    // segue para a tela do grátis — só a contagem por jogo (pedido do v2,
    // LEIA-ME "Contagem de apitos bloqueados"). Pelo cache: é o mesmo snapshot
    // que o assinante lê, e o grátis não pode custar uma consulta por visita.
    const feedGratis = await lerFeedCacheado(hoje)
    const porJogo: Record<string, number> = {}
    const unicos = feedGratis ? agruparPorJogador(feedGratis.conteudo.itens) : []
    for (const i of unicos) porJogo[i.jogoId] = (porJogo[i.jogoId] ?? 0) + 1
    return { tipo: 'gratis', hoje, fuso, jogos: jogosDoDia, bloqueados: { total: unicos.length, porJogo }, seletor }
  }

  // O snapshot MATERIALIZADO, pelo cache e DEPOIS do portão — a tela nunca
  // executa o motor (`paywall.test.ts` vigia a ordem nesta fonte).
  const feed = await lerFeedCacheado(hoje)
  if (feed === null) {
    const primeiro = jogosDoDia[0]
    const saida =
      primeiro === undefined
        ? null
        : new Date(
            primeiro.dataHoraUtc.getTime() -
              ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000,
          )
    // Sem jogo hoje, a pergunta seguinte é "quando volta?" — no hiato a
    // resposta é um mês, não um dia (mesma regra da home anterior).
    // Pelo cache: o lançamento (02/10) cai DENTRO do hiato, e aí este é o
    // caminho de toda visita à Lista.
    const temporada = primeiro === undefined ? await estadoDaTemporadaCacheado(hoje, ruleset) : null
    const hiato =
      temporada?.emHiato === true ? { exibida: temporada.exibida, proximoJogo: temporada.proximoJogo } : null
    return { tipo: 'aguardando', hoje, fuso, saida, hiato, seletor }
  }

  return {
    ...(await montarTabela({
      estado,
      preferencias,
      seguidos,
      jogosDoDia,
      itensDoDia: feed.conteudo.itens,
      ruleset,
      hierarquia: true,
    })),
    hoje,
    fuso,
    dataReferencia: feed.conteudo.dataReferencia,
    geradoEm: feed.geradoEm,
    rulesetVersao: feed.conteudo.rulesetVersao,
    resumoDoDia: feed.conteudo.resumoDoDia ?? null,
    retroativa: null,
    seletor,
  }
}

/** O que a tabela da Lista recebe, venha o dia do feed de hoje ou do retroativo. */
type EntradaDaTabela = {
  estado: EstadoDaTabela
  preferencias: { ordemLista: OrdemLista; lente: Lente }
  seguidos: Set<string>
  jogosDoDia: JogoResumo[]
  itensDoDia: ItemFeed[]
  ruleset: Ruleset
  /**
   * A hierarquia do time é a da lista do CJ de HOJE: só vale para a temporada
   * de hoje. Na anterior ela não é consultada, e as lentes sem dado (a da
   * hierarquia e a de odds) caem na dos últimos jogos.
   */
  hierarquia: boolean
}

/** As lentes que a temporada anterior não tem como preencher. */
const LENTES_SEM_DADO: Record<Lente, boolean> = { ULT5: false, MEDIA_LINHA: false, ODDS: true, HIERARQUIA: true }

/**
 * A TABELA DO DIA: recortes da URL, agrupamento, ordenação e contagens —
 * a mesma para a Lista de hoje e para a da temporada anterior.
 */
async function montarTabela({ estado, preferencias, seguidos, jogosDoDia, itensDoDia, ruleset, hierarquia }: EntradaDaTabela) {
  const ordem = estado.ordem ?? preferencias.ordemLista
  const lentePedida = estado.lente ?? preferencias.lente
  // Sem hierarquia (a da temporada anterior não é a de hoje) a lente dela não
  // existe, e sem odd a de odds também não: cai na dos últimos jogos.
  const lente = LENTES_SEM_DADO[lentePedida] && !hierarquia ? 'ULT5' : lentePedida
  const doDia = itensDoDia
  const jogoPorId = new Map(jogosDoDia.map((j) => [j.id, j] as const))

  // Uma linha por (jogador, atributo) — a melhor linha — já recortada.
  let itens = ordenarPorSinal(agruparPorJogador(filtrarItens(doDia, estado)))
  if (estado.busca) {
    const termo = NORMALIZAR(estado.busca)
    itens = itens.filter(
      (i) => NORMALIZAR(i.nome).includes(termo) || NORMALIZAR(i.timeSigla).includes(termo) || NORMALIZAR(i.timeNome).includes(termo),
    )
  }
  // Quantos dos jogadores seguidos apitaram hoje — o chip mostra o número.
  const seguidosNaRodada = new Set(itens.filter((i) => seguidos.has(i.jogadorId)).map((i) => i.jogadorId)).size
  if (estado.seguidos) itens = itens.filter((i) => seguidos.has(i.jogadorId))
  // Quantidade conta JOGADORES, como no front atual: os N primeiros por sinal.
  if (estado.quantidade !== 0) {
    const escolhidos = new Set<string>()
    for (const i of itens) {
      if (escolhidos.size >= estado.quantidade) break
      escolhidos.add(i.jogadorId)
    }
    itens = itens.filter((i) => escolhidos.has(i.jogadorId))
  }

  const hierarquias =
    hierarquia && lente === 'HIERARQUIA'
      ? await hierarquiaDosApitados(
          getDb(),
          itens.map((i) => ({ jogadorId: i.jogadorId, atributo: i.atributo })),
        )
      : new Map<string, PosicaoNaHierarquia>()

  const paraLinha = (item: ItemFeed): LinhaDaLista => {
    const jogo = jogoPorId.get(item.jogoId) ?? null
    const confronto = confrontoDoItem(item, jogo)
    return {
      item,
      jogo,
      adversarioSigla: confronto?.adversarioSigla ?? null,
      emCasa: confronto?.emCasa ?? null,
      hierarquia: hierarquias.get(chaveDaHierarquia(item.jogadorId, item.atributo)) ?? null,
      seguido: seguidos.has(item.jogadorId),
    }
  }

  const ordenar = comparador(estado.ordenarPor)
  const emOrdem = (linhas: LinhaDaLista[]) => (ordenar ? [...linhas].sort(ordenar) : linhas)

  const grupos: GrupoDaLista[] =
    ordem === 'POR_JOGO'
      ? agruparPorJogo(itens, jogosDoDia).map((g) => ({
          chave: g.jogoId,
          jogo: jogoPorId.get(g.jogoId) ?? null,
          nivel: null,
          linhas: emOrdem(g.itens.map(paraLinha)),
        }))
      : NIVEIS.map((nivel) => ({
          chave: nivel,
          jogo: null,
          nivel,
          linhas: emOrdem(itens.filter((i) => i.nivelJogador === nivel).map(paraLinha)),
        })).filter((g) => g.linhas.length > 0)

  const contagemPorAtributo = Object.fromEntries(
    ATRIBUTOS.map((a) => [
      a,
      agruparPorJogador(filtrarItens(doDia, { ...estado, atributo: a })).length,
    ]),
  ) as Record<Atributo, number>

  return {
    tipo: 'lista' as const,
    ordem,
    lente,
    grupos,
    seguidosNaRodada,
    faixasConfianca: [...ruleset.confianca_exibicao.faixas]
      .sort((a, b) => a.de - b.de)
      // No ruleset real `rotulo_curto` é opcional (schema.ts): sem ele, vale o
      // `rotulo` inteiro — a mesma regra do detalhe do apito e do comentário do
      // ruleset ("nenhum componente fatia texto de ruleset").
      .map((f) => ({ de: f.de, grau: f.grau, rotulo_curto: f.rotulo_curto ?? f.rotulo })),
    totalVisivel: itens.length,
    totalPublicado: agruparPorJogador(doDia).length,
    jogosComApito: new Set(doDia.map((i) => i.jogoId)).size,
    opcoes: {
      atributos: ATRIBUTOS.filter((a) => doDia.some((i) => i.atributo === a)),
      times: [...new Set(doDia.map((i) => i.timeSigla))].sort(),
      posicoes: POSICOES.filter((p) => doDia.some((i) => i.posicao === p)),
      niveis: NIVEIS.filter((n) => doDia.some((i) => i.nivelJogador === n)),
      // TURBO é um sinal à parte, não um método: o chip existe se houver turbo
      // hoje. Os demais existem se algum apito tiver sido produzido por eles.
      metodos: METODOS.filter((m) =>
        m === 'TURBO' ? doDia.some((i) => i.turbo) : doDia.some((i) => i.metodo === m),
      ),
    },
    contagemPorAtributo,
  }
}

/**
 * A LISTA DE UM DIA DA TEMPORADA ANTERIOR — sem corte nem portão de plano
 * (decisão 6): é a metodologia aplicada a jogos que já aconteceram, nada
 * daqui foi publicado nem serve para apostar hoje. Lê SÓ `feed_retroativo`;
 * o feed pago de hoje não entra neste caminho.
 *
 * A data da URL só vale se for uma das datas da temporada; senão, a primeira.
 */
async function carregarListaRetroativa({
  estado,
  usuarioId,
  ruleset,
  hoje,
  anterior: { temporada, datas },
  temporadas,
}: {
  estado: EstadoDaTabela
  usuarioId: string
  ruleset: Ruleset
  hoje: string
  anterior: { temporada: string; datas: string[] }
  temporadas: string[]
}): Promise<DadosDaLista> {
  const { fuso } = ruleset.rodada
  const data = estado.data !== undefined && datas.includes(estado.data) ? estado.data : datas[0]!
  const [preferencias, jogosDoDia, experiencia, feed] = await Promise.all([
    preferenciasDoUsuario(getDb(), usuarioId),
    jogosDoDiaResumo(getDb(), data, fuso),
    estadoExperienciaDoUsuario(getDb(), usuarioId),
    feedRetroativoCacheado(temporada, data),
  ])
  const posicao = datas.indexOf(data)
  return {
    ...(await montarTabela({
      estado,
      preferencias,
      seguidos: new Set(experiencia.jogadoresAcompanhados),
      jogosDoDia,
      // Dia com jogo e sem apito tem feed vazio; dia só com apito do Fire Live não tem feed.
      itensDoDia: feed?.itens ?? [],
      ruleset,
      hierarquia: false,
    })),
    hoje,
    fuso,
    dataReferencia: data,
    // Quando o script calculou — não "publicada": nada daqui foi publicado.
    geradoEm: feed ? new Date(feed.geradoEm) : new Date(`${data}T12:00:00.000Z`),
    rulesetVersao: feed?.rulesetVersao ?? `v${ruleset.version}`,
    resumoDoDia: null,
    retroativa: {
      temporada,
      data,
      anterior: datas[posicao - 1] ?? null,
      proxima: datas[posicao + 1] ?? null,
    },
    seletor: { temporada, temporadas },
  }
}
