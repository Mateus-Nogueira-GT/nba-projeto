import { calcularConfianca, linhasDoNivel } from './confianca'
import { avaliarFireLive } from './fire-live/avaliar'
import { avaliarOpd } from './lista-secreta/opd'
import { avaliarOscilacao } from './lista-secreta/oscilacao'
import type { Ruleset } from './ruleset/schema'
import { montarChave } from './tipos'
import type {
  Apito,
  Atributo,
  Estrategia,
  Fatos,
  JogadorFato,
  JogoFato,
  Metodo,
  Nivel,
  NivelApito,
  TimeFato,
} from './tipos'

export * from './tipos'
export { avaliarFireLive } from './fire-live/avaliar'
export type { Green, OpcoesFireLive, ResultadoFireLive } from './fire-live/avaliar'
export { marcosAtingidos } from './fire-live/green'
export { emBlowout } from './avisos/blowout'
export { agregar as agregarOdds } from './odds/agregar'
export { origemDoAtributo, linhasDoNivel, faixaEstatica, faixaDeClassificacao } from './atributos'
export { calcularConfianca, faixaDaConfianca } from './confianca'
export type { FaixaConfianca } from './confianca'
export type { FaixaOdds, OrigemOdds } from './odds/agregar'
export { carregarRuleset } from './ruleset/carregar'
export type { Ruleset } from './ruleset/schema'

/**
 * Avalia as duas estratégias sobre um conjunto de fatos.
 *
 * Função pura: sem banco, sem rede, sem relógio. `fatos.dataReferencia` é o
 * "hoje". Chamadas idênticas devolvem resultados idênticos — o que habilita
 * o backtest de rulesets (ADR-0002).
 */
export function avaliar(fatos: Fatos, ruleset: Ruleset): Apito[] {
  const apitos: Apito[] = []
  const timesPorId = new Map(fatos.times.map((t) => [t.id, t]))

  for (const jogo of fatos.jogos) {
    const times = [jogo.timeCasaId, jogo.timeVisitanteId]
      .map((id) => timesPorId.get(id))
      .filter((t): t is TimeFato => t !== undefined)

    for (const time of times) {
      apitos.push(...avaliarListaSecreta(time, jogo, ruleset))

      // No caminho pré-live/backtest a OPD é recalculada dos mesmos fatos.
      // Ao vivo, o ciclo passa a OPD COMO PUBLICADA — ver OpcoesFireLive.
      const opdPreLive = new Map(
        avaliarOpd(time, jogo, ruleset).map((o) => [o.jogadorId, o.nivelApito] as const),
      )
      apitos.push(...avaliarFireLive(time, jogo, ruleset, { opdPreLive }).apitos)
    }
  }

  // Ordem estável pela chave: garante determinismo independente da ordem dos fatos.
  return apitos.sort((a, b) => a.chaveDeduplicacao.localeCompare(b.chaveDeduplicacao))
}

// ---------------------------------------------------------------------------
// LISTA SECRETA — oscilação e OPD rodam em paralelo e se combinam
// ---------------------------------------------------------------------------

function avaliarListaSecreta(time: TimeFato, jogo: JogoFato, ruleset: Ruleset): Apito[] {
  const apitos: Apito[] = []
  const opdPorAtributo = new Map(
    ruleset.niveis.atributos.map((atributo) => [
      atributo,
      new Map(avaliarOpd(time, jogo, ruleset, atributo).map((o) => [o.jogadorId, o.nivelApito])),
    ]),
  )

  for (const jogador of time.jogadores) {
    for (const atributo of ruleset.niveis.atributos) {
      const nivel = jogador.classificacoes[atributo]
      if (nivel === undefined) continue

      const oscilacao = avaliarOscilacao(jogador, atributo, ruleset)
      const nivelOpd = opdPorAtributo.get(atributo)?.get(jogador.id) ?? null
      if (oscilacao === null && nivelOpd === null) continue

      // Os dois métodos podem apitar o mesmo jogador. A chave de deduplicação
      // não inclui o método, então o resultado é UM apito combinado.
      // Ver docs/05-perguntas-abertas.md > "combinação de métodos".
      const nivelApito = Math.max(nivelOpd ?? 0, oscilacao?.nivelApito ?? 0) as NivelApito
      const metodo: Metodo = nivelOpd !== null ? 'OPD' : 'OSCILACAO'

      const turboOpd =
        nivelOpd !== null &&
        nivelOpd >= ruleset.opd.turbo.exige_opd_nivel &&
        (oscilacao?.nivelApito ?? 0) >= ruleset.opd.turbo.exige_oscilacao_nivel

      apitos.push(
        ...porLinha({
          jogo,
          jogador,
          atributo,
          nivel,
          estrategia: 'LISTA_SECRETA',
          metodo,
          nivelApito,
          turbo: turboOpd || (oscilacao?.turbo ?? false),
          acumulaBonus: !oscilacao?.turbo || ruleset.oscilacao.turbo.acumula_bonus,
          opdOrigemNivel: nivelOpd,
          ruleset,
        }),
      )
    }
  }

  return apitos
}

// ---------------------------------------------------------------------------

function porLinha(p: {
  jogo: JogoFato
  jogador: JogadorFato
  atributo: Atributo
  nivel: Nivel
  estrategia: Estrategia
  metodo: Metodo
  nivelApito: NivelApito
  turbo: boolean
  acumulaBonus: boolean
  opdOrigemNivel: NivelApito | null
  ruleset: Ruleset
}): Apito[] {
  return linhasDoNivel(p.nivel, p.atributo, p.ruleset).map((linha) => ({
    chaveDeduplicacao: montarChave(p.jogo.id, p.jogador.id, p.atributo, p.estrategia, linha),
    jogoId: p.jogo.id,
    jogadorId: p.jogador.id,
    atributo: p.atributo,
    estrategia: p.estrategia,
    metodo: p.metodo,
    nivelJogador: p.nivel,
    nivelApito: p.nivelApito,
    turbo: p.turbo,
    modoFire: false,
    opdOrigemNivel: p.opdOrigemNivel,
    linha,
    confianca: calcularConfianca(
      p.nivel,
      p.atributo,
      linha,
      p.nivelApito,
      p.ruleset,
      p.acumulaBonus,
    ),
    alvo1Q: null,
  }))
}
