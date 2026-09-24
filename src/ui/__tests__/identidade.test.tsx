import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FotoJogador, LogoTime, iniciais } from '../midia'
import { identidadeDoTime, TIMES_NBA } from '../times'

/**
 * A IDENTIDADE DE APRESENTAÇÃO dos times e o rosto do jogador no v2.
 *
 * Herdeiro dos `identidade-time.test.ts`, `avatar.test.ts` e
 * `foto-jogador.test.ts` do design-system antigo (Tarefa 12 do front v2). O
 * que continua valendo com qualquer marcação: o catálogo cobre os 30 times com
 * marca local válida; sigla desconhecida não ganha nome nem logo inventado; a
 * logo é decorativa (o texto ao lado nomeia o time); e sem foto o jogador tem
 * um monograma, nunca um buraco nem uma imagem quebrada.
 */
describe('o catálogo dos times', () => {
  it('cobre os 30 times com marcas locais distintas e SVGs válidos', () => {
    expect(TIMES_NBA).toHaveLength(30)
    expect(new Set(TIMES_NBA.map((t) => t.nbaId)).size).toBe(30)
    expect(new Set(TIMES_NBA.map((t) => t.sigla)).size).toBe(30)
    for (const time of TIMES_NBA) {
      expect(time.logoUrl).toMatch(/^\/times\/[A-Z]{3}\.svg$/)
      const svg = readFileSync(join('public', time.logoUrl!), 'utf8')
      expect(svg).toMatch(/<svg\b/)
      expect(svg).toContain('viewBox=')
      // SVG local é marcação que o navegador executa: nada de script nem
      // referência externa dentro dele.
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
    expect(identidadeDoTime('ADV')).toEqual({ sigla: 'ADV', nome: 'ADV', nbaId: null, logoUrl: null })
    expect(identidadeDoTime(' ').nome).toBe('—')
    const html = renderToStaticMarkup(<LogoTime sigla="ADV" />)
    expect(html).not.toContain('<img')
    expect(html).toContain('>ADV</span>')
  })

  it('a logo é decoração: `alt` vazio, e quem nomeia o time é o texto ao lado', () => {
    const html = renderToStaticMarkup(<LogoTime sigla="LAL" />)
    expect(html).toContain('src="/times/LAL.svg"')
    expect(html).toContain('alt=""')
  })
})

describe('o rosto do jogador', () => {
  it('iniciais: primeira letra do primeiro e do último nome', () => {
    expect(iniciais('Luka Dončić')).toBe('LD')
    expect(iniciais('stephen curry')).toBe('SC')
    expect(iniciais('Jokic')).toBe('J')
    expect(iniciais('  Shai Gilgeous-Alexander ')).toBe('SG')
  })

  it('sem foto, e sem reserva curada, mostra o monograma — nunca <img> quebrada', () => {
    const html = renderToStaticMarkup(
      <FotoJogador nome="Jogador Sem Foto Nenhuma" fotoUrl={null} timeSigla="LAL" />,
    )
    expect(html).toContain('>JN<')
    expect(html).not.toMatch(/<img[^>]*headshots/)
  })
})
