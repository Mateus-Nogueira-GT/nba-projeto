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
