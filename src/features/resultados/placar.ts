import type { DiaConferido } from '@/modules/entrega/resultados'

/**
 * PLACAR DO NIP — a transparência que o FootyStats usa e que a crítica ao
 * R10 pede: quanto cada faixa de confiança e cada nível de jogador acertou
 * de fato nas rodadas já conferidas. É contagem sobre a conferência que a
 * entrega já faz; nenhuma regra nova. DNP fica fora (não é acerto nem erro).
 * Usado em Resultados e na página pública /placar.
 */
export type LinhaDoPlacar = { chave: string; rotulo: string; grau?: number; total: number; acertos: number }
export type PlacarDoNip = {
  rodadas: number
  porConfianca: LinhaDoPlacar[]
  porNivel: LinhaDoPlacar[]
}

export const DIAS_DO_PLACAR = 30

type Faixa = { de: number; grau: number; rotulo_curto: string }

const ROTULO_NIVEL: Record<string, string> = { MVP: 'MVP', ALL_STAR: 'All-Star', SUPORTE: 'Suporte', RANDOLA: 'Randola' }

export function montarPlacar(dias: DiaConferido[], faixasDoRuleset: readonly Faixa[]): PlacarDoNip {
  const faixas = [...faixasDoRuleset].sort((a, b) => b.de - a.de)
  const porConfianca: LinhaDoPlacar[] = faixas.map((f) => ({
    chave: String(f.grau),
    rotulo: `${f.de}%+ · ${f.rotulo_curto.toLowerCase()}`,
    grau: f.grau,
    total: 0,
    acertos: 0,
  }))
  const porNivel = new Map<string, LinhaDoPlacar>()
  for (const dia of dias) {
    for (const j of dia.jogadores) {
      for (const l of j.linhas) {
        if (l.bateu === null || l.confianca === null) continue
        const faixa = faixas.find((f) => l.confianca! >= f.de)
        const alvo = faixa ? porConfianca.find((p) => p.grau === faixa.grau) : undefined
        if (alvo) {
          alvo.total++
          if (l.bateu) alvo.acertos++
        }
      }
      if (j.bateuLinhaMaisBaixa !== null) {
        const n = porNivel.get(j.nivelJogador) ?? {
          chave: j.nivelJogador,
          rotulo: ROTULO_NIVEL[j.nivelJogador] ?? j.nivelJogador,
          total: 0,
          acertos: 0,
        }
        n.total++
        if (j.bateuLinhaMaisBaixa) n.acertos++
        porNivel.set(j.nivelJogador, n)
      }
    }
  }
  return {
    rodadas: dias.length,
    porConfianca,
    porNivel: ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']
      .map((n) => porNivel.get(n))
      .filter((n): n is LinhaDoPlacar => n !== undefined),
  }
}
