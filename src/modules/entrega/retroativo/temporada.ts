/**
 * Temporada escolhida pela URL — não pelo motor, não pelo banco. Nasce aqui
 * porque `?temporada=` chega da requisição (String | String[] | undefined,
 * conforme o Next entrega searchParams) e nunca deve ser confiada sem checar
 * contra as temporadas que o banco realmente tem dado (`disponiveis`): um
 * valor de fora do ar (digitado à mão, um link velho, um param repetido)
 * cai na temporada exibida por padrão em vez de vazar para a tela.
 */
export function temporadaDaUrl(
  valor: string | string[] | undefined,
  opcoes: { exibida: string; disponiveis: string[] },
): string {
  if (typeof valor === 'string' && opcoes.disponiveis.includes(valor)) return valor
  return opcoes.exibida
}

/**
 * Uma temporada só é "anterior" em relação à do calendário corrente — e só
 * se vier ANTES dela. "Diferente" não basta: uma temporada FUTURA (jogo
 * gravado com rótulo adiantado, pré-temporada) abriria a profundidade para o
 * grátis e viraria alvo do retroativo, e ela ainda não aconteceu.
 *
 * O rótulo começa pelo ano inicial com quatro dígitos ("2025-26", "2025"):
 * a ordem alfabética é a cronológica (`temporadaDe` garante o formato).
 */
export function ehTemporadaAnterior(temporada: string, doCalendario: string): boolean {
  return temporada < doCalendario
}

/**
 * A temporada de uma tela de Resultados/Lista, e se ela foi ESCOLHIDA.
 *
 * Escolha só conta se for uma temporada disponível (`temporadaDaUrl`); lixo,
 * param repetido ou temporada sem dado são o mesmo que nenhum parâmetro.
 *
 * Sem escolha, o padrão NÃO é a `exibida`: ela só vira a temporada do
 * calendário depois do primeiro jogo ENCERRADO, e na noite de estreia ela
 * mandaria o assinante para a Lista da temporada passada. A anterior só é o
 * padrão no HIATO — a temporada do calendário começou no papel e ainda não
 * tem jogo nenhum. Fora dele, o padrão é a temporada do calendário (o
 * caminho de hoje, com os portões de plano).
 */
export function temporadaDaTela(
  valor: string | string[] | undefined,
  opcoes: { doCalendario: string; exibida: string; disponiveis: string[]; emHiato: boolean },
): { temporada: string; escolhida: boolean } {
  const padrao = opcoes.emHiato ? opcoes.exibida : opcoes.doCalendario
  const temporada = temporadaDaUrl(valor, { exibida: padrao, disponiveis: opcoes.disponiveis })
  const escolhida = typeof valor === 'string' && opcoes.disponiveis.includes(valor)
  return { temporada, escolhida }
}
