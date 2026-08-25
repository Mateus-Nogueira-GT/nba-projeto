import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { migracoesPendentes } from '../db/migracoes-pendentes'

const TAGS = ['0000_a', '0001_b', '0002_c']

describe('migracoesPendentes', () => {
  it('banco em dia não tem pendência', () => {
    expect(migracoesPendentes(TAGS, 3)).toEqual({ pendentes: [], bancoAdiantado: false })
  })

  it('nomeia exatamente o que falta — o caso do incidente de 25/08', () => {
    // O banco parou na 0000 e o deploy subiu com três: as duas do fim faltam.
    expect(migracoesPendentes(TAGS, 1).pendentes).toEqual(['0001_b', '0002_c'])
  })

  it('banco à frente do código é sinalizado, não confundido com "em dia"', () => {
    // Deploy revertido: o banco tem migração que este código nem conhece.
    expect(migracoesPendentes(TAGS, 5)).toEqual({ pendentes: [], bancoAdiantado: true })
  })

  it('banco vazio devolve todas', () => {
    expect(migracoesPendentes(TAGS, 0).pendentes).toEqual(TAGS)
  })
})

describe('o journal e o diretório não divergem', () => {
  it('toda tag do journal tem o .sql correspondente no disco', () => {
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: { tag: string }[]
    }
    const arquivos = new Set(
      readdirSync('drizzle')
        .filter((f) => f.endsWith('.sql'))
        .map((f) => f.replace(/\.sql$/, '')),
    )
    for (const { tag } of journal.entries) {
      expect(arquivos, `journal cita ${tag}, que não existe em drizzle/`).toContain(tag)
    }
  })
})
