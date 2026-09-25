import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('script motor:retroativo', () => {
  const fonte = readFileSync('scripts/motor-retroativo.ts', 'utf8')
  it('recusa a temporada do calendário e intervalo que atravessa temporadas (regra de `temporadaDoIntervalo`)', () => {
    expect(fonte).toMatch(/temporadaDoIntervalo\(de, ate, calendario, agora\)/)
    expect(fonte).toMatch(/temporada do calendário/i)
  })
  it('exige --de e --ate e tem --dry-run', () => {
    expect(fonte).toMatch(/--de=/)
    expect(fonte).toMatch(/--ate=/)
    expect(fonte).toMatch(/--dry-run/)
  })
  it('não importa push nem fila', () => {
    expect(fonte).not.toMatch(/entrega\/(push|fila)/)
  })
  it('está no package.json', () => {
    expect(readFileSync('package.json', 'utf8')).toMatch(/"motor:retroativo": "vite-node scripts\/motor-retroativo\.ts"/)
  })
})
