import { describe, expect, it } from 'vitest'

import {
  abaDoJogador,
  comAba,
  comFiltro,
  comLente,
  comOrdem,
  comQuantidade,
  estadoDaUrl,
  lerEstadoDaLista,
  rotaDaLista,
  type Recorte,
} from '../lista-secreta-rotas'

const RECORTE_CHEIO: Recorte = {
  quantidade: 5,
  metodo: 'OPD',
  nivel: 'MVP',
  time: 'LAL',
  posicao: 'G',
  atributo: 'PONTOS',
}

describe('rotas dos filtros da Lista Secreta', () => {
  it('trocar a QUANTIDADE preserva os outros cinco recortes', () => {
    // A regressão: os chips de quantidade montavam `/?quantidade=N` seco e
    // varriam método, nível, time, posição e atributo do usuário.
    const url = comQuantidade(RECORTE_CHEIO, 2)
    const p = new URLSearchParams(url.split('?')[1])
    expect(p.get('quantidade')).toBe('2')
    expect(p.get('metodo')).toBe('OPD')
    expect(p.get('nivel')).toBe('MVP')
    expect(p.get('time')).toBe('LAL')
    expect(p.get('posicao')).toBe('G')
    expect(p.get('atributo')).toBe('PONTOS')
  })

  it('"Lista inteira" apaga só a quantidade, não o recorte', () => {
    const p = new URLSearchParams(comQuantidade(RECORTE_CHEIO, 0).split('?')[1])
    expect(p.has('quantidade')).toBe(false)
    expect(p.get('metodo')).toBe('OPD')
    expect(p.get('atributo')).toBe('PONTOS')
  })

  it('o chip "Todos" de um campo não derruba a quantidade escolhida', () => {
    const p = new URLSearchParams(comFiltro(RECORTE_CHEIO, 'nivel', undefined).split('?')[1])
    expect(p.has('nivel')).toBe(false)
    expect(p.get('quantidade')).toBe('5')
    expect(p.get('metodo')).toBe('OPD')
  })

  it('sem nenhum recorte a URL é a raiz limpa', () => {
    expect(comQuantidade({ quantidade: 0 }, 0)).toBe('/')
  })
})

/**
 * O ESTADO DE LEITURA (identidade 04): ordem, lente e aba viajam na URL pelo
 * mesmo montador dos recortes, e a URL é entrada de USUÁRIO — a server action
 * do seletor e das lentes recebe um `destino` de fora e nunca pode usá-lo cru.
 */
describe('estado de leitura da Lista Secreta na URL', () => {
  it('ordem e lente escrevem SEMPRE — inclusive a opção já ativa, que a ação precisa gravar', () => {
    expect(comOrdem({ quantidade: 0 }, 'POR_JOGO')).toBe('/?ordem=POR_JOGO')
    expect(comLente({ quantidade: 0, lente: 'ULT5' }, 'ULT5')).toBe('/?lente=ULT5')
    // e nenhum dos dois varre o recorte que o usuário acabou de escolher
    const p = new URLSearchParams(comLente(RECORTE_CHEIO, 'ODDS').split('?')[1])
    expect(p.get('lente')).toBe('ODDS')
    expect(p.get('metodo')).toBe('OPD')
    expect(p.get('quantidade')).toBe('5')
  })

  it('a aba é UM parâmetro e só abre o card daquele jogador', () => {
    const url = comAba({ quantidade: 0 }, 'jog-1', 'REBOTES')
    expect(url).toBe('/?aba=jog-1%3AREBOTES')

    const estado = lerEstadoDaLista({ aba: 'jog-1:REBOTES' })
    expect(abaDoJogador(estado, 'jog-1')).toBe('REBOTES')
    expect(abaDoJogador(estado, 'jog-2')).toBeUndefined()
    // abrir a aba de outro card fecha a anterior: a URL não cresce com a rolagem
    expect(
      new URLSearchParams(comAba(estado, 'jog-2', 'PONTOS').split('?')[1]).getAll('aba'),
    ).toEqual(['jog-2:PONTOS'])
  })

  it('aba com atributo desconhecido, formato errado ou id com ":" não abre card nenhum', () => {
    expect(lerEstadoDaLista({ aba: 'jog-1:BLOQUEIOS' }).aba).toBe('jog-1:BLOQUEIOS')
    expect(abaDoJogador(lerEstadoDaLista({ aba: 'jog-1:BLOQUEIOS' }), 'jog-1')).toBeUndefined()
    expect(lerEstadoDaLista({ aba: 'sem-separador' }).aba).toBeUndefined()
    // `lerEstadoDaLista` recusa id com ':' — e `abaDoJogador` lê do MESMO jeito,
    // senão "a:b:PONTOS" abriria a aba de um jogador que a validação rejeitou.
    expect(lerEstadoDaLista({ aba: 'a:b:PONTOS' }).aba).toBeUndefined()
    expect(abaDoJogador({ quantidade: 0, aba: 'a:b:PONTOS' }, 'a:b')).toBeUndefined()
  })

  it('valor fora do vocabulário some em vez de derrubar o render', () => {
    const estado = lerEstadoDaLista({
      quantidade: '999',
      metodo: 'CHUTE',
      nivel: 'DEUS',
      atributo: 'BLOQUEIOS',
      ordem: 'POR_SORTE',
      lente: 'RAIO_X',
    })
    expect(estado).toMatchObject({
      quantidade: 0,
      metodo: undefined,
      nivel: undefined,
      atributo: undefined,
      ordem: undefined,
      lente: undefined,
    })
    expect(rotaDaLista(estado)).toBe('/')
  })

  it('a querystring repetida vale pelo PRIMEIRO valor — array não vira "a,b"', () => {
    expect(lerEstadoDaLista({ ordem: ['POR_NIVEL', 'POR_JOGO'] }).ordem).toBe('POR_NIVEL')
    expect(lerEstadoDaLista({ time: [''] }).time).toBeUndefined()
  })

  it('destino forjado nunca vira redirect para fora do app — só o vocabulário sobrevive', () => {
    const fora = [
      'https://evil.com/?ordem=POR_NIVEL',
      '//evil.com/?lente=ODDS',
      '/../../etc/passwd?ordem=POR_JOGO',
      'javascript:alert(1)?lente=ULT5',
    ]
    for (const destino of fora) {
      const rota = rotaDaLista(estadoDaUrl(destino))
      expect(rota.startsWith('/?') || rota === '/', destino).toBe(true)
      expect(rota).not.toContain('evil.com')
      expect(rota).not.toContain('javascript')
    }
    // o que o destino carrega DE VÁLIDO continua valendo: é assim que a ação
    // sabe o que gravar na conta.
    expect(estadoDaUrl('https://evil.com/?ordem=POR_NIVEL').ordem).toBe('POR_NIVEL')
    expect(estadoDaUrl('/?lente=ODDS&metodo=OPD')).toMatchObject({ lente: 'ODDS', metodo: 'OPD' })
    expect(estadoDaUrl('/')).toEqual({ quantidade: 0 })
  })
})
