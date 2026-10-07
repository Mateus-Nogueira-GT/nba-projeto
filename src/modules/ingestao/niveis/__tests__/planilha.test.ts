import { describe, expect, it } from 'vitest'

import { lerPlanilha } from '../planilha'

describe('planilha revisada do lista-cj:confirmar', () => {
  it('arquivo com ";" (Excel pt-BR): vírgula sem aspas dentro do campo não quebra a coluna', () => {
    const texto = [
      'nome_na_lista;id_sugerido;observacao;confirmar',
      'Luka Doncic;17;ok, conferido;sim',
    ].join('\n')

    const { separador, linhas, problemas } = lerPlanilha(texto)

    expect(separador).toBe(';')
    expect(problemas).toEqual([])
    expect(linhas).toEqual([
      {
        linhaNoArquivo: 2,
        campos: {
          nome_na_lista: 'Luka Doncic',
          id_sugerido: '17',
          observacao: 'ok, conferido',
          confirmar: 'sim',
        },
      },
    ])
  })

  it('arquivo com ",": vírgula e quebra de linha entre aspas ficam no campo', () => {
    const texto =
      'nome_na_lista,observacao,confirmar\r\n' +
      '"Doncic, Luka","linha um\nlinha dois; com ponto e vírgula",sim\r\n' +
      'Jayson Tatum,"diz ""sim""",nao\r\n'

    const { separador, linhas, problemas } = lerPlanilha(texto)

    expect(separador).toBe(',')
    expect(problemas).toEqual([])
    expect(linhas.map((l) => l.campos)).toEqual([
      {
        nome_na_lista: 'Doncic, Luka',
        observacao: 'linha um\nlinha dois; com ponto e vírgula',
        confirmar: 'sim',
      },
      { nome_na_lista: 'Jayson Tatum', observacao: 'diz "sim"', confirmar: 'nao' },
    ])
    expect(linhas[1]!.linhaNoArquivo).toBe(4)
  })

  it('BOM no início não contamina o nome da primeira coluna', () => {
    const { linhas } = lerPlanilha('﻿nome_na_lista;confirmar\nLuka;sim\n')

    expect(linhas[0]!.campos).toEqual({ nome_na_lista: 'Luka', confirmar: 'sim' })
  })

  it('linha com número de colunas diferente do cabeçalho vira PROBLEMA, não some', () => {
    const texto = [
      'nome_na_lista;id_sugerido;confirmar',
      'Luka Doncic;17;sim',
      'Jayson Tatum;sim',
      'Anthony Davis;3;sim;extra',
      '',
    ].join('\n')

    const { linhas, problemas } = lerPlanilha(texto)

    expect(linhas.map((l) => l.campos.nome_na_lista)).toEqual(['Luka Doncic'])
    expect(problemas).toEqual([
      { linhaNoArquivo: 3, motivo: 'tem 2 colunas, o cabeçalho tem 3' },
      { linhaNoArquivo: 4, motivo: 'tem 4 colunas, o cabeçalho tem 3' },
    ])
  })

  it('arquivo vazio não tem linha nem problema', () => {
    expect(lerPlanilha('')).toEqual({ separador: ',', linhas: [], problemas: [] })
  })
})
