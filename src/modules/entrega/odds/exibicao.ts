import type { Ruleset } from '../../motor/ruleset/schema'
import type { ConteudoFeed } from '../tipos-feed'

/**
 * A ODD APARECE PARA O ASSINANTE? — quem responde é o ruleset.
 *
 * Decisão do parceiro (07/10/2026): "tirar tudo do front, deixar desligado,
 * não tirar do código". A coleta, a agregação e o admin de mercados seguem
 * como estão; o que muda é que nada disso chega à tela. Toda tela pergunta
 * AQUI, e nenhuma decide sozinha.
 */
export function exibirOdds(ruleset: Ruleset): boolean {
  return ruleset.odds.exibir_no_app
}

/**
 * Tira a odd dos itens de um feed já gravado.
 *
 * A materialização já não grava odd com a chave desligada, mas o snapshot de
 * antes da chave ainda tem: quem LÊ o feed passa por aqui, e o snapshot velho
 * sai tão limpo quanto o novo. Com a chave ligada, devolve o MESMO objeto.
 */
export function feedNaTela<F extends { conteudo: ConteudoFeed }>(feed: F, exibir: boolean): F
export function feedNaTela<F extends { conteudo: ConteudoFeed }>(feed: F | null, exibir: boolean): F | null
export function feedNaTela<F extends { conteudo: ConteudoFeed }>(feed: F | null, exibir: boolean): F | null {
  if (exibir || feed === null) return feed
  return {
    ...feed,
    conteudo: { ...feed.conteudo, itens: feed.conteudo.itens.map((i) => ({ ...i, oddFaixa: null })) },
  }
}
