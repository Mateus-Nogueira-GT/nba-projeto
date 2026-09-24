import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * OS DOIS CAMINHOS CHEGAM NA MESMA TELA — o nome do jogador em qualquer tela
 * do v2 leva para a MESMA rota que a busca do menu monta (`rotaDoJogador`, em
 * `modules/entrega/estatisticas/rotas`). Um `href` escrito à mão numa tela
 * escaparia dessa rota no dia em que ela mudar (query de contexto, base).
 *
 * Era um caso de `entrega/__tests__/estatisticas.test.ts` sobre o `CardEntrada`
 * antigo (Tarefa 12, fix round 2): aqui é uma prova de FONTE sobre as telas.
 */
const RAIZ = 'src/features'

function telas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : telas(caminho)
    return e.name.endsWith('.tsx') ? [caminho] : []
  })
}

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')

describe('todo link para a ficha do jogador passa por rotaDoJogador', () => {
  const arquivos = telas(RAIZ).map((caminho) => ({ caminho, fonte: semComentarios(readFileSync(caminho, 'utf8')) }))

  it('nenhuma tela escreve href="/estatisticas/jogador/…" à mão', () => {
    const infratores = arquivos
      .filter(({ fonte }) => /href=\{?["'`]\/estatisticas\/jogador\//.test(fonte))
      .map(({ caminho }) => caminho)
    expect(infratores).toEqual([])
  })

  it('as telas que nomeiam o jogador com link importam a rota — apito, Ao Vivo, Resultados, partida, time', () => {
    for (const tela of [
      'src/features/apito/DetalheDoApito.tsx',
      'src/features/ao-vivo/TelaAoVivo.tsx',
      'src/features/resultados/TelaResultados.tsx',
      'src/features/estatisticas/TelaJogo.tsx',
      'src/features/estatisticas/TelaTime.tsx',
    ]) {
      const fonte = arquivos.find((a) => a.caminho === tela)?.fonte ?? ''
      expect(fonte, tela).toMatch(/import \{[^}]*\brotaDoJogador\b[^}]*\} from '@\/modules\/entrega\/estatisticas\/rotas'/)
      expect(fonte, tela).toMatch(/<Link href=\{rotaDoJogador\(/)
    }
  })
})
