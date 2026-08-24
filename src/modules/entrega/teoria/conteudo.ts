import type { Ruleset } from '../../motor/ruleset/schema'
import type { Nivel, NivelApito } from '../../motor/tipos'

/**
 * A METODOLOGIA DO CJ, LIDA DO RULESET.
 *
 * A aba teórica não pode ter número escrito no JSX: se o CJ trocar um delta no
 * YAML, a explicação tem que mudar junto — senão a plataforma passa a ensinar
 * uma regra que o motor não executa mais. Este módulo é a ponte, e o teste
 * compara campo a campo com o ruleset carregado.
 */
export type Teoria = {
  niveis: {
    ordem: Nivel[]
    /** Nível de apito mínimo em que cada classe aparece na oscilação. */
    minimoOscilacao: Record<Nivel, number>
  }
  oscilacao: {
    delta: Record<Nivel, number>
    excecoes: Record<string, number>
    dnpIgnora: boolean
    turbo: { aplicaA: Nivel[]; exigeNivel: number }
  }
  opd: {
    janela: number
    exigePrefixo: boolean
    mapaNivel: Record<string, number>
    turbo: { exigeOpd: number; exigeOscilacao: number }
  }
  confianca: {
    base: Partial<Record<Nivel, Record<string, number>>>
    bonus: Partial<Record<Nivel, Record<string, number>>>
  }
  odds: {
    agregacao: string
    casasMinimas: number
    tabela: Partial<Record<Nivel, Record<string, [number, number]>>>
  }
  fireLive: {
    quarto: number
    quartosPorJogo: number
    multiplicadores: {
      pontosClassificado: number
      pontosRandola: number
      pontosNaoClassificado: number
      rebotes: number
    }
    assistencias: { valor: number; mediaMinima: number }
    travas: { pontosAlvoMinimo: number; rebotesAlvoMinimo: number }
    modoFire: { aplicaA: Nivel[]; percentual: number }
    presencaTopo: { bloqueiaNiveis: Nivel[]; timesIsentos: string[] }
  }
  push: { marcosGreen: Partial<Record<Nivel, number[]>>; canais: string[] }
  blowout: { quarto: number; diferenca: number; aplicaA: string }
  matchup: { habilitado: boolean; liberarAposDias: number }
}

export function montarTeoria(ruleset: Ruleset): Teoria {
  const fl = ruleset.fire_live
  return {
    niveis: {
      ordem: ruleset.niveis.ordem,
      minimoOscilacao: ruleset.oscilacao.nivel_minimo_apito as Record<Nivel, number>,
    },
    oscilacao: {
      delta: ruleset.oscilacao.delta as Record<Nivel, number>,
      excecoes: ruleset.oscilacao.excecoes_por_jogador,
      dnpIgnora: ruleset.oscilacao.dnp === 'ignora',
      turbo: {
        aplicaA: ruleset.oscilacao.turbo.aplica_a,
        exigeNivel: ruleset.oscilacao.turbo.exige_nivel,
      },
    },
    opd: {
      janela: ruleset.opd.janela,
      exigePrefixo: ruleset.opd.exige_prefixo_hierarquia,
      mapaNivel: ruleset.opd.mapa_nivel as Record<string, number>,
      turbo: {
        exigeOpd: ruleset.opd.turbo.exige_opd_nivel,
        exigeOscilacao: ruleset.opd.turbo.exige_oscilacao_nivel,
      },
    },
    confianca: {
      base: ruleset.confianca.base,
      bonus: ruleset.confianca.bonus_por_nivel_apito,
    },
    odds: {
      agregacao: ruleset.odds.agregacao,
      casasMinimas: ruleset.odds.casas_minimas,
      tabela: ruleset.odds.tabela_estatica,
    },
    fireLive: {
      quarto: fl.quarto,
      quartosPorJogo: fl.quartos_por_jogo,
      multiplicadores: {
        pontosClassificado: fl.multiplicadores.pontos_classificado,
        pontosRandola: fl.multiplicadores.pontos_randola,
        pontosNaoClassificado: fl.multiplicadores.pontos_nao_classificado,
        rebotes: fl.multiplicadores.rebotes,
      },
      assistencias: {
        valor: fl.assistencias.valor,
        mediaMinima: fl.assistencias.media_minima,
      },
      travas: {
        pontosAlvoMinimo: fl.travas.pontos_alvo_minimo,
        rebotesAlvoMinimo: fl.travas.rebotes_alvo_minimo,
      },
      modoFire: {
        aplicaA: fl.modo_fire.aplica_a,
        percentual: fl.modo_fire.percentual_media,
      },
      presencaTopo: {
        bloqueiaNiveis: fl.presenca_topo.bloqueia_niveis,
        timesIsentos: fl.presenca_topo.times_isentos,
      },
    },
    push: {
      marcosGreen: ruleset.push.marcos_green,
      canais: ruleset.push.canais_independentes,
    },
    blowout: {
      quarto: ruleset.avisos.blowout.quarto,
      diferenca: ruleset.avisos.blowout.diferenca_pontos,
      aplicaA: ruleset.avisos.blowout.aplica_a,
    },
    matchup: {
      habilitado: ruleset.matchup.habilitado,
      liberarAposDias: ruleset.matchup.liberar_apos_dias_de_competicao,
    },
  }
}

/** Rótulo em português de um nível de apito, para a prosa da página. */
export function corDoApito(nivel: NivelApito): string {
  return nivel === 1 ? 'amarelo' : nivel === 2 ? 'laranja' : 'verde'
}
