import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * O MATCHUP EM CACHE (debug de 07/10). O painel do apito recalculava os
 * perfis dos 30 times — uma varredura de `estatisticas_time_jogo` da
 * temporada — a cada abertura. O perfil só muda quando um jogo ENCERRA, e a
 * chave é (data do jogo, início da temporada): uma hora de cache basta. Toda
 * suíte de tela mocka `next/cache`; este teste fixa a FORMA.
 */
const semComentarios = (f: string) =>
  f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('matchup em cache', () => {
  const fonte = semComentarios(readFileSync('src/app/_cache/matchup.ts', 'utf8'))

  it('perfisDoDiaCacheado é unstable_cache com a tag do matchup e uma hora', () => {
    expect(fonte).toContain("export const TAG_MATCHUP = 'matchup'")
    expect(fonte).toMatch(/export const perfisDoDiaCacheado = unstable_cache\(/)
    expect(fonte).toMatch(/\{ tags: \[TAG_MATCHUP\], revalidate: 3600 \}/)
  })

  it('o painel do apito lê os perfis pelo cache, dentro do Promise.all', () => {
    const tela = semComentarios(readFileSync('src/features/apito/carregar.ts', 'utf8'))
    expect(tela).toContain('perfisDoDiaCacheado(')
    expect(tela).not.toMatch(/\bperfilDoAdversario\(/)
    expect(tela).not.toMatch(/\bperfisDoDia\(/)
    // Nenhum `await` solto do matchup depois do Promise.all: ele corre junto.
    const depois = tela.slice(tela.indexOf('await Promise.all('))
    expect(depois).not.toMatch(/await perfisDoDiaCacheado\(/)
  })
})
