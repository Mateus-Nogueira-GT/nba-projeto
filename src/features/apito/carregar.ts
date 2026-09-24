import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { detalheDoApito, type DetalheApito } from '@/modules/entrega/detalhe-apito'
import { lerFeedFireLive } from '@/modules/entrega/fire-live/leitura'
import type { ItemFireLive } from '@/modules/entrega/fire-live/feed'
import { recorteDoJogador } from '@/modules/entrega/lista-secreta'
import { lerFeedCacheado } from '@/app/_cache/feed'
import { cotacoesPorCasa, faixasDoJogador, type CotacaoDeCasa } from '@/modules/entrega/odds/leitura'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { saidaDoApito, type SaidaParaCasa } from '@/modules/entrega/saida-para-casa'
import type { ItemFeed } from '@/modules/entrega/tipos-feed'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { ATRIBUTOS, type Atributo } from '@/modules/motor/tipos'

export type LinhaDoAtributo = {
  item: ItemFeed
  escolhida: boolean
  /** Faixa de odd: coleta real quando houve, tabela de referência do ruleset senão. */
  faixa: [number, number] | null
  qtdCasas: number | null
}

export type DadosDoApito =
  | { tipo: 'sem-apito'; jogadorId: string }
  | {
      tipo: 'apito'
      principal: ItemFeed
      /** O mesmo jogador e atributo apitando no Fire Live, quando há. */
      aoVivo: ItemFireLive | null
      /** O sujeito da tela nasceu no Fire Live (sem apito pré-live). */
      fireLive: boolean
      detalhe: DetalheApito
      linhas: LinhaDoAtributo[]
      casas: CotacaoDeCasa[]
      casasNaTela: number
      saida: SaidaParaCasa | null
      fuso: string
      geradoEm: Date | null
      rotuloConfianca: string | null
      /** 1..5 — a cor e o brilho do herói saem daqui. */
      grauConfianca: 1 | 2 | 3 | 4 | 5 | null
      percentualModoFire: number
    }

export function atributoDaConsulta(valor: string | string[] | undefined): Atributo | undefined {
  const bruto = Array.isArray(valor) ? valor[0] : valor
  return ATRIBUTOS.find((a) => a === bruto)
}

/**
 * Os dados do detalhe de um apito. Mesma lógica do front atual: o apito
 * pré-live manda; sem ele, o do Fire Live vira o sujeito — e, se o jogo ao
 * vivo começou na rodada anterior, a análise pré-live é a DAQUELA rodada.
 */
export async function carregarApito(jogadorId: string, atributo: Atributo | undefined): Promise<DadosDoApito> {
  // O PORTÃO antes de qualquer leitura: a página cheia e o painel
  // interceptado passam os dois por aqui (fumaca.test.tsx prova as duas portas).
  await exigirNivel('MVP', `/apito/${jogadorId}`)
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(new Date(), fuso)

  // O feed do dia vem do CACHE (o mesmo snapshot que a Lista leu) e o recorte
  // do jogador é puro, sem ida ao banco.
  let { itens, geradoEm } = recorteDoJogador(await lerFeedCacheado(hoje), jogadorId, atributo)
  const vivo = await lerFeedFireLive(getDb(), hoje, ruleset.fire_live.quarto)

  let preLive = itens[0]
  const aoVivo =
    vivo.itens.find(
      (i) =>
        i.jogadorId === jogadorId &&
        (preLive !== undefined ? i.atributo === preLive.atributo : atributo === undefined || i.atributo === atributo),
    ) ?? null

  if (!preLive && aoVivo) {
    const jogo = vivo.jogos.find((j) => j.id === aoVivo.jogoId)
    const rodada = jogo ? dataDeReferencia(jogo.dataHoraUtc, fuso) : hoje
    if (rodada !== hoje) {
      // O Fire Live conserva jogos da rodada anterior enquanto estão em
      // andamento: a análise pré-live é a da rodada em que ESSE jogo começou.
      const anterior = recorteDoJogador(await lerFeedCacheado(rodada), jogadorId, aoVivo.atributo)
      itens = anterior.itens.filter((i) => i.jogoId === aoVivo.jogoId)
      preLive = itens[0]
      if (preLive) geradoEm = anterior.geradoEm
    }
  }

  const principal = preLive ?? aoVivo
  if (!principal) return { tipo: 'sem-apito', jogadorId }

  const jogosDaTela = [...new Set([principal.jogoId, ...itens.map((i) => i.jogoId)])]
  const [cotadas, casas, saida, detalhe] = await Promise.all([
    faixasDoJogador(getDb(), jogosDaTela, jogadorId, principal.atributo),
    cotacoesPorCasa(getDb(), jogosDaTela, jogadorId, principal.atributo),
    saidaDoApito(getDb()),
    detalheDoApito(getDb(), ruleset, principal, { blocos: 10 }),
  ])

  const referencia =
    principal.atributo === 'PONTOS'
      ? ruleset.odds.tabela_estatica[principal.nivelJogador]
      : ruleset.por_atributo[principal.atributo]?.odds?.[principal.nivelJogador]

  const linhas: LinhaDoAtributo[] = itens.map((item) => {
    const cotada = item.linha === null ? undefined : cotadas.get(item.linha)
    const estatica = item.linha === null ? undefined : referencia?.[String(item.linha)]
    return {
      item,
      escolhida: item.chave === principal.chave,
      faixa: cotada ? [cotada.min, cotada.max] : (estatica ?? null),
      qtdCasas: cotada?.qtdCasas ?? null,
    }
  })

  const grau = principal.grauConfianca ?? null
  const faixa = grau === null ? null : ruleset.confianca_exibicao.faixas.find((f) => f.grau === grau)

  return {
    tipo: 'apito',
    principal,
    aoVivo,
    fireLive: principal === aoVivo,
    detalhe,
    linhas,
    casas,
    casasNaTela: Math.max(0, ...[...cotadas.values()].map((f) => f.qtdCasas)),
    saida,
    fuso,
    geradoEm: geradoEm ?? vivo.geradoEm,
    // SÓ o rótulo curto: a coluna do herói tem 96px, e o rótulo longo quebrava
    // em três linhas. Texto de ruleset é dado do ruleset — não se corta aqui.
    // Sem `rotulo_curto` (opcional no schema), vale o `rotulo` inteiro — a
    // regra do ruleset e da tabela da Lista.
    rotuloConfianca: faixa?.rotulo_curto ?? faixa?.rotulo ?? null,
    grauConfianca: grau,
    percentualModoFire: ruleset.fire_live.modo_fire.percentual_media,
  }
}
