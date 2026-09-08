import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { estadoExperienciaPadrao } from '@/modules/plataforma/experiencia/contrato'
import { BotaoAcompanharJogador, BotaoAcompanharTime } from '../BotaoAcompanharJogador'
import { PainelExperiencia } from '../PainelExperiencia'

describe('painel de experiência da conta', () => {
  it('abre com som ligado em 50%, movimento padrão e acompanhamento nomeado', () => {
    const estado = estadoExperienciaPadrao()
    estado.jogadoresAcompanhados = ['jogador-1']
    estado.timesAcompanhados = ['time-1']
    const html = renderToStaticMarkup(
      createElement(PainelExperiencia, {
        inicial: estado,
        jogadores: [{ id: 'jogador-1', nome: 'Nome Oficial' }],
        times: [{ id: 'time-1', nome: 'Boston Celtics' }],
      }),
    )

    expect(html).toContain('Movimento no Ao Vivo')
    expect(html).toContain('<option value="PADRAO" selected="">Padrão</option>')
    expect(html).toMatch(/type="checkbox"[^>]*checked=""[^>]*\/> Som do apito no app/)
    expect(html).toContain('Volume · 50%')
    expect(html).toContain('Nome Oficial')
    expect(html).toContain('Boston Celtics')
    expect(html).toContain('Alertar apenas jogadores acompanhados')
  })

  it('nomeia jogador e time sem misturar os dois tipos de acompanhamento', () => {
    const jogador = renderToStaticMarkup(
      createElement(BotaoAcompanharJogador, { jogadorId: 'jogador-1', inicial: true }),
    )
    const time = renderToStaticMarkup(
      createElement(BotaoAcompanharTime, { timeId: 'time-1', inicial: false }),
    )

    expect(jogador).toContain('aria-pressed="true"')
    expect(jogador).toContain('Acompanhando jogador')
    expect(time).toContain('aria-pressed="false"')
    expect(time).toContain('Acompanhar time')
  })
})
