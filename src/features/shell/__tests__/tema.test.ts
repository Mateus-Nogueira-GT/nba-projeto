import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { scriptDoTema, temaDoCookie } from '../tema'

/*
 * O tema mora num cookie. Cookie ausente ou adulterado não pode virar
 * `data-tema` arbitrário no <html>: cai sempre no Marinho, o padrão da reunião
 * de 23/09.
 */
describe('tema', () => {
  it('sem cookie ou com valor estranho, é o Marinho', () => {
    expect(temaDoCookie(undefined)).toBe('marinho')
    expect(temaDoCookie('xyz')).toBe('marinho')
  })
  it('os três temas do v2 passam', () => {
    for (const t of ['marinho', 'aco', 'claro'] as const) expect(temaDoCookie(t)).toBe(t)
  })
})

/*
 * O layout raiz é ESTÁTICO (sem `cookies()`: senão toda rota, até o 404, vira
 * invocação de função). Quem aplica o tema é um script inline no <head>, que
 * roda antes da primeira pintura. Aqui ele roda contra um `document` falso —
 * o mesmo texto que vai para o HTML.
 */
function rodarScript(cookie: string | (() => string)) {
  const dataset: Record<string, string> = { tema: 'marinho' }
  const documento = {
    get cookie() {
      return typeof cookie === 'function' ? cookie() : cookie
    },
    documentElement: { dataset },
  }
  new Function('document', scriptDoTema())(documento)
  return dataset.tema
}

describe('script do tema', () => {
  it('sem cookie, fica o Marinho', () => {
    expect(rodarScript('')).toBe('marinho')
  })
  it('com nip-tema=claro, vira Claro (e aço vira Aço), entre outros cookies', () => {
    expect(rodarScript('nip-tema=claro')).toBe('claro')
    expect(rodarScript('outro=1; nip-tema=aco; mais=2')).toBe('aco')
  })
  it('valor fora da lista não entra no <html>', () => {
    expect(rodarScript('nip-tema=xyz')).toBe('marinho')
    expect(rodarScript('x-nip-tema=claro')).toBe('marinho')
  })
  it('cookie malformado não derruba a página e fica o Marinho', () => {
    expect(() => rodarScript('nip-tema=%E0%A4%A')).not.toThrow()
    expect(rodarScript('nip-tema=%E0%A4%A')).toBe('marinho')
    expect(() =>
      rodarScript(() => {
        throw new Error('cookie bloqueado')
      }),
    ).not.toThrow()
  })

  it('o layout raiz usa o script e não lê cookie no servidor', () => {
    const fonte = readFileSync(fileURLToPath(new URL('../../../app/layout.tsx', import.meta.url)), 'utf8')
    expect(fonte).toContain('scriptDoTema()')
    expect(fonte).not.toContain('next/headers')
    expect(fonte).toContain('data-tema={TEMA_PADRAO}')
  })
})

describe('a cor da barra do sistema', () => {
  it('é o --fundo do Marinho: o valor do TS é o mesmo do CSS', async () => {
    const { FUNDO_DO_TEMA_PADRAO } = await import('../tema')
    const css = readFileSync(fileURLToPath(new URL('../../../ui/tokens.css', import.meta.url)), 'utf8')
    const marinho = css.slice(css.indexOf(":root[data-tema='marinho']"))
    const fundo = /--fundo:\s*(#[0-9a-fA-F]{6})/.exec(marinho.slice(0, marinho.indexOf('}')))?.[1]
    expect(fundo?.toLowerCase()).toBe(FUNDO_DO_TEMA_PADRAO)
    const layout = readFileSync(fileURLToPath(new URL('../../../app/layout.tsx', import.meta.url)), 'utf8')
    expect(layout).toContain('themeColor: FUNDO_DO_TEMA_PADRAO')
  })
})
