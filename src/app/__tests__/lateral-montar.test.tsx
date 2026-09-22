import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A doca do assistente só existe quando o chat EXISTE (correções de lógica
 * 19/09, §4.3). `Lateral` é componente puro e recebe `assistente`; quem
 * consulta `configuracaoChat()` é a montagem, na camada de leitura — o mesmo
 * lugar que a `Moldura` usa para o botão flutuante.
 *
 * Sem PGlite: o que se prova aqui é FIAÇÃO. A leitura da lateral é mockada,
 * e o que interessa é qual `assistente` chega ao componente.
 */
const DADOS = {
  noite: null,
  temporada: null,
  classificacao: { temporada: '2026-27', conferencias: [] },
}

vi.mock('@/app/(app)/lateral/leitura', () => ({
  TAG_LATERAL: 'lateral',
  lerLateralCacheada: async () => DADOS,
}))
vi.mock('@/modules/entrega/ruleset-ativo', () => ({
  rulesetAtivo: async () => ({
    rodada: { fuso: 'America/Sao_Paulo' },
    temporada: { mes_inicio: 10, formato: 'dois_anos', minimo_jogos_para_exibir: 1 },
  }),
}))

import { lateralPadrao } from '../(app)/lateral/montar'

beforeEach(() => {
  vi.stubEnv('CHAT_HABILITADO', 'true')
  // `configuracaoChat().habilitado` exige as DUAS cotas por nível (spec §14):
  // sem elas o chat conta como desligado mesmo com a flag ligada.
  vi.stubEnv('CHAT_COTA_DIARIA_MVP', '20')
  vi.stubEnv('CHAT_COTA_DIARIA_ALL_STAR', '60')
})
afterAll(() => vi.unstubAllEnvs())

const renderizar = async (props: { assistente: boolean; gratis: boolean }) =>
  renderToStaticMarkup(<>{await lateralPadrao(props)}</>)

describe('a doca do assistente na lateral', () => {
  it('aparece para o nível com direito, com o chat ligado', async () => {
    expect(await renderizar({ assistente: true, gratis: false })).toContain(
      'Pergunte ao assistente',
    )
  })

  it('NÃO aparece com CHAT_HABILITADO desligada — a doca mandava para um /chat que responde 404', async () => {
    vi.stubEnv('CHAT_HABILITADO', 'nao')
    expect(await renderizar({ assistente: true, gratis: false })).not.toContain(
      'Pergunte ao assistente',
    )
  })

  it('NÃO aparece com a flag ligada mas uma cota vazia (degradar, spec §14)', async () => {
    vi.stubEnv('CHAT_COTA_DIARIA_MVP', '')
    expect(await renderizar({ assistente: true, gratis: false })).not.toContain(
      'Pergunte ao assistente',
    )
  })

  it('NÃO aparece para o grátis, mesmo com o chat ligado', async () => {
    expect(await renderizar({ assistente: false, gratis: true })).not.toContain(
      'Pergunte ao assistente',
    )
  })
})
