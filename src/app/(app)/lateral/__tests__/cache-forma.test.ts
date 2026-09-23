import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * O CACHE DA LATERAL NUNCA RODA NOS TESTES: toda suíte de tela mocka
 * `next/cache`. Este teste fixa a FORMA — tag, revalidação e o perfil em
 * toda invalidação.
 *
 * POR QUE O SEGUNDO ARGUMENTO, E POR QUE 'max' (doc do Next 16.3.1 lida em
 * 19/09, `03-api-reference/04-functions/revalidateTag.md`):
 *
 *   - a forma de UM argumento expira na hora, mas está DEPRECADA — "may be
 *     removed in a future version";
 *   - `updateTag`, que a doc indica para expirar na hora, só pode ser chamada
 *     de Server Action: "It cannot be used in Route Handlers". Os crons são
 *     Route Handlers, e a própria doc manda usar `revalidateTag` neles;
 *   - sobra `revalidateTag(tag, 'max')`, que marca como obsoleto e serve o
 *     valor velho UMA vez enquanto busca o novo em segundo plano
 *     (stale-while-revalidate).
 *
 * Consequência aceita, e que a Identidade 05 já tinha escolhido em
 * `sincronizar-rodada`: depois do cron, a PRIMEIRA visita à lateral ainda vê
 * a noite anterior; da segunda em diante, a nova. É o que existe para um
 * Route Handler nesta versão — e é muito melhor que a hora inteira de
 * defasagem que havia sem invalidação nenhuma.
 */

/**
 * A fonte SEM comentários: uma chamada comentada não é uma chamada. Sem isto
 * o teste não morde — foi o defeito que a primeira versão do teste irmão
 * (`api/cron/__tests__/invalidacao-lateral`) deixou escapar.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('a forma do cache da lateral', () => {
  const leitura = readFileSync('src/app/(app)/lateral/leitura.ts', 'utf8')

  it('lerLateralCacheada é unstable_cache com a tag e uma hora', () => {
    expect(leitura).toContain("export const TAG_LATERAL = 'lateral'")
    expect(leitura).toMatch(/unstable_cache\(/)
    expect(leitura).toMatch(/\{ tags: \[TAG_LATERAL\], revalidate: 3600 \}/)
  })

  it('toda chamada de revalidateTag no app passa o perfil max', () => {
    const fontes: string[] = []
    const visitar = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') visitar(caminho)
        } else if (/\.tsx?$/.test(e.name)) fontes.push(caminho)
      }
    }
    visitar('src')

    const semPerfil: string[] = []
    for (const arquivo of fontes) {
      const fonte = semComentarios(readFileSync(arquivo, 'utf8'))
      // O grupo tolera UM nível de parênteses aninhado — `tagDoFeed(data)` como
      // primeiro argumento (W2-1) — sem isso o `[^)]*` antigo parava no `)`
      // de dentro e nunca via o `'max'` que vem depois.
      for (const chamada of fonte.matchAll(/revalidateTag\(((?:[^()]|\([^()]*\))*)\)/g)) {
        if (!/,\s*'max'\s*$/.test(chamada[1]!)) semPerfil.push(`${arquivo}: ${chamada[0]}`)
      }
    }
    expect(semPerfil).toEqual([])
  })
})
