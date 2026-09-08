import { describe, expect, it } from 'vitest'
import {
  alertaPermitido,
  estadoExperienciaPadrao,
  intensidadeEfetiva,
  schemaPreferenciasExperiencia,
  somLocalPermitido,
} from '../contrato'

const alvo = { canal: 'FIRE_LIVE_APITO', jogadorId: 'jogador-a', atributo: 'PONTOS' } as const

describe('matriz de alertas por conta', () => {
  it('sem preferências conserva push e habilita som a 50 com motion padrão', () => {
    const estado = estadoExperienciaPadrao()
    expect(estado.preferencias).toEqual({
      intensidade: 'PADRAO',
      somHabilitado: true,
      volume: 50,
      apenasAcompanhados: false,
    })
    expect(alertaPermitido(estado, alvo)).toBe(true)
    expect(somLocalPermitido(estado, alvo)).toBe(true)
    expect(intensidadeEfetiva('INTENSAS', true)).toBe('REDUZIDAS')
    expect(intensidadeEfetiva('INTENSAS', false)).toBe('INTENSAS')
  })

  it.each([{ somHabilitado: false }, { volume: 0 }])('mute local não muda push: %j', (parcial) => {
    const estado = estadoExperienciaPadrao()
    Object.assign(estado.preferencias, parcial)
    expect(somLocalPermitido(estado, alvo)).toBe(false)
    expect(alertaPermitido(estado, alvo)).toBe(true)
  })

  it('acompanhar jogador ou time sozinho não muda a política', () => {
    const estado = estadoExperienciaPadrao()
    estado.jogadoresAcompanhados = ['outro']
    estado.timesAcompanhados = ['time']
    expect(alertaPermitido(estado, alvo)).toBe(true)
    estado.preferencias.apenasAcompanhados = true
    expect(alertaPermitido(estado, alvo)).toBe(false)
    estado.jogadoresAcompanhados.push(alvo.jogadorId)
    expect(alertaPermitido(estado, alvo)).toBe(true)
  })

  it.each(['jogador', 'atributo', 'canal'])(
    'exclusão de %s vence acompanhamento em som e push',
    (tipo) => {
      const estado = estadoExperienciaPadrao()
      estado.jogadoresAcompanhados = [alvo.jogadorId]
      if (tipo === 'jogador') estado.jogadoresSilenciados = [alvo.jogadorId]
      if (tipo === 'atributo') estado.atributosSilenciados = ['PONTOS']
      if (tipo === 'canal') estado.canais.FIRE_LIVE_APITO = false
      expect(alertaPermitido(estado, alvo)).toBe(false)
      expect(somLocalPermitido(estado, alvo)).toBe(false)
    },
  )

  it('Lista Secreta geral depende só do canal porque não carrega alvo', () => {
    const estado = estadoExperienciaPadrao()
    estado.preferencias.apenasAcompanhados = true
    estado.atributosSilenciados = ['PONTOS', 'REBOTES', 'ASSISTENCIAS']
    expect(alertaPermitido(estado, { canal: 'LISTA_SECRETA' })).toBe(true)
    estado.canais.LISTA_SECRETA = false
    expect(alertaPermitido(estado, { canal: 'LISTA_SECRETA' })).toBe(false)
  })

  it.each([-1, 101, NaN, Infinity, 0.5])('rejeita volume inválido %s', (volume) => {
    expect(schemaPreferenciasExperiencia.safeParse({ volume }).success).toBe(false)
  })

  it('não aceita campos de outra conta ou intensidade desconhecida', () => {
    expect(schemaPreferenciasExperiencia.safeParse({ usuarioId: 'outro' }).success).toBe(false)
    expect(schemaPreferenciasExperiencia.safeParse({ intensidade: 'MAXIMA' }).success).toBe(false)
  })
})
