import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A ABERTURA e o cerco do portão (spec 20/09).
 *
 * `/abrir` decide entre Ao Vivo e Lista; o teste de fonte abaixo garante que
 * nenhuma tela nova escape do guarda sem alguém ter decidido isso.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('a abertura do app', () => {
  it('decide pelo 1º quarto, e não checa sessão — as telas de destino já têm portão', () => {
    const fonte = semComentarios(readFileSync('src/app/(app)/abrir/page.tsx', 'utf8'))
    expect(fonte).toContain("=== 'Q1'")
    expect(fonte).toContain("redirect(temJogoNoPrimeiroQuarto ? '/fire-live' : '/')")
    expect(fonte).not.toContain('exigirNivel')
  })

  it('o PWA e o login apontam para ela', () => {
    expect(readFileSync('src/app/manifest.ts', 'utf8')).toContain("start_url: '/abrir'")
    const acoes = readFileSync('src/app/(app)/entrar/acoes.ts', 'utf8')
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

  it.each(paginas)('$rota', ({ rota, caminho }) => {
    if (EXCECOES.has(rota)) return
    const fonte = semComentarios(readFileSync(caminho, 'utf8'))
    if (soRedireciona(fonte)) return
    expect(
      fonte.includes('exigirNivel'),
      `${caminho} não passa pelo guarda e não está nas exceções nomeadas`,
    ).toBe(true)
  })
})
