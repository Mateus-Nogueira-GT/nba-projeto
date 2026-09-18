import { describe, expect, it } from 'vitest'

import { composicaoDoSku, ehSku, NOME_DO_SKU, ofertasDisponiveis, SKUS } from '../sku'

// Dentro da janela da temporada em todos os casos, menos onde o nome diz o
// contrário.
const AGORA = new Date('2026-10-01T12:00:00.000Z')
const FIM_DA_TEMPORADA = new Date('2027-07-01T03:00:00.000Z')

/**
 * As listas esperadas são escritas À MÃO, nunca derivadas de `SKUS` nem de
 * `composicaoDoSku`. Derivar faria o teste comparar o módulo consigo mesmo —
 * foi assim que uma matriz de planos passou verde com o conteúdo errado
 * (revisão de 16/09).
 */
function skusDe(acesso: Parameters<typeof ofertasDisponiveis>[0], agora = AGORA): string[] {
  return ofertasDisponiveis(acesso, agora, FIM_DA_TEMPORADA).map((oferta) => oferta.sku)
}

describe('composição do SKU', () => {
  it('cada SKU é um nível e uma modalidade', () => {
    expect(composicaoDoSku('MVP_MENSAL')).toEqual({ nivelDoPlano: 'MVP', modalidade: 'MENSAL' })
    expect(composicaoDoSku('MVP_TEMPORADA')).toEqual({
      nivelDoPlano: 'MVP',
      modalidade: 'TEMPORADA',
    })
    expect(composicaoDoSku('ALL_STAR_MENSAL')).toEqual({
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'MENSAL',
    })
    expect(composicaoDoSku('ALL_STAR_TEMPORADA')).toEqual({
      nivelDoPlano: 'ALL_STAR',
      modalidade: 'TEMPORADA',
    })
  })

  it('ehSku recusa o que não é SKU — o valor chega de formulário', () => {
    expect(ehSku('MVP_MENSAL')).toBe(true)
    expect(ehSku('GRATIS_MENSAL')).toBe(false)
    expect(ehSku('MVP')).toBe(false)
    expect(ehSku('')).toBe(false)
    expect(ehSku('__proto__')).toBe(false)
  })

  it('SKUS tem os quatro e NOME_DO_SKU nomeia todos eles', () => {
    expect([...SKUS].sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_MENSAL', 'MVP_TEMPORADA'].sort(),
    )
    for (const sku of SKUS) expect(NOME_DO_SKU[sku].length).toBeGreaterThan(0)
    // O nome vai para a fatura do comprador: quatro nomes, quatro textos.
    expect(new Set(Object.values(NOME_DO_SKU)).size).toBe(4)
  })
})

describe('ofertasDisponiveis', () => {
  it('o grátis vê os quatro enquanto a temporada está aberta', () => {
    expect(skusDe({ nivel: 'GRATIS', modalidade: null }).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_MENSAL', 'MVP_TEMPORADA'].sort(),
    )
  })

  it('passada a data da temporada, sobram só os mensais', () => {
    const depois = new Date('2027-07-02T12:00:00.000Z')
    expect(skusDe({ nivel: 'GRATIS', modalidade: null }, depois).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'MVP_MENSAL'].sort(),
    )
  })

  it('o instante exato do fim já fecha a temporada', () => {
    expect(skusDe({ nivel: 'GRATIS', modalidade: null }, FIM_DA_TEMPORADA).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'MVP_MENSAL'].sort(),
    )
  })

  it('MVP mensal não compra MVP mensal de novo, mas troca de modalidade e sobe', () => {
    expect(skusDe({ nivel: 'MVP', modalidade: 'MENSAL' }).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_TEMPORADA'].sort(),
    )
  })

  it('quem tem temporada nunca volta para mensal', () => {
    expect(skusDe({ nivel: 'MVP', modalidade: 'TEMPORADA' })).toEqual(['ALL_STAR_TEMPORADA'])
  })

  it('All Star mensal só pode trocar para a temporada — downgrade não existe', () => {
    expect(skusDe({ nivel: 'ALL_STAR', modalidade: 'MENSAL' })).toEqual(['ALL_STAR_TEMPORADA'])
  })

  it('All Star temporada não tem o que comprar', () => {
    expect(skusDe({ nivel: 'ALL_STAR', modalidade: 'TEMPORADA' })).toEqual([])
  })

  it('cortesia MVP (sem modalidade) pode comprar o próprio nível e o de cima', () => {
    expect(skusDe({ nivel: 'MVP', modalidade: null }).sort()).toEqual(
      ['ALL_STAR_MENSAL', 'ALL_STAR_TEMPORADA', 'MVP_MENSAL', 'MVP_TEMPORADA'].sort(),
    )
  })

  it('substituiPlanoAtual só é verdadeiro para quem tem plano PAGO — é o que aciona o aviso', () => {
    for (const oferta of ofertasDisponiveis(
      { nivel: 'GRATIS', modalidade: null },
      AGORA,
      FIM_DA_TEMPORADA,
    )) {
      expect(oferta.substituiPlanoAtual).toBe(false)
    }
    for (const oferta of ofertasDisponiveis(
      { nivel: 'MVP', modalidade: 'MENSAL' },
      AGORA,
      FIM_DA_TEMPORADA,
    )) {
      expect(oferta.substituiPlanoAtual).toBe(true)
    }
  })

  it('cortesia não dispara o aviso: não há plano pago a perder', () => {
    // A revogação do upgrade preserva `CORTESIA_ADMIN` — é regra desta
    // branch. Avisar "o seu plano atual é encerrado, sem devolução" a quem tem
    // cortesia é a tela ameaçando algo que o código não faz, e falando de
    // devolução para quem nunca pagou. `modalidade` nula é o que marca a
    // cortesia: ninguém pagou, então não há modalidade.
    for (const oferta of ofertasDisponiveis(
      { nivel: 'MVP', modalidade: null },
      AGORA,
      FIM_DA_TEMPORADA,
    )) {
      expect(oferta.substituiPlanoAtual).toBe(false)
    }
  })

  it('cada oferta carrega a composição do próprio SKU', () => {
    const ofertas = ofertasDisponiveis({ nivel: 'GRATIS', modalidade: null }, AGORA, FIM_DA_TEMPORADA)
    const temporadaAllStar = ofertas.find((oferta) => oferta.sku === 'ALL_STAR_TEMPORADA')
    expect(temporadaAllStar).toMatchObject({ nivelDoPlano: 'ALL_STAR', modalidade: 'TEMPORADA' })
  })
})
