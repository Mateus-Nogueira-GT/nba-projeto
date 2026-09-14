import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { PALAVRAS_PROIBIDAS, regrasDoTexto } from '../regras-do-texto'
import { validarTexto } from '../validador'

/**
 * O TESTE DE DERIVA entre o que o prompt PEDE e o que o validador COBRA.
 *
 * Enquanto cada consumidor escrevia as próprias proibições, o chat esquecia
 * "provável" — palavra corriqueira em português que o validador reprova. O
 * modelo escrevia, o validador recusava, o assinante via "indisponível" e
 * perguntava de novo: cada retentativa uma chamada PAGA.
 */
describe('regras do texto × validador', () => {
  it.each([...PALAVRAS_PROIBIDAS])('"%s" está no prompt E é reprovada pelo validador', (palavra) => {
    // Lado do prompt: o modelo é avisado.
    expect(regrasDoTexto(280).join(' ')).toContain(palavra)

    // Lado do validador: a palavra é de fato recusada. Se alguém tirar uma
    // das duas de `PROIBIDAS` sem tirar da lista, este teste cai.
    const r = validarTexto(`Nesse cenário a ${palavra} de bater a linha é enorme.`, {
      numeros: [],
      limiteCaracteres: 280,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('probabilidade')
  })

  it('o limite de caracteres é interpolado pelo chamador — 280 e 1200 são textos diferentes', () => {
    expect(regrasDoTexto(280).join(' ')).toContain('280')
    expect(regrasDoTexto(1200).join(' ')).toContain('1200')
  })

  it('carrega as demais promessas da spec: só números dos fatos, sem conselho, pt-BR', () => {
    const texto = regrasDoTexto(280).join(' ').toLowerCase()
    expect(texto).toContain('português do brasil')
    expect(texto).toContain('números que aparecem nos fatos')
    expect(texto).toContain('conselho financeiro')
    expect(texto).toContain('prometa resultado')
  })

  it('os DOIS consumidores compõem daqui — nenhum mantém a própria lista', () => {
    // Sem esta amarra estrutural, nada impede alguém de voltar a escrever um
    // `const SISTEMA` com proibições próprias num dos dois arquivos, e a
    // divergência volta silenciosa.
    for (const caminho of ['src/modules/entrega/narrativa.ts', 'src/modules/entrega/chat-prompt.ts']) {
      const fonte = readFileSync(caminho, 'utf8')
      expect(fonte, `${caminho} não compõe de regras-do-texto`).toContain('regrasDoTexto(')
    }
  })
})
