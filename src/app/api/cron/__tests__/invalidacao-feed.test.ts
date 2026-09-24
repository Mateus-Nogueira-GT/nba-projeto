import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const ler = (p: string) => semComentarios(readFileSync(p, 'utf8'))

function rotas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : rotas(p)
    return n === 'route.ts' ? [p] : []
  })
}

describe('o feed em cache é invalidado por quem publica', () => {
  it('toda rota de cron que publica a Lista invalida a tag do feed', () => {
    const publicam = rotas('src/app/api/cron').filter((p) =>
      /publicarListaSecreta|simularAte/.test(ler(p)),
    )
    expect(publicam.length).toBeGreaterThanOrEqual(2)
    for (const p of publicam) {
      expect(ler(p), p).toMatch(/revalidateTag\((TAG_FEED|tagDoFeed\([^)]*\)), 'max'\)/)
    }
  })

  it('as telas leem o feed pelo cache, nunca por lerFeed/linhasDoJogador direto', () => {
    // Front v2 (Tarefa 3): a Lista e o detalhe do apito leem nas `carregar.ts`
    // de `src/features`, e a coluna da Lista (turbos do dia) no resumo. O Ao
    // Vivo (Tarefa 4) lê a Lista do dia em `features/ao-vivo/carregar.ts`.
    for (const p of [
      'src/features/lista/carregar.ts',
      'src/features/lista/ResumoDaRodada.tsx',
      'src/features/apito/carregar.ts',
      'src/features/ao-vivo/carregar.ts',
      // Resultados (Tarefa 6): o carregador do v2.
      'src/features/resultados/carregar.ts',
    ]) {
      const fonte = ler(p)
      expect(fonte, p).toContain('lerFeedCacheado(')
      expect(fonte, p).not.toMatch(/[^a-zA-Z]lerFeed\(/)
      expect(fonte, p).not.toMatch(/[^a-zA-Z]linhasDoJogador\(/)
    }
  })
})
