import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A ABERTURA e o cerco do portão (spec 20/09).
 *
 * `/abrir` decide entre Ao Vivo e Lista; o teste de fonte abaixo garante que
 * nenhuma tela nova escape do guarda sem alguém ter decidido isso.
 *
 * Front v2 (Tarefa 7): `/abrir` saiu da casca `(app)` para a raiz de `app/`
 * (só redireciona; a casca consultaria sessão e acesso à toa). O comportamento
 * — jogo no 1º quarto → Ao Vivo, senão Lista — é provado com banco em
 * `src/features/metodologia/__tests__/fumaca.test.tsx`.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('a abertura do app', () => {
  it('decide pelo 1º quarto, e não checa sessão — as telas de destino já têm portão', () => {
    const fonte = semComentarios(readFileSync('src/app/abrir/page.tsx', 'utf8'))
    expect(fonte).toContain("=== 'Q1'")
    expect(fonte).toContain("if (temJogoNoPrimeiroQuarto) redirect('/fire-live')")
    expect(fonte).toContain("redirect('/')")
    expect(fonte).not.toContain('exigirNivel')
  })

  it('no hiato entre temporadas abre em Estatísticas — a única aba com conteúdo', () => {
    // Sem isto, o app abre num vazio de ~32 dias entre o lançamento e a volta
    // da NBA: não há apito retroativo (decisão do parceiro, 22/09).
    const fonte = semComentarios(readFileSync('src/app/abrir/page.tsx', 'utf8'))
    expect(fonte).toContain('emHiato')
    expect(fonte).toContain("redirect('/estatisticas')")
  })

  it('o PWA e o login apontam para ela', () => {
    expect(readFileSync('src/app/manifest.ts', 'utf8')).toContain("start_url: '/abrir'")
    // Front v2 (Tarefa 8): a ação de login mora em `features/publico/acoes.ts`.
    const acoes = readFileSync('src/features/publico/acoes.ts', 'utf8')
    expect(acoes).toContain("?? '/abrir'")
  })

  it('/abrir está na allowlist de destino — senão o login cairia em / em silêncio', () => {
    const fonte = readFileSync('src/modules/plataforma/auth/requisicao.ts', 'utf8')
    expect(fonte).toMatch(/DESTINOS_POS_LOGIN[^)]*'\/abrir'/)
  })
})

describe('toda tela de (app) passa pelo portão, ou está na lista curta de exceções', () => {
  /**
   * As exceções são de quem ainda não entrou, está entrando, ou é a própria
   * metodologia — barrá-las faria laço ou trancaria a porta por fora.
   * `/como-funciona` é a MESMA leitura sem o aceite: barrá-la seria barrar
   * justamente o texto que se quer que a pessoa leia. `/abrir` só redireciona.
   */
  const EXCECOES = new Set([
    'metodologia',
    'entrar',
    'cadastrar',
    'redefinir',
    'como-funciona',
    'retorno',
  ])

  /**
   * Rota que só REDIRECIONA não precisa de portão: quem tem é o destino dela.
   * É o caso de `/abrir` e de `/resultados`, que é um atalho para a última
   * rodada conferida. Reconhecer a categoria, em vez de nomear uma a uma, faz
   * o próximo atalho não tropeçar aqui — e faz uma TELA nova tropeçar, que é o
   * ponto do teste.
   */
  const soRedireciona = (fonte: string) =>
    !fonte.includes('<Moldura') && !fonte.includes('<MolduraConta') && fonte.includes('redirect(')

  function telas(dir: string, prefixo = ''): { rota: string; caminho: string }[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const caminho = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === '__tests__') return []
        return telas(caminho, prefixo === '' ? e.name : prefixo)
      }
      return e.name === 'page.tsx' ? [{ rota: prefixo, caminho }] : []
    })
  }

  const paginas = telas('src/app/(app)')

  it('encontrou as telas', () => {
    expect(paginas.length).toBeGreaterThan(10)
  })

  /**
   * Front v2: a página só monta a tela, e o portão mora no carregador da área
   * (`features/lista/carregar.ts`, `features/apito/carregar.ts`…) ou no
   * componente de servidor que a página desenha (o resumo do `@painel`). Vale
   * o guarda de um módulo de `@/features` que a página IMPORTA E USA — chama
   * como função ou desenha como componente. Importar sem usar não conta.
   */
  function guardaPorFeature(fonte: string): boolean {
    for (const m of fonte.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/features\/([^']+)'/g)) {
      const base = join('src/features', m[2]!)
      const candidatos = [`${base}.ts`, `${base}.tsx`]
      const modulo = candidatos.map((c) => {
        try {
          return semComentarios(readFileSync(c, 'utf8'))
        } catch {
          return ''
        }
      }).join('\n')
      if (!modulo.includes('exigirNivel(')) continue
      const nomes = m[1]!.split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!).filter(Boolean)
      const usados = nomes.filter(
        (n) => new RegExp(`\\b${n}\\(`).test(fonte) || fonte.includes(`<${n}`),
      )
      // O nome usado precisa ser o que chama o guarda: o corpo da função vai
      // da sua declaração até a próxima declaração de topo do módulo.
      const corpoDe = (n: string) => {
        const inicio = modulo.search(new RegExp(`function ${n}\\b`))
        if (inicio < 0) return ''
        const resto = modulo.slice(inicio + 1)
        const fim = resto.search(/\n(export |function |const |type )/)
        return fim < 0 ? resto : resto.slice(0, fim)
      }
      if (usados.some((n) => corpoDe(n).includes('exigirNivel('))) return true
    }
    return false
  }

  /**
   * O painel tem guarda PRÓPRIA: `exigirAdmin()` / `negarSeNaoForAdmin()`
   * (`features/admin/guarda`), que exige sessão E papel ADMIN — mais estrito
   * que `exigirNivel`. Conta a CHAMADA com `await`, não o import: uma guarda
   * importada e esquecida passaria batida. `features/admin/__tests__/portao.test.ts`
   * prova o resto (guarda antes do `getDb()`, toda server action).
   */
  const guardaDoAdmin = (fonte: string) => /await (exigirAdmin|negarSeNaoForAdmin)\(\)/.test(fonte)

  it.each(paginas)('$rota', ({ rota, caminho }) => {
    if (EXCECOES.has(rota)) return
    const fonte = semComentarios(readFileSync(caminho, 'utf8'))
    if (soRedireciona(fonte)) return
    expect(
      fonte.includes('exigirNivel') || guardaPorFeature(fonte) || guardaDoAdmin(fonte),
      `${caminho} não passa pelo guarda e não está nas exceções nomeadas`,
    ).toBe(true)
  })
})
