import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * QUEM ESCREVE O QUE A LATERAL LÊ, INVALIDA A LATERAL (correções de lógica
 * 19/09, §3.3). A lateral é cacheada por uma hora sob `TAG_LATERAL`; toda
 * rota de cron que fecha uma rodada — sincronização real ou simulação —
 * precisa chamar `revalidateTag(TAG_LATERAL, 'max')`. A demo esqueceu; a
 * próxima rota não pode esquecer.
 *
 * O critério é a FUNÇÃO importada, não o módulo: `jobs/orquestradores`
 * publica cinco jobs e só um deles mexe no que a lateral lê. Um teste que
 * olhasse só o módulo cobraria invalidação de quem sincroniza elenco.
 */
const RAIZ = 'src/app/api/cron'

/**
 * Os jobs que escrevem jogos, box scores ou classificação — o que a lateral
 * lê (`lerLateral`: última noite CONFERIDA + classificação).
 */
const ESCREVE_RODADA = ['executarJobRodada', 'simularAte']

/**
 * Os jobs que NÃO tocam a lateral, e por quê. Ficam nomeados de propósito:
 * um job novo em `orquestradores` não cai em nenhuma das duas listas e o
 * teste abaixo obriga alguém a decidir de qual lado ele está, em vez de
 * passar despercebido.
 *
 *   executarJobAoVivo      1º quarto em curso; a lateral só conta noite
 *                          CONFERIDA, nunca parcial (`ultimaRodadaConferida`)
 *   executarJobElenco      elenco e vínculo jogador↔time
 *   executarJobEscalacao   escalação e desfalques do dia
 */
const NAO_TOCA_A_LATERAL = ['executarJobAoVivo', 'executarJobElenco', 'executarJobEscalacao']

/**
 * A fonte SEM comentários — como em `tokens.test.ts`.
 *
 * Sem isto o teste não morde: uma chamada comentada
 * (`// revalidateTag(TAG_LATERAL, 'max')`) continua sendo uma ocorrência da
 * string, e a rota passaria sem invalidar nada. Foi exatamente o que a
 * primeira versão deste arquivo deixou escapar.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Todo `route.ts` sob a raiz dos crons. */
function rotas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : rotas(caminho)
    return e.name === 'route.ts' ? [caminho] : []
  })
}

/** Os jobs conhecidos que esta fonte importa. */
function jobsDe(fonte: string, lista: readonly string[]): string[] {
  return lista.filter((job) => new RegExp(`\\b${job}\\b`).test(fonte))
}

const todas = rotas(RAIZ).map((caminho) => ({
  caminho,
  fonte: semComentarios(readFileSync(caminho, 'utf8')),
}))

describe('invalidação da lateral', () => {
  const escritoras = todas.filter(({ fonte }) => jobsDe(fonte, ESCREVE_RODADA).length > 0)

  it('há pelo menos as duas rotas conhecidas: sincronizar-rodada e demo', () => {
    expect(escritoras.some(({ caminho }) => caminho.includes('sincronizar-rodada'))).toBe(true)
    expect(escritoras.some(({ caminho }) => caminho.includes('/demo/'))).toBe(true)
  })

  it.each(escritoras.map(({ caminho }) => caminho))(
    '%s invalida TAG_LATERAL com o perfil max',
    (caminho) => {
      const fonte = semComentarios(readFileSync(caminho, 'utf8'))
      expect(fonte).toContain("import { TAG_LATERAL } from '@/app/(app)/lateral/leitura'")
      expect(fonte).toContain("revalidateTag(TAG_LATERAL, 'max')")
    },
  )

  it.each(escritoras.map(({ caminho }) => caminho))(
    '%s invalida TAG_RANKING com o perfil max',
    (caminho) => {
      // O ranking estatístico do assistente (ADR-0012) lê os MESMOS box scores
      // que a lateral: a rodada que fecha move a janela dos últimos dez de
      // cada jogador. Quem invalida uma precisa invalidar a outra.
      const fonte = semComentarios(readFileSync(caminho, 'utf8'))
      expect(fonte).toContain("import { TAG_RANKING } from '@/app/api/chat/ranking'")
      expect(fonte).toContain("revalidateTag(TAG_RANKING, 'max')")
    },
  )

  it('todo job de ingestão usado por um cron está classificado: escreve rodada, ou não toca a lateral', () => {
    // A rede para o job NOVO: quem acrescentar `executarJobX` a
    // `orquestradores` e ligá-lo a um cron cai aqui, e decide em qual lista
    // ele entra — em vez de descobrir pelo assinante que a lateral congelou.
    const naoClassificadas = todas
      .filter(({ fonte }) => fonte.includes('@/modules/ingestao/jobs/orquestradores'))
      .filter(
        ({ fonte }) =>
          jobsDe(fonte, ESCREVE_RODADA).length === 0 &&
          jobsDe(fonte, NAO_TOCA_A_LATERAL).length === 0,
      )
      .map(({ caminho }) => caminho)
    expect(naoClassificadas).toEqual([])
  })
})
