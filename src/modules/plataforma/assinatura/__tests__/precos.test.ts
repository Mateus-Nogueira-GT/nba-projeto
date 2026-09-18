import { describe, expect, it } from 'vitest'

import { avisoDaTemporada, precosDosPlanos } from '../precos'

const FUSO = 'America/Sao_Paulo'

/** Os valores de lançamento da spec §10. */
const ENV_COMPLETO = {
  PLANO_MVP_MENSAL_CENTAVOS: '5990',
  PLANO_MVP_MENSAL_DE_CENTAVOS: '7990',
  PLANO_MVP_TEMPORADA_CENTAVOS: '39700',
  PLANO_ALL_STAR_MENSAL_CENTAVOS: '9990',
  PLANO_ALL_STAR_MENSAL_DE_CENTAVOS: '14900',
  PLANO_ALL_STAR_TEMPORADA_CENTAVOS: '59700',
  TEMPORADA_FIM: '2027-06-30',
}

describe('precosDosPlanos', () => {
  it('lê os quatro preços e o "de" de quem tem', () => {
    const precos = precosDosPlanos(FUSO, ENV_COMPLETO)
    expect(precos?.porSku.MVP_MENSAL).toEqual({ centavos: 5990, deCentavos: 7990 })
    expect(precos?.porSku.MVP_TEMPORADA).toEqual({ centavos: 39700, deCentavos: null })
    expect(precos?.porSku.ALL_STAR_MENSAL).toEqual({ centavos: 9990, deCentavos: 14900 })
    expect(precos?.porSku.ALL_STAR_TEMPORADA).toEqual({ centavos: 59700, deCentavos: null })
  })

  it('TEMPORADA_FIM é o último dia INCLUSIVE: o fim é a meia-noite SEGUINTE, no fuso', () => {
    const precos = precosDosPlanos(FUSO, ENV_COMPLETO)
    // 30/06/2027 é o último dia vendido; o direito vale até a virada para
    // 01/07, que em Brasília (UTC-3) é 03:00 UTC.
    expect(precos?.fimDaTemporada.toISOString()).toBe('2027-07-01T03:00:00.000Z')
  })

  it('o "de" menor ou igual ao preço cobrado não aparece — não é promoção', () => {
    const menor = precosDosPlanos(FUSO, { ...ENV_COMPLETO, PLANO_MVP_MENSAL_DE_CENTAVOS: '4990' })
    expect(menor?.porSku.MVP_MENSAL.deCentavos).toBeNull()
    const igual = precosDosPlanos(FUSO, { ...ENV_COMPLETO, PLANO_MVP_MENSAL_DE_CENTAVOS: '5990' })
    expect(igual?.porSku.MVP_MENSAL.deCentavos).toBeNull()
  })

  it('com o checkout desligado, configuração incompleta devolve null em vez de quebrar o boot', () => {
    expect(precosDosPlanos(FUSO, {})).toBeNull()
    const semTemporada = { ...ENV_COMPLETO, TEMPORADA_FIM: '' }
    expect(precosDosPlanos(FUSO, semTemporada)).toBeNull()
  })

  it('com o checkout LIGADO, configuração incompleta falha alto e diz qual variável falta', () => {
    expect(() =>
      precosDosPlanos(FUSO, {
        ...ENV_COMPLETO,
        MERCADOPAGO_CHECKOUT_ENABLED: 'true',
        PLANO_ALL_STAR_TEMPORADA_CENTAVOS: '',
      }),
    ).toThrow('PLANO_ALL_STAR_TEMPORADA_CENTAVOS')
    expect(() =>
      precosDosPlanos(FUSO, {
        ...ENV_COMPLETO,
        MERCADOPAGO_CHECKOUT_ENABLED: 'true',
        TEMPORADA_FIM: '30/06/2027',
      }),
    ).toThrow('TEMPORADA_FIM')
  })

  it('preço fora de faixa é o mesmo que preço ausente', () => {
    // Um dígito a menos vira R$ 0,59; um a mais vira R$ 5.990,00. Os dois
    // acidentes acontecem digitando env, e nenhum dos dois pode virar
    // cobrança.
    for (const absurdo of ['0', '99', '-5990', '10000001', 'cinquenta', '59,90', '59.90']) {
      expect(
        precosDosPlanos(FUSO, { ...ENV_COMPLETO, PLANO_MVP_MENSAL_CENTAVOS: absurdo }),
      ).toBeNull()
    }
  })

  it('data impossível não vira data rolada para o mês seguinte', () => {
    expect(precosDosPlanos(FUSO, { ...ENV_COMPLETO, TEMPORADA_FIM: '2027-02-31' })).toBeNull()
  })
})

describe('avisoDaTemporada', () => {
  const FIM = new Date('2027-07-01T03:00:00.000Z')

  it('cala enquanto falta mais de trinta dias', () => {
    expect(avisoDaTemporada(FIM, new Date('2027-05-01T12:00:00.000Z'))).toBeNull()
  })

  it('no limite exato de trinta dias, já avisa', () => {
    // 2027-06-01T03:00:00.000Z é exatamente 30 dias antes de FIM
    // (2027-07-01T03:00:00.000Z) — junho tem 30 dias. É a borda entre "cala"
    // (> 30 dias de folga) e "avisa" (<= 30 dias de folga); um mutante que
    // trocasse `>` por `>=` no cálculo da folga passaria em todos os outros
    // testes e só se revelaria aqui.
    const aviso = avisoDaTemporada(FIM, new Date('2027-06-01T03:00:00.000Z'))
    expect(aviso).not.toBeNull()
    expect(aviso).toContain('30 dias')
  })

  it('avisa dentro dos trinta dias, com a contagem e o que fazer', () => {
    // De 10/06 12:00Z até 01/07 03:00Z são 20 dias e 15 horas — 21 dias
    // arredondando para cima, que é o que um aviso de prazo deve dizer.
    const aviso = avisoDaTemporada(FIM, new Date('2027-06-10T12:00:00.000Z'))
    expect(aviso).toContain('21 dias')
    expect(aviso).toContain('TEMPORADA_FIM')
  })

  it('no limite de um dia, fala no singular', () => {
    expect(avisoDaTemporada(FIM, new Date('2027-06-30T12:00:00.000Z'))).toContain('1 dia')
  })

  it('depois da data, diz que a temporada já não é oferecida', () => {
    const aviso = avisoDaTemporada(FIM, new Date('2027-07-05T12:00:00.000Z'))
    expect(aviso).toContain('TEMPORADA_FIM')
    expect(aviso).toMatch(/n[ãa]o est[áa] mais/i)
  })

  it('sem configuração de temporada não há o que avisar', () => {
    expect(avisoDaTemporada(null, new Date('2027-06-10T12:00:00.000Z'))).toBeNull()
  })
})
