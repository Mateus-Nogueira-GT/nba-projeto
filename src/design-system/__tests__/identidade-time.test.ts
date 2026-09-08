import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { IdentidadeTime } from '../componentes/IdentidadeTime'
import { LogoTime } from '../componentes/LogoTime'
import { identidadeDoTime, TIMES_NBA } from '../times'

describe('identidade de apresentação dos times', () => {
  it('cobre os 30 times com marcas locais distintas e SVGs válidos', () => {
    expect(TIMES_NBA).toHaveLength(30)
    expect(new Set(TIMES_NBA.map((t) => t.nbaId)).size).toBe(30)
    expect(new Set(TIMES_NBA.map((t) => t.sigla)).size).toBe(30)
    for (const time of TIMES_NBA) {
      expect(time.logoUrl).toMatch(/^\/times\/[A-Z]{3}\.svg$/)
      const svg = readFileSync(join('public', time.logoUrl!), 'utf8')
      expect(svg).toMatch(/<svg\b/)
      expect(svg).toContain('viewBox=')
      expect(svg).not.toMatch(/<script\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']https?:/i)
    }
  })

  it('resolve a sigla do domínio sem recorrer à ingestão', () => {
    expect(identidadeDoTime(' nyk ')).toEqual({
      sigla: 'NYK',
      nome: 'New York Knicks',
      nbaId: 1610612752,
      logoUrl: '/times/NYK.svg',
    })
    expect(identidadeDoTime('PHI').nome).toBe('Philadelphia 76ers')
    expect(identidadeDoTime('POR').nome).toBe('Portland Trail Blazers')
  })

  it('sigla desconhecida não recebe nome nem logo inventado', () => {
    expect(identidadeDoTime('ADV')).toEqual({
      sigla: 'ADV',
      nome: 'ADV',
      nbaId: null,
      logoUrl: null,
    })
    const html = renderToStaticMarkup(createElement(IdentidadeTime, { sigla: 'ADV' }))
    expect(html).toContain('ADV')
    expect(html).not.toContain('<img')
    expect(identidadeDoTime(' ').nome).toBe('—')
  })

  it('exibe o nome completo em texto e usa o logo como decoração', () => {
    const html = renderToStaticMarkup(createElement(IdentidadeTime, { sigla: 'GSW' }))
    expect(html).toContain('Golden State Warriors')
    expect(html).toContain('src="/times/GSW.svg"')
    expect(html).toContain('alt=""')
    expect(html.match(/Golden State Warriors/g)).toHaveLength(1)
  })

  it('o logo usado sozinho tem o nome do time acessível', () => {
    const html = renderToStaticMarkup(createElement(LogoTime, { sigla: 'LAL' }))
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Los Angeles Lakers"')
    expect(html).toContain('src="/times/LAL.svg"')
  })

  it('o fallback sem marca permanece identificado quando usado sozinho', () => {
    const html = renderToStaticMarkup(createElement(LogoTime, { sigla: 'ADV' }))
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="ADV"')
    expect(html).toContain('>ADV</span>')
    expect(html).not.toContain('<img')
  })
})
