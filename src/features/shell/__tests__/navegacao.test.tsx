import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BarraInferior, Sidebar } from '../Navegacao'
import { Painel } from '../Painel'
import { NAVEGACAO, secaoDoCaminho } from '../secoes'

/**
 * A NAVEGAÇÃO DO V2 — o que o `navegacao.test.ts` da moldura antiga garantia
 * e continua valendo com qualquer marcação (Tarefa 12 do front v2):
 *
 *  - a seção ativa é anunciada por `aria-current="page"`, e só UMA acende —
 *    a cor da pílula nunca é o único sinal;
 *  - rótulo em texto e ícone em SVG de traço, nunca emoji;
 *  - o assistente não é uma seção: é um botão, e só aparece quando a casca diz.
 *
 * O arnês não hidrata: `usePathname` é simulado e o que se prova é o HTML.
 */
let caminho = '/'
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>()
  return {
    ...real,
    usePathname: () => caminho,
    useRouter: () => ({ back: () => {}, push: () => {}, refresh: () => {} }),
  }
})

beforeEach(() => {
  caminho = '/'
})

/** Os `href` das âncoras acesas — a ordem dos atributos é do `<Link>`, não nossa. */
const acesos = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes('aria-current="page"'))
    .map((tag) => tag.match(/href="([^"]*)"/)?.[1])

describe('a barra inferior do celular', () => {
  it('quatro seções na barra, com rótulo escrito e ícone SVG — nada de emoji', () => {
    const html = renderToStaticMarkup(<BarraInferior admin={false} assistente={false} />)
    for (const item of NAVEGACAO.filter((i) => i.naBarra)) expect(html).toContain(item.rotuloCurto)
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/[📋🔥✅💰👤]/u)
  })

  it('a seção ativa leva aria-current, e uma só', () => {
    caminho = '/gestao'
    const html = renderToStaticMarkup(<BarraInferior admin={false} assistente={false} />)
    expect(acesos(html)).toEqual(['/gestao'])
  })

  it('o detalhe do apito acende Entradas: é a lista que ele detalha', () => {
    caminho = '/apito/00000000-0000-4000-8000-000000000001?atributo=PONTOS'
    expect(secaoDoCaminho(caminho)).toBe('entradas')
    const html = renderToStaticMarkup(<BarraInferior admin={false} assistente={false} />)
    expect(acesos(html)).toEqual(['/'])
  })

  it('Admin só entra na navegação para o papel ADMIN', () => {
    expect(renderToStaticMarkup(<BarraInferior admin={false} assistente={false} />)).not.toContain(
      'href="/admin"',
    )
    expect(renderToStaticMarkup(<BarraInferior admin={true} assistente={false} />)).toContain(
      'href="/admin"',
    )
  })
})

describe('o painel de detalhe (o apito aberto ao lado da Lista)', () => {
  it('(navegacao) a saída do detalhe é um botão com nome acessível — o ícone é decorativo', () => {
    // Herdado do "botão de voltar com nome acessível em TODA tela" do
    // `navegacao.test.ts` antigo: no v2 o detalhe do apito abre num painel, e
    // a volta é o "Fechar detalhe" (e o Esc). O painel se anuncia pelo rótulo.
    caminho = '/apito/00000000-0000-4000-8000-000000000001'
    const html = renderToStaticMarkup(
      <Painel modo="detalhe" rotulo="Detalhe do apito">
        <p>conteudo</p>
      </Painel>,
    )
    expect(html).toMatch(/<aside[^>]*aria-label="Detalhe do apito"/)
    expect(html).toMatch(/<button type="button"[^>]*aria-label="Fechar detalhe"[^>]*><svg[^>]*aria-hidden/)
  })

  it('fora da rota do apito o painel de detalhe não fica pendurado', () => {
    caminho = '/gestao'
    expect(
      renderToStaticMarkup(
        <Painel modo="detalhe" rotulo="Detalhe do apito">
          <p>conteudo</p>
        </Painel>,
      ),
    ).toBe('')
  })
})

describe('a sidebar do desktop', () => {
  it('a seção ativa leva aria-current, e uma só — inclusive no rodapé', () => {
    caminho = '/conta'
    const html = renderToStaticMarkup(<Sidebar admin={false} assistente={false} />)
    expect(acesos(html)).toEqual(['/conta'])
  })

  it('o Sixth Man AI é um BOTÃO, não uma seção, e só com `assistente`', () => {
    const sem = renderToStaticMarkup(<Sidebar admin={false} assistente={false} />)
    expect(sem).not.toContain('Sixth Man AI')
    const com = renderToStaticMarkup(<Sidebar admin={false} assistente={true} />)
    expect(com).toMatch(/<button[^>]*>[\s\S]*?Sixth Man AI/)
    expect(com).not.toMatch(/href="[^"]*"[^>]*>[^<]*Sixth Man AI/)
  })
})
