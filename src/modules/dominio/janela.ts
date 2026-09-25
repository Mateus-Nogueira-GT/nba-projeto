export type JanelaMedia = 'temporada' | 'ultimos_5' | 'ultimos_10'

/**
 * Vocabulário do ruleset (`media.janela`) → enum do banco. Vive no DOMÍNIO
 * porque os dois lados o usam: a sincronização grava por ele e a
 * materialização lê por ele — duas traduções divergentes foi exatamente o
 * defeito que a errata de 25/08 pegou (TEMPORADA hardcoded na leitura).
 */
export function janelaNoBanco(janela: JanelaMedia): 'TEMPORADA' | 'ULTIMOS_5' | 'ULTIMOS_10' {
  switch (janela) {
    case 'temporada':
      return 'TEMPORADA'
    case 'ultimos_5':
      return 'ULTIMOS_5'
    case 'ultimos_10':
      return 'ULTIMOS_10'
  }
}

/** Quantos jogos cada janela considera. `null` = todos os da temporada. */
export function tamanhoDaJanela(janela: JanelaMedia): number | null {
  switch (janela) {
    case 'temporada':
      return null
    case 'ultimos_5':
      return 5
    case 'ultimos_10':
      return 10
  }
}
