import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { TRAVA } from '../../dominio/db/travas'

/**
 * TRAVAS DE NEGÓCIO COM NAMESPACE (minor da revisão final, §8).
 *
 * `pg_advisory_xact_lock(hashtext(x))` põe todas as famílias de trava no mesmo
 * espaço de 32 bits: o hash de um endpoint de push pode coincidir com o de um
 * visitante de afiliado, e uma operação passa a esperar a outra sem motivo. A
 * forma de duas chaves — `(namespace, hashtext(x))` — separa as famílias; os
 * namespaces moram numa constante única para não se repetirem.
 */

const RAIZ = 'src/modules'

function arquivosDeProducao(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      return nome === '__tests__' ? [] : arquivosDeProducao(caminho)
    }
    return /\.tsx?$/.test(nome) ? [caminho] : []
  })
}

describe('travas de advisory', () => {
  const fontes = arquivosDeProducao(RAIZ).map((caminho) => ({
    caminho,
    texto: readFileSync(caminho, 'utf8'),
  }))

  it('nenhuma trava de um argumento só sobra em src/modules', () => {
    const umArgumento = /pg_advisory_(?:xact_)?lock\(\s*hashtext\(/
    const achados = fontes.filter((f) => umArgumento.test(f.texto)).map((f) => f.caminho)
    expect(achados).toEqual([])
  })

  it('toda trava de duas chaves usa um namespace de TRAVA', () => {
    const chamadas = fontes.flatMap((f) =>
      [...f.texto.matchAll(/pg_advisory_(?:xact_)?lock\(([^,)]*),/g)].map((m) => ({
        caminho: f.caminho,
        primeiro: m[1]!.trim(),
      })),
    )
    expect(chamadas.length).toBeGreaterThan(0)
    for (const c of chamadas) expect(c.primeiro, c.caminho).toMatch(/^\$\{TRAVA\.[A-Z_]+\}$/)
  })

  it('os namespaces não se repetem', () => {
    const valores = Object.values(TRAVA)
    expect(new Set(valores).size).toBe(valores.length)
  })
})
