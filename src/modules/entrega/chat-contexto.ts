import { numerosDoTexto } from '../ingestao/llm'
import type { Db } from '../dominio/db/tipos'
import { CONHECIMENTO } from './chat-conhecimento'
import { LIMITE_PERGUNTA, LIMITE_POR_MINUTO } from './chat-limites'
import { telaDaClassificacao } from './estatisticas/time'
import { telaJogosDoDia } from './estatisticas/jogos-do-dia'
import { lerFeed } from './lista-secreta'
import { METODOLOGIA } from './metodologia'

export type ContextoDoChat = { fatos: string; numeros: number[] }

/** Hora local do jogo, no fuso do ruleset — o mesmo corte que a tela usa. */
function horaLocal(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: fuso,
    hourCycle: 'h23',
  }).format(quando)
}

/**
 * O CONTEXTO DO AGENTE — os fatos que ele pode usar e, junto, os números que
 * ele tem direito de citar.
 *
 * Os dois nascem da MESMA função de propósito: `numeros` é extraído do texto
 * montado, nunca escrito à mão. Uma lista escrita à mão envelhece — alguém
 * acrescenta uma seção, esquece os números dela, e o validador passa a recusar
 * a resposta CERTA. Derivando, a invariante vale por construção.
 *
 * O direito ativo decide o CONTEÚDO, não o acesso: quem não assina recebe
 * plataforma e temporada, e a lista do dia simplesmente não está aqui para
 * vazar.
 */
export async function montarContexto(
  db: Db,
  opcoes: {
    dataReferencia: string
    fuso: string
    temporada: string
    comDireito: boolean
    cotaDiaria: number
  },
): Promise<ContextoDoChat> {
  const [rodada, tabela, feed] = await Promise.all([
    telaJogosDoDia(db, opcoes.dataReferencia, opcoes.fuso),
    telaDaClassificacao(db, opcoes.temporada),
    opcoes.comDireito ? lerFeed(db, opcoes.dataReferencia) : Promise.resolve(null),
  ])

  const partes: string[] = [CONHECIMENTO, '', METODOLOGIA, '']

  partes.push(
    'SEUS LIMITES — responda com estes números se perguntarem.',
    `- Perguntas por dia: ${opcoes.cotaDiaria}. Por minuto: ${LIMITE_POR_MINUTO}. Tamanho máximo da pergunta, em caracteres: ${LIMITE_PERGUNTA}.`,
    '',
  )

  // Time REAL do provedor, como na aba de Estatísticas. O rótulo não é enfeite:
  // é esta seção que diz quem venceu o quê, e é aqui que o agente afirmaria que
  // um jogador venceu por um time do qual não participou se lesse o elenco da
  // curadoria (a armadilha que o CLAUDE.md documenta).
  partes.push(`RODADA DE HOJE (${opcoes.dataReferencia}, time real da liga)`)
  if (rodada.jogos.length === 0) partes.push('- Nenhum jogo hoje.')
  else
    for (const j of rodada.jogos) {
      const placar =
        j.casa.placar === null || j.visitante.placar === null
          ? horaLocal(j.dataHoraUtc, opcoes.fuso)
          : `${j.casa.placar} a ${j.visitante.placar}`
      partes.push(`- ${j.casa.nome} x ${j.visitante.nome}: ${j.status}, ${placar}`)
    }
  partes.push('')

  // O time aqui é o REAL do provedor (mesma fonte da aba de Estatísticas), não
  // a curadoria: dizer que um jogador venceu por um time do qual ele não
  // participou é exatamente a armadilha que o CLAUDE.md documenta.
  partes.push(`CLASSIFICAÇÃO (temporada ${opcoes.temporada}, time real da liga)`)
  for (const l of tabela.linhas) {
    // O aproveitamento entra PRONTO, em percentual inteiro. Sem ele, o modelo
    // faz a conta a partir do V-D ("12-8, então 60%") e o validador recusa a
    // resposta certa como número inventado — 60 não estaria nos fatos.
    const aproveitamento =
      l.aproveitamento === null ? '' : `, aproveitamento ${Math.round(l.aproveitamento * 100)}%`
    // A sequência é o rabo da campanha ("V3", "D2"), o mesmo que a tela mostra.
    const sequencia = l.sequencia === null ? '' : `, sequência ${l.sequencia}`
    partes.push(
      `- ${l.nome} (${l.sigla}), ${l.conferencia ?? 'sem conferência'}: V-D ${l.vitorias}-${l.derrotas}, posição ${l.posicao ?? '-'}${aproveitamento}${sequencia}`,
    )
  }
  partes.push('')

  const itens = feed?.conteudo.itens ?? []
  if (opcoes.comDireito) {
    partes.push('ENTRADAS DE HOJE (curadoria NIP — elenco projetado, não o time real)')
    if (itens.length === 0) partes.push('- A lista de hoje ainda não foi publicada.')
    else
      for (const i of itens)
        partes.push(
          `- ${i.nome} (${i.timeSigla}), ${i.atributo} ${i.linha ?? '-'}, nível do apito ${i.nivelApito}${i.turbo ? ', turbo' : ''}, método ${i.metodo ?? 'oscilação'}`,
        )
    partes.push(`- Total de entradas na lista de hoje: ${itens.length}.`)
    partes.push('')
  }

  const fatos = partes.join('\n')
  // Derivado, nunca escrito à mão — ver o comentário do cabeçalho.
  return { fatos, numeros: numerosDoTexto(fatos) }
}
