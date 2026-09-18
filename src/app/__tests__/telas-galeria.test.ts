import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { gravarConferencia } from './conferencia'

vi.mock('../(admin)/admin/guarda', () => ({ negarSeNaoForAdmin: async () => null }))

it('a galeria renderiza os estados da Identidade 04 para conferência visual', async () => {
  const { default: Galeria } = await import('../(admin)/admin/galeria/page')
  const html = renderToStaticMarkup(await Galeria())
  expect(html).toContain('AGUARDANDO OFICIAL')
  expect(html).toContain('LINHA 20+')
  expect(html).toContain('apitou aqui')
  expect(html).toContain('FIM 1º Q · congelada')
  expect(html).toContain('nº 1 LeBron James')
  expect(html).toContain('a última é a desta rodada')
  // Identidade 05: as peças do manual entram na galeria, e a tabela de
  // contraste ganha a coluna do branco sobre o preenchimento.
  expect(html).toContain('Identidade 05 · marca')
  expect(html).toContain('Acento · azul do manual')
  await gravarConferencia('galeria', html)
})
