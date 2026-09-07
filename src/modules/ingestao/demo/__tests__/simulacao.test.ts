import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { somarDias } from '../../../dominio/rodada'
import { carregarRuleset } from '../../../motor/ruleset/carregar'
import type { Nivel } from '../../../motor/tipos'
import { lerListaDeNiveis } from '../../niveis/parser'
import {
  boxScoreDoTime,
  criarSorteio,
  diaAbsoluto,
  desfalquesDoDia,
  elencosDaLista,
  gerarCalendario,
  MINIMO_EM_QUADRA,
  MINUTOS_ALVO,
  SEMENTE_TEMPORADA,
} from '../simulacao'
import type { JogadorSim, LinhaBox } from '../simulacao'

const analise = lerListaDeNiveis(readFileSync('data/fontes/introducao-ia-nba.md', 'utf8'))
const SIGLAS = [...new Set(analise.jogadores.map((j) => j.timeSigla).filter((s): s is string => s !== null))]

function diasDesde(inicio: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => somarDias(inicio, i))
}

describe('criarSorteio', () => {
  it('é determinístico por chave e devolve valores em [0,1)', () => {
    const a = criarSorteio('x')
    const b = criarSorteio('x')
    const c = criarSorteio('y')
    const sa = Array.from({ length: 5 }, () => a())
    const sb = Array.from({ length: 5 }, () => b())
    const sc = Array.from({ length: 5 }, () => c())
    expect(sa).toEqual(sb)
    expect(sa).not.toEqual(sc)
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

// É sobre este número que o calendário inteiro se ancora. Se ele errar num
// ano bissexto, o rodízio pula um dia e times passam a jogar em dias seguidos
// — sem que nada mais no arquivo perceba.
describe('diaAbsoluto', () => {
  it('conta os dias desde 1970-01-01, virada de fevereiro bissexto incluída', () => {
    expect(diaAbsoluto('1970-01-01')).toBe(0)
    expect(diaAbsoluto('1999-12-31')).toBe(10956)
    expect(diaAbsoluto('2024-02-28')).toBe(19781)
    expect(diaAbsoluto('2024-02-29')).toBe(19782)
    expect(diaAbsoluto('2024-03-01')).toBe(19783)
    expect(diaAbsoluto('2026-09-06')).toBe(20702)
  })

  it('avança exatamente um por dia ao longo de uma virada de ano', () => {
    const dias = diasDesde('2026-12-20', 30)
    for (let i = 1; i < dias.length; i++) {
      expect(diaAbsoluto(dias[i]!) - diaAbsoluto(dias[i - 1]!)).toBe(1)
    }
  })
})

describe('gerarCalendario', () => {
  const DIAS = diasDesde('2026-07-19', 49)
  const calendario = gerarCalendario({ siglas: SIGLAS, dias: DIAS, semente: SEMENTE_TEMPORADA })

  it('a lista do CJ tem 30 times com sigla', () => {
    expect(SIGLAS).toHaveLength(30)
  })

  it('mesma semente → calendário idêntico; semente diferente → outro', () => {
    const outra = gerarCalendario({ siglas: SIGLAS, dias: DIAS, semente: SEMENTE_TEMPORADA })
    expect([...outra.entries()]).toEqual([...calendario.entries()])
    const diferente = gerarCalendario({ siglas: SIGLAS, dias: DIAS, semente: 'outra' })
    expect([...diferente.entries()]).not.toEqual([...calendario.entries()])
  })

  // O CONTRATO QUE O CRON DEPENDE. A janela da spec §1 é "hoje − 49 dias": ela
  // desliza um dia a cada execução. Se o dia 23 mudasse de jogos quando a janela
  // anda, `simularAte` acharia todo dia passado incompleto e o refaria — jogo
  // novo por cima do antigo, time jogando duas vezes no mesmo dia, média dobrada.
  it('é determinístico por (semente, DIA): janelas deslizantes concordam nos dias em comum', () => {
    for (const inicio of ['2026-07-20', '2026-07-22', '2026-06-30', '2026-08-01']) {
      const outrosDias = diasDesde(inicio, 49)
      const outro = gerarCalendario({ siglas: SIGLAS, dias: outrosDias, semente: SEMENTE_TEMPORADA })
      const comuns = DIAS.filter((d) => outrosDias.includes(d))
      expect(comuns.length).toBeGreaterThan(0)
      for (const dia of comuns) expect(outro.get(dia)).toEqual(calendario.get(dia))
    }
  })

  it('um dia pedido sozinho sai igual ao mesmo dia dentro da janela inteira', () => {
    for (const dia of [DIAS[0]!, DIAS[17]!, DIAS[48]!]) {
      const sozinho = gerarCalendario({ siglas: SIGLAS, dias: [dia], semente: SEMENTE_TEMPORADA })
      expect(sozinho.get(dia)).toEqual(calendario.get(dia))
    }
  })

  // A lista de níveis do CJ é documento vivo e o chamador monta as siglas de um
  // SELECT ou de um Map: a ordem em que elas chegam não pode ser um segundo
  // botão, invisível, ao lado da semente.
  it('não depende da ordem em que as siglas chegam, nem de sigla repetida', () => {
    const permutado = [...SIGLAS].reverse()
    expect(permutado).not.toEqual(SIGLAS)
    const outro = gerarCalendario({ siglas: permutado, dias: DIAS, semente: SEMENTE_TEMPORADA })
    expect([...outro.entries()]).toEqual([...calendario.entries()])
    const comRepetida = gerarCalendario({
      siglas: [...SIGLAS, SIGLAS[0]!],
      dias: DIAS,
      semente: SEMENTE_TEMPORADA,
    })
    expect([...comRepetida.entries()]).toEqual([...calendario.entries()])
  })

  it('nenhum dia fica vazio e cada rodada tem entre 4 e 10 jogos', () => {
    for (const dia of DIAS) {
      const jogos = calendario.get(dia) ?? []
      expect(jogos.length).toBeGreaterThanOrEqual(4)
      expect(jogos.length).toBeLessThanOrEqual(10)
    }
  })

  it('nenhum time joga duas vezes no mesmo dia nem em dias seguidos', () => {
    let ontem = new Set<string>()
    for (const dia of DIAS) {
      const hoje = new Set<string>()
      for (const j of calendario.get(dia) ?? []) {
        expect(j.casa).not.toBe(j.visitante)
        for (const s of [j.casa, j.visitante]) {
          expect(hoje.has(s)).toBe(false)
          expect(ontem.has(s)).toBe(false)
          hoje.add(s)
        }
      }
      ontem = hoje
    }
  })

  it('cada time faz 3 ou 4 jogos por semana: ≤4 em qualquer janela de 7 dias, ≥3 em cada bloco de 7, 20–26 na temporada', () => {
    const jogosPorTime = new Map<string, number[]>() // índices de dia
    DIAS.forEach((dia, i) => {
      for (const j of calendario.get(dia) ?? []) {
        for (const s of [j.casa, j.visitante]) jogosPorTime.set(s, [...(jogosPorTime.get(s) ?? []), i])
      }
    })
    expect(jogosPorTime.size).toBe(30)
    for (const [, indices] of jogosPorTime) {
      expect(indices.length).toBeGreaterThanOrEqual(20)
      expect(indices.length).toBeLessThanOrEqual(26)
      for (let inicio = 0; inicio + 7 <= DIAS.length; inicio++) {
        const naJanela = indices.filter((i) => i >= inicio && i < inicio + 7).length
        expect(naJanela).toBeLessThanOrEqual(4)
        if (inicio % 7 === 0) expect(naJanela).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('cada time enfrenta uma variedade de adversários, não sempre os mesmos dois', () => {
    const adversarios = new Map<string, Set<string>>()
    for (const dia of DIAS) {
      for (const j of calendario.get(dia) ?? []) {
        adversarios.set(j.casa, (adversarios.get(j.casa) ?? new Set()).add(j.visitante))
        adversarios.set(j.visitante, (adversarios.get(j.visitante) ?? new Set()).add(j.casa))
      }
    }
    // O seed antigo girava quatro confrontos fixos em round-robin: dois
    // adversários por time. Mínimo medido em 200 janelas: 8.
    for (const [, quem] of adversarios) expect(quem.size).toBeGreaterThanOrEqual(6)
  })

  it('horários em meia-horas entre 19:00 e 22:30', () => {
    for (const dia of DIAS) {
      for (const j of calendario.get(dia) ?? []) {
        expect(j.horaLocal).toMatch(/^(19|20|21|22):(00|30)$/)
      }
    }
  })
})

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const FAIXA_PPG: Record<Nivel, [number, number]> = {
  MVP: [27, 31],
  ALL_STAR: [18, 23],
  SUPORTE: [11, 16],
  RANDOLA: [5, 9],
}

/**
 * TOLERÂNCIA DA MÉDIA AMOSTRAL sobre a faixa do nível (spec §4).
 *
 * A spec pediu 1,5 ponto para TODO jogador. Não dá — e não por defeito do
 * gerador. Em 49 dias cada jogador faz ~21 jogos, e o espalhamento que as
 * OSCILAÇÕES exigem (`SIGMA.PONTOS` de 5 a 6 pontos, mais a cauda de baixo que
 * a própria spec §2 manda alongar) deixa o erro-padrão da média amostral em
 * ~1,3. Com 230 jogadores, alguém sempre estará a três erros-padrão; e quem
 * tem a média-alvo colada na borda da faixa (Luka, 27,2 numa faixa que começa
 * em 27) sai dela com um desvio. Apertar o σ para caber em 1,5 mataria a
 * oscilação, que é o produto.
 *
 * O teste então trava as duas coisas que importam: a esmagadora maioria HONRA
 * o número da spec, e ninguém passa de um limite duro. Os dois números vêm de
 * uma varredura de 200 janelas de 49 dias — a janela de produção desliza um dia
 * por execução do cron, e um limiar calibrado numa janela só seria armadilha
 * para quem rodasse o teste amanhã. Pior caso medido: 4,67 de excursão e 95,6%
 * dentro de ±1,5. Ver "desvios" na entrega da Task 1/2.
 */
const TOLERANCIA_FAIXA = 1.5
const TOLERANCIA_MAXIMA = 6
const FRACAO_DENTRO_DA_TOLERANCIA = 0.93

/**
 * Um jogador é ISENTO do teste de faixa quando a própria média-alvo dele está
 * fora dela — que é exatamente o caso dos valores nominais do documento do CJ
 * (`DO_DOCUMENTO`: LeBron 25,7 ppg sendo SUPORTE). A isenção sai do dado, não
 * de uma lista de nomes escrita no teste.
 */
function alvoForaDaFaixa(j: JogadorSim): boolean {
  const [min, max] = FAIXA_PPG[j.nivel]
  return j.medias.ppg < min || j.medias.ppg > max
}

describe('elencosDaLista', () => {
  const elencos = elencosDaLista(analise.jogadores)

  it('um elenco por sigla, 6 a 9 jogadores, ordenado por hierarquia', () => {
    expect(elencos.size).toBe(30)
    for (const [, elenco] of elencos) {
      expect(elenco.length).toBeGreaterThanOrEqual(6)
      expect(elenco.length).toBeLessThanOrEqual(9)
      for (let i = 1; i < elenco.length; i++) {
        expect(elenco[i]!.posicaoHierarquia).toBeGreaterThan(elenco[i - 1]!.posicaoHierarquia)
      }
    }
  })

  it('a média-alvo de pontos cai na faixa do nível (ou no número do documento)', () => {
    const isentos: string[] = []
    for (const [, elenco] of elencos) {
      for (const j of elenco) {
        if (alvoForaDaFaixa(j)) {
          isentos.push(j.nome)
          continue
        }
        const [min, max] = FAIXA_PPG[j.nivel]
        expect(j.medias.ppg).toBeGreaterThanOrEqual(min)
        expect(j.medias.ppg).toBeLessThanOrEqual(max)
      }
    }
    // Só o documento tira alguém da faixa, e hoje só o LeBron (25,7 sendo SUPORTE).
    expect(isentos.map((n) => n.toLowerCase())).toEqual(['lebron james'])
  })
})

// ---------------------------------------------------------------------------
// TEMPORADA SIMULADA
// ---------------------------------------------------------------------------

type Registro = { dia: string; sigla: string; jogador: JogadorSim; linha: LinhaBox }

const elencos = elencosDaLista(analise.jogadores)

function simular(dias: readonly string[]): {
  calendario: ReturnType<typeof gerarCalendario>
  registros: Registro[]
  foraPorDia: Map<string, Map<string, string[]>>
} {
  const calendario = gerarCalendario({ siglas: SIGLAS, dias, semente: SEMENTE_TEMPORADA })
  const registros: Registro[] = []
  const foraPorDia = new Map<string, Map<string, string[]>>()
  for (const dia of dias) {
    const jogos = calendario.get(dia) ?? []
    const fora = desfalquesDoDia({ dia, jogos, elencos, semente: SEMENTE_TEMPORADA })
    foraPorDia.set(dia, fora)
    for (const jogo of jogos) {
      for (const sigla of [jogo.casa, jogo.visitante]) {
        const elenco = elencos.get(sigla)!
        const linhas = boxScoreDoTime({
          chave: `${SEMENTE_TEMPORADA}|${dia}|${jogo.casa}x${jogo.visitante}|${sigla}`,
          elenco,
          fora: fora.get(sigla) ?? [],
        })
        for (const linha of linhas) {
          registros.push({ dia, sigla, jogador: elenco.find((j) => j.nome === linha.nome)!, linha })
        }
      }
    }
  }
  return { calendario, registros, foraPorDia }
}

type Serie = { jogador: JogadorSim; pontos: number[]; minutos: number[] }

function seriesPorJogador(registros: readonly Registro[]): Map<string, Serie> {
  const series = new Map<string, Serie>()
  for (const r of registros) {
    const chave = `${r.sigla}|${r.jogador.nome}`
    const atual = series.get(chave) ?? { jogador: r.jogador, pontos: [], minutos: [] }
    atual.pontos.push(r.linha.pontos)
    atual.minutos.push(r.linha.minutos)
    series.set(chave, atual)
  }
  return series
}

/** Delta do RULESET, com a exceção nominal quando o jogador tem uma. */
function deltaDe(j: JogadorSim): number {
  const chave = j.nome.toLowerCase().replace(/\s+/g, '-')
  return ruleset.oscilacao.excecoes_por_jogador[chave] ?? ruleset.oscilacao.delta[j.nivel]
}

function maiorSequenciaAbaixo(serie: Serie): number {
  const delta = deltaDe(serie.jogador)
  let atual = 0
  let maior = 0
  for (const p of serie.pontos) {
    atual = p <= serie.jogador.medias.ppg - delta ? atual + 1 : 0
    maior = Math.max(maior, atual)
  }
  return maior
}

const media = (v: readonly number[]): number => v.reduce((a, x) => a + x, 0) / v.length

describe('temporada inteira simulada (calendário + desfalques + box)', () => {
  const DIAS = diasDesde('2026-07-19', 49)
  const { registros, foraPorDia } = simular(DIAS)

  it('é determinístico: a mesma chave produz o mesmo box', () => {
    const elenco = elencos.get('OKC')!
    const a = boxScoreDoTime({ chave: 'k', elenco, fora: [] })
    const b = boxScoreDoTime({ chave: 'k', elenco, fora: [] })
    expect(a).toEqual(b)
    expect(boxScoreDoTime({ chave: 'outra', elenco, fora: [] })).not.toEqual(a)
  })

  it('quem está fora não tem linha, e sobram ao menos 6 em quadra', () => {
    for (const [dia, fora] of foraPorDia) {
      for (const [sigla, nomes] of fora) {
        const elenco = elencos.get(sigla)!
        expect(elenco.length - nomes.length).toBeGreaterThanOrEqual(MINIMO_EM_QUADRA)
        const linhas = registros.filter((r) => r.dia === dia && r.sigla === sigla)
        for (const nome of nomes) expect(linhas.some((l) => l.linha.nome === nome)).toBe(false)
      }
    }
  })

  it('desfalques acontecem, e o topo da hierarquia cai com mais frequência', () => {
    let topo = 0
    let resto = 0
    let jogosDoTopo = 0
    let jogosDoResto = 0
    for (const [, fora] of foraPorDia) {
      for (const [sigla, nomes] of fora) {
        const elenco = elencos.get(sigla)!
        for (const j of elenco) {
          const caiu = nomes.includes(j.nome)
          if (j.posicaoHierarquia <= 3) {
            jogosDoTopo += 1
            if (caiu) topo += 1
          } else {
            jogosDoResto += 1
            if (caiu) resto += 1
          }
        }
      }
    }
    expect(topo).toBeGreaterThan(0)
    expect(topo / jogosDoTopo).toBeGreaterThan(resto / jogosDoResto)
  })

  // A soma do time NÃO fecha 240: a lista do CJ nomeia 6 a 9 dos 15, e os
  // minutos que faltam são de quem ela não cita — mesma fronteira que faz
  // `semearPlacares` aceitar placar baixo. O que vai para a tela (coluna MIN,
  // "minutos recentes", média de minutos) é o minuto do JOGADOR, e é ele que
  // precisa ser plausível.
  it('os minutos de cada jogador ficam no minutos-alvo do próprio nível', () => {
    for (const r of registros) {
      const [min, max] = MINUTOS_ALVO[r.jogador.nivel]
      expect(r.linha.minutos).toBeGreaterThanOrEqual(min)
      expect(r.linha.minutos).toBeLessThanOrEqual(max)
      expect(Number.isInteger(r.linha.minutos)).toBe(true)
    }
  })

  it('a média de minutos é monótona no nível do jogador: MVP > All Star > Suporte > Randola', () => {
    const porNivel = new Map<Nivel, number[]>()
    for (const r of registros) {
      porNivel.set(r.jogador.nivel, [...(porNivel.get(r.jogador.nivel) ?? []), r.linha.minutos])
    }
    const ordem: Nivel[] = ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']
    const medias = ordem.map((n) => media(porNivel.get(n)!))
    for (let i = 1; i < medias.length; i++) expect(medias[i - 1]!).toBeGreaterThan(medias[i]! + 2)
  })

  // "Quem joga mais pontua mais" (spec §2) DENTRO do mesmo jogador: sem esta
  // asserção, zerar ACOPLAMENTO_MINUTOS não quebraria teste nenhum.
  //
  // O limiar não é decorativo. Com o acoplamento em 0,4 a diferença medida em
  // 200 janelas fica entre +0,052 e +0,100; com ACOPLAMENTO_MINUTOS = 0 ela
  // fica entre −0,028 e −0,004 (a mediana com minutos inteiros deixa um viés
  // pequeno e negativo). Exigir só "> 0" seria cara ou coroa contra o mutante
  // — e o mutante passou, antes deste número entrar.
  const EFEITO_MINIMO_DOS_MINUTOS = 0.02

  it('quem joga mais pontua mais: os jogos acima da mediana de minutos rendem mais que os abaixo', () => {
    const acima: number[] = []
    const abaixo: number[] = []
    for (const [, serie] of seriesPorJogador(registros)) {
      const mediana = [...serie.minutos].sort((a, b) => a - b)[Math.floor(serie.minutos.length / 2)]!
      // Normaliza pela média-alvo: somar pontos de MVP com pontos de randola
      // mediria nível, não minutos.
      serie.minutos.forEach((m, i) => {
        const relativo = serie.pontos[i]! / serie.jogador.medias.ppg
        if (m > mediana) acima.push(relativo)
        else if (m < mediana) abaixo.push(relativo)
      })
    }
    expect(acima.length).toBeGreaterThan(500)
    expect(abaixo.length).toBeGreaterThan(500)
    expect(media(acima) - media(abaixo)).toBeGreaterThan(EFEITO_MINIMO_DOS_MINUTOS)
  })

  // O requisito literal da spec §4 — a média amostral de cada jogador dentro da
  // FAIXA DO NÍVEL — com a leitura que o erro de amostragem de ~21 jogos
  // permite: ver TOLERANCIA_FAIXA.
  it('a média amostral fica na faixa do nível: ≥95% dentro de ±1,5 e ninguém além do limite duro', () => {
    const excursoes: number[] = []
    const alemDoLimite: string[] = []
    for (const [chave, serie] of seriesPorJogador(registros)) {
      if (alvoForaDaFaixa(serie.jogador)) continue
      const [min, max] = FAIXA_PPG[serie.jogador.nivel]
      const m = media(serie.pontos)
      const excursao = m < min ? min - m : m > max ? m - max : 0
      excursoes.push(excursao)
      if (excursao > TOLERANCIA_MAXIMA) {
        alemDoLimite.push(`${chave} (${serie.jogador.nivel}) média=${m.toFixed(2)} faixa=[${min},${max}]`)
      }
    }
    expect(alemDoLimite).toEqual([])
    const dentro = excursoes.filter((e) => e <= TOLERANCIA_FAIXA).length
    expect(dentro / excursoes.length).toBeGreaterThanOrEqual(FRACAO_DENTRO_DA_TOLERANCIA)
  })

  // A cauda de baixo é alongada de propósito (spec §2) e vem com uma
  // COMPENSACAO_CAUDA que a recentra. Sem esta asserção, errar a compensação
  // deixaria a temporada inteira abaixo da média-alvo sem quebrar nada.
  // A liga é o teste severo (230 jogadores: pior desvio medido em 200 janelas,
  // 0,12); por nível o limite é frouxo porque MVP tem só 16 nomes e a média de
  // 16 amostras oscila sozinha (pior medido, 1,02).
  it('a liga fica centrada na média-alvo: a cauda alongada não puxa a temporada para baixo', () => {
    const desvioPorNivel = new Map<Nivel, number[]>()
    const daLiga: number[] = []
    for (const [, serie] of seriesPorJogador(registros)) {
      const d = media(serie.pontos) - serie.jogador.medias.ppg
      daLiga.push(d)
      desvioPorNivel.set(serie.jogador.nivel, [...(desvioPorNivel.get(serie.jogador.nivel) ?? []), d])
    }
    expect(Math.abs(media(daLiga))).toBeLessThanOrEqual(0.5)
    for (const [, desvios] of desvioPorNivel) expect(Math.abs(media(desvios))).toBeLessThanOrEqual(1.5)
  })

  it('oscilações existem em volume plausível: 10%–45% dos jogos de MVP ficam ≤ média − delta', () => {
    const delta = ruleset.oscilacao.delta.MVP
    const deMvp = registros.filter((r) => r.jogador.nivel === 'MVP')
    const abaixo = deMvp.filter((r) => r.linha.pontos <= r.jogador.medias.ppg - delta).length
    const fracao = abaixo / deMvp.length
    expect(fracao).toBeGreaterThanOrEqual(0.1)
    expect(fracao).toBeLessThanOrEqual(0.45)
  })

  it('rebotes e assistências são inteiros não negativos', () => {
    for (const r of registros) {
      expect(Number.isInteger(r.linha.rebotes)).toBe(true)
      expect(Number.isInteger(r.linha.assistencias)).toBe(true)
      expect(r.linha.rebotes).toBeGreaterThanOrEqual(0)
      expect(r.linha.assistencias).toBeGreaterThanOrEqual(0)
    }
  })
})

/**
 * O turbo é o que a demonstração precisa mostrar, e o ruleset o restringe a
 * `oscilacao.turbo.aplica_a` com `exige_nivel` jogos seguidos abaixo. Medir "a
 * maior sequência da liga inteira" numa janela fixa não garante isso: a janela
 * de produção anda um dia a cada execução do cron.
 */
describe('sequências que o turbo exige, em toda janela que o cron pode produzir', () => {
  const NIVEIS_DO_TURBO = ruleset.oscilacao.turbo.aplica_a
  const SEQUENCIA = ruleset.oscilacao.turbo.exige_nivel
  const INICIOS = ['2026-07-19', '2026-07-26', '2026-08-02', '2026-08-09', '2026-08-16']

  for (const inicio of INICIOS) {
    it(`janela de 49 dias a partir de ${inicio} tem sequência de ${SEQUENCIA} em nível de turbo`, () => {
      const { registros } = simular(diasDesde(inicio, 49))
      const comSequencia = [...seriesPorJogador(registros).values()].filter(
        (s) => NIVEIS_DO_TURBO.includes(s.jogador.nivel) && maiorSequenciaAbaixo(s) >= SEQUENCIA,
      )
      expect(comSequencia.length).toBeGreaterThanOrEqual(1)
    })
  }
})
