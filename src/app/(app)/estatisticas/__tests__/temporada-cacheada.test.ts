import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * OS AGREGADOS DA TEMPORADA EM CACHE (auditoria de 23/09).
 *
 * Toda suíte de tela mocka `next/cache`, então o cache em si nunca roda nos
 * testes: este fixa a FORMA — tag, revalidação — e que as telas usam a
 * versão cacheada, como `lateral/__tests__/cache-forma` faz com a lateral.
 */
const semComentarios = (f: string) =>
  f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('agregados da temporada em cache', () => {
  it('as duas leituras são unstable_cache com a tag da lateral e uma hora', () => {
    const fonte = semComentarios(
      readFileSync('src/app/(app)/estatisticas/temporada-cacheada.ts', 'utf8'),
    )
    expect(fonte.match(/unstable_cache\(/g)).toHaveLength(2)
    expect(fonte.match(/\{ tags: \[TAG_LATERAL\], revalidate: 3600 \}/g)).toHaveLength(2)
  })

  it('as telas usam a versão cacheada', () => {
    for (const tela of [
      'src/app/(app)/estatisticas/page.tsx',
      'src/app/(app)/estatisticas/jogador/[id]/page.tsx',
      'src/app/(app)/estatisticas/time/[id]/page.tsx',
    ]) {
      const f = semComentarios(readFileSync(tela, 'utf8'))
      expect(f).toContain('temporadaParaExibirCacheada(')
      expect(f).not.toMatch(/[^a-zA-Z]temporadaParaExibir\(/)
    }
    const resultados = semComentarios(
      readFileSync('src/app/(app)/resultados/[data]/page.tsx', 'utf8'),
    )
    expect(resultados).toContain('taxaDaTemporadaCacheada(')
    expect(resultados).not.toMatch(/[^a-zA-Z]taxaDaTemporada\(/)
  })
})
