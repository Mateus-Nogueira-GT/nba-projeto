import type { Ruleset } from '../ruleset/schema'
import type { JogoFato, NivelApito, TimeFato } from '../tipos'

export type ApitoOpd = { jogadorId: string; nivelApito: NivelApito }

/**
 * OPD — Oportunidade Por Desfalque.
 *
 * Escala INVERTIDA em relação à oscilação: quem está mais perto da vaga recebe
 * o nível mais alto (3), porque a oportunidade é maior.
 *
 * A trava crítica: o desfalque tem que ser PREFIXO da hierarquia. Se o nº 2
 * falta e o nº 1 joga, não há apito nenhum.
 */
export function avaliarOpd(time: TimeFato, jogo: JogoFato, ruleset: Ruleset): ApitoOpd[] {
  const hierarquia = [...time.jogadores].sort(
    (a, b) => a.posicaoHierarquia - b.posicaoHierarquia,
  )
  const estaFora = (id: string) => jogo.escalacao[id] === 'FORA'

  // Maior bloco contíguo de desfalques a partir do topo.
  let prefixo = 0
  while (prefixo < hierarquia.length && estaFora(hierarquia[prefixo]!.id)) {
    prefixo += 1
  }

  if (prefixo === 0) return []

  // Jogador ausente não recebe oportunidade — a janela pula quem também está fora.
  const beneficiados = hierarquia
    .slice(prefixo)
    .filter((j) => !estaFora(j.id))
    .slice(0, ruleset.opd.janela)

  const apitos: ApitoOpd[] = []

  for (const [indice, jogador] of beneficiados.entries()) {
    const distancia = indice + 1
    const nivelApito = ruleset.opd.mapa_nivel[String(distancia)]
    if (nivelApito === undefined) continue
    apitos.push({ jogadorId: jogador.id, nivelApito: nivelApito as NivelApito })
  }

  return apitos
}
