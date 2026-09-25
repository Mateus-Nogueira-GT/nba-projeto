import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : arquivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

const PROIBIDOS = [
  'src/features/landing', 'src/features/ao-vivo', 'src/app/(publico)/placar', 'src/app/(publico)/conheca',
  'src/app/_cache/placar.ts', 'src/app/_cache/landing.ts', 'src/modules/entrega/push', 'src/modules/entrega/fila',
  'src/modules/entrega/fire-live', 'src/app/api/cron',
]

describe('a temporada anterior não vaza para o que é público ou publica', () => {
  for (const alvo of PROIBIDOS) {
    it(alvo, () => {
      const lista = statSync(alvo).isDirectory() ? arquivos(alvo) : [alvo]
      for (const f of lista) {
        const fonte = readFileSync(f, 'utf8')
        expect(fonte, f).not.toMatch(/apitos_retroativos|greens_retroativos|feed_retroativo|apitosRetroativos|greensRetroativos|feedRetroativo|entrega\/retroativo|taxaRetroativaCacheada|temporadasDaTelaCacheadas|_cache\/retroativo|datasRetroativasCacheadas|feedRetroativoCacheado|temporadaAnteriorComDados/)
      }
    })
  }
})
