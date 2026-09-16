import { describe, expect, it } from 'vitest'

import {
  atende,
  ehNivelPago,
  maior,
  NivelDoPlano,
  NIVEIS_PAGOS,
  ORDEM_DOS_NIVEIS,
  ROTULO_DO_NIVEL,
} from '../nivel-do-plano'

describe('a ordem dos níveis é GRATIS < MVP < ALL_STAR', () => {
  it('a ordem está escrita uma vez só, e é esta', () => {
    expect(ORDEM_DOS_NIVEIS).toEqual(['GRATIS', 'MVP', 'ALL_STAR'])
    expect(NIVEIS_PAGOS).toEqual(['MVP', 'ALL_STAR'])
  })

  it('atende e maior estão certos nas NOVE combinações, e maior é comutativo', () => {
    for (const a of ORDEM_DOS_NIVEIS) {
      for (const b of ORDEM_DOS_NIVEIS) {
        const esperado = ORDEM_DOS_NIVEIS.indexOf(a) >= ORDEM_DOS_NIVEIS.indexOf(b)
        expect(atende(a, b), `atende(${a}, ${b})`).toBe(esperado)
        // COBERTURA FALSA achada na revisão final: a única asserção aqui era
        // comutatividade — `maior(a, b) === maior(b, a)` — que o MÍNIMO
        // também satisfaz (devolver sempre `b`, ou sempre `a`, também é
        // "comutativo" no sentido de bater com a chamada invertida). Trocar
        // `atende(a, b) ? a : b` por `? b : a` dentro de `maior` (devolvendo
        // o MENOR) passava os 5 testes (provado por mutação, revisão de
        // 16/09). `esperado` já diz qual dos dois é o maior — reaproveita o
        // mesmo booleano de `atende` para afirmar o VALOR, não só a simetria.
        expect(maior(a, b), `maior(${a}, ${b})`).toBe(esperado ? a : b)
        expect(maior(a, b), `maior(${a}, ${b})`).toBe(maior(b, a))
      }
    }
  })

  it('valor fora da ordem RECUSA dos dois lados — nunca abre o portão', () => {
    const lixo = 'PLANO_QUE_NAO_EXISTE' as NivelDoPlano
    // O perigoso: mínimo corrompido não pode fazer todo mundo passar.
    for (const n of ORDEM_DOS_NIVEIS) expect(atende(n, lixo)).toBe(false)
    // E o outro lado continua fechado também.
    for (const m of ORDEM_DOS_NIVEIS) expect(atende(lixo, m)).toBe(false)
  })

  it('ehNivelPago reconhece só os dois pagos — e recusa lixo', () => {
    expect(ehNivelPago('MVP')).toBe(true)
    expect(ehNivelPago('ALL_STAR')).toBe(true)
    expect(ehNivelPago('GRATIS')).toBe(false)
    expect(ehNivelPago('mvp')).toBe(false)
    expect(ehNivelPago('')).toBe(false)
  })

  it('os rótulos de tela são os nomes comerciais, não os identificadores', () => {
    // "All Star" com espaço e maiúsculas: é o nome do plano na lista
    // comercial de 15/09. O identificador ALL_STAR nunca aparece na UI.
    expect(ROTULO_DO_NIVEL).toEqual({ GRATIS: 'Grátis', MVP: 'MVP', ALL_STAR: 'All Star' })
  })
})
