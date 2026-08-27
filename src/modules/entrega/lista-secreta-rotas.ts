import type { FiltroLista } from './lista-secreta'

/**
 * ROTAS DOS FILTROS DA LISTA SECRETA — fonte única.
 *
 * A tela tem SEIS recortes que combinam entre si (quantidade, atributo,
 * método, nível do jogador, time e posição). O requisito é que mexer em um
 * NUNCA apague os outros: quem filtrou "OPD · MVP · LAL" e depois pediu
 * "2 vítimas" quer duas vítimas DAQUELE recorte, não a lista inteira.
 *
 * Antes desta função, os chips de quantidade montavam a URL à mão
 * (`/?quantidade=N`) enquanto os demais preservavam o recorte — e a
 * divergência só aparecia clicando. Com uma função só, "os filtros combinam"
 * deixa de ser combinado e vira propriedade testável.
 */

export type Recorte = FiltroLista & { quantidade: number }

/**
 * `valor === undefined` REMOVE o campo (é o chip "Todos"). `quantidade` 0
 * significa lista inteira e por isso não viaja na URL — o padrão não precisa
 * ser escrito.
 */
export function comFiltro(
  recorte: Recorte,
  campo: 'quantidade' | keyof FiltroLista,
  valor: string | undefined,
): string {
  const p = new URLSearchParams()
  if (recorte.quantidade !== 0) p.set('quantidade', String(recorte.quantidade))
  if (recorte.metodo) p.set('metodo', recorte.metodo)
  if (recorte.nivel) p.set('nivel', recorte.nivel)
  if (recorte.time) p.set('time', recorte.time)
  if (recorte.posicao) p.set('posicao', recorte.posicao)
  if (recorte.atributo) p.set('atributo', recorte.atributo)
  if (valor === undefined) p.delete(campo)
  else p.set(campo, valor)
  const q = p.toString()
  return q === '' ? '/' : `/?${q}`
}

/** O chip de quantidade é o MESMO caminho dos demais — 0 apaga o parâmetro. */
export function comQuantidade(recorte: Recorte, quantidade: number): string {
  return comFiltro(recorte, 'quantidade', quantidade === 0 ? undefined : String(quantidade))
}
