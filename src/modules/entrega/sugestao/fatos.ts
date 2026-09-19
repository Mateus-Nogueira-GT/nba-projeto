import type { ItemRanqueado } from '../../motor/sugestao/taxa-na-linha'
import type { Atributo } from '../../motor/tipos'
import type { RecorteDoRanking } from './recorte'
import type { RankingDoDia } from './tipos'

/**
 * O RANKING VIRADO EM FATOS — o texto que a IA recebe e apenas narra.
 *
 * Quem monta é o CÓDIGO, e é por isso que a separação entre as duas vozes é
 * estrutural (ADR-0012, spec §7.1): os dois cabeçalhos abaixo não dependem de
 * o modelo lembrar de escrevê-los. Ele recebe as listas já separadas e já
 * ordenadas; calcular e agrupar seria onde ele inventaria.
 */

/** A marca que a resposta precisa conter ao citar quem não foi apitado. */
export const MARCA_FORA_DA_LISTA = 'fora da lista de hoje'

/**
 * A resposta citou alguém que a metodologia NÃO apitou sem dizer que está
 * fora da lista?
 *
 * Verificação DETERMINÍSTICA, e é ela que torna a separação das duas vozes um
 * guardrail em vez de uma promessa de prompt (ADR-0012, spec §7.2): os nomes
 * dos dois grupos estão nos fatos, então dá para conferir sem modelo.
 *
 * Sem ranking nos fatos, nada a verificar — o assistente responde como antes.
 */
export function marcouOsNaoApitados(texto: string, ranking?: RankingDoDia): boolean {
  if (ranking === undefined) return true

  const naoApitados = new Set<string>()
  for (const jogo of ranking.jogos) {
    for (const { itens } of jogo.porAtributo) {
      for (const item of itens) if (!item.apitadoHoje) naoApitados.add(item.nome)
    }
  }
  if (naoApitados.size === 0) return true

  const alvo = texto.toLowerCase()
  const citou = [...naoApitados].some((nome) => alvo.includes(nome.toLowerCase()))
  return !citou || alvo.includes(MARCA_FORA_DA_LISTA)
}

const ROTULO_ATRIBUTO: Record<Atributo, string> = {
  PONTOS: 'Pontos',
  REBOTES: 'Rebotes',
  ASSISTENCIAS: 'Assistências',
}

/**
 * "20+ em 8 de 10" — nunca "80%".
 *
 * O produto tem regra dura: o percentual não é probabilidade. Uma taxa de
 * acerto escrita como porcentagem é justamente o número que convida a ser
 * lido como chance de hoje; "8 de 10 jogos" afirma sobre o passado, que é o
 * que o dado realmente diz.
 */
function linhaDoItem(item: ItemRanqueado): string {
  const taxas = item.porLinha.map((t) => `${t.linha}+ em ${t.bateu} de ${t.de}`).join(' · ')
  return `${item.nome} (${item.timeSigla}, ${item.nivel}) · ${taxas}`
}

function secao(titulo: string, itens: ItemRanqueado[]): string[] {
  if (itens.length === 0) return []
  return [titulo, ...itens.map((item, i) => `  ${i + 1}. ${linhaDoItem(item)}`)]
}

/** Os dois grupos, na ordem em que a tela os lê: metodologia primeiro. */
function gruposDe(itens: ItemRanqueado[], atributo: Atributo): string[] {
  const apitados = itens.filter((i) => i.apitadoHoje)
  const livres = itens.filter((i) => !i.apitadoHoje)
  return [
    ...secao(`${ROTULO_ATRIBUTO[atributo]} · APITADOS HOJE PELA METODOLOGIA NIP`, apitados),
    ...secao(
      `${ROTULO_ATRIBUTO[atributo]} · NÃO APITADOS — ranking só estatístico, a metodologia não sinalizou`,
      livres,
    ),
  ]
}

/**
 * O bloco inteiro, datado.
 *
 * O aviso do fim ataca um risco que o desenho não elimina: o prompt carrega as
 * últimas mensagens da conversa, e as respostas antigas do próprio assistente
 * trazem números que eram verdade em outra noite — o ranking se move a cada
 * rodada. Sem o aviso, ele mistura as duas safras e o validador reprova a
 * resposta inteira (spec §6.2).
 */
export function fatosDoRanking(
  recorte: RecorteDoRanking,
  dataReferencia: string,
  janelaJogos: number,
): string[] {
  const linhas: string[] = [
    `RANKING DA RODADA DE ${dataReferencia} — últimos ${janelaJogos} jogos ENCERRADOS de cada jogador, contando só em que ele entrou em quadra.`,
  ]

  if (recorte.forma === 'jogos') {
    for (const jogo of recorte.jogos) {
      linhas.push('', `${jogo.times[0].nome} x ${jogo.times[1].nome}`)
      for (const { atributo, itens } of jogo.porAtributo) {
        // Quando a pergunta nomeou o atributo, ele vem primeiro; os outros
        // continuam nos fatos porque a pergunta SEGUINTE costuma trocar.
        linhas.push(...gruposDe(itens, atributo))
      }
    }
  } else {
    for (const { atributo, itens } of recorte.porAtributo) {
      linhas.push('', ...gruposDe(itens, atributo))
    }
  }

  linhas.push(
    '',
    `Ao citar alguém do grupo NÃO APITADOS, escreva "${MARCA_FORA_DA_LISTA}" na resposta: é ranking estatístico, não apito da metodologia.`,
    'Números citados em mensagens ANTERIORES desta conversa podem estar desatualizados. Use somente os desta lista.',
  )
  return linhas
}
