import { alvoFireLive } from './alvo'
import { topoLiberado } from './bloco-topo'
import { emModoFire } from './modo-fire'
import { marcosAtingidos } from './green'
import type { Ruleset } from '../ruleset/schema'
import { montarChave, valorDoAtributo } from '../tipos'
import type { Apito, JogoFato, Nivel, NivelApito, TimeFato } from '../tipos'

export type OpcoesFireLive = {
  /**
   * AVALIAÇÃO DIRECIONADA. Presente = avalia só estes jogadores.
   *
   * É a diferença entre observar um punhado de jogadores que acabaram de
   * pontuar e reavaliar a liga inteira a cada 20 segundos. Ver
   * docs/01-arquitetura.md > "Fire Live".
   *
   * Ausente = time inteiro (caminho do pré-live e do backtest).
   */
  apenasJogadores?: ReadonlySet<string>

  /**
   * Nível da OPD **como foi publicada** na Lista Secreta pré-live.
   *
   * Entra como fato em vez de ser recalculado aqui de propósito: o requisito
   * é "o jogador JÁ ESTAVA apitado em OPD", e o card precisa exibir o que o
   * usuário viu antes do jogo. Se a escalação mudou depois do tipoff,
   * recalcular mostraria um nível que nunca foi publicado.
   */
  opdPreLive: ReadonlyMap<string, NivelApito>
}

/**
 * Um green detectado — o jogador cruzou um marco do ruleset.
 *
 * Não é um apito: sai por outro canal de push, com outro formato e outra
 * posição de tela. Por isso tem tipo próprio.
 */
export type Green = {
  jogoId: string
  jogadorId: string
  atributo: 'PONTOS'
  /** Green só existe para jogador classificado — marcosAtingidos garante isso. */
  nivelJogador: Nivel
  marco: number
  valor: number
}

export type ResultadoFireLive = {
  apitos: Apito[]
  greens: Green[]
  /**
   * Quantos jogadores o filtro deixou passar para avaliação.
   *
   * Existe para que "nunca reavalie a liga inteira" seja VERIFICÁVEL. Sem um
   * número que venha de dentro do laço, o teste do direcionamento só pode
   * reafirmar a variável que o chamador já tinha — e passaria mesmo com o
   * filtro desligado.
   */
  examinados: number
}

/**
 * FIRE LIVE — exclusivamente no quarto definido pelo ruleset.
 *
 * Função pura. A guarda do quarto vive aqui dentro, e não só no orquestrador:
 * mesmo que alguém chame isto com um jogo no 2º quarto, o resultado é vazio.
 * A regra "nada além do 1º quarto, em nenhuma hipótese" não pode depender de
 * quem chama lembrar dela.
 */
export function avaliarFireLive(
  time: TimeFato,
  jogo: JogoFato,
  ruleset: Ruleset,
  opcoes: OpcoesFireLive,
): ResultadoFireLive {
  const quarto = ruleset.fire_live.quarto
  if (jogo.quartoAtual !== quarto) return { apitos: [], greens: [], examinados: 0 }

  const apitos: Apito[] = []
  const greens: Green[] = []
  let examinados = 0

  for (const jogador of time.jogadores) {
    if (opcoes.apenasJogadores !== undefined && !opcoes.apenasJogadores.has(jogador.id)) continue
    examinados += 1
    if (jogo.escalacao[jogador.id] === 'FORA') continue

    const estatistica = jogo.estatisticasQuarto.find(
      (e) => e.jogadorId === jogador.id && e.quarto === quarto,
    )
    if (estatistica === undefined) continue

    for (const atributo of ruleset.niveis.atributos) {
      const nivel = jogador.classificacoes[atributo] ?? null
      const media = jogador.medias[atributo]
      if (media === undefined) continue

      const valor = valorDoAtributo(estatistica, atributo)

      // Green não depende de alvo nem de bloco de topo: a marca foi batida.
      for (const marco of marcosAtingidos(nivel, atributo, valor, ruleset)) {
        greens.push({
          jogoId: jogo.id,
          jogadorId: jogador.id,
          atributo: 'PONTOS',
          nivelJogador: nivel as Nivel,
          marco,
          valor,
        })
      }

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
      if (valor < alvo) continue

      apitos.push({
        chaveDeduplicacao: montarChave(jogo.id, jogador.id, atributo, 'FIRE_LIVE', null),
        jogoId: jogo.id,
        jogadorId: jogador.id,
        atributo,
        estrategia: 'FIRE_LIVE',
        metodo: null,
        // Jogador fora da lista não tem nível; usa-se o piso da hierarquia.
        nivelJogador: nivel ?? 'RANDOLA',
        nivelApito: 1,
        turbo: false,
        modoFire: nivel !== null && emModoFire(valor, media, nivel, ruleset),
        // Cruzamento: se já estava apitado em OPD pré-live, o card mostra isso.
        opdOrigemNivel: opcoes.opdPreLive.get(jogador.id) ?? null,
        linha: null,
        confianca: null,
        alvo1Q: alvo,
      })
    }
  }

  return { apitos, greens, examinados }
}
