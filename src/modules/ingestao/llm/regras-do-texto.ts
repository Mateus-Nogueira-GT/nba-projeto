/**
 * AS REGRAS QUE O VALIDADOR COBRA, DITAS AO MODELO — em um lugar só.
 *
 * `validador.ts` é quem REPROVA o texto; este módulo é quem AVISA o modelo do
 * que será reprovado. Enquanto os dois lados viveram copiados em dois
 * `SISTEMA` diferentes, eles divergiram: o prompt da narrativa proibia
 * "probabilidade" e "provável", o do chat só "probabilidade" — e o validador
 * reprova os dois (`PROIBIDAS`).
 *
 * "É provável que ele volte à média" é português corriqueiro. O modelo do chat
 * escrevia, o validador reprovava, o assinante lia "indisponível agora" e
 * perguntava de novo — e como a reprovação devolve a cota, cada tentativa era
 * uma chamada PAGA a mais. Divergência entre prompt e validador não é questão
 * de estilo: é conta no fim do mês.
 *
 * Mora ao lado do validador de propósito. Quem mexer na regra tem os dois
 * arquivos abertos.
 */

/**
 * As palavras que o validador recusa, na forma que o modelo entende.
 *
 * A raiz de `PROIBIDAS` em `validador.ts` cobre as flexões (probabilidades,
 * prováveis); aqui basta o lema, porque é instrução em prosa. O teste de
 * deriva confere que TODA palavra desta lista é de fato reprovada lá.
 */
export const PALAVRAS_PROIBIDAS = ['probabilidade', 'provável'] as const

/**
 * O bloco de regras comum aos dois consumidores.
 *
 * O limite vem do CHAMADOR porque narrativa (280) e chat (1200) são textos de
 * naturezas diferentes — o número é a única coisa que legitimamente varia.
 */
export function regrasDoTexto(limiteCaracteres: number): string[] {
  const proibidas = PALAVRAS_PROIBIDAS.map((p) => `"${p}"`).join(' nem ')
  return [
    `Escreva em português do Brasil, no máximo ${limiteCaracteres} caracteres.`,
    'Use APENAS os números que aparecem nos fatos fornecidos. Nunca invente estatística.',
    `NUNCA use ${proibidas}, nem variações delas: o percentual do produto é NOTA DE CONFIANÇA da análise, não probabilidade.`,
    'Não dê conselho financeiro e não prometa resultado.',
  ]
}
