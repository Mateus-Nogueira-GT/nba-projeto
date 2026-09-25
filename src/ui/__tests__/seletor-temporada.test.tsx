import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SeletorTemporada } from '../SeletorTemporada'

describe('SeletorTemporada', () => {
  const html = renderToStaticMarkup(
    <SeletorTemporada temporadas={['2025-26', '2026-27']} atual="2025-26" hrefDe={(t) => `/resultados?temporada=${t}`} />,
  )
  it('um link por temporada, a atual anunciada', () => {
    expect(html).toContain('href="/resultados?temporada=2026-27"')
    expect(html).toMatch(/aria-current="(page|true)"[^>]*>[^<]*2025-26|2025-26[\s\S]*aria-current/)
  })
  it('com uma temporada só, não desenha nada', () => {
    expect(renderToStaticMarkup(<SeletorTemporada temporadas={['2026-27']} atual="2026-27" hrefDe={(t) => t} />)).toBe('')
  })
})
