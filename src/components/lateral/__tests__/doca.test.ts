import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A doca abre por INTENÇÃO, não por foco (correções UX 19/09, §4.10): quem
 * navega por Tab passa pela lateral sem abrir o painel, e ao recolher o foco
 * volta ao campo. O arnês não hidrata — a prova é de fonte, e o passo manual
 * do plano confirma na preview.
 */
describe('doca do assistente', () => {
  const fonte = readFileSync('src/components/lateral/DocaDoAssistente.tsx', 'utf8')

  it('não abre no foco', () => {
    expect(fonte).not.toContain('onFocus')
  })

  it('abre no clique, no Enter e na primeira tecla digitada', () => {
    expect(fonte).toContain('onClick={() => setAberta(true)}')
    expect(fonte).toContain('onKeyDown={aoTeclar}')
    expect(fonte).toContain("e.key === 'Enter' || e.key.length === 1")
  })

  it('ao recolher, o foco volta ao campo', () => {
    expect(fonte).toContain('campo.current?.focus()')
  })
})
