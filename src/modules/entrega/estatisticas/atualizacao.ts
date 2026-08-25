/**
 * ÚLTIMA ATUALIZAÇÃO — obrigatória em toda tela da aba (docs/00-visao.md).
 *
 * É um tipo, e não uma convenção de quem monta a tela, de propósito. Toda
 * carga de tela abaixo estende `ComAtualizacao`, então o TypeScript recusa uma
 * tela nova que esqueça o horário. "Sem exceção" vira erro de compilação em
 * vez de revisão de código.
 *
 * O motivo é de produto, não de arquitetura: um número velho apresentado como
 * atual é pior do que número nenhum. O usuário decide se confia no dado.
 */
export type Atualizacao = {
  /** Instante do dado mais recente que compõe esta tela. */
  em: Date
  /**
   * O que foi medido. A tela mostra ao usuário, porque "classificação de
   * ontem" e "placar de 20 segundos atrás" pedem confianças diferentes.
   */
  fonte: string
}

export type ComAtualizacao = { atualizacao: Atualizacao }

/**
 * O horário da tela é o do dado MAIS ANTIGO que ela mostra, não o mais novo.
 *
 * Uma tela que mistura classificação de ontem com placar ao vivo não pode
 * anunciar "atualizado agora": a parte mais velha é que define o quanto o
 * conjunto merece confiança.
 */
export function maisAntiga(candidatas: (Atualizacao | null)[]): Atualizacao {
  const validas = candidatas.filter((c): c is Atualizacao => c !== null)
  if (validas.length === 0) return { em: new Date(0), fonte: 'sem dado' }

  return validas.reduce((antiga, atual) => (atual.em < antiga.em ? atual : antiga))
}

/** Reduz uma coluna `atualizado_em` de várias linhas a uma única marca. */
export function daColuna(linhas: { atualizadoEm: Date }[], fonte: string): Atualizacao | null {
  if (linhas.length === 0) return null
  const em = linhas.reduce(
    (maior, l) => (l.atualizadoEm > maior ? l.atualizadoEm : maior),
    linhas[0]!.atualizadoEm,
  )
  return { em, fonte }
}
