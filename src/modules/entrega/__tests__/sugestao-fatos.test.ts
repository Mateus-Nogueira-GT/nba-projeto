import { describe, expect, it } from 'vitest'

import { PALAVRAS_PROIBIDAS } from '../../ingestao/llm/regras-do-texto'
import { validarTexto } from '../../ingestao/llm'
import type { ItemRanqueado } from '../../motor/sugestao/taxa-na-linha'
import {
  MARCA_FORA_DA_LISTA,
  fatosDoRanking,
  marcouOsNaoApitados,
} from '../sugestao/fatos'
import type { RankingDoDia } from '../sugestao/tipos'

/**
 * OS GUARDRAILS DA SUGESTÃO (ADR-0012, spec §7).
 *
 * São o que separa "o produto exibe uma segunda leitura" de "a IA passou a
 * opinar sobre quem apita". Nenhum depende de o modelo lembrar de nada.
 */
const item = (nome: string, apitadoHoje: boolean): ItemRanqueado => ({
  jogadorId: nome.toLowerCase(),
  nome,
  timeSigla: 'LAL',
  nivel: 'MVP',
  apitadoHoje,
  porLinha: [{ linha: 20, bateu: 8, de: 10 }],
})

const ranking: RankingDoDia = {
  dataReferencia: '2026-09-19',
  jogos: [
    {
      jogoId: 'j1',
      times: [
        { sigla: 'LAL', nome: 'Los Angeles Lakers' },
        { sigla: 'BOS', nome: 'Boston Celtics' },
      ],
      porAtributo: [{ atributo: 'PONTOS', itens: [item('Apitado', true), item('Livre', false)] }],
    },
  ],
}

const fatos = fatosDoRanking(
  { forma: 'jogos', jogos: ranking.jogos, atributo: 'PONTOS' },
  '2026-09-19',
  10,
).join('\n')

describe('as duas vozes se separam no texto que o CÓDIGO monta', () => {
  it('há dois cabeçalhos, e o da metodologia vem primeiro', () => {
    const apitados = fatos.indexOf('APITADOS HOJE PELA METODOLOGIA NIP')
    const livres = fatos.indexOf('NÃO APITADOS')
    expect(apitados).toBeGreaterThan(-1)
    expect(livres).toBeGreaterThan(apitados)
  })

  it('o bloco é DATADO e avisa que número de mensagem anterior pode estar velho', () => {
    // O ranking se move a cada rodada, e o prompt carrega as 10 últimas
    // mensagens — as respostas antigas trazem números de outra noite.
    expect(fatos).toContain('RANKING DA RODADA DE 2026-09-19')
    expect(fatos).toContain('mensagens ANTERIORES desta conversa podem estar desatualizados')
  })

  it('a taxa vai como "8 de 10", nunca como porcentagem', () => {
    // Taxa de acerto é o número que mais PARECE previsão. "8 de 10 jogos"
    // afirma sobre o passado; "80%" convida a ler como chance de hoje.
    expect(fatos).toContain('20+ em 8 de 10')
    expect(fatos).not.toContain('%')
  })

  it('os fatos não carregam nenhuma palavra que o validador reprova', () => {
    // Se os fatos trouxessem "chance", o modelo copiaria e a resposta certa
    // seria recusada — divergência entre o que se manda e o que se cobra.
    for (const palavra of PALAVRAS_PROIBIDAS) {
      expect(fatos.toLowerCase()).not.toContain(palavra)
    }
  })
})

describe('a marca "fora da lista" é verificada em CÓDIGO', () => {
  it('citar um não-apitado SEM a marca é reprovado', () => {
    expect(marcouOsNaoApitados('O Livre vem bem nos últimos jogos.', ranking)).toBe(false)
  })

  it('citar um não-apitado COM a marca passa', () => {
    expect(
      marcouOsNaoApitados(`O Livre vem bem, mas está ${MARCA_FORA_DA_LISTA}.`, ranking),
    ).toBe(true)
  })

  it('citar só quem a metodologia apitou não exige marca nenhuma', () => {
    expect(marcouOsNaoApitados('O Apitado está na lista de hoje.', ranking)).toBe(true)
  })

  it('sem ranking nos fatos não há o que verificar — o chat segue como antes', () => {
    expect(marcouOsNaoApitados('Qualquer resposta.', undefined)).toBe(true)
  })
})

describe('as palavras novas do par prompt/validador', () => {
  it('"chance" e "vai bater" são reprovadas — a taxa é passado, não previsão', () => {
    const fatosDoTeste = { numeros: [8, 10], limiteCaracteres: 1200 }
    expect(validarTexto('Ele tem boa chance hoje.', fatosDoTeste).ok).toBe(false)
    expect(validarTexto('Ele vai bater a linha.', fatosDoTeste).ok).toBe(false)
    // E o jeito certo de dizer continua passando.
    expect(validarTexto('Ele bateu 8 de 10 jogos.', fatosDoTeste).ok).toBe(true)
  })

  it('toda palavra dita ao modelo é de fato reprovada pelo validador (teste de deriva)', () => {
    for (const palavra of PALAVRAS_PROIBIDAS) {
      const r = validarTexto(`Frase com ${palavra} dentro.`, {
        numeros: [],
        limiteCaracteres: 1200,
      })
      expect(r.ok, `"${palavra}" é dita ao modelo mas não é reprovada`).toBe(false)
    }
  })
})
