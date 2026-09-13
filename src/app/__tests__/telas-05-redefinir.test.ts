import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * TELAS DE REDEFINIÇÃO DE SENHA (Task 7).
 *
 * Sem banco: nem a tela do token nem a de "esqueci a senha" tocam o banco no
 * render — só o `<form action={concluir}>` toca, e isso só acontece quando
 * alguém de fato o submete, não quando o componente de servidor é renderizado
 * aqui. O que importa travar: o formulário existe com os campos certos, e o
 * token NUNCA aparece como texto visível na página (só como valor do campo
 * oculto) — um "ver código-fonte" ou um print de tela não pode vazá-lo.
 */

describe('telas de redefinição de senha', () => {
  it('a página do token tem o formulário e nunca mostra o token em texto', async () => {
    const { default: Pagina } = await import('../redefinir/[token]/page')
    const html = renderToStaticMarkup(
      await Pagina({ params: Promise.resolve({ token: 'abc' }), searchParams: Promise.resolve({}) }),
    )
    expect(html).toContain('name="novaSenha"')
    // Minúsculo de propósito: esta versão do React preserva o `minLength` da
    // JSX no atributo (mesmo achado de `telas-05-conta.test.ts`) — o teste
    // não deve travar em qual casing o renderer escolhe.
    expect(html.toLowerCase()).toContain('minlength="12"')
    expect(html).toContain('type="hidden" name="token"')
    expect(html).not.toMatch(/>abc</)
  })

  // ACHADO 4 DA REVISÃO FINAL: `acoes.ts` redirecionava com a frase por
  // extenso em `?erro=` — mesma correção de `conta/`. `r.motivo` (o código)
  // é um conjunto fechado que `concluirRedefinicao` decide, então o teste
  // cobre tanto um código de verdade quanto um texto forjado na URL.
  it('?erro= passa por dicionário: código conhecido vira texto em português, texto forjado não aparece', async () => {
    const { default: Pagina } = await import('../redefinir/[token]/page')
    const comCodigoConhecido = renderToStaticMarkup(
      await Pagina({
        params: Promise.resolve({ token: 'abc' }),
        searchParams: Promise.resolve({ erro: 'expirada' }),
      }),
    )
    expect(comCodigoConhecido).toContain('Link expirado.')

    const fraseDoAtacante = 'sua conta foi comprometida, ligue agora para 0800-000-000'
    const comTextoForjado = renderToStaticMarkup(
      await Pagina({
        params: Promise.resolve({ token: 'abc' }),
        searchParams: Promise.resolve({ erro: fraseDoAtacante }),
      }),
    )
    expect(comTextoForjado).not.toContain(fraseDoAtacante)
  })

  // ACHADO 6 DA REVISÃO FINAL: o token viaja no PATH (`/redefinir/[token]`).
  // Uso único e validade de uma hora limitam a janela; o vetor que sobra — o
  // `Referer` para um destino externo — fecha com este cabeçalho (decisão
  // registrada na spec, §5.3). Mesmo padrão de `pwa.test.ts` para o cabeçalho
  // do `/sw.js`: ler `next.config.ts` como texto, não executar o config.
  it('a rota do token manda Referrer-Policy: no-referrer, para o Referer não vazar para fora', () => {
    const configuracao = readFileSync('next.config.ts', 'utf8')
    expect(configuracao).toContain("source: '/redefinir/:token'")
    expect(configuracao).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
  })

  it('a tela de entrar leva ao "esqueci a senha", e ela explica que o link vem do admin', async () => {
    const { default: Entrar } = await import('../(app)/entrar/page')
    expect(renderToStaticMarkup(await Entrar({ searchParams: Promise.resolve({}) }))).toContain(
      'href="/redefinir"',
    )

    const { default: Esqueci } = await import('../redefinir/page')
    expect(renderToStaticMarkup(await Esqueci()).toLowerCase()).toContain('uma hora')
  })
})
