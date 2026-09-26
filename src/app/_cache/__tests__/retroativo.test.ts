import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A TEMPORADA ANTERIOR EM CACHE (revisão final de 25/09).
 *
 * No hiato ela é o padrão de Resultados e da Lista: sem cache, toda visita
 * pagava o UNION das datas retroativas. Toda suíte de tela mocka
 * `next/cache`, então o cache em si nunca roda nos testes — este fixa a
 * FORMA (tag e revalidate em todo leitor) e que as telas só chegam às datas
 * e à Lista retroativas pelo caminho cacheado.
 */
const semComentarios = (f: string) =>
  f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('temporada anterior em cache', () => {
  const fonte = semComentarios(readFileSync('src/app/_cache/retroativo.ts', 'utf8'))

  it('todo unstable_cache do arquivo tem a tag do retroativo e revalidate', () => {
    expect(fonte).toContain("export const TAG_RETROATIVO = 'retroativo'")
    const chamadas = fonte.match(/unstable_cache\(/g) ?? []
    const comTagERevalidate = fonte.match(/\{ tags: \[TAG_RETROATIVO\], revalidate: REVALIDAR_RETROATIVO \}/g) ?? []
    expect(chamadas.length).toBeGreaterThan(0)
    expect(comTagERevalidate).toHaveLength(chamadas.length)
    expect(fonte).toMatch(/const REVALIDAR_RETROATIVO = \d+/)
    const nomeados = [...fonte.matchAll(/export const (\w+) = unstable_cache\(/g)].map((m) => m[1])
    expect(nomeados).toEqual(['datasRetroativasCacheadas', 'feedRetroativoCacheado'])
    // Um `getDb()` por leitor cacheado — nenhum solto.
    expect(fonte.match(/getDb\(/g) ?? []).toHaveLength(chamadas.length)
  })

  it('as telas leem datas e Lista retroativas só pelo cache', () => {
    for (const arquivo of [
      'src/features/resultados/carregar.ts',
      'src/features/lista/carregar.ts',
      'src/features/estatisticas/temporada.ts',
    ]) {
      const tela = semComentarios(readFileSync(arquivo, 'utf8'))
      expect(tela, arquivo).not.toMatch(/\bdatasRetroativas\(/)
      expect(tela, arquivo).not.toMatch(/\bfeedRetroativoDoDia\(/)
      expect(tela, arquivo).toMatch(/from '@\/app\/_cache\/retroativo'/)
    }
  })

  it('o runbook diz ao operador como a tela vê o dado novo depois do script', () => {
    const runbook = readFileSync('docs/runbooks/temporada-retroativa.md', 'utf8')
    const segundos = /const REVALIDAR_RETROATIVO = (\d+)/.exec(fonte)![1]!
    expect(runbook).toContain('REVALIDAR_RETROATIVO')
    expect(runbook).toContain(`${Number(segundos) / 60} minutos`)
  })
})
