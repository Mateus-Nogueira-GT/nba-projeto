import { describe, expect, it } from 'vitest'

import { decidirAtribuicao, JANELA_ATRIBUICAO_MS } from '../atribuicao'
import { calcularParcelaDoParceiro } from '../financeiro'
import { prepararImportacaoCsv } from '../importacao-csv'
import { validarDestinoComercial } from '../links'

describe('atribuição interna de afiliados', () => {
  const inicio = new Date('2026-09-01T12:00:00.000Z')

  it('mantém o primeiro afiliado e não renova a janela com clique posterior', () => {
    const atual = {
      parceiroId: 'parceiro-a',
      linkOrigemId: 'link-a',
      inicio,
      expiraEm: new Date(inicio.getTime() + JANELA_ATRIBUICAO_MS),
    }
    const decisao = decidirAtribuicao(atual, {
      parceiroId: 'parceiro-b',
      linkOrigemId: 'link-b',
      agora: new Date('2026-09-11T12:00:00.000Z'),
    })

    expect(decisao).toEqual({ atribuicao: atual, criarNova: false })
  })

  it('considera o limite exato de 30 dias expirado', () => {
    const decisao = decidirAtribuicao(
      {
        parceiroId: 'parceiro-a',
        linkOrigemId: 'link-a',
        inicio,
        expiraEm: new Date(inicio.getTime() + JANELA_ATRIBUICAO_MS),
      },
      {
        parceiroId: 'parceiro-b',
        linkOrigemId: 'link-b',
        agora: new Date(inicio.getTime() + JANELA_ATRIBUICAO_MS),
      },
    )

    expect(decisao).toEqual({
      criarNova: true,
      atribuicao: {
        parceiroId: 'parceiro-b',
        linkOrigemId: 'link-b',
        inicio: new Date(inicio.getTime() + JANELA_ATRIBUICAO_MS),
        expiraEm: new Date(inicio.getTime() + 2 * JANELA_ATRIBUICAO_MS),
      },
    })
  })
})

describe('destino comercial', () => {
  it('aceita HTTPS no host homologado e rejeita credenciais, esquema ou host arbitrário', () => {
    expect(
      validarDestinoComercial('https://ofertas.casa.test/nba?ref=nip', ['ofertas.casa.test']),
    ).toBe('https://ofertas.casa.test/nba?ref=nip')
    expect(() =>
      validarDestinoComercial('https://usuario:senha@ofertas.casa.test/nba', ['ofertas.casa.test']),
    ).toThrow('Destino comercial inválido')
    expect(() => validarDestinoComercial('javascript:alert(1)', ['ofertas.casa.test'])).toThrow(
      'Destino comercial inválido',
    )
    expect(() =>
      validarDestinoComercial('https://phishing.test/nba', ['ofertas.casa.test']),
    ).toThrow('Destino comercial inválido')
  })
})

describe('importação comercial', () => {
  it('distingue ausente de zero e não soma total híbrido aos componentes', () => {
    const previa = prepararImportacaoCsv(
      [
        'id_externo;indicado;data_evento;tipo;moeda;cpa_centavos;revshare_centavos;total_centavos;codigo_link;atribuicao_id;acordo_id',
        'evt-1;mateus@email.test;2026-09-08T10:00:00.000Z;HIBRIDO;BRL;10000;2500;12500;nip-a;;',
        'evt-2;an***@email.test;2026-09-08T11:00:00.000Z;CPA;BRL;0;;;nip-a;;',
      ].join('\n'),
    )

    expect(previa.erros).toEqual([])
    expect(previa.linhas[0]).toMatchObject({
      idExterno: 'evt-1',
      cpaCentavos: 10_000,
      revshareCentavos: 2_500,
      totalCentavos: 12_500,
      baseConfirmadaCentavos: 12_500,
      indicadoMascarado: 'ma***@email.test',
    })
    expect(previa.linhas[1]).toMatchObject({
      cpaCentavos: 0,
      revshareCentavos: null,
      totalCentavos: null,
      baseConfirmadaCentavos: 0,
    })
  })

  it('rejeita datas e valores monetários ambíguos', () => {
    const previa = prepararImportacaoCsv(
      [
        'id_externo;indicado;data_evento;tipo;moeda;cpa_centavos;revshare_centavos;total_centavos;codigo_link;atribuicao_id;acordo_id',
        'evt-1;pessoa;08/09/2026;CPA;BRL;1.000,00;;;nip-a;;',
      ].join('\n'),
    )
    expect(previa.linhas).toEqual([])
    expect(previa.erros[0]).toMatch(/data_evento|cpa_centavos/)
  })
})

describe('parcela do parceiro', () => {
  it('calcula centavos com percentual em pontos-base e arredonda meio para cima', () => {
    expect(calcularParcelaDoParceiro(12_501, 3_333)).toBe(4_167)
    expect(calcularParcelaDoParceiro(10_000, 0)).toBe(0)
    expect(calcularParcelaDoParceiro(10_000, 10_000)).toBe(10_000)
  })

  it('rejeita dinheiro e percentuais fora do domínio', () => {
    expect(() => calcularParcelaDoParceiro(-1, 5_000)).toThrow()
    expect(() => calcularParcelaDoParceiro(1_000, 10_001)).toThrow()
  })
})
