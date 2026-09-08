import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CabecalhoJogo, type CabecalhoJogoProps } from '../componentes/CabecalhoJogo'
import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

// Instante FIXO: 22:30 UTC é 19:30 em Brasília. Sem hora fixa o teste de fuso
// passaria ou falharia conforme a máquina em que a suíte roda.
const HORARIO = new Date('2026-01-15T22:30:00.000Z')

const base: CabecalhoJogoProps = {
  casaSigla: 'IND',
  visitanteSigla: 'MIA',
  horarioUtc: HORARIO,
  fuso: 'America/Sao_Paulo',
  status: 'AGENDADO',
}

const render = (props: CabecalhoJogoProps) =>
  renderToStaticMarkup(createElement(CabecalhoJogo, props))

describe('CabecalhoJogo — a única fronteira de seção da varredura', () => {
  it('escreve visitante @ mandante, nessa ordem, com a sigla em Anton e sem escudo', () => {
    const html = render(base)
    const visitante = html.indexOf('MIA')
    const arroba = html.indexOf('@')
    const casa = html.indexOf('IND')
    expect(visitante).toBeGreaterThan(-1)
    expect(visitante).toBeLessThan(arroba)
    expect(arroba).toBeLessThan(casa)
    expect(html).toContain('var(--fonte-anton)')
    expect(html).not.toContain('<img')
  })

  it('horário no fuso pedido, nunca no do servidor', () => {
    expect(render(base)).toContain('19:30')
    expect(render({ ...base, fuso: 'UTC' })).toContain('22:30')
  })

  it('ao vivo: ponto + o texto redundante "AO VIVO" com o quarto; nada pulsa continuamente', () => {
    const html = render({ ...base, status: 'AO_VIVO' })
    expect(html).toContain('1º Q · AO VIVO')
    expect(html).toContain(`background:${semantico.vivoSelo}`)
    expect(html).not.toContain('19:30')
    expect(html).not.toContain('ponto-ao-vivo')
    expect(render({ ...base, status: 'AO_VIVO', quartoAtual: 3 })).toContain('3º Q · AO VIVO')
  })

  it('encerrado diz ENCERRADO — nunca finge ao vivo nem mostra horário', () => {
    const html = render({ ...base, status: 'ENCERRADO' })
    expect(html).toContain('ENCERRADO')
    expect(html).not.toContain('AO VIVO')
    expect(html).not.toContain('19:30')
  })

  it('quente e ao vivo: placar visitante · casa em Anton 24 entre as siglas, no gradiente quente', () => {
    const html = render({
      ...base,
      status: 'AO_VIVO',
      temperatura: 'quente',
      placarCasa: 33,
      placarVisitante: 48,
    })
    expect(html).toContain('48 · 33')
    expect(html.indexOf('MIA')).toBeLessThan(html.indexOf('48 · 33'))
    expect(html.indexOf('48 · 33')).toBeLessThan(html.indexOf('IND'))
    expect(html).toContain('font-size:24px')
    expect(html).toContain(componente.cabecalhoJogo.fundoQuente)
    expect(html).toContain('1º Q · AO VIVO')
  })

  it('quente e agendado é o cabeçalho MUDO: horário no centro, "aguardando o 1º Q", opacidade menor', () => {
    const html = render({ ...base, temperatura: 'quente' })
    expect(html).toContain('19:30')
    expect(html).toContain('AGUARDANDO O 1º Q')
    expect(html).toContain('opacity:0.7')
    expect(html).not.toContain(componente.cabecalhoJogo.fundoQuente)
  })

  it('o recorte do Fire Live congela no fim do Q1 sem mudar o status nas outras telas', () => {
    const props: CabecalhoJogoProps = {
      ...base,
      status: 'AO_VIVO',
      quartoAtual: 2,
      primeiroQuartoEncerrado: true,
      placarCasa: 27,
      placarVisitante: 31,
    }
    const quente = render({ ...props, temperatura: 'quente' })
    expect(quente).toContain('31 · 27')
    expect(quente).toContain('FIM 1º Q')
    expect(quente).not.toContain('AO VIVO')
    expect(render(props)).toContain('2º Q · AO VIVO')
    expect(
      render({ ...props, temperatura: 'quente', placarCasa: null, placarVisitante: null }),
    ).not.toContain('31 · 27')
  })

  it('frio não veste o universo quente', () => {
    const html = render({ ...base, status: 'AO_VIVO', placarCasa: 33, placarVisitante: 48 })
    expect(html).not.toContain(componente.cabecalhoJogo.fundoQuente)
    expect(html).not.toContain(componente.cabecalhoJogo.bordaQuente)
  })

  it('nunca escreve "probabilidade"', () => {
    const todos = [
      render(base),
      render({ ...base, status: 'AO_VIVO' }),
      render({ ...base, status: 'ENCERRADO' }),
      render({
        ...base,
        status: 'AO_VIVO',
        temperatura: 'quente',
        placarCasa: 1,
        placarVisitante: 2,
      }),
    ].join('\n')
    expect(todos.toLowerCase()).not.toContain('probabilidade')
  })
})

/**
 * O CABEÇALHO DA NOITE ENCERRADA — identidade 04, §4.4.
 *
 * Nos Resultados o cabeçalho de jogo deixa de ser só a fronteira de seção e
 * passa a ser o resultado: placar final com o vencedor em destaque e a quebra
 * por quarto à direita. Tudo por prop opcional — quem não passa placar nem
 * quartos continua vendo o cabeçalho de sempre.
 */
describe('CabecalhoJogo · a noite encerrada (identidade 04)', () => {
  const encerrado = {
    ...base,
    status: 'ENCERRADO' as const,
    placarCasa: 93,
    placarVisitante: 117,
  }
  /** A cor com que o cabeçalho escreveu aquele número. */
  const corDe = (html: string, numero: number) =>
    html.match(new RegExp(`color:([^"]+)">${numero}<`))?.[1]

  it('placar final: o vencedor em texto100, o perdedor em texto55, em Anton 22', () => {
    const html = render(encerrado)
    expect(corDe(html, 117)).toBe(semantico.texto100)
    expect(corDe(html, 93)).toBe(semantico.texto55)
    expect(html).toContain('font-size:22px')
    // a ordem da varredura não muda: visitante à esquerda, mandante à direita
    expect(html.indexOf('MIA')).toBeLessThan(html.indexOf('117'))
    expect(html.indexOf('117')).toBeLessThan(html.indexOf('93'))
    expect(html.indexOf('93')).toBeLessThan(html.indexOf('IND'))
  })

  it('a quebra por quarto sai em duas linhas: visitante em cima, mandante embaixo', () => {
    const html = render({
      ...encerrado,
      quartosVisitante: [30, 28, 29, 30],
      quartosCasa: [24, 22, 23, 24],
    })
    expect(html).toContain('30 · 28 · 29 · 30')
    expect(html).toContain('24 · 22 · 23 · 24')
    expect(html.indexOf('30 · 28 · 29 · 30')).toBeLessThan(html.indexOf('24 · 22 · 23 · 24'))
    expect(html).toContain(semantico.texto40)
    expect(html).toContain('font-size:10px')
    // cor não é canal único: o leitor de tela ouve de quem é cada linha
    expect(html).toContain('aria-label="Pontos por quarto')
  })

  it('sem os quartos, o encerrado continua dizendo ENCERRADO por escrito', () => {
    expect(render(encerrado)).toContain('ENCERRADO')
  })

  it('nada muda para quem não passa placar: o agendado é o de sempre', () => {
    expect(render(base)).toContain('19:30')
    expect(render(base)).not.toContain('font-size:22px')
  })
})

/**
 * ALINHAMENTO — o artboard de Resultados usa `align-items:center`; o da Lista
 * Secreta, `baseline`. A diferença tem causa: só nos Resultados o lado direito
 * tem DUAS linhas (a quebra por quarto), e alinhar pela primeira deixaria o
 * bloco pendurado abaixo do placar. O cabeçalho decide pelo que está mostrando.
 */
describe('CabecalhoJogo · o alinhamento segue o conteúdo do lado direito', () => {
  const encerrado = { ...base, status: 'ENCERRADO' as const, placarCasa: 93, placarVisitante: 117 }

  it('com a quebra por quarto o bloco centra; sem ela, a linha única segue na baseline', () => {
    const comQuartos = render({
      ...encerrado,
      quartosVisitante: [30, 28, 29, 30],
      quartosCasa: [24, 22, 23, 24],
    })
    // O trecho inteiro do bloco EXTERNO: o interno (o placar) é sempre baseline.
    expect(comQuartos).toContain(
      'align-items:center;justify-content:space-between;gap:10px;margin:24px 0 10px',
    )

    const semQuartos = render(base)
    expect(semQuartos).toContain(
      'align-items:baseline;justify-content:space-between;gap:10px;margin:22px 0 10px',
    )
  })
})
