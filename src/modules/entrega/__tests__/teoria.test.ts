import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { carregarRuleset } from '../../motor/ruleset/carregar'
import { montarTeoria } from '../teoria/conteudo'

const yaml = readFileSync('config/ruleset.v1.yaml', 'utf8')
const ruleset = carregarRuleset(yaml)

describe('a aba teórica é derivada do ruleset, nunca escrita à mão', () => {
  const t = montarTeoria(ruleset)

  it('oscilação: deltas, exceção nominal e mínimo por classe', () => {
    expect(t.oscilacao.delta).toEqual(ruleset.oscilacao.delta)
    // "em exclusividade o jogador Luka doncic ... só contará a partir de <=7"
    expect(t.oscilacao.excecoes['luka-doncic']).toBe(7)
    // "randola e suporte não apitam o nível 1"
    expect(t.niveis.minimoOscilacao.SUPORTE).toBe(2)
    expect(t.niveis.minimoOscilacao.RANDOLA).toBe(2)
    expect(t.oscilacao.dnpIgnora).toBe(true)
  })

  it('OPD: janela, prefixo obrigatório e o mapa distância → nível', () => {
    expect(t.opd.janela).toBe(ruleset.opd.janela)
    expect(t.opd.exigePrefixo).toBe(true)
    expect(t.opd.mapaNivel).toEqual(ruleset.opd.mapa_nivel)
    expect(t.opd.turbo.exigeOpd).toBe(ruleset.opd.turbo.exige_opd_nivel)
  })

  it('confiança e odds saem das tabelas do ruleset', () => {
    expect(t.confianca.base).toEqual(ruleset.confianca.base)
    expect(t.confianca.bonus).toEqual(ruleset.confianca.bonus_por_nivel_apito)
    expect(t.odds.tabela).toEqual(ruleset.odds.tabela_estatica)
  })

  it('declara a origem de cada atributo — a tela precisa poder avisar', () => {
    const t = montarTeoria(ruleset)
    const porAtributo = new Map(t.atributos.map((a) => [a.atributo, a] as const))

    expect(porAtributo.get('PONTOS')?.origem).toBe('homologado')
    expect(porAtributo.get('PONTOS')?.linhas.MVP).toEqual([20, 25, 30, 35])

    // Rebotes e assistências ainda são exemplo: a aba teórica não pode
    // apresentá-los como regra do CJ.
    expect(porAtributo.get('REBOTES')?.origem).toBe('demonstracao')
    expect(porAtributo.get('REBOTES')?.linhas.MVP).toEqual([8, 10, 12])
    expect(t.odds.casasMinimas).toBe(ruleset.odds.casas_minimas)
  })

  it('Fire Live: multiplicadores, travas, modo fire e bloco de topo', () => {
    expect(t.fireLive.quarto).toBe(1)
    expect(t.fireLive.multiplicadores.pontosClassificado).toBe(1.5)
    expect(t.fireLive.multiplicadores.pontosRandola).toBe(2.5)
    expect(t.fireLive.multiplicadores.pontosNaoClassificado).toBe(3)
    expect(t.fireLive.travas.pontosAlvoMinimo).toBe(4)
    expect(t.fireLive.modoFire.percentual).toBe(0.75)
    expect(t.fireLive.presencaTopo.timesIsentos).toEqual(['UTA', 'DET', 'DEN'])
  })

  it('greens, blowout e matchup', () => {
    expect(t.push.marcosGreen.MVP).toEqual(ruleset.push.marcos_green.MVP)
    expect(t.blowout).toEqual({ quarto: 4, diferenca: 25, aplicaA: 'TITULARES' })
    expect(t.matchup.liberarAposDias).toBe(20)
  })

  it('trocar um valor no ruleset muda a página, sem tocar em código', () => {
    const alterado = carregarRuleset(yaml.replace('    MVP: 6', '    MVP: 8'))
    expect(montarTeoria(alterado).oscilacao.delta.MVP).toBe(8)
  })

  it('a palavra "probabilidade" não aparece em lugar nenhum do view-model', () => {
    expect(JSON.stringify(t).toLowerCase()).not.toContain('probabilidade')
  })
})

describe('a página /como-funciona', () => {
  const fonte = readFileSync('src/app/(app)/como-funciona/page.tsx', 'utf8')

  it('exige sessão, mas NÃO exige assinatura (vitrine para quem ainda não assinou)', () => {
    expect(fonte).toContain('sessaoAtual')
    expect(fonte).not.toContain('avaliarAcesso')
  })

  it('todo número vem do view-model do ruleset', () => {
    expect(fonte).toContain('montarTeoria')
  })

  it('chama o percentual de nota de confiança e nega ser probabilidade (P12)', () => {
    expect(fonte).toContain('nota de confiança da análise')
    // A palavra só pode aparecer NEGADA — a ressalva que o P12 exige.
    const ocorrencias = [...fonte.matchAll(/probabilidade/gi)]
    expect(ocorrencias.length).toBeGreaterThan(0)
    for (const oc of ocorrencias) {
      const contexto = fonte.slice(Math.max(0, oc.index - 40), oc.index)
      expect(contexto).toMatch(/não é|nunca|nem/i)
    }
  })

  it('traz o aviso de blowout, que o documento manda morar aqui', () => {
    expect(fonte).toContain('t.blowout.diferenca')
    expect(fonte).toContain('t.blowout.quarto')
  })
})
