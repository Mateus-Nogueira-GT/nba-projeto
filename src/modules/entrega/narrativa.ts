import { validarTexto } from '../ingestao/llm'
import { regrasDoTexto } from '../ingestao/llm/regras-do-texto'
import { registrarChamada } from '../ingestao/llm/registro'
import type { PortaLLM } from '../ingestao/llm'
import type { Db } from '../dominio/db/tipos'
import { METODOLOGIA } from './metodologia'
// De `tipos-feed.ts`, não de `lista-secreta.ts`: essa é quem CHAMA
// `enriquecerComNarrativas`, então importar os tipos de volta de lá fecharia
// um ciclo de módulo (ver o comentário em `tipos-feed.ts`).
import type { ConteudoFeed, ItemFeed } from './tipos-feed'

/**
 * NARRATIVAS DOS CARDS — a LLM narrando o que o motor decidiu.
 *
 * Roda UMA vez por publicação, no pipeline de materialização: o custo é por
 * evento, não por usuário, e a tela continua sem chamar nada em runtime.
 *
 * O prompt recebe os FATOS já materializados. A LLM não consulta banco, não
 * escolhe jogador e não altera nenhum campo de estratégia — se fizesse, o
 * texto teria virado regra, e regra é do CJ (regra 3 do projeto).
 */

export const LIMITE_NARRATIVA = 280
export const LIMITE_RESUMO = 400

/**
 * O que se PEDE ao modelo é menor do que o validador ACEITA.
 *
 * Medido na carga real de 07/09/2026: pedindo 280, o modelo devolvia 293 e o
 * validador reprovava por "muito longo" — 34 vezes em 276. O limite da regra
 * continua sendo `LIMITE_NARRATIVA`; a folga é só do pedido, porque o modelo
 * estoura o número que recebe.
 */
export const PEDIDO_NARRATIVA = 240

/**
 * A regra que faltava — e que sozinha explicava 219 das 276 reprovações da
 * carga de 07/09. O sistema dizia ao modelo que "o percentual é nota de
 * confiança", os fatos NÃO traziam o percentual, e o modelo então inventava um
 * ("nota de confiança: 66%") — número fora dos fatos, reprovado. O percentual
 * já está no card; a frase não precisa dele.
 */
const SEM_PERCENTUAL = [
  'Não cite o percentual de confiança nem nenhuma porcentagem: ele já aparece no card, ao lado do texto.',
  // Medido com o prompt acima já em vigor: das 6 amostras, a única reprovação
  // restante foi o modelo CALCULANDO "média de 14,6" a partir dos últimos
  // cinco valores. Número derivado é número fora dos fatos para o validador.
  'Não calcule nem derive números novos (médias, somas, diferenças) a partir dos fatos: cite só os que estão escritos.',
].join(' ')

/**
 * De quantos em quantos itens o progresso é gravado.
 *
 * Com um provedor degradado (15s de timeout mais uma retentativa por item), a
 * lista de quase cinquenta entradas passa do `maxDuration` do cron por volta
 * da metade. Gravando só no fim, essa morte apagava TUDO: nenhuma narrativa
 * persistida, as chamadas já pagas e — porque o hash não mudou — nenhuma nova
 * tentativa no ciclo seguinte. O dia inteiro sem texto.
 *
 * Dez é o meio-termo: cada gravação reescreve o `conteudo_json` inteiro, então
 * gravar a cada item multiplicaria por cinquenta o volume de escrita; a cada
 * dez, são quatro UPDATEs extras na lista cheia e o pior caso perde no máximo
 * nove itens já gerados.
 */
export const LOTE_DE_GRAVACAO = 10

const ATRIBUTO_TEXTO: Record<string, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
}

/**
 * As proibições e o limite vêm de `regras-do-texto.ts`, o MESMO módulo que o
 * chat consome — os dois prompts não podem divergir do validador (ver o
 * comentário lá).
 */
function sistemaDe(forma: string, limiteCaracteres: number, extras: readonly string[] = []): string {
  return [
    'Você é um analista de basquete escrevendo para assinantes brasileiros.',
    `Escreva ${forma}, em tom sóbrio de comentarista.`,
    ...regrasDoTexto(limiteCaracteres),
    ...extras,
    METODOLOGIA,
  ].join('\n')
}

const SISTEMA_NARRATIVA = sistemaDe('UMA frase', PEDIDO_NARRATIVA, [SEM_PERCENTUAL])
const SISTEMA_RESUMO = sistemaDe('até três frases', LIMITE_RESUMO)

/**
 * Os números que o texto pode citar. É a lista que o validador usa para
 * reprovar estatística inventada — precisa conter tudo que é legítimo citar,
 * senão a narrativa CORRETA seria reprovada.
 */
export function numerosDoItem(item: ItemFeed): number[] {
  // `ultimos5` é opcional na leitura: `lerFeed` faz cast cego do JSON
  // armazenado, e o próprio doc de `ItemFeed` avisa "vazio em snapshot
  // antigo" — um registro gravado antes deste campo existir chega aqui como
  // `undefined`, não `[]`. Cinto e suspensório com o `try` de `gerarUma`.
  const ultimos5 = item.ultimos5 ?? []
  const numeros = [
    item.linha,
    item.confianca,
    item.mediaTemporada,
    item.alvo1Q,
    item.nivelApito,
    ...ultimos5.map((u) => u.valor),
    ultimos5.filter((u) => u.bateu).length,
    ultimos5.length,
  ]
  return [...new Set(numeros.filter((n): n is number => typeof n === 'number'))]
}

export function promptDeNarrativa(item: ItemFeed): {
  sistema: string
  usuario: string
  numeros: number[]
} {
  const ultimos5 = item.ultimos5 ?? []
  const atributo = ATRIBUTO_TEXTO[item.atributo] ?? item.atributo.toLowerCase()
  const bateu = ultimos5.filter((u) => u.bateu).length
  const linhas = [
    `Jogador: ${item.nome} (${item.timeSigla}, nível ${item.nivelJogador})`,
    `Mercado: ${atributo}${item.linha === null ? '' : ` a partir de ${item.linha}`}`,
    `Método da estratégia: ${item.metodo ?? 'oscilação'}`,
    `Força do sinal: nível ${item.nivelApito}${item.turbo ? ' (turbo)' : ''}`,
    item.mediaTemporada === null ? null : `Média na temporada: ${item.mediaTemporada}`,
    ultimos5.length === 0
      ? null
      : `Últimos ${ultimos5.length} jogos na linha: bateu ${bateu}; valores ${ultimos5.map((u) => u.valor).join(', ')}`,
  ].filter((l): l is string => l !== null)

  return { sistema: SISTEMA_NARRATIVA, usuario: linhas.join('\n'), numeros: numerosDoItem(item) }
}

function promptDeResumo(conteudo: ConteudoFeed): {
  sistema: string
  usuario: string
  numeros: number[]
} {
  const turbos = conteudo.itens.filter((i) => i.turbo).length
  const times = [...new Set(conteudo.itens.map((i) => i.timeSigla))]
  const usuario = [
    `Entradas na lista de hoje: ${conteudo.itens.length}`,
    `Entradas turbo: ${turbos}`,
    `Times envolvidos: ${times.join(', ')}`,
  ].join('\n')
  return { sistema: SISTEMA_RESUMO, usuario, numeros: [conteudo.itens.length, turbos, times.length] }
}

export type OpcoesEnriquecimento = {
  /**
   * Chamada a cada `lote` itens prontos, com o conteúdo PARCIAL — os itens já
   * narrados na frente e os que ainda faltam intactos atrás. É o que permite
   * a publicação sobreviver a uma morte no meio do enriquecimento.
   *
   * Nunca recebe exceção de volta: se a gravação falhar, o enriquecimento
   * segue e o próximo lote tenta de novo.
   */
  gravarParcial?: (parcial: ConteudoFeed) => Promise<void>
  /** Só os testes trocam — o padrão é `LOTE_DE_GRAVACAO`. */
  lote?: number
  /**
   * O snapshot que está sendo SUBSTITUÍDO. Item com o mesmo (jogador,
   * atributo, linha) e narrativa já gerada é reaproveitado sem ida ao
   * provedor. A republicação depois das odds muda o hash (a odd entra no item)
   * mas não muda a entrada — e gerava a lista inteira de novo, todo dia.
   */
  anterior?: ConteudoFeed | null
}

const chaveDoItem = (i: ItemFeed): string => `${i.jogadorId}|${i.atributo}|${i.linha ?? ''}`

/**
 * Gera narrativa por item e o resumo do dia.
 *
 * NUNCA lança: falha de LLM, reprovação do validador OU erro na montagem do
 * próprio prompt (item de snapshot antigo sem `ultimos5`, por exemplo) deixa
 * o campo ausente e sobe a contagem. O conteúdo de estratégia volta idêntico
 * — só ganha texto.
 */
export async function enriquecerComNarrativas(
  db: Db,
  porta: PortaLLM,
  conteudo: ConteudoFeed,
  opcoes: OpcoesEnriquecimento = {},
): Promise<{ conteudo: ConteudoFeed; geradas: number; reprovadas: number; reaproveitadas: number }> {
  let geradas = 0
  let reprovadas = 0
  let reaproveitadas = 0

  const anteriores = new Map<string, string>()
  for (const i of opcoes.anterior?.itens ?? []) {
    if (typeof i.narrativa === 'string' && i.narrativa.length > 0) anteriores.set(chaveDoItem(i), i.narrativa)
  }

  const gerarUma = async (
    perfil: 'narrativa' | 'resumo',
    // Recebe o CONSTRUTOR do prompt, não o prompt pronto: assim a montagem
    // (que lê `item.ultimos5` e companhia) roda DENTRO do try, e um item de
    // snapshot antigo sem esse campo cai no catch como qualquer outra falha
    // em vez de escapar da função inteira — o contrato "NUNCA lança" vale
    // para toda a chamada, não só para a ida à rede.
    construirPrompt: () => { sistema: string; usuario: string; numeros: number[] },
    limite: number,
  ): Promise<string | null> => {
    const inicio = Date.now()
    try {
      const prompt = construirPrompt()
      const r = await porta.gerar(perfil, { sistema: prompt.sistema, usuario: prompt.usuario })
      const validado = validarTexto(r.texto, {
        numeros: prompt.numeros,
        limiteCaracteres: limite,
      })
      // O REGISTRO SÓ SAI DEPOIS DO VALIDADOR, e `ok` é o desfecho do TEXTO.
      //
      // Gravando `ok: true` antes de validar, a tabela não distinguia "o
      // provedor respondeu e o assinante leu" de "o provedor respondeu e nós
      // recusamos o texto" — que é a primeira pergunta que se faz a ela
      // quando as narrativas somem da tela. Reprovação fica com `modelo`
      // preenchido e `erro` explicando; falha de provedor tem `modelo` nulo.
      await registrarChamada(db, {
        perfil,
        modelo: r.modelo,
        tokensEntrada: r.tokensEntrada,
        tokensSaida: r.tokensSaida,
        ok: validado.ok,
        erro: validado.ok ? null : `reprovado: ${validado.motivo}`,
        duracaoMs: Date.now() - inicio,
      })
      if (!validado.ok) {
        reprovadas += 1
        return null
      }
      geradas += 1
      return validado.texto
    } catch (erro) {
      await registrarChamada(db, {
        perfil,
        modelo: null,
        tokensEntrada: 0,
        tokensSaida: 0,
        ok: false,
        erro: erro instanceof Error ? erro.message : String(erro),
        duracaoMs: Date.now() - inicio,
      })
      return null
    }
  }

  const lote = opcoes.lote ?? LOTE_DE_GRAVACAO
  const itens: ItemFeed[] = []

  /**
   * O parcial carrega a LISTA INTEIRA: os itens já narrados e, atrás deles,
   * os originais que ainda não foram. Gravar só o prefixo encurtaria a lista
   * publicada no meio da rodada — o assinante veria entradas sumirem.
   */
  const gravarProgresso = async (): Promise<void> => {
    if (!opcoes.gravarParcial) return
    try {
      await opcoes.gravarParcial({
        ...conteudo,
        itens: [...itens, ...conteudo.itens.slice(itens.length)],
      })
    } catch {
      // engolido de propósito: o contrato "NUNCA lança" vale aqui também, e
      // perder um checkpoint é menos grave do que derrubar o enriquecimento.
    }
  }

  for (const item of conteudo.itens) {
    const reaproveitada = anteriores.get(chaveDoItem(item))
    if (reaproveitada !== undefined) {
      reaproveitadas += 1
      itens.push({ ...item, narrativa: reaproveitada })
      continue
    }
    const texto = await gerarUma('narrativa', () => promptDeNarrativa(item), LIMITE_NARRATIVA)
    itens.push({ ...item, narrativa: texto })
    // O último lote não precisa de checkpoint: quem chamou grava o resultado
    // final logo em seguida.
    if (itens.length % lote === 0 && itens.length < conteudo.itens.length) {
      await gravarProgresso()
    }
  }

  // Checkpoint antes do resumo: ele é MAIS UMA ida ao provedor, e é a que
  // vem depois de a lista inteira já ter consumido o orçamento de tempo. Se
  // essa chamada é a que trava, todas as narrativas dos itens já estão no
  // banco — sem isto, o último lote (até nove itens já pagos) morreria com ela.
  if (conteudo.itens.length > 0) await gravarProgresso()

  // O resumo fala da LISTA; se a lista é a mesma (todo item reaproveitado e
  // nenhum a menos), o resumo anterior continua verdadeiro e não se paga outro.
  const listaIgual =
    reaproveitadas === conteudo.itens.length &&
    (opcoes.anterior?.itens.length ?? -1) === conteudo.itens.length &&
    typeof opcoes.anterior?.resumoDoDia === 'string'
  const resumo =
    conteudo.itens.length === 0
      ? null
      : listaIgual
        ? (opcoes.anterior?.resumoDoDia ?? null)
        : await gerarUma('resumo', () => promptDeResumo(conteudo), LIMITE_RESUMO)

  return { conteudo: { ...conteudo, itens, resumoDoDia: resumo }, geradas, reprovadas, reaproveitadas }
}
