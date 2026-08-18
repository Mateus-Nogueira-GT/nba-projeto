import { calcularConfianca, linhasDoNivel } from './confianca'
import { alvoFireLive } from './fire-live/alvo'
import { topoLiberado } from './fire-live/bloco-topo'
import { emModoFire } from './fire-live/modo-fire'
import { avaliarOpd } from './lista-secreta/opd'
import { avaliarOscilacao } from './lista-secreta/oscilacao'
import type { Ruleset } from './ruleset/schema'
import { montarChave, valorDoAtributo } from './tipos'
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
      apitos.push(...avaliarFireLive(time, jogo, ruleset))
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
  const porOpd = new Map(avaliarOpd(time, jogo, ruleset).map((o) => [o.jogadorId, o.nivelApito]))

  for (const jogador of time.jogadores) {
    for (const atributo of ruleset.niveis.atributos) {
      const nivel = jogador.classificacoes[atributo]
      if (nivel === undefined) continue

      const oscilacao = avaliarOscilacao(jogador, atributo, ruleset)
      const nivelOpd = porOpd.get(jogador.id) ?? null
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
          opdOrigemNivel: nivelOpd,
          ruleset,
        }),
      )
    }
  }

  return apitos
}

// ---------------------------------------------------------------------------
// FIRE LIVE — exclusivamente no quarto definido pelo ruleset
// ---------------------------------------------------------------------------

function avaliarFireLive(time: TimeFato, jogo: JogoFato, ruleset: Ruleset): Apito[] {
  if (jogo.quartoAtual !== ruleset.fire_live.quarto) return []

  const apitos: Apito[] = []
  const porOpd = new Map(avaliarOpd(time, jogo, ruleset).map((o) => [o.jogadorId, o.nivelApito]))

  for (const jogador of time.jogadores) {
    if (jogo.escalacao[jogador.id] === 'FORA') continue

    const estatistica = jogo.estatisticasQuarto.find(
      (e) => e.jogadorId === jogador.id && e.quarto === ruleset.fire_live.quarto,
    )
    if (estatistica === undefined) continue

    for (const atributo of ruleset.niveis.atributos) {
      const nivel = jogador.classificacoes[atributo] ?? null
      const media = jogador.medias[atributo]
      if (media === undefined) continue

      // Suporte e Randola só apitam em pontos com o bloco de topo inteiro fora.
      if (
        atributo === 'PONTOS' &&
        nivel !== null &&
        ruleset.fire_live.presenca_topo.bloqueia_niveis.includes(nivel) &&
        !topoLiberado(time, jogo, atributo, ruleset)
      ) {
        continue
      }

      const alvo = alvoFireLive({ mediaPorJogo: media, atributo, nivel }, ruleset)
      if (alvo === null) continue

      const valor = valorDoAtributo(estatistica, atributo)
      if (valor < alvo) continue

      apitos.push({
        chaveDeduplicacao: montarChave(jogo.id, jogador.id, atributo, 'FIRE_LIVE', null),
        jogoId: jogo.id,
        jogadorId: jogador.id,
        atributo,
        estrategia: 'FIRE_LIVE',
        metodo: null,
        // Jogador fora da lista não tem nível; usa-se o piso da hierarquia de níveis.
        nivelJogador: nivel ?? 'RANDOLA',
        nivelApito: 1,
        turbo: false,
        modoFire: nivel !== null && emModoFire(valor, media, nivel, ruleset),
        // Cruzamento: se já estava apitado em OPD pré-live, o card mostra isso.
        opdOrigemNivel: porOpd.get(jogador.id) ?? null,
        linha: null,
        confianca: null,
        alvo1Q: alvo,
      })
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
  opdOrigemNivel: NivelApito | null
  ruleset: Ruleset
}): Apito[] {
  return linhasDoNivel(p.nivel, p.ruleset).map((linha) => ({
    chaveDeduplicacao: montarChave(
      p.jogo.id,
      p.jogador.id,
      p.atributo,
      p.estrategia,
      linha,
    ),
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
    confianca: calcularConfianca(p.nivel, linha, p.nivelApito, p.ruleset),
    alvo1Q: null,
  }))
}
