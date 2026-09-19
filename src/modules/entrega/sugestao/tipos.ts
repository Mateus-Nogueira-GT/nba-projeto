import type { ItemRanqueado } from '../../motor/sugestao/taxa-na-linha'
import type { Atributo } from '../../motor/tipos'

/**
 * O RANKING DO DIA — o que a leitura produz e o recorte fatia.
 *
 * Organizado por JOGO, não por time, porque é assim que o assinante pergunta:
 * quem quer saber do Lakers quase sempre quer saber do adversário em seguida
 * (spec §6.1, `contexto.incluir_adversario`).
 */
export type TimeDoRanking = { sigla: string; nome: string }

export type JogoRanqueado = {
  jogoId: string
  times: [TimeDoRanking, TimeDoRanking]
  /** Um ranking por atributo: "melhor jogador" sem dizer em quê não é nada. */
  porAtributo: { atributo: Atributo; itens: ItemRanqueado[] }[]
}

export type RankingDoDia = {
  dataReferencia: string
  jogos: JogoRanqueado[]
}
