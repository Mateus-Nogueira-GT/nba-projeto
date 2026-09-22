import { eq } from 'drizzle-orm'

import {
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  fireLiveExecucoes,
  jogos,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { marcosDoNivel } from '../../motor/atributos'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo, Nivel } from '../../motor/tipos'
import {
  boxComplementar,
  decomporPontos,
  historicoOscilacao,
  mediaDe,
  naFaixa,
  niveisDoJogador,
} from './dados'

export type JogadorAoVivo = {
  /** Nome NA LISTA do CJ — é ele que alimenta os geradores de `dados.ts`. */
  nome: string
  jogadorId: string
  nivel: Nivel
  timeId: string
}

/**
 * 1º QUARTO AO VIVO — o elenco INTEIRO dos dois times, não só o protagonista.
 * Com uma linha só, a tela do Fire Live abria com um card solitário e a trava
 * de alvo mínimo do ruleset nunca aparecia em ação.
 *
 * `protagonistas`: um POR ATRIBUTO, quem cruza o primeiro marco de green — os
 * três canais do push aparecem na demonstração, não só o de pontos. Na fixture
 * são Shai/Jokić/Murray; na temporada simulada, o bloco de topo do jogo que o
 * calendário escolheu. `null` significa "ninguém forçado neste atributo".
 *
 * `chave` entra no gerador de variação do quarto — `'1Q'` preserva, caractere a
 * caractere, os números da fixture.
 */
export async function semearJogoAoVivo(
  db: Db,
  ruleset: Ruleset,
  opcoes: {
    jogoId: string
    timeCasaId: string
    timeVisitanteId: string
    elenco: readonly JogadorAoVivo[]
    protagonistas: Record<Atributo, string | null>
    chave: string
    agora: Date
  },
): Promise<void> {
  const quarto = ruleset.fire_live.quarto
  const quartos = ruleset.fire_live.quartos_por_jogo
  // Placar do jogo ao vivo: nada digitado — é a SOMA dos pontos do 1º quarto
  // que o laço abaixo já está gravando.
  let pontosCasa = 0
  let pontosVisitante = 0

  for (const j of opcoes.elenco) {
    const m = mediaDe(j.nome, j.nivel, ruleset)
    const derivados = niveisDoJogador(j.nome, j.nivel)
    // Um quarto é um quarto do jogo: a média dividida pelos quartos é o
    // desempenho neutro. A variação vem do mesmo gerador do histórico.
    const noQuarto = (media: number, atributo: Atributo): number => {
      const sequencia = historicoOscilacao(media / quartos, 1, 0, {
        variacao: `${opcoes.chave}|${j.nome}|${atributo}`,
      })
      return Math.max(0, sequencia[0] ?? Math.round(media / quartos))
    }

    // O número do marco sai sempre do ruleset (`marcosDoNivel`), nunca digitado
    // aqui.
    //
    // Os marcos de rebotes e assistências são de JOGO INTEIRO e a demo os faz
    // acontecer dentro do 1º quarto — irreal de propósito, para o canal ficar
    // visível. Ver a pergunta ao CJ em docs/specs/README (marco de 1Q).
    const cruzarMarco = (atributo: Atributo, media: number): number | null => {
      const marco = marcosDoNivel(derivados[atributo], atributo, ruleset)[0]
      if (marco === undefined) return null
      // Pontos ainda precisa passar dos 75% da média: é o que acende o modo
      // fire do protagonista, e o marco sozinho poderia ficar abaixo disso.
      return atributo === 'PONTOS'
        ? Math.max(Math.ceil(media * ruleset.fire_live.modo_fire.percentual_media), marco)
        : marco
    }

    const valorDoQuarto = (atributo: Atributo, media: number): number =>
      j.nome === opcoes.protagonistas[atributo]
        ? (cruzarMarco(atributo, media) ?? noQuarto(media, atributo))
        : noQuarto(media, atributo)

    const valores = {
      pontos: valorDoQuarto('PONTOS', m.ppg),
      rebotes: valorDoQuarto('REBOTES', m.rpg),
      assistencias: valorDoQuarto('ASSISTENCIAS', m.apg),
    }

    await db
      .insert(estatisticasQuarto)
      .values({ jogoId: opcoes.jogoId, jogadorId: j.jogadorId, quarto, ...valores })
      .onConflictDoUpdate({
        target: [estatisticasQuarto.jogoId, estatisticasQuarto.jogadorId, estatisticasQuarto.quarto],
        set: valores,
      })

    // BOX PARCIAL DA TELA DE PARTIDA — mesma fonte que acabou de gravar em
    // `estatisticas_quarto` (`valores`, acima), nunca recalculado: se os
    // dois discordassem, a tela de partida contradiria a própria tela que
    // motivou o refresh de 30s. Antes desta linha a tela lia
    // `estatisticas_jogo`, que o jogo AO VIVO nunca escrevia, e o jogo em
    // destaque da demo caía sempre em "Box score em atualização" (achado
    // da revisão). `minutos` é fração de quarto — os outros jogos do seed
    // usam `'30.00'` (jogo inteiro); dar isso aqui diria que a partida já
    // acabou.
    const minutosParciais = naFaixa(j.nome, '1q-min', [4, 11])
    const valoresBox = {
      pontos: valores.pontos,
      rebotesTotal: valores.rebotes,
      assistencias: valores.assistencias,
      minutos: minutosParciais.toFixed(2),
      ...decomporPontos(valores.pontos),
      ...boxComplementar(`${j.nome}|1Q`, valores.rebotes),
    }
    await db
      .insert(estatisticasJogo)
      .values({ jogoId: opcoes.jogoId, jogadorId: j.jogadorId, ...valoresBox })
      .onConflictDoUpdate({
        target: [estatisticasJogo.jogoId, estatisticasJogo.jogadorId],
        set: valoresBox,
      })

    if (j.timeId === opcoes.timeCasaId) pontosCasa += valores.pontos
    else pontosVisitante += valores.pontos
  }

  await db
    .update(jogos)
    .set({ placarCasa: pontosCasa, placarVisitante: pontosVisitante })
    .where(eq(jogos.id, opcoes.jogoId))

  // BOX DO TIME, só o 1º quarto — o único que já aconteceu. Espalhar o
  // placar pelos quatro quartos (como `semearBoxScoreDoTime` faz para os
  // ENCERRADOS) inventaria pontos em quartos que ainda não existem. Sem isto a
  // Tela de Partida não tinha "Pontos por quarto" nem TOT para o jogo ao vivo
  // em destaque da demo (achado da revisão).
  for (const [timeId, pontosTime] of [
    [opcoes.timeCasaId, pontosCasa],
    [opcoes.timeVisitanteId, pontosVisitante],
  ] as const) {
    // A coluna sai do MESMO `quarto` que `estatisticas_quarto` acabou de
    // receber — hoje o ruleset diz 1 e sempre dirá (Fire Live é só o 1º
    // quarto), mas escrever `pontosQ1` à mão faria as duas tabelas
    // discordarem em silêncio se esse número um dia mudasse.
    const valoresTime = {
      pontos: pontosTime,
      pontosQ1: quarto === 1 ? pontosTime : 0,
      pontosQ2: quarto === 2 ? pontosTime : 0,
      pontosQ3: quarto === 3 ? pontosTime : 0,
      pontosQ4: quarto === 4 ? pontosTime : 0,
      pontosProrrogacao: 0,
    }
    await db
      .insert(estatisticasTimeJogo)
      .values({ jogoId: opcoes.jogoId, timeId, ...valoresTime })
      .onConflictDoUpdate({
        target: [estatisticasTimeJogo.jogoId, estatisticasTimeJogo.timeId],
        set: valoresTime,
      })
  }

  await db
    .insert(fireLiveExecucoes)
    .values({ jogoId: opcoes.jogoId, iniciadoEm: opcoes.agora })
    .onConflictDoNothing()
}
