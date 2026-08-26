import { describe, expect, it } from 'vitest'

import { validarTexto } from '../validador'

const FATOS = { numeros: [20, 25.7, 5], limiteCaracteres: 280 }

describe('validador de texto gerado', () => {
  it('aprova texto sóbrio que só cita números dos fatos', () => {
    const r = validarTexto('Vem de sequência abaixo da média de 25.7 e enfrenta a linha de 20.', FATOS)
    expect(r.ok).toBe(true)
  })

  it('reprova a palavra PROBABILIDADE em qualquer flexão', () => {
    // O percentual do produto é nota de confiança, não probabilidade. Essa
    // palavra na tela contradiz /como-funciona e a regra do design system.
    for (const texto of [
      'A probabilidade de bater é alta.',
      'Probabilidade elevada hoje.',
      'As probabilidades favorecem o jogador.',
      'É provável que bata a linha.',
    ]) {
      const r = validarTexto(texto, FATOS)
      expect(r.ok, texto).toBe(false)
      if (!r.ok) expect(r.motivo).toBe('probabilidade')
    }
  })

  it('reprova número que NÃO está nos fatos — anti-alucinação de estatística', () => {
    // O pior defeito possível: a LLM inventa "média de 31,4" e o assinante
    // aposta em cima de um número que não existe.
    const r = validarTexto('Média de 31.4 pontos nos últimos jogos.', FATOS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('numero-inventado')
  })

  it('aceita número dos fatos escrito com vírgula decimal (pt-BR)', () => {
    // 25.7 nos fatos e "25,7" no texto são o MESMO número. Reprovar isso
    // rejeitaria todo texto correto em português.
    const r = validarTexto('A média de 25,7 sustenta a leitura.', FATOS)
    expect(r.ok).toBe(true)
  })

  it('ignora números dentro de palavras e ordinais curtos', () => {
    // Ordinais como "1º quarto" não são estatística inventada.
    const r = validarTexto('No 1º quarto o time acelera.', { numeros: [], limiteCaracteres: 280 })
    expect(r.ok).toBe(true)
  })

  it('reprova texto acima do limite de caracteres', () => {
    const r = validarTexto('a'.repeat(281), FATOS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('muito-longo')
  })

  it('reprova texto vazio ou só espaços', () => {
    const r = validarTexto('   ', FATOS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('vazio')
  })

  it('devolve o texto APARADO quando aprova', () => {
    const r = validarTexto('  Texto com folga.  ', FATOS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.texto).toBe('Texto com folga.')
  })

  it('pega número inventado no FIM da frase (regressão)', () => {
    // A regex anterior excluía "." do lookahead de cauda, então um número
    // colado no ponto final não casava: o inventado passava direto para o
    // card. É o defeito que o cabeçalho deste módulo existe para impedir.
    const r = validarTexto('Fecha a semana com média de 31,4.', FATOS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('numero-inventado')
  })

  it('confere TODOS os números, inclusive o último da frase', () => {
    // Antes, só o primeiro número era conferido de fato — o final escapava,
    // e o teste de aprovação passava sem exercitar o que prometia.
    const r = validarTexto('A média é 25,7 e a linha inventada é 99.', FATOS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('numero-inventado')
  })
})
