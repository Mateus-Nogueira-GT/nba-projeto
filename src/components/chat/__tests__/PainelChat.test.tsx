import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { mensagemDeErro, PainelChat, turnosDaConversa } from '../PainelChat'

describe('os erros do chat falam a língua de quem perguntou', () => {
  it('cada motivo da rota vira uma frase, nenhuma delas técnica', () => {
    for (const motivo of [
      'cota-esgotada',
      'limite-por-minuto',
      'muito-longa',
      'vazio',
      'sem-sessao',
      'desabilitado',
      'indisponivel',
    ]) {
      const frase = mensagemDeErro(motivo)
      expect(frase.length).toBeGreaterThan(0)
      expect(frase).not.toContain(motivo)
      expect(frase).not.toMatch(/erro|falha|500|undefined/i)
    }
  })

  it('motivo desconhecido não vaza código na tela', () => {
    expect(mensagemDeErro('coisa-que-nao-existe')).toBe(mensagemDeErro('indisponivel'))
  })

  it('a cota esgotada diz que amanhã recomeça, em vez de só negar', () => {
    expect(mensagemDeErro('cota-esgotada').toLowerCase()).toContain('amanhã')
  })
})

describe('a estrutura do painel', () => {
  it('é um diálogo rotulado, com caixa de texto e botão de fechar', () => {
    const html = renderToStaticMarkup(<PainelChat aoFechar={() => {}} />)
    expect(html).toMatch(/role="dialog"/)
    expect(html).toContain('aria-label="Assistente NIP"')
    expect(html).toContain('<textarea')
    expect(html).toContain('aria-label="Fechar o assistente"')
  })
})

describe('a conversa do dia entra no painel', () => {
  it('as mensagens da rota viram turnos, pergunta como "eu" e resposta como "assistente"', () => {
    const turnos = turnosDaConversa([
      { papel: 'USUARIO', texto: 'o que é o Fire Live?' },
      { papel: 'ASSISTENTE', texto: 'É a leitura do primeiro quarto.' },
    ])
    expect(turnos).toEqual([
      { de: 'eu', texto: 'o que é o Fire Live?' },
      { de: 'assistente', texto: 'É a leitura do primeiro quarto.' },
    ])
  })
})
