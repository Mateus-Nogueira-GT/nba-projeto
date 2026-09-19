import type { Ruleset } from '../../motor/ruleset/schema'
import { ATRIBUTOS, type Atributo } from '../../motor/tipos'
import type { JogoRanqueado, RankingDoDia } from './tipos'

/**
 * O RECORTE — quanto do ranking entra nos fatos desta mensagem.
 *
 * Numa noite cheia são até 13 jogos e 26 times; o ranking inteiro passa de mil
 * números. Injetar tudo em toda mensagem é caro e, pior, alarga a malha do
 * validador que impede estatística inventada: quanto mais número permitido,
 * mais chance de um alucinado coincidir com algum (spec §6.1).
 *
 * A saída NÃO precisa de LLM. Os times são um conjunto fechado de 30: procurar
 * sigla e nome na pergunta é busca em lista conhecida — não erra por
 * criatividade e não custa chamada. É por isso que esta função é pura e mora
 * na entrega, não numa segunda passada de modelo.
 */

/** Sem acento e em minúsculas — "assistências" e "assistencias" são a mesma. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const PALAVRA_DO_ATRIBUTO: Record<Atributo, string[]> = {
  PONTOS: ['ponto', 'pontos', 'pts', 'cesta', 'cestas'],
  REBOTES: ['rebote', 'rebotes', 'reb'],
  ASSISTENCIAS: ['assistencia', 'assistencias', 'ast', 'passe', 'passes'],
}

/**
 * As palavras de um nome de time que servem para procurar.
 *
 * "Los Angeles Lakers" vira ['los angeles lakers', 'angeles', 'lakers'] —
 * TODAS as palavras longas, não só a última: quem escreve "e no Miami?" está
 * usando a cidade, e quem escreve "e no Heat?" está usando o apelido. Guardar
 * só uma das duas deixava metade das perguntas sem time.
 *
 * Palavras de três letras ou menos ficam de fora: "os" e "new" casariam com
 * frase demais.
 */
function apelidosDoTime(nome: string): string[] {
  const inteiro = normalizar(nome)
  const palavras = inteiro.split(/\s+/).filter((p) => p.length > 3)
  return [inteiro, ...palavras]
}

/** O texto menciona este time? Sigla casa por palavra inteira, nome por trecho. */
export function mencionaTime(texto: string, time: { sigla: string; nome: string }): boolean {
  const alvo = normalizar(texto)
  // A sigla precisa de fronteira de palavra: "LAL" não pode casar dentro de
  // "palavra", e "BOS" não pode casar em "bosque".
  if (new RegExp(`\\b${normalizar(time.sigla)}\\b`).test(alvo)) return true
  return apelidosDoTime(time.nome).some((apelido) => alvo.includes(apelido))
}

/** O atributo que a pergunta nomeia, se nomear algum. */
export function atributoDaPergunta(texto: string): Atributo | null {
  const alvo = normalizar(texto)
  for (const atributo of ATRIBUTOS) {
    const casou = PALAVRA_DO_ATRIBUTO[atributo].some((palavra) =>
      new RegExp(`\\b${palavra}\\b`).test(alvo),
    )
    if (casou) return atributo
  }
  return null
}

export type RecorteDoRanking =
  | { forma: 'jogos'; jogos: JogoRanqueado[]; atributo: Atributo | null }
  /** A pergunta não nomeou ninguém: os melhores do dia, por atributo. */
  | { forma: 'topo-do-dia'; porAtributo: { atributo: Atributo; itens: JogoRanqueado['porAtributo'][number]['itens'] }[] }

/**
 * Fatia o ranking do dia para esta mensagem.
 *
 * `textosAnteriores` são as mensagens já trocadas, da mais RECENTE para a mais
 * antiga: é o contexto pegajoso (`contexto.jogos_lembrados`). Sem ele, "e o
 * Davis?" logo depois de "e no Lakers?" não nomeia time nenhum e o assunto se
 * perderia bem quando o assinante está engajado.
 */
export function recortar(
  ranking: RankingDoDia,
  pergunta: string,
  textosAnteriores: readonly string[],
  ruleset: Ruleset,
): RecorteDoRanking {
  const { jogos_lembrados, topo_do_dia } = ruleset.sugestao_estatistica.contexto

  const mencionadosNa = (texto: string) =>
    ranking.jogos.filter((jogo) => jogo.times.some((time) => mencionaTime(texto, time)))

  const escolhidos: JogoRanqueado[] = [...mencionadosNa(pergunta)]
  // Os lembrados entram DEPOIS dos da pergunta, e sem repetir: o assunto atual
  // vem primeiro nos fatos. O teto conta SÓ os lembrados — misturá-lo com os
  // da pergunta faria `jogos_lembrados: 0` ainda trazer um do histórico, que é
  // o oposto de desligar a memória.
  let lembrados = 0
  for (const anterior of textosAnteriores) {
    if (lembrados >= jogos_lembrados) break
    for (const jogo of mencionadosNa(anterior)) {
      if (lembrados >= jogos_lembrados) break
      if (escolhidos.some((j) => j.jogoId === jogo.jogoId)) continue
      escolhidos.push(jogo)
      lembrados += 1
    }
  }

  if (escolhidos.length > 0) {
    return { forma: 'jogos', jogos: escolhidos, atributo: atributoDaPergunta(pergunta) }
  }

  // Ninguém nomeado: os melhores da rodada, POR ATRIBUTO. Uma lista só seria
  // dominada por pontos, onde os números são maiores.
  return {
    forma: 'topo-do-dia',
    porAtributo: ATRIBUTOS.map((atributo) => ({
      atributo,
      itens: ranking.jogos
        .flatMap((jogo) => jogo.porAtributo.find((p) => p.atributo === atributo)?.itens ?? [])
        // A leitura já entregou cada jogo ordenado; misturar jogos exige
        // reordenar, e o critério é o mesmo: a taxa da menor linha.
        .sort((a, b) => taxaDaMenorLinha(b) - taxaDaMenorLinha(a))
        .slice(0, topo_do_dia),
    })).filter((p) => p.itens.length > 0),
  }
}

/** A fração da linha mais baixa — o mesmo critério que ordena dentro do jogo. */
function taxaDaMenorLinha(item: JogoRanqueado['porAtributo'][number]['itens'][number]): number {
  const primeira = item.porLinha[0]
  return primeira === undefined || primeira.de === 0 ? 0 : primeira.bateu / primeira.de
}
