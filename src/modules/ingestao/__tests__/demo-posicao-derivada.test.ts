import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { niveis } from '../../dominio/db/schema'
import { chaveDeNome, semearCadastro } from '../demo/cadastro'

/**
 * A DEMO NÃO INVENTA EMPATE (debug de 07/10). A lista do CJ traz seções de
 * pontos, rebotes e assistências; os níveis de REB/AST que a demo DERIVA para
 * quem falta numa seção levavam a posição de QUALQUER entrada do jogador — a
 * de rebotes virava posição de assistências, colando em quem a lista real já
 * tinha posto ali. Derivado só empresta a posição da seção de PONTOS.
 */
const AGORA = new Date('2026-01-15T18:00:00Z')
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let cadastro: Awaited<ReturnType<typeof semearCadastro>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  cadastro = await semearCadastro(banco.db, AGORA)
})
afterAll(async () => banco.fechar())

describe('posição dos níveis derivados na demo', () => {
  it('REB/AST derivado leva a posição da entrada de PONTOS do jogador', async () => {
    const naLista = new Set<string>()
    const posicaoEmPontos = new Map<string, number>()
    for (const j of cadastro.analise.jogadores) {
      const id = cadastro.jogadorPorChave.get(chaveDeNome(j.nomeNaLista))
      if (!id) continue
      naLista.add(`${id}|${j.atributo}`)
      // Por (jogador, time): a lista tem quem aparece em dois elencos.
      const timeId = j.timeSigla ? cadastro.timePorSigla.get(j.timeSigla) : undefined
      if (j.atributo === 'PONTOS') posicaoEmPontos.set(`${id}|${timeId}`, j.posicaoHierarquia)
    }

    const derivados = (await banco.db.select().from(niveis)).filter(
      (n) => n.atributo !== 'PONTOS' && !naLista.has(`${n.jogadorId}|${n.atributo}`),
    )
    expect(derivados.length).toBeGreaterThan(0)
    for (const n of derivados) {
      const chave = `${n.jogadorId}|${n.timeId}`
      expect(posicaoEmPontos.has(chave), chave).toBe(true)
      expect(n.posicaoHierarquia, chave).toBe(posicaoEmPontos.get(chave))
    }
  })
})
